import { describe, expect, it } from 'vitest'

import { isOp, makeOp } from './ops.ts'
import { id } from './testing.ts'

const clock = { wall: Date.UTC(2026, 10, 2), count: 0, node: id('dev-minh') }
const valid = makeOp(clock, id('minh'), 'expense', id('dinner'), { title: 'Dinner' })

describe('makeOp', () => {
  it('builds a well-formed operation stamped by the device', () => {
    expect(isOp(valid)).toBe(true)
    expect(valid.actor).toBe(clock.node)
    expect(valid.id).toHaveLength(16)
    expect(valid.v).toBe(1)
  })

  it('survives a JSON round trip', () => {
    expect(isOp(JSON.parse(JSON.stringify(valid)))).toBe(true)
  })
})

describe('isOp', () => {
  it('rejects malformed envelopes', () => {
    const malformed: unknown[] = [
      { ...valid, v: 2 },
      { ...valid, extra: true },
      { ...valid, entity: 'invoice' },
      { ...valid, entity: 'toString' },
      { ...valid, set: {} },
      { ...valid, set: { amount: 5 } },
      { ...valid, set: [1] },
      { ...valid, actor: id('dev-other') },
      { ...valid, hlc: 'yesterday' },
      { ...valid, hlc: 42 },
      { ...valid, hlc: `999999999999999:999999:${valid.actor}` },
      { ...valid, id: 'x' },
      { ...valid, by: 42 },
      { ...valid, key: '' },
      null,
      'op',
    ]
    for (const op of malformed) expect(isOp(op)).toBe(false)
  })

  it('accepts only the fields each entity has', () => {
    expect(isOp({ ...valid, entity: 'member', set: { name: 'An', deleted: false } })).toBe(true)
    expect(isOp({ ...valid, entity: 'member', set: { title: 'An' } })).toBe(false)
    expect(isOp({ ...valid, entity: 'payment', set: { money: {}, date: '2026-11-02' } })).toBe(true)
    expect(isOp({ ...valid, entity: 'group', set: { deleted: true } })).toBe(false)
  })
})
