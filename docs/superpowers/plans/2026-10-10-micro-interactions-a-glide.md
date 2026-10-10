# Micro-interactions (a): the glide, rows, sidebar and menus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every track list, the sidebar and the menus get the sliding highlight: one element per list that grows in on the first item, slides from item to item and fades out where it is.

**Architecture:**
- **The core:** a framework-free `src/lib/glide/glide.ts` measures an item inside its track and moves one absolutely placed `<span class="glide">`.
- **The hooks:** `useHoverGlide` (follows the pointer) and `useGlideTo` (follows the open or active item) drive the core. Each takes the track's ref and the highlight's ref.
- **The wrapper:** where a list has no element of its own to hang them on, `HoverGlide` is a `<div>` that holds the highlight before its children.
- **CSS:** the shared `.glide-track` / `.glide` rules live in `controls.css`. Each track picks its colour with `--glide-bg`.

**Tech Stack:** React 19 + TypeScript, plain CSS, vitest (jsdom, React `act` without a testing library), Playwright WebKit for the visual check.

**Spec:** `docs/superpowers/specs/2026-10-10-micro-interactions-design.md`, plan (a). Plans (b) cards, player, stars and buttons, and (c) tooltips, follow.

---

## Conventions for every task

- **Branch:** `feat/micro-interactions`. Never commit `.planning/STATE.md` or anything under `.claude/`. Stage files by name.
- **Prettier hook:** a PostToolUse hook runs Prettier on any `.ts/.tsx/.css` written with Edit/Write. These files are **not** Prettier-clean, so an Edit would reformat all of them and bury the change in noise:
  - `TrackTable.tsx`/`.css`, `SearchView.tsx`/`.css`, `SetPage.tsx`/`.css`, `SetsSaved.tsx`;
  - `DjExportModal.tsx`;
  - `Sidebar.tsx`/`.css`, `SidebarRail.tsx`, `FolderTree.tsx`, `YouTubeMusicLists.tsx`, `Menu.tsx`;
  - `styles/globals.css`, `styles/controls.css`.

  Change them only with `python3` replace scripts that `assert old in s` before replacing. New files, and the files not listed, may use Write/Edit.
- **Commands:**
  - tests: `npx vitest run <path>`;
  - types: `npx tsc --noEmit`;
  - lint: `npx eslint <paths>`. `main` already has 9 lint errors in files this plan does not touch (WaveformVisualizer, ChatView, EQModal, PlaylistDetailHeader, SettingsView, tracklist/text). A task must add none.
- **Commits:** conventional, in English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Comment style:** a short header comment in each new file that names the spec section; comments say why, not what.

## File map

| File | Role |
|---|---|
| `src/lib/glide/glide.ts` (new) | the core: `boxIn`, `createGlide`, `GLIDE` presets, `menuGlide`, `prefersReducedMotion` |
| `src/lib/glide/useGlide.ts` (new) | `useHoverGlide`, `useGlideTo`, `GAP_GRACE_MS` |
| `src/components/HoverGlide.tsx` (new) | a `<div>` list with its highlight(s) |
| `src/styles/globals.css` | motion and colour tokens |
| `src/lib/motion.ts` | the JS mirror of the two new easings |
| `src/styles/controls.css` | `.glide-track`, `.glide`, `.glide--open` |
| row lists, sidebar, menus | each gets a track, a highlight and a `--glide-bg` |

---

### Task 1: Tokens and the shared glide CSS

**Files:**
- Modify: `src/styles/globals.css` (python)
- Modify: `src/lib/motion.ts`
- Modify: `src/styles/controls.css` (python)

- [ ] **Step 1: Add the tokens to `globals.css`**

```bash
python3 - <<'EOF'
p = 'src/styles/globals.css'
s = open(p).read()
old = "  --ease: cubic-bezier(0.2, 0, 0, 1);\n}"
assert s.count(old) == 1
s = s.replace(old, """  --ease: cubic-bezier(0.2, 0, 0, 1);

  /* Micro-interactions spec: slides, and pops that pass full size */
  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* The faint grey of the sidebar and the player, mixed from the text so it
     reads on light themes too: rgba(255,255,255,.045) on the dark ones. */
  --glide-weak: color-mix(in srgb, var(--text-primary) 4.5%, transparent);
  /* A secondary button's border on hover */
  --border-strong: #3d3d3d;
  /* The middle stop of the primary button's flowing gradient */
  --accent-flow: #8b5cf6;
}""")
old = ":root[data-theme='dawn'] {\n"
assert s.count(old) == 1
s = s.replace(old, old + "  --border-strong: #d1d5db;\n")
old = ":root[data-theme='custom'] {\n"
assert s.count(old) == 1
s = s.replace(old, old + "  /* The accent can be any colour here: the gradient stays in its family. */\n  --accent-flow: var(--accent-hover);\n")
open(p, 'w').write(s)
EOF
```

- [ ] **Step 2: Mirror the easings in `src/lib/motion.ts`** (Edit; the file is clean). Append:

```ts

/** The Micro-interactions spec's slide and spring (--ease-soft, --ease-spring). */
export const EASE_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const EASE_SPRING: [number, number, number, number] = [0.34, 1.56, 0.64, 1]
```

- [ ] **Step 3: Append the glide rules to `controls.css`**

```bash
cat >> src/styles/controls.css <<'EOF'

/* ===== Glide: the sliding highlight (Micro-interactions spec) =====
   lib/glide places and moves it; it stays hidden until it reaches an item.
   The track is positioned and isolated, so z-index -1 puts the highlight
   above the track's background and under every item. A page's own rule wins
   over .glide-track (this file loads first), so a fixed menu stays fixed. */
.glide-track {
  position: relative;
  isolation: isolate;
}

.glide {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  opacity: 0;
  pointer-events: none;
  background: var(--glide-bg, var(--bg-tertiary));
}

/* The sidebar's open page, painted over its hover highlight. */
.glide--open {
  background: rgba(var(--accent-rgb), 0.2);
}
EOF
```

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/lib/motion.ts`
Expected: no output.

```bash
git add src/styles/globals.css src/lib/motion.ts src/styles/controls.css
git commit -m "feat(motion): soft and spring easings, glide colours and the shared glide CSS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The glide core

