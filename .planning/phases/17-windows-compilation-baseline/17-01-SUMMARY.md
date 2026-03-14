---
phase: 17-windows-compilation-baseline
plan: "01"
subsystem: infra
tags: [windows, tauri, rust, llvm, build, msvc, webview2]

# Dependency graph
requires: []
provides:
  - WINDOWS-SETUP.md step-by-step Windows environment guide
  - build:win npm script targeting x86_64-pc-windows-msvc
  - build.rs Windows LIBCLANG_PATH fallback (cfg-gated, inert on macOS)
  - tauri.conf.json additionalBrowserArgs WebView2 autoplay fix
affects: [18-windows-audio-validation, 19-windows-packaging-ci, 20-windows-release]

# Tech tracking
tech-stack:
  added: [x86_64-pc-windows-msvc Rust target]
  patterns: [cfg(target_os = windows) additive blocks, additionalBrowserArgs for WebView2 compatibility]

key-files:
  created: [WINDOWS-SETUP.md]
  modified: [package.json, src-tauri/build.rs, src-tauri/tauri.conf.json]

key-decisions:
  - "Include --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection in additionalBrowserArgs to preserve Tauri/wry defaults that get overridden when the field is set"
  - "Document Aubio MSVC fallback (optional feature flag) in setup guide rather than implementing it proactively"
  - "Use cfg(target_os = windows) in build.rs so the LIBCLANG_PATH block is completely absent from macOS compilation"

patterns-established:
  - "Windows-specific Rust code: use #[cfg(target_os = windows)] blocks — zero cost on macOS"
  - "tauri.conf.json additionalBrowserArgs must re-include all default disabled features when set"

requirements-completed: [BILD-01, BILD-02]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 17 Plan 01: Windows Compilation Baseline Summary

**Windows build infrastructure: LIBCLANG_PATH fallback in build.rs, WebView2 autoplay fix in tauri.conf.json, build:win npm script, and complete WINDOWS-SETUP.md guide covering VS Build Tools, LLVM 18, and Rust MSVC toolchain**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T12:09:44Z
- **Completed:** 2026-03-14T12:11:00Z
- **Tasks:** 2 of 3 complete (Task 3 is a human-verify checkpoint — awaiting macOS build confirmation)
- **Files modified:** 4

## Accomplishments

- Created WINDOWS-SETUP.md with 7-step guide covering all Windows build prerequisites and troubleshooting
- Added `build:win` npm script targeting `x86_64-pc-windows-msvc` alongside existing `build:mac`
- Extended `build.rs` with a Windows-only `#[cfg(target_os = "windows")]` block that auto-sets `LIBCLANG_PATH` as a convenience fallback — completely absent from macOS compilation
- Added `additionalBrowserArgs` to `tauri.conf.json` to unblock WebView2 autoplay and preserve default Tauri disabled features

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WINDOWS-SETUP.md and add build:win script** - `b32bd9b` (feat)
2. **Task 2: Add Windows build.rs LIBCLANG_PATH hint and tauri.conf.json autoplay fix** - `508c386` (feat)

## Files Created/Modified

- `WINDOWS-SETUP.md` - Complete step-by-step Windows environment setup guide (prerequisites, 7 steps, troubleshooting, plan B fallback)
- `package.json` - Added `build:win` script after `build:mac`
- `src-tauri/build.rs` - Added Windows-only `LIBCLANG_PATH` fallback block before `tauri_build::build()`
- `src-tauri/tauri.conf.json` - Added `additionalBrowserArgs` to `app.windows[0]` for WebView2 autoplay policy

## Decisions Made

- **additionalBrowserArgs flag set**: Tauri/wry default-disables `msWebOOUI`, `msPdfOOUI`, and `msSmartScreenProtection` — when `additionalBrowserArgs` is provided it overrides all defaults, so those three must be explicitly re-included alongside the `--autoplay-policy` flag.
- **Proactive fallback not implemented**: The Aubio MSVC fallback (optional feature flag) is documented in WINDOWS-SETUP.md as plan B but not implemented — only implement if compilation actually fails.
- **cfg-gated build.rs block**: The LIBCLANG_PATH code uses `#[cfg(target_os = "windows")]` so it is entirely absent from macOS compilation, not just branched at runtime.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Windows-specific code changes are committed and additive (no macOS behavior modified)
- Changes are pending macOS build verification (Task 3 checkpoint)
- Once macOS build confirmed working, push to GitHub so Windows PC can clone and follow WINDOWS-SETUP.md
- Phase 18 (Windows audio validation) can begin after successful clone and build on Windows hardware

## Self-Check: PASSED

- FOUND: WINDOWS-SETUP.md (202 lines, exceeds 50-line minimum)
- FOUND: package.json with build:win script
- FOUND: src-tauri/build.rs with LIBCLANG_PATH
- FOUND: src-tauri/tauri.conf.json with additionalBrowserArgs
- FOUND: 17-01-SUMMARY.md
- FOUND: commits b32bd9b and 508c386

---
*Phase: 17-windows-compilation-baseline*
*Completed: 2026-03-14*
