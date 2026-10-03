// src-tauri/src/db/spotify.rs
//! Storage for the Spotify section: the tracks, which list each one is in, and
//! the Yes / No answers given on Maybe rows.
//!
//! Ownership is not stored. The frontend works it out against the library on
//! every change, so a track turns Owned the moment its file is scanned.

use super::Database;
use rusqlite::{params, OptionalExtension, Result, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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
        // A verdict about a file that is gone says nothing any more. The
        // trigger on `tracks` removes them as files go; this is the safety net.
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

    /// Disconnecting forgets everything Spotify-side, all at once or not at
    /// all. Nothing on Spotify is touched.
    pub fn clear_spotify(&self) -> Result<()> {
        let tx = self.immediate_transaction()?;
        self.conn.execute_batch(
            "DELETE FROM spotify_list_tracks;
             DELETE FROM spotify_lists;
             DELETE FROM spotify_tracks;
             DELETE FROM spotify_match_verdicts;",
        )?;
        self.delete_setting(REFUSED_SETTING)?;
        tx.commit()
    }

    /// Takes the write lock up front: the companion server opens a second
    /// connection to the same file, and a deferred transaction that reads first
    /// could fail to upgrade halfway through.
    fn immediate_transaction(&self) -> Result<Transaction<'_>> {
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)
    }
}

// --- what a sync found ------------------------------------------------

/// One track in one list, as Spotify returned it.
#[derive(Debug, Clone, PartialEq)]
pub struct ListEntry {
    pub track: SpotifyTrack,
    /// Spotify's ISO time of the like / add.
    pub added_at: Option<String>,
}

/// A playlist as `/me/playlists` lists it. Also stored as JSON for the
/// playlists Spotify would not share, hence serde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistMeta {
    pub id: String,
    pub name: String,
    pub snapshot_id: String,
    /// What Spotify says is in it, skipped items included.
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LikedChange {
    /// Nothing new, and Spotify's total still adds up.
    Unchanged { total: i64 },
    /// Only these new likes, newest first.
    Prepend { entries: Vec<ListEntry>, total: i64 },
    /// All of Liked Songs.
    Full { entries: Vec<ListEntry>, total: i64 },
}

impl LikedChange {
    pub fn total(&self) -> i64 {
        match self {
            Self::Unchanged { total } | Self::Prepend { total, .. } | Self::Full { total, .. } => *total,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SyncChanges {
    pub liked: LikedChange,
    /// Every playlist Spotify shares, in Spotify's order.
    pub playlists: Vec<PlaylistMeta>,
    /// Full contents of the playlists that are new or whose snapshot changed.
    pub refetched: HashMap<String, Vec<ListEntry>>,
    /// Playlists Spotify would not share; listed by name in Settings.
    pub refused: Vec<PlaylistMeta>,
}

/// What the last sync left behind: what the next one compares against.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncBaseline {
    /// Ids currently in Liked Songs.
    pub liked_known: HashSet<String>,
    /// Spotify's total at the last sync; None until Liked Songs was read once.
    pub liked_total: Option<i64>,
    /// Stored playlist id → snapshot_id.
    pub snapshots: HashMap<String, String>,
    /// Refused playlist id → the snapshot_id it was refused at.
    pub refused: HashMap<String, String>,
}

/// A list as it was stored before this sync.
struct StoredList {
    name: String,
    position: i64,
    track_count: i64,
    snapshot_id: Option<String>,
}

/// A sync whose change set no longer fits what is stored. Rolled back; the
/// next sync starts from what is stored now.
fn stale_changes(why: &str) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ABORT),
        Some(format!("Spotify sync skipped: {why}. The next sync reads it again.")),
    )
}

struct ListUpsert<'a> {
    id: &'a str,
    name: &'a str,
    snapshot_id: Option<&'a str>,
    position: i64,
    total: i64,
}

