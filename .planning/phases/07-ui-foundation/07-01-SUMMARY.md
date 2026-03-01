---
phase: 07-ui-foundation
plan: "01"
subsystem: frontend-design-system
tags: [css, tailwind, design-tokens, typography, inter-font, theming]
dependency_graph:
  requires: []
  provides: [design-token-system, inter-font, typography-scale, spacing-tokens]
  affects: [all-components, tailwind-utilities, theme-system]
tech_stack:
  added:
    - "@fontsource-variable/inter v5.2.8 — variable font package for Inter typeface"
  patterns:
    - "CSS custom properties as single source of truth for all theme values"
    - "Tailwind extends CSS variables for utility class generation"
    - "5-theme system (midnight/carbon/dawn/custom/neon) with consistent token sets"
key_files:
  created: []
  modified:
    - src/styles/globals.css
    - tailwind.config.js
    - src/main.tsx
    - package.json
    - tsconfig.json
decisions:
  - "Midnight theme migrated from blue-tinted (#0a0a0f) to Spotify warm blacks (#121212) while keeping indigo (#6366f1) as accent instead of Spotify green"
  - "Custom theme intentionally omits functional tokens (cue/energy/mood/vocal) — applyCustomTheme() JS override provides them at runtime"
  - "Test files excluded from tsconfig.json production compilation to prevent Vitest globals (beforeEach/afterEach) causing TS errors"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-03-01"
  tasks_completed: 3
  files_modified: 5
---

# Phase 7 Plan 1: Design Token Foundation Summary

Spotify-style warm-black midnight theme, Inter variable font, complete CSS token system with semantic colors and typography/spacing scales across all 5 themes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @fontsource-variable/inter and import in main.tsx | 9bd86c7 | package.json, package-lock.json, src/main.tsx |
| 2 | Update globals.css with new midnight theme tokens, typography scale, and all theme blocks | 0c4467f | src/styles/globals.css |
| 3 | Update tailwind.config.js to map new tokens | 6db7ac8 | tailwind.config.js |

## What Was Built

### Design Token System
A complete CSS custom property foundation established for all 5 themes (midnight, carbon, dawn, custom, neon):

**New tokens added to every theme:**
- `--bg-elevated` — elevated surface background (cards, dropdowns)
- `--text-muted` — tertiary text for placeholders and disabled states
- `--color-success/danger/warning/info` — semantic status colors
- `--color-success-rgb/danger-rgb/warning-rgb` — RGB companions for rgba() usage
- `--border-subtle` — lighter border for inner dividers
- `--overlay-bg/blur` — modal/popover overlay values

**Typography scale (theme-independent, on :root):**
- 8 sizes from `--text-xs` (11px) to `--text-3xl` (32px)
- Replaces hardcoded font sizes in components

**Spacing tokens (4px base grid, on :root):**
- `--space-1` through `--space-12` (4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px)

**Component sizing:**
- `--input-height/lg`, `--radius-sm/md/lg/xl`

### Midnight Theme Update
Replaced cool blue-tinted colors with Spotify-style warm neutrals:
- Base: `#0a0a0f` → `#121212`
- Secondary: `#12121a` → `#181818`
- Tertiary: `#1a1a28` → `#282828`
- Text primary: `#e0e0e8` → `#ffffff`
- Text secondary: `#8888a0` → `#b3b3b3`
- Accent remains `#6366f1` (indigo, not Spotify green)

### Inter Variable Font
- Installed `@fontsource-variable/inter` (single WOFF2 file covering all weights)
- Imported in `src/main.tsx` before `globals.css`
- Applied in `body { font-family: 'Inter Variable', 'Inter', ... }` with `font-size: var(--text-base)`

### Tailwind Config Extensions
Added Tailwind utility class mappings for all new tokens:
- Colors: `bg-elevated`, `text-muted`, `border-subtle`, `success`, `danger`, `warning`, `info`
- Font family: `font-sans` now uses Inter Variable
- Font sizes: `text-xs` through `text-3xl` map to CSS variables
- Spacing: `sp-1` through `sp-12` with `sp-` prefix to avoid conflicts
- Border radius: `rounded-sm/md/lg/xl` map to design tokens

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test files breaking production TypeScript build**
- **Found during:** Overall verification (npm run build)
- **Issue:** `src/test/setup.ts` uses Vitest globals (`beforeEach`, `afterEach`) but tsconfig.json includes all `src/` files, causing TS errors during production build
- **Fix:** Added `exclude` patterns to `tsconfig.json` for `*.test.ts`, `*.test.tsx`, and `src/test/` directory
- **Files modified:** `tsconfig.json`
- **Commit:** `4d2b9b9`

## Success Criteria Verification

- [x] Midnight theme base color is #121212 (warm black)
- [x] Indigo #6366f1 remains accent across all dark themes
- [x] Inter font loads via @fontsource-variable/inter, applied in globals.css body
- [x] All 5 theme blocks contain every new token (--bg-elevated, --text-muted, semantic colors, RGB companions, --overlay-*)
- [x] Typography scale defined on :root (8 sizes, --text-xs through --text-3xl)
- [x] Spacing tokens on :root (4px base grid)
- [x] tailwind.config.js maps all new tokens to Tailwind utility classes
- [x] npm run build succeeds (TypeScript + Vite): 3.57s build, Inter WOFF2 files in dist

## Self-Check: PASSED

Files exist:
- FOUND: /Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/styles/globals.css
- FOUND: /Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/tailwind.config.js
- FOUND: /Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/main.tsx

Commits exist:
- FOUND: 9bd86c7 (Task 1 — font install)
- FOUND: 0c4467f (Task 2 — globals.css)
- FOUND: 6db7ac8 (Task 3 — tailwind config)
- FOUND: 4d2b9b9 (Auto-fix — tsconfig)
