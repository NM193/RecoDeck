# Phase 6: Test Coverage - Research

**Researched:** 2026-03-01
**Domain:** Rust unit testing (cargo test) + Vitest 4 frontend testing with Tauri IPC mock
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Expand Rust tests for database CRUD operations (db/mod.rs) | Already substantially covered — 30+ db tests passing; need gap analysis to confirm full CRUD coverage |
| TEST-02 | Add Rust tests for AI context builder output (ai/context_builder.rs) | Currently only 1 test (serialization); need `build_full_context`, `build_smart_context`, `build_seed_context`, `is_camelot_compatible` tests |
| TEST-03 | Add Rust tests for audio analysis functions (key detection, BPM) | Already covered — 8 BPM tests + 9 key tests all passing |
| TEST-04 | Configure Vitest 3 with global Tauri IPC mock for frontend | Vitest 4 (not 3) is current — supports Vite 7; use `@tauri-apps/api/mocks` + jsdom setup |
| TEST-05 | Add frontend tests for musicUtils.ts (key compatibility, BPM quality) | Pure functions — no IPC needed; straightforward Vitest unit tests |
| TEST-06 | Add frontend tests for Zustand stores | playerStore pure logic is testable; aiStore actions call tauriApi (mock needed) |
</phase_requirements>

---

## Summary

**Current Rust test state: 78 tests, all passing.** `cargo test` already works and covers substantial ground across db, audio analysis, AI context builder, and scanner. The gap is that TEST-02 (AI context builder) has only one shallow serialization test — the core business logic functions (`build_full_context`, `build_smart_context`, `build_seed_context`, `is_camelot_compatible`) have no tests at all. TEST-01 and TEST-03 are effectively already done (the requirements were written before this coverage existed). The plan must focus Plan 06-01 on filling only the actual gaps.

**Current frontend test state: zero.** Vitest is not installed. No `vitest.config.ts` exists. No test files exist. Plan 06-02 must bootstrap the entire frontend testing infrastructure — install Vitest 4 + jsdom, configure a global setup file that calls `mockIPC` to silence the `__TAURI_INTERNALS__` error, then write tests for `musicUtils.ts` (pure functions, trivial) and the Zustand stores (requires store reset pattern between tests).

**Vitest version choice: use 4.0.x, not 3.x.** The project runs Vite 7.3.1. Vitest 4.0.18's peer dependency accepts `vite: '^6.0.0 || ^7.0.0'` — fully compatible. Vitest 3 only supports Vite 5/6. Using Vitest 4 avoids a version mismatch and is current as of 2026-03-01.

**Primary recommendation:** Plan 06-01 adds missing context_builder tests only (db/BPM/key are already done). Plan 06-02 installs Vitest 4 + jsdom, writes a global IPC mock setup, and adds musicUtils + store tests.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.0.18 | Frontend test runner | Current latest; supports Vite 7; same config as Vite project |
| jsdom | latest (`*` peer) | Browser environment for Vitest | Standard DOM emulation for non-browser tests |
| @tauri-apps/api/mocks | 2.10.1 (already installed) | `mockIPC`, `clearMocks` for IPC interception | Official Tauri mock utilities; prevents `__TAURI_INTERNALS__` errors |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tempfile | 3.14 (already in [dev-dependencies]) | Rust temp dirs for file-based tests | Scanner integration tests — already used |
| @vitest/coverage-v8 | 4.0.18 (optional) | Code coverage reporting | Only if coverage gates are required |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest 4 | vitest 3 | vitest 3 does NOT support Vite 7 — incompatible with this project |
| jsdom | happy-dom | happy-dom is faster but less spec-complete; jsdom is safer for Tauri mock compatibility |
| Per-test mockIPC | vi.mock('@tauri-apps/api/core') | Module mock is simpler for store tests where you control return values; `mockIPC` is better for integration-style tests |

