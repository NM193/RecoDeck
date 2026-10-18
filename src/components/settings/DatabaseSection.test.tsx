import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AnalysisStatus } from '../../types/track'
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const analysisStatus = vi.fn()
let onReanalyzeLibrary: () => Promise<void>

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))
vi.mock('../../lib/tauri-api', () => ({
  tauriApi: {
    analysisStatus: () => analysisStatus(),
    countMissingTracks: () => Promise.resolve(0),
  },
}))
vi.mock('./SettingsContext', () => ({
  useSettingsContext: () => ({
    onFoldersChanged: () => {},
    onNotification: () => {},
    onReanalyzeLibrary: () => onReanalyzeLibrary(),
  }),
}))
vi.mock('../DuplicatesModal', () => ({ DuplicatesModal: () => null }))
vi.mock('../MissingFilesModal', () => ({ MissingFilesModal: () => null }))

import { DatabaseSection } from './DatabaseSection'

const status: AnalysisStatus = {
  version: 1,
  needing: 12,
  with_old_values: 10,
  estimate_minutes: 5,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  analysisStatus.mockReset()
})

async function render() {
  await act(async () => {
    root.render(<DatabaseSection />)
  })
}

function reanalyzeButton() {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Re-analyze',
  )
  if (!found) throw new Error('no Re-analyze button')
  return found
}

describe('DatabaseSection re-analysis', () => {
  it('a second click while the batch is starting does nothing', async () => {
    analysisStatus.mockResolvedValue(status)
    let finish!: () => void
    const started = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    onReanalyzeLibrary = started
    await render()

    await act(async () => reanalyzeButton().click())
    expect(reanalyzeButton().disabled).toBe(true)
    await act(async () => reanalyzeButton().click())
    expect(started).toHaveBeenCalledTimes(1)

    await act(async () => finish())
    expect(reanalyzeButton().disabled).toBe(false)
  })

  it('says so when the status cannot be read', async () => {
    analysisStatus.mockRejectedValue(new Error('no database'))
    await render()
    expect(host.textContent).toContain("Couldn't check the analysis status.")
    expect(reanalyzeButton().disabled).toBe(true)
  })
})
