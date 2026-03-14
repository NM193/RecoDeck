---
phase: 15-eq-audio-engine
verified: 2026-03-13T22:00:00Z
status: human_needed
score: 5/5 must-haves verified (3 fully automated, 2 require live app)
re_verification: false
human_verification:
  - test: "Enable EQ and verify audible bass boost"
    expected: "After calling audioPlayer.setEqEnabled(true) and audioPlayer.setEqBandGain(0, 12), the audio output has a noticeably heavier bass (40 Hz boosted by 12 dB)"
    why_human: "Web Audio API cannot be exercised in a Node.js/static analysis context. getAnalyser() must be called (by Phase 16 UI or DevTools) to initialize the BiquadFilterNode chain before gains apply to audio"
  - test: "Background suspension guard in live app"
    expected: "Switch the app to background for 10+ seconds, return to foreground, audio and EQ continue without interruption or silence"
    why_human: "WebKit AudioContext suspension is a runtime browser behavior that cannot be verified statically. Requires live Tauri app on macOS"
---

# Phase 15: EQ Audio Engine Verification Report

**Phase Goal:** Insert 10-band graphic EQ into Web Audio graph with real-time gain control, crossfade persistence, and background suspension guard
**Verified:** 2026-03-13T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Enabling the EQ and boosting bass (+6 dB at 40 Hz) produces an audible change in the currently playing track | ? NEEDS HUMAN | Code path is correct: `setEqBandGain(0, 12)` + `setEqEnabled(true)` routes through 10 BiquadFilterNodes when `getAnalyser()` is called. No caller of `getAnalyser()` exists yet in frontend (Phase 16 provides the trigger). Audio graph implementation is complete and verified. |
| 2 | Waveform visualizer continues animating with EQ active (no console errors) | ✓ VERIFIED | `WaveformVisualizer.tsx` uses waveformCache (pre-computed waveform data from Rust), not Web Audio AnalyserNode. It is architecturally independent of the EQ chain. No shared state that could cause console errors. |
| 3 | After crossfade completes, EQ gain still applies to the new track | ✓ VERIFIED | `completeCrossfade()` swaps `this.audio` (line 1357). `getAnalyser()` detects the swap via `_vizConnectedTo` guard (line 1109) and reconnects `_vizSource` through `_eqFilters[0]` (lines 1113-1116). EQ filter nodes remain static throughout — no disconnect/reconnect of the filter chain itself. |
| 4 | Switching away from the app for 10+ seconds and returning produces no audio interruption | ? NEEDS HUMAN | `visibilitychange` listener is wired at lines 1098-1105: resumes `_vizCtx` when `document.visibilityState === 'visible'` and `_vizCtx.state === 'suspended'`. Listener reference stored in `_visibilityHandler` and removed in `cleanup()`. Code logic is complete and correct per WebKit bug #231105 pattern. Runtime behavior requires live app verification. |
| 5 | Bypassing the EQ (all gains at 0) sounds identical to before EQ was added | ✓ VERIFIED | `setEqEnabled(false)` ramps all filter gains to 0 dB via `_rampEqGain()` (line 127). BiquadFilterNode at 0 dB gain is acoustically transparent. No topology change (filter nodes stay in graph). No GainNode added that could cause double-gain. `_eqGains` preserved for re-enable (cleanup() does not reset them). |

**Score:** 5/5 truths supported by implementation. 3 verified automatically, 2 require live app smoke testing.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/eqConstants.ts` | EQ_BANDS constant and EqBand type for Phase 16 UI consumption | ✓ VERIFIED | Exists (21 lines). Exports: `BiquadFilterType` union type, `EqBand` interface (freq, label, type, Q fields), `EQ_BANDS` array with exactly 10 entries covering 40Hz–16kHz. Bands 1 and 10 are lowshelf/highshelf; bands 2-9 are peaking. Q values match locked decisions. |
| `src/lib/audioPlayer.ts` | 10-band EQ filter chain, API methods, crossfade reconnect, visibilitychange guard | ✓ VERIFIED | Modified (1561 lines total). All required additions confirmed: 4 private fields, `_rampEqGain()` helper, 5 public methods, filter chain in `getAnalyser()`, crossfade reconnect via `firstNode`, `visibilitychange` listener, cleanup for filters and listener. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/audioPlayer.ts` | `src/lib/eqConstants.ts` | `import { EQ_BANDS } from './eqConstants'` | ✓ WIRED | Line 1 of audioPlayer.ts. `EQ_BANDS` used at lines 64, 136, 154, 155, 1079. `EqBand` type referenced implicitly via the map. |
| `getAnalyser()` source connect | BiquadFilterNode chain entry | `_vizSource.connect(_eqFilters[0])` via `firstNode` variable | ✓ WIRED | Lines 1113-1115: `const firstNode = this._eqFilters.length > 0 ? this._eqFilters[0] : this._vizAnalyser!` then `this._vizSource.connect(firstNode)`. Fallback to `_vizAnalyser` is safe — filters always exist when `_vizCtx` is initialized in the same block. |
| `getAnalyser()` AudioContext init | `document.visibilitychange` handler | `addEventListener` in `_vizCtx` creation block | ✓ WIRED | Lines 1098-1105. Handler stored as `_visibilityHandler` arrow function. Listener added with `document.addEventListener('visibilitychange', this._visibilityHandler)`. Removed in `cleanup()` at lines 1156-1159. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EQAP-01 | 15-01-PLAN.md | User can enable/disable a 10-band graphic equalizer that processes audio in real time | ✓ SATISFIED | `setEqEnabled(boolean)` ramps all filter gains between 0 and stored `_eqGains` values. 10 BiquadFilterNodes created in `getAnalyser()`. `_eqEnabled` state tracked. |
| EQAP-02 | 15-01-PLAN.md | EQ filter chain shares the existing AudioContext with the waveform visualizer (no second MediaElementSource) | ✓ SATISFIED | EQ filters created inside `if (!this._vizCtx)` block in `getAnalyser()`. Topology: `_vizSource -> eqFilters[0..9] -> _vizAnalyser -> destination`. Single `_vizCtx`, single `createMediaElementSource()` call. |
| EQAP-03 | 15-01-PLAN.md | EQ reconnects correctly after a crossfade completes (audio element swap) | ✓ SATISFIED | `completeCrossfade()` swaps `this.audio` (line 1357). Next `getAnalyser()` call detects `this.audio !== this._vizConnectedTo` (line 1109) and reconnects `_vizSource` through `_eqFilters[0]`. Filter nodes themselves never disconnected. |
| EQAP-04 | 15-01-PLAN.md | AudioContext resumes automatically when the app window regains focus (WebKit background suspension guard) | ✓ SATISFIED (code) / ? NEEDS HUMAN (runtime) | `visibilitychange` listener at lines 1098-1105 resumes `_vizCtx` when `visibilityState === 'visible'` and `state === 'suspended'`. Pattern matches WebKit bug #231105 fix. Runtime behavior requires live app. |

