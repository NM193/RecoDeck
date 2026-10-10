# Export to DJ Software — Phase 2 (Traktor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Export to DJ software dialog gets a **Rekordbox · Traktor** tab bar. Traktor writes a Traktor NML file with the checked playlists and their tracks' BPM, key, rating, genre and comments. Each program remembers its own playlists and file, and the dialog opens on the program used last.

**Architecture:**
- Two new pure parts in `src-tauri/src/formats/`:
  - `traktor.rs`: the path encoder `location()` and the writer `write()`;
  - `volumes.rs`: the boot volume's name. It is the only part that asks the system.
- `ExportNode::Playlist` gains the playlist's `id`, from which Traktor's playlist UUID is made.
- The command `export_to_dj` accepts Traktor and saves `dj_export.last_target`.
- The dialog keeps one state per program tab. It reads the last program through `get_setting`.

**Tech Stack:** Rust (tauri 2, serde_json, `unicode-normalization` — new; tempfile for tests), React 19 + TypeScript, vitest (jsdom), the shared `.tabs` + `useTabThumb`.

**Spec:** `docs/superpowers/specs/2026-10-09-dj-export-design.md`, phase 2. Phase 1 (Rekordbox) is built on this branch (`docs/superpowers/plans/2026-10-09-dj-export-phase-1-rekordbox.md`). Serato is phase 3.

---

## What the real Traktor files settled (2026-10-10)

These facts come from the user's own Traktor 3.11.1 files: `~/Documents/Native Instruments/Traktor 3.11.1/collection.nml`, which has 1,973 entries, and the `History/*.nml` files. The code below is built on them; do not re-derive them.

- **Header:** `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`, then `<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>`.
- **Layout:**
  - every element is written as `<X …>children</X>`, with no self-closing tags;
  - a line break follows every closing tag and nothing else, so an opening tag runs straight into its first child.
- **Between the collection and the playlists:** `<SETS ENTRIES="0"></SETS>`.
- **The tail:** `<INDEXING></INDEXING>` and `</NML>`.
- **Key integers:** `MUSICAL_KEY VALUE` 0–11 = C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯, B major; 12–23 = the same roots minor. Traktor's Open Key text agrees with the value in every sample checked, e.g. `1m`/21 (A minor), `11d`/10 (B♭ major), `6m`/20, `10m`/12, `5m`/13, `12m`/14.
- `INFO KEY` is the key text from the file's tag. It often disagrees with `MUSICAL_KEY`, so it is **not** written.
- **INFO units:**
  - `BITRATE` is in bit/s (`320000`);
  - `FILESIZE` is in KiB, rounded (bytes / 1024; the golden `9766` depends on the rounding);
  - `PLAYTIME` is whole seconds, rounded, and `PLAYTIME_FLOAT` is seconds with 6 decimals;
  - `RANKING` is stars × 51 (`204` = 4 stars).
- **INFO dates:** `IMPORT_DATE` is `yyyy/m/d` without zero padding. `RELEASE_DATE` is `yyyy/1/1` when only the year is known.
- **INFO attribute order:** `BITRATE GENRE LABEL COMMENT COVERARTID KEY PLAYCOUNT PLAYTIME PLAYTIME_FLOAT RANKING IMPORT_DATE LAST_PLAYED RELEASE_DATE FLAGS FILESIZE`. Absent values are **left out**, not written empty: `PLAYCOUNT` with no plays, `RANKING` when unrated, `ARTIST`, `ALBUM`.
- **ENTRY:**
  - attributes `… TITLE ARTIST`;
  - children in the order `LOCATION ALBUM MODIFICATION_INFO INFO TEMPO LOUDNESS MUSICAL_KEY CUE_V2`;
  - `ALBUM` has `TRACK` then `TITLE`;
  - `TEMPO` has `BPM` (6 decimals) and `BPM_QUALITY="100.000000"`.
- **LOCATION:**
  - its attributes are `DIR FILE VOLUME VOLUMEID`;
  - files under `/Users` and under `/Library` both have `VOLUME="Macintosh HD"`, and `VOLUMEID` repeats the name (`"Macintosh HD"`);
  - `DIR` is `/:Users/:dj/:Music/:`.
- **Unicode:** Traktor writes paths **NFC** even when the name on disk is decomposed (NFD). 38 of the 53 non-ASCII names differed from the disk only by normalization. A key in any other form would be a new track to Traktor.
- **Playlists:**
  - `<NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="n">…</SUBNODES></NODE>`; folders use the same shape;
  - a playlist is `<NODE TYPE="PLAYLIST" NAME="…"><PLAYLIST ENTRIES="n" TYPE="LIST" UUID="32 hex digits">`;
  - each track in it is `<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="…"></PRIMARYKEY></ENTRY>`;
  - `KEY` is `VOLUME` + `DIR` + `FILE` (`Macintosh HD/:Users/:dj/:…/:file.mp3`).
- **Escaping:** `&` → `&amp;` and `"` → `&quot;`, but `'` is written **raw**.
- **Not written (decisions):**
  - `MODIFIED_DATE`/`MODIFIED_TIME`, so that Traktor does not take our entry as newer than its own data;
  - `FLAGS` (meaning unknown), `LOCK`, `AUDIO_ID`, `COVERARTID`, `LOUDNESS`, `CUE_V2`.
- **Boot volume:** on this Mac `/Volumes/Macintosh HD` is a symlink to `/`, which is how the boot volume's name is found.

Still open, checked by hand in Task 9:
- whether data reaches tracks Traktor **already has**;
- what a second import of the same playlists does;
- whether Import Playlist brings the folder tree.

## Conventions for every task

- **Branch:** `feat/dj-export`, already checked out. Never commit `.claude/settings.local.json` or `.planning/STATE.md`: they are the user's. Stage files by name and check `git diff --cached --name-only` before each commit.
- **A running `tauri dev`:** one may be running on port 1430. Stop it before cargo work, or the cargo lock is contended. Ask the user, or find the process with `lsof -iTCP:1430 -sTCP:LISTEN`.
- **Editing files:** a PostToolUse hook runs Prettier on `.ts/.tsx/.css/.json` files touched by Edit/Write. `.md` and `.rs` files are not formatted.
  - `src/components/DjExportModal.tsx`, `src/components/DjExportModal.test.tsx` and `src/lib/tauri-api.ts` are **not** Prettier-clean, and the hook would reformat them whole.
  - Change those three with a Bash heredoc (`cat > file <<'TSXEOF'`) or a small `python3` replace script (heredoc delimiter `PYEOF`), never with Edit/Write.
  - Rust files, `Cargo.toml`, the `.md` docs and `DjExportModal.css` may use Edit/Write.
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
| `src-tauri/src/formats/mod.rs` | modify | `ExportNode::Playlist { id, … }`; declare `traktor`, `volumes` |
| `src-tauri/src/formats/rekordbox.rs` | modify | follow the new `Playlist` shape (output unchanged) |
| `src-tauri/src/formats/keys.rs` | modify | `traktor_key()` |
| `src-tauri/src/formats/volumes.rs` | create | `boot_volume_name()` |
| `src-tauri/src/formats/traktor.rs` | create | `TraktorLocation`, `location()`, `write()` |
| `src-tauri/src/formats/fixtures/traktor_real.nml` | create | sanitized real Traktor 3.11.1 file (shape checks) |
| `src-tauri/src/formats/fixtures/traktor_sample.nml` | create | golden output |
| `src-tauri/Cargo.toml` (+ `Cargo.lock`) | modify | `unicode-normalization = "0.1"` |
| `src-tauri/src/commands/dj_export.rs` | modify | Traktor accepted; `save_choice` also saves `dj_export.last_target` |
| `src/lib/tauri-api.ts` | modify | `djExportLastTarget()` |
| `src/components/DjExportModal.tsx` (+ `.css`, `.test.tsx`) | modify | program tabs, a state per tab, Traktor how-to |
| `CHANGELOG.md`, the spec | modify | entry text; what was settled |

---

### Task 1: A playlist in the export model carries its id

Traktor names each playlist with a UUID. Making it from the RecoDeck id keeps it the same on every export.

**Files:**
- Modify: `src-tauri/src/formats/mod.rs`
- Modify: `src-tauri/src/formats/rekordbox.rs`

- [ ] **Step 1: Change the tests first (they will not compile)**

In `src-tauri/src/formats/mod.rs`, test `collect_keeps_the_folders_on_the_way_and_each_track_once`, replace:

```rust
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![f.a, f.b] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![f.b] },
```

with:

```rust
                    children: vec![ExportNode::Playlist { id: f.friday, name: "Friday".into(), track_ids: vec![f.a, f.b] }],
                },
                ExportNode::Playlist { id: f.warmup, name: "Warm-up".into(), track_ids: vec![f.b] },
```

and in `collect_keeps_the_playlist_order_not_the_id_order` replace:

```rust
        assert_eq!(lib.tree, vec![ExportNode::Playlist { name: "Set".into(), track_ids: vec![second, first] }]);
```

with:

```rust
        assert_eq!(lib.tree, vec![ExportNode::Playlist { id: list, name: "Set".into(), track_ids: vec![second, first] }]);
```

In `src-tauri/src/formats/rekordbox.rs`, `sample()`, replace:

```rust
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![1, 2, 3] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![2] },
```

with:

