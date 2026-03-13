# Phase 15: EQ Audio Engine - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Insert a 10-band graphic equalizer (BiquadFilterNode chain) into the existing `_vizCtx` AudioContext in `audioPlayer.ts`. Deliver gain control, bypass, crossfade reconnect safety, and WebKit background suspension guard. No UI, no persistence, no presets — those are Phase 16.

</domain>

<decisions>
## Implementation Decisions

### Band Frequencies
- DJ-weighted 10 bands: 40, 80, 160, 320, 640, 1300, 2500, 5000, 10000, 16000 Hz
- Band 1 (40 Hz): low-shelf filter, Q = 0.7 (gentle slope)
- Bands 2-9 (80 Hz - 10 kHz): peaking filters, Q = 1.4 (~1 octave bandwidth)
- Band 10 (16 kHz): high-shelf filter, Q = 0.7 (gentle slope)
- Export `EQ_BANDS` constant with freq, label, type, Q for each band — single source of truth for Phase 16 UI

### Gain Range & Smoothing
- Range: ±12 dB per band
- All gain changes use `linearRampToValueAtTime` with 30ms ramp duration
- Same 30ms ramp for slider changes, preset application, and bypass toggle
- No instant `setValueAtTime` — always ramped to eliminate clicks/pops

### API Surface
- Methods directly on AudioPlayer class (matches existing `setCrossfadeEnabled` pattern):
  - `setEqBandGain(index: number, dB: number)` — set single band
  - `setEqEnabled(enabled: boolean)` — toggle bypass
  - `setAllBands(gains: number[])` — set all 10 bands at once (for presets)
  - `loadEqState(state: { enabled: boolean, bands: number[] })` — atomic restore for persistence
  - `getEqState(): { enabled: boolean, bands: number[] }` — getter for UI reads
- No callback/subscription pattern — UI reads state via getter on mount and after changes

### Bypass Behavior
- Bypass = set all gains to 0 dB (filters stay in audio graph, acoustically transparent)
- No disconnect/reconnect of filter chain — avoids crossfade race conditions
- Re-enabling restores previous band gain values from memory
- Bypass toggle uses same 30ms ramp (smooth mute/unmute)

### Crossfade Reconnect
- EQ filter nodes are static after init — never disconnected/reconnected on crossfade
- Only `_vizSource` reconnects when `completeCrossfade()` swaps `this.audio`
- Graph: `_vizSource → eqFilter[0..9] → _vizAnalyser → _vizCtx.destination`
- Existing `_vizConnectedTo` guard in `getAnalyser()` handles source reconnection

### WebKit Background Suspension Guard
- `visibilitychange` listener resumes `_vizCtx` AudioContext only
- EQ band gains persist in BiquadFilterNode params — no re-application needed after resume

### Claude's Discretion
- Internal filter chain initialization order and error handling
- Exact `EQ_BANDS` constant structure (array of objects vs separate arrays)
- How to handle edge case of `getAnalyser()` called before EQ init
- Native PCM mode: EQ is a no-op (documented constraint)

</decisions>

<specifics>
## Specific Ideas

- DJ-weighted frequency set chosen to give more granularity in bass/sub range for electronic music — not standard ISO thirds
- Shelf filters at edges catch everything below 40 Hz and above 16 kHz rather than letting it pass unaffected

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_vizCtx` AudioContext (audioPlayer.ts:55): Lazy-created in `getAnalyser()` — EQ chain inserts here
- `_vizAnalyser` AnalyserNode (audioPlayer.ts:56): Currently connected directly to `_vizCtx.destination` — EQ goes between source and analyser
- `_vizConnectedTo` guard (audioPlayer.ts:58): Detects audio element swap after crossfade — already handles reconnection
- `setCrossfadeEnabled` pattern (audioPlayer.ts:68): Established pattern for toggle methods on AudioPlayer

### Established Patterns
- Audio graph created lazily on first user gesture (not at module init)
- `completeCrossfade()` (audioPlayer.ts:1214) swaps `this.audio` — `getAnalyser()` detects mismatch and reconnects `_vizSource`
- Volume control via `audio.volume` (HTMLAudioElement property) — not a GainNode
- Native PCM fallback uses separate `audioCtx` + `gainNode` — EQ does not apply to native mode

### Integration Points
- `getAnalyser()` (audioPlayer.ts:978-1009): Must be modified to insert EQ chain between `_vizSource` and `_vizAnalyser`
- `cleanup()` (audioPlayer.ts:1015-1044): Must disconnect EQ filter nodes
- Crossfade reconnect in `getAnalyser()` (audioPlayer.ts:991-997): Source reconnects to first EQ filter instead of directly to analyser

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-eq-audio-engine*
*Context gathered: 2026-03-13*
