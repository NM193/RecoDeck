# Duplicates Merge — Design

## Why

The Duplicate Tracks modal (Settings → Database) deletes the copies the user
selects. Deleting a copy also deletes everything attached to it:
- **playlists** — `bulk_delete_tracks` runs `DELETE FROM playlist_tracks WHERE track_id = ?`. If the removed copy was the one in a playlist, the playlist silently loses the song. The kept copy does not take its place.
- **play history** — `play_history` cascades on delete.
- **Spotify / YouTube Music match verdicts** — a trigger deletes them.

This spec replaces delete with **merge**. The removed copy hands everything it
owns to the copy that stays, and the app stops re-importing its file.

The look was picked from an interactive mockup during brainstorming. It is not
in the repo. Every value it settled is recorded here.

## Scope

In:
- merge instead of delete, in one transaction;
- a better recommended keep, with the reason shown;
- the playlists each copy is in, shown per copy;
- the removed copy's file is skipped on future scans;
- an optional "move removed files to Trash".

Out (parked in the ideas backlog):
- Undo;
- a "Not a duplicate" mark;
- warnings for "same title & artist" copies that are probably different versions (duration, mix name);
- audio-fingerprint duplicates (MP3 vs WAV of one track);
- the import-time warning;
- a list of skipped files to un-skip.

Known limits, not changed here:
- The "same title & artist" pass skips tracks with an empty artist.
- The orphaned auto-cleanup `remove_duplicate_tracks` / `cleanup_duplicate_tracks` has no UI caller, so it is left alone.
- If a removed copy is loaded in the player during a merge, its next play event fails on the foreign key and is not recorded. This is minor and accepted.

## Terms

In each duplicate group the user picks exactly one **kept** copy (K). Every
other copy is either **merged** into K (R) or **left as is**. A copy that is
left as is is not touched at all.

## Data rules

All of this runs for each R into its K, inside ONE SQLite transaction for the
whole merge request. Either every group merges or nothing changes.

| Data | Table / column | Rule |
|---|---|---|
| Playlist slots | `playlist_tracks` (PK `playlist_id, track_id`) | If K is not in that playlist, R's row gets `track_id = K` and keeps its `position`. If K is already there, R's row is deleted and K's slot stays. |
| Tags | `track_tags` (PK `track_id, tag_id`) | union: `INSERT OR IGNORE` R's rows as K, then delete R's rows |
| Genres | `track_genres` (PK `track_id, genre`) | union, same way |
| Discogs styles | `track_discogs_styles` (PK `track_id, style`) | union, same way |
| Instruments | `track_instruments` (PK `track_id, instrument`) | union, same way |
| Play history | `play_history.track_id` | repoint every row to K. Must run before R is deleted, or the cascade erases it. This is also how the play count carries over: the app counts plays as `play_history` rows (`get_play_counts`). `tracks.play_count` is not kept up to date anywhere, so it is left as it is. |
| Rating | `tracks.rating` | the higher of the two |
| Comment | `tracks.comment` | K's. If K's is empty, R's. If both are non-empty and different: `K + " / " + R`. |
| Genre | `tracks.genre`, `tracks.genre_source` | Rank the sources `user` > `tag` > `ai`. R's genre and source replace K's when K has no genre, or when R's source ranks higher than K's. Otherwise K's stays. |
| Date added | `tracks.date_added` | the earlier of the two |
| BPM / key / loudness | `track_analysis` (PK `track_id`) | Rows are often partial: a played track gets a waveform-only row, and tag BPM at import gives a BPM-only row. So merge **column by column**, scalar columns only: `bpm`, `bpm_confidence`, `musical_key`, `key_confidence`, `loudness_lufs`, `dynamic_range`, `spectral_centroid`, `analyzed_at`. Each NULL one on K is filled from R. If K has no row, K gets a new row with R's scalar columns. **The waveform and spectrogram columns (`waveform_overview`, `waveform_detail`, `spectrogram_data`) are never carried over.** They describe R's own audio, which can differ (radio edit vs extended), and the app regenerates a missing waveform on demand. R's row is then deleted. |
| Deep analysis | `track_deep_analysis` (PK `track_id`) | same, column by column |
| Embeddings | `track_embeddings` (PK `track_id`) | whole row: K's if it exists, else R's moves to K. R's row is then deleted. |
| Fingerprint | `track_fingerprints` (PK `track_id`) | same as embeddings |
| Cue points | `cue_points.track_id` | R's cues move to K only if K has none. Another file can start at a different offset, so mixing cue sets would be wrong. Otherwise R's cues are deleted. |
| Spotify verdicts | `spotify_match_verdicts` (PK `spotify_id, library_track_id`) | `INSERT OR IGNORE` as K, so K's own verdict wins on a clash. Then delete R's rows. The delete trigger would remove them anyway. |
| YouTube Music verdicts | `ytm_match_verdicts` (PK `video_id, library_track_id`) | same as Spotify |
| The track row | `tracks` | R's row is deleted last, after every reference above is moved or removed. |
| The file | `skipped_files` (new) | R's `file_path` is recorded. See Files. |

