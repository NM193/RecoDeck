// src-tauri/src/db/youtube_music.rs
//! Storage for the YouTube Music section: the videos, which list each one is
//! in, and the Yes / No answers given on Maybe rows.
//!
//! Ownership is not stored, as with Spotify: the frontend works it out against
//! the library on every change, so a track turns Owned the moment its file is
//! scanned.

use super::Database;
use rusqlite::{params, Result, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

/// Liked music's id — YouTube's own, so it reads like any playlist id.
pub const LIKED_MUSIC_ID: &str = "LM";
pub const LIKED_MUSIC_NAME: &str = "Liked music";
/// "All playlists" — not a stored list, every list at once.
pub const ALL_LISTS_ID: &str = "all";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmTrack {
    pub video_id: String,
    /// As YouTube writes it: "Soulva - Odyssey (Original Mix)".
    pub title: String,
    /// The video owner's channel: "Extrawelt - Topic".
    pub channel: String,
    /// None until `videos` answered for it.
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmListRow {
    pub id: String,
    pub name: String,
    pub position: i64,
    /// Available items at the last full read, a video listed twice counted twice.
    pub track_count: i64,
    /// YouTube's `totalResults` at the last full read: unavailable items included.
    pub total_results: Option<i64>,
    pub last_opened_at: i64,
    /// Unix ms; set while the playlist answers 404.
    pub unavailable_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmEntryRow {
    pub list_id: String,
    pub video_id: String,
    pub added_at: Option<String>,
    pub first_seen_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmVerdictRow {
    pub video_id: String,
    pub library_track_id: i64,
    pub verdict: String,
}

/// Everything the frontend needs, in one call.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmLibraryDump {
    pub lists: Vec<YtmListRow>,
    pub tracks: Vec<YtmTrack>,
    pub entries: Vec<YtmEntryRow>,
    pub verdicts: Vec<YtmVerdictRow>,
}

impl Database {
    pub fn get_ytm_library(&self) -> Result<YtmLibraryDump> {
        // The trigger removes a deleted file's verdicts; this is the safety net.
        self.conn.execute(
            "DELETE FROM ytm_match_verdicts WHERE library_track_id NOT IN (SELECT id FROM tracks)",
            [],
        )?;

        let lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, position, track_count, total_results, last_opened_at, unavailable_at
                 FROM ytm_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmListRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    position: r.get(2)?,
                    track_count: r.get(3)?,
                    total_results: r.get(4)?,
                    last_opened_at: r.get(5)?,
                    unavailable_at: r.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let tracks = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id, title, channel, duration_ms FROM ytm_tracks")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmTrack {
                    video_id: r.get(0)?,
                    title: r.get(1)?,
                    channel: r.get(2)?,
                    duration_ms: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let entries = {
            let mut stmt = self
                .conn
                .prepare("SELECT list_id, video_id, added_at, first_seen_at FROM ytm_list_tracks")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmEntryRow {
                    list_id: r.get(0)?,
                    video_id: r.get(1)?,
                    added_at: r.get(2)?,
                    first_seen_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let verdicts = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id, library_track_id, verdict FROM ytm_match_verdicts")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmVerdictRow {
                    video_id: r.get(0)?,
                    library_track_id: r.get(1)?,
                    verdict: r.get(2)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        Ok(YtmLibraryDump { lists, tracks, entries, verdicts })
    }

    /// Opening a list marks what is in it seen. `ALL_LISTS_ID` marks every list.
    pub fn mark_ytm_list_opened(&self, list_id: &str, now_ms: i64) -> Result<()> {
        if list_id == ALL_LISTS_ID {
            self.conn.execute("UPDATE ytm_lists SET last_opened_at = ?1", [now_ms])?;
        } else {
            self.conn.execute(
                "UPDATE ytm_lists SET last_opened_at = ?1 WHERE id = ?2",
                params![now_ms, list_id],
            )?;
        }
        Ok(())
    }

    /// `verdict` is "yes" or "no"; the table refuses anything else.
    pub fn set_ytm_verdict(&self, video_id: &str, library_track_id: i64, verdict: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO ytm_match_verdicts (video_id, library_track_id, verdict)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(video_id, library_track_id) DO UPDATE SET verdict = excluded.verdict",
            params![video_id, library_track_id, verdict],
        )?;
        Ok(())
    }

    pub fn has_ytm_list(&self, id: &str) -> Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM ytm_lists WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )
    }

    /// A playlist added by link goes after every other list. Liked music is 0,
    /// so the first one added is 1 whether or not Liked music is stored yet.
    /// `now_ms` is its "new" baseline until its first full read sets it again.
    pub fn add_ytm_list(&self, id: &str, name: &str, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO ytm_lists (id, name, position, last_opened_at)
             VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM ytm_lists), ?3)",
            params![id, name, now_ms],
        )?;
        Ok(())
    }

    /// Removing a playlist: its pairs and its row, then the videos now in no
    /// list. Verdicts stay, so adding it back does not ask again.
    pub fn remove_ytm_list(&self, id: &str) -> Result<()> {
        let tx = self.ytm_immediate_transaction()?;
        self.conn.execute("DELETE FROM ytm_list_tracks WHERE list_id = ?1", [id])?;
        self.conn.execute("DELETE FROM ytm_lists WHERE id = ?1", [id])?;
        self.delete_ytm_orphans()?;
        tx.commit()
    }

    /// Disconnecting: the videos, the pairs and the verdicts go. The lists stay,
    /// with their sync state cleared — unlike Spotify's, playlists added by link
    /// cannot come back on their own — so connecting again reads each one as a
    /// first sync. Nothing on YouTube is touched.
    pub fn clear_ytm_account(&self) -> Result<()> {
        let tx = self.ytm_immediate_transaction()?;
        self.conn.execute_batch(
            "DELETE FROM ytm_list_tracks;
             DELETE FROM ytm_tracks;
             DELETE FROM ytm_match_verdicts;
             UPDATE ytm_lists SET track_count = 0, total_results = NULL, first_page_ids = NULL,
                                  full_synced_at = NULL, unavailable_at = NULL;",
        )?;
        tx.commit()
    }

    /// Videos in no list. Their verdicts stay.
    fn delete_ytm_orphans(&self) -> Result<()> {
        self.conn.execute(
            "DELETE FROM ytm_tracks WHERE video_id NOT IN (SELECT video_id FROM ytm_list_tracks)",
            [],
        )?;
        Ok(())
    }

    /// Takes the write lock up front, as `db/spotify.rs` does: the companion
    /// server opens a second connection to the same file.
    fn ytm_immediate_transaction(&self) -> Result<Transaction<'_>> {
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;
    use rusqlite::params;

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
            title: Some("Odyssey".to_string()),
            artist: Some("Soulva".to_string()),
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

    fn seed_list(db: &Database, id: &str, position: i64) {
        db.conn
            .execute(
                "INSERT INTO ytm_lists (id, name, position, last_opened_at) VALUES (?1, ?1, ?2, 100)",
                params![id, position],
            )
            .unwrap();
    }

    /// A video in a list, as a sync would have left it.
    fn seed_pair(db: &Database, list_id: &str, video_id: &str) {
        db.conn
            .execute(
                "INSERT OR IGNORE INTO ytm_tracks (video_id, title, channel) VALUES (?1, 'T', 'C')",
                [video_id],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO ytm_list_tracks (list_id, video_id, added_at, first_seen_at) VALUES (?1, ?2, NULL, 100)",
                params![list_id, video_id],
            )
            .unwrap();
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    fn opened(db: &Database) -> Vec<(String, i64)> {
        db.get_ytm_library()
            .unwrap()
            .lists
            .into_iter()
            .map(|l| (l.id, l.last_opened_at))
            .collect()
    }

    #[test]
    fn migration_017_runs_twice_and_starts_empty() {
        let db = fresh();
        db.run_migrations().expect("second run");
        let dump = db.get_ytm_library().unwrap();
        assert!(dump.lists.is_empty());
        assert!(dump.tracks.is_empty());
        assert!(dump.entries.is_empty());
        assert!(dump.verdicts.is_empty());
    }

    #[test]
    fn playlists_follow_liked_music_in_the_order_they_were_added() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PLb", "First added", 100).unwrap();
        db.add_ytm_list("PLa", "Second added", 100).unwrap();
        let lists = db.get_ytm_library().unwrap().lists;
        assert_eq!(
            lists.iter().map(|l| (l.id.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, 0), ("PLb", 1), ("PLa", 2)]
        );
        assert_eq!(lists[1].name, "First added");
        assert_eq!(lists[1].total_results, None);
        assert_eq!(lists[1].unavailable_at, None);
        assert!(db.has_ytm_list("PLa").unwrap());
        assert!(!db.has_ytm_list("PLz").unwrap());
    }

    #[test]
    fn a_playlist_added_before_liked_music_was_synced_still_comes_after_it() {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        assert_eq!(db.get_ytm_library().unwrap().lists[0].position, 1);
    }

    #[test]
    fn opening_a_list_marks_only_that_list_and_all_marks_every_list() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        seed_list(&db, "PL1", 1);
        db.mark_ytm_list_opened("PL1", 500).unwrap();
        assert_eq!(opened(&db), vec![(LIKED_MUSIC_ID.to_string(), 100), ("PL1".to_string(), 500)]);
        db.mark_ytm_list_opened(ALL_LISTS_ID, 700).unwrap();
        assert_eq!(opened(&db), vec![(LIKED_MUSIC_ID.to_string(), 700), ("PL1".to_string(), 700)]);
    }

    #[test]
    fn a_verdict_is_stored_changed_and_checked() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("v1", file, "no").unwrap();
        db.set_ytm_verdict("v1", file, "yes").unwrap();
        assert_eq!(
            db.get_ytm_library().unwrap().verdicts,
            vec![YtmVerdictRow { video_id: "v1".to_string(), library_track_id: file, verdict: "yes".to_string() }]
        );
        assert!(db.set_ytm_verdict("v1", file, "maybe").is_err());
    }

    #[test]
    fn a_deleted_files_verdicts_go_with_it() {
        let db = fresh();
        let gone = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("v1", gone, "yes").unwrap();
        db.conn.execute("DELETE FROM tracks WHERE id = ?1", [gone]).unwrap();
        assert_eq!(count(&db, "ytm_match_verdicts"), 0);
    }

    #[test]
    fn removing_a_playlist_drops_its_rows_and_its_videos_in_no_other_list_but_keeps_verdicts() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        seed_pair(&db, LIKED_MUSIC_ID, "shared");
        seed_pair(&db, "PL1", "shared");
        seed_pair(&db, "PL1", "only");
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("only", file, "no").unwrap();

        db.remove_ytm_list("PL1").unwrap();

        let dump = db.get_ytm_library().unwrap();
        assert_eq!(dump.lists.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), [LIKED_MUSIC_ID]);
        assert_eq!(dump.tracks.iter().map(|t| t.video_id.as_str()).collect::<Vec<_>>(), ["shared"]);
        assert_eq!(dump.entries.len(), 1);
        assert_eq!(dump.verdicts.len(), 1, "a re-added playlist does not ask again");
    }

    #[test]
    fn disconnecting_forgets_the_videos_and_answers_but_keeps_the_added_playlists() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        db.conn
            .execute(
                "UPDATE ytm_lists SET track_count = 3, total_results = 4, first_page_ids = '[\"a\"]',
                        full_synced_at = 50, unavailable_at = 60",
                [],
            )
            .unwrap();
        seed_pair(&db, "PL1", "a");
        db.set_ytm_verdict("a", 1, "yes").unwrap();
        db.set_setting("youtube_api_key", "kept").unwrap();

        db.clear_ytm_account().unwrap();

        for table in ["ytm_list_tracks", "ytm_tracks", "ytm_match_verdicts"] {
            assert_eq!(count(&db, table), 0, "{table} should be empty");
        }
        let state: (i64, Option<i64>, Option<String>, Option<i64>, Option<i64>) = db
            .conn
            .query_row(
                "SELECT track_count, total_results, first_page_ids, full_synced_at, unavailable_at
                 FROM ytm_lists WHERE id = 'PL1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(state, (0, None, None, None, None), "sync state cleared");
        let lists = db.get_ytm_library().unwrap().lists;
        assert_eq!(
            lists.iter().map(|l| (l.id.as_str(), l.name.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, LIKED_MUSIC_ID, 0), ("PL1", "Deep", 1)],
            "the playlists stay, named and in order"
        );
        assert_eq!(db.get_setting("youtube_api_key").unwrap().as_deref(), Some("kept"));
    }
}
