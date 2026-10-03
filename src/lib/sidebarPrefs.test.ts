import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_BELOW,
  DEFAULT_COLOURS,
  PALETTE,
  SECTION_LABELS,
  colourFor,
  collapseOnResize,
  initialCollapsed,
  parseColours,
  sectionForView,
} from './sidebarPrefs'

describe('collapsing the sidebar', () => {
  describe('at start-up', () => {
    it('uses the stored choice on a wide window', () => {
      expect(initialCollapsed('true', 1400)).toBe(true)
      expect(initialCollapsed('false', 1400)).toBe(false)
    })

    it('starts expanded when nothing was ever stored', () => {
      expect(initialCollapsed(null, 1400)).toBe(false)
    })

    it('ignores a stored value it does not recognise', () => {
      expect(initialCollapsed('yes', 1400)).toBe(false)
    })

    it('always starts collapsed on a narrow window', () => {
      expect(initialCollapsed('false', COLLAPSE_BELOW - 1)).toBe(true)
      expect(initialCollapsed(null, 800)).toBe(true)
    })
  })

  describe('on a window resize', () => {
    it('collapses when the window crosses below the line', () => {
      expect(collapseOnResize(1200, 1000)).toBe(true)
    })

    it('expands when the window crosses back above it', () => {
      expect(collapseOnResize(1000, 1200)).toBe(false)
    })

    it('treats exactly the line as wide', () => {
      expect(collapseOnResize(COLLAPSE_BELOW - 1, COLLAPSE_BELOW)).toBe(false)
      expect(collapseOnResize(COLLAPSE_BELOW, COLLAPSE_BELOW - 1)).toBe(true)
    })

    it('leaves a manual choice alone while staying on one side', () => {
      expect(collapseOnResize(1400, 1200)).toBeNull()
      expect(collapseOnResize(900, 1000)).toBeNull()
    })
  })
})

describe('section colours', () => {
  it('offers eight swatches that include every default', () => {
    expect(PALETTE).toHaveLength(8)
    for (const hex of new Set(Object.values(DEFAULT_COLOURS))) {
      expect(PALETTE).toContain(hex)
    }
  })

  it('reads stored overrides', () => {
    expect(parseColours('{"sets":"#FACC15"}')).toEqual({ sets: '#facc15' })
  })

  it('ignores unknown sections and invalid colours', () => {
    expect(
      parseColours(
        '{"sets":"orange","nope":"#ffffff","home":"#12345","search":"#2dd4bf","toString":"#ffffff"}',
      ),
    ).toEqual({ search: '#2dd4bf' })
  })

  it('wants the six-digit form the colour input needs', () => {
    expect(parseColours('{"sets":"#fff"}')).toEqual({})
  })

  it('treats nothing, garbage and non-objects as no overrides', () => {
    expect(parseColours(null)).toEqual({})
    expect(parseColours('not json')).toEqual({})
    expect(parseColours('["#ffffff"]')).toEqual({})
    expect(parseColours('null')).toEqual({})
  })

  it('falls back to the default when a section has no override', () => {
    expect(colourFor('sets', {})).toBe(DEFAULT_COLOURS.sets)
    expect(colourFor('sets', { sets: '#facc15' })).toBe('#facc15')
  })

  it('lights the section the active view belongs to', () => {
    expect(sectionForView('home')).toBe('home')
    expect(sectionForView('all-tracks')).toBe('all-tracks')
    expect(sectionForView('folder')).toBe('folders')
    expect(sectionForView('playlist')).toBe('playlists')
    expect(sectionForView('sets')).toBe('sets')
    expect(sectionForView('search')).toBe('search')
    expect(sectionForView('ai-chat')).toBe('ai-chat')
  })

  it('lights nothing for Settings', () => {
    expect(sectionForView('settings')).toBeNull()
  })
})

describe('section labels', () => {
  it('has a non-empty label for every section', () => {
    for (const section of Object.keys(
      DEFAULT_COLOURS,
    ) as (keyof typeof DEFAULT_COLOURS)[]) {
      expect(SECTION_LABELS[section]).toBeTruthy()
    }
  })
})
