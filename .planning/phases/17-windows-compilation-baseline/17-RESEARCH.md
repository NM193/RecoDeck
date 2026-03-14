# Phase 17: Windows Compilation Baseline - Research

**Researched:** 2026-03-14
**Domain:** Rust/Tauri 2 Windows cross-compilation — MSVC toolchain, Aubio bindgen/LLVM, WebView2 audio, npm build scripts
**Confidence:** MEDIUM (core Tauri/Rust toolchain HIGH; Aubio MSVC bindgen LOW — empirically unvalidated for this exact crate+target combination)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All existing macOS code remains UNTOUCHED — no modifications to working code
- Windows support is purely additive: new cfg blocks, new scripts, new docs
- If platform-specific behavior is needed, use `#[cfg(target_os = "windows")]` alongside existing `#[cfg(not(target_os = "windows"))]` blocks
- User has a physical Windows PC with nothing installed yet
- Create a step-by-step `WINDOWS-SETUP.md` guide covering: Rust, Node, LLVM, VS Build Tools, and build verification
- `build:win` is a simple npm script (tauri build wrapper), not a PowerShell script with checks
- Full dev mode (`tauri dev` with hot-reload) must work on Windows — same developer experience as macOS
- Same editor (VS Code / Cursor) on both platforms
- Primary approach: compile Aubio with `builtin` + `bindgen` features on MSVC using LLVM/libclang
- Fallback 1: Try vcpkg or pre-built Aubio libraries for Windows
- Fallback 2 (last resort): Strip Aubio on Windows via feature flag — ship without BPM/key detection rather than block the release
- Manual testing on the physical Windows PC — build, run, scan a folder, play a track
- Review all existing `#[cfg(target_os = "windows")]` blocks in lib.rs, scanner.rs, db/mod.rs BEFORE the first build attempt

### Claude's Discretion
- LLVM version choice for Windows (17 vs 18 vs latest)
- Exact VS Build Tools components to install
- Whether to use rustup target add or rely on default MSVC toolchain
- build.rs modifications needed for Windows Aubio compilation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILD-01 | App compiles on Windows with `x86_64-pc-windows-msvc` target including Aubio bindgen | LLVM/libclang setup, `LIBCLANG_PATH` env var, `bliss-audio-aubio-rs` `builtin`+`bindgen` features, `rustup` MSVC toolchain |
| BILD-02 | `build:win` npm script produces a working Windows build | `tauri build --target x86_64-pc-windows-msvc`, single npm script addition to `package.json` |
</phase_requirements>

---

## Summary

Phase 17 is about making RecoDeck compile and run on Windows for the first time. The codebase already has substantial Windows-awareness baked in: `#[cfg(target_os = "windows")]` blocks in `lib.rs`, `scanner.rs`, and `db/mod.rs` handle stream URL protocol differences, path normalization (backslash conversion, UNC prefix), and the `main.rs` already sets `windows_subsystem = "windows"` for release builds. The Tauri 2 setup for Windows is well-documented and the Rust MSVC toolchain path is straightforward.

The primary risk is `bliss-audio-aubio-rs` with `builtin` + `bindgen` features on MSVC. This crate compiles Aubio C from source via a `cc`/`cmake` build script and uses `bindgen` to generate FFI bindings — both of which require LLVM's `libclang.dll` to be present and on `LIBCLANG_PATH`. The bliss-rs upstream explicitly supports only `x86_64-pc-windows-gnu` (MinGW), not MSVC. Aubio itself has documented MSVC compilation issues (missing `stdlib.h` detection, static/shared library collisions). This is the highest-risk item and must be attempted first on the physical Windows machine before finalizing scope.

The audio playback path via `http://stream.localhost` (already handled in TypeScript and Rust) should work with WebView2, but autoplay policy is a documented Tauri/WebView2 issue on Windows. The fix (adding `--autoplay-policy=no-user-gesture-required` via `additionalBrowserArgs` in `tauri.conf.json`) is available and well-understood.

