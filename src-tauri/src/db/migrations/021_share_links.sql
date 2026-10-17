-- Migration 021: playlist share links (spec docs/superpowers/specs/2026-10-16-share-links-design.md).
-- A share link opens one playlist on the companion server until it expires or
-- is stopped. One link per playlist; a deleted playlist takes its link with it.
CREATE TABLE IF NOT EXISTS share_links (
    token       TEXT PRIMARY KEY,                -- 32 random bytes, hex (server::generate_token)
    playlist_id INTEGER NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE,
    days        INTEGER NOT NULL,                -- 1, 7 or 30: the duration last picked
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at  INTEGER NOT NULL                 -- unix seconds
);
