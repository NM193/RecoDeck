// src-tauri/src/db/home.rs
//! What Home's cards read that Search does not (Home cards spec, Data): the
//! upcoming gigs of the DJs with a page, the tracks without a BPM, the
//! playlist played from last, the tracks per BPM range and per key, and the
//! sets watched DJs' searches found that have not been seen (with marking
//! them seen, and unseen again for an Undo). Local data only; the queries
//! Search shares live in `sections.rs`.

use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

/// A gig of a DJ with a page, for Your DJs play next and Needs you.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingGig {
    pub name_key: String,
    pub display_name: String,
    /// Resident Advisor's event id; with the name key, the row's key.
    pub event_id: String,
    /// "2026-10-12", the venue's local day.
    pub date: String,
    pub venue: Option<String>,
    pub city: Option<String>,
    /// ISO code.
    pub country: Option<String>,
}

/// The playlist played from most recently, for Last playlist.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastPlayedPlaylist {
    pub playlist_id: i64,
    pub name: String,
    /// That play's time, unix seconds.
    pub played_at: i64,
}

/// The tracks whose BPM is in a range, for one of BPM & key's bars. The
/// range is half-open, as the track table's filter is: `min <= bpm < max`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmRangeCount {
    /// None: no lower bound.
    pub min: Option<i64>,
    /// Exclusive; None: no upper bound.
    pub max: Option<i64>,
    pub count: i64,
}

/// The tracks with a key, as stored ("8A").
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCount {
    pub key: String,
    pub count: i64,
}

/// BPM & key: tracks per BPM range (every range, lowest first) and per key
/// (biggest first). Tracks without a BPM or a key are not counted.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmKeyCounts {
    pub bpm: Vec<BpmRangeCount>,
    pub keys: Vec<KeyCount>,
}

/// Where BPM & key's bars split: `< 115`, `115–119`, …, `130–134`, `135+`.
const BPM_EDGES: [i64; 5] = [115, 120, 125, 130, 135];

/// A set a watched DJ's search found that has not been seen, for New sets:
/// one per video, under the DJ whose search found it first.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDjFind {
    pub video_id: String,
    pub name_key: String,
    /// The DJ's name as watched ("Hot Since 82").
    pub display_name: String,
    pub title: String,
    pub channel: Option<String>,
    /// In the library (`yt_sets`): it opens at no cost; else opening it
    /// fetches it (5–7 units).
    pub saved: bool,
}

/// New sets: the newest unseen finds and how many videos are unseen in all.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDjFinds {
    pub total: i64,
    pub finds: Vec<NewDjFind>,
}

/// One find row: what Mark all seen changed, and what its Undo puts back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DjFindKey {
    pub name_key: String,
    pub video_id: String,
}

