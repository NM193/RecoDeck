-- Migration 010: parsed tracks of stored sets
--
-- The raw fetch in yt_sets stays the source of truth; this is the parsed result
-- flattened for querying. Without it, "where did I hear this?" and any statistic
-- would mean re-parsing every stored set on every keystroke.
--
-- Rebuilt wholesale whenever a set is processed again, so a better parser simply
-- replaces what the old one produced.

CREATE TABLE IF NOT EXISTS yt_tracks (
    id              INTEGER PRIMARY KEY,
    video_id        TEXT NOT NULL REFERENCES yt_sets(video_id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,
    cue_ms          INTEGER NOT NULL,
    cue             TEXT,
    artist          TEXT,
    title           TEXT NOT NULL,
    mix             TEXT,
    -- A slot nobody named. Kept because "where are the gaps" is a real question.
    is_unknown      INTEGER NOT NULL DEFAULT 0,
    votes           INTEGER,
    source_count    INTEGER,
    -- Normalised forms, so search and cross-set matching do not redo the work.
    artist_norm     TEXT,
    title_norm      TEXT
);

CREATE INDEX IF NOT EXISTS idx_yt_tracks_video ON yt_tracks(video_id);
CREATE INDEX IF NOT EXISTS idx_yt_tracks_title ON yt_tracks(title_norm);
CREATE INDEX IF NOT EXISTS idx_yt_tracks_artist ON yt_tracks(artist_norm);
