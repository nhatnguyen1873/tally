import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { balances, expenseEffect, groupTotal, totalsByCategory } from './balances.ts'
import { foldOps } from './fold.ts'
import type { Op } from './ops.ts'
import { Device, GROUP_ID, id, VND } from './testing.ts'

const MINH = id('minh')
const AN = id('an')
const LINH = id('linh')
const BAO = id('bao')
const MEMBERS = [MINH, AN, LINH, BAO]
const EVERYONE = { mode: 'equal', among: MEMBERS }

function setup(device: Device): Op[] {
  return [
    device.op(MINH, 'group', GROUP_ID, { name: 'Đà Lạt trip', currency: VND }),
    ...MEMBERS.map((member, i) =>
      device.op(MINH, 'member', member, { name: ['Minh', 'An', 'Linh', 'Bảo'][i] }),
    ),
  ]
}

function expense(
  device: Device,
  key: string,
  amount: number,
  paidBy: string,
  category = 'food',
  split: unknown = EVERYONE,
): Op {
  return device.op(paidBy, 'expense', key, {
    title: key.replace(/-+$/, ''),
    money: { amount, paidBy, split },
    date: '2026-11-02',
    category,
  })
}

function trip() {
  const device = new Device('minh')
  const ops = [
    ...setup(device),
    expense(device, id('dinner'), 1_200_000, MINH),
    expense(device, id('taxi'), 160_000, BAO, 'transport'),
  ]
  return { device, ops }
}

describe('balances', () => {
  it('adds up what each member paid and owes', () => {
    const { ops } = trip()
    const result = balances(foldOps(GROUP_ID, ops))

    expect(result.get(MINH)).toEqual({
      memberId: MINH,
      paid: 1_200_000,
      share: 340_000,
      sent: 0,
      received: 0,
      net: 860_000,
    })
    expect(result.get(BAO)).toMatchObject({ paid: 160_000, share: 340_000, net: -180_000 })
    expect([...result.values()].map((balance) => balance.net)).toEqual([
      860_000, -340_000, -340_000, -180_000,
    ])
  })

  it('counts payments, and leaves out deleted expenses and payments', () => {
    const { device, ops } = trip()
    const payback = device.op(AN, 'payment', id('payback'), {
      money: { amount: 340_000, from: AN, to: MINH },
      date: '2026-11-03',
    })
    const mistake = expense(device, id('mistake'), 999_000, LINH)
    const undo = device.op(LINH, 'expense', id('mistake'), { deleted: true })
    const wrongPayment = device.op(LINH, 'payment', id('wrong'), {
      money: { amount: 5_000, from: LINH, to: BAO },
      date: '2026-11-03',
    })
    const undoPayment = device.op(LINH, 'payment', id('wrong'), { deleted: true })
    const result = balances(
      foldOps(GROUP_ID, [...ops, payback, mistake, undo, wrongPayment, undoPayment]),
    )

    expect(result.get(AN)).toMatchObject({ sent: 340_000, net: 0 })
    expect(result.get(MINH)).toMatchObject({ received: 340_000, net: 520_000 })
    expect(result.get(LINH)).toMatchObject({ paid: 0, sent: 0, net: -340_000 })
  })

  it('keeps a removed member who is still involved', () => {
    const { device, ops } = trip()
    const removeBao = device.op(MINH, 'member', BAO, { deleted: true })
    expect(balances(foldOps(GROUP_ID, [...ops, removeBao])).get(BAO)?.net).toBe(-180_000)
  })

  it('always sums to zero', () => {
    const spend = fc.record({
      amount: fc.integer({ min: 1, max: 100_000_000 }),
      payer: fc.integer({ min: 0, max: 3 }),
      among: fc.subarray([0, 1, 2, 3], { minLength: 1 }),
      paid: fc.boolean(),
    })
    fc.assert(
      fc.property(fc.array(spend, { maxLength: 40 }), (spends) => {
        const device = new Device('minh')
        const ops = setup(device)
        spends.forEach(({ amount, payer, among, paid }, i) => {
          const by = MEMBERS[payer] ?? MINH
          const to = MEMBERS[(payer + 1) % MEMBERS.length] ?? AN
          ops.push(
            paid
              ? device.op(by, 'payment', id(`pay${i}`), {
                  money: { amount, from: by, to },
                  date: '2026-11-02',
                })
              : expense(device, id(`exp${i}`), amount, by, 'other', {
                  mode: 'equal',
                  among: among.map((m) => MEMBERS[m] ?? MINH),
                }),
          )
        })
        const nets = [...balances(foldOps(GROUP_ID, ops)).values()].map((b) => b.net)
        expect(nets.reduce((sum, net) => sum + net, 0)).toBe(0)
      }),
      { numRuns: 300 },
    )
  })
})

describe('expenseEffect', () => {
  it('shows what the payer lent and what others borrowed', () => {
    const { ops } = trip()
    const dinner = foldOps(GROUP_ID, ops).expenses.get(id('dinner'))
    if (!dinner) throw new Error('dinner missing')

    expect(expenseEffect(dinner, MINH)).toEqual({ paid: 1_200_000, share: 300_000, net: 900_000 })
    expect(expenseEffect(dinner, AN)).toEqual({ paid: 0, share: 300_000, net: -300_000 })
    expect(expenseEffect(dinner, id('stranger'))).toEqual({ paid: 0, share: 0, net: 0 })
  })
})

describe('groupTotal and totalsByCategory', () => {
  it('sum live expenses only', () => {
    const { device, ops } = trip()
    const payback = device.op(AN, 'payment', id('payback'), {
      money: { amount: 340_000, from: AN, to: MINH },
      date: '2026-11-03',
    })
    const hotel = expense(device, id('hotel'), 2_000_000, LINH, 'stay')
    const removeHotel = device.op(LINH, 'expense', id('hotel'), { deleted: true })
    const state = foldOps(GROUP_ID, [...ops, payback, hotel, removeHotel])

    expect(groupTotal(state)).toBe(1_360_000)
    expect([...totalsByCategory(state)]).toEqual([
      ['food', 1_200_000],
      ['transport', 160_000],
    ])
  })
})
