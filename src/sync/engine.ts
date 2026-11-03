// Keeps one group in sync with the relay (SPEC.md section 6.5): connects,
// catches up on what other devices wrote, uploads what this device wrote,
// and reconnects with backoff. Everything a connection does runs through one
// queue, in the order its events arrived.

import {
  type ClientMessage,
  LIMITS,
  type LoggedOp,
  parseServerMessage,
  type ServerMessage,
} from '../../shared/protocol.ts'
import type { Op } from '../domain/ops.ts'
import { decryptOp, deriveKeys, encryptOp, type GroupKeys } from './crypto.ts'
import { pendingOps } from './db.ts'
import { groupStore, type GroupStore, onGroupChange } from './groups.ts'

export type SyncState =
  /** Up to date with the relay, nothing waiting. */
  | 'synced'
  /** Connecting, catching up or uploading. */
  | 'syncing'
  /** The device is offline; `pending` changes wait for it to reconnect. */
  | 'offline'
  /** Online, but the relay can't be reached or refused this device. */
  | 'unreachable'

export interface SyncStatus {
  readonly state: SyncState
  /** Changes made on this device that the relay doesn't have yet. */
  readonly pending: number
  /** The relay's clock minus this device's, from the last connection (milliseconds). */
  readonly clockOffset: number | null
}

/** The parts of a WebSocket the engine uses, so tests can stand in a fake relay. */
export interface Socket {
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

export interface Network {
  connect(groupId: string): Socket
  isOnline(): boolean
  /** Calls back when the device comes online or the app comes to the foreground. */
  onWake(listener: () => void): () => void
}

export const browserNetwork: Network = {
  connect(groupId) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    return new WebSocket(`${scheme}://${location.host}/api/g/${groupId}/ws`)
  },
  isOnline: () => navigator.onLine,
  onWake(listener) {
    const visible = () => {
      if (document.visibilityState === 'visible') listener()
    }
    window.addEventListener('online', listener)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', listener)
      document.removeEventListener('visibilitychange', visible)
    }
  },
}

/** Reconnect delays grow from 1 to 30 seconds, with jitter so phones don't retry in step. */
export function backoff(failures: number, random = Math.random): number {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1))
  return Math.max(1000, Math.round(ceiling * (0.5 + random() / 2)))
}

const MINUTE = 60_000

export class GroupSync {
  private readonly groupId: string
  private readonly network: Network
  private readonly retryDelay: (failures: number) => number
  private status: SyncStatus = { state: 'syncing', pending: 0, clockOffset: null }
  private readonly listeners = new Set<() => void>()

  private running = false
  /** Stop once there's nothing left to do. */
  private stopWhenIdle = false
  /** The relay refused this device for good, or an operation it can't take. */
  private blocked = false
  private socket: Socket | null = null
  private connected = false
  private caughtUp = false
  private head = 0
  private inFlight = false
  /** Waiting out a rate limit. */
  private paused = false
  private failures = 0
  private reconnectNow = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private queue: Promise<void> = Promise.resolve()
  private keys: Promise<GroupKeys> | null = null
  private unsubscribe: (() => void)[] = []

  constructor(groupId: string, network: Network = browserNetwork, retryDelay = backoff) {
    this.groupId = groupId
    this.network = network
    this.retryDelay = retryDelay
  }

  readonly getStatus = (): SyncStatus => this.status

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Runs until stopped. */
  start(): void {
    this.stopWhenIdle = false
    if (this.running) return
    this.running = true
    this.blocked = false
    this.unsubscribe = [
      onGroupChange(({ groupId }) => {
        if (groupId === this.groupId) this.enqueue(() => this.changed())
      }),
      this.network.onWake(() => {
        this.wake()
      }),
    ]
    this.enqueue(async () => {
      await this.refreshPending()
    })
    this.open()
  }

  /** Keeps going until caught up with nothing to upload, then stops. */
  finish(): void {
    this.stopWhenIdle = true
    this.stopIfIdle()
  }

  stop(): void {
    this.running = false
    for (const off of this.unsubscribe) off()
    this.unsubscribe = []
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    const socket = this.socket
    this.dropConnection()
    socket?.close()
    this.update()
  }

  // --- Connection --------------------------------------------------------------

  private open(): void {
    if (!this.running || this.socket || this.blocked) return
    if (!this.network.isOnline()) {
      this.update()
      return
    }
    const socket = this.network.connect(this.groupId)
    this.socket = socket
    // Tasks queued for a connection that has since closed are dropped.
    const current = (task: (store: GroupStore) => Promise<void>) => () =>
      this.socket === socket ? this.withStore(task) : Promise.resolve()
    socket.addEventListener('open', () => {
      this.enqueue(current((store) => this.hello(store)))
    })
    socket.addEventListener('message', (event) => {
      const message = parseServerMessage(event.data)
      // Anything the relay sends that isn't valid is ignored.
      if (message) this.enqueue(current((store) => this.handle(store, message, socket)))
    })
    const closed = () => {
      if (this.socket === socket) this.closed()
    }
    socket.addEventListener('close', closed)
    socket.addEventListener('error', closed)
    this.update()
  }

