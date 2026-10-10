# Micro-interactions (c): the app's own tooltips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One fast tooltip in the app's colours replaces all 112 system tooltips. It shows after 200ms, at once while warm, glides between neighbours, and carries shortcut chips.

**Architecture:**
- **Pure logic** in `src/lib/tooltip/tooltip.ts`: timing (`tipEntry`) and placement (`placeTip`).
- **`TooltipLayer`:** mounted once in `App`. It listens on `document` for elements with `data-tip`, and writes one portal `<div role="tooltip">` directly.
- **`shortcutKeys(id)`** reads the chips from `SHORTCUT_ROWS`.
- **Migration:** a TypeScript-AST codemod turns every `title` on an HTML element (and on `Button`) into `data-tip`. It adds `aria-label` or `aria-description` by the spec's three cases.
- **ESLint:** a `no-restricted-syntax` rule keeps `title` from coming back.

**Tech Stack:** React 19 + TypeScript, plain CSS, vitest (jsdom), the TypeScript compiler API (codemod), ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-10-10-micro-interactions-design.md`, Tooltips. Plans (a) and (b) come first: this plan uses `prefersReducedMotion` from `src/lib/glide/glide.ts` and the `--ease-soft` token.

---

## Conventions for every task

Same as plans (a) and (b):
- **Branch:** `feat/micro-interactions`. Stage files by name.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Prettier hook:** these files are changed only by python replace scripts, heredocs or the codemod:
  - `App.tsx`, `SidebarRail.tsx`, `Sidebar.tsx`/`.css`;
  - `NowPlayingBar.tsx`, `shortcuts.ts`, `shortcuts.test.ts`.
- **Checks:** `npx vitest run`, `npx tsc --noEmit`, and `npx eslint src mobile`, which must show only `main`'s 9 known errors.

---

### Task 1: Timing and placement

**Files:**
- Create: `src/lib/tooltip/tooltip.ts`
- Test: `src/lib/tooltip/tooltip.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/tooltip/tooltip.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { placeTip, TIP_WARM_MS, tipEntry } from './tooltip'

const viewport = { width: 1000, height: 700 }
const size = { width: 80, height: 26 }

describe('tipEntry: how the next tip comes in', () => {
  it('glides while one is shown', () => {
    expect(tipEntry(true, 0)).toBe('glide')
  })
  it('shows at once while warm, then waits again', () => {
    expect(tipEntry(false, TIP_WARM_MS - 1)).toBe('now')
    expect(tipEntry(false, TIP_WARM_MS)).toBe('wait')
    expect(tipEntry(false, Infinity)).toBe('wait')
  })
})

describe('placeTip', () => {
  it('goes below by default, centred, 6px away', () => {
    expect(
      placeTip(
        { left: 100, top: 100, width: 40, height: 28 },
        size,
        'bottom',
        viewport,
      ),
    ).toEqual({
      side: 'bottom',
      left: 80,
      top: 134,
    })
  })

  it('goes above in the player', () => {
    expect(
      placeTip(
        { left: 500, top: 650, width: 28, height: 28 },
        size,
        'top',
        viewport,
      ),
    ).toEqual({
      side: 'top',
      left: 474,
      top: 618,
    })
  })

  it('flips when its side has no room', () => {
    expect(
      placeTip(
        { left: 500, top: 670, width: 28, height: 28 },
        size,
        'bottom',
        viewport,
      ).side,
    ).toBe('top')
    expect(
      placeTip(
        { left: 500, top: 10, width: 28, height: 20 },
        size,
        'top',
        viewport,
      ).side,
    ).toBe('bottom')
    expect(
      placeTip(
        { left: 940, top: 300, width: 40, height: 36 },
        size,
        'right',
        viewport,
      ),
    ).toEqual({
      side: 'left',
      left: 854,
      top: 305,
    })
  })

  it('stays 8px inside the window', () => {
    expect(
      placeTip(
        { left: 0, top: 100, width: 20, height: 20 },
        size,
        'bottom',
        viewport,
      ).left,
    ).toBe(8)
    expect(
      placeTip(
        { left: 990, top: 100, width: 10, height: 20 },
        size,
        'bottom',
        viewport,
      ).left,
    ).toBe(912)
  })

  it('beside the rail, centred on the item', () => {
    expect(
      placeTip(
        { left: 8, top: 100, width: 40, height: 36 },
        size,
        'right',
        viewport,
      ),
    ).toEqual({
      side: 'right',
      left: 54,
      top: 105,
    })
  })
})
```

Run: `npx vitest run src/lib/tooltip`
Expected: FAIL. The test cannot resolve `./tooltip`.

- [ ] **Step 2: Write `src/lib/tooltip/tooltip.ts`**

```ts
// src/lib/tooltip/tooltip.ts
// The tooltips' timing and placement (Micro-interactions spec, Tooltips):
// pure, so TooltipLayer only wires them to the DOM.

/** The first tooltip shows after the pointer has rested this long. */
export const TIP_DELAY_MS = 200
/** For this long after one hides, the next shows at once. */
export const TIP_WARM_MS = 400
/** Leaving an element, the tip waits this long for the next one, so it can glide there. */
export const TIP_LEAVE_MS = 80
/** Between the element and its tip. */
export const TIP_GAP = 6
/** The tip stays this far inside the window. */
export const TIP_MARGIN = 8

