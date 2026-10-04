# Track Table 5 of 6: Move to Folder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click → **Move to folder ▸** moves the selected tracks' files on disk into another library folder. Each track keeps its id, analysis, history, playlists and cues. One toast follows; it shows why tracks were skipped on hover and offers Undo.

**Architecture:**
- **Backend** (`src-tauri/src/commands/move_tracks.rs`):
  - `list_library_folders()` lists every folder, roots included, with labels like "Music / House / Deep".
  - `move_tracks_to_folder(track_ids, folder)` is `async`, with the file work on `spawn_blocking`:
    - **on the same disk**, each file is renamed and its path updated under the DB lock, taken per file;
    - **across disks**, each file is copied outside the lock to `name.recodeck-moving` (no audio extension, so the watcher and the scanner pass it over); then, under the lock, the copy is renamed and the path updated; then the original is deleted.
  - It answers `{ moved: [{ id, newPath }], skipped: [{ id, reason }] }`.
- **Frontend:**
  - **The menu:** the shared Menu gets a searchable submenu (a box at the top narrows the list), and `trackMenuEntries` adds Move to folder ▸. The folder every selected track already shares is greyed.
  - **App:**
    - leaves the track playing (and the one coming in during a crossfade) where it is;
    - moves the rest;
    - patches the player's queue paths, forgets the moved tracks' covers, and reloads the view and the folder tree;
    - toasts the result. Undo moves the tracks back, once per folder they came from.
  - **The player store** gains `patchTrackPaths` and a `playRequest` counter. NowPlayingBar loads a track when a play is asked for or the track itself changes, not on every queue change. Without that, the patch would restart the song.

**Tech Stack:** Rust (std::fs, walkdir, rusqlite, Tauri async commands, tempfile in tests), React 19, TypeScript, zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-track-table-design.md`, *Right-click menu* (Move to folder ▸) and *Testing*. Also `docs/superpowers/specs/2026-10-04-interactions-design.md`: the Undo table's Move to folder row, and the toasts' detail on hover. Read them first.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is built by six plans:** 1 toolbar and filter, 2 columns, 3 artwork, 4 selection, menu and toasts (all done); **5 this plan**; 6 dragging tracks to playlists and folders, and reordering a playlist.

**Decisions, beyond the spec's letter:**
- **The player's own tracks are skipped by App, not the backend:** the current track (playing or paused), and during a crossfade the incoming one. `audioPlayer.incomingTrackId` is new. App reports them as "playing now".
- **Skip reasons:**
  - `already_there`;
  - `name_taken` (a file with that name is in the folder);
  - `missing` (no file on disk, or the track is gone);
  - `failed` (the disk or the database refused; the file stays). A path the database will not take — another track row already holds it — counts as `failed`, and the file is renamed back.
- **What loads the track:**
  - **`playRequest`** goes up on setQueue, playNext, playPrevious, playTrackAtIndex and `applyQueueAction('play_now')`. NowPlayingBar's load effect depends on it and on the current track's id and path.
  - **What changes:** shuffling and adding to the queue no longer restart the song from 0:00, as they did, and neither does a path patch. A double click still restarts it.
- **The folder list** is read each time the right-click menu opens (folders come and go on disk), and the last list shows meanwhile. The searchable submenu takes the keys at once, so typing narrows it.
- **The toast:**
  - **What it says:** "Moved 3 tracks to House". With skips it says "Moved 2 · 1 skipped (playing now)", giving the reason only when every skip shares it. When nothing moved, it says "Nothing moved · …".
  - **On hover,** it lists one line per skipped track, "Juz Listen' — playing now" (6 lines at most, then "and N more").
  - **While a move takes more than 400ms** (a copy across disks), an info toast says "Moving … to …".
- **After a move:**
  - the moved tracks' thumbnails and full artwork are forgotten, because a folder's `cover.jpg` may now be another one;
  - the folder tree refreshes with `invalidateAll`, which keeps what is expanded. Renaming a folder uses `refreshRoot`, which does not.
- **Undo** moves the tracks back once per folder they came from, through the same path. It only toasts when some stayed ("… skipped (…)" with the detail).
- **The interactions spec's toast detail is built here** (plan 4 left it out).

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at fd77f37; the same blocks, applied to a clean `git archive`, reproduce it file for file.
- **Builds and tests:**
  - `cargo test --lib`: 435 passed, 7 of them new (temp dirs: a move, the skips, a failed update renamed back, a copy across disks with its temporary name, a failed copy that leaves no copy and the original, the folder outside the library, the folder list);
  - clippy shows no new warnings; `tsc` passes, and so does eslint, with only existing warnings;
  - `vitest`: 13 new tests; the scratch tree counted 493 passed; the repo will count 507;
  - `vite build` passes.
- **In WebKit** (the plan 4 test page, with `list_library_folders` mocked):
  - **The list:** Move to folder ▸ opens the list with its box focused, and the folder the 3 selected tracks share is grey.
  - **Narrowing:** "tech" narrows it to the 3 Techno folders. ↓↓ Enter moved them to the second, closed the menu, and gave the table its keys back. "afro" then Enter chose the only match.
  - **Edge cases:** "zzz" shows "No folder matches", and Esc closes the submenu. → from the keyboard opens it with the box focused; ← on the empty box goes back.
  - **The toast:** its detail is hidden until hovered.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/commands/move_tracks.rs` | create | the folder list, the move (same disk, across disks), its tests |
| `src-tauri/src/db/mod.rs` | modify | `set_track_file_path` |
| `src-tauri/src/commands/library.rs`, `mod.rs`, `src-tauri/src/lib.rs` | modify | the root helpers made `pub(crate)`; the module and its commands registered |
| `src/types/track.ts`, `src/lib/tauri-api.ts` | modify | `LibraryFolder`, `MoveReport`; the two calls |
| `src/lib/trackTable/moveMessages.ts` (+ test) | create | the folder a track is in, the toast's words and detail, the Undo groups |
| `src/lib/toast.ts` (+ test), `src/components/Toaster.tsx`, `.css` | modify | the detail on hover |
| `src/lib/thumbnails/queue.ts` (+ test) | modify | `forget(id)` |
| `src/store/playerStore.ts` (+ test), `src/components/layout/NowPlayingBar.tsx`, `src/lib/audioPlayer.ts` | modify | `playRequest`, `patchTrackPaths`; the load effect; `incomingTrackId` |
| `src/components/menu/Menu.tsx`, `.css` | modify | the searchable submenu |
| `src/components/track-table/trackMenuEntries.ts` (+ test), `useLibraryFolders.ts`, `src/components/TrackTable.tsx` | modify / create | Move to folder ▸ |
| `src/App.tsx` | modify | the move, its toast and Undo |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign`; `git status --short --untracked-files=no` shows only `.claude/settings.local.json` and `.planning/STATE.md` (leave them).
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit -p .` — 494 passed, no type errors. `npx eslint src 2>&1 | tail -2` — `✖ 22 problems (10 errors, 12 warnings)`. `cd src-tauri && cargo test --lib 2>&1 | grep "test result"; cd ..` — 428 passed.

---

### Task 1: Moving files, and the folder list (Rust)

**Files:** Create `src-tauri/src/commands/move_tracks.rs`; modify `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: The database writes the new path**

In `src-tauri/src/db/mod.rs`, replace

```rust
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
```

with

```rust
            added.push(track_id);
        }
        tx.commit()?;
        Ok((added, already))
    }

    /// Point a track at its file's new place (Move to folder). Its id, and so
    /// its analysis, history, playlists and cues, stay.
    pub fn set_track_file_path(&self, track_id: i64, file_path: &str) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE tracks SET file_path = ? WHERE id = ?",
            params![file_path, track_id],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// Remove tracks from a playlist in one transaction. Answers how many were
    /// in it.
    pub fn remove_tracks_from_playlist(&self, playlist_id: i64, track_ids: &[i64]) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut removed = 0;
        for &track_id in track_ids {
```

- [ ] **Step 2: The root helpers, for the new module**

In `src-tauri/src/commands/library.rs`, replace

```rust
        ));
    }
    Ok(trimmed.to_string())
}

/// Load registered library root folders from settings.
fn library_roots(db: &Database) -> Result<Vec<String>, AppError> {
    let raw = db
        .get_setting("library_folders")
        .map_err(|e| AppError::Database(format!("Failed to read library_folders: {}", e)))?;
    match raw {
        Some(json) => serde_json::from_str::<Vec<String>>(&json).map_err(|e| {
            AppError::Internal(format!("Invalid library_folders JSON: {}", e))
        }),
        None => Ok(Vec::new()),
    }
}

/// Canonicalize and confirm `target` sits inside one of the registered library roots.
fn assert_within_library_roots(db: &Database, target: &Path) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(target)
        .map_err(|e| AppError::Validation(format!("Invalid path '{}': {}", target.display(), e)))?;
    let roots = library_roots(db)?;
    let within = roots.iter().any(|folder| {
        std::fs::canonicalize(folder)
            .map(|canon| canonical.starts_with(&canon))
```

with

```rust
        ));
    }
    Ok(trimmed.to_string())
}

/// Load registered library root folders from settings.
pub(crate) fn library_roots(db: &Database) -> Result<Vec<String>, AppError> {
    let raw = db
        .get_setting("library_folders")
        .map_err(|e| AppError::Database(format!("Failed to read library_folders: {}", e)))?;
    match raw {
        Some(json) => serde_json::from_str::<Vec<String>>(&json).map_err(|e| {
            AppError::Internal(format!("Invalid library_folders JSON: {}", e))
        }),
        None => Ok(Vec::new()),
    }
}

