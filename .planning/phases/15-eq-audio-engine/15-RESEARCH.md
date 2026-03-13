# Phase 15: EQ Audio Engine - Research

**Researched:** 2026-03-13
**Domain:** Web Audio API — BiquadFilterNode chain, AudioContext management, crossfade reconnect
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Band Frequencies**
- DJ-weighted 10 bands: 40, 80, 160, 320, 640, 1300, 2500, 5000, 10000, 16000 Hz
- Band 1 (40 Hz): low-shelf filter, Q = 0.7 (gentle slope)
- Bands 2-9 (80 Hz - 10 kHz): peaking filters, Q = 1.4 (~1 octave bandwidth)
- Band 10 (16 kHz): high-shelf filter, Q = 0.7 (gentle slope)
- Export `EQ_BANDS` constant with freq, label, type, Q for each band — single source of truth for Phase 16 UI

**Gain Range & Smoothing**
- Range: ±12 dB per band
- All gain changes use `linearRampToValueAtTime` with 30ms ramp duration
- Same 30ms ramp for slider changes, preset application, and bypass toggle
- No instant `setValueAtTime` — always ramped to eliminate clicks/pops

**API Surface** — methods directly on AudioPlayer class (matches existing `setCrossfadeEnabled` pattern):
- `setEqBandGain(index: number, dB: number)` — set single band
- `setEqEnabled(enabled: boolean)` — toggle bypass
- `setAllBands(gains: number[])` — set all 10 bands at once (for presets)
- `loadEqState(state: { enabled: boolean, bands: number[] })` — atomic restore for persistence
- `getEqState(): { enabled: boolean, bands: number[] }` — getter for UI reads
- No callback/subscription pattern — UI reads state via getter on mount and after changes

**Bypass Behavior**
- Bypass = set all gains to 0 dB (filters stay in audio graph, acoustically transparent)
- No disconnect/reconnect of filter chain — avoids crossfade race conditions
- Re-enabling restores previous band gain values from memory
- Bypass toggle uses same 30ms ramp (smooth mute/unmute)

**Crossfade Reconnect**
- EQ filter nodes are static after init — never disconnected/reconnected on crossfade
- Only `_vizSource` reconnects when `completeCrossfade()` swaps `this.audio`
- Graph: `_vizSource → eqFilter[0..9] → _vizAnalyser → _vizCtx.destination`
- Existing `_vizConnectedTo` guard in `getAnalyser()` handles source reconnection

**WebKit Background Suspension Guard**
- `visibilitychange` listener resumes `_vizCtx` AudioContext only
- EQ band gains persist in BiquadFilterNode params — no re-application needed after resume

### Claude's Discretion
- Internal filter chain initialization order and error handling
- Exact `EQ_BANDS` constant structure (array of objects vs separate arrays)
- How to handle edge case of `getAnalyser()` called before EQ init
- Native PCM mode: EQ is a no-op (documented constraint)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EQAP-01 | User can enable/disable a 10-band graphic equalizer that processes audio in real time | BiquadFilterNode chain in `_vizCtx`; `setEqEnabled()` ramps gains to 0/restore |
| EQAP-02 | EQ filter chain shares the existing AudioContext with the waveform visualizer (no second MediaElementSource) | `createMediaElementSource()` can only be called once per element; EQ inserts between `_vizSource` and `_vizAnalyser` in the existing `_vizCtx` |
| EQAP-03 | EQ reconnects correctly after a crossfade completes (audio element swap) | Filter nodes are static — only `_vizSource` reconnects; existing `_vizConnectedTo` guard in `getAnalyser()` already triggers on `this.audio` swap |
| EQAP-04 | AudioContext resumes automatically when the app window regains focus (WebKit background suspension guard) | `visibilitychange` → `_vizCtx.resume()` pattern; BiquadFilterNode AudioParams persist through suspension |
</phase_requirements>

---

## Summary

This phase inserts a 10-band graphic equalizer into the existing Web Audio processing chain in `audioPlayer.ts`. The implementation is entirely frontend — no Rust changes required. The key constraint driving the entire architecture is that `createMediaElementSource()` can only be called once per HTMLAudioElement; calling it a second time throws `InvalidStateError`. This means the EQ chain **must** share `_vizCtx` by inserting between `_vizSource` and `_vizAnalyser`.

