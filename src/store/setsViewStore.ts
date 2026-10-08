// src/store/setsViewStore.ts
// Where Sets' library was left (Sets redesign spec, Back): its tab, its
// grouping and how far it was scrolled. Kept outside SetsView, so Back from a
// set's page — even after Sets was remounted by a trip through a DJ page —
// returns to the library as it was.
import { create } from 'zustand'

export type SetsTab = 'library' | 'saved' | 'channels' | 'stats'

interface SetsViewState {
  tab: SetsTab
  grouping: 'dj' | 'recent'
  scrollTop: number
  /** Raised by the sidebar's Sets while Sets shows: a set's page goes back to the library. */
  libraryRequests: number
  setTab: (tab: SetsTab) => void
  setGrouping: (grouping: 'dj' | 'recent') => void
  setScrollTop: (scrollTop: number) => void
  requestLibrary: () => void
}

export const useSetsView = create<SetsViewState>((set) => ({
  tab: 'library',
  grouping: 'dj',
  scrollTop: 0,
  libraryRequests: 0,
  setTab: (tab) => set({ tab, scrollTop: 0 }),
  setGrouping: (grouping) => set({ grouping }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  requestLibrary: () => set((s) => ({ libraryRequests: s.libraryRequests + 1 })),
}))
