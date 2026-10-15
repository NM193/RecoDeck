# Duplicates Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Duplicate Tracks modal merges duplicate copies instead of deleting them. The removed copy hands its playlist slots, tags, plays and analysis to the kept copy, and its file is skipped on future scans (and can optionally go to the Trash).

**Architecture:**
- A new `db/merge.rs` does the whole merge in one SQLite transaction.
- A new `db/duplicates.rs` reads per-copy facts and picks the recommended keep.
- A new `file_trash.rs` moves files to the macOS Trash, never one a remaining track still uses.
- The Tauri commands in `commands/library.rs` expose both.
- On the frontend, the modal's state logic lives in a pure `src/lib/duplicates/mergeChoice.ts`, and `DuplicatesModal.tsx` renders it.

**Tech Stack:** Rust (rusqlite 0.31, Tauri 2), the `trash` crate 5.2.9, React + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-duplicates-merge-design.md`. Read it first. The "Data rules" table is the contract for Tasks 3–6.

**Branch:** `feat/duplicates-merge` (already created; the spec is committed there).

## Ground rules for every task

- Commit after each task. Use the message shown, and end it with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `.planning/`, `.claude/`, `.mcp.json` or `src-tauri/src/bin/recodeck-analyze.rs`. Stage only the files the task names.
- The repo is public. Test fixtures use made-up names only (`K`, `R`, `/m/...`). No real track names and no home paths.
- Rust tests run from `src-tauri/`: `cargo test --lib <filter>`.
- Frontend checks run from the repo root: `npx vitest run <file>`, `npx tsc --noEmit`, `npm run lint`.
- Pre-existing failures that are not ours: 1 test in `aiStore.test.ts` and 9 lint errors. Do not fix them, and do not count them as regressions.
- A Prettier hook reformats TS files after edits. If an Edit fails to match because of that, re-read the file and retry.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/src/db/migrations/020_skipped_files.sql` | create | the `skipped_files` table |
| `src-tauri/src/db/mod.rs` | modify | `pub mod duplicates; pub mod merge;`, migration 020, `get_all_file_paths` unions `skipped_files` |
| `src-tauri/src/scanner.rs` | modify | `normalize_scanned_path` moves to module level (`pub(crate)`) |
| `src-tauri/src/db/merge.rs` | create | `MergeRequest`, `validate_requests`, `Database::merge_tracks`, `Database::track_paths_with_size` |
| `src-tauri/src/db/duplicates.rs` | create | `CopyFacts`, `lossless_label`, `recommend`, `Database::copy_facts` |
| `src-tauri/src/file_trash.rs` | create | `same_file`, `safe_to_trash`, `move_to_trash` |
| `src-tauri/src/lib.rs` | modify | `pub mod file_trash;`, register `merge_duplicate_tracks` |
| `src-tauri/Cargo.toml` | modify | `trash = "5.2.9"` |
| `src-tauri/src/commands/library.rs` | modify | `DuplicateTrackDTO`, `PlaylistRefDTO`, new fields on `DuplicateGroupDTO`, `merge_duplicate_tracks` command |
| `src/types/track.ts` | modify | `PlaylistRef`, `DuplicateTrack`, `DuplicateGroup` fields, `MergeRequest`, `MergeSummary` |
| `src/lib/tauri-api.ts` | modify | `mergeDuplicateTracks` |
| `src/lib/duplicates/mergeChoice.ts` | create | keep/merge/left state as pure functions |
| `src/lib/duplicates/mergeChoice.test.ts` | create | its tests |
| `src/components/DuplicatesModal.tsx` | rewrite | the modal |
| `src/components/DuplicatesModal.css` | modify | row states, controls, chips, status line, Trash footer |

---

### Task 1: `skipped_files` table, and scans skip its paths

**Files:**
- Create: `src-tauri/src/db/migrations/020_skipped_files.sql`
- Modify: `src-tauri/src/db/mod.rs` (`run_migrations` ends around line 445; `get_all_file_paths` around line 1258)

- [ ] **Step 1: Write the migration**

`src-tauri/src/db/migrations/020_skipped_files.sql`:

```sql
-- Migration 020: files of duplicate copies merged away (Duplicates Merge spec).
-- A folder scan treats these paths as already known, so a merged copy whose
-- bytes differ from the kept one is never imported again.
CREATE TABLE IF NOT EXISTS skipped_files (
    file_path      TEXT PRIMARY KEY,
    kept_track_id  INTEGER,            -- the copy it was merged into (may be gone later)
    skipped_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The merge and the modal's per-copy facts look rows up by track; without
-- these every lookup (and every FK check on delete) scans the whole table.
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
```

- [ ] **Step 2: Run it from `run_migrations`**

In `src-tauri/src/db/mod.rs`, right after the migration 019 block (the `if !has_cover { ... }` block) and before `Ok(())`, add:

```rust
        // Migration 020: files of duplicate copies merged away, skipped on scans.
        // Uses CREATE TABLE IF NOT EXISTS — safe to re-run
        self.conn
            .execute_batch(include_str!("migrations/020_skipped_files.sql"))?;
```

- [ ] **Step 3: Write the failing test**

Add this new test module at the end of `src-tauri/src/db/mod.rs`:

```rust
#[cfg(test)]
mod skipped_files_tests {
    use super::*;

    #[test]
    fn get_all_file_paths_includes_skipped_files() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db.conn
            .execute("INSERT INTO tracks (file_path, file_hash) VALUES ('/m/a.mp3', 'a')", [])
            .unwrap();
        db.conn
            .execute("INSERT INTO skipped_files (file_path) VALUES ('/m/gone.mp3')", [])
            .unwrap();

        let paths = db.get_all_file_paths().unwrap();

        assert!(paths.contains("/m/a.mp3"));
        assert!(paths.contains("/m/gone.mp3"));
        assert_eq!(paths.len(), 2);
    }
}
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd src-tauri && cargo test --lib get_all_file_paths_includes_skipped_files`
Expected: FAIL. The assertion on `/m/gone.mp3` fails.

- [ ] **Step 5: Make `get_all_file_paths` union the skipped files**

Replace the doc comment and the `prepare` line of `get_all_file_paths`:

```rust
    /// Every path a folder scan should skip: the files in the library, plus
    /// the files of duplicate copies merged away (`skipped_files`), so a
    /// merged copy never comes back. Used for fast batch existence checks.
    pub fn get_all_file_paths(&self) -> Result<std::collections::HashSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM tracks UNION SELECT file_path FROM skipped_files")?;
```

Leave the rest of the function as it is.

- [ ] **Step 6: Run the test and the existing scanner tests**

Run: `cd src-tauri && cargo test --lib get_all_file_paths_includes_skipped_files && cargo test --lib scanner`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/migrations/020_skipped_files.sql src-tauri/src/db/mod.rs
git commit -m "feat(duplicates): skipped_files table; scans treat its paths as known"
```

---

### Task 2: `normalize_scanned_path` at module level

The merge stores the removed copy's path the same way imports store paths. Today the function is nested inside `Scanner::extract_metadata`.

**Files:**
- Modify: `src-tauri/src/scanner.rs` (the comment block starting `// Normalize file path: MINIMAL normalization` around line 136, through the end of the nested `fn normalize_scanned_path` just before `let raw_path = path.to_string_lossy().to_string();`)

- [ ] **Step 1: Write the failing test**

Add to `mod tests` in `src-tauri/src/scanner.rs`:

```rust
    #[test]
    fn normalize_scanned_path_collapses_slashes_and_strips_file_scheme() {
        assert_eq!(normalize_scanned_path("/m//a///b.mp3"), "/m/a/b.mp3");
        assert_eq!(normalize_scanned_path("file:///m/a.mp3"), "/m/a.mp3");
        assert_eq!(normalize_scanned_path("/m/dir/"), "/m/dir");
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src-tauri && cargo test --lib normalize_scanned_path`
Expected: FAIL to compile with "cannot find function `normalize_scanned_path`". The function is nested, so `use super::*` cannot see it.

- [ ] **Step 3: Move the function**

Cut the whole comment block and the nested `fn normalize_scanned_path(input: &str) -> String { ... }` out of `extract_metadata`. Paste them at module level, after the closing `}` of `impl Scanner` and before `#[cfg(test)]`. Dedent them, and change the signature to:

```rust
pub(crate) fn normalize_scanned_path(input: &str) -> String {
```

Leave the body unchanged. The call `let normalized_path = normalize_scanned_path(&raw_path);` inside `extract_metadata` stays, and now resolves to the module-level function.

- [ ] **Step 4: Run the scanner tests**

Run: `cd src-tauri && cargo test --lib scanner`
Expected: all PASS, including the new test.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scanner.rs
git commit -m "refactor(scanner): normalize_scanned_path at module level, so the merge can store paths the same way"
```

---

### Task 3: `db/merge.rs` — playlist slots, play history, the removed row, the skipped file

**Files:**
- Create: `src-tauri/src/db/merge.rs`
- Modify: `src-tauri/src/db/mod.rs` (the `pub mod` list at the top, lines 6–10)

- [ ] **Step 1: Register the module**

In `src-tauri/src/db/mod.rs`, add to the `pub mod` list (keep it alphabetical):

```rust
pub mod merge;
```

- [ ] **Step 2: Write the module with the tests first**

Create `src-tauri/src/db/merge.rs`. The tests target behaviour Steps 4–5 implement, and `merge_one` is still a stub here:

```rust
// src-tauri/src/db/merge.rs
//! Merging duplicate tracks (Duplicates Merge spec). Each removed copy (R)
//! hands what it owns to the copy that stays (K): playlist slots, tags,
//! plays, ratings, analysis. Then its row is deleted and its file is
//! recorded in `skipped_files`, so a scan never brings it back. One request
//! runs in one transaction: either every group merges or nothing changes.

use super::Database;
use rusqlite::{params, Connection, OptionalExtension, Result};

/// One group to merge: `keep_id` stays, every id in `remove_ids` merges into it.
#[derive(Debug, Clone)]
pub struct MergeRequest {
    pub keep_id: i64,
    pub remove_ids: Vec<i64>,
}

/// A copy that was merged away: where its file is and how big it is
/// (the Trash step compares it with the files that stay).
#[derive(Debug, Clone, PartialEq)]
pub struct RemovedFile {
    pub path: String,
    pub file_size: Option<i64>,
}

