---
phase: 04-ai-discovery-and-mix-prep
plan: 02
subsystem: ui
tags: [react, tauri, rust, sqlite, ai, claude, svgchart, mixprep, bpm, camelot]

# Dependency graph
requires:
  - phase: 04-01
    provides: musicUtils (getKeyCompatibility, getBpmIssue), ClaudeClient.extract_json pub(crate), RecommendationsPanel pattern
  - phase: 03-ai-playlists
    provides: AIPlaylistDialog styling conventions, tauriApi patterns, AppError types
provides:
  - ai_optimize_playlist_order Tauri command (playlist BPM/key-ordered AI resequencing)
  - reorder_playlist_tracks DB method with atomic execute_batch
  - MixPrepPanel React component (energy arc, transition issues, AI suggested order)
  - Mix Prep button entry point in TrackTable toolbar
affects: [future-dj-tools, phase-05-if-any]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "execute_batch with string-built SQL for atomic multi-row updates (avoids &mut self constraint)"
    - "BPM-normalized SVG bar chart with HSL green-to-red gradient as energy proxy"
    - "Pure frontend transition analysis reusing shared musicUtils functions"

key-files:
  created:
    - src/components/ai/MixPrepPanel.tsx
    - src/components/ai/MixPrepPanel.css
  modified:
    - src-tauri/src/commands/ai.rs
    - src-tauri/src/db/mod.rs
    - src-tauri/src/commands/playlists.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri-api.ts
    - src/types/ai.ts
    - src/components/TrackTable.tsx
    - src/App.tsx

key-decisions:
  - "execute_batch with string-built SQL for atomic playlist reorder -- avoids &mut self requirement of rusqlite transaction(), follows run_migrations pattern already in codebase"
  - "BPM as energy proxy for energy arc -- loudness_lufs is never populated so BPM is the only available energy signal in Phase 4"
  - "Transition issues section only shows pairs with at least one issue (bpm bad OR key clash) -- reduces noise for well-organized playlists"
  - "lucide-react icon names differ from docs: Loader (not Loader2), Wand (not Wand2), CircleCheck (not CheckCircle2), Activity (not BarChart2)"
  - "Mix Prep entry point in TrackTable toolbar via new onOpenMixPrep prop -- consistent with existing onGetPlaylistRecommendations pattern"

patterns-established:
  - "SVG energy arc: BPM-normalized bars with hsl(hue, 70%, 50%) where hue = (1 - normalized) * 120 maps low BPM to green, high BPM to red"
  - "Minimum 4px bar height for tracks without BPM -- ensures no invisible bars"
  - "AI panel modal: AnimatePresence + motion.div for enter/exit, backdrop click closes, Escape key closes"

requirements-completed: [MIXP-01, MIXP-02, MIXP-03]

# Metrics
duration: 18min
completed: 2026-02-28
---

# Phase 4 Plan 02: Mix Prep Panel Summary

**AI playlist reordering (MIXP-01) + BPM energy arc SVG visualization (MIXP-02) + transition issue detection (MIXP-03) delivered as MixPrepPanel modal with atomic DB reorder**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-02-28T22:17:47Z
- **Completed:** 2026-02-28T22:35:00Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- `ai_optimize_playlist_order` Tauri command sends playlist tracks to Claude and returns `RecommendedOrder` (track_ids + reasoning)
- `reorder_playlist_tracks` DB method atomically updates all position values using execute_batch with explicit BEGIN/COMMIT
- `MixPrepPanel` modal renders three sections: energy arc SVG, transition issues list, AI suggested order with Apply button
- Mix Prep button wired into TrackTable playlist toolbar alongside existing Recommend button
- Low BPM data banner shown when < 50% of tracks have BPM analysis

## Task Commits

1. **Task 1: Backend commands + frontend API wrappers** - `cf1e70f` (feat)
2. **Task 2: MixPrepPanel component, CSS, App wiring** - `734046a` (feat)

## Files Created/Modified

- `src-tauri/src/commands/ai.rs` - Added RecommendedOrder struct and ai_optimize_playlist_order command
- `src-tauri/src/db/mod.rs` - Added reorder_playlist_tracks with execute_batch atomicity
- `src-tauri/src/commands/playlists.rs` - Added reorder_playlist_tracks Tauri command
- `src-tauri/src/lib.rs` - Registered both new commands in invoke_handler
- `src/lib/tauri-api.ts` - Added aiOptimizePlaylistOrder and reorderPlaylistTracks wrappers
- `src/types/ai.ts` - Added RecommendedOrder TypeScript interface
- `src/components/ai/MixPrepPanel.tsx` - New modal component (energy arc, transitions, AI order)
- `src/components/ai/MixPrepPanel.css` - Dark theme styles matching RecoDeck UI
- `src/components/TrackTable.tsx` - Added onOpenMixPrep prop and Mix Prep toolbar button
- `src/App.tsx` - Added mixPrepPlaylist state, handleOpenMixPrep callback, MixPrepPanel render

## Decisions Made

- Used `execute_batch` with string-built SQL for atomic reorder instead of `rusqlite::transaction()` which requires `&mut self` -- matches the `run_migrations` pattern already in the codebase
- BPM used as energy proxy for energy arc since `loudness_lufs` is never populated (commented in code)
- Transition issues section filters to only pairs with at least one issue -- reduces noise for clean playlists
- Lucide icon names in this version differ: `Loader` not `Loader2`, `Wand` not `Wand2`, `CircleCheck` not `CheckCircle2`, `Activity` not `BarChart2`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected lucide-react icon names**
- **Found during:** Task 2 (MixPrepPanel component) — TypeScript compilation errors
- **Issue:** Plan specified Loader2, Wand2, CheckCircle2, BarChart2 -- none of these exist in the installed lucide-react version
- **Fix:** Replaced with correct names: Loader, Wand, CircleCheck, Activity
- **Files modified:** src/components/ai/MixPrepPanel.tsx
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** 734046a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: wrong icon names)
**Impact on plan:** Icon name correction was required for compilation. All planned functionality delivered as specified.

## Issues Encountered

None beyond the icon name fix above.

## User Setup Required

None - no external service configuration required (API key already configured in Phase 3).

## Next Phase Readiness

Phase 4 is now complete. All planned requirements delivered:
- DISC-01 (AI similar track recommendations) -- Phase 04-01
- DISC-02 (AI playlist vibe recommendations) -- Phase 04-01
- MIXP-01 (AI playlist order optimization) -- Phase 04-02
- MIXP-02 (Energy arc visualization) -- Phase 04-02
- MIXP-03 (Transition issue detection) -- Phase 04-02

The v1.0 milestone is complete.

## Self-Check: PASSED

Files confirmed present:
- src/components/ai/MixPrepPanel.tsx -- exists (export function MixPrepPanel confirmed)
- src/components/ai/MixPrepPanel.css -- exists
- Commits cf1e70f and 734046a -- confirmed in git log

---
*Phase: 04-ai-discovery-and-mix-prep*
*Completed: 2026-02-28*
