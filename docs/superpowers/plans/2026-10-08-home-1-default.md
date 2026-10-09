# Home H1: the Default Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home becomes the spec's grid of cards, with its eight default cards, and the old widgets go:
- **The grid:** react-grid-layout as before (4 columns, rows of 120px), in the quiet style: dark cards, small grey uppercase titles; colour only from numbers, covers and genre tiles. The greeting and the date stay above it.
- **Eight cards:** Needs you (without its New sets row, plan H3), Recently played, Your DJs play next, Library by genre, Your playlists, Library stats, Not analyzed, Quick actions — in the default layout.
- **Playing from Home:** a track row's ▶ or a double click plays through App's play handler with the card's list as the queue; the track playing shows the equalizer; a playlist's ▶ plays it from its first track and records the playlist. A row is a drag source (one row) onto the sidebar's playlists and folders.
- **Customize:** the catalog grouped under Jump back in, Needs you, Your library, Gig prep, each card "on Home" or "+ Add"; Reset; Save stores `{ "version": 2, "layout": [...] }`. The old stored layout (a bare list) is replaced by the default once.
- **Gone:** the AI Recommendations, Library Insights and other old widgets, and the commands only they called (`get_recently_played`, `get_recently_added`, `get_library_insights`).

**Architecture:**
- **Rust:** `db/home.rs` holds two read-only queries on existing tables (no migration): `get_upcoming_gigs(today, limit)` — the gigs on or after the local day of every DJ with a page, soonest first, with the DJ's name; `get_track_ids_without_bpm()` — no analysis row, or one without a BPM. `commands/home.rs` exposes them through Search's `with_db` (now `pub(crate)`). Home reuses Search's `get_recently_played_tracks` and `get_library_groups`.
- **Pure TypeScript** (tested): `lib/home/cards.ts` — the catalog (ids, titles, groups, default sizes and limits), the default layout, the stored form (old form → default once, unknown ids dropped, limits from the catalog, sizes clamped); `lib/home/labels.ts` — the time played, Needs you's rows, gig rows, Library stats by width, BPM in whole beats; `components/home/content.ts` — the genre tiles and the playlists shown.
- **Components** (`components/home/`): `useHomeData` reads what the cards on Home need (again when App's data-version number changes), `HomeCards` draws each card in its frame, `HomeTrackRows` the shared track rows, `HomeCatalog` and `HomeHeader` Customize. `views/HomeView` lays them out; `dashboardStore` stores version 2 and gains Reset.
- **App:** Home's props; `DjOrigin` gains `{ view: 'home' }` (Back returns to Home); `handlePlayTrack(…, playlistId?)`; `playPlaylist(id)`; `analyzeTrackIds(ids)` shared by Analyze All Tracks and Home; `openSettingsOn(section)` for Import folder; `dataVersion` (after an analysis and a rescan); All Tracks opened with a filter right after a playlist or a folder waits for the library (`libraryPending`).

**Tech Stack:** Rust (rusqlite), React 19, TypeScript, react-grid-layout 2 (`/legacy`), Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-home-cards-design.md` and its approved mockup `2026-10-04-home-cards-mockup.html`. The spec's "Depends on": Search built `get_recently_played_tracks`, `get_recently_added_tracks`, `get_known_djs`, `get_library_groups`, `dj_recent` and `openAllTracks(filter)`; the drag layer and the equalizer come from the track table plans.

**Split** (the user's choice, 2026-10-08): **H1** (this plan) the default Home; **H2** Recently added, Last playlist, Your DJs, New likes you don't own, BPM & key (`get_last_played_playlist`, `get_bpm_key_counts`); **H3** New sets (migration 018 `seen_at`, `get_new_dj_finds`, Mark all seen with Undo), Sets you saved lately, Needs you's New sets row, and the `yt-new-sets` raise of the data-version number. The user checks each by hand before the next.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 9 writes them into the spec):
- **Playlist covers are gradient squares** picked by the name, as on Search's playlist cards and in the approved mockup — no track or artwork is read per playlist. Your playlists (and Library stats' count) shows every playlist the sidebar lists — any `playlist_type` but `folder`; the backend files AI playlists as `ai_generated`, which Search's own filter (`manual` / `ai`) misses, left for Search. An empty playlist has no ▶ (and a ▶ on one that emptied meanwhile says "This playlist is empty").
- **Home has no selection:** a single click on a track row does nothing; ▶ (under the mouse, in place of the number) or a double click plays; a drag carries that one row. BPM shows whole beats ("125"), as the mockup.
- **Needs you's numbers** take their kind's colour — Spotify green, YouTube Music red, the accent, yellow for the gig's weekday — mixed toward `--text-primary`, as `--row-accent` is, so they read on the light themes. The list a likes row opens is the one with the most new likes (the sidebar's first on a tie). A gig without a venue says the city, without either "has a gig"; a date not in this year shows the year.
- **Analyze all** (Not analyzed, Quick actions, Needs you) sends the ids Home read; with none, "Everything is analyzed"; while an analysis runs, "Analysis is already running" (toasts). The sidebar's Analyze All Tracks is unchanged.
- **The data-version number** is `playVersion + dataVersion`: `playVersion` already rises after each recorded play; `dataVersion` rises after `analysis-complete`, after the `library-changed` rescan, and after a Move to folder (from the table or a drag from Home; Undo too) — Home's rows hold file paths. Nothing is read before the stored layout is loaded, and each card reads only what it shows (moving or resizing reads nothing).
- **All Tracks with a filter** (a genre tile, Library by genre's header link has none) right after a playlist, a folder or a search in the table shows nothing until the library has loaded, instead of those rows filtered or "No tracks match" for a moment. From Search, and from the sidebar, nothing changes.
- **Customize:** the header reads "Customize Home" with a one-line hint, Reset (a link button), Cancel, Save; a card's title row is its drag handle and holds its ×; its body cannot be clicked and is dimmed. Library stats is a single line at 1×1: "tracks · 359 added lately", as the mockup.
- **Box sizing:** the app has no global `border-box`; `HomeView.css` sets it inside Home, so a card is exactly its grid cell (found in WebKit: without it a 1-row card was 146px tall).
- **Keyboard:** a track row's ▶ is hidden with `opacity`, not `display`, so Tab reaches it (Home has no selection to play with Enter, as the table does); reached, it takes the number's place. A playlist's ▶ the same.
- **Narrow cards:** a card body is a size container. Genre tiles are 4 to a row in a 2-column card and fewer when it is narrower; Not analyzed under 200px puts Analyze all under the number (the title says what it is); Quick actions' labels wrap; a long list name in Needs you takes at most 45% of the row.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `ad20f17`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc`, each task's tests and `cargo test` pass at every task's end.
- **Review:** an independent review applied the plan to a clean copy (all 55 blocks matched once; every task's checks passed), drove it in WebKit (clicks, Customize add / move / resize / Cancel / Save, dragging rows onto a playlist and a folder, the light Dawn theme) and found no blockers. Its findings are fixed here:
  - a track could not be played from Home by keyboard (▶ was `display: none` and rows take no focus);
  - a long Spotify / YouTube Music list name pushed Needs you's text to nothing and made the card scroll sideways (765/556);
  - after a Move to folder, Home's rows kept the old file paths until the next rescan — `moveFiles` now raises `dataVersion`;
  - narrow cards (a 900px window with the sidebar open): Analyze all over the number, genre names broken mid-word, Quick actions' labels past their buttons;
  - focus rings clipped at the top of a card's body;
  - after a search in the table, a genre tile showed the search's rows filtered — the search now marks `tracks` as not the library;
  - Quick actions' Analyze all, clicked before the ids were read, said "Everything is analyzed" — it now waits for them;
  - AI playlists (`ai_generated`) were missing from Your playlists;
  - "Your DJs play next" was cut in Customize's list — names wrap.
  - Left as it is: a failed read shows a card's empty text (the spec's "a failure reads as empty"), not an error.
- **Builds and tests:**
  - `cargo test`: 3 new (449); `cargo build` shows no warning.
  - `vitest`: 30 new. The repo counts 582 after it: 581 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (`localStorage.removeItem is not a function` under Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy shows 8 of `tracklist.test.ts`'s tests skipped: their fixtures are not in git. It counts 567 passed there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems — the baseline's 29 less the deleted `WidgetCatalog.tsx`'s — none new; `vite build` passes.
- **In WebKit** (a test page with the real AppShell, Sidebar collapsed and HomeView inside App's wrappers, IPC mocked with 8 played tracks, 5 gigs, 6 genres, 223 tracks without a BPM, 6 playlists and a folder, Spotify 3 and YouTube Music 1 new likes, the first track playing):
  - At 1280×900 the default layout matches the mockup: two 2×2 rows (cards 574×252), Your playlists 4×1, then Library stats, Not analyzed, Quick actions (120px tall each). Nothing in any card reaches past its sides; Recently played (304/198) and Your DJs play next (217/198) scroll inside their cards. The same at 1000px wide.
  - The playing row shows the equalizer and its title in the accent; under the mouse another row shows ▶ and a hover background; a playlist shows ▶ over its cover.
  - Clicks: ▶ on row 2 → `play 2 of 1,…,8 at 1`; a double click on row 3 → `play 3 … at 2`; Needs you → `stream spotify liked`, `stream youtube-music LM`, `analyze 223`, `dj Traumer`; a gig → `dj Traumer`; Tech House → `{"genre":"Tech House"}`, Added lately → `{"added":30}`, Never played → `{"played":"never"}`; "8,583 tracks" → `null`; a playlist card → `open playlist 6`, its ▶ → `play playlist 7`; Not analyzed's Analyze all → `analyze 223`; Quick actions → `import folder`, `analyze 223`, `sets`, `new playlist`.
  - Customize: the catalog lists the 8 cards under the four groups, "on Home"; × removes a card and "+ Add" brings it back; Reset puts back the default eight; Save stores `{"version":2,"layout":[…8 cards…]}`.
  - A stored layout of Library stats 2×1, Not analyzed 2×1, Quick actions 4×1: only those three, Library stats as "8,583 tracks · 6 playlists · 1 folder" over "359 added lately · 8,142 never played"; only `get_library_groups` and `get_track_ids_without_bpm` are read. The old form (a bare list) shows the default eight and is saved once.
  - Empty library and no history: every card shows its empty text ("Nothing new", "Nothing played yet", "No upcoming gigs", "No genres yet", "No playlists yet", "No tracks yet", "Everything is analyzed").

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/home.rs`, `db/mod.rs` | create / modify | the two queries and their tests; later the old widgets' queries removed |
| `src-tauri/src/commands/home.rs`, `commands/mod.rs`, `commands/sections.rs`, `lib.rs` | create / modify | the commands (the wire shape tested); `with_db` shared |
| `src-tauri/src/commands/dashboard.rs` | modify | the old widgets' commands removed |
| `src/types/home.ts`, `src/lib/tauri-api.ts` | create / modify | the gig type and the two calls; the old calls removed |
| `src/lib/home/cards.ts` (+ test) | create | the catalog, the default layout, the stored form |
| `src/lib/home/labels.ts` (+ test), `src/components/home/content.ts` (+ test), `src/components/search/sectionContent.ts` | create / modify | the words and numbers on the cards; the genre tiles and playlists shown |
| `src/components/home/useHomeData.ts`, `HomeTrackRows.tsx`, `HomeCards.tsx`, `HomeCatalog.tsx`, `HomeHeader.tsx` | create | reading, the cards, the track rows, Customize |
| `src/components/views/HomeView.tsx`, `.css`; `src/store/dashboardStore.ts` (+ test) | rewrite / modify | the grid; version 2 and Reset |
| `src/components/views/widgets/` | delete | the old widgets |
| `src/App.tsx` | modify | Home's props and what they act through |
| `docs/superpowers/specs/2026-10-04-home-cards-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign`. `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 551 passed (552)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 29 problems (10 errors, 19 warnings)`;
  - `cd src-tauri && cargo test 2>&1 | grep "test result" | head -1`: `446 passed`.

---

### Task 1: The queries

**Files:** Create `src-tauri/src/db/home.rs`; modify `src-tauri/src/db/mod.rs`.

- [ ] **Step 1: The module and its tests**

Create `src-tauri/src/db/home.rs`:

```rust
// src-tauri/src/db/home.rs
//! What Home's cards read that Search does not (Home cards spec, Data): the
//! upcoming gigs of the DJs with a page, and the tracks without a BPM. Local
//! data only; the queries Search shares live in `sections.rs`.

use super::Database;
use rusqlite::{params, Result};
use serde::Serialize;

/// A gig of a DJ with a page, for Your DJs play next and Needs you.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingGig {
    pub name_key: String,
    pub display_name: String,
    /// Resident Advisor's event id; with the name key, the row's key.
    pub event_id: String,
    /// "2026-10-12", the venue's local day.
    pub date: String,
    pub venue: Option<String>,
    pub city: Option<String>,
    /// ISO code.
    pub country: Option<String>,
}

impl Database {
    /// The gigs on or after `today` ("2026-10-04", the user's local day, as
    /// the DJ page's `splitGigs` compares it) of every DJ with a page,
    /// soonest first; on one day, by the DJ's name.
    pub fn get_upcoming_gigs(&self, today: &str, limit: i64) -> Result<Vec<UpcomingGig>> {
        let mut stmt = self.conn.prepare(
            "SELECT g.name_key, p.display_name, g.ra_event_id, g.date, g.venue, g.city, g.country
             FROM dj_gigs g
             JOIN dj_profiles p ON p.name_key = g.name_key
             WHERE substr(g.date, 1, 10) >= ?1
             ORDER BY substr(g.date, 1, 10), p.display_name COLLATE NOCASE, g.name_key, g.ra_event_id
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![today, limit], |row| {
            Ok(UpcomingGig {
                name_key: row.get(0)?,
                display_name: row.get(1)?,
                event_id: row.get(2)?,
                date: row.get(3)?,
                venue: row.get(4)?,
                city: row.get(5)?,
                country: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    /// Every track with no BPM (no analysis row, or one without a BPM), by
    /// id: what Home's Analyze all analyzes, and its length is Not analyzed's
    /// number. `analyze_tracks_batch(ids, false)` skips only tracks with both
    /// a BPM and a key, so all of these are analyzed.
    pub fn get_track_ids_without_bpm(&self) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id FROM tracks t
             LEFT JOIN track_analysis a ON a.track_id = t.id
             WHERE a.bpm IS NULL
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect()
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

    fn track(db: &Database, title: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title) VALUES (?1, ?1, ?2)",
                params![format!("/m/{title}.mp3"), title],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    #[test]
    fn upcoming_gigs_are_from_today_on_soonest_first_across_djs_with_a_page() {
        let db = db();
        db.conn
            .execute_batch(
                "INSERT INTO dj_profiles (name_key, display_name) VALUES
                     ('traumer', 'Traumer'), ('hot since 82', 'Hot Since 82');
                 INSERT INTO dj_gigs (name_key, ra_event_id, date, venue, city, country) VALUES
                     ('traumer', 'e1', '2026-10-03', 'Yesterday Club', 'Paris', 'FR'),
                     ('traumer', 'e2', '2026-10-06', 'Hï Ibiza', 'Ibiza', 'ES'),
                     ('hot since 82', 'h2', '2026-10-11', 'Seaseaclub', 'Barcelona', 'ES'),
                     ('hot since 82', 'h1', '2026-10-04', 'Ushuaïa', 'Ibiza', 'ES'),
                     ('traumer', 'e3', '2026-10-04T23:00:00', 'Late Club', NULL, NULL),
                     ('nobody', 'n1', '2026-10-05', 'No Page', NULL, NULL);",
            )
            .unwrap();

        let gigs = db.get_upcoming_gigs("2026-10-04", 20).unwrap();

        let order: Vec<_> = gigs.iter().map(|g| (g.display_name.as_str(), g.event_id.as_str())).collect();
        assert_eq!(
            order,
            vec![("Hot Since 82", "h1"), ("Traumer", "e3"), ("Traumer", "e2"), ("Hot Since 82", "h2")]
        );
        assert_eq!(
            gigs[2],
            UpcomingGig {
                name_key: "traumer".into(),
                display_name: "Traumer".into(),
                event_id: "e2".into(),
                date: "2026-10-06".into(),
                venue: Some("Hï Ibiza".into()),
                city: Some("Ibiza".into()),
                country: Some("ES".into()),
            }
        );
        assert_eq!(db.get_upcoming_gigs("2026-10-04", 1).unwrap().len(), 1);
    }

    #[test]
    fn track_ids_without_bpm_are_those_with_no_analysis_or_no_bpm() {
        let db = db();
        let none = track(&db, "none");
        let key_only = track(&db, "key only");
        let bpm = track(&db, "bpm");
        let both = track(&db, "both");
        db.save_key_analysis(key_only, "8A", 0.8).unwrap();
        db.save_bpm_analysis(bpm, 126.0, 0.9).unwrap();
        db.save_bpm_analysis(both, 124.0, 0.9).unwrap();
        db.save_key_analysis(both, "5A", 0.8).unwrap();

        assert_eq!(db.get_track_ids_without_bpm().unwrap(), vec![none, key_only]);
    }
}
```

In `src-tauri/src/db/mod.rs`, replace

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

with

```rust
// Database layer - SQLite connection, migrations, queries

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

pub mod dj;
pub mod home;
pub mod sections;
pub mod spotify;
pub mod youtube_music;

/// Track with optional analysis fields: (track, bpm, bpm_confidence, musical_key, key_confidence)
pub type TrackWithAnalysis = (Track, Option<f64>, Option<f64>, Option<String>, Option<f64>);
```

- [ ] **Step 2:** `cd src-tauri && cargo test --lib db::home`: PASS, 2. Commit:

```bash
git add src-tauri/src/db/home.rs src-tauri/src/db/mod.rs
git commit -m "feat(home): queries for your DJs' upcoming gigs and the tracks without a BPM"
```

---

### Task 2: The commands

**Files:** Create `src-tauri/src/commands/home.rs`; modify `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/sections.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: The commands, with the wire shape tested**

Create `src-tauri/src/commands/home.rs`:

```rust
// src-tauri/src/commands/home.rs
//! Home's cards (Home cards spec, Data): what they read beyond Search's
//! sections (`commands/sections.rs`). Local data only.

use tauri::State;

use crate::commands::library::AppState;
use crate::commands::sections::with_db;
use crate::db::home::UpcomingGig;
use crate::error::AppError;

/// The gigs on or after `today` (the user's local day, "2026-10-04") of every
/// DJ with a page, soonest first.
#[tauri::command]
pub fn get_upcoming_gigs(today: String, limit: i64, state: State<AppState>) -> Result<Vec<UpcomingGig>, AppError> {
    with_db(&state, "upcoming gigs", |db| db.get_upcoming_gigs(&today, limit))
}

/// Every track with no BPM: Not analyzed's number, and what Analyze all analyzes.
#[tauri::command]
pub fn get_track_ids_without_bpm(state: State<AppState>) -> Result<Vec<i64>, AppError> {
    with_db(&state, "tracks without a BPM", |db| db.get_track_ids_without_bpm())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn an_upcoming_gig_is_camel_case() {
        let gig = UpcomingGig {
            name_key: "traumer".into(),
            display_name: "Traumer".into(),
            event_id: "e2".into(),
            date: "2026-10-06".into(),
            venue: Some("Hï Ibiza".into()),
            city: Some("Ibiza".into()),
            country: None,
        };

        assert_eq!(
            serde_json::to_value(gig).unwrap(),
            json!({
                "nameKey": "traumer",
                "displayName": "Traumer",
                "eventId": "e2",
                "date": "2026-10-06",
                "venue": "Hï Ibiza",
                "city": "Ibiza",
                "country": null
            })
        );
    }
}
```

In `src-tauri/src/commands/mod.rs`, replace

```rust
pub mod ai;
pub mod analysis;
pub mod conversations;
pub mod dashboard;
pub mod dj;
pub mod genre;
pub mod library;
pub mod move_tracks;
pub mod playback;
pub mod playlists;
pub mod sections;
pub mod server;
```

with

```rust
pub mod ai;
pub mod analysis;
pub mod conversations;
pub mod dashboard;
pub mod dj;
pub mod genre;
pub mod home;
pub mod library;
pub mod move_tracks;
pub mod playback;
pub mod playlists;
pub mod sections;
pub mod server;
```

In `src-tauri/src/commands/sections.rs`, replace

```rust
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
```

with

```rust
    dto.bpm_confidence = bpm_confidence;
    dto.musical_key = musical_key;
    dto.key_confidence = key_confidence;
    dto
}

/// Runs a read on the open database; Home's commands use it too.
pub(crate) fn with_db<T>(
    state: &State<AppState>,
    what: &str,
    read: impl FnOnce(&Database) -> rusqlite::Result<T>,
) -> Result<T, AppError> {
    let db_lock = state
        .db
```

- [ ] **Step 2: Register them**

In `src-tauri/src/lib.rs`, replace

```rust
            commands::sections::get_library_groups,
        ])
```

with

```rust
            commands::sections::get_library_groups,
            // Home's cards (Search's sections above are shared)
            commands::home::get_upcoming_gigs,
            commands::home::get_track_ids_without_bpm,
        ])
```

- [ ] **Step 3:** `cd src-tauri && cargo test --lib`: PASS, 449; `cargo build` shows no warning. Commit:

```bash
git add src-tauri/src/commands/home.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/sections.rs src-tauri/src/lib.rs
git commit -m "feat(home): commands for Home's gigs and its Analyze all"
```

---

### Task 3: The types and the calls

**Files:** Create `src/types/home.ts`; modify `src/lib/tauri-api.ts`.

- [ ] **Step 1:**

Create `src/types/home.ts`:

```ts
// src/types/home.ts
// What Home's cards read beyond Search's sections (Home cards spec, Data).

/** A gig of a DJ with a page (`get_upcoming_gigs`), for Your DJs play next. */
export interface UpcomingGig {
  nameKey: string
  displayName: string
  /** Resident Advisor's event id. */
  eventId: string
  /** "2026-10-12", the venue's local day. */
  date: string
  venue: string | null
  city: string | null
  /** ISO code. */
  country: string | null
}
```

In `src/lib/tauri-api.ts`, replace

```ts
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

with

```ts
  SpotifyLibrary,
  SpotifyStatus,
  Verdict,
} from '../types/spotify'
import type { YtmLibrary, YtmStatus } from '../types/youtubeMusic'
import type { LibraryGroups, RecentlyPlayedTrack, YourDj } from '../types/sections'
import type { UpcomingGig } from '../types/home'
import type {
  ArtistCandidate,
  DjCandidates,
  DjPage,
  DjRefresh,
  DjSetTrack,
```

In `src/lib/tauri-api.ts`, replace

```ts
  async getLibraryGroups(): Promise<LibraryGroups> {
    return await invoke('get_library_groups')
  },
```

with

```ts
  async getLibraryGroups(): Promise<LibraryGroups> {
    return await invoke('get_library_groups')
  },

  /** The gigs on or after `today` ("2026-10-04", the local day) of every DJ with a page, soonest first. */
  async getUpcomingGigs(today: string, limit: number): Promise<UpcomingGig[]> {
    return await invoke('get_upcoming_gigs', { today, limit })
  },

  /** Every track with no BPM: Home's Not analyzed number, and what its Analyze all analyzes. */
  async getTrackIdsWithoutBpm(): Promise<number[]> {
    return await invoke('get_track_ids_without_bpm')
  },
```

(The old widgets' three calls below it go in Task 8, with the widgets.)

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/types/home.ts src/lib/tauri-api.ts
git commit -m "feat(home): the gig type and Home's calls"
```

---

### Task 4: The catalog and the stored layout

**Files:** Create `src/lib/home/cards.ts`, `src/lib/home/cards.test.ts`.

- [ ] **Step 1: The tests**

Create `src/lib/home/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  HOME_CARDS,
  HOME_GROUPS,
  defaultLayout,
  fitToCatalog,
  newCardItem,
  readStoredLayout,
  storedLayoutJson,
} from './cards'

const places = (layout: { i: string; x: number; y: number; w: number; h: number }[]) =>
  layout.map(({ i, x, y, w, h }) => [i, x, y, w, h])

describe('the catalog', () => {
  it('puts every card under one of the four groups', () => {
    for (const card of HOME_CARDS) expect(HOME_GROUPS).toContain(card.group)
    expect(new Set(HOME_CARDS.map((card) => card.id)).size).toBe(HOME_CARDS.length)
  })
})

describe('defaultLayout', () => {
  it('is the spec’s eight cards, with their limits from the catalog', () => {
    const layout = defaultLayout()
    expect(places(layout)).toEqual([
      ['needs-you', 0, 0, 2, 2],
      ['recently-played', 2, 0, 2, 2],
      ['upcoming-gigs', 0, 2, 2, 2],
      ['library-by-genre', 2, 2, 2, 2],
      ['playlists', 0, 4, 4, 1],
      ['library-stats', 0, 5, 1, 1],
      ['not-analyzed', 1, 5, 1, 1],
      ['quick-actions', 2, 5, 2, 1],
    ])
    expect(layout[0]).toMatchObject({ minW: 2, minH: 1, maxW: 4, maxH: 2 })
  })
})

describe('readStoredLayout', () => {
  it('replaces the old form (a bare list) by the default once, to be written back', () => {
    const old = JSON.stringify([{ i: 'recently-played', x: 0, y: 0, w: 2, h: 1 }])
    const { layout, rewrite } = readStoredLayout(old)
    expect(rewrite).toBe(true)
    expect(layout).toEqual(defaultLayout())
  })

  it('shows what Customize saved after that', () => {
    const saved = storedLayoutJson([{ i: 'quick-actions', x: 2, y: 0, w: 2, h: 1 }])
    const { layout, rewrite } = readStoredLayout(saved)
    expect(rewrite).toBe(false)
    expect(places(layout)).toEqual([['quick-actions', 2, 0, 2, 1]])
  })

  it('shows the default for nothing stored, unreadable JSON or a newer version, and keeps it', () => {
    for (const json of [null, '', '{nope', JSON.stringify({ version: 3, layout: [] })]) {
      expect(readStoredLayout(json)).toEqual({ layout: defaultLayout(), rewrite: false })
    }
  })

  it('keeps an empty layout empty', () => {
    expect(readStoredLayout(storedLayoutJson([])).layout).toEqual([])
  })
})

describe('fitToCatalog', () => {
  it('drops unknown, removed and repeated ids and malformed items', () => {
    const layout = fitToCatalog([
      { i: 'ai-recommendations', x: 0, y: 0, w: 2, h: 1 },
      { i: 'library-insights', x: 0, y: 1, w: 4, h: 1 },
      { i: 'playlists', x: 0, y: 2, w: 4, h: 2 },
      { i: 'playlists', x: 0, y: 4, w: 2, h: 1 },
      { i: 'quick-actions', x: 'left', y: 0, w: 2, h: 1 },
      null,
      'needs-you',
    ])
    expect(places(layout)).toEqual([['playlists', 0, 2, 4, 2]])
  })

  it('takes the limits from the catalog, not from what was stored, and clamps the size into them', () => {
    const [stats, analyzed, genre] = fitToCatalog([
      { i: 'library-stats', x: 0, y: 0, w: 4, h: 3, minH: 3, maxH: 3 },
      { i: 'not-analyzed', x: 3, y: 1, w: 4, h: 1 },
      { i: 'library-by-genre', x: 0, y: 2, w: 1, h: 0 },
    ])
    expect(stats).toMatchObject({ w: 4, h: 1, minH: 1, maxH: 1 })
    // Two columns wide at most, kept inside the grid.
    expect(analyzed).toMatchObject({ x: 2, w: 2, h: 1, maxW: 2 })
    expect(genre).toMatchObject({ w: 2, h: 1, minW: 2 })
  })
})

describe('newCardItem', () => {
  it('adds a card at its default size below the others', () => {
    expect(newCardItem('upcoming-gigs')).toMatchObject({ i: 'upcoming-gigs', x: 0, y: Infinity, w: 2, h: 2, maxH: 3 })
    expect(newCardItem('ai-recommendations')).toBeNull()
  })
})

describe('storedLayoutJson', () => {
  it('stores version 2 with each card’s place and size only', () => {
    const json = storedLayoutJson(defaultLayout().slice(0, 1))
    expect(JSON.parse(json)).toEqual({ version: 2, layout: [{ i: 'needs-you', x: 0, y: 0, w: 2, h: 2 }] })
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/home/cards.test.ts`: FAIL (no module).
- [ ] **Step 3: The catalog**

Create `src/lib/home/cards.ts`:

```ts
// src/lib/home/cards.ts
// Home's card catalog and its stored layout (Home cards spec, The grid): 4
// columns, rows of 120px. A card's limits always come from the catalog, never
// from what was stored: react-grid-layout enforces them only while resizing.
import type { LayoutItem } from 'react-grid-layout/legacy'

/** Columns in Home's grid. */
export const HOME_COLUMNS = 4

export type HomeGroup = 'Jump back in' | 'Needs you' | 'Your library' | 'Gig prep'

/** Customize lists the catalog under these, in this order; on Home a card shows no group. */
export const HOME_GROUPS: readonly HomeGroup[] = [
  'Jump back in',
  'Needs you',
  'Your library',
  'Gig prep',
]

export interface HomeCardDef {
  id: string
  title: string
  group: HomeGroup
  /** The size a card is added at, in columns × rows. */
  w: number
  h: number
  minW: number
  minH: number
  maxW: number
  maxH: number
}

/** The catalog. Ids that kept their meaning from the old Home kept their id. */
export const HOME_CARDS: readonly HomeCardDef[] = [
  { id: 'recently-played', title: 'Recently played', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'needs-you', title: 'Needs you', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'upcoming-gigs', title: 'Your DJs play next', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'library-stats', title: 'Library stats', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 4, maxH: 1 },
  { id: 'library-by-genre', title: 'Library by genre', group: 'Your library', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'not-analyzed', title: 'Not analyzed', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 2, maxH: 1 },
  { id: 'playlists', title: 'Your playlists', group: 'Gig prep', w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'quick-actions', title: 'Quick actions', group: 'Gig prep', w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 1 },
]

export function homeCard(id: string): HomeCardDef | undefined {
  return HOME_CARDS.find((card) => card.id === id)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** A card at a place, its size kept within its limits and the grid. */
function place(card: HomeCardDef, x: number, y: number, w: number, h: number): LayoutItem {
  const width = clamp(w, card.minW, card.maxW)
  return {
    i: card.id,
    x: clamp(x, 0, HOME_COLUMNS - width),
    y,
    w: width,
    h: clamp(h, card.minH, card.maxH),
    minW: card.minW,
    minH: card.minH,
    maxW: card.maxW,
    maxH: card.maxH,
  }
}

/** Home on first start, and after Reset: eight cards. */
const DEFAULT_PLACES: ReadonlyArray<[string, number, number, number, number]> = [
  ['needs-you', 0, 0, 2, 2],
  ['recently-played', 2, 0, 2, 2],
  ['upcoming-gigs', 0, 2, 2, 2],
  ['library-by-genre', 2, 2, 2, 2],
  ['playlists', 0, 4, 4, 1],
  ['library-stats', 0, 5, 1, 1],
  ['not-analyzed', 1, 5, 1, 1],
  ['quick-actions', 2, 5, 2, 1],
]

export function defaultLayout(): LayoutItem[] {
  return DEFAULT_PLACES.map(([id, x, y, w, h]) => place(homeCard(id)!, x, y, w, h))
}

/** A card added in Customize: its default size, below the others. */
export function newCardItem(id: string): LayoutItem | null {
  const card = homeCard(id)
  return card ? { ...place(card, 0, 0, card.w, card.h), y: Infinity } : null
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Stored cards fitted to the catalog: unknown or removed ids and repeats are
 * dropped, the limits come from the catalog, and the size is clamped into them.
 */
export function fitToCatalog(items: readonly unknown[]): LayoutItem[] {
  const seen = new Set<string>()
  const layout: LayoutItem[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const { i, x, y, w, h } = item as Record<string, unknown>
    if (typeof i !== 'string' || seen.has(i)) continue
    const card = homeCard(i)
    if (!card || !isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h)) continue
    seen.add(i)
    layout.push(place(card, Math.round(x), Math.max(0, Math.round(y)), Math.round(w), Math.round(h)))
  }
  return layout
}

/** The stored form's version: `{ "version": 2, "layout": [...] }`. */
const LAYOUT_VERSION = 2

/**
 * The layout to show from what is stored. The old form (a bare list) is
 * replaced by the default once, and `rewrite` says to store that at once.
 * Nothing stored, or something unreadable (or a newer version), shows the
 * default and is left as it is.
 */
export function readStoredLayout(json: string | null): { layout: LayoutItem[]; rewrite: boolean } {
  if (!json) return { layout: defaultLayout(), rewrite: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { layout: defaultLayout(), rewrite: false }
  }
  if (Array.isArray(parsed)) return { layout: defaultLayout(), rewrite: true }
  const stored = parsed as { version?: unknown; layout?: unknown } | null
  if (stored?.version === LAYOUT_VERSION && Array.isArray(stored.layout)) {
    return { layout: fitToCatalog(stored.layout), rewrite: false }
  }
  return { layout: defaultLayout(), rewrite: false }
}

/** What Save stores: each card's place and size (its limits come from the catalog). */
export function storedLayoutJson(layout: readonly LayoutItem[]): string {
  return JSON.stringify({
    version: LAYOUT_VERSION,
    layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
  })
}
```

- [ ] **Step 4:** `npx vitest run src/lib/home/cards.test.ts`: PASS, 10. Commit:

```bash
git add src/lib/home/cards.ts src/lib/home/cards.test.ts
git commit -m "feat(home): the card catalog, the default layout and its stored form"
```

---

### Task 5: The words and numbers on the cards

**Files:** Create `src/lib/home/labels.ts`, `src/lib/home/labels.test.ts`, `src/components/home/content.ts`, `src/components/home/content.test.ts`; modify `src/components/search/sectionContent.ts`.

- [ ] **Step 1: The tests**

Create `src/lib/home/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bpmLabel, busiestList, gigDay, gigLine, gigWhere, libraryStats, needsYouRows, playedLabel, type StreamNews } from './labels'
import type { UpcomingGig } from '../../types/home'

// Local times, so the tests read the same in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000

describe('bpmLabel', () => {
  it('shows whole beats, or a dash without a BPM', () => {
    expect(bpmLabel(124.6)).toBe('125')
    expect(bpmLabel(undefined)).toBe('—')
    expect(bpmLabel(0)).toBe('—')
  })
})

describe('playedLabel', () => {
  const now = new Date(2026, 9, 8, 23, 30)

  it('shows the time today, "yesterday", then the date', () => {
    expect(playedLabel(at(2026, 10, 8, 22, 39), now)).toBe('22:39')
    expect(playedLabel(at(2026, 10, 8, 0, 5), now)).toBe('00:05')
    expect(playedLabel(at(2026, 10, 7, 23, 59), now)).toBe('yesterday')
    expect(playedLabel(at(2026, 10, 2, 9), now)).toBe('Oct 2')
    expect(playedLabel(at(2025, 12, 31, 9), now)).toBe('Dec 31, 2025')
  })

  it('goes by the local day of a UTC time just before local midnight', () => {
    // 23:58 local yesterday, whatever UTC day that is.
    const late = at(2026, 10, 7, 23, 58)
    expect(playedLabel(late, new Date(2026, 9, 8, 0, 1))).toBe('yesterday')
    expect(playedLabel(late, new Date(2026, 9, 7, 23, 59))).toBe('23:58')
  })
})

const lists = [
  { id: 'liked', name: 'Liked Songs', position: 0 },
  { id: 'p1', name: 'Warm-up', position: 1 },
  { id: 'p2', name: 'Peak', position: 2 },
]
const news = (total: number, byList: Record<string, number>): StreamNews => ({
  total,
  byList: new Map(Object.entries(byList)),
  lists,
})

describe('busiestList', () => {
  it('is the list with the most new likes, the first in the sidebar on a tie', () => {
    expect(busiestList(news(5, { p1: 2, p2: 3 }))).toEqual({ id: 'p2', name: 'Peak' })
    expect(busiestList(news(4, { p2: 2, liked: 2 }))).toEqual({ id: 'liked', name: 'Liked Songs' })
    expect(busiestList(news(0, {}))).toBeNull()
  })
})

const gig: UpcomingGig = {
  nameKey: 'traumer',
  displayName: 'Traumer',
  eventId: 'e2',
  date: '2026-10-06',
  venue: 'Hï Ibiza',
  city: 'Ibiza',
  country: 'ES',
}

describe('needsYouRows', () => {
  it('lists the news in the spec’s order', () => {
    const rows = needsYouRows({
      spotify: news(3, { liked: 3 }),
      youtubeMusic: news(1, { p1: 1 }),
      notAnalyzed: 223,
      nextGig: gig,
      today: '2026-10-04',
    })
    expect(rows).toEqual([
      { kind: 'spotify', number: '3', text: "New Spotify likes you don't own", place: 'Liked Songs', listId: 'liked' },
      { kind: 'youtube-music', number: '1', text: 'New YouTube Music like', place: 'Warm-up', listId: 'p1' },
      { kind: 'not-analyzed', number: '223', text: 'Tracks not analyzed', place: 'Analyze all' },
      { kind: 'next-gig', number: 'Tue', text: 'Traumer plays Hï Ibiza', place: 'Oct 6', djName: 'Traumer' },
    ])
  })

  it('leaves out a row whose number is 0, and a service not shown in the sidebar', () => {
    const rows = needsYouRows({ spotify: news(0, {}), youtubeMusic: null, notAnalyzed: 0, nextGig: null, today: '2026-10-04' })
    expect(rows).toEqual([])
  })

  it('says where a gig is without a venue, and the year when it is not this one', () => {
    const [row] = needsYouRows({
      spotify: null,
      youtubeMusic: null,
      notAnalyzed: 0,
      nextGig: { ...gig, date: '2027-01-02', venue: null, city: null },
      today: '2026-10-04',
    })
    expect(row).toMatchObject({ number: 'Sat', text: 'Traumer has a gig', place: 'Jan 2, 2027' })
  })
})

describe('gig rows', () => {
  it('read "DJ · venue" over "city, country"', () => {
    expect(gigLine(gig)).toBe('Traumer · Hï Ibiza')
    expect(gigLine({ ...gig, venue: null })).toBe('Traumer')
    expect(gigWhere(gig)).toBe('Ibiza, ES')
    expect(gigWhere({ city: null, country: 'ES' })).toBe('ES')
  })

  it('show the date as a day over a month', () => {
    expect(gigDay('2026-10-06')).toEqual({ day: '06', month: 'OCT' })
    expect(gigDay('2026-12-31T23:00:00')).toEqual({ day: '31', month: 'DEC' })
    expect(gigDay('soon')).toBeNull()
  })
})

describe('libraryStats', () => {
  const counts = { tracks: 8583, playlists: 24, folders: 1, addedLately: 359, neverPlayed: 8142 }

  it('shows the track count and the added lately at one column', () => {
    expect(libraryStats(1, counts)).toEqual({ figures: [{ value: '8,583', label: 'tracks' }], line: '359 added lately' })
  })

  it('shows tracks, playlists and folders at two columns and wider', () => {
    expect(libraryStats(2, counts)).toEqual({
      figures: [
        { value: '8,583', label: 'tracks' },
        { value: '24', label: 'playlists' },
        { value: '1', label: 'folder' },
      ],
      line: '359 added lately · 8,142 never played',
    })
  })

  it('leaves the line out until the groups are read', () => {
    expect(libraryStats(4, { ...counts, addedLately: null, neverPlayed: null }).line).toBe('')
  })
})
```

Create `src/components/home/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { homeGenreTiles, playlistGradient, userPlaylists } from './content'
import type { Playlist } from '../../types/track'

describe('homeGenreTiles', () => {
  it('shows the biggest genres, then Added lately and Never played, each with its filter', () => {
    const tiles = homeGenreTiles({
      genres: [
        { genre: 'Tech House', count: 1581 },
        { genre: 'House', count: 792 },
      ],
      addedRecently: 359,
      neverPlayed: 8142,
    })
    expect(tiles.map((t) => [t.name, t.count, t.filter])).toEqual([
      ['Tech House', '1,581', { genre: 'Tech House' }],
      ['House', '792', { genre: 'House' }],
      ['Added lately', '359', { added: 30 }],
      ['Never played', '8,142', { played: 'never' }],
    ])
    expect(tiles[0].colour).toBe('#7c3aed')
  })

  it('leaves out a tile for no tracks', () => {
    expect(homeGenreTiles({ genres: [], addedRecently: 0, neverPlayed: 0 })).toEqual([])
  })
})

describe('Your playlists', () => {
  const playlist = (id: number, playlist_type: string): Playlist => ({
    id,
    name: `P${id}`,
    playlist_type,
    parent_id: null,
    track_count: 3,
  })

  it('shows the playlists the sidebar shows, not their folders', () => {
    const shown = userPlaylists([
      playlist(1, 'manual'),
      playlist(2, 'folder'),
      playlist(3, 'ai_generated'),
      playlist(4, 'smart'),
    ])
    expect(shown.map((p) => p.id)).toEqual([1, 3, 4])
  })

  it('gives a playlist the same cover each time', () => {
    expect(playlistGradient('Deep House Vibes')).toBe(playlistGradient('Deep House Vibes'))
    expect(playlistGradient('Deep House Vibes')).toMatch(/^linear-gradient/)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/home/labels.test.ts src/components/home/content.test.ts`: FAIL (no modules).
- [ ] **Step 3: The labels, the genre tiles and the playlists shown**

Create `src/lib/home/labels.ts`:

```ts
// src/lib/home/labels.ts
// The words and numbers on Home's cards (Home cards spec, Cards in detail).
import { ALL_LISTS } from '../../types/spotify'
import type { UpcomingGig } from '../../types/home'

const DAY_MS = 24 * 60 * 60 * 1000

/** A track row's BPM in whole beats ("125"), or "—". */
export function bpmLabel(bpm: number | null | undefined): string {
  return bpm ? String(Math.round(bpm)) : '—'
}

/** "1,581". */
export function count(value: number): string {
  return value.toLocaleString('en-US')
}

function parseDay(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const dayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** "Oct 2", with the year when it is not `now`'s. */
function shortDate(date: Date, now: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/**
 * When a track was played (`played_at`, unix seconds, UTC): "22:39" on the
 * local day of `now`, "yesterday", else "Oct 2".
 */
export function playedLabel(playedAt: number, now: Date): string {
  const then = new Date(playedAt * 1000)
  // Rounded: a day across a clock change is 23 or 25 hours.
  const days = Math.round((dayOf(now) - dayOf(then)) / DAY_MS)
  if (days <= 0) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(then.getHours())}:${pad(then.getMinutes())}`
  }
  if (days === 1) return 'yesterday'
  return shortDate(then, now)
}

/** A service's new likes not owned, as the sidebar counts them. */
export interface StreamNews {
  total: number
  byList: ReadonlyMap<string, number>
  lists: ReadonlyArray<{ id: string; name: string; position: number }>
}

/** The list with the most new likes (the sidebar's first on a tie); null when none has any. */
export function busiestList(news: StreamNews): { id: string; name: string } | null {
  let best: { id: string; name: string; position: number; count: number } | null = null
  for (const list of news.lists) {
    const n = news.byList.get(list.id) ?? 0
    if (n === 0) continue
    if (!best || n > best.count || (n === best.count && list.position < best.position)) {
      best = { ...list, count: n }
    }
  }
  return best && { id: best.id, name: best.name }
}

export type NeedsYouRow =
  | { kind: 'spotify' | 'youtube-music'; number: string; text: string; place: string; listId: string }
  | { kind: 'not-analyzed'; number: string; text: string; place: string }
  | { kind: 'next-gig'; number: string; text: string; place: string; djName: string }

function streamRow(kind: 'spotify' | 'youtube-music', news: StreamNews | null): NeedsYouRow[] {
  if (!news || news.total === 0) return []
  const one = news.total === 1
  const text =
    kind === 'spotify'
      ? `New Spotify ${one ? 'like' : 'likes'} you don't own`
      : `New YouTube Music ${one ? 'like' : 'likes'}`
  const list = busiestList(news)
  return [{ kind, number: count(news.total), text, place: list?.name ?? 'All', listId: list?.id ?? ALL_LISTS }]
}

/**
 * Needs you's rows, in the spec's order; a row whose number is 0 is left
 * out. `spotify` / `youtubeMusic` are null when the service is not shown in
 * the sidebar; `nextGig` is the earliest upcoming gig of the DJs with a page.
 */
export function needsYouRows(facts: {
  spotify: StreamNews | null
  youtubeMusic: StreamNews | null
  notAnalyzed: number
  nextGig: UpcomingGig | null
  today: string
}): NeedsYouRow[] {
  const rows: NeedsYouRow[] = [
    ...streamRow('spotify', facts.spotify),
    ...streamRow('youtube-music', facts.youtubeMusic),
  ]
  if (facts.notAnalyzed > 0) {
    rows.push({
      kind: 'not-analyzed',
      number: count(facts.notAnalyzed),
      text: facts.notAnalyzed === 1 ? 'Track not analyzed' : 'Tracks not analyzed',
      place: 'Analyze all',
    })
  }
  const gig = facts.nextGig
  const day = gig && parseDay(gig.date)
  if (gig && day) {
    const where = gig.venue ?? gig.city
    rows.push({
      kind: 'next-gig',
      number: day.toLocaleDateString('en-US', { weekday: 'short' }),
      text: where ? `${gig.displayName} plays ${where}` : `${gig.displayName} has a gig`,
      place: shortDate(day, parseDay(facts.today) ?? new Date()),
      djName: gig.displayName,
    })
  }
  return rows
}

/** A gig's date block: "06" over "OCT"; null for a date it cannot read. */
export function gigDay(date: string): { day: string; month: string } | null {
  const day = parseDay(date)
  if (!day) return null
  return {
    day: String(day.getDate()).padStart(2, '0'),
    month: day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  }
}

/** "Ibiza, ES": a gig row's place; either part may be missing. */
export function gigWhere(gig: Pick<UpcomingGig, 'city' | 'country'>): string {
  return [gig.city, gig.country].filter(Boolean).join(', ')
}

/** "Traumer · Hï Ibiza": a gig row's line. */
export function gigLine(gig: Pick<UpcomingGig, 'displayName' | 'venue'>): string {
  return gig.venue ? `${gig.displayName} · ${gig.venue}` : gig.displayName
}

export interface LibraryCounts {
  tracks: number
  playlists: number
  folders: number
  /** null until the library's groups are read. */
  addedLately: number | null
  neverPlayed: number | null
}

const noun = (value: number, one: string) => `${one}${value === 1 ? '' : 's'}`

/**
 * Library stats at a card width: at 1 column the track count and "N added
 * lately"; at 2 and wider tracks, playlists and folders, with "N added lately
 * · N never played" under them.
 */
export function libraryStats(
  columns: number,
  counts: LibraryCounts,
): { figures: Array<{ value: string; label: string }>; line: string } {
  const figure = (value: number, one: string) => ({ value: count(value), label: noun(value, one) })
  const added = counts.addedLately === null ? [] : [`${count(counts.addedLately)} added lately`]
  if (columns < 2) return { figures: [figure(counts.tracks, 'track')], line: added.join('') }
  const never = counts.neverPlayed === null ? [] : [`${count(counts.neverPlayed)} never played`]
  return {
    figures: [
      figure(counts.tracks, 'track'),
      figure(counts.playlists, 'playlist'),
      figure(counts.folders, 'folder'),
    ],
    line: [...added, ...never].join(' · '),
  }
}
```

Create `src/components/home/content.ts`:

```ts
// src/components/home/content.ts
// What Library by genre's tiles and Your playlists' cards show (Home cards
// spec, The grid).
import { GENRE_COLOURS } from '../search/sectionContent'
import { count } from '../../lib/home/labels'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { LibraryGroups } from '../../types/sections'
import type { Playlist } from '../../types/track'

export interface HomeTile {
  key: string
  name: string
  count: string
  colour: string
  filter: TrackFilter
}

/**
 * The 6 biggest genres in Search's colours, then Added lately (the last 30
 * days) and Never played; a tile for no tracks is left out. Each opens All
 * Tracks with its filter.
 */
export function homeGenreTiles(groups: LibraryGroups): HomeTile[] {
  const tiles: HomeTile[] = groups.genres.map((group, index) => ({
    key: `genre:${group.genre}`,
    name: group.genre,
    count: count(group.count),
    colour: GENRE_COLOURS[index % GENRE_COLOURS.length],
    filter: { genre: group.genre },
  }))
  if (groups.addedRecently > 0) {
    tiles.push({
      key: 'added',
      name: 'Added lately',
      count: count(groups.addedRecently),
      colour: '#334155',
      filter: { added: 30 },
    })
  }
  if (groups.neverPlayed > 0) {
    tiles.push({
      key: 'never-played',
      name: 'Never played',
      count: count(groups.neverPlayed),
      colour: '#3f3f46',
      filter: { played: 'never' },
    })
  }
  return tiles
}

/** The playlists, not their folders, in the sidebar's order (as the sidebar lists them). */
export function userPlaylists(playlists: readonly Playlist[]): Playlist[] {
  return playlists.filter((p) => p.playlist_type !== 'folder')
}

const PLAYLIST_GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
]

/** A playlist's cover: a gradient picked by its name, the same each time. */
export function playlistGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return PLAYLIST_GRADIENTS[Math.abs(hash) % PLAYLIST_GRADIENTS.length]
}
```

In `src/components/search/sectionContent.ts`, replace

```ts
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
```

with

```ts
      return data.recentlyAdded.length > 0
    case 'saved-sets':
      return data.savedSets.length > 0
  }
}

/** The genre tiles' colours, biggest genre first (the approved mockup's); Home's too. */
export const GENRE_COLOURS = [
  '#7c3aed',
  '#0e7490',
  '#be185d',
  '#c2410c',
  '#4338ca',
  '#15803d',
```

- [ ] **Step 4:** `npx vitest run src/lib/home src/components/home src/components/search`: PASS (labels 12, content 4, Search's sections unchanged). Commit:

```bash
git add src/lib/home/labels.ts src/lib/home/labels.test.ts src/components/home/content.ts src/components/home/content.test.ts src/components/search/sectionContent.ts
git commit -m "feat(home): the time played, Needs you's rows, gig rows, Library stats and the genre tiles"
```

---

### Task 6: The cards

**Files:** Create `src/components/home/useHomeData.ts`, `HomeTrackRows.tsx`, `HomeCards.tsx`, `HomeCatalog.tsx`, `HomeHeader.tsx`.

Nothing imports them until Task 7; they compile on their own.

- [ ] **Step 1: Reading what the cards on Home need**

Create `src/components/home/useHomeData.ts`:

```ts
// src/components/home/useHomeData.ts
// What the cards on Home read (Home cards spec, Data), all local: when Home
// opens, when a card that needs something new is added, and each time App's
// data-version number changes (a play, an analysis, a rescan, a move). Each
// part is null until it is read, so a card shows nothing rather than its
// empty text for a moment; what was read stays while it is read again.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import type { UpcomingGig } from '../../types/home'
import type { LibraryGroups, RecentlyPlayedTrack } from '../../types/sections'

/** The most rows a list card reads. */
export const RECENTLY_PLAYED_ROWS = 20
export const UPCOMING_GIGS_ROWS = 20

export interface HomeData {
  recentlyPlayed: RecentlyPlayedTrack[] | null
  gigs: UpcomingGig[] | null
  groups: LibraryGroups | null
  /** The tracks with no BPM. */
  withoutBpm: number[] | null
  /** The local day the gigs were read for ("2026-10-08"). */
  today: string
}

type Part = 'recentlyPlayed' | 'gigs' | 'groups' | 'withoutBpm'

/** What each card reads. */
const PARTS: Record<string, Part[]> = {
  'recently-played': ['recentlyPlayed'],
  'needs-you': ['gigs', 'withoutBpm'],
  'upcoming-gigs': ['gigs'],
  'library-stats': ['groups'],
  'library-by-genre': ['groups'],
  'not-analyzed': ['withoutBpm'],
  'quick-actions': ['withoutBpm'],
}

const NO_GROUPS: LibraryGroups = { genres: [], addedRecently: 0, neverPlayed: 0 }

// One part's read: null when no card needs it; a failure reads as empty.
async function read<T>(wanted: boolean, empty: T, load: () => Promise<T>): Promise<T | null> {
  if (!wanted) return null
  try {
    return await load()
  } catch (err) {
    console.warn('[Home] Failed to read a card:', err)
    return empty
  }
}

export function useHomeData(cardIds: readonly string[], version: number): HomeData {
  const [data, setData] = useState<HomeData>({
    recentlyPlayed: null,
    gigs: null,
    groups: null,
    withoutBpm: null,
    today: localDay(new Date()),
  })
  // A string, so moving or resizing a card reads nothing again.
  const partsKey = [...new Set(cardIds.flatMap((id) => PARTS[id] ?? []))].sort().join(',')

  useEffect(() => {
    let current = true
    const wanted = new Set(partsKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(wanted.has('recentlyPlayed'), [], () => tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_ROWS)),
      read(wanted.has('gigs'), [], () => tauriApi.getUpcomingGigs(today, UPCOMING_GIGS_ROWS)),
      read(wanted.has('groups'), NO_GROUPS, () => tauriApi.getLibraryGroups()),
      read(wanted.has('withoutBpm'), [], () => tauriApi.getTrackIdsWithoutBpm()),
    ]).then(([recentlyPlayed, gigs, groups, withoutBpm]) => {
      if (current) setData({ recentlyPlayed, gigs, groups, withoutBpm, today })
    })
    return () => {
      current = false
    }
  }, [partsKey, version])

  return data
}
```

- [ ] **Step 2: The track rows** — ▶ in place of the number under the mouse, the equalizer on the track playing, pause / play on it as in the table; one row per drag.

Create `src/components/home/HomeTrackRows.tsx`:

```tsx
// src/components/home/HomeTrackRows.tsx
// Track rows on Home's cards (Home cards spec, Cards in detail): number,
// title over artist, BPM, key and a last column. Under the mouse the number
// turns into ▶; ▶ or a double click plays, with the card's list as the queue.
// The track playing shows the equalizer and its title in the accent colour;
// under the mouse, pause while it plays and ▶ while it is paused. A row is a
// drag source carrying that one row (Interactions spec, Drag and drop).
import { useMemo } from 'react'
import { Icon } from '../Icon'
import { Equalizer } from '../Equalizer'
import { audioPlayer } from '../../lib/audioPlayer'
import { useTrackDrag } from '../../lib/drag/useTrackDrag'
import { useTrackDragStore } from '../../lib/drag/trackDrag'
import type { DropTarget } from '../../lib/drag/dropTargets'
import { bpmLabel } from '../../lib/home/labels'
import { usePlayerStore } from '../../store/playerStore'
import type { LibraryFolder, Track } from '../../types/track'

