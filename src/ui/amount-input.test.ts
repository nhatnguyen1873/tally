import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  amountOf,
  caretFor,
  displayAmount,
  numberSymbols,
  readAmountText,
  typedCharacters,
} from './amount-input.ts'

const VI = numberSymbols('vi-VN')
const EN = numberSymbols('en-US')

describe('numberSymbols', () => {
  it('reads each locale’s separators', () => {
    expect(VI).toEqual({ decimal: ',', group: '.' })
    expect(EN).toEqual({ decimal: '.', group: ',' })
  })
})

describe('readAmountText', () => {
  it('groups đồng as you type', () => {
    expect(readAmountText('1200000', 0, VI)).toEqual({ display: '1.200.000', decimal: '1200000' })
    expect(readAmountText('1.200.0005', 0, VI)).toEqual({
      display: '12.000.005',
      decimal: '12000005',
    })
    expect(readAmountText('1200000', 0, EN).display).toBe('1,200,000')
  })

  it('keeps one decimal separator, and only as many decimals as the currency has', () => {
    expect(readAmountText('12,5', 2, VI)).toEqual({ display: '12,5', decimal: '12.5' })
    expect(readAmountText('1234.567', 2, EN)).toEqual({ display: '1,234.56', decimal: '1234.56' })
    expect(readAmountText('12.5.3', 2, EN).decimal).toBe('12.53')
    expect(readAmountText('.5', 2, EN)).toEqual({ display: '0.5', decimal: '0.5' })
  })

  it('ignores decimals for currencies without them, and anything that isn’t a number', () => {
    expect(readAmountText('12,5', 0, VI).decimal).toBe('125')
    expect(readAmountText('₫ 1a2-3', 0, VI).decimal).toBe('123')
    expect(readAmountText('', 0, VI)).toEqual({ display: '', decimal: '' })
  })

  it('drops leading zeros', () => {
    expect(readAmountText('0007', 0, VI).decimal).toBe('7')
    expect(readAmountText('0', 0, VI).decimal).toBe('0')
    expect(readAmountText('00.50', 2, EN).decimal).toBe('0.50')
  })

  it('stops taking digits before an amount stops being a safe integer', () => {
    expect(readAmountText('9'.repeat(20), 0, EN).decimal).toBe('9'.repeat(15))
    expect(readAmountText(`${'9'.repeat(20)}.99`, 2, EN).decimal).toBe(`${'9'.repeat(13)}.99`)
    expect(amountOf(readAmountText('9'.repeat(20), 0, EN).decimal, 0)).toBe(999_999_999_999_999)
    expect(amountOf(readAmountText('9'.repeat(20), 4, EN).decimal, 4)).toBe(999_999_999_990_000)
  })
})

describe('amountOf and displayAmount', () => {
  it('turn field text into minor units and back', () => {
    expect(amountOf('1200000', 0)).toBe(1_200_000)
    expect(amountOf('12.5', 2)).toBe(1_250)
    expect(amountOf('12.', 2)).toBe(1_200)
    expect(amountOf('', 2)).toBeNull()
    expect(amountOf('9'.repeat(20), 0)).toBeNull()
    expect(displayAmount(1_250, 2, VI)).toBe('12,50')
    expect(displayAmount(1_200_000, 0, EN)).toBe('1,200,000')
    expect(displayAmount(null, 0, EN)).toBe('')
  })

  it('round-trip any amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000_000 }),
        fc.integer({ min: 0, max: 3 }),
        fc.constantFrom(VI, EN),
        (amount, digits, symbols) => {
          const shown = displayAmount(amount, digits, symbols)
          expect(amountOf(readAmountText(shown, digits, symbols).decimal, digits)).toBe(amount)
        },
      ),
    )
  })
})

describe('caret placement', () => {
  it('stays after the same typed character when grouping shifts the text', () => {
    // Typing "5" after "1.200.000" makes "1.200.0005", shown as "12.000.005".
    const raw = '1.200.0005'
    const typed = typedCharacters(raw, VI)
    expect(typed).toBe(8)
    expect(caretFor('12.000.005', typed, VI)).toBe(10)
    // Caret after the "2" in "1.2|00.000" (2 typed characters).
    expect(caretFor('1.200.000', 2, VI)).toBe(3)
    expect(caretFor('1.200.000', 0, VI)).toBe(0)
    expect(caretFor('12', 9, VI)).toBe(2)
  })
})
