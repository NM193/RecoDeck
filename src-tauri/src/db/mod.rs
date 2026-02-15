// Database layer - SQLite connection, migrations, queries

use rusqlite::{params, Connection, Result};
use std::path::Path;

/// Represents a playlist or playlist folder in the database.
#[derive(Debug, Clone, PartialEq)]
pub struct Playlist {
    pub id: Option<i64>,
    pub name: String,
    pub playlist_type: String, // "manual", "smart", "folder"
    pub parent_id: Option<i64>,
    pub smart_rules: Option<String>,
    pub ai_prompt: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Represents DSP analysis results for a track (from the track_analysis table).
/// Fields are optional because analysis is done incrementally — BPM first, then key, then loudness, etc.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackAnalysis {
    pub track_id: i64,
    pub bpm: Option<f64>,
    pub bpm_confidence: Option<f64>,
    pub musical_key: Option<String>,
    pub key_confidence: Option<f64>,
    pub loudness_lufs: Option<f64>,
    pub dynamic_range: Option<f64>,
    pub spectral_centroid: Option<f64>,
    pub analyzed_at: Option<String>,
}

/// Represents a track in the database
#[derive(Debug, Clone, PartialEq)]
pub struct Track {
    pub id: Option<i64>,
    pub file_path: String,
    pub file_hash: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub label: Option<String>,
    pub duration_ms: Option<i32>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    pub date_added: Option<String>,
    pub date_modified: Option<String>,
    pub play_count: i32,
    pub rating: i32,
    pub comment: Option<String>,
    pub artwork_path: Option<String>,
    pub genre: Option<String>,
    pub genre_source: Option<String>, // 'user', 'tag', 'ai'
}

/// Represents a genre definition in the user's taxonomy
#[derive(Debug, Clone, PartialEq)]
pub struct GenreDefinition {
    pub id: Option<i64>,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i32,
}

