// src-tauri/src/db/dj.rs
//! Storage for DJ pages: which Spotify and Resident Advisor artist a DJ name
//! means, the releases and tracks found on Spotify, and the gigs found on RA.
//!
//! Two rules keep a big discography cheap, and both live here:
//! - A release is recorded once and its tracks are read once. Releases never
//!   change, so a refresh only reads the ones Spotify lists that are not
//!   recorded yet.
//! - A batch of tracks and the "fetched" mark on its releases are written in
//!   one transaction. An interrupted fetch keeps every finished batch and
//!   continues from the releases still marked unfetched.

use super::Database;
use rusqlite::{params, params_from_iter, OptionalExtension, Result, Transaction, TransactionBehavior};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// How many of the newest appears-on / compilation releases a first fetch
/// reads, and how many more each "Load older releases" adds.
pub const APPEARS_STEP: i64 = 150;
/// Spotify data older than this is refreshed when the page opens.
pub const SPOTIFY_MAX_AGE_MS: i64 = 7 * 24 * 60 * 60 * 1000;
/// Gigs older than this are refreshed when the page opens.
pub const RA_MAX_AGE_MS: i64 = 24 * 60 * 60 * 1000;

/// A `dj_profiles` row.
#[derive(Debug, Clone, PartialEq)]
pub struct DjProfileRow {
    pub name_key: String,
    pub display_name: String,
    pub spotify_artist_id: Option<String>,
    pub spotify_manual: bool,
    pub spotify_image_url: Option<String>,
    pub genres: Vec<String>,
    pub ra_artist_id: Option<String>,
    pub ra_slug: Option<String>,
    pub ra_image_url: Option<String>,
    pub ra_manual: bool,
    pub spotify_synced_at: Option<i64>,
    pub ra_synced_at: Option<i64>,
    pub appears_limit: i64,
    pub appears_total: Option<i64>,
}

/// A Resident Advisor artist, as a profile stores it.
#[derive(Debug, Clone, PartialEq)]
pub struct DjRaArtist {
    pub id: String,
    /// The `ra.co/dj/<slug>` part.
    pub slug: String,
    pub image_url: Option<String>,
}

/// A release of the artist, as Spotify lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct DjRelease {
    pub id: String,
    pub name: String,
    /// "2024-03-01", "2024-03" or "2024" — Spotify's precision.
    pub release_date: Option<String>,
}

/// A track the DJ is credited on. Reads the same as `DjTrack` in src/types/dj.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjTrack {
    pub spotify_id: String,
    /// Spotify's name, e.g. "Sunday Jams - Luciano Remix".
    pub title: String,
    /// Artists joined with ", ".
    pub artists: String,
    /// The release it was found on.
    pub album: Option<String>,
    pub release_date: Option<String>,
    pub isrc: Option<String>,
    pub duration_ms: Option<i64>,
}

/// A gig from Resident Advisor. Reads the same as `DjGig` in src/types/dj.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjGig {
    pub ra_event_id: String,
    /// "2026-10-12": the venue's local day.
    pub date: String,
    pub venue: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    /// The other artists on the bill, "Marco Carola, Loco Dice".
    pub lineup: Option<String>,
    pub url: Option<String>,
}

/// One row of a saved set, for Plays. Reads the same as `DjSetTrack` in src/types/dj.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjSetTrack {
    pub video_id: String,
    pub artist: Option<String>,
    pub title: String,
    pub mix: Option<String>,
    pub is_unknown: bool,
}

/// Whether data written at `synced_at` (unix ms) needs fetching again.
pub fn is_stale(synced_at: Option<i64>, now_ms: i64, max_age_ms: i64) -> bool {
    match synced_at {
        None => true,
        Some(at) => now_ms - at > max_age_ms,
    }
}

