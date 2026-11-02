import { describe, expect, it } from 'vitest'

import { compareStrings, hash32, hasOnlyKeys, isRecord, stableStringify } from './util.ts'

describe('isRecord', () => {
  it('accepts plain objects, including null-prototype ones', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
    expect(isRecord(JSON.parse('{"x":1}'))).toBe(true)
  })

  it('rejects arrays, null, primitives and class instances', () => {
    for (const value of [[], null, undefined, 1, 'a', new Date(), new Map()]) {
      expect(isRecord(value)).toBe(false)
    }
  })
})

describe('hasOnlyKeys', () => {
  it('accepts subsets of the allowed keys and rejects anything extra', () => {
    expect(hasOnlyKeys({ a: 1 }, ['a', 'b'])).toBe(true)
    expect(hasOnlyKeys({}, ['a'])).toBe(true)
    expect(hasOnlyKeys({ a: 1, c: 2 }, ['a', 'b'])).toBe(false)
  })
})

describe('compareStrings', () => {
  it('orders by code unit, independent of locale', () => {
    expect(['b', 'a', 'B', '_', '-'].sort(compareStrings)).toEqual(['-', 'B', '_', 'a', 'b'])
    expect(compareStrings('a', 'a')).toBe(0)
  })
})

describe('stableStringify', () => {
  it('serializes equal values identically, whatever their key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [{ f: 1, e: 2 }] } })).toBe(
      '{"a":{"c":[{"e":2,"f":1}],"d":2},"b":1}',
    )
    expect(stableStringify({ x: 1, y: 2 })).toBe(stableStringify({ y: 2, x: 1 }))
  })
})

describe('hash32', () => {
  it('matches the FNV-1a reference values', () => {
    expect(hash32('')).toBe(0x811c9dc5)
    expect(hash32('a')).toBe(0xe40c292c)
    expect(hash32('foobar')).toBe(0xbf9cf968)
  })
})