The crossfade safety story is elegant: EQ filter nodes are static in the graph and never touched during crossfade. Only `_vizSource` reconnects (already handled by the `_vizConnectedTo` guard). The bypass strategy — ramping all gains to 0 dB rather than disconnecting nodes — avoids all disconnect/reconnect race conditions while keeping the audio graph topologically identical at all times.

The WebKit background suspension guard is a `document.addEventListener('visibilitychange')` that calls `_vizCtx.resume()` when the page becomes visible. BiquadFilterNode `AudioParam` values are preserved through suspension, so no re-application of gains is needed.

**Primary recommendation:** Add EQ fields to the AudioPlayer class, modify `getAnalyser()` to insert the filter chain on first creation, and add a `visibilitychange` listener in the same initialization block.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (native) | Living Standard | BiquadFilterNode, AudioParam automation | Built into every browser/WebView — no install needed |
| TypeScript | (project existing) | Type-safe AudioParam access, EQ_BANDS constant typing | Project-standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | No third-party EQ library needed | BiquadFilterNode covers all required filter types natively |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BiquadFilterNode chain | Tone.js EQ3 or EQ10 | Tone.js adds ~150KB; overkill when native API fully covers the requirement |
| Static filter nodes | Dynamic disconnect/reconnect | Dynamic approach introduces crossfade race conditions — static is safer |
| linearRampToValueAtTime | exponentialRampToValueAtTime | Exponential ramp sounds more natural for some params but behaves oddly at 0; linear is predictable for ±dB gain |

**Installation:**
```bash
# No installation required — Web Audio API is native to the WKWebView used by Tauri
```

---

## Architecture Patterns

### Audio Graph After Phase 15
```
HTMLAudioElement (this.audio)
       ↓
MediaElementAudioSourceNode (_vizSource)
       ↓
BiquadFilterNode (eqFilters[0])   ← lowshelf, 40 Hz
       ↓
BiquadFilterNode (eqFilters[1])   ← peaking, 80 Hz
       ↓ ... (eqFilters[2..8])
       ↓
BiquadFilterNode (eqFilters[9])   ← highshelf, 16 kHz
       ↓
AnalyserNode (_vizAnalyser)
       ↓
AudioContext.destination (_vizCtx.destination)
```

### Affected Files
```
src/lib/
├── audioPlayer.ts     # Primary: add EQ fields, modify getAnalyser(), cleanup()
└── (new export)       # EQ_BANDS constant — can live in audioPlayer.ts or a new eqConstants.ts
```

### Pattern 1: Filter Chain Initialization (inside getAnalyser())
**What:** Build 10 BiquadFilterNodes chained in series when `_vizCtx` is first created.
**When to use:** Called once, lazily, on first user gesture (existing pattern).
**Example:**
```typescript
// Source: MDN BiquadFilterNode docs
// https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode

// Step 1: Create all filter nodes
this._eqFilters = EQ_BANDS.map(band => {
  const filter = this._vizCtx!.createBiquadFilter()
  filter.type = band.type         // 'lowshelf' | 'peaking' | 'highshelf'
  filter.frequency.value = band.freq
  filter.Q.value = band.Q
  filter.gain.value = 0           // start flat (acoustically transparent)
  return filter
})

// Step 2: Chain filters together
for (let i = 0; i < this._eqFilters.length - 1; i++) {
  this._eqFilters[i].connect(this._eqFilters[i + 1])
}

// Step 3: Connect chain ends (analyser connects to destination as before)
// _vizSource → eqFilters[0] (in reconnect block below)
// eqFilters[9] → _vizAnalyser
this._eqFilters[this._eqFilters.length - 1].connect(this._vizAnalyser!)
```

### Pattern 2: Source Reconnect After Crossfade (modify existing `_vizConnectedTo` block)
**What:** `_vizSource` connects to first EQ filter instead of directly to analyser.
**When to use:** Every time `this.audio !== this._vizConnectedTo` (already detected).
**Example:**
```typescript
// Before (current code, audioPlayer.ts:996):
this._vizSource.connect(this._vizAnalyser!)

// After (Phase 15):
this._vizSource.connect(
  this._eqFilters.length > 0 ? this._eqFilters[0] : this._vizAnalyser!
)
```