/// What a merge did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MergeOutcome {
    pub merged: usize,
    /// R's slots repointed to K. Slots dropped because K was already in
    /// that playlist are not counted.
    pub playlist_slots_moved: usize,
    pub removed_files: Vec<RemovedFile>,
}

/// Rejects a request that names any track twice. That covers a kept id that
/// is also removed, and one copy removed into two groups.
pub fn validate_requests(requests: &[MergeRequest]) -> std::result::Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for request in requests {
        for id in std::iter::once(request.keep_id).chain(request.remove_ids.iter().copied()) {
            if !seen.insert(id) {
                return Err(format!("Track {id} appears more than once in the merge request"));
            }
        }
    }
    Ok(())
}

impl Database {
    /// Merges every request's removed copies into its kept copy, in one
    /// transaction. A group whose kept copy no longer exists is skipped, and
    /// so is a removed id that no longer exists.
    pub fn merge_tracks(&self, requests: &[MergeRequest]) -> Result<MergeOutcome> {
        let tx = self.conn.unchecked_transaction()?;
        let mut outcome = MergeOutcome::default();
        for request in requests {
            let Some(kept) = removed_file(&tx, request.keep_id)? else {
                continue;
            };
            let kept_path = crate::scanner::normalize_scanned_path(&kept.path);
            for &remove_id in &request.remove_ids {
                let Some(file) = removed_file(&tx, remove_id)? else {
                    continue;
                };
                outcome.playlist_slots_moved += merge_one(&tx, request.keep_id, remove_id)?;
                // A double-slash copy can be K's own file: never skip that one.
                let skip_path = crate::scanner::normalize_scanned_path(&file.path);
                if skip_path != kept_path {
                    tx.execute(
                        "INSERT OR REPLACE INTO skipped_files (file_path, kept_track_id) VALUES (?1, ?2)",
                        params![skip_path, request.keep_id],
                    )?;
                }
                outcome.merged += 1;
                outcome.removed_files.push(file);
            }
        }
        tx.commit()?;
        Ok(outcome)
    }
}

/// A track's file path and size, or None when the track no longer exists.
fn removed_file(conn: &Connection, id: i64) -> Result<Option<RemovedFile>> {
    conn.query_row(
        "SELECT file_path, file_size FROM tracks WHERE id = ?1",
        [id],
        |row| Ok(RemovedFile { path: row.get(0)?, file_size: row.get(1)? }),
    )
    .optional()
}

/// Moves R's rows in `table` to K where K has no row with the same key
/// (UPDATE OR IGNORE skips those that would clash), then deletes what is
/// left of R's. Answers how many rows moved.
fn repoint_or_drop(conn: &Connection, table: &str, column: &str, k: i64, r: i64) -> Result<usize> {
    let moved = conn.execute(
        &format!("UPDATE OR IGNORE {table} SET {column} = ?1 WHERE {column} = ?2"),
        params![k, r],
    )?;
    conn.execute(&format!("DELETE FROM {table} WHERE {column} = ?1"), [r])?;
    Ok(moved)
}

/// Merges R into K and deletes R's row. Answers the playlist slots moved.
fn merge_one(conn: &Connection, k: i64, r: i64) -> Result<usize> {
    let slots = repoint_or_drop(conn, "playlist_tracks", "track_id", k, r)?;
    // Before R's row goes: play_history cascades on delete.
    conn.execute("UPDATE play_history SET track_id = ?1 WHERE track_id = ?2", params![k, r])?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", [r])?;
    Ok(slots)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn track(db: &Database, name: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title, file_size) VALUES (?1, ?1, ?2, 1000)",
                params![format!("/m/{name}.mp3"), name],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn playlist(db: &Database, name: &str) -> i64 {
        db.conn.execute("INSERT INTO playlists (name) VALUES (?1)", [name]).unwrap();
        db.conn.last_insert_rowid()
    }

    fn add(db: &Database, playlist: i64, track: i64, position: i64) {
        db.conn
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist, track, position],
            )
            .unwrap();
    }

    fn slots(db: &Database, playlist: i64) -> Vec<(i64, i64)> {
        let mut stmt = db
            .conn
            .prepare("SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")
            .unwrap();
        stmt.query_map([playlist], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(|row| row.unwrap())
            .collect()
    }

    fn count(db: &Database, sql: &str, id: i64) -> i64 {
        db.conn.query_row(sql, [id], |row| row.get(0)).unwrap()
    }

    fn merge(db: &Database, keep: i64, remove: &[i64]) -> MergeOutcome {
        db.merge_tracks(&[MergeRequest { keep_id: keep, remove_ids: remove.to_vec() }]).unwrap()
    }

    #[test]
    fn a_removed_copy_hands_its_playlist_slot_to_the_kept_copy_at_the_same_position() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        let other = track(&db, "O");
        let p = playlist(&db, "P");
        add(&db, p, other, 0);
        add(&db, p, r, 1);

        let out = merge(&db, k, &[r]);

        assert_eq!(slots(&db, p), vec![(other, 0), (k, 1)]);
        assert_eq!(out.playlist_slots_moved, 1);
        assert_eq!(out.merged, 1);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", r), 0);
    }

    #[test]
    fn when_both_copies_are_in_a_playlist_the_kept_slot_stays_and_is_not_counted() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        let p = playlist(&db, "P");
        add(&db, p, k, 0);
        add(&db, p, r, 3);

        let out = merge(&db, k, &[r]);

        assert_eq!(slots(&db, p), vec![(k, 0)]);
        assert_eq!(out.playlist_slots_moved, 0);
    }

    #[test]
    fn play_history_moves_to_the_kept_copy() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        for (id, at) in [(r, 100), (r, 200), (k, 300)] {
            db.conn
                .execute("INSERT INTO play_history (track_id, played_at) VALUES (?1, ?2)", params![id, at])
                .unwrap();
        }

        merge(&db, k, &[r]);

        assert_eq!(count(&db, "SELECT COUNT(*) FROM play_history WHERE track_id = ?1", k), 3);
    }

    #[test]
    fn the_removed_file_is_skipped_on_later_scans_with_its_path_normalized() {
        let db = db();
        let k = track(&db, "K");
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title, file_size) VALUES ('/m//old/R.mp3', 'r', 'R', 1000)",
                [],
            )
            .unwrap();
        let r = db.conn.last_insert_rowid();

        let out = merge(&db, k, &[r]);

        assert!(db.get_all_file_paths().unwrap().contains("/m/old/R.mp3"));
        assert_eq!(
            out.removed_files,
            vec![RemovedFile { path: "/m//old/R.mp3".into(), file_size: Some(1000) }]
        );
    }

    #[test]
    fn a_removed_row_that_names_the_kept_file_is_not_skipped() {
        let db = db();
        let k = track(&db, "K");
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title, file_size) VALUES ('/m//K.mp3', 'k2', 'K', 1000)",
                [],
            )
            .unwrap();
        let r = db.conn.last_insert_rowid();

        merge(&db, k, &[r]);

        assert_eq!(count(&db, "SELECT COUNT(*) FROM skipped_files WHERE ?1 = ?1", 0), 0);
    }

    #[test]
    fn a_request_that_names_a_track_twice_is_rejected() {
        let req = |keep_id, remove_ids: &[i64]| MergeRequest { keep_id, remove_ids: remove_ids.to_vec() };
        assert!(validate_requests(&[req(1, &[1])]).is_err());
        assert!(validate_requests(&[req(1, &[2]), req(3, &[2])]).is_err());
        assert!(validate_requests(&[req(1, &[2, 3]), req(4, &[5])]).is_ok());
    }

    #[test]
    fn a_missing_kept_copy_skips_its_group_and_the_others_still_merge() {
        let db = db();
        let a = track(&db, "A");
        let b = track(&db, "B");
        let c = track(&db, "C");

        let out = db
            .merge_tracks(&[
                MergeRequest { keep_id: 999, remove_ids: vec![a] },
                MergeRequest { keep_id: b, remove_ids: vec![c, 998] },
            ])
            .unwrap();

        assert_eq!(out.merged, 1);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", a), 1);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", c), 0);
    }

    #[test]
    fn a_failure_inside_the_merge_changes_nothing() {
        let db = db();
        let a = track(&db, "A");
        let b = track(&db, "B");
        let c = track(&db, "C");
        let d = track(&db, "D");
        let p = playlist(&db, "P");
        add(&db, p, b, 0);
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER fail_on_d BEFORE DELETE ON tracks WHEN OLD.id = {d}
                 BEGIN SELECT RAISE(ABORT, 'boom'); END;"
            ))
            .unwrap();

        let result = db.merge_tracks(&[
            MergeRequest { keep_id: a, remove_ids: vec![b] },
            MergeRequest { keep_id: c, remove_ids: vec![d] },
        ]);

        assert!(result.is_err());
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", b), 1);
        assert_eq!(slots(&db, p), vec![(b, 0)]);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM skipped_files WHERE ?1 = ?1", 0), 0);
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: all 8 PASS. They cover what Step 2 already implements. If one fails, fix the code until it passes. The next tasks add rules to `merge_one` test-first.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db/merge.rs src-tauri/src/db/mod.rs
git commit -m "feat(duplicates): merge_tracks moves playlist slots and play history in one transaction"
```

---

### Task 4: tags, genres, styles, instruments, verdicts, embeddings, fingerprints, cue points

**Files:**
- Modify: `src-tauri/src/db/merge.rs`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests` in `merge.rs`:

