# Micro-interactions (b): cards, the player bar, progress, stars and buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Cards slide a hover highlight between them, and their play buttons pop.
- The player's buttons spring, and play ↔ pause turns.
- The progress bar thickens and springs its handle and time bubble.
- The rating's stars light in a wave and pulse.
- The primary button's gradient flows.

**Architecture:**
- Builds on plan (a): `HoverGlide`, `useHoverGlide`, `GLIDE`, `prefersReducedMotion`, and the tokens `--ease-soft`, `--ease-spring`, `--border-strong` and `--accent-flow`.
- Almost everything is CSS. The only new logic is the stars' pulse:
  - a pure helper, `src/lib/starWave.ts`, says which stars pulse and when;
  - `StarRating` plays the pulse with the Web Animations API in a layout effect.

**Tech Stack:** React 19 + TypeScript, plain CSS, vitest (jsdom), Playwright WebKit for the visual check.

**Spec:** `docs/superpowers/specs/2026-10-10-micro-interactions-design.md`: Cards, Player bar, Progress bar, Stars, Buttons. Plan (a) must be done first.

---

## Conventions for every task

Same as plan (a):
- **Branch:** `feat/micro-interactions`. Stage files by name; never `.planning/STATE.md` or `.claude/`.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Prettier hook:** files that are not Prettier-clean are changed only with `python3` replace scripts (`assert s.count(old) == 1`) or a heredoc. In this plan these are:
  - `NowPlayingBar.tsx`/`.css`;
  - `HomeCards.tsx`, `SearchView.tsx`/`.css`, `SetsLibrary.tsx`;
  - `StarRating.tsx`, `styles/controls.css`.

  Clean files may use Edit: `SearchSections.tsx`/`.css`, `HomeView.css`, `SetsHome.css`, `StarRating.css`.
- **Checks:** `npx vitest run`, `npx tsc --noEmit`, and `npx eslint <paths>`. eslint must add nothing to `main`'s 9 known errors.

---

### Task 1: Card glides

**Files:**
- Modify: `src/components/search/SearchSections.tsx`, `SearchSections.css` (Edit)
- Modify: `src/components/views/SearchView.tsx`, `SearchView.css` (python)
- Modify: `src/components/home/HomeCards.tsx` (python), `src/components/views/HomeView.css` (Edit)
- Modify: `src/components/sets/SetsLibrary.tsx` (python), `src/components/sets/SetsHome.css` (Edit)

Every card list becomes a `HoverGlide` with `kind="card"`. The container keeps its class; its opening and its matching closing tag change.

