# Track Table 4 of 6: Selecting Several, the Right-Click Menu, Toasts with Undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select several rows in a track table, and act on all of them at once from the right-click menu. Each action ends in one toast, with Undo where the change can be put back exactly.

**Architecture:**
- **Backend:** four commands that take a list of ids, each in one transaction:
  - `add_tracks_to_playlist` answers which ids it added (what Undo removes) and which were there already;
  - `remove_tracks_from_playlist`;
  - `bulk_clear_genre`;
  - `restore_track_genres`, the Undo of Set Genre and Clear Genre.

  `bulk_set_genre` moves into one transaction too, so ⌘A on the whole library is one write.
- **The selection:** a pure model, `src/lib/trackTable/selection.ts`: click, ⌘-click, Shift-click, ⌘A, ↑ ↓, and trimming to the rows shown. `TrackTable` keeps it in state, and the table takes the keys once a row is clicked.
- **The menu:** the Interactions spec's shared `Menu` (`src/components/menu/`): at the pointer, kept on screen, submenus, keys, and `useOverlay`. `trackMenuEntries` builds the track table's items from the selection.
- **Toasts:** `src/lib/toast.ts` (a small store: `toast(message, { kind, action })`) and a `Toaster` in `AppShell`'s main area, just above the player.
- **App:** its four handlers take the selected tracks. Each makes one call and shows one toast with Undo; the reload comes once.

**Tech Stack:** Rust (rusqlite, Tauri commands), React 19, TypeScript, framer-motion (the toasts), `useSyncExternalStore`, Vitest (jsdom, no Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-04-track-table-design.md`, sections *Selecting several* and *Right-click menu*. Also `docs/superpowers/specs/2026-10-04-interactions-design.md`, sections *Menus*, *Feedback: toasts* (with the Undo table) and *Keyboard*. The toast and the menu look as in `2026-10-04-interactions-demo.html`. Read them first.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is built by six plans:**
1. toolbar and filter — done;
2. columns — done;
3. artwork and the playing row — done;
4. **this plan**;
5. Move to folder;
6. dragging tracks to playlists and folders, and reordering a playlist.

**Decisions, beyond the spec's letter:**
- **Built here, from the Interactions spec** (which says a plan that comes before it builds the pieces it needs, to its rules):
  - the shared `Menu`, without the confirm-in-place, since no item here asks first;
  - the toasts, without the detail on hover, which Move to folder (plan 5) needs first;
  - the Undo of Set Genre and Clear Genre (`restore_track_genres`), which the Interactions spec listed for its own plan. Bulk genre changes are where an Undo matters most.
- **The count says "3 selected · …" only with two rows or more.** One selected row is just the row clicked.
- **The menu's order:** Add to Playlist ▸, Analyze BPM & Key, Set Genre ▸, Clear Genre, Add / Edit Comment, then Delete from playlist (red, last, set apart), then Generate AI Playlist. Move to folder ▸ joins after Set Genre in plan 5.
- **Delete from playlist does not ask first:** it has Undo. Per the Interactions spec, only actions without Undo ask.
- **Add to Playlist ▸ lists the real playlists, not the one shown.**
- **One track, greyed with several:** Add / Edit Comment and Generate AI Playlist.
- **Set Genre ▸** checks the genre every selected track shares, and shows it beside the item. Custom… opens the existing dialog for the whole selection.
- **↑ ↓ and Enter** come with ⌘A and Esc. The Interactions spec lists them for the focused track table. Clicking a row gives the table the keys; a control inside a row (stars, ▶) keeps its own.
- **Undo reloads whichever view is shown by then** (`loadTracksRef`). A failed Undo shows an error toast.
- **What stays for later:** `Notification` and `HeaderNotification` stay for the rest of the app, and so do the old `.context-menu` rules, which the sidebar's menus still use. The Interactions plan moves both.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at ec68a0e, and the same blocks, applied to a clean `git archive`, reproduce it file for file.
- **Builds and tests:**
  - `cargo test --lib`: 428 passed, 4 of them new; clippy shows no new warnings;
  - `tsc`, and `eslint` on the touched files (only existing warnings), pass;
  - `vitest`: 34 new tests; the scratch tree, which lacks the untracked fixtures, counted 480 passed; the repo will count 494;
  - `vite build` passes.
- **In WebKit** (Playwright, a page rendering `TrackTable` with 2,000 tracks and the `Toaster`):
  - **Clicks:** click, ⌘-click and Shift-click select 1, then 2, then a range of 4, and the count reads "4 selected · 2,000 tracks". Shift-click selects no text.
  - **Keys:** ↓, ⇧↓ ⇧↓, Enter (it played the cursor's row), ⌘A ("2,000 selected"), and Esc (cleared). ⌘A in the search box selects its text, not the rows.
  - **The menu on 3 selected:** Add Comment is grey, and Add to Playlist ▸ lists Peak Time and Warm Up (not the playlist shown, not the folder). Moving the mouse diagonally across Analyze kept the submenu open. Choosing Peak Time passed all 3 ids, closed the menu, gave the table its focus back, and showed "Added …" with Undo; Undo ran.
  - **A right-click on an unselected row** selects it alone.
  - **Menu keys:** ↓↓↓ reaches Set Genre and → opens its submenu on its first item. Esc closes the submenu, and a second Esc closes the menu; the selection stays.
  - **At the window's bottom-right corner** the menu moves inside the window, and its submenu opens on the left. Custom… gives the dialog's box the focus.
  - **Toasts:** a fourth pushes the oldest out; they sit bottom-centre; the one under the mouse stays, and the rest of its time runs after the mouse leaves.
  - **Midnight and Dawn:** the menu, the red Delete, the grey item, the colour dots and the toasts read well.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/mod.rs` | modify | `add_tracks_to_playlist`, `remove_tracks_from_playlist`, `bulk_clear_genre`, `restore_track_genres`; `bulk_set_genre` in one transaction; tests |
| `src-tauri/src/commands/playlists.rs`, `genre.rs`, `src-tauri/src/lib.rs` | modify | the four commands, registered |
| `src/types/track.ts`, `src/lib/tauri-api.ts` | modify | `TrackGenre`; the four calls |
| `src/lib/trackTable/selection.ts` (+ test) | create | the selection model |
| `src/lib/trackTable/count.ts` (+ test) | modify | "3 selected · …" |
| `src/lib/trackTable/bulkMessages.ts` (+ test) | create | what the toasts say; the genre snapshot for Undo |
| `src/lib/toast.ts` (+ test), `src/components/Toaster.tsx`, `.css` | create | the toasts |
| `src/components/layout/AppShell.tsx` | modify | the Toaster over the main area |
| `src/components/menu/menuNav.ts` (+ test), `Menu.tsx`, `Menu.css` | create | the shared menu |
| `src/components/track-table/trackMenuEntries.ts` (+ test) | create | the track table's items, from the selection |
| `src/components/TrackTable.tsx`, `.css` | modify | the selection, the keys, the menu, the genre dialog for several |
| `src/App.tsx` | modify | the handlers take the selection; one toast with Undo each |

---

### Task 0: Baseline

- [ ] **Step 1: Be on the branch**

```bash
git switch feat/redesign
git status --short --untracked-files=no   # only .claude/settings.local.json and .planning/STATE.md may show; leave them (untracked files are the user's, leave them too)
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass (460), no type errors.

Run: `npx eslint src 2>&1 | tail -2`
Expected: `✖ 22 problems (10 errors, 12 warnings)`, the existing ones.

Run: `cd src-tauri && cargo test --lib 2>&1 | grep "test result"; cd ..`
Expected: `test result: ok. 424 passed`.

---

### Task 1: Adding, removing and changing genres for many tracks at once (Rust)

**Files:**
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/db/mod.rs`, replace (at the end of the `tests` module (the last test is `test_get_play_counts_counts_each_played_track`))

```rust
        assert_eq!(db.get_play_counts().unwrap(), vec![(ids[0], 1), (ids[2], 3)]);
    }
}
```

with

```rust
        assert_eq!(db.get_play_counts().unwrap(), vec![(ids[0], 1), (ids[2], 3)]);
    }

    // Three tracks with distinct paths, for the bulk operations' tests.
    fn create_three_tracks(db: &Database, name: &str) -> Vec<i64> {
        (0..3)
            .map(|n| {
                let mut track = create_test_track();
                track.file_path = format!("/path/to/{}-{}.mp3", name, n);
                track.file_hash = format!("{}-{}", name, n);
                db.create_track(&track).unwrap()
            })
            .collect()
    }

    fn playlist_ids(db: &Database, playlist_id: i64) -> Vec<i64> {
        db.get_playlist_tracks(playlist_id)
            .unwrap()
            .into_iter()
            .map(|(track, ..)| track.id.unwrap())
            .collect()
    }

    #[test]
    fn test_add_tracks_to_playlist_answers_added_and_already_there() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let ids = create_three_tracks(&db, "add");
        let playlist = db.create_playlist("Peak Time", "playlist", None).unwrap();
        db.add_track_to_playlist(playlist, ids[0]).unwrap();

        let (added, already) = db
            .add_tracks_to_playlist(playlist, &[ids[1], ids[0], ids[2], ids[1]])
            .unwrap();

        assert_eq!(added, vec![ids[1], ids[2]]);
        assert_eq!(already, vec![ids[0]]);
        assert_eq!(playlist_ids(&db, playlist), vec![ids[0], ids[1], ids[2]]);
    }

    #[test]
    fn test_remove_tracks_from_playlist_counts_those_it_held() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let ids = create_three_tracks(&db, "remove");
        let playlist = db.create_playlist("Warm Up", "playlist", None).unwrap();
        db.add_tracks_to_playlist(playlist, &[ids[0], ids[1]]).unwrap();

        let removed = db
            .remove_tracks_from_playlist(playlist, &[ids[0], ids[2]])
            .unwrap();

        assert_eq!(removed, 1);
        assert_eq!(playlist_ids(&db, playlist), vec![ids[1]]);
    }

    #[test]
    fn test_bulk_clear_genre_clears_only_those_given() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let ids = create_three_tracks(&db, "clear");
        db.bulk_set_genre(&ids, "House").unwrap();

        assert_eq!(db.bulk_clear_genre(&[ids[0], ids[1]]).unwrap(), 2);

        assert_eq!(db.get_track_genre(ids[0]).unwrap(), None);
        assert_eq!(db.get_track_genre(ids[1]).unwrap(), None);
        assert_eq!(
            db.get_track_genre(ids[2]).unwrap(),
            Some(("House".to_string(), "user".to_string()))
        );
    }

    #[test]
    fn test_restore_track_genres_writes_genre_and_source_as_given() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let ids = create_three_tracks(&db, "restore");
        db.save_track_genre(ids[0], "Deep House", "tag").unwrap();
        db.bulk_set_genre(&[ids[0], ids[1]], "Techno").unwrap();

        let count = db
            .restore_track_genres(&[
                (ids[0], Some("Deep House".to_string()), Some("tag".to_string())),
                (ids[1], None, None),
            ])
            .unwrap();

        assert_eq!(count, 2);
        assert_eq!(
            db.get_track_genre(ids[0]).unwrap(),
            Some(("Deep House".to_string(), "tag".to_string()))
        );
        assert_eq!(db.get_track_genre(ids[1]).unwrap(), None);
    }
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd src-tauri && cargo test --lib db::tests 2>&1 | grep -E "^error|no method" | head -5; cd ..`
Expected: compile errors, `no method named add_tracks_to_playlist` (and the others).

- [ ] **Step 3: Add and remove many**

In `src-tauri/src/db/mod.rs`, replace (the end of `reorder_playlist_tracks`)

```rust
        sql.push_str("COMMIT;\n");
        self.conn.execute_batch(&sql)?;
        Ok(())
    }
```

with

```rust
        sql.push_str("COMMIT;\n");
        self.conn.execute_batch(&sql)?;
        Ok(())
    }

    /// Add tracks to the end of a playlist, in the order given, in one
    /// transaction. Answers the ids it added (what an Undo removes) and those
    /// already in the playlist; an id given twice counts once.
    pub fn add_tracks_to_playlist(
        &self,
        playlist_id: i64,
        track_ids: &[i64],
    ) -> Result<(Vec<i64>, Vec<i64>)> {
        let tx = self.conn.unchecked_transaction()?;
        let mut position: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM playlist_tracks WHERE playlist_id = ?",
            [playlist_id],
            |row| row.get(0),
        )?;
        let mut seen = std::collections::HashSet::new();
        let mut added = Vec::new();
        let mut already = Vec::new();
        for &track_id in track_ids {
            if !seen.insert(track_id) {
                continue;
            }
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?)",
                params![playlist_id, track_id],
                |row| row.get(0),
            )?;
            if exists {
                already.push(track_id);
                continue;
            }
            position += 1;
            tx.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                params![playlist_id, track_id, position],
            )?;
            added.push(track_id);
        }
        tx.commit()?;
        Ok((added, already))
    }

    /// Remove tracks from a playlist in one transaction. Answers how many were
    /// in it.
    pub fn remove_tracks_from_playlist(&self, playlist_id: i64, track_ids: &[i64]) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut removed = 0;
        for &track_id in track_ids {
            removed += tx.execute(
                "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
                params![playlist_id, track_id],
            )?;
        }
        tx.commit()?;
        Ok(removed)
    }
```

- [ ] **Step 4: Change genres for many, and put them back**

In `src-tauri/src/db/mod.rs`, replace

```rust
    /// Bulk set genre for multiple tracks
    pub fn bulk_set_genre(&self, track_ids: &[i64], genre: &str) -> Result<usize> {
        let mut count = 0;
        for &track_id in track_ids {
            self.save_track_genre(track_id, genre, "user")?;
            count += 1;
        }
        Ok(count)
    }
```

with

```rust
    /// Bulk set genre for multiple tracks, in one transaction: a whole
    /// library's worth is one write, not thousands.
    pub fn bulk_set_genre(&self, track_ids: &[i64], genre: &str) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0;
        for &track_id in track_ids {
            self.save_track_genre(track_id, genre, "user")?;
            count += 1;
        }
        tx.commit()?;
        Ok(count)
    }

    /// Clear the genre of several tracks in one transaction.
    pub fn bulk_clear_genre(&self, track_ids: &[i64]) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0;
        for &track_id in track_ids {
            count += tx.execute(
                "UPDATE tracks SET genre = NULL, genre_source = NULL WHERE id = ?",
                [track_id],
            )?;
        }
        tx.commit()?;
        Ok(count)
    }

    /// Write each track's genre and its source as given, none included and
    /// over a user genre: the Undo of setting or clearing genres puts back
    /// what was there (save_track_genre would keep a user genre).
    pub fn restore_track_genres(
        &self,
        genres: &[(i64, Option<String>, Option<String>)],
    ) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0;
        for (track_id, genre, source) in genres {
            count += tx.execute(
                "UPDATE tracks SET genre = ?, genre_source = ? WHERE id = ?",
                params![genre, source, track_id],
            )?;
        }
        tx.commit()?;
        Ok(count)
    }
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib 2>&1 | grep "test result"; cd ..`
Expected: `test result: ok. 428 passed`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/mod.rs
git commit -m "feat(db): add and remove many playlist tracks, clear and restore many genres — each in one transaction"
```

---

### Task 2: The commands, and their calls

**Files:**
- Modify: `src-tauri/src/commands/playlists.rs`, `src-tauri/src/commands/genre.rs`, `src-tauri/src/lib.rs`
- Modify: `src/types/track.ts`, `src/lib/tauri-api.ts`

- [ ] **Step 1: The playlist commands**

In `src-tauri/src/commands/playlists.rs`, replace (before it)

```rust
/// Reorder tracks in a playlist (atomic position update)
```

with

```rust
/// The answer of add_tracks_to_playlist: the ids it added (what an Undo
/// removes) and those already in the playlist.
#[derive(Debug, Clone, Serialize)]
pub struct AddedTracks {
    pub added: Vec<i64>,
    pub already: Vec<i64>,
}

/// Add several tracks to a playlist at once (the track table's selection).
#[tauri::command]
pub fn add_tracks_to_playlist(
    state: State<AppState>,
    playlist_id: i64,
    track_ids: Vec<i64>,
) -> Result<AddedTracks, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let (added, already) = db
        .add_tracks_to_playlist(playlist_id, &track_ids)
        .map_err(|e| AppError::Database(format!("Failed to add tracks: {}", e)))?;
    Ok(AddedTracks { added, already })
}

