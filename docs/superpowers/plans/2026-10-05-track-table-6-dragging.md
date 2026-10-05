# Track Table 6 of 6: Dragging Tracks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You can drag the selected tracks:
- **onto a playlist** in the sidebar, which adds them;
- **onto a library folder** in the sidebar's Folders section, which moves their files (the Move to folder rules);
- **to another place** in a playlist's own table, which reorders it.

Each drop gives one toast with Undo. A playlist now opens in its own order, so a reorder has an order to work in.

**Architecture:**
- **The drag layer** (`src/lib/drag/`), built to the Interactions spec's *Drag and drop* rules. It uses pointer events, not HTML5 drag and drop: the virtualized table unmounts rows while it scrolls, and the Tauri window's file-drop handling would take a native drag.
  - `useTrackDrag` turns a press on a row into a drag after 4px.
  - `startTrackDrag` puts move, up, Esc and blur listeners on `window`, plus a frame loop. Each frame it reads the target from the element under the pointer (`elementFromPoint` + `data-drop-*`), scrolls a list whose edge the pointer is near (`data-drop-scroll`), and opens what the pointer has rested on for 600ms (`data-drop-open`, through `registerDropOpener`).
  - A small zustand store holds what is dragged, the pointer and the valid target.
  - `DragGhost` (rendered by AppShell) is the "3 tracks" label at the pointer. Its CSS holds the grabbing and not-allowed cursors and the lit target (accent tint and outline).
- **Targets:**
  - FolderTree's playlist rows are `data-drop="playlist"`; library folders (roots and subfolders) are `data-drop="folder"`; a playlist folder is `data-drop="none"`, so it takes nothing.
  - A closed folder carries `data-drop-open`; so do the collapsed rail's Folders and Playlists icons, which open their flyout and close it when the drag ends.
  - The section lists, the sections area, the flyout and the table scroll near their edges.
  - The table's scroll area is `data-drop="rows"`, a target only for a drag that started there, and valid only while the table may reorder.
- **The table:**
  - The rows are the source; the dragged rows dim.
  - `ReorderLine` draws the line in the gap under the pointer.
  - A drop calls the existing `onAddToPlaylist` / `onMoveToFolder`, or the new `onReorderPlaylist` with the new order (`reorderIds`).
- **App:** `handleReorderPlaylist` shows the new order at once, stores it with `reorder_playlist_tracks`, and toasts "Reordered Warm Up" with Undo. Add and move reuse plan 4's and plan 5's handlers, with their toasts and Undo.

**Tech Stack:** React 19, TypeScript, zustand, Vitest (jsdom). No Rust changes.

**Spec:** read these first:
- `docs/superpowers/specs/2026-10-04-track-table-design.md`: *Selecting several* (the Dragging paragraph), *Columns* (sorting) and *Data*;
- `docs/superpowers/specs/2026-10-04-interactions-design.md`: *Drag and drop*, *Keyboard* (Esc), the Undo table's reorder row, *Testing*;
- the approved demo `2026-10-04-interactions-demo.html`, card 3: the label, the dimmed rows, the lit target.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is built by six plans:** 1 toolbar and filter, 2 columns, 3 artwork, 4 selection, menu and toasts, 5 Move to folder (all done); **6 this plan**.

**Decisions, beyond the spec's letter:**
- **A playlist opens in its own order** (the user's choice, 2026-10-05). The table always sorted, playlists by title too, so "only with no sort" had no state to mean. Now:
  - the sort can be `null`, the list's own order, with no arrow;
  - a playlist opens so;
  - a head click sorts, again reverses, and the third click goes back to the playlist's order. A hidden sorted column falls back to that order too;
  - outside playlists nothing changes: the table opens by title, two states per head.
- **Refused drops:**
  - The playlist shown and the folder every dragged track is already in refuse the drop (not-allowed), as the menu greys them.
  - A playlist folder refuses too: it takes nothing, and resting on it opens it.
  - The table refuses a reorder while sorted, searched or filtered, as the spec says.
- **Only valid targets light up;** the table's own rows show the line instead of a tint.
- **A drag:**
  - starts only from a plain press: not with ⌘, Ctrl or Shift held (they select), and not on a control in the row (▶, the stars, a comment's button);
  - leaves the selection as it was: the click a release fires is swallowed.
- **A reorder** of several tracks lands them together, in the order they had. A drop that would change nothing does nothing (no toast). App shows the new order before the call returns; if the call fails, it reloads and shows an error toast.
- **Undo of a reorder** puts back the order before the drop. Tracks removed since stay out; tracks added since keep their places after it, as plan 4's Undo of Delete from playlist does.
- **Rail flyouts:** one opened by resting on its icon closes when the drag ends, dropped or cancelled. One opened by a click closes on the press that starts a drag, as it did before.
- **Esc** cancels the drag before anything else hears it (a capture listener on `window`, `stopImmediatePropagation`), so a flyout or the table's selection stays.
- **Home's track rows** as a source are left for the Home plan, as the spec says.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at b8d8d5c; the same blocks, applied to a clean `git archive`, reproduce it file for file.
- **Builds and tests:**
  - `vitest`: 14 new tests (the sort 4, the reorder 4, the drop targets 6). The scratch tree counted 507 passed; the repo will count 521 (its gitignored fixtures add 14).
  - `tsc` passes; eslint shows only the existing 22 problems; `vite build` passes. `cargo test` is unchanged: 438.
- **In WebKit** (a test page with the real Sidebar, a playlist's TrackTable, AppShell's DragGhost and Toaster, IPC mocked):
  - **Adding:** an unselected row dragged onto Peak Time. The label said "1 track", the row dimmed, and Peak Time lit with the accent tint and outline. The drop added it, and the row stayed selected alone.
  - **A short move:** a 2px move is a click.
  - **Moving:** 3 selected tracks rested on the closed root `music` for 800ms, which opened it. Dropped on Techno, they moved, and the selection stayed.
  - **Refused:** House (the folder they share), Warm Up (the playlist shown) and Sets (a playlist folder) refuse with not-allowed. Resting on Sets opened it; Deep Sets took the drop.
  - **Esc:** it cancelled the drag; the release after it dropped nothing.
  - **Reordering:** Track 01 dropped below row 4 gave 2, 3, 4, 1, 5, 6. The line sat in that gap.
  - **Sorted:** sorted by BPM, the table refuses (not-allowed); the third click on BPM went back to the playlist's order.
  - **Scrolling:** the Playlists list scrolled near its bottom edge (390px in 0.5s). The table scrolled near its bottom edge during a reorder (444px), and the line followed.
  - **The rail:** with the sidebar collapsed, resting 800ms on the Playlists icon opened its flyout (not at 300ms). Dropping on Peak Time in it added the track and closed the flyout. Resting on Folders, then Esc, closed it too.
  - **The ▶ button:** a press on it does not start a drag.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/trackTable/sort.ts` (+ test), `src/components/track-table/TableHead.tsx` | modify | the sort can be null, the list's own order; the third click goes back to it |
| `src/lib/trackTable/reorder.ts` (+ test) | create | the order after dropping tracks at a gap |
| `src/lib/drag/dropTargets.ts` (+ test) | create | the payload and target types; the target, and what resting opens, from `data-drop-*` |
| `src/lib/drag/trackDrag.ts` | create | the drag: the store, the window listeners, the frame loop (edge scrolling, rest-to-open), Esc, the openers' registry |
| `src/lib/drag/useTrackDrag.ts` | create | a row's press → a drag after 4px |
| `src/components/DragGhost.tsx`, `.css`; `src/components/layout/AppShell.tsx` | create / modify | the label at the pointer; the drag's cursors and the lit target |
| `src/components/TrackTable.tsx`, `.css`; `src/components/track-table/ReorderLine.tsx` | modify / create | own order in playlists; the rows as the source; the dimmed rows; the line |
| `src/components/FolderTree.tsx`, `layout/Sidebar.tsx`, `layout/SidebarFlyout.tsx`, `layout/SidebarRail.tsx` | modify | the targets, the lists that scroll, the folders and rail icons that open |
| `src/App.tsx` | modify | the reorder, its toast and Undo |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign`. `git status --short --untracked-files=no` should show only `.claude/settings.local.json` and `.planning/STATE.md`; leave them.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `507 passed`;
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src 2>&1 | grep problems`: `✖ 22 problems (10 errors, 12 warnings)`.

---

### Task 1: A playlist opens in its own order

**Files:** Modify `src/lib/trackTable/sort.ts` (+ test), `src/components/track-table/TableHead.tsx`, `src/components/TrackTable.tsx`.

- [ ] **Step 1: The failing tests**

In `src/lib/trackTable/sort.test.ts`, replace

```ts
    const byBpm = nextSort(DEFAULT_SORT, 'bpm')
    expect(byBpm).toEqual({ column: 'bpm', direction: 'asc' })
    expect(nextSort(byBpm, 'bpm')).toEqual({ column: 'bpm', direction: 'desc' })
  })

  it('starts Rating, Plays and Added with the most', () => {
    expect(nextSort(DEFAULT_SORT, 'rating').direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'plays').direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'added').direction).toBe('desc')
  })
})

