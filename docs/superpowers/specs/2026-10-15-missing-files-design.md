# Missing Files — Design

## Why

A track whose file was moved keeps pointing at the old path. The scanner never
fixes it:
- it skips a file whose path is known, and
- it also skips a file whose **content hash** already exists in `tracks`
  (`track_exists_with_hash`, in `commands/library.rs::scan_directory` and
  `Scanner::import_file`).

So a moved file is never imported, and the old row keeps a dead path. The row
still owns playlist slots, plays, analysis and ratings, but the track can't
play. The user's library has about 100 such rows.

This spec does two things:
1. the scanner **follows** a moved file when its content is unchanged;
2. a **Missing Files** review handles the rest: files that were renamed,
   re-tagged, or are gone.

The look was picked from an interactive mockup during brainstorming. It is not
in the repo. Every value it settled is recorded here.

## Scope

In:
- the scanner relinks a stale row to its moved file (same content hash);
- Settings → Database → **Review Missing Files**, with a count;
- the review suggests files with the same name and lets the user pick
  **Relink / Merge · Leave · Remove** per track;
- per-track **Locate…** / **Other file…** and a **Search another folder…**.
  A file or folder outside the library folders is offered as a new library
  folder (user decision 2026-10-15), so a track never ends up outside the
  library;
- a related fix: the folder cleanups delete a track completely, in one
  transaction (section 6, user decision 2026-10-15).

Out:
- matching by anything but the exact file name (another extension, fuzzy
  names, the other Unicode form of an accented name). Locate… covers those;
- re-reading tags from the new file, or re-analysing it;
- an un-skip UI for `skipped_files`;
- Undo. Remove is never pre-selected;
- relinking to a file outside the library folders.

## Terms

- **Missing track**: a `tracks` row whose `file_path` does not exist on disk
  (`Path::exists() == false`).
- **Candidate**: a file on disk that might be the missing track's file.
- **Free file**: a candidate that is not a library track.
- **Library candidate**: a candidate that already is a library track. It
  carries that track's id.

## 1. Scanner follows moved files

The decision lives in one function in `db/missing.rs`, and both scan paths call
it: `commands/library.rs::scan_directory` (the one the app uses) and
`Scanner::import_file` (used by tests). This way the tests cover the real
path. When a scanned file's hash (not `"unknown"`) matches existing rows:
- **some row with that hash has its file on disk:** skip, as today;
- **no row with that hash has its file on disk:** relink the row with the
  lowest id to the scanned file (see Relink below). It counts as `relinked`,
  not `imported` or `skipped`. Other stale rows with the same hash stay as they
  are, and the duplicates review handles them.

`ScanResult` / `ScanResultDTO` / the TS `ScanResult` gain `relinked: usize`.

The UI says so when `relinked > 0`:
- **Settings scans** (Add folder, Rescan, Rescan all): a success notification
  `Followed N moved file(s)`. Rescan all sums its folders.
- **The `library-changed` watcher rescan** in `App.tsx`: the same text as a
  toast.

Accepted behaviour: while an external drive is unplugged, a scan that finds
the same content elsewhere relinks the row there. The track keeps working.
When the drive comes back, its file is skipped as a duplicate of a live row.

## 2. Relink

Relinking track T to file F is one rule, used by both the scanner and the
review:
- **Changes on T:**
  - `file_path` = F, normalized with `normalize_scanned_path`;
  - from F itself: `file_hash`, `file_size`, `file_format`, `bitrate`,
    `sample_rate`, `duration_ms`.
- **Never changes:** T's id, tags (title, artist, album, label, comment,
  genre…), rating, date added, analysis, cues, playlists, plays and verdicts.
- F's path is deleted from `skipped_files` if it is there.
- **Refused:** when F is already the path of another track. That case is a
  Merge (below).

Analysis made for the old file stays. For the same song in another encoding,
BPM and key still hold, and the waveform and cues stay close enough.

## 3. Finding candidates

