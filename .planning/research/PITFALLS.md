# Pitfalls Research

**Domain:** Adding playback features + UX polish to existing Tauri v2 + React 19 + Rust desktop music player
**Project:** RecoDeck v1.2 Playback & UX Polish
**Researched:** 2026-03-06
**Confidence:** HIGH — based on direct codebase inspection of audioPlayer.ts, App.tsx, SettingsContext.tsx, constants.ts, settings.rs, and playerStore.ts

---

## Critical Pitfalls

Mistakes that cause rewrites, regressions, or block shipping.

---

### Pitfall 1: playbackRate Beatmatch Causes Chipmunk/Pitch Effect — Web Audio Does Not Preserve Pitch

**What goes wrong:** Setting `HTMLAudioElement.playbackRate` to beatmatch an incoming track speeds up the audio but does NOT pitch-correct it. A track playing at 1.2x rate sounds like a chipmunk. The current crossfade code in `audioPlayer.ts` lines 1086-1107 already does exactly this: it sets `this.crossfadeAudio.playbackRate = this.outgoingBpm / this.incomingBpm`. For a 100 BPM track transitioning into an 80 BPM track, the incoming audio plays at 1.25x speed with audible pitch shift. DJs will notice immediately.

**Why it happens:** `playbackRate` is a time-domain speed multiplier. HTML5 Audio does not apply pitch correction by default. The only way to get pitch-preserved tempo shifting in a browser is via the Web Audio API's `AudioWorklet` with a dedicated pitch-shifting algorithm (phase vocoder or WSOLA), or by using native Rust audio processing. Both are significantly more complex than setting `playbackRate`.

**Consequences:** The beatmatch crossfade feature — one of the four target v1.2 features — sounds wrong from the first use. Users on Discord will immediately report "why does the next track sound like a squirrel." If the feature ships as-is it will require a significant rework post-release.

**How to avoid:** Two options:
1. **Remove pitch shifting entirely**: Keep crossfade volume fading but reset `playbackRate` to 1.0 for the incoming track. This is already done after the crossfade completes in `completeCrossfade()` (line 1195: `this.crossfadeAudio.playbackRate = 1.0`). Just do not set a non-1.0 rate at the start of crossfade. This means "beatmatch crossfade" becomes "volume crossfade with no tempo matching" — honest about what HTML5 Audio can do.
2. **Clamp to near-1.0 range only**: Only apply playbackRate when BPM difference is under ~5% (rate between 0.95 and 1.05). Above this threshold the pitch shift is imperceptible. Below 5% BPM difference, apply gentle rate; above it, skip beatmatch and use plain crossfade. The current clamp (0.5x to 2.0x) allows extreme pitch distortion.

**Warning signs:** During testing, any crossfade between tracks with BPM difference greater than ~5 sounds "wrong" in pitch. This will always repro — it is architectural.

**Phase to address:** Beatmatch crossfade phase. Decision must be made before implementing crossfade trigger logic. The simplest correct path: rename the feature "Crossfade" (not "Beatmatch crossfade"), set playbackRate to 1.0, and ship volume-only crossfade. Beatmatch can be a v1.3 feature with proper pitch correction.

---

### Pitfall 2: playbackRate Limits in WebKit (Tauri macOS) Are Narrower Than Spec

**What goes wrong:** The HTML5 Audio specification allows `playbackRate` values between 0 and positive infinity. WebKit (the WebView engine in Tauri on macOS) imposes its own limits: values below 0.5 or above 4.0 are clamped without error in older WebKit versions. In newer WebKit (macOS 13+), the range is 0.0625 to 16.0. However, some Tauri app users on macOS 12 (Monterey) or Catalina may have older WebKit versions where rates outside 0.5-2.0 are silently ignored. The current clamp in audioPlayer.ts (`Math.max(0.5, Math.min(2.0, playbackRate))`) happens to fall within the safe range, but the code lacks documentation of this constraint, making future changes risky.

**Why it happens:** WebKit's implementation of `playbackRate` is not the same as Chrome/Blink. Since Tauri uses the system WebView (WebKit on macOS, WebView2/Blink on Windows), the supported rate range differs by platform. There is no runtime error when the rate is silently clamped — the audio just plays at the wrong speed.

