-- Migration 004: Performance Indexes
-- Add critical indexes for faster startup and folder queries

-- CRITICAL: Index on file_path for LIKE queries (folder operations)
-- This eliminates full table scans when browsing folders
CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);

-- Additional performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_date_added ON tracks(date_added);
CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating);
