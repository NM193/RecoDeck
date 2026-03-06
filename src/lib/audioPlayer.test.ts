import { describe, it, expect, beforeEach } from 'vitest'
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
