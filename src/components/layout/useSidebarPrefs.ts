// src/components/layout/useSidebarPrefs.ts
// Wires the sidebar's rules (lib/sidebarPrefs.ts) to localStorage, the window,
// the keyboard and the settings table. Called once, from App.tsx.
import { useCallback, useEffect, useRef, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import {
  COLLAPSED_KEY,
  COLOURS_KEY,
  collapseOnResize,
  initialCollapsed,
  parseColours,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'

function readStored(): string | null {
  try {
    return localStorage.getItem(COLLAPSED_KEY)
  } catch {
    return null
  }
}

function writeStored(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Storage can be unavailable; the state still works for this session.
  }
}

export interface SidebarPrefs {
  collapsed: boolean
  toggleCollapsed: () => void
  colours: ColourOverrides
  setColour: (section: SidebarSection, hex: string) => void
  resetColour: (section: SidebarSection) => void
}

interface SidebarPrefsOptions {
  /** True once the database is open; the colours live in its settings table. */
  dbReady: boolean
}

export function useSidebarPrefs({ dbReady }: SidebarPrefsOptions): SidebarPrefs {
  const [collapsed, setCollapsedState] = useState(() =>
    initialCollapsed(readStored(), window.innerWidth),
  )

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    writeStored(next)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  // Only crossing the breakpoint acts — and it is stored exactly like a toggle.
  useEffect(() => {
    let prev = window.innerWidth
    const onResize = () => {
      const next = window.innerWidth
      const change = collapseOnResize(prev, next)
      prev = next
      if (change !== null) setCollapsed(change)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setCollapsed])

  // ⌘\ on macOS, Ctrl+\ elsewhere. Re-subscribes on each toggle; that is fine.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Held down, the key repeats; one press is one toggle.
      if (e.repeat || e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      toggleCollapsed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  // Colours: defaults until the stored overrides arrive.
  const [colours, setColours] = useState<ColourOverrides>({})
  // Nothing is saved until the stored overrides have been read: saving earlier,
  // or after a failed read, would overwrite the ones never seen.
  const loaded = useRef(false)

  // The settings table only answers once the database is open (App.tsx opens
  // it after the first render), so the read waits for that.
  useEffect(() => {
    if (!dbReady) return
    let cancelled = false
    tauriApi
      .getSetting(COLOURS_KEY)
      .then((raw) => {
        if (cancelled) return
        loaded.current = true
        // A colour picked before the stored ones arrived wins over them.
        setColours((prev) => ({ ...parseColours(raw), ...prev }))
      })
      .catch((err) => {
        console.warn('Sidebar colours could not be read', err)
      })
    return () => {
      cancelled = true
    }
  }, [dbReady])

  // Saved only after the user changed something — never the initial load —
  // and debounced, because the system colour picker reports every step of a
  // drag. The ref is written in event handlers only, never during render.
  const changedByUser = useRef(false)
  useEffect(() => {
    if (!changedByUser.current || !loaded.current) return
    const timer = setTimeout(() => {
      tauriApi.setSetting(COLOURS_KEY, JSON.stringify(colours)).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [colours])

  const setColour = useCallback((section: SidebarSection, hex: string) => {
    changedByUser.current = true
    setColours((prev) => ({ ...prev, [section]: hex.toLowerCase() }))
  }, [])

  const resetColour = useCallback((section: SidebarSection) => {
    changedByUser.current = true
    setColours((prev) => {
      const next = { ...prev }
      delete next[section]
      return next
    })
  }, [])

  return { collapsed, toggleCollapsed, colours, setColour, resetColour }
}
