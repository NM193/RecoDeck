// src-tauri/src/db/sections.rs
//! What the Search page shows before you type (Search spec, Sections), shared
//! with Home: the tracks played and added lately as full rows, the DJs the
//! user knows, and the library's biggest genres. Local data only.

use super::{Database, Track, TrackWithAnalysis};
use rusqlite::{params, Result, Row};
use serde::Serialize;

/// The columns `track_with_analysis` reads, from `tracks t` and `track_analysis a`.
const TRACK_COLUMNS: &str = "t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence";

/// A track and its analysis, from a row that starts with `TRACK_COLUMNS`.
fn track_with_analysis(row: &Row) -> Result<TrackWithAnalysis> {
    let track = Track {
        id: row.get(0)?,
        file_path: row.get(1)?,
        file_hash: row.get(2)?,
        title: row.get(3)?,
        artist: row.get(4)?,
        album: row.get(5)?,
        album_artist: row.get(6)?,
        track_number: row.get(7)?,
        year: row.get(8)?,
        label: row.get(9)?,
        duration_ms: row.get(10)?,
        file_format: row.get(11)?,
        bitrate: row.get(12)?,
        sample_rate: row.get(13)?,
        file_size: row.get(14)?,
        date_added: row.get(15)?,
        date_modified: row.get(16)?,
        play_count: row.get(17)?,
        rating: row.get(18)?,
        comment: row.get(19)?,
        artwork_path: row.get(20)?,
        genre: row.get(21)?,
        genre_source: row.get(22)?,
    };
    Ok((track, row.get(23)?, row.get(24)?, row.get(25)?, row.get(26)?))
}

/// A DJ the user knows: one with a DJ page, or one watched for sets.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownDj {
    pub name_key: String,
    pub display_name: String,
    /// The Spotify photo, else Resident Advisor's.
    pub image_url: Option<String>,
    /// The first gig on or after the day asked about.
    pub next_gig: Option<NextGig>,
    pub watched: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NextGig {
    /// "2026-10-12", the venue's local day.
    pub date: String,
    pub venue: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GenreCount {
    pub genre: String,
    pub count: i64,
}

/// The library at a glance, for the genre tiles.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroups {
    /// The biggest genres, biggest first (at most 6).
    pub genres: Vec<GenreCount>,
    /// Tracks added in the last 30 days.
    pub added_recently: i64,
    /// Tracks with no play in the history.
    pub never_played: i64,
}

