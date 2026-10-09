# Export to DJ Software — Phase 1 (Core, Dialog, Rekordbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playlist's or playlist folder's menu gets **Export to DJ software…**, which opens a dialog that writes the checked playlists, with their tracks' BPM, key, rating, genre and comments, as a Rekordbox XML file and remembers the choice.

**Architecture:**
- A new Rust module `src-tauri/src/formats/` holds a model of the export (`ExportLibrary`):
  - `collect` fills it from the database;
  - `mark_missing` checks the files exist, after the DB lock is let go;
  - pure writers turn it into a file's text: Rekordbox only in this phase.
- A command module `commands/dj_export.rs` exposes `dj_export_defaults` and `export_to_dj`. It writes the file atomically and remembers the choice in the `settings` table.
- The React dialog `DjExportModal` sits on a small pure selection module, `src/lib/djExport/selection.ts`, and is opened from `FolderTree`'s menus through `Sidebar` and `App`.

**Tech Stack:** Rust (rusqlite, serde, serde_json, tauri 2, tempfile for tests), React 19 + TypeScript, vitest (jsdom), `@tauri-apps/plugin-dialog` (`save`), `@tauri-apps/plugin-opener` (`revealItemInDir`).

**Spec:** `docs/superpowers/specs/2026-10-09-dj-export-design.md`, phase 1. Traktor and Serato are later phases with their own plans.

---

## Conventions for every task

- **Branch:** `feat/dj-export`, already checked out. Never commit `.claude/settings.local.json` or `.planning/STATE.md`; they are the user's. Stage files by name.
- **Editing existing big files:** this applies to `App.tsx`, `FolderTree.tsx`, `Sidebar.tsx`, `tauri-api.ts`, `lib.rs`, `commands/mod.rs` and `capabilities/default.json`.
  - Use the small `python3` replace scripts given in the steps, not the Edit tool. A PostToolUse formatter hook reformats whole files on Edit/Write, which would bury the change in noise.
  - New files may be written with the Write tool.
- **Commands:**
  - Rust tests: `cd src-tauri && cargo test --lib formats` (or the module named in the step).
  - Rust compile: `cd src-tauri && cargo check`.
  - Frontend tests: `npx vitest run <path>`.
  - Types: `npx tsc --noEmit`.
  - Lint: `npx eslint src mobile`. The baseline is 28 problems; add none.
- **Commit messages:** English, `type(scope): …`, ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **Comments:** match the codebase. Plain English, say what a thing is for, no noise.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/formats/mod.rs` | replace stub | `ExportTrack`, `ExportNode`, `ExportLibrary`, `collect`, `mark_missing` |
| `src-tauri/src/formats/xml.rs` | create | `attr()`: XML attribute escaping |
| `src-tauri/src/formats/keys.rs` | create | Camelot → Rekordbox `Tonality` |
| `src-tauri/src/formats/rekordbox.rs` | create | `location()`, `kind()`, `write()` |
| `src-tauri/src/formats/fixtures/rekordbox_sample.xml` | create | golden output |
| `src-tauri/src/commands/dj_export.rs` | create | `DjTarget`, choice/defaults/result types, helpers, two commands |
| `src-tauri/src/commands/mod.rs` | modify | `pub mod dj_export;` |
| `src-tauri/src/lib.rs` | modify | `pub mod formats;`, register the two commands |
| `src-tauri/capabilities/default.json` | modify | `dialog:allow-save` |
| `src/types/djExport.ts` | create | TS types for the commands |
| `src/lib/tauri-api.ts` | modify | `djExportDefaults`, `pickDjExportFile`, `exportToDj` |
| `src/lib/djExport/selection.ts` (+ `.test.ts`) | create | tree, initial selection, check states, toggle, order, result toast text |
| `src/components/DjExportModal.tsx` (+ `.css`, `.test.tsx`) | create | the dialog |
| `src/components/FolderTree.tsx` | modify | menu items, `onExportToDj` prop |
| `src/components/layout/Sidebar.tsx` | modify | pass `onExportToDj` through |
| `src/App.tsx` | modify | state + render the dialog |
| `CHANGELOG.md` | modify | `[Unreleased]` entry |

---

### Task 1: The `formats` module and XML attribute escaping

**Files:**
- Modify: `src-tauri/src/formats/mod.rs` (replace the 2-line stub)
- Create: `src-tauri/src/formats/xml.rs`
- Modify: `src-tauri/src/lib.rs` (declare the module)

- [ ] **Step 1: Write `xml.rs` with its failing tests first**

Create `src-tauri/src/formats/xml.rs`:

```rust
// src-tauri/src/formats/xml.rs
// XML for the exports, written by hand so the output is exactly what each DJ
// program expects: one escaping function for attribute values.

/// Text for an XML attribute value: the five entities, line breaks and tabs as
/// character references (an attribute's parser would turn them into spaces),
/// and characters XML 1.0 cannot hold dropped.
pub fn attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '\n' => out.push_str("&#10;"),
            '\r' => out.push_str("&#13;"),
            '\t' => out.push_str("&#9;"),
            c if is_xml_char(c) => out.push(c),
            _ => {}
        }
    }
    out
}

fn is_xml_char(c: char) -> bool {
    matches!(c, '\u{20}'..='\u{D7FF}' | '\u{E000}'..='\u{FFFD}' | '\u{10000}'..='\u{10FFFF}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_five_entities_are_escaped() {
        assert_eq!(attr(r#"Tom & Jerry <"live"> 'mix'"#), "Tom &amp; Jerry &lt;&quot;live&quot;&gt; &apos;mix&apos;");
    }

    #[test]
    fn line_breaks_and_tabs_survive_as_references() {
        assert_eq!(attr("one\ntwo\r\nthree\tfour"), "one&#10;two&#13;&#10;three&#9;four");
    }

    #[test]
    fn other_control_characters_are_dropped_and_unicode_kept() {
        assert_eq!(attr("a\u{0}b\u{7}c\u{FFFE}d"), "abcd");
        assert_eq!(attr("Čačak 🎧 Ça"), "Čačak 🎧 Ça");
    }
}
```

- [ ] **Step 2: Replace the stub `formats/mod.rs` with the module root (model comes in Task 3)**

Write `src-tauri/src/formats/mod.rs` (overwrite the stub entirely):

```rust
// src-tauri/src/formats/mod.rs
// Export to DJ software (docs/superpowers/specs/2026-10-09-dj-export-design.md):
// the playlists a DJ picks, with their tracks' data, as one model that each
// program's writer turns into its own format. collect reads the database,
// mark_missing looks at the disk, and the writers touch neither.

mod xml;
```

- [ ] **Step 3: Declare the module in `lib.rs`**

Run:

```bash
cd /path/to/RecoDeck && python3 - <<'EOF'
p='src-tauri/src/lib.rs'
s=open(p).read()
old="pub mod external;\n"
assert s.count(old)==1
s=s.replace(old, old+"pub mod formats;\n")
open(p,'w').write(s)
EOF
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::xml`
Expected: 3 tests PASS. A `dead_code` warning for `attr` is fine until Task 5 uses it.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/mod.rs src-tauri/src/formats/xml.rs src-tauri/src/lib.rs
git commit -m "feat(export): the formats module, with XML attribute escaping for the DJ exports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Camelot → Rekordbox key

**Files:**
- Create: `src-tauri/src/formats/keys.rs`
- Modify: `src-tauri/src/formats/mod.rs` (add `pub mod keys;`)

- [ ] **Step 1: Write `keys.rs` with tests**

```rust
// src-tauri/src/formats/keys.rs
// Keys for the DJ programs. Analysis stores Camelot ("8A"); each program wants
// its own notation.

const MINOR: [&str; 12] = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "Dbm"];
const MAJOR: [&str; 12] = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

/// Camelot to the classic notation Rekordbox shows ("8A" → "Am"); None for
/// anything that is not one of the 24 codes.
pub fn rekordbox_tonality(camelot: &str) -> Option<&'static str> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(if minor { MINOR[number - 1] } else { MAJOR[number - 1] })
}

/// "8A" → (8, true); "12b" → (12, false). Spaces and case do not matter.
fn parse_camelot(code: &str) -> Option<(usize, bool)> {
    let code = code.trim().to_ascii_uppercase();
    let minor = match code.chars().last()? {
        'A' => true,
        'B' => false,
        _ => return None,
    };
    let number: usize = code[..code.len() - 1].parse().ok()?;
    (1..=12).contains(&number).then_some((number, minor))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_24_codes_map_to_rekordbox_keys() {
        let minor: Vec<_> = (1..=12).map(|n| rekordbox_tonality(&format!("{n}A")).unwrap()).collect();
        let major: Vec<_> = (1..=12).map(|n| rekordbox_tonality(&format!("{n}B")).unwrap()).collect();
        assert_eq!(minor, MINOR);
        assert_eq!(major, MAJOR);
        assert_eq!(rekordbox_tonality("8A"), Some("Am"));
        assert_eq!(rekordbox_tonality("8B"), Some("C"));
        assert_eq!(rekordbox_tonality("11A"), Some("F#m"));
    }

    #[test]
    fn spaces_and_case_do_not_matter() {
        assert_eq!(rekordbox_tonality(" 12b "), Some("E"));
    }

    #[test]
    fn anything_else_has_no_key() {
        for bad in ["", "A", "0A", "13A", "8C", "Am", "8", "-1A"] {
            assert_eq!(rekordbox_tonality(bad), None, "{bad:?}");
        }
    }
}
```

- [ ] **Step 2: Add the module**

```bash
python3 - <<'EOF'
p='src-tauri/src/formats/mod.rs'
s=open(p).read()
old="mod xml;\n"
assert s.count(old)==1
s=s.replace(old, "pub mod keys;\n"+old)
open(p,'w').write(s)
EOF
```

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::keys`
Expected: 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/formats/keys.rs src-tauri/src/formats/mod.rs
git commit -m "feat(export): Camelot keys in Rekordbox's notation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The export model, `collect` and `mark_missing`

