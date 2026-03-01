# Roadmap: RecoDeck

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-01)
- 🚧 **v1.1 Spotify Redesign** — Phases 5-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Codebase Quality (2/2 plans) — completed 2026-02-28
- [x] Phase 2: Mobile Companion (3/3 plans) — completed 2026-02-28
- [x] Phase 3: AI Playlists (2/2 plans) — completed 2026-02-28
- [x] Phase 4: AI Discovery and Mix Prep (2/2 plans) — completed 2026-02-28

</details>

### 🚧 v1.1 Spotify Redesign (In Progress)

**Milestone Goal:** Stabilize the codebase (tech debt, testing, linting) then redesign the entire UI to match Spotify's desktop design language.

- [ ] **Phase 5: Foundation Cleanup** — Eliminate tech debt and enforce code quality tooling
- [ ] **Phase 6: Test Coverage** — Rust backend tests and frontend Vitest coverage
- [ ] **Phase 7: UI Foundation** — Spotify dark theme, typography, spacing, and component system
- [ ] **Phase 8: UI Layout** — Sidebar navigation, album art grids, now-playing bar, view transitions
- [ ] **Phase 9: UI Views and Mobile** — Track table, playlist view, search, and mobile PWA update

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
**Plans**: TBD

Plans:
- [x] 05-01: Fix aiStore error handling and consolidate audio_mime_type — completed 2026-03-01
- [ ] 05-02: Remove dead code, configure ESLint 9 + Prettier 3, run full lint pass

### Phase 6: Test Coverage
**Goal**: Core backend logic and frontend utilities have automated tests, so regressions are caught before they reach users
**Depends on**: Phase 5 (clean codebase baseline before writing tests)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. `cargo test` passes and covers database CRUD operations, BPM detection, key detection, and AI context building
  2. Vitest is configured with a global Tauri IPC mock so `npm test` runs without `__TAURI_IPC__` errors
  3. `musicUtils.ts` key compatibility and BPM quality functions are covered by passing Vitest tests
  4. Zustand store action logic for playerStore and aiStore is covered by passing Vitest tests
**Plans**: TBD

Plans:
- [ ] 06-01: Expand Rust tests for db CRUD, AI context builder, audio analysis
- [ ] 06-02: Configure Vitest with global IPC mock, add musicUtils and store tests

### Phase 7: UI Foundation
**Goal**: A consistent Spotify-style visual language is established as design tokens and a component library that every screen in the app uses
**Depends on**: Phase 5 (lint-clean codebase; no dead CSS to audit against)
**Requirements**: UIUX-01, UIUX-09
**Success Criteria** (what must be TRUE):
  1. The app renders in a Spotify-style dark palette with consistent typography and spacing — no hardcoded hex colors remain in CSS files
  2. Buttons, inputs, cards, and modals share a single styled component system applied identically across all views
**Plans**: TBD

Plans:
- [ ] 07-01: Implement Spotify dark theme tokens, typography scale, and spacing system
- [ ] 07-02: Apply consistent component styling across buttons, inputs, cards, and modals

### Phase 8: UI Layout
**Goal**: The primary navigation and playback chrome match Spotify's desktop layout — sidebar on the left, album grid in the main area, now-playing bar fixed at the bottom
**Depends on**: Phase 7 (design tokens and component system must exist before laying out screens)
**Requirements**: UIUX-02, UIUX-03, UIUX-04, UIUX-05
**Success Criteria** (what must be TRUE):
  1. A persistent sidebar shows library sections and the playlist list; clicking any section navigates without a full page reload
  2. The library main area displays tracks and albums in an album art grid
  3. The now-playing bar is fixed at the bottom of every view with track info, playback controls, and a progress bar
  4. All view changes animate smoothly with Framer Motion transitions — no jarring instant swaps
**Plans**: TBD

Plans:
- [ ] 08-01: Redesign sidebar navigation with library sections and playlist list
- [ ] 08-02: Implement album art grid views and redesign now-playing bar
- [ ] 08-03: Add Framer Motion transitions across all view changes

### Phase 9: UI Views and Mobile
**Goal**: Every remaining content view — track table, playlist detail, search results — matches the Spotify design language, and the mobile PWA reflects the new desktop design
**Depends on**: Phase 8 (layout chrome must exist before styling content views inside it)
**Requirements**: UIUX-06, UIUX-07, UIUX-08, UIUX-10
**Success Criteria** (what must be TRUE):
  1. The track table shows Spotify-style hover states and row selection; clicking a row plays the track
  2. Opening a playlist shows a header with art, playlist metadata, and a Spotify-style track listing
  3. The search experience returns results in a Spotify-style layout with sections for tracks, albums, and artists
  4. The mobile PWA companion renders the same dark theme and layout conventions as the redesigned desktop app
**Plans**: TBD

Plans:
- [ ] 09-01: Redesign track table with Spotify hover states and selection
- [ ] 09-02: Redesign playlist view with header art, metadata, and track listing
- [ ] 09-03: Redesign search results layout and update mobile PWA to new design language

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Codebase Quality | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. Mobile Companion | v1.0 | 3/3 | Complete | 2026-02-28 |
| 3. AI Playlists | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. AI Discovery and Mix Prep | v1.0 | 2/2 | Complete | 2026-02-28 |
| 5. Foundation Cleanup | v1.1 | 1/2 | In progress | - |
| 6. Test Coverage | v1.1 | 0/2 | Not started | - |
| 7. UI Foundation | v1.1 | 0/2 | Not started | - |
| 8. UI Layout | v1.1 | 0/3 | Not started | - |
| 9. UI Views and Mobile | v1.1 | 0/3 | Not started | - |
