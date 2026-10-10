import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DjTarget } from '../types/djExport'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAllPlaylists: vi.fn(),
    djExportDefaults: vi.fn(),
    djExportLastTarget: vi.fn(),
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

// jsdom has no ResizeObserver; the tab bar's thumb only needs one to exist.
class NoResizeObserver {
  observe() {}
  disconnect() {}
}

const PATH = '/Users/dj/Music/RecoDeck/RecoDeck.xml'
const NML = '/Users/dj/Music/RecoDeck/RecoDeck.nml'
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
  vi.stubGlobal('ResizeObserver', NoResizeObserver)
  vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue(playlists)
  // Rekordbox last got Warm-up; Traktor last got Saturday.
  vi.mocked(tauriApi.djExportDefaults).mockImplementation(async (target: DjTarget) =>
    target === 'traktor'
      ? { path: NML, exists: true, playlist_ids: [3], remembered: true }
      : { path: PATH, exists: true, playlist_ids: [4], remembered: true },
  )
  vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue(null)
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
  vi.unstubAllGlobals()
})

async function open(openedFrom: number | null) {
  await act(async () => {
    root.render(<DjExportModal openedFrom={openedFrom} onClose={onClose} />)
  })
}

const box = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const exportButton = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Export'))!
const tab = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === name)!

describe('DjExportModal', () => {
  it('opens with the remembered playlists and the one it was opened from', async () => {
    await open(2)
    expect(tab('Rekordbox').getAttribute('aria-selected')).toBe('true')
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
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Couldn’t write /x: Permission denied')
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), { kind: 'error' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says why in the tree box when the playlists cannot be loaded, and Cancel still closes', async () => {
    vi.mocked(tauriApi.getAllPlaylists).mockRejectedValue({ kind: 'Internal', message: 'db gone' })
    await open(null)
    expect(host.querySelector('.dj-export__tree')?.textContent).toBe('db gone')
    const cancel = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cancel')!
    await act(async () => {
      cancel.click()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('Change… sets where the file goes, and Export sends that path', async () => {
    vi.mocked(tauriApi.pickDjExportFile).mockResolvedValue('/Volumes/USB/RecoDeck.xml')
    await open(2)
    const change = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Change…')!
    await act(async () => {
      change.click()
    })
    expect(tauriApi.pickDjExportFile).toHaveBeenCalledWith('rekordbox', PATH)
    expect(host.textContent).toContain('/Volumes/USB/RecoDeck.xml')
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('rekordbox', [2, 4], '/Volumes/USB/RecoDeck.xml')
  })

  it('an empty folder has its box disabled', async () => {
    vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue([
      ...playlists,
      { id: 9, name: 'Empty', parent_id: null, playlist_type: 'folder', track_count: 0 },
    ])
    await open(null)
    expect(box('Empty').disabled).toBe(true)
    expect(box('Gigs').disabled).toBe(false)
  })

  it('opens on the program exported to last, with that program’s playlists and file', async () => {
    vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue('traktor')
    await open(2)
    expect(tab('Traktor').getAttribute('aria-selected')).toBe('true')
    expect(box('Saturday').checked).toBe(true)
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(false)
    expect(host.textContent).toContain(NML)
    expect(host.textContent).toContain('In Traktor')
  })

  it('each tab keeps its own checks, and Export writes for the open tab', async () => {
    await open(null)
    await act(async () => {
      box('Friday').click()
    })
    await act(async () => {
      tab('Traktor').click()
    })
    expect(box('Friday').checked).toBe(false)
    expect(box('Saturday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(false)
    await act(async () => {
      tab('Rekordbox').click()
    })
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(true)
    await act(async () => {
      tab('Traktor').click()
    })
    vi.mocked(tauriApi.exportToDj).mockResolvedValue({ playlists: 1, tracks: 5, skipped: [], written: [NML] })
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('traktor', [3], NML)
    expect(toast).toHaveBeenCalledWith(
      '1 playlist, 5 tracks exported to Traktor',
      expect.objectContaining({ kind: 'success' }),
    )
  })

  it('the arrow keys move between the programs', async () => {
    await open(null)
    await act(async () => {
      tab('Rekordbox').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(tab('Traktor').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Traktor'))
  })

  it('a last program without a tab here opens on Rekordbox', async () => {
    vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue('serato')
    await open(null)
    expect(tab('Rekordbox').getAttribute('aria-selected')).toBe('true')
  })

  it('Change… on the Traktor tab changes only Traktor’s file', async () => {
    vi.mocked(tauriApi.pickDjExportFile).mockResolvedValue('/Volumes/USB/RecoDeck.nml')
    await open(null)
    await act(async () => {
      tab('Traktor').click()
    })
    const change = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Change…')!
    await act(async () => {
      change.click()
    })
    expect(tauriApi.pickDjExportFile).toHaveBeenCalledWith('traktor', NML)
    expect(host.textContent).toContain('/Volumes/USB/RecoDeck.nml')
    await act(async () => {
      tab('Rekordbox').click()
    })
    expect(host.textContent).toContain(PATH)
    expect(host.textContent).not.toContain('/Volumes/USB/RecoDeck.nml')
  })

  it('a failed export’s message goes when another program is chosen', async () => {
    vi.mocked(tauriApi.exportToDj).mockRejectedValue({ kind: 'Internal', message: 'disk full' })
    await open(2)
    await act(async () => {
      exportButton().click()
    })
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('disk full')
    await act(async () => {
      tab('Traktor').click()
    })
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('no tab is chosen, and none can be, until the dialog knows the last program', async () => {
    let finish!: (target: DjTarget | null) => void
    vi.mocked(tauriApi.djExportLastTarget).mockReturnValue(
      new Promise<DjTarget | null>((resolve) => {
        finish = resolve
      }),
    )
    await open(null)
    expect(tab('Rekordbox').getAttribute('aria-selected')).toBe('false')
    expect(tab('Traktor').disabled).toBe(true)
    await act(async () => {
      finish('traktor')
    })
    expect(tab('Traktor').getAttribute('aria-selected')).toBe('true')
    expect(tab('Traktor').disabled).toBe(false)
  })
})
