// src-tauri/src/db/youtube_music.rs
//! Storage for the YouTube Music section: the videos, which list each one is
//! in, and the Yes / No answers given on Maybe rows.
//!
//! Ownership is not stored, as with Spotify: the frontend works it out against
//! the library on every change, so a track turns Owned the moment its file is
//! scanned.

use super::Database;
use rusqlite::{params, OptionalExtension, Result, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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

// --- what a sync found ------------------------------------------------

/// One available video in one list, as YouTube returned it.
#[derive(Debug, Clone, PartialEq)]
pub struct YtmEntry {
    pub track: YtmTrack,
    /// `snippet.publishedAt`: when it was added to the playlist (ISO).
    pub added_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ListChange {
    /// Its first page matched what is stored: nothing was read past it.
    Unchanged,
    /// Every page was read.
    Full {
        /// The available items, in YouTube's order. Deleted and private
        /// videos are not here.
        entries: Vec<YtmEntry>,
        total_results: i64,
        /// Every video id on page one, unavailable ones included.
        first_page_ids: Vec<String>,
    },
    /// 404: the playlist was deleted or made private.
    Gone,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncChanges {
    /// One per list checked, Liked music first.
    pub lists: Vec<(String, ListChange)>,
    /// Durations of the videos not in `known_ids` (new, or stored without a length).
    pub durations: HashMap<String, i64>,
}

/// What the last full read of a list left behind.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ListBaseline {
    pub id: String,
    pub total_results: Option<i64>,
    pub first_page_ids: Option<Vec<String>>,
    pub full_synced_at: Option<i64>,
}

impl ListBaseline {
    /// A list never read in full: it gets a full read.
    pub fn new(id: &str) -> Self {
        Self { id: id.to_string(), ..Self::default() }
    }
}

/// What the next sync compares against.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncBaseline {
    /// Liked music first, then the added playlists in sidebar order.
    pub lists: Vec<ListBaseline>,
    /// Videos whose length is stored: not asked for again. A video stored
    /// without one (a premiere or a live stream when it was first read) is
    /// not here, so its next full read asks again.
    pub known_ids: HashSet<String>,
}

/// A stored list as applying a change needs it: track_count, total_results,
/// full_synced_at, unavailable_at.
type StoredState = (i64, Option<i64>, Option<i64>, Option<i64>);

impl Database {
    pub fn ytm_baseline(&self) -> Result<SyncBaseline> {
        let mut lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, total_results, first_page_ids, full_synced_at
                 FROM ytm_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                let first_page: Option<String> = r.get(2)?;
                Ok(ListBaseline {
                    id: r.get(0)?,
                    total_results: r.get(1)?,
                    // Unreadable JSON is as good as none: the list is read in full.
                    first_page_ids: first_page.and_then(|raw| serde_json::from_str(&raw).ok()),
                    full_synced_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };
        // Liked music is synced from the start; its row is made by its first sync.
        if !lists.iter().any(|l| l.id == LIKED_MUSIC_ID) {
            lists.insert(0, ListBaseline::new(LIKED_MUSIC_ID));
        }
        Ok(SyncBaseline { lists, known_ids: self.ytm_known_ids()? })
    }

    /// Videos whose length is stored. One stored without a length is left
    /// out, so the next full read of its list asks YouTube again.
    pub fn ytm_known_ids(&self) -> Result<HashSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT video_id FROM ytm_tracks WHERE duration_ms IS NOT NULL")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect()
    }

    /// Stores what a sync found, all of it or none of it. Returns whether
    /// anything a person would see changed.
    ///
    /// Liked music's row is made by its first sync. A playlist's row is made
    /// when it is added, so a result for one no longer stored (removed while
    /// the sync ran) is dropped rather than brought back.
    pub fn apply_ytm_sync(&self, changes: &SyncChanges, now_ms: i64) -> Result<bool> {
        let tx = self.ytm_immediate_transaction()?;
        let mut changed = self.conn.execute(
            "INSERT OR IGNORE INTO ytm_lists (id, name, position, last_opened_at) VALUES (?1, ?2, 0, ?3)",
            params![LIKED_MUSIC_ID, LIKED_MUSIC_NAME, now_ms],
        )? > 0;

        for (list_id, change) in &changes.lists {
            let stored: Option<StoredState> = self
                .conn
                .query_row(
                    "SELECT track_count, total_results, full_synced_at, unavailable_at
                     FROM ytm_lists WHERE id = ?1",
                    [list_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;
            let Some((track_count, total_before, full_synced_at, unavailable_at)) = stored else {
                continue;
            };

            match change {
                // An unchanged first page proves the list answered: the next
                // successful read clears the vanished mark.
                ListChange::Unchanged => {
                    if unavailable_at.is_some() {
                        self.conn.execute(
                            "UPDATE ytm_lists SET unavailable_at = NULL WHERE id = ?1",
                            params![list_id],
                        )?;
                        changed = true;
                    }
                }
                ListChange::Gone => {
                    if unavailable_at.is_none() {
                        self.conn.execute(
                            "UPDATE ytm_lists SET unavailable_at = ?2 WHERE id = ?1",
                            params![list_id, now_ms],
                        )?;
                        changed = true;
                    }
                }
                ListChange::Full { entries, total_results, first_page_ids } => {
                    for entry in entries {
                        let duration = changes.durations.get(&entry.track.video_id).copied();
                        changed |= self.upsert_ytm_track(&entry.track, duration)?;
                    }
                    changed |= self.replace_ytm_pairs(list_id, entries, now_ms)?;

                    let first_read = full_synced_at.is_none();
                    let ids = serde_json::to_string(first_page_ids).unwrap_or_else(|_| "[]".to_string());
                    // A list's first full read is its baseline: what it already
                    // held is not new.
                    self.conn.execute(
                        "UPDATE ytm_lists SET track_count = ?2, total_results = ?3, first_page_ids = ?4,
                                full_synced_at = ?5, unavailable_at = NULL,
                                last_opened_at = CASE WHEN ?6 THEN ?5 ELSE last_opened_at END
                         WHERE id = ?1",
                        params![list_id, entries.len() as i64, total_results, ids, now_ms, first_read],
                    )?;
                    changed |= track_count != entries.len() as i64
                        || total_before != Some(*total_results)
                        || unavailable_at.is_some();
                }
            }
        }

        self.delete_ytm_orphans()?;
        tx.commit()?;
        Ok(changed)
    }

    /// Returns true when the video is new or its title or channel changed. A
    /// duration is only ever filled in, never cleared.
    fn upsert_ytm_track(&self, track: &YtmTrack, duration_ms: Option<i64>) -> Result<bool> {
        let written = self.conn.execute(
            "INSERT INTO ytm_tracks (video_id, title, channel, duration_ms) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(video_id) DO UPDATE SET
                title = excluded.title,
                channel = excluded.channel,
                duration_ms = COALESCE(excluded.duration_ms, ytm_tracks.duration_ms)
             WHERE title IS NOT excluded.title
                OR channel IS NOT excluded.channel
                OR (excluded.duration_ms IS NOT NULL AND duration_ms IS NOT excluded.duration_ms)",
            params![track.video_id, track.title, track.channel, duration_ms.or(track.duration_ms)],
        )?;
        Ok(written > 0)
    }

    /// A full read of a list: add what is new (first seen now), drop what
    /// YouTube no longer lists, leave the rest with its `first_seen_at`.
    /// Delete-then-insert would mark the whole list new.
    fn replace_ytm_pairs(&self, list_id: &str, entries: &[YtmEntry], now_ms: i64) -> Result<bool> {
        let before: HashSet<String> = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id FROM ytm_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([list_id], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let mut written = false;
        let mut wanted: HashSet<&str> = HashSet::new();
        for entry in entries {
            // A video listed twice is one row, dated by its first listing.
            if !wanted.insert(entry.track.video_id.as_str()) {
                continue;
            }
            written |= self.conn.execute(
                "INSERT INTO ytm_list_tracks (list_id, video_id, added_at, first_seen_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(list_id, video_id) DO UPDATE SET added_at = excluded.added_at
                 WHERE added_at IS NOT excluded.added_at",
                params![list_id, entry.track.video_id, entry.added_at, now_ms],
            )? > 0;
        }

        let mut removed = 0;
        for gone in before.iter().filter(|id| !wanted.contains(id.as_str())) {
            removed += self.conn.execute(
                "DELETE FROM ytm_list_tracks WHERE list_id = ?1 AND video_id = ?2",
                params![list_id, gone],
            )?;
        }
        Ok(written || removed > 0)
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

    // --- applying a sync ----------------------------------------------

    fn entry(id: &str) -> YtmEntry {
        YtmEntry {
            track: YtmTrack {
                video_id: id.to_string(),
                title: format!("Artist - Title {id}"),
                channel: "Label".to_string(),
                duration_ms: None,
            },
            added_at: Some("2026-10-01T09:00:00Z".to_string()),
        }
    }

    fn full(ids: &[&str]) -> ListChange {
        ListChange::Full {
            entries: ids.iter().map(|id| entry(id)).collect(),
            total_results: ids.len() as i64,
            first_page_ids: ids.iter().map(|id| id.to_string()).collect(),
        }
    }

    fn sync(lists: Vec<(&str, ListChange)>) -> SyncChanges {
        SyncChanges {
            lists: lists.into_iter().map(|(id, change)| (id.to_string(), change)).collect(),
            durations: HashMap::new(),
        }
    }

    /// The ids that would carry a dot: first seen later than the list's opening.
    fn new_ids(db: &Database, list_id: &str) -> Vec<String> {
        let dump = db.get_ytm_library().unwrap();
        let opened = dump.lists.iter().find(|l| l.id == list_id).expect("list stored").last_opened_at;
        let mut ids: Vec<String> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == list_id && e.first_seen_at > opened)
            .map(|e| e.video_id.clone())
            .collect();
        ids.sort();
        ids
    }

    fn first_seen(db: &Database, list_id: &str, video_id: &str) -> i64 {
        db.conn
            .query_row(
                "SELECT first_seen_at FROM ytm_list_tracks WHERE list_id = ?1 AND video_id = ?2",
                params![list_id, video_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    fn list(db: &Database, id: &str) -> YtmListRow {
        db.get_ytm_library().unwrap().lists.into_iter().find(|l| l.id == id).expect("list stored")
    }

    /// Liked music [a, b] and playlist PL1 [b, c], first synced at 1,000.
    fn baseline_db() -> Database {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 1_000).unwrap();
        db.apply_ytm_sync(
            &sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"])), ("PL1", full(&["b", "c"]))]),
            1_000,
        )
        .unwrap();
        db
    }

    #[test]
    fn a_lists_first_full_read_is_its_baseline() {
        let db = baseline_db();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty());
        assert!(new_ids(&db, "PL1").is_empty());
        let dump = db.get_ytm_library().unwrap();
        assert_eq!(
            dump.lists.iter().map(|l| (l.id.as_str(), l.name.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, LIKED_MUSIC_NAME, 0), ("PL1", "Deep", 1)]
        );
        assert!(dump.lists.iter().all(|l| l.last_opened_at == 1_000));
        assert_eq!(list(&db, "PL1").total_results, Some(2));
    }

    #[test]
    fn a_like_after_the_baseline_is_new_until_the_list_is_opened() {
        let db = baseline_db();
        let changed = db
            .apply_ytm_sync(
                &sync(vec![(LIKED_MUSIC_ID, full(&["d", "a", "b"])), ("PL1", ListChange::Unchanged)]),
                2_000,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(new_ids(&db, LIKED_MUSIC_ID), ["d"]);
        assert!(new_ids(&db, "PL1").is_empty());

        db.mark_ytm_list_opened(LIKED_MUSIC_ID, 2_500).unwrap();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty());
    }

    #[test]
    fn a_full_read_keeps_first_seen_at_and_drops_what_left() {
        let db = baseline_db();
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["c", "a"]))]), 2_000).unwrap();
        assert_eq!(first_seen(&db, LIKED_MUSIC_ID, "a"), 1_000);
        assert_eq!(first_seen(&db, LIKED_MUSIC_ID, "c"), 2_000);
        let dump = db.get_ytm_library().unwrap();
        let liked: Vec<&str> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == LIKED_MUSIC_ID)
            .map(|e| e.video_id.as_str())
            .collect();
        assert!(!liked.contains(&"b"), "an unliked video leaves Liked music");
        assert!(dump.tracks.iter().any(|t| t.video_id == "b"), "b is still in PL1");
    }

    #[test]
    fn an_unchanged_sync_changes_nothing() {
        let db = baseline_db();
        let changed = db
            .apply_ytm_sync(
                &sync(vec![(LIKED_MUSIC_ID, ListChange::Unchanged), ("PL1", ListChange::Unchanged)]),
                2_000,
            )
            .unwrap();
        assert!(!changed);
        assert!(!db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 3_000).unwrap());
    }

    #[test]
    fn a_vanished_playlist_is_kept_and_marked_until_it_reads_again() {
        let db = baseline_db();
        assert!(db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Gone)]), 2_000).unwrap());
        assert_eq!(list(&db, "PL1").unavailable_at, Some(2_000));
        let rows = db.get_ytm_library().unwrap().entries.iter().filter(|e| e.list_id == "PL1").count();
        assert_eq!(rows, 2, "its rows stay");

        assert!(!db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Gone)]), 3_000).unwrap(), "already marked");
        assert_eq!(list(&db, "PL1").unavailable_at, Some(2_000));

        db.apply_ytm_sync(&sync(vec![("PL1", full(&["b", "c"]))]), 4_000).unwrap();
        assert_eq!(list(&db, "PL1").unavailable_at, None);
    }

    #[test]
    fn a_result_for_a_playlist_removed_meanwhile_is_dropped() {
        let db = baseline_db();
        db.remove_ytm_list("PL1").unwrap();
        db.apply_ytm_sync(&sync(vec![("PL1", full(&["x"]))]), 2_000).unwrap();
        let dump = db.get_ytm_library().unwrap();
        assert!(dump.lists.iter().all(|l| l.id != "PL1"));
        assert!(dump.tracks.iter().all(|t| t.video_id != "x"));
    }

    #[test]
    fn durations_are_filled_in_for_new_videos_and_kept_for_known_ones() {
        let db = fresh();
        let mut first = sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]);
        first.durations.insert("a".to_string(), 95 * 60_000);
        db.apply_ytm_sync(&first, 1_000).unwrap();
        // A read without lengths (YouTube had none for b) keeps a's.
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 2_000).unwrap();
        let length = |db: &Database, id: &str| {
            db.get_ytm_library().unwrap().tracks.into_iter().find(|t| t.video_id == id).unwrap().duration_ms
        };
        assert_eq!(length(&db, "a"), Some(95 * 60_000));
        assert_eq!(length(&db, "b"), None);
        // b has no length yet, so the next full read asks for it again.
        assert_eq!(db.ytm_known_ids().unwrap(), HashSet::from(["a".to_string()]));

        // A premiere that became a video: its length arrives later.
        let mut later = sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]);
        later.durations.insert("b".to_string(), 6 * 60_000);
        assert!(db.apply_ytm_sync(&later, 3_000).unwrap());
        assert_eq!(length(&db, "b"), Some(6 * 60_000));
        assert_eq!(db.ytm_known_ids().unwrap(), HashSet::from(["a".to_string(), "b".to_string()]));
    }

    #[test]
    fn the_baseline_lists_liked_music_first_even_before_its_first_sync() {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        assert_eq!(
            db.ytm_baseline().unwrap().lists,
            vec![ListBaseline::new(LIKED_MUSIC_ID), ListBaseline::new("PL1")]
        );

        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 1_000).unwrap();
        let liked = db.ytm_baseline().unwrap().lists.remove(0);
        assert_eq!(
            liked,
            ListBaseline {
                id: LIKED_MUSIC_ID.to_string(),
                total_results: Some(2),
                first_page_ids: Some(vec!["a".to_string(), "b".to_string()]),
                full_synced_at: Some(1_000),
            }
        );
    }

    #[test]
    fn after_a_disconnect_the_next_read_is_a_baseline_again() {
        let db = baseline_db();
        db.clear_ytm_account().unwrap();
        assert_eq!(db.ytm_baseline().unwrap().lists[1], ListBaseline::new("PL1"));

        db.apply_ytm_sync(
            &sync(vec![(LIKED_MUSIC_ID, full(&["a", "z"])), ("PL1", full(&["b"]))]),
            5_000,
        )
        .unwrap();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty(), "connecting again is a first sync");
        assert!(new_ids(&db, "PL1").is_empty());
    }

    #[test]
    fn a_video_listed_twice_is_one_row() {
        let db = fresh();
        let mut second = entry("a");
        second.added_at = Some("2026-10-02T09:00:00Z".to_string());
        let change = ListChange::Full {
            entries: vec![entry("a"), second, entry("b")],
            total_results: 3,
            first_page_ids: vec!["a".to_string(), "a".to_string(), "b".to_string()],
        };
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, change)]), 1_000).unwrap();
        let dump = db.get_ytm_library().unwrap();
        assert_eq!(dump.entries.len(), 2);
        let a = dump.entries.iter().find(|e| e.video_id == "a").unwrap();
        assert_eq!(a.added_at.as_deref(), Some("2026-10-01T09:00:00Z"), "the first listing wins");
        assert_eq!(dump.lists[0].track_count, 3, "YouTube's items, for the unavailable count");
    }

    #[test]
    fn an_unchanged_read_clears_the_vanished_mark() {
        let db = baseline_db();
        db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Gone)]), 2_000).unwrap();
        let changed = db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Unchanged)]), 3_000).unwrap();
        assert!(changed);
        assert_eq!(list(&db, "PL1").unavailable_at, None);
    }
}
