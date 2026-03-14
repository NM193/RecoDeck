# Requirements: RecoDeck

**Defined:** 2026-03-01
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.4 Requirements

Requirements for milestone v1.4 Equalizer. Each maps to roadmap phases.

### Audio Processing

- [x] **EQAP-01**: User can enable/disable a 10-band graphic equalizer that processes audio in real time
- [x] **EQAP-02**: EQ filter chain shares the existing AudioContext with the waveform visualizer (no second MediaElementSource)
- [x] **EQAP-03**: EQ reconnects correctly after a crossfade completes (audio element swap)
- [x] **EQAP-04**: AudioContext resumes automatically when the app window regains focus (WebKit background suspension guard)

### Presets

- [x] **EQPR-01**: User can select from 6 built-in presets: Flat, Bass Boost, Treble Boost, Vocal, Electronic, Headphones
- [x] **EQPR-02**: Selecting a preset applies all 10 band gains smoothly (no audible clicks)

### UI

- [ ] **EQUI-01**: An EQ icon appears next to the volume control in the NowPlayingBar
- [x] **EQUI-02**: Clicking the EQ icon opens a modal with 10 vertical sliders (one per frequency band) and frequency labels
- [x] **EQUI-03**: User can adjust individual band gain (±12 dB) by dragging sliders in custom mode
- [x] **EQUI-04**: Modal includes an on/off toggle and a preset selector dropdown
- [ ] **EQUI-05**: EQ icon shows an active indicator when EQ is enabled
- [x] **EQUI-06**: Modal uses the app's existing theme system (midnight/carbon) with a cool, minimal design

### Persistence

- [ ] **EQPE-01**: EQ state (enabled, active preset, custom band gains) persists across app restarts via SQLite settings

## v1.3 Requirements (Previous)

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
| EQ on crossfade secondary audio | Crossfade is 8s transitional — EQ applies after swap completes |
| EQ in native PCM fallback mode | Native mode is transient recovery path; not worth dual-context complexity |
| User-defined named presets (CRUD) | 6 built-in + custom slot sufficient for v1.4 |
| Parametric EQ (adjustable frequency/Q per band) | Graphic EQ with fixed frequencies is simpler and sufficient |
| Beatmatch crossfade | Deferred from v1.2 — pitch correction complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EQAP-01 | Phase 15 | Complete |
| EQAP-02 | Phase 15 | Complete |
| EQAP-03 | Phase 15 | Complete |
| EQAP-04 | Phase 15 | Complete |
| EQPR-01 | Phase 16 | Complete |
| EQPR-02 | Phase 16 | Complete |
| EQUI-01 | Phase 16 | Pending |
| EQUI-02 | Phase 16 | Complete |
| EQUI-03 | Phase 16 | Complete |
| EQUI-04 | Phase 16 | Complete |
| EQUI-05 | Phase 16 | Pending |
| EQUI-06 | Phase 16 | Complete |
| EQPE-01 | Phase 16 | Pending |

**Coverage:**
- v1.4 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after v1.4 roadmap creation*
