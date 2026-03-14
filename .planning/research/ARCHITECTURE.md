# Architecture Research

**Domain:** Tauri v2 multi-platform desktop app — adding Windows support to existing macOS-only build
**Researched:** 2026-03-14
**Confidence:** HIGH (grounded in direct codebase inspection of all platform-branching points)

---

## Standard Architecture

### System Overview — Current State (macOS only)

```
┌──────────────────────────────────────────────────────────────────┐
│                     Frontend (React 19 / WebView)                 │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │ audioPlayer│  │  tauri-api  │  │  stream:// URL builder   │   │
│  │    .ts     │  │     .ts     │  │  (macOS: stream://localhost│  │
│  │            │  │ (IPC stubs) │  │   Win: http://stream.loc)│   │
│  └─────┬──────┘  └──────┬──────┘  └──────────────────────────┘   │
│        │                │                                          │
├────────┼────────────────┼──────────────────────────────────────── ┤
│        │       Tauri IPC│bridge                                    │
├────────┼────────────────┼──────────────────────────────────────────┤
│        │                │         Rust Backend                     │
│  ┌─────▼──────┐  ┌──────▼──────────────────────────────────────┐  │
│  │ stream://  │  │              commands/                       │  │
│  │ protocol   │  │  library | playback | analysis | ai         │  │
│  │ handler    │  │  playlists | genre | settings | server      │  │
│  │ (lib.rs)   │  └──────────────────────┬──────────────────────┘  │
│  └─────┬──────┘                         │                          │
│        │                    ┌───────────▼────────────┐            │
│        │                    │     db/mod.rs          │            │
│        │                    │  (SQLite via rusqlite) │            │
│        │                    └────────────────────────┘            │
│        │                                                           │
│  ┌─────▼──────────────────────────────────────────────────────┐   │
│  │               Audio files on local filesystem               │   │
│  │           (paths stored as strings in SQLite)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

Mobile companion (Axum HTTP server — runs on LAN, not platform-specific)
┌────────────────────────────────────────────────────┐
│  server/mod.rs  ->  routes.rs  ->  streaming.rs    │
│  find_mobile_dist() resolves mobile PWA resources  │
│  Fallback 3 in find_mobile_dist is macOS-specific  │
└────────────────────────────────────────────────────┘

CI/CD (GitHub Actions — macOS only today)
┌────────────────────────────────────────────────────┐
│  release.yml: single job, macos-latest runner      │
│  Target: aarch64-apple-darwin only                 │
│  Artifacts: .dmg + .app.tar.gz + .sig              │
│  Updater: latest.json with darwin-aarch64 only     │
└────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Windows Impact |
|-----------|----------------|----------------|
| `lib.rs` — stream:// handler | Serve audio bytes over custom protocol to the WebView | Already has `#[cfg(target_os = "windows")]` branches for UNC paths and backslash normalization. Needs validation testing on real Windows. |
| `audioPlayer.ts` — URL builder | Converts file paths to stream:// or http://stream.localhost/ URLs | Already detects Windows via `navigator.userAgent.includes('Windows')`. Maps to `http://stream.localhost/?p=`. No changes needed. |
| `commands/server.rs` — `find_mobile_dist()` | Locates the bundled mobile PWA at runtime | Fallback 3 (exe-relative) uses macOS `.app/Contents/MacOS/` layout. Must add Windows `.exe` sibling path logic. |
| `db/mod.rs` — path storage | Stores and queries `file_path` as raw strings in SQLite | Paths stored as-scanned by the OS. On Windows these are `C:\Users\...` paths. Folder queries using `LIKE 'prefix/%'` must be tested — Windows paths use backslash. |
| `scanner.rs` | Recursively finds audio files using `walkdir` | `walkdir` is cross-platform. File paths returned are OS-native. Path storage as strings will produce `C:\...` on Windows. |
| `src-tauri/Cargo.toml` | Dependency configuration | `bliss-audio-aubio-rs` with `features = ["builtin","bindgen"]` requires C compiler + libclang on Windows. Highest-risk build dependency. |
| `build.rs` | Tauri build integration | Currently trivial. No changes needed. |
| `.github/workflows/release.yml` | CI/CD pipeline | macOS-only. Must be split into parallel jobs with a merge step. |
| `scripts/generate-update-manifest.js` | Writes `latest.json` | macOS-only paths and single-platform block. Must be rewritten to merge platforms when called from each build job. |
| `tauri.conf.json` | Bundle configuration | `targets: "all"` already includes NSIS for Windows. `icon.ico` already exists. Updater endpoint is shared. |

