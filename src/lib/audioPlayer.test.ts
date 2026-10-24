import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ---------------------------------------------------------------------------
// SUITE 1: PLAY-01 — SEEK_MARGIN_MS must equal 3000
// ---------------------------------------------------------------------------
// We read the source file as text to assert the constant value without
// depending on any export. This is immune to Audio API environment issues.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const audioPlayerSource = readFileSync(
  path.resolve(__dirname, 'audioPlayer.ts'),
  'utf-8',
)

describe('SEEK_MARGIN_MS', () => {
  it('should be 3000 (not 10000) to avoid VBR end-of-track replay', () => {
    expect(audioPlayerSource).toContain('SEEK_MARGIN_MS = 3000')
  })
})

// ---------------------------------------------------------------------------
// SUITE 2: PLAY-02 — loadTrack() must abort any active crossfade immediately
// ---------------------------------------------------------------------------
// AudioPlayer is instantiated directly. We inject a mock crossfadeAudio via
// a private-field cast and assert it is null after loadTrack() begins.
// abortCrossfade() is synchronous so state is visible even if the async
// remainder of loadTrack() throws on missing Tauri internals.
// ---------------------------------------------------------------------------
describe('loadTrack() crossfade teardown', () => {
  let player: import('./audioPlayer').AudioPlayer

  beforeEach(async () => {
    const mod = await import('./audioPlayer')
    player = new mod.AudioPlayer()
  })

  it('should call abortCrossfade() — clearing crossfadeAudio — as first action', async () => {
    // Inject a mock crossfade state via private-field cast.
    const p = player as unknown as {
      crossfadeAudio: Record<string, unknown> | null
      isCrossfading: boolean
    }
    const mockAudio = {
      pause: () => {},
      load: () => {},
      removeAttribute: (_: string) => {},
      src: 'blob:mock',
    }
    p.crossfadeAudio = mockAudio as unknown as Record<string, unknown>
    p.isCrossfading = true

    // Do NOT await loadTrack() — it hangs waiting for Audio 'canplaythrough'
    // event that never fires in jsdom. abortCrossfade() is called synchronously
    // as the first statement (before any await), so after one microtask the
    // crossfade state should be cleared.
    void player.loadTrack('/fake/track.mp3', 1)

    // Allow the synchronous portion (up to the first await) to execute.
    await new Promise(resolve => setTimeout(resolve, 0))

    // abortCrossfade() must have run, nulling crossfadeAudio.
    expect(p.crossfadeAudio).toBeNull()
    expect(p.isCrossfading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SUITE 3: PLAY-03 — isCrossfadingState must be true during onTrackEnded
//          callback fired from completeCrossfade()
// ---------------------------------------------------------------------------
// Root cause of the double-play bug: completeCrossfade() cleared isCrossfading
// and crossfadeFadeComplete BEFORE calling onTrackEnded(). NowPlayingBar's
// onTrackEnded handler checks isCrossfadingState to decide whether to skip
// the loadTrack() + play() sequence — but the flag was already false by then,
// causing the next track (already playing via crossfadeAudio) to be reloaded
// from position 0.
//
// Fix: _isCompletingCrossfade is set true while onTrackEnded() is being called
// from completeCrossfade(). isCrossfadingState includes this flag.
// ---------------------------------------------------------------------------
describe('isCrossfadingState during completeCrossfade()', () => {
  let player: import('./audioPlayer').AudioPlayer

  beforeEach(async () => {
    const mod = await import('./audioPlayer')
    player = new mod.AudioPlayer()
  })

  it('should return true from isCrossfadingState while onTrackEnded fires from completeCrossfade()', () => {
    // Access private internals via cast.
    const p = player as unknown as {
      crossfadeAudio: HTMLAudioElement | null
      isCrossfading: boolean
      crossfadeFadeComplete: boolean
      _isCompletingCrossfade: boolean
      completeCrossfade: () => void
    }

    // Simulate the state just before completeCrossfade() is called when the
    // outgoing track ends after a full fade (crossfadeFadeComplete = true).
    const mockIncoming = {
      pause: () => {},
      play: () => Promise.resolve(),
      load: () => {},
      removeAttribute: (_: string) => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      src: 'stream://localhost/?p=/music/next.mp3',
      volume: 1.0,
      currentTime: 5.0,
      duration: 180.0,
      playbackRate: 1.0,
    }
    p.crossfadeAudio = mockIncoming as unknown as HTMLAudioElement
    p.isCrossfading = false       // fade already finished
    p.crossfadeFadeComplete = true // waiting for outgoing to end

    // Capture what isCrossfadingState returns during the onTrackEnded callback.
    let stateSeenDuringCallback: boolean | undefined
    player.onTrackEnded = () => {
      stateSeenDuringCallback = player.isCrossfadingState
    }

    // Trigger the swap.
    p.completeCrossfade()

    // The callback must have seen isCrossfadingState = true.
    expect(stateSeenDuringCallback).toBe(true)

    // After completeCrossfade() returns, the flag is cleared.
    expect(p._isCompletingCrossfade).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SUITE 4: a crossfade never changes the rate of a track that is playing
// ---------------------------------------------------------------------------
// WebKit stalls a playing element whenever its playbackRate changes: one
// change for ~0.3–0.75 s, and the frame-by-frame ramp back to 1.0 that ran
// after the swap froze the incoming track for the whole 4 s ramp. So the
// incoming track keeps the rate it was started at, and the next crossfade
// matches the tempo the playing track is heard at (within MAX_STRETCH, like
// master BPM).
// ---------------------------------------------------------------------------
describe('crossfade tempo', () => {
  let player: import('./audioPlayer').AudioPlayer

  beforeEach(async () => {
    const mod = await import('./audioPlayer')
    player = new mod.AudioPlayer()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The player as a crossfade sees it: a 122 BPM track playing, still at the
  // rate an earlier crossfade matched it to (heard at 124).
  function playingAt(rate: number) {
    const p = player as unknown as {
      audio: { src: string; playbackRate: number }
      _hasSource: boolean
      crossfadeAudio: { playbackRate: number } | null
      isCrossfading: boolean
    }
    player.setCrossfadeEnabled(true)
    p._hasSource = true
    p.audio.src = 'stream://localhost/?p=%2Fmusic%2Fnow.mp3'
    p.audio.playbackRate = rate
    return p
  }

  it('leaves the incoming track at its matched rate when the swap completes', () => {
    const p = player as unknown as {
      crossfadeAudio: unknown
      crossfadeFadeComplete: boolean
      completeCrossfade: () => void
    }
    let rate = 124 / 122
    let rateWrites = 0
    p.crossfadeAudio = {
      pause: () => {},
      play: () => Promise.resolve(),
      load: () => {},
      removeAttribute: (_: string) => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      src: 'stream://localhost/?p=/music/next.mp3',
      volume: 1.0,
      currentTime: 10.0,
      duration: 535.0,
      defaultPlaybackRate: 124 / 122,
      get playbackRate() {
        return rate
      },
      set playbackRate(value: number) {
        rateWrites++
        rate = value
      },
    }
    p.crossfadeFadeComplete = true
    player.onTrackEnded = () => {}

    p.completeCrossfade()

    expect(rateWrites).toBe(0)
    expect(rate).toBeCloseTo(124 / 122)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('matches the next track to the tempo the playing track is heard at', async () => {
    const p = playingAt(124 / 122)

    void player.startCrossfadeToNext('/music/next.mp3', 2, 126, 122)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(p.crossfadeAudio?.playbackRate).toBeCloseTo(124 / 126)
  })

  it('counts half time as the same tempo', async () => {
    const p = playingAt(1)

    void player.startCrossfadeToNext('/music/next.mp3', 2, 63, 124)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(p.crossfadeAudio?.playbackRate).toBeCloseTo(124 / 126)
  })

  it('plays the next track at its own tempo when the two are too far apart', async () => {
    const p = playingAt(1)

    void player.startCrossfadeToNext('/music/next.mp3', 2, 100, 124)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(p.crossfadeAudio?.playbackRate).toBe(1)
  })

  it('leaves the playing track at its rate when a crossfade is called off', () => {
    const p = playingAt(124 / 122)
    p.isCrossfading = true

    player.setCrossfadeEnabled(false)

    expect(p.audio.playbackRate).toBeCloseTo(124 / 122)
  })
})