/// Canonicalize and confirm `target` sits inside one of the registered library roots.
pub(crate) fn assert_within_library_roots(db: &Database, target: &Path) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(target)
        .map_err(|e| AppError::Validation(format!("Invalid path '{}': {}", target.display(), e)))?;
    let roots = library_roots(db)?;
    let within = roots.iter().any(|folder| {
        std::fs::canonicalize(folder)
            .map(|canon| canonical.starts_with(&canon))
```

- [ ] **Step 3: The module, with its tests**

```rust
// Moving tracks into another library folder (track table spec, Move to
// folder): each file moves on disk, keeping its name, and only the track's
// file_path changes — its id, and with it its analysis, history, playlists
// and cues, stay. The database lock is taken per file and never held during a
// copy: almost every database command runs on the main thread, so a long hold
// would freeze the window.

use crate::commands::library::{assert_within_library_roots, library_roots, AppState};
use crate::db::Database;
use crate::error::AppError;
use serde::Serialize;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

/// Added to a file's name while it is copied across disks. The name then has
/// no audio extension, so the watcher and the scanner pass it over.
const MOVING_SUFFIX: &str = ".recodeck-moving";

/// A folder of the library: its path as tracks store it, and a label such
/// as "Music / House / Deep".
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LibraryFolder {
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MovedTrack {
    pub id: i64,
    pub new_path: String,
}

/// Why a track was not moved.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// Its file is in that folder already.
    AlreadyThere,
    /// A file with its name is in that folder.
    NameTaken,
    /// Its file is not on disk (or the track is gone).
    Missing,
    /// The disk or the database refused; the file stays where it was.
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SkippedTrack {
    pub id: i64,
    pub reason: SkipReason,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct MoveReport {
    pub moved: Vec<MovedTrack>,
    pub skipped: Vec<SkippedTrack>,
}

/// A path as tracks store it: forward slashes on Windows too (as the scanner
/// stores them).
fn stored_path(path: &Path) -> String {
    let text = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        text.replace('\\', "/")
    } else {
        text
    }
}

/// Every folder of the library, the roots included, hidden folders left out,
/// sorted by label.
pub fn library_folders(roots: &[String]) -> Vec<LibraryFolder> {
    let mut folders = Vec::new();
    for root in roots {
        let root_path = Path::new(root);
        if !root_path.is_dir() {
            continue;
        }
        let root_name = root_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.clone());
        let walk = WalkDir::new(root_path)
            .follow_links(true)
            .into_iter()
            .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));
        for entry in walk.filter_map(Result::ok).filter(|e| e.file_type().is_dir()) {
            let mut label = root_name.clone();
            if let Ok(relative) = entry.path().strip_prefix(root_path) {
                for part in relative.components() {
                    label.push_str(" / ");
                    label.push_str(&part.as_os_str().to_string_lossy());
                }
            }
            folders.push(LibraryFolder { path: stored_path(entry.path()), label });
        }
    }
    folders.sort_by_key(|folder| folder.label.to_lowercase());
    folders
}

/// The temporary name of a file being copied across disks.
fn moving_path(target: &Path) -> PathBuf {
    let mut name: OsString = target.file_name().unwrap_or_default().to_os_string();
    name.push(MOVING_SUFFIX);
    target.with_file_name(name)
}

fn same_folder(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Runs `write` on the database, under its lock.
fn with_db<T>(db: &Mutex<Option<Database>>, write: impl FnOnce(&Database) -> Option<T>) -> Option<T> {
    let guard = db.lock().ok()?;
    write(guard.as_ref()?)
}

/// Moves each track's file into `folder`, keeping its name. `tracks` are ids
/// with their stored paths (None: the track is gone).
pub fn move_tracks(
    db: &Mutex<Option<Database>>,
    tracks: &[(i64, Option<String>)],
    folder: &Path,
) -> MoveReport {
    let mut report = MoveReport::default();
    for (id, path) in tracks {
        let result = match path {
            Some(path) => move_one(db, *id, Path::new(path), folder, true),
            None => Err(SkipReason::Missing),
        };
        match result {
            Ok(new_path) => report.moved.push(MovedTrack { id: *id, new_path }),
            Err(reason) => report.skipped.push(SkippedTrack { id: *id, reason }),
        }
    }
    report
}

/// One file. On the same disk: rename it into place and update its path,
/// both under the lock, and rename it back if the update fails. Across disks
/// (or with `try_rename` false): copy it, outside the lock.
fn move_one(
    db: &Mutex<Option<Database>>,
    id: i64,
    source: &Path,
    folder: &Path,
    try_rename: bool,
) -> Result<String, SkipReason> {
    if !source.is_file() {
        return Err(SkipReason::Missing);
    }
    let name = source.file_name().ok_or(SkipReason::Failed)?;
    if source.parent().is_some_and(|parent| same_folder(parent, folder)) {
        return Err(SkipReason::AlreadyThere);
    }
    let target = folder.join(name);
    if target.exists() {
        return Err(SkipReason::NameTaken);
    }
    let new_path = stored_path(&target);

    if try_rename {
        let renamed = with_db(db, |db| {
            Some(match fs::rename(source, &target) {
                Ok(()) => {
                    if db.set_track_file_path(id, &new_path).is_ok() {
                        Ok(true)
                    } else {
                        let _ = fs::rename(&target, source);
                        Err(SkipReason::Failed)
                    }
                }
                // Another disk: copy below, once the lock is released.
                Err(e) if e.kind() == io::ErrorKind::CrossesDevices => Ok(false),
                Err(_) => Err(SkipReason::Failed),
            })
        })
        .unwrap_or(Err(SkipReason::Failed))?;
        if renamed {
            return Ok(new_path);
        }
    }
    copy_across(db, id, source, &target, &new_path)
}

/// Across disks: copy to a temporary name and check its size, outside the
/// lock; then, under the lock, give it its name and update the path; then
/// delete the original. If anything fails, the copy goes and the original
/// stays.
fn copy_across(
    db: &Mutex<Option<Database>>,
    id: i64,
    source: &Path,
    target: &Path,
    new_path: &str,
) -> Result<String, SkipReason> {
    let temp = moving_path(target);
    let size = fs::metadata(source).map(|m| m.len()).map_err(|_| SkipReason::Failed)?;
    if fs::copy(source, &temp).ok() != Some(size) {
        let _ = fs::remove_file(&temp);
        return Err(SkipReason::Failed);
    }
    let placed = with_db(db, |db| {
        if target.exists() {
            return Some(Err(SkipReason::NameTaken));
        }
        if fs::rename(&temp, target).is_err() {
            return Some(Err(SkipReason::Failed));
        }
        if db.set_track_file_path(id, new_path).is_err() {
            let _ = fs::remove_file(target);
            return Some(Err(SkipReason::Failed));
        }
        Some(Ok(()))
    })
    .unwrap_or(Err(SkipReason::Failed));
    if let Err(reason) = placed {
        let _ = fs::remove_file(&temp);
        return Err(reason);
    }
    // A leftover original has the same contents: a scan matches it by its
    // hash and does not import it again.
    let _ = fs::remove_file(source);
    Ok(new_path.to_string())
}

/// Every folder of the library, for Move to folder ▸.
#[tauri::command]
pub async fn list_library_folders(app: AppHandle) -> Result<Vec<LibraryFolder>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let roots = {
            let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
            let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
            library_roots(db)?
        };
        Ok(library_folders(&roots))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Listing folders failed: {}", e)))?
}

/// Moves the tracks' files into `folder`, which must be inside a library
/// folder. The file work runs off the main thread, so a copy across disks
/// does not freeze the window.
#[tauri::command]
pub async fn move_tracks_to_folder(
    app: AppHandle,
    track_ids: Vec<i64>,
    folder: String,
) -> Result<MoveReport, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let folder = PathBuf::from(&folder);
        let tracks: Vec<(i64, Option<String>)> = {
            let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
            let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
            assert_within_library_roots(db, &folder)?;
            track_ids
                .iter()
                .map(|&id| (id, db.get_track(id).ok().map(|t| t.file_path)))
                .collect()
        };
        Ok(move_tracks(&state.db, &tracks, &folder))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Moving tracks failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;
    use tempfile::TempDir;

    // A library root with the folders House and Techno, and tracks' files in House.
    struct Library {
        _dir: TempDir,
        root: PathBuf,
        db: Mutex<Option<Database>>,
    }

    fn library() -> Library {
        let dir = TempDir::new().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap().join("Music");
        fs::create_dir_all(root.join("House")).unwrap();
        fs::create_dir_all(root.join("Techno")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        Library { _dir: dir, root, db: Mutex::new(Some(db)) }
    }

    impl Library {
        // A track whose file is in `folder`, with these bytes.
        fn track(&self, folder: &str, name: &str, bytes: &[u8]) -> (i64, String) {
            let path = self.root.join(folder).join(name);
            fs::write(&path, bytes).unwrap();
            let path = stored_path(&path);
            let track = Track {
                id: None,
                file_path: path.clone(),
                file_hash: name.to_string(),
                title: Some(name.to_string()),
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
            };
            let id = with_db(&self.db, |db| db.create_track(&track).ok()).unwrap();
            (id, path)
        }

        fn stored(&self, id: i64) -> String {
            with_db(&self.db, |db| db.get_track(id).ok()).unwrap().file_path
        }
    }

    #[test]
    fn moves_the_files_and_updates_their_paths_keeping_the_ids_and_analysis() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let (b, _) = lib.track("House", "b.flac", b"bbbbbb");
        with_db(&lib.db, |db| db.save_bpm_analysis(a, 126.0, 0.9).ok()).unwrap();

        let report = move_tracks(
            &lib.db,
            &[(a, Some(a_path.clone())), (b, Some(lib.stored(b)))],
            &lib.root.join("Techno"),
        );

        let a_new = stored_path(&lib.root.join("Techno").join("a.mp3"));
        assert_eq!(report.skipped, vec![]);
        assert_eq!(report.moved[0], MovedTrack { id: a, new_path: a_new.clone() });
        assert_eq!(lib.stored(a), a_new);
        assert_eq!(fs::read(&a_new).unwrap(), b"aaaa");
        assert!(!Path::new(&a_path).exists());
        let analysis = with_db(&lib.db, |db| db.get_track_analysis(a).ok()).unwrap().unwrap();
        assert_eq!(analysis.bpm, Some(126.0));
    }

    #[test]
    fn skips_a_track_already_there_a_name_taken_and_a_missing_file() {
        let lib = library();
        let (here, here_path) = lib.track("Techno", "here.mp3", b"1");
        let (clash, clash_path) = lib.track("House", "same.mp3", b"2");
        fs::write(lib.root.join("Techno").join("same.mp3"), b"other").unwrap();
        let (gone, gone_path) = lib.track("House", "gone.mp3", b"3");
        fs::remove_file(&gone_path).unwrap();

        let report = move_tracks(
            &lib.db,
            &[(here, Some(here_path.clone())), (clash, Some(clash_path.clone())), (gone, Some(gone_path)), (99, None)],
            &lib.root.join("Techno"),
        );

        assert_eq!(report.moved, vec![]);
        let reasons: Vec<_> = report.skipped.iter().map(|s| (s.id, s.reason)).collect();
        assert_eq!(
            reasons,
            vec![
                (here, SkipReason::AlreadyThere),
                (clash, SkipReason::NameTaken),
                (gone, SkipReason::Missing),
                (99, SkipReason::Missing),
            ]
        );
        assert_eq!(fs::read(&clash_path).unwrap(), b"2");
        assert_eq!(lib.stored(clash), clash_path);
    }

    #[test]
    fn puts_a_file_back_when_its_path_cannot_be_updated() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        // A stale track already holds the path the file would get.
        let (stale, stale_path) = lib.track("Techno", "a.mp3", b"x");
        fs::remove_file(&stale_path).unwrap();

        let report = move_tracks(&lib.db, &[(a, Some(a_path.clone()))], &lib.root.join("Techno"));

        assert_eq!(report.skipped, vec![SkippedTrack { id: a, reason: SkipReason::Failed }]);
        assert_eq!(fs::read(&a_path).unwrap(), b"aaaa");
        assert!(!Path::new(&stale_path).exists());
        assert_eq!(lib.stored(a), a_path);
        assert_eq!(lib.stored(stale), stale_path);
    }

    #[test]
    fn across_disks_copies_to_a_name_no_scanner_reads_then_renames() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let target = lib.root.join("Techno").join("a.mp3");
        let temp = moving_path(&target);
        assert_eq!(temp.extension().unwrap(), "recodeck-moving");

        let new_path = move_one(&lib.db, a, Path::new(&a_path), &lib.root.join("Techno"), false).unwrap();

        assert_eq!(new_path, stored_path(&target));
        assert_eq!(fs::read(&target).unwrap(), b"aaaa");
        assert!(!temp.exists());
        assert!(!Path::new(&a_path).exists());
        assert_eq!(lib.stored(a), new_path);
    }

    #[test]
    fn across_disks_a_failed_update_leaves_the_original_and_no_copy() {
        let lib = library();
        let (a, a_path) = lib.track("House", "a.mp3", b"aaaa");
        let (_, stale_path) = lib.track("Techno", "a.mp3", b"x");
        fs::remove_file(&stale_path).unwrap();
        let target = lib.root.join("Techno").join("a.mp3");

        let result = move_one(&lib.db, a, Path::new(&a_path), &lib.root.join("Techno"), false);

        assert_eq!(result, Err(SkipReason::Failed));
        assert_eq!(fs::read(&a_path).unwrap(), b"aaaa");
        assert!(!target.exists());
        assert!(!moving_path(&target).exists());
    }

    #[test]
    fn refuses_a_folder_outside_the_library() {
        let lib = library();
        let outside = TempDir::new().unwrap();
        let roots = serde_json::to_string(&vec![stored_path(&lib.root)]).unwrap();
        with_db(&lib.db, |db| db.set_setting("library_folders", &roots).ok()).unwrap();

        let inside = with_db(&lib.db, |db| Some(assert_within_library_roots(db, &lib.root.join("Techno")).is_ok()));
        let refused = with_db(&lib.db, |db| Some(assert_within_library_roots(db, outside.path()).is_err()));

        assert_eq!(inside, Some(true));
        assert_eq!(refused, Some(true));
    }

    #[test]
    fn lists_every_folder_with_its_label_hidden_ones_left_out() {
        let lib = library();
        fs::create_dir_all(lib.root.join("House").join("Deep")).unwrap();
        let folders = library_folders(&[stored_path(&lib.root)]);
        let labels: Vec<_> = folders.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, vec!["Music", "Music / House", "Music / House / Deep", "Music / Techno"]);
        assert_eq!(folders[2].path, stored_path(&lib.root.join("House").join("Deep")));
    }
}
```

- [ ] **Step 4: Register it**

In `src-tauri/src/commands/mod.rs`, replace

```rust
pub mod analysis;
pub mod conversations;
pub mod dashboard;
pub mod dj;
pub mod genre;
pub mod library;
pub mod playback;
pub mod playlists;
pub mod server;
pub mod settings;
pub mod spotify;
pub mod watcher;
```

with

```rust
pub mod analysis;
pub mod conversations;
pub mod dashboard;
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
```

In `src-tauri/src/lib.rs`, replace

```rust
            commands::playlists::delete_playlist,
            commands::playlists::get_playlist_tracks,
            commands::playlists::add_track_to_playlist,
            commands::playlists::remove_track_from_playlist,
            commands::playlists::add_tracks_to_playlist,
            commands::playlists::remove_tracks_from_playlist,
            commands::playlists::reorder_playlist_tracks,
            commands::playlists::export_playlist_to_folder,
            commands::playlists::pick_export_folder,
            // Genre commands
            commands::genre::set_track_genre,
            commands::genre::clear_track_genre,
