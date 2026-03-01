# Project Research Summary

**Project:** RecoDeck v1.1 Stabilization & Polish
**Domain:** Desktop DJ music library manager — Tauri v2 + React 19 + Rust
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

RecoDeck v1.0 shipped a feature-complete DJ library manager at ~26,500 LOC. The v1.1 milestone is not adding user-visible features — it is hardening what already exists: closing tech debt, establishing a test baseline, polishing the UI to a consistent standard, and performing a QA pass across the audio pipeline and mobile PWA. Research was conducted via direct codebase inspection rather than web sources, giving unusually high confidence across all four areas.

The recommended approach is a strict phase ordering driven by dependency analysis: tech debt elimination first (it unblocks everything else), then Rust test coverage (using infrastructure already present — `Database::new_in_memory()`, `detect_*_from_samples()`, `tempfile` in dev-deps), then frontend test coverage (requires Vitest setup with a global Tauri IPC mock), then UI/UX polish, and finally an architecture cleanup pass. This order is non-negotiable: the architecture cleanup phase has the highest regression risk and must execute only after test coverage is in place to catch regressions.

The top risks for this milestone are not technical unknowns — they are execution traps with known solutions. Specifically: attempting to unit-test Tauri command functions directly (they require a live runtime and will panic), running Vitest without mocking `@tauri-apps/api/core` globally (every test fails with `ReferenceError: __TAURI_IPC__`), and treating the `App.tsx` refactor as a simple extract without regression tests in place first. All three have clear prevention strategies documented in PITFALLS.md.

## Key Findings

### Recommended Stack

The existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, Framer Motion 11, tanstack/react-query v5) is validated and not changed for v1.1. The only additions are tooling: **Vitest 3** + **React Testing Library 16** + **jsdom 26** for frontend tests (chosen over Jest because the project uses Vite 7 with `"type": "module"` — Vitest reuses the existing Vite config with zero extra transform setup), and **ESLint 9** (flat config) + **typescript-eslint v8** + **Prettier 3** for code quality enforcement. No new Rust crates are needed — `tempfile` is already in dev-deps and `Database::new_in_memory()` already exists.

Framer Motion 11.18.2 is already installed and used in all 6 AI components. The v1.1 UI polish work is applying the already-installed library consistently to Player, MiniPlayer, TrackTable, and Notification components — zero new dependencies required.

**Core technologies added for v1.1:**
- **Vitest 3 + RTL 16**: Frontend unit and component testing — native Vite integration, handles ESM without extra config
- **@testing-library/jest-dom 6**: DOM assertion matchers compatible with Vitest via the vitest adapter
- **ESLint 9 (flat config)**: TypeScript + React Hooks lint rules — `exhaustive-deps` catches real bugs; Biome/oxlint lack this rule
- **typescript-eslint v8**: Single package replaces old `@typescript-eslint/eslint-plugin` + parser split
- **Prettier 3**: Formatting enforcer; configured alongside ESLint via `eslint-config-prettier` to prevent rule conflicts

**Version note:** Vitest 3 and typescript-eslint v8 version numbers come from training knowledge (cutoff Aug 2025), not live verification. Confirm with `npm info vitest version` before installing.

### Expected Features

Research is grounded in v1.0's shipped codebase, not speculation. The v1.1 feature scope is firmly bounded to stabilization.

**Must have (table stakes — missing = product feels unfinished):**
- Rust unit tests for `db/mod.rs` CRUD beyond the 4 existing tests (playlist, analysis, migration idempotency)
- Rust unit tests for `audio/bpm.rs` and `audio/key.rs` using `detect_*_from_samples()` with synthetic signals
- Rust unit tests for `ai/context_builder.rs` (pure data transformation, zero I/O)
- Remove duplicated `audio_mime_type` function (exists in both `lib.rs:66` and `server/streaming.rs:214`)
- Remove `greet` scaffold stub from `lib.rs` (registered in `invoke_handler!` but never called from frontend)
- Fix `aiStore.ts` catch blocks: currently uses `instanceof Error` which returns false for structured `AppError` objects — users see `[object Object]` instead of actionable messages
- Vitest setup + tests for `src/lib/musicUtils.ts` (`getKeyCompatibility`, `getBpmIssue` — pure functions, zero mocking needed)

**Should have (differentiators for this stabilization pass):**
- Zustand store unit tests for `playerStore.ts` and `aiStore.ts` action logic
- ESLint 9 + Prettier configured with `package.json` scripts (`lint`, `format`, `format:check`)
- Empty state components for track table, search results, and empty playlists
- Framer Motion consistency applied to Settings modal, notification toast, and panel transitions
- CSS variable audit: eliminate hardcoded hex colors in `.css` files; Dawn light theme is highest contrast-failure risk
- Error message review: map all `AppError` variants to human-readable frontend strings

