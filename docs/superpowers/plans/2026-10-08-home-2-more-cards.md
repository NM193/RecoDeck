# Home H2: Five More Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customize's catalog gains the five cards of plan H2, each one Home can show:
- **Recently added** (Jump back in, 2×2): the 20 tracks added last as Home's track rows, the last column when each was added; header link **All Tracks** (All Tracks filtered to Added lately, `{ added: 30 }`).
- **Your DJs** (Jump back in, 4×1): round photos with the name and one line ("next gig Sat, Oct 10", "watching for sets"), the DJ pages opened most recently first, as on Search; a DJ opens its page (Back returns to Home).
- **New likes you don't own** (Needs you, 2×2): a row per Spotify / YouTube Music list with new likes not owned, for a service shown in the sidebar; a row opens the list.
- **BPM & key** (Your library, 2×2): six bars `< 115`, `115–119`, …, `135+` and the count per key, "key known for 97 tracks"; a bar or a key opens All Tracks with that filter, and a bar's count is what All Tracks then shows.
- **Last playlist** (Gig prep, 2×2): the playlist played from last — cover, name, "10 tracks · played Oct 2", ▶ — over its tracks (last column: length); header link **Open**; a row plays from there and records the playlist.

**Architecture:**
- **Rust** (`db/home.rs`, `commands/home.rs`): two read-only queries on existing tables, no migration — `get_last_played_playlist()` (the newest `play_history` row whose playlist still exists, with its name) and `get_bpm_key_counts()` (tracks per half-open BPM range, the edges in one `BPM_EDGES` list, and per key as stored). Recently added and Your DJs reuse Search's `get_recently_added_tracks` and `get_known_djs` with its `dj_recent` order.
- **Pure TypeScript** (tested): `lib/home/cards.ts` gains the five catalog entries; `lib/home/labels.ts` gains `addedLabel`, `lastPlaylistLine`, `newLikeRows`, `bpmBars`, `keyKnownLine`.
- **Components:** `useHomeData` reads the new parts (each only when a card on Home needs it; Last playlist also when a playlist is renamed or its track count changes); `HomeCards` draws the five cards and the two header links; `HomeTrackRows`' `onPlay` passes a playlist id on; `HomeView.css` styles them.
- **App:** unchanged — HomeView already gets every prop these cards act through (`onPlay` with a playlist id, `onPlayPlaylist`, `onOpenPlaylist`, `onOpenDj`, `onOpenAllTracks`, `onOpenStreamList`, the Spotify and YouTube Music new counts).

**Tech Stack:** Rust (rusqlite), React 19, TypeScript, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-home-cards-design.md` (catalog table, Cards in detail, Data) and its mockup `2026-10-04-home-cards-mockup.html` (Recently added and Last playlist are drawn there). Plan H1 (`2026-10-08-home-1-default.md`) built the grid, the stored layout, `HomeTrackRows` and the data-version number these cards use.

**Split:** H1 ✓ (checked by the user 2026-10-08); **H2** this plan; **H3** New sets, Sets you saved lately, Needs you's New sets row. The user checks each by hand before the next.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 8 writes them into the spec):
- **Your DJs** puts the round photo (44px) beside the name and its line, as Your playlists' cards, so the 4×1 card holds a row of DJs (a photo over its name, as on Search, needs more than the card's 74px body); more scroll inside the card. Search's 20 DJs, the DJ pages opened most recently first; a DJ without a photo shows Search's gradient with its initials.
- **New likes** rows look like Needs you's: the number in the service's colour, the list's name, the service on the right with ›. Lists keep the sidebar's order, Spotify's first.
- **BPM & key:** the bars beside the keys, stacked under 360px; in a card wider than 800px the bars keep to 520px. A range with no tracks shows 0 and is disabled. A BPM of 0 is counted nowhere, as All Tracks' filter leaves it out. The keys are 6px buttons ("8A 23"); with no key at all the line says "key known for 0 tracks".
- **Last playlist:** the query answers the playlist's name too, so the card needs nothing from App's playlists; the track count is the rows read. The line: "played at 22:39" today, "played yesterday", else "played Oct 2". The card reads again when a playlist is renamed or its track count changes (App's playlists), besides the data-version number; a reorder inside it shows the next time Home opens or a track is played.
- **Recently added's last column** follows the time-played rule ("09:05" today, "yesterday", "Oct 2"); "—" for a date it cannot read.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `91336f3`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc`, each task's tests and `cargo test` pass at every task's end.
- **Builds and tests:**
  - `cargo test --lib`: 4 new (453); `cargo build` shows no warning.
  - `vitest`: 9 new. The repo counts 591 after it: 590 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes.
- **In WebKit** (H1's test page: the real AppShell, Sidebar collapsed and HomeView inside App's wrappers, IPC mocked with 8 tracks added from 10 minutes to 400 days ago, 6 DJs (two with a photo, three with a next gig, one long name), BPM counts 412 / 1,287 / 3,518 / 2,410 / 612 / 101, 13 keys over 97 tracks, Spotify new likes in Liked Songs (3) and Organic finds (2), YouTube Music's Liked music (1), "Deep House Vibes" played 6 days ago with 6 tracks, the first track playing):
  - At 1280×900, Recently added and Last playlist 2×2 (578×252), Your DJs 4×1, New likes and BPM & key 2×2: nothing reaches past a card's sides; the lists scroll inside their cards (Recently added 312/206, Last playlist 298/206). The same at 1000px wide, where BPM & key keeps its bars beside the keys; at 2×1 every card scrolls inside itself; at 4×2 the bars keep to 520px.
  - Recently added: the playing track with the equalizer, "18:57", "yesterday", "Oct 3"; Last playlist "6 tracks · played Oct 2", its rows' length "6:40".
  - Clicks: ▶ on Recently added's row 2 → `play 2 of 1,…,8 at 1`; a double click on Last playlist's row 1 → `play 3 of 3,…,8 at 0 from playlist 9`; its ▶ → `play playlist 9`; DJs → `dj Adam Port`, `dj Traumer`; New likes → `stream spotify liked`, `stream spotify p2`, `stream youtube-music LM`; bars → `{"bpmMax":115}`, `{"bpmMin":135}`; keys → `{"key":"8A"}`, `{"key":"C#m"}`; "All Tracks" → `{"added":30}`; "Open" → `open playlist 9`. A range with 0 tracks cannot be clicked.
  - Only what the cards on Home show is read: `get_recently_added_tracks`, `get_known_djs`, `get_bpm_key_counts`, `get_last_played_playlist`, `get_playlist_tracks`.
  - Empty library, nothing played: "No tracks yet", "Play a playlist and it shows here", "No DJs yet — open a DJ page or watch a DJ in Sets", "No new likes", "Nothing analyzed yet"; no header links.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/home.rs` | modify | the two queries and their tests |
| `src-tauri/src/commands/home.rs`, `src-tauri/src/lib.rs` | modify | the commands (the wire shape tested), registered |
| `src/types/home.ts`, `src/lib/tauri-api.ts` | modify | the types and the two calls |
| `src/lib/home/cards.ts` (+ test) | modify | the five catalog entries |
| `src/lib/home/labels.ts` (+ test) | modify | the words and numbers of the five cards |
| `src/components/home/useHomeData.ts`, `HomeTrackRows.tsx`, `src/components/views/HomeView.tsx` | modify / rewrite | what the cards read, and when |
| `src/components/home/HomeCards.tsx`, `src/components/views/HomeView.css` | modify | the five cards |
| `docs/superpowers/specs/2026-10-04-home-cards-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `91336f3`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 581 passed (582)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`;
  - `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: `449 passed`.

---

### Task 1: The queries

**Files:** Modify `src-tauri/src/db/home.rs`.

- [ ] **Step 1: The types, the queries and their tests**

In `src-tauri/src/db/home.rs`, replace

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
```

with

```rust
// src-tauri/src/db/home.rs
//! What Home's cards read that Search does not (Home cards spec, Data): the
//! upcoming gigs of the DJs with a page, the tracks without a BPM, the
//! playlist played from last, and the tracks per BPM range and per key. Local
//! data only; the queries Search shares live in `sections.rs`.

use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::Serialize;

/// A gig of a DJ with a page, for Your DJs play next and Needs you.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingGig {
```

In `src-tauri/src/db/home.rs`, replace

```rust
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
```

with

```rust
    pub venue: Option<String>,
    pub city: Option<String>,
    /// ISO code.
    pub country: Option<String>,
}

