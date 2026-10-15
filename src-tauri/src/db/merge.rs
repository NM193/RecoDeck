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
                // Merging a track into itself would delete it.
                if remove_id == request.keep_id {
                    continue;
                }
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

    /// The paths of the tracks whose file has this size (every track when the
    /// size is unknown): the files a Trash move must not touch.
    pub fn track_paths_with_size(&self, size: Option<i64>) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM tracks WHERE ?1 IS NULL OR file_size = ?1")?;
        let rows = stmt.query_map([size], |row| row.get(0))?;
        rows.collect()
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
///
/// Only valid for tables where the one constraint that can clash is the
/// (owner, track_id) primary/unique key: UPDATE OR IGNORE also swallows NOT
/// NULL, CHECK and FK failures, and the DELETE after it would then drop those
/// rows. `table` and `column` are interpolated, so they must be literals.
fn repoint_or_drop(conn: &Connection, table: &str, column: &str, k: i64, r: i64) -> Result<usize> {
    let moved = conn.execute(
        &format!("UPDATE OR IGNORE {table} SET {column} = ?1 WHERE {column} = ?2"),
        params![k, r],
    )?;
    conn.execute(&format!("DELETE FROM {table} WHERE {column} = ?1"), [r])?;
    Ok(moved)
}

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
        (Some(k), Some(r)) if !k.split(" / ").any(|part| part.trim() == r.trim()) => {
            Some(format!("{k} / {r}"))
        }
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
    // Partial rows are common (waveform-only, tag-BPM-only): fill column by column.
    fill_row_from(conn, "track_analysis", k, r, &AUDIO_PICTURE_COLUMNS)?;
    fill_row_from(conn, "track_deep_analysis", k, r, &[])?;
    merge_cues(conn, k, r)?;
    merge_track_columns(conn, k, r)?;
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

        assert_eq!(db.conn.query_row("SELECT COUNT(*) FROM skipped_files", [], |row| row.get::<_, i64>(0)).unwrap(), 0);
    }

    #[test]
    fn merging_a_track_into_itself_changes_nothing() {
        let db = db();
        let k = track(&db, "K");
        let p = playlist(&db, "P");
        add(&db, p, k, 0);
        db.conn
            .execute("INSERT INTO play_history (track_id, played_at) VALUES (?1, 100)", [k])
            .unwrap();

        let out = merge(&db, k, &[k]);

        assert_eq!(out.merged, 0);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", k), 1);
        assert_eq!(slots(&db, p), vec![(k, 0)]);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM play_history WHERE track_id = ?1", k), 1);
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
        assert_eq!(db.conn.query_row("SELECT COUNT(*) FROM skipped_files", [], |row| row.get::<_, i64>(0)).unwrap(), 0);
    }

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

    #[test]
    fn a_comment_already_in_the_kept_copy_is_not_added_twice() {
        let db = db();
        let k = track(&db, "K");
        let r1 = track(&db, "R1");
        let r2 = track(&db, "R2");
        set_columns(&db, k, 0, Some("k"), None, None, "2024-01-01 00:00:00");
        set_columns(&db, r1, 0, Some("x"), None, None, "2024-01-01 00:00:00");
        set_columns(&db, r2, 0, Some("x"), None, None, "2024-01-01 00:00:00");

        merge(&db, k, &[r1, r2]);

        assert_eq!(columns(&db, k).1.as_deref(), Some("k / x"));
    }

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
}
