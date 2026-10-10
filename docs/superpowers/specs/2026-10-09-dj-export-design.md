# Export to DJ Software — Design

## Why

RecoDeck is where a DJ prepares music: playlists, BPM and key from analysis,
ratings, comments, genres. At a gig they play from Rekordbox (and USB sticks
for CDJs), Traktor or Serato, and today none of that preparation reaches them.
The only way out is **Export to folder** (copies a playlist's files into a
folder, optionally with an `.m3u8`): a list of files, without BPM, key,
rating or folders.

**Export to DJ software** writes the playlists a DJ picks, with their tracks'
data, in each program's own format: Rekordbox XML, Traktor NML, Serato crates.
It sits next to Export to folder, which stays as it is.

## What the DJ sees

### Where it starts

- A playlist's menu (right-click in the sidebar): **Export to DJ software…**,
  under Export to folder.
- A playlist folder's menu: **Export to DJ software…** — every playlist inside
  it, at any depth, is selected.

### The dialog

- **Program**: Rekordbox · Traktor · Serato, as one tab bar (the shared
  `.tabs` with the thumb). The last one used is remembered
  (`dj_export.last_target`). Rekordbox and Traktor since phase 2; Serato's
  tab comes with phase 3. Each program keeps
  its own selection: a tab shows that program's remembered playlists plus the
  playlist (or folder) the dialog was opened from; checks changed on a tab stay
  on that tab while the dialog is open.
- **Playlists**: the playlist tree with checkboxes. A folder's box selects or
  clears everything inside it (mixed shows as indeterminate). Opened from a
  playlist, that playlist is checked **plus** the playlists of this program's
  previous export, so exporting again never drops a playlist by accident.
  Opened from a folder, its playlists are checked plus the previous ones.
  Playlists deleted since are left out silently.
- **Where**, per program (Rekordbox and Traktor with a **Change…** button):
  - Rekordbox: a file, default `~/Music/RecoDeck/RecoDeck.xml`
    (`%USERPROFILE%\Music\RecoDeck\RecoDeck.xml` on Windows).
  - Traktor: a file, default `~/Music/RecoDeck/RecoDeck.nml`.
  - Serato: no Change… — placement is automatic (see Serato below). The
    dialog shows the system drive's `_Serato_` folder (`~/Music/_Serato_`);
    if it does not exist, Serato is not set up on this computer, the dialog
    says so and Export is disabled. Tracks on an external drive go to that
    drive's `_Serato_`; the result lists every folder written.
- **How to load it** — one or two lines for the selected program:
  - Rekordbox: *Preferences → View → Layout: turn on "rekordbox xml". Then
    Preferences → Advanced → Database → rekordbox xml → Imported Library:
    choose this file. Refresh "rekordbox xml" in the tree and drag the
    playlists where you want them.* (Shown in full until the first export to
    Rekordbox, and again whenever the chosen file differs from the remembered
    one — Rekordbox still points at the old file; otherwise as one line.)
  - Traktor: *Right-click Playlists → Import Playlist → choose this file.*
  - Serato: *Close Serato before exporting; the crates appear under RecoDeck
    the next time it opens.*
- **Export** (primary) and **Cancel**. While it runs: the button shows a
  spinner; the dialog cannot be closed by Esc or the backdrop.

### After it

- A toast: "3 playlists, 214 tracks exported to Rekordbox" with **Show in
  Finder** ("Show in Explorer" on Windows), which reveals the written file (the
  `Subcrates` folder for Serato).
- Tracks whose file is gone are left out and the export goes on; the toast
  adds "2 tracks skipped — file missing", and its detail lists them
  (artist – title, path). With skipped tracks the toast is a `warning` (it
  stays longer) instead of a plain success.
- Everything RecoDeck writes sits under a **RecoDeck** folder (Rekordbox,
  Traktor) or a **RecoDeck** crate (Serato), apart from the DJ's own playlists.
- Exporting again: open the dialog, the previous selection and path are there,
  press Export. The file is rewritten from the current playlists.

### What it does not do

