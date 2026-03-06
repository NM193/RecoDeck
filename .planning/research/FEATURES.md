# Feature Research

**Domain:** Desktop music library manager — DJ-focused, Tauri v2 + React 19
**Researched:** 2026-03-06
**Confidence:** HIGH (grounded in existing codebase + standard UX conventions for music library apps)

---

## Feature Landscape

### Feature 1: Track Table Responsive Layout Fix

**Category:** Bug fix / polish — layout correctness when window is resized

#### What Is Broken

The current `TrackTable.css` uses `min-width: fit-content` on `.track-table-row`, which means rows shrink-wrap to their column widths. When the window is wider than the sum of column widths, neither the row background nor the column separator lines extend to the right edge. The header (`.track-table-header`, background `var(--bg-secondary)`) similarly does not stretch. The result is a visible content area that ends mid-screen with a raw background gap to the right.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Row backgrounds extend full width | Standard table UX — truncated rows look unfinished | LOW | CSS-only fix; rows need `min-width: max(fit-content, 100%)` or equivalent |
| Header background extends full width | Header must visually match the scroll area at all window sizes | LOW | Same root cause as rows |
| Column separators reach the right edge | Without this, the rightmost cell appears clipped against a raw background | LOW | Handled automatically once row width is fixed |
| No horizontal scroll at normal widths | Horizontal scroll should only appear when window is narrower than the minimum column sum | LOW | Ensure overflow-x is correctly gated on the scroll container |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-stretch columns proportionally | Seems polished | Columns have defined widths (title flex, others fixed px); stretching distorts readability | Stretch only the title/flex column or add a blank spacer cell at the end |
| Full rewrite to `<table>` element | True semantic tables extend naturally | Would require restructuring TanStack Virtual integration and all cell/column sizing | Keep virtualized flex layout, fix width calculation only |

#### Complexity

LOW. One or two CSS rule changes. The `min-width: fit-content` on `.track-table-row` is the primary culprit. Changing it to `min-width: max(fit-content, 100%)` resolves the issue without touching the virtualization layer, column definitions, or any Rust code.

---

### Feature 2: Duplicate Tracks Review Dialog

**Category:** Data management — replaces one-click destructive delete with a review-first modal

#### What Currently Exists

`DatabaseSection.tsx` has a single "Remove Duplicate Tracks" button. It calls `tauriApi.cleanupDuplicateTracks()` which invokes `db.remove_duplicate_tracks()` in Rust. The Rust function runs detection (hash match first, then filename+size match), silently picks the lowest-ID track to keep per group, deletes the rest, and returns a count. The user sees "Removed N duplicate tracks" with no ability to review which tracks were deleted or choose which copy to keep.

#### What Users Expect in a Music Library App

Reference behavior from Rekordbox, iTunes/Music.app, Swinsian, and MusicBrainz Picard:

1. Show all duplicate groups before any deletion — each group lists the tracks considered duplicates, with metadata to distinguish them (title, artist, file path, duration, file size, date added, BPM if available).
2. Auto-select the recommended deletion target — default selection marks the "worse" copy (higher ID = later import) for deletion, but does not act until user confirms.
3. Allow per-track override — user can uncheck a track from the deletion list or switch which copy to keep.
4. Bulk confirm or cancel — "Delete Selected" acts on all checked tracks; Cancel closes with no changes.
5. Show count summary — "X duplicate groups found, Y tracks will be deleted" in the dialog header.
6. Post-deletion notification — "Deleted N tracks" toast, then library reloads.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List all duplicate groups before deletion | Music libraries contain irreplaceable files; silent deletion is unacceptable | MEDIUM | Requires a new `get_duplicate_groups` backend command that returns groups without deleting |
| Show file path for each duplicate | Users often have the same song in different folders — path identifies which copy is where | LOW | `file_path` already in TrackDTO |
| Show duration and file size per track | Key signals for choosing which copy to keep (lossless vs. lossy) | LOW | `duration_ms`, `file_size` already in TrackDTO |
| Pre-select the "worse" copy per group | Reduces click burden — users just review and confirm | LOW | Reuse existing "lowest ID = keeper" logic as the default selection |
| Confirm before deleting | Required for any destructive action on user data | LOW | Dialog already implies this; just needs a confirm button |
| Empty state when no duplicates found | Clear "No duplicates found" message prevents confusion when button appears to do nothing | LOW | Simple conditional render |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Show BPM/key per duplicate | DJs care which file has been analyzed; an unanalyzed copy is less valuable | LOW | `bpm`, `musical_key` already in TrackDTO |
| Show date_added per track | Helps user trust which import was deliberate (first import is usually the intentional one) | LOW | `date_added` already in TrackDTO |
| Allow choosing which copy to keep within a group | Full control, not just "delete these" | MEDIUM | Requires group-aware selection state in the dialog |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Preview/play audio from dialog | "Let me hear which is higher quality" | Distracts from the primary task; dialog would need audio integration | Show bitrate and file size — sufficient quality signals |
| Automatic smart-delete without dialog | "Just clean up everything fast" | Destroys files the user might need | Keep both paths: the existing one-click button for power users AND the new review dialog |
| Merge metadata from duplicates | "Copy tags from the better copy to the keeper" | High complexity, out of scope for a cleanup operation | Defer to a dedicated metadata editor feature |

