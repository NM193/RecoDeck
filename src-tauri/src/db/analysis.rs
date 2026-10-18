// src-tauri/src/db/analysis.rs
// What analysis stores and which tracks need it (spec 2026-10-17, §4, §5).

use super::Database;
use crate::audio::bpm::BpmResult;
use crate::audio::key::KeyResult;
use crate::missing_files::is_missing;
use rusqlite::{params, OptionalExtension, Result};

/// A track not analysed with the current version.
#[derive(Debug, Clone, PartialEq)]
pub struct NotCurrent {
    pub id: i64,
    pub path: String,
    /// It has a BPM or key from an older analysis: one with a confidence, not a tag.
    pub has_old_values: bool,
}

/// Whether a track's stored analysis is from `version` or newer.
pub fn is_current(stored_version: Option<i64>, version: i64) -> bool {
    stored_version.map_or(false, |v| v >= version)
}

/// The rule of §4: a track needs analysis when its stored version is missing
/// or older than `version` and its file is on disk.
pub fn needs_analysis(stored_version: Option<i64>, path: &str, version: i64) -> bool {
    !is_current(stored_version, version) && !is_missing(path)
}

/// The tracks whose file is on disk. Call it without the database lock: a
/// sleeping external drive can take seconds to answer (as `mark_missing`).
pub fn on_disk(tracks: Vec<NotCurrent>) -> Vec<NotCurrent> {
    tracks.into_iter().filter(|t| !is_missing(&t.path)).collect()
}

