import { describe, expect, it } from 'vitest'

import { matchesSearch, searchable } from './search.ts'

describe('searchable', () => {
  it('drops case and Vietnamese accents', () => {
    expect(searchable('Phở Thìn')).toBe('pho thin')
    expect(searchable('Đà Lạt')).toBe('da lat')
    expect(searchable('Cà phê sữa đá')).toBe('ca phe sua da')
  })
})

describe('matchesSearch', () => {
  it('finds every word of the query, in any order, ignoring accents', () => {
    expect(matchesSearch('Phở Thìn', 'pho')).toBe(true)
    expect(matchesSearch('Taxi to Đà Lạt', 'lat taxi')).toBe(true)
    expect(matchesSearch('Taxi to Đà Lạt', 'đà')).toBe(true)
    expect(matchesSearch('Taxi', 'bus')).toBe(false)
  })

  it('matches everything when the query is blank', () => {
    expect(matchesSearch('Dinner', '   ')).toBe(true)
  })
})
