# Requirements: RecoDeck

**Defined:** 2026-03-14
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.5 Requirements

Requirements for Windows Support milestone. Each maps to roadmap phases.

### Build & Compilation

- [ ] **BILD-01**: App compiles on Windows with `x86_64-pc-windows-msvc` target including Aubio bindgen
- [ ] **BILD-02**: `build:win` npm script produces a working Windows build

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
| BILD-01 | — | Pending |
| BILD-02 | — | Pending |
| RNTM-01 | — | Pending |
| RNTM-02 | — | Pending |
| INST-01 | — | Pending |
| INST-02 | — | Pending |
| CICD-01 | — | Pending |
| CICD-02 | — | Pending |
| CICD-03 | — | Pending |
| UPDT-01 | — | Pending |
| UPDT-02 | — | Pending |

**Coverage:**
- v1.5 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after initial definition*