```rust
    #[test]
    fn tags_genres_styles_and_instruments_become_the_union() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn.execute_batch("INSERT INTO tags (id, name) VALUES (1, 'warm'), (2, 'dark');").unwrap();
        for (id, tag) in [(k, 1), (r, 1), (r, 2)] {
            db.conn
                .execute("INSERT INTO track_tags (track_id, tag_id) VALUES (?1, ?2)", params![id, tag])
                .unwrap();
        }
        for (id, genre) in [(k, "House"), (r, "House"), (r, "Tech House")] {
            db.conn
                .execute("INSERT INTO track_genres (track_id, genre) VALUES (?1, ?2)", params![id, genre])
                .unwrap();
        }
        db.conn
            .execute("INSERT INTO track_discogs_styles (track_id, style) VALUES (?1, 'Electronic---Deep House')", [r])
            .unwrap();
        db.conn
            .execute("INSERT INTO track_instruments (track_id, instrument) VALUES (?1, 'piano')", [r])
            .unwrap();

        merge(&db, k, &[r]);

        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_tags WHERE track_id = ?1", k), 2);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_genres WHERE track_id = ?1", k), 2);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_discogs_styles WHERE track_id = ?1", k), 1);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_instruments WHERE track_id = ?1", k), 1);
        for table in ["track_tags", "track_genres", "track_discogs_styles", "track_instruments"] {
            assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM {table} WHERE track_id = ?1"), r), 0);
        }
    }

    #[test]
    fn verdicts_move_and_the_kept_copys_own_verdict_wins() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute_batch(&format!(
                "INSERT INTO spotify_match_verdicts (spotify_id, library_track_id, verdict)
                   VALUES ('s1', {k}, 'no'), ('s1', {r}, 'yes'), ('s2', {r}, 'yes');
                 INSERT INTO ytm_match_verdicts (video_id, library_track_id, verdict)
                   VALUES ('v1', {r}, 'yes');"
            ))
            .unwrap();

        merge(&db, k, &[r]);

        let verdict = |sql: &str, key: &str| -> String {
            db.conn.query_row(sql, params![key, k], |row| row.get(0)).unwrap()
        };
        let spotify = "SELECT verdict FROM spotify_match_verdicts WHERE spotify_id = ?1 AND library_track_id = ?2";
        assert_eq!(verdict(spotify, "s1"), "no");
        assert_eq!(verdict(spotify, "s2"), "yes");
        assert_eq!(
            verdict("SELECT verdict FROM ytm_match_verdicts WHERE video_id = ?1 AND library_track_id = ?2", "v1"),
            "yes"
        );
    }

    #[test]
    fn embeddings_and_fingerprints_keep_the_kept_copys_row_else_take_the_removed_one() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute_batch(&format!(
                "INSERT INTO track_fingerprints (track_id, chromaprint) VALUES ({k}, 'K-print'), ({r}, 'R-print');
                 INSERT INTO track_embeddings (track_id, model_version) VALUES ({r}, 'v1');"
            ))
            .unwrap();

        merge(&db, k, &[r]);

        let print: String = db
            .conn
            .query_row("SELECT chromaprint FROM track_fingerprints WHERE track_id = ?1", [k], |row| row.get(0))
            .unwrap();
        let model: String = db
            .conn
            .query_row("SELECT model_version FROM track_embeddings WHERE track_id = ?1", [k], |row| row.get(0))
            .unwrap();
        assert_eq!(print, "K-print");
        assert_eq!(model, "v1");
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_fingerprints WHERE track_id = ?1", r), 0);
    }

    #[test]
    fn cue_points_move_only_when_the_kept_copy_has_none() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        let k2 = track(&db, "K2");
        let r2 = track(&db, "R2");
        db.conn
            .execute_batch(&format!(
                "INSERT INTO cue_points (track_id, position_ms) VALUES ({k}, 1000), ({r}, 2000), ({r2}, 3000);"
            ))
            .unwrap();

        db.merge_tracks(&[
            MergeRequest { keep_id: k, remove_ids: vec![r] },
            MergeRequest { keep_id: k2, remove_ids: vec![r2] },
        ])
        .unwrap();

        let cues = |id: i64| -> Vec<i64> {
            let mut stmt = db
                .conn
                .prepare("SELECT position_ms FROM cue_points WHERE track_id = ?1 ORDER BY position_ms")
                .unwrap();
            stmt.query_map([id], |row| row.get(0)).unwrap().map(|v| v.unwrap()).collect()
        };
        assert_eq!(cues(k), vec![1000]);
        assert_eq!(cues(k2), vec![3000]);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: the 4 new tests FAIL. Most fail with "FOREIGN KEY constraint failed", because R's rows still reference R when its row is deleted. The verdict test fails with `QueryReturnedNoRows` instead: the delete trigger wipes R's verdicts.

- [ ] **Step 3: Implement**

In `merge.rs`, add these helpers above `merge_one`:

```rust
/// Cue points: R's move to K only when K has none. Another file can start
/// at a different offset, so mixing two cue sets would be wrong.
fn merge_cues(conn: &Connection, k: i64, r: i64) -> Result<()> {
    let k_has: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM cue_points WHERE track_id = ?1)",
        [k],
        |row| row.get(0),
    )?;
    if k_has {
        conn.execute("DELETE FROM cue_points WHERE track_id = ?1", [r])?;
    } else {
        conn.execute("UPDATE cue_points SET track_id = ?1 WHERE track_id = ?2", params![k, r])?;
    }
    Ok(())
}
```

Then replace `merge_one` with:

```rust
/// Merges R into K and deletes R's row. Answers the playlist slots moved.
fn merge_one(conn: &Connection, k: i64, r: i64) -> Result<usize> {
    let slots = repoint_or_drop(conn, "playlist_tracks", "track_id", k, r)?;
    // Unions: a clashing row is K's already, so dropping R's loses nothing.
    for table in ["track_tags", "track_genres", "track_discogs_styles", "track_instruments"] {
        repoint_or_drop(conn, table, "track_id", k, r)?;
    }
    // K's own verdict wins on a clash.
    for table in ["spotify_match_verdicts", "ytm_match_verdicts"] {
        repoint_or_drop(conn, table, "library_track_id", k, r)?;
    }
    // One row per track: K's if it has one, else R's moves.
    for table in ["track_embeddings", "track_fingerprints"] {
        repoint_or_drop(conn, table, "track_id", k, r)?;
    }
    merge_cues(conn, k, r)?;
    // Before R's row goes: play_history cascades on delete.
    conn.execute("UPDATE play_history SET track_id = ?1 WHERE track_id = ?2", params![k, r])?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", [r])?;
    Ok(slots)
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/merge.rs
git commit -m "feat(duplicates): merge carries tags, genres, styles, verdicts, embeddings, fingerprint and cues"
```

---

### Task 5: rating, comment, genre, date added

**Files:**
- Modify: `src-tauri/src/db/merge.rs`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests`:

```rust
    fn set_columns(db: &Database, id: i64, rating: i32, comment: Option<&str>, genre: Option<&str>, source: Option<&str>, added: &str) {
        db.conn
            .execute(
                "UPDATE tracks SET rating = ?2, comment = ?3, genre = ?4, genre_source = ?5, date_added = ?6 WHERE id = ?1",
                params![id, rating, comment, genre, source, added],
            )
            .unwrap();
    }

    fn columns(db: &Database, id: i64) -> (i32, Option<String>, Option<String>, Option<String>, String) {
        db.conn
            .query_row(
                "SELECT rating, comment, genre, genre_source, date_added FROM tracks WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap()
    }

    #[test]
    fn rating_comment_genre_and_date_added_follow_their_rules() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        set_columns(&db, k, 2, Some("warm"), Some("House"), Some("tag"), "2025-01-01 00:00:00");
        set_columns(&db, r, 4, Some("peak"), Some("Deep House"), Some("user"), "2024-06-01 00:00:00");

        merge(&db, k, &[r]);

        assert_eq!(
            columns(&db, k),
            (
                4,
                Some("warm / peak".into()),
                Some("Deep House".into()),
                Some("user".into()),
                "2024-06-01 00:00:00".into()
            )
        );
    }

    #[test]
    fn a_tag_genre_never_beats_a_user_genre_and_an_empty_comment_takes_the_other() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        set_columns(&db, k, 0, None, Some("House"), Some("user"), "2024-01-01 00:00:00");
        set_columns(&db, r, 0, Some("x"), Some("Techno"), Some("tag"), "2025-01-01 00:00:00");

        merge(&db, k, &[r]);

        let (_, comment, genre, source, added) = columns(&db, k);
        assert_eq!(comment.as_deref(), Some("x"));
        assert_eq!((genre.as_deref(), source.as_deref()), (Some("House"), Some("user")));
        assert_eq!(added, "2024-01-01 00:00:00");
    }

    #[test]
    fn the_same_comment_is_not_doubled_and_a_kept_copy_without_genre_takes_the_removed_one() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        set_columns(&db, k, 0, Some("warm"), None, None, "2024-01-01 00:00:00");
        set_columns(&db, r, 0, Some("warm"), Some("Techno"), Some("ai"), "2024-01-01 00:00:00");

        merge(&db, k, &[r]);

        let (_, comment, genre, source, _) = columns(&db, k);
        assert_eq!(comment.as_deref(), Some("warm"));
        assert_eq!((genre.as_deref(), source.as_deref()), (Some("Techno"), Some("ai")));
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: the 3 new tests FAIL on the assertions. K's columns are unchanged.

- [ ] **Step 3: Implement**

Add to `merge.rs`, above `merge_one`:

```rust
/// Ranks a genre source the way the app does: user > tag > ai.
fn source_rank(source: Option<&str>) -> i32 {
    match source {
        Some("user") => 3,
        Some("tag") => 2,
        Some("ai") => 1,
        _ => 0,
    }
}

fn has_text(value: &Option<String>) -> bool {
    value.as_deref().is_some_and(|s| !s.trim().is_empty())
}

/// K's comment; R's when K has none; both when they differ.
fn merged_comment(k: Option<String>, r: Option<String>) -> Option<String> {
    let k = k.filter(|s| !s.trim().is_empty());
    let r = r.filter(|s| !s.trim().is_empty());
    match (k, r) {
        (Some(k), Some(r)) if k.trim() != r.trim() => Some(format!("{k} / {r}")),
        (Some(k), _) => Some(k),
        (None, r) => r,
    }
}

/// The earlier of two `datetime('now')` strings (they sort as text).
fn earliest(a: Option<String>, b: Option<String>) -> Option<String> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if b < a { b } else { a }),
        (a, b) => a.or(b),
    }
}

type TrackColumns = (Option<i32>, Option<String>, Option<String>, Option<String>, Option<String>);