### Pattern 3: Gain Automation Without Clicks
**What:** Always use `linearRampToValueAtTime` for gain changes, never `setValueAtTime`.
**When to use:** setEqBandGain, setAllBands, setEqEnabled (bypass).
**Example:**
```typescript
// Source: MDN AudioParam.linearRampToValueAtTime
// https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/linearRampToValueAtTime
const RAMP_MS = 0.03  // 30ms in seconds

setEqBandGain(index: number, dB: number): void {
  if (!this._eqFilters[index]) return
  const clampedDb = Math.max(-12, Math.min(12, dB))
  this._eqGains[index] = clampedDb
  if (!this._eqEnabled) return   // don't apply while bypassed

  const param = this._eqFilters[index].gain
  const now = this._vizCtx!.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)   // anchor current value first
  param.linearRampToValueAtTime(clampedDb, now + RAMP_MS)
}
```

**Important:** `cancelScheduledValues` + `setValueAtTime(param.value, now)` as anchor before each ramp is required to prevent the ramp from interpolating from a stale scheduled value rather than the current live value.

### Pattern 4: Bypass Implementation
**What:** Ramp all filter gains to 0 dB; on re-enable, ramp back to stored `_eqGains`.
**When to use:** `setEqEnabled(false)` and `setEqEnabled(true)`.
**Example:**
```typescript
setEqEnabled(enabled: boolean): void {
  this._eqEnabled = enabled
  if (!this._vizCtx || !this._eqFilters.length) return

  const now = this._vizCtx.currentTime
  this._eqFilters.forEach((filter, i) => {
    const targetDb = enabled ? this._eqGains[i] : 0
    filter.gain.cancelScheduledValues(now)
    filter.gain.setValueAtTime(filter.gain.value, now)
    filter.gain.linearRampToValueAtTime(targetDb, now + 0.03)
  })
}
```

### Pattern 5: WebKit Background Suspension Guard
**What:** Listen for `visibilitychange`, call `_vizCtx.resume()` when page becomes visible.
**When to use:** Add once, alongside or just after `_vizCtx` creation.
**Example:**
```typescript
// Source: WebKit bug #231105, MDN Page Visibility API
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && this._vizCtx?.state === 'suspended') {
    this._vizCtx.resume().catch(err =>
      console.warn('[AudioPlayer] Failed to resume AudioContext:', err)
    )
  }
})
```

Note: `AudioParam` values (filter gains) survive AudioContext suspension. No re-application needed on resume — the BiquadFilterNode retains all scheduled/current values.

### Anti-Patterns to Avoid
- **Calling createMediaElementSource() twice on the same element:** Throws `InvalidStateError`. Never create a second AudioContext for EQ.
- **Disconnecting/reconnecting EQ filter nodes on crossfade:** Creates reconnect timing race conditions during the 8-second crossfade window. Keep filter nodes static.
- **Using setValueAtTime alone for gain changes:** Causes audible clicks. Always ramp.
- **Initializing EQ nodes at class construction time (before user gesture):** AudioContext creation before a user gesture is disallowed by browsers/WebView. Reuse the existing lazy-init pattern in `getAnalyser()`.
- **Adding a master GainNode for volume:** Volume is already controlled via `audio.volume` (HTMLAudioElement property). Do not add a GainNode — it would cause double gain.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio filtering | Custom DSP filter | `BiquadFilterNode` | Web Audio API implements the full biquad difference equation correctly; aliasing, denormals, and coefficient stability are handled by the browser |
| Click-free gain automation | Manual interpolation loop | `linearRampToValueAtTime` | AudioParam automation runs at audio-rate (sample-accurate) on the audio thread; JS-side interpolation runs at animation-rate (16ms) and causes audible zipper noise |
| Filter chain management | Custom node graph abstraction | Direct array of BiquadFilterNode | Chain is exactly 10 fixed nodes; abstraction adds complexity with no benefit at this scale |

**Key insight:** `AudioParam` automation methods are the Web Audio API's primary tool for artifact-free parameter changes. Any hand-rolled approach that changes filter gains from the JS thread will produce audible artifacts.

---

## Common Pitfalls