**Files:**
- Create: `src/lib/glide/glide.ts`
- Test: `src/lib/glide/glide.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/glide/glide.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boxIn, createGlide, GLIDE, menuGlide } from './glide'

// jsdom has no layout: each element gets the rect a test gives it.
function rect(
  el: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect
}

function setReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

let track: HTMLDivElement
let el: HTMLSpanElement
let a: HTMLDivElement
let b: HTMLDivElement
beforeEach(() => {
  setReducedMotion(false)
  track = document.createElement('div')
  el = document.createElement('span')
  a = document.createElement('div')
  b = document.createElement('div')
  track.append(el, a, b)
  document.body.append(track)
  rect(track, 100, 50, 300, 200)
  rect(a, 100, 50, 300, 40)
  rect(b, 100, 90, 300, 40)
})
afterEach(() => track.remove())

describe('boxIn: where an item sits in its track', () => {
  it('is the difference of their rects', () => {
    expect(boxIn(track, b)).toEqual({ x: 0, y: 40, width: 300, height: 40 })
  })

  it("takes off the track's border and adds its scroll", () => {
    Object.defineProperty(track, 'clientTop', { value: 1 })
    Object.defineProperty(track, 'clientLeft', { value: 1 })
    track.scrollTop = 30
    expect(boxIn(track, b)).toEqual({ x: -1, y: 69, width: 300, height: 40 })
  })

  it('undoes a scale on the track (a menu scaling in)', () => {
    Object.defineProperty(track, 'offsetWidth', { value: 600 })
    Object.defineProperty(track, 'offsetHeight', { value: 400 })
    // drawn at half size: 300×200 on screen for 600×400 of layout
    expect(boxIn(track, b)).toEqual({ x: 0, y: 80, width: 600, height: 80 })
  })
})

describe('createGlide', () => {
  it('appears on its first item: jumps there small and unseen, then grows in', () => {
    const glide = createGlide(track, el, GLIDE.row)
    const seen: string[] = []
    // the jump is read (offsetWidth) before the transition starts
    Object.defineProperty(el, 'offsetWidth', {
      get: () => {
        seen.push(
          `${el.style.transition}|${el.style.transform}|${el.style.opacity}`,
        )
        return 0
      },
    })
    glide.moveTo(b)
    expect(seen).toEqual(['none|translate3d(0px, 40px, 0) scaleY(.4)|0'])
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.width).toBe('300px')
    expect(el.style.height).toBe('40px')
    expect(el.style.opacity).toBe('1')
    expect(el.style.transition).toContain('transform 240ms')
    expect(glide.item).toBe(b)
  })

  it('slides to the next item', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    glide.moveTo(b)
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.transition).toContain('transform 240ms var(--ease-soft)')
    expect(el.style.transition).toContain('height 240ms')
    expect(el.style.opacity).toBe('1')
  })

  it('fades out where it is, and appears again from small', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    glide.moveTo(null)
    expect(el.style.opacity).toBe('0')
    expect(el.style.transition).toBe('opacity 140ms var(--ease)')
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(glide.item).toBeNull()
    glide.moveTo(b)
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.opacity).toBe('1')
  })

  it('on its own item, follows it only when it moved, without a transition', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    const transition = el.style.transition
    glide.moveTo(a)
    expect(el.style.transition).toBe(transition)
    rect(a, 100, 70, 300, 40) // a row inserted above pushed it down
    glide.moveTo(a)
    expect(el.style.transition).toBe('none')
    expect(el.style.transform).toBe('translate3d(0px, 20px, 0)')
  })

  it('leaves an unmounted item alone on refresh', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    a.remove()
    rect(a, 0, 0, 0, 0)
    glide.refresh()
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(el.style.width).toBe('300px')
  })

  it("takes each item's corners, and its colour when it has one", () => {
    a.style.borderRadius = '6px'
    const glide = createGlide(track, el, {
      ...GLIDE.menu,
      tintFor: (item) => (item === b ? 'red' : null),
    })
    glide.moveTo(a)
    expect(el.style.borderRadius).toBe('6px')
    expect(el.style.backgroundColor).toBe('')
    glide.moveTo(b)
    expect(el.style.backgroundColor).toBe('red')
    expect(el.style.transition).toContain('background-color 240ms')
  })

  it('with reduced motion, only fades: no growing and no sliding', () => {
    setReducedMotion(true)
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    expect(el.style.transition).toBe('opacity 160ms var(--ease)')
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    glide.moveTo(b)
    expect(el.style.transition).toBe('none')
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
  })

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    expect(el.style.opacity).toBe('1')
    vi.unstubAllGlobals()
  })
})

describe('menuGlide', () => {
  it('grows like a menu and turns red on the destructive item', () => {
    const options = menuGlide('item--danger')
    expect(options.enterFrom).toBe(GLIDE.menu.enterFrom)
    b.classList.add('item--danger')
    expect(options.tintFor?.(a)).toBeNull()
    expect(options.tintFor?.(b)).toBe('rgba(var(--color-danger-rgb), 0.2)')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/glide/glide.test.ts`
Expected: FAIL. The test cannot resolve `./glide`.

- [ ] **Step 3: Write `src/lib/glide/glide.ts`**

```ts
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/glide/glide.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/lib/glide && npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/glide/glide.ts src/lib/glide/glide.test.ts
git commit -m "feat(glide): the sliding highlight's core — measure, grow in, slide, fade out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The hooks

**Files:**
- Create: `src/lib/glide/useGlide.ts`
- Test: `src/lib/glide/useGlide.test.tsx`

- [ ] **Step 1: Write the failing test** `src/lib/glide/useGlide.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GLIDE } from './glide'
import { GAP_GRACE_MS, useGlideTo, useHoverGlide } from './useGlide'
import { useTrackDragStore } from '../drag/trackDrag'
import type { DragPayload } from '../drag/dropTargets'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout: row i sits 40px under row i - 1.
function layOut(host: HTMLElement) {
  const track = host.querySelector<HTMLElement>('.track')!
  track.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 200 }) as DOMRect
  host.querySelectorAll<HTMLElement>('.item').forEach((item, i) => {
    item.getBoundingClientRect = () =>
      ({ left: 0, top: i * 40, width: 300, height: 40 }) as DOMRect
  })
}

function HoverList({ shown = true }: { shown?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const highlight = useRef<HTMLSpanElement>(null)
  useHoverGlide(track, highlight, '.item', GLIDE.row)
  if (!shown) return null
  return (
    <div className="track" ref={track}>
      <span className="glide" ref={highlight} />
      <div className="item">one</div>
      <div className="gap" />
      <div className="item">
        <b>two</b>
      </div>
    </div>
  )
}

function OpenList({ open }: { open: number }) {
  const track = useRef<HTMLDivElement>(null)
  const highlight = useRef<HTMLSpanElement>(null)
  useGlideTo(track, highlight, '.item--open', GLIDE.row)
  return (
    <div className="track" ref={track}>
      <span className="glide" ref={highlight} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={`item${i === open ? ' item--open' : ''}`} />
      ))}
    </div>
  )
}

const over = (target: Element) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent('pointerover', { bubbles: true, clientX: 5, clientY: 5 }),
    )
  })
const leave = (track: Element) =>
  act(() => {
    track.dispatchEvent(new MouseEvent('pointerleave'))
  })

let host: HTMLDivElement
let root: Root
const glideOf = () => host.querySelector<HTMLElement>('.glide')!
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrackDragStore.setState({ payload: null })
  vi.useRealTimers()
})

describe('useHoverGlide', () => {
  it('follows the pointer from item to item, a child counting as its item', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    expect(glideOf().style.opacity).toBe('1')
    expect(glideOf().style.transform).toBe('translate3d(0px, 0px, 0)')
    over(two.querySelector('b')!)
    expect(glideOf().style.transform).toBe('translate3d(0px, 40px, 0)')
  })

  it('waits 80ms in a gap before fading, and a new item cancels the fade', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    over(host.querySelector('.gap')!)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS - 1))
    expect(glideOf().style.opacity).toBe('1')
    over(two)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS))
    expect(glideOf().style.opacity).toBe('1')
    leave(host.querySelector('.track')!)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS))
    expect(glideOf().style.opacity).toBe('0')
  })

  it('hides while tracks are dragged', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    act(() => useTrackDragStore.setState({ payload: {} as DragPayload }))
    expect(glideOf().style.opacity).toBe('0')
    over(two)
    expect(glideOf().style.opacity).toBe('0')
  })

  it('attaches to a track that mounts after the first render', () => {
    act(() => root.render(<HoverList shown={false} />))
    act(() => root.render(<HoverList />))
    layOut(host)
    over(host.querySelectorAll('.item')[1])
    expect(glideOf().style.transform).toBe('translate3d(0px, 40px, 0)')
  })
})

