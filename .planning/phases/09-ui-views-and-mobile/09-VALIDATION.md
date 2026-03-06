---
phase: 9
slug: ui-views-and-mobile
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + React Testing Library |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | UIUX-06 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | UIUX-06 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | UIUX-07 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | UIUX-08 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | UIUX-08 | manual | visual inspection | N/A | ⬜ pending |
| 09-03-01 | 03 | 3 | UIUX-10 | manual | visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/TrackTable.test.tsx` — stubs for UIUX-06 (# column render, row selection state, playlistMode prop)
- [ ] `src/components/views/SearchView.test.tsx` — stubs for UIUX-08 (search filtering, empty state, section rendering)

*Existing vitest infrastructure is already in place — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Track row hover: play icon appears in # column, row background highlights | UIUX-06 | CSS :hover pseudo-class not reliably testable in jsdom | Open app, hover over a track row — play icon should appear in leftmost column |
| Double-click plays track and loads full sorted list into queue | UIUX-06 | Requires real audio context and queue state integration | Double-click a row — track should begin playing, queue should populate |
| Playlist detail: track listing shows sequential numbers and header art | UIUX-07 | Requires real playlist data and PlaylistDetailHeader scroll compression | Open a playlist — should see header with art + sequential numbered track list |
| Search results sectioned layout with Tracks and Playlists sections | UIUX-08 | Visual layout requires real app rendering | Navigate to Search, type a query — results should appear in labeled sections |
| Mobile PWA dark theme token alignment | UIUX-10 | Requires mobile browser or PWA install to verify visual output | Open mobile PWA — background should be #121212, accent should match desktop indigo |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
