-- Migration 019: a playlist's own cover image (Change cover), a file in the
-- covers folder beside the database; NULL draws the default.
ALTER TABLE playlists ADD COLUMN cover_path TEXT;