impl Database {
    /// Saves one analysis of a track whose file was read (§4, Saving). What
    /// was found replaces the stored value: the BPM with its confidence and
    /// grid, the key with its confidence, each together or not at all. What
    /// was not found keeps the stored value. The version is written either way.
    pub fn save_analysis(&self, track_id: i64, bpm: Option<&BpmResult>, key: Option<&KeyResult>, version: i64) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO track_analysis (track_id, analysis_version, analyzed_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(track_id) DO UPDATE SET
                analysis_version = excluded.analysis_version,
                analyzed_at = excluded.analyzed_at",
            params![track_id, version],
        )?;
        if let Some(b) = bpm {
            tx.execute(
                "UPDATE track_analysis SET bpm = ?2, bpm_confidence = ?3, first_beat_ms = ?4 WHERE track_id = ?1",
                params![track_id, b.bpm, b.confidence, b.first_beat_ms],
            )?;
        }
        if let Some(k) = key {
            tx.execute(
                "UPDATE track_analysis SET musical_key = ?2, key_confidence = ?3 WHERE track_id = ?1",
                params![track_id, k.camelot, k.confidence],
            )?;
        }
        tx.commit()
    }

    /// The BPM and key a new track's tags carry (§4, Tags): no confidence and
    /// no version, so analysis replaces them. A track that already has an
    /// analysis row keeps it.
    pub fn save_tag_analysis(&self, track_id: i64, bpm: Option<f64>, camelot: Option<&str>) -> Result<()> {
        if bpm.is_none() && camelot.is_none() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO track_analysis (track_id, bpm, musical_key, analyzed_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(track_id) DO NOTHING",
            params![track_id, bpm, camelot],
        )?;
        Ok(())
    }

    /// The version that produced a track's analysis; None when there is none.
    pub fn analysis_version(&self, track_id: i64) -> Result<Option<i64>> {
        Ok(self
            .conn
            .query_row("SELECT analysis_version FROM track_analysis WHERE track_id = ?1", [track_id], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .optional()?
            .flatten())
    }

    /// Tracks not analysed with `version`, by id, whether or not their file
    /// is on disk: `on_disk` finishes the §4 rule outside the lock.
    pub fn tracks_not_current(&self, version: i64) -> Result<Vec<NotCurrent>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path,
                    (a.bpm IS NOT NULL AND a.bpm_confidence IS NOT NULL)
                    OR (a.musical_key IS NOT NULL AND a.key_confidence IS NOT NULL)
             FROM tracks t LEFT JOIN track_analysis a ON a.track_id = t.id
             WHERE a.analysis_version IS NULL OR a.analysis_version < ?1
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([version], |r| {
            Ok(NotCurrent { id: r.get(0)?, path: r.get(1)?, has_old_values: r.get(2)? })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::bpm::BpmResult;
    use crate::audio::key::KeyResult;
    use rusqlite::params;
    use tempfile::TempDir;

    fn db() -> Database {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db
    }

    fn track(db: &Database, path: &str) -> i64 {
        db.conn.execute("INSERT INTO tracks (file_path, file_hash, title) VALUES (?1, ?1, ?1)", params![path]).unwrap();
        db.conn.last_insert_rowid()
    }

    #[test]
    fn migration_022_runs_once_and_clears_failed_bpms() {
        let db = db();
        let failed = track(&db, "/m/failed.mp3");
        let found = track(&db, "/m/found.mp3");
        db.save_bpm_analysis(failed, 0.0, 0.0).unwrap();
        db.save_bpm_analysis(found, 124.0, 0.9).unwrap();
        // As before 022: drop its columns, then migrate again, twice.
        db.conn
            .execute_batch(
                "ALTER TABLE track_analysis DROP COLUMN first_beat_ms;
                 ALTER TABLE track_analysis DROP COLUMN analysis_version;",
            )
            .unwrap();
        db.run_migrations().unwrap();
        db.run_migrations().unwrap();
        let bpm = |id: i64| -> Option<f64> {
            db.conn.query_row("SELECT bpm FROM track_analysis WHERE track_id = ?1", [id], |r| r.get(0)).unwrap()
        };
        assert_eq!(bpm(failed), None);
        let confidence: Option<f64> = db
            .conn
            .query_row("SELECT bpm_confidence FROM track_analysis WHERE track_id = ?1", [failed], |r| r.get(0))
            .unwrap();
        assert_eq!(confidence, None);
        assert_eq!(bpm(found), Some(124.0));
        let version: Option<i64> = db
            .conn
            .query_row("SELECT analysis_version FROM track_analysis WHERE track_id = ?1", [found], |r| r.get(0))
            .unwrap();
        assert_eq!(version, None);
    }

    type Row = (Option<f64>, Option<f64>, Option<f64>, Option<String>, Option<f64>, Option<i64>);

    fn row(db: &Database, id: i64) -> Row {
        db.conn
            .query_row(
                "SELECT bpm, bpm_confidence, first_beat_ms, musical_key, key_confidence, analysis_version
                 FROM track_analysis WHERE track_id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .unwrap()
    }

    fn found_bpm(bpm: f64, first: Option<f64>) -> BpmResult {
        BpmResult { bpm, confidence: 0.9, first_beat_ms: first }
    }

    fn found_key(camelot: &str) -> KeyResult {
        KeyResult { camelot: camelot.into(), open_key: String::new(), musical_key: String::new(), confidence: 0.7 }
    }

    #[test]
    fn what_was_found_is_saved_with_the_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), Some(0.9), Some(137.0), Some("8A".into()), Some(0.7), Some(1)));
    }

    #[test]
    fn a_new_bpm_never_pairs_with_an_old_grid() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), None, 1).unwrap();
        db.save_analysis(id, Some(&found_bpm(125.0, None)), None, 1).unwrap();
        assert_eq!(row(&db, id).2, None);
    }

    #[test]
    fn what_was_not_found_keeps_the_stored_value() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        db.save_analysis(id, None, None, 2).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), Some(0.9), Some(137.0), Some("8A".into()), Some(0.7), Some(2)));
    }

    #[test]
    fn a_file_that_would_not_decode_still_gets_the_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, None, None, 1).unwrap();
        assert_eq!(row(&db, id), (None, None, None, None, None, Some(1)));
    }

    #[test]
    fn tag_values_have_no_confidence_and_no_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_tag_analysis(id, Some(124.0), Some("8A")).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), None, None, Some("8A".into()), None, None));
    }

    #[test]
    fn tags_never_overwrite_an_analysis() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, None)), None, 1).unwrap();
        db.save_tag_analysis(id, Some(128.0), Some("5A")).unwrap();
        assert_eq!(row(&db, id).0, Some(124.0));
        assert_eq!(row(&db, id).3, None);
    }

    #[test]
    fn the_rule_needs_an_old_version_and_a_file_on_disk() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.wav");
        std::fs::write(&file, b"x").unwrap();
        let there = file.to_string_lossy().to_string();
        let gone = dir.path().join("gone.wav").to_string_lossy().to_string();
        assert!(needs_analysis(None, &there, 1));
        assert!(needs_analysis(Some(0), &there, 1));
        assert!(!needs_analysis(Some(1), &there, 1));
        assert!(!needs_analysis(None, &gone, 1));
        assert!(is_current(Some(1), 1) && is_current(Some(2), 1));
        assert!(!is_current(None, 1) && !is_current(Some(0), 1));
    }

    #[test]
    fn tracks_needing_analysis_skip_current_and_missing_ones() {
        let dir = TempDir::new().unwrap();
        let path = |name: &str| {
            let p = dir.path().join(name);
            std::fs::write(&p, b"x").unwrap();
            p.to_string_lossy().to_string()
        };
        let db = db();
        let current = track(&db, &path("current.wav"));
        let old = track(&db, &path("old.wav"));
        let tagged = track(&db, &path("tagged.wav"));
        let never = track(&db, &path("never.wav"));
        let missing = track(&db, &dir.path().join("missing.wav").to_string_lossy());
        db.save_analysis(current, Some(&found_bpm(124.0, None)), None, 1).unwrap();
        db.save_bpm_analysis(old, 124.0, 0.9).unwrap();
        db.save_tag_analysis(tagged, Some(124.0), None).unwrap();
        db.save_bpm_analysis(missing, 124.0, 0.9).unwrap();

        let needing: Vec<(i64, bool)> =
            on_disk(db.tracks_not_current(1).unwrap()).into_iter().map(|t| (t.id, t.has_old_values)).collect();
        assert_eq!(needing, vec![(old, true), (tagged, false), (never, false)]);
        assert_eq!(db.analysis_version(current).unwrap(), Some(1));
        assert_eq!(db.analysis_version(never).unwrap(), None);
    }

    #[test]
    fn migration_022_is_all_or_nothing() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_bpm_analysis(id, 0.0, 0.0).unwrap(); // gives the blocked UPDATE a row
        db.conn
            .execute_batch(
                "ALTER TABLE track_analysis DROP COLUMN first_beat_ms;
                 ALTER TABLE track_analysis DROP COLUMN analysis_version;
                 CREATE TRIGGER block_update BEFORE UPDATE ON track_analysis
                 BEGIN SELECT RAISE(ABORT, 'blocked'); END;",
            )
            .unwrap();
        assert!(db.run_migrations().is_err());
        let columns = |db: &Database| -> i64 {
            db.conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('track_analysis') WHERE name IN ('first_beat_ms', 'analysis_version')",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
        };
        assert_eq!(columns(&db), 0);
        db.conn.execute_batch("DROP TRIGGER block_update;").unwrap();
        db.run_migrations().unwrap();
        assert_eq!(columns(&db), 2);
    }

    #[test]
    fn failed_bpms_from_an_older_release_are_cleared_on_every_start() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), None, 1).unwrap();
        // The older release overwrites the BPM with a failed 0.
        db.save_bpm_analysis(id, 0.0, 0.0).unwrap();
        db.run_migrations().unwrap();
        let (bpm, confidence, grid, version) = {
            let r = row(&db, id);
            (r.0, r.1, r.2, r.5)
        };
        assert_eq!((bpm, confidence, grid, version), (None, None, None, None));
        assert!(!is_current(version, 1));
    }

    #[test]
    fn a_key_alone_replaces_only_the_key() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        let mut key = found_key("5B");
        key.confidence = 0.4;
        db.save_analysis(id, None, Some(&key), 1).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), Some(0.9), Some(137.0), Some("5B".into()), Some(0.4), Some(1)));
    }

    #[test]
    fn a_bpm_alone_replaces_only_the_bpm() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        let mut second = found_bpm(126.0, Some(10.0));
        second.confidence = 0.5;
        db.save_analysis(id, Some(&second), None, 1).unwrap();
        assert_eq!(row(&db, id), (Some(126.0), Some(0.5), Some(10.0), Some("8A".into()), Some(0.7), Some(1)));
    }

    #[test]
    fn old_values_count_when_only_the_key_has_a_confidence() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("k.wav");
        std::fs::write(&p, b"x").unwrap();
        let db = db();
        let id = track(&db, &p.to_string_lossy());
        db.save_analysis(id, None, Some(&found_key("8A")), 0).unwrap();
        let t = db.tracks_not_current(1).unwrap();
        assert_eq!(t.len(), 1);
        assert!(t[0].has_old_values);
    }

    #[test]
    fn tag_bpms_older_releases_stored_with_0_99_lose_that_confidence_on_every_start() {
        let dir = TempDir::new().unwrap();
        let path = |name: &str| {
            let p = dir.path().join(name);
            std::fs::write(&p, b"x").unwrap();
            p.to_string_lossy().to_string()
        };
        let db = db();
        let tag = track(&db, &path("tag.wav"));
        let low = track(&db, &path("low.wav"));
        let one = track(&db, &path("one.wav"));
        let versioned = track(&db, &path("versioned.wav"));
        db.save_bpm_analysis(tag, 124.0, 0.99).unwrap();
        db.save_bpm_analysis(low, 124.0, 0.98).unwrap();
        db.save_bpm_analysis(one, 124.0, 1.0).unwrap();
        db.save_bpm_analysis(versioned, 124.0, 0.99).unwrap();
        db.conn.execute("UPDATE track_analysis SET analysis_version = 1 WHERE track_id = ?1", [versioned]).unwrap();

        db.run_migrations().unwrap();

        assert_eq!(row(&db, tag).1, None);
        assert_eq!(row(&db, low).1, Some(0.98));
        assert_eq!(row(&db, one).1, Some(1.0));
        assert_eq!(row(&db, versioned).1, Some(0.99));
        let old: Vec<(i64, bool)> =
            db.tracks_not_current(1).unwrap().into_iter().map(|t| (t.id, t.has_old_values)).collect();
        assert_eq!(old, vec![(tag, false), (low, true), (one, true)]);
    }
}
