---
phase: 11
slug: playback-bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | PLAY-01, PLAY-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | PLAY-01 | unit | `npm test -- --grep "SEEK_MARGIN_MS"` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | PLAY-02 | unit | `npm test -- --grep "abortCrossfade"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/audioPlayer.test.ts` — stubs for PLAY-01 (SEEK_MARGIN_MS value check) and PLAY-02 (abortCrossfade called in loadTrack)
- [ ] Check `src/test/setup.ts` — add HTMLAudioElement mock if absent so AudioPlayer can be instantiated in tests

*If `src/test/setup.ts` already mocks HTMLAudioElement (Phase 6 work), Wave 0 only needs to create the test file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VBR MP3 plays to natural end without audio replay | PLAY-01 | HTMLAudioElement playback unavailable in jsdom | Load a VBR MP3, let it play to end, confirm next track starts without repeating last few seconds |
| Skip during crossfade stops all audio streams | PLAY-02 | Crossfade audio behavior requires real browser | Start a crossfade, press skip, confirm only new track is audible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
