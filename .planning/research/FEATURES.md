# Feature Landscape

**Domain:** Stabilization & Polish — Tauri v2 desktop DJ music library app
**Researched:** 2026-03-01
**Confidence note:** Research derived from codebase inspection + training knowledge (cutoff Aug 2025). Web search unavailable this session. Confidence levels reflect source quality.

---

## Context: What Already Exists

RecoDeck v1.0 shipped a full-featured DJ library manager with ~26,500 LOC. The v1.1 milestone is not adding user-visible features — it is hardening what exists. Features in scope:

- Fix known tech debt (duplicated `audio_mime_type`, orphaned route, unused type guards)
- Code quality pass (architecture cleanup, error handling consistency, perf)
- UI/UX polish (spacing, colors, animations, consistency)
- Test coverage (Rust backend priority, then frontend)

---

## Table Stakes

Features users expect from a stabilization pass. Missing = product feels unfinished or regresses.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Rust unit tests for pure logic modules | `bpm.rs`, `key.rs`, `context_builder.rs` all have logic separated from I/O — this is the ideal test target. Basis already exists: `db/mod.rs` has `#[cfg(test)]` with `new_in_memory()` pattern. | Low–Medium | `detect_bpm_from_samples()` and `detect_key_from_samples()` accept `MonoAudio` directly — no file I/O needed. `tempfile` already in `[dev-dependencies]`. |
| DB layer test coverage | CRUD for Track, Playlist, TrackAnalysis, GenreDefinition. Migration idempotency. | Low | `Database::new_in_memory()` already exists. Pattern established in existing test module. No new infrastructure required. |
| Remove duplicated `audio_mime_type` | Two copies exist (likely in `server/routes.rs` and `server/streaming.rs`). Single source of truth should live in one helper. | Low | Straightforward consolidation — extract to shared `fn mime_from_path()` in `server/mod.rs`. |
| Remove orphaned mobile server route | PROJECT.md mentions an orphaned route in the companion server. Dead code = confusion and maintenance risk. | Low | Identify, confirm unused, delete. Rust's dead_code lint may already flag it. |
| Fix unused type guards in frontend | TypeScript type guard functions that are defined but never called. | Low | Grep for `is[A-Z]` functions in `types/` or `lib/`. Remove or use them. |
| Error message consistency | Mix of raw Rust strings, user-facing messages, and debug details in `AppError` variants. UI should show human-readable text, not "Database error: no such column". | Medium | Frontend `getErrorMessage()` in `types/ai.ts` exists — extend pattern to all error kinds. Review each `AppError` variant for user-facing clarity. |
| Consistent loading states | Large operations (library scan, AI analysis, batch BPM) show progress — but smaller operations (single track analysis, genre assignment) may show nothing. | Low–Medium | Audit each async IPC call path in the frontend. Add skeleton/spinner where missing. |
| TypeScript strict null coverage | React 19 + TS 5.8 — `tsconfig.json` strict mode behavior. Optional fields on Track/TrackDTO may cause null-access issues. | Low | Check `tsconfig.json` for `strictNullChecks`. Fix any `?.` chains that are inconsistent. |

---

## Differentiators

