---
phase: 23-whats-new-modal
plan: 01
subsystem: ui
tags: [changelog, modal, vitest, typescript, react]

requires:
  - phase: 22-auto-check-toast
    provides: "Update check flow via Settings — this plan removes the duplicate update logic from WhatsNewDialog"

provides:
  - "VersionChanges interface with added/changed/fixed string arrays from src/lib/changelog.ts"
  - "Categorized getChangesForVersion() replacing flat string[] return"
  - "WhatsNewDialog with New/Fixed/Changes sections and single Got it button"
  - "App.tsx fresh-install null guard preventing modal on first launch"

affects: [24-whats-new-polish, changelog, whats-new]

tech-stack:
  added: []
  patterns:
    - "TDD: write failing tests first (vi.mock for Vite raw import), then implement"
    - "Changelog parsing: extractSection() regex helper per ### subsection"
    - "Fresh-install guard: explicit null check on lastSeen before version comparison"

key-files:
  created:
    - src/lib/changelog.test.ts
  modified:
    - src/lib/changelog.ts
    - src/components/WhatsNewDialog.tsx
    - src/App.tsx

key-decisions:
  - "Mock CHANGELOG.md?raw in vitest using vi.mock() since Vite raw imports are not supported in vitest natively"
  - "WhatsNewDialog sections order: New first, then Fixed, then Changes — matches importance to users"
  - "Fresh-install guard uses lastSeen === null (explicit null) not falsy check, matching getSetting() contract"

patterns-established:
  - "Pattern 1: Vite ?raw imports mocked in tests via vi.mock('../../file?raw', () => ({ default: content }))"
  - "Pattern 2: VersionChanges flows from changelog.ts through App.tsx state into WhatsNewDialog props"

requirements-completed: [WHNW-01, WHNW-02, WHNW-03, WHNW-04]

duration: 15min
completed: 2026-03-14
---

# Phase 23 Plan 01: What's New Modal Refactor Summary

**Categorized changelog modal with New/Fixed/Changes sections, fresh-install null guard, and removal of duplicate Update button from WhatsNewDialog**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-14T17:38:00Z
- **Completed:** 2026-03-14T17:40:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Refactored `getChangesForVersion` from flat `string[]` to structured `VersionChanges` object with `added`, `changed`, `fixed` arrays
- Rewrote `WhatsNewDialog` to render labeled sections (New / Fixed / Changes), hiding empty sections, with a single "Got it" button
- Fixed fresh-install bug: `lastSeen === null` branch records version without showing modal
- Added 4 unit tests with TDD (RED → GREEN) using `vi.mock` for Vite raw import compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing changelog tests** - `6c19b65` (test)
2. **Task 1 (GREEN): Implement VersionChanges and extractSection** - `cd15dc0` (feat)
3. **Task 2: WhatsNewDialog + App.tsx updates** - `ba4fe15` (feat)

_Note: TDD task has two commits (test RED → feat GREEN). No refactor pass needed._

## Files Created/Modified
- `src/lib/changelog.ts` - Exports VersionChanges interface and updated getChangesForVersion returning categorized object
- `src/lib/changelog.test.ts` - 4 unit tests covering shape, content, unknown version, and partial subsections
- `src/components/WhatsNewDialog.tsx` - Sectioned display, no Update button, single Got it button
- `src/App.tsx` - VersionChanges state type, null guard for fresh installs, hasAny check

## Decisions Made
- Mocked `CHANGELOG.md?raw` via `vi.mock()` in tests — Vite raw imports require this workaround in vitest
- Sections order: New, Fixed, Changes — mirrors priority from user perspective
- Used explicit `lastSeen === null` check (not `!lastSeen`) to distinguish null (no record) from empty string edge cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `CHANGELOG.md?raw` Vite raw import does not work natively in vitest — resolved by using `vi.mock()` with inline content matching real CHANGELOG.md, which is the standard vitest pattern for Vite-specific imports.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VersionChanges type flows through all three files with no TypeScript errors
- WhatsNewDialog sectioned display ready for visual polish (Phase 25 checkpoint)
- All 67 tests pass including new changelog tests

---
*Phase: 23-whats-new-modal*
*Completed: 2026-03-14*
