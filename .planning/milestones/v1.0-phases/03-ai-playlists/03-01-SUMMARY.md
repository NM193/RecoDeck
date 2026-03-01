---
phase: 03-ai-playlists
plan: "01"
subsystem: backend-ai
tags: [ai, playlist-generation, seed-track, camelot, bpm]
dependency_graph:
  requires: [01-codebase-quality]
  provides: [ai_generate_playlist_from_seed-command, build_seed_context-method, EnergyDirection-type]
  affects: [src-tauri/src/commands/ai.rs, src-tauri/src/ai/context_builder.rs, src/lib/tauri-api.ts, src/types/ai.ts]
tech_stack:
  added: []
  patterns: [seed-aware-context-filtering, camelot-wheel-distance, energy-direction-prompting]
key_files:
  created: []
  modified:
    - src-tauri/src/ai/context_builder.rs
    - src-tauri/src/commands/ai.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri-api.ts
    - src/types/ai.ts
decisions:
  - Seed context uses OR logic (bpm_ok || key_ok) rather than AND -- AND was too restrictive and caused frequent fallback to full library
  - get_track returns rusqlite::Result<Track> not Option -- error message includes track ID for debuggability
  - Energy instructions injected into user prompt not system prompt -- system prompt stays generic and reusable
metrics:
  duration_min: 2
  completed_date: "2026-02-28"
  tasks_completed: 2
  files_modified: 5
---

# Phase 3 Plan 01: Seed-Track Playlist Backend Command Summary

**One-liner:** Seed-aware AI playlist backend using BPM/Camelot-filtered context and energy-direction-specific prompt construction (build_up/maintain/wind_down).

## What Was Built

Added `ai_generate_playlist_from_seed` Tauri command alongside the existing `ai_generate_playlist` (free-text flow). The new command accepts a seed track ID, energy direction, and target duration -- builds a filtered track context based on BPM and Camelot key proximity to the seed, injects energy-specific DJ progression instructions into the user prompt, and calls the existing `ClaudeClient::generate_playlist`.

Also added the `build_seed_context` method to `TrackContextBuilder` with circular Camelot wheel distance logic, and the frontend `tauriApi.aiGeneratePlaylistFromSeed()` wrapper with `EnergyDirection` type.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend command + context builder | 4d026a2 | context_builder.rs, commands/ai.rs, lib.rs |
| 2 | Frontend API wrapper + types | a2286d3 | tauri-api.ts, src/types/ai.ts |

## Decisions Made

1. **OR logic for seed filtering**: Tracks matching EITHER BPM neighborhood OR Camelot proximity are included. AND was too restrictive and frequently triggered the <20 fallback to full library context.
2. **User prompt injection for energy instructions**: Energy direction instructions (BPM progression, Camelot wheel direction) go into the structured user prompt, not the system prompt. The system prompt stays generic.
3. **Fallback behavior**: If seed has no BPM or key data, or if filtering yields <20 tracks, falls back to full library context (capped at 5000 tracks).
4. **get_track error handling**: `db.get_track()` returns `rusqlite::Result<Track>` (not Option), mapped to `AppError::Database` with the seed track ID in the error message for debuggability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted get_track error handling for non-Option return type**
- **Found during:** Task 1 (Step 2)
- **Issue:** Plan showed `get_track` returning `Result<Option<Track>>` requiring `.ok_or_else()`, but actual signature is `Result<Track>` (returns error directly on not-found via `QueryReturnedNoRows`)
- **Fix:** Removed `.ok_or_else()` pattern, mapped rusqlite error directly to `AppError::Database` with seed_track_id in message
- **Files modified:** src-tauri/src/commands/ai.rs
- **Commit:** 4d026a2

## Self-Check

### Files Exist
- [x] src-tauri/src/ai/context_builder.rs -- modified, build_seed_context added
- [x] src-tauri/src/commands/ai.rs -- modified, ai_generate_playlist_from_seed added
- [x] src-tauri/src/lib.rs -- modified, command registered
- [x] src/lib/tauri-api.ts -- modified, aiGeneratePlaylistFromSeed added
- [x] src/types/ai.ts -- modified, EnergyDirection exported

### Commits Exist
- [x] 4d026a2 -- Task 1 backend
- [x] a2286d3 -- Task 2 frontend

### Verification Results
- [x] cargo check: PASSED (zero errors)
- [x] tsc --noEmit: PASSED (zero errors)
- [x] ai_generate_playlist_from_seed exists in commands/ai.rs
- [x] build_seed_context exists in context_builder.rs
- [x] Command registered in lib.rs invoke_handler
- [x] aiGeneratePlaylistFromSeed in tauri-api.ts
- [x] Existing ai_generate_playlist untouched

## Self-Check: PASSED
