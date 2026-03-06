import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from './playerStore'
import type { Track } from '../types/track'

const makeTrack = (id: number, title?: string): Track => ({
  id,
  file_path: `/test/track${id}.mp3`,
  file_hash: `hash${id}`,
  title: title ?? `Track ${id}`,
  play_count: 0,
  rating: 0,
})

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('playerStore - volume', () => {
  it('setVolume clamps to [0, 1]', () => {
    usePlayerStore.getState().setVolume(2.0)
    expect(usePlayerStore.getState().volume).toBe(1)
    usePlayerStore.getState().setVolume(-1.0)
    expect(usePlayerStore.getState().volume).toBe(0)
  })

  it('setVolume accepts valid values', () => {
    usePlayerStore.getState().setVolume(0.5)
    expect(usePlayerStore.getState().volume).toBe(0.5)
  })
})

describe('playerStore - queue management', () => {
  it('setQueue sets tracks and startIndex', () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]
    usePlayerStore.getState().setQueue(tracks, 1)
    const state = usePlayerStore.getState()
    expect(state.queue).toHaveLength(3)
    expect(state.currentTrackIndex).toBe(1)
    expect(state.originalQueue).toHaveLength(3)
  })

  it('setQueue defaults startIndex to 0', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)])
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0)
  })

  it('playNext advances index', () => {
    usePlayerStore
      .getState()
      .setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 0)
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1)
  })

  it('playNext stops at end when repeatMode is off', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 1)
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1) // unchanged
  })

  it('playNext wraps to 0 when repeatMode is all', () => {
    usePlayerStore.getState().setRepeatMode('all')
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 1)
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0)
  })

  it('playNext does nothing on empty queue', () => {
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(-1)
  })

  it('playPrevious goes back one', () => {
    usePlayerStore
      .getState()
      .setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 2)
    usePlayerStore.getState().playPrevious()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1)
  })

  it('playPrevious does not go below 0', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 0)
    usePlayerStore.getState().playPrevious()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0)
  })

  it('playTrackAtIndex sets correct index', () => {
    usePlayerStore
      .getState()
      .setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 0)
    usePlayerStore.getState().playTrackAtIndex(2)
    expect(usePlayerStore.getState().currentTrackIndex).toBe(2)
  })

  it('playTrackAtIndex ignores out-of-bounds', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 0)
    usePlayerStore.getState().playTrackAtIndex(5)
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0) // unchanged
  })
})

describe('playerStore - shuffle', () => {
  it('setShuffle true shuffles queue', () => {
    const tracks = [
      makeTrack(1),
      makeTrack(2),
      makeTrack(3),
      makeTrack(4),
      makeTrack(5),
    ]
    usePlayerStore.getState().setQueue(tracks, 0)
    usePlayerStore.getState().setShuffle(true)
    expect(usePlayerStore.getState().isShuffle).toBe(true)
    expect(usePlayerStore.getState().queue).toHaveLength(5)
    // Current track should still be at currentTrackIndex
    const state = usePlayerStore.getState()
    expect(state.queue[state.currentTrackIndex].id).toBe(tracks[0].id)
  })

  it('setShuffle false restores original order', () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]
    usePlayerStore.getState().setQueue(tracks, 0)
    usePlayerStore.getState().setShuffle(true)
    usePlayerStore.getState().setShuffle(false)
    expect(usePlayerStore.getState().isShuffle).toBe(false)
    expect(usePlayerStore.getState().queue.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('setShuffle noop when already in same state', () => {
    usePlayerStore.getState().setQueue([makeTrack(1)], 0)
    usePlayerStore.getState().setShuffle(false) // already false
    expect(usePlayerStore.getState().isShuffle).toBe(false)
  })
})

describe('playerStore - reset', () => {
  it('reset restores initial state', () => {
    usePlayerStore.getState().setQueue([makeTrack(1)], 0)
    usePlayerStore.getState().setVolume(0.3)
    usePlayerStore.getState().reset()
    const state = usePlayerStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.volume).toBe(0.7)
    expect(state.currentTrackIndex).toBe(-1)
  })
})
