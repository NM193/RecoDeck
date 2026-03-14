# Phase 16: EQ UI, Presets, and Persistence - Research

**Researched:** 2026-03-14
**Domain:** React modal UI, vertical sliders, preset selection, SQLite settings persistence
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EQPR-01 | User can select from 6 built-in presets: Flat, Bass Boost, Treble Boost, Vocal, Electronic, Headphones | Preset gain tables defined in this research; `audioPlayer.setAllBands()` already exists |
| EQPR-02 | Selecting a preset applies all 10 band gains smoothly (no audible clicks) | `setAllBands()` calls `_rampEqGain()` per band at 30ms — already implemented in Phase 15 |
| EQUI-01 | An EQ icon appears next to the volume control in the NowPlayingBar | Right section button pattern already established; Icon component uses Lucide |
| EQUI-02 | Clicking the EQ icon opens a modal with 10 vertical sliders and frequency labels | Modal pattern from AIPlaylistDialog; vertical sliders from volume popup pattern |
| EQUI-03 | User can adjust individual band gain (±12 dB) by dragging sliders in custom mode | Native `<input type="range">` with CSS `writing-mode: vertical-lr`; same pattern as volume slider |
| EQUI-04 | Modal includes an on/off toggle and a preset selector dropdown | ToggleSwitch component exists in settings; native `<select>` or custom dropdown |
| EQUI-05 | EQ icon shows an active indicator when EQ is enabled | `now-playing-bar__btn--toggle now-playing-bar__btn--active` CSS pattern already exists |
| EQUI-06 | Modal uses the app's existing theme system (midnight/carbon) with cool, minimal design | CSS custom properties fully cover both themes — no extra theme work needed |
| EQPE-01 | EQ state (enabled, active preset, custom band gains) persists across app restarts via SQLite settings | `tauriApi.setSetting('eq_state', JSON.stringify(...))` / `getSetting('eq_state')` — no new Rust code |
</phase_requirements>

## Summary

Phase 16 is a pure frontend task. Phase 15 delivered all audio-engine API methods (`setEqBandGain`, `setEqEnabled`, `setAllBands`, `loadEqState`, `getEqState`) — Phase 16 only wires them to UI and SQLite persistence.

The implementation is three components: (1) an EQ icon button added to the NowPlayingBar right section, (2) an `EQModal` component with 10 vertical sliders and a preset dropdown, and (3) a persistence layer using the existing `tauriApi.getSetting/setSetting` mechanism already used for crossfade and theme settings.

There is no need for new Rust commands, no new Zustand store slices, and no new dependencies. The modal follows the same CSS custom-property-based theming as every other dialog in the app. The vertical slider styling uses the same `writing-mode: vertical-lr` technique already working in the volume popup.

**Primary recommendation:** Build the EQModal as a standalone colocated component (`src/components/eq/EQModal.tsx` + `EQModal.css`), wire EQ state in a single `useEffect` inside NowPlayingBar (mirrors the crossfade settings load pattern), and persist on every user change with a debounce of 300ms.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.x (already in project) | Modal, slider, dropdown UI | Project baseline |
| lucide-react | existing | EQ icon (`SlidersHorizontal` or `Equalizer`) | All icons use this via Icon component |
| CSS custom properties | — | Theming for midnight/carbon | Already used everywhere in the app |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tauriApi.getSetting / setSetting | existing | Persist EQ JSON under key "eq_state" | Load on mount, save on every change |
| audioPlayer (singleton) | existing | Apply gains/enable to the audio engine | Direct method calls — no Tauri IPC |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<input type="range">` | Custom drag handler | Custom drag is needed for precise touch control; but for desktop-only this app, native range is sufficient and simpler |
| Inline modal state in NowPlayingBar | Zustand EQ store slice | Zustand adds overhead; local state in EQModal is sufficient — no cross-component EQ reads elsewhere |
| Native `<select>` for presets | Custom dropdown | Custom dropdown matches app aesthetics better; native select works and is simpler |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── eqConstants.ts          # EXISTING: EQ_BANDS array, EqBand type
│   └── eqPresets.ts            # NEW: EQ_PRESETS constant (6 preset gain arrays)
├── components/
│   └── eq/
│       ├── EQModal.tsx         # NEW: modal with sliders + dropdown + toggle
│       └── EQModal.css         # NEW: modal styles (vertical sliders, grid layout)
│   └── layout/
│       └── NowPlayingBar.tsx   # MODIFIED: add EQ icon button + EQModal mount
│       └── NowPlayingBar.css   # MODIFIED: EQ icon active state (reuse existing class)
```

