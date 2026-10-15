# Missing Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tracks whose file was moved stop pointing at dead paths:
- the scanner follows a moved file with unchanged content;
- a "Missing Files" review in Settings → Database relinks, merges or removes the rest.

**Spec:** `docs/superpowers/specs/2026-10-15-missing-files-design.md`. It is the contract. Where this plan and the spec disagree, the spec wins. Report the disagreement.

**Architecture:**
- **Rust, `src-tauri/src/db/missing.rs`.** Database primitives:
  - the hash decision for scans;
  - relink, complete delete, the rule-5 library-track lookup;
  - the one-transaction apply.
- **Rust, `src-tauri/src/missing_files.rs`.** The disk side: missing check, name index, lofty probe, drive check. It composes the review in stages, so the Tauri commands hold the DB lock only around `Database` calls.
- **Rust, `db/merge.rs`.** Its body is split into `merge_on(conn, …)`, so the apply can merge inside its own transaction.
- **Frontend:**
  - a pure state module `src/lib/missingFiles/missingChoice.ts`, with defaults, conflicts and fixes;
  - a modal that reuses `DuplicatesModal.css`;
  - a shared `addFolderAndScan` in `SettingsContext`.

**Tech stack:** Tauri 2, Rust (rusqlite 0.31, lofty, walkdir, tempfile in tests), React 18 + TypeScript, vitest.

**Commands** (run from the repo root unless noted):
- Rust tests: `cd src-tauri && cargo test --lib <filter>`
- Rust build: `cd src-tauri && cargo build`
- Frontend tests: `npx vitest run <path>`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`. It has 9 pre-existing errors; add none.

**Repo rules:**
- **Public repo:** no personal names, home paths or real track names in code, tests or commits. Use `/m/...`, `/gone/...` and temp dirs.
- **Never commit** `.planning/`, `.claude/`, `.mcp.json` or `src-tauri/src/bin/recodeck-analyze.rs`.
- **Stage files by name.** Never use `git add -A` or `git commit -a`.
- **Every commit message ends with:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- A Prettier hook reformats TS files after edits. That is expected.
- Branch: `feat/missing-files` (already checked out; the spec is committed there).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/test_support.rs` | new | Test-only helper: write a real WAV file lofty can read. |
| `src-tauri/src/db/missing.rs` | new | `FileFacts`, `HashMatch`, `RelinkOutcome`, `relink_on`, `delete_track_on`, `library_track_for`, `library_folders`, `all_track_paths`, `validate_fixes`, `apply_missing_fixes`. |
| `src-tauri/src/db/mod.rs` | modify | `pub mod missing;`. Drop `track_exists_with_hash`. Folder cleanups use the complete delete in a transaction. |
| `src-tauri/src/db/merge.rs` | modify | Split the body into `merge_on(conn, requests)`. |
| `src-tauri/src/scanner.rs` | modify | `ScanResult.relinked`, `ImportOutcome`, and the hash decision in `import_file`. |
| `src-tauri/src/missing_files.rs` | new | The disk side and the staged review: `look_on_disk`, `describe`, `describe_file`, `read_relinks`, `count_missing`. |
| `src-tauri/src/commands/library.rs` | modify | `scan_directory` follows moved files, `ScanResultDTO.relinked`, the new DTOs, and 4 commands. |
| `src-tauri/src/lib.rs` | modify | Module declarations and command registration. |
| `src/types/track.ts` | modify | `ScanResult.relinked`, plus the Missing Files types. |
| `src/lib/tauri-api.ts` | modify | 4 wrappers. |
| `src/lib/missingFiles/messages.ts` (+ test) | new | Toast and notice texts. |
| `src/lib/missingFiles/paths.ts` (+ test) | new | `isInsideFolders`, `parentFolder`, `baseName`. |
| `src/lib/missingFiles/missingChoice.ts` (+ test) | new | Review state: defaults, conflicts, fixes and the button label. |
| `src/components/settings/SettingsContext.tsx` | modify | `addFolderAndScan`, and the "Followed N moved files" notices. |
| `src/App.tsx` | modify | The watcher rescan toasts the followed files. |
| `src/components/MissingFilesModal.tsx` + `.css` | new | The review modal. |
| `src/components/settings/DatabaseSection.tsx` | modify | The entry button with its count. |

---

### Task 1: Relink and the hash decision (db/missing.rs)

**Files:**
- Create: `src-tauri/src/test_support.rs`
- Create: `src-tauri/src/db/missing.rs`
- Modify: `src-tauri/src/lib.rs` (module list near line 2-11)
- Modify: `src-tauri/src/db/mod.rs:6-12` (module list)

- [ ] **Step 1: Add the WAV test helper**

Create `src-tauri/src/test_support.rs`:

```rust
//! Helpers shared by tests in several modules.

use std::path::Path;

/// Writes a silent 8 kHz mono 16-bit WAV of `millis` length that lofty can
/// read. `seed` fills the samples, so two files with the same length can still
/// have different content (and hash).
pub fn write_wav(path: &Path, millis: u32, seed: u8) {
    let rate: u32 = 8000;
    let data_len = rate * 2 * millis / 1000;
    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, seed);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}
```

In `src-tauri/src/lib.rs`, below the `pub mod server;` line, add:

```rust
#[cfg(test)]
mod test_support;
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/db/missing.rs` with only the tests first:

```rust
// src-tauri/src/db/missing.rs
//! Missing Files (spec docs/superpowers/specs/2026-10-15-missing-files-design.md):
//! the database side. A track whose file is gone is relinked to its file's
//! new place, merged into the library track that has the file now, or
//! removed completely.

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn db() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn insert(db: &Database, path: &str, hash: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO tracks (file_path, file_hash, title, rating, file_size) VALUES (?1, ?2, 'Song', 4, 100)",
                params![path, hash],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn facts(path: &str) -> FileFacts {
        FileFacts {
            path: path.into(),
            file_hash: "new-hash".into(),
            file_size: Some(200),
            file_format: Some("wav".into()),
            bitrate: Some(1411),
            sample_rate: Some(44100),
            duration_ms: Some(7000),
        }
    }

    #[test]
    fn relink_changes_only_the_file_columns() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");

        assert_eq!(db.relink_track(id, &facts("/new/song.wav")).unwrap(), RelinkOutcome::Relinked);

        let t = db.get_track(id).unwrap();
        assert_eq!(t.file_path, "/new/song.wav");
        assert_eq!(t.file_hash, "new-hash");
        assert_eq!(t.file_size, Some(200));
        assert_eq!(t.file_format.as_deref(), Some("wav"));
        assert_eq!((t.bitrate, t.sample_rate, t.duration_ms), (Some(1411), Some(44100), Some(7000)));
        assert_eq!(t.title.as_deref(), Some("Song"));
        assert_eq!(t.rating, 4);
    }

    #[test]
    fn relink_keeps_playlist_slots_and_plays() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");
        db.conn.execute("INSERT INTO playlists (name) VALUES ('P')", []).unwrap();
        let playlist = db.conn.last_insert_rowid();
        db.conn
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, 1)",
                params![playlist, id],
            )
            .unwrap();
        db.conn.execute("INSERT INTO play_history (track_id) VALUES (?1)", [id]).unwrap();

        db.relink_track(id, &facts("/new/song.wav")).unwrap();

        let count = |sql: &str| -> i64 { db.conn.query_row(sql, [id], |r| r.get(0)).unwrap() };
        assert_eq!(count("SELECT COUNT(*) FROM playlist_tracks WHERE track_id = ?1"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM play_history WHERE track_id = ?1"), 1);
    }

    #[test]
    fn relink_takes_the_path_off_the_skip_list() {
        let db = db();
        let id = insert(&db, "/old/song.mp3", "old-hash");
        db.conn
            .execute("INSERT INTO skipped_files (file_path) VALUES ('/new/song.wav')", [])
            .unwrap();

        db.relink_track(id, &facts("/new/song.wav")).unwrap();

        let left: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM skipped_files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn relink_to_another_tracks_file_is_refused() {
        let db = db();
        let a = insert(&db, "/old/a.mp3", "a");
        insert(&db, "/new/b.mp3", "b");

        assert_eq!(db.relink_track(a, &facts("/new/b.mp3")).unwrap(), RelinkOutcome::Taken);
        assert_eq!(db.get_track(a).unwrap().file_path, "/old/a.mp3");
    }

    #[test]
    fn relink_to_its_own_path_does_nothing() {
        let db = db();
        let a = insert(&db, "/m/a.mp3", "a");
        assert_eq!(db.relink_track(a, &facts("/m/a.mp3")).unwrap(), RelinkOutcome::AlreadyThere);
        assert_eq!(db.get_track(a).unwrap().file_hash, "a");
    }

    #[test]
    fn relink_of_a_deleted_track_says_so() {
        let db = db();
        assert_eq!(db.relink_track(999, &facts("/m/x.wav")).unwrap(), RelinkOutcome::TrackGone);
    }

    #[test]
    fn an_unknown_or_new_hash_is_new() {
        let db = db();
        insert(&db, "/gone/a.mp3", "unknown");
        assert_eq!(db.match_scanned_hash("unknown").unwrap(), HashMatch::New);
        assert_eq!(db.match_scanned_hash("nobody-has-this").unwrap(), HashMatch::New);
    }

    #[test]
    fn a_hash_whose_track_still_has_its_file_is_a_duplicate() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.mp3");
        std::fs::write(&file, b"x").unwrap();
        insert(&db, "/gone/old.mp3", "h");
        insert(&db, &file.to_string_lossy(), "h");

        assert_eq!(db.match_scanned_hash("h").unwrap(), HashMatch::Duplicate);
    }

    #[test]
    fn when_every_track_with_the_hash_lost_its_file_the_lowest_id_follows() {
        let db = db();
        let first = insert(&db, "/gone/a.mp3", "h");
        insert(&db, "/gone/b.mp3", "h");

        assert_eq!(db.match_scanned_hash("h").unwrap(), HashMatch::Moved(first));
    }
}
```

In `src-tauri/src/db/mod.rs`, add `pub mod missing;` to the module list (after `pub mod merge;`).

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `cd src-tauri && cargo test --lib db::missing`
Expected: compile errors (`FileFacts`, `RelinkOutcome`, `HashMatch`, `relink_track`, `match_scanned_hash` not found).

- [ ] **Step 4: Implement**

Put this ABOVE the `#[cfg(test)]` block in `src-tauri/src/db/missing.rs`:

```rust
use super::{Database, Track};
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

/// The file columns a relink takes from the file itself (spec section 2).
#[derive(Debug, Clone, PartialEq)]
pub struct FileFacts {
    /// Normalized with `normalize_scanned_path`.
    pub path: String,
    pub file_hash: String,
    pub file_size: Option<i64>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub duration_ms: Option<i32>,
}

impl FileFacts {
    /// The file columns of a track the scanner just read.
    pub fn from_track(track: &Track) -> Self {
        FileFacts {
            path: crate::scanner::normalize_scanned_path(&track.file_path),
            file_hash: track.file_hash.clone(),
            file_size: track.file_size,
            file_format: track.file_format.clone(),
            bitrate: track.bitrate,
            sample_rate: track.sample_rate,
            duration_ms: track.duration_ms,
        }
    }
}

/// What a relink did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelinkOutcome {
    Relinked,
    /// The track already points at this file: nothing to do.
    AlreadyThere,
    /// Another track has this file. That is a merge, not a relink.
    Taken,
    /// The track no longer exists.
    TrackGone,
}

/// What a scan does with a file whose content hash may already be known
/// (spec section 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashMatch {
    /// No track has this content: import the file.
    New,
    /// A track with this content still has its file: skip it, as before.
    Duplicate,
    /// Every track with this content lost its file: the one with the lowest
    /// id follows this file.
    Moved(i64),
}

/// Points `track_id` at the file in `facts`, on `conn` (the caller may hold a
/// transaction). Only the file columns change: tags, rating, analysis,
/// playlists and plays stay. The path comes off `skipped_files`.
pub(crate) fn relink_on(conn: &Connection, track_id: i64, facts: &FileFacts) -> Result<RelinkOutcome> {
    let owner: Option<i64> = conn
        .query_row("SELECT id FROM tracks WHERE file_path = ?1", [&facts.path], |row| row.get(0))
        .optional()?;
    match owner {
        Some(id) if id == track_id => return Ok(RelinkOutcome::AlreadyThere),
        Some(_) => return Ok(RelinkOutcome::Taken),
        None => {}
    }
    let changed = conn.execute(
        "UPDATE tracks SET file_path = ?1, file_hash = ?2, file_size = ?3, file_format = ?4,
                bitrate = ?5, sample_rate = ?6, duration_ms = ?7
         WHERE id = ?8",
        params![
            facts.path,
            facts.file_hash,
            facts.file_size,
            facts.file_format,
            facts.bitrate,
            facts.sample_rate,
            facts.duration_ms,
            track_id
        ],
    )?;
    if changed == 0 {
        return Ok(RelinkOutcome::TrackGone);
    }
    conn.execute("DELETE FROM skipped_files WHERE file_path = ?1", [&facts.path])?;
    Ok(RelinkOutcome::Relinked)
}

impl Database {
    /// Points a track at its file's new place. See `relink_on`.
    pub fn relink_track(&self, track_id: i64, facts: &FileFacts) -> Result<RelinkOutcome> {
        relink_on(&self.conn, track_id, facts)
    }

    /// Spec section 1: what a scan does with a file of this content hash.
    /// Both scan paths call this.
    pub fn match_scanned_hash(&self, file_hash: &str) -> Result<HashMatch> {
        if file_hash == "unknown" {
            return Ok(HashMatch::New);
        }
        let mut stmt = self
            .conn
            .prepare("SELECT id, file_path FROM tracks WHERE file_hash = ?1 ORDER BY id")?;
        let rows = stmt
            .query_map([file_hash], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        let Some(lowest) = rows.first().map(|(id, _)| *id) else {
            return Ok(HashMatch::New);
        };
        if rows.iter().any(|(_, path)| Path::new(path).exists()) {
            return Ok(HashMatch::Duplicate);
        }
        Ok(HashMatch::Moved(lowest))
    }
}
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib db::missing`
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/test_support.rs src-tauri/src/db/missing.rs src-tauri/src/db/mod.rs src-tauri/src/lib.rs
git commit -m "feat(db): relink a track to its moved file, and the scan's hash decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The scanner follows moved files

