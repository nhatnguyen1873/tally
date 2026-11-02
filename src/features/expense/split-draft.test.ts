import { describe, expect, it } from 'vitest'

import { id } from '../../domain/testing.ts'
import { draftFrom, leftToAssign, newDraft, partsOf, splitOf } from './split-draft.ts'

const A = id('a')
const B = id('b')
const C = id('c')
const GONE = id('gone')
const MEMBERS = [A, B, C]

describe('newDraft', () => {
  it('starts equal among everyone, with even values ready for the other modes', () => {
    const draft = newDraft(MEMBERS)
    expect(draft.mode).toBe('equal')
    expect(splitOf(draft, 900, MEMBERS)).toEqual({ split: { mode: 'equal', among: MEMBERS } })
    expect(Object.values(draft.bps).reduce((sum, value) => sum + value, 0)).toBe(10_000)
    expect(draft.shares).toEqual({ [A]: 1, [B]: 1, [C]: 1 })
    expect(splitOf({ ...draft, mode: 'percent' }, 900, MEMBERS).split?.mode).toBe('percent')
  })
})

describe('splitOf', () => {
  const draft = newDraft(MEMBERS)

  it('needs at least one person in every mode', () => {
    expect(splitOf({ ...draft, among: [] }, 900, MEMBERS).problem).toBe('nobody')
    expect(splitOf({ ...draft, mode: 'exact' }, 900, MEMBERS).problem).toBe('nobody')
    expect(splitOf({ ...draft, mode: 'shares', shares: { [A]: 0 } }, 900, MEMBERS).problem).toBe(
      'nobody',
    )
    expect(splitOf({ ...draft, mode: 'percent', bps: {} }, 900, MEMBERS).problem).toBe('nobody')
  })

  it('needs exact amounts and percentages to add up', () => {
    const exact = { ...draft, mode: 'exact' as const, amounts: { [A]: 500, [B]: 300 } }
    expect(splitOf(exact, 900, MEMBERS).problem).toBe('exact')
    expect(splitOf(exact, 800, MEMBERS).split).toEqual({
      mode: 'exact',
      amounts: { [A]: 500, [B]: 300 },
    })
    const percent = { ...draft, mode: 'percent' as const, bps: { [A]: 5_000, [B]: 4_000 } }
    expect(splitOf(percent, 900, MEMBERS).problem).toBe('percent')
  })

  it('leaves out zeros and anyone who isn’t a member any more', () => {
    const shares = { ...draft, mode: 'shares' as const, shares: { [A]: 2, [B]: 0, [GONE]: 3 } }
    expect(splitOf(shares, 900, MEMBERS).split).toEqual({ mode: 'shares', shares: { [A]: 2 } })
    expect(splitOf({ ...draft, among: [B, GONE] }, 900, MEMBERS).split).toEqual({
      mode: 'equal',
      among: [B],
    })
  })
})

describe('leftToAssign', () => {
  it('shows what’s unassigned for exact amounts and percentages only', () => {
    const draft = newDraft(MEMBERS)
    expect(leftToAssign({ ...draft, mode: 'exact', amounts: { [A]: 300 } }, 900, MEMBERS)).toBe(600)
    expect(leftToAssign({ ...draft, mode: 'exact', amounts: { [A]: 1_000 } }, 900, MEMBERS)).toBe(
      -100,
    )
    expect(leftToAssign({ ...draft, mode: 'exact' }, null, MEMBERS)).toBeNull()
    expect(leftToAssign({ ...draft, mode: 'percent', bps: { [A]: 2_500 } }, 900, MEMBERS)).toBe(
      7_500,
    )
    expect(leftToAssign(draft, 900, MEMBERS)).toBeNull()
  })
})

describe('draftFrom', () => {
  it('reopens every kind of split exactly as saved', () => {
    const splits = [
      { mode: 'equal', among: [A, C] },
      { mode: 'exact', amounts: { [A]: 400, [C]: 500 } },
      { mode: 'shares', shares: { [B]: 2, [C]: 1 } },
      { mode: 'percent', bps: { [A]: 2_500, [B]: 7_500 } },
    ] as const
    for (const split of splits) {
      expect(splitOf(draftFrom(split, MEMBERS), 900, MEMBERS).split).toEqual(split)
    }
  })
})

describe('partsOf', () => {
  it('previews each part with the expense’s own rounding, once everything is valid', () => {
    const parts = partsOf(newDraft(MEMBERS), 100, MEMBERS, 'expense000000001')
    expect([...(parts?.values() ?? [])].reduce((sum, part) => sum + part, 0)).toBe(100)
    expect(partsOf(newDraft(MEMBERS), null, MEMBERS, 'x')).toBeNull()
    expect(partsOf({ ...newDraft(MEMBERS), among: [] }, 100, MEMBERS, 'x')).toBeNull()
  })
})
