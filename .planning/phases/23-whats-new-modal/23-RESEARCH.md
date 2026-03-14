# Phase 23: Categorized What's New Modal - Research

**Researched:** 2026-03-14
**Domain:** TypeScript refactor — changelog parsing, React modal component, fresh-install guard
**Confidence:** HIGH

## Summary

Phase 23 is a contained refactor of two existing files (`src/lib/changelog.ts` and `src/components/WhatsNewDialog.tsx`) plus two call-site updates in `src/App.tsx`. No new dependencies are needed. The CHANGELOG.md already uses Keep a Changelog format with `### Added`, `### Changed`, and `### Fixed` subsections — so the parser can be extended to return a categorized object instead of a flat array.

The current fresh-install behavior is a bug: `getSetting('last_seen_version')` returns `null` on a fresh DB, and `null !== currentVersion` evaluates to `true`, so the modal fires on first launch. The fix is a single null guard before comparing versions.

The "Update" button in `WhatsNewDialog.tsx` is a duplicate of the Settings > About update flow introduced in Phase 22. It must be removed entirely; all update actions now route through `AboutSection`.

**Primary recommendation:** Extend `getChangesForVersion()` to return `{ added: string[], changed: string[], fixed: string[] }`, update the two callers (`App.tsx` whatsNew state and the WhatsNewDialog props), add a `null` guard in `initializeApp()`, and strip the update button from WhatsNewDialog.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WHNW-01 | `getChangesForVersion()` returns `{ added: string[], changed: string[], fixed: string[] }` instead of flat `string[]` | CHANGELOG.md already has `### Added/Changed/Fixed` subsections; regex can be extended to capture each subsection independently |
| WHNW-02 | What's New modal displays three labeled sections (New / Fixes / Changes) | WhatsNewDialog renders from props; update prop type and render loop to three sections; hide empty sections |
| WHNW-03 | What's New modal does not fire on fresh install (null guard on `last_seen_version`) | Current code: `if (lastSeen !== currentVersion)` — fires when `lastSeen` is `null`; fix: `if (lastSeen !== null && lastSeen !== currentVersion)` |
| WHNW-04 | Duplicate update button removed from WhatsNewDialog | `handleUpdate` function and Update button JSX removed; only "Got it" button remains; related `useState` hooks cleaned up |
</phase_requirements>

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.x | Type-safe return shape for categorized changes | Already in use project-wide |
| React | ~18.x | Component props interface update | Already in use project-wide |
| Vitest | latest | Unit tests for changelog parser | Already configured (`npm run test`) |

### Supporting

No new libraries needed. The CHANGELOG.md raw import (`import changelog from '../../CHANGELOG.md?raw'`) is already working via Vite's `?raw` suffix.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending regex in changelog.ts | A markdown parsing library | Markdown parser is overkill; the CHANGELOG format is stable and predictable |
| Inline null check in initializeApp | Backend `get_setting` returning a sentinel value | Frontend null guard is simpler; no Rust changes needed |

**Installation:** None required.

## Architecture Patterns

### Affected Files

```
src/
├── lib/
│   └── changelog.ts          # WHNW-01: change return type + parser logic
├── components/
│   └── WhatsNewDialog.tsx    # WHNW-02 + WHNW-04: new prop type, new render, remove update button
└── App.tsx                   # WHNW-01 + WHNW-03: update state type, add null guard, pass new prop shape
```

### Pattern 1: Categorized Return Type

**What:** Replace `string[]` return with `{ added: string[], changed: string[], fixed: string[] }`.

**When to use:** Whenever structured changelog data is needed for display.

**Current implementation:**
```typescript
// src/lib/changelog.ts — current (returns flat list, strips ### headers)
export function getChangesForVersion(version: string): string[] {
  // ... regex extracts the version block
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('###'))
}
```

**Target implementation:**
```typescript
export interface VersionChanges {
  added: string[]
  changed: string[]
  fixed: string[]
}

export function getChangesForVersion(version: string): VersionChanges {
  const versionNorm = version.replace(/^v/, '')
  const escaped = versionNorm.replace(/\./g, '\\.')
  const regex = new RegExp(
    `## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`,
  )
  const match = changelog.match(regex)
  if (!match) return { added: [], changed: [], fixed: [] }

  const block = match[1]
  return {
    added: extractSection(block, 'Added'),
    changed: extractSection(block, 'Changed'),
    fixed: extractSection(block, 'Fixed'),
  }
}

