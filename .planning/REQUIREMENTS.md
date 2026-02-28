# Requirements: RecoDeck

**Defined:** 2026-02-28
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### AI Playlists

- [ ] **AIPL-01**: User can generate a smart playlist from a seed track using AI
- [ ] **AIPL-02**: User can specify energy/mood direction (build up, wind down, maintain) for AI playlist
- [ ] **AIPL-03**: AI considers BPM compatibility when ordering tracks in a playlist
- [ ] **AIPL-04**: AI considers key compatibility (Camelot wheel) when selecting and ordering tracks
- [ ] **AIPL-05**: AI considers energy flow (gradual transitions, no jarring jumps) in playlist sequence
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

- [ ] **MOBL-01**: User can start/stop the companion HTTP server from desktop app
- [ ] **MOBL-02**: User can connect to companion server from mobile browser via QR code
- [ ] **MOBL-03**: User can browse full music library on mobile device
- [ ] **MOBL-04**: User can stream tracks from desktop to mobile with playback controls
- [ ] **MOBL-05**: User can search tracks on mobile
- [ ] **MOBL-06**: Server authenticates mobile connections with bearer token
- [ ] **MOBL-07**: Audio streaming uses secure single-use tickets (30s expiry)

### Codebase Quality

- [ ] **QUAL-01**: Fix broken/incomplete AI command integration (ai.rs)
- [ ] **QUAL-02**: Consistent error handling across all Tauri commands
- [ ] **QUAL-03**: Remove dead code and unused dependencies
- [ ] **QUAL-04**: Fix known stability issues and bugs

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
| (populated during roadmap creation) | | |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after initial definition*
