import { describe, expect, it } from 'vitest'

import { type CsvLabels, groupCsv } from './csv.ts'
import { foldOps } from './fold.ts'
import { displayNames } from './members.ts'
import { Device, GROUP_ID, id, VND } from './testing.ts'

const MINH = id('minh')
const AN = id('an')

const labels: CsvLabels = {
  date: 'Date',
  type: 'Type',
  title: 'Description',
  category: 'Category',
  amount: 'Amount',
  currency: 'Currency',
  from: 'Paid by / From',
  to: 'To',
  expense: 'Expense',
  payment: 'Payment',
  categories: {
    food: 'Food & drink',
    groceries: 'Groceries',
    transport: 'Transport',
    stay: 'Accommodation',
    activities: 'Activities',
    shopping: 'Shopping',
    bills: 'Bills',
    other: 'Other',
  },
}

function csvFor(currency = VND) {
  const device = new Device('minh')
  const ops = [
    device.op(MINH, 'group', GROUP_ID, { name: 'Trip', currency }),
    device.op(MINH, 'member', MINH, { name: 'Minh' }),
    device.op(MINH, 'member', AN, { name: '=An' }),
    device.op(MINH, 'expense', id('taxi'), {
      title: 'Taxi, "fast"',
      money: { amount: 160_000, paidBy: AN, split: { mode: 'equal', among: [MINH, AN] } },
      date: '2026-11-03',
      category: 'transport',
    }),
    device.op(MINH, 'expense', id('dinner'), {
      title: 'Phở',
      money: { amount: 1_200_001, paidBy: MINH, split: { mode: 'equal', among: [MINH, AN] } },
      date: '2026-11-02',
      category: 'food',
    }),
    device.op(MINH, 'payment', id('pay'), {
      money: { amount: 50_000, from: AN, to: MINH },
      date: '2026-11-03',
    }),
    device.op(MINH, 'expense', id('gone'), {
      title: 'Deleted',
      money: { amount: 5, paidBy: MINH, split: { mode: 'equal', among: [MINH] } },
      date: '2026-11-01',
      category: 'other',
    }),
    device.op(MINH, 'expense', id('gone'), { deleted: true }),
  ]
  const state = foldOps(GROUP_ID, ops)
  return groupCsv(state, displayNames(state.members), labels)
}

describe('groupCsv', () => {
  it('lists live expenses and payments by date, with each member’s share', () => {
    const lines = csvFor().split('\r\n')
    expect(lines[0]).toBe(
      "Date,Type,Description,Category,Amount,Currency,Paid by / From,To,Minh,'=An",
    )
    expect(lines[1]?.startsWith('2026-11-02,Expense,Phở,Food & drink,1200001,VND,Minh,,')).toBe(
      true,
    )
    const [minhShare, anShare] = (lines[1] ?? '').split(',').slice(-2).map(Number)
    expect((minhShare ?? 0) + (anShare ?? 0)).toBe(1_200_001)
    expect(lines[2]).toBe(
      `2026-11-03,Expense,"Taxi, ""fast""",Transport,160000,VND,'=An,,80000,80000`,
    )
    expect(lines[3]).toBe("2026-11-03,Payment,,,50000,VND,'=An,Minh,,")
    expect(lines).toHaveLength(4)
  })

  it('writes decimal currencies as plain numbers', () => {
    const lines = csvFor({ code: 'USD', digits: 2 }).split('\r\n')
    expect(lines[2]).toContain(',1600.00,USD,')
  })
})
