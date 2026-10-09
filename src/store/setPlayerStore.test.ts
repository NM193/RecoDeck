import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    seekYouTubePanel: vi.fn(() => Promise.resolve()),
    playYouTubePanel: vi.fn(() => Promise.resolve()),
    pauseYouTubePanel: vi.fn(() => Promise.resolve()),
    closeYouTubePanel: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('../lib/audioPlayer', () => ({ audioPlayer: { pause: vi.fn() } }))

import { tauriApi } from '../lib/tauri-api'
import { audioPlayer } from '../lib/audioPlayer'
import { useSetPlayer } from './setPlayerStore'
import { usePlayerStore } from './playerStore'
import type { Track, TracklistResult } from '../lib/tracklist'

const row = (index: number, cueMs: number): Track =>
  ({ index, cue: '', cueMs, title: `Track ${index}`, artist: null } as unknown as Track)

const set = (id: string): TracklistResult =>
  ({
    video: { id, url: `https://youtu.be/${id}`, title: `Set ${id}`, channel: 'Cercle', publishedAt: '', durationMs: 3_600_000 },
    tracks: [row(1, 0), row(2, 300_000), row(3, 720_000), row(4, 1_020_000)],
  } as unknown as TracklistResult)

const report = (position_ms: number, player_state = 1) => ({ position_ms, duration_ms: 3_600_000, player_state })

/** A set playing whose page has reported, so instructions go out. */
function listening(id = 'a', at = 0) {
  useSetPlayer.getState().play(set(id), at)
  useSetPlayer.getState().setPanel(report(at))
  vi.clearAllMocks()
}

beforeEach(() => {
  useSetPlayer.setState({
    playing: null,
    panel: null,
    reported: false,
    deferredSeek: null,
    pendingSeek: null,
    pendingState: null,
    pageBox: null,
    barBox: null,
  })
  usePlayerStore.setState({ isPlaying: false })
  vi.clearAllMocks()
})

describe('the set player', () => {
  it('plays a set from a cue; a row of the same set only seeks (the page’s seek plays)', () => {
    const a = set('a')
    useSetPlayer.getState().play(a, 300_000)
    expect(useSetPlayer.getState().playing).toEqual({ result: a, startMs: 300_000 })
    expect(useSetPlayer.getState().panel).toMatchObject({ position_ms: 300_000, player_state: 3 })

    useSetPlayer.getState().setPanel(report(300_000))
    useSetPlayer.getState().play(a, 720_000)
    expect(tauriApi.seekYouTubePanel).toHaveBeenCalledWith(720)
    // One instruction at a time: a play after it would replace the seek.
    expect(tauriApi.playYouTubePanel).not.toHaveBeenCalled()
  })

  it('holds a seek until the new page reports, then sends it', () => {
    useSetPlayer.getState().play(set('a'), 0)
    useSetPlayer.getState().step(1)
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).not.toHaveBeenCalled()
    expect(useSetPlayer.getState().playing?.startMs).toBe(720_000)
    expect(useSetPlayer.getState().panel?.position_ms).toBe(720_000)

    // Still loading: no length yet.
    useSetPlayer.getState().setPanel({ position_ms: 0, duration_ms: 0, player_state: 0 })
    expect(tauriApi.seekYouTubePanel).not.toHaveBeenCalled()
    useSetPlayer.getState().setPanel(report(0))
    expect(tauriApi.seekYouTubePanel).toHaveBeenCalledWith(720)
    expect(useSetPlayer.getState().panel?.position_ms).toBe(720_000)
  })

  it('steps from where a seek went while the panel still reports the old position', () => {
    listening()
    useSetPlayer.getState().setPanel(report(10_000))
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(300)
    // The next poll still says 00:10: the second ⏭ goes on from 05:00.
    useSetPlayer.getState().setPanel(report(10_000))
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(720)
    useSetPlayer.getState().step(-1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(300)
  })

  it('pauses and plays without flickering back while the poll catches up, and ✕ closes it', async () => {
    listening()
    useSetPlayer.getState().setPanel(report(5_000, 1))
    useSetPlayer.getState().togglePause()
    expect(tauriApi.pauseYouTubePanel).toHaveBeenCalled()
    useSetPlayer.getState().setPanel(report(5_400, 1))
    expect(useSetPlayer.getState().panel?.player_state).toBe(2)
    useSetPlayer.getState().togglePause()
    expect(tauriApi.playYouTubePanel).toHaveBeenCalled()

    useSetPlayer.getState().stop()
    expect(useSetPlayer.getState().playing).toBeNull()
    await vi.waitFor(() => expect(tauriApi.closeYouTubePanel).toHaveBeenCalled())
  })

  it('stops your own file when it starts the video', () => {
    usePlayerStore.setState({ isPlaying: true })
    useSetPlayer.getState().play(set('a'), 0)
    expect(audioPlayer.pause).toHaveBeenCalled()
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    listening()
    useSetPlayer.getState().togglePause()
    usePlayerStore.setState({ isPlaying: true })
    useSetPlayer.getState().togglePause()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('takes Look again’s rows only for the set playing', () => {
    useSetPlayer.getState().play(set('a'), 0)
    const again = { ...set('a'), tracks: [row(1, 0)] }
    useSetPlayer.getState().replaceResult(set('b'))
    expect(useSetPlayer.getState().playing?.result.video.id).toBe('a')
    useSetPlayer.getState().replaceResult(again)
    expect(useSetPlayer.getState().playing?.result.tracks).toHaveLength(1)
  })
})
