# Project Research Summary

**Project:** RecoDeck v1.5 — Windows Platform Support
**Domain:** Cross-platform desktop app (Tauri 2 / Rust / React 19) — adding Windows to an existing macOS-only build
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

RecoDeck v1.5 adds Windows support to an already-functional macOS app. The good news from research is that the existing codebase is significantly more Windows-ready than it might appear: `lib.rs` already has `#[cfg(target_os = "windows")]` branches for the custom stream protocol, `audioPlayer.ts` already detects Windows and constructs the correct `http://stream.localhost/` URLs, and `Cargo.toml` already uses `rusqlite` with the `bundled` feature and `ort` with `download-binaries` — both of which handle Windows without changes. The scope of actual new work is smaller than a typical platform port: no new Rust crates, no new npm packages, and no new source directories are required.

The single biggest risk in the entire milestone is the `bliss-audio-aubio-rs` crate, which uses `features = ["builtin", "bindgen"]`. The `bindgen` feature requires `libclang` at compile time. On Windows — both locally and on `windows-latest` GitHub Actions runners — `LIBCLANG_PATH` is not set by default. If this crate does not compile, nothing else can ship. This risk must be validated first before any other work proceeds. Beyond that, there is a latent bug in `streaming.rs` where `std::fs::canonicalize` on Windows prepends a `\\?\` UNC prefix that will cause every mobile companion stream request to return 403 Forbidden — this is a one-line normalization fix but must be addressed.

The recommended approach is to sequence the work by risk: validate Aubio compilation first (Phase 1), fix the one known code bug and verify audio end-to-end (Phase 2), add the Windows CI/CD job and NSIS installer (Phase 3), and wire up the auto-updater manifest (Phase 4). Skip Windows code signing entirely for v1.5 — the target audience is a small group of DJ friends who can handle a SmartScreen "Run anyway" click. SMTC, system tray, file associations, and ARM64 Windows are all clear v2+ items.

## Key Findings

### Recommended Stack

No new dependencies are required. The Windows build requires only toolchain and environment setup: MSVC Build Tools with the "Desktop C++ workload," Rust stable with the `x86_64-pc-windows-msvc` toolchain, LLVM 17 (for `libclang`), and the `KyleMayes/install-llvm-action@v2` GitHub Actions action to install LLVM on the CI runner and set `LLVM_PATH`. `tauri.conf.json` needs a `windows.nsis` section added for installer configuration, and the CI workflow needs a parallel `build-windows` job plus a `create-release` merge job for the `latest.json` updater manifest.

**Core technologies (Windows-specific additions only):**
- LLVM 17 / libclang: required by `bindgen` feature of `bliss-audio-aubio-rs` — install via `winget install LLVM.LLVM` locally and `KyleMayes/install-llvm-action@v2` in CI
- MSVC Build Tools (Visual Studio 2022 C++ workload): required by Tauri v2 — GNU/MinGW target is not supported
- `KyleMayes/install-llvm-action@v2`: sets `LLVM_PATH` env var on `windows-latest` runner, from which `LIBCLANG_PATH` is derived
- NSIS installer: bundled by Tauri CLI automatically — just needs `windows.nsis` config block in `tauri.conf.json`
- WebView2 Runtime: pre-installed on Windows 10 1803+; NSIS bootstrapper handles older systems automatically

See `.planning/research/STACK.md` for full CI workflow YAML, `tauri.conf.json` diffs, `latest.json` format, and alternatives considered.

### Expected Features

The MVP feature set for v1.5 is deliberately narrow. The research confirmed that everything beyond basic Windows compilation, audio playback, and distribution infrastructure is either already handled by existing code or belongs in v2+.

**Must have (table stakes for v1.5):**
- Windows compilation with Aubio C toolchain — the entire milestone gates on this
- GitHub Actions `build-windows` CI job producing `recodeck_*_x64-setup.exe`
- NSIS installer installs and uninstalls cleanly on Windows 10 and 11
- Audio playback end-to-end on Windows (stream protocol, range requests, real files with spaces and Unicode in paths)
- Library scanning works with Windows paths (`C:\Users\...`)
- `latest.json` extended with `windows-x86_64` entry so auto-updater reaches Windows users
- `build:win` script added to `package.json`

**Should have (post-P1 validation):**
- Mobile companion Windows verification (firewall prompt documented, path resolution tested)
- High-DPI scaling verification on Windows 125%/150% display scaling
- SmartScreen bypass documentation in release notes

**Defer to v2+:**
- Windows code signing (OV/EV certificate) — cost/complexity disproportionate for friend-group distribution
- SMTC (System Media Transport Controls) media key integration — requires WinRT bindings via `windows-rs`
- System tray integration — RecoDeck is a visible DJ tool, not a background service
- ARM64 Windows build — effectively zero ARM Windows in the target audience in 2026
- MSIX / Windows Store distribution — breaks SQLite path resolution due to path virtualization

See `.planning/research/FEATURES.md` for the full prioritization matrix, platform behavior comparison table, and competitor analysis.

### Architecture Approach

The architecture for Windows support follows an additive, minimal-change pattern. All platform differences are expressed through existing patterns already in the codebase: compile-time `#[cfg(target_os = "windows")]` in Rust for OS-level behavior, and a runtime `navigator.userAgent.includes('Windows')` check in TypeScript for the URL scheme switch. The CI/CD pattern changes from a single job to a parallel matrix: `build-macos` and `build-windows` run concurrently, and a dependent `create-release` job merges their per-platform `latest.json` fragments into one combined manifest. No new Rust modules, npm packages, or source directories are introduced.

