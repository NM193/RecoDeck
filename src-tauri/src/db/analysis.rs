// src-tauri/src/db/analysis.rs
// What analysis stores and which tracks need it (spec 2026-10-17, §4, §5).

use super::Database;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

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
        assert_eq!(bpm(found), Some(124.0));
        let version: Option<i64> = db
            .conn
            .query_row("SELECT analysis_version FROM track_analysis WHERE track_id = ?1", [found], |r| r.get(0))
            .unwrap();
        assert_eq!(version, None);
    }
}
