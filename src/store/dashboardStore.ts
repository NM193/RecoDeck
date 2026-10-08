import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout/legacy'
import { tauriApi } from '../lib/tauri-api'
import {
  defaultLayout,
  newCardItem,
  readStoredLayout,
  storedLayoutJson,
} from '../lib/home/cards'

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
  addWidget: (widgetId: string) => void
  removeWidget: (widgetId: string) => void
  /** Customize's Reset: the default layout, until Save or Cancel. */
  resetLayout: () => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  layout: defaultLayout(),
  savedLayout: defaultLayout(),
  isEditMode: false,
  isLoaded: false,

  // The old Home's layout (a bare list) is replaced by the default once, and
  // that is stored at once; after that Home shows what Customize saved.
  loadLayout: async () => {
    try {
      const { layout, rewrite } = readStoredLayout(await tauriApi.getDashboardLayout())
      set({ layout, savedLayout: layout, isLoaded: true })
      if (rewrite) {
        await tauriApi
          .saveDashboardLayout(storedLayoutJson(layout))
          .catch((err) => console.error('Failed to store the new Home layout:', err))
      }
    } catch {
      set({ layout: defaultLayout(), savedLayout: defaultLayout(), isLoaded: true })
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
      await tauriApi.saveDashboardLayout(storedLayoutJson(layout))
      set({ isEditMode: false, savedLayout: [...layout] })
    } catch (err) {
      console.error('Failed to save dashboard layout:', err)
    }
  },

  updateLayout: (layout) => {
    set({ layout })
  },

  // At its default size, below the others; its limits from the catalog.
  addWidget: (widgetId) => {
    const { layout } = get()
    if (layout.some((item) => item.i === widgetId)) return
    const newItem = newCardItem(widgetId)
    if (newItem) set({ layout: [...layout, newItem] })
  },

  removeWidget: (widgetId) => {
    const { layout } = get()
    set({ layout: layout.filter((item) => item.i !== widgetId) })
  },

  resetLayout: () => {
    set({ layout: defaultLayout() })
  },
}))
