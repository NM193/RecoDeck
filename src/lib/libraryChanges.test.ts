import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../store/playerStore'
import type { Track } from '../types/track'
import {
  followInQueue,
  mergeChanges,
  missingFixChanges,
} from './libraryChanges'

vi.mock('./tauri-api', () => ({ tauriApi: {} }))

const track = (id: number): Track => ({
  id,
  file_path: `/m/${id}.mp3`,
  file_hash: `h${id}`,
  title: `T${id}`,
  play_count: 0,
  rating: 0,
})

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('mergeChanges and missingFixChanges', () => {
  it('list every merged copy with its kept track', () => {
    expect(mergeChanges([{ keep_id: 1, remove_ids: [2, 3] }]).merged).toEqual([
      [2, 1],
      [3, 1],
    ])
  })

  it('leave out what the apply skipped', () => {
    const changes = missingFixChanges(
      {
        relinks: [
          { track_id: 1, path: '/new/1.mp3' },
          { track_id: 2, path: '/new/2.mp3' },
        ],
        merges: [{ keep_id: 9, remove_id: 3 }],
        removes: [4, 5],
      },
      {
        relinked: 1,
        merged: 1,
        removed: 1,
        skipped: [
          { track_id: 2, reason: 'file is gone' },
          { track_id: 5, reason: 'file is back' },
        ],
      },
    )
    expect([...changes.moved]).toEqual([[1, '/new/1.mp3']])
    expect(changes.merged).toEqual([[3, 9]])
    expect(changes.removed).toEqual([4])
  })
})

describe('followInQueue', () => {
  it('swaps merged copies, drops removed tracks and patches moved paths', async () => {
    usePlayerStore
      .getState()
      .setQueue([track(1), track(2), track(3), track(4)], 0)
    const getTrack = vi.fn(async (id: number) => track(id))
    await followInQueue(
      {
        merged: [
          [2, 9],
          [7, 9],
        ],
        removed: [3],
        moved: new Map([[1, '/new/1.mp3']]),
      },
      getTrack,
    )
    const { queue } = usePlayerStore.getState()
    expect(queue.map((t) => t.id)).toEqual([1, 9, 4])
    expect(queue[0].file_path).toBe('/new/1.mp3')
    expect(getTrack).toHaveBeenCalledTimes(1)
  })

  it('drops a merged copy whose kept track cannot be read', async () => {
    usePlayerStore.getState().setQueue([track(1), track(2)], 0)
    await followInQueue(
      { merged: [[2, 9]], removed: [], moved: new Map() },
      async () => {
        throw new Error('gone')
      },
    )
    expect(usePlayerStore.getState().queue.map((t) => t.id)).toEqual([1])
  })
})
