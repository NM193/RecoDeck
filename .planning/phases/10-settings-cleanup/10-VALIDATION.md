---
phase: 10
slug: settings-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SETT-01 | grep | `grep -c "dawn\|neon\|custom" src/components/settings/constants.ts` → 0 | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | SETT-02 | grep | `grep -r "key_notation" src/ \| wc -l` → 0 | ✅ | ⬜ pending |
| 10-01-03 | 01 | 1 | SETT-03 | grep | `grep -r "waveform_style" src/ \| wc -l` → 0 | ✅ | ⬜ pending |
| 10-01-04 | 01 | 1 | SETT-01,02,03 | unit | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed — this phase removes code and verification is grep-based.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings > Appearance shows only Midnight and Carbon | SETT-01 | UI visual check | Open app → Settings → Appearance → confirm only 2 theme options |
| Key Notation absent from Settings | SETT-02 | UI visual check | Open Settings → confirm no Key Notation section exists |
| Waveform Style absent from Settings | SETT-03 | UI visual check | Open Settings → confirm no Waveform Style section exists |
| Keys display in Camelot notation app-wide | SETT-02 | UI visual check | Browse tracks — confirm all keys show Camelot format (e.g., 8A, 9B) |
| Waveforms render in Traktor RGB | SETT-03 | UI visual check | Browse tracks with waveforms — confirm colored Traktor RGB rendering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
