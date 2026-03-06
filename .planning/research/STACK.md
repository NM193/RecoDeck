# Stack Research

**Project:** RecoDeck v1.3 Library UX & Duplicate Management
**Researched:** 2026-03-06
**Scope:** NEW additions only for three target features. Existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, Framer Motion 11, TanStack Virtual 3, Vitest, ESLint 9) is validated and NOT re-researched.
**Confidence:** HIGH for all three research questions.

---

## Executive Summary

v1.3 adds three features: a track table responsive layout fix, a duplicate tracks review dialog with selective delete, and full library load on startup. Research focused on whether any of these require new dependencies.

**Finding 1 — Track table layout fix: Pure CSS. No new libraries.** The root cause is `min-width: fit-content` on `.track-table-row` combined with the scroll area's `overflow: auto`. When the window is wider than the minimum content width, rows don't stretch to fill it because the absolute-positioned virtualizer children inherit width from the flex container, which itself is constrained by `fit-content`. The fix is applying `min-width: 100%` to `.track-table-holder` (the wrapper inside the scroll area) so the flex layout always fills available space. The header and body share this container, so both extend uniformly. This is a CSS-only change — no React, no new library.

**Finding 2 — Duplicate tracks review dialog: New Rust command needed. No new frontend libraries.** The existing `cleanup_duplicate_tracks` command silently deletes all duplicates. The new feature requires a `get_duplicate_groups` query that returns duplicate groups (with metadata) so the user can review before deletion. The frontend already has every UI primitive needed: the `modal-overlay`/`modal-content` pattern (defined in TrackTable.css and used by the custom genre modal), Framer Motion for animated overlays (used in AIPlaylistDialog.tsx), checkbox state management via `useState<Set<number>>`, and the `deleteTrack` IPC wrapper (`tauriApi.deleteTrack`). The new dialog is a new React component using existing CSS classes — no new frontend dependency.

**Finding 3 — Full library load on startup: No new dependencies.** `tauriApi.getAllTracks()` already exists at `src/lib/tauri-api.ts` line 29 and maps to the `get_all_tracks` Rust command at `src-tauri/src/commands/library.rs` line ~210. App.tsx currently calls `countTracks()` at startup and defers loading to `loadTracks()`. The v1.3 change is calling `getAllTracks()` inside `initializeApp()`, hydrating the `tracks` state immediately, and removing the `hasMoreTracks`/`loadMoreTracks`/`onLoadMore` pagination path. This was researched in v1.2 (see STACK.md) and confirmed feasible. No new library, no new Rust command.

---

## Recommended Stack

### No New Frontend Dependencies Required for v1.3

All three features are either CSS corrections, wiring changes, or new Rust queries. The frontend stack is complete.

### Core Technologies (Existing — Confirmed Sufficient)

| Technology | Version | Purpose in v1.3 | Why Sufficient |
|------------|---------|-----------------|----------------|
| CSS Flexbox / `min-width` | Browser API | Track table full-width layout fix | Row stretching is a CSS layout property. Setting `min-width: 100%` on the inner holder forces rows and header to span the scroll container width regardless of window size. |
| `modal-overlay` / `modal-content` CSS classes | Defined in `src/components/TrackTable.css` lines 323-443 | Duplicate review dialog container | Already styled with backdrop blur, slide-in animation, and standard button variants (primary, secondary). The custom genre modal uses this pattern — duplicate review can use the same classes. |
| Framer Motion `motion.div` + `AnimatePresence` | `^11.0.0` (installed) | Optional smooth open/close for duplicate dialog | AIPlaylistDialog already uses this pattern. Use or skip — the CSS `fadeIn`/`slideIn` keyframes in `modal-overlay` are sufficient without Framer Motion if consistency with the genre modal is preferred. |
| `useState<Set<number>>` | React 19 (installed) | Track selection state in duplicate dialog | The AIPlaylistDialog uses `useState<Set<number>>` for `removedTrackIds`. Same pattern applies to the duplicate selection set. |
| `tauriApi.deleteTrack(id)` | Exists in `src/lib/tauri-api.ts` line 47 | Delete individual duplicate tracks | One call per selected track. No batch delete command needed — the dialog deletes tracks one by one from the selected set on confirm. |
| `tauriApi.getAllTracks()` | Exists in `src/lib/tauri-api.ts` line 29 | Full library load at startup | Returns `TrackDTO[]` with BPM/key populated from `LEFT JOIN`. Called once in `initializeApp()` to replace the paginated load. |

### New Rust Command Required

