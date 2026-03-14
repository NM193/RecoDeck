---
phase: 21
slug: updater-config
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (config-only phase — validation via config inspection) |
| **Config file** | N/A |
| **Quick run command** | `python3 -c "import json,sys; c=json.load(open('src-tauri/tauri.conf.json')); sys.exit(0 if 'dialog' not in c['plugins']['updater'] and c['bundle']['createUpdaterArtifacts'] is True else 1)"` |
| **Full suite command** | `cd src-tauri && cargo check 2>&1 | tail -20` |
| **Estimated runtime** | ~2 seconds (config check), ~30 seconds (cargo check) |

---

## Sampling Rate

- **After every task commit:** Run quick config inspection command
- **After every plan wave:** Run `cd src-tauri && cargo check`
- **Before `/gsd:verify-work`:** Both config checks pass + cargo check clean
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | UCFG-01 | config inspection | `python3 -c "import json,sys; c=json.load(open('src-tauri/tauri.conf.json')); sys.exit(0 if 'dialog' not in c['plugins']['updater'] else 1)"` | ✅ | ⬜ pending |
| 21-01-02 | 01 | 1 | UCFG-02 | config inspection | `python3 -c "import json,sys; c=json.load(open('src-tauri/tauri.conf.json')); v=c['bundle']['createUpdaterArtifacts']; sys.exit(0 if v is True else 1)"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

No test files need to be created. Validation is config inspection via inline commands against existing `tauri.conf.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Permissions present in capabilities | UCFG-01/02 | Can be verified with grep | `grep -c "updater:default\|process:allow-restart" src-tauri/capabilities/default.json` — expect 2 |

*All primary behaviors have automated verification via config inspection.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
