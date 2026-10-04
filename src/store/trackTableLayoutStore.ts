// src/store/trackTableLayoutStore.ts
// The track table's column layout (lib/trackTable/columns.ts), read once at
// start-up: every view change remounts the table, so it must not read the
// settings table itself. Changes are written back.
import { create } from 'zustand'
import { tauriApi } from '../lib/tauri-api'
import {
  LAYOUT_SETTING,
  defaultLayout,
  parseLayout,
  type TrackTableLayout,
} from '../lib/trackTable/columns'

interface TrackTableLayoutState {
  layout: TrackTableLayout
  /** Reads the stored layout; App calls it once, during the splash. */
  load: () => Promise<void>
  /**
   * Shows `layout` and writes it to the settings table, unless `persist` is
   * false: while a column edge is dragged, every move only shows.
   */
  setLayout: (layout: TrackTableLayout, persist?: boolean) => void
  /** Writes the layout shown, e.g. when a drag ends. */
  save: () => void
}

export const useTrackTableLayout = create<TrackTableLayoutState>((set, get) => ({
  layout: defaultLayout(),

  load: async () => {
    try {
      set({ layout: parseLayout(await tauriApi.getSetting(LAYOUT_SETTING)) })
    } catch (err) {
      console.warn('[TrackTable] Failed to read the column layout:', err)
    }
  },

  setLayout: (layout, persist = true) => {
    set({ layout })
    if (persist) get().save()
  },

  save: () => {
    tauriApi
      .setSetting(LAYOUT_SETTING, JSON.stringify(get().layout))
      .catch((err) => console.warn('[TrackTable] Failed to save the column layout:', err))
  },
}))