**Orphaned requirements check:** REQUIREMENTS.md maps EQAP-01 through EQAP-04 to Phase 15. No additional Phase 15 requirements exist in REQUIREMENTS.md. No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

All EQ methods have real implementations. No TODOs, FIXMEs, or stubs in the modified code. Gain ramp uses proper `cancelScheduledValues + setValueAtTime anchor + linearRampToValueAtTime` pattern throughout. `getEqState()` returns a copy of the internal array (not a reference). `loadEqState()` pads short arrays with zeros. `cleanup()` disconnects all filter nodes and removes the visibility listener without resetting user preference state (`_eqGains`, `_eqEnabled`).

One notable design point (not an anti-pattern): `getAnalyser()` is not currently called by any frontend component. The WaveformVisualizer uses pre-computed waveform data from `waveformCache`, not the Web Audio AnalyserNode. The filter chain only initializes when `getAnalyser()` is first called — this is the intentional lazy-init design documented in the PLAN. Phase 16 EQ UI will provide the first caller.

### Human Verification Required

#### 1. Audible EQ Bass Boost (EQAP-01)

**Test:** Open the Tauri app, play a track, open DevTools console. Run:
```javascript
import('/src/lib/audioPlayer.js').then(m => {
  m.audioPlayer.setEqEnabled(true)
  m.audioPlayer.setEqBandGain(0, 12)  // +12 dB at 40 Hz (lowshelf)
  console.log(m.audioPlayer.getEqState())
})
```
Or if `audioPlayer` is not directly accessible from DevTools, trigger any waveform display (which calls `getAnalyser()` if hooked up) then use the player store's audio player reference.

**Expected:** The bass frequencies (40 Hz region) are noticeably heavier. `getEqState()` returns `{ enabled: true, bands: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0] }`. Running `setEqEnabled(false)` returns audio to its original sound within 30ms.

**Why human:** Web Audio API BiquadFilterNode audio processing is a runtime browser/WKWebView behavior. Static analysis and TypeScript compilation confirm the code is correct, but audible output verification requires the live Tauri app.

#### 2. Background Suspension Guard (EQAP-04)

**Test:** Play a track with EQ active. Press Cmd+H (or switch to another app) for at least 10 seconds. Return to RecoDeck.

**Expected:** Audio resumes at the correct position without silence. EQ gains remain applied. No console errors.

**Why human:** WebKit AudioContext suspension on macOS backgrounding is a runtime OS-level event. The `visibilitychange` listener and `_vizCtx.resume()` call are present in the code, but whether WKWebView actually suspends/resumes the AudioContext as expected requires the live app on macOS hardware.

---

## Summary

Phase 15's goal is the EQ audio engine foundation — not a user-facing feature. The implementation is architecturally complete:

- `src/lib/eqConstants.ts` is created with the full 10-band constant that Phase 16 will consume
- `src/lib/audioPlayer.ts` has the complete filter chain topology, 5 public EQ methods with correct gain ramping, crossfade-safe reconnect, and WebKit suspension guard
- TypeScript compiles with zero errors
- All 4 requirement IDs (EQAP-01 through EQAP-04) are traceable to specific code constructs

The two human verification items are runtime smoke tests. The code-level implementation of both is verified and correct. These items cannot be assessed without the live Tauri app, which is explicitly documented in the PLAN's verification section ("All verification is manual smoke testing against the running Tauri app").

Phase 16 (EQ UI) depends on Phase 15's API surface (`EQ_BANDS`, `setEqBandGain`, `setEqEnabled`, `setAllBands`, `loadEqState`, `getEqState`). All are present and correctly implemented. Phase 16 can proceed.

---

_Verified: 2026-03-13T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