**Files:**
- Modify: `src-tauri/src/scanner.rs`: `ScanResult` (lines 16-22), `import_file` (lines ~171-197), `import_directory` (lines ~200-240), tests.
- Modify: `src-tauri/src/commands/library.rs`: `ScanResultDTO` (~139-169), and the hash check in `scan_directory` (~329-336).
- Modify: `src-tauri/src/db/mod.rs`: delete `track_exists_with_hash` (~1280-1289).
- Modify: `src/types/track.ts`: `ScanResult` (~56-61).

- [ ] **Step 1: Write the failing tests**

Append these to the `mod tests` block in `src-tauri/src/scanner.rs`. They use the module's existing imports (`TempDir`, `Database`):

```rust
    fn blank_track(path: &str, hash: &str) -> Track {
        Track {
            id: None,
            file_path: path.into(),
            file_hash: hash.into(),
            title: None,
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

    #[test]
    fn a_moved_file_with_the_same_content_relinks_its_track() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let old = dir.path().join("a/song.wav");
        crate::test_support::write_wav(&old, 1000, 1);
        assert_eq!(Scanner::import_directory(&db, dir.path()).imported, 1);
        let id = db.get_all_tracks().unwrap()[0].id;

        std::fs::create_dir_all(dir.path().join("b")).unwrap();
        std::fs::rename(&old, dir.path().join("b/song.wav")).unwrap();
        let second = Scanner::import_directory(&db, dir.path());

        assert_eq!((second.imported, second.relinked, second.skipped), (0, 1, 0));
        let tracks = db.get_all_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, id);
        assert!(tracks[0].file_path.ends_with("/b/song.wav"));
    }

    #[test]
    fn a_copy_of_a_track_that_still_has_its_file_is_skipped() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let original = dir.path().join("a/song.wav");
        crate::test_support::write_wav(&original, 1000, 1);
        Scanner::import_directory(&db, dir.path());

        std::fs::create_dir_all(dir.path().join("b")).unwrap();
        std::fs::copy(&original, dir.path().join("b/copy.wav")).unwrap();
        let second = Scanner::import_directory(&db, dir.path());

        assert_eq!((second.imported, second.relinked, second.skipped), (0, 0, 2));
        assert_eq!(db.count_tracks().unwrap(), 1);
    }

    #[test]
    fn of_two_stale_tracks_with_the_same_content_the_lowest_id_relinks() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("song.wav");
        crate::test_support::write_wav(&file, 1000, 1);
        let hash = Scanner::calculate_file_hash(&file).unwrap();
        let first = db.create_track(&blank_track("/gone/a.wav", &hash)).unwrap();
        let second = db.create_track(&blank_track("/gone/b.wav", &hash)).unwrap();

        let result = Scanner::import_directory(&db, dir.path());

        assert_eq!(result.relinked, 1);
        assert!(db.get_track(first).unwrap().file_path.ends_with("/song.wav"));
        assert_eq!(db.get_track(second).unwrap().file_path, "/gone/b.wav");
    }
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `cd src-tauri && cargo test --lib scanner::`
Expected: compile error, because `ScanResult` has no field `relinked`.

- [ ] **Step 3: Implement in `scanner.rs`**

1. Add a use line under the existing `use crate::db::{Database, Track};`:

```rust
use crate::db::missing::{FileFacts, HashMatch, RelinkOutcome};
```

2. `ScanResult` gains a field after `skipped`:

```rust
    /// Tracks whose file was gone, now pointing at the moved file (Missing Files spec).
    pub relinked: usize,
```

3. Add an enum after `ScanError`:

```rust
/// What importing one file did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportOutcome {
    Imported(i64),
    /// A track whose file was gone now points at this file (Missing Files spec).
    Relinked(i64),
}
```

4. Replace `import_file`, from its doc comment down to the duplicate-hash `if`. Keep the body after `create_track` as it is, but return `Ok(ImportOutcome::Imported(id))` at the end:

```rust
    /// Import a single file into the database.
    /// If the file has BPM in its tags (e.g. from Traktor), it is saved to track_analysis so RecoDeck matches.
    /// If the file has Genre in its tags, it is saved with source='tag'.
    /// A file whose content is already in the library is skipped, unless every
    /// track with that content lost its file: then the lowest one follows this
    /// file (Missing Files spec, section 1).
    pub fn import_file(db: &Database, path: &Path) -> Result<ImportOutcome, String> {
        let (track, tag_bpm, tag_genre) = Self::extract_metadata(path)?;

        match db
            .match_scanned_hash(&track.file_hash)
            .map_err(|e| format!("Database error: {}", e))?
        {
            HashMatch::Duplicate => return Err("DUPLICATE_HASH".to_string()),
            HashMatch::Moved(id) => {
                return match db
                    .relink_track(id, &FileFacts::from_track(&track))
                    .map_err(|e| format!("Database error: {}", e))?
                {
                    RelinkOutcome::Relinked | RelinkOutcome::AlreadyThere => Ok(ImportOutcome::Relinked(id)),
                    RelinkOutcome::Taken | RelinkOutcome::TrackGone => Err("DUPLICATE_HASH".to_string()),
                };
            }
            HashMatch::New => {}
        }

        let id = db.create_track(&track)
            .map_err(|e| format!("Database error: {}", e))?;
```

The function's last line becomes `Ok(ImportOutcome::Imported(id))`.

5. In `import_directory`:
   - add `let mut relinked = 0;` next to `let mut skipped = 0;`;
   - replace `Ok(_) => imported += 1,` with:

```rust
                Ok(ImportOutcome::Imported(_)) => imported += 1,
                Ok(ImportOutcome::Relinked(_)) => relinked += 1,
```

   - add `relinked,` to the returned `ScanResult { … }`.

- [ ] **Step 4: Implement in `commands/library.rs` and `db/mod.rs`**

1. Under `use crate::db::merge::{…};`, add:

```rust
use crate::db::missing::{FileFacts, HashMatch, RelinkOutcome};
```

2. `ScanResultDTO` gains `pub relinked: usize,` after `skipped`, and `From<ScanResult>` sets `relinked: result.relinked,`.

3. In `scan_directory`:
   - add `let mut relinked = 0;` next to `let mut skipped = 0;`;
   - replace the block

```rust
                // Check for duplicate hash
                if track.file_hash != "unknown"
                    && db.track_exists_with_hash(&track.file_hash).unwrap_or(false) {
                        skipped += 1;
                        continue;
                    }
```

   with

```rust
                // Same content already in the library: skip it, unless every
                // track with that content lost its file, then the lowest one
                // follows this file (Missing Files spec, section 1).
                match db.match_scanned_hash(&track.file_hash) {
                    Ok(HashMatch::Duplicate) => {
                        skipped += 1;
                        continue;
                    }
                    Ok(HashMatch::Moved(id)) => {
                        match db.relink_track(id, &FileFacts::from_track(&track)) {
                            Ok(RelinkOutcome::Relinked) | Ok(RelinkOutcome::AlreadyThere) => relinked += 1,
                            _ => skipped += 1,
                        }
                        continue;
                    }
                    Ok(HashMatch::New) | Err(_) => {}
                }
```

   - the final `ScanResult { … }` gets `relinked,`.

4. In `src-tauri/src/db/mod.rs`, delete `track_exists_with_hash` and its doc comment. It has no callers left. Run `grep -rn track_exists_with_hash src-tauri/src` and expect no output.

5. In `src/types/track.ts`, `ScanResult` gains this line after `skipped: number`:

```ts
  /** Tracks whose file was gone, now pointing at the moved file. */
  relinked: number
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib scanner:: && cargo build`
Expected: every scanner test passes, including the 3 new ones, and the build has no warnings about unused imports.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/scanner.rs src-tauri/src/commands/library.rs src-tauri/src/db/mod.rs src/types/track.ts
git commit -m "feat(scanner): follow a moved file instead of skipping it as a duplicate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Complete delete, and the folder cleanups use it

**Files:**
- Modify: `src-tauri/src/db/missing.rs`
- Modify: `src-tauri/src/db/mod.rs`: `remove_tracks_not_in_folders` (~1795-1845) and `delete_tracks_in_folder_prefix` (~627-650).

- [ ] **Step 1: Write the failing tests**

Add these to `mod tests` in `db/missing.rs`:

```rust
    /// A track with a row in every table that references tracks.
    fn track_with_everything(db: &Database, path: &str) -> i64 {
        let id = insert(db, path, path);
        let c = &db.conn;
        c.execute("INSERT INTO playlists (name) VALUES ('P')", []).unwrap();
        let playlist = c.last_insert_rowid();
        c.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, 1)",
            params![playlist, id],
        )
        .unwrap();
        c.execute("INSERT OR IGNORE INTO tags (name) VALUES ('warm')", []).unwrap();
        let tag: i64 = c.query_row("SELECT id FROM tags WHERE name = 'warm'", [], |r| r.get(0)).unwrap();
        c.execute("INSERT INTO track_tags (track_id, tag_id) VALUES (?1, ?2)", params![id, tag]).unwrap();
        c.execute("INSERT INTO track_genres (track_id, genre) VALUES (?1, 'House')", [id]).unwrap();
        c.execute("INSERT INTO track_discogs_styles (track_id, style) VALUES (?1, 'Deep House')", [id]).unwrap();
        c.execute("INSERT INTO track_instruments (track_id, instrument) VALUES (?1, 'piano')", [id]).unwrap();
        c.execute("INSERT INTO track_embeddings (track_id) VALUES (?1)", [id]).unwrap();
        c.execute("INSERT INTO track_fingerprints (track_id, chromaprint) VALUES (?1, 'fp')", [id]).unwrap();
        c.execute("INSERT INTO track_analysis (track_id, bpm) VALUES (?1, 124.0)", [id]).unwrap();
        c.execute("INSERT INTO track_deep_analysis (track_id, energy_arousal) VALUES (?1, 0.5)", [id]).unwrap();
        c.execute("INSERT INTO cue_points (track_id, position_ms) VALUES (?1, 1000)", [id]).unwrap();
        c.execute("INSERT INTO play_history (track_id) VALUES (?1)", [id]).unwrap();
        c.execute(
            "INSERT INTO spotify_match_verdicts (spotify_id, library_track_id, verdict) VALUES ('s', ?1, 'yes')",
            [id],
        )
        .unwrap();
        c.execute(
            "INSERT INTO ytm_match_verdicts (video_id, library_track_id, verdict) VALUES ('v', ?1, 'yes')",
            [id],
        )
        .unwrap();
        id
    }

    /// Rows anywhere that reference the track, its own row included.
    /// `track_with_everything` makes 14.
    fn rows_for(db: &Database, id: i64) -> i64 {
        let count = |sql: String| -> i64 { db.conn.query_row(&sql, [id], |r| r.get(0)).unwrap() };
        let mut n = count("SELECT COUNT(*) FROM tracks WHERE id = ?1".into());
        for table in TRACK_TABLES.iter().chain(["play_history"].iter()) {
            n += count(format!("SELECT COUNT(*) FROM {table} WHERE track_id = ?1"));
        }
        for table in ["spotify_match_verdicts", "ytm_match_verdicts"] {
            n += count(format!("SELECT COUNT(*) FROM {table} WHERE library_track_id = ?1"));
        }
        n
    }

    #[test]
    fn a_complete_delete_leaves_nothing_that_references_the_track() {
        let db = db();
        let id = track_with_everything(&db, "/gone/a.mp3");
        assert_eq!(rows_for(&db, id), 14);

        assert!(delete_track_on(&db.conn, id).unwrap());

        assert_eq!(rows_for(&db, id), 0);
    }

    #[test]
    fn folder_cleanups_remove_a_track_completely() {
        let db = db();
        let keep = track_with_everything(&db, "/music/keep.mp3");
        let stray = track_with_everything(&db, "/elsewhere/stray.mp3");

        assert_eq!(db.remove_tracks_not_in_folders(&["/music".to_string()]).unwrap(), 1);
        assert_eq!(rows_for(&db, stray), 0);
        assert_eq!(rows_for(&db, keep), 14);

        let inside = track_with_everything(&db, "/music/sub/x.mp3");
        assert_eq!(db.delete_tracks_in_folder_prefix("/music/sub").unwrap(), 1);
        assert_eq!(rows_for(&db, inside), 0);
        assert_eq!(rows_for(&db, keep), 14);
    }

    #[test]
    fn a_failing_folder_cleanup_changes_nothing() {
        let db = db();
        let a = track_with_everything(&db, "/elsewhere/a.mp3");
        let b = track_with_everything(&db, "/elsewhere/b.mp3");
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER fail BEFORE DELETE ON tracks WHEN OLD.id = {b} BEGIN SELECT RAISE(ABORT, 'boom'); END;"
            ))
            .unwrap();

        assert!(db.remove_tracks_not_in_folders(&["/music".to_string()]).is_err());

        assert_eq!(rows_for(&db, a), 14);
        assert_eq!(rows_for(&db, b), 14);
    }
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `cd src-tauri && cargo test --lib db::missing`
Expected: compile errors, because `TRACK_TABLES` and `delete_track_on` are not found.

- [ ] **Step 3: Implement**

1. In `db/missing.rs`, below `relink_on`:

```rust
/// Every table with a `track_id` that does not cascade on delete.
/// `play_history` cascades, and the Spotify / YouTube Music verdicts go by
/// their delete triggers.
const TRACK_TABLES: [&str; 10] = [
    "playlist_tracks",
    "track_tags",
    "track_genres",
    "track_discogs_styles",
    "track_instruments",
    "track_embeddings",
    "track_fingerprints",
    "track_analysis",
    "track_deep_analysis",
    "cue_points",
];

/// Deletes a track and every row that references it, on `conn` (inside the
/// caller's transaction). Files on disk are never touched. Answers whether
/// the track existed.
pub(crate) fn delete_track_on(conn: &Connection, track_id: i64) -> Result<bool> {
    for table in TRACK_TABLES {
        conn.execute(&format!("DELETE FROM {table} WHERE track_id = ?1"), [track_id])?;
    }
    Ok(conn.execute("DELETE FROM tracks WHERE id = ?1", [track_id])? > 0)
}
```

2. In `db/mod.rs`, replace the body of `delete_tracks_in_folder_prefix`, keeping its signature. Its doc comment becomes "Delete all tracks whose file_path is within `folder_path`, each completely, in one transaction (Missing Files spec, section 6). Returns number of track rows deleted.":

```rust
        let like_pattern = format!("{}/%", folder_path);
        let tx = self.conn.unchecked_transaction()?;
        let ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM tracks WHERE file_path LIKE ?1")?;
            let rows = stmt.query_map([&like_pattern], |row| row.get(0))?;
            rows.collect::<Result<_>>()?
        };
        for &id in &ids {
            missing::delete_track_on(&tx, id)?;
        }
        tx.commit()?;
        Ok(ids.len())
```

3. Replace the body of `remove_tracks_not_in_folders`, keeping its signature and its first doc line. Delete the "OPTIMIZED" line and add "Each track goes completely, in one transaction (Missing Files spec, section 6).":

```rust
        // "NOT (file_path LIKE 'folder1/%' OR ...)"; no folders means every track.
        let mut conditions = Vec::new();
        let mut params: Vec<String> = Vec::new();
        for folder in library_folders {
            let folder_normalized = if folder.ends_with('/') {
                folder.to_string()
            } else {
                format!("{}/", folder)
            };
            conditions.push(format!("file_path LIKE ?{}", params.len() + 1));
            params.push(format!("{}%", folder_normalized));
        }
        let query = if conditions.is_empty() {
            "SELECT id FROM tracks".to_string()
        } else {
            format!("SELECT id FROM tracks WHERE NOT ({})", conditions.join(" OR "))
        };

        let tx = self.conn.unchecked_transaction()?;
        let ids: Vec<i64> = {
            let mut stmt = tx.prepare(&query)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| row.get(0))?;
            rows.collect::<Result<_>>()?
        };
        for &id in &ids {
            missing::delete_track_on(&tx, id)?;
        }
        tx.commit()?;
        Ok(ids.len())
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib`
Expected: everything passes, including the existing tests that call these two functions.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/missing.rs src-tauri/src/db/mod.rs
git commit -m "fix(db): folder cleanups delete a track completely, in one transaction

They deleted analysis and playlist slots first. Then the track delete failed on
foreign keys, and the track stayed without them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Merge body on a given connection

**Files:**
- Modify: `src-tauri/src/db/merge.rs:53-87` (`merge_tracks`)

- [ ] **Step 1: Write the failing test**

Add this to `mod tests` in `merge.rs`:

```rust
    #[test]
    fn merge_on_runs_inside_the_callers_transaction() {
        let db = db();
        let k = track(&db, "k");
        let r = track(&db, "r");
        {
            let tx = db.conn.unchecked_transaction().unwrap();
            let out = merge_on(&tx, &[MergeRequest { keep_id: k, remove_ids: vec![r] }]).unwrap();
            assert_eq!(out.merged, 1);
            // Dropped without commit: the merge rolls back with it.
        }
        assert_eq!(count(&db, "SELECT COUNT(*) FROM tracks WHERE id = ?1", r), 1);
    }
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: compile error, because `merge_on` is not found.

- [ ] **Step 3: Implement**

Replace `merge_tracks` in the `impl Database` block with:

```rust
    /// Merges every request's removed copies into its kept copy, in one
    /// transaction. A group whose kept copy no longer exists is skipped, and
    /// so is a removed id that no longer exists.
    pub fn merge_tracks(&self, requests: &[MergeRequest]) -> Result<MergeOutcome> {
        let tx = self.conn.unchecked_transaction()?;
        let outcome = merge_on(&tx, requests)?;
        tx.commit()?;
        Ok(outcome)
    }