| Where | Container today | `item` | Highlight `--glide-bg` (on the container's rule) |
|---|---|---|---|
| SearchSections | `<div className="search-tiles">` | `.search-tile` | `var(--bg-tertiary)` |
| SearchSections | `<div className="search-djs">` | `.search-dj` | `var(--bg-tertiary)` |
| SearchView (DJs) | the first `<div className="search-view__card-row">` | `.search-view__dj-card` | `var(--bg-tertiary)` |
| SearchView (playlists) | the second `<div className="search-view__card-row">` | `.search-view__playlist-card` | `var(--bg-tertiary)` |
| HomeCards | `<div className="home-playlists">` | `.home-playlist` | `color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%)` |
| HomeCards | `<div className="home-djs">` | `.home-dj` | `var(--bg-tertiary)` |
| SetsLibrary | `<div className="set-cards">` | `.set-card` | `var(--bg-tertiary)` |
| SetsLibrary | `<div className="new-finds">` | `.new-find` | `var(--bg-tertiary)` |

The two `search-view__card-row`s share a class. Give the CSS variable to `.search-view__card-row`; both cards hover in `--bg-tertiary`.

- [ ] **Step 1: Swap the containers.**
  - For the python files, print each block (`grep -n` the opening, then `sed -n`) and replace the exact, unique text of the whole block.
  - Each file imports `HoverGlide` from `../HoverGlide` **if it does not already**. Plan (a) already imports it in `SearchSections.tsx` and `HomeCards.tsx`; a second import is a "Duplicate identifier" error.

- [ ] **Step 2: Cards with a fill fade their own background under the arriving highlight.**

`SearchView.css` (python):
- `.search-view__dj-card` and `.search-view__playlist-card`:
  - `transition: background-color var(--motion-fast) var(--ease);` becomes `transition: background-color 240ms var(--ease-soft);`;
  - their `:hover` rules change `background: var(--bg-tertiary);` to `background: transparent;`.
- `.search-view__card-row` gets `--glide-bg: var(--bg-tertiary);`.

`HomeView.css`:
- `.home-playlist`:
  - add `border-radius: var(--radius-md);`. It is the glide's item, and the highlight takes its corners, which are those of the button inside;
  - `.home-playlist__open`'s `transition` becomes `transition: background-color 240ms var(--ease-soft);`.
- Replace

```css
.home-playlist__open:hover {
  background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%);
}
```

with

```css
/* Keyed on the card, so moving onto its play button keeps the card hovered. */
.home-playlist:hover .home-playlist__open {
  background: transparent;
}
```

- `.home-playlists` gets `--glide-bg: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%);`.
- Delete `.home-dj:hover { background: var(--bg-tertiary); }`, and give `.home-djs` `--glide-bg: var(--bg-tertiary);`.

`SearchSections.css`:
- Delete `.search-dj:hover { background: var(--bg-tertiary); }`.
- Give `.search-djs` and `.search-tiles` `--glide-bg: var(--bg-tertiary);`.

`SetsHome.css`:
- `.new-find` has a fill at rest (`--bg-secondary`), so it is a filled card:
  - give `.new-find` `transition: background-color 240ms var(--ease-soft);`;
  - its hover rule becomes `.new-find:hover { background: transparent; }`.
- Give `.new-finds` `--glide-bg: var(--bg-tertiary);`.

- [ ] **Step 3: Cards with no fill get room around the cover.**

`SearchSections.css`:
- `.search-tile`: `flex: 0 0 150px;` → `flex: 0 0 166px;`, `padding: 0;` → `padding: 8px;`, and add `border-radius: var(--radius-lg);`. The cover stays 150px.
- `.search-tiles`: `gap: 14px;` → `gap: 0;`, and add `margin-inline: -8px;`. The covers end up 16px apart, and the first one stays aligned with the heading.

`SetsHome.css`:
- `.set-card`: `padding: 0;` → `padding: 8px;`. Its radius is already 8px.
- `.set-cards`: `gap: 16px;` → `gap: 0;`, and add `margin-inline: -8px;`. Four columns of `(W + 16) / 4` less 16px of padding is exactly today's `(W − 48) / 4`, so the thumbnails do not move.
- The `@media` rule that drops to 3 columns keeps its column count, and needs no change.

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/search src/components/views/SearchView.tsx src/components/home src/components/sets && npx vitest run src/components/home src/components/search src/components/sets`
Expected: clean; tests pass. `HomeCards.test.tsx` must still pass; if it queries a container by its tag or position, adjust the query, not the markup.

```bash
git add src/components/search/SearchSections.tsx src/components/search/SearchSections.css src/components/views/SearchView.tsx src/components/views/SearchView.css src/components/home/HomeCards.tsx src/components/views/HomeView.css src/components/sets/SetsLibrary.tsx src/components/sets/SetsHome.css
git commit -m "feat(cards): the hover slides between cards; filled cards hand their fill to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Play buttons pop

**Files:**
- Modify: `src/components/search/SearchSections.css`, `src/components/views/HomeView.css` (Edit)

- [ ] **Step 1: The Search tile's play.** In `.search-tile__play`:
  - `border-radius: var(--radius-md);` → `border-radius: 50%;`;
  - `transform: translateY(4px);` → `transform: translateY(10px) scale(0.4);`;
  - the transition becomes:

```css
  transition:
    opacity 180ms var(--ease),
    transform 420ms var(--ease-spring),
    background-color var(--motion-fast) var(--ease);
```

  After the `.search-tile:hover .search-tile__play, .search-tile:focus-visible .search-tile__play` rule, add:

```css
.search-tile:hover .search-tile__play:hover {
  transform: scale(1.08);
}
```

- [ ] **Step 2: The Home tile's play** moves to the tile's right end, round, 32px, and pops. Replace the whole `.home-playlist__play` rule, and the old comment above it (`/* ▶ over the cover: plays the playlist. */`), with:

```css
/* ▶ at the tile's right end: pops in when the card is hovered (Micro-
   interactions spec, Cards). Centred with margin, so transform is free. */
.home-playlist__play {
  position: absolute;
  top: 50%;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px) scale(0.4);
  transition:
    opacity 180ms var(--ease),
    transform 420ms var(--ease-spring),
    background-color var(--motion-fast) var(--ease);
}
```

  Then:
  - the rule `.home-playlist:hover .home-playlist__play, .home-playlist__play:focus-visible` gets `transform: none;` beside its `opacity: 1; pointer-events: auto;`;
  - add:

```css
.home-playlist:hover .home-playlist__play:hover {
  background: var(--accent-hover);
  transform: scale(1.08);
}
```

  - `.home-playlist__open`: the button never covers the name or count. Add `padding-right: 46px;` after its `padding: 6px;`.

- [ ] **Step 3: Reduced motion.** Add to `SearchSections.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .search-tile__play,
  .search-tile:hover .search-tile__play:hover {
    transform: none;
  }
}
```

  and to `HomeView.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .home-playlist__play,
  .home-playlist:hover .home-playlist__play:hover {
    transform: none;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/search/SearchSections.css src/components/views/HomeView.css
git commit -m "feat(cards): the play button pops in, round and accent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The transport

**Files:**
- Modify: `src/components/layout/NowPlayingBar.tsx`, `NowPlayingBar.css` (python)

- [ ] **Step 1: JSX** (python)
  - `GLIDE` and `useHoverGlide` are already imported: plan (a)'s Add to playlist menu added them. Make sure `useRef` is imported from react.
  - With the component's other refs, before any early `return` (`grep -n "useRef" src/components/layout/NowPlayingBar.tsx`), add:

```tsx
  // The small buttons' grey square slides between them, play and disabled
  // ones skipped; the same on the right: mute and the actions (Micro-
  // interactions spec, Player bar).
  const controlsRef = useRef<HTMLDivElement>(null)
  const controlsGlideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(controlsRef, controlsGlideRef, '.now-playing-bar__btn:not(.now-playing-bar__btn--play):not(:disabled)', GLIDE.icon)
  const actionsRef = useRef<HTMLDivElement>(null)
  const actionsGlideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(actionsRef, actionsGlideRef, '.now-playing-bar__btn:not(:disabled)', GLIDE.icon)
```

  - Replace `<div className="now-playing-bar__controls">` with:

```tsx
          <div className="glide-track now-playing-bar__controls" ref={controlsRef}>
            <span ref={controlsGlideRef} className="glide" aria-hidden="true" />
```

  - Replace `<div className="now-playing-bar__right">` with:

```tsx
        <div className="glide-track now-playing-bar__right" ref={actionsRef}>
          <span ref={actionsGlideRef} className="glide" aria-hidden="true" />
```

  - The play button's `<Icon name={isPlaying ? 'Pause' : 'Play'} size={20} />` becomes both icons, one over the other:

```tsx
              <span
                className={`now-playing-bar__play-icon now-playing-bar__play-icon--play${isPlaying ? ' now-playing-bar__play-icon--hidden' : ''}`}
              >
                <Icon name="Play" size={20} />
              </span>
              <span
                className={`now-playing-bar__play-icon now-playing-bar__play-icon--pause${isPlaying ? '' : ' now-playing-bar__play-icon--hidden'}`}
              >
                <Icon name="Pause" size={20} />
              </span>
```

- [ ] **Step 2: CSS** (python, `NowPlayingBar.css`)
- `.now-playing-bar__btn`: append `transform 280ms var(--ease-spring)` to its `transition` list.
- Delete the toggle dot, the whole rule `.now-playing-bar__btn--toggle.now-playing-bar__btn--active::after { … }`. EQ uses the same classes, so it loses the dot too.
- Replace

```css
.now-playing-bar__btn--play:hover:not(:disabled) {
  background: var(--text-primary);
  color: var(--bg-primary);
  transform: scale(1.05);
}
```

  with:

```css
.now-playing-bar__btn--play:hover:not(:disabled) {
  background: var(--text-primary);
  color: var(--bg-primary);
  transform: scale(1.1);
  box-shadow: 0 0 0 5px rgba(var(--accent-rgb), 0.3);
}

.now-playing-bar__btn--play:active:not(:disabled) {
  transform: scale(0.9);
}
```

- In `.now-playing-bar__btn--play`, add `transition: transform 320ms var(--ease-spring), box-shadow 280ms ease;`.
- Append:

```css
/* The transport and the right-hand actions (Micro-interactions spec, Player
   bar): a grey square slides under the small buttons, which spring up a
   little and shrink when pressed. */
.now-playing-bar__controls,
.now-playing-bar__right {
  --glide-bg: color-mix(in srgb, var(--text-primary) 8%, transparent);
}

/* Isolated as a glide track, the right group would cap the volume popup and
   the Add to playlist menu that open upward from it: it stands above the
   main area as a whole, at the volume wrapper's own 150, and still under the
   expanded now-playing view (200). */
.now-playing-bar__right {
  z-index: 150;
}

.now-playing-bar__controls .now-playing-bar__btn:not(.now-playing-bar__btn--play):hover:not(:disabled),
.now-playing-bar__right .now-playing-bar__btn:hover:not(:disabled) {
  transform: scale(1.12);
}

.now-playing-bar__controls .now-playing-bar__btn:not(.now-playing-bar__btn--play):active:not(:disabled),
.now-playing-bar__right .now-playing-bar__btn:active:not(:disabled) {
  transform: scale(0.88);
  transition-duration: 90ms;
}

/* Play and pause, one over the other: the one leaving turns away. */
.now-playing-bar__play-icon {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transition:
    opacity 160ms ease,
    transform 320ms var(--ease-spring);
}

.now-playing-bar__play-icon--hidden {
  opacity: 0;
}

.now-playing-bar__play-icon--play.now-playing-bar__play-icon--hidden {
  transform: rotate(90deg) scale(0.5);
}

.now-playing-bar__play-icon--pause.now-playing-bar__play-icon--hidden {
  transform: rotate(-90deg) scale(0.5);
}

@media (prefers-reduced-motion: reduce) {
  .now-playing-bar__btn,
  .now-playing-bar__play-icon {
    transform: none !important;
  }
}
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/layout/NowPlayingBar.tsx && npx vitest run`
Expected: clean; tests pass.

```bash
git add src/components/layout/NowPlayingBar.tsx src/components/layout/NowPlayingBar.css
git commit -m "feat(player): buttons spring, a grey square slides under them, play and pause turn

Toggles are accent only: the dot goes (EQ's too).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The progress bar

**Files:**
- Modify: `src/components/layout/NowPlayingBar.css` (python)

- [ ] **Step 1: CSS**
- `.now-playing-bar__progress-track` and `.now-playing-bar__progress-fill`: add `transition: height 240ms var(--ease-soft), border-radius 240ms var(--ease-soft);`. For the fill, merge this into its existing `transition: background …` as one list.
- `.now-playing-bar__progress-hover-fill`: `background: rgba(255, 255, 255, 0.3);` → `background: color-mix(in srgb, var(--text-primary) 30%, transparent);`.
- `.now-playing-bar__progress-handle`:
  - `transform: translate(-50%, -50%);` → `transform: translate(-50%, -50%) scale(0);`;
  - `transition: opacity var(--motion-fast) var(--ease);` → `transition: opacity 120ms var(--ease), transform 320ms var(--ease-spring);`.
- `.now-playing-bar__progress--hover .now-playing-bar__progress-handle`: add `transform: translate(-50%, -50%) scale(1);`.
- `.now-playing-bar__progress-tooltip`: add `transform-origin: 50% 100%;` and `animation: npb-bubble-fade 120ms var(--ease) both, npb-bubble-rise 280ms var(--ease-spring) both;`. It mounts when the hover starts, so it plays then; following the pointer only changes `left`.
- Append:

```css
/* On hover (or while dragging) the bar thickens, 3px to 6px. */
.now-playing-bar__progress--hover .now-playing-bar__progress-track,
.now-playing-bar__progress--hover .now-playing-bar__progress-fill,
.now-playing-bar__progress--hover .now-playing-bar__progress-hover-fill {
  height: 6px;
  border-radius: 3px;
}

@keyframes npb-bubble-fade {
  from {
    opacity: 0;
  }
}

@keyframes npb-bubble-rise {
  from {
    transform: translate(-50%, 6px) scale(0.8);
  }
  to {
    transform: translate(-50%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .now-playing-bar__progress-track,
  .now-playing-bar__progress-fill {
    transition: none;
  }

  .now-playing-bar__progress-handle,
  .now-playing-bar__progress--hover .now-playing-bar__progress-handle {
    transform: translate(-50%, -50%);
  }

  .now-playing-bar__progress-tooltip {
    animation: npb-bubble-fade 120ms var(--ease) both;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/NowPlayingBar.css
git commit -m "feat(player): the progress bar thickens; its handle and time bubble spring in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Stars

**Files:**
- Create: `src/lib/starWave.ts`
- Test: `src/lib/starWave.test.ts`
- Modify: `src/components/StarRating.tsx` (heredoc), `src/components/StarRating.css` (Edit)

- [ ] **Step 1: Write the failing test** `src/lib/starWave.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STAR_STEP_MS, starsToPulse } from './starWave'

describe('starsToPulse: the stars that pulse as they light', () => {
  it('from 2 to 4: stars 3 and 4 (indexes 2 and 3), one step apart, the first at once', () => {
    expect(starsToPulse(2, 4)).toEqual([
      { index: 2, delay: 0 },
      { index: 3, delay: STAR_STEP_MS },
    ])
  })

  it('from none to five: all of them, in a wave', () => {
    expect(starsToPulse(0, 5).map((p) => p.delay)).toEqual([0, 24, 48, 72, 96])
  })

  it('none when the stars dim or stay', () => {
    expect(starsToPulse(4, 2)).toEqual([])
    expect(starsToPulse(3, 3)).toEqual([])
  })
})
```

Run: `npx vitest run src/lib/starWave.test.ts`
Expected: FAIL. The test cannot resolve `./starWave`.

- [ ] **Step 2: Write `src/lib/starWave.ts`**

```ts
// src/lib/starWave.ts
// The rating's wave (Micro-interactions spec, Stars): which stars pulse as
// they light, and when. Their colour ripples by CSS alone (a delay of
// STAR_STEP_MS × the star's index).

/** The gap between one star and the next in the wave. */
export const STAR_STEP_MS = 24

/** The pulse a star gives as it lights: up to 1.22 and back. */
export const STAR_PULSE: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.22)', offset: 0.45 },
  { transform: 'scale(1)' },
]