/// Remove several tracks from a playlist at once. Answers how many it held.
#[tauri::command]
pub fn remove_tracks_from_playlist(
    state: State<AppState>,
    playlist_id: i64,
    track_ids: Vec<i64>,
) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let removed = db
        .remove_tracks_from_playlist(playlist_id, &track_ids)
        .map_err(|e| AppError::Database(format!("Failed to remove tracks: {}", e)))?;
    Ok(removed as i64)
}

/// Reorder tracks in a playlist (atomic position update)
```

- [ ] **Step 2: The genre commands**

In `src-tauri/src/commands/genre.rs`, replace

```rust
use serde::Serialize;
```

with

```rust
use serde::{Deserialize, Serialize};
```

and

In `src-tauri/src/commands/genre.rs`, replace (the end of the file (`bulk_set_genre`))

```rust
    let count = db.bulk_set_genre(&track_ids, &genre)
        .map_err(|e| AppError::Database(format!("Failed to bulk set genre: {}", e)))?;

    Ok(count as i64)
}
```

with

```rust
    let count = db.bulk_set_genre(&track_ids, &genre)
        .map_err(|e| AppError::Database(format!("Failed to bulk set genre: {}", e)))?;

    Ok(count as i64)
}

/// Clear the genre of several tracks at once
#[tauri::command]
pub fn bulk_clear_genre(track_ids: Vec<i64>, state: State<AppState>) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let count = db.bulk_clear_genre(&track_ids)
        .map_err(|e| AppError::Database(format!("Failed to clear genres: {}", e)))?;

    Ok(count as i64)
}

/// A track's genre and its source, as the Undo of a genre change puts them back.
#[derive(Debug, Clone, Deserialize)]
pub struct TrackGenre {
    pub id: i64,
    pub genre: Option<String>,
    pub source: Option<String>,
}

/// Put back tracks' genres and sources exactly as given (the Undo of Set
/// Genre and Clear Genre).
#[tauri::command]
pub fn restore_track_genres(genres: Vec<TrackGenre>, state: State<AppState>) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let rows: Vec<(i64, Option<String>, Option<String>)> = genres
        .into_iter()
        .map(|g| (g.id, g.genre, g.source))
        .collect();
    let count = db.restore_track_genres(&rows)
        .map_err(|e| AppError::Database(format!("Failed to restore genres: {}", e)))?;

    Ok(count as i64)
}
```

- [ ] **Step 3: Register them**

In `src-tauri/src/lib.rs`, replace

```rust
            commands::playlists::remove_track_from_playlist,
```

with

```rust
            commands::playlists::remove_track_from_playlist,
            commands::playlists::add_tracks_to_playlist,
            commands::playlists::remove_tracks_from_playlist,
```

and

In `src-tauri/src/lib.rs`, replace

```rust
            commands::genre::bulk_set_genre,
```

with

```rust
            commands::genre::bulk_set_genre,
            commands::genre::bulk_clear_genre,
            commands::genre::restore_track_genres,
```

- [ ] **Step 4: The calls**

In `src/types/track.ts`, replace

```ts
  musical_key?: string
  key_confidence?: number
}

export interface ScanResult {
```

with

```ts
  musical_key?: string
  key_confidence?: number
}

/** A track's genre and its source, as the Undo of a genre change puts them back. */
export interface TrackGenre {
  id: number
  genre: string | null
  source: string | null
}