export interface TrackRowActions {
  onPlay: (track: Track, list: Track[], index: number) => void
  /** A row dropped on a playlist in the sidebar. */
  onAddToPlaylist: (tracks: Track[], playlistId: number) => void
  /** A row dropped on a library folder in the sidebar. */
  onMoveToFolder: (tracks: Track[], folder: LibraryFolder) => void
}

interface HomeTrackRowsProps<T extends Track> extends TrackRowActions {
  /** Names the drag source: the card's id. */
  table: string
  tracks: T[]
  /** The last column: when it was played, added, or its length. */
  last: (track: T) => string
}

// The playing row's button: pause, or play on from where it stopped.
function togglePlayback() {
  if (usePlayerStore.getState().isPlaying) {
    audioPlayer.pause()
  } else {
    audioPlayer
      .resume()
      .catch((err) =>
        usePlayerStore.getState().setError(`Playback error: ${err}`),
      )
  }
}

export function HomeTrackRows<T extends Track>({
  table,
  tracks,
  last,
  onPlay,
  onAddToPlaylist,
  onMoveToFolder,
}: HomeTrackRowsProps<T>) {
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)

  const startDrag = useTrackDrag({
    begin: (track) => ({
      tracks: [track],
      table,
      reorder: false,
      playlistId: null,
    }),
    onDrop: (payload, target: DropTarget) => {
      if (target.kind === 'playlist') onAddToPlaylist(payload.tracks, target.id)
      else if (target.kind === 'folder') {
        onMoveToFolder(payload.tracks, {
          path: target.path,
          label: target.name,
        })
      }
    },
  })
  // The row being dragged dims.
  const dragged = useTrackDragStore((state) =>
    state.payload?.table === table ? state.payload.tracks : null,
  )
  const draggedIds = useMemo(
    () => new Set(dragged?.map((t) => t.id)),
    [dragged],
  )

  return (
    <div className="home-rows">
      {tracks.map((track, index) => {
        const playing =
          currentTrack != null &&
          track.id === currentTrack.id &&
          track.file_path === currentTrack.file_path
        const play = () => onPlay(track, tracks, index)
        return (
          <div
            key={`${track.id}\n${track.file_path}`}
            className={`home-row${playing ? ' home-row--playing' : ''}${draggedIds.has(track.id) ? ' home-row--dragging' : ''}`}
            // A press drags the row, not the text in it.
            onMouseDown={(e) => {
              if (e.button === 0 && !(e.target as Element).closest('button'))
                e.preventDefault()
            }}
            onPointerDown={(e) => startDrag(e, track)}
            onDoubleClick={play}
          >
            <span className="home-row__no">
              {playing ? (
                <Equalizer playing={isPlaying} />
              ) : (
                <span className="home-row__number">{index + 1}</span>
              )}
              <button
                type="button"
                className="home-row__action"
                aria-label={
                  playing
                    ? isPlaying
                      ? 'Pause'
                      : 'Play'
                    : `Play ${track.title || 'track'}`
                }
                onClick={(e) => {
                  // The second click of a double click: the first did it.
                  if (e.detail > 1) return
                  if (playing) togglePlayback()
                  else play()
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon
                  name={playing && isPlaying ? 'Pause' : 'Play'}
                  size={13}
                />
              </button>
            </span>
            <span className="home-row__text">
              <span className="home-row__title">
                {track.title || 'Untitled'}
              </span>
              <span className="home-row__artist">
                {track.artist || 'Unknown Artist'}
              </span>
            </span>
            <span className="home-row__figure">{bpmLabel(track.bpm)}</span>
            <span className="home-row__figure">{track.musical_key || '—'}</span>
            <span className="home-row__last">{last(track)}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: The cards** — the frame (title, header link, × while customizing) and each card's body, with its empty text.

Create `src/components/home/HomeCards.tsx`:

```tsx
// src/components/home/HomeCards.tsx
// Home's cards (Home cards spec, The grid and Cards in detail): each card's
// frame and what it shows. A card with nothing to show says so in one line;
// one whose data is still being read shows nothing yet.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import {
  count,
  gigDay,
  gigLine,
  gigWhere,
  libraryStats,
  needsYouRows,
  playedLabel,
  type NeedsYouRow,
  type StreamNews,
} from '../../lib/home/labels'
import { homeCard } from '../../lib/home/cards'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { Playlist } from '../../types/track'
import { homeGenreTiles, playlistGradient, userPlaylists } from './content'
import { HomeTrackRows, type TrackRowActions } from './HomeTrackRows'
import type { HomeData } from './useHomeData'

/** What the cards act through; App passes them to HomeView. */
export interface HomeActions extends TrackRowActions {
  /** Plays the playlist from its first track, the playlist as the queue. */
  onPlayPlaylist: (id: number) => void
  onOpenPlaylist: (id: number) => void
  onOpenDj: (name: string) => void
  onOpenSets: () => void
  /** All Tracks, with this filter or none. */
  onOpenAllTracks: (filter: TrackFilter | null) => void
  onOpenStreamList: (
    service: 'spotify' | 'youtube-music',
    listId: string,
  ) => void
  /** Analyzes exactly these tracks (Home's are the ones without a BPM). */
  onAnalyzeTracks: (ids: number[]) => void
  onCreatePlaylist: () => void
  /** Settings, with its Library section open. */
  onImportFolder: () => void
}

/** What the cards show beyond what they read themselves. */
export interface HomeFacts {
  playlists: Playlist[]
  totalTrackCount: number
  folderCount: number
  /** New likes not owned; null when the service is not shown in the sidebar. */
  spotify: StreamNews | null
  youtubeMusic: StreamNews | null
}

interface HomeCardProps {
  id: string
  /** The card's width in columns. */
  columns: number
  editing: boolean
  onRemove: (id: string) => void
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}

export function HomeCard({
  id,
  columns,
  editing,
  onRemove,
  data,
  facts,
  actions,
}: HomeCardProps) {
  const title = homeCard(id)?.title ?? id
  const link = editing ? null : headerLink(id, facts, actions)
  return (
    <section className={editing ? 'home-card home-card--editing' : 'home-card'}>
      <div className="home-card__head">
        <h3 className="home-card__title">{title}</h3>
        {editing ? (
          <button
            type="button"
            className="home-card__remove"
            aria-label={`Remove ${title}`}
            onClick={() => onRemove(id)}
          >
            <Icon name="X" size={14} />
          </button>
        ) : (
          link
        )}
      </div>
      <div className="home-card__body">
        <CardBody
          id={id}
          columns={columns}
          data={data}
          facts={facts}
          actions={actions}
        />
      </div>
    </section>
  )
}

function headerLink(
  id: string,
  facts: HomeFacts,
  actions: HomeActions,
): ReactNode {
  if (id === 'library-by-genre' && facts.totalTrackCount > 0) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => actions.onOpenAllTracks(null)}
      >
        {count(facts.totalTrackCount)} tracks
      </button>
    )
  }
  return null
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="home-empty">{children}</p>
}

function CardBody({
  id,
  columns,
  data,
  facts,
  actions,
}: {
  id: string
  columns: number
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}) {
  switch (id) {
    case 'needs-you':
      return <NeedsYou data={data} facts={facts} actions={actions} />
    case 'recently-played': {
      if (data.recentlyPlayed === null) return null
      if (data.recentlyPlayed.length === 0)
        return <Empty>Nothing played yet</Empty>
      const now = new Date()
      return (
        <HomeTrackRows
          table="home:recently-played"
          tracks={data.recentlyPlayed}
          last={(track) => playedLabel(track.played_at, now)}
          onPlay={actions.onPlay}
          onAddToPlaylist={actions.onAddToPlaylist}
          onMoveToFolder={actions.onMoveToFolder}
        />
      )
    }
    case 'upcoming-gigs':
      if (data.gigs === null) return null
      if (data.gigs.length === 0) return <Empty>No upcoming gigs</Empty>
      return (
        <div className="home-list">
          {data.gigs.map((gig) => {
            const day = gigDay(gig.date)
            const where = gigWhere(gig)
            return (
              <button
                key={`${gig.nameKey}\n${gig.eventId}`}
                type="button"
                className="home-gig"
                onClick={() => actions.onOpenDj(gig.displayName)}
              >
                <span className="home-gig__date">
                  {day?.day}
                  <small>{day?.month}</small>
                </span>
                <span className="home-gig__text">
                  <span className="home-gig__line">{gigLine(gig)}</span>
                  {where && <span className="home-gig__where">{where}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )
    case 'library-by-genre': {
      if (data.groups === null) return null
      const tiles = homeGenreTiles(data.groups)
      if (tiles.length === 0) return <Empty>No genres yet</Empty>
      return (
        <div className="home-genres">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className="home-genre"
              style={{ background: tile.colour }}
              onClick={() => actions.onOpenAllTracks(tile.filter)}
            >
              <span className="home-genre__name">{tile.name}</span>
              <span className="home-genre__count">{tile.count}</span>
            </button>
          ))}
        </div>
      )
    }
    case 'playlists': {
      const playlists = userPlaylists(facts.playlists)
      if (playlists.length === 0) return <Empty>No playlists yet</Empty>
      return (
        <div className="home-playlists">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="home-playlist">
              <button
                type="button"
                className="home-playlist__open"
                onClick={() => actions.onOpenPlaylist(playlist.id)}
              >
                <span
                  className="home-playlist__cover"
                  style={{ background: playlistGradient(playlist.name) }}
                />
                <span className="home-playlist__text">
                  <span className="home-playlist__name">{playlist.name}</span>
                  <span className="home-playlist__count">
                    {count(playlist.track_count)}{' '}
                    {playlist.track_count === 1 ? 'track' : 'tracks'}
                  </span>
                </span>
              </button>
              {playlist.track_count > 0 && (
                <button
                  type="button"
                  className="home-playlist__play"
                  aria-label={`Play ${playlist.name}`}
                  onClick={() => actions.onPlayPlaylist(playlist.id)}
                >
                  <Icon name="Play" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )
    }
    case 'library-stats': {
      if (facts.totalTrackCount === 0) return <Empty>No tracks yet</Empty>
      const stats = libraryStats(columns, {
        tracks: facts.totalTrackCount,
        playlists: userPlaylists(facts.playlists).length,
        folders: facts.folderCount,
        addedLately: data.groups?.addedRecently ?? null,
        neverPlayed: data.groups?.neverPlayed ?? null,
      })
      if (stats.figures.length === 1) {
        const [tracks] = stats.figures
        return (
          <div className="home-stat">
            <span className="home-big">{tracks.value}</span>
            <span className="home-sub">
              {[tracks.label, stats.line].filter(Boolean).join(' · ')}
            </span>
          </div>
        )
      }
      return (
        <div className="home-stat">
          <span className="home-figures">
            {stats.figures.map((figure) => (
              <span key={figure.label} className="home-figure">
                <span className="home-big">{figure.value}</span>
                <span className="home-sub">{figure.label}</span>
              </span>
            ))}
          </span>
          {stats.line && <span className="home-sub">{stats.line}</span>}
        </div>
      )
    }
    case 'not-analyzed': {
      const ids = data.withoutBpm
      if (ids === null) return null
      if (ids.length === 0) return <Empty>Everything is analyzed</Empty>
      return (
        <div className="home-stat home-stat--action">
          <span className="home-stat__figure">
            <span className="home-big home-big--accent">
              {count(ids.length)}
            </span>
            <span className="home-sub">no BPM yet</span>
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => actions.onAnalyzeTracks(ids)}
          >
            Analyze all
          </button>
        </div>
      )
    }
    case 'quick-actions':
      return (
        <div className="home-actions">
          <QuickAction
            icon="FolderPlus"
            label="Import folder"
            onClick={actions.onImportFolder}
          />
          <QuickAction
            icon="AudioWaveform"
            label="Analyze all"
            // Before Home has read them, there is nothing to send yet.
            onClick={() => data.withoutBpm && actions.onAnalyzeTracks(data.withoutBpm)}
          />
          <QuickAction
            icon="Radio"
            label="Open Sets"
            onClick={actions.onOpenSets}
          />
          <QuickAction
            icon="ListPlus"
            label="New playlist"
            onClick={actions.onCreatePlaylist}
          />
        </div>
      )
    default:
      return null
  }
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: IconName
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className="home-action" onClick={onClick}>
      <Icon name={icon} size={16} />
      {label}
    </button>
  )
}

function NeedsYou({
  data,
  facts,
  actions,
}: {
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}) {
  if (data.gigs === null || data.withoutBpm === null) return null
  const withoutBpm = data.withoutBpm
  const rows = needsYouRows({
    spotify: facts.spotify,
    youtubeMusic: facts.youtubeMusic,
    notAnalyzed: withoutBpm.length,
    nextGig: data.gigs[0] ?? null,
    today: data.today,
  })
  if (rows.length === 0) return <Empty>Nothing new</Empty>

  const open = (row: NeedsYouRow) => {
    switch (row.kind) {
      case 'spotify':
      case 'youtube-music':
        actions.onOpenStreamList(row.kind, row.listId)
        break
      case 'not-analyzed':
        actions.onAnalyzeTracks(withoutBpm)
        break
      case 'next-gig':
        actions.onOpenDj(row.djName)
        break
    }
  }

  return (
    <div className="home-list">
      {rows.map((row) => (
        <button
          key={row.kind}
          type="button"
          className={`home-news home-news--${row.kind}`}
          onClick={() => open(row)}
        >
          <span className="home-news__number">{row.number}</span>
          <span className="home-news__text">{row.text}</span>
          <span className="home-news__place">
            <span className="home-news__place-name">{row.place}</span>
            <Icon name="ChevronRight" size={12} />
          </span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Customize's catalog and the header**

Create `src/components/home/HomeCatalog.tsx`:

```tsx
// src/components/home/HomeCatalog.tsx
// Customize's catalog (Home cards spec, Customize): every card under its
// group, marked "on Home" or with "+ Add".
import { HOME_CARDS, HOME_GROUPS } from '../../lib/home/cards'

interface HomeCatalogProps {
  /** The ids of the cards on Home now. */
  shown: ReadonlySet<string>
  onAdd: (id: string) => void
}

export function HomeCatalog({ shown, onAdd }: HomeCatalogProps) {
  return (
    <aside className="home-catalog" aria-label="Cards">
      {HOME_GROUPS.map((group) => {
        const cards = HOME_CARDS.filter((card) => card.group === group)
        if (cards.length === 0) return null
        return (
          <section key={group} className="home-catalog__group">
            <h3 className="home-catalog__heading">{group}</h3>
            {cards.map((card) => (
              <div key={card.id} className="home-catalog__card">
                <span className="home-catalog__name">{card.title}</span>
                {shown.has(card.id) ? (
                  <span className="home-catalog__on">on Home</span>
                ) : (
                  <button
                    type="button"
                    className="link-btn home-catalog__add"
                    onClick={() => onAdd(card.id)}
                  >
                    + Add
                  </button>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </aside>
  )
}
```

Create `src/components/home/HomeHeader.tsx`:

```tsx
// src/components/home/HomeHeader.tsx
// The greeting and the date over Home's cards, with Customize; while
// customizing, Reset, Cancel and Save (Home cards spec, Customize).
import { Icon } from '../Icon'

interface HomeHeaderProps {
  editing: boolean
  onCustomize: () => void
  onReset: () => void
  onCancel: () => void
  onSave: () => void
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomeHeader({
  editing,
  onCustomize,
  onReset,
  onCancel,
  onSave,
}: HomeHeaderProps) {
  const now = new Date()
  return (
    <header className="home-header">
      <div className="home-header__hello">
        <h1 className="home-header__greeting">
          {editing ? 'Customize Home' : greeting(now)}
        </h1>
        <span className="home-header__date">
          {editing
            ? 'Drag a card by its title, resize it from its corner, or add one from the list'
            : now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
        </span>
      </div>
      {editing ? (
        <div className="home-header__actions">
          <button type="button" className="link-btn" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="btn btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--sm" onClick={onCustomize}>
          <Icon name="SlidersHorizontal" size={14} />
          Customize
        </button>
      )}
    </header>
  )
}
```

- [ ] **Step 5:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/home/useHomeData.ts src/components/home/HomeTrackRows.tsx src/components/home/HomeCards.tsx src/components/home/HomeCatalog.tsx src/components/home/HomeHeader.tsx
git commit -m "feat(home): the cards, their track rows and Customize's catalog"
```

---

### Task 7: Home in place

**Files:** Rewrite `src/components/views/HomeView.tsx`, `src/components/views/HomeView.css`; modify `src/store/dashboardStore.ts`, `src/store/dashboardStore.test.ts`, `src/App.tsx`; delete `src/components/views/widgets/`.

- [ ] **Step 1: The store's tests** — version 2, the old form replaced once, Reset, cards added from the catalog.

In `src/store/dashboardStore.test.ts`, replace

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDashboardStore } from './dashboardStore'
import { DEFAULT_LAYOUT } from '../components/views/widgets/widgetRegistry'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getDashboardLayout: vi.fn().mockResolvedValue(null),
    saveDashboardLayout: vi.fn().mockResolvedValue(undefined),
  },
}))

beforeEach(() => {
  useDashboardStore.setState({
    layout: [...DEFAULT_LAYOUT],
    savedLayout: [...DEFAULT_LAYOUT],
    isEditMode: false,
    isLoaded: false,
  })
```

with

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDashboardStore } from './dashboardStore'
import { defaultLayout, storedLayoutJson } from '../lib/home/cards'
import { tauriApi } from '../lib/tauri-api'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getDashboardLayout: vi.fn().mockResolvedValue(null),
    saveDashboardLayout: vi.fn().mockResolvedValue(undefined),
  },
}))

const DEFAULT_LAYOUT = defaultLayout()

beforeEach(() => {
  vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(null)
  vi.mocked(tauriApi.saveDashboardLayout).mockClear()
  useDashboardStore.setState({
    layout: [...DEFAULT_LAYOUT],
    savedLayout: [...DEFAULT_LAYOUT],
    isEditMode: false,
    isLoaded: false,
  })
```

In `src/store/dashboardStore.test.ts`, replace

```ts
    useDashboardStore.getState().cancelEdit()
    const state = useDashboardStore.getState()
    expect(state.isEditMode).toBe(false)
    expect(state.layout).toEqual(DEFAULT_LAYOUT)
  })

  it('addWidget appends to layout', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('library-insights', {
      defaultW: 4, defaultH: 1, minW: 2, minH: 1, maxW: 4, maxH: 1,
    })
    const state = useDashboardStore.getState()
    expect(state.layout.length).toBe(before + 1)
    expect(state.layout.find((l) => l.i === 'library-insights')).toBeDefined()
  })

  it('addWidget does not duplicate existing widget', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('recently-played', {
      defaultW: 2, defaultH: 1, minW: 2, minH: 1, maxW: 4, maxH: 2,
    })
    expect(useDashboardStore.getState().layout.length).toBe(before)
  })

  it('removeWidget filters out by id', () => {
    useDashboardStore.getState().removeWidget('recently-played')
    const state = useDashboardStore.getState()
```

with

```ts
    useDashboardStore.getState().cancelEdit()
    const state = useDashboardStore.getState()
    expect(state.isEditMode).toBe(false)
    expect(state.layout).toEqual(DEFAULT_LAYOUT)
  })

  it('addWidget appends a catalog card at its default size', () => {
    useDashboardStore.getState().removeWidget('upcoming-gigs')
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('upcoming-gigs')
    const state = useDashboardStore.getState()
    expect(state.layout.length).toBe(before + 1)
    expect(state.layout.find((l) => l.i === 'upcoming-gigs')).toMatchObject({ w: 2, h: 2, maxH: 3 })
  })

  it('addWidget does not duplicate a card, nor add one not in the catalog', () => {
    const before = useDashboardStore.getState().layout.length
    useDashboardStore.getState().addWidget('recently-played')
    useDashboardStore.getState().addWidget('ai-recommendations')
    expect(useDashboardStore.getState().layout.length).toBe(before)
  })

  it('removeWidget filters out by id', () => {
    useDashboardStore.getState().removeWidget('recently-played')
    const state = useDashboardStore.getState()
```

In `src/store/dashboardStore.test.ts`, replace

```ts

  it('updateLayout replaces layout', () => {
    const newLayout = [{ i: 'test', x: 0, y: 0, w: 2, h: 1 }]
    useDashboardStore.getState().updateLayout(newLayout)
    expect(useDashboardStore.getState().layout).toEqual(newLayout)
  })
})
```

with

```ts

  it('updateLayout replaces layout', () => {
    const newLayout = [{ i: 'test', x: 0, y: 0, w: 2, h: 1 }]
    useDashboardStore.getState().updateLayout(newLayout)
    expect(useDashboardStore.getState().layout).toEqual(newLayout)
  })

  it('resetLayout puts back the default layout, until Save', () => {
    useDashboardStore.getState().enterEditMode()
    useDashboardStore.getState().updateLayout([{ i: 'needs-you', x: 0, y: 0, w: 4, h: 2 }])
    useDashboardStore.getState().resetLayout()
    expect(useDashboardStore.getState().layout).toEqual(DEFAULT_LAYOUT)
    expect(tauriApi.saveDashboardLayout).not.toHaveBeenCalled()
  })

  it('loadLayout replaces the old form by the default once and stores it', async () => {
    vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(JSON.stringify([{ i: 'recently-played', x: 0, y: 0, w: 2, h: 1 }]))
    await useDashboardStore.getState().loadLayout()
    expect(useDashboardStore.getState().layout).toEqual(DEFAULT_LAYOUT)
    expect(tauriApi.saveDashboardLayout).toHaveBeenCalledWith(storedLayoutJson(DEFAULT_LAYOUT))
  })

  it('loadLayout shows a saved layout as it is, storing nothing', async () => {
    vi.mocked(tauriApi.getDashboardLayout).mockResolvedValue(storedLayoutJson([{ i: 'quick-actions', x: 0, y: 0, w: 4, h: 1 }]))
    await useDashboardStore.getState().loadLayout()
    expect(useDashboardStore.getState().layout).toMatchObject([{ i: 'quick-actions', w: 4, h: 1, maxH: 1 }])
    expect(tauriApi.saveDashboardLayout).not.toHaveBeenCalled()
  })

  it('saveLayout stores version 2', async () => {
    useDashboardStore.getState().enterEditMode()
    await useDashboardStore.getState().saveLayout()
    expect(tauriApi.saveDashboardLayout).toHaveBeenCalledWith(storedLayoutJson(DEFAULT_LAYOUT))
    expect(useDashboardStore.getState().isEditMode).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/store/dashboardStore.test.ts`: FAIL (the store still starts from the old widgets' layout, and has no `resetLayout`).
- [ ] **Step 3: The store**

In `src/store/dashboardStore.ts`, replace

```ts
import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout/legacy'
import { tauriApi } from '../lib/tauri-api'
import { DEFAULT_LAYOUT } from '../components/views/widgets/widgetRegistry'

interface DashboardState {
  layout: LayoutItem[]
  savedLayout: LayoutItem[]
  isEditMode: boolean
  isLoaded: boolean

  loadLayout: () => Promise<void>
  enterEditMode: () => void
  cancelEdit: () => void
  saveLayout: () => Promise<void>
  updateLayout: (layout: LayoutItem[]) => void
  addWidget: (widgetId: string, definition: { defaultW: number; defaultH: number; minW: number; minH: number; maxW: number; maxH: number }) => void
  removeWidget: (widgetId: string) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  layout: DEFAULT_LAYOUT,
  savedLayout: DEFAULT_LAYOUT,
  isEditMode: false,
  isLoaded: false,

  loadLayout: async () => {
    try {
      const json = await tauriApi.getDashboardLayout()
      if (json) {
        const layout = JSON.parse(json) as LayoutItem[]
        set({ layout, savedLayout: layout, isLoaded: true })
      } else {
        set({ layout: DEFAULT_LAYOUT, savedLayout: DEFAULT_LAYOUT, isLoaded: true })
      }
    } catch {
      set({ layout: DEFAULT_LAYOUT, savedLayout: DEFAULT_LAYOUT, isLoaded: true })
    }
  },

  enterEditMode: () => {
    const { layout } = get()
    set({ isEditMode: true, savedLayout: [...layout] })
```

with

```ts
import { create } from 'zustand'
import type { LayoutItem } from 'react-grid-layout/legacy'
import { tauriApi } from '../lib/tauri-api'
import {
  defaultLayout,
  newCardItem,
  readStoredLayout,
  storedLayoutJson,
} from '../lib/home/cards'

interface DashboardState {
  layout: LayoutItem[]
  savedLayout: LayoutItem[]
  isEditMode: boolean
  isLoaded: boolean

  loadLayout: () => Promise<void>
  enterEditMode: () => void
  cancelEdit: () => void
  saveLayout: () => Promise<void>
  updateLayout: (layout: LayoutItem[]) => void
  addWidget: (widgetId: string) => void
  removeWidget: (widgetId: string) => void
  /** Customize's Reset: the default layout, until Save or Cancel. */
  resetLayout: () => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  layout: defaultLayout(),
  savedLayout: defaultLayout(),
  isEditMode: false,
  isLoaded: false,

  // The old Home's layout (a bare list) is replaced by the default once, and
  // that is stored at once; after that Home shows what Customize saved.
  loadLayout: async () => {
    try {
      const { layout, rewrite } = readStoredLayout(await tauriApi.getDashboardLayout())
      set({ layout, savedLayout: layout, isLoaded: true })
      if (rewrite) {
        await tauriApi
          .saveDashboardLayout(storedLayoutJson(layout))
          .catch((err) => console.error('Failed to store the new Home layout:', err))
      }
    } catch {
      set({ layout: defaultLayout(), savedLayout: defaultLayout(), isLoaded: true })
    }
  },

  enterEditMode: () => {
    const { layout } = get()
    set({ isEditMode: true, savedLayout: [...layout] })
```

In `src/store/dashboardStore.ts`, replace

```ts
    set({ isEditMode: false, layout: [...savedLayout] })
  },

  saveLayout: async () => {
    const { layout } = get()
    try {
      await tauriApi.saveDashboardLayout(JSON.stringify(layout))
      set({ isEditMode: false, savedLayout: [...layout] })
    } catch (err) {
      console.error('Failed to save dashboard layout:', err)
    }
  },

  updateLayout: (layout) => {
    set({ layout })
  },

  addWidget: (widgetId, definition) => {
    const { layout } = get()
    if (layout.some((item) => item.i === widgetId)) return

    const newItem: LayoutItem = {
      i: widgetId,
      x: 0,
      y: Infinity,
      w: definition.defaultW,
      h: definition.defaultH,
      minW: definition.minW,
      minH: definition.minH,
      maxW: definition.maxW,
      maxH: definition.maxH,
    }
    set({ layout: [...layout, newItem] })
  },

  removeWidget: (widgetId) => {
    const { layout } = get()
    set({ layout: layout.filter((item) => item.i !== widgetId) })
  },
}))
```

with

```ts
    set({ isEditMode: false, layout: [...savedLayout] })
  },

  saveLayout: async () => {
    const { layout } = get()
    try {
      await tauriApi.saveDashboardLayout(storedLayoutJson(layout))
      set({ isEditMode: false, savedLayout: [...layout] })
    } catch (err) {
      console.error('Failed to save dashboard layout:', err)
    }
  },

  updateLayout: (layout) => {
    set({ layout })
  },

  // At its default size, below the others; its limits from the catalog.
  addWidget: (widgetId) => {
    const { layout } = get()
    if (layout.some((item) => item.i === widgetId)) return
    const newItem = newCardItem(widgetId)
    if (newItem) set({ layout: [...layout, newItem] })
  },

  removeWidget: (widgetId) => {
    const { layout } = get()
    set({ layout: layout.filter((item) => item.i !== widgetId) })
  },

  resetLayout: () => {
    set({ layout: defaultLayout() })
  },
}))
```

- [ ] **Step 4: The grid**

Replace the whole of `src/components/views/HomeView.tsx` with:

```tsx
// src/components/views/HomeView.tsx
// Home: a grid of cards (Home cards spec). react-grid-layout, 4 columns,
// rows of 120px; while customizing, cards are dragged by their title,
// resized from their corner and removed with ×, and the catalog adds them.
import { useEffect, useMemo } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useDashboardStore } from '../../store/dashboardStore'
import { HOME_COLUMNS } from '../../lib/home/cards'
import { HomeCard, type HomeActions, type HomeFacts } from '../home/HomeCards'
import { HomeCatalog } from '../home/HomeCatalog'
import { HomeHeader } from '../home/HomeHeader'
import { useHomeData } from '../home/useHomeData'
import './HomeView.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

/** The grid's row height and the gap between cards, in pixels. */
const ROW_HEIGHT = 120
const GAP = 12

interface HomeViewProps extends HomeFacts, HomeActions {
  /** App raises it after a play, an analysis and a rescan: the cards read again. */
  dataVersion: number
}

export function HomeView({
  dataVersion,
  playlists,
  totalTrackCount,
  folderCount,
  spotify,
  youtubeMusic,
  ...actions
}: HomeViewProps) {
  const {
    layout,
    isEditMode,
    isLoaded,
    loadLayout,
    enterEditMode,
    cancelEdit,
    saveLayout,
    updateLayout,
    addWidget,
    removeWidget,
    resetLayout,
  } = useDashboardStore()

  useEffect(() => {
    if (!isLoaded) loadLayout()
  }, [isLoaded, loadLayout])

  // Nothing is read until the stored layout says which cards are on Home.
  const shown = useMemo(
    () => (isLoaded ? layout.map((item) => item.i) : []),
    [isLoaded, layout],
  )
  const data = useHomeData(shown, dataVersion)
  const facts: HomeFacts = {
    playlists,
    totalTrackCount,
    folderCount,
    spotify,
    youtubeMusic,
  }

  return (
    <div className="home-view">
      <HomeHeader
        editing={isEditMode}
        onCustomize={enterEditMode}
        onReset={resetLayout}
        onCancel={cancelEdit}
        onSave={saveLayout}
      />

      <div className="home-view__body">
        {isEditMode && <HomeCatalog shown={new Set(shown)} onAdd={addWidget} />}

        <div className="home-view__grid-container">
          {isLoaded && (
            <ResponsiveGridLayout
              className="home-view__grid"
              layouts={{ lg: layout }}
              breakpoints={{ lg: 0 }}
              cols={{ lg: HOME_COLUMNS }}
              rowHeight={ROW_HEIGHT}
              margin={[GAP, GAP]}
              containerPadding={[0, 0]}
              isDraggable={isEditMode}
              isResizable={isEditMode}
              draggableHandle=".home-card__head"
              draggableCancel=".home-card__remove"
              compactType="vertical"
              onLayoutChange={(next: Layout) => {
                if (isEditMode) updateLayout([...next])
              }}
            >
              {layout.map((item) => (
                <div key={item.i}>
                  <HomeCard
                    id={item.i}
                    columns={item.w}
                    editing={isEditMode}
                    onRemove={removeWidget}
                    data={data}
                    facts={facts}
                    actions={actions}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>
      </div>
    </div>
  )
}
```

Replace the whole of `src/components/views/HomeView.css` with:

```css
/* ============================================================
   HomeView — a grid of cards (Home cards spec), in the quiet style:
   dark cards, small grey titles; colour comes only from numbers,
   covers and genre tiles.
   ============================================================ */

.home-view {
  /* The accent drawn toward the text colour, so it reads on light themes too. */
  --home-accent: color-mix(in srgb, var(--accent), var(--text-primary) 25%);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

/* Sizes include padding and borders: a card is exactly its grid cell. */
.home-view,
.home-view *,
.home-view *::before,
.home-view *::after {
  box-sizing: border-box;
}

/* ---- Header ---- */
.home-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 22px 26px 18px;
  flex-shrink: 0;
}

.home-header__hello {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.home-header__greeting {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--text-primary);
}

.home-header__date {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.home-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* ---- Body (catalog + grid) ---- */
.home-view__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.home-view__grid-container {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0 26px 26px;
}

.home-view__grid {
  min-height: 100%;
}

/* ---- react-grid-layout while customizing ---- */
.home-view .react-grid-item.react-grid-placeholder {
  background: rgba(var(--accent-rgb), 0.15);
  border: 2px dashed var(--accent);
  border-radius: 10px;
  opacity: 1;
}

.home-view .react-resizable-handle {
  background: none;
}

.home-view .react-resizable-handle::after {
  border-color: var(--accent);
}

/* ---- Catalog ---- */
.home-catalog {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0 var(--space-3) var(--space-4) 26px;
}

.home-catalog__group + .home-catalog__group {
  margin-top: var(--space-4);
}

.home-catalog__heading {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.home-catalog__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 32px;
  padding: 6px var(--space-2) 6px var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.home-catalog__card + .home-catalog__card {
  margin-top: 4px;
}

.home-catalog__name {
  min-width: 0;
}

.home-catalog__on {
  flex-shrink: 0;
  padding: 2px 4px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.home-catalog__add {
  flex-shrink: 0;
  color: var(--home-accent);
}

/* ---- A card ---- */
.home-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 14px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.35;
}

.home-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 22px;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.home-card__title {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.home-card__head .link-btn {
  flex-shrink: 0;
  font-size: 11.5px;
}

/* A long list scrolls inside its card, and the wheel stays there. The 4px
   around it leave room for focus rings, which it would otherwise clip. */
.home-card__body {
  flex: 1;
  min-height: 0;
  margin: -4px -6px;
  padding: 4px 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  container-type: inline-size;
}

.home-card--editing {
  border-color: var(--accent);
}

.home-card--editing .home-card__head {
  cursor: grab;
}

.home-card--editing .home-card__head:active {
  cursor: grabbing;
}

/* While customizing, a card is moved, not used. */
.home-card--editing .home-card__body {
  pointer-events: none;
  opacity: 0.6;
}

.home-card__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.home-card__remove:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.home-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* ---- Track rows ---- */
/* Under the mouse, or reached with Tab, ▶ (or pause / play on the row
   playing) takes the number's place. Hidden, it stays in the Tab order. */
.home-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 34px 30px 62px;
  align-items: center;
  gap: var(--space-2);
  height: 38px;
  padding: 0 6px;
  margin: 0 -6px;
  border-radius: var(--radius-md);
  cursor: default;
  user-select: none;
}

.home-row:hover {
  background: var(--bg-tertiary);
}

.home-row--dragging {
  opacity: 0.4;
}

.home-row__no {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.home-row--playing .home-row__no {
  color: var(--home-accent);
}

.home-row__action {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  cursor: pointer;
  opacity: 0;
  transform: translate(-50%, -50%);
}

.home-row__action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.home-row:hover .home-row__number,
.home-row:hover .equalizer,
.home-row__no:has(.home-row__action:focus-visible) .home-row__number,
.home-row__no:has(.home-row__action:focus-visible) .equalizer {
  opacity: 0;
}

.home-row:hover .home-row__action,
.home-row__action:focus-visible {
  opacity: 1;
}

.home-row__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-row__title,
.home-row__artist {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-row__artist {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.home-row--playing .home-row__title {
  color: var(--home-accent);
}

/* Under the mouse, the playing row's title takes the text colour, as its
   pause / play button does. */
.home-row--playing:hover .home-row__title {
  color: var(--text-primary);
}

.home-row__figure {
  text-align: right;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.home-row__last {
  overflow: hidden;
  white-space: nowrap;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ---- Lists of buttons (Needs you, gigs) ---- */
.home-list {
  display: flex;
  flex-direction: column;
}

.home-news,
.home-gig {
  width: calc(100% + 12px);
  margin: 0 -6px;
  padding: 5px 6px;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-news:last-child,
.home-gig:last-child {
  border-bottom-color: transparent;
}

.home-news:hover,
.home-gig:hover {
  background: var(--bg-tertiary);
}

.home-news:focus-visible,
.home-gig:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.home-news {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-news__number {
  min-width: 38px;
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* Colour only from the numbers: each kind of news its own, drawn toward
   the text colour so it reads on light themes too. */
.home-news--spotify .home-news__number {
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
}

.home-news--youtube-music .home-news__number {
  color: color-mix(in srgb, #ff4e45 80%, var(--text-primary));
}

.home-news--not-analyzed .home-news__number {
  color: var(--home-accent);
}

.home-news--next-gig .home-news__number {
  font-size: var(--text-base);
  color: color-mix(in srgb, #facc15 75%, var(--text-primary));
}

.home-news__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-news__place {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 45%;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* A long list's name gives way; the › stays. */
.home-news__place-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-news__place svg {
  flex-shrink: 0;
}

.home-news:hover .home-news__place {
  color: var(--text-primary);
}

.home-gig {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.home-gig__date {
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.home-gig__date small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.home-gig__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-gig__line,
.home-gig__where {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-gig__where {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ---- Library by genre ---- */
.home-genres {
  display: grid;
  /* 4 to a row in a 2-column card, as the mockup; fewer when it is narrow. */
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  grid-auto-rows: minmax(56px, 1fr);
  gap: var(--space-2);
  min-height: 100%;
}

.home-genre {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 0;
  padding: 8px 10px;
  overflow: hidden;
  border: none;
  color: #fff;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--ease);
}

.home-genre:hover {
  filter: brightness(1.12);
}

.home-genre:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.home-genre__name {
  max-width: 100%;
  overflow-wrap: break-word;
}

.home-genre__count {
  margin-top: 2px;
  font-size: var(--text-xs);
  font-weight: 500;
  opacity: 0.85;
}

/* ---- Your playlists ---- */
.home-playlists {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-3);
}

.home-playlist {
  position: relative;
  min-width: 0;
}

.home-playlist__open {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 6px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.home-playlist__open:hover {
  background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%);
}

.home-playlist__open:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.home-playlist__cover {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--radius-sm);
}

.home-playlist__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-playlist__name,
.home-playlist__count {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-playlist__name {
  font-size: var(--text-sm);
}

.home-playlist__count {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ▶ over the cover: plays the playlist. */
.home-playlist__play {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.home-playlist:hover .home-playlist__play,
.home-playlist__play:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.home-playlist__play:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* ---- Figures (Library stats, Not analyzed) ---- */
.home-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-height: 100%;
}

.home-stat--action {
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
}

.home-stat__figure,
.home-figure {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-figures {
  display: flex;
  gap: var(--space-6);
}

.home-big {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.home-big--accent {
  color: var(--home-accent);
}

/* A narrow Not analyzed card: the button under the number, and the title
   says what the number is. */
@container (max-width: 200px) {
  .home-stat--action {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
  }

  .home-stat--action .home-sub {
    display: none;
  }
}

.home-sub {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ---- Quick actions ---- */
.home-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.home-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 56px;
  min-width: 0;
  padding: 0 4px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.home-action svg {
  color: var(--text-primary);
}

.home-action:hover {
  background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%);
  color: var(--text-primary);
}

.home-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 5: The old widgets go:** `git rm -r -q src/components/views/widgets`

- [ ] **Step 6: App** — Back from a DJ page opened on Home, the data-version number, All Tracks waiting for the library after a playlist, Settings on a section, the shared analysis, the playlist a play came from, a playlist's ▶, and Home's props.

In `src/App.tsx`, replace

```tsx
  | { kind: 'create-folder'; parentId: number | null }
  | { kind: 'rename'; id: number; currentName: string }
  | { kind: 'create-subfolder'; parentPath: string }
  | { kind: 'rename-folder'; folderPath: string; currentName: string }

/** Where a DJ page was first opened from: Back returns there. */
type DjOrigin = { view: 'search' } | { view: 'sets'; openVideoId: string | null }
/** The open Spotify or YouTube Music list: 'all', or a list id. */
type StreamList = { service: 'spotify' | 'youtube-music'; listId: string }

interface DjPageState {
  name: string
  /** From a Spotify search card: that artist, stored as a manual match. */
```

with

```tsx
  | { kind: 'create-folder'; parentId: number | null }
  | { kind: 'rename'; id: number; currentName: string }
  | { kind: 'create-subfolder'; parentPath: string }
  | { kind: 'rename-folder'; folderPath: string; currentName: string }

/** Where a DJ page was first opened from: Back returns there. */
type DjOrigin =
  | { view: 'search' }
  | { view: 'sets'; openVideoId: string | null }
  | { view: 'home' }
/** The open Spotify or YouTube Music list: 'all', or a list id. */
type StreamList = { service: 'spotify' | 'youtube-music'; listId: string }

interface DjPageState {
  name: string
  /** From a Spotify search card: that artist, stored as a manual match. */
```

In `src/App.tsx`, replace

```tsx
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
  // Raised after each play is recorded: the track table's Plays column (and
  // Home, later) read their counts again.
  const [playVersion, setPlayVersion] = useState(0)

  // Genre state
  const [genreDefinitions, setGenreDefinitions] = useState<
    Array<{ id: number; name: string; color?: string }>
  >([])
```

with

```tsx
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
  // Raised after each play is recorded: the track table's Plays column and
  // Home's cards read their counts again.
  const [playVersion, setPlayVersion] = useState(0)
  // Raised after an analysis finishes and after a rescan: Home's cards read
  // again (with playVersion, after a play).
  const [dataVersion, setDataVersion] = useState(0)
  // All Tracks opened with a filter while `tracks` holds a playlist's or a
  // folder's tracks: its rows wait for the library, so neither the wrong
  // rows nor "No tracks match" show for a moment.
  const [libraryPending, setLibraryPending] = useState(false)

  // Genre state
  const [genreDefinitions, setGenreDefinitions] = useState<
    Array<{ id: number; name: string; color?: string }>
  >([])
```

In `src/App.tsx`, replace

```tsx
            })
          }

          // Reload tracks and rebuild AI context (use ref to avoid stale closure)
          loadTracksRef.current()
          tauriApi.rebuildAIContext().catch(() => {})
        }, delay)
      },
    )

    return () => {
      unlistenProgress.then((fn) => fn())
```

with

```tsx
            })
          }

          // Reload tracks and rebuild AI context (use ref to avoid stale closure)
          loadTracksRef.current()
          tauriApi.rebuildAIContext().catch(() => {})
          setDataVersion((version) => version + 1)
        }, delay)
      },
    )

    return () => {
      unlistenProgress.then((fn) => fn())
```

In `src/App.tsx`, replace

```tsx
      const remaining = Math.max(0, 2500 - elapsed)
      setTimeout(() => setLoading(false), remaining)
    }
  }

  // Load tracks — all, by folder, or by playlist
  const loadTracks = useCallback(
    async (folderPath?: string | null, playlistId?: number | null) => {
      try {
        const folder = folderPath !== undefined ? folderPath : selectedFolder
        const playlist =
          playlistId !== undefined ? playlistId : selectedPlaylistId
```

with

```tsx
      const remaining = Math.max(0, 2500 - elapsed)
      setTimeout(() => setLoading(false), remaining)
    }
  }

  // Load tracks — all, by folder, or by playlist
  // What `tracks` holds: the whole library, or a playlist's or a folder's.
  const tracksAreLibraryRef = useRef(false)
  const loadTracks = useCallback(
    async (folderPath?: string | null, playlistId?: number | null) => {
      try {
        const folder = folderPath !== undefined ? folderPath : selectedFolder
        const playlist =
          playlistId !== undefined ? playlistId : selectedPlaylistId
```

In `src/App.tsx`, replace

```tsx
          // Load all tracks in one shot — SQLite is fast and TanStack Virtual handles rendering
          result = await tauriApi.getAllTracks()
          total = result.length
        }

        setTracks(result)

        // Always update total track count
        try {
          if (total === 0) {
            total = await tauriApi.countTracks()
          }
```

with

```tsx
          // Load all tracks in one shot — SQLite is fast and TanStack Virtual handles rendering
          result = await tauriApi.getAllTracks()
          total = result.length
        }

        setTracks(result)
        tracksAreLibraryRef.current = !playlist && !folder

        // Always update total track count
        try {
          if (total === 0) {
            total = await tauriApi.countTracks()
          }
```

In `src/App.tsx`, replace

```tsx
        return
      }

      try {
        const results = await tauriApi.searchTracks(query)
        setTracks(results)
      } catch (err) {
        console.error('Backend search failed:', err)
      }
    },
    [selectedFolder, selectedPlaylistId, loadTracks],
  )
```

with

```tsx
        return
      }

      try {
        const results = await tauriApi.searchTracks(query)
        setTracks(results)
        tracksAreLibraryRef.current = false
      } catch (err) {
        console.error('Backend search failed:', err)
      }
    },
    [selectedFolder, selectedPlaylistId, loadTracks],
  )
```

In `src/App.tsx`, replace

```tsx
        } catch (err) {
          console.warn(`Failed to re-scan folder ${folder}:`, err)
        }
      }
      // Reload tracks
      await loadTracksRef.current()
      // New or removed folders and changed counts, in the sidebar's tree
      void useFolderTreeStore
        .getState()
        .invalidateAll(libraryFoldersRef.current)
      // Rebuild AI context cache
      tauriApi.rebuildAIContext().catch(() => {})
