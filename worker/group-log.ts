// One group's encrypted operation log (SPEC.md section 6.6): a Durable Object
// with SQLite storage, reached over hibernatable WebSockets so an idle group
// costs nothing. It sees only ciphertext, sizes and timing, and it checks the
// access token against a hash, never storing the token itself.

import { DurableObject } from 'cloudflare:workers'

import { toBase64url } from '../shared/base64url.ts'
import {
  type ErrorCode,
  FATAL_ERRORS,
  fitsLimit,
  LIMITS,
  type LoggedOp,
  parseClientMessage,
  type ServerMessage,
  type WireOp,
} from '../shared/protocol.ts'

/** A group nobody connects to for this long is deleted (SPEC.md section 2). */
export const RETENTION_MS = 365 * 24 * 60 * 60 * 1000
/** Header the Worker passes the client's IP in, for the new-group limit. */
export const CLIENT_IP = 'X-Tally-Client-IP'
/** No valid message comes near this: 100 operations of 4 KB, base64url. */
const MAX_MESSAGE_CHARS = 700_000
const MINUTE = 60_000

/** What the relay remembers about one connection, across hibernation. */
interface Session {
  readonly ip: string
  readonly authed: boolean
  /** Start of the current rate-limit minute, and operations pushed in it. */
  readonly windowStart: number
  readonly windowCount: number
}

const encoder = new TextEncoder()

async function tokenHash(token: string): Promise<string> {
  return toBase64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))))
}