```

with

```rust
            commands::playlists::delete_playlist,
            commands::playlists::get_playlist_tracks,
            commands::playlists::add_track_to_playlist,
            commands::playlists::remove_track_from_playlist,
            commands::playlists::add_tracks_to_playlist,
            commands::playlists::remove_tracks_from_playlist,
            commands::move_tracks::list_library_folders,
            commands::move_tracks::move_tracks_to_folder,
            commands::playlists::reorder_playlist_tracks,
            commands::playlists::export_playlist_to_folder,
            commands::playlists::pick_export_folder,
            // Genre commands
            commands::genre::set_track_genre,
            commands::genre::clear_track_genre,
```

- [ ] **Step 5: Run the tests**

Run: `cd src-tauri && cargo test --lib move_tracks 2>&1 | grep "test result"; cargo test --lib 2>&1 | grep "test result"; cargo clippy --lib 2>&1 | grep -c "^warning"; cd ..`
Expected: the module's 7 tests pass; `435 passed`; `11` (as before).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/move_tracks.rs src-tauri/src/db/mod.rs src-tauri/src/commands/library.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(tracks): move tracks' files into a library folder — renamed on one disk, copied outside the lock across disks — and list the library's folders"
```

---

### Task 2: The calls

**Files:** Modify `src/types/track.ts`, `src/lib/tauri-api.ts`.

- [ ] **Step 1**

In `src/types/track.ts`, replace

```ts
  bpm?: number
  bpm_confidence?: number
  musical_key?: string
  key_confidence?: number
}

/** A track's genre and its source, as the Undo of a genre change puts them back. */
export interface TrackGenre {
  id: number
  genre: string | null
  source: string | null
}
```

with

```ts
  bpm?: number
  bpm_confidence?: number
  musical_key?: string
  key_confidence?: number
}

/** A folder of the library, for Move to folder ▸: its path as tracks store it. */
export interface LibraryFolder {
  path: string
  /** "Music / House / Deep" */
  label: string
}

/** Why Move to folder left a track where it was. */
export type MoveSkipReason = 'already_there' | 'name_taken' | 'missing' | 'failed'

export interface MoveReport {
  moved: Array<{ id: number; newPath: string }>
  skipped: Array<{ id: number; reason: MoveSkipReason }>
}

/** A track's genre and its source, as the Undo of a genre change puts them back. */
export interface TrackGenre {
  id: number
  genre: string | null
  source: string | null
}
```

In `src/lib/tauri-api.ts`, replace

```ts
  FolderInfo,
  Playlist,
  GenreCount,
  GenreDefinition,
  DuplicateGroup,
  TrackGenre,
} from '../types/track'
import type {
  ChatMessage,
  ChatV2Response,
  SessionContext,
  Conversation,
```

with

```ts
  FolderInfo,
  Playlist,
  GenreCount,
  GenreDefinition,
  DuplicateGroup,
  TrackGenre,
  LibraryFolder,
  MoveReport,
} from '../types/track'
import type {
  ChatMessage,
  ChatV2Response,
  SessionContext,
  Conversation,
```

In `src/lib/tauri-api.ts`, replace

```ts

  /** Removes several tracks at once; answers how many the playlist held. */
  async removeTracksFromPlaylist(playlistId: number, trackIds: number[]): Promise<number> {
    return await invoke('remove_tracks_from_playlist', { playlistId, trackIds })
  },

  async reorderPlaylistTracks(
    playlistId: number,
    orderedTrackIds: number[],
  ): Promise<void> {
    return await invoke('reorder_playlist_tracks', {
      playlistId,
```

with

```ts

  /** Removes several tracks at once; answers how many the playlist held. */
  async removeTracksFromPlaylist(playlistId: number, trackIds: number[]): Promise<number> {
    return await invoke('remove_tracks_from_playlist', { playlistId, trackIds })
  },

  /** Every folder of the library, the roots included (Move to folder ▸). */
  async listLibraryFolders(): Promise<LibraryFolder[]> {
    return await invoke('list_library_folders')
  },

  /** Moves the tracks' files into `folder`; answers what moved and what was skipped. */
  async moveTracksToFolder(trackIds: number[], folder: string): Promise<MoveReport> {
    return await invoke('move_tracks_to_folder', { trackIds, folder })
  },

  async reorderPlaylistTracks(
    playlistId: number,
    orderedTrackIds: number[],
  ): Promise<void> {
    return await invoke('reorder_playlist_tracks', {
      playlistId,
```

- [ ] **Step 2:** `npx tsc --noEmit -p .` — no errors. Commit:

```bash
git add src/types/track.ts src/lib/tauri-api.ts
git commit -m "feat(tracks): the calls to list the library's folders and move tracks into one"
```

---

### Task 3: What the move says

**Files:** Create `src/lib/trackTable/moveMessages.ts`; test `src/lib/trackTable/moveMessages.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/moveMessages.test.ts
import { describe, expect, it } from 'vitest'
import {
  folderName,
  folderOf,
  movedMessage,
  sharedFolder,
  skipDetail,
  undoGroups,
} from './moveMessages'

const titled = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Track ${i}` }))

