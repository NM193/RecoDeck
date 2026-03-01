# Architecture Patterns

**Project:** RecoDeck v1.1 Stabilization & Polish
**Domain:** Desktop music library manager with DJ workflow features
**Researched:** 2026-03-01
**Confidence:** HIGH — based on direct codebase inspection

---

## System Overview

RecoDeck uses a Tauri v2 architecture: a Rust process hosts the app backend, and a WebKit webview renders the React frontend. Communication happens over two channels: Tauri IPC (`invoke()`) for commands, and Tauri events (`emit`/`listen`) for async push. A secondary channel — an embedded Axum HTTP server — serves the mobile PWA over LAN.

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Process                         │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │              React WebView (port 1420 dev)      │    │
│  │                                                │    │
│  │  App.tsx (monolithic state hub)                │    │
│  │    ├── TrackTable (virtualized list)           │    │
│  │    ├── Player + MiniPlayer                     │    │
│  │    ├── FolderTree + Playlists sidebar          │    │
│  │    ├── AI panel overlay (3 components)         │    │
│  │    └── Settings, modals, notifications         │    │
│  │                                                │    │
│  │  State: playerStore (Zustand) + aiStore        │    │
│  │  API layer: tauri-api.ts → invoke()            │    │
│  └───────────────────────┬────────────────────────┘    │
│                          │ IPC                          │
│  ┌───────────────────────▼────────────────────────┐    │
│  │              Rust Backend                       │    │
│  │                                                │    │
│  │  AppState { db: Mutex<Option<Database>>,       │    │
│  │             ai_context_cache: Mutex<...>,      │    │
│  │             db_path: Mutex<...> }              │    │
│  │                                                │    │
│  │  Commands: library, analysis, playlists,       │    │
│  │            genre, settings, watcher, ai,       │    │
│  │            playback, server                    │    │
│  │                                                │    │
│  │  Modules: db, scanner, audio, ai, server,      │    │
│  │           error, formats, external             │    │
│  │                                                │    │
│  │  stream:// protocol handler (lib.rs)           │    │
│  └──────────┬──────────────────────┬─────────────┘    │
│             │ SQLite               │ Axum HTTP         │
│  ┌──────────▼──────────┐ ┌────────▼──────────────┐    │
│  │  recodeck.sqlite    │ │  :8384 LAN server      │    │
│  │  (app data dir)     │ │  REST API + streaming  │    │
│  └─────────────────────┘ └────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                                    │ WiFi
                           ┌────────▼────────┐
                           │  Mobile PWA     │
                           │  (mobile/ dir)  │
                           └─────────────────┘
