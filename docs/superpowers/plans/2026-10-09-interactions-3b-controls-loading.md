# Interactions I3b: Controls and Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last of the Interactions spec. The shared button classes get their missing variants and a `Button` component with a working state. Settings, the DJ pages and the modals move onto them, and the page-specific button styles go. Lists that are still reading show skeletons, after 150ms. Buttons show on Dawn's white.

**Architecture:**
- **Controls** (`src/styles/controls.css`): `.btn--icon` (square, quiet until hovered), `.btn--pill` (22px), `.btn[aria-pressed='true']` (a toggle that is on), `.btn--icon.btn--danger` (red only while hovered), the working state (`.btn__spinner`, `[aria-busy]`), a disabled button that keeps its pointer events (so its title still says why), and `--btn-bg` — `.btn` and its hover / press / open mixes start from `var(--btn-bg, var(--bg-elevated))`; Dawn sets it to its tertiary grey (`globals.css`), since its raised colour is the page's white. Loading's `.skeleton` shimmer, `SkeletonRows`' layout and `.content-in` (a 4px rise, slow) live here too, as shared pieces.
- **Components**: `src/components/Button.tsx` (`variant`, `size`, `icon`, `working`, `workingLabel`); `src/components/Skeleton.tsx` (`Skeleton`, one block; `SkeletonRows`, a list); `src/lib/useShowAfter.ts` (tested: false until 150ms after mount — a fast read never flashes a skeleton).
- **The sweep**: the Settings sections, the modals (the name prompt, What's New, Share, Export, Duplicates, the track table's genre and comment dialogs, App's Delete folder) and the DJ pages use `btn` / `Button`; `btn-primary`, `btn-secondary`, `btn-icon`, `btn-small`, `modal-button`, `dj-btn` and `dj-pill` and their styles (`App.css`, `SettingsView.css`, `TrackTable.css`, `DjView.css`) go. The set page's "have it" is `.btn--pill` in its green; its rows' skeleton and a DJ's Tracks skeleton keep their own columns, with the shared shimmer and the delay.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Vitest (jsdom, React's `act`).

**Spec:** `docs/superpowers/specs/2026-10-04-interactions-design.md` — "Controls", "Loading", and the I1 / I2 / I3a notes. This is the last Interactions plan; after it the redesign is complete and goes out as one release.

**Branch:** `feat/redesign`. No release here — the release is the next step, after the user's go-ahead.

**Decisions, beyond the spec's letter** (Task 7 writes them into the spec):
- **`.btn--icon` is quiet** (no fill until hovered): icon buttons sit in rows (a library folder's Rescan and Remove, a key's Show), where a filled square on every row would be noise. With `.btn--danger` it stays quiet and turns red only while hovered.
- **`--btn-bg`** fixes the Dawn contrast once, for every `.btn`: a theme whose raised colour equals its page's sets it. The spots that already mixed a button colour on a card (the menu's question, the update prompt) keep their own rule.
- **The working state** keeps the button's width honest: the label is the -ing form ("Saving…", "Scanning…", "Exporting…", "Checking…" / "Downloading…", "Starting…" / "Stopping…", "Testing…", "Reading…"), with a spinner in the icon's place, `aria-busy`, and 75% opacity instead of disabled's 40%, so it reads as working, not unavailable. The connect buttons that may be pressed again while a login waits ("Waiting for Spotify… (try again)") stay plain buttons — they are not disabled while working.
- **Delete folder and all files** and **Delete selected** (duplicates) are `.btn--danger`; "Remove from library only" and Cancel are plain.
- **The DJ hero's buttons** keep their glass over the photo — a rule on `.dj-hero__acts .btn` (a context, not a page-specific button) — and Watch is a toggle (`aria-pressed`) instead of a `--on` class. The overview editor's add-card chips become `.btn--sm`.
- **Skeletons that keep their columns**: a DJ's Tracks table (`TrackRowsSkeleton`) and the set page (`RowsSkeleton`) draw skeleton rows in the table's own grid; they take the shared `.skeleton` shimmer and `useShowAfter`, not `SkeletonRows`. Every skeleton is drawn from the start but hidden until 150ms, so it holds its place and nothing shifts when it appears. `SkeletonRows` (a cover and two lines) is for a list without columns: a DJ's Overview tracks card. Companion's QR code waits as a `Skeleton` block. The shimmer stops under reduced motion.
- **Disabled buttons keep their pointer events** (`cursor: not-allowed` instead of `pointer-events: none`): Connect's "Save the Client ID first" and "Choose the client file first" are titles shown only while disabled, and the only word on why.
- **Left as they are**: the AI panels' own buttons (`AI_ENABLED = false`); the busy states that are not buttons (the Sets box's "Reading…", a playlist's "Reading the playlist…"); a `custom` theme gets no `--btn-bg` (it cannot know whether it is light); the DJ hero's glass has no press or open shade, as `.dj-btn` had none.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `d60986d`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` and each task's tests pass at every task's end.
- **Builds and tests:**
  - No Rust change. `vitest`: 3 new. The repo counts 666 after it: 665 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`).
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline; `vite build` passes.
  - `grep -rn "btn-primary\|btn-secondary\|btn-icon\|btn-small\|modal-button\|dj-btn\|dj-pill" src --include='*.tsx'` finds only the AI panels' own `mix-prep-btn-*`.
- **In WebKit** (a test page with the shared controls, the real SettingsView with mocks, the export dialog and the name prompt), in Midnight and Dawn:
  - the gallery: default, primary, danger, small, a toggle on, disabled, two icon buttons (one destructive), "have it", and a working button — on Dawn the default button is `rgb(240, 240, 240)` on the white page (it was the page's own white);
  - a working Analyze: "Analyzing…", a spinner, `aria-busy`, disabled; done: "Analyze" again;
  - `SkeletonRows`: hidden at 60ms but already 138px high, visible at 260ms, the same height, `role="status"`;
  - Settings with Library, AI, YouTube and Companion open: no legacy class, 22 shared buttons; Rescan All: "Scanning…" until the scan ends; the folder row's Rescan and ✕ are quiet icons;
  - the export dialog: Export → "Exporting…" with its spinner, Cancel disabled, then done; the name prompt: Cancel and OK on `.btn` / `.btn--primary`;
  - I1's, S4's and S3's scenarios still pass on this copy (the set page's "have it" and its skeleton included).

**Reviewed:** an independent review found no blocker; its points are folded in above and checked:
- **A disabled button's title** (why Connect is disabled) never showed: `.btn:disabled` had `pointer-events: none`, new to these buttons → `cursor: not-allowed`, with no press scale.
- **"have it"** lost its green text on hover (`.btn:hover`'s colour) → its hover keeps the colour.
- **Skeletons** rendered nothing for 150ms, so the area collapsed and then jumped → drawn from the start, hidden until shown. DjTracksTab's local `SkeletonRows` is now `TrackRowsSkeleton`, apart from `Skeleton.tsx`'s.
- Checked and kept: every disabled condition moved into `Button` unchanged (`disabled || working`); `--btn-bg` turns no overridden button invisible; PromptModal's OK stays a submit.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/styles/controls.css`, `src/styles/globals.css` | modify | the variants, the working state, `--btn-bg`, skeletons, `.content-in` |
| `src/lib/useShowAfter.ts` (+ test), `src/components/Skeleton.tsx`, `src/components/Button.tsx` | create | the pieces |
| `src/components/settings/*.tsx` (8), `src/components/views/SettingsView.css` | modify | Settings on the shared controls |
| `src/components/{PromptModal,WhatsNewDialog,SharePlaylistModal,ExportPlaylistModal,DuplicatesModal,TrackTable}.tsx`, `src/App.tsx`, `src/App.css`, `src/components/TrackTable.css` | modify | the modals on the shared controls |
| `src/components/views/DjView.tsx`, `DjView.css`, `src/components/dj/{DjCandidatesMenu,DjOverview,DjOverviewCards,DjTracksTab}.tsx` | modify | the DJ pages; their skeletons |
| `src/components/sets/{SetPage.tsx,SetPage.css,SetTrackRow.tsx}` | modify | "have it"; the rows' skeleton |
| `docs/superpowers/specs/2026-10-04-interactions-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `d60986d`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 662 passed (663)`; `npx tsc --noEmit -p .`: no errors; `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: The shared controls

**Files:** Modify `src/styles/controls.css`, `src/styles/globals.css`.

- [ ] **Step 1:**

In `src/styles/controls.css`, replace

```css
/* src/styles/controls.css */
/* Shared controls (Interactions spec). Every button has a 6px corner; hover
   is one step lighter, press scales to 0.97 one step darker, keyboard focus
   shows a 2px accent ring with a 2px gap, disabled is 40% opacity. Lighter
   mixes in --text-primary, not white, so it reads in the light themes.
   .btn--danger is a menu's answer to "Remove …?"; the Interactions sweep
   adds .btn--icon, .btn--pill and the Button component. */

/* Every button's corner, the page-specific ones too (they keep their own
   shape only where they are not buttons: a switch, a checkbox, a colour dot). */
button,
[role='button'],
[role='tab'] {
```

with

```css
/* src/styles/controls.css */
/* Shared controls (Interactions spec). Every button has a 6px corner; hover
   is one step lighter, press scales to 0.97 one step darker, keyboard focus
   shows a 2px accent ring with a 2px gap, disabled is 40% opacity. Lighter
   mixes in --text-primary, not white, so it reads in the light themes; a
   theme whose raised colour is its page's (Dawn) sets --btn-bg. Variants:
   --primary, --danger (a menu's answer to "Remove …?"), --sm, --icon (square,
   an icon alone), --pill (the small ones in a row, "have it"); a toggle that
   is on carries aria-pressed. The Button component renders these, with its
   working state. Loading's skeletons and the fade-in after them are here
   too. */

/* Every button's corner, the page-specific ones too (they keep their own
   shape only where they are not buttons: a switch, a checkbox, a colour dot). */
button,
[role='button'],
[role='tab'] {
```

In `src/styles/controls.css`, replace

```css
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
```

with

```css
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--btn-bg, var(--bg-elevated));
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
```

In `src/styles/controls.css`, replace

```css
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.btn:hover {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 6%);
  color: var(--text-primary);
}

.btn:active {
  transform: scale(0.97);
  background: color-mix(in srgb, var(--bg-elevated), black 15%);
}

.btn[aria-expanded='true'] {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 10%);
  color: var(--text-primary);
}

