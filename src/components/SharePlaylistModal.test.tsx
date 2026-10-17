import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ShareLink } from '../types/track'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getOrCreateShareLink: vi.fn(),
    setShareLinkDays: vi.fn(),
  },
}))
vi.mock('../lib/toast', () => ({ toast: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

import { tauriApi } from '../lib/tauri-api'
import { toast } from '../lib/toast'
import { SharePlaylistModal } from './SharePlaylistModal'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'ab'.repeat(32)
const URL_BASE = 'http://192.168.1.20:8384'
const link: ShareLink = {
  token: TOKEN,
  playlist_id: 3,
  playlist_name: 'Warm-up',
  days: 7,
  created_at: 1760600000,
  expires_at: 1761204800,
}

let host: HTMLDivElement
let root: Root
let onClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.mocked(tauriApi.getOrCreateShareLink).mockResolvedValue(link)
  vi.mocked(tauriApi.setShareLinkDays).mockImplementation(
    async (_token, days) => ({
      ...link,
      days,
      expires_at: link.created_at + days * 86400,
    }),
  )
  onClose = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function render() {
  await act(async () => {
    root.render(
      <SharePlaylistModal
        open
        playlistId={3}
        playlistName="Warm-up"
        companionUrl={URL_BASE}
        onClose={onClose}
      />,
    )
  })
}

function dayButton(label: string): HTMLButtonElement {
  const button = [
    ...host.querySelectorAll<HTMLButtonElement>('.segmented__item'),
  ].find((b) => b.textContent === label)
  if (!button) throw new Error(`no ${label} button`)
  return button
}

describe('SharePlaylistModal', () => {
  it("shows the playlist's share link, never the companion token", async () => {
    await render()
    expect(tauriApi.getOrCreateShareLink).toHaveBeenCalledWith(3)
    const input = host.querySelector<HTMLInputElement>('#share-playlist-url')
    expect(input?.value).toBe(`${URL_BASE}/?share=${TOKEN}`)
    expect(host.textContent).toContain('Share playlist')
    expect(host.textContent).toContain('It opens this playlist only')
    expect(dayButton('7 days').getAttribute('aria-pressed')).toBe('true')
    expect(dayButton('24 hours').getAttribute('aria-pressed')).toBe('false')
    expect(host.textContent).toContain(
      'Stop it any time in Settings → Mobile Companion.',
    )
  })

  it('restarts the time with the picked duration', async () => {
    await render()
    await act(async () => dayButton('30 days').click())
    expect(tauriApi.setShareLinkDays).toHaveBeenCalledWith(TOKEN, 30)
    expect(dayButton('30 days').getAttribute('aria-pressed')).toBe('true')
  })

  it('closes with a toast when no link can be made', async () => {
    // Tauri rejects with the AppError's shape.
    vi.mocked(tauriApi.getOrCreateShareLink).mockRejectedValue({
      kind: 'NotFound',
      message: 'no playlist',
    })
    await render()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('no playlist'), {
      kind: 'error',
    })
    expect(onClose).toHaveBeenCalled()
  })
})