```

---

## Component Boundaries

### Rust Backend

| Module | File(s) | Responsibility | Communicates With |
|--------|---------|---------------|-------------------|
| `db` | `src-tauri/src/db/mod.rs` | SQLite CRUD, migrations, query layer | Commands (via AppState) |
| `commands/library` | `commands/library.rs` | AppState definition, track CRUD commands, scanner bridge, TrackDTO | All commands share AppState |
| `commands/analysis` | `commands/analysis.rs` | BPM/key/waveform analysis commands, AnalysisDTO types | `audio::bpm`, `audio::key`, `db` |
| `commands/ai` | `commands/ai.rs` | API key mgmt, playlist generation, chat, recommendations | `ai::ClaudeClient`, `ai::TrackContextBuilder`, `db` |
| `commands/playlists` | `commands/playlists.rs` | Playlist CRUD, track ordering | `db`, `AppState` |
| `commands/genre` | `commands/genre.rs` | Genre assignment, genre definitions | `db`, `AppState` |
| `commands/settings` | `commands/settings.rs` | Key-value settings in DB, library folders, theme | `db`, `AppState` |
| `commands/watcher` | `commands/watcher.rs` | `notify` file system watcher, emits Tauri events | `WatcherState`, Tauri emitter |
| `commands/server` | `commands/server.rs` | Start/stop companion Axum server, QR code info | `server::*`, `CompanionState` |
| `commands/playback` | `commands/playback.rs` | Native audio decode commands (OGG fallback) | `audio::decoder`, `PlaybackState` |
| `audio/bpm` | `audio/bpm.rs` | Aubio-based BPM detection on mono PCM | `audio::decoder` |
| `audio/key` | `audio/key.rs` | FFT-based key detection, Camelot mapping | `audio::decoder`, `rustfft` |
| `audio/decoder` | `audio/decoder.rs` | Symphonia decode to mono f32 PCM | Symphonia |
| `audio/waveform` | `audio/waveform.rs` | Waveform data generation | `audio::decoder` |
| `ai/claude_client` | `ai/claude_client.rs` | Claude API HTTP client (reqwest) | `reqwest`, settings |
| `ai/context_builder` | `ai/context_builder.rs` | Condenses library into AI prompt context JSON | `db::Track`, `db::TrackAnalysis` |
| `ai/system_prompt` | `ai/system_prompt.rs` | Static system prompt string | AI commands |
| `scanner` | `scanner.rs` | Directory walk, lofty metadata extraction, SHA-256 hash | `db`, `lofty`, `walkdir` |
| `server/mod` | `server/mod.rs` | Axum app setup, CORS, auth middleware, stream tickets | `routes`, `streaming`, `db` |
| `server/routes` | `server/routes.rs` | REST route handlers, MobileTrackDTO (no file_path) | `CompanionServerState`, `db` |
| `server/streaming` | `server/streaming.rs` | Range-aware audio file streaming with ticket auth | `CompanionServerState`, filesystem |
| `lib.rs` | `lib.rs` | `stream://` URI scheme handler, command registration, app setup | All modules |
| `error.rs` | `error.rs` | `AppError` enum (thiserror + serde tagged), all error variants | All commands |

### React Frontend

| Module | File(s) | Responsibility | Communicates With |
|--------|---------|---------------|-------------------|
| `App.tsx` | `App.tsx` | Central state hub — all UI state as `useState`, orchestrates all components | All components (prop drilling) |
| `tauri-api.ts` | `lib/tauri-api.ts` | IPC wrapper — all `invoke()` calls | Rust commands |
| `http-api.ts` | `lib/http-api.ts` | HTTP API wrapper — `fetch()` to Axum server | Mobile PWA context only |
| `audioPlayer.ts` | `lib/audioPlayer.ts` | `HTMLAudioElement` controller, crossfade, native PCM fallback | `stream://` protocol, Tauri events |
| `musicUtils.ts` | `lib/musicUtils.ts` | Camelot key compatibility, BPM delta classification | AI components |
| `playerStore.ts` | `store/playerStore.ts` | Zustand store — playback state, queue management | `audioPlayer.ts`, components |
| `aiStore.ts` | `store/aiStore.ts` | Zustand store — AI chat state, API key status | `tauri-api.ts`, AI components |
| `TrackTable.tsx` | `components/TrackTable.tsx` | Virtualized track list with TanStack Virtual | `playerStore`, `tauri-api` |
| `Player.tsx` | `components/Player.tsx` | Full transport controls | `playerStore`, `audioPlayer` |
| `MiniPlayer.tsx` | `components/MiniPlayer.tsx` | Detached mini window via `#mini-player` hash route | Tauri events |
| `FolderTree.tsx` | `components/FolderTree.tsx` | Library folder/subfolder navigation tree | `tauri-api` |
| `AIPlaylistDialog.tsx` | `components/ai/AIPlaylistDialog.tsx` | Two-step modal: seed config → AI results | `tauri-api`, `musicUtils` |
| `RecommendationsPanel.tsx` | `components/ai/RecommendationsPanel.tsx` | Slide-in similar track + playlist recommendations | `tauri-api`, `musicUtils` |
| `MixPrepPanel.tsx` | `components/ai/MixPrepPanel.tsx` | Energy arc viz, transition issues, AI reorder | `tauri-api`, `musicUtils` |
| `AIChatPanel.tsx` | `components/ai/AIChatPanel.tsx` | Chat interface for AI assistant | `aiStore` |
| `Settings.tsx` | `components/Settings.tsx` | Settings panel: folders, theme, API key | `tauri-api` |

