# Domain Pitfalls

**Domain:** Stabilization & polish milestone for Tauri v2 + React 19 + Rust desktop app
**Project:** RecoDeck v1.1
**Researched:** 2026-03-01
**Confidence:** HIGH — based on direct codebase inspection + known Tauri/Rust/React patterns

---

## Critical Pitfalls

Mistakes that cause rewrites, regressions, or block shipping.

---

### Pitfall 1: Testing Tauri Commands Requires the Tauri Runtime — Unit Tests Cannot Invoke Them

**What goes wrong:** Developers try to write `#[test]` functions that call `#[tauri::command]` functions directly, passing a real `State<AppState>`. This compiles but panics at runtime because `State` extraction requires a live Tauri app context. The test binary crashes before running any assertions.

**Why it happens:** `tauri::State` is not a plain wrapper — it requires an `App` or `AppHandle` context to be valid. There is no simple mock. The `#[tauri::command]` macro transforms function signatures in ways that make direct invocation from test code fragile.

**Consequences:** Either no Rust backend tests at all (the current state — zero test files exist in this repo), or tests that silently pass without exercising the real command logic because developers extract the testable logic into a separate helper function they test instead.

**Prevention:** The correct pattern for this codebase is already partially in place in `audio/bpm.rs`: split the pure logic from the Tauri command shell. Commands in `src-tauri/src/commands/` should be thin shells that:
1. Extract data from `State`
2. Call a pure function in the domain module
3. Return the result

Test the pure domain functions (`detect_bpm_from_samples`, database methods on a real `Database` instance using `tempfile`, Camelot key logic in `key.rs`) — not the command wrappers.

**Detection:** If a `#[test]` calls a `#[tauri::command]`-decorated function with a `State<T>` argument, it will panic at runtime or fail to compile. The warning sign is any attempt to construct `tauri::State` directly in test code.

**Phase:** Test coverage phase. Architecture decision must be made before writing any command tests.

---

### Pitfall 2: Removing "Unused" isAppError / getErrorMessage Breaks Error UX Silently

**What goes wrong:** `isAppError` and `getErrorMessage` appear unused to static analysis because they are imported but only called inside `catch (e: unknown)` blocks. A cleanup pass that removes these functions leaves AI component error paths catching `unknown` and falling through to `'An unexpected error occurred'` for every structured error — even ones that previously showed actionable messages like "No API key configured."

**Why it happens:** The functions are defined in `src/types/ai.ts` and imported in `AIPlaylistDialog.tsx`, `RecommendationsPanel.tsx`, and `MixPrepPanel.tsx`. TypeScript's `noUnusedLocals` is set to `true` in `tsconfig.json`, but `catch (e: unknown)` with `getErrorMessage(e)` does count as a usage, so the import survives. The risk is in a refactor that replaces `getErrorMessage(e)` with a direct string fallback and then removes the now-truly-unused import without realizing the structured error handling was the whole point.

**Consequences:** AI error messages degrade from specific (`AiNoApiKey` → "No API key configured — add your Claude API key in Settings") to generic ("An unexpected error occurred"). The backend's tagged enum serialization (`{"kind":"AiNoApiKey"}`) is wasted. Users lose actionable guidance.

**Prevention:** Before removing these helpers, verify every `catch` block in every AI component. The correct cleanup is to *migrate* them to a shared `src/lib/errors.ts` location (not delete them) if moving them out of `src/types/ai.ts`. Add a comment in the source: `// Used in catch blocks — do not remove without checking AIPlaylistDialog, RecommendationsPanel, MixPrepPanel`.

**Detection:** grep for `getErrorMessage` and `isAppError` usage — 4 call sites across 3 components. If count drops below 4, a regression occurred.

**Phase:** Tech debt cleanup phase. Must verify continued use before any extraction/deletion.

---

### Pitfall 3: Consolidating audio_mime_type Into a Shared Module Breaks the Stream Protocol Handler

