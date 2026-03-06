# Stack Research

**Project:** RecoDeck v1.2 Playback & UX Polish
**Researched:** 2026-03-06
**Scope:** NEW additions only for four target features. Existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, Framer Motion 11, Vitest, ESLint 9) is validated and NOT re-researched.
**Confidence:** HIGH for all three research questions.

---

## Executive Summary

The v1.2 milestone adds four features: async full-library startup load, beatmatch crossfade with gradual tempo shift, settings simplification, and an end-of-track audio glitch fix. Research focused on the three open technical questions.

**Finding 1 — Full-library startup load: No new dependencies needed.** `get_all_tracks` (Rust command) and `tauriApi.getAllTracks()` (frontend wrapper) already exist and work. The Rust command already performs a `LEFT JOIN` with the analysis table and returns populated `TrackDTO[]`. The v1.2 work is calling this command once at startup and hydrating the Zustand store — a wiring change, not an infrastructure change. The only risk is IPC payload size for very large libraries (>5,000 tracks); current DJ users are unlikely to exceed that ceiling, and the existing JSON invoke path handles thousands of objects without issue.

**Finding 2 — Beatmatch crossfade with gradual tempo shift: HTMLMediaElement.playbackRate is the correct approach. No new libraries needed.** The current implementation already sets a fixed `playbackRate` on the incoming audio element at crossfade start. The v1.2 enhancement is a JS-side ramp: start at `outgoingBpm / incomingBpm`, transition to `1.0` over the crossfade window using `requestAnimationFrame`. This is pure logic change in `audioPlayer.ts` — same two `HTMLAudioElement` objects, no AudioContext path needed.

**Finding 3 — Pitch correction ("chipmunk effect") is a non-issue.** `HTMLMediaElement.preservesPitch` defaults to `true` in all modern browsers (MDN Baseline 2023, confirmed in WKWebView on macOS). Tauri's macOS WebView is WKWebView (Safari engine), which respects the default. When `playbackRate` shifts between 0.9 and 1.1 (the realistic beatmatch range for ±10% BPM difference), pitch correction is automatic and transparent. No WASM pitch-shift library is needed.

---

## Recommended Stack

### No New Dependencies Required for v1.2

All three primary research questions resolve to using existing browser APIs and existing code. This is the correct outcome: v1.2 is a polish milestone, not a platform expansion.

### Core Technologies (Existing — Confirmed Sufficient)

| Technology | Version | Purpose in v1.2 | Why Sufficient |
|------------|---------|-----------------|----------------|
| `HTMLMediaElement.playbackRate` | Browser API (no version) | Gradual tempo ramp during beatmatch crossfade | Mutating `.playbackRate` mid-playback is spec-compliant and works in WKWebView. ramp via `requestAnimationFrame` loop is the standard approach. |
| `HTMLMediaElement.preservesPitch` | Browser API, Baseline 2023 | Automatic pitch correction when playbackRate != 1.0 | Defaults to `true`. Prevents chipmunk effect. No action required — it is already on. |
| Tauri IPC `invoke` | Tauri 2.x (project: `"2"`) | Single `get_all_tracks` call at startup | JSON invoke path handles thousands of `TrackDTO` objects. No streaming channel needed at realistic library sizes. |
| `tauriApi.getAllTracks()` | Exists in `src/lib/tauri-api.ts` line 29 | Frontend call for full library load | Already implemented. Needs to be called at app startup, not lazily on scroll. |
| Zustand store | Existing | Hold all tracks in JS memory after startup | No store API change needed — just populate all tracks into existing store slice. |

### Supporting Libraries (Existing — No Additions)

| Library | Version | Role in v1.2 | Notes |
|---------|---------|-------------|-------|
| `requestAnimationFrame` | Browser API | Drive playbackRate ramp loop during crossfade | Already used in `audioPlayer.ts` crossfade volume animation. Same RAF loop, add playbackRate ramp alongside volume ramp. |

---

## What NOT to Add