**Installation:**
```bash
npm install -D vitest@^4.0.18 jsdom@latest
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── musicUtils.ts              # existing — pure functions, easy to test
│   └── musicUtils.test.ts         # NEW — Wave 0 target
├── store/
│   ├── playerStore.ts             # existing
│   ├── playerStore.test.ts        # NEW — Wave 0 target
│   ├── aiStore.ts                 # existing
│   └── aiStore.test.ts            # NEW — Wave 0 target
└── test/
    └── setup.ts                   # NEW — global IPC mock setup file

src-tauri/src/
├── ai/
│   └── context_builder.rs         # existing — add tests to #[cfg(test)] block
└── (db/, audio/ already have tests)
```

### Pattern 1: Vitest Config with Global IPC Mock

**What:** `vitest.config.ts` (separate from `vite.config.ts` to avoid polluting Tauri dev config) with jsdom environment and a global setup file.

**When to use:** Always — this is the foundational config for all frontend tests.

```typescript
// vitest.config.ts (project root — NEW file)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

```typescript
// src/test/setup.ts (NEW file)
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'

// Silence __TAURI_INTERNALS__ errors for all tests.
// mockIPC installs window.__TAURI_INTERNALS__ which invoke() requires.
// Without this, any import of tauri-api.ts in test modules throws:
// "TypeError: window.__TAURI_INTERNALS__ is undefined"
beforeEach(() => {
  mockIPC((_cmd, _payload) => {
    // Default: return undefined (tests override per-case with local mockIPC calls)
  })
})

afterEach(() => {
  clearMocks()
})
```

**Why separate `vitest.config.ts`:** The existing `vite.config.ts` has Tauri-specific server config (port 1420, strictPort). Merging test config into it works but risks `tauri dev` picking up test options. A separate `vitest.config.ts` is cleaner. Vitest auto-discovers `vitest.config.ts` first if present.

### Pattern 2: Testing Pure Utility Functions (musicUtils.ts)

**What:** Direct import and call — no mocking needed. `musicUtils.ts` has zero Tauri dependencies.

**When to use:** `getKeyCompatibility` and `getBpmIssue` are pure functions — test them exhaustively.

```typescript
// src/lib/musicUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getKeyCompatibility, getBpmIssue } from './musicUtils'

describe('getKeyCompatibility', () => {
  it('returns perfect for identical keys', () => {
    expect(getKeyCompatibility('8A', '8A')).toBe('perfect')
  })
  it('returns compatible for same number, different letter', () => {
    expect(getKeyCompatibility('8A', '8B')).toBe('compatible')
  })
  it('returns compatible for adjacent number, same letter (circular)', () => {
    expect(getKeyCompatibility('1A', '12A')).toBe('compatible') // circular wrap
    expect(getKeyCompatibility('5A', '6A')).toBe('compatible')
  })
  it('returns clash for non-adjacent keys', () => {
    expect(getKeyCompatibility('1A', '6A')).toBe('clash')
  })
  it('returns clash for missing keys', () => {
    expect(getKeyCompatibility(undefined, '8A')).toBe('clash')
    expect(getKeyCompatibility('8A', undefined)).toBe('clash')
  })
})

describe('getBpmIssue', () => {
  it('returns ok for delta <= 5', () => {
    expect(getBpmIssue(128, 130)).toBe('ok')
  })
  it('returns warn for delta 6-10', () => {
    expect(getBpmIssue(120, 128)).toBe('warn')
  })
  it('returns bad for delta > 10', () => {
    expect(getBpmIssue(120, 140)).toBe('bad')
  })
  it('returns bad when either BPM is missing', () => {
    expect(getBpmIssue(undefined, 128)).toBe('bad')
  })
})
```

### Pattern 3: Testing Zustand Stores (v5 reset between tests)

**What:** Import the store module directly, call actions on the raw store object, assert state changes. Reset state between tests using `store.setState(initialState, true)`.

**When to use:** playerStore logic (playNext, playPrevious, setShuffle, setQueue) is pure state machine — ideal for unit tests. aiStore actions that call tauriApi require mocking `tauriApi`.

```typescript
// src/store/playerStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from './playerStore'

// Helper: reset store to initial state between tests
// Zustand v5 setState(partial, replace=true) replaces entire state
const initialState = usePlayerStore.getInitialState()

beforeEach(() => {
  usePlayerStore.setState(initialState, true)
})