**Consequences:** Beatmatch calculation produces a rate of e.g. 0.3 (200 BPM track being matched to 60 BPM) and WebKit silently clamps it to 0.5. The crossfade starts at a rate that does not match the calculation. No error is thrown.

**How to avoid:** The existing 0.5-2.0 clamp in `startCrossfadeToNext()` is correct. Add a code comment documenting WHY this range is chosen (WebKit limits). Additionally: before starting crossfade, log the calculated rate and the clamped rate so deviations are visible in the console.

**Warning signs:** Console logs showing a calculated playbackRate that differs from what the audio element actually uses. Test with extreme BPM differences (60 BPM vs 180 BPM = rate of 3.0 — outside the safe zone).

**Phase to address:** Beatmatch crossfade phase. Document constraints before implementation.

---

### Pitfall 3: Drift Accumulation — playbackRate Crossfade Creates Beat Phase Misalignment After Multiple Crossfades

**What goes wrong:** Even if pitch were not an issue, the beatmatch crossfade as designed does not align beats — it only aligns average tempo. When the incoming track starts at rate X to match the outgoing BPM, then resets to 1.0 at crossfade completion, the phase offset between beats on the outgoing track and beats on the incoming track is arbitrary. Each successive crossfade compounds this phase error. After 5 crossfades in a continuous mix, the "matched" tempo is meaningless because the downbeats are completely misaligned.

**Why it happens:** True beatmatch requires knowing the beat grid for each track (the beat position at playback start) and adjusting the playback rate in real time to maintain phase alignment — not just matching average BPM. This requires beat grid analysis (downbeat detection), not just BPM analysis. RecoDeck's Aubio BPM detection produces an average BPM, not a beat grid.

**Consequences:** The beatmatch crossfade feature cannot provide true beat-synchronized transitions. This is acceptable if the feature is marketed as "tempo-matched crossfade" (smooth volume blend with approximate tempo alignment) rather than "beatmatch" (precise beat-grid synchronized mixing). Calling it "beatmatch" sets DJ user expectations that cannot be met.

**How to avoid:** Rename the feature in the UI and settings to "Crossfade" rather than "Beatmatch crossfade." Do not attempt beat-grid-level matching with the current analysis pipeline. Save true beatmatch for a future milestone that adds downbeat detection.

**Warning signs:** DJ users reporting "the beats don't line up during crossfade" — this is correct and expected given the implementation. It is not a bug to fix; it is a feature boundary to communicate.

**Phase to address:** Beatmatch crossfade phase. Scope the feature correctly before building the UI around it.

---

### Pitfall 4: End-of-Track Repeat Bug — crossfadeRafId Not Cancelled on Track Reload Causes Crossfade to Trigger Against the Already-Ended Track

**What goes wrong:** The `completeCrossfade()` function in `audioPlayer.ts` (line 1187) calls `this.onTrackEnded?.()` at the end. The `onTrackEnded` callback in the Player component loads the next track and calls `loadTrack()`. But if a bug causes `onTrackEnded` to fire a second time (e.g., from the stale `crossfadeRafId` RAF loop or from the HTML5 `ended` event that fires on the element being cleaned up), `loadTrack()` is called again immediately. This loads the track after the one that just loaded — causing an apparent "skip" or "wrong track plays." Specific timing: when `completeCrossfade()` calls `this.audio.removeAttribute('src')` on the old element, WebKit may fire an `ended` event on it, which the stale event listener on the old element (not yet garbage collected) may handle, calling `onTrackEnded` again.

**Why it happens:** The stale element check `if (audio !== this.audio) return` in the `ended` listener (line 106) is supposed to prevent this. However: after `completeCrossfade()` swaps `this.audio = newAudio`, `this.setupEventListeners()` is called (line 1207), which attaches a new closed-over `const audio = this.audio` to the new element. The OLD element's listener checks `if (audio !== this.audio)` — where `audio` is the OLD element's reference and `this.audio` is now the NEW element — so the check correctly returns early. This should work, BUT: if `completeCrossfade()` is called while the RAF loop is still running (theoretically prevented by `isCrossfading = false` before the RAF cancel), a race could exist.

**Consequences:** Track appears to "skip" forward by one position in the queue. User hears a brief excerpt of a track before it advances to the next. This matches the reported "end-of-track glitch" symptom.

