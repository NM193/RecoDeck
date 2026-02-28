# Roadmap: RecoDeck

## Overview

RecoDeck already has a working foundation — library scanning, BPM/key detection, playback, playlists. This milestone delivers the three Active scope items: codebase cleanup to unblock AI, a fully functional mobile companion, and AI-powered playlist intelligence. Four phases derived from the four natural requirement clusters, ordered by dependency.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Codebase Quality** - Stabilize foundation and fix broken AI integration so future phases build on solid ground (completed 2026-02-28)
- [x] **Phase 2: Mobile Companion** - Ship the PWA streaming experience so users can browse and play their library on mobile (completed 2026-02-28)
- [ ] **Phase 3: AI Playlists** - Deliver AI-powered smart playlist generation with energy/key/mood awareness
- [ ] **Phase 4: AI Discovery and Mix Prep** - Add track recommendations and mix preparation tools that complete the DJ workflow intelligence

## Phase Details

### Phase 1: Codebase Quality
**Goal**: Users experience a stable app with no dead-end AI features, and Claude has clean code to extend
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. AI-related commands no longer produce silent failures or panics — errors surface clearly to the user
  2. All Tauri commands return consistent error types that the frontend can interpret and display
  3. Dead code and unused dependencies are removed — cargo check/clippy passes without warnings
  4. Known stability bugs (crashes, hangs, data loss) are fixed and reproducible test cases pass
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Create AppError enum, migrate all commands to typed errors, fix AI integration (QUAL-01, QUAL-02)
- [ ] 01-02-PLAN.md — Remove dead code, unused dependencies, fix clippy warnings to zero (QUAL-03, QUAL-04)

### Phase 2: Mobile Companion
**Goal**: Users can open a browser on their phone, scan a QR code, and stream their full library with playback controls
**Depends on**: Phase 1
**Requirements**: MOBL-01, MOBL-02, MOBL-03, MOBL-04, MOBL-05, MOBL-06, MOBL-07
**Success Criteria** (what must be TRUE):
  1. User can start and stop the companion server from the desktop app with a visible status indicator
  2. User can scan a QR code on the desktop to open the mobile PWA in their phone browser
  3. User can browse and search their full music library on the mobile PWA
  4. User can tap a track and hear it streaming with play/pause/seek controls
  5. Unauthorized requests (no token, expired ticket) are rejected — only the user's phone can stream
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Commit existing work, fix active_streams status, verify server lifecycle + QR + auth (MOBL-01, MOBL-02, MOBL-06)
- [ ] 02-02-PLAN.md — Fix search BPM gap, audit mobile browse/search/playback UI (MOBL-03, MOBL-04, MOBL-05)
- [ ] 02-03-PLAN.md — Verify streaming security, document MOBL-07 ticket design decision (MOBL-04, MOBL-07)

### Phase 3: AI Playlists
**Goal**: Users can generate a smart playlist from any track with AI that understands DJ-compatible BPM, key, and energy flow
**Depends on**: Phase 1
**Requirements**: AIPL-01, AIPL-02, AIPL-03, AIPL-04, AIPL-05, AIPL-06
**Success Criteria** (what must be TRUE):
  1. User can select a seed track and generate a playlist with one action, receiving a sequenced list of tracks from their library
  2. User can choose an energy direction (build up, wind down, maintain) that visibly changes the resulting playlist
  3. Generated playlist track order follows BPM compatibility — no jumps larger than ~10 BPM between adjacent tracks
  4. Generated playlist track order follows Camelot wheel key compatibility — adjacent tracks are in compatible keys
  5. User can save the AI-generated playlist to their library with a name of their choosing
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — New ai_generate_playlist_from_seed Tauri command, seed-aware context builder, energy-direction prompt injection (AIPL-01, AIPL-02, AIPL-03, AIPL-04, AIPL-05)
- [ ] 03-02-PLAN.md — AIPlaylistDialog component, context menu + player bar entry points, transition indicators, save flow (AIPL-01, AIPL-02, AIPL-03, AIPL-04, AIPL-05, AIPL-06)

### Phase 4: AI Discovery and Mix Prep
**Goal**: Users can get track recommendations and see mix-readiness analysis that makes preparing a DJ set faster
**Depends on**: Phase 3
**Requirements**: DISC-01, DISC-02, DISC-03, MIXP-01, MIXP-02, MIXP-03
**Success Criteria** (what must be TRUE):
  1. User can request track recommendations based on the currently playing track and see matches from their library
  2. User can request recommendations based on an existing playlist and see tracks that fit its vibe — all from their own library
  3. User can view a reordered version of any playlist optimized for key-compatible mixing
  4. User can see an energy arc visualization showing the energy level of each track across a playlist
  5. Potential transition issues (BPM jumps, key clashes) are highlighted so the user can spot problem spots before a set
**Plans**: TBD

Plans:
- [ ] 04-01: Track recommendation engine (by track and by playlist)
- [ ] 04-02: Mix prep analysis — key-optimized ordering, energy arc, transition issue detection

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Codebase Quality | 2/2 | Complete   | 2026-02-28 |
| 2. Mobile Companion | 3/3 | Complete   | 2026-02-28 |
| 3. AI Playlists | 1/2 | In Progress|  |
| 4. AI Discovery and Mix Prep | 0/2 | Not started | - |
