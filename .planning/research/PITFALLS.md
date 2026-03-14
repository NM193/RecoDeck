# Pitfalls Research

**Domain:** Adding Windows platform support to an existing macOS-only Tauri 2 desktop music player (RecoDeck)
**Project:** RecoDeck v1.5 Windows Support
**Researched:** 2026-03-14
**Confidence:** HIGH — derived from direct codebase inspection combined with verified Tauri, bindgen, and NSIS documentation

---

## Critical Pitfalls

### Pitfall 1: `LIBCLANG_PATH` Not Set — Aubio Bindgen Fails to Compile on Windows CI

**What goes wrong:**
`bliss-audio-aubio-rs` is declared in `Cargo.toml` with `features = ["builtin", "bindgen"]`. The `bindgen` feature causes the build to invoke `libclang` at compile time to generate FFI bindings from C headers. On Windows (both locally and on `windows-latest` GitHub Actions runners), bindgen cannot locate `libclang.dll` unless `LIBCLANG_PATH` is explicitly set. The build fails with: `Unable to find libclang: "the 'libclang' shared library at [path]"`.

**Why it happens:**
The GitHub Actions `windows-latest` runner includes LLVM only as a Visual Studio component — it is not on `PATH` and `LIBCLANG_PATH` is not set by default. The bliss-audio-aubio-rs `builtin` feature also invokes cmake to compile the C aubio library from source, which requires a working C compiler (MSVC or MinGW). If cmake is not installed or the toolchain is wrong, this fails as a separate error before bindgen even runs.

**How to avoid:**
In the GitHub Actions Windows job, add these steps before `npx tauri build`:

```yaml
- name: Install LLVM and Clang (for aubio-rs bindgen)
  uses: KyleMayes/install-llvm-action@v2
  with:
    version: "17"

- name: Set LIBCLANG_PATH
  run: echo "LIBCLANG_PATH=${{ env.LLVM_PATH }}/bin" >> $GITHUB_ENV
```

Alternatively, use `winget install LLVM.LLVM` locally and set `LIBCLANG_PATH=C:\Program Files\LLVM\bin` as a system environment variable. Verify with `cargo build` before wiring CI.

**Warning signs:**
- Build error: `Unable to find libclang` on Windows but not macOS
- Build error: `thread 'main' panicked at 'Unable to find libclang'`
- CI Windows job fails at the `cargo build` step specifically on crates that use bindgen

**Phase to address:** Phase 1 (Windows compilation baseline) — this is the first blocker to resolve. Nothing else can proceed until the crate compiles.

---

### Pitfall 2: Mobile Companion Path Validation Fails on Windows (canonicalize vs. Stored Forward-Slash Paths)

**What goes wrong:**
In `src-tauri/src/server/streaming.rs` at line 87 and 96, the security check for mobile streaming does:

```rust
let canonical_path = std::fs::canonicalize(&file_path)...;
let canonical_str = canonical_path.to_string_lossy().to_string();
// ...
canonical_str.starts_with(&canonical_folder.to_string_lossy().to_string())
```

On Windows, `std::fs::canonicalize` returns a UNC-prefixed backslash path: `\\?\C:\Users\...`. The DB stores paths as forward-slash normalized strings (`C:/Users/...`) because `scanner.rs` runs `normalize_scanned_path` which converts backslashes to forward slashes before inserting. The `starts_with` comparison between a `\\?\C:\Users\music\track.mp3` canonical string and a `C:/music` library folder string will **always return false**. Every mobile stream request will be rejected with 403 Forbidden.