fn track_columns(conn: &Connection, id: i64) -> Result<TrackColumns> {
    conn.query_row(
        "SELECT rating, comment, genre, genre_source, date_added FROM tracks WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )
}

/// Rating: the higher. Comment: see `merged_comment`. Genre: R's when K has
/// none or R's source ranks higher. Date added: the earlier.
fn merge_track_columns(conn: &Connection, k: i64, r: i64) -> Result<()> {
    let (k_rating, k_comment, k_genre, k_source, k_added) = track_columns(conn, k)?;
    let (r_rating, r_comment, r_genre, r_source, r_added) = track_columns(conn, r)?;
    let rating = k_rating.unwrap_or(0).max(r_rating.unwrap_or(0));
    let comment = merged_comment(k_comment, r_comment);
    let r_wins_genre = has_text(&r_genre)
        && (!has_text(&k_genre) || source_rank(r_source.as_deref()) > source_rank(k_source.as_deref()));
    let (genre, source) = if r_wins_genre { (r_genre, r_source) } else { (k_genre, k_source) };
    let added = earliest(k_added, r_added);
    conn.execute(
        "UPDATE tracks SET rating = ?1, comment = ?2, genre = ?3, genre_source = ?4, date_added = ?5 WHERE id = ?6",
        params![rating, comment, genre, source, added, k],
    )?;
    Ok(())
}
```

In `merge_one`, call it right before the `play_history` update:

```rust
    merge_track_columns(conn, k, r)?;
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/merge.rs
git commit -m "feat(duplicates): merge keeps the higher rating, both comments, the stronger genre, the earlier date"
```

---

### Task 6: BPM / key / loudness and deep analysis, column by column

**Files:**
- Modify: `src-tauri/src/db/merge.rs`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests`:

```rust
    #[test]
    fn analysis_merges_column_by_column_and_the_waveform_never_moves() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute("INSERT INTO track_analysis (track_id, waveform_overview) VALUES (?1, x'0102')", [k])
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO track_analysis (track_id, bpm, musical_key, waveform_overview) VALUES (?1, 124.0, '8A', x'0909')",
                [r],
            )
            .unwrap();

        merge(&db, k, &[r]);

        let row: (Option<f64>, Option<String>, Option<Vec<u8>>) = db
            .conn
            .query_row(
                "SELECT bpm, musical_key, waveform_overview FROM track_analysis WHERE track_id = ?1",
                [k],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (Some(124.0), Some("8A".into()), Some(vec![1, 2])));
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_analysis WHERE track_id = ?1", r), 0);
    }

    #[test]
    fn a_kept_copy_without_analysis_gets_the_scalars_but_no_waveform() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute(
                "INSERT INTO track_analysis (track_id, bpm, waveform_overview, waveform_detail) VALUES (?1, 126.0, x'09', x'09')",
                [r],
            )
            .unwrap();

        merge(&db, k, &[r]);

        let row: (Option<f64>, Option<Vec<u8>>, Option<Vec<u8>>) = db
            .conn
            .query_row(
                "SELECT bpm, waveform_overview, waveform_detail FROM track_analysis WHERE track_id = ?1",
                [k],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (Some(126.0), None, None));
    }

    #[test]
    fn the_kept_copys_own_bpm_wins_and_deep_analysis_fills_missing_columns() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute_batch(&format!(
                "INSERT INTO track_analysis (track_id, bpm) VALUES ({k}, 120.0), ({r}, 124.0);
                 INSERT INTO track_deep_analysis (track_id, danceability) VALUES ({k}, 0.5);
                 INSERT INTO track_deep_analysis (track_id, danceability, energy_arousal) VALUES ({r}, 0.9, 0.7);"
            ))
            .unwrap();

        merge(&db, k, &[r]);

        let bpm: f64 = db
            .conn
            .query_row("SELECT bpm FROM track_analysis WHERE track_id = ?1", [k], |row| row.get(0))
            .unwrap();
        let deep: (f64, f64) = db
            .conn
            .query_row(
                "SELECT danceability, energy_arousal FROM track_deep_analysis WHERE track_id = ?1",
                [k],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(bpm, 120.0);
        assert_eq!(deep, (0.5, 0.7));
        assert_eq!(count(&db, "SELECT COUNT(*) FROM track_deep_analysis WHERE track_id = ?1", r), 0);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: the 3 new tests FAIL with "FOREIGN KEY constraint failed": R's analysis rows still reference R.

- [ ] **Step 3: Implement**

Add to `merge.rs`, above `merge_one`:

```rust
/// Columns that describe a file's own audio: never carried to another copy.
/// The app regenerates a missing waveform on demand.
const AUDIO_PICTURE_COLUMNS: [&str; 3] = ["waveform_overview", "waveform_detail", "spectrogram_data"];

/// Fills each NULL column of K's row in `table` (keyed by `track_id`) from
/// R's row, except the `skip` columns. Creates K's row if it has none. Then
/// deletes R's row.
fn fill_row_from(conn: &Connection, table: &str, k: i64, r: i64, skip: &[&str]) -> Result<()> {
    let r_has: bool = conn.query_row(
        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE track_id = ?1)"),
        [r],
        |row| row.get(0),
    )?;
    if r_has {
        let mut stmt = conn.prepare(&format!("SELECT name FROM pragma_table_info('{table}')"))?;
        let columns: Vec<String> = stmt.query_map([], |row| row.get(0))?.collect::<Result<_>>()?;
        let sets: Vec<String> = columns
            .iter()
            .filter(|c| c.as_str() != "track_id" && !skip.contains(&c.as_str()))
            .map(|c| format!("{c} = COALESCE({c}, (SELECT {c} FROM {table} WHERE track_id = ?2))"))
            .collect();
        conn.execute(&format!("INSERT OR IGNORE INTO {table} (track_id) VALUES (?1)"), [k])?;
        if !sets.is_empty() {
            conn.execute(
                &format!("UPDATE {table} SET {} WHERE track_id = ?1", sets.join(", ")),
                params![k, r],
            )?;
        }
    }
    conn.execute(&format!("DELETE FROM {table} WHERE track_id = ?1"), [r])?;
    Ok(())
}
```

In `merge_one`, after the `track_embeddings`/`track_fingerprints` loop, add:

```rust
    // Partial rows are common (waveform-only, tag-BPM-only): fill column by column.
    fill_row_from(conn, "track_analysis", k, r, &AUDIO_PICTURE_COLUMNS)?;
    fill_row_from(conn, "track_deep_analysis", k, r, &[])?;
```

- [ ] **Step 4: Run all merge tests**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: all PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/merge.rs
git commit -m "feat(duplicates): merge fills missing BPM, key and deep analysis, never another file's waveform"
```

---

### Task 7: `db/duplicates.rs` — per-copy facts and the recommended keep

**Files:**
- Create: `src-tauri/src/db/duplicates.rs`
- Modify: `src-tauri/src/db/mod.rs` (`pub mod duplicates;`)

- [ ] **Step 1: Register the module**

Add `pub mod duplicates;` to the `pub mod` list in `src-tauri/src/db/mod.rs`, in alphabetical order.

- [ ] **Step 2: Write the module with its tests**

Create `src-tauri/src/db/duplicates.rs`:

