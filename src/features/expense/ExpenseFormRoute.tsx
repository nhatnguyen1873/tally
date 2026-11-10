import { lazy, type SubmitEvent, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import type { Expense } from '../../domain/fold.ts'
import { randomId } from '../../domain/ids.ts'
import { CATEGORIES, type Category, type ExpenseMoney, LIMITS } from '../../domain/model.ts'
import { isValidAmount } from '../../domain/money.ts'
import { splitMembers } from '../../domain/split.ts'
import { stableStringify } from '../../domain/util.ts'
import { todayIso } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { AmountInput } from '../../ui/AmountInput.tsx'
import { Button, ButtonLink } from '../../ui/Button.tsx'
import { Field, SelectField, TextField } from '../../ui/Field.tsx'
import { Trash } from '../../ui/icons.ts'
import { Page, pageStyles } from '../../ui/Page.tsx'
import { useToast } from '../../ui/Toast.tsx'
import { listHref } from '../expenses/list-href.ts'
import { type Group, GroupGate } from '../group/group.tsx'
import { cleanText } from '../group/people.ts'
import { SplitEditor } from './SplitEditor.tsx'
import { draftFrom, newDraft, splitOf } from './split-draft.ts'

// An item's history sits below its form; load it after the form.
const History = lazy(() =>
  import('../activity/History.tsx').then((module) => ({ default: module.History })),
)

export default function ExpenseFormRoute() {
  return <GroupGate>{(group) => <ExpenseScreen group={group} />}</GroupGate>
}

function ExpenseScreen({ group }: { group: Group }) {
  const { t } = useI18n()
  const { expenseId } = useParams<{ expenseId?: string }>()
  const expense = expenseId ? group.state.expenses.get(expenseId) : undefined
  if (expenseId && (!expense || expense.deleted)) {
    const back = listHref(group.id, history.state)
    return (
      <Page
        title={t('expense.missing')}
        heading={t('expense.missing')}
        back={{ href: back, label: t('app.back') }}
      >
        <ButtonLink href={back}>{t('app.back')}</ButtonLink>
      </Page>
    )
  }
  return <ExpenseForm key={expenseId ?? 'new'} group={group} expense={expense ?? null} />
}

function ExpenseForm({ group, expense }: { group: Group; expense: Expense | null }) {
  const { t, money } = useI18n()
  const [, navigate] = useLocation()
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const { people, info } = group
  // Back to the list, with the filters it had when this was opened.
  const [back] = useState(() => listHref(group.id, history.state))

  // Current members, and anyone the expense already involves even if removed since.
  const involved = expense ? [expense.paidBy, ...splitMembers(expense.split)] : []
  const members = people.all.filter((member) => !member.deleted || involved.includes(member.id))
  const memberIds = members.map((member) => member.id)

  const [key] = useState(() => expense?.id ?? randomId())
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [title, setTitle] = useState(expense?.title ?? '')
  const [category, setCategory] = useState<Category>(expense?.category ?? 'other')
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? people.me ?? memberIds[0] ?? '')
  const [date, setDate] = useState(expense?.date ?? todayIso())
  const [draft, setDraft] = useState(() =>
    expense
      ? draftFrom(expense.split, memberIds)
      : newDraft(people.active.map((member) => member.id)),
  )
  const [attempts, setAttempts] = useState(0)
  const [saving, setSaving] = useState(false)

  const result = splitOf(draft, amount, memberIds)
  const errors = {
    amount: !amount ? t('error.amount') : isValidAmount(amount) ? null : t('error.amountTooLarge'),
    title: cleanText(title) ? null : t('error.title'),
    split:
      result.problem === 'nobody'
        ? t('error.splitNobody')
        : result.problem === 'exact'
          ? t('error.splitExact', { amount: money(amount ?? 0, info.currency) })
          : result.problem === 'percent'
            ? t('error.splitPercent')
            : null,
  }
  const shown = attempts > 0

  useEffect(() => {
    if (attempts > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempts])

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (errors.amount || errors.title || errors.split || !result.split || amount === null) {
      setAttempts((count) => count + 1)
      return
    }
    setSaving(true)
    const fields = {
      title: cleanText(title),
      money: { amount, paidBy, split: result.split },
      date,
      category,
    }
    // When editing, write only what changed, so the history shows just that.
    const set = expense ? changed(expense, fields) : fields
    if (Object.keys(set).length > 0) await group.store.write([{ entity: 'expense', key, set }])
    navigate(back, { replace: true })
  }

  async function remove() {
    if (!expense) return
    const id = expense.id
    await group.store.write([{ entity: 'expense', key: id, set: { deleted: true } }])
    navigate(back, { replace: true })
    toast({
      text: t('expense.deleted'),
      action: {
        label: t('action.undo'),
        run: () =>
          void group.store.write([{ entity: 'expense', key: id, set: { deleted: false } }]),
      },
    })
  }

  const heading = expense ? t('expense.editTitle') : t('expense.addTitle')
  return (
    <Page
      title={t('group.pageTitle', { page: heading, group: info.name })}
      heading={heading}
      back={{ href: back, label: t('app.back') }}
    >
      <form
        ref={form}
        className={pageStyles.stack}
        noValidate
        onSubmit={(event) => void save(event)}
      >
        <Field label={t('expense.amount')} error={shown ? errors.amount : null}>
          {(ids) => (
            <AmountInput
              ids={ids}
              digits={info.currency.digits}
              value={amount}
              onValue={setAmount}
            />
          )}
        </Field>
        <TextField
          label={t('expense.title')}
          value={title}
          onValue={setTitle}
          placeholder={t('expense.titlePlaceholder')}
          maxLength={LIMITS.title}
          autoComplete="off"
          error={shown ? errors.title : null}
        />
        <SelectField
          label={t('expense.category')}
          value={category}
          options={CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))}
          onValue={(value) => {
            setCategory(value as Category)
          }}
        />
        <SelectField
          label={t('expense.paidBy')}
          value={paidBy}
          options={members.map((member) => ({ value: member.id, label: people.label(member.id) }))}
          onValue={setPaidBy}
        />
        <TextField
          label={t('expense.date')}
          type="date"
          value={date}
          required
          onValue={(value) => {
            if (value) setDate(value)
          }}
        />
        <SplitEditor
          draft={draft}
          onDraft={setDraft}
          amount={amount}
          members={members}
          currency={info.currency}
          salt={key}
          people={people}
          error={shown ? errors.split : null}
        />
        <Button type="submit" variant="primary" wide disabled={saving}>
          {expense ? t('expense.saveChanges') : t('expense.save')}
        </Button>
        {expense && (
          <Button variant="danger" icon={Trash} wide onClick={() => void remove()}>
            {t('expense.delete')}
          </Button>
        )}
      </form>
      {expense && (
        <Suspense fallback={null}>
          <History group={group} entity="expense" entityKey={expense.id} />
        </Suspense>
      )}
    </Page>
  )
}

/** The fields that differ from the saved expense. */
function changed(
  expense: Expense,
  fields: { title: string; money: ExpenseMoney; date: string; category: Category },
): Record<string, unknown> {
  const set: Record<string, unknown> = {}
  if (fields.title !== expense.title) set.title = fields.title
  const before = { amount: expense.amount, paidBy: expense.paidBy, split: expense.split }
  if (stableStringify(fields.money) !== stableStringify(before)) set.money = fields.money
  if (fields.date !== expense.date) set.date = fields.date
  if (fields.category !== expense.category) set.category = fields.category
  return set
}
