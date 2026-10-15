// src-tauri/src/db/missing.rs
//! Missing Files (spec docs/superpowers/specs/2026-10-15-missing-files-design.md):
//! the database side. A track whose file is gone is relinked to its file's
//! new place, merged into the library track that has the file now, or
//! removed completely.

use super::merge::{merge_on, MergeRequest};
use super::{Database, Track};
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::collections::{BTreeMap, HashSet};

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
    // Cached: a folder cleanup runs these for thousands of tracks.
    for table in TRACK_TABLES {
        conn.prepare_cached(&format!("DELETE FROM {table} WHERE track_id = ?1"))?
            .execute([track_id])?;
    }
    Ok(conn.prepare_cached("DELETE FROM tracks WHERE id = ?1")?.execute([track_id])? > 0)
}

/// A relink the review asked for, with the facts read from its file before
/// the transaction.
#[derive(Debug, Clone)]
pub struct RelinkFix {
    pub track_id: i64,
    pub facts: FileFacts,
}

/// Everything one apply does (spec section 4). `merges` are
/// (keep_id, remove_id) pairs; several may share a keep_id.
#[derive(Debug, Clone, Default)]
pub struct MissingFixes {
    pub relinks: Vec<RelinkFix>,
    pub merges: Vec<(i64, i64)>,
    pub removes: Vec<i64>,
}

/// A change the apply left out, and why.
#[derive(Debug, Clone, PartialEq)]
pub struct SkippedFix {
    pub track_id: i64,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct FixOutcome {
    pub relinked: usize,
    pub merged: usize,
    pub removed: usize,
    pub skipped: Vec<SkippedFix>,
}

/// Rejects a request the review can never build (spec section 4). Paths
/// must already be normalized.
pub fn validate_fixes(
    relinks: &[(i64, String)],
    merges: &[(i64, i64)],
    removes: &[i64],
) -> std::result::Result<(), String> {
    let mut changing = HashSet::new();
    let ids = relinks
        .iter()
        .map(|(id, _)| *id)
        .chain(merges.iter().map(|(_, remove)| *remove))
        .chain(removes.iter().copied());
    for id in ids {
        if !changing.insert(id) {
            return Err(format!("Track {id} appears more than once"));
        }
    }
    let mut paths = HashSet::new();
    for (_, path) in relinks {
        if !paths.insert(path.as_str()) {
            return Err(format!("{path} is relinked twice"));
        }
    }
    if let Some((keep, _)) = merges.iter().find(|(keep, _)| changing.contains(keep)) {
        return Err(format!("Track {keep} is merged into while it changes too"));
    }
    Ok(())
}

fn track_path(conn: &Connection, id: i64) -> Result<Option<String>> {
    conn.query_row("SELECT file_path FROM tracks WHERE id = ?1", [id], |row| row.get(0))
        .optional()
}

/// Why a missing track can no longer be merged away or removed: a scan may
/// have run while the review was open.
fn cannot_go(conn: &Connection, id: i64) -> Result<Option<&'static str>> {
    Ok(match track_path(conn, id)? {
        None => Some("track no longer exists"),
        Some(path) if !crate::missing_files::is_missing(&path) => Some("file is back"),
        Some(_) => None,
    })
}