```rust
                    children: vec![ExportNode::Playlist { id: 10, name: "Friday".into(), track_ids: vec![1, 2, 3] }],
                },
                ExportNode::Playlist { id: 11, name: "Warm-up".into(), track_ids: vec![2] },
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd src-tauri && cargo test --lib formats`
Expected: compile error `struct variant ExportNode::Playlist has no field named id`.

- [ ] **Step 3: Add the field**

In `src-tauri/src/formats/mod.rs` replace:

```rust
    Playlist { name: String, track_ids: Vec<i64> },
```

with:

```rust
    /// `id` is RecoDeck's playlist id: Traktor's playlist UUID is made from it.
    Playlist { id: i64, name: String, track_ids: Vec<i64> },
```

and in `Collector::level` replace:

```rust
                nodes.push(ExportNode::Playlist { name: p.name.clone(), track_ids });
```

with:

```rust
                nodes.push(ExportNode::Playlist { id, name: p.name.clone(), track_ids });
```

In `src-tauri/src/formats/rekordbox.rs`, `write_node`, replace:

```rust
        ExportNode::Playlist { name, track_ids } => {
```

with:

```rust
        ExportNode::Playlist { name, track_ids, .. } => {
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats`
Expected: all pass. `the_file_matches_the_golden_sample` still passes because the Rekordbox output does not change.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/mod.rs src-tauri/src/formats/rekordbox.rs
git commit -m "refactor(export): a playlist in the export model carries its id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Traktor's key integers

**Files:**
- Modify: `src-tauri/src/formats/keys.rs`

- [ ] **Step 1: Write the failing tests**

Append inside `mod tests` in `src-tauri/src/formats/keys.rs`:

```rust
    #[test]
    fn all_24_codes_map_to_traktor_keys() {
        // Each step round the Camelot wheel is a fifth (7 semitones), 8B is C (0),
        // and a minor key is its relative major's root + 9, counted from 12.
        for n in 1..=12usize {
            let major = (7 * (n + 4) % 12) as u8;
            assert_eq!(traktor_key(&format!("{n}B")), Some(major), "{n}B");
            assert_eq!(traktor_key(&format!("{n}A")), Some(12 + (major + 9) % 12), "{n}A");
        }
    }

    #[test]
    fn traktor_keys_match_what_traktor_wrote() {
        // From a Traktor 3.11.1 collection: its Open Key text beside its value.
        assert_eq!(traktor_key("8A"), Some(21)); // 1m, A minor
        assert_eq!(traktor_key("6B"), Some(10)); // 11d, B♭ major
        assert_eq!(traktor_key("1A"), Some(20)); // 6m, G♯ minor
        assert_eq!(traktor_key("5A"), Some(12)); // 10m, C minor
        assert_eq!(traktor_key("12A"), Some(13)); // 5m, C♯ minor
        assert_eq!(traktor_key("7A"), Some(14)); // 12m, D minor
    }

    #[test]
    fn anything_else_has_no_traktor_key() {
        for bad in ["", "A", "0A", "13A", "8C", "Am", "8", "-1A"] {
            assert_eq!(traktor_key(bad), None, "{bad:?}");
        }
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd src-tauri && cargo test --lib formats::keys`
Expected: compile error `cannot find function traktor_key`.

- [ ] **Step 3: Implement**

In `src-tauri/src/formats/keys.rs`, after the `MAJOR` constant, add:

```rust
/// Traktor's MUSICAL_KEY values by Camelot number: 0–11 are C…B major and
/// 12–23 C…B minor (checked against Traktor 3.11.1's own collection).
const TRAKTOR_MINOR: [u8; 12] = [20, 15, 22, 17, 12, 19, 14, 21, 16, 23, 18, 13];
const TRAKTOR_MAJOR: [u8; 12] = [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4];
```

and after `rekordbox_tonality`, add:

```rust
/// Camelot to Traktor's MUSICAL_KEY value ("8A" → 21, A minor); None for
/// anything that is not one of the 24 codes.
pub fn traktor_key(camelot: &str) -> Option<u8> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(if minor { TRAKTOR_MINOR[number - 1] } else { TRAKTOR_MAJOR[number - 1] })
}
```

Update the file's header comment, `// its own notation.` → `// its own notation: Rekordbox a name ("Am"), Traktor a number.`

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::keys`
Expected: all pass (the 3 old ones and the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/keys.rs
git commit -m "feat(export): Traktor's key numbers for the 24 Camelot codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The boot volume's name

**Files:**
- Create: `src-tauri/src/formats/volumes.rs`
- Modify: `src-tauri/src/formats/mod.rs` (declare it)

- [ ] **Step 1: Write the module with its tests**

Create `src-tauri/src/formats/volumes.rs`:

```rust
// src-tauri/src/formats/volumes.rs
// Which disk a file is on, as the DJ programs name it: the one part of the
// export that asks the system. Traktor files every track under a volume name.

use std::path::Path;

/// What macOS calls the boot disk when /Volumes cannot tell.
const DEFAULT_BOOT_VOLUME: &str = "Macintosh HD";

/// The boot volume's name ("Macintosh HD"): the entry in /Volumes that links
/// to "/". Traktor files everything under /Users on it too.
pub fn boot_volume_name() -> String {
    boot_volume_in(Path::new("/Volumes")).unwrap_or_else(|| DEFAULT_BOOT_VOLUME.to_string())
}

/// The entry of `volumes` that is a link to "/", if any.
fn boot_volume_in(volumes: &Path) -> Option<String> {
    std::fs::read_dir(volumes).ok()?.flatten().find_map(|entry| {
        let target = std::fs::read_link(entry.path()).ok()?;
        (target == Path::new("/")).then(|| entry.file_name().to_string_lossy().to_string())
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn the_boot_volume_is_the_link_to_the_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("USB")).unwrap();
        symlink("/tmp", dir.path().join("Elsewhere")).unwrap();
        symlink("/", dir.path().join("Studio HD")).unwrap();
        assert_eq!(boot_volume_in(dir.path()), Some("Studio HD".to_string()));
    }

    #[test]
    fn without_such_a_link_there_is_no_answer() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("USB")).unwrap();
        assert_eq!(boot_volume_in(dir.path()), None);
        assert_eq!(boot_volume_in(&dir.path().join("missing")), None);
    }
}
```

In `src-tauri/src/formats/mod.rs` replace:

```rust
pub mod keys;
pub mod rekordbox;
mod xml;
```

with:

```rust
pub mod keys;
pub mod rekordbox;
pub mod volumes;
mod xml;
```

- [ ] **Step 2: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::volumes`
Expected: 2 pass.

Sanity check on this Mac: `ls -l /Volumes` shows `Macintosh HD -> /`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/formats/volumes.rs src-tauri/src/formats/mod.rs
git commit -m "feat(export): find the boot volume's name, as Traktor files tracks under it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Traktor's location for a path

**Files:**
- Modify: `src-tauri/Cargo.toml` (+ `Cargo.lock`)
- Create: `src-tauri/src/formats/fixtures/traktor_real.nml`
- Create: `src-tauri/src/formats/traktor.rs`
- Modify: `src-tauri/src/formats/mod.rs` (declare it)

- [ ] **Step 1: Add the normalization crate**

In `src-tauri/Cargo.toml`, after the line `walkdir = "2.5"`, add:

```toml
unicode-normalization = "0.1"
```

Run: `cd src-tauri && cargo check`
Expected: it downloads and builds `unicode-normalization`; `Cargo.lock` gains it.

- [ ] **Step 2: Add the real Traktor file**