const makeTrack = (id: number) => ({
  id,
  file_path: `/track${id}.mp3`,
  file_hash: `hash${id}`,
  title: `Track ${id}`,
  // ... minimal required fields
} as Track)

describe('playerStore - queue management', () => {
  it('setQueue sets tracks and startIndex', () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]
    usePlayerStore.getState().setQueue(tracks, 1)
    const state = usePlayerStore.getState()
    expect(state.queue).toHaveLength(3)
    expect(state.currentTrackIndex).toBe(1)
  })

  it('playNext advances index', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 0)
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1)
  })

  it('playNext wraps to 0 in repeatMode all', () => {
    usePlayerStore.setState({ repeatMode: 'all' })
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 1)
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0)
  })

  it('playNext stops at end when not repeating', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2)], 1)
    usePlayerStore.getState().playNext()
    // Should not advance past end
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1)
  })

  it('setVolume clamps to [0, 1]', () => {
    usePlayerStore.getState().setVolume(2.0)
    expect(usePlayerStore.getState().volume).toBe(1)
    usePlayerStore.getState().setVolume(-1.0)
    expect(usePlayerStore.getState().volume).toBe(0)
  })
})
```

```typescript
// src/store/aiStore.test.ts
// aiStore actions call tauriApi — mock the module
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAIStore } from './aiStore'

// Mock tauriApi at module level
vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAIApiKeyStatus: vi.fn(),
    setAIApiKey: vi.fn(),
    deleteAIApiKey: vi.fn(),
    aiChat: vi.fn(),
    generatePlaylist: vi.fn(),
  },
}))

import { tauriApi } from '../lib/tauri-api'
const initialState = useAIStore.getInitialState()

beforeEach(() => {
  useAIStore.setState(initialState, true)
  vi.clearAllMocks()
})

describe('aiStore - API key management', () => {
  it('checkApiKeyStatus sets isApiKeyConfigured true', async () => {
    vi.mocked(tauriApi.getAIApiKeyStatus).mockResolvedValue(true)
    await useAIStore.getState().checkApiKeyStatus()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(true)
  })

  it('checkApiKeyStatus handles error gracefully', async () => {
    vi.mocked(tauriApi.getAIApiKeyStatus).mockRejectedValue(new Error('fail'))
    await useAIStore.getState().checkApiKeyStatus()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(false)
  })

  it('setApiKey sets isApiKeyConfigured on success', async () => {
    vi.mocked(tauriApi.setAIApiKey).mockResolvedValue(undefined)
    await useAIStore.getState().setApiKey('sk-test')
    expect(useAIStore.getState().isApiKeyConfigured).toBe(true)
    expect(useAIStore.getState().error).toBeNull()
  })
})
```

### Pattern 4: Rust context_builder Tests (closing TEST-02 gap)

**What:** Add tests directly to the `#[cfg(test)]` block in `context_builder.rs` using helper functions to build mock `Track` + `TrackAnalysis` data.

