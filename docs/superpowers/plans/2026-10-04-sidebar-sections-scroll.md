# Sidebar: Section Headers Stay in View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every sidebar section header (FOLDERS, PLAYLISTS, SPOTIFY, YOUTUBE MUSIC) in view, with each open section's list scrolling inside itself and the height shared by content: short lists keep their whole height, long ones share the rest.

**Architecture:** A pure function `distributeHeights` (unit-tested) decides each open list's height. A hook, `useSectionHeights`, measures the section area and each list's own height with `ResizeObserver` and feeds the function. `Sidebar.tsx` moves the nav out of the scrolling area and animates each list's body to its height (the existing framer-motion body, now to a number instead of `auto`); the body scrolls.

**Tech Stack:** React 19, TypeScript, framer-motion, Vitest (jsdom, no Testing Library), plain CSS.

**Spec:** `docs/superpowers/specs/2026-10-04-sidebar-sections-scroll-design.md` (read it first).

**Branch:** `feat/redesign` (holds the spec).

**Checked:** every code block below was applied to a scratch copy of the code at `main` (48c0927; `Sidebar.tsx`/`Sidebar.css` are the same on `feat/redesign`). `tsc`, `eslint` on the touched files and the whole `vitest` suite pass. In WebKit (Playwright, a page rendering only the sidebar with 40 folders, 30 playlists and 5 Spotify lists) at 260×800, all open: Spotify kept its 172px and Folders and Playlists got 176px each, scrolling inside, every header on screen; Folders closed → Playlists 352px, Spotify 172px; at 420px high → every list 96px and the section area scrolls.

**Testing note:** the repo has no React Testing Library and jsdom has no `ResizeObserver`; the sharing rule is unit-tested, the measuring and the layout are checked by hand in the Tauri window (WebKit) in Task 4.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/sidebarSections.ts` | create | `MIN_BODY_HEIGHT`, `distributeHeights`. Pure. |
| `src/lib/sidebarSections.test.ts` | create | Unit tests for the above. |
| `src/components/layout/useSectionHeights.ts` | create | Measures the area and the open lists; answers each list's height. |
| `src/components/layout/Sidebar.tsx` | modify | Nav out of the scroll area; sections get `section`, `height`, `contentRef`; body animates to the height; the selected row is shown when a list opens. |
| `src/components/layout/Sidebar.css` | modify | The section area as a flex column; bodies scroll with the thin scrollbar. |

---

### Task 0: Baseline

- [ ] **Step 1: Be on the branch**

```bash
git switch feat/redesign
git status --short   # only .claude/settings.local.json and .planning/STATE.md may show; leave them
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass (a few in `tracklist.test.ts` are skipped only where its untracked fixtures are absent), no type errors.

---

### Task 1: The sharing rule

**Files:**
- Create: `src/lib/sidebarSections.ts`
- Test: `src/lib/sidebarSections.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/sidebarSections.test.ts
import { describe, expect, it } from 'vitest'
import { MIN_BODY_HEIGHT, distributeHeights } from './sidebarSections'

describe('sharing the sidebar between open sections', () => {
  it('gives every list its whole height when they all fit', () => {
    expect(distributeHeights(800, [300, 120, 200])).toEqual([300, 120, 200])
  })

  it('lets a short list keep its height and gives a long one the rest', () => {
    expect(distributeHeights(500, [1000, 120])).toEqual([380, 120])
  })

  it('shares what the short lists leave equally between the long ones', () => {
    expect(distributeHeights(600, [900, 800, 100])).toEqual([250, 250, 100])
  })

  it('keeps a list that fits its equal share, even when it is not the shortest', () => {
    // 700 / 3 = 233: 100 and 200 fit; 400 is left for the 2000 list.
    expect(distributeHeights(700, [2000, 200, 100])).toEqual([400, 200, 100])
  })

  it('never shrinks a list below three rows', () => {
    expect(distributeHeights(150, [900, 800])).toEqual([
      MIN_BODY_HEIGHT,
      MIN_BODY_HEIGHT,
    ])
  })

  it('does not stretch a list shorter than three rows to three rows', () => {
    expect(distributeHeights(100, [900, 40])).toEqual([MIN_BODY_HEIGHT, 40])
  })

  it('gives whole pixels', () => {
    expect(distributeHeights(500, [900, 900, 900])).toEqual([166, 166, 166])
  })

  it('handles no open sections and no space', () => {
    expect(distributeHeights(500, [])).toEqual([])
    expect(distributeHeights(0, [300])).toEqual([MIN_BODY_HEIGHT])
    expect(distributeHeights(-20, [50])).toEqual([50])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/sidebarSections.test.ts`