### Pitfall 1: Missing cancelScheduledValues + anchor before ramp
**What goes wrong:** If a ramp is already in progress (e.g., user drags slider rapidly), a new `linearRampToValueAtTime` appends to the existing schedule rather than replacing it. The gain overshoots or undershoots.
**Why it happens:** AudioParam scheduling is additive — new events append to the timeline unless cancelled.
**How to avoid:** Always call `param.cancelScheduledValues(now)` then `param.setValueAtTime(param.value, now)` before every ramp.
**Warning signs:** Gain snaps to unexpected values when sliders move quickly; console shows no error (silent misbehavior).

### Pitfall 2: Crossfade audio element plays without EQ
**What goes wrong:** During the crossfade window (up to 8 seconds), `crossfadeAudio` plays through a separate HTMLAudioElement that has no MediaElementAudioSourceNode in `_vizCtx`. It plays dry (no EQ).
**Why it happens:** Creating a second MediaElementAudioSourceNode for `crossfadeAudio` and routing it through the EQ chain is out of scope (per REQUIREMENTS.md Out of Scope).
**How to avoid:** Document as known limitation. EQ applies after `completeCrossfade()` swaps `this.audio` and `getAnalyser()` reconnects `_vizSource`.
**Warning signs:** User notices EQ settings "disappear" at the start of each track during crossfade — this is expected behavior.

### Pitfall 3: EQ init before AudioContext exists
**What goes wrong:** `setEqBandGain()` or `setEqEnabled()` called before any user gesture — `_vizCtx` is null, `_eqFilters` is empty. Gains stored in `_eqGains` but not applied to filters.
**Why it happens:** `loadEqState()` may be called on NowPlayingBar mount before any track is played.
**How to avoid:** Store gains in `_eqGains[]` regardless. When `getAnalyser()` runs for the first time and creates the filter chain, initialize each filter's gain from `_eqGains[i]` (if non-zero and EQ is enabled). This handles both "EQ loaded before first play" and "default flat state."