**Primary recommendation:** Install toolchain in order: VS Build Tools 2022 → Rust (MSVC default) → LLVM 18 (winget) → Node 20 LTS. Set `LIBCLANG_PATH` system-wide. Attempt `cargo build` immediately to validate Aubio before any other work.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Rust stable MSVC toolchain | latest stable | Native Windows binary compilation | Official Tauri 2 requirement; `x86_64-pc-windows-msvc` is the default Windows target |
| LLVM | 18.x (latest stable) | Provides `libclang.dll` for `bindgen` | `bindgen` requires Clang 9.0+; LLVM 18 is current, available via `winget install -e --id LLVM.LLVM` |
| Visual Studio Build Tools 2022 | latest | MSVC linker, Windows SDK, C++ stdlib headers | Required by Rust MSVC toolchain and Aubio C compilation |
| Node.js | 20 LTS | npm scripts, frontend build | Same version as macOS dev environment |
| WebView2 | (pre-installed Win10 1803+) | Webview renderer in Tauri on Windows | Pre-installed on target Windows 10/11; no action needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bliss-audio-aubio-rs` | 0.2 (existing) | Aubio BPM/key detection FFI | Already in Cargo.toml with `builtin`+`bindgen` features; works or falls back |
| `bliss-audio-aubio-sys` | 0.2.x (transitive) | C bindings layer; uses `cc ^1.0.67`, optional `bindgen ^0.64` | Build dependency, no direct action needed |
| VS Build Tools "Desktop development with C++" workload | — | MSVC compiler, Windows 10/11 SDK | Required for Rust MSVC and Aubio C compilation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `x86_64-pc-windows-msvc` | `x86_64-pc-windows-gnu` (MinGW) | MinGW is what bliss-rs upstream documents for Windows, but Tauri 2 officially requires MSVC. Do not use MinGW. |
| LLVM via winget | VS Build Tools bundled clang | VS Build Tools clang lives at a system path that `clang-sys` cannot auto-discover; standalone LLVM + `LIBCLANG_PATH` is more reliable |
| Full Aubio via bindgen | Feature-flag Aubio out on Windows | Only fall back to no-Aubio if bindgen approach fails after genuine effort |

**Installation (on Windows, PowerShell):**
```powershell
# 1. VS Build Tools (select "Desktop development with C++" workload)
winget install --id Microsoft.VisualStudio.2022.BuildTools

# 2. Rust (MSVC toolchain is the default on Windows)
winget install --id Rustlang.Rustup
# After install, in a new shell:
rustup default stable-msvc
rustup target add x86_64-pc-windows-msvc  # usually already default

# 3. LLVM (provides libclang.dll for bindgen)
winget install -e --id LLVM.LLVM
# Set LIBCLANG_PATH permanently (System Properties > Environment Variables):
[System.Environment]::SetEnvironmentVariable("LIBCLANG_PATH","C:\Program Files\LLVM\bin","Machine")

# 4. Node.js LTS
winget install --id OpenJS.NodeJS.LTS

# 5. Verify
cargo --version
node --version
clang --version
```

---

## Architecture Patterns

### Recommended Project Structure (no changes needed)
The existing source layout is correct. All Windows-specific additions are cfg-gated:

```
src-tauri/
├── src/
│   ├── lib.rs          # Already has #[cfg(target_os = "windows")] stream URL blocks
│   ├── scanner.rs      # Already has #[cfg(target_os = "windows")] path normalization
│   ├── main.rs         # Already has windows_subsystem cfg_attr
│   └── db/mod.rs       # Has #[cfg(not(target_os = "windows"))] block needing Windows counterpart review
├── build.rs            # May need LLVM/libclang path hints for Windows
├── Cargo.toml          # bliss-audio-aubio-rs already has builtin+bindgen features
└── tauri.conf.json     # Needs additionalBrowserArgs for Windows autoplay
```

### Pattern 1: LIBCLANG_PATH for Aubio bindgen on MSVC
**What:** `bliss-audio-aubio-sys` uses `bindgen ^0.64` which calls into `libclang`. On Windows with MSVC, `libclang.dll` is not on `PATH` by default — only standalone LLVM installs provide it in a discoverable location.
**When to use:** Always, on first build attempt on Windows.
**Example:**
```powershell
# PowerShell — set for current session only (test first)
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"