describe('useGlideTo', () => {
  it('sits on the open item and slides when another opens', () => {
    act(() => root.render(<OpenList open={0} />))
    layOut(host)
    act(() => root.render(<OpenList open={2} />))
    expect(glideOf().style.transform).toBe('translate3d(0px, 80px, 0)')
    expect(glideOf().style.transition).toContain('transform 240ms')
  })

  it('fades out when nothing is open', () => {
    act(() => root.render(<OpenList open={1} />))
    layOut(host)
    act(() => root.render(<OpenList open={0} />))
    act(() => root.render(<OpenList open={-1} />))
    expect(glideOf().style.opacity).toBe('0')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/glide/useGlide.test.tsx`
Expected: FAIL. The test cannot resolve `./useGlide`.

- [ ] **Step 3: Write `src/lib/glide/useGlide.ts`**

```ts
// src/lib/glide/useGlide.ts
// The two ways a list drives its glide (Micro-interactions spec, Hooks):
// useHoverGlide follows the pointer, useGlideTo follows the item a selector
// picks (the open page, a menu's active item). Both take the track's ref and
// the highlight's ref, and attach after each render once both exist, so a
// track that mounts later (a list shown once it has rows) still gets one.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useTrackDragStore } from '../drag/trackDrag'
import { createGlide, type Glide, type GlideOptions } from './glide'

/** On no item (a gap between cards, or off the track), it waits this long before fading. */
export const GAP_GRACE_MS = 80

interface Attached {
  track: HTMLElement
  el: HTMLElement
  key: string
  glide: Glide
  detach: () => void
}

/**
 * Keeps one glide on the current track and highlight: made when both exist,
 * made again when either element or `key` changes, dropped on unmount.
 */
function useAttached(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  key: string,
  options: GlideOptions,
  attach: (track: HTMLElement, glide: Glide) => () => void,
): RefObject<Attached | null> {
  const attached = useRef<Attached | null>(null)

  useLayoutEffect(() => {
    const track = trackRef.current
    const el = highlightRef.current
    const now = attached.current
    if (now && now.track === track && now.el === el && now.key === key) return
    now?.detach()
    attached.current = null
    if (!track || !el) return
    const glide = createGlide(track, el, options)
    attached.current = { track, el, key, glide, detach: attach(track, glide) }
  })

  useLayoutEffect(
    () => () => {
      attached.current?.detach()
      attached.current = null
    },
    [],
  )

  return attached
}

/** The highlight follows the pointer over the items that match `itemSelector`. */
export function useHoverGlide(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  options: GlideOptions,
): void {
  useAttached(
    trackRef,
    highlightRef,
    `${itemSelector}\n${options.enterFrom}`,
    options,
    (track, glide) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let pointer: { x: number; y: number } | null = null
      let frame = 0

      const itemAt = (target: EventTarget | null): Element | null => {
        if (!(target instanceof Element)) return null
        const item = target.closest(itemSelector)
        return item && track.contains(item) ? item : null
      }
      // While tracks are dragged it stays hidden; drop targets light themselves.
      const go = (item: Element | null) => {
        clearTimeout(timer)
        if (useTrackDragStore.getState().payload !== null) glide.moveTo(null)
        else if (item) glide.moveTo(item)
        else if (glide.item)
          timer = setTimeout(() => glide.moveTo(null), GAP_GRACE_MS)
      }

      const onOver = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY }
        go(itemAt(e.target))
      }
      const onMove = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY }
      }
      const onLeave = () => {
        pointer = null
        go(null)
      }
      // A list scrolling, or rows coming and going, under a still pointer: the
      // item under it now. (Most tracks are not the scroller, and scroll does
      // not bubble: hence the capture on document.)
      const recheck = () => {
        if (pointer === null || frame !== 0) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (pointer)
            go(
              itemAt(document.elementFromPoint?.(pointer.x, pointer.y) ?? null),
            )
        })
      }
      // (jsdom has no ResizeObserver; the app always does.)
      const observer =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              glide.refresh()
              recheck()
            })
          : null
      observer?.observe(track)
      const unsubscribe = useTrackDragStore.subscribe((state) => {
        if (state.payload !== null) go(null)
      })

      track.addEventListener('pointerover', onOver)
      track.addEventListener('pointermove', onMove)
      track.addEventListener('pointerleave', onLeave)
      document.addEventListener('scroll', recheck, {
        capture: true,
        passive: true,
      })
      return () => {
        track.removeEventListener('pointerover', onOver)
        track.removeEventListener('pointermove', onMove)
        track.removeEventListener('pointerleave', onLeave)
        document.removeEventListener('scroll', recheck, { capture: true })
        unsubscribe()
        observer?.disconnect()
        clearTimeout(timer)
        cancelAnimationFrame(frame)
      }
    },
  )
}

/**
 * The highlight follows the item that matches `selector` (the open page, a
 * menu's active item). It looks after every render of its component, and
 * again whenever the track changes size; no match fades it out.
 */
export function useGlideTo(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  selector: string,
  options: GlideOptions,
): void {
  const attached = useAttached(
    trackRef,
    highlightRef,
    `${selector}\n${options.enterFrom}`,
    options,
    (track, glide) => {
      // (jsdom has no ResizeObserver; the app always does.)
      if (typeof ResizeObserver !== 'function') return () => {}
      const observer = new ResizeObserver(() => glide.refresh())
      observer.observe(track)
      return () => observer.disconnect()
    },
  )

  useLayoutEffect(() => {
    const now = attached.current
    if (now) now.glide.moveTo(now.track.querySelector(selector))
  })
}
```

**Options must be stable:** they are read when the glide is attached, so callers pass module constants such as `GLIDE.row` or a `menuGlide(...)` made at module level, never an object literal made during render.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/glide`
Expected: PASS, 18 tests.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/lib/glide && npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/glide/useGlide.ts src/lib/glide/useGlide.test.tsx
git commit -m "feat(glide): useHoverGlide follows the pointer, useGlideTo the open item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: `HoverGlide`

**Files:**
- Create: `src/components/HoverGlide.tsx`
- Test: `src/components/HoverGlide.test.tsx`

- [ ] **Step 1: Write the failing test** `src/components/HoverGlide.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HoverGlide } from './HoverGlide'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('HoverGlide', () => {
  it('is its list, with the highlight before the items', () => {
    act(() =>
      root.render(
        <HoverGlide
          className="rows"
          item=".row"
          kind="row"
          id="list"
          hidden={false}
        >
          <div className="row">one</div>
        </HoverGlide>,
      ),
    )
    const list = host.querySelector('#list')!
    expect(list.className).toBe('glide-track rows')
    expect(list.firstElementChild?.className).toBe('glide')
    expect(list.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(list.querySelectorAll('.glide')).toHaveLength(1)
  })

  it('adds the open highlight, on top of the hover one, when asked', () => {
    act(() =>
      root.render(
        <HoverGlide item=".row" kind="row" open=".row--open">
          <div className="row row--open">one</div>
        </HoverGlide>,
      ),
    )
    const glides = host.querySelectorAll('.glide')
    expect(glides).toHaveLength(2)
    expect(glides[1].className).toBe('glide glide--open')
    expect((glides[1] as HTMLElement).style.opacity).toBe('1')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/HoverGlide.test.tsx`
Expected: FAIL. The test cannot resolve `./HoverGlide`.

- [ ] **Step 3: Write `src/components/HoverGlide.tsx`**

```tsx
// src/components/HoverGlide.tsx
// A list whose hover highlight slides from item to item (Micro-interactions
// spec, The glide): a <div> holding the highlight before its children. With
// `open`, a second highlight sits on the open item (the sidebar's open page).
// Lists that already have their own element use the hooks instead.
import { useRef, type HTMLAttributes } from 'react'
import { GLIDE } from '../lib/glide/glide'
import { useGlideTo, useHoverGlide } from '../lib/glide/useGlide'

interface HoverGlideProps extends HTMLAttributes<HTMLDivElement> {
  /** The items the highlight goes to, e.g. '.search-row'. */
  item: string
  kind: keyof typeof GLIDE
  /** The open item, e.g. '.folder-row.selected'. */
  open?: string
}

export function HoverGlide({
  item,
  kind,
  open,
  className,
  children,
  ...rest
}: HoverGlideProps) {
  const track = useRef<HTMLDivElement>(null)
  const hover = useRef<HTMLSpanElement>(null)
  const opened = useRef<HTMLSpanElement>(null)
  useHoverGlide(track, hover, item, GLIDE[kind])
  useGlideTo(track, opened, open ?? ':not(*)', GLIDE[kind])
  return (
    <div
      ref={track}
      className={className ? `glide-track ${className}` : 'glide-track'}
      {...rest}
    >
      <span ref={hover} className="glide" aria-hidden="true" />
      {open && (
        <span ref={opened} className="glide glide--open" aria-hidden="true" />
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run, lint and commit**

Run: `npx vitest run src/components/HoverGlide.test.tsx && npx eslint src/components/HoverGlide.tsx`
Expected: PASS, 2 tests; no lint output.

```bash
git add src/components/HoverGlide.tsx src/components/HoverGlide.test.tsx
git commit -m "feat(glide): HoverGlide, a list with its sliding highlight

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The TrackTable

**Files:**
- Modify: `src/components/TrackTable.tsx` (python)
- Modify: `src/components/TrackTable.css` (python)

- [ ] **Step 1: Find the anchors**