Create `src-tauri/src/formats/fixtures/traktor_real.nml` with **exactly** the content below. It is a Traktor 3.11.1 history file (`History/history_<date>.nml`): its first two entries and their two playlist entries, plus one richer entry from the collection, placed first. It is sanitized: the user's name is `dj`, and `AUDIO_ID`/`COVERARTID` are blanked. Keep the trailing newline.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
<COLLECTION ENTRIES="3"><ENTRY MODIFIED_DATE="2026/1/1" MODIFIED_TIME="0" AUDIO_ID="AAAA" TITLE="Track One (Extended Remix)" ARTIST="Artist One, Artist Two"><LOCATION DIR="/:Users/:dj/:Music/:Set A/:" FILE="Artist One, Artist Two - Track One (Extended Remix) [Label One].mp3" VOLUME="Macintosh HD" VOLUMEID="Macintosh HD"></LOCATION>
<ALBUM TRACK="1" TITLE="Track One"></ALBUM>
<MODIFICATION_INFO AUTHOR_TYPE="user"></MODIFICATION_INFO>
<INFO BITRATE="320000" GENRE="House" LABEL="Label One" COMMENT="Bought online" COVERARTID="000/AAAA" KEY="6m" PLAYCOUNT="1" PLAYTIME="371" PLAYTIME_FLOAT="370.991028" RANKING="204" IMPORT_DATE="2026/1/1" LAST_PLAYED="2026/1/2" RELEASE_DATE="2020/1/1" FLAGS="14" FILESIZE="14696"></INFO>
<TEMPO BPM="121.999779" BPM_QUALITY="100.000000"></TEMPO>
<LOUDNESS PEAK_DB="-0.662714" PERCEIVED_DB="-0.256721" ANALYZED_DB="-0.256721"></LOUDNESS>
<MUSICAL_KEY VALUE="20"></MUSICAL_KEY>
<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="128.945395" LEN="0.000000" REPEATS="-1" HOTCUE="0"></CUE_V2>
</ENTRY>
<ENTRY MODIFIED_DATE="2026/1/1" MODIFIED_TIME="0" AUDIO_ID="AAAA" TITLE="Track Two  (Original Mix)" ARTIST="Artist Three, Artist Four"><LOCATION DIR="/:Users/:dj/:Music/:Set B/:" FILE="Artist Three, Artist Four - Track Two (Original Mix) [Label Two].mp3" VOLUME="Macintosh HD" VOLUMEID="Macintosh HD"></LOCATION>
<ALBUM TITLE="Track Two"></ALBUM>
<MODIFICATION_INFO AUTHOR_TYPE="user"></MODIFICATION_INFO>
<INFO BITRATE="320000" GENRE="Indie Dance" LABEL="Label Two" COVERARTID="000/AAAA" KEY="Fm" PLAYCOUNT="1" PLAYTIME="362" PLAYTIME_FLOAT="361.665314" IMPORT_DATE="2026/1/1" LAST_PLAYED="2026/1/2" RELEASE_DATE="2026/1/1" FLAGS="12" FILESIZE="14364"></INFO>
<TEMPO BPM="124.999435" BPM_QUALITY="100.000000"></TEMPO>
<LOUDNESS PEAK_DB="-0.602428" PERCEIVED_DB="-0.673157" ANALYZED_DB="-0.673157"></LOUDNESS>
<MUSICAL_KEY VALUE="17"></MUSICAL_KEY>
<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="219.172448" LEN="0.000000" REPEATS="-1" HOTCUE="0"></CUE_V2>
</ENTRY>
<ENTRY MODIFIED_DATE="2026/1/1" MODIFIED_TIME="0" AUDIO_ID="AAAA" TITLE="Track Three (Extended Mix)" ARTIST="Artist Five"><LOCATION DIR="/:Users/:dj/:Music/:Set B/:" FILE="Artist Five - Track Three (Extended Mix) [Label Three].mp3" VOLUME="Macintosh HD" VOLUMEID="Macintosh HD"></LOCATION>
<ALBUM TITLE="Track Three"></ALBUM>
<MODIFICATION_INFO AUTHOR_TYPE="user"></MODIFICATION_INFO>
<INFO BITRATE="320000" GENRE="Tech House" LABEL="Label Three" COVERARTID="000/AAAA" KEY="Eb" PLAYCOUNT="1" PLAYTIME="404" PLAYTIME_FLOAT="403.879181" IMPORT_DATE="2026/1/1" LAST_PLAYED="2026/1/2" RELEASE_DATE="2026/1/1" FLAGS="12" FILESIZE="15976"></INFO>
<TEMPO BPM="125.999886" BPM_QUALITY="100.000000"></TEMPO>
<LOUDNESS PEAK_DB="-0.593426" PERCEIVED_DB="0.907364" ANALYZED_DB="0.907364"></LOUDNESS>
<MUSICAL_KEY VALUE="15"></MUSICAL_KEY>
<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="51.917374" LEN="0.000000" REPEATS="-1" HOTCUE="0"></CUE_V2>
</ENTRY>
</COLLECTION>
<SETS ENTRIES="0"></SETS>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1"><NODE TYPE="PLAYLIST" NAME="HISTORY"><PLAYLIST ENTRIES="2" TYPE="PROTOCOL" UUID="0123456789abcdef0123456789abcdef"><ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:Set B/:Artist Three, Artist Four - Track Two (Original Mix) [Label Two].mp3"></PRIMARYKEY>
<EXTENDEDDATA DECK="1" DURATION="39.594799" EXTENDEDTYPE="HistoryData" PLAYEDPUBLIC="0" STARTDATE="0" STARTTIME="0"></EXTENDEDDATA>
</ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:Set B/:Artist Five - Track Three (Extended Mix) [Label Three].mp3"></PRIMARYKEY>
<EXTENDEDDATA DECK="1" DURATION="19.6480026" EXTENDEDTYPE="HistoryData" PLAYEDPUBLIC="1" STARTDATE="0" STARTTIME="0"></EXTENDEDDATA>
</ENTRY>
</PLAYLIST>
</NODE>
</SUBNODES>
</NODE>
</PLAYLISTS>
<INDEXING></INDEXING>
</NML>
```

- [ ] **Step 3: Write `traktor.rs` with the location tests first**

Create `src-tauri/src/formats/traktor.rs`:

```rust
// src-tauri/src/formats/traktor.rs
// Traktor NML (spec: Export to DJ Software → Traktor NML): the collection of
// the exported tracks and the playlists under a RecoDeck folder, loaded in
// Traktor through right-click Playlists → Import Playlist. The shape follows
// Traktor 3.11.1's own files (fixtures/traktor_real.nml).

use unicode_normalization::UnicodeNormalization;

/// Where Traktor files a track: the volume, the folders in its `/:` form, the file.
#[derive(Debug, Clone, PartialEq)]
pub struct TraktorLocation {
    pub volume: String,
    pub dir: String,
    pub file: String,
}

impl TraktorLocation {
    /// How a playlist refers to the track: VOLUME + DIR + FILE.
    pub fn key(&self) -> String {
        format!("{}{}{}", self.volume, self.dir, self.file)
    }
}

