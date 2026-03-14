# Stack Research

**Domain:** Windows platform support for Tauri 2 desktop music player (RecoDeck v1.5)
**Researched:** 2026-03-14
**Scope:** NEW stack additions and changes ONLY for Windows support. Existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, bliss-audio-aubio-rs, Symphonia, Axum) is validated and NOT re-researched.
**Confidence:** HIGH

---

## Executive Summary

Windows support requires no new npm dependencies and no new Rust crates beyond what already ships in `Cargo.toml`. The work is entirely toolchain setup, CI environment configuration, `tauri.conf.json` additions, and a `latest.json` update manifest file.

The single most important Windows-specific constraint: **`bliss-audio-aubio-rs` with `features = ["builtin", "bindgen"]` requires LLVM/libclang to be present during compilation.** On macOS this is satisfied automatically. On Windows it requires explicit environment variable setup (`LIBCLANG_PATH`) pointing to an LLVM installation. This is the primary Windows CI blocker.

The `ort` crate (ONNX Runtime) already uses `download-binaries` (the default feature), which auto-downloads prebuilt ONNX Runtime binaries from Microsoft's CDN at build time. No extra setup is needed for `ort` on Windows beyond what macOS already does — confirmed by ort's cargo feature documentation.

The `stream://` custom protocol is already Windows-aware in the codebase: `lib.rs` has `#[cfg(target_os = "windows")]` guards for backslash-to-slash conversion and UNC path handling, and the memory notes confirm Windows uses `http://stream.localhost/?p=...` format (WebView2 maps `http://[name].localhost` to custom protocol handlers).

---

## Recommended Stack

### Core Technologies (Windows-Specific Additions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| LLVM / Clang | 17.x or 18.x | Provides `libclang.dll` for `bindgen` during Rust compilation | `bliss-audio-aubio-rs` uses `bindgen` feature to generate FFI bindings for the aubio C library. Bindgen requires libclang >= 9.0. LLVM 17+ is widely available, well-tested with bindgen on Windows MSVC, and installable via `winget install LLVM.LLVM`. HIGH confidence — bindgen official docs confirm requirement. |
| MSVC Build Tools (Desktop C++ workload) | Visual Studio 2022 Build Tools | C compiler and linker for MSVC Rust toolchain | Tauri v2 officially supports ONLY the MSVC Rust target (`x86_64-pc-windows-msvc`). GNU/MinGW targets are not supported. The "Desktop development with C++" workload in VS2022 Build Tools installs MSVC compiler, Windows SDK, and linker. HIGH confidence — Tauri v2 official prerequisites docs. |
| Rust MSVC toolchain | stable (latest) | Default Rust host triple must be MSVC | Must be set with `rustup default stable-msvc` or by selecting MSVC during rustup install. The GNU toolchain will fail Tauri builds. HIGH confidence — Tauri v2 official docs. |
| WebView2 Runtime | Evergreen (auto-installed on Win10 1803+) | Browser engine for Tauri's webview on Windows | WebView2 ships pre-installed on Windows 10 (v1803+) and Windows 11. Not a developer prerequisite — the NSIS installer handles the bootstrapper for older systems. HIGH confidence — Tauri v2 official docs. |
| NSIS (Nullsoft Scriptable Install System) | Bundled by Tauri CLI | Windows installer packager | Tauri bundles NSIS internally — it is downloaded automatically by `tauri build` when targeting Windows. No manual NSIS install required. The developer configures NSIS options via `tauri.conf.json`. HIGH confidence — Tauri v2 Windows installer docs. |

### GitHub Actions CI Tooling

| Tool | Version | Purpose | Why Recommended |
|------|---------|---------|-----------------|
| `KyleMayes/install-llvm-action@v2` | v2 (latest stable) | Installs LLVM on the `windows-latest` GitHub Actions runner and sets `LLVM_PATH` env var | The `windows-latest` runner (Windows Server 2022) does NOT include LLVM in PATH by default. This action installs a specific LLVM version and exposes `${{ env.LLVM_PATH }}`, from which `LIBCLANG_PATH` can be derived. Widely used solution confirmed by bindgen GitHub issues. MEDIUM confidence — community solution, not official Tauri docs. |
| `tauri-apps/tauri-action@v0` | v0 (tracks latest v2-compatible) | Orchestrates Tauri build and GitHub Release artifact upload for multi-platform matrix | Official Tauri-maintained action. Handles per-platform `--target` args, signs artifacts using `TAURI_SIGNING_PRIVATE_KEY`, and uploads binaries to GitHub Releases. HIGH confidence — official Tauri tooling. |
| `dtolnay/rust-toolchain@stable` | stable | Installs Rust on CI runners | Standard Rust CI toolchain action. Pairs with `swatinem/rust-cache@v2` for build caching. HIGH confidence — universal Rust CI practice. |
| `swatinem/rust-cache@v2` | v2 | Caches `~/.cargo` and `target/` across CI runs | Windows Rust builds are slow (5-10 min cold). Cache reduces warm builds to ~2-3 min. HIGH confidence — standard practice. |

