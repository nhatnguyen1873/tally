import type { Expense, GroupState } from './fold.ts'
import type { MemberId } from './ids.ts'
import { CATEGORIES, type Category } from './model.ts'
import { allocate } from './split.ts'

export interface Balance {
  readonly memberId: MemberId
  /** Expenses this member paid for. */
  readonly paid: number
  /** This member's part of every expense. */
  readonly share: number
  /** Payments this member made to others. */
  readonly sent: number
  /** Payments others made to this member. */
  readonly received: number
  /** Positive: the group owes them. Negative: they owe the group. */
  readonly net: number
}

interface Totals {
  paid: number
  share: number
  sent: number
  received: number
}

/**
 * Every member's totals over live expenses and payments, in member order.
 * All amounts are integers, so the nets always sum to exactly zero.
 */
export function balances(state: GroupState): Map<MemberId, Balance> {
  const totals = new Map<MemberId, Totals>()
  const of = (id: MemberId): Totals => {
    let row = totals.get(id)
    if (!row) {
      row = { paid: 0, share: 0, sent: 0, received: 0 }
      totals.set(id, row)
    }
    return row
  }
  for (const id of state.members.keys()) of(id)

  for (const expense of state.expenses.values()) {
    if (expense.deleted) continue
    of(expense.paidBy).paid += expense.amount
    for (const [id, part] of allocate(expense.amount, expense.split, expense.id)) {
      of(id).share += part
    }
  }
  for (const payment of state.payments.values()) {
    if (payment.deleted) continue
    of(payment.from).sent += payment.amount
    of(payment.to).received += payment.amount
  }

  return new Map(
    [...totals].map(([memberId, row]) => [
      memberId,
      { memberId, ...row, net: row.paid - row.share + row.sent - row.received },
    ]),
  )
}

/** One expense from one member's side: `net` > 0 means they lent, < 0 that they borrowed. */
export function expenseEffect(
  expense: Expense,
  memberId: MemberId,
): { paid: number; share: number; net: number } {
  const paid = expense.paidBy === memberId ? expense.amount : 0
  const share = allocate(expense.amount, expense.split, expense.id).get(memberId) ?? 0
  return { paid, share, net: paid - share }
}

/** What the group spent. Payments only move money between members, so they don't count. */
export function groupTotal(state: GroupState): number {
  let total = 0
  for (const expense of state.expenses.values()) if (!expense.deleted) total += expense.amount
  return total
}

/** Spending per category, in the standard category order, leaving out empty ones. */
export function totalsByCategory(state: GroupState): Map<Category, number> {
  const totals = new Map<Category, number>(CATEGORIES.map((category) => [category, 0]))
  for (const expense of state.expenses.values()) {
    if (!expense.deleted) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
    }
  }
  return new Map([...totals].filter(([, total]) => total > 0))
}
