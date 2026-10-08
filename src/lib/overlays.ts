// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. The set video reads `isOverlayOpen()` every frame while a set
// plays (it steps off the window); the global shortcuts (useShortcuts) give
// way while one is open.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.repeat) return
  if (closeTopOverlay()) {
    event.preventDefault()
    event.stopPropagation()
  }
}

/** Adds an open overlay; the answer removes it again. */
export function registerOverlay(close: Close): () => void {
  const entry = { close }
  stack.push(entry)
  if (stack.length === 1) window.addEventListener('keydown', onKeyDown, true)
  return () => {
    const index = stack.indexOf(entry)
    if (index !== -1) stack.splice(index, 1)
    if (stack.length === 0) window.removeEventListener('keydown', onKeyDown, true)
  }
}

export function isOverlayOpen(): boolean {
  return stack.length > 0
}

/** Asks the overlay opened last to close; false when none is open. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

/** Registers the calling overlay while `open` is true. */
export function useOverlay(open: boolean, onClose: Close): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    return registerOverlay(() => closeRef.current())
  }, [open])
}
