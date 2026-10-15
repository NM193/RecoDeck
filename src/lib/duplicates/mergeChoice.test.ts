import { describe, expect, it } from 'vitest'
import type { DuplicateGroup, DuplicateTrack } from '../../types/track'
import {
  allMerged,
  buildMerges,
  initialChoice,
  mergeCount,
  pickKeep,
  rowState,
  setMergeAll,
  slotsMoving,
  toggleMerge,
} from './mergeChoice'

function copy(id: number, playlistIds: number[] = []): DuplicateTrack {
  return {
    id,
    file_path: `/m/${id}.mp3`,
    file_hash: String(id),
    play_count: 0,
    rating: 0,
    playlists: playlistIds.map((p) => ({ id: p, name: `P${p}` })),
    analyzed: false,
    plays: 0,
  }
}

function group(ids: number[], recommended: number): DuplicateGroup {
  return {
    detection_reason: 'same_title_artist',
    recommended_keep_id: recommended,
    recommend_reason: 'added first',
    tracks: ids.map((id) => copy(id)),
  }
}

describe('mergeChoice', () => {
  const g1 = group([1, 2, 3], 2)
  const g2 = group([4, 5], 4)

  it('keeps the recommended copy and merges every other one', () => {
    const c = initialChoice([g1, g2])
    expect(rowState(c, g1, 2)).toBe('keep')
    expect(rowState(c, g1, 1)).toBe('merge')
    expect(rowState(c, g1, 3)).toBe('merge')
    expect(buildMerges(c, [g1, g2])).toEqual([
      { keep_id: 2, remove_ids: [1, 3] },
      { keep_id: 4, remove_ids: [5] },
    ])
    expect(mergeCount(c, [g1, g2])).toBe(3)
  })

  it('picking another keep turns the old keep into a merged copy', () => {
    const c = pickKeep(initialChoice([g1]), g1, 3)
    expect(rowState(c, g1, 3)).toBe('keep')
    expect(rowState(c, g1, 2)).toBe('merge')
    expect(buildMerges(c, [g1])).toEqual([{ keep_id: 3, remove_ids: [1, 2] }])
  })

  it('unchecking Merge leaves a copy as is, and the kept copy cannot be unchecked', () => {
    let c = toggleMerge(initialChoice([g1]), g1, 3)
    expect(rowState(c, g1, 3)).toBe('left')
    expect(buildMerges(c, [g1])).toEqual([{ keep_id: 2, remove_ids: [1] }])
    c = toggleMerge(c, g1, 2)
    expect(rowState(c, g1, 2)).toBe('keep')
    c = toggleMerge(c, g1, 3)
    expect(rowState(c, g1, 3)).toBe('merge')
  })

  it('picking a left copy as the keep clears its left mark', () => {
    let c = toggleMerge(initialChoice([g1]), g1, 3)
    c = pickKeep(c, g1, 3)
    c = pickKeep(c, g1, 2)
    expect(rowState(c, g1, 3)).toBe('merge')
  })

  it('a group with nothing to merge sends no request', () => {
    let c = toggleMerge(initialChoice([g2]), g2, 5)
    expect(buildMerges(c, [g2])).toEqual([])
    expect(mergeCount(c, [g2])).toBe(0)
    c = setMergeAll(c, [g2], true)
    expect(allMerged(c, [g2])).toBe(true)
    c = setMergeAll(c, [g2], false)
    expect(allMerged(c, [g2])).toBe(false)
    expect(rowState(c, g2, 4)).toBe('keep')
  })

  it('counts only the slots in playlists the kept copy is not in', () => {
    const g: DuplicateGroup = {
      ...group([1, 2], 1),
      tracks: [copy(1, [10]), copy(2, [10, 11, 12])],
    }
    expect(slotsMoving(g, 1, g.tracks[1])).toBe(2)
  })

  it("falls back to the first track when the recommended id is not in the group", () => {
    const bad = group([7, 8], 99)
    const c = initialChoice([bad])
    expect(rowState(c, bad, 7)).toBe('keep')
    expect(rowState(c, bad, 8)).toBe('merge')
    const ids = bad.tracks.map((t) => t.id)
    for (const m of buildMerges(c, [bad])) expect(ids).toContain(m.keep_id)
  })

  it('pickKeep with an id outside the group leaves the choice unchanged', () => {
    const c = initialChoice([g1])
    expect(pickKeep(c, g1, 99)).toBe(c)
  })

  it('a request never removes its own kept copy', () => {
    const c = initialChoice([g1, g2])
    for (const m of buildMerges(c, [g1, g2])) {
      expect(m.remove_ids).not.toContain(m.keep_id)
    }
  })
})