function extractSection(block: string, heading: string): string[] {
  const regex = new RegExp(
    `### ${heading}\\n([\\s\\S]*?)(?=\\n### |$)`,
  )
  const match = block.match(regex)
  if (!match) return []
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0)
}
```

### Pattern 2: Null Guard for Fresh Install (WHNW-03)

**What:** `getSetting('last_seen_version')` returns `null` when the key has never been set (fresh DB).

**Current code in `App.tsx` (lines 312–321):**
```typescript
const lastSeen = await tauriApi.getSetting('last_seen_version')
const currentVersion = appPackage.version
if (lastSeen !== currentVersion) {        // BUG: fires when lastSeen === null
  const changes = getChangesForVersion(currentVersion)
  if (changes.length > 0) {              // will also need to check categorized shape
    setWhatsNew({ version: `v${currentVersion}`, changes })
  }
  await tauriApi.setSetting('last_seen_version', currentVersion)
}
```

**Fixed code:**
```typescript
const lastSeen = await tauriApi.getSetting('last_seen_version')
const currentVersion = appPackage.version
if (lastSeen === null) {
  // Fresh install — record current version but do NOT show What's New
  await tauriApi.setSetting('last_seen_version', currentVersion)
} else if (lastSeen !== currentVersion) {
  const changes = getChangesForVersion(currentVersion)
  const hasAny = changes.added.length > 0 || changes.changed.length > 0 || changes.fixed.length > 0
  if (hasAny) {
    setWhatsNew({ version: `v${currentVersion}`, changes })
  }
  await tauriApi.setSetting('last_seen_version', currentVersion)
}
```

### Pattern 3: Updated App.tsx State Type

**What:** The `whatsNew` state currently holds `changes: string[]`. Must change to hold `changes: VersionChanges`.

```typescript
// Before
const [whatsNew, setWhatsNew] = useState<{
  version: string
  changes: string[]
} | null>(null)

// After
const [whatsNew, setWhatsNew] = useState<{
  version: string
  changes: VersionChanges
} | null>(null)
```

The render site (`<WhatsNewDialog ... changes={whatsNew.changes} />`) stays the same structurally; only the prop type changes.

### Pattern 4: WhatsNewDialog — New Prop Type + Sectioned Render (WHNW-02)

**What:** Replace `changes: string[]` prop with `changes: VersionChanges`. Render three sections; skip empty ones.

```typescript
import type { VersionChanges } from '../lib/changelog'

interface WhatsNewDialogProps {
  version: string
  changes: VersionChanges
  onClose: () => void
}

// Render (replacing the flat <ul>):
const sections: { label: string; items: string[] }[] = [
  { label: 'New', items: changes.added },
  { label: 'Fixed', items: changes.fixed },
  { label: 'Changes', items: changes.changed },
]