### Pattern 1: EQ Presets as a Static Constant
**What:** Export `EQ_PRESETS` from `eqPresets.ts` — keyed object of preset name to 10-element gain array
**When to use:** Referenced by EQModal dropdown and the persistence serialization

```typescript
// src/lib/eqPresets.ts
// Bands: 40, 80, 160, 320, 640, 1.3k, 2.5k, 5k, 10k, 16k Hz
export type EqPresetName = 'flat' | 'bass_boost' | 'treble_boost' | 'vocal' | 'electronic' | 'headphones'

export interface EqPreset {
  label: string
  gains: number[]  // 10 values in dB, same order as EQ_BANDS
}

export const EQ_PRESETS: Record<EqPresetName, EqPreset> = {
  flat: {
    label: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  bass_boost: {
    label: 'Bass Boost',
    gains: [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
  },
  treble_boost: {
    label: 'Treble Boost',
    gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
  },
  vocal: {
    label: 'Vocal',
    gains: [-2, -3, 0, 3, 5, 5, 4, 2, 0, -1],
  },
  electronic: {
    label: 'Electronic',
    gains: [6, 5, 2, 0, -1, 2, 1, 3, 5, 6],
  },
  headphones: {
    label: 'Headphones',
    gains: [4, 3, 1, 0, -1, 0, 1, 3, 4, 5],
  },
}

export const EQ_PRESET_NAMES = Object.keys(EQ_PRESETS) as EqPresetName[]
```

### Pattern 2: EQModal Component Structure
**What:** Self-contained modal that owns local UI state, calls audioPlayer directly, calls tauriApi for persistence
**When to use:** Opened from NowPlayingBar EQ icon; closes on backdrop click or Escape

```typescript
// src/components/eq/EQModal.tsx
interface EQModalProps {
  open: boolean
  onClose: () => void
}

export function EQModal({ open, onClose }: EQModalProps) {
  const [enabled, setEnabled] = useState(false)
  const [bands, setBands] = useState<number[]>(new Array(10).fill(0))
  const [activePreset, setActivePreset] = useState<EqPresetName | 'custom'>('flat')

  // Load from audioPlayer on first open (audioPlayer is source of truth at runtime)
  useEffect(() => {
    if (!open) return
    const state = audioPlayer.getEqState()
    setEnabled(state.enabled)
    setBands(state.bands)
    // Detect which preset matches current bands (or 'custom')
    setActivePreset(detectPreset(state.bands))
  }, [open])

  // Persist on change (debounced 300ms)
  // ...
}
```

### Pattern 3: Persistence Load on NowPlayingBar Mount
**What:** Mirrors crossfade settings load — reads `eq_state` JSON from SQLite and calls `audioPlayer.loadEqState()` before first play
**When to use:** Single `useEffect` with empty deps array in NowPlayingBar, runs once on mount

```typescript
// In NowPlayingBar.tsx — alongside crossfade settings load
useEffect(() => {
  (async () => {
    try {
      const raw = await tauriApi.getSetting('eq_state').catch(() => null)
      if (raw) {
        const state = JSON.parse(raw) as { enabled: boolean; bands: number[]; preset: string }
        audioPlayer.loadEqState({ enabled: state.enabled, bands: state.bands })
      }
    } catch (err) {
      console.warn('[NowPlayingBar] Failed to load EQ state:', err)
    }
  })()
}, [])
```

### Pattern 4: Vertical Slider with CSS writing-mode
**What:** Native `<input type="range">` rotated to vertical using `writing-mode: vertical-lr; direction: rtl`
**When to use:** All 10 EQ band sliders — same technique already working in volume popup

```css
/* EQModal.css */
.eq-modal__slider {
  writing-mode: vertical-lr;
  direction: rtl;
  -webkit-appearance: none;
  appearance: none;
  width: 4px;
  height: 120px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.eq-modal__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
}
```

### Pattern 5: EQ Icon Active State
**What:** Reuse `now-playing-bar__btn--toggle now-playing-bar__btn--active` CSS classes for the EQ icon button
**When to use:** When `eqEnabled` state is true