Run: `grep -n "^import\|const parentRef = useRef\|position: 'relative',\|className=\"row-action\"" src/components/TrackTable.tsx`

Note the last `import` line, and check that each anchor below occurs exactly once. Also check whether the element with `ref={parentRef}` can be missing on the first render: look for an early `return` before it. If it can, the scroll effect in Step 2 must depend on what makes it appear, not on `[]`.

- [ ] **Step 2: Wire the hook, the highlight, the scroll class and the ▶'s tab stop**

```bash
python3 - <<'EOF'
p = 'src/components/TrackTable.tsx'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)

# imports: after the last import line (LAST_IMPORT is the exact text found in Step 1)
LAST_IMPORT = "<paste the last import line here>"
once(LAST_IMPORT, LAST_IMPORT + "\nimport { GLIDE } from '../lib/glide/glide'\nimport { useHoverGlide } from '../lib/glide/useGlide'")

once("    const parentRef = useRef<HTMLDivElement>(null)\n", """    const parentRef = useRef<HTMLDivElement>(null)
    // The rows' sliding hover highlight (Micro-interactions spec, Rows).
    const rowsRef = useRef<HTMLDivElement>(null)
    const rowGlideRef = useRef<HTMLSpanElement>(null)
    useHoverGlide(rowsRef, rowGlideRef, '.data-row', GLIDE.row)

    // Scrolled sideways, the sticky # and artwork cells must cover the cells
    // passing under them again (TrackTable.css, .track-table--scrolled-x).
    useEffect(() => {
      const area = parentRef.current
      if (!area) return
      const mark = () => area.classList.toggle('track-table--scrolled-x', area.scrollLeft > 0)
      mark()
      area.addEventListener('scroll', mark, { passive: true })
      return () => area.removeEventListener('scroll', mark)
    }, [])
""")

once("""            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
""", """            <div
              ref={rowsRef}
              className="glide-track track-table-rows"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              <span ref={rowGlideRef} className="glide" aria-hidden="true" />
""")

# The ▶ is shown on hover only; the table's own keys (↑ ↓, Enter) play a row.
once('                        className="row-action"\n', '                        className="row-action"\n                        tabIndex={-1}\n')
open(p, 'w').write(s)
EOF
```

Check that `useEffect` is already imported from `react` (`grep -n "useEffect," src/components/TrackTable.tsx`); add it to that import if not.

- [ ] **Step 3: The rows' CSS**

```bash
python3 - <<'EOF'
p = 'src/components/TrackTable.css'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)

once("""/* --- Rows: 46px; hover, selected and playing tint the row (--row-bg, always
   opaque, so the sticky cells below can wear it too) --- */

.data-row {
  --row-bg: var(--bg-primary);""", """/* --- Rows: 46px. The hover is the sliding highlight under the rows (the
   glide); selected and playing tint the row itself (--row-bg, which the
   sticky cells below wear too). A plain row is transparent. --- */

.track-table-rows {
  --glide-bg: var(--bg-tertiary);
}

.data-row {
  --row-bg: transparent;""")

once(""".data-row:hover {
  --row-bg: var(--bg-tertiary);
}

""", "")

once("""/* # and the artwork stay put when the table scrolls sideways. */""", """/* Scrolled sideways, the sticky cells cover what passes under them: opaque
   again, and under the pointer they fade to the hover colour themselves,
   since the glide is under them. */
.track-table--scrolled-x .data-row:not(.data-row--selected):not(.data-row--playing) .cell-index,
.track-table--scrolled-x .data-row:not(.data-row--selected):not(.data-row--playing) .cell-art {
  background-color: var(--bg-primary);
  transition: background-color 240ms var(--ease-soft);
}

.track-table--scrolled-x .data-row:not(.data-row--selected):not(.data-row--playing):hover .cell-index,
.track-table--scrolled-x .data-row:not(.data-row--selected):not(.data-row--playing):hover .cell-art {
  background-color: var(--bg-tertiary);
}

/* # and the artwork stay put when the table scrolls sideways. */""")

# Number <-> play: one over the other, cross-faded, instead of display none/flex.
once(""".row-action {
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;""", """.row-action {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: auto;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease);
  padding: 0;""")

once(""".data-row:hover .row-number,
.data-row:hover .equalizer {
  display: none;
}

.data-row:hover .row-action {
  display: flex;
}""", """.cell-index .row-number,
.cell-index .equalizer {
  transition: opacity var(--motion-fast) var(--ease);
}

.data-row:hover .row-number,
.data-row:hover .equalizer {
  opacity: 0;
}

.data-row:hover .row-action {
  opacity: 1;
}""")
open(p, 'w').write(s)
EOF
```

`.cell-index` is `position: sticky`, so it is the containing block that centres the absolute `.row-action`.

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/TrackTable.tsx && npx vitest run`
Expected: no type or lint errors; all tests pass.

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css
git commit -m "feat(track-table): the hover slides between rows; # and ▶ cross-fade

Plain rows turn transparent so the glide shows under them. Scrolled sideways,
the sticky cells cover what passes under them again and take the hover colour
themselves. The ▶ leaves the Tab order: the table's keys play a row.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Home rows

**Files:**
- Modify: `src/components/home/HomeTrackRows.tsx` (Edit)
- Modify: `src/components/home/HomeCards.tsx` (python)
- Modify: `src/components/views/HomeView.css` (Edit)

- [ ] **Step 1: The track and its highlight**

In `HomeTrackRows.tsx`:
- change `import { useMemo } from 'react'` to `import { useMemo, useRef } from 'react'`;
- add the imports `import { GLIDE } from '../../lib/glide/glide'` and `import { useHoverGlide } from '../../lib/glide/useGlide'`;
- after the `draggedIds` `useMemo`, add:

```tsx
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const rowsRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(rowsRef, glideRef, '.home-row', GLIDE.row)
```

Then replace `<div className="home-rows">` with:

```tsx
    <div className="glide-track home-rows" ref={rowsRef}>
      <span ref={glideRef} className="glide" aria-hidden="true" />
```

- [ ] **Step 2: CSS** (`HomeView.css`)
- Delete the rule `.home-row:hover { background: var(--bg-tertiary); }`.
- Add above `.home-row--dragging`:

```css
.home-rows {
  --glide-bg: var(--bg-tertiary);
}
```

- Add `transition: opacity var(--motion-fast) var(--ease);` to `.home-row__action`.
- Add after the `.home-row__action:focus-visible` rule:

```css
.home-row__number,
.home-row__no .equalizer {
  transition: opacity var(--motion-fast) var(--ease);
}
```

- [ ] **Step 3: The Home cards' lists** (`HomeCards.tsx`, python; it is not Prettier-clean)

Each `<div className="home-list">` holds `.home-news`, `.home-gig` or `.home-set` rows; there are five, found with `grep -n 'className="home-list"' src/components/home/HomeCards.tsx`.
- Each opening becomes `<HoverGlide className="home-list" item=".home-news, .home-gig, .home-set" kind="row">`.
- Its matching closing `</div>` becomes `</HoverGlide>`. Print each block first (`sed -n`), and replace the whole block text, which is unique, with one `assert s.count(old) == 1` each.
- Add `import { HoverGlide } from '../HoverGlide'`.

The highlight is the list's first child, so the `:last-child` border rule on the rows still matches the last row.

In `HomeView.css`:
- Delete the rule `.home-news:hover, .home-gig:hover, .home-set:hover { background: var(--bg-tertiary); }`.
- Add:

```css
.home-list {
  --glide-bg: var(--bg-tertiary);
}
```

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/home && npx vitest run src/components/home`
Expected: clean; tests pass.

```bash
git add src/components/home/HomeTrackRows.tsx src/components/home/HomeCards.tsx src/components/views/HomeView.css
git commit -m "feat(home): the hover slides between a card's rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Search rows

**Files:**
- Modify: `src/components/views/SearchView.tsx`, `SearchView.css` (python)
- Modify: `src/components/search/SearchSections.tsx`, `SearchSections.css` (Edit)

- [ ] **Step 1: The track list in `SearchView.tsx`**

Find the component's other `useRef` calls (`grep -n "useRef" src/components/views/SearchView.tsx`), and add the hook beside them, before any early `return`:

```tsx
  // The tracks' hover slides from row to row (Micro-interactions spec, Rows).
  const trackListRef = useRef<HTMLDivElement>(null)
  const trackGlideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(trackListRef, trackGlideRef, '.search-view__track-row', GLIDE.row)
