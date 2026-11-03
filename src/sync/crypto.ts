// End-to-end encryption (SPEC.md section 6.3). The secret in the invite link
// never leaves the device; HKDF turns it into an encryption key and a separate
// token that proves to the relay that a device holds the link.

import { fromBase64url, toBase64url } from '../../shared/base64url.ts'
import type { WireOp } from '../../shared/protocol.ts'
import { isOp, type Op } from '../domain/ops.ts'

/** The secret: 32 random bytes, base64url. */
export const SECRET = /^[A-Za-z0-9_-]{43}$/

export interface GroupKeys {
  readonly key: CryptoKey
  /** Sent to the relay, which keeps only its SHA-256 hash. */
  readonly token: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function hkdf(info: string) {
  return { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) }
}

export async function deriveKeys(secret: string): Promise<GroupKeys> {
  const raw = SECRET.test(secret) ? fromBase64url(secret) : null
  if (!raw) throw new Error('Not a group secret')
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey', 'deriveBits'])
  const [key, token] = await Promise.all([
    crypto.subtle.deriveKey(
      hkdf('tally/v1 encryption key'),
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
    crypto.subtle.deriveBits(hkdf('tally/v1 relay token'), base, 256),
  ])
  return { key, token: toBase64url(new Uint8Array(token)) }
}

/** Binds a ciphertext to its group and operation, so it can't be replayed elsewhere. */
function associatedData(groupId: string, opId: string) {
  return encoder.encode(`tally/v1\n${groupId}\n${opId}`)
}

export async function encryptOp(keys: GroupKeys, groupId: string, op: Op): Promise<WireOp> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(groupId, op.id) },
    keys.key,
    encoder.encode(JSON.stringify(op)),
  )
  return { id: op.id, iv: toBase64url(iv), ciphertext: toBase64url(new Uint8Array(ciphertext)) }
}

/**
 * The operation, or null if it was tampered with, encrypted with another key,
 * moved from another group or ID, or isn't a well-formed operation.
 */
export async function decryptOp(
  keys: GroupKeys,
  groupId: string,
  wire: WireOp,
): Promise<Op | null> {
  const iv = fromBase64url(wire.iv)
  const ciphertext = fromBase64url(wire.ciphertext)
  if (!iv || !ciphertext) return null
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: associatedData(groupId, wire.id) },
      keys.key,
      ciphertext,
    )
    const op: unknown = JSON.parse(decoder.decode(plaintext))
    return isOp(op) && op.id === wire.id ? op : null
  } catch {
    return null
  }
}