/// The playlist played from most recently, for Last playlist.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastPlayedPlaylist {
    pub playlist_id: i64,
    pub name: String,
    /// That play's time, unix seconds.
    pub played_at: i64,
}

/// The tracks whose BPM is in a range, for one of BPM & key's bars. The
/// range is half-open, as the track table's filter is: `min <= bpm < max`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmRangeCount {
    /// None: no lower bound.
    pub min: Option<i64>,
    /// Exclusive; None: no upper bound.
    pub max: Option<i64>,
    pub count: i64,
}

/// The tracks with a key, as stored ("8A").
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCount {
    pub key: String,
    pub count: i64,
}

/// BPM & key: tracks per BPM range (every range, lowest first) and per key
/// (biggest first). Tracks without a BPM or a key are not counted.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmKeyCounts {
    pub bpm: Vec<BpmRangeCount>,
    pub keys: Vec<KeyCount>,
}

/// Where BPM & key's bars split: `< 115`, `115–119`, …, `130–134`, `135+`.
const BPM_EDGES: [i64; 5] = [115, 120, 125, 130, 135];

impl Database {
    /// The gigs on or after `today` ("2026-10-04", the user's local day, as
    /// the DJ page's `splitGigs` compares it) of every DJ with a page,
    /// soonest first; on one day, by the DJ's name.
    pub fn get_upcoming_gigs(&self, today: &str, limit: i64) -> Result<Vec<UpcomingGig>> {
        let mut stmt = self.conn.prepare(
```

In `src-tauri/src/db/home.rs`, replace

```rust
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
```

with

```rust
             WHERE a.bpm IS NULL
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect()
    }

    /// The newest play made from a playlist that still exists; None when
    /// there is none.
    pub fn get_last_played_playlist(&self) -> Result<Option<LastPlayedPlaylist>> {
        self.conn
            .query_row(
                "SELECT h.playlist_id, p.name, h.played_at FROM play_history h
                 JOIN playlists p ON p.id = h.playlist_id
                 ORDER BY h.played_at DESC, h.id DESC
                 LIMIT 1",
                [],
                |row| {
                    Ok(LastPlayedPlaylist {
                        playlist_id: row.get(0)?,
                        name: row.get(1)?,
                        played_at: row.get(2)?,
                    })
                },
            )
            .optional()
    }

    /// The tracks per BPM range and per key. A bar's count is what All
    /// Tracks shows with that range as its filter, which leaves out a BPM of
    /// 0 as it does.
    pub fn get_bpm_key_counts(&self) -> Result<BpmKeyCounts> {
        let mut bpm: Vec<BpmRangeCount> = (0..=BPM_EDGES.len())
            .map(|i| BpmRangeCount {
                min: i.checked_sub(1).map(|lower| BPM_EDGES[lower]),
                max: BPM_EDGES.get(i).copied(),
                count: 0,
            })
            .collect();
        let mut stmt = self.conn.prepare(
            "SELECT a.bpm FROM track_analysis a
             JOIN tracks t ON t.id = a.track_id
             WHERE a.bpm > 0",
        )?;
        for value in stmt.query_map([], |row| row.get::<_, f64>(0))? {
            let value = value?;
            let range = BPM_EDGES.iter().take_while(|&&edge| value >= edge as f64).count();
            bpm[range].count += 1;
        }

        let mut stmt = self.conn.prepare(
            "SELECT a.musical_key, COUNT(*) FROM track_analysis a
             JOIN tracks t ON t.id = a.track_id
             WHERE a.musical_key IS NOT NULL AND a.musical_key <> ''
             GROUP BY a.musical_key
             ORDER BY COUNT(*) DESC, a.musical_key",
        )?;
        let keys = stmt
            .query_map([], |row| {
                Ok(KeyCount {
                    key: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(BpmKeyCounts { bpm, keys })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
```

In `src-tauri/src/db/home.rs`, replace

```rust
        db.save_bpm_analysis(bpm, 126.0, 0.9).unwrap();
        db.save_bpm_analysis(both, 124.0, 0.9).unwrap();
        db.save_key_analysis(both, "5A", 0.8).unwrap();

        assert_eq!(db.get_track_ids_without_bpm().unwrap(), vec![none, key_only]);
    }
}
```

with

```rust
        db.save_bpm_analysis(bpm, 126.0, 0.9).unwrap();
        db.save_bpm_analysis(both, 124.0, 0.9).unwrap();
        db.save_key_analysis(both, "5A", 0.8).unwrap();

        assert_eq!(db.get_track_ids_without_bpm().unwrap(), vec![none, key_only]);
    }

    #[test]
    fn the_last_played_playlist_is_the_newest_play_from_a_playlist_that_still_exists() {
        let db = db();
        let song = track(&db, "song");
        assert_eq!(db.get_last_played_playlist().unwrap(), None);

        db.conn
            .execute_batch(&format!(
                "INSERT INTO playlists (id, name) VALUES (1, 'Warm up'), (2, 'Peak');
                 INSERT INTO play_history (track_id, playlist_id, played_at) VALUES
                     ({song}, 1, 100),
                     ({song}, 2, 200),
                     ({song}, 99, 300),
                     ({song}, NULL, 400);"
            ))
            .unwrap();

        // 99 was deleted and the newest play came from no playlist.
        assert_eq!(
            db.get_last_played_playlist().unwrap(),
            Some(LastPlayedPlaylist {
                playlist_id: 2,
                name: "Peak".into(),
                played_at: 200
            })
        );
    }

    #[test]
    fn bpm_ranges_are_half_open_and_tracks_without_a_bpm_are_left_out() {
        let db = db();
        for (title, bpm) in [
            ("a", 114.9),
            ("b", 115.0),
            ("c", 119.9),
            ("d", 120.0),
            ("e", 127.5),
            ("f", 134.99),
            ("g", 135.0),
            ("h", 174.0),
            ("zero", 0.0),
        ] {
            let id = track(&db, title);
            db.save_bpm_analysis(id, bpm, 0.9).unwrap();
        }
        let key_only = track(&db, "key only");
        db.save_key_analysis(key_only, "8A", 0.8).unwrap();
        track(&db, "nothing");

        let counts = db.get_bpm_key_counts().unwrap();

        let bars: Vec<_> = counts.bpm.iter().map(|r| (r.min, r.max, r.count)).collect();
        assert_eq!(
            bars,
            vec![
                (None, Some(115), 1),
                (Some(115), Some(120), 2),
                (Some(120), Some(125), 1),
                (Some(125), Some(130), 1),
                (Some(130), Some(135), 1),
                (Some(135), None, 2),
            ]
        );
    }

    #[test]
    fn key_counts_are_per_key_as_stored_biggest_first() {
        let db = db();
        for (title, key) in [("a", "8A"), ("b", "5A"), ("c", "8A"), ("d", "11B"), ("e", "5A"), ("f", "8A"), ("g", "")] {
            let id = track(&db, title);
            db.save_key_analysis(id, key, 0.8).unwrap();
        }
        track(&db, "no key");

        let keys: Vec<_> = db
            .get_bpm_key_counts()
            .unwrap()
            .keys
            .into_iter()
            .map(|k| (k.key, k.count))
            .collect();
        assert_eq!(keys, vec![("8A".to_string(), 3), ("5A".to_string(), 2), ("11B".to_string(), 1)]);
    }
}
```

- [ ] **Step 2:** `cd src-tauri && cargo test --lib db::home`: PASS, 5 (the spec's BPM edges: 114.9 → `< 115`, 115 and 119.9 → `115–119`, 135 → `135+`, no BPM and a BPM of 0 left out; keys biggest first; a deleted playlist and a play from no playlist skipped). Commit:

```bash
git add src-tauri/src/db/home.rs
git commit -m "feat(home): queries for the last played playlist and the tracks per BPM range and key"
```

---

### Task 2: The commands

**Files:** Modify `src-tauri/src/commands/home.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: The commands, with the wire shape tested**

In `src-tauri/src/commands/home.rs`, replace

```rust
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
```

with

```rust
//! sections (`commands/sections.rs`). Local data only.

use tauri::State;

use crate::commands::library::AppState;
use crate::commands::sections::with_db;
use crate::db::home::{BpmKeyCounts, LastPlayedPlaylist, UpcomingGig};
use crate::error::AppError;

/// The gigs on or after `today` (the user's local day, "2026-10-04") of every
/// DJ with a page, soonest first.
#[tauri::command]
pub fn get_upcoming_gigs(today: String, limit: i64, state: State<AppState>) -> Result<Vec<UpcomingGig>, AppError> {
```

In `src-tauri/src/commands/home.rs`, replace

```rust
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
```

with

```rust
/// Every track with no BPM: Not analyzed's number, and what Analyze all analyzes.
#[tauri::command]
pub fn get_track_ids_without_bpm(state: State<AppState>) -> Result<Vec<i64>, AppError> {
    with_db(&state, "tracks without a BPM", |db| db.get_track_ids_without_bpm())
}

/// The playlist played from most recently, while it exists: Last playlist.
#[tauri::command]
pub fn get_last_played_playlist(state: State<AppState>) -> Result<Option<LastPlayedPlaylist>, AppError> {
    with_db(&state, "the last played playlist", |db| db.get_last_played_playlist())
}

/// The tracks per BPM range and per key: BPM & key.
#[tauri::command]
pub fn get_bpm_key_counts(state: State<AppState>) -> Result<BpmKeyCounts, AppError> {
    with_db(&state, "BPM and key counts", |db| db.get_bpm_key_counts())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
```

In `src-tauri/src/commands/home.rs`, replace

```rust
                "venue": "Hï Ibiza",
                "city": "Ibiza",
                "country": null
            })
        );
    }
}
```

with

```rust
                "venue": "Hï Ibiza",
                "city": "Ibiza",
                "country": null
            })
        );
    }

    #[test]
    fn bpm_and_key_counts_are_camel_case() {
        let counts = BpmKeyCounts {
            bpm: vec![
                crate::db::home::BpmRangeCount { min: None, max: Some(115), count: 3 },
                crate::db::home::BpmRangeCount { min: Some(135), max: None, count: 1 },
            ],
            keys: vec![crate::db::home::KeyCount { key: "8A".into(), count: 2 }],
        };
        let last = LastPlayedPlaylist {
            playlist_id: 4,
            name: "Peak".into(),
            played_at: 1_759_000_000,
        };

        assert_eq!(
            serde_json::to_value(counts).unwrap(),
            json!({
                "bpm": [{ "min": null, "max": 115, "count": 3 }, { "min": 135, "max": null, "count": 1 }],
                "keys": [{ "key": "8A", "count": 2 }]
            })
        );
        assert_eq!(
            serde_json::to_value(last).unwrap(),
            json!({ "playlistId": 4, "name": "Peak", "playedAt": 1_759_000_000 })
        );
    }
}
```

- [ ] **Step 2: Register them**

In `src-tauri/src/lib.rs`, replace

```rust
            commands::sections::get_recently_added_tracks,
            commands::sections::get_known_djs,
            commands::sections::get_library_groups,
            // Home's cards (Search's sections above are shared)
            commands::home::get_upcoming_gigs,
            commands::home::get_track_ids_without_bpm,
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let tauri::WindowEvent::Destroyed = event {
                // Shut down companion server so the port is freed
                let state = window.app_handle().state::<commands::server::CompanionState>();
```

with

```rust
            commands::sections::get_recently_added_tracks,
            commands::sections::get_known_djs,
            commands::sections::get_library_groups,
            // Home's cards (Search's sections above are shared)
            commands::home::get_upcoming_gigs,
            commands::home::get_track_ids_without_bpm,
            commands::home::get_last_played_playlist,
            commands::home::get_bpm_key_counts,
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let tauri::WindowEvent::Destroyed = event {
                // Shut down companion server so the port is freed
                let state = window.app_handle().state::<commands::server::CompanionState>();
```

- [ ] **Step 3:** `cd src-tauri && cargo test --lib`: PASS, 453; `cargo build` shows no warning. Commit:

```bash
git add src-tauri/src/commands/home.rs src-tauri/src/lib.rs
git commit -m "feat(home): commands for Last playlist and BPM & key"
```

---

### Task 3: The types and the calls

**Files:** Modify `src/types/home.ts`, `src/lib/tauri-api.ts`.

- [ ] **Step 1:**

In `src/types/home.ts`, replace

```ts
  date: string
  venue: string | null
  city: string | null
  /** ISO code. */
  country: string | null
}
```

with

```ts
  date: string
  venue: string | null
  city: string | null
  /** ISO code. */
  country: string | null
}

/** The playlist played from most recently (`get_last_played_playlist`), for Last playlist. */
export interface LastPlayedPlaylist {
  playlistId: number
  name: string
  /** That play's time, unix seconds. */
  playedAt: number
}

/** The tracks whose BPM is in `min <= bpm < max`; a missing bound is open. */
export interface BpmRangeCount {
  min: number | null
  max: number | null
  count: number
}

/** BPM & key (`get_bpm_key_counts`): every BPM range, lowest first, and each key, biggest first. */
export interface BpmKeyCounts {
  bpm: BpmRangeCount[]
  keys: Array<{ key: string; count: number }>
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
import type { UpcomingGig } from '../types/home'
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
import type { BpmKeyCounts, LastPlayedPlaylist, UpcomingGig } from '../types/home'
import type {
  ArtistCandidate,
  DjCandidates,
  DjPage,
  DjRefresh,
  DjSetTrack,
```

In `src/lib/tauri-api.ts`, replace

```ts

  /** Every track with no BPM: Home's Not analyzed number, and what its Analyze all analyzes. */
  async getTrackIdsWithoutBpm(): Promise<number[]> {
    return await invoke('get_track_ids_without_bpm')
  },

  async saveDashboardLayout(layoutJson: string): Promise<void> {
    return await invoke('save_dashboard_layout', { layoutJson })
  },

  async getDashboardLayout(): Promise<string | null> {
    return await invoke('get_dashboard_layout')
```

with

```ts

  /** Every track with no BPM: Home's Not analyzed number, and what its Analyze all analyzes. */
  async getTrackIdsWithoutBpm(): Promise<number[]> {
    return await invoke('get_track_ids_without_bpm')
  },

  /** The playlist played from most recently, while it exists; null when none (Home's Last playlist). */
  async getLastPlayedPlaylist(): Promise<LastPlayedPlaylist | null> {
    return await invoke('get_last_played_playlist')
  },

  /** The tracks per BPM range and per key (Home's BPM & key). */
  async getBpmKeyCounts(): Promise<BpmKeyCounts> {
    return await invoke('get_bpm_key_counts')
  },

  async saveDashboardLayout(layoutJson: string): Promise<void> {
    return await invoke('save_dashboard_layout', { layoutJson })
  },

  async getDashboardLayout(): Promise<string | null> {
    return await invoke('get_dashboard_layout')
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/types/home.ts src/lib/tauri-api.ts
git commit -m "feat(home): Last playlist's and BPM & key's types and calls"
```

---

### Task 4: The catalog

**Files:** Modify `src/lib/home/cards.ts`, `src/lib/home/cards.test.ts`.

- [ ] **Step 1: The failing test**

In `src/lib/home/cards.test.ts`, replace

```ts

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
```

with

```ts

describe('the catalog', () => {
  it('puts every card under one of the four groups', () => {
    for (const card of HOME_CARDS) expect(HOME_GROUPS).toContain(card.group)
    expect(new Set(HOME_CARDS.map((card) => card.id)).size).toBe(HOME_CARDS.length)
  })

  it('has plan H2’s five cards at the spec’s sizes and limits', () => {
    const sizes = Object.fromEntries(
      HOME_CARDS.map(({ id, group, w, h, minW, minH, maxW, maxH }) => [id, [group, w, h, minW, minH, maxW, maxH]]),
    )
    expect(sizes['recently-added']).toEqual(['Jump back in', 2, 2, 2, 1, 4, 3])
    expect(sizes['your-djs']).toEqual(['Jump back in', 4, 1, 2, 1, 4, 2])
    expect(sizes['new-likes']).toEqual(['Needs you', 2, 2, 2, 1, 4, 3])
    expect(sizes['bpm-key']).toEqual(['Your library', 2, 2, 2, 1, 4, 2])
    expect(sizes['last-playlist']).toEqual(['Gig prep', 2, 2, 2, 1, 4, 3])
  })
})

describe('defaultLayout', () => {
  it('is the spec’s eight cards, with their limits from the catalog', () => {
    const layout = defaultLayout()
    expect(places(layout)).toEqual([
```

Run `npx vitest run src/lib/home/cards.test.ts`: FAIL — `sizes['recently-added']` is undefined.

- [ ] **Step 2: The five cards, in the spec's table order**

In `src/lib/home/cards.ts`, replace

```ts
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
```

with

```ts
  maxH: number
}

/** The catalog. Ids that kept their meaning from the old Home kept their id. */
export const HOME_CARDS: readonly HomeCardDef[] = [
  { id: 'recently-played', title: 'Recently played', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'recently-added', title: 'Recently added', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'your-djs', title: 'Your DJs', group: 'Jump back in', w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'needs-you', title: 'Needs you', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'new-likes', title: "New likes you don't own", group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'upcoming-gigs', title: 'Your DJs play next', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'library-stats', title: 'Library stats', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 4, maxH: 1 },
  { id: 'library-by-genre', title: 'Library by genre', group: 'Your library', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'bpm-key', title: 'BPM & key', group: 'Your library', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'not-analyzed', title: 'Not analyzed', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 2, maxH: 1 },
  { id: 'playlists', title: 'Your playlists', group: 'Gig prep', w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'quick-actions', title: 'Quick actions', group: 'Gig prep', w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 1 },
  { id: 'last-playlist', title: 'Last playlist', group: 'Gig prep', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
]

export function homeCard(id: string): HomeCardDef | undefined {
  return HOME_CARDS.find((card) => card.id === id)
}
```

- [ ] **Step 3:** `npx vitest run src/lib/home/cards.test.ts`: PASS, 11. (Until Task 7, a new card added in Customize shows an empty body.) Commit:

```bash
git add src/lib/home/cards.ts src/lib/home/cards.test.ts
git commit -m "feat(home): Recently added, Your DJs, New likes, BPM & key and Last playlist in the catalog"
```

---

### Task 5: The labels

**Files:** Modify `src/lib/home/labels.ts`, `src/lib/home/labels.test.ts`.

- [ ] **Step 1: The failing tests**

In `src/lib/home/labels.test.ts`, replace

```ts
import { describe, expect, it } from 'vitest'
import { bpmLabel, busiestList, gigDay, gigLine, gigWhere, libraryStats, needsYouRows, playedLabel, type StreamNews } from './labels'
import type { UpcomingGig } from '../../types/home'

// Local times, so the tests read the same in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000

describe('bpmLabel', () => {
  it('shows whole beats, or a dash without a BPM', () => {
```

with

```ts
import { describe, expect, it } from 'vitest'
import {
  addedLabel,
  bpmBars,
  bpmLabel,
  busiestList,
  gigDay,
  gigLine,
  gigWhere,
  keyKnownLine,
  lastPlaylistLine,
  libraryStats,
  needsYouRows,
  newLikeRows,
  playedLabel,
  type StreamNews,
} from './labels'
import { matchesTrackFilter } from '../trackTable/filter'
import type { BpmRangeCount, UpcomingGig } from '../../types/home'
import type { Track } from '../../types/track'

// Local times, so the tests read the same in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000

describe('bpmLabel', () => {
  it('shows whole beats, or a dash without a BPM', () => {
```

In `src/lib/home/labels.test.ts`, replace

```ts
  })

  it('leaves the line out until the groups are read', () => {
    expect(libraryStats(4, { ...counts, addedLately: null, neverPlayed: null }).line).toBe('')
  })
})
```

with

```ts
  })

  it('leaves the line out until the groups are read', () => {
    expect(libraryStats(4, { ...counts, addedLately: null, neverPlayed: null }).line).toBe('')
  })
})

describe('addedLabel', () => {
  // SQLite's UTC text for a local time.
  const stored = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
  const now = new Date(2026, 9, 8, 23, 30)

  it('says when a track was added as the played time does', () => {
    expect(addedLabel(stored(new Date(2026, 9, 8, 9, 5)), now)).toBe('09:05')
    expect(addedLabel(stored(new Date(2026, 9, 7, 23, 58)), now)).toBe('yesterday')
    expect(addedLabel(stored(new Date(2026, 9, 2, 9)), now)).toBe('Oct 2')
  })

  it('shows a dash for a date it cannot read', () => {
    expect(addedLabel(undefined, now)).toBe('—')
    expect(addedLabel('soon', now)).toBe('—')
  })
})

describe('lastPlaylistLine', () => {
  const now = new Date(2026, 9, 8, 23, 30)

  it('counts the tracks and says when the playlist was played', () => {
    expect(lastPlaylistLine(10, at(2026, 10, 2, 9), now)).toBe('10 tracks · played Oct 2')
    expect(lastPlaylistLine(1, at(2026, 10, 7, 20), now)).toBe('1 track · played yesterday')
    expect(lastPlaylistLine(1581, at(2026, 10, 8, 22, 39), now)).toBe('1,581 tracks · played at 22:39')
  })
})

describe('newLikeRows', () => {
  it('lists each list with new likes, Spotify first, in the sidebar order', () => {
    expect(newLikeRows(news(5, { p2: 3, liked: 2 }), news(1, { p1: 1 }))).toEqual([
      { service: 'spotify', listId: 'liked', name: 'Liked Songs', number: '2' },
      { service: 'spotify', listId: 'p2', name: 'Peak', number: '3' },
      { service: 'youtube-music', listId: 'p1', name: 'Warm-up', number: '1' },
    ])
  })

  it('leaves out lists with none, and a service not shown in the sidebar', () => {
    expect(newLikeRows(null, news(0, {}))).toEqual([])
    expect(newLikeRows(news(2, { p1: 2 }), null)).toEqual([
      { service: 'spotify', listId: 'p1', name: 'Warm-up', number: '2' },
    ])
  })
})

describe('bpmBars', () => {
  const ranges: BpmRangeCount[] = [
    { min: null, max: 115, count: 12 },
    { min: 115, max: 120, count: 40 },
    { min: 120, max: 125, count: 0 },
    { min: 135, max: null, count: 3 },
  ]

  it('labels each half-open range and sets its filter', () => {
    expect(bpmBars(ranges).map(({ label, count, filter }) => [label, count, filter])).toEqual([
      ['< 115', 12, { bpmMax: 115 }],
      ['115–119', 40, { bpmMin: 115, bpmMax: 120 }],
      ['120–124', 0, { bpmMin: 120, bpmMax: 125 }],
      ['135+', 3, { bpmMin: 135 }],
    ])
  })

  it('opens All Tracks on the tracks it counts, at the edges', () => {
    const [below, from115, , from135] = bpmBars(ranges)
    const shows = (bpm: number) =>
      [below, from115, from135]
        .filter((bar) => matchesTrackFilter({ bpm } as Track, bar.filter, { playedIds: null }))
        .map((bar) => bar.label)
    expect(shows(114.9)).toEqual(['< 115'])
    expect(shows(115)).toEqual(['115–119'])
    expect(shows(119.9)).toEqual(['115–119'])
    expect(shows(135)).toEqual(['135+'])
  })
})

describe('keyKnownLine', () => {
  it('counts the tracks with a key', () => {
    expect(keyKnownLine([{ count: 60 }, { count: 37 }])).toBe('key known for 97 tracks')
    expect(keyKnownLine([{ count: 1 }])).toBe('key known for 1 track')
  })
})
```

Run `npx vitest run src/lib/home/labels.test.ts`: FAIL — `addedLabel` is not exported.

- [ ] **Step 2: The labels**

In `src/lib/home/labels.ts`, replace

```ts
// src/lib/home/labels.ts
// The words and numbers on Home's cards (Home cards spec, Cards in detail).
import { ALL_LISTS } from '../../types/spotify'
import type { UpcomingGig } from '../../types/home'

const DAY_MS = 24 * 60 * 60 * 1000

/** A track row's BPM in whole beats ("125"), or "—". */
export function bpmLabel(bpm: number | null | undefined): string {
  return bpm ? String(Math.round(bpm)) : '—'
```

with

```ts
// src/lib/home/labels.ts
// The words and numbers on Home's cards (Home cards spec, Cards in detail).
import { ALL_LISTS } from '../../types/spotify'
import { parseUtcDate, type TrackFilter } from '../trackTable/filter'
import type { BpmRangeCount, UpcomingGig } from '../../types/home'

const DAY_MS = 24 * 60 * 60 * 1000

/** A track row's BPM in whole beats ("125"), or "—". */
export function bpmLabel(bpm: number | null | undefined): string {
  return bpm ? String(Math.round(bpm)) : '—'
```

In `src/lib/home/labels.ts`, replace

```ts
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
```

with

```ts
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const dayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Local calendar days from `then` to `now`, 0 on the same day. Rounded: a day across a clock change is 23 or 25 hours. */
const daysBetween = (then: Date, now: Date) => Math.round((dayOf(now) - dayOf(then)) / DAY_MS)

/** "Oct 2", with the year when it is not `now`'s. */
function shortDate(date: Date, now: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
```

In `src/lib/home/labels.ts`, replace

```ts
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
```

with

```ts
/**
 * When a track was played (`played_at`, unix seconds, UTC): "22:39" on the
 * local day of `now`, "yesterday", else "Oct 2".
 */
export function playedLabel(playedAt: number, now: Date): string {
  const then = new Date(playedAt * 1000)
  const days = daysBetween(then, now)
  if (days <= 0) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(then.getHours())}:${pad(then.getMinutes())}`
  }
  if (days === 1) return 'yesterday'
  return shortDate(then, now)
}

/**
 * When a track was added (`date_added`, SQLite's UTC "2026-10-03 21:14:05"),
 * as `playedLabel` says when it was played; "—" when it cannot be read.
 */
export function addedLabel(dateAdded: string | undefined, now: Date): string {
  const time = parseUtcDate(dateAdded)
  return time === null ? '—' : playedLabel(time / 1000, now)
}

/** Last playlist's line: "10 tracks · played Oct 2", "played at 22:39" today, "played yesterday". */
export function lastPlaylistLine(tracks: number, playedAt: number, now: Date): string {
  const then = new Date(playedAt * 1000)
  const days = daysBetween(then, now)
  const played =
    days <= 0
      ? `played at ${playedLabel(playedAt, now)}`
      : days === 1
        ? 'played yesterday'
        : `played ${shortDate(then, now)}`
  return `${count(tracks)} ${noun(tracks, 'track')} · ${played}`
}

/** A service's new likes not owned, as the sidebar counts them. */
export interface StreamNews {
  total: number
  byList: ReadonlyMap<string, number>
  lists: ReadonlyArray<{ id: string; name: string; position: number }>
}
```

In `src/lib/home/labels.ts`, replace

```ts
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
```

with

```ts
      best = { ...list, count: n }
    }
  }
  return best && { id: best.id, name: best.name }
}