```

Also add the two imports (`GLIDE` from `../../lib/glide/glide`, `useHoverGlide` from `../../lib/glide/useGlide`). Then:

```bash
python3 - <<'EOF'
p = 'src/components/views/SearchView.tsx'
s = open(p).read()
old = '              <div className="search-view__track-list">\n'
assert s.count(old) == 1
s = s.replace(old, '''              <div className="glide-track search-view__track-list" ref={trackListRef}>
                <span ref={trackGlideRef} className="glide" aria-hidden="true" />
''')
open(p, 'w').write(s)
EOF
```

- [ ] **Step 2: `SearchView.css`**

The list scrolls itself, which the core handles. Number and ▶ cross-fade:

```bash
python3 - <<'EOF'
p = 'src/components/views/SearchView.css'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)
once("""  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: var(--space-6);
}""", """  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: var(--space-6);
  --glide-bg: var(--bg-tertiary);
}""")
once(""".search-view__track-row:hover {
  background: var(--bg-tertiary);
}

""", "")
once("""/* Hover: hide number, show play icon */
.search-view__track-number { display: flex; align-items: center; }
.search-view__track-play   { display: none; color: var(--text-primary); align-items: center; }

.search-view__track-row:hover .search-view__track-number { display: none; }
.search-view__track-row:hover .search-view__track-play   { display: flex; }""", """/* Hover: the number and the play icon cross-fade, one over the other */
.search-view__track-number,
.search-view__track-play {
  display: flex;
  align-items: center;
  transition: opacity var(--motion-fast) var(--ease);
}

.search-view__track-play {
  position: absolute;
  inset: 0;
  justify-content: center;
  color: var(--text-primary);
  opacity: 0;
}

.search-view__track-row:hover .search-view__track-number { opacity: 0; }
.search-view__track-row:hover .search-view__track-play   { opacity: 1; }""")
once("""/* # column */
.search-view__track-index {
""", """/* # column */
.search-view__track-index {
  position: relative;
""")
open(p, 'w').write(s)
EOF
```

- [ ] **Step 3: `SearchSections.tsx`**

Each `<div className="search-rows">` (`grep -n 'className="search-rows"' src/components/search/SearchSections.tsx`) becomes a `HoverGlide`, and its matching closing `</div>` becomes `</HoverGlide>`:

```tsx
          <HoverGlide className="search-rows" item=".search-row" kind="row">
            …the rows, unchanged…
          </HoverGlide>
```

Import it: `import { HoverGlide } from '../HoverGlide'`.

- [ ] **Step 4: `SearchSections.css`**
- Delete `.search-row:hover { background: var(--bg-tertiary); }`.
- In the `.search-rows` rule (`grep -n "\.search-rows" src/components/search/SearchSections.css`) add `--glide-bg: var(--bg-tertiary);`. If there is no such rule, add one.

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/views/SearchView.tsx src/components/search && npx vitest run src/components/search src/lib/search`
Expected: clean; tests pass.

