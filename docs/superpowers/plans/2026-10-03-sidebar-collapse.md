# Collapsible Sidebar and Section Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the sidebar collapse to a 60px icon rail (by hand, `⌘\`, or when the window crosses 1100px), and draw the active section's icon in a per-section colour chosen by right-click.

**Architecture:** All rules live as pure functions in `src/lib/sidebarPrefs.ts` (unit-tested). A thin hook, `useSidebarPrefs`, wires them to `localStorage`, the window, the keyboard and the `settings` table, and is called from `App.tsx`. `Sidebar.tsx` keeps rendering the full sidebar and stays the only writer of `--sidebar-width`; the collapsed rail, the flyout and the colour menu are new small components beside it.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom, no Testing Library), lucide-react via `src/components/Icon.tsx`, Tauri `get_setting`/`set_setting` through `tauriApi`.

**Spec:** `docs/superpowers/specs/2026-10-03-sidebar-collapse-design.md` (read it first).

**Branch:** `feat/sidebar-collapse`, created from `feat/spotify-section` (which carries the specs).

**Testing note:** the repo has no React Testing Library, and adding it is out of scope. Behaviour that lives in pure functions is unit-tested; rendering, tooltips, flyouts and menus are verified by hand in Task 9 against the spec's checklist.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/sidebarPrefs.ts` | create | Constants, collapse rules, section/view mapping, colour defaults, palette, parsing. Pure. |
| `src/lib/sidebarPrefs.test.ts` | create | Unit tests for the above. |
| `src/components/layout/useSidebarPrefs.ts` | create | Hook: collapsed state + storage, breakpoint crossing, `⌘\`, colours load/save. |
| `src/components/layout/SidebarColourMenu.tsx` | create | The colour block (swatches, custom, reset) placed inside a context menu. |
| `src/components/layout/SidebarFlyout.tsx` | create | Fixed-position panel beside a rail icon; closes on Escape / outside click. |
| `src/components/layout/SidebarRail.tsx` | create | The collapsed (icons-only) sidebar: icons, tooltips, flyouts. |
| `src/components/layout/Sidebar.tsx` | modify | New props; nav items as data; width var for both states; colour menu merged into the Playlists header menu; renders `SidebarRail` when collapsed. |
| `src/components/layout/Sidebar.css` | modify | Toggle, rail, tooltip, flyout, colour menu styles. |
| `src/components/layout/AppShell.css` | modify | Width transition only while toggling. |
| `src/App.tsx` | modify | Call the hook, pass its values to `Sidebar`; reuse the `ActiveView` type. |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git switch feat/spotify-section
git switch -c feat/sidebar-collapse
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass, no type errors.

---

### Task 1: Collapse rules

**Files:**
- Create: `src/lib/sidebarPrefs.ts`
- Test: `src/lib/sidebarPrefs.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/sidebarPrefs.test.ts
import { describe, expect, it } from 'vitest'
import { COLLAPSE_BELOW, collapseOnResize, initialCollapsed } from './sidebarPrefs'

