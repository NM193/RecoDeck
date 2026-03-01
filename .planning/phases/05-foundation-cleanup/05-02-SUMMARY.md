---
phase: 05-foundation-cleanup
plan: 02
subsystem: tooling
tags: [eslint, prettier, typescript-eslint, linting, formatting, dead-code-removal]

# Dependency graph
requires:
  - phase: 05-01
    provides: AI error handling and audio_mime_type consolidation (foundation for clean codebase)
provides:
  - ESLint 9 flat config with typescript-eslint, react-hooks, react-refresh, eslint-config-prettier
  - Prettier 3 config (singleQuote, no semi, tabWidth:2, trailingComma:all)
  - npm scripts: lint, lint:fix, format, format:check
  - Zero dead code: greet stub and orphaned /api/tracks/{id} route removed
  - Zero ESLint errors across all frontend files
  - Consistent Prettier formatting across src/ and mobile/
affects: [phase-06, all future phases]

# Tech tracking
tech-stack:
  added:
    - eslint@9.x (flat config)
    - typescript-eslint@8.x
    - prettier@3.x
    - eslint-config-prettier@10.x
    - eslint-plugin-react-hooks@7.x
    - eslint-plugin-react-refresh@0.5.x
  patterns:
    - ESLint 9 flat config (eslint.config.js, not .eslintrc)
    - Prettier singleQuote/no-semi style enforced across all TS/TSX files
    - eslint-disable-next-line for intentional React patterns (set-state-in-effect, immutability)

key-files:
  created:
    - eslint.config.js
    - .prettierrc
    - .prettierignore
  modified:
    - package.json (lint/lint:fix/format/format:check scripts added)
    - src-tauri/src/lib.rs (greet function and registration removed)
    - src-tauri/src/server/routes.rs (orphaned /api/tracks/{id} route and get_track handler removed)
    - src/lib/http-api.ts (httpApi.getTrack() method removed)
    - src/lib/audioPlayer.ts (any types replaced with typed alternatives)
    - src/components/AnalysisProgress.tsx (eslint-disable for intentional set-state-in-effect)
    - src/components/PromptModal.tsx (eslint-disable for intentional set-state-in-effect)
    - mobile/App.tsx (eslint-disable for intentional DOM mutation pattern)
    - mobile/components/MobilePlayer.tsx (eslint-disable for intentional DOM mutation pattern)
    - All src/**/*.ts, src/**/*.tsx, mobile/**/*.ts, mobile/**/*.tsx (Prettier formatted)

key-decisions:
  - "ESLint 9 flat config used (eslint.config.js) over legacy .eslintrc — avoids deprecation and works with type:module"
  - "tseslint.configs.recommended (not recommendedTypeChecked) to avoid requiring parserOptions.project — type-aware rules deferred to Phase 6"
  - "react-hooks/immutability disabled at file level for mobile files — audio is HTMLAudioElement stored in useState for stable identity; .src/.pause()/.play() are DOM mutations, not React state mutations"
  - "react-hooks/set-state-in-effect disabled inline for AnalysisProgress/PromptModal — synchronous state resets on condition change are intentional patterns, not cascading render issues"
  - "no-explicit-any fixed with Object.assign pattern and typed casts — avoids losing type info while satisfying linter"

patterns-established:
  - "ESLint disable comments must include rationale explaining why the violation is intentional"
  - ".prettierignore excludes src-tauri (rustfmt handles Rust), *.md (markdown formatting varies), mobile/dist, node_modules"

requirements-completed: [DEBT-03, DEBT-04, QUAL-01, QUAL-02, QUAL-03]

# Metrics
duration: 35min
completed: 2026-03-01
---

# Phase 5 Plan 02: Foundation Cleanup — Dead Code + ESLint/Prettier Summary

**ESLint 9 flat config + Prettier 3 with zero errors across all frontend files, greet stub and orphaned /api/tracks/{id} route eliminated**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-01T12:30:00Z
- **Completed:** 2026-03-01T13:05:00Z
- **Tasks:** 3
- **Files modified:** 55+