---

## Recommended Project Structure

No new source directories are needed. All Windows support is achieved by modifying existing files plus adding CI configuration:

```
RecoDeck/
├── src-tauri/
│   └── src/
│       └── commands/
│           └── server.rs          # find_mobile_dist(): add Windows exe-relative path
├── .github/
│   └── workflows/
│       └── release.yml            # Add build-windows job + create-release merge job
├── scripts/
│   └── generate-update-manifest.js  # Rewrite for multi-platform fragment + merge
└── package.json                   # Add build:win, release:sign:win scripts
```

### Structure Rationale

- **No new Rust modules:** Platform differences are handled via `#[cfg]` inside existing modules.
- **No new npm packages:** CI changes and script rewrites use Node.js stdlib.
- **Cargo.toml unchanged for dependencies:** aubio and bindgen are already declared; the issue is the Windows build environment, not the Cargo config.

---

## Architectural Patterns

### Pattern 1: Compile-Time Platform Branching via `#[cfg(target_os = "windows")]`

**What:** Rust attributes that include code only when compiling for a specific OS. Already used in `lib.rs` for UNC path handling, backslash normalization, and `try_read()` fallback.

**When to use:** Any code path where behavior must differ by OS at a compiled-binary level — path separators, directory layout, OS APIs.

**Trade-offs:** Pro: zero runtime overhead, correct by construction. Con: must compile on all platforms to catch errors; CI must test both platforms.

**Example (already in lib.rs):**
```rust
#[cfg(target_os = "windows")]
{
    s = s.replace('\\', "/");
}
#[cfg(not(target_os = "windows"))]
{
    // preserve backslashes on non-Windows (valid in filenames)
}
```

### Pattern 2: Runtime Platform Detection in TypeScript via User Agent

**What:** `navigator.userAgent.includes('Windows')` to switch the custom protocol URL scheme at runtime.

**When to use:** Frontend code that must generate different URLs per platform. Already used in `audioPlayer.ts`.

**Trade-offs:** Pro: single JS/TS build artifact. Con: string match is fragile in theory, but `'Windows'` in the Tauri WebView UA string is reliable in practice.

**Example (already in audioPlayer.ts):**
```typescript
const isWindows = navigator.userAgent.includes('Windows')
return isWindows
  ? `http://stream.localhost/?p=${encoded}`
  : `stream://localhost/?p=${encoded}`
