# Requirements: RecoDeck

**Defined:** 2026-03-14
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.5 Requirements

Requirements for Windows Support milestone. Each maps to roadmap phases.

### Build & Compilation

- [x] **BILD-01**: App compiles on Windows with `x86_64-pc-windows-msvc` target including Aubio bindgen
- [x] **BILD-02**: `build:win` npm script produces a working Windows build

### Runtime Fixes

- [ ] **RNTM-01**: Mobile companion streaming works on Windows (fix `streaming.rs` canonicalize UNC prefix)
- [ ] **RNTM-02**: Mobile companion PWA resources resolve correctly on Windows (fix `find_mobile_dist()`)

### Installer

- [ ] **INST-01**: NSIS installer installs and uninstalls RecoDeck cleanly on Windows
- [ ] **INST-02**: `tauri.conf.json` has Windows NSIS bundle configuration

### CI/CD

- [ ] **CICD-01**: GitHub Actions `build-windows` job produces Windows release artifacts
- [ ] **CICD-02**: Windows build includes LLVM/libclang setup for Aubio bindgen
- [ ] **CICD-03**: Release workflow uploads Windows artifacts alongside macOS

### Auto-Updater

- [ ] **UPDT-01**: `latest.json` manifest includes `windows-x86_64` platform entry
- [ ] **UPDT-02**: `generate-update-manifest.js` supports multi-platform output

## v1.6 Requirements

Requirements for Update Notifications milestone. Each maps to roadmap phases.

### Updater Configuration

- [x] **UCFG-01**: `tauri.conf.json` has `"dialog": false` so JS API receives update events
- [x] **UCFG-02**: `tauri.conf.json` has `"createUpdaterArtifacts": true` (v1Compatible removed)

### Auto-Check & Toast

- [ ] **UCHK-01**: App checks for updates on launch after a 3-5 second delay (check only, never auto-install)
- [ ] **UCHK-02**: Update-available toast notification appears with Install and Later buttons
- [ ] **UCHK-03**: Install button routes to Settings > About for user-initiated download and restart

### What's New Modal

- [ ] **WHNW-01**: `getChangesForVersion()` returns categorized object `{ added, changed, fixed }` instead of flat `string[]`
- [ ] **WHNW-02**: What's New modal displays three labeled sections (New / Fixes / Changes)
- [ ] **WHNW-03**: What's New modal does not fire on fresh install (null guard on `last_seen_version`)
- [ ] **WHNW-04**: Duplicate update button removed from WhatsNewDialog

### CI Release Pipeline

- [ ] **CIUP-01**: `latest.json` contains both `darwin-aarch64` and `windows-x86_64` platform entries
- [ ] **CIUP-02**: `generate-update-manifest.js` supports `--platform` fragment mode and `--merge` mode

### Polish (P2)

- [ ] **UPOL-01**: Section icons in What's New modal (Plus for Added, Wrench for Fixed, ArrowLeftRight for Changed)
- [ ] **UPOL-02**: Suppress update toast during active audio playback

## Future Requirements

### Windows Enhancements

- **WINS-01**: Windows code signing with EV/OV certificate (eliminates SmartScreen warning)
- **WINS-02**: Windows file association for audio formats (.mp3, .flac, etc.)
- **WINS-03**: Windows taskbar integration (thumbnail toolbar, progress bar)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Windows code signing | $300-600/yr cert cost disproportionate for small DJ friend group; SmartScreen "Run Anyway" is acceptable |
| Linux support | Separate milestone if needed; Windows is the priority |
| ARM64 Windows | x86_64 covers the target audience; ARM64 can be added later |
| Windows Store distribution | Not needed for personal/friend distribution |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BILD-01 | Phase 17 | Complete |
| BILD-02 | Phase 17 | Complete |
| RNTM-01 | Phase 18 | Pending |
| RNTM-02 | Phase 18 | Pending |
| INST-01 | Phase 19 | Pending |
| INST-02 | Phase 19 | Pending |
| CICD-01 | Phase 19 | Pending |
| CICD-02 | Phase 19 | Pending |
| CICD-03 | Phase 19 | Pending |
| UPDT-01 | Phase 20 | Pending |
| UPDT-02 | Phase 20 | Pending |

**v1.5 Coverage:**
- v1.5 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

### v1.6 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UCFG-01 | Phase 21 | Complete |
| UCFG-02 | Phase 21 | Complete |
| UCHK-01 | Phase 22 | Pending |
| UCHK-02 | Phase 22 | Pending |
| UCHK-03 | Phase 22 | Pending |
| WHNW-01 | Phase 23 | Pending |
| WHNW-02 | Phase 23 | Pending |
| WHNW-03 | Phase 23 | Pending |
| WHNW-04 | Phase 23 | Pending |
| CIUP-01 | Phase 24 | Pending |
| CIUP-02 | Phase 24 | Pending |
| UPOL-01 | Phase 25 | Pending |
| UPOL-02 | Phase 25 | Pending |

**v1.6 Coverage:**
- v1.6 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — v1.6 requirements added*
