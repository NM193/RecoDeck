---
phase: 23
slug: whats-new-modal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (uses vite.config.ts) |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | WHNW-01 | unit | `npm run test -- changelog` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | WHNW-01 | unit | `npm run test -- changelog` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | WHNW-03 | unit | `npm run test -- changelog` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | WHNW-02 | manual | n/a — Tauri component | n/a | ⬜ pending |
| 23-01-05 | 01 | 1 | WHNW-04 | manual | n/a — Tauri component | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/changelog.test.ts` — stubs for WHNW-01 (categorized return type) and WHNW-03 (null guard logic)

*WHNW-02 and WHNW-04 are visual UI changes in a Tauri window; no JSDOM/React Testing Library is configured, so verification is manual.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| What's New modal renders three labeled sections | WHNW-02 | Tauri component, no React Testing Library configured | Launch app, trigger What's New modal, verify "New", "Fixed", "Changes" sections appear with correct items |
| No Update button in WhatsNewDialog | WHNW-04 | Tauri component | Launch app, open What's New modal, verify only "Got it" button exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
