// src-tauri/src/db/share.rs
//! Playlist share links (spec docs/superpowers/specs/2026-10-16-share-links-design.md):
//! the database side. A share link opens one playlist on the companion server
//! until it expires or is stopped. Expired rows are deleted whenever links are
//! listed or looked up.

use super::Database;
use rusqlite::{params, OptionalExtension, Result, Row};

/// The durations a link can be given, in days.
pub const SHARE_LINK_DAYS: [i64; 3] = [1, 7, 30];

const DAY_SECONDS: i64 = 86_400;

/// A live share link.
#[derive(Debug, Clone, PartialEq)]
pub struct ShareLink {
    pub token: String,
    pub playlist_id: i64,
    pub playlist_name: String,
    /// The duration last picked: 1, 7 or 30.
    pub days: i64,
    /// Unix seconds.
    pub created_at: i64,
    /// Unix seconds.
    pub expires_at: i64,
}

/// Now, in unix seconds.
pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn expiry(now: i64, days: i64) -> i64 {
    now.saturating_add(days.saturating_mul(DAY_SECONDS))
}

/// A link with its playlist's current name.
const SELECT_LINK: &str =
    "SELECT s.token, s.playlist_id, p.name, s.days, s.created_at, s.expires_at
     FROM share_links s JOIN playlists p ON p.id = s.playlist_id";

fn link_from_row(row: &Row) -> Result<ShareLink> {
    Ok(ShareLink {
        token: row.get(0)?,
        playlist_id: row.get(1)?,
        playlist_name: row.get(2)?,
        days: row.get(3)?,
        created_at: row.get(4)?,
        expires_at: row.get(5)?,
    })
}

impl Database {
    /// A link is live while `now < expires_at`; the rest are deleted.
    fn purge_expired_share_links(&self, now: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM share_links WHERE expires_at <= ?1", [now])?;
        Ok(())
    }

    fn share_link_by_token(&self, token: &str) -> Result<Option<ShareLink>> {
        self.conn
            .query_row(
                &format!("{SELECT_LINK} WHERE s.token = ?1"),
                [token],
                link_from_row,
            )
            .optional()
    }

    /// The live link of a playlist, if it has one.
    pub fn share_link_for(&self, playlist_id: i64) -> Result<Option<ShareLink>> {
        self.purge_expired_share_links(unix_now())?;
        self.conn
            .query_row(
                &format!("{SELECT_LINK} WHERE s.playlist_id = ?1"),
                [playlist_id],
                link_from_row,
            )
            .optional()
    }

    /// A new link for a playlist, live for `days` from now. An expired link of
    /// the playlist is replaced; a live one makes this fail (one per playlist).
    pub fn create_share_link(&self, playlist_id: i64, days: i64) -> Result<ShareLink> {
        let now = unix_now();
        self.purge_expired_share_links(now)?;
        let token = crate::server::generate_token();
        self.conn.execute(
            "INSERT INTO share_links (token, playlist_id, days, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![token, playlist_id, days, now, expiry(now, days)],
        )?;
        self.share_link_by_token(&token)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Restarts a live link's time: it now expires `days` from now. None when
    /// the link is gone (stopped or expired).
    pub fn set_share_link_days(&self, token: &str, days: i64) -> Result<Option<ShareLink>> {
        let now = unix_now();
        self.purge_expired_share_links(now)?;
        let changed = self.conn.execute(
            "UPDATE share_links SET days = ?1, expires_at = ?2 WHERE token = ?3",
            params![days, expiry(now, days), token],
        )?;
        if changed == 0 {
            return Ok(None);
        }
        self.share_link_by_token(token)
    }

    /// The live links, with their playlist's name, newest first.
    pub fn list_share_links(&self) -> Result<Vec<ShareLink>> {
        self.purge_expired_share_links(unix_now())?;
        let mut stmt = self.conn.prepare(&format!(
            "{SELECT_LINK} ORDER BY s.created_at DESC, s.rowid DESC"
        ))?;
        let links = stmt.query_map([], link_from_row)?;
        links.collect()
    }

    /// Stops one link. False when there was no such link.
    pub fn delete_share_link(&self, token: &str) -> Result<bool> {
        Ok(self
            .conn
            .execute("DELETE FROM share_links WHERE token = ?1", [token])?
            > 0)
    }

    /// Stops every live link; answers how many there were.
    pub fn delete_all_share_links(&self) -> Result<usize> {
        self.purge_expired_share_links(unix_now())?;
        self.conn.execute("DELETE FROM share_links", [])
    }

    /// The playlist a live share token opens at `now` (unix seconds). An
    /// expired link is deleted when it is looked up.
    pub fn shared_playlist(&self, token: &str, now: i64) -> Result<Option<i64>> {
        let row: Option<(i64, i64)> = self
            .conn
            .query_row(
                "SELECT playlist_id, expires_at FROM share_links WHERE token = ?1",
                [token],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match row {
            Some((playlist_id, expires_at)) if now < expires_at => Ok(Some(playlist_id)),
            Some(_) => {
                self.conn
                    .execute("DELETE FROM share_links WHERE token = ?1", [token])?;
                Ok(None)
            }
            None => Ok(None),
        }
    }

    /// Whether the playlist holds the track.
    pub fn playlist_has_track(&self, playlist_id: i64, track_id: i64) -> Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2)",
            params![playlist_id, track_id],
            |row| row.get(0),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    const DAY: i64 = 86_400;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn playlist(db: &Database, name: &str) -> i64 {
        db.conn
            .execute("INSERT INTO playlists (name) VALUES (?1)", [name])
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn track(db: &Database, name: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title) VALUES (?1, ?1, ?2)",
                params![format!("/m/{name}.mp3"), name],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn add(db: &Database, playlist: i64, track: i64) {
        db.conn
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, 1)",
                params![playlist, track],
            )
            .unwrap();
    }