Expected: FAIL — `Failed to resolve import "./sidebarSections"`.

- [ ] **Step 3: Write the function**

```ts
// src/lib/sidebarSections.ts
/**
 * How the sidebar's open sections share its height. Pure: the measuring lives
 * in `components/layout/useSectionHeights.ts`.
 */

/** An open list never shrinks below this — about three rows. */
export const MIN_BODY_HEIGHT = 96

/**
 * The height each open list gets, in the order given.
 *
 * Lists that fit in an equal share of what is left keep their whole height,
 * shortest first; the rest share the remainder equally and scroll inside.
 * Flexbox cannot do this on its own: it shrinks every item in proportion to
 * its size, so a short list would scroll too.
 *
 * A list is never given less than `MIN_BODY_HEIGHT`, or its own height if that
 * is shorter. When even that does not fit, the heights add up to more than
 * `available` and the section area scrolls as a whole.
 *
 * @param available the height for the lists: the section area minus headers and dividers.
 * @param natural each open list's own height.
 */
export function distributeHeights(
  available: number,
  natural: number[],
): number[] {
  const out = new Array<number>(natural.length)
  const order = natural.map((_, i) => i).sort((a, b) => natural[a] - natural[b])
  let left = Math.max(0, available)
  for (let k = 0; k < order.length; k++) {
    const i = order[k]
    const share = left / (order.length - k)
    if (natural[i] <= share) {
      out[i] = natural[i]
      left -= natural[i]
      continue
    }
    // This list and every taller one share what is left.
    for (const j of order.slice(k)) {
      out[j] = Math.max(
        Math.floor(share),
        Math.min(natural[j], MIN_BODY_HEIGHT),
      )
    }
    break
  }
  return out
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/sidebarSections.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebarSections.ts src/lib/sidebarSections.test.ts
git commit -m "feat(sidebar): short lists keep their height, long ones share the rest"
```

---

### Task 2: The measuring hook

**Files:**
- Create: `src/components/layout/useSectionHeights.ts`

No unit test: jsdom has no `ResizeObserver`. Task 4 checks it in the app.

- [ ] **Step 1: Write the hook**

```ts
// src/components/layout/useSectionHeights.ts
// Measures the sidebar's section area and each open list, and shares the
// height between the lists (lib/sidebarSections.ts). Called once, from
// Sidebar.tsx, which gives each open list the height this answers.
import { useCallback, useEffect, useRef, useState } from 'react'
import { distributeHeights } from '../../lib/sidebarSections'
import type { SidebarSection } from '../../lib/sidebarPrefs'

type Heights = Partial<Record<SidebarSection, number>>

export interface SectionHeights {
  /** Attach to the section area under the nav. */
  areaRef: (el: HTMLDivElement | null) => (() => void) | undefined
  /**
   * Attach to an open section's list wrapper, which keeps its own height (the
   * body around it is the one that is sized and scrolls). The wrapper carries
   * `data-section` with its section's id.
   */
  contentRef: (el: HTMLDivElement | null) => (() => void) | undefined
  /** Each open section's list height; absent until measured. */
  heights: Heights
}

/** An element's height with its vertical margins (the dividers have margins). */
function outerHeight(el: HTMLElement): number {
  const style = getComputedStyle(el)
  return (
    el.getBoundingClientRect().height +
    parseFloat(style.marginTop) +
    parseFloat(style.marginBottom)
  )
}

function sameHeights(a: Heights, b: Heights): boolean {
  const keys = Object.keys(a) as SidebarSection[]
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

/** @param open the open sections, top to bottom. */
export function useSectionHeights(open: SidebarSection[]): SectionHeights {
  const area = useRef<HTMLDivElement | null>(null)
  const contents = useRef(new Map<string, HTMLDivElement>())
  const observer = useRef<ResizeObserver | null>(null)
  const [heights, setHeights] = useState<Heights>({})
  // One string, so measuring follows which sections are open, not each render.
  const openKey = open.join(',')

  const measure = useCallback(() => {
    const el = area.current
    if (!el) return
    let fixed = 0
    el.querySelectorAll<HTMLElement>(
      ':scope > .sidebar-divider, :scope > .sidebar-section > .sidebar-section__header',
    ).forEach((part) => {
      fixed += outerHeight(part)
    })
    const sections = openKey ? (openKey.split(',') as SidebarSection[]) : []
    const natural = sections.map(
      (section) => contents.current.get(section)?.offsetHeight ?? 0,
    )
    const shares = distributeHeights(el.clientHeight - fixed, natural)
    const next: Heights = {}
    sections.forEach((section, i) => {
      next[section] = shares[i]
    })
    setHeights((prev) => (sameHeights(prev, next) ? prev : next))
  }, [openKey])

  // The observer outlives renders, so it calls whichever measure is current.
  const measureRef = useRef(measure)
  useEffect(() => {
    measureRef.current = measure
    // A section closing changes no size the observer sees: measure anyway.
    const frame = requestAnimationFrame(() => measureRef.current())
    return () => cancelAnimationFrame(frame)
  }, [measure])

  useEffect(() => () => observer.current?.disconnect(), [])

  const watch = useCallback((el: HTMLElement) => {
    observer.current ??= new ResizeObserver(() => measureRef.current())
    observer.current.observe(el)
    return () => observer.current?.unobserve(el)
  }, [])

  const areaRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return undefined
      area.current = el
      const stop = watch(el)
      return () => {
        stop()
        area.current = null
      }
    },
    [watch],
  )

  const contentRef = useCallback(
    (el: HTMLDivElement | null) => {
      const section = el?.dataset.section
      if (!el || !section) return undefined
      contents.current.set(section, el)
      const stop = watch(el)
      return () => {
        stop()
        contents.current.delete(section)
      }
    },
    [watch],
  )

  return { areaRef, contentRef, heights }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/components/layout/useSectionHeights.ts`