Features that set this stabilization pass apart from "just fixing bugs." Valuable but not blocking.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Vitest test setup for frontend pure logic | `musicUtils.ts` (`getKeyCompatibility`, `getBpmIssue`) is pure TypeScript — perfect first target for Vitest. No Tauri mocking needed. | Low | Add `vitest` + `@vitest/ui` to devDeps. No jsdom needed for pure logic tests. `vite.config.ts` already exists — add `test` config block. |
| Zustand store unit tests | `playerStore.ts` has well-defined actions (`playNext`, `playPrevious`, shuffle toggle). Can be tested with `zustand`'s built-in test helpers without mounting React components. | Low–Medium | Use `createStore` in test context. Reset state between tests with `store.setState(initialState)`. |
| Keyboard shortcut audit | DJ apps live at the keyboard. Space to play/pause, arrow keys for seek, J/K for prev/next — ensure these work consistently even when focus is in the sidebar or playlist panel. | Low | Identify existing keyboard handlers. Verify they work regardless of focus element via `keydown` on `document` or `window`. |
| Animation consistency via Framer Motion | MixPrepPanel uses `framer-motion` (already a dep). Other panels and modals may use raw CSS transitions or no animation. | Medium | Audit panel mount/unmount animations. Apply `<AnimatePresence>` + `motion.div` to Settings, AI dialogs, and notification toast. Unify easing curves to `easeOut` / `spring` family. |
| Empty state polish | Track table with 0 results (empty library, search returns nothing, playlist empty) shows nothing. Empty states with a helpful message and CTA significantly improve first-run experience. | Low | Add `EmptyState` component with contextual messages: "Add a folder to start" vs "No tracks match your search" vs "This playlist is empty". |
| Waveform/progress bar seek accuracy | The custom `stream://` protocol with HTML5 Audio seek is known-tricky (see `audioPlayer.ts` 80+ lines of seek/crossfade handling). Verify seek clicks land on the correct position. | Medium | Manual testing across MP3, FLAC, OGG. Check `_isSeeking` guard logic. Confirm metadata duration fallback works. |
| Mobile PWA polish | QR connect flow works but mobile UI may have spacing or tap-target issues not visible on desktop. | Medium | Test on actual phone. Fix tap target sizes (minimum 44x44px per Apple HIG). Check overflow behavior on small screens. |
| CSS variable coverage for themes | Three themes exist (Midnight, Carbon, Dawn) + custom. Audit that every color in `.css` files uses `var(--*)` rather than hardcoded hex. Dawn (light) theme is highest risk for contrast failures. | Medium | Grep for hex codes in `*.css`. Map each to the closest semantic variable. |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| End-to-end Tauri tests (WebDriver/Playwright) | Tauri v2 WebDriver integration is experimental, platform-specific, and requires a running Tauri binary. Setup cost is high; coverage value for this codebase size is low. Not worth doing before unit coverage exists. | Unit test pure Rust logic with `cargo test`. Unit test pure TypeScript with Vitest. Manual regression testing for integration paths. |
| React Testing Library component tests | Components (`Player.tsx`, `TrackTable.tsx`) are deeply coupled to the `audioPlayer` singleton, `tauriApi` IPC calls, and `usePlayerStore`. Mocking all of these is high-effort, fragile, and tests implementation not behavior. Vitest component tests are net-negative ROI here. | Test pure utility functions. Test Zustand store logic in isolation. Reserve component tests for the 2-3 simplest, most self-contained components. |
| 100% code coverage target | Coverage metrics incentivize testing trivial getters and discourages testing hard logic. Pursuing 100% will result in tests that check `track.title === "Test Track"` not "does BPM detection return a plausible value for a known signal". | Set a quality bar, not a percentage bar. Prefer behavior tests for the `bpm`, `key`, `db`, and `musicUtils` modules. |
| Accessibility audit (full WCAG) | The app targets a small group of DJ friends (personal use expanding to small community). Full WCAG compliance is significant work with diminishing returns for this audience. | Fix obvious issues (focus rings, empty alt text on images). Don't do a full audit. |
| Storybook component library | Storybook adds a build system, a separate dev server, and ongoing maintenance. For 26,500 LOC with one developer, this is overhead without payoff. | Use the app itself for visual inspection. Document component APIs with TypeScript props interfaces. |
| Loudness analysis (LUFS) | Noted in PROJECT.md as "BPM used as energy proxy — revisit later". Adding LUFS analysis requires significant audio pipeline work and would be a new feature, not a stabilization task. | Keep BPM as energy proxy for v1.1. Flag loudness for v2+. |
| New UI views or panels | v1.1 is polish, not feature development. No new routes, views, or panels. | Polish existing panels (MixPrepPanel, RecommendationsPanel, AIPlaylistDialog). Don't add new ones. |

---

## Feature Dependencies

```
Tech debt cleanup → Everything else
  └─ Remove orphaned route → cleaner server module → easier server tests later
  └─ Fix type guards → TS strict mode → safer null handling

Rust unit test setup → Rust test coverage
  └─ tempfile already in dev-deps (no new setup for file-based tests)
  └─ new_in_memory() already works (no new setup for DB tests)
  └─ detect_bpm_from_samples() / detect_key_from_samples() — I/O separated (no new refactor needed)

Vitest setup → Frontend unit tests
  └─ vite.config.ts already exists (add test block, no new config file)
  └─ musicUtils.ts is pure logic (no mocking needed for first tests)
  └─ playerStore.ts testable without mounting React

CSS variable audit → Theme consistency
  └─ Dawn light theme most likely to have hardcoded hex or contrast failures

Animation consistency → requires Framer Motion (already installed)
  └─ MixPrepPanel pattern already established — replicate to other panels

Empty state polish → no dependencies, standalone
Keyboard shortcut audit → no dependencies, standalone
```

