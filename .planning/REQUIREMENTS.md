# Requirements: RecoDeck

**Defined:** 2026-03-01
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.3 Requirements

Requirements for milestone v1.3 Library UX & Duplicate Management. Each maps to roadmap phases.

### Track Table Layout

- [x] **LAYT-01**: Track table rows extend to the full window width at any window size
- [x] **LAYT-02**: Track table header background extends to the full window width at any window size

### Library Loading

- [ ] **LOAD-01**: All tracks in the library load on startup (no "Scroll for more" pagination)
- [ ] **LOAD-02**: Track count in status bar and sidebar reflects the full library after startup

### Duplicate Management

- [ ] **DUPL-01**: User can open a "Review Duplicates" dialog from Database Maintenance settings
- [ ] **DUPL-02**: Dialog shows all duplicate groups with track details (file path, date added, file size, BPM)
- [ ] **DUPL-03**: User can select individual tracks to delete within each duplicate group
- [ ] **DUPL-04**: User can confirm deletion and the library refreshes without showing deleted tracks

## Future Requirements

### Deferred from v1.2

- **XFADE-01**: Beatmatch crossfade — next track's playback rate shifts from current BPM to its own BPM during crossfade
- **XFADE-02**: Crossfade audio plays synchronized to beat phase alignment

## Out of Scope

| Feature | Reason |
|---------|--------|
| Beatmatch crossfade | Deferred from v1.2 — pitch correction complexity; playbackRate without pitch shift sounds wrong |
| Batch "delete all duplicates" button | Forces individual review — prevents accidental data loss |
| Duplicate detection by audio fingerprint | File hash + filename matching is sufficient; audio fingerprinting requires new dependency |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYT-01 | Phase 12 | Complete |
| LAYT-02 | Phase 12 | Complete |
| LOAD-01 | Phase 13 | Pending |
| LOAD-02 | Phase 13 | Pending |
| DUPL-01 | Phase 14 | Pending |
| DUPL-02 | Phase 14 | Pending |
| DUPL-03 | Phase 14 | Pending |
| DUPL-04 | Phase 14 | Pending |

**Coverage:**
- v1.3 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-06 after v1.3 roadmap creation*