impl Database {
    /// What the next sync compares against.
    pub fn spotify_baseline(&self) -> Result<SyncBaseline> {
        let liked_total: Option<i64> = self
            .conn
            .query_row(
                "SELECT track_count FROM spotify_lists WHERE id = ?1",
                [LIKED_LIST_ID],
                |r| r.get(0),
            )
            .optional()?;

        let liked_known = {
            let mut stmt = self
                .conn
                .prepare("SELECT spotify_id FROM spotify_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([LIKED_LIST_ID], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let snapshots = {
            let mut stmt = self.conn.prepare(
                "SELECT id, snapshot_id FROM spotify_lists
                 WHERE id <> ?1 AND snapshot_id IS NOT NULL",
            )?;
            let rows = stmt.query_map([LIKED_LIST_ID], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            rows.collect::<Result<HashMap<_, _>>>()?
        };

        let refused = self
            .spotify_refused()?
            .into_iter()
            .map(|p| (p.id, p.snapshot_id))
            .collect();

        Ok(SyncBaseline { liked_known, liked_total, snapshots, refused })
    }

    /// The playlists Spotify would not share at the last sync.
    pub fn spotify_refused(&self) -> Result<Vec<PlaylistMeta>> {
        Ok(self
            .get_setting(REFUSED_SETTING)?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default())
    }

    /// Stores what a sync found, all of it or none of it. Returns whether
    /// anything a person would see changed: a list added, removed, renamed,
    /// moved or recounted, a track added to or removed from a list, or a
    /// track's details.
    ///
    /// `changes` was worked out against a baseline read before the fetch, so it
    /// is not trusted to still match what is stored: a playlist's snapshot only
    /// advances with its contents, and an incremental Liked Songs change needs
    /// a stored Liked Songs to apply to.
    pub fn apply_spotify_sync(&self, changes: &SyncChanges, now_ms: i64) -> Result<bool> {
        let tx = self.immediate_transaction()?;
        let mut changed = false;

        let existing: HashMap<String, StoredList> = {
            let mut stmt = self
                .conn
                .prepare("SELECT id, name, position, track_count, snapshot_id FROM spotify_lists")?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    StoredList {
                        name: r.get(1)?,
                        position: r.get(2)?,
                        track_count: r.get(3)?,
                        snapshot_id: r.get(4)?,
                    },
                ))
            })?;
            rows.collect::<Result<HashMap<_, _>>>()?
        };

        // Only a full read can start Liked Songs. The fetch side reads it in
        // full whenever no Liked Songs row is stored, so this cannot repeat:
        // the failed sync rolls back and the next one does a full read.
        if !existing.contains_key(LIKED_LIST_ID) && !matches!(changes.liked, LikedChange::Full { .. }) {
            return Err(stale_changes("Liked Songs is not stored yet, so new likes have nothing to go on"));
        }

        // Liked Songs, always first.
        changed |= self.upsert_spotify_list(
            &existing,
            ListUpsert {
                id: LIKED_LIST_ID,
                name: LIKED_LIST_NAME,
                snapshot_id: None,
                position: 0,
                total: changes.liked.total(),
            },
            now_ms,
        )?;
        match &changes.liked {
            LikedChange::Unchanged { .. } => {}
            LikedChange::Prepend { entries, .. } => {
                changed |= self.add_spotify_pairs(LIKED_LIST_ID, entries, now_ms)?;
            }
            LikedChange::Full { entries, .. } => {
                changed |= self.replace_spotify_pairs(LIKED_LIST_ID, entries, now_ms)?;
            }
        }

        // Playlists, in Spotify's order after Liked Songs.
        let mut kept: HashSet<&str> = HashSet::from([LIKED_LIST_ID]);
        for (index, playlist) in changes.playlists.iter().enumerate() {
            kept.insert(playlist.id.as_str());
            let refetched = changes.refetched.get(&playlist.id);
            // The snapshot stored is the one the stored contents came from. A
            // playlist that was not read keeps its old one (NULL when it is
            // new), so the next sync reads it.
            let snapshot_id = match refetched {
                Some(_) => Some(playlist.snapshot_id.as_str()),
                None => existing.get(&playlist.id).and_then(|l| l.snapshot_id.as_deref()),
            };
            changed |= self.upsert_spotify_list(
                &existing,
                ListUpsert {
                    id: &playlist.id,
                    name: &playlist.name,
                    snapshot_id,
                    position: index as i64 + 1,
                    total: playlist.total,
                },
                now_ms,
            )?;
            if let Some(entries) = refetched {
                changed |= self.replace_spotify_pairs(&playlist.id, entries, now_ms)?;
            }
        }

        // Lists Spotify no longer returns: unfollowed, deleted, or now refused.
        for id in existing.keys().filter(|id| !kept.contains(id.as_str())) {
            self.conn
                .execute("DELETE FROM spotify_list_tracks WHERE list_id = ?1", [id])?;
            self.conn.execute("DELETE FROM spotify_lists WHERE id = ?1", [id])?;
            changed = true;
        }

        // Tracks in no list. Their verdicts stay.
        self.conn.execute(
            "DELETE FROM spotify_tracks
             WHERE spotify_id NOT IN (SELECT spotify_id FROM spotify_list_tracks)",
            [],
        )?;

        let refused = serde_json::to_string(&changes.refused).unwrap_or_else(|_| "[]".to_string());
        self.set_setting(REFUSED_SETTING, &refused)?;

        tx.commit()?;
        Ok(changed)
    }

    /// Inserts or updates a list. A list stored for the first time gets
    /// `last_opened_at = now`: its first sync is the baseline. So does a
    /// playlist whose contents are read for the first time (stored without a
    /// snapshot until then), or all of it would read as new. Returns true when
    /// the list is new, renamed, moved or recounted.
    fn upsert_spotify_list(
        &self,
        existing: &HashMap<String, StoredList>,
        list: ListUpsert<'_>,
        now_ms: i64,
    ) -> Result<bool> {
        self.conn.execute(
            "INSERT INTO spotify_lists (id, name, snapshot_id, position, track_count, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                last_opened_at = CASE
                    WHEN spotify_lists.id <> ?7
                         AND spotify_lists.snapshot_id IS NULL
                         AND excluded.snapshot_id IS NOT NULL
                    THEN excluded.last_opened_at
                    ELSE spotify_lists.last_opened_at
                END,
                snapshot_id = excluded.snapshot_id,
                position = excluded.position,
                track_count = excluded.track_count",
            params![list.id, list.name, list.snapshot_id, list.position, list.total, now_ms, LIKED_LIST_ID],
        )?;
        Ok(match existing.get(list.id) {
            None => true,
            Some(stored) => {
                stored.name != list.name
                    || stored.position != list.position
                    || stored.track_count != list.total
            }
        })
    }

    /// Returns true when the track is new or its details changed.
    fn upsert_spotify_track(&self, track: &SpotifyTrack) -> Result<bool> {
        let written = self.conn.execute(
            "INSERT INTO spotify_tracks (spotify_id, title, artists, album, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(spotify_id) DO UPDATE SET
                title = excluded.title,
                artists = excluded.artists,
                album = excluded.album,
                duration_ms = excluded.duration_ms
             WHERE title IS NOT excluded.title
                OR artists IS NOT excluded.artists
                OR album IS NOT excluded.album
                OR duration_ms IS NOT excluded.duration_ms",
            params![track.spotify_id, track.title, track.artists, track.album, track.duration_ms],
        )?;
        Ok(written > 0)
    }

    /// Adds pairs that are not there yet, first seen now. A pair already there
    /// keeps its `first_seen_at`; only Spotify's `added_at` is refreshed.
    /// Returns whether anything was written: a pair, its `added_at`, or a
    /// track's details.
    fn add_spotify_pairs(&self, list_id: &str, entries: &[ListEntry], now_ms: i64) -> Result<bool> {
        let mut written = false;
        for entry in entries {
            written |= self.upsert_spotify_track(&entry.track)?;
            written |= self.conn.execute(
                "INSERT INTO spotify_list_tracks (list_id, spotify_id, added_at, first_seen_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(list_id, spotify_id) DO UPDATE SET added_at = excluded.added_at
                 WHERE added_at IS NOT excluded.added_at",
                params![list_id, entry.track.spotify_id, entry.added_at, now_ms],
            )? > 0;
        }
        Ok(written)
    }

    /// A full read of a list: add what is new, delete what Spotify no longer
    /// returns, leave the rest. Delete-then-insert would mark the whole list new.
    fn replace_spotify_pairs(&self, list_id: &str, entries: &[ListEntry], now_ms: i64) -> Result<bool> {
        let before: HashSet<String> = {
            let mut stmt = self
                .conn
                .prepare("SELECT spotify_id FROM spotify_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([list_id], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let written = self.add_spotify_pairs(list_id, entries, now_ms)?;

        let wanted: HashSet<&str> = entries.iter().map(|e| e.track.spotify_id.as_str()).collect();
        let mut removed = 0;
        for gone in before.iter().filter(|id| !wanted.contains(id.as_str())) {
            removed += self.conn.execute(
                "DELETE FROM spotify_list_tracks WHERE list_id = ?1 AND spotify_id = ?2",
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
    fn a_deleted_files_verdicts_do_not_pass_to_the_file_that_reuses_its_id() {
        let db = fresh();
        let gone = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_spotify_verdict("sp1", gone, "yes").unwrap();
        db.conn.execute("DELETE FROM tracks WHERE id = ?1", [gone]).unwrap();

        let reused = db.create_track(&library_track("/music/b.mp3")).unwrap();
        assert_eq!(reused, gone, "SQLite reuses the highest id once it is free");
        // Counted directly: reading the library would also drop stale rows.
        assert_eq!(count(&db, "spotify_match_verdicts"), 0);
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

    // --- applying a sync ----------------------------------------------

    fn entry(id: &str) -> ListEntry {
        ListEntry {
            track: SpotifyTrack {
                spotify_id: id.to_string(),
                title: format!("Title {id}"),
                artists: "Artist".to_string(),
                album: None,
                duration_ms: Some(300_000),
            },
            added_at: Some("2026-10-01T09:00:00Z".to_string()),
        }
    }

    fn entries(ids: &[&str]) -> Vec<ListEntry> {
        ids.iter().map(|id| entry(id)).collect()
    }

    fn meta(id: &str, snapshot: &str, total: i64) -> PlaylistMeta {
        PlaylistMeta {
            id: id.to_string(),
            name: format!("List {id}"),
            snapshot_id: snapshot.to_string(),
            total,
        }
    }

    fn full(ids: &[&str]) -> LikedChange {
        LikedChange::Full { entries: entries(ids), total: ids.len() as i64 }
    }

    fn changes(liked: LikedChange, playlists: Vec<(PlaylistMeta, Option<Vec<ListEntry>>)>) -> SyncChanges {
        let mut refetched = HashMap::new();
        let mut metas = Vec::new();
        for (m, contents) in playlists {
            if let Some(contents) = contents {
                refetched.insert(m.id.clone(), contents);
            }
            metas.push(m);
        }
        SyncChanges { liked, playlists: metas, refetched, refused: Vec::new() }
    }

    /// The ids that would carry a dot: first seen later than the list's opening.
    fn new_ids(db: &Database, list_id: &str) -> Vec<String> {
        let dump = db.get_spotify_library().unwrap();
        let opened = dump
            .lists
            .iter()
            .find(|l| l.id == list_id)
            .expect("list stored")
            .last_opened_at;
        let mut ids: Vec<String> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == list_id && e.first_seen_at > opened)
            .map(|e| e.spotify_id.clone())
            .collect();
        ids.sort();
        ids
    }

    fn first_seen(db: &Database, list_id: &str, spotify_id: &str) -> i64 {
        db.conn
            .query_row(
                "SELECT first_seen_at FROM spotify_list_tracks WHERE list_id = ?1 AND spotify_id = ?2",
                params![list_id, spotify_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    /// Liked Songs [a, b] and playlist p1 [b, c], first synced at 1,000.
    fn baseline_db() -> Database {
        let db = fresh();
        db.apply_spotify_sync(
            &changes(full(&["a", "b"]), vec![(meta("p1", "s1", 2), Some(entries(&["b", "c"])))]),
            1_000,
        )
        .unwrap();
        db
    }

    #[test]
    fn a_lists_first_sync_is_the_baseline() {
        let db = baseline_db();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
        assert!(new_ids(&db, "p1").is_empty());
        let dump = db.get_spotify_library().unwrap();
        assert!(dump.lists.iter().all(|l| l.last_opened_at == 1_000));
        assert_eq!(dump.lists.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), [LIKED_LIST_ID, "p1"]);
        assert_eq!(dump.lists[0].name, LIKED_LIST_NAME);
    }

    #[test]
    fn a_like_right_after_the_baseline_is_new() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: entries(&["d"]), total: 3 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);
        assert!(new_ids(&db, "p1").is_empty());
    }

    #[test]
    fn new_follows_recodecks_first_sighting_not_spotifys_added_at() {
        // Liked at 09:00 on the phone, the list opened at 09:10, first synced at 09:30.
        let db = baseline_db();
        db.mark_spotify_list_opened(LIKED_LIST_ID, 1_500).unwrap();
        let mut liked_early = entry("d");
        liked_early.added_at = Some("2026-10-03T09:00:00Z".to_string());
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: vec![liked_early], total: 3 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);

        db.mark_spotify_list_opened(LIKED_LIST_ID, 2_500).unwrap();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
    }

    #[test]
    fn a_full_refetch_keeps_first_seen_at() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Full { entries: entries(&["c", "a"]), total: 2 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(first_seen(&db, LIKED_LIST_ID, "a"), 1_000);
        assert_eq!(first_seen(&db, LIKED_LIST_ID, "c"), 2_000);
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["c"]);
        let liked: Vec<String> = db
            .get_spotify_library()
            .unwrap()
            .entries
            .into_iter()
            .filter(|e| e.list_id == LIKED_LIST_ID)
            .map(|e| e.spotify_id)
            .collect();
        assert!(!liked.contains(&"b".to_string()), "an unliked track leaves Liked Songs");
    }

    #[test]
    fn opening_all_playlists_marks_every_list_seen() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: entries(&["d"]), total: 3 },
                vec![(meta("p1", "s2", 3), Some(entries(&["b", "c", "e"])))],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);
        assert_eq!(new_ids(&db, "p1"), ["e"]);

        db.mark_spotify_list_opened(ALL_LISTS_ID, 3_000).unwrap();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
        assert!(new_ids(&db, "p1").is_empty());
    }

    #[test]
    fn a_playlist_that_appears_later_starts_with_its_own_baseline() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 2), None), (meta("p2", "s9", 2), Some(entries(&["x", "y"])))],
            ),
            5_000,
        )
        .unwrap();
        assert!(new_ids(&db, "p2").is_empty());
    }

    #[test]
    fn a_playlist_spotify_no_longer_returns_goes_with_the_tracks_only_it_had() {
        let db = baseline_db();
        // A real library file, or reading the library would drop the verdict as stale.
        let file = db.create_track(&library_track("/music/c.mp3")).unwrap();
        db.set_spotify_verdict("c", file, "no").unwrap();
        db.apply_spotify_sync(&changes(LikedChange::Unchanged { total: 2 }, vec![]), 2_000)
            .unwrap();

        let dump = db.get_spotify_library().unwrap();
        assert_eq!(dump.lists.len(), 1);
        let mut ids: Vec<&str> = dump.tracks.iter().map(|t| t.spotify_id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["a", "b"], "c was only in p1");
        // Its verdict stays, so a re-like does not ask again.
        let kept: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM spotify_match_verdicts WHERE spotify_id = 'c'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1);
    }

    #[test]
    fn a_sync_says_whether_anything_changed() {
        let db = fresh();
        let first = changes(full(&["a"]), vec![(meta("p1", "s1", 1), Some(entries(&["b"])))]);
        assert!(db.apply_spotify_sync(&first, 1_000).unwrap());

        let same = changes(LikedChange::Unchanged { total: 1 }, vec![(meta("p1", "s1", 1), None)]);
        assert!(!db.apply_spotify_sync(&same, 2_000).unwrap());

        let renamed = changes(
            LikedChange::Unchanged { total: 1 },
            vec![(PlaylistMeta { name: "Renamed".to_string(), ..meta("p1", "s1", 1) }, None)],
        );
        assert!(db.apply_spotify_sync(&renamed, 3_000).unwrap());
    }

    #[test]
    fn the_baseline_is_what_the_last_sync_stored() {
        let db = fresh();
        assert_eq!(db.spotify_baseline().unwrap(), SyncBaseline::default());

        let mut first = changes(full(&["a", "b"]), vec![(meta("p1", "s1", 2), Some(entries(&["c"])))]);
        first.refused = vec![meta("p9", "s9", 50)];
        db.apply_spotify_sync(&first, 1_000).unwrap();

        let base = db.spotify_baseline().unwrap();
        assert_eq!(base.liked_total, Some(2));
        assert_eq!(base.liked_known, HashSet::from(["a".to_string(), "b".to_string()]));
        assert_eq!(base.snapshots, HashMap::from([("p1".to_string(), "s1".to_string())]));
        assert_eq!(base.refused, HashMap::from([("p9".to_string(), "s9".to_string())]));
        assert_eq!(db.spotify_refused().unwrap(), vec![meta("p9", "s9", 50)]);
    }

    // --- risky paths -------------------------------------------------------

    type Snapshot = (Vec<SpotifyListRow>, Vec<SpotifyTrack>, Vec<SpotifyEntryRow>);

    fn snapshot(db: &Database) -> Snapshot {
        let dump = db.get_spotify_library().unwrap();
        let mut tracks = dump.tracks;
        tracks.sort_by(|a, b| a.spotify_id.cmp(&b.spotify_id));
        let mut entries = dump.entries;
        entries.sort_by(|a, b| (&a.list_id, &a.spotify_id).cmp(&(&b.list_id, &b.spotify_id)));
        (dump.lists, tracks, entries)
    }

    fn ids_in(db: &Database, list_id: &str) -> Vec<String> {
        let mut ids: Vec<String> = db
            .get_spotify_library()
            .unwrap()
            .entries
            .into_iter()
            .filter(|e| e.list_id == list_id)
            .map(|e| e.spotify_id)
            .collect();
        ids.sort();
        ids
    }

    fn stored_snapshot(db: &Database, list_id: &str) -> Option<String> {
        db.conn
            .query_row("SELECT snapshot_id FROM spotify_lists WHERE id = ?1", [list_id], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn a_sync_that_fails_at_the_last_write_leaves_everything_as_it_was() {
        let db = baseline_db();
        let before = snapshot(&db);
        db.conn.execute_batch("DROP TABLE settings").unwrap();

        let result = db.apply_spotify_sync(
            &changes(
                full(&["d"]),
                vec![(meta("p2", "s2", 1), Some(entries(&["e"])))],
            ),
            2_000,
        );
        assert!(result.is_err());
        assert_eq!(snapshot(&db), before);
    }

    #[test]
    fn a_prepend_with_an_already_known_id_keeps_it_and_deletes_nothing() {
        let db = baseline_db();
        let changed = db
            .apply_spotify_sync(
                &changes(
                    LikedChange::Prepend { entries: entries(&["d", "a"]), total: 3 },
                    vec![(meta("p1", "s1", 2), None)],
                ),
                2_000,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(first_seen(&db, LIKED_LIST_ID, "a"), 1_000);
        assert_eq!(ids_in(&db, LIKED_LIST_ID), ["a", "b", "d"]);
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);
    }

    #[test]
    fn an_incremental_liked_change_with_no_stored_liked_songs_is_refused() {
        let db = fresh();
        for liked in [
            LikedChange::Unchanged { total: 2 },
            LikedChange::Prepend { entries: entries(&["a"]), total: 1 },
        ] {
            let result = db.apply_spotify_sync(
                &changes(liked, vec![(meta("p1", "s1", 1), Some(entries(&["b"])))]),
                1_000,
            );
            assert!(result.is_err());
            assert_eq!(count(&db, "spotify_lists"), 0);
        }
        // So the next baseline has no Liked total, and the fetch reads it all.
        assert_eq!(db.spotify_baseline().unwrap().liked_total, None);
    }

    #[test]
    fn a_playlist_listed_but_never_read_is_read_next_time_as_a_baseline() {
        let db = baseline_db();
        // p2 is listed but its contents are missing from the change set.
        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 2), None), (meta("p2", "s7", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(stored_snapshot(&db, "p2"), None);
        assert!(!db.spotify_baseline().unwrap().snapshots.contains_key("p2"));

        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 2), None), (meta("p2", "s7", 2), Some(entries(&["x", "y"])))],
            ),
            3_000,
        )
        .unwrap();
        assert_eq!(stored_snapshot(&db, "p2").as_deref(), Some("s7"));
        assert_eq!(ids_in(&db, "p2"), ["x", "y"]);
        assert!(new_ids(&db, "p2").is_empty(), "its first read is the baseline");
    }

    #[test]
    fn a_stored_playlist_not_read_keeps_the_snapshot_its_contents_came_from() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(LikedChange::Unchanged { total: 2 }, vec![(meta("p1", "s2", 2), None)]),
            2_000,
        )
        .unwrap();
        assert_eq!(stored_snapshot(&db, "p1").as_deref(), Some("s1"));
    }

    #[test]
    fn a_refetched_playlist_that_lost_a_track_loses_it_here() {
        let db = baseline_db();
        let changed = db
            .apply_spotify_sync(
                &changes(
                    LikedChange::Unchanged { total: 2 },
                    vec![(meta("p1", "s2", 1), Some(entries(&["b"])))],
                ),
                2_000,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(ids_in(&db, "p1"), ["b"]);
        assert_eq!(first_seen(&db, "p1", "b"), 1_000);
        // c was only in p1, so the track itself goes.
        assert!(!snapshot(&db).1.iter().any(|t| t.spotify_id == "c"));
    }

    #[test]
    fn a_full_refetch_refreshes_added_at_and_keeps_first_seen_at() {
        let db = baseline_db();
        let mut relike = entry("a");
        relike.added_at = Some("2026-10-03T12:00:00Z".to_string());
        let changed = db
            .apply_spotify_sync(
                &changes(
                    LikedChange::Full { entries: vec![relike, entry("b")], total: 2 },
                    vec![(meta("p1", "s1", 2), None)],
                ),
                2_000,
            )
            .unwrap();
        assert!(changed);
        let a = snapshot(&db)
            .2
            .into_iter()
            .find(|e| e.list_id == LIKED_LIST_ID && e.spotify_id == "a")
            .unwrap();
        assert_eq!(a.added_at.as_deref(), Some("2026-10-03T12:00:00Z"));
        assert_eq!(a.first_seen_at, 1_000);
    }

    #[test]
    fn a_change_of_position_count_or_track_details_is_a_change() {
        let db = fresh();
        let two = |a: PlaylistMeta, b: PlaylistMeta| {
            changes(LikedChange::Unchanged { total: 1 }, vec![(a, None), (b, None)])
        };
        db.apply_spotify_sync(
            &changes(
                full(&["a"]),
                vec![
                    (meta("p1", "s1", 1), Some(entries(&["b"]))),
                    (meta("p2", "s2", 1), Some(entries(&["c"]))),
                ],
            ),
            1_000,
        )
        .unwrap();
        assert!(!db.apply_spotify_sync(&two(meta("p1", "s1", 1), meta("p2", "s2", 1)), 2_000).unwrap());

        // Moved only.
        assert!(db.apply_spotify_sync(&two(meta("p2", "s2", 1), meta("p1", "s1", 1)), 3_000).unwrap());
        // Recounted only.
        assert!(db.apply_spotify_sync(&two(meta("p2", "s2", 5), meta("p1", "s1", 1)), 4_000).unwrap());

        // A track retitled, nothing else.
        let mut retitled = entry("a");
        retitled.track.title = "Come Get Up (Original Mix)".to_string();
        let same_lists = vec![(meta("p2", "s2", 5), None), (meta("p1", "s1", 1), None)];
        assert!(db
            .apply_spotify_sync(
                &changes(LikedChange::Full { entries: vec![retitled.clone()], total: 1 }, same_lists.clone()),
                5_000,
            )
            .unwrap());
        assert!(!db
            .apply_spotify_sync(
                &changes(LikedChange::Full { entries: vec![retitled], total: 1 }, same_lists),
                6_000,
            )
            .unwrap());
    }

    #[test]
    fn unfollowing_then_following_again_starts_a_fresh_baseline() {
        let db = baseline_db();
        db.apply_spotify_sync(&changes(LikedChange::Unchanged { total: 2 }, vec![]), 2_000)
            .unwrap();
        assert!(!db.spotify_baseline().unwrap().snapshots.contains_key("p1"));

        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 3), Some(entries(&["b", "c", "e"])))],
            ),
            3_000,
        )
        .unwrap();
        assert_eq!(ids_in(&db, "p1"), ["b", "c", "e"]);
        assert_eq!(first_seen(&db, "p1", "b"), 3_000);
        assert!(new_ids(&db, "p1").is_empty());
    }

    #[test]
    fn a_refused_playlist_shared_later_starts_with_its_own_baseline() {
        let db = baseline_db();
        let mut refused = changes(LikedChange::Unchanged { total: 2 }, vec![(meta("p1", "s1", 2), None)]);
        refused.refused = vec![meta("p9", "s9", 3)];
        db.apply_spotify_sync(&refused, 2_000).unwrap();
        assert!(snapshot(&db).0.iter().all(|l| l.id != "p9"));

        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 2), None), (meta("p9", "s10", 3), Some(entries(&["x", "y", "z"])))],
            ),
            3_000,
        )
        .unwrap();
        assert_eq!(ids_in(&db, "p9"), ["x", "y", "z"]);
        assert!(new_ids(&db, "p9").is_empty());
        assert!(db.spotify_refused().unwrap().is_empty());
    }
}