**What goes wrong:** `audio_mime_type` is duplicated between `src-tauri/src/lib.rs` (line 66) and `src-tauri/src/server/streaming.rs` (line 214). The natural fix is to extract it into a shared module (`crate::formats` or `crate::audio`). However, `lib.rs` defines this function inside a closure passed to `register_uri_scheme_protocol`. The closure has strict lifetime rules — it cannot capture references with lifetimes that outlive it. If the refactor naively moves `audio_mime_type` to a public location but the closure capture pattern changes, it will fail to compile or — worse — silently use a different code path after a merge conflict.

**Why it happens:** Rust's borrow checker enforces that closures capturing external references must outlive those references. The `register_uri_scheme_protocol` closure in Tauri 2 has `'static` lifetime requirements. A refactored helper that borrows state will not compile inside this closure.

**Consequences:** Compile error that blocks the entire build, or a working build that uses stale logic if someone copies the function incorrectly during merge.

**Prevention:** The correct refactor is to extract `audio_mime_type` to a new file (e.g., `src-tauri/src/audio/mime.rs`) as a free function with no captures, make it `pub(crate)`, and import it in both `lib.rs` and `streaming.rs`. The function signature `fn audio_mime_type(path: &str) -> &'static str` is safe because it only accesses the argument — no captured state. Test: `cargo build` must pass before and after the change.

**Detection:** If `cargo build` fails with lifetime/borrow errors after the refactor, the function is capturing something it shouldn't. The existing function signature is pure and stateless — preserve that property.

**Phase:** Tech debt cleanup phase. Do this first within the debt pass, before touching anything else in `lib.rs`.

---

### Pitfall 4: The Orphaned /api/tracks/{id} Route Returns Stale Data Without Analysis Fields

**What goes wrong:** `routes.rs` registers `/api/tracks/{id}` (line 131) and its handler `get_track` (line 239) calls `db.get_track(id)` which returns a raw `Track` without analysis fields, then converts via `MobileTrackDTO::from_track()` (not `from_track_with_analysis()`). All other track-returning routes use `get_tracks_with_analysis_paginated` or similar. This makes the single-track endpoint inconsistently return `bpm: null` and `musical_key: null` even for analyzed tracks. The mobile PWA may rely on this endpoint for playback metadata display.

**Why it happens:** The mobile PWA's streaming flow is: browse → get ticket → stream. The ticket creation endpoint at `/api/stream-ticket` verifies the track exists via `db.get_track()`. The `/api/tracks/{id}` route was added as a convenience lookup but missed the analysis join used by the list endpoints.

**Consequences:** Mobile PWA shows no BPM or key for individual track detail views while the list view shows them correctly. If the mobile PWA is extended to show a "now playing" detail panel, this inconsistency becomes user-visible.

**Prevention:** When removing or fixing this route, decide: (a) remove it if no mobile PWA code calls it, or (b) fix it to use `db.get_track_with_analysis(id)` (or equivalent join). Check the mobile PWA source (`mobile/` directory if it exists) for any `fetch('/api/tracks/' + id)` calls before deleting.

**Detection:** Check mobile PWA source for the route. If unused, deletion is safe. If used, the missing analysis fields are the bug.

**Phase:** Tech debt cleanup phase. Verify mobile usage before touching.

---

### Pitfall 5: Adding Vitest to This Stack Requires Special Tauri Mock Setup — Naive Install Breaks the Build

**What goes wrong:** Installing Vitest and attempting to import `@tauri-apps/api/core` in test files will fail with a module resolution error because Tauri's `invoke` function is not available in the Node.js test environment — it requires the Tauri IPC bridge. The standard advice ("mock the module") is correct, but the mock must be set up globally in a `vitest.setup.ts` file and referenced in `vitest.config.ts`, or every test file that touches `tauriApi` will fail.

**Why it happens:** `src/lib/tauri-api.ts` imports directly from `@tauri-apps/api/core`. The Tauri plugin packages assume they run inside a WebView with the Tauri IPC context. Node/Vitest has neither. The package does export a conditional shim but it is not automatic.

**Consequences:** If the mock is not set up, every test that imports anything from `src/lib/` (which imports `tauri-api.ts`) fails with `ReferenceError: __TAURI_IPC__ is not defined` or similar. This can cause developers to give up on frontend tests entirely.