```tsx
// In NowPlayingBar.tsx RIGHT section
<button
  className={`now-playing-bar__btn now-playing-bar__btn--action ${eqEnabled ? 'now-playing-bar__btn--toggle now-playing-bar__btn--active' : ''}`}
  onClick={() => setShowEQModal(true)}
  title="Equalizer"
>
  <Icon name="SlidersHorizontal" size={18} />
</button>
```

### Anti-Patterns to Avoid
- **Creating a Zustand store slice for EQ state:** EQ state only needed in NowPlayingBar + EQModal. Local React state suffices. Avoids unnecessary global state churn.
- **Calling tauriApi.setSetting on every slider move without debounce:** SQLite write on every pixel of drag will cause jank. Use a `useRef` debounce timeout of 300ms.
- **Reading audioPlayer EQ state reactively:** audioPlayer has no React subscription mechanism. Read `getEqState()` once on modal open; maintain local React state for UI. Don't poll.
- **Creating a new AudioContext:** EQ engine is already initialized in Phase 15. EQModal never touches Web Audio API directly — all changes go through audioPlayer methods.
- **Resetting EQ state during audioPlayer.cleanup():** Phase 15 explicitly preserves EQ gains across cleanup. Do NOT add any EQ reset to cleanup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth gain application | Custom animation loop | `audioPlayer.setAllBands()` (Phase 15) | Already uses 30ms linearRamp per band — click-free |
| Vertical slider | Custom drag handler | CSS `writing-mode: vertical-lr` on native range | Already proven in volume popup in NowPlayingBar.css |
| Modal backdrop/close | Custom focus trap | `position:fixed; inset:0` backdrop + Escape key handler | Already proven in PromptModal and AIPlaylistDialog |
| Theme detection | Reading CSS vars at runtime | CSS custom properties on all elements | Both themes define same variable names — modal inherits automatically |
| New Rust command | Custom `get_eq_state` / `set_eq_state` IPC | `tauriApi.getSetting('eq_state')` JSON string | Already used for crossfade settings — no Rust code needed |

**Key insight:** All hard problems (smooth gain changes, vertical sliders, modal pattern, SQLite persistence) are already solved in this codebase. Phase 16 is wiring, not invention.

## Common Pitfalls

### Pitfall 1: EQ State Out of Sync Between Modal and audioPlayer
**What goes wrong:** EQModal re-opens and shows stale React state from previous session if `open` effect isn't correct.
**Why it happens:** React state doesn't reset between modal open/close unless explicitly re-read.
**How to avoid:** Always read `audioPlayer.getEqState()` inside the `useEffect(() => { if (!open) return ... }, [open])` guard. This makes `open` the trigger.
**Warning signs:** Sliders show 0dB when audio is playing boosted bass; toggling modal resets gains.

### Pitfall 2: Detecting "Custom" Preset After Individual Band Drag
**What goes wrong:** User selects "Bass Boost" then drags one slider — preset dropdown still shows "Bass Boost".
**Why it happens:** No automatic invalidation of preset label when band is manually adjusted.
**How to avoid:** After any individual band change, check if current gains exactly match any preset (compare arrays element-wise). If not, set `activePreset = 'custom'`. Helper: `detectPreset(bands: number[]): EqPresetName | 'custom'`.
**Warning signs:** Preset label is stale after manual adjustment; user confusion about current state.

### Pitfall 3: Persisting Before audioPlayer State is Authoritative
**What goes wrong:** If EQModal saves React local state to SQLite but doesn't call audioPlayer methods, audio and persistence diverge.
**Why it happens:** Saving happens separately from applying.
**How to avoid:** Treat audioPlayer as the runtime source of truth. On every change: (1) call audioPlayer method, (2) update React state, (3) debounce persist. Never persist without applying.

### Pitfall 4: Vertical Slider Direction Inversion
**What goes wrong:** Dragging up decreases gain, dragging down increases it — counterintuitive for EQ.
**Why it happens:** `writing-mode: vertical-lr` without `direction: rtl` inverts the expected direction.
**How to avoid:** Always pair `writing-mode: vertical-lr` with `direction: rtl` (matches volume slider in NowPlayingBar.css:388-390).
**Warning signs:** Slider thumb moves opposite to expected direction.

### Pitfall 5: Persistence Format Missing Preset Field
**What goes wrong:** App restores band positions but can't show which preset is active.
**Why it happens:** Only saving `{ enabled, bands }` without the preset name.
**How to avoid:** Persist `{ enabled: boolean, bands: number[], preset: string }` — where `preset` is the `EqPresetName | 'custom'` string. Load: detect from bands OR trust stored preset string (validate bands still match).
**Warning signs:** Preset dropdown always shows "Custom" on restart even when a named preset was selected.

