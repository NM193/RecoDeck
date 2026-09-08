-- Migration 012: DJs watched for new sets
--
-- A DJ is not a channel. Mixmag, Boiler Room and Cercle are hosts; the DJ is in
-- the title of what they publish, which is why sets are already filed by DJ
-- rather than by channel. Following a DJ therefore cannot use the uploads
-- listing that makes a channel check cost a unit or two — the only call that
-- finds a set on a channel nobody follows is `search`, at 100 units.
--
-- That factor of a hundred is the whole design. Never is the default, the
-- interval is per DJ, and the automatic run keeps a reserve of the day's quota
-- it will not spend.

CREATE TABLE IF NOT EXISTS yt_watched_djs (
    -- Lower-cased name, so "Solomun" and "solomun" are one entry.
    name_key             TEXT PRIMARY KEY,
    -- What the user typed, which is what gets shown and searched for.
    display_name         TEXT NOT NULL,
    -- 0 never, 24 daily, 168 weekly. Never is the default on purpose.
    check_interval_hours INTEGER NOT NULL DEFAULT 0,
    last_checked         TEXT,
    added_at             TEXT DEFAULT (datetime('now'))
);
