# Track Table 2 of 6: Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every track table gets a **Columns** panel and the new rows:
- the Columns panel: a checkbox per column, ⠿ to reorder, Reset, an Artwork switch, and a right-click on any column head to open it;
- one stored column layout shared by every table;
- column edges that drag to resize, and sideways scrolling with # and the artwork staying put;
- the new columns: Label, Added, Album, Plays, Format · bitrate;
- 46px rows with title over artist and a cover square.

**Architecture:**
- **Pure TypeScript, unit-tested:**
  - `src/lib/trackTable/columns.ts`: which columns exist and the layout (parse, move, show, width, the CSS grid).
  - `cells.ts`: the cell texts.
  - `sort.ts`: sorting, moved out of `TrackTable.tsx`, with the new columns.
- **The layout store:** a small zustand store holds the layout. App reads it once during the splash, because the table remounts on every view. Changes are written to the settings table as `track_table_columns`.
- **The table:** every row and the head use one CSS grid (`--tt-grid`). # and the artwork are `position: sticky`. Each row's tint is a custom property (`--row-bg`) that the sticky cells wear too.
- **Plays:** a new backend command, `get_play_counts`, and App's play-version number feed the Plays column.

**Tech Stack:** React 19, TypeScript, zustand, framer-motion, Vitest (jsdom, no Testing Library), plain CSS; Rust (rusqlite) for one query.

**Spec:** `docs/superpowers/specs/2026-10-04-track-table-design.md`, sections *Columns*, *Rows* and the *Data* rows for Plays and Columns. Mockup: `2026-10-04-track-table-mockup.html`, "Columns panel" and "Rows and the track playing". Read both first.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is now built by six plans.** The second was split, because the rows' artwork and the playing row are their own piece of work:
1. the toolbar and the filter — done;
2. **this plan** — columns, the layout, resizing, sideways scroll, the new columns, Plays and the play-version number, the 46px rows;
3. artwork and the playing row:
   - the real 72px thumbnails, which replace this plan's title gradient for tracks that have artwork;
   - the equalizer in place of the number;
   - ▶ and pause on hover;
4. selecting several, the bulk right-click menu, the toast with Undo;
5. Move to folder;
6. dragging tracks to playlists and folders, and reordering a playlist.

**Decisions, beyond the spec's letter:**
- **No resize edge on Title & artist.** It takes the remaining width, so its edge has nothing to move. Its stored width is its minimum (240px).
- **Plays and Added sort most-first,** like Rating. The spec keeps sorting "otherwise unchanged"; newest-first and most-played-first are the useful first click.
- **A hidden sorted column falls back to Title.** If the column the table is sorted by is hidden, the table sorts by title, and the arrow is never on a missing column.
- **Plays shows "—" for 0,** as the other columns show "—" for nothing.
- **The `table-cell` class is renamed `tt-cell`.** `table-cell` is also a Tailwind utility (`display: table-cell`), emitted in `globals.css`, which loads after every component's CSS. It overrode the cells' `display` (in WebKit the # and the cover sat at the top of the row), and the current table has the same quirk.
- **The popover tells its content how much room there is below its anchor** (`--popover-room`). The Columns list (12 rows) scrolls inside the panel instead of being cut off under a playlist's header on a short window, which the plan 1 review warned about. Genre's list in the Filter panel uses it too.
- **Two plan 1 styles move to shared places:**
  - "Clear all" and "Clear filter" become a shared `.link-btn` in `controls.css`;
  - the panel footer becomes `.popover__footer` in `Popover.css`.
  The Columns panel uses both.

**Checked:** every code block below was applied to a scratch worktree of `feat/redesign` at 8a978d5.
- **Builds and tests:** `tsc`, `eslint` on the touched files (only the existing warnings), the whole `vitest` suite (438 passed), `vite build` and `cargo test --lib play_count` pass.
- **In WebKit** (Playwright on a page rendering only `TrackTable`, 200 tracks, `mockIPC`), at 1280×700:
  - the default heads are Title ▲ · Artist, BPM, Key, Genre, Label, Time, Added;
  - the first row sits right under the head, 46px high;
  - the Columns panel lists 12 columns, Title & artist marked "always";
  - turning on Plays and Album adds them at the end;
  - dragging Genre's ⠿ up two rows puts it after Title (the rows between step aside while dragging);
  - ↓ on Key's focused handle moves it one place, and the handle keeps the focus;
  - Artwork off removes the covers;
  - Esc closes the panel;
  - dragging Genre's head edge 60px makes it 150 → 210px, and the sort is unchanged;
  - Plays sorts most-first;
  - a right-click on the heads opens the panel, and hiding Plays falls back to Title ▲;
  - every change was written to `set_setting`, the drag once on release;
  - at 820px wide the table scrolls sideways (1174 / 820px), and after scrolling 300px, # stays at x 0 and the cover at x 44, in the head too.

  The first pass found two problems, both fixed below: the `table-cell` clash, and a resize drag selecting the heads' text.
- **A plan review found two more, fixed below and re-checked in WebKit:**
  - the last column's resize edge stuck 4px past the grid, so every table could scroll sideways by 4px with its scrollbar showing (now 1280/1280 and 1100/1100);
  - a row dropped upward slid back from where it was let go; the rows now slide only while a drag lasts, so the dropped row lands at once (Genre at 132px, under Title at 104, from the first frame).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/mod.rs` | modify | `get_play_counts()` and its test. |
| `src-tauri/src/commands/dashboard.rs` | modify | `PlayCount` and the `get_play_counts` command. |
| `src-tauri/src/lib.rs` | modify | Register it. |
| `src/lib/tauri-api.ts` | modify | `getPlayCounts()`. |
| `src/lib/trackTable/columns.ts` (+ test) | create | The columns, the layout and its changes, the grid. Pure. |
| `src/lib/trackTable/cells.ts` (+ test) | create | Time, Added, Format · bitrate, the title gradient. Pure. |
| `src/lib/trackTable/sort.ts` (+ test) | create | Sorting, moved out of the table, with Label, Added, Plays. Pure. |
| `src/store/trackTableLayoutStore.ts` (+ test) | create | The layout, read once, written on change. |
| `src/components/Popover.tsx`, `Popover.css` | modify | `--popover-room`; `.popover__footer`. |
| `src/styles/controls.css` | modify | `.link-btn`; `.btn` while its popover is open. |
| `src/components/SelectMenu.css` | modify | The list's height follows the room. |
| `src/components/track-table/FilterPanel.tsx`, `TrackFilter.css` | modify | Use `.popover__footer` and `.link-btn`. |
| `src/components/track-table/usePlayCounts.ts` | create | Reads the plays while the column is on, again on each new play. |
| `src/components/track-table/ColumnsPanel.tsx`, `ColumnsButton.tsx`, `Columns.css` | create | The Columns button and panel. |
| `src/components/track-table/TableHead.tsx` | create | The heads: sort, resize, right-click. |
| `src/components/track-table/TrackCell.tsx` | create | A row's cell for any column. |
| `src/components/TrackTable.tsx`, `TrackTable.css` | modify | The grid, the heads, the cells, the Columns button, sticky # and artwork; `tt-cell`. |
| `src/App.tsx` | modify | Loads the layout during the splash; the play-version number. |

---

### Task 0: Baseline

- [ ] **Step 1: Be on the branch**

```bash
git switch feat/redesign
git status --short --untracked-files=no   # only .claude/settings.local.json and .planning/STATE.md may show; leave them (untracked files are the user's, leave them too)
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass (418), no type errors.

Run: `npx eslint src 2>&1 | tail -2`
Expected: `✖ 22 problems (10 errors, 12 warnings)`. The existing problems. In the files this plan touches, the only ones are two warnings in `App.tsx` (`exhaustive-deps`, ~lines 345 and 350) and one in `TrackTable.tsx` (`incompatible-library` on `useVirtualizer`).

---

### Task 1: Play counts (backend)

**Files:**
- Modify: `src-tauri/src/db/mod.rs` (beside `get_played_track_ids`; the test at the end of `mod tests`)
- Modify: `src-tauri/src/commands/dashboard.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri-api.ts`

- [ ] **Step 1: Write the failing test**

Add at the end of `mod tests` in `src-tauri/src/db/mod.rs`, before the module's closing `}` (the file's last line):

```rust
    #[test]
    fn test_get_play_counts_counts_each_played_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut ids = Vec::new();
        for n in 0..3 {
            let mut track = create_test_track();
            track.file_path = format!("/path/to/counted-{}.mp3", n);
            track.file_hash = format!("counted-{}", n);
            ids.push(db.create_track(&track).unwrap());
        }
        db.record_play_event(ids[2], None).unwrap();
        db.record_play_event(ids[0], Some(7)).unwrap();
        db.record_play_event(ids[2], None).unwrap();
        db.record_play_event(ids[2], Some(7)).unwrap();

        assert_eq!(db.get_play_counts().unwrap(), vec![(ids[0], 1), (ids[2], 3)]);
    }
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd src-tauri && cargo test --lib play_count; cd ..`
Expected: compile error, `no method named get_play_counts`.