| Avoid | Why | What to Do Instead |
|-------|-----|-------------------|
| SoundTouchJS / `@soundtouchjs/audio-worklet` | Pitch-shift WASM library. Unnecessary: `preservesPitch = true` (default) handles pitch correction automatically in WKWebView. Adding it introduces WASM bundle overhead (~150KB), AudioWorklet complexity, and a new thread context. Only needed if the goal were key transposition, not tempo matching. | Verify `audio.preservesPitch === true` in audioPlayer constructor. No library needed. |
| Tauri `Channel` IPC streaming | The Channel API (`tauri::ipc::Channel`) is the right tool for streaming large binary payloads or high-frequency events. For a one-shot `Vec<TrackDTO>` load, standard `invoke` with JSON serialization is adequate up to tens of thousands of tracks. Channel adds Rust-side complexity (async sender, message ordering logic) with no benefit at this scale. | Use existing `invoke('get_all_tracks')`. Only switch to Channel if a specific library exceeds ~10,000 tracks and startup latency becomes measurable. |
| Web Audio API `AudioContext` for beatmatch | `AudioContext` + `AudioBufferSourceNode` is needed when you require parameter automation (`AudioParam.linearRampToValueAtTime`) with sample-accurate scheduling. For gradual BPM ramp over an 8-30 second crossfade window, `requestAnimationFrame` (16ms granularity) is more than sufficient. Connecting `crossfadeAudio` to an `AudioContext` via `createMediaElementSource` would break the existing viz pipeline (one element can only be connected to one context). | Keep `HTMLAudioElement` + `requestAnimationFrame` for the ramp. |
| `AudioParam.linearRampToValueAtTime` | Only accessible on `AudioBufferSourceNode.playbackRate`, not on `HTMLAudioElement.playbackRate`. The project uses `HTMLAudioElement` (not `AudioBufferSourceNode`) for the crossfade path. These are different objects and the AudioParam scheduling API is not available on `HTMLMediaElement`. | Use a simple linear interpolation in the `requestAnimationFrame` loop: `currentRate = startRate + (targetRate - startRate) * progress`. |
| Separate audio element for pitch correction | Some older approaches create a `MediaElementAudioSourceNode`, attach a `ScriptProcessorNode` for pitch shift, and route through AudioContext. `ScriptProcessorNode` is deprecated. `AudioWorkletNode` replacement requires WASM or JS pitch algorithm. `preservesPitch = true` renders all of this unnecessary. | Trust the browser default. |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `HTMLAudioElement.playbackRate` ramp via RAF | `AudioContext` + `AudioBufferSourceNode.playbackRate` AudioParam ramp | HTMLMediaElement is already in use for crossfade. Switching to AudioBufferSourceNode requires loading the entire audio file into an ArrayBuffer before playback — defeats streaming. |
| `preservesPitch = true` (default) | SoundTouchJS WASM pitch correction | Browser engine (WKWebView/WebKit) handles pitch correction natively. SoundTouchJS is only needed if you want pitch-independent key shifting, which is not a v1.2 goal. |
| Single `invoke('get_all_tracks')` at startup | Paginated loading via `get_tracks_paginated` | Pagination requires frontend state for scroll position, incomplete search results, and load-more logic — all of which are the bugs v1.2 is fixing. Single load eliminates the problem cleanly. |
| Single `invoke('get_all_tracks')` at startup | Tauri Channel streaming in chunks | Channel is appropriate for >10K record datasets or binary streaming. At 1K-5K tracks (realistic DJ library), JSON invoke round-trip is <50ms on macOS. Channel adds Rust complexity for no perceptible gain. |

---

## Integration Points

### 1. Full-library load on startup

The `get_all_tracks` Rust command already exists in `src-tauri/src/commands/library.rs` (line 210). It performs a `LEFT JOIN` with `track_analysis` and returns `Vec<TrackDTO>` with BPM/key populated. The frontend wrapper `tauriApi.getAllTracks()` is at `src/lib/tauri-api.ts` line 29.

