import { decimalToMinor, minorToDecimal } from '../domain/money.ts'

/** How a locale writes numbers: "1.234,5" in Vietnamese, "1,234.5" in English. */
export interface NumberSymbols {
  readonly decimal: string
  readonly group: string
}

export function numberSymbols(locale: string): NumberSymbols {
  const parts = new Intl.NumberFormat(locale).formatToParts(12_345.6)
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  }
}

export interface AmountText {
  /** What the field shows, grouped: "1.200.000". */
  readonly display: string
  /** Plain digits and a "." for the decimal point: "1200000". Empty if nothing was typed. */
  readonly decimal: string
}

/**
 * Digits a field keeps, fraction included. Any number this long is still a
 * safe integer in minor units, yet far beyond MAX_AMOUNT, so an amount typed
 * too long reads as "more than Tally can record", never as no amount.
 */
const MAX_DIGITS = 15

function group(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}

/**
 * Reads what's in the field. Our own grouping separators are dropped, the
 * first decimal separator starts the fraction (if the currency has one), and
 * anything else is ignored. Leading zeros go, the fraction is cut to the
 * currency's digits, and the whole part to what MAX_DIGITS leaves.
 */
export function readAmountText(text: string, digits: number, symbols: NumberSymbols): AmountText {
  let whole = ''
  let fraction = ''
  let pointAt = -1
  for (const char of text.split(symbols.group).join('')) {
    if (char >= '0' && char <= '9') {
      if (pointAt < 0) whole += char
      else if (fraction.length < digits) fraction += char
    } else if (char === symbols.decimal && digits > 0 && pointAt < 0) {
      pointAt = whole.length
    }
  }
  whole = whole.replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS - digits)
  if (pointAt >= 0 && whole === '') whole = '0'
  const point = pointAt >= 0
  return {
    display: group(whole, symbols.group) + (point ? symbols.decimal + fraction : ''),
    decimal: whole + (point ? `.${fraction}` : ''),
  }
}

/** The amount in minor units, or null if the field is empty or holds too much. */
export function amountOf(decimal: string, digits: number): number | null {
  if (decimal === '') return null
  return decimalToMinor(decimal.endsWith('.') ? decimal.slice(0, -1) : decimal, digits)
}

/** How a stored amount shows in the field, without a currency symbol. */
export function displayAmount(amount: number | null, digits: number, symbols: NumberSymbols) {
  if (amount === null) return ''
  return readAmountText(
    minorToDecimal(amount, digits).replace('.', symbols.decimal),
    digits,
    symbols,
  ).display
}

/** Digits and the decimal point count as typed characters; grouping doesn't. */
export function typedCharacters(text: string, symbols: NumberSymbols): number {
  let count = 0
  for (const char of text) if ((char >= '0' && char <= '9') || char === symbols.decimal) count++
  return count
}

/** Where the caret belongs in `display` so that `typed` typed characters come before it. */
export function caretFor(display: string, typed: number, symbols: NumberSymbols): number {
  if (typed <= 0) return 0
  let seen = 0
  for (let index = 0; index < display.length; index++) {
    const char = display.charAt(index)
    if ((char >= '0' && char <= '9') || char === symbols.decimal) seen++
    if (seen === typed) return index + 1
  }
  return display.length
}
