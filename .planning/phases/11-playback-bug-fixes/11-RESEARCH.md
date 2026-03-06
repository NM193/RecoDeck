# Phase 11: Playback Bug Fixes — Research

**Researched:** 2026-03-06
**Domain:** HTML5 Audio, WebAudio API, VBR MP3 duration estimation, crossfade lifecycle
**Confidence:** HIGH — both bugs are fully diagnosed from source code; fixes are surgical 1-3 line changes

---

## Summary

Two bugs exist in `audioPlayer.ts`. Both are diagnosed to specific lines and have known fixes documented in the project's STATE.md prior to this research session.

**Bug 1 (PLAY-01):** When a VBR MP3 fires a premature `ended` event, the native decoder recovery path seeks back 10 seconds (`SEEK_MARGIN_MS = 10000`) to avoid missing audio. The seek margin is too large — VBR MP3 actually fires `ended` only 1-3 seconds before EOF, so the 10-second rollback replays 7-9 seconds of audio the user already heard. Reducing `SEEK_MARGIN_MS` to 3000 eliminates the repeat.

**Bug 2 (PLAY-02):** `loadTrack()` does not call `abortCrossfade()` before loading a new track. When the user presses skip during a crossfade, `currentTrackIndex` changes, the `useEffect` fires `loadTrack()`, but `crossfadeAudio` — a separate `HTMLAudioElement` — is never paused or destroyed. It continues playing in the background as an orphaned audio stream while the new track also plays.

**Primary recommendation:** Two targeted code changes in `audioPlayer.ts` — reduce `SEEK_MARGIN_MS` and add `this.abortCrossfade()` as the first statement in `loadTrack()`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAY-01 | Tracks play to completion without repeating the last 3-5 seconds before advancing to the next track | Root cause: `SEEK_MARGIN_MS = 10000` at line 187 of audioPlayer.ts — reduce to 3000 |
| PLAY-02 | Skipping a track during an active crossfade stops all audio streams immediately (no orphaned background audio) | Root cause: `loadTrack()` does not call `abortCrossfade()` — add as first call in loadTrack() |
</phase_requirements>

---

## Bug Diagnoses

### PLAY-01: VBR MP3 End-of-Track Replay

**File:** `src/lib/audioPlayer.ts`, lines 145-210 (`ended` event handler, HTML mode path)

**Root cause (confirmed from source):**
```
SEEK_MARGIN_MS = 10000   // line 187
```

**Execution path:**
1. VBR MP3 `ended` event fires ~1-3s before actual EOF (WebKit miscalculates VBR duration)
2. `_nativeRecoveryAttempted` is false — native recovery path executes
3. `savedPosition` is captured at the premature end position
4. Code seeks to `Math.max(0, savedPosition - SEEK_MARGIN_MS)` = 10 seconds earlier
5. Native decoder plays from that seek point, replaying 7-9 seconds of audio
6. Track advances normally — but the user heard a chunk of the song twice

**Why 10 seconds was chosen:**
The comment says "Symphonia's seek on VBR MP3 can overshoot, missing audio data." The 10-second margin was a conservative safety net, but it overcorrects — the actual overshoot + remaining audio is only 1-3 seconds total.

**Fix:**
```typescript
// src/lib/audioPlayer.ts — line 187
const SEEK_MARGIN_MS = 3000   // was 10000
```

A 3-second margin safely covers:
- VBR seek overshoot in Symphonia (empirically < 1s)
- Remaining audio after premature end (empirically 1-3s)
- Combined worst case: still under 3s with margin to spare

**Confidence:** HIGH — STATE.md documents this root cause and fix value explicitly.

---

### PLAY-02: Orphaned Crossfade Audio on Manual Skip

**File:** `src/lib/audioPlayer.ts`, `loadTrack()` method starting at line 589

**Root cause (confirmed from source):**
`loadTrack()` does not call `abortCrossfade()` before cleanup. When a crossfade is active (`crossfadeAudio` is a live `HTMLAudioElement` separate from `this.audio`), the cleanup at the top of `loadTrack()` only affects `this.audio`:

```typescript
// Lines 607-611 — only cleans up this.audio, not crossfadeAudio
this.audio.pause()
this._hasSource = false
this.audio.removeAttribute('src')
this.audio.load()
```

`crossfadeAudio` is untouched. It continues playing independently.

**Full execution trace for skip-during-crossfade:**
1. User presses skip → `handleNext()` in NowPlayingBar (line 478)
2. `handleNext()` calls `playNext()` (Zustand store) — updates `currentTrackIndex`
3. `handleNext()` clears `crossfadeTriggered` React state (line 479) but NOT `crossfadeAudio`
4. `useEffect` fires (watching `currentTrackIndex`) → calls `audioPlayer.loadTrack()`
5. `loadTrack()` pauses `this.audio`, creates fresh element — but `crossfadeAudio` still live
6. New track loads and plays via `this.audio`
7. `crossfadeAudio` continues playing → two audio streams audible simultaneously

