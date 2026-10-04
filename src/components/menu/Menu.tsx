// src/components/menu/Menu.tsx
// The app's one menu (Interactions spec, Menus): it opens at the pointer,
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red. The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '../../lib/overlays'
import { Icon, type IconName } from '../Icon'
import { stepIndex } from './menuNav'
import './Menu.css'

export interface MenuAction {
  kind: 'action'
  label: string
  icon?: IconName
  /** A colour dot in the icon's place, e.g. a genre's colour. */
  swatch?: string
  /** Muted text at the right, e.g. the current genre. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** A check at the right: this is the current choice. */
  checked?: boolean
  onSelect: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
  icon?: IconName
  hint?: string
  disabled?: boolean
  entries: MenuEntry[]
}

export interface MenuSeparator {
  kind: 'separator'
}

export type MenuEntry = MenuAction | MenuSubmenu | MenuSeparator

/** Room kept between a menu and the window's edge. */
const EDGE = 8
/** A submenu stays open this long after the pointer moves to another item. */
const SUBMENU_GRACE_MS = 150

interface MenuProps {
  /** Where it opens: the pointer, for a right-click. */
  at: { x: number; y: number }
  entries: MenuEntry[]
  /** Names the menu for screen readers. */
  label: string
  onClose: () => void
}

export function Menu({ at, entries, label, onClose }: MenuProps) {
  useOverlay(true, onClose)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('.menu')) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Focus goes back to what had it (the table, for its keys) when the menu
  // closes: in a layout effect, so an item that opens a dialog still gives
  // the dialog's own box the focus after it.
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    <MenuPanel
      entries={entries}
      x={at.x}
      y={at.y}
      label={label}
      takeFocus
      onChoose={(action) => {
        onClose()
        action.onSelect()
      }}
    />,
    document.body,
  )
}

interface MenuPanelProps {
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
  label: string
  onChoose: (action: MenuAction) => void
  /** A submenu's ←: back to its parent. */
  onBack?: () => void
  /** The menu, and a submenu opened from the keyboard, take the keys. */
  takeFocus?: boolean
  /** A submenu opened from the keyboard starts on its first item. */
  startActive?: boolean
}

interface OpenSubmenu {
  index: number
  fromKeyboard: boolean
  /** Its item's box, read when it opened. */
  rect: DOMRect
}

function MenuPanel({
  entries,
  x,
  flipX,
  y,
  label,
  onChoose,
  onBack,
  takeFocus = false,
  startActive = false,
}: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(() => (startActive ? stepIndex(entries, -1, 1) : -1))
  const [open, setOpen] = useState<OpenSubmenu | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Placed once its size is known: inside the window, flipped when needed.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // offset sizes: the opening animation's scale does not count.
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    let left = x
    if (left + width > window.innerWidth - EDGE) left = (flipX ?? x) - width
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - width))
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - EDGE - height))
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.visibility = 'visible'
  }, [x, flipX, y])

  useEffect(() => {
    if (takeFocus) panelRef.current?.focus({ preventScroll: true })
  }, [takeFocus])

  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const openSubmenu = (index: number, fromKeyboard: boolean) => {
    const item = itemRefs.current[index]
    if (!item) return
    cancelClose()
    setOpen({ index, fromKeyboard, rect: item.getBoundingClientRect() })
  }

  // Back from a submenu: the keys come here again.
  const closeSubmenu = () => {
    cancelClose()
    setOpen(null)
    panelRef.current?.focus({ preventScroll: true })
  }

  const enter = (index: number, fromKeyboard: boolean) => {
    const entry = entries[index]
    if (entry.kind === 'separator' || entry.disabled) return
    if (entry.kind === 'action') onChoose(entry)
    else openSubmenu(index, fromKeyboard)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      // Not the page's text: there is nothing to select in a menu.
      event.preventDefault()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => stepIndex(entries, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (active >= 0 && entries[active].kind === 'submenu') enter(active, true)
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault()
      onBack()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (active >= 0) enter(active, true)
    }
  }

  const submenu = open !== null ? entries[open.index] : null

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className="menu"
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'separator') {
            return <div key={index} role="separator" className="menu__separator" />
          }
          const classes = ['menu__item']
          if (index === active) classes.push('menu__item--active')
          if (entry.kind === 'action' && entry.danger) classes.push('menu__item--danger')
          return (
            <div
              key={index}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              role="menuitem"
              aria-disabled={entry.disabled || undefined}
              aria-haspopup={entry.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={entry.kind === 'submenu' ? open?.index === index : undefined}
              className={classes.join(' ')}
              onPointerEnter={() => {
                setActive(entry.disabled ? -1 : index)
                if (entry.kind === 'submenu' && !entry.disabled) {
                  if (open?.index !== index) openSubmenu(index, false)
                  else cancelClose()
                } else if (open !== null) {
                  // Moving towards the submenu may cross other items: wait a moment.
                  cancelClose()
                  closeTimer.current = setTimeout(closeSubmenu, SUBMENU_GRACE_MS)
                }
              }}
              onClick={() => enter(index, false)}
            >
              <span className="menu__icon">
                {entry.kind === 'action' && entry.swatch ? (
                  <span className="menu__swatch" style={{ background: entry.swatch }} />
                ) : (
                  entry.icon && <Icon name={entry.icon} size={16} />
                )}
              </span>
              <span className="menu__label">{entry.label}</span>
              {entry.hint && <span className="menu__hint">{entry.hint}</span>}
              {entry.kind === 'action' && entry.checked && (
                <Icon name="Check" size={14} className="menu__check" />
              )}
              {entry.kind === 'submenu' && (
                <Icon name="ChevronRight" size={14} className="menu__chevron" />
              )}
            </div>
          )
        })}
      </div>
      {submenu?.kind === 'submenu' && open && (
        <Submenu
          key={open.index}
          entries={submenu.entries}
          rect={open.rect}
          label={submenu.label}
          fromKeyboard={open.fromKeyboard}
          onChoose={onChoose}
          onBack={closeSubmenu}
          onPointerEnter={() => {
            cancelClose()
            setActive(open.index)
          }}
        />
      )}
    </>
  )
}

// A submenu: a panel beside its item, an overlay of its own while open.
function Submenu({
  entries,
  rect,
  label,
  fromKeyboard,
  onChoose,
  onBack,
  onPointerEnter,
}: {
  entries: MenuEntry[]
  rect: DOMRect
  label: string
  fromKeyboard: boolean
  onChoose: (action: MenuAction) => void
  onBack: () => void
  onPointerEnter: () => void
}) {
  useOverlay(true, onBack)
  return (
    <div className="menu__sub-holder" onPointerEnter={onPointerEnter}>
      <MenuPanel
        entries={entries}
        x={rect.right + 2}
        flipX={rect.left - 2}
        y={rect.top - 6}
        label={label}
        onChoose={onChoose}
        onBack={onBack}
        takeFocus={fromKeyboard}
        startActive={fromKeyboard}
      />
    </div>
  )
}