export interface ScanResult {
```

In `src/lib/tauri-api.ts`, replace

```ts
  GenreDefinition,
  DuplicateGroup,
} from '../types/track'
```

with

```ts
  GenreDefinition,
  DuplicateGroup,
  TrackGenre,
} from '../types/track'
```

In `src/lib/tauri-api.ts`, replace

```ts
  async reorderPlaylistTracks(
```

with

```ts
  /** Adds several tracks at once; answers which it added and which were there. */
  async addTracksToPlaylist(
    playlistId: number,
    trackIds: number[],
  ): Promise<{ added: number[]; already: number[] }> {
    return await invoke('add_tracks_to_playlist', { playlistId, trackIds })
  },

  /** Removes several tracks at once; answers how many the playlist held. */
  async removeTracksFromPlaylist(playlistId: number, trackIds: number[]): Promise<number> {
    return await invoke('remove_tracks_from_playlist', { playlistId, trackIds })
  },

  async reorderPlaylistTracks(
```

In `src/lib/tauri-api.ts`, replace

```ts
  async bulkSetGenre(trackIds: number[], genre: string): Promise<number> {
    return await invoke('bulk_set_genre', { trackIds, genre })
  },
```

with

```ts
  async bulkSetGenre(trackIds: number[], genre: string): Promise<number> {
    return await invoke('bulk_set_genre', { trackIds, genre })
  },

  async bulkClearGenre(trackIds: number[]): Promise<number> {
    return await invoke('bulk_clear_genre', { trackIds })
  },

  /** Puts genres and their sources back exactly as given (a genre Undo). */
  async restoreTrackGenres(genres: TrackGenre[]): Promise<number> {
    return await invoke('restore_track_genres', { genres })
  },
```

- [ ] **Step 5: Check and commit**

Run: `cd src-tauri && cargo clippy --lib 2>&1 | grep -c "^warning"; cd .. && npx tsc --noEmit -p .`
Expected: `11`, as before this plan (ten existing warnings and the summary line); no type errors.

```bash
git add src-tauri/src/commands/playlists.rs src-tauri/src/commands/genre.rs src-tauri/src/lib.rs src/types/track.ts src/lib/tauri-api.ts
git commit -m "feat(tracks): commands to add, remove, clear and restore for many tracks at once"
```

---

### Task 3: The selection

**Files:**
- Create: `src/lib/trackTable/selection.ts`
- Test: `src/lib/trackTable/selection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/selection.test.ts
import { describe, expect, it } from 'vitest'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
  selectOnly,
  selectedTracks,
  trimSelection,
  type Selection,
} from './selection'

const shown = [10, 20, 30, 40, 50]
const plain = { toggle: false, range: false }
const cmd = { toggle: true, range: false }
const shift = { toggle: false, range: true }
const cmdShift = { toggle: true, range: true }
const ids = (selection: Selection) => [...selection.ids].sort((a, b) => a - b)

describe('selecting rows', () => {
  it('a click selects that row alone', () => {
    const selection = clickRow(selectOnly(10), 30, plain, shown)
    expect(ids(selection)).toEqual([30])
    expect(selection.anchor).toBe(30)
  })

  it('⌘-click adds a row, and removes it again', () => {
    const added = clickRow(selectOnly(10), 30, cmd, shown)
    expect(ids(added)).toEqual([10, 30])
    expect(ids(clickRow(added, 10, cmd, shown))).toEqual([30])
  })

  it('Shift-click selects the range from the row clicked last, either way', () => {
    expect(ids(clickRow(selectOnly(20), 40, shift, shown))).toEqual([20, 30, 40])
    expect(ids(clickRow(selectOnly(40), 20, shift, shown))).toEqual([20, 30, 40])
  })

  it('a second Shift-click redraws the range from the same row', () => {
    const first = clickRow(selectOnly(20), 50, shift, shown)
    expect(ids(clickRow(first, 30, shift, shown))).toEqual([20, 30])
  })

  it('⌘-Shift-click adds the range to the rows selected', () => {
    const picked = clickRow(selectOnly(10), 40, cmd, shown)
    expect(ids(clickRow(picked, 50, cmdShift, shown))).toEqual([10, 40, 50])
  })

  it('Shift-click with nothing clicked before selects that row', () => {
    expect(ids(clickRow(NO_SELECTION, 30, shift, shown))).toEqual([30])
  })

  it('⌘A selects every row shown', () => {
    expect(ids(selectAll(selectOnly(20), shown))).toEqual(shown)
  })
})

describe('moving with ↑ ↓', () => {
  it('moves one row, and stops at the ends', () => {
    expect(ids(moveCursor(selectOnly(20), shown, 1, false))).toEqual([30])
    expect(ids(moveCursor(selectOnly(50), shown, 1, false))).toEqual([50])
    expect(ids(moveCursor(selectOnly(10), shown, -1, false))).toEqual([10])
  })

  it('with nothing selected, ↓ takes the first row and ↑ the last', () => {
    expect(ids(moveCursor(NO_SELECTION, shown, 1, false))).toEqual([10])
    expect(ids(moveCursor(NO_SELECTION, shown, -1, false))).toEqual([50])
  })

  it('with Shift, the range from the anchor follows', () => {
    const down = moveCursor(moveCursor(selectOnly(20), shown, 1, true), shown, 1, true)
    expect(ids(down)).toEqual([20, 30, 40])
    expect(ids(moveCursor(down, shown, -1, true))).toEqual([20, 30])
  })
})

describe('the rows shown change', () => {
  it('rows no longer shown leave the selection', () => {
    const all = selectAll(selectOnly(20), shown)
    const trimmed = trimSelection(all, [20, 40])
    expect(ids(trimmed)).toEqual([20, 40])
    expect(trimmed.anchor).toBe(20)
    // Shown again later, they stay out.
    expect(ids(trimSelection(trimmed, shown))).toEqual([20, 40])
  })

  it('forgets an anchor no longer shown', () => {
    expect(trimSelection(selectOnly(30), [10, 20]).anchor).toBeNull()
  })

  it('keeps the same selection when every row is still shown', () => {
    const selection = selectAll(selectOnly(20), shown)
    expect(trimSelection(selection, [...shown, 60])).toBe(selection)
  })

  it('gives the selected tracks in the order shown', () => {
    const tracks = shown.map((id) => ({ id }))
    const selection = clickRow(clickRow(selectOnly(40), 10, cmd, shown), 30, cmd, shown)
    expect(selectedTracks(selection, tracks).map((t) => t.id)).toEqual([10, 30, 40])
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/selection.test.ts`
Expected: FAIL — `Failed to resolve import "./selection"`.

- [ ] **Step 3: Write the model**

```ts
// src/lib/trackTable/selection.ts
// The rows selected in a track table (track table spec, Selecting several):
// a click selects one row, ⌘-click adds or removes one, Shift-click selects
// the range from the anchor (the row clicked last), ⌘A every row shown, and
// ↑ ↓ move it (Shift extends the range). Rows no longer shown leave it. Pure:
// the table keeps it in state and gives the shown rows' ids, in their order.

export interface Selection {
  /** The selected tracks' ids. */
  readonly ids: ReadonlySet<number>
  /** Where a Shift range starts: the row clicked last, or moved to without Shift. */
  readonly anchor: number | null
  /** The row ↑ ↓ move from and Enter plays: the row clicked or moved to last. */
  readonly cursor: number | null
}

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null, cursor: null }

/** The keys held with a click: ⌘ (Ctrl on Windows) and Shift. */
export interface ClickKeys {
  toggle: boolean
  range: boolean
}

/** One row alone, as a plain click selects it. */
export function selectOnly(id: number): Selection {
  return { ids: new Set([id]), anchor: id, cursor: id }
}

// From the anchor to `id`, in the order shown; with `keep`, added to the rows
// already selected. No anchor among the rows shown: `id` alone.
function rangeTo(
  selection: Selection,
  id: number,
  shown: readonly number[],
  keep: boolean,
): Selection {
  const anchor = selection.anchor ?? id
  const from = shown.indexOf(anchor)
  const to = shown.indexOf(id)
  if (from === -1 || to === -1) return selectOnly(id)
  const ids = new Set(keep ? selection.ids : [])
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) ids.add(shown[i])
  return { ids, anchor, cursor: id }
}

/** A click on a row, with the keys held. */
export function clickRow(
  selection: Selection,
  id: number,
  keys: ClickKeys,
  shown: readonly number[],
): Selection {
  if (keys.range) return rangeTo(selection, id, shown, keys.toggle)
  if (!keys.toggle) return selectOnly(id)
  const ids = new Set(selection.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ids, anchor: id, cursor: id }
}

/** ⌘A: every row shown. */
export function selectAll(selection: Selection, shown: readonly number[]): Selection {
  return { ...selection, ids: new Set(shown) }
}

/**
 * ↓ (1) or ↑ (-1) from the cursor, stopping at the ends; with nothing to
 * move from, ↓ takes the first row and ↑ the last. With Shift, the range from
 * the anchor follows the cursor.
 */
export function moveCursor(
  selection: Selection,
  shown: readonly number[],
  step: 1 | -1,
  extend: boolean,
): Selection {
  if (shown.length === 0) return selection
  const at = selection.cursor === null ? -1 : shown.indexOf(selection.cursor)
  const next =
    at === -1
      ? step === 1
        ? 0
        : shown.length - 1
      : Math.min(shown.length - 1, Math.max(0, at + step))
  return extend ? rangeTo(selection, shown[next], shown, false) : selectOnly(shown[next])
}

/** Only the rows still shown; the same selection when every one of them is. */
export function trimSelection(selection: Selection, shown: readonly number[]): Selection {
  const visible = new Set(shown)
  const keep = (id: number | null) => (id !== null && visible.has(id) ? id : null)
  const ids = [...selection.ids].filter((id) => visible.has(id))
  if (
    ids.length === selection.ids.size &&
    keep(selection.anchor) === selection.anchor &&
    keep(selection.cursor) === selection.cursor
  ) {
    return selection
  }
  return { ids: new Set(ids), anchor: keep(selection.anchor), cursor: keep(selection.cursor) }
}

/** The selected tracks, in the order shown. */
export function selectedTracks<T extends { id: number }>(
  selection: Selection,
  shown: readonly T[],
): T[] {
  return shown.filter((track) => selection.ids.has(track.id))
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/selection.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/selection.ts src/lib/trackTable/selection.test.ts
git commit -m "feat(tracks): the selection — click, ⌘-click, Shift-click, ⌘A, ↑ ↓, trimmed to the rows shown"
```

---

### Task 4: What the count and the toasts say

**Files:**
- Modify: `src/lib/trackTable/count.ts`, `src/lib/trackTable/count.test.ts`
- Create: `src/lib/trackTable/bulkMessages.ts`
- Test: `src/lib/trackTable/bulkMessages.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/trackTable/count.test.ts`, replace

```ts
  it('says track for one', () => {
    expect(trackCountLabel(1, 1, false)).toBe('1 track')
  })
```

with

```ts
  it('says track for one', () => {
    expect(trackCountLabel(1, 1, false)).toBe('1 track')
  })

  it('starts with the rows selected when there are several', () => {
    expect(trackCountLabel(1162, 8583, true, 3)).toBe('3 selected · 1,162 of 8,583 tracks')
    expect(trackCountLabel(8583, 8583, false, 1204)).toBe('1,204 selected · 8,583 tracks')
    expect(trackCountLabel(8583, 8583, false, 1)).toBe('8,583 tracks')
  })
```

```ts
// src/lib/trackTable/bulkMessages.test.ts
import { describe, expect, it } from 'vitest'
import {
  addedMessage,
  alreadyMessage,
  genreClearedMessage,
  genreSetMessage,
  genreSnapshot,
  removedMessage,
  tracksSubject,
} from './bulkMessages'

const one = [{ title: "Juz Listen'" }]
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Track ${i}` }))

describe('the toasts after a bulk action', () => {
  it('names one track by its title and counts several', () => {
    expect(tracksSubject(one)).toBe("Juz Listen'")
    expect(tracksSubject(many(12))).toBe('12 tracks')
    expect(tracksSubject(many(1204))).toBe('1,204 tracks')
    expect(tracksSubject([{ title: undefined }])).toBe('1 track')
  })

  it('says how many were added, and how many were there already', () => {
    expect(addedMessage(many(12), 0, 'Peak Time')).toBe('Added 12 tracks to Peak Time')
    expect(addedMessage(many(10), 2, 'Peak Time')).toBe(
      'Added 10 tracks to Peak Time · 2 already there',
    )
    expect(alreadyMessage(one, 'Peak Time')).toBe('Already in Peak Time')
    expect(alreadyMessage(many(3), 'Peak Time')).toBe('All 3 tracks are already in Peak Time')
  })

  it('says what was removed and what happened to the genre', () => {
    expect(removedMessage(many(3), 'Warm Up')).toBe('Removed 3 tracks from Warm Up')
    expect(genreSetMessage(many(50), 'House')).toBe('Genre set to "House" for 50 tracks')
    expect(genreClearedMessage(one)).toBe("Genre cleared for Juz Listen'")
  })

  it('keeps each genre and its source for Undo, none included', () => {
    expect(
      genreSnapshot([
        { id: 1, genre: 'Deep House', genre_source: 'tag' },
        { id: 2, genre: undefined, genre_source: undefined },
      ]),
    ).toEqual([
      { id: 1, genre: 'Deep House', source: 'tag' },
      { id: 2, genre: null, source: null },
    ])
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/count.test.ts src/lib/trackTable/bulkMessages.test.ts`
Expected: FAIL — the count test gets "1,162 of 8,583 tracks"; `Failed to resolve import "./bulkMessages"`.

- [ ] **Step 3: The count**

In `src/lib/trackTable/count.ts`, replace

```ts
/**
 * "8,583 tracks" with no search or filter, "1,162 of 8,583 tracks" while
 * either narrows the view. `total` is the view's: the whole library in All
 * Tracks, the folder's or the playlist's tracks elsewhere.
 */
export function trackCountLabel(shown: number, total: number, narrowed: boolean): string {
  const noun = total === 1 ? 'track' : 'tracks'
  return narrowed
    ? `${format(shown)} of ${format(total)} ${noun}`
    : `${format(total)} ${noun}`
}
```

with

```ts
/**
 * "8,583 tracks" with no search or filter, "1,162 of 8,583 tracks" while
 * either narrows the view. `total` is the view's: the whole library in All
 * Tracks, the folder's or the playlist's tracks elsewhere. With several rows
 * selected it starts "3 selected · " (one row is just the row clicked).
 */
export function trackCountLabel(
  shown: number,
  total: number,
  narrowed: boolean,
  selected = 0,
): string {
  const noun = total === 1 ? 'track' : 'tracks'
  const count = narrowed
    ? `${format(shown)} of ${format(total)} ${noun}`
    : `${format(total)} ${noun}`
  return selected > 1 ? `${format(selected)} selected · ${count}` : count
}
```

- [ ] **Step 4: The messages**

```ts
// src/lib/trackTable/bulkMessages.ts
// What the toasts say after the track table's right-click menu acts on its
// selection (track table spec, Right-click menu), and what a genre Undo puts
// back. One track is named by its title, several are counted.
import type { Track, TrackGenre } from '../../types/track'

type Titled = Pick<Track, 'title'>

/** "Juz Listen'", "12 tracks", "1,204 tracks". */
export function tracksSubject(tracks: readonly Titled[]): string {
  if (tracks.length === 1 && tracks[0].title) return tracks[0].title
  const n = tracks.length
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'track' : 'tracks'}`
}

/** "Added 12 tracks to Peak Time", with " · 2 already there" when some were. */
export function addedMessage(added: readonly Titled[], already: number, playlist: string): string {
  const message = `Added ${tracksSubject(added)} to ${playlist}`
  return already > 0 ? `${message} · ${already.toLocaleString('en-US')} already there` : message
}

/** Nothing was added: every track was there already. */
export function alreadyMessage(tracks: readonly Titled[], playlist: string): string {
  return tracks.length === 1 ? `Already in ${playlist}` : `All ${tracksSubject(tracks)} are already in ${playlist}`
}

export function removedMessage(tracks: readonly Titled[], playlist: string): string {
  return `Removed ${tracksSubject(tracks)} from ${playlist}`
}

export function genreSetMessage(tracks: readonly Titled[], genre: string): string {
  return `Genre set to "${genre}" for ${tracksSubject(tracks)}`
}

export function genreClearedMessage(tracks: readonly Titled[]): string {
  return `Genre cleared for ${tracksSubject(tracks)}`
}

/** Each track's genre and its source, as a genre Undo puts them back. */
export function genreSnapshot(
  tracks: readonly Pick<Track, 'id' | 'genre' | 'genre_source'>[],
): TrackGenre[] {
  return tracks.map((track) => ({
    id: track.id,
    genre: track.genre ?? null,
    source: track.genre_source ?? null,
  }))
}
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable`
Expected: PASS (count 4 tests, bulkMessages 4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/trackTable/count.ts src/lib/trackTable/count.test.ts src/lib/trackTable/bulkMessages.ts src/lib/trackTable/bulkMessages.test.ts
git commit -m "feat(tracks): \"3 selected\" in the count, and what the toasts say after acting on many"
```

---

### Task 5: Toasts

**Files:**
- Create: `src/lib/toast.ts`, `src/components/Toaster.tsx`, `src/components/Toaster.css`
- Test: `src/lib/toast.test.ts`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/toast.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearToasts,
  dismissToast,
  getToasts,
  holdToast,
  releaseToast,
  runToastAction,
  toast,
} from './toast'

const messages = () => getToasts().map((t) => t.message)

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it('success and info leave after 4s, warning after 6s', () => {
    toast('Added', { kind: 'success' })
    toast('Note', { kind: 'info' })
    toast('Careful', { kind: 'warning' })
    vi.advanceTimersByTime(3999)
    expect(messages()).toEqual(['Added', 'Note', 'Careful'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual(['Careful'])
    vi.advanceTimersByTime(2000)
    expect(messages()).toEqual([])
  })

  it('an error stays until it is closed', () => {
    const id = toast('Failed', { kind: 'error' })
    vi.advanceTimersByTime(60_000)
    expect(messages()).toEqual(['Failed'])
    dismissToast(id)
    expect(messages()).toEqual([])
  })

  it('shows at most three: a fourth pushes the oldest out', () => {
    toast('one', { kind: 'error' })
    toast('two')
    toast('three')
    toast('four')
    expect(messages()).toEqual(['two', 'three', 'four'])
  })

  it('waits while the mouse is over it, then runs the rest of its time', () => {
    const id = toast('Added')
    vi.advanceTimersByTime(3000)
    holdToast(id)
    vi.advanceTimersByTime(10_000)
    expect(messages()).toEqual(['Added'])
    releaseToast(id)
    vi.advanceTimersByTime(999)
    expect(messages()).toEqual(['Added'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('an action runs and closes its toast', () => {
    const run = vi.fn()
    const id = toast('Added 3 tracks to Peak Time', { action: { label: 'Undo', run } })
    runToastAction(id)
    expect(run).toHaveBeenCalledOnce()
    expect(messages()).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/toast.test.ts`
Expected: FAIL — `Failed to resolve import "./toast"`.

- [ ] **Step 3: The store**

```ts
// src/lib/toast.ts
// Toasts (Interactions spec, Feedback): `toast(message, { kind, action })`
// from anywhere; the Toaster shows them. success and info leave after 4s,
// warning after 6s, error stays until closed, and a toast under the mouse
// waits. At most 3 at a time: a fourth pushes the oldest out. An action
// (Undo, Open, Try again) runs and closes its toast.
import { useSyncExternalStore } from 'react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastOptions {
  /** success when absent. */
  kind?: ToastKind
  action?: ToastAction
}

export interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

export const TOAST_LIMIT = 3

/** How long each kind stays, in ms; null stays until closed. */
export const TOAST_DURATION: Record<ToastKind, number | null> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
}

// A toast's time left; `handle` is null while the mouse holds it.
interface Timer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

let toasts: readonly Toast[] = []
const timers = new Map<number, Timer>()
const listeners = new Set<() => void>()
let nextId = 1

function emit() {
  listeners.forEach((listener) => listener())
}

function startTimer(id: number, ms: number) {
  timers.set(id, {
    handle: setTimeout(() => dismissToast(id), ms),
    remaining: ms,
    startedAt: Date.now(),
  })
}

function stopTimer(id: number) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

/** Shows a toast; answers its id. */
export function toast(message: string, options: ToastOptions = {}): number {
  const id = nextId++
  const kind = options.kind ?? 'success'
  let next = [...toasts, { id, message, kind, action: options.action }]
  while (next.length > TOAST_LIMIT) {
    stopTimer(next[0].id)
    next = next.slice(1)
  }
  toasts = next
  const duration = TOAST_DURATION[kind]
  if (duration !== null) startTimer(id, duration)
  emit()
  return id
}

export function dismissToast(id: number): void {
  stopTimer(id)
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** The mouse is over the toast: its time stops. */
export function holdToast(id: number): void {
  const timer = timers.get(id)
  if (!timer || timer.handle === null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining -= Date.now() - timer.startedAt
}

/** The mouse left it: the rest of its time runs. */
export function releaseToast(id: number): void {
  const timer = timers.get(id)
  if (!timer || timer.handle !== null) return
  timer.startedAt = Date.now()
  timer.handle = setTimeout(() => dismissToast(id), Math.max(0, timer.remaining))
}

/** Runs the toast's action, closing the toast first. */
export function runToastAction(id: number): void {
  const shown = toasts.find((t) => t.id === id)
  dismissToast(id)
  shown?.action?.run()
}

/** Closes every toast (tests). */
export function clearToasts(): void {
  toasts.forEach((t) => stopTimer(t.id))
  toasts = []
  emit()
}

export function getToasts(): readonly Toast[] {
  return toasts
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The toasts showing, for the Toaster. */
export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribeToasts, getToasts)
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/toast.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: The Toaster**

```tsx
// src/components/Toaster.tsx
// Shows the toasts (src/lib/toast.ts) bottom-centre over the main area, just
// above the player: they slide in from 8px below (slow) and fade out (base).
// Under the mouse a toast waits; its action (Undo) runs and closes it; an
// error has ✕, as it stays until closed.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  dismissToast,
  holdToast,
  releaseToast,
  runToastAction,
  useToasts,
} from '../lib/toast'
import { EASE, MOTION } from '../lib/motion'
import { Icon } from './Icon'
import './Toaster.css'

export function Toaster() {
  const toasts = useToasts()
  const reduceMotion = useReducedMotion()

  return (
    <div className="toaster" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduceMotion}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`toast toast--${t.kind}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: MOTION.base, ease: EASE } }}
            transition={{ duration: reduceMotion ? MOTION.fast : MOTION.slow, ease: EASE }}
            onPointerEnter={() => holdToast(t.id)}
            onPointerLeave={() => releaseToast(t.id)}
          >
            <span className="toast__dot" aria-hidden="true" />
            <span className="toast__message">{t.message}</span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => runToastAction(t.id)}>
                {t.action.label}
              </button>
            )}
            {t.kind === 'error' && (
              <button
                type="button"
                className="toast__close"
                aria-label="Close"
                onClick={() => dismissToast(t.id)}
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
```

```css
/* src/components/Toaster.css */
/* Toasts: bottom-centre over the main area, newest at the bottom. */

.toaster {
  position: absolute;
  bottom: 16px;
  left: 50%;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100% - 32px);
  transform: translateX(-50%);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 300px;
  max-width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: 0 14px 34px rgb(0 0 0 / 0.5);
  color: var(--text-primary);
  font-size: 12.5px;
  pointer-events: auto;
}

.toast__dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}

.toast--info .toast__dot {
  background: var(--accent);
}

.toast--warning .toast__dot {
  background: var(--color-warning);
}

.toast--error .toast__dot {
  background: var(--color-danger);
}

.toast__message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Undo: the accent drawn toward the text colour, so it reads on light themes. */
.toast__action {
  margin-left: auto;
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: color-mix(in srgb, var(--accent), var(--text-primary) 25%);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.toast__action:hover {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 8%);
}

.toast__close {
  display: inline-flex;
  padding: 2px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.toast__close:hover {
  color: var(--text-primary);
}

.toast__action:focus-visible,
.toast__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

- [ ] **Step 6: Over the main area, just above the player**

In `src/components/layout/AppShell.tsx`, replace

```tsx
// AppShell — CSS Grid root layout with sidebar | main / player areas
import type { ReactNode } from 'react'
import './AppShell.css'
```

with

```tsx
// AppShell — CSS Grid root layout with sidebar | main / player areas. The
// toasts show over the main area, just above the player.
import type { ReactNode } from 'react'
import { Toaster } from '../Toaster'
import './AppShell.css'
```

In `src/components/layout/AppShell.tsx`, replace

```tsx
      <main className="app-shell__main">{main}</main>
```

with

```tsx
      <main className="app-shell__main">
        {main}
        <Toaster />
      </main>
```

- [ ] **Step 7: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/lib/toast.ts src/components/Toaster.tsx src/components/layout/AppShell.tsx`
Expected: no errors, no warnings.

```bash
git add src/lib/toast.ts src/lib/toast.test.ts src/components/Toaster.tsx src/components/Toaster.css src/components/layout/AppShell.tsx
git commit -m "feat(ui): toasts — bottom-centre above the player, an action such as Undo, at most three"
```

---

### Task 6: The shared menu

**Files:**
- Create: `src/components/menu/menuNav.ts`, `src/components/menu/Menu.tsx`, `src/components/menu/Menu.css`
- Test: `src/components/menu/menuNav.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/menu/menuNav.test.ts
import { describe, expect, it } from 'vitest'
import { stepIndex } from './menuNav'

const entries = [
  { kind: 'action' },
  { kind: 'separator' },
  { kind: 'action', disabled: true },
  { kind: 'submenu' },
  { kind: 'action' },
]

describe('moving through a menu', () => {
  it('passes over separators and disabled items', () => {
    expect(stepIndex(entries, 0, 1)).toBe(3)
    expect(stepIndex(entries, 3, -1)).toBe(0)
  })

  it('starts at the first or the last item', () => {
    expect(stepIndex(entries, -1, 1)).toBe(0)
    expect(stepIndex(entries, -1, -1)).toBe(4)
  })

  it('wraps round at the ends', () => {
    expect(stepIndex(entries, 4, 1)).toBe(0)
    expect(stepIndex(entries, 0, -1)).toBe(4)
  })

  it('answers -1 when nothing can be chosen', () => {
    expect(stepIndex([{ kind: 'separator' }, { kind: 'action', disabled: true }], -1, 1)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/menu`
Expected: FAIL — `Failed to resolve import "./menuNav"`.

- [ ] **Step 3: ↑ ↓ through the items**

```ts
// src/components/menu/menuNav.ts
// ↑ ↓ in a menu (Interactions spec, Menus): the next item that can be
// chosen, wrapping round; separators and disabled items are passed over.

interface Steppable {
  kind: string
  disabled?: boolean
}

const choosable = (entry: Steppable) => entry.kind !== 'separator' && !entry.disabled

/**
 * The next choosable index from `from`; -1 when none is. With `from` -1
 * (nothing active yet), ↓ starts at the first item and ↑ at the last.
 */
export function stepIndex(entries: readonly Steppable[], from: number, step: 1 | -1): number {
  const n = entries.length
  const start = from === -1 && step === -1 ? n : from
  for (let i = 1; i <= n; i++) {
    const index = (((start + step * i) % n) + n) % n
    if (choosable(entries[index])) return index
  }
  return -1
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/components/menu`
Expected: PASS, 4 tests.

- [ ] **Step 5: The menu**

Notes:
- **Placement:** each panel places itself in a layout effect, writing `left`, `top` and `visibility` on the element. It measures with `offsetWidth` and `offsetHeight`, because the opening animation's scale would shrink a bounding box.
- **Focus:** it goes back to the element that had it, in a layout-effect cleanup. That cleanup runs before a dialog's `autoFocus`, so Custom… still focuses the dialog's box.
- **Submenus:** one opened by hover leaves the keys with its parent; one opened with → or Enter takes them.

```tsx
// src/components/menu/Menu.tsx
// The app's one menu (Interactions spec, Menus): it opens at the pointer,
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red. The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '../../lib/overlays'
import { Icon, type IconName } from '../Icon'
import { stepIndex } from './menuNav'
import './Menu.css'

export interface MenuAction {
  kind: 'action'
  label: string
  icon?: IconName
  /** A colour dot in the icon's place, e.g. a genre's colour. */
  swatch?: string
  /** Muted text at the right, e.g. the current genre. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** A check at the right: this is the current choice. */
  checked?: boolean
  onSelect: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
  icon?: IconName
  hint?: string
  disabled?: boolean
  entries: MenuEntry[]
}

export interface MenuSeparator {
  kind: 'separator'
}

export type MenuEntry = MenuAction | MenuSubmenu | MenuSeparator

/** Room kept between a menu and the window's edge. */
const EDGE = 8
/** A submenu stays open this long after the pointer moves to another item. */
const SUBMENU_GRACE_MS = 150

interface MenuProps {
  /** Where it opens: the pointer, for a right-click. */
  at: { x: number; y: number }
  entries: MenuEntry[]
  /** Names the menu for screen readers. */
  label: string
  onClose: () => void
}

export function Menu({ at, entries, label, onClose }: MenuProps) {
  useOverlay(true, onClose)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('.menu')) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Focus goes back to what had it (the table, for its keys) when the menu
  // closes: in a layout effect, so an item that opens a dialog still gives
  // the dialog's own box the focus after it.
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    <MenuPanel
      entries={entries}
      x={at.x}
      y={at.y}
      label={label}
      takeFocus
      onChoose={(action) => {
        onClose()
        action.onSelect()
      }}
    />,
    document.body,
  )
}

interface MenuPanelProps {
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
  label: string
  onChoose: (action: MenuAction) => void
  /** A submenu's ←: back to its parent. */
  onBack?: () => void
  /** The menu, and a submenu opened from the keyboard, take the keys. */
  takeFocus?: boolean
  /** A submenu opened from the keyboard starts on its first item. */
  startActive?: boolean
}

interface OpenSubmenu {
  index: number
  fromKeyboard: boolean
  /** Its item's box, read when it opened. */
  rect: DOMRect
}

function MenuPanel({
  entries,
  x,
  flipX,
  y,
  label,
  onChoose,
  onBack,
  takeFocus = false,
  startActive = false,
}: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(() => (startActive ? stepIndex(entries, -1, 1) : -1))
  const [open, setOpen] = useState<OpenSubmenu | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Placed once its size is known: inside the window, flipped when needed.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // offset sizes: the opening animation's scale does not count.
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    let left = x
    if (left + width > window.innerWidth - EDGE) left = (flipX ?? x) - width
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - width))
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - EDGE - height))
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.visibility = 'visible'
  }, [x, flipX, y])

  useEffect(() => {
    if (takeFocus) panelRef.current?.focus({ preventScroll: true })
  }, [takeFocus])

  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const openSubmenu = (index: number, fromKeyboard: boolean) => {
    const item = itemRefs.current[index]
    if (!item) return
    cancelClose()
    setOpen({ index, fromKeyboard, rect: item.getBoundingClientRect() })
  }

  // Back from a submenu: the keys come here again.
  const closeSubmenu = () => {
    cancelClose()
    setOpen(null)
    panelRef.current?.focus({ preventScroll: true })
  }

  const enter = (index: number, fromKeyboard: boolean) => {
    const entry = entries[index]
    if (entry.kind === 'separator' || entry.disabled) return
    if (entry.kind === 'action') onChoose(entry)
    else openSubmenu(index, fromKeyboard)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => stepIndex(entries, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (active >= 0 && entries[active].kind === 'submenu') enter(active, true)
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault()
      onBack()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (active >= 0) enter(active, true)
    }
  }

  const submenu = open !== null ? entries[open.index] : null

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className="menu"
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'separator') {
            return <div key={index} role="separator" className="menu__separator" />
          }
          const classes = ['menu__item']
          if (index === active) classes.push('menu__item--active')
          if (entry.kind === 'action' && entry.danger) classes.push('menu__item--danger')
          return (
            <div
              key={index}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              role="menuitem"
              aria-disabled={entry.disabled || undefined}
              aria-haspopup={entry.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={entry.kind === 'submenu' ? open?.index === index : undefined}
              className={classes.join(' ')}
              onPointerEnter={() => {
                setActive(entry.disabled ? -1 : index)
                if (entry.kind === 'submenu' && !entry.disabled) {
                  if (open?.index !== index) openSubmenu(index, false)
                  else cancelClose()
                } else if (open !== null) {
                  // Moving towards the submenu may cross other items: wait a moment.
                  cancelClose()
                  closeTimer.current = setTimeout(closeSubmenu, SUBMENU_GRACE_MS)
                }
              }}
              onClick={() => enter(index, false)}
            >
              <span className="menu__icon">
                {entry.kind === 'action' && entry.swatch ? (
                  <span className="menu__swatch" style={{ background: entry.swatch }} />
                ) : (
                  entry.icon && <Icon name={entry.icon} size={16} />
                )}
              </span>
              <span className="menu__label">{entry.label}</span>
              {entry.hint && <span className="menu__hint">{entry.hint}</span>}
              {entry.kind === 'action' && entry.checked && (
                <Icon name="Check" size={14} className="menu__check" />
              )}
              {entry.kind === 'submenu' && (
                <Icon name="ChevronRight" size={14} className="menu__chevron" />
              )}
            </div>
          )
        })}
      </div>
      {submenu?.kind === 'submenu' && open && (
        <Submenu
          key={open.index}
          entries={submenu.entries}
          rect={open.rect}
          label={submenu.label}
          fromKeyboard={open.fromKeyboard}
          onChoose={onChoose}
          onBack={closeSubmenu}
          onPointerEnter={() => {
            cancelClose()
            setActive(open.index)
          }}
        />
      )}
    </>
  )
}

