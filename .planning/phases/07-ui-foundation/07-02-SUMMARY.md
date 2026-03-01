---
phase: 07-ui-foundation
plan: 02
subsystem: frontend-css
tags: [css, design-tokens, theming, refactor]
dependency_graph:
  requires: [07-01]
  provides: [component-css-tokens]
  affects: [all-css-components]
tech_stack:
  added: []
  patterns: [css-custom-properties, rgba-token-pattern, overlay-token-pattern]
key_files:
  created: []
  modified:
    - src/components/AnalysisProgress.css
    - src/components/ai/AIPlaylistDialog.css
    - src/components/ai/MixPrepPanel.css
    - src/components/ai/RecommendationsPanel.css
    - src/App.css
    - src/components/Notification.css
    - src/components/Player.css
    - src/components/Settings.css
    - src/components/TrackTable.css
    - src/components/FolderTree.css
    - src/components/PromptModal.css
    - src/components/SharePlaylistModal.css
decisions:
  - "Settings.css theme preview swatch hex colors preserved — they display literal color values, not theme-dependent styling"
  - "color: #fff kept on accent-background elements (buttons, selected states) — intentionally white-on-accent"
  - "FolderTree.css color: #ffffff kept on .folder-row.selected and context-menu-item hover — white on accent background"
  - "font-family: inherit kept on context menu button items — different from the removed container override"
  - "--bg-hover token replaced with --bg-tertiary (was undefined, causing silent CSS fallback)"
metrics:
  duration: ~30 minutes
  completed: "2026-03-01"
  tasks: 5
  files: 12
---

# Phase 7 Plan 2: Component CSS Token Migration Summary

Migrated 158+ hardcoded hex color values across 12 component CSS files to use CSS custom property tokens, making the entire app fully theme-aware.

## What Was Built

### Task 1: AnalysisProgress.css — Full Rewrite

Replaced the entire file with a clean token-based version:
- Removed all 25+ hardcoded hex colors
- Eliminated dead `body[data-theme='dark']` and `body[data-theme='light']` selector blocks (these never matched; project uses `:root[data-theme='midnight']`)
- Progress bar uses `var(--accent)` and `var(--accent-hover)` gradient
- Cancel button hover uses `rgba(var(--color-danger-rgb), 0.2)`
- Typography uses `--text-base`, `--text-sm`, `--text-xs` tokens
- Border-radius uses `var(--radius-sm)`

### Task 2: AI Component CSS Files (3 files)

**AIPlaylistDialog.css:**
- Overlay backdrop: `rgba(0,0,0,0.6)` → `var(--overlay-bg)` with `blur(var(--overlay-blur))`
- Header gradient: `rgba(124,58,237,0.3)` → `rgba(var(--accent-rgb), 0.3)`
- All status colors use `--color-danger`, `--color-warning`, `--color-success` tokens with -rgb variants
- Removed all hex fallbacks from `var()` expressions
- Border-radius: 6px/8px/12px → `--radius-md/lg/xl`

**MixPrepPanel.css:**
- Overlay uses `var(--overlay-bg)`
- Header gradient uses `rgba(var(--color-success-rgb), 0.25)` and `rgba(var(--accent-rgb), 0.2)`
- Badge colors (ok/warn/bad) use semantic token variants with -rgb patterns
- Generate button gradient uses `rgba(var(--accent-rgb), *)`

**RecommendationsPanel.css:**
- Header gradient uses `rgba(var(--color-success-rgb), 0.2)`
- Spinner uses `var(--color-success)` and `rgba(var(--color-success-rgb), 0.2)`
- Error state uses `--color-danger` and -rgb variants
- Play/add button hover uses `rgba(var(--color-success-rgb), *)` and `var(--color-success)`

### Task 3: App.css, Notification.css, Player.css

**App.css:**
- `#ef4444` → `var(--color-danger)` on error heading
- `border-radius: 12px` → `var(--radius-xl)` on error panel; `6px` → `var(--radius-md)` on buttons
- Font sizes: `20px/14px/24px/12px` → typography tokens throughout
- btn-settings padding `6px 10px` → `8px 12px` (aligned to 4px grid)
- `color: #ffffff` on scanning banner → `color: white` (intentional, kept per exception)