---

## Data Flow

### Primary Flow: Track Playback

```
User click in TrackTable
  → playerStore.setCurrentTrack(track)
  → audioPlayer.loadTrack(track)
    → builds stream://localhost/?p=<encoded_path>
    → HTMLAudioElement.src = url
    → stream:// handler in lib.rs reads file, serves bytes
    → or: native fallback (Tauri event chunks from audio::decoder)
  → audioPlayer callbacks → playerStore updates (position, isPlaying)
  → Player.tsx re-renders from playerStore
```

### AI Playlist Generation Flow

```
User selects seed track → AIPlaylistDialog opens
  → step 1: energy direction + duration config
  → tauriApi.aiGeneratePlaylistFromSeed(seedId, direction, duration)
    → commands/ai.rs: get_api_key → rebuild_context_cache (if stale)
    → TrackContextBuilder.build_full_context(tracks_with_analysis)
    → ClaudeClient.send_message(system_prompt + context + user request)
    → parse JSON response → GeneratedPlaylist { track_ids, reasoning }
  → step 2: results UI with TransitionIndicator (BPM + key deltas)
  → save → tauriApi.createPlaylist + addTrackToPlaylist calls
```

### Library Scan Flow

```
User adds folder in Settings
  → tauriApi.addLibraryFolder(path)
    → settings.rs: persists to DB
  → tauriApi.scanDirectory(path)
    → library.rs → Scanner::scan_directory()
      → walkdir for audio files
      → lofty: extract metadata per file
      → sha2: compute file hash for deduplication
      → db.create_track() or db.update_track()
    → returns ScanResult { total, imported, skipped, errors }
  → frontend reloads tracks
  → tauriApi.startFileWatcher(path)
    → watcher.rs: notify watcher emits "library-changed" event
    → frontend listens, re-fetches tracks
```

### Error Flow (IPC)

```
Rust command returns Err(AppError::SomeVariant)
  → serde: serialized as { "kind": "SomeVariant", "message": "..." }
  → tauri-api.ts invoke() rejects with this object
  → component catch block:
    → isAppError(e) type guard (from types/ai.ts)
    → getErrorMessage(e) extracts human-readable string
    → OR: aiStore.ts uses instanceof Error (bug — misses structured errors)
```

---

## Integration Points for Testing

### Rust: What Is Already Testable

The Rust backend has extensive existing tests. These are all pure unit tests using in-memory SQLite or synthetic audio data:

| Module | Test Count | Coverage Focus |
|--------|-----------|----------------|
| `db/mod.rs` | ~35 tests | CRUD, migrations, playlist ops, genre, analysis storage |
| `audio/bpm.rs` | ~8 tests | Synthetic click track detection, edge cases |
| `audio/key.rs` | ~12 tests | Pure tone detection, Camelot mapping, edge cases |
| `audio/waveform.rs` | 1 test | Waveform data shape validation |
| `audio/decoder.rs` | 1 test | Decoder stub |
| `scanner.rs` | ~7 tests | Extension filtering, file discovery, hash computation |
| `ai/claude_client.rs` | 2 tests | Request serialization |
| `ai/context_builder.rs` | 1 test | Context JSON shape |
| `commands/ai.rs` | 1 test | ChatMessage serialization |

**Gap:** No tests for command-layer logic (the `commands/*.rs` files that do state locking, DTO conversion, business logic). These are hard to test because they require `State<AppState>` which wraps Tauri internals — but the business logic can be extracted into plain functions.

**Gap:** No integration tests covering scanner → db → analysis → AI context pipeline.

**`tempfile` dev dependency is already declared** (`Cargo.toml` line 50) — this enables creating temp file fixtures for scanner/decoder tests.

### Rust: Test Infrastructure Pattern