- Rekordbox keeps its own BPM, key, rating and comments for tracks already in
  its collection; only tracks new to it take RecoDeck's data. Importing a
  playlist again duplicates neither tracks nor the playlist. (Checked with
  Rekordbox 7.2.19; the dialog's how-to says so.)
- Audio files are never modified (no tags written).
- Serato gets the crates only: it reads BPM and key from its own analysis.
- No cue points, beatgrids or track colours: RecoDeck has no UI for cues yet,
  and Rekordbox and Traktor analyse the grid themselves.

## What goes into each format

| | Rekordbox (XML) | Traktor (NML) | Serato (crate) |
|---|---|---|---|
| Tracks | `COLLECTION/TRACK` with `Location` | `COLLECTION/ENTRY` with `LOCATION` | paths only |
| BPM | `AverageBpm` (2 decimals) | `TEMPO BPM` | — |
| Key | `Tonality`, musical notation ("Am") | `MUSICAL_KEY VALUE` (0–23) | — |
| Rating 0–5 | `Rating` = stars × 51 | `INFO RANKING` = stars × 51 | — |
| Title, artist, album, genre, label, year, comment | yes | yes | — |
| Duration, bitrate, sample rate, size, kind | yes | duration, bitrate, size | — |
| Play count, date added | `PlayCount`, `DateAdded` (yyyy-mm-dd) | `INFO PLAYCOUNT`, `INFO IMPORT_DATE` (yyyy/m/d) | — |
| Folders | `NODE Type="0"` under a `RecoDeck` node | `NODE TYPE="FOLDER"` under `RecoDeck` | subcrates: `RecoDeck%%Folder%%Playlist.crate` |

Only the folders on the way to a selected playlist are written; empty folders
are not.

### Keys

`track_analysis.musical_key` holds Camelot ("8A"). `formats/keys.rs` maps the
24 codes:

- to musical notation for Rekordbox: 1A A♭m, 2A E♭m, 3A B♭m, 4A Fm, 5A Cm,
  6A Gm, 7A Dm, 8A Am, 9A Em, 10A Bm, 11A F♯m, 12A D♭m; 1B B, 2B F♯, 3B D♭,
  4B A♭, 5B E♭, 6B B♭, 7B F, 8B C, 9B G, 10B D, 11B A, 12B E — written with
  ASCII `b` / `#` in the spelling Rekordbox uses (checked against a real
  Rekordbox export, see Verification);
- to Traktor's integer: 0–11 = C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯, B
  major; 12–23 = the same roots minor (checked against a Traktor 3.11.1
  collection, its Open Key text beside each value).

A missing or unreadable key writes an empty `Tonality` (and no BPM writes `AverageBpm="0.00"`), as Rekordbox's own exports do for unanalysed tracks (to be confirmed against a real export).

### Paths

Paths cause most import failures, so each writer has its own tested encoder:

- **Rekordbox** `Location`: `file://localhost` + the absolute path in the
  shape Rekordbox itself writes (checked against a Rekordbox 7.2.19 export):
  unreserved characters, `/`, `(`, `)` and `,` stay raw; everything else
  (space, `#`, `%`, `&`, `[`, `]`, `?`, non-ASCII as UTF-8) is percent-encoded
  with **lowercase** hex (`%5b`, `%c4%8c`). Windows: `file://localhost/C:/Music/…`. Paths keep the Unicode
  normalization they have on disk (as read from the database), checked against
  a real export (č/ć/š in NFC vs NFD would make Rekordbox see new tracks).
- **Traktor** `LOCATION`: `VOLUME` is the volume name — the boot volume's name
  on macOS (e.g. "Macintosh HD", read from the system, not assumed), the
  `/Volumes/<name>` part for external drives, the drive letter (`C:`) on
  Windows. `DIR` is the folder path after the volume in Traktor's `/:` form
  (`/:Users/:dj/:Music/:`), `FILE` the file name. The playlist's `PRIMARYKEY
  KEY` is `VOLUME` + `DIR` + `FILE`. XML attribute escaping applies on top,
  with `'` left raw as Traktor writes it. Files under `/Users` are on the boot
  volume ("Macintosh HD", the `/Volumes` entry that links to `/`), and
  `VOLUMEID` repeats `VOLUME`. Names are written NFC: Traktor 3.11.1 does so
  even when a name is decomposed on disk, and in another form a track would
  be new to it.
- **Serato**: the path relative to the root of the drive the file is on,
  without the leading separator, UTF-16BE inside the crate.

### Rekordbox XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="RecoDeck" Version="0.5.2" Company="RecoDeck"/>
  <COLLECTION Entries="214">
    <TRACK TrackID="1" Name="…" Artist="…" Album="…" Genre="…" Kind="MP3 File"
           Size="…" TotalTime="412" Year="2024" AverageBpm="124.00"
           DateAdded="2026-09-01" BitRate="320" SampleRate="44100"
           Comments="…" PlayCount="3" Rating="204" Location="file://localhost/…"
           Tonality="Am" Label="…"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Type="0" Name="RecoDeck" Count="…">
        <NODE Name="Warm-up" Type="1" KeyType="0" Entries="12">
          <TRACK Key="1"/>
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
```

`TrackID` is RecoDeck's track id. Attribute order and the exact shape follow
a real Rekordbox export (Verification). XML is written by hand with one
escaping function (`&`, `<`, `>`, `"`, `'`; line breaks in comments as `&#10;`
/ `&#13;` so they survive attribute parsing; other control characters
dropped): no XML crate, so the output stays exactly as Rekordbox expects.