**Defer to v2+:**
- Loudness (LUFS) analysis — requires significant audio pipeline work; BPM remains as energy proxy
- End-to-end Tauri tests (WebDriver/Playwright) — Tauri v2 WebDriver is experimental; E2E adds full build pipeline cost per test run
- Full WCAG accessibility audit — disproportionate for current audience size
- Storybook component catalog — maintenance overhead for a single-developer project
- `criterion` Rust benchmarks — no identified performance problem; premature optimization
- `cargo-tarpaulin` Rust coverage — macOS support is partial; `cargo test` output is sufficient

### Architecture Approach

RecoDeck's architecture is a Tauri v2 process hosting both a React WebView (IPC via `invoke()`) and an embedded Axum HTTP server (port 8384, serving the mobile PWA over LAN). The overall structure is sound and well-organized. The v1.1 work is cleaning known warts rather than restructuring the foundation. The most significant structural issue is `App.tsx` as a monolithic state hub (~600+ lines, ~15 `useState` declarations) that prop-drills AI panel state — but this refactor is correctly deferred to Phase 5, after tests are in place to catch regressions.

**Major components and their v1.1 touch points:**
1. **`db/mod.rs`** — expand existing `#[cfg(test)]` coverage; CRUD and migration idempotency
2. **`audio/bpm.rs` + `audio/key.rs`** — expand existing test modules; pure function tests already have the right signature
3. **`commands/*.rs`** — thin shells over domain logic; extract pure functions for testability, don't test command wrappers directly
4. **`src/lib/musicUtils.ts`** — highest-priority frontend test target; already pure TypeScript with no Tauri dependency
5. **`src/store/playerStore.ts` + `aiStore.ts`** — testable in isolation via Zustand's `create()` pattern
6. **`App.tsx`** — leave structural refactor for Phase 5; focus Phase 4 polish on individual component animations

**Patterns established in v1.0 that must be preserved:**
- AppState lock pattern: acquire, use, drop within synchronous scope — never hold across async boundaries
- DTO separation: `Track` (DB struct, not Serialize) → `TrackDTO` (Serialize, crosses IPC boundary)
- AppError propagation: `?` with `.map_err()` — no `unwrap()` in command handlers
- Frontend error handling: `isAppError()` type guard + `getErrorMessage()` — never `instanceof Error` for Tauri errors

### Critical Pitfalls

1. **Tauri commands cannot be unit-tested directly** — `State<AppState>` requires a live Tauri runtime; tests that call `#[tauri::command]` functions panic at runtime. Prevention: extract pure domain functions from command handlers and test those. Commands are thin shells that extract state, call pure functions, return results.

2. **Vitest setup requires a global Tauri IPC mock** — importing anything that transitively imports `@tauri-apps/api/core` in tests fails with `ReferenceError: __TAURI_IPC__`. Prevention: add `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))` to a global `vitest.setup.ts` file referenced in `vitest.config.ts`. This must be done before writing a single frontend test.

3. **`isAppError`/`getErrorMessage` must not be deleted** — they appear unused to static analysis but are called in catch blocks across all 3 AI components. Deletion silently degrades all AI error messages to "An unexpected error occurred." Prevention: migrate to `src/lib/errors.ts` (not delete); verify all 4 call sites before changing.

4. **`audio_mime_type` consolidation must preserve a pure free function** — the `register_uri_scheme_protocol` closure requires `'static` lifetime. If the extracted function captures any state, it will fail to compile. Prevention: extract as `pub(crate) fn audio_mime_type(path: &str) -> &'static str` with no captures to `src-tauri/src/audio/mime.rs`.

5. **TailwindCSS 4 purges dynamically constructed class names in production** — `` `text-${color}-500` `` works in dev but disappears after `tauri build`. Prevention: use complete class strings in source; use `style={{ color }}` for runtime DB-driven colors (genre colors).

## Implications for Roadmap

All four research files converge on the same phase structure. ARCHITECTURE.md provides the dependency analysis; FEATURES.md provides the prioritized work list; PITFALLS.md provides the order-sensitive warnings; STACK.md provides the tooling additions.

### Phase 1: Tech Debt Elimination

**Rationale:** Identified tech debt items are small, well-defined, and unblock everything else. Clean state before adding tests. Errors surfaced here (duplicate functions, dead code) will interfere with accurate test coverage if left in place.

**Delivers:** A clean codebase baseline — no dead code, no duplicate functions, no broken error paths.

**Addresses:** Removal of `greet` stub, `audio_mime_type` consolidation, orphaned `/api/tracks/{id}` route decision, `isAppError` migration to shared location, unused frontend type guards.

