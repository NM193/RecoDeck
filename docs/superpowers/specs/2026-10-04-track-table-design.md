# All Tracks: the Track Table, Redesigned — Design

## Why

All Tracks, a folder and a playlist all show the same table (`TrackTable`):
fixed columns (Title, Artist, BPM, Key, Genre, Comment, Rating, Duration), one
line per track, a text search, a count at the bottom. You cannot choose what
to see, a row carries no artwork, the track playing is marked by a speaker,
you act on one track at a time, and there is no way to narrow 8,583 tracks
except by typing.

Mockups (approved): [`2026-10-04-track-table-mockup.html`](./2026-10-04-track-table-mockup.html)
— the **Filter button with a panel** (option A, no chips), the **Columns**
panel, the new rows, and the **equalizer** for the track playing (option 1).
Every button has a **6px** corner radius.

This applies to every track table: All Tracks, a folder, a playlist.

## Toolbar

Above the table: the search box (as today; in All Tracks it searches the whole
library in the backend), **Filter**, **Columns**, and on the right the count —
"1,162 of 8,583 tracks", or "8,583 tracks" with no search or filter, or "3
selected · …". The total is the view's: App's `totalTrackCount` in All Tracks
(also during a backend search, when the table holds only the results), the
folder's or the playlist's count elsewhere. The footer under the table goes;
the sort shows as the arrow in its column head.

## Filter

**Filter** opens a panel under the button (a popover that registers with the
Interactions spec's `useOverlay`, as the Columns panel does):

| Field | Control | Matches |
|---|---|---|
| Genre | select of the genres among the view's tracks, with counts | `genre` equal |
| BPM | from – to, whole numbers | `from ≤ bpm < to + 1` (125–129 holds 129.5) |
| Key | select of the keys among the view's tracks | `musical_key` equal |
| Added | Any · 7 days · 30 days | `date_added` (UTC) within that many days |
| Played | Any · Never · Played | in `get_played_track_ids()` or not |
| Rating | Any · ★1+ … ★5 | `rating ≥` |

The genre and key lists are counted from the tracks the view has before the
filter (in All Tracks the whole library, in a folder that folder), on the
client. Changes apply at once; the panel's footer says **Show 1,162** (which
closes it) and **Clear all**.

**The button names the filter** instead of saying "Filter", in the accent
style, with ✕ to clear — the first two conditions, then "+N":

| Field | Label |
|---|---|
| genre | `Tech House` |
| BPM | `125–129 BPM`; only a minimum `135+ BPM`; only a maximum `< 115 BPM` |
| key | `Key 6A` |
| added | `Added 7 days` / `Added 30 days` |
| played | `Never played` / `Played` |
| rating | `★3+` |

e.g. "Tech House · 125–129 BPM ✕", "Tech House · 125–129 BPM · +2 ✕". No
chips anywhere. A filter that leaves nothing shows "No tracks match · Clear
filter".

**The object**, shared with the Search and Home specs, which open All Tracks
with one field set (a genre tile, Added lately, Never played, a BPM bar, a
key):