/// A path as Traktor stores it. The volume is the drive in a Windows path
/// ("C:"), the name after /Volumes/ for an external drive, else the boot
/// volume. Names are NFC, as Traktor writes them even when a name is
/// decomposed on disk; in any other form the track would be new to Traktor.
pub fn location(path: &str, boot_volume: &str) -> TraktorLocation {
    let path: String = path.nfc().collect();
    let windows = matches!(path.as_bytes(), [l, b':', b'\\' | b'/', ..] if l.is_ascii_alphabetic());
    let (volume, rest) = if windows {
        (path[..2].to_string(), path[2..].replace('\\', "/"))
    } else if let Some((name, rest)) = path.strip_prefix("/Volumes/").and_then(|p| p.split_once('/')) {
        (name.to_string(), format!("/{rest}"))
    } else {
        (boot_volume.to_string(), path.clone())
    };
    let (folders, file) = rest.rsplit_once('/').unwrap_or(("", rest.as_str()));
    let mut dir: String = folders.split('/').filter(|f| !f.is_empty()).map(|f| format!("/:{f}")).collect();
    dir.push_str("/:");
    TraktorLocation { volume, dir, file: file.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOOT: &str = "Macintosh HD";
    const REAL: &str = include_str!("fixtures/traktor_real.nml");

    fn loc(volume: &str, dir: &str, file: &str) -> TraktorLocation {
        TraktorLocation { volume: volume.into(), dir: dir.into(), file: file.into() }
    }

    #[test]
    fn a_file_on_the_boot_disk_is_on_the_boot_volume() {
        let at = location("/Users/dj/Music/a.mp3", BOOT);
        assert_eq!(at, loc("Macintosh HD", "/:Users/:dj/:Music/:", "a.mp3"));
        assert_eq!(at.key(), "Macintosh HD/:Users/:dj/:Music/:a.mp3");
    }

    #[test]
    fn a_file_on_an_external_drive_is_on_that_volume() {
        assert_eq!(location("/Volumes/USB Stick/Sets/b.aiff", BOOT), loc("USB Stick", "/:Sets/:", "b.aiff"));
        assert_eq!(location("/Volumes/USB/a.mp3", BOOT), loc("USB", "/:", "a.mp3"));
    }

    #[test]
    fn a_windows_path_is_on_its_drive() {
        assert_eq!(location(r"C:\Music\Warm up.flac", BOOT), loc("C:", "/:Music/:", "Warm up.flac"));
        assert_eq!(location("d:/x.mp3", BOOT), loc("d:", "/:", "x.mp3"));
    }

    #[test]
    fn names_are_composed_as_traktor_writes_them() {
        // "č" as c + combining caron (NFD), as macOS can store it; Traktor writes "č".
        assert_eq!(location("/m/c\u{30C}/c\u{30C}.mp3", BOOT), loc("Macintosh HD", "/:m/:\u{10D}/:", "\u{10D}.mp3"));
    }

    #[test]
    fn a_backslash_in_a_mac_name_is_part_of_the_name() {
        assert_eq!(location("/Music/AC\\DC.mp3", BOOT), loc("Macintosh HD", "/:Music/:", "AC\\DC.mp3"));
    }

    #[test]
    fn a_real_track_gets_the_location_traktor_gave_it() {
        let at = location(
            "/Users/dj/Music/Set B/Artist Five - Track Three (Extended Mix) [Label Three].mp3",
            BOOT,
        );
        let element = format!(
            "<LOCATION DIR=\"{}\" FILE=\"{}\" VOLUME=\"{v}\" VOLUMEID=\"{v}\"></LOCATION>",
            at.dir,
            at.file,
            v = at.volume
        );
        assert!(REAL.contains(&element), "{element}");
        let key = format!("<PRIMARYKEY TYPE=\"TRACK\" KEY=\"{}\"></PRIMARYKEY>", at.key());
        assert!(REAL.contains(&key), "{key}");
    }
}
```

In `src-tauri/src/formats/mod.rs` replace:

```rust
pub mod rekordbox;
pub mod volumes;
```

with:

```rust
pub mod rekordbox;
pub mod traktor;
pub mod volumes;
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib formats::traktor`
Expected: 6 pass. If `a_real_track_gets_the_location_traktor_gave_it` fails, fix `location()`, not the fixture: the fixture is what Traktor wrote.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/formats/traktor.rs src-tauri/src/formats/mod.rs src-tauri/src/formats/fixtures/traktor_real.nml
git commit -m "feat(export): Traktor locations — volume, /: folders, NFC names — checked against a real Traktor file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The NML writer

**Files:**
- Modify: `src-tauri/src/formats/traktor.rs`
- Create: `src-tauri/src/formats/fixtures/traktor_sample.nml`

- [ ] **Step 1: Write the golden file**

Create `src-tauri/src/formats/fixtures/traktor_sample.nml` with exactly this content and a trailing newline. In `Čeh`, the `Č` is the single precomposed character U+010C. The test feeds it decomposed, so the file checks NFC.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
<COLLECTION ENTRIES="3"><ENTRY TITLE="Ça &amp; Va" ARTIST="Nina &quot;N&quot; Kraviz"><LOCATION DIR="/:Users/:dj/:Music/:" FILE="Čeh &amp; Don't # 100%.mp3" VOLUME="Macintosh HD" VOLUMEID="Macintosh HD"></LOCATION>
<ALBUM TRACK="3" TITLE="Trip"></ALBUM>
<INFO BITRATE="320000" GENRE="Techno" LABEL="Trip" COMMENT="line one&#10;line two" PLAYCOUNT="3" PLAYTIME="412" PLAYTIME_FLOAT="412.345000" RANKING="204" IMPORT_DATE="2026/9/1" RELEASE_DATE="2024/1/1" FILESIZE="9766"></INFO>
<TEMPO BPM="124.000000" BPM_QUALITY="100.000000"></TEMPO>
<MUSICAL_KEY VALUE="21"></MUSICAL_KEY>
</ENTRY>
<ENTRY TITLE="Warm &lt;Up&gt;"><LOCATION DIR="/:Music/:" FILE="Warm up.flac" VOLUME="C:" VOLUMEID="C:"></LOCATION>
<INFO></INFO>
</ENTRY>
<ENTRY TITLE="B"><LOCATION DIR="/:Sets/:" FILE="b.aiff" VOLUME="USB Stick" VOLUMEID="USB Stick"></LOCATION>
<INFO></INFO>
<TEMPO BPM="126.500000" BPM_QUALITY="100.000000"></TEMPO>
<MUSICAL_KEY VALUE="4"></MUSICAL_KEY>
</ENTRY>
</COLLECTION>
<SETS ENTRIES="0"></SETS>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1"><NODE TYPE="FOLDER" NAME="RecoDeck"><SUBNODES COUNT="2"><NODE TYPE="FOLDER" NAME="Gigs &amp; Raves"><SUBNODES COUNT="1"><NODE TYPE="PLAYLIST" NAME="Friday"><PLAYLIST ENTRIES="3" TYPE="LIST" UUID="7265636f6465636b000000000000000a"><ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:Čeh &amp; Don't # 100%.mp3"></PRIMARYKEY>
</ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="C:/:Music/:Warm up.flac"></PRIMARYKEY>
</ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="USB Stick/:Sets/:b.aiff"></PRIMARYKEY>
</ENTRY>
</PLAYLIST>
</NODE>
</SUBNODES>
</NODE>
<NODE TYPE="PLAYLIST" NAME="Warm-up"><PLAYLIST ENTRIES="1" TYPE="LIST" UUID="7265636f6465636b000000000000000b"><ENTRY><PRIMARYKEY TYPE="TRACK" KEY="C:/:Music/:Warm up.flac"></PRIMARYKEY>
</ENTRY>
</PLAYLIST>
</NODE>
</SUBNODES>
</NODE>
</SUBNODES>
</NODE>
</PLAYLISTS>
<INDEXING></INDEXING>
</NML>
```

Check the `Č` afterwards: `python3 -c "import sys;t=open(sys.argv[1],encoding='utf-8').read();print('\u010c' in t and 'C\u030c' not in t)" src-tauri/src/formats/fixtures/traktor_sample.nml` prints `True`.

- [ ] **Step 2: Write the failing tests**

Append inside `mod tests` in `src-tauri/src/formats/traktor.rs`, and add `use super::super::{ExportLibrary, ExportNode, ExportTrack};` under `use super::*;`:

```rust
    #[test]
    fn dates_take_traktors_form() {
        assert_eq!(traktor_date("2026-09-01 12:30:00").as_deref(), Some("2026/9/1"));
        assert_eq!(traktor_date("2026-10-04").as_deref(), Some("2026/10/4"));
        assert_eq!(traktor_date("<2026-09-01>"), None);
        assert_eq!(traktor_date(""), None);
    }

    #[test]
    fn a_playlist_uuid_is_its_id_in_32_hex_digits() {
        assert_eq!(playlist_uuid(10), "7265636f6465636b000000000000000a");
        assert_eq!(playlist_uuid(i64::from(u32::MAX)).len(), 32);
    }

    fn sample() -> ExportLibrary {
        let t1 = ExportTrack {
            id: 1,
            // "Č" decomposed, as macOS can store it: written composed.
            path: "/Users/dj/Music/C\u{30C}eh & Don't # 100%.mp3".into(),
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
        let t4 = ExportTrack {
            id: 4,
            path: "/Volumes/USB Stick/Sets/b.aiff".into(),
            exists: true,
            title: Some("B".into()),
            bpm: Some(126.5),
            camelot: Some("12B".into()),
            ..ExportTrack::default()
        };
        ExportLibrary {
            tracks: vec![t1, t2, t3, t4],
            tree: vec![
                ExportNode::Folder {
                    name: "Gigs & Raves".into(),
                    children: vec![ExportNode::Playlist { id: 10, name: "Friday".into(), track_ids: vec![1, 2, 3, 4] }],
                },
                ExportNode::Playlist { id: 11, name: "Warm-up".into(), track_ids: vec![2] },
            ],
        }
    }

    #[test]
    fn the_file_matches_the_golden_sample() {
        assert_eq!(write(&sample(), BOOT), include_str!("fixtures/traktor_sample.nml"));
    }

    #[test]
    fn it_starts_as_a_real_traktor_file_does() {
        let head = |nml: &str| nml.lines().take(2).collect::<Vec<_>>().join("\n");
        assert_eq!(head(&write(&sample(), BOOT)), head(REAL));
    }

    /// Attribute names of the first `<tag …>` element, in order. Values hold no raw quote.
    fn attribute_names(nml: &str, tag: &str) -> Vec<String> {
        let open = format!("<{tag} ");
        let start = nml.find(&open).expect("the element") + open.len();
        let end = start + nml[start..].find('>').expect("a closed element");
        nml[start..end]
            .split('"')
            .step_by(2)
            .map(|name| name.trim().trim_end_matches('=').to_string())
            .filter(|name| !name.is_empty())
            .collect()
    }

    /// The elements inside the collection's first entry, in order.
    fn entry_elements(nml: &str) -> Vec<String> {
        let start = nml.find("<ENTRY ").expect("an entry");
        let end = start + nml[start..].find("</ENTRY>").expect("a closed entry");
        nml[start..end]
            .split('<')
            .skip(2)
            .filter(|piece| !piece.starts_with('/'))
            .map(|piece| piece.split([' ', '>']).next().unwrap_or("").to_string())
            .collect()
    }

    /// Every name of `ours` comes in `real`, in the same order.
    fn in_order(ours: &[String], real: &[String]) -> bool {
        let mut rest = real.iter();
        ours.iter().all(|name| rest.any(|r| r == name))
    }

    #[test]
    fn an_entry_follows_the_order_of_a_real_traktor_file() {
        let ours = write(&sample(), BOOT);
        for tag in ["ENTRY", "INFO"] {
            let (o, r) = (attribute_names(&ours, tag), attribute_names(REAL, tag));
            assert!(in_order(&o, &r), "{tag}: {o:?} is not in the order of {r:?}");
        }
        // The sample's first track carries everything RecoDeck writes.
        assert_eq!(attribute_names(&ours, "INFO").len(), 11);
        assert_eq!(attribute_names(&ours, "LOCATION"), attribute_names(REAL, "LOCATION"));
        let (o, r) = (entry_elements(&ours), entry_elements(REAL));
        assert_eq!(o, ["LOCATION", "ALBUM", "INFO", "TEMPO", "MUSICAL_KEY"]);
        assert!(in_order(&o, &r), "{o:?} is not in the order of {r:?}");
    }
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd src-tauri && cargo test --lib formats::traktor`
Expected: compile errors for `write`, `traktor_date` and `playlist_uuid`.

- [ ] **Step 4: Implement the writer**

In `src-tauri/src/formats/traktor.rs`, replace the `use` line:

```rust
use unicode_normalization::UnicodeNormalization;
```

with:

```rust
use super::{keys, xml::attr, ExportLibrary, ExportNode, ExportTrack};
use std::collections::HashMap;
use std::fmt::Write;
use unicode_normalization::UnicodeNormalization;
```

and add, between `location()` and `#[cfg(test)]`:

```rust
/// The whole file. Tracks whose file is gone are left out of the collection
/// and of every playlist.
pub fn write(lib: &ExportLibrary, boot_volume: &str) -> String {
    let tracks: Vec<(&ExportTrack, TraktorLocation)> = lib
        .tracks
        .iter()
        .filter(|t| t.exists)
        .map(|t| (t, location(&t.path, boot_volume)))
        .collect();
    let keys: HashMap<i64, String> = tracks.iter().map(|(t, at)| (t.id, at.key())).collect();
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n");
    out.push_str("<NML VERSION=\"19\"><HEAD COMPANY=\"www.native-instruments.com\" PROGRAM=\"Traktor\"></HEAD>\n");
    let _ = write!(out, "<COLLECTION ENTRIES=\"{}\">", tracks.len());
    for (track, at) in &tracks {
        write_entry(&mut out, track, at);
    }
    out.push_str("</COLLECTION>\n");
    out.push_str("<SETS ENTRIES=\"0\"></SETS>\n");
    out.push_str("<PLAYLISTS><NODE TYPE=\"FOLDER\" NAME=\"$ROOT\"><SUBNODES COUNT=\"1\">");
    let _ = write!(out, "<NODE TYPE=\"FOLDER\" NAME=\"RecoDeck\"><SUBNODES COUNT=\"{}\">", lib.tree.len());
    for node in &lib.tree {
        write_node(&mut out, node, &keys);
    }
    out.push_str("</SUBNODES>\n</NODE>\n</SUBNODES>\n</NODE>\n</PLAYLISTS>\n");
    out.push_str("<INDEXING></INDEXING>\n</NML>\n");
    out
}

/// One collection entry. Its elements and INFO's attributes come in the order
/// Traktor writes them, and, as Traktor does, what is empty is left out.
/// Not written: MODIFIED_DATE (Traktor would take the entry as newer than its
/// own), FLAGS, LOCK, INFO KEY (a tag's text), cues and loudness.
fn write_entry(out: &mut String, t: &ExportTrack, at: &TraktorLocation) {
    out.push_str("<ENTRY");
    if let Some(title) = filled(&t.title) {
        let _ = write!(out, " TITLE=\"{}\"", text(title));
    }
    if let Some(artist) = filled(&t.artist) {
        let _ = write!(out, " ARTIST=\"{}\"", text(artist));
    }
    let _ = writeln!(
        out,
        "><LOCATION DIR=\"{}\" FILE=\"{}\" VOLUME=\"{volume}\" VOLUMEID=\"{volume}\"></LOCATION>",
        text(&at.dir),
        text(&at.file),
        volume = text(&at.volume),
    );
    let number = t.track_number.filter(|n| *n > 0);
    let album = filled(&t.album);
    if number.is_some() || album.is_some() {
        out.push_str("<ALBUM");
        if let Some(number) = number {
            let _ = write!(out, " TRACK=\"{number}\"");
        }
        if let Some(album) = album {
            let _ = write!(out, " TITLE=\"{}\"", text(album));
        }
        out.push_str("></ALBUM>\n");
    }
    out.push_str("<INFO");
    for (name, value) in info(t) {
        let _ = write!(out, " {name}=\"{}\"", text(&value));
    }
    out.push_str("></INFO>\n");
    if let Some(bpm) = t.bpm.filter(|bpm| *bpm > 0.0) {
        let _ = writeln!(out, "<TEMPO BPM=\"{bpm:.6}\" BPM_QUALITY=\"100.000000\"></TEMPO>");
    }
    if let Some(key) = t.camelot.as_deref().and_then(keys::traktor_key) {
        let _ = writeln!(out, "<MUSICAL_KEY VALUE=\"{key}\"></MUSICAL_KEY>");
    }
    out.push_str("</ENTRY>\n");
}

/// INFO's attributes in Traktor's order and units: bit/s, KiB, stars × 51,
/// dates as 2026/9/1.
fn info(t: &ExportTrack) -> Vec<(&'static str, String)> {
    let mut info = Vec::new();
    if let Some(kbps) = t.bitrate.filter(|kbps| *kbps > 0) {
        info.push(("BITRATE", (i64::from(kbps) * 1000).to_string()));
    }
    if let Some(genre) = filled(&t.genre) {
        info.push(("GENRE", genre.to_string()));
    }
    if let Some(label) = filled(&t.label) {
        info.push(("LABEL", label.to_string()));
    }
    if let Some(comment) = filled(&t.comment) {
        info.push(("COMMENT", comment.to_string()));
    }
    if t.play_count > 0 {
        info.push(("PLAYCOUNT", t.play_count.to_string()));
    }
    if let Some(ms) = t.duration_ms.filter(|ms| *ms > 0) {
        let seconds = f64::from(ms) / 1000.0;
        info.push(("PLAYTIME", (seconds.round() as i64).to_string()));
        info.push(("PLAYTIME_FLOAT", format!("{seconds:.6}")));
    }
    if t.rating > 0 {
        info.push(("RANKING", (t.rating.min(5) * 51).to_string()));
    }
    if let Some(date) = t.date_added.as_deref().and_then(traktor_date) {
        info.push(("IMPORT_DATE", date));
    }
    if let Some(year) = t.year.filter(|year| *year > 0) {
        info.push(("RELEASE_DATE", format!("{year}/1/1")));
    }
    if let Some(bytes) = t.file_size.filter(|bytes| *bytes > 0) {
        info.push(("FILESIZE", ((bytes + 512) / 1024).to_string()));
    }
    info
}

/// A folder with its children, or a playlist that refers to collection
/// entries by their VOLUME + DIR + FILE.
fn write_node(out: &mut String, node: &ExportNode, keys: &HashMap<i64, String>) {
    match node {
        ExportNode::Folder { name, children } => {
            let _ = write!(out, "<NODE TYPE=\"FOLDER\" NAME=\"{}\"><SUBNODES COUNT=\"{}\">", text(name), children.len());
            for child in children {
                write_node(out, child, keys);
            }
            out.push_str("</SUBNODES>\n</NODE>\n");
        }
        ExportNode::Playlist { id, name, track_ids } => {
            let entries: Vec<&String> = track_ids.iter().filter_map(|id| keys.get(id)).collect();
            let _ = write!(
                out,
                "<NODE TYPE=\"PLAYLIST\" NAME=\"{}\"><PLAYLIST ENTRIES=\"{}\" TYPE=\"LIST\" UUID=\"{}\">",
                text(name),
                entries.len(),
                playlist_uuid(*id),
            );
            for key in entries {
                let _ = writeln!(out, "<ENTRY><PRIMARYKEY TYPE=\"TRACK\" KEY=\"{}\"></PRIMARYKEY>", text(key));
                out.push_str("</ENTRY>\n");
            }
            out.push_str("</PLAYLIST>\n</NODE>\n");
        }
    }
}

/// A playlist's UUID: "recodeck" in hex, then its id — 32 hex digits like
/// Traktor's own, the same on every export.
fn playlist_uuid(id: i64) -> String {
    format!("7265636f6465636b{id:016x}")
}

/// SQLite's "2026-09-01 12:30:00" as Traktor's "2026/9/1".
fn traktor_date(datetime: &str) -> Option<String> {
    let mut parts = datetime.get(..10)?.split('-');
    let year: u32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    Some(format!("{year}/{month}/{day}"))
}

/// An attribute value as Traktor writes it: escaped, but `'` kept as it is.
fn text(value: &str) -> String {
    attr(value).replace("&apos;", "'")
}

fn filled(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|v| !v.is_empty())
}
```

- [ ] **Step 5: Run the tests**

Run: `cd src-tauri && cargo test --lib formats`
Expected: all pass.

If the golden test fails, print the actual output (`println!("{}", write(&sample(), BOOT))` with `-- --nocapture`) and diff it line by line against the golden file.
- Fix the code when it breaks a rule in "What the real Traktor files settled".
- Fix the golden file only when the golden is wrong, and say which in the report.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/formats/traktor.rs src-tauri/src/formats/fixtures/traktor_sample.nml
git commit -m "feat(export): Traktor NML writer, its shape checked against a real Traktor file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The command writes Traktor and remembers the last program

**Files:**
- Modify: `src-tauri/src/commands/dj_export.rs`

- [ ] **Step 1: Write the failing test**

Append inside `mod tests` in `src-tauri/src/commands/dj_export.rs`:

```rust
    #[test]
    fn a_saved_choice_names_its_program_as_the_last_one() {
        let db = crate::db::Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let choice = DjExportChoice { playlist_ids: vec![2], path: Some("/x/RecoDeck.nml".into()) };
        save_choice(&db, DjTarget::Traktor, &choice).unwrap();
        // The dialog reads this through get_setting and opens on Traktor's tab.
        assert_eq!(db.get_setting("dj_export.last_target").unwrap().as_deref(), Some("\"traktor\""));
        assert_eq!(parse_choice(db.get_setting("dj_export.traktor").unwrap().as_deref()), Some(choice));
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd src-tauri && cargo test --lib commands::dj_export`
Expected: compile error `cannot find function save_choice`.

- [ ] **Step 3: Implement**

In `src-tauri/src/commands/dj_export.rs`:

1. Replace the header comment's last two lines:

```rust
// what the dialog opens with, and the export itself. Phase 1 writes Rekordbox
// XML; Traktor and Serato come in later phases.
```

with:

```rust
// what the dialog opens with, and the export itself: Rekordbox XML and
// Traktor NML. Serato comes in phase 3.
```

2. Replace:

```rust
use crate::formats::{self, rekordbox, ExportLibrary};
```

with:

```rust
use crate::db::Database;
use crate::formats::{self, rekordbox, traktor, volumes, ExportLibrary};
```

3. Above `/// What is remembered per program: the playlists and where the file went.`, add:

```rust
/// The program exported to last: the dialog opens on its tab.
const LAST_TARGET_KEY: &str = "dj_export.last_target";

```

4. Replace the whole `remember` function:

```rust
/// Saves a program's choice in the settings table.
fn remember(state: &AppState, target: DjTarget, choice: &DjExportChoice) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|_| "State lock failed".to_string())?;
    let db = db_lock.as_ref().ok_or_else(|| "Database not initialized".to_string())?;
    let raw = serde_json::to_string(choice).map_err(|e| e.to_string())?;
    db.set_setting(&target.setting_key(), &raw).map_err(|e| e.to_string())
}
```

with:

```rust
/// Saves a program's choice in the settings table.
fn remember(state: &AppState, target: DjTarget, choice: &DjExportChoice) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|_| "State lock failed".to_string())?;
    let db = db_lock.as_ref().ok_or_else(|| "Database not initialized".to_string())?;
    save_choice(db, target, choice)
}

/// The program's choice, and that it is the program used last (as JSON: "traktor").
fn save_choice(db: &Database, target: DjTarget, choice: &DjExportChoice) -> Result<(), String> {
    let raw = serde_json::to_string(choice).map_err(|e| e.to_string())?;
    db.set_setting(&target.setting_key(), &raw).map_err(|e| e.to_string())?;
    let last = serde_json::to_string(&target).map_err(|e| e.to_string())?;
    db.set_setting(LAST_TARGET_KEY, &last).map_err(|e| e.to_string())
}
```

5. In `export_to_dj`, replace:

```rust
    if target != DjTarget::Rekordbox {
        return Err(not_yet(target));
    }
```

with:

```rust
    if target == DjTarget::Serato {
        return Err(not_yet(target));
    }
```

and replace:

```rust
    let content = rekordbox::write(&lib, env!("CARGO_PKG_VERSION"));
```

with:

```rust
    let content = match target {
        DjTarget::Rekordbox => rekordbox::write(&lib, env!("CARGO_PKG_VERSION")),
        DjTarget::Traktor => traktor::write(&lib, &volumes::boot_volume_name()),
        DjTarget::Serato => return Err(not_yet(target)),
    };
```

- [ ] **Step 4: Run the tests and the compile**

Run: `cd src-tauri && cargo test --lib commands::dj_export && cargo test --lib formats && cargo check`
Expected: all pass; `cargo check` clean (no new warnings).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/dj_export.rs
git commit -m "feat(export): export to Traktor, and remember the program used last

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The dialog gets a tab per program

**Files:**
- Modify: `src/lib/tauri-api.ts` (python script)
- Modify: `src/components/DjExportModal.tsx` (heredoc, whole file)
- Modify: `src/components/DjExportModal.test.tsx` (heredoc, whole file)
- Modify: `src/components/DjExportModal.css` (Edit is fine)

- [ ] **Step 1: `djExportLastTarget` in the API**

Run:

```bash
python3 - <<'PYEOF'
import pathlib
p = pathlib.Path('src/lib/tauri-api.ts')
s = p.read_text()
old = """  async exportToDj(target: DjTarget, playlistIds: number[], path: string): Promise<DjExportResult> {
    return await invoke('export_to_dj', { target, playlistIds, path })
  },
"""
new = old + """
  async djExportLastTarget(): Promise<DjTarget | null> {
    // The program exported to last; export_to_dj saves it as JSON ("traktor").
    const raw = await invoke<string | null>('get_setting', { key: 'dj_export.last_target' })
    try {
      const target: unknown = raw ? JSON.parse(raw) : null
      return target === 'rekordbox' || target === 'traktor' || target === 'serato' ? target : null
    } catch {
      return null
    }
  },
"""
assert s.count(old) == 1, 'exportToDj not found exactly once'
p.write_text(s.replace(old, new))
PYEOF
```

- [ ] **Step 2: Write the new tests (whole file)**

Run `cat > src/components/DjExportModal.test.tsx <<'TSXEOF'` with this content, then `TSXEOF`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DjTarget } from '../types/djExport'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAllPlaylists: vi.fn(),
    djExportDefaults: vi.fn(),
    djExportLastTarget: vi.fn(),
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

