# Requirements: RecoDeck

**Defined:** 2026-02-28
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### AI Playlists

- [x] **AIPL-01**: User can generate a smart playlist from a seed track using AI
- [x] **AIPL-02**: User can specify energy/mood direction (build up, wind down, maintain) for AI playlist
- [x] **AIPL-03**: AI considers BPM compatibility when ordering tracks in a playlist
- [x] **AIPL-04**: AI considers key compatibility (Camelot wheel) when selecting and ordering tracks
- [x] **AIPL-05**: AI considers energy flow (gradual transitions, no jarring jumps) in playlist sequence
- [ ] **AIPL-06**: User can save AI-generated playlist to their library

### AI Discovery

- [ ] **DISC-01**: User can get AI-powered track recommendations based on currently playing track
- [ ] **DISC-02**: User can get AI recommendations based on an existing playlist's vibe
- [ ] **DISC-03**: AI recommendations draw only from user's own library (local-first)

### AI Mix Prep

- [ ] **MIXP-01**: User can view AI-suggested track order for key-compatible mixing
- [ ] **MIXP-02**: User can view energy arc visualization for a playlist (energy level per track)
- [ ] **MIXP-03**: AI highlights potential transition issues (large BPM jumps, clashing keys)

### Mobile Companion

- [x] **MOBL-01**: User can start/stop the companion HTTP server from desktop app
- [x] **MOBL-02**: User can connect to companion server from mobile browser via QR code
- [x] **MOBL-03**: User can browse full music library on mobile device
- [x] **MOBL-04**: User can stream tracks from desktop to mobile with playback controls
- [x] **MOBL-05**: User can search tracks on mobile
- [x] **MOBL-06**: Server authenticates mobile connections with bearer token
- [x] **MOBL-07**: Audio streaming uses secure single-use tickets (30s expiry)

### Codebase Quality

- [x] **QUAL-01**: Fix broken/incomplete AI command integration (ai.rs)
- [x] **QUAL-02**: Consistent error handling across all Tauri commands
- [x] **QUAL-03**: Remove dead code and unused dependencies
- [x] **QUAL-04**: Fix known stability issues and bugs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced AI

- **AIADV-01**: AI learns from user's playlist curation history over time
- **AIADV-02**: AI suggests tracks to acquire (not in library) based on gaps
- **AIADV-03**: Multi-genre crossover playlist intelligence

### Social

- **SOCL-01**: User can share playlists with other RecoDeck users
- **SOCL-02**: User can export playlists to standard formats (M3U, Rekordbox XML)

### Mobile Advanced

- **MOBLA-01**: Offline caching of recently played tracks on mobile
- **MOBLA-02**: Mobile playlist editing and sync back to desktop

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full DJ mixing/performance | RecoDeck is a library manager, not a CDJ replacement |
| Cloud sync / multi-device library | Local-first architecture, no cloud dependency |
| Music purchasing / streaming integration | Works with files you own |
| Public App Store release | Targeting small group of DJ friends |
| Separate native mobile app | PWA served from desktop is the approach |
| Non-Claude AI providers | Claude API is the established AI backend |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| QUAL-01 | Phase 1 | Complete |
| QUAL-02 | Phase 1 | Complete |
| QUAL-03 | Phase 1 | Complete |
| QUAL-04 | Phase 1 | Complete |
| MOBL-01 | Phase 2 | Complete |
| MOBL-02 | Phase 2 | Complete |
| MOBL-03 | Phase 2 | Complete |
| MOBL-04 | Phase 2 | Complete |
| MOBL-05 | Phase 2 | Complete |
| MOBL-06 | Phase 2 | Complete |
| MOBL-07 | Phase 2 | Complete |
| AIPL-01 | Phase 3 | Complete |
| AIPL-02 | Phase 3 | Complete |
| AIPL-03 | Phase 3 | Complete |
| AIPL-04 | Phase 3 | Complete |
| AIPL-05 | Phase 3 | Complete |
| AIPL-06 | Phase 3 | Pending |
| DISC-01 | Phase 4 | Pending |
| DISC-02 | Phase 4 | Pending |
| DISC-03 | Phase 4 | Pending |
| MIXP-01 | Phase 4 | Pending |
| MIXP-02 | Phase 4 | Pending |
| MIXP-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation — traceability complete*