#### UX Flow (Recommended)

```
Settings > Database Maintenance
  ├── [Review Duplicate Tracks]    <- new button — opens dialog
  └── [Remove Duplicates (quick)]  <- existing button kept for power users

Dialog:
  Header: "Duplicate Tracks — X groups found, Y tracks selected for deletion"
  Body: Scrollable list of groups
    Group 1:
      [keep icon] Track row: title | artist | path | duration | size | BPM | date_added
      [checkbox]  Track row: title | artist | path | duration | size | BPM | date_added  (pre-checked)
    Group 2: ...
  Footer: [Cancel]  [Delete N selected tracks]
```

#### New Backend Command Required

The existing `remove_duplicate_tracks()` folds detection and deletion into one atomic operation. The dialog needs detection only:

```
get_duplicate_groups() -> Vec<DuplicateGroup>

DuplicateGroup {
  keep: TrackDTO,           // recommended track to keep (lowest ID)
  duplicates: Vec<TrackDTO> // tracks recommended for deletion
}
```

This is a read-only query — safe to call without side effects. Deletion then takes a list of track IDs (reusing existing delete logic per-ID, or a new `delete_tracks_batch` command for efficiency).

#### Complexity

MEDIUM overall:
- Backend: new `get_duplicate_groups` command — extract detection logic from `remove_duplicate_tracks`, return structured data instead of deleting. LOW complexity, it is a pure refactor of existing code.
- Frontend dialog component: modal with group list, per-row checkboxes, group-level selection state, confirm/cancel. MEDIUM complexity.
- Connecting dialog to tauri-api and refreshing library state after deletion. LOW complexity.

---

### Feature 3: Full Library Load on Startup

**Category:** Loading strategy change — remove "Scroll for more" pagination, load all tracks at once when "All Tracks" is selected

#### What Currently Exists

`App.tsx` `loadTracks()` for the "All Tracks" view:
- Initial load: `getTracksPaginated(1000, 0)` — first 1000 tracks only
- Sets `hasMoreTracks = true` if total count > 1000
- `loadMoreTracks()` fetches subsequent 1000-track batches and appends to state
- TrackTable uses TanStack Virtual for DOM-level virtualization — only renders visible rows regardless of array size
- A "Scroll for more" footer is shown at the bottom whenever `hasMoreTracks` is true

#### What "Load All Tracks at Once" Means

Replace the paginated initial load with `getAllTracks()` (already exists in `tauri-api.ts`). Remove `loadMoreTracks`, `hasMoreTracks`, and `isLoadingMore` state. Remove the "Scroll for more" footer trigger. The virtualized renderer (TanStack Virtual) already handles rendering performance — it creates DOM nodes only for visible rows regardless of how large the in-memory array is.

#### Performance Reality for This Audience

RecoDeck's audience (DJ friends, personal use) typically has libraries of 5,000–30,000 tracks.

| Library Size | Rust Query Time | JS Parse + setState | DOM Nodes (virtual) | Verdict |
|-------------|-----------------|---------------------|---------------------|---------|
| 5,000 tracks | < 100ms | < 200ms | ~30–50 rows | Instant |
| 20,000 tracks | ~300–500ms | ~500ms | ~30–50 rows | Fast, acceptable |
| 50,000 tracks | ~1–2s | ~1–2s | ~30–50 rows | Brief spinner, fine |

The additional wait for full load (vs. 1000-track page) is imperceptible at typical library sizes and removes significant UX friction.

#### Why Pagination Causes Problems

The paginated approach actively breaks several existing features:
- **Scroll to now playing track** — `scrollToIndex` only works for tracks that have been loaded into the array. If the currently playing track is on page 3, "scroll to track" silently fails.
- **Sort operates only on loaded page** — column sort in the UI sorts `tracks[]` in memory. With pagination, this sorts only the visible batch, not the full library.
- **"All Tracks" count vs. visible count mismatch** — footer shows "Showing 1000 of 4231" which is confusing when TanStack Virtual already hides most rows visually.
- **Backend search result count vs. loaded tracks mismatch** — `searchTracks` returns all results from the full DB, but displayed list might not include them all if pagination state is out of sync.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All tracks visible immediately in "All Tracks" view | Desktop apps do not paginate their own local data | LOW | Replace `getTracksPaginated` call with `getAllTracks` |
| No "Scroll for more" prompt | This is a web/mobile pattern; wrong for a desktop music library | LOW | Remove `hasMoreTracks` state and footer rendering |
| Loading indicator during fetch | Library load takes a moment; spinner prevents confusion | LOW | Already exists — the table shows loading state |
| Sort operates on full library | Column sort must reflect the full dataset | LOW | Automatically fixed by full load |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Keep pagination as fallback for very large libraries | "What if someone has 100k tracks?" | RecoDeck's audience does not have 100k tracks; overengineering for this adds complexity without benefit. A 3–5s spinner for 100k tracks is acceptable. | Document the scale assumption in code comments |
| Progressive load with background fetch | Hybrid approach that loads first page, then fetches the rest | Re-introduces the partial-list problem and adds complexity back | Just load all; the extra wait is acceptable |
| Lazy-load artwork alongside tracks | "Load artwork too for better initial render" | Artwork is fetched on-demand via `artworkCache` — independent of track data load | No change needed |

