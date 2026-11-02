import { describe, expect, it } from 'vitest'

import { type Catalog, en } from './en.ts'
import {
  currencyName,
  formatDay,
  formatMoney,
  formatMonth,
  formatPercent,
  formatRelative,
  todayIso,
} from './format.ts'
import { makeI18n } from './i18n.ts'
import { localeFor, resolveLanguage } from './language.ts'
import { placeholdersOf, translate } from './translate.ts'
import { vi } from './vi.ts'

const VND = { code: 'VND', digits: 0 }
const USD = { code: 'USD', digits: 2 }
// Intl separates some parts with no-break spaces; compare with plain ones.
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('catalogs', () => {
  it('give every Vietnamese message the same placeholders as the English one', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([...placeholdersOf(vi[key])].sort(), key).toEqual([...placeholdersOf(en[key])].sort())
    }
  })

  it('have no empty messages, and store Vietnamese in composed (NFC) form', () => {
    for (const catalog of [en, vi] as Catalog[]) {
      for (const message of Object.values(catalog)) {
        const forms: unknown[] = typeof message === 'string' ? [message] : Object.values(message)
        for (const text of forms.filter((form) => typeof form === 'string')) {
          expect(text.trim()).not.toBe('')
          expect(text).toBe(text.normalize('NFC'))
        }
      }
    }
  })
})

describe('translate', () => {
  const english = new Intl.PluralRules('en')

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('{name} paid {amount}', { name: 'Minh', amount: '₫5' }, english)).toBe(
      'Minh paid ₫5',
    )
    expect(translate('{name} paid', {}, english)).toBe('{name} paid')
  })

  it('picks plural forms by count, falling back to "other"', () => {
    const people = { one: '{count} person', other: '{count} people' }
    expect(translate(people, { count: 1 }, english)).toBe('1 person')
    expect(translate(people, { count: 4 }, english)).toBe('4 people')
    expect(translate({ other: '{count} người' }, { count: 1 }, new Intl.PluralRules('vi'))).toBe(
      '1 người',
    )
  })

  it('lists placeholders across every plural form', () => {
    expect(placeholdersOf({ one: '{count} x', other: '{count} {thing}' })).toEqual(
      new Set(['count', 'thing']),
    )
  })
})

describe('makeI18n', () => {
  it('translates and formats for its language', () => {
    const vn = makeI18n('vi', vi, 'vi-VN')
    expect(plain(vn.t('expenses.paidBy', { name: 'Minh', amount: vn.money(1_200_000, VND) }))).toBe(
      'Minh đã trả 1.200.000 ₫',
    )
    const us = makeI18n('en', en, 'en-US')
    expect(us.t('home.people', { count: 2 })).toBe('2 people')
    expect(us.day('2026-11-02', new Date(2026, 10, 2, 9))).toBe('Today')
    expect(us.relative(Date.UTC(2026, 10, 2), Date.UTC(2026, 10, 2) + 30_000)).toBe('just now')
  })
})

describe('formatMoney', () => {
  it('formats đồng and dollars the way each language writes them', () => {
    expect(plain(formatMoney(1_200_000, VND, 'vi-VN'))).toBe('1.200.000 ₫')
    expect(formatMoney(1_200_000, VND, 'en-US')).toBe('₫1,200,000')
    expect(formatMoney(1_250, USD, 'en-US')).toBe('$12.50')
    expect(plain(formatMoney(1_250, USD, 'vi-VN'))).toBe('12,50 US$')
  })

  it('stays exact for the largest amounts', () => {
    expect(formatMoney(99_999_999_999, USD, 'en-US')).toBe('$999,999,999.99')
  })
})

describe('formatPercent', () => {
  it('keeps two decimals', () => {
    expect(formatPercent(3_333, 'en-US')).toBe('33.33%')
    expect(formatPercent(5_000, 'vi-VN')).toBe('50%')
    expect(formatPercent(1_250, 'vi-VN')).toBe('12,5%')
  })
})

describe('dates', () => {
  const now = new Date(2026, 10, 2, 9, 30)
  const words = { today: 'Today', yesterday: 'Yesterday' }

  it('labels days relative to today, adding the year only when it differs', () => {
    expect(formatDay('2026-11-02', now, 'en-US', words)).toBe('Today')
    expect(formatDay('2026-11-01', now, 'en-US', words)).toBe('Yesterday')
    expect(formatDay('2026-10-31', now, 'en-US', words)).toBe('Sat, Oct 31')
    expect(formatDay('2025-12-31', now, 'en-US', words)).toBe('Wed, Dec 31, 2025')
  })

  it('formats months and today’s date', () => {
    expect(formatMonth('2026-11', 'en-US')).toBe('November 2026')
    expect(formatMonth('2026-11', 'vi-VN')).toBe('tháng 11 năm 2026')
    expect(todayIso(now)).toBe('2026-11-02')
  })

  it('says how long ago something happened', () => {
    const at = Date.UTC(2026, 10, 2, 12)
    expect(formatRelative(at, at + 5 * 60_000, 'en-US', 'just now')).toBe('5 minutes ago')
    expect(formatRelative(at, at + 5 * 60_000, 'vi-VN', 'vừa xong')).toBe('5 phút trước')
    expect(formatRelative(at, at + 26 * 3_600_000, 'en-US', 'just now')).toBe('yesterday')
    expect(formatRelative(at, at + 10_000, 'en-US', 'just now')).toBe('just now')
  })
})

describe('currencyName', () => {
  it('names currencies in the reader’s language', () => {
    expect(currencyName('VND', 'en-US')).toBe('Vietnamese Dong')
    expect(currencyName('VND', 'vi-VN')).toBe('Đồng Việt Nam')
  })
})

describe('language', () => {
  it('uses the saved choice, else the phone’s first supported language, else English', () => {
    expect(resolveLanguage('vi', ['en-US'])).toBe('vi')
    expect(resolveLanguage('system', ['fr-FR', 'vi-VN', 'en'])).toBe('vi')
    expect(resolveLanguage('system', ['en-GB'])).toBe('en')
    expect(resolveLanguage('system', ['fr-FR'])).toBe('en')
  })

  it('formats with the phone’s own variant of the language', () => {
    expect(localeFor('en', ['vi-VN', 'en-GB'])).toBe('en-GB')
    expect(localeFor('en', ['fr-FR'])).toBe('en-US')
    expect(localeFor('vi', ['en-US'])).toBe('vi-VN')
  })
})