# Then attempt build
cargo build --target x86_64-pc-windows-msvc
```

```rust
// build.rs — optionally hint the LLVM path for CI/reproducibility
// (Only add if cargo build fails to find libclang automatically)
fn main() {
    // On Windows, help bindgen find libclang if LIBCLANG_PATH is not set
    #[cfg(target_os = "windows")]
    {
        if std::env::var("LIBCLANG_PATH").is_err() {
            // Fallback: try the default LLVM install path
            let default = r"C:\Program Files\LLVM\bin";
            if std::path::Path::new(default).exists() {
                println!("cargo:rustc-env=LIBCLANG_PATH={}", default);
            }
        }
    }
    tauri_build::build()
}
```

### Pattern 2: additionalBrowserArgs for WebView2 Autoplay
**What:** WebView2 on Windows blocks audio autoplay without prior user interaction by default. Tauri 2 exposes `additionalBrowserArgs` in `WindowConfig` to pass Chromium flags. This is Windows-only.
**When to use:** If audio fails to play in WebView2 DevTools console shows autoplay policy block.
**Example:**
```json
// tauri.conf.json — add additionalBrowserArgs under app.windows[0]
{
  "app": {
    "windows": [
      {
        "title": "recodeck",
        "width": 800,
        "height": 600,
        "additionalBrowserArgs": "--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
      }
    ]
  }
}
```
Note: Tauri/wry documentation says that by default wry passes `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`. When providing `additionalBrowserArgs`, you must re-include those flags or WebView2 behavior changes. Source: [Tauri WindowConfig docs](https://v2.tauri.app/reference/config/).

### Pattern 3: CSP for http://stream.localhost
**What:** On Windows, the stream protocol is `http://stream.localhost` (not `stream://localhost`). The existing `tauri.conf.json` CSP already includes `media-src 'self' stream: http: https: blob:` which covers `http:`. This should work. Verify in WebView2 DevTools if audio 404s.
**When to use:** Validation step after audio fails to play.
**Current CSP:**
```json
"csp": "default-src 'self'; img-src 'self' blob: asset: https://asset.localhost/; media-src 'self' stream: http: https: blob:"
```
The `http:` in `media-src` already permits `http://stream.localhost`. No CSP change needed — but confirm in DevTools.

### Pattern 4: npm build:win script
**What:** The user wants `npm run build:win` to produce a complete Windows build from one command.
**When to use:** When on Windows, analogous to existing `build:mac` script.
**Example:**
```json
// package.json — add alongside build:mac
{
  "scripts": {
    "build:win": "npm run version:sync && tauri build --target x86_64-pc-windows-msvc"
  }
}
```
Note: Do not add `--debug` flag — this should produce a release build analogous to `build:mac`.

### Pattern 5: db/mod.rs Windows counterpart review
**What:** `db/mod.rs:1121` has `#[cfg(not(target_os = "windows"))]` block that ensures absolute Unix paths. The Windows path starts with a drive letter (`C:/...`) not `/`, so the "ensure starts with /" logic must NOT run on Windows. The existing `#[cfg(not(target_os = "windows"))]` guard already prevents this — verify no corresponding Windows block is needed.
**When to use:** Code audit before first build.