**Why it happens:**
`std::fs::canonicalize` on Windows prepends the `\\?\` UNC prefix (extended-length path notation) and uses backslashes. The scanner intentionally normalizes to forward slashes for DB storage consistency. These two representations never match with a simple `starts_with` string comparison.

**How to avoid:**
Before comparing, strip the `\\?\` prefix from the canonical path on Windows and normalize both sides to forward slashes:

```rust
fn normalize_for_comparison(s: &str) -> String {
    let s = s.strip_prefix(r"\\?\").unwrap_or(s);
    s.replace('\\', "/")
}

let canonical_norm = normalize_for_comparison(&canonical_str);
let folder_norm = normalize_for_comparison(&canonical_folder.to_string_lossy());
canonical_norm.starts_with(&folder_norm)
```

Use this normalization on both the track path and the library folder path before comparison.

**Warning signs:**
- Mobile companion PWA connects but all stream requests return 403 Forbidden
- `[companion] Stream rejected: track X not within library roots` appears in Tauri logs on Windows even for valid tracks
- Desktop playback works fine but mobile streaming is completely broken

**Phase to address:** Phase 2 (mobile companion Windows fixes) — must be tested on a real Windows machine or Windows CI with a library folder set up.

---

### Pitfall 3: Windows SmartScreen Blocks Every Download of the Unsigned NSIS Installer

**What goes wrong:**
Any NSIS `.exe` installer downloaded from a browser on Windows triggers a Windows Defender SmartScreen "Windows protected your PC" blue warning screen. For unsigned installers from unknown publishers, this warning cannot be bypassed silently — users must click "More info" then "Run anyway." For some antivirus configurations (corporate environments, Crowdstrike), the installer may be blocked entirely with no bypass option. Additionally, Tauri's NSIS installer embeds NSIS plugin DLLs in `$PLUGINSDIR` — these are not signed even when the outer `.exe` is signed, causing a second wave of antivirus alerts.

**Why it happens:**
Microsoft SmartScreen assigns reputation scores to downloaded executables based on signing certificate and download frequency. A freshly built app with no prior download history has zero reputation regardless of whether the developer considers it trustworthy. The NSIS plugin DLL signing gap is a documented upstream Tauri issue (#11673) with no current fix.

**How to avoid:**
- Accept that for a small audience of DJ friends, the SmartScreen dialog is manageable — document the "More info → Run anyway" click in the release notes.
- Do not invest in an EV certificate (thousands of dollars annually) for a personal tool.
- Provide a PowerShell one-liner in release notes as an alternative installation path: `Expand-Archive recodeck-win.zip -DestinationPath "$env:LOCALAPPDATA\recodeck"` using a plain `.zip` distribution.
- If using an OV certificate in the future, SmartScreen reputation accumulates over weeks; initial users will still see warnings.
- For the NSIS plugin signing gap: no workaround exists in Tauri 2 today. Monitor issue #11673 for upstream fix.

**Warning signs:**
- Users report "Windows protected your PC" during install
- Corporate users report antivirus quarantining the installer immediately after download
- Users report `$PLUGINSDIR\StdUtils.dll` being flagged by antivirus

**Phase to address:** Phase 3 (NSIS installer configuration) — set expectations in release notes before publishing. Do not attempt to hide this known limitation.

---

### Pitfall 4: WebView2 Audio Autoplay Bug — Audio Does Not Start on Windows Without Prior DOM Interaction

**What goes wrong:**
In earlier Tauri 2 / wry versions, a typo in the Windows WebView2 initialization arguments caused `autoplay-policy` to not be passed correctly, making audio autoplay silently fail on Windows even after user interaction. This was reported as Tauri issue #9968. In current Tauri 2 versions the typo is fixed, but **the autoplay policy itself is still enforced by WebView2** — `audio.play()` on a fresh app launch before any DOM interaction will be rejected with a `NotAllowedError: play() can only be initiated by a user gesture`.

**Why it happens:**
WebView2 enforces Chromium's autoplay policy (same as Chrome). WKWebView on macOS also enforces this, but RecoDeck's audio playback is always triggered by explicit user clicks (play button, track selection), so this is currently handled correctly. The risk is platform-specific edge cases — e.g. if RecoDeck ever tries to auto-resume the last track on startup on Windows, it will fail.

**How to avoid:**
- Verify that every `audio.play()` call in `audioPlayer.ts` is downstream of a user gesture.
- Do not add "resume last track on startup" features without first testing on Windows — this is the most likely trigger point.
- The existing architecture (play is only triggered by user clicks) should be safe. Verify in CI smoke test.
- If auto-resume is ever added, buffer the play intent and execute it on the next user interaction.

**Warning signs:**
- `Uncaught (in promise) NotAllowedError: play() failed because the user didn't interact with the document first` in Windows DevTools console
- Play button does nothing on Windows but works on macOS

**Phase to address:** Phase 1 (compilation verification) — add a manual Windows test checklist item: "press play button, audio starts" before declaring compilation complete.

---

### Pitfall 5: `http://stream.localhost` CSP Header Missing `http:` Source — Audio Blocked on Windows

**What goes wrong:**
On Windows, Tauri's custom protocols map to `http://scheme.localhost/` URLs instead of `scheme://localhost/`. The current CSP in `tauri.conf.json` is:

```
media-src 'self' stream: http: https: blob:
```

The `stream:` directive allows the macOS custom protocol. `http:` as a wildcard allows any HTTP origin including `http://stream.localhost`. This appears safe — but the wildcard `http:` is broad. If the WebView2 CSP implementation is stricter about wildcard matching than WKWebView, or if `http://stream.localhost` is not considered a match for the generic `http:` source list, audio will silently fail.

**Why it happens:**
WebView2 uses Chromium's CSP implementation, which may handle `http:` and `stream:` source directives differently from WKWebView. The `stream:` scheme is not a registered scheme in Chromium — it's only recognized in WKWebView via Tauri's URL remapping. On Windows, the scheme is never `stream:` — it's always `http://stream.localhost/`.

**How to avoid:**
Make the CSP explicit for Windows by adding `http://stream.localhost` as an allowed source:

```json
"csp": "default-src 'self'; img-src 'self' blob: asset: https://asset.localhost/; media-src 'self' stream: http://stream.localhost http: https: blob:"
```

Alternatively, test on Windows DevTools (F12 → Console) and look for CSP violation errors on audio load. If none appear, the existing `http:` wildcard is working.

**Warning signs:**
- `Refused to load media from 'http://stream.localhost/?p=...' because it violates the following Content Security Policy directive: "media-src 'self' stream: ..."`
- Audio elements show `NETWORK_ERR` (error code 2) in `audioPlayer.ts`
- Same tracks load on macOS but not Windows

**Phase to address:** Phase 1 (Windows compilation and first boot test) — verify audio actually plays before building anything else.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip code signing, distribute raw NSIS .exe | Saves $200-500/yr for OV cert | Every Windows user sees SmartScreen warning; corporate users blocked | Acceptable for personal-use DJ friends audience |
| Use `LIBCLANG_PATH` hardcoded to LLVM 17 path in CI | Works today | Breaks when GitHub runner LLVM version changes | Acceptable short-term; pin action version to lock it |
| Store paths with forward slashes on Windows (current design) | Consistent DB format cross-platform | Requires explicit normalization before `canonicalize()` comparison | Acceptable — normalization is cheap, consistency is valuable |
| Cross-compile Windows from macOS CI instead of native Windows runner | No need to maintain Windows environment | Cross-compilation of C code (aubio) via cargo-xwin is experimental; not tested as much per Tauri docs | Never for the C bindgen path — use native `windows-latest` runner |
| Use `targets: "all"` in tauri.conf.json bundle | Builds all targets | On Windows, builds both NSIS and MSI; MSI requires VBSCRIPT optional Windows feature enabled | Acceptable to leave but add `VBSCRIPT` note to Windows setup docs |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `streaming.rs` path validation | `canonical_path.to_string_lossy().starts_with(folder_str)` — broken on Windows due to `\\?\` UNC prefix | Strip `\\?\`, normalize both sides to forward slashes before `starts_with` comparison |
| `audioPlayer.ts` stream URL | Checking `navigator.userAgent.includes('Windows')` to decide URL format — already implemented correctly | Verify this branch is tested on Windows; `http://stream.localhost/?p=...` must be used on Windows |
| GitHub Actions Windows job | Using same `npm run release:manifest` script as macOS without adapting Windows target names | `TAURI_UPDATE_PLATFORM` must be `windows-x86_64`; artifact paths differ (`.msi` / `.nsis.zip`) |
| auto-updater `latest.json` | Omitting the `windows-x86_64` platform entry | Both `darwin-aarch64` and `windows-x86_64` entries required; updater silently does nothing if platform key missing |
| NSIS installer language | Leaving `displayLanguageSelector` unset for international users | Default is OS language; acceptable for DJ friends audience — no action needed |
| WebView2 version requirement | Assuming WebView2 is pre-installed on all Windows machines | WebView2 ships with Windows 10 21H1+ and Windows 11; for older Windows 10, the NSIS `downloadBootstrapper` default handles it |
| `tauri_plugin_opener` on Windows | `opener::open(url)` behavior for file:// paths differs between Windows shell and macOS Finder | Test folder-open functionality on Windows before shipping |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `analyze_waveform` reads entire audio file into memory | On Windows with large FLAC files (100+ MB), peak RAM usage during analysis | Already documented in project memory: must stay synchronous; no change needed | Individual files over 500 MB on low-RAM machines |
| Rayon parallel BPM analysis on Windows with `windows-latest` CI | CI timeout on 8-core runner analyzing a test library | Cap rayon thread pool size in CI; use `RAYON_NUM_THREADS=4` env var | During CI test runs with large test libraries |
| `std::fs::canonicalize` on Windows prepends `\\?\` and stat-checks every path component | Slow on network drives or deeply nested paths | Use only for security validation in streaming.rs; do not use in hot paths like track listing | Network-mounted music libraries with deep folder trees |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Distributing unsigned NSIS installer | Low for this audience; moderate reputational risk | Accept the SmartScreen warning; document it in release notes; consider `.zip` distribution as alternative |
| Windows Firewall blocking Axum companion server port | Mobile companion server silently fails; users cannot connect from mobile | The Tauri-spawned Axum server must bind on `0.0.0.0`; Windows Firewall prompts user on first run — document this expected prompt in user-facing release notes |
| QR code shows LAN IP that Windows firewall blocks | Mobile app shows connected but audio never loads | Test companion server on Windows: connect mobile device, verify stream plays end to end |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| SmartScreen dialog on installer download | Users unfamiliar with Windows security dialogs may abort install thinking the app is malware | Include explicit screenshot + "More info → Run anyway" instruction in release notes |
| Windows Firewall dialog on first companion server start | User sees unexpected system dialog asking to allow RecoDeck network access | Add a one-time first-run message: "RecoDeck will request firewall access for mobile streaming. Click Allow." |
| Audio file paths with drive letter displayed in UI | `C:/Users/DJ/Music/track.mp3` looks different from macOS paths — no functional issue but cosmetically inconsistent | No action needed; path display in tooltip/debug views should already handle this |

---

## "Looks Done But Isn't" Checklist

- [ ] **Aubio bindgen compilation:** `cargo build --target x86_64-pc-windows-msvc` succeeds locally or in CI without `LIBCLANG_PATH` errors — verify `LIBCLANG_PATH` is set in CI environment
- [ ] **Audio plays on Windows:** Launch app on Windows, select a track, press play — audio must be audible (not just "no error")
- [ ] **Mobile companion streaming on Windows:** Start companion server, scan QR from phone, stream a track — 403 Forbidden means the canonicalize path comparison bug is present
- [ ] **NSIS installer installs correctly:** Download and run the `.exe`, verify app launches, library scan works, audio plays
- [ ] **Auto-updater manifest has Windows entry:** `latest.json` must contain a `windows-x86_64` platform key with a valid `.msi.zip` or `.nsis.zip` URL and `.sig` file
- [ ] **SmartScreen warning documented:** Release notes include explicit install instructions for Windows SmartScreen bypass
- [ ] **Windows Firewall prompt tested:** Companion server start on Windows triggers firewall dialog — verify "Allow" makes mobile streaming work
- [ ] **Folder scan on Windows paths:** Add `C:\Users\...\Music` as library folder, scan — tracks should appear with forward-slash paths in DB
- [ ] **CSP no violations:** Open Windows DevTools (F12), load a track, check Console for any CSP violation messages on `stream.localhost` URLs

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Aubio bindgen fails in CI | LOW | Add `KyleMayes/install-llvm-action` step + set `LIBCLANG_PATH` env var before cargo build |
| Mobile streaming 403 on Windows | LOW | Add `normalize_for_comparison` helper in `streaming.rs`; normalize both sides before `starts_with`; no DB changes needed |
| SmartScreen blocks all users | LOW | Publish `.zip` distribution alongside NSIS installer; document bypass in release notes |
| WebView2 audio not playing | MEDIUM | Verify CSP; check DevTools console; ensure all `play()` calls are in user gesture handlers; test `http://stream.localhost` URL construction |
| Auto-updater not working on Windows | LOW | Add `windows-x86_64` entry to `latest.json` generation script; verify `.sig` file is uploaded to GitHub release |
| Windows Firewall blocks companion server | LOW | Document expected Firewall prompt in release notes; verify Axum binds `0.0.0.0` not `127.0.0.1` for LAN access |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Aubio bindgen / LIBCLANG_PATH | Phase 1 — Windows compilation baseline | `cargo build` succeeds in CI Windows job; no `libclang` errors |
| Mobile companion 403 due to canonicalize mismatch | Phase 2 — mobile companion Windows fixes | Connect phone via QR code on Windows; audio streams without error |
| SmartScreen / NSIS antivirus blocking | Phase 3 — NSIS installer configuration | Download installer on clean Windows machine; document SmartScreen bypass |
| WebView2 audio autoplay CSP | Phase 1 — first Windows boot | Press play on Windows build; audio plays; no CSP console errors |
| Auto-updater missing Windows platform entry | Phase 4 — CI/CD and auto-updater | Check `latest.json` contains `windows-x86_64` key; updater plugin picks it up |
| Windows Firewall blocking companion server | Phase 2 — mobile companion Windows fixes | Confirm firewall prompt appears and "Allow" enables mobile streaming |
| `canonicalize` UNC prefix in any future path code | All phases | Code review any new `canonicalize()` usage; always normalize before string comparison |

---

## Sources

- Tauri 2 Windows Installer docs: [https://v2.tauri.app/distribute/windows-installer/](https://v2.tauri.app/distribute/windows-installer/)
- Tauri 2 Windows Code Signing: [https://v2.tauri.app/distribute/sign/windows/](https://v2.tauri.app/distribute/sign/windows/)
- Tauri issue #9968 — Audio autoplay not working on Windows: [https://github.com/tauri-apps/tauri/issues/9968](https://github.com/tauri-apps/tauri/issues/9968)
- Tauri issue #11673 — NSIS plugins not signed (causes antivirus false positives): [https://github.com/tauri-apps/tauri/issues/11673](https://github.com/tauri-apps/tauri/issues/11673)
- bindgen requirements (LIBCLANG_PATH): [https://rust-lang.github.io/rust-bindgen/requirements.html](https://rust-lang.github.io/rust-bindgen/requirements.html)
- GitHub Actions runner images issue — LLVM version inconsistency on windows-latest: [https://github.com/actions/runner-images/issues/12435](https://github.com/actions/runner-images/issues/12435)
- GitHub Actions issue — libclang not found on Windows bindgen: [https://github.com/rust-lang/rust-bindgen/issues/1797](https://github.com/rust-lang/rust-bindgen/issues/1797)
- KyleMayes/install-llvm-action (GitHub Marketplace): [https://github.com/marketplace/actions/install-llvm-and-clang](https://github.com/marketplace/actions/install-llvm-and-clang)
- bliss-audio-aubio-rs crate (builtin + bindgen features): [https://docs.rs/bliss-audio-aubio-rs/latest/bliss_audio_aubio_rs/](https://docs.rs/bliss-audio-aubio-rs/latest/bliss_audio_aubio_rs/)
- False positives in Tauri apps: [https://tauri.by.simon.hyll.nu/concepts/security/false_positives/](https://tauri.by.simon.hyll.nu/concepts/security/false_positives/)
- Tauri updater plugin docs: [https://v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/)
- Microsoft `MAX_PATH` docs: [https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)
- Codebase: `src-tauri/src/server/streaming.rs` — canonicalize path comparison at lines 85-100
- Codebase: `src-tauri/src/scanner.rs` — `normalize_scanned_path` forward-slash normalization at lines 148-200
- Codebase: `src/lib/audioPlayer.ts` — Windows URL detection at lines 616-640
- Codebase: `src-tauri/src/lib.rs` — Windows URL format comment at lines 72-73

---
*Pitfalls research for: RecoDeck v1.5 Windows Platform Support*
*Researched: 2026-03-14*
