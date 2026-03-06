# Project Research Summary

**Project:** RecoDeck v1.2 Playback & UX Polish
**Domain:** DJ desktop music library manager — Tauri v2 + React 19 + Rust
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

RecoDeck v1.2 is a polish milestone targeting four concrete improvements to an already-functional desktop app: full async library loading, beatmatch crossfade with gradual tempo ramp, settings simplification, and an end-of-track audio glitch fix. All four features are partially or fully scaffolded in the codebase. Research was codebase-inspection-first, not blue-sky design — every finding is tied to a specific file and line range. No new dependencies are required for any of the four targets.

The recommended approach is surgical: three of the four features require changes to a single file each (`audioPlayer.ts` for crossfade and end-of-track, `App.tsx` for library loading), with a four-file cleanup sweep for settings. The most significant architectural decision is replacing the paginated `getTracksPaginated(1000, 0)` startup call with a single `getAllTracks()` call and removing the scroll-to-load-more infrastructure entirely. This is appropriate for the target audience (small DJ friend group, likely <5K tracks) and eliminates the incomplete-queue bugs that motivated the feature in the first place.

The primary risk area is crossfade: pitch artifacts from `playbackRate` changes were flagged as a critical concern by PITFALLS research, but STACK research confirmed that `HTMLMediaElement.preservesPitch` defaults to `true` in WKWebView (MDN Baseline 2023), making rate ramps safe without additional pitch-shift libraries. The end-of-track glitch has a one-line root cause fix: `SEEK_MARGIN_MS` is `10000` ms and must be reduced to `3000`. Settings cleanup must use TypeScript's type system as a guide — remove from interfaces first so the compiler surfaces all remaining read sites.

## Key Findings

### Recommended Stack

No new dependencies are required for v1.2. The existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, HTMLAudioElement) is fully sufficient for all four target features.

**Core technologies:**
- `HTMLMediaElement.playbackRate` — drives the beatmatch tempo ramp; mutating mid-playback is spec-compliant in WKWebView
- `HTMLMediaElement.preservesPitch` — defaults to `true` (WKWebView, MDN Baseline 2023); eliminates chipmunk effect from rate changes without any library
- `requestAnimationFrame` — already used for crossfade volume animation in `audioPlayer.ts`; the rate ramp adds one linear interpolation line to the same loop
- Tauri IPC `invoke('get_all_tracks')` — existing command and wrapper; handles thousands of TrackDTO objects in a single JSON round-trip; adequate for <5K track libraries without Channel streaming
- Zustand `playerStore` — flat array queue; once fully loaded, `setQueue(tracks, index)` always has the complete library

**What NOT to add:**
- SoundTouchJS or WASM pitch correction — `preservesPitch=true` default makes this unnecessary
- Tauri `Channel` IPC streaming — appropriate for >10K records or binary payloads; standard invoke is adequate here
- Web Audio API or AudioContext — would break the existing HTMLAudioElement viz pipeline and require full-file buffering before playback

See `.planning/research/STACK.md` for full rationale and memory sizing estimates by library size.

### Expected Features

**Must have (table stakes):**
- App usable on startup with library loading in background — current pagination produces an incomplete library visible to queue-building and AI context
- Visual indicator during background library load — prevents blank-library confusion on larger collections
- End-of-track plays to clean completion then advances — the current 3-5 second repeat is the most visible bug and makes the app feel broken
- Settings removal is transparent — existing users get Camelot and Traktor RGB defaults; no migration needed; dead SQLite rows are harmless

**Should have (differentiators):**
- Beatmatch crossfade with gradual tempo ramp — incoming track plays at matched BPM, ramping to native BPM over the crossfade window; DJ-centric behavior that makes transitions feel intentional
- NowPlayingBar shows incoming track name during crossfade — wire `isCrossfadingState` getter through player store into the bar; currently unconnected
- Full library available for queue-building and AI context — side effect of async full-library load; no extra work

**Defer to v1.3+:**
- Crossfade in native (Rust PCM) decoder mode — dual backend decoder, PCM mixing in Rust; high complexity for marginal benefit
- Beat-grid-level beatmatch — Aubio produces average BPM, not a beat grid; true sync requires a downbeat detection milestone
- Key Notation toggle restoration — if users request it, add as a simple display toggle, not a settings screen entry

See `.planning/research/FEATURES.md` for UX behavior tables and competitor reference behavior (Rekordbox, Traktor Pro).

### Architecture Approach