    /// Moves a link's expiry into the past.
    fn expire(db: &Database, token: &str) {
        db.conn
            .execute(
                "UPDATE share_links SET expires_at = ?1 WHERE token = ?2",
                params![unix_now() - 1, token],
            )
            .unwrap();
    }

    fn rows(db: &Database) -> i64 {
        db.conn
            .query_row("SELECT COUNT(*) FROM share_links", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn a_new_link_lasts_its_days_and_has_a_fresh_token() {
        let db = db();
        let p = playlist(&db, "Warm-up");
        let before = unix_now();

        let link = db.create_share_link(p, 7).unwrap();

        assert_eq!(link.playlist_id, p);
        assert_eq!(link.playlist_name, "Warm-up");
        assert_eq!(link.days, 7);
        assert_eq!(link.token.len(), 64);
        assert!(link.token.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(link.created_at >= before && link.created_at <= unix_now());
        assert_eq!(link.expires_at, link.created_at + 7 * DAY);

        let other = db.create_share_link(playlist(&db, "Peak"), 7).unwrap();
        assert_ne!(link.token, other.token);
    }

    #[test]
    fn share_link_for_answers_the_live_link_only() {
        let db = db();
        let p = playlist(&db, "P");
        assert_eq!(db.share_link_for(p).unwrap(), None);

        let link = db.create_share_link(p, 1).unwrap();
        assert_eq!(db.share_link_for(p).unwrap(), Some(link.clone()));

        expire(&db, &link.token);
        assert_eq!(db.share_link_for(p).unwrap(), None);
        assert_eq!(rows(&db), 0, "the expired row is purged on lookup");
    }

    #[test]
    fn one_link_per_playlist() {
        let db = db();
        let p = playlist(&db, "P");
        db.create_share_link(p, 7).unwrap();

        assert!(db.create_share_link(p, 30).is_err());
        assert_eq!(rows(&db), 1);
    }

    #[test]
    fn create_replaces_an_expired_link() {
        let db = db();
        let p = playlist(&db, "P");
        let old = db.create_share_link(p, 7).unwrap();
        expire(&db, &old.token);

        let new = db.create_share_link(p, 30).unwrap();

        assert_ne!(new.token, old.token);
        assert_eq!(new.days, 30);
        assert_eq!(rows(&db), 1);
        assert_eq!(db.shared_playlist(&old.token, unix_now()).unwrap(), None);
    }

    #[test]
    fn set_days_restarts_the_time_from_now() {
        let db = db();
        let p = playlist(&db, "P");
        let link = db.create_share_link(p, 30).unwrap();
        db.conn
            .execute(
                "UPDATE share_links SET created_at = created_at - ?1",
                [5 * DAY],
            )
            .unwrap();

        let before = unix_now();
        let changed = db.set_share_link_days(&link.token, 1).unwrap().unwrap();

        assert_eq!(changed.token, link.token);
        assert_eq!(changed.days, 1);
        assert!(changed.expires_at >= before + DAY && changed.expires_at <= unix_now() + DAY);
        assert_eq!(
            changed.created_at,
            link.created_at - 5 * DAY,
            "created_at stays"
        );
    }

    #[test]
    fn set_days_on_a_gone_link_is_none() {
        let db = db();
        assert_eq!(db.set_share_link_days("nope", 7).unwrap(), None);

        let link = db.create_share_link(playlist(&db, "P"), 7).unwrap();
        expire(&db, &link.token);
        assert_eq!(db.set_share_link_days(&link.token, 7).unwrap(), None);
        assert_eq!(rows(&db), 0);
    }

    #[test]
    fn list_answers_live_links_newest_first_and_purges_expired_ones() {
        let db = db();
        let a = db.create_share_link(playlist(&db, "A"), 7).unwrap();
        let b = db.create_share_link(playlist(&db, "B"), 7).unwrap();
        let c = db.create_share_link(playlist(&db, "C"), 7).unwrap();
        db.conn
            .execute(
                "UPDATE share_links SET created_at = created_at - ?1 WHERE token = ?2",
                params![DAY, a.token],
            )
            .unwrap();
        expire(&db, &c.token);

        let listed = db.list_share_links().unwrap();

        let names: Vec<&str> = listed.iter().map(|l| l.playlist_name.as_str()).collect();
        assert_eq!(names, vec!["B", "A"]);
        assert_eq!(listed[0].token, b.token);
        assert_eq!(rows(&db), 2);
    }

    #[test]
    fn list_shows_the_playlists_current_name() {
        let db = db();
        let p = playlist(&db, "Old name");
        db.create_share_link(p, 7).unwrap();
        db.rename_playlist(p, "New name").unwrap();

        assert_eq!(db.list_share_links().unwrap()[0].playlist_name, "New name");
    }

    #[test]
    fn delete_stops_one_link() {
        let db = db();
        let a = db.create_share_link(playlist(&db, "A"), 7).unwrap();
        let b = db.create_share_link(playlist(&db, "B"), 7).unwrap();

        assert!(db.delete_share_link(&a.token).unwrap());
        assert!(!db.delete_share_link(&a.token).unwrap());

        assert_eq!(db.shared_playlist(&a.token, unix_now()).unwrap(), None);
        assert_eq!(
            db.shared_playlist(&b.token, unix_now()).unwrap(),
            Some(b.playlist_id)
        );
    }

    #[test]
    fn delete_all_stops_every_link() {
        let db = db();
        db.create_share_link(playlist(&db, "A"), 7).unwrap();
        db.create_share_link(playlist(&db, "B"), 1).unwrap();

        assert_eq!(db.delete_all_share_links().unwrap(), 2);
        assert_eq!(db.delete_all_share_links().unwrap(), 0);
        assert!(db.list_share_links().unwrap().is_empty());
    }

    #[test]
    fn shared_playlist_answers_a_live_token_only() {
        let db = db();
        let p = playlist(&db, "P");
        let link = db.create_share_link(p, 7).unwrap();

        assert_eq!(
            db.shared_playlist(&link.token, unix_now()).unwrap(),
            Some(p)
        );
        assert_eq!(db.shared_playlist("unknown", unix_now()).unwrap(), None);
        assert_eq!(db.shared_playlist("", unix_now()).unwrap(), None);
        // At the expiry second the link is already gone.
        assert_eq!(
            db.shared_playlist(&link.token, link.expires_at).unwrap(),
            None
        );
        assert_eq!(rows(&db), 0, "the expired row is purged on lookup");
    }

    #[test]
    fn a_deleted_playlist_takes_its_link_with_it() {
        let db = db();
        let p = playlist(&db, "P");
        let t = track(&db, "a");
        add(&db, p, t);
        let link = db.create_share_link(p, 7).unwrap();

        db.delete_playlist(p).unwrap();

        assert_eq!(rows(&db), 0);
        assert_eq!(db.shared_playlist(&link.token, unix_now()).unwrap(), None);
    }

    #[test]
    fn a_link_needs_an_existing_playlist() {
        let db = db();
        assert!(db.create_share_link(999, 7).is_err());
    }

    #[test]
    fn playlist_has_track_checks_the_slot() {
        let db = db();
        let p = playlist(&db, "P");
        let other = playlist(&db, "Other");
        let a = track(&db, "a");
        let b = track(&db, "b");
        add(&db, p, a);
        add(&db, other, b);

        assert!(db.playlist_has_track(p, a).unwrap());
        assert!(!db.playlist_has_track(p, b).unwrap());
        assert!(!db.playlist_has_track(p, 999).unwrap());
    }
}
