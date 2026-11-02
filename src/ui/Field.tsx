import { type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, useId } from 'react'

import styles from './Field.module.css'

export interface FieldIds {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/**
 * A label, a control, and optional hint and error text, wired together for
 * screen readers. `children` receives the props the control needs.
 */
export function Field({
  label,
  hint,
  error,
  labelHidden,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  labelHidden?: boolean
  children: (ids: FieldIds) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={labelHidden ? 'visually-hidden' : styles.label}>
        {label}
      </label>
      {children({
        id,
        ...(describedBy && { 'aria-describedby': describedBy }),
        ...(error && { 'aria-invalid': true as const }),
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> & {
  label: string
  hint?: ReactNode
  error?: string | null
  labelHidden?: boolean
  onValue: (value: string) => void
}

export function TextField({ label, hint, error, labelHidden, onValue, ...props }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} labelHidden={labelHidden}>
      {(ids) => (
        <input
          className={styles.input}
          {...ids}
          {...props}
          onChange={(event) => {
            onValue(event.target.value)
          }}
        />
      )}
    </Field>
  )
}

export interface Option {
  readonly value: string
  readonly label: string
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'onChange'> & {
  label: string
  options: readonly Option[]
  hint?: ReactNode
  error?: string | null
  labelHidden?: boolean
  onValue: (value: string) => void
}

export function SelectField({
  label,
  options,
  hint,
  error,
  labelHidden,
  onValue,
  ...props
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} labelHidden={labelHidden}>
      {(ids) => (
        <select
          className={styles.select}
          {...ids}
          {...props}
          onChange={(event) => {
            onValue(event.target.value)
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export const fieldStyles = styles
