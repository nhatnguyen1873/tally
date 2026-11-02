import type { GroupState, Member } from './fold.ts'
import type { MemberId } from './ids.ts'
import { splitMembers } from './split.ts'

/**
 * Names to show. Two people can add the same name while offline; the later
 * one becomes "An (2)", numbered in the order members were added.
 */
export function displayNames(members: ReadonlyMap<MemberId, Member>): Map<MemberId, string> {
  const counts = new Map<string, number>()
  const names = new Map<MemberId, string>()
  for (const member of members.values()) {
    const key = member.name.toLowerCase()
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    names.set(member.id, count === 1 ? member.name : `${member.name} (${count})`)
  }
  return names
}

/** Whether a live expense or payment involves the member. If so, they can't be removed. */
export function isInvolved(state: GroupState, memberId: MemberId): boolean {
  for (const expense of state.expenses.values()) {
    if (expense.deleted) continue
    if (expense.paidBy === memberId || splitMembers(expense.split).includes(memberId)) return true
  }
  for (const payment of state.payments.values()) {
    if (!payment.deleted && (payment.from === memberId || payment.to === memberId)) return true
  }
  return false
}
