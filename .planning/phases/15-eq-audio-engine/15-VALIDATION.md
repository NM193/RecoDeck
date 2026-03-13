---
phase: 15
slug: eq-audio-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual smoke testing (Web Audio API requires browser/WKWebView) |
| **Config file** | none — no automated test infrastructure for audio pipeline |
| **Quick run command** | Manual: play track, verify no console errors in DevTools |
| **Full suite command** | Manual: run all 4 success criteria against live Tauri app |
| **Estimated runtime** | ~120 seconds (manual) |

---

## Sampling Rate

- **After every task commit:** Manual: open DevTools, play a track, verify no console errors
- **After every plan wave:** Full success criteria checklist (4 items)
- **Before `/gsd:verify-work`:** All 4 success criteria confirmed
- **Max feedback latency:** ~120 seconds (manual verification)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | EQAP-01 | manual-smoke | Manual: play track, boost band 1 (+6 dB at 32 Hz), verify audible change | N/A | ⬜ pending |
| 15-01-02 | 01 | 1 | EQAP-02 | manual-smoke | Manual: enable EQ, verify waveform still animates, no console errors | N/A | ⬜ pending |
| 15-01-03 | 01 | 1 | EQAP-03 | manual-smoke | Manual: boost bass, trigger crossfade, verify bass boost on new track | N/A | ⬜ pending |
| 15-01-04 | 01 | 1 | EQAP-04 | manual-smoke | Manual: background app 10s+, return, verify audio + EQ resume | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No automated test files to create — all verification is manual due to Web Audio API browser-only constraint.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EQ enable/disable changes audio output | EQAP-01 | Web Audio API only available in browser/WKWebView | Play track, boost 32 Hz band +6 dB, verify audible bass change |
| Waveform continues with EQ active | EQAP-02 | Requires visual verification of canvas animation | Enable EQ, verify waveform visualizer keeps animating |
| EQ persists through crossfade | EQAP-03 | Requires crossfade trigger with active EQ | Boost bass, trigger crossfade, verify boost on new track |
| Background suspension recovery | EQAP-04 | Requires app backgrounding on macOS | Background app 10s+, return, verify audio + EQ continue |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
