# Pitfalls Research

**Domain:** Adding layout fix + duplicate management + full library load to existing Tauri v2 + React 19 music player
**Project:** RecoDeck v1.3 Library UX & Duplicate Management
**Researched:** 2026-03-06
**Confidence:** HIGH — derived from direct codebase inspection by STACK, FEATURES, and ARCHITECTURE researchers

---

## Critical Pitfalls

### Pitfall 1: CSS Fix Breaks TanStack Virtual Row Sizing

**What goes wrong:** Adding `min-width: 100%` to `.track-table-holder` or `.track-table-row` can break TanStack Virtual's height calculations if the virtual container's width changes mid-render. Rows may overflow or collapse depending on where the fix is applied.

**Why it happens:** TanStack Virtual measures the scroll container. If `min-width` is applied to the wrong element (the row instead of the holder), it creates a mismatch between the measured width and the rendered width.

**How to avoid:** Apply `min-width: 100%` on `.track-table-holder` (the wrapper div), NOT on `.track-table-row`. The header `<div>` also needs the same treatment. Confirm the fix in a resized window before committing.

**Warning signs:** Rows appear wider than the scroll area, or horizontal scrollbar appears/disappears erratically.

**Phase to address:** CSS Layout Fix phase (first phase).

---

### Pitfall 2: Duplicate Detection Deletes Wrong Track (No Cascade Check)

**What goes wrong:** A new `delete_tracks_batch` Rust command might call `DELETE FROM tracks WHERE id = ?` without checking whether `db.delete_track()` already handles cascade deletes to `track_analysis` and `playlist_tracks`. If it doesn't, orphaned rows accumulate in the DB.

**Why it happens:** The existing `remove_duplicate_tracks()` uses a single SQL statement that handles everything. A new batch delete written from scratch can miss the cascade.

**How to avoid:** Read `db.delete_track()` in `db/mod.rs` before writing `delete_tracks_batch`. Either reuse the existing method in a loop, or replicate its cascade logic explicitly. Do not write a raw `DELETE FROM tracks` without cascade.

**Warning signs:** Track count in sidebar doesn't match after deletion; SQLite `PRAGMA integrity_check` returns orphaned FK rows.

**Phase to address:** Duplicate Management phase (backend implementation step).

---

### Pitfall 3: Loading 7K+ Tracks Causes React Re-render Storm

**What goes wrong:** Calling `getAllTracks()` returns ~7,339 tracks as a single JSON array. If this array is stored in React state and any parent component has broad re-render triggers (e.g., `useContext(SettingsContext)`), every track row re-renders on every settings change.

**Why it happens:** Large arrays in React state are compared by reference. If `setTracks([...newTracks])` creates a new array reference, all consumers re-render. This is already partially mitigated by TanStack Virtual (only visible rows render to DOM), but the reconciliation pass for 7K items still costs time.

**How to avoid:** Use `useCallback`/`useMemo` to stabilize the tracks array. Ensure `getAllTracks()` is only called once on startup (not on every navigation). Keep `tracks` state at the App level in Zustand or local state, not in a Context that causes wide re-renders.

**Warning signs:** App feels sluggish after load; React DevTools profiler shows hundreds of re-renders in a single frame.

**Phase to address:** Full Library Load phase.

---

### Pitfall 4: Duplicate Dialog Leaves UI Stale After Deletion

**What goes wrong:** After deleting selected duplicates via the dialog, the main track table still shows the deleted tracks until the library is reloaded. User sees ghost tracks.

**Why it happens:** The dialog manages its own deletion flow but doesn't trigger a full library reload in `App.tsx`. The `tracks` state in App is independent of the dialog.

**How to avoid:** After successful batch deletion, call `loadTracks()` (or its equivalent) from App.tsx to refresh the library. The dialog should accept an `onComplete` callback that triggers this. Since Full Library Load (Feature 3) removes pagination, the reload is a simple `getAllTracks()` call.

**Warning signs:** Sidebar track count updates but table still shows deleted tracks.

**Phase to address:** Duplicate Management phase (dialog completion handler).

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `getAllTracks()` called on every navigation | App freezes briefly when switching views | Call once on startup, store in Zustand/App state | Always — even at 100 tracks |
| Duplicate detection SQL with no index | Settings dialog hangs 5-10s before showing duplicates | `file_hash` and `filename` columns should be indexed in SQLite | >1,000 tracks |
| Sequential delete loop (one IPC per track) | Dialog "deleting..." spinner hangs for seconds | Use batch delete command or delete in transaction | >50 duplicates |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during `getAllTracks()` | App appears frozen for 1-3s on startup | Show skeleton/spinner in TrackTable while loading |
| Duplicate dialog with no "keep which copy" guidance | User confused about which track to keep | Show file path, date added, and file size to help decide |
| Deleting all duplicates at once (no undo) | User loses tracks they wanted to keep | Require explicit checkbox selection; no "delete all" button |
| "Scroll for more" footer removed but count still shows "1000 tracks" | User confused why count is wrong | Update status bar to show full library count after load |

---

## "Looks Done But Isn't" Checklist

- [ ] **Layout fix:** Test at narrow window width (800px), normal (1280px), and wide (1920px+) — header and rows must extend to full width at all sizes
- [ ] **Full library load:** Sidebar track count, status bar count, and search results must all reflect the full library (not first-page 1000)
- [ ] **Duplicate dialog:** After deletion, the dialog closes AND the main library reloads — not just the dialog closing with stale state
- [ ] **Duplicate detection:** Verify detection logic covers both exact filename matches and same hash different filename cases

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CSS fix breaks TanStack row sizing | CSS Layout Fix phase | Resize window — no horizontal scroll, no row collapse |
| Duplicate delete missing cascade | Duplicate Management — backend | `PRAGMA integrity_check` clean after deletion; playlist_tracks has no orphaned rows |
| 7K track re-render storm | Full Library Load phase | Profile in React DevTools — no re-render storm on settings change |
| Stale UI after duplicate deletion | Duplicate Management — dialog | Delete tracks, close dialog — library count and table update correctly |

---
*Pitfalls research for: RecoDeck v1.3 Library UX & Duplicate Management*
*Researched: 2026-03-06*