**How to avoid:** In `loadTrack()`, increment `_loadGeneration` (already done) AND cancel any active crossfade (add `this.abortCrossfade()` at the start of `loadTrack()`). Currently `loadTrack()` does not call `abortCrossfade()` — this is the gap. Also: the `crossfadeFadeComplete` path calls `completeCrossfade()` from the `ended` handler, which then calls `onTrackEnded()`. If `onTrackEnded` calls `loadTrack()` before `completeCrossfade()` finishes resetting state, `isCrossfading` might still be true when the new track's crossfade check runs.

**Warning signs:** Console logs showing "ended event fired" twice in succession. "onTrackEnded callback" logged without a user action. Track index advancing by 2 instead of 1.

**Phase to address:** End-of-track repeat bug fix phase. This is a known existing bug (reported in PROJECT.md: "Fix end-of-track audio glitch"). The crossfade code interaction makes it more complex.

---

### Pitfall 5: Full Library Load Causes React Rerender Storm — 10k+ Tracks Stored in useState Trigger Thousands of Cell Reconciliations

**What goes wrong:** Loading all tracks at once with `setTracks(allTracks)` where `allTracks` has 10,000+ entries causes React to reconcile the entire virtual DOM tree on the TrackTable. Even with `@tanstack/react-virtual` rendering only visible rows, Zustand subscriptions that watch the full `tracks` array will re-run for every component subscribed to that store slice. The current implementation in `App.tsx` already uses pagination (batches of 1000), which is the correct approach. The pitfall is: if async full-library loading is implemented as `getAllTracks()` (which returns all tracks at once), it will cause this rerender storm even with the virtual table.

**Why it happens:** `tauriApi.getAllTracks()` already exists in `tauri-api.ts` (line 29) and returns all tracks. It is tempting to call this for "async full-library loading." But calling `setTracks(await tauriApi.getAllTracks())` with 10k tracks in a single call causes React's batched update to process 10k new array elements, each of which the virtual list must compare to determine visible rows. The IPC round-trip also blocks for longer with larger payloads — Tauri serializes the array to JSON, sends it over IPC, React deserializes it.

**Consequences:** UI freezes for 1-5 seconds on startup or when navigating to "All Tracks" view with a large library. The app feels unresponsive even though it "loaded everything."

**How to avoid:** Keep the pagination approach already in `loadTracks()` (line 387-392 of App.tsx). The v1.2 feature is "async full-library loading" meaning: load immediately on startup without waiting for user navigation, using the existing batch mechanism. Do NOT switch to `getAllTracks()`. Instead: call `loadTracks()` in `initializeApp()` with no folder/playlist argument (triggering the paginated path), then background-load subsequent pages. The IPC call for 1000 tracks takes ~50-100ms; for 10k tracks it can take 1-2 seconds and creates a large JSON payload.

**Warning signs:** `initializeApp()` taking more than 500ms after the database init. UI freeze during "All Tracks" navigation. Memory usage spiking above baseline by more than ~50MB for a 10k track library (each track object serialized through IPC is ~500-1000 bytes in JSON).

**Phase to address:** Async full-library loading phase. Implement as background pagination, not a single `getAllTracks()` call.

---

### Pitfall 6: Search Debounce Against In-Memory Array Does Not Work When Library Is Not Fully Loaded

**What goes wrong:** The current search implementation in App.tsx (line 454-475) uses backend SQL search (`tauriApi.searchTracks(query)`) for the "All Tracks" view — this is correct and will scale. However, if during "async full-library loading" the implementation is changed to load all tracks into frontend memory and do in-memory filtering, search debounce against a 10k+ element array will block the main thread on every keypress. Even with `useMemo` and debounce, filtering 10k objects with `Array.filter()` in the React render cycle is synchronous and blocks UI.

**Why it happens:** In-memory array search is O(n) per keypress per track field searched. At 10k tracks with 5 searchable fields, that is 50k string comparisons per debounce tick. On a modern M-series Mac this is fast (~10ms), but on a Windows machine with a spinning HDD and a loaded library it can exceed 16ms (frame budget) causing jank.

**Consequences:** Search feels laggy during the crossfade window. The existing backend SQL search (`search_tracks` command) already handles this correctly via SQLite FTS or LIKE queries. The risk is in a refactoring decision to "simplify" by doing everything client-side.

**How to avoid:** Keep backend SQL search as the primary search mechanism. The `handleSearch` function in App.tsx already does this correctly. When implementing async full-library loading, do NOT replace backend search with client-side filtering. Use backend search even when tracks are fully loaded locally.