/** The mockup's spring for the stars, softer than --ease-spring. */
export const STAR_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)'

/**
 * Going from `from` stars shown to `to`, the stars that newly light (0-based)
 * and each one's pulse delay, counted from the first of them.
 */
export function starsToPulse(
  from: number,
  to: number,
): { index: number; delay: number }[] {
  const start = Math.max(from, 0)
  const pulses: { index: number; delay: number }[] = []
  for (let index = start; index < to; index++) {
    pulses.push({ index, delay: (index - start) * STAR_STEP_MS })
  }
  return pulses
}
```

Run: `npx vitest run src/lib/starWave.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: `StarRating.tsx`** (heredoc; the whole file is small)

```bash
cat > src/components/StarRating.tsx <<'EOF'
// 5-star rating control with hover preview
// Clicking the already-selected star resets rating to 0
// The stars light in a wave, each pulsing as it lights; the one under the
// pointer zooms instead (Micro-interactions spec, Stars).

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../lib/glide/glide'
import { STAR_EASE, STAR_PULSE, starsToPulse } from '../lib/starWave'
import './StarRating.css'

interface StarRatingProps {
  value: number
  onChange: (rating: number) => void
  readonly?: boolean
}

export function StarRating({ value, onChange, readonly = false }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value
  const starsRef = useRef<HTMLDivElement>(null)
  // How many stars were lit before this render: the wave starts after them.
  const shownRef = useRef(display)

  useLayoutEffect(() => {
    const from = shownRef.current
    shownRef.current = display
    if (readonly || prefersReducedMotion()) return
    const glyphs = starsRef.current?.querySelectorAll<HTMLElement>('.star__glyph')
    if (!glyphs) return
    for (const { index, delay } of starsToPulse(from, display)) {
      if (index + 1 === hovered) continue
      // On the glyph, so it never fights the button's own zoom. (jsdom has
      // no Web Animations; the app always does.)
      glyphs[index]?.animate?.(STAR_PULSE, { duration: 280, delay, easing: STAR_EASE })
    }
  }, [display, hovered, readonly])

  return (
    <div
      ref={starsRef}
      className={`star-rating ${readonly ? 'star-rating--readonly' : ''}`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= display
        return (
          <button
            key={star}
            type="button"
            className={`star ${active ? 'star--active' : ''}`}
            style={{ '--i': star - 1 } as CSSProperties}
            disabled={readonly}
            aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
            onMouseEnter={() => !readonly && setHovered(star)}
            onClick={(e) => {
              if (readonly) return
              e.stopPropagation()
              onChange(star === value ? 0 : star)
            }}
          >
            <span className="star__glyph">★</span>
          </button>
        )
      })}
    </div>
  )
}
EOF
```

