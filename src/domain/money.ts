import { hasOnlyKeys, isRecord } from './util.ts'

/**
 * Amounts are always integers in the currency's minor unit (đồng, cents).
 * `digits` is fixed when a group is created, so every device reads stored
 * amounts the same way even if its Intl data differs.
 */
export interface Currency {
  readonly code: string
  readonly digits: number
}

/** Per expense or payment. Keeps every group-wide sum a safe integer. */
export const MAX_AMOUNT = 100_000_000_000

const CURRENCY_CODE = /^[A-Z]{3}$/

export function isValidAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_AMOUNT
}

export function isValidCurrency(value: unknown): value is Currency {
  if (!isRecord(value) || !hasOnlyKeys(value, ['code', 'digits'])) return false
  const { code, digits } = value
  return (
    typeof code === 'string' &&
    CURRENCY_CODE.test(code) &&
    Number.isInteger(digits) &&
    (digits as number) >= 0 &&
    (digits as number) <= 4
  )
}

/** Looks up an ISO 4217 code's minor digits. Called once, when a group is created. */
export function currencyFromCode(code: string): Currency | null {
  if (!CURRENCY_CODE.test(code) || !Intl.supportedValuesOf('currency').includes(code)) return null
  const { maximumFractionDigits } = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: code,
  }).resolvedOptions()
  return { code, digits: maximumFractionDigits ?? 2 }
}

/** 123450 with 2 digits → "1234.50". Plain digits only, for CSV files and inputs. */
export function minorToDecimal(amount: number, digits: number): string {
  const sign = amount < 0 ? '-' : ''
  const text = String(Math.abs(amount))
  if (digits === 0) return sign + text
  const padded = text.padStart(digits + 1, '0')
  return `${sign}${padded.slice(0, -digits)}.${padded.slice(-digits)}`
}

/** "1234.5" with 2 digits → 123450. Null if malformed or more precise than the currency. */
export function decimalToMinor(text: string, digits: number): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) return null
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if (fraction.length > digits) return null
  const value = Number(whole + fraction.padEnd(digits, '0'))
  return Number.isSafeInteger(value) ? value : null
}