.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.btn--primary {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
```

with

```css
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.btn:hover {
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), var(--text-primary) 6%);
  color: var(--text-primary);
}

.btn:active {
  transform: scale(0.97);
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), black 15%);
}

.btn[aria-expanded='true'] {
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), var(--text-primary) 10%);
  color: var(--text-primary);
}

.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Disabled keeps its pointer events, so a title saying why still shows. */
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn:disabled:active {
  transform: none;
}

.btn--primary {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
```

In `src/styles/controls.css`, replace

```css
}

.btn--danger:active {
  background: color-mix(in srgb, var(--color-danger), black 15%);
}

/* A button that reads as a link: Clear all, Reset */
.link-btn {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
```

with

```css
}

.btn--danger:active {
  background: color-mix(in srgb, var(--color-danger), black 15%);
}

/* Square, an icon alone (its name in aria-label or title): quiet until
   hovered, as it often sits in a row. */
.btn--icon {
  width: 32px;
  padding: 0;
  background: none;
}

.btn--icon.btn--sm {
  width: 28px;
}

.btn--icon:hover {
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), var(--text-primary) 8%);
}

/* A destructive icon (Remove ✕) is red only while hovered. */
.btn--icon.btn--danger {
  background: none;
  color: var(--text-secondary);
  font-weight: inherit;
}

.btn--icon.btn--danger:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--color-danger);
}

/* The small ones in a row: "have it" */
.btn--pill {
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 700;
}

/* A toggle that is on (Watching) */
.btn[aria-pressed='true'] {
  border-color: rgba(var(--accent-rgb), 0.6);
  color: var(--accent-hover);
}

/* Working (Button's `working`): a spinner in the icon's place, disabled but
   plainly there. */
.btn[aria-busy='true']:disabled {
  opacity: 0.75;
}

.btn__spinner {
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.7s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

/* A button that reads as a link: Clear all, Reset */
.link-btn {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
```

In `src/styles/controls.css`, replace

```css

.segmented__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .btn:active {
    transform: none;
  }
}
```

with

```css

.segmented__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Loading (Interactions spec): grey shapes of what is coming, shimmering —
   Skeleton shows them only after 150ms (useShowAfter). */
.skeleton {
  display: block;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 7%) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

/* SkeletonRows: a cover and two lines per row. */
.skeleton-rows__row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 46px;
  padding: 0 8px;
}

.skeleton-rows__cover {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
}

.skeleton-rows__lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.skeleton-rows__line {
  height: 9px;
}

.skeleton-rows__line--short {
  width: 30%;
}

/* What replaces a skeleton fades in with a 4px rise. */
.content-in {
  animation: content-in var(--motion-slow) var(--ease);
}

@keyframes content-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@keyframes content-fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn:active {
    transform: none;
  }

  .skeleton {
    animation: none;
  }

  .content-in {
    animation-name: content-fade-in;
  }
}
```

In `src/styles/globals.css`, replace

```css
  --vocal-yes: #10b981;
  --vocal-no: #6b7280;
}

/* Dawn theme - Light */
:root[data-theme='dawn'] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f8f8;
  --bg-tertiary: #f0f0f0;
  --bg-elevated: #ffffff;
  --surface: #f9fafb;
  --text-primary: #1a1a1a;
```

with

```css
  --vocal-yes: #10b981;
  --vocal-no: #6b7280;
}

/* Dawn theme - Light */
:root[data-theme='dawn'] {
  /* Its raised colour is the page's white: buttons take the grey a step down. */
  --btn-bg: var(--bg-tertiary);
  --bg-primary: #ffffff;
  --bg-secondary: #f8f8f8;
  --bg-tertiary: #f0f0f0;
  --bg-elevated: #ffffff;
  --surface: #f9fafb;
  --text-primary: #1a1a1a;
```

- [ ] **Step 2:** `npx vite build`: passes. Commit:

```bash
git add src/styles/controls.css src/styles/globals.css
git commit -m "feat(controls): icon, pill, toggle and working buttons, Dawn's button colour, skeletons"
```

---

### Task 2: Button, Skeleton, and the wait before a skeleton

**Files:** Create `src/lib/useShowAfter.ts`, `src/lib/useShowAfter.test.tsx`, `src/components/Skeleton.tsx`, `src/components/Button.tsx`.

- [ ] **Step 1: The failing test**

Create `src/lib/useShowAfter.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SKELETON_DELAY_MS, useShowAfter } from './useShowAfter'

// React's act() in a plain DOM, without a testing library.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ ms }: { ms?: number }) {
  return <span>{useShowAfter(ms) ? 'shown' : 'waiting'}</span>
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('a skeleton waits before it shows', () => {
  it('shows nothing for 150ms, then shows', () => {
    act(() => root.render(<Probe />))
    expect(host.textContent).toBe('waiting')
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1))
    expect(host.textContent).toBe('waiting')
    act(() => vi.advanceTimersByTime(1))
    expect(host.textContent).toBe('shown')
  })

  it('never shows when the read ends first (it unmounts)', () => {
    act(() => root.render(<Probe />))
    act(() => vi.advanceTimersByTime(100))
    act(() => root.render(<span>rows</span>))
    act(() => vi.advanceTimersByTime(500))
    expect(host.textContent).toBe('rows')
  })

  it('shows at once when asked to wait 0', () => {
    act(() => root.render(<Probe ms={0} />))
    expect(host.textContent).toBe('shown')
  })
})
```

Run `npx vitest run src/lib/useShowAfter.test.tsx`: FAIL — `./useShowAfter` does not exist.

- [ ] **Step 2: The hook**

Create `src/lib/useShowAfter.ts`:

```ts
// src/lib/useShowAfter.ts
// Loading (Interactions spec): a skeleton shows only after 150ms, so a fast
// read never flashes it.
import { useEffect, useState } from 'react'

export const SKELETON_DELAY_MS = 150

/** False until `ms` have passed since the caller mounted. */
export function useShowAfter(ms: number = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(ms <= 0)
  useEffect(() => {
    if (ms <= 0) return
    const timer = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return shown
}
```

Run `npx vitest run src/lib/useShowAfter.test.tsx`: PASS, 3.

- [ ] **Step 3: The components**

Create `src/components/Skeleton.tsx`:

```tsx
// src/components/Skeleton.tsx
// Loading (Interactions spec): grey shapes of what is coming, shimmering,
// only after 150ms (useShowAfter) — never a blank area, never a spinner in
// the middle of a page. Its styles are the shared `.skeleton` (controls.css);
// what replaces it can fade in with `.content-in`.
import type { CSSProperties } from 'react'
import { useShowAfter } from '../lib/useShowAfter'

/** One grey block: a cover, a QR code, a line. Holds its place while it waits. */
export function Skeleton({
  width,
  height,
  radius,
  className,
}: {
  width: CSSProperties['width']
  height: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  className?: string
}) {
  const shown = useShowAfter()
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, visibility: shown ? undefined : 'hidden' }}
      aria-hidden="true"
    />
  )
}