describe('Move to folder', () => {
  it('knows the folder a track is in, and the one every track shares', () => {
    expect(folderOf('/Music/House/a.mp3')).toBe('/Music/House')
    expect(folderOf('C:/Music/a.mp3')).toBe('C:/Music')
    expect(
      sharedFolder([{ file_path: '/Music/House/a.mp3' }, { file_path: '/Music/House/b.mp3' }]),
    ).toBe('/Music/House')
    expect(
      sharedFolder([{ file_path: '/Music/House/a.mp3' }, { file_path: '/Music/Deep/b.mp3' }]),
    ).toBeNull()
  })

  it('names a folder by the end of its label', () => {
    expect(folderName('Music / House / Deep')).toBe('Deep')
    expect(folderName('Music')).toBe('Music')
  })

  it('says how many moved, and how many stayed and why', () => {
    expect(movedMessage(titled(3), [], 'House')).toBe('Moved 3 tracks to House')
    expect(movedMessage(titled(2), [{ id: 1, reason: 'playing' }], 'House')).toBe(
      'Moved 2 · 1 skipped (playing now)',
    )
    expect(
      movedMessage(
        titled(1),
        [
          { id: 1, reason: 'playing' },
          { id: 2, reason: 'name_taken' },
        ],
        'House',
      ),
    ).toBe('Moved 1 · 2 skipped')
    expect(movedMessage([], [{ id: 1, reason: 'already_there' }], 'House')).toBe(
      'Nothing moved · 1 skipped (already there)',
    )
  })

  it('lists why each track stayed, for the hover', () => {
    const titles: Record<number, string> = { 1: "Juz Listen'", 2: 'Voayeur' }
    expect(
      skipDetail(
        [
          { id: 1, reason: 'playing' },
          { id: 2, reason: 'name_taken' },
        ],
        (id) => titles[id],
      ),
    ).toBe("Juz Listen' — playing now\nVoayeur — a file with that name is there")
    const many = Array.from({ length: 8 }, (_, id) => ({ id, reason: 'missing' as const }))
    expect(skipDetail(many, () => 'T').split('\n')).toHaveLength(7)
    expect(skipDetail(many, () => 'T')).toMatch(/and 2 more$/)
  })

  it('moves back once per folder the tracks came from', () => {
    const old: Record<number, string> = {
      1: '/Music/House/a.mp3',
      2: '/Music/Deep/b.mp3',
      3: '/Music/House/c.mp3',
    }
    expect(undoGroups([{ id: 1 }, { id: 2 }, { id: 3 }], (id) => old[id])).toEqual([
      { folder: '/Music/House', ids: [1, 3] },
      { folder: '/Music/Deep', ids: [2] },
    ])
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/trackTable/moveMessages.test.ts` — FAIL, `Failed to resolve import "./moveMessages"`.

- [ ] **Step 3: The helpers**

```ts
// src/lib/trackTable/moveMessages.ts
// Move to folder's words and bookkeeping (track table spec, Move to folder):
// the folder a track is in, which folder to grey, what the toast says and
// shows on hover, and how an Undo moves the tracks back — once per folder
// they came from.
import type { MoveSkipReason, Track } from '../../types/track'
import { tracksSubject } from './bulkMessages'

/** Why a track stayed: the backend's reasons, and the track playing now. */
export type SkipReason = MoveSkipReason | 'playing'

export interface Skip {
  id: number
  reason: SkipReason
}

const REASON_TEXT: Record<SkipReason, string> = {
  playing: 'playing now',
  already_there: 'already there',
  name_taken: 'a file with that name is there',
  missing: 'file not found',
  failed: "couldn't move",
}

/** The folder a stored path is in (tracks store `/` on Windows too). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/** The folder every track is in, if they share one: Move to folder greys it. */
export function sharedFolder(tracks: readonly Pick<Track, 'file_path'>[]): string | null {
  if (tracks.length === 0) return null
  const folder = folderOf(tracks[0].file_path)
  return tracks.every((t) => folderOf(t.file_path) === folder) ? folder : null
}

/** "House", from the label "Music / House". */
export function folderName(label: string): string {
  return label.split(' / ').pop() ?? label
}

/**
 * "Moved 3 tracks to House"; with skips, "Moved 2 · 1 skipped (playing
 * now)" — the reason when every skip shares one; "Nothing moved · …" when
 * none moved.
 */
export function movedMessage(
  moved: readonly Pick<Track, 'title'>[],
  skipped: readonly Skip[],
  folder: string,
): string {
  if (skipped.length === 0) return `Moved ${tracksSubject(moved)} to ${folder}`
  const reasons = new Set(skipped.map((s) => s.reason))
  const why = reasons.size === 1 ? ` (${REASON_TEXT[skipped[0].reason]})` : ''
  const head = moved.length > 0 ? `Moved ${moved.length.toLocaleString('en-US')}` : 'Nothing moved'
  return `${head} · ${skipped.length.toLocaleString('en-US')} skipped${why}`
}

/** One line per skipped track, for the toast's hover: "Juz Listen' — playing now". */
export function skipDetail(
  skipped: readonly Skip[],
  titleOf: (id: number) => string | undefined,
  limit = 6,
): string {
  const lines = skipped
    .slice(0, limit)
    .map((s) => `${titleOf(s.id) || 'A track'} — ${REASON_TEXT[s.reason]}`)
  if (skipped.length > limit) lines.push(`and ${skipped.length - limit} more`)
  return lines.join('\n')
}

/** Undo moves the tracks back once per folder they came from. */
export function undoGroups(
  moved: readonly { id: number }[],
  oldPath: (id: number) => string,
): Array<{ folder: string; ids: number[] }> {
  const groups = new Map<string, number[]>()
  for (const { id } of moved) {
    const folder = folderOf(oldPath(id))
    groups.set(folder, [...(groups.get(folder) ?? []), id])
  }
  return [...groups].map(([folder, ids]) => ({ folder, ids }))
}
```

- [ ] **Step 4:** the same run — PASS, 5 tests. Commit:

```bash
git add src/lib/trackTable/moveMessages.ts src/lib/trackTable/moveMessages.test.ts
git commit -m "feat(tracks): what Move to folder says, the folder to grey, and the Undo's groups"
```

---

### Task 4: A toast's detail on hover; forgetting a thumbnail

**Files:** Modify `src/lib/toast.ts` (+ test), `src/components/Toaster.tsx`, `src/components/Toaster.css`, `src/lib/thumbnails/queue.ts` (+ test).

- [ ] **Step 1: The failing tests**

In `src/lib/toast.test.ts`, replace

```ts
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
```

with

```ts
    vi.advanceTimersByTime(999)
    expect(messages()).toEqual(['Added'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('keeps a detail for the mouse to show', () => {
    toast('Moved 2 · 1 skipped', { kind: 'warning', detail: "Juz Listen' — playing now" })
    expect(getToasts()[0].detail).toBe("Juz Listen' — playing now")
  })

  it('an action runs and closes its toast', () => {
    const run = vi.fn()
    const id = toast('Added 3 tracks to Peak Time', { action: { label: 'Undo', run } })
    runToastAction(id)
    expect(run).toHaveBeenCalledOnce()
    expect(messages()).toEqual([])
```

In `src/lib/thumbnails/queue.test.ts`, replace

```ts
    cancel()
    await answer(1, 'blob:1')
    expect(onReady).not.toHaveBeenCalled()
    expect(queue.cached(1)).toBe('blob:1')
  })

  it('keeps a failed read as "no artwork"', async () => {
    const { load, fail } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    queue.request(1, onReady)
    await fail(1)
```

with

```ts
    cancel()
    await answer(1, 'blob:1')
    expect(onReady).not.toHaveBeenCalled()
    expect(queue.cached(1)).toBe('blob:1')
  })

  it('forgets a thumbnail, freeing its URL, and reads it again when asked', async () => {
    const release = vi.fn()
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, release), load, 4)
    queue.request(1, vi.fn())
    await answer(1, 'blob:1')
    queue.forget(1)
    expect(release).toHaveBeenCalledWith('blob:1')
    expect(queue.cached(1)).toBeUndefined()
    queue.request(1, vi.fn())
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed read as "no artwork"', async () => {
    const { load, fail } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    queue.request(1, onReady)
    await fail(1)
```

Run: `npx vitest run src/lib/toast.test.ts src/lib/thumbnails` — FAIL (`detail` is undefined; `queue.forget is not a function`).

- [ ] **Step 2: The detail**

In `src/lib/toast.ts`, replace

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
```

with

```ts
// src/lib/toast.ts
// Toasts (Interactions spec, Feedback): `toast(message, { kind, action })`
// from anywhere; the Toaster shows them. success and info leave after 4s,
// warning after 6s, error stays until closed, and a toast under the mouse
// waits and shows its detail (e.g. why tracks were skipped). At most 3 at a
// time: a fourth pushes the oldest out. An action (Undo, Open, Try again)
// runs and closes its toast.
import { useSyncExternalStore } from 'react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
```

In `src/lib/toast.ts`, replace

```ts
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
```

with

```ts
}

export interface ToastOptions {
  /** success when absent. */
  kind?: ToastKind
  action?: ToastAction
  /** Shown under the message while the mouse is over the toast. */
  detail?: string
}

export interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
  detail?: string
}

export const TOAST_LIMIT = 3

/** How long each kind stays, in ms; null stays until closed. */
export const TOAST_DURATION: Record<ToastKind, number | null> = {
```

In `src/lib/toast.ts`, replace

```ts
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
```

with

```ts
}

/** Shows a toast; answers its id. */
export function toast(message: string, options: ToastOptions = {}): number {
  const id = nextId++
  const kind = options.kind ?? 'success'
  let next = [...toasts, { id, message, kind, action: options.action, detail: options.detail }]
  while (next.length > TOAST_LIMIT) {
    stopTimer(next[0].id)
    next = next.slice(1)
  }
  toasts = next
  const duration = TOAST_DURATION[kind]
```

In `src/components/Toaster.tsx`, replace

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
```

with

```tsx
// src/components/Toaster.tsx
// Shows the toasts (src/lib/toast.ts) bottom-centre over the main area, just
// above the player: they slide in from 8px below (slow) and fade out (base).
// Under the mouse a toast waits and shows its detail; its action (Undo) runs
// and closes it; an error has ✕, as it stays until closed.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  dismissToast,
  holdToast,
  releaseToast,
  runToastAction,
```

In `src/components/Toaster.tsx`, replace

```tsx
            }}
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
```

with

```tsx
            }}
            transition={{ duration: reduceMotion ? MOTION.fast : MOTION.slow, ease: EASE }}
            onPointerEnter={() => holdToast(t.id)}
            onPointerLeave={() => releaseToast(t.id)}
          >
            <span className="toast__dot" aria-hidden="true" />
            <span className="toast__text">
              <span className="toast__message">{t.message}</span>
              {t.detail && <span className="toast__detail">{t.detail}</span>}
            </span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => runToastAction(t.id)}>
                {t.action.label}
              </button>
            )}
            {t.kind === 'error' && (
```

In `src/components/Toaster.css`, replace

```css
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
```

with

```css
  box-shadow: 0 14px 34px rgb(0 0 0 / 0.5);
  color: var(--text-primary);
  font-size: 12.5px;
  pointer-events: auto;
}

/* On the first line's middle, also when the detail opens under it. */
.toast__dot {
  align-self: flex-start;
  margin-top: 5px;
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}
```

In `src/components/Toaster.css`, replace

```css
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
```

with

```css
}

.toast--error .toast__dot {
  background: var(--color-danger);
}

.toast__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.toast__message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The detail (why tracks were skipped): under the message, while hovered. */
.toast__detail {
  display: none;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.45;
  white-space: pre-line;
}

.toast:hover .toast__detail {
  display: block;
}

/* Undo: the accent drawn toward the text colour, so it reads on light themes. */
.toast__action {
  margin-left: auto;
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-md);
```

- [ ] **Step 3: Forgetting a thumbnail**

In `src/lib/thumbnails/queue.ts`, replace

```ts
      const [oldestId, oldest] = this.entries.entries().next().value!
      this.entries.delete(oldestId)
      if (oldest) this.release(oldest)
    }
  }

  get size(): number {
    return this.entries.size
  }
}

export class ThumbnailQueue {
```

with

```ts
      const [oldestId, oldest] = this.entries.entries().next().value!
      this.entries.delete(oldestId)
      if (oldest) this.release(oldest)
    }
  }

  /** Forgets a thumbnail, and frees its URL. */
  delete(id: number): void {
    const thumb = this.entries.get(id)
    this.entries.delete(id)
    if (thumb) this.release(thumb)
  }

  get size(): number {
    return this.entries.size
  }
}

export class ThumbnailQueue {
```

In `src/lib/thumbnails/queue.ts`, replace

```ts

  /** The thumbnail if it is known, without asking for it. */
  cached(id: number): Thumb | undefined {
    return this.cache.get(id)
  }

