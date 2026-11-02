import { isId, type MemberId } from './ids.ts'
import { isValidAmount } from './money.ts'
import { compareStrings, hash32, hasOnlyKeys, isRecord } from './util.ts'

export type Split =
  | { readonly mode: 'equal'; readonly among: readonly MemberId[] }
  | { readonly mode: 'exact'; readonly amounts: Readonly<Record<MemberId, number>> }
  | { readonly mode: 'shares'; readonly shares: Readonly<Record<MemberId, number>> }
  | { readonly mode: 'percent'; readonly bps: Readonly<Record<MemberId, number>> }

export const MAX_PARTICIPANTS = 50
export const MAX_SHARES = 99
/** 100% in basis points: percentages keep two decimals. */
export const FULL_PERCENT = 10_000

/** Everyone the split involves, in a fixed order. */
export function splitMembers(split: Split): MemberId[] {
  switch (split.mode) {
    case 'equal':
      return [...split.among].sort(compareStrings)
    case 'exact':
      return Object.keys(split.amounts).sort(compareStrings)
    case 'shares':
      return Object.keys(split.shares).sort(compareStrings)
    case 'percent':
      return Object.keys(split.bps).sort(compareStrings)
  }
}

/** Checks a split's shape, and that it adds up for `amount`. */
export function isValidSplit(value: unknown, amount: number): value is Split {
  if (!isRecord(value) || !isValidAmount(amount)) return false
  switch (value.mode) {
    case 'equal': {
      const among = value.among
      return (
        hasOnlyKeys(value, ['mode', 'among']) &&
        Array.isArray(among) &&
        among.length >= 1 &&
        among.length <= MAX_PARTICIPANTS &&
        among.every(isId) &&
        new Set(among).size === among.length
      )
    }
    case 'exact':
      return hasOnlyKeys(value, ['mode', 'amounts']) && weightsSum(value.amounts, amount) === amount
    case 'shares':
      return hasOnlyKeys(value, ['mode', 'shares']) && weightsSum(value.shares, MAX_SHARES) !== null
    case 'percent':
      return (
        hasOnlyKeys(value, ['mode', 'bps']) && weightsSum(value.bps, FULL_PERCENT) === FULL_PERCENT
      )
    default:
      return false
  }
}

/** Sum of a member → whole-number weight record, or null if any entry is invalid. */
function weightsSum(value: unknown, max: number): number | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.length < 1 || entries.length > MAX_PARTICIPANTS) return null
  let sum = 0
  for (const [id, weight] of entries) {
    if (!isId(id) || !Number.isSafeInteger(weight)) return null
    if ((weight as number) < 1 || (weight as number) > max) return null
    sum += weight as number
  }
  return sum
}

/**
 * Each participant's part of `amount`, in minor units, summing exactly to
 * `amount`. Proportional splits use the largest-remainder method: everyone
 * gets the floor of their exact share, and the leftover units go to the
 * largest fractional remainders. Ties are broken by a hash of `salt` (the
 * expense ID) and the member ID, so the extra đồng lands on different people
 * across expenses instead of always the same one.
 */
export function allocate(amount: number, split: Split, salt: string): Map<MemberId, number> {
  switch (split.mode) {
    case 'exact':
      return new Map(sortedEntries(split.amounts))
    case 'equal':
      return largestRemainder(
        amount,
        splitMembers(split).map((id) => [id, 1]),
        salt,
      )
    case 'shares':
      return largestRemainder(amount, sortedEntries(split.shares), salt)
    case 'percent':
      return largestRemainder(amount, sortedEntries(split.bps), salt)
  }
}

function sortedEntries(record: Readonly<Record<MemberId, number>>): [MemberId, number][] {
  return Object.entries(record).sort(([a], [b]) => compareStrings(a, b))
}

function largestRemainder(
  amount: number,
  weights: readonly [MemberId, number][],
  salt: string,
): Map<MemberId, number> {
  const total = BigInt(weights.reduce((sum, [, weight]) => sum + weight, 0))
  const big = BigInt(amount)
  const rows = weights.map(([id, weight]) => {
    const product = big * BigInt(weight)
    return {
      id,
      part: Number(product / total),
      remainder: product % total,
      tie: hash32(`${salt}:${id}`),
    }
  })

  let leftover = amount - rows.reduce((sum, row) => sum + row.part, 0)
  const byRemainder = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1
    return a.tie - b.tie || compareStrings(a.id, b.id)
  })
  for (const row of byRemainder) {
    if (leftover === 0) break
    row.part += 1
    leftover -= 1
  }

  return new Map(rows.map((row) => [row.id, row.part]))
}