**Files:**
- Modify: `src-tauri/src/formats/mod.rs`

`ExportNode::Playlist` has no `id` yet. Phase 2 adds it for Traktor's playlist UUIDs; adding it now would be an unused field.

The database API used here, all in `src-tauri/src/db/mod.rs`:
- `Database::get_all_playlists() -> rusqlite::Result<Vec<Playlist>>`, ordered by name, with `playlist_type` (`"folder"` for folders) and `parent_id`.
- `Database::get_playlist_tracks(id) -> rusqlite::Result<Vec<TrackWithAnalysis>>`, where `TrackWithAnalysis = (Track, Option<f64> bpm, Option<f64>, Option<String> musical_key, Option<f64>)`, in playlist order.
- In tests: `Database::new_in_memory()`, `run_migrations()`, `create_track(&Track)`, `save_bpm_analysis`, `save_key_analysis`, `create_playlist(name, type, parent_id)` and `add_track_to_playlist`.

- [ ] **Step 1: Write the failing tests at the bottom of `formats/mod.rs`**

Append:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str, title: &str) -> Track {
        Track {
            id: None,
            file_path: path.to_string(),
            file_hash: format!("hash-{path}"),
            title: Some(title.to_string()),
            artist: Some("Artist".to_string()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: Some(300_000),
            file_format: Some("mp3".to_string()),
            bitrate: Some(320),
            sample_rate: Some(44_100),
            file_size: Some(1),
            date_added: None,
            date_modified: None,
            play_count: 2,
            rating: 4,
            comment: None,
            artwork_path: None,
            genre: Some("Techno".to_string()),
            genre_source: None,
        }
    }

    struct Fixture {
        db: Database,
        gigs: i64,
        friday: i64,
        warmup: i64,
        a: i64,
        b: i64,
    }

    /// Gigs (folder) › Friday [a, b]; Warm-up [b]; Unpicked [c]; Empty (folder).
    fn fixture() -> Fixture {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let a = db.create_track(&track("/m/a.mp3", "A")).unwrap();
        let b = db.create_track(&track("/m/b.mp3", "B")).unwrap();
        let c = db.create_track(&track("/m/c.mp3", "C")).unwrap();
        db.save_bpm_analysis(a, 124.0, 0.9).unwrap();
        db.save_key_analysis(a, "8A", 0.8).unwrap();
        let gigs = db.create_playlist("Gigs", "folder", None).unwrap();
        let friday = db.create_playlist("Friday", "manual", Some(gigs)).unwrap();
        let warmup = db.create_playlist("Warm-up", "manual", None).unwrap();
        let unpicked = db.create_playlist("Unpicked", "manual", None).unwrap();
        db.create_playlist("Empty", "folder", None).unwrap();
        db.add_track_to_playlist(friday, a).unwrap();
        db.add_track_to_playlist(friday, b).unwrap();
        db.add_track_to_playlist(warmup, b).unwrap();
        db.add_track_to_playlist(unpicked, c).unwrap();
        Fixture { db, gigs, friday, warmup, a, b }
    }

    #[test]
    fn collect_keeps_the_folders_on_the_way_and_each_track_once() {
        let f = fixture();
        // A folder id among them is ignored: only playlists are picked.
        let lib = collect(&f.db, &[f.warmup, f.friday, f.gigs]).unwrap();
        assert_eq!(
            lib.tree,
            vec![
                ExportNode::Folder {
                    name: "Gigs".into(),
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![f.a, f.b] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![f.b] },
            ]
        );
        assert_eq!(lib.tracks.iter().map(|t| t.id).collect::<Vec<_>>(), vec![f.a, f.b]);
        assert_eq!(lib.playlist_count(), 2);
    }

    #[test]
    fn collect_carries_the_analysis_and_the_tags() {
        let f = fixture();
        let lib = collect(&f.db, &[f.friday]).unwrap();
        let a = &lib.tracks[0];
        assert_eq!(a.bpm, Some(124.0));
        assert_eq!(a.camelot.as_deref(), Some("8A"));
        assert_eq!(a.rating, 4);
        assert_eq!(a.genre.as_deref(), Some("Techno"));
        assert!(a.date_added.is_some(), "the database fills date_added");
        assert_eq!(lib.tracks[1].bpm, None);
    }

    #[test]
    fn nothing_picked_is_an_empty_export() {
        let f = fixture();
        assert_eq!(collect(&f.db, &[]).unwrap(), ExportLibrary::default());
    }

    #[test]
    fn mark_missing_finds_the_files_that_are_gone() {
        let dir = tempfile::tempdir().unwrap();
        let here = dir.path().join("here.mp3");
        std::fs::write(&here, b"x").unwrap();
        let mut lib = ExportLibrary {
            tracks: vec![
                export_track(1, track(here.to_str().unwrap(), "Here"), None, None),
                export_track(2, track(dir.path().join("gone.mp3").to_str().unwrap(), "Gone"), None, None),
            ],
            tree: vec![],
        };
        mark_missing(&mut lib);
        assert!(lib.tracks[0].exists);
        assert!(!lib.tracks[1].exists);
        assert_eq!(lib.present(), HashSet::from([1]));
        assert_eq!(lib.missing().iter().map(|t| t.id).collect::<Vec<_>>(), vec![2]);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd src-tauri && cargo test --lib formats::tests`
Expected: compile errors. `collect`, `ExportNode`, `ExportLibrary`, `export_track`, `mark_missing` and `Track` are not found.

- [ ] **Step 3: Write the model and the loader**

In `src-tauri/src/formats/mod.rs`, after `mod xml;` and before `#[cfg(test)]`, add:

```rust

use crate::db::{Database, Playlist, Track};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// One track as the writers need it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExportTrack {
    pub id: i64,
    pub path: String,
    /// The file is on disk (mark_missing); writers leave the others out.
    pub exists: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub year: Option<i32>,
    pub track_number: Option<i32>,
    pub duration_ms: Option<i32>,
    /// kbps.
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    /// "mp3", "flac", … as the scanner stores it.
    pub file_format: Option<String>,
    pub bpm: Option<f64>,
    /// Camelot ("8A"), as analysis stores it.
    pub camelot: Option<String>,
    /// 0–5 stars.
    pub rating: i32,
    pub comment: Option<String>,
    pub play_count: i32,
    /// SQLite's datetime ("2026-09-01 12:30:00").
    pub date_added: Option<String>,
}

/// A folder or a playlist, in the sidebar's order.
#[derive(Debug, Clone, PartialEq)]
pub enum ExportNode {
    Folder { name: String, children: Vec<ExportNode> },
    Playlist { name: String, track_ids: Vec<i64> },
}

/// The picked playlists, the folders on the way to them, and their tracks.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExportLibrary {
    /// Every track of the picked playlists, once each, in first-seen order.
    pub tracks: Vec<ExportTrack>,
    pub tree: Vec<ExportNode>,
}

impl ExportLibrary {
    /// The tracks a writer writes: their files are on disk.
    pub fn present(&self) -> HashSet<i64> {
        self.tracks.iter().filter(|t| t.exists).map(|t| t.id).collect()
    }

    /// The tracks left out because their file is gone.
    pub fn missing(&self) -> Vec<&ExportTrack> {
        self.tracks.iter().filter(|t| !t.exists).collect()
    }

    pub fn playlist_count(&self) -> usize {
        count_playlists(&self.tree)
    }
}

fn count_playlists(nodes: &[ExportNode]) -> usize {
    nodes
        .iter()
        .map(|node| match node {
            ExportNode::Folder { children, .. } => count_playlists(children),
            ExportNode::Playlist { .. } => 1,
        })
        .sum()
}

/// Deeper than this, a chain of parents is taken to be a loop.
const MAX_DEPTH: usize = 64;

/// Reads the picked playlists (folder ids and unknown ids are ignored), the
/// folders on the way to them, and their tracks with analysis. Touches no
/// file: every track starts as present until mark_missing looks.
pub fn collect(db: &Database, playlist_ids: &[i64]) -> rusqlite::Result<ExportLibrary> {
    let all = db.get_all_playlists()?;
    let wanted: HashSet<i64> = playlist_ids.iter().copied().collect();
    let selected: HashSet<i64> = all
        .iter()
        .filter(|p| p.playlist_type != "folder")
        .filter_map(|p| p.id)
        .filter(|id| wanted.contains(id))
        .collect();
    let mut collector = Collector {
        db,
        all: &all,
        needed: folders_holding(&all, &selected),
        selected,
        tracks: Vec::new(),
        seen: HashSet::new(),
    };
    let tree = collector.level(None, 0)?;
    Ok(ExportLibrary { tracks: collector.tracks, tree })
}

/// Marks the tracks whose file is gone. Run it after the database lock is let
/// go: a sleeping external drive can take seconds to answer.
pub fn mark_missing(lib: &mut ExportLibrary) {
    for track in &mut lib.tracks {
        track.exists = Path::new(&track.path).is_file();
    }
}

/// The folders on the way to the picked playlists, at any depth.
fn folders_holding(all: &[Playlist], selected: &HashSet<i64>) -> HashSet<i64> {
    let parent_of: HashMap<i64, Option<i64>> =
        all.iter().filter_map(|p| p.id.map(|id| (id, p.parent_id))).collect();
    let mut needed = HashSet::new();
    for id in selected {
        let mut at = parent_of.get(id).copied().flatten();
        for _ in 0..MAX_DEPTH {
            let Some(folder) = at else { break };
            if !needed.insert(folder) {
                break;
            }
            at = parent_of.get(&folder).copied().flatten();
        }
    }
    needed
}

struct Collector<'a> {
    db: &'a Database,
    all: &'a [Playlist],
    selected: HashSet<i64>,
    needed: HashSet<i64>,
    tracks: Vec<ExportTrack>,
    seen: HashSet<i64>,
}

impl Collector<'_> {
    /// The nodes under `parent` (None: the top level), in the sidebar's order.
    fn level(&mut self, parent: Option<i64>, depth: usize) -> rusqlite::Result<Vec<ExportNode>> {
        let mut nodes = Vec::new();
        if depth > MAX_DEPTH {
            return Ok(nodes);
        }
        let all = self.all;
        for p in all.iter().filter(|p| p.parent_id == parent) {
            let Some(id) = p.id else { continue };
            if p.playlist_type == "folder" {
                if self.needed.contains(&id) {
                    let children = self.level(Some(id), depth + 1)?;
                    nodes.push(ExportNode::Folder { name: p.name.clone(), children });
                }
            } else if self.selected.contains(&id) {
                let mut track_ids = Vec::new();
                for (track, bpm, _, camelot, _) in self.db.get_playlist_tracks(id)? {
                    let Some(track_id) = track.id else { continue };
                    track_ids.push(track_id);
                    if self.seen.insert(track_id) {
                        self.tracks.push(export_track(track_id, track, bpm, camelot));
                    }
                }
                nodes.push(ExportNode::Playlist { name: p.name.clone(), track_ids });
            }
        }
        Ok(nodes)
    }
}

fn export_track(id: i64, t: Track, bpm: Option<f64>, camelot: Option<String>) -> ExportTrack {
    ExportTrack {
        id,
        path: t.file_path,
        exists: true,
        title: t.title,
        artist: t.artist,
        album: t.album,
        genre: t.genre,
        label: t.label,
        year: t.year,
        track_number: t.track_number,
        duration_ms: t.duration_ms,
        bitrate: t.bitrate,
        sample_rate: t.sample_rate,
        file_size: t.file_size,
        file_format: t.file_format,
        bpm,
        camelot,
        rating: t.rating,
        comment: t.comment,
        play_count: t.play_count,
        date_added: t.date_added,
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats`
Expected: all `formats` tests PASS (4 new + 6 from Tasks 1–2). Dead-code warnings for items unused outside tests are fine until Task 6.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/mod.rs
git commit -m "feat(export): the export model — picked playlists, the folders on the way, each track once, and which files are gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rekordbox `Location` and `Kind`

**Files:**
- Create: `src-tauri/src/formats/rekordbox.rs`
- Modify: `src-tauri/src/formats/mod.rs` (add `pub mod rekordbox;`)

- [ ] **Step 1: Write `rekordbox.rs` with the two helpers and their tests**

```rust
// src-tauri/src/formats/rekordbox.rs
// Rekordbox XML (spec: Export to DJ Software → Rekordbox XML): the collection
// of the exported tracks and the playlists under a RecoDeck folder, loaded in
// Rekordbox through Preferences → Advanced → Database → rekordbox xml.

use std::fmt::Write;
use std::path::Path;

/// `file://localhost` and the path, every byte outside the unreserved set
/// percent-encoded and `/` kept. The path keeps the Unicode normalization it
/// has on disk. A Windows path keeps its drive: file://localhost/C:/Music/a.mp3.
pub fn location(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let (drive, rest) = match unified.as_bytes() {
        [letter, b':', b'/', ..] if letter.is_ascii_alphabetic() => unified.split_at(2),
        _ => ("", unified.as_str()),
    };
    let mut out = String::from("file://localhost");
    if !drive.is_empty() {
        out.push('/');
        out.push_str(drive);
    }
    for byte in rest.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => out.push(byte as char),
            _ => {
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
}

/// Rekordbox's file kind, from the stored format or else the file's extension.
fn kind(format: Option<&str>, path: &str) -> String {
    let ext = format
        .map(str::to_string)
        .or_else(|| Path::new(path).extension().map(|e| e.to_string_lossy().to_string()))
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "" => String::new(),
        "mp3" => "MP3 File".into(),
        "wav" | "wave" => "WAV File".into(),
        "aif" | "aiff" => "AIFF File".into(),
        "flac" => "FLAC File".into(),
        "m4a" | "mp4" | "aac" | "alac" => "M4A File".into(),
        other => format!("{} File", other.to_ascii_uppercase()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_mac_path_is_percent_encoded() {
        assert_eq!(
            location("/Users/dj/Music/Čeh & # 100%.mp3"),
            "file://localhost/Users/dj/Music/%C4%8Ceh%20%26%20%23%20100%25.mp3"
        );
        assert_eq!(location("/a/(Original Mix).mp3"), "file://localhost/a/%28Original%20Mix%29.mp3");
    }

    #[test]
    fn a_decomposed_name_stays_decomposed() {
        // "č" as c + combining caron (NFD), as macOS can store it.
        assert_eq!(location("/m/c\u{30C}.mp3"), "file://localhost/m/c%CC%8C.mp3");
    }

    #[test]
    fn a_windows_path_keeps_its_drive() {
        assert_eq!(location(r"C:\Music\Warm up.flac"), "file://localhost/C:/Music/Warm%20up.flac");
        assert_eq!(location("d:/x.mp3"), "file://localhost/d:/x.mp3");
    }

    #[test]
    fn the_kind_comes_from_the_format_or_the_extension() {
        assert_eq!(kind(Some("mp3"), "/a.x"), "MP3 File");
        assert_eq!(kind(Some("AIFF"), "/a.x"), "AIFF File");
        assert_eq!(kind(None, "/a/b.flac"), "FLAC File");
        assert_eq!(kind(Some("ogg"), "/a.ogg"), "OGG File");
        assert_eq!(kind(None, "/a/noext"), "");
    }
}
```

- [ ] **Step 2: Add the module**

```bash
python3 - <<'EOF'
p='src-tauri/src/formats/mod.rs'
s=open(p).read()
old="pub mod keys;\n"
assert s.count(old)==1
s=s.replace(old, old+"pub mod rekordbox;\n")
open(p,'w').write(s)
EOF
```

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::rekordbox`
Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/formats/rekordbox.rs src-tauri/src/formats/mod.rs
git commit -m "feat(export): Rekordbox file locations and kinds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Rekordbox XML writer, with a golden file

**Files:**
- Modify: `src-tauri/src/formats/rekordbox.rs`
- Create: `src-tauri/src/formats/fixtures/rekordbox_sample.xml`

- [ ] **Step 1: Write the golden file**

Create `src-tauri/src/formats/fixtures/rekordbox_sample.xml`, byte for byte. Use LF line endings, a final newline, and 2-space indents:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="RecoDeck" Version="0.0.0-test" Company="RecoDeck"/>
  <COLLECTION Entries="2">
    <TRACK TrackID="1" Name="Ça &amp; Va" Artist="Nina &quot;N&quot; Kraviz" Composer="" Album="Trip" Grouping="" Genre="Techno" Kind="MP3 File" Size="10000000" TotalTime="412" DiscNumber="0" TrackNumber="3" Year="2024" AverageBpm="124.00" DateAdded="2026-09-01" BitRate="320" SampleRate="44100" Comments="line one&#10;line two" PlayCount="3" Rating="204" Location="file://localhost/Users/dj/Music/%C4%8Ceh%20%26%20%23%20100%25.mp3" Remixer="" Tonality="Am" Label="Trip" Mix=""/>
    <TRACK TrackID="2" Name="Warm &lt;Up&gt;" Artist="" Composer="" Album="" Grouping="" Genre="" Kind="FLAC File" Size="0" TotalTime="0" DiscNumber="0" TrackNumber="0" Year="0" AverageBpm="0.00" DateAdded="" BitRate="0" SampleRate="0" Comments="" PlayCount="0" Rating="0" Location="file://localhost/C:/Music/Warm%20up.flac" Remixer="" Tonality="" Label="" Mix=""/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Type="0" Name="RecoDeck" Count="2">
        <NODE Type="0" Name="Gigs &amp; Raves" Count="1">
          <NODE Name="Friday" Type="1" KeyType="0" Entries="2">
            <TRACK Key="1"/>
            <TRACK Key="2"/>
          </NODE>
        </NODE>
        <NODE Name="Warm-up" Type="1" KeyType="0" Entries="1">
          <TRACK Key="2"/>
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
```

- [ ] **Step 2: Write the failing golden test**

In `rekordbox.rs`'s `mod tests`, add this test, and add `use super::super::{ExportLibrary, ExportNode, ExportTrack};` at the top of the test module:

```rust
    fn sample() -> ExportLibrary {
        let t1 = ExportTrack {
            id: 1,
            path: "/Users/dj/Music/Čeh & # 100%.mp3".into(),
            exists: true,
            title: Some("Ça & Va".into()),
            artist: Some("Nina \"N\" Kraviz".into()),
            album: Some("Trip".into()),
            genre: Some("Techno".into()),
            label: Some("Trip".into()),
            year: Some(2024),
            track_number: Some(3),
            duration_ms: Some(412_345),
            bitrate: Some(320),
            sample_rate: Some(44_100),
            file_size: Some(10_000_000),
            file_format: Some("mp3".into()),
            bpm: Some(124.0),
            camelot: Some("8A".into()),
            rating: 4,
            comment: Some("line one\nline two".into()),
            play_count: 3,
            date_added: Some("2026-09-01 12:30:00".into()),
        };
        let t2 = ExportTrack {
            id: 2,
            path: r"C:\Music\Warm up.flac".into(),
            exists: true,
            title: Some("Warm <Up>".into()),
            file_format: Some("flac".into()),
            ..ExportTrack::default()
        };
        // In a playlist, but its file is gone: left out everywhere.
        let t3 = ExportTrack { id: 3, path: "/Volumes/USB/gone.mp3".into(), exists: false, ..ExportTrack::default() };
        ExportLibrary {
            tracks: vec![t1, t2, t3],
            tree: vec![
                ExportNode::Folder {
                    name: "Gigs & Raves".into(),
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![1, 2, 3] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![2] },
            ],
        }
    }

    #[test]
    fn the_file_matches_the_golden_sample() {
        assert_eq!(write(&sample(), "0.0.0-test"), include_str!("fixtures/rekordbox_sample.xml"));
    }
```

Run: `cd src-tauri && cargo test --lib formats::rekordbox`
Expected: compile error, `write` not found.

- [ ] **Step 3: Write the writer**

In `rekordbox.rs`, change the imports to:

```rust
use super::{keys, xml::attr, ExportLibrary, ExportNode, ExportTrack};
use std::collections::HashSet;
use std::fmt::Write;
use std::path::Path;
```

and add above `pub fn location`:

```rust
/// The whole file. Tracks whose file is gone are left out of the collection
/// and of every playlist.
pub fn write(lib: &ExportLibrary, app_version: &str) -> String {
    let present = lib.present();
    let tracks: Vec<&ExportTrack> = lib.tracks.iter().filter(|t| t.exists).collect();
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str("<DJ_PLAYLISTS Version=\"1.0.0\">\n");
    let _ = writeln!(out, "  <PRODUCT Name=\"RecoDeck\" Version=\"{}\" Company=\"RecoDeck\"/>", attr(app_version));
    let _ = writeln!(out, "  <COLLECTION Entries=\"{}\">", tracks.len());
    for track in tracks {
        write_track(&mut out, track);
    }
    out.push_str("  </COLLECTION>\n");
    out.push_str("  <PLAYLISTS>\n");
    out.push_str("    <NODE Type=\"0\" Name=\"ROOT\" Count=\"1\">\n");
    let _ = writeln!(out, "      <NODE Type=\"0\" Name=\"RecoDeck\" Count=\"{}\">", lib.tree.len());
    for node in &lib.tree {
        write_node(&mut out, node, &present, 4);
    }
    out.push_str("      </NODE>\n");
    out.push_str("    </NODE>\n");
    out.push_str("  </PLAYLISTS>\n");
    out.push_str("</DJ_PLAYLISTS>\n");
    out
}

/// One collection entry, its attributes in the order Rekordbox writes them.
fn write_track(out: &mut String, t: &ExportTrack) {
    let text = |value: &Option<String>| attr(value.as_deref().unwrap_or(""));
    let _ = writeln!(
        out,
        "    <TRACK TrackID=\"{id}\" Name=\"{name}\" Artist=\"{artist}\" Composer=\"\" Album=\"{album}\" Grouping=\"\" Genre=\"{genre}\" Kind=\"{kind}\" Size=\"{size}\" TotalTime=\"{time}\" DiscNumber=\"0\" TrackNumber=\"{number}\" Year=\"{year}\" AverageBpm=\"{bpm:.2}\" DateAdded=\"{added}\" BitRate=\"{bitrate}\" SampleRate=\"{rate}\" Comments=\"{comment}\" PlayCount=\"{plays}\" Rating=\"{rating}\" Location=\"{location}\" Remixer=\"\" Tonality=\"{key}\" Label=\"{label}\" Mix=\"\"/>",
        id = t.id,
        name = text(&t.title),
        artist = text(&t.artist),
        album = text(&t.album),
        genre = text(&t.genre),
        kind = kind(t.file_format.as_deref(), &t.path),
        size = t.file_size.unwrap_or(0),
        time = t.duration_ms.unwrap_or(0).max(0) / 1000,
        number = t.track_number.unwrap_or(0),
        year = t.year.unwrap_or(0),
        bpm = t.bpm.unwrap_or(0.0),
        added = t.date_added.as_deref().and_then(|d| d.get(..10)).unwrap_or(""),
        bitrate = t.bitrate.unwrap_or(0),
        rate = t.sample_rate.unwrap_or(0),
        comment = text(&t.comment),
        plays = t.play_count.max(0),
        rating = t.rating.clamp(0, 5) * 51,
        location = location(&t.path),
        key = t.camelot.as_deref().and_then(keys::rekordbox_tonality).unwrap_or(""),
        label = text(&t.label),
    );
}

/// A folder (Type 0) with its children, or a playlist (Type 1) that refers to
/// collection entries by TrackID (KeyType 0).
fn write_node(out: &mut String, node: &ExportNode, present: &HashSet<i64>, depth: usize) {
    let pad = "  ".repeat(depth);
    match node {
        ExportNode::Folder { name, children } => {
            let _ = writeln!(out, "{pad}<NODE Type=\"0\" Name=\"{}\" Count=\"{}\">", attr(name), children.len());
            for child in children {
                write_node(out, child, present, depth + 1);
            }
            let _ = writeln!(out, "{pad}</NODE>");
        }
        ExportNode::Playlist { name, track_ids } => {
            let ids: Vec<i64> = track_ids.iter().copied().filter(|id| present.contains(id)).collect();
            let _ = writeln!(out, "{pad}<NODE Name=\"{}\" Type=\"1\" KeyType=\"0\" Entries=\"{}\">", attr(name), ids.len());
            for id in ids {
                let _ = writeln!(out, "{pad}  <TRACK Key=\"{id}\"/>");
            }
            let _ = writeln!(out, "{pad}</NODE>");
        }
    }
}
```

A track without BPM or key gets `AverageBpm="0.00"` and `Tonality=""`. These are the values Rekordbox's own exports write for unanalysed tracks. Task 11, Step 4 checks them against a real export; if Rekordbox writes them differently, update the writer, the golden file and the spec.

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats`
Expected: all PASS, including `the_file_matches_the_golden_sample`. If the golden test fails, print the difference (`assert_eq!` shows both sides). Fix the **writer** when the golden file is right. Fix the **golden file** only when it contradicts this plan's rules.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/rekordbox.rs src-tauri/src/formats/fixtures/rekordbox_sample.xml
git commit -m "feat(export): Rekordbox XML — the exported tracks and their playlists under a RecoDeck folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The commands — `dj_export_defaults` and `export_to_dj`

**Files:**
- Create: `src-tauri/src/commands/dj_export.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

Context:
- `AppState` (`crate::commands::library::AppState`) has `db: Mutex<Option<Database>>`.
- Commands lock it with `state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?` and then `.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?`.
- `Database::get_setting(&str) -> rusqlite::Result<Option<String>>` and `set_setting(&str, &str)`.
- `AppError` (`crate::error::AppError`) has `Database(String)`, `Internal(String)` and `Validation(String)`.
- Both commands are `async`, so the file checks and the write do not hold the main thread. Neither awaits while it holds the DB lock.

- [ ] **Step 1: Write the module with its helper tests**

Create `src-tauri/src/commands/dj_export.rs`:

```rust
// src-tauri/src/commands/dj_export.rs
// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// what the dialog opens with, and the export itself. Phase 1 writes Rekordbox
// XML; Traktor and Serato come in later phases.

use crate::commands::library::AppState;
use crate::error::AppError;
use crate::formats::{self, rekordbox, ExportLibrary};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DjTarget {
    Rekordbox,
    Traktor,
    Serato,
}

impl DjTarget {
    fn label(self) -> &'static str {
        match self {
            Self::Rekordbox => "Rekordbox",
            Self::Traktor => "Traktor",
            Self::Serato => "Serato",
        }
    }

    /// Where its choice is remembered in the settings table.
    fn setting_key(self) -> String {
        format!("dj_export.{}", self.label().to_ascii_lowercase())
    }
}

/// What is remembered per program: the playlists and where the file went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DjExportChoice {
    pub playlist_ids: Vec<i64>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DjExportDefaults {
    pub path: String,
    pub exists: bool,
    pub playlist_ids: Vec<i64>,
    /// Exported to this program before (the dialog then shortens its how-to).
    pub remembered: bool,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct SkippedTrack {
    pub artist: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct DjExportResult {
    pub playlists: usize,
    pub tracks: usize,
    pub skipped: Vec<SkippedTrack>,
    pub written: Vec<String>,
}

/// A remembered choice; anything unreadable counts as none.
fn parse_choice(raw: Option<&str>) -> Option<DjExportChoice> {
    raw.and_then(|r| serde_json::from_str(r).ok())
}

/// Where a program's file goes when nothing is remembered.
fn default_file(music_dir: &Path, target: DjTarget) -> Option<PathBuf> {
    let name = match target {
        DjTarget::Rekordbox => "RecoDeck.xml",
        DjTarget::Traktor => "RecoDeck.nml",
        DjTarget::Serato => return None,
    };
    Some(music_dir.join("RecoDeck").join(name))
}

/// Writes beside the target, then renames over it, so a failed write leaves
/// the previous export whole. Creates the folders on the way.
fn write_atomically(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "export".to_string());
    let temp = target.with_file_name(format!(".{name}.tmp"));
    if let Err(e) = std::fs::write(&temp, bytes).and_then(|_| std::fs::rename(&temp, target)) {
        let _ = std::fs::remove_file(&temp);
        return Err(e);
    }
    Ok(())
}

fn skipped(lib: &ExportLibrary) -> Vec<SkippedTrack> {
    lib.missing()
        .into_iter()
        .map(|t| SkippedTrack {
            artist: t.artist.clone().unwrap_or_default(),
            title: t.title.clone().unwrap_or_default(),
            path: t.path.clone(),
        })
        .collect()
}

/// The user's Music folder (~/Music, %USERPROFILE%\Music).
fn music_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .audio_dir()
        .or_else(|_| app.path().home_dir().map(|home| home.join("Music")))
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn not_yet(target: DjTarget) -> AppError {
    AppError::Validation(format!("{} export is not available yet", target.label()))
}

/// What the dialog opens with for a program: the remembered playlists, and the
/// remembered or default file and whether it exists. Async, so looking at a
/// remembered file on a sleeping drive does not hold the main thread.
#[tauri::command]
pub async fn dj_export_defaults(
    target: DjTarget,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<DjExportDefaults, AppError> {
    let raw = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        db.get_setting(&target.setting_key())
            .map_err(|e| AppError::Database(format!("Failed to read the export settings: {e}")))?
    };
    let choice = parse_choice(raw.as_deref());
    let path = choice
        .as_ref()
        .and_then(|c| c.path.clone())
        .map(PathBuf::from)
        .or_else(|| default_file(&music_dir(&app), target))
        .ok_or_else(|| not_yet(target))?;
    Ok(DjExportDefaults {
        exists: path.exists(),
        path: path.to_string_lossy().to_string(),
        playlist_ids: choice.as_ref().map(|c| c.playlist_ids.clone()).unwrap_or_default(),
        remembered: choice.is_some(),
    })
}

/// Writes the picked playlists for a program and remembers the choice.
#[tauri::command]
pub async fn export_to_dj(
    target: DjTarget,
    playlist_ids: Vec<i64>,
    path: String,
    state: State<'_, AppState>,
) -> Result<DjExportResult, AppError> {
    if target != DjTarget::Rekordbox {
        return Err(not_yet(target));
    }
    if playlist_ids.is_empty() {
        return Err(AppError::Validation("Choose at least one playlist".to_string()));
    }
    if path.trim().is_empty() {
        return Err(AppError::Validation("Choose where to save the file".to_string()));
    }

    // Read under the lock, then let it go before touching the disk.
    let mut lib = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        formats::collect(db, &playlist_ids)
            .map_err(|e| AppError::Database(format!("Failed to read the playlists: {e}")))?
    };
    formats::mark_missing(&mut lib);

    let file = PathBuf::from(&path);
    let content = rekordbox::write(&lib, env!("CARGO_PKG_VERSION"));
    write_atomically(&file, content.as_bytes())
        .map_err(|e| AppError::Internal(format!("Couldn't write {}: {e}", file.display())))?;

    let choice = DjExportChoice { playlist_ids, path: Some(path.clone()) };
    {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        let raw = serde_json::to_string(&choice).map_err(|e| AppError::Internal(e.to_string()))?;
        db.set_setting(&target.setting_key(), &raw)
            .map_err(|e| AppError::Database(format!("Failed to remember the export: {e}")))?;
    }

    Ok(DjExportResult {
        playlists: lib.playlist_count(),
        tracks: lib.present().len(),
        skipped: skipped(&lib),
        written: vec![path],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_target_reads_as_its_lowercase_name() {
        let target: DjTarget = serde_json::from_str("\"rekordbox\"").unwrap();
        assert_eq!(target, DjTarget::Rekordbox);
        assert_eq!(DjTarget::Serato.setting_key(), "dj_export.serato");
    }

    #[test]
    fn a_remembered_choice_round_trips_and_garbage_reads_as_none() {
        let choice = DjExportChoice { playlist_ids: vec![3, 1], path: Some("/x/RecoDeck.xml".into()) };
        let raw = serde_json::to_string(&choice).unwrap();
        assert_eq!(raw, r#"{"playlistIds":[3,1],"path":"/x/RecoDeck.xml"}"#);
        assert_eq!(parse_choice(Some(&raw)), Some(choice));
        assert_eq!(parse_choice(Some("not json")), None);
        assert_eq!(parse_choice(None), None);
        assert_eq!(parse_choice(Some("{}")), Some(DjExportChoice::default()));
    }

    #[test]
    fn files_go_to_a_recodeck_folder_in_music() {
        let music = Path::new("/Users/dj/Music");
        assert_eq!(
            default_file(music, DjTarget::Rekordbox),
            Some(PathBuf::from("/Users/dj/Music/RecoDeck/RecoDeck.xml"))
        );
        assert_eq!(
            default_file(music, DjTarget::Traktor),
            Some(PathBuf::from("/Users/dj/Music/RecoDeck/RecoDeck.nml"))
        );
        assert_eq!(default_file(music, DjTarget::Serato), None);
    }

    #[test]
    fn a_write_replaces_the_file_whole_and_leaves_no_temp_behind() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("nested").join("RecoDeck.xml");
        write_atomically(&target, b"first").unwrap();
        write_atomically(&target, b"second").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        let names: Vec<String> = std::fs::read_dir(target.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["RecoDeck.xml".to_string()]);
    }

    #[test]
    fn a_failed_write_leaves_no_temp_behind() {
        let dir = tempfile::tempdir().unwrap();
        // A non-empty folder where the file should go: the rename fails.
        let target = dir.path().join("RecoDeck.xml");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("inside"), b"x").unwrap();
        assert!(write_atomically(&target, b"data").is_err());
        assert!(!dir.path().join(".RecoDeck.xml.tmp").exists());
    }

    #[test]
    fn the_missing_tracks_are_reported_with_what_is_known() {
        let lib = ExportLibrary {
            tracks: vec![formats::ExportTrack {
                id: 7,
                path: "/gone.mp3".into(),
                exists: false,
                artist: Some("DJ".into()),
                ..Default::default()
            }],
            tree: vec![],
        };
        assert_eq!(
            skipped(&lib),
            vec![SkippedTrack { artist: "DJ".into(), title: String::new(), path: "/gone.mp3".into() }]
        );
    }
}
```

- [ ] **Step 2: Register the module and the commands**

```bash
python3 - <<'EOF'
p='src-tauri/src/commands/mod.rs'
s=open(p).read()
old="pub mod dj;\n"
assert s.count(old)==1
s=s.replace(old, old+"pub mod dj_export;\n")
open(p,'w').write(s)

p='src-tauri/src/lib.rs'
s=open(p).read()
old="            commands::playlists::pick_export_folder,\n"
assert s.count(old)==1
s=s.replace(old, old+"            commands::dj_export::dj_export_defaults,\n            commands::dj_export::export_to_dj,\n")
open(p,'w').write(s)
EOF
```

- [ ] **Step 3: Run the tests and a full check**

Run: `cd src-tauri && cargo test --lib dj_export && cargo test --lib formats && cargo check`
Expected: 6 `dj_export` tests PASS, every `formats` test PASS, and `cargo check` finishes with no new warnings from `formats` or `dj_export`. If `cargo check` warns that `ExportTrack` fields are never read, that is a bug: every field is used by `rekordbox::write`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/dj_export.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(export): dj_export_defaults and export_to_dj — Rekordbox XML written whole, the choice remembered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend types, API calls, and the save-dialog permission

**Files:**
- Create: `src/types/djExport.ts`
- Modify: `src/lib/tauri-api.ts`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Write the types**

Create `src/types/djExport.ts`:

```ts
// Export to DJ software: what dj_export_defaults and export_to_dj answer.

export type DjTarget = 'rekordbox' | 'traktor' | 'serato'

export interface DjExportDefaults {
  path: string
  exists: boolean
  /** The playlists of this program's previous export. */
  playlist_ids: number[]
  /** Exported to this program before. */
  remembered: boolean
}

export interface SkippedTrack {
  artist: string
  title: string
  path: string
}

export interface DjExportResult {
  playlists: number
  tracks: number
  skipped: SkippedTrack[]
  written: string[]
}
```

- [ ] **Step 2: Add the calls to `tauri-api.ts` and the permission**

```bash
python3 - <<'EOF'
p='src/lib/tauri-api.ts'
s=open(p).read()
old="import { open as openDialog } from '@tauri-apps/plugin-dialog'\n"
assert s.count(old)==1
s=s.replace(old, "import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'\n")
old="} from '../types/youtube'\n"
assert s.count(old)==1
s=s.replace(old, old+"import type { DjExportDefaults, DjExportResult, DjTarget } from '../types/djExport'\n")
old="  async pickExportFolder(): Promise<string | null> {\n"
assert s.count(old)==1
s=s.replace(old, """  // Export to DJ software
  async djExportDefaults(target: DjTarget): Promise<DjExportDefaults> {
    return await invoke('dj_export_defaults', { target })
  },

  async pickDjExportFile(target: DjTarget, current: string): Promise<string | null> {
    // The JS-side dialog, as pickExportFolder: the Rust picker can hang on macOS.
    const filters =
      target === 'traktor'
        ? [{ name: 'Traktor NML', extensions: ['nml'] }]
        : [{ name: 'Rekordbox XML', extensions: ['xml'] }]
    const picked = await saveDialog({ defaultPath: current || undefined, filters })
    return typeof picked === 'string' ? picked : null
  },

  async exportToDj(target: DjTarget, playlistIds: number[], path: string): Promise<DjExportResult> {
    return await invoke('export_to_dj', { target, playlistIds, path })
  },

"""+old)
open(p,'w').write(s)

p='src-tauri/capabilities/default.json'
s=open(p).read()
old='    "dialog:allow-open",\n'
assert s.count(old)==1
s=s.replace(old, old+'    "dialog:allow-save",\n')
open(p,'w').write(s)
EOF
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/djExport.ts src/lib/tauri-api.ts src-tauri/capabilities/default.json
git commit -m "feat(export): the DJ export calls and the save dialog's permission

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The dialog's selection logic (pure, tested)

**Files:**
- Create: `src/lib/djExport/selection.ts`
- Test: `src/lib/djExport/selection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/djExport/selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Playlist } from '../../types/track'
import {
  buildTree,
  checkState,
  findNode,
  initialSelection,
  resultToast,
  selectedInOrder,
  toggle,
} from './selection'

const p = (id: number, name: string, parent_id: number | null, folder = false): Playlist => ({
  id,
  name,
  parent_id,
  playlist_type: folder ? 'folder' : 'manual',
  track_count: 0,
})

// As get_all_playlists answers: by name.
const playlists = [
  p(5, 'Empty', null, true),
  p(2, 'Friday', 1),
  p(1, 'Gigs', null, true),
  p(4, 'Inner', 3),
  p(3, 'Nested', 1, true),
  p(6, 'Warm-up', null),
]
const tree = buildTree(playlists)
const node = (id: number) => findNode(tree, id)!

describe('buildTree', () => {
  it('nests by parent in the sidebar order', () => {
    expect(tree.map((n) => n.name)).toEqual(['Empty', 'Gigs', 'Warm-up'])
    expect(node(1).children.map((n) => n.name)).toEqual(['Friday', 'Nested'])
    expect(node(3).children.map((n) => n.name)).toEqual(['Inner'])
  })
})

describe('initialSelection', () => {
  it('keeps the remembered playlists that still exist and adds the one opened from', () => {
    expect([...initialSelection(tree, [6, 99], 2)].sort()).toEqual([2, 6])
  })
  it('a folder opened from brings every playlist inside it', () => {
    expect([...initialSelection(tree, [], 1)].sort()).toEqual([2, 4])
  })
  it('nothing remembered and opened from nowhere is nothing', () => {
    expect(initialSelection(tree, [], null).size).toBe(0)
  })
})

describe('checkState and toggle', () => {
  it('a folder is mixed when some of it is checked', () => {
    expect(checkState(node(1), new Set([2]))).toBe('mixed')
    expect(checkState(node(1), new Set([2, 4]))).toBe('checked')
    expect(checkState(node(1), new Set())).toBe('unchecked')
    expect(checkState(node(5), new Set([2]))).toBe('unchecked')
  })
  it('a folder checks all of itself, or clears it when all was checked', () => {
    const all = toggle(node(1), new Set([2]))
    expect([...all].sort()).toEqual([2, 4])
    expect(toggle(node(1), all).size).toBe(0)
  })
  it('a playlist flips', () => {
    expect([...toggle(node(6), new Set([2]))].sort()).toEqual([2, 6])
    expect([...toggle(node(6), new Set([6]))]).toEqual([])
  })
})

describe('selectedInOrder', () => {
  it('answers the checked playlists in the tree order', () => {
    expect(selectedInOrder(tree, new Set([6, 4, 2]))).toEqual([2, 4, 6])
  })
})

describe('resultToast', () => {
  it('says what went where', () => {
    expect(resultToast({ playlists: 1, tracks: 1, skipped: [], written: ['/x.xml'] }, 'Rekordbox')).toEqual({
      message: '1 playlist, 1 track exported to Rekordbox',
      kind: 'success',
    })
  })
  it('warns about the files that are gone and lists them', () => {
    const t = resultToast(
      {
        playlists: 3,
        tracks: 1214,
        skipped: [
          { artist: 'DJ', title: 'Gone', path: '/a.mp3' },
          { artist: '', title: '', path: '/b.mp3' },
        ],
        written: ['/x.xml'],
      },
      'Rekordbox',
    )
    expect(t.message).toBe('3 playlists, 1,214 tracks exported to Rekordbox · 2 tracks skipped — file missing')
    expect(t.kind).toBe('warning')
    expect(t.detail).toBe('DJ – Gone (/a.mp3)\nUnknown artist – Untitled (/b.mp3)')
  })
})
```

Run: `npx vitest run src/lib/djExport/selection.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 2: Write the module**

Create `src/lib/djExport/selection.ts`:

```ts
// The Export to DJ software dialog's playlist tree: which boxes start checked,
// what a folder's box shows and does, what is sent, and what the toast says.

import type { Playlist } from '../../types/track'
import type { DjExportResult } from '../../types/djExport'

export interface ExportTreeNode {
  id: number
  name: string
  isFolder: boolean
  children: ExportTreeNode[]
}

export type CheckState = 'checked' | 'unchecked' | 'mixed'

/** The playlist tree as the sidebar shows it: top level, then by parent, in get_all_playlists' order. */
export function buildTree(playlists: Playlist[]): ExportTreeNode[] {
  const byParent = new Map<number | null, Playlist[]>()
  for (const playlist of playlists) {
    const siblings = byParent.get(playlist.parent_id) ?? []
    siblings.push(playlist)
    byParent.set(playlist.parent_id, siblings)
  }
  const level = (parent: number | null, path: Set<number>): ExportTreeNode[] =>
    (byParent.get(parent) ?? [])
      .filter((playlist) => !path.has(playlist.id))
      .map((playlist) => {
        const isFolder = playlist.playlist_type === 'folder'
        return {
          id: playlist.id,
          name: playlist.name,
          isFolder,
          children: isFolder ? level(playlist.id, new Set(path).add(playlist.id)) : [],
        }
      })
  return level(null, new Set())
}

export function findNode(nodes: ExportTreeNode[], id: number): ExportTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const inside = findNode(node.children, id)
    if (inside) return inside
  }
  return null
}

/** A playlist itself, or every playlist inside a folder, at any depth. */
export function playlistIdsUnder(node: ExportTreeNode): number[] {
  return node.isFolder ? node.children.flatMap(playlistIdsUnder) : [node.id]
}

/**
 * What the dialog starts with: the remembered playlists that still exist, plus
 * the playlist (or every playlist in the folder) whose menu opened it.
 */
export function initialSelection(
  tree: ExportTreeNode[],
  remembered: number[],
  openedFrom: number | null,
): Set<number> {
  const existing = new Set(tree.flatMap(playlistIdsUnder))
  const selected = new Set(remembered.filter((id) => existing.has(id)))
  const from = openedFrom === null ? null : findNode(tree, openedFrom)
  if (from) for (const id of playlistIdsUnder(from)) selected.add(id)
  return selected
}

export function checkState(node: ExportTreeNode, selected: Set<number>): CheckState {
  const ids = playlistIdsUnder(node)
  const checked = ids.filter((id) => selected.has(id)).length
  if (checked === 0) return 'unchecked'
  return checked === ids.length ? 'checked' : 'mixed'
}

/** A click on a box: a playlist flips; a folder checks all of itself, or clears it when all was checked. */
export function toggle(node: ExportTreeNode, selected: Set<number>): Set<number> {
  const next = new Set(selected)
  const ids = playlistIdsUnder(node)
  if (checkState(node, selected) === 'checked') ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}

/** The checked playlists in the tree's order: what is sent and remembered. */
export function selectedInOrder(tree: ExportTreeNode[], selected: Set<number>): number[] {
  return tree.flatMap(playlistIdsUnder).filter((id) => selected.has(id))
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** The toast after an export: a warning, with the list as its detail, when files were gone. */
export function resultToast(
  result: DjExportResult,
  program: string,
): { message: string; kind: 'success' | 'warning'; detail?: string } {
  const message = `${count(result.playlists, 'playlist', 'playlists')}, ${count(result.tracks, 'track', 'tracks')} exported to ${program}`
  if (result.skipped.length === 0) return { message, kind: 'success' }
  return {
    message: `${message} · ${count(result.skipped.length, 'track', 'tracks')} skipped — file missing`,
    kind: 'warning',
    detail: result.skipped
      .map((s) => `${s.artist || 'Unknown artist'} – ${s.title || 'Untitled'} (${s.path})`)
      .join('\n'),
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/lib/djExport/selection.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/djExport/selection.ts src/lib/djExport/selection.test.ts
git commit -m "feat(export): the DJ export dialog's tree — starting checks, folder boxes, order, and the result text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The dialog

**Files:**
- Create: `src/components/DjExportModal.tsx`, `src/components/DjExportModal.css`
- Test: `src/components/DjExportModal.test.tsx`

Context:
- The existing `ExportPlaylistModal.tsx` is the pattern to follow:
  - `.modal-overlay` / `.modal-content` / `.modal-actions`;
  - `useOverlay(true, …)` from `../lib/overlays` (Esc closes; not while running);
  - `Button` from `./Button` with `variant="primary"`, `working` and `workingLabel`.
- `toast(message, { kind, action: { label, run }, detail })` comes from `../lib/toast`.
- A rejected `invoke` gives an `AppError` object (`{ kind, message }`), not an `Error`. `getErrorMessage` from `../types/ai` turns it, or a plain string, into the text to show.
- `revealItemInDir(path)` comes from `@tauri-apps/plugin-opener`.
- `Icon` comes from `./Icon` and takes Lucide names.

- [ ] **Step 1: Write the failing component test**

Create `src/components/DjExportModal.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAllPlaylists: vi.fn(),
    djExportDefaults: vi.fn(),
    exportToDj: vi.fn(),
    pickDjExportFile: vi.fn(),
  },
}))
vi.mock('../lib/toast', () => ({ toast: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))

import { tauriApi } from '../lib/tauri-api'
import { toast } from '../lib/toast'
import { DjExportModal } from './DjExportModal'

// React's act() in a plain DOM, without a testing library.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PATH = '/Users/dj/Music/RecoDeck/RecoDeck.xml'
const playlists = [
  { id: 2, name: 'Friday', parent_id: 1, playlist_type: 'manual', track_count: 2 },
  { id: 1, name: 'Gigs', parent_id: null, playlist_type: 'folder', track_count: 0 },
  { id: 3, name: 'Saturday', parent_id: 1, playlist_type: 'manual', track_count: 5 },
  { id: 4, name: 'Warm-up', parent_id: null, playlist_type: 'manual', track_count: 1 },
]

let host: HTMLDivElement
let root: Root
let onClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue(playlists)
  vi.mocked(tauriApi.djExportDefaults).mockResolvedValue({
    path: PATH,
    exists: true,
    playlist_ids: [4],
    remembered: true,
  })
  vi.mocked(tauriApi.exportToDj).mockResolvedValue({ playlists: 2, tracks: 3, skipped: [], written: [PATH] })
  onClose = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function open(openedFrom: number | null) {
  await act(async () => {
    root.render(<DjExportModal openedFrom={openedFrom} onClose={onClose} />)
  })
}

const box = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const exportButton = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Export'))!

describe('DjExportModal', () => {
  it('opens with the remembered playlists and the one it was opened from', async () => {
    await open(2)
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(true)
    expect(box('Saturday').checked).toBe(false)
    expect(box('Gigs').indeterminate).toBe(true)
    expect(exportButton().textContent).toBe('Export 2 playlists')
    expect(host.textContent).toContain(PATH)
  })

  it('a folder box checks everything inside it', async () => {
    await open(null)
    await act(async () => {
      box('Gigs').click()
    })
    expect(box('Friday').checked).toBe(true)
    expect(box('Saturday').checked).toBe(true)
    expect(box('Gigs').checked).toBe(true)
  })

  it('exports the checked playlists in the tree order and says where they went', async () => {
    await open(2)
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('rekordbox', [2, 4], PATH)
    expect(toast).toHaveBeenCalledWith(
      '2 playlists, 3 tracks exported to Rekordbox',
      expect.objectContaining({ kind: 'success', action: expect.objectContaining({ label: 'Show in Finder' }) }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('cannot export with nothing checked, and shows the whole how-to the first time', async () => {
    vi.mocked(tauriApi.djExportDefaults).mockResolvedValue({
      path: PATH,
      exists: false,
      playlist_ids: [],
      remembered: false,
    })
    await open(null)
    expect(exportButton().disabled).toBe(true)
    expect(host.textContent).toContain('turn on “rekordbox xml”')
  })

  it('stays open and says why when the export fails', async () => {
    // AppError reaches JS as { kind, message } (#[serde(tag = "kind", content = "message")]).
    vi.mocked(tauriApi.exportToDj).mockRejectedValue({ kind: 'Internal', message: 'Couldn’t write /x: Permission denied' })
    await open(2)
    await act(async () => {
      exportButton().click()
    })
    expect(toast).toHaveBeenCalledWith('Couldn’t write /x: Permission denied', { kind: 'error' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/components/DjExportModal.test.tsx`
Expected: FAIL, because `./DjExportModal` does not exist.

- [ ] **Step 2: Write the component**

Create `src/components/DjExportModal.tsx`:

```tsx
// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// the playlist tree with boxes, where the file goes, how to load it, and the
// export. Phase 1 writes Rekordbox XML; the program tabs come with Traktor.

import { useEffect, useRef, useState } from 'react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { toast } from '../lib/toast'
import { getErrorMessage } from '../types/ai'
import {
  buildTree,
  checkState,
  initialSelection,
  playlistIdsUnder,
  resultToast,
  selectedInOrder,
  toggle,
  type CheckState,
  type ExportTreeNode,
} from '../lib/djExport/selection'
import { Button } from './Button'
import { Icon } from './Icon'
import './DjExportModal.css'

const PROGRAM = 'Rekordbox'
const REVEAL_LABEL = navigator.userAgent.includes('Windows') ? 'Show in Explorer' : 'Show in Finder'

interface DjExportModalProps {
  /** The playlist or folder whose menu opened it; null from elsewhere. */
  openedFrom: number | null
  onClose: () => void
}

export function DjExportModal({ openedFrom, onClose }: DjExportModalProps) {
  const [tree, setTree] = useState<ExportTreeNode[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [path, setPath] = useState('')
  const [firstTime, setFirstTime] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  // Esc closes it, as the backdrop and Cancel do — not while it writes.
  useOverlay(true, () => {
    if (!running) onClose()
  })

  useEffect(() => {
    let live = true
    Promise.all([tauriApi.getAllPlaylists(), tauriApi.djExportDefaults('rekordbox')])
      .then(([playlists, defaults]) => {
        if (!live) return
        const built = buildTree(playlists)
        setTree(built)
        setSelected(initialSelection(built, defaults.playlist_ids, openedFrom))
        setPath(defaults.path)
        setFirstTime(!defaults.remembered)
      })
      .catch((err) => {
        if (live) setLoadError(getErrorMessage(err))
      })
    return () => {
      live = false
    }
  }, [openedFrom])

  async function changePath() {
    try {
      const picked = await tauriApi.pickDjExportFile('rekordbox', path)
      if (picked) setPath(picked)
    } catch (err) {
      toast(getErrorMessage(err), { kind: 'error' })
    }
  }

  async function handleExport() {
    if (!tree) return
    setRunning(true)
    try {
      const result = await tauriApi.exportToDj('rekordbox', selectedInOrder(tree, selected), path)
      const { message, kind, detail } = resultToast(result, PROGRAM)
      const written = result.written[0]
      toast(message, {
        kind,
        detail,
        action: written ? { label: REVEAL_LABEL, run: () => void revealItemInDir(written) } : undefined,
      })
      onClose()
    } catch (err) {
      setRunning(false)
      toast(getErrorMessage(err), { kind: 'error' })
    }
  }

  const count = tree ? selectedInOrder(tree, selected).length : 0

  return (
    <div className="modal-overlay" onClick={() => !running && onClose()}>
      <div
        className="modal-content dj-export"
        role="dialog"
        aria-labelledby="dj-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dj-export-title">Export to {PROGRAM}</h3>

        <div className="dj-export__label">Playlists</div>
        <div className="dj-export__tree">
          {loadError ? (
            <p className="dj-export__note dj-export__note--error">{loadError}</p>
          ) : tree === null ? (
            <p className="dj-export__note">Loading…</p>
          ) : tree.length === 0 ? (
            <p className="dj-export__note">No playlists yet.</p>
          ) : (
            <TreeRows
              nodes={tree}
              depth={0}
              selected={selected}
              disabled={running}
              onToggle={(node) => setSelected((current) => toggle(node, current))}
            />
          )}
        </div>

        <div className="dj-export__label">Where</div>
        <div className="dj-export__where">
          <span className="dj-export__path" title={path}>
            {path}
          </span>
          <button type="button" className="btn" onClick={() => void changePath()} disabled={running}>
            Change…
          </button>
        </div>

        <HowTo firstTime={firstTime} />

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            working={running}
            workingLabel="Exporting…"
            disabled={count === 0 || !path}
          >
            {count > 0 ? `Export ${count} ${count === 1 ? 'playlist' : 'playlists'}` : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface TreeRowsProps {
  nodes: ExportTreeNode[]
  depth: number
  selected: Set<number>
  disabled: boolean
  onToggle: (node: ExportTreeNode) => void
}

function TreeRows({ nodes, depth, selected, disabled, onToggle }: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const empty = node.isFolder && playlistIdsUnder(node).length === 0
        return (
          <div key={node.id}>
            <label className="dj-export__row" style={{ paddingLeft: 10 + depth * 18 }}>
              <Check
                state={checkState(node, selected)}
                disabled={disabled || empty}
                label={node.name}
                onChange={() => onToggle(node)}
              />
              <Icon name={node.isFolder ? 'Folder' : 'ListMusic'} size={14} />
              <span className="dj-export__name">{node.name}</span>
            </label>
            {node.isFolder && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                disabled={disabled}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

/** A native box; "mixed" is its indeterminate state, which only a ref can set. */
function Check({
  state,
  disabled,
  label,
  onChange,
}: {
  state: CheckState
  disabled: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  )
}

/** How to load the file in Rekordbox: every step until the first export, then the one that repeats. */
function HowTo({ firstTime }: { firstTime: boolean }) {
  if (!firstTime) {
    return <p className="dj-export__howto">In Rekordbox, refresh “rekordbox xml” in the tree to see the changes.</p>
  }
  return (
    <ol className="dj-export__howto dj-export__howto--steps">
      <li>In Rekordbox, Preferences → View → Layout: turn on “rekordbox xml”.</li>
      <li>Preferences → Advanced → Database → rekordbox xml → Imported Library: choose this file.</li>
      <li>Refresh “rekordbox xml” in the tree and drag the playlists where you want them.</li>
    </ol>
  )
}
```

- [ ] **Step 3: Write the CSS**

Create `src/components/DjExportModal.css`:

```css
/* Export to DJ software: the playlist tree with boxes, where the file goes,
   and how to load it in the program. Sits in the shared .modal-content. */

.dj-export {
  width: min(520px, 92vw);
}

.dj-export__label {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dj-export__tree {
  max-height: 280px;
  margin-bottom: 16px;
  padding: 4px 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.dj-export__row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding-right: 10px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.dj-export__row:hover {
  background: var(--bg-tertiary);
}

.dj-export__row input[type='checkbox'] {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.dj-export__row input[type='checkbox']:disabled {
  cursor: default;
  opacity: 0.5;
}

.dj-export__row svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.dj-export__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dj-export__note {
  margin: 8px 12px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.dj-export__note--error {
  color: var(--color-danger);
}

.dj-export__where {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.dj-export__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dj-export__howto {
  margin: 0 0 16px;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.5;
}

.dj-export__howto--steps {
  padding-left: 18px;
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/DjExportModal.test.tsx && npx tsc --noEmit`
Expected: 5 tests PASS and no type errors. If `IconName` rejects `'ListMusic'` or `'Folder'`, use a name from `lucide-react`'s `icons` that exists, such as `'Music'` or `'FolderOpen'`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DjExportModal.tsx src/components/DjExportModal.css src/components/DjExportModal.test.tsx
git commit -m "feat(export): the Export to DJ software dialog — playlist tree with boxes, where, how to load it in Rekordbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Menu items, `Sidebar`, and `App`

**Files:**
- Modify: `src/components/FolderTree.tsx`, `src/components/layout/Sidebar.tsx`, `src/App.tsx`

The prop path is the same as `onExportPlaylist`: `App.tsx` → `Sidebar.tsx` (interface, destructuring, the object it builds for `FolderTree`) → `FolderTree.tsx` (interface, destructuring, `menuEntries`).

- [ ] **Step 1: Add the prop and the menu items in `FolderTree.tsx`, and pass it through `Sidebar.tsx`**

```bash
python3 - <<'EOF'
import re
def edit(path, fn):
    s = open(path).read()
    s2 = fn(s)
    assert s2 != s, path
    open(path, 'w').write(s2)

IFACE = re.compile(r'(?m)^(\s*)onExportPlaylist\?: \(playlistId: number, playlistName: string\) => void\n')
PASS = re.compile(r'(?m)^(\s*)onExportPlaylist,\n')

def folder_tree(s):
    s, n = IFACE.subn(lambda m: m.group(0) + f"{m.group(1)}/** Export to DJ software, from a playlist's or a playlist folder's menu. */\n{m.group(1)}onExportToDj?: (playlistId: number) => void\n", s)
    assert n == 1
    s, n = PASS.subn(lambda m: m.group(0) + f"{m.group(1)}onExportToDj,\n", s)
    assert n == 1
    old = "    switch (menu.type) {\n"
    assert s.count(old) == 1
    s = s.replace(old, """    const exportToDj: MenuEntry[] = onExportToDj
      ? [{ kind: 'action', label: 'Export to DJ software…', icon: 'Disc3', onSelect: () => onExportToDj(playlistId) }]
      : []
""" + old)
    old = """                  onSelect: () => onExportPlaylist(playlistId, playlistName),
                } satisfies MenuEntry,
              ]
            : []),
"""
    assert s.count(old) == 1
    s = s.replace(old, old + "          ...exportToDj,\n")
    old = """          { kind: 'action', label: 'Create Folder', icon: 'FolderPlus', onSelect: () => onCreateFolder(playlistId) },
"""
    assert s.count(old) == 1
    s = s.replace(old, old + "          ...exportToDj,\n")
    return s

def sidebar(s):
    s, n = IFACE.subn(lambda m: m.group(0) + f"{m.group(1)}onExportToDj?: (playlistId: number) => void\n", s)
    assert n == 1
    s, n = PASS.subn(lambda m: m.group(0) + f"{m.group(1)}onExportToDj,\n", s)
    assert n == 2, n
    return s

edit('src/components/FolderTree.tsx', folder_tree)
edit('src/components/layout/Sidebar.tsx', sidebar)
EOF
git diff --stat -- src/components
```

Expected: only `FolderTree.tsx` and `Sidebar.tsx` change, a few lines each.

- [ ] **Step 2: Open the dialog from `App.tsx`**

```bash
python3 - <<'EOF'
p='src/App.tsx'
s=open(p).read()
def once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)

once("import { ExportPlaylistModal } from './components/ExportPlaylistModal'\n",
     "import { ExportPlaylistModal } from './components/ExportPlaylistModal'\nimport { DjExportModal } from './components/DjExportModal'\n")
once("""  // Export playlist modal
  const [exportModal, setExportModal] = useState<{
    playlistId: number
    playlistName: string
  } | null>(null)
""", """  // Export playlist modal
  const [exportModal, setExportModal] = useState<{
    playlistId: number
    playlistName: string
  } | null>(null)

  // Export to DJ software (the playlist or folder whose menu opened it)
  const [djExport, setDjExport] = useState<{ openedFrom: number | null } | null>(null)
""")
once("""      onExportPlaylist={(id, name) =>
        setExportModal({ playlistId: id, playlistName: name })
      }
""", """      onExportPlaylist={(id, name) =>
        setExportModal({ playlistId: id, playlistName: name })
      }
      onExportToDj={(id) => setDjExport({ openedFrom: id })}
""")
once("""      {/* Update available toast""", """      {/* Export to DJ software (Rekordbox XML) */}
      {djExport && (
        <DjExportModal openedFrom={djExport.openedFrom} onClose={() => setDjExport(null)} />
      )}

      {/* Update available toast""")
open(p,'w').write(s)
EOF
git diff --stat src/App.tsx
```

Expected: `src/App.tsx | 9 +++++++++` or close to it.

- [ ] **Step 3: Type-check, lint, and run the whole frontend suite**

Run: `npx tsc --noEmit && npx eslint src mobile && npx vitest run`
Expected:
- `tsc`: no errors.
- `eslint`: 28 problems, as before.
- `vitest`: everything passes. The known `aiStore.test.ts` failure under Node 25 is the only acceptable one.

- [ ] **Step 4: Commit**

```bash
git add src/components/FolderTree.tsx src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat(export): Export to DJ software… in a playlist's and a playlist folder's menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Look at it, review it, check it against Rekordbox

**Files:** possibly `src-tauri/src/formats/rekordbox.rs`, `src-tauri/src/formats/keys.rs`, `src-tauri/src/formats/fixtures/*`, and the spec's verification list.

- [ ] **Step 1: Run all the checks**

Use the `test-runner` agent: `npx tsc --noEmit`, `npx vitest run`, `npx eslint src mobile` (baseline 28), `npm run build`, `cd src-tauri && cargo test --lib && cargo check`. Fix anything this branch broke.

- [ ] **Step 2: Look at the dialog in Midnight and Dawn**

Follow the method in `.claude/HANDOFF.md` ("Working method"):
- a standalone Vite harness in the session scratchpad that renders `DjExportModal`;
- `@tauri-apps/api/mocks`' `mockIPC` answering `get_all_playlists`, `dj_export_defaults` and `export_to_dj`;
- screenshots with Playwright WebKit, `data-theme` set to `midnight` and to `dawn`.

Check that:
- the tree indents per level;
- the mixed folder box shows;
- a long path ellipsizes;
- the how-to reads well;
- the Export button counts.

Fix the CSS if needed.

- [ ] **Step 3: Independent review**

Dispatch the `reviewer` agent on `git diff main...HEAD`. Fold in the fixes it finds, then commit them.

- [ ] **Step 4: Check against a real Rekordbox export (needs the user)**

Ask the user (in Serbian) for a small export from their own Rekordbox:
- a playlist of 2–3 tracks, ideally one with č/ć/š or `&` in the file name;
- exported through *File → Export Collection in xml format*;
- and where they saved it.

The user's file holds their real paths and track names, so **do not commit it as is**. Keep it in the session scratchpad. Commit only a sanitized copy, `src-tauri/src/formats/fixtures/rekordbox_real.xml`:
- the `PRODUCT`, `COLLECTION` and `PLAYLISTS` structure;
- one `TRACK` line with every attribute kept in its order and every value replaced by `x`;
- except `Tonality`, which keeps its value as a spelling sample.

Then compare the user's file with our output:
- **Attribute set and order** of `TRACK`: make `write_track` match. If Rekordbox leaves out empty attributes, or orders them differently, follow it and update `rekordbox_sample.xml`.
- **`Tonality` spelling** (`Abm`/`G#m`, `Db`/`C#`): make `keys.rs` match.
- **`Location` encoding**: which characters Rekordbox leaves unencoded (for example `(`, `)`, `,`), and the Unicode normalization of a name with č. If Rekordbox leaves characters unencoded, encode them the same way.
- **`PRODUCT`, `COLLECTION` and `PLAYLISTS` shape**, and the `ROOT` node's `Count`.

Add a test that parses `rekordbox_real.xml`'s first `<TRACK ` line, takes its attribute names in order, and asserts `write_track`'s attribute names are the same list. Use a small regex like `(\w+)="`; `regex` is not a dependency, so split on `="` and take the last word before each. Commit.

- [ ] **Step 5: The user imports it**

Start the app as described in `.claude/HANDOFF.md` ("Running the app", port 1430). Ask the user to:
1. export two playlists, one inside a folder, to Rekordbox;
2. load the file in Rekordbox as the how-to says;
3. check playlists, track names, BPM, key, rating and comments.

Then ask them to change a playlist in RecoDeck, export again, refresh in Rekordbox, and check the change arrives. This settles the spec's verification point: does data reach tracks Rekordbox already had? If it does not, add a line about it to `HowTo` and to the spec's "What it does not do".

- [ ] **Step 6: Changelog**

```bash
python3 - <<'EOF'
p='CHANGELOG.md'
s=open(p).read()
old='## [Unreleased]\n'
assert s.count(old)==1
s=s.replace(old, old+"""
### Added
- **Export to DJ software** — right-click a playlist or a playlist folder, choose Export to DJ software…, check the playlists, and RecoDeck writes them for Rekordbox with their tracks' BPM, key, rating, genre and comments; it remembers the playlists and the file, so exporting again is one click
""",1)
open(p,'w').write(s)
EOF
git add CHANGELOG.md && git commit -m "docs(changelog): Export to DJ software (Rekordbox)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phase 1 is done when:
- the user has imported an export in Rekordbox and is satisfied;
- every check passes at the baseline;
- the reviewer's findings are folded in.

Release only when the user says so, with the steps in `.claude/HANDOFF.md` ("Next release").
