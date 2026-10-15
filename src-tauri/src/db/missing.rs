// src-tauri/src/db/missing.rs
//! Missing Files (spec docs/superpowers/specs/2026-10-15-missing-files-design.md):
//! the database side. A track whose file is gone is relinked to its file's
//! new place, merged into the library track that has the file now, or
//! removed completely.

use super::{Database, Track};
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

/// The file columns a relink takes from the file itself (spec section 2).
#[derive(Debug, Clone, PartialEq)]
pub struct FileFacts {
    /// Normalized with `normalize_scanned_path`.
    pub path: String,
    pub file_hash: String,
    pub file_size: Option<i64>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub duration_ms: Option<i32>,
}

impl FileFacts {
    /// The file columns of a track the scanner just read.
    pub fn from_track(track: &Track) -> Self {
        FileFacts {
            path: crate::scanner::normalize_scanned_path(&track.file_path),
            file_hash: track.file_hash.clone(),
            file_size: track.file_size,
            file_format: track.file_format.clone(),
            bitrate: track.bitrate,
            sample_rate: track.sample_rate,
            duration_ms: track.duration_ms,
        }
    }
}

/// What a relink did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelinkOutcome {
    Relinked,
    /// The track already points at this file: nothing to do.
    AlreadyThere,
    /// Another track has this file. That is a merge, not a relink.
    Taken,
    /// The track no longer exists.
    TrackGone,
}

/// What a scan does with a file whose content hash may already be known
/// (spec section 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashMatch {
    /// No track has this content: import the file.
    New,
    /// A track with this content still has its file: skip it, as before.
    Duplicate,
    /// Every track with this content lost its file: the one with the lowest
    /// id follows this file.
    Moved(i64),
}

/// Points `track_id` at the file in `facts`, on `conn` (the caller may hold a
/// transaction). Only the file columns change: tags, rating, analysis,
/// playlists and plays stay. The path comes off `skipped_files`.
pub(crate) fn relink_on(conn: &Connection, track_id: i64, facts: &FileFacts) -> Result<RelinkOutcome> {
    let owner: Option<i64> = conn
        .query_row("SELECT id FROM tracks WHERE file_path = ?1", [&facts.path], |row| row.get(0))
        .optional()?;
    match owner {
        Some(id) if id == track_id => return Ok(RelinkOutcome::AlreadyThere),
        Some(_) => return Ok(RelinkOutcome::Taken),
        None => {}
    }
    let changed = conn.execute(
        "UPDATE tracks SET file_path = ?1, file_hash = ?2, file_size = ?3, file_format = ?4,
                bitrate = ?5, sample_rate = ?6, duration_ms = ?7
         WHERE id = ?8",
        params![
            facts.path,
            facts.file_hash,
            facts.file_size,
            facts.file_format,
            facts.bitrate,
            facts.sample_rate,
            facts.duration_ms,
            track_id
        ],
    )?;
    if changed == 0 {
        return Ok(RelinkOutcome::TrackGone);
    }
    conn.execute("DELETE FROM skipped_files WHERE file_path = ?1", [&facts.path])?;
    Ok(RelinkOutcome::Relinked)
}

/// Every table with a `track_id` that does not cascade on delete.
/// `play_history` cascades, and the Spotify / YouTube Music verdicts go by
/// their delete triggers.
const TRACK_TABLES: [&str; 10] = [
    "playlist_tracks",
    "track_tags",
    "track_genres",
    "track_discogs_styles",
    "track_instruments",
    "track_embeddings",
    "track_fingerprints",
    "track_analysis",
    "track_deep_analysis",
    "cue_points",
];

/// Deletes a track and every row that references it, on `conn` (inside the
/// caller's transaction). Files on disk are never touched. Answers whether
/// the track existed.
pub(crate) fn delete_track_on(conn: &Connection, track_id: i64) -> Result<bool> {
    for table in TRACK_TABLES {
        conn.execute(&format!("DELETE FROM {table} WHERE track_id = ?1"), [track_id])?;
    }
    Ok(conn.execute("DELETE FROM tracks WHERE id = ?1", [track_id])? > 0)
}

impl Database {
    /// Points a track at its file's new place. See `relink_on`.
    pub fn relink_track(&self, track_id: i64, facts: &FileFacts) -> Result<RelinkOutcome> {
        relink_on(&self.conn, track_id, facts)
    }