// A submenu: a panel beside its item, an overlay of its own while open.
function Submenu({
  entries,
  rect,
  label,
  fromKeyboard,
  onChoose,
  onBack,
  onPointerEnter,
}: {
  entries: MenuEntry[]
  rect: DOMRect
  label: string
  fromKeyboard: boolean
  onChoose: (action: MenuAction) => void
  onBack: () => void
  onPointerEnter: () => void
}) {
  useOverlay(true, onBack)
  return (
    <div className="menu__sub-holder" onPointerEnter={onPointerEnter}>
      <MenuPanel
        entries={entries}
        x={rect.right + 2}
        flipX={rect.left - 2}
        y={rect.top - 6}
        label={label}
        onChoose={onChoose}
        onBack={onBack}
        takeFocus={fromKeyboard}
        startActive={fromKeyboard}
      />
    </div>
  )
}
```

```css
/* src/components/menu/Menu.css */
/* The app's one menu: a dark panel, rows of 6px corners, a submenu beside. */

/* Hidden until it is placed (Menu.tsx sets left, top and visibility). */
.menu {
  position: fixed;
  visibility: hidden;
  z-index: 10000;
  min-width: 210px;
  max-width: 320px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.55);
  color: var(--text-primary);
  font-size: var(--text-base);
  outline: none;
  animation: menu-in var(--motion-base) var(--ease);
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu {
    animation-name: menu-fade-in;
    animation-duration: var(--motion-fast);
  }
}

