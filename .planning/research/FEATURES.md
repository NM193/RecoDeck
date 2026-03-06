# Feature Research

**Domain:** DJ music library desktop app — Playback & UX Polish (v1.2)
**Researched:** 2026-03-06
**Confidence:** HIGH (codebase inspection + established DJ app UX conventions)

---

## Scope Note

This is a SUBSEQUENT MILESTONE research file. All three features under investigation are
already partially or fully scaffolded in the codebase. Research answers "what should the
completed behavior look and feel like, and what are the implementation edge cases?" — not
"should we build it?".

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| App is immediately usable on startup — library loads in background | Music apps with large libraries (iTunes, Rekordbox) never block startup; users expect to interact while data loads | MEDIUM | `getAllTracks()` already exists; need background load + reactive UI update. Current 1000-track paginated init must be replaced for "All Tracks" view |
| Visual indicator during background library load | Without indicator users assume the library is empty or the app is broken | LOW | Subtle text ("Loading library...") or animated count in sidebar header is enough |
| Library total count is visible before all tracks are loaded | "Showing X of 10,000 tracks" pattern — users orient themselves by the count | LOW | `countTracks()` already called on startup; plumb count into the visible UI |
| Settings removal is transparent — existing users are not silently broken | Users who had Key Notation or Waveform Style set should get a sane default, not an invisible stale value | LOW | Hardcode defaults in code; stored SQLite values are harmless dead data — no migration required |
| End-of-track plays to clean completion then advances | The current 3-5 second repeat glitch makes the app feel broken — it is the most visible playback bug | MEDIUM | Native decoder recovery code already exists; the bug is in the trigger condition |
| Crossfade works or does nothing — never degrades audio | If beatmatch crossfade cannot run (BPM missing, native mode, format unsupported), it must silently skip — not produce distorted or stuttering audio | LOW | Existing fallback paths cover this; verify all failure modes route cleanly |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Beatmatch crossfade — incoming track plays at outgoing BPM during window | DJ-centric behavior: the mix sounds intentional, not jarring. The incoming track at matched tempo blends naturally, then snaps to its own BPM at swap — this snap is inaudible | HIGH | Core mechanic already implemented: `playbackRate = outgoingBpm / incomingBpm` set in `startCrossfadeToNext()`, reset to `1.0` in `completeCrossfade()`. Task is verification + edge cases |
| NowPlayingBar shows incoming track name during crossfade | While two tracks are playing, the user expects to see what is coming in | MEDIUM | `isCrossfadingState` getter exists on `AudioPlayer`; needs wiring into store and NowPlayingBar UI |
| Full 10k library available for queue-building and AI context | When the user hits "Play All" or AI builds a playlist, it should see all tracks — not just the first 1000 | LOW | Side effect of async full-library load; no extra feature work beyond loading all tracks |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Key Notation and Waveform Style in Settings | They existed before and users might ask for them back | These settings add UI surface area with minimal value for the small DJ audience; Camelot is universal; Traktor RGB waveform is the most useful default | Hardcode Camelot and `traktor_rgb`. Users on `openkey` or `mono_peaks` will get the new defaults silently — acceptable for this audience |
| Gradual BPM ramp (pitch curve) during entire crossfade window | Sounds "professional" — like hardware CDJ pitch faders | Continuous `playbackRate` tweening causes audible pitch artifacts on WebKit; the snap at swap is inaudible because the incoming track is at near-full volume when swap occurs | The current snap-at-start approach is correct. The rate change happens before the incoming track is audible at meaningful volume |
| Crossfade in native (Rust PCM) decoder mode | Would allow crossfade for OGG, OPUS, WMA, APE files | Dual native decoder requires simultaneous backend decode state + PCM mixing in Rust; complexity far exceeds the marginal benefit for a small audience | Skip crossfade for native-mode tracks (current behavior: throw and caller falls back to direct track advance) — this is correct |
| Throttle or pause the background library load | Sounds safe | The load is a single SQLite paginated query returning lightweight Track objects. For 10k tracks it completes in < 500ms. No need to throttle | Just run `getAllTracks()` in a single call, resolve into state |

