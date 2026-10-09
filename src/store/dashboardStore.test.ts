import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDashboardStore } from './dashboardStore'
import { defaultLayout, storedLayoutJson } from '../lib/home/cards'
import { tauriApi } from '../lib/tauri-api'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getDashboardLayout: vi.fn().mockResolvedValue(null),
    saveDashboardLayout: vi.fn().mockResolvedValue(undefined),
  },
}))

const DEFAULT_LAYOUT = defaultLayout()

beforeEach(() => {
  vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(null)
  vi.mocked(tauriApi.saveDashboardLayout).mockClear()
  useDashboardStore.setState({
    layout: [...DEFAULT_LAYOUT],
    savedLayout: [...DEFAULT_LAYOUT],
    isEditMode: false,
    isLoaded: false,
  })
})

describe('dashboardStore', () => {
  it('initializes with default layout', () => {
    const state = useDashboardStore.getState()
    expect(state.layout).toEqual(DEFAULT_LAYOUT)
    expect(state.isEditMode).toBe(false)
  })

  it('enterEditMode saves current layout as savedLayout', () => {
    useDashboardStore.getState().enterEditMode()
    const state = useDashboardStore.getState()
    expect(state.isEditMode).toBe(true)
    expect(state.savedLayout).toEqual(DEFAULT_LAYOUT)
  })

  it('cancelEdit reverts layout to savedLayout', () => {
    useDashboardStore.getState().enterEditMode()
    useDashboardStore.getState().removeWidget('recently-played')
    expect(useDashboardStore.getState().layout.length).toBe(DEFAULT_LAYOUT.length - 1)

    useDashboardStore.getState().cancelEdit()
    const state = useDashboardStore.getState()
    expect(state.isEditMode).toBe(false)
    expect(state.layout).toEqual(DEFAULT_LAYOUT)
  })

  it('addWidget appends a catalog card at its default size', () => {
    useDashboardStore.getState().removeWidget('upcoming-gigs')
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('upcoming-gigs')
    const state = useDashboardStore.getState()
    expect(state.layout.length).toBe(before + 1)
    expect(state.layout.find((l) => l.i === 'upcoming-gigs')).toMatchObject({ w: 2, h: 2, maxH: 3 })
  })

  it('addWidget does not duplicate a card, nor add one not in the catalog', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('recently-played')
    useDashboardStore.getState().addWidget('ai-recommendations')
    expect(useDashboardStore.getState().layout.length).toBe(before)
  })

  it('removeWidget filters out by id', () => {
    useDashboardStore.getState().removeWidget('recently-played')
    const state = useDashboardStore.getState()
    expect(state.layout.find((l) => l.i === 'recently-played')).toBeUndefined()
  })

  it('updateLayout replaces layout', () => {
    const newLayout = [{ i: 'test', x: 0, y: 0, w: 2, h: 1 }]
    useDashboardStore.getState().updateLayout(newLayout)
    expect(useDashboardStore.getState().layout).toEqual(newLayout)
  })

  it('resetLayout puts back the default layout, until Save', () => {
    useDashboardStore.getState().enterEditMode()
    useDashboardStore.getState().updateLayout([{ i: 'needs-you', x: 0, y: 0, w: 4, h: 2 }])
    useDashboardStore.getState().resetLayout()
    expect(useDashboardStore.getState().layout).toEqual(DEFAULT_LAYOUT)
    expect(tauriApi.saveDashboardLayout).not.toHaveBeenCalled()
  })

  it('loadLayout replaces the old form by the default once and stores it', async () => {
    vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(JSON.stringify([{ i: 'recently-played', x: 0, y: 0, w: 2, h: 1 }]))
    await useDashboardStore.getState().loadLayout()
    expect(useDashboardStore.getState().layout).toEqual(DEFAULT_LAYOUT)
    expect(tauriApi.saveDashboardLayout).toHaveBeenCalledWith(storedLayoutJson(DEFAULT_LAYOUT))
  })

  it('loadLayout shows a saved layout as it is, storing nothing', async () => {
    vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(storedLayoutJson([{ i: 'quick-actions', x: 0, y: 0, w: 4, h: 1 }]))
    await useDashboardStore.getState().loadLayout()
    expect(useDashboardStore.getState().layout).toMatchObject([{ i: 'quick-actions', w: 4, h: 1, maxH: 1 }])
    expect(tauriApi.saveDashboardLayout).not.toHaveBeenCalled()
  })

  it('saveLayout stores version 2', async () => {
    useDashboardStore.getState().enterEditMode()
    await useDashboardStore.getState().saveLayout()
    expect(tauriApi.saveDashboardLayout).toHaveBeenCalledWith(storedLayoutJson(DEFAULT_LAYOUT))
    expect(useDashboardStore.getState().isEditMode).toBe(false)
  })
})