@keyframes menu-fade-in {
  from {
    opacity: 0;
  }
}

.menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 0 10px 0 8px;
  border-radius: var(--radius-md);
  cursor: default;
  user-select: none;
  white-space: nowrap;
}

.menu__item--active {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 9%);
}

.menu__item[aria-disabled='true'] {
  color: var(--text-muted);
}

.menu__item--danger {
  color: color-mix(in srgb, var(--color-danger) 80%, var(--text-primary));
}

.menu__icon {
  display: inline-flex;
  width: 16px;
  flex: 0 0 16px;
  color: var(--text-secondary);
}

.menu__swatch {
  width: 8px;
  height: 8px;
  margin: auto;
  border-radius: 50%;
}

.menu__item--danger .menu__icon {
  color: inherit;
}

.menu__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu__hint {
  max-width: 120px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
}

.menu__check,
.menu__chevron {
  color: var(--text-secondary);
}

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}
```

- [ ] **Step 6: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/menu`
Expected: no errors, no warnings.

```bash
git add src/components/menu
git commit -m "feat(ui): the shared menu — at the pointer, kept on screen, submenus, keys, Esc from the innermost"
```

---

### Task 7: The track table's menu items

**Files:**
- Create: `src/components/track-table/trackMenuEntries.ts`
- Test: `src/components/track-table/trackMenuEntries.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/track-table/trackMenuEntries.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Playlist, Track } from '../../types/track'
import type { MenuAction, MenuEntry, MenuSubmenu } from '../menu/Menu'
import { trackMenuEntries } from './trackMenuEntries'

const track = (id: number, extra: Partial<Track> = {}) =>
  ({ id, title: `Track ${id}`, ...extra }) as Track
const playlist = (id: number, name: string) => ({ id, name }) as Playlist
const find = (entries: MenuEntry[], label: string) =>
  entries.find((e) => e.kind !== 'separator' && e.label === label) as
    | MenuAction
    | MenuSubmenu
    | undefined

const actions = {
  onAddToPlaylist: vi.fn(),
  onAnalyze: vi.fn(),
  onSetGenre: vi.fn(),
  onCustomGenre: vi.fn(),
  onClearGenre: vi.fn(),
  onEditComment: vi.fn(),
}

describe('the track table right-click menu', () => {
  it('acts on every selected track at once', () => {
    const tracks = [track(1), track(2), track(3)]
    const entries = trackMenuEntries({
      tracks,
      playlists: [playlist(7, 'Peak Time')],
      genres: [{ name: 'House' }],
      ...actions,
    })
    const add = find(entries, 'Add to Playlist') as MenuSubmenu
    ;(add.entries[0] as MenuAction).onSelect()
    expect(actions.onAddToPlaylist).toHaveBeenCalledWith(tracks, 7)
    ;(find(entries, 'Analyze BPM & Key') as MenuAction).onSelect()
    expect(actions.onAnalyze).toHaveBeenCalledWith(tracks)
  })

  it('greys the comment with several selected', () => {
    const several = trackMenuEntries({ tracks: [track(1), track(2)], playlists: [], genres: [], ...actions })
    expect((find(several, 'Add Comment') as MenuAction).disabled).toBe(true)
    const one = trackMenuEntries({
      tracks: [track(1, { comment: 'peak' })],
      playlists: [],
      genres: [],
      ...actions,
    })
    expect((find(one, 'Edit Comment') as MenuAction).disabled).toBe(false)
  })

  it('offers Clear Genre when a selected track has one', () => {
    const none = trackMenuEntries({ tracks: [track(1), track(2)], playlists: [], genres: [], ...actions })
    expect(find(none, 'Clear Genre')).toBeUndefined()
    const some = trackMenuEntries({
      tracks: [track(1), track(2, { genre: 'House' })],
      playlists: [],
      genres: [],
      ...actions,
    })
    expect(find(some, 'Clear Genre')).toBeDefined()
  })

  it('checks the genre every selected track shares', () => {
    const genres = [{ name: 'House' }, { name: 'Techno' }]
    const shared = trackMenuEntries({
      tracks: [track(1, { genre: 'House' }), track(2, { genre: 'House' })],
      playlists: [],
      genres,
      ...actions,
    })
    const setGenre = find(shared, 'Set Genre') as MenuSubmenu
    expect(setGenre.hint).toBe('House')
    expect((setGenre.entries[0] as MenuAction).checked).toBe(true)
    const mixed = trackMenuEntries({
      tracks: [track(1, { genre: 'House' }), track(2, { genre: 'Techno' })],
      playlists: [],
      genres,
      ...actions,
    })
    expect((find(mixed, 'Set Genre') as MenuSubmenu).hint).toBeUndefined()
  })

  it('shows Delete from playlist only where it is given, in red', () => {
    expect(find(trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions }), 'Delete from playlist')).toBeUndefined()
    const inPlaylist = trackMenuEntries({
      tracks: [track(1)],
      playlists: [],
      genres: [],
      ...actions,
      onRemoveFromPlaylist: vi.fn(),
    })
    expect((find(inPlaylist, 'Delete from playlist') as MenuAction).danger).toBe(true)
  })

  it('greys Add to Playlist with no playlists to add to', () => {
    const entries = trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions })
    expect((find(entries, 'Add to Playlist') as MenuAction).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/track-table/trackMenuEntries.test.ts`