### Anti-Patterns to Avoid
- **Installing MinGW/gnu toolchain:** bliss-rs upstream uses `x86_64-pc-windows-gnu` but Tauri 2 requires MSVC. Mixing toolchains causes link failures.
- **Using VS Build Tools bundled clang as LIBCLANG_PATH:** The clang from VS Build Tools (`C:\Program Files (x86)\Microsoft Visual Studio\...\VC\Tools\Llvm\x64\bin`) may not have `libclang.dll`. Use standalone LLVM instead.
- **Architecture mismatch:** 32-bit LLVM with 64-bit Rust causes error 193. Always install 64-bit LLVM.
- **Touching macOS code paths:** All Windows additions must be in `#[cfg(target_os = "windows")]` blocks or new files. Never modify existing `#[cfg(not(target_os = "windows"))]` logic.
- **Skipping the build:win version sync:** The `build:mac` script runs `npm run version:sync` first. `build:win` should do the same for consistency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| libclang discovery on Windows | Custom DLL scanner in build.rs | `LIBCLANG_PATH` env var + standalone LLVM install | `clang-sys` (used by bindgen) already implements search logic respecting `LIBCLANG_PATH`; custom discovery would duplicate it |
| WebView2 autoplay | JavaScript workarounds to simulate user interaction | `additionalBrowserArgs` in tauri.conf.json | Chromium flag is the correct, supported approach |
| Aubio Windows FFI bindings | Manual bindings | `bliss-audio-aubio-rs` `bindgen` feature | The `bindgen` feature generates bindings at compile time from the actual C headers; manual bindings would drift |
| Windows path normalization | New normalization logic | Existing `#[cfg(target_os = "windows")]` blocks already in lib.rs/scanner.rs | These blocks are already correct and tested |

**Key insight:** The Windows-specific code already exists in the codebase. This phase is primarily a build environment configuration exercise, not a code-writing exercise.

---

## Common Pitfalls

### Pitfall 1: libclang not found at compile time
**What goes wrong:** `cargo build` fails with "couldn't find any valid shared libraries matching: ['clang.dll', 'libclang.dll']" or "the `libclang' shared library cannot be opened".
**Why it happens:** `bindgen` (used by `bliss-audio-aubio-sys`) calls `clang-sys` which searches standard locations for `libclang.dll`. On Windows, LLVM is not guaranteed to be on PATH or in a standard location.
**How to avoid:** Set `LIBCLANG_PATH=C:\Program Files\LLVM\bin` as a permanent system environment variable BEFORE running any cargo command.
**Warning signs:** Build fails during `bliss-audio-aubio-sys` compilation specifically; error mentions libclang or clang.dll.

### Pitfall 2: aubio C compilation fails on MSVC (stdlib.h not found)
**What goes wrong:** `bliss-audio-aubio-sys`'s `builtin` feature attempts to compile Aubio C source using the `cc` crate, which calls MSVC. Build fails with "fatal error C1083: Cannot open include file: 'stdlib.h'" or "checking for header stdlib.h: not found".
**Why it happens:** The Aubio waf build script (used in older approaches) has MSVC recognition issues. The `cc` crate approach in `bliss-audio-aubio-sys` may also fail if VS Build Tools headers are not on the include path.
**How to avoid:** Ensure VS Build Tools "Desktop development with C++" workload is installed, not just the C++ compiler. The Windows SDK provides the necessary headers.
**Warning signs:** Error in `bliss-audio-aubio-sys` build step, mentioning missing standard C headers.

### Pitfall 3: Wrong LLVM architecture (32-bit vs 64-bit mismatch)
**What goes wrong:** `cargo build` fails with "error 193: %1 is not a valid Win32 application" when trying to load libclang.dll.
**Why it happens:** LLVM was installed as 32-bit but the Rust target is 64-bit.
**How to avoid:** Use `winget install -e --id LLVM.LLVM` which installs the 64-bit version. Verify with `clang --version` in PowerShell.
**Warning signs:** Error 193 specifically; or clang --version works but cargo build cannot load the DLL.

### Pitfall 4: WebView2 autoplay block on first track play
**What goes wrong:** Clicking a track does nothing, or DevTools console shows "NotAllowedError: The play() request was interrupted because the user didn't interact with the document first."
**Why it happens:** WebView2 enforces Chromium's autoplay policy. `audioPlayer.ts` calls `.play()` immediately when a track is loaded.
**How to avoid:** Add `--autoplay-policy=no-user-gesture-required` to `additionalBrowserArgs` in `tauri.conf.json`. This must include the default disabled features too.
**Warning signs:** Track is selected, waveform loads, but no audio plays; DevTools shows autoplay error.

