# Search Before You Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Search page shows something before you type, and its results keep the field and headings in place:
- **With an empty query:** the switched-on sections, in the chosen order, under the field — Recent searches, Recently played, Your DJs, Your library by genre (on by default), Recently added and Sets you saved lately (off). A genre tile opens All Tracks with that filter.
- **Customize** (a sliders button in the field): the sections as a plain list with ▲ / ▼ and a switch each; Done saves.
- **While typing:** the field, the DJs row, the Playlists row (now above the tracks, as small cards) and the Tracks heading stay; only the track rows scroll.

**Architecture:**
- **Rust:** `db/sections.rs` holds four read-only queries on the existing tables (no migration); `commands/sections.rs` exposes them. Home's plan reuses them.
  - `get_recently_played_tracks(limit)`: distinct tracks by their latest play, as full rows with analysis and `played_at`; deleted files drop out (inner join).
  - `get_recently_added_tracks(limit)`: full rows, newest `date_added` first.
  - `get_known_djs(today)`: `dj_profiles` ∪ `yt_watched_djs` by name key, with the photo and the next gig on or after `today`.
  - `get_library_groups()`: the 6 biggest genres, the count added in the last 30 days (UTC), the count with no play in `play_history`.
- **Pure TypeScript** (tested): the recent-searches list, the section order and its stored form, the DJ pages opened lately (`dj_recent`), the small lines ("next gig Sat, Oct 12", "2 days ago", "1,581 tracks"), and what each section shows.
- **Components:** `components/search/` — `useSectionsData` reads the switched-on sections' data (again after each play), `SearchSections` draws them, `CustomizeSections` is the list.
- **SearchView:** the field on top; under it the sections scroll as one page, or the results sit still with only the rows scrolling. It remembers a query when a result is opened or played, or after it rests 2 seconds with results.
- **App:** `openAllTracks(filter?)` (the sidebar's handler, extracted) for the genre tiles; `openSets({ openVideoId })` for a saved set; `playVersion` to Search; `openDj` notes the DJ in `dj_recent`.

**Tech Stack:** Rust (rusqlite), React 19, TypeScript, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-search-home-sections-design.md` — *Sections*, *Search*, *All Tracks filter*, *Navigation*, *Testing* (its Home part is superseded by the Home cards spec). The approved mockup is `2026-10-03-search-empty-mockup.html`, directions **A + B**. The filter object and its button come from the track table spec (built).

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 8 writes them into the spec):
- **Recently played tiles show the full picture,** read as the now-playing bar reads it (`getTrackArtworkUrl`, cached). The table's 72px thumbnail would blur on a 150px tile on a retina screen. A track without artwork shows the quiet square with a small muted music note.
- **Recently played and Your DJs scroll sideways** inside their rows. Hiding the tiles that do not fit (the mockup's `overflow: hidden`) would leave them reachable with Tab but invisible.
- **Your DJs:** the DJ pages opened most recently first (`dj_recent`, max 20, written by `openDj`), then the rest by name; at most 20 cards. The line: the next gig, else "watching for sets" for a watched DJ, else nothing. Initials: the first letters of the first two words ("JC").
- **Genre tiles:** the mockup's six colours by rank; Recently added says "N tracks · last 30 days"; a tile for 0 tracks is left out.
- **The Playlists results are small cards** (a 48px gradient square beside the name and count) in a row that scrolls sideways. Found in WebKit: with 126px squares like the DJ cards, the rows were left 25px on a 760px-tall window when DJs show too. **The rows keep at least 200px;** on a shorter window the results scroll as a whole.
- **Customize** has Cancel beside Done; the sliders button again also cancels. The button sits where the field's ✕ is, and shows only with an empty query.
- **Recent searches:** a chip's text runs the search; its × forgets it; Clear forgets all (no Undo: nothing is lost but a shortcut).
- **No loading flag for the genre tiles:** Search's opener loads the whole library into App's `tracks`, so All Tracks filters it at once while it loads again; a Never played filter shows no rows until the played ids arrive (the table's `filterPending`).
- **The 1000px width bug** no longer happened on `0b675a4` (9 DJ cards: nothing past the right edge) — the track table plans set `min-width: 0` on App's view wrappers. Every new box keeps `min-width: 0`, and the WebKit check measures it.
- **Recently added** (off by default) shows the table's 36px cover thumbnail; Sets you saved lately shows a quiet square with a radio icon (a YouTube thumbnail would be a network request).

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at 0b675a4; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc`, each task's tests and `cargo test` pass at every task's end.
- **Builds and tests:**
  - `cargo test`: 8 new (446).
  - `vitest`: 29 new. The repo counts 552 after it: 551 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (`localStorage.removeItem is not a function` under Node 25's built-in `localStorage`), not touched here.
  - `tsc` passes; `npx eslint src mobile` shows the same 29 problems as before, none new; `vite build` passes.
- **In WebKit** (a test page with the real AppShell, Sidebar collapsed and SearchView inside App's wrappers, at 1000×760, IPC mocked with a 120-track library, 11 DJs, 4 sets):
  - Empty query: Recent searches, Recently played, Your DJs, Your library by genre, in that order. Nothing reaches past the main column's right edge; the page does not scroll sideways; the tiles row (970/884) and the DJs row (1400/884) scroll inside themselves.
  - Scrolling the sections leaves the field where it was (top 24 before and after).
  - A tile plays its track with the 6 tiles as the queue (`play 2 of 1,2,3,4,5,6 at 1`); Tech House opens All Tracks with `{"genre":"Tech House"}`, Never played with `{"played":"never"}`; a DJ opens their page; a chip's × removes it; a chip runs its search.
  - Query "a" (9 DJs, 3 playlists, 115 tracks): nothing past the right edge; the rows scroll in their own area (5544/158) while the Tracks heading stays at the same place (501 before and after scrolling the rows).
  - Resting 2 seconds with results puts "a" first in `search_recent`.
  - Customize: moving Your library by genre up twice, switching Recent searches off and Recently added on, then Done stores the order and the page shows Genre, Recently played, Your DJs, Recently added — the same after a reload.
  - An empty library and no history: "Search your library", as before.
  - Recently added and Sets you saved lately rows ("today", "yesterday", "2 days ago", "Sep 26"); a set row opens it in Sets (`set v2`); a row plays its track. In Dawn the chips, rows and tiles read.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/sections.rs`, `db/mod.rs` | create / modify | the four queries and their tests |
| `src-tauri/src/commands/sections.rs`, `commands/mod.rs`, `lib.rs` | create / modify | the commands; the wire shape tested |
| `src/types/sections.ts`, `src/lib/tauri-api.ts` | create / modify | the types and the four calls |
| `src/lib/search/recentSearches.ts`, `sections.ts`, `storage.ts`, `src/lib/dj/recent.ts` (+ tests) | create | recent searches, the section order, `dj_recent`, and where they are stored |
| `src/lib/search/labels.ts` (+ test) | create | the small lines and initials |
| `src/components/search/useSectionsData.ts`, `sectionContent.ts` (+ test), `SearchSections.tsx`, `SearchSections.css`, `CustomizeSections.tsx` | create | reading, choosing and drawing the sections; Customize |
| `src/components/views/SearchView.tsx`, `.css` | modify | sections before typing, the sliders button, remembering queries, results where only the rows scroll |
| `src/App.tsx` | modify | `openAllTracks(filter)`, a saved set, `playVersion`, `dj_recent` |
| `docs/superpowers/specs/2026-10-03-search-home-sections-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign`. `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 522 passed (523)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 29 problems (10 errors, 19 warnings)`;
  - `cd src-tauri && cargo test 2>&1 | grep "test result" | head -1`: `438 passed`.

---

### Task 1: The queries

**Files:** Create `src-tauri/src/db/sections.rs`; modify `src-tauri/src/db/mod.rs`.

- [ ] **Step 1: The module and its tests**

Create `src-tauri/src/db/sections.rs`:

```rust
// src-tauri/src/db/sections.rs
//! What the Search page shows before you type (Search spec, Sections), shared
//! with Home: the tracks played and added lately as full rows, the DJs the
//! user knows, and the library's biggest genres. Local data only.

use super::{Database, Track, TrackWithAnalysis};
use rusqlite::{params, Result, Row};
use serde::Serialize;

/// The columns `track_with_analysis` reads, from `tracks t` and `track_analysis a`.
const TRACK_COLUMNS: &str = "t.id, t.file_path, t.file_hash, t.title, t.artist, t.album, t.album_artist,
    t.track_number, t.year, t.label, t.duration_ms, t.file_format,
    t.bitrate, t.sample_rate, t.file_size, t.date_added, t.date_modified,
    t.play_count, t.rating, t.comment, t.artwork_path, t.genre, t.genre_source,
    a.bpm, a.bpm_confidence, a.musical_key, a.key_confidence";

/// A track and its analysis, from a row that starts with `TRACK_COLUMNS`.
fn track_with_analysis(row: &Row) -> Result<TrackWithAnalysis> {
    let track = Track {
        id: row.get(0)?,
        file_path: row.get(1)?,
        file_hash: row.get(2)?,
        title: row.get(3)?,
        artist: row.get(4)?,
        album: row.get(5)?,
        album_artist: row.get(6)?,
        track_number: row.get(7)?,
        year: row.get(8)?,
        label: row.get(9)?,
        duration_ms: row.get(10)?,
        file_format: row.get(11)?,
        bitrate: row.get(12)?,
        sample_rate: row.get(13)?,
        file_size: row.get(14)?,
        date_added: row.get(15)?,
        date_modified: row.get(16)?,
        play_count: row.get(17)?,
        rating: row.get(18)?,
        comment: row.get(19)?,
        artwork_path: row.get(20)?,
        genre: row.get(21)?,
        genre_source: row.get(22)?,
    };
    Ok((track, row.get(23)?, row.get(24)?, row.get(25)?, row.get(26)?))
}

/// A DJ the user knows: one with a DJ page, or one watched for sets.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownDj {
    pub name_key: String,
    pub display_name: String,
    /// The Spotify photo, else Resident Advisor's.
    pub image_url: Option<String>,
    /// The first gig on or after the day asked about.
    pub next_gig: Option<NextGig>,
    pub watched: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NextGig {
    /// "2026-10-12", the venue's local day.
    pub date: String,
    pub venue: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GenreCount {
    pub genre: String,
    pub count: i64,
}

/// The library at a glance, for the genre tiles.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroups {
    /// The biggest genres, biggest first (at most 6).
    pub genres: Vec<GenreCount>,
    /// Tracks added in the last 30 days.
    pub added_recently: i64,
    /// Tracks with no play in the history.
    pub never_played: i64,
}

impl Database {
    /// The tracks played lately, each once, by its latest play (newest
    /// first), with that play's time (unix seconds). Tracks whose file was
    /// removed from the library drop out.
    pub fn get_recently_played_tracks(&self, limit: i64) -> Result<Vec<(TrackWithAnalysis, i64)>> {
        let sql = format!(
            "SELECT {TRACK_COLUMNS}, p.last_played
             FROM (SELECT track_id, MAX(played_at) AS last_played
                   FROM play_history WHERE track_id IS NOT NULL
                   GROUP BY track_id) p
             JOIN tracks t ON t.id = p.track_id
             LEFT JOIN track_analysis a ON a.track_id = t.id
             ORDER BY p.last_played DESC, t.id DESC
             LIMIT ?1"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![limit], |row| Ok((track_with_analysis(row)?, row.get(27)?)))?;
        rows.collect()
    }

    /// The tracks added lately, newest first.
    pub fn get_recently_added_tracks(&self, limit: i64) -> Result<Vec<TrackWithAnalysis>> {
        let sql = format!(
            "SELECT {TRACK_COLUMNS}
             FROM tracks t
             LEFT JOIN track_analysis a ON a.track_id = t.id
             ORDER BY t.date_added DESC, t.id DESC
             LIMIT ?1"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![limit], track_with_analysis)?;
        rows.collect()
    }

    /// Every DJ with a DJ page or watched for sets, once per name key, by
    /// name. `today` ("2026-10-04", the user's local day) picks the next gig.
    pub fn get_known_djs(&self, today: &str) -> Result<Vec<KnownDj>> {
        let mut stmt = self.conn.prepare(
            "SELECT k.name_key,
                    COALESCE(p.display_name, w.display_name),
                    COALESCE(p.spotify_image_url, p.ra_image_url),
                    w.name_key IS NOT NULL,
                    g.date, g.venue
             FROM (SELECT name_key FROM dj_profiles
                   UNION SELECT name_key FROM yt_watched_djs) k
             LEFT JOIN dj_profiles p ON p.name_key = k.name_key
             LEFT JOIN yt_watched_djs w ON w.name_key = k.name_key
             LEFT JOIN dj_gigs g ON g.rowid = (
                 SELECT rowid FROM dj_gigs
                 WHERE name_key = k.name_key AND date >= ?1
                 ORDER BY date, ra_event_id LIMIT 1)
             ORDER BY COALESCE(p.display_name, w.display_name) COLLATE NOCASE, k.name_key",
        )?;
        let rows = stmt.query_map([today], |row| {
            let date: Option<String> = row.get(4)?;
            let venue: Option<String> = row.get(5)?;
            Ok(KnownDj {
                name_key: row.get(0)?,
                display_name: row.get(1)?,
                image_url: row.get(2)?,
                watched: row.get(3)?,
                next_gig: date.map(|date| NextGig { date, venue }),
            })
        })?;
        rows.collect()
    }

    /// The 6 biggest genres with their counts, how many tracks were added in
    /// the last 30 days (`date_added` is UTC, as `datetime('now')` writes it),
    /// and how many were never played. `tracks.play_count` is not kept up to
    /// date, so "never played" means no row in the play history.
    pub fn get_library_groups(&self) -> Result<LibraryGroups> {
        let mut stmt = self.conn.prepare(
            "SELECT genre, COUNT(*) FROM tracks
             WHERE genre IS NOT NULL AND TRIM(genre) <> ''
             GROUP BY genre
             ORDER BY COUNT(*) DESC, genre
             LIMIT 6",
        )?;
        let genres = stmt
            .query_map([], |row| Ok(GenreCount { genre: row.get(0)?, count: row.get(1)? }))?
            .collect::<Result<Vec<_>>>()?;
        let added_recently = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE date_added >= datetime('now', '-30 days')",
            [],
            |row| row.get(0),
        )?;
        let never_played = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks t
             WHERE NOT EXISTS (SELECT 1 FROM play_history p WHERE p.track_id = t.id)",
            [],
            |row| row.get(0),
        )?;
        Ok(LibraryGroups { genres, added_recently, never_played })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    // A track with a title, a genre and a `date_added` written in SQL (e.g.
    // "datetime('now', '-3 days')").
    fn track(db: &Database, title: &str, genre: Option<&str>, added: &str) -> i64 {
        db.conn
            .execute(
                &format!(
                    "INSERT INTO tracks (file_path, file_hash, title, genre, date_added)
                     VALUES (?1, ?1, ?2, ?3, {added})"
                ),
                params![format!("/m/{title}.mp3"), title, genre],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn play(db: &Database, track_id: i64, at: i64) {
        db.conn
            .execute("INSERT INTO play_history (track_id, played_at) VALUES (?1, ?2)", params![track_id, at])
            .unwrap();
    }

    fn titles(tracks: &[TrackWithAnalysis]) -> Vec<String> {
        tracks.iter().map(|(t, ..)| t.title.clone().unwrap()).collect()
    }

    #[test]
    fn recently_played_is_each_track_once_by_its_latest_play_with_its_analysis() {
        let db = db();
        let a = track(&db, "A", None, "datetime('now')");
        let b = track(&db, "B", None, "datetime('now')");
        let c = track(&db, "C", None, "datetime('now')");
        db.save_bpm_analysis(a, 126.0, 0.9).unwrap();
        play(&db, a, 100);
        play(&db, b, 200);
        play(&db, a, 300);
        play(&db, c, 50);

        let played = db.get_recently_played_tracks(10).unwrap();

        let order: Vec<_> = played.iter().map(|((t, ..), at)| (t.title.clone().unwrap(), *at)).collect();
        assert_eq!(order, vec![("A".into(), 300), ("B".into(), 200), ("C".into(), 50)]);
        assert_eq!(played[0].0 .1, Some(126.0));
        assert_eq!(db.get_recently_played_tracks(2).unwrap().len(), 2);
    }

    #[test]
    fn recently_played_leaves_out_a_track_removed_from_the_library() {
        let db = db();
        let a = track(&db, "A", None, "datetime('now')");
        let gone = track(&db, "Gone", None, "datetime('now')");
        play(&db, a, 100);
        play(&db, gone, 200);
        // The history keeps the row (as an import that bypassed the cascade would).
        db.conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        db.conn.execute("DELETE FROM tracks WHERE id = ?1", [gone]).unwrap();

        let played = db.get_recently_played_tracks(10).unwrap();

        assert_eq!(played.len(), 1);
        assert_eq!(played[0].0 .0.title.as_deref(), Some("A"));
    }

    #[test]
    fn recently_added_is_newest_first_with_its_analysis() {
        let db = db();
        let old = track(&db, "Old", None, "datetime('now', '-40 days')");
        track(&db, "New", None, "datetime('now')");
        track(&db, "Mid", None, "datetime('now', '-2 days')");
        db.save_key_analysis(old, "8A", 0.8).unwrap();

        let added = db.get_recently_added_tracks(10).unwrap();

        assert_eq!(titles(&added), vec!["New", "Mid", "Old"]);
        assert_eq!(added[2].3.as_deref(), Some("8A"));
        assert_eq!(titles(&db.get_recently_added_tracks(1).unwrap()), vec!["New"]);
    }

    #[test]
    fn library_groups_count_the_biggest_genres_the_added_lately_and_the_never_played() {
        let db = db();
        for (i, genre) in ["Tech House", "Tech House", "Tech House", "House", "House", "Afro"].iter().enumerate() {
            track(&db, &format!("t{i}"), Some(genre), "datetime('now', '-60 days')");
        }
        track(&db, "no genre", None, "datetime('now', '-60 days')");
        track(&db, "empty genre", Some(" "), "datetime('now', '-60 days')");
        let fresh = track(&db, "fresh", Some("House"), "datetime('now', '-29 days')");
        track(&db, "just over", None, "datetime('now', '-31 days')");
        play(&db, fresh, 100);
        play(&db, fresh, 200);

        let groups = db.get_library_groups().unwrap();

        let counts: Vec<_> = groups.genres.iter().map(|g| (g.genre.as_str(), g.count)).collect();
        assert_eq!(counts, vec![("House", 3), ("Tech House", 3), ("Afro", 1)]);
        assert_eq!(groups.added_recently, 1);
        assert_eq!(groups.never_played, 9);
    }

    #[test]
    fn library_groups_keep_six_genres() {
        let db = db();
        for i in 0..8 {
            for j in 0..=i {
                track(&db, &format!("g{i}-{j}"), Some(&format!("Genre {i}")), "datetime('now')");
            }
        }
        let genres = db.get_library_groups().unwrap().genres;
        assert_eq!(genres.len(), 6);
        assert_eq!(genres[0], GenreCount { genre: "Genre 7".into(), count: 8 });
    }

    #[test]
    fn known_djs_merge_pages_and_watched_by_name_key_with_the_next_gig_from_today() {
        let db = db();
        db.conn
            .execute_batch(
                "INSERT INTO dj_profiles (name_key, display_name, spotify_image_url, ra_image_url)
                     VALUES ('traumer', 'Traumer', 'https://spotify/t.jpg', 'https://ra/t.jpg'),
                            ('ben rau', 'Ben Rau', NULL, 'https://ra/b.jpg'),
                            ('amy', 'Amy', NULL, NULL);
                 INSERT INTO yt_watched_djs (name_key, display_name) VALUES
                     ('traumer', 'traumer'), ('hot since 82', 'Hot Since 82');
                 INSERT INTO dj_gigs (name_key, ra_event_id, date, venue) VALUES
                     ('traumer', 'e1', '2026-10-03', 'Yesterday Club'),
                     ('traumer', 'e3', '2026-10-12', 'The Nest'),
                     ('traumer', 'e2', '2026-10-04', 'Depot Mayfield'),
                     ('amy', 'e9', '2026-09-01', 'Long Ago');",
            )
            .unwrap();

        let djs = db.get_known_djs("2026-10-04").unwrap();

        let names: Vec<_> = djs.iter().map(|d| d.display_name.as_str()).collect();
        assert_eq!(names, vec!["Amy", "Ben Rau", "Hot Since 82", "Traumer"]);
        let traumer = &djs[3];
        assert_eq!(traumer.name_key, "traumer");
        assert_eq!(traumer.image_url.as_deref(), Some("https://spotify/t.jpg"));
        assert!(traumer.watched);
        assert_eq!(
            traumer.next_gig,
            Some(NextGig { date: "2026-10-04".into(), venue: Some("Depot Mayfield".into()) })
        );
        assert_eq!(djs[1].image_url.as_deref(), Some("https://ra/b.jpg"));
        assert!(!djs[1].watched);
        assert_eq!(djs[0].next_gig, None);
        assert!(djs[2].watched);
        assert_eq!(djs[2].image_url, None);
    }
}
```

In `src-tauri/src/db/mod.rs`, replace

```rust
// Database layer - SQLite connection, migrations, queries

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

pub mod dj;
pub mod spotify;
pub mod youtube_music;

/// Track with optional analysis fields: (track, bpm, bpm_confidence, musical_key, key_confidence)
pub type TrackWithAnalysis = (Track, Option<f64>, Option<f64>, Option<String>, Option<f64>);
```

with

```rust
// Database layer - SQLite connection, migrations, queries

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

pub mod dj;
pub mod sections;
pub mod spotify;
pub mod youtube_music;

/// Track with optional analysis fields: (track, bpm, bpm_confidence, musical_key, key_confidence)
pub type TrackWithAnalysis = (Track, Option<f64>, Option<f64>, Option<String>, Option<f64>);
```

- [ ] **Step 2:** `cd src-tauri && cargo test --lib db::sections`: PASS, 6. Commit:

```bash
git add src-tauri/src/db/sections.rs src-tauri/src/db/mod.rs
git commit -m "feat(search): queries for the tracks played and added lately, the DJs you know and the library's genres"
```

---

### Task 2: The commands

**Files:** Create `src-tauri/src/commands/sections.rs`; modify `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: The commands, with the wire shape tested**

Create `src-tauri/src/commands/sections.rs`:

```rust
// src-tauri/src/commands/sections.rs
//! The Search page's sections before you type (Search spec), shared with
//! Home: tracks played and added lately, the DJs the user knows, and the
//! library's biggest genres. Local data only.

use serde::Serialize;
use tauri::State;

use crate::commands::library::{AppState, TrackDTO};
use crate::db::sections::{KnownDj, LibraryGroups};
use crate::db::{Database, TrackWithAnalysis};
use crate::error::AppError;

/// A track played lately, with the time of its latest play.
#[derive(Debug, Serialize)]
pub struct RecentlyPlayedTrack {
    #[serde(flatten)]
    pub track: TrackDTO,
    /// Unix seconds.
    pub played_at: i64,
}

fn track_dto((track, bpm, bpm_confidence, musical_key, key_confidence): TrackWithAnalysis) -> TrackDTO {
    let mut dto = TrackDTO::from(track);
    dto.bpm = bpm;
    dto.bpm_confidence = bpm_confidence;
    dto.musical_key = musical_key;
    dto.key_confidence = key_confidence;
    dto
}

fn with_db<T>(
    state: &State<AppState>,
    what: &str,
    read: impl FnOnce(&Database) -> rusqlite::Result<T>,
) -> Result<T, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;
    read(db).map_err(|e| AppError::Internal(format!("Failed to read {what}: {e}")))
}

/// Distinct tracks by their latest play, newest first.
#[tauri::command]
pub fn get_recently_played_tracks(
    limit: i64,
    state: State<AppState>,
) -> Result<Vec<RecentlyPlayedTrack>, AppError> {
    let rows = with_db(&state, "recently played tracks", |db| db.get_recently_played_tracks(limit))?;
    Ok(rows
        .into_iter()
        .map(|(row, played_at)| RecentlyPlayedTrack { track: track_dto(row), played_at })
        .collect())
}

/// The tracks added lately, newest first, as full rows.
#[tauri::command]
pub fn get_recently_added_tracks(limit: i64, state: State<AppState>) -> Result<Vec<TrackDTO>, AppError> {
    let rows = with_db(&state, "recently added tracks", |db| db.get_recently_added_tracks(limit))?;
    Ok(rows.into_iter().map(track_dto).collect())
}

/// Every DJ with a page or watched for sets; `today` ("2026-10-04", the
/// user's local day) picks each one's next gig.
#[tauri::command]
pub fn get_known_djs(today: String, state: State<AppState>) -> Result<Vec<KnownDj>, AppError> {
    with_db(&state, "known DJs", |db| db.get_known_djs(&today))
}

/// The 6 biggest genres, the count added in the last 30 days and the count never played.
#[tauri::command]
pub fn get_library_groups(state: State<AppState>) -> Result<LibraryGroups, AppError> {
    with_db(&state, "library groups", |db| db.get_library_groups())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sections::{GenreCount, NextGig};
    use crate::db::Track;
    use serde_json::json;

    fn track(title: &str) -> Track {
        Track {
            id: Some(7),
            file_path: "/m/a.mp3".into(),
            file_hash: "h".into(),
            title: Some(title.into()),
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: None,
            file_format: None,
            bitrate: None,
            sample_rate: None,
            file_size: None,
            date_added: None,
            date_modified: None,
            play_count: 0,
            rating: 0,
            comment: None,
            artwork_path: None,
            genre: None,
            genre_source: None,
        }
    }

    // What the frontend reads: a Track with `played_at` beside its fields.
    #[test]
    fn a_recently_played_track_is_a_flat_track_with_its_analysis_and_played_at() {
        let row = (track("A"), Some(126.0), Some(0.9), Some("8A".to_string()), Some(0.8));

        let value = serde_json::to_value(RecentlyPlayedTrack { track: track_dto(row), played_at: 300 }).unwrap();

        assert_eq!(value["id"], json!(7));
        assert_eq!(value["title"], json!("A"));
        assert_eq!(value["file_path"], json!("/m/a.mp3"));
        assert_eq!(value["bpm"], json!(126.0));
        assert_eq!(value["musical_key"], json!("8A"));
        assert_eq!(value["played_at"], json!(300));
    }

    #[test]
    fn known_djs_and_library_groups_are_camel_case() {
        let dj = KnownDj {
            name_key: "traumer".into(),
            display_name: "Traumer".into(),
            image_url: None,
            next_gig: Some(NextGig { date: "2026-10-12".into(), venue: Some("The Nest".into()) }),
            watched: false,
        };
        let groups = LibraryGroups {
            genres: vec![GenreCount { genre: "House".into(), count: 3 }],
            added_recently: 1,
            never_played: 9,
        };

        assert_eq!(
            serde_json::to_value(dj).unwrap(),
            json!({
                "nameKey": "traumer",
                "displayName": "Traumer",
                "imageUrl": null,
                "nextGig": { "date": "2026-10-12", "venue": "The Nest" },
                "watched": false
            })
        );
        assert_eq!(
            serde_json::to_value(groups).unwrap(),
            json!({ "genres": [{ "genre": "House", "count": 3 }], "addedRecently": 1, "neverPlayed": 9 })
        );
    }
}
```

In `src-tauri/src/commands/mod.rs`, replace

```rust
pub mod dj;
pub mod genre;
pub mod library;
pub mod move_tracks;
pub mod playback;
pub mod playlists;
pub mod server;
pub mod settings;
pub mod spotify;
pub mod watcher;
pub mod youtube;
pub mod youtube_music;
```

with

```rust
pub mod dj;
pub mod genre;
pub mod library;
pub mod move_tracks;
pub mod playback;
pub mod playlists;
pub mod sections;
pub mod server;
pub mod settings;
pub mod spotify;
pub mod watcher;
pub mod youtube;
pub mod youtube_music;
```

In `src-tauri/src/lib.rs`, replace

```rust
            commands::dashboard::get_played_track_ids,
            commands::dashboard::get_play_counts,
            commands::dashboard::get_recently_added,
            commands::dashboard::get_library_insights,
            commands::dashboard::save_dashboard_layout,
            commands::dashboard::get_dashboard_layout,
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let tauri::WindowEvent::Destroyed = event {
                // Shut down companion server so the port is freed
                let state = window.app_handle().state::<commands::server::CompanionState>();
```

with

```rust
            commands::dashboard::get_played_track_ids,
            commands::dashboard::get_play_counts,
            commands::dashboard::get_recently_added,
            commands::dashboard::get_library_insights,
            commands::dashboard::save_dashboard_layout,
            commands::dashboard::get_dashboard_layout,
            // Search sections (shared with Home)
            commands::sections::get_recently_played_tracks,
            commands::sections::get_recently_added_tracks,
            commands::sections::get_known_djs,
            commands::sections::get_library_groups,
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let tauri::WindowEvent::Destroyed = event {
                // Shut down companion server so the port is freed
                let state = window.app_handle().state::<commands::server::CompanionState>();
```

- [ ] **Step 2:** `cd src-tauri && cargo test --lib commands::sections`: PASS, 2. Then `cargo test 2>&1 | grep "test result" | head -1`: `446 passed`. Commit:

```bash
git add src-tauri/src/commands/sections.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(search): commands for Search's sections"
```

---

### Task 3: The types and calls

**Files:** Create `src/types/sections.ts`; modify `src/lib/tauri-api.ts`.

- [ ] **Step 1:**

Create `src/types/sections.ts`:

```ts
// src/types/sections.ts
// What the Search page's sections read before you type (Search spec); Home
// reads them too.
import type { GenreCount, Track } from './track'

/** A track played lately, with its latest play (unix seconds). */
export interface RecentlyPlayedTrack extends Track {
  played_at: number
}

/** A DJ the user knows (`get_known_djs`): one with a DJ page, or watched for sets. */
export interface YourDj {
  nameKey: string
  displayName: string
  /** The Spotify photo, else Resident Advisor's. */
  imageUrl: string | null
  /** The first gig on or after the day asked about ("2026-10-12", the venue's day). */
  nextGig: { date: string; venue: string | null } | null
  watched: boolean
}

/** The library at a glance, for the genre tiles. */
export interface LibraryGroups {
  /** The biggest genres, biggest first (at most 6). */
  genres: GenreCount[]
  /** Tracks added in the last 30 days. */
  addedRecently: number
  /** Tracks with no play in the history. */
  neverPlayed: number
}
```

In `src/lib/tauri-api.ts`, replace

```ts
  PlayOutcome,
  SpotifyLibrary,
  SpotifyStatus,
  Verdict,
} from '../types/spotify'
import type { YtmLibrary, YtmStatus } from '../types/youtubeMusic'
import type {
  ArtistCandidate,
  DjCandidates,
  DjPage,
  DjRefresh,
  DjSetTrack,
```

with

```ts
  PlayOutcome,
  SpotifyLibrary,
  SpotifyStatus,
  Verdict,
} from '../types/spotify'
import type { YtmLibrary, YtmStatus } from '../types/youtubeMusic'
import type { LibraryGroups, RecentlyPlayedTrack, YourDj } from '../types/sections'
import type {
  ArtistCandidate,
  DjCandidates,
  DjPage,
  DjRefresh,
  DjSetTrack,
```

In `src/lib/tauri-api.ts`, replace

```ts

  /** Plays per played track (the track table's Plays column). */
  async getPlayCounts(): Promise<{ track_id: number; plays: number }[]> {
    return await invoke('get_play_counts')
  },

  async getRecentlyPlayed(limit?: number): Promise<{
    track_id: number
    playlist_id: number | null
    played_at: number
    title: string | null
    artist: string | null
```

with

```ts

  /** Plays per played track (the track table's Plays column). */
  async getPlayCounts(): Promise<{ track_id: number; plays: number }[]> {
    return await invoke('get_play_counts')
  },

  /** Distinct tracks by their latest play, newest first (Search's Recently played). */
  async getRecentlyPlayedTracks(limit: number): Promise<RecentlyPlayedTrack[]> {
    return await invoke('get_recently_played_tracks', { limit })
  },

  /** The tracks added lately, newest first, as full rows. */
  async getRecentlyAddedTracks(limit: number): Promise<Track[]> {
    return await invoke('get_recently_added_tracks', { limit })
  },

  /** Every DJ with a page or watched for sets; `today` ("2026-10-04", the local day) picks the next gig. */
  async getKnownDjs(today: string): Promise<YourDj[]> {
    return await invoke('get_known_djs', { today })
  },

  /** The 6 biggest genres, the count added in the last 30 days and the count never played. */
  async getLibraryGroups(): Promise<LibraryGroups> {
    return await invoke('get_library_groups')
  },

  async getRecentlyPlayed(limit?: number): Promise<{
    track_id: number
    playlist_id: number | null
    played_at: number
    title: string | null
    artist: string | null
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/types/sections.ts src/lib/tauri-api.ts
git commit -m "feat(search): the sections' types and calls"
```

---

### Task 4: What Search remembers

**Files:** Create `src/lib/search/recentSearches.ts`, `src/lib/search/sections.ts`, `src/lib/dj/recent.ts`, `src/lib/search/storage.ts`, each with its test.

- [ ] **Step 1: The failing tests**

Create `src/lib/search/recentSearches.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_SEARCHES,
  forgetSearch,
  rememberSearch,
} from './recentSearches'

describe('recent searches', () => {
  it('puts a new search in front, trimmed', () => {
    expect(rememberSearch(['afro house'], '  traumer ')).toEqual([
      'traumer',
      'afro house',
    ])
  })

  it('moves a repeat to the front instead of adding it, ignoring case', () => {
    expect(
      rememberSearch(['traumer', 'Afro House', 'capriati'], 'afro house'),
    ).toEqual(['afro house', 'traumer', 'capriati'])
  })

  it('ignores an empty search', () => {
    const list = ['traumer']
    expect(rememberSearch(list, '   ')).toBe(list)
  })

  it(`keeps the newest ${MAX_RECENT_SEARCHES}`, () => {
    const list = Array.from({ length: MAX_RECENT_SEARCHES }, (_, i) => `q${i}`)
    const next = rememberSearch(list, 'new')
    expect(next).toHaveLength(MAX_RECENT_SEARCHES)
    expect(next[0]).toBe('new')
    expect(next).not.toContain(`q${MAX_RECENT_SEARCHES - 1}`)
  })

  it('forgets one search in any case', () => {
    expect(forgetSearch(['traumer', 'capriati'], 'Traumer')).toEqual([
      'capriati',
    ])
  })
})
```

Create `src/lib/search/sections.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECTION_PREFS,
  SEARCH_SECTIONS,
  moveSection,
  parseSectionPrefs,
  setSectionOn,
  type SectionPref,
} from './sections'

describe('search sections', () => {
  it('starts with recent searches, recently played, your DJs and genres on', () => {
    expect(
      DEFAULT_SECTION_PREFS.filter((pref) => pref.on).map((pref) => pref.id),
    ).toEqual(['recent-searches', 'recently-played', 'your-djs', 'genres'])
    expect(DEFAULT_SECTION_PREFS).toHaveLength(SEARCH_SECTIONS.length)
  })

  it('uses the default when nothing readable is stored', () => {
    expect(parseSectionPrefs(null)).toBe(DEFAULT_SECTION_PREFS)
    expect(parseSectionPrefs('nope')).toBe(DEFAULT_SECTION_PREFS)
    expect(parseSectionPrefs('{"id":"genres"}')).toBe(DEFAULT_SECTION_PREFS)
  })

  it('keeps the stored order and switches, dropping unknown ids and repeats', () => {
    const stored = JSON.stringify([
      { id: 'genres', on: true },
      { id: 'gone-section', on: true },
      { id: 'recently-added', on: true },
      { id: 'genres', on: false },
      { id: 'recent-searches', on: false },
      { id: 'recently-played', on: true },
      { id: 'your-djs', on: true },
      { id: 'saved-sets', on: false },
    ])
    expect(parseSectionPrefs(stored)).toEqual([
      { id: 'genres', on: true },
      { id: 'recently-added', on: true },
      { id: 'recent-searches', on: false },
      { id: 'recently-played', on: true },
      { id: 'your-djs', on: true },
      { id: 'saved-sets', on: false },
    ])
  })

  it('appends a section the stored list does not name, off', () => {
    const stored = JSON.stringify([
      { id: 'your-djs', on: true },
      { id: 'recent-searches', on: true },
    ])
    const prefs = parseSectionPrefs(stored)
    expect(prefs.slice(0, 2)).toEqual([
      { id: 'your-djs', on: true },
      { id: 'recent-searches', on: true },
    ])
    expect(prefs.slice(2)).toEqual([
      { id: 'recently-played', on: false },
      { id: 'genres', on: false },
      { id: 'recently-added', on: false },
      { id: 'saved-sets', on: false },
    ])
  })

  it('moves a section up or down, and not past either end', () => {
    const prefs: SectionPref[] = [
      { id: 'recent-searches', on: true },
      { id: 'genres', on: true },
      { id: 'your-djs', on: false },
    ]
    expect(moveSection(prefs, 1, -1).map((pref) => pref.id)).toEqual([
      'genres',
      'recent-searches',
      'your-djs',
    ])
    expect(moveSection(prefs, 1, 1).map((pref) => pref.id)).toEqual([
      'recent-searches',
      'your-djs',
      'genres',
    ])
    expect(moveSection(prefs, 0, -1)).toBe(prefs)
    expect(moveSection(prefs, 2, 1)).toBe(prefs)
  })

  it('switches one section', () => {
    const prefs: SectionPref[] = [
      { id: 'recent-searches', on: true },
      { id: 'genres', on: false },
    ]
    expect(setSectionOn(prefs, 'genres', true)).toEqual([
      { id: 'recent-searches', on: true },
      { id: 'genres', on: true },
    ])
  })
})
```

Create `src/lib/dj/recent.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_DJ_RECENT, orderYourDjs, rememberDj } from './recent'

describe('DJ pages opened lately', () => {
  it('puts the DJ key in front, once', () => {
    expect(rememberDj(['ben rau', 'traumer'], ' Traumer ')).toEqual([
      'traumer',
      'ben rau',
    ])
  })

  it(`keeps the newest ${MAX_DJ_RECENT}`, () => {
    const list = Array.from({ length: MAX_DJ_RECENT }, (_, i) => `dj ${i}`)
    const next = rememberDj(list, 'New DJ')
    expect(next).toHaveLength(MAX_DJ_RECENT)
    expect(next[0]).toBe('new dj')
  })

  it('ignores an empty name', () => {
    const list = ['traumer']
    expect(rememberDj(list, '  ')).toBe(list)
  })

  it('orders Your DJs: opened lately first, then the rest as given (by name)', () => {
    const djs = ['amy', 'ben rau', 'hot since 82', 'traumer'].map(
      (nameKey) => ({ nameKey }),
    )
    expect(
      orderYourDjs(djs, ['traumer', 'gone', 'ben rau']).map((dj) => dj.nameKey),
    ).toEqual(['traumer', 'ben rau', 'amy', 'hot since 82'])
  })
})
```

Create `src/lib/search/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseStringList } from './storage'

describe('a stored list of strings', () => {
  it('keeps non-empty strings, at most max', () => {
    expect(
      parseStringList('["traumer", 3, "", " ", "capriati", "amy"]', 2),
    ).toEqual(['traumer', 'capriati'])
  })

  it('is empty when nothing readable is stored', () => {
    expect(parseStringList(null, 10)).toEqual([])
    expect(parseStringList('{"a":1}', 10)).toEqual([])
    expect(parseStringList('not json', 10)).toEqual([])
  })
})
```

Run: `npx vitest run src/lib/search src/lib/dj/recent.test.ts`. Expected: 4 files FAIL, `Failed to resolve import`.

- [ ] **Step 2: Recent searches**

Create `src/lib/search/recentSearches.ts`:

```ts
// src/lib/search/recentSearches.ts
// Search's Recent searches (Search spec): the last 10 queries the user acted
// on, newest first, kept on this machine only. Pure; storage.ts stores them.

export const MAX_RECENT_SEARCHES = 10

/**
 * `list` with `query` in front: trimmed, a repeat in any case moved rather
 * than added, at most 10. An empty query changes nothing.
 */
export function rememberSearch(list: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return list
  const lower = q.toLowerCase()
  return [q, ...list.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_RECENT_SEARCHES,
  )
}

/** `list` without `query`, compared in any case. */
export function forgetSearch(list: string[], query: string): string[] {
  const lower = query.toLowerCase()
  return list.filter((item) => item.toLowerCase() !== lower)
}
```

- [ ] **Step 3: The sections' order**

Create `src/lib/search/sections.ts`:

```ts
// src/lib/search/sections.ts
// Which sections the Search page shows before you type, and in what order
// (Search spec, Customize). Stored as an ordered list of { id, on }. Pure;
// storage.ts stores it.

export type SearchSectionId =
  | 'recent-searches'
  | 'recently-played'
  | 'your-djs'
  | 'genres'
  | 'recently-added'
  | 'saved-sets'

export interface SectionPref {
  id: SearchSectionId
  on: boolean
}

/** Every section in its default order, with its default. */
export const SEARCH_SECTIONS: ReadonlyArray<{
  id: SearchSectionId
  label: string
  on: boolean
}> = [
  { id: 'recent-searches', label: 'Recent searches', on: true },
  { id: 'recently-played', label: 'Recently played', on: true },
  { id: 'your-djs', label: 'Your DJs', on: true },
  { id: 'genres', label: 'Your library by genre', on: true },
  { id: 'recently-added', label: 'Recently added', on: false },
  { id: 'saved-sets', label: 'Sets you saved lately', on: false },
]

export const DEFAULT_SECTION_PREFS: SectionPref[] = SEARCH_SECTIONS.map(
  ({ id, on }) => ({
    id,
    on,
  }),
)

export function sectionLabel(id: SearchSectionId): string {
  return SEARCH_SECTIONS.find((section) => section.id === id)?.label ?? id
}

/**
 * The stored order: unknown ids and repeats dropped, and a section it does
 * not name (one added in a later version) appended, off. Nothing stored, or
 * nothing readable, is the default.
 */
export function parseSectionPrefs(stored: string | null): SectionPref[] {
  if (!stored) return DEFAULT_SECTION_PREFS
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return DEFAULT_SECTION_PREFS
  }
  if (!Array.isArray(parsed)) return DEFAULT_SECTION_PREFS
  const known = new Set<string>(SEARCH_SECTIONS.map((section) => section.id))
  const prefs: SectionPref[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const { id, on } = item as { id?: unknown; on?: unknown }
    if (typeof id !== 'string' || !known.has(id)) continue
    if (prefs.some((pref) => pref.id === id)) continue
    prefs.push({ id: id as SearchSectionId, on: on === true })
  }
  for (const section of SEARCH_SECTIONS) {
    if (!prefs.some((pref) => pref.id === section.id)) {
      prefs.push({ id: section.id, on: false })
    }
  }
  return prefs
}

/** `prefs` with the section at `index` moved one place up (-1) or down (+1). */
export function moveSection(
  prefs: SectionPref[],
  index: number,
  by: -1 | 1,
): SectionPref[] {
  const target = index + by
  if (
    index < 0 ||
    index >= prefs.length ||
    target < 0 ||
    target >= prefs.length
  ) {
    return prefs
  }
  const next = [...prefs]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** `prefs` with one section switched on or off. */
export function setSectionOn(
  prefs: SectionPref[],
  id: SearchSectionId,
  on: boolean,
): SectionPref[] {
  return prefs.map((pref) => (pref.id === id ? { ...pref, on } : pref))
}
```

- [ ] **Step 4: The DJ pages opened lately**

Create `src/lib/dj/recent.ts`:

```ts
// src/lib/dj/recent.ts
// The DJ pages opened most recently (Search spec, Your DJs): name keys,
// newest first, which put those DJs first in Your DJs. Pure; the list is
// kept in localStorage['dj_recent'] by lib/search/storage.ts.
import { djKey } from './names'

export const MAX_DJ_RECENT = 20

/** `list` with the DJ's key in front, once, at most 20. */
export function rememberDj(list: string[], name: string): string[] {
  const key = djKey(name)
  if (!key) return list
  return [key, ...list.filter((item) => item !== key)].slice(0, MAX_DJ_RECENT)
}

/** The DJs opened most recently first, the rest after them in the order given. */
export function orderYourDjs<T extends { nameKey: string }>(
  djs: T[],
  recent: string[],
): T[] {
  const rank = new Map(recent.map((key, index) => [key, index]))
  const last = recent.length
  return [...djs].sort(
    (a, b) => (rank.get(a.nameKey) ?? last) - (rank.get(b.nameKey) ?? last),
  )
}
```

- [ ] **Step 5: Where they are kept**

Create `src/lib/search/storage.ts`:

```ts
// src/lib/search/storage.ts
// Where Search keeps its lists on this machine: recent searches, the
// sections' order, and the DJ pages opened lately. A private window or
// storage that throws reads as nothing stored and does not remember.
import { MAX_DJ_RECENT, rememberDj } from '../dj/recent'
import { MAX_RECENT_SEARCHES } from './recentSearches'
import { parseSectionPrefs, type SectionPref } from './sections'

const RECENT_SEARCHES_KEY = 'search_recent'
const SECTIONS_KEY = 'search_sections'
const DJ_RECENT_KEY = 'dj_recent'

/** A stored list of strings: non-empty strings only, at most `max`; empty when unreadable. */
export function parseStringList(stored: string | null, max: number): string[] {
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is string =>
          typeof item === 'string' && item.trim() !== '',
      )
      .slice(0, max)
  } catch {
    return []
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembering is a smaller problem than failing the action.
  }
}

export function loadRecentSearches(): string[] {
  return parseStringList(read(RECENT_SEARCHES_KEY), MAX_RECENT_SEARCHES)
}

export function saveRecentSearches(list: string[]) {
  write(RECENT_SEARCHES_KEY, list)
}

export function loadSectionPrefs(): SectionPref[] {
  return parseSectionPrefs(read(SECTIONS_KEY))
}

export function saveSectionPrefs(prefs: SectionPref[]) {
  write(SECTIONS_KEY, prefs)
}

export function loadDjRecent(): string[] {
  return parseStringList(read(DJ_RECENT_KEY), MAX_DJ_RECENT)
}

/** A DJ page opened: that DJ goes first in Search's Your DJs. */
export function noteDjOpened(name: string) {
  write(DJ_RECENT_KEY, rememberDj(loadDjRecent(), name))
}
```

- [ ] **Step 6:** Run the same command: PASS, 17. Commit:

```bash
git add src/lib/search/recentSearches.ts src/lib/search/recentSearches.test.ts src/lib/search/sections.ts src/lib/search/sections.test.ts src/lib/dj/recent.ts src/lib/dj/recent.test.ts src/lib/search/storage.ts src/lib/search/storage.test.ts
git commit -m "feat(search): recent searches, the sections' order and the DJ pages opened lately, kept on this machine"
```

---

### Task 5: The small lines

**Files:** Create `src/lib/search/labels.ts`; test `src/lib/search/labels.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/search/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { daysAgoLabel, djInitials, djLine, trackCount } from './labels'

// SQLite's UTC text for a local time.
function stored(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

describe("a DJ card's one line", () => {
  it('names the next gig', () => {
    expect(
      djLine(
        { nextGig: { date: '2026-10-03', venue: 'Depot' }, watched: true },
        '2026-10-01',
      ),
    ).toBe('next gig Sat, Oct 3')
  })

  it('says a watched DJ without a gig is watched for sets', () => {
    expect(djLine({ nextGig: null, watched: true }, '2026-10-01')).toBe(
      'watching for sets',
    )
  })

  it('is empty otherwise', () => {
    expect(djLine({ nextGig: null, watched: false }, '2026-10-01')).toBe('')
  })
})

describe("a DJ's initials", () => {
  it('takes the first letters of the first two words', () => {
    expect(djInitials('Joseph Capriati')).toBe('JC')
    expect(djInitials('Hot Since 82')).toBe('HS')
    expect(djInitials(' traumer ')).toBe('T')
    expect(djInitials('Âme')).toBe('Â')
  })
})

describe('when a track or set was added', () => {
  const now = new Date(2026, 9, 8, 12, 0)

  it('counts local days', () => {
    expect(daysAgoLabel(stored(new Date(2026, 9, 8, 0, 30)), now)).toBe('today')
    expect(daysAgoLabel(stored(new Date(2026, 9, 7, 23, 50)), now)).toBe(
      'yesterday',
    )
    expect(daysAgoLabel(stored(new Date(2026, 9, 5, 9, 0)), now)).toBe(
      '3 days ago',
    )
  })

  it('gives the date after a week, and the year when it is not this one', () => {
    expect(daysAgoLabel(stored(new Date(2026, 8, 12, 9, 0)), now)).toBe(
      'Sep 12',
    )
    expect(daysAgoLabel(stored(new Date(2025, 11, 30, 9, 0)), now)).toBe(
      'Dec 30, 2025',
    )
  })

  it('is empty without a date', () => {
    expect(daysAgoLabel(undefined, now)).toBe('')
    expect(daysAgoLabel('soon', now)).toBe('')
  })
})

describe('a count of tracks', () => {
  it('reads as one track or N tracks, with thousands separated', () => {
    expect(trackCount(1)).toBe('1 track')
    expect(trackCount(0)).toBe('0 tracks')
    expect(trackCount(1581)).toBe('1,581 tracks')
  })
})
```

Run: `npx vitest run src/lib/search/labels.test.ts`. Expected: FAIL, `Failed to resolve import "./labels"`.

- [ ] **Step 2:**

Create `src/lib/search/labels.ts`:

```ts
// src/lib/search/labels.ts
// The small lines under Search's tiles and rows (Search spec, Sections).
import { gigLabel } from '../dj/gigs'
import { parseUtcDate } from '../trackTable/filter'
import type { YourDj } from '../../types/sections'

const DAY_MS = 24 * 60 * 60 * 1000

/** A Your DJs card's one line: the next gig, else "watching for sets" when watched, else nothing. */
export function djLine(
  dj: Pick<YourDj, 'nextGig' | 'watched'>,
  today: string,
): string {
  if (dj.nextGig) return `next gig ${gigLabel(dj.nextGig.date, today)}`
  return dj.watched ? 'watching for sets' : ''
}

/** "1 track", "1,581 tracks". */
export function trackCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'track' : 'tracks'}`
}

/** A DJ without a photo: the no-photo gradient, turned to a hue of its own per name. */
export function djHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(hash) % 360
}

/** "JC" for Joseph Capriati, "T" for Traumer: the first letters of the first two words. */
export function djInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
    .toUpperCase()
}

/**
 * When something was added, by the local day: "today", "yesterday", "3 days
 * ago", then "Sep 12" (with the year when it is not this one). `stored` is
 * SQLite's UTC "2026-10-03 21:14:05". Empty when it cannot be read.
 */
export function daysAgoLabel(stored: string | undefined, now: Date): string {
  const time = parseUtcDate(stored)
  if (time === null) return ''
  const then = new Date(time)
  const dayOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  // Rounded: a day across a clock change is 23 or 25 hours.
  const days = Math.round((dayOf(now) - dayOf(then)) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
```

- [ ] **Step 3:** Run the same command: PASS, 8. Commit:

```bash
git add src/lib/search/labels.ts src/lib/search/labels.test.ts
git commit -m "feat(search): a DJ's line and initials, when something was added, a count of tracks"
```

---

### Task 6: The sections

**Files:** Create `src/components/search/useSectionsData.ts`, `src/components/search/sectionContent.ts` (+ test), `src/components/search/SearchSections.tsx`, `src/components/search/SearchSections.css`, `src/components/search/CustomizeSections.tsx`.

- [ ] **Step 1: Reading them** (each section's data, only for the sections switched on; again after each play)

Create `src/components/search/useSectionsData.ts`:

```ts
// src/components/search/useSectionsData.ts
// What the switched-on sections show (Search spec, Sections), all local:
// read when the Search page opens, when a section is switched on, and after
// each play (Recently played and the Never played count change). Null until
// the first read answers, so the page does not flash "Search your library".
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import { orderYourDjs } from '../../lib/dj/recent'
import { loadDjRecent } from '../../lib/search/storage'
import type { SearchSectionId } from '../../lib/search/sections'
import type { Track } from '../../types/track'
import type { YtSetSummary } from '../../types/youtube'
import type {
  LibraryGroups,
  RecentlyPlayedTrack,
  YourDj,
} from '../../types/sections'

export const RECENTLY_PLAYED_TILES = 6
export const RECENTLY_ADDED_ROWS = 6
export const SAVED_SET_ROWS = 3
/** Your DJs keeps to the 20 opened most recently, then by name. */
export const YOUR_DJS_MAX = 20

export interface SectionsData {
  recentlyPlayed: RecentlyPlayedTrack[]
  djs: YourDj[]
  groups: LibraryGroups | null
  recentlyAdded: Track[]
  savedSets: YtSetSummary[]
  /** The local day the DJs' next gigs were picked for ("2026-10-08"). */
  today: string
}

// One section's read; a failure shows that section empty.
async function read<T>(
  wanted: boolean,
  empty: T,
  load: () => Promise<T>,
): Promise<T> {
  if (!wanted) return empty
  try {
    return await load()
  } catch (err) {
    console.warn('[Search] Failed to read a section:', err)
    return empty
  }
}

export function useSectionsData(
  shown: ReadonlyArray<SearchSectionId>,
  playVersion: number,
): SectionsData | null {
  const [data, setData] = useState<SectionsData | null>(null)
  // A string, so a new array with the same sections reads nothing again.
  const shownKey = [...shown].sort().join(',')

  useEffect(() => {
    let current = true
    const on = new Set(shownKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(on.has('recently-played'), [], () =>
        tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_TILES),
      ),
      read(on.has('your-djs'), [], async () =>
        orderYourDjs(await tauriApi.getKnownDjs(today), loadDjRecent()).slice(
          0,
          YOUR_DJS_MAX,
        ),
      ),
      read(on.has('genres'), null, () => tauriApi.getLibraryGroups()),
      read(on.has('recently-added'), [], () =>
        tauriApi.getRecentlyAddedTracks(RECENTLY_ADDED_ROWS),
      ),
      read(on.has('saved-sets'), [], async () =>
        (await tauriApi.listYouTubeSets()).slice(0, SAVED_SET_ROWS),
      ),
    ]).then(([recentlyPlayed, djs, groups, recentlyAdded, savedSets]) => {
      if (current)
        setData({
          recentlyPlayed,
          djs,
          groups,
          recentlyAdded,
          savedSets,
          today,
        })
    })
    return () => {
      current = false
    }
  }, [shownKey, playVersion])

  return data
}
```

- [ ] **Step 2: The failing test of what each section shows**

Create `src/components/search/sectionContent.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { genreTiles, sectionsEmpty } from './sectionContent'
import { DEFAULT_SECTION_PREFS } from '../../lib/search/sections'
import type { SectionsData } from './useSectionsData'

const nothing: SectionsData = {
  recentlyPlayed: [],
  djs: [],
  groups: { genres: [], addedRecently: 0, neverPlayed: 0 },
  recentlyAdded: [],
  savedSets: [],
  today: '2026-10-08',
}

describe('the genre tiles', () => {
  it('are the genres, then Recently added and Never played, each opening its filter', () => {
    const tiles = genreTiles({
      ...nothing,
      groups: {
        genres: [
          { genre: 'Tech House', count: 1581 },
          { genre: 'House', count: 1 },
        ],
        addedRecently: 12,
        neverPlayed: 8100,
      },
    })
    expect(tiles.map((tile) => [tile.name, tile.count, tile.filter])).toEqual([
      ['Tech House', '1,581 tracks', { genre: 'Tech House' }],
      ['House', '1 track', { genre: 'House' }],
      ['Recently added', '12 tracks · last 30 days', { added: 30 }],
      ['Never played', '8,100 tracks', { played: 'never' }],
    ])
    expect(tiles[0].colour).not.toBe(tiles[1].colour)
  })

  it('leave out a group of none', () => {
    expect(genreTiles(nothing)).toEqual([])
    expect(genreTiles({ ...nothing, groups: null })).toEqual([])
  })
})

describe('an empty Search page', () => {
  it('is one where no switched-on section has anything', () => {
    expect(sectionsEmpty(DEFAULT_SECTION_PREFS, nothing, [])).toBe(true)
    expect(sectionsEmpty(DEFAULT_SECTION_PREFS, nothing, ['traumer'])).toBe(
      false,
    )
  })

  it('ignores what a switched-off section would show', () => {
    const prefs = DEFAULT_SECTION_PREFS.map((pref) => ({
      ...pref,
      on: pref.id === 'genres',
    }))
    expect(sectionsEmpty(prefs, nothing, ['traumer'])).toBe(true)
  })
})
```

Run: `npx vitest run src/components/search`. Expected: FAIL, `Failed to resolve import "./sectionContent"`.

- [ ] **Step 3:**

Create `src/components/search/sectionContent.ts`:

```ts
// src/components/search/sectionContent.ts
// What each Search section shows, and whether it has anything: a section
// with nothing to show is left out, and with none at all the page shows
// "Search your library" as before.
import { trackCount } from '../../lib/search/labels'
import type { SearchSectionId, SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { SectionsData } from './useSectionsData'

/** True when no switched-on section has anything to show. */
export function sectionsEmpty(
  prefs: SectionPref[],
  data: SectionsData,
  recentSearches: string[],
): boolean {
  return prefs.every(
    (pref) => !pref.on || !hasContent(pref.id, data, recentSearches),
  )
}

export function hasContent(
  id: SearchSectionId,
  data: SectionsData,
  recentSearches: string[],
): boolean {
  switch (id) {
    case 'recent-searches':
      return recentSearches.length > 0
    case 'recently-played':
      return data.recentlyPlayed.length > 0
    case 'your-djs':
      return data.djs.length > 0
    case 'genres':
      return genreTiles(data).length > 0
    case 'recently-added':
      return data.recentlyAdded.length > 0
    case 'saved-sets':
      return data.savedSets.length > 0
  }
}

/** The genre tiles' colours, biggest genre first (the approved mockup's). */
const GENRE_COLOURS = [
  '#7c3aed',
  '#0e7490',
  '#be185d',
  '#c2410c',
  '#4338ca',
  '#15803d',
]

export interface GenreTile {
  key: string
  name: string
  count: string
  colour: string
  filter: TrackFilter
}

/** The biggest genres, then Recently added and Never played; a group of none is left out. */
export function genreTiles({ groups }: SectionsData): GenreTile[] {
  if (!groups) return []
  const tiles: GenreTile[] = groups.genres.map((group, index) => ({
    key: `genre:${group.genre}`,
    name: group.genre,
    count: trackCount(group.count),
    colour: GENRE_COLOURS[index % GENRE_COLOURS.length],
    filter: { genre: group.genre },
  }))
  if (groups.addedRecently > 0) {
    tiles.push({
      key: 'added',
      name: 'Recently added',
      count: `${trackCount(groups.addedRecently)} · last 30 days`,
      colour: '#334155',
      filter: { added: 30 },
    })
  }
  if (groups.neverPlayed > 0) {
    tiles.push({
      key: 'never-played',
      name: 'Never played',
      count: trackCount(groups.neverPlayed),
      colour: '#3f3f46',
      filter: { played: 'never' },
    })
  }
  return tiles
}
```

Run the same command: PASS, 4.

- [ ] **Step 4: Drawing them**

Create `src/components/search/SearchSections.tsx`:

```tsx
// src/components/search/SearchSections.tsx
// The Search page before you type (Search spec, Sections): the switched-on
// sections in the chosen order. A section with nothing to show is left out.
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { TrackCover } from '../track-table/TrackCover'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import {
  daysAgoLabel,
  djHue,
  djInitials,
  djLine,
} from '../../lib/search/labels'
import type { SearchSectionId, SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { Track } from '../../types/track'
import { genreTiles, hasContent } from './sectionContent'
import type { SectionsData } from './useSectionsData'
import './SearchSections.css'

export interface SectionActions {
  /** Runs a recent search again. */
  onSearch: (query: string) => void
  onForgetSearch: (query: string) => void
  onClearSearches: () => void
  onPlay: (track: Track, list: Track[], index: number) => void
  onOpenDj: (name: string) => void
  /** Opens All Tracks with this filter. */
  onOpenFilter: (filter: TrackFilter) => void
  onOpenSet: (videoId: string) => void
}

interface SearchSectionsProps extends SectionActions {
  prefs: SectionPref[]
  data: SectionsData
  recentSearches: string[]
}

export function SearchSections({
  prefs,
  data,
  recentSearches,
  ...actions
}: SearchSectionsProps) {
  return (
    <div className="search-sections">
      {prefs
        .filter((pref) => pref.on && hasContent(pref.id, data, recentSearches))
        .map((pref) => (
          <Section
            key={pref.id}
            id={pref.id}
            data={data}
            recentSearches={recentSearches}
            {...actions}
          />
        ))}
    </div>
  )
}

function Section({
  id,
  data,
  recentSearches,
  ...actions
}: {
  id: SearchSectionId
  data: SectionsData
  recentSearches: string[]
} & SectionActions) {
  switch (id) {
    case 'recent-searches':
      return (
        <SectionFrame
          title="Recent searches"
          action={
            <button
              type="button"
              className="link-btn"
              onClick={actions.onClearSearches}
            >
              Clear
            </button>
          }
        >
          <div className="search-chips">
            {recentSearches.map((query) => (
              <span key={query} className="search-chip">
                <button
                  type="button"
                  className="search-chip__run"
                  onClick={() => actions.onSearch(query)}
                >
                  {query}
                </button>
                <button
                  type="button"
                  className="search-chip__x"
                  aria-label={`Remove ${query}`}
                  onClick={() => actions.onForgetSearch(query)}
                >
                  <Icon name="X" size={12} />
                </button>
              </span>
            ))}
          </div>
        </SectionFrame>
      )
    case 'recently-played':
      return (
        <SectionFrame title="Recently played">
          <div className="search-tiles">
            {data.recentlyPlayed.map((track, index) => (
              <TrackTile
                key={track.id}
                track={track}
                onPlay={() => actions.onPlay(track, data.recentlyPlayed, index)}
              />
            ))}
          </div>
        </SectionFrame>
      )
    case 'your-djs':
      return (
        <SectionFrame title="Your DJs">
          <div className="search-djs">
            {data.djs.map((dj) => {
              const line = djLine(dj, data.today)
              return (
                <button
                  key={dj.nameKey}
                  type="button"
                  className="search-dj"
                  onClick={() => actions.onOpenDj(dj.displayName)}
                >
                  <span
                    className="search-dj__photo"
                    style={
                      dj.imageUrl
                        ? undefined
                        : { filter: `hue-rotate(${djHue(dj.displayName)}deg)` }
                    }
                  >
                    {dj.imageUrl ? (
                      <img
                        src={dj.imageUrl}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <span className="search-dj__initials">
                        {djInitials(dj.displayName)}
                      </span>
                    )}
                  </span>
                  <span className="search-dj__name">{dj.displayName}</span>
                  {line && <span className="search-dj__line">{line}</span>}
                </button>
              )
            })}
          </div>
        </SectionFrame>
      )
    case 'genres':
      return (
        <SectionFrame title="Your library by genre">
          <div className="search-genres">
            {genreTiles(data).map((tile) => (
              <button
                key={tile.key}
                type="button"
                className="search-genre"
                style={{ background: tile.colour }}
                onClick={() => actions.onOpenFilter(tile.filter)}
              >
                <span className="search-genre__name">{tile.name}</span>
                <span className="search-genre__count">{tile.count}</span>
              </button>
            ))}
          </div>
        </SectionFrame>
      )
    case 'recently-added':
      return (
        <SectionFrame title="Recently added">
          <div className="search-rows">
            {data.recentlyAdded.map((track, index) => (
              <button
                key={track.id}
                type="button"
                className="search-row"
                onClick={() => actions.onPlay(track, data.recentlyAdded, index)}
              >
                <TrackCover
                  key={`${track.id}\n${track.file_path}`}
                  track={track}
                />
                <span className="search-row__text">
                  <span className="search-row__title">
                    {track.title || 'Untitled'}
                  </span>
                  <span className="search-row__sub">
                    {track.artist || 'Unknown Artist'}
                  </span>
                </span>
                <span className="search-row__meta">
                  {daysAgoLabel(track.date_added, new Date())}
                </span>
              </button>
            ))}
          </div>
        </SectionFrame>
      )
    case 'saved-sets':
      return (
        <SectionFrame title="Sets you saved lately">
          <div className="search-rows">
            {data.savedSets.map((set) => (
              <button
                key={set.video_id}
                type="button"
                className="search-row"
                onClick={() => actions.onOpenSet(set.video_id)}
              >
                <span className="search-row__icon">
                  <Icon name="Radio" size={16} />
                </span>
                <span className="search-row__text">
                  <span className="search-row__title">{set.title}</span>
                  {set.channel && (
                    <span className="search-row__sub">{set.channel}</span>
                  )}
                </span>
                <span className="search-row__meta">
                  {daysAgoLabel(set.added_at, new Date())}
                </span>
              </button>
            ))}
          </div>
        </SectionFrame>
      )
  }
}

function SectionFrame({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="search-section">
      <div className="search-section__head">
        <h3 className="search-section__title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * A Recently played tile: the file's artwork, else a quiet square with a
 * small music note (the user, 2026-10-04: a large empty square looks broken).
 * The tile is wider than the table's 72px thumbnail, so it shows the full
 * picture, which the now-playing bar caches too.
 */
function TrackTile({ track, onPlay }: { track: Track; onPlay: () => void }) {
  // undefined while it is read, null for none.
  const [art, setArt] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let current = true
    getTrackArtworkUrl(track.id).then((url) => {
      if (current) setArt(url)
    })
    return () => {
      current = false
    }
  }, [track.id])

  return (
    <button type="button" className="search-tile" onClick={onPlay}>
      <span className="search-tile__art">
        {art ? (
          <img
            className="search-tile__img"
            src={art}
            alt=""
            draggable={false}
          />
        ) : art === null ? (
          <Icon name="Music" size={28} />
        ) : null}
        <span className="search-tile__play" aria-hidden="true">
          <Icon name="Play" size={16} />
        </span>
      </span>
      <span className="search-tile__title">{track.title || 'Untitled'}</span>
      <span className="search-tile__artist">
        {track.artist || 'Unknown Artist'}
      </span>
    </button>
  )
}
```

Create `src/components/search/SearchSections.css`:

```css
/* src/components/search/SearchSections.css */
/* Search before you type (Search spec; mockup A + B): sections under the
   field, and Customize. Rows that run sideways scroll inside themselves. */

.search-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  min-width: 0;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.search-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.search-section__title {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ---- Recent searches: chips with × (6px, not pills) ---- */

.search-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.search-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  max-width: 260px;
  border-radius: var(--radius-md);
  /* The mockup's #2a2a2a on Midnight; a light grey on Dawn. */
  background: color-mix(in srgb, var(--bg-primary), var(--text-primary) 10%);
}

.search-chip__run,
.search-chip__x {
  height: 100%;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
}

.search-chip__run {
  min-width: 0;
  overflow: hidden;
  padding: 0 4px 0 12px;
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-chip__x {
  display: grid;
  place-items: center;
  width: 26px;
  color: var(--text-muted);
  transition: color var(--motion-fast) var(--ease);
}

.search-chip__x:hover {
  color: var(--text-primary);
}

.search-chip:has(.search-chip__run:hover) {
  background: color-mix(in srgb, var(--bg-primary), var(--text-primary) 16%);
}

.search-chip__run:focus-visible,
.search-chip__x:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ---- Recently played: 150px tiles in a row that scrolls sideways ---- */

.search-tiles {
  display: flex;
  gap: 14px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.search-tile {
  flex: 0 0 150px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.search-tile__art {
  position: relative;
  display: grid;
  place-items: center;
  width: 150px;
  height: 150px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  /* The music note of a track without artwork (Icon colours itself from here). */
  color: var(--text-muted);
}

.search-tile__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The play button shows on hover; the whole tile plays. */
.search-tile__play {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.search-tile:hover .search-tile__play,
.search-tile:focus-visible .search-tile__play {
  opacity: 1;
  transform: none;
}

.search-tile:focus-visible {
  outline: none;
}

.search-tile:focus-visible .search-tile__art {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.search-tile__title,
.search-tile__artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-tile__title {
  margin-top: var(--space-2);
  font-size: var(--text-base);
}

.search-tile__artist {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* ---- Your DJs: round photos in a row that scrolls sideways ---- */

.search-djs {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.search-dj {
  flex: 0 0 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: var(--space-2) var(--space-1);
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.search-dj:hover {
  background: var(--bg-tertiary);
}

.search-dj:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* The photo, else the no-photo gradient (as on Search's DJ cards) with initials. */
.search-dj__photo {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  margin-bottom: var(--space-2);
  overflow: hidden;
  border-radius: 50%;
  background:
    radial-gradient(
      ellipse 38% 60% at 30% 62%,
      rgba(255, 255, 255, 0.1),
      transparent 70%
    ),
    linear-gradient(135deg, #3b2a5c, #1b1b2f 55%, #0f3b4a);
}

.search-dj__photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-dj__initials {
  color: rgba(255, 255, 255, 0.7);
  font-size: 26px;
  font-weight: 800;
}

.search-dj__name,
.search-dj__line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-dj__name {
  font-size: var(--text-base);
}

.search-dj__line {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

/* ---- Your library by genre: coloured tiles ---- */

.search-genres {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--space-3);
}

.search-genre {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  height: 92px;
  min-width: 0;
  padding: var(--space-3) 14px;
  overflow: hidden;
  border: none;
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    filter var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

/* The mockup's tilted square in the corner. */
.search-genre::after {
  content: '';
  position: absolute;
  right: -14px;
  bottom: -14px;
  width: 70px;
  height: 70px;
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.18);
  transform: rotate(25deg);
}

.search-genre:hover {
  filter: brightness(1.1);
}

.search-genre:active {
  transform: scale(0.97);
}

.search-genre:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.search-genre__name {
  max-width: 100%;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-genre__count {
  font-size: var(--text-sm);
  opacity: 0.85;
}

/* ---- Recently added, Sets you saved lately: rows ---- */

.search-rows {
  display: grid;
}

.search-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  height: 48px;
  min-width: 0;
  padding: 0 var(--space-2);
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.search-row:hover {
  background: var(--bg-tertiary);
}

.search-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.search-row__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.search-row__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.search-row__title,
.search-row__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-row__title {
  font-size: var(--text-base);
}

.search-row__sub,
.search-row__meta {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* ---- Customize: a plain list ---- */

.search-customize {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 480px;
}

.search-customize__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.search-customize__actions {
  display: flex;
  gap: var(--space-2);
}

.search-customize__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.search-customize__row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: 44px;
  padding: 0 var(--space-3);
}

.search-customize__row + .search-customize__row {
  border-top: 1px solid var(--border-subtle);
}

.search-customize__label {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-base);
}

.search-customize__label--off {
  color: var(--text-muted);
}

.search-customize__move {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.search-customize__move:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.search-customize__move:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.search-customize__move:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.search-customize__row .toggle-switch {
  margin-left: var(--space-2);
}
```

- [ ] **Step 5: Customize**

Create `src/components/search/CustomizeSections.tsx`:

```tsx
// src/components/search/CustomizeSections.tsx
// Search's Customize (Search spec): the sections as a plain list, each with
// ▲ / ▼ to move it and a switch. No grid and no drag. Done saves; Cancel
// leaves the page as it was.
import { useState } from 'react'
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'
import {
  moveSection,
  sectionLabel,
  setSectionOn,
  type SectionPref,
} from '../../lib/search/sections'

interface CustomizeSectionsProps {
  prefs: SectionPref[]
  onDone: (prefs: SectionPref[]) => void
  onCancel: () => void
}

export function CustomizeSections({
  prefs,
  onDone,
  onCancel,
}: CustomizeSectionsProps) {
  const [draft, setDraft] = useState(prefs)

  return (
    <div className="search-customize">
      <div className="search-customize__head">
        <h3 className="search-section__title">Sections on Search</h3>
        <div className="search-customize__actions">
          <button type="button" className="btn btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => onDone(draft)}
          >
            Done
          </button>
        </div>
      </div>
      <ul className="search-customize__list">
        {draft.map((pref, index) => {
          const label = sectionLabel(pref.id)
          return (
            <li key={pref.id} className="search-customize__row">
              <span
                className={
                  pref.on
                    ? 'search-customize__label'
                    : 'search-customize__label search-customize__label--off'
                }
              >
                {label}
              </span>
              <button
                type="button"
                className="search-customize__move"
                aria-label={`Move ${label} up`}
                disabled={index === 0}
                onClick={() => setDraft(moveSection(draft, index, -1))}
              >
                <Icon name="ChevronUp" size={16} />
              </button>
              <button
                type="button"
                className="search-customize__move"
                aria-label={`Move ${label} down`}
                disabled={index === draft.length - 1}
                onClick={() => setDraft(moveSection(draft, index, 1))}
              >
                <Icon name="ChevronDown" size={16} />
              </button>
              <ToggleSwitch
                checked={pref.on}
                onChange={(on) => setDraft(setSectionOn(draft, pref.id, on))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/search
git commit -m "feat(search): the sections before you type, and Customize"
```

---

### Task 7: The Search page and App

**Files:** Modify `src/components/views/SearchView.tsx`, `src/components/views/SearchView.css`, `src/App.tsx`.

- [ ] **Step 1: SearchView** — the sections under the field, the sliders button, remembering a query, the Playlists row above the tracks, the DJ hue from `labels.ts`

In `src/components/views/SearchView.tsx`, replace

```tsx
import { useMemo } from 'react'
import { Icon } from '../Icon'
import { useDjSearch } from '../dj/useDjSearch'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Track, Playlist } from '../../types/track'
import './SearchView.css'

// Reuse the same gradient helper as HomeView (copied — do not import from HomeView)
function getPlaylistGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
```

with

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useDjSearch } from '../dj/useDjSearch'
import { CustomizeSections } from '../search/CustomizeSections'
import { SearchSections } from '../search/SearchSections'
import { sectionsEmpty } from '../search/sectionContent'
import { useSectionsData } from '../search/useSectionsData'
import { djHue } from '../../lib/search/labels'
import { forgetSearch, rememberSearch } from '../../lib/search/recentSearches'
import {
  loadRecentSearches,
  loadSectionPrefs,
  saveRecentSearches,
  saveSectionPrefs,
} from '../../lib/search/storage'
import type { SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Track, Playlist } from '../../types/track'
import './SearchView.css'

/** A query is remembered when it stays unchanged this long while it has results. */
const REMEMBER_AFTER_MS = 2000

// Reuse the same gradient helper as HomeView (copied — do not import from HomeView)
function getPlaylistGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
```

In `src/components/views/SearchView.tsx`, replace

```tsx
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return gradients[Math.abs(hash) % gradients.length]
}

/** A DJ card without a photo: the mockup's gradient, turned to a hue of its own per name. */
function djHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(hash) % 360
}

interface SearchViewProps {
  tracks: Track[]
  playlists: Playlist[]
  onTrackPlay: (track: Track, tracks: Track[], index: number) => void
  onPlaylistSelect: (id: number) => void
  /** Held by App, so Back from a DJ page finds the same query and results. */
  query: string
  onQueryChange: (query: string) => void
  /** Opens a DJ page from the DJs row; a Spotify card passes its artist id. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
  /** App's Spotify data: whether to ask Spotify, and the index "you own N" is counted with. */
  spotify: SpotifyData
}

export function SearchView({
  tracks,
  playlists,
  onTrackPlay,
  onPlaylistSelect,
  query,
  onQueryChange,
  onOpenDj,
  spotify,
}: SearchViewProps) {
  const djCards = useDjSearch(query, spotify)

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return tracks.filter(t =>
      [t.title, t.artist, t.album, t.genre].some(f => f?.toLowerCase().includes(q))
```

with

```tsx
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return gradients[Math.abs(hash) % gradients.length]
}

interface SearchViewProps {
  tracks: Track[]
  playlists: Playlist[]
  onTrackPlay: (track: Track, tracks: Track[], index: number) => void
  onPlaylistSelect: (id: number) => void
  /** Held by App, so Back from a DJ page finds the same query and results. */
  query: string
  onQueryChange: (query: string) => void
  /** Opens a DJ page from the DJs row; a Spotify card passes its artist id. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
  /** App's Spotify data: whether to ask Spotify, and the index "you own N" is counted with. */
  spotify: SpotifyData
  /** Opens All Tracks with this filter (a genre tile). */
  onOpenAllTracks: (filter: TrackFilter) => void
  /** Opens a saved set in Sets. */
  onOpenSet: (videoId: string) => void
  /** Raised after each play: Recently played reads again. */
  playVersion: number
}

export function SearchView({
  tracks,
  playlists,
  onTrackPlay,
  onPlaylistSelect,
  query,
  onQueryChange,
  onOpenDj,
  spotify,
  onOpenAllTracks,
  onOpenSet,
  playVersion,
}: SearchViewProps) {
  const djCards = useDjSearch(query, spotify)
  const [prefs, setPrefs] = useState<SectionPref[]>(loadSectionPrefs)
  const [customizing, setCustomizing] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches)
  const shownSections = useMemo(
    () => prefs.filter((pref) => pref.on).map((pref) => pref.id),
    [prefs],
  )
  const sectionsData = useSectionsData(shownSections, playVersion)

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return tracks.filter(t =>
      [t.title, t.artist, t.album, t.genre].some(f => f?.toLowerCase().includes(q))
```

In `src/components/views/SearchView.tsx`, replace

```tsx
    )
  }, [playlists, query])

  const hasResults = djCards.length > 0 || filteredTracks.length > 0 || filteredPlaylists.length > 0
  const hasQuery = query.trim().length > 0

  // Format duration from ms to MM:SS
  function formatDuration(ms?: number) {
    if (!ms) return '--:--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
```

with

```tsx
    )
  }, [playlists, query])

  const hasResults = djCards.length > 0 || filteredTracks.length > 0 || filteredPlaylists.length > 0
  const hasQuery = query.trim().length > 0

  function changeRecentSearches(change: (list: string[]) => string[]) {
    setRecentSearches((list) => {
      const next = change(list)
      saveRecentSearches(next)
      return next
    })
  }

  // Search spec, Recent searches: a query is remembered when one of its
  // results is opened or played, or when it rests 2 seconds with results.
  function rememberQuery() {
    changeRecentSearches((list) => rememberSearch(list, query))
  }

  useEffect(() => {
    if (!query.trim() || !hasResults) return
    const timer = window.setTimeout(() => {
      changeRecentSearches((list) => rememberSearch(list, query))
    }, REMEMBER_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [query, hasResults])

  function saveSections(next: SectionPref[]) {
    setPrefs(next)
    saveSectionPrefs(next)
    setCustomizing(false)
  }

  // Format duration from ms to MM:SS
  function formatDuration(ms?: number) {
    if (!ms) return '--:--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
```

In `src/components/views/SearchView.tsx`, replace

```tsx
  function formatKey(key?: string) {
    return key ?? '—'
  }

  return (
    <div className="search-view">
      {/* Prominent search input */}
      <div className="search-view__input-wrapper">
        <Icon name="Search" size={20} className="search-view__input-icon" />
        <input
          type="text"
          className="search-view__input"
          placeholder="Search tracks, playlists, artists..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoFocus
        />
        {query && (
          <button className="search-view__input-clear" onClick={() => onQueryChange('')} type="button">
            <Icon name="X" size={16} />
          </button>
        )}
      </div>

      {/* Empty state — no query */}
      {!hasQuery && (
        <div className="search-view__empty">
          <Icon name="Search" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">Search your library</h2>
          <p className="search-view__empty-subtitle">Find tracks, playlists, artists, and more</p>
        </div>
      )}

      {/* No results state */}
      {hasQuery && !hasResults && (
        <div className="search-view__empty">
          <Icon name="SearchX" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">No results for "{query}"</h2>
          <p className="search-view__empty-subtitle">Try a different search term</p>
        </div>
      )}

      {/* Results */}
      {hasQuery && hasResults && (
        <div className="search-view__results">

          {/* DJs: the ones the user knows, then Spotify's — each opens a DJ page */}
          {djCards.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">DJs</h3>
                <span className="search-view__section-count">{djCards.length}</span>
              </div>
              <div className="search-view__dj-row">
                {djCards.map((dj) => (
                  <button
                    key={dj.key}
                    type="button"
                    className="search-view__dj-card"
                    onClick={() => onOpenDj(dj.name, dj.spotifyArtistId)}
                  >
                    <span
                      className="search-view__dj-photo"
                      style={dj.imageUrl ? undefined : { filter: `hue-rotate(${djHue(dj.name)}deg)` }}
                    >
                      {dj.imageUrl ? (
```

with

```tsx
  function formatKey(key?: string) {
    return key ?? '—'
  }

  return (
    <div className="search-view">
      {/* Prominent search input: it stays put while what is under it scrolls */}
      <div className="search-view__top">
        <div className="search-view__input-wrapper">
          <Icon name="Search" size={20} className="search-view__input-icon" />
          <input
            type="text"
            className="search-view__input"
            placeholder="Search tracks, playlists, artists..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {query ? (
            <button className="search-view__input-clear" onClick={() => onQueryChange('')} type="button">
              <Icon name="X" size={16} />
            </button>
          ) : (
            <button
              className="search-view__input-clear"
              onClick={() => setCustomizing((open) => !open)}
              type="button"
              aria-label="Customize Search"
              aria-pressed={customizing}
              title="Customize Search"
            >
              <Icon name="SlidersHorizontal" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* No query: the sections, scrolling under the field as one page */}
      {!hasQuery && (
        <div className="search-view__home">
          {customizing ? (
            <CustomizeSections
              prefs={prefs}
              onDone={saveSections}
              onCancel={() => setCustomizing(false)}
            />
          ) : sectionsData === null ? null : sectionsEmpty(prefs, sectionsData, recentSearches) ? (
            // An empty library and no history: the page as it was.
            <div className="search-view__empty">
              <Icon name="Search" size={48} className="search-view__empty-icon" />
              <h2 className="search-view__empty-title">Search your library</h2>
              <p className="search-view__empty-subtitle">Find tracks, playlists, artists, and more</p>
            </div>
          ) : (
            <SearchSections
              prefs={prefs}
              data={sectionsData}
              recentSearches={recentSearches}
              onSearch={onQueryChange}
              onForgetSearch={(q) => changeRecentSearches((list) => forgetSearch(list, q))}
              onClearSearches={() => changeRecentSearches(() => [])}
              onPlay={onTrackPlay}
              onOpenDj={(name) => onOpenDj(name, null)}
              onOpenFilter={onOpenAllTracks}
              onOpenSet={onOpenSet}
            />
          )}
        </div>
      )}

      {/* No results state */}
      {hasQuery && !hasResults && (
        <div className="search-view__empty">
          <Icon name="SearchX" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">No results for "{query}"</h2>
          <p className="search-view__empty-subtitle">Try a different search term</p>
        </div>
      )}

      {/* Results: the DJs, the playlists and the Tracks heading stay put; only the track rows scroll */}
      {hasQuery && hasResults && (
        <div className="search-view__results">

          {/* DJs: the ones the user knows, then Spotify's — each opens a DJ page */}
          {djCards.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">DJs</h3>
                <span className="search-view__section-count">{djCards.length}</span>
              </div>
              <div className="search-view__card-row">
                {djCards.map((dj) => (
                  <button
                    key={dj.key}
                    type="button"
                    className="search-view__dj-card"
                    onClick={() => {
                      rememberQuery()
                      onOpenDj(dj.name, dj.spotifyArtistId)
                    }}
                  >
                    <span
                      className="search-view__dj-photo"
                      style={dj.imageUrl ? undefined : { filter: `hue-rotate(${djHue(dj.name)}deg)` }}
                    >
                      {dj.imageUrl ? (
```

In `src/components/views/SearchView.tsx`, replace

```tsx
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tracks section */}
          {filteredTracks.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Tracks</h3>
                <span className="search-view__section-count">{filteredTracks.length}</span>
              </div>
              <div className="search-view__track-list">
                {filteredTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="search-view__track-row"
                    onDoubleClick={() => onTrackPlay(track, filteredTracks, index)}
                  >
                    <div className="search-view__track-index">
                      <span className="search-view__track-number">{index + 1}</span>
                      <span className="search-view__track-play">
                        <Icon name="Play" size={13} />
                      </span>
```

with

```tsx
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Playlists: a row of small cards, above the tracks, so nothing sits below the rows */}
          {filteredPlaylists.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Playlists</h3>
                <span className="search-view__section-count">{filteredPlaylists.length}</span>
              </div>
              <div className="search-view__card-row">
                {filteredPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    className="search-view__playlist-card"
                    onClick={() => {
                      rememberQuery()
                      onPlaylistSelect(playlist.id)
                    }}
                    type="button"
                  >
                    <span
                      className="search-view__playlist-art"
                      style={{ background: getPlaylistGradient(playlist.name) }}
                    >
                      <Icon name="Music" size={20} style={{ color: 'rgba(255,255,255,0.7)' }} />
                    </span>
                    <span className="search-view__playlist-text">
                      <span className="search-view__dj-name">{playlist.name}</span>
                      <span className="search-view__dj-subtitle">{playlist.track_count} tracks</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tracks: the heading stays, the rows scroll in their own area */}
          {filteredTracks.length > 0 && (
            <div className="search-view__section search-view__section--tracks">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Tracks</h3>
                <span className="search-view__section-count">{filteredTracks.length}</span>
              </div>
              <div className="search-view__track-list">
                {filteredTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="search-view__track-row"
                    onDoubleClick={() => {
                      rememberQuery()
                      onTrackPlay(track, filteredTracks, index)
                    }}
                  >
                    <div className="search-view__track-index">
                      <span className="search-view__track-number">{index + 1}</span>
                      <span className="search-view__track-play">
                        <Icon name="Play" size={13} />
                      </span>
```

In `src/components/views/SearchView.tsx`, replace

```tsx
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Playlists section */}
          {filteredPlaylists.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Playlists</h3>
                <span className="search-view__section-count">{filteredPlaylists.length}</span>
              </div>
              <div className="search-view__playlist-grid">
                {filteredPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    className="home-view__card search-view__playlist-card"
                    onClick={() => onPlaylistSelect(playlist.id)}
                    type="button"
                  >
                    <div
                      className="home-view__card-art"
                      style={{ background: getPlaylistGradient(playlist.name) }}
                    >
                      <Icon name="Music" size={24} style={{ color: 'rgba(255,255,255,0.7)' }} />
                    </div>
                    <div className="home-view__card-info">
                      <span className="home-view__card-name">{playlist.name}</span>
                      <span className="home-view__card-count">{playlist.track_count} tracks</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
```

with

```tsx
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Its layout** — the field on top; the sections scroll as one page; in results only the rows scroll (at least 200px); small playlist cards; `HomeView.css` is no longer imported (no `home-view__` class is used here now)

In `src/components/views/SearchView.css`, replace

```css
/* ============================================================
   SearchView — Spotify-style sectioned search results
   ============================================================ */

/* Import HomeView card styles unconditionally — SearchView uses .home-view__card,
   .home-view__card-art, .home-view__card-info, .home-view__card-name, .home-view__card-count
   for playlist cards. HomeView.css is not a CSS module, but this import guarantees the styles
   are present even if HomeView is not rendered in the same session. */
@import '../views/HomeView.css';

.search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-6);
  gap: var(--space-6);
  background: var(--bg-primary);
}

/* ---- Search input area ---- */

.search-view__input-wrapper {
  display: flex;
```

with

```css
/* ============================================================
   SearchView — Spotify-style sectioned search results
   ============================================================ */

/* The field stays at the top; under it either the sections scroll as one
   page, or the results sit still and only the track rows scroll. Nothing
   may widen the page: min-width: 0 down every flex child. */
.search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.search-view__top {
  flex: none;
  padding: var(--space-6) var(--space-6) 0;
}

.search-view__home {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-6);
}

/* ---- Search input area ---- */

.search-view__input-wrapper {
  display: flex;
```

In `src/components/views/SearchView.css`, replace

```css
  color: var(--text-secondary);
  margin: 0;
}

/* ---- Results container ---- */

.search-view__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* ---- Section header ---- */

.search-view__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search-view__section-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
```

with

```css
  color: var(--text-secondary);
  margin: 0;
}

/* ---- Results container ---- */

/* On a window too short to leave the rows their minimum, the results
   scroll as a whole instead. */
.search-view__results {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  overflow-y: auto;
  padding: var(--space-6) var(--space-6) 0;
}

/* ---- Section header ---- */

.search-view__section {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

/* The Tracks section takes the height left; its rows scroll inside it. */
.search-view__section--tracks {
  flex: 1;
  min-height: 200px;
}

.search-view__section-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
```

In `src/components/views/SearchView.css`, replace

```css
  border-radius: var(--radius-sm);
}

/* ---- Track list rows (Spotify-style, no virtualizer — short results list) ---- */

.search-view__track-list {
  display: flex;
  flex-direction: column;
}

.search-view__track-row {
  display: flex;
  align-items: center;
  height: 48px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
```

with

```css
  border-radius: var(--radius-sm);
}

/* ---- Track list rows (Spotify-style, no virtualizer — short results list) ---- */

.search-view__track-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: var(--space-6);
}

.search-view__track-row {
  flex: none;
  display: flex;
  align-items: center;
  height: 48px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
```

In `src/components/views/SearchView.css`, replace

```css

.search-view__track-bpm      { flex: 0 0 60px; }
.search-view__track-key      { flex: 0 0 60px; }
.search-view__track-genre    { flex: 0 0 90px; }
.search-view__track-duration { flex: 0 0 56px; }

/* ---- Playlist grid (reuses home-view__card + home-view__card-art, adds grid) ---- */

.search-view__playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-4);
}

.search-view__playlist-card {
  /* Inherits .home-view__card styles — no overrides needed */
}

/* ---- DJs row: round photo cards, as in the DJ pages mockup's Search ---- */

.search-view__dj-row {
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.search-view__dj-card {
  flex: 0 0 150px;
```

with

```css

.search-view__track-bpm      { flex: 0 0 60px; }
.search-view__track-key      { flex: 0 0 60px; }
.search-view__track-genre    { flex: 0 0 90px; }
.search-view__track-duration { flex: 0 0 56px; }

/* ---- DJs and Playlists rows: cards that scroll sideways inside the row ---- */

.search-view__card-row {
  display: flex;
  gap: var(--space-3);
  min-width: 0;
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.search-view__dj-card {
  flex: 0 0 150px;
```

In `src/components/views/SearchView.css`, replace

```css
  background:
    radial-gradient(ellipse 38% 60% at 30% 62%, rgba(255, 255, 255, 0.1), transparent 70%),
    radial-gradient(circle at 30% 34%, rgba(255, 255, 255, 0.14) 0 13%, transparent 14%),
    linear-gradient(135deg, #3b2a5c, #1b1b2f 55%, #0f3b4a);
}

.search-view__dj-photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
```

with

```css
  background:
    radial-gradient(ellipse 38% 60% at 30% 62%, rgba(255, 255, 255, 0.1), transparent 70%),
    radial-gradient(circle at 30% 34%, rgba(255, 255, 255, 0.14) 0 13%, transparent 14%),
    linear-gradient(135deg, #3b2a5c, #1b1b2f 55%, #0f3b4a);
}

/* A playlist's card: small, its gradient square beside its name, so the
   rows under it keep their room. */
.search-view__playlist-card {
  flex: 0 0 220px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-2);
  border: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.search-view__playlist-card:hover {
  background: var(--bg-tertiary);
}

.search-view__playlist-art {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
}

.search-view__playlist-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-view__dj-photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
```

- [ ] **Step 3: App** — `openDj` notes the DJ; `openAllTracks(filter)` replaces the sidebar's inline handler; Search gets the tiles' and sets' openers and `playVersion`

In `src/App.tsx`, replace

```tsx
  useYouTubeMusicMatches,
} from './components/youtube-music/useYouTubeMusic'
import { YouTubeMusicView } from './components/views/YouTubeMusicView'
import { DjView } from './components/views/DjView'
import { openSettingsSection } from './components/settings/openSections'
import { djKey } from './lib/dj/names'
import { useFolderTreeStore } from './store/folderTreeStore'
import { useTrackTableLayout } from './store/trackTableLayoutStore'
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
```

with

```tsx
  useYouTubeMusicMatches,
} from './components/youtube-music/useYouTubeMusic'
import { YouTubeMusicView } from './components/views/YouTubeMusicView'
import { DjView } from './components/views/DjView'
import { openSettingsSection } from './components/settings/openSections'
import { djKey } from './lib/dj/names'
import { noteDjOpened } from './lib/search/storage'
import { useFolderTreeStore } from './store/folderTreeStore'
import { useTrackTableLayout } from './store/trackTableLayoutStore'
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
```

In `src/App.tsx`, replace

```tsx
  // so Back still returns to where the first one was opened. The origin's view
  // stays set underneath (showSearch / showSets) and keeps its sidebar item lit.
  function openDj(name: string, spotifyArtistId: string | null = null, from?: DjOrigin) {
    const origin: DjOrigin =
      djPage?.from ?? from ?? (showSets ? { view: 'sets', openVideoId: null } : { view: 'search' })
    setDjPage({ name, spotifyArtistId, from: origin })
  }

  // Back: the view the first DJ page was opened from — Search with its query,
  // or Sets with the set the page was opened from open again. `djPage.from`
  // is gone once the page closes, so the set goes into `setsStart`.
  function closeDj() {
```

with

```tsx
  // so Back still returns to where the first one was opened. The origin's view
  // stays set underneath (showSearch / showSets) and keeps its sidebar item lit.
  function openDj(name: string, spotifyArtistId: string | null = null, from?: DjOrigin) {
    const origin: DjOrigin =
      djPage?.from ?? from ?? (showSets ? { view: 'sets', openVideoId: null } : { view: 'search' })
    setDjPage({ name, spotifyArtistId, from: origin })
    // Search's Your DJs shows the pages opened most recently first.
    noteDjOpened(name)
  }

  // Back: the view the first DJ page was opened from — Search with its query,
  // or Sets with the set the page was opened from open again. `djPage.from`
  // is gone once the page closes, so the set goes into `setsStart`.
  function closeDj() {
```

In `src/App.tsx`, replace

```tsx
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowAIChat(false)
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
```

with

```tsx
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowAIChat(false)
  }

  // All Tracks, from the sidebar, or with a filter set from Search's genre
  // tiles. Search holds the whole library already, so the filtered rows show
  // at once while the tracks load again.
  function openAllTracks(filter: TrackFilter | null = null) {
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(true)
    setTableFilter(filter)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    loadTracks(null, null)
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
```

In `src/App.tsx`, replace

```tsx
        setTableFilter(null)
        setShowSettings(false)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
      }}
      onShowAllTracks={() => {
        setStreamList(null)
        setDjPage(null)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(true)
        setTableFilter(null)
        setShowSettings(false)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
        loadTracks(null, null)
      }}
      onSearch={() => {
        setShowSearch(true)
        setStreamList(null)
        setDjPage(null)
        setShowSets(false)
        setSelectedFolder(null)
```

with

```tsx
        setTableFilter(null)
        setShowSettings(false)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
      }}
      onShowAllTracks={() => openAllTracks()}
      onSearch={() => {
        setShowSearch(true)
        setStreamList(null)
        setDjPage(null)
        setShowSets(false)
        setSelectedFolder(null)
```

In `src/App.tsx`, replace

```tsx
                playlists={playlists}
                onTrackPlay={handlePlayTrack}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onOpenDj={(name, spotifyArtistId) => openDj(name, spotifyArtistId, { view: 'search' })}
                spotify={spotify}
                onPlaylistSelect={(id) => {
                  handlePlaylistSelect(id)
                  setStreamList(null)
                  setDjPage(null)
                  setShowSearch(false)
                  setShowSets(false)
```

with

```tsx
                playlists={playlists}
                onTrackPlay={handlePlayTrack}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onOpenDj={(name, spotifyArtistId) => openDj(name, spotifyArtistId, { view: 'search' })}
                spotify={spotify}
                onOpenAllTracks={openAllTracks}
                onOpenSet={(videoId) => openSets({ openVideoId: videoId, initialQuery: '' })}
                playVersion={playVersion}
                onPlaylistSelect={(id) => {
                  handlePlaylistSelect(id)
                  setStreamList(null)
                  setDjPage(null)
                  setShowSearch(false)
                  setShowSets(false)
```

- [ ] **Step 4:** Run:
  - `npx tsc --noEmit -p .`: no errors;
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 551 passed (552)`;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 29 problems (10 errors, 19 warnings)`;
  - `npm run build`: passes.

  Commit:

```bash
git add src/components/views/SearchView.tsx src/components/views/SearchView.css src/App.tsx
git commit -m "feat(search): sections before you type, Customize, and results where only the rows scroll"
```

---

### Task 8: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-03-search-home-sections-design.md`.

- [ ] **Step 1:**

In `docs/superpowers/specs/2026-10-03-search-home-sections-design.md`, replace

```markdown

Each section is one component that reads only local data (no network, no
quota). A section with nothing to show is not rendered.

| Section | Shows | Click | Data |
|---|---|---|---|
| **Recent searches** | the last 10 searches as chips, each with ×; "Clear" | runs that search again | `localStorage['search_recent']`, this machine only |
| **Recently played** | 6 tiles: the file's artwork as the track table spec's 72px thumbnail (`artwork_path` is empty for every track), else the track table's quiet square with a small muted music-note icon in its middle (the user, 2026-10-04: a large empty square looks broken, a gradient differs from the table); title, artist; play button on hover | plays the track | new `get_recently_played_tracks(limit)` |
| **Your DJs** | round photos (Spotify image, else initials on a gradient), name, one line | opens the DJ page | new `get_known_djs(today)` + `localStorage['dj_recent']` |
| **Your library by genre** | tiles for the 6 biggest genres with counts, plus **Recently added** and **Never played** with counts | opens All Tracks with that filter | new `get_library_groups()` |
| **Recently added** | 6 rows (title, artist, "today" / "2 days ago") | plays the track | new `get_recently_added_tracks(limit)` (full track rows, shared with Home; the old `get_recently_added` returns five fields and cannot be played) |
| **Sets you saved lately** | 3 rows (title, channel, date saved) | opens the set in Sets | existing `listYouTubeSets()`, newest first |

**Recent searches.** A query is remembered when, trimmed, it is non-empty and
either the user opens or plays one of its results, or it stays unchanged for 2
```

with

```markdown

Each section is one component that reads only local data (no network, no
quota). A section with nothing to show is not rendered.

| Section | Shows | Click | Data |
|---|---|---|---|
| **Recent searches** | the last 10 searches as chips (6px corners, not pills), each with ×; "Clear" | runs that search again | `localStorage['search_recent']`, this machine only |
| **Recently played** | 6 tiles of 150px in a row that scrolls sideways: the file's artwork (`artwork_path` is empty for every track), read whole as the now-playing bar reads it — the table's 72px thumbnail would blur at 150px — else the track table's quiet square with a small muted music-note icon in its middle (the user, 2026-10-04: a large empty square looks broken, a gradient differs from the table); title, artist; play button on hover | plays the track | new `get_recently_played_tracks(limit)` |
| **Your DJs** | round photos (Spotify image, else initials on a gradient), name, one line; at most 20 | opens the DJ page | new `get_known_djs(today)` + `localStorage['dj_recent']` |
| **Your library by genre** | tiles for the 6 biggest genres with counts, plus **Recently added** and **Never played** with counts | opens All Tracks with that filter | new `get_library_groups()` |
| **Recently added** | 6 rows (title, artist, "today" / "2 days ago") | plays the track | new `get_recently_added_tracks(limit)` (full track rows, shared with Home; the old `get_recently_added` returns five fields and cannot be played) |
| **Sets you saved lately** | 3 rows (title, channel, date saved) | opens the set in Sets | existing `listYouTubeSets()`, newest first |

**Recent searches.** A query is remembered when, trimmed, it is non-empty and
either the user opens or plays one of its results, or it stays unchanged for 2
```

In `docs/superpowers/specs/2026-10-03-search-home-sections-design.md`, replace

```markdown
  clearing the field brings them back.
- Default: Recent searches, Recently played, Your DJs, Your library by genre.
  Recently added and Sets you saved lately are available but off.
- **Customize** — a sliders button at the right of the search field turns the
  sections into a plain list: each row has a switch, and ▲ / ▼ buttons to move
  it. No grid and no drag library (the DJ Overview's packed grid is not
  reused). **Done** saves. Stored in `localStorage['search_sections']` as an
  ordered list of `{ id, on }`; unknown ids are dropped, and a section added in
  a later version is appended, off.
- With an empty library and no history: only the current "Search your
  library" text, as today.


**Results while typing.** The search field, the DJs row and the Tracks heading
with its count stay put; **only the track rows scroll**, in their own area, as
on a DJ page's Tracks tab. The Playlists results, which today come after the
tracks, move above them as a row of cards like the DJs, so nothing sits below
the scrolling list. Without a query, the sections scroll under the field as
one page, and the field stays.

**Bug to fix with it:** with a long DJs row (7 cards) the page is wider than
the window — the field and the track rows run off the right edge, and Key,
Genre and Duration are cut off. The DJs row must scroll sideways inside itself
and nothing may widen the page (`min-width: 0` down the flex and grid chain to
the app's main column). Check in WebKit at 1000px wide.

## All Tracks filter (new)

All Tracks has only a text search today. It gains a filter: the `TrackFilter`
object of the track table spec
([`2026-10-04-track-table-design.md`](./2026-10-04-track-table-design.md)),
```

with

```markdown
  clearing the field brings them back.
- Default: Recent searches, Recently played, Your DJs, Your library by genre.
  Recently added and Sets you saved lately are available but off.
- **Customize** — a sliders button at the right of the search field turns the
  sections into a plain list: each row has a switch, and ▲ / ▼ buttons to move
  it. No grid and no drag library (the DJ Overview's packed grid is not
  reused). **Done** saves; **Cancel**, or the sliders button again, leaves
  the page as it was. Stored in `localStorage['search_sections']` as an
  ordered list of `{ id, on }`; unknown ids are dropped, and a section added in
  a later version is appended, off.
- With an empty library and no history: only the current "Search your
  library" text, as today.


**Results while typing.** The search field, the DJs row and the Tracks heading
with its count stay put; **only the track rows scroll**, in their own area, as
on a DJ page's Tracks tab. The Playlists results, which today come after the
tracks, move above them as a row of small cards (the 48px gradient square
beside the name and count; a 126px square would leave the rows 25px on a
760px window when DJs show too), so nothing sits below the scrolling list.
The rows keep at least 200px: on a window too short for that, the results
scroll as a whole. Without a query, the sections scroll under the field as
one page, and the field stays.

**Bug to fix with it:** with a long DJs row (7 cards) the page is wider than
the window — the field and the track rows run off the right edge, and Key,
Genre and Duration are cut off. The DJs row must scroll sideways inside itself
and nothing may widen the page (`min-width: 0` down the flex and grid chain to
the app's main column). Check in WebKit at 1000px wide. (By the Search plan
this no longer happened: the track table plans had set `min-width: 0` on
App's view wrappers. The plan keeps `min-width: 0` on every new box, and its
check measures it.)

## All Tracks filter (new)

All Tracks has only a text search today. It gains a filter: the `TrackFilter`
object of the track table spec
([`2026-10-04-track-table-design.md`](./2026-10-04-track-table-design.md)),
```

- [ ] **Step 2:** Commit only this file:

```bash
git add docs/superpowers/specs/2026-10-03-search-home-sections-design.md
git commit -m "docs(spec): Search as built — full-size tiles, small playlist cards, rows keep 200px"
```

---

### Task 9: Check in the app (WebKit)

- [ ] **Step 1:** `npm run tauri dev`, then open Search.
- [ ] **Step 2: Go through this checklist by hand.**
  - **Before typing:** Recent searches (after a search or two), Recently played with real covers (a track without one shows the quiet square and note), Your DJs, Your library by genre.
  - **Recently played:** hover a tile — the play button shows; click — it plays, and after the play the tile moves to the front.
  - **A genre tile** opens All Tracks with "Tech House ✕" on the Filter button; the text search works inside it; ✕ clears it. **Never played** shows the never-played tracks (none for a moment, then the rows); **Recently added** shows "Added 30 days".
  - **Your DJs:** open a DJ page, go Back: that DJ is now first. The line shows the next gig or "watching for sets".
  - **Recent searches:** type a query that finds something and wait 2 seconds, or play a result: it shows as a chip after clearing the field. A chip runs it; × removes it; Clear removes all.
  - **Customize:** the sliders button → move a section, switch Recently added and Sets you saved lately on → Done. Restart the app: the order and switches stay. Cancel leaves it as it was.
  - **Results:** type a query matching DJs, a playlist and many tracks. The field, the DJs, the playlists and the Tracks heading stay; only the rows scroll. On a short window the whole results area scrolls and the rows keep their room.
  - **1000px wide:** with a long DJs row, nothing is cut off on the right; the DJs row scrolls sideways.
  - **Sets you saved lately** (when on): a row opens that set in Sets.
  - **An empty library** (or every section off): "Search your library", as before.
  - **Dawn:** chips, tiles and rows read.
- [ ] **Step 3:** Commit any fix-ups as `fix(search): …`.