**Additional detail:** `abortCrossfade()` (line 1243) correctly handles everything:
- Cancels the rAF loop (`crossfadeRafId`)
- Pauses and clears `crossfadeAudio` src, sets it to null
- Restores `this.audio.volume` to 1.0
- Resets all crossfade state flags

**Fix:**
```typescript
// src/lib/audioPlayer.ts — add as FIRST statement in loadTrack(), line 600
async loadTrack(filePath: string, trackId?: number): Promise<void> {
  console.log('[AudioPlayer] loadTrack() called ...')
  this.abortCrossfade()   // ADD THIS LINE — kill any active crossfade before loading new track
  // Increment generation so any in-flight load ...
  const gen = ++this._loadGeneration
  ...
}
```

**Confidence:** HIGH — confirmed by STATE.md research note and direct code trace through NowPlayingBar + audioPlayer.

---

## Standard Stack

No new libraries required. Both fixes are pure changes to existing `audioPlayer.ts` logic.

| File | Change Type | Scope |
|------|-------------|-------|
| `src/lib/audioPlayer.ts` | Value change | 1 line (`SEEK_MARGIN_MS`) |
| `src/lib/audioPlayer.ts` | Line insertion | 1 line (`abortCrossfade()` call) |

---

## Architecture Patterns

### Pattern: `_loadGeneration` guard
`loadTrack()` uses a generation counter to cancel stale loads. `abortCrossfade()` must be called BEFORE incrementing the generation counter (it already is in the proposed fix position) — this is safe because `abortCrossfade()` is synchronous.

### Pattern: `crossfadeAudio` is a separate element
The crossfade implementation maintains two `HTMLAudioElement` instances simultaneously. Any path that starts playback of a new track must explicitly destroy `crossfadeAudio` — it is not automatically cleaned up by operating on `this.audio`. The pattern to follow is always: `abortCrossfade()` → then audio operations.

### Pattern: `completeCrossfade()` already handles the swap correctly
For the normal crossfade completion path (no skip), `completeCrossfade()` properly transfers `crossfadeAudio` to `this.audio` and resets all state. The bug is only the skip path — `loadTrack()` bypasses `completeCrossfade()` and skips cleanup.

### Anti-Patterns to Avoid

- **Pausing `crossfadeAudio` inside `loadTrack()` directly:** Don't duplicate the cleanup logic. Call `abortCrossfade()` — it owns all crossfade teardown. Adding a direct `crossfadeAudio?.pause()` in `loadTrack()` would create split cleanup paths that can diverge.
- **Checking `isCrossfading` in `loadTrack()` before calling `abortCrossfade()`:** `abortCrossfade()` is already guarded to be safe when no crossfade is active (checks `crossfadeRafId` and `crossfadeAudio` for null). Call it unconditionally.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Crossfade teardown | Custom pause+null logic in loadTrack | `abortCrossfade()` — already handles all cleanup |
| VBR detection | Track-format checks, conditional margin | Single constant `SEEK_MARGIN_MS` — applies universally |

---

## Common Pitfalls

### Pitfall 1: Calling `abortCrossfade()` After `_loadGeneration` increment
**What goes wrong:** If `abortCrossfade()` were placed after `++this._loadGeneration`, it still works (abortCrossfade is sync), but the ordering would be non-obvious. The `abortCrossfade()` call must come before any async work — it is synchronous and must complete before native cleanup.
**Prevention:** Place `abortCrossfade()` as the literal first line in `loadTrack()`, before the generation increment.

### Pitfall 2: SEEK_MARGIN_MS too small
**What goes wrong:** If margin is set to 0 or 500ms, Symphonia VBR seek overshoot could land past EOF, causing `nativeFinishPlayback()` to fire immediately (silence + track advance with no replay, but EOF detected instantly is acceptable).
**Why 3000 is safe:** Empirical observation from project history shows VBR premature-end fires 1-3s before EOF. A 3s margin ensures we never overshoot backwards past the problematic region while not replaying excessive audio.

### Pitfall 3: Test Coverage Gap — AudioPlayer Tests Require Real DOM
**What goes wrong:** `AudioPlayer` constructor calls `new Audio()` and `new AudioContext()` — both require a real browser environment. Vitest's jsdom environment does not support HTMLAudioElement playback or WebAudio. Tests for audioPlayer behavior cannot use `audioPlayer` singleton directly.
**Prevention:** Tests for PLAY-01 and PLAY-02 must either (a) test the constant value directly, or (b) test NowPlayingBar's crossfade state management via Zustand store state — not the audio element behavior. This is consistent with the project's existing decision to exclude component-level React tests that depend on audio APIs.

---

