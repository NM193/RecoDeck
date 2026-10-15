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
