-- Migration 020: files of duplicate copies merged away (Duplicates Merge spec).
-- A folder scan treats these paths as already known, so a merged copy whose
-- bytes differ from the kept one is never imported again.
CREATE TABLE IF NOT EXISTS skipped_files (
    file_path      TEXT PRIMARY KEY,
    kept_track_id  INTEGER,            -- the copy it was merged into (may be gone later)
    skipped_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The merge and the modal's per-copy facts look rows up by track; without
-- these every lookup (and every FK check on delete) scans the whole table.
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