/** A list still reading: rows of a cover and two lines, holding their place while they wait. */
export function SkeletonRows({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  const shown = useShowAfter()
  return (
    <div
      className="skeleton-rows"
      role="status"
      aria-label={label}
      aria-busy="true"
      style={{ visibility: shown ? undefined : 'hidden' }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-rows__row" key={i}>
          <span className="skeleton skeleton-rows__cover" />
          <span className="skeleton-rows__lines">
            <span className="skeleton skeleton-rows__line" style={{ width: `${64 - (i % 3) * 12}%` }} />
            <span className="skeleton skeleton-rows__line skeleton-rows__line--short" />
          </span>
        </div>
      ))}
    </div>
  )
}
```

Create `src/components/Button.tsx`:

```tsx
// src/components/Button.tsx
// The shared button (Interactions spec, Controls): the `.btn` classes, and a
// working state — a spinner in the icon's place, the label in its -ing form
// ("Saving…"), disabled until the work ends.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger'
  size?: 'sm'
  /** An icon before the label. */
  icon?: IconName
  /** The work it started is running. */
  working?: boolean
  /** The label while working: "Saving…". The label stays when absent. */
  workingLabel?: ReactNode
}

export function Button({
  variant,
  size,
  icon,
  working = false,
  workingLabel,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <button {...rest} type={type} className={classes} disabled={disabled || working} aria-busy={working || undefined}>
      {working ? <span className="btn__spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={14} />}
      {working && workingLabel !== undefined ? workingLabel : children}
    </button>
  )
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/lib/useShowAfter.ts src/lib/useShowAfter.test.tsx src/components/Skeleton.tsx src/components/Button.tsx
git commit -m "feat(controls): Button with its working state, Skeleton after 150ms"
```

---

### Task 3: Settings

**Files:** Modify `src/components/settings/AboutSection.tsx`, `AISection.tsx`, `CompanionSection.tsx`, `DatabaseSection.tsx`, `LibrarySection.tsx`, `SpotifySection.tsx`, `YouTubeMusicSection.tsx`, `YouTubeSection.tsx`, `src/components/views/SettingsView.css`.

- [ ] **Step 1:**

In `src/components/settings/AboutSection.tsx`, replace

```tsx
import { useSettingsContext } from './SettingsContext'

export function AboutSection() {
  const { appVersion, updateChecking, updateProgress, handleCheckForUpdates } = useSettingsContext()

  return (
    <>

      <p className="settings-description">RecoDeck v{appVersion || '—'}</p>

      <button
        onClick={handleCheckForUpdates}
        disabled={updateChecking}
        className="btn-primary btn-small"
      >
        {updateChecking
          ? updateProgress?.status === 'checking' ? 'Checking...' : 'Downloading...'
          : 'Check for Updates'}
      </button>

      <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
        Manually check for app updates from GitHub Releases.
      </p>

      {/* Update progress bar */}
```

with

```tsx
import { useSettingsContext } from './SettingsContext'
import { Button } from '../Button'

export function AboutSection() {
  const { appVersion, updateChecking, updateProgress, handleCheckForUpdates } = useSettingsContext()

  return (
    <>

      <p className="settings-description">RecoDeck v{appVersion || '—'}</p>

      <Button
        variant="primary"
        size="sm"
        onClick={handleCheckForUpdates}
        working={updateChecking}
        workingLabel={updateProgress?.status === 'checking' ? 'Checking…' : 'Downloading…'}
      >
        Check for Updates
      </Button>

      <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
        Manually check for app updates from GitHub Releases.
      </p>

      {/* Update progress bar */}
```

In `src/components/settings/AISection.tsx`, replace

```tsx
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

export function AISection() {
  const {
    isApiKeyConfigured, apiKeyInput, setApiKeyInput,
    showApiKey, setShowApiKey, aiSaving,
    handleSaveApiKey, handleDeleteApiKey,
```

with

```tsx
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'
import { Button } from '../Button'

export function AISection() {
  const {
    isApiKeyConfigured, apiKeyInput, setApiKeyInput,
    showApiKey, setShowApiKey, aiSaving,
    handleSaveApiKey, handleDeleteApiKey,
```

In `src/components/settings/AISection.tsx`, replace

```tsx
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="btn-icon"
            title={showApiKey ? 'Hide' : 'Show'}
            type="button"
          >
            <Icon name={showApiKey ? 'EyeOff' : 'Eye'} size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveApiKey}
            disabled={aiSaving || !apiKeyInput.trim()}
            className="btn-primary btn-small"
          >
            {aiSaving ? 'Saving...' : isApiKeyConfigured ? 'Update Key' : 'Save Key'}
          </button>
          {isApiKeyConfigured && (
            <button onClick={handleDeleteApiKey} className="btn-secondary btn-small">
              Delete Key
            </button>
          )}
        </div>

        {isApiKeyConfigured && (
```

with

```tsx
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="btn btn--icon"
            title={showApiKey ? 'Hide' : 'Show'}
            aria-label={showApiKey ? 'Hide the key' : 'Show the key'}
            type="button"
          >
            <Icon name={showApiKey ? 'EyeOff' : 'Eye'} size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveApiKey}
            disabled={!apiKeyInput.trim()}
            working={aiSaving}
            workingLabel="Saving…"
          >
            {isApiKeyConfigured ? 'Update Key' : 'Save Key'}
          </Button>
          {isApiKeyConfigured && (
            <button type="button" onClick={handleDeleteApiKey} className="btn btn--sm">
              Delete Key
            </button>
          )}
        </div>

        {isApiKeyConfigured && (
```

In `src/components/settings/CompanionSection.tsx`, replace

```tsx
import { QRCodeSVG } from 'qrcode.react'
import { useSettingsContext } from './SettingsContext'
import { ToggleSwitch } from './ToggleSwitch'

export function CompanionSection() {
  const {
    companionRunning, companionUrl, companionToken,
    companionPortInput, setCompanionPortInput,
    companionActiveStreams, companionLoading,
```

with

```tsx
import { QRCodeSVG } from 'qrcode.react'
import { useSettingsContext } from './SettingsContext'
import { ToggleSwitch } from './ToggleSwitch'
import { Button } from '../Button'
import { Skeleton } from '../Skeleton'

export function CompanionSection() {
  const {
    companionRunning, companionUrl, companionToken,
    companionPortInput, setCompanionPortInput,
    companionActiveStreams, companionLoading,
```

In `src/components/settings/CompanionSection.tsx`, replace

```tsx
            style={{ width: '100px' }}
          />
        </div>
      )}

      {/* Start/Stop button */}
      <button
        onClick={companionRunning ? handleStopCompanion : handleStartCompanion}
        disabled={companionLoading}
        className={companionRunning ? 'btn-secondary btn-small' : 'btn-primary btn-small'}
        style={{ width: '100%' }}
      >
        {companionLoading
          ? companionRunning ? 'Stopping...' : 'Starting...'
          : companionRunning ? 'Stop Server' : 'Start Server'}
      </button>

      {/* Connection info (shown when running) */}
      {companionRunning && companionUrl && (
        <div className="companion-info" style={{
          marginTop: '1.5rem', padding: '1rem', borderRadius: '8px',
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
```

with

```tsx
            style={{ width: '100px' }}
          />
        </div>
      )}

      {/* Start/Stop button */}
      <Button
        variant={companionRunning ? undefined : 'primary'}
        size="sm"
        onClick={companionRunning ? handleStopCompanion : handleStartCompanion}
        working={companionLoading}
        workingLabel={companionRunning ? 'Stopping…' : 'Starting…'}
        style={{ width: '100%' }}
      >
        {companionRunning ? 'Stop Server' : 'Start Server'}
      </Button>

      {/* Connection info (shown when running) */}
      {companionRunning && companionUrl && (
        <div className="companion-info" style={{
          marginTop: '1.5rem', padding: '1rem', borderRadius: '8px',
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
```

In `src/components/settings/CompanionSection.tsx`, replace

```tsx
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginBottom: '1.5rem', padding: '1rem', background: 'white', borderRadius: '8px',
          }}>
            {companionUrl && companionToken ? (
              <QRCodeSVG value={`${companionUrl}/?token=${companionToken}`} size={180} level="M" />
            ) : (
              <div style={{
                width: 180, height: 180, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#999', fontSize: '0.75rem',
              }}>
                Loading...
              </div>
            )}
            <span style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.5rem' }}>
              {companionUrl?.startsWith('http://127.0.0.1')
                ? 'Phone and desktop must be on same WiFi — LAN IP not detected'
                : 'Scan with your phone camera to connect'}
            </span>
```

with

```tsx
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginBottom: '1.5rem', padding: '1rem', background: 'white', borderRadius: '8px',
          }}>
            {companionUrl && companionToken ? (
              <QRCodeSVG value={`${companionUrl}/?token=${companionToken}`} size={180} level="M" />
            ) : (
              <Skeleton width={180} height={180} />
            )}
            <span style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.5rem' }}>
              {companionUrl?.startsWith('http://127.0.0.1')
                ? 'Phone and desktop must be on same WiFi — LAN IP not detected'
                : 'Scan with your phone camera to connect'}
            </span>
```

In `src/components/settings/CompanionSection.tsx`, replace

```tsx
            }}>
              {companionToken}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleRegenerateToken} disabled={companionLoading} className="btn-secondary btn-small">
              Regenerate Token
            </button>
          </div>

          <p className="settings-hint" style={{ marginTop: '1rem', fontSize: '0.7rem', opacity: 0.6 }}>
            Your token and port are saved — your phone stays paired across restarts.
```

with

```tsx
            }}>
              {companionToken}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleRegenerateToken} disabled={companionLoading} className="btn btn--sm">
              Regenerate Token
            </button>
          </div>

          <p className="settings-hint" style={{ marginTop: '1rem', fontSize: '0.7rem', opacity: 0.6 }}>
            Your token and port are saved — your phone stays paired across restarts.
```

In `src/components/settings/DatabaseSection.tsx`, replace

```tsx

      <div className="sv-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            disabled={cleaningDuplicates}
            className="btn-primary btn-small"
            style={{ width: '100%' }}
          >
            Review Duplicate Tracks
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Review and selectively remove duplicate tracks from your library.
```

with

```tsx

      <div className="sv-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            disabled={cleaningDuplicates}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
          >
            Review Duplicate Tracks
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Review and selectively remove duplicate tracks from your library.
```

In `src/components/settings/LibrarySection.tsx`, replace

```tsx
import { useState, useEffect } from 'react'
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}
```

with

```tsx
import { useState, useEffect } from 'react'
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'
import { Button } from '../Button'

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}
```

In `src/components/settings/LibrarySection.tsx`, replace

```tsx

  return (
    <>

      <div className="sv-section__actions">
        {folders.length > 0 && (
          <button
            className="btn-secondary btn-small"
            onClick={handleRescanAll}
            disabled={loading || scanningFolder !== null}
          >
            {scanningFolder ? 'Scanning...' : 'Rescan All'}
          </button>
        )}
        <button
          className="btn-primary btn-small"
          onClick={handleAddFolder}
          disabled={loading}
        >
          Add Folder
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="settings-empty">
```

with

```tsx

  return (
    <>

      <div className="sv-section__actions">
        {folders.length > 0 && (
          <Button
            size="sm"
            onClick={handleRescanAll}
            disabled={loading}
            working={scanningFolder !== null}
            workingLabel="Scanning…"
          >
            Rescan All
          </Button>
        )}
        <button type="button" className="btn btn--primary btn--sm" onClick={handleAddFolder} disabled={loading}>
          Add Folder
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="settings-empty">
```

In `src/components/settings/LibrarySection.tsx`, replace

```tsx
                  <div className="folder-actions">
                    {isScanning ? (
                      <span className="folder-scanning">Scanning...</span>
                    ) : (
                      <>
                        <button
                          className="btn-icon"
                          onClick={() => handleRescanFolder(folder)}
                          title="Rescan this folder"
                          disabled={loading || scanningFolder !== null}
                        >
                          <Icon name="RotateCw" size={16} />
                        </button>
                        <button
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleRemoveFolder(folder)}
                          title="Remove this folder"
                          disabled={loading || scanningFolder !== null}
                        >
                          <Icon name="X" size={16} />
                        </button>
                      </>
                    )}
```

with

```tsx
                  <div className="folder-actions">
                    {isScanning ? (
                      <span className="folder-scanning">Scanning...</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--icon btn--sm"
                          onClick={() => handleRescanFolder(folder)}
                          title="Rescan this folder"
                          aria-label="Rescan this folder"
                          disabled={loading || scanningFolder !== null}
                        >
                          <Icon name="RotateCw" size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn--icon btn--sm btn--danger"
                          onClick={() => handleRemoveFolder(folder)}
                          title="Remove this folder"
                          aria-label="Remove this folder"
                          disabled={loading || scanningFolder !== null}
                        >
                          <Icon name="X" size={16} />
                        </button>
                      </>
                    )}
```

In `src/components/settings/SpotifySection.tsx`, replace

```tsx
// src/components/settings/SpotifySection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { tauriApi } from '../../lib/tauri-api'
import { ToggleSwitch } from './ToggleSwitch'
import { getErrorMessage, isAppError } from '../../types/ai'
import { SPOTIFY_SYNCED_EVENT, type SpotifyStatus } from '../../types/spotify'

const REDIRECT_URI = 'http://127.0.0.1:47816/callback'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }
```

with

```tsx
// src/components/settings/SpotifySection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { tauriApi } from '../../lib/tauri-api'
import { ToggleSwitch } from './ToggleSwitch'
import { Button } from '../Button'
import { getErrorMessage, isAppError } from '../../types/ai'
import { SPOTIFY_SYNCED_EVENT, type SpotifyStatus } from '../../types/spotify'

const REDIRECT_URI = 'http://127.0.0.1:47816/callback'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }
```

In `src/components/settings/SpotifySection.tsx`, replace

```tsx
          </li>
          <li>
            Under <strong>Redirect URIs</strong> add exactly{' '}
            <code>{REDIRECT_URI}</code>{' '}
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                navigator.clipboard
                  .writeText(REDIRECT_URI)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }}
```

with

```tsx
          </li>
          <li>
            Under <strong>Redirect URIs</strong> add exactly{' '}
            <code>{REDIRECT_URI}</code>{' '}
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                navigator.clipboard
                  .writeText(REDIRECT_URI)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }}
```

In `src/components/settings/SpotifySection.tsx`, replace

```tsx
                run('save', () => tauriApi.setSpotifyClientId(clientId))
            }}
            className="settings-text-input"
            style={{ flex: 1 }}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-primary btn-small"
            disabled={!dirty || busy !== null}
            onClick={() =>
              run('save', () => tauriApi.setSpotifyClientId(clientId))
            }
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div
```

with

```tsx
                run('save', () => tauriApi.setSpotifyClientId(clientId))
            }}
            className="settings-text-input"
            style={{ flex: 1 }}
            spellCheck={false}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || busy !== null}
            working={busy === 'save'}
            workingLabel="Saving…"
            onClick={() =>
              run('save', () => tauriApi.setSpotifyClientId(clientId))
            }
          >
            Save
          </Button>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div