```rust
// Pattern already used in db/mod.rs — replicate for other modules:
fn setup_db() -> Database {
    let db = Database::new_in_memory().unwrap();
    db.run_migrations().unwrap();
    db
}

// Pattern for audio tests — already used in bpm.rs + key.rs:
fn generate_click_track(bpm: f64, sample_rate: u32, duration_s: f64) -> MonoAudio { ... }
fn generate_tone(freq: f64, sample_rate: u32, duration_s: f64) -> MonoAudio { ... }
```

### Frontend: Test Infrastructure

**Current state:** Zero frontend tests. No test runner configured. `package.json` has no test script. `vite.config.ts` has no test configuration.

**Recommended addition:** Vitest (not Jest) — Vitest uses the same Vite config, requires minimal setup, and supports ESM modules natively (the project uses `"type": "module"`).

**What is testable without Tauri mocking:**
- `src/lib/musicUtils.ts` — pure functions `getKeyCompatibility()` and `getBpmIssue()` — ideal first test targets
- `src/types/ai.ts` — `isAppError()` type guard and `getErrorMessage()` utility
- `src/store/playerStore.ts` — Zustand store logic (queue management, shuffle, repeat modes)
- `src/store/aiStore.ts` — state transitions (not the async invoke calls)

**What requires mocking:**
- All `tauriApi.*` calls — need `vi.mock('@tauri-apps/api/core')` to stub `invoke`
- `audioPlayer.ts` — requires DOM `HTMLAudioElement` — needs jsdom environment

**Integration point:** Vitest config goes in `vite.config.ts` under a `test` key, or in a separate `vitest.config.ts`. Both work with the existing Vite setup.

---

## Component Restructuring Assessment

### Well-Organized (Leave Alone)

| Component | Reason |
|-----------|--------|
| `src-tauri/src/error.rs` | Clean tagged enum, already used consistently across all commands |
| `src-tauri/src/db/mod.rs` | Single-responsibility database layer with comprehensive test coverage |
| `src-tauri/src/audio/` | Clean module split: decoder, bpm, key, waveform — each independently testable |
| `src-tauri/src/ai/` | Clean separation: client, context builder, system prompt |
| `src-tauri/src/server/` | Well-structured: mod (server setup), routes (API), streaming (audio delivery) |
| `src/lib/musicUtils.ts` | Good extraction — key/BPM logic pulled from AI components |
| `src/lib/tauri-api.ts` | Clean IPC wrapper pattern, does not swallow errors |
| `src/store/playerStore.ts` | Proper Zustand structure, queue management well-separated |
| `src/types/track.ts` + `types/ai.ts` | Type definitions match Rust DTOs correctly |

### Needs Attention (New Work Required)

| Issue | Location | Type | Effort |
|-------|----------|------|--------|
| `audio_mime_type` duplicated | `lib.rs:66` + `server/streaming.rs:214` | Tech debt cleanup | XS — extract to `formats/mod.rs` or `audio/mod.rs`, import in both |
| `greet` stub command still registered | `lib.rs:16,428` | Tech debt cleanup | XS — remove function + handler registration |
| Orphaned `/api/tracks/{id}` route | `server/routes.rs:131` + `http-api.ts:getTrack()` | Tech debt cleanup | XS — route is reachable from mobile PWA only; either use it or delete route + wrapper |
| `isAppError`/`getErrorMessage` never consumed | `aiStore.ts` uses `instanceof Error` | Bug (wrong errors displayed to user) | S — update catch blocks in `aiStore.ts` and AI component catch blocks to use `isAppError()` |
| `App.tsx` as monolithic state hub | `src/App.tsx` (~600+ lines) | UI restructuring | M — extract per-domain state into context providers or additional Zustand stores |
| CSS files scattered alongside components | `components/*.css` pattern | UI polish | S-M — consolidate into CSS modules or keep pattern but audit for duplication |
| `stream://` handler reads entire file into memory | `lib.rs:372-394` | Performance | M — switch to streaming read (BufReader with chunk ranges) for large FLAC/WAV files |
| Disabled updater in App.tsx | `App.tsx:136-156` | Polish/deferred | S — re-enable when tauri-plugin-updater macOS crash is fixed upstream |

### Needs Attention (Restructuring Needed)

