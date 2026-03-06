# Roadmap: RecoDeck

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-01)
- ✅ **v1.1 Spotify Redesign** — Phases 5-9 (shipped 2026-03-06)
- ✅ **v1.2 Playback & UX Polish** — Phases 10-11 (shipped 2026-03-06)
- 🚧 **v1.3 Library UX & Duplicate Management** — Phases 12-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Codebase Quality (2/2 plans) — completed 2026-02-28
- [x] Phase 2: Mobile Companion (3/3 plans) — completed 2026-02-28
- [x] Phase 3: AI Playlists (2/2 plans) — completed 2026-02-28
- [x] Phase 4: AI Discovery and Mix Prep (2/2 plans) — completed 2026-02-28

</details>

<details>
<summary>✅ v1.1 Spotify Redesign (Phases 5-9) — SHIPPED 2026-03-06</summary>

- [x] Phase 5: Foundation Cleanup — completed 2026-03-01
- [x] Phase 6: Test Coverage — completed 2026-03-01
- [x] Phase 7: UI Foundation — completed 2026-03-01
- [x] Phase 8: UI Layout — completed 2026-03-06
- [x] Phase 9: UI Views and Mobile — completed 2026-03-06

</details>

<details>
<summary>✅ v1.2 Playback & UX Polish (Phases 10-11) — SHIPPED 2026-03-06</summary>

- [x] Phase 10: Settings Cleanup — completed 2026-03-06
- [x] Phase 11: Playback Bug Fixes — completed 2026-03-06

</details>

### 🚧 v1.3 Library UX & Duplicate Management (In Progress)

**Milestone Goal:** Fix track table layout on window resize, load the full library upfront without scroll-to-load, and add a review-before-delete duplicate tracks dialog.

- [x] **Phase 12: CSS Layout Fix** — Track table rows and header extend to full window width at any window size (completed 2026-03-06)
- [ ] **Phase 13: Full Library Load** — All tracks load on startup; scroll-to-load pagination removed
- [ ] **Phase 14: Duplicate Review Dialog** — Review-before-delete duplicate management with selective per-track deletion

## Phase Details

### Phase 5: Foundation Cleanup
**Goal**: The codebase is clean — no dead code, no duplicate functions, no broken error paths, and all new code is formatted and linted consistently
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05, QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. AI error messages display human-readable text instead of `[object Object]` when the Claude API fails
  2. `cargo clippy` exits clean with zero warnings
  3. `npm run lint` passes with zero ESLint errors across all frontend files
  4. `npm run format:check` reports no formatting violations
  5. The greet stub and orphaned `/api/tracks/{id}` route no longer exist in the codebase
**Plans**: 2 plans

Plans:
- [x] 05-01: Fix aiStore error handling and consolidate audio_mime_type — completed 2026-03-01
- [x] 05-02: Remove dead code, configure ESLint 9 + Prettier 3, run full lint pass — completed 2026-03-01

### Phase 6: Test Coverage
**Goal**: Core backend logic and frontend utilities have automated tests, so regressions are caught before they reach users
**Depends on**: Phase 5 (clean codebase baseline before writing tests)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. `cargo test` passes and covers database CRUD operations, BPM detection, key detection, and AI context building
  2. Vitest is configured with a global Tauri IPC mock so `npm test` runs without `__TAURI_IPC__` errors
  3. `musicUtils.ts` key compatibility and BPM quality functions are covered by passing Vitest tests
  4. Zustand store action logic for playerStore and aiStore is covered by passing Vitest tests
**Plans**: 2 plans

Plans:
- [x] 06-01: Expand Rust context_builder tests — completed 2026-03-01
- [x] 06-02: Configure Vitest 4 + jsdom + global IPC mock, add musicUtils and store tests — completed 2026-03-01

### Phase 7: UI Foundation
**Goal**: A consistent Spotify-style visual language is established as design tokens and a component library that every screen in the app uses
**Depends on**: Phase 5
**Requirements**: UIUX-01, UIUX-09
**Success Criteria** (what must be TRUE):
  1. The app renders in a Spotify-style dark palette with consistent typography and spacing — no hardcoded hex colors remain in CSS files
  2. Buttons, inputs, cards, and modals share a single styled component system applied identically across all views
**Plans**: 2 plans

Plans:
- [x] 07-01: Implement Spotify dark theme tokens, typography scale, and spacing system — completed 2026-03-01
- [x] 07-02: Apply consistent component styling across buttons, inputs, cards, and modals — completed 2026-03-01

### Phase 8: UI Layout
**Goal**: The primary navigation and playback chrome match Spotify's desktop layout — sidebar on the left, main content area in the center, now-playing bar fixed at the bottom
**Depends on**: Phase 7
**Requirements**: UIUX-02, UIUX-03, UIUX-04, UIUX-05
**Success Criteria** (what must be TRUE):
  1. A persistent sidebar shows library sections and the playlist list; clicking any section navigates without a full page reload
  2. The now-playing bar is fixed at the bottom of every view with track info, playback controls, and a progress bar
  3. All view changes animate smoothly with Framer Motion transitions
**Plans**: 3 plans

Plans:
- [x] 08-01: CSS Grid AppShell, resizable sidebar with collapsible sections, Rust album art extraction command — completed 2026-03-06
- [x] 08-02: 3-column NowPlayingBar, HomeView with playlist card grid, PlaylistDetailHeader — completed 2026-03-06
- [x] 08-03: Framer Motion AnimatePresence crossfade transitions and expandable now-playing view — completed 2026-03-06

