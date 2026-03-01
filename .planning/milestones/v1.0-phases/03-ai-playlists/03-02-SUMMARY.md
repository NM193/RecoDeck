---
phase: 03-ai-playlists
plan: 02
subsystem: frontend/ai
tags: [react, modal, audio, ai, playlist, ui]
dependency_graph:
  requires:
    - 03-01-PLAN.md
  provides:
    - AIPlaylistDialog component (two-step modal for AI playlist generation)
    - Context menu item in TrackTable
    - Sparkles button in Player bar
  affects:
    - src/App.tsx (dialog state management)
    - src/components/TrackTable.tsx (context menu)
    - src/components/Player.tsx (player bar)
tech_stack:
  added:
    - framer-motion AnimatePresence for dialog enter/exit animations
  patterns:
    - Two-step modal (config -> results) with local state only
    - Camelot wheel key compatibility computed inline
    - Transition indicators between adjacent tracks (BPM delta + key compat)
    - audioPlayer.loadTrack + play for track row previews
key_files:
  created:
    - src/components/ai/AIPlaylistDialog.tsx
    - src/components/ai/AIPlaylistDialog.css
  modified:
    - src/components/TrackTable.tsx
    - src/components/Player.tsx
    - src/App.tsx
decisions:
  - "AlertTriangle icon replaced with TriangleAlert (correct lucide-react name for the version in use)"
metrics:
  duration: 4 min
  completed: "2026-02-28"
  tasks_completed: 2
  files_modified: 5
---

# Phase 3 Plan 2: AI Playlist Dialog UI Summary

**One-liner:** Two-step AIPlaylistDialog modal with energy direction segmented control, Camelot transition indicators, per-row audio preview, and save flow wired into TrackTable context menu and Player bar Sparkles button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create AIPlaylistDialog component and CSS | 158a540 | src/components/ai/AIPlaylistDialog.tsx, src/components/ai/AIPlaylistDialog.css |
| 2 | Wire AIPlaylistDialog into TrackTable, Player, and App | b1f2631 | src/components/TrackTable.tsx, src/components/Player.tsx, src/App.tsx |

## What Was Built

### AIPlaylistDialog (158a540)

A two-step modal component at `src/components/ai/AIPlaylistDialog.tsx`:

**Step 1 — Config:**
- Seed track display (title, artist, BPM badge, key badge)
- Energy direction segmented control (`Build Up / Maintain / Wind Down`) with `role="radiogroup"` + `role="radio"` accessibility pattern
- Duration preset buttons: 30 min / 1 hr / 1.5 hr / 2 hr

**Generating state:**
- Loading spinner with "Curating your playlist..." text
- Calls `tauriApi.aiGeneratePlaylistFromSeed(seedTrack.id, energyDirection, targetDurationMin)`
- Fetches full Track objects via `Promise.all` + `tauriApi.getTrack`; filters out null (hallucinated IDs)

**Step 2 — Results:**
- AI reasoning in `<details>` (collapsed by default)
- Duration summary: total estimated time vs requested; warning when < 75% of target
- Energy direction segmented control (visible for regeneration)
- Track list with per-row:
  - Play button: `audioPlayer.loadTrack + audioPlayer.play` + `usePlayerStore.setCurrentTrack`
  - Title, Artist, BPM badge, Key badge
  - Remove (X) button — excluded from save
- Transition indicators between adjacent tracks:
  - BPM delta: green (0-5), yellow (6-10), red (11+)
  - Key compatibility: `getKeyCompatibility` inline Camelot wheel parser — perfect/compatible/clash colored green/yellow/red

**Save flow:**
- "Save Playlist" advances to saving step
- Name input pre-filled with `result.name`
- `tauriApi.createPlaylist(name, null)` then `addTrackToPlaylist` loop for active track IDs
- Calls `onPlaylistSaved(playlist.id)` then `onClose()`

**Regeneration:**
- "Regenerate" button re-runs the generate flow with current energy direction (no dialog close)

**CSS:**
- Dark theme using `var(--accent)`, `var(--border)`, `var(--bg-secondary)` custom properties
- Fixed overlay + centered panel (max-width 600px, max-height 80vh)
- Gradient header matching PlayerAIChat style

### App Wiring (b1f2631)

**TrackTable.tsx:**
- New prop: `onGenerateAIPlaylist?: (track: Track) => void`
- Context menu item with separator + "Generate AI Playlist" + Sparkles icon
- Item only renders when prop is provided

**Player.tsx:**
- New prop: `onGenerateAIPlaylist?: (track: Track) => void`
- Added `Track` to type import from `../types/track`
- Sparkles button in `sc-player__right` after playlist-wrapper — disabled when no current track

**App.tsx:**
- Import: `AIPlaylistDialog` from `./components/ai/AIPlaylistDialog`
- State: `aiPlaylistSeedTrack: Track | null`
- Handler: `handleGenerateAIPlaylist = useCallback((track) => setAiPlaylistSeedTrack(track), [])`
- Both TrackTable and Player receive `onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}`
- Dialog rendered after PlayerAIChat block when `AI_ENABLED && aiPlaylistSeedTrack`
- `onPlaylistSaved` triggers `loadPlaylists()` + success notification

## Verification Results

| Check | Expected | Result |
|-------|----------|--------|
| "Generate AI Playlist" in TrackTable | >=1 | 2 |
| "Generate AI Playlist from this track" in Player | 1 | 1 |
| `export function AIPlaylistDialog` | 1 | 1 |
| `AIPlaylistDialog` in App.tsx | >=2 | 2 |
| radiogroup/role="radio" | >=2 | 4 |
| getKeyCompatibility/bpmDelta | >=2 | 7 |
| audioPlayer.loadTrack/play | >=2 | 2 |
| createPlaylist/addTrackToPlaylist | >=2 | 2 |
| TypeScript compilation | zero errors | PASSED |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used wrong Lucide icon name `AlertTriangle`**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `AlertTriangle` does not exist in the installed version of lucide-react; TypeScript reported a type error on the `name` prop
- **Fix:** Replaced with `TriangleAlert` (the correct name in lucide-react v0.4+)
- **Files modified:** `src/components/ai/AIPlaylistDialog.tsx`
- **Commit:** 158a540 (included in same commit, fix was applied before commit)

## Self-Check: PASSED

- FOUND: src/components/ai/AIPlaylistDialog.tsx
- FOUND: src/components/ai/AIPlaylistDialog.css
- Commit 158a540 exists (feat(03-02): add AIPlaylistDialog component and CSS)
- Commit b1f2631 exists (feat(03-02): wire AIPlaylistDialog into TrackTable, Player, and App)
- TypeScript: zero errors