Expected: FAIL — `Failed to resolve import "./trackMenuEntries"`.

- [ ] **Step 3: The items**

```ts
// src/components/track-table/trackMenuEntries.ts
// The track table's right-click menu (track table spec, Right-click menu):
// every item acts on all the selected tracks at once. Add / Edit Comment and
// Generate AI Playlist take one track: greyed with several selected.
import type { Playlist, Track } from '../../types/track'
import type { MenuEntry } from '../menu/Menu'

export interface TrackMenuActions {
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onAnalyze?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  /** Set Genre ▸ Custom…: asks for a name. */
  onCustomGenre?: (tracks: Track[]) => void
  onClearGenre?: (tracks: Track[]) => void
  /** Only in a playlist. */
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onEditComment?: (track: Track) => void
  onGenerateAIPlaylist?: (track: Track) => void
}

interface TrackMenuInput extends TrackMenuActions {
  /** The selection, in the table's order: at least one track. */
  tracks: Track[]
  /** The playlists to add to: no folders, and not the one shown. */
  playlists: Playlist[]
  genres: Array<{ name: string; color?: string }>
}

export function trackMenuEntries({
  tracks,
  playlists,
  genres,
  ...actions
}: TrackMenuInput): MenuEntry[] {
  const one = tracks.length === 1
  // The genre every selected track has, if they share one.
  const genre = tracks.every((t) => t.genre === tracks[0].genre) ? tracks[0].genre : undefined
  const entries: MenuEntry[] = []

  if (actions.onAddToPlaylist) {
    const add = actions.onAddToPlaylist
    entries.push(
      playlists.length > 0
        ? {
            kind: 'submenu',
            label: 'Add to Playlist',
            icon: 'ListPlus',
            entries: playlists.map((p) => ({
              kind: 'action',
              label: p.name,
              icon: 'ListMusic',
              onSelect: () => add(tracks, p.id),
            })),
          }
        : {
            kind: 'action',
            label: 'Add to Playlist',
            icon: 'ListPlus',
            hint: 'no playlists',
            disabled: true,
            onSelect: () => {},
          },
    )
  }

  if (actions.onAnalyze) {
    const analyze = actions.onAnalyze
    entries.push({
      kind: 'action',
      label: 'Analyze BPM & Key',
      icon: 'Zap',
      onSelect: () => analyze(tracks),
    })
  }

  if (actions.onSetGenre) {
    const setGenre = actions.onSetGenre
    const custom = actions.onCustomGenre
    entries.push({
      kind: 'submenu',
      label: 'Set Genre',
      icon: 'Tag',
      hint: genre,
      entries: [
        ...genres.map(
          (g): MenuEntry => ({
            kind: 'action',
            label: g.name,
            icon: 'Music',
            swatch: g.color,
            checked: g.name === genre,
            onSelect: () => setGenre(tracks, g.name),
          }),
        ),
        ...(genres.length > 0 ? [{ kind: 'separator' } as const] : []),
        {
          kind: 'action',
          label: 'Custom…',
          icon: 'Pencil',
          onSelect: () => custom?.(tracks),
        },
      ],
    })
  }

  if (actions.onClearGenre && tracks.some((t) => t.genre)) {
    const clear = actions.onClearGenre
    entries.push({ kind: 'action', label: 'Clear Genre', icon: 'X', onSelect: () => clear(tracks) })
  }

  if (actions.onEditComment) {
    const edit = actions.onEditComment
    entries.push({
      kind: 'action',
      label: one && tracks[0].comment ? 'Edit Comment' : 'Add Comment',
      icon: 'MessageSquare',
      disabled: !one,
      onSelect: () => edit(tracks[0]),
    })
  }

  if (actions.onRemoveFromPlaylist) {
    const remove = actions.onRemoveFromPlaylist
    entries.push(
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Delete from playlist',
        icon: 'Trash2',
        danger: true,
        onSelect: () => remove(tracks),
      },
    )
  }

  if (actions.onGenerateAIPlaylist) {
    const generate = actions.onGenerateAIPlaylist
    entries.push(
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Generate AI Playlist',
        icon: 'Sparkles',
        disabled: !one,
        onSelect: () => generate(tracks[0]),
      },
    )
  }

  return entries
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/components/track-table/trackMenuEntries.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/track-table/trackMenuEntries.ts src/components/track-table/trackMenuEntries.test.ts
git commit -m "feat(tracks): the right-click menu's items, acting on every selected track"
```