---

## Feature Deep Dives

### 1. Beatmatch Crossfade — Expected UX and Audio Behavior

**What users hear and feel (DJ convention):**

| Moment | Audio | Visual |
|--------|-------|--------|
| Crossfade window begins | Incoming track starts at volume 0, `playbackRate = outgoingBpm / incomingBpm` | NowPlayingBar could show incoming track name |
| During window | Outgoing track plays at full volume; incoming fades in at matched tempo. Two tracks overlap | Volume meter shows dual signal |
| Fade-in complete | Incoming at full volume (1.0); outgoing still playing naturally at end | Track name has swapped |
| Outgoing `ended` fires | Swap: `audio = crossfadeAudio`, `playbackRate` snapped to `1.0` | Position bar resets to incoming track |

**Why the snap at swap is inaudible:**
The `playbackRate` reset to `1.0` happens at `completeCrossfade()`, after the incoming track is already at full volume. The tiny BPM difference that created the rate offset (e.g., 1.04x for a 128→133 BPM transition) causes at most a few ms of timing shift. At the moment of swap both tracks are playing simultaneously — any artifact is masked by the full incoming signal.

**What the current code already does correctly (verified in `audioPlayer.ts`):**
- `startCrossfadeToNext()` sets `crossfadeAudio.playbackRate = outgoingBpm / incomingBpm` — clamped to [0.5, 2.0]
- Fade-in animates via `requestAnimationFrame` from 0 to 1 over `crossfadeDurationMs`
- Outgoing track is NOT faded out — it plays to its natural end — correct
- `completeCrossfade()` resets `playbackRate = 1.0` before firing `onTrackEnded`

**What needs verification or completion:**
- Edge case: BPM not set on one or both tracks — code already falls back to `playbackRate = 1.0` (crossfade without beatmatch). Verify this path is exercised.
- Edge case: BPM ratio outside [0.5, 2.0] clamp — test a 60→180 BPM transition (3x ratio → clamps to 2x). Behavior is acceptable.
- Edge case: crossfade started, then user manually skips — `abortCrossfade()` exists; verify it restores outgoing audio volume to 1.0.
- UI gap: `isCrossfadingState` getter is not wired to the player store. The NowPlayingBar cannot show the incoming track name during crossfade.

**Confidence:** HIGH — implementation is verified by direct code inspection.

---

### 2. Full Async Library Loading — Expected UX Pattern

**Established pattern from reference apps:**

| Phase | What user sees | What happens |
|-------|---------------|-------------|
| Startup | App shell renders, library empty, count shown ("10,234 tracks") | DB init, count fetch, theme load |
| 0-1s | First 0 rows visible (or cached batch), loading indicator | Background: `getAllTracks()` in flight |
| 1-3s | All tracks appear, loading indicator gone | State updated with full track array |

**Current implementation (from `App.tsx`):**
- `initializeApp()` calls `tauriApi.getTracksPaginated(1000, 0)` — loads first 1000 tracks only
- `hasMoreTracks` flag triggers scroll-to-load-more pattern
- `getAllTracks()` exists in the API but is never called from `AppContent`
- `countTracks()` is called and result is in `totalTrackCount` state but the UI display of this is unclear

**What changes for v1.2:**
- Replace `getTracksPaginated(1000, 0)` in the "All Tracks" branch of `loadTracks()` with `getAllTracks()`
- Call this asynchronously after initial render (not blocking `initializeApp()`)
- Remove `hasMoreTracks`, `isLoadingMore`, and the scroll-to-load-more trigger
- Add a loading indicator that is visible while the async call is in flight

**Implementation approach:**
```
initializeApp() → [as before, fast] → setLoading(false) → UI renders
useEffect (after render) → getAllTracks() → setTracks(result) → UI updates
```

