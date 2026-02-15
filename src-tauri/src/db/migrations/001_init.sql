-- RecoDeck Initial Database Schema
-- Migration 001: Core tables for tracks, analysis, AI, playlists, and settings
-- Uses IF NOT EXISTS so migrations are idempotent (safe to re-run on persistent DB)

-- Core track data
CREATE TABLE IF NOT EXISTS tracks (
    id              INTEGER PRIMARY KEY,
    file_path       TEXT NOT NULL UNIQUE,
    file_hash       TEXT NOT NULL,           -- For detecting moves/changes
    title           TEXT,
    artist          TEXT,
    album           TEXT,
    album_artist    TEXT,
    track_number    INTEGER,
    year            INTEGER,
    label           TEXT,                    -- Record label
    duration_ms     INTEGER,
    file_format     TEXT,                    -- mp3, flac, wav, aiff
    bitrate         INTEGER,
    sample_rate     INTEGER,
    file_size       INTEGER,
    date_added      TEXT DEFAULT (datetime('now')),
    date_modified   TEXT,
    play_count      INTEGER DEFAULT 0,
    rating          INTEGER DEFAULT 0,       -- 0-5
    comment         TEXT,
    artwork_path    TEXT                     -- Extracted cover art cache
);

-- Audio fingerprint for identification & duplicate detection
CREATE TABLE IF NOT EXISTS track_fingerprints (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    chromaprint     TEXT NOT NULL,           -- Chromaprint fingerprint string
    acoustid        TEXT,                    -- AcoustID identifier (if looked up)
    musicbrainz_id  TEXT,                    -- MusicBrainz recording ID (if resolved)
    fingerprinted_at TEXT
);

-- DSP analysis results
CREATE TABLE IF NOT EXISTS track_analysis (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    bpm             REAL,
    bpm_confidence  REAL,                    -- 0.0-1.0
    musical_key     TEXT,                    -- e.g., "8A" (Camelot) or "Am"
    key_confidence  REAL,
    loudness_lufs   REAL,                    -- Integrated loudness
    dynamic_range   REAL,                    -- LRA (loudness range)
    spectral_centroid REAL,                  -- Brightness indicator
    waveform_overview BLOB,                  -- Downsampled peaks for overview
    waveform_detail BLOB,                    -- Higher-res peaks for zoom
    spectrogram_data BLOB,                   -- Mel spectrogram for UI visualization
    analyzed_at     TEXT
);

-- AI deep analysis results
CREATE TABLE IF NOT EXISTS track_deep_analysis (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    danceability    REAL,                    -- 0.0-1.0
    energy_arousal  REAL,                    -- 0.0-1.0 (calm → energetic)
    valence         REAL,                    -- 0.0-1.0 (sad → happy)
    aggressiveness  REAL,                    -- 0.0-1.0 (relaxed → aggressive)
    is_vocal        BOOLEAN,                 -- Has vocals?
    vocal_confidence REAL,
    model_version   TEXT,
    analyzed_at     TEXT
);

-- AI embeddings for similarity search
CREATE TABLE IF NOT EXISTS track_embeddings (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    embedding       BLOB,                    -- Float32 vector (512-dim from Effnet-Discogs)
    model_version   TEXT,
    created_at      TEXT
);

-- Discogs style predictions (400 styles, store top N per track)
CREATE TABLE IF NOT EXISTS track_discogs_styles (
    track_id        INTEGER REFERENCES tracks(id),
    style           TEXT,                    -- e.g., "Electronic---Tech House"
    confidence      REAL,
    PRIMARY KEY (track_id, style)
);

-- Detected instruments
CREATE TABLE IF NOT EXISTS track_instruments (
    track_id        INTEGER REFERENCES tracks(id),
    instrument      TEXT,
    confidence      REAL,
    PRIMARY KEY (track_id, instrument)
);

-- User genre labels + AI predictions (custom taxonomy)
CREATE TABLE IF NOT EXISTS track_genres (
    track_id        INTEGER REFERENCES tracks(id),
    genre           TEXT,
    confidence      REAL,
    is_user_label   BOOLEAN DEFAULT FALSE,   -- TRUE = user confirmed, FALSE = AI predicted
    PRIMARY KEY (track_id, genre)
);

-- Flexible tag system
CREATE TABLE IF NOT EXISTS tags (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT,
    category        TEXT                     -- e.g., "mood", "energy", "venue", "vibe"
);

CREATE TABLE IF NOT EXISTS track_tags (
    track_id        INTEGER REFERENCES tracks(id),
    tag_id          INTEGER REFERENCES tags(id),
    PRIMARY KEY (track_id, tag_id)
);

-- Playlists (manual, smart, and AI-generated)
CREATE TABLE IF NOT EXISTS playlists (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT DEFAULT 'manual',   -- 'manual', 'smart', 'ai_generated'
    smart_rules     TEXT,                    -- JSON rules for smart playlists
    ai_prompt       TEXT,                    -- Original prompt for AI-generated playlists
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id     INTEGER REFERENCES playlists(id),
    track_id        INTEGER REFERENCES tracks(id),
    position        INTEGER,
    PRIMARY KEY (playlist_id, track_id)
);

-- Cue points
CREATE TABLE IF NOT EXISTS cue_points (
    id              INTEGER PRIMARY KEY,
    track_id        INTEGER REFERENCES tracks(id),
    position_ms     INTEGER NOT NULL,
    label           TEXT,
    color           TEXT,
    type            TEXT DEFAULT 'cue'       -- 'cue', 'loop_start', 'loop_end'
);

-- AI chat history (for playlist generation context)
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id              INTEGER PRIMARY KEY,
    role            TEXT NOT NULL,            -- 'user' or 'assistant'
    content         TEXT NOT NULL,
    playlist_id     INTEGER REFERENCES playlists(id),  -- If a playlist was generated
    created_at      TEXT DEFAULT (datetime('now'))
);

-- App settings & theme preferences
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT                     -- JSON value
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracks_file_hash ON tracks(file_hash);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_label ON tracks(label);
CREATE INDEX IF NOT EXISTS idx_analysis_bpm ON track_analysis(bpm);
CREATE INDEX IF NOT EXISTS idx_analysis_key ON track_analysis(musical_key);
CREATE INDEX IF NOT EXISTS idx_deep_danceability ON track_deep_analysis(danceability);
CREATE INDEX IF NOT EXISTS idx_deep_vocal ON track_deep_analysis(is_vocal);
CREATE INDEX IF NOT EXISTS idx_discogs_style ON track_discogs_styles(style);
CREATE INDEX IF NOT EXISTS idx_discogs_confidence ON track_discogs_styles(track_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_instruments ON track_instruments(instrument);
CREATE INDEX IF NOT EXISTS idx_genres_genre ON track_genres(genre);
CREATE INDEX IF NOT EXISTS idx_tags ON track_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_fingerprints_acoustid ON track_fingerprints(acoustid);
CREATE INDEX IF NOT EXISTS idx_fingerprints_mbid ON track_fingerprints(musicbrainz_id);