### Phase 9: UI Views and Mobile
**Goal**: Every remaining content view — track table, playlist detail, search results — matches the Spotify design language, and the mobile PWA reflects the new desktop design
**Depends on**: Phase 8
**Requirements**: UIUX-06, UIUX-07, UIUX-08, UIUX-10
**Success Criteria** (what must be TRUE):
  1. The track table shows Spotify-style hover states and row selection; clicking a row plays the track
  2. Opening a playlist shows a header with art, playlist metadata, and a Spotify-style track listing
  3. The search experience returns results in a Spotify-style layout with sections for tracks, albums, and artists
  4. The mobile PWA companion renders the same dark theme and layout conventions as the redesigned desktop app
**Plans**: 3 plans

Plans:
- [x] 09-01: TrackTable Spotify redesign — completed 2026-03-06
- [x] 09-02: SearchView new component with sectioned results — completed 2026-03-06
- [x] 09-03: Mobile PWA CSS token alignment to desktop midnight theme — completed 2026-03-06

### Phase 10: Settings Cleanup
**Goal**: The Settings panel shows only the two supported themes; Key Notation and Waveform Style settings are gone from the UI and from all code paths — Camelot and Traktor RGB are hardcoded defaults
**Depends on**: Phase 9 (v1.1 complete)
**Requirements**: SETT-01, SETT-02, SETT-03
**Success Criteria** (what must be TRUE):
  1. Settings > Appearance shows only Midnight and Carbon theme options — no other theme choices are visible
  2. Key Notation is not present anywhere in the Settings UI; all keys display in Camelot notation throughout the app
  3. Waveform Style is not present anywhere in the Settings UI; waveforms always render in Traktor RGB style
  4. `grep -r "key_notation\|waveform_style" src/` returns zero hits
**Plans**: 1 plan

Plans:
- [x] 10-01: Strip Key Notation and Waveform Style settings; trim THEMES to Midnight and Carbon — completed 2026-03-06

### Phase 11: Playback Bug Fixes
**Goal**: Tracks play to clean completion and manual skips during crossfade result in immediate, single-stream playback — no audio artifacts or orphaned background streams
**Depends on**: Phase 10
**Requirements**: PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. A VBR MP3 plays to its natural end and the next track begins without any repeated audio from the last few seconds of the previous track
  2. Pressing skip during an active crossfade immediately stops all audio; only the newly selected track plays
**Plans**: 1 plan

Plans:
- [x] 11-01: Fix SEEK_MARGIN_MS and add abortCrossfade() to loadTrack() — completed 2026-03-06

### Phase 12: CSS Layout Fix
**Goal**: Track table rows and header background extend to full window width at every window size — no whitespace gaps on wide displays and no broken row backgrounds on resize
**Depends on**: Phase 11 (v1.2 complete; clean UI baseline)
**Requirements**: LAYT-01, LAYT-02
**Success Criteria** (what must be TRUE):
  1. At any window width (800px, 1280px, 1920px), track table rows fill the full width — no blank gap appears to the right of the last column
  2. The track table header background fills the full window width — it does not stop at the column content boundary
  3. Horizontal scrolling activates only when the total column width exceeds the window width — not before
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md — Add min-width: 100% to .track-table-holder; visual verify at three window widths

### Phase 13: Full Library Load
**Goal**: The entire music library is visible in the track list immediately after app startup — no "Scroll for more" prompt, no partial library, and the track count in the UI reflects the actual full library size
**Depends on**: Phase 12 (CSS layout verified at correct widths before loading a large track set)
**Requirements**: LOAD-01, LOAD-02
**Success Criteria** (what must be TRUE):
  1. On startup, every track in the library is visible in the "All Tracks" view without scrolling to trigger additional loads
  2. The track count shown in the status bar and sidebar matches the total number of tracks in the database immediately after startup
  3. Sorting and searching operate on the full library — not on a capped first-page snapshot
**Plans**: TBD

### Phase 14: Duplicate Review Dialog
**Goal**: Users can review all duplicate track groups and selectively delete individual duplicates from a modal dialog — no track is deleted without explicit per-track confirmation, and the library refreshes accurately after deletion
**Depends on**: Phase 13 (full library load established; post-deletion library refresh calls the simplified getAllTracks() path)
**Requirements**: DUPL-01, DUPL-02, DUPL-03, DUPL-04
**Success Criteria** (what must be TRUE):
  1. Clicking "Review Duplicates" in Database Maintenance settings opens a modal dialog listing all duplicate groups
  2. Each duplicate group shows file path, date added, file size, and BPM for every track in the group
  3. The user can check or uncheck individual tracks within a group to select which ones to delete
  4. Confirming deletion removes only the checked tracks; the track table and track count update immediately to reflect the deletions without showing ghost entries
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Codebase Quality | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. Mobile Companion | v1.0 | 3/3 | Complete | 2026-02-28 |
| 3. AI Playlists | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. AI Discovery and Mix Prep | v1.0 | 2/2 | Complete | 2026-02-28 |
| 5. Foundation Cleanup | v1.1 | 2/2 | Complete | 2026-03-01 |
| 6. Test Coverage | v1.1 | 2/2 | Complete | 2026-03-01 |
| 7. UI Foundation | v1.1 | 2/2 | Complete | 2026-03-01 |
| 8. UI Layout | v1.1 | 3/3 | Complete | 2026-03-06 |
| 9. UI Views and Mobile | v1.1 | 3/3 | Complete | 2026-03-06 |
| 10. Settings Cleanup | v1.2 | 1/1 | Complete | 2026-03-06 |
| 11. Playback Bug Fixes | v1.2 | 1/1 | Complete | 2026-03-06 |
| 12. CSS Layout Fix | 1/1 | Complete   | 2026-03-06 | - |
| 13. Full Library Load | v1.3 | 0/? | Not started | - |
| 14. Duplicate Review Dialog | v1.3 | 0/? | Not started | - |