export interface NewLikeRow {
  service: 'spotify' | 'youtube-music'
  listId: string
  name: string
  number: string
}

/**
 * New likes you don't own: a row per list with new likes, Spotify's then
 * YouTube Music's, each in the sidebar's order. A service is null when it is
 * not shown in the sidebar.
 */
export function newLikeRows(spotify: StreamNews | null, youtubeMusic: StreamNews | null): NewLikeRow[] {
  const rows = (service: NewLikeRow['service'], news: StreamNews | null): NewLikeRow[] =>
    (news?.lists ?? []).flatMap((list) => {
      const n = news?.byList.get(list.id) ?? 0
      return n > 0 ? [{ service, listId: list.id, name: list.name, number: count(n) }] : []
    })
  return [...rows('spotify', spotify), ...rows('youtube-music', youtubeMusic)]
}

export type NeedsYouRow =
  | { kind: 'spotify' | 'youtube-music'; number: string; text: string; place: string; listId: string }
  | { kind: 'not-analyzed'; number: string; text: string; place: string }
  | { kind: 'next-gig'; number: string; text: string; place: string; djName: string }

function streamRow(kind: 'spotify' | 'youtube-music', news: StreamNews | null): NeedsYouRow[] {
```

In `src/lib/home/labels.ts`, replace

```ts
      figure(counts.playlists, 'playlist'),
      figure(counts.folders, 'folder'),
    ],
    line: [...added, ...never].join(' · '),
  }
}
```

with

```ts
      figure(counts.playlists, 'playlist'),
      figure(counts.folders, 'folder'),
    ],
    line: [...added, ...never].join(' · '),
  }
}