// jsdom has no ResizeObserver; the tab bar's thumb only needs one to exist.
class NoResizeObserver {
  observe() {}
  disconnect() {}
}

const PATH = '/Users/dj/Music/RecoDeck/RecoDeck.xml'
const NML = '/Users/dj/Music/RecoDeck/RecoDeck.nml'
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
  vi.stubGlobal('ResizeObserver', NoResizeObserver)
  vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue(playlists)
  // Rekordbox last got Warm-up; Traktor last got Saturday.
  vi.mocked(tauriApi.djExportDefaults).mockImplementation(async (target: DjTarget) =>
    target === 'traktor'
      ? { path: NML, exists: true, playlist_ids: [3], remembered: true }
      : { path: PATH, exists: true, playlist_ids: [4], remembered: true },
  )
  vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue(null)
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
  vi.unstubAllGlobals()
})

async function open(openedFrom: number | null) {
  await act(async () => {
    root.render(<DjExportModal openedFrom={openedFrom} onClose={onClose} />)
  })
}

const box = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const exportButton = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Export'))!
const tab = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === name)!

describe('DjExportModal', () => {
  it('opens with the remembered playlists and the one it was opened from', async () => {
    await open(2)
    expect(tab('Rekordbox').getAttribute('aria-selected')).toBe('true')
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
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Couldn’t write /x: Permission denied')
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), { kind: 'error' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says why in the tree box when the playlists cannot be loaded, and Cancel still closes', async () => {
    vi.mocked(tauriApi.getAllPlaylists).mockRejectedValue({ kind: 'Internal', message: 'db gone' })
    await open(null)
    expect(host.querySelector('.dj-export__tree')?.textContent).toBe('db gone')
    const cancel = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cancel')!
    await act(async () => {
      cancel.click()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('Change… sets where the file goes, and Export sends that path', async () => {
    vi.mocked(tauriApi.pickDjExportFile).mockResolvedValue('/Volumes/USB/RecoDeck.xml')
    await open(2)
    const change = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Change…')!
    await act(async () => {
      change.click()
    })
    expect(tauriApi.pickDjExportFile).toHaveBeenCalledWith('rekordbox', PATH)
    expect(host.textContent).toContain('/Volumes/USB/RecoDeck.xml')
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('rekordbox', [2, 4], '/Volumes/USB/RecoDeck.xml')
  })

  it('an empty folder has its box disabled', async () => {
    vi.mocked(tauriApi.getAllPlaylists).mockResolvedValue([
      ...playlists,
      { id: 9, name: 'Empty', parent_id: null, playlist_type: 'folder', track_count: 0 },
    ])
    await open(null)
    expect(box('Empty').disabled).toBe(true)
    expect(box('Gigs').disabled).toBe(false)
  })

  it('opens on the program exported to last, with that program’s playlists and file', async () => {
    vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue('traktor')
    await open(2)
    expect(tab('Traktor').getAttribute('aria-selected')).toBe('true')
    expect(box('Saturday').checked).toBe(true)
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(false)
    expect(host.textContent).toContain(NML)
    expect(host.textContent).toContain('Import Playlist')
  })

  it('each tab keeps its own checks, and Export writes for the open tab', async () => {
    await open(null)
    await act(async () => {
      box('Friday').click()
    })
    await act(async () => {
      tab('Traktor').click()
    })
    expect(box('Friday').checked).toBe(false)
    expect(box('Saturday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(false)
    await act(async () => {
      tab('Rekordbox').click()
    })
    expect(box('Friday').checked).toBe(true)
    expect(box('Warm-up').checked).toBe(true)
    await act(async () => {
      tab('Traktor').click()
    })
    vi.mocked(tauriApi.exportToDj).mockResolvedValue({ playlists: 1, tracks: 5, skipped: [], written: [NML] })
    await act(async () => {
      exportButton().click()
    })
    expect(tauriApi.exportToDj).toHaveBeenCalledWith('traktor', [3], NML)
    expect(toast).toHaveBeenCalledWith(
      '1 playlist, 5 tracks exported to Traktor',
      expect.objectContaining({ kind: 'success' }),
    )
  })

  it('the arrow keys move between the programs', async () => {
    await open(null)
    await act(async () => {
      tab('Rekordbox').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(tab('Traktor').getAttribute('aria-selected')).toBe('true')
  })

  it('a last program without a tab here opens on Rekordbox', async () => {
    vi.mocked(tauriApi.djExportLastTarget).mockResolvedValue('serato')
    await open(null)
    expect(tab('Rekordbox').getAttribute('aria-selected')).toBe('true')
  })
})
```

- [ ] **Step 3: Run them to see the new ones fail**

Run: `npx vitest run src/components/DjExportModal.test.tsx`
Expected: the tab tests fail (no `[role="tab"]`), and the first test fails on `tab('Rekordbox')`. The others pass.

- [ ] **Step 4: Write the dialog (whole file)**

Run `cat > src/components/DjExportModal.tsx <<'TSXEOF'` with this content, then `TSXEOF`:

```tsx
// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// a tab per program, the playlist tree with boxes, where the file goes, how to
// load it, and the export. Each tab keeps its own checks and file while the
// dialog is open. Serato's tab comes with phase 3.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { toast } from '../lib/toast'
import { tabKeyTarget, useTabThumb } from '../lib/useTabThumb'
import { getErrorMessage } from '../types/ai'
import type { DjExportDefaults, DjTarget } from '../types/djExport'
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

/** The programs on the tab bar, in order. */
const PROGRAMS = ['rekordbox', 'traktor'] as const
type Program = (typeof PROGRAMS)[number]

const LABELS: Record<Program, string> = { rekordbox: 'Rekordbox', traktor: 'Traktor' }

const isProgram = (target: DjTarget | null): target is Program => PROGRAMS.some((program) => program === target)

const REVEAL_LABEL = navigator.userAgent.includes('Windows') ? 'Show in Explorer' : 'Show in Finder'

/** A program's tab: its checks and its file, kept while the dialog is open. */
interface ProgramTab {
  selected: Set<number>
  path: string
  defaults: DjExportDefaults
}

interface DjExportModalProps {
  /** The playlist or folder whose menu opened it; null from elsewhere. */
  openedFrom: number | null
  onClose: () => void
}

export function DjExportModal({ openedFrom, onClose }: DjExportModalProps) {
  const [tree, setTree] = useState<ExportTreeNode[] | null>(null)
  const [program, setProgram] = useState<Program>('rekordbox')
  const [tabs, setTabs] = useState<Record<Program, ProgramTab> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Esc closes it, as the backdrop and Cancel do — not while it writes.
  useOverlay(true, () => {
    if (!running) onClose()
  })

  // Menus hand focus back to whatever opened them, expecting a dialog to take it.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    let live = true
    Promise.all([
      tauriApi.getAllPlaylists(),
      Promise.all(PROGRAMS.map((target) => tauriApi.djExportDefaults(target))),
      // Which tab opens is a nicety: without it, Rekordbox's does.
      tauriApi.djExportLastTarget().catch(() => null),
    ])
      .then(([playlists, defaults, last]) => {
        if (!live) return
        const built = buildTree(playlists)
        const opened = {} as Record<Program, ProgramTab>
        PROGRAMS.forEach((target, i) => {
          opened[target] = {
            selected: initialSelection(built, defaults[i].playlist_ids, openedFrom),
            path: defaults[i].path,
            defaults: defaults[i],
          }
        })
        setTree(built)
        setTabs(opened)
        if (isProgram(last)) setProgram(last)
      })
      .catch((err) => {
        if (live) setLoadError(getErrorMessage(err))
      })
    return () => {
      live = false
    }
  }, [openedFrom])

  const tab = tabs?.[program] ?? null

  /** Changes the open tab, leaving the others as they are. */
  function updateTab(change: (tab: ProgramTab) => Partial<ProgramTab>) {
    setTabs((all) => all && { ...all, [program]: { ...all[program], ...change(all[program]) } })
  }

  function chooseProgram(next: Program) {
    setError(null)
    setProgram(next)
  }

  async function changePath() {
    if (!tab) return
    setError(null)
    try {
      const picked = await tauriApi.pickDjExportFile(program, tab.path)
      if (picked) updateTab(() => ({ path: picked }))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleExport() {
    if (!tree || !tab) return
    setError(null)
    setRunning(true)
    try {
      const result = await tauriApi.exportToDj(program, selectedInOrder(tree, tab.selected), tab.path)
      const { message, kind, detail } = resultToast(result, LABELS[program])
      const written = result.written[0]
      toast(message, {
        kind,
        detail,
        action: written ? { label: REVEAL_LABEL, run: () => void revealItemInDir(written).catch((e) => toast(getErrorMessage(e), { kind: 'error' })) } : undefined,
      })
      onClose()
    } catch (err) {
      setRunning(false)
      setError(getErrorMessage(err))
    }
  }

  const count = tree && tab ? selectedInOrder(tree, tab.selected).length : 0

  return (
    <div className="modal-overlay" onClick={() => !running && onClose()}>
      <div
        className="modal-content dj-export"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        aria-labelledby="dj-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dj-export-title">Export to DJ software</h3>

        <ProgramTabs program={program} disabled={running} onProgram={chooseProgram} />

        <div role="tabpanel" id="dj-export-panel" aria-labelledby={`dj-export-tab-${program}`}>
          <div className="dj-export__label">Playlists</div>
          <div className="dj-export__tree">
            {loadError ? (
              <p className="dj-export__note dj-export__note--error">{loadError}</p>
            ) : tree === null || tab === null ? (
              <p className="dj-export__note">Loading…</p>
            ) : tree.length === 0 ? (
              <p className="dj-export__note">No playlists yet.</p>
            ) : (
              <TreeRows
                nodes={tree}
                depth={0}
                selected={tab.selected}
                disabled={running}
                onToggle={(node) => updateTab((current) => ({ selected: toggle(node, current.selected) }))}
              />
            )}
          </div>

          <div className="dj-export__label">Where</div>
          <div className="dj-export__where">
            <PathText path={tab?.path ?? ''} />
            <button
              type="button"
              className="btn"
              onClick={() => void changePath()}
              disabled={running || tab === null}
            >
              Change…
            </button>
          </div>

          {tab && program === 'rekordbox' && (
            <RekordboxHowTo full={!tab.defaults.remembered || tab.path !== tab.defaults.path} />
          )}
          {tab && program === 'traktor' && <TraktorHowTo />}
        </div>

        {error && (
          <p className="dj-export__error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            working={running}
            workingLabel="Exporting…"
            disabled={count === 0 || !tab?.path}
          >
            {count > 0 ? `Export ${count} ${count === 1 ? 'playlist' : 'playlists'}` : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The programs as one bar, the chosen one on a thumb that glides to it (the shared .tabs). */
function ProgramTabs({
  program,
  disabled,
  onProgram,
}: {
  program: Program
  disabled: boolean
  onProgram: (program: Program) => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  const thumb = useTabThumb(bar, program)
  return (
    <div className="tabs dj-export__tabs" role="tablist" aria-label="Program" ref={bar}>
      <span className="tabs__thumb" aria-hidden="true" style={thumb} />
      {PROGRAMS.map((target, i) => (
        <button
          type="button"
          role="tab"
          key={target}
          id={`dj-export-tab-${target}`}
          aria-controls="dj-export-panel"
          aria-selected={program === target}
          tabIndex={program === target ? 0 : -1}
          className="tabs__tab"
          disabled={disabled}
          onClick={() => onProgram(target)}
          onKeyDown={(event) => {
            const next = tabKeyTarget(event.key, i, PROGRAMS.length)
            if (next === null) return
            event.preventDefault()
            onProgram(PROGRAMS[next])
            document.getElementById(`dj-export-tab-${PROGRAMS[next]}`)?.focus()
          }}
        >
          {LABELS[target]}
        </button>
      ))}
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
  useLayoutEffect(() => {
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

/** The file's path; when it is long the folder part gives way and the file name stays in view. */
function PathText({ path }: { path: string }) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1
  return (
    <span className="dj-export__path" title={path}>
      <span className="dj-export__path-folder">{path.slice(0, cut)}</span>
      <span className="dj-export__path-file">{path.slice(cut)}</span>
    </span>
  )
}

/** How to load the file in Rekordbox: every step until the first export or when the file goes somewhere new, then the one that repeats. */
// Checked in Rekordbox 7.2.19: importing again adds new tracks and duplicates nothing, but
// tracks already in its collection keep Rekordbox's own data.
const KEEPS_ITS_OWN = 'Tracks Rekordbox already has keep its own BPM, key and rating; new tracks take RecoDeck’s.'

function RekordboxHowTo({ full }: { full: boolean }) {
  if (!full) {
    return (
      <p className="dj-export__howto">
        In Rekordbox, refresh “rekordbox xml” and import the playlists again. {KEEPS_ITS_OWN}
      </p>
    )
  }
  return (
    <>
      <ol className="dj-export__howto dj-export__howto--steps">
        <li>In Rekordbox, Preferences → View → Layout: turn on “rekordbox xml”.</li>
        <li>Preferences → Advanced → Database → rekordbox xml → Imported Library: choose this file.</li>
        <li>Refresh “rekordbox xml” in the tree, then right-click a playlist → Import Playlist.</li>
      </ol>
      <p className="dj-export__howto dj-export__howto--note">{KEEPS_ITS_OWN}</p>
    </>
  )
}

/** How to load the file in Traktor. What Traktor does with tracks it already has is checked by hand. */
function TraktorHowTo() {
  return <p className="dj-export__howto">In Traktor, right-click Playlists → Import Playlist and choose this file.</p>
}
```

- [ ] **Step 5: The tab bar's spacing**

In `src/components/DjExportModal.css`, after the `.dj-export:focus { … }` rule, add (Edit tool is fine):

```css
/* The program tabs sit between the title and the tree. */
.dj-export__tabs {
  margin-bottom: 16px;
}

/* While it writes, the tabs stay where they are. */
.dj-export__tabs .tabs__tab:disabled {
  cursor: default;
}
```

- [ ] **Step 6: Run the tests, types and lint**

Run: `npx vitest run src/components/DjExportModal.test.tsx src/lib/djExport && npx tsc --noEmit && npx eslint src mobile`
Expected:
- vitest: all 12 dialog tests and the selection tests pass;
- tsc: no output;
- eslint: 28 problems (the baseline), no new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tauri-api.ts src/components/DjExportModal.tsx src/components/DjExportModal.test.tsx src/components/DjExportModal.css
git commit -m "feat(export): Rekordbox and Traktor tabs in the export dialog, each with its own playlists and file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, full checks and a look at the dialog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-10-09-dj-export-design.md`

- [ ] **Step 1: CHANGELOG**

Run:

```bash
python3 - <<'PYEOF'
import pathlib
p = pathlib.Path('CHANGELOG.md')
s = p.read_text()
old = "and RecoDeck writes them for Rekordbox with their tracks' BPM, key, rating, genre and comments; it remembers the playlists and the file, so exporting again is one click"
new = "and RecoDeck writes them for Rekordbox or Traktor with their tracks' BPM, key, rating, genre and comments; it remembers the playlists and the file for each program and opens on the one you used last, so exporting again is one click"
assert s.count(old) == 1
p.write_text(s.replace(old, new))
PYEOF
```

- [ ] **Step 2: The spec records what was settled**

Run:

```bash
python3 - <<'PYEOF'
import pathlib
p = pathlib.Path('docs/superpowers/specs/2026-10-09-dj-export-design.md')
s = p.read_text()
edits = [
    ("""  `.tabs` with the thumb). The last one used is remembered. (Phase 1 has
  only Rekordbox: no tab bar; the tabs and `dj_export.last_target` come with
  Traktor in phase 2.) Each program keeps""",
     """  `.tabs` with the thumb). The last one used is remembered
  (`dj_export.last_target`). Rekordbox and Traktor since phase 2; Serato's
  tab comes with phase 3. Each program keeps"""),
    ("""- to Traktor's integer. Assumed: 0–11 = C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯,
  B major; 12–23 = the same roots minor. Checked against a real Traktor export
  before phase 2 is done.""",
     """- to Traktor's integer: 0–11 = C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯, B
  major; 12–23 = the same roots minor (checked against a Traktor 3.11.1
  collection, its Open Key text beside each value)."""),
    ("""  (`/:Users/:dj/:Music/:`), `FILE` the file name. The playlist's `PRIMARYKEY
  KEY` is `VOLUME` + `DIR` + `FILE`. XML attribute escaping applies on top.""",
     """  (`/:Users/:dj/:Music/:`), `FILE` the file name. The playlist's `PRIMARYKEY
  KEY` is `VOLUME` + `DIR` + `FILE`. XML attribute escaping applies on top,
  with `'` left raw as Traktor writes it. Files under `/Users` are on the boot
  volume ("Macintosh HD", the `/Volumes` entry that links to `/`), and
  `VOLUMEID` repeats `VOLUME`. Names are written NFC: Traktor 3.11.1 does so
  even when a name is decomposed on disk, and in another form a track would
  be new to it."""),
    ("""duplicates a playlist imported again is checked by hand; the Traktor help line
says what to do. `INFO BITRATE` uses the unit the real export uses (likely bps,
i.e. kbps × 1000); `VOLUMEID` is written if the real export shows Traktor needs
it. Shape follows a real Traktor playlist export (Verification).""",
     """duplicates a playlist imported again is checked by hand; the Traktor help line
says what to do. The shape follows Traktor 3.11.1's own files (a sanitized one
is the fixture `traktor_real.nml`): no self-closing tags, a line break after
each closing tag, `<SETS ENTRIES="0"></SETS>` before the playlists.
`INFO BITRATE` is in bit/s, `FILESIZE` in KiB, `RANKING` stars × 51, dates
`yyyy/m/d`, `RELEASE_DATE` `yyyy/1/1` from the year; values RecoDeck lacks are
left out, as Traktor does. Not written: `MODIFIED_DATE` (Traktor would take the
entry as newer than its own data), `FLAGS`, `LOCK`, `INFO KEY` (a tag's key
text), cues and loudness."""),
    ("""- Traktor: the key integers; `INFO BITRATE` unit; `VOLUMEID`; the volume name
  for files under `/Users` ("Macintosh HD" or "Macintosh HD - Data"); what a
  second import of the same playlist does.""",
     """- Traktor: ~~the key integers~~ ✓; ~~`INFO BITRATE` unit~~ ✓ bit/s;
  ~~`VOLUMEID`~~ ✓ repeats the volume name; ~~the volume name for files under
  `/Users`~~ ✓ "Macintosh HD"; ~~Unicode normalization~~ ✓ NFC (all from
  Traktor 3.11.1's own collection and history files); what a second import of
  the same playlist does."""),
    ("""- `traktor.rs` — `write(&ExportLibrary, volumes) -> String`.""",
     """- `traktor.rs` — `location(path, boot_volume)`, its path encoder, and
  `write(&ExportLibrary, boot_volume) -> String`."""),
    ("""- `paths.rs` — the per-format path encoders and the volume lookup (boot volume
  name, `/Volumes/<name>`, drive letters), the only part that asks the system.""",
     """- `volumes.rs` — the boot volume's name, the only part that asks the system.
  Each writer has its own path encoder (`rekordbox::location`,
  `traktor::location`)."""),
]
for old, new in edits:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)
p.write_text(s)
PYEOF
```

- [ ] **Step 3: Full checks**

Use the `test-runner` agent, or run these directly:
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo check`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx eslint src mobile` (28 problems, the baseline)
- `npm run build`

Expected: everything passes. Rust test count = 493 + the new ones; vitest count = 703 + the 4 new dialog tests.

- [ ] **Step 4: Look at the dialog in both themes**

Build a throwaway harness in the session scratchpad, not in the repo:
- an `index.html` + `main.tsx` that call `mockIPC` from `@tauri-apps/api/mocks`:
  - `get_all_playlists` returns the four playlists from the test;
  - `dj_export_defaults` returns, per target:
    - Traktor: `{ path: '/Users/dj/Music/RecoDeck/RecoDeck.nml', exists: true, playlist_ids: [3], remembered: true }`;
    - Rekordbox: the same shape with the `.xml` path and `playlist_ids: [4]`;
  - `get_setting` returns `"\"traktor\""` for `dj_export.last_target`;
- the same file renders `<DjExportModal openedFrom={2} onClose={() => {}} />`;
- it imports `@fontsource-variable/inter`, `src/styles/globals.css`, `src/styles/controls.css` and `src/components/TrackTable.css` (`.modal-content`);
- it sets `data-theme` on `<html>`.

Serve it with the project's Vite: a config with `root` set to the harness folder, the React plugin and `server.fs.allow` covering the repo. Then screenshot it with Playwright WebKit (`~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`) in `midnight` and `dawn`.

Check each screenshot:
- the tab bar sits between the title and "Playlists", left-aligned;
- the thumb is under Traktor;
- the tree shows Friday and Saturday checked;
- the path ends `RecoDeck.nml`;
- the how-to line mentions Import Playlist.

Click the Rekordbox tab and screenshot again: the thumb slides to Rekordbox and its checks show.

Fix anything that looks off, then delete the harness.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-10-09-dj-export-design.md
git commit -m "docs(export): Traktor in the changelog; the spec records what Traktor's own files settled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Check it in Traktor by hand (with the user)

The user runs this, in Traktor 3.11.1. Traktor keeps backups of its collection in `~/Documents/Native Instruments/Traktor 3.11.1/Backup`. An import adds the exported tracks to the user's real Traktor collection; say so before they start.

- [ ] **Step 1: Export**

In `tauri dev` (port 1430, see HANDOFF) or a build:
- open the dialog on the Traktor tab;
- pick two or three small playlists in a folder. Include, if the library has them, a track that is **already** in Traktor and one that is **not**, a name with an accent (é, č), and a track with a rating and a comment;
- press Export.

- [ ] **Step 2: Import in Traktor and note what happens**

Right-click **Playlists** → **Import Playlist** → choose `~/Music/RecoDeck/RecoDeck.nml`. Note:
1. Does a **RecoDeck** folder appear, with the folder tree and playlists inside?
2. Are all tracks found, with no missing-file marks, including the accented one?
3. On tracks **new** to Traktor: BPM, key (Key column), rating, comment, genre, label, import date?
4. On tracks Traktor **already had**: did its BPM, key or rating change, or did it keep its own? Is any track now in the collection twice?
5. Export again, then import again: a second copy of the playlists, or replaced in place?

- [ ] **Step 3: Settle the how-to and the spec**

From the answers:
- write `TraktorHowTo`'s line in `src/components/DjExportModal.tsx` (python replace), in the way the Rekordbox one says what happens to tracks it already has;
- update the expectation in `DjExportModal.test.tsx` if the text changes;
- in the spec, update "What it does not do" and the Traktor items of the verification list ("whether data reaches tracks it already has", "what a second import does").

If the answers show a problem (e.g. no folder tree, or duplicates), stop and bring it to the user with the evidence before changing the writer.

- [ ] **Step 4: Run the dialog tests and commit**

Run: `npx vitest run src/components/DjExportModal.test.tsx`

```bash
git add src/components/DjExportModal.tsx src/components/DjExportModal.test.tsx docs/superpowers/specs/2026-10-09-dj-export-design.md
git commit -m "fix(export): the Traktor how-to says what Traktor does with the import — checked in Traktor 3.11.1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

After this the phase is done. Releasing (0.6.0 with Rekordbox and Traktor, or after Serato) is the user's call.
