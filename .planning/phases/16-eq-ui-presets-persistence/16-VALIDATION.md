---
phase: 16
slug: eq-ui-presets-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test runner configured in project |
| **Config file** | None — Wave 0 not applicable |
| **Quick run command** | Manual: open EQ modal, move slider, verify sound changes |
| **Full suite command** | Manual: full restart cycle + both themes |
| **Estimated runtime** | ~60 seconds (manual) |

---

## Sampling Rate

- **After every task commit:** Manual: open modal, move a slider, close + reopen to verify state
- **After every plan wave:** Manual: full restart test for EQPE-01
- **Before `/gsd:verify-work`:** All 5 success criteria TRUE
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | EQPR-01 | manual | Visual: preset dropdown has 6 options | N/A | ⬜ pending |
| 16-01-02 | 01 | 1 | EQPR-02 | manual | Audio: select preset, listen for smooth transition | N/A | ⬜ pending |
| 16-01-03 | 01 | 1 | EQUI-01 | manual | Visual: EQ icon in NowPlayingBar right section | N/A | ⬜ pending |
| 16-01-04 | 01 | 1 | EQUI-02 | manual | Visual: modal has 10 sliders with frequency labels | N/A | ⬜ pending |
| 16-01-05 | 01 | 1 | EQUI-03 | manual | Audio: drag slider, hear gain change in real time | N/A | ⬜ pending |
| 16-01-06 | 01 | 1 | EQUI-04 | manual | Visual: toggle + preset dropdown present | N/A | ⬜ pending |
| 16-01-07 | 01 | 1 | EQUI-05 | manual | Visual: icon shows active dot when EQ enabled | N/A | ⬜ pending |
| 16-01-08 | 01 | 1 | EQUI-06 | manual | Visual: switch themes, verify modal renders | N/A | ⬜ pending |
| 16-01-09 | 01 | 1 | EQPE-01 | manual | Restart app, verify EQ state restored | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner exists in this project — all EQ UI verification is manual (visual + audio).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preset selection moves sliders smoothly | EQPR-02 | Audio-perceptual (30ms ramp timing) | Select preset, listen for click-free transition |
| EQ icon in NowPlayingBar | EQUI-01 | Visual layout check | Open app, verify icon position |
| Modal with 10 vertical sliders | EQUI-02 | Visual layout check | Click EQ icon, count sliders, check labels |
| Slider drag changes sound | EQUI-03 | Audio-perceptual | Play track, drag slider, listen for gain change |
| Toggle and preset dropdown | EQUI-04 | Visual + functional | Toggle on/off, select each preset |
| Active indicator on icon | EQUI-05 | Visual check | Enable EQ, verify dot indicator on icon |
| Theme compatibility | EQUI-06 | Visual check | Switch between Midnight and Carbon, reopen modal |
| Persistence across restart | EQPE-01 | Requires app restart | Set EQ state, close app, reopen, verify state |

---

## Validation Sign-Off

- [ ] All tasks have manual verification instructions
- [ ] Sampling continuity: manual check after every task commit
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