**Warning signs:** `handleSearch` being modified to call `tracks.filter()` instead of `tauriApi.searchTracks()`. Any `Array.filter()` on the full tracks array in a render-path callback.

**Phase to address:** Async full-library loading phase. Verify search path is not changed during the implementation.

---

### Pitfall 7: Settings Removal Without Clearing DB Values Causes Stale Keys to Affect Future Settings With the Same Key Name

**What goes wrong:** The plan is to remove "Key Notation" and "Waveform Style" from the Appearance settings section. The settings values for these (`key_notation` and `waveform_style`) are stored as strings in the SQLite `settings` table (set via `tauriApi.setSetting('key_notation', ...)` and `tauriApi.setSetting('waveform_style', ...)`). If the UI is removed but the DB values are NOT deleted, any future feature that coincidentally uses the same settings key name will inherit a stale value. This is unlikely with these specific names but the pattern is dangerous.

**Why it happens:** SQLite `settings` table is a generic key-value store with no schema enforcement — any key/value pair can be stored. There is no cleanup mechanism for orphaned settings keys. When UI is removed, developers remove the frontend code and the backend handler calls, but the stored data row in SQLite persists across app launches indefinitely.

**Consequences (actual):** The stale `key_notation` value will still be read on `initializeApp()` (App.tsx line 292-299) because App.tsx reads it independently from SettingsContext. If `AppearanceSection.tsx` is modified to remove the Key Notation UI but App.tsx is not updated to stop reading `key_notation`, the app still reads and applies it — just with no UI to change it. This means the "removed" setting still silently controls behavior.

**How to avoid:** Removing a setting requires three steps:
1. Remove the UI component (AppearanceSection handler, constants entry)
2. Remove all `getSetting`/`setSetting` calls for that key across ALL files — search for the string `'key_notation'` and `'waveform_style'` in the entire codebase. App.tsx reads both independently of SettingsContext (lines 292-309).
3. Add a one-time migration: call `setSetting('key_notation', null)` or execute a DELETE on the settings row — OR simply hardcode the value and remove the DB lookup entirely.

Currently, `keyNotation` state in App.tsx (line 64) still reads from `'key_notation'` setting. Removing the Appearance section UI without touching App.tsx leaves the state reading a key the user can no longer change.

**Warning signs:** After removing the settings UI, do a full-text search for the setting key string (`'key_notation'`, `'waveform_style'`) across all source files. If any read calls remain, the removal is incomplete. Use: `grep -r "key_notation\|waveform_style" src/ src-tauri/src/`.

**Phase to address:** Settings removal phase. Audit all read sites before removing any write sites.

---

### Pitfall 8: UI State Not Reset After Removing a Settings Section — Removed Setting's State Still Persists in React Component Tree

**What goes wrong:** `AppearanceSection.tsx` currently reads `keyNotation` and `waveformStyle` from `SettingsContext`. `SettingsContext.tsx` maintains `const [keyNotation, setKeyNotation] = useState('camelot')` and `const [waveformStyle, setWaveformStyle] = useState('traktor_rgb')`. If the goal is to remove Key Notation and Waveform Style options, the state and handlers must be removed from SettingsContext too. Leaving them in the context (even if the UI section is removed) causes unnecessary re-renders when those state values change, and confuses future developers who see state with no UI.

**Why it happens:** When removing a settings section, developers typically remove the UI component first and then verify "it works." But the dead state in SettingsContext compiles and runs without error — it is invisible technical debt. The callbacks `onKeyNotationChanged` and `onWaveformStyleChanged` are props of `SettingsCallbacks` interface (SettingsContext.tsx line 100-101) — if these are removed from the interface, call sites in App.tsx (which passes them as props) will get TypeScript errors, which is the correct signal that cleanup is needed.

**Consequences:** Dead code in SettingsContext. Stale callbacks wiring up event handlers that never fire. When auditing the codebase later, the orphaned state creates confusion about whether key notation is still a feature.

**How to avoid:** When removing a settings option, use TypeScript's type system as a guide. Remove the state from SettingsContextValue interface first — this will produce type errors at all read sites, guiding complete removal. Do NOT leave dead state in the context "just in case."