Free-text history (AI chat messages, the taste-profile cache) may mention old
ids. It is left alone.

## Recommended keep

The backend picks a recommended K per group. The copies are sorted by these
rules, and the first rule that tells two copies apart wins:

1. lossless beats lossy. `file_format` holds the lowercased file extension. Lossless means:
   - `wav`, `aif`, `aiff`, `flac`;
   - `m4a` with `bitrate` ≥ 500 kbps (ALAC; AAC never gets that high).

   Everything else is lossy.
2. higher `bitrate` (stored in kbps);
3. analyzed: the copy's `track_analysis` row has `bpm IS NOT NULL OR musical_key IS NOT NULL`. A waveform-only row does not count.
4. in more playlists;
5. more plays (the `play_history` row count);
6. lower id (the earlier import).

**Reason text.** It compares the winner with the runner-up (the second copy
in the sorted order). It lists, in rule order, every rule from 1 to 5 where
the winner is strictly better, and shows the first two:

| Rule | Text |
|---|---|
| 1 | `WAV (lossless)`, `AIFF (lossless)` (`aif` and `aiff`), `FLAC (lossless)`, `ALAC (lossless)` (`m4a`) |
| 2 | `320 kbps`, the winner's bitrate. Left out when rule 1 already applies. |
| 3 | `analyzed` |
| 4 | `in 1 playlist` / `in N playlists`, the winner's count |
| 5 | `1 play` / `N plays`, the winner's count |

The parts are joined with ` · `, e.g. `WAV (lossless) · in 3 playlists`. If
none of rules 1–5 applies, the reason is `added first`.

## Files

### Skipped on future scans

New migration `020_skipped_files.sql`:

```sql
CREATE TABLE IF NOT EXISTS skipped_files (
    file_path      TEXT PRIMARY KEY,
    kept_track_id  INTEGER,            -- the copy it was merged into (may be gone later)
    skipped_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`Database::get_all_file_paths` also returns every `skipped_files` path (a
`UNION`), and its doc comment says so. It has exactly two callers, and both use
it as "paths to skip":
- the live folder scan in `commands/library.rs` (around line 280);
- `Scanner::import_directory` in `scanner.rs`, which only tests call.

So a skipped path is treated as already known and counted as skipped.

The scan compares raw walked paths with this set, and old rows may hold
double-slash paths. So R's path is stored normalized the way imports are
normalized: `normalize_scanned_path`. That function is nested inside
`Scanner::extract_metadata` today, and moves to module level in `scanner.rs`
so the merge can call it.

Copies with identical bytes were already blocked by the hash check. This list
is what stops a copy with different bytes from coming back.

### Optional: move to Trash

When "Also move removed files to Trash" is checked, each merged R's file is
moved to the macOS Trash after the transaction commits. File moves cannot be
rolled back. If a move fails (file missing, external drive gone, no
permission), the merge still counts. The failure is reported in the summary,
and the path stays in `skipped_files`. The crate or API is chosen in the plan:
the `trash` crate or `NSFileManager trashItemAtURL`.

**Never trash a file that is still in use.** Two rows can point at one
physical file under different path strings:
- old double-slash paths;
- case differences on case-insensitive APFS;
- symlinked folders.

After the commit, and before trashing R's file, compare it with every track
row still in the DB. The request does not carry the copies left as is, so
checking the whole DB is the only way to catch them, and it is safer anyway.
To keep it cheap, compare only with rows of the same `file_size`. Compare by
canonicalized path, and by device + inode when both files exist. If any row
is the same file, R is not trashed and is reported in `trash_failed`.

## Backend API

- `get_duplicate_groups`: `DuplicateGroupDTO` gains:
  - `recommended_keep_id: i64` and `recommend_reason: String`;
  - `tracks` becomes `Vec<DuplicateTrackDTO>`: the shared `TrackDTO` (`#[serde(flatten)]`) plus `playlists: Vec<{ id, name }>` (name order), `analyzed: bool` (rule 3's definition) and `plays: i64` (`play_history` count).

  The shared `TrackDTO` is not changed. Groups and passes are unchanged. `tracks` stays sorted by id.