`get_missing_tracks()` works like this:
1. Collect the missing tracks.
2. Build a name index by walking the library folders (setting
   `library_folders`) with `Scanner::scan_directory` (supported audio
   extensions only). The index maps each lower-cased file name to its
   normalized paths, without repeats: library folders can overlap (a parent
   and its subfolder).
3. A missing track's candidates are the index entries for its own file name,
   lower-cased, ordered by path.
4. For each candidate, read with lofty:
   - `duration_ms` (properties only, no hash);
   - `file_size` from the file's metadata.
5. Decide whether each candidate is a free file or a library candidate:
   - **a `tracks` row has the path:** library candidate, carrying that row's id;
   - **the path is in `skipped_files`:**
     - free file when its `kept_track_id` is this missing track, is NULL,
       no longer exists, or is itself a missing track (Relink also takes it
       off the skip list);
     - otherwise, a library candidate of that `kept_track_id`;
   - **otherwise:** free file.

   So a library candidate's track always has its file on disk. It is never a
   row in this review.
6. Drive check: a path under `/Volumes/<name>/` whose `/Volumes/<name>` does
   not exist reports `drive_missing: Some(name)`.

`count_missing_tracks()` stats every track path and returns the count. Settings
calls it to show the number.

`describe_file(track_id, path)` serves Locate… and Other file…. It returns the
same candidate shape for one picked file: the normalized path, duration, size,
and the library track id per rule 5. The rule needs `track_id`.

Every path the review shows, compares or sends is normalized with
`normalize_scanned_path`. The frontend conflict check and the backend
validation therefore compare the same strings.

**Threading:** every one of these commands runs in `spawn_blocking`. The disk
work happens without the `state.db` lock: the walk, lofty reads, stat calls,
and hashing in the apply. The lock is held only for the queries and the
transaction, as in `scan_directory`. That keeps the app responsive while about
100 WAVs are hashed.

## 4. Applying

`apply_missing_fixes(relinks, merges, removes) -> MissingFixSummary`:
- `relinks: Vec<{ track_id, path }>`, `merges: Vec<{ keep_id, remove_id }>`,
  `removes: Vec<track_id>`.
- **Validation (rejects the whole call):**
  - a track id appears twice across the relinked ids, the merge `remove_id`s
    and the removes;
  - a relink path appears twice;
  - a merge whose `keep_id` is also a relinked, merged-away or removed track.

  Several merges may share a `keep_id`. Two stale rows can merge into the same
  live track. Merges are grouped by `keep_id` into one `MergeRequest` each, so
  the duplicates validator (`validate_requests`) still holds for them.
- **Before the transaction**, each relink's file is read: its hash, size and
  audio properties. A file is dropped from the batch and reported in
  `skipped` when:
  - it no longer exists: `file is gone`;
  - lofty or the hash can't read it: `file can't be read`.
- **Inside the transaction**, under the lock, each change is checked again.
  The list doesn't reload on library events, so a watcher scan may have
  changed things while the modal was open:
  - a relink whose path is now another track's file is skipped with
    `file is now another track`;
  - a relink whose path is already this track's own path is a no-op. It is
    not counted and not reported;
  - a relink, merge or remove whose track's file exists again is skipped with
    `file is back`. A scan may have followed it;
  - a merge whose kept track lost its file in the meantime is skipped with
    `kept track's file is missing`, so history never moves onto a dead track.

  None of these is a rollback.
- **One transaction**, in order: relinks, then merges, then removes.
  - **Merges** reuse the duplicates merge (`db/merge.rs`) inside this
    transaction. `merge_tracks` is split so its body runs on a given
    transaction, and `merge_tracks` keeps its own transaction around it. The
    missing track is R and the live library track is K.
  - The merge records R's dead path in `skipped_files`, as usual. That is
    harmless.
  - **Remove** deletes the track completely:
    - first its rows in `playlist_tracks`, `track_tags`, `track_genres`,
      `track_discogs_styles`, `track_instruments`, `track_embeddings`,
      `track_fingerprints`, `track_analysis`, `track_deep_analysis` and
      `cue_points`;
    - then the `tracks` row. `play_history` cascades, and the Spotify and
      YouTube Music verdicts go by their delete triggers.

    Files on disk are never touched.
