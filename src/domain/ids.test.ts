import { describe, expect, it } from 'vitest'

import { isId, randomId } from './ids.ts'

describe('randomId', () => {
  it('makes 16-character IDs by default and 22-character group IDs', () => {
    expect(randomId()).toHaveLength(16)
    expect(randomId(16)).toHaveLength(22)
    expect(isId(randomId())).toBe(true)
    expect(isId(randomId(16))).toBe(true)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => randomId()))
    expect(ids.size).toBe(2000)
  })
})

describe('isId', () => {
  it('rejects wrong lengths, characters and types', () => {
    expect(isId('abcDEF012345_-xy')).toBe(true)
    expect(isId('short')).toBe(false)
    expect(isId('a'.repeat(33))).toBe(false)
    expect(isId('has space in it!')).toBe(false)
    expect(isId('abc+DEF/012345==')).toBe(false)
    expect(isId(1234567890123456)).toBe(false)
    expect(isId(undefined)).toBe(false)
  })
})