export interface BpmBar {
  key: string
  /** "< 115", "115–119", "135+". */
  label: string
  count: number
  /** All Tracks with this filter shows the bar's tracks. */
  filter: TrackFilter
}

/** BPM & key's bars, one per range, each with the All Tracks filter whose rows it counts. */
export function bpmBars(ranges: readonly BpmRangeCount[]): BpmBar[] {
  return ranges.map(({ min, max, count: tracks }) => {
    const filter: TrackFilter = {}
    if (min !== null) filter.bpmMin = min
    if (max !== null) filter.bpmMax = max
    const label =
      min !== null && max !== null
        ? `${min}–${max - 1}`
        : min !== null
          ? `${min}+`
          : max !== null
            ? `< ${max}`
            : 'Any BPM'
    return { key: `${min ?? ''}-${max ?? ''}`, label, count: tracks, filter }
  })
}

/** Under the key counts: "key known for 97 tracks". */
export function keyKnownLine(keys: ReadonlyArray<{ count: number }>): string {
  const known = keys.reduce((sum, key) => sum + key.count, 0)
  return `key known for ${count(known)} ${noun(known, 'track')}`
}
```

- [ ] **Step 3:** `npx vitest run src/lib/home/labels.test.ts`: PASS, 20 (a bar's filter, checked with the table's own `matchesTrackFilter`, shows exactly the tracks it counts at the edges). Commit:

```bash
git add src/lib/home/labels.ts src/lib/home/labels.test.ts
git commit -m "feat(home): the added time, Last playlist's line, new likes rows, BPM bars and the key line"
```

---

### Task 6: What the cards read

**Files:** Rewrite `src/components/home/useHomeData.ts`; modify `src/components/home/HomeTrackRows.tsx`, `src/components/views/HomeView.tsx`.

- [ ] **Step 1: The new parts** — Recently added, Your DJs (Search's order and 20), BPM & key, Last playlist with its tracks; Last playlist reads again when `playlistsKey` changes.

Replace the whole of `src/components/home/useHomeData.ts` with:

```ts
// src/components/home/useHomeData.ts
// What the cards on Home read (Home cards spec, Data), all local: when Home
// opens, when a card that needs something new is added, and each time App's
// data-version number changes (a play, an analysis, a rescan, a move). Last
// playlist reads again when a playlist changes too. Each part is null until
// it is read, so a card shows nothing rather than its empty text for a
// moment; what was read stays while it is read again.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import { orderYourDjs } from '../../lib/dj/recent'
import { loadDjRecent } from '../../lib/search/storage'
import { YOUR_DJS_MAX } from '../search/useSectionsData'
import type { BpmKeyCounts, UpcomingGig } from '../../types/home'
import type { LibraryGroups, RecentlyPlayedTrack, YourDj } from '../../types/sections'
import type { Track } from '../../types/track'