- [ ] **Step 4: `StarRating.css`** (Edit)
- In `.star-rating .star`, add `display: inline-block;`. Replace its `transition: color var(--motion-fast) var(--ease);` with:

```css
  /* The wave: each star's colour follows the one before by 24ms; the zoom
     has no delay, on the way in or out. */
  transition:
    color 150ms var(--ease) calc(var(--i, 0) * 24ms),
    transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
```

- Append:

```css
/* The pulse runs on the glyph; the zoom on the button. */
.star-rating .star__glyph {
  display: inline-block;
}

/* Only the star under the pointer zooms; its own colour comes at once. */
.star-rating:not(.star-rating--readonly) .star:hover {
  transform: scale(1.28);
  transition-delay: 0ms;
}

@media (prefers-reduced-motion: reduce) {
  .star-rating .star {
    transition: color var(--motion-fast) var(--ease);
  }

  .star-rating:not(.star-rating--readonly) .star:hover {
    transform: none;
  }
}
```

- [ ] **Step 5: Check and commit**

Run: `npx vitest run src/lib/starWave.test.ts && npx tsc --noEmit && npx eslint src/components/StarRating.tsx src/lib/starWave.ts src/lib/starWave.test.ts`
Expected: PASS; clean.

```bash
git add src/lib/starWave.ts src/lib/starWave.test.ts src/components/StarRating.tsx src/components/StarRating.css
git commit -m "feat(rating): the stars light in a wave, pulse as they light, the hovered one zooms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Buttons

**Files:**
- Modify: `src/styles/controls.css` (python, with the script saved to a file first)

**Two cascade traps**, both confirmed in WebKit during review:
- **Primary:** `.btn:hover` (0,2,0) sets the `background` shorthand, so a `.btn--primary:hover` that only sets `background-position` loses the gradient and turns grey. Each primary state therefore sets the whole shorthand, with the gradient kept in a custom property.
- **Secondary:** the secondary border rule must stay at (0,2,0), through `:where()`, so that `.btn[aria-pressed='true']` (later in the file) and `.dj-hero__acts .btn:hover:not(:disabled)` (0,4,0) still win.

- [ ] **Step 1: CSS.** Save as `<scratchpad>/buttons.py` and run `python3 <scratchpad>/buttons.py`:

```python
p = 'src/styles/controls.css'
s = open(p).read()