---

## MVP Recommendation for v1.1

This is a stabilization milestone. Prioritize in this order:

**Phase 1 — Tech Debt (complete these first, unblock other work)**
1. Remove duplicated `audio_mime_type` function
2. Remove orphaned mobile server route
3. Fix unused frontend type guards

**Phase 2 — Test Coverage (highest ROI, leverage existing infrastructure)**
1. Rust unit tests for `db/mod.rs` CRUD beyond the 4 existing tests (playlist CRUD, analysis CRUD, migration idempotency)
2. Rust unit tests for `bpm.rs` using `detect_bpm_from_samples()` with synthetic signals (sine wave, silence, impulse train)
3. Rust unit tests for `key.rs` using `detect_key_from_samples()` with known pitch distributions
4. Rust unit tests for `ai/context_builder.rs` (pure data transformation, no I/O)
5. Vitest setup + tests for `musicUtils.ts` (Camelot compatibility, BPM issue detection)
6. Vitest tests for `playerStore.ts` action logic (queue management, shuffle, repeat modes)

**Phase 3 — UI/UX Polish**
1. Empty state components for track table, search, and playlists
2. CSS variable audit (eliminate hardcoded hex, fix Dawn theme contrast)
3. Animation consistency (Framer Motion on Settings modal, notification toast)
4. Error message review (all `AppError` kinds → user-readable frontend messages)

**Phase 4 — QA Validation**
1. Keyboard shortcut audit
2. Waveform seek accuracy cross-format manual testing
3. Mobile PWA tap-target audit

**Defer:**
- Loudness (LUFS) analysis — v2+
- E2E tests — v2+ when the app is more stable
- Full WCAG audit — not justified for current audience size

---

## Confidence Assessment by Area

| Area | Confidence | Notes |
|------|------------|-------|
| Tech debt items (duplicated function, orphaned route) | HIGH | PROJECT.md explicitly names these; code structure confirms they're real |
| Rust test infrastructure readiness | HIGH | `new_in_memory()`, `detect_*_from_samples()`, `tempfile` all exist — no setup needed |
| Vitest for pure TypeScript | HIGH | Vitest is the standard Vite-native test runner; `musicUtils.ts` is provably pure |
| Zustand store testing patterns | MEDIUM | Zustand v5 (installed) has `create()` for testing — pattern is well-established but not verified against the exact v5.0.11 API from official docs this session |
| Component testing being low-ROI | HIGH | The coupling to `audioPlayer` singleton, `tauriApi`, and global store is confirmed by code inspection |
| Animation consistency recommendations | MEDIUM | Framer Motion dep confirmed; specific `AnimatePresence` API details from training data only |
| E2E testing being premature | HIGH | Tauri WebDriver status confirmed as experimental in v2; the ROI argument is project-specific judgment |
| CSS variable coverage | MEDIUM | Three themes confirmed; hex-in-CSS risk is high probability but exact count not verified (no grep run this session) |

---

## Sources

- Codebase inspection (HIGH confidence): `src-tauri/src/db/mod.rs`, `src-tauri/src/audio/bpm.rs`, `src-tauri/src/audio/key.rs`, `src-tauri/src/ai/context_builder.rs`, `src-tauri/src/error.rs`, `src/lib/musicUtils.ts`, `src/store/playerStore.ts`, `src/styles/globals.css`, `package.json`, `Cargo.toml`
- `.planning/PROJECT.md` (HIGH confidence): named tech debt items, v1.1 goals, constraints
- Training knowledge — Vitest, Zustand testing, Framer Motion, Tauri v2 testing landscape (MEDIUM confidence, knowledge cutoff Aug 2025)
- Note: WebSearch and WebFetch were unavailable this session. Claims about library APIs (Vitest `test` config, Zustand v5 test helpers) should be verified against official docs before implementation.
