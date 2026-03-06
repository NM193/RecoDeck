---
phase: 12
slug: css-layout-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
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
| 12-01-01 | 01 | 1 | LAYT-01, LAYT-02 | manual | visual inspection at 800px/1280px/1920px | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

This phase involves a single CSS rule addition. No new test files required — the change is verified visually by resizing the browser window.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Track table rows fill full window width at 800px | LAYT-01 | CSS visual layout — no DOM assertion captures rendered width accurately | Open app, resize window to 800px, confirm no gap to right of last column |
| Track table rows fill full window width at 1280px | LAYT-01 | CSS visual layout | Open app, resize window to 1280px, confirm no gap |
| Track table rows fill full window width at 1920px | LAYT-01 | CSS visual layout | Open app, resize window to 1920px, confirm no gap |
| Track table header background fills full width | LAYT-02 | CSS visual layout | Open app at any width, confirm header bg extends edge-to-edge |
| Horizontal scroll only appears when columns exceed window | LAYT-02 | CSS visual layout | Open app at 1920px with narrow columns — no horizontal scrollbar should appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