All v1.2 changes touch two primary files (`audioPlayer.ts`, `App.tsx`) and a four-file settings sweep. No new Rust commands, no new components, no new IPC wrappers are needed. The existing component boundaries are correct. The `get_all_tracks` Rust command already exists in `library.rs` with a `LEFT JOIN` to `track_analysis`, returning populated `TrackDTO[]` including BPM and key.

**Files modified per feature:**
1. **End-of-track fix** — `src/lib/audioPlayer.ts`: change `SEEK_MARGIN_MS` constant from `10000` to `3000` (one line); also add `this.abortCrossfade()` at top of `loadTrack()` to prevent orphaned audio elements
2. **Beatmatch rate ramp** — `src/lib/audioPlayer.ts`: add `beatmatchStartRate` private field; store it in `startCrossfadeToNext()`; add per-frame linear interpolation `lerp(beatmatchStartRate, 1.0, progress)` in `updateCrossfadeVolumes()` RAF loop; reset in `abortCrossfade()` and `completeCrossfade()`
3. **Full library load** — `src/App.tsx`: replace `setTracks([])` in `initializeApp()` with `getAllTracks()` call; add `allTracksRef` for zero-round-trip search-clear restore; remove `hasMoreTracks`, `isLoadingMore`, `loadMoreTracks`, and scroll trigger in `TrackTable`
4. **Settings cleanup** — 4-file sweep: `AppearanceSection.tsx` (remove subsections), `constants.ts` (remove arrays), `SettingsContext.tsx` (remove state and callbacks from interfaces), `App.tsx` (remove reads and prop threading)

**One integration gap found by research:** `SettingsContext` loads `crossfade_enabled` from DB on mount but does NOT push the loaded value to the `AudioPlayer` singleton. Result: crossfade appears enabled in Settings on relaunch but does not activate until the user toggles it. This must be fixed as part of the crossfade phase.

**Major components unchanged:** `db/mod.rs`, `commands/library.rs`, `playerStore.ts`, `tauri-api.ts`, all AI components, mobile server, stream protocol handler.

See `.planning/research/ARCHITECTURE.md` for the complete component boundary diagram and recommended build order.

### Critical Pitfalls

1. **Chipmunk effect is resolved by `preservesPitch=true`** — PITFALLS raised pitch shift as a critical blocker. STACK research confirmed `preservesPitch` defaults to `true` in WKWebView (Baseline 2023). Rate ramps within the existing `[0.5, 2.0]` clamp are safe. The clamp rationale must be documented in code comments. No library needed.

2. **End-of-track root cause is `SEEK_MARGIN_MS = 10000`** — the native recovery path seeks 10 seconds back when WebKit fires a premature `ended` event on VBR MP3 files. VBR premature-end typically fires 1-3s from true EOF, so users hear 7-9 seconds of replay. Reduce to `3000` ms. Do not use `timeupdate` pre-arming — it adds state complexity and crossfade race conditions.

3. **`crossfadeAudio` orphaned on manual skip** — `loadTrack()` does not call `abortCrossfade()`. If the user skips during an active crossfade, two audio streams play simultaneously and the RAF loop continues consuming CPU. Fix: add `this.abortCrossfade()` as the first call in `loadTrack()`.

4. **`onTrackEnded` can fire twice on VBR MP3** — WebKit fires `ended` multiple times. The native recovery path is protected by `_nativeRecoveryAttempted`. The crossfade completion path is not equivalently protected. If double-advance persists after the `SEEK_MARGIN_MS` fix, add a `_trackEndedFired` boolean flag reset in `loadTrack()`, gating `onTrackEnded?.()`.

5. **Settings cleanup requires full-codebase grep** — `key_notation` is read in BOTH `SettingsContext.tsx` AND `App.tsx` independently. Removing the UI without removing both read sites leaves the setting silently controlling behavior with no UI to change it. Verification: `grep -r "key_notation\|waveform_style" src/` must return zero hits after cleanup.

6. **Crossfade settings not synced to AudioPlayer on init** — `loadSettings()` sets React state but never calls `audioPlayer.setCrossfadeEnabled()`. Push loaded settings to the singleton at `loadSettings()` completion.

See `.planning/research/PITFALLS.md` for the full 12-pitfall catalog with warning signs, recovery strategies, and a "Looks Done But Isn't" checklist.

## Implications for Roadmap

Research converges on a build order driven by three constraints: (1) smallest blast radius first, (2) independent tasks before interdependent ones, (3) end-of-track fix before crossfade because both share the `onTrackEnded` code path.

### Phase 1: Settings Cleanup