```

In `src/components/settings/SpotifySection.tsx`, replace

```tsx
              <span>
                Connected as <strong>{status.accountName}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  disabled={dirty || (busy !== null && !waiting)}
                  title={dirty ? 'Save the Client ID first' : undefined}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Spotify… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary btn-small"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary btn-small"
              // Connect signs in with the saved Client ID, not the one being typed.
              disabled={!saved || dirty || (busy !== null && !waiting)}
              title={dirty ? 'Save the Client ID first' : undefined}
              onClick={connect}
            >
              {waiting ? 'Waiting for Spotify… (try again)' : 'Connect Spotify'}
```

with

```tsx
              <span>
                Connected as <strong>{status.accountName}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={dirty || (busy !== null && !waiting)}
                  title={dirty ? 'Save the Client ID first' : undefined}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Spotify… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn btn--sm"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              // Connect signs in with the saved Client ID, not the one being typed.
              disabled={!saved || dirty || (busy !== null && !waiting)}
              title={dirty ? 'Save the Client ID first' : undefined}
              onClick={connect}
            >
              {waiting ? 'Waiting for Spotify… (try again)' : 'Connect Spotify'}
```

In `src/components/settings/YouTubeMusicSection.tsx`, replace

```tsx
// src/components/settings/YouTubeMusicSection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { ToggleSwitch } from './ToggleSwitch'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage, isAppError } from '../../types/ai'
import { YTM_SYNCED_EVENT, type YtmStatus } from '../../types/youtubeMusic'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }
```

with

```tsx
// src/components/settings/YouTubeMusicSection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { ToggleSwitch } from './ToggleSwitch'
import { Button } from '../Button'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage, isAppError } from '../../types/ai'
import { YTM_SYNCED_EVENT, type YtmStatus } from '../../types/youtubeMusic'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }
```

In `src/components/settings/YouTubeMusicSection.tsx`, replace

```tsx

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Client file</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={busy !== null && !waiting}
            onClick={chooseFile}
          >
            {busy === 'file' ? 'Reading…' : 'Choose client file…'}
          </button>
          <span className="settings-hint">
            {status?.hasClient ? 'A Desktop client is chosen.' : 'None chosen yet.'}
          </span>
        </div>
      </div>
