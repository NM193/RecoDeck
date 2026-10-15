import { describe, expect, it } from 'vitest'
import type { MissingCandidate, MissingTrack } from '../../types/track'
import {
  actionLabel,
  buildFixes,
  chooseFile,
  emptyChoice,
  locate,
  pruneChoice,
  rowViews,
  setState,
  withLocated,
} from './missingChoice'

function file(
  path: string,
  duration_ms: number | null = 300_000,
  library_track_id: number | null = null,
): MissingCandidate {
  return { path, duration_ms, file_size: 1, library_track_id }
}

function missing(
  id: number,
  candidates: MissingCandidate[] = [],
  extra: Partial<MissingTrack> = {},
): MissingTrack {
  return {
    id,
    file_path: `/gone/${id}.mp3`,
    file_hash: String(id),
    title: `Song ${id}`,
    duration_ms: 300_000,
    play_count: 0,
    rating: 0,
    playlists: [],
    analyzed: false,
    plays: 0,
    drive_missing: null,
    candidates,
    ...extra,
  }
}

describe('defaults', () => {
  it('starts on fix when the chosen file has the same length (within 2 s)', () => {
    const t = missing(1, [file('/m/a.mp3', 301_500)])
    expect(rowViews([t], emptyChoice()).get(1)?.state).toBe('fix')
  })

  it('starts on leave when the length differs, is unknown, or there is no file', () => {
    const tracks = [
      missing(1, [file('/m/a.mp3', 190_000)]),
      missing(2, [file('/m/b.mp3', null)]),
      missing(3),
    ]
    const views = rowViews(tracks, emptyChoice())
    expect(views.get(1)?.state).toBe('leave')
    expect(views.get(1)?.lengthDiffers).toBe(true)
    expect(views.get(2)?.state).toBe('leave')
    expect(views.get(2)?.lengthDiffers).toBe(false)
    expect(views.get(3)?.state).toBe('leave')
  })

  it('starts on leave when the drive is not connected, even with a matching length', () => {
    const t = missing(1, [file('/m/a.mp3')], { drive_missing: 'USB' })
    expect(rowViews([t], emptyChoice()).get(1)?.state).toBe('leave')
  })

  it('chooses the first file whose length matches, else the first', () => {
    const t = missing(1, [file('/m/a.mp3', 100_000), file('/m/b.mp3')])
    expect(rowViews([t], emptyChoice()).get(1)?.candidate?.path).toBe(
      '/m/b.mp3',
    )
    const u = missing(2, [file('/m/c.mp3', 1), file('/m/d.mp3', 2)])
    expect(rowViews([u], emptyChoice()).get(2)?.candidate?.path).toBe(
      '/m/c.mp3',
    )
  })
})

describe('merge vs relink', () => {
  it('comes from the chosen file', () => {
    const t = missing(1, [file('/m/a.mp3', 300_000, 77), file('/m/b.mp3')])
    const views = rowViews([t], emptyChoice())
    expect(views.get(1)?.merge).toBe(true)
    const other = rowViews([t], chooseFile(emptyChoice(), 1, '/m/b.mp3'))
    expect(other.get(1)?.merge).toBe(false)
  })
})

describe('conflicts', () => {
  const shared = file('/m/same.mp3')

  it('lets only the lower id relink a shared free file', () => {
    const views = rowViews(
      [missing(5, [shared]), missing(2, [shared])],
      emptyChoice(),
    )
    expect(views.get(2)?.state).toBe('fix')
    expect(views.get(5)?.state).toBe('leave')
    expect(views.get(5)?.selected).toBe('fix')
    expect(views.get(5)?.blockedBy?.id).toBe(2)
  })

  it('gives the blocked choice back when its blocker goes to leave', () => {
    const tracks = [missing(2, [shared]), missing(5, [shared])]
    const views = rowViews(tracks, setState(emptyChoice(), 2, 'leave'))
    expect(views.get(5)?.state).toBe('fix')
    expect(views.get(5)?.blockedBy).toBeUndefined()
  })

  it('allows two rows to merge into one library track', () => {
    const lib = file('/m/lib.mp3', 300_000, 9)
    const fixes = buildFixes(
      [missing(1, [lib]), missing(2, [lib])],
      emptyChoice(),
    )
    expect(fixes.merges).toEqual([
      { keep_id: 9, remove_id: 1 },
      { keep_id: 9, remove_id: 2 },
    ])
  })
})