  /**
   * Asks for a track's thumbnail; `onReady` gets it once it is read (at once
   * when it is known). The answer cancels: a request not started yet is
   * dropped; one being read still fills the cache.
   */
  request(id: number, onReady: Listener): () => void {
```

with

```ts

  /** The thumbnail if it is known, without asking for it. */
  cached(id: number): Thumb | undefined {
    return this.cache.get(id)
  }

  /**
   * Forgets a track's thumbnail, so the next row asks again: its file moved,
   * and a folder's cover.jpg may now be another one.
   */
  forget(id: number): void {
    this.cache.delete(id)
  }

  /**
   * Asks for a track's thumbnail; `onReady` gets it once it is read (at once
   * when it is known). The answer cancels: a request not started yet is
   * dropped; one being read still fills the cache.
   */
  request(id: number, onReady: Listener): () => void {
```

- [ ] **Step 4:** the same run — PASS (toast 6, thumbnails 9). `npx tsc --noEmit -p .` — no errors. Commit:

```bash
git add src/lib/toast.ts src/lib/toast.test.ts src/components/Toaster.tsx src/components/Toaster.css src/lib/thumbnails/queue.ts src/lib/thumbnails/queue.test.ts
git commit -m "feat(ui): a toast's detail shows on hover; a thumbnail can be forgotten"
```

---

### Task 5: The player keeps playing while its queue's paths change

**Files:** Modify `src/store/playerStore.ts` (+ test), `src/components/layout/NowPlayingBar.tsx`, `src/lib/audioPlayer.ts`.

- [ ] **Step 1: The failing tests**

In `src/store/playerStore.test.ts`, replace

```ts
    const state = usePlayerStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.volume).toBe(0.7)
    expect(state.currentTrackIndex).toBe(-1)
  })
})
```

with

```ts
    const state = usePlayerStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.volume).toBe(0.7)
    expect(state.currentTrackIndex).toBe(-1)
  })
})

describe('playerStore - what loads the track', () => {
  const request = () => usePlayerStore.getState().playRequest

  it('a play, next, previous and a pick ask for a load', () => {
    const store = usePlayerStore.getState()
    store.setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 0)
    expect(request()).toBe(1)
    usePlayerStore.getState().playNext()
    usePlayerStore.getState().playPrevious()
    usePlayerStore.getState().playTrackAtIndex(2)
    usePlayerStore.getState().applyQueueAction([makeTrack(4)], 'play_now')
    expect(request()).toBe(5)
  })

  it('shuffling and adding to the queue leave the track playing as it is', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 1)
    usePlayerStore.getState().setShuffle(true)
    usePlayerStore.getState().setShuffle(false)
    usePlayerStore.getState().applyQueueAction([makeTrack(4)], 'play_next')
    usePlayerStore.getState().applyQueueAction([makeTrack(5)], 'append')
    expect(request()).toBe(1)
  })
})

describe('playerStore - moved files', () => {
  it('patches paths in the queue and the unshuffled queue, loading nothing', () => {
    usePlayerStore.getState().setQueue([makeTrack(1), makeTrack(2), makeTrack(3)], 0)
    usePlayerStore.getState().setCurrentTrack(makeTrack(1))
    usePlayerStore.getState().setShuffle(true)
    usePlayerStore.getState().patchTrackPaths(new Map([[2, '/House/track2.mp3']]))
    const state = usePlayerStore.getState()
    expect(state.queue.find((t) => t.id === 2)?.file_path).toBe('/House/track2.mp3')
    expect(state.originalQueue[1].file_path).toBe('/House/track2.mp3')
    expect(state.currentTrack?.file_path).toBe('/test/track1.mp3')
    expect(state.currentTrackIndex).toBe(0)
    expect(state.playRequest).toBe(1)
  })

  it('keeps the same queue when none of its tracks moved', () => {
    usePlayerStore.getState().setQueue([makeTrack(1)], 0)
    const before = usePlayerStore.getState().queue
    usePlayerStore.getState().patchTrackPaths(new Map([[9, '/elsewhere.mp3']]))
    expect(usePlayerStore.getState().queue).toBe(before)
  })
})
```

Run: `npx vitest run src/store` — FAIL (`playRequest` is undefined; `patchTrackPaths is not a function`).

- [ ] **Step 2: The store**

In `src/store/playerStore.ts`, replace

```ts
  // Queue management
  queue: Track[]
  currentTrackIndex: number // -1 when no queue
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean
  originalQueue: Track[] // Store original order before shuffle

  // Actions
  setCurrentTrack: (track: Track | null) => void
  setPosition: (position: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
```

with

```ts
  // Queue management
  queue: Track[]
  currentTrackIndex: number // -1 when no queue
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean
  originalQueue: Track[] // Store original order before shuffle
  /**
   * Raised by every action that asks for the track at currentTrackIndex to
   * be loaded and played (a play, next, previous). Shuffling, adding to the
   * queue and patching paths leave the track playing as it is.
   */
  playRequest: number

  // Actions
  setCurrentTrack: (track: Track | null) => void
  setPosition: (position: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
```

In `src/store/playerStore.ts`, replace

```ts
  playNext: () => void
  playPrevious: () => void
  setRepeatMode: (mode: 'off' | 'all' | 'one') => void
  setShuffle: (enabled: boolean) => void
  playTrackAtIndex: (index: number) => void
  applyQueueAction: (tracks: Track[], mode: string) => void
}

const initialState = {
  currentTrack: null,
  isPlaying: false,
  position: 0,
```

with

```ts
  playNext: () => void
  playPrevious: () => void
  setRepeatMode: (mode: 'off' | 'all' | 'one') => void
  setShuffle: (enabled: boolean) => void
  playTrackAtIndex: (index: number) => void
  applyQueueAction: (tracks: Track[], mode: string) => void
  /** New paths for tracks whose files moved (Move to folder); nothing reloads. */
  patchTrackPaths: (paths: ReadonlyMap<number, string>) => void
}

/** The tracks with their moved files' new paths; the same array when none moved. */
export function withPaths(tracks: Track[], paths: ReadonlyMap<number, string>): Track[] {
  if (!tracks.some((t) => paths.has(t.id))) return tracks
  return tracks.map((t) => (paths.has(t.id) ? { ...t, file_path: paths.get(t.id)! } : t))
}

const initialState = {
  currentTrack: null,
  isPlaying: false,
  position: 0,
```

In `src/store/playerStore.ts`, replace

```ts
  error: null,
  queue: [],
  currentTrackIndex: -1,
  repeatMode: 'off' as const,
  isShuffle: false,
  originalQueue: [],
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentTrack: (track) => set({ currentTrack: track }),
```

with

```ts
  error: null,
  queue: [],
  currentTrackIndex: -1,
  repeatMode: 'off' as const,
  isShuffle: false,
  originalQueue: [],
  playRequest: 0,
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentTrack: (track) => set({ currentTrack: track }),
```

In `src/store/playerStore.ts`, replace

```ts
      )
    }
    set({
      queue: [...tracks],
      originalQueue: [...tracks],
      currentTrackIndex: startIndex,
    })
  },

  playNext: () => {
    const state = get()
    const { queue, currentTrackIndex, repeatMode } = state
```

with

```ts
      )
    }
    set({
      queue: [...tracks],
      originalQueue: [...tracks],
      currentTrackIndex: startIndex,
      playRequest: get().playRequest + 1,
    })
  },

  playNext: () => {
    const state = get()
    const { queue, currentTrackIndex, repeatMode } = state
```

In `src/store/playerStore.ts`, replace

```ts
        nextIndex = 0 // Wrap to start
      } else {
        return // Stop at end
      }
    }

    set({ currentTrackIndex: nextIndex })
  },

  playPrevious: () => {
    const state = get()
    const { queue, currentTrackIndex } = state
    if (queue.length === 0 || currentTrackIndex <= 0) return

    set({ currentTrackIndex: currentTrackIndex - 1 })
  },

  setRepeatMode: (mode) => set({ repeatMode: mode }),

  setShuffle: (enabled) => {
    const state = get()
```

with

```ts
        nextIndex = 0 // Wrap to start
      } else {
        return // Stop at end
      }
    }

    set({ currentTrackIndex: nextIndex, playRequest: state.playRequest + 1 })
  },

  playPrevious: () => {
    const state = get()
    const { queue, currentTrackIndex } = state
    if (queue.length === 0 || currentTrackIndex <= 0) return

    set({ currentTrackIndex: currentTrackIndex - 1, playRequest: state.playRequest + 1 })
  },

  setRepeatMode: (mode) => set({ repeatMode: mode }),

  setShuffle: (enabled) => {
    const state = get()
```

In `src/store/playerStore.ts`, replace

```ts
    }
  },

  playTrackAtIndex: (index) => {
    const state = get()
    if (index >= 0 && index < state.queue.length) {
      set({ currentTrackIndex: index })
    }
  },

  applyQueueAction: (tracks: Track[], mode: string) => {
    const state = get();
    if (mode === 'play_now') {
      set({
        queue: tracks,
        originalQueue: tracks,
        currentTrackIndex: 0,
        currentTrack: tracks[0] || null,
      });
    } else if (mode === 'play_next') {
      const newQueue = [
        ...state.queue.slice(0, state.currentTrackIndex + 1),
        ...tracks,
        ...state.queue.slice(state.currentTrackIndex + 1),
```

with

```ts
    }
  },

  playTrackAtIndex: (index) => {
    const state = get()
    if (index >= 0 && index < state.queue.length) {
      set({ currentTrackIndex: index, playRequest: state.playRequest + 1 })
    }
  },

  applyQueueAction: (tracks: Track[], mode: string) => {
    const state = get();
    if (mode === 'play_now') {
      set({
        queue: tracks,
        originalQueue: tracks,
        currentTrackIndex: 0,
        currentTrack: tracks[0] || null,
        playRequest: state.playRequest + 1,
      });
    } else if (mode === 'play_next') {
      const newQueue = [
        ...state.queue.slice(0, state.currentTrackIndex + 1),
        ...tracks,
        ...state.queue.slice(state.currentTrackIndex + 1),
```

In `src/store/playerStore.ts`, replace

```ts
      set({ queue: newQueue, originalQueue: newQueue });
    } else {
      const newQueue = [...state.queue, ...tracks];
      set({ queue: newQueue, originalQueue: newQueue });
    }
  },
}))
```

with

```ts
      set({ queue: newQueue, originalQueue: newQueue });
    } else {
      const newQueue = [...state.queue, ...tracks];
      set({ queue: newQueue, originalQueue: newQueue });
    }
  },

  patchTrackPaths: (paths) => {
    const { queue, originalQueue, currentTrack } = get()
    set({
      queue: withPaths(queue, paths),
      originalQueue: withPaths(originalQueue, paths),
      currentTrack:
        currentTrack && paths.has(currentTrack.id)
          ? { ...currentTrack, file_path: paths.get(currentTrack.id)! }
          : currentTrack,
    })
  },
}))
```

Run: `npx vitest run src/store` — PASS.

- [ ] **Step 3: What loads the track**

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
    duration,
    volume,
    isLoading,
    error,
    queue,
    currentTrackIndex,
    repeatMode,
    isShuffle,
    setPosition,
    setDuration,
    setVolume,
    setIsPlaying,
```

with

```tsx
    duration,
    volume,
    isLoading,
    error,
    queue,
    currentTrackIndex,
    playRequest,
    repeatMode,
    isShuffle,
    setPosition,
    setDuration,
    setVolume,
    setIsPlaying,
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  // Load and play track when currentTrackIndex changes
  const loadGenRef = useRef(0)
  const crossfadeCompletedRef = useRef(false)
  useEffect(() => {
    if (currentTrackIndex >= 0 && queue[currentTrackIndex]) {
      const track = queue[currentTrackIndex]
      const gen = ++loadGenRef.current
      console.log(
        `[NowPlayingBar] useEffect triggered: loading track index=${currentTrackIndex}, gen=${gen}, track="${track.title || track.file_path}"`,
      )
```

