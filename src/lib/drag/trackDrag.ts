// src/lib/drag/trackDrag.ts
// The drag layer (Interactions spec, Drag and drop). Pointer events, not HTML5
// drag and drop: rows of the virtualized table unmount while it scrolls, which
// would cancel a native drag, and the Tauri window's file-drop handling would
// take it. The move and up listeners sit on window, and the target is read
// from the element under the pointer (dropTargets.ts). While dragging, a label
// follows the pointer (DragGhost), the dragged rows dim, a valid target lights
// up, a list scrolls when the pointer stays near its edge, resting on a closed
// folder or a rail icon opens it, and Esc cancels.
import { create } from 'zustand'
import { restKeyAt, targetAt, type DragPayload, type DropTarget } from './dropTargets'

export interface Point {
  x: number
  y: number
}

/** Resting this long on a closed folder or a rail icon opens it. */
const REST_OPEN_MS = 600
/** A list scrolls when the pointer is this close to its top or bottom edge… */
const EDGE = 16
/** …and has stayed there this long, so the row at the edge can still be aimed at. */
const EDGE_WAIT_MS = 300
/** Pixels a list scrolls per frame with the pointer at its very edge. */
const MAX_STEP = 16

interface TrackDragState {
  /** What is being dragged; null when nothing is. */
  payload: DragPayload | null
  /** The pointer. */
  x: number
  y: number
  /** The target under the pointer, when the tracks can land there. */
  target: DropTarget | null
  /** Raised each time a list scrolls under a still pointer. */
  scrolls: number
}

export const useTrackDragStore = create<TrackDragState>(() => ({
  payload: null,
  x: 0,
  y: 0,
  target: null,
  scrolls: 0,
}))

type Opener = (value: string, element: HTMLElement) => void
const openers = new Map<string, Opener>()

/**
 * What resting on `data-drop-open="<kind>:<value>"` does for one kind; the
 * answer unregisters it.
 */
export function registerDropOpener(kind: string, open: Opener): () => void {
  openers.set(kind, open)
  return () => {
    if (openers.get(kind) === open) openers.delete(kind)
  }
}

function openAt(key: string, element: HTMLElement) {
  const colon = key.indexOf(':')
  if (colon === -1) return
  openers.get(key.slice(0, colon))?.(key.slice(colon + 1), element)
}

// The list under the pointer that can scroll towards the edge the pointer is
// near, with the step it would scroll: further the closer to the edge.
function listAtEdge(element: Element | null, y: number): { list: HTMLElement; step: number } | null {
  for (
    let list = element?.closest<HTMLElement>('[data-drop-scroll]');
    list;
    list = list.parentElement?.closest<HTMLElement>('[data-drop-scroll]')
  ) {
    const { top, bottom } = list.getBoundingClientRect()
    const depth = y < top + EDGE ? y - (top + EDGE) : y > bottom - EDGE ? y - (bottom - EDGE) : 0
    const room = depth < 0 ? list.scrollTop : list.scrollHeight - list.clientHeight - list.scrollTop
    if (depth === 0 || room <= 0) continue
    const step = Math.sign(depth) * Math.ceil(MAX_STEP * Math.min(1, Math.abs(depth) / EDGE))
    return { list, step }
  }
  return null
}

// The click a release fires after a drag is not a click on a row.
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

// A drag cancelled with the button still down (Esc): its release, when it
// comes, clicks nothing either. A new press first means that release was lost.
function swallowClickOfRelease() {
  const done = () => {
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointerdown', done, true)
  }
  const onUp = () => {
    done()
    swallowNextClick()
  }
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointerdown', done, true)
}

/**
 * Drags `payload` from the pointer at `at`. `onDrop` gets the valid target the
 * tracks are let go over, and the pointer. Esc, a right-click, a cancelled
 * pointer, a move with the button no longer down (its release was lost) or
 * the window losing focus ends it with nothing dropped.
 */
export function startTrackDrag(
  payload: DragPayload,
  at: Point,
  onDrop: (target: DropTarget, at: Point) => void,
): void {
  if (useTrackDragStore.getState().payload) return
  const root = document.documentElement
  let { x, y } = at
  let lit: HTMLElement | null = null
  let rest: { key: string; since: number; opened: boolean } | null = null
  let edge: { list: HTMLElement; since: number } | null = null
  let frame = 0

  const light = (element: HTMLElement | null) => {
    if (element === lit) return
    lit?.removeAttribute('data-drop-over')
    lit = element
    lit?.setAttribute('data-drop-over', '')
  }

  // What is under the pointer now: the target lit, the cursor, the store.
  const update = () => {
    const found = targetAt(document.elementFromPoint(x, y), payload)
    const valid = found?.valid ? found : null
    light(valid?.element ?? null)
    root.classList.toggle('track-drag--refused', found !== null && !found.valid)
    useTrackDragStore.setState({ x, y, target: valid?.target ?? null })
  }

  // Each frame: scroll a list the pointer has stayed near the edge of, and
  // open what it has rested on long enough.
  const tick = (now: number) => {
    const element = document.elementFromPoint(x, y)
    const near = listAtEdge(element, y)
    if (!near) {
      edge = null
    } else if (edge?.list !== near.list) {
      edge = { list: near.list, since: now }
    } else if (now - edge.since >= EDGE_WAIT_MS) {
      near.list.scrollTop += near.step
      useTrackDragStore.setState((state) => ({ scrolls: state.scrolls + 1 }))
      update()
    }
    const key = restKeyAt(element)
    if (key === null) {
      rest = null
    } else if (rest?.key !== key) {
      rest = { key, since: now, opened: false }
    } else if (!rest.opened && now - rest.since >= REST_OPEN_MS) {
      rest.opened = true
      const holder = element?.closest<HTMLElement>('[data-drop-open]')
      if (holder) openAt(key, holder)
    }
    frame = requestAnimationFrame(tick)
  }

  // `released`: the pointer came up (a drop, or nothing under it).
  const end = (released: boolean) => {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('contextmenu', onContextMenu, true)
    const { target } = useTrackDragStore.getState()
    light(null)
    root.classList.remove('track-drag', 'track-drag--refused')
    useTrackDragStore.setState({ payload: null, target: null })
    if (!released) {
      swallowClickOfRelease()
      return
    }
    swallowNextClick()
    if (target) onDrop(target, { x, y })
  }

  const onMove = (event: PointerEvent) => {
    // The main button is up: its release was lost (a dialog, another window).
    if ((event.buttons & 1) === 0) {
      end(false)
      return
    }
    x = event.clientX
    y = event.clientY
    update()
  }
  const onUp = (event: PointerEvent) => {
    x = event.clientX
    y = event.clientY
    update()
    end(true)
  }
  const onCancel = () => end(false)
  // Esc cancels the drag before anything else hears it (a menu, the table).
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    end(false)
  }
  // A right-click cancels it, and opens no menu.
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    end(false)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('contextmenu', onContextMenu, true)
  root.classList.add('track-drag')
  window.getSelection()?.removeAllRanges()
  useTrackDragStore.setState({ payload, x, y, target: null })
  update()
  frame = requestAnimationFrame(tick)
}