```rust
// In src-tauri/src/ai/context_builder.rs — extend existing tests block

fn make_track(id: i64, title: &str) -> Track {
    Track {
        id: Some(id),
        file_path: format!("/track/{}.mp3", id),
        file_hash: format!("hash{}", id),
        title: Some(title.to_string()),
        // ... minimal fields, others None/0
        ..Track::default() // or construct fully
    }
}

fn make_analysis(bpm: f64, key: &str) -> TrackAnalysis {
    TrackAnalysis {
        track_id: 0,
        bpm: Some(bpm),
        bpm_confidence: Some(0.9),
        musical_key: Some(key.to_string()),
        key_confidence: Some(0.8),
        loudness_lufs: None,
        dynamic_range: None,
        spectral_centroid: None,
        analyzed_at: None,
    }
}

#[test]
fn test_build_full_context_empty_library() {
    let tracks: Vec<(Track, Option<TrackAnalysis>)> = vec![];
    let result = TrackContextBuilder::build_full_context(&tracks);
    assert!(result.is_ok());
    let json = result.unwrap();
    assert!(json.contains("total_tracks"));
}

#[test]
fn test_build_full_context_with_tracks() {
    let tracks = vec![
        (make_track(1, "Deep Tech"), Some(make_analysis(128.0, "8A"))),
        (make_track(2, "Minimal"), None),
    ];
    let result = TrackContextBuilder::build_full_context(&tracks).unwrap();
    assert!(result.contains("Deep Tech"));
    assert!(result.contains("128"));
}

#[test]
fn test_is_camelot_compatible_same_number_diff_letter() {
    // 8A and 8B are always compatible (inner/outer circle)
    assert!(TrackContextBuilder::is_camelot_compatible("8A", "8B", 2));
}

#[test]
fn test_is_camelot_compatible_adjacent_number() {
    assert!(TrackContextBuilder::is_camelot_compatible("8A", "9A", 2));
}

#[test]
fn test_is_camelot_compatible_circular_wrap() {
    // 12A and 1A are adjacent on the circular wheel
    assert!(TrackContextBuilder::is_camelot_compatible("12A", "1A", 1));
}

#[test]
fn test_is_camelot_compatible_incompatible() {
    assert!(!TrackContextBuilder::is_camelot_compatible("1A", "6A", 2));
}

#[test]
fn test_build_smart_context_filters_by_artist() {
    let tracks = vec![
        (make_track_with_artist(1, "Boris Brejcha"), Some(make_analysis(132.0, "5A"))),
        (make_track_with_artist(2, "Charlotte de Witte"), Some(make_analysis(140.0, "3A"))),
    ];
    // Prompt containing "boris" should filter to track 1
    let result = TrackContextBuilder::build_smart_context(&tracks, "boris brejcha set").unwrap();
    assert!(result.contains("Boris Brejcha"));
}

#[test]
fn test_build_seed_context_bpm_range() {
    // build_up energy from 128 BPM seed should include 140 BPM but not 100 BPM
    // ... construct tracks with varying BPMs and assert filtering
}
```

**Note:** `Track` struct has many fields. Either implement `Default` on `Track` in the codebase or use the existing `create_test_track()` helper pattern already in `db/mod.rs` tests as a model.

### Anti-Patterns to Avoid

- **Putting test config in vite.config.ts:** Works but can cause Tauri dev to observe test settings. Use a separate `vitest.config.ts`.
- **Not calling `clearMocks()` after each test:** Tauri's `mockIPC` installs global state on `window`. Without `clearMocks()`, mocks bleed between tests.
- **Using `store.setState(partialState, true)` with incomplete state:** Zustand v5 requires `true` (replace) to also pass a COMPLETE state object. Use `store.getInitialState()` to get the exact initial shape.
- **Testing aiStore actions without mocking tauriApi:** `tauriApi` imports `invoke` from `@tauri-apps/api/core`. The global `setup.ts` `mockIPC` call handles the `window.__TAURI_INTERNALS__` error, but you still need to control return values — use `vi.mock('../lib/tauri-api')` at the module level.
- **Testing playerStore with `usePlayerStore` hook via React:** Unnecessary. Zustand stores expose `usePlayerStore.getState()` and `usePlayerStore.setState()` directly — no React wrapper needed for action/state tests.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IPC interception in tests | Custom window.__TAURI_INTERNALS__ stub | `mockIPC` from `@tauri-apps/api/mocks` | Official API; handles crypto seed, event system, window labels correctly |
| Store reset between tests | Manual store manipulation | `store.setState(store.getInitialState(), true)` | Zustand v5 provides `getInitialState()` for exactly this use case |
| Browser environment in Node | Custom globals | jsdom package via `environment: 'jsdom'` in vitest config | jsdom provides the full DOM APIs that `@tauri-apps/api/mocks` needs |
| Rust test fixtures | Duplicating `create_test_track()` | Shared test helper function at top of `#[cfg(test)]` block | Follows existing pattern already established in db/mod.rs |

**Key insight:** The `@tauri-apps/api/mocks` module exists specifically so you don't have to stub `window.__TAURI_INTERNALS__` manually. Use it.

---

## Common Pitfalls

### Pitfall 1: Vitest 3 vs Vitest 4 for Vite 7

