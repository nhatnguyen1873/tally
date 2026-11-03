// A relay in memory, for sync tests: the protocol of worker/group-log.ts
// without the Workers runtime. Each phone gets its own view of the network,
// so one can go offline while the others carry on. Not shipped.

import { toBase64url } from '../../shared/base64url.ts'
import {
  type ErrorCode,
  type LoggedOp,
  parseClientMessage,
  type ServerMessage,
  type WireOp,
} from '../../shared/protocol.ts'
import type { Network, Socket } from './engine.ts'

interface Log {
  readonly token: string
  readonly epoch: string
  readonly ops: LoggedOp[]
}

type Listener = (event: { data: unknown }) => void

class FakeSocket implements Socket {
  readonly groupId: string
  authed = false
  /** Closing: messages already on their way still arrive, as with a real socket. */
  closing = false
  closed = false
  private readonly relay: FakeRelay
  private readonly listeners = new Map<string, Listener[]>()

  constructor(relay: FakeRelay, groupId: string) {
    this.relay = relay
    this.groupId = groupId
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }

  send(data: string): void {
    if (this.closing) return
    setTimeout(() => {
      if (!this.closed) this.relay.receive(this, data)
    }, 0)
  }

  /** Delivers a message from the relay, asynchronously like a real socket. */
  deliver(message: ServerMessage): void {
    setTimeout(() => {
      if (!this.closed) this.emit('message', JSON.stringify(message))
    }, 0)
  }

  close(): void {
    if (this.closing) return
    this.closing = true
    setTimeout(() => {
      this.closed = true
      this.emit('close')
    }, 0)
  }
}

export class FakeRelay {
  readonly logs = new Map<string, Log>()
  readonly sockets = new Set<FakeSocket>()
  /** Milliseconds the relay's clock runs ahead of the device's. */
  clockSkew = 0
  /** Refuse connections, as when the relay is down. */
  down = false
  /** Answer the next push with rate_limited. */
  limitNextPush = false
  /** Answer the next push with this error instead. */
  failNextPush: ErrorCode | null = null
  /** Answer the next hello with this error, and close. */
  failNextHello: ErrorCode | null = null
  /** Open connections but never answer, as through a broken proxy. */
  silent = false
  pushes = 0

  /** A phone's view of the network. */
  network(): Network & { setOnline(online: boolean): void } {
    let online = true
    const wake = new Set<() => void>()
    const mine = new Set<FakeSocket>()
    return {
      connect: (groupId) => {
        const socket = new FakeSocket(this, groupId)
        mine.add(socket)
        this.sockets.add(socket)
        setTimeout(() => {
          if (!online || this.down) {
            socket.emit('error')
            socket.close()
          } else if (!this.silent) {
            socket.emit('open')
          }
        }, 0)
        return socket
      },
      isOnline: () => online,
      onWake(listener) {
        wake.add(listener)
        return () => {
          wake.delete(listener)
        }
      },
      setOnline(next) {
        online = next
        if (!next) for (const socket of mine) socket.close()
        else for (const listener of wake) listener()
      },
    }
  }

  /** Deletes a group, as the retention alarm does, dropping its connections. */
  forget(groupId: string): void {
    this.logs.delete(groupId)
    for (const socket of this.sockets) if (socket.groupId === groupId) socket.close()
  }

  /** Sends text that isn't a valid message to a group's connections. */
  sendRaw(groupId: string, text: string): void {
    for (const socket of this.sockets) {
      if (socket.groupId === groupId && !socket.closing) {
        setTimeout(() => {
          socket.emit('message', text)
        }, 0)
      }
    }
  }

  /** Adds an operation as if another device had pushed it. */
  inject(groupId: string, op: WireOp): void {
    const log = this.logs.get(groupId)
    if (!log) throw new Error('No such group')
    const logged = { ...op, seq: log.ops.length + 1 }
    log.ops.push(logged)
    for (const socket of this.sockets) {
      if (socket.groupId === groupId && socket.authed)
        socket.deliver({ type: 'ops', ops: [logged] })
    }
  }

  receive(socket: FakeSocket, data: string): void {
    const message = parseClientMessage(data)
    if (!message) {
      socket.deliver({ type: 'error', code: 'bad_request' })
      socket.close()
      return
    }
    if (message.type === 'hello') {
      if (this.failNextHello) {
        socket.deliver({ type: 'error', code: this.failNextHello })
        this.failNextHello = null
        socket.close()
        return
      }
      let log = this.logs.get(socket.groupId)
      if (!log) {
        if (!message.create) {
          socket.deliver({ type: 'error', code: 'not_found' })
          socket.close()
          return
        }
        log = {
          token: message.token,
          epoch: toBase64url(crypto.getRandomValues(new Uint8Array(16))),
          ops: [],
        }
        this.logs.set(socket.groupId, log)
      }
      if (log.token !== message.token) {
        socket.deliver({ type: 'error', code: 'unauthorized' })
        socket.close()
        return
      }
      socket.authed = true
      socket.deliver({
        type: 'welcome',
        now: Date.now() + this.clockSkew,
        head: log.ops.length,
        epoch: log.epoch,
      })
      const backlog = log.ops.filter((op) => op.seq > message.after)
      for (let i = 0; i < backlog.length; i += 100) {
        socket.deliver({ type: 'ops', ops: backlog.slice(i, i + 100) })
      }
      return
    }
    const log = this.logs.get(socket.groupId)
    if (!socket.authed || !log) {
      socket.deliver({ type: 'error', code: 'unauthorized' })
      socket.close()
      return
    }
    this.pushes++
    if (this.limitNextPush) {
      this.limitNextPush = false
      socket.deliver({ type: 'error', code: 'rate_limited', retryAfter: 20 })
      return
    }
    if (this.failNextPush) {
      socket.deliver({ type: 'error', code: this.failNextPush })
      this.failNextPush = null
      return
    }
    const added: LoggedOp[] = []
    for (const op of message.ops) {
      if (log.ops.some((existing) => existing.id === op.id)) continue
      const logged = { ...op, seq: log.ops.length + 1 }
      log.ops.push(logged)
      added.push(logged)
    }
    socket.deliver({
      type: 'ack',
      acks: message.ops.map((op) => ({
        id: op.id,
        seq: log.ops.find((existing) => existing.id === op.id)?.seq ?? 0,
      })),
    })
    if (added.length === 0) return
    for (const other of this.sockets) {
      if (other !== socket && other.groupId === socket.groupId && other.authed && !other.closing) {
        other.deliver({ type: 'ops', ops: added })
      }
    }
  }
}
