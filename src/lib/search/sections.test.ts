import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECTION_PREFS,
  SEARCH_SECTIONS,
  moveSection,
  parseSectionPrefs,
  setSectionOn,
  type SectionPref,
} from './sections'

describe('search sections', () => {
  it('starts with recent searches, recently played, your DJs and genres on', () => {
    expect(
      DEFAULT_SECTION_PREFS.filter((pref) => pref.on).map((pref) => pref.id),
    ).toEqual(['recent-searches', 'recently-played', 'your-djs', 'genres'])
    expect(DEFAULT_SECTION_PREFS).toHaveLength(SEARCH_SECTIONS.length)
  })

  it('uses the default when nothing readable is stored', () => {
    expect(parseSectionPrefs(null)).toBe(DEFAULT_SECTION_PREFS)
    expect(parseSectionPrefs('nope')).toBe(DEFAULT_SECTION_PREFS)
    expect(parseSectionPrefs('{"id":"genres"}')).toBe(DEFAULT_SECTION_PREFS)
  })

  it('keeps the stored order and switches, dropping unknown ids and repeats', () => {
    const stored = JSON.stringify([
      { id: 'genres', on: true },
      { id: 'gone-section', on: true },
      { id: 'recently-added', on: true },
      { id: 'genres', on: false },
      { id: 'recent-searches', on: false },
      { id: 'recently-played', on: true },
      { id: 'your-djs', on: true },
      { id: 'saved-sets', on: false },
    ])
    expect(parseSectionPrefs(stored)).toEqual([
      { id: 'genres', on: true },
      { id: 'recently-added', on: true },
      { id: 'recent-searches', on: false },
      { id: 'recently-played', on: true },
      { id: 'your-djs', on: true },
      { id: 'saved-sets', on: false },
    ])
  })

  it('appends a section the stored list does not name, off', () => {
    const stored = JSON.stringify([
      { id: 'your-djs', on: true },
      { id: 'recent-searches', on: true },
    ])
    const prefs = parseSectionPrefs(stored)
    expect(prefs.slice(0, 2)).toEqual([
      { id: 'your-djs', on: true },
      { id: 'recent-searches', on: true },
    ])
    expect(prefs.slice(2)).toEqual([
      { id: 'recently-played', on: false },
      { id: 'genres', on: false },
      { id: 'recently-added', on: false },
      { id: 'saved-sets', on: false },
    ])
  })

  it('moves a section up or down, and not past either end', () => {
    const prefs: SectionPref[] = [
      { id: 'recent-searches', on: true },
      { id: 'genres', on: true },
      { id: 'your-djs', on: false },
    ]
    expect(moveSection(prefs, 1, -1).map((pref) => pref.id)).toEqual([
      'genres',
      'recent-searches',
      'your-djs',
    ])
    expect(moveSection(prefs, 1, 1).map((pref) => pref.id)).toEqual([
      'recent-searches',
      'your-djs',
      'genres',
    ])
    expect(moveSection(prefs, 0, -1)).toBe(prefs)
    expect(moveSection(prefs, 2, 1)).toBe(prefs)
  })

  it('switches one section', () => {
    const prefs: SectionPref[] = [
      { id: 'recent-searches', on: true },
      { id: 'genres', on: false },
    ]
    expect(setSectionOn(prefs, 'genres', true)).toEqual([
      { id: 'recent-searches', on: true },
      { id: 'genres', on: true },
    ])
  })
})