/** The most rows a list card reads. */
export const RECENTLY_PLAYED_ROWS = 20
export const RECENTLY_ADDED_ROWS = 20
export const UPCOMING_GIGS_ROWS = 20

/** The playlist played from last, and every track in it. */
export interface LastPlaylist {
  id: number
  name: string
  /** Unix seconds. */
  playedAt: number
  tracks: Track[]
}

export interface HomeData {
  recentlyPlayed: RecentlyPlayedTrack[] | null
  recentlyAdded: Track[] | null
  /** The DJs opened most recently first, as on Search. */
  djs: YourDj[] | null
  gigs: UpcomingGig[] | null
  groups: LibraryGroups | null
  bpmKey: BpmKeyCounts | null
  /** The tracks with no BPM. */
  withoutBpm: number[] | null
  /** 'none' when no play came from a playlist that still exists. */
  lastPlaylist: LastPlaylist | 'none' | null
  /** The local day the gigs were read for ("2026-10-08"). */
  today: string
}

type Part =
  | 'recentlyPlayed'
  | 'recentlyAdded'
  | 'djs'
  | 'gigs'
  | 'groups'
  | 'bpmKey'
  | 'withoutBpm'
  | 'lastPlaylist'

/** What each card reads. New likes reads nothing: App passes its numbers. */
const PARTS: Record<string, Part[]> = {
  'recently-played': ['recentlyPlayed'],
  'recently-added': ['recentlyAdded'],
  'your-djs': ['djs'],
  'needs-you': ['gigs', 'withoutBpm'],
  'upcoming-gigs': ['gigs'],
  'library-stats': ['groups'],
  'library-by-genre': ['groups'],
  'bpm-key': ['bpmKey'],
  'not-analyzed': ['withoutBpm'],
  'quick-actions': ['withoutBpm'],
  'last-playlist': ['lastPlaylist'],
}

