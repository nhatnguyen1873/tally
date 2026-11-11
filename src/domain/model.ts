import { isId, type MemberId } from './ids.ts'
import { isValidAmount } from './money.ts'
import { isValidSplit, type Split } from './split.ts'
import { hasOnlyKeys, isRecord } from './util.ts'

export const CATEGORIES = [
  'food',
  'groceries',
  'transport',
  'stay',
  'activities',
  'shopping',
  'bills',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

export const LIMITS = {
  groupName: 60,
  memberName: 30,
  title: 80,
  members: 50,
  /** Fewest current members a group can be left with by removing someone. */
  minMembers: 2,
} as const

/** Amount, payer and split change together, so a split always matches its amount. */
export interface ExpenseMoney {
  readonly amount: number
  readonly paidBy: MemberId
  readonly split: Split
}

export interface PaymentMoney {
  readonly amount: number
  readonly from: MemberId
  readonly to: MemberId
}

/**
 * Trimmed text of 1 to `max` characters, without control characters.
 *
 * Every device must agree on what's valid, so this avoids checks that depend
 * on a platform's Unicode version, such as normalization or grapheme
 * clusters. It counts code points instead, and the UI normalizes input to NFC.
 */
export function isValidText(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || value !== value.trim() || /\p{Cc}/u.test(value)) return false
  let length = 0
  for (const _ of value) length++
  return length >= 1 && length <= max
}

/** The first and last dates an expense or payment can have, for date fields. */
export const DATE_RANGE = { min: '1900-01-01', max: '2999-12-31' } as const

/** A real calendar date written as YYYY-MM-DD, within DATE_RANGE. */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 2999) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}

export function isExpenseMoney(value: unknown): value is ExpenseMoney {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['amount', 'paidBy', 'split']) &&
    isValidAmount(value.amount) &&
    isId(value.paidBy) &&
    isValidSplit(value.split, value.amount)
  )
}

export function isPaymentMoney(value: unknown): value is PaymentMoney {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['amount', 'from', 'to']) &&
    isValidAmount(value.amount) &&
    isId(value.from) &&
    isId(value.to) &&
    value.from !== value.to
  )
}