**Major components and changes:**
1. `.github/workflows/release.yml` — rewrite to add `build-windows` parallel job with LLVM setup, x86_64-pc-windows-msvc target, NSIS artifact upload, and a `create-release` merge job
2. `scripts/generate-update-manifest.js` — rewrite to support `--platform` fragment mode and `--merge` mode for combining darwin and windows entries into one `latest.json`
3. `src-tauri/src/commands/server.rs` (`find_mobile_dist()`) — add Windows exe-sibling path check to Fallback 3 (currently macOS `.app/Contents/MacOS` layout assumed)
4. `src-tauri/src/server/streaming.rs` — normalize `\\?\` UNC prefix from `canonicalize()` output before `starts_with` comparison to fix mobile streaming 403 bug
5. `tauri.conf.json` — add `bundle.windows.nsis` section with `installMode: "perUser"`, `compression: "lzma"`
6. `package.json` — add `build:win` and `release:sign:win` scripts

See `.planning/research/ARCHITECTURE.md` for complete data flow diagrams, anti-patterns, audit checklist, and the 7-step build order sequence.

### Critical Pitfalls

1. **`LIBCLANG_PATH` not set on Windows CI** — `bliss-audio-aubio-rs` bindgen fails with "Unable to find libclang." Fix: add `KyleMayes/install-llvm-action@v2` step in the Windows CI job and set `LIBCLANG_PATH=${{ env.LLVM_PATH }}/bin` before `cargo build`. Validate locally or via a manual CI run before writing anything else.

2. **`streaming.rs` canonicalize UNC mismatch** — `std::fs::canonicalize` on Windows returns `\\?\C:\Users\...`; the DB stores forward-slash paths; `starts_with` comparison always fails; every mobile stream request returns 403 Forbidden. Fix: strip `\\?\` prefix and normalize both sides to forward slashes before comparing. One-function change, high impact.

3. **`latest.json` platform overwrite in CI** — if both platform jobs each write and upload their own `latest.json`, the second job to finish overwrites the first. The Tauri updater then delivers a single-platform manifest and users on the other platform stop receiving updates. Fix: each job uploads a fragment JSON as a build artifact; a `create-release` job merges both before creating the release.

4. **SmartScreen blocks unsigned NSIS installer** — every Windows user who downloads the `.exe` from a browser will see a "Windows protected your PC" blue screen. There is no technical fix at this budget level. Fix: document the "More info → Run anyway" path explicitly in release notes; provide a `.zip` alternative if needed. An additional NSIS plugin signing gap (Tauri issue #11673) may trigger antivirus alerts beyond SmartScreen.

5. **WebView2 audio autoplay / CSP** — two linked risks: (a) `audio.play()` before any DOM interaction throws `NotAllowedError` in WebView2; (b) the `stream:` CSP directive is WebKit-only — Windows uses `http://stream.localhost/` which must be covered by the existing `http:` wildcard. Current CSP appears to cover it but must be verified with DevTools console on first Windows boot.

See `.planning/research/PITFALLS.md` for recovery strategies, a "Looks Done But Isn't" checklist, and the full pitfall-to-phase mapping table.

## Implications for Roadmap

Based on research, the work naturally breaks into 4 phases ordered by risk, dependency, and deliverable completeness.

### Phase 1: Windows Compilation Baseline
**Rationale:** Everything else is blocked until `cargo build --target x86_64-pc-windows-msvc` succeeds with `bliss-audio-aubio-rs` bindgen. This is the highest-risk unknown in the milestone. Validate it before investing any effort in CI pipelines, installer config, or updater manifests. If Aubio fails to compile, the milestone strategy changes (e.g., switching to a pre-built aubio binary).
**Delivers:** A runnable debug build of RecoDeck on Windows; audio plays end-to-end; library scan works on Windows paths; no CSP or autoplay errors in DevTools.
**Addresses features:** "App compiles and runs on Windows," "Audio playback works on Windows," "Folder picker works for library setup"
**Avoids pitfalls:** LIBCLANG_PATH bindgen failure (Pitfall 1); WebView2 audio autoplay and CSP issues (Pitfall 5); path separator inconsistency in DB (audit during scan test)