with

```tsx
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  // Load and play track when currentTrackIndex changes
  const loadGenRef = useRef(0)
  const crossfadeCompletedRef = useRef(false)
  // The track loads when a play is asked for (playRequest), or when the track
  // at the queue's index is another one — not when only the queue around it
  // changes (shuffled, added to, its paths patched after a move), which would
  // restart the song from 0:00.
  const queuedTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : undefined
  const queuedTrackKey = queuedTrack ? `${queuedTrack.id}\n${queuedTrack.file_path}` : null
  useEffect(() => {
    const { queue, currentTrackIndex } = usePlayerStore.getState()
    if (currentTrackIndex >= 0 && queue[currentTrackIndex]) {
      const track = queue[currentTrackIndex]
      const gen = ++loadGenRef.current
      console.log(
        `[NowPlayingBar] useEffect triggered: loading track index=${currentTrackIndex}, gen=${gen}, track="${track.title || track.file_path}"`,
      )
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
        }
      })()
    } else if (currentTrackIndex >= 0) {
      console.warn(`[NowPlayingBar] useEffect: invalid state - currentTrackIndex=${currentTrackIndex} but no track in queue`)
    }
  }, [
    currentTrackIndex,
    queue,
    setCurrentTrack,
    setIsLoading,
    setError,
    setIsPlaying,
  ])
```

with

```tsx
        }
      })()
    } else if (currentTrackIndex >= 0) {
      console.warn(`[NowPlayingBar] useEffect: invalid state - currentTrackIndex=${currentTrackIndex} but no track in queue`)
    }
  }, [
    playRequest,
    queuedTrackKey,
    setCurrentTrack,
    setIsLoading,
    setError,
    setIsPlaying,
  ])
```

- [ ] **Step 4: The track coming in during a crossfade**

In `src/lib/audioPlayer.ts`, replace

```ts

  // Crossfade support
  private crossfadeEnabled: boolean = false
  private crossfadeDurationMs: number = 8000 // default 8 seconds
  private crossfadeAudio: HTMLAudioElement | null = null // second audio element for incoming track
  private isCrossfading: boolean = false
  private crossfadeFadeComplete: boolean = false // fade-in done, waiting for outgoing track to end naturally
  private _isCompletingCrossfade: boolean = false // true during onTrackEnded() call from completeCrossfade()
  private crossfadeStartTime: number = 0
  private crossfadeRafId: number | null = null
  private outgoingBpm: number | null = null
  private incomingBpm: number | null = null
```

with

```ts

  // Crossfade support
  private crossfadeEnabled: boolean = false
  private crossfadeDurationMs: number = 8000 // default 8 seconds
  private crossfadeAudio: HTMLAudioElement | null = null // second audio element for incoming track
  private isCrossfading: boolean = false
  // The incoming track's id while a crossfade runs: the player streams it
  // from its path, so Move to folder leaves it where it is.
  private crossfadeTrackId: number | null = null
  private crossfadeFadeComplete: boolean = false // fade-in done, waiting for outgoing track to end naturally
  private _isCompletingCrossfade: boolean = false // true during onTrackEnded() call from completeCrossfade()
  private crossfadeStartTime: number = 0
  private crossfadeRafId: number | null = null
  private outgoingBpm: number | null = null
  private incomingBpm: number | null = null
```

In `src/lib/audioPlayer.ts`, replace

```ts
  }

  get isCrossfadingState(): boolean {
    return this.isCrossfading || this.crossfadeFadeComplete || this._isCompletingCrossfade
  }

  getAnalyser(): AnalyserNode | null {
    if (this.mode !== 'html') return null

    try {
      if (!this._vizCtx) {
        this._vizCtx = new AudioContext()
```

with

```ts
  }

  get isCrossfadingState(): boolean {
    return this.isCrossfading || this.crossfadeFadeComplete || this._isCompletingCrossfade
  }

  /** The incoming track's id during a crossfade; null otherwise. */
  get incomingTrackId(): number | null {
    return this.crossfadeTrackId
  }

  getAnalyser(): AnalyserNode | null {
    if (this.mode !== 'html') return null

    try {
      if (!this._vizCtx) {
        this._vizCtx = new AudioContext()
```

In `src/lib/audioPlayer.ts`, replace

```ts
  /**
   * Start crossfade to next track (HTML mode only).
   * Preloads the incoming track, starts it at matched tempo, and fades volumes.
   */
  async startCrossfadeToNext(
    nextTrackFilePath: string,
    _nextTrackId?: number,
    nextTrackBpm?: number | null,
    currentTrackBpm?: number | null,
  ): Promise<void> {
    // Only support crossfade in HTML mode (native mode would need dual decoder support)
    if (this.mode !== 'html') {
      console.warn(
```

with

```ts
  /**
   * Start crossfade to next track (HTML mode only).
   * Preloads the incoming track, starts it at matched tempo, and fades volumes.
   */
  async startCrossfadeToNext(
    nextTrackFilePath: string,
    nextTrackId?: number,
    nextTrackBpm?: number | null,
    currentTrackBpm?: number | null,
  ): Promise<void> {
    // Only support crossfade in HTML mode (native mode would need dual decoder support)
    if (this.mode !== 'html') {
      console.warn(
```

In `src/lib/audioPlayer.ts`, replace

```ts
    // Don't crossfade if we're in native mode or no current track
    if (!this._hasSource || !this.audio.src) {
      return
    }

    this.isCrossfading = true
    this.outgoingBpm = currentTrackBpm ?? null
    this.incomingBpm = nextTrackBpm ?? null

    try {
      // Create second audio element for incoming track
      this.crossfadeAudio = new Audio()
```

with

```ts
    // Don't crossfade if we're in native mode or no current track
    if (!this._hasSource || !this.audio.src) {
      return
    }

    this.isCrossfading = true
    this.crossfadeTrackId = nextTrackId ?? null
    this.outgoingBpm = currentTrackBpm ?? null
    this.incomingBpm = nextTrackBpm ?? null

    try {
      // Create second audio element for incoming track
      this.crossfadeAudio = new Audio()
```

In `src/lib/audioPlayer.ts`, replace

```ts

    // Swap: incoming becomes current
    const newAudio = this.crossfadeAudio
    this.audio = newAudio
    this.audio.volume = 1.0
    this.crossfadeAudio = null

    // Reattach event listeners to the new audio element
    this.setupEventListeners()

    // Reconnect the swapped Audio element to the Web Audio EQ chain
    if (this._vizCtx && this._eqEnabled) {
```

with

```ts

    // Swap: incoming becomes current
    const newAudio = this.crossfadeAudio
    this.audio = newAudio
    this.audio.volume = 1.0
    this.crossfadeAudio = null
    this.crossfadeTrackId = null

    // Reattach event listeners to the new audio element
    this.setupEventListeners()

    // Reconnect the swapped Audio element to the Web Audio EQ chain
    if (this._vizCtx && this._eqEnabled) {
```

In `src/lib/audioPlayer.ts`, replace

```ts
    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause()
      this.crossfadeAudio.removeAttribute('src')
      this.crossfadeAudio.load()
      this.crossfadeAudio = null
    }

    // Restore outgoing track volume and playback rate
    if (this.audio) {
      this.audio.volume = 1.0
      this.audio.playbackRate = 1.0
    }
```

with

```ts
    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause()
      this.crossfadeAudio.removeAttribute('src')
      this.crossfadeAudio.load()
      this.crossfadeAudio = null
    }
    this.crossfadeTrackId = null

    // Restore outgoing track volume and playback rate
    if (this.audio) {
      this.audio.volume = 1.0
      this.audio.playbackRate = 1.0
    }
```

- [ ] **Step 5:**
  - `npx tsc --noEmit -p .` — no errors.
  - `npx eslint src/store src/components/layout/NowPlayingBar.tsx src/lib/audioPlayer.ts` — only NowPlayingBar's two existing `exhaustive-deps` warnings.
  - `npx vitest run src/lib/audioPlayer.test.ts` — passes.

  Commit:

```bash
git add src/store/playerStore.ts src/store/playerStore.test.ts src/components/layout/NowPlayingBar.tsx src/lib/audioPlayer.ts
git commit -m "feat(player): a track loads when a play is asked for or it changes — not when its queue is shuffled, added to or its paths patched"
```

---

### Task 6: A searchable submenu

**Files:** Modify `src/components/menu/Menu.tsx`, `src/components/menu/Menu.css`.

- [ ] **Step 1**

In `src/components/menu/Menu.tsx`, replace

```tsx
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red. The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
```

with

```tsx
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red. The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
// A searchable submenu has a box at its top: typing narrows its items.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
```

with

```tsx
  kind: 'submenu'
  label: string
  icon?: IconName
  hint?: string
  disabled?: boolean
  entries: MenuEntry[]
  /** A box at the top narrows a long list as you type (Move to folder ▸). */
  search?: { placeholder: string; empty: string }
}

export interface MenuSeparator {
  kind: 'separator'
}
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
```

with

```tsx
  /** A submenu's ←: back to its parent. */
  onBack?: () => void
  /** The menu, and a submenu opened from the keyboard, take the keys. */
  takeFocus?: boolean
  /** A submenu opened from the keyboard starts on its first item. */
  startActive?: boolean
  search?: MenuSubmenu['search']
}

/** The items whose labels hold every typed letter run; separators go while narrowing. */
function narrow(entries: MenuEntry[], query: string): MenuEntry[] {
  const words = query.trim().toLowerCase()
  if (!words) return entries
  return entries.filter((e) => e.kind !== 'separator' && e.label.toLowerCase().includes(words))
}

interface OpenSubmenu {
  index: number
  fromKeyboard: boolean
  /** Its item's box, read when it opened. */
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
```

with

```tsx
  y,
  label,
  onChoose,
  onBack,
  takeFocus = false,
  startActive = false,
  search,
}: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [query, setQuery] = useState('')
  const shown = search ? narrow(entries, query) : entries
  const [active, setActive] = useState(() => (startActive ? stepIndex(entries, -1, 1) : -1))
  const [open, setOpen] = useState<OpenSubmenu | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Placed once its size is known: inside the window, flipped when needed.
  useLayoutEffect(() => {
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
```

with

```tsx
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - EDGE - height))
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.visibility = 'visible'
  }, [x, flipX, y])

  // A searchable list takes the keys at once, so typing narrows it.
  useEffect(() => {
    if (search) searchRef.current?.focus({ preventScroll: true })
    else if (takeFocus) panelRef.current?.focus({ preventScroll: true })
  }, [takeFocus, search])

  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      // Not the page's text: there is nothing to select in a menu.
      event.preventDefault()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
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
```

with