/// Lower-case, every run of non-alphanumerics one space: "Sunday Jams - Luciano
/// Remix" and "Sunday Jams (Luciano Remix)" read the same.
fn normalise(text: &str) -> String {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// The same recording on a single and on an album shows once.
///
/// Rows with the same ISRC are one recording; rows without one are one when
/// their artists and full name match after `normalise` (Spotify's name carries
/// the mix after the dash, so two mixes stay apart). The row kept is the one
/// with the earliest release date — ties go to the smallest Spotify id, so the
/// choice never depends on read order. The result is newest first.
pub fn collapse_duplicates(tracks: Vec<DjTrack>) -> Vec<DjTrack> {
    // An unknown date counts as later than any known one.
    fn earlier(a: &DjTrack, b: &DjTrack) -> bool {
        match (&a.release_date, &b.release_date) {
            (Some(x), Some(y)) if x != y => x < y,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            _ => a.spotify_id < b.spotify_id,
        }
    }

    let mut kept: HashMap<String, DjTrack> = HashMap::new();
    for track in tracks {
        let key = match track.isrc.as_deref().map(str::trim).filter(|isrc| !isrc.is_empty()) {
            Some(isrc) => format!("isrc:{}", isrc.to_uppercase()),
            None => format!("name:{}\u{1f}{}", normalise(&track.artists), normalise(&track.title)),
        };
        match kept.get(&key) {
            Some(current) if !earlier(&track, current) => {}
            _ => {
                kept.insert(key, track);
            }
        }
    }

    let mut out: Vec<DjTrack> = kept.into_values().collect();
    out.sort_by(|a, b| {
        b.release_date
            .cmp(&a.release_date)
            .then_with(|| a.title.cmp(&b.title))
            .then_with(|| a.spotify_id.cmp(&b.spotify_id))
    });
    out
}

const PROFILE_COLUMNS: &str = "name_key, display_name, spotify_artist_id, spotify_manual,
    spotify_image_url, genres, ra_artist_id, ra_slug, ra_image_url, ra_manual,
    spotify_synced_at, ra_synced_at, spotify_appears_limit, spotify_appears_total";

fn profile_from_row(r: &rusqlite::Row<'_>) -> Result<DjProfileRow> {
    let genres: Option<String> = r.get(5)?;
    Ok(DjProfileRow {
        name_key: r.get(0)?,
        display_name: r.get(1)?,
        spotify_artist_id: r.get(2)?,
        spotify_manual: r.get::<_, i64>(3)? != 0,
        spotify_image_url: r.get(4)?,
        genres: genres.and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default(),
        ra_artist_id: r.get(6)?,
        ra_slug: r.get(7)?,
        ra_image_url: r.get(8)?,
        ra_manual: r.get::<_, i64>(9)? != 0,
        spotify_synced_at: r.get(10)?,
        ra_synced_at: r.get(11)?,
        appears_limit: r.get(12)?,
        appears_total: r.get(13)?,
    })
}

fn track_from_row(r: &rusqlite::Row<'_>) -> Result<DjTrack> {
    Ok(DjTrack {
        spotify_id: r.get(0)?,
        title: r.get(1)?,
        artists: r.get(2)?,
        album: r.get(3)?,
        release_date: r.get(4)?,
        isrc: r.get(5)?,
        duration_ms: r.get(6)?,
    })
}

/// "?, ?, ?" for an `IN (…)` of `n` values.
fn placeholders(n: usize) -> String {
    vec!["?"; n].join(", ")
}

/// Ids per `IN (…)` query, well under SQLite's limit on bound values.
const IN_CHUNK: usize = 500;

impl Database {
    /// Takes the write lock up front, as the Spotify storage does: the
    /// companion server holds a second connection to the same file, and a
    /// deferred transaction that reads first could fail to upgrade midway.
    fn dj_immediate_transaction(&self) -> Result<Transaction<'_>> {
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)
    }
}

// --- profiles ------------------------------------------------------------

impl Database {
    pub fn get_dj_profile(&self, name_key: &str) -> Result<Option<DjProfileRow>> {
        self.conn
            .query_row(
                &format!("SELECT {PROFILE_COLUMNS} FROM dj_profiles WHERE name_key = ?1"),
                [name_key],
                profile_from_row,
            )
            .optional()
    }