### Traktor NML

`NML VERSION="19"`, `HEAD`, `COLLECTION` with one `ENTRY` per track
(`LOCATION`, `ALBUM`, `INFO`, `TEMPO`, `MUSICAL_KEY`), and `PLAYLISTS` with
`$ROOT` → `RecoDeck` folder → playlists (`PLAYLIST ENTRIES TYPE="LIST"
UUID`), each entry a `PRIMARYKEY TYPE="TRACK"`. A playlist's UUID is derived
from its RecoDeck id (stable across exports). Whether Traktor replaces or
duplicates a playlist imported again is checked by hand; the Traktor help line
says what to do. The shape follows Traktor 3.11.1's own files (a sanitized one
is the fixture `traktor_real.nml`): no self-closing tags, a line break after
each closing tag, `<SETS ENTRIES="0"></SETS>` before the playlists.
`INFO BITRATE` is in bit/s, `FILESIZE` in KiB and `PLAYTIME` in seconds (both
rounded up), `RANKING` stars × 51, dates
`yyyy/m/d`, `RELEASE_DATE` `yyyy/1/1` from the year; values RecoDeck lacks are
left out, as Traktor does. Not written: `MODIFIED_DATE` (Traktor would take the
entry as newer than its own data), `FLAGS`, `LOCK`, `INFO KEY` (a tag's key
text), cues and loudness.

### Serato crates

- A crate is a sequence of tagged fields: 4 ASCII bytes, a 4-byte big-endian
  length, the value. Header `vrsn` = UTF-16BE "1.0/Serato ScratchLive Crate";
  then each track as `otrk` holding `ptrk` (the path). Any column / sort
  fields a real crate carries are copied from a real crate (Verification).
- Files go to `<drive>/_Serato_/Subcrates/`: the system drive's is
  `~/Music/_Serato_`, an external drive's is `/Volumes/<name>/_Serato_`
  (`D:\_Serato_` on Windows). A playlist with tracks on two drives becomes
  a crate of the same name on each; Serato shows them as one.
- Names: `RecoDeck.crate` (the parent), one crate per folder level
  (`RecoDeck%%<Folder>.crate`, empty) and `RecoDeck%%<Folder>%%<Playlist>.crate`.
  Characters a file name cannot hold are replaced, and so is `%%` inside a
  name (it would break the nesting). Two playlists with the same name in one
  folder get " (2)", " (3)"… so neither overwrites the other.
- On an external drive without `_Serato_/Subcrates`, RecoDeck creates it.
- RecoDeck remembers the crate files it wrote. Exporting again deletes those
  that are no longer in the selection, then writes the new set. It never
  touches crates it did not write. A remembered crate it cannot delete (its
  drive is not connected) stays remembered, to be cleaned up next time.
- Serato rewrites its crates when it quits, so it must be closed: before
  writing, RecoDeck looks for a running Serato DJ (Pro / Lite) in the process
  list (`pgrep` on macOS, `tasklist` on Windows). If one runs, the export stops
  with "Close Serato DJ first, then export again."

## How it is built

### Rust: `src-tauri/src/formats/`

The stub `formats/mod.rs` gets content and is declared in `lib.rs`.