- [ ] **Step 3: Add the query**

In `src-tauri/src/db/mod.rs`, directly above `/// Get recently played tracks (joined with track data), ordered by most recent first.`:

```rust
    /// How many times each played track was played, for the track table's
    /// Plays column. Tracks never played are left out.
    pub fn get_play_counts(&self) -> Result<Vec<(i64, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id, COUNT(*) FROM play_history
             WHERE track_id IS NOT NULL
             GROUP BY track_id
             ORDER BY track_id",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect()
    }
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `cd src-tauri && cargo test --lib play_count; cd ..`
Expected: `test db::tests::test_get_play_counts_counts_each_played_track ... ok`.

- [ ] **Step 5: Add the command**

In `src-tauri/src/commands/dashboard.rs`, directly above `#[derive(Debug, Serialize, Deserialize)]` of `pub struct RecentlyAddedTrack {`:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct PlayCount {
    pub track_id: i64,
    pub plays: i64,
}
```

and directly above `#[tauri::command]` of `pub fn get_recently_played(`:

```rust
/// How many times each played track was played (the track table's Plays column).
#[tauri::command]
pub fn get_play_counts(state: State<AppState>) -> Result<Vec<PlayCount>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let rows = db
        .get_play_counts()
        .map_err(|e| AppError::Internal(format!("Failed to count plays: {}", e)))?;
    Ok(rows
        .into_iter()
        .map(|(track_id, plays)| PlayCount { track_id, plays })
        .collect())
}
```

In `src-tauri/src/lib.rs`, after `commands::dashboard::get_played_track_ids,`:

```rust
            commands::dashboard::get_play_counts,
```

In `src/lib/tauri-api.ts`, directly above `async getRecentlyPlayed(limit?: number): Promise<{`:

```ts
  /** Plays per played track (the track table's Plays column). */
  async getPlayCounts(): Promise<{ track_id: number; plays: number }[]> {
    return await invoke('get_play_counts')
  },
```

- [ ] **Step 6: Check it builds, and commit**

Run: `cd src-tauri && cargo build; cd .. && npx tsc --noEmit -p .`
Expected: both succeed.

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/commands/dashboard.rs src-tauri/src/lib.rs src/lib/tauri-api.ts
git commit -m "feat(tracks): get_play_counts counts each played track's plays"
```

---

### Task 2: The columns and the layout

**Files:**
- Create: `src/lib/trackTable/columns.ts`
- Test: `src/lib/trackTable/columns.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/columns.test.ts
import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  defaultLayout,
  gridTemplate,
  moveColumn,
  parseLayout,
  setColumnShown,
  setColumnWidth,
  shownColumns,
  type TrackTableLayout,
} from './columns'

const ids = (layout: TrackTableLayout) => layout.columns.map((c) => c.id)
const shownIds = (layout: TrackTableLayout) => shownColumns(layout).map((c) => c.id)

describe('the default layout', () => {
  it('shows Title & artist, BPM, Key, Genre, Label, Time and Added, with artwork', () => {
    const layout = defaultLayout()
    expect(layout.artwork).toBe(true)
    expect(shownIds(layout)).toEqual(['title', 'bpm', 'key', 'genre', 'label', 'time', 'added'])
    expect(ids(layout)).toEqual(COLUMNS.map((c) => c.id))
  })
})

