import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  currencyFromCode,
  decimalToMinor,
  isValidAmount,
  isValidCurrency,
  MAX_AMOUNT,
  minorToDecimal,
} from './money.ts'

describe('isValidAmount', () => {
  it('accepts whole minor units from 1 to the maximum', () => {
    expect(isValidAmount(1)).toBe(true)
    expect(isValidAmount(1_200_000)).toBe(true)
    expect(isValidAmount(MAX_AMOUNT)).toBe(true)
  })

  it('rejects zero, negatives, fractions, oversized values and non-numbers', () => {
    for (const value of [0, -1, 1.5, MAX_AMOUNT + 1, Number.NaN, Infinity, '5', null]) {
      expect(isValidAmount(value)).toBe(false)
    }
  })
})

describe('isValidCurrency', () => {
  it('accepts an ISO code with 0 to 4 minor digits', () => {
    expect(isValidCurrency({ code: 'VND', digits: 0 })).toBe(true)
    expect(isValidCurrency({ code: 'KWD', digits: 3 })).toBe(true)
  })

  it('rejects malformed codes, digits and extra keys', () => {
    expect(isValidCurrency({ code: 'vnd', digits: 0 })).toBe(false)
    expect(isValidCurrency({ code: 'VND', digits: 5 })).toBe(false)
    expect(isValidCurrency({ code: 'VND', digits: 1.5 })).toBe(false)
    expect(isValidCurrency({ code: 'VND', digits: 0, symbol: '₫' })).toBe(false)
    expect(isValidCurrency('VND')).toBe(false)
  })
})

describe('currencyFromCode', () => {
  it('reads minor digits from Intl', () => {
    expect(currencyFromCode('VND')).toEqual({ code: 'VND', digits: 0 })
    expect(currencyFromCode('USD')).toEqual({ code: 'USD', digits: 2 })
    expect(currencyFromCode('JPY')).toEqual({ code: 'JPY', digits: 0 })
    expect(currencyFromCode('KWD')).toEqual({ code: 'KWD', digits: 3 })
  })

  it('returns null for unknown or malformed codes', () => {
    expect(currencyFromCode('ABC')).toBeNull()
    expect(currencyFromCode('usd')).toBeNull()
    expect(currencyFromCode('US')).toBeNull()
  })
})

describe('minorToDecimal', () => {
  it('places the decimal point by the currency digits', () => {
    expect(minorToDecimal(123_450, 2)).toBe('1234.50')
    expect(minorToDecimal(5, 2)).toBe('0.05')
    expect(minorToDecimal(0, 2)).toBe('0.00')
    expect(minorToDecimal(7, 3)).toBe('0.007')
    expect(minorToDecimal(1_200_000, 0)).toBe('1200000')
    expect(minorToDecimal(-5, 2)).toBe('-0.05')
  })
})

describe('decimalToMinor', () => {
  it('parses plain decimals', () => {
    expect(decimalToMinor('1234.5', 2)).toBe(123_450)
    expect(decimalToMinor('0.05', 2)).toBe(5)
    expect(decimalToMinor('12', 0)).toBe(12)
    expect(decimalToMinor('007', 0)).toBe(7)
  })

  it('rejects malformed text and more precision than the currency has', () => {
    for (const text of ['', 'abc', '1e5', '-5', '1,000', '.5', '5.', '12.5x']) {
      expect(decimalToMinor(text, 2)).toBeNull()
    }
    expect(decimalToMinor('12.5', 0)).toBeNull()
    expect(decimalToMinor('1.234', 2)).toBeNull()
    expect(decimalToMinor('9'.repeat(20), 0)).toBeNull()
  })

  it('round-trips with minorToDecimal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e15 }),
        fc.integer({ min: 0, max: 4 }),
        (amount, digits) => {
          expect(decimalToMinor(minorToDecimal(amount, digits), digits)).toBe(amount)
        },
      ),
    )
  })
})