- `mod.rs` — the shared model and its loader:
  - `ExportTrack { id, path, exists, title, artist, album, genre, label, year,
    duration_ms, bitrate, sample_rate, file_size, file_format, bpm, camelot,
    rating, comment, play_count, date_added }`
  - `ExportNode::Folder { name, children } | ExportNode::Playlist { id, name,
    track_ids }`
  - `ExportLibrary { tracks, tree }` with tracks deduplicated across playlists
    and in playlist order inside each playlist.
  - `collect(db, playlist_ids) -> ExportLibrary`: reads playlists (with
    `parent_id` for folders) and their tracks with `track_analysis`. It does
    not touch the disk.
  - `mark_missing(&mut ExportLibrary)`: checks each file exists, run after the
    DB lock is released (a sleeping external drive can take seconds). Missing
    files get `exists: false`; writers skip them and the command reports them.
- `keys.rs` — Camelot → Rekordbox notation, Camelot → Traktor integer.
- `rekordbox.rs` — `write(&ExportLibrary, app_version) -> String`.
- `traktor.rs` — `location(path, boot_volume)`, its path encoder, and
  `write(&ExportLibrary, boot_volume) -> String`.
- `serato.rs` — `write(&ExportLibrary, volumes) -> Vec<CrateFile { path,
  bytes }>`, and `read(bytes)` for tests.
- `volumes.rs` — the boot volume's name, the only part that asks the system.
  Each writer has its own path encoder (`rekordbox::location`,
  `traktor::location`).

The writers are pure: no database, no disk. Everything they need comes in.

### Rust: `commands/dj_export.rs`

- `dj_export_defaults(target) -> { path, exists, playlist_ids, remembered }` —
  the remembered playlists, and the remembered or default
  file (Rekordbox, Traktor), or the system drive's `_Serato_` folder, and
  whether it exists.
- The save-file picker for Rekordbox and Traktor is the JS dialog plugin's
  `save` (in `tauri-api.ts`), as `pickExportFolder` uses `open`: its comment
  records that the Rust-side picker can hang on macOS. This needs the
  `dialog:allow-save` permission in `src-tauri/capabilities/default.json`.
- `export_to_dj(target, playlist_ids, path) -> DjExportResult { playlists,
  tracks, skipped: [{ artist, title, path }], written: [paths] }`:
  1. lock the DB, `collect`, release the lock (as `export_playlist_to_folder`),
     then `mark_missing`;
  2. Serato: refuse if Serato DJ runs;
  3. write each file to `<name>.tmp` next to its target, then rename over it,
     so a failed write leaves the previous export intact; create missing
     parent folders (`~/Music/RecoDeck/`, `Subcrates/`);
  4. Serato: delete the crates RecoDeck wrote before and no longer writes;
  5. save the choice (below) and return the result.
- Settings (the `settings` table, JSON values):
  `dj_export.last_target`, and per target `dj_export.<target>` =
  `{ "playlistIds": [...], "path": "...", "crates": [...] }`
  (`crates` for Serato only).

### Frontend

- `src/components/DjExportModal.tsx` + `.css`, built like
  `ExportPlaylistModal` and on the shared controls (tabs, checkboxes, buttons).
  The playlist tree is a small checkbox tree over `get_all_playlists`.
- `src/lib/tauri-api.ts`: `djExportDefaults` (which also answers the
  remembered playlists), `pickDjExportFile`, `exportToDj`, and
  `djExportLastTarget` (reads `dj_export.last_target` through `get_setting`).
- `src/components/FolderTree.tsx`: **Export to DJ software…** in the playlist
  and folder menus (`onExportToDj`), passed from `App.tsx` through
  `src/components/layout/Sidebar.tsx` like `onExportPlaylist`, next to the
  existing export modal.
- The folder checkbox's mixed state is a native checkbox with `indeterminate`
  set through a ref (there is no shared checkbox component).
- The success toast uses `toast(…, { action: { label: 'Show in Finder', … } })`
  and reveals the file with the opener plugin.

## Errors