**Rationale:** Fully independent of all other features. No audio code changes. TypeScript-verifiable — remove from interfaces first, let compile errors surface all remaining read sites. Removes prop-chain noise from subsequent testing of audio features. Delivers immediate visible product change (simpler settings panel) at near-zero risk.

**Delivers:** Smaller SettingsContext. Hardcoded Camelot + Traktor RGB defaults. Removal of `keyNotation` / `waveformStyle` prop chains from `App.tsx`. TypeScript zero-reference verification.

**Addresses:** Settings simplification target (P1 priority, FEATURES.md)

**Avoids:** Pitfall 7 (stale DB keys silently controlling behavior if reads remain in App.tsx), Pitfall 8 (dead state in SettingsContext confusing future developers)

**Implementation notes:** 4-file sweep. Verify with grep returning zero hits for `key_notation` and `waveform_style` in `src/`. SQLite rows left in place — harmless, no migration needed.

**Research flag:** None — standard TypeScript cleanup pattern, fully specified.

### Phase 2: End-of-Track Repeat Fix

**Rationale:** One-line root cause fix (`SEEK_MARGIN_MS` 10000 to 3000). Testable immediately with any VBR MP3. Does not touch crossfade logic. Must be fixed before crossfade verification because both features share the `onTrackEnded` callback path and the crossfade can re-introduce the double-advance bug if the underlying path is not stable.

**Delivers:** Clean track advancement without 3-5 second repeat on VBR MP3 files. Orphaned crossfadeAudio protection via `abortCrossfade()` at top of `loadTrack()`.

**Addresses:** End-of-track glitch (P1 priority, highest-impact visible bug, FEATURES.md)

**Avoids:** Pitfall 4 (double-fire `ended` during crossfade cleanup), Pitfall 9 (VBR MP3 multiple `ended` events), Pitfall 10 (orphaned crossfadeAudio memory and CPU leak on manual skip)

**Implementation notes:** `audioPlayer.ts` only. Change constant. Add `abortCrossfade()` call. Both changes in the same commit. Test with VBR MP3 files of varying lengths and bitrates.

**Research flag:** None — root cause identified by direct code inspection with HIGH confidence.

### Phase 3: Beatmatch Crossfade Rate Ramp

**Rationale:** Builds on the stable `onTrackEnded` path from Phase 2. The core crossfade volume animation already works. This phase adds the gradual rate ramp alongside it and resolves the settings-to-AudioPlayer sync gap discovered during research.

**Delivers:** Incoming track ramps from matched BPM to native BPM over the crossfade window via per-frame `playbackRate` interpolation in the existing RAF loop. Crossfade settings applied on app startup without requiring the user to toggle the switch.

**Addresses:** Beatmatch crossfade (P1 for edge-case verification and completion), optional NowPlayingBar crossfade indicator (P2)

**Avoids:** Pitfall 1 (chipmunk — resolved by `preservesPitch=true`; rate ramp is safe), Pitfall 2 (WebKit rate limits — existing [0.5, 2.0] clamp is correct, needs documenting comment), Pitfall 11 (crossfade settings not synced to AudioPlayer on startup)

**Implementation notes:**
- `audioPlayer.ts`: add `private beatmatchStartRate: number = 1.0`; store in `startCrossfadeToNext()`; add `lerp(beatmatchStartRate, 1.0, progress)` in `updateCrossfadeVolumes()`; reset in `abortCrossfade()` and `completeCrossfade()`
- `SettingsContext.tsx` or `App.tsx`: call `audioPlayer.setCrossfadeEnabled(loaded === 'true')` and `audioPlayer.setCrossfadeDuration(loadedSeconds)` at end of `loadSettings()` completion
- Optional: wire `isCrossfadingState` getter through player store into `NowPlayingBar` for crossfade indicator

**Testing:** Listen test at ±5, ±10, ±20 BPM differences. Verify no audible pitch shift. Verify crossfade activates on fresh app launch without toggling Settings.

**Research flag:** None — implementation fully specified by ARCHITECTURE.md with exact code snippets.

### Phase 4: Async Full-Library Load

**Rationale:** Widest surface area — touches `App.tsx` state management, pagination infrastructure removal, search restore logic, and queue integrity. Goes last because it validates against the clean, stable audio foundations from Phases 2 and 3. The queue must be correct before verifying crossfade look-ahead works on the full library.

**Delivers:** Complete library in memory after startup (estimated <1s for 1K tracks, <3s for 5K tracks). Scroll-to-load-more infrastructure removed. Queue always contains the full library for AI and "Play All". `allTracksRef` for zero-round-trip search-clear restore. Subtle loading indicator in sidebar track count.