**Prevention:** The correct setup for this codebase:

1. Install: `npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event`
2. Create `vitest.config.ts` with `environment: 'jsdom'` and a `setupFiles` entry
3. In the setup file, mock `@tauri-apps/api/core`:
   ```typescript
   vi.mock('@tauri-apps/api/core', () => ({
     invoke: vi.fn(),
   }));
   ```
4. In individual tests, configure `invoke` return values per test case
5. Add `"test": "vitest"` to `package.json` scripts

Do NOT try to test `tauriApi` wrapper functions directly — test the React components and stores that call them, with `invoke` mocked.

**Detection:** If `npm test` outputs `ReferenceError: __TAURI_IPC__` or `Cannot find module '@tauri-apps/api/core'`, the Tauri mock setup is missing.

**Phase:** Frontend test setup phase. Must be configured before writing any frontend tests.

---

### Pitfall 6: Database Tests With Real SQLite Must Use tempfile — In-Memory DBs Miss Migration Logic

**What goes wrong:** When adding Rust tests for the `Database` struct in `src-tauri/src/db/mod.rs`, developers reach for `rusqlite::Connection::open_in_memory()` for speed. However, `Database::new()` calls `apply_migrations()` which is what creates tables and indexes. An in-memory connection created directly bypasses this and tests run against an empty schema, causing every query to fail with "no such table."

**Why it happens:** The `Database` struct encapsulates its `Connection` and migration logic. The only valid way to create a test database is to go through `Database::new(path)`. `tempfile` is already in `[dev-dependencies]` (Cargo.toml line 50), which means the project intended this pattern.

**Consequences:** Tests fail with schema errors, not logic errors. Developer diagnoses the wrong problem (query correctness) instead of the real one (missing schema setup).

**Prevention:** All database tests must use:
```rust
use tempfile::NamedTempFile;

fn make_test_db() -> Database {
    let file = NamedTempFile::new().unwrap();
    Database::new(file.path()).expect("test db init failed")
}
```
Note: `NamedTempFile` must be kept alive for the duration of the test — if it drops, the file is deleted and the connection breaks. Assign it to a variable in the test function.

**Detection:** Any `rusqlite::Connection::open_in_memory()` in test code is a red flag. Tests that pass in isolation but fail when the DB has data are the other warning sign.

**Phase:** Rust backend test phase. Establish this pattern in the first test file and document it.

---

## Moderate Pitfalls

Mistakes that cause bugs or regressions without necessarily blocking shipping.

---

### Pitfall 7: UI Polish That Touches TailwindCSS 4 Purging Breaks Dynamically Constructed Classes

**What goes wrong:** This project uses TailwindCSS 4. Dynamic class construction like `` `text-${color}-500` `` or `cn('bg-' + variant)` will be purged from the production build because Tailwind's scanner cannot statically detect them as used classes. In a polish pass that adds color-coded indicators (genre colors, key compatibility colors, energy arc gradients), this pattern is tempting.

**Why it happens:** Tailwind 4's content scanning is static analysis — it looks for complete class strings in source files. Partial string concatenation defeats this. The existing `GenreDefinition` type has a `color` field that likely stores a hex value or color name for dynamic styling.

**Consequences:** Styles work in `npm run dev` (Tailwind processes all classes) but disappear in production builds (`tauri build`). This is the hardest class of CSS bug to diagnose because dev vs prod behavior diverges.

**Prevention:** Use complete class names in source: `text-red-500`, `text-blue-500` — not `` `text-${color}-500` ``. For dynamic colors from the DB (genre colors stored as hex), use inline `style={{ color: genreColor }}` instead of Tailwind classes. Add a safelist in Tailwind config only as a last resort.

**Detection:** Color or style works in dev but not in production build. Check Tailwind config for `safelist` — its absence means dynamic classes are not protected.

**Phase:** UI polish phase. Review every dynamic class construction before building.

---

### Pitfall 8: Polishing the Player Component Without Understanding the HTML5 / Native Dual-Mode Architecture