**What goes wrong:** `npm install -D vitest` installs Vitest 4.x. If you try Vitest 3.x thinking the requirement said "Vitest 3", it will fail with Vite 7 because Vitest 3 only supports Vite 5/6.

**Why it happens:** The REQUIREMENTS.md says "Vitest 3" but was written before this research. Vitest 4.0.18 is current (released Oct 2025) and explicitly supports `vite: '^6.0.0 || ^7.0.0'`.

**How to avoid:** Use Vitest 4. The SUCCESS CRITERIA says "Vitest is configured" and "`npm test` runs" — the version number in the requirement is stale.

**Warning signs:** If `npm install vitest@^3` is run, npm will show a peer dependency conflict with `vite@^7`.

### Pitfall 2: __TAURI_INTERNALS__ Error Without Global Setup

**What goes wrong:** Any test file that imports `tauri-api.ts` (even indirectly through stores) will throw `TypeError: Cannot read properties of undefined (reading 'invoke')` or similar because `window.__TAURI_INTERNALS__` is not defined in jsdom.

**Why it happens:** `@tauri-apps/api/core`'s `invoke` function reads `window.__TAURI_INTERNALS__`. jsdom does not define this.

**How to avoid:** The `src/test/setup.ts` file runs `mockIPC(...)` in a `beforeEach` — this call installs `window.__TAURI_INTERNALS__`. With `setupFiles: ['./src/test/setup.ts']` in vitest config, this runs before every test file automatically.

**Warning signs:** Error message containing `__TAURI_INTERNALS__` or `__TAURI_IPC__`.

### Pitfall 3: Zustand v5 getInitialState() Availability

**What goes wrong:** Test code tries `useStore.getInitialState()` and gets `TypeError: usePlayerStore.getInitialState is not a function`.

**Why it happens:** Older Zustand guides show using `jest.mock('zustand')` + a custom `__mocks__/zustand.ts` approach. Zustand v5 added `getInitialState()` directly on the store instance, making the mock file approach unnecessary.

**How to avoid:** The project is on Zustand 5.0.11. Simply call `usePlayerStore.getInitialState()` directly. Verify the approach in beforeEach before writing many tests. The STATE.md explicitly flagged: "Verify Zustand v5.0.11 `store.setState(initialState)` reset pattern before writing store tests."

**Warning signs:** TypeScript error `Property 'getInitialState' does not exist on type 'UseBoundStore<...>'`.

### Pitfall 4: Rust Track Struct Has No Default

**What goes wrong:** Trying to use `Track { ..Default::default(), title: Some("test") }` fails because `Track` doesn't derive `Default`.

**Why it happens:** The existing test pattern in `db/mod.rs` uses a `create_test_track()` helper function. The context_builder tests need to replicate this pattern, not assume `Default`.

**How to avoid:** Replicate the `create_test_track()` helper in the context_builder test module, or extract a shared helper into a `tests/common` module if the pattern is needed in many places.

### Pitfall 5: aiStore Tests Importing tauriApi Before vi.mock

**What goes wrong:** `vi.mock('../lib/tauri-api')` must appear before any dynamic import of the module, but ESM hoisting rules mean the order matters in Vitest.

**Why it happens:** In Vitest (like Jest), `vi.mock()` calls are hoisted to the top of the file — so the order in source code doesn't strictly matter, but the mock must be declared at the top level (not inside a function or conditional).

**How to avoid:** Always place `vi.mock(...)` at the top level of the test file. Use `vi.mocked()` to get typed mock access. Call `vi.clearAllMocks()` in `beforeEach` to reset call counts.

---

## Code Examples

### Vitest Config (Complete)

```typescript
// vitest.config.ts
// Source: vitest.dev/guide/ + yonatankra.com/how-to-setup-vitest-in-a-tauri-project/
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

### Global IPC Mock Setup File

```typescript
// src/test/setup.ts
// Source: v2.tauri.app/develop/tests/mocking/ + tauri.app/reference/javascript/api/namespacemocks/
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'

beforeEach(() => {
  mockIPC((_cmd, _payload) => undefined)
})