describe('reading the stored layout', () => {
  it('keeps the stored order, shown flags, widths and artwork', () => {
    const stored = {
      artwork: false,
      columns: [
        { id: 'genre', shown: true, width: 200 },
        { id: 'title', shown: true, width: 300 },
        { id: 'bpm', shown: false, width: 72 },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(layout.artwork).toBe(false)
    expect(ids(layout).slice(0, 3)).toEqual(['genre', 'title', 'bpm'])
    expect(layout.columns[0]).toEqual({ id: 'genre', shown: true, width: 200 })
    expect(layout.columns[2].shown).toBe(false)
  })

  it('drops unknown ids and repeats', () => {
    const stored = {
      artwork: true,
      columns: [
        { id: 'mood', shown: true, width: 90 },
        { id: 'bpm', shown: true, width: 72 },
        { id: 'bpm', shown: false, width: 90 },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(ids(layout)).not.toContain('mood')
    expect(ids(layout).filter((id) => id === 'bpm')).toHaveLength(1)
    expect(layout.columns[0]).toEqual({ id: 'bpm', shown: true, width: 72 })
  })

  it('appends a column added since, hidden', () => {
    const stored = { artwork: true, columns: [{ id: 'title', shown: true, width: 240 }] }
    const layout = parseLayout(JSON.stringify(stored))
    expect(ids(layout)).toEqual(COLUMNS.map((c) => c.id))
    expect(shownIds(layout)).toEqual(['title'])
  })

  it('always shows Title & artist', () => {
    const stored = { artwork: true, columns: [{ id: 'title', shown: false, width: 240 }] }
    expect(parseLayout(JSON.stringify(stored)).columns[0].shown).toBe(true)
  })

  it('raises a width under the minimum and fills a missing one', () => {
    const stored = {
      artwork: true,
      columns: [
        { id: 'genre', shown: true, width: 10 },
        { id: 'label', shown: true },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(layout.columns[0].width).toBe(80)
    expect(layout.columns[1].width).toBe(160)
  })

  it('gives the default for nothing stored or anything unreadable', () => {
    expect(parseLayout(null)).toEqual(defaultLayout())
    expect(parseLayout('not json')).toEqual(defaultLayout())
    expect(parseLayout('{"columns": 3}')).toEqual(defaultLayout())
  })
})

describe('changing the layout', () => {
  it('moves a column', () => {
    const layout = moveColumn(defaultLayout(), 3, 1)
    expect(ids(layout).slice(0, 4)).toEqual(['title', 'genre', 'bpm', 'key'])
  })

  it('keeps a move inside the list', () => {
    const layout = defaultLayout()
    expect(ids(moveColumn(layout, 0, 99)).at(-1)).toBe('title')
    expect(moveColumn(layout, 2, 2)).toBe(layout)
  })

  it('shows and hides a column, but not Title & artist', () => {
    const layout = setColumnShown(defaultLayout(), 'plays', true)
    expect(shownIds(layout)).toContain('plays')
    expect(shownIds(setColumnShown(layout, 'plays', false))).not.toContain('plays')
    expect(shownIds(setColumnShown(layout, 'title', false))).toContain('title')
  })

  it('never makes a column narrower than its minimum', () => {
    const layout = setColumnWidth(defaultLayout(), 'genre', 20)
    expect(layout.columns.find((c) => c.id === 'genre')!.width).toBe(80)
  })

  it('goes back to the default on Reset', () => {
    const changed = setColumnShown(moveColumn(defaultLayout(), 3, 1), 'album', true)
    expect(changed).not.toEqual(defaultLayout())
    expect(defaultLayout()).toEqual(parseLayout(null))
  })
})

describe('the grid', () => {
  it('lays out #, the artwork and the shown columns, Title & artist taking the rest', () => {
    const { template, minWidth } = gridTemplate(defaultLayout())
    expect(template).toBe('44px 48px minmax(240px, 1fr) 72px 56px 150px 160px 64px 96px')
    expect(minWidth).toBe(44 + 48 + 240 + 72 + 56 + 150 + 160 + 64 + 96)
  })

  it('leaves the artwork out when it is off', () => {
    const { template } = gridTemplate({ ...defaultLayout(), artwork: false })
    expect(template.startsWith('44px minmax(240px, 1fr)')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/columns.test.ts`
Expected: FAIL — `Failed to resolve import "./columns"`.

- [ ] **Step 3: Write the columns**

```ts
// src/lib/trackTable/columns.ts
// The track table's columns (track table spec, Columns): which exist, their
// defaults, and the one layout every track table shares — order, shown or
// hidden, widths, and the artwork switch. Stored in the settings table.

export type ColumnId =
  | 'title'
  | 'bpm'
  | 'key'
  | 'genre'
  | 'label'
  | 'time'
  | 'added'
  | 'album'
  | 'rating'
  | 'comment'
  | 'plays'
  | 'format'

export interface ColumnDef {
  id: ColumnId
  /** In the Columns panel. */
  name: string
  /** In the column head. */
  head: string
  shownByDefault: boolean
  /** Pixels. Title & artist's is its minimum: it takes the remaining width. */
  width: number
  minWidth: number
  align: 'start' | 'end'
}

/** In their default order. */
export const COLUMNS: readonly ColumnDef[] = [
  { id: 'title', name: 'Title & artist', head: 'Title', shownByDefault: true, width: 240, minWidth: 240, align: 'start' },
  { id: 'bpm', name: 'BPM', head: 'BPM', shownByDefault: true, width: 72, minWidth: 56, align: 'end' },
  { id: 'key', name: 'Key', head: 'Key', shownByDefault: true, width: 56, minWidth: 48, align: 'start' },
  { id: 'genre', name: 'Genre', head: 'Genre', shownByDefault: true, width: 150, minWidth: 80, align: 'start' },
  { id: 'label', name: 'Label', head: 'Label', shownByDefault: true, width: 160, minWidth: 80, align: 'start' },
  { id: 'time', name: 'Time', head: 'Time', shownByDefault: true, width: 64, minWidth: 56, align: 'end' },
  { id: 'added', name: 'Added', head: 'Added', shownByDefault: true, width: 96, minWidth: 80, align: 'start' },
  { id: 'album', name: 'Album', head: 'Album', shownByDefault: false, width: 180, minWidth: 80, align: 'start' },
  { id: 'rating', name: 'Rating', head: 'Rating', shownByDefault: false, width: 104, minWidth: 104, align: 'start' },
  { id: 'comment', name: 'Comment', head: 'Comment', shownByDefault: false, width: 180, minWidth: 80, align: 'start' },
  { id: 'plays', name: 'Plays', head: 'Plays', shownByDefault: false, width: 64, minWidth: 56, align: 'end' },
  { id: 'format', name: 'Format · bitrate', head: 'Format', shownByDefault: false, width: 104, minWidth: 80, align: 'start' },
]

const BY_ID = new Map(COLUMNS.map((column) => [column.id, column]))

export function columnDef(id: ColumnId): ColumnDef {
  return BY_ID.get(id)!
}

export interface ColumnLayout {
  id: ColumnId
  shown: boolean
  width: number
}

export interface TrackTableLayout {
  artwork: boolean
  /** Every column, in the panel's order; a hidden one keeps its place. */
  columns: ColumnLayout[]
}

/** The settings table's key. */
export const LAYOUT_SETTING = 'track_table_columns'

/** The # column's width; the artwork's, when on. */
export const INDEX_WIDTH = 44
export const ARTWORK_WIDTH = 48

export function defaultLayout(): TrackTableLayout {
  return {
    artwork: true,
    columns: COLUMNS.map((column) => ({
      id: column.id,
      shown: column.shownByDefault,
      width: column.width,
    })),
  }
}

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && BY_ID.has(value as ColumnId)
}

/**
 * The stored layout, made safe: unknown ids are dropped, a column the app
 * gained since is appended hidden, a width under the minimum is raised to
 * it, Title & artist is always shown. Anything unreadable gives the default.
 */
export function parseLayout(json: string | null): TrackTableLayout {
  if (!json) return defaultLayout()
  let stored: unknown
  try {
    stored = JSON.parse(json)
  } catch {
    return defaultLayout()
  }
  if (typeof stored !== 'object' || stored === null) return defaultLayout()
  const { artwork, columns } = stored as { artwork?: unknown; columns?: unknown }
  if (!Array.isArray(columns)) return defaultLayout()

  const seen = new Set<ColumnId>()
  const parsed: ColumnLayout[] = []
  for (const entry of columns) {
    if (typeof entry !== 'object' || entry === null) continue
    const { id, shown, width } = entry as { id?: unknown; shown?: unknown; width?: unknown }
    if (!isColumnId(id) || seen.has(id)) continue
    seen.add(id)
    const def = columnDef(id)
    parsed.push({
      id,
      shown: id === 'title' || (typeof shown === 'boolean' ? shown : def.shownByDefault),
      width:
        typeof width === 'number' && Number.isFinite(width)
          ? Math.max(def.minWidth, Math.round(width))
          : def.width,
    })
  }
  for (const def of COLUMNS) {
    if (!seen.has(def.id)) {
      parsed.push({ id: def.id, shown: def.id === 'title', width: def.width })
    }
  }
  return { artwork: typeof artwork === 'boolean' ? artwork : true, columns: parsed }
}

/** Moves the column at `from` to `to` (indexes in `layout.columns`). */
export function moveColumn(layout: TrackTableLayout, from: number, to: number): TrackTableLayout {
  const last = layout.columns.length - 1
  const target = Math.max(0, Math.min(last, to))
  if (from === target || from < 0 || from > last) return layout
  const columns = [...layout.columns]
  const [moved] = columns.splice(from, 1)
  columns.splice(target, 0, moved)
  return { ...layout, columns }
}

/** Shows or hides a column; Title & artist stays shown. */
export function setColumnShown(
  layout: TrackTableLayout,
  id: ColumnId,
  shown: boolean,
): TrackTableLayout {
  if (id === 'title') return layout
  return {
    ...layout,
    columns: layout.columns.map((column) => (column.id === id ? { ...column, shown } : column)),
  }
}

/** A column's width, never under its minimum. */
export function setColumnWidth(
  layout: TrackTableLayout,
  id: ColumnId,
  width: number,
): TrackTableLayout {
  const min = columnDef(id).minWidth
  return {
    ...layout,
    columns: layout.columns.map((column) =>
      column.id === id ? { ...column, width: Math.max(min, Math.round(width)) } : column,
    ),
  }
}

export function shownColumns(layout: TrackTableLayout): ColumnLayout[] {
  return layout.columns.filter((column) => column.shown)
}

/**
 * The grid every row and the head use: #, the artwork when on, then the shown
 * columns, Title & artist taking what is left. `minWidth` is the sum: past
 * it, the table scrolls sideways.
 */
export function gridTemplate(layout: TrackTableLayout): { template: string; minWidth: number } {
  const parts = [`${INDEX_WIDTH}px`]
  let minWidth = INDEX_WIDTH
  if (layout.artwork) {
    parts.push(`${ARTWORK_WIDTH}px`)
    minWidth += ARTWORK_WIDTH
  }
  for (const column of shownColumns(layout)) {
    parts.push(column.id === 'title' ? `minmax(${column.width}px, 1fr)` : `${column.width}px`)
    minWidth += column.width
  }
  return { template: parts.join(' '), minWidth }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/columns.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/columns.ts src/lib/trackTable/columns.test.ts
git commit -m "feat(tracks): the track table's columns and the one layout every table shares"
```

---

### Task 3: The cells' texts

**Files:**
- Create: `src/lib/trackTable/cells.ts`
- Test: `src/lib/trackTable/cells.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/cells.test.ts
import { describe, expect, it } from 'vitest'
import { formatAdded, formatFormat, formatTime, titleGradient } from './cells'

// The stored form of a local time: SQLite's UTC "YYYY-MM-DD HH:MM:SS".
const stored = (local: Date) => local.toISOString().slice(0, 19).replace('T', ' ')

describe('the Added column', () => {
  const now = new Date(2026, 9, 4, 0, 30).getTime() // 00:30 local, Oct 4

  it('says today for the same local day', () => {
    expect(formatAdded(stored(new Date(2026, 9, 4, 0, 5)), now)).toBe('today')
  })

  it('says yesterday for the local day before, even minutes ago', () => {
    expect(formatAdded(stored(new Date(2026, 9, 3, 23, 50)), now)).toBe('yesterday')
    expect(formatAdded(stored(new Date(2026, 9, 3, 0, 1)), now)).toBe('yesterday')
  })

  it('gives the month and day earlier this year', () => {
    expect(formatAdded(stored(new Date(2026, 9, 2, 12, 0)), now)).toBe('Oct 2')
  })

  it('adds the year for another year', () => {
    expect(formatAdded(stored(new Date(2025, 9, 2, 12, 0)), now)).toBe('Oct 2, 2025')
  })

  it('shows a dash with no date', () => {
    expect(formatAdded(undefined, now)).toBe('—')
  })
})

describe('the other cells', () => {
  it('shows the time as m:ss', () => {
    expect(formatTime(392_000)).toBe('6:32')
    expect(formatTime(65_400)).toBe('1:05')
    expect(formatTime(undefined)).toBe('—')
  })

  it('shows the format and bitrate', () => {
    expect(formatFormat('MP3', 320)).toBe('mp3 · 320')
    expect(formatFormat('wav', undefined)).toBe('wav')
    expect(formatFormat(undefined, 320)).toBe('—')
  })

  it('gives the same title the same cover, and others another', () => {
    expect(titleGradient('Juz Listen')).toBe(titleGradient('Juz Listen'))
    expect(titleGradient('Juz Listen')).not.toBe(titleGradient('Voayeur'))
    expect(titleGradient(undefined)).toMatch(/^linear-gradient\(135deg/)
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/cells.test.ts`
Expected: FAIL — `Failed to resolve import "./cells"`.

- [ ] **Step 3: Write the cells**

```ts
// src/lib/trackTable/cells.ts
// What the track table's cells show (track table spec, Columns and Rows).
import { parseUtcDate } from './filter'

/** Shown for a missing value. */
export const MISSING = '—'

/** m:ss. */
export function formatTime(ms: number | undefined): string {
  if (!ms) return MISSING
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function localDay(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * "today", "yesterday", "Oct 2", or "Oct 2, 2025" in another year, by the
 * local day of the stored UTC time.
 */
export function formatAdded(dateAdded: string | undefined, now: number = Date.now()): string {
  const added = parseUtcDate(dateAdded)
  if (added === null) return MISSING
  const days = Math.round((localDay(now) - localDay(added)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  const sameYear = new Date(added).getFullYear() === new Date(now).getFullYear()
  return new Date(added).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "mp3 · 320". */
export function formatFormat(format: string | undefined, bitrate: number | undefined): string {
  if (!format) return MISSING
  const name = format.toLowerCase()
  return bitrate ? `${name} · ${bitrate}` : name
}

/**
 * A cover for a track without artwork: a diagonal gradient whose hue comes
 * from the title, so the same track always gets the same one.
 */
export function titleGradient(title: string | undefined): string {
  let hash = 0
  for (const char of title ?? '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 25) % 360} 65% 18%))`
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/cells.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/cells.ts src/lib/trackTable/cells.test.ts
git commit -m "feat(tracks): the cells' texts — Added, Time, Format · bitrate — and a cover gradient from the title"
```

---

### Task 4: Sorting

`TrackTable.tsx` sorts inline today. This moves the same rules to a pure module, adds Label, Added and Plays, and lets the table fall back to Title when the sorted column is hidden. Task 9 switches the table over.

**Files:**
- Create: `src/lib/trackTable/sort.ts`
- Test: `src/lib/trackTable/sort.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/sort.test.ts
import { describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import { defaultLayout, setColumnShown } from './columns'
import { DEFAULT_SORT, nextSort, sortTracks, visibleSort } from './sort'

let nextId = 1
function track(fields: Partial<Track> = {}): Track {
  const id = nextId++
  return { id, file_path: `/m/${id}.mp3`, file_hash: `h${id}`, play_count: 0, rating: 0, ...fields }
}

describe('clicking a head', () => {
  it('sorts a new column ascending, and reverses on the second click', () => {
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
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout).column).toBe('bpm')
    expect(visibleSort({ column: 'artist', direction: 'asc' }, layout).column).toBe('artist')
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
      sortTracks(tracks, { column: 'label', direction }, null).map((t) => t.label)
    expect(labels('asc')).toEqual(['a', 'B', undefined])
    expect(labels('desc')).toEqual(['B', 'a', undefined])
  })

  it('sorts by plays, unplayed last', () => {
    const a = track()
    const b = track()
    const c = track()
    const plays = new Map([
      [a.id, 2],
      [c.id, 5],
    ])
    expect(sortTracks([a, b, c], { column: 'plays', direction: 'desc' }, plays)).toEqual([c, a, b])
  })

  it('sorts by the date added', () => {
    const old = track({ date_added: '2025-01-02 10:00:00' })
    const fresh = track({ date_added: '2026-10-03 09:00:00' })
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
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/sort.test.ts`
Expected: FAIL — `Failed to resolve import "./sort"`.

- [ ] **Step 3: Write the sort**

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
  | 'album'
  | 'bpm'
  | 'key'
  | 'genre'
  | 'duration'
  | 'format'
  | 'rating'
  | 'comment'
  | 'label'
  | 'added'
  | 'plays'

export interface SortState {
  column: SortColumn
  direction: 'asc' | 'desc'
}

export const DEFAULT_SORT: SortState = { column: 'title', direction: 'asc' }

/** What each column's head sorts by; Title & artist's "Artist" sorts by artist. */
export const SORT_BY_COLUMN: Record<ColumnId, SortColumn> = {
  title: 'title',
  bpm: 'bpm',
  key: 'key',
  genre: 'genre',
  label: 'label',
  time: 'duration',
  added: 'added',
  album: 'album',
  rating: 'rating',
  comment: 'comment',
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
): string | number {
  switch (column) {
    case 'title':
      return track.title?.toLowerCase() ?? ''
    case 'artist':
      return track.artist?.toLowerCase() ?? ''
    case 'album':
      return track.album?.toLowerCase() ?? ''
    case 'bpm':
      return track.bpm ?? 0
    case 'key':
      return (track.musical_key ?? '').toLowerCase()
    case 'genre':
      return (track.genre ?? '').toLowerCase()
    case 'duration':
      return track.duration_ms ?? 0
    case 'format':
      return track.file_format?.toLowerCase() ?? ''
    case 'rating':
      return track.rating ?? 0
    case 'comment':
      return (track.comment ?? '').toLowerCase()
    case 'label':
      return (track.label ?? '').toLowerCase()
    case 'added':
      // "YYYY-MM-DD HH:MM:SS" sorts as text.
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
      if (valueA === '' && valueB !== '') return 1
      if (valueA !== '' && valueB === '') return -1
      return valueA.localeCompare(valueB) * direction
    }
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      // 0 (empty) stays at the bottom whichever the direction.
      if (valueA === 0 && valueB !== 0) return 1
      if (valueA !== 0 && valueB === 0) return -1
      return (valueA - valueB) * direction
    }
    return 0
  })
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/sort.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/sort.ts src/lib/trackTable/sort.test.ts
git commit -m "feat(tracks): sorting moves out of the table, with Label, Added and Plays"
```

---

### Task 5: The layout store, read during the splash

**Files:**
- Create: `src/store/trackTableLayoutStore.ts`
- Test: `src/store/trackTableLayoutStore.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// src/store/trackTableLayoutStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tauriApi } from '../lib/tauri-api'
import { LAYOUT_SETTING, defaultLayout, setColumnShown } from '../lib/trackTable/columns'
import { useTrackTableLayout } from './trackTableLayoutStore'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getSetting: vi.fn(),
    setSetting: vi.fn().mockResolvedValue(undefined),
  },
}))

const getSetting = vi.mocked(tauriApi.getSetting)
const setSetting = vi.mocked(tauriApi.setSetting)

beforeEach(() => {
  getSetting.mockReset()
  setSetting.mockClear()
  useTrackTableLayout.setState({ layout: defaultLayout() })
})

describe('the column layout store', () => {
  it('reads the stored layout', async () => {
    const stored = setColumnShown(defaultLayout(), 'plays', true)
    getSetting.mockResolvedValue(JSON.stringify(stored))
    await useTrackTableLayout.getState().load()
    expect(getSetting).toHaveBeenCalledWith(LAYOUT_SETTING)
    expect(useTrackTableLayout.getState().layout).toEqual(stored)
  })

  it('keeps the default when nothing is stored or the read fails', async () => {
    getSetting.mockResolvedValue(null)
    await useTrackTableLayout.getState().load()
    expect(useTrackTableLayout.getState().layout).toEqual(defaultLayout())

    getSetting.mockRejectedValue(new Error('no database'))
    await useTrackTableLayout.getState().load()
    expect(useTrackTableLayout.getState().layout).toEqual(defaultLayout())
  })

  it('writes a change to the settings table', () => {
    const next = setColumnShown(defaultLayout(), 'album', true)
    useTrackTableLayout.getState().setLayout(next)
    expect(useTrackTableLayout.getState().layout).toEqual(next)
    expect(setSetting).toHaveBeenCalledWith(LAYOUT_SETTING, JSON.stringify(next))
  })

  it('only shows a change made while dragging, and writes it when asked', () => {
    const next = setColumnShown(defaultLayout(), 'album', true)
    useTrackTableLayout.getState().setLayout(next, false)
    expect(setSetting).not.toHaveBeenCalled()
    useTrackTableLayout.getState().save()
    expect(setSetting).toHaveBeenCalledWith(LAYOUT_SETTING, JSON.stringify(next))
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/store/trackTableLayoutStore.test.ts`
Expected: FAIL — `Failed to resolve import "./trackTableLayoutStore"`.

- [ ] **Step 3: Write the store**

```ts
// src/store/trackTableLayoutStore.ts
// The track table's column layout (lib/trackTable/columns.ts), read once at
// start-up: every view change remounts the table, so it must not read the
// settings table itself. Changes are written back.
import { create } from 'zustand'
import { tauriApi } from '../lib/tauri-api'
import {
  LAYOUT_SETTING,
  defaultLayout,
  parseLayout,
  type TrackTableLayout,
} from '../lib/trackTable/columns'

interface TrackTableLayoutState {
  layout: TrackTableLayout
  /** Reads the stored layout; App calls it once, during the splash. */
  load: () => Promise<void>
  /**
   * Shows `layout` and writes it to the settings table, unless `persist` is
   * false: while a column edge is dragged, every move only shows.
   */
  setLayout: (layout: TrackTableLayout, persist?: boolean) => void
  /** Writes the layout shown, e.g. when a drag ends. */
  save: () => void
}

export const useTrackTableLayout = create<TrackTableLayoutState>((set, get) => ({
  layout: defaultLayout(),

  load: async () => {
    try {
      set({ layout: parseLayout(await tauriApi.getSetting(LAYOUT_SETTING)) })
    } catch (err) {
      console.warn('[TrackTable] Failed to read the column layout:', err)
    }
  },

  setLayout: (layout, persist = true) => {
    set({ layout })
    if (persist) get().save()
  },

  save: () => {
    tauriApi
      .setSetting(LAYOUT_SETTING, JSON.stringify(get().layout))
      .catch((err) => console.warn('[TrackTable] Failed to save the column layout:', err))
  },
}))
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/store/trackTableLayoutStore.test.ts`
Expected: PASS, 4 tests (the read failure test logs a warning; that is expected).

- [ ] **Step 5: App reads it during the splash**

In `src/App.tsx`, after `import { useFolderTreeStore } from './store/folderTreeStore'` add:

```tsx
import { useTrackTableLayout } from './store/trackTableLayoutStore'
```

and replace

```tsx
      await tauriApi.initDatabase(dbPath)
      setDbReady(true)
```

with

```tsx
      await tauriApi.initDatabase(dbPath)
      setDbReady(true)

      // The track table's columns, before any table shows (no flash of the
      // default layout); the table remounts on every view, so it reads them here.
      await useTrackTableLayout.getState().load()
```

- [ ] **Step 6: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/store/trackTableLayoutStore.ts src/store/trackTableLayoutStore.test.ts && npx eslint src/App.tsx`
Expected: no type errors; the store files clean; `App.tsx` only its two existing warnings.

```bash
git add src/store/trackTableLayoutStore.ts src/store/trackTableLayoutStore.test.ts src/App.tsx
git commit -m "feat(tracks): the column layout lives in a store, read once during the splash"
```

---

### Task 6: Shared popover and link styles

Plan 1's popover learns how much room it has, and two of its styles become shared ones, which the Columns panel uses next.

**Files:**
- Modify: `src/components/Popover.tsx`, `src/components/Popover.css`
- Modify: `src/styles/controls.css`
- Modify: `src/components/SelectMenu.css`
- Modify: `src/components/track-table/FilterPanel.tsx`, `src/components/track-table/TrackFilter.css`
- Modify: `src/components/TrackTable.tsx`, `src/components/TrackTable.css` (the "Clear filter" link only)

- [ ] **Step 1: The popover measures its room**

In `src/components/Popover.tsx` replace

```tsx
// useOverlay, so Esc closes it; so does a press outside its anchor.
import { useEffect, type ReactNode, type RefObject } from 'react'
```

with

```tsx
// useOverlay, so Esc closes it; so does a press outside its anchor. It tells
// its content how much room there is under the anchor (--popover-room), so a
// tall list can scroll inside it instead of being cut off.
import { useCallback, useEffect, type ReactNode, type RefObject } from 'react'
```

directly above `interface PopoverProps {` add

```tsx
// The height from just under the anchor to the nearest edge that clips it:
// the window, or an ancestor that does not let content overflow.
function roomBelow(anchor: HTMLElement): number {
  const top = anchor.getBoundingClientRect().bottom + 6
  let bottom = window.innerHeight
  for (let el = anchor.parentElement; el; el = el.parentElement) {
    if (getComputedStyle(el).overflowY !== 'visible') {
      bottom = Math.min(bottom, el.getBoundingClientRect().bottom)
    }
  }
  return Math.max(120, Math.floor(bottom - top - 8))
}
```

replace

```tsx
  const reduceMotion = useReducedMotion()
  useOverlay(open, onClose)
```

with

```tsx
  const reduceMotion = useReducedMotion()
  useOverlay(open, onClose)

  const measure = useCallback(
    (panel: HTMLDivElement | null) => {
      if (panel && anchorRef.current) {
        panel.style.setProperty('--popover-room', `${roomBelow(anchorRef.current)}px`)
      }
    },
    [anchorRef],
  )
```

and replace

```tsx
        <motion.div
          role="dialog"
```

with

```tsx
        <motion.div
          ref={measure}
          role="dialog"
```

At the end of `src/components/Popover.css` add:

```css
.popover__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 2: Shared link button; a button whose popover is open**

In `src/styles/controls.css`, directly above `.btn:focus-visible {` add:

```css
.btn[aria-expanded='true'] {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 10%);
  color: var(--text-primary);
}

```

and directly above `/* Segmented control: follows the buttons */` add:

```css
/* A button that reads as a link: Clear all, Reset */
.link-btn {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease);
}

.link-btn:hover {
  color: var(--text-primary);
}

.link-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: The select list follows the room**

In `src/components/SelectMenu.css` replace

```css
.select-menu__options {
  max-height: 220px;
```

with

```css
.select-menu__options {
  /* The popover's room under the box, less the search box; 220px at most. */
  max-height: min(220px, calc(var(--popover-room, 264px) - 44px));
```

- [ ] **Step 4: The filter uses the shared styles**

In `src/components/track-table/FilterPanel.tsx` replace

```tsx
      <div className="tt-filter-footer">
        <button type="button" className="tt-filter-link" onClick={() => onChange(null)}>
```

with

```tsx
      <div className="popover__footer">
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
```

In `src/components/TrackTable.tsx` replace

```tsx
                    className="tt-filter-link"
```

with

```tsx
                    className="link-btn"
```

In `src/components/track-table/TrackFilter.css` delete the `.tt-filter-footer` rule, the four `.tt-filter-link` rules (base, `:hover`, `:focus-visible`, and `.track-table-no-match .tt-filter-link` with its comment). The file now ends with the `.tt-filter-range` rule.

In `src/components/TrackTable.css` replace

```css
.track-table-no-match {
  padding: 48px 16px;
  color: var(--text-secondary);
  font-size: var(--text-base);
  text-align: center;
}
```

with

```css
.track-table-no-match {
  padding: 48px 16px;
  color: var(--text-secondary);
  font-size: var(--text-base);
  text-align: center;
}

.track-table-no-match .link-btn {
  color: var(--accent-hover);
}
```

Run: `grep -rn "tt-filter-link\|tt-filter-footer" src`
Expected: no output.

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/Popover.tsx src/components/track-table/FilterPanel.tsx`
Expected: no errors, no warnings.

```bash
git add src/components/Popover.tsx src/components/Popover.css src/styles/controls.css src/components/SelectMenu.css src/components/track-table/FilterPanel.tsx src/components/track-table/TrackFilter.css src/components/TrackTable.tsx src/components/TrackTable.css
git commit -m "refactor(ui): a popover knows its room below; link buttons and popover footers are shared"
```

---

### Task 7: The Columns button and panel

No unit test for the components (the repo has no Testing Library); the rules they use are tested in Tasks 2 and 5, and Task 10 checks them in the app.

**Files:**
- Create: `src/components/track-table/usePlayCounts.ts`
- Create: `src/components/track-table/ColumnsPanel.tsx`, `ColumnsButton.tsx`, `Columns.css`

- [ ] **Step 1: Read the plays while the column is on**

```ts
// src/components/track-table/usePlayCounts.ts
// Plays per track for the Plays column, read while it is wanted and again
// each time App's play-version number changes (a play was recorded).
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'

export function usePlayCounts(
  wanted: boolean,
  playVersion: number,
): ReadonlyMap<number, number> | null {
  const [counts, setCounts] = useState<ReadonlyMap<number, number> | null>(null)

  useEffect(() => {
    if (!wanted) return
    let current = true
    tauriApi
      .getPlayCounts()
      .then((rows) => {
        if (current) setCounts(new Map(rows.map((row) => [row.track_id, row.plays])))
      })
      .catch((err) => console.warn('[TrackTable] Failed to count plays:', err))
    return () => {
      current = false
    }
  }, [wanted, playVersion])

  return wanted ? counts : null
}
```

- [ ] **Step 2: The panel**

It reuses the settings' `ToggleSwitch` (its styles load with the Settings view, which App imports).

```tsx
// src/components/track-table/ColumnsPanel.tsx
// The Columns panel (track table spec): a checkbox per column, ⠿ to drag a
// column to another place (or ↑ ↓ on the focused handle), Reset, and the
// Artwork switch. # and the artwork are not in the list.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  columnDef,
  defaultLayout,
  moveColumn,
  setColumnShown,
  type ColumnId,
  type TrackTableLayout,
} from '../../lib/trackTable/columns'
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'

/** Each row's height, in CSS too: a drag moves a column one row per this. */
const ROW_HEIGHT = 28

interface ColumnsPanelProps {
  layout: TrackTableLayout
  onChange: (layout: TrackTableLayout) => void
}

interface Drag {
  pointerId: number
  from: number
  to: number
  startY: number
  offset: number
}

export function ColumnsPanel({ layout, onChange }: ColumnsPanelProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const handles = useRef(new Map<ColumnId, HTMLButtonElement>())
  const last = layout.columns.length - 1

  const startDrag = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ pointerId: event.pointerId, from: index, to: index, startY: event.clientY, offset: 0 })
  }
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const offset = event.clientY - drag.startY
    const to = Math.max(0, Math.min(last, drag.from + Math.round(offset / ROW_HEIGHT)))
    setDrag({ ...drag, offset, to })
  }
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.to !== drag.from) onChange(moveColumn(layout, drag.from, drag.to))
    setDrag(null)
  }

  // ↑ ↓ on a focused handle move its column; the handle keeps the focus.
  const moveByKey = (index: number, id: ColumnId) => (event: KeyboardEvent) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    onChange(moveColumn(layout, index, index + step))
    requestAnimationFrame(() => handles.current.get(id)?.focus())
  }

  // While dragging, the rows between the column's place and where it would
  // land step aside by one row.
  const shift = (index: number): number => {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -ROW_HEIGHT
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return ROW_HEIGHT
    return 0
  }

  return (
    <>
      <h5 className="popover__title">Columns</h5>
      <ul className={drag ? 'tt-columns tt-columns--dragging' : 'tt-columns'}>
        {layout.columns.map((column, index) => {
          const def = columnDef(column.id)
          const always = column.id === 'title'
          const dragging = drag?.from === index
          const toggle = () => onChange(setColumnShown(layout, column.id, !column.shown))
          return (
            <li
              key={column.id}
              className={dragging ? 'tt-columns__row tt-columns__row--dragging' : 'tt-columns__row'}
              style={{ transform: `translateY(${drag && dragging ? drag.offset : shift(index)}px)` }}
            >
              <button
                ref={(el) => {
                  if (el) handles.current.set(column.id, el)
                  else handles.current.delete(column.id)
                }}
                type="button"
                className="tt-columns__handle"
                aria-label={`Move ${def.name}`}
                title="Drag to reorder"
                onPointerDown={startDrag(index)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={moveByKey(index, column.id)}
              >
                ⠿
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={column.shown}
                aria-label={def.name}
                className="tt-check"
                disabled={always}
                onClick={toggle}
              >
                {column.shown && <Icon name="Check" size={11} strokeWidth={2.5} />}
              </button>
              <span
                className="tt-columns__name"
                onClick={always ? undefined : toggle}
              >
                {def.name}
              </span>
              {always && <span className="tt-columns__note">always</span>}
            </li>
          )
        })}
      </ul>
      <div className="popover__footer">
        <button type="button" className="link-btn" onClick={() => onChange(defaultLayout())}>
          Reset
        </button>
        <label className="tt-columns__artwork">
          Artwork
          <ToggleSwitch
            checked={layout.artwork}
            onChange={(artwork) => onChange({ ...layout, artwork })}
          />
        </label>
      </div>
    </>
  )
}
```

- [ ] **Step 3: The button**

```tsx
// src/components/track-table/ColumnsButton.tsx
// The toolbar's Columns button and its panel. The table holds `open`, so a
// right-click on any column head opens the same panel.
import { useCallback, useRef } from 'react'
import { useTrackTableLayout } from '../../store/trackTableLayoutStore'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { ColumnsPanel } from './ColumnsPanel'
import './Columns.css'

interface ColumnsButtonProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ColumnsButton({ open, onOpenChange }: ColumnsButtonProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const layout = useTrackTableLayout((state) => state.layout)
  const setLayout = useTrackTableLayout((state) => state.setLayout)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <div ref={anchorRef} className="tt-columns-anchor">
      <button
        type="button"
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="Columns3" size={14} />
        Columns
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Columns"
        className="tt-columns-panel"
      >
        <ColumnsPanel layout={layout} onChange={setLayout} />
      </Popover>
    </div>
  )
}
```

- [ ] **Step 4: Their styles**

```css
/* src/components/track-table/Columns.css */
/* The Columns button's panel (ColumnsPanel.tsx). */

.tt-columns-anchor {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.tt-columns-panel {
  width: 240px;
}

/* The list scrolls when the panel would not fit (title and footer: ~90px). */
.tt-columns {
  max-height: calc(var(--popover-room, 600px) - 90px);
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.tt-columns__row {
  position: relative;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

/* Only while a ⠿ drag lasts do the rows slide; a dropped row then lands in
   its new place without sliding back from where it was let go. */
.tt-columns--dragging .tt-columns__row {
  transition: transform var(--motion-fast) var(--ease);
}

.tt-columns--dragging .tt-columns__row--dragging {
  z-index: 1;
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 10%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  transition: none;
}

.tt-columns__handle {
  padding: 0 2px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}

.tt-columns--dragging .tt-columns__row--dragging .tt-columns__handle {
  cursor: grabbing;
}

.tt-columns__handle:hover {
  color: var(--text-primary);
}

.tt-columns__handle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.tt-check {
  display: inline-flex;
  flex: 0 0 15px;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border), var(--text-primary) 25%);
  border-radius: var(--radius-sm);
  background: none;
  color: #fff;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease);
}

.tt-check[aria-checked='true'] {
  background: var(--accent);
  border-color: var(--accent);
}

.tt-check:disabled {
  opacity: 0.5;
  cursor: default;
}

.tt-check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tt-columns__name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.tt-columns__note {
  margin-left: auto;
  color: var(--text-muted);
}

.tt-columns__artwork {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}
```

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/track-table`
Expected: no errors, no warnings.

```bash
git add src/components/track-table/usePlayCounts.ts src/components/track-table/ColumnsPanel.tsx src/components/track-table/ColumnsButton.tsx src/components/track-table/Columns.css
git commit -m "feat(tracks): the Columns panel — show, hide and reorder columns, Reset, the Artwork switch"
```

---

### Task 8: The heads and the cells

**Files:**
- Create: `src/components/track-table/TableHead.tsx`
- Create: `src/components/track-table/TrackCell.tsx`

- [ ] **Step 1: The heads**

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
  shownColumns,
  type ColumnLayout,
  type TrackTableLayout,
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
    >
      {label}
      {sorted && <span className="sort-indicator">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )
}

function ResizeHandle({ column }: { column: ColumnLayout }) {
  const start = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [active, setActive] = useState(false)

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { pointerId: event.pointerId, x: event.clientX, width: column.width }
    setActive(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const drag = start.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const { layout, setLayout } = useTrackTableLayout.getState()
    // Only shown while dragging; written once on release.
    setLayout(setColumnWidth(layout, column.id, drag.width + event.clientX - drag.x), false)
  }
  const onPointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (!start.current || event.pointerId !== start.current.pointerId) return
    start.current = null
    setActive(false)
    useTrackTableLayout.getState().save()
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnDef(column.id).name}`}
      className={active ? 'head-resize head-resize--active' : 'head-resize'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={(event) => event.stopPropagation()}
    />
  )
}

export function TableHead({ layout, sort, onSort, onOpenColumns }: TableHeadProps) {
  return (
    <div
      className="track-table-row header-row"
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenColumns()
      }}
    >
      <div className="tt-cell cell-index">#</div>
      {layout.artwork && <div className="tt-cell cell-art" />}
      {shownColumns(layout).map((column) => {
        if (column.id === 'title') {
          return (
            <div key="title" className="tt-cell head-cell">
              <SortButton column="title" label="Title" sort={sort} onSort={onSort} />
              <span className="head-sep">·</span>
              <SortButton column="artist" label="Artist" sort={sort} onSort={onSort} />
            </div>
          )
        }
        const def = columnDef(column.id)
        return (
          <div
            key={column.id}
            className={def.align === 'end' ? 'tt-cell head-cell head-cell--end' : 'tt-cell head-cell'}
          >
            <SortButton
              column={SORT_BY_COLUMN[column.id]}
              label={def.head}
              sort={sort}
              onSort={onSort}
            />
            <ResizeHandle column={column} />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: A row's cell**

```tsx
// src/components/track-table/TrackCell.tsx
// One cell of a track row, for any column but # and the artwork (track table
// spec, Columns). Missing values show "—".
import type { ReactNode } from 'react'
import type { Track } from '../../types/track'
import { columnDef, type ColumnId } from '../../lib/trackTable/columns'
import { MISSING, formatAdded, formatFormat, formatTime } from '../../lib/trackTable/cells'
import { StarRating } from '../StarRating'

interface TrackCellProps {
  column: ColumnId
  track: Track
  /** Plays per track; null while the Plays column is hidden or loading. */
  plays: ReadonlyMap<number, number> | null
  /** Opens the comment editor; absent where comments cannot be edited. */
  onEditComment?: (track: Track) => void
  /** Saves a new rating; absent where ratings cannot be edited. */
  onRate?: (track: Track, rating: number) => void
}

const missing = <span className="cell-missing">{MISSING}</span>

function text(value: string | undefined): ReactNode {
  return value ? value : missing
}

export function TrackCell({ column, track, plays, onEditComment, onRate }: TrackCellProps) {
  const className = columnDef(column).align === 'end' ? 'tt-cell cell--end' : 'tt-cell'

  switch (column) {
    case 'title':
      return (
        <div className="tt-cell cell-title">
          <div className="cell-title__name" title={track.title || undefined}>
            {track.title || <span className="cell-missing">Untitled</span>}
          </div>
          <div className="cell-title__artist" title={track.artist || undefined}>
            {text(track.artist)}
          </div>
        </div>
      )
    case 'bpm':
      return <div className={className}>{track.bpm ? track.bpm.toFixed(2) : missing}</div>
    case 'key':
      return (
        <div
          className={className}
          title={
            track.key_confidence != null
              ? `${track.musical_key ?? MISSING} (${Math.round(track.key_confidence * 100)}%)`
              : undefined
          }
        >
          {text(track.musical_key)}
        </div>
      )
    case 'genre':
      return <div className={className} title={track.genre || undefined}>{text(track.genre)}</div>
    case 'label':
      return <div className={className} title={track.label || undefined}>{text(track.label)}</div>
    case 'album':
      return <div className={className} title={track.album || undefined}>{text(track.album)}</div>
    case 'time':
      return <div className={className}>{formatTime(track.duration_ms)}</div>
    case 'added':
      return <div className={className}>{formatAdded(track.date_added)}</div>
    case 'format':
      return <div className={className}>{formatFormat(track.file_format, track.bitrate)}</div>
    case 'plays': {
      const count = plays?.get(track.id)
      return <div className={className}>{count ? count : missing}</div>
    }
    case 'rating':
      return (
        <div className="tt-cell cell-rating" onClick={(event) => event.stopPropagation()}>
          <StarRating
            value={track.rating ?? 0}
            readonly={!onRate}
            onChange={(rating) => onRate?.(track, rating)}
          />
        </div>
      )
    case 'comment':
      return (
        <div
          className={onEditComment ? `${className} cell-comment` : className}
          title={track.comment || undefined}
          onClick={(event) => {
            if (!onEditComment) return
            event.stopPropagation()
            onEditComment(track)
          }}
        >
          {track.comment ||
            (onEditComment ? <span className="cell-missing">+ Add</span> : missing)}
        </div>
      )
  }
}
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/track-table`
Expected: no errors, no warnings.

```bash
git add src/components/track-table/TableHead.tsx src/components/track-table/TrackCell.tsx
git commit -m "feat(tracks): column heads that sort, resize and open Columns; a cell for every column"
```

---

### Task 9: The table uses the layout

**Files:**
- Modify: `src/components/TrackTable.tsx`
- Modify: `src/components/TrackTable.css`
- Modify: `src/App.tsx`

Each step replaces one exact piece of `TrackTable.tsx`.

- [ ] **Step 1: Imports**

Replace

```tsx
  useImperativeHandle,
  forwardRef,
} from 'react'
```

with

```tsx
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
} from 'react'
```

Replace (the stars move to `TrackCell`)

```tsx
import { Icon } from './Icon'
import { StarRating } from './StarRating'
```

with

```tsx
import { Icon } from './Icon'
```

and after `import { usePlayedTrackIds } from './track-table/usePlayedTrackIds'` add:

```tsx
import { usePlayCounts } from './track-table/usePlayCounts'
import { ColumnsButton } from './track-table/ColumnsButton'
import { TableHead } from './track-table/TableHead'
import { TrackCell } from './track-table/TrackCell'
import { gridTemplate, shownColumns } from '../lib/trackTable/columns'
import { titleGradient } from '../lib/trackTable/cells'
import {
  DEFAULT_SORT,
  nextSort,
  sortTracks,
  visibleSort,
  type SortColumn,
  type SortState,
} from '../lib/trackTable/sort'
import { useTrackTableLayout } from '../store/trackTableLayoutStore'
```

- [ ] **Step 2: The sort types go**

Delete the block from `// --- Sort types ---` through the `interface SortState { … }` that ends it, and the blank line after it. They come from `lib/trackTable/sort.ts` now.

- [ ] **Step 3: The play-version prop**

Replace

```tsx
   * All Tracks passes the library's, which holds during a backend search.
   */
  totalCount?: number
}
```

with

```tsx
   * All Tracks passes the library's, which holds during a backend search.
   */
  totalCount?: number
  /** App's play-version number: raised after each play is recorded. */
  playVersion?: number
}
```

and in the destructuring replace

```tsx
      onFilterChange,
      totalCount,
    },
    ref,
```

with

```tsx
      onFilterChange,
      totalCount,
      playVersion = 0,
    },
    ref,
```

- [ ] **Step 4: The layout and the sort**

Replace

```tsx
    // Sort state — default: sort by title ascending
    const [sort, setSort] = useState<SortState>({
      column: 'title',
      direction: 'asc',
    })
```

with

```tsx
    // Sort state — default: sort by title ascending
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
```

Replace everything from `    // --- Sort: order filtered tracks by selected column ---` up to (not including) `    const HEADER_HEIGHT = 36` — the inline sort, `handleSort` and `sortIndicator` — with:

```tsx
    // --- Columns: one layout for every track table (Columns panel) ---
    const layout = useTrackTableLayout((state) => state.layout)
    const grid = useMemo(() => gridTemplate(layout), [layout])
    const columns = useMemo(() => shownColumns(layout), [layout])
    const [columnsOpen, setColumnsOpen] = useState(false)
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
```

- [ ] **Step 5: The rows' size, the flash**

Replace

```tsx
    const HEADER_HEIGHT = 36

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 32,
```

with

```tsx
    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 46,
```

In `scrollToCurrentTrack`, replace

```tsx
            if (element) {
              element.style.transition = 'background-color 0.3s ease'
              element.style.backgroundColor = 'rgba(var(--accent-rgb), 0.3)'
              setTimeout(() => {
                element.style.backgroundColor = ''
              }, 600)
            }
```

with

```tsx
            if (element) {
              // --row-bg, so the sticky # and artwork cells flash too.
              element.style.setProperty(
                '--row-bg',
                'color-mix(in srgb, var(--bg-primary), var(--accent) 30%)',
              )
              setTimeout(() => {
                element.style.removeProperty('--row-bg')
              }, 600)
            }
```

Replace (the time format moves to `cells.ts`)

```tsx
    // Format duration from milliseconds to MM:SS
    const formatDuration = (ms?: number) => {
      if (!ms) return '--:--'
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
```

with

```tsx
    // The comment editor and the stars, where tracks can be edited.
    const editComment = onUpdateTrack
      ? (track: Track) =>
          setCommentInput({ visible: true, track, value: track.comment || '' })
      : undefined
    const rate = onUpdateTrack
      ? (track: Track, rating: number) => onUpdateTrack({ ...track, rating })
      : undefined
```

- [ ] **Step 6: The Columns button**

Replace

```tsx
              shownCount={sortedTracks.length}
            />
          )}
          {/* AI Recommendations for current playlist (DISC-02) */}
```

with

```tsx
              shownCount={sortedTracks.length}
            />
          )}
          <ColumnsButton open={columnsOpen} onOpenChange={setColumnsOpen} />
          {/* AI Recommendations for current playlist (DISC-02) */}
```

- [ ] **Step 7: The grid and the heads**

Replace everything from `          <div className="track-table-holder">` up to (not including) `          {/* Virtualized body */}` — the holder's opening tag and the hand-written header row — with:

```tsx
          <div
            className="track-table-holder"
            style={
              {
                '--tt-min': `${grid.minWidth}px`,
                '--tt-grid': grid.template,
              } as CSSProperties
            }
          >
          {/* Column headers — sticky inside scroll area */}
          <div className="track-table-header">
            <TableHead
              layout={layout}
              sort={shownSort}
              onSort={handleSort}
              onOpenColumns={() => setColumnsOpen(true)}
            />
          </div>
```

- [ ] **Step 8: The row's cells**

In the row, keep the `cell-index` cell. Replace everything after it, from `                    <div className="table-cell cell-title" title={track.title || 'Untitled'}>` through the duration cell (`<div className="table-cell cell-duration">` … `{formatDuration(track.duration_ms)}` … `</div>`), with:

```tsx
                    {layout.artwork && (
                      <div className="tt-cell cell-art">
                        <span
                          className="tt-cover"
                          style={{ background: titleGradient(track.title) }}
                        />
                      </div>
                    )}
                    {columns.map((column) => (
                      <TrackCell
                        key={column.id}
                        column={column.id}
                        track={track}
                        plays={plays}
                        onEditComment={editComment}
                        onRate={rate}
                      />
                    ))}
```

- [ ] **Step 9: Rename the cell class**

```bash
sed -i '' 's/table-cell/tt-cell/g' src/components/TrackTable.tsx   # on Linux: sed -i without ''
```

TableHead and TrackCell already use `tt-cell`; the stylesheet follows in the next step.

- [ ] **Step 10: The styles**

In `src/components/TrackTable.css`, replace everything from `/* --- Column Headers (sortable) --- */` up to (not including) `/* --- Scrollbar Styling --- */` with:

```css
/* --- Column heads and rows: one grid (--tt-grid, from the column layout) --- */

.track-table-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-secondary);
  box-shadow: inset 0 -1px 0 var(--border);
}

/* Scroll area: heads and rows scroll together, sideways too */
.track-table-scroll-area {
  position: relative;
  min-height: 0;
  min-width: 0;
}

/* As wide as the area, or as the columns (--tt-min) when they need more: the
   area then scrolls sideways, and the heads' background spans them all. */
.track-table-holder {
  min-width: var(--tt-min, 100%);
}

.track-table-body {
  position: relative;
}

.track-table-row {
  display: grid;
  grid-template-columns: var(--tt-grid);
  align-items: center;
}

/* Named tt-cell: the plain "table" + "-cell" name is also a Tailwind utility,
   which globals.css, loaded last, would put over these rules. */
.tt-cell {
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- Heads --- */

.header-row {
  height: 30px;
  user-select: none;
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.head-cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  overflow: visible;
}

.head-cell--end {
  justify-content: flex-end;
}

.head-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease);
}

.head-sort:hover,
.head-sort--sorted {
  color: var(--text-primary);
}

.head-sort:focus-visible {
  border-radius: 2px;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sort-indicator {
  font-size: 8px;
  line-height: 1;
}

/* A head's right edge drags to resize; a thin accent line shows on hover. */
.head-resize {
  position: absolute;
  top: 0;
  right: -4px;
  z-index: 2;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

.head-resize::after {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 3px;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background-color var(--motion-fast) var(--ease);
}

.head-resize:hover::after,
.head-resize--active::after {
  background: var(--accent);
}

/* The last column's edge stays inside the table, or the area would scroll
   sideways by 4px at any width. */
.head-cell:last-child .head-resize {
  right: 0;
}

/* --- Rows: 46px; hover, selected and playing tint the row (--row-bg, always
   opaque, so the sticky cells below can wear it too) --- */

.data-row {
  --row-bg: var(--bg-primary);
  height: 46px;
  border-radius: var(--radius-md);
  background: var(--row-bg);
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  overflow: clip;
  transition: background-color var(--motion-fast) var(--ease);
}

.data-row:hover {
  --row-bg: var(--bg-tertiary);
}

.data-row--selected {
  --row-bg: color-mix(in srgb, var(--bg-primary), var(--accent) 16%);
}

.data-row--playing {
  --row-bg: color-mix(in srgb, var(--bg-primary), var(--accent) 12%);
}

.data-row--selected:hover,
.data-row--playing:hover {
  --row-bg: color-mix(in srgb, var(--bg-primary), var(--accent) 20%);
}

/* # and the artwork stay put when the table scrolls sideways. */
.cell-index,
.cell-art {
  position: sticky;
  z-index: 1;
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  background-color: var(--row-bg);
  transition: background-color var(--motion-fast) var(--ease);
}

.cell-index {
  left: 0;
  padding: 0 4px;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* INDEX_WIDTH in lib/trackTable/columns.ts */
.cell-art {
  left: 44px;
  padding: 0 6px;
}

.header-row .cell-index,
.header-row .cell-art {
  background-color: var(--bg-secondary);
}

.data-row:hover .cell-index {
  color: var(--text-primary);
}

.data-row--playing .cell-index {
  color: var(--accent-hover);
}

/* Default state: show number, hide play icon */
.row-number { display: flex; align-items: center; }
.row-play   { display: none; color: var(--text-primary); align-items: center; }
.row-playing { color: var(--accent); display: flex; align-items: center; }

/* Hover: hide number, show play icon */
.data-row:hover .row-number { display: none; }
.data-row:hover .row-play   { display: flex; }

/* Playing: always show speaker, regardless of hover */
.data-row--playing .row-number { display: none; }
.data-row--playing .row-play   { display: none; }
.data-row--playing .cell-index .row-playing { display: flex; }

.tt-cover {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background-position: center;
  background-size: cover;
}

/* Title & artist: two lines */
.cell-title__name,
.cell-title__artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-title__name {
  color: var(--text-primary);
  font-size: 13px;
}

.cell-title__artist {
  margin-top: 1px;
  color: var(--text-muted);
  font-size: 11.5px;
}

.data-row--playing .cell-title__name {
  color: var(--accent-hover);
}

.cell--end {
  text-align: right;
}

.cell-missing {
  color: var(--text-muted);
}

.cell-comment:hover {
  color: var(--text-primary);
}

.cell-rating {
  overflow: visible;
}
```

This drops the old fixed widths (`.cell-title` … `.cell-duration`), the old `display: inline-flex` row, `.data-row:active`, and the unused `.text-muted`.

Run: `grep -rn "table-cell" src`
Expected: no output.

- [ ] **Step 11: App passes the play-version number**

In `src/App.tsx` replace

```tsx
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
```

with

```tsx
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
  // Raised after each play is recorded: the track table's Plays column (and
  // Home, later) read their counts again.
  const [playVersion, setPlayVersion] = useState(0)
```

replace

```tsx
        tauriApi
          .recordPlayEvent(trackToPlay.id, selectedPlaylistId ?? null)
          .catch(console.error)
```

with

```tsx
        tauriApi
          .recordPlayEvent(trackToPlay.id, selectedPlaylistId ?? null)
          .then(() => setPlayVersion((version) => version + 1))
          .catch(console.error)
```

and replace

```tsx
                    filter={tableFilter}
                    onFilterChange={setTableFilter}
```

with

```tsx
                    filter={tableFilter}
                    onFilterChange={setTableFilter}
                    playVersion={playVersion}
```

- [ ] **Step 12: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/TrackTable.tsx src/App.tsx && npx vitest run && npx vite build`
Expected: no type errors; eslint shows only the existing `incompatible-library` warning in `TrackTable.tsx` and the two in `App.tsx`; all tests pass (452: Task 0's 418 and this plan's 34); the build succeeds.

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css src/App.tsx
git commit -m "feat(tracks): the table follows the column layout — 46px rows, title over artist, sideways scroll with # and artwork staying put"
```

---

### Task 10: Check in the app (WebKit)

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Run the app** — `npm run tauri dev` (the Rust command is new: a running dev app rebuilds itself).

- [ ] **Step 2: The checklist, by hand**
- **All Tracks:** the heads are Title ▲ · Artist, BPM, Key, Genre, Label, Time, Added. The rows are 46px, with a gradient square (the real covers come in plan 3), the title over the artist, and "—" for missing values. Added reads "today", "yesterday", "Oct 2", or "Oct 2, 2025" for other years.
- **Columns panel:** Columns opens a panel with 12 columns. Title & artist is marked "always" and its box can't be cleared. Turning on Plays, Album, Rating, Comment and Format · bitrate adds each one. Rating's stars still edit, and a Comment cell still opens the editor.
- **Reorder and Reset:** dragging a ⠿ moves a column, and the rows step aside smoothly. ↓ on a focused ⠿ works too. Reset brings the default back. Artwork off removes the squares, and on brings them back.
- **Right-click:** a right-click on any column head opens the same panel.
- **Resize:** dragging a head's right edge (a thin accent line on hover) resizes it. It won't go below its minimum, and the heads' text is not selected while dragging.
- **Sideways scroll:** on a narrow window or with many columns, the table scrolls sideways. # and the squares stay put, in the head too, and a row under the mouse tints them along with the row.
- **Plays:** sorts the most played first. Play a track by double-click, and its count goes up by one without leaving the view.
- **Hidden sort column:** sort by Plays, then hide Plays in the panel. The table goes back to Title ▲.
- **After a restart:** the columns, their order and widths, and the Artwork switch are as you left them, and the default never flashes first.
- **Other tables:** a folder and a playlist show the same columns.
- **Tall panel:** in a playlist on a window about 720px high, the Columns panel's list scrolls inside it rather than being cut off.
- **Filter panel:** still the same, with Clear all bottom left and Show N bottom right.
- **Dawn (light theme):** heads, rows, the selected row and the panel read well.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add <the files fixed>
git commit -m "fix(tracks): <what the hand check found>"
```

Skip this step if nothing needed fixing.