const NO_GROUPS: LibraryGroups = { genres: [], addedRecently: 0, neverPlayed: 0 }
const NO_COUNTS: BpmKeyCounts = { bpm: [], keys: [] }

async function readLastPlaylist(): Promise<LastPlaylist | 'none'> {
  const last = await tauriApi.getLastPlayedPlaylist()
  if (!last) return 'none'
  return {
    id: last.playlistId,
    name: last.name,
    playedAt: last.playedAt,
    tracks: await tauriApi.getPlaylistTracks(last.playlistId),
  }
}

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

/**
 * `playlistsKey` changes when a playlist is renamed or its tracks change
 * (App's playlists); only Last playlist reads again for it.
 */
export function useHomeData(cardIds: readonly string[], version: number, playlistsKey: string): HomeData {
  const [data, setData] = useState<HomeData>({
    recentlyPlayed: null,
    recentlyAdded: null,
    djs: null,
    gigs: null,
    groups: null,
    bpmKey: null,
    withoutBpm: null,
    lastPlaylist: null,
    today: localDay(new Date()),
  })
  // A string, so moving or resizing a card reads nothing again.
  const partsKey = [...new Set(cardIds.flatMap((id) => PARTS[id] ?? []))].sort().join(',')
  const lastPlaylistKey = partsKey.split(',').includes('lastPlaylist') ? playlistsKey : ''

  useEffect(() => {
    let current = true
    const wanted = new Set(partsKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(wanted.has('recentlyPlayed'), [], () => tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_ROWS)),
      read(wanted.has('recentlyAdded'), [], () => tauriApi.getRecentlyAddedTracks(RECENTLY_ADDED_ROWS)),
      read(wanted.has('djs'), [], async () =>
        orderYourDjs(await tauriApi.getKnownDjs(today), loadDjRecent()).slice(0, YOUR_DJS_MAX),
      ),
      read(wanted.has('gigs'), [], () => tauriApi.getUpcomingGigs(today, UPCOMING_GIGS_ROWS)),
      read(wanted.has('groups'), NO_GROUPS, () => tauriApi.getLibraryGroups()),
      read(wanted.has('bpmKey'), NO_COUNTS, () => tauriApi.getBpmKeyCounts()),
      read(wanted.has('withoutBpm'), [], () => tauriApi.getTrackIdsWithoutBpm()),
      read<LastPlaylist | 'none'>(wanted.has('lastPlaylist'), 'none', readLastPlaylist),
    ]).then(([recentlyPlayed, recentlyAdded, djs, gigs, groups, bpmKey, withoutBpm, lastPlaylist]) => {
      if (current) {
        setData({ recentlyPlayed, recentlyAdded, djs, gigs, groups, bpmKey, withoutBpm, lastPlaylist, today })
      }
    })
    return () => {
      current = false
    }
  }, [partsKey, version, lastPlaylistKey])

  return data
}
```

- [ ] **Step 2: HomeView passes the playlists' key**

In `src/components/views/HomeView.tsx`, replace

```tsx

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
```

with

```tsx

  // Nothing is read until the stored layout says which cards are on Home.
  const shown = useMemo(
    () => (isLoaded ? layout.map((item) => item.i) : []),
    [isLoaded, layout],
  )
  // Last playlist reads again when a playlist is renamed or its tracks change.
  const playlistsKey = useMemo(
    () => playlists.map((p) => `${p.id}:${p.track_count}:${p.name}`).join('\n'),
    [playlists],
  )
  const data = useHomeData(shown, dataVersion, playlistsKey)
  const facts: HomeFacts = {
    playlists,
    totalTrackCount,
    folderCount,
    spotify,
    youtubeMusic,
```

- [ ] **Step 3: A track row's play can name a playlist** (App's `handlePlayTrack` already takes it)

In `src/components/home/HomeTrackRows.tsx`, replace

```tsx
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
```

with

```tsx
import type { DropTarget } from '../../lib/drag/dropTargets'
import { bpmLabel } from '../../lib/home/labels'
import { usePlayerStore } from '../../store/playerStore'
import type { LibraryFolder, Track } from '../../types/track'

export interface TrackRowActions {
  /** `playlistId`: the playlist the play is recorded under. */
  onPlay: (
    track: Track,
    list: Track[],
    index: number,
    playlistId?: number,
  ) => void
  /** A row dropped on a playlist in the sidebar. */
  onAddToPlaylist: (tracks: Track[], playlistId: number) => void
  /** A row dropped on a library folder in the sidebar. */
  onMoveToFolder: (tracks: Track[], folder: LibraryFolder) => void
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/home/useHomeData.ts src/components/home/HomeTrackRows.tsx src/components/views/HomeView.tsx
git commit -m "feat(home): read what the five new cards show"
```

---

### Task 7: The five cards

**Files:** Modify `src/components/home/HomeCards.tsx`, `src/components/views/HomeView.css`.

- [ ] **Step 1: The cards and their header links**

In `src/components/home/HomeCards.tsx`, replace

```tsx
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
```

with

```tsx
// Home's cards (Home cards spec, The grid and Cards in detail): each card's
// frame and what it shows. A card with nothing to show says so in one line;
// one whose data is still being read shows nothing yet.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import {
  addedLabel,
  bpmBars,
  count,
  gigDay,
  gigLine,
  gigWhere,
  keyKnownLine,
  lastPlaylistLine,
  libraryStats,
  needsYouRows,
  newLikeRows,
  playedLabel,
  type NeedsYouRow,
  type StreamNews,
} from '../../lib/home/labels'
import { homeCard } from '../../lib/home/cards'
import { djHue, djInitials, djLine } from '../../lib/search/labels'
import type { TrackFilter } from '../../lib/trackTable/filter'
import { formatTime } from '../../lib/trackTable/cells'
import type { Playlist } from '../../types/track'
import { homeGenreTiles, playlistGradient, userPlaylists } from './content'
import { HomeTrackRows, type TrackRowActions } from './HomeTrackRows'
import type { HomeData } from './useHomeData'

/** What the cards act through; App passes them to HomeView. */
```

In `src/components/home/HomeCards.tsx`, replace

```tsx
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
```

with

```tsx
  onRemove,
  data,
  facts,
  actions,
}: HomeCardProps) {
  const title = homeCard(id)?.title ?? id
  const link = editing ? null : headerLink(id, data, facts, actions)
  return (
    <section className={editing ? 'home-card home-card--editing' : 'home-card'}>
      <div className="home-card__head">
        <h3 className="home-card__title">{title}</h3>
        {editing ? (
          <button
```

In `src/components/home/HomeCards.tsx`, replace

```tsx
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
```

with

```tsx
    </section>
  )
}

function headerLink(
  id: string,
  data: HomeData,
  facts: HomeFacts,
  actions: HomeActions,
): ReactNode {
  if (id === 'recently-added' && facts.totalTrackCount > 0) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => actions.onOpenAllTracks({ added: 30 })}
      >
        All Tracks
      </button>
    )
  }
  const last = data.lastPlaylist
  if (id === 'last-playlist' && last !== null && last !== 'none') {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => actions.onOpenPlaylist(last.id)}
      >
        Open
      </button>
    )
  }
  if (id === 'library-by-genre' && facts.totalTrackCount > 0) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => actions.onOpenAllTracks(null)}
