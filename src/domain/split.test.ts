import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { MAX_AMOUNT } from './money.ts'
import {
  allocate,
  FULL_PERCENT,
  isValidSplit,
  MAX_PARTICIPANTS,
  MAX_SHARES,
  type Split,
  splitMembers,
} from './split.ts'

const A = 'aaaaaaaaaaaaaaaa'
const B = 'bbbbbbbbbbbbbbbb'
const C = 'cccccccccccccccc'

const memberId = fc.stringMatching(/^[A-Za-z0-9_-]{16}$/)
const salt = fc.stringMatching(/^[A-Za-z0-9_-]{16}$/)

/** Splits `total` into `count` positive parts at random cut points. */
function positiveParts(total: number, count: number): fc.Arbitrary<number[]> {
  return fc
    .uniqueArray(fc.integer({ min: 1, max: total - 1 }), {
      minLength: count - 1,
      maxLength: count - 1,
    })
    .map((cuts) => {
      const points = [0, ...cuts.sort((a, b) => a - b), total]
      return points.slice(1).map((point, i) => point - (points[i] ?? 0))
    })
}

function record(ids: readonly string[], values: readonly number[]): Record<string, number> {
  return Object.fromEntries(ids.map((id, i) => [id, values[i] ?? 0]))
}

/** A valid split of a random mode over 1–50 members, with an amount that fits it. */
const amountAndSplit: fc.Arbitrary<{ amount: number; split: Split }> = fc
  .uniqueArray(memberId, { minLength: 1, maxLength: MAX_PARTICIPANTS })
  .chain((ids) =>
    fc.oneof(
      fc.record({
        amount: fc.integer({ min: 1, max: MAX_AMOUNT }),
        split: fc.constant<Split>({ mode: 'equal', among: ids }),
      }),
      fc.record({
        amount: fc.integer({ min: 1, max: MAX_AMOUNT }),
        split: fc
          .array(fc.integer({ min: 1, max: MAX_SHARES }), {
            minLength: ids.length,
            maxLength: ids.length,
          })
          .map((shares): Split => ({ mode: 'shares', shares: record(ids, shares) })),
      }),
      fc.record({
        amount: fc.integer({ min: 1, max: MAX_AMOUNT }),
        split: (ids.length === 1
          ? fc.constant([FULL_PERCENT])
          : positiveParts(FULL_PERCENT, ids.length)
        ).map((bps): Split => ({ mode: 'percent', bps: record(ids, bps) })),
      }),
      fc.integer({ min: Math.max(ids.length, 2), max: MAX_AMOUNT }).chain((amount) =>
        (ids.length === 1 ? fc.constant([amount]) : positiveParts(amount, ids.length)).map(
          (amounts): { amount: number; split: Split } => ({
            amount,
            split: { mode: 'exact', amounts: record(ids, amounts) },
          }),
        ),
      ),
    ),
  )

function weightOf(split: Split, id: string): number {
  switch (split.mode) {
    case 'equal':
      return 1
    case 'exact':
      return split.amounts[id] ?? 0
    case 'shares':
      return split.shares[id] ?? 0
    case 'percent':
      return split.bps[id] ?? 0
  }
}

