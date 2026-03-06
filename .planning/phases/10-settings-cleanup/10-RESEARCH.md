# Phase 10: Settings Cleanup - Research

**Researched:** 2026-03-06
**Domain:** React frontend — Settings UI component cleanup, hardcoded defaults, dead code removal
**Confidence:** HIGH

## Summary

Phase 10 is a surgical removal of two settings that are no longer needed as user-configurable options: Key Notation (hardcoded to Camelot) and Waveform Style (hardcoded to Traktor RGB). The Settings > Appearance section currently shows five themes (Midnight, Carbon, Dawn, Neon, Custom) — the goal is to reduce this to only two (Midnight, Carbon). No backend Rust changes are required; this is a pure frontend cleanup.

The codebase is well-understood. All read sites for `key_notation` and `waveform_style` in `src/` have been fully catalogued through code inspection. There are exactly six read sites (in `App.tsx` and `SettingsContext.tsx`) and three usage sites in component props/rendering (`TrackTable.tsx`, `SearchView.tsx`, `AppearanceSection.tsx`). After removal, `keyNotation` state in `App.tsx` is also removed since it only exists to pass down to those components — and it will always be `'camelot'`.

The success criterion of `grep -r "key_notation\|waveform_style" src/` returning zero hits is the definitive done signal. The theme cleanup (removing Dawn, Neon, Custom entries from `constants.ts`) is a separate but straightforward concern addressed by SETT-01.

**Primary recommendation:** Work in a single wave: (1) trim `constants.ts` THEMES array to two entries, (2) strip Key Notation and Waveform Style blocks from `AppearanceSection.tsx`, (3) remove dead state/handlers from `SettingsContext.tsx`, (4) remove `key_notation`/`waveform_style` reads from `App.tsx` `loadSettings`, (5) remove `keyNotation` prop threading from `App.tsx` → `TrackTable` → `SearchView`, hardcode `'camelot'` as the default in each component, (6) verify with grep.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETT-01 | User sees only Midnight and Carbon theme options in Settings > Appearance | `constants.ts` THEMES array has 5 entries (midnight, carbon, dawn, neon, custom) — reduce to 2 |
| SETT-02 | Key Notation setting removed from Settings; Camelot hardcoded app-wide | 6 read/write sites in src/ fully mapped; `keyNotation` state thread in App.tsx → TrackTable/SearchView must be removed |
| SETT-03 | Waveform Style setting removed from Settings; Traktor RGB hardcoded | `waveformStyle` state exists in App.tsx (setter only, never read after load) and SettingsContext.tsx; WaveformVisualizer.tsx does NOT read it — already hardcoded internally |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase removes code — no additions.

### Core (existing)
| File | Role | What Changes |
|------|------|--------------|
| `src/components/settings/constants.ts` | THEMES, KEY_NOTATIONS, WAVEFORM_STYLES arrays | Remove 3 themes, remove KEY_NOTATIONS and WAVEFORM_STYLES exports |
| `src/components/settings/AppearanceSection.tsx` | Settings UI component | Remove Key Notation and Waveform Style JSX blocks; remove related imports |
| `src/components/settings/SettingsContext.tsx` | Settings state + IPC layer | Remove keyNotation/waveformStyle state, handlers, loadSettings calls, interface fields, callback props |
| `src/App.tsx` | Root component — loads settings, threads props | Remove getSetting('key_notation') and getSetting('waveform_style') calls; remove `keyNotation` useState; remove `handleKeyNotationChanged` and `handleWaveformStyleChanged` handlers; remove prop passes to SettingsView and SearchView |
| `src/components/TrackTable.tsx` | Track list table | Remove `keyNotation` prop from interface; hardcode `'camelot'` as default (or remove the conditional entirely since Camelot IS the stored format) |
| `src/components/views/SearchView.tsx` | Search results view | Remove `keyNotation` prop from interface; remove `formatKey` openkey branch |

## Architecture Patterns

### Full Removal Inventory (confirmed by grep)

#### `key_notation` and `waveform_style` read sites in `src/`

```
src/components/settings/SettingsContext.tsx:216  tauriApi.getSetting('key_notation').catch(...)
src/components/settings/SettingsContext.tsx:217  tauriApi.getSetting('waveform_style').catch(...)
src/components/settings/SettingsContext.tsx:401  tauriApi.setSetting('key_notation', notation)
src/components/settings/SettingsContext.tsx:412  tauriApi.setSetting('waveform_style', style)
src/App.tsx:293                                  tauriApi.getSetting('key_notation')
src/App.tsx:303                                  tauriApi.getSetting('waveform_style')
```