```

with

```tsx

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Client file</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          <Button
            size="sm"
            disabled={busy !== null && !waiting}
            working={busy === 'file'}
            workingLabel="Reading…"
            onClick={chooseFile}
          >
            Choose client file…
          </Button>
          <span className="settings-hint">
            {status?.hasClient ? 'A Desktop client is chosen.' : 'None chosen yet.'}
          </span>
        </div>
      </div>
```

In `src/components/settings/YouTubeMusicSection.tsx`, replace

```tsx
              <span>
                Connected as <strong>{status.email ?? 'your Google account'}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  disabled={busy !== null && !waiting}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Google… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary btn-small"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={!status?.hasClient || (busy !== null && !waiting)}
              title={status?.hasClient ? undefined : 'Choose the client file first'}
              onClick={connect}
            >
              {waiting ? 'Waiting for Google… (try again)' : 'Connect YouTube Music'}
            </button>
```

with

```tsx
              <span>
                Connected as <strong>{status.email ?? 'your Google account'}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy !== null && !waiting}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Google… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn btn--sm"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!status?.hasClient || (busy !== null && !waiting)}
              title={status?.hasClient ? undefined : 'Choose the client file first'}
              onClick={connect}
            >
              {waiting ? 'Waiting for Google… (try again)' : 'Connect YouTube Music'}
            </button>
```

In `src/components/settings/YouTubeSection.tsx`, replace

```tsx
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

/** "8h 12m" — the reset is at midnight Pacific, roughly 9am here. */
function formatReset(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
```

with

```tsx
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'
import { Button } from '../Button'

/** "8h 12m" — the reset is at midnight Pacific, roughly 9am here. */
function formatReset(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
```

In `src/components/settings/YouTubeSection.tsx`, replace

```tsx
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveYouTubeKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowYtKey(!showYtKey)}
            className="btn-icon"
            title={showYtKey ? 'Hide' : 'Show'}
            type="button"
          >
            <Icon name={showYtKey ? 'EyeOff' : 'Eye'} size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveYouTubeKey}
            disabled={ytSaving || !ytKeyInput.trim()}
            className="btn-primary btn-small"
          >
            {ytSaving ? 'Saving...' : ytKeyConfigured ? 'Update Key' : 'Save Key'}
          </button>
          {ytKeyConfigured && (
            <>
              <button
                onClick={handleTestYouTubeKey}
                disabled={ytTesting}
                className="btn-secondary btn-small"
                title="Costs 1 quota unit"
              >
                {ytTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={handleDeleteYouTubeKey} className="btn-secondary btn-small">
                Delete Key
              </button>
            </>
          )}
        </div>
```

with

```tsx
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveYouTubeKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowYtKey(!showYtKey)}
            className="btn btn--icon"
            title={showYtKey ? 'Hide' : 'Show'}
            aria-label={showYtKey ? 'Hide the key' : 'Show the key'}
            type="button"
          >
            <Icon name={showYtKey ? 'EyeOff' : 'Eye'} size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveYouTubeKey}
            disabled={!ytKeyInput.trim()}
            working={ytSaving}
            workingLabel="Saving…"
          >
            {ytKeyConfigured ? 'Update Key' : 'Save Key'}
          </Button>
          {ytKeyConfigured && (
            <>
              <Button
                size="sm"
                onClick={handleTestYouTubeKey}
                working={ytTesting}
                workingLabel="Testing…"
                title="Costs 1 quota unit"
              >
                Test Connection
              </Button>
              <button type="button" onClick={handleDeleteYouTubeKey} className="btn btn--sm">
                Delete Key
              </button>
            </>
          )}
        </div>
```

- [ ] **Step 2: The old icon and small buttons' styles**

In `src/components/views/SettingsView.css`, replace

```css
.folder-scanning {
  font-size: 12px;
  color: var(--accent);
  font-style: italic;
}

/* Icon buttons */
.btn-icon {
  background: none;
  border: 1px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all var(--motion-fast) var(--ease);
}

.btn-icon:hover {
  background: var(--surface);
  color: var(--text-primary);
  border-color: var(--border);
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon-danger:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--color-danger);
  border-color: rgba(var(--color-danger-rgb), 0.3);
}

/* Small button variant */
.btn-small {
  padding: 5px 10px;
  font-size: 12px;
}

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
```

with

```css
.folder-scanning {
  font-size: 12px;
  color: var(--accent);
  font-style: italic;
}

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors; `grep -rn "btn-primary\|btn-secondary\|btn-icon\|btn-small" src/components/settings`: nothing. Commit:

```bash
git add src/components/settings/AboutSection.tsx src/components/settings/AISection.tsx src/components/settings/CompanionSection.tsx src/components/settings/DatabaseSection.tsx src/components/settings/LibrarySection.tsx src/components/settings/SpotifySection.tsx src/components/settings/YouTubeMusicSection.tsx src/components/settings/YouTubeSection.tsx src/components/views/SettingsView.css
git commit -m "feat(settings): the shared buttons, with their working states"
```

---

### Task 4: The modals

**Files:** Modify `src/components/PromptModal.tsx`, `src/components/WhatsNewDialog.tsx`, `src/components/SharePlaylistModal.tsx`, `src/components/ExportPlaylistModal.tsx`, `src/components/DuplicatesModal.tsx`, `src/components/TrackTable.tsx`, `src/App.tsx`, `src/App.css`, `src/components/TrackTable.css`.

- [ ] **Step 1:**

In `src/components/PromptModal.tsx`, replace

```tsx
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            aria-label={title}
          />
          <div className="prompt-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
```

with

```tsx
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            aria-label={title}
          />
          <div className="prompt-modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
```

In `src/components/WhatsNewDialog.tsx`, replace

```tsx
              </ul>
            </div>
          ))}
        </div>

        <div className="whats-new__footer">
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
```

with

```tsx
              </ul>
            </div>
          ))}
        </div>

        <div className="whats-new__footer">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
```

In `src/components/SharePlaylistModal.tsx`, replace

```tsx
            povezuje i otvara playlista
          </span>
        </div>

        <button
          type="button"
          className="btn-primary share-playlist-open-btn"
          onClick={handleOpenLink}
        >
          Otvori link u browseru
        </button>
      </div>
    </div>
```

with

```tsx
            povezuje i otvara playlista
          </span>
        </div>

        <button
          type="button"
          className="btn btn--primary share-playlist-open-btn"
          onClick={handleOpenLink}
        >
          Otvori link u browseru
        </button>
      </div>
    </div>
```

In `src/components/ExportPlaylistModal.tsx`, replace

```tsx
// events for a live progress bar.

import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import './ExportPlaylistModal.css'

interface ExportProgressEvent {
  current: number
  total: number
  current_file: string
```

with

```tsx
// events for a live progress bar.

import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { Button } from './Button'
import './ExportPlaylistModal.css'

interface ExportProgressEvent {
  current: number
  total: number
  current_file: string
```

In `src/components/ExportPlaylistModal.tsx`, replace

```tsx
              </span>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-button modal-button-primary"
            onClick={handleExport}
            disabled={running}
          >
            {running ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

with

```tsx
              </span>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <Button variant="primary" onClick={handleExport} working={running} workingLabel="Exporting…">
            Export
          </Button>
        </div>
      </div>
    </div>
  )
}
```

In `src/components/DuplicatesModal.tsx`, replace

```tsx
        </div>

        {/* Footer */}
        <footer className="dup-modal__footer">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-button modal-button-primary dup-modal__delete"
            onClick={deleteSelected}
            disabled={deleting || selectedIds.size === 0}
          >
            <Icon name="Trash2" size={14} />
            <span>
              {deleting
```

with

```tsx
        </div>

        {/* Footer */}
        <footer className="dup-modal__footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger dup-modal__delete"
            onClick={deleteSelected}
            disabled={deleting || selectedIds.size === 0}
          >
            <Icon name="Trash2" size={14} />
            <span>
              {deleting
```

In `src/components/TrackTable.tsx`, replace

```tsx
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={closeCustomGenre}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={saveCustomGenre}
                  disabled={!customGenreInput.value.trim()}
                >
                  Set Genre
                </button>
              </div>
```

with

```tsx
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeCustomGenre}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={saveCustomGenre}
                  disabled={!customGenreInput.value.trim()}
                >
                  Set Genre
                </button>
              </div>
```

In `src/components/TrackTable.tsx`, replace

```tsx
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={closeComment}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={saveComment}
                >
                  Save
                </button>
              </div>
            </div>
```

with

```tsx
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeComment}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={saveComment}
                >
                  Save
                </button>
              </div>
            </div>