{sections
  .filter((s) => s.items.length > 0)
  .map((s) => (
    <div key={s.label} style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text-primary)' }}>
        {s.label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        {s.items.map((item, i) => (
          <li key={i} style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  ))}
```

### Pattern 5: Remove Update Button from WhatsNewDialog (WHNW-04)

**What:** The `handleUpdate` function, `updating`/`updateStatus`/`progress` state, and the Update `<button>` are all removed. The progress bar JSX block is removed. Only the "Got it" `<button>` remains in the footer.

**After removal:** The component becomes a simple display-only modal with version title, categorized changes, and a single "Got it" close button.

### Anti-Patterns to Avoid

- **Keep the `null` check for changes before showing modal:** Even after the fresh-install guard, guard against showing an empty modal if a version has no changelog entries.
- **Do not skip `setSetting` on fresh install:** We must record `last_seen_version` on fresh install to prevent the modal from appearing after the first non-fresh launch.
- **Do not use `changes.length > 0` on the new shape:** It's an object, not an array. Check `hasAny` as shown above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Custom full-markdown parser | Targeted regex on known CHANGELOG format | Keep a Changelog format is stable; full parser adds bundle weight |
| Section detection | Scanning for all `###` headings dynamically | Explicit `extractSection('Added')`, `extractSection('Changed')`, `extractSection('Fixed')` | Explicit is safer; avoids surprises from unexpected headings |

## Common Pitfalls

### Pitfall 1: Fresh Install Bug (current behavior)
**What goes wrong:** `null !== "0.2.5"` is `true`, so the modal fires on first launch.
**Why it happens:** `getSetting` returns `null` for unset keys; the current code doesn't distinguish `null` from an older version.
**How to avoid:** Check `lastSeen === null` first and branch explicitly.
**Warning signs:** Users report seeing What's New on first install.

### Pitfall 2: Forgetting to Update Both Callers of `getChangesForVersion`

**What goes wrong:** TypeScript will catch this at compile time, but only if the state type in `App.tsx` is updated. If the type is left as `changes: string[]` and only `WhatsNewDialog`'s props are updated, the error manifests at the render call site.

**How to avoid:** Update in this order: (1) `changelog.ts` return type, (2) `App.tsx` `whatsNew` state type, (3) `WhatsNewDialog` props. TypeScript propagates the errors top-down, making it easy to follow.

### Pitfall 3: Empty `VersionChanges` Object vs Empty Array
**What goes wrong:** Previous guard was `if (changes.length > 0)`. After refactor it's an object — `changes.length` is `undefined`, which is falsy, so the condition always fails silently.
**How to avoid:** Use `const hasAny = changes.added.length > 0 || changes.changed.length > 0 || changes.fixed.length > 0`.

### Pitfall 4: Regex Case Sensitivity
**What goes wrong:** CHANGELOG.md uses `### Added` (capital A). A regex like `### added` would silently return an empty array.
**How to avoid:** Match exactly as CHANGELOG.md spells the headings: `Added`, `Changed`, `Fixed`.

## Code Examples

Verified patterns from reading actual project files:

### Current CHANGELOG.md Structure (verified)

```markdown
## [0.2.5] - 2026-03-06

### Added
- Waveform visualizer in the Now Playing bar
- Crossfade between tracks with adjustable duration

### Changed
- More accurate key detection

### Fixed
- Track table now fills full window width at any size
```

All three sections (`### Added`, `### Changed`, `### Fixed`) are used in the current CHANGELOG — the categorized parser will produce non-empty arrays immediately.

### Existing Test Pattern (vitest, from `src/lib/musicUtils.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { getChangesForVersion } from './changelog'

describe('getChangesForVersion', () => {
  it('returns categorized object for known version', () => {
    const result = getChangesForVersion('0.2.5')
    expect(result).toHaveProperty('added')
    expect(result).toHaveProperty('changed')
    expect(result).toHaveProperty('fixed')
    expect(Array.isArray(result.added)).toBe(true)
  })

  it('returns empty arrays for unknown version', () => {
    const result = getChangesForVersion('9.9.9')
    expect(result.added).toHaveLength(0)
    expect(result.changed).toHaveLength(0)
    expect(result.fixed).toHaveLength(0)
  })

  it('returns empty arrays for version with no changelog', () => {
    // 0.2.3 has only ### Changed
    const result = getChangesForVersion('0.2.3')
    expect(result.added).toHaveLength(0)
    expect(result.fixed).toHaveLength(0)
    expect(result.changed.length).toBeGreaterThan(0)
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `string[]` from changelog | Categorized `{ added, changed, fixed }` | Phase 23 | Enables labeled sections in modal |
| Modal fires on fresh install | Null guard skips on first launch | Phase 23 | Correct first-run UX |
| WhatsNewDialog has its own update flow | All updates route through Settings > About | Phase 22→23 | Single code path, no duplicate UI |

## Open Questions

1. **`?raw` import of CHANGELOG.md in test environment**
   - What we know: Vite handles `?raw` imports in dev/build. Vitest uses the same Vite pipeline.
   - What's unclear: Whether `CHANGELOG.md?raw` resolves correctly in the Vitest test runner without additional config.
   - Recommendation: Write the unit test for `getChangesForVersion` and run `npm test` immediately. If it fails with a module resolution error, add `{ assetsInclude: ['**/*.md'] }` to vite.config.ts or mock the import in the test. Given that similar tests exist (`musicUtils.test.ts`) and no special config is present, this is likely fine.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (no separate vitest.config — uses vite.config.ts) |
| Config file | `vite.config.ts` (Vitest uses Vite config) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WHNW-01 | `getChangesForVersion('0.2.5')` returns `{ added, changed, fixed }` each as `string[]` | unit | `npm run test -- changelog` | ❌ Wave 0 |
| WHNW-01 | Returns `{ added:[], changed:[], fixed:[] }` for unknown version | unit | `npm run test -- changelog` | ❌ Wave 0 |
| WHNW-01 | Returns empty arrays for sections absent from that version's block | unit | `npm run test -- changelog` | ❌ Wave 0 |
| WHNW-02 | WhatsNewDialog renders section headings for non-empty arrays only | manual/visual | n/a — Tauri component | manual |
| WHNW-03 | `null` lastSeen does not trigger whatsNew state (pure logic) | unit (logic only) | `npm run test -- changelog` | ❌ Wave 0 |
| WHNW-04 | WhatsNewDialog has no Update button, no updating state | manual/visual | n/a — Tauri component | manual |

### Sampling Rate

- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/changelog.test.ts` — covers WHNW-01 and WHNW-03 logic

*(WHNW-02 and WHNW-04 are UI changes in a Tauri window; no JSDOM/React Testing Library is configured, so visual verification is manual.)*

## Sources

### Primary (HIGH confidence)

- Direct file read: `src/lib/changelog.ts` — current implementation, return type
- Direct file read: `src/components/WhatsNewDialog.tsx` — current props, update button, state
- Direct file read: `src/App.tsx` lines 136–139, 312–324, 1320–1326 — state type, logic, render
- Direct file read: `CHANGELOG.md` — Keep a Changelog format with `### Added/Changed/Fixed` sections
- Direct file read: `src/lib/musicUtils.test.ts` — project test pattern (vitest, describe/it/expect)
- Direct file read: `package.json` — `"test": "vitest run"` script confirmed

### Secondary (MEDIUM confidence)

- Vitest docs: `?raw` imports work in Vitest because it shares the Vite transform pipeline

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing project tools
- Architecture: HIGH — all changes are in files we directly read with known APIs
- Pitfalls: HIGH — all identified pitfalls come directly from reading the existing code

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable codebase, no moving external dependencies)