**Warning signs:** `keyNotation` or `waveformStyle` appearing in SettingsContext after the UI is removed. TypeScript not complaining about `onKeyNotationChanged` despite no UI triggering it.

**Phase to address:** Settings removal phase. Remove from the interface first, let TypeScript errors guide complete cleanup.

---

## Moderate Pitfalls

Mistakes that cause bugs or UX regressions without blocking shipping.

---

### Pitfall 9: HTML5 Audio `ended` Event Fires Multiple Times on WebKit for VBR MP3 Files

**What goes wrong:** The `ended` event can fire multiple times on the same HTMLAudioElement for VBR (Variable Bitrate) MP3 files on WebKit. The audioPlayer.ts already handles this for the native recovery path (the `_nativeRecoveryAttempted` flag prevents infinite loops), but the crossfade code path does not have equivalent protection. If `crossfadeFadeComplete` is true and `ended` fires twice, `completeCrossfade()` is called twice. The second call finds `this.crossfadeAudio` already null (set to null in the first call at line 1204) and returns early (the `if (!this.crossfadeAudio) return` guard at line 1188) — but `this.onTrackEnded?.()` was already called, advancing the queue.

**Why it happens:** WebKit's VBR MP3 duration calculation is inaccurate. It uses a frame-count heuristic that can be wrong by several seconds. When the audio "ends" based on the inaccurate duration, WebKit fires `ended`. If the actual file has more audio, WebKit may fire `ended` again when the audio truly finishes. This is the root cause of the existing "last 3-5 seconds repeat before next track plays" bug.

**Consequences:** Queue advances by 2 tracks instead of 1 for VBR MP3 files. Or the native recovery path and crossfade path interact badly — native recovery fires `onTrackEnded`, then crossfade completion also fires `onTrackEnded`.

**How to avoid:** Add a `_trackEndedFired` boolean flag per track load (similar to `_nativeRecoveryAttempted`). Reset it in `loadTrack()`. Gate `onTrackEnded?.()` calls through this flag — only fire once per loaded track. The existing `nativeFinishPlayback()` already has this pattern via `nativeEndedEmitted`. Apply the same pattern to the HTML path's `ended` handler.

**Warning signs:** Console showing "ended event fired" twice without an intervening `loadTrack`. Track index advancing by 2. This reproduces consistently with VBR MP3 files (most MP3s in a DJ library are VBR).

**Phase to address:** End-of-track repeat bug fix phase. This is the primary bug to investigate.

---

### Pitfall 10: crossfadeAudio Element Not Cleaned Up on Manual Skip or Stop — Memory Leak

**What goes wrong:** If the user manually skips to the next track while a crossfade is in progress, `loadTrack()` is called. `loadTrack()` pauses `this.audio`, creates a new Audio element, and sets up listeners — but does NOT call `abortCrossfade()`. The `this.crossfadeAudio` element is left playing with its RAF loop (`crossfadeRafId`) still running. This means two audio elements are playing simultaneously: the new track on `this.audio` and the leftover crossfade target on the orphaned `this.crossfadeAudio`.

**Why it happens:** `loadTrack()` (line 589) handles cleanup of the HTML audio element and native mode, but does not have a step that aborts any active crossfade. `abortCrossfade()` exists (line 1243) and correctly pauses `crossfadeAudio` and cancels the RAF — it just is not called from `loadTrack()`.

**Consequences:** Audible double-audio: two tracks playing at the same time for the duration of the orphaned crossfade. RAF loop continues consuming CPU. Memory for the crossfade Audio element is not released until the RAF eventually stops.

**How to avoid:** Add `this.abortCrossfade()` as the first step inside `loadTrack()`, before the audio element cleanup. This is a two-line fix with significant impact.

**Warning signs:** After manually skipping a track during crossfade, hearing two audio streams. CPU usage in Activity Monitor not dropping after skip. Console logs from `updateCrossfadeVolumes` continuing after a new track load.

**Phase to address:** End-of-track bug fix phase (crossfade cleanup is part of the same investigation).

---

### Pitfall 11: The `crossfade_enabled` Setting Is Loaded in SettingsContext But AudioPlayer Is Not Notified on App Init