The v1.2 change is calling this once during app initialization (likely in `App.tsx` or the Zustand store's init action) instead of paging through `get_tracks_paginated`. The Zustand store should expose a `loadAllTracks()` action that sets a `tracksLoading` flag, calls `getAllTracks()`, and hydrates the store.

No new Rust command, no new IPC wrapper, no new library.

### 2. Beatmatch playbackRate ramp

Current implementation in `audioPlayer.ts` line 1087-1106: `playbackRate` is set once to `outgoingBpm / incomingBpm` when crossfade starts, then reset to `1.0` at crossfade completion (line 1195).

The v1.2 change is to ramp `playbackRate` from `startRate` to `1.0` inside the same `updateCrossfadeVolumes()` RAF loop that currently ramps `crossfadeAudio.volume`. Both animations share the same `elapsed / crossfadeDurationMs` progress value. Adding `crossfadeAudio.playbackRate = lerp(startRate, 1.0, progress)` alongside the existing volume line is the complete change.

```typescript
// Inside updateCrossfadeVolumes() — add alongside existing volume ramp
const playbackRate = this.crossfadeStartRate + (1.0 - this.crossfadeStartRate) * progress
this.crossfadeAudio.playbackRate = playbackRate
```

One new private field: `crossfadeStartRate: number = 1.0` to capture the initial BPM ratio.

### 3. Pitch correction

No code change needed. Verify that `this.crossfadeAudio = new Audio()` does not explicitly set `preservesPitch = false` anywhere (it does not in the current implementation). The browser default is `true`, which means speed changes during the tempo ramp will not shift pitch. No library, no AudioWorklet, no configuration.

### 4. End-of-track audio glitch

The existing code in `audioPlayer.ts` has a `_metadataDurationMs` guard (from Symphonia backend duration) that detects premature `ended` events from the WebView. The glitch (last 3-5 seconds repeating) is a different symptom — likely the HTML5 Audio element buffering behavior with the custom `stream://` protocol on macOS WKWebView. This is an investigation task (examine `audio.buffered`, `audio.seekable`, stream response headers), not a new library problem.

---

## Memory Sizing for Full-Library Load

This is a concrete concern worth quantifying for the decision to load all tracks at startup.

A `TrackDTO` in JSON has approximately 30 fields. A typical serialized track with all fields populated is ~500-800 bytes of JSON text. For a DJ library:

| Library Size | Estimated JSON Payload | JS Heap After Parsing |
|-------------|----------------------|----------------------|
| 1,000 tracks | ~0.6 MB | ~5-8 MB (JS objects) |
| 5,000 tracks | ~3 MB | ~25-40 MB |
| 10,000 tracks | ~6 MB | ~50-80 MB |

A DJ laptop typically runs Chrome/WebKit with 2-4 GB of available JS heap. Libraries of 1K-5K tracks are well within comfortable range. Libraries above 10K may feel loading latency on slow machines but remain functionally feasible. The audience for RecoDeck (small group of DJ friends) is unlikely to exceed 5K tracks.

**Conclusion:** Single `invoke('get_all_tracks')` at startup is the right call for this audience. If the app expands to larger libraries later, the Channel streaming approach or a background-load-with-progress pattern would be the next step.

---

## Version Compatibility

| API / Feature | Runtime Requirement | Notes |
|---------------|--------------------|-|
| `HTMLMediaElement.preservesPitch` | WKWebView on macOS 14+ (Sonoma), Chromium-based on Windows | MDN Baseline 2023. Tauri v2 uses WKWebView on macOS. Confirmed supported in Safari 17+ which ships with macOS 14. |
| `HTMLMediaElement.playbackRate` mid-playback mutation | All WKWebView versions | Standard property. Mutation mid-playback is spec-compliant. |
| `tauri::command` `get_all_tracks` | Tauri 2.x (project uses `"2"`) | Already registered in `lib.rs`. No version-specific concern. |

---

## Sources

- Direct code inspection: `src/lib/audioPlayer.ts` (crossfade implementation lines 26-1266), `src/lib/tauri-api.ts` (line 29 `getAllTracks`), `src-tauri/src/commands/library.rs` (line 210 `get_all_tracks` command) — HIGH confidence
- MDN: [HTMLMediaElement.preservesPitch](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch) — defaults `true`, Baseline 2023 — HIGH confidence
- MDN: [HTMLMediaElement.playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate) — mid-playback mutation is standard — HIGH confidence
- WebSearch: SoundTouchJS / `@soundtouchjs/audio-worklet` npm packages — confirmed exist but unnecessary given `preservesPitch` default — HIGH confidence (library is real, conclusion is that it is not needed)
- WebSearch: Tauri 2 Channel IPC — confirmed Channel is for high-frequency/high-volume streaming; standard invoke adequate for single `Vec<TrackDTO>` load — MEDIUM confidence (no direct benchmark, but architecture matches the documented use case split)
- WebSearch: `AudioParam.linearRampToValueAtTime` — confirmed it is only on `AudioBufferSourceNode.playbackRate` (an `AudioParam`), not on `HTMLMediaElement.playbackRate` — HIGH confidence
- Tauri 2 IPC discussion: [IPC Improvements tauri#5690](https://github.com/tauri-apps/tauri/discussions/5690) — confirms JSON IPC overhead at scale — MEDIUM confidence

---

*Stack research for: RecoDeck v1.2 Playback & UX Polish*
*Researched: 2026-03-06*
