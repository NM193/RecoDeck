import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout/legacy'
import { tauriApi } from '../lib/tauri-api'
import { DEFAULT_LAYOUT } from '../components/views/widgets/widgetRegistry'

interface DashboardState {
  layout: LayoutItem[]
  savedLayout: LayoutItem[]
  isEditMode: boolean
  isLoaded: boolean

  loadLayout: () => Promise<void>
  enterEditMode: () => void
  cancelEdit: () => void
  saveLayout: () => Promise<void>
  updateLayout: (layout: LayoutItem[]) => void
  addWidget: (widgetId: string, definition: { defaultW: number; defaultH: number; minW: number; minH: number; maxW: number; maxH: number }) => void
  removeWidget: (widgetId: string) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  layout: DEFAULT_LAYOUT,
  savedLayout: DEFAULT_LAYOUT,
  isEditMode: false,
  isLoaded: false,

  loadLayout: async () => {
    try {
      const json = await tauriApi.getDashboardLayout()
      if (json) {
        const layout = JSON.parse(json) as LayoutItem[]
        set({ layout, savedLayout: layout, isLoaded: true })
      } else {
        set({ layout: DEFAULT_LAYOUT, savedLayout: DEFAULT_LAYOUT, isLoaded: true })
      }
    } catch {
      set({ layout: DEFAULT_LAYOUT, savedLayout: DEFAULT_LAYOUT, isLoaded: true })
    }
  },

  enterEditMode: () => {
    const { layout } = get()
    set({ isEditMode: true, savedLayout: [...layout] })
  },

  cancelEdit: () => {
    const { savedLayout } = get()
    set({ isEditMode: false, layout: [...savedLayout] })
  },

  saveLayout: async () => {
    const { layout } = get()
    try {
      await tauriApi.saveDashboardLayout(JSON.stringify(layout))
      set({ isEditMode: false, savedLayout: [...layout] })
    } catch (err) {
      console.error('Failed to save dashboard layout:', err)
    }
  },

  updateLayout: (layout) => {
    set({ layout })
  },

  addWidget: (widgetId, definition) => {
    const { layout } = get()
    if (layout.some((item) => item.i === widgetId)) return

    const newItem: LayoutItem = {
      i: widgetId,
      x: 0,
      y: Infinity,
      w: definition.defaultW,
      h: definition.defaultH,
      minW: definition.minW,
      minH: definition.minH,
      maxW: definition.maxW,
      maxH: definition.maxH,
    }
    set({ layout: [...layout, newItem] })
  },

  removeWidget: (widgetId) => {
    const { layout } = get()
    set({ layout: layout.filter((item) => item.i !== widgetId) })
  },
}))
