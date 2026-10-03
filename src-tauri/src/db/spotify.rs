// src-tauri/src/db/spotify.rs
//! Storage for the Spotify section: the tracks, which list each one is in, and
//! the Yes / No answers given on Maybe rows.
//!
//! Ownership is not stored. The frontend works it out against the library on
//! every change, so a track turns Owned the moment its file is scanned.

use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

/// Liked Songs' id in `spotify_lists`. Playlist ids are 22-character base62
/// strings, so it cannot collide with one.
pub const LIKED_LIST_ID: &str = "liked";
pub const LIKED_LIST_NAME: &str = "Liked Songs";
/// "All playlists" — not a stored list, every list at once.
pub const ALL_LISTS_ID: &str = "all";
/// The settings key holding the playlists Spotify would not share, as JSON.
pub const REFUSED_SETTING: &str = "spotify_refused";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub spotify_id: String,
    pub title: String,
    /// Artists joined with ", ".
    pub artists: String,
    pub album: Option<String>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyListRow {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub track_count: i64,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyEntryRow {
    pub list_id: String,
    pub spotify_id: String,
    pub added_at: Option<String>,
    pub first_seen_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyVerdictRow {
    pub spotify_id: String,
    pub library_track_id: i64,
    pub verdict: String,
}

/// Everything the frontend needs, in one call: ~1,000 tracks is small.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyLibraryDump {
    pub lists: Vec<SpotifyListRow>,
    pub tracks: Vec<SpotifyTrack>,
    pub entries: Vec<SpotifyEntryRow>,
    pub verdicts: Vec<SpotifyVerdictRow>,
}

impl Database {
    pub fn get_spotify_library(&self) -> Result<SpotifyLibraryDump> {
        // A verdict about a file that is gone says nothing any more — removed
        // here, where it is noticed.
        self.conn.execute(
            "DELETE FROM spotify_match_verdicts
             WHERE library_track_id NOT IN (SELECT id FROM tracks)",
            [],
        )?;

        let lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, position, track_count, last_opened_at
                 FROM spotify_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyListRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    position: r.get(2)?,
                    track_count: r.get(3)?,
                    last_opened_at: r.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let tracks = {
            let mut stmt = self.conn.prepare(
                "SELECT spotify_id, title, artists, album, duration_ms FROM spotify_tracks",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyTrack {
                    spotify_id: r.get(0)?,
                    title: r.get(1)?,
                    artists: r.get(2)?,
                    album: r.get(3)?,
                    duration_ms: r.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let entries = {
            let mut stmt = self.conn.prepare(
                "SELECT list_id, spotify_id, added_at, first_seen_at FROM spotify_list_tracks",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyEntryRow {
                    list_id: r.get(0)?,
                    spotify_id: r.get(1)?,
                    added_at: r.get(2)?,
                    first_seen_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let verdicts = {
            let mut stmt = self.conn.prepare(
                "SELECT spotify_id, library_track_id, verdict FROM spotify_match_verdicts",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyVerdictRow {
                    spotify_id: r.get(0)?,
                    library_track_id: r.get(1)?,
                    verdict: r.get(2)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        Ok(SpotifyLibraryDump { lists, tracks, entries, verdicts })
    }

    /// Opening a list marks what is in it seen. `ALL_LISTS_ID` marks every list.
    pub fn mark_spotify_list_opened(&self, list_id: &str, now_ms: i64) -> Result<()> {
        if list_id == ALL_LISTS_ID {
            self.conn
                .execute("UPDATE spotify_lists SET last_opened_at = ?1", [now_ms])?;
        } else {
            self.conn.execute(
                "UPDATE spotify_lists SET last_opened_at = ?1 WHERE id = ?2",
                params![now_ms, list_id],
            )?;
        }
        Ok(())
    }

    /// `verdict` is "yes" or "no"; the table refuses anything else.
    pub fn set_spotify_verdict(&self, spotify_id: &str, library_track_id: i64, verdict: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO spotify_match_verdicts (spotify_id, library_track_id, verdict)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(spotify_id, library_track_id) DO UPDATE SET verdict = excluded.verdict",
            params![spotify_id, library_track_id, verdict],
        )?;
        Ok(())
    }

    /// Disconnecting forgets everything Spotify-side. Nothing on Spotify is touched.
    pub fn clear_spotify(&self) -> Result<()> {
        self.conn.execute_batch(
            "DELETE FROM spotify_list_tracks;
             DELETE FROM spotify_lists;
             DELETE FROM spotify_tracks;
             DELETE FROM spotify_match_verdicts;",
        )?;
        self.delete_setting(REFUSED_SETTING)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn library_track(path: &str) -> Track {
        Track {
            id: None,
            file_path: path.to_string(),
            file_hash: path.to_string(),
            title: Some("Come Get Up".to_string()),
            artist: Some("Butch".to_string()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: None,
            file_format: None,
            bitrate: None,
            sample_rate: None,
            file_size: None,
            date_added: None,
            date_modified: None,
            play_count: 0,
            rating: 0,
            comment: None,
            artwork_path: None,
            genre: None,
            genre_source: None,
        }
    }

    fn seed_list(db: &Database, id: &str, position: i64, last_opened_at: i64) {
        db.conn
            .execute(
                "INSERT INTO spotify_lists (id, name, snapshot_id, position, track_count, last_opened_at)
                 VALUES (?1, ?1, NULL, ?2, 0, ?3)",
                params![id, position, last_opened_at],
            )
            .unwrap();
    }

    fn opened(db: &Database) -> Vec<(String, i64)> {
        db.get_spotify_library()
            .unwrap()
            .lists
            .into_iter()
            .map(|l| (l.id, l.last_opened_at))
            .collect()
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn migration_015_runs_twice_and_starts_empty() {
        let db = fresh();
        db.run_migrations().expect("second run");
        let dump = db.get_spotify_library().unwrap();
        assert!(dump.lists.is_empty());
        assert!(dump.tracks.is_empty());
        assert!(dump.entries.is_empty());
        assert!(dump.verdicts.is_empty());
    }

    #[test]
    fn opening_a_list_marks_only_that_list() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        seed_list(&db, "p1", 1, 100);
        db.mark_spotify_list_opened("p1", 500).unwrap();
        assert_eq!(
            opened(&db),
            vec![(LIKED_LIST_ID.to_string(), 100), ("p1".to_string(), 500)]
        );
    }

    #[test]
    fn opening_all_playlists_marks_every_list() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        seed_list(&db, "p1", 1, 100);
        db.mark_spotify_list_opened(ALL_LISTS_ID, 700).unwrap();
        assert_eq!(
            opened(&db),
            vec![(LIKED_LIST_ID.to_string(), 700), ("p1".to_string(), 700)]
        );
    }

    #[test]
    fn a_verdict_is_stored_and_can_be_changed() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_spotify_verdict("sp1", file, "no").unwrap();
        db.set_spotify_verdict("sp1", file, "yes").unwrap();
        assert_eq!(
            db.get_spotify_library().unwrap().verdicts,
            vec![SpotifyVerdictRow {
                spotify_id: "sp1".to_string(),
                library_track_id: file,
                verdict: "yes".to_string(),
            }]
        );
    }

    #[test]
    fn the_table_refuses_an_answer_that_is_not_yes_or_no() {
        let db = fresh();
        assert!(db.set_spotify_verdict("sp1", 1, "maybe").is_err());
    }

    #[test]
    fn a_verdict_about_a_deleted_file_is_dropped_when_noticed() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_spotify_verdict("sp1", file, "yes").unwrap();
        db.set_spotify_verdict("sp2", 9_999, "no").unwrap();

        assert_eq!(db.get_spotify_library().unwrap().verdicts.len(), 1);
        assert_eq!(count(&db, "spotify_match_verdicts"), 1);
    }

    #[test]
    fn disconnecting_forgets_everything_spotify_side_and_nothing_else() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        db.conn
            .execute(
                "INSERT INTO spotify_tracks (spotify_id, title, artists) VALUES ('sp1', 'T', 'A')",
                [],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO spotify_list_tracks (list_id, spotify_id, added_at, first_seen_at)
                 VALUES ('liked', 'sp1', NULL, 100)",
                [],
            )
            .unwrap();
        db.set_spotify_verdict("sp1", 1, "no").unwrap();
        db.set_setting(REFUSED_SETTING, "[]").unwrap();
        db.set_setting("youtube_api_key", "kept").unwrap();

        db.clear_spotify().unwrap();

        for table in [
            "spotify_list_tracks",
            "spotify_lists",
            "spotify_tracks",
            "spotify_match_verdicts",
        ] {
            assert_eq!(count(&db, table), 0, "{table} should be empty");
        }
        assert_eq!(db.get_setting(REFUSED_SETTING).unwrap(), None);
        assert_eq!(db.get_setting("youtube_api_key").unwrap().as_deref(), Some("kept"));
    }
}
