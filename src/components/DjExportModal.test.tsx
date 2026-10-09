import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAllPlaylists: vi.fn(),
    djExportDefaults: vi.fn(),
    exportToDj: vi.fn(),
    pickDjExportFile: vi.fn(),
  },
}))
vi.mock('../lib/toast', () => ({ toast: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))

import { tauriApi } from '../lib/tauri-api'
import { toast } from '../lib/toast'
import { DjExportModal } from './DjExportModal'

// React's act() in a plain DOM, without a testing library.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PATH = '/Users/dj/Music/RecoDeck/RecoDeck.xml'
const playlists = [
  { id: 2, name: 'Friday', parent_id: 1, playlist_type: 'manual', track_count: 2 },
  { id: 1, name: 'Gigs', parent_id: null, playlist_type: 'folder', track_count: 0 },
  { id: 3, name: 'Saturday', parent_id: 1, playlist_type: 'manual', track_count: 5 },
  { id: 4, name: 'Warm-up', parent_id: null, playlist_type: 'manual', track_count: 1 },
]

let host: HTMLDivElement
let root: Root
let onClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue(playlists)
  vi.mocked(tauriApi.djExportDefaults).mockResolvedValue({
    path: PATH,
    exists: true,
    playlist_ids: [4],
    remembered: true,
  })
  vi.mocked(tauriApi.exportToDj).mockResolvedValue({ playlists: 2, tracks: 3, skipped: [], written: [PATH] })
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

async function open(openedFrom: number | null) {
  await act(async () => {
    root.render(<DjExportModal openedFrom={openedFrom} onClose={onClose} />)
  })
}

const box = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const exportButton = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Export'))!

describe('DjExportModal', () => {
  it('opens with the remembered playlists and the one it was opened from', async () => {
    await open(2)
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(true)
    expect(box('Saturday').checked).toBe(false)
    expect(box('Gigs').indeterminate).toBe(true)
    expect(exportButton().textContent).toBe('Export 2 playlists')
    expect(host.textContent).toContain(PATH)
  })

  it('a folder box checks everything inside it', async () => {
    await open(null)
    await act(async () => {
      box('Gigs').click()
    })
    expect(box('Friday').checked).toBe(true)
    expect(box('Saturday').checked).toBe(true)
    expect(box('Gigs').checked).toBe(true)
  })

  it('exports the checked playlists in the tree order and says where they went', async () => {
    await open(2)
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('rekordbox', [2, 4], PATH)
    expect(toast).toHaveBeenCalledWith(
      '2 playlists, 3 tracks exported to Rekordbox',
      expect.objectContaining({ kind: 'success', action: expect.objectContaining({ label: 'Show in Finder' }) }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('cannot export with nothing checked, and shows the whole how-to the first time', async () => {
    vi.mocked(tauriApi.djExportDefaults).mockResolvedValue({
      path: PATH,
      exists: false,
      playlist_ids: [],
      remembered: false,
    })
    await open(null)
    expect(exportButton().disabled).toBe(true)
    expect(host.textContent).toContain('turn on “rekordbox xml”')
  })

  it('stays open and says why when the export fails', async () => {
    // AppError reaches JS as { kind, message } (#[serde(tag = "kind", content = "message")]).
    vi.mocked(tauriApi.exportToDj).mockRejectedValue({ kind: 'Internal', message: 'Couldn’t write /x: Permission denied' })
    await open(2)
    await act(async () => {
      exportButton().click()
    })
    expect(toast).toHaveBeenCalledWith('Couldn’t write /x: Permission denied', { kind: 'error' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
