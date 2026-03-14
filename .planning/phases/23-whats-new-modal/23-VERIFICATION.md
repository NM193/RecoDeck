---
phase: 23-whats-new-modal
verified: 2026-03-14T18:42:30Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 23: What's New Modal Verification Report

**Phase Goal:** Refactor What's New modal to show categorized changelog sections, guard fresh installs, remove duplicate update button
**Verified:** 2026-03-14T18:42:30Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getChangesForVersion` returns a categorized object with added, changed, and fixed arrays | VERIFIED | `src/lib/changelog.ts` exports `VersionChanges` interface and `getChangesForVersion` returns `{ added, changed, fixed }` — 4 unit tests confirm shape and content |
| 2 | The What's New modal renders labeled sections (New, Fixed, Changes) and hides empty sections | VERIFIED | `WhatsNewDialog.tsx` builds `sections` array filtered by `items.length > 0`, renders each with a label div and `<ul>` |
| 3 | On a fresh install the What's New modal does not appear | VERIFIED | `App.tsx` line 314: explicit `if (lastSeen === null)` branch sets version and returns without calling `setWhatsNew` |
| 4 | The WhatsNewDialog has no Update button — only a Got it button | VERIFIED | `WhatsNewDialog.tsx` has exactly one button (`<button className="btn btn-primary">Got it</button>`), zero references to `check`, `relaunch`, `ask`, `updating`, `handleUpdate`, or `progress` |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/changelog.ts` | VersionChanges interface and categorized getChangesForVersion | VERIFIED | Exports `VersionChanges` interface (lines 6-10), exports `getChangesForVersion` returning `VersionChanges` (line 32), private `extractSection` helper (line 15) — 47 lines, substantive |
| `src/lib/changelog.test.ts` | Unit tests for categorized changelog parser | VERIFIED | 82 lines, 4 tests: shape test, content test, unknown version test, partial-subsections test — all pass |
| `src/components/WhatsNewDialog.tsx` | Sectioned modal with no update button | VERIFIED | 59 lines, imports `VersionChanges`, renders sections array filtered for non-empty, single Got it button |
| `src/App.tsx` | Null guard for fresh install and updated state type | VERIFIED | `whatsNew` state typed as `VersionChanges` (line 138), `lastSeen === null` guard (line 314), `hasAny` check (line 319) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/changelog.ts` | `src/App.tsx` | `getChangesForVersion` call in initializeApp | WIRED | `import { getChangesForVersion, type VersionChanges } from './lib/changelog'` at line 17; called at line 318 |
| `src/App.tsx` | `src/components/WhatsNewDialog.tsx` | changes prop passed as VersionChanges | WIRED | `<WhatsNewDialog ... changes={whatsNew.changes} />` at lines 1324-1326; `whatsNew` state typed `changes: VersionChanges` |
| `src/App.tsx` | `tauriApi.getSetting` | null guard before version comparison | WIRED | `const lastSeen = await tauriApi.getSetting('last_seen_version')` → `if (lastSeen === null)` at lines 312-314; explicit null branch present |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WHNW-01 | 23-01-PLAN.md | `getChangesForVersion()` returns `{ added, changed, fixed }` instead of flat `string[]` | SATISFIED | `changelog.ts` return type is `VersionChanges`; 4 unit tests verify shape and content; `npx tsc --noEmit` clean |
| WHNW-02 | 23-01-PLAN.md | What's New modal displays three labeled sections (New / Fixes / Changes) | SATISFIED | `WhatsNewDialog.tsx` renders `sections` array with label divs and filtered empty sections |
| WHNW-03 | 23-01-PLAN.md | What's New modal does not fire on fresh install (null guard) | SATISFIED | `App.tsx` line 314: `if (lastSeen === null)` branch records version, skips `setWhatsNew` |
| WHNW-04 | 23-01-PLAN.md | Duplicate update button removed from WhatsNewDialog | SATISFIED | Grep for `check\|relaunch\|ask\|updating\|handleUpdate\|progress\|Update` in `WhatsNewDialog.tsx` returns zero matches |

All four requirements marked `[x]` complete in `REQUIREMENTS.md` lines 53-56. Requirement tracker at lines 117-120 confirms Phase 23 / Complete status for all four IDs. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, FIXMEs, placeholders, empty returns, or stub implementations detected in any of the four modified files.

---

### Human Verification Required

#### 1. Visual Rendering of Sectioned Modal

**Test:** Trigger the What's New dialog (modify `last_seen_version` in the DB to an older version, relaunch the app).
**Expected:** Modal displays bold "NEW", "FIXED", and "CHANGES" section labels (uppercase, `var(--text-primary)`) each followed by a bulleted list. Empty sections are absent from the rendered output.
**Why human:** Section layout, label styling (`textTransform: uppercase`, `letterSpacing`), and color token rendering cannot be verified without a running Tauri window.

#### 2. Fresh Install Behavior

**Test:** Delete the app's SQLite DB (or clear `last_seen_version` key), relaunch the app.
**Expected:** What's New modal does NOT appear on first launch. On a subsequent relaunch (where `last_seen_version` is set), modal still does not appear because version has not changed.
**Why human:** Requires a live Tauri session with controlled DB state.

---

### Commits Verified

All three commits documented in SUMMARY.md exist in git history:

| Commit | Type | Description |
|--------|------|-------------|
| `6c19b65` | test | Add failing tests for categorized getChangesForVersion (TDD RED) |
| `cd15dc0` | feat | Refactor changelog parser to return categorized VersionChanges (TDD GREEN) |
| `ba4fe15` | feat | Update WhatsNewDialog to sectioned display and fix App.tsx fresh-install guard |

---

### Test Suite

- `npm run test -- changelog`: 4/4 tests pass (confirmed live run)
- `npx tsc --noEmit`: 0 errors (confirmed live run)

---

## Summary

Phase 23 goal is fully achieved. All four must-have truths are verified against the actual codebase, not just SUMMARY claims:

- `changelog.ts` exports a real `VersionChanges` interface and a properly implemented categorized parser with `extractSection` helper — not a stub.
- `changelog.test.ts` contains 4 substantive tests that exercise shape, content, unknown version, and partial-subsection cases — all pass.
- `WhatsNewDialog.tsx` is a clean 59-line component with sectioned rendering and a single Got it button — zero update-flow remnants.
- `App.tsx` has an explicit `lastSeen === null` guard that prevents modal display on fresh install, plus a correct `hasAny` object check replacing the broken `changes.length > 0` array check.
- All key links are wired: `VersionChanges` flows from `changelog.ts` through `App.tsx` state into `WhatsNewDialog` props.
- All four requirement IDs (WHNW-01 through WHNW-04) are satisfied with implementation evidence.

Two items require human visual verification (modal appearance and fresh-install behavior in a live Tauri window) but all automated checks pass.

---

_Verified: 2026-03-14T18:42:30Z_
_Verifier: Claude (gsd-verifier)_
