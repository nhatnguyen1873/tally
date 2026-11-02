import type { Activity, FieldChange, GroupState } from '../../domain/fold.ts'
import type { Category, ExpenseMoney, PaymentMoney } from '../../domain/model.ts'
import type { Currency } from '../../domain/money.ts'
import { stableStringify } from '../../domain/util.ts'
import type { I18n } from '../../i18n/i18n.ts'
import type { People } from '../group/people.ts'

export interface Described {
  readonly text: string
  /** What changed, one line each: "Amount: 16.000 ₫ → 160.000 ₫". */
  readonly details: readonly string[]
  /** It deleted something that's still deleted, so it can be restored. */
  readonly restorable: boolean
}

/** An activity entry as sentences, from this device's point of view ("You added…"). */
export function describe(
  entry: Activity,
  state: GroupState,
  people: People,
  i18n: I18n,
): Described {
  const { t, money } = i18n
  const currency: Currency = state.group?.currency ?? { code: '', digits: 0 }
  const name = people.subject(entry.by)
  const amount = (value: unknown) => money(Number(value), currency)
  const change = (field: string) => entry.changes.find((item) => item.field === field)
  const plain = (text: string): Described => ({ text, details: [], restorable: false })

  switch (entry.entity) {
    case 'group': {
      if (entry.kind === 'created') return plain(t('activity.group.created', { name }))
      const currencyChange = change('currency')
      if (currencyChange) {
        const code = (currencyChange.after as Currency).code
        return plain(t('activity.group.currency', { name, code }))
      }
      return plain(t('activity.group.renamed', { name, title: String(change('name')?.after) }))
    }

    case 'member': {
      const member = people.name(entry.key)
      if (entry.kind === 'updated') {
        const rename = change('name')
        return plain(
          t('activity.member.renamed', {
            name,
            before: String(rename?.before),
            after: String(rename?.after),
          }),
        )
      }
      // Adding yourself, as a group's creator or someone joining, reads as joining.
      if (entry.kind === 'created' && entry.key === entry.by) {
        return plain(t('activity.member.joined', { name }))
      }
      return {
        text: t(`activity.member.${entry.kind}`, { name, member }),
        details: [],
        restorable: entry.kind === 'deleted' && state.members.get(entry.key)?.deleted === true,
      }
    }

    case 'expense': {
      const expense = state.expenses.get(entry.key)
      const title = expense?.title ?? ''
      const details =
        entry.kind === 'created'
          ? [amount(expense?.amount)]
          : entry.changes.flatMap((item) => expenseChange(item, currency, people, i18n))
      return {
        text: t(`activity.expense.${entry.kind}`, { name, title }),
        details,
        restorable: entry.kind === 'deleted' && expense?.deleted === true,
      }
    }

    case 'payment': {
      const payment = state.payments.get(entry.key)
      const from = payment ? people.name(payment.from) : ''
      const to = payment ? people.name(payment.to) : ''
      const details =
        entry.kind === 'created'
          ? [amount(payment?.amount)]
          : entry.changes.flatMap((item) => paymentChange(item, currency, people, i18n))
      return {
        text: t(`activity.payment.${entry.kind}`, { name, from, to }),
        details,
        restorable: entry.kind === 'deleted' && payment?.deleted === true,
      }
    }
  }
}

function expenseChange(change: FieldChange, currency: Currency, people: People, i18n: I18n) {
  const { t, money, date } = i18n
  switch (change.field) {
    case 'title':
      return [
        t('activity.change.title', { before: String(change.before), after: String(change.after) }),
      ]
    case 'date':
      return [
        t('activity.change.date', {
          before: date(String(change.before)),
          after: date(String(change.after)),
        }),
      ]
    case 'category':
      return [
        t('activity.change.category', {
          before: t(`category.${change.before as Category}`),
          after: t(`category.${change.after as Category}`),
        }),
      ]
    case 'money': {
      const before = change.before as ExpenseMoney
      const after = change.after as ExpenseMoney
      const lines: string[] = []
      if (before.amount !== after.amount) {
        lines.push(
          t('activity.change.amount', {
            before: money(before.amount, currency),
            after: money(after.amount, currency),
          }),
        )
      }
      if (before.paidBy !== after.paidBy) {
        lines.push(
          t('activity.change.paidBy', {
            before: people.name(before.paidBy),
            after: people.name(after.paidBy),
          }),
        )
      }
      if (stableStringify(before.split) !== stableStringify(after.split)) {
        lines.push(t('activity.change.split'))
      }
      return lines
    }
    default:
      return []
  }
}

function paymentChange(change: FieldChange, currency: Currency, people: People, i18n: I18n) {
  const { t, money, date } = i18n
  if (change.field === 'date') {
    return [
      t('activity.change.date', {
        before: date(String(change.before)),
        after: date(String(change.after)),
      }),
    ]
  }
  if (change.field !== 'money') return []
  const before = change.before as PaymentMoney
  const after = change.after as PaymentMoney
  const lines: string[] = []
  if (before.amount !== after.amount) {
    lines.push(
      t('activity.change.amount', {
        before: money(before.amount, currency),
        after: money(after.amount, currency),
      }),
    )
  }
  const pair = (payment: PaymentMoney) =>
    `${people.name(payment.from)} & ${people.name(payment.to)}`
  if (before.from !== after.from || before.to !== after.to) {
    lines.push(t('activity.change.people', { before: pair(before), after: pair(after) }))
  }
  return lines
}
