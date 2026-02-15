-- Migration 003: Add genre system
-- Tracks have ONE primary genre from 3 sources: user-assigned, file tag, or AI-predicted
-- Genre source priority: user > tag > ai (user-assigned genre always wins)

-- Add genre and genre_source columns to tracks table
-- ALTER TABLE will fail silently if column already exists (handled by migration runner)
ALTER TABLE tracks ADD COLUMN genre TEXT;
ALTER TABLE tracks ADD COLUMN genre_source TEXT; -- 'user', 'tag', 'ai'

-- Genre definitions table (user's flat taxonomy)
-- Defines which genres exist for dropdowns/sidebar
CREATE TABLE IF NOT EXISTS genre_definitions (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT,  -- hex color for UI display (e.g., '#6366f1')
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- Index for genre filtering
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
