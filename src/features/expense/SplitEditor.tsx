import { useId } from 'react'

import type { Member } from '../../domain/fold.ts'
import type { Currency } from '../../domain/money.ts'
import { FULL_PERCENT, MAX_SHARES } from '../../domain/split.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { AmountInput } from '../../ui/AmountInput.tsx'
import { fieldStyles } from '../../ui/Field.tsx'
import { SegmentedControl } from '../../ui/SegmentedControl.tsx'
import type { People } from '../group/people.ts'
import styles from './SplitEditor.module.css'
import { leftToAssign, partsOf, SPLIT_MODES, type SplitDraft } from './split-draft.ts'

/** Zero means "not included", which shows as an empty field. */
function positive(value: number | undefined): number | null {
  return value !== undefined && value > 0 ? value : null
}

function clampShares(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_SHARES, Math.max(0, Math.round(value))) : 0
}

/**
 * Who shares an expense, and how. Shows each person's part as it will be
 * recorded, and says (politely, for screen readers) what's left to assign.
 */
export function SplitEditor({
  draft,
  onDraft,
  amount,
  members,
  currency,
  salt,
  people,
  error,
}: {
  draft: SplitDraft
  onDraft: (draft: SplitDraft) => void
  amount: number | null
  members: readonly Member[]
  currency: Currency
  salt: string
  people: People
  error: string | null
}) {
  const { t, money, percent } = useI18n()
  const baseId = useId()
  const ids = members.map((member) => member.id)
  const parts = partsOf(draft, amount, ids, salt)
  const left = leftToAssign(draft, amount, ids)
  const everyone = ids.every((id) => draft.among.includes(id))
  const update = (patch: Partial<SplitDraft>) => {
    onDraft({ ...draft, ...patch })
  }

  const status =
    left === null
      ? null
      : left === 0
        ? t('split.balanced')
        : draft.mode === 'exact'
          ? t(left > 0 ? 'split.left' : 'split.over', { amount: money(Math.abs(left), currency) })
          : t(left > 0 ? 'split.percentLeft' : 'split.percentOver', {
              percent: percent(Math.abs(left)),
            })

  return (
    <div className={styles.split}>
      <p className={fieldStyles.label} aria-hidden="true">
        {t('expense.split')}
      </p>
      <SegmentedControl
        legend={t('expense.split')}
        options={SPLIT_MODES.map((mode) => ({ value: mode, label: t(`split.${mode}`) }))}
        value={draft.mode}
        onValue={(mode) => {
          update({ mode })
        }}
      />
      {draft.mode === 'equal' && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={everyone}
            onChange={() => {
              update({ among: everyone ? [] : ids })
            }}
          />
          <span>{t('split.everyone')}</span>
        </label>
      )}
      {draft.mode === 'shares' && <p className={fieldStyles.hint}>{t('split.sharesHint')}</p>}

      <ul className={styles.people}>
        {members.map((member) => {
          const inputId = `${baseId}-${member.id}`
          const name = people.label(member.id)
          const part = parts?.get(member.id)
          const fieldLabel =
            draft.mode === 'exact'
              ? t('split.amountFor', { name })
              : draft.mode === 'shares'
                ? t('split.sharesFor', { name })
                : t('split.percentFor', { name })
          return (
            <li key={member.id} className={styles.person}>
              {draft.mode === 'equal' ? (
                <label className={`${styles.check} ${styles.grow}`}>
                  <input
                    type="checkbox"
                    checked={draft.among.includes(member.id)}
                    onChange={(event) => {
                      update({
                        among: event.target.checked
                          ? [...draft.among, member.id]
                          : draft.among.filter((id) => id !== member.id),
                      })
                    }}
                  />
                  <span>{name}</span>
                </label>
              ) : (
                <>
                  <label htmlFor={inputId} className={styles.grow}>
                    <span aria-hidden="true">{name}</span>
                    <span className="visually-hidden">{fieldLabel}</span>
                  </label>
                  {draft.mode === 'exact' && (
                    <AmountInput
                      ids={{ id: inputId }}
                      digits={currency.digits}
                      value={positive(draft.amounts[member.id])}
                      className={styles.input}
                      onValue={(value) => {
                        update({ amounts: { ...draft.amounts, [member.id]: value ?? 0 } })
                      }}
                    />
                  )}
                  {draft.mode === 'shares' && (
                    <input
                      id={inputId}
                      className={`${fieldStyles.input} ${styles.input}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_SHARES}
                      step={1}
                      value={draft.shares[member.id] ?? 0}
                      onChange={(event) => {
                        const shares = clampShares(event.target.valueAsNumber)
                        update({ shares: { ...draft.shares, [member.id]: shares } })
                      }}
                    />
                  )}
                  {draft.mode === 'percent' && (
                    <span className={styles.percent}>
                      <AmountInput
                        ids={{ id: inputId }}
                        digits={2}
                        value={positive(draft.bps[member.id])}
                        className={styles.input}
                        onValue={(value) => {
                          const bps = Math.min(value ?? 0, FULL_PERCENT)
                          update({ bps: { ...draft.bps, [member.id]: bps } })
                        }}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  )}
                </>
              )}
              <span className={styles.part}>{part === undefined ? '' : money(part, currency)}</span>
            </li>
          )
        })}
      </ul>

      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {error && <p className={fieldStyles.error}>{error}</p>}
    </div>
  )
}
