import { type Currency, minorToDecimal } from '../domain/money.ts'

// Intl formatters are slow to build and fine to reuse.
const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()
function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => T): T {
  let formatter = formatters.get(key) as T | undefined
  if (!formatter) {
    formatter = make()
    formatters.set(key, formatter)
  }
  return formatter
}

/** "1.200.000 ₫" in Vietnamese, "₫1,200,000" in English. Exact: formats a decimal string. */
export function formatMoney(amount: number, currency: Currency, locale: string): string {
  const formatter = cached(`money|${locale}|${currency.code}|${currency.digits}`, () => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: currency.digits,
      maximumFractionDigits: currency.digits,
    })
  })
  return formatter.format(minorToDecimal(amount, currency.digits) as `${number}`)
}

/** Basis points as a percentage with up to two decimals: 3333 → "33.33%". */
export function formatPercent(bps: number, locale: string): string {
  const formatter = cached(`percent|${locale}`, () => {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 })
  })
  return formatter.format(bps / 10_000)
}

/** Today's date on this phone, as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function localDate(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A day heading: "Today", "Yesterday", or a short date (with the year if it isn't this year's). */
export function formatDay(
  date: string,
  now: Date,
  locale: string,
  words: { today: string; yesterday: string },
): string {
  const value = localDate(date)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Rounding absorbs the hour that daylight saving time adds or removes.
  const daysAgo = Math.round((today.getTime() - value.getTime()) / 86_400_000)
  if (daysAgo === 0) return words.today
  if (daysAgo === 1) return words.yesterday
  const withYear = value.getFullYear() !== now.getFullYear()
  const formatter = cached(`day|${locale}|${String(withYear)}`, () => {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    })
  })
  return formatter.format(value)
}

/** A plain date, for history entries: "2 Nov 2026". */
export function formatDate(date: string, locale: string): string {
  const formatter = cached(`date|${locale}`, () => {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  })
  return formatter.format(localDate(date))
}

/** A month heading from YYYY-MM: "November 2026". */
export function formatMonth(month: string, locale: string): string {
  const formatter = cached(`month|${locale}`, () => {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  })
  return formatter.format(localDate(`${month}-01`))
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

/** "5 minutes ago", or `justNow` under a minute. */
export function formatRelative(at: number, now: number, locale: string, justNow: string): string {
  const seconds = Math.round((at - now) / 1000)
  let formatter = relativeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeFormatters.set(locale, formatter)
  }
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return justNow
}

/** A currency's name in the reader's language: "Vietnamese Dong", "Đồng Việt Nam". */
export function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}
