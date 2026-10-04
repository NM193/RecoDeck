# All Tracks: the Track Table, Redesigned — Design

## Why

All Tracks, a folder and a playlist all show the same table (`TrackTable`):
fixed columns (Title, Artist, BPM, Key, Genre, Comment, Rating, Duration), one
line per track, a text search, a count at the bottom. You cannot choose what
to see, a row carries no artwork, the track playing is marked by a speaker,
you can act on one track at a time, and there is no way to narrow 8,583 tracks
except by typing.

Mockups (approved): [`2026-10-04-track-table-mockup.html`](./2026-10-04-track-table-mockup.html)
— the **Filter button with a panel** (option A, no chips), the **Columns**
panel, the new rows, and the **equalizer** for the track playing (option 1).
Every button has a **6px** corner radius.

This applies to every track table: All Tracks, a folder, a playlist.

## Toolbar

Above the table: the search box (as today; in All Tracks it searches the whole
library in the backend), **Filter**, **Columns**, and on the right the count
("1,162 of 8,583 tracks", or "8,583 tracks" with no search or filter). The
footer under the table goes; the sort shows as the arrow in its column head.

## Filter

**Filter** opens a panel under the button:

| Field | Control | Matches |
|---|---|---|
| Genre | select of the library's genres, with counts | `genre` equal |
| BPM | from – to, whole numbers | `from ≤ bpm < to + 1` (125–129 holds 129.5) |
| Key | select of the keys the library has | `musical_key` equal |
| Added | Any · 7 days · 30 days | `date_added` (UTC) within that many days |
| Played | Any · Never · Played | in `get_played_track_ids()` or not |
| Rating | Any · ★1+ … ★5 | `rating ≥` |

Changes apply at once, and the panel's footer says **Show 1,162** (which
closes it) and **Clear all**. With a filter on, the button names it instead of
"Filter": "Tech House · 125–129 BPM ✕" — the first two conditions, then "+2"
for more — in the accent style; ✕ clears the filter. No chips anywhere.

The filter is one object, shared with the Search and Home specs, which open
All Tracks with one field set (a genre tile, Added lately, Never played, a BPM
bar, a key):

```ts
interface TrackFilter {
  genre?: string
  /** Inclusive. */
  bpmMin?: number
  /** Exclusive; absent = no upper bound. */
  bpmMax?: number
  key?: string
  /** Days. */
  added?: 7 | 30
  played?: 'never' | 'played'
  /** 1–5. */
  minRating?: number
}
```

It applies to the tracks the table is given, after the text search, so search
works inside it. It belongs to the table it was set on: opening another view
starts that view's table unfiltered (the Search spec's rule for All Tracks). A
filter that leaves nothing shows "No tracks match · Clear filter".

## Columns

**Columns** opens a panel: a checkbox per column, a ⠿ handle to reorder,
**Reset** (back to the default). Right-clicking any column head opens the same
list. Columns:

| Column | Default | Notes |
|---|---|---|
| # | always | position in a playlist; the equalizer / ▶ live here |
| Artwork | on | the 36px cover; can be turned off for a denser list |
| Title & artist | always | two lines; "Title" and "Artist" in its head each sort |
| BPM | on | two decimals, as today |
| Key | on | |
| Genre | on | |
| Label | on | |
| Time | on | m:ss |
| Added | on | "today", "yesterday", "Oct 2", "Oct 2, 2025" (local day) |
| Album | off | |
| Rating | off | the stars, editable as today |
| Comment | off | |
| Plays | off | from `play_history` (new `get_play_counts()`); `play_count` is not kept |
| Format · bitrate | off | "mp3 · 320" |

A column head can also be **dragged** sideways to reorder, and its right edge
**dragged** to resize (each column has a minimum; Title & artist takes the
remaining width). One column layout serves every track table; it is stored in
the settings table as `track_table_columns` (an ordered list of `{ id, width }`
of the shown columns), unknown ids are dropped, and a column added later starts
off.

Clicking a head sorts by it, again reverses; the arrow shows which. Sorting is
unchanged otherwise (the Rating default is descending).

## Rows

46px high. # · cover · title over artist · the columns. The cover is the
file's artwork (`getTrackArtworkUrl`, read as rows scroll into view and
cached); about three quarters of the library has one — a track without shows a
gradient from its title. Missing values show "—".

States:
- **hover**: a lighter row; the number turns into ▶ (plays, as a double click);
- **selected**: a tinted row; several can be selected (below);
- **playing**: the **equalizer** — three thin accent bars that move while
  playing and stand still when paused — in place of the number, and the title
  in the accent colour; hovering it shows a pause icon (lucide `Pause`), which
  pauses.

Double-click plays as today, with the table's sorted, filtered list as the
queue.

## Selecting several

Click selects one row; **⌘-click** adds or removes a row; **Shift-click**
selects the range from the last clicked row. ⌘A selects every row shown. The
count reads "3 selected · 1,162 of 8,583 tracks". The right-click menu and
dragging act on the selection (a right-click on an unselected row selects it
alone first). Escape clears the selection.

## Right-click menu

Today's items, acting on every selected track: Add to Playlist ▸ · Analyze BPM
& Key · Set Genre ▸ · Clear Genre (and Delete from playlist in a playlist).
New:

**Move to folder ▸** — a submenu of the library's folders (the sidebar's
folder tree, the track's own folder left out). Moving:
- moves the files on disk into that folder, keeping their names;
- updates each track's `file_path` in the same command, so the track keeps its
  id, analysis, history, playlists and cues, and the watcher's rescan finds
  nothing new (as renaming a folder does today);
- a file whose name already exists there is not moved and is reported;
- across disks it copies, checks the size, then deletes the original;
- ends with a toast: "Moved 3 tracks to House" (or "Moved 2 · 1 already there").

Backend: new `move_tracks_to_folder(track_ids, folder)`, returning what moved
and what did not; the folder must be inside a library folder.

## Data

| Need | Source |
|---|---|
| Genres with counts | existing `get_genres_with_counts` |
| Played ids | `get_played_track_ids()` (Search spec), read when Played is set |
| Plays column | new `get_play_counts()`: track id → plays, read when the column is on |
| Columns | settings `track_table_columns` |
| Moving | new `move_tracks_to_folder(track_ids, folder)` |

## Testing

- TypeScript: the filter (each field, BPM edges 124.99 / 125 / 129.99 / 130,
  Added in UTC near midnight, combined fields, after the search); the button's
  label (one, two, more conditions); the column layout (parse, unknown ids,
  new column off, reorder, Reset); the Added label; Shift-click ranges.
- Rust: `move_tracks_to_folder` on a temp dir — moves and updates paths, keeps
  the id and analysis, refuses a name clash, refuses a folder outside the
  library; `get_play_counts`.
- By hand: Filter from Home (genre tile, BPM bar) shows in the button; ✕
  clears; columns on/off, drag, resize, survive a restart; artwork fills in
  while scrolling fast; the equalizer moves and stops with pause; ⌘ and Shift
  selection; Move to folder on three tracks, then the folder in the sidebar
  shows them and they still play with their BPM.

## Out of scope

Editing tags in the table (beyond rating), smart playlists, saved filters.
