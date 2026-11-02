import type { Expense, GroupState, Payment } from '../../domain/fold.ts'
import type { MemberId } from '../../domain/ids.ts'
import { type Category, isCategory } from '../../domain/model.ts'
import { matchesSearch } from '../../domain/search.ts'
import { splitMembers } from '../../domain/split.ts'
import { compareStrings } from '../../domain/util.ts'

export type Item =
  | { readonly kind: 'expense'; readonly expense: Expense }
  | { readonly kind: 'payment'; readonly payment: Payment }

/** Kept in the URL (?q=&p=&m=&c=&t=), so Back and reload keep them. */
export interface Filters {
  readonly query: string
  /** A member ID, or empty for anyone. */
  readonly person: string
  /** YYYY-MM */
  readonly month: string
  readonly category: Category | ''
  readonly type: '' | 'expenses' | 'payments'
}

export const NO_FILTERS: Filters = { query: '', person: '', month: '', category: '', type: '' }

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search)
  const month = params.get('m') ?? ''
  const category = params.get('c') ?? ''
  const type = params.get('t') ?? ''
  return {
    query: params.get('q') ?? '',
    person: params.get('p') ?? '',
    month: /^\d{4}-\d{2}$/.test(month) ? month : '',
    category: isCategory(category) ? category : '',
    type: type === 'expenses' || type === 'payments' ? type : '',
  }
}

export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams()
  const entries: [string, string][] = [
    ['q', filters.query],
    ['p', filters.person],
    ['m', filters.month],
    ['c', filters.category],
    ['t', filters.type],
  ]
  for (const [key, value] of entries) if (value) params.set(key, value)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function isFiltered(filters: Filters): boolean {
  return Object.values(filters).some(Boolean)
}

export function dateOf(item: Item): string {
  return item.kind === 'expense' ? item.expense.date : item.payment.date
}

function createdAtOf(item: Item): string {
  return item.kind === 'expense' ? item.expense.createdAt : item.payment.createdAt
}

export function keyOf(item: Item): string {
  return item.kind === 'expense' ? item.expense.id : item.payment.id
}

/** Live expenses and payments, newest date first, then most recently added. */
export function listItems(state: GroupState): Item[] {
  const items: Item[] = []
  for (const expense of state.expenses.values()) {
    if (!expense.deleted) items.push({ kind: 'expense', expense })
  }
  for (const payment of state.payments.values()) {
    if (!payment.deleted) items.push({ kind: 'payment', payment })
  }
  return items.sort(
    (a, b) =>
      compareStrings(dateOf(b), dateOf(a)) || compareStrings(createdAtOf(b), createdAtOf(a)),
  )
}

/** Whether an item passes the filters. Search covers titles and people's names. */
export function itemMatches(item: Item, filters: Filters, name: (id: MemberId) => string) {
  if (filters.type === 'expenses' && item.kind !== 'expense') return false
  if (filters.type === 'payments' && item.kind !== 'payment') return false
  if (filters.month && !dateOf(item).startsWith(filters.month)) return false

  if (item.kind === 'expense') {
    const { expense } = item
    if (filters.category && expense.category !== filters.category) return false
    const involved = [expense.paidBy, ...splitMembers(expense.split)]
    if (filters.person && !involved.includes(filters.person)) return false
    return matchesSearch(`${expense.title} ${name(expense.paidBy)}`, filters.query)
  }

  const { payment } = item
  if (filters.category) return false
  if (filters.person && payment.from !== filters.person && payment.to !== filters.person) {
    return false
  }
  return matchesSearch(`${name(payment.from)} ${name(payment.to)}`, filters.query)
}

/** Months that have items, newest first, as YYYY-MM. */
export function monthsOf(items: readonly Item[]): string[] {
  return [...new Set(items.map((item) => dateOf(item).slice(0, 7)))].sort().reverse()
}

/** Items grouped under their date, keeping their order. */
export function byDay(items: readonly Item[]): { date: string; items: Item[] }[] {
  const days: { date: string; items: Item[] }[] = []
  for (const item of items) {
    const date = dateOf(item)
    const last = days.at(-1)
    if (last?.date === date) last.items.push(item)
    else days.push({ date, items: [item] })
  }
  return days
}
