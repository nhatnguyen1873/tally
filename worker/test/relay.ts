// Test helpers: a client that speaks the relay protocol from inside the
// Workers runtime, as a phone would.
import { exports } from 'cloudflare:workers'
import { expect } from 'vitest'

import { toBase64url } from '../../shared/base64url.ts'
import {
  type ClientMessage,
  parseServerMessage,
  type ServerMessage,
  type WireOp,
} from '../../shared/protocol.ts'

export function randomBase64url(bytes: number): string {
  return toBase64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export const newGroupId = () => randomBase64url(16)
export const newToken = () => randomBase64url(32)

/** An encrypted-looking operation: the relay never sees inside one. */
export function fakeOp(bytes = 64): WireOp {
  return { id: randomBase64url(12), iv: randomBase64url(12), ciphertext: randomBase64url(bytes) }
}

export class Client {
  private readonly inbox: ServerMessage[] = []
  private readonly waiting: (() => void)[] = []
  closed = false
  closeReason = ''

  readonly ws: WebSocket

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (event) => {
      const message = parseServerMessage(event.data)
      expect(message, `a valid server message: ${String(event.data)}`).not.toBeNull()
      if (message) this.inbox.push(message)
      this.wake()
    })
    ws.addEventListener('close', (event) => {
      this.closed = true
      this.closeReason = event.reason
      this.wake()
    })
  }

  /** Opens a connection, from `ip` when given (as Cloudflare reports it). */
  static async connect(groupId: string, ip?: string): Promise<Client> {
    const response = await exports.default.fetch(`https://tally.test/api/g/${groupId}/ws`, {
      headers: ip ? { Upgrade: 'websocket', 'CF-Connecting-IP': ip } : { Upgrade: 'websocket' },
    })
    const ws = response.webSocket
    if (!ws) throw new Error(`No WebSocket: ${response.status}`)
    ws.accept()
    return new Client(ws)
  }

  /** Connects and says hello, expecting a welcome. */
  static async join(groupId: string, token: string, after = 0, create = false) {
    const client = await Client.connect(groupId)
    client.send(create ? { type: 'hello', token, after, create } : { type: 'hello', token, after })
    const welcome = await client.next()
    if (welcome.type !== 'welcome')
      throw new Error(`Expected a welcome, got ${JSON.stringify(welcome)}`)
    return { client, welcome }
  }

  send(message: ClientMessage | string | ArrayBuffer): void {
    this.ws.send(
      typeof message === 'string' || message instanceof ArrayBuffer
        ? message
        : JSON.stringify(message),
    )
  }

  /** The next message from the relay; fails the test if none arrives. */
  async next(): Promise<ServerMessage> {
    const deadline = Date.now() + 5000
    while (this.inbox.length === 0) {
      if (this.closed) throw new Error(`Closed (${this.closeReason}) with no message`)
      if (Date.now() > deadline) throw new Error('No message from the relay')
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve)
        setTimeout(resolve, 100)
      })
    }
    const message = this.inbox.shift()
    if (!message) throw new Error('unreachable')
    return message
  }

  /** Resolves once the relay has closed the connection. */
  async whenClosed(): Promise<void> {
    const deadline = Date.now() + 5000
    while (!this.closed) {
      if (Date.now() > deadline) throw new Error('Still open')
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve)
        setTimeout(resolve, 100)
      })
    }
  }

  /** Whether a message is waiting, after giving the relay a moment. */
  async hasMore(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return this.inbox.length > 0
  }

  private wake() {
    for (const resolve of this.waiting.splice(0)) resolve()
  }
}