impl Database {
    /// The gigs on or after `today` ("2026-10-04", the user's local day, as
    /// the DJ page's `splitGigs` compares it) of every DJ with a page,
    /// soonest first; on one day, by the DJ's name.
    pub fn get_upcoming_gigs(&self, today: &str, limit: i64) -> Result<Vec<UpcomingGig>> {
        let mut stmt = self.conn.prepare(
            "SELECT g.name_key, p.display_name, g.ra_event_id, g.date, g.venue, g.city, g.country
             FROM dj_gigs g
             JOIN dj_profiles p ON p.name_key = g.name_key
             WHERE substr(g.date, 1, 10) >= ?1
             ORDER BY substr(g.date, 1, 10), p.display_name COLLATE NOCASE, g.name_key, g.ra_event_id
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![today, limit], |row| {
            Ok(UpcomingGig {
                name_key: row.get(0)?,
                display_name: row.get(1)?,
                event_id: row.get(2)?,
                date: row.get(3)?,
                venue: row.get(4)?,
                city: row.get(5)?,
                country: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    /// Every track with no BPM (no analysis row, or one without a BPM), by
    /// id: what Home's Analyze all analyzes, and its length is Not analyzed's
    /// number. `analyze_tracks_batch(ids, false)` skips only tracks with both
    /// a BPM and a key, so all of these are analyzed.
    pub fn get_track_ids_without_bpm(&self) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id FROM tracks t
             LEFT JOIN track_analysis a ON a.track_id = t.id
             WHERE a.bpm IS NULL
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect()
    }

    /// The newest play made from a playlist that still exists; None when
    /// there is none. A deleted playlist's id is given to the next one made
    /// (no AUTOINCREMENT) and its plays keep the id, so a play from before a
    /// playlist was made came from another one.
    pub fn get_last_played_playlist(&self) -> Result<Option<LastPlayedPlaylist>> {
        self.conn
            .query_row(
                "SELECT h.playlist_id, p.name, h.played_at FROM play_history h
                 JOIN playlists p ON p.id = h.playlist_id
                 WHERE p.created_at IS NULL
                    OR h.played_at >= CAST(strftime('%s', p.created_at) AS INTEGER)
                 ORDER BY h.played_at DESC, h.id DESC
                 LIMIT 1",
                [],
                |row| {
                    Ok(LastPlayedPlaylist {
                        playlist_id: row.get(0)?,
                        name: row.get(1)?,
                        played_at: row.get(2)?,
                    })
                },
            )
            .optional()
    }

    /// The tracks per BPM range and per key. A bar's count is what All
    /// Tracks shows with that range as its filter, which leaves out a BPM of
    /// 0 as it does.
    pub fn get_bpm_key_counts(&self) -> Result<BpmKeyCounts> {
        let mut bpm: Vec<BpmRangeCount> = (0..=BPM_EDGES.len())
            .map(|i| BpmRangeCount {
                min: i.checked_sub(1).map(|lower| BPM_EDGES[lower]),
                max: BPM_EDGES.get(i).copied(),
                count: 0,
            })
            .collect();
        let mut stmt = self.conn.prepare(
            "SELECT a.bpm FROM track_analysis a
             JOIN tracks t ON t.id = a.track_id
             WHERE a.bpm > 0",
        )?;
        for value in stmt.query_map([], |row| row.get::<_, f64>(0))? {
            let value = value?;
            let range = BPM_EDGES.iter().take_while(|&&edge| value >= edge as f64).count();
            bpm[range].count += 1;
        }

        let mut stmt = self.conn.prepare(
            "SELECT a.musical_key, COUNT(*) FROM track_analysis a
             JOIN tracks t ON t.id = a.track_id
             WHERE a.musical_key IS NOT NULL AND a.musical_key <> ''
             GROUP BY a.musical_key
             ORDER BY COUNT(*) DESC, a.musical_key",
        )?;
        let keys = stmt
            .query_map([], |row| {
                Ok(KeyCount {
                    key: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(BpmKeyCounts { bpm, keys })
    }

    /// The videos none of whose finds is seen, newest first, at most `limit`,
    /// and how many there are in all. A video found by two DJs' searches is
    /// one, under the DJ whose find came first (on the same second, the lowest
    /// name key: one check stamps its rows alike); newest first is by that
    /// find, then by when the video was published.
    pub fn get_new_dj_finds(&self, limit: i64) -> Result<NewDjFinds> {
        const UNSEEN: &str = "SELECT video_id FROM yt_dj_finds GROUP BY video_id HAVING COUNT(seen_at) = 0";
        let total = self
            .conn
            .query_row(&format!("SELECT COUNT(*) FROM ({UNSEEN})"), [], |row| row.get(0))?;
        let mut stmt = self.conn.prepare(&format!(
            "WITH firsts AS (
                 SELECT f.*, ROW_NUMBER() OVER (
                     PARTITION BY f.video_id ORDER BY f.first_seen_at, f.name_key
                 ) AS n
                 FROM yt_dj_finds f
                 WHERE f.video_id IN ({UNSEEN})
             )
             SELECT f.video_id, f.name_key, COALESCE(w.display_name, f.name_key), f.title, f.channel,
                    EXISTS (SELECT 1 FROM yt_sets s WHERE s.video_id = f.video_id)
             FROM firsts f
             LEFT JOIN yt_watched_djs w ON w.name_key = f.name_key
             WHERE f.n = 1
             ORDER BY f.first_seen_at DESC, f.published_at DESC, f.video_id
             LIMIT ?1"
        ))?;
        let finds = stmt
            .query_map([limit], |row| {
                Ok(NewDjFind {
                    video_id: row.get(0)?,
                    name_key: row.get(1)?,
                    display_name: row.get(2)?,
                    title: row.get(3)?,
                    channel: row.get(4)?,
                    saved: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(NewDjFinds { total, finds })
    }

    /// Every find of these videos is seen from now on: their sets were opened.
    pub fn mark_dj_finds_seen(&self, video_ids: &[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for video_id in video_ids {
            tx.execute(
                "UPDATE yt_dj_finds SET seen_at = datetime('now') WHERE video_id = ?1 AND seen_at IS NULL",
                [video_id],
            )?;
        }
        tx.commit()
    }

    /// Mark all seen: every unseen find is seen. Answers the rows it changed,
    /// so an Undo marks exactly those unseen again.
    pub fn mark_all_dj_finds_seen(&self) -> Result<Vec<DjFindKey>> {
        let tx = self.conn.unchecked_transaction()?;
        let changed = tx
            .prepare(
                "UPDATE yt_dj_finds SET seen_at = datetime('now') WHERE seen_at IS NULL
                 RETURNING name_key, video_id",
            )?
            .query_map([], |row| {
                Ok(DjFindKey {
                    name_key: row.get(0)?,
                    video_id: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        tx.commit()?;
        Ok(changed)
    }

    /// Mark all seen's Undo: these rows are unseen again; no other is touched.
    pub fn mark_dj_finds_unseen(&self, rows: &[DjFindKey]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for row in rows {
            tx.execute(
                "UPDATE yt_dj_finds SET seen_at = NULL WHERE name_key = ?1 AND video_id = ?2",
                params![row.name_key, row.video_id],
            )?;
        }
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::YtDjFind;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn track(db: &Database, title: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title) VALUES (?1, ?1, ?2)",
                params![format!("/m/{title}.mp3"), title],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    #[test]
    fn upcoming_gigs_are_from_today_on_soonest_first_across_djs_with_a_page() {
        let db = db();
        db.conn
            .execute_batch(
                "INSERT INTO dj_profiles (name_key, display_name) VALUES
                     ('traumer', 'Traumer'), ('hot since 82', 'Hot Since 82');
                 INSERT INTO dj_gigs (name_key, ra_event_id, date, venue, city, country) VALUES
                     ('traumer', 'e1', '2026-10-03', 'Yesterday Club', 'Paris', 'FR'),
                     ('traumer', 'e2', '2026-10-06', 'Hï Ibiza', 'Ibiza', 'ES'),
                     ('hot since 82', 'h2', '2026-10-11', 'Seaseaclub', 'Barcelona', 'ES'),
                     ('hot since 82', 'h1', '2026-10-04', 'Ushuaïa', 'Ibiza', 'ES'),
                     ('traumer', 'e3', '2026-10-04T23:00:00', 'Late Club', NULL, NULL),
                     ('nobody', 'n1', '2026-10-05', 'No Page', NULL, NULL);",
            )
            .unwrap();

        let gigs = db.get_upcoming_gigs("2026-10-04", 20).unwrap();

        let order: Vec<_> = gigs.iter().map(|g| (g.display_name.as_str(), g.event_id.as_str())).collect();
        assert_eq!(
            order,
            vec![("Hot Since 82", "h1"), ("Traumer", "e3"), ("Traumer", "e2"), ("Hot Since 82", "h2")]
        );
        assert_eq!(
            gigs[2],
            UpcomingGig {
                name_key: "traumer".into(),
                display_name: "Traumer".into(),
                event_id: "e2".into(),
                date: "2026-10-06".into(),
                venue: Some("Hï Ibiza".into()),
                city: Some("Ibiza".into()),
                country: Some("ES".into()),
            }
        );
        assert_eq!(db.get_upcoming_gigs("2026-10-04", 1).unwrap().len(), 1);
    }

    #[test]
    fn track_ids_without_bpm_are_those_with_no_analysis_or_no_bpm() {
        let db = db();
        let none = track(&db, "none");
        let key_only = track(&db, "key only");
        let bpm = track(&db, "bpm");
        let both = track(&db, "both");
        db.save_key_analysis(key_only, "8A", 0.8).unwrap();
        db.save_bpm_analysis(bpm, 126.0, 0.9).unwrap();
        db.save_bpm_analysis(both, 124.0, 0.9).unwrap();
        db.save_key_analysis(both, "5A", 0.8).unwrap();

        assert_eq!(db.get_track_ids_without_bpm().unwrap(), vec![none, key_only]);
    }

    #[test]
    fn the_last_played_playlist_is_the_newest_play_from_a_playlist_that_still_exists() {
        let db = db();
        let song = track(&db, "song");
        assert_eq!(db.get_last_played_playlist().unwrap(), None);

        // Oct 2–6, 20:00 UTC. Playlist 3 was made on Oct 8 with the id of a
        // deleted one, played from on Oct 6; 99 was deleted.
        db.conn
            .execute_batch(&format!(
                "INSERT INTO playlists (id, name, created_at) VALUES
                     (1, 'Warm up', '2026-10-01 10:00:00'),
                     (2, 'Peak', '2026-10-01 10:00:00'),
                     (3, 'Friday', '2026-10-08 12:00:00');
                 INSERT INTO play_history (track_id, playlist_id, played_at) VALUES
                     ({song}, 1, 1790971200),
                     ({song}, 2, 1791057600),
                     ({song}, 99, 1791144000),
                     ({song}, NULL, 1791230400),
                     ({song}, 3, 1791316800);"
            ))
            .unwrap();

        assert_eq!(
            db.get_last_played_playlist().unwrap(),
            Some(LastPlayedPlaylist {
                playlist_id: 2,
                name: "Peak".into(),
                played_at: 1791057600
            })
        );

        // Played from after it was made, it is the last one.
        db.conn
            .execute(
                "INSERT INTO play_history (track_id, playlist_id, played_at) VALUES (?1, 3, 1791489600)",
                [song],
            )
            .unwrap();
        assert_eq!(db.get_last_played_playlist().unwrap().map(|last| last.playlist_id), Some(3));
    }

    #[test]
    fn bpm_ranges_are_half_open_and_tracks_without_a_bpm_are_left_out() {
        let db = db();
        for (title, bpm) in [
            ("a", 114.9),
            ("b", 115.0),
            ("c", 119.9),
            ("d", 120.0),
            ("e", 127.5),
            ("f", 134.99),
            ("g", 135.0),
            ("h", 174.0),
            ("zero", 0.0),
        ] {
            let id = track(&db, title);
            db.save_bpm_analysis(id, bpm, 0.9).unwrap();
        }
        let key_only = track(&db, "key only");
        db.save_key_analysis(key_only, "8A", 0.8).unwrap();
        track(&db, "nothing");

        let counts = db.get_bpm_key_counts().unwrap();

        let bars: Vec<_> = counts.bpm.iter().map(|r| (r.min, r.max, r.count)).collect();
        assert_eq!(
            bars,
            vec![
                (None, Some(115), 1),
                (Some(115), Some(120), 2),
                (Some(120), Some(125), 1),
                (Some(125), Some(130), 1),
                (Some(130), Some(135), 1),
                (Some(135), None, 2),
            ]
        );
    }

    #[test]
    fn key_counts_are_per_key_as_stored_biggest_first() {
        let db = db();
        for (title, key) in [("a", "8A"), ("b", "5A"), ("c", "8A"), ("d", "11B"), ("e", "5A"), ("f", "8A"), ("g", "")] {
            let id = track(&db, title);
            db.save_key_analysis(id, key, 0.8).unwrap();
        }
        track(&db, "no key");

        let keys: Vec<_> = db
            .get_bpm_key_counts()
            .unwrap()
            .keys
            .into_iter()
            .map(|k| (k.key, k.count))
            .collect();
        assert_eq!(keys, vec![("8A".to_string(), 3), ("5A".to_string(), 2), ("11B".to_string(), 1)]);
    }

    /// Finds as a search writes them, with their times given: (name key,
    /// video, title, channel, published, first seen, seen).
    fn finds(db: &Database, rows: &[(&str, &str, &str, Option<&str>, &str, &str, Option<&str>)]) {
        for (name_key, video_id, title, channel, published_at, first_seen_at, seen_at) in rows {
            db.conn
                .execute(
                    "INSERT INTO yt_dj_finds (name_key, video_id, title, channel, published_at, first_seen_at, seen_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![name_key, video_id, title, channel, published_at, first_seen_at, seen_at],
                )
                .unwrap();
        }
    }

    fn store_set(db: &Database, video_id: &str) {
        db.conn
            .execute(
                "INSERT INTO yt_sets (video_id, url, title, raw_json) VALUES (?1, ?1, ?1, '{}')",
                [video_id],
            )
            .unwrap();
    }

    fn new_videos(db: &Database) -> Vec<String> {
        db.get_new_dj_finds(20).unwrap().finds.into_iter().map(|f| f.video_id).collect()
    }

    fn seen_at(db: &Database, name_key: &str, video_id: &str) -> Option<String> {
        db.conn
            .query_row(
                "SELECT seen_at FROM yt_dj_finds WHERE name_key = ?1 AND video_id = ?2",
                [name_key, video_id],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn new_sets_are_the_unseen_videos_once_each_under_their_first_finder_newest_first() {
        let db = db();
        db.conn
            .execute_batch(
                "INSERT INTO yt_watched_djs (name_key, display_name) VALUES
                     ('hot since 82', 'Hot Since 82'), ('traumer', 'Traumer'), ('solomun', 'Solomun');",
            )
            .unwrap();
        finds(
            &db,
            &[
                // v1: Traumer's search found it a day before Hot Since 82's.
                ("traumer", "v1", "Traumer b2b Hot Since 82", Some("Cercle"), "2026-10-01T18:00:00Z", "2026-10-02 08:00:00", None),
                ("hot since 82", "v1", "Traumer b2b Hot Since 82", Some("Cercle"), "2026-10-01T18:00:00Z", "2026-10-03 08:00:00", None),
                // v2: found in the same second by two searches: the lowest name key.
                ("solomun", "v2", "Solomun b2b Hot Since 82", Some("Boiler Room"), "2026-10-04T20:00:00Z", "2026-10-05 09:00:00", None),
                ("hot since 82", "v2", "Solomun b2b Hot Since 82", Some("Boiler Room"), "2026-10-04T20:00:00Z", "2026-10-05 09:00:00", None),
                // v3 is seen; v5 has one seen find, so it is not news either.
                ("solomun", "v3", "Solomun Tulum", Some("Solomun"), "2026-10-03T12:00:00Z", "2026-10-04 13:00:00", Some("2026-10-04 14:00:00")),
                ("traumer", "v5", "Traumer at Hï", None, "2026-09-30T12:00:00Z", "2026-10-01 00:00:00", None),
                ("solomun", "v5", "Traumer at Hï", None, "2026-09-30T12:00:00Z", "2026-10-01 00:00:00", Some("2026-10-01 10:00:00")),
                // v4 was imported automatically: saved, and still news.
                ("traumer", "v4", "Traumer live", None, "2026-10-05T22:00:00Z", "2026-10-06 07:00:00", None),
            ],
        );
        store_set(&db, "v4");

        let news = db.get_new_dj_finds(20).unwrap();

        assert_eq!(news.total, 3);
        assert_eq!(new_videos(&db), vec!["v4", "v2", "v1"]);
        assert_eq!(
            news.finds[1],
            NewDjFind {
                video_id: "v2".into(),
                name_key: "hot since 82".into(),
                display_name: "Hot Since 82".into(),
                title: "Solomun b2b Hot Since 82".into(),
                channel: Some("Boiler Room".into()),
                saved: false,
            }
        );
        assert_eq!((news.finds[2].name_key.as_str(), news.finds[2].display_name.as_str()), ("traumer", "Traumer"));
        assert!(news.finds[0].saved);

        let first_two = db.get_new_dj_finds(2).unwrap();
        assert_eq!((first_two.total, first_two.finds.len()), (3, 2));
    }

    #[test]
    fn a_find_is_written_seen_and_not_news_when_its_set_is_stored_or_another_find_of_it_is_seen() {
        let db = db();
        let find = |name_key: &str, video_id: &str| YtDjFind {
            name_key: name_key.into(),
            video_id: video_id.into(),
            title: format!("{video_id} set"),
            channel: None,
            published_at: Some("2026-10-07T20:00:00Z".into()),
        };
        store_set(&db, "stored");

        assert!(!db.record_yt_dj_find(&find("traumer", "stored")).unwrap(), "in the library: not news");
        assert!(seen_at(&db, "traumer", "stored").is_some());
        assert!(db.record_yt_dj_find(&find("traumer", "b2b")).unwrap());
        assert_eq!(new_videos(&db), vec!["b2b"]);

        // Its set opened, a second DJ's search finds it later: not news again.
        db.mark_dj_finds_seen(&["b2b".to_string()]).unwrap();
        assert!(!db.record_yt_dj_find(&find("solomun", "b2b")).unwrap());
        assert!(seen_at(&db, "solomun", "b2b").is_some());
        assert!(db.record_yt_dj_find(&find("traumer", "fresh")).unwrap());
        assert_eq!(new_videos(&db), vec!["fresh"]);
        // Found again, it is no first sighting and stays as it was.
        assert!(!db.record_yt_dj_find(&find("traumer", "fresh")).unwrap());
        assert!(seen_at(&db, "traumer", "fresh").is_none());
    }

    #[test]
    fn opening_a_set_marks_every_find_of_its_video_seen_and_no_other() {
        let db = db();
        finds(
            &db,
            &[
                ("traumer", "v1", "v1", None, "2026-10-01T18:00:00Z", "2026-10-02 08:00:00", None),
                ("hot since 82", "v1", "v1", None, "2026-10-01T18:00:00Z", "2026-10-03 08:00:00", None),
                ("traumer", "v2", "v2", None, "2026-10-02T18:00:00Z", "2026-10-03 08:00:00", None),
            ],
        );

        db.mark_dj_finds_seen(&["v1".to_string(), "not found".to_string()]).unwrap();

        assert!(seen_at(&db, "traumer", "v1").is_some());
        assert!(seen_at(&db, "hot since 82", "v1").is_some());
        assert_eq!(new_videos(&db), vec!["v2"]);
    }

    #[test]
    fn mark_all_seen_answers_the_rows_it_changed_and_its_undo_puts_back_only_those() {
        let db = db();
        finds(
            &db,
            &[
                ("traumer", "v1", "v1", None, "2026-10-01T18:00:00Z", "2026-10-02 08:00:00", None),
                ("hot since 82", "v1", "v1", None, "2026-10-01T18:00:00Z", "2026-10-03 08:00:00", None),
                ("traumer", "v2", "v2", None, "2026-10-02T18:00:00Z", "2026-10-03 08:00:00", None),
                ("solomun", "v3", "v3", None, "2026-09-30T18:00:00Z", "2026-10-01 08:00:00", Some("2026-10-01 10:00:00")),
            ],
        );
        let key = |name_key: &str, video_id: &str| DjFindKey {
            name_key: name_key.into(),
            video_id: video_id.into(),
        };

        let mut changed = db.mark_all_dj_finds_seen().unwrap();
        changed.sort_by(|a, b| (&a.video_id, &a.name_key).cmp(&(&b.video_id, &b.name_key)));

        assert_eq!(changed, vec![key("hot since 82", "v1"), key("traumer", "v1"), key("traumer", "v2")]);
        assert_eq!(db.get_new_dj_finds(20).unwrap().total, 0);
        assert!(db.mark_all_dj_finds_seen().unwrap().is_empty());

        db.mark_dj_finds_unseen(&changed).unwrap();

        assert_eq!(new_videos(&db), vec!["v2", "v1"]);
        assert_eq!(seen_at(&db, "solomun", "v3").as_deref(), Some("2026-10-01 10:00:00"));
    }

    #[test]
    fn migration_018_marks_every_find_stored_before_it_seen_once() {
        let db = db();
        // As before migration 018: no seen_at, two finds stored.
        db.conn.execute_batch("ALTER TABLE yt_dj_finds DROP COLUMN seen_at;").unwrap();
        db.conn
            .execute_batch(
                "INSERT INTO yt_dj_finds (name_key, video_id, title) VALUES
                     ('traumer', 'old1', 'Old one'), ('solomun', 'old2', 'Old two');",
            )
            .unwrap();

        db.run_migrations().unwrap();

        assert!(seen_at(&db, "traumer", "old1").is_some());
        assert!(seen_at(&db, "solomun", "old2").is_some());
        assert_eq!(db.get_new_dj_finds(20).unwrap().total, 0);

        // The next start leaves a new find unseen.
        db.conn
            .execute("INSERT INTO yt_dj_finds (name_key, video_id, title) VALUES ('traumer', 'new', 'New')", [])
            .unwrap();
        db.run_migrations().unwrap();
        assert_eq!(new_videos(&db), vec!["new"]);
    }
}