After Phase 10, all six must be gone. The `setSetting` calls go away when handlers are removed.

#### `keyNotation` prop thread

```
App.tsx:64    useState<'camelot' | 'openkey'>('camelot')        ← remove
App.tsx:293   getSetting('key_notation') → setKeyNotation(...)  ← remove
App.tsx:618   handleKeyNotationChanged(notation) { ... }         ← remove
App.tsx:1193  onKeyNotationChanged={handleKeyNotationChanged}    ← remove
App.tsx:1201  keyNotation={keyNotation} → SearchView             ← remove
App.tsx:1237  keyNotation={keyNotation} → TrackTable             ← remove
TrackTable.tsx:43   keyNotation?: 'camelot' | 'openkey'         ← remove prop
TrackTable.tsx:673  keyNotation === 'openkey' ? ...             ← remove branch, keep track.musical_key
SearchView.tsx:28   keyNotation?: 'camelot' | 'openkey'         ← remove prop
SearchView.tsx:68   if (keyNotation === 'openkey') { ... }      ← remove branch, always return key
```

#### `waveformStyle` state in App.tsx (setter only — never read after load)

```
App.tsx:67    const [, setWaveformStyle] = useState<string>('traktor_rgb')   ← remove entire line
App.tsx:303   getSetting('waveform_style') → setWaveformStyle(...)           ← remove
App.tsx:624   handleWaveformStyleChanged(style) { setWaveformStyle(style) }  ← remove
App.tsx:1194  onWaveformStyleChanged={handleWaveformStyleChanged}             ← remove
```

Note: `WaveformVisualizer.tsx` does NOT read a waveform style prop — it renders with hardcoded Traktor RGB colors internally. No change needed there.

#### THEMES array in `constants.ts`

Current (5 entries):
```typescript
export const THEMES = [
  { id: 'midnight', name: 'Midnight', description: 'Deep dark with indigo accents' },
  { id: 'carbon',   name: 'Carbon',   description: 'Neutral dark with blue accents' },
  { id: 'dawn',     name: 'Dawn',     description: 'Light theme' },
  { id: 'neon',     name: 'Neon',     description: 'Dark with vibrant neon accents' },
  { id: 'custom',   name: 'Custom',   description: 'Choose your own colors' },
]
```

After (2 entries):
```typescript
export const THEMES = [
  { id: 'midnight', name: 'Midnight', description: 'Deep dark with indigo accents' },
  { id: 'carbon',   name: 'Carbon',   description: 'Neutral dark with blue accents' },
]
```

Remove exports: `KEY_NOTATIONS`, `WAVEFORM_STYLES`

#### `AppearanceSection.tsx` — blocks to remove

The entire "Key Notation" subsection (lines 78–98) and the entire "Waveform Style" subsection (lines 100–121). Also remove from the imports line: `KEY_NOTATIONS`, `WAVEFORM_STYLES`. Remove from the useSettingsContext destructure: `keyNotation`, `waveformStyle`, `handleKeyNotationChange`, `handleWaveformStyleChange`.

Also remove the custom colors block (lines 40–75) and its conditional `{currentTheme === 'custom' && ...}` since Custom theme is removed. The `DEFAULT_CUSTOM_COLORS`, `CUSTOM_COLOR_LABELS`, `handleCustomColorChange`, `handleResetCustomColors`, `customColors` context values may also be removable — however, check if `SettingsContext.tsx` or other code still uses them for something. They should be safe to remove since they only serve the Custom theme.

#### `SettingsContext.tsx` — fields to remove from interface and context value

From `SettingsContextValue` interface:
- `keyNotation: string`
- `waveformStyle: string`
- `handleKeyNotationChange: (notation: string) => Promise<void>`
- `handleWaveformStyleChange: (style: string) => Promise<void>`

From `SettingsCallbacks` interface:
- `onKeyNotationChanged?: (notation: string) => void`
- `onWaveformStyleChanged?: (style: string) => void`

From provider state:
- `const [keyNotation, setKeyNotation] = useState('camelot')`
- `const [waveformStyle, setWaveformStyle] = useState('traktor_rgb')`

From `loadSettings()` Promise.all:
- `tauriApi.getSetting('key_notation').catch(() => 'camelot')`
- `tauriApi.getSetting('waveform_style').catch(() => 'traktor_rgb')`
- Also remove the destructured `loadedKeyNotation` and `loadedWaveformStyle` and their `setState` calls below

Remove handler functions:
- `handleKeyNotationChange`
- `handleWaveformStyleChange`