```tsx
    cancelClose()
    setOpen(null)
    panelRef.current?.focus({ preventScroll: true })
  }

  const enter = (index: number, fromKeyboard: boolean) => {
    const entry = shown[index]
    if (entry.kind === 'separator' || entry.disabled) return
    if (entry.kind === 'action') onChoose(entry)
    else openSubmenu(index, fromKeyboard)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      // Not the page's text: there is nothing to select in a menu.
      event.preventDefault()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => stepIndex(shown, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (active >= 0 && shown[active].kind === 'submenu') enter(active, true)
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault()
      onBack()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (active >= 0) enter(active, true)
    }
  }

  // The search box's keys: ↑ ↓ move through the list, Enter chooses (the
  // only match, when none is active), ← on an empty box goes back.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => stepIndex(shown, index, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const only = stepIndex(shown, -1, 1)
      if (active >= 0) enter(active, true)
      else if (only !== -1 && stepIndex(shown, only, 1) === only) enter(only, true)
    } else if (event.key === 'ArrowLeft' && !query && onBack) {
      event.preventDefault()
      onBack()
    }
  }

  const submenu = open !== null ? shown[open.index] : null

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className={search ? 'menu menu--search' : 'menu'}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {search && (
          <input
            ref={searchRef}
            className="menu__search"
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(-1)
            }}
            onKeyDown={onSearchKeyDown}
          />
        )}
        {search && shown.length === 0 && <div className="menu__empty">{search.empty}</div>}
        <div className={search ? 'menu__list' : undefined}>
          {shown.map((entry, index) => {
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
      </div>
      {submenu?.kind === 'submenu' && open && (
        <Submenu
          key={open.index}
          entries={submenu.entries}
          search={submenu.search}
          rect={open.rect}
          label={submenu.label}
          fromKeyboard={open.fromKeyboard}
          onChoose={onChoose}
          onBack={closeSubmenu}
          onPointerEnter={() => {
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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
```

with

```tsx
  )
}

// A submenu: a panel beside its item, an overlay of its own while open.
function Submenu({
  entries,
  search,
  rect,
  label,
  fromKeyboard,
  onChoose,
  onBack,
  onPointerEnter,
}: {
  entries: MenuEntry[]
  search?: MenuSubmenu['search']
  rect: DOMRect
  label: string
  fromKeyboard: boolean
  onChoose: (action: MenuAction) => void
  onBack: () => void
  onPointerEnter: () => void
```

In `src/components/menu/Menu.tsx`, replace

```tsx
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

with

```tsx
        y={rect.top - 6}
        label={label}
        onChoose={onChoose}
        onBack={onBack}
        takeFocus={fromKeyboard}
        startActive={fromKeyboard}
        search={search}
      />
    </div>
  )
}
```

In `src/components/menu/Menu.css`, replace

```css

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

with

```css

.menu__check,
.menu__chevron {
  color: var(--text-secondary);
}

/* A searchable submenu: the box stays put, the list under it scrolls. */
.menu--search {
  width: 340px;
  max-width: 340px;
  overflow: hidden;
}

.menu__search {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  margin-bottom: 5px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  outline: none;
}

.menu__search:focus {
  border-color: var(--accent);
}

.menu__list {
  max-height: min(360px, calc(100vh - 80px));
  overflow-y: auto;
}

.menu__empty {
  padding: 6px 10px;
  color: var(--text-muted);
}

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p . && npx eslint src/components/menu && npx vitest run src/components/menu` — clean, 4 tests. Commit:

```bash
git add src/components/menu/Menu.tsx src/components/menu/Menu.css
git commit -m "feat(ui): a menu's submenu can be searched — a box at its top narrows the list"
```

---

### Task 7: Move to folder ▸ in the track table's menu

**Files:** Modify `src/components/track-table/trackMenuEntries.ts` (+ test), `src/components/TrackTable.tsx`; create `src/components/track-table/useLibraryFolders.ts`.

- [ ] **Step 1: The failing tests**

In `src/components/track-table/trackMenuEntries.test.ts`, replace

```ts
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
```

with

```ts
import { describe, expect, it, vi } from 'vitest'
import type { Playlist, Track } from '../../types/track'
import type { MenuAction, MenuEntry, MenuSubmenu } from '../menu/Menu'
import { trackMenuEntries } from './trackMenuEntries'

const track = (id: number, extra: Partial<Track> = {}) =>
  ({ id, title: `Track ${id}`, file_path: `/Music/${id}.mp3`, ...extra }) as Track
const playlist = (id: number, name: string) => ({ id, name }) as Playlist
const find = (entries: MenuEntry[], label: string) =>
  entries.find((e) => e.kind !== 'separator' && e.label === label) as
    | MenuAction
    | MenuSubmenu
    | undefined
```

In `src/components/track-table/trackMenuEntries.test.ts`, replace

```ts
  })

  it('greys Add to Playlist with no playlists to add to', () => {
    const entries = trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions })
    expect((find(entries, 'Add to Playlist') as MenuAction).disabled).toBe(true)
  })
})
```

with

```ts
  })

  it('greys Add to Playlist with no playlists to add to', () => {
    const entries = trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions })
    expect((find(entries, 'Add to Playlist') as MenuAction).disabled).toBe(true)
  })

  it('moves every selected track to a folder, greying the one they share', () => {
    const onMoveToFolder = vi.fn()
    const tracks = [
      track(1, { file_path: '/Music/House/a.mp3' }),
      track(2, { file_path: '/Music/House/b.mp3' }),
    ]
    const folders = [
      { path: '/Music', label: 'Music' },
      { path: '/Music/House', label: 'Music / House' },
    ]
    const entries = trackMenuEntries({ tracks, playlists: [], genres: [], folders, onMoveToFolder })
    const move = find(entries, 'Move to folder') as MenuSubmenu
    expect(move.search).toBeDefined()
    const [music, house] = move.entries as MenuAction[]
    expect(house.disabled).toBe(true)
    expect(music.disabled).toBe(false)
    music.onSelect()
    expect(onMoveToFolder).toHaveBeenCalledWith(tracks, folders[0])
  })

  it('says it is reading the folders until they come', () => {
    const entries = trackMenuEntries({
      tracks: [track(1)],
      playlists: [],
      genres: [],
      folders: null,
      onMoveToFolder: vi.fn(),
    })
    const [reading] = (find(entries, 'Move to folder') as MenuSubmenu).entries as MenuAction[]
    expect(reading.label).toBe('Reading folders…')
    expect(reading.disabled).toBe(true)
  })
})
```

Run: `npx vitest run src/components/track-table/trackMenuEntries.test.ts` — the two new tests FAIL.

- [ ] **Step 2: The entry**

In `src/components/track-table/trackMenuEntries.ts`, replace

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
```

with

```ts
// src/components/track-table/trackMenuEntries.ts
// The track table's right-click menu (track table spec, Right-click menu):
// every item acts on all the selected tracks at once. Add / Edit Comment and
// Generate AI Playlist take one track: greyed with several selected.
import type { LibraryFolder, Playlist, Track } from '../../types/track'
import { sharedFolder } from '../../lib/trackTable/moveMessages'
import type { MenuEntry } from '../menu/Menu'

export interface TrackMenuActions {
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onAnalyze?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  /** Set Genre ▸ Custom…: asks for a name. */
  onCustomGenre?: (tracks: Track[]) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
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
  /** The library's folders for Move to folder ▸; null while they are read. */
  folders?: LibraryFolder[] | null
}

export function trackMenuEntries({
  tracks,
  playlists,
  genres,
  folders = null,
  ...actions
}: TrackMenuInput): MenuEntry[] {
  const one = tracks.length === 1
  // The genre every selected track has, if they share one.
  const genre = tracks.every((t) => t.genre === tracks[0].genre) ? tracks[0].genre : undefined
  const entries: MenuEntry[] = []
```

In `src/components/track-table/trackMenuEntries.ts`, replace

```ts

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
```

with

```ts

  if (actions.onClearGenre && tracks.some((t) => t.genre)) {
    const clear = actions.onClearGenre
    entries.push({ kind: 'action', label: 'Clear Genre', icon: 'X', onSelect: () => clear(tracks) })
  }

  if (actions.onMoveToFolder) {
    const move = actions.onMoveToFolder
    // Every selected track in one folder: that folder is greyed.
    const here = sharedFolder(tracks)
    entries.push({
      kind: 'submenu',
      label: 'Move to folder',
      icon: 'FolderInput',
      search: { placeholder: 'Find a folder', empty: 'No folder matches' },
      entries:
        folders === null
          ? [{ kind: 'action', label: 'Reading folders…', disabled: true, onSelect: () => {} }]
          : folders.map((folder) => ({
              kind: 'action',
              label: folder.label,
              icon: 'Folder',
              disabled: folder.path === here,
              onSelect: () => move(tracks, folder),
            })),
    })
  }

  if (actions.onEditComment) {
    const edit = actions.onEditComment
    entries.push({
      kind: 'action',
      label: one && tracks[0].comment ? 'Edit Comment' : 'Add Comment',
      icon: 'MessageSquare',
```

Run the tests again — PASS, 8.

- [ ] **Step 3: The folder list, read as the menu opens**

```ts
// src/components/track-table/useLibraryFolders.ts
// The library's folders for Move to folder ▸, read each time the right-click
// menu opens (folders come and go on disk); the last list shows meanwhile.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import type { LibraryFolder } from '../../types/track'

export function useLibraryFolders(open: boolean): LibraryFolder[] | null {
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    tauriApi
      .listLibraryFolders()
      .then((list) => live && setFolders(list))
      .catch(() => live && setFolders([]))
    return () => {
      live = false
    }
  }, [open])

  return folders
}
```

In `src/components/TrackTable.tsx`, replace

```tsx
  useCallback,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
import { audioPlayer } from '../lib/audioPlayer'
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { isOverlayOpen, useOverlay } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
```

with

```tsx
  useCallback,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { LibraryFolder, Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
import { audioPlayer } from '../lib/audioPlayer'
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { useLibraryFolders } from './track-table/useLibraryFolders'
import { isOverlayOpen, useOverlay } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
```

In `src/components/TrackTable.tsx`, replace

```tsx
  // The right-click menu's actions: each takes every selected track at once.
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
  onUpdateTrack?: (track: Track) => void
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>
  onGenerateAIPlaylist?: (track: Track) => void
  onGetPlaylistRecommendations?: (
    playlistId: number,
    playlistName: string,
```

with

```tsx
  // The right-click menu's actions: each takes every selected track at once.
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
  onUpdateTrack?: (track: Track) => void
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>
  onGenerateAIPlaylist?: (track: Track) => void
  onGetPlaylistRecommendations?: (
    playlistId: number,
    playlistName: string,
```

In `src/components/TrackTable.tsx`, replace

```tsx
      onTrackDoubleClick,
      onAnalyzeTracks,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
      onUpdateTrack,
      genreDefinitions = [],
      onGenerateAIPlaylist,
      onGetPlaylistRecommendations,
      onOpenMixPrep,
      onSearch,
```

with

```tsx
      onTrackDoubleClick,
      onAnalyzeTracks,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
      onMoveToFolder,
      onUpdateTrack,
      genreDefinitions = [],
      onGenerateAIPlaylist,
      onGetPlaylistRecommendations,
      onOpenMixPrep,
      onSearch,
```

In `src/components/TrackTable.tsx`, replace

```tsx
    const menuTracks = useMemo(
      () => (menuAt ? selectedTracks(selection, sortedTracks) : []),
      [menuAt, selection, sortedTracks],
    )
    // Its tracks left the view (a reload): the menu closes for good.
    if (menuAt && menuTracks.length === 0) setMenuAt(null)

    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
```

with

```tsx
    const menuTracks = useMemo(
      () => (menuAt ? selectedTracks(selection, sortedTracks) : []),
      [menuAt, selection, sortedTracks],
    )
    // Its tracks left the view (a reload): the menu closes for good.
    if (menuAt && menuTracks.length === 0) setMenuAt(null)
    // Move to folder ▸'s list, read as the menu opens.
    const libraryFolders = useLibraryFolders(menuAt !== null && onMoveToFolder !== undefined)

    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
```

In `src/components/TrackTable.tsx`, replace

```tsx
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
```

with

```tsx
                  value:
                    selected.every((t) => t.genre === selected[0].genre)
                      ? selected[0].genre || ''
                      : '',
                }),
              onClearGenre,
              folders: libraryFolders,
              onMoveToFolder,
              onRemoveFromPlaylist:
                selectedPlaylistId != null ? onRemoveFromPlaylist : undefined,
              onEditComment: editComment,
              onGenerateAIPlaylist,
            })}
          />