```ts
interface TrackFilter {
  genre?: string
  /** Inclusive. */
  bpmMin?: number
  /** Exclusive; absent = no upper bound. The panel's "to" shows bpmMax − 1. */
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
works inside it.

**Who owns it.** `TrackTable` takes `filter: TrackFilter | null` and
`onFilterChange` — App holds one `tableFilter` for the view on screen. It is
reset to null in App's navigation handlers (every handler that opens a view),
not in an effect on the view key, which would wipe the filter Home sets as it
opens All Tracks. Home and Search set it as they open All Tracks. **This
spec's plan builds** `TrackFilter`, its matching function, the button, the
panel, App's `tableFilter`, `get_played_track_ids()` and App's play-version
number (raised after `recordPlayEvent` resolves, as the Home spec's wiring
notes say); the Search and Home plans reuse them, and come after this one.

During an All Tracks backend search, the genre and key lists are counted from
the results; the value chosen stays in its select even when its count there
is 0.

## Columns

**Columns** opens a panel: a checkbox per column, a ⠿ handle to reorder,
**Reset** (back to the default), and under the list an **Artwork** switch.
Right-clicking any column head opens the same panel. # is always first and
the artwork (when on) always next to it; neither is in the list.

| Column | Default | Notes |
|---|---|---|
| Title & artist | always | two lines; "Title" and "Artist" in its head each sort; takes the remaining width |
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

A column's right edge **drags** to resize (pointer events; each column has a
minimum). When the columns are wider than the window, the table scrolls
sideways inside its own area, with # and the artwork staying put. One column
layout serves every track table; it is stored in the settings table as
`track_table_columns`
(`{ artwork: bool, columns: [{ id, shown, width }] }`, every column in its
panel order, so a hidden column keeps its place), read once into a small store
at start-up (the table remounts on every view change, so it must not read it
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
client: the raw bytes from `tauriApi.getTrackArtwork(id)` (not
`artworkCache`, which keeps full images and is the now-playing bar's) become a
Blob, are drawn down to 72×72 (`createImageBitmap` + canvas), and only the
small JPEG is kept. Thumbnails — and "no artwork", so a missing cover is not
asked for again — are cached in a least-recently-used cache of 1,000, read as
rows scroll into view, at most 4 reads at a time; a fast scroll skips rows
that left the view before their turn. About three quarters of the library
has artwork; a track without shows a quiet empty square, as in Traktor — the
same square shown while a cover is read (the user, on seeing the title
gradient in the app, 2026-10-04). (The Search
spec's Recently played tiles use the same thumbnails — `artwork_path` is empty
for every track.)

States:
- **hover**: a lighter row; the number turns into ▶ (plays, as a double click);
- **selected**: a tinted row (below);
- **playing**: the **equalizer** — three thin accent bars that move while
  playing and stand still when paused — in place of the number, and the title
  in the accent colour. Hovering it shows **pause** while playing and **▶**
  while paused (lucide icons); clicking does that.

Double-click plays as today, with the table's sorted, filtered list as the
queue.

## Selecting several

Click selects one row; **⌘-click** adds or removes a row; **Shift-click**
selects the range from the last clicked row. **⌘A** selects every row shown.
The selection is always among the rows shown: when the search, the filter, the
sort or the tracks change, rows no longer shown leave the selection. Escape
clears it. ⌘A and Escape act on rows only while the table has focus and no
menu, panel or modal is open, never while typing.

The right-click menu acts on the selection (a right-click on an unselected row
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
  answering which ids it added (for Undo) and which were there already.
- **Analyze BPM & Key** — one `analyzeTracksBatch(ids, true)`.
- **Set Genre ▸** — existing `bulk_set_genre`.
- **Clear Genre** — new `bulk_clear_genre(ids)`.
- **Delete from playlist** (in a playlist) — new
  `remove_tracks_from_playlist(playlist_id, ids)`.
- **Add / Edit Comment** — one track only; greyed with several selected.

New: **Move to folder ▸** — a small searchable list (type to narrow) of every
folder in the library, shown as paths ("Music / House / Deep"), library roots
included, from new `list_library_folders()` (recursive; a linked folder that
leads outside the library is left out, as a move would refuse it). When every
selected track is in the same folder, that folder is greyed. Moving:
- moves the files on disk into that folder, keeping their names;
- on the same disk, for each file: under the database lock (taken per file,
  not for the batch), check its name is free, rename it into place and update
  its `file_path`; if the update fails, rename it back. The name is checked
  under the lock because a rename replaces an existing file (on macOS even one
  whose name differs only in case): two moves at once must not destroy each
  other's files;
- across disks, for each file: copy it **outside the lock** to a temporary
  name with no audio extension (`.recodeck-moving`, which the watcher and the
  scanner ignore), write it through to the disk and check its size; then under
  the lock check its name is free, rename the copy to its final name, update
  `file_path` and delete the original (if it will not go, `file_path` goes
  back). If anything fails, the copy is deleted and the original stays. The
  lock is never held during a copy: almost every database command runs on the
  main thread, and App reloads tracks on the watcher's first event, so a long
  hold would freeze the window;
- the track keeps its id, analysis, history, playlists and cues, and the
  watcher's rescan finds nothing new (as renaming a folder does today);
- **skips and reports**: tracks already in that folder, a name that already
  exists there, a source file that is missing, and **the player's current
  track** — playing or paused, and during a crossfade the incoming one too
  (the player streams it from its path);
- the tracks moved that are in the player's queue get their new path through
  a new player-store action that patches paths in `queue` and `originalQueue`
  (so turning shuffle off keeps them). The patch must not reload the current
  track: NowPlayingBar's load effect today runs on every queue change and
  would restart the song from 0:00, so it is keyed on the current track's id
  instead (built: with the player store's playRequest — raised by a play,
  next, previous — so shuffling and adding to the queue no longer restart the
  song either);
- the stream handler follows a file moved this session (old path → new, kept
  in memory), so a track the player loads by its old path while a move runs,
  or streams while its original goes, plays on;
- the sidebar's folder tree is refreshed afterwards, as renaming a folder does
  (the watcher's events are throttled to one per 2s, so counts would stay
  stale);
- ends with a toast: "Moved 3 tracks to House", or "Moved 2 · 1 skipped (playing
  now)", with the reasons on hover.

Backend: new `move_tracks_to_folder(track_ids, folder)` — `async`, the file
work on `spawn_blocking` (as `scan_directory`), so a cross-disk copy does not
freeze the window; the folder must be inside a library folder; it answers
`{ moved: [{ id, newPath }], skipped: [{ id, reason }] }`.

## Data

| Need | Source |
|---|---|
| Genres and keys for the panel | the view's tracks, counted on the client |
| Played ids | new `get_played_track_ids()` (built here; the Search and Home plans reuse it), read when Played is set |
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
  unknown ids, new column off, reorder, Reset); the Added label; Shift-click
  ranges; the selection trimmed when the shown rows change; the thumbnail
  cache's eviction.
- Rust: `move_tracks_to_folder` on a temp dir — moves and updates paths, keeps
  the id and analysis, skips a name clash, a missing file and a track already
  there, refuses a folder outside the library, moves a file back when the
  update fails, never holds the lock during a cross-disk copy (a temp file
  without an audio extension, then a rename); `list_library_folders`;
  `get_play_counts`; `get_played_track_ids`; `bulk_clear_genre`;
  `add_tracks_to_playlist` (answers added vs already there);
  `remove_tracks_from_playlist`.
- TypeScript: the player-store path patch changes `queue` and `originalQueue`
  and does not change the current track.
- By hand: a genre tile and a BPM bar from Home show in the button; ✕ clears;
  columns on/off, reorder, resize, sideways scroll on a narrow window, survive
  a restart with no flash; artwork fills in while scrolling fast and memory
  stays flat; the equalizer moves, stops on pause, hover shows ▶ when paused;
  ⌘ and Shift selection, ⌘A then a narrower search; Set Genre on 50 tracks is
  one toast; Move to folder on three tracks including the one playing — two
  move, one is skipped, the queue still plays the moved ones, the folder shows
  them with their BPM.

## Out of scope

Editing tags in the table (beyond rating and comment), smart playlists, saved
filters, reordering columns by dragging their heads.