### Supporting Libraries (No New Additions Needed)

| Library | Status | Notes |
|---------|--------|-------|
| `bliss-audio-aubio-rs` (existing, `builtin` + `bindgen`) | Requires LLVM on Windows | The `builtin` feature compiles aubio from source (no system aubio needed). The `bindgen` feature generates FFI bindings via libclang. Both work on Windows once `LIBCLANG_PATH` is set. |
| `ort = "2.0.0-rc.11"` (existing) | Works on Windows out of box | Default `download-binaries` feature auto-downloads prebuilt ONNX Runtime `.dll` from Microsoft's CDN during `cargo build`. No `ORT_DYLIB_PATH` or static linking setup needed. The downloaded DLL must be bundled with the installer — Tauri's `externalBin` or `resources` config handles this. |
| `rusqlite` with `bundled` (existing) | Works on Windows | `bundled` feature compiles SQLite from source — no system SQLite needed. No Windows-specific changes. |
| `symphonia` (existing) | Works on Windows | Pure Rust, no C FFI, no LLVM required. No Windows-specific changes. |

---

## tauri.conf.json Changes Required

The existing `tauri.conf.json` needs a `windows` section added under `bundle` for NSIS configuration:

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": "v1Compatible",
    "icon": [...],
    "resources": {
      "../mobile/dist/": "mobile-dist/"
    },
    "windows": {
      "nsis": {
        "installMode": "perUser",
        "languages": ["English"],
        "compression": "lzma",
        "minimumWebview2Version": "110.0.1531.0"
      }
    }
  }
}
```

Key decisions:
- `installMode: "perUser"` — installs to `%APPDATA%` without requiring admin elevation. Correct for a personal-use app targeting DJ friends.
- `compression: "lzma"` — best compression ratio, 10-20 MB/s decompression. Default but explicit is better.
- `minimumWebview2Version` — ensures WebView2 is modern enough. Any version from mid-2022 supports the features used.
- No `template` override — Tauri's default NSIS template is sufficient for this scope.

The existing `"targets": "all"` already includes NSIS and MSI — no change needed there.

The existing CSP in `app.security.csp` needs a Windows-specific check:

```
"media-src 'self' stream: http: https: blob:"
```

This already includes `http:` which covers `http://stream.localhost/` on Windows WebView2. No change needed.

---

## Auto-Updater `latest.json` Multi-Platform Format

The `createUpdaterArtifacts: "v1Compatible"` setting (already in `tauri.conf.json`) means the build produces `.nsis.zip` and `.msi.zip` archives (not raw `.exe`/`.msi`) with accompanying `.sig` files. This is the v1-compatible format required while users may still be on v1.

The `latest.json` file (hosted at the GitHub Releases URL already configured in `tauri.conf.json`) must be extended from macOS-only to include Windows:

```json
{
  "version": "1.5.0",
  "notes": "Windows support — NSIS installer, CI/CD builds, auto-updater",
  "pub_date": "2026-03-14T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<content of .app.tar.gz.sig file>",
      "url": "https://github.com/NM193/RecoDeck/releases/download/v1.5.0/recodeck_1.5.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<content of .app.tar.gz.sig file>",
      "url": "https://github.com/NM193/RecoDeck/releases/download/v1.5.0/recodeck_1.5.0_x64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<content of .nsis.zip.sig file>",
      "url": "https://github.com/NM193/RecoDeck/releases/download/v1.5.0/recodeck_1.5.0_x64-setup.nsis.zip"
    }
  }
}
```

Platform key naming rules (HIGH confidence — Tauri v2 updater official docs):
- OS: `darwin` (macOS), `windows`, `linux`
- Arch: `x86_64`, `aarch64`, `i686`, `armv7`
- Combined: `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`