describe('the sort shown', () => {
  it('keeps a sort by a shown column, by title or by artist', () => {
    const layout = defaultLayout()
```

with

```ts
    const byBpm = nextSort(DEFAULT_SORT, 'bpm')
    expect(byBpm).toEqual({ column: 'bpm', direction: 'asc' })
    expect(nextSort(byBpm, 'bpm')).toEqual({ column: 'bpm', direction: 'desc' })
  })

  it('starts Rating, Plays and Added with the most', () => {
    expect(nextSort(DEFAULT_SORT, 'rating')?.direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'plays')?.direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'added')?.direction).toBe('desc')
  })

  it("goes back to a playlist's own order on the third click", () => {
    const byBpm = nextSort(null, 'bpm', true)
    expect(byBpm).toEqual({ column: 'bpm', direction: 'asc' })
    const reversed = nextSort(byBpm, 'bpm', true)
    expect(reversed).toEqual({ column: 'bpm', direction: 'desc' })
    expect(nextSort(reversed, 'bpm', true)).toBeNull()
    const byRating = nextSort(null, 'rating', true)
    expect(nextSort(nextSort(byRating, 'rating', true), 'rating', true)).toBeNull()
  })

  it('never goes back to no sort outside a playlist', () => {
    const reversed = nextSort(nextSort(DEFAULT_SORT, 'bpm'), 'bpm')
    expect(nextSort(reversed, 'bpm')).toEqual({ column: 'bpm', direction: 'asc' })
  })
})

describe('the sort shown', () => {
  it('keeps a sort by a shown column, by title or by artist', () => {
    const layout = defaultLayout()
```

In `src/lib/trackTable/sort.test.ts`, replace

```ts
  })

  it('falls back to title once the sorted column is hidden', () => {
    const layout = setColumnShown(defaultLayout(), 'bpm', false)
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout)).toEqual(DEFAULT_SORT)
  })
})

describe('sorting', () => {
  it('keeps empty values last in either direction', () => {
    const tracks = [track({ label: 'B' }), track(), track({ label: 'a' })]
    const labels = (direction: 'asc' | 'desc') =>
```

with

```ts
  })

  it('falls back to title once the sorted column is hidden', () => {
    const layout = setColumnShown(defaultLayout(), 'bpm', false)
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout)).toEqual(DEFAULT_SORT)
  })

  it("falls back to a playlist's own order there", () => {
    const layout = setColumnShown(defaultLayout(), 'bpm', false)
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout, null)).toBeNull()
    expect(visibleSort(null, defaultLayout(), null)).toBeNull()
  })
})

describe('sorting', () => {
  it('keeps empty values last in either direction', () => {
    const tracks = [track({ label: 'B' }), track(), track({ label: 'a' })]
    const labels = (direction: 'asc' | 'desc') =>
```

In `src/lib/trackTable/sort.test.ts`, replace

```ts
    expect(sortTracks([old, fresh], { column: 'added', direction: 'desc' }, null)).toEqual([
      fresh,
      old,
    ])
  })

  it('leaves the given list as it was', () => {
    const tracks = [track({ title: 'b' }), track({ title: 'a' })]
    const copy = [...tracks]
    sortTracks(tracks, DEFAULT_SORT, null)
    expect(tracks).toEqual(copy)
  })
```

with

```ts
    expect(sortTracks([old, fresh], { column: 'added', direction: 'desc' }, null)).toEqual([
      fresh,
      old,
    ])
  })

  it("keeps the list's own order with no sort", () => {
    const tracks = [track({ title: 'b' }), track({ title: 'a' })]
    expect(sortTracks(tracks, null, null)).toBe(tracks)
  })

  it('leaves the given list as it was', () => {
    const tracks = [track({ title: 'b' }), track({ title: 'a' })]
    const copy = [...tracks]
    sortTracks(tracks, DEFAULT_SORT, null)
    expect(tracks).toEqual(copy)
  })
```

Run: `npx vitest run src/lib/trackTable/sort.test.ts`. Expected: 3 FAIL ("goes back to a playlist's own order on the third click", "falls back to a playlist's own order there", "keeps the list's own order with no sort"), 9 pass.

- [ ] **Step 2: The sort**

In `src/lib/trackTable/sort.ts`, replace

```ts
// src/lib/trackTable/sort.ts
// Sorting the track table: a head click sorts by its column, again reverses.
// Rating, Plays and Added start with the most; empty values stay last either
// way. Moved out of TrackTable.tsx, unchanged apart from the new columns.
import type { Track } from '../../types/track'
import { shownColumns, type ColumnId, type TrackTableLayout } from './columns'

export type SortColumn =
  | 'title'
  | 'artist'
```

with

```ts
// src/lib/trackTable/sort.ts
// Sorting the track table: a head click sorts by its column, again reverses.
// Rating, Plays and Added start with the most; empty values stay last either
// way. A list with an order of its own (a playlist) opens in that order — no
// sort, null — and a third click on the same head goes back to it.
import type { Track } from '../../types/track'
import { shownColumns, type ColumnId, type TrackTableLayout } from './columns'

export type SortColumn =
  | 'title'
  | 'artist'
```

In `src/lib/trackTable/sort.ts`, replace

```ts
  plays: 'plays',
  format: 'format',
}

const MOST_FIRST = new Set<SortColumn>(['rating', 'plays', 'added'])

/** The sort after a click on `column`'s head. */
export function nextSort(previous: SortState, column: SortColumn): SortState {
  if (previous.column === column) {
    return { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: MOST_FIRST.has(column) ? 'desc' : 'asc' }
}

/** The sort shown: by title when the sorted column was hidden since. */
export function visibleSort(sort: SortState, layout: TrackTableLayout): SortState {
  if (sort.column === 'title' || sort.column === 'artist') return sort
  const shown = shownColumns(layout).some((column) => SORT_BY_COLUMN[column.id] === sort.column)
  return shown ? sort : DEFAULT_SORT
}

function sortValue(
  track: Track,
  column: SortColumn,
  plays: ReadonlyMap<number, number> | null,
```

with

```ts
  plays: 'plays',
  format: 'format',
}

const MOST_FIRST = new Set<SortColumn>(['rating', 'plays', 'added'])

/**
 * The sort after a click on `column`'s head (null: the list's own order). With
 * `ownOrder`, the click after the reversing one goes back to that order.
 */
export function nextSort(
  previous: SortState | null,
  column: SortColumn,
  ownOrder = false,
): SortState | null {
  const first = MOST_FIRST.has(column) ? 'desc' : 'asc'
  if (previous?.column === column) {
    if (ownOrder && previous.direction !== first) return null
    return { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: first }
}

/**
 * The sort shown: `fallback` (by title, or a playlist's own order) when the
 * sorted column was hidden since.
 */
export function visibleSort(
  sort: SortState | null,
  layout: TrackTableLayout,
  fallback: SortState | null = DEFAULT_SORT,
): SortState | null {
  if (sort === null || sort.column === 'title' || sort.column === 'artist') return sort
  const shown = shownColumns(layout).some((column) => SORT_BY_COLUMN[column.id] === sort.column)
  return shown ? sort : fallback
}

function sortValue(
  track: Track,
  column: SortColumn,
  plays: ReadonlyMap<number, number> | null,
```

In `src/lib/trackTable/sort.ts`, replace

```ts
      return track.date_added ?? ''
    case 'plays':
      return plays?.get(track.id) ?? 0
  }
}

/** A sorted copy; `plays` is needed only to sort by Plays. */
export function sortTracks(
  tracks: Track[],
  sort: SortState,
  plays: ReadonlyMap<number, number> | null,
): Track[] {
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    const valueA = sortValue(a, sort.column, plays)
    const valueB = sortValue(b, sort.column, plays)
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      // Empty strings stay at the bottom whichever the direction.
```

with

```ts
      return track.date_added ?? ''
    case 'plays':
      return plays?.get(track.id) ?? 0
  }
}

