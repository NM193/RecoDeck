---
phase: 09-ui-views-and-mobile
plan: 01
subsystem: frontend-ui
tags: [tracktable, spotify-ux, css, react]
dependency_graph:
  requires: []
  provides: [tracktable-spotify-redesign]
  affects: [app-library-view, playlist-detail-view, folder-view]
tech_stack:
  added: []
  patterns: [css-hover-icon-swap, combined-cell-layout, row-selection-state]
key_files:
  created: []
  modified:
    - src/components/TrackTable.tsx
    - src/components/TrackTable.css
decisions:
  - id: "09-01-D1"
    summary: "# column shows virtualRow.index+1 in both library and playlist modes — virtualizer renders in sorted order so index IS the 1-based position"
  - id: "09-01-D2"
    summary: "CSS-only hover icon swap (no JS) — :hover on .data-row toggles .row-number/.row-play display via descendant selectors"
  - id: "09-01-D3"
    summary: "cell-title-combined uses flex-direction: column on .table-cell which has display:flex — stacked layout works without !important via the column direction override"
metrics:
  duration: "~12 minutes"
  completed_date: "2026-03-06"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Phase 9 Plan 01: TrackTable Spotify Redesign Summary

**One-liner:** Spotify-style TrackTable with # index/play/speaker icon column, combined Title+Artist cell, and CSS-only hover icon swap — no JS re-renders on hover.

## What Was Built

Redesigned `TrackTable.tsx` and `TrackTable.css` to match Spotify-style track list interactions:

- **# column** (`cell-index`, 48px fixed): shows 1-based row index by default, swaps to play icon on hover, shows Volume2 speaker icon (in accent color) for the currently-playing track. The swap is CSS-only via `:hover` descendant selectors.
- **Combined Title+Artist cell** (`cell-title-combined`): replaces the separate Title and Artist columns. Title displayed in 13px/500 weight, Artist in 11px secondary color, both truncated with text-overflow.
- **Removed columns**: Album and Format columns removed from both header and data rows.
- **Row selection**: `selectedRowId` state added; single-click sets selection and applies `data-row--selected` class (faint accent background). Double-click plays (unchanged).
- **`playlistMode` prop**: accepted by `TrackTableProps` (both library mode and playlist mode show `virtualRow.index + 1` since virtualizer renders in sorted/playlist order).
- **Playing row indicator**: removed `border-left: 3px solid var(--accent)` and `::before` pulse animation. Speaker icon in # column is the sole indicator.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add # column, combined cell, row selection to TrackTable.tsx | 18db0b0 | src/components/TrackTable.tsx |
| 2 | Update TrackTable.css for Spotify styling | 5d2fbc6 | src/components/TrackTable.css |
| 3 | Checkpoint: Visual verification | — | (awaiting human verification) |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run test -- --run`: 60/60 tests passed after both tasks
- Visual verification: pending human checkpoint approval

## Self-Check: PASSED

Files modified:
- FOUND: src/components/TrackTable.tsx
- FOUND: src/components/TrackTable.css

Commits:
- FOUND: 18db0b0
- FOUND: 5d2fbc6