### Pitfall 5: Stream URL format confusion
**What goes wrong:** Audio 404s or fails silently; `audioPlayer.ts` sends wrong URL format.
**Why it happens:** The stream protocol is `stream://localhost` on macOS and `http://stream.localhost` on Windows. `audioPlayer.ts` already handles this with a platform check, but only at runtime inside Tauri (not in a browser during development).
**How to avoid:** Test with a release build (or `tauri dev`), not a plain browser. The existing `audioPlayer.ts` detection uses `window.__TAURI_INTERNALS__` to detect platform.
**Warning signs:** 404 responses in DevTools Network tab for audio requests.

### Pitfall 6: VS Build Tools "C++ Build Tools" alone is insufficient
**What goes wrong:** Rust compiles but Aubio C compilation fails because the Windows SDK headers are missing.
**Why it happens:** "C++ Build Tools" core components do not include the Windows 10/11 SDK by default; the "Desktop development with C++" workload is needed.
**How to avoid:** In VS Build Tools installer, select the full "Desktop development with C++" workload, not individual components.
**Warning signs:** stddef.h, windows.h, or other Windows system headers not found during Aubio C compilation.

### Pitfall 7: bliss-rs not officially supporting MSVC
**What goes wrong:** The `bliss-audio-aubio-rs` compilation fails in a way that cannot be fixed without upstream changes.
**Why it happens:** bliss-rs upstream documents only `x86_64-pc-windows-gnu` (MinGW). The `builtin`+`bindgen` combo on MSVC is not tested by upstream CI.
**How to avoid:** If MSVC compilation of Aubio fails after genuine attempts, fall back to the feature-flag approach: add a `[features]` section to `Cargo.toml` that conditionally includes `bliss-audio-aubio-rs` only on non-Windows. BPM/key analysis would be disabled but the app would compile and run.
**Warning signs:** Linker errors specifically from the Aubio C compilation step that cannot be resolved with environment variables.

---

## Code Examples

Verified patterns from official sources:

### package.json — add build:win script
```json
// Source: tauri build --target flag (https://v2.tauri.app/reference/cli/)
{
  "scripts": {
    "build:win": "npm run version:sync && tauri build --target x86_64-pc-windows-msvc"
  }
}
```

### tauri.conf.json — Windows additionalBrowserArgs for autoplay
```json
// Source: https://v2.tauri.app/reference/config/#windowconfig
// Note: Must include default wry-disabled features when overriding additionalBrowserArgs
{
  "app": {
    "windows": [
      {
        "title": "recodeck",
        "width": 800,
        "height": 600,
        "additionalBrowserArgs": "--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
      }
    ]
  }
}
```

### PowerShell — permanent LIBCLANG_PATH setup
```powershell
# Source: https://rust-lang.github.io/rust-bindgen/requirements.html
# Run as Administrator
[System.Environment]::SetEnvironmentVariable(
    "LIBCLANG_PATH",
    "C:\Program Files\LLVM\bin",
    "Machine"
)
# Restart PowerShell after this
```

### Cargo.toml — feature flag fallback (only if MSVC Aubio fails)
```toml
# Source: Cargo features documentation
# Add only as last resort — primary goal is full Aubio on Windows

[features]
default = ["audio_analysis"]
audio_analysis = ["bliss-audio-aubio-rs"]

[dependencies]
# Change bliss-audio-aubio-rs to optional:
bliss-audio-aubio-rs = { version = "0.2", features = ["builtin", "bindgen"], optional = true }
```

Then guard usage in analysis.rs:
```rust
// Only if feature flag fallback is activated
#[cfg(feature = "audio_analysis")]
use bliss_audio_aubio_rs::{OnsetMode, Tempo};
```

