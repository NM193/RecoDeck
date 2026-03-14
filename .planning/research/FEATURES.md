# Feature Research

**Domain:** Windows platform support — Tauri 2 desktop music player
**Researched:** 2026-03-14
**Confidence:** HIGH (grounded in existing codebase analysis, official Tauri 2 docs, and direct code review)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features Windows users assume exist. Missing these = product feels broken or unprofessional on the platform.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| NSIS installer (.exe) | Windows users expect a standard Setup.exe, not a raw binary | LOW | Tauri 2 bundles NSIS by default; `tauri.conf.json` already has `"targets": "all"` which includes NSIS. Just needs a Windows build job in CI. |
| App compiles and runs on Windows | Foundational — nothing else matters if it doesn't build | HIGH | Primary blocker: `bliss-audio-aubio-rs` uses `bindgen` + C build toolchain. Windows CI runner needs `libclang`, `llvm`, MSVC C compiler. |
| Audio playback works on Windows | Core feature must function on the new platform | MEDIUM | Custom `stream://` protocol is already Windows-aware in `lib.rs` (uses `http://stream.localhost/?p=` on Windows). Needs Windows E2E verification. |
| Auto-updater delivers Windows builds | Users expect updates without reinstalling manually | MEDIUM | `tauri.conf.json` already has updater configured with `createUpdaterArtifacts: "v1Compatible"`. The `latest.json` manifest needs a `windows-x86_64` platform entry. |
| App data stored in correct Windows location | Library DB and settings must persist across sessions in the OS-standard location | LOW | Tauri 2's path resolver maps `AppLocalData` to `%LOCALAPPDATA%\recodeck` on Windows automatically. `init_database` already uses Tauri path API — no change needed. |
| No console window on startup | Desktop apps on Windows must not flash a black terminal window | LOW | `src-tauri/build.rs` or `Cargo.toml` must include `#![windows_subsystem = "windows"]` linker flag. Tauri CLI adds this automatically in release builds. Verify it's not bypassed in debug. |
| App icon in taskbar and title bar | Windows users expect a proper application icon | LOW | `icon.ico` already exists in `icons/`. Tauri NSIS installer registers it automatically. Verify the `.ico` file has all required sizes (16, 24, 32, 48, 64, 128, 256px). |
| Window controls match Windows conventions | Windows title bar has minimize/maximize/close on the right, in that order | LOW | RecoDeck appears to use standard Tauri window chrome. Custom `frameless` or `decorations: false` would require implementing Windows-style controls. Check `tauri.conf.json`. |
| Windows CI build job in release workflow | Shipping requires reproducible Windows builds from CI | MEDIUM | Current `release.yml` has only `build-macos` job. Needs a parallel `build-windows` job using `windows-latest` runner. |
| Folder picker works for library setup | Users must be able to select music folders on Windows paths (`C:\Users\...`) | LOW | `tauri-plugin-dialog` already used for folder picking. Windows paths are native-handled by the dialog plugin. Verify the returned path is correctly passed through the stream protocol. |

### Differentiators (What Would Make It Notable on Windows)