```

In `src/App.tsx`, replace

```tsx
            <h3>Delete {deleteFolderModal.folderName}?</h3>
            <p className="modal-subtitle">{deleteFolderModal.folderPath}</p>
            <div
              className="modal-actions"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <button
                type="button"
                className="modal-button modal-button-secondary"
                onClick={() => confirmDeleteFolder(false)}
              >
                Remove from library only
              </button>
              <button
                type="button"
                className="modal-button modal-button-primary"
                onClick={() => confirmDeleteFolder(true)}
              >
                Delete folder and all files
              </button>
              <button
                type="button"
                className="modal-button modal-button-secondary"
                onClick={() =>
                  setDeleteFolderModal({
                    open: false,
                    folderPath: '',
                    folderName: '',
                  })
```

with

```tsx
            <h3>Delete {deleteFolderModal.folderName}?</h3>
            <p className="modal-subtitle">{deleteFolderModal.folderPath}</p>
            <div
              className="modal-actions"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <button type="button" className="btn" onClick={() => confirmDeleteFolder(false)}>
                Remove from library only
              </button>
              <button type="button" className="btn btn--danger" onClick={() => confirmDeleteFolder(true)}>
                Delete folder and all files
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setDeleteFolderModal({
                    open: false,
                    folderPath: '',
                    folderName: '',
                  })
```

- [ ] **Step 2: The old buttons' styles**

In `src/App.css`, replace

```css
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Buttons */
.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: none;
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--surface);
}

.btn-settings {
  font-size: var(--text-lg);
  padding: 8px 12px;
  line-height: 1;
}

/* Loading State */
.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
```

with

```css
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Loading State */
.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
```

In `src/components/TrackTable.css`, replace

```css
.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.modal-button {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
  outline: none;
}

.modal-button-secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.modal-button-secondary:hover {
  background: var(--bg-tertiary);
}

.modal-button-primary {
  background: var(--accent);
  color: white;
}

.modal-button-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.modal-button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Dragging (track table spec, Dragging) --- */

.data-row--dragging {
  opacity: 0.45;
}
```

with

```css
.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* --- Dragging (track table spec, Dragging) --- */

