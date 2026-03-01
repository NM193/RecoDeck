# Phase 7: UI Foundation - Research

**Researched:** 2026-03-01
**Domain:** CSS design tokens, Tailwind 4 theme system, Inter font loading, component CSS migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Replace midnight theme base with Spotify-style warm blacks (#121212 base), not current cool blue-tinted darks (#0a0a0f)
- Keep indigo (#6366f1) as accent — not Spotify green
- Keep carbon, dawn, neon, custom themes — rebuild default only
- Add semantic tokens: --color-success, --color-danger, --color-warning, --color-info
- Replace all 119 hardcoded hex colors across component CSS files with design tokens
- Switch from system fonts to Inter
- Three font weights: Regular (400) body, Medium (500) buttons/labels, Bold (700) headings
- Balanced music player density — comfortable but efficient, like Spotify
- Moderate rounding: 6-8px border-radius on buttons, inputs, cards
- Subtle borders for elevation — flat, minimal, no drop shadows for cards/panels
- Centered modals with backdrop blur — keep current settings panel approach for all dialogs
- 4px base grid (steps: 4, 8, 12, 16, 20, 24, 32, 48)
- Tighter spacing inside sidebar, roomier main content area
- Comfortable section spacing: 20-24px between major sections
- Standard input height: 36-40px

### Claude's Discretion

- Button variant count and naming (determine from actual usage in codebase)
- Exact type scale values (sizes in px/rem)
- Loading skeleton and empty state visual treatment
- Exact token names and CSS variable naming convention
- How to structure the shared component system (React components, CSS classes, or both)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UIUX-01 | Implement Spotify-style dark theme (color palette, typography, spacing system) | Token migration approach in globals.css, Inter font via @fontsource/inter (npm), Tailwind 4 @theme extension |
| UIUX-09 | Apply consistent component styling (buttons, inputs, cards, modals) across entire app | CSS class audit reveals 5 button variants, 4 input patterns, 3 modal overlays — unify in App.css shared classes |
</phase_requirements>

---

## Summary

Phase 7 is a CSS migration and design token consolidation task. The project already has a working CSS variable system (`--bg-primary`, `--accent`, etc.) in `globals.css` backed by a Tailwind 4 theme config in `tailwind.config.js`. The gap is threefold: (1) the midnight theme's base colors are wrong (cool blue-tinted, not Spotify warm blacks), (2) 158 hardcoded hex values are scattered across 11 component CSS files bypassing the token system, and (3) font-family is set to system fonts instead of Inter in three separate CSS files.

The work divides cleanly into two tasks matching the two plans: first, update globals.css tokens and add Inter (plan 07-01), then sweep all component CSS files and replace hardcoded hex values with their semantic token equivalents (plan 07-02). No new npm packages are required for the token system — the CSS variable infrastructure is already in place. The only addition is `@fontsource/inter` for font loading, which is the standard Vite/offline approach for a desktop Tauri app where Google Fonts CDN calls are undesirable.

**Primary recommendation:** Treat globals.css as the single source of truth. Extend the token set with semantic colors and spacing, update the midnight theme values, then do a mechanical find-and-replace of hardcoded hex colors across component CSS files using the token map defined in 07-01.

---

## Standard Stack

### Core (already installed — no new installs except font)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 4.1.18 | Utility classes + CSS variable bridge | Already in project, v4 supports @theme extension |
| CSS Custom Properties | Browser native | Design token delivery system | Already implemented — no library needed |
| @fontsource/inter | ~5.x | Self-hosted Inter font, offline-safe | npm install avoids CDN dependency in desktop app |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/postcss | 4.1.18 | Tailwind 4 PostCSS integration | Already installed, handles @tailwind directives |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fontsource/inter | Google Fonts CDN link in index.html | CDN requires internet; Tauri desktop app may run offline — @fontsource bundles font files in build |
| @fontsource/inter | Self-hosted font files in /public | More manual, @fontsource provides correct subset variants automatically |
| CSS custom properties | Tailwind 4 @theme inline tokens | @theme tokens are useful but CSS custom properties on :root[data-theme] already power the 5-theme system — switching would require refactoring all theme variants |

**Installation (only new addition):**
```bash
npm install @fontsource/inter
```

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are within existing files:

```
src/
├── styles/
│   └── globals.css         # ONLY token definitions + font @import
├── App.css                 # Shared component classes (btn-*, modal-*, input-*)
└── components/
    ├── [Name].css          # Component-specific styles only — NO hex colors
    └── [Name].tsx
index.html                  # data-theme="midnight" default (unchanged)
tailwind.config.js          # Extend with new token names if used as Tailwind classes
```

### Pattern 1: Token Definition in globals.css

**What:** All design decisions live as CSS custom properties on `:root[data-theme]` blocks. No hardcoded values in component files.

**When to use:** Every color, any semantic intent (error state, success, warning, info).

**Example — updated midnight theme block:**
```css
/* globals.css */
:root[data-theme='midnight'] {
  /* Base backgrounds — Spotify warm blacks, not blue-tinted */
  --bg-primary: #121212;
  --bg-secondary: #181818;
  --bg-tertiary: #282828;
  --bg-elevated: #2a2a2a;      /* floating menus, popovers */
  --surface: #1e1e1e;

  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #b3b3b3;
  --text-muted: #6a6a6a;

  /* Accent — indigo, not Spotify green */
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-rgb: 99, 102, 241;

  /* Semantic status colors */
  --color-success: #1ed760;   /* used by Notification, AI panels */
  --color-danger: #e53e3e;    /* errors, delete actions */
  --color-warning: #f6ad55;   /* warnings */
  --color-info: #63b3ed;      /* informational */

  /* UI chrome */
  --border: #333333;
  --border-subtle: #2a2a2a;

  /* Waveform / analysis — unchanged */
  --waveform-color: #6366f1;
  --waveform-played: #a5b4fc;
  --spectrogram-bg: #121212;

  /* Cue / energy / mood — unchanged functional colors */
  --cue-hot: #ef4444;
  --cue-loop: #22c55e;
  --energy-low: #3b82f6;
  --energy-high: #ef4444;
  --mood-happy: #fbbf24;
  --mood-sad: #6366f1;
  --vocal-yes: #22c55e;
  --vocal-no: #64748b;
}
```

### Pattern 2: Font Loading via @fontsource

**What:** Import Inter font variants at the top of globals.css before Tailwind directives.

**When to use:** Font must be available offline (Tauri desktop). @fontsource bundles WOFF2 files into the Vite build output.

**Example:**
```css
/* globals.css — FIRST lines */
@import '@fontsource/inter/400.css';   /* Regular */
@import '@fontsource/inter/500.css';   /* Medium */
@import '@fontsource/inter/700.css';   /* Bold */

@tailwind base;
@tailwind components;
@tailwind utilities;

/* Then update body font-family: */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  /* ... */
}
```

Note: `@fontsource/inter` also has a variable font package (`@fontsource-variable/inter`) that covers all weights in a single smaller file. Either works; the variable version is preferred for performance if multiple weights are needed.

### Pattern 3: Shared Component CSS Classes (CSS class approach, not React components)

**What:** Keep existing CSS class system (`.btn-primary`, `.modal-overlay`) in App.css. Extend rather than rebuild. The approach is CSS classes (not React wrapper components) because components already use these classes directly.

**When to use:** Any UI primitive used across 2+ components.

**Button variants (from codebase audit — 5 variants found):**
```
.btn-primary     — accent background, white text (used: App.tsx, PromptModal, Settings, SharePlaylistModal)
.btn-secondary   — bg-tertiary background, border (used: App.tsx, PromptModal, Settings)
.btn-icon        — ghost button, no fill, for icon-only actions (used: Settings)
.btn-icon-danger — icon button with danger hover state
.btn-small       — size modifier applied on top of other variants
```

**Input variants (from codebase audit — 3 patterns found):**
```
.search-input-wrapper / .search-input  — search bar (TrackTable)
.settings-text-input                   — general text input (Settings)
.settings-number-input                 — number input (Settings)
.modal-input                           — modal text input (TrackTable modal)
.prompt-modal-input                    — prompt modal input (PromptModal)
```

The input classes are currently scattered. Plan 07-02 should consolidate to 2-3 canonical input patterns using tokens.

**Modal pattern (3 overlays found — same visual approach, different class names):**
```
.settings-overlay / .settings-panel    — Settings component
.modal-overlay / .modal-content        — TrackTable inline modal
.prompt-modal-backdrop / .prompt-modal — PromptModal component
```

All three produce the same visual: centered card on blurred dark backdrop. They can remain as-is (class names differ per component context) as long as they use the same token values for colors, blur amount, border-radius, and shadow.

### Pattern 4: Tailwind 4 @theme vs tailwind.config.js

**What:** Tailwind 4 introduced CSS-first configuration via `@theme` in CSS files. The project currently uses the older `tailwind.config.js` approach with `@tailwind` directives processed by `@tailwindcss/postcss`. Both approaches are supported in v4.

**Recommendation:** Keep `tailwind.config.js` for this phase. The existing config already maps CSS variables to Tailwind color names (e.g., `'accent': 'var(--accent)'`). Add new semantic tokens to both globals.css and tailwind.config.js to keep them in sync. Do not migrate to `@theme` in-CSS approach — that is a separate, optional refactor not in scope.

**When adding new tokens to tailwind.config.js:**
```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        // existing
        'bg-primary': 'var(--bg-primary)',
        'accent': 'var(--accent)',
        // new in phase 7
        'success': 'var(--color-success)',
        'danger': 'var(--color-danger)',
        'warning': 'var(--color-warning)',
        'info': 'var(--color-info)',
        'bg-elevated': 'var(--bg-elevated)',
        'text-muted': 'var(--text-muted)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```

### Anti-Patterns to Avoid

- **Hex in component CSS:** Any `#ef4444` in a `.css` file outside globals.css is the anti-pattern this phase eliminates. Use `var(--color-danger)` instead.
- **rgba() with raw RGB values:** `rgba(239, 68, 68, 0.15)` must become `rgb(var(--color-danger-rgb) / 0.15)` or use `color-mix(in srgb, var(--color-danger) 15%, transparent)`. The project already uses the `--accent-rgb` pattern — extend it to danger/success/warning.
- **Inline font-family declarations in component CSS:** FolderTree.css and TrackTable.css each have their own `font-family: -apple-system, ...` stack. These must be removed — the body rule in globals.css is the only font-family that should exist (components inherit it).
- **Recreating globals.css tokens in component files:** AnalysisProgress.css entirely ignores the token system with 25+ hardcoded hex values — it uses `body[data-theme='dark']` selectors that don't match how themes actually work (`:root[data-theme='midnight']`). This file needs a complete rewrite using the token system.
- **Confusing the 3 modal overlay patterns:** Don't merge the class names — they can stay component-specific. Just ensure they all reference the same tokens.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inter font loading | Custom WOFF2 download + @font-face | `@fontsource/inter` | Correct subsetting, Vite build integration, maintenance-free |
| Token documentation | Storybook or style guide pages | None — tokens live in globals.css, self-documented | Phase scope is tokens + migration, not a style guide |
| Hex-to-token migration | Manual search | grep + edit per file | 158 values across 11 files — systematic file-by-file approach |
| New component layer | Headless UI, Radix, etc. | None — extend existing CSS classes | Components are already working; CSS class extension is lowest risk |

**Key insight:** The token system infrastructure already exists. This phase is a values migration, not a system build. The biggest risk is scope creep into redesigning components — stay focused on tokens and class consolidation.

---

## Common Pitfalls

### Pitfall 1: Missing RGB Companion Tokens for Alpha Variants

**What goes wrong:** After replacing `#ef4444` with `var(--color-danger)`, code like `rgba(239, 68, 68, 0.15)` still has a raw RGB triplet.

**Why it happens:** rgba() requires comma-separated numbers, not hex. The pattern in use for `--accent-rgb: 99, 102, 241` with `rgba(var(--accent-rgb), 0.15)` must be extended to the new semantic colors.

**How to avoid:** For each semantic color that appears in rgba() contexts, also define a companion `--color-{name}-rgb: R, G, B` token. In globals.css, add:
```css
--color-danger: #e53e3e;
--color-danger-rgb: 229, 62, 62;
--color-success: #1ed760;
--color-success-rgb: 30, 215, 96;
```
Then use: `rgba(var(--color-danger-rgb), 0.15)` in component CSS.

### Pitfall 2: AnalysisProgress.css Uses Wrong Theme Selector

**What goes wrong:** AnalysisProgress.css has `body[data-theme='dark']` and `body[data-theme='light']` selectors. These selectors never match — the project sets `data-theme` on `:root` (the `<html>` element in `index.html`), not on `body`.

**Why it happens:** The file was written without checking the actual theme system — it created its own dead-code theme handling.

**How to avoid:** In plan 07-02, rewrite AnalysisProgress.css entirely using CSS variables instead of theme-specific overrides. The token system means theme overrides in component files are never needed.

### Pitfall 3: Hardcoded #ffffff and rgba(0,0,0) Overlooked

**What goes wrong:** Black and white are often treated as "not really hardcoded" and skipped in token sweeps.

**Why it happens:** `rgba(0, 0, 0, 0.6)` (modal backdrop) and `color: #ffffff` (selected item text) are everywhere. The modal backdrop `rgba(0, 0, 0, 0.6)` should become a token (`--overlay-bg: rgba(0, 0, 0, 0.6)`) so it can be tuned in light themes like dawn. White on accent-colored backgrounds (selected folder rows) is intentionally hardcoded — that's acceptable.

**How to avoid:** Add `--overlay-bg` and `--overlay-blur` tokens. Any rgba(0, 0, 0, X) that creates a UI overlay should use a token. `color: white` on an accent-background element is OK to leave as-is.

### Pitfall 4: font-family Declarations in Multiple Component Files

**What goes wrong:** After updating `body { font-family: 'Inter', ... }` in globals.css, the component-level font-family declarations in FolderTree.css and TrackTable.css override it for those components.

**Why it happens:** Component CSS files copied system font stacks directly rather than inheriting from body.

**How to avoid:** In plan 07-02, delete the `font-family` declarations in FolderTree.css (line 11-14) and TrackTable.css (lines 9-12). Components inherit from body. Only explicitly override font-family for monospace contexts (hex color inputs in Settings.css line 523 — keep that one).

### Pitfall 5: Tailwind Color Utilities Not Reflecting New Tokens

**What goes wrong:** After adding `--color-success` to globals.css, using `text-success` in Tailwind utility classes fails because tailwind.config.js wasn't updated.

**Why it happens:** The globals.css CSS variables and tailwind.config.js colors must be kept in sync manually in Tailwind 4 (when using the tailwind.config.js approach rather than @theme in CSS).

**How to avoid:** Any token added to globals.css that might be used as a Tailwind utility class must also be added to tailwind.config.js. Check if any component TSX files use `text-*` or `bg-*` Tailwind utilities — if so, ensure those utilities are mapped.

### Pitfall 6: Other Themes Break When Midnight Tokens Are Renamed/Added

**What goes wrong:** Adding new tokens (`--bg-elevated`, `--text-muted`, `--color-success`, etc.) to midnight means the other 4 themes (carbon, dawn, neon, custom) also need those tokens. If a theme lacks `--color-success`, components using it will get an unset CSS variable.

**Why it happens:** CSS custom properties don't throw errors for undefined values — they silently inherit `inherit` or an empty string, causing invisible rendering bugs.

**How to avoid:** For every new token added to the midnight block, add appropriate values to all 5 theme blocks in globals.css. The custom theme can copy midnight's values as a safe default (it gets overridden by JS anyway).

---

## Code Examples

### Replacing Hardcoded Semantic Colors — Key Mapping

From audit of all component CSS files, the recurring hardcoded colors and their token replacements:

```
#ef4444  → var(--color-danger)          (errors, danger buttons, cue-hot)
#4ade80  → var(--color-success)         (success notifications, AI success)
#22c55e  → var(--color-success)         (alternate green used in some files)
#1ed760  → var(--color-success)         (Spotify green — use for success token value)
#fbbf24  → var(--color-warning)         (warnings)
#f6ad55  → var(--color-warning)         (alternate amber)
#4da6ff  → var(--color-info)            (analysis progress highlights)
#0066cc  → var(--accent)                (AnalysisProgress bar — should use accent)
#0088ff  → var(--accent-hover)          (AnalysisProgress bar hover)
#a78bfa  → var(--accent-hover)          (AI panel accent variant)
#dc2626  → var(--color-danger)          (context menu danger)
#666     → var(--text-muted) or var(--text-secondary)
#1a1a2e  → var(--bg-secondary)          (AI panel fallbacks — remove fallback hex)
rgba(239,68,68,0.15) → rgba(var(--color-danger-rgb), 0.15)
rgba(74,222,128,0.1) → rgba(var(--color-success-rgb), 0.1)
```

### Component-Level font-family Removal

```css
/* FolderTree.css — REMOVE lines 11-14 entirely */
/* Before: */
.folder-tree {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...;
}

/* After: */
.folder-tree {
  /* font-family removed — inherits from body in globals.css */
}
```

### Modal Overlay Token Unification

All three modal overlays should use identical values:
```css
/* The reference pattern (already in Settings.css): */
.settings-overlay {
  background: rgba(0, 0, 0, 0.6);  /* → var(--overlay-bg) */
  backdrop-filter: blur(4px);       /* → var(--overlay-blur) */
}

/* New tokens in globals.css: */
:root[data-theme='midnight'] {
  --overlay-bg: rgba(0, 0, 0, 0.6);
  --overlay-blur: 4px;
}
```

### Inter Font Size Scale (Claude's Discretion — Spotify-inspired)

```css
/* globals.css — typography scale */
:root {
  /* Type scale — Spotify-style hierarchy */
  --text-xs:   11px;   /* metadata, badges, timestamps */
  --text-sm:   12px;   /* secondary labels, table cells small */
  --text-base: 13px;   /* default body, table cells */
  --text-md:   14px;   /* prominent body, modal text */
  --text-lg:   16px;   /* section descriptions */
  --text-xl:   20px;   /* settings tab titles, panel headers */
  --text-2xl:  24px;   /* empty state headings */
  --text-3xl:  32px;   /* page titles (future views) */
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Fonts link tag | @fontsource npm | Since Vite became standard | Works offline, tree-shakeable, no FOUT risk |
| @tailwind directives | @import "tailwindcss" in CSS | Tailwind 4 (2024) | Project uses legacy directive form — still supported via @tailwindcss/postcss |
| tailwind.config.js | @theme block in CSS | Tailwind 4 (2024) | CSS-first is preferred but config.js still works |
| Hex colors in CSS | CSS custom properties | Ongoing industry shift | Enables runtime theming without JS |

**Tailwind 4 critical note:** The project uses `@tailwind base/components/utilities` directives (v3 style) plus a separate `tailwind.config.js`. In Tailwind v4, the modern approach is `@import "tailwindcss"` in CSS with `@theme { }` blocks. Both work. The `@tailwindcss/postcss` plugin (v4.1.18) handles the legacy directive form. Do NOT migrate to the new CSS-first approach in this phase — it would be a separate refactor with no user-facing benefit.

**Deprecated/outdated:**
- `body[data-theme='dark']` selectors in AnalysisProgress.css: These never matched and are dead code. The project uses `:root[data-theme='midnight']` not `body[data-theme='dark']`.

---

## Open Questions

1. **Should --color-success use #1ed760 (Spotify green) or #22c55e (Tailwind green-500)?**
   - What we know: Spotify uses #1ed760 for success; the project already uses #22c55e and #4ade80 in Notification.css and elsewhere
   - What's unclear: Whether there's a desire for the success green to feel "Spotify" or just functional
   - Recommendation: Use #1ed760 for success token value — it's distinctly different from the indigo accent and feels appropriate for a music app. The existing hardcoded #22c55e and #4ade80 instances can both map to it.

2. **Does AnalysisProgress.css need a full visual redesign or just token migration?**
   - What we know: The file is completely detached from the token system (25+ hardcoded hex values, wrong theme selectors, blue progress bar that ignores --accent)
   - What's unclear: Whether the user wants the analysis progress bar to match the accent color or stay blue
   - Recommendation: Migrate to tokens + use `var(--accent)` for the progress bar. This makes the analysis progress component theme-aware for the first time.

3. **Button size: should btn-small padding be standardized to the 4px grid?**
   - What we know: btn-small currently uses `padding: 5px 10px` (5px is off-grid)
   - What's unclear: Whether visual difference matters enough to fix
   - Recommendation: Change to `padding: 4px 12px` during token migration to align with 4px grid. Minor visual change, correct behavior.

---

## Codebase Audit Summary

Files containing hardcoded hex values (from actual count — 158 total, not 119 as estimated):

| File | Hex Count | Priority | Notes |
|------|-----------|----------|-------|
| AnalysisProgress.css | ~25 | HIGH | Entire file ignores token system, dead theme selectors |
| ai/AIPlaylistDialog.css | ~20 | HIGH | Mix of var() with fallback hex + bare hex |
| ai/MixPrepPanel.css | ~18 | HIGH | Same pattern as AIPlaylistDialog |
| ai/RecommendationsPanel.css | ~12 | HIGH | Same pattern |
| Settings.css | ~22 | MEDIUM | Mostly semantic (danger red), some in theme previews |
| TrackTable.css | ~8 | MEDIUM | Includes rgba() with hardcoded RGB |
| App.css | ~5 | LOW | Mostly functional (error red) |
| Notification.css | ~6 | LOW | Clean mapping to success/warning/error tokens |
| FolderTree.css | ~4 | LOW | Mostly rgba() and white-on-accent |
| Player.css | ~5 | LOW | Mostly rgba(0,0,0) for shadows — can be tokens |
| MiniPlayer.css | 0 | - | Already clean |
| PromptModal.css | 0 | - | Already clean |

**Font-family declarations to remove** (3 locations):
- `src/styles/globals.css` line 127-130: Update to Inter (keep the declaration, change the value)
- `src/components/FolderTree.css` line 11-14: Delete entirely
- `src/components/TrackTable.css` lines 9-12: Delete entirely

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — globals.css, tailwind.config.js, all 11 component CSS files
- `node_modules/tailwindcss/theme.css` — Tailwind 4.1.18 actual @theme structure
- `node_modules/@tailwindcss/postcss` version 4.1.18 — confirms @tailwind directives supported
- `package.json` — confirmed Tailwind 4.1.18, no @fontsource installed yet

### Secondary (MEDIUM confidence)

- Tailwind 4 CSS-first migration behavior: @tailwind directives are backward-compatible via @tailwindcss/postcss plugin — verified by examining installed package
- @fontsource/inter npm package — standard approach for Vite apps needing offline fonts; version ~5.x expected based on active maintenance cycle

### Tertiary (LOW confidence)

- Exact @fontsource/inter API for subset selection — assumed similar to v4.x; verify `@import '@fontsource/inter/400.css'` pattern vs `@import '@fontsource/inter'` default

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all based on inspected installed packages
- Architecture: HIGH — codebase audit confirms all patterns; CSS variable system fully understood
- Pitfalls: HIGH — identified from actual dead code in AnalysisProgress.css (wrong selectors), actual font-family overrides found in 2 component files, actual rgba with hardcoded RGB values found

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain — CSS custom properties, font loading patterns are stable)