afterEach(() => {
  clearMocks()
})
```

### Package.json Test Script

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Zustand Store Reset (v5 Pattern)

```typescript
// Source: zustand.docs.pmnd.rs/guides/testing + github.com/pmndrs/zustand discussions
const initialState = usePlayerStore.getInitialState()

beforeEach(() => {
  usePlayerStore.setState(initialState, true) // true = replace (not merge)
})
```

### Rust Context Builder Test Helper

```rust
// Source: mirrors pattern in src-tauri/src/db/mod.rs create_test_track()
fn make_test_track(id: i64, title: &str) -> Track {
    Track {
        id: Some(id),
        file_path: format!("/test/{}.mp3", id),
        file_hash: format!("hash{}", id),
        title: Some(title.to_string()),
        artist: None,
        album: None,
        album_artist: None,
        track_number: None,
        year: None,
        label: None,
        duration_ms: Some(240000),
        file_format: Some("mp3".to_string()),
        bitrate: None,
        sample_rate: None,
        file_size: None,
        date_added: None,
        date_modified: None,
        play_count: 0,
        rating: 0,
        comment: None,
        artwork_path: None,
        genre: None,
        genre_source: None,
    }
}

fn make_test_analysis(bpm: f64, key: &str) -> TrackAnalysis {
    TrackAnalysis {
        track_id: 0,
        bpm: Some(bpm),
        bpm_confidence: Some(0.9),
        musical_key: Some(key.to_string()),
        key_confidence: Some(0.85),
        loudness_lufs: None,
        dynamic_range: None,
        spectral_centroid: None,
        analyzed_at: None,
    }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vitest 3 + Vite 6 | Vitest 4 + Vite 7 (supported) | Oct 2025 (v4 release) | Must install vitest@^4, not vitest@^3 |
| `__mocks__/zustand.ts` pattern for store reset | `store.getInitialState()` + `setState(init, true)` | Zustand v5 (2024) | Simpler — no mock file needed |
| `jest.spyOn(window, '__TAURI_IPC__')` | `vi.spyOn(window.__TAURI_INTERNALS__, 'invoke')` | Tauri v2 | `__TAURI_IPC__` is v1; v2 uses `__TAURI_INTERNALS__` |
| Separate vitest config file | Can also add `test:` key to vite.config.ts | Always | Separate file is cleaner for Tauri projects |

**Deprecated/outdated:**
- `__TAURI_IPC__`: Tauri v1 API. This project uses Tauri v2 (`@tauri-apps/api@2.10.1`). Use `__TAURI_INTERNALS__` when spying. `mockIPC` abstracts this difference.
- `jest.requireActual()` in Zustand mock file: Jest pattern. Vitest uses `await vi.importActual()`.

---

## Open Questions

1. **Does `Track` struct need `#[derive(Default)]` for cleaner test helpers?**
   - What we know: `db/mod.rs` uses a manual `create_test_track()` helper — works fine.
   - What's unclear: Whether adding `Default` to `Track` would be appropriate and less verbose.
   - Recommendation: Use the same manual helper pattern as `db/mod.rs` to avoid changing production code. Derive `Default` only if a planner thinks it's worth the production code change for test ergonomics.

2. **Should `is_camelot_compatible` be made `pub` for testability?**
   - What we know: It's currently a private method on `TrackContextBuilder`.
   - What's unclear: Whether to test it through the public `build_seed_context` interface or make it `pub(crate)`.
   - Recommendation: Test through `build_seed_context` to avoid exposing private internals. Alternatively, make it `pub(crate)` since it's pure logic worth testing directly.

3. **npm test script naming: `"test"` or `"test:frontend"`?**
   - What we know: Success criteria says `npm test` must run without errors. The `"test"` key in package.json runs via `npm test`.
   - What's unclear: Whether `npm test` is reserved for something else.
   - Recommendation: Use `"test": "vitest run"` to satisfy the success criterion exactly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + jsdom |
| Config file | `vitest.config.ts` (Wave 0 — does not exist yet) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no separate watch mode for CI) |
| Rust command | `cargo test --manifest-path src-tauri/Cargo.toml` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Database CRUD: create/read/update/delete tracks, analysis upsert | Rust unit | `cargo test --manifest-path src-tauri/Cargo.toml db::tests` | Already 30+ tests — verify completeness |
| TEST-02 | AI context builder: build_full_context output, smart/seed filtering, camelot compat | Rust unit | `cargo test --manifest-path src-tauri/Cargo.toml ai::context_builder::tests` | 1 existing test — need ~8 more |
| TEST-03 | BPM detection (120/128/140 BPM) and key detection (C major, A minor, A440) | Rust unit | `cargo test --manifest-path src-tauri/Cargo.toml audio::` | Already 17 tests passing |
| TEST-04 | Vitest configured, `npm test` runs without `__TAURI_INTERNALS__` errors | Infrastructure | `npm test` | Wave 0 — vitest.config.ts + setup.ts missing |
| TEST-05 | musicUtils key compatibility (perfect/compatible/clash) and BPM quality (ok/warn/bad) | Frontend unit | `npm test -- src/lib/musicUtils.test.ts` | Wave 0 — musicUtils.test.ts missing |
| TEST-06 | playerStore queue/shuffle/repeat logic; aiStore checkApiKey/setApiKey state transitions | Frontend unit | `npm test -- src/store/` | Wave 0 — playerStore.test.ts + aiStore.test.ts missing |