.data-row--dragging {
  opacity: 0.45;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors; `npx vite build`: passes. Commit:

```bash
git add src/components/PromptModal.tsx src/components/WhatsNewDialog.tsx src/components/SharePlaylistModal.tsx src/components/ExportPlaylistModal.tsx src/components/DuplicatesModal.tsx src/components/TrackTable.tsx src/App.tsx src/App.css src/components/TrackTable.css
git commit -m "feat(ui): the modals on the shared buttons; the old button styles go"
```

---

### Task 5: The DJ pages

**Files:** Modify `src/components/views/DjView.tsx`, `src/components/views/DjView.css`, `src/components/dj/DjCandidatesMenu.tsx`, `src/components/dj/DjOverview.tsx`, `src/components/dj/DjOverviewCards.tsx`, `src/components/dj/DjTracksTab.tsx`.

- [ ] **Step 1:**

In `src/components/views/DjView.tsx`, replace

```tsx
              </div>
            )}
          </div>
          <div className="dj-hero__acts">
            <button
              type="button"
              className={`dj-btn${dj.watched ? ' dj-btn--on' : ''}`}
              disabled={dj.watched === null}
              onClick={dj.toggleWatch}
              title={
                dj.watched
                  ? 'Stop watching for new sets'
                  : 'Look for new sets of this DJ on YouTube'
```

with

```tsx
              </div>
            )}
          </div>
          <div className="dj-hero__acts">
            <button
              type="button"
              className="btn"
              aria-pressed={dj.watched === true}
              disabled={dj.watched === null}
              onClick={dj.toggleWatch}
              title={
                dj.watched
                  ? 'Stop watching for new sets'
                  : 'Look for new sets of this DJ on YouTube'
```

In `src/components/views/DjView.tsx`, replace

```tsx
              <Icon name={dj.watched ? 'BellRing' : 'Bell'} size={14} />
              {dj.watched ? 'Watching' : 'Watch for sets'}
            </button>
            {profile?.spotifyArtistId && (
              <button
                type="button"
                className="dj-btn"
                title="Open on Spotify"
                onClick={() => {
                  if (profile.spotifyArtistId)
                    void openUrl(spotifyArtistUrl(profile.spotifyArtistId))
                }}
              >
```

with

```tsx
              <Icon name={dj.watched ? 'BellRing' : 'Bell'} size={14} />
              {dj.watched ? 'Watching' : 'Watch for sets'}
            </button>
            {profile?.spotifyArtistId && (
              <button
                type="button"
                className="btn"
                title="Open on Spotify"
                onClick={() => {
                  if (profile.spotifyArtistId)
                    void openUrl(spotifyArtistUrl(profile.spotifyArtistId))
                }}
              >
```

In `src/components/views/DjView.tsx`, replace

```tsx
                Spotify
              </button>
            )}
            {profile && (
              <button
                type="button"
                className="dj-btn"
                title="Open on Resident Advisor"
                onClick={() => void openUrl(profile.raUrl)}
              >
                <Icon name="ExternalLink" size={14} />
                RA
              </button>
```

with

```tsx
                Spotify
              </button>
            )}
            {profile && (
              <button
                type="button"
                className="btn"
                title="Open on Resident Advisor"
                onClick={() => void openUrl(profile.raUrl)}
              >
                <Icon name="ExternalLink" size={14} />
                RA
              </button>
```

In `src/components/dj/DjCandidatesMenu.tsx`, replace

```tsx
  }

  return (
    <div className="dj-menu" ref={root}>
      <button
        type="button"
        className="dj-btn dj-btn--icon"
        title="Not this artist?"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen()
```

with

```tsx
  }

  return (
    <div className="dj-menu" ref={root}>
      <button
        type="button"
        className="btn btn--icon"
        title="Not this artist?"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen()
```

In `src/components/dj/DjOverview.tsx`, replace

```tsx
      <div className="dj-editbar">
        <Icon name="SlidersHorizontal" size={14} />
        Customizing the overview · applies to every DJ page
        <span className="dj-editbar__gap" />
        <button
          type="button"
          className="dj-btn"
          onClick={() => repack(DEFAULT_OVERVIEW)}
        >
          Reset
        </button>
        <button
          type="button"
          className="dj-btn dj-btn--primary"
          onClick={() => onDone(order)}
        >
          Done
        </button>
      </div>
```

with

```tsx
      <div className="dj-editbar">
        <Icon name="SlidersHorizontal" size={14} />
        Customizing the overview · applies to every DJ page
        <span className="dj-editbar__gap" />
        <button
          type="button"
          className="btn"
          onClick={() => repack(DEFAULT_OVERVIEW)}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onDone(order)}
        >
          Done
        </button>
      </div>
```

In `src/components/dj/DjOverview.tsx`, replace

```tsx
          </b>
          <div className="dj-addc__pills">
            {hidden.map((card) => (
              <button
                type="button"
                key={card.id}
                className="dj-pill"
                onClick={() => repack(addCard(order, card.id))}
              >
                <Icon name="Plus" size={12} />
                {card.title}
              </button>
            ))}
```

with

```tsx
          </b>
          <div className="dj-addc__pills">
            {hidden.map((card) => (
              <button
                type="button"
                key={card.id}
                className="btn btn--sm"
                onClick={() => repack(addCard(order, card.id))}
              >
                <Icon name="Plus" size={12} />
                {card.title}
              </button>
            ))}
```

In `src/components/dj/DjOverviewCards.tsx`, replace

```tsx
// The overview's cards (the approved mockup's first section): a title that
// leads to its tab ("all 9 →"), then a few rows drawn by the tabs' own
// components. While customizing, a card has a grip and × instead, and its
// rows show ghosted.
import { useState, type CSSProperties } from 'react'
import { Icon, type IconName } from '../Icon'
import { GigRow, RaLinkCard } from './DjGigsTab'
import { PlayBar, PlayStatus } from './DjPlaysTab'
import { SetCard } from './DjSetsTab'
import { DjTrackRow, StatusChips } from './DjTracksTab'
import {
  filterRows,
```

with

```tsx
// The overview's cards (the approved mockup's first section): a title that
// leads to its tab ("all 9 →"), then a few rows drawn by the tabs' own
// components. While customizing, a card has a grip and × instead, and its
// rows show ghosted.
import { useState, type CSSProperties } from 'react'
import { Icon, type IconName } from '../Icon'
import { SkeletonRows } from '../Skeleton'
import { GigRow, RaLinkCard } from './DjGigsTab'
import { PlayBar, PlayStatus } from './DjPlaysTab'
import { SetCard } from './DjSetsTab'
import { DjTrackRow, StatusChips } from './DjTracksTab'
import {
  filterRows,
```

In `src/components/dj/DjOverviewCards.tsx`, replace

```tsx
  actions: OverviewActions
}) {
  if (data.tracksState === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button
          type="button"
          className="dj-btn"
          onClick={actions.onOpenSettings}
        >
          Settings → Spotify
        </button>
      </div>
    )
  }
  if (data.tracksState === 'skeleton') return <Note>Loading their tracks…</Note>
  if (data.tracksState === 'empty') return <Note>{data.tracksEmpty}</Note>
  const shown = filterRows(data.rows, filter, '').slice(0, limit)
  if (shown.length === 0) {
    return (
      <Note>
        {filter === 'owned'
```

with

```tsx
  actions: OverviewActions
}) {
  if (data.tracksState === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button type="button" className="btn btn--sm" onClick={actions.onOpenSettings}>
          Settings → Spotify
        </button>
      </div>
    )
  }
  if (data.tracksState === 'skeleton') return <SkeletonRows rows={4} label="Loading their tracks" />
  if (data.tracksState === 'empty') return <Note>{data.tracksEmpty}</Note>
  const shown = filterRows(data.rows, filter, '').slice(0, limit)
  if (shown.length === 0) {
    return (
      <Note>
        {filter === 'owned'
```

In `src/components/dj/DjOverviewCards.tsx`, replace

```tsx
      row.ownership,
    )
    if (start) actions.onPlayFiles(start.queue, start.index)
  }
  return (
    <div
      className={`spotify-table dj-table dj-card__table${scroll ? ' dj-card__table--scroll' : ''}`}
      role="table"
    >
      {shown.map((row, index) => (
        <DjTrackRow
          key={row.track.spotifyId}
          row={row}
```

with

```tsx
      row.ownership,
    )
    if (start) actions.onPlayFiles(start.queue, start.index)
  }
  return (
    <div
      className={`spotify-table dj-table dj-card__table content-in${scroll ? ' dj-card__table--scroll' : ''}`}
      role="table"
    >
      {shown.map((row, index) => (
        <DjTrackRow
          key={row.track.spotifyId}
          row={row}
```

In `src/components/dj/DjTracksTab.tsx`, replace

```tsx
// src/components/dj/DjTracksTab.tsx
// The Tracks tab: every track the DJ made or remixed, in the Spotify view's
// table (its classes, chips and row actions, Maybe's Yes/No included), newest
// release first, then "Load older releases" when Spotify lists more.
import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import {
  countByStatus,
  fileName,
  filterRows,
  type SpotifyRow,
```

with

```tsx
// src/components/dj/DjTracksTab.tsx
// The Tracks tab: every track the DJ made or remixed, in the Spotify view's
// table (its classes, chips and row actions, Maybe's Yes/No included), newest
// release first, then "Load older releases" when Spotify lists more.
import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useShowAfter } from '../../lib/useShowAfter'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import {
  countByStatus,
  fileName,
  filterRows,
  type SpotifyRow,
```

In `src/components/dj/DjTracksTab.tsx`, replace

```tsx
        </div>
      )}
    </>
  )
}

/** Grey bars where rows will be, while a first fetch has nothing to show yet. */
function SkeletonRows() {
  return (
    <>
      {[62, 48, 70, 55, 66, 40, 58, 50].map((width, i) => (
        <div key={i} className="spotify-row dj-skeleton" aria-hidden="true">
          <span className="spotify-cell--num">{i + 1}</span>
          <span>
            <i style={{ width: `${width}%` }} />
          </span>
          <span>
            <i style={{ width: `${width - 15}%` }} />
          </span>
          <span>
            <i style={{ width: '60%' }} />
          </span>
          <span />
        </div>
      ))}
    </>
  )
```

with

```tsx
        </div>
      )}
    </>
  )
}

/**
 * Grey bars where rows will be, in the table's own columns, while a first
 * fetch has nothing to show yet — shown after 150ms, so a quick one never
 * flashes, and holding their place until then.
 */
function TrackRowsSkeleton() {
  const shown = useShowAfter()
  return (
    <>
      {[62, 48, 70, 55, 66, 40, 58, 50].map((width, i) => (
        <div
          key={i}
          className="spotify-row dj-skeleton"
          aria-hidden="true"
          style={{ visibility: shown ? undefined : 'hidden' }}
        >
          <span className="spotify-cell--num">{i + 1}</span>
          <span>
            <i className="skeleton" style={{ width: `${width}%` }} />
          </span>
          <span>
            <i className="skeleton" style={{ width: `${width - 15}%` }} />
          </span>
          <span>
            <i className="skeleton" style={{ width: '60%' }} />
          </span>
          <span />
        </div>
      ))}
    </>
  )
```

In `src/components/dj/DjTracksTab.tsx`, replace

```tsx
    spotify,
  })
  if (state === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button type="button" className="dj-btn" onClick={onOpenSettings}>
          Settings → Spotify
        </button>
      </div>
    )
  }
```

with

```tsx
    spotify,
  })
  if (state === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button type="button" className="btn btn--sm" onClick={onOpenSettings}>
          Settings → Spotify
        </button>
      </div>
    )
  }
```

In `src/components/dj/DjTracksTab.tsx`, replace

```tsx
            <span role="columnheader">Released</span>
            <span className="spotify-cell--status" role="columnheader">
              Status
            </span>
          </div>
          {state === 'skeleton' ? (
            <SkeletonRows />
          ) : (
            shown.map((row, index) => (
              <DjTrackRow
                key={row.track.spotifyId}
                row={row}
                number={index + 1}
```

with

```tsx
            <span role="columnheader">Released</span>
            <span className="spotify-cell--status" role="columnheader">
              Status
            </span>
          </div>
          {state === 'skeleton' ? (
            <TrackRowsSkeleton />
          ) : (
            shown.map((row, index) => (
              <DjTrackRow
                key={row.track.spotifyId}
                row={row}
                number={index + 1}
```

- [ ] **Step 2: The hero's glass; the old buttons and chips go**

In `src/components/views/DjView.css`, replace

```css
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

/* ---- Buttons on the hero (and the page's small buttons) ---- */

.dj-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(30, 30, 30, 0.85);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.dj-btn:hover:not(:disabled) {
  border-color: var(--text-muted);
}

.dj-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dj-btn--icon {
  padding: 0 9px;
}

.dj-btn--on {
  border-color: rgba(var(--accent-rgb), 0.6);
  color: var(--accent-hover);
}

.dj-btn--primary {
  height: 26px;
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ---- "Not this artist?" ---- */

.dj-menu {
  position: relative;
}
```

with

```css
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

/* ---- The hero's buttons: the shared .btn, as glass over the photo ---- */

.dj-hero__acts .btn,
.dj-hero__acts .btn:hover {
  border-color: var(--border);
  background: rgba(30, 30, 30, 0.85);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.dj-hero__acts .btn:hover:not(:disabled) {
  border-color: var(--text-muted);
}

.dj-hero__acts .btn[aria-pressed='true'] {
  border-color: rgba(var(--accent-rgb), 0.6);
  color: var(--accent-hover);
}

/* ---- "Not this artist?" ---- */

.dj-menu {
  position: relative;
}
```

In `src/components/views/DjView.css`, replace

```css
.dj-table {
  flex: none;
  overflow: visible;
}

.dj-skeleton i {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: var(--bg-tertiary);
  animation: dj-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes dj-skeleton-pulse {
  50% {
    opacity: 0.45;
  }
}

.dj-older {
  display: flex;
  align-items: center;
  gap: 10px;
```

with

```css
.dj-table {
  flex: none;
  overflow: visible;
}

.dj-skeleton i {
  height: 10px;
  border-radius: 5px;
}

.dj-older {
  display: flex;
  align-items: center;
  gap: 10px;
```

In `src/components/views/DjView.css`, replace

```css
}

.dj-editbar__gap {
  flex: 1;
}

.dj-editbar .dj-btn {
  height: 26px;
}

.dj-overview-grid {
  min-width: 0;
}
```

with

```css
}

.dj-editbar__gap {
  flex: 1;
}

.dj-editbar .btn {
  height: 26px;
}

.dj-overview-grid {
  min-width: 0;
}
```

In `src/components/views/DjView.css`, replace

```css

.dj-addc__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dj-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}

.dj-pill:hover {
  background: var(--bg-elevated);
}
```

with

```css

.dj-addc__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors; `grep -rn "dj-btn\|dj-pill\|dj-skeleton-pulse" src`: nothing. Commit:

```bash
git add src/components/views/DjView.tsx src/components/views/DjView.css src/components/dj/DjCandidatesMenu.tsx src/components/dj/DjOverview.tsx src/components/dj/DjOverviewCards.tsx src/components/dj/DjTracksTab.tsx
git commit -m "feat(dj): the shared buttons on the DJ pages; skeletons that wait"
```

---

### Task 6: The set page

**Files:** Modify `src/components/sets/SetPage.tsx`, `src/components/sets/SetPage.css`, `src/components/sets/SetTrackRow.tsx`.

- [ ] **Step 1:**

In `src/components/sets/SetTrackRow.tsx`, replace

```tsx
      </span>

      <span className="set-row__own">
        {match ? (
          <button
            type="button"
            className="set-row__have"
            onClick={() => onPlayFile(match.track as LibraryTrack)}
            title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
          >
            <Icon name="Play" size={11} /> have it
          </button>
        ) : (
```

with

```tsx
      </span>

      <span className="set-row__own">
        {match ? (
          <button
            type="button"
            className="btn btn--pill set-row__have"
            onClick={() => onPlayFile(match.track as LibraryTrack)}
            title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
          >
            <Icon name="Play" size={11} /> have it
          </button>
        ) : (
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
  thumbnailUrl,
  type SetFilter,
} from '../../lib/sets/setPage'
import { watchUrl } from '../../lib/youtubeWindow'
import { toast } from '../../lib/toast'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'
import './SetPage.css'

/** A set being read, or one that could not be: what is known of it so far. */
export interface SetOpening {
```

with

```tsx
  thumbnailUrl,
  type SetFilter,
} from '../../lib/sets/setPage'
import { watchUrl } from '../../lib/youtubeWindow'
import { toast } from '../../lib/toast'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import { useShowAfter } from '../../lib/useShowAfter'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'
import './SetPage.css'

/** A set being read, or one that could not be: what is known of it so far. */
export interface SetOpening {
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
                  Remove from library
                </button>
              )}
            </div>
          </div>
        ) : !ready || !result ? (
          <div className="set-page__rows" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="set-row set-row--skeleton">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : result.tracks.length === 0 ? (
          <p className="set-page__empty">
            Nothing in the description and nothing usable in the comments. On a fresh set this is
            worth retrying in a few days — tracklists arrive slowly.
          </p>
        ) : (
```

with

```tsx
                  Remove from library
                </button>
              )}
            </div>
          </div>
        ) : !ready || !result ? (
          <RowsSkeleton />
        ) : result.tracks.length === 0 ? (
          <p className="set-page__empty">
            Nothing in the description and nothing usable in the comments. On a fresh set this is
            worth retrying in a few days — tracklists arrive slowly.
          </p>
        ) : (
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
          </section>
        )}
      </div>
    </div>
  )
}
```

with

```tsx
          </section>
        )}
      </div>
    </div>
  )
}