describe('allocate', () => {
  it('always sums exactly to the amount, with no negative parts', () => {
    fc.assert(
      fc.property(amountAndSplit, salt, ({ amount, split }, expenseId) => {
        expect(isValidSplit(split, amount)).toBe(true)
        const parts = allocate(amount, split, expenseId)
        expect([...parts.keys()]).toEqual(splitMembers(split))
        expect([...parts.values()].reduce((sum, part) => sum + part, 0)).toBe(amount)
        for (const part of parts.values()) expect(part).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 500 },
    )
  })

  it('keeps every part within one unit of its exact proportional share', () => {
    fc.assert(
      fc.property(amountAndSplit, salt, ({ amount, split }, expenseId) => {
        const parts = allocate(amount, split, expenseId)
        const ids = splitMembers(split)
        const total = BigInt(ids.reduce((sum, id) => sum + weightOf(split, id), 0))
        for (const id of ids) {
          // |part − amount × weight / total| < 1, compared exactly in integers.
          const scaledPart = BigInt(parts.get(id) ?? 0) * total
          const exact = BigInt(amount) * BigInt(weightOf(split, id))
          const gap = scaledPart > exact ? scaledPart - exact : exact - scaledPart
          expect(gap < total).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('does not depend on the order members were listed in', () => {
    fc.assert(
      fc.property(amountAndSplit, salt, ({ amount, split }, expenseId) => {
        const reversed: Split =
          split.mode === 'equal'
            ? { mode: 'equal', among: [...split.among].reverse() }
            : split.mode === 'exact'
              ? {
                  mode: 'exact',
                  amounts: Object.fromEntries(Object.entries(split.amounts).reverse()),
                }
              : split.mode === 'shares'
                ? {
                    mode: 'shares',
                    shares: Object.fromEntries(Object.entries(split.shares).reverse()),
                  }
                : { mode: 'percent', bps: Object.fromEntries(Object.entries(split.bps).reverse()) }
        expect(allocate(amount, reversed, expenseId)).toEqual(allocate(amount, split, expenseId))
      }),
    )
  })

  it('splits 100,000₫ three ways as 33,334 + 33,333 + 33,333', () => {
    const parts = allocate(100_000, { mode: 'equal', among: [A, B, C] }, 'expense000000001')
    expect([...parts.values()].sort((a, b) => b - a)).toEqual([33_334, 33_333, 33_333])
  })

  it('rotates the leftover unit across expenses instead of always charging one person', () => {
    const extraGoesTo = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const parts = allocate(
        100_000,
        { mode: 'equal', among: [A, B, C] },
        `expense${String(i).padStart(9, '0')}`,
      )
      for (const [id, part] of parts) if (part === 33_334) extraGoesTo.add(id)
    }
    expect(extraGoesTo).toEqual(new Set([A, B, C]))
  })

  it('gives leftover units to the largest remainders first', () => {
    // 999 × 50% = 499.5, × 30% = 299.7, × 20% = 199.8: the .8 and .7 round up.
    const parts = allocate(
      999,
      { mode: 'percent', bps: { [A]: 5000, [B]: 3000, [C]: 2000 } },
      'x'.repeat(16),
    )
    expect(Object.fromEntries(parts)).toEqual({ [A]: 499, [B]: 300, [C]: 200 })
  })

  it('weights shares', () => {
    const parts = allocate(
      1_000,
      { mode: 'shares', shares: { [A]: 2, [B]: 1, [C]: 1 } },
      'x'.repeat(16),
    )
    expect(Object.fromEntries(parts)).toEqual({ [A]: 500, [B]: 250, [C]: 250 })
  })

  it('passes exact amounts through unchanged', () => {
    const parts = allocate(
      1_000,
      { mode: 'exact', amounts: { [B]: 700, [A]: 300 } },
      'x'.repeat(16),
    )
    expect([...parts]).toEqual([
      [A, 300],
      [B, 700],
    ])
  })

  it('can leave someone at zero when there are fewer units than people', () => {
    const parts = allocate(2, { mode: 'equal', among: [A, B, C] }, 'x'.repeat(16))
    expect([...parts.values()].sort()).toEqual([0, 1, 1])
  })
})

describe('isValidSplit', () => {
  it('accepts well-formed splits', () => {
    expect(isValidSplit({ mode: 'equal', among: [A, B] }, 100)).toBe(true)
    expect(isValidSplit({ mode: 'exact', amounts: { [A]: 60, [B]: 40 } }, 100)).toBe(true)
    expect(isValidSplit({ mode: 'shares', shares: { [A]: 99, [B]: 1 } }, 100)).toBe(true)
    expect(isValidSplit({ mode: 'percent', bps: { [A]: 3333, [B]: 6667 } }, 100)).toBe(true)
  })

  it('rejects equal splits with no one, duplicates, bad IDs or extra keys', () => {
    expect(isValidSplit({ mode: 'equal', among: [] }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'equal', among: [A, A] }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'equal', among: ['bad id'] }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'equal', among: A }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'equal', among: [A], extra: 1 }, 100)).toBe(false)
    const tooMany = Array.from(
      { length: MAX_PARTICIPANTS + 1 },
      (_, i) => `member${String(i).padStart(10, '0')}`,
    )
    expect(isValidSplit({ mode: 'equal', among: tooMany }, 100)).toBe(false)
  })

  it('rejects exact amounts that do not add up', () => {
    expect(isValidSplit({ mode: 'exact', amounts: { [A]: 60, [B]: 30 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'exact', amounts: { [A]: 100, [B]: 0 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'exact', amounts: { [A]: 150, [B]: -50 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'exact', amounts: {} }, 100)).toBe(false)
  })

  it('rejects shares outside 1–99 and percentages that do not total 100%', () => {
    expect(isValidSplit({ mode: 'shares', shares: { [A]: 0 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'shares', shares: { [A]: 100 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'shares', shares: { [A]: 1.5 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'percent', bps: { [A]: 5000, [B]: 4999 } }, 100)).toBe(false)
    expect(isValidSplit({ mode: 'percent', bps: { [A]: 10_001 } }, 100)).toBe(false)
  })

  it('rejects unknown modes, non-objects and invalid amounts', () => {
    expect(isValidSplit({ mode: 'weird' }, 100)).toBe(false)
    expect(isValidSplit(null, 100)).toBe(false)
    expect(isValidSplit([A], 100)).toBe(false)
    expect(isValidSplit({ mode: 'equal', among: [A] }, 0)).toBe(false)
    expect(isValidSplit({ mode: 'shares', shares: [5] }, 100)).toBe(false)
  })
})
