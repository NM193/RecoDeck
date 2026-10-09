import { describe, expect, it } from 'vitest'
import { believedPosition, believedState, isPlayingState, playheadTrack, stepCue, timedTracks } from './playhead'
import type { Track } from '../tracklist'

const row = (index: number, cueMs: number): Track =>
  ({ index, cue: '', cueMs, title: `Track ${index}`, artist: null } as unknown as Track)

// 00:00, 05:00, (a row without a time), 12:00, 17:00
const tracks = [row(1, 0), row(2, 300_000), row(3, 0), row(4, 720_000), row(5, 1_020_000)]

describe('timedTracks', () => {
  it('keeps the rows with a time and the first row', () => {
    expect(timedTracks(tracks).map((t) => t.index)).toEqual([1, 2, 4, 5])
  })
})

describe('playheadTrack', () => {
  it('is the last timed row at or before the position, to the next timed row', () => {
    expect(playheadTrack(tracks, false, 400_000, 3_600_000)).toEqual({
      track: tracks[1],
      startMs: 300_000,
      endMs: 720_000,
    })
    expect(playheadTrack(tracks, false, 720_000, 3_600_000)?.track.index).toBe(4)
  })

  it('runs the last track to the end of the video', () => {
    expect(playheadTrack(tracks, false, 2_000_000, 3_600_000)).toMatchObject({ startMs: 1_020_000, endMs: 3_600_000 })
    // The length not known yet, the end is just after the start.
    expect(playheadTrack(tracks, false, 2_000_000, 0)?.endMs).toBe(1_020_001)
  })

  it('is nothing for an untimed list, or before the first cue', () => {
    expect(playheadTrack(tracks, true, 400_000, 3_600_000)).toBeNull()
    expect(playheadTrack([row(2, 60_000)], false, 10_000, 3_600_000)).toBeNull()
  })
})

describe('stepCue', () => {
  it('steps from the playhead’s track to the timed row after or before it', () => {
    expect(stepCue(tracks, false, 400_000, 1)).toBe(720_000)
    expect(stepCue(tracks, false, 400_000, -1)).toBe(0)
    // Right after Play set, from 00:00.
    expect(stepCue(tracks, false, 0, 1)).toBe(300_000)
  })

  it('stops at either end', () => {
    expect(stepCue(tracks, false, 0, -1)).toBeNull()
    expect(stepCue(tracks, false, 1_500_000, 1)).toBeNull()
  })

  it('does nothing for an untimed list', () => {
    expect(stepCue(tracks, true, 400_000, 1)).toBeNull()
  })
})

describe('believedPosition', () => {
  const pending = { ms: 720_000, until: 10_000 }

  it('keeps where a seek went while the panel still reports where it was', () => {
    expect(believedPosition(400_000, pending, 9_000)).toBe(720_000)
  })

  it('takes the report once it is near the seek, or once the seek has settled', () => {
    expect(believedPosition(721_000, pending, 9_000)).toBe(721_000)
    expect(believedPosition(400_000, pending, 10_000)).toBe(400_000)
    expect(believedPosition(400_000, null, 9_000)).toBe(400_000)
  })

  it('lets a second quick ⏭ step from where the first went', () => {
    const position = believedPosition(400_000, pending, 9_000)
    expect(stepCue(tracks, false, position, 1)).toBe(1_020_000)
  })
})

describe('believedState', () => {
  it('counts buffering as playing', () => {
    expect([1, 3].map(isPlayingState)).toEqual([true, true])
    expect([-1, 0, 2, 5].map(isPlayingState)).toEqual([false, false, false, false])
  })

  it('holds a pause or a play just sent while the panel still reports the old state', () => {
    expect(believedState(1, { playing: false, until: 10_000 }, 9_000)).toBe(2)
    expect(believedState(2, { playing: true, until: 10_000 }, 9_000)).toBe(3)
  })

  it('takes the report once it agrees, or once the hold is over', () => {
    expect(believedState(2, { playing: false, until: 10_000 }, 9_000)).toBe(2)
    expect(believedState(1, { playing: false, until: 10_000 }, 10_000)).toBe(1)
    expect(believedState(1, null, 9_000)).toBe(1)
  })
})