```

In `src/components/home/HomeCards.tsx`, replace

```tsx
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
```

with

```tsx
          onPlay={actions.onPlay}
          onAddToPlaylist={actions.onAddToPlaylist}
          onMoveToFolder={actions.onMoveToFolder}
        />
      )
    }
    case 'recently-added': {
      if (data.recentlyAdded === null) return null
      if (data.recentlyAdded.length === 0) return <Empty>No tracks yet</Empty>
      const now = new Date()
      return (
        <HomeTrackRows
          table="home:recently-added"
          tracks={data.recentlyAdded}
          last={(track) => addedLabel(track.date_added, now)}
          onPlay={actions.onPlay}
          onAddToPlaylist={actions.onAddToPlaylist}
          onMoveToFolder={actions.onMoveToFolder}
        />
      )
    }
    case 'your-djs':
      if (data.djs === null) return null
      if (data.djs.length === 0) {
        return <Empty>No DJs yet — open a DJ page or watch a DJ in Sets</Empty>
      }
      return (
        <div className="home-djs">
          {data.djs.map((dj) => {
            const line = djLine(dj, data.today)
            return (
              <button
                key={dj.nameKey}
                type="button"
                className="home-dj"
                onClick={() => actions.onOpenDj(dj.displayName)}
              >
                <span
                  className="home-dj__photo"
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
                    <span className="home-dj__initials">
                      {djInitials(dj.displayName)}
                    </span>
                  )}
                </span>
                <span className="home-dj__text">
                  <span className="home-dj__name">{dj.displayName}</span>
                  {line && <span className="home-dj__line">{line}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )
    case 'new-likes': {
      const rows = newLikeRows(facts.spotify, facts.youtubeMusic)
      if (rows.length === 0) return <Empty>No new likes</Empty>
      return (
        <div className="home-list">
          {rows.map((row) => (
            <button
              key={`${row.service}\n${row.listId}`}
              type="button"
              className={`home-news home-news--${row.service}`}
              onClick={() => actions.onOpenStreamList(row.service, row.listId)}
            >
              <span className="home-news__number">{row.number}</span>
              <span className="home-news__text">{row.name}</span>
              <span className="home-news__place">
                <span className="home-news__place-name">
                  {row.service === 'spotify' ? 'Spotify' : 'YouTube Music'}
                </span>
                <Icon name="ChevronRight" size={12} />
              </span>
            </button>
          ))}
        </div>
      )
    }
    case 'bpm-key':
      return <BpmAndKey data={data} actions={actions} />
    case 'last-playlist': {
      const last = data.lastPlaylist
      if (last === null) return null
      if (last === 'none') return <Empty>Play a playlist and it shows here</Empty>
      return (
        <div className="home-last">
          <div className="home-last__head">
            <span
              className="home-last__cover"
              style={{ background: playlistGradient(last.name) }}
            />
            <span className="home-last__text">
              <span className="home-last__name">{last.name}</span>
              <span className="home-sub">
                {lastPlaylistLine(last.tracks.length, last.playedAt, new Date())}
              </span>
            </span>
            {last.tracks.length > 0 && (
              <button
                type="button"
                className="home-last__play"
                aria-label={`Play ${last.name}`}
                onClick={() => actions.onPlayPlaylist(last.id)}
              >
                <Icon name="Play" size={14} />
              </button>
            )}
          </div>
          <HomeTrackRows
            table="home:last-playlist"
            tracks={last.tracks}
            last={(track) => formatTime(track.duration_ms)}
            // A play from here records the playlist, so it stays the last one.
            onPlay={(track, list, index) =>
              actions.onPlay(track, list, index, last.id)
            }
            onAddToPlaylist={actions.onAddToPlaylist}
            onMoveToFolder={actions.onMoveToFolder}
          />
        </div>
      )
    }
    case 'upcoming-gigs':
      if (data.gigs === null) return null
      if (data.gigs.length === 0) return <Empty>No upcoming gigs</Empty>
      return (
        <div className="home-list">
          {data.gigs.map((gig) => {
```

In `src/components/home/HomeCards.tsx`, replace

```tsx
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
```

with

```tsx
      <Icon name={icon} size={16} />
      {label}
    </button>
  )
}

/** BPM bars by range, then the keys; each opens All Tracks with its filter. */
function BpmAndKey({ data, actions }: { data: HomeData; actions: HomeActions }) {
  const counts = data.bpmKey
  if (counts === null) return null
  const bars = bpmBars(counts.bpm)
  const most = Math.max(0, ...bars.map((bar) => bar.count))
  if (most === 0 && counts.keys.length === 0) {
    return <Empty>Nothing analyzed yet</Empty>
  }
  return (
    <div className="home-bpm-key">
      <div className="home-bars">
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            className="home-bar"
            disabled={bar.count === 0}
            onClick={() => actions.onOpenAllTracks(bar.filter)}
          >
            <span className="home-bar__label">{bar.label}</span>
            <span className="home-bar__track">
              <span
                className="home-bar__fill"
                style={{ width: `${most > 0 ? (bar.count / most) * 100 : 0}%` }}
              />
            </span>
            <span className="home-bar__count">{count(bar.count)}</span>
          </button>
        ))}
      </div>
      <div className="home-keys">
        <div className="home-keys__list">
          {counts.keys.map((key) => (
            <button
              key={key.key}
              type="button"
              className="home-key"
              onClick={() => actions.onOpenAllTracks({ key: key.key })}
            >
              <span className="home-key__name">{key.key}</span>
              <span className="home-key__count">{count(key.count)}</span>
            </button>
          ))}
        </div>
        <span className="home-sub">{keyKnownLine(counts.keys)}</span>
      </div>
    </div>
  )
}

function NeedsYou({
  data,
  facts,
  actions,
}: {
  data: HomeData
```

- [ ] **Step 2: Their styles**

In `src/components/views/HomeView.css`, replace

```css
}

.home-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

with

```css
}

.home-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---- Your DJs: a round photo, the name and one line ---- */
.home-djs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--space-2) var(--space-3);
}

.home-dj {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-dj:hover {
  background: var(--bg-tertiary);
}

.home-dj:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* The photo, else the no-photo gradient (as on Search's Your DJs) with initials. */
.home-dj__photo {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
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

.home-dj__photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-dj__initials {
  color: rgba(255, 255, 255, 0.7);
  font-size: 15px;
  font-weight: 800;
}

.home-dj__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-dj__name,
.home-dj__line {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-dj__name {
  font-size: var(--text-sm);
}

.home-dj__line {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ---- BPM & key: bars by range beside the keys; stacked when narrow ---- */
.home-bpm-key {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-2) var(--space-5);
}

/* A wide card does not stretch the bars across it. */
@container (min-width: 800px) {
  .home-bpm-key {
    grid-template-columns: minmax(0, 520px) minmax(0, 1fr);
  }
}

@container (max-width: 360px) {
  .home-bpm-key {
    grid-template-columns: minmax(0, 1fr);
  }
}

.home-bars {
  display: flex;
  flex-direction: column;
}

.home-bar {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 44px;
  align-items: center;
  gap: var(--space-2);
  width: calc(100% + 12px);
  height: 26px;
  margin: 0 -6px;
  padding: 0 6px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.home-bar:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.home-bar:disabled {
  cursor: default;
}

.home-bar:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.home-bar__label {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Seen on the card and on a row under the mouse alike. */
.home-bar__track {
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.home-bar__fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--home-accent);
}

.home-bar__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.home-keys {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: 3px;
}

.home-keys__list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.home-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.home-key:hover {
  background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%);
}

.home-key:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.home-key__name {
  font-weight: 700;
}

.home-key__count {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ---- Last playlist: its cover, name, line and ▶ over its tracks ---- */
.home-last__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 2px 0 8px;
}

.home-last__cover {
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--radius-md);
}

.home-last__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.home-last__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 700;
}

.home-last__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.home-last__play:hover {
  background: var(--accent-hover);
}

.home-last__play:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 590 passed (591)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/home/HomeCards.tsx src/components/views/HomeView.css
git commit -m "feat(home): Recently added, Your DJs, New likes, BPM & key and Last playlist cards"
```

---

### Task 8: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-home-cards-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-home-cards-design.md`, replace

```markdown
| Library by genre | No genres yet |
| BPM & key | Nothing analyzed yet |
| Not analyzed (0) | Everything is analyzed |
| Your playlists | No playlists yet |
| Last playlist | Play a playlist and it shows here |

## Playing

There is no new player. A play from Home goes through App's play handler, as a
double click in All Tracks or a playlist does: the track starts in the player
at the bottom, and the queue is the card's list, so next and previous follow
the card. A playlist's ▶ (Your playlists, Last playlist) plays the playlist
```

with

```markdown
| Library by genre | No genres yet |
| BPM & key | Nothing analyzed yet |
| Not analyzed (0) | Everything is analyzed |
| Your playlists | No playlists yet |
| Last playlist | Play a playlist and it shows here |

**As built by plan H2:**

- **Recently added** reads 20 rows; its last column says when a track was
  added as Recently played says when it was played ("09:05" today,
  "yesterday", "Oct 2").
- **Your DJs** puts each round photo beside the name and its line, as Your
  playlists' cards, so a 4×1 card holds a row of DJs; more scroll inside the
  card. It shows Search's 20, the DJ pages opened most recently first.
- **New likes you don't own**: a row per list, its number in the service's
  colour (as in Needs you), the list's name, and the service on the right.
- **BPM & key**: the bars beside the keys, stacked when the card is narrower
  than 360px; in a card wider than 800px the bars keep to 520px. A range with
  no tracks shows 0 and cannot be clicked. The key counts are buttons (6px
  corners) of the key and its count.
- **Last playlist**: `get_last_played_playlist()` answers the playlist's name
  with its id, so the card needs nothing else from App. Its line reads "10
  tracks · played Oct 2" ("played at 22:39" today, "played yesterday"); its ▶
  is the accent square of the mockup. A play from its rows records the
  playlist, so it stays the last one. Besides the data-version number, it
  reads again when a playlist is renamed or its number of tracks changes; a
  reorder inside it shows the next time Home opens or a track is played.

## Playing

There is no new player. A play from Home goes through App's play handler, as a
double click in All Tracks or a playlist does: the track starts in the player
at the bottom, and the queue is the card's list, so next and previous follow
the card. A playlist's ▶ (Your playlists, Last playlist) plays the playlist
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-home-cards-design.md
git commit -m "docs(spec): Home H2 as built"
```

---

### Task 9: Check

- [ ] **Step 1:** `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 453 passed; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 590 passed (591)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Customize → "+ Add" each of the five cards → Save; restart: they are still there.
  - Recently added: the newest tracks; ▶ / double click plays, next follows the card; "All Tracks" opens All Tracks filtered to Added lately.
  - Your DJs: the DJs opened lately first; a click opens the DJ page, Back returns to Home.
  - New likes: a row per list with new likes; a click opens that list. Hide Spotify in the sidebar: its rows go.
  - BPM & key: a bar's count equals the number All Tracks then shows ("125–129 BPM" in its Filter button); a key opens All Tracks on that key.
  - Last playlist: play a playlist (from Home's Your playlists ▶, or from the playlist) → the card shows it; its ▶ plays it; a row plays from it and the card keeps it; drag a track onto that playlist in the sidebar → its count and rows follow; "Open" opens it.
  - Every card's empty text (a fresh library): "No tracks yet", "No DJs yet — open a DJ page or watch a DJ in Sets", "No new likes", "Nothing analyzed yet", "Play a playlist and it shows here".
