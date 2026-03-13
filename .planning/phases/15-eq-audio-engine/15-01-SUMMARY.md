---
phase: 15-eq-audio-engine
plan: 01
subsystem: audio
tags: [web-audio-api, biquad-filter, equalizer, audioplayer, typescript]

# Dependency graph
requires: []
provides:
  - 10-band graphic EQ filter chain integrated into the existing Web Audio graph in audioPlayer.ts
  - EQ_BANDS constant and EqBand type in eqConstants.ts for Phase 16 UI consumption
  - Public EQ API: setEqBandGain, setEqEnabled, setAllBands, loadEqState, getEqState
  - visibilitychange guard to resume AudioContext after WebKit background suspension
  - Crossfade-safe source reconnect: routes through EQ chain on audio element swap
affects:
  - 16-eq-ui (consumes EQ_BANDS constant and all 5 EQ API methods from AudioPlayer)
  - NowPlayingBar (mounts loadEqState on startup via Phase 16)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EQ filter chain inserted lazily inside getAnalyser() — no separate init needed, shares existing _vizCtx"
    - "cancelScheduledValues + setValueAtTime anchor + linearRampToValueAtTime 30ms pattern for all gain changes"
    - "EQ bypass = all filter gains ramped to 0 dB (transparent); stored gains restored on re-enable"
    - "_eqGains and _eqEnabled survive cleanup() — user preference state not reset on session end"

key-files:
  created:
    - src/lib/eqConstants.ts
  modified:
    - src/lib/audioPlayer.ts

key-decisions:
  - "EQ filter chain created lazily inside getAnalyser() to share _vizCtx — no second AudioContext"
  - "30ms linearRamp for all gain changes (cancel+anchor+ramp) to prevent clicks/pops"
  - "EQ gains and enabled state NOT reset in cleanup() — preserved as user preference across sessions"
  - "Native PCM mode: EQ methods are no-ops that only store state; acceptable documented behavior"

patterns-established:
  - "cancel+anchor+linearRamp: always precede gain change with cancelScheduledValues then setValueAtTime anchor"
  - "Lazy EQ init: filter chain built during first getAnalyser() call, not at module load"

requirements-completed: [EQAP-01, EQAP-02, EQAP-03, EQAP-04]

# Metrics
duration: 12min
completed: 2026-03-13
---

# Phase 15 Plan 01: EQ Audio Engine — Filter Chain and API Summary

**10-band BiquadFilterNode chain (40Hz–16kHz) wired into existing Web Audio graph with ramped gain API, bypass, state load/save, and WebKit visibility guard**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T18:30:48Z
- **Completed:** 2026-03-13T18:43:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `eqConstants.ts` with `EqBand` interface and `EQ_BANDS` 10-band constant (single source of truth for Phase 16 UI)
- Inserted EQ filter chain into `getAnalyser()` lazily — shares existing `_vizCtx`, topology: `_vizSource -> eqFilters[0..9] -> _vizAnalyser -> destination`
- Added `visibilitychange` listener to resume AudioContext after WebKit background suspension (EQAP-04)
- Crossfade reconnect now routes `_vizSource` through `eqFilters[0]` instead of directly to analyser (EQAP-03)
- Added 5 public EQ methods plus private `_rampEqGain` helper using the 30ms linearRamp pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Create EQ constants and insert filter chain into audio graph** - `a404290` (feat)
2. **Task 2: Add EQ API methods (gain control, bypass, state management)** - `7e772c7` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/lib/eqConstants.ts` - Exports `BiquadFilterType`, `EqBand` interface, and `EQ_BANDS` 10-band constant
- `src/lib/audioPlayer.ts` - EQ private fields, filter chain in getAnalyser(), cleanup, and 5 public EQ methods

## Decisions Made
- Reused `_vizCtx` for EQ filters — `createMediaElementSource()` can only be called once per HTMLAudioElement, so sharing is mandatory
- 30ms linearRamp for all gain changes to prevent audible clicks; no instant `setValueAtTime` for gains
- `_eqGains` and `_eqEnabled` are not reset in `cleanup()` so user settings survive across app sessions
- Native PCM mode: EQ is a documented no-op (no-op when `getAnalyser()` returns null)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (EQ UI) can consume `EQ_BANDS` from `eqConstants.ts` and all 5 EQ methods from `AudioPlayer`
- `loadEqState()` is ready for NowPlayingBar mount effect to restore persisted EQ settings before first play
- Manual smoke testing recommended: DevTools `window.__audioPlayer.setEqBandGain(0, 12); window.__audioPlayer.setEqEnabled(true)` to verify audible bass boost

---
*Phase: 15-eq-audio-engine*
*Completed: 2026-03-13*