    /// The profile, created on first use. The display name is the one it was
    /// first opened with.
    pub fn ensure_dj_profile(&self, name_key: &str, display_name: &str) -> Result<DjProfileRow> {
        self.conn.execute(
            "INSERT OR IGNORE INTO dj_profiles (name_key, display_name) VALUES (?1, ?2)",
            params![name_key, display_name],
        )?;
        self.get_dj_profile(name_key)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Stores an automatically found Spotify artist — only on a profile with
    /// no artist and no manual choice. Returns whether it was stored.
    pub fn resolve_dj_spotify(&self, name_key: &str, artist_id: &str) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE dj_profiles SET spotify_artist_id = ?2
             WHERE name_key = ?1 AND spotify_artist_id IS NULL AND spotify_manual = 0",
            params![name_key, artist_id],
        )?;
        Ok(changed > 0)
    }

    /// Photo and genres of the profile's Spotify artist. Ignored when the
    /// profile has meanwhile been pointed at another artist.
    pub fn set_dj_spotify_details(
        &self,
        name_key: &str,
        artist_id: &str,
        image_url: Option<&str>,
        genres: &[String],
    ) -> Result<()> {
        let genres = serde_json::to_string(genres).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "UPDATE dj_profiles SET spotify_image_url = ?3, genres = ?4
             WHERE name_key = ?1 AND spotify_artist_id = ?2",
            params![name_key, artist_id, image_url, genres],
        )?;
        Ok(())
    }

    /// A choice made by hand: an artist id, or None for "none of these". It is
    /// never replaced automatically.
    ///
    /// A different artist than the stored one forgets everything fetched for
    /// the old one, so the next refresh starts over. Returns whether that
    /// happened; the same id only marks the choice manual.
    pub fn set_dj_spotify_manual(&self, name_key: &str, artist_id: Option<&str>) -> Result<bool> {
        let tx = self.dj_immediate_transaction()?;
        self.conn.execute(
            "INSERT OR IGNORE INTO dj_profiles (name_key, display_name) VALUES (?1, ?1)",
            [name_key],
        )?;
        let stored: Option<String> = self
            .conn
            .query_row(
                "SELECT spotify_artist_id FROM dj_profiles WHERE name_key = ?1",
                [name_key],
                |r| r.get(0),
            )
            .optional()?
            .flatten();

        let changed = stored.as_deref() != artist_id;
        if changed {
            self.forget_dj_spotify_rows(name_key)?;
            self.conn.execute(
                "UPDATE dj_profiles SET
                    spotify_artist_id = ?2, spotify_manual = 1,
                    spotify_image_url = NULL, genres = NULL, spotify_synced_at = NULL,
                    spotify_appears_limit = ?3, spotify_appears_total = NULL
                 WHERE name_key = ?1",
                params![name_key, artist_id, APPEARS_STEP],
            )?;
        } else {
            self.conn.execute(
                "UPDATE dj_profiles SET spotify_manual = 1 WHERE name_key = ?1",
                [name_key],
            )?;
        }
        tx.commit()?;
        Ok(changed)
    }

    fn forget_dj_spotify_rows(&self, name_key: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM dj_spotify_releases WHERE name_key = ?1", [name_key])?;
        self.conn
            .execute("DELETE FROM dj_spotify_tracks WHERE name_key = ?1", [name_key])?;
        Ok(())
    }

    /// Stores an automatically found RA artist — only on a profile with no RA
    /// artist and no manual choice. Returns whether it was stored.
    pub fn resolve_dj_ra(&self, name_key: &str, artist: &DjRaArtist) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE dj_profiles SET ra_artist_id = ?2, ra_slug = ?3, ra_image_url = ?4
             WHERE name_key = ?1 AND ra_artist_id IS NULL AND ra_manual = 0",
            params![name_key, artist.id, artist.slug, artist.image_url],
        )?;
        Ok(changed > 0)
    }

    /// The RA side of `set_dj_spotify_manual`: a different artist (or None)
    /// forgets the cached gigs. Returns whether that happened.
    pub fn set_dj_ra_manual(&self, name_key: &str, artist: Option<&DjRaArtist>) -> Result<bool> {
        let tx = self.dj_immediate_transaction()?;
        self.conn.execute(
            "INSERT OR IGNORE INTO dj_profiles (name_key, display_name) VALUES (?1, ?1)",
            [name_key],
        )?;
        let stored: Option<String> = self
            .conn
            .query_row(
                "SELECT ra_artist_id FROM dj_profiles WHERE name_key = ?1",
                [name_key],
                |r| r.get(0),
            )
            .optional()?
            .flatten();

        let changed = stored.as_deref() != artist.map(|a| a.id.as_str());
        if changed {
            self.conn.execute("DELETE FROM dj_gigs WHERE name_key = ?1", [name_key])?;
            self.conn.execute(
                "UPDATE dj_profiles SET ra_synced_at = NULL WHERE name_key = ?1",
                [name_key],
            )?;
        }
        self.conn.execute(
            "UPDATE dj_profiles SET ra_artist_id = ?2, ra_slug = ?3, ra_image_url = ?4, ra_manual = 1
             WHERE name_key = ?1",
            params![
                name_key,
                artist.map(|a| a.id.as_str()),
                artist.map(|a| a.slug.as_str()),
                artist.and_then(|a| a.image_url.as_deref()),
            ],
        )?;
        tx.commit()?;
        Ok(changed)
    }

    /// Disconnecting Spotify forgets everything fetched from it for every DJ,
    /// manual Spotify choices included. RA data stays.
    pub fn clear_dj_spotify(&self) -> Result<()> {
        let tx = self.dj_immediate_transaction()?;
        self.conn.execute_batch(&format!(
            "DELETE FROM dj_spotify_releases;
             DELETE FROM dj_spotify_tracks;
             UPDATE dj_profiles SET
                spotify_artist_id = NULL, spotify_manual = 0, spotify_image_url = NULL,
                genres = NULL, spotify_synced_at = NULL,
                spotify_appears_limit = {APPEARS_STEP}, spotify_appears_total = NULL;"
        ))?;
        tx.commit()
    }
}

// --- releases and tracks -------------------------------------------------