Features Windows desktop users appreciate but don't strictly require for Day 1 usability.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unsigned installer with SmartScreen guidance | Small-team reality — OV cert is expensive; providing clear "Run Anyway" instructions reduces friction for trusted distribution | LOW | Document in README/release notes. SmartScreen shows "Windows protected your PC" prompt for unsigned apps. Users can click "More info" → "Run anyway". Consider submitting binary to Microsoft's file submission portal to build reputation over time. |
| Windows-style keyboard shortcuts | Windows users expect Ctrl+Z, Ctrl+C, Ctrl+V for editing; media keys for play/pause | LOW | WebView2 (Chromium) handles standard Ctrl+* shortcuts natively. Media keys (F7/F8/F9 legacy keys) are a v2+ SMTC integration story. |
| Correct Windows path display | Windows paths show as `C:\Music\Artist - Track.mp3` not `/C:/Music/...` | LOW | Track paths stored in SQLite will reflect whatever was scanned. The stream protocol `lib.rs` already handles Windows path normalization. UI display should respect OS-native path format. |
| Mobile companion works on Windows | PWA companion server should function on Windows local network | MEDIUM | The Axum server binds to `0.0.0.0`. The `local-ip-address` crate resolves the machine's LAN IP. On Windows, firewall may block the port — need to document that Windows Firewall will prompt users to allow the app through. |
| Proper high-DPI scaling | Windows 4K/HiDPI displays are common; UI must not appear blurry or tiny | LOW | WebView2 handles DPI scaling automatically. Tauri sets `highDpiAware` in the Windows manifest by default. Verify no pixel-snapped CSS values break on fractional DPI (125%, 150%). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Windows code signing (OV/EV certificate) | Prevents SmartScreen warnings entirely | OV certificates now require HSM hardware (post-June 2023); EV certificates cost $300-600/year; HSM setup adds CI complexity with Azure Key Vault or similar. For a small personal-use app distributed to friends, cost/complexity is disproportionate to benefit. | Ship unsigned with clear install instructions. Build SmartScreen reputation over time via Microsoft's file submission portal. Revisit when user base grows. |
| System tray integration | Windows apps sometimes live in the system tray | Adds surface area: tray icon, context menu, click-to-restore, minimize-to-tray behavior. RecoDeck is a DJ library manager — you want it visible while working, not hidden. | Keep standard taskbar behavior. Tray is a v2+ consideration if users request background operation. |
| SMTC (System Media Transport Controls) integration | Windows 11 shows media controls in taskbar flyout; media keys would control RecoDeck | Requires WinRT API bindings from Rust via `windows-rs` crate. Adds ~2MB to binary and significant Windows-only Rust code. Not a blocker for v1.5. | Defer to v2+. WebView2 already handles focus-based media key events (Space bar play/pause). SMTC is an enhancement, not table stakes. |
| Windows Store (MSIX) distribution | Store provides auto-update and discovery | MSIX packaging changes app data paths to virtualized locations, breaking the existing SQLite path resolution. Requires a separate packaging target and Microsoft developer account. Not worth the complexity for a small DJ tool. | NSIS installer + GitHub Releases is the right approach for this audience. |
| File association for audio files (MP3/FLAC opens RecoDeck) | Users might want to double-click a track to open it | RecoDeck is a library manager, not a default audio player. Registering as the default handler for MP3 would override users' existing players (Winamp, foobar2000, VLC). | Register an optional `.rdeck` project file association in v2+ if playlist files become a feature. Do not register generic audio MIME types. |
| 32-bit (x86) build | Maximum compatibility | Virtually zero 32-bit Windows machines in 2026. `ort` (ONNX Runtime) and Aubio both have limited 32-bit support. Extra CI job for minimal gain. | x86_64 only. ARM64 Windows is a v2+ consideration. |

---

## Technical Context: Windows-Specific Code Paths Already in Codebase

### What Is Already Implemented

RecoDeck already has Windows-aware code in key areas. This significantly reduces the scope of v1.5.

**Stream protocol URL (`lib.rs` line 73-74):**
```
// macOS URL:  stream://localhost/<absolute_path>
// Windows URL: http://stream.localhost/<absolute_path>
```
The `register_uri_scheme_protocol("stream", ...)` handler already has `#[cfg(target_os = "windows")]` branches for path normalization (backslash-to-forward-slash conversion, UNC path handling, forward-slash-with-backslash fallback).

**Audio player URL construction (`audioPlayer.ts` lines 9-11):**
```typescript
// Windows:     http://stream.localhost/?p=<encoded_path>
// macOS/Linux: stream://localhost/?p=<encoded_path>
```
The frontend already uses the correct platform URL format.

**Cargo.toml lib name workaround (`Cargo.toml` line 13-14):**
```
# The `_lib` suffix may seem redundant but it is necessary
# to make the lib name unique and wouldn't conflict with the bin name.
# This seems to be only an issue on Windows
```
This is already handled.

### What Is Not Yet Implemented

| Gap | Location | Action Required |
|-----|----------|-----------------|
| Aubio C toolchain on Windows CI | `.github/workflows/release.yml` | Windows runner needs `libclang`, `llvm`, Visual Studio C++ build tools. `bliss-audio-aubio-rs` with `builtin` + `bindgen` features requires this. |
| Windows CI build job | `.github/workflows/release.yml` | No `windows-latest` job exists; only `build-macos`. |
| `latest.json` Windows platform entry | `scripts/generate-update-manifest.js` | Manifest generator currently only outputs `darwin-aarch64`. Need `windows-x86_64` entry. |
| Windows build script | `package.json` | `build:mac` script exists; `build:win` does not. |
| `release:sign` for Windows | `package.json` | Current `release:sign` is macOS-only. Windows NSIS artifacts are auto-signed by the updater plugin (using the existing Tauri signing key), so this may be a no-op. |
| Mobile companion Windows Firewall | `src-tauri/src/server/` | Windows Firewall will prompt users when the Axum server tries to bind. The prompt is automatic (Windows dialog), but users must click Allow. No code change required — but needs documentation. |
| Mobile companion path resolution on Windows | `src-tauri/src/server/routes.rs` | Mobile PWA served from `mobile-dist/`. Tauri `resources` copies it to the bundle. On Windows, the path to the bundled resource may differ. Needs verification. |

---

## Feature Dependencies