### Phase 2: Windows Code Fixes
**Rationale:** With a working compilation, fix the one confirmed latent bug (mobile streaming 403) and add the Windows-specific path fallback for the mobile companion. These are surgical code changes with clear acceptance tests.
**Delivers:** Mobile companion works end-to-end on Windows; `find_mobile_dist()` resolves correctly in a production NSIS layout; Windows Firewall prompt documented.
**Addresses features:** "Mobile companion works on Windows"
**Avoids pitfalls:** `canonicalize` UNC prefix mismatch (Pitfall 2); mobile PWA path resolution failure (Architecture Audit item)

### Phase 3: NSIS Installer and CI Build Job
**Rationale:** With code working correctly, wire up the automated build and distribution. The NSIS installer config is low-risk (Tauri handles most of it). The Windows CI job introduces the only medium-risk CI work: LLVM installation in the workflow and the new parallel matrix structure.
**Delivers:** Automated Windows CI builds on tag push; NSIS installer (`recodeck_*_x64-setup.exe`) installable on clean Windows 10 and 11 machines; `build:win` and `release:sign:win` scripts in `package.json`.
**Uses stack:** `KyleMayes/install-llvm-action@v2`, `tauri-apps/tauri-action@v0`, NSIS (bundled by Tauri), `swatinem/rust-cache@v2`
**Avoids pitfalls:** Sequential platform builds anti-pattern (use parallel matrix); SmartScreen documentation (Pitfall 3 — document in release notes before publishing)

### Phase 4: Auto-Updater Manifest and Release
**Rationale:** With both macOS and Windows artifacts building in CI, rewire the manifest generation script to produce a merged `latest.json` covering both platforms, and restructure the release workflow to gate on both jobs completing before creating the GitHub Release.
**Delivers:** A GitHub Release containing `.dmg` + `.exe` + merged `latest.json` with both `darwin-aarch64` and `windows-x86_64` entries; existing macOS users continue to receive updates; Windows users get their first auto-update experience.
**Addresses features:** "Auto-updater delivers Windows builds"
**Avoids pitfalls:** `latest.json` platform overwrite (Pitfall 3); missing `windows-x86_64` manifest entry

### Phase Ordering Rationale

- **Risk-first:** Aubio bindgen compilation is the only true unknown. It must be confirmed or unblocked before anything else is designed. All other phases can be planned confidently from existing research and official docs.
- **Dependencies flow forward:** Phase 2 (code fixes) requires a running Windows binary to test against. Phase 3 (CI) requires Phase 2 to be clean so the produced artifact is correct. Phase 4 (updater) requires Phase 3 to produce signed artifacts before manifest URLs can be generated.
- **Smallest scope last:** The manifest and release wiring (Phase 4) is pure configuration and scripting work with no runtime risk, so it comes last when all platform binaries are stable.

### Research Flags

Phases likely needing deeper attention during implementation:
- **Phase 1:** Aubio bindgen on Windows — whether `bliss-audio-aubio-rs` with `features = ["builtin", "bindgen"]` compiles cleanly under MSVC with LLVM 17 has not been empirically validated for this specific crate version. Open the phase by running a trial `cargo build --target x86_64-pc-windows-msvc` on a real Windows environment before finalizing phase scope. If it fails, the blocker must be resolved before anything else.
- **Phase 2:** `find_mobile_dist()` Fallback 1 (Tauri Resource resolver) — documented as cross-platform in Tauri v2 docs but has not been tested in a Windows NSIS install layout for this project. If Fallback 1 works correctly, the Fallback 3 patch is a safety net only; if Fallback 1 fails, Fallback 3 is critical. Needs an NSIS install test.

Phases with standard, well-documented patterns (implementation can proceed without research):
- **Phase 3:** NSIS installer config and CI matrix workflow — fully documented in official Tauri v2 docs. The `KyleMayes/install-llvm-action` workaround for libclang is community-validated. The `tauri-apps/tauri-action@v0` parallel matrix pattern is official.
- **Phase 4:** Updater manifest merging — pure Node.js scripting with a well-defined JSON format documented in official Tauri v2 updater docs. Platform key naming and `latest.json` structure are known quantities.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings grounded in official Tauri v2 docs, direct `Cargo.toml` inspection, and official bindgen docs. The one MEDIUM item (`KyleMayes/install-llvm-action`) is a community action — but it is the standard solution for this problem and has no credible alternative. |
| Features | HIGH | Grounded in direct codebase inspection of existing Windows-aware code paths, official Tauri v2 installer and updater docs, and explicit identification of what is already implemented vs. what is missing. |
| Architecture | HIGH | Based on line-level code reads of all affected files: `lib.rs`, `audioPlayer.ts`, `server.rs`, `streaming.rs`, `release.yml`, `generate-update-manifest.js`. All structural changes are confirmed as necessary by source review. |
| Pitfalls | HIGH | Critical pitfalls are grounded in direct code inspection (the `canonicalize` UNC bug was found by reading the actual `streaming.rs` source) and official documentation. SmartScreen and NSIS plugin signing issues are confirmed upstream Tauri limitations with issue numbers. |

