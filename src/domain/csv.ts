import type { GroupState } from './fold.ts'
import type { MemberId } from './ids.ts'
import type { Category } from './model.ts'
import { minorToDecimal } from './money.ts'
import { allocate } from './split.ts'
import { compareStrings } from './util.ts'

export interface CsvLabels {
  readonly date: string
  readonly type: string
  readonly title: string
  readonly category: string
  readonly amount: string
  readonly currency: string
  readonly from: string
  readonly to: string
  readonly expense: string
  readonly payment: string
  readonly categories: Readonly<Record<Category, string>>
}

/**
 * Quotes a cell per RFC 4180 when it needs it. A leading =, +, -, @ or tab
 * would make a spreadsheet run the cell as a formula, so it gets an apostrophe.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/**
 * Every live expense and payment, oldest first, with one column per member
 * for their share of each expense. Amounts are plain decimal numbers.
 */
export function groupCsv(
  state: GroupState,
  names: ReadonlyMap<MemberId, string>,
  labels: CsvLabels,
): string {
  const currency = state.group?.currency ?? { code: '', digits: 0 }
  const plain = (amount: number) => minorToDecimal(amount, currency.digits)
  const name = (id: MemberId) => names.get(id) ?? ''
  const members = [...state.members.keys()]

  const rows: { date: string; createdAt: string; cells: string[] }[] = []
  for (const expense of state.expenses.values()) {
    if (expense.deleted) continue
    const parts = allocate(expense.amount, expense.split, expense.id)
    rows.push({
      date: expense.date,
      createdAt: expense.createdAt,
      cells: [
        expense.date,
        labels.expense,
        expense.title,
        labels.categories[expense.category],
        plain(expense.amount),
        currency.code,
        name(expense.paidBy),
        '',
        ...members.map((id) => {
          const part = parts.get(id)
          return part === undefined ? '' : plain(part)
        }),
      ],
    })
  }
  for (const payment of state.payments.values()) {
    if (payment.deleted) continue
    rows.push({
      date: payment.date,
      createdAt: payment.createdAt,
      cells: [
        payment.date,
        labels.payment,
        '',
        '',
        plain(payment.amount),
        currency.code,
        name(payment.from),
        name(payment.to),
        ...members.map(() => ''),
      ],
    })
  }
  rows.sort((a, b) => compareStrings(a.date, b.date) || compareStrings(a.createdAt, b.createdAt))

  const header = [
    labels.date,
    labels.type,
    labels.title,
    labels.category,
    labels.amount,
    labels.currency,
    labels.from,
    labels.to,
    ...members.map(name),
  ]
  return [header, ...rows.map((row) => row.cells)]
    .map((line) => line.map(cell).join(','))
    .join('\r\n')
}
