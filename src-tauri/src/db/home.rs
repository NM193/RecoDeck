// src-tauri/src/db/home.rs
//! What Home's cards read that Search does not (Home cards spec, Data): the
//! upcoming gigs of the DJs with a page, the tracks without a BPM, the
//! playlist played from last, and the tracks per BPM range and per key. Local
//! data only; the queries Search shares live in `sections.rs`.

use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::Serialize;

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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