- New `merge_duplicate_tracks(merges: Vec<{ keep_id, remove_ids }>, move_to_trash: bool) -> MergeSummary`:
  - `MergeSummary`: `{ merged, playlist_slots_moved, trashed, trash_failed: Vec<String> }`;
  - `playlist_slots_moved` counts R rows repointed to K. Slots dropped because K was already in that playlist are not counted.
  - it rejects a request where a `keep_id` also appears in some `remove_ids`, or an id appears twice;
  - remove ids that no longer exist are skipped, not an error. If a `keep_id` no longer exists, that whole group is skipped.
  - DB logic lives in a new `db/merge.rs` (`Database::merge_tracks`, transaction via `unchecked_transaction()` like `db/home.rs`). The command goes in `commands/library.rs` like its neighbours and is registered in `lib.rs` next to `delete_tracks_bulk`.
  - Migration 020 runs unconditionally in `run_migrations`, like 015 and 017.
- `delete_tracks_bulk` stays. Nothing calls it from this modal any more.

## The modal

`src/components/DuplicatesModal.tsx` and its CSS. UI text is English. Two other files change with it:
- `src/types/track.ts`: `DuplicateGroup` gains the new fields, plus a `DuplicateTrack` type;
- `src/lib/tauri-api.ts`: a new `mergeDuplicateTracks`. `deleteTracksBulk` stays.

- Each copy row has two controls on the left:
  - **Keep**: a radio, one per group;
  - **Merge**: a checkbox, disabled on the kept row.
- When the modal opens, Keep = the recommended copy and every other copy is checked for Merge. Picking Keep on another copy makes it K, and the old K becomes a checked Merge row.
- Per copy:
  - line 1: title, artist, and a green `RECOMMENDED <reason>` badge on the recommended copy;
  - line 2: path, in mono;
  - line 3: format and bitrate, duration, size, analyzed / not analyzed, plays (`plays`), date added;
  - line 4: `Playlists:` with one chip per playlist, or `not in any playlist`;
  - line 5: a status line —
    - kept row: `Stays in your library` (green);
    - merged row: `Merges into the kept copy · its N playlist slot(s) move over` (indigo). N counts R's playlists that K is not in, matched by playlist id. When N = 0 the second part is left out. If two merged copies share a playlist K is not in, both rows count it. That small over-count is accepted; the toast reports the real number.
    - left row: `Left as is` (grey).
- Row tints:
  - kept: `rgba(34,197,94,.06)`;
  - merged: `rgba(99,102,241,.07)`;
  - left: none.
- Header summary: `N groups · M copies will be merged`.
- Toolbar: the filter tabs stay. "Select all" becomes **Merge all / Merge none**, acting on the visible groups' Merge boxes.
- Footer:
  - left: a checkbox **Also move removed files to Trash**, off by default, with the hint `Either way, removed files are skipped on future scans.`;
  - right: Cancel, then the action button:
    - unchecked: `Merge M` (primary);
    - checked: `Merge M & move to Trash` (danger);
    - disabled when M = 0.
- After a merge:
  - a toast: `Merged M · S playlist slots moved`, plus `· T files in Trash` when used, plus `· F could not be moved to Trash` when F > 0;
  - then `onTracksChanged()`, and the groups reload.

## Errors

- **The transaction fails:** nothing changed. Show the error toast and keep the modal state.
- **A Trash move fails:** see Files. It is a warning in the toast, not an error.

## Tests

Rust, in-memory DB (`Database::new_in_memory`, FK on), in `db/merge.rs`. Tests
call `run_migrations()` themselves, as `scanner.rs` tests do. One test per row
of the data-rules table, plus:
- R and K in the same playlist: one slot left, at K's position;
- R in a playlist K is not in: K takes R's position;
- K has a waveform-only `track_analysis` row and R has BPM + key: K ends up with its own waveform plus R's BPM + key. K has no row: K gets R's scalar columns, and its waveform columns stay NULL;
- a `user` genre on R beats a `tag` genre on K. A `tag` genre on R does not beat a `user` genre on K;
- play history survives and the play count is the sum;
- a 3-copy group with one copy left as is: that copy is untouched;
- a missing `keep_id` skips its group, and the other groups still merge;
- a real failure inside the transaction changes nothing. The test adds a `BEFORE DELETE ON tracks` trigger that raises for R's id;
- after a merge, `get_all_file_paths()` contains R's path, including when R's stored path had a double slash;
- Trash: R's path is a different string for the same file as K (e.g. via a symlinked folder). R's file is not trashed and is reported;
- the recommended-keep order, one case per rule (including `aif` and `m4a` ≥ 500 kbps), with its exact reason text.

Frontend: the existing modal tests, if any, are updated. The keep/merge state
logic is a small pure function with a vitest test.
