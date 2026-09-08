-- Migration 013: what a DJ search has already turned up
--
-- Without this, "is there anything new" rests entirely on publishedAfter, and
-- a set found but not imported falls through the gap: the next search starts
-- after it and it is never mentioned again. Recording every hit makes novelty a
-- fact about what the user has been shown, not about where a window happened
-- to start.
--
-- It also lets a search be re-run over an overlapping window safely, which is
-- what makes the small safety margin on publishedAfter affordable.

CREATE TABLE IF NOT EXISTS yt_dj_finds (
    name_key      TEXT NOT NULL,
    video_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    channel       TEXT,
    published_at  TEXT,
    first_seen_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (name_key, video_id)
);

CREATE INDEX IF NOT EXISTS idx_yt_dj_finds_seen ON yt_dj_finds(name_key, first_seen_at DESC);
