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
  `.tabs` with the thumb). The last one used is remembered.
- **Playlists**: the playlist tree with checkboxes. A folder's box selects or
  clears everything inside it (mixed shows as indeterminate). Opened from a
  playlist, that playlist is checked **plus** the playlists of this program's
  previous export, so exporting again never drops a playlist by accident.
  Opened from a folder, its playlists are checked plus the previous ones.
  Playlists deleted since are left out silently.
- **Where**, per program, with a **Change…** button:
  - Rekordbox: a file, default `~/Music/RecoDeck/RecoDeck.xml`
    (`%USERPROFILE%\Music\RecoDeck\RecoDeck.xml` on Windows).
  - Traktor: a file, default `~/Music/RecoDeck/RecoDeck.nml`.
  - Serato: the system drive's `_Serato_` folder (`~/Music/_Serato_`), found
    by RecoDeck; if it does not exist, Serato is not set up on this computer
    and the dialog says so (Change… picks another `_Serato_` folder).
    Tracks on an external drive go to that drive's `_Serato_` (see Serato
    below) — the dialog lists those drives under the path.
- **How to load it** — one or two lines for the selected program:
  - Rekordbox: *Preferences → Advanced → Database → rekordbox xml → Imported
    Library: choose this file. Then refresh "rekordbox xml" in the tree and
    drag the playlists where you want them.* (Shown in full until the first
    export to Rekordbox, then as one line.)
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
  (artist – title, path).
- Everything RecoDeck writes sits under a **RecoDeck** folder (Rekordbox,
  Traktor) or a **RecoDeck** crate (Serato), apart from the DJ's own playlists.
- Exporting again: open the dialog, the previous selection and path are there,
  press Export. The file is rewritten from the current playlists.

### What it does not do

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
| Duration, bitrate, sample rate, size, kind | yes | duration, bitrate | — |
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
- to Traktor's integer. Assumed: 0–11 = C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯,
  B major; 12–23 = the same roots minor. Checked against a real Traktor export
  before phase 2 is done.

A missing or unreadable key writes no key attribute.

### Paths

Paths cause most import failures, so each writer has its own tested encoder:

- **Rekordbox** `Location`: `file://localhost` + the absolute path,
  percent-encoded per segment (space, `#`, `%`, `&`, `?`, non-ASCII as UTF-8),
  `/` kept. Windows: `file://localhost/C:/Music/…`.
- **Traktor** `LOCATION`: `VOLUME` is the volume name — the boot volume's name
  on macOS (e.g. "Macintosh HD", read from the system, not assumed), the
  `/Volumes/<name>` part for external drives, the drive letter (`C:`) on
  Windows. `DIR` is the folder path after the volume in Traktor's `/:` form
  (`/:Users/:dj/:Music/:`), `FILE` the file name. The playlist's `PRIMARYKEY
  KEY` is `VOLUME` + `DIR` + `FILE`. XML attribute escaping applies on top.
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
escaping function (`&`, `<`, `>`, `"`, `'`, and control characters dropped):
no XML crate, so the output stays exactly as Rekordbox expects.

### Traktor NML

`NML VERSION="19"`, `HEAD`, `COLLECTION` with one `ENTRY` per track
(`LOCATION`, `ALBUM`, `INFO`, `TEMPO`, `MUSICAL_KEY`), and `PLAYLISTS` with
`$ROOT` → `RecoDeck` folder → playlists (`PLAYLIST ENTRIES TYPE="LIST"
UUID`), each entry a `PRIMARYKEY TYPE="TRACK"`. A playlist's UUID is derived
from its RecoDeck id, so re-imports refer to the same playlist. Shape follows
a real Traktor playlist export (Verification).

### Serato crates

- A crate is a sequence of tagged fields: 4 ASCII bytes, a 4-byte big-endian
  length, the value. Header `vrsn` = UTF-16BE "1.0/Serato ScratchLive Crate";
  then each track as `otrk` holding `ptrk` (the path). Any column / sort
  fields a real crate carries are copied from a real crate (Verification).
- Files go to `<drive>/_Serato_/Subcrates/`: the system drive's is
  `~/Music/_Serato_`, an external drive's is `/Volumes/<name>/_Serato_`
  (`D:\_Serato_` on Windows). A playlist with tracks on two drives becomes
  a crate of the same name on each; Serato shows them as one.
- Names: `RecoDeck.crate` (the parent) and `RecoDeck%%<Folder>%%<Playlist>.crate`.
  Characters a file name cannot hold are replaced.
- RecoDeck remembers the crate files it wrote. Exporting again deletes those
  that are no longer in the selection, then writes the new set. It never
  touches crates it did not write.
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
    `parent_id` for folders), their tracks with `track_analysis`, and checks
    each file exists. Missing files are kept with `exists: false`; writers
    skip them and the command reports them.
- `keys.rs` — Camelot → Rekordbox notation, Camelot → Traktor integer.
- `rekordbox.rs` — `write(&ExportLibrary, app_version) -> String`.
- `traktor.rs` — `write(&ExportLibrary, volumes) -> String`.
- `serato.rs` — `write(&ExportLibrary, volumes) -> Vec<CrateFile { path,
  bytes }>`, and `read(bytes)` for tests.
- `paths.rs` — the per-format path encoders and the volume lookup (boot volume
  name, `/Volumes/<name>`, drive letters), the only part that asks the system.

The writers are pure: no database, no disk. Everything they need comes in.

### Rust: `commands/dj_export.rs`

- `dj_export_defaults(target) -> { path, exists, note }` — the default file
  or `_Serato_` folder and whether it exists.
- `pick_dj_export_path(target)` — a native save-file picker (Rekordbox,
  Traktor) or folder picker (Serato), callback-based like `pick_export_folder`
  so it does not deadlock on macOS; no new frontend dialog permission.
- `export_to_dj(target, playlist_ids, path) -> DjExportResult { playlists,
  tracks, skipped: [{ artist, title, path }], written: [paths] }`:
  1. lock the DB, `collect`, release the lock (as `export_playlist_to_folder`);
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
- `src/lib/tauri-api.ts`: `djExportDefaults`, `pickDjExportPath`,
  `exportToDj`, and the remembered choice through `getSetting`.
- `src/components/FolderTree.tsx`: **Export to DJ software…** in the playlist
  and folder menus (`onExportToDj`), wired in `App.tsx` next to the existing
  export modal.
- The success toast uses `toast(…, { action: { label: 'Show in Finder', … } })`
  and reveals the file with the opener plugin.

## Errors

| Case | What happens |
|---|---|
| A track's file is missing | Skipped; listed in the toast's detail |
| A track has no BPM or key | Written without them; the program analyses |
| Destination not writable / disk full | Error toast with the path; the previous file is untouched (temp + rename) |
| Serato DJ is running | Export stops: "Close Serato DJ first, then export again." |
| No `_Serato_` folder | The dialog says Serato is not set up here; Change… picks one |
| No playlist checked | Export is disabled |
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

## Phases

Each phase is complete on its own and can ship as a release.

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