Expected: no errors, no warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/useSectionHeights.ts
git commit -m "feat(sidebar): measure the section area and each open list"
```

---

### Task 3: The sidebar uses it

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Sidebar.css`

`Sidebar.tsx` is not Prettier-formatted today: edit by hand, do not run Prettier on it.

- [ ] **Step 1: Import the hook** — after `import { SidebarColourMenu } from './SidebarColourMenu'`:

```ts
import { useSectionHeights } from './useSectionHeights'
```

- [ ] **Step 2: Give `Section` its section, height and list ref**

In `interface SectionProps`, add before `title: string`:

```ts
  /** Which section: its list wrapper says so, for the measuring. */
  section: SidebarSection
```

and before `children: React.ReactNode`:

```ts
  /** The list's height from `useSectionHeights`; until measured, its own. */
  height?: number
  /** `useSectionHeights`' ref for the list wrapper. */
  contentRef: (el: HTMLDivElement | null) => (() => void) | undefined
```

Replace the whole `function Section(...) { ... }` with:

```tsx
function Section({
  section,
  title,
  iconName,
  glyph,
  expanded,
  onToggle,
  iconStyle,
  onContextMenu,
  trailing,
  height,
  contentRef,
  children,
}: SectionProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Set by the header when it opens the list: the selected row is shown once it is open. */
  const justOpened = useRef(false)

  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section__header"
        onClick={() => {
          if (!expanded) justOpened.current = true
          onToggle()
        }}
        onContextMenu={onContextMenu}
        type="button"
      >
        <span
          className={`sidebar-section__chevron ${expanded ? '' : 'sidebar-section__chevron--collapsed'}`}
        >
          <Icon name="ChevronDown" size={14} />
        </span>
        {glyph ?? (iconName && <Icon name={iconName} size={14} style={iconStyle} />)}
        <span className="sidebar-section__title">{title}</span>
        {trailing != null && (
          <span className="sidebar-section__trailing">{trailing}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            ref={bodyRef}
            className="sidebar-section__body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: height ?? 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            onAnimationComplete={() => {
              if (!justOpened.current) return
              justOpened.current = false
              bodyRef.current
                ?.querySelector('.folder-row.selected')
                ?.scrollIntoView({ block: 'nearest' })
            }}
          >
            <div
              className="sidebar-section__content"
              data-section={section}
              ref={contentRef}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

(Every list's active row uses `folder-row selected`: folders, playlists, Spotify and YouTube Music lists.)

- [ ] **Step 3: Call the hook** — in `Sidebar`, right after `const [youtubeMusicExpanded, setYouTubeMusicExpanded] = useState(true)` (it must stay above the `if (collapsed)` return):

```tsx
  // The open sections share the height under the nav (spec: sidebar sections
  // scroll); each open list gets its share and scrolls inside.
  const openSections: SidebarSection[] = []
  if (foldersExpanded) openSections.push('folders')
  if (playlistsExpanded) openSections.push('playlists')
  if (spotify && spotifyExpanded) openSections.push('spotify')
  if (youtubeMusic && youtubeMusicExpanded) openSections.push('youtube-music')
  const { areaRef, contentRef, heights } = useSectionHeights(openSections)