The `signature` field value must be the raw text content of the `.sig` file — NOT a path or URL. The `.sig` file is generated by `tauri build` when `TAURI_SIGNING_PRIVATE_KEY` is set.

---

## GitHub Actions Workflow Structure

The CI workflow for Windows builds requires this structure around the standard `tauri-apps/tauri-action` matrix:

```yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
          - platform: windows-latest
            args: ''

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      # Windows-only: Install LLVM for bindgen (aubio FFI requires libclang)
      - name: Install LLVM and Clang (Windows)
        if: matrix.platform == 'windows-latest'
        uses: KyleMayes/install-llvm-action@v2
        with:
          version: "17"

      # Windows-only: Set LIBCLANG_PATH from installed LLVM
      - name: Set LIBCLANG_PATH (Windows)
        if: matrix.platform == 'windows-latest'
        run: echo "LIBCLANG_PATH=${{ env.LLVM_PATH }}/bin" >> $env:GITHUB_ENV
        shell: pwsh

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - uses: dtolnay/rust-toolchain@stable

      - uses: swatinem/rust-cache@v2

      - run: npm install

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: RecoDeck ${{ github.ref_name }}
          releaseBody: 'See release notes.'
          releaseDraft: true
          args: ${{ matrix.args }}
```

Critical notes:
- The `LIBCLANG_PATH` must point to the `bin/` subdirectory of the LLVM install, NOT the root — this is where `libclang.dll` lives and what clang-sys searches.
- `fail-fast: false` is essential — a macOS signing failure should not cancel the Windows build.
- `releaseDraft: true` — gives opportunity to edit release notes and add `latest.json` before publishing.
- The `TAURI_SIGNING_PRIVATE_KEY` is needed even without code signing — it signs the updater artifacts (`.sig` files) which are separate from Windows code signing.

---

## Windows Code Signing

**Verdict: Skip for v1.5.** Users will see a SmartScreen "Unknown publisher" warning on first install. This is acceptable for a personal-use app distributed to a small group of DJ friends.

Official Tauri v2 docs confirm: *"It is not required to execute your application on Windows, as long as your end user is okay with ignoring the SmartScreen warning or your user does not download via the browser."*