/** A sorted copy (no sort: the list as it is); `plays` is needed only to sort by Plays. */
export function sortTracks(
  tracks: Track[],
  sort: SortState | null,
  plays: ReadonlyMap<number, number> | null,
): Track[] {
  if (sort === null) return tracks
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    const valueA = sortValue(a, sort.column, plays)
    const valueB = sortValue(b, sort.column, plays)
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      // Empty strings stay at the bottom whichever the direction.
```

Run the tests again: PASS, 12.

- [ ] **Step 3: The heads show no arrow for it**

In `src/components/track-table/TableHead.tsx`, replace

```tsx
// src/components/track-table/TableHead.tsx
// The column heads (track table spec, Columns): a click sorts by the column
// and again reverses, the arrow shows which; Title & artist's "Title" and
// "Artist" each sort. A head's right edge drags to resize (Title & artist
// takes what is left, so it has none). A right-click opens the Columns panel.
import { useRef, useState, type PointerEvent } from 'react'
import {
  columnDef,
  setColumnWidth,
```

with

```tsx
// src/components/track-table/TableHead.tsx
// The column heads (track table spec, Columns): a click sorts by the column
// and again reverses (in a playlist, a third click goes back to its own
// order), the arrow shows which; Title & artist's "Title" and
// "Artist" each sort. A head's right edge drags to resize (Title & artist
// takes what is left, so it has none). A right-click opens the Columns panel.
import { useRef, useState, type PointerEvent } from 'react'
import {
  columnDef,
  setColumnWidth,
```

In `src/components/track-table/TableHead.tsx`, replace

```tsx
} from '../../lib/trackTable/columns'
import { SORT_BY_COLUMN, type SortColumn, type SortState } from '../../lib/trackTable/sort'
import { useTrackTableLayout } from '../../store/trackTableLayoutStore'

interface TableHeadProps {
  layout: TrackTableLayout
  sort: SortState
  onSort: (column: SortColumn) => void
  onOpenColumns: () => void
}

function SortButton({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn
  label: string
  sort: SortState
  onSort: (column: SortColumn) => void
}) {
  const sorted = sort.column === column
  return (
    <button
      type="button"
      className={sorted ? 'head-sort head-sort--sorted' : 'head-sort'}
      aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => onSort(column)}
```

with

```tsx
} from '../../lib/trackTable/columns'
import { SORT_BY_COLUMN, type SortColumn, type SortState } from '../../lib/trackTable/sort'
import { useTrackTableLayout } from '../../store/trackTableLayoutStore'

interface TableHeadProps {
  layout: TrackTableLayout
  /** null: the list's own order (a playlist), no arrow. */
  sort: SortState | null
  onSort: (column: SortColumn) => void
  onOpenColumns: () => void
}

function SortButton({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn
  label: string
  sort: SortState | null
  onSort: (column: SortColumn) => void
}) {
  const sorted = sort?.column === column
  return (
    <button
      type="button"
      className={sorted ? 'head-sort head-sort--sorted' : 'head-sort'}
      aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => onSort(column)}
```

- [ ] **Step 4: A playlist's table opens in its own order** (App remounts the table for each view, `key={viewKey}`, so the first state is per playlist)

In `src/components/TrackTable.tsx`, replace

```tsx
        playlists.filter(
          (p) => p.playlist_type !== 'folder' && p.id !== selectedPlaylistId,
        ),
      [playlists, selectedPlaylistId],
    )

    // Sort state — default: sort by title ascending
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

    // --- Search: filter tracks by query across all text fields ---
    const searchedTracks = useMemo(() => {
      if (!searchQuery.trim()) return tracks

      const query = searchQuery.toLowerCase().trim()
```

with

```tsx
        playlists.filter(
          (p) => p.playlist_type !== 'folder' && p.id !== selectedPlaylistId,
        ),
      [playlists, selectedPlaylistId],
    )

    // Sort state: by title ascending; a playlist opens in its own order (null),
    // and the third click on a head goes back to it.
    const ownOrder = selectedPlaylistId != null
    const [sort, setSort] = useState<SortState | null>(ownOrder ? null : DEFAULT_SORT)

    // --- Search: filter tracks by query across all text fields ---
    const searchedTracks = useMemo(() => {
      if (!searchQuery.trim()) return tracks

      const query = searchQuery.toLowerCase().trim()
```

In `src/components/TrackTable.tsx`, replace

```tsx
    const plays = usePlayCounts(
      columns.some((column) => column.id === 'plays'),
      playVersion,
    )

    // --- Sort: by the column whose head was clicked, if it is still shown ---
    const shownSort = visibleSort(sort, layout)
    const sortedTracks = useMemo(
      () => sortTracks(filteredTracks, shownSort, plays),
      [filteredTracks, shownSort, plays],
    )
    const handleSort = (column: SortColumn) => setSort(nextSort(shownSort, column))

    // Rows no longer shown leave the selection: adjusted while rendering, when
    // the rows shown change (search, filter, sort, a reload).
    const shownIds = useMemo(() => sortedTracks.map((t) => t.id), [sortedTracks])
    const [selectionRows, setSelectionRows] = useState(shownIds)
    if (selectionRows !== shownIds) {
```

with

```tsx
    const plays = usePlayCounts(
      columns.some((column) => column.id === 'plays'),
      playVersion,
    )

    // --- Sort: by the column whose head was clicked, if it is still shown ---
    const shownSort = visibleSort(sort, layout, ownOrder ? null : DEFAULT_SORT)
    const sortedTracks = useMemo(
      () => sortTracks(filteredTracks, shownSort, plays),
      [filteredTracks, shownSort, plays],
    )
    const handleSort = (column: SortColumn) => setSort(nextSort(shownSort, column, ownOrder))

    // Rows no longer shown leave the selection: adjusted while rendering, when
    // the rows shown change (search, filter, sort, a reload).
    const shownIds = useMemo(() => sortedTracks.map((t) => t.id), [sortedTracks])
    const [selectionRows, setSelectionRows] = useState(shownIds)
    if (selectionRows !== shownIds) {
```

- [ ] **Step 5:** `npx tsc --noEmit -p .` should show no errors. Commit:

```bash
git add src/lib/trackTable/sort.ts src/lib/trackTable/sort.test.ts src/components/track-table/TableHead.tsx src/components/TrackTable.tsx
git commit -m "feat(tracks): a playlist opens in its own order — the third click on a head goes back to it"
```

---

### Task 2: The order after a drop

**Files:** Create `src/lib/trackTable/reorder.ts`; test `src/lib/trackTable/reorder.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/trackTable/reorder.test.ts`:

```ts
// src/lib/trackTable/reorder.test.ts
import { describe, expect, it } from 'vitest'
import { reorderIds } from './reorder'

describe('reordering a playlist by dragging', () => {
  const order = [1, 2, 3, 4, 5]

  it('moves a track down to the gap', () => {
    expect(reorderIds(order, new Set([2]), 4)).toEqual([1, 3, 4, 2, 5])
  })

  it('moves a track up, and to either end', () => {
    expect(reorderIds(order, new Set([4]), 1)).toEqual([1, 4, 2, 3, 5])
    expect(reorderIds(order, new Set([3]), 0)).toEqual([3, 1, 2, 4, 5])
    expect(reorderIds(order, new Set([3]), 5)).toEqual([1, 2, 4, 5, 3])
  })

  it('lands tracks picked apart together, in the order they had', () => {
    expect(reorderIds(order, new Set([5, 1, 3]), 2)).toEqual([2, 1, 3, 5, 4])
  })

  it('answers the same list when nothing would move', () => {
    expect(reorderIds(order, new Set([2]), 2)).toBe(order)
    expect(reorderIds(order, new Set([2]), 1)).toBe(order)
    expect(reorderIds(order, new Set([2, 3]), 3)).toBe(order)
  })
})
```

Run: `npx vitest run src/lib/trackTable/reorder.test.ts`. Expected: FAIL, `Failed to resolve import "./reorder"`.

- [ ] **Step 2: The helper**

Create `src/lib/trackTable/reorder.ts`:

```ts
// src/lib/trackTable/reorder.ts
// Reordering a playlist by dragging (track table spec, Dragging): the dragged
// tracks land together at the gap the line shows, in the order they had; the
// others keep theirs.

/**
 * The order after moving `moving` to `gap`, a place between rows of `order`:
 * 0 is before the first, `order.length` after the last. The same array when
 * nothing would move.
 */
export function reorderIds(
  order: readonly number[],
  moving: ReadonlySet<number>,
  gap: number,
): readonly number[] {
  const before = order.slice(0, gap).filter((id) => !moving.has(id))
  const moved = order.filter((id) => moving.has(id))
  const after = order.slice(gap).filter((id) => !moving.has(id))
  const next = [...before, ...moved, ...after]
  return next.every((id, i) => id === order[i]) ? order : next
}
```

- [ ] **Step 3:** Run the same command: PASS, 4. Commit:

```bash
git add src/lib/trackTable/reorder.ts src/lib/trackTable/reorder.test.ts
git commit -m "feat(tracks): the order after dropping tracks at a gap"
```

---

### Task 3: Where dragged tracks land

**Files:** Create `src/lib/drag/dropTargets.ts`; test `src/lib/drag/dropTargets.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/drag/dropTargets.test.ts`:

```ts
// src/lib/drag/dropTargets.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import { restKeyAt, targetAt, type DragPayload } from './dropTargets'

function track(id: number, file_path: string): Track {
  return { id, file_path, file_hash: `h${id}`, play_count: 0, rating: 0 }
}

const payload: DragPayload = {
  tracks: [track(1, '/Music/House/a.mp3'), track(2, '/Music/House/b.mp3')],
  table: 't1',
  reorder: true,
  playlistId: 5,
}

// An element of the page built below: a sidebar's rows and two tables.
function el(id: string): Element {
  return document.getElementById(id)!
}

beforeEach(() => {
  document.body.innerHTML = `
    <div data-drop="playlist" data-drop-id="7"><span id="in-playlist">Peak Time</span></div>
    <div data-drop="playlist" data-drop-id="5" id="shown-playlist"></div>
    <div data-drop="none" data-drop-open="playlist-folder:9" id="playlist-folder"></div>
    <div data-drop="folder" data-drop-path="/Music/Techno" data-drop-name="Techno"
         data-drop-open="library-node:/Music/Techno"><span id="in-folder">Techno</span></div>
    <div data-drop="folder" data-drop-path="/Music/House" data-drop-name="House" id="shared-folder"></div>
    <div data-drop="rows" data-drop-table="t1"><div id="own-row"></div></div>
    <div data-drop="rows" data-drop-table="t2"><div id="other-row"></div></div>
    <div data-drop="playlist" id="broken"></div>
    <p id="nothing"></p>`
})

describe('where dragged tracks land', () => {
  it('finds a playlist from anything inside its row', () => {
    const found = targetAt(el('in-playlist'), payload)
    expect(found?.target).toEqual({ kind: 'playlist', id: 7 })
    expect(found?.valid).toBe(true)
    expect(found?.element.dataset.dropId).toBe('7')
  })

  it('finds a library folder with its path and name', () => {
    expect(targetAt(el('in-folder'), payload)).toMatchObject({
      target: { kind: 'folder', path: '/Music/Techno', name: 'Techno' },
      valid: true,
    })
  })

  it('refuses the playlist shown, the folder the tracks share and a playlist folder', () => {
    expect(targetAt(el('shown-playlist'), payload)?.valid).toBe(false)
    expect(targetAt(el('shared-folder'), payload)?.valid).toBe(false)
    expect(targetAt(el('playlist-folder'), payload)?.valid).toBe(false)
  })

  it('reorders only in the table the drag started in, and only when it may', () => {
    expect(targetAt(el('own-row'), payload)).toMatchObject({
      target: { kind: 'rows', table: 't1' },
      valid: true,
    })
    expect(targetAt(el('own-row'), { ...payload, reorder: false })?.valid).toBe(false)
    expect(targetAt(el('other-row'), payload)).toBeNull()
  })

  it('finds nothing outside a target, or in one missing its id', () => {
    expect(targetAt(el('nothing'), payload)).toBeNull()
    expect(targetAt(el('broken'), payload)).toBeNull()
    expect(targetAt(null, payload)).toBeNull()
  })
})

describe('resting on a closed folder', () => {
  it('reads what opens it', () => {
    expect(restKeyAt(el('in-folder'))).toBe('library-node:/Music/Techno')
    expect(restKeyAt(el('playlist-folder'))).toBe('playlist-folder:9')
    expect(restKeyAt(el('in-playlist'))).toBeNull()
  })
})
```

Run: `npx vitest run src/lib/drag`. Expected: FAIL, `Failed to resolve import "./dropTargets"`.

- [ ] **Step 2: The lookup**

Create `src/lib/drag/dropTargets.ts`:

```ts
// src/lib/drag/dropTargets.ts
// Where dragged tracks can land (Interactions spec, Drag and drop). Targets
// say so with data-drop-* attributes and are found from the element under
// the pointer, so lists that scroll and a flyout that opens mid-drag need no
// measuring:
//   data-drop="playlist" data-drop-id="7"           tracks are added
//   data-drop="folder" data-drop-path data-drop-name tracks are moved there
//   data-drop="rows" data-drop-table                 a playlist's own table reorders
//   data-drop="none"                                 takes nothing (a playlist folder)
//   data-drop-open="<kind>:<value>"                  resting on it opens it
//   data-drop-scroll                                 a list that scrolls near its edge
import type { Track } from '../../types/track'
import { sharedFolder } from '../trackTable/moveMessages'

export interface DragPayload {
  tracks: Track[]
  /** The table the drag started in (its rows are a target only there). */
  table: string
  /** That table may reorder its rows: a playlist in its own order, unnarrowed. */
  reorder: boolean
  /** The playlist that table shows: dropping on it would add nothing. */
  playlistId: number | null
}

export type DropTarget =
  | { kind: 'playlist'; id: number }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'rows'; table: string }

export interface FoundTarget {
  target: DropTarget | null
  /** The element carrying data-drop, which lights up when valid. */
  element: HTMLElement
  /** False where the tracks cannot land: the pointer shows not-allowed. */
  valid: boolean
}

/** The target at `element` (or around it), for these tracks; null where there is none. */
export function targetAt(element: Element | null, payload: DragPayload): FoundTarget | null {
  const holder = element?.closest<HTMLElement>('[data-drop]')
  if (!holder) return null
  const data = holder.dataset
  switch (data.drop) {
    case 'playlist': {
      const id = Number(data.dropId)
      if (!data.dropId || !Number.isInteger(id)) return null
      return { target: { kind: 'playlist', id }, element: holder, valid: id !== payload.playlistId }
    }
    case 'folder': {
      const path = data.dropPath
      if (!path) return null
      const target: DropTarget = { kind: 'folder', path, name: data.dropName || path }
      return { target, element: holder, valid: path !== sharedFolder(payload.tracks) }
    }
    case 'rows': {
      if (data.dropTable !== payload.table) return null
      return { target: { kind: 'rows', table: payload.table }, element: holder, valid: payload.reorder }
    }
    case 'none':
      return { target: null, element: holder, valid: false }
    default:
      return null
  }
}

/** What resting at `element` opens ("<kind>:<value>"), or null. */
export function restKeyAt(element: Element | null): string | null {
  return element?.closest('[data-drop-open]')?.getAttribute('data-drop-open') ?? null
}
```

- [ ] **Step 3:** Run the same command: PASS, 6. Commit:

```bash
git add src/lib/drag/dropTargets.ts src/lib/drag/dropTargets.test.ts
git commit -m "feat(ui): where dragged tracks land — read from data-drop-* under the pointer"
```

---

### Task 4: The drag layer

**Files:** Create `src/lib/drag/trackDrag.ts`, `src/lib/drag/useTrackDrag.ts`, `src/components/DragGhost.tsx`, `src/components/DragGhost.css`; modify `src/components/layout/AppShell.tsx`.

This task has no unit test: what it does — `elementFromPoint`, frames, scrolling — needs a real layout. Task 9 checks it by hand, and the scratch copy was checked in WebKit (see **Checked**).

- [ ] **Step 1: The drag**

Create `src/lib/drag/trackDrag.ts`:

```ts
// src/lib/drag/trackDrag.ts
// The drag layer (Interactions spec, Drag and drop). Pointer events, not HTML5
// drag and drop: rows of the virtualized table unmount while it scrolls, which
// would cancel a native drag, and the Tauri window's file-drop handling would
// take it. The move and up listeners sit on window, and the target is read
// from the element under the pointer (dropTargets.ts). While dragging, a label
// follows the pointer (DragGhost), the dragged rows dim, a valid target lights
// up, a list scrolls when the pointer nears its edge, resting on a closed
// folder or a rail icon opens it, and Esc cancels.
import { create } from 'zustand'
import { restKeyAt, targetAt, type DragPayload, type DropTarget } from './dropTargets'

export interface Point {
  x: number
  y: number
}

/** Resting this long on a closed folder or a rail icon opens it. */
const REST_OPEN_MS = 600
/** A list scrolls when the pointer is this close to its top or bottom edge. */
const EDGE = 32
/** Pixels a list scrolls per frame with the pointer at its very edge. */
const MAX_STEP = 16

interface TrackDragState {
  /** What is being dragged; null when nothing is. */
  payload: DragPayload | null
  /** The pointer. */
  x: number
  y: number
  /** The target under the pointer, when the tracks can land there. */
  target: DropTarget | null
  /** Raised each time a list scrolls under a still pointer. */
  scrolls: number
}

export const useTrackDragStore = create<TrackDragState>(() => ({
  payload: null,
  x: 0,
  y: 0,
  target: null,
  scrolls: 0,
}))

type Opener = (value: string, element: HTMLElement) => void
const openers = new Map<string, Opener>()

/**
 * What resting on `data-drop-open="<kind>:<value>"` does for one kind; the
 * answer unregisters it.
 */
export function registerDropOpener(kind: string, open: Opener): () => void {
  openers.set(kind, open)
  return () => {
    if (openers.get(kind) === open) openers.delete(kind)
  }
}

function openAt(key: string, element: HTMLElement) {
  const colon = key.indexOf(':')
  if (colon === -1) return
  openers.get(key.slice(0, colon))?.(key.slice(colon + 1), element)
}

// The list under the pointer that can scroll towards the edge it is near,
// scrolled a step: further the closer the pointer is to the edge.
function scrollNearEdge(element: Element | null, y: number): boolean {
  for (
    let list = element?.closest<HTMLElement>('[data-drop-scroll]');
    list;
    list = list.parentElement?.closest<HTMLElement>('[data-drop-scroll]')
  ) {
    const { top, bottom } = list.getBoundingClientRect()
    const depth = y < top + EDGE ? y - (top + EDGE) : y > bottom - EDGE ? y - (bottom - EDGE) : 0
    if (depth === 0) continue
    const before = list.scrollTop
    list.scrollTop += Math.sign(depth) * Math.ceil(MAX_STEP * Math.min(1, Math.abs(depth) / EDGE))
    if (list.scrollTop !== before) return true
  }
  return false
}

// The click a release fires after a drag is not a click on a row.
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

/**
 * Drags `payload` from the pointer at `at`. `onDrop` gets the valid target the
 * tracks are let go over, and the pointer; Esc, a cancelled pointer or the
 * window losing focus ends it with nothing dropped.
 */
export function startTrackDrag(
  payload: DragPayload,
  at: Point,
  onDrop: (target: DropTarget, at: Point) => void,
): void {
  if (useTrackDragStore.getState().payload) return
  const root = document.documentElement
  let { x, y } = at
  let lit: HTMLElement | null = null
  let rest: { key: string; since: number; opened: boolean } | null = null
  let frame = 0

  const light = (element: HTMLElement | null) => {
    if (element === lit) return
    lit?.removeAttribute('data-drop-over')
    lit = element
    lit?.setAttribute('data-drop-over', '')
  }

  // What is under the pointer now: the target lit, the cursor, the store.
  const update = () => {
    const found = targetAt(document.elementFromPoint(x, y), payload)
    const valid = found?.valid ? found : null
    light(valid?.element ?? null)
    root.classList.toggle('track-drag--refused', found !== null && !found.valid)
    useTrackDragStore.setState({ x, y, target: valid?.target ?? null })
  }

  // Each frame: scroll a list the pointer is near the edge of, and open what
  // it has rested on long enough.
  const tick = (now: number) => {
    const element = document.elementFromPoint(x, y)
    if (scrollNearEdge(element, y)) {
      useTrackDragStore.setState((state) => ({ scrolls: state.scrolls + 1 }))
      update()
    }
    const key = restKeyAt(element)
    if (key === null) {
      rest = null
    } else if (rest?.key !== key) {
      rest = { key, since: now, opened: false }
    } else if (!rest.opened && now - rest.since >= REST_OPEN_MS) {
      rest.opened = true
      const holder = element?.closest<HTMLElement>('[data-drop-open]')
      if (holder) openAt(key, holder)
    }
    frame = requestAnimationFrame(tick)
  }

  const end = (drop: boolean) => {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
    window.removeEventListener('keydown', onKey, true)
    const { target } = useTrackDragStore.getState()
    light(null)
    root.classList.remove('track-drag', 'track-drag--refused')
    useTrackDragStore.setState({ payload: null, target: null })
    swallowNextClick()
    if (drop && target) onDrop(target, { x, y })
  }

  const onMove = (event: PointerEvent) => {
    x = event.clientX
    y = event.clientY
    update()
  }
  const onUp = (event: PointerEvent) => {
    x = event.clientX
    y = event.clientY
    update()
    end(true)
  }
  const onCancel = () => end(false)
  // Esc cancels the drag before anything else hears it (a menu, the table).
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    end(false)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  window.addEventListener('keydown', onKey, true)
  root.classList.add('track-drag')
  window.getSelection()?.removeAllRanges()
  useTrackDragStore.setState({ payload, x, y, target: null })
  update()
  frame = requestAnimationFrame(tick)
}
```

- [ ] **Step 2: A row as the source**

Create `src/lib/drag/useTrackDrag.ts`:

```ts
// src/lib/drag/useTrackDrag.ts
// A track table's rows as a drag source (Interactions spec, Drag and drop):
// a press on a row that moves 4px drags the selected tracks — or that row
// alone, selected first, when it is not selected. Not with ⌘ or Shift held
// (they select), and not from a control in the row (▶, the stars).
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Track } from '../../types/track'
import type { DragPayload, DropTarget } from './dropTargets'
import { startTrackDrag, type Point } from './trackDrag'

/** How far the pointer moves before a press becomes a drag. */
const DRAG_THRESHOLD = 4

interface TrackDragSource {
  /** The drag for a press on `track`'s row, selecting what it drags; null for none. */
  begin: (track: Track) => DragPayload | null
  onDrop: (payload: DragPayload, target: DropTarget, at: Point) => void
}

/** The rows' onPointerDown. */
export function useTrackDrag(source: TrackDragSource) {
  // The latest selection and handlers, read when the drag starts.
  const sourceRef = useRef(source)
  useEffect(() => {
    sourceRef.current = source
  })

  return (event: ReactPointerEvent, track: Track) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
    if ((event.target as Element).closest('button, input, textarea, select, a, [role="slider"]')) return
    const start = { x: event.clientX, y: event.clientY }
    const pointerId = event.pointerId

    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      if (Math.hypot(move.clientX - start.x, move.clientY - start.y) < DRAG_THRESHOLD) return
      stop()
      const payload = sourceRef.current.begin(track)
      if (!payload) return
      startTrackDrag(payload, { x: move.clientX, y: move.clientY }, (target, at) =>
        sourceRef.current.onDrop(payload, target, at),
      )
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
}
```

- [ ] **Step 3: The label at the pointer, the cursors, the lit target**

Create `src/components/DragGhost.tsx`:

```tsx
// src/components/DragGhost.tsx
// The label that follows the pointer while tracks are dragged ("3 tracks";
// Interactions spec, Drag and drop). Its CSS also holds the drag's cursor and
// the lit target.
import { createPortal } from 'react-dom'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import './DragGhost.css'

export function DragGhost() {
  const count = useTrackDragStore((state) => state.payload?.tracks.length ?? 0)
  const x = useTrackDragStore((state) => state.x)
  const y = useTrackDragStore((state) => state.y)
  if (count === 0) return null
  return createPortal(
    <div className="drag-ghost" style={{ transform: `translate(${x + 14}px, ${y + 10}px)` }}>
      {count.toLocaleString('en-US')} {count === 1 ? 'track' : 'tracks'}
    </div>,
    document.body,
  )
}
```

Create `src/components/DragGhost.css`:

```css
/* src/components/DragGhost.css
   Dragging tracks (Interactions spec, Drag and drop): the label at the
   pointer, the grabbing cursor (not-allowed where they cannot land), and a
   valid target lit with an accent tint and outline. */

.drag-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10001;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--accent);
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.5);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

html.track-drag,
html.track-drag * {
  cursor: grabbing !important;
  -webkit-user-select: none;
  user-select: none;
}

html.track-drag--refused,
html.track-drag--refused * {
  cursor: not-allowed !important;
}

/* A table's own rows show where the tracks land with a line instead. */
[data-drop-over]:not([data-drop='rows']) {
  background: color-mix(in srgb, transparent, var(--accent) 18%) !important;
  box-shadow: inset 0 0 0 1px var(--accent);
}
```

In `src/components/layout/AppShell.tsx`, replace

```tsx
// AppShell — CSS Grid root layout with sidebar | main / player areas. The
// toasts show over the main area, just above the player.
import type { ReactNode } from 'react'
import { Toaster } from '../Toaster'
import './AppShell.css'

interface AppShellProps {
  sidebar: ReactNode
  main: ReactNode
  player: ReactNode
```

with

```tsx
// AppShell — CSS Grid root layout with sidebar | main / player areas. The
// toasts show over the main area, just above the player; the label of tracks
// being dragged follows the pointer anywhere.
import type { ReactNode } from 'react'
import { Toaster } from '../Toaster'
import { DragGhost } from '../DragGhost'
import './AppShell.css'

interface AppShellProps {
  sidebar: ReactNode
  main: ReactNode
  player: ReactNode
```

In `src/components/layout/AppShell.tsx`, replace

```tsx
      <aside className="app-shell__sidebar">{sidebar}</aside>
      <main className="app-shell__main">
        {main}
        <Toaster />
      </main>
      <div className="app-shell__player">{player}</div>
    </div>
  )
}
```

with

```tsx
      <aside className="app-shell__sidebar">{sidebar}</aside>
      <main className="app-shell__main">
        {main}
        <Toaster />
      </main>
      <div className="app-shell__player">{player}</div>
      <DragGhost />
    </div>
  )
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .` should show no errors, and `npx eslint src/lib/drag src/components/DragGhost.tsx src/components/layout/AppShell.tsx` should print nothing. Commit:

```bash
git add src/lib/drag/trackDrag.ts src/lib/drag/useTrackDrag.ts src/components/DragGhost.tsx src/components/DragGhost.css src/components/layout/AppShell.tsx
git commit -m "feat(ui): the drag layer — pointer events on window, the target under the pointer, lists scroll near their edge, resting opens, Esc cancels, a label follows"
```

---

### Task 5: The table's rows drag

**Files:** Modify `src/components/TrackTable.tsx`, `src/components/TrackTable.css`; create `src/components/track-table/ReorderLine.tsx`.

- [ ] **Step 1: The line in the gap**

Create `src/components/track-table/ReorderLine.tsx`:

```tsx
// src/components/track-table/ReorderLine.tsx
// Where dragged tracks would land in a playlist's own order: a line in the
// gap between rows nearest the pointer (track table spec, Dragging).
import { useTrackDragStore } from '../../lib/drag/trackDrag'

interface ReorderLineProps {
  /** The table's id: the line shows while its own rows are the target. */
  table: string
  /** The gap nearest a pointer's height: 0 above the first row. */
  gapAt: (clientY: number) => number
  rowHeight: number
}

export function ReorderLine({ table, gapAt, rowHeight }: ReorderLineProps) {
  const y = useTrackDragStore((state) =>
    state.target?.kind === 'rows' && state.target.table === table ? state.y : null,
  )
  // A list scrolling under a still pointer moves the gap too.
  useTrackDragStore((state) => state.scrolls)
  if (y === null) return null
  return (
    <div
      className="tt-reorder-line"
      style={{ transform: `translateY(${gapAt(y) * rowHeight - 1}px)` }}
    />
  )
}
```

In `src/components/TrackTable.css`, replace

```css
}

.context-menu > *:last-child,
.context-submenu > *:last-child {
  margin-bottom: 0;
}
```

with

```css
}