def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)


# Secondary buttons also get a thin border on hover (no movement).
once(""".btn:hover {
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), var(--text-primary) 6%);
  color: var(--text-primary);
}""", """.btn:hover {
  background: color-mix(in srgb, var(--btn-bg, var(--bg-elevated)), var(--text-primary) 6%);
  color: var(--text-primary);
}

/* A secondary button shows its edge on hover (Micro-interactions spec,
   Buttons). :where keeps this at .btn:hover's weight, so a pressed toggle and
   the pages' own edges still win. */
.btn:where(:not(.btn--primary, .btn--danger, .btn--icon, :disabled)):hover {
  border-color: var(--border-strong);
}""")

# Primary: a gradient that flows across while the pointer is on it.
once(""".btn--primary {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.btn--primary:hover {
  background: var(--accent-hover);
  color: #fff;
}""", """.btn--primary {
  --flow: linear-gradient(
    110deg,
    var(--accent) 0%,
    var(--accent) 35%,
    var(--accent-flow) 65%,
    var(--accent-hover) 100%
  );
  /* Every state sets the whole shorthand: .btn:hover's would win otherwise. */
  background: var(--flow) 0 0 / 220% 100% var(--accent);
  color: #fff;
  font-weight: 600;
  transition:
    background-position 700ms var(--ease-soft),
    background-color var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.btn--primary:hover {
  background: var(--flow) 100% 0 / 220% 100% var(--accent);
  color: #fff;
}

.btn--primary:disabled:hover {
  background-position: 0 0;
}""")