- A track id that no longer exists is skipped, not an error. It goes into
  `skipped` with the reason `track no longer exists`.
- A merge whose K no longer exists is skipped the same way, with
  `kept track no longer exists`. The apply checks K inside the transaction,
  before it calls the merge body. Today `merge_tracks` drops these silently,
  and that does not change.
- **Returns** `{ relinked, merged, removed, skipped: Vec<{ track_id, reason }> }`.

New code goes in `db/missing.rs` (the queries, relink, full delete, apply).
The commands go in `commands/library.rs`, registered in `lib.rs` next to
`merge_duplicate_tracks`.

### DTO

`MissingTrackDTO`:
- the shared `TrackDTO`, flattened;
- `playlists`, `analyzed` and `plays`, built exactly as for `DuplicateTrackDTO`
  (reuse `copy_facts`);
- `drive_missing: Option<String>`;
- `candidates: Vec<{ path, duration_ms: Option<i64>, file_size: Option<i64>,
  library_track_id: Option<i64>, library_title: Option<String>,
  library_artist: Option<String> }>`. The title and artist are the library
  track's, so a Merge row can name it.

Sorted by artist, then title.

## 5. The review

`src/components/MissingFilesModal.tsx` uses the Duplicate Tracks modal's
look. It reuses the shared parts of `DuplicatesModal.css` (shell, tabs, cards,
rows, segmented control, footer) and adds its own CSS only for what is new.
UI text is English. The state logic lives in a pure
`src/lib/missingFiles/missingChoice.ts`, tested with vitest.

### Entry

In Settings → Database, below Review Duplicate Tracks:
- a full-width button `Review Missing Files`, with a count badge when the
  count is > 0. The count loads in the background, so the button shows at
  once without a badge. It is counted again when the section mounts and when
  the modal closes;
- the hint `Tracks whose file was moved, renamed or deleted.`