```

Then add a free function below the `impl Database` block. Its body is the old loop, unchanged except that `tx` becomes `conn`:

```rust
/// The merge itself, on `conn`. The caller owns the transaction (Missing
/// Files runs it inside its own apply).
pub(crate) fn merge_on(conn: &Connection, requests: &[MergeRequest]) -> Result<MergeOutcome> {
    let mut outcome = MergeOutcome::default();
    for request in requests {
        let Some(kept) = removed_file(conn, request.keep_id)? else {
            continue;
        };
        let kept_path = crate::scanner::normalize_scanned_path(&kept.path);
        for &remove_id in &request.remove_ids {
            // Merging a track into itself would delete it.
            if remove_id == request.keep_id {
                continue;
            }
            let Some(file) = removed_file(conn, remove_id)? else {
                continue;
            };
            outcome.playlist_slots_moved += merge_one(conn, request.keep_id, remove_id)?;
            // A double-slash copy can be K's own file: never skip that one.
            let skip_path = crate::scanner::normalize_scanned_path(&file.path);
            if skip_path != kept_path {
                conn.execute(
                    "INSERT OR REPLACE INTO skipped_files (file_path, kept_track_id) VALUES (?1, ?2)",
                    params![skip_path, request.keep_id],
                )?;
            }
            outcome.merged += 1;
            outcome.removed_files.push(RemovedFile { kept_path: kept.path.clone(), ..file });
        }
    }
    Ok(outcome)
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib db::merge`
Expected: all merge tests pass, the existing ones included.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/merge.rs
git commit -m "refactor(db): merge body runs on a given connection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Finding missing tracks and their candidates

**Files:**
- Modify: `src-tauri/src/db/missing.rs` (`library_folders`, `library_track_for`, `all_track_paths`)
- Create: `src-tauri/src/missing_files.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod missing_files;`)

- [ ] **Step 1: Write the failing DB tests**

Add these to `mod tests` in `db/missing.rs`:

```rust
    #[test]
    fn library_folders_reads_the_setting() {
        let db = db();
        assert!(db.library_folders().unwrap().is_empty());
        db.set_setting("library_folders", r#"["/music","/more"]"#).unwrap();
        assert_eq!(db.library_folders().unwrap(), vec!["/music".to_string(), "/more".to_string()]);
    }

    #[test]
    fn a_file_that_is_a_track_is_that_track() {
        let db = db();
        let me = insert(&db, "/gone/me.wav", "me");
        let live = insert(&db, "/m/live.wav", "live");
        assert_eq!(db.library_track_for("/m/live.wav", me).unwrap(), Some(live));
        assert_eq!(db.library_track_for("/m/free.wav", me).unwrap(), None);
    }

    #[test]
    fn a_skipped_file_belongs_to_its_kept_track_only_while_that_track_has_its_file() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let live_file = dir.path().join("k.wav");
        std::fs::write(&live_file, b"k").unwrap();
        let live = insert(&db, &live_file.to_string_lossy(), "k");
        let dead = insert(&db, "/gone/d.wav", "d");
        let me = insert(&db, "/gone/me.wav", "me");
        let skip = |path: &str, kept: Option<i64>| {
            db.conn
                .execute(
                    "INSERT INTO skipped_files (file_path, kept_track_id) VALUES (?1, ?2)",
                    params![path, kept],
                )
                .unwrap();
        };
        skip("/m/to-live.wav", Some(live));
        skip("/m/to-dead.wav", Some(dead));
        skip("/m/to-me.wav", Some(me));
        skip("/m/to-null.wav", None);
        skip("/m/to-gone.wav", Some(9999));

        assert_eq!(db.library_track_for("/m/to-live.wav", me).unwrap(), Some(live));
        for path in ["/m/to-dead.wav", "/m/to-me.wav", "/m/to-null.wav", "/m/to-gone.wav"] {
            assert_eq!(db.library_track_for(path, me).unwrap(), None, "{path}");
        }
    }
```

- [ ] **Step 2: Write the failing disk-side tests**

Create `src-tauri/src/missing_files.rs` with only the module doc and the tests for now:

```rust
//! Missing Files (spec docs/superpowers/specs/2026-10-15-missing-files-design.md):
//! finding tracks whose file is gone, and files that might be theirs. The
//! disk work here never touches the database, so the commands run it
//! without the DB lock and take the lock only for the `Database` steps.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::write_wav;
    use std::path::Path;
    use tempfile::TempDir;

    fn db_with_folders(folders: &[&Path]) -> Database {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let list: Vec<String> = folders.iter().map(|f| f.to_string_lossy().to_string()).collect();
        db.set_setting("library_folders", &serde_json::to_string(&list).unwrap()).unwrap();
        db
    }

    fn add(db: &Database, path: &str, artist: &str, title: &str) -> i64 {
        db.create_track(&Track {
            id: None,
            file_path: path.into(),
            file_hash: path.into(),
            title: Some(title.into()),
            artist: Some(artist.into()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: Some(2000),
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
        })
        .unwrap()
    }

    fn norm(path: &Path) -> String {
        normalize_scanned_path(&path.to_string_lossy())
    }

    #[test]
    fn a_missing_track_gets_the_same_name_files_in_the_library_folders() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        write_wav(&lib.join("b/Song.WAV"), 1500, 1);
        write_wav(&lib.join("a/song.wav"), 2000, 2);
        write_wav(&dir.path().join("outside/song.wav"), 2000, 3);
        let db = db_with_folders(&[&lib]);
        let id = add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].track.id, Some(id));
        let paths: Vec<String> = found[0].candidates.iter().map(|c| c.path.clone()).collect();
        assert_eq!(paths, vec![norm(&lib.join("a/song.wav")), norm(&lib.join("b/Song.WAV"))]);
        assert_eq!(found[0].candidates[0].duration_ms, Some(2000));
        assert_eq!(found[0].candidates[1].duration_ms, Some(1500));
        assert!(found[0].candidates.iter().all(|c| c.library_track_id.is_none()));
    }

    #[test]
    fn overlapping_library_folders_list_a_file_once() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        write_wav(&lib.join("a/song.wav"), 2000, 1);
        let db = db_with_folders(&[&lib, &lib.join("a")]);
        add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found[0].candidates.len(), 1);
    }

    #[test]
    fn a_candidate_that_is_a_library_track_carries_its_id() {
        let dir = TempDir::new().unwrap();
        let lib = dir.path().join("lib");
        let file = lib.join("a/song.wav");
        write_wav(&file, 2000, 1);
        let db = db_with_folders(&[&lib]);
        let live = add(&db, &norm(&file), "Artist", "Song (new tags)");
        add(&db, "/gone/song.wav", "Artist", "Song");

        let found = find_missing_tracks(&db).unwrap();

        assert_eq!(found.len(), 1, "the live track is not missing");
        assert_eq!(found[0].candidates[0].library_track_id, Some(live));
    }

    #[test]
    fn missing_tracks_come_sorted_by_artist_then_title() {
        let dir = TempDir::new().unwrap();
        let db = db_with_folders(&[dir.path()]);
        add(&db, "/gone/1.wav", "b", "x");
        add(&db, "/gone/2.wav", "A", "z");
        add(&db, "/gone/3.wav", "a", "y");

        let titles: Vec<String> = find_missing_tracks(&db)
            .unwrap()
            .into_iter()
            .map(|m| m.track.title.unwrap())
            .collect();

        assert_eq!(titles, vec!["y", "z", "x"]);
    }

    #[test]
    fn a_path_on_an_unplugged_drive_names_the_drive() {
        assert_eq!(
            drive_missing("/Volumes/recodeck-test-no-such-drive/a.mp3"),
            Some("recodeck-test-no-such-drive".to_string())
        );
        assert_eq!(drive_missing("/m/a.mp3"), None);
        assert_eq!(drive_missing("/Volumes/"), None);
    }

    #[test]
    fn count_missing_counts_paths_not_on_disk() {
        let dir = TempDir::new().unwrap();
        let here = dir.path().join("here.wav");
        std::fs::write(&here, b"x").unwrap();
        let paths = vec![here.to_string_lossy().to_string(), "/gone/a.wav".into(), "/gone/b.wav".into()];
        assert_eq!(count_missing(&paths), 2);
    }

    #[test]
    fn describing_a_picked_file_reads_its_length() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("pick.wav");
        write_wav(&file, 3000, 1);
        let db = db_with_folders(&[dir.path()]);
        let id = add(&db, "/gone/pick.wav", "Artist", "Pick");

        let c = describe_file(&db, id, probe(&norm(&file))).unwrap();

        assert_eq!(c.path, norm(&file));
        assert_eq!(c.duration_ms, Some(3000));
        assert!(c.file_size.unwrap() > 0);
        assert_eq!(c.library_track_id, None);
    }
}
```

In `src-tauri/src/lib.rs`, add `pub mod missing_files;` after `pub mod formats;`.

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `cd src-tauri && cargo test --lib missing`
Expected: compile errors (`library_folders`, `library_track_for`, `find_missing_tracks`, `drive_missing` and the others not found).

- [ ] **Step 4: Implement the DB side**

Add to `impl Database` in `db/missing.rs`:

```rust
    /// The library folders (setting `library_folders`, a JSON list).
    pub fn library_folders(&self) -> Result<Vec<String>> {
        Ok(self
            .get_setting("library_folders")?
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default())
    }

    /// Every track's file path, so missing files can be counted without the lock.
    pub fn all_track_paths(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT file_path FROM tracks")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    /// Rule 5 of spec section 3: the library track a file on disk already
    /// is, or None for a free file. A file merged away earlier belongs to the
    /// track it was merged into, but only while that track is alive and has
    /// its own file. So the answer is always a live track, never a row of the
    /// review.
    pub fn library_track_for(&self, path: &str, missing_track_id: i64) -> Result<Option<i64>> {
        let owner: Option<i64> = self
            .conn
            .query_row("SELECT id FROM tracks WHERE file_path = ?1", [path], |row| row.get(0))
            .optional()?;
        if owner.is_some() {
            return Ok(owner);
        }
        let kept: Option<Option<i64>> = self
            .conn
            .query_row("SELECT kept_track_id FROM skipped_files WHERE file_path = ?1", [path], |row| row.get(0))
            .optional()?;
        let Some(Some(kept)) = kept else {
            return Ok(None);
        };
        if kept == missing_track_id {
            return Ok(None);
        }
        let kept_path: Option<String> = self
            .conn
            .query_row("SELECT file_path FROM tracks WHERE id = ?1", [kept], |row| row.get(0))
            .optional()?;
        Ok(kept_path.filter(|p| Path::new(p).exists()).map(|_| kept))
    }
```

- [ ] **Step 5: Implement the disk side**

Put this ABOVE the `#[cfg(test)]` block in `src-tauri/src/missing_files.rs`:

```rust
use crate::db::duplicates::CopyFacts;
use crate::db::{Database, Track};
use crate::scanner::{normalize_scanned_path, Scanner};
use lofty::prelude::*;
use std::collections::{BTreeSet, HashMap};
use std::path::Path;

/// A file on disk, with what a quick read says about it.
#[derive(Debug, Clone, PartialEq)]
pub struct FoundFile {
    pub path: String,
    pub duration_ms: Option<i64>,
    pub file_size: Option<i64>,
}

/// A file that might be a missing track's file.
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub path: String,
    pub duration_ms: Option<i64>,
    pub file_size: Option<i64>,
    /// Set when the file already is a library track: the review offers Merge into it.
    pub library_track_id: Option<i64>,
}

/// A track whose file is gone, with what the review shows about it.
#[derive(Debug, Clone)]
pub struct MissingTrack {
    pub track: Track,
    pub facts: CopyFacts,
    /// The unplugged drive its file was on.
    pub drive_missing: Option<String>,
    /// Same-name files in the library folders, ordered by path.
    pub candidates: Vec<Candidate>,
}

/// What the disk says, before the database is asked (spec section 3, steps 1-4 and 6).
pub struct DiskView {
    pub missing: Vec<Track>,
    pub found: HashMap<i64, Vec<FoundFile>>,
    pub drives: HashMap<i64, String>,
}

pub fn is_missing(path: &str) -> bool {
    !Path::new(path).exists()
}

pub fn count_missing(paths: &[String]) -> usize {
    paths.iter().filter(|p| is_missing(p)).count()
}

/// The drive name when `path` is under `/Volumes/<name>/` and that drive is not mounted.
pub fn drive_missing(path: &str) -> Option<String> {
    let name = path.strip_prefix("/Volumes/")?.split('/').next()?;
    if name.is_empty() || Path::new("/Volumes").join(name).exists() {
        return None;
    }
    Some(name.to_string())
}

fn name_key(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_lowercase()
}

/// Lower-cased file name → its normalized paths in `folders`, sorted, each
/// once even when folders overlap.
pub fn name_index(folders: &[String]) -> HashMap<String, Vec<String>> {
    let mut index: HashMap<String, BTreeSet<String>> = HashMap::new();
    for folder in folders {
        for file in Scanner::scan_directory(Path::new(folder)) {
            let path = normalize_scanned_path(&file.to_string_lossy());
            index.entry(name_key(&path)).or_default().insert(path);
        }
    }
    index.into_iter().map(|(name, paths)| (name, paths.into_iter().collect())).collect()
}

/// Length (lofty, no hash) and size of one file.
pub fn probe(path: &str) -> FoundFile {
    let duration_ms = lofty::read_from_path(path)
        .ok()
        .map(|file| file.properties().duration().as_millis() as i64);
    let file_size = std::fs::metadata(path).ok().map(|m| m.len() as i64);
    FoundFile { path: path.to_string(), duration_ms, file_size }
}

/// Which tracks lost their file, and the same-name files in the library
/// folders. No database access: the commands run this without the lock.
pub fn look_on_disk(tracks: Vec<Track>, folders: &[String]) -> DiskView {
    let missing: Vec<Track> = tracks.into_iter().filter(|t| is_missing(&t.file_path)).collect();
    let mut view = DiskView { missing: Vec::new(), found: HashMap::new(), drives: HashMap::new() };
    if missing.is_empty() {
        return view;
    }
    let index = name_index(folders);
    for track in &missing {
        let id = track.id.unwrap_or(0);
        if let Some(paths) = index.get(&name_key(&track.file_path)) {
            view.found.insert(id, paths.iter().map(|p| probe(p)).collect());
        }
        if let Some(drive) = drive_missing(&track.file_path) {
            view.drives.insert(id, drive);
        }
    }
    view.missing = missing;
    view
}

/// One file for one missing track, with rule 5's answer (Locate…, Other file…).
pub fn describe_file(db: &Database, track_id: i64, file: FoundFile) -> rusqlite::Result<Candidate> {
    let library_track_id = db.library_track_for(&file.path, track_id)?;
    Ok(Candidate {
        path: file.path,
        duration_ms: file.duration_ms,
        file_size: file.file_size,
        library_track_id,
    })
}

fn sort_key(value: &Option<String>) -> String {
    value.as_deref().unwrap_or("").to_lowercase()
}

/// What the database says about each missing track and its files. Sorted by
/// artist, then title.
pub fn describe(db: &Database, view: DiskView) -> rusqlite::Result<Vec<MissingTrack>> {
    let facts = db.copy_facts(&view.missing)?;
    let DiskView { missing, mut found, drives } = view;
    let mut out = Vec::with_capacity(missing.len());
    for (track, facts) in missing.into_iter().zip(facts) {
        let id = track.id.unwrap_or(0);
        let mut candidates = Vec::new();
        for file in found.remove(&id).unwrap_or_default() {
            candidates.push(describe_file(db, id, file)?);
        }
        out.push(MissingTrack { drive_missing: drives.get(&id).cloned(), track, facts, candidates });
    }
    out.sort_by_key(|m| (sort_key(&m.track.artist), sort_key(&m.track.title)));
    Ok(out)
}

/// The whole review in one call. The commands run the same steps with the
/// lock released around `look_on_disk`.
pub fn find_missing_tracks(db: &Database) -> rusqlite::Result<Vec<MissingTrack>> {
    let view = look_on_disk(db.get_all_tracks()?, &db.library_folders()?);
    describe(db, view)
}
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib missing`
Expected: all `db::missing` and `missing_files` tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/missing.rs src-tauri/src/missing_files.rs src-tauri/src/lib.rs
git commit -m "feat(missing): find tracks whose file is gone and same-name files for them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Applying the review

**Files:**
- Modify: `src-tauri/src/db/missing.rs` (`validate_fixes`, `apply_missing_fixes`)
- Modify: `src-tauri/src/missing_files.rs` (`read_relinks`)

- [ ] **Step 1: Write the failing DB tests**

Add these to `mod tests` in `db/missing.rs`:

```rust
    #[test]
    fn validation_rejects_what_the_review_can_never_send() {
        let relinks = vec![(1, "/m/a.wav".to_string())];
        assert!(validate_fixes(&relinks, &[(9, 2)], &[3]).is_ok());
        // a track twice
        assert!(validate_fixes(&relinks, &[(9, 1)], &[]).is_err());
        assert!(validate_fixes(&[], &[], &[3, 3]).is_err());
        // a path twice
        assert!(validate_fixes(&[(1, "/m/a.wav".into()), (2, "/m/a.wav".into())], &[], &[]).is_err());
        // merging into a track that changes too
        assert!(validate_fixes(&relinks, &[(1, 2)], &[]).is_err());
        assert!(validate_fixes(&[], &[(3, 2)], &[3]).is_err());
        // two merges into one kept track are fine
        assert!(validate_fixes(&[], &[(9, 2), (9, 3)], &[]).is_ok());
    }

    #[test]
    fn apply_relinks_merges_and_removes_in_one_go() {
        let db = db();
        let relink = insert(&db, "/gone/r.wav", "r");
        let keep = insert(&db, "/m/k.wav", "k");
        let merge_a = track_with_everything(&db, "/gone/a.wav");
        let merge_b = insert(&db, "/gone/b.wav", "b");
        let remove = track_with_everything(&db, "/gone/x.wav");

        let out = db
            .apply_missing_fixes(&MissingFixes {
                relinks: vec![RelinkFix { track_id: relink, facts: facts("/m/r.wav") }],
                merges: vec![(keep, merge_a), (keep, merge_b)],
                removes: vec![remove],
            })
            .unwrap();

        assert_eq!(out, FixOutcome { relinked: 1, merged: 2, removed: 1, skipped: vec![] });
        assert_eq!(db.get_track(relink).unwrap().file_path, "/m/r.wav");
        let keep_slots: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM playlist_tracks WHERE track_id = ?1", [keep], |r| r.get(0))
            .unwrap();
        let keep_plays: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM play_history WHERE track_id = ?1", [keep], |r| r.get(0))
            .unwrap();
        assert_eq!((keep_slots, keep_plays), (1, 1));
        assert!(db.get_track(merge_a).is_err());
        assert!(db.get_track(merge_b).is_err());
        assert_eq!(rows_for(&db, remove), 0);
    }

    #[test]
    fn changes_that_no_longer_fit_are_skipped_not_rolled_back() {
        let db = db();
        let dir = TempDir::new().unwrap();
        let back = dir.path().join("back.wav");
        std::fs::write(&back, b"x").unwrap();
        let back_too = dir.path().join("back-too.wav");
        std::fs::write(&back_too, b"y").unwrap();
        let taken_by = insert(&db, "/m/taken.wav", "t");
        let wants_taken = insert(&db, "/gone/t.wav", "w");
        let file_is_back = insert(&db, &back.to_string_lossy(), "b");
        let merge_is_back = insert(&db, &back_too.to_string_lossy(), "bt");
        let orphan = insert(&db, "/gone/o.wav", "o");
        let fine = insert(&db, "/gone/f.wav", "f");

        let out = db
            .apply_missing_fixes(&MissingFixes {
                relinks: vec![
                    RelinkFix { track_id: wants_taken, facts: facts("/m/taken.wav") },
                    RelinkFix { track_id: fine, facts: facts("/m/f.wav") },
                ],
                merges: vec![(9999, orphan), (taken_by, merge_is_back)],
                removes: vec![file_is_back, 8888],
            })
            .unwrap();

        assert_eq!((out.relinked, out.merged, out.removed), (1, 0, 0));
        let reasons: Vec<(i64, &str)> = out.skipped.iter().map(|s| (s.track_id, s.reason.as_str())).collect();
        assert_eq!(
            reasons,
            vec![
                (wants_taken, "file is now another track"),
                (orphan, "kept track no longer exists"),
                (merge_is_back, "file is back"),
                (file_is_back, "file is back"),
                (8888, "track no longer exists"),
            ]
        );
        assert_eq!(db.get_track(fine).unwrap().file_path, "/m/f.wav");
        assert!(db.get_track(file_is_back).is_ok());
        assert!(db.get_track(merge_is_back).is_ok());
        assert!(db.get_track(taken_by).is_ok());
    }

    #[test]
    fn a_failure_inside_the_apply_changes_nothing() {
        let db = db();
        let relink = insert(&db, "/gone/r.wav", "r");
        let remove = insert(&db, "/gone/x.wav", "x");
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER fail BEFORE DELETE ON tracks WHEN OLD.id = {remove} BEGIN SELECT RAISE(ABORT, 'boom'); END;"
            ))
            .unwrap();

        let result = db.apply_missing_fixes(&MissingFixes {
            relinks: vec![RelinkFix { track_id: relink, facts: facts("/m/r.wav") }],
            merges: vec![],
            removes: vec![remove],
        });

        assert!(result.is_err());
        assert_eq!(db.get_track(relink).unwrap().file_path, "/gone/r.wav");
    }
```

- [ ] **Step 2: Write the failing disk-side test**

Add this to `mod tests` in `missing_files.rs`:

```rust
    #[test]
    fn relink_files_are_read_before_the_apply_and_bad_ones_reported() {
        let dir = TempDir::new().unwrap();
        let good = dir.path().join("good.wav");
        write_wav(&good, 1000, 1);
        let junk = dir.path().join("junk.mp3");
        std::fs::write(&junk, b"not audio").unwrap();

        let (ready, skipped) = read_relinks(&[
            (1, norm(&good)),
            (2, "/gone/nothing.wav".to_string()),
            (3, norm(&junk)),
        ]);

        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].track_id, 1);
        assert_eq!(ready[0].facts.path, norm(&good));
        assert_eq!(ready[0].facts.duration_ms, Some(1000));
        let reasons: Vec<(i64, &str)> = skipped.iter().map(|s| (s.track_id, s.reason.as_str())).collect();
        assert_eq!(reasons, vec![(2, "file is gone"), (3, "file can't be read")]);
    }
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `cd src-tauri && cargo test --lib missing`
Expected: compile errors (`validate_fixes`, `MissingFixes`, `RelinkFix`, `FixOutcome`, `read_relinks` not found).

- [ ] **Step 4: Implement the DB side**

1. Extend the use lines at the top of `db/missing.rs`:

```rust
use super::merge::{merge_on, MergeRequest};
use std::collections::{BTreeMap, HashSet};
```

2. Add these below `delete_track_on`:

```rust
/// A relink the review asked for, with the facts read from its file before
/// the transaction.
#[derive(Debug, Clone)]
pub struct RelinkFix {
    pub track_id: i64,
    pub facts: FileFacts,
}

/// Everything one apply does (spec section 4). `merges` are
/// (keep_id, remove_id) pairs; several may share a keep_id.
#[derive(Debug, Clone, Default)]
pub struct MissingFixes {
    pub relinks: Vec<RelinkFix>,
    pub merges: Vec<(i64, i64)>,
    pub removes: Vec<i64>,
}

/// A change the apply left out, and why.
#[derive(Debug, Clone, PartialEq)]
pub struct SkippedFix {
    pub track_id: i64,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct FixOutcome {
    pub relinked: usize,
    pub merged: usize,
    pub removed: usize,
    pub skipped: Vec<SkippedFix>,
}

/// Rejects a request the review can never build (spec section 4). Paths
/// must already be normalized.
pub fn validate_fixes(
    relinks: &[(i64, String)],
    merges: &[(i64, i64)],
    removes: &[i64],
) -> std::result::Result<(), String> {
    let mut changing = HashSet::new();
    let ids = relinks
        .iter()
        .map(|(id, _)| *id)
        .chain(merges.iter().map(|(_, remove)| *remove))
        .chain(removes.iter().copied());
    for id in ids {
        if !changing.insert(id) {
            return Err(format!("Track {id} appears more than once"));
        }
    }
    let mut paths = HashSet::new();
    for (_, path) in relinks {
        if !paths.insert(path.as_str()) {
            return Err(format!("{path} is relinked twice"));
        }
    }
    if let Some((keep, _)) = merges.iter().find(|(keep, _)| changing.contains(keep)) {
        return Err(format!("Track {keep} is merged into while it changes too"));
    }
    Ok(())
}

fn track_path(conn: &Connection, id: i64) -> Result<Option<String>> {
    conn.query_row("SELECT file_path FROM tracks WHERE id = ?1", [id], |row| row.get(0))
        .optional()
}

/// Why a missing track can no longer be merged away or removed: a scan may
/// have run while the review was open.
fn cannot_go(conn: &Connection, id: i64) -> Result<Option<&'static str>> {
    Ok(match track_path(conn, id)? {
        None => Some("track no longer exists"),
        Some(path) if Path::new(&path).exists() => Some("file is back"),
        Some(_) => None,
    })
}

fn skip(out: &mut FixOutcome, track_id: i64, reason: &str) {
    out.skipped.push(SkippedFix { track_id, reason: reason.to_string() });
}
```

3. Add this to `impl Database`:

```rust
    /// Applies the review in one transaction: relinks, then merges, then
    /// removes (spec section 4). A change that no longer fits is skipped, not
    /// rolled back. Any other error rolls everything back.
    pub fn apply_missing_fixes(&self, fixes: &MissingFixes) -> Result<FixOutcome> {
        let tx = self.conn.unchecked_transaction()?;
        let mut out = FixOutcome::default();

        for fix in &fixes.relinks {
            match relink_on(&tx, fix.track_id, &fix.facts)? {
                RelinkOutcome::Relinked | RelinkOutcome::AlreadyThere => out.relinked += 1,
                RelinkOutcome::Taken => skip(&mut out, fix.track_id, "file is now another track"),
                RelinkOutcome::TrackGone => skip(&mut out, fix.track_id, "track no longer exists"),
            }
        }

        let mut groups: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
        for &(keep, remove) in &fixes.merges {
            if track_path(&tx, keep)?.is_none() {
                skip(&mut out, remove, "kept track no longer exists");
            } else if let Some(reason) = cannot_go(&tx, remove)? {
                skip(&mut out, remove, reason);
            } else {
                groups.entry(keep).or_default().push(remove);
            }
        }
        let requests: Vec<MergeRequest> = groups
            .into_iter()
            .map(|(keep_id, remove_ids)| MergeRequest { keep_id, remove_ids })
            .collect();
        out.merged = merge_on(&tx, &requests)?.merged;

        for &id in &fixes.removes {
            if let Some(reason) = cannot_go(&tx, id)? {
                skip(&mut out, id, reason);
                continue;
            }
            delete_track_on(&tx, id)?;
            out.removed += 1;
        }

        tx.commit()?;
        Ok(out)
    }
```

- [ ] **Step 5: Implement the disk side**

Add this to `missing_files.rs`, above the tests, and add `use crate::db::missing::{FileFacts, RelinkFix, SkippedFix};` to its use lines:

```rust
/// Reads each relink's file before the transaction (hash, size, audio
/// properties). A file that is gone or unreadable is reported instead.
/// Paths must already be normalized.
pub fn read_relinks(relinks: &[(i64, String)]) -> (Vec<RelinkFix>, Vec<SkippedFix>) {
    let mut ready = Vec::new();
    let mut skipped = Vec::new();
    for (track_id, path) in relinks {
        let reason = if is_missing(path) {
            "file is gone"
        } else {
            match Scanner::extract_metadata(Path::new(path)) {
                Ok((track, _, _)) if track.file_hash != "unknown" => {
                    ready.push(RelinkFix { track_id: *track_id, facts: FileFacts::from_track(&track) });
                    continue;
                }
                _ => "file can't be read",
            }
        };
        skipped.push(SkippedFix { track_id: *track_id, reason: reason.to_string() });
    }
    (ready, skipped)
}
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `cd src-tauri && cargo test --lib missing`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/missing.rs src-tauri/src/missing_files.rs
git commit -m "feat(missing): apply relinks, merges and removes in one transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tauri commands

**Files:**
- Modify: `src-tauri/src/commands/library.rs` (new DTOs and commands, after `merge_duplicate_tracks`)
- Modify: `src-tauri/src/lib.rs:514` (registration)

These commands need an `AppHandle`, so they have no unit tests. Every step they call is tested in Tasks 1-6. This task is verified by the build.

- [ ] **Step 1: Add the imports**

At the top of `commands/library.rs`, extend the `crate::db::missing` use line from Task 2 and add the module:

```rust
use crate::db::missing::{validate_fixes, FileFacts, HashMatch, MissingFixes, RelinkOutcome};
use crate::missing_files::{self, Candidate, MissingTrack};
use crate::scanner::normalize_scanned_path;
```

Keep the existing `use crate::scanner::{ScanResult, Scanner};`.

- [ ] **Step 2: Add the DTOs and commands**

Add this after `merge_duplicate_tracks`:

```rust
/// A file that might be a missing track's file (Missing Files spec).
#[derive(Debug, Clone, Serialize)]
pub struct MissingCandidateDTO {
    pub path: String,
    pub duration_ms: Option<i64>,
    pub file_size: Option<i64>,
    /// Set when the file already is a library track: the row offers Merge into it.
    pub library_track_id: Option<i64>,
}

impl From<Candidate> for MissingCandidateDTO {
    fn from(c: Candidate) -> Self {
        MissingCandidateDTO {
            path: c.path,
            duration_ms: c.duration_ms,
            file_size: c.file_size,
            library_track_id: c.library_track_id,
        }
    }
}

/// A track whose file is gone, with what the review shows about it.
#[derive(Debug, Clone, Serialize)]
pub struct MissingTrackDTO {
    #[serde(flatten)]
    pub track: TrackDTO,
    pub playlists: Vec<PlaylistRefDTO>,
    pub analyzed: bool,
    pub plays: i64,
    pub drive_missing: Option<String>,
    pub candidates: Vec<MissingCandidateDTO>,
}

impl From<MissingTrack> for MissingTrackDTO {
    fn from(m: MissingTrack) -> Self {
        MissingTrackDTO {
            track: TrackDTO::from(m.track),
            playlists: m
                .facts
                .playlists
                .into_iter()
                .map(|(id, name)| PlaylistRefDTO { id, name })
                .collect(),
            analyzed: m.facts.analyzed,
            plays: m.facts.plays,
            drive_missing: m.drive_missing,
            candidates: m.candidates.into_iter().map(MissingCandidateDTO::from).collect(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RelinkFixDTO {
    pub track_id: i64,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MergeFixDTO {
    pub keep_id: i64,
    pub remove_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkippedFixDTO {
    pub track_id: i64,
    pub reason: String,
}

/// What an apply did, for the review's toast.
#[derive(Debug, Clone, Serialize)]
pub struct MissingFixSummaryDTO {
    pub relinked: usize,
    pub merged: usize,
    pub removed: usize,
    pub skipped: Vec<SkippedFixDTO>,
}

/// Runs `f` with the database, holding the lock only for that call.
fn with_db<T>(
    state: &AppState,
    what: &str,
    f: impl FnOnce(&Database) -> rusqlite::Result<T>,
) -> Result<T, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    f(db).map_err(|e| AppError::Database(format!("{what}: {e}")))
}

/// Tracks whose file is gone, with same-name files in the library folders
/// (Missing Files spec, section 3). The disk work runs without the DB lock.
#[tauri::command]
pub async fn get_missing_tracks(app: AppHandle) -> Result<Vec<MissingTrackDTO>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (tracks, folders) = with_db(&state, "Failed to read the library", |db| {
            Ok((db.get_all_tracks()?, db.library_folders()?))
        })?;
        let view = missing_files::look_on_disk(tracks, &folders);
        let found = with_db(&state, "Failed to read missing tracks", |db| missing_files::describe(db, view))?;
        Ok(found.into_iter().map(MissingTrackDTO::from).collect())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Missing files task failed: {}", e)))?
}

/// How many tracks point at a file that is not on disk.
#[tauri::command]
pub async fn count_missing_tracks(app: AppHandle) -> Result<usize, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let paths = with_db(&state, "Failed to read the library", |db| db.all_track_paths())?;
        Ok(missing_files::count_missing(&paths))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Missing files task failed: {}", e)))?
}

/// One picked file for a missing track (Locate…, Other file…).
#[tauri::command]
pub async fn describe_file(app: AppHandle, track_id: i64, path: String) -> Result<MissingCandidateDTO, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let path = normalize_scanned_path(&path);
        if missing_files::is_missing(&path) {
            return Err(AppError::Validation(format!("File is gone: {path}")));
        }
        let file = missing_files::probe(&path);
        let candidate = with_db(&state, "Failed to describe the file", |db| {
            missing_files::describe_file(db, track_id, file)
        })?;
        Ok(MissingCandidateDTO::from(candidate))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Missing files task failed: {}", e)))?
}

/// Applies the review (Missing Files spec, section 4). Files are read and
/// hashed without the lock; the changes run in one transaction.
#[tauri::command]
pub async fn apply_missing_fixes(
    app: AppHandle,
    relinks: Vec<RelinkFixDTO>,
    merges: Vec<MergeFixDTO>,
    removes: Vec<i64>,
) -> Result<MissingFixSummaryDTO, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let relinks: Vec<(i64, String)> = relinks
            .into_iter()
            .map(|r| (r.track_id, normalize_scanned_path(&r.path)))
            .collect();
        let merges: Vec<(i64, i64)> = merges.into_iter().map(|m| (m.keep_id, m.remove_id)).collect();
        validate_fixes(&relinks, &merges, &removes).map_err(AppError::Validation)?;

        let (ready, mut skipped) = missing_files::read_relinks(&relinks);
        let fixes = MissingFixes { relinks: ready, merges, removes };
        let outcome = with_db(&state, "Failed to apply the fixes", |db| db.apply_missing_fixes(&fixes))?;
        skipped.extend(outcome.skipped);
        Ok(MissingFixSummaryDTO {
            relinked: outcome.relinked,
            merged: outcome.merged,
            removed: outcome.removed,
            skipped: skipped
                .into_iter()
                .map(|s| SkippedFixDTO { track_id: s.track_id, reason: s.reason })
                .collect(),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Missing files task failed: {}", e)))?
}
```

If `with_db` clashes with an existing name in the file (`grep -n "fn with_db" src-tauri/src/commands/*.rs`), call it `with_db_lock` instead.

- [ ] **Step 3: Register the commands**

In `src-tauri/src/lib.rs`, after `commands::library::merge_duplicate_tracks,`:

```rust
            commands::library::get_missing_tracks,
            commands::library::count_missing_tracks,
            commands::library::describe_file,
            commands::library::apply_missing_fixes,
```

- [ ] **Step 4: Build and test**

Run: `cd src-tauri && cargo build && cargo test --lib`
Expected: the build passes with no new warnings, and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/library.rs src-tauri/src/lib.rs
git commit -m "feat(missing): commands for the Missing Files review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend types, API and small helpers

**Files:**
- Modify: `src/types/track.ts` (after `MergeSummary`)
- Modify: `src/lib/tauri-api.ts` (type import list ~24-38; wrappers after `mergeDuplicateTracks` ~298-303)
- Create: `src/lib/missingFiles/messages.ts`, `src/lib/missingFiles/messages.test.ts`
- Create: `src/lib/missingFiles/paths.ts`, `src/lib/missingFiles/paths.test.ts`

- [ ] **Step 1: Types**

Append this to `src/types/track.ts`, after `MergeSummary`:

```ts
// Missing files (spec 2026-10-15)

/** A file that might be a missing track's file. */
export interface MissingCandidate {
  path: string
  duration_ms: number | null
  file_size: number | null
  /** Set when the file already is a library track: the row offers Merge into it. */
  library_track_id: number | null
}

/** A track whose file is gone, with what the review shows about it. */
export interface MissingTrack extends Track {
  playlists: PlaylistRef[]
  /** Has BPM or key. */
  analyzed: boolean
  /** Rows in the play history. */
  plays: number
  /** The unplugged drive its file was on. */
  drive_missing: string | null
  /** Same-name files in the library folders, ordered by path. */
  candidates: MissingCandidate[]
}

export interface MissingFixes {
  relinks: { track_id: number; path: string }[]
  merges: { keep_id: number; remove_id: number }[]
  removes: number[]
}

export interface MissingFixSummary {
  relinked: number
  merged: number
  removed: number
  skipped: { track_id: number; reason: string }[]
}
```

- [ ] **Step 2: API wrappers**

In `src/lib/tauri-api.ts`, add `MissingCandidate`, `MissingFixes`, `MissingFixSummary` and `MissingTrack` to the `import type { … } from '../types/track'` list. Then add after `mergeDuplicateTracks`:

```ts
  // Missing files (spec 2026-10-15)
  async getMissingTracks(): Promise<MissingTrack[]> {
    return await invoke('get_missing_tracks')
  },

  async countMissingTracks(): Promise<number> {
    return await invoke('count_missing_tracks')
  },

  async describeFile(trackId: number, path: string): Promise<MissingCandidate> {
    return await invoke('describe_file', { trackId, path })
  },

  async applyMissingFixes(fixes: MissingFixes): Promise<MissingFixSummary> {
    return await invoke('apply_missing_fixes', { ...fixes })
  },
```

- [ ] **Step 3: Write the failing helper tests**

`src/lib/missingFiles/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixSummaryMessage, followedMessage } from './messages'

describe('followedMessage', () => {
  it('says nothing when no file was followed', () => {
    expect(followedMessage(0)).toBeNull()
  })
  it('counts one and many', () => {
    expect(followedMessage(1)).toBe('Followed 1 moved file')
    expect(followedMessage(98)).toBe('Followed 98 moved files')
  })
})

describe('fixSummaryMessage', () => {
  it('lists the non-zero parts, capitalized', () => {
    expect(
      fixSummaryMessage({ relinked: 2, merged: 0, removed: 1, skipped: [] }),
    ).toBe('Relinked 2 · removed 1')
    expect(
      fixSummaryMessage({
        relinked: 0,
        merged: 1,
        removed: 0,
        skipped: [{ track_id: 4, reason: 'file is gone' }],
      }),
    ).toBe('Merged 1 · 1 skipped')
  })
})
```

`src/lib/missingFiles/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { baseName, isInsideFolders, parentFolder } from './paths'

describe('isInsideFolders', () => {
  const folders = ['/Music', '/Sets/']
  it('accepts a library folder itself and anything below it', () => {
    expect(isInsideFolders('/Music', folders)).toBe(true)
    expect(isInsideFolders('/Music/House/a.mp3', folders)).toBe(true)
    expect(isInsideFolders('/Sets', folders)).toBe(true)
    expect(isInsideFolders('/Sets/2026/', folders)).toBe(true)
  })
  it('rejects a sibling that only shares the prefix', () => {
    expect(isInsideFolders('/Music2/a.mp3', folders)).toBe(false)
    expect(isInsideFolders('/Downloads/a.mp3', folders)).toBe(false)
  })
})

describe('parentFolder and baseName', () => {
  it('split a path', () => {
    expect(parentFolder('/Music/House/a.mp3')).toBe('/Music/House')
    expect(parentFolder('/a.mp3')).toBe('/')
    expect(baseName('/Music/House/')).toBe('House')
    expect(baseName('/Music/House/a.mp3')).toBe('a.mp3')
  })
})
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `npx vitest run src/lib/missingFiles`
Expected: FAIL, because the modules are not found.

- [ ] **Step 5: Implement**

`src/lib/missingFiles/messages.ts`:

```ts
// Texts the Missing Files flow shows (spec 2026-10-15).

import type { MissingFixSummary } from '../../types/track'

/** After a scan: null when no moved file was followed. */
export function followedMessage(relinked: number): string | null {
  if (relinked <= 0) return null
  return `Followed ${relinked} moved ${relinked === 1 ? 'file' : 'files'}`
}

/** After an apply: the non-zero counts, e.g. "Relinked 2 · removed 1". */
export function fixSummaryMessage(s: MissingFixSummary): string {
  const parts: string[] = []
  if (s.relinked > 0) parts.push(`relinked ${s.relinked}`)
  if (s.merged > 0) parts.push(`merged ${s.merged}`)
  if (s.removed > 0) parts.push(`removed ${s.removed}`)
  if (s.skipped.length > 0) parts.push(`${s.skipped.length} skipped`)
  const text = parts.join(' · ') || 'nothing changed'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
```

`src/lib/missingFiles/paths.ts`:

```ts
// Where a path sits relative to the library folders (Missing Files spec,
// Add to library).

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** True when `path` is a library folder or inside one. "/Music2" is not inside "/Music". */
export function isInsideFolders(path: string, folders: string[]): boolean {
  const p = trimSlash(path)
  return folders.some((f) => {
    const folder = trimSlash(f)
    return p === folder || p.startsWith(`${folder}/`)
  })
}

/** The folder a file is in. */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}

/** The last part of a path. */
export function baseName(path: string): string {
  const parts = trimSlash(path).split('/')
  return parts[parts.length - 1] || path
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run src/lib/missingFiles && npx tsc --noEmit`
Expected: the tests pass, and tsc reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/track.ts src/lib/tauri-api.ts src/lib/missingFiles/messages.ts src/lib/missingFiles/messages.test.ts src/lib/missingFiles/paths.ts src/lib/missingFiles/paths.test.ts
git commit -m "feat(missing): frontend types, API and helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Review state (missingChoice.ts)

**Files:**
- Create: `src/lib/missingFiles/missingChoice.ts`
- Create: `src/lib/missingFiles/missingChoice.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/missingFiles/missingChoice.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MissingCandidate, MissingTrack } from '../../types/track'
import {
  actionLabel,
  buildFixes,
  chooseFile,
  emptyChoice,
  locate,
  rowViews,
  setState,
  withLocated,
} from './missingChoice'

function file(
  path: string,
  duration_ms: number | null = 300_000,
  library_track_id: number | null = null,
): MissingCandidate {
  return { path, duration_ms, file_size: 1, library_track_id }
}

function missing(
  id: number,
  candidates: MissingCandidate[] = [],
  extra: Partial<MissingTrack> = {},
): MissingTrack {
  return {
    id,
    file_path: `/gone/${id}.mp3`,
    file_hash: String(id),
    title: `Song ${id}`,
    duration_ms: 300_000,
    play_count: 0,
    rating: 0,
    playlists: [],
    analyzed: false,
    plays: 0,
    drive_missing: null,
    candidates,
    ...extra,
  }
}

describe('defaults', () => {
  it('starts on fix when the chosen file has the same length (within 2 s)', () => {
    const t = missing(1, [file('/m/a.mp3', 301_500)])
    expect(rowViews([t], emptyChoice()).get(1)?.state).toBe('fix')
  })

  it('starts on leave when the length differs, is unknown, or there is no file', () => {
    const tracks = [
      missing(1, [file('/m/a.mp3', 190_000)]),
      missing(2, [file('/m/b.mp3', null)]),
      missing(3),
    ]
    const views = rowViews(tracks, emptyChoice())
    expect(views.get(1)?.state).toBe('leave')
    expect(views.get(1)?.lengthDiffers).toBe(true)
    expect(views.get(2)?.state).toBe('leave')
    expect(views.get(2)?.lengthDiffers).toBe(false)
    expect(views.get(3)?.state).toBe('leave')
  })

  it('starts on leave when the drive is not connected, even with a matching length', () => {
    const t = missing(1, [file('/m/a.mp3')], { drive_missing: 'USB' })
    expect(rowViews([t], emptyChoice()).get(1)?.state).toBe('leave')
  })

  it('chooses the first file whose length matches, else the first', () => {
    const t = missing(1, [file('/m/a.mp3', 100_000), file('/m/b.mp3')])
    expect(rowViews([t], emptyChoice()).get(1)?.candidate?.path).toBe('/m/b.mp3')
    const u = missing(2, [file('/m/c.mp3', 1), file('/m/d.mp3', 2)])
    expect(rowViews([u], emptyChoice()).get(2)?.candidate?.path).toBe('/m/c.mp3')
  })
})

describe('merge vs relink', () => {
  it('comes from the chosen file', () => {
    const t = missing(1, [file('/m/a.mp3', 300_000, 77), file('/m/b.mp3')])
    const views = rowViews([t], emptyChoice())
    expect(views.get(1)?.merge).toBe(true)
    const other = rowViews([t], chooseFile(emptyChoice(), 1, '/m/b.mp3'))
    expect(other.get(1)?.merge).toBe(false)
  })
})

describe('conflicts', () => {
  const shared = file('/m/same.mp3')

  it('lets only the lower id relink a shared free file', () => {
    const views = rowViews([missing(5, [shared]), missing(2, [shared])], emptyChoice())
    expect(views.get(2)?.state).toBe('fix')
    expect(views.get(5)?.state).toBe('leave')
    expect(views.get(5)?.selected).toBe('fix')
    expect(views.get(5)?.blockedBy?.id).toBe(2)
  })

  it('gives the blocked choice back when its blocker goes to leave', () => {
    const tracks = [missing(2, [shared]), missing(5, [shared])]
    const views = rowViews(tracks, setState(emptyChoice(), 2, 'leave'))
    expect(views.get(5)?.state).toBe('fix')
    expect(views.get(5)?.blockedBy).toBeUndefined()
  })

  it('allows two rows to merge into one library track', () => {
    const lib = file('/m/lib.mp3', 300_000, 9)
    const fixes = buildFixes([missing(1, [lib]), missing(2, [lib])], emptyChoice())
    expect(fixes.merges).toEqual([
      { keep_id: 9, remove_id: 1 },
      { keep_id: 9, remove_id: 2 },
    ])
  })
})

describe('picked files', () => {
  it('locate makes the picked file the chosen one, set to fix', () => {
    const t = missing(1)
    const choice = locate(emptyChoice(), 1, file('/m/picked.mp3', 1))
    const view = rowViews([t], choice).get(1)
    expect(view?.candidates.map((c) => c.path)).toEqual(['/m/picked.mp3'])
    expect(view?.state).toBe('fix')
  })

  it('keeps choices across a reload, and untouched rows take new defaults', () => {
    const before = [missing(1, [file('/m/a.mp3')]), missing(2)]
    const choice = setState(emptyChoice(), 1, 'remove')
    const after = [missing(1, [file('/m/a.mp3')]), missing(2, [file('/m/b.mp3')])]
    const views = rowViews(after, choice)
    expect(rowViews(before, choice).get(2)?.state).toBe('leave')
    expect(views.get(1)?.state).toBe('remove')
    expect(views.get(2)?.state).toBe('fix')
  })

  it('a picked file described again replaces the old description', () => {
    const t = missing(1)
    const choice = locate(emptyChoice(), 1, file('/m/p.mp3'))
    const again = withLocated(choice, new Map([[1, file('/m/p.mp3', 300_000, 4)]]))
    expect(rowViews([t], again).get(1)?.merge).toBe(true)
  })
})

describe('buildFixes and actionLabel', () => {
  it('builds relinks, merges and removes, and labels the button', () => {
    const tracks = [
      missing(1, [file('/m/a.mp3')]),
      missing(2, [file('/m/lib.mp3', 300_000, 9)]),
      missing(3),
      missing(4),
    ]
    const choice = setState(emptyChoice(), 3, 'remove')
    const fixes = buildFixes(tracks, choice)
    expect(fixes).toEqual({
      relinks: [{ track_id: 1, path: '/m/a.mp3' }],
      merges: [{ keep_id: 9, remove_id: 2 }],
      removes: [3],
    })
    expect(actionLabel(fixes)).toBe('Relink 1 · Merge 1 · Remove 1')
    expect(actionLabel({ relinks: [], merges: [], removes: [] })).toBe(
      'Nothing to apply',
    )
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/missingFiles/missingChoice.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

`src/lib/missingFiles/missingChoice.ts`:

```ts
// What the user picked in the Missing Files review (spec 2026-10-15): per
// track Relink/Merge ("fix"), Leave or Remove, and which file. Pure
// functions, so the modal only renders. The views keep the backend's
// validation true at all times (spec, Conflicts): a free file is relinked
// by one row only, the lowest id.

import type {
  MissingCandidate,
  MissingFixes,
  MissingTrack,
} from '../../types/track'

export type FixState = 'fix' | 'leave' | 'remove'

/** Lengths within this many milliseconds match. */
export const LENGTH_TOLERANCE_MS = 2000

export interface MissingChoice {
  /** track id → the state the user picked. Absent: the default. */
  picked: Map<number, FixState>
  /** track id → the path of the file the user chose. Absent: the default. */
  chosen: Map<number, string>
  /** track id → a file picked with Locate… or Other file…. */
  located: Map<number, MissingCandidate>
}

export interface RowView {
  /** What applies: a blocked fix counts as leave. */
  state: FixState
  /** What the user, or the default, picked. */
  selected: FixState
  /** The row's files: a picked one first, then the same-name files. */
  candidates: MissingCandidate[]
  candidate: MissingCandidate | undefined
  /** The chosen file already is a library track: Merge, not Relink. */
  merge: boolean
  lengthDiffers: boolean
  /** The lower-id row that relinks the same file. */
  blockedBy: MissingTrack | undefined
}

export function emptyChoice(): MissingChoice {
  return { picked: new Map(), chosen: new Map(), located: new Map() }
}

function lengthsKnown(track: MissingTrack, c: MissingCandidate): boolean {
  return track.duration_ms != null && c.duration_ms != null
}

export function lengthMatches(
  track: MissingTrack,
  c: MissingCandidate,
): boolean {
  if (!lengthsKnown(track, c)) return false
  return (
    Math.abs((track.duration_ms as number) - (c.duration_ms as number)) <=
    LENGTH_TOLERANCE_MS
  )
}

function candidatesOf(
  track: MissingTrack,
  choice: MissingChoice,
): MissingCandidate[] {
  const located = choice.located.get(track.id)
  if (!located) return track.candidates
  return [located, ...track.candidates.filter((c) => c.path !== located.path)]
}

function chosenCandidate(
  track: MissingTrack,
  choice: MissingChoice,
  candidates: MissingCandidate[],
): MissingCandidate | undefined {
  const path = choice.chosen.get(track.id)
  const picked = candidates.find((c) => c.path === path)
  if (picked) return picked
  return candidates.find((c) => lengthMatches(track, c)) ?? candidates[0]
}

function defaultState(
  track: MissingTrack,
  candidate: MissingCandidate | undefined,
): FixState {
  return candidate && lengthMatches(track, candidate) && !track.drive_missing
    ? 'fix'
    : 'leave'
}

/** Every row's view, computed in id order so the lower id wins a shared file. */
export function rowViews(
  tracks: MissingTrack[],
  choice: MissingChoice,
): Map<number, RowView> {
  const views = new Map<number, RowView>()
  const claims = new Map<string, MissingTrack>()
  for (const track of [...tracks].sort((a, b) => a.id - b.id)) {
    const candidates = candidatesOf(track, choice)
    const candidate = chosenCandidate(track, choice, candidates)
    let selected = choice.picked.get(track.id) ?? defaultState(track, candidate)
    if (selected === 'fix' && !candidate) selected = 'leave'
    const merge = candidate?.library_track_id != null
    let blockedBy: MissingTrack | undefined
    if (selected === 'fix' && candidate && !merge) {
      blockedBy = claims.get(candidate.path)
      if (!blockedBy) claims.set(candidate.path, track)
    }
    views.set(track.id, {
      state: blockedBy ? 'leave' : selected,
      selected,
      candidates,
      candidate,
      merge,
      lengthDiffers:
        candidate !== undefined &&
        lengthsKnown(track, candidate) &&
        !lengthMatches(track, candidate),
      blockedBy,
    })
  }
  return views
}

export function setState(
  choice: MissingChoice,
  trackId: number,
  state: FixState,
): MissingChoice {
  const picked = new Map(choice.picked)
  picked.set(trackId, state)
  return { ...choice, picked }
}

export function chooseFile(
  choice: MissingChoice,
  trackId: number,
  path: string,
): MissingChoice {
  const chosen = new Map(choice.chosen)
  chosen.set(trackId, path)
  return { ...choice, chosen }
}

/** A picked file becomes the row's chosen file, set to Relink/Merge. */
export function locate(
  choice: MissingChoice,
  trackId: number,
  file: MissingCandidate,
): MissingChoice {
  const located = new Map(choice.located)
  located.set(trackId, file)
  const chosen = new Map(choice.chosen)
  chosen.set(trackId, file.path)
  const picked = new Map(choice.picked)
  picked.set(trackId, 'fix')
  return { picked, chosen, located }
}

/** After a reload: the picked files as described again (gone ones left out). */
export function withLocated(
  choice: MissingChoice,
  located: Map<number, MissingCandidate>,
): MissingChoice {
  return { ...choice, located }
}

/** What the backend gets. */
export function buildFixes(
  tracks: MissingTrack[],
  choice: MissingChoice,
): MissingFixes {
  const views = rowViews(tracks, choice)
  const fixes: MissingFixes = { relinks: [], merges: [], removes: [] }
  for (const track of tracks) {
    const view = views.get(track.id)
    if (!view) continue
    if (view.state === 'remove') {
      fixes.removes.push(track.id)
    } else if (view.state === 'fix' && view.candidate) {
      const keep = view.candidate.library_track_id
      if (keep != null) fixes.merges.push({ keep_id: keep, remove_id: track.id })
      else fixes.relinks.push({ track_id: track.id, path: view.candidate.path })
    }
  }
  return fixes
}

/** "Relink 2 · Merge 1 · Remove 1", or "Nothing to apply". */
export function actionLabel(fixes: MissingFixes): string {
  const parts: string[] = []
  if (fixes.relinks.length > 0) parts.push(`Relink ${fixes.relinks.length}`)
  if (fixes.merges.length > 0) parts.push(`Merge ${fixes.merges.length}`)
  if (fixes.removes.length > 0) parts.push(`Remove ${fixes.removes.length}`)
  return parts.join(' · ') || 'Nothing to apply'
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/missingFiles && npx tsc --noEmit`
Expected: all pass, and tsc reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missingFiles/missingChoice.ts src/lib/missingFiles/missingChoice.test.ts
git commit -m "feat(missing): review state with defaults, conflicts and fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Shared add-and-scan, and "Followed N moved files"

**Files:**
- Modify: `src/components/settings/SettingsContext.tsx` (interface ~27-40; handlers ~286-385; `value` ~694)
- Modify: `src/App.tsx` (imports ~65; the `library-changed` listener ~726-737)

- [ ] **Step 1: SettingsContext**

1. Add the imports:

```ts
import { followedMessage } from '../../lib/missingFiles/messages'
import type { ScanResult } from '../../types/track'
```

2. In `SettingsContextValue`, under `handleRescanAll`, add:

```ts
  /** Adds a library folder and scans it. Settings → Library and the Missing Files review share it. */
  addFolderAndScan: (path: string) => Promise<ScanResult>
```

3. Replace `handleAddFolder` with the following, placing `notifyFollowed` and `addFolderAndScan` just above it:

```ts
  function notifyFollowed(relinked: number) {
    const message = followedMessage(relinked)
    if (message) onNotification?.(message, 'success')
  }

  async function addFolderAndScan(path: string): Promise<ScanResult> {
    const updatedFolders = await tauriApi.addLibraryFolder(path)
    setFolders(updatedFolders)
    setScanningFolder(path)
    setScanStartTime(Date.now())
    try {
      const result = await tauriApi.scanDirectory(path)
      notifyFollowed(result.relinked)
      return result
    } finally {
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
      // The folder is in the library even when its scan failed.
      onFoldersChanged()
    }
  }

  async function handleAddFolder() {
    try {
      setError(null)
      const selectedPath = await open({ directory: true, multiple: false, title: 'Add Library Folder' })
      if (!selectedPath) return
      setLoading(true)
      await addFolderAndScan(selectedPath as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }
```

4. In `handleRescanFolder`, change `await tauriApi.scanDirectory(path)` to `const result = await tauriApi.scanDirectory(path)`. Add `notifyFollowed(result.relinked)` before `onFoldersChanged()`.

5. In `handleRescanAll`:
   - add `let relinked = 0` before the loop;
   - in the loop, `const result = await tauriApi.scanDirectory(folder)` and then `relinked += result.relinked`;
   - add `notifyFollowed(relinked)` before `onFoldersChanged()`.

6. Add `addFolderAndScan` to the `value` object, next to `handleRescanAll`.

- [ ] **Step 2: App.tsx watcher**

1. Add the import next to the other lib imports:

```ts
import { followedMessage } from './lib/missingFiles/messages'
```

2. In the `listen('library-changed', …)` handler, replace the scan loop:

```ts
      let relinked = 0
      for (const folder of libraryFoldersRef.current) {
        try {
          const result = await tauriApi.scanDirectory(folder)
          relinked += result.relinked
        } catch (err) {
          console.warn(`Failed to re-scan folder ${folder}:`, err)
        }
      }
      const followed = followedMessage(relinked)
      if (followed) toast(followed, { kind: 'success' })
```

- [ ] **Step 3: Typecheck, lint and tests**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc is clean, all vitest tests pass, and lint shows only the 9 pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsContext.tsx src/App.tsx
git commit -m "feat(missing): say when a scan followed moved files; share add-and-scan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The Missing Files modal

**Files:**
- Create: `src/components/MissingFilesModal.tsx`
- Create: `src/components/MissingFilesModal.css`

This is UI only. All its logic is in `missingChoice.ts`, `paths.ts` and `messages.ts`, which are tested. The modal is checked by eye in Task 13.

- [ ] **Step 1: Create the CSS**

`src/components/MissingFilesModal.css`:

```css
/* Missing Files review. The shell, tabs, cards, rows, segmented control and
   footer come from DuplicatesModal.css; this file adds only what is new. */

.mf-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.mf-card__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.mf-card__title::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.mf-card--found .mf-card__title::before {
  background: var(--color-success);
}

.mf-card--missing .mf-card__title::before {
  background: var(--text-secondary);
}

.mf-card__count {
  font-weight: 400;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.mf-card__hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.mf-row--fix {
  background: rgba(var(--color-success-rgb), 0.06);
}

.mf-row--remove {
  background: rgba(var(--color-danger-rgb), 0.07);
}

.mf-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.mf-title__text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mf-title__text strong {
  font-weight: 600;
}

.mf-artist {
  color: var(--text-secondary);
}

.mf-pill {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.mf-pill--lib {
  background: rgba(var(--color-info-rgb), 0.14);
  color: var(--color-info);
}

.mf-pill--warn {
  background: rgba(var(--color-warning-rgb), 0.14);
  color: var(--color-warning);
}

.mf-path {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 3px;
  font-size: 12px;
}

.mf-old,
.mf-new {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mf-old,
.mf-folder {
  color: var(--text-secondary);
}

.mf-new {
  color: var(--text-primary);
}

.mf-arrow {
  flex: none;
  color: var(--text-secondary);
  opacity: 0.7;
}

.mf-select {
  min-width: 0;
  max-width: 320px;
  height: 24px;
  padding: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12px;
}

.mf-link {
  flex: none;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.mf-link:hover:not(:disabled) {
  color: var(--text-primary);
}

.dup-fact--warn {
  color: var(--color-warning);
}

.dup-fact--danger {
  color: var(--color-danger);
}

.mf-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mf-locate {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.mf-locate:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

.dup-seg__btn.mf-seg--fix {
  background: rgba(var(--color-success-rgb), 0.18);
  color: var(--color-success);
  font-weight: 600;
}

.dup-seg__btn.mf-seg--leave {
  background: var(--bg-elevated, var(--bg-tertiary));
  color: var(--text-primary);
  font-weight: 600;
}

.dup-seg__btn.mf-seg--remove {
  background: rgba(var(--color-danger-rgb), 0.2);
  color: var(--color-danger);
  font-weight: 600;
}

.mf-footer__hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Settings → Database: the count on Review Missing Files */
.mf-count {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Create the component**

`src/components/MissingFilesModal.tsx`:

```tsx
// Missing Files review (spec docs/superpowers/specs/2026-10-15-missing-files-design.md),
// opened from Settings → Database. Each track whose file is gone is relinked
// to its file's new place, merged into the library track that has the file
// now, left as it is, or removed from the library. Files on disk are never
// touched.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { getErrorMessage } from '../types/ai'
import { copyPlace } from '../lib/duplicates/copyFacts'
import { formatTime } from '../lib/trackTable/cells'
import { fixSummaryMessage } from '../lib/missingFiles/messages'
import {
  baseName,
  isInsideFolders,
  parentFolder,
} from '../lib/missingFiles/paths'
import {
  actionLabel,
  buildFixes,
  chooseFile,
  emptyChoice,
  locate,
  rowViews,
  setState,
  withLocated,
  type FixState,
  type MissingChoice,
  type RowView,
} from '../lib/missingFiles/missingChoice'
import type { MissingCandidate, MissingTrack } from '../types/track'
import { useSettingsContext } from './settings/SettingsContext'
import { Icon } from './Icon'
import './DuplicatesModal.css'
import './MissingFilesModal.css'

interface MissingFilesModalProps {
  onClose: () => void
  onTracksChanged: () => void
  onNotification: (
    message: string,
    type: 'success' | 'warning' | 'info' | 'error',
  ) => void
}

type FilterValue = 'all' | 'found' | 'missing'

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'aiff', 'aif', 'm4a', 'ogg']

const STATES: FixState[] = ['fix', 'leave', 'remove']

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function placeText(path: string): string {
  const p = copyPlace(path)
  return p.folder ? `${p.folder} / ${p.file}` : p.file
}

export function MissingFilesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: MissingFilesModalProps) {
  const { folders, addFolderAndScan } = useSettingsContext()
  const [tracks, setTracks] = useState<MissingTrack[]>([])
  const [choice, setChoice] = useState<MissingChoice>(emptyChoice)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 'Applying…' or 'Adding <folder>…'; the modal can't close meanwhile. */
  const [busy, setBusy] = useState<string | null>(null)

  const closeUnlessBusy = () => {
    if (!busy) onClose()
  }
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, closeUnlessBusy)

  // The parent passes a new onNotification every render (about 4 times a
  // second while music plays). Held in a ref, it can't retrigger the load
  // and wipe the user's choices.
  const notifyRef = useRef(onNotification)
  useEffect(() => {
    notifyRef.current = onNotification
  })
  // A reload reads the files picked so far without being rebuilt per pick.
  const choiceRef = useRef(choice)
  useEffect(() => {
    choiceRef.current = choice
  })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await tauriApi.getMissingTracks()
      // Picked files are described again: an apply or a scan may have made
      // them library tracks. A file that is gone is dropped.
      const located = new Map<number, MissingCandidate>()
      for (const [trackId, file] of choiceRef.current.located) {
        if (!data.some((t) => t.id === trackId)) continue
        try {
          located.set(trackId, await tauriApi.describeFile(trackId, file.path))
        } catch {
          // The file is gone: the row falls back to its own files.
        }
      }
      setTracks(data)
      setChoice((c) => withLocated(c, located))
    } catch (err) {
      setLoadError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const views = useMemo(() => rowViews(tracks, choice), [tracks, choice])
  const fixes = useMemo(() => buildFixes(tracks, choice), [tracks, choice])
  const hasFile = (t: MissingTrack) =>
    (views.get(t.id)?.candidates.length ?? 0) > 0
  const found = tracks.filter(hasFile)
  const notFound = tracks.filter((t) => !hasFile(t))
  const nothing =
    fixes.relinks.length + fixes.merges.length + fixes.removes.length === 0

  /** Offers a folder outside the library as a library folder, then reloads. */
  async function offerFolder(folder: string): Promise<boolean> {
    const name = baseName(folder)
    const yes = await ask(
      `Add "${name}" to your library folders? Its tracks are imported, and moved files are followed.`,
      { title: 'Add to library', kind: 'info', okLabel: 'Add', cancelLabel: 'Cancel' },
    )
    if (!yes) return false
    setBusy(`Adding ${name}…`)
    let added = true
    try {
      await addFolderAndScan(folder)
    } catch (err) {
      added = false
      notifyRef.current(getErrorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
    // Reload either way: when only the scan failed, the folder is in the library.
    await load()
    return added
  }

  async function searchFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: 'Search another folder',
    })
    if (typeof picked !== 'string') return
    if (isInsideFolders(picked, folders)) {
      notifyRef.current('Already in your library folders', 'info')
      return
    }
    await offerFolder(picked)
  }

  async function pickFile(track: MissingTrack) {
    const picked = await open({
      directory: false,
      multiple: false,
      title: `Locate "${track.title || baseName(track.file_path)}"`,
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    })
    if (typeof picked !== 'string') return
    if (!isInsideFolders(picked, folders)) {
      const added = await offerFolder(parentFolder(picked))
      if (!added) return
    }
    try {
      const file = await tauriApi.describeFile(track.id, picked)
      setChoice((c) => locate(c, track.id, file))
    } catch (err) {
      notifyRef.current(getErrorMessage(err), 'error')
    }
  }

  async function apply() {
    if (busy || nothing) return
    setBusy('Applying…')
    try {
      const summary = await tauriApi.applyMissingFixes(fixes)
      notifyRef.current(
        fixSummaryMessage(summary),
        summary.skipped.length > 0 ? 'warning' : 'success',
      )
      onTracksChanged()
      await load()
    } catch (err) {
      notifyRef.current(getErrorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const tabs: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: tracks.length },
    { value: 'found', label: 'Found', count: found.length },
    { value: 'missing', label: 'Not found', count: notFound.length },
  ]
  const summary = `${plural(tracks.length, 'track points', 'tracks point')} to a file that isn't there · ${found.length} found by file name`
  const showFound = filter !== 'missing' && found.length > 0
  const showNotFound = filter !== 'found' && notFound.length > 0
  const rowProps = (track: MissingTrack) => ({
    track,
    view: views.get(track.id) as RowView,
    disabled: busy !== null,
    onState: (state: FixState) => setChoice((c) => setState(c, track.id, state)),
    onChoose: (path: string) => setChoice((c) => chooseFile(c, track.id, path)),
    onPick: () => void pickFile(track),
  })

  return (
    <div className="modal-overlay" onClick={closeUnlessBusy}>
      <div
        className="modal-content dup-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dup-modal__header">
          <div>
            <h3>Missing Files</h3>
            <p className="dup-modal__summary">{busy ?? summary}</p>
          </div>
          <button
            type="button"
            className="dup-modal__close"
            onClick={closeUnlessBusy}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="dup-modal__toolbar">
          <div className="dup-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filter === tab.value}
                className={`dup-tab ${filter === tab.value ? 'dup-tab--active' : ''}`}
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
                <span className="dup-tab__count">{tab.count}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dup-text-btn"
            onClick={() => void searchFolder()}
            disabled={loading || busy !== null}
          >
            Search another folder…
          </button>
        </div>

        <div className="dup-modal__body">
          {loading ? (
            <div className="dup-modal__state">
              <Icon name="Loader" size={28} />
              <p>Looking for missing files…</p>
            </div>
          ) : loadError ? (
            <div className="dup-modal__state">
              <Icon name="CircleAlert" size={28} />
              <p>{loadError}</p>
              <button type="button" className="btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : tracks.length === 0 ? (
            <div className="dup-modal__state dup-modal__state--success">
              <Icon name="CircleCheck" size={36} />
              <p>No missing files</p>
            </div>
          ) : !showFound && !showNotFound ? (
            <div className="dup-modal__state">
              <Icon name="ListFilter" size={24} />
              <p>Nothing on this tab.</p>
            </div>
          ) : (
            <div className="dup-modal__groups">
              {showFound && (
                <section className="dup-card mf-card--found">
                  <header className="dup-card__header">
                    <div className="mf-card__head">
                      <span className="mf-card__title">
                        Found by file name
                        <span className="mf-card__count">{found.length}</span>
                      </span>
                      <span className="mf-card__hint">
                        Same file name somewhere in your folders
                      </span>
                    </div>
                  </header>
                  <ul className="dup-card__rows">
                    {found.map((t) => (
                      <MissingRow key={t.id} {...rowProps(t)} />
                    ))}
                  </ul>
                </section>
              )}
              {showNotFound && (
                <section className="dup-card mf-card--missing">
                  <header className="dup-card__header">
                    <div className="mf-card__head">
                      <span className="mf-card__title">
                        Not found
                        <span className="mf-card__count">{notFound.length}</span>
                      </span>
                      <span className="mf-card__hint">
                        Moved off this Mac, or deleted
                      </span>
                    </div>
                  </header>
                  <ul className="dup-card__rows">
                    {notFound.map((t) => (
                      <MissingRow key={t.id} {...rowProps(t)} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="dup-modal__footer">
          <span className="mf-footer__hint">
            Relink keeps playlists, plays, analysis and rating. Remove takes a
            track out of the library and its playlists; files on disk are never
            touched.
          </span>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${fixes.removes.length > 0 ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => void apply()}
            disabled={busy !== null || nothing}
          >
            {busy === 'Applying…' ? 'Applying…' : actionLabel(fixes)}
          </button>
        </footer>
      </div>
    </div>
  )
}

function MissingRow({
  track,
  view,
  disabled,
  onState,
  onChoose,
  onPick,
}: {
  track: MissingTrack
  view: RowView
  disabled: boolean
  onState: (state: FixState) => void
  onChoose: (path: string) => void
  onPick: () => void
}) {
  const c = view.candidate
  const facts: { text: string; tone?: 'warn' | 'danger' | 'moves' }[] = []
  if (view.blockedBy) {
    facts.push({
      text: `same file as ${view.blockedBy.title || baseName(view.blockedBy.file_path)}`,
      tone: 'warn',
    })
  }
  if (c && view.lengthDiffers) {
    facts.push({
      text: `length differs: ${formatTime(track.duration_ms)} in library, ${formatTime(c.duration_ms ?? undefined)} found`,
      tone: 'warn',
    })
  }
  if (track.drive_missing) {
    facts.push({ text: `on drive ${track.drive_missing}, not connected` })
  }
  facts.push({ text: track.analyzed ? 'analyzed' : 'not analyzed' })
  facts.push({
    text: track.plays > 0 ? plural(track.plays, 'play', 'plays') : 'no plays',
  })
  facts.push({
    text:
      track.playlists.length > 0
        ? `in ${track.playlists.map((p) => p.name).join(', ')}`
        : 'no playlists',
  })
  if (view.state === 'fix' && view.merge) {
    facts.push({ text: 'plays, playlists and analysis move into it', tone: 'moves' })
  }
  if (view.state === 'remove' && track.playlists.length > 0) {
    facts.push({
      text: `leaves ${plural(track.playlists.length, 'playlist', 'playlists')}`,
      tone: 'danger',
    })
  }
  const old = copyPlace(track.file_path)
  const place = c ? copyPlace(c.path) : null

  return (
    <li className={`dup-row mf-row--${view.state}`}>
      <div className="dup-row__main">
        <div className="mf-title">
          <span className="mf-title__text">
            <strong>{track.title || 'Untitled'}</strong>
            <span className="mf-artist">
              {' '}
              — {track.artist || 'Unknown artist'}
            </span>
          </span>
          {view.merge && (
            <span className="mf-pill mf-pill--lib">Already in library</span>
          )}
          {view.lengthDiffers && (
            <span className="mf-pill mf-pill--warn">Length differs</span>
          )}
        </div>
        <div className="mf-path">
          <span className="mf-old" data-tip={track.file_path}>
            {old.folder ? `${old.folder} / ${old.file}` : old.file}
          </span>
          {c && place && (
            <>
              <span className="mf-arrow" aria-hidden="true">
                →
              </span>
              {view.candidates.length > 1 ? (
                <select
                  className="mf-select"
                  aria-label="Which file is this track"
                  value={c.path}
                  onChange={(e) => onChoose(e.target.value)}
                  disabled={disabled}
                >
                  {view.candidates.map((f) => (
                    <option key={f.path} value={f.path}>
                      {placeText(f.path)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mf-new" data-tip={c.path}>
                  {place.folder && (
                    <span className="mf-folder">{place.folder} / </span>
                  )}
                  {place.file}
                </span>
              )}
              <button
                type="button"
                className="mf-link"
                onClick={onPick}
                disabled={disabled}
              >
                Other file…
              </button>
            </>
          )}
        </div>
        <div className="dup-row__facts">
          {facts.map((f, i) => (
            <span
              key={i}
              className={`dup-fact ${f.tone ? `dup-fact--${f.tone}` : ''}`}
            >
              {f.text}
            </span>
          ))}
        </div>
      </div>
      <div className="mf-controls">
        {!c && (
          <button
            type="button"
            className="mf-locate"
            onClick={onPick}
            disabled={disabled}
          >
            Locate…
          </button>
        )}
        <div
          className="dup-seg"
          role="group"
          aria-label="What happens to this track"
        >
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={`dup-seg__btn ${view.state === s ? `mf-seg--${s}` : ''}`}
              aria-pressed={view.state === s}
              onClick={() => onState(s)}
              disabled={
                disabled || (s === 'fix' && (!c || view.blockedBy !== undefined))
              }
            >
              {s === 'fix'
                ? view.merge
                  ? 'Merge'
                  : 'Relink'
                : s === 'leave'
                  ? 'Leave'
                  : 'Remove'}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc is clean, and lint shows only the 9 pre-existing errors. If a lint rule flags `setChoice` inside `load` (react-hooks), keep the behaviour and follow the pattern `DuplicatesModal.tsx` uses for `loadGroups`.

- [ ] **Step 4: Commit**

```bash
git add src/components/MissingFilesModal.tsx src/components/MissingFilesModal.css
git commit -m "feat(missing): the Missing Files review modal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Entry in Settings → Database

**Files:**
- Modify: `src/components/settings/DatabaseSection.tsx`

- [ ] **Step 1: Implement**

Replace the whole file:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useSettingsContext } from './SettingsContext'
import { DuplicatesModal } from '../DuplicatesModal'
import { MissingFilesModal } from '../MissingFilesModal'
import { tauriApi } from '../../lib/tauri-api'

export function DatabaseSection() {
  const { cleaningDuplicates, onFoldersChanged, onNotification } =
    useSettingsContext()

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [showMissingModal, setShowMissingModal] = useState(false)
  // Counted in the background, so the button shows at once without a badge.
  const [missingCount, setMissingCount] = useState<number | null>(null)

  const countMissing = useCallback(() => {
    tauriApi
      .countMissingTracks()
      .then(setMissingCount)
      .catch(() => setMissingCount(null))
  }, [])

  useEffect(() => {
    countMissing()
  }, [countMissing])

  return (
    <>
      <p className="settings-description">
        Clean up duplicate tracks and files that went missing.
      </p>

      <div className="sv-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            disabled={cleaningDuplicates}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
          >
            Review Duplicate Tracks
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Review and selectively remove duplicate tracks from your library.
          </p>
        </div>
        <div>
          <button
            onClick={() => setShowMissingModal(true)}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
          >
            Review Missing Files
            {missingCount !== null && missingCount > 0 && (
              <span className="mf-count">{missingCount}</span>
            )}
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Tracks whose file was moved, renamed or deleted.
          </p>
        </div>
      </div>

      {showDuplicatesModal && (
        <DuplicatesModal
          onClose={() => setShowDuplicatesModal(false)}
          onTracksChanged={onFoldersChanged}
          onNotification={(msg, type) =>
            onNotification?.(msg, type)
          }
        />
      )}

      {showMissingModal && (
        <MissingFilesModal
          onClose={() => {
            setShowMissingModal(false)
            countMissing()
          }}
          onTracksChanged={onFoldersChanged}
          onNotification={(msg, type) => onNotification?.(msg, type)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Typecheck, lint and tests**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc is clean, all tests pass, and lint shows only the 9 pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/DatabaseSection.tsx
git commit -m "feat(missing): Review Missing Files in Settings → Database, with a count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Full verification and the real library

- [ ] **Step 1: Everything green**

Run the `test-runner` agent. It covers:
- `cd src-tauri && cargo test --lib`
- `npx vitest run`
- `npx tsc --noEmit`
- `npm run lint`

Expected: all tests pass, tsc is clean, and lint shows only the 9 pre-existing errors.

- [ ] **Step 2: Final code review**

Dispatch a reviewer over `git diff main...HEAD`. Check it against the spec. Fix the confirmed findings.

- [ ] **Step 3: Check on the real library (needs the user)**

1. **Ask the user before touching their DB.** Suggest a backup first:

   ```bash
   cp ~/Library/Application\ Support/com.nemanjamarjanovic.recodeck/recodeck.db \
      ~/Library/Application\ Support/com.nemanjamarjanovic.recodeck/recodeck.before-missing.db
   ```

2. Start the app with `/dev`.
3. The user opens Settings → Database. Review Missing Files shows a count, and about 100 was expected before any scan.
4. The user runs Settings → Library → Rescan all. Expect the notice "Followed N moved files", with N close to 100 if the moved files' content is unchanged.
5. The user opens Review Missing Files again. Check that:
   - the leftovers show;
   - the defaults follow the spec;
   - Locate… and Search another folder… offer Add to library for an outside folder;
   - an apply shows the toast and the list reloads.
6. Report what was seen. Do not release; the release is a separate decision.