**What goes wrong:** `SettingsContext.tsx` loads `crossfade_enabled` and `crossfade_duration_sec` from the DB on mount (lines 218-220) and sets state. `handleCrossfadeEnabledChange` calls `AudioPlayer.setCrossfadeEnabled()` when the user toggles the switch. But on initial app load, `loadSettings()` reads the persisted crossfade state and calls `setCrossfadeEnabled(loadedCrossfadeEnabled === 'true')` to set React state — it does NOT call `audioPlayer.setCrossfadeEnabled()`. The AudioPlayer singleton always starts with `crossfadeEnabled = false` (line 27). So if the user had crossfade enabled in a previous session, it will appear enabled in Settings UI but will not actually work until the user toggles it off and on again.

**Why it happens:** `SettingsContext` manages UI state but does not have a reference to the `AudioPlayer` singleton. The connection between settings changes and the audio player happens through the `handleCrossfadeEnabledChange` handler, which is only called on user interaction, not on settings load.

**Consequences:** Crossfade appears enabled in Settings but does not function on first launch of a session. The user experiences the first song transition without crossfade even though they configured it. This is a subtle bug that only affects users with crossfade enabled in the previous session.

**How to avoid:** When loading settings on mount, also push the loaded values to the AudioPlayer. This requires SettingsContext to have access to the AudioPlayer instance (or use a global/module-level ref). The cleanest solution: expose crossfade settings to the App component via `onCrossfadeSettingsChanged` callback in `SettingsCallbacks`, and let App push values to the player singleton on load — similar to how `onKeyNotationChanged` works.

**Warning signs:** Crossfade working after toggling the Settings toggle but not on app startup. Testing: enable crossfade, close and reopen the app, play two tracks, observe whether crossfade activates.

**Phase to address:** Beatmatch crossfade phase. The settings-to-player sync must be part of the same implementation.

---

### Pitfall 12: `tracks.length` Stale Closure in `loadMoreTracks` Causes Incorrect Pagination Offset

**What goes wrong:** The `loadMoreTracks` callback in App.tsx (lines 414-452) calculates `const currentOffset = tracks.length`. This is a stale closure: `tracks` is captured at the time `loadMoreTracks` is defined (memoized by `useCallback`). If `loadMoreTracks` is called twice in quick succession before the first call's `setTracks((prev) => [...prev, ...moreTracks])` completes, the second call uses the same `currentOffset` as the first, loading the same batch of tracks twice.

**Why it happens:** React state updates from `setTracks` are batched and async. The `tracks` value inside the `useCallback` closure reflects the value at render time, not after in-flight updates. The `useCallback` dependency array includes `tracks.length` (line 445), which should trigger a re-memoize when tracks change — but rapid successive calls within the same render cycle will use the same snapshot.

**Consequences:** Duplicate tracks appearing in the "All Tracks" view when the user scrolls quickly through a large library. Tracks from page 2 loaded twice, tracks from page 3 skipped.

**How to avoid:** Use a `useRef` for the current offset rather than deriving it from `tracks.length`. Or add an `isLoadingMore` guard (already present in the code, line 418) and ensure it is set synchronously before the first await, which it is — `setIsLoadingMore(true)` is called before the await. The existing guard should prevent double-loads IF `isLoadingMore` state has updated before the second call. React 19's concurrent mode can batch state updates more aggressively. Safest fix: use a `useRef<number>` to track the actual offset that updates synchronously.

**Warning signs:** Duplicate entries in "All Tracks" view after rapid scrolling. `loadTracks` console log showing the same offset being requested twice.

**Phase to address:** Async full-library loading phase. Review pagination implementation before releasing.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Calling `getAllTracks()` for full library load | Single IPC call, simple code | 1-2s freeze at 10k tracks, large IPC payload, serialization pressure | Never for library > 5k tracks |
| In-memory array search instead of backend SQL | No backend changes needed | Blocks main thread at 10k tracks, search lags on keystroke | Never — backend search already exists |
| Setting `playbackRate` for beatmatch without pitch correction | Zero additional complexity | Every DJ user hears chipmunk audio immediately | Acceptable ONLY with 0.95-1.05 rate clamp and clear feature naming |
| Leaving `key_notation` / `waveform_style` reads in App.tsx after removing the settings UI | App still compiles | Setting silently controls behavior with no UI to change it | Never |
| Removing `AppearanceSection` handlers without removing from SettingsCallbacks interface | Fewer files to change | TypeScript allows orphaned callbacks; future confusion about feature status | Never — remove from interface to get type errors at all call sites |

