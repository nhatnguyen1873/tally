import { describe, expect, it } from 'vitest'

import { base64urlBytes, fromBase64url, toBase64url } from './base64url.ts'
import { fitsLimit, LIMITS, parseClientMessage, parseServerMessage } from './protocol.ts'

const TOKEN = 'T'.repeat(43)
const op = { id: 'op-0000000000001', iv: 'I'.repeat(16), ciphertext: 'C'.repeat(40) }
const json = (value: unknown) => JSON.stringify(value)

describe('base64url', () => {
  it('round-trips bytes and counts them from the length', () => {
    for (const length of [0, 1, 2, 3, 12, 32, 4096]) {
      const bytes = crypto.getRandomValues(new Uint8Array(length))
      const text = toBase64url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64url(text)).toEqual(bytes)
      expect(base64urlBytes(text.length)).toBe(length)
    }
  })

  it('rejects anything else', () => {
    expect(fromBase64url('a+b/')).toBeNull()
    expect(fromBase64url('abcde')).toBeNull()
  })
})

describe('client messages', () => {
  it('accepts a hello, with or without create', () => {
    expect(parseClientMessage(json({ type: 'hello', token: TOKEN, after: 0 }))).toEqual({
      type: 'hello',
      token: TOKEN,
      after: 0,
    })
    expect(
      parseClientMessage(json({ type: 'hello', token: TOKEN, after: 7, create: true })),
    ).toEqual({ type: 'hello', token: TOKEN, after: 7, create: true })
  })

  it('accepts a push of encrypted operations', () => {
    expect(parseClientMessage(json({ type: 'push', ops: [op] }))).toEqual({
      type: 'push',
      ops: [op],
    })
  })

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['not text', 42],
    ['an unknown type', json({ type: 'nope' })],
    ['a bad token', json({ type: 'hello', token: 'short', after: 0 })],
    ['a negative cursor', json({ type: 'hello', token: TOKEN, after: -1 })],
    ['a fractional cursor', json({ type: 'hello', token: TOKEN, after: 1.5 })],
    ['create: false', json({ type: 'hello', token: TOKEN, after: 0, create: false })],
    ['extra keys', json({ type: 'hello', token: TOKEN, after: 0, x: 1 })],
    ['an empty push', json({ type: 'push', ops: [] })],
    ['ops that aren’t a list', json({ type: 'push', ops: {} })],
    ['an op with a seq', json({ type: 'push', ops: [{ ...op, seq: 1 }] })],
    ['an op with a bad ID', json({ type: 'push', ops: [{ ...op, id: 'x' }] })],
    ['an op with a bad IV', json({ type: 'push', ops: [{ ...op, iv: 'short' }] })],
    ['an op shorter than its tag', json({ type: 'push', ops: [{ ...op, ciphertext: 'AAAA' }] })],
    [
      'an op that isn’t base64url',
      json({ type: 'push', ops: [{ ...op, ciphertext: '+'.repeat(40) }] }),
    ],
    ['an op that isn’t an object', json({ type: 'push', ops: ['x'] })],
    ['a push with extra keys', json({ type: 'push', ops: [op], x: 1 })],
  ])('rejects %s', (_name, text) => {
    expect(parseClientMessage(text)).toBeNull()
  })

  it('measures operations against the size limit', () => {
    const at = (bytes: number) => ({ ...op, ciphertext: 'A'.repeat(Math.ceil((bytes * 4) / 3)) })
    expect(fitsLimit(at(LIMITS.opBytes))).toBe(true)
    expect(fitsLimit(at(LIMITS.opBytes + 1))).toBe(false)
  })
})

describe('server messages', () => {
  it.each([
    { type: 'welcome', now: 1, head: 0, epoch: 'epoch-0000000001' },
    { type: 'ops', ops: [{ ...op, seq: 3 }] },
    { type: 'ops', ops: [] },
    { type: 'ack', acks: [{ id: op.id, seq: 3 }] },
    { type: 'error', code: 'not_found' },
    { type: 'error', code: 'rate_limited', retryAfter: 1000 },
  ])('accepts $type', (message) => {
    expect(parseServerMessage(json(message))).toEqual(message)
  })

  it.each([
    ['not JSON', 'x'],
    ['an unknown type', json({ type: 'hello' })],
    ['a welcome with a bad epoch', json({ type: 'welcome', now: 1, head: 0, epoch: '!' })],
    [
      'a welcome with extra keys',
      json({ type: 'welcome', now: 1, head: 0, epoch: 'e'.repeat(16), x: 1 }),
    ],
    ['a welcome without a head', json({ type: 'welcome', now: 1, epoch: 'e'.repeat(16) })],
    ['ops without seqs', json({ type: 'ops', ops: [op] })],
    ['ops that aren’t a list', json({ type: 'ops', ops: 1 })],
    ['ops with extra keys', json({ type: 'ops', ops: [], x: 1 })],
    ['an ack that isn’t a list', json({ type: 'ack', acks: {} })],
    ['an ack with a bad entry', json({ type: 'ack', acks: [{ id: op.id }] })],
    ['an ack with a non-object', json({ type: 'ack', acks: [null] })],
    ['an ack with extra keys', json({ type: 'ack', acks: [], x: 1 })],
    ['an unknown error', json({ type: 'error', code: 'nope' })],
    ['an error with a bad retry', json({ type: 'error', code: 'rate_limited', retryAfter: -1 })],
    ['an error with extra keys', json({ type: 'error', code: 'not_found', x: 1 })],
  ])('rejects %s', (_name, text) => {
    expect(parseServerMessage(text)).toBeNull()
  })
})