**Overall confidence:** HIGH

### Gaps to Address

- **Aubio bindgen empirical validation:** The claim that `bliss-audio-aubio-rs` with `builtin` + `bindgen` compiles under MSVC with LLVM 17 is based on community evidence and bindgen official docs, not a test run of this specific crate version in this project. Phase 1 must open with a trial `cargo build` before declaring scope final.
- **Tauri Resource resolver on Windows NSIS layout:** `BaseDirectory::Resource` is documented as platform-aware but has not been tested in a Windows NSIS install for this project. If it resolves correctly, the `find_mobile_dist()` Fallback 3 patch is optional hardening; if it fails, Fallback 3 is the only working path.
- **SQLite path separator in folder queries:** Scanner normalizes paths to forward slashes before DB insert (confirmed in `scanner.rs`). However, it is not confirmed whether folder-based `LIKE` queries in `db/mod.rs` and `commands/library.rs` use the same forward-slash convention consistently for both the stored prefix and query string. Needs a Windows library scan plus folder-view test to rule out silent 0-row returns.
- **WebView2 CSP wildcard matching:** The `http:` wildcard in the existing CSP is expected to cover `http://stream.localhost`, but Chromium's CSP engine may differ from WebKit in edge cases. Verify with DevTools console on first Windows boot rather than assuming equivalence.

## Sources

### Primary (HIGH confidence)
- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/) — MSVC toolchain requirement, WebView2 setup
- [Tauri v2 Windows Installer](https://v2.tauri.app/distribute/windows-installer/) — NSIS config, install modes, compression options
- [Tauri v2 GitHub Actions Pipeline](https://v2.tauri.app/distribute/pipelines/github/) — multi-platform workflow structure, `tauri-apps/tauri-action@v0`
- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/) — `latest.json` format, `windows-x86_64` platform key, Windows update flow
- [Tauri v2 Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/) — unsigned installer behavior, SmartScreen, Azure options
- [bindgen Requirements](https://rust-lang.github.io/rust-bindgen/requirements.html) — LIBCLANG_PATH, libclang minimum version
- [ort Cargo Features](https://ort.pyke.io/setup/cargo-features) — `download-binaries` default, Windows prebuilt binary fetch
- Codebase: `src-tauri/src/lib.rs` — Windows `#[cfg]` branches confirmed in stream protocol handler
- Codebase: `src/lib/audioPlayer.ts` — `isWindows` UA detection and `http://stream.localhost/` URL construction confirmed
- Codebase: `src-tauri/src/commands/server.rs` — `find_mobile_dist()` Fallback 3 macOS-only layout confirmed
- Codebase: `src-tauri/src/server/streaming.rs` — `canonicalize` path comparison; UNC prefix bug identified at source
- Codebase: `src-tauri/Cargo.toml` — `bliss-audio-aubio-rs` with `["builtin","bindgen"]` and `ort = "2.0.0-rc.11"` confirmed
- Codebase: `.github/workflows/release.yml` — macOS-only CI, no Windows job confirmed
- Codebase: `scripts/generate-update-manifest.js` — darwin-only manifest generation confirmed

### Secondary (MEDIUM confidence)
- [KyleMayes/install-llvm-action GitHub Marketplace](https://github.com/marketplace/actions/install-llvm-and-clang) — LLVM CI setup for bindgen; community action, widely used
- [bindgen issue #1797](https://github.com/rust-lang/rust-bindgen/issues/1797) — `LIBCLANG_PATH` workaround for Windows CI; community-sourced solution
- Tauri issue #9968 — Audio autoplay on Windows was broken by a typo in WebView2 init args (wry#1287); confirmed fixed in current Tauri 2 but WebView2 autoplay policy itself is still enforced
- Tauri issue #11673 — NSIS embedded plugin DLLs are unsigned; may trigger antivirus false positives; no upstream fix yet

### Tertiary (LOW confidence)
- `bliss-audio-aubio-rs` with MSVC + LLVM 17 compiling successfully — inferred from community evidence and bindgen docs; must be empirically validated in Phase 1 before relying on it

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