**Notification.css:**
- `border-radius: 8px` → `var(--radius-lg)`
- `#4ade80` → `var(--color-success)`, `#fbbf24` → `var(--color-warning)`, `#ef4444` → `var(--color-danger)`
- Fixed broken `var(--accent-primary)` → `var(--accent)` (--accent-primary doesn't exist)
- Fixed broken `var(--border-color)` → `var(--border)` (--border-color doesn't exist)

**Player.css:**
- `rgba(239,68,68,0.12)` → `rgba(var(--color-danger-rgb), 0.12)` on error banner
- `#ef4444` → `var(--color-danger)` on error text and close button
- Font sizes use `--text-sm` and `--text-lg`

### Task 4: Settings, TrackTable, FolderTree, and Remaining Files

**Settings.css:**
- `rgba(0,0,0,0.6)` overlay → `var(--overlay-bg)`, `blur(4px)` → `blur(var(--overlay-blur))`
- Panel border-radius `12px` → `var(--radius-xl)`
- Error bar uses `var(--color-danger)` and `rgba(var(--color-danger-rgb), *)`
- btn-icon-danger hover uses danger tokens
- Theme card/notation option `8px` → `var(--radius-lg)`
- Theme preview swatch hex colors preserved (they render literal color values)

**FolderTree.css:**
- Removed `font-family` declaration from `.folder-tree` — inherits Inter from `body` in globals.css
- `#dc2626` on `.context-menu-item-danger:hover` → `var(--color-danger)`
- Removed hex fallbacks from `var(--bg-secondary, #1a1a24)` and `var(--text-primary, #e0e0e8)`
- `color: white` on selected/hover states preserved (white on accent background — exception)

**TrackTable.css:**
- Removed `font-family` declaration from `.track-table-container` — inherits Inter from `body`
- AI rec button: `rgba(74,222,128,*)` → `rgba(var(--color-success-rgb), *)`, `#4ade80` → `var(--color-success)`
- Search focus box-shadow: `rgba(99,102,241,0.15)` → `rgba(var(--accent-rgb), 0.15)`
- Modal overlay uses `var(--overlay-bg)` and `blur(var(--overlay-blur))`
- Removed hex fallbacks from var() expressions

**PromptModal.css, SharePlaylistModal.css:**
- Overlay backdrops: `rgba(0,0,0,0.5)` → `var(--overlay-bg)`
- SharePlaylistModal QR hint: `#666` → `var(--text-muted)`, `0.75rem` → `var(--text-sm)`

**MiniPlayer.css, HeaderNotification.css:** Already fully token-based — no changes needed.

### Task 5: Final Audit

Comprehensive hex audit and verification:
- All remaining hex values confirmed as documented exceptions
- **Auto-fix (Rule 1):** `var(--bg-hover)` found in TrackTable.css at 2 locations — token not defined in globals.css, causing silent CSS failure. Replaced with `var(--bg-tertiary)` (correct hover background token).
- `npm run build`: success (2.85s)
- `npm run lint`: 0 errors (12 pre-existing warnings from TanStack Virtual)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken --bg-hover token reference in TrackTable.css**
- **Found during:** Task 5 final audit
- **Issue:** `var(--bg-hover)` used in `.modal-button-secondary:hover` and `.context-menu-item-active` but `--bg-hover` is not defined in globals.css, so CSS silently fell back to no background
- **Fix:** Replaced with `var(--bg-tertiary)` — the appropriate hover background token
- **Files modified:** `src/components/TrackTable.css`
- **Commit:** 36226e2

**2. [Rule 1 - Bug] Fixed broken --accent-primary and --border-color tokens in Notification.css**
- **Found during:** Task 3 (as specified in plan)
- **Issue:** `var(--accent-primary)` and `var(--border-color)` referenced in Notification.css but neither exists in globals.css
- **Fix:** `--accent-primary` → `var(--accent)`, `--border-color` → `var(--border)`
- **Files modified:** `src/components/Notification.css`
- **Commit:** cbdeeab

## Verification Results

1. AnalysisProgress.css hex count: 0 ✓
2. Dead body[data-theme] selectors: 0 ✓
3. AI files migrated with semantic tokens ✓
4. Notification.css success/warning/error use semantic tokens (6 matches) ✓
5. Player.css error banner uses --color-danger and --color-danger-rgb ✓
6. FolderTree.css font-family removed ✓
7. TrackTable.css font-family removed ✓
8. Settings.css overlay uses --overlay-bg and --overlay-blur ✓
9. All var() references resolve (--bg-hover bug fixed) ✓
10. npm run build: success ✓
11. npm run lint: 0 errors ✓

## Self-Check: PASSED
