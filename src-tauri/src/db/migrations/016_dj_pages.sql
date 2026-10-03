-- src-tauri/src/db/migrations/016_dj_pages.sql
-- Migration 016: DJ pages
--
-- One page per DJ name, keyed like watched DJs (`trim().to_lowercase()`). The
-- profile says which Spotify artist and which Resident Advisor artist the name
-- means; the other tables cache what was fetched for it. Sets and plays are not
-- stored here: they come from the saved sets every time.
--
-- Uses CREATE TABLE IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS dj_profiles (
    name_key              TEXT PRIMARY KEY,
    display_name          TEXT NOT NULL,
    -- NULL with spotify_manual = 1 means the user said "none of these".
    spotify_artist_id     TEXT,
    -- 1 when picked by hand or from a Spotify card: never replaced automatically.
    spotify_manual        INTEGER NOT NULL DEFAULT 0,
    spotify_image_url     TEXT,
    genres                TEXT,                  -- JSON array of strings
    ra_artist_id          TEXT,
    ra_slug               TEXT,                  -- the `ra.co/dj/<slug>` part
    ra_image_url          TEXT,
    ra_manual             INTEGER NOT NULL DEFAULT 0,
    -- Unix ms. Spotify's is written only when a fetch finished every release.
    spotify_synced_at     INTEGER,
    ra_synced_at          INTEGER,
    -- How many of the newest appears-on / compilation releases are fetched.
    -- "Load older releases" raises it by 150.
    spotify_appears_limit INTEGER NOT NULL DEFAULT 150,
    -- What Spotify said both groups hold together, at the last listing.
    spotify_appears_total INTEGER
);

-- Every release whose tracks were or will be read. Releases never change, so a
-- release recorded once is never asked for again.
CREATE TABLE IF NOT EXISTS dj_spotify_releases (
    name_key       TEXT NOT NULL,
    release_id     TEXT NOT NULL,
    -- Kept so tracks fetched on a later open still know their album and date.
    name           TEXT NOT NULL,
    release_date   TEXT,
    -- 0 until its tracks are stored: an interrupted fetch continues from these.
    tracks_fetched INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (name_key, release_id)
);

-- Tracks the DJ is credited on (their artist id is among the track's artists).
-- Duplicates across releases are kept here and collapsed when read.
CREATE TABLE IF NOT EXISTS dj_spotify_tracks (
    name_key     TEXT NOT NULL,
    spotify_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    artists      TEXT NOT NULL,                  -- display string: "Ricardo Villalobos, Luciano"
    album        TEXT,
    release_date TEXT,
    isrc         TEXT,
    duration_ms  INTEGER,
    PRIMARY KEY (name_key, spotify_id)
);

-- Gigs from Resident Advisor, upcoming and past. Which is which is worked out
-- from `date` when read, so a cached gig turns past on its own.
CREATE TABLE IF NOT EXISTS dj_gigs (
    name_key    TEXT NOT NULL,
    ra_event_id TEXT NOT NULL,
    date        TEXT NOT NULL,                   -- "2026-10-12", the venue's local day
    venue       TEXT,
    city        TEXT,
    country     TEXT,                            -- ISO code
    lineup      TEXT,                            -- the others on the bill, "Marco Carola, Loco Dice"
    url         TEXT,
    PRIMARY KEY (name_key, ra_event_id)
);
