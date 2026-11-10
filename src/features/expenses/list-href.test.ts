import { describe, expect, it } from 'vitest'

import { listHref } from './list-href.ts'

describe('listHref', () => {
  it('goes back to the list with the filters it had', () => {
    expect(listHref('g1', { listSearch: '?q=pho&c=food' })).toBe('/g/g1?q=pho&c=food')
  })

  it('goes back to the plain list without them', () => {
    for (const state of [null, undefined, {}, { listSearch: '' }, { listSearch: 42 }, 'x']) {
      expect(listHref('g1', state)).toBe('/g/g1')
    }
  })

  it('ignores anything that isn’t a query string', () => {
    expect(listHref('g1', { listSearch: '/elsewhere' })).toBe('/g/g1')
    expect(listHref('g1', { listSearch: '?q=a#secret' })).toBe('/g/g1')
  })
})