---

## Integration Gotchas

Common mistakes when connecting these new features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AudioPlayer + SettingsContext | Loading crossfade settings but not calling `audioPlayer.setCrossfadeEnabled()` on app init | Push settings to AudioPlayer singleton on `loadSettings()` completion, not just on user toggle |
| CrossfadeAudio + loadTrack | Calling `loadTrack()` without first calling `abortCrossfade()` | Add `this.abortCrossfade()` as first step in `loadTrack()` |
| Crossfade + onTrackEnded | `completeCrossfade()` calls `onTrackEnded()` which calls `loadTrack()` before crossfade state is fully reset | Ensure all crossfade flags (`isCrossfading`, `crossfadeFadeComplete`) are reset BEFORE calling `onTrackEnded()` |
| Paginated load + search | Changing "All Tracks" load to `getAllTracks()` then using `tracks.filter()` for search | Keep `tauriApi.searchTracks()` as the search mechanism regardless of how tracks are loaded |
| Settings removal + App.tsx reads | Removing UI handler without finding all `getSetting('key_notation')` call sites | Grep for the setting key string across ALL source files before and after removal |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `setTracks(await getAllTracks())` | 1-5s UI freeze on navigation to All Tracks | Use paginated loading (already implemented) | At ~5k tracks on average hardware |
| `tracks.filter(...)` in render path for search | Search keystroke causes 16ms+ frame drops | Backend SQL search (already implemented); keep it | At ~2k tracks on slower Windows machines |
| Multiple `listen()` calls in useEffect without `unlisten()` cleanup | Duplicate audio events, double position updates in dev mode | Always return `() => { unlisten.then(fn => fn()) }` from effects | React 19 Strict Mode (dev only), but leaks accumulate in prod on navigation |
| RAF loop not cancelled on crossfade abort | CPU stays elevated after skip during crossfade | Cancel `crossfadeRafId` in `abortCrossfade()` (already done) — ensure `abortCrossfade()` is called from `loadTrack()` | Any time user skips during crossfade |
| `crossfadeAudio` not GC'd after orphaning | Memory grows per orphaned crossfade | Call `removeAttribute('src')` and `.load()` before nulling reference (already done in abortCrossfade) — but only if `abortCrossfade` is called | Repeated skips during active crossfades |

---

## UX Pitfalls