/** Where a tip asks to go; `left` only as the flip of `right`. */
export type TipSide = 'top' | 'right' | 'bottom' | 'left'

const OPPOSITE: Record<TipSide, TipSide> = {
  top: 'bottom',
  bottom: 'top',
  right: 'left',
  left: 'right',
}

/** How the next tip comes in: gliding from the one shown, at once while warm, or after the delay. */
export function tipEntry(
  visible: boolean,
  msSinceHidden: number,
): 'glide' | 'now' | 'wait' {
  if (visible) return 'glide'
  return msSinceHidden < TIP_WARM_MS ? 'now' : 'wait'
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: TipSide
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Where a tip of `size` goes for an element at `anchor`: on `side`, centred
 * on the element, `TIP_GAP` away; on the opposite side when it does not fit
 * and that one does; kept `TIP_MARGIN` inside the window along the other axis.
 */
export function placeTip(
  anchor: Box,
  size: { width: number; height: number },
  side: TipSide,
  viewport: { width: number; height: number },
): Placement {
  const fits = (s: TipSide) => {
    if (s === 'top') return anchor.top - TIP_GAP - size.height >= TIP_MARGIN
    if (s === 'bottom')
      return (
        anchor.top + anchor.height + TIP_GAP + size.height <=
        viewport.height - TIP_MARGIN
      )
    if (s === 'right')
      return (
        anchor.left + anchor.width + TIP_GAP + size.width <=
        viewport.width - TIP_MARGIN
      )
    return anchor.left - TIP_GAP - size.width >= TIP_MARGIN
  }
  const chosen = fits(side) || !fits(OPPOSITE[side]) ? side : OPPOSITE[side]

  if (chosen === 'top' || chosen === 'bottom') {
    return {
      side: chosen,
      left: clamp(
        anchor.left + anchor.width / 2 - size.width / 2,
        TIP_MARGIN,
        viewport.width - TIP_MARGIN - size.width,
      ),
      top:
        chosen === 'top'
          ? anchor.top - TIP_GAP - size.height
          : anchor.top + anchor.height + TIP_GAP,
    }
  }
  return {
    side: chosen,
    left:
      chosen === 'right'
        ? anchor.left + anchor.width + TIP_GAP
        : anchor.left - TIP_GAP - size.width,
    top: clamp(
      anchor.top + anchor.height / 2 - size.height / 2,
      TIP_MARGIN,
      viewport.height - TIP_MARGIN - size.height,
    ),
  }
}
```

Run: `npx vitest run src/lib/tooltip`
Expected: PASS, 7 tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tooltip/tooltip.ts src/lib/tooltip/tooltip.test.ts
git commit -m "feat(tooltip): when a tip shows, and where: flip and keep inside the window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Shortcut chips from the ⌘/ sheet

**Files:**
- Modify: `src/lib/shortcuts/shortcuts.ts`, `src/lib/shortcuts/shortcuts.test.ts` (python)

- [ ] **Step 1: Ids, `shortcutKeys` and their tests.** Save as `<scratchpad>/shortcuts-ids.py`, then run `python3 <scratchpad>/shortcuts-ids.py` from the repo root:

```python
p = 'src/lib/shortcuts/shortcuts.ts'
s = open(p).read()
start = s.index('export const SHORTCUT_ROWS')
end = s.index(']\n', start) + 2
rows = s[start:end]
ids = ['play-pause', 'next', 'previous', 'search', 'find', 'sidebar', 'shortcuts', 'cancel', 'move', 'play-selected', 'select-all']
out, i = [], 0
for line in rows.split('\n'):
    if line.strip().startswith('{ keys:'):
        line = line.replace('{ keys:', "{ id: '%s', keys:" % ids[i], 1)
        i += 1
    out.append(line)
assert i == len(ids), i
rows_new = '\n'.join(out).replace(
    'export const SHORTCUT_ROWS: ReadonlyArray<{ keys: string[]; does: string }> = [',
    'export const SHORTCUT_ROWS: ReadonlyArray<{ id: ShortcutId; keys: string[]; does: string }> = [')
assert 'id: ShortcutId' in rows_new
id_type = "/** The shortcuts a tooltip can name (data-tip-keys). */\nexport type ShortcutId =\n" + '\n'.join("  | '%s'" % x for x in ids) + "\n\n"
sheet_doc = "/** The sheet's rows (⌘/), in the spec's order. \"⌘\" is written as `modKeyLabel()`. */\n"
assert s.count(sheet_doc + rows) == 1
s = s.replace(sheet_doc + rows, id_type + sheet_doc + rows_new + """
/**
 * A shortcut's keys as the sheet writes them, ⌘ as `modKeyLabel()`: the
 * chips of a tooltip's data-tip-keys (Micro-interactions spec, Tooltips).
 * Null for an id that is not in the sheet.
 */
export function shortcutKeys(id: string, platform: string = navigator.platform): string[] | null {
  const row = SHORTCUT_ROWS.find((r) => r.id === id)
  return row ? row.keys.map((key) => (key === '⌘' ? modKeyLabel(platform) : key)) : null
}
""")
open(p, 'w').write(s)

t = 'src/lib/shortcuts/shortcuts.test.ts'
s = open(t).read()
old = "import { isTextField, modKeyLabel, ownsSpace, shortcutFor, type KeyPress } from './shortcuts'"
assert s.count(old) == 1
s = s.replace(old, "import {\n  isTextField,\n  modKeyLabel,\n  ownsSpace,\n  SHORTCUT_ROWS,\n  shortcutFor,\n  shortcutKeys,\n  type KeyPress,\n} from './shortcuts'")
s += '''
describe("shortcutKeys: a tooltip's chips", () => {
  it("are the sheet's keys, ⌘ written for the platform", () => {
    expect(shortcutKeys('next', 'MacIntel')).toEqual(['⌘', '→'])
    expect(shortcutKeys('next', 'Win32')).toEqual(['Ctrl', '→'])
    expect(shortcutKeys('play-pause', 'MacIntel')).toEqual(['Space'])
  })

  it('know no other ids', () => {
    expect(shortcutKeys('nope')).toBeNull()
  })

  it('cover every row of the sheet, each id once', () => {
    const ids = SHORTCUT_ROWS.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
      expect(shortcutKeys(id, 'MacIntel')).toEqual(SHORTCUT_ROWS.find((r) => r.id === id)?.keys)
  })
})
'''
open(t, 'w').write(s)
print('ok')
```

If an assert fails, print the lines around `export const SHORTCUT_ROWS` (`grep -n -B2 -A14 "export const SHORTCUT_ROWS" src/lib/shortcuts/shortcuts.ts`) and match their exact text.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/lib/shortcuts && npx tsc --noEmit`
Expected: PASS (16 tests); no type errors. `ShortcutsSheet` reads `keys` and `does` only, so it is unaffected.

```bash
git add src/lib/shortcuts/shortcuts.ts src/lib/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): each row has an id; shortcutKeys gives a tooltip its chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `TooltipLayer`

**Files:**
- Create: `src/components/TooltipLayer.tsx`, `src/components/TooltipLayer.css`
- Test: `src/components/TooltipLayer.test.tsx`
- Modify: `src/App.tsx` (python)

- [ ] **Step 1: Write the failing test** `src/components/TooltipLayer.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipLayer } from './TooltipLayer'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import type { DragPayload } from '../lib/drag/dropTargets'
import { TIP_DELAY_MS, TIP_LEAVE_MS, TIP_WARM_MS } from '../lib/tooltip/tooltip'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let page: HTMLDivElement
const tip = () => document.querySelector<HTMLElement>('.tip[role="tooltip"]')!
const shown = () => tip().classList.contains('tip--shown')
const over = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  })
const out = (el: Element, to: Element | null = page) =>
  act(() => {
    el.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: to }),
    )
  })
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  page = document.createElement('div')
  page.innerHTML = `
    <button id="next" data-tip="Next" data-tip-keys="next"><b>›</b></button>
    <button id="prev" data-tip="Previous"></button>
    <div data-tip-off><button id="off" data-tip="Hidden"></button></div>
    <button id="plain"></button>
    <span id="name" data-tip="A long set name" data-tip-overflow>A long set name</span>`
  document.body.append(page)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<TooltipLayer />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  page.remove()
  useTrackDragStore.setState({ payload: null })
  vi.useRealTimers()
})

