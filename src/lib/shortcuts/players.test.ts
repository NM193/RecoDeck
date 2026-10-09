import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tauri-api', () => ({
  tauriApi: {
    seekYouTubePanel: vi.fn(() => Promise.resolve()),
    playYouTubePanel: vi.fn(() => Promise.resolve()),
    pauseYouTubePanel: vi.fn(() => Promise.resolve()),
    closeYouTubePanel: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('../audioPlayer', () => ({ audioPlayer: { pause: vi.fn() } }))

import { usePlayerStore } from '../../store/playerStore'
import { useSetPlayer } from '../../store/setPlayerStore'
import type { TracklistResult } from '../tracklist'
import {
  drivePlayer,
  forgetLastPlayed,
  lastPlayed,
  registerFileControls,
  trackLastPlayed,
  whichPlayer,
} from './players'

const aSet = { video: { id: 'v1' }, tracks: [] } as unknown as TracklistResult
const panel = (player_state: number) => ({ position_ms: 0, duration_ms: 3_600_000, player_state })

let stopTracking: () => void
beforeEach(() => {
  usePlayerStore.setState({ isPlaying: false })
  useSetPlayer.setState({ playing: null, panel: null })
  forgetLastPlayed()
  stopTracking = trackLastPlayed()
})
afterEach(() => stopTracking())

describe('which player played last', () => {
  it('is your own files when nothing played, or the set is gone', () => {
    expect(whichPlayer(null, true)).toBe('file')
    expect(whichPlayer('set', false)).toBe('file')
    expect(whichPlayer('file', true)).toBe('file')
    expect(whichPlayer('set', true)).toBe('set')
  })

  it('follows whichever started playing, a click inside the video too', () => {
    usePlayerStore.setState({ isPlaying: true })
    expect(lastPlayed()).toBe('file')
    useSetPlayer.setState({ playing: { result: aSet, startMs: 0 }, panel: panel(1) })
    expect(lastPlayed()).toBe('set')
    // The video paused (by you, or because your file started): it played last until the file plays.
    useSetPlayer.setState({ panel: panel(2) })
    expect(lastPlayed()).toBe('set')
    usePlayerStore.setState({ isPlaying: false })
    usePlayerStore.setState({ isPlaying: true })
    expect(lastPlayed()).toBe('file')
  })
})

describe('Space and ⌘→ / ⌘←', () => {
  it('drive the set while it played last, so a paused video resumes', () => {
    const togglePause = vi.fn()
    const step = vi.fn()
    useSetPlayer.setState({ playing: { result: aSet, startMs: 0 }, panel: panel(1), togglePause, step })
    useSetPlayer.setState({ panel: panel(2) })
    const file = { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() }
    const unregister = registerFileControls(file)

    drivePlayer('play-pause')
    drivePlayer('next')
    drivePlayer('previous')
    expect(togglePause).toHaveBeenCalledTimes(1)
    expect(step.mock.calls).toEqual([[1], [-1]])
    expect(file.playPause).not.toHaveBeenCalled()
    unregister()
  })

  it("drive the bar's buttons otherwise, and nothing once the bar is gone", () => {
    const file = { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() }
    const unregister = registerFileControls(file)
    drivePlayer('play-pause')
    drivePlayer('next')
    drivePlayer('previous')
    expect(file.playPause).toHaveBeenCalledTimes(1)
    expect(file.next).toHaveBeenCalledTimes(1)
    expect(file.previous).toHaveBeenCalledTimes(1)

    unregister()
    drivePlayer('play-pause')
    expect(file.playPause).toHaveBeenCalledTimes(1)
  })
})
