-- Migration 018: which DJ finds have been seen (Home's New sets)
--
-- A video is news while none of its finds is seen. NULL is unseen; opening its
-- set anywhere, or Mark all seen on Home, writes the time. A find is written
-- already seen when its video is in yt_sets then or already has a seen find.
--
-- Everything found before this column existed has been shown in Sets already,
-- so it is marked seen here, once: news starts with the next search. One
-- transaction: the column is what says this ran, so it must not exist
-- without the UPDATE.

BEGIN;

ALTER TABLE yt_dj_finds ADD COLUMN seen_at TEXT;

UPDATE yt_dj_finds SET seen_at = datetime('now');

CREATE INDEX IF NOT EXISTS idx_yt_dj_finds_video ON yt_dj_finds(video_id);

COMMIT;