**Avoids:**
- Pitfall 3 (audio_mime_type refactor breaking stream protocol closure) — do this first in isolation
- Pitfall 2 (deleting `isAppError`/`getErrorMessage`) — migrate before tests are written that depend on them
- Pitfall 4 (orphaned route returning stale data) — grep mobile PWA before deleting

**Research flag:** No research needed. All items are identified and bounded.

### Phase 2: Rust Test Coverage

**Rationale:** Rust test infrastructure is already in place (`Database::new_in_memory()`, `detect_*_from_samples()`, `tempfile` in dev-deps). Rust tests are higher-ROI than frontend tests because the audio analysis logic is harder to manually verify and regressions are catastrophic (silent wrong BPM/key).

**Delivers:** Test coverage for `db/mod.rs` CRUD + migrations, `audio/bpm.rs` synthetic signal tests, `audio/key.rs` Camelot mapping, `ai/context_builder.rs` JSON shape tests.

**Uses:** No new Rust crates — `#[cfg(test)]`, `tempfile`, `Database::new_in_memory()` already available.

**Avoids:**
- Pitfall 1 (testing Tauri commands directly) — test pure domain functions only
- Pitfall 6 (using `rusqlite::open_in_memory()` directly) — use `Database::new()` via `tempfile::NamedTempFile` to get migrations applied
- Pitfall 11 (Mutex lock scope during refactoring) — preserve strict acquire-use-drop pattern

**Research flag:** No research needed. Patterns are established in the codebase.

### Phase 3: Frontend Test Coverage

**Rationale:** Depends on Phase 1 (tech debt cleanup removes the ambiguity about which type guards are live). Frontend test setup requires a global Tauri IPC mock configured before writing any test — this is a one-time setup step that all subsequent tests depend on.

**Delivers:** Vitest 3 configured with global Tauri mock, tests for `musicUtils.ts` (pure functions, zero mocking), tests for `playerStore.ts` and `aiStore.ts` store action logic.

**Uses:** Vitest 3, @testing-library/react 16, jsdom 26, @testing-library/jest-dom 6.

**Avoids:**
- Pitfall 5 (Tauri IPC not available in Node) — global `vi.mock('@tauri-apps/api/core')` in setup file before any test runs
- Pitfall 14 (`noUnusedParameters` breaking mock stubs) — use `_` prefix convention for unused mock parameters

**Research flag:** Verify Vitest 3 exact version compatibility with Vite 7 before installing. Run `npm info vitest version`.

### Phase 4: UI/UX Polish

**Rationale:** No dependencies on test coverage but benefits from tech debt being resolved first (CSS variable audit is cleaner without duplicate functions obscuring module boundaries). Component-level polish is self-contained and can be parallelized across components.

**Delivers:** Consistent Framer Motion animations across all panels, empty state components, CSS variable coverage (no hardcoded hex), human-readable error messages for all `AppError` variants, ESLint + Prettier configured.

**Uses:** Framer Motion 11.18.2 (already installed), ESLint 9, typescript-eslint v8, Prettier 3.

**Avoids:**
- Pitfall 7 (TailwindCSS 4 purging dynamic classes) — use complete class strings; inline style for DB-driven colors
- Pitfall 8 (Player dual-mode audio architecture) — read `audioPlayer.ts` in full before adding Player UI polish; test OGG playback specifically
- Pitfall 12 (virtualizer estimateSize re-renders) — wrap `estimateSize` in `useCallback` before changing track table row heights

**Research flag:** No research needed. Framer Motion patterns are established in the AI components.

### Phase 5: Architecture Cleanup

**Rationale:** Highest regression risk of all phases. Extracting library state from `App.tsx` to a `libraryStore` and AI panel state from prop-drilling to `aiStore` will touch almost every component. Must execute only after Phases 2 and 3 provide a test baseline to catch regressions.

**Delivers:** Reduced `App.tsx` from ~600 lines to a routing/layout coordinator; AI panel state moved out of prop drilling into `aiStore`; library state (tracks, folders, pagination) in a dedicated `libraryStore`.

**Avoids:**
- Pitfall 9 (Zustand subscriptions in React 19 Strict Mode) — audit every `useEffect` + `listen()` pair for cleanup functions before restructuring
- Pitfall 11 (Mutex lock scope) — any Rust-side refactoring during this phase must preserve lock acquire-use-drop discipline

**Research flag:** No additional research needed. Architecture patterns are established. However, this phase should run a full manual regression across all features before marking complete.

### Phase Ordering Rationale