The loading indicator should show during the `useEffect` fetch only. The app is fully interactive before this — user can open Settings, navigate to a playlist, etc.

**Confidence:** HIGH — code paths are fully visible, no new backend work needed.

---

### 3. Settings Cleanup — Migration Behavior

**Settings being removed from UI:**
- `key_notation` stored key (values: `'camelot'` or `'openkey'`)
- `waveform_style` stored key (values: `'traktor_rgb'`, `'mono_peaks'`, or `'bars'`)

**What happens to users who previously set these:**

Option A — Silent fallback to hardcoded defaults (RECOMMENDED):
The SQLite `settings` table rows remain. Code that previously read them now hardcodes the default. No migration, no notification, no UI change visible on upgrade.

Option B — Explicit migration on startup: Write new default values on startup. Unnecessary complexity.

**Why Option A is correct:**
- The stored values cannot cause a runtime error — they are simply never read again
- Users on `openkey` will now always see Camelot notation. This is a deliberate product decision. The audience is small and DJ-adjacent, Camelot is the most common notation
- Users on `mono_peaks` or `bars` waveform will see Traktor RGB. Also acceptable
- No confirmation dialog or notification needed — settings removal is a product decision, not data loss

**Code changes required (from inspection of `AppearanceSection.tsx`, `SettingsContext.tsx`, `constants.ts`):**
- Remove `KEY_NOTATIONS` and `WAVEFORM_STYLES` arrays from `constants.ts`
- Remove Key Notation and Waveform Style `<div className="sv-subsection">` blocks from `AppearanceSection.tsx`
- Remove `keyNotation`, `waveformStyle` state and their handlers from `SettingsContext.tsx`
- Remove `handleKeyNotationChange`, `handleWaveformStyleChange` from the `SettingsContextValue` interface
- Remove `onKeyNotationChanged` and `onWaveformStyleChanged` from `SettingsCallbacks` interface
- Remove reads of `key_notation` and `waveform_style` from `loadSettings()` in `SettingsContext.tsx`
- In `App.tsx`: remove the `keyNotation` state that is passed as prop to `TrackTable`/display components — or hardcode `'camelot'` inline
- Remove `setWaveformStyle` from `AppContent` state (it is already a `const [, setWaveformStyle]` — effectively unused)

**What to preserve:**
- Nothing in SQLite needs to change
- The theme selector, custom colors, and other Appearance settings are unchanged

**Confidence:** HIGH — all affected files were inspected directly.

---

## Feature Dependencies

```
Async full-library load
    └──enables──> accurate client-side queue building (all tracks in memory)
    └──enables──> crossfade queue look-ahead (next track BPM available)
    └──removes──> hasMoreTracks / isLoadingMore / scroll-to-load-more

Beatmatch crossfade playbackRate
    └──requires──> BPM data on both tracks (in SQLite, already passed via startCrossfadeToNext)
    └──requires──> HTML mode (crossfade skipped in native mode — acceptable, documented)
    └──optional──> NowPlayingBar crossfade indicator (isCrossfadingState getter → store → UI)

Settings cleanup
    └──no dependencies on other v1.2 features (independent task)
    └──simplifies──> SettingsContext (fewer state vars, fewer callback props)
    └──removes──> onKeyNotationChanged and onWaveformStyleChanged prop chains through App.tsx
```

### Dependency Notes

- **Async library load enables crossfade look-ahead:** The crossfade code calls `startCrossfadeToNext()` with the next track in the queue. If only 1000 tracks are loaded, the queue is incomplete. Full-library load ensures queue integrity.
- **Settings cleanup is fully independent:** It can land in its own commit and does not touch audio or library loading code paths.
- **Crossfade NowPlayingBar enhancement is optional:** The core audio behavior works without it. It is a UX improvement that requires wiring `isCrossfadingState` from `AudioPlayer` through the player store into the bar component.

---

## MVP Definition (for v1.2)