### Sampling Rate

- **Per task commit:** `cargo test --manifest-path src-tauri/Cargo.toml` + `npm test`
- **Per wave merge:** Same — full suite is fast (<2s Rust, <5s frontend expected)
- **Phase gate:** Both suites green before completion

### Wave 0 Gaps

- [ ] `vitest.config.ts` — Vitest config with jsdom + setupFiles
- [ ] `src/test/setup.ts` — global IPC mock
- [ ] `src/lib/musicUtils.test.ts` — covers TEST-05
- [ ] `src/store/playerStore.test.ts` — covers TEST-06 (pure logic)
- [ ] `src/store/aiStore.test.ts` — covers TEST-06 (mocked tauriApi)
- [ ] Additional tests in `src-tauri/src/ai/context_builder.rs` — covers TEST-02 gap
- [ ] Framework install: `npm install -D vitest jsdom` — if not done in Wave 0

*(TEST-01 and TEST-03 gaps are already filled — no Wave 0 files needed for those)*

---

## Sources

### Primary (HIGH confidence)

- `cargo test` output (verified 2026-03-01) — 78 Rust tests passing, coverage confirmed
- `src-tauri/Cargo.toml` — actual dependency versions (tempfile 3.14, rusqlite 0.31)
- `package.json` — confirmed Vite 7.3.1, @tauri-apps/api 2.10.1, Zustand 5.0.11
- `npm info vitest@4.0.18 dependencies` — confirmed `vite: '^6.0.0 || ^7.0.0'` in vitest deps

### Secondary (MEDIUM confidence)

- [Tauri v2 Mock API Reference](https://tauri.app/reference/javascript/api/namespacemocks/) — mockIPC, clearMocks signatures confirmed
- [Tauri v2 Mocking Guide](https://v2.tauri.app/develop/tests/mocking/) — WebCrypto beforeAll pattern, mockIPC usage
- [Vitest Getting Started](https://vitest.dev/guide/) — confirmed `vitest: requires Vite >=v6.0.0`
- [Zustand Testing Guide](https://zustand.docs.pmnd.rs/guides/testing) — getInitialState() + setState(init, true) pattern
- [How to setup Vitest in Tauri](https://yonatankra.com/how-to-setup-vitest-in-a-tauri-project/) — jsdom setup, vite.config.ts test block pattern

### Tertiary (LOW confidence)

- WebSearch results on Zustand v5 `getInitialState()` availability — consistent across multiple sources but not directly verified against Zustand 5.0.11 changelog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm info confirmed Vitest 4 + Vite 7 compatibility; actual package.json versions verified
- Architecture: HIGH — Tauri mock API confirmed; Zustand reset pattern from official docs; patterns verified against existing codebase
- Pitfalls: HIGH — most pitfalls derived from actual code analysis + STATE.md known concerns + verified API differences (v1 vs v2 Tauri)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable ecosystem — Vitest, Zustand, Tauri release slowly)