### Pitfall 4: Gains on lowshelf/highshelf vs peaking interpretation
**What goes wrong:** All three BiquadFilterNode types use `filter.gain` but the `Q` property behaves differently — `Q` has no effect on `lowshelf` and `highshelf` type filters in the Web Audio spec.
**Why it happens:** The Q parameter is only meaningful for peaking, bandpass, notch, etc.
**How to avoid:** Set `filter.Q.value = band.Q` for all bands anyway (it's harmless for shelf filters), but don't rely on Q shaping the shelf slope — the shelf slope is fixed by the spec. The Q = 0.7 in the locked decisions is simply ignored by the shelf filter internally.

### Pitfall 5: WebKit AudioContext state after background tab
**What goes wrong:** On macOS (WKWebView), AudioContext transitions to 'suspended' when the app window is backgrounded for 10+ seconds. Without the visibilitychange guard, audio is silent when returning to the app even though HTML5 audio continues playing.
**Why it happens:** WebKit's power-saving policy suspends AudioContext when the page is not visible (WebKit bug #231105).
**How to avoid:** The `visibilitychange` guard in Pattern 5. Note: the `_vizCtx.resume()` call in the existing `getAnalyser()` flow (line 1001) only triggers when `getAnalyser()` is called — not automatically. A dedicated `visibilitychange` listener is required.

---

## Code Examples

Verified patterns from official sources:

### EQ_BANDS Constant (single source of truth for Phase 16)
```typescript
// Exported from audioPlayer.ts or eqConstants.ts
export type BiquadFilterType = 'lowshelf' | 'peaking' | 'highshelf'

export interface EqBand {
  freq: number
  label: string
  type: BiquadFilterType
  Q: number
}

export const EQ_BANDS: EqBand[] = [
  { freq: 40,    label: '40',   type: 'lowshelf',  Q: 0.7 },
  { freq: 80,    label: '80',   type: 'peaking',   Q: 1.4 },
  { freq: 160,   label: '160',  type: 'peaking',   Q: 1.4 },
  { freq: 320,   label: '320',  type: 'peaking',   Q: 1.4 },
  { freq: 640,   label: '640',  type: 'peaking',   Q: 1.4 },
  { freq: 1300,  label: '1.3k', type: 'peaking',   Q: 1.4 },
  { freq: 2500,  label: '2.5k', type: 'peaking',   Q: 1.4 },
  { freq: 5000,  label: '5k',   type: 'peaking',   Q: 1.4 },
  { freq: 10000, label: '10k',  type: 'peaking',   Q: 1.4 },
  { freq: 16000, label: '16k',  type: 'highshelf', Q: 0.7 },
]
```

### New Private Fields on AudioPlayer Class
```typescript
// EQ state
private _eqFilters: BiquadFilterNode[] = []
private _eqGains: number[] = new Array(EQ_BANDS.length).fill(0)  // stored dB values
private _eqEnabled: boolean = false
```

### Modified getAnalyser() — Filter Chain Creation Block
```typescript
// Source: MDN BiquadFilterNode — https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
if (!this._vizCtx) {
  this._vizCtx = new AudioContext()
  this._vizAnalyser = this._vizCtx.createAnalyser()
  this._vizAnalyser.fftSize = 128
  this._vizAnalyser.smoothingTimeConstant = 0.8

  // Build EQ filter chain
  this._eqFilters = EQ_BANDS.map((band, i) => {
    const filter = this._vizCtx!.createBiquadFilter()
    filter.type = band.type
    filter.frequency.value = band.freq
    filter.Q.value = band.Q
    // Apply pre-stored gains (handles loadEqState called before first play)
    filter.gain.value = this._eqEnabled ? this._eqGains[i] : 0
    return filter
  })

  // Chain filters in series
  for (let i = 0; i < this._eqFilters.length - 1; i++) {
    this._eqFilters[i].connect(this._eqFilters[i + 1])
  }
  // Last filter → analyser → destination
  this._eqFilters[this._eqFilters.length - 1].connect(this._vizAnalyser)
  this._vizAnalyser.connect(this._vizCtx.destination)

  // WebKit background suspension guard
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && this._vizCtx?.state === 'suspended') {
      this._vizCtx.resume().catch(err =>
        console.warn('[AudioPlayer] Failed to resume AudioContext after visibility change:', err)
      )
    }
  })
}
```

### Modified Source Reconnect Block in getAnalyser()
```typescript
// Reconnect if audio element changed (e.g. after crossfade swap)
if (this.audio !== this._vizConnectedTo) {
  if (this._vizSource) {
    try { this._vizSource.disconnect() } catch { /* already disconnected */ }
  }
  this._vizSource = this._vizCtx.createMediaElementSource(this.audio)
  // Connect to first EQ filter (previously connected directly to analyser)
  const firstNode = this._eqFilters.length > 0 ? this._eqFilters[0] : this._vizAnalyser!
  this._vizSource.connect(firstNode)
  this._vizConnectedTo = this.audio
}
```

### Modified cleanup() — Disconnect EQ Filters
```typescript
// After existing _vizSource disconnect block, before _vizCtx.close():
for (const filter of this._eqFilters) {
  try { filter.disconnect() } catch { /* ok */ }
}
this._eqFilters = []
```

### getEqState() Implementation
```typescript
getEqState(): { enabled: boolean; bands: number[] } {
  return {
    enabled: this._eqEnabled,
    bands: [...this._eqGains],  // return a copy, not the internal array
  }
}
```

### loadEqState() — Atomic Restore for Persistence
```typescript
loadEqState(state: { enabled: boolean; bands: number[] }): void {
  this._eqEnabled = state.enabled
  this._eqGains = state.bands.slice(0, EQ_BANDS.length)

  // If filters already exist (AudioContext created), apply immediately
  if (this._eqFilters.length > 0 && this._vizCtx) {
    const now = this._vizCtx.currentTime
    this._eqFilters.forEach((filter, i) => {
      const targetDb = this._eqEnabled ? this._eqGains[i] : 0
      filter.gain.cancelScheduledValues(now)
      filter.gain.setValueAtTime(filter.gain.value, now)
      filter.gain.linearRampToValueAtTime(targetDb, now + 0.03)
    })
  }
  // If filters don't exist yet, gains will be applied during getAnalyser() init
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode for custom DSP | AudioWorkletNode (or BiquadFilterNode for standard filters) | Chrome 64+ / 2018 | ScriptProcessorNode is deprecated; BiquadFilterNode is the correct tool for standard EQ shapes |
| AudioContext unlock via user-click only | `resume()` on any user gesture + visibilitychange guard | Ongoing WebKit policy | Required for WKWebView (Tauri on macOS) to survive app backgrounding |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Deprecated in the Web Audio spec; replaced by `AudioWorkletNode`. Not needed here — `BiquadFilterNode` covers all required filter types.
- `createGain()` for volume in EQ chain: Unnecessary — project uses `audio.volume` for volume control. Adding a GainNode would create a double-gain bug.

---

## Open Questions

1. **visibilitychange listener leak on cleanup()**
   - What we know: The listener is added anonymously using an arrow function referencing `this`. Cleanup() currently closes `_vizCtx` but does not remove the listener.
   - What's unclear: Whether the anonymous listener causes a memory leak after cleanup. In practice the AudioPlayer singleton lives for the app lifetime so cleanup is only called on unmount.
   - Recommendation: Store the listener reference for removal in `cleanup()`, or accept the leak given the singleton lifecycle. Claude's discretion per CONTEXT.md.

2. **setAllBands() called during rapid crossfade completion**
   - What we know: If `setAllBands()` is called at the exact moment `completeCrossfade()` fires, `_vizCtx.currentTime` is valid and the ramps are queued. Filter nodes are static, so there's no topology change.
   - What's unclear: Edge case timing — but the filter nodes being static means there's no structural race, only a parameter-scheduling question.
   - Recommendation: No special handling needed. The ramp will apply correctly regardless of crossfade state.

---

## Validation Architecture

> nyquist_validation key is absent from .planning/config.json — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files found in project |
| Config file | None (Wave 0 gap) |
| Quick run command | Manual browser DevTools inspection |
| Full suite command | Manual end-to-end verification per success criteria |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EQAP-01 | EQ enable/disable changes audio output, bass boost at 32 Hz audible | manual-smoke | Manual: play track, boost band 1, verify audible change | N/A |
| EQAP-02 | No second MediaElementSource created; waveform continues animating with EQ active | manual-smoke | Manual: enable EQ, verify waveform still animates, no console errors | N/A |
| EQAP-03 | After crossfade completes, EQ gain applied to new track | manual-smoke | Manual: boost bass, trigger crossfade, verify bass boost on new track | N/A |
| EQAP-04 | Switch away from app 10s+, return, audio + EQ continue without interruption | manual-smoke | Manual: background app, return, verify audio resumes | N/A |

**Note on automated testing:** All four requirements involve AudioContext and HTMLAudioElement behavior that cannot be unit-tested in a Node.js environment. The Web Audio API is only available in browser/WKWebView context. All validation is manual smoke testing against the live Tauri app.

### Sampling Rate
- **Per task commit:** Manual: open DevTools, play a track, verify no console errors
- **Per wave merge:** Full success criteria checklist (4 items above)
- **Phase gate:** All 4 success criteria confirmed before `/gsd:verify-work`

### Wave 0 Gaps
- No test infrastructure gaps for this phase — all verification is manual due to Web Audio API browser-only constraint.

*(No automated test files to create. All phase gates are manual verification steps against the running Tauri app.)*

---

## Sources

### Primary (HIGH confidence)
- [MDN BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode) — filter types, gain, Q, frequency AudioParam
- [MDN AudioParam.linearRampToValueAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/linearRampToValueAtTime) — ramp semantics, cancelScheduledValues requirement
- [MDN BaseAudioContext.createBiquadFilter()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createBiquadFilter) — creation API
- `src/lib/audioPlayer.ts` lines 978–1009 (`getAnalyser()`), 1015–1044 (`cleanup()`), 1214–1281 (`completeCrossfade()`) — existing integration points confirmed by direct code read

### Secondary (MEDIUM confidence)
- [WebKit bug #231105](https://bugs.webkit.org/show_bug.cgi?id=231105) — AudioContext suspension on macOS background confirmed
- [WebKit bug #237878](https://bugs.webkit.org/show_bug.cgi?id=237878) — iOS AudioContext suspension on background (same pattern applies to WKWebView on macOS)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Web Audio API is the native platform API; BiquadFilterNode is the unambiguous correct tool
- Architecture: HIGH — Integration points confirmed by direct code read; all crossfade/reconnect paths understood from source
- Pitfalls: HIGH — `cancelScheduledValues` anchor requirement confirmed by MDN spec; WebKit suspension confirmed by official WebKit bugs

**Research date:** 2026-03-13
**Valid until:** 2026-09-13 (stable — Web Audio API spec is stable; WebKit behavior changes slowly)
