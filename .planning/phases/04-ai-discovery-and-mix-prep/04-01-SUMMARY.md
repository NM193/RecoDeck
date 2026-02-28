---
phase: 04-ai-discovery-and-mix-prep
plan: 01
subsystem: ai-recommendations
tags: [ai, recommendations, rust, react, tauri, disc-01, disc-02, disc-03]
dependency_graph:
  requires:
    - 03-02-SUMMARY.md  # AIPlaylistDialog, ClaudeClient, SYSTEM_PROMPT, build_seed_context
  provides:
    - ai_recommend_similar Tauri command
    - ai_recommend_for_playlist Tauri command
    - RecommendationsPanel slide-in UI component
    - musicUtils shared library
  affects:
    - src/components/Player.tsx (new Compass button)
    - src/App.tsx (recommendation state management)
    - src/components/TrackTable.tsx (playlist recommendation entry point)
tech_stack:
  added: []
  patterns:
    - pub(crate) visibility for cross-module method sharing
    - Two-mode component props (seedTrack | playlistId)
    - Median BPM aggregation and most-common-key analysis for playlist profiling
    - IIFE in JSX for conditional rendering with computed values
key_files:
  created:
    - src-tauri/src/commands/ai.rs (ai_recommend_similar, ai_recommend_for_playlist)
    - src/lib/musicUtils.ts
    - src/components/ai/RecommendationsPanel.tsx
    - src/components/ai/RecommendationsPanel.css
  modified:
    - src-tauri/src/ai/claude_client.rs (extract_json pub(crate))
    - src-tauri/src/lib.rs (two new command registrations)
    - src/lib/tauri-api.ts (aiRecommendSimilar, aiRecommendForPlaylist)
    - src/types/ai.ts (RecommendationResult interface)
    - src/components/ai/AIPlaylistDialog.tsx (import from musicUtils)
    - src/components/Player.tsx (onGetRecommendations prop + Compass button)
    - src/App.tsx (recommendationSeed state, handlers, RecommendationsPanel render)
    - src/components/TrackTable.tsx (onGetPlaylistRecommendations prop + toolbar button)
    - src/components/TrackTable.css (ai-rec button styles, search flex layout)
decisions:
  - extract_json made pub(crate) rather than pub -- limits scope to crate, sufficient for new commands
  - RecommendationsPanel is a slide-in drawer (not modal) -- users can see library behind it
  - Playlist entry point (DISC-02) placed in TrackTable search toolbar rather than FolderTree context menu -- avoids FolderTree surgery, visible when a playlist is active
  - playlistId != null guard used for "Add to playlist" button -- only shown in playlist recommendation mode
  - Median BPM (not mean) used for playlist aggregate -- more robust to BPM outliers
metrics:
  duration: 13 min
  completed: "2026-02-28"
  tasks: 3
  files_modified: 9
  files_created: 4
---

# Phase 4 Plan 1: AI Track Recommendations Summary

**One-liner:** Two Tauri commands for library-scoped AI recommendations (by seed track + by playlist vibe) with a slide-in RecommendationsPanel UI and shared musicUtils module.

## What Was Built

### Backend (Rust)

**`ClaudeClient::extract_json` made `pub(crate)`** — required for new recommendation commands to call JSON extraction without going through the full `generate_playlist` flow.

**`ai_recommend_similar` command** — accepts `seed_track_id` and `count`, fetches the seed track's BPM/key, builds a seed-aware library context via `TrackContextBuilder::build_seed_context`, sends a targeted prompt to Claude, and returns `RecommendationResult { track_ids, reasoning }`. Satisfies DISC-01.

**`ai_recommend_for_playlist` command** — accepts `playlist_id` and `count`, loads all playlist tracks, calculates median BPM and most-common key, builds the library context filtered around the playlist's aggregate profile, excludes current playlist track IDs from the prompt, and returns `RecommendationResult`. Satisfies DISC-02.

Both commands registered in `lib.rs` invoke handler. All recommendations draw exclusively from the user's library context — no external data. Satisfies DISC-03.

### Frontend (TypeScript/React)

**`src/lib/musicUtils.ts`** — shared `getKeyCompatibility` and `getBpmIssue` functions extracted from `AIPlaylistDialog.tsx`. Exports `KeyCompatibility` and `BpmIssue` types.

**`RecommendationResult` interface** — added to `src/types/ai.ts`.

**`tauriApi.aiRecommendSimilar` and `tauriApi.aiRecommendForPlaylist`** — added to `src/lib/tauri-api.ts`.

**`RecommendationsPanel` component** — slide-in right drawer (400px wide) that auto-fetches on mount. Supports two modes via props: `seedTrack` (DISC-01) and `playlistId` (DISC-02). Shows generating spinner, track list with play/add buttons, collapsible AI reasoning, and error/retry state. Uses framer-motion slide-in animation from right.

**Player Compass button** (DISC-01 entry point) — added after Sparkles button, disabled when no track loaded.

**TrackTable Recommend button** (DISC-02 entry point) — green Compass button in search toolbar, only visible when a playlist is selected.

**App.tsx** — manages `recommendationSeed` state, handlers for both entry points, renders `RecommendationsPanel` when seed is set.

## Commits

| Hash | Message |
|------|---------|
| 3450ad6 | feat(04-01): add ai_recommend_similar and ai_recommend_for_playlist commands |
| cd7aec6 | refactor(04-01): extract shared music utilities from AIPlaylistDialog |
| 3806627 | feat(04-01): add RecommendationsPanel and wire into Player and App |

## Deviations from Plan

None — plan executed exactly as written. The playlist entry point used TrackTable search toolbar (the plan's alternative approach) rather than FolderTree context menu, which is a minor implementation detail within the plan's defined scope.

## Self-Check: PASSED

All key files exist. All commits verified in git log.

| Item | Status |
|------|--------|
| src/lib/musicUtils.ts | FOUND |
| src/components/ai/RecommendationsPanel.tsx | FOUND |
| src/components/ai/RecommendationsPanel.css | FOUND |
| commit 3450ad6 | FOUND |
| commit cd7aec6 | FOUND |
| commit 3806627 | FOUND |
