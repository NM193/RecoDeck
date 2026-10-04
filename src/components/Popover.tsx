// src/components/Popover.tsx
// A panel that hangs under its button: it opens with a fade, a 4px drop and
// a scale from 0.98 and closes faster (Interactions spec). It registers with
// useOverlay, so Esc closes it; so does a press outside its anchor. It tells
// its content how much room there is under the anchor (--popover-room), so a
// tall list can scroll inside it instead of being cut off.
import { useCallback, useEffect, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useOverlay } from '../lib/overlays'
import { EASE, MOTION } from '../lib/motion'
import './Popover.css'

// The height from just under the anchor to the nearest edge that clips it:
// the window, or an ancestor that does not let content overflow.
function roomBelow(anchor: HTMLElement): number {
  const top = anchor.getBoundingClientRect().bottom + 6
  let bottom = window.innerHeight
  for (let el = anchor.parentElement; el; el = el.parentElement) {
    if (getComputedStyle(el).overflowY !== 'visible') {
      bottom = Math.min(bottom, el.getBoundingClientRect().bottom)
    }
  }
  return Math.max(120, Math.floor(bottom - top - 8))
}

interface PopoverProps {
  open: boolean
  onClose: () => void
  /**
   * The positioned element holding the popover and the button that opens it.
   * The popover hangs under it; a press outside it closes the popover.
   */
  anchorRef: RefObject<HTMLElement | null>
  /** Names the panel for screen readers. */
  label: string
  className?: string
  children: ReactNode
}

export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  className,
  children,
}: PopoverProps) {
  const reduceMotion = useReducedMotion()
  useOverlay(open, onClose)

  const measure = useCallback(
    (panel: HTMLDivElement | null) => {
      if (panel && anchorRef.current) {
        panel.style.setProperty('--popover-room', `${roomBelow(anchorRef.current)}px`)
      }
    },
    [anchorRef],
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose, anchorRef])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={measure}
          role="dialog"
          aria-label={label}
          className={className ? `popover ${className}` : 'popover'}
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
              duration: reduceMotion ? MOTION.fast : MOTION.base,
              ease: EASE,
            },
          }}
          exit={{ opacity: 0, transition: { duration: MOTION.fast, ease: EASE } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
