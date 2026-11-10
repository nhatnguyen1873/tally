import { useId } from 'react'

import { balances, totalsByCategory } from '../../domain/balances.ts'
import { randomId } from '../../domain/ids.ts'
import { settleUp, type Transfer } from '../../domain/settle.ts'
import { todayIso } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { Button, ButtonLink } from '../../ui/Button.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { CATEGORY_ICONS, Check, HandCoins } from '../../ui/icons.ts'
import { pageStyles, Section } from '../../ui/Page.tsx'
import { useToast } from '../../ui/Toast.tsx'
import { type Group, GroupGate, groupStyles, GroupTabsPage } from '../group/group.tsx'
import styles from './BalancesRoute.module.css'

export default function BalancesRoute() {
  return <GroupGate>{(group) => <BalancesScreen group={group} />}</GroupGate>
}

function BalancesScreen({ group }: { group: Group }) {
  const { t, money } = useI18n()
  const { people, info, state } = group
  const amount = (value: number) => money(value, info.currency)
  const all = balances(state)
  // Removed members stay listed while they still have money in the group.
  const rows = [...all.values()].filter(
    (row) => !state.members.get(row.memberId)?.deleted || row.net !== 0 || row.share > 0,
  )
  const transfers = settleUp([...all].map(([member, row]) => [member, row.net] as const))
  const spending = [...totalsByCategory(state)]
  const largest = Math.max(1, ...spending.map(([, total]) => total))

  return (
    <GroupTabsPage group={group} tab="balances" heading={t('balances.heading')}>
      <ul className={`${pageStyles.card} ${pageStyles.list}`}>
        {rows.map((row) => (
          <li key={row.memberId} className={groupStyles.row}>
            <Avatar id={row.memberId} name={people.name(row.memberId)} />
            <span className={groupStyles.rowText}>
              <span className={groupStyles.rowTitle}>{people.label(row.memberId)}</span>
              <span
                className={`${groupStyles.strong} ${
                  row.net > 0
                    ? groupStyles.positive
                    : row.net < 0
                      ? groupStyles.negative
                      : groupStyles.muted
                }`}
              >
                {row.net > 0
                  ? t('balances.getsBack', { amount: amount(row.net) })
                  : row.net < 0
                    ? t('balances.owes', { amount: amount(-row.net) })
                    : t('balances.settled')}
              </span>
              <span className={groupStyles.rowDetail}>
                {/* As SPEC.md section 5.4 counts them, so paid minus share is the balance. */}
                {t('balances.detail', {
                  paid: amount(row.paid + row.sent),
                  share: amount(row.share + row.received),
                })}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <Section title={t('settle.heading')}>
        <p className={groupStyles.muted}>{t('settle.explain')}</p>
        {transfers.length === 0 ? (
          <p className={`${pageStyles.card} ${styles.done}`}>{t('settle.done')}</p>
        ) : (
          <ul className={`${pageStyles.card} ${pageStyles.list}`}>
            {transfers.map((transfer) => (
              <li key={`${transfer.from}:${transfer.to}`}>
                <TransferRow group={group} transfer={transfer} />
              </li>
            ))}
          </ul>
        )}
        <div>
          <ButtonLink href={`/g/${group.id}/pay/new?back=balances`} icon={HandCoins}>
            {t('settle.record')}
          </ButtonLink>
        </div>
      </Section>

      {spending.length > 0 && (
        <Section title={t('spending.heading')}>
          <ul className={`${pageStyles.card} ${pageStyles.list}`}>
            {spending.map(([category, total]) => (
              <li key={category} className={styles.spending}>
                <span className={groupStyles.rowIcon}>
                  <Icon icon={CATEGORY_ICONS[category]} />
                </span>
                <span className={styles.spendingText}>
                  <span className={styles.spendingLine}>
                    <span>{t(`category.${category}`)}</span>
                    <span className="tabular">{amount(total)}</span>
                  </span>
                  <span className={styles.bar} aria-hidden="true">
                    <span style={{ width: `${(total / largest) * 100}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </GroupTabsPage>
  )
}

function TransferRow({ group, transfer }: { group: Group; transfer: Transfer }) {
  const { t, money } = useI18n()
  const toast = useToast()
  const textId = useId()
  const { me, name } = group.people
  const text =
    transfer.from === me
      ? t('settle.youPay', { to: name(transfer.to) })
      : transfer.to === me
        ? t('settle.paysYou', { from: name(transfer.from) })
        : t('settle.transfer', { from: name(transfer.from), to: name(transfer.to) })
  const prefill = new URLSearchParams({
    from: transfer.from,
    to: transfer.to,
    amount: String(transfer.amount),
    back: 'balances',
  })

  async function markPaid() {
    const key = randomId()
    await group.store.write([
      { entity: 'payment', key, set: { money: { ...transfer }, date: todayIso() } },
    ])
    toast({
      text: t('payment.recorded'),
      action: {
        label: t('action.undo'),
        run: () => void group.store.write([{ entity: 'payment', key, set: { deleted: true } }]),
      },
    })
  }

  return (
    <div className={styles.transfer}>
      <p id={textId} className={styles.transferText}>
        <span className={groupStyles.strong}>{text}</span>
        <span className="tabular">{money(transfer.amount, group.info.currency)}</span>
      </p>
      <div className={styles.transferActions}>
        <Button
          small
          variant="primary"
          icon={Check}
          aria-describedby={textId}
          onClick={() => void markPaid()}
        >
          {t('settle.markPaid')}
        </Button>
        <ButtonLink small variant="quiet" href={`/g/${group.id}/pay/new?${prefill}`}>
          {t('settle.otherAmount')}
        </ButtonLink>
      </div>
    </div>
  )
}
