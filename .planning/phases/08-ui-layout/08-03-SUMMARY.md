---
phase: 08-ui-layout
plan: 03
subsystem: ui-animations
tags: [framer-motion, animate-presence, crossfade, transitions, expanded-view]
dependency_graph:
  requires: [08-01, 08-02]
  provides: [view-crossfade-transitions, expanded-now-playing, card-hover-interactions]
  affects: [App.tsx, NowPlayingBar.tsx]
tech_stack:
  added: []
  patterns: [AnimatePresence mode=wait, motion.div opacity crossfade, fixed overlay with backdrop-filter]
key_files:
  created: []
  modified:
    - src/App.tsx
    - src/components/layout/NowPlayingBar.tsx
    - src/components/layout/NowPlayingBar.css
decisions:
  - AnimatePresence mode=wait chosen to prevent layout conflicts with state-driven view changes
  - viewKey derived from full identity (playlist-{id}, folder-{path}, home) so switching between two different playlists also triggers transition
  - Expanded overlay uses fixed positioning covering entire viewport with backdrop-filter blur
  - Album art click opens expanded view (separate from track info click which scrolls to track in library)
  - Escape key handler registered only when expanded is true (conditional effect)
metrics:
  duration: 2m
  completed: "2026-03-01"
  tasks_completed: 1
  tasks_total: 2
  files_modified: 3
---

# Phase 8 Plan 3: Framer Motion Transitions and Expanded Now-Playing Summary

**One-liner:** AnimatePresence mode="wait" crossfade with 200ms opacity transition across all view changes, plus a fullscreen now-playing overlay with scale+opacity animation triggered by album art click.

## What Was Built

### Task 1: AnimatePresence crossfade transitions + expandable now-playing view

**View transitions in App.tsx:**

Derived a unique `viewKey` from navigation state:
```typescript
const viewKey = selectedPlaylistId
  ? `playlist-${selectedPlaylistId}`
  : selectedFolder
    ? `folder-${selectedFolder}`
    : 'home'
```

Wrapped the main content area in `AnimatePresence mode="wait"` with a `motion.div` carrying the viewKey. This ensures the old view fully fades out before the new view fades in — no jarring instant swaps. Duration is 200ms with easeInOut.

**Expandable now-playing in NowPlayingBar.tsx:**

Added `expanded` state. Clicking the album art thumbnail opens a full-screen overlay:
- Large 360x360px album art with box-shadow
- Track title in `--text-2xl`, artist in `--text-lg`, BPM/key/genre metadata in `--text-base`
- `backdrop-filter: blur(24px)` background
- Scale+opacity AnimatePresence animation (0.25s duration)
- Close via: X button, click outside, or Escape key
- Escape key handler registered conditionally only when expanded (no unnecessary listeners)

**Card hover micro-interactions (HomeView.css):**
Already existed from plan 08-02: `transform: scale(1.03)` + `box-shadow` on hover with `transition: all 0.2s ease`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 100f2f3 | feat(08-03): wire AnimatePresence crossfade transitions and expandable now-playing view |

## Deviations from Plan

None — plan executed exactly as written. The card hover micro-interactions mentioned in the success criteria were already implemented in 08-02-PLAN.md (HomeView.css contains `transform: scale(1.03)` and `box-shadow`).

## Verification

TypeScript compiles without errors (`npx tsc --noEmit` passes).

### App.tsx contains:
- `AnimatePresence mode="wait"` wrapping main content view
- `viewKey` derived from selectedPlaylistId/selectedFolder state
- `motion.div` with key={viewKey}, opacity 0→1/1→0 transition

### NowPlayingBar.tsx contains:
- `expanded` state with `setExpanded(false)` on Escape
- `AnimatePresence` wrapping expanded overlay
- `motion.div` with scale+opacity animation for expand/collapse
- Large art, title, artist, metadata in expanded view

## Self-Check: PASSED

- src/App.tsx: FOUND
- src/components/layout/NowPlayingBar.tsx: FOUND
- src/components/layout/NowPlayingBar.css: FOUND
- commit 100f2f3: FOUND