| Case | What happens |
|---|---|
| A track's file is missing | Skipped; listed in the toast's detail |
| A track has no BPM or key | Written without them; the program analyses |
| Destination not writable / disk full | The error, with the path, shows in the dialog, which stays open (a toast would sit under the dialog's overlay); the previous file is untouched (temp file synced, then renamed) |
| Traktor: the chosen file is Traktor's own `collection.nml` | Refused in the dialog: writing it would replace the DJ's Traktor collection |
| Serato DJ is running | Export stops: "Close Serato DJ first, then export again." |
| No `_Serato_` folder on the system drive | The dialog says Serato is not set up here; Export is disabled |
| No playlist checked | Export is disabled |
| The checked playlists were deleted meanwhile | The export stops ("The chosen playlists no longer exist"); the previous file is untouched |
| The choice cannot be saved after a good write | The export still succeeds; the failure is only logged |
| A playlist is empty, or all its files are missing | Written as an empty playlist; counted |

## Testing

- **Writers (Rust, inline `#[cfg(test)]`)**: a small `ExportLibrary` with
  awkward names and paths — `&`, `#`, `%`, `'`, `"`, spaces, č/ć/š, an emoji,
  a Windows path, a file on an external drive, two nested folders, a track in
  two playlists, a track without BPM/key, a missing file — compared to golden
  output files under `src-tauri/src/formats/fixtures/`.
- **Keys**: all 24 Camelot codes for both formats; invalid input gives none.
- **Paths**: each encoder on the same awkward set.
- **Serato**: write → `read` gives back the same crates; field framing
  (lengths, UTF-16BE) checked byte by byte on a tiny crate.
- **`collect`**: an in-memory database with folders, playlists and tracks.
- **Frontend (vitest)**: the dialog's selection (folder checks children,
  indeterminate, remembered playlists added, deleted ones dropped), the
  disabled Export, the result toast text.
- **Verification against real files** (provided by the user, small: 2–3
  tracks each), kept as fixtures and used to fix the exact shape:
  - Rekordbox: *File → Export Collection in xml format* (or one playlist).
  - Traktor: right-click a playlist → *Export Playlist* (`.nml`).
  - Serato: one `.crate` from `~/Music/_Serato_/Subcrates/`.
- **By hand at the end of each phase**: import the export into the real
  program and check playlists, tracks, BPM, key, rating and comments.

### Verification list

Settled against the real exports or by hand, before the phase that needs it
is done:

- Rekordbox: ~~attribute order and shape~~ ✓ identical to a Rekordbox 7.2.19
  export (pinned by a test against a sanitized fixture); ~~`Tonality`
  spelling~~ ✓ classic notation (`Am`, `Em`, `Fm`, `Gm`; sharp/flat spelling
  still unseen); ~~`Location` encoding~~ ✓ now matches (`(` `)` `,` raw,
  lowercase hex); Unicode normalization of paths; and what Rekordbox does with
  formats it cannot play (OGG), which the scanner accepts.
- ~~Rekordbox: whether data reaches tracks it **already has**~~ ✓ only new
  tracks take it (Rekordbox 7.2.19: a rating changed in RecoDeck did not reach
  a track already in the collection); importing again duplicates nothing. The
  how-to and "What it does not do" say so.
- ~~Traktor: Import Playlist brings the RecoDeck folder and its playlists;
  tracks new to Traktor take RecoDeck's BPM and key~~ ✓ (checked by the user
  in Traktor 3.11.1). Rating and comments on new tracks not looked at yet.
- Traktor: whether data (BPM, key, rating, comments) reaches tracks it
  **already has**, or only new ones.
- Traktor: ~~the key integers~~ ✓; ~~`INFO BITRATE` unit~~ ✓ bit/s;
  ~~`VOLUMEID`~~ ✓ repeats the volume name; ~~the volume name for files under
  `/Users`~~ ✓ "Macintosh HD"; ~~Unicode normalization~~ ✓ NFC (all from
  Traktor 3.11.1's own collection and history files); what a second import of
  the same playlist does; `VOLUME`/`VOLUMEID` for a track on an external drive
  (the collection has only boot-volume tracks).
- Serato: the crate's fields beyond `vrsn` / `otrk` / `ptrk`; whether
  intermediate folder crates are needed.
- Windows shapes (drive letters, separators, `file://localhost/C:/`) cannot be
  checked against the user's exports (macOS); they are built to the formats'
  documented shape and are best-effort until a Windows user tries them.

## Phases

Each phase is complete on its own and can ship as a release, and each gets
its own implementation plan.

1. **Core + dialog + Rekordbox**: `formats` model and loader, `keys`, Rekordbox
   path encoder and writer, the command with settings, the dialog (Rekordbox
   tab enabled, Traktor and Serato shown as "coming" or hidden — decided in
   the plan), the menu items.
2. **Traktor**: volume lookup, path encoder, NML writer, its tab.
3. **Serato**: crate writer and reader, per-drive placement, running check,
   remembered crates, its tab.

## Out of scope

Cue points, beatgrids, track colours, writing tags into audio files, keeping
an export updated automatically, Engine DJ and VirtualDJ, importing from DJ
software, and any change to Export to folder.