- **Phase 1 before everything:** Tech debt items are the only prerequisite-free work. `audio_mime_type` consolidation must happen before any test tries to test `lib.rs`. `isAppError` migration must happen before frontend tests are written.
- **Phase 2 before Phase 3:** Rust tests validate the backend contract that frontend tests will mock. Understanding what the backend actually returns (via reading tests) informs how to write correct frontend mocks.
- **Phase 3 before Phase 5:** The architecture cleanup has the highest regression surface. Frontend tests catch store migration regressions. Without Phase 3 coverage, Phase 5 is high-risk.
- **Phase 4 in parallel with Phase 3:** UI polish has no dependency on test coverage and can be executed in parallel if resources allow. However, Player polish must be deferred until `audioPlayer.ts` dual-mode architecture is understood.
- **Phase 5 last:** Structural refactor. Highest risk, requires all previous phases as safety net.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Frontend Test Coverage):** Verify exact Vitest 3 + Vite 7 version compatibility before installing. Check Zustand v5.0.11 test helper API — `store.setState(initialState)` is the expected reset pattern but verify against v5 docs.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Tech Debt):** All items are identified and bounded. No unknowns.
- **Phase 2 (Rust Tests):** Patterns are established in existing `#[cfg(test)]` modules. Expand volume, not pattern.
- **Phase 4 (UI Polish):** Framer Motion patterns are established in AI components. CSS variable audit is manual inspection.
- **Phase 5 (Architecture):** Zustand patterns are well-documented; the specific extractions are identified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack inspected directly. New additions (Vitest, ESLint) are training knowledge — exact versions should be verified before installation |
| Features | HIGH | Derived from `PROJECT.md` named tech debt items + direct code inspection. All items are confirmed real, not speculative |
| Architecture | HIGH | 100% from direct code inspection of all `src-tauri/src/**/*.rs` and `src/**/*.{ts,tsx}` files |
| Pitfalls | HIGH | Tauri v2 runtime constraints are well-established; codebase-specific pitfalls confirmed by code inspection (54 `eprintln!` calls counted, dual audio mode confirmed in `audioPlayer.ts`) |

**Overall confidence:** HIGH

### Gaps to Address

- **Vitest version compatibility:** Training data places Vitest 3 as the current major for Vite 7 projects, but this should be confirmed with `npm info vitest version` before Phase 3 begins. If Vitest 2.x is the actual current version, update the install command accordingly.
- **Zustand v5 test helper API:** `store.setState(initialState)` is the documented reset pattern but was not verified against the exact v5.0.11 API in this research session. Verify before writing the first store test.
- **Mobile PWA `/api/tracks/{id}` usage:** The orphaned route decision (delete vs fix) requires checking the `mobile/` directory for any `fetch('/api/tracks/' + id)` calls. This cannot be resolved without access to the mobile PWA source; must be done in Phase 1.
- **Dawn theme contrast failures:** The CSS variable audit finding (hardcoded hex risk in Dawn light theme) is high-probability based on the three-theme structure but was not confirmed by actually running a grep this session. Phase 4 must start with `grep -r '#[0-9a-fA-F]\{3,6\}' src/styles/` to get a real count.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src-tauri/src/db/mod.rs` — `Database::new_in_memory()`, existing `#[cfg(test)]` modules, CRUD patterns
- `src-tauri/src/audio/bpm.rs`, `key.rs` — `detect_*_from_samples()` signatures, existing test modules
- `src-tauri/src/ai/context_builder.rs`, `claude_client.rs` — pure function separation, existing tests
- `src-tauri/src/lib.rs` — `greet` stub, `audio_mime_type` duplicate, stream:// protocol handler, 54 `eprintln!` calls
- `src-tauri/src/server/streaming.rs` — second `audio_mime_type` copy, lock usage
- `src-tauri/src/commands/library.rs` — `AppState` definition, `Mutex<Option<Database>>` lock pattern
- `src-tauri/Cargo.toml` — `tempfile` in dev-deps confirmed at line 50
- `src/lib/musicUtils.ts` — pure function structure confirmed (no Tauri imports)
- `src/lib/audioPlayer.ts` — dual-mode (html/native) architecture, `_loadGeneration` counter
- `src/store/playerStore.ts`, `aiStore.ts` — Zustand store structure, `instanceof Error` bug in `aiStore`
- `src/types/ai.ts` — `isAppError()` and `getErrorMessage()` definitions and 4 call sites
- `package.json` — no test runner in devDependencies confirmed; Framer Motion 11.18.2 confirmed
- `.planning/PROJECT.md` — v1.1 goals, named tech debt items

### Secondary (MEDIUM confidence — training knowledge, cutoff Aug 2025)
- Vitest 3 + React Testing Library 16 — current major versions at time of research; verify before install
- ESLint 9 flat config + typescript-eslint v8 — current majors; verify before install
- Zustand v5 test helper API — well-established pattern; verify against v5.0.11 docs

### Tertiary (MEDIUM confidence — Tauri v2 runtime behavior)
- `tauri::State` requires live Tauri context for tests — confirmed from Tauri v2 documentation knowledge
- Tauri WebDriver experimental status in v2 — confirmed from training knowledge; check Tauri changelog if E2E is considered for v2+

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