```

- [ ] **Step 4: Move the nav out of the scroll area** — replace

```tsx
      {/* Scrollable content */}
      <div className="sidebar-scroll">
        {/* Top nav items */}
        <div className="sidebar-nav">
```

through the nav's closing `</div>` (just before `{/* Folders section */}`) with the nav one level up, then open the section area:

```tsx
      {/* Top nav items — they stay put; the sections share the space below */}
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.section}
            className={`sidebar-nav-item ${activeSection === item.section ? 'sidebar-nav-item--active' : ''}`}
            onClick={item.onClick}
            onContextMenu={openColourMenu(item.section)}
            type="button"
          >
            <Icon
              name={item.icon}
              size={16}
              style={iconStyle(item.section)}
            />
            <span>{item.label}</span>
            {item.count != null && item.count > 0 && (
              <span className="sidebar-nav-item__count">({item.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* The sections. Only their lists scroll; this area scrolls as a whole
          only when even three rows per open list do not fit. */}
      <div className="sidebar-scroll" ref={areaRef}>
```

The sections and dividers stay inside this `div`; its closing `</div>` (before `{colourMenuEl}`) is unchanged.

- [ ] **Step 5: Pass each section its props** — add as the first props of each `<Section`:

```tsx
          section="folders"
          height={heights.folders}
          contentRef={contentRef}
```

```tsx
          section="playlists"
          height={heights.playlists}
          contentRef={contentRef}
```

```tsx
              section="spotify"
              height={heights.spotify}
              contentRef={contentRef}
```

```tsx
              section="youtube-music"
              height={heights['youtube-music']}
              contentRef={contentRef}
```

- [ ] **Step 6: The CSS** — in `src/components/layout/Sidebar.css`, replace the block from `/* ===== Scroll area ===== */` through `.sidebar-scroll::-webkit-scrollbar-thumb { … }` with:

```css
/* ===== Section area: the sections under the nav ===== */

/* The open sections' lists share this height (useSectionHeights) and scroll
   inside themselves. The area scrolls as a whole only when even three rows
   per open list do not fit. */
.sidebar-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-scroll,
.sidebar-section__body {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.sidebar-scroll::-webkit-scrollbar,
.sidebar-section__body::-webkit-scrollbar {
  width: 4px;
}

.sidebar-scroll::-webkit-scrollbar-track,
.sidebar-section__body::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-scroll::-webkit-scrollbar-thumb,
.sidebar-section__body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}
```

Replace `.sidebar-section { /* No extra spacing — sections flow naturally */ }` with:

```css
.sidebar-section {
  /* Sized by its list's height, never by the area's flex. */
  flex-shrink: 0;
}
```

Replace the section body block with:

```css
/* ===== Section body (animated, scrolls inside) ===== */

.sidebar-section__body {
  overflow-x: hidden;
  overflow-y: auto;
}
```

Add `flex-shrink: 0;` as the first line of both `.sidebar-nav { … }` and `.sidebar-divider { … }`.

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit -p . && npx eslint src/components/layout/Sidebar.tsx src/components/layout/useSectionHeights.ts src/lib/sidebarSections.ts && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): the section headers stay in view and each open list scrolls inside"
```

---

### Task 4: Check in the app (WebKit)

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Run the app** — `npm run tauri dev`.

- [ ] **Step 2: The spec's checklist, by hand**
- Open Folders, expand the library root (dozens of folders), keep Playlists and Spotify open → all headers (and YouTube Music's, if connected) are on screen; Folders and Playlists scroll inside; Spotify shows all its lists without a scrollbar.
- Close Folders → Playlists grows smoothly; open it again → the others make room smoothly.
- Select a folder deep in the list, close Folders, open it again → the selected folder is scrolled into view.
- Shrink the window very low → each open list keeps about three rows and the section area scrolls.
- Resize the window and drag the sidebar's width → the lists follow; no jump.
- Collapse to the rail and back → the rail and its flyouts are unchanged.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add src/components/layout src/lib/sidebarSections.ts src/lib/sidebarSections.test.ts
git commit -m "fix(sidebar): <what the hand check found>"
```

Skip this step if nothing needed fixing.
