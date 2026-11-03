import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fromBase64url, toBase64url } from '../../shared/base64url.ts'
import { randomId } from '../domain/ids.ts'
import { makeOp } from '../domain/ops.ts'
import { Device, GROUP_ID, id, VND } from '../domain/testing.ts'
import { decryptOp, deriveKeys, encryptOp } from './crypto.ts'

const SECRET = randomId(32)
const minh = new Device('minh')
const op = minh.op(id('minh'), 'group', GROUP_ID, { name: 'Đà Lạt trip', currency: VND })

/** Flips one bit of a base64url string's bytes. */
function flip(text: string, byte: number): string {
  const bytes = fromBase64url(text)
  if (!bytes) throw new Error('not base64url')
  bytes[byte % bytes.length] = (bytes[byte % bytes.length] ?? 0) ^ 1
  return toBase64url(bytes)
}

describe('keys', () => {
  it('derives the same key and token from the same secret, and different ones otherwise', async () => {
    const a = await deriveKeys(SECRET)
    const b = await deriveKeys(SECRET)
    const other = await deriveKeys(randomId(32))
    expect(a.token).toBe(b.token)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(other.token).not.toBe(a.token)
    const wire = await encryptOp(a, GROUP_ID, op)
    expect(await decryptOp(b, GROUP_ID, wire)).toEqual(op)
    expect(await decryptOp(other, GROUP_ID, wire)).toBeNull()
  })

  it('keeps the token apart from the key', async () => {
    // The token is sent to the relay; it must not be the encryption key's bytes.
    const keys = await deriveKeys(SECRET)
    expect(keys.token).not.toBe(SECRET)
    expect(keys.key.extractable).toBe(false)
  })

  it('refuses anything that isn’t a 32-byte secret', async () => {
    await expect(deriveKeys('too-short')).rejects.toThrow()
    await expect(deriveKeys(`${SECRET}A`)).rejects.toThrow()
    await expect(deriveKeys('!'.repeat(43))).rejects.toThrow()
  })
})

describe('operations', () => {
  it('round-trips any operation, with a fresh IV each time', async () => {
    const keys = await deriveKeys(SECRET)
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 80 }), async (title) => {
        const expense = minh.op(id('minh'), 'expense', randomId(), { title })
        const one = await encryptOp(keys, GROUP_ID, expense)
        const two = await encryptOp(keys, GROUP_ID, expense)
        expect(one.id).toBe(expense.id)
        expect(one.iv).not.toBe(two.iv)
        expect(await decryptOp(keys, GROUP_ID, one)).toEqual(expense)
      }),
      { numRuns: 50 },
    )
  })

  it('rejects any change to the ciphertext or IV', async () => {
    const keys = await deriveKeys(SECRET)
    const wire = await encryptOp(keys, GROUP_ID, op)
    await fc.assert(
      fc.asyncProperty(fc.nat(), fc.boolean(), async (byte, inIv) => {
        const tampered = inIv
          ? { ...wire, iv: flip(wire.iv, byte) }
          : { ...wire, ciphertext: flip(wire.ciphertext, byte) }
        expect(await decryptOp(keys, GROUP_ID, tampered)).toBeNull()
      }),
      { numRuns: 50 },
    )
  })

  it('can’t be moved to another group or replayed under another ID', async () => {
    const keys = await deriveKeys(SECRET)
    const wire = await encryptOp(keys, GROUP_ID, op)
    expect(await decryptOp(keys, 'another-group-00000000', wire)).toBeNull()
    expect(await decryptOp(keys, GROUP_ID, { ...wire, id: randomId() })).toBeNull()
  })

  it('rejects ciphertext that decrypts to something other than that operation', async () => {
    const keys = await deriveKeys(SECRET)
    const encrypt = async (plaintext: string, opId: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = new TextEncoder().encode(`tally/v1\n${GROUP_ID}\n${opId}`)
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: data },
        keys.key,
        new TextEncoder().encode(plaintext),
      )
      return { id: opId, iv: toBase64url(iv), ciphertext: toBase64url(new Uint8Array(ciphertext)) }
    }
    // Not JSON, not an operation, and an operation whose own ID differs.
    expect(await decryptOp(keys, GROUP_ID, await encrypt('not json', op.id))).toBeNull()
    expect(await decryptOp(keys, GROUP_ID, await encrypt('{"v":2}', op.id))).toBeNull()
    const other = makeOp(
      { wall: 1, count: 0, node: id('dev-minh') },
      id('minh'),
      'member',
      id('an'),
      {
        name: 'An',
      },
    )
    expect(await decryptOp(keys, GROUP_ID, await encrypt(JSON.stringify(other), op.id))).toBeNull()
  })

  it('rejects fields that aren’t base64url', async () => {
    const keys = await deriveKeys(SECRET)
    const wire = await encryptOp(keys, GROUP_ID, op)
    expect(await decryptOp(keys, GROUP_ID, { ...wire, iv: '!!!!' })).toBeNull()
    expect(await decryptOp(keys, GROUP_ID, { ...wire, ciphertext: '!!!!' })).toBeNull()
  })
})