```bash
git add src/components/views/SearchView.tsx src/components/views/SearchView.css src/components/search/SearchSections.tsx src/components/search/SearchSections.css
git commit -m "feat(search): the hover slides between rows; # and ▶ cross-fade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Sets rows

**Files:**
- Modify: `src/components/sets/SetPage.tsx`, `SetPage.css`, `SetsSaved.tsx` (python)
- Modify: `src/components/sets/SetsTabs.css` (Edit)

- [ ] **Step 1: A set's rows** (`SetPage.tsx`, which already has `rowsRef` on `.set-page__rows`)

```bash
python3 - <<'EOF'
p = 'src/components/sets/SetPage.tsx'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)
once("  const rowsRef = useRef<HTMLDivElement>(null)\n", """  const rowsRef = useRef<HTMLDivElement>(null)
  // The hover slides from row to row; the header row and skeletons are not rows.
  const rowGlideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(rowsRef, rowGlideRef, '.set-row:not(.set-row--head):not(.set-row--skeleton)', GLIDE.row)
""")
once('            <div className="set-page__rows" ref={rowsRef}>\n', '''            <div className="glide-track set-page__rows" ref={rowsRef}>
              <span ref={rowGlideRef} className="glide" aria-hidden="true" />
''')
open(p, 'w').write(s)
EOF
```

Add the imports (`GLIDE`, `useHoverGlide`) with a python insert after the file's last `import` line. `rowsRef` is also used to find a row by `[data-cue]`; the span has no `data-cue`, so that keeps working.

- [ ] **Step 2: `SetPage.css`**

```bash
python3 - <<'EOF'
p = 'src/components/sets/SetPage.css'
s = open(p).read()
old = """.set-row:not(.set-row--head):not(.set-row--skeleton):hover {
  background: var(--bg-tertiary);
}
"""
assert s.count(old) == 1
s = s.replace(old, """/* The hover is the glide under the rows (Micro-interactions spec). The
   playing row's tint is translucent, so the glide shows through it on hover. */
.set-page__rows {
  --glide-bg: var(--bg-tertiary);
}
""")
open(p, 'w').write(s)
EOF
```

**Stale comment:** the comment above `.set-row.set-row--now:not(.set-row--head):hover` refers to the rows' hover rule this step deletes. Rewrite it with the same replace: "Hovered, the playing row keeps a stronger tint, over the glide."

**Number and ▶:** today the number is hidden with `visibility: hidden` (`grep -n "visibility" src/components/sets/SetPage.css`). Make it a 120ms cross-fade, like the other lists:
- that rule sets `opacity: 0` instead of `visibility: hidden`;
- `.set-row__play` and `.set-row__no > :not(.set-row__play)` get `transition: opacity var(--motion-fast) var(--ease);`.

All through python replaces, each with `assert s.count(old) == 1`.

- [ ] **Step 3: Saved tracks** (`SetsSaved.tsx`)

Wrap the `saved.map(...)` rows in `<HoverGlide className="saved-rows" item=".saved-row" kind="row">…</HoverGlide>` with a python replace:
- replace the line `      {saved.map((t) => (` with `      <HoverGlide className="saved-rows" item=".saved-row" kind="row">\n      {saved.map((t) => (`;
- add `</HoverGlide>` after the map's closing `))}` line. Print the lines around it first (`grep -n "saved.map" -A40 src/components/sets/SetsSaved.tsx`) so that the replace targets that exact, unique text.

Add `import { HoverGlide } from '../HoverGlide'`.

- [ ] **Step 4: `SetsTabs.css`**

Replace `.saved-row:hover { background: var(--bg-tertiary); }` with:

```css
.saved-rows {
  --glide-bg: var(--bg-tertiary);
}
```

- [ ] **Step 5: The Sets search results** (`SetsView.tsx`, python)
- The `.sets-found` buttons are rendered by `found.map(...)` (`grep -n "found.map" -B12 src/components/views/SetsView.tsx`).
- Find their parent element. Wrap only the `found.map(...)` in `<HoverGlide className="sets-found-list" item=".sets-found" kind="row">…</HoverGlide>`, so the elements before it stay where they are.
- Use a python replace of the exact `{found.map((hit) => {` line, plus its closing `})}` line found from the printed context.
- Import `HoverGlide` from `../HoverGlide`.

In `SetsView.css`:
- delete `.sets-found:hover { background: var(--bg-secondary); }`;
- add `.sets-found-list { --glide-bg: var(--bg-secondary); }`. If the parent lays the results out with `gap`, give `.sets-found-list` the same `display`/`flex-direction`/`gap`, so the list looks as it did.

- [ ] **Step 6: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/sets src/components/views/SetsView.tsx && npx vitest run src/components/sets src/lib/sets`
Expected: clean; tests pass.

```bash
git add src/components/sets/SetPage.tsx src/components/sets/SetPage.css src/components/sets/SetsSaved.tsx src/components/sets/SetsTabs.css src/components/views/SetsView.tsx src/components/views/SetsView.css
git commit -m "feat(sets): the hover slides between rows: a set's, the saved tracks, the search results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Streaming and DJ lists

**Files (Edit; clean):**
- Modify: `src/components/views/StreamingListView.tsx`, `src/components/dj/DjTracksTab.tsx`, `src/components/dj/DjPlaysTab.tsx`
- Modify: `src/components/views/SpotifyView.css`
- Modify: `src/components/views/YouTubeMusicView.tsx`, `YouTubeMusicView.css`

- [ ] **Step 1: The three `.spotify-table`s**

In each of the three components:
- add the imports (`useRef` from react if missing, `GLIDE`, `useHoverGlide`);
- add, with the component's other hooks and before any early `return`:

```tsx
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const tableRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(tableRef, glideRef, '.spotify-row--data', GLIDE.row)
```

- on the `<div className="spotify-table …"` element: prefix the class with `glide-track `, add `ref={tableRef}`, and make `<span ref={glideRef} className="glide" aria-hidden="true" />` its first child.

In `DjTracksTab.tsx` the table renders only in the non-empty branch. The hook attaches once it appears. In `DjPlaysTab.tsx`, check whether `.spotify-table` is rendered by a child component rather than the tab itself; the hook goes in whichever component renders it. `DjPlaysTab.tsx` has no react import today: add `import { useRef } from 'react'`.

**The DJ Overview's track cards** (`src/components/dj/DjOverviewCards.tsx`, python; not Prettier-clean):
- `TracksBody`, used by the Tracks and Missing cards, renders `.spotify-table.dj-card__table` with `.spotify-row--data` rows, so it needs the same glide.
- Put the three hook lines at the very top of `TracksBody`, before its early returns (`grep -n "function TracksBody" -A20 src/components/dj/DjOverviewCards.tsx`).
- Give its `.spotify-table` div `glide-track`, the ref and the span.

- [ ] **Step 2: `SpotifyView.css`**
- Delete `.spotify-row--data:hover { background: var(--bg-tertiary); }`.
- Add `--glide-bg: var(--bg-tertiary);` to `.spotify-table`.

- [ ] **Step 3: YouTube Music's sets** (`YouTubeMusicView.tsx`)

Replace `<div id={rowsId} hidden={!open}>` and its closing `</div>` with:

```tsx
      <HoverGlide id={rowsId} hidden={!open} className="ytm-sets__rows" item=".ytm-sets__row" kind="row">
        …
      </HoverGlide>
```

In `YouTubeMusicView.css`, replace `.ytm-sets__row:hover { background: var(--bg-tertiary); }` with `.ytm-sets__rows { --glide-bg: var(--bg-tertiary); }`.

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/views/StreamingListView.tsx src/components/dj src/components/views/YouTubeMusicView.tsx && npx vitest run src/components/dj src/lib/dj`

(`YouTubeMusicView.tsx` needs `import { HoverGlide } from '../HoverGlide'`.)
Expected: clean; tests pass.

```bash
git add src/components/views/StreamingListView.tsx src/components/dj/DjTracksTab.tsx src/components/dj/DjPlaysTab.tsx src/components/dj/DjOverviewCards.tsx src/components/views/SpotifyView.css src/components/views/YouTubeMusicView.tsx src/components/views/YouTubeMusicView.css
git commit -m "feat(streaming): the hover slides between Spotify, YouTube Music and DJ rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: DJ Export's playlist list

**Files:**
- Modify: `src/components/DjExportModal.tsx` (python; not Prettier-clean)
- Modify: `src/components/DjExportModal.css` (Edit)

The Recommendations panel and the AI playlist dialog are out of scope: AI is off (`AI_ENABLED = false`), so they cannot be reached.

- [ ] **Step 1: The hook and the track**

In `DjExportModal`, find the component that renders `<div className="dj-export__tree">` (`grep -n "dj-export__tree\|^export function\|^function" src/components/DjExportModal.tsx`). With that component's other hooks, before any early `return`, add:

```tsx
  // The list's hover slides from row to row (Micro-interactions spec, Rows).
  const listRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(listRef, glideRef, '.dj-export__row', GLIDE.row)
```

```bash
python3 - <<'PY'
p = 'src/components/DjExportModal.tsx'
s = open(p).read()
old = '<div className="dj-export__tree">'
assert s.count(old) == 1
s = s.replace(old, '<div className="glide-track dj-export__tree" ref={listRef}>\n            <span ref={glideRef} className="glide" aria-hidden="true" />')
open(p, 'w').write(s)
PY
```

Add the imports (`useRef` if missing, `GLIDE`, `useHoverGlide`) with a python insert after the last import.

- [ ] **Step 2: CSS** (`DjExportModal.css`)
- Delete `.dj-export__row:hover { background: var(--bg-tertiary); }`.
- Add `--glide-bg: var(--bg-tertiary);` to `.dj-export__tree`. The tree scrolls and has a 1px border; the core handles both.

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/DjExportModal.tsx && npx vitest run src/components/DjExportModal.test.tsx`
Expected: clean; the DJ Export tests pass.

```bash
git add src/components/DjExportModal.tsx src/components/DjExportModal.css
git commit -m "feat(dj-export): the hover slides between the playlists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: The sidebar nav

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`, `Sidebar.css` (python)

- [ ] **Step 1: Hooks and highlights**

Find where `Sidebar` declares its refs (`grep -n "useRef" src/components/layout/Sidebar.tsx`). Check that no early `return` comes before that point (the rail is a separate component). Add:

```tsx
  // The nav's sliding highlights (Micro-interactions spec, Sidebar): the
  // hover, and the open page painted over it.
  const navRef = useRef<HTMLDivElement>(null)
  const navHoverRef = useRef<HTMLSpanElement>(null)
  const navOpenRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(navRef, navHoverRef, '.sidebar-nav-item', GLIDE.row)
  useGlideTo(navRef, navOpenRef, '.sidebar-nav-item--active', GLIDE.row)
```

```bash
python3 - <<'EOF'
p = 'src/components/layout/Sidebar.tsx'
s = open(p).read()
old = '      <div className="sidebar-nav">\n'
assert s.count(old) == 1
s = s.replace(old, '''      <div className="glide-track sidebar-nav" ref={navRef}>
        <span ref={navHoverRef} className="glide" aria-hidden="true" />
        <span ref={navOpenRef} className="glide glide--open" aria-hidden="true" />
''')
open(p, 'w').write(s)
EOF
```

Add the imports (`GLIDE` from `../../lib/glide/glide`; `useGlideTo`, `useHoverGlide` from `../../lib/glide/useGlide`) with a python insert.

- [ ] **Step 2: CSS**

```bash
python3 - <<'EOF'
p = 'src/components/layout/Sidebar.css'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)
once(""".sidebar-nav-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sidebar-nav-item--active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}""", """/* The hover and the open page are the nav's glides (Micro-interactions
   spec, Sidebar): a faint grey, and the accent over it. */
.sidebar-nav {
  --glide-bg: var(--glide-weak);
}

.sidebar-nav-item:hover,
.sidebar-nav-item--active {
  color: var(--text-primary);
}

/* Under the pointer the icon and label lean 3px right; the count stays. */
.sidebar-nav-item > svg,
.sidebar-nav-item > span:not(.sidebar-nav-item__count) {
  transition: transform 240ms var(--ease-soft);
}

.sidebar-nav-item:hover > svg,
.sidebar-nav-item:hover > span:not(.sidebar-nav-item__count) {
  transform: translateX(3px);
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-nav-item:hover > svg,
  .sidebar-nav-item:hover > span:not(.sidebar-nav-item__count) {
    transform: none;
  }
}""")
open(p, 'w').write(s)
EOF
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/layout/Sidebar.tsx`
Expected: clean.

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): the nav's hover and open page slide; items lean 3px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The sidebar's lists (Folders, Playlists, Spotify, YouTube Music)

**Files:**
- Modify: `src/components/FolderTree.tsx` (python), `src/components/youtube-music/YouTubeMusicLists.tsx` (python)
- Modify: `src/components/spotify/SpotifyLists.tsx`, `src/components/FolderTree.css` (Edit)

- [ ] **Step 1: `FolderTree.tsx`**
- Add the hooks at the top of `FolderTree`'s body, with its other hooks:

```tsx
  // The list's sliding highlights (Micro-interactions spec, Sidebar): the
  // hover, and the open folder or playlist painted over it.
  const bodyRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const openRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(bodyRef, hoverRef, '.folder-row', GLIDE.row)
  useGlideTo(bodyRef, openRef, '.folder-row.selected', GLIDE.row)
```

- One instance renders one section, so both section bodies take the same refs:
  - `renderFoldersContent`'s `<div className="folder-tree-section-body">`;
  - `renderPlaylistsContent`'s `<div\n        className="folder-tree-section-body"` (it also has an `onContextMenu`).
- Each gets `glide-track ` in front of its class, `ref={bodyRef}`, and the two spans as its first children:

```tsx
<span ref={hoverRef} className="glide" aria-hidden="true" />
<span ref={openRef} className="glide glide--open" aria-hidden="true" />
```

- Print both openings first (`grep -n "folder-tree-section-body" -A8 src/components/FolderTree.tsx`). Then write a python replace for each, one `assert s.count(old) == 1` per replace.

- [ ] **Step 2: `SpotifyLists.tsx`** (Edit)

Replace its `<div className="folder-tree-section-body">` and its closing `</div>` with:

```tsx
    <HoverGlide className="folder-tree-section-body" item=".folder-row" kind="row" open=".folder-row.selected">
      …
    </HoverGlide>
```

- [ ] **Step 3: `YouTubeMusicLists.tsx`** (python)

Do the same as `FolderTree`: refs and hooks in the component, and `glide-track`, the ref and the two spans on its `<div className="folder-tree-section-body">`.

**Its context menu moves out of the list.** `{menu && (<div ref={menuRef} className="sidebar-ctx-menu ytm-list-menu" …>…</div>)}` is rendered inside that div today, and an isolated track would cap the menu's z-index under the main area.
- Render it through `createPortal(…, document.body)` (import from `react-dom`); it is `position: fixed` at the pointer, so nothing else changes.
- Its outside-click handling uses `menuRef`, which still points at it.
- Print the block first (`grep -n "menu && (" -A20 src/components/youtube-music/YouTubeMusicLists.tsx`), and replace its opening `{menu && (` with `{menu &&\n        createPortal(` and its closing `)}` with `,\n          document.body,\n        )}`. Both are exact, unique text.

- [ ] **Step 4: `FolderTree.css`** (Edit; clean)
- `.folder-tree-section-body`: add `--glide-bg: var(--glide-weak);`.
- Delete `.folder-row:hover { background: var(--bg-tertiary); }`.
- `.folder-row.selected { background: var(--accent); color: #ffffff; }` → `.folder-row.selected { color: var(--text-primary); }`.
- Delete `.folder-row.selected:hover`, `.folder-row.selected .folder-count` and `.folder-row.selected .folder-arrow`. The count and arrow keep their own colours.
- Add:

```css
/* The open row's icon takes the accent (Micro-interactions spec, Sidebar). */
.folder-row.selected .folder-icon,
.folder-row.selected .spotify-list-row__icon {
  color: var(--accent-hover);
}

/* Under the pointer the icon and name lean 3px right; arrow and count stay. */
.folder-row .folder-icon,
.folder-row .spotify-list-row__icon,
.folder-row .folder-name {
  transition: transform 240ms var(--ease-soft);
}

.folder-row:hover .folder-icon,
.folder-row:hover .spotify-list-row__icon,
.folder-row:hover .folder-name {
  transform: translateX(3px);
}

@media (prefers-reduced-motion: reduce) {
  .folder-row:hover .folder-icon,
  .folder-row:hover .spotify-list-row__icon,
  .folder-row:hover .folder-name {
    transform: none;
  }
}
```

Check for other rules that paint a selected or hovered `.folder-row`: `grep -rn "folder-row.selected\|folder-row:hover\|spotify-list-row.*selected" src --include=*.css`. Any background they set goes the same way.

**In `Sidebar.css` (python):** delete the rule `.folder-row.selected .spotify-list-row__icon, .folder-row.selected .spotify-list-row__new { color: inherit; }`.
- It made them white on the old solid accent.
- Sidebar.css loads after FolderTree.css, so it would keep the Spotify and YouTube Music rows' icon from turning accent, and their "new" count would lose its accent too.

**Imports:**
- `FolderTree.tsx` imports only `useState, useEffect` from react today: add `useRef`, `GLIDE`, `useGlideTo` and `useHoverGlide`.
- `SpotifyLists.tsx` imports `HoverGlide` from `../HoverGlide`.

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/FolderTree.tsx src/components/spotify src/components/youtube-music`
Expected: clean.

```bash
git add src/components/FolderTree.tsx src/components/FolderTree.css src/components/spotify/SpotifyLists.tsx src/components/youtube-music/YouTubeMusicLists.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): folders, playlists and streaming lists slide; open turns translucent

The open folder or playlist moves from a solid accent with white text to the
nav's translucent accent, so open looks the same across the sidebar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: The rail

**Files:**
- Modify: `src/components/layout/SidebarRail.tsx`, `src/components/layout/Sidebar.css` (python)

- [ ] **Step 1: `aria-current` and the glides**
- `sectionButton`: add `aria-current={activeSection === section ? 'page' : undefined}`. Its `--active` class is also set by an open flyout; `aria-current` is not.
- The nav items' `<button`: add `aria-current={activeSection === item.section ? 'page' : undefined}`.
- Hooks (with the rail's other hooks):

```tsx
  // The rail's sliding highlights (Micro-interactions spec, Sidebar): the
  // hover, and the open section painted over it.
  const railNavRef = useRef<HTMLDivElement>(null)
  const railHoverRef = useRef<HTMLSpanElement>(null)
  const railOpenRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(railNavRef, railHoverRef, '.sidebar-rail__item', GLIDE.row)
  useGlideTo(railNavRef, railOpenRef, '[aria-current="page"]', GLIDE.row)
```

- `<div className="sidebar-rail__nav">` → `<div className="glide-track sidebar-rail__nav" ref={railNavRef}>` plus the two spans.

- [ ] **Step 2: CSS** (`Sidebar.css`, python)

Replace:

```css
.sidebar-rail__item:hover,
.sidebar-rail__item--active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

with:

```css
.sidebar-rail__nav {
  --glide-bg: var(--glide-weak);
}

.sidebar-rail__item:hover,
.sidebar-rail__item--active {
  color: var(--text-primary);
}
```

The rail's own tooltip is untouched here; plan (c) replaces it.

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/layout/SidebarRail.tsx`
Expected: clean.

```bash
git add src/components/layout/SidebarRail.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): the rail's hover and open section slide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: The shared menu

**Files:**
- Modify: `src/components/menu/Menu.tsx` (python)
- Modify: `src/components/menu/Menu.css` (Edit; clean)

- [ ] **Step 1: The glide in `MenuPanel`**

```bash
python3 - <<'EOF'
p = 'src/components/menu/Menu.tsx'
s = open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)
once("  const itemRefs = useRef<(HTMLDivElement | null)[]>([])\n", """  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  // The active item's highlight slides (Micro-interactions spec, Menus):
  // pointer and arrow keys move it alike, since both set `active`.
  const itemsRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useGlideTo(itemsRef, glideRef, '.menu__item--active', MENU_GLIDE)
""")
once("        <div className={search ? 'menu__list' : undefined}>\n", """        <div
          ref={itemsRef}
          className={search ? 'glide-track menu__items menu__list' : 'glide-track menu__items'}
        >
          <span ref={glideRef} className="glide" aria-hidden="true" />
""")
open(p, 'w').write(s)
EOF
```

At module level, after the imports, add:

```tsx
/** The highlight: the accent, red on a destructive item. */
const MENU_GLIDE = menuGlide('menu__item--danger')
```

Add the imports `import { menuGlide } from '../../lib/glide/glide'` and `import { useGlideTo } from '../../lib/glide/useGlide'`.

- [ ] **Step 2: `Menu.css`**
- Replace the rule `.menu__item--active { background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 9%); }` with:

```css
/* The active item's background is the glide under the items. */
.menu__items {
  --glide-bg: rgba(var(--accent-rgb), 0.22);
}

