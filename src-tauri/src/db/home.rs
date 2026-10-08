// src-tauri/src/db/home.rs
//! What Home's cards read that Search does not (Home cards spec, Data): the
//! upcoming gigs of the DJs with a page, and the tracks without a BPM. Local
//! data only; the queries Search shares live in `sections.rs`.

use super::Database;
use rusqlite::{params, Result};
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
}