---

### Task 8: The table selects several and its menu acts on them; App acts on them at once

`TrackTable`'s handler props change from one track to a list, so `TrackTable.tsx` and `App.tsx` change together in this task.

**Files:**
- Modify: `src/components/TrackTable.tsx`, `src/components/TrackTable.css`, `src/App.tsx`

- [ ] **Step 1: Imports, props, state**

In `src/components/TrackTable.tsx`, replace

```tsx
  forwardRef,
  type CSSProperties,
} from 'react'
```

with

```tsx
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
```

In `src/components/TrackTable.tsx`, replace

```tsx
import { Equalizer } from './Equalizer'
import { TrackCover } from './track-table/TrackCover'
```

with

```tsx
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { isOverlayOpen } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
  selectOnly,
  selectedTracks,
  trimSelection,
} from '../lib/trackTable/selection'
```

In `src/components/TrackTable.tsx`, replace

```tsx
import { trackCountLabel } from '../lib/trackTable/count'
```

with

```tsx
import { trackCountLabel } from '../lib/trackTable/count'
import { tracksSubject } from '../lib/trackTable/bulkMessages'
```

In `src/components/TrackTable.tsx`, replace

```tsx
  onAnalyzeTrack?: (track: Track) => void
  onAddToPlaylist?: (track: Track, playlistId: number) => void
  onRemoveFromPlaylist?: (track: Track) => void
  onSetGenre?: (track: Track, genre: string) => void
  onClearGenre?: (track: Track) => void
```

with

```tsx
  // The right-click menu's actions: each takes every selected track at once.
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
```

In `src/components/TrackTable.tsx`, replace

```tsx
      onTrackDoubleClick,
      onAnalyzeTrack,
```

with

```tsx
      onTrackDoubleClick,
      onAnalyzeTracks,
```

In `src/components/TrackTable.tsx`, replace

```tsx
    const parentRef = useRef<HTMLDivElement>(null)
    const contextMenuRef = useRef<HTMLDivElement>(null)
    const playlistSubmenuTimeout = useRef<number | null>(null)
    const genreSubmenuTimeout = useRef<number | null>(null)
    const analyzeSubmenuTimeout = useRef<number | null>(null)
```

with

```tsx
    const parentRef = useRef<HTMLDivElement>(null)
```

In `src/components/TrackTable.tsx`, replace

```tsx
    // Row selection state
    const [selectedRowId, setSelectedRowId] = useState<number | null>(null)
```

with

```tsx
    // The rows selected (track table spec, Selecting several)
    const [selection, setSelection] = useState(NO_SELECTION)
```

In `src/components/TrackTable.tsx`, replace everything from the line

```tsx
    // Context menu (right-click on track row)
```

up to, not including, the line

```tsx
    // Sort state — default: sort by title ascending
```

— the old menu's state: the context menu, its three submenus and their timeouts, the custom genre input, the comment editor, the playlists, and the effects that close submenus — with

```tsx
    // The right-click menu, at the pointer; it acts on the selection.
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
    const closeMenu = useCallback(() => setMenuAt(null), [])

    // Set Genre ▸ Custom…: a name for the selected tracks
    const [customGenreInput, setCustomGenreInput] = useState<{
      tracks: Track[]
      value: string
    } | null>(null)

    // Comment editor state
    const [commentInput, setCommentInput] = useState<{
      visible: boolean
      track: Track | null
      value: string
    }>({ visible: false, track: null, value: '' })

    // The playlists to add to: no folders, and not the one shown
    const actualPlaylists = useMemo(
      () =>
        playlists.filter(
          (p) => p.playlist_type !== 'folder' && p.id !== selectedPlaylistId,
        ),
      [playlists, selectedPlaylistId],
    )
```

- [ ] **Step 2: Rows no longer shown leave the selection; the table's keys**

In `src/components/TrackTable.tsx`, replace

```tsx
    const handleSort = (column: SortColumn) => setSort(nextSort(shownSort, column))
```

with

```tsx
    const handleSort = (column: SortColumn) => setSort(nextSort(shownSort, column))

    // Rows no longer shown leave the selection: adjusted while rendering, when
    // the rows shown change (search, filter, sort, a reload).
    const shownIds = useMemo(() => sortedTracks.map((t) => t.id), [sortedTracks])
    const [selectionRows, setSelectionRows] = useState(shownIds)
    if (selectionRows !== shownIds) {
      setSelectionRows(shownIds)
      setSelection((current) => trimSelection(current, shownIds))
    }
    const menuTracks = useMemo(
      () => (menuAt ? selectedTracks(selection, sortedTracks) : []),
      [menuAt, selection, sortedTracks],
    )
```

In `src/components/TrackTable.tsx`, replace

```tsx
    // Expose scroll to current track method via ref
```

with

```tsx
    // The focused table's keys (Interactions spec, Keyboard): ↑ ↓ move the
    // selection (Shift extends it), Enter plays, ⌘A selects every row shown,
    // Esc clears. Not while a menu, popover or dialog is open (Esc is
    // theirs), nor from a control inside a row.
    const handleTableKeys = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget || isOverlayOpen()) return
      const key = event.key
      if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelection((current) => selectAll(current, shownIds))
      } else if (key === 'Escape' && selection.ids.size > 0) {
        event.preventDefault()
        setSelection(NO_SELECTION)
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault()
        const next = moveCursor(selection, shownIds, key === 'ArrowDown' ? 1 : -1, event.shiftKey)
        setSelection(next)
        const index = next.cursor === null ? -1 : shownIds.indexOf(next.cursor)
        if (index !== -1) virtualizer.scrollToIndex(index, { align: 'auto' })
      } else if (key === 'Enter' && !event.repeat) {
        const index = selection.cursor === null ? -1 : shownIds.indexOf(selection.cursor)
        if (index === -1) return
        event.preventDefault()
        onTrackDoubleClick?.(sortedTracks[index], sortedTracks, index)
      }
    }

    // Expose scroll to current track method via ref
```

In `src/components/TrackTable.tsx`, replace

```tsx
    const rate = onUpdateTrack
      ? (track: Track, rating: number) => onUpdateTrack({ ...track, rating })
      : undefined
```

with

```tsx
    const rate = onUpdateTrack
      ? (track: Track, rating: number) => onUpdateTrack({ ...track, rating })
      : undefined

    const saveCustomGenre = () => {
      const genre = customGenreInput?.value.trim()
      if (!customGenreInput || !genre || !onSetGenre) return
      onSetGenre(customGenreInput.tracks, genre)
      setCustomGenreInput(null)
    }
```

- [ ] **Step 3: The count, the focusable scroll area, the rows**

In `src/components/TrackTable.tsx`, replace

```tsx
            {trackCountLabel(
              sortedTracks.length,
              totalCount ?? tracks.length,
              narrowed,
            )}
```

with

```tsx
            {trackCountLabel(
              sortedTracks.length,
              totalCount ?? tracks.length,
              narrowed,
              selection.ids.size,
            )}
```

In `src/components/TrackTable.tsx`, replace

```tsx
        <div
          ref={parentRef}
          className="track-table-scroll-area"
          style={{
```

with

```tsx
        <div
          ref={parentRef}
          className="track-table-scroll-area"
          tabIndex={0}
          onKeyDown={handleTableKeys}
          style={{
```

In `src/components/TrackTable.tsx`, replace

```tsx
className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selectedRowId === track.id ? 'data-row--selected' : ''}`}
```

with

```tsx
className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selection.ids.has(track.id) ? 'data-row--selected' : ''}`}
```

In `src/components/TrackTable.tsx`, replace

```tsx
                    onClick={() => {
                      setSelectedRowId(track.id)
                      onTrackClick?.(track)
                    }}
```

with

```tsx
                    // Shift-click selects rows, not the text in them.
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault()
                    }}
                    onClick={(e) => {
                      setSelection((current) =>
                        clickRow(
                          current,
                          track.id,
                          { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey },
                          shownIds,
                        ),
                      )
                      // The table takes the keys (↑ ↓, ⌘A, Esc, Enter).
                      parentRef.current?.focus({ preventScroll: true })
                      onTrackClick?.(track)
                    }}
```

In `src/components/TrackTable.tsx`, replace

```tsx
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({
                        track,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }}
```

with

```tsx
                    onContextMenu={(e) => {
                      e.preventDefault()
                      // On a row not selected, it selects that row alone first.
                      if (!selection.ids.has(track.id)) setSelection(selectOnly(track.id))
                      parentRef.current?.focus({ preventScroll: true })
                      setMenuAt({ x: e.clientX, y: e.clientY })
                    }}
```

- [ ] **Step 4: The menu, and the genre dialog for several**

In `src/components/TrackTable.tsx`, replace everything from the line

```tsx
        {/* Right-click context menu */}
```

up to, not including, the line

```tsx
        {/* Custom Genre Input Modal */}
```

— the old right-click menu and its two submenus (Playlist, Genre) — with