```

with

```tsx
        } catch (err) {
          console.warn(`Failed to re-scan folder ${folder}:`, err)
        }
      }
      // Reload tracks
      await loadTracksRef.current()
      setDataVersion((version) => version + 1)
      // New or removed folders and changed counts, in the sidebar's tree
      void useFolderTreeStore
        .getState()
        .invalidateAll(libraryFoldersRef.current)
      // Rebuild AI context cache
      tauriApi.rebuildAIContext().catch(() => {})
```

In `src/App.tsx`, replace

```tsx
    setShowAIChat(false)
    youtubeMusic.openList(listId)
  }

  // A DJ page. From another DJ page it replaces that one and keeps its origin,
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
    if (!djPage) return
    if (djPage.from.view === 'sets') {
      openSets({ openVideoId: djPage.from.openVideoId, initialQuery: '' })
      return
    }
    setShowSearch(true)
    setShowSets(false)
    setDjPage(null)
  }

  // Sets, arriving on a set or with a DJ's name in the Set tab's box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
```

with

```tsx
    setShowAIChat(false)
    youtubeMusic.openList(listId)
  }

  // A DJ page. From another DJ page it replaces that one and keeps its origin,
  // so Back still returns to where the first one was opened. The origin's view
  // stays set underneath (showSearch / showSets; Home is what shows with
  // neither) and keeps its sidebar item lit.
  function openDj(name: string, spotifyArtistId: string | null = null, from?: DjOrigin) {
    const origin: DjOrigin =
      djPage?.from ?? from ?? (showSets ? { view: 'sets', openVideoId: null } : { view: 'search' })
    setDjPage({ name, spotifyArtistId, from: origin })
    // Search's Your DJs shows the pages opened most recently first.
    noteDjOpened(name)
  }

  // Back: the view the first DJ page was opened from — Search with its query,
  // Sets with the set the page was opened from open again, or Home. `djPage.from`
  // is gone once the page closes, so the set goes into `setsStart`.
  function closeDj() {
    if (!djPage) return
    if (djPage.from.view === 'sets') {
      openSets({ openVideoId: djPage.from.openVideoId, initialQuery: '' })
      return
    }
    setShowSearch(djPage.from.view === 'search')
    setShowSets(false)
    setDjPage(null)
  }

  // Sets, arriving on a set or with a DJ's name in the Set tab's box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