.menu__item--active .menu__icon {
  color: var(--accent-hover);
}
```

- Keep `.menu__item--danger .menu__icon { color: inherit; }`, but move it **after** the new `.menu__item--active .menu__icon` rule. Both have the same specificity, so the later one wins, and a danger item's icon stays red.
- After `.menu__check, .menu__chevron { … }` add:

```css
/* A submenu's chevron leans 2px towards it while its item is active. */
.menu__chevron {
  transition: transform 240ms var(--ease-soft);
}

.menu__item--active .menu__chevron {
  transform: translateX(2px);
}

@media (prefers-reduced-motion: reduce) {
  .menu__item--active .menu__chevron {
    transform: none;
  }
}
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/menu && npx vitest run src/components/menu src/lib`
Expected: clean; tests pass.

```bash
git add src/components/menu/Menu.tsx src/components/menu/Menu.css
git commit -m "feat(menu): the active item's accent slides; red on Delete; chevron leans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: The sidebar's own context menus

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/youtube-music/YouTubeMusicLists.tsx`, `src/components/layout/Sidebar.css` (python)

- [ ] **Step 1: Sidebar's colour menu**
- In `Sidebar.tsx`, `colourMenuEl` is `<div ref={ctxRef} className="sidebar-ctx-menu" …>`. Change the class to `"glide-track sidebar-ctx-menu"`, and make `<span ref={ctxGlideRef} className="glide" aria-hidden="true" />` its first child.
- Add `const ctxGlideRef = useRef<HTMLSpanElement>(null)` and `useHoverGlide(ctxRef, ctxGlideRef, '.sidebar-ctx-menu__item', CTX_GLIDE)` beside the nav's hooks.
- At module level: `const CTX_GLIDE = menuGlide('sidebar-ctx-menu__item--danger')`.
- Check that `ctxRef` is a `RefObject<HTMLDivElement | null>` (`grep -n "ctxRef" src/components/layout/Sidebar.tsx`).

- [ ] **Step 2: YouTube Music's list menu**
- In `YouTubeMusicLists.tsx`, the menu is `<div ref={menuRef} className="sidebar-ctx-menu ytm-list-menu" …>`: add `glide-track `, its span, `const menuGlideRef = useRef<HTMLSpanElement>(null)` and `useHoverGlide(menuRef, menuGlideRef, '.sidebar-ctx-menu__item', CTX_GLIDE)` (with its own module-level `CTX_GLIDE`).
- Its **Remove** button gets the class `sidebar-ctx-menu__item sidebar-ctx-menu__item--danger`, so its highlight turns red.

- [ ] **Step 3: CSS** (`Sidebar.css`, python)
- Add `--glide-bg: rgba(var(--accent-rgb), 0.22);` to `.sidebar-ctx-menu`. It stays `position: fixed`; the page's rule wins over `.glide-track`.
- Add `border-radius: 0;` to `.sidebar-ctx-menu__item`. The items are full-width, and the `<label>` (Custom colour…) and the buttons would otherwise have different corners.
- Delete:

```css
.sidebar-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/layout/Sidebar.tsx src/components/youtube-music`
Expected: clean.

```bash
git add src/components/layout/Sidebar.tsx src/components/youtube-music/YouTubeMusicLists.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): its context menus' hover slides, red on Remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: The other dropdowns

