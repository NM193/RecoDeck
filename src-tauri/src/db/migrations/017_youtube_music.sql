-- src-tauri/src/db/migrations/017_youtube_music.sql
-- Migration 017: the YouTube Music section
--
-- Liked music and the playlists added by link, kept so the YouTube Music view
-- can say which tracks are already in the library. Ownership is not stored: it
-- is worked out against the library every time, as with Spotify.
--
-- Uses CREATE TABLE IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS ytm_tracks (
    video_id    TEXT PRIMARY KEY,
    title       TEXT NOT NULL,           -- as YouTube writes it: "Soulva - Odyssey (Original Mix)"
    channel     TEXT NOT NULL,           -- the video owner's channel: "Extrawelt - Topic"
    duration_ms INTEGER                  -- from `videos`; over 20 minutes is a set, not a track
);

-- 'LM' for Liked music (YouTube's own id for it), otherwise the playlist id.
CREATE TABLE IF NOT EXISTS ytm_lists (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    position       INTEGER NOT NULL,     -- Liked music 0, then playlists in the order they were added
    -- Available items at the last full read, a video listed twice counted
    -- twice. total_results minus this is what YouTube counts but RecoDeck
    -- skipped: deleted and private videos.
    track_count    INTEGER NOT NULL DEFAULT 0,
    total_results  INTEGER,              -- pageInfo.totalResults at the last full read
    first_page_ids TEXT,                 -- JSON array: every video id on page one at the last full read
    full_synced_at INTEGER,              -- unix ms of the last full read; NULL until the first
    -- Unix ms, never empty: a list's first full read sets it, so nothing that
    -- was already in it reads as new.
    last_opened_at INTEGER NOT NULL,
    unavailable_at INTEGER               -- set when the playlist answers 404; cleared when it reads again
);

CREATE TABLE IF NOT EXISTS ytm_list_tracks (
    list_id       TEXT NOT NULL REFERENCES ytm_lists(id) ON DELETE CASCADE,
    -- No cascade, as with Spotify: only videos in no list are ever deleted.
    video_id      TEXT NOT NULL REFERENCES ytm_tracks(video_id),
    added_at      TEXT,                  -- YouTube's snippet.publishedAt: when it was added (ISO)
    first_seen_at INTEGER NOT NULL,      -- RecoDeck's: the sync that first stored this pair (unix ms)
    PRIMARY KEY (list_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_ytm_list_tracks_video ON ytm_list_tracks(video_id);

-- Yes / No answered on a Maybe row. Kept when the video leaves every list, so
-- liking it again does not ask again.
CREATE TABLE IF NOT EXISTS ytm_match_verdicts (
    video_id         TEXT NOT NULL,
    library_track_id INTEGER NOT NULL,
    verdict          TEXT NOT NULL CHECK (verdict IN ('yes', 'no')),
    PRIMARY KEY (video_id, library_track_id)
);

-- As with Spotify: tracks.id is reused once the highest row is deleted, so a
-- deleted file's verdicts go with it.
CREATE TRIGGER IF NOT EXISTS trg_ytm_verdicts_track_deleted
AFTER DELETE ON tracks
BEGIN
    DELETE FROM ytm_match_verdicts WHERE library_track_id = OLD.id;
END;