    /// Spec section 1: what a scan does with a file of this content hash.
    /// Both scan paths call this. A file on an unplugged drive counts as gone,
    /// so a copy found elsewhere takes the track over. The spec accepts that:
    /// the track keeps playing, and the drive's file is skipped when it is back.
    pub fn match_scanned_hash(&self, file_hash: &str) -> Result<HashMatch> {
        if file_hash == "unknown" {
            return Ok(HashMatch::New);
        }
        let mut stmt = self
            .conn
            .prepare("SELECT id, file_path FROM tracks WHERE file_hash = ?1 ORDER BY id")?;
        let rows = stmt
            .query_map([file_hash], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        let Some(lowest) = rows.first().map(|(id, _)| *id) else {
            return Ok(HashMatch::New);
        };
        if rows.iter().any(|(_, path)| Path::new(path).exists()) {
            return Ok(HashMatch::Duplicate);
        }
        Ok(HashMatch::Moved(lowest))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn insert(db: &Database, path: &str, hash: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title, rating, file_size) VALUES (?1, ?2, 'Song', 4, 100)",
                params![path, hash],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn facts(path: &str) -> FileFacts {
        FileFacts {
            path: path.into(),
            file_hash: "new-hash".into(),
            file_size: Some(200),
            file_format: Some("wav".into()),
            bitrate: Some(1411),
            sample_rate: Some(44100),
            duration_ms: Some(7000),
        }
    }

    #[test]
    fn relink_changes_only_the_file_columns() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");

        assert_eq!(db.relink_track(id, &facts("/new/song.wav")).unwrap(), RelinkOutcome::Relinked);

        let t = db.get_track(id).unwrap();
        assert_eq!(t.file_path, "/new/song.wav");
        assert_eq!(t.file_hash, "new-hash");
        assert_eq!(t.file_size, Some(200));
        assert_eq!(t.file_format.as_deref(), Some("wav"));
        assert_eq!((t.bitrate, t.sample_rate, t.duration_ms), (Some(1411), Some(44100), Some(7000)));
        assert_eq!(t.title.as_deref(), Some("Song"));
        assert_eq!(t.rating, 4);
    }

    #[test]
    fn relink_keeps_playlist_slots_and_plays() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");
        db.conn.execute("INSERT INTO playlists (name) VALUES ('P')", []).unwrap();
        let playlist = db.conn.last_insert_rowid();
        db.conn
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, 1)",
                params![playlist, id],
            )
            .unwrap();
        db.conn.execute("INSERT INTO play_history (track_id) VALUES (?1)", [id]).unwrap();

        db.relink_track(id, &facts("/new/song.wav")).unwrap();

        let count = |sql: &str| -> i64 { db.conn.query_row(sql, [id], |r| r.get(0)).unwrap() };
        assert_eq!(count("SELECT COUNT(*) FROM playlist_tracks WHERE track_id = ?1"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM play_history WHERE track_id = ?1"), 1);
    }

    #[test]
    fn relink_takes_the_path_off_the_skip_list() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");
        db.conn
            .execute(
                "INSERT INTO skipped_files (file_path) VALUES ('/new/song.wav'), ('/m/other.wav')",
                [],
            )
            .unwrap();

        db.relink_track(id, &facts("/new/song.wav")).unwrap();

        let left: Vec<String> = db
            .conn
            .prepare("SELECT file_path FROM skipped_files")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_>>()
            .unwrap();
        assert_eq!(left, vec!["/m/other.wav".to_string()]);
    }

    #[test]
    fn relink_to_another_tracks_file_is_refused() {
        let db = db();
        let a = insert(&db, "/old/a.mp3", "a");
        insert(&db, "/new/b.mp3", "b");

        assert_eq!(db.relink_track(a, &facts("/new/b.mp3")).unwrap(), RelinkOutcome::Taken);
        assert_eq!(db.get_track(a).unwrap().file_path, "/old/a.mp3");
    }

    #[test]
    fn relink_to_its_own_path_does_nothing() {
        let db = db();
        let a = insert(&db, "/m/a.mp3", "a");
        assert_eq!(db.relink_track(a, &facts("/m/a.mp3")).unwrap(), RelinkOutcome::AlreadyThere);
        assert_eq!(db.get_track(a).unwrap().file_hash, "a");
    }

    #[test]
    fn relink_of_a_deleted_track_says_so() {
        let db = db();
        assert_eq!(db.relink_track(999, &facts("/m/x.wav")).unwrap(), RelinkOutcome::TrackGone);
    }

    #[test]
    fn an_unknown_or_new_hash_is_new() {
        let db = db();
        insert(&db, "/gone/a.mp3", "unknown");
        assert_eq!(db.match_scanned_hash("unknown").unwrap(), HashMatch::New);
        assert_eq!(db.match_scanned_hash("nobody-has-this").unwrap(), HashMatch::New);
    }

    #[test]
    fn a_hash_whose_track_still_has_its_file_is_a_duplicate() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.mp3");
        std::fs::write(&file, b"x").unwrap();
        insert(&db, "/gone/old.mp3", "h");
        insert(&db, &file.to_string_lossy(), "h");

        assert_eq!(db.match_scanned_hash("h").unwrap(), HashMatch::Duplicate);
    }

    #[test]
    fn when_every_track_with_the_hash_lost_its_file_the_lowest_id_follows() {
        let db = db();
        // The higher id goes in first, so only ORDER BY id can pick 10.
        for (id, path) in [(50, "/gone/a.mp3"), (10, "/gone/b.mp3")] {
            db.conn
                .execute(
                    "INSERT INTO tracks (id, file_path, file_hash) VALUES (?1, ?2, 'h')",
                    params![id, path],
                )
                .unwrap();
        }

        assert_eq!(db.match_scanned_hash("h").unwrap(), HashMatch::Moved(10));
    }

    /// A track with a row in every table that references tracks.
    fn track_with_everything(db: &Database, path: &str) -> i64 {
        let id = insert(db, path, path);
        let c = &db.conn;
        c.execute("INSERT INTO playlists (name) VALUES ('P')", []).unwrap();
        let playlist = c.last_insert_rowid();
        c.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, 1)",
            params![playlist, id],
        )
        .unwrap();
        c.execute("INSERT OR IGNORE INTO tags (name) VALUES ('warm')", []).unwrap();
        let tag: i64 = c.query_row("SELECT id FROM tags WHERE name = 'warm'", [], |r| r.get(0)).unwrap();
        c.execute("INSERT INTO track_tags (track_id, tag_id) VALUES (?1, ?2)", params![id, tag]).unwrap();
        c.execute("INSERT INTO track_genres (track_id, genre) VALUES (?1, 'House')", [id]).unwrap();
        c.execute("INSERT INTO track_discogs_styles (track_id, style) VALUES (?1, 'Deep House')", [id]).unwrap();
        c.execute("INSERT INTO track_instruments (track_id, instrument) VALUES (?1, 'piano')", [id]).unwrap();
        c.execute("INSERT INTO track_embeddings (track_id) VALUES (?1)", [id]).unwrap();
        c.execute("INSERT INTO track_fingerprints (track_id, chromaprint) VALUES (?1, 'fp')", [id]).unwrap();
        c.execute("INSERT INTO track_analysis (track_id, bpm) VALUES (?1, 124.0)", [id]).unwrap();
        c.execute("INSERT INTO track_deep_analysis (track_id, energy_arousal) VALUES (?1, 0.5)", [id]).unwrap();
        c.execute("INSERT INTO cue_points (track_id, position_ms) VALUES (?1, 1000)", [id]).unwrap();
        c.execute("INSERT INTO play_history (track_id) VALUES (?1)", [id]).unwrap();
        c.execute(
            "INSERT INTO spotify_match_verdicts (spotify_id, library_track_id, verdict) VALUES ('s', ?1, 'yes')",
            [id],
        )
        .unwrap();
        c.execute(
            "INSERT INTO ytm_match_verdicts (video_id, library_track_id, verdict) VALUES ('v', ?1, 'yes')",
            [id],
        )
        .unwrap();
        id
    }

    /// Rows anywhere that reference the track, its own row included.
    /// `track_with_everything` makes 14.
    fn rows_for(db: &Database, id: i64) -> i64 {
        let count = |sql: String| -> i64 { db.conn.query_row(&sql, [id], |r| r.get(0)).unwrap() };
        let mut n = count("SELECT COUNT(*) FROM tracks WHERE id = ?1".into());
        for table in TRACK_TABLES.iter().chain(["play_history"].iter()) {
            n += count(format!("SELECT COUNT(*) FROM {table} WHERE track_id = ?1"));
        }
        for table in ["spotify_match_verdicts", "ytm_match_verdicts"] {
            n += count(format!("SELECT COUNT(*) FROM {table} WHERE library_track_id = ?1"));
        }
        n
    }

    #[test]
    fn a_complete_delete_leaves_nothing_that_references_the_track() {
        let db = db();
        let id = track_with_everything(&db, "/gone/a.mp3");
        assert_eq!(rows_for(&db, id), 14);

        assert!(delete_track_on(&db.conn, id).unwrap());

        assert_eq!(rows_for(&db, id), 0);
    }

    #[test]
    fn folder_cleanups_remove_a_track_completely() {
        let db = db();
        let keep = track_with_everything(&db, "/music/keep.mp3");
        let stray = track_with_everything(&db, "/elsewhere/stray.mp3");

        assert_eq!(db.remove_tracks_not_in_folders(&["/music".to_string()]).unwrap(), 1);
        assert_eq!(rows_for(&db, stray), 0);
        assert_eq!(rows_for(&db, keep), 14);

        let inside = track_with_everything(&db, "/music/sub/x.mp3");
        assert_eq!(db.delete_tracks_in_folder_prefix("/music/sub").unwrap(), 1);
        assert_eq!(rows_for(&db, inside), 0);
        assert_eq!(rows_for(&db, keep), 14);
    }

    #[test]
    fn a_failing_folder_cleanup_changes_nothing() {
        let db = db();
        let a = track_with_everything(&db, "/elsewhere/a.mp3");
        let b = track_with_everything(&db, "/elsewhere/b.mp3");
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER fail BEFORE DELETE ON tracks WHEN OLD.id = {b} BEGIN SELECT RAISE(ABORT, 'boom'); END;"
            ))
            .unwrap();

        assert!(db.remove_tracks_not_in_folders(&["/music".to_string()]).is_err());

        assert_eq!(rows_for(&db, a), 14);
        assert_eq!(rows_for(&db, b), 14);
    }
}