#### Complexity

LOW. This is a targeted simplification:
1. In `loadTracks()`, replace `getTracksPaginated(1000, 0)` with `getAllTracks()` for the "no folder, no playlist" path
2. Remove `hasMoreTracks`, `isLoadingMore`, `loadMoreTracks` state and function from `App.tsx`
3. Remove or make optional the `loadMoreTracks` / `hasMoreTracks` props passed to `TrackTable`
4. Remove the "Scroll for more" footer from `TrackTable` rendering
5. Remove the scroll-to-bottom trigger in `TrackTable` that called `loadMoreTracks`

Net result: fewer lines of code, simpler App.tsx, and the "All Tracks" view works correctly for all existing features.

---

## Feature Dependencies

```
Layout fix (Feature 1)
    └── independent — no dependencies on other v1.3 features

Full library load (Feature 3)
    └── getAllTracks already exists in tauri-api.ts (no new backend command needed)
        └── removes: loadMoreTracks, hasMoreTracks, isLoadingMore

Duplicate review dialog (Feature 2)
    ├── requires new backend: get_duplicate_groups command (read-only detection, no delete)
    └── deletion uses: existing delete_track per-ID (or new delete_tracks_batch)
```

### Dependency Notes

- **Feature 2 requires a new backend command before the dialog can be built.** It is a pure extraction of existing detection logic — no new algorithms. This is a prerequisite, not a blocker for the other features.
- **Feature 3 simplifies App.tsx.** Removing pagination state reduces complexity and eliminates a prop chain into TrackTable. No Rust changes needed.
- **Feature 1 is fully independent.** Pure CSS, no JS or Rust changes.

---

## MVP Definition

### Launch With (v1.3 — all three features)

- [ ] Track table layout fix — rows and header extend full width on any window size (CSS fix)
- [ ] Full library load — replace paginated load with `getAllTracks()`, remove "Scroll for more" UI
- [ ] Duplicate review dialog — new `get_duplicate_groups` backend command + modal UI with group display, checkbox selection, confirm/cancel

### Add After Validation (future)

- [ ] Batch delete command for duplicates — add `delete_tracks_batch` if per-ID loop is slow for large duplicate sets
- [ ] "Choose which copy to keep" per group — allow flipping the keeper within each group in the dialog

### Future Consideration (v2+)

- [ ] Duplicate detection across different file formats (same song, different format — e.g., MP3 vs. FLAC) — requires audio fingerprinting, out of scope
- [ ] Smart metadata merge from duplicates — high complexity, low priority for this audience

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Layout fix | MEDIUM (polish, correctness) | LOW | P1 — quick win, do first |
| Full library load | HIGH (removes friction, fixes scroll-to-track and sort) | LOW | P1 — simplification with UX improvement |
| Duplicate review dialog | HIGH (data safety, replaces risky one-click delete) | MEDIUM | P1 — most work, highest user value |

**Suggested implementation order:**
1. Layout fix — CSS only, lowest risk, immediate visible improvement
2. Full library load — simplifies App.tsx before adding dialog complexity
3. Duplicate review dialog — new backend command + UI, most changes but well-scoped

---

## Competitor Feature Analysis

| Feature | Rekordbox 6 | iTunes / Music.app | Swinsian | RecoDeck v1.3 Approach |
|---------|------------|-------------------|---------|----------------------|
| Duplicate detection UX | "Show Duplicate Items" view filter — no review dialog | "Show Duplicate Items" menu — no review dialog | "Find Duplicates" with list preview | Review dialog with group list + selective delete |
| Full library in table | Yes — all tracks always loaded | Yes — all tracks always loaded | Yes | Matches convention: always load all |
| Table row full-width backgrounds | Yes | Yes | Yes | CSS fix to match standard |
| Which copy to keep | Auto-keeps one (no user control) | Auto-keeps one (no user control) | User picks | Pre-select recommended, allow override |

---

## Sources

- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/App.tsx` — pagination logic, loadTracks, loadMoreTracks, hasMoreTracks state
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/TrackTable.css` — row and header layout classes, `min-width: fit-content` on `.track-table-row`
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/settings/DatabaseSection.tsx` — current one-click duplicate removal button
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/src/db/mod.rs` `remove_duplicate_tracks()` — detection + deletion logic to be split
- Codebase: `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/lib/tauri-api.ts` — `getAllTracks`, `getTracksPaginated`, `cleanupDuplicateTracks` existing commands
- UX convention: Rekordbox, iTunes/Music.app, Swinsian duplicate detection — industry standard is review-before-delete for music library management
- Performance: TanStack Virtual renders only visible DOM rows regardless of in-memory array size — confirmed in existing TrackTable implementation

---

*Feature research for: RecoDeck v1.3 Library UX & Duplicate Management*
*Researched: 2026-03-06*