```

In `src/App.tsx`, replace

```tsx
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
```

with

```tsx
    setTableFilter(null)
    setShowSettings(false)
    setShowAIChat(false)
  }

  // All Tracks, from the sidebar, or with a filter set from Search's genre
  // tiles or Home's cards. Search holds the whole library already, so the
  // filtered rows show at once while the tracks load again; after a playlist
  // or a folder, filtered rows wait for the library (`libraryPending`).
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
    const waiting = filter !== null && !tracksAreLibraryRef.current
    if (waiting) setLibraryPending(true)
    void loadTracks(null, null).finally(() => {
      if (waiting) setLibraryPending(false)
    })
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId)
    setStreamList(null)
```

In `src/App.tsx`, replace

```tsx
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    await loadTracks(null, playlistId)
  }

  // Settings with its Spotify section open: a DJ page's "Connect Spotify".
  function openSpotifySettings() {
    openSettingsSection('spotify')
    setShowSettings(true)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
  }

  // Analyze folder — BPM and Key for tracks that don't have them yet (parallel batch)
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)
```

with

```tsx
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    await loadTracks(null, playlistId)
  }

  // Settings with one section open: a DJ page's "Connect Spotify", Home's
  // Import folder (Library).
  function openSettingsOn(section: string) {
    openSettingsSection(section)
    setShowSettings(true)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
  }

  function openSpotifySettings() {
    openSettingsOn('spotify')
  }

  // Analyze folder — BPM and Key for tracks that don't have them yet (parallel batch)
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)
```

In `src/App.tsx`, replace

```tsx
        .patchTrackPaths(new Map(report.moved.map((m) => [m.id, m.newPath])))
      for (const { id } of report.moved) {
        thumbnails.forget(id)
        evictArtworkCache(id)
      }
      await loadTracksRef.current()
      await useFolderTreeStore.getState().invalidateAll(libraryFoldersRef.current)
    }
    return { moved: report.moved, skipped: [...playing, ...report.skipped] }
  }

  async function handleMoveToFolder(selected: Track[], folder: LibraryFolder) {
```

with

```tsx
        .patchTrackPaths(new Map(report.moved.map((m) => [m.id, m.newPath])))
      for (const { id } of report.moved) {
        thumbnails.forget(id)
        evictArtworkCache(id)
      }
      await loadTracksRef.current()
      // Home's track rows hold the old paths until they read again.
      setDataVersion((version) => version + 1)
      await useFolderTreeStore.getState().invalidateAll(libraryFoldersRef.current)
    }
    return { moved: report.moved, skipped: [...playing, ...report.skipped] }
  }

  async function handleMoveToFolder(selected: Track[], folder: LibraryFolder) {
```

In `src/App.tsx`, replace

```tsx

      if (trackIds.length === 0) {
        setNotification({ message: 'No tracks in library', type: 'info' })
        return
      }

      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
```

with

```tsx

      if (trackIds.length === 0) {
        setNotification({ message: 'No tracks in library', type: 'info' })
        return
      }

      await analyzeTrackIds(trackIds)
    } catch (err) {
      // Reading the library failed; analyzeTrackIds reports its own failures.
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Home's Analyze all: exactly the tracks without a BPM, which Home read.
  function handleAnalyzeFromHome(trackIds: number[]) {
    if (analyzing) {
      toast('Analysis is already running', { kind: 'info' })
      return
    }
    if (trackIds.length === 0) {
      toast('Everything is analyzed', { kind: 'info' })
      return
    }
    void analyzeTrackIds(trackIds)
  }

  // BPM and key for these tracks, skipping those that have both (the
  // sidebar's Analyze All Tracks and Home's Analyze all).
  async function analyzeTrackIds(trackIds: number[]) {
    try {
      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
```

In `src/App.tsx`, replace

```tsx
  const { setIsLoading, setError: setPlayerError, setQueue } = usePlayerStore()

  const handleTrackClick = (track: Track) => {
    console.log('Clicked track:', track)
  }

  const handlePlayTrack = async (
    track: Track,
    sortedTracks: Track[],
    trackIndex: number,
  ) => {
    if (!track.file_path) {
      console.error('[App] Track has no file path')
      return
    }
```

with

```tsx
  const { setIsLoading, setError: setPlayerError, setQueue } = usePlayerStore()

  const handleTrackClick = (track: Track) => {
    console.log('Clicked track:', track)
  }

  // `playlistId`: the playlist the play came from, when it is not the one
  // open in the table (Home's Your playlists).
  const handlePlayTrack = async (
    track: Track,
    sortedTracks: Track[],
    trackIndex: number,
    playlistId?: number,
  ) => {
    if (!track.file_path) {
      console.error('[App] Track has no file path')
      return
    }
```

In `src/App.tsx`, replace

```tsx
      setQueue(sortedTracks, trackIndex)

      // Record play event for dashboard
      const trackToPlay = sortedTracks[trackIndex]
      if (trackToPlay?.id) {
        tauriApi
          .recordPlayEvent(trackToPlay.id, selectedPlaylistId ?? null)
          .then(() => setPlayVersion((version) => version + 1))
          .catch(console.error)
      }
    } catch (err) {
      console.error('[App] Play error:', err)
      setPlayerError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="loading-screen">
          <img
            src="/recodeck-logo.gif"
```

with

```tsx
      setQueue(sortedTracks, trackIndex)

      // Record play event for dashboard
      const trackToPlay = sortedTracks[trackIndex]
      if (trackToPlay?.id) {
        tauriApi
          .recordPlayEvent(trackToPlay.id, playlistId ?? selectedPlaylistId ?? null)
          .then(() => setPlayVersion((version) => version + 1))
          .catch(console.error)
      }
    } catch (err) {
      console.error('[App] Play error:', err)
      setPlayerError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // A playlist's ▶ on Home: from its first track, the playlist as the queue.
  async function playPlaylist(playlistId: number) {
    try {
      const list = await tauriApi.getPlaylistTracks(playlistId)
      if (list.length === 0) {
        toast('This playlist is empty', { kind: 'info' })
        return
      }
      await handlePlayTrack(list[0], list, 0, playlistId)
    } catch (err) {
      toast(`Could not play the playlist: ${err instanceof Error ? err.message : String(err)}`, {
        kind: 'error',
      })
    }
  }

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="loading-screen">
          <img
            src="/recodeck-logo.gif"
```

In `src/App.tsx`, replace

```tsx
                }}
              />
            ) : showAIChat ? (
              <ChatView onPlaylistCreated={loadPlaylists} />
            ) : !selectedFolder && !selectedPlaylistId && !showAllTracks ? (
              <HomeView
                playlists={playlists}
                totalTrackCount={totalTrackCount}
                folderCount={libraryFolders.length}
                onPlaylistSelect={handlePlaylistSelect}
                onNavigateAIChat={
                  AI_ENABLED
                    ? () => {
                        setShowAIChat(true)
                        setStreamList(null)
                        setDjPage(null)
                        setSelectedPlaylistId(null)
                        setSelectedFolder(null)
                        setShowAllTracks(false)
                        setTableFilter(null)
                        setShowSearch(false)
                        setShowSets(false)
                        setShowSettings(false)
                      }
                    : undefined
                }
                onOpenSettings={() => {
                  setShowSettings(true)
                  setStreamList(null)
                  setDjPage(null)
                  setShowAIChat(false)
                  setSelectedPlaylistId(null)
                  setSelectedFolder(null)
                  setShowAllTracks(false)
                  setTableFilter(null)
                  setShowSearch(false)
                  setShowSets(false)
                }}
              />
            ) : tracks.length === 0 && !allTracksWithLibrary ? (
              <div className="empty-state">
                <h2>{emptyTitle}</h2>
                <p>{emptySubtitle}</p>
              </div>
            ) : (
```

with

```tsx
                }}
              />
            ) : showAIChat ? (
              <ChatView onPlaylistCreated={loadPlaylists} />
            ) : !selectedFolder && !selectedPlaylistId && !showAllTracks ? (
              <HomeView
                dataVersion={playVersion + dataVersion}
                playlists={playlists}
                totalTrackCount={totalTrackCount}
                folderCount={libraryFolders.length}
                spotify={
                  spotifyShown
                    ? {
                        total: spotify.newCounts.total,
                        byList: spotify.newCounts.byList,
                        lists: spotify.library.lists,
                      }
                    : null
                }
                youtubeMusic={
                  youtubeMusicShown
                    ? {
                        total: youtubeMusicMatches.newCounts.total,
                        byList: youtubeMusicMatches.newCounts.byList,
                        lists: youtubeMusic.library.lists,
                      }
                    : null
                }
                onPlay={handlePlayTrack}
                onPlayPlaylist={(id) => void playPlaylist(id)}
                onOpenPlaylist={handlePlaylistSelect}
                onOpenDj={(name) => openDj(name, null, { view: 'home' })}
                onOpenSets={() => openSets(NO_SETS_START)}
                onOpenAllTracks={openAllTracks}
                onOpenStreamList={(service, listId) =>
                  service === 'spotify' ? openSpotifyList(listId) : openYouTubeMusicList(listId)
                }
                onAnalyzeTracks={handleAnalyzeFromHome}
                onCreatePlaylist={() => handleCreatePlaylist(null)}
                onImportFolder={() => openSettingsOn('library')}
                onAddToPlaylist={handleAddToPlaylist}
                onMoveToFolder={handleMoveToFolder}
              />
            ) : showAllTracks && libraryPending ? (
              <div />
            ) : tracks.length === 0 && !allTracksWithLibrary ? (
              <div className="empty-state">
                <h2>{emptyTitle}</h2>
                <p>{emptySubtitle}</p>
              </div>
            ) : (
```

- [ ] **Step 7:** Run:
  - `npx vitest run src/store/dashboardStore.test.ts`: PASS, 11;
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)` — one fewer than the baseline (the old `WidgetCatalog.tsx`'s), none new.

  Commit:

```bash
git add src/components/views/HomeView.tsx src/components/views/HomeView.css src/store/dashboardStore.ts src/store/dashboardStore.test.ts src/App.tsx
git commit -m "feat(home): Home as a grid of cards — playing, Customize with Reset, Back to Home"
```

(`git rm` in Step 5 staged the deleted widgets already.)

---

### Task 8: The old widgets' commands removed

**Files:** Modify `src-tauri/src/commands/dashboard.rs`, `src-tauri/src/db/mod.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri-api.ts`.

Nothing calls them now: `grep -rn "getRecentlyPlayed(\|getRecentlyAdded(\|getLibraryInsights\|get_recently_played\b\|get_recently_added\b\|get_library_insights" src src-tauri/src` finds only what this task removes, and nothing after it.

- [ ] **Step 1: Rust**

In `src-tauri/src/commands/dashboard.rs`, replace

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::library::AppState;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayHistoryEntry {
    pub track_id: i64,
    pub playlist_id: Option<i64>,
    pub played_at: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayCount {
    pub track_id: i64,
    pub plays: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentlyAddedTrack {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub file_path: String,
    pub date_added: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryInsights {
    pub top_genre: Option<String>,
    pub bpm_min: Option<f64>,
    pub bpm_max: Option<f64>,
    pub top_key: Option<String>,
    pub avg_energy: Option<f64>,
    pub total_tracks: i64,
    pub analyzed_tracks: i64,
}

#[tauri::command]
pub fn record_play_event(
    track_id: i64,
    playlist_id: Option<i64>,
    state: State<AppState>,
) -> Result<(), AppError> {
```

with

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::library::AppState;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayCount {
    pub track_id: i64,
    pub plays: i64,
}

#[tauri::command]
pub fn record_play_event(
    track_id: i64,
    playlist_id: Option<i64>,
    state: State<AppState>,
) -> Result<(), AppError> {
```

In `src-tauri/src/commands/dashboard.rs`, replace

```rust
    Ok(rows
        .into_iter()
        .map(|(track_id, plays)| PlayCount { track_id, plays })
        .collect())
}

#[tauri::command]
pub fn get_recently_played(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<PlayHistoryEntry>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let limit = limit.unwrap_or(10);
    let rows = db
        .get_recently_played(limit)
        .map_err(|e| AppError::Internal(format!("Failed to query play history: {}", e)))?;

    let entries = rows
        .into_iter()
        .map(|(track_id, playlist_id, played_at, title, artist, file_path)| PlayHistoryEntry {
            track_id,
            playlist_id,
            played_at,
            title,
            artist,
            file_path,
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn get_recently_added(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<RecentlyAddedTrack>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let limit = limit.unwrap_or(10);
    let rows = db
        .get_recently_added(limit)
        .map_err(|e| AppError::Internal(format!("Failed to query recently added: {}", e)))?;

    let tracks = rows
        .into_iter()
        .map(|(id, title, artist, file_path, date_added)| RecentlyAddedTrack {
            id,
            title,
            artist,
            file_path,
            date_added,
        })
        .collect();

    Ok(tracks)
}

#[tauri::command]
pub fn get_library_insights(state: State<AppState>) -> Result<LibraryInsights, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let (total_tracks, analyzed_tracks, top_genre, bpm_min, bpm_max, top_key, avg_energy) = db
        .get_library_insights()
        .map_err(|e| AppError::Internal(format!("Failed to get library insights: {}", e)))?;

    Ok(LibraryInsights {
        top_genre,
        bpm_min,
        bpm_max,
        top_key,
        avg_energy,
        total_tracks,
        analyzed_tracks,
    })
}

#[tauri::command]
pub fn save_dashboard_layout(
    layout_json: String,
    state: State<AppState>,
) -> Result<(), AppError> {
    let db_lock = state
```

with

```rust
    Ok(rows
        .into_iter()
        .map(|(track_id, plays)| PlayCount { track_id, plays })
        .collect())
}

#[tauri::command]
pub fn save_dashboard_layout(
    layout_json: String,
    state: State<AppState>,
) -> Result<(), AppError> {
    let db_lock = state
```

In `src-tauri/src/db/mod.rs`, replace

```rust
             ORDER BY track_id",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect()
    }

    /// Get recently played tracks (joined with track data), ordered by most recent first.
    pub fn get_recently_played(&self, limit: i64) -> Result<Vec<(i64, Option<i64>, i64, Option<String>, Option<String>, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT ph.track_id, ph.playlist_id, ph.played_at, t.title, t.artist, t.file_path
             FROM play_history ph
             LEFT JOIN tracks t ON t.id = ph.track_id
             ORDER BY ph.played_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        rows.collect()
    }

    /// Get recently added tracks ordered by date_added DESC.
    pub fn get_recently_added(&self, limit: i64) -> Result<Vec<(i64, Option<String>, Option<String>, String, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, artist, file_path, date_added
             FROM tracks
             ORDER BY date_added DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?;
        rows.collect()
    }

    /// Get library insight statistics.
    pub fn get_library_insights(&self) -> Result<(i64, i64, Option<String>, Option<f64>, Option<f64>, Option<String>, Option<f64>)> {
        let total_tracks: i64 = self.conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get::<_, i64>(0))
            .unwrap_or(0);

        let analyzed_tracks: i64 = self.conn
            .query_row(
                "SELECT COUNT(*) FROM track_analysis WHERE bpm IS NOT NULL",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0);

        let top_genre: Option<String> = self.conn
            .query_row(
                "SELECT genre FROM tracks WHERE genre IS NOT NULL
                 GROUP BY genre ORDER BY COUNT(*) DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok();

        let bpm_min: Option<f64> = self.conn
            .query_row(
                "SELECT MIN(bpm) FROM track_analysis WHERE bpm IS NOT NULL",
                [],
                |row| row.get::<_, f64>(0),
            )
            .ok();

        let bpm_max: Option<f64> = self.conn
            .query_row(
                "SELECT MAX(bpm) FROM track_analysis WHERE bpm IS NOT NULL",
                [],
                |row| row.get::<_, f64>(0),
            )
            .ok();

        let top_key: Option<String> = self.conn
            .query_row(
                "SELECT musical_key FROM track_analysis WHERE musical_key IS NOT NULL
                 GROUP BY musical_key ORDER BY COUNT(*) DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok();

        let avg_energy: Option<f64> = self.conn
            .query_row(
                "SELECT AVG(energy_arousal) FROM track_deep_analysis WHERE energy_arousal IS NOT NULL",
                [],
                |row| row.get::<_, f64>(0),
            )
            .ok();

        Ok((total_tracks, analyzed_tracks, top_genre, bpm_min, bpm_max, top_key, avg_energy))
    }

    /// Save the dashboard layout JSON (upsert with fixed id=1).
    pub fn save_dashboard_layout(&self, layout_json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO dashboard_layout (id, layout_json, updated_at)
             VALUES (1, ?1, strftime('%s', 'now'))",
            params![layout_json],
```

with

```rust
             ORDER BY track_id",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect()
    }

    /// Save the dashboard layout JSON (upsert with fixed id=1).
    pub fn save_dashboard_layout(&self, layout_json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO dashboard_layout (id, layout_json, updated_at)
             VALUES (1, ?1, strftime('%s', 'now'))",
            params![layout_json],
```

In `src-tauri/src/lib.rs`, replace

```rust
            commands::dashboard::record_play_event,
            commands::dashboard::get_recently_played,
            commands::dashboard::get_played_track_ids,
            commands::dashboard::get_play_counts,
            commands::dashboard::get_recently_added,
            commands::dashboard::get_library_insights,
            commands::dashboard::save_dashboard_layout,
```

with

```rust
            commands::dashboard::record_play_event,
            commands::dashboard::get_played_track_ids,
            commands::dashboard::get_play_counts,
            commands::dashboard::save_dashboard_layout,
```

- [ ] **Step 2: The calls**

In `src/lib/tauri-api.ts`, replace

```ts
  async getRecentlyPlayed(limit?: number): Promise<{
    track_id: number
    playlist_id: number | null
    played_at: number
    title: string | null
    artist: string | null
    file_path: string | null
  }[]> {
    return await invoke('get_recently_played', { limit: limit ?? 10 })
  },

  async getRecentlyAdded(limit?: number): Promise<{
    id: number
    title: string | null
    artist: string | null
    file_path: string
    date_added: string | null
  }[]> {
    return await invoke('get_recently_added', { limit: limit ?? 10 })
  },

  async getLibraryInsights(): Promise<{
    top_genre: string | null
    bpm_min: number | null
    bpm_max: number | null
    top_key: string | null
    avg_energy: number | null
    total_tracks: number
    analyzed_tracks: number
  }> {
    return await invoke('get_library_insights')
  },

  async saveDashboardLayout(layoutJson: string): Promise<void> {
```

with

```ts
  async saveDashboardLayout(layoutJson: string): Promise<void> {
```

- [ ] **Step 3:** `cd src-tauri && cargo test --lib`: PASS, 449; `cargo build`: no warning. `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src-tauri/src/commands/dashboard.rs src-tauri/src/db/mod.rs src-tauri/src/lib.rs src/lib/tauri-api.ts
git commit -m "refactor(home): remove the old widgets' recently played, recently added and insights commands"
```

---

### Task 9: The spec, as built

**Files:** Modify `docs/superpowers/specs/2026-10-04-home-cards-design.md`.

- [ ] **Step 1:**

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
| | **New sets** | sets your watched DJs' searches found that you have not seen (see New sets) | opens the set in Sets | 2×2 | 2×1 | 4×3 |
| | **Your DJs play next** | upcoming gigs of every DJ with a page: date block, "DJ · venue", city | opens the DJ page | 2×2 | 2×1 | 4×3 |
| Your library | **Library stats** | see Library stats | — | 1×1 | 1×1 | 4×1 |
| | **Library by genre** | tiles: the 6 biggest genres, Added lately, Never played, with counts | opens All Tracks filtered | 2×2 | 2×1 | 4×3 |
| | **BPM & key** | BPM bars by range; key counts | a bar or key opens All Tracks filtered | 2×2 | 2×1 | 4×2 |
| | **Not analyzed** | how many tracks have no BPM; **Analyze all** | Analyze all | 1×1 | 1×1 | 2×1 |
| Gig prep | **Your playlists** | playlist cards (cover, name, count); ▶ over the cover | opens the playlist; ▶ plays it | 4×1 | 2×1 | 4×3 |
| | **Quick actions** | Import folder, Analyze all, Open Sets, New playlist | each does its action | 2×1 | 2×1 | 4×1 |
| | **Last playlist** | the playlist you last played from: cover, name, count, ▶, its tracks | ▶ plays it; a row plays from there | 2×2 | 2×1 | 4×3 |

A list longer than its card scrolls inside the card, and the wheel stays in
the card, as on the DJ Overview. Lists read at most: 20 recently played, 20
recently added, 10 saved sets, 20 new sets, 20 gigs, every track of the last
```

with

```markdown
| | **New sets** | sets your watched DJs' searches found that you have not seen (see New sets) | opens the set in Sets | 2×2 | 2×1 | 4×3 |
| | **Your DJs play next** | upcoming gigs of every DJ with a page: date block, "DJ · venue", city | opens the DJ page | 2×2 | 2×1 | 4×3 |
| Your library | **Library stats** | see Library stats | — | 1×1 | 1×1 | 4×1 |
| | **Library by genre** | tiles: the 6 biggest genres, Added lately, Never played, with counts | opens All Tracks filtered | 2×2 | 2×1 | 4×3 |
| | **BPM & key** | BPM bars by range; key counts | a bar or key opens All Tracks filtered | 2×2 | 2×1 | 4×2 |
| | **Not analyzed** | how many tracks have no BPM; **Analyze all** | Analyze all | 1×1 | 1×1 | 2×1 |
| Gig prep | **Your playlists** | playlist cards (cover, name, count) for the playlists the sidebar lists, not their folders; ▶ over the cover, none on an empty playlist | opens the playlist; ▶ plays it | 4×1 | 2×1 | 4×3 |
| | **Quick actions** | Import folder, Analyze all, Open Sets, New playlist | each does its action | 2×1 | 2×1 | 4×1 |
| | **Last playlist** | the playlist you last played from: cover, name, count, ▶, its tracks | ▶ plays it; a row plays from there | 2×2 | 2×1 | 4×3 |

A list longer than its card scrolls inside the card, and the wheel stays in
the card, as on the DJ Overview. Lists read at most: 20 recently played, 20
recently added, 10 saved sets, 20 new sets, 20 gigs, every track of the last
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
Advisor" links are dropped, and Not analyzed's Analyze all is a button in the
card's body.

**Titles** ship as the catalog table names the cards ("Library stats", "Library
by genre", "New sets"); the mockup's titles were drafts.

### Default layout

Eight cards, as in the mockup:

| Card | x | y | w×h |
|---|---|---|---|
```

with

```markdown
Advisor" links are dropped, and Not analyzed's Analyze all is a button in the
card's body.

**Titles** ship as the catalog table names the cards ("Library stats", "Library
by genre", "New sets"); the mockup's titles were drafts.

A playlist's cover is a gradient square picked by its name, as on Search's
playlist cards and in the approved mockup: no track or artwork is read for it.

**Built in three plans** (the user's choice), each checked by hand before
the next: **H1** the grid, Customize and the eight default cards; **H2**
Recently added, Last playlist, Your DJs, New likes you don't own and BPM &
key; **H3** New sets, Sets you saved lately and Needs you's New sets row.
The catalog lists only the cards built so far.

### Default layout

Eight cards, as in the mockup:

| Card | x | y | w×h |
|---|---|---|---|
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
  the catalog, not from what was stored, and its stored w/h is clamped into
  them (react-grid-layout enforces limits only while resizing).

## Cards in detail

**Track rows** (Recently played, Recently added, Last playlist): number, title
over artist, BPM, key, and a last column — the time played ("22:39" today,
"yesterday", else "Oct 2"), the date added (same rule), or the length (Last
playlist). Missing BPM or key shows "—". Hovering a row turns its number into
▶; clicking ▶, or double-clicking the row, plays. The track playing now shows
an **equalizer** in place of its number — three thin bars in the accent colour
that move while it plays and stand still while it is paused — and its title in
the accent colour. Hovering that row shows **pause** while it plays and **▶**
while it is paused (lucide icons, not text glyphs); clicking does that, as the
player's button does. The same
indicator is used in All Tracks and in a set's track list (their specs). The
mockup's ▮▮ is replaced by it. The queue is the card's list as it was when you pressed play:
Recently played then re-reads and the track moves to the top, but the queue
keeps its order.

`date_added`, `yt_sets.added_at` and `played_at` are UTC; the labels compare
local calendar days ("today", "yesterday") after converting them to local
time.
```

with

```markdown
  the catalog, not from what was stored, and its stored w/h is clamped into
  them (react-grid-layout enforces limits only while resizing).

## Cards in detail

**Track rows** (Recently played, Recently added, Last playlist): number, title
over artist, BPM (whole beats), key, and a last column — the time played ("22:39" today,
"yesterday", else "Oct 2"), the date added (same rule), or the length (Last
playlist). Missing BPM or key shows "—". Hovering a row turns its number into
▶; clicking ▶, or double-clicking the row, plays. The track playing now shows
an **equalizer** in place of its number — three thin bars in the accent colour
that move while it plays and stand still while it is paused — and its title in
the accent colour. Hovering that row shows **pause** while it plays and **▶**
while it is paused (lucide icons, not text glyphs); clicking does that, as the
player's button does. The same
indicator is used in All Tracks and in a set's track list (their specs). The
mockup's ▮▮ is replaced by it. Home has no selection: a single click does
nothing, and a drag carries that one row. The queue is the card's list as it was when you pressed play:
Recently played then re-reads and the track moves to the top, but the queue
keeps its order.

`date_added`, `yt_sets.added_at` and `played_at` are UTC; the labels compare
local calendar days ("today", "yesterday") after converting them to local
time.
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
| New Spotify likes you don't own | the sidebar's Spotify number (`newCounts.total`), when Spotify is shown in the sidebar | the list with the most new likes |
| New YouTube Music likes | the same for YouTube Music | the same |
| New sets | the New sets count (below) | Sets, on its library (`SetsStart` gains a library start) |
| Tracks not analyzed | tracks with no BPM | Analyze all |
| Next gig | the earliest upcoming gig of your DJs, as "Tue · Traumer plays Hï Ibiza · Oct 6" | that DJ's page |

**New sets.** News is about a video. A video is new while none of its find
rows (`yt_dj_finds`) is seen. "Seen" is a new nullable column
`yt_dj_finds.seen_at` (migration 018, no default; NULL is unseen; marking
writes SQLite `datetime('now')`). A find row is written already seen when its
video is in `yt_sets` at that moment or already has a seen row — so a set you
imported or opened before any search found it, or a b2b set a second DJ's
```

with

```markdown
| New Spotify likes you don't own | the sidebar's Spotify number (`newCounts.total`), when Spotify is shown in the sidebar | the list with the most new likes |
| New YouTube Music likes | the same for YouTube Music | the same |
| New sets | the New sets count (below) | Sets, on its library (`SetsStart` gains a library start) |
| Tracks not analyzed | tracks with no BPM | Analyze all |
| Next gig | the earliest upcoming gig of your DJs, as "Tue · Traumer plays Hï Ibiza · Oct 6" | that DJ's page |

The numbers take their kind's colour — Spotify green, YouTube Music red, the
accent for tracks not analyzed, yellow for the gig's weekday — drawn toward
the text colour so they read on the light themes too. A gig without a venue
says the city ("Traumer plays Ibiza"), without either "Traumer has a gig";
its date shows the year when it is not this one.

**New sets.** News is about a video. A video is new while none of its find
rows (`yt_dj_finds`) is seen. "Seen" is a new nullable column
`yt_dj_finds.seen_at` (migration 018, no default; NULL is unseen; marking
writes SQLite `datetime('now')`). A find row is written already seen when its
video is in `yt_sets` at that moment or already has a seen row — so a set you
imported or opened before any search found it, or a b2b set a second DJ's
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
count is of distinct videos; a video found by two DJs' searches shows once,
under the DJ whose row has the earliest `first_seen_at` (then the lowest name
key, as one check stamps its rows with the same second). Newest first means by
that earliest `first_seen_at`. Followed channels' new uploads are
not stored until Sets checks them, so they are not on Home.

**Library stats.** At 1×1: the track count, and "N added lately" under it. At
2×1 and wider: tracks, playlists and folders, with "N added lately · N never
played" under them.

**BPM & key.** BPM bars are half-open ranges and set the `TrackFilter` of
the track table spec: `< 115` (`{ bpmMax: 115 }`), `115–119`
(`{ bpmMin: 115, bpmMax: 120 }`), `120–124`, `125–129`, `130–134`, `135+`
```

with

```markdown
count is of distinct videos; a video found by two DJs' searches shows once,
under the DJ whose row has the earliest `first_seen_at` (then the lowest name
key, as one check stamps its rows with the same second). Newest first means by
that earliest `first_seen_at`. Followed channels' new uploads are
not stored until Sets checks them, so they are not on Home.

**Library stats.** At 1×1: the track count, and "tracks · N added lately" under it. At
2×1 and wider: tracks, playlists and folders, with "N added lately · N never
played" under them.

**BPM & key.** BPM bars are half-open ranges and set the `TrackFilter` of
the track table spec: `< 115` (`{ bpmMax: 115 }`), `115–119`
(`{ bpmMin: 115, bpmMax: 120 }`), `120–124`, `125–129`, `130–134`, `135+`
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
**Not analyzed** counts tracks with no BPM (223 today), subtitle "no BPM yet".
Its **Analyze all**, and Quick actions' **Analyze all**, analyze exactly the
tracks without a BPM (`get_track_ids_without_bpm()`). Sending every id would
not do: `analyze_tracks_batch(ids, force = false)` skips only tracks that have
both BPM and key, and only 97 have a key. App's analysis code is split so that
`handleAnalyzeAll` (the sidebar's "Analyze All Tracks", unchanged) and Home's
Analyze all share one `analyzeTrackIds(ids)`.

**Quick actions:** Import folder opens Settings with its Library section open;
Analyze all as above; Open Sets opens Sets; New playlist asks for a name, as
the sidebar's Create Playlist does.

**Empty cards** show one line of text, never a blank card:
```

with

```markdown
**Not analyzed** counts tracks with no BPM (223 today), subtitle "no BPM yet".
Its **Analyze all**, and Quick actions' **Analyze all**, analyze exactly the
tracks without a BPM (`get_track_ids_without_bpm()`). Sending every id would
not do: `analyze_tracks_batch(ids, force = false)` skips only tracks that have
both BPM and key, and only 97 have a key. App's analysis code is split so that
`handleAnalyzeAll` (the sidebar's "Analyze All Tracks", unchanged) and Home's
Analyze all share one `analyzeTrackIds(ids)`. With nothing to analyze, Home's
Analyze all says "Everything is analyzed"; while an analysis runs, "Analysis
is already running" (one at a time).

**Quick actions:** Import folder opens Settings with its Library section open;
Analyze all as above; Open Sets opens Sets; New playlist asks for a name, as
the sidebar's Create Playlist does.

**Empty cards** show one line of text, never a blank card:
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
auto-import that follows it). Home raises it too, through an App callback,
after Mark all seen and after a set is opened from Home. Every card reads its
data again when it changes;
the reads are local and cheap. The Spotify and YouTube Music numbers are App
state already and follow on their own.

## Customize

As today — Customize, then drag, resize, × to remove, Save or Cancel — with:

- the catalog grouped under Jump back in, Needs you, Your library, Gig prep,
  each card marked "on Home" or "+ Add";
- **Reset**, which puts back the default layout (Save still needed).

## Data

All local: Home makes no network request and spends no YouTube quota.

| Card | Source |
|---|---|
```

with

```markdown
auto-import that follows it). Home raises it too, through an App callback,
after Mark all seen and after a set is opened from Home. Every card reads its
data again when it changes;
the reads are local and cheap. The Spotify and YouTube Music numbers are App
state already and follow on their own.

As built by plan H1: App passes `playVersion + dataVersion` — `playVersion`
rises after a recorded play (as for the table's Plays column), `dataVersion`
after an analysis finishes, after the folder watcher's rescan and after
tracks are moved to another folder (the rows hold file paths). The
`yt-new-sets` raises and Home's own come with plan H3, whose cards are the
first to read sets. Nothing is read until the stored layout is loaded, and
each card reads only what it shows.

All Tracks opened with a filter right after a playlist or a folder shows
nothing until the library has loaded, rather than that playlist's rows
filtered, or "No tracks match", for a moment.

## Customize

As today — Customize, then drag, resize, × to remove, Save or Cancel — with:

- the catalog grouped under Jump back in, Needs you, Your library, Gig prep,
  each card marked "on Home" or "+ Add";
- **Reset**, which puts back the default layout (Save still needed).

While customizing, the header reads "Customize Home" with Reset, Cancel and
Save; a card's title row is its handle and holds its ×, and its body cannot
be clicked.

## Data

All local: Home makes no network request and spends no YouTube quota.

| Card | Source |
|---|---|
```

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
| BPM & key | new `get_bpm_key_counts()`: tracks per BPM range and per key |
| Not analyzed | new `get_track_ids_without_bpm()` (its length is the count) |
| Your playlists | App's playlists |
| Last playlist | new `get_last_played_playlist()`: the newest `play_history` row with a playlist that still exists, then `getPlaylistTracks` |

`get_recently_played`, `get_recently_added` and `get_library_insights`, used
only by the old widgets, are removed with them if nothing else calls them.

HomeView gains the props the cards act through, passed by App:
`onPlayTrack(track, list, index, playlistId?)`, `onPlayPlaylist(id)`,
`onOpenDj(name)`, `onOpenSet(videoId)`, `onOpenSets()`,
`onOpenAllTracks(filter)`, `onOpenPlaylist(id)`,
`onOpenStreamList(service, listId)`, `onAnalyzeTracks(ids)`,
```

with

```markdown
| BPM & key | new `get_bpm_key_counts()`: tracks per BPM range and per key |
| Not analyzed | new `get_track_ids_without_bpm()` (its length is the count) |
| Your playlists | App's playlists |
| Last playlist | new `get_last_played_playlist()`: the newest `play_history` row with a playlist that still exists, then `getPlaylistTracks` |

`get_recently_played`, `get_recently_added` and `get_library_insights`, used
only by the old widgets, are removed with them (plan H1).

HomeView gains the props the cards act through, passed by App:
`onPlayTrack(track, list, index, playlistId?)`, `onPlayPlaylist(id)`,
`onOpenDj(name)`, `onOpenSet(videoId)`, `onOpenSets()`,
`onOpenAllTracks(filter)`, `onOpenPlaylist(id)`,
`onOpenStreamList(service, listId)`, `onAnalyzeTracks(ids)`,
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-home-cards-design.md
git commit -m "docs(spec): Home H1 as built — the three plans, playlist covers, the data-version number"
```

---

### Task 10: Checks, and the user's hand check

- [ ] **Step 1:** Run:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 581 passed (582)`;
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`;
  - `cd src-tauri && cargo test 2>&1 | grep "test result" | head -1`: `449 passed`;
  - `npm run build`: passes.
- [ ] **Step 2: By hand, in `npm run tauri dev`** (the user):
  - First start: Home shows the eight default cards in the spec's layout (an old stored layout is replaced once; after a restart, Home shows what was saved).
  - Recently played: ▶ on a row and a double click play it; next / previous follow the card; the playing row shows the equalizer and pause under the mouse; after a play, the card updates while Home stays open.
  - Your playlists: a card opens the playlist; ▶ over the cover plays it from its first track; play something from it and check its plays are recorded with the playlist (H2's Last playlist will read it).
  - Needs you: the Spotify / YouTube Music rows open the busiest list; Tracks not analyzed and Not analyzed's Analyze all analyze the tracks without a BPM (the number, not the library); after the analysis the numbers agree and drop; the next gig opens the DJ page, and Back returns to Home. Same for Your DJs play next.
  - Library by genre: a tile opens All Tracks with that filter (right after a playlist too: no wrong rows, no "No tracks match" flash); "8,583 tracks" opens All Tracks unfiltered.
  - Quick actions: Import folder opens Settings with Library open; Open Sets; New playlist asks for a name.
  - Drag a Recently played row onto a sidebar playlist (added, with Undo) and onto a folder (moved, with Undo — try a test track).
  - Customize: remove a card (×), add it back from the catalog, move and resize, Reset, Cancel, Save; restart and the saved layout is there. Every card's empty text (an empty test library, or remove data).