**Files:**
- Modify: `src/components/SelectMenu.tsx`, `src/components/sets/SetsBox.tsx`, `src/components/layout/NowPlayingBar.tsx` (python)
- Modify: `src/components/dj/DjCandidatesMenu.tsx` (Edit)
- Modify: `src/components/SelectMenu.css`, `src/components/sets/SetsHome.css`, `src/components/views/DjView.css` (Edit), and `src/components/layout/NowPlayingBar.css` (python)

They all get the menus' accent highlight, `--glide-bg: rgba(var(--accent-rgb), 0.22)` on the track, and lose their own hover or active background.

| Component | Track | Hook and selector | Background rule to delete |
|---|---|---|---|
| `SelectMenu` | the `<ul className="select-menu__options" role="listbox">` | `useGlideTo(…, '.select-menu__option--active', GLIDE.menu)` | `.select-menu__option--active { background: … }` (SelectMenu.css) |
| `SetsBox` | the `role="listbox"` element that holds the rows | `useGlideTo(…, '.sets-box__row--active', GLIDE.menu)` | the `background` line of `.sets-box__row--active` (SetsHome.css; keep its `color`) |
| `NowPlayingBar` | `.now-playing-bar__playlist-menu` (rendered only while open) | `useHoverGlide(…, '.now-playing-bar__playlist-item', GLIDE.menu)` | the `background` line of `.now-playing-bar__playlist-item:hover` (keep its `color`) |
| `DjCandidatesMenu` | the element that holds the `.dj-menu__choice` buttons | `useHoverGlide(…, '.dj-menu__choice:not(:disabled)', GLIDE.menu)` | `.dj-menu__choice:hover:not(:disabled) { background: … }` (DjView.css) |

- **Options:** `GLIDE.menu`. None of these has a destructive item, so the colour comes from the CSS alone.
- **Highlight element:** inside the `<ul>` it is `<li ref={…} role="presentation" aria-hidden="true" className="glide" />`; everywhere else it is the usual `<span>`.
- **Track class:** each track gets `glide-track` in its class.

- [ ] **Step 1:** For each component, print the track's opening tag and the component's hooks (`grep -n`). Then add the refs, the hook (before any early `return`), the class, the highlight and the imports. `SetsBox.tsx` needs `useRef` added to its react import.
- [ ] **Step 2:** Make the CSS changes in the table, and add `--glide-bg: rgba(var(--accent-rgb), 0.22);` to each track's rule. Where a track has no rule of its own, add one by its class.
- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/SelectMenu.tsx src/components/sets/SetsBox.tsx src/components/layout/NowPlayingBar.tsx src/components/dj/DjCandidatesMenu.tsx && npx vitest run`
Expected: clean; tests pass.

```bash
git add src/components/SelectMenu.tsx src/components/SelectMenu.css src/components/sets/SetsBox.tsx src/components/sets/SetsHome.css src/components/layout/NowPlayingBar.tsx src/components/layout/NowPlayingBar.css src/components/dj/DjCandidatesMenu.tsx src/components/views/DjView.css
git commit -m "feat(glide): select menus, the Sets search box, Add to playlist and DJ candidates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Verify everything, and look at it

- [ ] **Step 1: The whole suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src mobile`
Expected:
- every test passes;
- no type errors;
- eslint reports exactly the 9 errors that `main` already has, and no new ones.

- [ ] **Step 2: A visual check in WebKit**
- Make a scratch harness in the session's scratchpad. The model is the earlier DJ Export harness:
  - `index.html` and `main.tsx` that import the app's CSS and components through `/@fs/<absolute path>.tsx`;
  - `mockIPC` for Tauri;
  - a symlinked `node_modules`;
  - `serve.mjs`, which starts Vite through `createRequire` from the repo's `package.json`;
  - `shoot.mjs`, which uses Playwright WebKit from `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`.
- Render whichever of these mount with mocks: the whole `App` with mocked IPC, or else a TrackTable with a few tracks, the Sidebar, a `Menu` and a Home card.
- In the midnight and dawn themes:
  - hover row 2, then row 5;
  - shoot mid-slide (100ms) and settled (400ms);
  - open a menu and press ↓ twice;
  - hover the sidebar nav;
  - right-click a YouTube Music playlist in the full sidebar (the menu must paint over the main area);
  - hover the DJ Overview's Tracks card.
- Confirm:
  - the highlight sits exactly on the row (no 1px offset);
  - it is under the text;
  - a selected row keeps its tint;
  - the menu's highlight is accent and Delete's is red;
  - nothing else moved.
- Fix what is wrong. Each fix gets its own commit.

- [ ] **Step 3: Leave notes for the user's check in `tauri dev`**

Note the list of things to try for the hand-off: rows in every list, the sidebar, the menus (mouse and keys), the table scrolled sideways, and dragging a track (no glide while dragging).