```rust
// src-tauri/src/db/duplicates.rs
//! What the Duplicate Tracks modal shows about each copy, and which copy it
//! recommends keeping (Duplicates Merge spec, Recommended keep).

use super::{Database, Track};
use rusqlite::Result;

/// The facts the recommendation and the modal need about one copy.
#[derive(Debug, Clone, PartialEq)]
pub struct CopyFacts {
    pub id: i64,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    /// Has BPM or key; a waveform-only analysis row does not count.
    pub analyzed: bool,
    /// (playlist id, name), by name.
    pub playlists: Vec<(i64, String)>,
    /// Rows in the play history (`tracks.play_count` is not kept up to date).
    pub plays: i64,
}

/// The lossless label for a copy, or None when it is lossy. `file_format`
/// holds the lowercased extension; ALAC hides in `m4a`, told from AAC by bitrate.
pub fn lossless_label(format: Option<&str>, bitrate: Option<i32>) -> Option<&'static str> {
    match format {
        Some("wav") => Some("WAV"),
        Some("aif") | Some("aiff") => Some("AIFF"),
        Some("flac") => Some("FLAC"),
        Some("m4a") if bitrate.unwrap_or(0) >= 500 => Some("ALAC"),
        _ => None,
    }
}

/// Rules 1–5 as a sortable key, bigger is better.
fn rank(c: &CopyFacts) -> (bool, i32, bool, usize, i64) {
    (
        lossless_label(c.file_format.as_deref(), c.bitrate).is_some(),
        c.bitrate.unwrap_or(0),
        c.analyzed,
        c.playlists.len(),
        c.plays,
    )
}

fn counted(n: usize, one: &str, many: &str) -> String {
    if n == 1 { format!("1 {one}") } else { format!("{n} {many}") }
}

/// Every rule 1–5 where the winner beats the runner-up, in rule order, the
/// first two joined with " · "; "added first" when only the id decided.
fn reason(winner: &CopyFacts, runner_up: &CopyFacts) -> String {
    let mut parts: Vec<String> = Vec::new();
    let label = lossless_label(winner.file_format.as_deref(), winner.bitrate);
    let runner_up_lossless = lossless_label(runner_up.file_format.as_deref(), runner_up.bitrate).is_some();
    match label {
        Some(label) if !runner_up_lossless => parts.push(format!("{label} (lossless)")),
        _ => {
            if winner.bitrate.unwrap_or(0) > runner_up.bitrate.unwrap_or(0) {
                parts.push(format!("{} kbps", winner.bitrate.unwrap_or(0)));
            }
        }
    }
    if winner.analyzed && !runner_up.analyzed {
        parts.push("analyzed".into());
    }
    if winner.playlists.len() > runner_up.playlists.len() {
        parts.push(format!("in {}", counted(winner.playlists.len(), "playlist", "playlists")));
    }
    if winner.plays > runner_up.plays {
        parts.push(counted(winner.plays as usize, "play", "plays"));
    }
    if parts.is_empty() {
        return "added first".into();
    }
    parts.truncate(2);
    parts.join(" · ")
}

/// The copy to keep and why. None only for an empty group.
pub fn recommend(copies: &[CopyFacts]) -> Option<(i64, String)> {
    let mut sorted: Vec<&CopyFacts> = copies.iter().collect();
    sorted.sort_by(|a, b| rank(b).cmp(&rank(a)).then(a.id.cmp(&b.id)));
    let winner = *sorted.first()?;
    let why = match sorted.get(1) {
        Some(runner_up) => reason(winner, runner_up),
        None => "added first".into(),
    };
    Some((winner.id, why))
}

impl Database {
    /// The facts of each copy, in the order given.
    pub fn copy_facts(&self, tracks: &[Track]) -> Result<Vec<CopyFacts>> {
        let mut playlists_stmt = self.conn.prepare(
            "SELECT p.id, p.name FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id
             WHERE pt.track_id = ?1 ORDER BY p.name COLLATE NOCASE, p.id",
        )?;
        tracks
            .iter()
            .map(|t| {
                let id = t.id.unwrap_or(0);
                let analyzed: bool = self.conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM track_analysis WHERE track_id = ?1
                       AND (bpm IS NOT NULL OR (musical_key IS NOT NULL AND musical_key <> '')))",
                    [id],
                    |row| row.get(0),
                )?;
                let plays: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM play_history WHERE track_id = ?1",
                    [id],
                    |row| row.get(0),
                )?;
                let playlists = playlists_stmt
                    .query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<(i64, String)>>>()?;
                Ok(CopyFacts {
                    id,
                    file_format: t.file_format.clone(),
                    bitrate: t.bitrate,
                    analyzed,
                    playlists,
                    plays,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn copy(id: i64, format: &str, bitrate: i32, analyzed: bool, playlists: i64, plays: i64) -> CopyFacts {
        CopyFacts {
            id,
            file_format: Some(format.into()),
            bitrate: Some(bitrate),
            analyzed,
            playlists: (0..playlists).map(|i| (i, format!("P{i}"))).collect(),
            plays,
        }
    }

    fn rec(copies: &[CopyFacts]) -> (i64, String) {
        recommend(copies).unwrap()
    }

    #[test]
    fn lossless_beats_a_lossy_copy_that_is_in_more_playlists() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 3, 10), copy(2, "wav", 1411, false, 0, 0)]), (2, "WAV (lossless)".into()));
    }

    #[test]
    fn aif_counts_as_lossless_and_reads_aiff() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "aif", 1411, false, 0, 0)]), (2, "AIFF (lossless)".into()));
    }

    #[test]
    fn m4a_is_lossless_only_at_alac_bitrates() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "m4a", 256, false, 0, 0)]), (1, "320 kbps".into()));
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "m4a", 900, false, 0, 0)]), (2, "ALAC (lossless)".into()));
    }

    #[test]
    fn between_lossless_copies_the_bitrate_shows() {
        assert_eq!(rec(&[copy(1, "flac", 900, false, 0, 0), copy(2, "wav", 1411, false, 0, 0)]), (2, "1411 kbps".into()));
    }

    #[test]
    fn analyzed_then_playlists_and_the_reason_shows_the_first_two() {
        assert_eq!(rec(&[copy(1, "mp3", 320, false, 0, 0), copy(2, "mp3", 320, true, 2, 9)]), (2, "analyzed · in 2 playlists".into()));
    }

    #[test]
    fn playlists_then_plays() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 0, 0), copy(2, "mp3", 320, true, 1, 6)]), (2, "in 1 playlist · 6 plays".into()));
    }

    #[test]
    fn plays_alone_decide() {
        assert_eq!(rec(&[copy(1, "mp3", 320, true, 1, 1), copy(2, "mp3", 320, true, 1, 2)]), (2, "2 plays".into()));
    }

    #[test]
    fn the_earlier_import_wins_a_tie() {
        assert_eq!(rec(&[copy(5, "mp3", 320, true, 1, 1), copy(3, "mp3", 320, true, 1, 1)]), (3, "added first".into()));
    }

    #[test]
    fn the_reason_compares_with_the_runner_up() {
        let copies = [copy(1, "wav", 1411, true, 2, 0), copy(2, "wav", 1411, true, 1, 0), copy(3, "mp3", 128, false, 0, 0)];
        assert_eq!(rec(&copies), (1, "in 2 playlists".into()));
    }

    #[test]
    fn copy_facts_reads_playlists_by_name_analysis_and_plays() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db.conn
            .execute_batch(
                "INSERT INTO tracks (id, file_path, file_hash, file_format, bitrate) VALUES
                   (1, '/m/a.mp3', 'a', 'mp3', 320), (2, '/m/b.wav', 'b', 'wav', 1411);
                 INSERT INTO playlists (id, name) VALUES (10, 'Zeta'), (11, 'Alpha');
                 INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (10, 1, 0), (11, 1, 0);
                 INSERT INTO track_analysis (track_id, bpm) VALUES (1, 124.0);
                 INSERT INTO track_analysis (track_id, waveform_overview) VALUES (2, x'00');",
            )
            .unwrap();
        for at in [100, 200] {
            db.conn
                .execute("INSERT INTO play_history (track_id, played_at) VALUES (1, ?1)", params![at])
                .unwrap();
        }
        let mut tracks = db.get_all_tracks().unwrap();
        tracks.sort_by_key(|t| t.id);

        let facts = db.copy_facts(&tracks).unwrap();

        assert_eq!(facts[0].playlists, vec![(11, "Alpha".to_string()), (10, "Zeta".to_string())]);
        assert!(facts[0].analyzed);
        assert_eq!(facts[0].plays, 2);
        assert!(!facts[1].analyzed);
        assert_eq!(facts[1].file_format.as_deref(), Some("wav"));
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test --lib db::duplicates`
Expected: all 10 PASS. If `get_all_tracks` is not callable from the test (for example, it is private), use a `SELECT` that builds the two `Track`s the way `get_duplicate_groups` does in `mod.rs`, or make `get_all_tracks` `pub(crate)`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db/duplicates.rs src-tauri/src/db/mod.rs
git commit -m "feat(duplicates): recommend the copy to keep (lossless, bitrate, analyzed, playlists, plays) with its reason"
```

---

### Task 8: `file_trash.rs` — never trash a file still in use

**Files:**
- Modify: `src-tauri/Cargo.toml` (`[dependencies]`)
- Create: `src-tauri/src/file_trash.rs`
- Modify: `src-tauri/src/lib.rs` (the `pub mod` list at the top)
- Modify: `src-tauri/src/db/merge.rs` (`track_paths_with_size`)

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml` under `[dependencies]`, after `walkdir = "2.5"`:

```toml
trash = "5.2.9"
```

- [ ] **Step 2: Write the module with its tests**

`src-tauri/src/file_trash.rs`:

```rust
// src-tauri/src/file_trash.rs
//! Moving merged-away duplicate files to the Trash (Duplicates Merge spec,
//! Files). A file is only trashed when no track that stays uses it: two rows
//! can name one file through a symlinked folder, letter case on APFS, or an
//! old double-slash path.

use std::path::Path;

/// True when both paths name the same file on disk: the same canonical path,
/// or (on Unix) the same device and inode.
pub fn same_file(a: &Path, b: &Path) -> bool {
    if let (Ok(ca), Ok(cb)) = (a.canonicalize(), b.canonicalize()) {
        if ca == cb {
            return true;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(ma), Ok(mb)) = (std::fs::metadata(a), std::fs::metadata(b)) {
            return ma.dev() == mb.dev() && ma.ino() == mb.ino();
        }
    }
    false
}

/// True when `file` may go to the Trash: none of the `remaining` paths
/// (tracks still in the library) names the same file.
pub fn safe_to_trash(file: &Path, remaining: &[String]) -> bool {
    !remaining.iter().any(|p| same_file(file, Path::new(p)))
}

/// Moves the file to the Trash. On macOS this uses NSFileManager, which needs
/// no Finder permission prompt (Finder's "Put Back" may not be offered).
#[allow(unused_mut)]
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn a_path_through_a_symlinked_folder_is_the_same_file() {
        let dir = TempDir::new().unwrap();
        let real = dir.path().join("real");
        fs::create_dir(&real).unwrap();
        fs::write(real.join("a.mp3"), b"audio").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, dir.path().join("alias")).unwrap();

        let via_alias = dir.path().join("alias").join("a.mp3");
        let direct = real.join("a.mp3");

        assert!(same_file(&via_alias, &direct));
        assert!(!safe_to_trash(&via_alias, &[direct.to_string_lossy().to_string()]));
    }

    #[test]
    fn a_different_file_is_safe_to_trash() {
        let dir = TempDir::new().unwrap();
        let a = dir.path().join("a.mp3");
        let b = dir.path().join("b.mp3");
        fs::write(&a, b"audio").unwrap();
        fs::write(&b, b"audio").unwrap();

        assert!(!same_file(&a, &b));
        assert!(safe_to_trash(&a, &[b.to_string_lossy().to_string()]));
    }

    #[test]
    fn a_double_slash_path_is_the_same_file() {
        let dir = TempDir::new().unwrap();
        let a = dir.path().join("a.mp3");
        fs::write(&a, b"audio").unwrap();
        let doubled = format!("{}//a.mp3", dir.path().to_string_lossy());

        assert!(same_file(Path::new(&doubled), &a));
    }
}
```

These tests never call `move_to_trash`, so nothing real goes to the Trash.

- [ ] **Step 3: Register the module**

In `src-tauri/src/lib.rs`, add to the `pub mod` list at the top (alphabetical, after `pub mod external;`):

```rust
pub mod file_trash;
```

- [ ] **Step 4: Add `track_paths_with_size` to `merge.rs`**

Inside `impl Database` in `src-tauri/src/db/merge.rs`, after `merge_tracks`:

```rust
    /// The paths of the tracks whose file has this size (every track when the
    /// size is unknown): the files a Trash move must not touch.
    pub fn track_paths_with_size(&self, size: Option<i64>) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM tracks WHERE ?1 IS NULL OR file_size = ?1")?;
        let rows = stmt.query_map([size], |row| row.get(0))?;
        rows.collect()
    }
```

Then add a test to `mod tests` in `merge.rs`:

```rust
    #[test]
    fn track_paths_with_size_finds_same_size_files_or_all_when_unknown() {
        let db = db();
        track(&db, "A");
        db.conn
            .execute("INSERT INTO tracks (file_path, file_hash, file_size) VALUES ('/m/big.mp3', 'big', 5000)", [])
            .unwrap();

        assert_eq!(db.track_paths_with_size(Some(1000)).unwrap(), vec!["/m/A.mp3".to_string()]);
        assert_eq!(db.track_paths_with_size(None).unwrap().len(), 2);
    }
```

- [ ] **Step 5: Run the tests**

