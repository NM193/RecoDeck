# Phase 17: Windows Compilation Baseline - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

RecoDeck compiles and runs on Windows — `cargo build --target x86_64-pc-windows-msvc` succeeds with Aubio bindgen, a debug build launches, audio plays end-to-end, and the library scanner handles Windows paths. No changes to existing macOS code.

</domain>

<decisions>
## Implementation Decisions

### Preservation constraint
- All existing macOS code remains UNTOUCHED — no modifications to working code
- Windows support is purely additive: new cfg blocks, new scripts, new docs
- If platform-specific behavior is needed, use `#[cfg(target_os = "windows")]` alongside existing `#[cfg(not(target_os = "windows"))]` blocks

### Build environment
- User has a physical Windows PC with nothing installed yet
- Create a step-by-step `WINDOWS-SETUP.md` guide covering: Rust, Node, LLVM, VS Build Tools, and build verification
- `build:win` is a simple npm script (tauri build wrapper), not a PowerShell script with checks
- Full dev mode (`tauri dev` with hot-reload) must work on Windows — same developer experience as macOS
- Same editor (VS Code / Cursor) on both platforms

### Aubio bindgen strategy
- Primary approach: compile Aubio with `builtin` + `bindgen` features on MSVC using LLVM/libclang
- Fallback 1: Try vcpkg or pre-built Aubio libraries for Windows
- Fallback 2 (last resort): Strip Aubio on Windows via feature flag — ship without BPM/key detection rather than block the release
- Priority: try hardest to make bindgen work before falling back

### Validation approach
- Manual testing on the physical Windows PC — build, run, scan a folder, play a track
- Review all existing `#[cfg(target_os = "windows")]` blocks in lib.rs, scanner.rs, db/mod.rs BEFORE the first build attempt
- Unicode/special character paths: user will check if test tracks have them — handle regardless since the existing code already accounts for it

### Claude's Discretion
- LLVM version choice for Windows (17 vs 18 vs latest)
- Exact VS Build Tools components to install
- Whether to use rustup target add or rely on default MSVC toolchain
- build.rs modifications needed for Windows Aubio compilation

</decisions>

<specifics>
## Specific Ideas

- "I want to keep everything for mac. Don't touch anything that is now. We need to copy and change for windows."
- The existing codebase already has Windows-aware code (stream protocol, path handling) — this is an advantage, not greenfield work

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib.rs`: Already has `#[cfg(target_os = "windows")]` blocks for stream URL handling (`http://stream.localhost` vs `stream://localhost`) and path normalization (backslash conversion, UNC prefix handling)
- `scanner.rs`: Already has Windows path normalization with `#[cfg(target_os = "windows")]` for backslash-to-forward-slash conversion
- `audioPlayer.ts`: Already detects platform and uses correct stream URL format (`http://stream.localhost` for Windows)
- `main.rs`: Already has `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
- `Cargo.toml`: `bliss-audio-aubio-rs` with `builtin` + `bindgen` features — the Aubio compilation target

### Established Patterns
- Platform-specific code uses `#[cfg(target_os = "windows")]` and `#[cfg(not(target_os = "windows"))]` — follow this pattern
- Stream protocol: macOS uses `stream://localhost`, Windows uses `http://stream.localhost` — already handled in both Rust and TypeScript
- Cargo.toml lib section already has Windows-specific naming note (cargo issue #8519)

### Integration Points
- `package.json`: Needs new `build:win` script (currently only has macOS build commands)
- `src-tauri/.cargo/config.toml`: May need Windows-specific profile settings
- `src-tauri/tauri.conf.json`: Bundle config exists but no Windows-specific sections yet
- `db/mod.rs:1121`: Has a `#[cfg(not(target_os = "windows"))]` block that needs a Windows counterpart reviewed

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-windows-compilation-baseline*
*Context gathered: 2026-03-14*
