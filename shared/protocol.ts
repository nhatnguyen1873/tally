// The sync protocol between the app and the relay, over a WebSocket at
// /api/g/:groupId/ws (SPEC.md section 6.5). Every message is one JSON object
// with a `type`. Both sides validate everything they receive.

import { base64urlBytes } from './base64url.ts'

/** Relay limits (SPEC.md section 2, decision 11). */
export const LIMITS = {
  /** Bytes of ciphertext in one operation. */
  opBytes: 4096,
  opsPerMessage: 100,
  opsPerGroup: 20_000,
  connectionsPerGroup: 50,
  /** Operations one connection may push per minute. */
  opsPerMinute: 120,
} as const

/** A group ID: 16 random bytes, base64url. */
export const GROUP_ID = /^[A-Za-z0-9_-]{22}$/
/** The relay access token: 32 bytes derived from the group's secret, base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/
/** Operation IDs, as in src/domain/ids.ts. */
const OP_ID = /^[A-Za-z0-9_-]{16,32}$/
/** A 12-byte AES-GCM IV, base64url. */
const IV = /^[A-Za-z0-9_-]{16}$/
const CIPHERTEXT = /^[A-Za-z0-9_-]+$/
/** The relay's random ID for one incarnation of a group's log. */
const EPOCH = /^[A-Za-z0-9_-]{16,32}$/
/** AES-GCM appends a 16-byte tag, so no ciphertext is shorter. */
const TAG_BYTES = 16

/** An encrypted operation as the relay holds it, minus what it adds. */
export interface WireOp {
  readonly id: string
  readonly iv: string
  readonly ciphertext: string
}

/** An operation in the relay's log, numbered in the order it arrived. */
export interface LoggedOp extends WireOp {
  readonly seq: number
}

export type ClientMessage =
  /** Opens the session. `after` is the last sequence number this device has. */
  | {
      readonly type: 'hello'
      readonly token: string
      readonly after: number
      readonly create?: true
    }
  | { readonly type: 'push'; readonly ops: readonly WireOp[] }

export type ErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'too_large'
  | 'rate_limited'
  | 'group_full'
  /** A message the relay couldn't understand: a bug, never shown as such. */
  | 'bad_request'

const ERROR_CODES: readonly ErrorCode[] = [
  'unauthorized',
  'not_found',
  'too_large',
  'rate_limited',
  'group_full',
  'bad_request',
]

export type ServerMessage =
  /** Sent once the hello checks out. `head` is the log's last sequence number (0 when empty). */
  | {
      readonly type: 'welcome'
      readonly now: number
      readonly head: number
      readonly epoch: string
    }
  /** Operations in sequence order: the backlog after `hello.after`, then other devices' pushes. */
  | { readonly type: 'ops'; readonly ops: readonly LoggedOp[] }
  /** Where each pushed operation sits in the log, including ones it already had. */
  | {
      readonly type: 'ack'
      readonly acks: readonly { readonly id: string; readonly seq: number }[]
    }
  /** `retryAfter` (milliseconds) comes with rate_limited. */
  | { readonly type: 'error'; readonly code: ErrorCode; readonly retryAfter?: number }

/** Errors after which the relay closes the connection. */
export const FATAL_ERRORS: readonly ErrorCode[] = ['unauthorized', 'not_found', 'bad_request']

// --- Validation ----------------------------------------------------------------

type Json = Record<string, unknown>

function parse(text: unknown): Json | null {
  if (typeof text !== 'string') return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Json)
      : null
  } catch {
    return null
  }
}

function hasOnly(value: Json, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isSeq(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isWireOp(value: unknown): value is WireOp {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const op = value as Json
  if (!hasOnly(op, ['id', 'iv', 'ciphertext', 'seq'])) return false
  const { id, iv, ciphertext } = op
  return (
    typeof id === 'string' &&
    OP_ID.test(id) &&
    typeof iv === 'string' &&
    IV.test(iv) &&
    typeof ciphertext === 'string' &&
    CIPHERTEXT.test(ciphertext) &&
    base64urlBytes(ciphertext.length) >= TAG_BYTES
  )
}

function isLoggedOp(value: unknown): value is LoggedOp {
  return isWireOp(value) && isSeq((value as WireOp & { seq?: unknown }).seq)
}

/** Whether an operation's ciphertext is within the relay's size limit. */
export function fitsLimit(op: WireOp): boolean {
  return base64urlBytes(op.ciphertext.length) <= LIMITS.opBytes
}

/** What the relay accepts from a client. Sizes are checked separately, to answer too_large. */
export function parseClientMessage(text: unknown): ClientMessage | null {
  const message = parse(text)
  if (!message) return null
  switch (message.type) {
    case 'hello': {
      const { token, after, create } = message
      if (!hasOnly(message, ['type', 'token', 'after', 'create'])) return null
      if (typeof token !== 'string' || !TOKEN.test(token) || !isSeq(after)) return null
      if (create !== undefined && create !== true) return null
      return create ? { type: 'hello', token, after, create } : { type: 'hello', token, after }
    }
    case 'push': {
      const { ops } = message
      if (!hasOnly(message, ['type', 'ops']) || !Array.isArray(ops) || ops.length === 0) return null
      if (!ops.every((op) => isWireOp(op) && !('seq' in op))) return null
      return { type: 'push', ops: ops as WireOp[] }
    }
    default:
      return null
  }
}

/** What the app accepts from the relay. */
export function parseServerMessage(text: unknown): ServerMessage | null {
  const message = parse(text)
  if (!message) return null
  switch (message.type) {
    case 'welcome': {
      const { now, head, epoch } = message
      if (!hasOnly(message, ['type', 'now', 'head', 'epoch'])) return null
      if (!isSeq(now) || !isSeq(head) || typeof epoch !== 'string' || !EPOCH.test(epoch)) {
        return null
      }
      return { type: 'welcome', now, head, epoch }
    }
    case 'ops': {
      const { ops } = message
      if (!hasOnly(message, ['type', 'ops']) || !Array.isArray(ops)) return null
      if (!ops.every(isLoggedOp)) return null
      return { type: 'ops', ops }
    }
    case 'ack': {
      const { acks } = message
      if (!hasOnly(message, ['type', 'acks']) || !Array.isArray(acks)) return null
      const valid = acks.every((ack: unknown) => {
        if (typeof ack !== 'object' || ack === null) return false
        const { id, seq } = ack as Json
        return typeof id === 'string' && OP_ID.test(id) && isSeq(seq)
      })
      return valid ? { type: 'ack', acks: acks as { id: string; seq: number }[] } : null
    }
    case 'error': {
      const { code, retryAfter } = message
      if (!hasOnly(message, ['type', 'code', 'retryAfter'])) return null
      if (!ERROR_CODES.includes(code as ErrorCode)) return null
      if (retryAfter !== undefined && !isSeq(retryAfter)) return null
      return retryAfter === undefined
        ? { type: 'error', code: code as ErrorCode }
        : { type: 'error', code: code as ErrorCode, retryAfter }
    }
    default:
      return null
  }
}