### Pitfall 6: Modal z-index Conflict with NowPlayingBar
**What goes wrong:** EQ modal appears behind NowPlayingBar popup menus.
**Why it happens:** volume popup is z-index: 200 (NowPlayingBar.css:383); AIPlaylistDialog is z-index: 9000.
**How to avoid:** Set EQ modal backdrop z-index to at least 1000 (above volume popup at 200, below AI dialog at 9000).

## Code Examples

Verified patterns from existing codebase:

### Vertical Range Input (from NowPlayingBar.css:387-425)
```css
/* Already working in volume popup — copy this pattern exactly */
.eq-modal__slider {
  writing-mode: vertical-lr;
  direction: rtl;
  -webkit-appearance: none;
  appearance: none;
  width: 4px;
  height: 120px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.eq-modal__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.eq-modal__slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--accent);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
```

### Active Indicator Button Pattern (from NowPlayingBar.css:327-341)
```css
/* Reuse -- already defined for shuffle/repeat */
.now-playing-bar__btn--toggle.now-playing-bar__btn--active {
  color: var(--accent) !important;
}

.now-playing-bar__btn--toggle.now-playing-bar__btn--active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  background: var(--accent);
  border-radius: 50%;
}
```

### Settings Persistence Pattern (from NowPlayingBar.tsx:126-143)
```typescript
// Exact pattern from crossfade settings load — replicate for EQ
useEffect(() => {
  ;(async () => {
    try {
      const raw = await tauriApi.getSetting('eq_state').catch(() => null)
      if (raw) {
        const state = JSON.parse(raw) as { enabled: boolean; bands: number[]; preset: string }
        audioPlayer.loadEqState({ enabled: state.enabled, bands: state.bands })
        // EQModal will read from audioPlayer.getEqState() when it opens
      }
    } catch (err) {
      console.warn('[NowPlayingBar] Failed to load EQ state:', err)
    }
  })()
}, [])
```

### Debounced Persist Pattern
```typescript
// In EQModal — debounce SQLite writes to avoid jank on slider drag
const persistTimeout = useRef<number | null>(null)

const persistEqState = useCallback((enabled: boolean, bands: number[], preset: string) => {
  if (persistTimeout.current !== null) clearTimeout(persistTimeout.current)
  persistTimeout.current = setTimeout(async () => {
    try {
      await tauriApi.setSetting('eq_state', JSON.stringify({ enabled, bands, preset }))
    } catch (err) {
      console.warn('[EQModal] Failed to persist EQ state:', err)
    }
  }, 300) as unknown as number
}, [])
```