Run: `cd src-tauri && cargo test --lib file_trash && cargo test --lib db::merge`
Expected: all PASS. The first build downloads the `trash` crate. If `trash::macos::TrashContextExtMacos` or `DeleteMethod::NsFileManager` does not compile, open `~/.cargo/registry/src/*/trash-5.2.9/src/macos/mod.rs` and use the names it defines.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/file_trash.rs src-tauri/src/lib.rs src-tauri/src/db/merge.rs
git commit -m "feat(duplicates): move merged files to the Trash, never one a remaining track still uses"
```

---

### Task 9: Tauri commands — richer groups, and `merge_duplicate_tracks`

**Files:**
- Modify: `src-tauri/src/commands/library.rs` (`DuplicateGroupDTO` and `get_duplicate_groups`, around lines 585–618)
- Modify: `src-tauri/src/lib.rs` (registration, around line 512)

- [ ] **Step 1: Replace the DTO and `get_duplicate_groups`**

In `src-tauri/src/commands/library.rs`, replace the `DuplicateGroupDTO` struct (and its doc comment) and the whole `get_duplicate_groups` command with:

```rust
/// A playlist a duplicate copy is in.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistRefDTO {
    pub id: i64,
    pub name: String,
}

/// One copy in a duplicate group: the track, plus what the modal shows about it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateTrackDTO {
    #[serde(flatten)]
    pub track: TrackDTO,
    pub playlists: Vec<PlaylistRefDTO>,
    /// Has BPM or key (a waveform-only analysis does not count).
    pub analyzed: bool,
    /// Rows in the play history.
    pub plays: i64,
}

/// A group of duplicate tracks for the merge flow. `tracks` is ordered by id
/// ASC. `recommended_keep_id` is the copy the backend suggests keeping, and
/// `recommend_reason` says why (Duplicates Merge spec, Recommended keep).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroupDTO {
    pub detection_reason: String,
    pub recommended_keep_id: i64,
    pub recommend_reason: String,
    pub tracks: Vec<DuplicateTrackDTO>,
}

/// Return every duplicate group the app can detect, without changing anything.
#[tauri::command]
pub fn get_duplicate_groups(
    state: State<AppState>,
) -> Result<Vec<DuplicateGroupDTO>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let groups = db
        .get_duplicate_groups()
        .map_err(|e| AppError::Database(format!("Failed to get duplicate groups: {}", e)))?;

    let mut out = Vec::with_capacity(groups.len());
    for (reason, tracks) in groups {
        let facts = db
            .copy_facts(&tracks)
            .map_err(|e| AppError::Database(format!("Failed to read duplicate details: {}", e)))?;
        let (recommended_keep_id, recommend_reason) = recommend(&facts).unwrap_or_default();
        let tracks = tracks
            .into_iter()
            .zip(facts)
            .map(|(track, f)| DuplicateTrackDTO {
                track: TrackDTO::from(track),
                playlists: f
                    .playlists
                    .into_iter()
                    .map(|(id, name)| PlaylistRefDTO { id, name })
                    .collect(),
                analyzed: f.analyzed,
                plays: f.plays,
            })
            .collect();
        out.push(DuplicateGroupDTO {
            detection_reason: reason,
            recommended_keep_id,
            recommend_reason,
            tracks,
        });
    }
    Ok(out)
}

/// One group to merge, as the modal sends it.
#[derive(Debug, Clone, Deserialize)]
pub struct MergeRequestDTO {
    pub keep_id: i64,
    pub remove_ids: Vec<i64>,
}

/// What a merge did, for the modal's toast.
#[derive(Debug, Clone, Serialize)]
pub struct MergeSummaryDTO {
    pub merged: usize,
    pub playlist_slots_moved: usize,
    pub trashed: usize,
    /// Paths that could not go to the Trash (missing, in use, refused).
    pub trash_failed: Vec<String>,
}

/// Merge duplicate copies into the copy each group keeps (Duplicates Merge
/// spec). With `move_to_trash`, each merged copy's file then goes to the
/// Trash, unless a track that stays uses the same file.
#[tauri::command]
pub fn merge_duplicate_tracks(
    state: State<AppState>,
    merges: Vec<MergeRequestDTO>,
    move_to_trash: bool,
) -> Result<MergeSummaryDTO, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let requests: Vec<MergeRequest> = merges
        .into_iter()
        .map(|m| MergeRequest { keep_id: m.keep_id, remove_ids: m.remove_ids })
        .collect();
    validate_requests(&requests).map_err(AppError::Internal)?;

    let outcome = db
        .merge_tracks(&requests)
        .map_err(|e| AppError::Database(format!("Failed to merge duplicates: {}", e)))?;

    let mut trashed = 0;
    let mut trash_failed = Vec::new();
    if move_to_trash {
        // The merge is committed: a failure from here on is a Trash failure,
        // never an error for the whole request.
        for file in &outcome.removed_files {
            let Ok(remaining) = db.track_paths_with_size(file.file_size) else {
                trash_failed.push(file.path.clone());
                continue;
            };
            let path = Path::new(&file.path);
            if file_trash::safe_to_trash(path, &remaining) && file_trash::move_to_trash(path).is_ok() {
                trashed += 1;
            } else {
                trash_failed.push(file.path.clone());
            }
        }
    }

    Ok(MergeSummaryDTO {
        merged: outcome.merged,
        playlist_slots_moved: outcome.playlist_slots_moved,
        trashed,
        trash_failed,
    })
}
```

- [ ] **Step 2: Imports**

At the top of `src-tauri/src/commands/library.rs`, after `use crate::db::{Database, Track};`, add:

```rust
use crate::db::duplicates::recommend;
use crate::db::merge::{validate_requests, MergeRequest};
use crate::file_trash;
```

`std::path::Path` is already imported.

- [ ] **Step 3: Register the command**

In `src-tauri/src/lib.rs`, after `commands::library::delete_tracks_bulk,` add:

```rust
            commands::library::merge_duplicate_tracks,
```

- [ ] **Step 4: Build and run all Rust tests**

Run: `cd src-tauri && cargo build && cargo test --lib`
Expected: builds without errors, and every test passes. Also check that no new warnings mention `merge`, `duplicates` or `file_trash`. If `AppError::Internal` does not take a `String`, wrap it: `.map_err(|e| AppError::Internal(e))`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/library.rs src-tauri/src/lib.rs
git commit -m "feat(duplicates): merge_duplicate_tracks command; groups carry playlists, plays and the recommended keep"
```

---

### Task 10: frontend types and API

**Files:**
- Modify: `src/types/track.ts` (the `DuplicateGroup` block, around line 152)
- Modify: `src/lib/tauri-api.ts` (the import block at lines 22–36; `deleteTracksBulk` around line 292)

- [ ] **Step 1: Types**

In `src/types/track.ts`, replace:

```ts
export interface DuplicateGroup {
  detection_reason: DuplicateReason
  /** Sorted by id ASC — first track is the earliest import (recommended keep). */
  tracks: Track[]
}
```

with:

```ts
export interface PlaylistRef {
  id: number
  name: string
}

/** One copy in a duplicate group: the track plus what the modal shows about it. */
export interface DuplicateTrack extends Track {
  playlists: PlaylistRef[]
  /** Has BPM or key (a waveform-only analysis does not count). */
  analyzed: boolean
  /** Rows in the play history. */
  plays: number
}

export interface DuplicateGroup {
  detection_reason: DuplicateReason
  /** The copy the backend suggests keeping, and why. */
  recommended_keep_id: number
  recommend_reason: string
  /** Sorted by id ASC. */
  tracks: DuplicateTrack[]
}

/** One group to merge: `keep_id` stays, `remove_ids` merge into it. */
export interface MergeRequest {
  keep_id: number
  remove_ids: number[]
}

export interface MergeSummary {
  merged: number
  playlist_slots_moved: number
  trashed: number
  /** Paths that could not go to the Trash. */
  trash_failed: string[]
}
```

- [ ] **Step 2: API**

In `src/lib/tauri-api.ts`, add `MergeRequest,` and `MergeSummary,` to the `import type { ... } from '../types/track'` block, after `DuplicateGroup,`. Then, after the `deleteTracksBulk` method, add:

```ts
  async mergeDuplicateTracks(
    merges: MergeRequest[],
    moveToTrash: boolean,
  ): Promise<MergeSummary> {
    return await invoke('merge_duplicate_tracks', { merges, moveToTrash })
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `src/components/DuplicatesModal.tsx`, if any; Task 12 rewrites it. No errors elsewhere.

- [ ] **Step 4: Commit**

```bash
git add src/types/track.ts src/lib/tauri-api.ts
git commit -m "feat(duplicates): DuplicateTrack, MergeRequest and MergeSummary types; mergeDuplicateTracks API"
```

---

### Task 11: `mergeChoice.ts` — the modal's state, as pure functions

**Files:**
- Create: `src/lib/duplicates/mergeChoice.ts`
- Create: `src/lib/duplicates/mergeChoice.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/duplicates/mergeChoice.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DuplicateGroup, DuplicateTrack } from '../../types/track'
import {
  allMerged,
  buildMerges,
  initialChoice,
  mergeCount,
  pickKeep,
  rowState,
  setMergeAll,
  slotsMoving,
  toggleMerge,
} from './mergeChoice'

function copy(id: number, playlistIds: number[] = []): DuplicateTrack {
  return {
    id,
    file_path: `/m/${id}.mp3`,
    file_hash: String(id),
    play_count: 0,
    rating: 0,
    playlists: playlistIds.map((p) => ({ id: p, name: `P${p}` })),
    analyzed: false,
    plays: 0,
  }
}

function group(ids: number[], recommended: number): DuplicateGroup {
  return {
    detection_reason: 'same_title_artist',
    recommended_keep_id: recommended,
    recommend_reason: 'added first',
    tracks: ids.map((id) => copy(id)),
  }
}

