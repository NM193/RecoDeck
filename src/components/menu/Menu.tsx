// src/components/menu/Menu.tsx
// The app's one menu (Interactions spec, Menus): it opens at the pointer,
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red; one with no Undo asks first, in the menu's place (Cancel
// has the keys). The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
// A searchable submenu has a box at its top: typing narrows its items.
import {
  useEffect,
  useId,
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
  /** Ask first, in the menu's place: the question, and the answer's label ("Remove"). */
  confirm?: { message: string; label: string }
  onSelect: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
  icon?: IconName
  hint?: string
  disabled?: boolean
  entries: MenuEntry[]
  /** A box at the top narrows a long list as you type (Move to folder ▸). */
  search?: { placeholder: string; empty: string }
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
  const [asking, setAsking] = useState<MenuAction | null>(null)

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
    asking?.confirm ? (
      <MenuConfirm
        x={at.x}
        y={at.y}
        question={asking.confirm.message}
        answer={asking.confirm.label}
        onCancel={onClose}
        onConfirm={() => {
          onClose()
          asking.onSelect()
        }}
      />
    ) : (
      <MenuPanel
        entries={entries}
        x={at.x}
        y={at.y}
        label={label}
        takeFocus
        onChoose={(action) => {
          if (action.confirm) {
            setAsking(action)
            return
          }
          onClose()
          action.onSelect()
        }}
      />
    ),
    document.body,
  )
}

/**
 * Puts a panel at x, y inside the window: its right edge at `flipX` instead
 * when the right has no room. It shows once placed.
 */
function place(panel: HTMLElement, x: number, y: number, flipX?: number) {
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
}

// The question in the menu's place: Cancel, which has the keys, and the red
// answer; Tab moves between the two. Esc and a press outside cancel, as they
// close the menu.
function MenuConfirm({
  x,
  y,
  question,
  answer,
  onCancel,
  onConfirm,
}: {
  x: number
  y: number
  question: string
  answer: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const questionId = useId()

  useLayoutEffect(() => {
    if (panelRef.current) place(panelRef.current, x, y)
  }, [x, y])

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true })
  }, [])

  // Tab moves between the two answers, by hand: leaving them would leave the
  // menu open, and WebKit's Tab skips buttons unless the system says so.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const buttons = [...(panelRef.current?.querySelectorAll('button') ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={questionId}
      className="menu menu--confirm"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p id={questionId} className="menu__question">
        {question}
      </p>
      <div className="menu__answers">
        <button ref={cancelRef} type="button" className="btn btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--danger btn--sm" onClick={onConfirm}>
          {answer}
        </button>
      </div>
    </div>
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
  search?: MenuSubmenu['search']
}

/** The items whose labels hold every typed letter run; separators go while narrowing. */
function narrow(entries: MenuEntry[], query: string): MenuEntry[] {
  const words = query.trim().toLowerCase()
  if (!words) return entries
  return entries.filter((e) => e.kind !== 'separator' && e.label.toLowerCase().includes(words))
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
  search,
}: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [query, setQuery] = useState('')
  const shown = search ? narrow(entries, query) : entries
  const [active, setActive] = useState(() => (startActive ? stepIndex(entries, -1, 1) : -1))
  const [open, setOpen] = useState<OpenSubmenu | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Items that change under the highlight (a fresh folder list) drop it:
  // Enter must not choose whatever now sits in its place.
  const labels = entries.map((e) => (e.kind === 'separator' ? '' : e.label)).join('\n')
  const [seenLabels, setSeenLabels] = useState(labels)
  if (labels !== seenLabels) {
    setSeenLabels(labels)
    setActive(-1)
    setOpen(null)
  }

  // Placed once its size is known, and again when its items come or change
  // (a list read as it opens): inside the window, flipped when needed.
  useLayoutEffect(() => {
    if (panelRef.current) place(panelRef.current, x, y, flipX)
  }, [x, flipX, y, labels])

  // A searchable list takes the keys at once, so typing narrows it.
  useEffect(() => {
    if (search) searchRef.current?.focus({ preventScroll: true })
    else if (takeFocus) panelRef.current?.focus({ preventScroll: true })
  }, [takeFocus, search])

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
    const entry = shown[index]
    if (!entry || entry.kind === 'separator' || entry.disabled) return
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
      setActive((index) => stepIndex(shown, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (shown[active]?.kind === 'submenu') enter(active, true)
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault()
      onBack()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (active >= 0) enter(active, true)
    }
  }

  // The search box's keys: ↑ ↓ move through the list, Enter chooses (the
  // only match, when none is active), ← on an empty box goes back.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => stepIndex(shown, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const only = stepIndex(shown, -1, 1)
      if (active >= 0) enter(active, true)
      else if (only !== -1 && stepIndex(shown, only, 1) === only) enter(only, true)
    } else if (event.key === 'ArrowLeft' && !query && onBack) {
      event.preventDefault()
      onBack()
    }
  }

  const submenu = open !== null ? shown[open.index] : null

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className={search ? 'menu menu--search' : 'menu'}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {search && (
          <input
            ref={searchRef}
            className="menu__search"
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(-1)
            }}
            onKeyDown={onSearchKeyDown}
          />
        )}
        {search && shown.length === 0 && <div className="menu__empty">{search.empty}</div>}
        <div className={search ? 'menu__list' : undefined}>
          {shown.map((entry, index) => {
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
      </div>
      {submenu?.kind === 'submenu' && open && (
        <Submenu
          key={open.index}
          entries={submenu.entries}
          search={submenu.search}
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
  search,
  rect,
  label,
  fromKeyboard,
  onChoose,
  onBack,
  onPointerEnter,
}: {
  entries: MenuEntry[]
  search?: MenuSubmenu['search']
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
        search={search}
      />
    </div>
  )
}