.context-menu > *:last-child,
.context-submenu > *:last-child {
  margin-bottom: 0;
}

/* --- Dragging (track table spec, Dragging) --- */

.data-row--dragging {
  opacity: 0.45;
}

/* Where dragged tracks land in a playlist's own order, over the sticky cells. */
.tt-reorder-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  height: 2px;
  border-radius: 1px;
  background: var(--accent);
  pointer-events: none;
}
```

- [ ] **Step 2: The rows as the source, the drop, the dimmed rows, the target**

In `src/components/TrackTable.tsx`, replace

```tsx
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { LibraryFolder, Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
```

with

```tsx
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useImperativeHandle,
  useId,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { LibraryFolder, Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
```

In `src/components/TrackTable.tsx`, replace

```tsx
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { useLibraryFolders } from './track-table/useLibraryFolders'
import { isOverlayOpen, useOverlay } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
```

with

```tsx
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { useLibraryFolders } from './track-table/useLibraryFolders'
import { ReorderLine } from './track-table/ReorderLine'
import { useTrackDrag } from '../lib/drag/useTrackDrag'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import { reorderIds } from '../lib/trackTable/reorder'
import { isOverlayOpen, useOverlay } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
```

In `src/components/TrackTable.tsx`, replace

```tsx
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
  onUpdateTrack?: (track: Track) => void
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>
  onGenerateAIPlaylist?: (track: Track) => void
  onGetPlaylistRecommendations?: (
    playlistId: number,
    playlistName: string,
```

with

```tsx
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
  /** Dragged within a playlist's own order: its new order, as track ids. */
  onReorderPlaylist?: (order: readonly number[]) => void
  onUpdateTrack?: (track: Track) => void
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>
  onGenerateAIPlaylist?: (track: Track) => void
  onGetPlaylistRecommendations?: (
    playlistId: number,
    playlistName: string,
```

In `src/components/TrackTable.tsx`, replace

```tsx
      onAnalyzeTracks,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
      onMoveToFolder,
      onUpdateTrack,
      genreDefinitions = [],
      onGenerateAIPlaylist,
      onGetPlaylistRecommendations,
      onOpenMixPrep,
      onSearch,
```

with

```tsx
      onAnalyzeTracks,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
      onMoveToFolder,
      onReorderPlaylist,
      onUpdateTrack,
      genreDefinitions = [],
      onGenerateAIPlaylist,
      onGetPlaylistRecommendations,
      onOpenMixPrep,
      onSearch,
```

In `src/components/TrackTable.tsx`, replace

```tsx
    // Its tracks left the view (a reload): the menu closes for good.
    if (menuAt && menuTracks.length === 0) setMenuAt(null)
    // Move to folder ▸'s list, read as the menu opens.
    const libraryFolders = useLibraryFolders(menuAt !== null && onMoveToFolder !== undefined)

    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 46,
      overscan: 10,
      scrollMargin: HEADER_HEIGHT,
      // A row moved to with the keys stays out from under the column heads.
      scrollPaddingStart: HEADER_HEIGHT,
    })
```

with

```tsx
    // Its tracks left the view (a reload): the menu closes for good.
    if (menuAt && menuTracks.length === 0) setMenuAt(null)
    // Move to folder ▸'s list, read as the menu opens.
    const libraryFolders = useLibraryFolders(menuAt !== null && onMoveToFolder !== undefined)

    const HEADER_HEIGHT = 30
    const ROW_HEIGHT = 46

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 10,
      scrollMargin: HEADER_HEIGHT,
      // A row moved to with the keys stays out from under the column heads.
      scrollPaddingStart: HEADER_HEIGHT,
    })
