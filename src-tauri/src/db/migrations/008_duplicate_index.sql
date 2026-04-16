-- Migration 008: Indexes for duplicate detection
-- Speeds up the passes used by the Duplicates review UI.

CREATE INDEX IF NOT EXISTS idx_tracks_file_hash ON tracks(file_hash);
CREATE INDEX IF NOT EXISTS idx_tracks_title_artist ON tracks(title, artist);
