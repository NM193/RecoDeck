// src/components/Popover.tsx
// A panel that hangs under its button: it opens with a fade, a 4px drop and
// a scale from 0.98 and closes faster (Interactions spec). It registers with
// useOverlay, so Esc closes it; so does a press outside its anchor.
import { useEffect, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useOverlay } from '../lib/overlays'
import { EASE, MOTION } from '../lib/motion'
import './Popover.css'

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