```
Windows CI build job
    └──requires──> Aubio C toolchain setup on windows-latest runner
                       └──requires──> libclang/LLVM available in CI environment
                                          └──uses──> bliss-audio-aubio-rs (bindgen feature)

Windows auto-updater
    └──requires──> Windows CI build job (to produce artifacts)
    └──requires──> latest.json manifest with windows-x86_64 entry
    └──uses──> tauri-plugin-updater (already in Cargo.toml)
    └──uses──> TAURI_SIGNING_PRIVATE_KEY secret (already in CI)

Audio playback on Windows
    └──requires──> stream:// protocol Windows path resolution (already implemented)
    └──requires──> http://stream.localhost URL construction (already implemented in audioPlayer.ts)
    └──needs verification──> Range request support in WebView2 (implemented in lib.rs, needs E2E test)

Mobile companion on Windows
    └──requires──> Windows Firewall rule (automatic prompt, user action)
    └──requires──> mobile-dist resource path resolution on Windows (needs verification)
    └──uses──> Axum server (already implemented, platform-agnostic)

Auto-updater manifest
    └──requires──> Windows NSIS artifact (.exe + .sig) from CI
    └──requires──> generate-update-manifest.js updated for windows-x86_64
```

### Dependency Notes

- **Aubio is the critical path**: If `bliss-audio-aubio-rs` with `builtin` + `bindgen` features cannot be compiled on `windows-latest`, nothing else can ship. This must be validated first before investing in CI workflow, installer config, or updater manifest work.
- **Stream protocol is already Windows-ready**: The `lib.rs` protocol handler and `audioPlayer.ts` URL construction both have Windows branches. The primary remaining risk is E2E audio playback testing on an actual Windows machine with real paths containing spaces and Unicode characters.
- **Updater requires Windows artifacts first**: The `latest.json` manifest can only be generated after the Windows CI build produces `recodeck_*_x64-setup.exe` and its `.sig` file.
- **Mobile companion is lowest priority**: It adds Windows Firewall complexity and resource path uncertainty. If it works without changes, great. If not, defer to v1.5.x.

---

## MVP Definition

### Launch With (v1.5)

The minimum that makes RecoDeck usable on Windows for the existing DJ friend group.

- [ ] Windows compilation passes with Aubio C toolchain — without this nothing ships
- [ ] GitHub Actions `build-windows` job produces `recodeck_*_x64-setup.exe` artifact
- [ ] NSIS installer installs and uninstalls cleanly on Windows 10/11
- [ ] Audio playback works end-to-end on Windows (stream protocol, range requests, real music files)
- [ ] Library scanning works with Windows paths (`C:\Users\...`)
- [ ] `latest.json` updated to include `windows-x86_64` platform entry so auto-updater functions
- [ ] `package.json` gets a `build:win` script
- [ ] Release workflow updated to upload Windows artifacts alongside macOS `.dmg`

### Add After Validation (v1.5.x)

- [ ] Mobile companion on Windows verified/fixed — trigger: first Windows user tries to use PWA feature
- [ ] High-DPI display verification — trigger: user reports UI scaling issues
- [ ] Windows Firewall documentation added to README — trigger: user can't connect mobile companion

### Future Consideration (v2+)

- [ ] SMTC media transport controls — when user base is large enough to justify WinRT bindings
- [ ] Windows code signing (OV/EV certificate) — when distributing publicly beyond friend group
- [ ] ARM64 Windows build — when ARM Windows hardware becomes common in target audience
- [ ] System tray integration — if background operation becomes a requested use pattern

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Aubio Windows compilation | HIGH — blocks everything | HIGH (unknown until attempted) | P1 — must validate first |
| Windows CI build job | HIGH — needed for distribution | MEDIUM | P1 |
| NSIS installer | HIGH — table stakes for Windows | LOW (Tauri handles it) | P1 |
| Audio playback E2E on Windows | HIGH — core function | LOW (code exists, needs test) | P1 |
| Library scanning on Windows paths | HIGH — core function | LOW (code exists, needs test) | P1 |
| latest.json Windows entry | HIGH — auto-updater | LOW | P1 |
| build:win package.json script | MEDIUM — developer convenience | LOW | P1 |
| Mobile companion on Windows | MEDIUM — existing feature | MEDIUM (firewall + path uncertainty) | P2 |
| High-DPI verification | MEDIUM — usability | LOW | P2 |
| Windows code signing | LOW for friend-group distribution | HIGH (cost + CI setup) | P3 |
| SMTC integration | LOW for v1.5 | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.5 launch
- P2: Should have; add after P1 items verified
- P3: Defer to v2+

---

## Platform Differences: Windows vs macOS Behavior Notes

