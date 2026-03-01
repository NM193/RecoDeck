# Requirements: RecoDeck

**Defined:** 2026-03-01
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.1 Requirements

Requirements for v1.1 Spotify Redesign. Each maps to roadmap phases.

### Tech Debt

- [x] **DEBT-01**: Fix aiStore.ts to use isAppError/getErrorMessage instead of instanceof Error for Tauri IPC error handling
- [x] **DEBT-02**: Extract duplicated audio_mime_type function to shared module (used in lib.rs and streaming.rs)
- [x] **DEBT-03**: Remove orphaned /api/tracks/{id} route and httpApi.getTrack() wrapper (verify no mobile PWA usage first)
- [x] **DEBT-04**: Remove greet command and handler from lib.rs
- [x] **DEBT-05**: Run cargo clippy and fix any remaining warnings

### Code Quality

- [x] **QUAL-01**: Configure ESLint 9 with flat config + typescript-eslint v8
- [x] **QUAL-02**: Configure Prettier 3 for consistent code formatting
- [x] **QUAL-03**: Fix all ESLint warnings/errors across the frontend codebase

### Test Coverage

- [x] **TEST-01**: Expand Rust tests for database CRUD operations (db/mod.rs)
- [x] **TEST-02**: Add Rust tests for AI context builder output (ai/context_builder.rs)
- [x] **TEST-03**: Add Rust tests for audio analysis functions (key detection, BPM)
- [x] **TEST-04**: Configure Vitest 3 with global Tauri IPC mock for frontend
- [x] **TEST-05**: Add frontend tests for musicUtils.ts (key compatibility, BPM quality)
- [x] **TEST-06**: Add frontend tests for Zustand stores

### UI/UX Spotify Redesign

- [x] **UIUX-01**: Implement Spotify-style dark theme (color palette, typography, spacing system)
- [x] **UIUX-02**: Redesign sidebar navigation with library sections and playlist list
- [x] **UIUX-03**: Implement album art grid views for library browsing
- [x] **UIUX-04**: Redesign now-playing bar fixed at bottom with track info, controls, progress
- [ ] **UIUX-05**: Add smooth Framer Motion transitions across all view changes
- [ ] **UIUX-06**: Redesign track table/list with Spotify-style hover states and selection
- [ ] **UIUX-07**: Redesign playlist view with header art, metadata, and track listing
- [ ] **UIUX-08**: Redesign search experience with Spotify-style results layout
- [x] **UIUX-09**: Apply consistent component styling (buttons, inputs, cards, modals) across entire app
- [ ] **UIUX-10**: Update mobile PWA companion to match new desktop design language

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Architecture

- **ARCH-01**: Refactor App.tsx state management (extract Zustand stores, reduce prop drilling)
- **ARCH-02**: Streaming file reads for stream:// protocol (avoid loading entire files into memory)

### Features

- **FEAT-01**: AI learning from user curation history
- **FEAT-02**: AI suggesting tracks to acquire
- **FEAT-03**: Playlist export to M3U/Rekordbox XML
- **FEAT-04**: Offline mobile caching

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full DJ mixing/performance software | RecoDeck is a library manager, not a CDJ replacement |
| Cloud sync / multi-device library | Local-first architecture |
| Music purchasing / streaming service integration | Works with files you own |
| App Store release | Targeting small group of DJ friends |
| Separate native mobile app | PWA served from desktop is the approach |
| Non-Claude AI providers | Claude API is the established AI backend |
| App.tsx architecture refactor | Needs test safety net first — deferred to v1.2 |
| stream:// streaming reads | Performance optimization deferred — current approach works for typical MP3s |
| Prettier Tailwind plugin | Tailwind 4 plugin compatibility uncertain |
| E2E / Tauri WebDriver tests | Still experimental in Tauri v2, not stable enough |
| Component-level React tests | Components deeply coupled to Tauri IPC + audioPlayer singleton — mock overhead exceeds value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEBT-01 | Phase 5 | Complete (05-01) |
| DEBT-02 | Phase 5 | Complete (05-01) |
| DEBT-03 | Phase 5 | Complete |
| DEBT-04 | Phase 5 | Complete |
| DEBT-05 | Phase 5 | Complete (05-01) |
| QUAL-01 | Phase 5 | Complete |
| QUAL-02 | Phase 5 | Complete |
| QUAL-03 | Phase 5 | Complete |
| TEST-01 | Phase 6 | Complete |
| TEST-02 | Phase 6 | Complete |
| TEST-03 | Phase 6 | Complete |
| TEST-04 | Phase 6 | Complete |
| TEST-05 | Phase 6 | Complete |
| TEST-06 | Phase 6 | Complete |
| UIUX-01 | Phase 7 | Complete |
| UIUX-02 | Phase 8 | Complete |
| UIUX-03 | Phase 8 | Complete |
| UIUX-04 | Phase 8 | Complete |
| UIUX-05 | Phase 8 | Pending |
| UIUX-06 | Phase 9 | Pending |
| UIUX-07 | Phase 9 | Pending |
| UIUX-08 | Phase 9 | Pending |
| UIUX-09 | Phase 7 | Complete |
| UIUX-10 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 — traceability populated after roadmap creation*
