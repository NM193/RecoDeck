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
    summary: "Separate Title and Artist columns retained after user rejected stacked combined cell during checkpoint review — plan's combined cell approach overridden"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-03-06"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
---

# Phase 9 Plan 01: TrackTable Spotify Redesign Summary

**One-liner:** Spotify-style TrackTable with # index/play/speaker icon column, separate Title and Artist columns, row selection state, and CSS-only hover icon swap — no JS re-renders on hover.

## What Was Built

Redesigned `TrackTable.tsx` and `TrackTable.css` to match Spotify-style track list interactions:

- **# column** (`cell-index`, 48px fixed): shows 1-based row index by default, swaps to play icon on hover, shows Volume2 speaker icon (in accent color) for the currently-playing track. The swap is CSS-only via `:hover` descendant selectors.
- **Separate Title and Artist columns**: Title (`cell-title`, flex: 1 1 300px) and Artist (`cell-artist`, flex: 0 0 200px) as independent columns. A combined cell was implemented initially but reverted per user direction at the checkpoint.
- **Removed columns**: Album and Format columns removed from both header and data rows.
- **Row selection**: `selectedRowId` state added; single-click sets selection and applies `data-row--selected` class (faint accent background). Double-click plays (unchanged).
- **`playlistMode` prop**: accepted by `TrackTableProps` (both library mode and playlist mode show `virtualRow.index + 1` since virtualizer renders in sorted/playlist order).
- **Playing row indicator**: removed `border-left: 3px solid var(--accent)` and `::before` pulse animation. Speaker icon in # column is the sole indicator.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add # column, combined cell, row selection to TrackTable.tsx | 18db0b0 | src/components/TrackTable.tsx |
| 2 | Update TrackTable.css for Spotify styling | 5d2fbc6 | src/components/TrackTable.css |
| 3 | Checkpoint correction: revert to separate Title/Artist columns | 21c0dd0 | src/components/TrackTable.tsx, src/components/TrackTable.css |

## Deviations from Plan

### Post-checkpoint User Correction

**Column layout revised per user feedback at checkpoint**
- **Found during:** Task 3 (human verification checkpoint)
- **Issue:** Plan specified a combined Title+Artist stacked cell; user reviewed visually and preferred separate columns
- **Fix:** Reverted combined `cell-title-combined` to separate `cell-title` and `cell-artist` columns; removed stacked sub-element CSS
- **Files modified:** src/components/TrackTable.tsx, src/components/TrackTable.css
- **Verification:** 60/60 tests pass
- **Committed in:** 21c0dd0

## Verification

- `npm run test -- --run`: 60/60 tests passed after all tasks
- Visual verification: checkpoint approved after column layout correction

## Self-Check: PASSED

Files modified:
- FOUND: src/components/TrackTable.tsx
- FOUND: src/components/TrackTable.css

Commits:
- FOUND: 18db0b0
- FOUND: 5d2fbc6
- FOUND: 21c0dd0