These are differences that affect user experience or developer workflow, even if no code changes are required.

| Aspect | macOS (current) | Windows (target) | Action |
|--------|----------------|------------------|--------|
| Custom protocol URL | `stream://localhost/?p=...` | `http://stream.localhost/?p=...` | Already handled in both `lib.rs` and `audioPlayer.ts` |
| Path separators | `/Users/name/Music/...` | `C:\Users\name\Music\...` | `lib.rs` normalizes backslashes; scanner uses Rust `Path` (cross-platform) |
| App data directory | `~/Library/Application Support/recodeck/` | `%LOCALAPPDATA%\recodeck\` | Tauri path resolver abstracts this automatically |
| WebView engine | WKWebView (WebKit/Safari) | WebView2 (Chromium/Edge) | CSS and JS behavior is more consistent with standard Chrome; some macOS-specific WebKit quirks disappear |
| Font rendering | Subpixel antialiasing (Retina) | ClearType (CRT-legacy) | Minor visual difference; no CSS changes required |
| Audio autoplay | Works without interaction | Fixed in wry#1287 — should work in current Tauri 2 | Verify on Windows; the bug was a typo in the autoplay browser arg, now resolved |
| Installer format | `.dmg` (drag to Applications) | `.exe` NSIS setup wizard | Different artifact type; release workflow uploads both |
| Updater behavior | Replaces `.app` bundle in-place | Automatically exits app, runs installer, restarts | Windows-specific: the app closes itself during update. Tauri handles this automatically with `tauri-plugin-updater`. |
| Firewall | macOS firewall prompts are rare | Windows Defender Firewall prompts when Axum server tries to bind port | Mobile companion users will see a firewall dialog; they must click Allow. Document this. |
| Code signing status | Unsigned (no Apple Developer Program) | Unsigned (no Windows certificate) | Both platforms will warn users. macOS Gatekeeper is stricter than Windows SmartScreen for unsigned apps. |
| Window decorations | macOS-style traffic lights | Windows-style min/max/close on right | Tauri uses OS-native window chrome by default — nothing to do |

---

## Competitor Feature Analysis

For context: how other DJ/music tools handle Windows distribution.

| Feature | Rekordbox (DJ software) | foobar2000 (music player) | RecoDeck v1.5 Approach |
|---------|------------------------|--------------------------|----------------------|
| Windows installer | NSIS setup wizard | NSIS setup wizard | NSIS (Tauri default) |
| Code signing | EV signed (Pioneer) | Unsigned → SmartScreen warning common | Unsigned; document workaround |
| Auto-updater | Built-in launcher checks | Manual download | Tauri updater plugin |
| Windows Firewall | Not applicable (no server) | Not applicable | Axum server triggers firewall prompt; document it |
| System tray | Not used | Not used | Not used |
| SMTC integration | Not integrated | Optional plugin | Deferred to v2+ |

---

## Sources

- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/src/lib.rs` — existing Windows `#[cfg(target_os = "windows")]` branches in stream protocol handler; HIGH confidence
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/lib/audioPlayer.ts` — existing platform-conditional URL construction for stream protocol; HIGH confidence
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/Cargo.toml` — `bliss-audio-aubio-rs` dependency with `builtin` + `bindgen` features (C toolchain required); HIGH confidence
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/.github/workflows/release.yml` — macOS-only CI job; Windows job does not exist; HIGH confidence
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/tauri.conf.json` — `createUpdaterArtifacts: "v1Compatible"`, updater endpoints, `targets: "all"`; HIGH confidence
- [Tauri 2 Windows Installer](https://v2.tauri.app/distribute/windows-installer/) — NSIS options, MSI options, WebView2 install modes; HIGH confidence
- [Tauri 2 Updater Plugin](https://v2.tauri.app/plugin/updater/) — Windows install modes (`passive`, `basicUi`, `quiet`), manifest format, automatic app exit on Windows update; HIGH confidence
- [Tauri 2 GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/) — official multi-platform workflow structure; HIGH confidence
- [Tauri Issue #9968](https://github.com/tauri-apps/tauri/issues/9968) — audio autoplay on Windows fixed via wry#1287 (typo in autoplay browser arg); HIGH confidence (issue closed)
- [Tauri 2 Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/) — OV/EV certificate options, SmartScreen behavior; HIGH confidence
- [Microsoft SMTC docs](https://learn.microsoft.com/en-us/uwp/api/windows.media.systemmediatransportcontrols) — SMTC integration for Windows media apps; HIGH confidence (deferred to v2+)
- [WebView2 autoplay issue](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2159) — WebView2 autoplay policy details; MEDIUM confidence

---

*Feature research for: RecoDeck v1.5 — Windows Platform Support*
*Researched: 2026-03-14*