/** The rows while the set reads: grey bars in their columns, shown after 150ms, holding their place until then. */
function RowsSkeleton() {
  const shown = useShowAfter()
  return (
    <div className="set-page__rows" aria-busy="true" style={{ visibility: shown ? undefined : 'hidden' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="set-row set-row--skeleton">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ))}
    </div>
  )
}
```

In `src/components/sets/SetPage.css`, replace

```css
}

.set-row__lists--lonely {
  opacity: 0.55;
}

.set-row__have {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: none;
  background: color-mix(in srgb, #1ed760 15%, transparent);
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.set-row__have:hover {
  background: color-mix(in srgb, #1ed760 25%, transparent);
}

.set-row__missing {
  color: var(--text-muted);
  font-size: 11px;
}
```

with

```css
}

.set-row__lists--lonely {
  opacity: 0.55;
}

/* "have it": the shared .btn--pill, in green. */
.set-row__have {
  background: color-mix(in srgb, #1ed760 15%, transparent);
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
}

.set-row__have:hover {
  background: color-mix(in srgb, #1ed760 25%, transparent);
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
}

.set-row__missing {
  color: var(--text-muted);
  font-size: 11px;
}
```

In `src/components/sets/SetPage.css`, replace

```css
}

/* Rows not read yet. */
.set-row--skeleton span {
  height: 10px;
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.set-row--skeleton span:nth-child(3) {
  width: 60%;
}
```

with

```css
}

/* Rows not read yet. */
.set-row--skeleton span {
  height: 10px;
  border-radius: 4px;
}

.set-row--skeleton span:nth-child(3) {
  width: 60%;
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 665 passed (666)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/sets/SetPage.tsx src/components/sets/SetPage.css src/components/sets/SetTrackRow.tsx
git commit -m "feat(sets): \"have it\" is the shared pill; the rows' skeleton waits"
```

---

### Task 7: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-interactions-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-interactions-design.md`, replace

```markdown
  around App): no movement, fades only. The old modal and the AI context
  menu fade instead of sliding or growing, as the menus and toasts do.
- I3 is two plans: **I3a** (this one, motion) and **I3b** (controls and
  loading: `.btn--icon`, `.btn--pill`, `Button` with its working state,
  Settings, the DJ pages and the modals on the shared controls, `Skeleton`).

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

with

```markdown
  around App): no movement, fades only. The old modal and the AI context
  menu fade instead of sliding or growing, as the menus and toasts do.
- I3 is two plans: **I3a** (this one, motion) and **I3b** (controls and
  loading: `.btn--icon`, `.btn--pill`, `Button` with its working state,
  Settings, the DJ pages and the modals on the shared controls, `Skeleton`).

**As built by plan I3b** (controls and loading):
- `controls.css` gains `.btn--icon` (square, quiet until hovered), `.btn--pill`
  (22px, the small ones in a row: "have it"), a toggle that is on
  (`aria-pressed`), a quiet destructive icon (`.btn--icon.btn--danger`, red
  only while hovered), and `--btn-bg`: a theme whose raised colour is its
  page's sets it, so buttons show on white (Dawn: its tertiary grey).
- `Button` renders them, with `working`: a spinner in the icon's place,
  `workingLabel` ("Saving…"), disabled until done (`aria-busy`). A disabled
  button keeps its pointer events, so a title saying why it is disabled
  still shows (Connect: "Save the Client ID first"). Settings'
  Save, Test Connection, Rescan All, Start / Stop Server, Check for Updates
  and Choose client file, and the export dialog's Export, use it.
- Settings, the DJ pages and the modals (the name prompt, What's New, Share,
  Export, Duplicates, the track table's genre and comment dialogs, Delete
  folder) are on the shared classes; Delete folder and all files and Delete
  selected (duplicates) are `.btn--danger`. The DJ hero's buttons keep their
  glass over the photo (a rule on `.dj-hero__acts .btn`), and Watch is
  `aria-pressed`. `btn-primary`, `btn-secondary`, `btn-icon`, `btn-small`,
  `modal-button`, `dj-btn` and `dj-pill` and their styles are gone. Left as
  they are: the AI panels' own buttons (not shown in this build).
- Loading: `useShowAfter` (150ms), `Skeleton` and `SkeletonRows` on the shared
  `.skeleton` shimmer (still under reduced motion); `.content-in` fades in
  what replaces them. Skeletons hold their place while they wait (drawn but
  hidden), so nothing shifts when they appear. A DJ's Tracks table and
  Overview tracks card, the set page's rows and the Companion's QR code use
  them.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-interactions-design.md
git commit -m "docs(spec): Interactions I3b as built"
```

---

### Task 8: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 665 passed (666)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`; `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 462 passed.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Settings: every section's buttons look the same; Rescan All shows "Scanning…" with a spinner; Save on a key shows "Saving…"; the folder row's Rescan and ✕ are quiet until hovered (✕ red).
  - A DJ page: Watch / Watching, Spotify, RA and ⋯ still read on the photo; the Tracks tab's first load shows grey rows (only if it takes a moment).
  - A set page: "have it" is the same green pill; Export a playlist: "Exporting…".
  - Switch to Dawn: buttons are light grey on white, not white on white.