**What goes wrong:** `audioPlayer.ts` operates in two modes: `'html'` (HTML5 Audio + custom `stream://` protocol) and `'native'` (Rust Symphonia decode → PCM chunks → WebAudio API). The fallback to native happens silently for formats WebView cannot decode (e.g., OGG on macOS). A UI polish pass that adds loading spinners, error states, or seek bars to the Player component without understanding this dual mode will either: (a) not reflect native mode state correctly, or (b) add visual states that the native path never triggers (native mode has its own `nativePositionTimer` and emits events differently than HTML5).

**Why it happens:** The `AudioPlayer` class in `src/lib/audioPlayer.ts` is ~500+ lines with crossfade logic, two audio pipelines, and a `_loadGeneration` counter to cancel stale loads. The `Player.tsx` component in `src/components/Player.tsx` drives it via a singleton. Any UI state added to Player must account for both HTML and native mode callbacks.

**Consequences:** Seek bar works for MP3/FLAC but freezes during OGG playback. Loading spinner never dismisses during native decode. Error state shows for the HTML fallback path then clears when native path succeeds.

**Prevention:** Before adding UI polish to Player: read `audioPlayer.ts` in full, understand the callback chain (`onPositionUpdate`, `onDurationChange`, `onError`, `onPlayStateChange`), and verify that any new state correctly receives events from both modes. Test with an OGG file specifically.

**Detection:** Test Player UI changes with a format that triggers native mode (OGG on macOS). If player state indicators behave differently for OGG vs MP3, the dual-mode architecture is not fully handled.

**Phase:** UI polish phase. Player component is high-risk — test audio format coverage.

---

### Pitfall 9: Zustand Store Subscriptions in React 19 Strict Mode Cause Double-Subscription

**What goes wrong:** React 19 Strict Mode (active in development) mounts components twice. Zustand subscriptions created in `useEffect` without proper cleanup will subscribe twice and the second subscription will not be cleaned up when the component unmounts because the cleanup function was registered for the first mount. This manifests as audio events firing twice (position updates doubling the playback speed in the progress bar) or state updates triggering twice.

**Why it happens:** `useEffect` in Strict Mode runs mount → unmount → mount. If the effect creates a Zustand subscription via `store.subscribe()` and the cleanup `return () => unsubscribe()` is correct, this works. But patterns like `store.getState().setX` called inside `useEffect` with no cleanup, or `listen()` from Tauri events without `unlisten()`, will accumulate listeners.

**Consequences:** Position bar updates at 2x speed in development. Event listeners accumulate across navigation. In production (non-Strict Mode), the double-mount doesn't happen, so the bug only appears in development — making it easy to dismiss incorrectly.

**Prevention:** Every `useEffect` that calls `listen()`, `store.subscribe()`, or adds any kind of listener must return a cleanup function. Audit `App.tsx` and `Player.tsx` for Tauri `listen()` calls — each one must be paired with `unlisten()` in the effect cleanup.

**Detection:** Position bar advancing at 2x speed in dev mode, or `app.listen()` call count increasing across component remounts in Tauri devtools.

**Phase:** Code quality pass. Audit all useEffect + listen() pairs before the UI polish phase.

---

### Pitfall 10: Cleaning Up eprintln! Debug Logging Without Structured Logging Leaves Zero Observability

**What goes wrong:** The codebase has 54 `eprintln!` calls across 7 files — stream protocol handler, analysis commands, playback, and the companion server. A cleanup pass that removes all `eprintln!` in the name of "code quality" eliminates the only observability mechanism. The stream protocol handler's `eprintln!` calls for path normalization, fallback attempts, and file serving are load-bearing diagnostics — they are what allows debugging the complex `percent_decode_maybe_twice` and fallback path logic for unusual filenames.

**Why it happens:** `eprintln!` looks like debug noise to a reviewer unfamiliar with Tauri's logging setup. In a Tauri app, there is no application logger wired up by default — `eprintln!` outputs to stderr which Tauri captures and can show in the devtools console or terminal.

**Consequences:** After removal, any file path bug (encoding, special characters, UNC paths) becomes impossible to diagnose without a full debugger session.