impl Database {
    /// The tracks played lately, each once, by its latest play (newest
    /// first), with that play's time (unix seconds). Tracks whose file was
    /// removed from the library drop out.
    pub fn get_recently_played_tracks(&self, limit: i64) -> Result<Vec<(TrackWithAnalysis, i64)>> {
        let sql = format!(
            "SELECT {TRACK_COLUMNS}, p.last_played
             FROM (SELECT track_id, MAX(played_at) AS last_played
                   FROM play_history WHERE track_id IS NOT NULL
                   GROUP BY track_id) p
             JOIN tracks t ON t.id = p.track_id
             LEFT JOIN track_analysis a ON a.track_id = t.id
             ORDER BY p.last_played DESC, t.id DESC
             LIMIT ?1"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![limit], |row| Ok((track_with_analysis(row)?, row.get(27)?)))?;
        rows.collect()
    }

    /// The tracks added lately, newest first.
    pub fn get_recently_added_tracks(&self, limit: i64) -> Result<Vec<TrackWithAnalysis>> {
        let sql = format!(
            "SELECT {TRACK_COLUMNS}
             FROM tracks t
             LEFT JOIN track_analysis a ON a.track_id = t.id
             ORDER BY t.date_added DESC, t.id DESC
             LIMIT ?1"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![limit], track_with_analysis)?;
        rows.collect()
    }

    /// Every DJ with a DJ page or watched for sets, once per name key, by
    /// name. `today` ("2026-10-04", the user's local day) picks the next gig.
    pub fn get_known_djs(&self, today: &str) -> Result<Vec<KnownDj>> {
        let mut stmt = self.conn.prepare(
            "SELECT k.name_key,
                    COALESCE(p.display_name, w.display_name),
                    COALESCE(p.spotify_image_url, p.ra_image_url),
                    w.name_key IS NOT NULL,
                    g.date, g.venue
             FROM (SELECT name_key FROM dj_profiles
                   UNION SELECT name_key FROM yt_watched_djs) k
             LEFT JOIN dj_profiles p ON p.name_key = k.name_key
             LEFT JOIN yt_watched_djs w ON w.name_key = k.name_key
             LEFT JOIN dj_gigs g ON g.rowid = (
                 SELECT rowid FROM dj_gigs
                 WHERE name_key = k.name_key AND date >= ?1
                 ORDER BY date, ra_event_id LIMIT 1)
             ORDER BY COALESCE(p.display_name, w.display_name) COLLATE NOCASE, k.name_key",
        )?;
        let rows = stmt.query_map([today], |row| {
            let date: Option<String> = row.get(4)?;
            let venue: Option<String> = row.get(5)?;
            Ok(KnownDj {
                name_key: row.get(0)?,
                display_name: row.get(1)?,
                image_url: row.get(2)?,
                watched: row.get(3)?,
                next_gig: date.map(|date| NextGig { date, venue }),
            })
        })?;
        rows.collect()
    }

    /// The 6 biggest genres with their counts, how many tracks were added in
    /// the last 30 days (`date_added` is UTC, as `datetime('now')` writes it),
    /// and how many were never played. `tracks.play_count` is not kept up to
    /// date, so "never played" means no row in the play history.
    pub fn get_library_groups(&self) -> Result<LibraryGroups> {
        let mut stmt = self.conn.prepare(
            "SELECT genre, COUNT(*) FROM tracks
             WHERE genre IS NOT NULL AND TRIM(genre) <> ''
             GROUP BY genre
             ORDER BY COUNT(*) DESC, genre
             LIMIT 6",
        )?;
        let genres = stmt
            .query_map([], |row| Ok(GenreCount { genre: row.get(0)?, count: row.get(1)? }))?
            .collect::<Result<Vec<_>>>()?;
        let added_recently = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE date_added >= datetime('now', '-30 days')",
            [],
            |row| row.get(0),
        )?;
        // NOT IN, not a correlated NOT EXISTS: play_history has no index on
        // track_id, so that would scan the history once per track. The
        // IS NOT NULL keeps a NULL from making NOT IN match nothing.
        let never_played = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks
             WHERE id NOT IN (SELECT track_id FROM play_history WHERE track_id IS NOT NULL)",
            [],
            |row| row.get(0),
        )?;
        Ok(LibraryGroups { genres, added_recently, never_played })
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

    // A track with a title, a genre and a `date_added` written in SQL (e.g.
    // "datetime('now', '-3 days')").
    fn track(db: &Database, title: &str, genre: Option<&str>, added: &str) -> i64 {
        db.conn
            .execute(
                &format!(
                    "INSERT INTO tracks (file_path, file_hash, title, genre, date_added)
                     VALUES (?1, ?1, ?2, ?3, {added})"
                ),
                params![format!("/m/{title}.mp3"), title, genre],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn play(db: &Database, track_id: i64, at: i64) {
        db.conn
            .execute("INSERT INTO play_history (track_id, played_at) VALUES (?1, ?2)", params![track_id, at])
            .unwrap();
    }

    fn titles(tracks: &[TrackWithAnalysis]) -> Vec<String> {
        tracks.iter().map(|(t, ..)| t.title.clone().unwrap()).collect()
    }

    #[test]
    fn recently_played_is_each_track_once_by_its_latest_play_with_its_analysis() {
        let db = db();
        let a = track(&db, "A", None, "datetime('now')");
        let b = track(&db, "B", None, "datetime('now')");
        let c = track(&db, "C", None, "datetime('now')");
        db.save_bpm_analysis(a, 126.0, 0.9).unwrap();
        play(&db, a, 100);
        play(&db, b, 200);
        play(&db, a, 300);
        play(&db, c, 50);

        let played = db.get_recently_played_tracks(10).unwrap();

        let order: Vec<_> = played.iter().map(|((t, ..), at)| (t.title.clone().unwrap(), *at)).collect();
        assert_eq!(order, vec![("A".into(), 300), ("B".into(), 200), ("C".into(), 50)]);
        assert_eq!(played[0].0 .1, Some(126.0));
        assert_eq!(db.get_recently_played_tracks(2).unwrap().len(), 2);
    }

    #[test]
    fn recently_played_leaves_out_a_track_removed_from_the_library() {
        let db = db();
        let a = track(&db, "A", None, "datetime('now')");
        let gone = track(&db, "Gone", None, "datetime('now')");
        play(&db, a, 100);
        play(&db, gone, 200);
        // The history keeps the row (as an import that bypassed the cascade would).
        db.conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        db.conn.execute("DELETE FROM tracks WHERE id = ?1", [gone]).unwrap();

        let played = db.get_recently_played_tracks(10).unwrap();

        assert_eq!(played.len(), 1);
        assert_eq!(played[0].0 .0.title.as_deref(), Some("A"));
    }

    #[test]
    fn recently_added_is_newest_first_with_its_analysis() {
        let db = db();
        let old = track(&db, "Old", None, "datetime('now', '-40 days')");
        track(&db, "New", None, "datetime('now')");
        track(&db, "Mid", None, "datetime('now', '-2 days')");
        db.save_key_analysis(old, "8A", 0.8).unwrap();

        let added = db.get_recently_added_tracks(10).unwrap();

        assert_eq!(titles(&added), vec!["New", "Mid", "Old"]);
        assert_eq!(added[2].3.as_deref(), Some("8A"));
        assert_eq!(titles(&db.get_recently_added_tracks(1).unwrap()), vec!["New"]);
    }

    #[test]
    fn library_groups_count_the_biggest_genres_the_added_lately_and_the_never_played() {
        let db = db();
        for (i, genre) in ["Tech House", "Tech House", "Tech House", "House", "House", "Afro"].iter().enumerate() {
            track(&db, &format!("t{i}"), Some(genre), "datetime('now', '-60 days')");
        }
        track(&db, "no genre", None, "datetime('now', '-60 days')");
        track(&db, "empty genre", Some(" "), "datetime('now', '-60 days')");
        let fresh = track(&db, "fresh", Some("House"), "datetime('now', '-29 days')");
        track(&db, "just over", None, "datetime('now', '-31 days')");
        play(&db, fresh, 100);
        play(&db, fresh, 200);

        let groups = db.get_library_groups().unwrap();

        let counts: Vec<_> = groups.genres.iter().map(|g| (g.genre.as_str(), g.count)).collect();
        assert_eq!(counts, vec![("House", 3), ("Tech House", 3), ("Afro", 1)]);
        assert_eq!(groups.added_recently, 1);
        assert_eq!(groups.never_played, 9);
    }

    #[test]
    fn library_groups_keep_six_genres() {
        let db = db();
        for i in 0..8 {
            for j in 0..=i {
                track(&db, &format!("g{i}-{j}"), Some(&format!("Genre {i}")), "datetime('now')");
            }
        }
        let genres = db.get_library_groups().unwrap().genres;
        assert_eq!(genres.len(), 6);
        assert_eq!(genres[0], GenreCount { genre: "Genre 7".into(), count: 8 });
    }

    #[test]
    fn known_djs_merge_pages_and_watched_by_name_key_with_the_next_gig_from_today() {
        let db = db();
        db.conn
            .execute_batch(
                "INSERT INTO dj_profiles (name_key, display_name, spotify_image_url, ra_image_url)
                     VALUES ('traumer', 'Traumer', 'https://spotify/t.jpg', 'https://ra/t.jpg'),
                            ('ben rau', 'Ben Rau', NULL, 'https://ra/b.jpg'),
                            ('amy', 'Amy', NULL, NULL);
                 INSERT INTO yt_watched_djs (name_key, display_name) VALUES
                     ('traumer', 'traumer'), ('hot since 82', 'Hot Since 82');
                 INSERT INTO dj_gigs (name_key, ra_event_id, date, venue) VALUES
                     ('traumer', 'e1', '2026-10-03', 'Yesterday Club'),
                     ('traumer', 'e3', '2026-10-12', 'The Nest'),
                     ('traumer', 'e2', '2026-10-04', 'Depot Mayfield'),
                     ('amy', 'e9', '2026-09-01', 'Long Ago');",
            )
            .unwrap();

        let djs = db.get_known_djs("2026-10-04").unwrap();

        let names: Vec<_> = djs.iter().map(|d| d.display_name.as_str()).collect();
        assert_eq!(names, vec!["Amy", "Ben Rau", "Hot Since 82", "Traumer"]);
        let traumer = &djs[3];
        assert_eq!(traumer.name_key, "traumer");
        assert_eq!(traumer.image_url.as_deref(), Some("https://spotify/t.jpg"));
        assert!(traumer.watched);
        assert_eq!(
            traumer.next_gig,
            Some(NextGig { date: "2026-10-04".into(), venue: Some("Depot Mayfield".into()) })
        );
        assert_eq!(djs[1].image_url.as_deref(), Some("https://ra/b.jpg"));
        assert!(!djs[1].watched);
        assert_eq!(djs[0].next_gig, None);
        assert!(djs[2].watched);
        assert_eq!(djs[2].image_url, None);
    }
}