| Issue | Location | Recommendation |
|-------|----------|---------------|
| AI components tightly coupled to `App.tsx` props | `App.tsx` drills `aiPlaylistSeedTrack`, `recommendationSeed`, `mixPrepPlaylist` | Extract AI panel state into `aiStore.ts` to replace prop drilling |
| `TrackDTO` has analysis fields always `None` from `From<Track>` | `commands/library.rs:79-82` | Queries should JOIN `track_analysis` table by default for full DTOs — currently done separately |
| Playback commands (`commands/playback.rs`) are vestigial | Rust-side audio decode is only used for OGG fallback | The `PlaybackState` and playback commands could be documented as "OGG fallback only" to avoid confusion |
| `App.tsx` contains ~15 `useState` declarations | `App.tsx:52-121` | Extract: library state (tracks, folders, pagination) → a `libraryStore`, UI overlay state (modals) → local to their parent |

---

## Patterns to Follow

### Pattern 1: AppState Lock Pattern (Rust)

Every command that needs the database uses this exact pattern. Do not deviate — it ensures consistent error messages and prevents lock poisoning from surfacing as panics.

```rust
#[tauri::command]
pub fn my_command(state: State<AppState>) -> Result<MyDTO, AppError> {
    let db_lock = state.db.lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    // db operations here
    Ok(result)
}
```

### Pattern 2: DTO Conversion (Rust)

All data crossing the IPC boundary is serialized via DTO structs (not raw DB structs). This pattern is correct — the `Track` DB struct is not `Serialize`, only `TrackDTO` is. Maintain this distinction.

```rust
// DB struct (not Serialize) -> DTO (Serialize, Deserialize)
let track: Track = db.get_track(id)?;
let dto: TrackDTO = track.into(); // From<Track> for TrackDTO
```

### Pattern 3: AppError Propagation (Rust)

Use `?` with `.map_err()` conversion, not `unwrap()`. The `AppError` variants cover all cases — don't add new error variants unless genuinely needed.

```rust
let result = db.some_operation()
    .map_err(|e| AppError::Database(format!("Operation failed: {}", e)))?;
```

### Pattern 4: Frontend Error Handling (TypeScript)

The correct pattern (partially used — needs to be applied consistently):

```typescript
try {
  const result = await tauriApi.someCommand();
  // handle success
} catch (e: unknown) {
  // Use the type guard — do NOT use instanceof Error
  const message = getErrorMessage(e); // handles AppError + string + unknown
  setError(message);
}
```

**Current bug:** `aiStore.ts` uses `instanceof Error` in catch blocks, which returns `[object Object]` for structured `AppError` objects because `AppError` is a plain object, not an Error instance.

### Pattern 5: In-Memory DB for Rust Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Database {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db
    }

    #[test]
    fn test_something() {
        let db = setup();
        // test operations
    }
}
```

### Pattern 6: Pure Function Extraction for Testability

Business logic that can be extracted from command handlers into plain functions should be. Example from `commands/ai.rs`:

```rust
// Instead of testing via State<AppState> (hard), extract logic:
fn filter_tracks_by_genre(tracks: &[Track], genre: &str) -> Vec<&Track> { ... }

