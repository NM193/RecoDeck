---
phase: 17-windows-compilation-baseline
verified: 2026-03-14T13:30:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Clone repo on Windows, follow WINDOWS-SETUP.md, run npm run build:win"
    expected: "A working NSIS installer is produced at src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"
    why_human: "Cannot cross-compile or execute Windows binary on macOS; actual MSVC + LLVM toolchain needed to prove Aubio bindgen succeeds"
  - test: "Launch the Windows build and play a track"
    expected: "Audio plays without requiring a user gesture — confirms additionalBrowserArgs autoplay policy is applied"
    why_human: "WebView2 autoplay behavior can only be observed on a running Windows instance"
---

# Phase 17: Windows Compilation Baseline — Verification Report

**Phase Goal:** Prepare RecoDeck's codebase for Windows compilation — all configuration changes committed on macOS so the user can clone on Windows and build.
**Verified:** 2026-03-14T13:30:00Z
**Status:** human_needed (all automated checks passed; outcome requires Windows hardware to confirm)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WINDOWS-SETUP.md provides a complete step-by-step guide to set up the Windows build environment | VERIFIED | File exists at repo root, 202 lines, contains Prerequisites + Steps 1-7 + Troubleshooting + Plan B |
| 2 | build:win npm script exists and invokes tauri build with the correct MSVC target | VERIFIED | package.json line 17: `"build:win": "npm run version:sync && tauri build --target x86_64-pc-windows-msvc"` |
| 3 | build.rs includes a LIBCLANG_PATH fallback hint for Windows so bindgen finds libclang.dll | VERIFIED | build.rs lines 3-11: `#[cfg(target_os = "windows")]` block sets LIBCLANG_PATH if env var is absent and default path exists |
| 4 | tauri.conf.json includes additionalBrowserArgs to disable WebView2 autoplay blocking on Windows | VERIFIED | tauri.conf.json line 18: `--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` |
| 5 | All changes are additive — no existing macOS code is modified | VERIFIED | build:mac script unchanged (line 16); build.rs cfg-gated so LIBCLANG_PATH block absent on macOS; additionalBrowserArgs ignored by WebKit |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `WINDOWS-SETUP.md` | Step-by-step Windows environment setup guide (min 50 lines) | VERIFIED | 202 lines. Contains: Prerequisites table, Steps 1-7 (VS Build Tools, Rust MSVC, LLVM 18, Node LTS, verify, clone+build, dev mode), Troubleshooting (3 cases), Plan B fallback. |
| `package.json` | build:win npm script | VERIFIED | Line 17: `"build:win": "npm run version:sync && tauri build --target x86_64-pc-windows-msvc"`. Placed after build:mac. No other lines modified. |
| `src-tauri/build.rs` | Windows LIBCLANG_PATH fallback | VERIFIED | Lines 2-11: `#[cfg(target_os = "windows")]` block with env var check and path existence guard before `tauri_build::build()`. |
| `src-tauri/tauri.conf.json` | Windows autoplay policy fix | VERIFIED | Line 18: `additionalBrowserArgs` with autoplay flag and re-included default disabled features (msWebOOUI, msPdfOOUI, msSmartScreenProtection). |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json (build:win)` | `tauri build --target x86_64-pc-windows-msvc` | npm script | WIRED | Exact target string present: `"build:win": "npm run version:sync && tauri build --target x86_64-pc-windows-msvc"` |
| `src-tauri/build.rs` | `LIBCLANG_PATH env var` | `cfg(target_os = "windows")` fallback | WIRED | Pattern `LIBCLANG_PATH` found at lines 5 and 8; wrapped in `#[cfg(target_os = "windows")]` block confirmed at line 3 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILD-01 | 17-01-PLAN.md | App compiles on Windows with x86_64-pc-windows-msvc target including Aubio bindgen | NEEDS HUMAN | Infrastructure set up: build.rs LIBCLANG_PATH fallback, LLVM 18 documented in setup guide, MSVC target in build:win. Actual compilation must be confirmed on Windows hardware. |
| BILD-02 | 17-01-PLAN.md | build:win npm script produces a working Windows build | NEEDS HUMAN | Script exists and has correct target. "Working Windows build" means installer produced and app launches — requires Windows hardware to verify. |

Both requirement IDs claimed by this phase (BILD-01, BILD-02) are accounted for. No orphaned requirements found — REQUIREMENTS.md traceability table maps only BILD-01 and BILD-02 to Phase 17.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns detected |

Scan covered all four files modified by this phase. No TODO/FIXME/placeholder comments, no empty implementations, no stub handlers.

---

## Human Verification Required

### 1. Windows compilation succeeds end-to-end

**Test:** On a fresh Windows 10/11 machine, follow WINDOWS-SETUP.md steps 1-6. Run `npm run build:win`.
**Expected:** Build completes without error. Installer produced at `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/recodeck_x.x.x_x64-setup.exe`.
**Why human:** Cross-compilation of Aubio (a C library requiring MSVC + LLVM) cannot be verified from macOS. The LIBCLANG_PATH fallback in build.rs is cfg-gated and cannot be exercised without Windows + LLVM installed.

### 2. WebView2 autoplay policy confirmed active

**Test:** Install the Windows build, open RecoDeck, add a track to the library, double-click to play it without any prior interaction.
**Expected:** Audio plays immediately — the WebView2 autoplay block does not interrupt `audioPlayer.ts`'s `.play()` call.
**Why human:** `additionalBrowserArgs` is a Chrome/WebView2-only field; its effect on autoplay behaviour can only be observed in a running WebView2 instance on Windows.

---

## Commits Verified

Both task commits exist and match the SUMMARY's documented hashes:

- `b32bd9b` — `feat(17-01): add Windows setup guide and build:win script` (WINDOWS-SETUP.md 202 lines, package.json +1 line)
- `508c386` — `feat(17-01): add Windows LIBCLANG_PATH hint and WebView2 autoplay fix` (build.rs +11 lines, tauri.conf.json +3 lines modified)

---

## Gaps Summary

No automated gaps. All four artifacts exist, are substantive, and are wired correctly. The phase goal is fully prepared on the macOS side — the configuration changes that enable Windows compilation are committed and correct.

The two items flagged for human verification (BILD-01 and BILD-02) are inherent to this phase's nature: the phase deliberately stops at "prepare on macOS" with Windows build confirmation deferred to Phase 18 (Windows audio validation). No remediation is needed before proceeding to the Windows machine.

---

_Verified: 2026-03-14T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
