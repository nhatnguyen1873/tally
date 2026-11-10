import { useEffect, useMemo } from 'react'
import { Link, useLocation, useSearch } from 'wouter'

import { balances, expenseEffect } from '../../domain/balances.ts'
import type { Expense, Payment } from '../../domain/fold.ts'
import { CATEGORIES } from '../../domain/model.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { Button, ButtonLink } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { fieldStyles, SelectField } from '../../ui/Field.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { CATEGORY_ICONS, HandCoins, Plus, Receipt, Search } from '../../ui/icons.ts'
import { pageStyles, Section } from '../../ui/Page.tsx'
import { type Group, GroupGate, groupStyles, GroupTabsPage } from '../group/group.tsx'
import styles from './ExpensesRoute.module.css'
import {
  byDay,
  type Filters,
  filtersToSearch,
  isFiltered,
  type Item,
  itemMatches,
  keyOf,
  listItems,
  monthsOf,
  NO_FILTERS,
  parseFilters,
} from './filters.ts'

export default function ExpensesRoute() {
  return <GroupGate>{(group) => <Expenses group={group} />}</GroupGate>
}

function Expenses({ group }: { group: Group }) {
  const { t } = useI18n()
  const search = useSearch()
  const [, navigate] = useLocation()
  const filters = parseFilters(search)
  const all = useMemo(() => listItems(group.state), [group.state])
  const shown = all.filter((item) => itemMatches(item, filters, group.people.name))

  // Opening a group moves it to the top of the home screen.
  useEffect(() => {
    void group.store.update({ openedAt: Date.now() })
  }, [group.store])

  // Forms opened from here come back to the list as it is now (see list-href.ts).
  const listSearch = filtersToSearch(filters)

  const change = (patch: Partial<Filters>) => {
    navigate(`/g/${group.id}${filtersToSearch({ ...filters, ...patch })}`, { replace: true })
  }

  return (
    <GroupTabsPage
      group={group}
      tab="expenses"
      heading={t('group.tab.expenses')}
      floating={
        <ButtonLink
          href={`/g/${group.id}/e/new`}
          state={{ listSearch }}
          variant="primary"
          icon={Plus}
          className={groupStyles.floating}
        >
          {t('expenses.add')}
        </ButtonLink>
      }
    >
      <Summary group={group} filters={filters} shown={shown} />
      {all.length > 0 && <FilterBar group={group} filters={filters} all={all} onChange={change} />}
      {all.length === 0 ? (
        <EmptyState icon={Receipt} text={t('expenses.empty')} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} text={t('expenses.noMatches')}>
          <Button
            onClick={() => {
              change(NO_FILTERS)
            }}
          >
            {t('expenses.clearFilters')}
          </Button>
        </EmptyState>
      ) : (
        byDay(shown).map((day) => (
          <Day key={day.date} group={group} listSearch={listSearch} {...day} />
        ))
      )}
    </GroupTabsPage>
  )
}

function Summary({ group, filters, shown }: { group: Group; filters: Filters; shown: Item[] }) {
  const { t, money } = useI18n()
  const { currency } = group.info
  let spent = 0
  for (const item of shown) if (item.kind === 'expense') spent += item.expense.amount

  if (isFiltered(filters)) {
    return (
      <p className={styles.summary}>
        {t('expenses.matches', { count: shown.length, amount: money(spent, currency) })}
      </p>
    )
  }
  const { me } = group.people
  const net = me ? (balances(group.state).get(me)?.net ?? 0) : null
  return (
    <div className={`${pageStyles.card} ${styles.summaryCard}`}>
      {net !== null && (
        <p
          className={`${styles.status} ${net > 0 ? groupStyles.positive : net < 0 ? groupStyles.negative : ''}`}
        >
          {net > 0
            ? t('summary.owed', { amount: money(net, currency) })
            : net < 0
              ? t('summary.owe', { amount: money(-net, currency) })
              : t('summary.settled')}
        </p>
      )}
      <p className={groupStyles.muted}>{t('summary.total', { amount: money(spent, currency) })}</p>
    </div>
  )
}

