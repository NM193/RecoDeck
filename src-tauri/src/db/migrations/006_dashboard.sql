-- Migration 006: Dashboard layout + play history
-- Stores user's widget dashboard layout and track play events

CREATE TABLE IF NOT EXISTS play_history (
    id          INTEGER PRIMARY KEY,
    track_id    INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    playlist_id INTEGER,
    played_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_layout (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    layout_json TEXT NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
