import { lazy, type SubmitEvent, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'

import type { Payment } from '../../domain/fold.ts'
import { randomId } from '../../domain/ids.ts'
import { isValidAmount } from '../../domain/money.ts'
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

// An item's history sits below its form; load it after the form.
const History = lazy(() =>
  import('../activity/History.tsx').then((module) => ({ default: module.History })),
)

export default function PaymentFormRoute() {
  return <GroupGate>{(group) => <PaymentScreen group={group} />}</GroupGate>
}

function PaymentScreen({ group }: { group: Group }) {
  const { t } = useI18n()
  const { paymentId } = useParams<{ paymentId?: string }>()
  const payment = paymentId ? group.state.payments.get(paymentId) : undefined
  if (paymentId && (!payment || payment.deleted)) {
    const back = listHref(group.id, history.state)
    return (
      <Page
        title={t('payment.missing')}
        heading={t('payment.missing')}
        back={{ href: back, label: t('app.back') }}
      >
        <ButtonLink href={back}>{t('app.back')}</ButtonLink>
      </Page>
    )
  }
  return <PaymentForm key={paymentId ?? 'new'} group={group} payment={payment ?? null} />
}

function PaymentForm({ group, payment }: { group: Group; payment: Payment | null }) {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const { people, info } = group

  // Settle-up's "Other amount" opens this prefilled: ?from=&to=&amount=&back=balances
  const prefill = new URLSearchParams(useSearch())
  // Back to Balances, or to the list with the filters it had when this was opened.
  const [list] = useState(() => listHref(group.id, history.state))
  const back = prefill.get('back') === 'balances' ? `/g/${group.id}/balances` : list
  const members = people.all.filter(
    (member) => !member.deleted || member.id === payment?.from || member.id === payment?.to,
  )
  const isMember = (id: string | null) => members.some((member) => member.id === id)
  const prefillFrom = prefill.get('from')
  const prefillTo = prefill.get('to')
  const prefillAmount = Number(prefill.get('amount'))

  const [from, setFrom] = useState(
    () => payment?.from ?? (isMember(prefillFrom) ? prefillFrom : people.me) ?? '',
  )
  const [to, setTo] = useState(
    () =>
      payment?.to ??
      (isMember(prefillTo) ? prefillTo : members.find((member) => member.id !== from)?.id) ??
      '',
  )
  const [amount, setAmount] = useState<number | null>(
    payment?.amount ?? (isValidAmount(prefillAmount) ? prefillAmount : null),
  )
  const [date, setDate] = useState(payment?.date ?? todayIso())
  const [attempts, setAttempts] = useState(0)
  const [saving, setSaving] = useState(false)

  const errors = {
    amount: !amount ? t('error.amount') : isValidAmount(amount) ? null : t('error.amountTooLarge'),
    people: from === to ? t('error.samePerson') : null,
  }
  const shown = attempts > 0

  useEffect(() => {
    if (attempts > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempts])

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (errors.amount || errors.people || amount === null) {
      setAttempts((count) => count + 1)
      return
    }
    setSaving(true)
    const money = { amount, from, to }
    if (payment) {
      const set: Record<string, unknown> = {}
      if (amount !== payment.amount || from !== payment.from || to !== payment.to) set.money = money
      if (date !== payment.date) set.date = date
      if (Object.keys(set).length > 0) {
        await group.store.write([{ entity: 'payment', key: payment.id, set }])
      }
      navigate(back, { replace: true })
      return
    }
    const key = randomId()
    await group.store.write([{ entity: 'payment', key, set: { money, date } }])
    navigate(back, { replace: true })
    toast({
      text: t('payment.recorded'),
      action: {
        label: t('action.undo'),
        run: () => void group.store.write([{ entity: 'payment', key, set: { deleted: true } }]),
      },
    })
  }

  async function remove() {
    if (!payment) return
    const key = payment.id
    await group.store.write([{ entity: 'payment', key, set: { deleted: true } }])
    navigate(back, { replace: true })
    toast({
      text: t('payment.deleted'),
      action: {
        label: t('action.undo'),
        run: () => void group.store.write([{ entity: 'payment', key, set: { deleted: false } }]),
      },
    })
  }

  const heading = payment ? t('payment.editTitle') : t('payment.addTitle')
  const options = members.map((member) => ({ value: member.id, label: people.label(member.id) }))
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
        <SelectField label={t('payment.from')} value={from} options={options} onValue={setFrom} />
        <SelectField
          label={t('payment.to')}
          value={to}
          options={options}
          onValue={setTo}
          error={shown ? errors.people : null}
        />
        <Field label={t('payment.amount')} error={shown ? errors.amount : null}>
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
          label={t('payment.date')}
          type="date"
          value={date}
          required
          onValue={(value) => {
            if (value) setDate(value)
          }}
        />
        <Button type="submit" variant="primary" wide disabled={saving}>
          {t('payment.save')}
        </Button>
        {payment && (
          <Button variant="danger" icon={Trash} wide onClick={() => void remove()}>
            {t('payment.delete')}
          </Button>
        )}
      </form>
      {payment && (
        <Suspense fallback={null}>
          <History group={group} entity="payment" entityKey={payment.id} />
        </Suspense>
      )}
    </Page>
  )
}
