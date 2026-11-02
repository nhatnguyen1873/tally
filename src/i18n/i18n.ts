import type { Currency } from '../domain/money.ts'
import type { Catalog, en, MessageKey } from './en.ts'
import {
  currencyName,
  formatDate,
  formatDay,
  formatMoney,
  formatMonth,
  formatPercent,
  formatRelative,
} from './format.ts'
import type { Language } from './language.ts'
import { type MessageParams, translate } from './translate.ts'

type ParamsArg<K extends MessageKey> = [MessageParams<(typeof en)[K]>] extends [never]
  ? []
  : [Readonly<Record<MessageParams<(typeof en)[K]>, string | number>>]

/** Looks up a message; TypeScript requires exactly the parameters it uses. */
export type Translate = <K extends MessageKey>(key: K, ...params: ParamsArg<K>) => string

export interface I18n {
  readonly language: Language
  readonly locale: string
  readonly t: Translate
  readonly money: (amount: number, currency: Currency) => string
  readonly percent: (bps: number) => string
  readonly day: (date: string, now?: Date) => string
  readonly date: (date: string) => string
  readonly month: (month: string) => string
  readonly relative: (at: number, now?: number) => string
  readonly currencyName: (code: string) => string
}

export function makeI18n(language: Language, catalog: Catalog, locale: string): I18n {
  const plurals = new Intl.PluralRules(locale)
  const t: Translate = (key, ...params) => translate(catalog[key], params[0], plurals)
  return {
    language,
    locale,
    t,
    money: (amount, currency) => formatMoney(amount, currency, locale),
    percent: (bps) => formatPercent(bps, locale),
    day: (date, now = new Date()) =>
      formatDay(date, now, locale, {
        today: t('expenses.today'),
        yesterday: t('expenses.yesterday'),
      }),
    date: (date) => formatDate(date, locale),
    month: (month) => formatMonth(month, locale),
    relative: (at, now = Date.now()) => formatRelative(at, now, locale, t('activity.justNow')),
    currencyName: (code) => currencyName(code, locale),
  }
}
