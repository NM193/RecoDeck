// src/lib/shortcuts/shortcuts.ts
// The global shortcuts (Interactions spec, Keyboard): which key does what,
// and when a key is someone else's — a text field's, an open menu's, or a
// control's that shows the keyboard ring (its own Space). ⌘ is Ctrl on
// Windows, as the sidebar's ⌘\ already reads it.

export type Shortcut = 'play-pause' | 'next' | 'previous' | 'search' | 'find' | 'sheet'

export interface KeyPress {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export interface ShortcutContext {
  /** Focus is in a text field: its keys are its own. */
  typing: boolean
  /** A menu, popover or modal is open. */
  overlayOpen: boolean
  /** Tracks are being dragged: Esc is the drag's, the rest waits. */
  dragging: boolean
  /** A control showing the keyboard ring has focus: Space is its own. */
  controlHasSpace: boolean
}

/** What a key press does here, or null when it is not a global shortcut now. */
export function shortcutFor(press: KeyPress, context: ShortcutContext): Shortcut | null {
  if (press.repeat || press.altKey || context.typing || context.overlayOpen || context.dragging) return null
  if (!press.metaKey && !press.ctrlKey) {
    if (press.key === ' ' && !press.shiftKey && !context.controlHasSpace) return 'play-pause'
    return null
  }
  // "/" takes Shift on many layouts (Shift+7 on a Serbian or German one).
  if (press.key === '/' || press.key === '?') return 'sheet'
  if (press.shiftKey) return null
  switch (press.key) {
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'previous'
    case 'k':
    case 'K':
      return 'search'
    case 'f':
    case 'F':
      return 'find'
  }
  return null
}

const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

/** A text field: a text input, a textarea, or editable text. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable === true
}

const SPACE_CONTROLS = [
  'button',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select',
  'summary',
].join(', ')

/**
 * A control that keeps its own Space: one reached from the keyboard (Tab)
 * that shows the keyboard ring. A button just clicked with the mouse does
 * not — WebView2 focuses it, and can call it :focus-visible once a key is
 * pressed — so Space still plays and pauses.
 */
export function ownsSpace(el: Element | null, focusFromKeyboard: boolean): boolean {
  if (!focusFromKeyboard || !el || !el.matches(SPACE_CONTROLS)) return false
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/** ⌘F: the page's own search box (marked `data-page-search`), focused with its text selected. */
export function focusPageSearch(): boolean {
  const box = [...document.querySelectorAll<HTMLInputElement>('[data-page-search]')].find(
    (el) => el.getClientRects().length > 0,
  )
  if (!box) return false
  box.focus()
  box.select()
  return true
}

/** "⌘" on macOS, "Ctrl" on Windows: how the sheet writes the key. */
export function modKeyLabel(platform: string = navigator.platform): string {
  return platform.startsWith('Win') ? 'Ctrl' : '⌘'
}

/** The shortcuts a tooltip can name (data-tip-keys). */
export type ShortcutId =
  | 'play-pause'
  | 'next'
  | 'previous'
  | 'search'
  | 'find'
  | 'sidebar'
  | 'shortcuts'
  | 'cancel'
  | 'move'
  | 'play-selected'
  | 'select-all'

/** The sheet's rows (⌘/), in the spec's order. "⌘" is written as `modKeyLabel()`. */
export const SHORTCUT_ROWS: ReadonlyArray<{ id: ShortcutId; keys: string[]; does: string }> = [
  { id: 'play-pause', keys: ['Space'], does: 'Play or pause — the player or the set, whichever played last' },
  { id: 'next', keys: ['⌘', '→'], does: 'Next track' },
  { id: 'previous', keys: ['⌘', '←'], does: 'Previous track' },
  { id: 'search', keys: ['⌘', 'K'], does: 'Search' },
  { id: 'find', keys: ['⌘', 'F'], does: "Find on this page: the page's search box" },
  { id: 'sidebar', keys: ['⌘', '\\'], does: 'Collapse or open the sidebar' },
  { id: 'shortcuts', keys: ['⌘', '/'], does: 'These shortcuts' },
  { id: 'cancel', keys: ['Esc'], does: 'Cancel a drag, close a menu, or clear the selection' },
  { id: 'move', keys: ['↑', '↓'], does: 'In a track list: move the selection (Shift adds to it)' },
  { id: 'play-selected', keys: ['Enter'], does: 'In a track list: play the selected track' },
  { id: 'select-all', keys: ['⌘', 'A'], does: 'In a track list: select every row shown' },
]

/**
 * A shortcut's keys as the sheet writes them, ⌘ as `modKeyLabel()`: the
 * chips of a tooltip's data-tip-keys (Micro-interactions spec, Tooltips).
 * Null for an id that is not in the sheet.
 */
export function shortcutKeys(id: string, platform: string = navigator.platform): string[] | null {
  const row = SHORTCUT_ROWS.find((r) => r.id === id)
  return row ? row.keys.map((key) => (key === '⌘' ? modKeyLabel(platform) : key)) : null
}
