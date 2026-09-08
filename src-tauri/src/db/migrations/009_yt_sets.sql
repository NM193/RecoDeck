-- Migration 009: YouTube set tracklists
--
-- The raw API response is stored alongside the parsed result on purpose. It is
-- what lets a saved set reopen at zero quota cost, and what lets an improved
-- parser be re-run over everything already collected — the same reason the
-- standalone tool kept a fixtures/ directory.

CREATE TABLE IF NOT EXISTS yt_sets (
    video_id        TEXT PRIMARY KEY,
    url             TEXT NOT NULL,
    title           TEXT NOT NULL,
    channel         TEXT,
    published_at    TEXT,
    duration_ms     INTEGER,
    fetched_at      TEXT,
    -- Parsed summary, kept for listing and statistics without re-parsing.
    status          TEXT,
    confidence      REAL,
    source_count    INTEGER,
    track_count     INTEGER,
    -- The untouched fetch: { video, comments, fetchedAt }
    raw_json        TEXT NOT NULL,
    added_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_yt_sets_added ON yt_sets(added_at DESC);

-- Hearted tracks, collected across every set.
CREATE TABLE IF NOT EXISTS yt_saved_tracks (
    id              INTEGER PRIMARY KEY,
    video_id        TEXT NOT NULL REFERENCES yt_sets(video_id) ON DELETE CASCADE,
    cue_ms          INTEGER NOT NULL,
    cue             TEXT,
    artist          TEXT,
    title           TEXT NOT NULL,
    mix             TEXT,
    saved_at        TEXT DEFAULT (datetime('now')),
    UNIQUE(video_id, cue_ms, title)
);

CREATE INDEX IF NOT EXISTS idx_yt_saved_saved_at ON yt_saved_tracks(saved_at DESC);

-- Channels being followed for new sets.
CREATE TABLE IF NOT EXISTS yt_channels (
    channel_id      TEXT PRIMARY KEY,
    handle          TEXT,
    title           TEXT,
    uploads_id      TEXT,
    last_checked    TEXT,
    -- Newest upload seen at the last check, so "new" means new to the user.
    last_seen_video TEXT,
    added_at        TEXT DEFAULT (datetime('now'))
);