Remove from context value object:
- `keyNotation, waveformStyle, handleKeyNotationChange, handleWaveformStyleChange`

### Anti-Patterns to Avoid

- **Partial removal:** Removing the UI block but leaving the `getSetting` call in `loadSettings()`. The grep test catches this.
- **Leaving `openkey` branch:** `TrackTable.tsx` and `SearchView.tsx` both have `keyNotation === 'openkey'` branches that must be deleted, not just defaulted to 'camelot'.
- **Removing Custom theme UI but keeping custom colors in context:** If `DEFAULT_CUSTOM_COLORS` and custom color handlers are removed from context, also clean up from the context interface. Alternatively, leave them in context but just remove the UI — either is fine, but the clean option is full removal since the Custom theme entry is gone from THEMES.
- **Forgetting `camelotToOpenKey` function in TrackTable.tsx:** Once `keyNotation` prop is gone and the openkey branch is removed, the `camelotToOpenKey` helper function (line 75) is dead code — remove it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Verifying cleanup is complete | Manual search | `grep -r "key_notation\|waveform_style" src/` — the phase success criterion |
| TypeScript catching remaining usages | Relying only on grep | TypeScript compiler (`tsc --noEmit`) will also catch removed prop types still being passed |

## Common Pitfalls

### Pitfall 1: Custom colors state left dangling
**What goes wrong:** `customColors`, `handleCustomColorChange`, `handleResetCustomColors` in SettingsContext are only used when `currentTheme === 'custom'`. If Custom theme is removed from THEMES and the UI block removed, these handlers become unreachable UI-wise but remain in the context type. TypeScript will not complain because AppearanceSection still imports them — unless AppearanceSection fully removes them from its destructure.
**How to avoid:** Remove the custom colors handlers and state together with the Custom theme removal, or leave them (they do no harm at runtime since the UI block gating them is gone). The clean choice: remove them fully.

