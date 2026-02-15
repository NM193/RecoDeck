-- Migration 002: Add parent_id to playlists for folder hierarchy
-- Folders are playlists with type = 'folder'
-- parent_id allows nesting playlists inside folders
ALTER TABLE playlists ADD COLUMN parent_id INTEGER REFERENCES playlists(id);