impl Database {
    /// Ids of every release recorded for this DJ, fetched or not.
    pub fn dj_release_ids(&self, name_key: &str) -> Result<HashSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT release_id FROM dj_spotify_releases WHERE name_key = ?1")?;
        let rows = stmt.query_map([name_key], |r| r.get::<_, String>(0))?;
        rows.collect()
    }

    /// Records what a listing found, in one transaction with the window it was
    /// listed with. Releases already recorded are left as they are — their
    /// tracks are not read again. Returns how many were new.
    pub fn record_dj_releases(
        &self,
        name_key: &str,
        releases: &[DjRelease],
        appears_limit: i64,
        appears_total: Option<i64>,
    ) -> Result<usize> {
        let tx = self.dj_immediate_transaction()?;
        let mut added = 0;
        for release in releases {
            added += self.conn.execute(
                "INSERT OR IGNORE INTO dj_spotify_releases (name_key, release_id, name, release_date)
                 VALUES (?1, ?2, ?3, ?4)",
                params![name_key, release.id, release.name, release.release_date],
            )?;
        }
        self.conn.execute(
            "UPDATE dj_profiles SET spotify_appears_limit = ?2, spotify_appears_total = ?3
             WHERE name_key = ?1",
            params![name_key, appears_limit, appears_total],
        )?;
        tx.commit()?;
        Ok(added)
    }

    /// Recorded releases whose tracks are not stored yet, newest first.
    pub fn pending_dj_releases(&self, name_key: &str) -> Result<Vec<DjRelease>> {
        let mut stmt = self.conn.prepare(
            "SELECT release_id, name, release_date FROM dj_spotify_releases
             WHERE name_key = ?1 AND tracks_fetched = 0
             ORDER BY release_date DESC, release_id",
        )?;
        let rows = stmt.query_map([name_key], |r| {
            Ok(DjRelease { id: r.get(0)?, name: r.get(1)?, release_date: r.get(2)? })
        })?;
        rows.collect()
    }

    pub fn count_pending_dj_releases(&self, name_key: &str) -> Result<i64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM dj_spotify_releases WHERE name_key = ?1 AND tracks_fetched = 0",
            [name_key],
            |r| r.get(0),
        )
    }

    /// One finished batch: its tracks, and its releases marked fetched — both
    /// or neither.
    pub fn write_dj_track_batch(
        &self,
        name_key: &str,
        release_ids: &[String],
        tracks: &[DjTrack],
    ) -> Result<()> {
        let tx = self.dj_immediate_transaction()?;
        for track in tracks {
            self.conn.execute(
                "INSERT OR IGNORE INTO dj_spotify_tracks
                    (name_key, spotify_id, title, artists, album, release_date, isrc, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    name_key,
                    track.spotify_id,
                    track.title,
                    track.artists,
                    track.album,
                    track.release_date,
                    track.isrc,
                    track.duration_ms,
                ],
            )?;
        }
        for release_id in release_ids {
            self.conn.execute(
                "UPDATE dj_spotify_releases SET tracks_fetched = 1
                 WHERE name_key = ?1 AND release_id = ?2",
                params![name_key, release_id],
            )?;
        }
        tx.commit()
    }

    /// Written only when a fetch finished every release.
    pub fn mark_dj_spotify_synced(&self, name_key: &str, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE dj_profiles SET spotify_synced_at = ?2 WHERE name_key = ?1",
            params![name_key, now_ms],
        )?;
        Ok(())
    }

    /// Every stored track, duplicates included. `collapse_duplicates` makes the list.
    pub fn dj_tracks(&self, name_key: &str) -> Result<Vec<DjTrack>> {
        let mut stmt = self.conn.prepare(
            "SELECT spotify_id, title, artists, album, release_date, isrc, duration_ms
             FROM dj_spotify_tracks WHERE name_key = ?1",
        )?;
        let rows = stmt.query_map([name_key], track_from_row)?;
        rows.collect()
    }

    /// The cached tracks of several DJs at once, duplicates collapsed — for the
    /// "you own 23" on Search's DJ cards. DJs with nothing cached are left out.
    pub fn dj_cached_tracks(&self, name_keys: &[String]) -> Result<HashMap<String, Vec<DjTrack>>> {
        let mut raw: HashMap<String, Vec<DjTrack>> = HashMap::new();
        for chunk in name_keys.chunks(IN_CHUNK) {
            let mut stmt = self.conn.prepare(&format!(
                "SELECT spotify_id, title, artists, album, release_date, isrc, duration_ms, name_key
                 FROM dj_spotify_tracks WHERE name_key IN ({})",
                placeholders(chunk.len())
            ))?;
            let rows = stmt.query_map(params_from_iter(chunk), |r| {
                Ok((r.get::<_, String>(7)?, track_from_row(r)?))
            })?;
            for row in rows {
                let (key, track) = row?;
                raw.entry(key).or_default().push(track);
            }
        }
        Ok(raw
            .into_iter()
            .map(|(key, tracks)| (key, collapse_duplicates(tracks)))
            .collect())
    }
}

// --- gigs and sets -------------------------------------------------------

impl Database {
    /// What RA lists now replaces what it listed before, and stamps the time.
    pub fn replace_dj_gigs(&self, name_key: &str, gigs: &[DjGig], now_ms: i64) -> Result<()> {
        let tx = self.dj_immediate_transaction()?;
        self.conn.execute("DELETE FROM dj_gigs WHERE name_key = ?1", [name_key])?;
        for gig in gigs {
            self.conn.execute(
                "INSERT OR REPLACE INTO dj_gigs
                    (name_key, ra_event_id, date, venue, city, country, lineup, url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    name_key,
                    gig.ra_event_id,
                    gig.date,
                    gig.venue,
                    gig.city,
                    gig.country,
                    gig.lineup,
                    gig.url,
                ],
            )?;
        }
        self.conn.execute(
            "UPDATE dj_profiles SET ra_synced_at = ?2 WHERE name_key = ?1",
            params![name_key, now_ms],
        )?;
        tx.commit()
    }

