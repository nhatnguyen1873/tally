import type { MemberId } from './ids.ts'
import { MAX_AMOUNT } from './money.ts'

export interface Transfer {
  readonly from: MemberId
  readonly to: MemberId
  readonly amount: number
}

/** Beyond this many people with unsettled balances, the exact search (2^n) gives way to greedy. */
export const EXACT_LIMIT = 18

interface Person {
  readonly id: MemberId
  readonly net: number
  /** Position in member order, used to break ties identically on every device. */
  readonly order: number
}

/**
 * The fewest transfers that settle every balance. `nets` gives each member's
 * net balance in member order (positive: owed money).
 *
 * People who settle among themselves form a group whose balances sum to zero,
 * and a group of k people always settles in k − 1 transfers. So the minimum
 * is the number of people with a balance minus the most zero-sum groups they
 * can be split into. An exact search over subsets finds those groups for up
 * to EXACT_LIMIT people; beyond that, everyone is settled as one group.
 */
export function settleUp(nets: Iterable<readonly [MemberId, number]>): Transfer[] {
  const people: Person[] = []
  let order = 0
  for (const [id, net] of nets) {
    if (net !== 0) people.push({ id, net, order })
    order++
  }

  const groups = people.length <= EXACT_LIMIT ? zeroSumGroups(people) : [people]
  return groups
    .flatMap(settleGroup)
    .sort((a, b) => a.from.order - b.from.order || a.to.order - b.to.order)
    .map(({ from, to, amount }) => ({ from: from.id, to: to.id, amount }))
}

/**
 * Splits `people` into the most groups that each sum to zero.
 *
 * best[mask] is the most zero-sum groups that the people in `mask` can be
 * split into if they're settled in some order, adding one person at a time:
 * each time the running total hits zero, a group closes. Walking back from
 * the full set recovers one such order, and with it the groups.
 */
function zeroSumGroups(people: readonly Person[]): Person[][] {
  const size = 1 << people.length
  const full = size - 1
  const sums = new Float64Array(size)
  const best = new Uint8Array(size)
  // Typed arrays are read within bounds; noUncheckedIndexedAccess can't see that.
  const read = (array: Float64Array | Uint8Array, index: number) => array[index] ?? 0

  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask
    sums[mask] = read(sums, mask ^ low) + (people[31 - Math.clz32(low)]?.net ?? 0)
    let most = 0
    for (let rest = mask; rest !== 0; rest &= rest - 1) {
      most = Math.max(most, read(best, mask ^ (rest & -rest)))
    }
    best[mask] = most + (read(sums, mask) === 0 ? 1 : 0)
  }

  const groups: number[] = []
  let group = 0
  for (let mask = full; mask !== 0;) {
    const target = read(best, mask) - (read(sums, mask) === 0 ? 1 : 0)
    // Take out the first person whose removal still allows the best count.
    let bit = 0
    for (let rest = mask; rest !== 0; rest &= rest - 1) {
      bit = rest & -rest
      if (read(best, mask ^ bit) === target) break
    }
    mask ^= bit
    group |= bit
    if (mask === 0 || read(sums, mask) === 0) {
      groups.push(group)
      group = 0
    }
  }
  return groups.map((bits) => people.filter((_, i) => (bits & (1 << i)) !== 0))
}

interface Pending {
  readonly person: Person
  left: number
}

/** Settles a zero-sum group in k − 1 transfers: the largest debtor pays the largest creditor. */
function settleGroup(group: readonly Person[]): { from: Person; to: Person; amount: number }[] {
  const byLargest = (a: Pending, b: Pending) => b.left - a.left || a.person.order - b.person.order
  const owed = group.filter((p) => p.net > 0).map((person) => ({ person, left: person.net }))
  const owing = group.filter((p) => p.net < 0).map((person) => ({ person, left: -person.net }))
  const transfers: { from: Person; to: Person; amount: number }[] = []

  for (;;) {
    owed.sort(byLargest)
    owing.sort(byLargest)
    const [creditor] = owed
    const [debtor] = owing
    if (!creditor || !debtor) return transfers
    const amount = Math.min(creditor.left, debtor.left)
    transfers.push({ from: debtor.person, to: creditor.person, amount })
    creditor.left -= amount
    debtor.left -= amount
    if (creditor.left === 0) owed.shift()
    if (debtor.left === 0) owing.shift()
  }
}

/**
 * The payments that record a transfer in full. One payment holds at most
 * MAX_AMOUNT, and a debt built from several expenses can be larger, so such a
 * transfer becomes several payments that add up to it.
 */
export function transferPayments(amount: number): number[] {
  const parts: number[] = []
  for (let left = amount; left > 0; left -= MAX_AMOUNT) parts.push(Math.min(left, MAX_AMOUNT))
  return parts
}