```

- [ ] **Step 4:** `npx tsc --noEmit -p .` — no errors. `npx eslint src/components/track-table src/components/TrackTable.tsx` — only the existing `incompatible-library` warning. Commit:

```bash
git add src/components/track-table/trackMenuEntries.ts src/components/track-table/trackMenuEntries.test.ts src/components/track-table/useLibraryFolders.ts src/components/TrackTable.tsx
git commit -m "feat(tracks): Move to folder ▸ — every library folder, searchable, the one the tracks share greyed"
```

---

### Task 8: App moves them

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1**

In `src/App.tsx`, replace

```tsx
import { useTrackTableLayout } from './store/trackTableLayoutStore'
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
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
import type {
  Track,
  Playlist,
  AnalysisProgressEvent,
  AnalysisCompleteEvent,
} from './types/track'
import './App.css'
import './components/TrackTable.css'
```

with

```tsx
import { useTrackTableLayout } from './store/trackTableLayoutStore'
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
import { tauriApi } from './lib/tauri-api'
import { dismissToast, toast } from './lib/toast'
import { audioPlayer } from './lib/audioPlayer'
import { evictArtworkCache } from './lib/artworkCache'
import { thumbnails } from './lib/thumbnails/thumbnails'
import {
  folderName,
  movedMessage,
  skipDetail,
  undoGroups,
  type Skip,
} from './lib/trackTable/moveMessages'
import {
  addedMessage,
  alreadyMessage,
  genreClearedMessage,
  genreSetMessage,
  genreSnapshot,
  removedMessage,
  tracksSubject,
} from './lib/trackTable/bulkMessages'
import type {
  Track,
  Playlist,
  LibraryFolder,
  MoveReport,
  AnalysisProgressEvent,
  AnalysisCompleteEvent,
} from './types/track'
import './App.css'
import './components/TrackTable.css'
```

In `src/App.tsx`, replace

```tsx
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Persist a track update (rating, comment, etc.) and refresh the list
  async function handleUpdateTrack(track: Track) {
    try {
      await tauriApi.updateTrack(track)
      await loadTracks()
    } catch (err) {
```

with

```tsx
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Move to folder (track table spec): the files move on disk. The track
  // playing — and during a crossfade the one coming in — stays where it is:
  // the player streams it from its path.
  function tracksInUse(): Set<number> {
    const ids = new Set<number>()
    const current = usePlayerStore.getState().currentTrack
    if (current) ids.add(current.id)
    if (audioPlayer.incomingTrackId !== null) ids.add(audioPlayer.incomingTrackId)
    return ids
  }

  // Moves the tracks' files, then gives the player's queue their new paths,
  // forgets their covers (a folder's cover.jpg may differ), and reloads the
  // view and the sidebar's folder tree. Answers what moved and what stayed.
  async function moveFiles(
    ids: number[],
    folder: string,
  ): Promise<{ moved: MoveReport['moved']; skipped: Skip[] }> {
    const inUse = tracksInUse()
    const playing: Skip[] = ids.filter((id) => inUse.has(id)).map((id) => ({ id, reason: 'playing' }))
    const movable = ids.filter((id) => !inUse.has(id))
    const report: MoveReport =
      movable.length > 0
        ? await tauriApi.moveTracksToFolder(movable, folder)
        : { moved: [], skipped: [] }
    if (report.moved.length > 0) {
      usePlayerStore
        .getState()
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
    const name = folderName(folder.label)
    const byId = new Map(selected.map((t) => [t.id, t]))
    const titleOf = (id: number) => byId.get(id)?.title
    // A copy across disks takes a while: say so when it does.
    let working: number | null = null
    const slow = setTimeout(() => {
      working = toast(`Moving ${tracksSubject(selected)} to ${name}…`, { kind: 'info' })
    }, 400)
    try {
      const { moved, skipped } = await moveFiles(
        selected.map((t) => t.id),
        folder.path,
      )
      toast(movedMessage(moved.map((m) => byId.get(m.id)!), skipped, name), {
        kind: skipped.length > 0 ? 'warning' : 'success',
        detail: skipped.length > 0 ? skipDetail(skipped, titleOf) : undefined,
        // Undo: back to the folders they came from, once per folder; what
        // stays is reported as a move reports it.
        action:
          moved.length === 0
            ? undefined
            : {
                label: 'Undo',
                run: () => {
                  const oldPath = (id: number) => byId.get(id)!.file_path
                  ;(async () => {
                    const back: MoveReport['moved'] = []
                    const stayed: Skip[] = []
                    for (const group of undoGroups(moved, oldPath)) {
                      const result = await moveFiles(group.ids, group.folder)
                      back.push(...result.moved)
                      stayed.push(...result.skipped)
                    }
                    if (stayed.length > 0) {
                      toast(movedMessage(back.map((m) => byId.get(m.id)!), stayed, 'where they were'), {
                        kind: 'warning',
                        detail: skipDetail(stayed, titleOf),
                      })
                    }
                  })().catch((err) => toast(`Couldn't undo: ${errorText(err)}`, { kind: 'error' }))
                },
              },
      })
    } catch (err) {
      toast(`Couldn't move to ${name}: ${errorText(err)}`, { kind: 'error' })
    } finally {
      clearTimeout(slow)
      if (working !== null) dismissToast(working)
    }
  }

  // Persist a track update (rating, comment, etc.) and refresh the list
  async function handleUpdateTrack(track: Track) {
    try {
      await tauriApi.updateTrack(track)
      await loadTracks()
    } catch (err) {
```

In `src/App.tsx`, replace

```tsx
                    onTrackDoubleClick={handlePlayTrack}
                    onAnalyzeTracks={handleAnalyzeTracks}
                    onAddToPlaylist={handleAddToPlaylist}
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onSetGenre={handleSetGenre}
                    onClearGenre={handleClearGenre}
                    onUpdateTrack={handleUpdateTrack}
                    genreDefinitions={genreDefinitions}
                    onGenerateAIPlaylist={
                      AI_ENABLED ? handleGenerateAIPlaylist : undefined
                    }
                    onGetPlaylistRecommendations={
```

with

```tsx
                    onTrackDoubleClick={handlePlayTrack}
                    onAnalyzeTracks={handleAnalyzeTracks}
                    onAddToPlaylist={handleAddToPlaylist}
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onSetGenre={handleSetGenre}
                    onClearGenre={handleClearGenre}
                    onMoveToFolder={handleMoveToFolder}
                    onUpdateTrack={handleUpdateTrack}
                    genreDefinitions={genreDefinitions}
                    onGenerateAIPlaylist={
                      AI_ENABLED ? handleGenerateAIPlaylist : undefined
                    }
                    onGetPlaylistRecommendations={
```

- [ ] **Step 2: Check**
  - `npx tsc --noEmit -p .` — no errors.
  - `npx vitest run 2>&1 | grep "Tests "` — `507 passed`.
  - `npx eslint src 2>&1 | tail -2` — `✖ 22 problems (10 errors, 12 warnings)`.
  - `npx vite build 2>&1 | tail -1` — `✓ built in …`.

  Commit:

```bash
git add src/App.tsx
git commit -m "feat(tracks): Move to folder — the track playing stays, the queue gets the new paths, one toast with the reasons on hover and Undo"
```

---

### Task 9: The specs know what is built

**Files:** Modify `docs/superpowers/specs/2026-10-04-interactions-design.md`, `docs/superpowers/specs/2026-10-04-track-table-design.md`.

- [ ] **Step 1:**
  - In the interactions spec, change `which plan 5 adds), and` to `built by plan 5), and`.
  - In the track table spec's Move to folder list, after the bullet that ends `and path instead;`, add a bullet:

    `- (built: the player store's playRequest — raised by a play, next, previous — and the current track's id and path key that effect, so shuffling and adding to the queue no longer restart the song either);`
- [ ] **Step 2:** Commit:

  ```bash
  git commit -am "docs(spec): Move to folder and the toast's detail are built"
  ```

  Check first that only these two files are staged; leave `.claude/settings.local.json` and `.planning/STATE.md` out.

---

### Task 10: Check in the app (WebKit)

- [ ] **Step 1:** `npm run tauri dev`. The Rust changed, so it rebuilds.
- [ ] **Step 2: The checklist, by hand.** Try it on copies or test tracks first: files really move.
  - **Same disk:** select 3 tracks in a folder, then Move to folder ▸ another folder.
    - The files move in Finder, and the toast says "Moved 3 tracks to …".
    - The folder views and the sidebar's counts follow.
    - BPM, key, playlists and history stay.
    - Undo puts them back.
  - **The track playing:** include it. It stays and keeps playing without a restart; the toast says "Moved 2 · 1 skipped (playing now)", and hovering shows the title.
  - **The queue:** if the moved tracks are next in the queue, they play from their new place. Shuffle on, then off, still plays them, and the song playing does not restart on either.
  - **A name already in the folder:** that track is skipped, and its file is untouched.
  - **The list:**
    - the folder the tracks share is grey;
    - typing narrows the list;
    - ↓ Enter chooses;
    - a new folder made in Finder shows up the next time the menu opens.
  - **Across disks** (a library folder on another drive, if there is one): a big file moves; "Moving …" shows while it copies; no `.recodeck-moving` file is left behind; the window stays responsive.
  - **Covers:** a track whose cover came from a folder's `cover.jpg` shows the new folder's cover (or none) after the move.
- [ ] **Step 3:** Commit any fix-ups as `fix(tracks): …`.
