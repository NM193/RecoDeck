/**
 * The budget rule for unattended import.
 *
 * This is the only place in the feature where the app spends someone's quota
 * with nobody watching, so the arithmetic is tested rather than reasoned about.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted, so importSet gets the mock rather than the real bridge.
vi.mock('../tauri-api', () => ({
  tauriApi: {
    fetchYouTubeSet: vi.fn(),
    saveYouTubeSet: vi.fn(),
  },
}))

import { tauriApi } from '../tauri-api'
import {
  AUTO_IMPORT_MAX,
  AUTO_IMPORT_RESERVE,
  SET_COST_UNITS,
  importSet,
  setsToAutoImport,
} from './importSet'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `video${i}`)

describe('what may be imported without being asked', () => {
  it('never spends into the reserve', () => {
    // A full day buys plenty, so the cap is what bites.
    expect(setsToAutoImport(ids(10), 10_000)).toHaveLength(AUTO_IMPORT_MAX)

    // At the reserve exactly, and below it, nothing goes.
    expect(setsToAutoImport(ids(10), AUTO_IMPORT_RESERVE)).toEqual([])
    expect(setsToAutoImport(ids(10), 0)).toEqual([])
    expect(setsToAutoImport(ids(10), 500)).toEqual([])
  })

  it('takes only what the remainder actually pays for', () => {
    // 21 units over the reserve buys three sets at seven, not four.
    const left = AUTO_IMPORT_RESERVE + 3 * SET_COST_UNITS
    expect(setsToAutoImport(ids(10), left)).toHaveLength(3)
    expect(setsToAutoImport(ids(10), left + SET_COST_UNITS - 1)).toHaveLength(3)
  })

  it('imports in the order it was given, and never more than exists', () => {
    expect(setsToAutoImport(['a', 'b'], 10_000)).toEqual(['a', 'b'])
    expect(setsToAutoImport([], 10_000)).toEqual([])
  })
})

/**
 * The automatic run filed a set with nought tracks into the library on its own.
 * Nobody chose to add it, so it has to earn the row.
 */
describe('what a set has to be worth before it is filed', () => {
  const video = {
    id: 'abc12345678',
    url: 'https://youtu.be/abc12345678',
    title: 'Somebody @ Somewhere',
    channel: 'A Channel',
    publishedAt: '2026-09-01T00:00:00Z',
    durationMs: 7_200_000,
  }

  const rawWith = (description: string) => ({
    video: { ...video, description },
    comments: [],
    fetchedAt: '2026-09-08T00:00:00.000Z',
  })

  const A_REAL_LIST = `0:00 Mathias Kaden - Soulmakers
4:30 Superlounge - Your Life
7:30 Blaze - Lovelee Dae
13:00 Luciano Garrido - El Nuevo Misterio
18:20 Jimi Jules - My City's On Fire`

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tauriApi.saveYouTubeSet).mockResolvedValue(undefined)
  })

  it('files a set that parsed to something', async () => {
    vi.mocked(tauriApi.fetchYouTubeSet).mockResolvedValue(rawWith(A_REAL_LIST))

    const { parsed, stored } = await importSet(video.id, { onlyIfTracks: true })

    expect(parsed.trackCount).toBe(5)
    expect(stored).toBe(true)
    expect(tauriApi.saveYouTubeSet).toHaveBeenCalledTimes(1)
  })

  it('withholds one that parsed to nothing, having already paid to find out', async () => {
    vi.mocked(tauriApi.fetchYouTubeSet).mockResolvedValue(
      rawWith('Subscribe for more. Follow us everywhere.'),
    )

    const { parsed, stored } = await importSet(video.id, { onlyIfTracks: true })

    expect(parsed.trackCount).toBe(0)
    expect(stored).toBe(false)
    // The fetch happened — the units were spent before anything could be judged.
    expect(tauriApi.fetchYouTubeSet).toHaveBeenCalledTimes(1)
    // The library did not.
    expect(tauriApi.saveYouTubeSet).not.toHaveBeenCalled()
  })

  it('files an empty set anyway when a person asked for it', async () => {
    vi.mocked(tauriApi.fetchYouTubeSet).mockResolvedValue(rawWith('Nothing here.'))

    const { stored } = await importSet(video.id)

    expect(stored).toBe(true)
    expect(tauriApi.saveYouTubeSet).toHaveBeenCalledTimes(1)
  })
})