The section's description becomes `Clean up duplicate tracks and files that
went missing.`

### Layout

- **Header:** `Missing Files`. Summary: `N tracks point to a file that isn't
  there · F found by file name`.
- **Toolbar:**
  - tabs **All · Found · Not found**, with counts;
  - on the right, a quiet `Search another folder…` text button. It opens a
    folder picker:
    - a folder inside the library folders is already searched. A toast says
      `Already in your library folders`;
    - a folder outside goes through **Add to library** (below).
- **Two cards:**
  - **Found by file name**, hint `Same file name somewhere in your folders`;
  - **Not found**, hint `Moved off this Mac, or deleted`.

  A tab shows only its card.
- **One row per track:**
  - **line 1:** `title — artist`. Pills, and both can show:
    - `Already in library` (blue) when the chosen candidate is a library
      candidate;
    - `Length differs` (amber) when the lengths differ.
  - **line 2:** the old `folder / file` (muted, full path in a tooltip), then
    `→`. After it:
    - one candidate: its `folder / file`;
    - several candidates: a `<select>` of them;
    - then a quiet `Other file…` text button. It works like Locate…, for when
      the same-name file is the wrong one (generic names like
      `01 Track.mp3`).
  - **line 3**, facts:
    - `in library as <title — artist>` on a Merge row, amber when the title
      or artist differs from the row's;
    - `length differs: X in library, Y found` (amber), when it applies;
    - `on drive NAME, not connected`, when `drive_missing`;
    - `analyzed` / `not analyzed`, `N plays` / `no plays`, `in A, B` /
      `no playlists`;
    - on Merge: `plays, playlists and analysis move into it` (accent);
    - on Remove, when the track is in playlists: `leaves N playlist(s)`
      (danger).
  - **Right:**
    - a segmented control **Relink · Leave · Remove**. The first button reads
      **Merge** when the chosen candidate is a library candidate, and it is
      disabled when there is no candidate.
    - Rows with no candidate also get a `Locate…` button. It opens a file
      picker for audio files:
      - **a file inside the library folders:** calls `describe_file`, adds
        the result as the row's chosen candidate and sets the row to
        Relink / Merge. The row then has a candidate, so it moves to the
        Found card;
      - **a file outside:** its folder goes through **Add to library**, and
        then the file is described as above.
  - A picked file stays on its row across reloads. Each reload calls
    `describe_file` for it again, because an apply or a scan may have made
    it a library track.
  - **Row tints:** Relink/Merge = faint success, Remove = faint danger,
    Leave = plain.

### Add to library

A folder outside every library folder is offered as a new library folder.
- **"Inside"** means the path equals a library folder, or starts with one
  plus `/`. A pure TS helper decides this, with a vitest test. It checks
  against `SettingsContext`'s `folders`.
- **The question** (Tauri `ask`): `Add "<folder name>" to your library
  folders? Its tracks are imported, and moved files are followed.` The
  buttons are `Add` and `Cancel`.
- **Add:** `SettingsContext` gets one shared `addFolderAndScan(path)`. The
  existing `handleAddFolder` and the modal both use it. It:
  - calls `addLibraryFolder`;
  - updates `folders`, so the Library section and Rescan all see the new
    folder at once;
  - calls `scanDirectory` and shows the `Followed N moved file(s)` notice;
  - calls `onFoldersChanged`;
  - returns the `ScanResult`.

  The modal shows `Adding <folder name>…` and can't close until that
  finishes. The scan follows moved files with identical content by itself
  (section 1). Then the list reloads, and those tracks are gone from it.
- **Locate… after Add:** if the scan followed the picked file's track, that
  row is simply gone. Otherwise the file is described per rule 5: Merge when
  it is now a library track, Relink when it is not. The scan can skip it, for
  example when it is a skipped file or the same content as a live track.
- **Cancel:** nothing changes.

### Defaults

- **Chosen candidate:** the first one the row can start on (length matches,
  and not a Merge into a differently named track), else the first whose
  length matches, else the first.
- **Length matches:** both durations are known and within 2 seconds.
- **The row starts on Relink/Merge** when its chosen candidate's length
  matches and its drive is not the missing one, and, for a Merge, the library
  track's title and artist match the row's (ignoring case and surrounding
  spaces; a row without a title never matches). Otherwise it starts **on Leave**: no candidate, length unknown,
  length differs, drive not connected, or a Merge into a differently named
  track. On an unplugged drive the file is probably still there, so a
  same-name file elsewhere is not pre-selected, even when its length matches.
  A Merge has no undo, and a same-name file of the same length can be another
  song (the sandbox test, 2026-10-16: after Twin (A) relinked to
  `New Folder/Twin.wav`, Twin (B) would have merged into it).

### Conflicts (always true, not only at start)

The state is computed so the backend's validation can never fail:
- **One free file, one relink.** A row's Relink is blocked while a row with a
  lower track id relinks the same path. The fact reads `same file as <title>`.
- **Merges never conflict.** A merge's K is always a live track, never a row
  in this list (rule 5). Several rows may merge into one K.
- **A blocked row counts as Leave**, but the user's choice is kept. When the
  blocking row changes (to Leave or to another file), the choice applies
  again. Blocking compares the rows' selected choices, so it does not depend
  on evaluation order.
- After an apply, a file that was relinked is a library track, so the next
  review offers Merge for the other row.
- **After any reload** (after Add to library, or after an apply):
  - a row the user already set keeps its choice;
  - untouched rows take the new defaults.
- Picked files last while the modal is open.

### Footer

- **Left:** `Relink keeps playlists, plays, analysis and rating. Remove takes a
  track out of the library and its playlists; files on disk are never
  touched.`
- **Right:** Cancel, then the action button:
  - its label lists the non-zero counts, e.g. `Relink 2 · Merge 1 · Remove 1`;
  - danger style when Remove > 0, primary otherwise;
  - disabled `Nothing to apply` when all are zero.
- Tabs only filter. Every row's choice applies, visible or not, because no
  row starts on Remove.

### Behaviour

- The list loads **once** when the modal opens. It does not reload on library
  events, so playback can't reset the user's choices (the Duplicate Tracks
  lesson). It reloads only after Add to library and after an apply.
- The modal can't close while an apply or an Add to library runs.
- After an apply:
  - a toast: `Relinked R · merged M · removed X`, non-zero parts only, plus
    `· S skipped` when files vanished;
  - then `onTracksChanged()`, and the list reloads with what is left.

## 6. Related fix: folder cleanups delete completely

Two existing functions delete tracks the same broken way:
- `remove_tracks_not_in_folders`, used by Remove Library Folder →
  `cleanup_stray_tracks`;
- `delete_tracks_in_folder_prefix`, used by deleting a folder in the app.

Today they run without a transaction:
1. they delete `track_analysis` and `playlist_tracks`;
2. then they delete the `tracks` rows.

With FK on, step 2 fails for a track that has tags, genres, cues and so on.
The track stays in the library, but its playlist slots and analysis are
already gone, and the frontend swallows the error.

The fix: both use Remove's complete delete (section 4) for each matching
track, all in one transaction. Either every matching track goes completely,
or nothing changes. Which tracks match does not change.

`delete_track` and `delete_tracks_bulk` have the same flaw, but no frontend
code calls them. They stay out of scope: they are already listed as dead code
to clean up.

## Errors

- **The apply transaction fails:** nothing changed. Show an error toast and
  keep the choices.
- **Add to library fails:**
  - When `addLibraryFolder` fails: an error toast, and nothing changed.
  - When the folder was added but the scan fails: the folder is in the
    library either way. `folders` updates, `onFoldersChanged` runs, an error
    toast names the scan failure, and the list reloads.
- **A relink file vanished, or became another track's file, before the
  apply:** that row is skipped and counted in the toast. The rest applies.
- **Loading fails:** the modal shows the error with a Retry button.

## Tests

Rust (in-memory DB with migrations and FK on, plus `tempfile` dirs):
- **Scanner:**
  - a moved file with the same content relinks the stale row. Its id,
    playlist slot and plays stay, and it counts as `relinked`;
  - a live row with the same hash still skips;
  - two stale rows with one hash: the lowest id relinks;
  - hash `unknown` never relinks.
- **Relink:**
  - updates path, hash, size and audio columns, and nothing else;
  - takes the path off `skipped_files`;
  - is refused for another track's path.
- **Candidates:**
  - the file name matches case-insensitively;
  - candidates are ordered by path, and a file under two overlapping
    library folders is listed once;
  - a library candidate carries its id;
  - the `skipped_files` rules, including a `kept_track_id` that is itself
    missing;
  - durations are read;
  - only library folders are searched;
  - `/Volumes` drive detection.
- **Folder cleanups:** a track with rows in every track-linked table is
  removed completely by both functions with FK on. A failure inside changes
  nothing.
- **Apply:**
  - each validation rule;
  - two merges with one `keep_id` both apply;
  - a merge moves the missing track's playlists and plays into K;
  - Remove leaves no row referencing the id. One fixture has a row in every
    track-linked table, and the delete succeeds with FK on;
  - a failure inside the transaction changes nothing (a `BEFORE DELETE`
    trigger that raises);
  - a vanished relink file is reported, and the rest applies;
  - a relink path that became another track's file inside the transaction
    is skipped, not rolled back;
  - a merge or remove whose file is back is skipped;
  - a merge whose K is gone is reported.
- **`merge_tracks`** behaves exactly as before after the split (its existing
  tests).

Frontend (vitest, `missingChoice.ts`):
- the defaults: length match, unknown, differs, no candidate, and drive not
  connected even with a matching length;
- conflicts:
  - one free file, one relink, with the lower id winning;
  - a blocked choice comes back when its blocker goes to Leave;
  - two rows merging into one K are both allowed;
- a choice survives a reload, and untouched rows take the new defaults;
- Merge vs Relink comes from the chosen candidate;
- building `relinks / merges / removes`, and the button label;
- the inside-the-library-folders helper: an equal path, a subfolder, a
  sibling with the same prefix (`/Music2` is not inside `/Music`), and a
  trailing slash.