describe('picked files', () => {
  it('locate makes the picked file the chosen one, set to fix', () => {
    const t = missing(1)
    const choice = locate(emptyChoice(), 1, file('/m/picked.mp3', 1))
    const view = rowViews([t], choice).get(1)
    expect(view?.candidates.map((c) => c.path)).toEqual(['/m/picked.mp3'])
    expect(view?.state).toBe('fix')
  })

  it('keeps choices across a reload, and untouched rows take new defaults', () => {
    const before = [missing(1, [file('/m/a.mp3')]), missing(2)]
    const choice = setState(emptyChoice(), 1, 'remove')
    const after = [
      missing(1, [file('/m/a.mp3')]),
      missing(2, [file('/m/b.mp3')]),
    ]
    const views = rowViews(after, choice)
    expect(rowViews(before, choice).get(2)?.state).toBe('leave')
    expect(views.get(1)?.state).toBe('remove')
    expect(views.get(2)?.state).toBe('fix')
  })

  it('a picked file described again replaces the old description', () => {
    const t = missing(1)
    const choice = locate(emptyChoice(), 1, file('/m/p.mp3'))
    const again = withLocated(
      choice,
      new Map([[1, file('/m/p.mp3', 300_000, 4)]]),
    )
    expect(rowViews([t], again).get(1)?.merge).toBe(true)
  })

  it('sends a row to leave when its chosen file is no longer offered', () => {
    const chosen = chooseFile(emptyChoice(), 1, '/m/b.mp3')
    const after = [missing(1, [file('/m/a.mp3')])]
    expect(rowViews(after, chosen).get(1)?.state).toBe('leave')

    const picked = withLocated(
      locate(emptyChoice(), 1, file('/m/picked.mp3')),
      new Map(),
    )
    expect(rowViews(after, picked).get(1)?.state).toBe('leave')
  })
})

describe('stale lists', () => {
  it('never merges into a track that is itself in the list', () => {
    const tracks = [missing(1, [file('/m/x.mp3', 300_000, 2)]), missing(2)]
    expect(rowViews(tracks, emptyChoice()).get(1)?.state).toBe('leave')
    expect(buildFixes(tracks, emptyChoice()).merges).toEqual([])
  })
})

describe('pruneChoice', () => {
  const reloaded = [missing(1, [file('/m/a.mp3')])]

  it('forgets a chosen file that is gone, so Relink works again', () => {
    const chosen = chooseFile(emptyChoice(), 1, '/m/b.mp3')
    const pruned = pruneChoice(reloaded, chosen)
    expect(rowViews(reloaded, pruned).get(1)?.state).toBe('leave')
    const fixed = rowViews(reloaded, setState(pruned, 1, 'fix')).get(1)
    expect(fixed?.state).toBe('fix')
    expect(fixed?.candidate?.path).toBe('/m/a.mp3')
  })

  it('keeps a chosen file that is still offered', () => {
    const chosen = chooseFile(emptyChoice(), 1, '/m/a.mp3')
    const pruned = pruneChoice(reloaded, chosen)
    expect(pruned.chosen.get(1)).toBe('/m/a.mp3')
    expect(rowViews(reloaded, pruned).get(1)?.state).toBe('fix')
  })

  it('keeps remove when the chosen file is gone', () => {
    const chosen = setState(
      chooseFile(emptyChoice(), 1, '/m/b.mp3'),
      1,
      'remove',
    )
    const pruned = pruneChoice(reloaded, chosen)
    expect(rowViews(reloaded, pruned).get(1)?.state).toBe('remove')
  })
})

describe('buildFixes and actionLabel', () => {
  it('builds relinks, merges and removes, and labels the button', () => {
    const tracks = [
      missing(1, [file('/m/a.mp3')]),
      missing(2, [file('/m/lib.mp3', 300_000, 9)]),
      missing(3),
      missing(4),
    ]
    const choice = setState(emptyChoice(), 3, 'remove')
    const fixes = buildFixes(tracks, choice)
    expect(fixes).toEqual({
      relinks: [{ track_id: 1, path: '/m/a.mp3' }],
      merges: [{ keep_id: 9, remove_id: 2 }],
      removes: [3],
    })
    expect(actionLabel(fixes)).toBe('Relink 1 · Merge 1 · Remove 1')
    expect(actionLabel({ relinks: [], merges: [], removes: [] })).toBe(
      'Nothing to apply',
    )
  })
})