**Addresses:** Async full-library load (P1), Library loading indicator (P2), Queue completeness for AI context

**Avoids:** Pitfall 5 (rerender storm — non-issue for <5K tracks; test with realistic library and measure startup time), Pitfall 6 (search must stay on backend SQL via `tauriApi.searchTracks()`, not `tracks.filter()`), Pitfall 12 (stale closure offset — eliminated by removing `loadMoreTracks` entirely)

**Implementation notes:**
- `App.tsx`: in `initializeApp()`, replace `setTracks([])` block with `getAllTracks()` call; populate `allTracksRef.current` for search-clear; set `hasMoreTracks = false`
- Remove `loadMoreTracks`, `isLoadingMore`, `hasMoreTracks` state and the scroll trigger in `TrackTable`
- `handleSearch` clear path: restore from `allTracksRef.current` instead of re-fetching from Rust
- Add loading indicator visible only during the `getAllTracks()` call (subtle text or animated count in sidebar header)
- Verify `handleSearch` still calls `tauriApi.searchTracks()` backend SQL — not `tracks.filter()`

**Testing:** (a) startup latency acceptable on target hardware, (b) SearchView still uses backend SQL after full load, (c) queue correct when clicking a track in All Tracks view after a search-and-clear, (d) no duplicate tracks.

**Research flag:** Startup time with realistic 5K library — measure actual IPC round-trip to validate the <50ms STACK estimate. If startup latency exceeds 300ms, add a loading spinner in the track list area rather than only in the sidebar count.

### Phase Ordering Rationale

- Settings cleanup first: zero audio risk, TypeScript-verifiable, removes prop-chain noise before any audio testing
- End-of-track before crossfade: both share `onTrackEnded`; fix the shared path before building more logic on top of it
- Crossfade before full-library load: crossfade uses BPM from queue; full library load changes queue population; validate crossfade against the current queue before changing queue infrastructure
- Full library load last: widest blast radius; requires all other features stable to validate queue integrity end-to-end

### Research Flags

All open technical questions were resolved by codebase inspection and STACK research. No phase requires `/gsd:research-phase`.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Settings Cleanup):** Mechanical TypeScript cleanup fully documented in FEATURES.md and ARCHITECTURE.md
- **Phase 2 (End-of-Track Fix):** Root cause identified; fix is one constant change
- **Phase 3 (Beatmatch Rate Ramp):** Implementation fully specified in ARCHITECTURE.md with exact code snippets; `preservesPitch` behavior confirmed in STACK.md
- **Phase 4 (Full Library Load):** Pattern specified in ARCHITECTURE.md; only open question is startup latency, which is a measurement task not a research task

## Conflict Resolutions

Three research files produced conflicting recommendations. All three are resolved here with a clear winner.

**Conflict 1 — Full library load strategy:**
PITFALLS warned against `getAllTracks()` citing rerender storm and IPC latency for 10K+ libraries. ARCHITECTURE (from live codebase inspection) recommends `getAllTracks()` and explicitly removes pagination infrastructure, noting the target audience is a small DJ friend group unlikely to exceed 5K tracks. STACK confirms JSON invoke handles thousands of objects and provides memory sizing estimates (5K tracks ~3MB JSON, ~25-40MB JS heap — well within range).

**Resolution: Use `getAllTracks()` per ARCHITECTURE.** The rerender storm concern in PITFALLS applies to the abstract 10K+ case. For the actual target audience (<5K tracks), the single call is correct and eliminates the incomplete-queue bugs. Measure startup latency during Phase 4 implementation; document a 300ms threshold for showing a loading spinner.

**Conflict 2 — Beatmatch crossfade: snap vs. gradual ramp:**
FEATURES said the snap-at-start is correct because continuous ramp causes WebKit audio artifacts. ARCHITECTURE said implement per-frame ramp in the RAF loop (gradual behavior). STACK confirmed `preservesPitch=true` eliminates pitch distortion from rate changes in WKWebView.

**Resolution: Implement per-frame ramp per ARCHITECTURE.** FEATURES' concern was specifically about pitch artifacts, which STACK research resolved. The gradual ramp from matched BPM to native BPM over the crossfade window is the user-perceived improvement over the current snap. The RAF loop linear interpolation is the correct implementation path and is safe with pitch correction on by default.

**Conflict 3 — End-of-track repeat fix approach:**
PITFALLS discussed the bug and suggested a `_trackEndedFired` boolean guard as primary fix. ARCHITECTURE identified the actual root cause: `SEEK_MARGIN_MS = 10000` causes 10 seconds of seek-back, producing audible replay.