**Prevention:** Replace `eprintln!` with `tracing` or `log` crate calls if cleaning up is desired. If keeping `eprintln!`, mark the load-bearing ones with a comment: `// diagnostic — do not remove`. The stream handler fallback eprintln calls (Fallback 0, 1, 2, 3) are essential for path debugging.

**Detection:** After any cleanup pass, test playback of a track with a space in the directory name, a Unicode character in the filename, and a nested folder path. If the player fails silently with no log output, diagnostics were removed.

**Phase:** Code quality pass. Do not remove diagnostic logging unless replacing with structured logging.

---

### Pitfall 11: The Mutex<Option<Database>> Pattern Deadlocks When Commands Call Each Other

**What goes wrong:** The `AppState.db: Mutex<Option<Database>>` pattern requires callers to lock, use, and drop the guard before calling another command. If any Tauri command acquires the `db` lock and then (directly or indirectly) calls another function that also tries to acquire `db`, the second lock attempt panics with a double-lock poison (Rust's `Mutex` is not reentrant).

**Why it happens:** `rebuild_context_cache` in `commands/ai.rs` acquires the db lock inside a block, but if error handling causes it to call a helper that also needs the lock (e.g., a logging function that reads track count), deadlock occurs. This risk increases as tests add helper functions that share state.

**Consequences:** Command hangs forever or panics with `"State lock failed"` on lock acquisition. This is hard to reproduce because it depends on exact calling order and is invisible in single-threaded tests.

**Prevention:** Keep the lock-acquire-use-drop pattern strictly scoped. Never hold the lock across an await point or across a call to another function that may need the same lock. The existing pattern `{ let db_lock = state.db.lock()...; let result = db_lock.as_ref()...do_work...; } // lock drops here` is correct — preserve this scope structure during any refactor.

**Detection:** Any test that hangs without output is likely a deadlock. `cargo test -- --nocapture` with a timeout will identify stuck tests.

**Phase:** Rust backend test phase and code quality pass. Lock scope discipline must be preserved during refactoring.

---

## Minor Pitfalls

Mistakes that cause minor friction or suboptimal outcomes.

---

### Pitfall 12: React 19 + @tanstack/react-virtual Requires Stable estimateSize References

**What goes wrong:** `TrackTable.tsx` uses `@tanstack/react-virtual` for the virtualized track list. In React 19, inline functions passed to `estimateSize` or `getItemKey` re-create on every render, potentially causing excessive virtualizer recalculations. A polish pass that adds new columns to the track table or changes row height logic without memoizing these callbacks will cause visual jank.

**Prevention:** Wrap `estimateSize` callbacks in `useCallback` with stable dependencies. Check that the virtualizer's row height calculation matches the actual rendered height after any CSS changes.

**Phase:** UI polish phase. Verify virtualizer behavior after any track table changes.

---

### Pitfall 13: Adding New Rust Commands Requires Registering in Both Cargo invoke_handler AND tauri.conf.json

**What goes wrong:** Tauri 2 requires new commands to appear in `invoke_handler!` in `lib.rs` (already done correctly for all existing commands). However, if the project uses `tauri.conf.json` allowlist configuration (less common in Tauri 2 but possible), new commands also need allowlist entries. Forgetting either causes a silent failure — `invoke()` on the frontend returns an error instead of a result.

**Prevention:** After adding any new command: (1) add to `invoke_handler!` in `lib.rs`, (2) add the IPC wrapper to `tauri-api.ts`, (3) test with a real `tauri dev` run. Do not rely on compile-time checks alone.

**Phase:** Applies to any phase that adds new backend commands.

---

### Pitfall 14: TypeScript strict + noUnusedParameters Breaks When Adding Test Stubs

**What goes wrong:** `tsconfig.json` has `"noUnusedLocals": true` and `"noUnusedParameters": true`. When adding frontend test utilities, mock implementations often have unused parameters (e.g., `(trackId: number) => {}` where `trackId` is not used in the mock body). TypeScript will refuse to compile the test.

**Prevention:** Use `_trackId` (underscore prefix) for intentionally unused parameters in mocks. Or extend `tsconfig.json` with a separate `tsconfig.test.json` that relaxes these rules for test files only.

**Phase:** Frontend test setup phase.

---

### Pitfall 15: The greet Command in lib.rs Is Dead Code But Removing It Is Cosmetically Risky

**What goes wrong:** The `greet` function in `lib.rs` (line 16) is the Tauri scaffold default. It is registered in `invoke_handler!`. Removing it is clean but requires also removing it from `invoke_handler!` — easy to forget one side. clippy will not catch a registered-but-never-called command (it's not dead code from Rust's perspective since `invoke_handler!` expands to use it).

**Prevention:** Remove both: the function definition AND its entry in `invoke_handler!`. Verify with `cargo build` and a quick `tauri dev` smoke test.

**Phase:** Tech debt cleanup phase. Low risk, but don't do it in the same commit as larger refactors.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Fix tech debt: unused type guards | Pitfall 2 — deleting isAppError/getErrorMessage breaks AI error UX | Migrate to shared location, verify all 4 call sites before changing |
| Fix tech debt: duplicated audio_mime_type | Pitfall 3 — refactor breaks stream protocol closure | Extract as pure free function to audio/mime.rs, verify `cargo build` |
| Fix tech debt: orphaned /api/tracks/{id} | Pitfall 4 — remove without checking mobile PWA usage | grep mobile PWA source before deleting route |
| Fix tech debt: greet command | Pitfall 15 — partial removal leaves dangling invoke_handler entry | Remove both definition and handler registration atomically |
| Rust backend tests | Pitfall 1 — testing commands requires runtime | Test pure functions only; commands are thin shells |
| Rust backend tests | Pitfall 6 — in-memory DB misses migrations | Use tempfile + Database::new() pattern; tempfile already in dev-deps |
| Rust backend tests | Pitfall 11 — lock scope regressions during test setup | Preserve strict lock-acquire-use-drop scoping |
| Frontend test setup | Pitfall 5 — Tauri IPC not available in Node/Vitest | Global vi.mock('@tauri-apps/api/core') in setup file |
| Frontend test setup | Pitfall 14 — noUnusedParameters breaks mock stubs | Use _ prefix or tsconfig.test.json override |
| Code quality pass | Pitfall 9 — useEffect subscriptions not cleaned up | Audit every listen() call for unlisten() cleanup |
| Code quality pass | Pitfall 10 — removing eprintln! kills observability | Keep stream handler diagnostics; replace others with tracing if desired |
| UI polish: Player component | Pitfall 8 — dual-mode audio architecture | Test OGG playback specifically after any Player UI changes |
| UI polish: track table | Pitfall 12 — virtual scroll estimateSize re-renders | Wrap estimateSize in useCallback |
| UI polish: any dynamic Tailwind class | Pitfall 7 — purged classes disappear in prod | Use complete class strings; inline style for runtime colors |
| Adding new backend commands | Pitfall 13 — command not in invoke_handler | Checklist: function → invoke_handler → tauri-api.ts → test |

---

## Sources

- Direct codebase inspection: all files in `src-tauri/src/` and `src/`
- `src-tauri/Cargo.toml`: confirms `tempfile` in dev-dependencies, no test framework configured yet
- `tsconfig.json`: confirms `noUnusedLocals`, `noUnusedParameters`, `strict` mode
- `package.json`: confirms no test runner (`vitest`, `jest`) in devDependencies
- `src-tauri/src/audio/bpm.rs`: confirms the correct testing pattern (pure function separation) is already in place
- `src-tauri/src/lib.rs`: stream protocol handler, duplicated `audio_mime_type`, 54 `eprintln!` calls
- `src-tauri/src/server/streaming.rs`: second `audio_mime_type` copy, lock usage patterns
- `src/types/ai.ts`: isAppError/getErrorMessage definitions and 4 call sites
- `src-tauri/src/commands/library.rs`: `Mutex<Option<Database>>` lock pattern
- Tauri v2 documentation knowledge (HIGH confidence): `State` requires live app context for tests
- Rust standard library: `Mutex` is not reentrant — confirmed from language specification