    /// Every cached gig, earliest first. Upcoming and past are split by the frontend.
    pub fn dj_gigs(&self, name_key: &str) -> Result<Vec<DjGig>> {
        let mut stmt = self.conn.prepare(
            "SELECT ra_event_id, date, venue, city, country, lineup, url
             FROM dj_gigs WHERE name_key = ?1 ORDER BY date, ra_event_id",
        )?;
        let rows = stmt.query_map([name_key], |r| {
            Ok(DjGig {
                ra_event_id: r.get(0)?,
                date: r.get(1)?,
                venue: r.get(2)?,
                city: r.get(3)?,
                country: r.get(4)?,
                lineup: r.get(5)?,
                url: r.get(6)?,
            })
        })?;
        rows.collect()
    }

    /// The parsed tracks of these saved sets, in set order — what Plays counts.
    pub fn yt_tracks_for_sets(&self, video_ids: &[String]) -> Result<Vec<DjSetTrack>> {
        let mut out = Vec::new();
        for chunk in video_ids.chunks(IN_CHUNK) {
            let mut stmt = self.conn.prepare(&format!(
                "SELECT video_id, artist, title, mix, is_unknown FROM yt_tracks
                 WHERE video_id IN ({}) ORDER BY video_id, position",
                placeholders(chunk.len())
            ))?;
            let rows = stmt.query_map(params_from_iter(chunk), |r| {
                Ok(DjSetTrack {
                    video_id: r.get(0)?,
                    artist: r.get(1)?,
                    title: r.get(2)?,
                    mix: r.get(3)?,
                    is_unknown: r.get::<_, i64>(4)? != 0,
                })
            })?;
            for row in rows {
                out.push(row?);
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "marco carola";

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db.ensure_dj_profile(KEY, "Marco Carola").unwrap();
        db
    }

    fn profile(db: &Database) -> DjProfileRow {
        db.get_dj_profile(KEY).unwrap().expect("profile")
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    fn release(id: &str, date: &str) -> DjRelease {
        DjRelease { id: id.to_string(), name: format!("Release {id}"), release_date: Some(date.to_string()) }
    }

    fn track(id: &str, title: &str, date: Option<&str>, isrc: Option<&str>) -> DjTrack {
        DjTrack {
            spotify_id: id.to_string(),
            title: title.to_string(),
            artists: "Marco Carola".to_string(),
            album: Some("An album".to_string()),
            release_date: date.map(str::to_string),
            isrc: isrc.map(str::to_string),
            duration_ms: Some(400_000),
        }
    }

    fn gig(id: &str, date: &str) -> DjGig {
        DjGig {
            ra_event_id: id.to_string(),
            date: date.to_string(),
            venue: Some("Amnesia".to_string()),
            city: Some("Ibiza".to_string()),
            country: Some("ES".to_string()),
            lineup: Some("Loco Dice".to_string()),
            url: Some(format!("https://ra.co/events/{id}")),
        }
    }

    /// A profile that has fetched something: one release, one track, synced.
    fn with_spotify_rows(db: &Database) {
        db.resolve_dj_spotify(KEY, "artistA").unwrap();
        db.record_dj_releases(KEY, &[release("r1", "2024-01-01")], 300, Some(400)).unwrap();
        db.write_dj_track_batch(KEY, &["r1".to_string()], &[track("t1", "Song", Some("2024-01-01"), None)])
            .unwrap();
        db.mark_dj_spotify_synced(KEY, 1_000).unwrap();
    }

    #[test]
    fn a_profile_is_created_once_and_keeps_its_first_name() {
        let db = fresh();
        let again = db.ensure_dj_profile(KEY, "MARCO CAROLA").unwrap();
        assert_eq!(again.display_name, "Marco Carola");
        assert_eq!(again.spotify_artist_id, None);
        assert!(!again.spotify_manual);
        assert_eq!(again.genres, Vec::<String>::new());
        assert_eq!(again.appears_limit, APPEARS_STEP);
        assert_eq!(again.appears_total, None);
        assert_eq!(db.get_dj_profile("nobody").unwrap(), None);
    }

    #[test]
    fn data_is_stale_when_never_fetched_or_too_old() {
        assert!(is_stale(None, 10_000, RA_MAX_AGE_MS));
        assert!(!is_stale(Some(10_000), 10_000 + RA_MAX_AGE_MS, RA_MAX_AGE_MS));
        assert!(is_stale(Some(10_000), 10_001 + RA_MAX_AGE_MS, RA_MAX_AGE_MS));
        let week_ago = 1_000;
        assert!(!is_stale(Some(week_ago), week_ago + SPOTIFY_MAX_AGE_MS - 1, SPOTIFY_MAX_AGE_MS));
        assert!(is_stale(Some(week_ago), week_ago + SPOTIFY_MAX_AGE_MS + 1, SPOTIFY_MAX_AGE_MS));
    }

    #[test]
    fn an_automatic_match_fills_only_an_empty_profile() {
        let db = fresh();
        assert!(db.resolve_dj_spotify(KEY, "artistA").unwrap());
        db.set_dj_spotify_details(KEY, "artistA", Some("https://i.scdn.co/a.jpg"), &["techno".to_string()])
            .unwrap();
        // A second automatic match changes nothing.
        assert!(!db.resolve_dj_spotify(KEY, "artistB").unwrap());
        // Details for an artist the profile no longer points at are ignored.
        db.set_dj_spotify_details(KEY, "artistB", Some("https://i.scdn.co/b.jpg"), &[]).unwrap();

        let p = profile(&db);
        assert_eq!(p.spotify_artist_id.as_deref(), Some("artistA"));
        assert!(!p.spotify_manual);
        assert_eq!(p.spotify_image_url.as_deref(), Some("https://i.scdn.co/a.jpg"));
        assert_eq!(p.genres, vec!["techno".to_string()]);
    }

    #[test]
    fn a_manual_match_survives_an_automatic_resolve() {
        let db = fresh();
        db.set_dj_spotify_manual(KEY, Some("picked")).unwrap();
        assert!(!db.resolve_dj_spotify(KEY, "searched").unwrap());
        let p = profile(&db);
        assert_eq!(p.spotify_artist_id.as_deref(), Some("picked"));
        assert!(p.spotify_manual);
    }

    #[test]
    fn none_is_a_choice_and_is_never_filled_in_automatically() {
        let db = fresh();
        with_spotify_rows(&db);
        assert!(db.set_dj_spotify_manual(KEY, None).unwrap());
        assert!(!db.resolve_dj_spotify(KEY, "artistA").unwrap());
        let p = profile(&db);
        assert_eq!(p.spotify_artist_id, None);
        assert!(p.spotify_manual);
        assert_eq!(count(&db, "dj_spotify_tracks"), 0);
    }

    #[test]
    fn a_manual_change_of_artist_forgets_what_was_fetched_for_the_old_one() {
        let db = fresh();
        with_spotify_rows(&db);
        db.set_dj_spotify_details(KEY, "artistA", Some("https://i.scdn.co/a.jpg"), &[]).unwrap();

        assert!(db.set_dj_spotify_manual(KEY, Some("artistB")).unwrap());

        let p = profile(&db);
        assert_eq!(p.spotify_artist_id.as_deref(), Some("artistB"));
        assert!(p.spotify_manual);
        assert_eq!(p.spotify_image_url, None);
        assert_eq!(p.spotify_synced_at, None);
        assert_eq!(p.appears_limit, APPEARS_STEP);
        assert_eq!(p.appears_total, None);
        assert_eq!(count(&db, "dj_spotify_releases"), 0);
        assert_eq!(count(&db, "dj_spotify_tracks"), 0);
    }

    #[test]
    fn picking_the_artist_already_shown_only_makes_it_manual() {
        let db = fresh();
        with_spotify_rows(&db);
        assert!(!db.set_dj_spotify_manual(KEY, Some("artistA")).unwrap());
        let p = profile(&db);
        assert!(p.spotify_manual);
        assert_eq!(p.spotify_synced_at, Some(1_000));
        assert_eq!(count(&db, "dj_spotify_tracks"), 1);
    }

    #[test]
    fn a_manual_choice_on_a_missing_profile_creates_it() {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        assert!(db.set_dj_spotify_manual("nobody", Some("a1")).unwrap());
        let p = db.get_dj_profile("nobody").unwrap().expect("profile");
        assert_eq!(p.spotify_artist_id.as_deref(), Some("a1"));
        assert!(p.spotify_manual);

        let ra = DjRaArtist { id: "7".into(), slug: "x".into(), image_url: None };
        assert!(db.set_dj_ra_manual("other", Some(&ra)).unwrap());
        let p = db.get_dj_profile("other").unwrap().expect("profile");
        assert_eq!(p.ra_artist_id.as_deref(), Some("7"));
        assert!(p.ra_manual);
    }

    #[test]
    fn the_ra_artist_follows_the_same_rules() {
        let db = fresh();
        let found = DjRaArtist { id: "570".into(), slug: "marcocarola".into(), image_url: None };
        assert!(db.resolve_dj_ra(KEY, &found).unwrap());
        db.replace_dj_gigs(KEY, &[gig("1", "2026-10-12")], 5_000).unwrap();

        // The same artist picked by hand keeps the gigs.
        assert!(!db.set_dj_ra_manual(KEY, Some(&found)).unwrap());
        assert_eq!(count(&db, "dj_gigs"), 1);

        // Another artist forgets them; an automatic match never replaces it.
        let other = DjRaArtist { id: "9".into(), slug: "marcocarola2".into(), image_url: Some("x.jpg".into()) };
        assert!(db.set_dj_ra_manual(KEY, Some(&other)).unwrap());
        assert!(!db.resolve_dj_ra(KEY, &found).unwrap());
        let p = profile(&db);
        assert_eq!(p.ra_artist_id.as_deref(), Some("9"));
        assert_eq!(p.ra_slug.as_deref(), Some("marcocarola2"));
        assert_eq!(p.ra_image_url.as_deref(), Some("x.jpg"));
        assert!(p.ra_manual);
        assert_eq!(p.ra_synced_at, None);
        assert_eq!(count(&db, "dj_gigs"), 0);
    }

    #[test]
    fn recording_keeps_only_releases_not_seen_before() {
        let db = fresh();
        let first = [release("a", "2024-01-01"), release("b", "2023-01-01")];
        assert_eq!(db.record_dj_releases(KEY, &first, 150, Some(2)).unwrap(), 2);
        db.write_dj_track_batch(KEY, &["a".to_string()], &[]).unwrap();

        let second = [release("c", "2025-01-01"), release("a", "2024-01-01"), release("b", "2023-01-01")];
        let added = db.record_dj_releases(KEY, &second, 151, Some(3)).unwrap();

        assert_eq!(added, 1);
        assert_eq!(db.dj_release_ids(KEY).unwrap(), HashSet::from(["a".into(), "b".into(), "c".into()]));
        // "a" was fetched and stays fetched; the others wait, newest first.
        let pending: Vec<String> = db.pending_dj_releases(KEY).unwrap().into_iter().map(|r| r.id).collect();
        assert_eq!(pending, ["c", "b"]);
        assert_eq!(db.count_pending_dj_releases(KEY).unwrap(), 2);
        let p = profile(&db);
        assert_eq!((p.appears_limit, p.appears_total), (151, Some(3)));
    }

    #[test]
    fn a_batch_stores_its_tracks_and_marks_its_releases_fetched() {
        let db = fresh();
        let both = [release("a", "2024-01-01"), release("b", "2023-01-01")];
        db.record_dj_releases(KEY, &both, 150, None).unwrap();
        db.write_dj_track_batch(
            KEY,
            &["a".to_string()],
            &[track("t1", "One", Some("2024-01-01"), None), track("t2", "Two", Some("2024-01-01"), None)],
        )
        .unwrap();

        assert_eq!(db.dj_tracks(KEY).unwrap().len(), 2);
        let pending: Vec<String> = db.pending_dj_releases(KEY).unwrap().into_iter().map(|r| r.id).collect();
        assert_eq!(pending, ["b"]);
        assert_eq!(profile(&db).spotify_synced_at, None, "only a finished fetch stamps the time");
    }

    #[test]
    fn the_same_recording_collapses_by_isrc_to_its_earliest_release() {
        let single = track("s1", "Sunday Jams", Some("2019-05-01"), Some("ITX001"));
        let album = track("a1", "Sunday Jams - Album Edit", Some("2020-02-01"), Some("itx001"));
        let other = track("o1", "Other", Some("2021-01-01"), Some("ITX002"));
        let out = collapse_duplicates(vec![album, other.clone(), single.clone()]);
        assert_eq!(out, vec![other, single]);
    }

    #[test]
    fn without_an_isrc_the_same_artists_and_name_collapse() {
        let compilation = track("c1", "Sunday Jams - Luciano Remix", Some("2022-07-01"), None);
        let single = track("s1", "Sunday Jams (Luciano Remix)", Some("2021-03-01"), None);
        let original = track("o1", "Sunday Jams", Some("2021-03-01"), None);
        let mut other_artist = track("x1", "Sunday Jams - Luciano Remix", Some("2020-01-01"), None);
        other_artist.artists = "Someone Else".to_string();

        let out = collapse_duplicates(vec![compilation, single.clone(), original.clone(), other_artist.clone()]);

        // The remix and the original are different recordings. Newest first,
        // the remix with its earliest date; the same date reads by title.
        assert_eq!(out, vec![original, single, other_artist]);
    }

    #[test]
    fn ties_on_the_date_go_to_the_smallest_id_and_unknown_dates_lose() {
        let b = track("b", "Song", Some("2020-01-01"), None);
        let a = track("a", "Song", Some("2020-01-01"), None);
        let undated = track("0", "Song", None, None);
        assert_eq!(collapse_duplicates(vec![b, undated, a.clone()]), vec![a]);
    }

    #[test]
    fn disconnecting_spotify_forgets_spotify_and_keeps_ra() {
        let db = fresh();
        with_spotify_rows(&db);
        db.set_dj_spotify_manual(KEY, Some("picked")).unwrap();
        db.resolve_dj_ra(KEY, &DjRaArtist { id: "570".into(), slug: "marcocarola".into(), image_url: None })
            .unwrap();
        db.replace_dj_gigs(KEY, &[gig("1", "2026-10-12")], 5_000).unwrap();

        db.clear_dj_spotify().unwrap();

        let p = profile(&db);
        assert_eq!(p.spotify_artist_id, None);
        assert!(!p.spotify_manual);
        assert_eq!(p.spotify_synced_at, None);
        assert_eq!((p.appears_limit, p.appears_total), (APPEARS_STEP, None));
        assert_eq!(count(&db, "dj_spotify_releases"), 0);
        assert_eq!(count(&db, "dj_spotify_tracks"), 0);
        assert_eq!(p.ra_artist_id.as_deref(), Some("570"));
        assert_eq!(p.ra_synced_at, Some(5_000));
        assert_eq!(count(&db, "dj_gigs"), 1);
    }

    #[test]
    fn gigs_are_replaced_whole_and_read_earliest_first() {
        let db = fresh();
        db.replace_dj_gigs(KEY, &[gig("old", "2026-01-01")], 1).unwrap();
        db.replace_dj_gigs(KEY, &[gig("2", "2026-11-01"), gig("1", "2026-10-12")], 2).unwrap();
        let ids: Vec<String> = db.dj_gigs(KEY).unwrap().into_iter().map(|g| g.ra_event_id).collect();
        assert_eq!(ids, ["1", "2"]);
        assert_eq!(profile(&db).ra_synced_at, Some(2));
    }

    #[test]
    fn reads_the_tracks_of_the_given_sets_only() {
        let db = fresh();
        for video in ["v1", "v2", "v3"] {
            db.conn
                .execute(
                    "INSERT INTO yt_sets (video_id, url, title, raw_json) VALUES (?1, 'u', 't', '{}')",
                    [video],
                )
                .unwrap();
        }
        let insert = |video: &str, position: i64, artist: Option<&str>, title: &str, unknown: bool| {
            db.conn
                .execute(
                    "INSERT INTO yt_tracks (video_id, position, cue_ms, artist, title, mix, is_unknown)
                     VALUES (?1, ?2, 0, ?3, ?4, NULL, ?5)",
                    params![video, position, artist, title, unknown as i64],
                )
                .unwrap();
        };
        insert("v1", 2, Some("Butch"), "Come Get Up", false);
        insert("v1", 1, None, "ID", true);
        insert("v2", 1, Some("Loco Dice"), "Toxic", false);
        insert("v3", 1, Some("Not asked"), "For", false);

        let rows = db.yt_tracks_for_sets(&["v1".to_string(), "v2".to_string()]).unwrap();

        assert_eq!(
            rows,
            vec![
                DjSetTrack { video_id: "v1".into(), artist: None, title: "ID".into(), mix: None, is_unknown: true },
                DjSetTrack {
                    video_id: "v1".into(),
                    artist: Some("Butch".into()),
                    title: "Come Get Up".into(),
                    mix: None,
                    is_unknown: false,
                },
                DjSetTrack {
                    video_id: "v2".into(),
                    artist: Some("Loco Dice".into()),
                    title: "Toxic".into(),
                    mix: None,
                    is_unknown: false,
                },
            ]
        );
        assert!(db.yt_tracks_for_sets(&[]).unwrap().is_empty());
    }

    #[test]
    fn cached_tracks_come_back_per_dj_collapsed() {
        let db = fresh();
        db.ensure_dj_profile("luciano", "Luciano").unwrap();
        db.write_dj_track_batch(
            KEY,
            &[],
            &[track("t1", "Song", Some("2020-01-01"), None), track("t2", "Song", Some("2019-01-01"), None)],
        )
        .unwrap();
        db.write_dj_track_batch("luciano", &[], &[track("t3", "Other", None, None)]).unwrap();

        let cached = db
            .dj_cached_tracks(&[KEY.to_string(), "luciano".to_string(), "nobody".to_string()])
            .unwrap();

        assert_eq!(cached.len(), 2, "a DJ with nothing cached is left out");
        assert_eq!(cached[KEY].iter().map(|t| t.spotify_id.as_str()).collect::<Vec<_>>(), ["t2"]);
        assert_eq!(cached["luciano"].len(), 1);
    }

    #[test]
    fn tracks_and_gigs_read_as_the_frontend_expects() {
        assert_eq!(
            serde_json::to_value(track("t1", "Song", Some("2024"), Some("X1"))).unwrap(),
            serde_json::json!({
                "spotifyId": "t1", "title": "Song", "artists": "Marco Carola", "album": "An album",
                "releaseDate": "2024", "isrc": "X1", "durationMs": 400000
            })
        );
        assert_eq!(
            serde_json::to_value(gig("1", "2026-10-12")).unwrap(),
            serde_json::json!({
                "raEventId": "1", "date": "2026-10-12", "venue": "Amnesia", "city": "Ibiza",
                "country": "ES", "lineup": "Loco Dice", "url": "https://ra.co/events/1"
            })
        );
        assert_eq!(
            serde_json::to_value(DjSetTrack {
                video_id: "v1".into(),
                artist: None,
                title: "ID".into(),
                mix: None,
                is_unknown: true,
            })
            .unwrap(),
            serde_json::json!({ "videoId": "v1", "artist": null, "title": "ID", "mix": null, "isUnknown": true })
        );
    }
}
