import { describe, expect, it } from 'vitest'

import { foldOps } from '../../domain/fold.ts'
import { Device, GROUP_ID, id, VND } from '../../domain/testing.ts'
import {
  byDay,
  filtersToSearch,
  isFiltered,
  itemMatches,
  keyOf,
  listItems,
  monthsOf,
  NO_FILTERS,
  parseFilters,
} from './filters.ts'

const MINH = id('minh')
const AN = id('an')
const LINH = id('linh')
const names: Record<string, string> = { [MINH]: 'Minh', [AN]: 'An', [LINH]: 'Linh' }
const name = (member: string) => names[member] ?? '?'

function state() {
  const device = new Device('minh')
  const expense = (key: string, title: string, date: string, paidBy: string, among: string[]) =>
    device.op(MINH, 'expense', id(key), {
      title,
      money: { amount: 100, paidBy, split: { mode: 'equal', among } },
      date,
      category: key === 'taxi' ? 'transport' : 'food',
    })
  return foldOps(GROUP_ID, [
    device.op(MINH, 'group', GROUP_ID, { name: 'Trip', currency: VND }),
    ...[MINH, AN, LINH].map((member) => device.op(MINH, 'member', member, { name: name(member) })),
    expense('pho', 'Phở Thìn', '2026-10-30', MINH, [MINH, AN]),
    expense('taxi', 'Taxi', '2026-11-02', AN, [AN, LINH]),
    expense('coffee', 'Cà phê', '2026-11-02', LINH, [LINH]),
    device.op(MINH, 'payment', id('pay'), {
      money: { amount: 50, from: AN, to: MINH },
      date: '2026-11-01',
    }),
    expense('gone', 'Deleted', '2026-11-02', MINH, [MINH]),
    device.op(MINH, 'expense', id('gone'), { deleted: true }),
  ])
}

const keysMatching = (filters: Partial<typeof NO_FILTERS>) =>
  listItems(state())
    .filter((item) => itemMatches(item, { ...NO_FILTERS, ...filters }, name))
    .map(keyOf)

describe('listItems', () => {
  it('lists live items newest first, the latest added first within a day', () => {
    expect(listItems(state()).map(keyOf)).toEqual([id('coffee'), id('taxi'), id('pay'), id('pho')])
  })
})

describe('itemMatches', () => {
  it('searches titles and names, ignoring accents', () => {
    expect(keysMatching({ query: 'pho' })).toEqual([id('pho')])
    expect(keysMatching({ query: 'an' })).toEqual([id('taxi'), id('pay')])
  })

  it('filters by person, month, category and type', () => {
    expect(keysMatching({ person: LINH })).toEqual([id('coffee'), id('taxi')])
    expect(keysMatching({ person: MINH })).toEqual([id('pay'), id('pho')])
    expect(keysMatching({ month: '2026-10' })).toEqual([id('pho')])
    expect(keysMatching({ category: 'transport' })).toEqual([id('taxi')])
    expect(keysMatching({ type: 'payments' })).toEqual([id('pay')])
    expect(keysMatching({ type: 'expenses', month: '2026-11' })).toEqual([id('coffee'), id('taxi')])
  })
})

describe('the URL', () => {
  it('round-trips filters, dropping empty and unknown values', () => {
    const filters = {
      query: 'phở',
      person: AN,
      month: '2026-11',
      category: 'food',
      type: 'payments',
    } as const
    expect(parseFilters(filtersToSearch(filters))).toEqual(filters)
    expect(filtersToSearch(NO_FILTERS)).toBe('')
    expect(parseFilters('?m=soon&c=travel&t=all')).toEqual(NO_FILTERS)
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(isFiltered({ ...NO_FILTERS, month: '2026-11' })).toBe(true)
  })
})

describe('monthsOf and byDay', () => {
  it('list months newest first and group items under their date', () => {
    const items = listItems(state())
    expect(monthsOf(items)).toEqual(['2026-11', '2026-10'])
    expect(byDay(items).map((day) => [day.date, day.items.map(keyOf)])).toEqual([
      ['2026-11-02', [id('coffee'), id('taxi')]],
      ['2026-11-01', [id('pay')]],
      ['2026-10-30', [id('pho')]],
    ])
  })
})
