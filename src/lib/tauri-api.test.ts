import { describe, it, expect } from 'vitest'
import { mockIPC } from '@tauri-apps/api/mocks'
import { tauriApi } from './tauri-api'

// A command's raw bytes reach the page as an ArrayBuffer over Tauri's IPC
// protocol, but as a plain array of numbers when Tauri falls back to
// postMessage (the built app did, while its CSP left out ipc:). The track
// table's thumbnails took that array for bytes and showed no artwork.
describe('getTrackArtwork', () => {
  it('gives an ArrayBuffer when the bytes arrive as an array of numbers', async () => {
    mockIPC((cmd) => (cmd === 'get_track_artwork' ? [255, 216, 255, 224] : undefined))

    const bytes = await tauriApi.getTrackArtwork(1)

    expect(bytes).toBeInstanceOf(ArrayBuffer)
    expect([...new Uint8Array(bytes)]).toEqual([255, 216, 255, 224])
  })

  it('passes an ArrayBuffer through as it is', async () => {
    const sent = new Uint8Array([137, 80, 78, 71]).buffer
    mockIPC((cmd) => (cmd === 'get_track_artwork' ? sent : undefined))

    expect(await tauriApi.getTrackArtwork(1)).toBe(sent)
  })
})