```

### Pattern 3: Parallel CI Jobs with Artifact Merge

**What:** GitHub Actions matrix — `build-macos` and `build-windows` run in parallel on their respective runners, each producing platform-specific artifacts. A final `create-release` job depends on both and merges the updater manifest.

**When to use:** Multi-platform builds where each platform must run on its native runner. Tauri v2 with C FFI (aubio + bindgen) does not cross-compile reliably.

**Trade-offs:** Pro: fastest total CI time; each platform build is isolated. Con: the latest.json merge step requires artifact passing between jobs.

**Target state:**
```yaml
jobs:
  build-macos:
    runs-on: macos-latest
    # outputs: darwin artifact + fragment JSON

  build-windows:
    runs-on: windows-latest
    # outputs: Windows artifact + fragment JSON

  create-release:
    needs: [build-macos, build-windows]
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
      - name: Merge latest.json
        run: node scripts/generate-update-manifest.js --merge
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            artifacts/mac/*.dmg
            artifacts/mac/*.app.tar.gz
            artifacts/mac/*.app.tar.gz.sig
            artifacts/win/*.exe
            artifacts/win/*.nsis.zip
            artifacts/win/*.nsis.zip.sig
            latest.json
```

### Pattern 4: find_mobile_dist() Cross-Platform Exe-Relative Resolution

**What:** The Tauri Resource resolver (`BaseDirectory::Resource`) is the correct production path on all platforms and should handle both. The manual exe-relative fallback (Fallback 3) currently hard-codes macOS `.app` bundle layout. Must add the Windows sibling pattern.

**Windows vs macOS install layouts:**
```
macOS (.app bundle):
  recodeck.app/Contents/MacOS/recodeck     <- exe
  recodeck.app/Contents/Resources/mobile-dist/  <- resources

Windows (NSIS installer):
  C:\Program Files\recodeck\recodeck.exe   <- exe
  C:\Program Files\recodeck\mobile-dist\   <- sibling to exe
```

**Fix:**
```rust
// Fallback 3: exe-relative, cross-platform
if let Ok(exe) = std::env::current_exe() {
    if let Some(exe_dir) = exe.parent() {
        // Windows: mobile-dist is a sibling of the exe
        let win_path = exe_dir.join("mobile-dist");
        if win_path.join("index.html").exists() {
            return Some(win_path);
        }
        // macOS: exe is in Contents/MacOS, resources in Contents/Resources
        if let Some(contents) = exe_dir.parent() {
            let mac_path = contents.join("Resources").join("mobile-dist");
            if mac_path.join("index.html").exists() {
                return Some(mac_path);
            }
        }
    }
}
```

---

## Data Flow

### Audio Playback URL Flow (Platform-Specific)

```
Track selected (DB record: file_path = "C:\Music\track.mp3" on Windows)
    |
    v
audioPlayer.ts: pathToStreamUrl(file_path)
    |
    v  [isWindows = navigator.userAgent.includes('Windows')]
    |
Windows:  http://stream.localhost/?p=C%3A%5CMusic%5Ctrack.mp3
macOS:    stream://localhost/?p=/Music/track.mp3
    |
    v
Rust stream:// protocol handler in lib.rs
    |
    v
percent_decode_maybe_twice() -> normalize_local_path()
    |
    v  [#[cfg(target_os = "windows")]]
    |
Windows: replace '/' -> '\', handle UNC, collapse double slashes
macOS:   collapse double slashes, ensure leading /
    |
    v
try_read(file_path) -> std::fs::read(path)
  [fallback 0: try backslashes on Windows]
  [fallback 1: strip space before extension]
  [fallback 2: directory listing match]
    |
    v
HTTP response (206 Partial Content for Range, 200 otherwise)
    |
    v
HTMLAudioElement plays
```

### Build + Release Flow (Target State — Multi-Platform)

```
git push v* tag
    |
    v
GitHub Actions triggered
    |
    +---------------------------+---------------------------+
    |   build-macos job         |   build-windows job       |
    |   macos-latest runner     |   windows-latest runner   |
    |                           |                           |
    |   1. npm ci               |   1. Install LLVM/clang   |
    |   2. version:sync         |   2. npm ci               |
    |   3. setup rust aarch64   |   3. version:sync         |
    |   4. tauri build          |   4. setup rust x86_64-   |
    |      --target aarch64-    |      pc-windows-msvc      |
    |      apple-darwin         |   5. tauri build          |
    |   5. sign .app.tar.gz     |      --target x86_64-pc-  |
    |   6. write darwin         |      windows-msvc         |
    |      fragment JSON        |   6. sign .nsis.zip       |
    |   7. upload artifacts     |   7. write windows        |
    |                           |      fragment JSON        |
    |                           |   8. upload artifacts     |
    +---------------------------+---------------------------+
                    |
                    v
         create-release job (ubuntu-latest)
            needs: [build-macos, build-windows]
            1. download-artifact (all)
            2. node scripts/generate-update-manifest.js --merge
               -> reads darwin fragment + windows fragment
               -> writes combined latest.json:
                  { platforms: {
                      "darwin-aarch64": { sig, url, sha256 },
                      "windows-x86_64": { sig, url, sha256 }
                  }}
            3. softprops/action-gh-release
               -> uploads .dmg, .app.tar.gz, .sig (mac)
               -> uploads .exe, .nsis.zip, .nsis.zip.sig (win)
               -> uploads latest.json
```

### Mobile PWA Path Resolution Flow

```
start_companion_server() called
    |
    v
find_mobile_dist(Some(&app))
    |
    v  [Fallback 1 — production, all platforms]
    Try: handle.path().resolve("mobile-dist", BaseDirectory::Resource)
    -> Works on both macOS and Windows in production (Tauri handles the layout)
    |
    v  [not found -> Fallback 2 — development, all platforms]
    Try: CARGO_MANIFEST_DIR/../mobile/dist
    -> Works on both platforms in dev mode
    |
    v  [not found -> Fallback 3 — legacy exe-relative]
    Windows: exe.parent()/mobile-dist/       <- MISSING TODAY, must add
    macOS:   exe.parent()/../Resources/mobile-dist/  <- already works
```

---

## Integration Points — New vs Modified

### Modified (Existing Files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src-tauri/src/commands/server.rs` | Bug fix | `find_mobile_dist()` Fallback 3: add Windows exe-sibling path check. Tauri Resource resolver (Fallback 1) handles production on both platforms; this is a safety net for edge cases. |
| `.github/workflows/release.yml` | Rewrite | Add `build-windows` parallel job with windows-latest runner, LLVM setup, x86_64-pc-windows-msvc target, NSIS artifact upload. Add `create-release` merge job. Keep `build-macos` job intact with all existing steps. |
| `scripts/generate-update-manifest.js` | Rewrite | Support `--platform` flag for per-build fragment output; support `--merge` flag that reads two fragment files and writes combined `latest.json`. Existing behavior (single-platform, macOS) becomes the `--platform darwin-aarch64` mode. |
| `package.json` | Add scripts | Add `build:win` (`tauri build --target x86_64-pc-windows-msvc`), `release:sign:win` (path for NSIS zip signature). Existing `build:mac` and `release:manifest` unchanged. |

### New (CI/Toolchain Only — No New Source Files)

| Component | What | Notes |
|-----------|------|-------|
| Windows runner setup in CI | `KyleMayes/install-llvm-action` or `chocolatey install llvm` in release.yml | Required for `bindgen` feature of `bliss-audio-aubio-rs`. `LIBCLANG_PATH` env var must be set before cargo build. |
| `TAURI_SIGNING_PRIVATE_KEY` in Windows job | GitHub secret (already exists) | Same minisign key used for macOS. No new secrets needed. |
| NSIS installer | Auto-generated by Tauri | `tauri.conf.json` `bundle.targets: "all"` already includes NSIS. `icon.ico` already exists in `src-tauri/icons/`. |

### Not Changing (Already Cross-Platform or Out of Scope)

| Component | Why Untouched |
|-----------|---------------|
| `src-tauri/src/lib.rs` — stream protocol | Already has correct Windows `#[cfg]` branches. Needs integration testing but no code changes. |
| `src/lib/audioPlayer.ts` — URL builder | Already detects Windows and uses `http://stream.localhost/`. No changes needed. |
| Mobile server (`server/`) | `axum`, `tokio`, `tower-http` are fully cross-platform. No OS-specific code. |
| `tauri.conf.json` | `targets: "all"` already produces NSIS. Resource bundling is cross-platform. |
| Frontend (React, Zustand, TailwindCSS) | Fully cross-platform. Runs in WebView2 on Windows unchanged. |
| `rusqlite` (`bundled` feature) | SQLite compiled in, cross-platform. No changes needed. |

### Audit Required Before Closing Milestone

| Area | Audit Question | Risk |
|------|----------------|------|
| `db/mod.rs` folder queries | `LIKE 'prefix/%'` queries — if Windows paths are stored with backslashes (`C:\Music\...`), these queries return 0 rows. Need to verify: does the scanner store forward-slash paths on Windows, or native backslash paths? | MEDIUM |
| `commands/library.rs` path normalization | `normalize_file_paths` command — does it run on Windows paths correctly? | MEDIUM |
| `scanner.rs` path output | Does `walkdir` return `PathBuf` that converts to backslash on Windows? If so, `to_string_lossy()` will produce `C:\Music\track.mp3` in DB. | MEDIUM |
| CSP in `tauri.conf.json` | `media-src 'self' stream: http:` — `http://stream.localhost` may need explicit entry for Windows WebView2. | LOW |

---

## Build Order — Suggested Sequence

Aubio C compilation is the highest-risk unknown. Validate it first before writing CI pipelines.

```
Step 1 — Validate Windows Rust Compilation (Highest Risk)
  Goal: cargo build --target x86_64-pc-windows-msvc succeeds
  Risk factors:
    - bliss-audio-aubio-rs with features=["builtin","bindgen"] requires:
      * MSVC C compiler (cl.exe, available on windows-latest)
      * libclang for bindgen (NOT included on windows-latest by default)
      * aubio C source compiling under MSVC or MinGW-w64
    - If this fails, the milestone is blocked and needs a different aubio build strategy
  How to test: Spin up a Windows VM or GitHub Actions workflow manually; run cargo build
  Output: Compiles -> proceed. Fails -> fix build environment or patch Cargo.toml first.

Step 2 — Fix find_mobile_dist() Windows Exe-Relative Path
  Goal: Mobile companion correctly locates bundled assets on Windows in production
  Risk: LOW — additive code change, easily testable
  Code: Add Windows sibling path check (exe.parent().join("mobile-dist")) in Fallback 3
  Output: find_mobile_dist() returns Some(path) on Windows production builds

Step 3 — Audit and Fix Path Storage Convention
  Goal: Confirm folder queries (LIKE 'prefix/%') work on Windows
  Risk: MEDIUM — backslash vs forward slash in stored paths
  Decision: Choose one convention (recommend: normalize to forward slashes on write in scanner)
             and apply consistently at DB insert time
  Output: Folder browsing, track counts, and path cleanup commands work on Windows

Step 4 — Add Windows Build Scripts to package.json
  Goal: Local Windows build workflow mirrors macOS
  Change: Add build:win and release:sign:win scripts
  Output: Developer can run npm run build:win on Windows

Step 5 — Rewrite generate-update-manifest.js for Multi-Platform
  Goal: Script supports --platform and --merge modes
  Risk: LOW — pure Node.js, no build dependencies
  Output: Can generate latest.json with both darwin-aarch64 and windows-x86_64 platforms

Step 6 — Add build-windows CI Job to release.yml
  Goal: Automated Windows builds on tag push
  Key CI steps:
    - KyleMayes/install-llvm-action (or equivalent) for libclang
    - dtolnay/rust-toolchain@stable with targets: x86_64-pc-windows-msvc
    - npm ci + tauri build --target x86_64-pc-windows-msvc
    - Sign .nsis.zip artifact (TAURI_SIGNING_PRIVATE_KEY secret, same as macOS)
    - Upload .exe, .nsis.zip, .nsis.zip.sig, and windows fragment JSON as artifacts
  Risk: MEDIUM — libclang setup on Windows runner is the main friction

Step 7 — Add create-release CI Job (depends on Steps 5 and 6)
  Goal: Single GitHub Release with all platform artifacts and merged latest.json
  Change: Add job to release.yml that runs after both platform jobs
  Steps: download-artifact (both), node generate-update-manifest.js --merge, gh-release
  Output: Tag push produces release with .dmg + .exe + latest.json covering both platforms
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2 platforms (macOS + Windows) | Current target — parallel CI jobs, single merged latest.json |
| 3 platforms (add Linux) | Add `build-linux` job with ubuntu-latest; add `linux-x86_64` block to manifest. `tauri.conf.json` `targets: "all"` already handles AppImage/deb. |
| Code-signed Windows builds | Add EV certificate secret; set `tauri.windows.certificateThumbprint`. Removes Windows Defender SmartScreen warning for end users. Not required for MVP. |
| Intel macOS (darwin-x86_64) | Add `targets` entry to macOS build job. Tauri supports universal (fat) binaries via `--target universal-apple-darwin`. Current CI only builds aarch64. |

---

## Anti-Patterns

### Anti-Pattern 1: Sequential Platform Builds in a Single CI Job

**What people do:** Run `tauri build` for macOS then for Windows sequentially in one job with conditional `if: runner.os == 'macOS'` steps.

**Why it's wrong:** Requires cross-compilation. Tauri v2 with aubio (C FFI + bindgen) does not cross-compile reliably. macOS cannot produce a Windows binary, and vice versa. Sequential also doubles wall-clock time.

**Do this instead:** Parallel jobs on native runners (`macos-latest` and `windows-latest`). A `create-release` job depending on both collects the artifacts.

### Anti-Pattern 2: Each Platform Writes and Uploads its Own latest.json

**What people do:** The macOS build writes `latest.json` with only `darwin-aarch64`. The Windows build writes `latest.json` with only `windows-x86_64`. Both upload to the same GitHub Release, one overwriting the other.

**Why it's wrong:** The Tauri updater fetches a single `latest.json`. Whichever platform finishes last overwrites the first. macOS users then get no update (windows-only manifest) or vice versa.

**Do this instead:** Each job uploads a platform *fragment* (partial JSON) as a build artifact. A final `create-release` job merges both fragments into one `latest.json` with both `platforms` entries before creating the release.

### Anti-Pattern 3: Storing Windows Paths with Backslashes and Querying with Forward Slashes

**What people do:** Scanner stores `C:\Music\track.mp3` in SQLite. Folder query does `WHERE file_path LIKE 'C:/Music/%'`. Rows return 0, folder view is empty.

**Why it's wrong:** Stored path separator does not match query separator. SQLite LIKE is case-sensitive by default and performs character-by-character matching.

**Do this instead:** Normalize all stored paths to forward slashes at write time (scanner output step). The stream protocol handler already normalizes in the opposite direction (forward slash to backslash for OS reads). This way: DB always has forward-slash paths; `stream://` handler converts them to OS-native for `std::fs::read`.

### Anti-Pattern 4: Assuming `BaseDirectory::Resource` Resolves at Runtime Like macOS on Windows

**What people do:** The Tauri Resource path resolver is used in production with an assumed macOS `.app/Resources/` layout. Windows NSIS installer places resources differently; the call returns `Err` or a non-existent path; mobile companion falls through to a broken fallback.

**Why it's wrong:** Tauri v2's `PathResolver` is platform-aware — it should return the correct path on both platforms when resources are declared in `tauri.conf.json`. The risk is in the legacy exe-relative fallback that runs when the resolver fails, which currently only handles macOS layout.

**Do this instead:** Fix the exe-relative fallback to handle both layouts (as shown in Pattern 4 above). Trust the Resource resolver as primary; fix the fallback as safety net.

---

## Integration Points — External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Releases (auto-updater source) | Single `latest.json` at `releases/latest/download/latest.json` | Must contain both `platforms.darwin-aarch64` and `platforms.windows-x86_64` for all users to receive updates. |
| Tauri minisign signing | Same private key (`TAURI_SIGNING_PRIVATE_KEY`) for all platforms | Both `.app.tar.gz` (macOS) and `.nsis.zip` (Windows) are signed with the same minisign key. No new secrets. |
| LLVM/libclang (Windows CI) | `KyleMayes/install-llvm-action@v2` in release.yml build-windows job | Required for `bindgen` feature of `bliss-audio-aubio-rs`. `LIBCLANG_PATH` env var must point to installed clang before `cargo build`. `windows-latest` runner does NOT include libclang by default. |

### Internal Boundaries

| Boundary | Communication | Consideration |
|----------|---------------|---------------|
| `scanner.rs` → `db/mod.rs` | PathBuf → String conversion at insert time | Normalization contract: forward slash vs OS-native. Must be decided and enforced here before Windows launch. |
| `lib.rs` stream handler → filesystem | `std::fs::read(path)` after normalization | Windows `#[cfg]` already handles. Validate with real Windows paths. |
| `commands/server.rs` → filesystem (mobile PWA) | `PathBuf` from `find_mobile_dist()` | Fix Fallback 3. Tauri Resource resolver (Fallback 1) handles production correctly on both platforms when `tauri.conf.json` resources are declared — and they are (`"../mobile/dist/": "mobile-dist/"`). |
| `release.yml` build-windows → create-release | GitHub Actions `upload-artifact` / `download-artifact` v4 | Fragment JSON files and installer binaries pass between jobs. Use `actions/upload-artifact@v4` with `name` scoped to platform. |

---

## Sources

- `src-tauri/src/lib.rs` — Windows `#[cfg]` branches confirmed at lines 99-145, 242-251, 283-313. Direct read. HIGH confidence.
- `src/lib/audioPlayer.ts` — `isWindows` UA detection and `http://stream.localhost/` URL generation confirmed at lines 616-639. Direct read. HIGH confidence.
- `src-tauri/src/commands/server.rs` — `find_mobile_dist()` Fallback 3 macOS-only exe path confirmed at lines 101-114. Direct read. HIGH confidence.
- `.github/workflows/release.yml` — Single job, macos-latest, aarch64-apple-darwin, no Windows job confirmed. Direct read. HIGH confidence.
- `scripts/generate-update-manifest.js` — Single-platform darwin block, macOS tarball path hardcoded. Direct read. HIGH confidence.
- `src-tauri/Cargo.toml` — `bliss-audio-aubio-rs = { features = ["builtin","bindgen"] }` confirmed line 39. bindgen requires libclang. HIGH confidence.
- `tauri.conf.json` — `bundle.targets: "all"`, `resources` section includes mobile-dist, `icon.ico` referenced. HIGH confidence.
- [SQLite LIKE behavior](https://www.sqlite.org/lang_expr.html) — backslash is not a special character in standard SQLite LIKE; slash mismatch is a logical bug not an escaping issue. HIGH confidence.
- [Tauri v2 Windows protocol mapping](https://v2.tauri.app/reference/config/) — custom protocols map to `http://scheme.localhost/` on Windows (WebView2 does not support custom schemes natively). MEDIUM confidence (verify against current docs during implementation).
- [bliss-audio-aubio-rs bindgen Windows](https://github.com/nolanlawson/bliss-audio) — Windows C compilation of aubio via bindgen requires LIBCLANG_PATH; known friction point in the Rust audio ecosystem. MEDIUM confidence (community-sourced; validate by actually building).

---

*Architecture research for: RecoDeck v1.5 — Windows Platform Support*
*Researched: 2026-03-14*