/// Database connection wrapper
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Create a new database connection
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Database { conn })
    }

    /// Create an in-memory database (for testing)
    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        Ok(Database { conn })
    }

    /// Run migrations to set up the database schema
    pub fn run_migrations(&self) -> Result<()> {
        // Run all migrations in order
        let migration_001 = include_str!("migrations/001_init.sql");
        self.conn.execute_batch(migration_001)?;

        // Migration 002: Add parent_id column for playlist folders
        // Use a column check to make this idempotent (safe to re-run)
        let has_parent_id: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('playlists') WHERE name = 'parent_id'",
            [],
            |row| row.get(0),
        )?;

        if !has_parent_id {
            let migration_002 = include_str!("migrations/002_playlists_parent.sql");
            self.conn.execute_batch(migration_002)?;
        }

        // Migration 003: Add genre and genre_source columns, create genre_definitions table
        let has_genre: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('tracks') WHERE name = 'genre'",
            [],
            |row| row.get(0),
        )?;

        if !has_genre {
            let migration_003 = include_str!("migrations/003_genre.sql");
            self.conn.execute_batch(migration_003)?;
        }

        Ok(())
    }

    /// Create a new track
    pub fn create_track(&self, track: &Track) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO tracks (
                file_path, file_hash, title, artist, album, album_artist,
                track_number, year, label, duration_ms, file_format,
                bitrate, sample_rate, file_size, date_modified,
                play_count, rating, comment, artwork_path, genre, genre_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                track.file_path,
                track.file_hash,
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.track_number,
                track.year,
                track.label,
                track.duration_ms,
                track.file_format,
                track.bitrate,
                track.sample_rate,
                track.file_size,
                track.date_modified,
                track.play_count,
                track.rating,
                track.comment,
                track.artwork_path,
                track.genre,
                track.genre_source,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Read a track by ID
    pub fn get_track(&self, id: i64) -> Result<Track> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, file_hash, title, artist, album, album_artist,
                    track_number, year, label, duration_ms, file_format,
                    bitrate, sample_rate, file_size, date_added, date_modified,
                    play_count, rating, comment, artwork_path, genre, genre_source
             FROM tracks WHERE id = ?"
        )?;

        stmt.query_row([id], |row| {
            Ok(Track {
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
            })
        })
    }

    /// Get all tracks
    pub fn get_all_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, file_hash, title, artist, album, album_artist,
                    track_number, year, label, duration_ms, file_format,
                    bitrate, sample_rate, file_size, date_added, date_modified,
                    play_count, rating, comment, artwork_path, genre, genre_source
             FROM tracks ORDER BY id"
        )?;

        let tracks = stmt.query_map([], |row| {
            Ok(Track {
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
            })
        })?;

        tracks.collect()
    }

    /// Update a track
    pub fn update_track(&self, track: &Track) -> Result<()> {
        let id = track.id.ok_or_else(|| {
            rusqlite::Error::InvalidParameterName("Track ID is required for update".to_string())
        })?;

        self.conn.execute(
            "UPDATE tracks SET
                file_path = ?, file_hash = ?, title = ?, artist = ?,
                album = ?, album_artist = ?, track_number = ?, year = ?,
                label = ?, duration_ms = ?, file_format = ?, bitrate = ?,
                sample_rate = ?, file_size = ?, date_modified = ?,
                play_count = ?, rating = ?, comment = ?, artwork_path = ?,
                genre = ?, genre_source = ?
             WHERE id = ?",
            params![
                track.file_path,
                track.file_hash,
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.track_number,
                track.year,
                track.label,
                track.duration_ms,
                track.file_format,
                track.bitrate,
                track.sample_rate,
                track.file_size,
                track.date_modified,
                track.play_count,
                track.rating,
                track.comment,
                track.artwork_path,
                track.genre,
                track.genre_source,
                id,
            ],
        )?;
        Ok(())
    }

    /// Delete a track by ID
    pub fn delete_track(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM tracks WHERE id = ?", [id])?;
        Ok(())
    }

    /// Count total tracks
    pub fn count_tracks(&self) -> Result<i64> {
        let count: i64 = self.conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))?;
        Ok(count)
    }

    // --- Settings operations ---

    /// Get a setting value by key. Returns None if the key doesn't exist.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?")?;
        let result = stmt.query_row([key], |row| row.get::<_, Option<String>>(0));

        match result {
            Ok(value) => Ok(value),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Set a setting value (upsert: insert or update if key exists).
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Delete a setting by key.
    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn.execute("DELETE FROM settings WHERE key = ?", [key])?;
        Ok(())
    }

    // --- Playlist operations ---

    /// Create a new playlist or folder. Returns the new playlist ID.
    pub fn create_playlist(&self, name: &str, playlist_type: &str, parent_id: Option<i64>) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO playlists (name, type, parent_id) VALUES (?, ?, ?)",
            params![name, playlist_type, parent_id],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get all playlists and folders, ordered by name.
    pub fn get_all_playlists(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, type, parent_id, smart_rules, ai_prompt, created_at, updated_at
             FROM playlists ORDER BY name"
        )?;

        let playlists = stmt.query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                playlist_type: row.get(2)?,
                parent_id: row.get(3)?,
                smart_rules: row.get(4)?,
                ai_prompt: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        playlists.collect()
    }

    /// Get a single playlist by ID.
    pub fn get_playlist(&self, id: i64) -> Result<Playlist> {
        self.conn.query_row(
            "SELECT id, name, type, parent_id, smart_rules, ai_prompt, created_at, updated_at
             FROM playlists WHERE id = ?",
            [id],
            |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    playlist_type: row.get(2)?,
                    parent_id: row.get(3)?,
                    smart_rules: row.get(4)?,
                    ai_prompt: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
    }

    /// Rename a playlist or folder.
    pub fn rename_playlist(&self, id: i64, name: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?",
            params![name, id],
        )?;
        Ok(())
    }

    /// Delete a playlist (and its track associations). Also deletes child playlists if it's a folder.
    pub fn delete_playlist(&self, id: i64) -> Result<()> {
        // Delete track associations
        self.conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", [id])?;
        // Delete children (if folder) — their tracks too
        let children: Vec<i64> = {
            let mut stmt = self.conn.prepare("SELECT id FROM playlists WHERE parent_id = ?")?;
            let ids = stmt.query_map([id], |row| row.get(0))?;
            ids.collect::<Result<Vec<i64>>>()?
        };
        for child_id in children {
            self.delete_playlist(child_id)?;
        }
        // Delete the playlist/folder itself
        self.conn.execute("DELETE FROM playlists WHERE id = ?", [id])?;
        Ok(())
    }

    /// Get tracks in a playlist (with analysis data), ordered by position.
    pub fn get_playlist_tracks(&self, playlist_id: i64) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM playlist_tracks pt
             JOIN tracks t ON pt.track_id = t.id
             LEFT JOIN track_analysis a ON t.id = a.track_id
             WHERE pt.playlist_id = ?
             ORDER BY pt.position, t.id"
        )?;

        let rows = stmt.query_map([playlist_id], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    /// Add a track to a playlist at the end.
    pub fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<()> {
        let max_pos: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM playlist_tracks WHERE playlist_id = ?",
            [playlist_id],
            |row| row.get(0),
        )?;

        self.conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            params![playlist_id, track_id, max_pos + 1],
        )?;
        Ok(())
    }

    /// Remove a track from a playlist.
    pub fn remove_track_from_playlist(&self, playlist_id: i64, track_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
            params![playlist_id, track_id],
        )?;
        Ok(())
    }

    /// Count tracks in a playlist.
    pub fn count_playlist_tracks(&self, playlist_id: i64) -> Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?",
            [playlist_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get all tracks with their analysis data (BPM, key, etc.) via LEFT JOIN.
    /// Returns (Track, Option<bpm>, Option<bpm_confidence>, Option<musical_key>, Option<key_confidence>) tuples.
    pub fn get_all_tracks_with_analysis(&self) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM tracks t
             LEFT JOIN track_analysis a ON t.id = a.track_id
             ORDER BY t.id"
        )?;

        let rows = stmt.query_map([], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    /// Get a paginated subset of tracks with analysis data.
    /// PERFORMANCE: Use this instead of get_all_tracks_with_analysis() for large libraries.
    /// Returns (Track, Option<bpm>, Option<bpm_confidence>, Option<musical_key>, Option<key_confidence>) tuples.
    pub fn get_tracks_with_analysis_paginated(&self, limit: i64, offset: i64) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM tracks t
             LEFT JOIN track_analysis a ON t.id = a.track_id
             ORDER BY t.id
             LIMIT ? OFFSET ?"
        )?;

        let rows = stmt.query_map([limit, offset], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    // --- Track Analysis operations ---

    /// Save BPM analysis result for a track.
    /// Uses upsert: inserts a new row or updates existing BPM fields.
    pub fn save_bpm_analysis(&self, track_id: i64, bpm: f64, bpm_confidence: f64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO track_analysis (track_id, bpm, bpm_confidence, analyzed_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(track_id) DO UPDATE SET
                bpm = excluded.bpm,
                bpm_confidence = excluded.bpm_confidence,
                analyzed_at = excluded.analyzed_at",
            params![track_id, bpm, bpm_confidence],
        )?;
        Ok(())
    }

    /// Get BPM analysis result for a track. Returns (bpm, confidence) or None if not analyzed.
    pub fn get_bpm_analysis(&self, track_id: i64) -> Result<Option<(f64, f64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT bpm, bpm_confidence FROM track_analysis WHERE track_id = ?"
        )?;

        let result = stmt.query_row([track_id], |row| {
            let bpm: Option<f64> = row.get(0)?;
            let confidence: Option<f64> = row.get(1)?;
            Ok((bpm, confidence))
        });

        match result {
            Ok((Some(bpm), Some(conf))) => Ok(Some((bpm, conf))),
            Ok(_) => Ok(None), // Row exists but fields are NULL
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Get full track analysis record for a track. Returns None if not analyzed.
    /// This struct will grow as more analysis types are added (key, loudness, etc.)
    pub fn get_track_analysis(&self, track_id: i64) -> Result<Option<TrackAnalysis>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id, bpm, bpm_confidence, musical_key, key_confidence,
                    loudness_lufs, dynamic_range, spectral_centroid, analyzed_at
             FROM track_analysis WHERE track_id = ?"
        )?;

        let result = stmt.query_row([track_id], |row| {
            Ok(TrackAnalysis {
                track_id: row.get(0)?,
                bpm: row.get(1)?,
                bpm_confidence: row.get(2)?,
                musical_key: row.get(3)?,
                key_confidence: row.get(4)?,
                loudness_lufs: row.get(5)?,
                dynamic_range: row.get(6)?,
                spectral_centroid: row.get(7)?,
                analyzed_at: row.get(8)?,
            })
        });

        match result {
            Ok(analysis) => Ok(Some(analysis)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Check if a track has BPM analysis data
    pub fn has_bpm_analysis(&self, track_id: i64) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM track_analysis WHERE track_id = ? AND bpm IS NOT NULL",
            [track_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    // --- Key Analysis operations ---

    /// Save key analysis result for a track.
    /// Uses upsert: inserts a new row or updates existing key fields.
    /// Does NOT overwrite BPM fields if they already exist — only touches key columns.
    pub fn save_key_analysis(&self, track_id: i64, musical_key: &str, key_confidence: f64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO track_analysis (track_id, musical_key, key_confidence, analyzed_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(track_id) DO UPDATE SET
                musical_key = excluded.musical_key,
                key_confidence = excluded.key_confidence,
                analyzed_at = excluded.analyzed_at",
            params![track_id, musical_key, key_confidence],
        )?;
        Ok(())
    }

    /// Get key analysis result for a track. Returns (key, confidence) or None if not analyzed.
    pub fn get_key_analysis(&self, track_id: i64) -> Result<Option<(String, f64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT musical_key, key_confidence FROM track_analysis WHERE track_id = ?"
        )?;

        let result = stmt.query_row([track_id], |row| {
            let key: Option<String> = row.get(0)?;
            let confidence: Option<f64> = row.get(1)?;
            Ok((key, confidence))
        });

        match result {
            Ok((Some(key), Some(conf))) => Ok(Some((key, conf))),
            Ok(_) => Ok(None), // Row exists but key fields are NULL
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Check if a track has key analysis data
    pub fn has_key_analysis(&self, track_id: i64) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM track_analysis WHERE track_id = ? AND musical_key IS NOT NULL",
            [track_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    // --- Waveform Analysis operations ---

    /// Save waveform data for a track.
    /// Uses upsert: inserts a new row or updates existing waveform fields.
    /// Does NOT overwrite BPM/key fields if they already exist — only touches waveform columns.
    pub fn save_waveform(&self, track_id: i64, overview_blob: &[u8], detail_blob: &[u8]) -> Result<()> {
        self.conn.execute(
            "INSERT INTO track_analysis (track_id, waveform_overview, waveform_detail, analyzed_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(track_id) DO UPDATE SET
                waveform_overview = excluded.waveform_overview,
                waveform_detail = excluded.waveform_detail,
                analyzed_at = excluded.analyzed_at",
            rusqlite::params![track_id, overview_blob, detail_blob],
        )?;
        Ok(())
    }

    /// Get waveform data for a track. Returns (overview_blob, detail_blob) or None if not available.
    /// Level parameter: "overview" or "detail"
    pub fn get_waveform(&self, track_id: i64, level: &str) -> Result<Option<Vec<u8>>> {
        let column = match level {
            "overview" => "waveform_overview",
            "detail" => "waveform_detail",
            _ => return Err(rusqlite::Error::InvalidParameterName(format!("Invalid waveform level: {}", level))),
        };

        let query = format!("SELECT {} FROM track_analysis WHERE track_id = ?", column);
        let mut stmt = self.conn.prepare(&query)?;

        let result = stmt.query_row([track_id], |row| {
            let blob: Option<Vec<u8>> = row.get(0)?;
            Ok(blob)
        });

        match result {
            Ok(Some(blob)) => Ok(Some(blob)),
            Ok(None) => Ok(None),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Check if a track has waveform data
    pub fn has_waveform(&self, track_id: i64) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM track_analysis WHERE track_id = ? AND waveform_overview IS NOT NULL",
            [track_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Check if a track with the given file_path already exists in the database.
    /// Used to skip re-importing files that are already tracked.
    pub fn track_exists_with_path(&self, file_path: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE file_path = ?",
            [file_path],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Get all file paths currently in the database.
    /// Used for fast batch existence checks during directory scanning.
    pub fn get_all_file_paths(&self) -> Result<std::collections::HashSet<String>> {
        let mut stmt = self.conn.prepare("SELECT file_path FROM tracks")?;
        let paths = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut set = std::collections::HashSet::new();
        for path in paths {
            if let Ok(p) = path {
                set.insert(p);
            }
        }
        Ok(set)
    }

    /// Check if a track with the given file_hash already exists in the database.
    /// Used to prevent importing duplicate content at different file paths.
    pub fn track_exists_with_hash(&self, file_hash: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE file_hash = ?",
            [file_hash],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Remove duplicate tracks.
    /// Detection methods (in order):
    /// 1. Same file_hash (excluding 'unknown') - exact same file content
    /// 2. Same file name + file size - catches identical copies at different paths
    /// NOTE: We do NOT dedupe by title alone - different artists can have songs with the same name.
    /// Keeps the track with the lowest id (earliest import) for each duplicate group.
    /// Also cleans up related analysis data and playlist associations for removed tracks.
    /// Returns the number of deleted tracks.
    pub fn remove_duplicate_tracks(&self) -> Result<usize> {
        let mut dup_ids: Vec<i64> = Vec::new();

        // 1. Find duplicates by file_hash (excluding 'unknown')
        {
            let mut stmt = self.conn.prepare(
                "SELECT t1.id, t1.file_path, t1.file_hash FROM tracks t1
                 INNER JOIN tracks t2 ON t1.file_hash = t2.file_hash
                 WHERE t1.id > t2.id AND t1.file_hash != 'unknown'"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
            })?;

            for row in rows {
                let (id, path, hash) = row?;
                println!("  Duplicate (by hash): ID {} - {} (hash: {}...)", id, path, &hash[..8.min(hash.len())]);
                dup_ids.push(id);
            }

            if !dup_ids.is_empty() {
                println!("Found {} duplicates by file_hash", dup_ids.len());
            }
        }

        // 2. Find duplicates by file name + file size (catches copies with 'unknown' hash)
        {
            let all_tracks = self.get_all_tracks()?;
            // Key: (lowercase filename, file_size) -> first track ID with this key
            let mut seen: std::collections::HashMap<(String, i64), i64> = std::collections::HashMap::new();
            let mut filename_dups = 0;

            for track in &all_tracks {
                if let (Some(id), Some(size)) = (track.id, track.file_size) {
                    // Skip if already marked as duplicate by hash
                    if dup_ids.contains(&id) {
                        continue;
                    }

                    // Extract filename from path
                    let filename = track.file_path
                        .rsplit('/')
                        .next()
                        .unwrap_or(&track.file_path)
                        .to_lowercase();

                    let key = (filename.clone(), size);

                    if let Some(&first_id) = seen.get(&key) {
                        // This is a duplicate - keep the one with lower ID
                        if id > first_id {
                            println!("  Duplicate (by filename+size): ID {} - {} (same as ID {})", id, track.file_path, first_id);
                            dup_ids.push(id);
                            filename_dups += 1;
                        }
                    } else {
                        seen.insert(key, id);
                    }
                }
            }

            if filename_dups > 0 {
                println!("Found {} duplicates by filename+size", filename_dups);
            }
        }

        // NOTE: We intentionally do NOT dedupe by title alone.
        // Different artists can have songs with the same name, and users may have
        // different versions/remixes of the same track - these are NOT duplicates.

        if dup_ids.is_empty() {
            println!("No duplicates found");
            return Ok(0);
        }

        let count = dup_ids.len();
        println!("Removing {} duplicate tracks...", count);

        for id in &dup_ids {
            // Remove related data first
            self.conn.execute("DELETE FROM track_analysis WHERE track_id = ?", [id])?;
            self.conn.execute("DELETE FROM playlist_tracks WHERE track_id = ?", [id])?;
            self.conn.execute("DELETE FROM tracks WHERE id = ?", [id])?;
        }

        println!("Successfully removed {} duplicate tracks", count);
        Ok(count)
    }

    /// Count tracks whose file_path starts with a given folder path prefix.
    /// Matches tracks directly in the folder and all subfolders.
    pub fn count_tracks_in_folder(&self, folder_path: &str) -> Result<i64> {
        // Normalize path: remove trailing slash if present
        let normalized = folder_path.trim_end_matches('/');
        // Pattern: folder/% matches anything inside the folder (including nested)
        let pattern = format!("{}/%", normalized);
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE file_path LIKE ?",
            [&pattern],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get tracks in a specific folder (by file_path prefix) with analysis data.
    /// Matches tracks directly in the folder and all subfolders.
    pub fn get_tracks_in_folder_with_analysis(&self, folder_path: &str) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        // Normalize path: remove trailing slash if present
        let normalized = folder_path.trim_end_matches('/');
        // Pattern: folder/% matches anything inside the folder (including nested)
        let pattern = format!("{}/%", normalized);

        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM tracks t
             LEFT JOIN track_analysis a ON t.id = a.track_id
             WHERE t.file_path LIKE ?
             ORDER BY t.id"
        )?;

        let rows = stmt.query_map([&pattern], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    /// Count tracks whose file_path is directly in the given folder (non-recursive, shallow).
    /// Only matches tracks in the immediate folder, not in subfolders.
    pub fn count_tracks_in_folder_shallow(&self, folder_path: &str) -> Result<i64> {
        // Normalize path: remove trailing slash if present
        let normalized = folder_path.trim_end_matches('/');
        let prefix = format!("{}/", normalized);
        let pattern = format!("{}%", prefix);
        
        // Shallow: file_path starts with prefix AND the remainder contains no '/'
        // Using instr(substr(...), '/') = 0 to check if remainder has no slash
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks 
             WHERE file_path LIKE ?1 
             AND instr(substr(file_path, length(?2) + 1), '/') = 0",
            params![&pattern, &prefix],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get tracks directly in a specific folder (non-recursive, shallow) with analysis data.
    /// Only matches tracks in the immediate folder, not in subfolders.
    pub fn get_tracks_in_folder_shallow_with_analysis(&self, folder_path: &str) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        // Normalize path: remove trailing slash if present
        let normalized = folder_path.trim_end_matches('/');
        let prefix = format!("{}/", normalized);
        let pattern = format!("{}%", prefix);

        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM tracks t
             LEFT JOIN track_analysis a ON t.id = a.track_id
             WHERE t.file_path LIKE ?1
             AND instr(substr(t.file_path, length(?2) + 1), '/') = 0
             ORDER BY t.id"
        )?;

        let rows = stmt.query_map(params![&pattern, &prefix], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    /// Normalize all file paths in the database (remove double slashes, trailing slashes).
    /// Returns the number of tracks updated.
    pub fn normalize_all_file_paths(&self) -> Result<usize> {
        let all_tracks = self.get_all_tracks()?;
        let mut updated = 0;

        for track in all_tracks {
            let track_id = match track.id {
                Some(id) => id,
                None => continue,
            };

            fn normalize_path_for_db(input: &str) -> String {
                let mut s = input.trim().to_string();
                if s.is_empty() {
                    return s;
                }

                // Strip file:// if it accidentally got stored
                if let Some(rest) = s.strip_prefix("file://") {
                    s = rest.to_string();
                }

                // Normalize separators
                s = s.replace('\\', "/");

                // Collapse repeated slashes (safe for local absolute paths we store)
                let mut out = String::with_capacity(s.len());
                let mut prev_slash = false;
                for ch in s.chars() {
                    if ch == '/' {
                        if prev_slash {
                            continue;
                        }
                        prev_slash = true;
                        out.push(ch);
                    } else {
                        prev_slash = false;
                        out.push(ch);
                    }
                }
                s = out;

                // Remove trailing slash
                while s.ends_with('/') && s.len() > 1 {
                    s.pop();
                }

                // Ensure absolute path on unix-like systems (macOS/Linux)
                #[cfg(not(target_os = "windows"))]
                {
                    if !s.starts_with('/') {
                        s = format!("/{}", s);
                    }
                }

                s
            }

            let normalized = normalize_path_for_db(&track.file_path);

            // Only update if the path actually changed
            if normalized != track.file_path {
                self.conn.execute(
                    "UPDATE tracks SET file_path = ? WHERE id = ?",
                    params![&normalized, track_id],
                )?;
                updated += 1;
            }
        }

        Ok(updated)
    }

    /// Remove tracks that are NOT under any of the given library folder paths.
    /// Used to clean up stray tracks (e.g., from Viber or other apps) that were accidentally imported.
    /// Returns the number of deleted tracks.
    /// OPTIMIZED: Uses pure SQL instead of loading all tracks into memory.
    pub fn remove_tracks_not_in_folders(&self, library_folders: &[String]) -> Result<usize> {
        if library_folders.is_empty() {
            // No folders configured - delete ALL tracks
            self.conn.execute("DELETE FROM track_analysis WHERE track_id IN (SELECT id FROM tracks)", [])?;
            self.conn.execute("DELETE FROM playlist_tracks WHERE track_id IN (SELECT id FROM tracks)", [])?;
            let count = self.conn.execute("DELETE FROM tracks", [])?;
            return Ok(count);
        }

        // Build SQL WHERE clause to find tracks NOT in any library folder
        // Use "NOT (file_path LIKE 'folder1/%' OR file_path LIKE 'folder2/%' ...)"
        let mut conditions = Vec::new();
        let mut params: Vec<String> = Vec::new();

        for folder in library_folders {
            let folder_normalized = if folder.ends_with('/') {
                folder.to_string()
            } else {
                format!("{}/", folder)
            };
            conditions.push(format!("file_path LIKE ?{}", params.len() + 1));
            params.push(format!("{}%", folder_normalized));
        }

        let where_clause = format!("NOT ({})", conditions.join(" OR "));

        // Delete using SQL only - no need to load tracks into memory
        let delete_query = format!(
            "DELETE FROM tracks WHERE id IN (SELECT id FROM tracks WHERE {})",
            where_clause
        );

        // Delete related data first
        let analysis_query = format!(
            "DELETE FROM track_analysis WHERE track_id IN (SELECT id FROM tracks WHERE {})",
            where_clause
        );
        let playlist_query = format!(
            "DELETE FROM playlist_tracks WHERE track_id IN (SELECT id FROM tracks WHERE {})",
            where_clause
        );

        // Execute deletions
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

        self.conn.execute(&analysis_query, rusqlite::params_from_iter(params_refs.iter()))?;
        self.conn.execute(&playlist_query, rusqlite::params_from_iter(params_refs.iter()))?;
        let deleted = self.conn.execute(&delete_query, rusqlite::params_from_iter(params_refs.iter()))?;

        Ok(deleted)
    }

    /// Search tracks by query string across text fields (title, artist, album, label, comment, file_path, genre)
    /// Returns all tracks where any text field contains the query (case-insensitive)
    pub fn search_tracks(&self, query: &str) -> Result<Vec<Track>> {
        let like_pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, file_hash, title, artist, album, album_artist,
                    track_number, year, label, duration_ms, file_format,
                    bitrate, sample_rate, file_size, date_added, date_modified,
                    play_count, rating, comment, artwork_path, genre, genre_source
             FROM tracks
             WHERE title LIKE ?1 COLLATE NOCASE
                OR artist LIKE ?1 COLLATE NOCASE
                OR album LIKE ?1 COLLATE NOCASE
                OR label LIKE ?1 COLLATE NOCASE
                OR comment LIKE ?1 COLLATE NOCASE
                OR file_path LIKE ?1 COLLATE NOCASE
                OR genre LIKE ?1 COLLATE NOCASE
             ORDER BY id"
        )?;

        let tracks = stmt.query_map([&like_pattern], |row| {
            Ok(Track {
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
            })
        })?;

        tracks.collect()
    }

    // --- Genre operations ---

    /// Save genre for a track with specified source.
    /// If source is 'user', always overwrites. If source is 'tag' or 'ai', only saves if no existing user genre.
    pub fn save_track_genre(&self, track_id: i64, genre: &str, source: &str) -> Result<()> {
        // Check existing genre source
        let existing: Option<(String, String)> = self.conn.query_row(
            "SELECT genre, genre_source FROM tracks WHERE id = ?",
            [track_id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .ok()
        .and_then(|(g, s)| match (g, s) {
            (Some(genre), Some(source)) => Some((genre, source)),
            _ => None,
        });

        // Priority: user > tag > ai
        // If existing source is 'user', only overwrite if new source is also 'user'
        if let Some((_, existing_source)) = existing {
            if existing_source == "user" && source != "user" {
                return Ok(()); // Don't overwrite user genre with tag or ai
            }
        }

        self.conn.execute(
            "UPDATE tracks SET genre = ?, genre_source = ? WHERE id = ?",
            params![genre, source, track_id],
        )?;
        Ok(())
    }

    /// Get genre and source for a track
    pub fn get_track_genre(&self, track_id: i64) -> Result<Option<(String, String)>> {
        let result = self.conn.query_row(
            "SELECT genre, genre_source FROM tracks WHERE id = ?",
            [track_id],
            |row| {
                let genre: Option<String> = row.get(0)?;
                let source: Option<String> = row.get(1)?;
                Ok((genre, source))
            },
        );

        match result {
            Ok((Some(genre), Some(source))) => Ok(Some((genre, source))),
            Ok(_) => Ok(None),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Clear genre for a track
    pub fn clear_track_genre(&self, track_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE tracks SET genre = NULL, genre_source = NULL WHERE id = ?",
            [track_id],
        )?;
        Ok(())
    }

    /// Get all genres with track counts
    pub fn get_all_genres_with_counts(&self) -> Result<Vec<(String, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT genre, COUNT(*) FROM tracks
             WHERE genre IS NOT NULL
             GROUP BY genre
             ORDER BY genre"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;

        rows.collect()
    }

    /// Get tracks by genre (with analysis data)
    pub fn get_tracks_by_genre(&self, genre: &str) -> Result<Vec<(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
                    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
                    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
                    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
                    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence
             FROM tracks t
             LEFT JOIN track_analysis a ON t.id = a.track_id
             WHERE t.genre = ?
             ORDER BY t.id"
        )?;

        let rows = stmt.query_map([genre], |row| {
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
            let bpm: Option<f64> = row.get(23)?;
            let bpm_conf: Option<f64> = row.get(24)?;
            let musical_key: Option<String> = row.get(25)?;
            let key_conf: Option<f64> = row.get(26)?;
            Ok((track, bpm, bpm_conf, musical_key, key_conf))
        })?;

        rows.collect()
    }

    // --- Genre Definition operations ---

    /// Create a new genre definition. Returns the new genre ID.
    pub fn create_genre_definition(&self, name: &str, color: Option<&str>) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO genre_definitions (name, color) VALUES (?, ?)",
            params![name, color],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get all genre definitions, ordered by sort_order then name
    pub fn get_all_genre_definitions(&self) -> Result<Vec<GenreDefinition>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, color, sort_order
             FROM genre_definitions
             ORDER BY sort_order, name"
        )?;

        let genres = stmt.query_map([], |row| {
            Ok(GenreDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })?;

        genres.collect()
    }

    /// Delete a genre definition (does NOT remove genre from tracks)
    pub fn delete_genre_definition(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM genre_definitions WHERE id = ?", [id])?;
        Ok(())
    }

    /// Rename a genre definition and update all tracks with the old name to the new name
    pub fn rename_genre_definition(&self, id: i64, new_name: &str) -> Result<()> {
        // Get old name
        let old_name: String = self.conn.query_row(
            "SELECT name FROM genre_definitions WHERE id = ?",
            [id],
            |row| row.get(0),
        )?;

        // Update definition
        self.conn.execute(
            "UPDATE genre_definitions SET name = ? WHERE id = ?",
            params![new_name, id],
        )?;

        // Update all tracks with this genre
        self.conn.execute(
            "UPDATE tracks SET genre = ? WHERE genre = ?",
            params![new_name, old_name],
        )?;

        Ok(())
    }

    /// Bulk set genre for multiple tracks
    pub fn bulk_set_genre(&self, track_ids: &[i64], genre: &str) -> Result<usize> {
        let mut count = 0;
        for &track_id in track_ids {
            self.save_track_genre(track_id, genre, "user")?;
            count += 1;
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_track() -> Track {
        Track {
            id: None,
            file_path: "/path/to/test.mp3".to_string(),
            file_hash: "abc123".to_string(),
            title: Some("Test Track".to_string()),
            artist: Some("Test Artist".to_string()),
            album: Some("Test Album".to_string()),
            album_artist: None,
            track_number: Some(1),
            year: Some(2024),
            label: Some("Test Label".to_string()),
            duration_ms: Some(240000),
            file_format: Some("mp3".to_string()),
            bitrate: Some(320),
            sample_rate: Some(44100),
            file_size: Some(10_000_000),
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

    #[test]
    fn test_database_creation() {
        let db = Database::new_in_memory().expect("Failed to create in-memory database");
        db.run_migrations().expect("Failed to run migrations");
    }

    #[test]
    fn test_create_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let id = db.create_track(&track).expect("Failed to create track");
        
        assert!(id > 0, "Track ID should be greater than 0");
    }

    #[test]
    fn test_read_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let id = db.create_track(&track).unwrap();

        let retrieved = db.get_track(id).expect("Failed to get track");
        
        assert_eq!(retrieved.id, Some(id));
        assert_eq!(retrieved.file_path, track.file_path);
        assert_eq!(retrieved.title, track.title);
        assert_eq!(retrieved.artist, track.artist);
        assert_eq!(retrieved.album, track.album);
    }

    #[test]
    fn test_update_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track = create_test_track();
        let id = db.create_track(&track).unwrap();

        // Update the track
        track.id = Some(id);
        track.title = Some("Updated Title".to_string());
        track.artist = Some("Updated Artist".to_string());
        track.rating = 5;

        db.update_track(&track).expect("Failed to update track");

        let retrieved = db.get_track(id).unwrap();
        assert_eq!(retrieved.title, Some("Updated Title".to_string()));
        assert_eq!(retrieved.artist, Some("Updated Artist".to_string()));
        assert_eq!(retrieved.rating, 5);
    }

    #[test]
    fn test_delete_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let id = db.create_track(&track).unwrap();

        // Verify track exists
        assert!(db.get_track(id).is_ok());

        // Delete track
        db.delete_track(id).expect("Failed to delete track");

        // Verify track no longer exists
        assert!(db.get_track(id).is_err());
    }

    #[test]
    fn test_get_all_tracks() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create multiple tracks
        let mut track1 = create_test_track();
        track1.file_path = "/path/to/track1.mp3".to_string();
        
        let mut track2 = create_test_track();
        track2.file_path = "/path/to/track2.mp3".to_string();
        track2.title = Some("Track 2".to_string());
        
        let mut track3 = create_test_track();
        track3.file_path = "/path/to/track3.mp3".to_string();
        track3.title = Some("Track 3".to_string());

        db.create_track(&track1).unwrap();
        db.create_track(&track2).unwrap();
        db.create_track(&track3).unwrap();

        let all_tracks = db.get_all_tracks().expect("Failed to get all tracks");
        assert_eq!(all_tracks.len(), 3);
    }

    #[test]
    fn test_count_tracks() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        assert_eq!(db.count_tracks().unwrap(), 0);

        let track = create_test_track();
        db.create_track(&track).unwrap();
        assert_eq!(db.count_tracks().unwrap(), 1);

        let mut track2 = create_test_track();
        track2.file_path = "/path/to/track2.mp3".to_string();
        db.create_track(&track2).unwrap();
        assert_eq!(db.count_tracks().unwrap(), 2);
    }

    #[test]
    fn test_unique_file_path_constraint() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        db.create_track(&track).expect("First insert should succeed");

        // Try to insert same file_path again - should fail
        let result = db.create_track(&track);
        assert!(result.is_err(), "Duplicate file_path should fail");
    }

    #[test]
    fn test_search_tracks_by_title() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track1 = create_test_track();
        track1.file_path = "/path/to/deep_tech.mp3".to_string();
        track1.title = Some("Deep Tech Groove".to_string());

        let mut track2 = create_test_track();
        track2.file_path = "/path/to/minimal.mp3".to_string();
        track2.title = Some("Minimal Vibes".to_string());

        let mut track3 = create_test_track();
        track3.file_path = "/path/to/tech_house.mp3".to_string();
        track3.title = Some("Tech House Banger".to_string());

        db.create_track(&track1).unwrap();
        db.create_track(&track2).unwrap();
        db.create_track(&track3).unwrap();

        // Search for "tech" — should find track1 and track3
        let results = db.search_tracks("tech").unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().any(|t| t.title == Some("Deep Tech Groove".to_string())));
        assert!(results.iter().any(|t| t.title == Some("Tech House Banger".to_string())));
    }

    #[test]
    fn test_search_tracks_by_artist() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track1 = create_test_track();
        track1.file_path = "/path/to/track1.mp3".to_string();
        track1.artist = Some("Boris Brejcha".to_string());

        let mut track2 = create_test_track();
        track2.file_path = "/path/to/track2.mp3".to_string();
        track2.artist = Some("Stephan Bodzin".to_string());

        db.create_track(&track1).unwrap();
        db.create_track(&track2).unwrap();

        let results = db.search_tracks("boris").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].artist, Some("Boris Brejcha".to_string()));
    }

    #[test]
    fn test_search_tracks_case_insensitive() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track = create_test_track();
        track.title = Some("Progressive House Mix".to_string());
        db.create_track(&track).unwrap();

        // Lowercase search should find uppercase title
        let results = db.search_tracks("progressive").unwrap();
        assert_eq!(results.len(), 1);

        // Uppercase search should also match
        let results = db.search_tracks("PROGRESSIVE").unwrap();
        assert_eq!(results.len(), 1);

        // Mixed case should also match
        let results = db.search_tracks("ProGressive").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_tracks_by_label() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track1 = create_test_track();
        track1.file_path = "/path/to/track1.mp3".to_string();
        track1.label = Some("Toolroom Records".to_string());

        let mut track2 = create_test_track();
        track2.file_path = "/path/to/track2.mp3".to_string();
        track2.label = Some("Drumcode".to_string());

        db.create_track(&track1).unwrap();
        db.create_track(&track2).unwrap();

        let results = db.search_tracks("toolroom").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].label, Some("Toolroom Records".to_string()));
    }

    #[test]
    fn test_search_tracks_by_file_path() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track = create_test_track();
        track.file_path = "/music/tech-house/summer_mix.mp3".to_string();
        db.create_track(&track).unwrap();

        let results = db.search_tracks("tech-house").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_tracks_no_results() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        db.create_track(&track).unwrap();

        let results = db.search_tracks("nonexistent_query_xyz").unwrap();
        assert_eq!(results.len(), 0);
    }

    // --- Settings tests ---

    #[test]
    fn test_get_setting_nonexistent() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let result = db.get_setting("nonexistent_key").unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_set_and_get_setting() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        db.set_setting("theme", "midnight").unwrap();
        let value = db.get_setting("theme").unwrap();
        assert_eq!(value, Some("midnight".to_string()));
    }

    #[test]
    fn test_set_setting_upsert() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Set initial value
        db.set_setting("theme", "midnight").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("midnight".to_string()));

        // Update to new value (upsert)
        db.set_setting("theme", "carbon").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("carbon".to_string()));
    }

    #[test]
    fn test_set_setting_json_value() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Store JSON array of library folders
        let folders = r#"["/Users/test/Music","/Users/test/DJ Sets"]"#;
        db.set_setting("library_folders", folders).unwrap();

        let value = db.get_setting("library_folders").unwrap();
        assert_eq!(value, Some(folders.to_string()));
    }

    #[test]
    fn test_delete_setting() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        db.set_setting("theme", "neon").unwrap();
        assert!(db.get_setting("theme").unwrap().is_some());

        db.delete_setting("theme").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), None);
    }

    #[test]
    fn test_delete_nonexistent_setting() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Should not error when deleting a key that doesn't exist
        let result = db.delete_setting("nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_search_tracks_cross_field() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track1 = create_test_track();
        track1.file_path = "/path/to/track1.mp3".to_string();
        track1.title = Some("Sunset Drive".to_string());
        track1.artist = Some("DJ Horizon".to_string());
        track1.comment = Some("Great for warm-up sets".to_string());

        let mut track2 = create_test_track();
        track2.file_path = "/path/to/track2.mp3".to_string();
        track2.title = Some("Warm Up".to_string());
        track2.artist = Some("Techno Artist".to_string());

        db.create_track(&track1).unwrap();
        db.create_track(&track2).unwrap();

        // "warm" should match track1 (comment) and track2 (title)
        let results = db.search_tracks("warm").unwrap();
        assert_eq!(results.len(), 2);
    }

    // --- Track Analysis tests ---

    #[test]
    fn test_save_and_get_bpm_analysis() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save BPM analysis
        db.save_bpm_analysis(track_id, 126.5, 0.92).unwrap();

        // Read it back
        let result = db.get_bpm_analysis(track_id).unwrap();
        assert!(result.is_some());

        let (bpm, confidence) = result.unwrap();
        assert!((bpm - 126.5).abs() < 0.01);
        assert!((confidence - 0.92).abs() < 0.01);
    }

    #[test]
    fn test_get_bpm_analysis_not_analyzed() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // No analysis saved yet
        let result = db.get_bpm_analysis(track_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_save_bpm_analysis_upsert() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save initial BPM
        db.save_bpm_analysis(track_id, 120.0, 0.80).unwrap();
        let (bpm, _) = db.get_bpm_analysis(track_id).unwrap().unwrap();
        assert!((bpm - 120.0).abs() < 0.01);

        // Update BPM (upsert should overwrite)
        db.save_bpm_analysis(track_id, 126.0, 0.95).unwrap();
        let (bpm, confidence) = db.get_bpm_analysis(track_id).unwrap().unwrap();
        assert!((bpm - 126.0).abs() < 0.01);
        assert!((confidence - 0.95).abs() < 0.01);
    }

    #[test]
    fn test_has_bpm_analysis() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Before analysis
        assert!(!db.has_bpm_analysis(track_id).unwrap());

        // After analysis
        db.save_bpm_analysis(track_id, 128.0, 0.88).unwrap();
        assert!(db.has_bpm_analysis(track_id).unwrap());
    }

    #[test]
    fn test_get_track_analysis_full() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // No analysis yet
        assert!(db.get_track_analysis(track_id).unwrap().is_none());

        // Save BPM analysis (only BPM fields populated, others remain NULL)
        db.save_bpm_analysis(track_id, 125.0, 0.90).unwrap();

        let analysis = db.get_track_analysis(track_id).unwrap().unwrap();
        assert_eq!(analysis.track_id, track_id);
        assert!((analysis.bpm.unwrap() - 125.0).abs() < 0.01);
        assert!((analysis.bpm_confidence.unwrap() - 0.90).abs() < 0.01);
        // Other fields should be None (not yet analyzed)
        assert!(analysis.musical_key.is_none());
        assert!(analysis.loudness_lufs.is_none());
        assert!(analysis.analyzed_at.is_some()); // datetime('now') was set
    }

    // --- Key Analysis tests ---

    #[test]
    fn test_save_and_get_key_analysis() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save key analysis
        db.save_key_analysis(track_id, "8A", 0.85).unwrap();

        // Read it back
        let result = db.get_key_analysis(track_id).unwrap();
        assert!(result.is_some());

        let (key, confidence) = result.unwrap();
        assert_eq!(key, "8A");
        assert!((confidence - 0.85).abs() < 0.01);
    }

    #[test]
    fn test_get_key_analysis_not_analyzed() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // No key analysis saved yet
        let result = db.get_key_analysis(track_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_save_key_analysis_upsert() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save initial key
        db.save_key_analysis(track_id, "11B", 0.70).unwrap();
        let (key, _) = db.get_key_analysis(track_id).unwrap().unwrap();
        assert_eq!(key, "11B");

        // Update key (upsert should overwrite)
        db.save_key_analysis(track_id, "8A", 0.92).unwrap();
        let (key, confidence) = db.get_key_analysis(track_id).unwrap().unwrap();
        assert_eq!(key, "8A");
        assert!((confidence - 0.92).abs() < 0.01);
    }

    #[test]
    fn test_has_key_analysis() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Before analysis
        assert!(!db.has_key_analysis(track_id).unwrap());

        // After analysis
        db.save_key_analysis(track_id, "5A", 0.88).unwrap();
        assert!(db.has_key_analysis(track_id).unwrap());
    }

    #[test]
    fn test_key_analysis_preserves_bpm() {
        // Saving key analysis should NOT overwrite existing BPM data
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save BPM first
        db.save_bpm_analysis(track_id, 128.0, 0.95).unwrap();

        // Save key (should update same row without touching BPM)
        db.save_key_analysis(track_id, "8A", 0.85).unwrap();

        // Both should be present
        let analysis = db.get_track_analysis(track_id).unwrap().unwrap();
        assert!((analysis.bpm.unwrap() - 128.0).abs() < 0.01, "BPM should be preserved");
        assert_eq!(analysis.musical_key.unwrap(), "8A", "Key should be set");
    }

    #[test]
    fn test_bpm_analysis_preserves_key() {
        // Saving BPM analysis should NOT overwrite existing key data
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save key first
        db.save_key_analysis(track_id, "11B", 0.90).unwrap();

        // Save BPM (should update same row without touching key)
        db.save_bpm_analysis(track_id, 126.0, 0.88).unwrap();

        // Both should be present
        let analysis = db.get_track_analysis(track_id).unwrap().unwrap();
        assert_eq!(analysis.musical_key.unwrap(), "11B", "Key should be preserved");
        assert!((analysis.bpm.unwrap() - 126.0).abs() < 0.01, "BPM should be set");
    }

    #[test]
    fn test_get_all_tracks_with_analysis_includes_key() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save both BPM and key
        db.save_bpm_analysis(track_id, 128.0, 0.95).unwrap();
        db.save_key_analysis(track_id, "8A", 0.85).unwrap();

        let rows = db.get_all_tracks_with_analysis().unwrap();
        assert_eq!(rows.len(), 1);

        let (_, bpm, bpm_conf, key, key_conf) = &rows[0];
        assert!((bpm.unwrap() - 128.0).abs() < 0.01);
        assert!(bpm_conf.is_some());
        assert_eq!(key.as_deref(), Some("8A"));
        assert!((key_conf.unwrap() - 0.85).abs() < 0.01);
    }

    // --- Shallow folder query tests ---

    #[test]
    fn test_count_tracks_in_folder_shallow() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create tracks at different nesting levels
        let mut track_a = create_test_track();
        track_a.file_path = "/Root/A.mp3".to_string();
        track_a.file_hash = "hash_a".to_string();
        db.create_track(&track_a).unwrap();

        let mut track_b = create_test_track();
        track_b.file_path = "/Root/Sub/B.mp3".to_string();
        track_b.file_hash = "hash_b".to_string();
        db.create_track(&track_b).unwrap();

        let mut track_c = create_test_track();
        track_c.file_path = "/Root/Sub/Deep/C.mp3".to_string();
        track_c.file_hash = "hash_c".to_string();
        db.create_track(&track_c).unwrap();

        // Shallow count for /Root/Sub should be 1 (only B.mp3, not C.mp3 in Deep/)
        let shallow_count = db.count_tracks_in_folder_shallow("/Root/Sub").unwrap();
        assert_eq!(shallow_count, 1, "Shallow count should only include B.mp3");

        // Recursive count for /Root/Sub should be 2 (B.mp3 and C.mp3)
        let recursive_count = db.count_tracks_in_folder("/Root/Sub").unwrap();
        assert_eq!(recursive_count, 2, "Recursive count should include B.mp3 and C.mp3");

        // Shallow count for /Root should be 1 (only A.mp3)
        let root_shallow = db.count_tracks_in_folder_shallow("/Root").unwrap();
        assert_eq!(root_shallow, 1, "Shallow count at root should only include A.mp3");

        // Recursive count for /Root should be 3 (all tracks)
        let root_recursive = db.count_tracks_in_folder("/Root").unwrap();
        assert_eq!(root_recursive, 3, "Recursive count at root should include all tracks");
    }

    #[test]
    fn test_get_tracks_in_folder_shallow() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create tracks at different nesting levels
        let mut track_a = create_test_track();
        track_a.file_path = "/Root/A.mp3".to_string();
        track_a.file_hash = "hash_a".to_string();
        track_a.title = Some("Track A".to_string());
        db.create_track(&track_a).unwrap();

        let mut track_b = create_test_track();
        track_b.file_path = "/Root/Sub/B.mp3".to_string();
        track_b.file_hash = "hash_b".to_string();
        track_b.title = Some("Track B".to_string());
        db.create_track(&track_b).unwrap();

        let mut track_c = create_test_track();
        track_c.file_path = "/Root/Sub/Deep/C.mp3".to_string();
        track_c.file_hash = "hash_c".to_string();
        track_c.title = Some("Track C".to_string());
        db.create_track(&track_c).unwrap();

        // Shallow query for /Root/Sub should return only B.mp3
        let shallow_tracks = db.get_tracks_in_folder_shallow_with_analysis("/Root/Sub").unwrap();
        assert_eq!(shallow_tracks.len(), 1, "Should return only 1 track (B.mp3)");
        let (track, _, _, _, _) = &shallow_tracks[0];
        assert_eq!(track.title.as_deref(), Some("Track B"), "Should be Track B");

        // Recursive query for /Root/Sub should return B.mp3 and C.mp3
        let recursive_tracks = db.get_tracks_in_folder_with_analysis("/Root/Sub").unwrap();
        assert_eq!(recursive_tracks.len(), 2, "Should return 2 tracks (B.mp3 and C.mp3)");
    }

    #[test]
    fn test_shallow_folder_with_trailing_slash() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut track = create_test_track();
        track.file_path = "/Music/track.mp3".to_string();
        track.file_hash = "hash1".to_string();
        db.create_track(&track).unwrap();

        // Both with and without trailing slash should work
        let count1 = db.count_tracks_in_folder_shallow("/Music").unwrap();
        let count2 = db.count_tracks_in_folder_shallow("/Music/").unwrap();
        assert_eq!(count1, 1);
        assert_eq!(count2, 1);
    }

    // --- Genre tests ---

    #[test]
    fn test_save_and_get_track_genre() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save genre with 'user' source
        db.save_track_genre(track_id, "Tech House", "user").unwrap();

        // Read it back
        let result = db.get_track_genre(track_id).unwrap();
        assert!(result.is_some());

        let (genre, source) = result.unwrap();
        assert_eq!(genre, "Tech House");
        assert_eq!(source, "user");
    }

    #[test]
    fn test_clear_track_genre() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Save genre
        db.save_track_genre(track_id, "Deep House", "user").unwrap();
        assert!(db.get_track_genre(track_id).unwrap().is_some());

        // Clear genre
        db.clear_track_genre(track_id).unwrap();
        assert!(db.get_track_genre(track_id).unwrap().is_none());
    }

    #[test]
    fn test_genre_source_priority() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();

        // Set genre with 'user' source
        db.save_track_genre(track_id, "Tech House", "user").unwrap();
        let (genre, source) = db.get_track_genre(track_id).unwrap().unwrap();
        assert_eq!(genre, "Tech House");
        assert_eq!(source, "user");

        // Try to overwrite with 'tag' source - should NOT work (user has priority)
        db.save_track_genre(track_id, "Progressive House", "tag").unwrap();
        let (genre, source) = db.get_track_genre(track_id).unwrap().unwrap();
        assert_eq!(genre, "Tech House"); // Should still be the user-assigned genre
        assert_eq!(source, "user");

        // Try to overwrite with 'ai' source - should NOT work (user has priority)
        db.save_track_genre(track_id, "Minimal Techno", "ai").unwrap();
        let (genre, source) = db.get_track_genre(track_id).unwrap().unwrap();
        assert_eq!(genre, "Tech House"); // Should still be the user-assigned genre
        assert_eq!(source, "user");

        // Overwrite with another 'user' source - SHOULD work
        db.save_track_genre(track_id, "Deep Tech", "user").unwrap();
        let (genre, source) = db.get_track_genre(track_id).unwrap().unwrap();
        assert_eq!(genre, "Deep Tech");
        assert_eq!(source, "user");
    }

    #[test]
    fn test_get_all_genres_with_counts() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create tracks with different genres
        let mut track1 = create_test_track();
        track1.file_path = "/track1.mp3".to_string();
        track1.file_hash = "hash1".to_string();
        let id1 = db.create_track(&track1).unwrap();
        db.save_track_genre(id1, "Tech House", "user").unwrap();

        let mut track2 = create_test_track();
        track2.file_path = "/track2.mp3".to_string();
        track2.file_hash = "hash2".to_string();
        let id2 = db.create_track(&track2).unwrap();
        db.save_track_genre(id2, "Tech House", "user").unwrap();

        let mut track3 = create_test_track();
        track3.file_path = "/track3.mp3".to_string();
        track3.file_hash = "hash3".to_string();
        let id3 = db.create_track(&track3).unwrap();
        db.save_track_genre(id3, "Deep House", "tag").unwrap();

        // Get genre counts
        let counts = db.get_all_genres_with_counts().unwrap();
        assert_eq!(counts.len(), 2);

        // Should be ordered alphabetically
        assert_eq!(counts[0].0, "Deep House");
        assert_eq!(counts[0].1, 1);
        assert_eq!(counts[1].0, "Tech House");
        assert_eq!(counts[1].1, 2);
    }

    #[test]
    fn test_get_tracks_by_genre() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create tracks with different genres
        let mut track1 = create_test_track();
        track1.file_path = "/track1.mp3".to_string();
        track1.file_hash = "hash1".to_string();
        track1.title = Some("Track 1".to_string());
        let id1 = db.create_track(&track1).unwrap();
        db.save_track_genre(id1, "Tech House", "user").unwrap();

        let mut track2 = create_test_track();
        track2.file_path = "/track2.mp3".to_string();
        track2.file_hash = "hash2".to_string();
        track2.title = Some("Track 2".to_string());
        let id2 = db.create_track(&track2).unwrap();
        db.save_track_genre(id2, "Deep House", "user").unwrap();

        let mut track3 = create_test_track();
        track3.file_path = "/track3.mp3".to_string();
        track3.file_hash = "hash3".to_string();
        track3.title = Some("Track 3".to_string());
        let id3 = db.create_track(&track3).unwrap();
        db.save_track_genre(id3, "Tech House", "tag").unwrap();

        // Get Tech House tracks
        let tech_house_tracks = db.get_tracks_by_genre("Tech House").unwrap();
        assert_eq!(tech_house_tracks.len(), 2);

        // Get Deep House tracks
        let deep_house_tracks = db.get_tracks_by_genre("Deep House").unwrap();
        assert_eq!(deep_house_tracks.len(), 1);
    }

    #[test]
    fn test_create_genre_definition() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let id = db.create_genre_definition("Tech House", Some("#6366f1")).unwrap();
        assert!(id > 0);

        let genres = db.get_all_genre_definitions().unwrap();
        assert_eq!(genres.len(), 1);
        assert_eq!(genres[0].name, "Tech House");
        assert_eq!(genres[0].color, Some("#6366f1".to_string()));
    }

    #[test]
    fn test_delete_genre_definition() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let id = db.create_genre_definition("Tech House", None).unwrap();
        db.create_genre_definition("Deep House", None).unwrap();

        // Delete one genre
        db.delete_genre_definition(id).unwrap();

        let genres = db.get_all_genre_definitions().unwrap();
        assert_eq!(genres.len(), 1);
        assert_eq!(genres[0].name, "Deep House");
    }

    #[test]
    fn test_rename_genre_definition() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let id = db.create_genre_definition("Tech House", None).unwrap();

        // Create a track with this genre
        let track = create_test_track();
        let track_id = db.create_track(&track).unwrap();
        db.save_track_genre(track_id, "Tech House", "user").unwrap();

        // Rename the genre
        db.rename_genre_definition(id, "Progressive House").unwrap();

        // Check genre definition
        let genres = db.get_all_genre_definitions().unwrap();
        assert_eq!(genres[0].name, "Progressive House");

        // Check track genre was updated
        let (genre, _) = db.get_track_genre(track_id).unwrap().unwrap();
        assert_eq!(genre, "Progressive House");
    }

    #[test]
    fn test_bulk_set_genre() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        // Create multiple tracks
        let mut track1 = create_test_track();
        track1.file_path = "/track1.mp3".to_string();
        track1.file_hash = "hash1".to_string();
        let id1 = db.create_track(&track1).unwrap();

        let mut track2 = create_test_track();
        track2.file_path = "/track2.mp3".to_string();
        track2.file_hash = "hash2".to_string();
        let id2 = db.create_track(&track2).unwrap();

        let mut track3 = create_test_track();
        track3.file_path = "/track3.mp3".to_string();
        track3.file_hash = "hash3".to_string();
        let id3 = db.create_track(&track3).unwrap();

        // Bulk set genre
        let count = db.bulk_set_genre(&[id1, id2, id3], "Tech House").unwrap();
        assert_eq!(count, 3);

        // Verify all tracks have the genre
        assert_eq!(db.get_track_genre(id1).unwrap().unwrap().0, "Tech House");
        assert_eq!(db.get_track_genre(id2).unwrap().unwrap().0, "Tech House");
        assert_eq!(db.get_track_genre(id3).unwrap().unwrap().0, "Tech House");
    }
}
