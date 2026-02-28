---
phase: 02-mobile-companion
plan: 01
subsystem: api
tags: [axum, rust, tauri, react, mobile, pwa, qr-code]

# Dependency graph
requires:
  - phase: 01-codebase-quality
    provides: clean Rust codebase with zero warnings, AppError enum, stable db module
provides:
  - RunningServer with server_state Arc<CompanionServerState> for live metrics
  - get_companion_status returns real active_streams count (not hardcoded 0)
  - SharePlaylistModal component for per-playlist QR code sharing
  - /api/playlists/{id}/tracks endpoint for mobile playlist view
  - All mobile companion code committed as working baseline
affects:
  - 02-02-search-tracks
  - 02-03-e2e-verification

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Store Arc<CompanionServerState> in RunningServer to give Tauri commands access to live server metrics
    - Clone Arc before .with_state() to retain reference for RunningServer struct

key-files:
  created:
    - src/components/SharePlaylistModal.tsx
    - src/components/SharePlaylistModal.css
  modified:
    - src-tauri/src/server/mod.rs
    - src-tauri/src/commands/server.rs
    - src-tauri/src/server/routes.rs
    - src-tauri/tauri.conf.json
    - src/App.tsx
    - src/components/FolderTree.tsx
    - src/components/Settings.tsx
    - src/lib/http-api.ts
    - mobile/App.tsx
    - mobile/main.tsx
    - mobile/mobile.css
    - mobile/components/MobileTrackList.tsx

key-decisions:
  - "Arc clone before .with_state() -- axum consumes Arc on .with_state(), so we clone before passing to retain a reference for RunningServer.server_state"
  - "Capture active_stream_count() before moving RunningServer into Mutex in auto_start_companion -- avoids deadlock from re-locking while constructing CompanionServerInfo"

patterns-established:
  - "RunningServer carries server_state: Arc<CompanionServerState> so Tauri commands can query live metrics without storing a separate Arc"
  - "active_stream_count() accessed via RunningServer.server_state before the RunningServer is moved into the Mutex"

requirements-completed: [MOBL-01, MOBL-02, MOBL-06]

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 2 Plan 1: Mobile Companion Baseline Summary

**Axum companion server with live active_streams via Arc<CompanionServerState> in RunningServer, plus QR-based playlist sharing and full mobile PWA baseline committed**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-28T21:26:00Z
- **Completed:** 2026-02-28T21:34:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Fixed `get_companion_status` to return real active stream count from `CompanionServerState.active_streams` (AtomicUsize) instead of hardcoded 0
- Added `server_state: Arc<CompanionServerState>` field to `RunningServer` struct so Tauri commands can query live server metrics without a separate state reference
- Committed all uncommitted mobile companion code (SharePlaylistModal, FolderTree playlist sharing, Settings companion tab, mobile PWA improvements) as a coherent baseline

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix active_streams status and store server state reference in RunningServer** - `0edd09d` (feat) - code changes in mod.rs and commands/server.rs
2. **Task 2: Commit all uncommitted mobile companion changes** - `0edd09d` (feat) - all companion files staged and committed together in one coherent commit per plan spec

_Note: Tasks 1 and 2 were committed as a single atomic commit per the plan's spec (Task 2 explicitly stages the Task 1 changes alongside all other companion files)._

## Files Created/Modified
- `src-tauri/src/server/mod.rs` - Added `server_state: Arc<CompanionServerState>` to `RunningServer`; cloned Arc before `.with_state()` to retain reference
- `src-tauri/src/commands/server.rs` - `get_companion_status`, `start_companion_server`, and `auto_start_companion` now call `server_state.active_stream_count()` instead of hardcoded 0
- `src-tauri/src/server/routes.rs` - `/api/playlists/{id}/tracks` endpoint for mobile playlist view
- `src-tauri/tauri.conf.json` - `beforeBuildCommand` includes `mobile:build` for production bundles
- `src/App.tsx` - `handleSharePlaylist` + `SharePlaylistModal` integration
- `src/components/FolderTree.tsx` - `onSharePlaylist` prop wiring in context menu
- `src/components/Settings.tsx` - Companion UI improvements (start/stop toggle, QR, URL, token, streams count, autostart)
- `src/lib/http-api.ts` - Playlist tracks endpoint client
- `src/components/SharePlaylistModal.tsx` - QR code modal for per-playlist sharing (new file)
- `src/components/SharePlaylistModal.css` - Styles for SharePlaylistModal (new file)
- `mobile/App.tsx` - Paste-link UX, token injection fallbacks for PWA standalone mode
- `mobile/main.tsx` - Error boundary improvements
- `mobile/mobile.css` - Paste-link styles
- `mobile/components/MobileTrackList.tsx` - Playlist mode with playlist name header

## Decisions Made
- **Arc clone before `.with_state()`**: axum's `.with_state()` consumes the Arc (moves it), so we call `.with_state(state.clone())` to pass a clone to axum while retaining the original `state` for `RunningServer.server_state`. This is correct and cheap since Arc clone is just a reference-count increment.
- **Capture `active_stream_count()` before moving RunningServer**: In `auto_start_companion`, we call `running.server_state.active_stream_count()` and store the result before `*lock = Some(running)` moves the RunningServer. This avoids a deadlock that would occur from re-locking `companion_state.running_server` while trying to read from it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Arc moved before use in RunningServer constructor**
- **Found during:** Task 1 (Fix active_streams status and store server state reference in RunningServer)
- **Issue:** After adding `server_state: state` to RunningServer, `cargo check` reported E0382 — `state` was already moved into `.with_state(state)` before being used in the struct literal
- **Fix:** Changed `.with_state(state)` to `.with_state(state.clone())` so the original `state` Arc remains available for `RunningServer.server_state`
- **Files modified:** `src-tauri/src/server/mod.rs`
- **Verification:** `cargo check` passes with zero errors after fix
- **Committed in:** `0edd09d` (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Necessary correctness fix discovered at compile time. No scope creep.

## Issues Encountered
- Arc move error (E0382) on first compile attempt — standard Rust ownership constraint when you need to both pass an Arc to a consuming API and retain it. Fixed by cloning.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server infrastructure committed and working as baseline
- `RunningServer.server_state` Arc enables live metrics access for future features
- Bearer token auth middleware verified working in code
- QR playlist sharing UI committed
- Ready for 02-02 (search_tracks BPM/key data fix) and 02-03 (E2E verification)
- No blockers

---
*Phase: 02-mobile-companion*
*Completed: 2026-02-28*