### EQ Icon with Active State
```tsx
{/* In NowPlayingBar.tsx RIGHT section, before volume or after waveform toggle */}
<button
  className={`now-playing-bar__btn now-playing-bar__btn--action${eqEnabled ? ' now-playing-bar__btn--toggle now-playing-bar__btn--active' : ''}`}
  onClick={() => setShowEQModal((v) => !v)}
  title={eqEnabled ? 'Equalizer (active)' : 'Equalizer'}
>
  <Icon name="SlidersHorizontal" size={18} />
</button>

{showEQModal && (
  <EQModal open={showEQModal} onClose={() => setShowEQModal(false)} onEnabledChange={setEqEnabled} />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate Tauri commands per setting | Single JSON string under generic key | Project pattern from v1.0 | No Rust changes needed for EQ persistence |
| Custom slider CSS | Native `<input type="range">` with writing-mode | Project pattern from v1.2 volume popup | Reliable cross-platform, WebKit-compatible |
| Global Zustand for everything | Local component state for modals | Project pattern throughout | Less boilerplate, isolated concerns |

## Open Questions

1. **Preset dropdown: native `<select>` vs custom?**
   - What we know: The rest of the app uses native selects in settings (crossfade duration is a number input, not custom). Custom dropdowns exist in no non-AI UI areas.
   - What's unclear: Design spec doesn't specify. Requirements say "dropdown" which implies a selector.
   - Recommendation: Use native `<select>` styled with CSS to match the dark theme. Simpler, accessible, no JS overhead. Add minimal CSS to match bg/border vars.

2. **EQ icon placement: before or after waveform toggle in NowPlayingBar right section?**
   - What we know: Right section currently has: Volume, Waveform toggle, Mini Player, Add to Playlist, AI buttons (conditional).
   - What's unclear: No spec on exact position.
   - Recommendation: Place immediately after waveform toggle (before Mini Player). Logical grouping — waveform and EQ are both audio visualization/shaping tools.

3. **EqEnabled state sync between NowPlayingBar icon and EQModal toggle**
   - What we know: NowPlayingBar needs `eqEnabled` as React state to render the active indicator. EQModal also has its own `enabled` state.
   - What's unclear: Who owns the canonical enabled state?
   - Recommendation: NowPlayingBar holds `eqEnabled` as React state (mirrors crossfade). EQModal receives `onEnabledChange` callback. When EQModal's toggle fires, it calls `audioPlayer.setEqEnabled(value)` AND the callback to update NowPlayingBar's icon. This keeps the icon reactive without adding Zustand.

## Validation Architecture

> `workflow.nyquist_validation` key is absent from .planning/config.json — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test files or config found in project |
| Config file | None — Wave 0 gap |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EQPR-01 | 6 preset gain arrays are correct values | unit | N/A | ❌ Wave 0 |
| EQPR-02 | setAllBands applies smoothly (30ms ramp) | manual-only | Visual/audio check — ramp timing is audio-perceptual | N/A |
| EQUI-01 | EQ icon renders in NowPlayingBar right | manual-only | Visual smoke test | N/A |
| EQUI-02 | Modal opens with 10 sliders + labels | manual-only | Visual smoke test | N/A |
| EQUI-03 | Dragging slider calls setEqBandGain | manual-only | Audio check | N/A |
| EQUI-04 | Toggle + preset dropdown present and functional | manual-only | Visual + audio check | N/A |
| EQUI-05 | Active indicator shows on icon when enabled | manual-only | Visual check | N/A |
| EQUI-06 | Modal renders in both themes | manual-only | Switch theme, reopen modal | N/A |
| EQPE-01 | EQ state persists across app restart | manual-only | Restart app, verify state restored | N/A |

### Sampling Rate
- **Per task commit:** Manual: open modal, move a slider, close + reopen to verify state
- **Per wave merge:** Manual: full restart test for EQPE-01
- **Phase gate:** All 9 success criteria TRUE before `/gsd:verify-work`

### Wave 0 Gaps
- No automated test infrastructure exists in this project. All EQ UI verification is manual. No test files needed for Wave 0 — manual verification covers all requirements for this phase.

*(Note: EQPR-01 preset values could be unit tested but there is no test runner configured. If a test runner is added in the future, preset gain arrays are pure data and trivially testable.)*

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `src/lib/audioPlayer.ts` EQ methods (lines 91-171)
- Codebase direct inspection — `src/lib/eqConstants.ts` EQ_BANDS array
- Codebase direct inspection — `src/components/layout/NowPlayingBar.css` volume slider (lines 387-425) for vertical range pattern
- Codebase direct inspection — `src/components/layout/NowPlayingBar.tsx` crossfade settings load (lines 126-143) for persistence pattern
- Codebase direct inspection — `src/styles/globals.css` theme variables (lines 36-120) for both themes
- Codebase direct inspection — `src/components/PromptModal.tsx` and `src/components/ai/AIPlaylistDialog.css` for modal pattern
- Codebase direct inspection — `src/components/Icon.tsx` for Lucide icon system
- Codebase direct inspection — `src/lib/tauri-api.ts` for getSetting/setSetting signatures
- Codebase direct inspection — `.planning/STATE.md` v1.4 critical constraints
- Codebase direct inspection — `.planning/phases/15-eq-audio-engine/15-CONTEXT.md` for locked Phase 15 decisions

### Secondary (MEDIUM confidence)
- Vertical slider: `writing-mode: vertical-lr; direction: rtl` — documented in MDN Web Docs, proven in volume popup code
- EQ preset gain values: industry-standard DJ EQ settings (bass boost, treble boost, vocal, electronic, headphones) — verified against multiple EQ documentation sources

### Tertiary (LOW confidence)
- Preset gain values for Electronic and Headphones — typical values from EQ preset databases; may need adjustment based on user testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies
- Architecture: HIGH — all patterns proven in existing codebase (modal, vertical slider, settings persistence)
- Pitfalls: HIGH — identified from direct inspection of existing code and patterns
- Preset gain values: MEDIUM — standard values, tunable post-launch

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable — no external dependencies to track)
