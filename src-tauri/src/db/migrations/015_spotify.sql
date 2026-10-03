-- src-tauri/src/db/migrations/015_spotify.sql
-- Migration 015: the Spotify section
--
-- What the user liked and put in playlists on Spotify, kept so the Spotify view
-- can say which of it is already in the library. Ownership itself is not stored:
-- it is worked out against the library every time, so a download turns a row
-- Owned without a sync.
--
-- Uses CREATE TABLE IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS spotify_tracks (
    spotify_id  TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artists     TEXT NOT NULL,           -- display string: "Moreno & Prieto, Sortech"
    album       TEXT,
    duration_ms INTEGER
);

-- 'liked' for Liked Songs, otherwise the Spotify playlist id.
CREATE TABLE IF NOT EXISTS spotify_lists (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    snapshot_id    TEXT,                 -- NULL for Liked Songs
    position       INTEGER NOT NULL,     -- Liked Songs 0, then Spotify's order
    -- The total Spotify last reported, skipped items included. Liked Songs is
    -- read again in full when Spotify's total stops adding up to it.
    track_count    INTEGER NOT NULL DEFAULT 0,
    -- Unix milliseconds, never empty: a list's first sync sets it, so nothing
    -- that already existed reads as new.
    last_opened_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spotify_list_tracks (
    list_id       TEXT NOT NULL REFERENCES spotify_lists(id) ON DELETE CASCADE,
    spotify_id    TEXT NOT NULL REFERENCES spotify_tracks(spotify_id) ON DELETE CASCADE,
    added_at      TEXT,                  -- Spotify's: when it was liked / added (ISO)
    first_seen_at INTEGER NOT NULL,      -- RecoDeck's: the sync that first stored this pair (unix ms)
    PRIMARY KEY (list_id, spotify_id)
);

CREATE INDEX IF NOT EXISTS idx_spotify_list_tracks_track ON spotify_list_tracks(spotify_id);

-- Yes / No answered on a Maybe row, never asked again for the pair. Kept when
-- the Spotify track leaves every list, so a re-like does not ask again. No
-- foreign key to tracks: a deleted file's verdicts are ignored, then removed.
CREATE TABLE IF NOT EXISTS spotify_match_verdicts (
    spotify_id       TEXT NOT NULL,
    library_track_id INTEGER NOT NULL,
    verdict          TEXT NOT NULL CHECK (verdict IN ('yes', 'no')),
    PRIMARY KEY (spotify_id, library_track_id)
);