fn skip(out: &mut FixOutcome, track_id: i64, reason: &str) {
    out.skipped.push(SkippedFix { track_id, reason: reason.to_string() });
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
        if rows.iter().any(|(_, path)| !crate::missing_files::is_missing(path)) {
            return Ok(HashMatch::Duplicate);
        }
        Ok(HashMatch::Moved(lowest))
    }

    /// The library folders (setting `library_folders`, a JSON list).
    pub fn library_folders(&self) -> Result<Vec<String>> {
        Ok(self
            .get_setting("library_folders")?
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default())
    }

    /// Every track's file path, so missing files can be counted without the lock.
    pub fn all_track_paths(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT file_path FROM tracks")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    /// Rule 5 of spec section 3: the library track a file on disk already
    /// is, or None for a free file. A file merged away earlier belongs to the
    /// track it was merged into, but only while that track is alive and has
    /// its own file. So the answer is always a live track, never a row of the
    /// review.
    pub fn library_track_for(&self, path: &str, missing_track_id: i64) -> Result<Option<i64>> {
        let owner: Option<i64> = self
            .conn
            .query_row("SELECT id FROM tracks WHERE file_path = ?1", [path], |row| row.get(0))
            .optional()?;
        if owner.is_some() {
            return Ok(owner);
        }
        let kept: Option<Option<i64>> = self
            .conn
            .query_row("SELECT kept_track_id FROM skipped_files WHERE file_path = ?1", [path], |row| row.get(0))
            .optional()?;
        let Some(Some(kept)) = kept else {
            return Ok(None);
        };
        if kept == missing_track_id {
            return Ok(None);
        }
        let kept_path: Option<String> = self
            .conn
            .query_row("SELECT file_path FROM tracks WHERE id = ?1", [kept], |row| row.get(0))
            .optional()?;
        Ok(kept_path.filter(|p| !crate::missing_files::is_missing(p)).map(|_| kept))
    }
    /// Applies the review in one transaction: relinks, then merges, then
    /// removes (spec section 4). A change that no longer fits is skipped, not
    /// rolled back. Any other error rolls everything back.
    pub fn apply_missing_fixes(&self, fixes: &MissingFixes) -> Result<FixOutcome> {
        let tx = self.conn.unchecked_transaction()?;
        let mut out = FixOutcome::default();

        for fix in &fixes.relinks {
            match track_path(&tx, fix.track_id)? {
                None => {
                    skip(&mut out, fix.track_id, "track no longer exists");
                    continue;
                }
                Some(path) if path == fix.facts.path => continue,
                Some(path) if !crate::missing_files::is_missing(&path) => {
                    skip(&mut out, fix.track_id, "file is back");
                    continue;
                }
                Some(_) => {}
            }
            match relink_on(&tx, fix.track_id, &fix.facts)? {
                RelinkOutcome::Relinked => out.relinked += 1,
                RelinkOutcome::AlreadyThere => {}
                RelinkOutcome::Taken => skip(&mut out, fix.track_id, "file is now another track"),
                RelinkOutcome::TrackGone => skip(&mut out, fix.track_id, "track no longer exists"),
            }
        }

        let mut groups: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
        for &(keep, remove) in &fixes.merges {
            let keep_path = track_path(&tx, keep)?;
            if keep_path.is_none() {
                skip(&mut out, remove, "kept track no longer exists");
            } else if keep_path.is_some_and(|p| crate::missing_files::is_missing(&p)) {
                skip(&mut out, remove, "kept track's file is missing");
            } else if let Some(reason) = cannot_go(&tx, remove)? {
                skip(&mut out, remove, reason);
            } else {
                groups.entry(keep).or_default().push(remove);
            }
        }
        let requests: Vec<MergeRequest> = groups
            .into_iter()
            .map(|(keep_id, remove_ids)| MergeRequest { keep_id, remove_ids })
            .collect();
        out.merged = merge_on(&tx, &requests)?.merged;

        for &id in &fixes.removes {
            if let Some(reason) = cannot_go(&tx, id)? {
                skip(&mut out, id, reason);
                continue;
            }
            delete_track_on(&tx, id)?;
            out.removed += 1;
        }

        tx.commit()?;
        Ok(out)
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

    /// A migration that adds a table pointing at tracks must add it to
    /// TRACK_TABLES too, or every complete delete fails on its foreign key.
    #[test]
    fn track_tables_lists_every_table_that_references_tracks() {
        let db = db();
        let tables: Vec<String> = db
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_>>()
            .unwrap();
        let mut referencing: Vec<String> = tables
            .into_iter()
            .filter(|t| {
                db.conn
                    .query_row(
                        "SELECT COUNT(*) FROM pragma_foreign_key_list(?1) WHERE \"table\" = 'tracks'",
                        [t],
                        |r| r.get::<_, i64>(0),
                    )
                    .unwrap()
                    > 0
            })
            .collect();
        referencing.sort();
        // play_history cascades on delete.
        let mut expected: Vec<String> =
            TRACK_TABLES.iter().chain(["play_history"].iter()).map(|t| t.to_string()).collect();
        expected.sort();
        assert_eq!(referencing, expected);
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

    #[test]
    fn library_folders_reads_the_setting() {
        let db = db();
        assert!(db.library_folders().unwrap().is_empty());
        db.set_setting("library_folders", r#"["/music","/more"]"#).unwrap();
        assert_eq!(db.library_folders().unwrap(), vec!["/music".to_string(), "/more".to_string()]);
    }

    #[test]
    fn a_file_that_is_a_track_is_that_track() {
        let db = db();
        let me = insert(&db, "/gone/me.wav", "me");
        let live = insert(&db, "/m/live.wav", "live");
        assert_eq!(db.library_track_for("/m/live.wav", me).unwrap(), Some(live));
        assert_eq!(db.library_track_for("/m/free.wav", me).unwrap(), None);
    }

    #[test]
    fn a_skipped_file_belongs_to_its_kept_track_only_while_that_track_has_its_file() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let live_file = dir.path().join("k.wav");
        std::fs::write(&live_file, b"k").unwrap();
        let live = insert(&db, &live_file.to_string_lossy(), "k");
        let dead = insert(&db, "/gone/d.wav", "d");
        let me = insert(&db, "/gone/me.wav", "me");
        let skip = |path: &str, kept: Option<i64>| {
            db.conn
                .execute(
                    "INSERT INTO skipped_files (file_path, kept_track_id) VALUES (?1, ?2)",
                    params![path, kept],
                )
                .unwrap();
        };
        skip("/m/to-live.wav", Some(live));
        skip("/m/to-dead.wav", Some(dead));
        skip("/m/to-me.wav", Some(me));
        skip("/m/to-null.wav", None);
        skip("/m/to-gone.wav", Some(9999));

        assert_eq!(db.library_track_for("/m/to-live.wav", me).unwrap(), Some(live));
        for path in ["/m/to-dead.wav", "/m/to-me.wav", "/m/to-null.wav", "/m/to-gone.wav"] {
            assert_eq!(db.library_track_for(path, me).unwrap(), None, "{path}");
        }
    }

    #[test]
    fn validation_rejects_what_the_review_can_never_send() {
        let relinks = vec![(1, "/m/a.wav".to_string())];
        assert!(validate_fixes(&relinks, &[(9, 2)], &[3]).is_ok());
        // a track twice
        assert!(validate_fixes(&relinks, &[(9, 1)], &[]).is_err());
        assert!(validate_fixes(&[], &[], &[3, 3]).is_err());
        // a path twice
        assert!(validate_fixes(&[(1, "/m/a.wav".into()), (2, "/m/a.wav".into())], &[], &[]).is_err());
        // merging into a track that changes too
        assert!(validate_fixes(&relinks, &[(1, 2)], &[]).is_err());
        assert!(validate_fixes(&[], &[(3, 2)], &[3]).is_err());
        // two merges into one kept track are fine
        assert!(validate_fixes(&[], &[(9, 2), (9, 3)], &[]).is_ok());
    }

    #[test]
    fn apply_relinks_merges_and_removes_in_one_go() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let keep_path = dir.path().join("k.wav");
        std::fs::write(&keep_path, b"k").unwrap();
        let relink = insert(&db, "/gone/r.wav", "r");
        let keep = insert(&db, &keep_path.to_string_lossy(), "k");
        let merge_a = track_with_everything(&db, "/gone/a.wav");
        let merge_b = insert(&db, "/gone/b.wav", "b");
        let remove = track_with_everything(&db, "/gone/x.wav");

        let out = db
            .apply_missing_fixes(&MissingFixes {
                relinks: vec![RelinkFix { track_id: relink, facts: facts("/m/r.wav") }],
                merges: vec![(keep, merge_a), (keep, merge_b)],
                removes: vec![remove],
            })
            .unwrap();

        assert_eq!(out, FixOutcome { relinked: 1, merged: 2, removed: 1, skipped: vec![] });
        assert_eq!(db.get_track(relink).unwrap().file_path, "/m/r.wav");
        let keep_slots: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM playlist_tracks WHERE track_id = ?1", [keep], |r| r.get(0))
            .unwrap();
        let keep_plays: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM play_history WHERE track_id = ?1", [keep], |r| r.get(0))
            .unwrap();
        assert_eq!((keep_slots, keep_plays), (1, 1));
        assert!(db.get_track(merge_a).is_err());
        assert!(db.get_track(merge_b).is_err());
        assert_eq!(rows_for(&db, remove), 0);
    }

    #[test]
    fn changes_that_no_longer_fit_are_skipped_not_rolled_back() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let back = dir.path().join("back.wav");
        std::fs::write(&back, b"x").unwrap();
        let back_too = dir.path().join("back-too.wav");
        std::fs::write(&back_too, b"y").unwrap();
        let taken_path = dir.path().join("taken.wav");
        std::fs::write(&taken_path, b"t").unwrap();
        let taken_by = insert(&db, &taken_path.to_string_lossy(), "t");
        let wants_taken = insert(&db, "/gone/t.wav", "w");
        let file_is_back = insert(&db, &back.to_string_lossy(), "b");
        let merge_is_back = insert(&db, &back_too.to_string_lossy(), "bt");
        let orphan = insert(&db, "/gone/o.wav", "o");
        let fine = insert(&db, "/gone/f.wav", "f");

        let out = db
            .apply_missing_fixes(&MissingFixes {
                relinks: vec![
                    RelinkFix { track_id: wants_taken, facts: facts(&taken_path.to_string_lossy()) },
                    RelinkFix { track_id: fine, facts: facts("/m/f.wav") },
                ],
                merges: vec![(9999, orphan), (taken_by, merge_is_back)],
                removes: vec![file_is_back, 8888],
            })
            .unwrap();

        assert_eq!((out.relinked, out.merged, out.removed), (1, 0, 0));
        let reasons: Vec<(i64, &str)> = out.skipped.iter().map(|s| (s.track_id, s.reason.as_str())).collect();
        assert_eq!(
            reasons,
            vec![
                (wants_taken, "file is now another track"),
                (orphan, "kept track no longer exists"),
                (merge_is_back, "file is back"),
                (file_is_back, "file is back"),
                (8888, "track no longer exists"),
            ]
        );
        assert_eq!(db.get_track(fine).unwrap().file_path, "/m/f.wav");
        assert!(db.get_track(file_is_back).is_ok());
        assert!(db.get_track(merge_is_back).is_ok());
        assert!(db.get_track(taken_by).is_ok());
    }

    #[test]
    fn a_relink_whose_file_is_back_or_already_done_changes_nothing() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let a_path = dir.path().join("a.wav");
        std::fs::write(&a_path, b"a").unwrap();
        let b_path = dir.path().join("b.wav");
        std::fs::write(&b_path, b"b").unwrap();
        let a = insert(&db, &a_path.to_string_lossy(), "a");
        let b = insert(&db, &b_path.to_string_lossy(), "b");

        let out = db
            .apply_missing_fixes(&MissingFixes {
                relinks: vec![
                    RelinkFix { track_id: a, facts: facts("/m/elsewhere.wav") },
                    RelinkFix { track_id: b, facts: facts(&b_path.to_string_lossy()) },
                    RelinkFix { track_id: 9998, facts: facts("/m/nine.wav") },
                ],
                merges: vec![],
                removes: vec![],
            })
            .unwrap();

        assert_eq!(out.relinked, 0);
        let reasons: Vec<(i64, &str)> = out.skipped.iter().map(|s| (s.track_id, s.reason.as_str())).collect();
        assert_eq!(reasons, vec![(a, "file is back"), (9998, "track no longer exists")]);
        assert_eq!(db.get_track(a).unwrap().file_path, a_path.to_string_lossy());
    }

    #[test]
    fn a_merge_into_a_track_whose_file_is_gone_is_skipped() {
        let db = db();
        let keep = insert(&db, "/gone/k.wav", "k");
        let remove = insert(&db, "/gone/r.wav", "r");

        let out = db
            .apply_missing_fixes(&MissingFixes { relinks: vec![], merges: vec![(keep, remove)], removes: vec![] })
            .unwrap();

        assert_eq!(out.merged, 0);
        let reasons: Vec<(i64, &str)> = out.skipped.iter().map(|s| (s.track_id, s.reason.as_str())).collect();
        assert_eq!(reasons, vec![(remove, "kept track's file is missing")]);
        assert!(db.get_track(remove).is_ok());
    }

    #[test]
    fn a_failure_inside_the_apply_changes_nothing() {
        let db = db();
        let relink = insert(&db, "/gone/r.wav", "r");
        let remove = insert(&db, "/gone/x.wav", "x");
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER fail BEFORE DELETE ON tracks WHEN OLD.id = {remove} BEGIN SELECT RAISE(ABORT, 'boom'); END;"
            ))
            .unwrap();

        let result = db.apply_missing_fixes(&MissingFixes {
            relinks: vec![RelinkFix { track_id: relink, facts: facts("/m/r.wav") }],
            merges: vec![],
            removes: vec![remove],
        });

        assert!(result.is_err());
        assert_eq!(db.get_track(relink).unwrap().file_path, "/gone/r.wav");
    }
}
