import { describe, expect, it } from 'vitest'

import {
  CATEGORIES,
  isCategory,
  isExpenseMoney,
  isPaymentMoney,
  isValidDate,
  isValidText,
} from './model.ts'
import { id } from './testing.ts'

const A = id('an')
const B = id('bao')

describe('isValidText', () => {
  it('accepts trimmed text up to the limit', () => {
    expect(isValidText('An', 30)).toBe(true)
    expect(isValidText('Đà Lạt trip', 60)).toBe(true)
    expect(isValidText('🍜 Phở', 80)).toBe(true)
    expect(isValidText('x'.repeat(60), 60)).toBe(true)
    expect(isValidText('x'.repeat(61), 60)).toBe(false)
  })

  it('counts characters, not UTF-16 code units', () => {
    expect(isValidText('🍜'.repeat(30), 30)).toBe(true)
    expect(isValidText('🍜'.repeat(31), 30)).toBe(false)
  })

  it('rejects empty, untrimmed and control-character text', () => {
    for (const value of ['', ' An', 'An ', 'A\nB', 'A\u0000B', 'A\u0085B', 5]) {
      expect(isValidText(value, 30)).toBe(false)
    }
  })
})

describe('isValidDate', () => {
  it('accepts real calendar dates', () => {
    for (const date of ['2026-11-02', '2028-02-29', '1900-01-01', '2999-12-31']) {
      expect(isValidDate(date)).toBe(true)
    }
  })

  it('rejects impossible dates, other formats and out-of-range years', () => {
    for (const date of [
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-11-31',
      '1899-12-31',
      '3000-01-01',
      '2026-1-2',
      '2026/11/02',
      20261102,
    ]) {
      expect(isValidDate(date)).toBe(false)
    }
  })
})

describe('isCategory', () => {
  it('accepts the eight categories only', () => {
    for (const category of CATEGORIES) expect(isCategory(category)).toBe(true)
    expect(isCategory('travel')).toBe(false)
    expect(isCategory(undefined)).toBe(false)
  })
})

describe('isExpenseMoney', () => {
  const split = { mode: 'equal', among: [A, B] }

  it('accepts a valid amount, payer and split', () => {
    expect(isExpenseMoney({ amount: 100, paidBy: A, split })).toBe(true)
  })

  it('rejects bad amounts, payers, splits and extra keys', () => {
    expect(isExpenseMoney({ amount: 0, paidBy: A, split })).toBe(false)
    expect(isExpenseMoney({ amount: 100, paidBy: 'someone', split })).toBe(false)
    expect(isExpenseMoney({ amount: 100, paidBy: A })).toBe(false)
    expect(
      isExpenseMoney({ amount: 100, paidBy: A, split: { mode: 'exact', amounts: { [A]: 99 } } }),
    ).toBe(false)
    expect(isExpenseMoney({ amount: 100, paidBy: A, split, currency: 'VND' })).toBe(false)
    expect(isExpenseMoney(null)).toBe(false)
  })
})

describe('isPaymentMoney', () => {
  it('accepts a payment between two different members', () => {
    expect(isPaymentMoney({ amount: 340_000, from: A, to: B })).toBe(true)
  })

  it('rejects paying yourself, bad amounts and extra keys', () => {
    expect(isPaymentMoney({ amount: 340_000, from: A, to: A })).toBe(false)
    expect(isPaymentMoney({ amount: -5, from: A, to: B })).toBe(false)
    expect(isPaymentMoney({ amount: 5, from: A, to: B, note: 'cash' })).toBe(false)
    expect(isPaymentMoney({ amount: 5, from: A })).toBe(false)
  })
})