When code signing becomes needed (v2+), the options in priority order:
1. **Azure Code Signing** (Microsoft's Trusted Signing service) — cheapest for indie developers, integrates with Tauri v2 via `signCommand` config
2. **Azure Key Vault + relic** — open-source tool, works with Tauri's `CODESIGN_PRIVATE_KEY_PASSWORD` flow
3. **EV Certificate (DigiCert/Sectigo)** — removes SmartScreen immediately but costs ~$400/year; overkill for this audience

For v1.5, no `signCommand` configuration is needed in `tauri.conf.json`.

---

## Installation and Setup

### Local Windows Development

```powershell
# 1. Install MSVC Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++" workload

# 2. Install Rust with MSVC toolchain
winget install Rustlang.Rustup
rustup default stable-msvc

# 3. Install LLVM (for aubio bindgen)
winget install LLVM.LLVM
# Then set env var (permanently via System Properties > Environment Variables):
# LIBCLANG_PATH = C:\Program Files\LLVM\bin

# 4. Verify build
cargo build --release
```

### CI Secrets Required

| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Signs updater `.sig` artifacts — required for auto-update to work |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions — no setup needed |

Generate the signing keypair with: `npx tauri signer generate -w ~/.tauri/myapp.key`

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `KyleMayes/install-llvm-action` for LLVM | `chocolatey install llvm` in workflow | Chocolatey install is slower (~3 min) and less reproducible across runner image versions. `install-llvm-action` is faster, version-pinned, and sets `LLVM_PATH` automatically. |
| NSIS installer | MSI installer | Use MSI if targeting enterprise environments that require MSI for Group Policy deployment. NSIS is simpler, requires no VBSCRIPT optional feature enabled, and produces a smaller installer. For personal-use distribution, NSIS is the right choice. |
| `installMode: "perUser"` | `installMode: "perMachine"` | Use `perMachine` only if the app needs to be installed for all users on shared Windows PCs. `perUser` avoids UAC elevation prompts and is standard for consumer apps. |
| Skip code signing for v1.5 | Azure Code Signing | Use Azure Code Signing when distributing publicly or to users unfamiliar with bypassing SmartScreen. Cost: ~$10/month via Azure Trusted Signing. |
| `download-binaries` feature for `ort` (existing) | Static ONNX Runtime build | Static build eliminates DLL bundling concerns but requires building ONNX Runtime from source (30+ min). The `download-binaries` feature handles Windows correctly and is the right default. |

---

## What NOT to Change

| Avoid | Why |
|-------|-----|
| Switching to `x86_64-pc-windows-gnu` toolchain | Tauri v2 does not support GNU target on Windows. MSVC only. |
| Adding `winget` or `choco` to Cargo.toml | Not applicable — these are OS-level package managers, not Rust dependencies. |
| Changing `stream://` protocol registration | The protocol handler already has correct `#[cfg(target_os = "windows")]` guards in `lib.rs`. Windows uses `http://stream.localhost/` automatically — Tauri/WRY handles the mapping. |
| Adding a separate Windows-specific audio backend | HTML5 Audio in WebView2 (Chromium-based) on Windows supports the same audio formats as WebKit on macOS. Symphonia is already handling server-side format decoding. No changes needed. |
| Adding `VBSCRIPT` optional feature for NSIS | VBSCRIPT is only required for MSI builds. Since we're using NSIS, this is not needed. |
| New Tauri commands for Windows paths | Path normalization is already in `lib.rs` with Windows-aware logic. |

---

## Version Compatibility

| Component | Version | Windows Compatibility Notes |
|-----------|---------|---------------------------|
| Tauri v2 | 2.x (current) | `windows-latest` runner (Win Server 2022). Target: `x86_64-pc-windows-msvc`. HIGH confidence. |
| bindgen (via bliss-audio-aubio-rs) | Pinned by crate | Requires LLVM >= 9.0. LLVM 17 recommended — widely available, stable with MSVC. |
| WebView2 | Evergreen | Auto-installed on Win10 1803+. Installer bootstrapper handles older systems. |
| `ort` v2.0.0-rc.11 | Fixed in Cargo.toml | `download-binaries` fetches prebuilt ONNX Runtime for `x86_64-pc-windows-msvc`. No manual action needed. |
| NSIS | Bundled by Tauri CLI | No version to manage — Tauri downloads appropriate NSIS version automatically. |

---

## Sources

- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/) — MSVC toolchain requirement, WebView2, Windows setup. HIGH confidence.
- [Tauri v2 Windows Installer](https://v2.tauri.app/distribute/windows-installer/) — NSIS config options, install modes, compression. HIGH confidence.
- [Tauri v2 GitHub Actions Pipeline](https://v2.tauri.app/distribute/pipelines/github/) — tauri-action workflow structure. HIGH confidence.
- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/) — `latest.json` format, platform key naming, `createUpdaterArtifacts` behavior. HIGH confidence.
- [Tauri v2 Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/) — No-signing option confirmed, SmartScreen behavior, Azure alternatives. HIGH confidence.
- [bindgen Requirements](https://rust-lang.github.io/rust-bindgen/requirements.html) — libclang requirement, `LIBCLANG_PATH` env var. HIGH confidence.
- [NsisConfig struct — tauri-utils docs.rs](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.NsisConfig.html) — All NSIS config fields. HIGH confidence.
- [KyleMayes/install-llvm-action GitHub Marketplace](https://github.com/marketplace/actions/install-llvm-and-clang) — LLVM GitHub Action setup. MEDIUM confidence.
- [bindgen issue #1797: libclang on GitHub Actions Windows](https://github.com/rust-lang/rust-bindgen/issues/1797) — `LIBCLANG_PATH` workaround for CI. MEDIUM confidence (community solution).
- [ort Cargo Features](https://ort.pyke.io/setup/cargo-features) — `download-binaries` default behavior, Windows compatibility. HIGH confidence.
- [ort Linking Guide](https://ort.pyke.io/setup/linking) — Static vs dynamic, `load-dynamic` feature, `ORT_LIB_PATH`. HIGH confidence.
- `src-tauri/src/lib.rs` (codebase, direct read) — Windows `#[cfg]` guards, `http://stream.localhost/` protocol already handled. HIGH confidence.
- `src-tauri/Cargo.toml` (codebase, direct read) — `bliss-audio-aubio-rs` with `["builtin", "bindgen"]` confirmed, `ort = "2.0.0-rc.11"` confirmed. HIGH confidence.
- `src-tauri/tauri.conf.json` (codebase, direct read) — Current config structure, updater endpoint, `v1Compatible` confirmed. HIGH confidence.

---

*Stack research for: RecoDeck v1.5 — Windows platform support*
*Researched: 2026-03-14*