| Command | Location | Purpose | Implementation |
|---------|----------|---------|---------------|
| `get_duplicate_groups` | `src-tauri/src/commands/library.rs` | Return duplicate groups for review | SQL query grouping by `file_hash` (where hash != 'unknown') and by `(LOWER(filename), file_size)`. Returns `Vec<DuplicateGroup>` where each group has a `keep` track (lowest ID) and a `duplicates` vec. Frontend renders the groups and lets user uncheck tracks they want to preserve. |

The duplicate detection logic already exists in `db.remove_duplicate_tracks()` (lines 835-895 of `src-tauri/src/db/mod.rs`). The new command extracts the detection logic into a read-only query that returns groups instead of deleting immediately.

---

## What NOT to Add

| Avoid | Why | What to Do Instead |
|-------|-----|-------------------|
| Headless UI / Radix UI / shadcn | Modal/dialog component libraries. Unnecessary: the project already has a working modal pattern in `TrackTable.css` with backdrop, animation, and button variants. Installing a headless library would require styling work to match the existing theme system and adds ~50-150KB to the bundle. | Use `.modal-overlay` + `.modal-content` CSS classes already defined. The duplicate dialog is a standard confirm-before-delete pattern — no accessibility-first dialog primitive needed for this audience. |
| `react-window` or `@tanstack/react-table` | Alternative virtualization or table primitives. The layout bug is CSS, not a missing library. `@tanstack/react-virtual` (already installed at `^3.13.18`) handles virtualization. Adding a full table library would require migrating the entire `TrackTable.tsx` component. | Fix the CSS `min-width` property on `.track-table-holder`. One line. |
| `immer` for Set mutations | Immutable state helper. The project uses plain `useState` with spread/`new Set()` patterns (see `removedTrackIds` in AIPlaylistDialog). | Continue using `new Set(prev)` pattern for checkbox state in the duplicate dialog, consistent with existing code. |
| Tauri Channel IPC for library load | Channel API is for high-frequency streaming. Single `Vec<TrackDTO>` load is well-served by standard `invoke`. Previous v1.2 research confirmed JSON IPC handles 1K-5K tracks in <50ms on macOS. | Use `invoke('get_all_tracks')` via existing `tauriApi.getAllTracks()`. |
| `rusqlite` batch transaction for group delete | The duplicate dialog deletes selected tracks one by one via `deleteTrack`. At typical duplicate counts (2-20 duplicates per library), sequential `invoke` calls are fast enough. | Call `tauriApi.deleteTrack(id)` for each checked track in the dialog's confirm handler. Reload library after all deletes complete. |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| CSS `min-width: 100%` on `.track-table-holder` | Grid layout rewrite for the table | The table uses `display: flex` rows with fixed/flex column widths. Grid would require restructuring every column definition. The bug is specifically about the scroll container width — `min-width` on the inner wrapper solves it without restructuring. |
| New `get_duplicate_groups` Rust command | Reuse existing `cleanup_duplicate_tracks` with dry-run flag | The existing command is not structured to return groups — it collects IDs and deletes. Adding a dry-run flag would require refactoring the internal logic and the return type. A separate read-only command that mirrors the detection logic is cleaner and easier to test. |
| Sequential `deleteTrack` per confirmed duplicate | New `delete_tracks_batch` Rust command | At 2-20 tracks, N sequential IPC calls complete in under 100ms. A batch command adds Rust complexity (variadic ID list, partial failure handling) with no user-perceptible benefit. |
| Call `getAllTracks()` in `initializeApp()` | Load tracks lazily when user opens "All Tracks" view | The feature request is to load on startup — specifically to avoid the "Scroll for more" experience. Lazy loading preserves the problem. The v1.2 analysis confirmed startup load is feasible at DJ library sizes. |

---

## Integration Points

### 1. Track table layout fix

**File:** `src/components/TrackTable.css`

The `.track-table-holder` div wraps both `.track-table-header` and `.track-table-body`. Currently, `track-table-row` has `min-width: fit-content` which makes rows shrink to content width. The scroll area is `overflow: auto` with no explicit width on the inner content.

Fix: add `min-width: 100%` to `.track-table-holder`. This ensures the inner flex container is always at least as wide as the scroll area, making rows and header fill the full window width before horizontal scrolling activates.

No React change. No TypeScript change. One CSS property.

### 2. Duplicate review dialog

**New files:**
- `src/components/DuplicateReviewDialog.tsx` — dialog component
- `src-tauri/src/commands/library.rs` — add `get_duplicate_groups` command (new `#[tauri::command]` fn + new `DuplicateGroup` and `DuplicateGroupEntry` structs)
- `src/lib/tauri-api.ts` — add `getDuplicateGroups()` wrapper