  /** The current connection closed (or is being replaced) while running. */
  private closed(): void {
    this.dropConnection()
    if (this.reconnectNow) {
      this.reconnectNow = false
      this.open()
      return
    }
    this.failures++
    this.update()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.open()
    }, this.retryDelay(this.failures))
  }

  private dropConnection(): void {
    this.socket = null
    this.connected = false
    this.caughtUp = false
    this.inFlight = false
  }

  /** Back online, or back in the foreground: retry now rather than after the backoff. */
  private wake(): void {
    if (!this.running || this.socket) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.open()
  }

  /** Replaces this connection with a new one straight away. */
  private restart(socket: Socket): void {
    this.reconnectNow = true
    this.closed()
    socket.close()
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message))
  }

  // --- Protocol ----------------------------------------------------------------

  private async hello(store: GroupStore): Promise<void> {
    const { token } = await this.groupKeys(store)
    const { cursor, epoch } = store.getSnapshot().record
    // A device that has never reached the relay registers the group.
    this.send(
      epoch === null
        ? { type: 'hello', token, after: cursor, create: true }
        : { type: 'hello', token, after: cursor },
    )
  }

  private async handle(store: GroupStore, message: ServerMessage, socket: Socket): Promise<void> {
    switch (message.type) {
      case 'welcome':
        await this.welcome(store, message, socket)
        break
      case 'ops':
        await this.receive(store, message.ops)
        break
      case 'ack':
        this.inFlight = false
        await store.synced(
          message.acks.map((ack) => ack.id),
          Math.max(0, ...message.acks.map((ack) => ack.seq)),
        )
        await this.pushNext()
        break
      case 'error':
        await this.error(store, message)
        break
    }
    this.update()
  }

  private async welcome(
    store: GroupStore,
    { now, head, epoch }: Extract<ServerMessage, { type: 'welcome' }>,
    socket: Socket,
  ): Promise<void> {
    this.status = { ...this.status, clockOffset: now - Date.now() }
    const known = store.getSnapshot().record.epoch
    if (known !== null && known !== epoch) {
      // A new log: what this device remembers of the old one no longer applies.
      await store.startOver(epoch)
      this.restart(socket)
      return
    }
    if (known === null) await store.setEpoch(epoch)
    this.connected = true
    this.failures = 0
    this.head = head
    this.caughtUp = store.getSnapshot().record.cursor >= head
    if (this.caughtUp) await this.pushNext()
  }

  private async receive(store: GroupStore, logged: readonly LoggedOp[]): Promise<void> {
    const keys = await this.groupKeys(store)
    const decrypted = await Promise.all(logged.map((op) => decryptOp(keys, this.groupId, op)))
    // Anything that doesn't decrypt to a valid operation is skipped, not fatal.
    const ops = decrypted.filter((op): op is Op => op !== null)
    await store.receive(ops, Math.max(0, ...logged.map((op) => op.seq)))
    if (!this.caughtUp && store.getSnapshot().record.cursor >= this.head) {
      this.caughtUp = true
      await this.pushNext()
    }
  }

  private async error(
    store: GroupStore,
    { code, retryAfter = MINUTE }: Extract<ServerMessage, { type: 'error' }>,
  ): Promise<void> {
    switch (code) {
      case 'not_found':
        // The relay deleted the group after a year idle: upload it again.
        await store.startOver(null)
        this.reconnectNow = true
        break
      case 'rate_limited':
        this.inFlight = false
        this.paused = true
        setTimeout(() => {
          this.paused = false
          this.enqueue(() => this.pushNext())
        }, retryAfter)
        break
      case 'unauthorized':
      case 'too_large':
        this.blocked = true
        this.inFlight = false
        break
      case 'group_full':
        // While connected: the log is full. On connecting: too many devices; retry later.
        this.inFlight = false
        if (this.connected) this.blocked = true
        break
      case 'bad_request':
        // A bug on one side; the relay closes, and the next connection starts clean.
        break
    }
  }

  // --- Uploading ---------------------------------------------------------------

  private async changed(): Promise<void> {
    // The group may have been removed from this device: store() then stops syncing.
    if (await this.store()) await this.pushNext()
  }

  private async pushNext(): Promise<void> {
    const pending = await this.refreshPending()
    if (!this.connected || !this.caughtUp || this.inFlight || this.blocked) return
    if (this.paused || pending.length === 0) return
    const socket = this.socket
    const store = await groupStore(this.groupId)
    if (!store) return
    const keys = await this.groupKeys(store)
    const batch = pending.slice(0, LIMITS.opsPerMessage)
    const ops = await Promise.all(batch.map((op) => encryptOp(keys, this.groupId, op)))
    // The connection may have dropped while encrypting.
    if (this.socket !== socket) return
    this.inFlight = true
    this.send({ type: 'push', ops })
  }

  private async refreshPending(): Promise<Op[]> {
    const pending = await pendingOps(this.groupId)
    this.status = { ...this.status, pending: pending.length }
    this.update()
    return pending
  }

  // --- Status --------------------------------------------------------------------

  private update(): void {
    const state: SyncState = this.blocked
      ? 'unreachable'
      : this.connected && this.caughtUp && !this.inFlight && this.status.pending === 0
        ? 'synced'
        : !this.connected && !this.network.isOnline()
          ? 'offline'
          : !this.connected && this.failures >= 2
            ? 'unreachable'
            : 'syncing'
    if (state !== this.status.state) this.status = { ...this.status, state }
    for (const listener of this.listeners) listener()
    this.stopIfIdle()
  }

  private stopIfIdle(): void {
    if (this.stopWhenIdle && this.running && this.status.state === 'synced') this.stop()
  }

  // --- Helpers -------------------------------------------------------------------

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error: unknown) => {
      console.error('Sync failed', error)
    })
  }

  /** The group's store, or null after stopping because it was removed from this device. */
  private async store(): Promise<GroupStore | null> {
    const store = await groupStore(this.groupId)
    if (store && !store.getSnapshot().removed) return store
    this.stop()
    return null
  }

  private async withStore(task: (store: GroupStore) => Promise<void>): Promise<void> {
    const store = await this.store()
    if (store) await task(store)
  }

  private groupKeys(store: GroupStore): Promise<GroupKeys> {
    this.keys ??= deriveKeys(store.getSnapshot().record.secret)
    return this.keys
  }
}
