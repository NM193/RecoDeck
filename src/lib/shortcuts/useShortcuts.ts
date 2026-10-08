// src/lib/shortcuts/useShortcuts.ts
// App's global keys (Interactions spec, Keyboard). A key a component already
// handled (preventDefault) is left alone; Esc is the overlays', the drag
// layer's and the track table's own.
import { useEffect, useRef } from 'react'
import { isOverlayOpen } from '../overlays'
import { useTrackDragStore } from '../drag/trackDrag'
import { drivePlayer, trackLastPlayed } from './players'
import { focusPageSearch, isTextField, ownsSpace, shortcutFor } from './shortcuts'

export interface ShortcutActions {
  openSearch: () => void
  toggleSheet: () => void
}

export function useShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })

  useEffect(() => trackLastPlayed(), [])

  // How focus last moved: Tab, or a press (which may focus a button).
  const focusFromKeyboard = useRef(false)
  useEffect(() => {
    const onPointerDown = () => {
      focusFromKeyboard.current = false
    }
    const onTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') focusFromKeyboard.current = true
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onTab, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onTab, true)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const focused = document.activeElement
      const shortcut = shortcutFor(event, {
        typing: isTextField(focused),
        overlayOpen: isOverlayOpen(),
        dragging: useTrackDragStore.getState().payload !== null,
        controlHasSpace: ownsSpace(focused, focusFromKeyboard.current),
      })
      if (!shortcut) return
      // Also the WebView's own: Space scrolling the page, ⌘F's find.
      event.preventDefault()
      if (shortcut === 'play-pause' || shortcut === 'next' || shortcut === 'previous') drivePlayer(shortcut)
      else if (shortcut === 'search') actionsRef.current.openSearch()
      else if (shortcut === 'find') focusPageSearch()
      else actionsRef.current.toggleSheet()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
