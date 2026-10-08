// src/components/ShortcutsSheet.tsx
// ⌘/: the keyboard shortcuts on a small sheet (Interactions spec, Keyboard).
// An overlay: Esc, a press outside, ✕ or ⌘/ again closes it.
import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '../lib/overlays'
import { SHORTCUT_ROWS, modKeyLabel } from '../lib/shortcuts/shortcuts'
import { Icon } from './Icon'
import './ShortcutsSheet.css'

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  useOverlay(true, onClose)
  const titleId = useId()

  // ⌘/ closes it too (the global shortcuts give way while it is open).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === '/' || event.key === '?')) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const mod = modKeyLabel()
  return createPortal(
    <div
      className="shortcuts-sheet__backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="shortcuts-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="shortcuts-sheet__head">
          <h2 id={titleId} className="shortcuts-sheet__title">
            Keyboard shortcuts
          </h2>
          <button type="button" className="link-btn" aria-label="Close" onClick={onClose}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <dl className="shortcuts-sheet__list">
          {SHORTCUT_ROWS.map((row) => (
            <div className="shortcuts-sheet__row" key={row.does}>
              <dt className="shortcuts-sheet__keys">
                {row.keys.map((key) => (
                  <kbd key={key}>{key === '⌘' ? mod : key}</kbd>
                ))}
              </dt>
              <dd className="shortcuts-sheet__does">{row.does}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  )
}