### Existing Windows cfg blocks (already correct — reference only)
```rust
// Source: src-tauri/src/scanner.rs:161 — already in codebase
#[cfg(target_os = "windows")]
{
    s = s.replace('\\', "/");
}

// Source: src-tauri/src/lib.rs:99 — already in codebase
#[cfg(target_os = "windows")]
{
    s = s.replace('\\', "/");
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `x86_64-pc-windows-gnu` (MinGW) for Windows Rust | `x86_64-pc-windows-msvc` as standard | Tauri 2 official requirement | MSVC produces better Windows-native binaries and is required by Tauri 2 |
| Manual libclang installation from LLVM download page | `winget install -e --id LLVM.LLVM` | ~2023 | Automated, version-managed installation |
| WebView2 fixed version | WebView2 evergreen (auto-updates) | Tauri 2 | Already on modern Windows 10/11; no explicit install needed |

**Deprecated/outdated:**
- MinGW/gnu target for Tauri Windows builds: Not supported by Tauri 2; MSVC is required.
- Manual LLVM binary download from releases.llvm.org: winget package is preferred.

---

## Open Questions

1. **Will `bliss-audio-aubio-rs` `builtin`+`bindgen` compile successfully on MSVC?**
   - What we know: upstream bliss-rs explicitly supports only `x86_64-pc-windows-gnu`; aubio C has documented MSVC build issues
   - What's unclear: whether the `cc` crate path (used by `bliss-audio-aubio-sys`) bypasses the waf/cmake issues that plagued direct aubio builds
   - Recommendation: Attempt the build first. If it fails after setting `LIBCLANG_PATH` and VS Build Tools, escalate to vcpkg fallback, then feature-flag fallback.

2. **Does the db/mod.rs `#[cfg(not(target_os = "windows"))]` block at line 1121 need a Windows counterpart?**
   - What we know: That block adds a leading `/` to ensure Unix absolute paths. Windows paths start with `C:/` which is already absolute.
   - What's unclear: Whether any code path could produce a relative path on Windows that needs fixing.
   - Recommendation: Review the block, confirm the Windows path (from `to_string_lossy()` on a `PathBuf`) starts with a drive letter, and document that no Windows counterpart is needed.

3. **Does the Windows `additionalBrowserArgs` interact with the existing CSP for `http://stream.localhost`?**
   - What we know: `additionalBrowserArgs` passes Chromium flags; CSP is a separate header injection by Tauri
   - What's unclear: Whether any Chromium flag could block the `http://stream.localhost` custom protocol handler
   - Recommendation: Test audio playback after adding `additionalBrowserArgs`. If audio still fails, check DevTools Network tab and CSP console errors separately.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled. However, this phase is validated entirely by manual testing on a physical Windows PC. There are no automated tests to define.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual only — no automated test infrastructure applies |
| Config file | N/A |
| Quick run command | Manual: launch app, scan folder, click track |
| Full suite command | Manual: complete success criteria checklist |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILD-01 | `cargo build --target x86_64-pc-windows-msvc` completes without errors | manual | `cargo build --target x86_64-pc-windows-msvc` (run on Windows PC, pass/fail by exit code) | N/A — run on Windows |
| BILD-02 | `npm run build:win` produces a working binary | manual | `npm run build:win` (run on Windows PC) | N/A — run on Windows |

### Sampling Rate
- **Per task commit:** Not applicable — no automated tests exist
- **Per wave merge:** Manual verification checklist on Windows PC
- **Phase gate:** All 4 success criteria must be TRUE before `/gsd:verify-work`

### Wave 0 Gaps
None — this phase creates no new automated test infrastructure. The validation is purely manual on the target Windows machine.

---

## WINDOWS-SETUP.md Outline

The planner should create this document as a task output. Contents:

```markdown
# RecoDeck Windows Setup Guide

## Step 1: Install Visual Studio Build Tools 2022
winget install --id Microsoft.VisualStudio.2022.BuildTools
# Select: "Desktop development with C++" workload (includes MSVC compiler + Windows SDK)

## Step 2: Install Rust (MSVC toolchain)
winget install --id Rustlang.Rustup
# Open new PowerShell:
rustup default stable-msvc

## Step 3: Install LLVM (for Aubio bindgen)
winget install -e --id LLVM.LLVM
# Set LIBCLANG_PATH (run as Administrator, then restart PowerShell):
[System.Environment]::SetEnvironmentVariable("LIBCLANG_PATH","C:\Program Files\LLVM\bin","Machine")

## Step 4: Install Node.js LTS
winget install --id OpenJS.NodeJS.LTS

## Step 5: Verify
rustc --version        # expect: rustc 1.xx.x
cargo --version        # expect: cargo 1.xx.x
node --version         # expect: v20.x.x
clang --version        # expect: clang version 18.x.x
echo $env:LIBCLANG_PATH # expect: C:\Program Files\LLVM\bin

## Step 6: Clone repo and build
git clone <repo-url>
cd RecoDeck
npm install
npm run build:win

## Step 7: Verify the binary
# Binary at: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
# Launch recodeck_x.x.x_x64-setup.exe and test
```

---

## Sources

### Primary (HIGH confidence)
- [Tauri 2 Prerequisites](https://v2.tauri.app/start/prerequisites/) — Windows toolchain requirements (VS Build Tools, Rust MSVC, WebView2)
- [Tauri 2 WindowConfig reference](https://v2.tauri.app/reference/config/) — `additionalBrowserArgs` documentation
- [Tauri 2 Windows Installer](https://v2.tauri.app/distribute/windows-installer/) — Bundle configuration, NSIS
- [bindgen Requirements](https://rust-lang.github.io/rust-bindgen/requirements.html) — `LIBCLANG_PATH` setup, LLVM version requirements (Clang 9.0+)
- Project source files: `lib.rs`, `scanner.rs`, `db/mod.rs`, `main.rs`, `Cargo.toml`, `tauri.conf.json` — existing Windows cfg blocks confirmed

### Secondary (MEDIUM confidence)
- [Tauri issue #9968 — Audio autoplay not working on Windows](https://github.com/tauri-apps/tauri/issues/9968) — autoplay fix confirmed merged in wry via additionalBrowserArgs
- [clang-sys documentation](https://github.com/KyleMayes/clang-sys) — LIBCLANG_PATH resolution behavior
- [winget LLVM package](https://winget.run/pkg/LLVM/LLVM) — confirmed LLVM.LLVM ID, versions 17 and 18 available
- [bliss-audio-aubio-sys docs.rs](https://docs.rs/bliss-audio-aubio-sys/latest/bliss_audio_aubio_sys/) — build dependencies: `cc ^1.0.67`, optional `bindgen ^0.64`

### Tertiary (LOW confidence — flag for validation)
- [bliss-rs README](https://github.com/Polochon-street/bliss-rs) — documents only `x86_64-pc-windows-gnu` support; MSVC not mentioned (LOW: implies MSVC may not be tested upstream)
- [aubio Windows build issues #285](https://github.com/aubio/aubio/issues/285) — aubio C compilation on Windows has had stdlib.h detection issues; resolved in some versions (LOW: may not apply to `cc`-based build in aubio-sys)

---

## Metadata

**Confidence breakdown:**
- Standard stack (Tauri + Rust MSVC + Node): HIGH — official documentation, well-established
- LLVM/libclang setup for bindgen: HIGH — bindgen docs are authoritative
- Aubio MSVC compilation success: LOW — empirically unvalidated; upstream supports only MinGW
- WebView2 autoplay fix: MEDIUM — confirmed merged in wry, but exact wry version in current Tauri 2 release matters
- CSP for http://stream.localhost: HIGH — existing CSP already includes `http:` in `media-src`
- db/mod.rs Windows path review: HIGH — code is visible and logic is clear

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (Tauri/wry stable; Aubio MSVC risk remains until empirically tested)