```tsx
        {/* The right-click menu: acts on every selected track */}
        {menuAt && menuTracks.length > 0 && (
          <Menu
            at={menuAt}
            label={menuTracks.length === 1 ? 'Track' : `${menuTracks.length} tracks`}
            onClose={closeMenu}
            entries={trackMenuEntries({
              tracks: menuTracks,
              playlists: actualPlaylists,
              genres: genreDefinitions,
              onAddToPlaylist,
              onAnalyze: onAnalyzeTracks,
              onSetGenre,
              onCustomGenre: (selected) =>
                setCustomGenreInput({
                  tracks: selected,
                  value:
                    selected.every((t) => t.genre === selected[0].genre)
                      ? selected[0].genre || ''
                      : '',
                }),
              onClearGenre,
              onRemoveFromPlaylist:
                selectedPlaylistId != null ? onRemoveFromPlaylist : undefined,
              onEditComment: editComment,
              onGenerateAIPlaylist,
            })}
          />
        )}
```

In `src/components/TrackTable.tsx`, replace everything from the line

```tsx
        {/* Custom Genre Input Modal */}
```

up to, not including, the line

```tsx
        {/* Comment Editor Modal */}
```

— the custom genre modal — with

```tsx
        {/* Set Genre ▸ Custom…: a name for the selected tracks */}
        {customGenreInput && onSetGenre && (
          <div className="modal-overlay" onClick={() => setCustomGenreInput(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Set Genre</h3>
              <p className="modal-subtitle">{tracksSubject(customGenreInput.tracks)}</p>
              <input
                type="text"
                className="modal-input"
                placeholder="Enter genre name..."
                value={customGenreInput.value}
                onChange={(e) =>
                  setCustomGenreInput({ ...customGenreInput, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCustomGenre()
                  else if (e.key === 'Escape') setCustomGenreInput(null)
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={() => setCustomGenreInput(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={saveCustomGenre}
                  disabled={!customGenreInput.value.trim()}
                >
                  Set Genre
                </button>
              </div>
            </div>
          </div>
        )}
```

Run: `grep -n "contextMenu\|selectedRowId\|Submenu\|onAnalyzeTrack\b" src/components/TrackTable.tsx`
Expected: nothing.

- [ ] **Step 5: The styles**

In `src/components/TrackTable.css`, replace

```css
/* Scroll area: heads and rows scroll together, sideways too */
.track-table-scroll-area {
  position: relative;
  min-height: 0;
  min-width: 0;
}
```

with

```css
/* Scroll area: heads and rows scroll together, sideways too. It takes the
   keys when a row is clicked; the selected rows show it, not a ring. */
.track-table-scroll-area {
  position: relative;
  min-height: 0;
  min-width: 0;
}

.track-table-scroll-area:focus {
  outline: none;
}
```

In `src/components/TrackTable.css`, replace

```css
/* Context menu improvements (track table uses same classes as FolderTree) */
```

with

```css
/* The sidebar's menus (FolderTree) still use these until the Interactions
   plan moves them to the shared Menu; the track table's menu is Menu. */
```

In `src/components/TrackTable.css`, delete

```css
/* Ensure context menu and button items are readable (no white-on-white) */
.track-table-container .context-menu {
  background: var(--bg-secondary);
}
```

- [ ] **Step 6: App acts on the selection, with one toast and Undo**

In `src/App.tsx`, replace

```tsx
import { tauriApi } from './lib/tauri-api'
```

with

```tsx
import { tauriApi } from './lib/tauri-api'
import { toast } from './lib/toast'
import {
  addedMessage,
  alreadyMessage,
  genreClearedMessage,
  genreSetMessage,
  genreSnapshot,
  removedMessage,
} from './lib/trackTable/bulkMessages'
```

In `src/App.tsx`, replace

```tsx
  // Analyze a single track (BPM + Key) — uses batch for decode-once benefit
  async function handleAnalyzeTrack(track: Track) {
    try {
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: 1,
        currentTrackName:
          track.title || track.file_path.split('/').pop() || 'Unknown',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })
      await new Promise((r) => setTimeout(r, 0))
      await tauriApi.analyzeTracksBatch([track.id], true)
```

with

```tsx
  // Analyze the selected tracks (BPM + Key) in one batch — decoded once each
  async function handleAnalyzeTracks(selected: Track[]) {
    const first = selected[0]
    try {
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: selected.length,
        currentTrackName:
          first.title || first.file_path.split('/').pop() || 'Unknown',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })
      await new Promise((r) => setTimeout(r, 0))
      await tauriApi.analyzeTracksBatch(
        selected.map((t) => t.id),
        true,
      )
```

In `src/App.tsx`, replace everything from the line

```tsx
  // Add track to playlist
```

up to, not including, the line

```tsx
  // Persist a track update (rating, comment, etc.) and refresh the list
```

— the four single-track handlers (`handleAddToPlaylist`, `handleRemoveFromPlaylist`, `handleSetGenre`, `handleClearGenre`) — with

```tsx
  // The track table's right-click menu acts on its selection at once: one
  // call, one toast — with Undo, which puts back exactly what it changed —
  // and one reload of the view.
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

  // An Undo: put it back, then reload the view shown by then.
  function undoing(putBack: () => Promise<unknown>) {
    return {
      label: 'Undo',
      run: () => {
        putBack()
          .then(() => loadTracksRef.current())
          .catch((err) => toast(`Couldn't undo: ${errorText(err)}`, { kind: 'error' }))
      },
    }
  }

  async function handleAddToPlaylist(selected: Track[], playlistId: number) {
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    try {
      const { added, already } = await tauriApi.addTracksToPlaylist(
        playlistId,
        selected.map((t) => t.id),
      )
      await loadPlaylists()
      if (added.length === 0) {
        toast(alreadyMessage(selected, name), { kind: 'warning' })
        return
      }
      const addedTracks = selected.filter((t) => added.includes(t.id))
      toast(addedMessage(addedTracks, already.length, name), {
        action: undoing(async () => {
          await tauriApi.removeTracksFromPlaylist(playlistId, added)
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't add to ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Delete from the playlist shown; Undo adds them back in their old places.
  async function handleRemoveFromPlaylist(selected: Track[]) {
    if (selectedPlaylistId == null) return
    const playlistId = selectedPlaylistId
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    const ids = selected.map((t) => t.id)
    try {
      // The playlist's own order, not the table's sorted view.
      const before = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
      await tauriApi.removeTracksFromPlaylist(playlistId, ids)
      await loadTracks(null, playlistId)
      await loadPlaylists()
      toast(removedMessage(selected, name), {
        action: undoing(async () => {
          await tauriApi.addTracksToPlaylist(playlistId, ids)
          await tauriApi.reorderPlaylistTracks(playlistId, before)
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
      await tauriApi.bulkSetGenre(
        selected.map((t) => t.id),
        genre,
      )
      await loadTracks()
      await loadGenreDefinitions() // in case it is a new genre
      toast(genreSetMessage(selected, genre), {
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't set the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleClearGenre(selected: Track[]) {
    const withGenre = selected.filter((t) => t.genre)
    const before = genreSnapshot(withGenre)
    try {
      await tauriApi.bulkClearGenre(withGenre.map((t) => t.id))
      await loadTracks()
      toast(genreClearedMessage(withGenre), {
        kind: 'info',
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }
```

In `src/App.tsx`, replace

```tsx
                    onAnalyzeTrack={handleAnalyzeTrack}
```

with

```tsx
                    onAnalyzeTracks={handleAnalyzeTracks}
```

- [ ] **Step 7: Check and commit**

Run: `npx tsc --noEmit -p . && npx vitest run 2>&1 | grep -E "Tests "`
Expected: no type errors; `494 passed`.

Run: `npx eslint src/components/TrackTable.tsx src/App.tsx 2>&1 | tail -3`
Expected: only the existing warnings, TrackTable's `incompatible-library` on `useVirtualizer` and App's two on its first `useEffect`. Then run `npx eslint src 2>&1 | tail -2`: still `✖ 22 problems (10 errors, 12 warnings)`.

Run: `npx vite build 2>&1 | tail -1`
Expected: `✓ built in …`.

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css src/App.tsx
git commit -m "feat(tracks): select several rows, and the right-click menu acts on all of them — one call, one toast with Undo"
```

---

### Task 9: The Interactions spec knows what is built

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-interactions-design.md`

- [ ] **Step 1: The Undo table and "What this plan builds"**

In the Undo table's row `| Set genre / Clear genre | … | this plan |`, change the last cell to `track table plan 4`.

Under *What this plan builds*, after the paragraph that starts **Order**, add:

```markdown
Built already by track table plan 4: `Menu` (without the confirm in the
menu's place), `toast()` and the `Toaster` (without the detail on hover,
which plan 5 adds), and `restore_track_genres` with Set / Clear genre's Undo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-04-interactions-design.md
git commit -m "docs(spec): the menu, the toasts and the genre Undo are built by track table plan 4"
```

---

### Task 10: Check in the app (WebKit)

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Run the app**: `npm run tauri dev`. The Rust commands changed, so a running dev app rebuilds; let it.

- [ ] **Step 2: The checklist, by hand**
- **Selecting:**
  - click, ⌘-click and Shift-click in All Tracks; the count reads "N selected · …";
  - ⌘A, then type in the search: the count follows the rows shown;
  - Esc clears the selection;
  - ↑ ↓ move, ⇧↓ extends, Enter plays.
- **Add to Playlist ▸** with 12 selected: one toast, "Added 12 tracks to …", and the playlist's count in the sidebar goes up. Add the same tracks again: "All 12 tracks are already in …". Undo the first add: the playlist is as before.
- **Set Genre ▸ House** on 50 tracks, some of which have a genre from their tags: one toast. Undo: every genre is back, and the tag genres still show as tag genres (the genre column, the sidebar's genre counts).
- **Clear Genre** on a mix of tracks with and without a genre: "Genre cleared for N tracks", where N counts the tracks that had one. Undo restores them.
- **In a playlist, Delete from playlist** on 3 tracks: they go, and one toast. Undo: they are back, and the playlist's stored order comes back with them. (The table always sorts by a column, so that order shows once plan 6 adds the unsorted view.)
- **Analyze BPM & Key** on 5 tracks: the analysis bar counts 5.
- **Add Comment** is grey with several selected and works with one. Custom… opens the dialog for the whole selection.
- **The menu:**
  - near the window's right and bottom edges it stays on screen;
  - submenus open on hover and with →; Esc closes the submenu first;
  - a press outside closes it.
- **Toasts:**
  - they sit just above the player, centred over the main area;
  - one under the mouse waits;
  - an error stays until ✕.
- **Dawn (light theme):** the menu and the toasts read well.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add <the files fixed>
git commit -m "fix(tracks): <what the hand check found>"
```

Skip this step if nothing needed fixing.
