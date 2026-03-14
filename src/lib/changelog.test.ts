import { describe, it, expect, vi } from 'vitest'

// Mock the CHANGELOG.md raw import so vitest can handle it
// (Vite-only ?raw imports are not supported in vitest without a plugin)
vi.mock('../../CHANGELOG.md?raw', () => {
  return {
    default: `# Changelog

All notable changes to RecoDeck will be documented in this file.

## [Unreleased]

## [0.2.5] - 2026-03-06

### Added
- Waveform visualizer in the Now Playing bar
- Crossfade between tracks with adjustable duration
- "What's New" dialog on startup after updates
- Redesigned Settings with organized sections

### Changed
- More accurate key detection — re-analyze tracks to benefit
- Improved BPM detection accuracy
- Better harmonic mixing compatibility scoring

### Fixed
- Track table now fills full window width at any size

## [0.2.4] - 2026-02-16

### Added
- **Mini Player** – compact floating player view (\`#mini-player\`)

### Changed
- Updated icons and app branding

## [0.2.2] - 2026-02-15

### Fixed
- Version sync in release builds
`,
  }
})

import { getChangesForVersion } from './changelog'

describe('getChangesForVersion', () => {
  it('returns an object with added, changed, and fixed arrays for a known version', () => {
    const result = getChangesForVersion('0.2.5')
    expect(result).toHaveProperty('added')
    expect(result).toHaveProperty('changed')
    expect(result).toHaveProperty('fixed')
    expect(Array.isArray(result.added)).toBe(true)
    expect(Array.isArray(result.changed)).toBe(true)
    expect(Array.isArray(result.fixed)).toBe(true)
  })

  it('returns correct items from each subsection for version 0.2.5', () => {
    const result = getChangesForVersion('0.2.5')
    expect(result.added).toContain('Waveform visualizer in the Now Playing bar')
    expect(result.added).toContain('Crossfade between tracks with adjustable duration')
    expect(result.added).toContain('"What\'s New" dialog on startup after updates')
    expect(result.added).toContain('Redesigned Settings with organized sections')
    expect(result.changed).toContain('More accurate key detection — re-analyze tracks to benefit')
    expect(result.changed).toContain('Improved BPM detection accuracy')
    expect(result.changed).toContain('Better harmonic mixing compatibility scoring')
    expect(result.fixed).toContain('Track table now fills full window width at any size')
  })

  it('returns all empty arrays for an unknown version', () => {
    const result = getChangesForVersion('9.9.9')
    expect(result).toEqual({ added: [], changed: [], fixed: [] })
  })

  it('returns empty arrays for missing subsections when version has only one section', () => {
    // 0.2.2 only has a Fixed section, no Added or Changed
    const result = getChangesForVersion('0.2.2')
    expect(result.added).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.fixed).toContain('Version sync in release builds')
  })
})