## Accomplishments
- Removed greet() Rust stub and its invoke_handler registration from lib.rs
- Removed orphaned /api/tracks/{id} route and get_track() handler from server/routes.rs
- Removed httpApi.getTrack() from http-api.ts; no consumers found in any frontend/mobile file
- Installed ESLint 9 + Prettier 3 + all plugins as devDependencies
- Created eslint.config.js (flat config), .prettierrc, .prettierignore
- Added lint, lint:fix, format, format:check scripts to package.json
- Formatted all 50+ src/ and mobile/ files with Prettier — consistent style enforced
- Fixed all 10 ESLint errors: replaced 3 `any` types in audioPlayer.ts with typed alternatives, added targeted eslint-disable comments for 4 intentional React patterns
- Final state: 0 errors, 12 warnings (all warn-level, all acceptable)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove greet command and orphaned /api/tracks/{id} route** - `b175e72` (fix)
2. **Task 2: Install and configure ESLint 9 + Prettier 3, add npm scripts** - `224a264` (chore)
3. **Task 3: Run full lint and format pass to achieve zero errors** - `d1b2a0c` (style)

## Files Created/Modified
- `eslint.config.js` - ESLint 9 flat config with typescript-eslint, react-hooks, react-refresh, prettier
- `.prettierrc` - Prettier config: semi:false, singleQuote:true, tabWidth:2, trailingComma:all
- `.prettierignore` - Excludes src-tauri, dist, mobile/dist, node_modules, *.md
- `package.json` - Added lint/lint:fix/format/format:check scripts, ESLint+Prettier devDependencies
- `src-tauri/src/lib.rs` - greet() function and invoke_handler registration removed
- `src-tauri/src/server/routes.rs` - /api/tracks/{id} route and get_track() handler removed
- `src/lib/http-api.ts` - httpApi.getTrack() method removed; Prettier formatted
- `src/lib/audioPlayer.ts` - 3 `any` types replaced; Prettier formatted
- `src/components/AnalysisProgress.tsx` - eslint-disable for intentional set-state-in-effect
- `src/components/PromptModal.tsx` - eslint-disable for intentional set-state-in-effect
- `mobile/App.tsx` - File-level eslint-disable for react-hooks/immutability (HTMLAudioElement DOM mutations)
- `mobile/components/MobilePlayer.tsx` - File-level eslint-disable for react-hooks/immutability

## Decisions Made
1. Used `tseslint.configs.recommended` not `recommendedTypeChecked` — avoids requiring `parserOptions.project`, type-aware rules can be enabled in Phase 6
2. `react-hooks/immutability` disabled at file level for mobile files — `audio` created via `useState(() => new Audio())` for stable identity; mutating `.src`/`.pause()`/`.play()` is DOM manipulation, not React state mutation. This is a known false-positive from the compiler plugin
3. `react-hooks/set-state-in-effect` disabled inline — `setElapsedTime(0)` in AnalysisProgress and `setValue(defaultValue)` in PromptModal are intentional synchronous resets on condition change, not cascading render issues
4. `no-explicit-any` fixed by replacing `const error: any = new Error(...)` with `Object.assign(new Error(msg), { code })` and `(e as { code?: number })` cast pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `any` types in audioPlayer.ts beyond scope of lint auto-fix**
- **Found during:** Task 3 (lint run)
- **Issue:** Three `any` type annotations in audioPlayer.ts violated `@typescript-eslint/no-explicit-any`: `const error: any`, `catch (e: any)`, `catch (e2: any)`
- **Fix:** Replaced with `Object.assign(new Error(msg), { code })`, removed `: any` from catch clauses, added `(e as { code?: number })` type assertion for code access
- **Files modified:** src/lib/audioPlayer.ts
- **Verification:** `npm run lint` exits with 0 errors; `npx tsc --noEmit` passes
- **Committed in:** d1b2a0c (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type safety fix)
**Impact on plan:** Fix was necessary for correctness (eliminating unsafe any types). No scope creep.

## Issues Encountered
- Two files (Player.tsx, audioPlayer.ts) were reformatted by Prettier, then edited for ESLint fixes, causing Prettier formatting to be re-applied after edits. Resolved by running `npx prettier --write` on those files again before the format:check verification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation cleanup phase complete — codebase is now clean with enforced linting and formatting
- `npm run lint` and `npm run format:check` serve as quality gates for all future development
- Phase 6 (testing infrastructure) can proceed: Vitest + React Testing Library setup is unblocked
- Remaining warning items (react-hooks/exhaustive-deps, react-hooks/incompatible-library for TanStack Virtual) are candidates for Phase 6 attention if time permits

---
*Phase: 05-foundation-cleanup*
*Completed: 2026-03-01*
