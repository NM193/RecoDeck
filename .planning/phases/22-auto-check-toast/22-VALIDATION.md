---
phase: 22
slug: auto-check-toast
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no automated test framework in project) |
| **Config file** | N/A |
| **Quick run command** | `npm run build -- 2>&1 \| tail -20` |
| **Full suite command** | `npm run build -- 2>&1 \| tail -20` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -- 2>&1 | tail -20`
- **After every plan wave:** Run `npm run build -- 2>&1 | tail -20`
- **Before `/gsd:verify-work`:** Full build must be clean
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | UCHK-01 | code inspection | `grep -n "downloadAndInstall" src/App.tsx` (must be zero in new useEffect) | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | UCHK-02 | manual smoke | Launch built app; verify toast appears with Install + Later buttons | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 1 | UCHK-03 | code inspection + manual | `grep -n "setShowSettings" src/components/UpdateToast.tsx` | ❌ W0 | ⬜ pending |
| 22-01-04 | 01 | 1 | UCHK-03 | code inspection | `grep -n "relaunch" src/components/settings/SettingsContext.tsx` — verify Windows guard | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/UpdateToast.tsx` — new component with Install + Later buttons (UCHK-02, UCHK-03)
- [ ] `src/components/UpdateToast.css` — styles matching `Notification.css` conventions

*Existing infrastructure covers UCHK-01 (App.tsx) and relaunch guard (SettingsContext.tsx).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toast appears on launch when update available | UCHK-02 | Requires real Tauri updater endpoint with higher version | Build app, point `latest.json` to higher semver, launch, verify toast |
| Install button navigates to Settings > About | UCHK-03 | Requires built app with UI navigation | Click Install on toast, verify Settings opens |
| relaunch() skipped on Windows | UCHK-03 | Requires Windows machine | Build and test on Windows after update install |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
