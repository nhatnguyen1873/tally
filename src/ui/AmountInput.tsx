import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import {
  amountOf,
  caretFor,
  displayAmount,
  numberSymbols,
  readAmountText,
  typedCharacters,
} from './amount-input.ts'
import { type FieldIds, fieldStyles } from './Field.tsx'

/**
 * An amount field that groups digits as you type ("1.200.000") and reports
 * minor units, or null while empty. Phone keypads show the device region's
 * decimal key, which may not be the app language's, so a typed "." or ","
 * becomes this language's decimal separator.
 */
export function AmountInput({
  ids,
  value,
  onValue,
  digits,
  className,
}: {
  ids: FieldIds
  value: number | null
  onValue: (amount: number | null) => void
  /** Decimal places: the currency's, or 2 for percentages. */
  digits: number
  className?: string
}) {
  const { locale } = useI18n()
  const symbols = useMemo(() => numberSymbols(locale), [locale])
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => displayAmount(value, digits, symbols))
  const [shown, setShown] = useState(value)

  // A new value from outside (prefilled, or reset) replaces what was typed.
  if (value !== shown) {
    setShown(value)
    if (amountOf(readAmountText(text, digits, symbols).decimal, digits) !== value) {
      setText(displayAmount(value, digits, symbols))
    }
  }

  function accept(raw: string, caret: number) {
    const read = readAmountText(raw, digits, symbols)
    const amount = amountOf(read.decimal, digits)
    const typedBefore = typedCharacters(raw.slice(0, caret), symbols)
    setText(read.display)
    setShown(amount)
    onValue(amount)
    requestAnimationFrame(() => {
      const position = caretFor(read.display, typedBefore, symbols)
      if (document.activeElement === input.current)
        input.current?.setSelectionRange(position, position)
    })
  }

  useEffect(() => {
    const element = input.current
    if (!element || digits === 0) return
    const onBeforeInput = (event: InputEvent) => {
      if ((event.data !== '.' && event.data !== ',') || event.data === symbols.decimal) return
      event.preventDefault()
      const start = element.selectionStart ?? element.value.length
      const end = element.selectionEnd ?? start
      const raw = element.value.slice(0, start) + symbols.decimal + element.value.slice(end)
      accept(raw, start + 1)
    }
    element.addEventListener('beforeinput', onBeforeInput)
    return () => {
      element.removeEventListener('beforeinput', onBeforeInput)
    }
  })

  return (
    <input
      ref={input}
      {...ids}
      className={[fieldStyles.input, fieldStyles.amount, className].filter(Boolean).join(' ')}
      type="text"
      inputMode={digits > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={text}
      placeholder={displayAmount(0, digits, symbols)}
      onChange={(event) => {
        accept(event.target.value, event.target.selectionStart ?? event.target.value.length)
      }}
    />
  )
}