**Resolution: Reduce `SEEK_MARGIN_MS` from `10000` to `3000` per ARCHITECTURE.** This is the direct fix for the root cause. The `_trackEndedFired` guard from PITFALLS remains valid as a secondary defense if the constant reduction alone does not eliminate all double-advance symptoms, but it should not be the primary approach.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from MDN official documentation + direct codebase inspection. `preservesPitch` Baseline 2023 is authoritative. IPC payload estimates are conservative estimates, not benchmarks — sufficient for the go/no-go decision. |
| Features | HIGH | Based on direct code inspection of all affected files. DJ app UX conventions are well-established. One MEDIUM claim: specific crossfade pitch behavior conventions (domain knowledge, not spec). |
| Architecture | HIGH | All recommendations tied to specific file paths and line ranges from live codebase inspection. Build order derived from actual dependency analysis, not speculation. |
| Pitfalls | HIGH | Core pitfalls identified by reading the exact lines that will be modified. One MEDIUM: WebKit VBR MP3 double-ended-event from community reports, corroborated by the existing `_nativeRecoveryAttempted` recovery code in `audioPlayer.ts`. |

**Overall confidence:** HIGH

### Gaps to Address

- **Startup latency with 5K library:** The <50ms IPC estimate for `getAllTracks()` is architectural inference, not a benchmark. Measure actual startup time during Phase 4. If it exceeds 300ms, add a loading spinner in the track list area (not just the sidebar count).

- **`preservesPitch` on macOS 12 (Monterey):** Confirmed Baseline 2023, supported Safari 17+ / macOS 14+. If any target user is on macOS 12, verify `preservesPitch` defaults to `true` on that WKWebView version. Fallback if needed: clamp rate ramp to [0.95, 1.05] range where pitch shift is imperceptible regardless.

- **`onTrackEnded` double-fire protection:** The `_trackEndedFired` boolean guard (Pitfall 9) is recommended but not implemented. If the `SEEK_MARGIN_MS` reduction resolves the symptom completely, defer the guard. If double-advance persists, add it in Phase 2.

- **NowPlayingBar crossfade indicator (P2 optional):** `isCrossfadingState` getter exists on `AudioPlayer` but is not wired to the Zustand player store. Include in Phase 3 if time allows — requires one store slice addition and one NowPlayingBar conditional render. Not blocking for audio correctness.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/lib/audioPlayer.ts` (~1350 lines) — crossfade logic, `ended` handler, `SEEK_MARGIN_MS` constant, `updateCrossfadeVolumes()` RAF loop, all v1.2 change points
- `src/App.tsx` (lines 1-550) — `initializeApp()`, `loadTracks()` pagination, `handleSearch()`, `key_notation` reads in both `initializeApp` and state
- `src/components/settings/AppearanceSection.tsx` — Key Notation and Waveform Style subsection locations
- `src/components/settings/SettingsContext.tsx` — settings state shape, `loadSettings()`, `SettingsCallbacks` interface
- `src/components/settings/constants.ts` — `KEY_NOTATIONS`, `WAVEFORM_STYLES` arrays
- `src-tauri/src/commands/library.rs` — `get_all_tracks` command, LEFT JOIN with track_analysis, TrackDTO shape
- `src/lib/tauri-api.ts` — `getAllTracks`, `getTracksPaginated`, `countTracks` wrappers (line 29)
- `src/store/playerStore.ts` — queue management, flat array queue structure
- `.planning/PROJECT.md` — v1.2 feature targets, audience, constraints
- MDN: `HTMLMediaElement.preservesPitch` — defaults `true`, Baseline 2023
- MDN: `HTMLMediaElement.playbackRate` — mid-playback mutation is spec-compliant

### Secondary (MEDIUM confidence)
- WebKit VBR MP3 double `ended` event — community reports and WPT test suite failures; corroborated by existing `_nativeRecoveryAttempted` recovery pattern in `audioPlayer.ts`
- Tauri IPC JSON payload performance at scale — architectural inference from documented invoke vs. Channel use case split; not a direct benchmark
- IPC round-trip timing estimates (<50ms for 1K tracks) — conservative estimate consistent with JSON serialization at this scale

### Tertiary (LOW confidence)
- macOS 12 (Monterey) WKWebView `preservesPitch` behavior — Baseline 2023 implies macOS 14+ / Safari 17+; older WKWebView behavior not directly verified

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