## Code Examples

### Fix 1: Reduce SEEK_MARGIN_MS

```typescript
// src/lib/audioPlayer.ts — line 187
// BEFORE:
const SEEK_MARGIN_MS = 10000

// AFTER:
const SEEK_MARGIN_MS = 3000
```

No other changes needed. The constant is used exactly once.

### Fix 2: Add abortCrossfade() to loadTrack()

```typescript
// src/lib/audioPlayer.ts — loadTrack() method
async loadTrack(filePath: string, trackId?: number): Promise<void> {
  console.log(
    '[AudioPlayer] loadTrack() called, filePath:',
    filePath,
    'trackId:',
    trackId,
  )
  // ADD: abort any active crossfade before starting a new load
  this.abortCrossfade()

  // Increment generation so any in-flight load from a previous call is cancelled.
  const gen = ++this._loadGeneration
  this._isLoading = true
  // ... rest of method unchanged
```

### Verification Grep Commands

```bash
# Confirm SEEK_MARGIN_MS is 3000 after fix
grep -n "SEEK_MARGIN_MS" src/lib/audioPlayer.ts

# Confirm abortCrossfade is called at start of loadTrack
grep -n -A 5 "async loadTrack" src/lib/audioPlayer.ts
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| 10s VBR seek margin | 3s VBR seek margin | Eliminates 7-9s audio replay on VBR MP3 end |
| loadTrack skips crossfade teardown | loadTrack calls abortCrossfade() first | Eliminates orphaned background audio stream on skip |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-01 | `SEEK_MARGIN_MS` constant is 3000 | unit | `npm test -- --grep "SEEK_MARGIN_MS"` | ❌ Wave 0 |
| PLAY-02 | `loadTrack()` calls `abortCrossfade()` before incrementing generation | unit | `npm test -- --grep "abortCrossfade"` | ❌ Wave 0 |

**Note on test scope:** `HTMLAudioElement` and `AudioContext` are unavailable in jsdom. Tests for these two requirements must inspect the source code behavior via indirect means (e.g. testing that audioPlayer fields reset correctly when `abortCrossfade()` is called, using a mock `crossfadeAudio`), or verify via grep-based assertion rather than runtime execution. The project REQUIREMENTS.md explicitly excludes component-level tests that depend on audio APIs.

**Recommended approach for PLAY-01:** A simple unit test confirming `SEEK_MARGIN_MS` equals 3000 (as a constant check) is sufficient. The actual audio behavior cannot be automated.

**Recommended approach for PLAY-02:** A Vitest unit test instantiating `AudioPlayer`, injecting a mock `crossfadeAudio` element, calling `loadTrack()`, and asserting `crossfadeAudio` was cleared. This is feasible if `Audio` is mocked in `src/test/setup.ts` (which it already must be, per Phase 6 TEST-04 work).

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/audioPlayer.test.ts` — covers PLAY-01 (SEEK_MARGIN_MS value) and PLAY-02 (abortCrossfade called in loadTrack)

---

## Open Questions

1. **Is jsdom's Audio mock sufficient to test abortCrossfade() calls?**
   - What we know: `src/test/setup.ts` has been configured for Tauri IPC mocks (Phase 6). HTMLAudioElement exists in jsdom but is a stub.
   - What's unclear: Whether `new Audio()` in AudioPlayer's constructor works in jsdom without errors.
   - Recommendation: Check `src/test/setup.ts` for existing Audio mocking. If absent, add a minimal mock so `AudioPlayer` can be instantiated in tests.

---

## Sources

### Primary (HIGH confidence)

- `src/lib/audioPlayer.ts` — direct source inspection: `SEEK_MARGIN_MS` at line 187; `loadTrack()` from line 589; `abortCrossfade()` at line 1243
- `src/components/layout/NowPlayingBar.tsx` — direct source inspection: `handleNext()` at line 478; crossfade trigger monitor at line 343
- `.planning/STATE.md` — accumulated v1.2 research findings documenting both root causes and fixes verbatim

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — PLAY-01, PLAY-02 requirement definitions
- `.planning/ROADMAP.md` — Phase 11 dependency and success criteria

---

## Metadata

**Confidence breakdown:**

- Bug diagnosis (PLAY-01): HIGH — constant value and execution path confirmed from source
- Bug diagnosis (PLAY-02): HIGH — missing `abortCrossfade()` call confirmed from source; `crossfadeAudio` lifecycle confirmed
- Fix correctness (PLAY-01): HIGH — 3000ms value pre-validated in STATE.md
- Fix correctness (PLAY-02): HIGH — `abortCrossfade()` is synchronous, idempotent, and already handles all cleanup
- Test approach: MEDIUM — jsdom Audio mock compatibility uncertain until `src/test/setup.ts` is inspected

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain; HTML5 Audio APIs are unchanged)