describe('collapsing the sidebar', () => {
  describe('at start-up', () => {
    it('uses the stored choice on a wide window', () => {
      expect(initialCollapsed('true', 1400)).toBe(true)
      expect(initialCollapsed('false', 1400)).toBe(false)
    })

    it('starts expanded when nothing was ever stored', () => {
      expect(initialCollapsed(null, 1400)).toBe(false)
    })

    it('ignores a stored value it does not recognise', () => {
      expect(initialCollapsed('yes', 1400)).toBe(false)
    })

    it('always starts collapsed on a narrow window', () => {
      expect(initialCollapsed('false', COLLAPSE_BELOW - 1)).toBe(true)
      expect(initialCollapsed(null, 800)).toBe(true)
    })
  })

  describe('on a window resize', () => {
    it('collapses when the window crosses below the line', () => {
      expect(collapseOnResize(1200, 1000)).toBe(true)
    })

    it('expands when the window crosses back above it', () => {
      expect(collapseOnResize(1000, 1200)).toBe(false)
    })

    it('treats exactly the line as wide', () => {
      expect(collapseOnResize(COLLAPSE_BELOW - 1, COLLAPSE_BELOW)).toBe(false)
      expect(collapseOnResize(COLLAPSE_BELOW, COLLAPSE_BELOW - 1)).toBe(true)
    })

    it('leaves a manual choice alone while staying on one side', () => {
      expect(collapseOnResize(1400, 1200)).toBeNull()
      expect(collapseOnResize(900, 1000)).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: FAIL — `Failed to resolve import "./sidebarPrefs"`.

- [ ] **Step 3: Implement the rules**

```ts
// src/lib/sidebarPrefs.ts
/**
 * The sidebar's two preferences — whether it is collapsed to icons, and which
 * colour each section's icon takes while it is active — and the rules for both.
 *
 * Pure functions only. `components/layout/useSidebarPrefs.ts` wires them to
 * storage, the window and the keyboard.
 */

/** Below this window width the sidebar collapses; at it or above, it expands. */
export const COLLAPSE_BELOW = 1100

/** Width of the icons-only rail. */
export const COLLAPSED_WIDTH = 60

/** localStorage key, next to the existing `sidebar_width`. Read synchronously, so no flash. */
export const COLLAPSED_KEY = 'sidebar_collapsed'

/** Collapsed state at start-up: the stored choice, but a narrow window always starts collapsed. */
export function initialCollapsed(stored: string | null, windowWidth: number): boolean {
  if (windowWidth < COLLAPSE_BELOW) return true
  return stored === 'true'
}

/**
 * What a window resize does to the collapsed state.
 *
 * Only crossing the line acts. Resizing within one side of it changes nothing,
 * so a manual toggle stands until the next crossing. Returns the new state, or
 * null when there is nothing to change.
 */
export function collapseOnResize(prevWidth: number, nextWidth: number): boolean | null {
  const wasNarrow = prevWidth < COLLAPSE_BELOW
  const isNarrow = nextWidth < COLLAPSE_BELOW
  return wasNarrow === isNarrow ? null : isNarrow
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebarPrefs.ts src/lib/sidebarPrefs.test.ts
git commit -m "feat(sidebar): the rules for collapsing to icons"
```

---

### Task 2: Section colours

**Files:**
- Modify: `src/lib/sidebarPrefs.ts`
- Test: `src/lib/sidebarPrefs.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the test file; extend the import)

```ts
import {
  COLLAPSE_BELOW,
  DEFAULT_COLOURS,
  PALETTE,
  colourFor,
  collapseOnResize,
  initialCollapsed,
  parseColours,
  sectionForView,
} from './sidebarPrefs'

describe('section colours', () => {
  it('offers eight swatches that include every default', () => {
    expect(PALETTE).toHaveLength(8)
    for (const hex of new Set(Object.values(DEFAULT_COLOURS))) {
      expect(PALETTE).toContain(hex)
    }
  })

  it('reads stored overrides', () => {
    expect(parseColours('{"sets":"#FACC15"}')).toEqual({ sets: '#facc15' })
  })

  it('ignores unknown sections and invalid colours', () => {
    expect(
      parseColours(
        '{"sets":"orange","nope":"#ffffff","home":"#12345","search":"#2dd4bf","toString":"#ffffff"}',
      ),
    ).toEqual({ search: '#2dd4bf' })
  })

  it('treats nothing, garbage and non-objects as no overrides', () => {
    expect(parseColours(null)).toEqual({})
    expect(parseColours('not json')).toEqual({})
    expect(parseColours('["#ffffff"]')).toEqual({})
    expect(parseColours('null')).toEqual({})
  })

  it('falls back to the default when a section has no override', () => {
    expect(colourFor('sets', {})).toBe(DEFAULT_COLOURS.sets)
    expect(colourFor('sets', { sets: '#facc15' })).toBe('#facc15')
  })

  it('lights the section the active view belongs to', () => {
    expect(sectionForView('home')).toBe('home')
    expect(sectionForView('all-tracks')).toBe('all-tracks')
    expect(sectionForView('folder')).toBe('folders')
    expect(sectionForView('playlist')).toBe('playlists')
    expect(sectionForView('sets')).toBe('sets')
  })

  it('lights nothing for Settings', () => {
    expect(sectionForView('settings')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: FAIL — `DEFAULT_COLOURS` (and the others) are not exported.

- [ ] **Step 3: Implement** (append to `src/lib/sidebarPrefs.ts`)

```ts
/** settings-table key holding the colour overrides, as JSON: section → hex. */
export const COLOURS_KEY = 'sidebar_colours'

export type SidebarSection =
  | 'home'
  | 'sets'
  | 'all-tracks'
  | 'search'
  | 'ai-chat'
  | 'folders'
  | 'playlists'
  | 'spotify'

/** The views App.tsx can be showing. */
export type ActiveView =
  | 'home'
  | 'all-tracks'
  | 'folder'
  | 'playlist'
  | 'settings'
  | 'search'
  | 'ai-chat'
  | 'sets'

export type ColourOverrides = Partial<Record<SidebarSection, string>>

export const DEFAULT_COLOURS: Record<SidebarSection, string> = {
  home: '#60a5fa',
  sets: '#fb923c',
  'all-tracks': '#818cf8',
  search: '#2dd4bf',
  'ai-chat': '#818cf8',
  folders: '#a78bfa',
  playlists: '#f472b6',
  spotify: '#1ed760',
}

/** The right-click menu's swatches: every default, plus yellow. */
export const PALETTE = [
  '#60a5fa',
  '#fb923c',
  '#818cf8',
  '#2dd4bf',
  '#a78bfa',
  '#f472b6',
  '#1ed760',
  '#facc15',
] as const

const HEX = /^#[0-9a-f]{6}$/i

/** Stored overrides. Unknown sections and invalid colours are dropped, never thrown. */
export function parseColours(raw: string | null): ColourOverrides {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}

  const overrides: ColourOverrides = {}
  for (const [key, value] of Object.entries(data)) {
    const known = Object.prototype.hasOwnProperty.call(DEFAULT_COLOURS, key)
    if (known && typeof value === 'string' && HEX.test(value)) {
      overrides[key as SidebarSection] = value.toLowerCase()
    }
  }
  return overrides
}

export function colourFor(section: SidebarSection, overrides: ColourOverrides): string {
  return overrides[section] ?? DEFAULT_COLOURS[section]
}

/** The section whose icon is lit while a view is showing. Settings lights nothing. */
export function sectionForView(view: ActiveView): SidebarSection | null {
  switch (view) {
    case 'folder':
      return 'folders'
    case 'playlist':
      return 'playlists'
    case 'settings':
      return null
    default:
      return view
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebarPrefs.ts src/lib/sidebarPrefs.test.ts
git commit -m "feat(sidebar): section colours, their defaults and the swatches"
```

---

### Task 3: The hook

**Files:**
- Create: `src/components/layout/useSidebarPrefs.ts`

No unit test (it only wires tested rules to the browser); verified in Task 9.

- [ ] **Step 1: Write the hook**

```ts
// src/components/layout/useSidebarPrefs.ts
// Wires the sidebar's rules (lib/sidebarPrefs.ts) to localStorage, the window,
// the keyboard and the settings table. Called once, from App.tsx.
import { useCallback, useEffect, useRef, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import {
  COLLAPSED_KEY,
  COLOURS_KEY,
  collapseOnResize,
  initialCollapsed,
  parseColours,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'

function readStored(): string | null {
  try {
    return localStorage.getItem(COLLAPSED_KEY)
  } catch {
    return null
  }
}

function writeStored(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Storage can be unavailable; the state still works for this session.
  }
}

export interface SidebarPrefs {
  collapsed: boolean
  toggleCollapsed: () => void
  colours: ColourOverrides
  setColour: (section: SidebarSection, hex: string) => void
  resetColour: (section: SidebarSection) => void
}

export function useSidebarPrefs(): SidebarPrefs {
  const [collapsed, setCollapsedState] = useState(() =>
    initialCollapsed(readStored(), window.innerWidth),
  )

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    writeStored(next)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  // Only crossing the breakpoint acts — and it is stored exactly like a toggle.
  useEffect(() => {
    let prev = window.innerWidth
    const onResize = () => {
      const next = window.innerWidth
      const change = collapseOnResize(prev, next)
      prev = next
      if (change !== null) setCollapsed(change)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setCollapsed])

  // ⌘\ on macOS, Ctrl+\ elsewhere. Re-subscribes on each toggle; that is fine.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      toggleCollapsed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  // Colours: defaults until the stored overrides arrive.
  const [colours, setColours] = useState<ColourOverrides>({})

  useEffect(() => {
    let cancelled = false
    tauriApi
      .getSetting(COLOURS_KEY)
      .then((raw) => {
        if (!cancelled) setColours(parseColours(raw))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Saved only after the user changed something — never the initial load —
  // and debounced, because the system colour picker reports every step of a
  // drag. The ref is written in event handlers only, never during render.
  const changedByUser = useRef(false)
  useEffect(() => {
    if (!changedByUser.current) return
    const timer = setTimeout(() => {
      tauriApi.setSetting(COLOURS_KEY, JSON.stringify(colours)).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [colours])

  const setColour = useCallback((section: SidebarSection, hex: string) => {
    changedByUser.current = true
    setColours((prev) => ({ ...prev, [section]: hex.toLowerCase() }))
  }, [])

  const resetColour = useCallback((section: SidebarSection) => {
    changedByUser.current = true
    setColours((prev) => {
      const next = { ...prev }
      delete next[section]
      return next
    })
  }, [])

  return { collapsed, toggleCollapsed, colours, setColour, resetColour }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/components/layout/useSidebarPrefs.ts`
Expected: no errors. (The repo's react-hooks rules forbid writing a ref during render — that is why the hook has no "latest value" refs.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/useSidebarPrefs.ts
git commit -m "feat(sidebar): a hook that remembers the collapsed state and the colours"
```

---

### Task 4: Wire it through App, and own the width in both states

**Files:**
- Modify: `src/App.tsx` (the `activeView` declaration at ~1232 and `sidebarEl` at ~1256)
- Modify: `src/components/layout/Sidebar.tsx` (props, the mount effect at lines 172–189)
- Modify: `src/components/layout/AppShell.css`

- [ ] **Step 1: Sidebar — new props and types**

In `Sidebar.tsx`, add the import and replace the inline `activeView` union with the shared type:

```ts
import {
  COLLAPSED_WIDTH,
  type ActiveView,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'
```

In `SidebarProps`, replace the `activeView: | 'home' | … | 'sets'` block with `activeView: ActiveView` and add:

```ts
  collapsed: boolean
  onToggleCollapsed: () => void
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
```

Destructure only `collapsed` for now. Each other new prop is destructured in the task that first uses it (`onToggleCollapsed` and `colours` in Task 5, `onSetColour` and `onResetColour` in Task 8), so the typecheck never sees an unused binding.

- [ ] **Step 2: Sidebar — one width effect for both states**

Replace the "On mount: restore sidebar width from localStorage" effect (lines 172–189) with:

```ts
  // Sidebar.tsx is the only writer of --sidebar-width: the dragged width when
  // full, the rail when collapsed. Only a toggle animates — never a drag.
  // A layout effect, so the first paint already has the right width.
  const firstWidthRun = useRef(true)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      '--sidebar-width',
      `${collapsed ? COLLAPSED_WIDTH : readStoredWidth()}px`,
    )
    if (firstWidthRun.current) {
      firstWidthRun.current = false
      return
    }
    root.classList.add('sidebar-width-animating')
    const timer = setTimeout(
      () => root.classList.remove('sidebar-width-animating'),
      200,
    )
    return () => {
      clearTimeout(timer)
      root.classList.remove('sidebar-width-animating')
    }
  }, [collapsed])
```

Add `useLayoutEffect` to the `react` import, and add this helper under the constants at the top of the file:

```ts
/** The width the user dragged the full sidebar to, or the default. */
function readStoredWidth(): number {
  const width = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10)
  return !isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH
    ? width
    : DEFAULT_WIDTH
}
```

- [ ] **Step 3: AppShell.css — animate only while toggling**

Append:

```css
/* Set on <html> by Sidebar.tsx for ~200ms around a collapse/expand only, so
   dragging the sidebar's edge never lags behind the mouse. */
.sidebar-width-animating .app-shell {
  transition: grid-template-columns 150ms ease;
}
```

- [ ] **Step 4: App.tsx — call the hook and pass it down**

Add the imports:

```ts
import { useSidebarPrefs } from './components/layout/useSidebarPrefs'
import type { ActiveView } from './lib/sidebarPrefs'
```

Inside the `App` component, next to the other top-level hooks (near `const folderTreeRef = useRef<FolderTreeRef>(null)` at ~119):

```ts
  const sidebarPrefs = useSidebarPrefs()
```

Replace the `activeView` type annotation (the `| 'home' | … | 'sets'` union at ~1232) with `const activeView: ActiveView = showSettings` (the expression stays as it is).

In `sidebarEl`, after `activeView={activeView}`, add:

```tsx
      collapsed={sidebarPrefs.collapsed}
      onToggleCollapsed={sidebarPrefs.toggleCollapsed}
      colours={sidebarPrefs.colours}
      onSetColour={sidebarPrefs.setColour}
      onResetColour={sidebarPrefs.resetColour}
```

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/AppShell.css
git commit -m "feat(sidebar): pass the collapsed state and colours down, and own the width in both"
```

---

### Task 5: Nav items as data, the toggle, and active colours

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Sidebar.css`

- [ ] **Step 1: Section gets an icon colour**

In `SectionProps` add `iconStyle?: React.CSSProperties`, destructure it, and change the header icon to:

```tsx
        <Icon name={iconName} size={14} style={iconStyle} />
```

- [ ] **Step 2: Build the nav items and the colour helpers**

Add to the imports from `../../lib/sidebarPrefs`: `colourFor`, `sectionForView`, and destructure `onToggleCollapsed` and `colours` in the `Sidebar({ … })` parameter list. Then, inside `Sidebar` before `return`:

```tsx
  const activeSection = sectionForView(activeView)
  const iconStyle = (section: SidebarSection): React.CSSProperties | undefined =>
    activeSection === section ? { color: colourFor(section, colours) } : undefined

  const navItems: NavItem[] = [
    { section: 'home', label: 'Home', icon: 'House', onClick: onNavigateHome },
    ...(onNavigateSets
      ? [
          {
            section: 'sets' as const,
            label: 'Sets',
            // Not ListMusic (playlists) and not Disc3 (folders) — both are
            // already in this sidebar. A set is a broadcast of a performance,
            // which is the one thing nothing else here is.
            icon: 'Radio' as const,
            onClick: onNavigateSets,
          },
        ]
      : []),
    {
      section: 'all-tracks',
      label: 'All Tracks',
      icon: 'Music',
      onClick: onShowAllTracks,
      count: totalTrackCount,
    },
    { section: 'search', label: 'Search', icon: 'Search', onClick: () => onSearch?.() },
    ...(onNavigateAIChat
      ? [
          {
            section: 'ai-chat' as const,
            label: 'AI Chat',
            icon: 'MessageSquare' as const,
            onClick: onNavigateAIChat,
          },
        ]
      : []),
  ]
```

and above `SidebarProps`, export the item shape (the rail uses it too):

```ts
export interface NavItem {
  section: SidebarSection
  label: string
  icon: IconName
  onClick: () => void
  count?: number
}
```

- [ ] **Step 3: Render the nav from the data**

Replace the whole `<div className="sidebar-nav">…</div>` block (Home through AI Chat) with:

```tsx
        <div className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.section}
              className={`sidebar-nav-item ${activeSection === item.section ? 'sidebar-nav-item--active' : ''}`}
              onClick={item.onClick}
              type="button"
            >
              <Icon name={item.icon} size={16} style={iconStyle(item.section)} />
              <span>{item.label}</span>
              {item.count != null && item.count > 0 && (
                <span className="sidebar-nav-item__count">({item.count})</span>
              )}
            </button>
          ))}
        </div>
```

and pass `iconStyle={iconStyle('folders')}` / `iconStyle={iconStyle('playlists')}` to the two `<Section>`s.

- [ ] **Step 4: The toggle**

In the top area, after the avatar `<button>`, add:

```tsx
        <button
          className="sidebar-top__toggle"
          onClick={onToggleCollapsed}
          type="button"
          title="Collapse sidebar (⌘\)"
          aria-label="Collapse sidebar"
        >
          <Icon name="PanelLeft" size={14} />
        </button>
```

Append to `Sidebar.css`:

```css
/* ===== Collapse toggle — quiet until hovered ===== */

.sidebar-top__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s;
}

.sidebar-top__toggle:hover {
  color: var(--text-primary);
}
```

- [ ] **Step 5: Typecheck, test, look**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: pass.
Run the app (`npm run tauri dev`), open All Tracks: its note icon is indigo; open Sets: the radio icon is orange; open a playlist: the PLAYLISTS header icon is pink; open Settings: no icon is coloured. The toggle shows to the right of the profile icon and does not work yet visually beyond the width change (the full sidebar squeezes into 60px until Task 7; do not drag its edge meanwhile — that would overwrite the stored width).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): active section icons take their colour, and a collapse toggle"
```

---

### Task 6: The flyout

**Files:**
- Create: `src/components/layout/SidebarFlyout.tsx`
- Modify: `src/components/layout/Sidebar.css`

- [ ] **Step 1: Write the component**

```tsx
// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// No transform on it or its ancestors: FolderTree's own menus are
// position: fixed, and a transformed ancestor would misplace them.
import { useEffect, useRef, type ReactNode } from 'react'

interface SidebarFlyoutProps {
  title: string
  top: number
  left: number
  /** The icon that opened it — clicking it again must not count as "outside". */
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
}

export function SidebarFlyout({
  title,
  top,
  left,
  anchor,
  onClose,
  children,
}: SidebarFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={ref}
      className="sidebar-flyout"
      style={{ top, left, maxHeight: window.innerHeight - top - 16 }}
      role="dialog"
      aria-label={title}
    >
      <div className="sidebar-flyout__title">{title}</div>
      <div className="sidebar-flyout__body">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Styles** (append to `Sidebar.css`)

```css
/* ===== Flyout beside a rail icon ===== */

.sidebar-flyout {
  position: fixed;
  z-index: 250;
  width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  padding: 6px 0;
  animation: sidebar-flyout-in 120ms ease-out;
}

/* Opacity only — see the note in SidebarFlyout.tsx. */
@keyframes sidebar-flyout-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.sidebar-flyout__title {
  padding: 4px 14px 6px;
  color: var(--text-secondary);
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sidebar-flyout__body {
  overflow-y: auto;
  min-height: 0;
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

```bash
git add src/components/layout/SidebarFlyout.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): a flyout panel for sections in the icon rail"
```

---

### Task 7: The rail

**Files:**
- Create: `src/components/layout/SidebarRail.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Sidebar.css`

- [ ] **Step 1: Write the rail**

```tsx
// src/components/layout/SidebarRail.tsx
// The sidebar collapsed to icons: nav items, Folders and Playlists as icons
// that open flyouts, tooltips after a short hover, the profile at the bottom.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import type { SidebarSection } from '../../lib/sidebarPrefs'
import type { NavItem } from './Sidebar'
import { SidebarFlyout } from './SidebarFlyout'

type FlyoutSection = 'folders' | 'playlists'

interface SidebarRailProps {
  navItems: NavItem[]
  activeSection: SidebarSection | null
  iconStyle: (section: SidebarSection) => React.CSSProperties | undefined
  /** Right-click handler factory; `withCreate` adds Create Playlist / Folder. */
  onColourMenu: (section: SidebarSection, withCreate?: boolean) => (e: React.MouseEvent) => void
  onToggleCollapsed: () => void
  onOpenSettings: () => void
  settingsActive: boolean
  /** Section contents for the flyouts; `close` is called after a navigation. */
  renderSection: (section: FlyoutSection, close: () => void) => ReactNode
}

const TOOLTIP_DELAY_MS = 400

export function SidebarRail({
  navItems,
  activeSection,
  iconStyle,
  onColourMenu,
  onToggleCollapsed,
  onOpenSettings,
  settingsActive,
  renderSection,
}: SidebarRailProps) {
  // --- Tooltip ---
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showTip = (label: string) => (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(tipTimer.current)
    tipTimer.current = setTimeout(
      () => setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 8 }),
      TOOLTIP_DELAY_MS,
    )
  }
  const hideTip = () => {
    clearTimeout(tipTimer.current)
    setTip(null)
  }
  useEffect(() => () => clearTimeout(tipTimer.current), [])

  // --- Flyout ---
  const [flyout, setFlyout] = useState<{
    section: FlyoutSection
    top: number
    left: number
    anchor: HTMLElement
  } | null>(null)
  const closeFlyout = useCallback(() => setFlyout(null), [])

  const toggleFlyout = (section: FlyoutSection) => (e: React.MouseEvent<HTMLElement>) => {
    hideTip()
    if (flyout?.section === section) {
      setFlyout(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyout({ section, top: rect.top, left: rect.right + 6, anchor: e.currentTarget })
  }

  const sectionButton = (section: FlyoutSection, label: string, icon: 'Disc3' | 'ListMusic') => (
    <button
      className={`sidebar-rail__item ${activeSection === section || flyout?.section === section ? 'sidebar-rail__item--active' : ''}`}
      onClick={toggleFlyout(section)}
      onContextMenu={onColourMenu(section, section === 'playlists')}
      onMouseEnter={flyout ? undefined : showTip(label)}
      onMouseLeave={hideTip}
      aria-label={label}
      type="button"
    >
      <Icon name={icon} size={16} style={iconStyle(section)} />
    </button>
  )

  return (
    <div className="sidebar sidebar--rail">
      <div className="sidebar-rail__top">
        <span className="sidebar-rail__wordmark" aria-label="RecoDeck">
          RECO
          <br />
          DECK
        </span>
        <button
          className="sidebar-top__toggle"
          onClick={onToggleCollapsed}
          type="button"
          title="Expand sidebar (⌘\)"
          aria-label="Expand sidebar"
        >
          <Icon name="PanelLeft" size={14} />
        </button>
      </div>

      <div className="sidebar-rail__nav">
        {navItems.map((item) => (
          <button
            key={item.section}
            className={`sidebar-rail__item ${activeSection === item.section ? 'sidebar-rail__item--active' : ''}`}
            onClick={item.onClick}
            onContextMenu={onColourMenu(item.section)}
            onMouseEnter={showTip(item.label)}
            onMouseLeave={hideTip}
            aria-label={item.label}
            type="button"
          >
            <Icon name={item.icon} size={16} style={iconStyle(item.section)} />
          </button>
        ))}
        <span className="sidebar-rail__divider" />
        {sectionButton('folders', 'Folders', 'Disc3')}
        {sectionButton('playlists', 'Playlists', 'ListMusic')}
      </div>

      <button
        className={`sidebar-top__avatar sidebar-rail__avatar ${settingsActive ? 'sidebar-top__avatar--active' : ''}`}
        onClick={onOpenSettings}
        type="button"
        title="Settings"
      >
        <Icon name="User" size={16} />
      </button>

      {tip && (
        <div className="sidebar-tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      )}

      {flyout && (
        <SidebarFlyout
          title={flyout.section === 'folders' ? 'Folders' : 'Playlists'}
          top={flyout.top}
          left={flyout.left}
          anchor={flyout.anchor}
          onClose={closeFlyout}
        >
          {renderSection(flyout.section, closeFlyout)}
        </SidebarFlyout>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render it from Sidebar when collapsed**

In `Sidebar.tsx`, import `SidebarRail`. Gather the FolderTree props shared by both trees into one object before `return` (they are identical today except `section` and the ref):

```tsx
  const treeProps = {
    libraryFolders,
    playlists,
    selectedFolder,
    selectedPlaylistId,
    totalTrackCount,
    onFolderSelect,
    onPlaylistSelect,
    onAnalyzeFolder,
    onAnalyzeAll,
    onCreatePlaylist,
    onCreateFolder,
    onRenamePlaylist,
    onDeletePlaylist,
    onSharePlaylist,
    onExportPlaylist,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
  }
```

and use it in the two existing trees: `<FolderTree ref={folderTreeRef} {...treeProps} section="folders" />` and `<FolderTree {...treeProps} section="playlists" />`.

Then wrap the existing `return (` so the full sidebar is the `else` branch:

```tsx
  if (collapsed) {
    return (
      <>
        <SidebarRail
          navItems={navItems}
          activeSection={activeSection}
          iconStyle={iconStyle}
          onColourMenu={openColourMenu}
          onToggleCollapsed={onToggleCollapsed}
          onOpenSettings={onOpenSettings}
          settingsActive={activeView === 'settings'}
          renderSection={(section, close) => (
            // Navigating closes the flyout; expanding a playlist folder does
            // not, because FolderTree handles that without calling these.
            <FolderTree
              ref={section === 'folders' ? folderTreeRef : undefined}
              {...treeProps}
              section={section}
              onFolderSelect={(path) => {
                onFolderSelect(path)
                close()
              }}
              onPlaylistSelect={(id) => {
                onPlaylistSelect(id)
                close()
              }}
            />
          )}
        />
        {colourMenuEl}
        {toastEl}
      </>
    )
  }
```

The toast ("Added to …", "Removed from playlist") must still show while collapsed. Lift the existing `<AnimatePresence>{toastMessage && …}</AnimatePresence>` block into a `const toastEl = (…)` before `return`, render `{toastEl}` where it was in the full sidebar, and give the `motion.div` the class `sidebar-toast ${collapsed ? 'sidebar-toast--rail' : ''}`.

`openColourMenu` and `colourMenuEl` are added in Task 8; until then, temporarily pass `onColourMenu={() => () => {}}` and omit `{colourMenuEl}` so this task compiles on its own.

- [ ] **Step 3: Rail and tooltip styles** (append to `Sidebar.css`)

```css
/* ===== Icon rail (collapsed) ===== */

.sidebar--rail {
  align-items: center;
}

.sidebar-rail__top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0 10px;
  width: 100%;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

/* There is no small logo asset; the wordmark is text. */
.sidebar-rail__wordmark {
  font-weight: 900;
  font-size: 11px;
  line-height: 0.92;
  letter-spacing: -0.4px;
  text-align: center;
  color: var(--text-primary);
}

.sidebar-rail__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.sidebar-rail__item {
  position: relative;
  width: 40px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.sidebar-rail__item:hover,
.sidebar-rail__item--active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sidebar-rail__divider {
  width: 28px;
  height: 1px;
  background: var(--border);
  margin: 4px 0;
  flex-shrink: 0;
}

.sidebar-rail__avatar {
  margin: 10px 0 12px;
}

/* In the rail the toast would be 60px wide; float it beside the rail instead. */
.sidebar-toast--rail {
  position: fixed;
  left: calc(var(--sidebar-width) + 12px);
  right: auto;
  bottom: 96px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}

/* ===== Tooltip (rail) — fixed, so the sidebar's overflow cannot clip it ===== */

.sidebar-tooltip {
  position: fixed;
  z-index: 260;
  transform: translateY(-50%);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: var(--text-xs, 11px);
  white-space: nowrap;
  pointer-events: none;
}
```

- [ ] **Step 4: Typecheck, test, look**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: pass.
In the app: adding a track to a playlist while collapsed shows the toast beside the rail; the toggle collapses to the rail and back, the dragged width returns on expand, the drag handle is absent in the rail, `⌘\` toggles, hovering an icon shows its name after a moment, Folders/Playlists open flyouts, clicking a playlist navigates and closes it, clicking a playlist folder expands it in place, Escape and an outside click close it.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SidebarRail.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): collapse to an icon rail, with tooltips and section flyouts"
```

---

### Task 8: The colour menu on right-click

**Files:**
- Create: `src/components/layout/SidebarColourMenu.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (the Playlists header context menu, lines 147–159 and 366–396)
- Modify: `src/components/layout/Sidebar.css`

- [ ] **Step 1: Write the colour block**

```tsx
// src/components/layout/SidebarColourMenu.tsx
// The colour block of a sidebar section's right-click menu.
import { Icon } from '../Icon'
import { PALETTE } from '../../lib/sidebarPrefs'

interface SidebarColourMenuProps {
  label: string
  current: string
  onPick: (hex: string) => void
  /** Called on every change of the system picker; the caller keeps the menu open. */
  onCustom: (hex: string) => void
  onReset: () => void
}

export function SidebarColourMenu({
  label,
  current,
  onPick,
  onCustom,
  onReset,
}: SidebarColourMenuProps) {
  return (
    <div className="sidebar-colour-menu">
      <div className="sidebar-colour-menu__title">{label} · icon colour</div>
      <div className="sidebar-colour-menu__swatches">
        {PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            className={`sidebar-colour-menu__swatch ${current === hex ? 'sidebar-colour-menu__swatch--current' : ''}`}
            style={{ background: hex }}
            onClick={() => onPick(hex)}
            aria-label={`Use ${hex}`}
          />
        ))}
      </div>
      <label className="sidebar-ctx-menu__item">
        <Icon name="Pipette" size={14} />
        Custom colour…
        <input
          type="color"
          className="sidebar-colour-menu__picker"
          value={current}
          onChange={(e) => onCustom(e.target.value)}
        />
      </label>
      <button type="button" className="sidebar-ctx-menu__item" onClick={onReset}>
        <Icon name="RotateCcw" size={14} />
        Reset to default
      </button>
    </div>
  )
}
```

- [ ] **Step 2: One menu state for every section**

In `Sidebar.tsx`, import `SidebarColourMenu`, and change the context-menu state (line 148) to carry the section:

```ts
  // Right-click menu: a section's colour, plus Create Playlist / Folder on Playlists.
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    section: SidebarSection
    withCreate: boolean
  } | null>(null)
```

Keep the existing outside-click effect. Destructure `onSetColour` and `onResetColour`. At module level, under the constants:

```ts
const SECTION_LABELS: Record<SidebarSection, string> = {
  home: 'Home',
  sets: 'Sets',
  'all-tracks': 'All Tracks',
  search: 'Search',
  'ai-chat': 'AI Chat',
  folders: 'Folders',
  playlists: 'Playlists',
  spotify: 'Spotify',
}
```

Then, inside `Sidebar` before `return`:

```tsx
  const openColourMenu =
    (section: SidebarSection, withCreate = false) =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      setCtxMenu({ x: e.clientX, y: e.clientY, section, withCreate })
    }

  const colourMenuEl = ctxMenu && (
    <div
      ref={ctxRef}
      className="sidebar-ctx-menu"
      style={{ top: ctxMenu.y, left: ctxMenu.x }}
    >
      <SidebarColourMenu
        label={SECTION_LABELS[ctxMenu.section]}
        current={colourFor(ctxMenu.section, colours)}
        onPick={(hex) => {
          onSetColour(ctxMenu.section, hex)
          setCtxMenu(null)
        }}
        onCustom={(hex) => onSetColour(ctxMenu.section, hex)}
        onReset={() => {
          onResetColour(ctxMenu.section)
          setCtxMenu(null)
        }}
      />
      {ctxMenu.withCreate && (
        <>
          <div className="sidebar-ctx-menu__sep" />
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => {
              onCreatePlaylist(null)
              setCtxMenu(null)
            }}
            type="button"
          >
            <Icon name="Plus" size={14} />
            Create Playlist
          </button>
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => {
              onCreateFolder(null)
              setCtxMenu(null)
            }}
            type="button"
          >
            <Icon name="FolderPlus" size={14} />
            Create Folder
          </button>
        </>
      )}
    </div>
  )
```

Replace the old `{/* Playlists header context menu */} {ctxMenu && (…)}` block in the full sidebar with `{colourMenuEl}`.

- [ ] **Step 3: Hook it up**

- Full sidebar nav buttons: add `onContextMenu={openColourMenu(item.section)}`.
- Folders `<Section>`: add `onContextMenu={openColourMenu('folders')}`.
- Playlists `<Section>`: replace its inline `onContextMenu` with `onContextMenu={openColourMenu('playlists', true)}`.
- Rail (Task 7): replace the temporary `onColourMenu={() => () => {}}` with `onColourMenu={openColourMenu}` and render `{colourMenuEl}` after `<SidebarRail …/>` as shown there.

- [ ] **Step 4: Styles** (append to `Sidebar.css`)

```css
/* ===== Colour block in the right-click menu ===== */

.sidebar-colour-menu__title {
  padding: 6px 12px 8px;
  color: var(--text-secondary);
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sidebar-colour-menu__swatches {
  display: grid;
  grid-template-columns: repeat(8, 20px);
  gap: 6px;
  padding: 0 12px 8px;
}

.sidebar-colour-menu__swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.sidebar-colour-menu__swatch--current {
  border-color: var(--text-primary);
  box-shadow: inset 0 0 0 2px var(--bg-tertiary);
}

/* Hidden but clickable through its label, which opens the system picker. */
.sidebar-colour-menu__picker {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.sidebar-ctx-menu__sep {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
```

Also give `.sidebar-ctx-menu` `min-width: 236px` (it holds eight swatches now).

- [ ] **Step 5: Typecheck, test, look**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: pass.
In the app: right-click Sets → the colour block; pick yellow → with Sets open its icon is yellow; **Custom colour…** opens the system picker and the icon follows it; **Reset to default** brings orange back; right-click the PLAYLISTS header → colours, a separator, then Create Playlist and Create Folder, both still working; the same menus in the rail; restart the app → the colours are still there.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/SidebarColourMenu.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(sidebar): pick a section's icon colour by right-clicking it"
```

---

### Task 9: Verify against the spec

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Automated checks**

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src/components/layout src/lib/sidebarPrefs.ts`
Expected: all pass, no lint errors.

- [ ] **Step 2: The spec's checklist, by hand** (`npm run tauri dev`)

- Drag the sidebar wider, collapse, expand → the dragged width returns.
- Drag while expanded → the edge follows the mouse without lag.
- Shrink the window across 1100px → collapses; widen across it → expands.
- Toggle by hand while on one side of 1100px, then resize on that same side → the choice stands.
- Quit and relaunch on a wide window → the collapsed state is as left; on a narrow window → starts collapsed. No flash of the wrong width.
- Every section's right-click menu works in both widths; the Playlists one still creates playlists and folders.
- Flyouts: leaf click navigates and closes; playlist folders expand; a playlist's own right-click menu inside the flyout appears at the cursor.
- Settings view: no section icon is coloured.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add -A src/components/layout src/lib/sidebarPrefs.ts src/lib/sidebarPrefs.test.ts
git commit -m "fix(sidebar): <what the hand check found>"
```

Skip this step if nothing needed fixing.