**Existing files modified:**
- `src-tauri/src/db/mod.rs` — add `get_duplicate_groups()` DB method (extraction of detection logic from `remove_duplicate_tracks`)
- `src-tauri/src/lib.rs` — register `get_duplicate_groups` in the Tauri builder
- App.tsx or DatabaseSection settings — add "Find Duplicates" button that opens the dialog

**DuplicateGroup shape (Rust → frontend):**

```rust
#[derive(Debug, Serialize)]
pub struct DuplicateGroupEntry {
    pub id: i64,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub duration_ms: Option<i32>,
    pub file_size: Option<i64>,
    pub date_added: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DuplicateGroup {
    pub keep: DuplicateGroupEntry,       // lowest ID in group (suggested keep)
    pub duplicates: Vec<DuplicateGroupEntry>, // higher IDs (suggested delete)
    pub match_reason: String,            // "file_hash" or "filename+size"
}
```

**Dialog behavior:**
- Lists each duplicate group: shows "keep" track with a lock icon, shows duplicates with checkboxes (checked = will delete)
- User can uncheck a duplicate to preserve it
- "Delete Selected" button calls `tauriApi.deleteTrack(id)` for each checked track
- After deletion, triggers `loadTracks()` and shows notification count

**Reuse existing patterns:**
- Use `.modal-overlay` and `.modal-content` CSS from `TrackTable.css`
- Use `useState<Set<number>>` for selected-to-delete IDs (same as `removedTrackIds` in AIPlaylistDialog.tsx)
- Use existing `Icon` component for action icons

### 3. Full library load on startup

**File:** `src/App.tsx`

Current behavior in `initializeApp()` (line ~309-317): calls `countTracks()`, sets `totalTrackCount`, sets `tracks` to `[]`.

v1.3 behavior: call `getAllTracks()` instead of `countTracks()`, set `tracks` to the result directly, set `hasMoreTracks` to `false`.

Current behavior in `loadTracks()` (line ~360-368): for "All Tracks" view (no folder/playlist), calls `getTracksPaginated(1000, 0)` and sets `hasMoreTracks`.

v1.3 behavior: simplify `loadTracks()` — remove the paginated branch, always call `getAllTracks()` for the "All Tracks" case (or rely on the startup-loaded tracks already being in state and skip the call).

Remove:
- `hasMoreTracks` state and its setter
- `isLoadingMore` state and its setter
- `loadMoreTracks` callback
- `onLoadMore` prop passed to `TrackTable`
- The scroll listener in `TrackTable.tsx` that calls `onLoadMore`
- "Scroll for more" text in the footer

The `TrackTable` props `onLoadMore`, `hasMoreTracks`, `isLoadingMore` can be removed from the interface and the component once the paginated path is gone.

---

## Version Compatibility

| API / Feature | Runtime | Notes |
|---------------|---------|-------|
| `get_all_tracks` Rust command | Tauri 2.x (project uses `"2"`) | Already registered in `lib.rs`. Returns `Vec<TrackDTO>` with LEFT JOIN on track_analysis. No version concern. |
| CSS `min-width: 100%` | All browsers / WKWebView | Standard CSS. No compatibility risk. |
| `useState<Set<number>>` | React 19 (installed) | Standard React hook. No version concern. |
| `#[tauri::command]` for `get_duplicate_groups` | Tauri 2.x | Same pattern as all other commands in `library.rs`. No version concern. |

---

## Sources

- Direct code inspection: `src/components/TrackTable.tsx` (layout structure, virtualizer, props) — HIGH confidence
- Direct code inspection: `src/components/TrackTable.css` (`.track-table-row min-width: fit-content`, `.modal-overlay`, `.modal-content`) — HIGH confidence
- Direct code inspection: `src/components/ai/AIPlaylistDialog.tsx` (`useState<Set<number>>` for `removedTrackIds`, Framer Motion overlay pattern) — HIGH confidence
- Direct code inspection: `src-tauri/src/db/mod.rs` lines 835-920 (`remove_duplicate_tracks` detection logic, SQL queries for hash and filename+size) — HIGH confidence
- Direct code inspection: `src-tauri/src/commands/library.rs` lines 592-602 (`cleanup_duplicate_tracks` command, `db.remove_duplicate_tracks()` call) — HIGH confidence
- Direct code inspection: `src/lib/tauri-api.ts` line 29 (`getAllTracks`), line 47 (`deleteTrack`) — HIGH confidence
- Direct code inspection: `src/App.tsx` lines 309-427 (startup load, pagination logic, `loadMoreTracks`) — HIGH confidence
- v1.2 STACK.md: confirmed `getAllTracks()` is feasible for DJ library sizes at startup — HIGH confidence (already validated)

---

*Stack research for: RecoDeck v1.3 Library UX & Duplicate Management*
*Researched: 2026-03-06*