```

In `src/components/TrackTable.tsx`, replace

```tsx
        if (index === -1) return
        event.preventDefault()
        onTrackDoubleClick?.(sortedTracks[index], sortedTracks, index)
      }
    }

    // Expose scroll to current track method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToCurrentTrack: () => {
          if (!currentTrack || !parentRef.current) return
```

with

```tsx
        if (index === -1) return
        event.preventDefault()
        onTrackDoubleClick?.(sortedTracks[index], sortedTracks, index)
      }
    }

    // Dragging (track table spec): the selected tracks, or the row pressed, to
    // a playlist or a library folder in the sidebar — or, in a playlist's own
    // order with no search or filter, to another place in it.
    const tableId = useId()
    const canReorder =
      ownOrder && shownSort === null && !narrowed && onReorderPlaylist !== undefined
    // The gap between rows nearest a pointer's height: 0 above the first row.
    const gapAt = (clientY: number) => {
      const area = parentRef.current
      if (!area) return 0
      const y = clientY - area.getBoundingClientRect().top + area.scrollTop - HEADER_HEIGHT
      return Math.max(0, Math.min(sortedTracks.length, Math.round(y / ROW_HEIGHT)))
    }
    const startDrag = useTrackDrag({
      begin: (track) => {
        // A row not selected is dragged alone, selected first.
        const picked = selection.ids.has(track.id)
        if (!picked) setSelection(selectOnly(track.id))
        return {
          tracks: picked ? selectedTracks(selection, sortedTracks) : [track],
          table: tableId,
          reorder: canReorder,
          playlistId: selectedPlaylistId,
        }
      },
      onDrop: (payload, target, at) => {
        if (target.kind === 'playlist') {
          onAddToPlaylist?.(payload.tracks, target.id)
        } else if (target.kind === 'folder') {
          onMoveToFolder?.(payload.tracks, { path: target.path, label: target.name })
        } else {
          const moving = new Set(payload.tracks.map((t) => t.id))
          const order = reorderIds(shownIds, moving, gapAt(at.y))
          if (order !== shownIds) onReorderPlaylist?.(order)
        }
      },
    })
    // The rows being dragged dim.
    const dragged = useTrackDragStore((state) =>
      state.payload?.table === tableId ? state.payload.tracks : null,
    )
    const draggedIds = useMemo(() => new Set(dragged?.map((t) => t.id)), [dragged])

    // Expose scroll to current track method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToCurrentTrack: () => {
          if (!currentTrack || !parentRef.current) return
