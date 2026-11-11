import { describe, expect, it } from 'vitest'

import { foldOps } from './fold.ts'
import { canRemoveMember, displayNames, hasRoomForMember, isInvolved } from './members.ts'
import { Device, GROUP_ID, id, VND } from './testing.ts'

const MINH = id('minh')
const AN = id('an')
const AN_TWO = id('an-two')
const BAO = id('bao')
const LINH = id('linh')

function group() {
  const minh = new Device('minh')
  return {
    minh,
    ops: [
      minh.op(MINH, 'group', GROUP_ID, { name: 'Flat', currency: VND }),
      minh.op(MINH, 'member', MINH, { name: 'Minh' }),
      minh.op(MINH, 'member', AN, { name: 'An' }),
      minh.op(MINH, 'member', AN_TWO, { name: 'an' }),
      minh.op(MINH, 'member', BAO, { name: 'Bảo' }),
      minh.op(MINH, 'member', LINH, { name: 'Linh' }),
    ],
  }
}

describe('displayNames', () => {
  it('numbers repeated names, ignoring case, in the order members were added', () => {
    const { ops } = group()
    expect(Object.fromEntries(displayNames(foldOps(GROUP_ID, ops).members))).toEqual({
      [MINH]: 'Minh',
      [AN]: 'An',
      [AN_TWO]: 'an (2)',
      [BAO]: 'Bảo',
      [LINH]: 'Linh',
    })
  })
  it('shows the one left plainly once the other with that name is removed', () => {
    const { minh, ops } = group()
    // Removing the first An, though the second is the one usually left over.
    const state = foldOps(GROUP_ID, [...ops, minh.op(MINH, 'member', AN, { deleted: true })])
    expect(displayNames(state.members).get(AN_TWO)).toBe('an')
    expect(displayNames(state.members).get(AN)).toBe('An (2)')
  })
})

describe('hasRoomForMember', () => {
  it('allows 50 members, not counting removed ones', () => {
    const { minh, ops } = group()
    const more = Array.from({ length: 45 }, (_, i) =>
      minh.op(MINH, 'member', id(`m${i}`), { name: `Friend ${i}` }),
    )
    expect(hasRoomForMember(foldOps(GROUP_ID, [...ops, ...more.slice(1)]))).toBe(true)
    const full = foldOps(GROUP_ID, [...ops, ...more])
    expect(full.members.size).toBe(50)
    expect(hasRoomForMember(full)).toBe(false)
    const removed = minh.op(MINH, 'member', LINH, { deleted: true })
    expect(hasRoomForMember(foldOps(GROUP_ID, [...ops, ...more, removed]))).toBe(true)
  })
})

describe('canRemoveMember', () => {
  it('keeps at least 2 current members, not counting removed ones', () => {
    const { minh, ops } = group()
    const remove = (key: typeof AN) => minh.op(MINH, 'member', key, { deleted: true })
    // Five members, so three can go.
    const three = [...ops, remove(AN), remove(AN_TWO)]
    expect(canRemoveMember(foldOps(GROUP_ID, three))).toBe(true)
    const two = [...three, remove(BAO)]
    expect(canRemoveMember(foldOps(GROUP_ID, two))).toBe(false)
    const back = minh.op(MINH, 'member', BAO, { deleted: false })
    expect(canRemoveMember(foldOps(GROUP_ID, [...two, back]))).toBe(true)
  })
})

describe('isInvolved', () => {
  it('finds payers, participants and both sides of payments, ignoring deleted items', () => {
    const { minh, ops } = group()
    const rent = minh.op(MINH, 'expense', id('rent'), {
      title: 'Rent',
      money: { amount: 9_000_000, paidBy: MINH, split: { mode: 'equal', among: [MINH, AN] } },
      date: '2026-11-01',
      category: 'bills',
    })
    const payback = minh.op(AN, 'payment', id('payback'), {
      money: { amount: 4_500_000, from: AN, to: BAO },
      date: '2026-11-02',
    })
    const gone = minh.op(MINH, 'expense', id('gone'), {
      title: 'Snacks',
      money: { amount: 50_000, paidBy: LINH, split: { mode: 'equal', among: [LINH] } },
      date: '2026-11-02',
      category: 'food',
    })
    const removeGone = minh.op(MINH, 'expense', id('gone'), { deleted: true })
    const removePayback = minh.op(MINH, 'payment', id('payback'), { deleted: true })

    const state = foldOps(GROUP_ID, [...ops, rent, payback, gone, removeGone])
    expect(isInvolved(state, MINH)).toBe(true)
    expect(isInvolved(state, AN)).toBe(true)
    expect(isInvolved(state, BAO)).toBe(true)
    expect(isInvolved(state, LINH)).toBe(false)
    expect(isInvolved(state, AN_TWO)).toBe(false)

    const later = foldOps(GROUP_ID, [...ops, rent, payback, removePayback])
    expect(isInvolved(later, BAO)).toBe(false)
  })
})
