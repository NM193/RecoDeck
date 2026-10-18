import { describe, expect, it } from 'vitest'
import type { AnalysisStatus } from '../types/track'
import { reanalyzeHint, shouldPromptReanalysis } from './reanalysis'

const status = (over: Partial<AnalysisStatus> = {}): AnalysisStatus => ({
  version: 1,
  needing: 40,
  with_old_values: 30,
  estimate_minutes: 5,
  ...over,
})

describe('shouldPromptReanalysis', () => {
  it('asks once per version, when there is older analysis', () => {
    expect(shouldPromptReanalysis(status(), null)).toBe(true)
    expect(shouldPromptReanalysis(status(), '0')).toBe(true)
    expect(shouldPromptReanalysis(status(), '1')).toBe(false)
    expect(shouldPromptReanalysis(status({ version: 2 }), '1')).toBe(true)
  })

  it('never for a library with no older analysis', () => {
    expect(shouldPromptReanalysis(status({ with_old_values: 0 }), null)).toBe(
      false,
    )
  })

  it('not again for a newer stored version', () => {
    expect(shouldPromptReanalysis(status(), '2')).toBe(false)
  })

  it('reads a broken setting as never asked', () => {
    expect(shouldPromptReanalysis(status(), 'x')).toBe(true)
  })
})

describe('reanalyzeHint', () => {
  it('counts the tracks and the minutes', () => {
    expect(reanalyzeHint(status())).toBe(
      "40 tracks aren't analyzed with the current version (about 5 min).",
    )
    expect(reanalyzeHint(status({ needing: 1 }))).toBe(
      "1 track isn't analyzed with the current version (about 5 min).",
    )
  })

  it('formats big counts', () => {
    expect(reanalyzeHint(status({ needing: 8000 }))).toContain(
      '8,000 tracks aren',
    )
  })

  it('says when everything is current', () => {
    expect(reanalyzeHint(status({ needing: 0 }))).toBe(
      'All tracks use the current analysis.',
    )
  })
})
