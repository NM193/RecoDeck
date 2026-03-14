---
phase: 17
slug: windows-compilation-baseline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual Windows PC validation (no CI — first Windows build) |
| **Config file** | none — no automated test framework for cross-platform build validation |
| **Quick run command** | `cargo build --target x86_64-pc-windows-msvc` |
| **Full suite command** | `npm run build:win` |
| **Estimated runtime** | ~120 seconds (first build), ~30 seconds (incremental) |

---

## Sampling Rate

- **After every task commit:** Run `cargo build --target x86_64-pc-windows-msvc`
- **After every plan wave:** Run `npm run build:win`
- **Before `/gsd:verify-work`:** Full build + manual launch + audio playback test
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | BILD-01 | build | `cargo build --target x86_64-pc-windows-msvc` | ⬜ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | BILD-01 | build | `cargo build --target x86_64-pc-windows-msvc` | ⬜ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | BILD-02 | manual | Launch app, scan folder, play track | N/A | ⬜ pending |
| 17-02-02 | 02 | 2 | BILD-02 | manual | Check DevTools console for CSP/autoplay errors | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Windows PC environment setup: Rust, Node, LLVM 18, VS Build Tools
- [ ] Verify `rustup target list --installed` shows `x86_64-pc-windows-msvc`
- [ ] Verify `LIBCLANG_PATH` environment variable is set

*Existing infrastructure covers macOS; Windows requires fresh toolchain install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App launches on Windows | BILD-01 | Requires physical Windows PC | Double-click .exe or run from terminal |
| Library scanner handles Windows paths with spaces/Unicode | BILD-02 | Requires Windows filesystem | Scan folder containing tracks with spaces and Unicode in path |
| Audio plays end-to-end | BILD-02 | Requires Windows audio stack | Click a track, verify audio output |
| No CSP/autoplay errors in WebView2 DevTools | BILD-02 | Requires WebView2 runtime | Open DevTools (F12), check console during playback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