Common user experience mistakes specific to these v1.2 features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Labeling the feature "Beatmatch crossfade" when it only volume-fades | DJ users expect beat-grid-synchronized transitions; they will be disappointed | Name it "Crossfade" and describe as "smooth volume transition with approximate tempo matching" |
| Crossfade duration slider with range 1-30 seconds but no preview | Users do not know what 8 seconds sounds like during transition | The current default of 8s is reasonable; add label hint "(typical: 6-10s for DJ mixing)" |
| Settings removal without in-app transition | Users who saved a specific Key Notation (Camelot) or Waveform Style see it silently reset | Before removal: read the current setting and hardcode it as the default; do not lose user data |
| Full library loading spinner blocking the main view | Users cannot browse while tracks load in the background | Show loading as a subtle indicator in the sidebar track count, not a blocking overlay |
| End-of-track glitch (current bug) fixed but crossfade introduces new double-load | Bug appears fixed in testing but crossfade interaction re-introduces it | Test crossfade + end-of-track together, not separately |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Beatmatch crossfade**: Crossfade visually works (volume fades) but pitch shift is audible — verify rate is either 1.0 or within 5% clamp before shipping
- [ ] **Crossfade enabled on startup**: Settings show "enabled" and crossfade works after toggling — verify crossfade also works WITHOUT toggling after fresh app launch (AudioPlayer init sync)
- [ ] **End-of-track bug fix**: Bug no longer repros in isolation — verify fix also holds during crossfade (crossfade triggers `onTrackEnded` path, which can re-introduce the bug)
- [ ] **Settings removal**: Key Notation and Waveform Style UI removed — verify `getSetting('key_notation')` is also removed from App.tsx lines 292-299, not just from SettingsContext
- [ ] **Async library load**: First 1000 tracks display on startup — verify subsequent pages load without duplicating tracks, and search still uses backend SQL not client-side filter
- [ ] **Skip during crossfade**: Works correctly — verify skipping during an active crossfade does not leave an orphaned audio element playing in the background
- [ ] **Crossfade + shuffle**: Crossfade loads the next track in queue — verify queue index used for crossfade preload matches what the playerStore's `playNext()` would choose (including shuffle state)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitch shift is audible in crossfade | LOW | Set `playbackRate = 1.0` in `startCrossfadeToNext()`, test, ship as "volume crossfade" |
| Orphaned crossfadeAudio playing after skip | LOW | Add `this.abortCrossfade()` to top of `loadTrack()` |
| Settings key still read after UI removal | LOW | Find remaining `getSetting('key_notation')` calls via grep, remove them |
| `onTrackEnded` fires twice from crossfade | MEDIUM | Add `_trackEndedFired` boolean guard, reset in `loadTrack()`, gate callback through it |
| Duplicate tracks from paginated load | MEDIUM | Replace `tracks.length` offset with `useRef<number>` tracking actual loaded count |
| AudioPlayer crossfadeEnabled not synced on init | LOW | Add `audioPlayer.setCrossfadeEnabled(loaded === 'true')` to `loadSettings()` completion |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Pitch shift in playbackRate beatmatch | Crossfade implementation | Listen test with BPM difference > 10%; reject if pitch shift audible |
| WebKit playbackRate limits undocumented | Crossfade implementation | Code review — clamp must be documented with rationale |
| Beat grid misalignment across multiple crossfades | Feature scoping (pre-implementation) | Acceptance criteria must exclude beat-grid-level sync; scope as "volume crossfade" |
| `ended` event firing during crossfade cleanup causes double advance | End-of-track bug fix | Queue index after back-to-back crossfades must be correct |
| Orphaned `crossfadeAudio` on manual skip | Crossfade cleanup | Skip during active crossfade; verify single audio stream and CPU normal |
| Full library load rerender storm | Async library loading | Profile with React DevTools; render count must not spike at track count |
| Search broken by in-memory filtering | Async library loading | Search test after full library load; verify SQL backend is used |
| Stale `key_notation` setting read in App.tsx | Settings removal | Grep for setting key in all source files post-removal |
| Dead state in SettingsContext after removal | Settings removal | TypeScript must have zero references to removed state |
| crossfadeEnabled not synced to AudioPlayer on init | Crossfade + settings integration | Enable crossfade, restart app, play two tracks without toggling settings |
| `loadMoreTracks` stale closure offset | Async library loading | Rapid scroll test; verify no duplicate tracks in All Tracks view |

---

## Sources

- Direct codebase inspection: `src/lib/audioPlayer.ts` (full file, 1300+ lines) — crossfade implementation, `ended` handler, native mode dual-path
- Direct codebase inspection: `src/App.tsx` (lines 1-500) — paginated loading, `loadMoreTracks`, `handleSearch`, `initializeApp`, `key_notation` reads
- Direct codebase inspection: `src/components/settings/SettingsContext.tsx` — settings load/save, crossfade state, callback interface
- Direct codebase inspection: `src/components/settings/AppearanceSection.tsx`, `AudioSection.tsx`, `constants.ts` — which settings exist and their keys
- Direct codebase inspection: `src/components/settings/constants.ts` — confirms THEMES still has "dawn" and "neon" (full set, not just Midnight/Carbon)
- Direct codebase inspection: `src/store/playerStore.ts` — queue management, `playNext()` logic
- Direct codebase inspection: `src-tauri/src/commands/settings.rs` — `get_setting`/`set_setting` are generic key-value; no schema validation on keys
- HTML5 Audio `playbackRate` and pitch: MDN Web Docs — `playbackRate` is time-stretch only; no pitch correction. WebKit implementation limits ~0.5-4.0 range (confirmed behavior, HIGH confidence)
- WebKit `ended` event multiple-fire on VBR MP3: Known WebKit behavior documented in Safari Web Inspector team blog posts and WPT test suite failures (MEDIUM confidence from community reports; HIGH from existing code comments in audioPlayer.ts confirming this is the root cause of the current bug)
- React 19 `useCallback` stale closure with async state: React documentation on concurrent rendering and state batching (HIGH confidence)
- SQLite settings orphan risk: Inherent to the key-value schema design, confirmed from reading settings.rs and SettingsContext.tsx simultaneously

---
*Pitfalls research for: RecoDeck v1.2 Playback & UX Polish milestone*
*Researched: 2026-03-06*
