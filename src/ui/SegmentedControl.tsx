import { useId } from 'react'

import styles from './SegmentedControl.module.css'

/** A choice of a few options, shown side by side. It's a radio group underneath. */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onValue,
}: {
  legend: string
  options: readonly { readonly value: T; readonly label: string }[]
  value: T
  onValue: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset className={styles.group}>
      <legend className="visually-hidden">{legend}</legend>
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              className={styles.radio}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onValue(option.value)
              }}
            />
            <span className={styles.label}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
