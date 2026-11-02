import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { EXACT_LIMIT, settleUp, type Transfer } from './settle.ts'
import { id } from './testing.ts'

const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'].map(id) as [
  string,
  string,
  string,
  string,
  string,
]

/** Balances for `count` people that sum to zero; small values make zero-sum subgroups common. */
function balancesFor(count: { min: number; max: number }, spread = 1000) {
  return fc
    .array(fc.integer({ min: -spread, max: spread }), {
      minLength: count.min - 1,
      maxLength: count.max - 1,
    })
    .map((values) => {
      const nets = [...values, -values.reduce((sum, value) => sum + value, 0)]
      return nets.map((net, i): [string, number] => [`person${String(i).padStart(10, '0')}`, net])
    })
}

/** Every balance after the transfers are paid. */
function settled(nets: readonly [string, number][], transfers: readonly Transfer[]) {
  const left = new Map(nets)
  for (const { from, to, amount } of transfers) {
    left.set(from, (left.get(from) ?? 0) + amount)
    left.set(to, (left.get(to) ?? 0) - amount)
  }
  return [...left.values()]
}

/** The true minimum, by trying every way to split people into zero-sum groups. */
function bruteForceMinimum(nets: readonly number[]): number {
  const values = nets.filter((net) => net !== 0)
  let mostGroups = 0
  const sums: number[] = []
  const place = (i: number) => {
    if (i === values.length) {
      if (sums.every((sum) => sum === 0)) mostGroups = Math.max(mostGroups, sums.length)
      return
    }
    const value = values[i] ?? 0
    for (let group = 0; group < sums.length; group++) {
      sums[group] = (sums[group] ?? 0) + value
      place(i + 1)
      sums[group] = (sums[group] ?? 0) - value
    }
    sums.push(value)
    place(i + 1)
    sums.pop()
  }
  place(0)
  return values.length - mostGroups
}

describe('settleUp', () => {
  it('settles the Đà Lạt trip in three transfers, all to Minh', () => {
    const minh = id('minh')
    const [an, linh, bao] = ['an', 'linh', 'bao'].map(id) as [string, string, string]
    expect(
      settleUp([
        [minh, 860_000],
        [an, -340_000],
        [linh, -340_000],
        [bao, -180_000],
      ]),
    ).toEqual([
      { from: an, to: minh, amount: 340_000 },
      { from: linh, to: minh, amount: 340_000 },
      { from: bao, to: minh, amount: 180_000 },
    ])
  })

  it('finds groups that settle among themselves, where pairing largest with largest would not', () => {
    // C and B cancel out, and so do A, D and E: 3 transfers. Greedy pairing needs 4.
    expect(
      settleUp([
        [A, 4],
        [B, 3],
        [C, -3],
        [D, -2],
        [E, -2],
      ]),
    ).toEqual([
      { from: C, to: B, amount: 3 },
      { from: D, to: A, amount: 2 },
      { from: E, to: A, amount: 2 },
    ])
  })

  it('suggests nothing when everyone is settled', () => {
    expect(settleUp([])).toEqual([])
    expect(
      settleUp([
        [A, 0],
        [B, 0],
      ]),
    ).toEqual([])
  })

  it('always settles everyone, in the fewest possible transfers', () => {
    fc.assert(
      fc.property(balancesFor({ min: 1, max: 7 }, 20), (nets) => {
        const transfers = settleUp(nets)
        expect(settled(nets, transfers).every((left) => left === 0)).toBe(true)
        expect(transfers.length).toBe(bruteForceMinimum(nets.map(([, net]) => net)))
      }),
      { numRuns: 1000 },
    )
  })

  it('only moves money from people who owe to people who are owed', () => {
    fc.assert(
      fc.property(balancesFor({ min: 2, max: EXACT_LIMIT }), (nets) => {
        const net = new Map(nets)
        const transfers = settleUp(nets)
        const unsettled = nets.filter(([, value]) => value !== 0).length
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, unsettled - 1))
        for (const { from, to, amount } of transfers) {
          expect(amount).toBeGreaterThan(0)
          expect(net.get(from)).toBeLessThan(0)
          expect(net.get(to)).toBeGreaterThan(0)
        }
        expect(settled(nets, transfers).every((left) => left === 0)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('falls back to greedy for large groups, still settling everyone', () => {
    fc.assert(
      fc.property(balancesFor({ min: EXACT_LIMIT + 1, max: 50 }), (nets) => {
        const transfers = settleUp(nets)
        const unsettled = nets.filter(([, value]) => value !== 0).length
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, unsettled - 1))
        expect(settled(nets, transfers).every((left) => left === 0)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('stays fast at the exact-search limit', () => {
    const nets = Array.from({ length: EXACT_LIMIT }, (_, i): [string, number] => [
      `person${String(i).padStart(10, '0')}`,
      i < EXACT_LIMIT - 1 ? (i % 2 === 0 ? 1_000 + i : -(997 + i)) : 0,
    ])
    const sum = nets.reduce((total, [, net]) => total + net, 0)
    nets[EXACT_LIMIT - 1] = [`person${String(EXACT_LIMIT - 1).padStart(10, '0')}`, -sum]

    const started = performance.now()
    const transfers = settleUp(nets)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(settled(nets, transfers).every((left) => left === 0)).toBe(true)
  })
})