```

In `src/components/TrackTable.tsx`, replace

```tsx
        {/* Scroll area: header + body scroll together */}
        <div
          ref={parentRef}
          className="track-table-scroll-area"
          tabIndex={0}
          onKeyDown={handleTableKeys}
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <div
```

with

```tsx
        {/* Scroll area: header + body scroll together */}
        <div
          ref={parentRef}
          className="track-table-scroll-area"
          tabIndex={0}
          onKeyDown={handleTableKeys}
          data-drop="rows"
          data-drop-table={tableId}
          data-drop-scroll
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <div
```

In `src/components/TrackTable.tsx`, replace

```tsx
                  track.id === currentTrack.id &&
                  track.file_path === currentTrack.file_path
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selection.ids.has(track.id) ? 'data-row--selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
```

with

```tsx
                  track.id === currentTrack.id &&
                  track.file_path === currentTrack.file_path
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selection.ids.has(track.id) ? 'data-row--selected' : ''} ${draggedIds.has(track.id) ? 'data-row--dragging' : ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
```

In `src/components/TrackTable.tsx`, replace

```tsx
                      transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                    }}
                    // Shift-click selects rows, not the text in them.
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault()
                    }}
                    onClick={(e) => {
                      if (IS_MAC && e.ctrlKey) return // a right-click: the menu has it
                      setSelection((current) =>
                        clickRow(
                          current,
                          track.id,
```

with

```tsx
                      transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                    }}
                    // Shift-click selects rows, not the text in them.
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault()
                    }}
                    onPointerDown={(e) => startDrag(e, track)}
                    onClick={(e) => {
                      if (IS_MAC && e.ctrlKey) return // a right-click: the menu has it
                      setSelection((current) =>
                        clickRow(
                          current,
                          track.id,
```

In `src/components/TrackTable.tsx`, replace

```tsx
                        onRate={rate}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          {sortedTracks.length === 0 && narrowed && !filterPending && (
            <div className="track-table-no-match">
              No tracks match
              {filterActive && onFilterChange && (
```

with

```tsx
                        onRate={rate}
                      />
                    ))}
                  </div>
                )
              })}
              <ReorderLine table={tableId} gapAt={gapAt} rowHeight={ROW_HEIGHT} />
            </div>
          </div>
          {sortedTracks.length === 0 && narrowed && !filterPending && (
            <div className="track-table-no-match">
              No tracks match
              {filterActive && onFilterChange && (
```

- [ ] **Step 3:** `npx tsc --noEmit -p .` should show no errors. `npx eslint src/components/TrackTable.tsx src/components/track-table` should show only the existing `incompatible-library` warning. Commit:

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css src/components/track-table/ReorderLine.tsx
git commit -m "feat(tracks): drag the selected tracks — the rows dim, a line shows where they land in a playlist's own order"
```

---

### Task 6: The sidebar takes them

**Files:** Modify `src/components/FolderTree.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/SidebarFlyout.tsx`, `src/components/layout/SidebarRail.tsx`.

- [ ] **Step 1: Playlists and library folders are targets; closed folders open on a rest**

In `src/components/FolderTree.tsx`, replace

```tsx
import type { Playlist } from '../types/track'
import {
  useFolderTreeStore,
  type FolderNodeData,
} from '../store/folderTreeStore'
import { Icon } from './Icon'
import './FolderTree.css'

// --- Types ---

/** The refresh handle Sidebar exposes (as `folderTreeRef`) for App. */
export interface FolderTreeRef {
  /** Invalidate cached children for the library root containing `affectedPath`
   *  and re-fetch subdirectories from disk. */
```

with

```tsx
import type { Playlist } from '../types/track'
import {
  useFolderTreeStore,
  type FolderNodeData,
} from '../store/folderTreeStore'
import { Icon } from './Icon'
import { registerDropOpener } from '../lib/drag/trackDrag'
import './FolderTree.css'

// Dragged tracks land on a playlist (added) or a library folder (moved);
// resting on a closed folder opens it (Interactions spec, Drag and drop). The
// rows carry data-drop-open only while closed, so these only ever open.
registerDropOpener('playlist-folder', (id) =>
  useFolderTreeStore.getState().togglePlaylistFolder(Number(id)),
)
registerDropOpener('library-root', (path) => void useFolderTreeStore.getState().toggleRoot(path))
registerDropOpener('library-node', (path) => void useFolderTreeStore.getState().toggleNode(path))

// --- Types ---

/** The refresh handle Sidebar exposes (as `folderTreeRef`) for App. */
export interface FolderTreeRef {
  /** Invalidate cached children for the library root containing `affectedPath`
   *  and re-fetch subdirectories from disk. */
```

In `src/components/FolderTree.tsx`, replace

```tsx
    <div className="folder-node">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.info.path)}
        onContextMenu={(e) => onContextMenu(e, node.info.path, node.info.name)}
      >
        <span
          className={`folder-arrow ${hasChildren ? 'has-children' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(node.info.path)
```

with

```tsx
    <div className="folder-node">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.info.path)}
        onContextMenu={(e) => onContextMenu(e, node.info.path, node.info.name)}
        data-drop="folder"
        data-drop-path={node.info.path}
        data-drop-name={node.info.name}
        data-drop-open={hasChildren && !isExpanded ? `library-node:${node.info.path}` : undefined}
      >
        <span
          className={`folder-arrow ${hasChildren ? 'has-children' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(node.info.path)
```

In `src/components/FolderTree.tsx`, replace

```tsx

    return (
      <div key={p.id} className="playlist-node">
        <div
          className={`folder-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            if (isFolder) {
              togglePlaylistFolder(p.id)
            } else {
              onPlaylistSelect(p.id)
            }
```

with

```tsx

    return (
      <div key={p.id} className="playlist-node">
        <div
          className={`folder-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          // A playlist takes dragged tracks; a playlist folder takes none.
          data-drop={isFolder ? 'none' : 'playlist'}
          data-drop-id={isFolder ? undefined : p.id}
          data-drop-open={isFolder && !isExpanded ? `playlist-folder:${p.id}` : undefined}
          onClick={() => {
            if (isFolder) {
              togglePlaylistFolder(p.id)
            } else {
              onPlaylistSelect(p.id)
            }
```

The library root row is in this file twice, once in the section's tree and once in the legacy full tree. Both get the same attributes:

In `src/components/FolderTree.tsx`, replace both occurrences of

```tsx
                  selectedFolder === folderPath && selectedPlaylistId === null

                return (
                  <div key={folderPath} className="folder-root">
                    <div
                      className={`folder-row root-folder ${isRootSelected ? 'selected' : ''}`}
                      onClick={() => onFolderSelect(folderPath)}
                      onContextMenu={(e) =>
                        showContextMenu(e, {
                          type: 'library',
                          folderPath,
                          folderName: name,
```

with

```tsx
                  selectedFolder === folderPath && selectedPlaylistId === null

                return (
                  <div key={folderPath} className="folder-root">
                    <div
                      className={`folder-row root-folder ${isRootSelected ? 'selected' : ''}`}
                      data-drop="folder"
                      data-drop-path={folderPath}
                      data-drop-name={name}
                      data-drop-open={isExpanded ? undefined : `library-root:${folderPath}`}
                      onClick={() => onFolderSelect(folderPath)}
                      onContextMenu={(e) =>
                        showContextMenu(e, {
                          type: 'library',
                          folderPath,
                          folderName: name,
```

- [ ] **Step 2: The lists scroll near their edge**

In `src/components/layout/Sidebar.tsx`, replace

```tsx

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            ref={bodyRef}
            className="sidebar-section__body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              // 0 until measured, so a list never starts at its full height
              // and pushes the headers below it off screen.
              height: height ?? 0,
```

with

```tsx

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            ref={bodyRef}
            className="sidebar-section__body"
            // Scrolls while tracks are dragged near its edge.
            data-drop-scroll
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              // 0 until measured, so a list never starts at its full height
              // and pushes the headers below it off screen.
              height: height ?? 0,
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
          </button>
        ))}
      </div>

      {/* The sections. Only their lists scroll; this area scrolls as a whole
          only when even three rows per open list do not fit. */}
      <div className="sidebar-scroll" ref={areaRef}>
        {/* Folders section */}
        <Section
          section="folders"
          height={heights.folders}
          animateHeight={animate}
          contentRef={contentRef}
```

with

```tsx
          </button>
        ))}
      </div>

      {/* The sections. Only their lists scroll; this area scrolls as a whole
          only when even three rows per open list do not fit. */}
      <div className="sidebar-scroll" ref={areaRef} data-drop-scroll>
        {/* Folders section */}
        <Section
          section="folders"
          height={heights.folders}
          animateHeight={animate}
          contentRef={contentRef}
```

In `src/components/layout/SidebarFlyout.tsx`, replace

```tsx
      className="sidebar-flyout"
      style={{ top, left, maxHeight: window.innerHeight - top - 16 }}
      role="dialog"
      aria-label={title}
    >
      <div className="sidebar-flyout__title">{title}</div>
      <div className="sidebar-flyout__body">{children}</div>
    </div>
  )
}
```

with

```tsx
      className="sidebar-flyout"
      style={{ top, left, maxHeight: window.innerHeight - top - 16 }}
      role="dialog"
      aria-label={title}
    >
      <div className="sidebar-flyout__title">{title}</div>
      <div className="sidebar-flyout__body" data-drop-scroll>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: The collapsed rail's icons open their flyout on a rest**

In `src/components/layout/SidebarRail.tsx`, replace

```tsx
// src/components/layout/SidebarRail.tsx
// The sidebar collapsed to icons: nav items, Folders and Playlists as icons
// that open flyouts, tooltips after a short hover, the profile at the bottom.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { SECTION_LABELS, type SidebarSection } from '../../lib/sidebarPrefs'
import type { FlyoutSection, NavItem } from './sidebarTypes'
import { SidebarFlyout } from './SidebarFlyout'
```

with

```tsx
// src/components/layout/SidebarRail.tsx
// The sidebar collapsed to icons: nav items, Folders and Playlists as icons
// that open flyouts, tooltips after a short hover, the profile at the bottom.
// While tracks are dragged, resting on Folders or Playlists opens its flyout,
// which closes again when the drag ends.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { registerDropOpener, useTrackDragStore } from '../../lib/drag/trackDrag'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { SECTION_LABELS, type SidebarSection } from '../../lib/sidebarPrefs'
import type { FlyoutSection, NavItem } from './sidebarTypes'
import { SidebarFlyout } from './SidebarFlyout'
```

In `src/components/layout/SidebarRail.tsx`, replace

```tsx
    top: number
    left: number
    anchor: HTMLElement
  } | null>(null)
  const closeFlyout = useCallback(() => setFlyout(null), [])

  const toggleFlyout =
    (section: FlyoutSection) => (e: React.MouseEvent<HTMLElement>) => {
      hideTip()
      if (flyout?.section === section) {
        setFlyout(null)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      setFlyout({
        section,
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 320)),
        left: rect.right + 6,
        anchor: e.currentTarget,
      })
    }

  /** `badge`, when above zero, is a small number at the icon's top-right. */
  const sectionButton = (
    section: FlyoutSection,
    label: string,
    glyph: ReactNode,
```

with

```tsx
    top: number
    left: number
    anchor: HTMLElement
  } | null>(null)
  const closeFlyout = useCallback(() => setFlyout(null), [])

  const openFlyout = useCallback((section: FlyoutSection, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setFlyout({
      section,
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 320)),
      left: rect.right + 6,
      anchor,
    })
  }, [])

  const toggleFlyout =
    (section: FlyoutSection) => (e: React.MouseEvent<HTMLElement>) => {
      hideTip()
      if (flyout?.section === section) {
        setFlyout(null)
        return
      }
      openFlyout(section, e.currentTarget)
    }

  // Dragging tracks: resting on Folders or Playlists opens its flyout, so its
  // rows can be dropped on; one opened so closes when the drag ends.
  const openedByDrag = useRef(false)
  useEffect(() => {
    const unregister = registerDropOpener('rail', (section, anchor) => {
      if (section !== 'folders' && section !== 'playlists') return
      clearTimeout(tipTimer.current)
      setTip(null)
      openedByDrag.current = true
      openFlyout(section, anchor)
    })
    const unsubscribe = useTrackDragStore.subscribe((state, previous) => {
      if (state.payload || !previous.payload || !openedByDrag.current) return
      openedByDrag.current = false
      setFlyout(null)
    })
    return () => {
      unregister()
      unsubscribe()
    }
  }, [openFlyout])

  /** `badge`, when above zero, is a small number at the icon's top-right. */
  const sectionButton = (
    section: FlyoutSection,
    label: string,
    glyph: ReactNode,
```

In `src/components/layout/SidebarRail.tsx`, replace

```tsx
    <button
      className={`sidebar-rail__item ${activeSection === section || flyout?.section === section ? 'sidebar-rail__item--active' : ''}`}
      onClick={toggleFlyout(section)}
      onContextMenu={onColourMenu(section, section === 'playlists')}
      onMouseEnter={flyout ? undefined : showTip(label)}
      onMouseLeave={hideTip}
      aria-label={badge != null && badge > 0 ? `${label}, ${badge} new` : label}
      aria-haspopup="dialog"
      aria-expanded={flyout?.section === section}
      type="button"
    >
      {glyph}
```

with

```tsx
    <button
      className={`sidebar-rail__item ${activeSection === section || flyout?.section === section ? 'sidebar-rail__item--active' : ''}`}
      onClick={toggleFlyout(section)}
      onContextMenu={onColourMenu(section, section === 'playlists')}
      onMouseEnter={flyout ? undefined : showTip(label)}
      onMouseLeave={hideTip}
      data-drop-open={
        (section === 'folders' || section === 'playlists') && flyout?.section !== section
          ? `rail:${section}`
          : undefined
      }
      aria-label={badge != null && badge > 0 ? `${label}, ${badge} new` : label}
      aria-haspopup="dialog"
      aria-expanded={flyout?.section === section}
      type="button"
    >
      {glyph}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .` should show no errors, and `npx eslint src/components/FolderTree.tsx src/components/layout` should show only NowPlayingBar's two existing `exhaustive-deps` warnings. Commit:

```bash
git add src/components/FolderTree.tsx src/components/layout/Sidebar.tsx src/components/layout/SidebarFlyout.tsx src/components/layout/SidebarRail.tsx
git commit -m "feat(sidebar): playlists and library folders take dragged tracks; closed folders and the rail's icons open on a rest"
```

---

### Task 7: App reorders the playlist

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1**

In `src/App.tsx`, replace

```tsx
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
      await tauriApi.bulkSetGenre(
        selected.map((t) => t.id),
        genre,
```

with

```tsx
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Dragged to another place in the playlist's own order: shown at once, then
  // stored; Undo puts the order before the drop back.
  async function handleReorderPlaylist(order: readonly number[]) {
    if (selectedPlaylistId == null) return
    const playlistId = selectedPlaylistId
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    const before = tracks.map((t) => t.id)
    const byId = new Map(tracks.map((t) => [t.id, t]))
    setTracks(order.flatMap((id) => byId.get(id) ?? []))
    try {
      await tauriApi.reorderPlaylistTracks(playlistId, [...order])
      toast(`Reordered ${name}`, {
        action: undoing(async () => {
          // The old order; tracks added since keep their places after it.
          const now = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
          const old = new Set(before)
          await tauriApi.reorderPlaylistTracks(playlistId, [
            ...before.filter((id) => now.includes(id)),
            ...now.filter((id) => !old.has(id)),
          ])
        }),
      })
    } catch (err) {
      await loadTracks(null, playlistId)
      toast(`Couldn't reorder ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
      await tauriApi.bulkSetGenre(
        selected.map((t) => t.id),
        genre,
```

In `src/App.tsx`, replace

```tsx
                    onAnalyzeTracks={handleAnalyzeTracks}
                    onAddToPlaylist={handleAddToPlaylist}
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onSetGenre={handleSetGenre}
                    onClearGenre={handleClearGenre}
                    onMoveToFolder={handleMoveToFolder}
                    onUpdateTrack={handleUpdateTrack}
                    genreDefinitions={genreDefinitions}
                    onGenerateAIPlaylist={
                      AI_ENABLED ? handleGenerateAIPlaylist : undefined
                    }
                    onGetPlaylistRecommendations={
```

with

```tsx
                    onAnalyzeTracks={handleAnalyzeTracks}
                    onAddToPlaylist={handleAddToPlaylist}
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onSetGenre={handleSetGenre}
                    onClearGenre={handleClearGenre}
                    onMoveToFolder={handleMoveToFolder}
                    onReorderPlaylist={handleReorderPlaylist}
                    onUpdateTrack={handleUpdateTrack}
                    genreDefinitions={genreDefinitions}
                    onGenerateAIPlaylist={
                      AI_ENABLED ? handleGenerateAIPlaylist : undefined
                    }
                    onGetPlaylistRecommendations={
```

- [ ] **Step 2: Check.** Run these:
  - `npx tsc --noEmit -p .`: no errors;
  - `npx vitest run 2>&1 | grep "Tests "`: `521 passed`;
  - `npx eslint src 2>&1 | grep problems`: `✖ 22 problems (10 errors, 12 warnings)`;
  - `npx vite build 2>&1 | tail -1`: `✓ built in …`.

  Commit:

```bash
git add src/App.tsx
git commit -m "feat(tracks): reorder a playlist by dragging — shown at once, one toast with Undo"
```

---

### Task 8: The specs know what is built

**Files:** Modify `docs/superpowers/specs/2026-10-04-track-table-design.md`, `docs/superpowers/specs/2026-10-04-interactions-design.md`.

- [ ] **Step 1:** The track table spec: a playlist opens in its own order; what plan 6 built.

In `docs/superpowers/specs/2026-10-04-track-table-design.md`, replace

```markdown
per mount), with unknown ids dropped and a column added later appended, hidden.

Clicking a head sorts by it, again reverses; the arrow shows which. Sorting is
otherwise unchanged (Rating sorts descending first). **#** is the row's
position in the list as sorted and filtered, as today, in playlists too.

## Rows

46px high. # · cover · title over artist · the columns. Missing values show
"—".

**The cover** is the file's artwork made into a **72px thumbnail** on the
```

with

```markdown
per mount), with unknown ids dropped and a column added later appended, hidden.

Clicking a head sorts by it, again reverses; the arrow shows which. Sorting is
otherwise unchanged (Rating sorts descending first). **#** is the row's
position in the list as sorted and filtered, as today, in playlists too.

A **playlist opens in its own order** (as stored; no arrow), and the click
after the reversing one goes back to it — so reordering by dragging has an
order to work in. Elsewhere the table still opens by title. (The user's
choice; today a playlist opened by title, so its own order was never shown.)

## Rows

46px high. # · cover · title over artist · the columns. Missing values show
"—".

**The cover** is the file's artwork made into a **72px thumbnail** on the
```

In `docs/superpowers/specs/2026-10-04-track-table-design.md`, replace

```markdown
selects it alone first).

**Dragging** is built by this plan, by the Interactions spec's drag-and-drop
rules: the selection to a playlist (added) or a library folder in the Folders
section (moved) in the sidebar, and reordering inside a playlist's own table
(only with no sort, search or filter) — each with its Undo from that spec's
table.

## Right-click menu

Every item acts on all selected tracks **at once**: the menu passes the list,
App makes one call and shows one toast, and the table reloads once.
- **Add to Playlist ▸** — new `add_tracks_to_playlist(playlist_id, ids)`,
```

with

```markdown
selects it alone first).

**Dragging** is built by this plan, by the Interactions spec's drag-and-drop
rules: the selection to a playlist (added) or a library folder in the Folders
section (moved) in the sidebar, and reordering inside a playlist's own table
(only with no sort, search or filter) — each with its Undo from that spec's
table. (Built by plan 6: the playlist shown and the folder every dragged track
is already in refuse the drop, like the menu greys them; a reorder says
"Reordered Warm Up", with Undo.)

## Right-click menu

Every item acts on all selected tracks **at once**: the menu passes the list,
App makes one call and shows one toast, and the table reloads once.
- **Add to Playlist ▸** — new `add_tracks_to_playlist(playlist_id, ids)`,
```

In `docs/superpowers/specs/2026-10-04-track-table-design.md`, replace

```markdown
| Plays column | new `get_play_counts()`: track id → plays, read when the column is on and again when App's play-version number changes (built here) |
| Adding / removing many | new `add_tracks_to_playlist`, `remove_tracks_from_playlist` |
| Columns | settings `track_table_columns`, through a store |
| Folders for Move to folder | new `list_library_folders()` |
| Moving | new `move_tracks_to_folder(track_ids, folder)` |
| Clear genre for many | new `bulk_clear_genre(track_ids)` |
| Dragging | the Interactions plan's drag layer (`useTrackDrag`, `data-drop-*` targets), wired here |

## Testing

- TypeScript: the filter (each field, BPM edges 124.99 / 125 / 129.99 / 130,
  one-sided BPM, Added in UTC near midnight, combined fields, after the
  search); every label in the label table and "+N"; the column layout (parse,
```

with

```markdown
| Plays column | new `get_play_counts()`: track id → plays, read when the column is on and again when App's play-version number changes (built here) |
| Adding / removing many | new `add_tracks_to_playlist`, `remove_tracks_from_playlist` |
| Columns | settings `track_table_columns`, through a store |
| Folders for Move to folder | new `list_library_folders()` |
| Moving | new `move_tracks_to_folder(track_ids, folder)` |
| Clear genre for many | new `bulk_clear_genre(track_ids)` |
| Dragging | the drag layer (`useTrackDrag`, `startTrackDrag`, `data-drop-*` targets, `DragGhost`), built here by plan 6 to the Interactions spec's rules |

## Testing

- TypeScript: the filter (each field, BPM edges 124.99 / 125 / 129.99 / 130,
  one-sided BPM, Added in UTC near midnight, combined fields, after the
  search); every label in the label table and "+N"; the column layout (parse,
```

- [ ] **Step 2:** The interactions spec: the drag layer is built.

In `docs/superpowers/specs/2026-10-04-interactions-design.md`, replace

```markdown
each page plan wires its own Undo rows, drag sources and targets, and
shortcuts as the tables above say.

Built already by track table plan 4: `Menu` (without the confirm in the
menu's place), `toast()` and the `Toaster` (without the detail on hover,
built by plan 5), and `restore_track_genres` with Set / Clear genre's Undo.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
```

with

```markdown
each page plan wires its own Undo rows, drag sources and targets, and
shortcuts as the tables above say.

Built already by track table plan 4: `Menu` (without the confirm in the
menu's place), `toast()` and the `Toaster` (without the detail on hover,
built by plan 5), and `restore_track_genres` with Set / Clear genre's Undo.
Built by track table plan 6: the whole drag layer (`useTrackDrag`,
`startTrackDrag`, the `data-drop-*` targets and `DragGhost`, in
`src/lib/drag/`), with the track table as the source and the sidebar's
playlists, library folders and rail icons as targets; Home's rows are left
for the Home plan.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
```

- [ ] **Step 3:** Commit only these two files. `git add -A` or `commit -a` would also take `.claude/settings.local.json` and `.planning/STATE.md`:

  ```bash
  git add docs/superpowers/specs/2026-10-04-track-table-design.md docs/superpowers/specs/2026-10-04-interactions-design.md
  git commit -m "docs(spec): a playlist opens in its own order; the drag layer is built"
  ```

---

### Task 9: Check in the app (WebKit)

- [ ] **Step 1:** `npm run tauri dev`.
- [ ] **Step 2: Go through this checklist by hand.** Moving to a folder moves real files, so try that on test tracks.
  - **Onto a playlist:** select 3 tracks in All Tracks and drag them onto a playlist.
    - The label says "3 tracks", the rows dim, and the playlist lights up.
    - The drop gives "Added 3 tracks to …", and Undo removes them.
    - The selection is still the 3 tracks.
  - **One row:** press an unselected row and drag: it is selected alone and dragged.
  - **Onto a folder:** drag onto a library folder in Folders. The files move, as with Move to folder, with that toast and its Undo. The folder they are already in shows not-allowed.
  - **Closed folders:** rest on a closed library folder, then on a playlist folder, for about half a second: each opens, and its child takes the drop.
  - **Reordering:** open a playlist. It shows its own order, with no arrow in the heads.
    - Drag a track down: the line follows, and the drop moves it.
    - "Reordered …" appears; Undo puts the old order back.
    - Sort by BPM: dragging inside shows not-allowed. Click BPM twice more: the playlist's order is back.
    - Typing in the search box also turns reordering off.
  - **Scrolling:** in a long playlist, drag to the bottom edge, and the table scrolls. Do the same at the Playlists list's edge in the sidebar.
  - **The collapsed sidebar** (⌘\\): rest on the Playlists icon, and its flyout opens. Drop on a playlist in it; the flyout closes.
  - **Esc** during a drag cancels it, and nothing else closes.
  - **Clicks still work:** a click, ⌘-click and Shift-click on rows select as before; a double click plays; ▶ and the stars respond and never start a drag.
- [ ] **Step 3:** Commit any fix-ups as `fix(tracks): …`.