#[cfg(test)]
fn test_filter_tracks() {
    let tracks = vec![/* ... */];
    let filtered = filter_tracks_by_genre(&tracks, "Techno");
    assert_eq!(filtered.len(), 2);
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Widening the AppState Lock Scope

**What:** Holding `db_lock` across async boundaries or across multiple sequential commands.
**Why bad:** Poisons the mutex and deadlocks the entire backend. Every Tauri command that needs DB must acquire and release within its synchronous scope.
**Instead:** Each command acquires its own lock, does its work, drops the guard.

### Anti-Pattern 2: Direct File Path Exposure in Mobile Routes

**What:** Including `file_path` in any mobile API response (routes.rs).
**Why bad:** Exposes local filesystem layout over the network. Existing `MobileTrackDTO` correctly omits `file_path`.
**Instead:** Always use `MobileTrackDTO`, which strips `file_path` and exposes only `filename` (basename only).

### Anti-Pattern 3: Frontend `instanceof Error` for Tauri Errors

**What:** `catch (e) { if (e instanceof Error) ... }` in Tauri command catch blocks.
**Why bad:** Tauri IPC errors serialize as plain objects `{ kind, message }`, not Error instances. `instanceof Error` returns false, so the catch block falls through to the generic case.
**Instead:** Use `isAppError(e)` from `types/ai.ts`, then `getErrorMessage(e)` for user-facing messages.

### Anti-Pattern 4: Adding `#[tauri::command]` Functions to `lib.rs`

**What:** Adding new command functions directly to `lib.rs` rather than in `commands/*.rs`.
**Why bad:** `lib.rs` is already 500+ lines handling stream protocol, app setup, and greet stub. It will grow into a maintenance problem.
**Instead:** Add new commands to appropriate `commands/*.rs` module, register in `lib.rs` `invoke_handler![]`.

### Anti-Pattern 5: Passing Tracks via Tauri Events (Use IPC Instead)

**What:** Serializing large track arrays through Tauri event system.
**Why bad:** Events are for notifications, not data transfer. Large payloads cause performance issues.
**Instead:** Events signal "state changed" → frontend calls IPC to fetch updated data.

---

## Build Order for v1.1 (Dependency Analysis)

Phases should be ordered from lowest coupling to highest, and from most foundational to most visible. Tech debt removal unblocks all other work.

**Phase 1: Tech Debt Elimination (no deps, unblocks everything)**
- Remove `greet` function from `lib.rs` — zero deps
- Extract shared `audio_mime_type` to `audio/mod.rs` — affects `lib.rs` + `server/streaming.rs`
- Fix `isAppError` usage in `aiStore.ts` — affects AI error display across all AI components
- Decide fate of `/api/tracks/{id}` route + `httpApi.getTrack()` — if removing, both sides must be removed together

**Phase 2: Rust Test Coverage (deps: db layer is already tested)**
- Add command-layer unit tests — extract pure functions from `commands/*.rs` first
- Add integration test: scan → db → get_all_tracks round trip (needs `tempfile`)
- Extend scanner tests with actual temp audio files for format coverage

**Phase 3: Frontend Test Coverage (deps: test runner setup first)**
- Install and configure Vitest
- Start with zero-dependency targets: `musicUtils.ts`, `types/ai.ts`
- Then Zustand stores with mocked IPC
- Then component tests with mocked `tauriApi`

**Phase 4: UI/UX Polish (deps: none, but benefits from tech debt being clean first)**
- Spacing, color, animation consistency audit
- Component-level polish in isolation (each component is self-contained)
- MixPrepPanel energy arc improvements
- Notification system polish

**Phase 5: Architecture Cleanup (deps: polish complete, tests in place)**
- Extract library state from `App.tsx` to `libraryStore`
- Extract AI panel state from `App.tsx` props to `aiStore`
- This is the highest-risk phase — requires tests to catch regressions

---

## Scalability Considerations

| Concern | Current Approach | Implication for v1.1 |
|---------|-----------------|----------------------|
| Large libraries (10K+ tracks) | Paginated `get_tracks_paginated`, TanStack Virtual | Already handled; polish pagination UX |
| AI context size | `TrackContextBuilder` truncates to token budget | Works for small-medium libraries; no change needed |
| stream:// memory | Reads entire file into Vec<u8> | Problematic for large FLAC/WAV; streaming read is a deferred optimization |
| Mobile streaming concurrency | `active_streams` atomic counter with max limit | Already capped; no change needed |
| Analysis blocking | Analysis commands block on Rust side (no async) | Acceptable for per-track; batch analysis should stay cancellable via frontend flag |

---

## Sources

- Direct codebase inspection: all `src-tauri/src/**/*.rs` and `src/**/*.{ts,tsx}` files
- `src-tauri/Cargo.toml` — dependency versions confirmed
- `package.json` — frontend dependencies confirmed
- `.planning/MILESTONES.md` — tech debt items catalogued from v1.0 audit
- Confidence: HIGH for all findings (primary source is the codebase itself)
