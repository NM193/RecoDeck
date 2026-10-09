import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_SEARCHES,
  forgetSearch,
  rememberSearch,
} from './recentSearches'

describe('recent searches', () => {
  it('puts a new search in front, trimmed', () => {
    expect(rememberSearch(['afro house'], '  traumer ')).toEqual([
      'traumer',
      'afro house',
    ])
  })

  it('moves a repeat to the front instead of adding it, ignoring case', () => {
    expect(
      rememberSearch(['traumer', 'Afro House', 'capriati'], 'afro house'),
    ).toEqual(['afro house', 'traumer', 'capriati'])
  })

  it('ignores an empty search', () => {
    const list = ['traumer']
    expect(rememberSearch(list, '   ')).toBe(list)
  })

  it(`keeps the newest ${MAX_RECENT_SEARCHES}`, () => {
    const list = Array.from({ length: MAX_RECENT_SEARCHES }, (_, i) => `q${i}`)
    const next = rememberSearch(list, 'new')
    expect(next).toHaveLength(MAX_RECENT_SEARCHES)
    expect(next[0]).toBe('new')
    expect(next).not.toContain(`q${MAX_RECENT_SEARCHES - 1}`)
  })

  it('forgets one search in any case', () => {
    expect(forgetSearch(['traumer', 'capriati'], 'Traumer')).toEqual([
      'capriati',
    ])
  })
})
