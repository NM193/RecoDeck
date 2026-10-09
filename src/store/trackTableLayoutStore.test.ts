// src/store/trackTableLayoutStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tauriApi } from '../lib/tauri-api'
import { LAYOUT_SETTING, defaultLayout, setColumnShown } from '../lib/trackTable/columns'
import { useTrackTableLayout } from './trackTableLayoutStore'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getSetting: vi.fn(),
    setSetting: vi.fn().mockResolvedValue(undefined),
  },
}))

const getSetting = vi.mocked(tauriApi.getSetting)
const setSetting = vi.mocked(tauriApi.setSetting)

beforeEach(() => {
  getSetting.mockReset()
  setSetting.mockClear()
  useTrackTableLayout.setState({ layout: defaultLayout() })
})

describe('the column layout store', () => {
  it('reads the stored layout', async () => {
    const stored = setColumnShown(defaultLayout(), 'plays', true)
    getSetting.mockResolvedValue(JSON.stringify(stored))
    await useTrackTableLayout.getState().load()
    expect(getSetting).toHaveBeenCalledWith(LAYOUT_SETTING)
    expect(useTrackTableLayout.getState().layout).toEqual(stored)
  })

  it('keeps the default when nothing is stored or the read fails', async () => {
    getSetting.mockResolvedValue(null)
    await useTrackTableLayout.getState().load()
    expect(useTrackTableLayout.getState().layout).toEqual(defaultLayout())

    getSetting.mockRejectedValue(new Error('no database'))
    await useTrackTableLayout.getState().load()
    expect(useTrackTableLayout.getState().layout).toEqual(defaultLayout())
  })

  it('writes a change to the settings table', () => {
    const next = setColumnShown(defaultLayout(), 'album', true)
    useTrackTableLayout.getState().setLayout(next)
    expect(useTrackTableLayout.getState().layout).toEqual(next)
    expect(setSetting).toHaveBeenCalledWith(LAYOUT_SETTING, JSON.stringify(next))
  })

  it('only shows a change made while dragging, and writes it when asked', () => {
    const next = setColumnShown(defaultLayout(), 'album', true)
    useTrackTableLayout.getState().setLayout(next, false)
    expect(setSetting).not.toHaveBeenCalled()
    useTrackTableLayout.getState().save()
    expect(setSetting).toHaveBeenCalledWith(LAYOUT_SETTING, JSON.stringify(next))
  })
})