# Reduced motion: no flow, the hover colour instead; a press keeps its darker accent.
once(""".btn--primary:active {
  background: color-mix(in srgb, var(--accent), black 15%);
}""", """.btn--primary:active {
  background: color-mix(in srgb, var(--accent), black 15%);
}

@media (prefers-reduced-motion: reduce) {
  .btn--primary {
    background: var(--accent);
  }

  .btn--primary:hover:not(:active) {
    background: var(--accent-hover);
  }
}""")
open(p, 'w').write(s)
```

`.btn--primary:active` keeps `background: color-mix(…)`. It comes after the hover rule at the same weight, so a press shows a darker solid accent, as today.

- [ ] **Step 2: Check in WebKit** (the harness)
  - **Primary on hover:** `getComputedStyle` shows `background-image` with the gradient and `background-position` moving to `100% 0`.
  - **Secondary on hover:** `border-color` is `--border-strong`.
  - **Exceptions:** an `aria-pressed="true"` button keeps its accent edge on hover.

- [ ] **Step 3: Commit**

```bash
git add src/styles/controls.css
git commit -m "feat(buttons): the primary gradient flows on hover; secondary buttons show an edge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Verify everything, and look at it

- [ ] **Step 1:** Run `npx vitest run && npx tsc --noEmit && npx eslint src mobile`. Expected: all tests pass, no type errors, and only `main`'s 9 known lint errors.
- [ ] **Step 2: The WebKit harness from plan (a)**, in midnight and dawn:
  - hover a Search tile, a Home playlist tile and a set card (mid-pop at 150ms, settled at 500ms);
  - the transport (shuffle, then next; play hovered and pressed);
  - play ↔ pause (shoot mid-turn);
  - the progress bar hovered;
  - a rating hovered from 1 to 4;
  - a primary button hovered (also in **carbon** and **neon**, where `--accent-flow` meets a blue and a magenta accent);
  - a secondary button hovered.
- [ ] **Step 3: Confirm:**
  - Search tile covers stay aligned with the heading, and set thumbnails have not moved sideways. Both sit 8px lower now, because of the new top padding; that is expected;
  - the Home tile's ▶ never covers the name;
  - the volume popup and the Add to playlist menu still open over the main area;
  - the expanded now-playing view still covers the right-hand buttons;
  - nothing is clipped.

  Fix what is wrong, each fix in its own commit.