function FilterBar({
  group,
  filters,
  all,
  onChange,
}: {
  group: Group
  filters: Filters
  all: Item[]
  onChange: (patch: Partial<Filters>) => void
}) {
  const { t, month } = useI18n()
  const narrowed = Boolean(filters.person || filters.month || filters.category || filters.type)
  return (
    <div className={styles.filters}>
      <label className="visually-hidden" htmlFor="expense-search">
        {t('expenses.search')}
      </label>
      <input
        id="expense-search"
        type="search"
        className={fieldStyles.input}
        placeholder={t('expenses.search')}
        value={filters.query}
        onChange={(event) => {
          onChange({ query: event.target.value })
        }}
      />
      <details className={styles.more} open={narrowed}>
        <summary className={styles.summaryToggle}>{t('expenses.filters')}</summary>
        <div className={styles.grid}>
          <SelectField
            label={t('expenses.filter.person')}
            value={filters.person}
            options={[
              { value: '', label: t('expenses.filter.anyone') },
              ...group.people.all.map((member) => ({
                value: member.id,
                label: group.people.label(member.id),
              })),
            ]}
            onValue={(person) => {
              onChange({ person })
            }}
          />
          <SelectField
            label={t('expenses.filter.month')}
            value={filters.month}
            options={[
              { value: '', label: t('expenses.filter.anyMonth') },
              ...monthsOf(all).map((value) => ({ value, label: month(value) })),
            ]}
            onValue={(value) => {
              onChange({ month: value })
            }}
          />
          <SelectField
            label={t('expenses.filter.category')}
            value={filters.category}
            options={[
              { value: '', label: t('expenses.filter.anyCategory') },
              ...CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) })),
            ]}
            onValue={(value) => {
              onChange({ category: value as Filters['category'] })
            }}
          />
          <SelectField
            label={t('expenses.filter.type')}
            value={filters.type}
            options={[
              { value: '', label: t('expenses.filter.everything') },
              { value: 'expenses', label: t('expenses.filter.expenses') },
              { value: 'payments', label: t('expenses.filter.payments') },
            ]}
            onValue={(value) => {
              onChange({ type: value as Filters['type'] })
            }}
          />
        </div>
        {isFiltered(filters) && (
          <Button
            variant="quiet"
            onClick={() => {
              onChange(NO_FILTERS)
            }}
          >
            {t('expenses.clearFilters')}
          </Button>
        )}
      </details>
    </div>
  )
}

function Day({
  group,
  listSearch,
  date,
  items,
}: {
  group: Group
  listSearch: string
  date: string
  items: Item[]
}) {
  const { day } = useI18n()
  return (
    <Section title={day(date)}>
      <ul className={`${pageStyles.card} ${pageStyles.list}`}>
        {items.map((item) => (
          <li key={keyOf(item)}>
            {item.kind === 'expense' ? (
              <ExpenseRow group={group} listSearch={listSearch} expense={item.expense} />
            ) : (
              <PaymentRow group={group} listSearch={listSearch} payment={item.payment} />
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ExpenseRow({
  group,
  listSearch,
  expense,
}: {
  group: Group
  listSearch: string
  expense: Expense
}) {
  const { t, money } = useI18n()
  const { me, name } = group.people
  const amount = (value: number) => money(value, group.info.currency)
  const effect = me ? expenseEffect(expense, me) : null
  const paid =
    expense.paidBy === me
      ? t('expenses.youPaid', { amount: amount(expense.amount) })
      : t('expenses.paidBy', { name: name(expense.paidBy), amount: amount(expense.amount) })
  const [text, tone] =
    !effect || (effect.paid === 0 && effect.share === 0)
      ? [t('expenses.notInvolved'), groupStyles.muted]
      : effect.net > 0
        ? [t('expenses.lent', { amount: amount(effect.net) }), groupStyles.positive]
        : effect.net < 0
          ? [t('expenses.borrowed', { amount: amount(-effect.net) }), groupStyles.negative]
          : [t('expenses.justYou'), groupStyles.muted]

  return (
    <Link
      href={`/g/${group.id}/e/${expense.id}`}
      state={{ listSearch }}
      className={groupStyles.row}
    >
      <span className={groupStyles.rowIcon}>
        <Icon icon={CATEGORY_ICONS[expense.category]} />
      </span>
      <span className={groupStyles.rowText}>
        <span className={groupStyles.rowTitle}>{expense.title}</span>
        <span className={groupStyles.rowDetail}>{paid}</span>
      </span>
      <span className={`${groupStyles.rowEnd} ${tone ?? ''}`}>{text}</span>
    </Link>
  )
}

function PaymentRow({
  group,
  listSearch,
  payment,
}: {
  group: Group
  listSearch: string
  payment: Payment
}) {
  const { t, money } = useI18n()
  const { subject, object } = group.people
  return (
    <Link
      href={`/g/${group.id}/pay/${payment.id}`}
      state={{ listSearch }}
      className={groupStyles.row}
    >
      <span className={groupStyles.rowIcon}>
        <Icon icon={HandCoins} />
      </span>
      <span className={groupStyles.rowText}>
        <span className={groupStyles.rowTitle}>
          {t('expenses.payment', { from: subject(payment.from), to: object(payment.to) })}
        </span>
      </span>
      <span className={groupStyles.rowEnd}>{money(payment.amount, group.info.currency)}</span>
    </Link>
  )
}