export class GroupLog extends DurableObject<Env> {
  override fetch(request: Request): Response {
    const full = this.ctx.getWebSockets().length >= LIMITS.connectionsPerGroup
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    const session: Session = {
      ip: request.headers.get(CLIENT_IP) ?? '',
      authed: false,
      windowStart: 0,
      windowCount: 0,
    }
    server.serializeAttachment(session)
    if (full) this.fail(server, 'group_full', true)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_CHARS) {
      this.fail(ws, typeof data === 'string' ? 'too_large' : 'bad_request', true)
      return
    }
    const message = parseClientMessage(data)
    const session = ws.deserializeAttachment() as Session
    if (!message) {
      this.fail(ws, 'bad_request')
    } else if (message.type === 'hello') {
      if (session.authed) this.fail(ws, 'bad_request')
      else await this.hello(ws, session, message.token, message.after, message.create === true)
    } else if (!session.authed) {
      this.fail(ws, 'unauthorized')
    } else {
      this.push(ws, session, message.ops)
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason)
    } catch {
      // Already closed.
    }
  }

  /** The retention deadline passed with nobody connecting: delete everything. */
  override async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(1001, 'deleted')
    await this.ctx.storage.deleteAll()
  }

  // --- Messages ----------------------------------------------------------------

  private async hello(
    ws: WebSocket,
    session: Session,
    token: string,
    after: number,
    create: boolean,
  ): Promise<void> {
    const hash = await tokenHash(token)
    if (!this.exists()) {
      // Joining a group nobody has uploaded yet, or that was deleted after a year.
      if (!create) {
        this.fail(ws, 'not_found')
        return
      }
      const { success } = await this.env.CREATE_LIMIT.limit({ key: session.ip })
      if (!success) {
        this.fail(ws, 'rate_limited', true, MINUTE)
        return
      }
      // Another connection may have created it while this one waited.
      if (!this.exists()) this.createLog(hash)
    }
    if (!this.tokenMatches(hash)) {
      this.fail(ws, 'unauthorized')
      return
    }

    ws.serializeAttachment({ ...session, authed: true } satisfies Session)
    // Synchronous from here, so no push lands between the welcome and the backlog.
    const head = this.head()
    this.send(ws, { type: 'welcome', now: Date.now(), head, epoch: this.meta('epoch') ?? '' })
    for (let from = after; from < head;) {
      const batch = this.opsAfter(from)
      if (batch.length === 0) break
      this.send(ws, { type: 'ops', ops: batch })
      from = batch.at(-1)?.seq ?? head
    }
    await this.ctx.storage.setAlarm(Date.now() + RETENTION_MS)
  }

  private push(ws: WebSocket, session: Session, ops: readonly WireOp[]): void {
    if (ops.length > LIMITS.opsPerMessage || !ops.every(fitsLimit)) {
      this.fail(ws, 'too_large')
      return
    }
    const now = Date.now()
    const newWindow = now - session.windowStart >= MINUTE
    const windowStart = newWindow ? now : session.windowStart
    const windowCount = (newWindow ? 0 : session.windowCount) + ops.length
    if (windowCount > LIMITS.opsPerMinute) {
      this.fail(ws, 'rate_limited', false, windowStart + MINUTE - now)
      return
    }

    const sql = this.ctx.storage.sql
    const ids = [...new Set(ops.map((op) => op.id))]
    const known = new Set(
      ids.filter((id) => sql.exec('SELECT 1 FROM ops WHERE id = ?', id).toArray().length > 0),
    )
    // Pushes can repeat operations the log has, or one twice: keep the first.
    const unique = ops.filter((op) => {
      if (known.has(op.id)) return false
      known.add(op.id)
      return true
    })
    const count = Number(this.meta('count') ?? 0)
    if (count + unique.length > LIMITS.opsPerGroup) {
      this.fail(ws, 'group_full')
      return
    }

    const logged = this.ctx.storage.transactionSync(() => {
      const rows: LoggedOp[] = []
      for (const op of unique) {
        const row = sql
          .exec<{ seq: number }>(
            'INSERT INTO ops (id, iv, ciphertext, received_at) VALUES (?, ?, ?, ?) RETURNING seq',
            op.id,
            op.iv,
            op.ciphertext,
            now,
          )
          .one()
        rows.push({ seq: row.seq, id: op.id, iv: op.iv, ciphertext: op.ciphertext })
      }
      this.setMeta('count', String(count + rows.length))
      return rows
    })
    ws.serializeAttachment({ ...session, windowStart, windowCount } satisfies Session)

    const acks = ids.map((id) => ({
      id,
      seq: sql.exec<{ seq: number }>('SELECT seq FROM ops WHERE id = ?', id).one().seq,
    }))
    this.send(ws, { type: 'ack', acks })
    if (logged.length === 0) return
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && (other.deserializeAttachment() as Session).authed) {
        this.send(other, { type: 'ops', ops: logged })
      }
    }
  }

  // --- Storage -----------------------------------------------------------------

  /** Whether this group has a log. Checking doesn't create anything. */
  private exists(): boolean {
    return (
      this.ctx.storage.sql
        .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
        .toArray().length > 0
    )
  }

  private createLog(hash: string): void {
    const sql = this.ctx.storage.sql
    this.ctx.storage.transactionSync(() => {
      sql.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      sql.exec(
        `CREATE TABLE ops (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          iv TEXT NOT NULL,
          ciphertext TEXT NOT NULL,
          received_at INTEGER NOT NULL
        )`,
      )
      this.setMeta('token_hash', hash)
      this.setMeta('epoch', toBase64url(crypto.getRandomValues(new Uint8Array(16))))
      this.setMeta('count', '0')
    })
  }

  private tokenMatches(hash: string): boolean {
    const stored = this.meta('token_hash')
    if (stored?.length !== hash.length) return false
    return crypto.subtle.timingSafeEqual(encoder.encode(stored), encoder.encode(hash))
  }

  private meta(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)
      .toArray()
    return rows[0]?.value ?? null
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
    )
  }

  private head(): number {
    return (
      this.ctx.storage.sql.exec<{ head: number | null }>('SELECT MAX(seq) AS head FROM ops').one()
        .head ?? 0
    )
  }

  private opsAfter(seq: number): LoggedOp[] {
    return this.ctx.storage.sql
      .exec<{ seq: number; id: string; iv: string; ciphertext: string }>(
        'SELECT seq, id, iv, ciphertext FROM ops WHERE seq > ? ORDER BY seq LIMIT ?',
        seq,
        LIMITS.opsPerMessage,
      )
      .toArray()
      .map(({ seq: rowSeq, id, iv, ciphertext }) => ({ seq: rowSeq, id, iv, ciphertext }))
  }

  // --- Replies -----------------------------------------------------------------

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // The client went away; its close event cleans up.
    }
  }

  /** Reports an error; fatal ones, and any the caller asks for, close the connection. */
  private fail(ws: WebSocket, code: ErrorCode, close = false, retryAfter?: number): void {
    this.send(
      ws,
      retryAfter === undefined ? { type: 'error', code } : { type: 'error', code, retryAfter },
    )
    if (close || FATAL_ERRORS.includes(code)) {
      try {
        ws.close(1008, code)
      } catch {
        // Already closed.
      }
    }
  }
}