const el = (id: string) => document.getElementById(id)!

describe('TooltipLayer', () => {
  it('shows after 200ms, with the text and the shortcut chips', () => {
    over(el('next').querySelector('b')!)
    wait(TIP_DELAY_MS - 1)
    expect(shown()).toBe(false)
    wait(1)
    expect(shown()).toBe(true)
    expect(tip().textContent).toMatch(/^Next/)
    expect(
      [...tip().querySelectorAll('kbd')].map((k) => k.textContent),
    ).toContain('→')
  })

  it('stays while the pointer moves inside its element, hides 80ms after it leaves', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'), el('next').querySelector('b'))
    wait(TIP_LEAVE_MS)
    expect(shown()).toBe(true)
    out(el('next'))
    wait(TIP_LEAVE_MS)
    expect(shown()).toBe(false)
  })

  it('glides to a neighbour while shown', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'), el('prev'))
    over(el('prev'))
    expect(shown()).toBe(true)
    expect(tip().classList.contains('tip--gliding')).toBe(true)
    wait(110)
    expect(tip().textContent).toBe('Previous')
  })

  it('shows at once while warm, then waits again', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'))
    wait(TIP_LEAVE_MS)
    over(el('prev'))
    expect(shown()).toBe(true)
    expect(tip().classList.contains('tip--gliding')).toBe(false)
    out(el('prev'))
    wait(TIP_LEAVE_MS + TIP_WARM_MS)
    over(el('next'))
    expect(shown()).toBe(false)
  })

  it('a press hides it', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    act(() => {
      el('next').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(shown()).toBe(false)
  })

  it('shows nothing inside data-tip-off, on an element without one, or while tracks are dragged', () => {
    over(el('off'))
    over(el('plain'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    act(() => useTrackDragStore.setState({ payload: {} as DragPayload }))
    over(el('prev'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
  })

  it('a press hides it, and it stays hidden until the pointer leaves the element', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    act(() => {
      el('next').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    out(el('next').querySelector('b')!, el('next'))
    over(el('next'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    out(el('next'))
    over(el('next'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(true)
  })

  it('shows nothing for an element that left the page while it waited', () => {
    over(el('prev'))
    act(() => el('prev').remove())
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
  })

  it('with data-tip-overflow, shows only while the text is cut off', () => {
    over(el('name'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    out(el('name'))
    Object.defineProperty(el('name'), 'scrollWidth', { value: 300 })
    Object.defineProperty(el('name'), 'clientWidth', { value: 120 })
    wait(TIP_LEAVE_MS + 500)
    over(el('name'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(true)
  })
})
```

Run: `npx vitest run src/components/TooltipLayer.test.tsx`
Expected: FAIL. The test cannot resolve `./TooltipLayer`.

- [ ] **Step 2: Write `src/components/TooltipLayer.tsx`**

```tsx
// src/components/TooltipLayer.tsx
// The app's one tooltip (Micro-interactions spec, Tooltips), in place of the
// system's. Any element with data-tip="…" gets it: after 200ms; at once for
// 400ms after one hid; gliding from one element to the next while it is
// shown. data-tip-keys names a shortcut whose keys show as chips; the closest
// data-tip-side says top, right or bottom (the default); data-tip-overflow
// shows it only while the element's text is cut off. None shows inside
// data-tip-off or while tracks are dragged. Mounted once in App, so the mini
// player's window has it too. The DOM is written directly: a pointer move
// never re-renders React.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import { prefersReducedMotion } from '../lib/glide/glide'
import { shortcutKeys } from '../lib/shortcuts/shortcuts'
import {
  placeTip,
  TIP_DELAY_MS,
  TIP_LEAVE_MS,
  tipEntry,
  type TipSide,
} from '../lib/tooltip/tooltip'
import './TooltipLayer.css'

/** The text cross-fades this long out before the next one comes in. */
const SWAP_MS = 110

/** Whether an element's text, or a descendant's, is cut off. */
function cutOff(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true
  for (const child of el.querySelectorAll<HTMLElement>('*')) {
    if (child.scrollWidth > child.clientWidth + 1) return true
  }
  return false
}

/** The element whose tip a node is in, unless tips are off there. */
function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest<HTMLElement>('[data-tip]')
  if (!el || !el.dataset.tip || el.closest('[data-tip-off]')) return null
  if (el.hasAttribute('data-tip-overflow') && !cutOff(el)) return null
  return el
}

function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

/** The tip's text and its keys' chips. */
function fill(into: HTMLElement, el: HTMLElement) {
  into.replaceChildren(document.createTextNode(el.dataset.tip ?? ''))
  const keys = el.dataset.tipKeys ? shortcutKeys(el.dataset.tipKeys) : null
  for (const key of keys ?? []) {
    const chip = document.createElement('kbd')
    chip.textContent = key
    into.append(chip)
  }
}

export function TooltipLayer() {
  const tipRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const tip = tipRef.current
    const text = textRef.current
    const measure = measureRef.current
    if (!tip || !text || !measure) return

    let target: HTMLElement | null = null
    let visible = false
    let hiddenAt = -Infinity
    // Pressed (or Esc): no tip for this element until the pointer leaves it.
    let dismissed: HTMLElement | null = null
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    let swapTimer: ReturnType<typeof setTimeout> | undefined

    const hide = () => {
      clearTimeout(showTimer)
      clearTimeout(leaveTimer)
      target = null
      if (!visible) return
      visible = false
      hiddenAt = performance.now()
      tip.classList.remove('tip--shown', 'tip--gliding')
      gone.disconnect()
    }
    const dismiss = () => {
      dismissed = target
      hide()
    }
    // While shown: hide if its element leaves the page.
    const gone = new MutationObserver(() => {
      if (target && !target.isConnected) hide()
    })

    const place = (el: HTMLElement) => {
      fill(measure, el)
      const size = { width: measure.offsetWidth, height: measure.offsetHeight }
      const side = (el.closest<HTMLElement>('[data-tip-side]')?.dataset
        .tipSide ?? 'bottom') as TipSide
      const at = placeTip(el.getBoundingClientRect(), size, side, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
      tip.style.left = `${at.left}px`
      tip.style.top = `${at.top}px`
      tip.style.width = `${size.width}px`
      tip.dataset.side = at.side
    }

    const appear = (el: HTMLElement) => {
      // It left the page while the tip waited: nothing to point at.
      if (!el.isConnected) {
        target = null
        return
      }
      clearTimeout(swapTimer)
      tip.classList.remove('tip--shown', 'tip--gliding')
      fill(text, el)
      text.style.opacity = ''
      place(el)
      void tip.offsetWidth // from its start, not from where the last one went
      tip.classList.add('tip--shown')
      visible = true
      gone.observe(document.body, { childList: true, subtree: true })
    }

    const glide = (el: HTMLElement) => {
      if (!el.isConnected) return hide()
      if (prefersReducedMotion()) return appear(el)
      tip.classList.add('tip--gliding')
      place(el)
      text.style.opacity = '0'
      clearTimeout(swapTimer)
      swapTimer = setTimeout(() => {
        fill(text, el)
        text.style.opacity = ''
      }, SWAP_MS)
    }

    const enter = (el: HTMLElement) => {
      clearTimeout(leaveTimer)
      if (el === target || el === dismissed) return
      clearTimeout(showTimer)
      if (useTrackDragStore.getState().payload !== null) return
      target = el
      const entry = tipEntry(visible, performance.now() - hiddenAt)
      if (entry === 'glide') glide(el)
      else if (entry === 'now') appear(el)
      else showTimer = setTimeout(() => appear(el), TIP_DELAY_MS)
    }

    // Leaving, it waits a moment for the next element, so it can glide there.
    const leave = () => {
      clearTimeout(showTimer)
      if (!visible) {
        target = null
        return
      }
      clearTimeout(leaveTimer)
      leaveTimer = setTimeout(hide, TIP_LEAVE_MS)
    }

    const onOver = (e: PointerEvent) => {
      const el = tipTarget(e.target)
      if (el) enter(el)
    }
    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null
      if (dismissed && !(to && dismissed.contains(to))) dismissed = null
      if (!target) return
      if (to && target.contains(to)) return
      leave()
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = tipTarget(e.target)
      if (el && focusVisible(el)) enter(el)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (target && e.target instanceof Node && target.contains(e.target))
        leave()
    }
    // Esc hides it; so does pressing the element from the keyboard, which
    // may change what the tip would say (Play turns into Pause).
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' ||
        (visible && (e.key === 'Enter' || e.key === ' '))
      )
        dismiss()
    }
    const unsubscribe = useTrackDragStore.subscribe((state) => {
      if (state.payload !== null) hide()
    })

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('scroll', hide, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('scroll', hide, { capture: true })
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', hide)
      unsubscribe()
      gone.disconnect()
      clearTimeout(showTimer)
      clearTimeout(leaveTimer)
      clearTimeout(swapTimer)
    }
  }, [])

  return createPortal(
    <>
      <div ref={tipRef} className="tip" role="tooltip">
        <span ref={textRef} className="tip__text" />
      </div>
      <span
        ref={measureRef}
        className="tip tip__text tip--measure"
        aria-hidden="true"
      />
    </>,
    document.body,
  )
}
```

- [ ] **Step 3: Write `src/components/TooltipLayer.css`**

```css
/* src/components/TooltipLayer.css */
/* The app's tooltip (Micro-interactions spec, Tooltips): the dark surface, a
   name and, when it has one, its shortcut's keys. It rises 4px away from its
   element as it fades in, and glides (left, top, width) between neighbours. */

.tip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10002; /* over menus (10000) and modal overlays (10001) */
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 26px;
  max-width: 280px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.35;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transform: var(--tip-from, translateY(-4px));
  /* Hidden for assistive tech too once it has faded out. */
  visibility: hidden;
  transition:
    opacity 140ms var(--ease),
    transform 180ms var(--ease-soft),
    visibility 0s linear 140ms;
}

/* Where it rises from: towards its element. */
.tip[data-side='top'] {
  --tip-from: translateY(4px);
}

.tip[data-side='bottom'] {
  --tip-from: translateY(-4px);
}

.tip[data-side='right'] {
  --tip-from: translateX(-4px);
}

.tip[data-side='left'] {
  --tip-from: translateX(4px);
}

.tip--shown {
  opacity: 1;
  transform: none;
  visibility: visible;
  transition:
    opacity 140ms var(--ease),
    transform 180ms var(--ease-soft),
    visibility 0s;
}

.tip--gliding {
  transition:
    opacity 140ms var(--ease),
    transform 180ms var(--ease-soft),
    left 260ms var(--ease-soft),
    top 260ms var(--ease-soft),
    width 260ms var(--ease-soft),
    visibility 0s;
}

.tip__text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  transition: opacity 110ms ease;
}

.tip kbd {
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
  color: var(--text-secondary);
  font: inherit;
  font-size: 10.5px;
  line-height: 16px;
}

/* Measures the next tip's width before it glides there. */
.tip--measure {
  top: -9999px;
  left: -9999px;
  width: max-content;
  visibility: hidden;
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .tip,
  .tip--gliding {
    transform: none;
    transition:
      opacity 140ms var(--ease),
      visibility 0s linear 140ms;
  }

  .tip--shown {
    transition:
      opacity 140ms var(--ease),
      visibility 0s;
  }

  .tip__text {
    transition: none;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/TooltipLayer.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Mount it in `App`, for the main window and the mini player**

```bash
python3 - <<'EOF'
p = 'src/App.tsx'
s = open(p).read()
old = """    <MotionConfig reducedMotion="user">
      {hash === '#mini-player' ? <MiniPlayer /> : <AppContent />}
    </MotionConfig>"""
assert s.count(old) == 1
s = s.replace(old, """    <MotionConfig reducedMotion="user">
      <TooltipLayer />
      {hash === '#mini-player' ? <MiniPlayer /> : <AppContent />}
    </MotionConfig>""")
open(p, 'w').write(s)
EOF
```

Add `import { TooltipLayer } from './components/TooltipLayer'` beside App's other component imports, with a python insert.

- [ ] **Step 6: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/TooltipLayer.tsx src/components/TooltipLayer.test.tsx src/App.tsx && npx vitest run`
Expected: types clean. Lint shows nothing new for these files; `App.tsx` has none of the 9 known errors. All tests pass.

```bash
git add src/components/TooltipLayer.tsx src/components/TooltipLayer.css src/components/TooltipLayer.test.tsx src/App.tsx
git commit -m "feat(tooltip): the app's own tooltip — 200ms, warm, gliding, with shortcut chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Migrate every `title`

**Files:**
- Modify: the 46 files the codemod changes, then `NowPlayingBar.tsx`, `Sidebar.tsx` and `SidebarRail.tsx` (python)
- Tool: `migrate-titles.cjs` in the session's scratchpad (not committed)

- [ ] **Step 1: Save the codemod** as `<scratchpad>/migrate-titles.cjs`:

```js
// Migrate title= to data-tip (Micro-interactions spec, Tooltips → Migration).
// AST-based, so formatting and line numbers do not matter. Each title on a
// JSX HTML element (or on Button, which forwards it) becomes data-tip, plus:
//   - no visible text (icons, a glyph such as ✕): aria-label = the tip,
//     unless the element already has one;
//   - visible text that says the same (a truncated name shown in full):
//     data-tip-overflow, so the tip shows only while the text is cut off;
//   - visible text that says something else: aria-description = the tip.
// OVERRIDES settle the cases the text test reads wrongly.
// Usage: node tips-codemod.cjs <repo> [--write]
const path = require('path'), fs = require('fs'), cp = require('child_process')
const repo = process.argv[2], write = process.argv.includes('--write')
const ts = require(path.join(repo, 'node_modules/typescript'))

// file | the title's initializer, whitespace squeezed → the case
const OVERRIDES = {
  // A truncated value shown in full: the visible text already says it.
  'src/components/DjExportModal.tsx|{path}': 'same',
  'src/components/track-table/FilterButton.tsx|{label ?? undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.title || undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.artist || undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.genre || undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.label || undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.album || undefined}': 'same',
  'src/components/track-table/TrackCell.tsx|{track.comment || undefined}': 'same',
  'src/components/ExportPlaylistModal.tsx|{progress.currentFile}': 'same',
  'src/components/SelectMenu.tsx|{option.label.length > LONG_LABEL ? option.label : undefined}': 'same',
  'src/components/dj/DjGigsTab.tsx|{gig.lineup ?? undefined}': 'same',
  'src/components/sets/SetPage.tsx|{title}': 'same',
  'src/components/spotify/SpotifyLists.tsx|{name}': 'same',
  // The badge "1" is not the button's name.
  "src/components/layout/NowPlayingBar.tsx|{ repeatMode === 'one' ? 'Repeat One' : repeatMode === 'all' ? 'Repeat All' : 'Repeat' }": 'label',
  // A framer-motion button: only a badge and an icon inside.
  'src/components/ai/FloatingButton.tsx|"Open AI Assistant (Cmd+K)"': 'label',
}

const squeeze = (s) => s.replace(/\s+/g, ' ')
const files = cp.execSync("git ls-files 'src/*.tsx' 'src/**/*.tsx'", { cwd: repo }).toString().trim().split('\n')
  .filter((f) => !f.endsWith('src/components/Player.tsx') && !f.endsWith('.test.tsx'))
const report = { label: [], same: [], description: [], keptLabel: [] }
const used = new Set()
let total = 0

for (const f of files) {
  const abs = path.join(repo, f)
  const text = fs.readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  // The text a reader sees inside an element: JSX text and non-JSX
  // expressions, skipping icons and aria-hidden parts.
  const seen = (node, out) => {
    for (const kid of node.children ?? []) {
      if (ts.isJsxText(kid)) { if (kid.getText(sf).trim()) out.texts.push(kid.getText(sf).trim()) }
      else if (ts.isJsxExpression(kid)) {
        const e = kid.expression
        if (!e) continue
        if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) seen({ children: [e] }, out)
        else out.exprs.push(squeeze(kid.getText(sf)))
      } else if (ts.isJsxElement(kid) || ts.isJsxFragment(kid)) {
        if (ts.isJsxElement(kid)) {
          const tag = kid.openingElement.tagName.getText(sf)
          const hidden = kid.openingElement.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'aria-hidden')
          if (tag === 'Icon' || hidden) continue
        }
        seen(kid, out)
      }
    }
    return out
  }

  const edits = []
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'title') {
      const opening = n.parent.parent
      const tag = opening.tagName.getText(sf)
      if (/^[a-z]/.test(tag) || tag === 'Button') {
        total++
        const attrs = opening.attributes.properties
        const has = (name) => attrs.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name)
        const init = n.initializer ? n.initializer.getText(sf) : '{true}'
        const key = `${f}|${squeeze(init)}`
        const element = ts.isJsxSelfClosingElement(opening) ? null : opening.parent
        const { texts, exprs } = element ? seen(element, { texts: [], exprs: [] }) : { texts: [], exprs: [] }
        const glyphOnly = exprs.length === 0 && texts.every((t) => !/[\p{L}\p{N}]/u.test(t))
        const literal = n.initializer && ts.isStringLiteral(n.initializer) ? n.initializer.text : null
        let kind
        if (OVERRIDES[key]) { kind = OVERRIDES[key]; used.add(key) }
        else if (glyphOnly) kind = 'label'
        else if ((literal !== null && texts.join(' ') === literal) || exprs.includes(squeeze(init))) kind = 'same'
        else kind = 'description'
        if (kind === 'label' && has('aria-label')) kind = 'keptLabel'
        if (kind === 'description' && has('aria-description')) kind = 'same'
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        report[kind].push(`${f}:${line} <${tag}> title=${squeeze(init).slice(0, 70)}${texts.length || exprs.length ? `  | text: ${[...texts, ...exprs].join(' ').slice(0, 50)}` : ''}`)
        // A tip that only repeats the visible text is for when that text is
        // cut off: the layer shows it only then (data-tip-overflow).
        const extra =
          kind === 'label' ? ` aria-label=${init}`
          : kind === 'description' ? ` aria-description=${init}`
          : kind === 'same' ? ' data-tip-overflow'
          : ''
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `data-tip=${init}${extra}` })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  if (write && edits.length) {
    let out = text
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
    fs.writeFileSync(abs, out)
  }
}
for (const [k, v] of Object.entries(report)) { console.log(`== ${k} (${v.length})`); v.forEach((x) => console.log('  ' + x)) }
console.log(`total ${total}`)
const unused = Object.keys(OVERRIDES).filter((k) => !used.has(k))
if (unused.length) { console.log('UNUSED OVERRIDES:\n  ' + unused.join('\n  ')); process.exitCode = 1 }
```

- [ ] **Step 2: Dry run**

Run: `node <scratchpad>/migrate-titles.cjs "$PWD"`
Expected:
- the four groups add up to `total 113`: 112 `title`s on HTML elements and `Button`'s one;
- no `UNUSED OVERRIDES` line;
- every override key matched. Plans (a) and (b) moved lines but did not change these `title` texts.

Read the `label` and `description` lists against the spec's three cases. The `same` group, whose tips only repeat the visible text, also gets `data-tip-overflow`: the layer shows those tips only while the text is cut off (for example the TrackTable's cells), so sweeping the pointer across a table does not drag a tooltip along. If plans (a) or (b) changed an element so that it reads differently (for example, it gained visible text), add an override and run the dry run again.

- [ ] **Step 3: Write**

Run: `node <scratchpad>/migrate-titles.cjs "$PWD" --write && git diff --stat | tail -1`
Expected: about 46 files changed. The edits only rename `title=` and add `aria-label=` / `aria-description=` in place; nothing is reformatted.

- [ ] **Step 4: Keys, sides and names the codemod cannot know** (python, `assert s.count(old) == 1` each)
- **`NowPlayingBar.tsx`:**
  - the root `<div className={\`now-playing-bar ${…}\`}>` gets `data-tip-side="top"`;
  - the transport's `data-tip="Previous"` gets ` data-tip-keys="previous"`;
  - `data-tip="Next"` gets ` data-tip-keys="next"`;
  - `data-tip={isPlaying ? 'Pause' : 'Play'}` gets ` data-tip-keys="play-pause"`.
  - Match each on its `data-tip=…` text. If a text occurs more than once (the expanded view also has Previous and Next), anchor on the line before it.
  - the expanded view's `data-tip="Close (Escape)" aria-label="Close (Escape)"` becomes `data-tip="Close" aria-label="Close" data-tip-keys="cancel"`.
- **`Sidebar.tsx`:** `data-tip="Collapse sidebar (⌘\)"` becomes `data-tip="Collapse sidebar" data-tip-keys="sidebar"`. Its `aria-label` is already "Collapse sidebar".
- **`SidebarRail.tsx`:** `data-tip="Expand sidebar (⌘\)"` becomes `data-tip="Expand sidebar" data-tip-keys="sidebar"`.

Run: `grep -rn 'data-tip=".*(⌘\|data-tip=".*(Escape)\|data-tip=".*(Cmd' src --include=*.tsx`
Expected: only the AI components' "(Cmd+K)". AI is off and they are left as they are.

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src mobile`
Expected:
- no type errors;
- all tests pass. If a test looked an element up by its `title`, change it to look it up by `data-tip` or its accessible name;
- eslint shows only the 9 known errors.

```bash
git add -u src
git status --short   # check: only .tsx files under src/, nothing from .planning or .claude
git commit -m "feat(tooltip): every system tooltip becomes the app's own (data-tip)

title on HTML elements and on Button becomes data-tip. Where the element has
no visible text it also gets aria-label; where its visible text says
something else, aria-description, so the name stays the name. The transport
and the sidebar toggles show their shortcuts as chips; the player's tips
open above it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The rail's own tooltip goes

**Files:**
- Modify: `src/components/layout/SidebarRail.tsx`, `src/components/layout/Sidebar.css` (python)

- [ ] **Step 1: `SidebarRail.tsx`**
- Delete `const TOOLTIP_DELAY_MS = 400`, the `// --- Tooltip ---` state (`tip`, `tipTimer`), `showTip`, `hideTip`, and its cleanup `useEffect`.
- Delete every `onMouseEnter={flyout ? undefined : showTip(…)}` and `onMouseLeave={hideTip}`.
- Delete the `hideTip()` call inside `toggleFlyout`, and `clearTimeout(tipTimer.current); setTip(null)` inside the `registerDropOpener` callback.
- Delete the `{tip && (<div className="sidebar-tooltip" …>…</div>)}` block.
- Each item gets the app's tooltip, on the right, and none while a flyout is open:
  - `sectionButton`'s `<button`: add `data-tip={label}`;
  - the nav items' `<button`: add `data-tip={item.label}`;
  - the avatar: `data-tip="Settings"`;
  - `<div className="… sidebar-rail__nav" …>` (it has `glide-track` from plan (a)): add `data-tip-side="right"` and `data-tip-off={flyout ? '' : undefined}`;
  - the avatar `<button`: add `data-tip-side="right"` and `data-tip-off={flyout ? '' : undefined}`;
  - `<div className="sidebar-rail__top">`: add `data-tip-side="right"`.
- The flyout's own rows keep their tips. They are outside `data-tip-off`, and their side is the default.
- `useEffect`, `useRef` and `useState` all stay in use (the flyout, `openedByDrag`, the drop effect), so the react import line does not change.

- [ ] **Step 2: `Sidebar.css`:** delete the `/* ===== Tooltip (rail) … ===== */` comment and the `.sidebar-tooltip` rule(s) under it.

- [ ] **Step 3: Check and commit**

Run: `grep -rn "sidebar-tooltip\|showTip\|hideTip\|TOOLTIP_DELAY_MS" src` (expected: nothing), then `npx tsc --noEmit && npx eslint src/components/layout/SidebarRail.tsx`.

```bash
git add src/components/layout/SidebarRail.tsx src/components/layout/Sidebar.css
git commit -m "refactor(sidebar): the rail uses the app's tooltip, beside it, none while a flyout is open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Keep system tooltips out

**Files:**
- Modify: `eslint.config.js` (python)
- Test: `src/test/noTitleRule.test.ts`

- [ ] **Step 1: Write the failing test** `src/test/noTitleRule.test.ts`:

```ts
// The lint rule that keeps system tooltips out (Micro-interactions spec,
// Tooltips → Migration): title is refused on HTML elements and on Button.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint({ cwd: process.cwd() })
async function titleErrors(
  code: string,
  filePath = 'src/components/Probe.tsx',
) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
    .length
}

describe('no title on HTML elements', () => {
  it('refuses title on an HTML element and on Button', async () => {
    expect(
      await titleErrors('export const A = () => <button title="Next" />\n'),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <span title={name}>{name}</span>\n',
      ),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <Button title="Costs 1 quota unit">Test</Button>\n',
      ),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <motion.button title="Open" />\n',
      ),
    ).toBe(1)
  })

  it('accepts data-tip, and title as a prop of other components', async () => {
    expect(
      await titleErrors(
        'export const A = () => <button data-tip="Next" aria-label="Next" />\n',
      ),
    ).toBe(0)
    expect(
      await titleErrors('export const A = () => <Modal title="Export" />\n'),
    ).toBe(0)
  })

  it('leaves the unused Player.tsx alone', async () => {
    expect(
      await titleErrors(
        'export const A = () => <button title="Next" />\n',
        'src/components/Player.tsx',
      ),
    ).toBe(0)
  }, 20000)
}, 30000)
```

Run: `npx vitest run src/test/noTitleRule.test.ts`
Expected: FAIL. The first test finds 0 errors where it expects 1.

- [ ] **Step 2: The rule**

```bash
python3 - <<'EOF'
p = 'eslint.config.js'
s = open(p).read()
old = "  prettierConfig,\n)"
assert s.count(old) == 1
s = s.replace(old, """  {
    // The app's own tooltip replaces the system's (Micro-interactions spec,
    // Tooltips): data-tip, not title, on HTML elements and on Button, which
    // passes title through. Player.tsx is unused and left as it is.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/Player.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^([a-z]|Button$)/] > JSXAttribute[name.name='title']",
          message: 'Use data-tip (the app tooltip, TooltipLayer), not title.',
        },
        {
          // motion.button and the like render the HTML element too.
          selector:
            "JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name=/^[a-z]/] > JSXAttribute[name.name='title']",
          message: 'Use data-tip (the app tooltip, TooltipLayer), not title.',
        },
      ],
    },
  },
  prettierConfig,
)""")
open(p, 'w').write(s)
EOF
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/test/noTitleRule.test.ts && npx eslint src mobile`
Expected: PASS, 3 tests; eslint shows only the 9 known errors, none of them `no-restricted-syntax`.

```bash
git add eslint.config.js src/test/noTitleRule.test.ts
git commit -m "chore(lint): refuse title on HTML elements and Button — data-tip instead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Verify everything, and look at it

- [ ] **Step 1:** Run `npx vitest run && npx tsc --noEmit && npx eslint src mobile`. Expected: all tests pass, no type errors, only `main`'s 9 known lint errors.
- [ ] **Step 2: The WebKit harness**, in midnight and dawn:
  - hover Next in the transport: shoot at 150ms (nothing), at 260ms (shown above, with `⌘ →` chips), then move to Play (mid-glide at 120ms, and settled);
  - leave and come back within 400ms (at once);
  - hover a sidebar item collapsed to the rail (on the right);
  - hover a truncated set name (below, wrapped at 280px when long);
  - put a button near the window's right edge (kept 8px inside);
  - sweep the pointer down the TrackTable's Title column: no tooltip unless a title is cut off.
- [ ] **Step 3: Accessibility spot-check.** In the harness DOM:
  - the transport buttons have `aria-label`s;
  - "Connect Spotify" with a dirty Client ID keeps its visible name and has `aria-description="Save the Client ID first"`;
  - a disabled button still shows its tip;
  - after the tip hides, `.tip` is `visibility: hidden`, so VoiceOver cannot reach stale text.
- [ ] **Step 4:** Fix what is wrong, each fix in its own commit.