### Pitfall 2: SettingsView CSS has `.notation-option` styles that become dead
**What goes wrong:** `SettingsView.css` (or AppearanceSection's CSS) has `.notation-option`, `.notation-option--active`, `.key-notation-list`, `.notation-name`, `.notation-description` CSS classes that only applied to the Key Notation and Waveform Style sections.
**How to avoid:** Check `SettingsView.css` and any scoped CSS files for notation/waveform CSS classes and remove them to avoid dead CSS. This is cosmetic but worth doing for cleanliness.

### Pitfall 3: Remaining `openkey` type union in TypeScript
**What goes wrong:** `keyNotation?: 'camelot' | 'openkey'` as a prop type remains in TrackTable.tsx and SearchView.tsx even after removing the prop pass-through. TypeScript will not error on dead interface fields, but they will confuse future readers.
**How to avoid:** Remove the entire prop from the interface in both components.

### Pitfall 4: `camelotToOpenKey` function left as dead code
**What goes wrong:** `TrackTable.tsx` line 75 defines `function camelotToOpenKey(camelot: string)`. Once the openkey branch is removed, this function is unused.
**How to avoid:** Delete the function. ESLint will likely catch it as unused, or TypeScript in strict mode will warn. Either way, delete it proactively.

### Pitfall 5: grep test includes `.planning/` directory
**What goes wrong:** The success criterion is `grep -r "key_notation\|waveform_style" src/` — but if run from the root without `src/` scoped, it may find hits in `.planning/` research files (like this one).
**How to avoid:** Always run the grep scoped to `src/` as specified.

## Code Examples

### THEMES array after cleanup
```typescript
// src/components/settings/constants.ts
export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep dark with indigo accents',
  },
  {
    id: 'carbon',
    name: 'Carbon',
    description: 'Neutral dark with blue accents',
  },
]
// KEY_NOTATIONS and WAVEFORM_STYLES — delete entirely
```

### AppearanceSection.tsx after cleanup (skeleton)
```typescript
// Only Theme subsection remains
import { useSettingsContext } from './SettingsContext'
import { THEMES } from './constants'

export function AppearanceSection() {
  const { currentTheme, handleThemeChange } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Appearance</h2>
      <div className="sv-subsection">
        <h3 className="settings-subsection-title">Theme</h3>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card ${currentTheme === theme.id ? 'theme-card--active' : ''}`}
              onClick={() => handleThemeChange(theme.id)}
            >
              <div className={`theme-preview theme-preview--${theme.id}`}>
                <div className="theme-preview-bar" />
                <div className="theme-preview-content">
                  <div className="theme-preview-line" />
                  <div className="theme-preview-line theme-preview-line--short" />
                </div>
              </div>
              <span className="theme-name">{theme.name}</span>
              <span className="theme-description">{theme.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
```

### TrackTable.tsx key display after cleanup
```typescript
// Before:
{track.musical_key
  ? keyNotation === 'openkey'
    ? camelotToOpenKey(track.musical_key)
    : track.musical_key
  : '—'}

// After (Camelot is always the stored format):
{track.musical_key ?? '—'}
```

### SearchView.tsx formatKey after cleanup
```typescript
// Before:
function formatKey(key?: string) {
  if (!key) return '—'
  if (keyNotation === 'openkey') {
    if (key.endsWith('A')) return key.slice(0, -1) + 'm'
    if (key.endsWith('B')) return key.slice(0, -1) + 'd'
  }
  return key
}

// After (function likely unused entirely — check if formatKey is called, then remove):
// If formatKey is called: return key ?? '—'
// If formatKey is not called (tracks display no key in SearchView): remove function
```

### App.tsx — removing waveformStyle (setter-only state)
```typescript
// Before line 67:
const [, setWaveformStyle] = useState<string>('traktor_rgb')

// After: delete this line entirely
// Then delete the try/catch block at lines 301-309 that sets it
// Then delete handleWaveformStyleChanged function (lines 624-626)
// Then delete onWaveformStyleChanged prop pass to SettingsView (line 1194)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETT-01 | Only Midnight and Carbon appear in theme grid | manual-only | visual verification in app | N/A |
| SETT-02 | Key Notation UI absent; Camelot hardcoded everywhere | grep + manual | `grep -r "key_notation\|waveform_style" src/` returns 0 hits | N/A |
| SETT-03 | Waveform Style UI absent; Traktor RGB hardcoded | grep + manual | `grep -r "key_notation\|waveform_style" src/` returns 0 hits | N/A |

Component-level React tests are explicitly out of scope per REQUIREMENTS.md (components deeply coupled to Tauri IPC + audioPlayer singleton). The grep test is the automated verification for SETT-02 and SETT-03.

### Sampling Rate
- **Per task commit:** `npx vitest run` (existing tests must stay green)
- **Phase gate:** `grep -r "key_notation\|waveform_style" src/` returns zero hits + `npx vitest run` green

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. The only automated check is the grep command, which is a shell verification, not a test file.

## Open Questions

1. **Custom theme: full removal or just hide from UI?**
   - What we know: The Custom theme has backend storage (`setCustomThemeColors`, `getCustomThemeColors` Tauri commands) and CSS classes (`theme-preview--custom`, custom color picker logic). Requirements say "only Midnight and Carbon" — no mention of preserving the custom theme backend.
   - What's unclear: Whether the Rust backend commands for custom colors should also be removed.
   - Recommendation: Remove from the UI and `constants.ts` THEMES array. Leave the backend Tauri commands intact (they do no harm and removing them is risky out-of-scope work). Remove the custom color picker UI block from `AppearanceSection.tsx` since `currentTheme === 'custom'` can never be true if Custom is not selectable.

2. **CSS dead class cleanup scope**
   - What we know: `.notation-option`, `.key-notation-list`, `.notation-name`, `.notation-description`, possibly `.theme-preview--dawn`, `.theme-preview--neon`, `.theme-preview--custom` are now dead CSS.
   - Recommendation: Remove dead CSS classes. They are in `SettingsView.css` — find and delete. Low risk, good hygiene.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all affected files — all findings are from first-party source code
- `src/components/settings/constants.ts` — THEMES (5 entries), KEY_NOTATIONS, WAVEFORM_STYLES
- `src/components/settings/AppearanceSection.tsx` — Key Notation and Waveform Style UI blocks
- `src/components/settings/SettingsContext.tsx` — state, handlers, loadSettings, interface
- `src/App.tsx` lines 64-67, 280-309, 618-626, 1193-1194, 1201, 1237 — full prop thread
- `src/components/TrackTable.tsx` lines 43, 75, 673-676 — keyNotation prop and camelotToOpenKey
- `src/components/views/SearchView.tsx` lines 28, 65-73 — keyNotation prop and formatKey
- `src/components/WaveformVisualizer.tsx` — confirmed does NOT read waveform_style prop

## Metadata

**Confidence breakdown:**
- Removal inventory: HIGH — all sites confirmed by grep and direct file reads
- Impact assessment: HIGH — no backend changes, pure frontend dead code removal
- CSS cleanup scope: MEDIUM — need to check SettingsView.css for dead class names (not read yet)

**Research date:** 2026-03-06
**Valid until:** Until Phase 10 starts — codebase snapshot is current