### Launch With

- [x] **Async full-library load** — remove scroll-to-load-more, load all tracks in background after initial render. Enables correct queue-building and crossfade look-ahead.
- [x] **End-of-track glitch fix** — clean track advancement without the 3-5 second repeat. The native decoder recovery code exists; the fix is in the trigger logic.
- [x] **Settings cleanup** — remove Key Notation and Waveform Style from Appearance section; hardcode Camelot and `traktor_rgb` as defaults. No migration needed.
- [x] **Beatmatch crossfade verification** — confirm the `playbackRate` mechanic is correct for the common cases (BPM match, BPM missing, BPM ratio > 2x). Fix any edge cases found.

### Add Within v1.2 If Time Allows

- [ ] **NowPlayingBar shows incoming track during crossfade** — wire `isCrossfadingState` into the player store and show next-track metadata in the bar. Visually useful, not blocking.
- [ ] **Library loading indicator** — show "Loading library..." or animated track count while `getAllTracks()` is in flight. Prevents blank-library confusion on large collections.

### Defer to v1.3+

- [ ] **Crossfade in native decoder mode** — dual backend decoder state, PCM mixing in Rust, high complexity.
- [ ] **Gradual BPM ramp (pitch curve) across crossfade window** — audible artifacts on WebKit, snap behavior at start is already correct.
- [ ] **Key Notation toggle restored** — if users specifically request it, add as a simple display toggle without a settings screen entry.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| End-of-track glitch fix | HIGH | MEDIUM | P1 |
| Async full-library load | HIGH | MEDIUM | P1 |
| Beatmatch crossfade edge cases | HIGH | LOW (core logic verified, fix edge cases) | P1 |
| Settings cleanup | MEDIUM | LOW | P1 |
| NowPlayingBar crossfade indicator | MEDIUM | LOW | P2 |
| Library loading indicator UI | LOW | LOW | P2 |
| Crossfade in native mode | LOW | HIGH | P3 |

---

## Competitor Reference Behavior

| Feature | Rekordbox | Traktor Pro | RecoDeck v1.2 Target |
|---------|-----------|-------------|----------------------|
| Library load | Full library on startup, UI blocked ~5-15s for 50k tracks | Full library in background, browser usable immediately | Full library in background after initial render (~1-3s for 10k tracks) |
| Crossfade tempo match | Sync lock: phase + tempo; linear volume fade | Tempo sync optional; configurable fade curves | Linear fade-in of incoming at matched BPM; snap to native BPM at swap |
| End-of-track | Clean to last decoded sample, no repeat | Clean to last sample | Fix the HTML5 premature-end detection (recovery code exists) |
| Key notation | Camelot only (in standard UI) | Open Key primary, Camelot available | Camelot hardcoded (remove the toggle) |

---

## Sources

- Direct code inspection — HIGH confidence for all behavioral claims:
  - `src/lib/audioPlayer.ts` — crossfade implementation, `playbackRate` logic, native recovery
  - `src/App.tsx` — library loading, pagination state, `initializeApp()` flow
  - `src/components/settings/SettingsContext.tsx` — settings storage keys, `loadSettings()`, callback props
  - `src/components/settings/AppearanceSection.tsx` — Key Notation and Waveform Style subsections
  - `src/components/settings/constants.ts` — `KEY_NOTATIONS`, `WAVEFORM_STYLES` arrays
  - `src/lib/tauri-api.ts` — `getAllTracks`, `getTracksPaginated`, `countTracks` command signatures
  - `src/store/playerStore.ts` — queue management, player state shape
- `.planning/PROJECT.md` — v1.2 feature targets, constraints, audience
- DJ app conventions — Traktor Pro, Rekordbox crossfade behavior (author domain knowledge — MEDIUM confidence on specific pitch behavior, HIGH confidence on volume fade conventions)

---

*Feature research for: RecoDeck v1.2 Playback & UX Polish*
*Researched: 2026-03-06*