describe('mergeChoice', () => {
  const g1 = group([1, 2, 3], 2)
  const g2 = group([4, 5], 4)

  it('keeps the recommended copy and merges every other one', () => {
    const c = initialChoice([g1, g2])
    expect(rowState(c, g1, 2)).toBe('keep')
    expect(rowState(c, g1, 1)).toBe('merge')
    expect(rowState(c, g1, 3)).toBe('merge')
    expect(buildMerges(c, [g1, g2])).toEqual([
      { keep_id: 2, remove_ids: [1, 3] },
      { keep_id: 4, remove_ids: [5] },
    ])
    expect(mergeCount(c, [g1, g2])).toBe(3)
  })

  it('picking another keep turns the old keep into a merged copy', () => {
    const c = pickKeep(initialChoice([g1]), g1, 3)
    expect(rowState(c, g1, 3)).toBe('keep')
    expect(rowState(c, g1, 2)).toBe('merge')
    expect(buildMerges(c, [g1])).toEqual([{ keep_id: 3, remove_ids: [1, 2] }])
  })

  it('unchecking Merge leaves a copy as is, and the kept copy cannot be unchecked', () => {
    let c = toggleMerge(initialChoice([g1]), g1, 3)
    expect(rowState(c, g1, 3)).toBe('left')
    expect(buildMerges(c, [g1])).toEqual([{ keep_id: 2, remove_ids: [1] }])
    c = toggleMerge(c, g1, 2)
    expect(rowState(c, g1, 2)).toBe('keep')
    c = toggleMerge(c, g1, 3)
    expect(rowState(c, g1, 3)).toBe('merge')
  })

  it('picking a left copy as the keep clears its left mark', () => {
    let c = toggleMerge(initialChoice([g1]), g1, 3)
    c = pickKeep(c, g1, 3)
    c = pickKeep(c, g1, 2)
    expect(rowState(c, g1, 3)).toBe('merge')
  })

  it('a group with nothing to merge sends no request', () => {
    let c = toggleMerge(initialChoice([g2]), g2, 5)
    expect(buildMerges(c, [g2])).toEqual([])
    expect(mergeCount(c, [g2])).toBe(0)
    c = setMergeAll(c, [g2], true)
    expect(allMerged(c, [g2])).toBe(true)
    c = setMergeAll(c, [g2], false)
    expect(allMerged(c, [g2])).toBe(false)
    expect(rowState(c, g2, 4)).toBe('keep')
  })

  it("counts only the slots in playlists the kept copy is not in", () => {
    const g: DuplicateGroup = {
      ...group([1, 2], 1),
      tracks: [copy(1, [10]), copy(2, [10, 11, 12])],
    }
    expect(slotsMoving(g, 1, g.tracks[1])).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/duplicates/mergeChoice.test.ts`
Expected: FAIL. The module `./mergeChoice` does not exist.

- [ ] **Step 3: Implement**

`src/lib/duplicates/mergeChoice.ts`:

```ts
// What the user picked in the Duplicate Tracks modal (Duplicates Merge spec):
// in each group one kept copy, and every other copy either merged into it or
// left as is. Pure functions, so the modal only renders.

import type { DuplicateGroup, DuplicateTrack, MergeRequest } from '../../types/track'

export interface MergeChoice {
  /** group key → the kept copy's id */
  keep: Map<number, number>
  /** ids of copies left as is */
  left: Set<number>
}

export type RowState = 'keep' | 'merge' | 'left'

/** A group's key: its first copy's id (a copy is in one group only). */
export function groupKey(group: DuplicateGroup): number {
  return group.tracks[0]?.id ?? -1
}

/** On open: keep the recommended copy, merge every other one. */
export function initialChoice(groups: DuplicateGroup[]): MergeChoice {
  const keep = new Map<number, number>()
  for (const g of groups) keep.set(groupKey(g), g.recommended_keep_id)
  return { keep, left: new Set() }
}

export function rowState(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): RowState {
  if (choice.keep.get(groupKey(group)) === trackId) return 'keep'
  return choice.left.has(trackId) ? 'left' : 'merge'
}

/** Keep this copy instead. The old kept copy becomes a merged one. */
export function pickKeep(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): MergeChoice {
  const keep = new Map(choice.keep)
  keep.set(groupKey(group), trackId)
  const left = new Set(choice.left)
  left.delete(trackId)
  return { keep, left }
}

/** Merge ↔ left as is. The kept copy does not toggle. */
export function toggleMerge(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): MergeChoice {
  if (rowState(choice, group, trackId) === 'keep') return choice
  const left = new Set(choice.left)
  if (left.has(trackId)) left.delete(trackId)
  else left.add(trackId)
  return { keep: choice.keep, left }
}

/** Merge all / Merge none, for the given (visible) groups. */
export function setMergeAll(
  choice: MergeChoice,
  groups: DuplicateGroup[],
  merge: boolean,
): MergeChoice {
  const left = new Set(choice.left)
  for (const g of groups) {
    for (const t of g.tracks) {
      if (rowState(choice, g, t.id) === 'keep') continue
      if (merge) left.delete(t.id)
      else left.add(t.id)
    }
  }
  return { keep: choice.keep, left }
}

/** True when the groups have a copy to merge and every one is checked. */
export function allMerged(choice: MergeChoice, groups: DuplicateGroup[]): boolean {
  let any = false
  for (const g of groups) {
    for (const t of g.tracks) {
      const state = rowState(choice, g, t.id)
      if (state === 'left') return false
      if (state === 'merge') any = true
    }
  }
  return any
}

/** What the backend gets: one entry per group with a copy to merge. */
export function buildMerges(
  choice: MergeChoice,
  groups: DuplicateGroup[],
): MergeRequest[] {
  const out: MergeRequest[] = []
  for (const g of groups) {
    const keepId = choice.keep.get(groupKey(g))
    if (keepId === undefined) continue
    const remove_ids = g.tracks
      .filter((t) => rowState(choice, g, t.id) === 'merge')
      .map((t) => t.id)
    if (remove_ids.length > 0) out.push({ keep_id: keepId, remove_ids })
  }
  return out
}

export function mergeCount(choice: MergeChoice, groups: DuplicateGroup[]): number {
  return buildMerges(choice, groups).reduce((n, m) => n + m.remove_ids.length, 0)
}

/** This copy's playlist slots that move: playlists the kept copy is not in. */
export function slotsMoving(
  group: DuplicateGroup,
  keepId: number,
  track: DuplicateTrack,
): number {
  const kept = group.tracks.find((t) => t.id === keepId)
  const keptIn = new Set((kept?.playlists ?? []).map((p) => p.id))
  return track.playlists.filter((p) => !keptIn.has(p.id)).length
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/duplicates/mergeChoice.test.ts`
Expected: all 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/duplicates/mergeChoice.ts src/lib/duplicates/mergeChoice.test.ts
git commit -m "feat(duplicates): keep / merge / left-as-is state for the modal, as pure functions"
```

---

### Task 12: the modal

**Files:**
- Rewrite: `src/components/DuplicatesModal.tsx`
- Modify: `src/components/DuplicatesModal.css`

- [ ] **Step 1: Rewrite the component**

Replace the whole of `src/components/DuplicatesModal.tsx` with:

```tsx
// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes. In each group
// the user keeps one copy and merges the others into it (Duplicates Merge
// spec): merged copies hand over their playlists, tags, plays and analysis,
// and their files are skipped on future scans.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { formatTime } from '../lib/trackTable/cells'
import { getErrorMessage } from '../types/ai'
import {
  allMerged,
  buildMerges,
  groupKey,
  initialChoice,
  mergeCount,
  pickKeep,
  rowState,
  setMergeAll,
  slotsMoving,
  toggleMerge,
  type MergeChoice,
  type RowState,
} from '../lib/duplicates/mergeChoice'
import type {
  DuplicateGroup,
  DuplicateReason,
  DuplicateTrack,
  MergeSummary,
} from '../types/track'
import { Icon } from './Icon'
import './DuplicatesModal.css'

interface DuplicatesModalProps {
  onClose: () => void
  onTracksChanged: () => void
  onNotification: (
    message: string,
    type: 'success' | 'warning' | 'info' | 'error',
  ) => void
}

type FilterValue = 'all' | DuplicateReason

const REASON_LABELS: Record<DuplicateReason, string> = {
  identical_content: 'Identical content',
  identical_filename_size: 'Same filename & size',
  same_title_artist: 'Same title & artist',
}

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'identical_content', label: 'Identical content' },
  { value: 'identical_filename_size', label: 'Same filename & size' },
  { value: 'same_title_artist', label: 'Same title & artist' },
]

const LOSSLESS = new Set(['wav', 'aif', 'aiff', 'flac'])

const STATUS: Record<RowState, string> = {
  keep: 'Stays in your library',
  merge: 'Merges into the kept copy',
  left: 'Left as is',
}

function formatMB(bytes?: number): string {
  if (bytes == null) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return iso.split(' ')[0] ?? iso.split('T')[0] ?? iso
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "WAV", "AIFF", "MP3 320": lossless formats without their bitrate. */
function formatAudio(track: DuplicateTrack): string {
  const ext = (track.file_format ?? '').toLowerCase()
  const name = ext === 'aif' ? 'AIFF' : ext.toUpperCase() || '—'
  if (LOSSLESS.has(ext) || !track.bitrate) return name
  return `${name} ${track.bitrate}`
}

function statusText(state: RowState, slots: number): string {
  if (state !== 'merge' || slots === 0) return STATUS[state]
  return `${STATUS.merge} · its ${plural(slots, 'playlist slot', 'playlist slots')} ${slots === 1 ? 'moves' : 'move'} over`
}

function summaryMessage(s: MergeSummary): string {
  const parts = [
    `Merged ${s.merged}`,
    `${plural(s.playlist_slots_moved, 'playlist slot', 'playlist slots')} moved`,
  ]
  if (s.trashed > 0) parts.push(`${plural(s.trashed, 'file', 'files')} in Trash`)
  if (s.trash_failed.length > 0) {
    parts.push(`${s.trash_failed.length} could not be moved to Trash`)
  }
  return parts.join(' · ')
}

export function DuplicatesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: DuplicatesModalProps) {
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, onClose)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [choice, setChoice] = useState<MergeChoice>(() => initialChoice([]))
  const [moveToTrash, setMoveToTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tauriApi.getDuplicateGroups()
      setGroups(data)
      setChoice(initialChoice(data))
    } catch (err) {
      onNotification(getErrorMessage(err), 'error')
      setGroups([])
      setChoice(initialChoice([]))
    } finally {
      setLoading(false)
    }
  }, [onNotification])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const filteredGroups = useMemo(
    () =>
      activeFilter === 'all'
        ? groups
        : groups.filter((g) => g.detection_reason === activeFilter),
    [groups, activeFilter],
  )

  const toMerge = mergeCount(choice, groups)
  const visibleAllMerged = allMerged(choice, filteredGroups)

  async function mergeSelected() {
    const merges = buildMerges(choice, groups)
    if (merges.length === 0) return
    setMerging(true)
    try {
      const result = await tauriApi.mergeDuplicateTracks(merges, moveToTrash)
      onNotification(
        summaryMessage(result),
        result.trash_failed.length > 0 ? 'warning' : 'success',
      )
      onTracksChanged()
      await loadGroups()
    } catch (err) {
      onNotification(getErrorMessage(err), 'error')
    } finally {
      setMerging(false)
    }
  }

  const totalGroups = groups.length
  const summary = `${plural(totalGroups, 'group', 'groups')} · ${toMerge} ${toMerge === 1 ? 'copy' : 'copies'} will be merged`
  const actionLabel = merging
    ? 'Merging…'
    : moveToTrash
      ? `Merge ${toMerge} & move to Trash`
      : `Merge ${toMerge}`

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content dup-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dup-modal__header">
          <div>
            <h3>Duplicate Tracks</h3>
            <p className="dup-modal__summary">{summary}</p>
          </div>
          <button
            type="button"
            className="dup-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </header>

        {/* Sticky filter + merge-all bar */}
        <div className="dup-modal__toolbar">
          <div className="dup-modal__tabs">
            {FILTER_TABS.map((tab) => {
              const count =
                tab.value === 'all'
                  ? groups.length
                  : groups.filter((g) => g.detection_reason === tab.value)
                      .length
              return (
                <button
                  key={tab.value}
                  type="button"
                  className={`dup-tab ${activeFilter === tab.value ? 'dup-tab--active' : ''}`}
                  onClick={() => setActiveFilter(tab.value)}
                >
                  {tab.label}
                  <span className="dup-tab__count">{count}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="dup-toolbar-btn"
            onClick={() =>
              setChoice(setMergeAll(choice, filteredGroups, !visibleAllMerged))
            }
            disabled={loading || merging || filteredGroups.length === 0}
          >
            <Icon
              name={visibleAllMerged ? 'SquareCheckBig' : 'Square'}
              size={14}
            />
            <span>{visibleAllMerged ? 'Merge none' : 'Merge all'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="dup-modal__body">
          {loading ? (
            <div className="dup-modal__state">
              <Icon name="Loader" size={28} />
              <p>Scanning library…</p>
            </div>
          ) : totalGroups === 0 ? (
            <div className="dup-modal__state dup-modal__state--success">
              <Icon name="CircleCheck" size={36} />
              <p>No duplicates found</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="dup-modal__state">
              <Icon name="ListFilter" size={24} />
              <p>No groups match this filter.</p>
            </div>
          ) : (
            <div className="dup-modal__groups">
              {filteredGroups.map((group) => (
                <GroupCard
                  key={groupKey(group)}
                  group={group}
                  choice={choice}
                  disabled={merging}
                  onPickKeep={(id) => setChoice(pickKeep(choice, group, id))}
                  onToggleMerge={(id) =>
                    setChoice(toggleMerge(choice, group, id))
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="dup-modal__footer">
          <div className="dup-trash">
            <label className="dup-trash__label">
              <input
                type="checkbox"
                checked={moveToTrash}
                onChange={(e) => setMoveToTrash(e.target.checked)}
                disabled={merging}
              />
              <span>Also move removed files to Trash</span>
            </label>
            <span className="dup-trash__hint">
              Either way, removed files are skipped on future scans.
            </span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={merging}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${moveToTrash ? 'btn--danger' : 'btn--primary'} dup-modal__merge`}
            onClick={mergeSelected}
            disabled={merging || toMerge === 0}
          >
            <Icon name={moveToTrash ? 'Trash2' : 'GitMerge'} size={14} />
            <span>{actionLabel}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}

function GroupCard({
  group,
  choice,
  disabled,
  onPickKeep,
  onToggleMerge,
}: {
  group: DuplicateGroup
  choice: MergeChoice
  disabled: boolean
  onPickKeep: (id: number) => void
  onToggleMerge: (id: number) => void
}) {
  const key = groupKey(group)
  const keepId = choice.keep.get(key) ?? group.recommended_keep_id
  return (
    <section className={`dup-card dup-card--${group.detection_reason}`}>
      <header className="dup-card__header">
        <span
          className={`dup-badge dup-badge--${group.detection_reason}`}
        >
          {REASON_LABELS[group.detection_reason]}
        </span>
        <span className="dup-card__count">{group.tracks.length} tracks</span>
      </header>
      <ul className="dup-card__rows">
        {group.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            radioName={`dup-keep-${key}`}
            state={rowState(choice, group, track.id)}
            recommendReason={
              track.id === group.recommended_keep_id
                ? group.recommend_reason
                : null
            }
            slots={slotsMoving(group, keepId, track)}
            disabled={disabled}
            onPickKeep={() => onPickKeep(track.id)}
            onToggleMerge={() => onToggleMerge(track.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function TrackRow({
  track,
  radioName,
  state,
  recommendReason,
  slots,
  disabled,
  onPickKeep,
  onToggleMerge,
}: {
  track: DuplicateTrack
  radioName: string
  state: RowState
  recommendReason: string | null
  slots: number
  disabled: boolean
  onPickKeep: () => void
  onToggleMerge: () => void
}) {
  return (
    <li className={`dup-row dup-row--${state}`}>
      <div className="dup-row__controls">
        <label className="dup-row__control">
          <input
            type="radio"
            name={radioName}
            checked={state === 'keep'}
            onChange={onPickKeep}
            disabled={disabled}
          />
          <span>Keep</span>
        </label>
        <label
          className={`dup-row__control ${state === 'keep' ? 'dup-row__control--off' : ''}`}
        >
          <input
            type="checkbox"
            checked={state === 'merge'}
            onChange={onToggleMerge}
            disabled={disabled || state === 'keep'}
          />
          <span>Merge</span>
        </label>
      </div>
      <div className="dup-row__info">
        <div className="dup-row__line1">
          <span className="dup-row__title">
            {track.title || <span className="dup-muted">Untitled</span>}
          </span>
          <span className="dup-row__artist">
            {track.artist ? (
              <>by {track.artist}</>
            ) : (
              <span className="dup-muted">Unknown artist</span>
            )}
          </span>
          {recommendReason && (
            <span className="dup-keep-badge">
              <b>Recommended</b> {recommendReason}
            </span>
          )}
        </div>
        <div className="dup-row__path" data-tip={track.file_path} data-tip-overflow>
          {track.file_path}
        </div>
        <div className="dup-row__meta">
          <span>{formatAudio(track)}</span>
          <span className="dup-row__sep">·</span>
          <span>{formatTime(track.duration_ms)}</span>
          <span className="dup-row__sep">·</span>
          <span>{formatMB(track.file_size)}</span>
          <span className="dup-row__sep">·</span>
          <span>{track.analyzed ? 'analyzed' : 'not analyzed'}</span>
          <span className="dup-row__sep">·</span>
          <span>{plural(track.plays, 'play', 'plays')}</span>
          <span className="dup-row__sep">·</span>
          <span>added {formatDate(track.date_added)}</span>
        </div>
        <div className="dup-row__playlists">
          <span className="dup-row__playlists-label">Playlists:</span>
          {track.playlists.length === 0 ? (
            <span className="dup-muted">not in any playlist</span>
          ) : (
            track.playlists.map((p) => (
              <span key={p.id} className="dup-chip">
                {p.name}
              </span>
            ))
          )}
        </div>
        <div className={`dup-row__status dup-row__status--${state}`}>
          {statusText(state, slots)}
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Step 2: Styles**

In `src/components/DuplicatesModal.css`:

1. Replace the `.dup-row--keep` and `.dup-row--selected` rules with:

```css
.dup-row--keep {
  background: rgba(34, 197, 94, 0.06);
}

.dup-row--merge {
  background: rgba(var(--accent-rgb), 0.07);
}
```

2. Replace the `.dup-row__check` rule and the `.dup-row__check input[type='checkbox']` rule with:

```css
.dup-row__controls {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: none;
  width: 74px;
  padding-top: 1px;
}

.dup-row__control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.dup-row__control--off {
  opacity: 0.35;
  cursor: default;
}

.dup-row__control input {
  width: 15px;
  height: 15px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--accent);
}
```

3. Replace the `.dup-keep-badge` rule with:

```css
.dup-keep-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  font-size: 10px;
  font-weight: 600;
}

.dup-keep-badge b {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

4. Add after the `.dup-row__sep` rule:

```css
.dup-row__playlists {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
  font-size: 11px;
}

.dup-row__playlists-label {
  color: var(--text-secondary);
}

.dup-chip {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 11px;
}

.dup-row__status {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 500;
}

.dup-row__status--keep {
  color: #22c55e;
}

.dup-row__status--merge {
  color: var(--accent-hover);
}

.dup-row__status--left {
  color: var(--text-secondary);
}
```

5. Rename `.dup-modal__delete` to `.dup-modal__merge`, and add after it:

```css
.dup-trash {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dup-trash__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.dup-trash__label input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--color-danger);
  cursor: pointer;
}

.dup-trash__hint {
  padding-left: 23px;
  font-size: 11px;
  color: var(--text-secondary);
}

.dup-modal__footer {
  align-items: center;
}
```

- [ ] **Step 3: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no TypeScript errors. Lint shows only the 9 pre-existing errors, none in `DuplicatesModal.tsx` or `mergeChoice.ts`. Tests show only the 1 pre-existing `aiStore.test.ts` failure.

- [ ] **Step 4: Commit**

```bash
git add src/components/DuplicatesModal.tsx src/components/DuplicatesModal.css
git commit -m "feat(duplicates): the modal merges: Keep / Merge per copy, playlists and plays shown, optional Trash"
```

---

### Task 13: verify in the app

The dev build and the installed app share one database (`recodeck.db`). A merge in dev changes the user's real library.

- [ ] **Step 1: Back up the database**

```bash
sqlite3 "$HOME/Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.db" \
  ".backup '$HOME/Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.before-merge.db'"
```

`.backup` gives a consistent copy even while the app is open (a plain `cp` may not). Ask the user before running this, and tell them where the backup is.

- [ ] **Step 2: Run the full checks**

Run the `test-runner` agent: Rust (`cd src-tauri && cargo test --lib`), `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Only the known pre-existing failures may remain.

- [ ] **Step 3: Hand over for a manual check**

The user starts the app with `/dev`; only the user can run it. Ask them to:
1. Open Settings → Database → Review Duplicate Tracks. Check that each group shows Keep / Merge, a Recommended badge with a reason, and the playlists per copy.
2. Pick one group where the removed copy is in a playlist the kept copy is not in. Merge it without Trash.
3. Open that playlist. The song is still there, at the same position.
4. Rescan the library folder. The merged copy does not come back.

Fix anything they report before calling the work done.
