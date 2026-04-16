import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDashboardStore } from './dashboardStore'
import { DEFAULT_LAYOUT } from '../components/views/widgets/widgetRegistry'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getDashboardLayout: vi.fn().mockResolvedValue(null),
    saveDashboardLayout: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
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

  it('addWidget appends to layout', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('library-insights', {
      defaultW: 4, defaultH: 1, minW: 2, minH: 1, maxW: 4, maxH: 1,
    })
    const state = useDashboardStore.getState()
    expect(state.layout.length).toBe(before + 1)
    expect(state.layout.find((l) => l.i === 'library-insights')).toBeDefined()
  })

  it('addWidget does not duplicate existing widget', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('recently-played', {
      defaultW: 2, defaultH: 1, minW: 2, minH: 1, maxW: 4, maxH: 2,
    })
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
})
