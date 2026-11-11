import { type ReactNode, useId, useState } from 'react'

import { matchesSearch } from '../../domain/search.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { fieldStyles, type Option } from '../../ui/Field.tsx'
import styles from './CurrencyField.module.css'

/**
 * The currency picker: a search box that narrows a list of about 150
 * currencies, by code or name, ignoring case and accents ("dong" finds
 * "Đồng"). Searching only narrows the list; the currency changes when one is
 * picked, so nothing is saved while typing.
 */
export function CurrencyField({
  label,
  value,
  options,
  onValue,
  hint,
  disabled,
}: {
  label: string
  value: string
  options: readonly Option[]
  onValue: (code: string) => void
  hint?: ReactNode
  disabled?: boolean
}) {
  const { t } = useI18n()
  const id = useId()
  const [query, setQuery] = useState('')
  const matches = options.filter((option) => matchesSearch(option.label, query))
  const selected = options.find((option) => option.value === value)
  // The chosen currency stays in the list, so the list always shows it.
  const shown =
    matches.length === 0
      ? options
      : selected && !matches.includes(selected)
        ? [selected, ...matches]
        : matches
  const status = !query.trim()
    ? ''
    : matches.length === 0
      ? t('currency.noMatch', { query: query.trim() })
      : t('currency.matches', { count: matches.length })

  return (
    <fieldset className={styles.currency}>
      <legend className={styles.legend}>{label}</legend>
      {!disabled && (
        <div className={styles.search}>
          <label htmlFor={`${id}-search`} className="visually-hidden">
            {t('currency.search')}
          </label>
          <input
            id={`${id}-search`}
            className={fieldStyles.input}
            type="search"
            value={query}
            placeholder={t('currency.search')}
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby={`${id}-status`}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              // Enter searches; it doesn't submit the form around it.
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
          <p id={`${id}-status`} className={fieldStyles.hint} aria-live="polite">
            {status}
          </p>
        </div>
      )}
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <select
        id={id}
        className={fieldStyles.select}
        value={value}
        disabled={disabled}
        {...(hint && { 'aria-describedby': `${id}-hint` })}
        onChange={(event) => {
          onValue(event.target.value)
        }}
      >
        {shown.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className={fieldStyles.hint}>
          {hint}
        </p>
      )}
    </fieldset>
  )
}
