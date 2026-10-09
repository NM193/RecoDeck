// src/components/Toaster.tsx
// Shows the toasts (src/lib/toast.ts) bottom-centre over the main area, just
// above the player: they slide in from 8px below (slow) and fade out (base).
// Under the mouse a toast waits and shows its detail; its action (Undo) runs
// and closes it; an error has ✕, as it stays until closed.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  dismissToast,
  holdToast,
  releaseToast,
  runToastAction,
  useToasts,
} from '../lib/toast'
import { EASE, MOTION } from '../lib/motion'
import { Icon } from './Icon'
import './Toaster.css'

export function Toaster() {
  const toasts = useToasts()
  const reduceMotion = useReducedMotion()

  return (
    <div className="toaster" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduceMotion}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`toast toast--${t.kind}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: reduceMotion ? MOTION.fast : MOTION.base, ease: EASE },
            }}
            transition={{ duration: reduceMotion ? MOTION.fast : MOTION.slow, ease: EASE }}
            onPointerEnter={() => holdToast(t.id)}
            onPointerLeave={() => releaseToast(t.id)}
          >
            <span className="toast__dot" aria-hidden="true" />
            <span className="toast__text">
              <span className="toast__message">{t.message}</span>
              {t.detail && <span className="toast__detail">{t.detail}</span>}
            </span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => runToastAction(t.id)}>
                {t.action.label}
              </button>
            )}
            {t.kind === 'error' && (
              <button
                type="button"
                className="toast__close"
                aria-label="Close"
                onClick={() => dismissToast(t.id)}
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
