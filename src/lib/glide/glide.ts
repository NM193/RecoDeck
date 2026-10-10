// src/lib/glide/glide.ts
// The sliding highlight (Micro-interactions spec, The glide): one element in a
// list that grows in on the first item it reaches, slides from item to item,
// and fades out where it is. Framework-free; useHoverGlide and useGlideTo
// drive it. Styles are written straight to the element, so a pointer move
// never re-renders React.

export interface GlideOptions {
  /** The transform it grows from as it appears, e.g. 'scaleY(.4)'. */
  enterFrom: string
  /** Its colour on an item, when that changes per item (a menu's Delete); null keeps the CSS one. */
  tintFor?: (item: Element) => string | null
}

/** How each kind of highlight appears (spec, How each highlight appears). */
export const GLIDE = {
  row: { enterFrom: 'scaleY(.4)' },
  menu: { enterFrom: 'scaleY(.5)' },
  card: { enterFrom: 'scale(.94)' },
  icon: { enterFrom: 'scale(.6)' },
} as const satisfies Record<string, GlideOptions>

/**
 * A menu's highlight: the accent from the CSS, red on a destructive item,
 * the one with the class `danger` (spec, Menus).
 */
export function menuGlide(danger: string): GlideOptions {
  return {
    ...GLIDE.menu,
    tintFor: (item) =>
      item.classList.contains(danger)
        ? 'rgba(var(--color-danger-rgb), 0.2)'
        : null,
  }
}

const SLIDE = '240ms var(--ease-soft)'
const APPEAR = '160ms var(--ease)'
const VANISH = '140ms var(--ease)'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where `item` sits in `track`'s own coordinates: the rects' difference, less
 * the track's border, plus its scroll when the track itself scrolls. Divided
 * by the track's scale, so an ancestor's transform (a menu scaling in as it
 * opens) does not throw it off.
 */
export function boxIn(track: HTMLElement, item: Element): Box {
  const t = track.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  const sx =
    track.offsetWidth > 0 && t.width > 0 ? t.width / track.offsetWidth : 1
  const sy =
    track.offsetHeight > 0 && t.height > 0 ? t.height / track.offsetHeight : 1
  return {
    x: (r.left - t.left) / sx - track.clientLeft + track.scrollLeft,
    y: (r.top - t.top) / sy - track.clientTop + track.scrollTop,
    width: r.width / sx,
    height: r.height / sy,
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const sameBox = (a: Box | null, b: Box) =>
  a !== null &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height

export interface Glide {
  /** Grow in on `item`, slide to it, or (null) fade out where it is. On its own item: refresh. */
  moveTo(item: Element | null): void
  /** Put it back on its item, without a transition, when the item or the track moved or changed size. */
  refresh(): void
  /** The item it is on; null while hidden. */
  readonly item: Element | null
}

export function createGlide(
  track: HTMLElement,
  el: HTMLElement,
  options: GlideOptions,
): Glide {
  let current: Element | null = null
  // Where it was last sent: the end of a slide still running.
  let placed: Box | null = null

  function place(box: Box, enterFrom = '') {
    el.style.width = `${box.width}px`
    el.style.height = `${box.height}px`
    el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)${enterFrom ? ` ${enterFrom}` : ''}`
    placed = box
  }

  // The item's corners, and its colour when it has its own.
  function dress(item: Element) {
    el.style.borderRadius = getComputedStyle(item).borderRadius
    el.style.backgroundColor = options.tintFor?.(item) ?? ''
  }

  function refresh() {
    // A row the list has unmounted (scrolled away) keeps the highlight where it was.
    if (current === null || !current.isConnected) return
    const box = boxIn(track, current)
    if (sameBox(placed, box)) return
    el.style.transition = 'none'
    place(box)
  }

  function moveTo(item: Element | null) {
    if (item !== null && item === current) {
      refresh()
      return
    }
    if (item === null) {
      if (current === null) return
      current = null
      el.style.transition = `opacity ${VANISH}`
      el.style.opacity = '0'
      return
    }
    const reduced = prefersReducedMotion()
    const box = boxIn(track, item)
    const appearing = current === null
    current = item
    dress(item)
    if (appearing) {
      // Jump there unseen, already small, then grow in from the item's centre.
      el.style.transition = 'none'
      place(box, reduced ? '' : options.enterFrom)
      el.style.opacity = '0'
      void el.offsetWidth // the jump lands before the transition starts
      el.style.transition = reduced
        ? `opacity ${APPEAR}`
        : `opacity ${APPEAR}, transform ${SLIDE}`
      place(box)
      el.style.opacity = '1'
    } else if (reduced) {
      el.style.transition = 'none'
      place(box)
    } else {
      el.style.transition = `transform ${SLIDE}, width ${SLIDE}, height ${SLIDE}, background-color ${SLIDE}`
      place(box)
    }
  }

  return {
    moveTo,
    refresh,
    get item() {
      return current
    },
  }
}
