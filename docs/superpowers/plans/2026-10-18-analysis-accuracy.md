# Analysis Accuracy (BPM, Key, Beat Grid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure BPM and key detection against Traktor and Rekordbox, make both good enough to build on, store a beat grid (`first_beat_ms`), and let users re-analyze their library once.

**Architecture:** A development-only binary (`recodeck-eval`, behind the `eval` Cargo feature) runs the app's own decode, BPM and key functions on every file a Traktor collection knows and reports how close they come; its pure logic lives in the library (`formats::keys`, `formats::traktor`, `formats::rekordbox`, `audio::scoring`). BPM moves from hop-quantized beat intervals to a constant grid fitted through aubio's precise beat times, with an onset envelope (`audio::onset`) for the first beat and the confidence. Key loses its heuristics and is changed one measured step at a time. A migration adds `first_beat_ms` and `analysis_version`; one save per track, a needs-analysis rule, tag keys, and a once-per-version prompt finish it.

**Tech Stack:** Rust (Tauri 2, aubio via `bliss-audio-aubio-rs` 0.2.4, symphonia 0.5, rustfft 6, rusqlite 0.31, lofty 0.22, rayon, rand 0.8, `roxmltree` new and optional), React + TypeScript (vitest).

**Spec:** `docs/superpowers/specs/2026-10-17-analysis-accuracy-design.md`. When this plan and the spec disagree, the spec wins; say so in the task report.

---

## Before you start

- Branch: `feat/analysis-accuracy` (already checked out). Never merge or push.
- **Phases and checkpoints.** The plan has four phases. Each ends with a **CHECKPOINT** task: stop there, report the numbers to the user (in Serbian), and wait for a go-ahead before the next phase.
- **Reference data (local, never committed).** The maintainer's Traktor `collection.nml` and Rekordbox `xml` export. Their paths are in `.claude/HANDOFF.md`. Set three variables in every shell that runs the tool:

  ```bash
  export TRAKTOR_NML="<path to collection.nml>"
  export REKORDBOX_XML="<path to the Rekordbox xml>"
  export EVAL_OUT="<a folder outside the repo, e.g. the session scratchpad>"
  ```

- **Running the tool** (from Task 5 on). One full run takes several minutes; give the shell a 10-minute timeout.

  ```bash
  cd src-tauri && cargo run --release --features eval --bin recodeck-eval -- \
    --traktor "$TRAKTOR_NML" --rekordbox "$REKORDBOX_XML" --csv "$EVAL_OUT/<run>.csv" \
    > "$EVAL_OUT/<run>.txt"
  ```

- **Results.** After every measured run, add a row to the Results table at the end of this file and commit it with the task. Aggregate percentages only.
- **Privacy (public repo).** No track names, file paths or collection files in commits, docs, tests or fixtures. The CSV and the report stay in `$EVAL_OUT`.
- **Commits.** Stage files by name (never `git add -A`). Never commit `.planning/`, `.claude/`, `.mcp.json`. End every commit message with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- **Formatter hook gotcha.** An Edit on `src/App.tsx` or `src/components/settings/SettingsContext.tsx` makes the hook reformat the whole file. Change those two files only with the Python scripts given in Task 31.
- **Checks.** Rust: `cd src-tauri && cargo test --lib`. Eval binary: `cd src-tauri && cargo check --features eval --bin recodeck-eval`. Frontend: `npx tsc --noEmit`, `npx vitest run`, `npm run lint` (9 errors exist before this work; add none).

## File map

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/src/formats/keys.rs` | modify | `camelot_from_traktor`, `camelot_from_tag`, `open_key`; `parse_camelot` becomes `pub(crate)` |
| `src-tauri/src/formats/traktor.rs` | modify | `path_from_location` (inverse of `location`) |
| `src-tauri/src/formats/rekordbox.rs` | modify | `path_from_location` (inverse of `location`) |
| `src-tauri/src/audio/scoring.rs` | create | BPM, key and grid measures for the report |
| `src-tauri/src/bin/recodeck-eval.rs` | create | the measurement tool |
| `src-tauri/Cargo.toml` | modify | `eval` feature, optional `roxmltree`, `[[bin]]` |
| `src-tauri/src/audio/test_signals.rs` | create | synthetic kick tracks for tests |
| `src-tauri/src/audio/onset.rs` | create | onset envelope: low/full-band flux, music sections, kick checks |
| `src-tauri/src/audio/bpm.rs` | modify | precise beats, grid fit, snap, first beat, confidence, `Option` result |
| `src-tauri/src/audio/decoder.rs` | modify | silence for undecodable packets; gapless setting |
| `src-tauri/src/audio/key.rs` | modify | frame chroma, heuristics removed, measured steps, Open Key from `formats::keys` |
| `src-tauri/src/audio/mod.rs` | modify | new modules; `ANALYSIS_VERSION`, `SECONDS_PER_TRACK` |
| `src-tauri/src/db/migrations/022_analysis_grid.sql` | create | `first_beat_ms`, `analysis_version`, clear `bpm = 0` |
| `src-tauri/src/db/analysis.rs` | create | save rules, tag save, needs-analysis rule and queries |
| `src-tauri/src/db/mod.rs` | modify | `pub mod analysis`; migration 022 guard |
| `src-tauri/src/db/home.rs` | modify | Home's no-BPM list gains the version condition |
| `src-tauri/src/db/merge.rs` | modify | duplicate merge: BPM and key move with their confidence; grid and version stay with their file |
| `src-tauri/src/commands/analysis.rs` | modify | four commands removed; batch uses the rule and one save; status commands |
| `src-tauri/src/scanner.rs`, `commands/library.rs`, `missing_files.rs`, `commands/playlists.rs` | modify | tag key read; tag values without confidence (one shared helper) |
| `src-tauri/src/lib.rs` | modify | command registration |
| `src/types/track.ts`, `src/lib/tauri-api.ts` | modify | `AnalysisStatus`, wrappers; removed wrappers |
| `src/lib/reanalysis.ts` (+ test) | create | prompt rule and Settings hint |
| `src/components/ReanalyzePrompt.tsx` (+ css, test) | create | the once-per-version prompt |
| `src/App.tsx`, `src/components/settings/SettingsContext.tsx` | modify (script) | prompt and re-analyze wiring |
| `src/components/settings/DatabaseSection.tsx` | modify | Re-analyze button and hint |

---

# Phase 1: the tool and the baseline (spec §1)

### Task 1: Key conversions for the references

**Files:**
- Modify: `src-tauri/src/formats/keys.rs`

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`)

```rust
    #[test]
    fn traktor_values_to_camelot_and_back() {
        for n in 1..=12 {
            for letter in ["A", "B"] {
                let code = format!("{n}{letter}");
                assert_eq!(camelot_from_traktor(traktor_key(&code).unwrap()).as_deref(), Some(code.as_str()));
            }
        }
        assert_eq!(camelot_from_traktor(21).as_deref(), Some("8A"));
        assert_eq!(camelot_from_traktor(0).as_deref(), Some("8B"));
        assert_eq!(camelot_from_traktor(24), None);
    }

    #[test]
    fn key_tags_in_every_accepted_form() {
        for (tag, camelot) in [
            ("8A", "8A"), ("08a", "8A"), (" 12b ", "12B"),
            ("1m", "8A"), ("6d", "1B"), ("11d", "6B"), ("6m", "1A"), ("10m", "5A"), ("5m", "12A"), ("12m", "7A"),
            ("Am", "8A"), ("A minor", "8A"), ("Amin", "8A"), ("F#m", "11A"), ("Gbm", "11A"),
            ("F♯m", "11A"), ("G♭ minor", "11A"), ("Ebm", "2A"), ("bbm", "3A"),
            ("C", "8B"), ("C major", "8B"), ("Cmaj", "8B"), ("Db", "3B"), ("D♭", "3B"), ("C#", "3B"),
        ] {
            assert_eq!(camelot_from_tag(tag).as_deref(), Some(camelot), "{tag:?}");
        }
    }

    #[test]
    fn every_rekordbox_name_reads_back() {
        for n in 1..=12 {
            assert_eq!(camelot_from_tag(MINOR[n - 1]), Some(format!("{n}A")));
            assert_eq!(camelot_from_tag(MAJOR[n - 1]), Some(format!("{n}B")));
        }
    }

    #[test]
    fn other_key_tags_are_ignored() {
        for bad in ["", "0A", "13A", "8C", "8", "13m", "0d", "H", "Hm", "Am7", "Cmaj7", "C##", "m", "#", "o", "Ab minorr", "1 2A"] {
            assert_eq!(camelot_from_tag(bad), None, "{bad:?}");
        }
    }
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd src-tauri && cargo test --lib formats::keys`
Expected: compile error, `camelot_from_traktor` and `camelot_from_tag` not found.

- [ ] **Step 3: Implement** (after `traktor_key`; also make `parse_camelot` `pub(crate)`, `audio::scoring` uses it)

```rust
/// Traktor's MUSICAL_KEY value to Camelot (21 → "8A"); None outside 0–23.
pub fn camelot_from_traktor(value: u8) -> Option<String> {
    let (table, letter) = match value {
        0..=11 => (&TRAKTOR_MAJOR, 'B'),
        12..=23 => (&TRAKTOR_MINOR, 'A'),
        _ => return None,
    };
    let number = table.iter().position(|&v| v == value)? + 1;
    Some(format!("{number}{letter}"))
}

/// A key tag as DJ software writes it, to Camelot: Camelot ("8A", "08a"),
/// Open Key ("1m", "6d") or a name ("Am", "A minor", "Amin", "F#m", "Gbm",
/// "C", "C major", "Cmaj", "Db", with ♯/♭ too). None for anything else.
pub fn camelot_from_tag(tag: &str) -> Option<String> {
    let tag = tag.trim();
    if tag.starts_with(|c: char| c.is_ascii_digit()) {
        let letter = tag.chars().last()?;
        let number: usize = tag[..tag.len() - letter.len_utf8()].parse().ok()?;
        if !(1..=12).contains(&number) {
            return None;
        }
        // Open Key counts from C (1d) where Camelot counts from B (1B): 1d is 8B.
        let from_open = (number + 6) % 12 + 1;
        return match letter.to_ascii_uppercase() {
            'A' => Some(format!("{number}A")),
            'B' => Some(format!("{number}B")),
            'M' => Some(format!("{from_open}A")),
            'D' => Some(format!("{from_open}B")),
            _ => None,
        };
    }
    let mut chars = tag.chars();
    let root = match chars.next()?.to_ascii_uppercase() {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return None,
    };
    let rest = chars.as_str();
    let (shift, rest) = match rest.chars().next() {
        Some(c @ ('#' | '♯')) => (1, &rest[c.len_utf8()..]),
        Some(c @ ('b' | '♭')) => (11, &rest[c.len_utf8()..]),
        _ => (0, rest),
    };
    let minor = match rest.trim().to_ascii_lowercase().as_str() {
        "" | "maj" | "major" => false,
        "m" | "min" | "minor" => true,
        _ => return None,
    };
    let pitch = (root + shift) % 12;
    // A minor key has its relative major's number: three semitones up.
    let number = camelot_number(if minor { (pitch + 3) % 12 } else { pitch });
    Some(format!("{number}{}", if minor { 'A' } else { 'B' }))
}

/// The Camelot number of the major key on pitch class `pitch`: C (0) is 8,
/// and each fifth up (7 semitones) is one more.
fn camelot_number(pitch: usize) -> usize {
    (7 * pitch + 7) % 12 + 1
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd src-tauri && cargo test --lib formats::keys`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/keys.rs
git commit -m "feat(keys): read Traktor key values and key tags as Camelot"
```

### Task 2: Collection paths back to files

**Files:**
- Modify: `src-tauri/src/formats/traktor.rs`, `src-tauri/src/formats/rekordbox.rs`

- [ ] **Step 1: Write the failing tests**

In `traktor.rs` `mod tests` (it already has `const BOOT`, "Macintosh HD"):

```rust
    #[test]
    fn a_location_leads_back_to_its_file() {
        for path in ["/Users/dj/Music/a.mp3", "/Volumes/USB Stick/Sets/b.aiff", "/Volumes/USB/a.mp3", "d:/x.mp3", "/m/\u{10D}/\u{10D}.mp3"] {
            let at = location(path, BOOT);
            assert_eq!(path_from_location(&at.volume, &at.dir, &at.file, BOOT), path);
        }
    }

    #[test]
    fn a_traktor_entry_names_its_file() {
        // As Traktor 3.11.1 writes a LOCATION.
        assert_eq!(
            path_from_location("Macintosh HD", "/:Users/:dj/:Music/:Deep House/:", "a b.mp3", BOOT),
            "/Users/dj/Music/Deep House/a b.mp3"
        );
        assert_eq!(path_from_location("USB", "/:Sets/:", "c.wav", BOOT), "/Volumes/USB/Sets/c.wav");
    }
```

In `rekordbox.rs` `mod tests`:

```rust
    #[test]
    fn a_location_leads_back_to_its_file() {
        for path in ["/Users/dj/Music/a.mp3", "/Users/dj/Mü sic/[x] (1), y%.mp3", "C:/Music/a.mp3"] {
            assert_eq!(path_from_location(&location(path)).as_deref(), Some(path));
        }
    }

    #[test]
    fn rekordbox_urls_decode() {
        assert_eq!(
            path_from_location("file://localhost/Users/dj/Deep%20House/a%c4%8d.mp3").as_deref(),
            Some("/Users/dj/Deep House/ač.mp3")
        );
        assert_eq!(path_from_location("file://localhost/Users/dj/a%20b%2Bc+d.mp3").as_deref(), Some("/Users/dj/a b+c+d.mp3"));
        assert_eq!(path_from_location("http://example.com/a.mp3"), None);
        assert_eq!(path_from_location("file://localhost/bad%ff.mp3"), None);
    }
```

- [ ] **Step 2: Run to see them fail**

Run: `cd src-tauri && cargo test --lib formats::`
Expected: compile error, `path_from_location` not found.

- [ ] **Step 3: Implement**

`traktor.rs`, after `location`:

```rust
/// The file a Traktor LOCATION names, the inverse of `location`: DIR's `/:`
/// become `/`, a Windows drive stays in front, and a volume other than the
/// boot volume is a drive under /Volumes. NFC, as Traktor writes names.
pub fn path_from_location(volume: &str, dir: &str, file: &str, boot_volume: &str) -> String {
    let folders: String = dir.split("/:").filter(|f| !f.is_empty()).map(|f| format!("/{f}")).collect();
    let rest = format!("{folders}/{file}");
    let volume: String = volume.nfc().collect();
    let path = if matches!(volume.as_bytes(), [l, b':'] if l.is_ascii_alphabetic()) {
        format!("{volume}{rest}")
    } else if volume.is_empty() || volume == boot_volume.nfc().collect::<String>() {
        rest
    } else {
        format!("/Volumes/{volume}{rest}")
    };
    path.nfc().collect()
}
```

`rekordbox.rs`, after `location` (`urlencoding` is already a dependency; it leaves `+` alone):

```rust
/// The file a Rekordbox `Location` names, the inverse of `location`:
/// `file://localhost` dropped and percent escapes decoded. A Windows path
/// keeps its drive ("file://localhost/C:/a.mp3" → "C:/a.mp3"). None for
/// anything else, or escapes that are not UTF-8.
pub fn path_from_location(url: &str) -> Option<String> {
    let path = urlencoding::decode(url.strip_prefix("file://localhost")?).ok()?.into_owned();
    let windows = matches!(path.as_bytes(), [b'/', l, b':', ..] if l.is_ascii_alphabetic());
    Some(if windows { path[1..].to_string() } else { path })
}
```

- [ ] **Step 4: Run to see them pass**

Run: `cd src-tauri && cargo test --lib formats::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/traktor.rs src-tauri/src/formats/rekordbox.rs
git commit -m "feat(formats): read Traktor and Rekordbox locations back into paths"
```

### Task 3: Scoring measures

**Files:**
- Create: `src-tauri/src/audio/scoring.rs`
- Modify: `src-tauri/src/audio/mod.rs` (add `pub mod scoring;`)

- [ ] **Step 1: Write the module with its tests, functions unimplemented**

Create `scoring.rs` with the types and signatures below, each body `todo!()`, plus the tests. Add `pub mod scoring;` to `audio/mod.rs`.

```rust
// src-tauri/src/audio/scoring.rs
// How close an analysis is to a reference (spec 2026-10-17, §1): the
// measures recodeck-eval reports. They live in the library so plain
// `cargo test` covers them.

use crate::formats::keys::parse_camelot;

/// How our BPM compares with the reference's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BpmMatch {
    /// Within ±0.05.
    Exact,
    /// Within ±0.5.
    Close,
    /// 0.5 to 1.5 off.
    OffByOne,
    /// Half or double the reference (within 1 BPM at the doubled tempo).
    HalfOrDouble,
    Other,
}

/// Labels of `signed_bucket`'s buckets, in order.
pub const SIGNED_BUCKETS: [&str; 7] =
    ["< -1.5", "-1.5 to -0.5", "-0.5 to -0.05", "±0.05", "0.05 to 0.5", "0.5 to 1.5", "> 1.5"];

/// How our key relates to the reference key, both in Camelot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeyMatch {
    Exact,
    /// One step round the wheel in the same mode: a fifth up or down.
    Fifth,
    /// The relative major or minor: same number, other letter.
    Relative,
    /// Same root, other mode (Am and A).
    Parallel,
    Other,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bpm_matches() {
        assert_eq!(bpm_match(124.04, 124.0), BpmMatch::Exact);
        assert_eq!(bpm_match(124.4, 124.0), BpmMatch::Close);
        assert_eq!(bpm_match(122.9, 124.0), BpmMatch::OffByOne);
        assert_eq!(bpm_match(248.5, 124.0), BpmMatch::HalfOrDouble);
        assert_eq!(bpm_match(62.2, 124.0), BpmMatch::HalfOrDouble);
        assert_eq!(bpm_match(130.0, 124.0), BpmMatch::Other);
    }

    #[test]
    fn signed_buckets() {
        let buckets: Vec<usize> = [-2.0, -1.0, -0.2, -0.05, 0.0, 0.05, 0.2, 1.0, 2.0].iter().map(|&e| signed_bucket(e)).collect();
        assert_eq!(buckets, vec![0, 1, 2, 3, 3, 3, 4, 5, 6]);
    }

    #[test]
    fn key_relations() {
        assert_eq!(key_match("8A", "8A"), Some(KeyMatch::Exact));
        assert_eq!(key_match("9A", "8A"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("7A", "8A"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("1B", "12B"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("8B", "8A"), Some(KeyMatch::Relative));
        assert_eq!(key_match("11B", "8A"), Some(KeyMatch::Parallel)); // A major against A minor
        assert_eq!(key_match("8A", "11B"), Some(KeyMatch::Parallel));
        assert_eq!(key_match("2A", "8A"), Some(KeyMatch::Other));
        assert_eq!(key_match("Am", "8A"), None);
    }

    #[test]
    fn mirex_weights() {
        assert_eq!(mirex_score("8A", "8A"), Some(1.0));
        assert_eq!(mirex_score("9A", "8A"), Some(0.5)); // a fifth above the reference
        assert_eq!(mirex_score("7A", "8A"), Some(0.0)); // a fifth below scores nothing (mir_eval's default)
        assert_eq!(mirex_score("8B", "8A"), Some(0.3));
        assert_eq!(mirex_score("11B", "8A"), Some(0.2));
        assert_eq!(mirex_score("2A", "8A"), Some(0.0));
    }

    #[test]
    fn grid_offsets() {
        // 120 BPM: a beat every 500 ms from 100 ms.
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_600.0), 0.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_590.0), 10.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_620.0), -20.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 40.0), 60.0);
    }

    #[test]
    fn bar_offsets() {
        assert_eq!(bar_offset(120.0, 100.0, 2_100.0), 0);
        assert_eq!(bar_offset(120.0, 100.0, 600.0), 1);
        assert_eq!(bar_offset(120.0, 100.0, -400.0), 3);
    }

    #[test]
    fn rekordbox_downbeats() {
        assert_eq!(downbeat_ms(1_000.0, 1, 120.0), 1_000.0);
        assert_eq!(downbeat_ms(1_000.0, 3, 120.0), 0.0);
    }

    #[test]
    fn medians() {
        assert_eq!(median(&mut []), None);
        assert_eq!(median(&mut [3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&mut [4.0, 1.0, 2.0, 3.0]), Some(2.5));
    }
}
```

- [ ] **Step 2: Run to see them fail**

Run: `cd src-tauri && cargo test --lib audio::scoring`
Expected: tests panic at `todo!()` (or fail to compile until the signatures exist; then panic).

- [ ] **Step 3: Implement**

```rust
pub fn bpm_match(ours: f64, reference: f64) -> BpmMatch {
    let off = (ours - reference).abs();
    if off <= 0.05 {
        BpmMatch::Exact
    } else if off <= 0.5 {
        BpmMatch::Close
    } else if off <= 1.5 {
        BpmMatch::OffByOne
    } else if (ours - 2.0 * reference).abs() <= 1.0 || (2.0 * ours - reference).abs() <= 1.0 {
        BpmMatch::HalfOrDouble
    } else {
        BpmMatch::Other
    }
}

/// Which `SIGNED_BUCKETS` bucket a BPM error (ours − reference) falls in.
pub fn signed_bucket(error: f64) -> usize {
    match error {
        e if e < -1.5 => 0,
        e if e < -0.5 => 1,
        e if e < -0.05 => 2,
        e if e <= 0.05 => 3,
        e if e <= 0.5 => 4,
        e if e <= 1.5 => 5,
        _ => 6,
    }
}

/// None when either is not a Camelot code.
pub fn key_match(ours: &str, reference: &str) -> Option<KeyMatch> {
    let (n, minor) = parse_camelot(ours)?;
    let (r, reference_minor) = parse_camelot(reference)?;
    Some(if n == r && minor == reference_minor {
        KeyMatch::Exact
    } else if minor == reference_minor && (wheel_step(r, n) == 1 || wheel_step(n, r) == 1) {
        KeyMatch::Fifth
    } else if n == r {
        KeyMatch::Relative
    } else if minor != reference_minor && (if minor { wheel_step(n, r) } else { wheel_step(r, n) }) == 3 {
        // A major key's number is its parallel minor's plus three (Am 8A, A 11B).
        KeyMatch::Parallel
    } else {
        KeyMatch::Other
    })
}

/// The MIREX weighted score as mir_eval computes it by default: exact 1, our
/// key a fifth above the reference in the same mode 0.5, relative 0.3,
/// parallel 0.2, anything else 0.
pub fn mirex_score(ours: &str, reference: &str) -> Option<f64> {
    let (n, _) = parse_camelot(ours)?;
    let (r, _) = parse_camelot(reference)?;
    Some(match key_match(ours, reference)? {
        KeyMatch::Exact => 1.0,
        KeyMatch::Fifth if wheel_step(r, n) == 1 => 0.5,
        KeyMatch::Relative => 0.3,
        KeyMatch::Parallel => 0.2,
        _ => 0.0,
    })
}

/// Steps clockwise from `from` to `to` on the 12-number wheel.
fn wheel_step(from: usize, to: usize) -> usize {
    (to + 12 - from) % 12
}

/// The signed distance in ms from a reference grid marker to the nearest beat
/// of our grid (`bpm`, a beat at `first_beat_ms`); positive when ours is later.
pub fn grid_offset_ms(bpm: f64, first_beat_ms: f64, marker_ms: f64) -> f64 {
    let beat_ms = 60_000.0 / bpm;
    let beats = ((marker_ms - first_beat_ms) / beat_ms).round();
    first_beat_ms + beats * beat_ms - marker_ms
}

/// Which beat of our 4-beat bar (counted from `first_beat_ms`) a reference
/// downbeat lands on: 0 when the bars agree.
pub fn bar_offset(bpm: f64, first_beat_ms: f64, downbeat_ms: f64) -> u8 {
    let beat_ms = 60_000.0 / bpm;
    (((downbeat_ms - first_beat_ms) / beat_ms).round() as i64).rem_euclid(4) as u8
}

/// Rekordbox's downbeat: its marker at `marker_ms` is beat `beat_in_bar` (Battito, 1–4).
pub fn downbeat_ms(marker_ms: f64, beat_in_bar: u32, bpm: f64) -> f64 {
    marker_ms - beat_in_bar.saturating_sub(1) as f64 * 60_000.0 / bpm
}

/// The median (of the middle two for an even count); None for no values.
pub fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let mid = values.len() / 2;
    Some(if values.len() % 2 == 0 { (values[mid - 1] + values[mid]) / 2.0 } else { values[mid] })
}
```

- [ ] **Step 4: Run to see them pass**

Run: `cd src-tauri && cargo test --lib audio::scoring`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/scoring.rs src-tauri/src/audio/mod.rs
git commit -m "feat(audio): scoring measures for BPM, key and grid against a reference"
```

### Task 4: `BpmResult` gains `first_beat_ms`

**Files:**
- Modify: `src-tauri/src/audio/bpm.rs`

No behaviour changes: the field is `None` until Phase 2. It lets the tool's grid report compile now.

- [ ] **Step 1: Add the field**

```rust
pub struct BpmResult {
    /// Detected BPM (beats per minute)
    pub bpm: f64,
    /// Confidence score (0.0 to 1.0) — higher means more reliable detection
    pub confidence: f64,
    /// A grid beat that starts a bar, in ms from the file's start (spec
    /// 2026-10-17, §2). None until the grid is detected.
    pub first_beat_ms: Option<f64>,
}
```

Add `first_beat_ms: None` to every `BpmResult { .. }` literal in `bpm.rs` (in `detect_bpm_from_samples` and `pick_consensus`).

- [ ] **Step 2: Build and test**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: PASS. If another file builds a `BpmResult`, add the field there too (`grep -rn "BpmResult {" src-tauri/src`).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/audio/bpm.rs
git commit -m "refactor(bpm): BpmResult carries first_beat_ms (none yet)"
```

### Task 5: The `recodeck-eval` binary

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/bin/recodeck-eval.rs`

- [ ] **Step 1: Cargo feature and target**

In `[dependencies]` add (check the newest 0.x with `cargo search roxmltree --limit 1` and use it if it is newer):

```toml
# recodeck-eval only (feature "eval"): reads Traktor and Rekordbox collections.
roxmltree = { version = "0.20", optional = true }
```

Add at the end of `Cargo.toml`:

```toml
[features]
eval = ["dep:roxmltree"]

[[bin]]
name = "recodeck-eval"
path = "src/bin/recodeck-eval.rs"
required-features = ["eval"]
```

- [ ] **Step 2: Write the binary**

```rust
//! recodeck-eval: measures BPM, key and beat-grid detection against the
//! values Traktor (and Rekordbox) stored for the same files. Development
//! only (spec docs/superpowers/specs/2026-10-17-analysis-accuracy-design.md,
//! §1): it never opens the library database, and its output names files, so
//! it stays on the machine that ran it.
//!
//! cargo run --release --features eval --bin recodeck-eval -- \
//!   --traktor <collection.nml> [--rekordbox <collection.xml>] \
//!   [--sample N] [--seed S] [--min-seconds N] [--csv <out.csv>]

use rand::{rngs::StdRng, seq::SliceRandom, SeedableRng};
use rayon::prelude::*;
use recodeck_lib::audio::bpm::{detect_bpm_from_samples, BpmResult};
use recodeck_lib::audio::decoder::decode_to_mono;
use recodeck_lib::audio::key::{detect_key_from_samples, KeyResult};
use recodeck_lib::audio::scoring::{self, BpmMatch, KeyMatch};
use recodeck_lib::formats::{keys, rekordbox, traktor, volumes};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

const USAGE: &str = "usage: recodeck-eval --traktor <collection.nml> [--rekordbox <collection.xml>] \
[--sample N] [--seed S] [--min-seconds N] [--csv <out.csv>]";

struct Args {
    traktor: PathBuf,
    rekordbox: Option<PathBuf>,
    sample: Option<usize>,
    seed: u64,
    /// Files shorter than this (loops, one-shots) are decoded but not measured.
    min_seconds: f64,
    csv: Option<PathBuf>,
}

/// What the DJ programs stored for one file.
#[derive(Debug, Clone, Default)]
struct Reference {
    traktor_bpm: f64,
    traktor_key: Option<String>,
    /// Traktor's AutoGrid marker (CUE_V2 TYPE 4), ms: a downbeat.
    traktor_marker_ms: Option<f64>,
    rb_bpm: Option<f64>,
    rb_key: Option<String>,
    /// Rekordbox's first grid marker (TEMPO Inizio), ms, with its tempo.
    rb_marker_ms: Option<f64>,
    rb_marker_bpm: Option<f64>,
    /// Rekordbox's downbeat, from that marker and its Battito, ms.
    rb_downbeat_ms: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Mp3,
    Lossless,
    Other,
}

impl Format {
    fn of(path: &str) -> Format {
        let extension = Path::new(path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
        match extension.as_deref() {
            Some("mp3") => Format::Mp3,
            Some("wav" | "aif" | "aiff" | "flac") => Format::Lossless,
            _ => Format::Other,
        }
    }
}

struct Outcome {
    path: String,
    format: Format,
    reference: Reference,
    duration_s: f64,
    short: bool,
    bpm: Option<BpmResult>,
    key: Option<KeyResult>,
    error: Option<String>,
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;
    let mut references = read_traktor(&args.traktor, &volumes::boot_volume_name())?;
    let in_traktor = references.len();
    let in_rekordbox = match &args.rekordbox {
        Some(path) => add_rekordbox(path, &mut references)?,
        None => 0,
    };
    let mut items: Vec<(String, Reference)> = references.into_iter().collect();
    items.sort_by(|a, b| a.0.cmp(&b.0));
    let listed = items.len();
    items.retain(|(path, _)| Path::new(path).exists());
    let not_found = listed - items.len();
    if let Some(n) = args.sample {
        items.shuffle(&mut StdRng::seed_from_u64(args.seed));
        items.truncate(n);
    }

    let started = Instant::now();
    let min_seconds = args.min_seconds;
    let outcomes: Vec<Outcome> =
        items.into_par_iter().map(|(path, reference)| analyze(path, reference, min_seconds)).collect();
    let wall_s = started.elapsed().as_secs_f64();

    println!("recodeck-eval");
    println!("  Traktor tracks with a BPM: {in_traktor}");
    if args.rekordbox.is_some() {
        println!("  of them in Rekordbox: {in_rekordbox}");
    }
    println!("  files not found on disk: {not_found}");
    let errors = outcomes.iter().filter(|o| o.error.is_some()).count();
    let short = outcomes.iter().filter(|o| o.short).count();
    println!("  decode errors: {errors}; shorter than {min_seconds} s, not measured: {short}");
    let measured: Vec<&Outcome> = outcomes.iter().filter(|o| o.error.is_none() && !o.short).collect();
    println!("  measured: {}", measured.len());

    report_bpm(&measured);
    report_key(&measured);
    report_grid(&measured);
    report_references(&measured);
    report_confidence(&measured);

    let threads = rayon::current_num_threads();
    println!("\nTime");
    println!("  wall: {wall_s:.1} s on {threads} threads");
    if !measured.is_empty() {
        // Per measured track: short files' decoding is in the wall time too, so this errs high.
        println!("  seconds per track on one core: {:.2}", wall_s * threads as f64 / measured.len() as f64);
    }
    if let Some(path) = &args.csv {
        write_csv(path, &outcomes)?;
        println!("\nCSV: {}", path.display());
    }
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args { traktor: PathBuf::new(), rekordbox: None, sample: None, seed: 1, min_seconds: 60.0, csv: None };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let value = it.next().ok_or_else(|| format!("{flag} needs a value\n{USAGE}"))?;
        let number = |v: &str| v.parse::<f64>().map_err(|_| format!("{flag} needs a number\n{USAGE}"));
        match flag.as_str() {
            "--traktor" => args.traktor = PathBuf::from(value),
            "--rekordbox" => args.rekordbox = Some(PathBuf::from(value)),
            "--sample" => args.sample = Some(number(&value)? as usize),
            "--seed" => args.seed = number(&value)? as u64,
            "--min-seconds" => args.min_seconds = number(&value)?,
            "--csv" => args.csv = Some(PathBuf::from(value)),
            _ => return Err(format!("unknown argument {flag}\n{USAGE}")),
        }
    }
    if args.traktor.as_os_str().is_empty() {
        return Err(USAGE.to_string());
    }
    Ok(args)
}

fn nfc(path: &str) -> String {
    path.nfc().collect()
}

fn read_text(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

fn child<'a, 'i>(node: roxmltree::Node<'a, 'i>, name: &str) -> Option<roxmltree::Node<'a, 'i>> {
    node.children().find(|c| c.has_tag_name(name))
}

fn number(node: Option<roxmltree::Node>, attribute: &str) -> Option<f64> {
    node?.attribute(attribute)?.trim().parse().ok()
}

/// Traktor's collection: each analysed track's file, BPM, key and AutoGrid marker.
fn read_traktor(path: &Path, boot_volume: &str) -> Result<HashMap<String, Reference>, String> {
    let text = read_text(path)?;
    let doc = roxmltree::Document::parse(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut references = HashMap::new();
    let Some(collection) = doc.descendants().find(|n| n.has_tag_name("COLLECTION")) else {
        return Ok(references);
    };
    for entry in collection.children().filter(|n| n.has_tag_name("ENTRY")) {
        let Some(location) = child(entry, "LOCATION") else { continue };
        let Some(bpm) = number(child(entry, "TEMPO"), "BPM").filter(|&b| b > 0.0) else { continue };
        let file = traktor::path_from_location(
            location.attribute("VOLUME").unwrap_or(""),
            location.attribute("DIR").unwrap_or(""),
            location.attribute("FILE").unwrap_or(""),
            boot_volume,
        );
        let key = child(entry, "MUSICAL_KEY")
            .and_then(|k| k.attribute("VALUE"))
            .and_then(|v| v.trim().parse::<u8>().ok())
            .and_then(keys::camelot_from_traktor);
        let marker = entry
            .children()
            .find(|c| c.has_tag_name("CUE_V2") && c.attribute("TYPE") == Some("4"))
            .and_then(|c| c.attribute("START"))
            .and_then(|s| s.trim().parse::<f64>().ok());
        references.insert(
            nfc(&file),
            Reference { traktor_bpm: bpm, traktor_key: key, traktor_marker_ms: marker, ..Default::default() },
        );
    }
    Ok(references)
}

/// Rekordbox's values for the tracks Traktor also has; returns how many matched.
fn add_rekordbox(path: &Path, references: &mut HashMap<String, Reference>) -> Result<usize, String> {
    let text = read_text(path)?;
    let doc = roxmltree::Document::parse(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let Some(collection) = doc.descendants().find(|n| n.has_tag_name("COLLECTION")) else { return Ok(0) };
    let mut matched = 0;
    for track in collection.children().filter(|n| n.has_tag_name("TRACK")) {
        let Some(file) = track.attribute("Location").and_then(rekordbox::path_from_location) else { continue };
        let Some(reference) = references.get_mut(&nfc(&file)) else { continue };
        matched += 1;
        reference.rb_bpm = number(Some(track), "AverageBpm").filter(|&b| b > 0.0);
        reference.rb_key = track.attribute("Tonality").and_then(keys::camelot_from_tag);
        let tempo = child(track, "TEMPO");
        if let (Some(start_s), Some(tempo_bpm), Some(beat)) =
            (number(tempo, "Inizio"), number(tempo, "Bpm").filter(|&b| b > 0.0), number(tempo, "Battito"))
        {
            reference.rb_marker_ms = Some(start_s * 1000.0);
            reference.rb_marker_bpm = Some(tempo_bpm);
            reference.rb_downbeat_ms = Some(scoring::downbeat_ms(start_s * 1000.0, beat as u32, tempo_bpm));
        }
    }
    Ok(matched)
}

/// Decodes the file and runs the app's own detection on it.
fn analyze(path: String, reference: Reference, min_seconds: f64) -> Outcome {
    let mut outcome = Outcome {
        format: Format::of(&path),
        path,
        reference,
        duration_s: 0.0,
        short: false,
        bpm: None,
        key: None,
        error: None,
    };
    match decode_to_mono(Path::new(&outcome.path)) {
        Err(e) => outcome.error = Some(e),
        Ok(audio) => {
            outcome.duration_s = audio.samples.len() as f64 / audio.sample_rate.max(1) as f64;
            if outcome.duration_s < min_seconds {
                outcome.short = true;
            } else {
                // Today's detection reports a failure as BPM 0.
                outcome.bpm = detect_bpm_from_samples(&audio).ok().filter(|r| r.bpm > 0.0);
                outcome.key = detect_key_from_samples(&audio).ok();
            }
        }
    }
    outcome
}

fn pct(n: usize, of: usize) -> String {
    if of == 0 {
        "    -".to_string()
    } else {
        format!("{:5.1}%", 100.0 * n as f64 / of as f64)
    }
}

fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, n) = values.fold((0.0, 0usize), |(s, n), v| (s + v, n + 1));
    (n > 0).then(|| sum / n as f64)
}

fn show(value: Option<f64>) -> String {
    value.map_or("-".to_string(), |v| format!("{v:.3}"))
}

/// Leaves out tracks where Traktor and Rekordbox differ by more than 0.5 BPM.
fn references_agree_on_bpm(o: &Outcome) -> bool {
    o.reference.rb_bpm.map_or(true, |rb| (rb - o.reference.traktor_bpm).abs() <= 0.5)
}

fn report_bpm(measured: &[&Outcome]) {
    println!("\nBPM against Traktor");
    let target: Vec<&Outcome> = measured.iter().copied().filter(|o| references_agree_on_bpm(o)).collect();
    for (label, set) in [
        ("all", measured.to_vec()),
        ("target set (Traktor and Rekordbox within 0.5, or not in Rekordbox)", target),
    ] {
        let mut counts: HashMap<Option<BpmMatch>, usize> = HashMap::new();
        for o in &set {
            *counts.entry(o.bpm.as_ref().map(|b| scoring::bpm_match(b.bpm, o.reference.traktor_bpm))).or_default() += 1;
        }
        let n = set.len();
        let c = |m: Option<BpmMatch>| counts.get(&m).copied().unwrap_or(0);
        println!("  {label}: {n}");
        println!("    within ±0.05     {}", pct(c(Some(BpmMatch::Exact)), n));
        println!("    within ±0.5      {}", pct(c(Some(BpmMatch::Exact)) + c(Some(BpmMatch::Close)), n));
        println!("    off by 0.5–1.5   {}", pct(c(Some(BpmMatch::OffByOne)), n));
        println!("    half or double   {}", pct(c(Some(BpmMatch::HalfOrDouble)), n));
        println!("    other            {}", pct(c(Some(BpmMatch::Other)), n));
        println!("    no BPM           {}", pct(c(None), n));
    }
    let with_bpm: Vec<&Outcome> = measured.iter().copied().filter(|o| o.bpm.is_some()).collect();
    let mut buckets = [0usize; scoring::SIGNED_BUCKETS.len()];
    for o in &with_bpm {
        buckets[scoring::signed_bucket(o.bpm.as_ref().map_or(0.0, |b| b.bpm) - o.reference.traktor_bpm)] += 1;
    }
    println!("  signed error (ours − Traktor):");
    for (label, n) in scoring::SIGNED_BUCKETS.iter().zip(buckets) {
        println!("    {label:>14}  {}", pct(n, with_bpm.len()));
    }
}

fn report_key(measured: &[&Outcome]) {
    println!("\nKey (MIREX: exact 1, a fifth up 0.5, relative 0.3, parallel 0.2)");
    let pairs = |pick: &dyn Fn(&Reference) -> Option<String>| -> Vec<(Option<String>, String)> {
        measured.iter().filter_map(|o| Some((o.key.as_ref().map(|k| k.camelot.clone()), pick(&o.reference)?))).collect()
    };
    let traktor = pairs(&|r| r.traktor_key.clone());
    let rekordbox = pairs(&|r| r.rb_key.clone());
    let consensus = pairs(&|r| match (&r.traktor_key, &r.rb_key) {
        (Some(t), Some(b)) if t == b => Some(t.clone()),
        _ => None,
    });
    key_lines("against Traktor", &traktor);
    key_lines("against Rekordbox", &rekordbox);
    key_lines("consensus (Traktor = Rekordbox)", &consensus);

    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for o in measured {
        if let Some(k) = &o.key {
            *counts.entry(k.camelot.clone()).or_default() += 1;
        }
    }
    let total: usize = counts.values().sum();
    let mut sorted: Vec<(String, usize)> = counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    let shown: Vec<String> = sorted.iter().map(|(k, n)| format!("{k} {}", pct(*n, total).trim())).collect();
    println!("  predicted keys: {}", shown.join(", "));
}

fn key_lines(label: &str, pairs: &[(Option<String>, String)]) {
    let n = pairs.len();
    let mut counts: HashMap<Option<KeyMatch>, usize> = HashMap::new();
    let mut mirex = 0.0;
    for (ours, reference) in pairs {
        *counts.entry(ours.as_deref().and_then(|o| scoring::key_match(o, reference))).or_default() += 1;
        mirex += ours.as_deref().and_then(|o| scoring::mirex_score(o, reference)).unwrap_or(0.0);
    }
    let c = |m: Option<KeyMatch>| counts.get(&m).copied().unwrap_or(0);
    println!("  {label}: {n}");
    println!("    exact            {}", pct(c(Some(KeyMatch::Exact)), n));
    println!("    ±1 on the wheel  {}", pct(c(Some(KeyMatch::Fifth)), n));
    println!("    relative         {}", pct(c(Some(KeyMatch::Relative)), n));
    println!("    parallel         {}", pct(c(Some(KeyMatch::Parallel)), n));
    println!("    other            {}", pct(c(Some(KeyMatch::Other)), n));
    println!("    no key           {}", pct(c(None), n));
    println!("    MIREX score      {}", if n == 0 { "-".to_string() } else { format!("{:.3}", mirex / n as f64) });
}

fn offset_lines(label: &str, offsets: &[f64]) {
    let n = offsets.len();
    if n == 0 {
        println!("  {label}: no grid");
        return;
    }
    let mut absolute: Vec<f64> = offsets.iter().map(|o| o.abs()).collect();
    let mut signed = offsets.to_vec();
    let within = |ms: f64| offsets.iter().filter(|o| o.abs() <= ms).count();
    println!(
        "  {label}: {n}  median |error| {:.1} ms  signed median {:+.1} ms  ≤10 {}  ≤20 {}  ≤40 {}",
        scoring::median(&mut absolute).unwrap_or(0.0),
        scoring::median(&mut signed).unwrap_or(0.0),
        pct(within(10.0), n),
        pct(within(20.0), n),
        pct(within(40.0), n),
    );
}

fn report_grid(measured: &[&Outcome]) {
    println!("\nBeat grid against Traktor's marker (+ means our beat is later)");
    for (label, format) in [("MP3", Format::Mp3), ("WAV/AIFF/FLAC", Format::Lossless)] {
        let offsets: Vec<f64> = measured
            .iter()
            .filter(|o| o.format == format)
            .filter_map(|o| {
                let bpm = o.bpm.as_ref()?;
                Some(scoring::grid_offset_ms(bpm.bpm, bpm.first_beat_ms?, o.reference.traktor_marker_ms?))
            })
            .collect();
        offset_lines(label, &offsets);
    }
    let bars = |pick: &dyn Fn(&Reference) -> Option<f64>| -> (usize, usize) {
        let (mut agree, mut n) = (0, 0);
        for o in measured {
            let (Some(bpm), Some(downbeat)) = (o.bpm.as_ref(), pick(&o.reference)) else { continue };
            let Some(first) = bpm.first_beat_ms else { continue };
            n += 1;
            if scoring::bar_offset(bpm.bpm, first, downbeat) == 0 {
                agree += 1;
            }
        }
        (agree, n)
    };
    let (agree, n) = bars(&|r| r.traktor_marker_ms);
    println!("  bar start agrees with Traktor's marker: {} of {n}", pct(agree, n));
    let (agree, n) = bars(&|r| r.rb_downbeat_ms);
    println!("  bar start agrees with Rekordbox's downbeat: {} of {n}", pct(agree, n));
}

fn report_references(measured: &[&Outcome]) {
    println!("\nThe references against each other (the ceiling)");
    let both: Vec<(f64, f64)> =
        measured.iter().filter_map(|o| Some((o.reference.traktor_bpm, o.reference.rb_bpm?))).collect();
    let within = |limit: f64| both.iter().filter(|(t, r)| (t - r).abs() <= limit).count();
    println!(
        "  BPM: within ±0.05 {}, within ±0.5 {} of {}",
        pct(within(0.05), both.len()),
        pct(within(0.5), both.len()),
        both.len()
    );
    let keys: Vec<(&String, &String)> = measured
        .iter()
        .filter_map(|o| Some((o.reference.traktor_key.as_ref()?, o.reference.rb_key.as_ref()?)))
        .collect();
    let same = keys.iter().filter(|(t, r)| t == r).count();
    println!("  key: the same {} of {}", pct(same, keys.len()), keys.len());
    for (label, format) in [("MP3", Format::Mp3), ("WAV/AIFF/FLAC", Format::Lossless)] {
        let offsets: Vec<f64> = measured
            .iter()
            .filter(|o| o.format == format)
            .filter_map(|o| {
                let r = &o.reference;
                Some(scoring::grid_offset_ms(r.rb_marker_bpm?, r.rb_marker_ms?, r.traktor_marker_ms?))
            })
            .collect();
        offset_lines(&format!("grid, Rekordbox against Traktor, {label}"), &offsets);
    }
}

fn report_confidence(measured: &[&Outcome]) {
    println!("\nConfidence (mean; a useful one is higher when right)");
    let (mut bpm_right, mut bpm_wrong) = (Vec::new(), Vec::new());
    for o in measured {
        let Some(b) = o.bpm.as_ref() else { continue };
        if (b.bpm - o.reference.traktor_bpm).abs() <= 0.5 { bpm_right.push(b.confidence) } else { bpm_wrong.push(b.confidence) }
    }
    println!("  BPM: right {}  wrong {}", show(mean(bpm_right.into_iter())), show(mean(bpm_wrong.into_iter())));
    let (mut key_right, mut key_wrong) = (Vec::new(), Vec::new());
    for o in measured {
        let (Some(k), Some(t)) = (o.key.as_ref(), o.reference.traktor_key.as_deref()) else { continue };
        if k.camelot == t { key_right.push(k.confidence) } else { key_wrong.push(k.confidence) }
    }
    println!("  key: right {}  wrong {}", show(mean(key_right.into_iter())), show(mean(key_wrong.into_iter())));
}

fn csv_field(value: &str) -> String {
    if value.contains([',', '"', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn opt(value: Option<f64>) -> String {
    value.map_or(String::new(), |v| format!("{v:.3}"))
}

fn write_csv(path: &Path, outcomes: &[Outcome]) -> Result<(), String> {
    let mut text = String::from(
        "path,seconds,traktor_bpm,rekordbox_bpm,bpm,bpm_confidence,traktor_key,rekordbox_key,key,key_confidence,traktor_marker_ms,first_beat_ms,grid_offset_ms,note\n",
    );
    for o in outcomes {
        let r = &o.reference;
        let grid = o.bpm.as_ref().and_then(|b| Some(scoring::grid_offset_ms(b.bpm, b.first_beat_ms?, r.traktor_marker_ms?)));
        let note = o.error.clone().unwrap_or_else(|| if o.short { "short".to_string() } else { String::new() });
        let row = [
            csv_field(&o.path),
            format!("{:.1}", o.duration_s),
            opt(Some(r.traktor_bpm)),
            opt(r.rb_bpm),
            opt(o.bpm.as_ref().map(|b| b.bpm)),
            opt(o.bpm.as_ref().map(|b| b.confidence)),
            r.traktor_key.clone().unwrap_or_default(),
            r.rb_key.clone().unwrap_or_default(),
            o.key.as_ref().map(|k| k.camelot.clone()).unwrap_or_default(),
            opt(o.key.as_ref().map(|k| k.confidence)),
            opt(r.traktor_marker_ms),
            opt(o.bpm.as_ref().and_then(|b| b.first_beat_ms)),
            opt(grid),
            csv_field(&note),
        ];
        text.push_str(&row.join(","));
        text.push('\n');
    }
    std::fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}
```

- [ ] **Step 3: Build both ways**

Run: `cd src-tauri && cargo check --features eval --bin recodeck-eval && cargo build`
Expected: both succeed; the plain `cargo build` does not build `recodeck-eval` (its feature is off).

- [ ] **Step 4: Smoke run on 20 tracks**

Run:
```bash
cd src-tauri && cargo run --release --features eval --bin recodeck-eval -- \
  --traktor "$TRAKTOR_NML" --rekordbox "$REKORDBOX_XML" --sample 20 --csv "$EVAL_OUT/smoke.csv"
```
Expected: a report with every section. Traktor's count is close to 2000 and Rekordbox matches about 1200. "files not found" is small. Grid sections say "no grid". If Rekordbox matches 0, the path join is wrong: compare a Traktor path and a Rekordbox path from the CSV and fix it.

- [ ] **Step 5: Run the library tests**

Run: `cd src-tauri && cargo test --lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/bin/recodeck-eval.rs
git commit -m "feat(eval): recodeck-eval measures detection against Traktor and Rekordbox"
```

### Task 6: Baseline run (CHECKPOINT 1)

- [ ] **Step 1: Full run on today's code**

Run the tool (see Before you start) with run name `p1-baseline`.

- [ ] **Step 2: Record** the baseline row in Results: BPM ±0.05 and ±0.5 on the target set, key exact and MIREX on the consensus set, seconds per track on one core. Grid is "-". Under the table, note the reference ceiling (Traktor against Rekordbox: BPM ±0.5, key the same, the Rekordbox grid against Traktor per format) and the confidence gap.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "docs: analysis accuracy baseline"
```

- [ ] **Step 4: CHECKPOINT.** Stop. Report the baseline to the user in Serbian: BPM, key, the ceiling, time per track, and that the time target is 1.5× this baseline. Wait for the go-ahead.

---

# Phase 2: BPM, grid and decoder (spec §2)

### Task 7: Remove the four unused analysis commands

**Files:**
- Modify: `src-tauri/src/commands/analysis.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri-api.ts`, `src/types/track.ts`

These save `0.0` and write no version. Nothing in the UI calls them, and they would stop compiling when `detect_bpm` returns an `Option`.

- [ ] **Step 1: Delete** from `commands/analysis.rs`: `analyze_bpm`, `analyze_key`, `analyze_all_keys`, `analyze_all_bpm`, and the DTOs only they use (`BpmResultDTO`, `KeyResultDTO`). Keep `get_track_analysis`, the waveform commands, `analyze_tracks_batch` and `cancel_analysis`. Remove imports that become unused.
- [ ] **Step 2: Delete** the four lines `commands::analysis::analyze_bpm`, `analyze_all_bpm`, `analyze_key` and `analyze_all_keys` from the `invoke_handler` list in `lib.rs`.
- [ ] **Step 3: Delete** the wrappers `analyzeBpm`, `analyzeAllBpm`, `analyzeKey` and `analyzeAllKeys` from `src/lib/tauri-api.ts`. Run `grep -rn "BpmResult\|KeyResult" src`. If `BpmResult` and `KeyResult` in `src/types/track.ts` have no other users, delete them and their imports.
- [ ] **Step 4: Check**

Run: `cd src-tauri && cargo test --lib && cd .. && npx tsc --noEmit && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/analysis.rs src-tauri/src/lib.rs src/lib/tauri-api.ts src/types/track.ts
git commit -m "refactor(analysis): remove the unused single-track and analyze-all commands"
```

### Task 8: Decoder keeps the timeline

**Files:**
- Modify: `src-tauri/src/audio/decoder.rs`

- [ ] **Step 1: Write the failing test** (in `mod tests`)

```rust
    #[test]
    fn a_failed_packet_is_silence_of_its_length() {
        use symphonia::core::units::TimeBase;
        assert_eq!(gap_frames(1152, Some(TimeBase::new(1, 44100)), 44100), 1152);
        assert_eq!(gap_frames(1024, Some(TimeBase::new(1, 48000)), 48000), 1024);
        // A time base finer than the sample rate.
        assert_eq!(gap_frames(2048, Some(TimeBase::new(1, 96000)), 48000), 1024);
        // No time base: one frame per tick.
        assert_eq!(gap_frames(576, None, 44100), 576);
    }
```

- [ ] **Step 2: Run to see it fail**

Run: `cd src-tauri && cargo test --lib audio::decoder`
Expected: compile error, `gap_frames` not found.

- [ ] **Step 3: Implement**

Add `use symphonia::core::units::TimeBase;` to the imports, then:

```rust
/// Frames of silence that stand in for a packet that failed to decode, so
/// the samples after it keep their time (spec 2026-10-17, §2): the packet's
/// duration in the track's time base, at the sample rate.
fn gap_frames(duration: u64, time_base: Option<TimeBase>, sample_rate: u32) -> usize {
    match time_base {
        Some(tb) => {
            let t = tb.calc_time(duration);
            ((t.seconds as f64 + t.frac) * sample_rate as f64).round() as usize
        }
        None => duration as usize,
    }
}

/// Whether MP3/AAC encoder delay and padding are trimmed for analysis. Set by
/// measurement (spec §2, decoder timeline): the setting that lines MP3 grids
/// up with Traktor's.
const GAPLESS: bool = false;
```

In `decode_to_mono`:
- read `let time_base = track.codec_params.time_base;` next to `sample_rate`;
- pass `&FormatOptions { enable_gapless: GAPLESS, ..Default::default() }` to `format(...)`;
- replace the `DecodeError` arm with:

```rust
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Silence of the packet's length keeps every later sample at its time.
                eprintln!("[decode_to_mono] Corrupted packet replaced by silence: {}", msg);
                let gap = gap_frames(packet.dur(), time_base, sample_rate);
                all_samples.resize(all_samples.len() + gap, 0.0);
                continue;
            }
```

Leave `AudioDecoder` (playback) alone.

- [ ] **Step 4: Run to see it pass**

Run: `cd src-tauri && cargo test --lib audio::decoder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/decoder.rs
git commit -m "fix(decoder): a packet that fails to decode becomes silence of its length"
```

### Task 9: Onset envelope

**Files:**
- Create: `src-tauri/src/audio/test_signals.rs`, `src-tauri/src/audio/onset.rs`
- Modify: `src-tauri/src/audio/mod.rs`

- [ ] **Step 1: Test signals**

`audio/mod.rs`: add `pub mod onset;` and

```rust
#[cfg(test)]
pub(crate) mod test_signals;
```

`test_signals.rs`:

```rust
// Synthetic signals for the analysis tests (spec 2026-10-17, Tests).

use super::decoder::MonoAudio;
use std::f64::consts::PI;

/// A kick (a 150 → 50 Hz sweep fading over 0.12 s) with a short click on
/// top, on every beat at `bpm`, the first at `first_s`, silence before it, and
/// a quiet noise floor (about -60 dB) after, as real music never goes
/// digitally silent between kicks.
pub fn kick_track(bpm: f64, sample_rate: u32, seconds: f64, first_s: f64) -> MonoAudio {
    let rate = sample_rate as f64;
    let total = (rate * seconds) as usize;
    let mut samples = vec![0.0f32; total];
    let length = (0.12 * rate) as usize;
    let sweep = (50.0f64 / 150.0).ln() / 0.12;
    let mut beat = 0;
    loop {
        let start = ((first_s + beat as f64 * 60.0 / bpm) * rate).round() as usize;
        if start >= total {
            break;
        }
        for j in 0..length.min(total - start) {
            let t = j as f64 / rate;
            let kick = (2.0 * PI * 150.0 * ((sweep * t).exp() - 1.0) / sweep).sin() * (-t / 0.05).exp();
            let click = (2.0 * PI * 3000.0 * t).sin() * (-t / 0.002).exp();
            samples[start + j] += (0.8 * kick + 0.3 * click) as f32;
        }
        beat += 1;
    }
    // Deterministic noise (a constant-seeded LCG), uniform in +-0.002, from the first kick on.
    let mut state: u32 = 0x1234_5678;
    let from = ((first_s * rate).round() as usize).min(total);
    for sample in &mut samples[from..] {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        *sample += ((state >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0) * 0.002;
    }
    MonoAudio { samples, sample_rate, duration_ms: (seconds * 1000.0) as u64 }
}

/// `seconds` of kicks at `bpm_a`, then `seconds` at `bpm_b`.
pub fn tempo_change(bpm_a: f64, bpm_b: f64, sample_rate: u32, seconds: f64) -> MonoAudio {
    let mut track = kick_track(bpm_a, sample_rate, seconds, 0.137);
    track.samples.extend(kick_track(bpm_b, sample_rate, seconds, 0.0).samples);
    track.duration_ms *= 2;
    track
}
```

- [ ] **Step 2: Write `onset.rs` with failing tests**

```rust
// src-tauri/src/audio/onset.rs
// The onset envelope (spec 2026-10-17, §2): spectral flux in a low band (the
// kick) and over the whole spectrum, every 128 samples. The beat grid uses it
// for its first beat and its confidence.

use super::decoder::MonoAudio;
use rustfft::{num_complex::Complex, FftPlanner};
use std::f64::consts::PI;

/// Samples per frame and between frames: 2.9 ms at 44.1 kHz (the spec asks for 256 or finer).
const FRAME: usize = 512;
const HOP: usize = 128;
/// The low band's top, in Hz: kick drums and bass.
const LOW_BAND_HZ: f64 = 200.0;
/// Music sections: 2-second windows whose low-band energy is above 10 % of the median window's.
const MUSIC_WINDOW_S: f64 = 2.0;
const MUSIC_SHARE: f64 = 0.1;
/// The first strong onset reaches 30 % of the 99.5th percentile of the track's low-band flux.
const STRONG_ONSET_SHARE: f32 = 0.3;
/// A kick near a grid beat makes the low band jump this many times more than
/// the beat's other quarters do (see `kick_near`): it has to lead the 16ths,
/// not tie them. Chosen on the whole library (2026-10-18): right tempos then
/// score a median 0.78 (the flux rule before gave 0.21), wrong ones 0.14, and
/// right-tempo grids half a beat off 0.36.
const KICK_OVER_SIXTEENTHS: f32 = 1.25;
/// How far either side of a grid beat `kick_near` looks for the kick's onset,
/// in beats: past the 60 ms the level jump reaches at 124 BPM, short of the
/// neighbouring 16ths a quarter beat away.
const KICK_ONSET_REACH_BEATS: f64 = 0.125;
/// How far either side of a grid beat `kick_strength` looks for the low band's
/// jump: past a kick's attack, and short of the next 16th up to 160 BPM.
const KICK_JUMP_S: f64 = 0.060;

pub struct OnsetEnvelope {
    /// Seconds between frames, and the time of frame 0's centre.
    frame_s: f64,
    start_s: f64,
    /// Per frame: low-band flux, full-band flux, low-band energy.
    low: Vec<f32>,
    full: Vec<f32>,
    low_energy: Vec<f32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_signals::kick_track;

    #[test]
    fn the_first_strong_onset_is_the_first_kick() {
        for first in [0.137, 8.137] {
            let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 30.0, first));
            let onset = envelope.first_strong_low_onset().expect("an onset");
            assert!((onset - first).abs() < 0.010, "first kick at {first}, onset at {onset:.4}");
        }
    }

    #[test]
    fn silence_has_no_onset_and_no_music() {
        let silence = MonoAudio { samples: vec![0.0; 44100 * 10], sample_rate: 44100, duration_ms: 10_000 };
        let envelope = OnsetEnvelope::compute(&silence);
        assert_eq!(envelope.first_strong_low_onset(), None);
        assert!(envelope.music_windows().iter().all(|&m| !m));
    }

    #[test]
    fn music_starts_where_the_kicks_do() {
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 30.0, 8.137));
        let windows = envelope.music_windows();
        assert!(!envelope.in_music(&windows, 3.0));
        assert!(envelope.in_music(&windows, 20.0));
    }

    #[test]
    fn kicks_are_near_their_beats_and_not_between_them() {
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 30.0, 0.137));
        let beat = 0.137 + 20.0 * period;
        assert!(envelope.kick_near(beat, 0.020, period));
        assert!(!envelope.kick_near(beat + 0.060, 0.020, period));
        assert!(!envelope.kick_near(beat + period / 2.0, 0.020, period));
    }

    #[test]
    fn the_kick_phase_is_stronger_than_the_off_beat() {
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 30.0, 0.137));
        assert!(envelope.kick_strength(0.137, period) > 2.0 * envelope.kick_strength(0.137 + period / 2.0, period));
    }

    #[test]
    fn grid_beats_stay_inside_the_track() {
        let envelope = OnsetEnvelope::compute(&kick_track(120.0, 44100, 10.0, 0.137));
        let beats: Vec<f64> = envelope.beats(0.137, 0.5).collect();
        assert!(beats.first().copied().unwrap() >= 0.0 && beats.first().copied().unwrap() < 0.5);
        assert!(beats.last().copied().unwrap() <= envelope.duration_s());
        assert!((beats.len() as i64 - 20).abs() <= 1);
    }
}
```

- [ ] **Step 3: Run to see them fail**

Run: `cd src-tauri && cargo test --lib audio::onset`
Expected: compile errors (no methods yet).

- [ ] **Step 4: Implement**

```rust
impl OnsetEnvelope {
    pub fn compute(audio: &MonoAudio) -> Self {
        let rate = audio.sample_rate.max(1) as f64;
        let frames = if audio.samples.len() >= FRAME { (audio.samples.len() - FRAME) / HOP + 1 } else { 0 };
        let fft = FftPlanner::<f32>::new().plan_fft_forward(FRAME);
        let window: Vec<f32> =
            (0..FRAME).map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / FRAME as f64).cos()) as f32).collect();
        let bins = FRAME / 2 + 1;
        let low_bins = ((LOW_BAND_HZ * FRAME as f64 / rate).ceil() as usize).clamp(2, bins);
        let mut previous = vec![0f32; bins];
        let mut buffer = vec![Complex::new(0f32, 0f32); FRAME];
        let mut low = Vec::with_capacity(frames);
        let mut full = Vec::with_capacity(frames);
        let mut low_energy = Vec::with_capacity(frames);
        for f in 0..frames {
            let start = f * HOP;
            for (i, (&s, &w)) in audio.samples[start..start + FRAME].iter().zip(&window).enumerate() {
                buffer[i] = Complex::new(s * w, 0.0);
            }
            fft.process(&mut buffer);
            let (mut l, mut a, mut e) = (0f32, 0f32, 0f32);
            for b in 1..bins {
                let magnitude = buffer[b].norm();
                // Log compression, then only rises count: an onset, not a held note.
                let level = (1.0 + 100.0 * magnitude).ln();
                let rise = (level - previous[b]).max(0.0);
                previous[b] = level;
                a += rise;
                if b < low_bins {
                    l += rise;
                    e += magnitude * magnitude;
                }
            }
            low.push(l);
            full.push(a);
            low_energy.push(e);
        }
        Self { frame_s: HOP as f64 / rate, start_s: (FRAME / 2) as f64 / rate, low, full, low_energy }
    }

    /// The track's length as the envelope covers it, in seconds.
    pub fn duration_s(&self) -> f64 {
        self.start_s + self.low.len() as f64 * self.frame_s
    }

    /// The frame nearest t, clamped into the envelope.
    fn frame_at(&self, t: f64) -> usize {
        let frame = ((t - self.start_s) / self.frame_s).round().max(0.0) as usize;
        frame.min(self.low.len().saturating_sub(1))
    }

    /// When the music starts: the first frame whose low-band flux reaches 30 %
    /// of the track's strong onsets (its 99.5th percentile). None when the low
    /// band never rises.
    pub fn first_strong_low_onset(&self) -> Option<f64> {
        let mut sorted = self.low.clone();
        sorted.sort_by(f32::total_cmp);
        let strong = *sorted.get(sorted.len() * 995 / 1000)?;
        if strong <= 0.0 {
            return None;
        }
        let frame = self.low.iter().position(|&v| v >= STRONG_ONSET_SHARE * strong)?;
        Some(self.start_s + frame as f64 * self.frame_s)
    }

    fn window_frames(&self) -> usize {
        ((MUSIC_WINDOW_S / self.frame_s).round() as usize).max(1)
    }

    /// Per 2-second window from the start, whether it is music: low-band
    /// energy above 10 % of the median window's. Breakdowns without a kick drop out.
    pub fn music_windows(&self) -> Vec<bool> {
        let energy: Vec<f64> =
            self.low_energy.chunks(self.window_frames()).map(|c| c.iter().map(|&e| e as f64).sum()).collect();
        let mut sorted = energy.clone();
        sorted.sort_by(f64::total_cmp);
        let median = sorted.get(sorted.len() / 2).copied().unwrap_or(0.0);
        energy.iter().map(|&e| e > 0.0 && e > MUSIC_SHARE * median).collect()
    }

    /// Whether time t falls in a music window of `windows`.
    pub fn in_music(&self, windows: &[bool], t: f64) -> bool {
        let window_s = self.window_frames() as f64 * self.frame_s;
        t >= self.start_s && windows.get(((t - self.start_s) / window_s) as usize) == Some(&true)
    }

    /// Whether a kick lies within `tolerance_s` of t: the low band's level
    /// jumps there at least KICK_OVER_SIXTEENTHS times as much as it does at
    /// the beat's other quarters (a quarter beat before, a quarter and half a
    /// beat after), the beat's other 16ths, and the envelope's strongest flux
    /// (low plus full band, as the grid search sees it) within
    /// KICK_ONSET_REACH_BEATS, the kick's onset, is within `tolerance_s`. The
    /// low band alone peaks later: it has two bins.
    /// The flux alone can't tell the kick: on real bass lines the bass rises as
    /// often as the kick, so the kick stands only 1.5–2× above the flux around
    /// it. The jump alone can't place it: it reaches a kick up to 60 ms later.
    pub fn kick_near(&self, t: f64, tolerance_s: f64, period_s: f64) -> bool {
        if self.low.is_empty() {
            return false;
        }
        let reach = period_s * KICK_ONSET_REACH_BEATS;
        let onset = (self.frame_at(t - reach)..=self.frame_at(t + reach))
            .max_by(|&a, &b| self.envelope_flux(a).total_cmp(&self.envelope_flux(b)))
            .map(|frame| self.start_s + frame as f64 * self.frame_s);
        if !onset.is_some_and(|onset| (onset - t).abs() <= tolerance_s) {
            return false;
        }
        let largest_jump = |at: f64| {
            (self.frame_at(at - tolerance_s)..=self.frame_at(at + tolerance_s))
                .map(|frame| self.jump(self.start_s + frame as f64 * self.frame_s))
                .fold(0.0, f32::max)
        };
        let here = largest_jump(t);
        let elsewhere = [-0.25, 0.25, 0.5].iter().map(|q| largest_jump(t + q * period_s)).fold(0.0, f32::max);
        here > 0.0 && here >= KICK_OVER_SIXTEENTHS * elsewhere
    }

    /// How far the low band's level jumps at a grid's beats: which of several
    /// phases sits on the kicks. Per beat, the loudest the low band gets within
    /// KICK_JUMP_S after it, less the quietest within KICK_JUMP_S before. The
    /// kick is the loudest thing there; the low-band flux can't tell, as it is
    /// log-compressed, so a sidechained bass rising out of near silence on the
    /// off-beat rises as much as a kick landing on the held bass.
    pub fn kick_strength(&self, phase_s: f64, period_s: f64) -> f64 {
        self.beats(phase_s, period_s).map(|t| self.jump(t) as f64).sum()
    }

    /// How far the low band's level jumps at t: its loudest within KICK_JUMP_S
    /// after, less its quietest within KICK_JUMP_S before (square roots of the
    /// energy, so levels).
    fn jump(&self, t: f64) -> f32 {
        let after = self.max_of(&self.low_energy, t, t + KICK_JUMP_S);
        let before = self.min_of(&self.low_energy, t - KICK_JUMP_S, t);
        (after.sqrt() - before.sqrt()).max(0.0)
    }

    /// The largest and smallest value of a per-frame series between two times.
    fn max_of(&self, v: &[f32], from: f64, to: f64) -> f32 {
        if v.is_empty() {
            return 0.0;
        }
        let (a, b) = (self.frame_at(from), self.frame_at(to));
        v[a.min(b)..=a.max(b)].iter().copied().fold(0.0, f32::max)
    }

    fn min_of(&self, v: &[f32], from: f64, to: f64) -> f32 {
        if v.is_empty() {
            return 0.0;
        }
        let (a, b) = (self.frame_at(from), self.frame_at(to));
        v[a.min(b)..=a.max(b)].iter().copied().fold(f32::INFINITY, f32::min)
    }

    /// A grid's beats from 0 s to the end of the envelope.
    pub fn beats(&self, phase_s: f64, period_s: f64) -> impl Iterator<Item = f64> + '_ {
        let first = (-phase_s / period_s).ceil() as i64;
        let end = self.duration_s();
        (first..).map(move |k| phase_s + k as f64 * period_s).take_while(move |&t| t <= end)
    }
}
```

`full` is used by Task 14's envelope search. Until then, put `#[allow(dead_code)]` with a one-line comment on that field.

- [ ] **Step 5: Run to see them pass**

Run: `cd src-tauri && cargo test --lib audio::onset`
Expected: PASS. If `the_first_strong_onset_is_the_first_kick` is off by more than 10 ms, print the onset and check the threshold logic. Do not widen the tolerance.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/audio/mod.rs src-tauri/src/audio/test_signals.rs src-tauri/src/audio/onset.rs
git commit -m "feat(audio): onset envelope with low and full band flux"
```

### Task 10: Precise beat times from aubio

**Files:**
- Modify: `src-tauri/src/audio/bpm.rs`

- [ ] **Step 1: Write the failing tests** (in `mod tests`; add `use crate::audio::test_signals::kick_track;`)

```rust
    fn low_passed(audio: &MonoAudio) -> MonoAudio {
        MonoAudio { samples: low_pass_filter(&audio.samples, audio.sample_rate, 500.0), ..audio.clone() }
    }

    #[test]
    fn silence_is_below_minus_90_db() {
        assert!(is_silent(&[0.0; 512]));
        assert!(is_silent(&[1e-5; 512])); // −100 dB
        assert!(!is_silent(&[1e-4; 512])); // −80 dB
    }

    #[test]
    fn beats_are_precise_within_the_hop() {
        // Rounded down to 512-sample hops, every beat time would be a multiple
        // of the hop. aubio spaces beats by its own period estimate, which the
        // grid fit (step 2) corrects; here it only has to be within that
        // fit's ±2 % search.
        let rate = 44100;
        let audio = kick_track(122.0, rate, 60.0, 0.137);
        let pass = run_tempo_pass(&low_passed(&audio), OnsetMode::SpecFlux).unwrap();
        let inside = pass.beats.iter().filter(|&&t| ((t * rate as f64).round() as usize) % HOP_SIZE != 0).count();
        assert!(inside * 10 >= pass.beats.len() * 8, "{inside} of {} beats fall inside a hop", pass.beats.len());
        let mut intervals: Vec<f64> = pass.beats.windows(2).map(|w| w[1] - w[0]).collect();
        intervals.sort_by(f64::total_cmp);
        let bpm = 60.0 / intervals[intervals.len() / 2];
        assert!((bpm / 122.0 - 1.0).abs() < 0.02, "median interval gives {bpm:.2} BPM");
    }

    #[test]
    fn no_beats_in_silence() {
        let audio = kick_track(124.0, 44100, 40.0, 8.0);
        let pass = run_tempo_pass(&low_passed(&audio), OnsetMode::SpecFlux).unwrap();
        assert!(pass.beats.iter().all(|&t| t > 7.9), "a beat at {:?}", pass.beats.first());
    }
```

aubio spaces beats by its own period estimate (123.6 BPM for a 122 BPM kick track); the grid fit in Task 11 recovers the tempo.

- [ ] **Step 2: Run to see them fail**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: compile errors (`is_silent`, `run_tempo_pass` missing).

- [ ] **Step 3: Implement.** Replace `run_tempo_analysis` with:

```rust
/// aubio's silence threshold (`aubio_silence_detection`, default −90 dB).
const SILENCE_DB: f64 = -90.0;

/// One aubio Tempo pass over the audio.
struct TempoPass {
    /// Beat times in seconds from aubio's last-beat time: precise within the
    /// hop, and kept when a beat falls exactly on a hop boundary.
    beats: Vec<f64>,
    /// aubio's own tempo and confidence, read after the last hop.
    aubio_bpm: f64,
    aubio_confidence: f64,
}

/// Whether aubio would call this hop silent: its mean square, in dB, below −90.
fn is_silent(hop: &[f32]) -> bool {
    let mean_square = hop.iter().map(|&s| s as f64 * s as f64).sum::<f64>() / hop.len().max(1) as f64;
    10.0 * mean_square.log10() < SILENCE_DB
}

/// Runs aubio Tempo with one onset mode. A beat is a change of `get_last()`.
/// aubio still moves it in hops its silence check rejects, so those are dropped
/// with the same check.
fn run_tempo_pass(audio: &MonoAudio, mode: OnsetMode) -> Result<TempoPass, String> {
    let mut tempo = Tempo::new(mode, BUF_SIZE, HOP_SIZE, audio.sample_rate)
        .map_err(|e| format!("Failed to create aubio Tempo detector: {:?}", e))?;
    let rate = audio.sample_rate as f64;
    let mut beats = Vec::new();
    let mut last = tempo.get_last();
    for (i, hop) in audio.samples.chunks_exact(HOP_SIZE).enumerate() {
        tempo.do_result(hop).map_err(|e| format!("Tempo detection error at frame {}: {:?}", i, e))?;
        let now = tempo.get_last();
        if now != last {
            last = now;
            if !is_silent(hop) {
                beats.push(now as f64 / rate);
            }
        }
    }
    Ok(TempoPass {
        beats,
        aubio_bpm: tempo.get_bpm() as f64,
        aubio_confidence: (tempo.get_confidence() as f64).clamp(0.0, 1.0),
    })
}
```

In `detect_bpm_from_samples`, build the candidates from passes. Everything after the loops, `pick_consensus` included, stays as it is:

```rust
    for &mode in &modes_filtered {
        if let Ok(pass) = run_tempo_pass(&filtered_audio, mode) {
            let (ibi_bpm, ibi_conf) = compute_bpm_from_ibis(&pass.beats);
            if ibi_bpm > 0.0 {
                candidates.push((fold_to_dj_range(ibi_bpm), ibi_conf));
            }
            if pass.aubio_bpm > 0.0 {
                candidates.push((fold_to_dj_range(pass.aubio_bpm), pass.aubio_confidence * 0.8));
            }
        }
    }
    if let Ok(pass) = run_tempo_pass(audio, OnsetMode::SpecFlux) {
        let (ibi_bpm, ibi_conf) = compute_bpm_from_ibis(&pass.beats);
        if ibi_bpm > 0.0 {
            candidates.push((fold_to_dj_range(ibi_bpm), ibi_conf * 0.6));
        }
    }
```

- [ ] **Step 4: Run to see them pass**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: PASS, the old tests included.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/bpm.rs
git commit -m "fix(bpm): beat times from aubio's last beat, precise within the hop"
```

### Task 11: The grid fit, snap and `Option` result

**Files:**
- Modify: `src-tauri/src/audio/bpm.rs`, `src-tauri/src/audio/onset.rs`, `src-tauri/src/commands/analysis.rs`, `src-tauri/src/bin/recodeck-eval.rs`

**Why the envelope search is in this task (measured 2026-10-18).**
- aubio spaces its beats by its own period, about 1.3 % fast on the kick tests, and re-syncs to the kicks every 4–7 beats.
- Against the kicks, its beats form a sawtooth whose mean offset differs per track (−7 to −24 ms on the six kick cases). It also grows after the first 10–20 s, which tilts a least-squares line by up to 0.04 BPM.
- No single latency fits that. With one constant (`BEAT_LATENCY_MS`, the mean, −11.62 ms), two of the six cases stayed −12.6 and +5.5 ms off.
- The onset envelope sits at a steady offset from the kicks (about −2 ms). So the grid fitted to aubio's beats is only the starting point. The envelope search (first planned as Task 14) sets the final tempo and phase, and the snap refits the phase on the envelope.
- **Long tracks.** At a tempo whose beats drift ±15 ms by the ends, the score is a plateau, not a peak, and stage 1 leaves the phase about 10 ms off.
  - With a fixed 0.05 BPM first step and a ±5 ms second stage, starts 0.01–0.04 BPM off failed from 240 s on.
  - Hence the second stage reaches back ±15 ms, and the first stage's tempo step shrinks with the track's length.
  - Swept over 180–480 s and starts ±0.04 BPM off: all within ±0.005 BPM and 1.9 ms.
  - Cost: 0.15 s on 6 minutes and 0.28 s on 8 minutes (release).
- Before this task, `generate_click_track` got the same quiet noise floor as `kick_track` (its own commit). Task 10's silence check drops aubio's beats in digital silence, which left the old click tests with too few beats.

**Review fixes (2026-10-18).**
- **Off-beat lock.** The test signal is open hats on every off-beat (`offbeat_hats`, gain 0.1–0.3). Their full-band flux outscored the kicks, so stage 1's ±½-beat phase span put the grid half a beat (242 ms) off, even when started from the true grid.
  - Stage 1 now spans ±⅛ beat around the start. That covers aubio's 7–24 ms offset: ⅛ beat is 47 ms at 160 BPM, the tightest case (174 BPM folds to 87).
  - The hat cases now land within 0.72 ms, with confidence 1.0.
- **Stage-1 cap.** The coarse tempo step shrank with the duration, so stage 1's cost grew with the duration squared. The step now stops shrinking at `STAGE1_MAX_S` (600 s).
  - Whole detection, release, before → after: 6 min 0.98 → 0.85 s; 60 min 27.2 → 9.0 s.
  - One envelope search alone: 18.8 → 0.8 s.
- **Fallback start.** With no pass, or too few beats near the candidate, the candidate used to be dropped.
  - A start at the candidate's period, phased by the whole track's kick strength, failed. Consensus candidates run 1.3–1.5 % fast on the kick tests, so that phase was 65–358 ms off at the middle, and the grids ended ¼–½ beat off.
  - `searched_grid` starts the search from four phases ¼ beat apart and keeps the result with the most kick strength. Candidates from 1 % slow to 1.5 % fast land within 4.1 ms.
  - Silence still gives None: the fallback needs some low-band strength on its beats, which only digital silence lacks.
- **Off-beat start (re-review).** When aubio's beats followed the off-beats, the main path stayed there: a probe ended +241.8 ms off.
  - The search now also starts half a beat on, and the result with the most kick strength wins (since replaced by four starts, below).
  - Kicks under an off-beat 55 Hz bass up to 1.5× the kick's level stay within 0.6 ms. The kick strength at the off-beat rises towards the kicks' (1107 vs 1252), so a bass much louder than the kick could pull the grid over.
  - Whole detection on 6 min: 0.89 s (was 0.85 s).

**Real-library fixes (2026-10-18).**
- **A: a 16th early.** aubio's candidate runs about 1.5 % fast, so the grid fitted to its beats sits 0.16–0.35 beat off the kicks at the middle of the track, where the search starts.
  - Each search reaches only ⅛ beat, so both starts (the fit and half a beat on) ended on 16th hats.
  - Sidechain ducking gave the low band more energy before the kick, so the start a quarter beat early won.
  - 19.3 % of the right-tempo MP3 tracks were a 16th early this way.
  - Fix: the main path starts from four phases ¼ beat apart, like the fallback.
- **B: half a beat off.** `kick_strength` used the log-compressed low-band flux. A sidechained bass rising out of near silence on the off-beat rose as much as a kick landing on the held bass, and won: 6.5 % of the tracks were half a beat off.
  - Fix: `kick_strength` measures the jump in the low band's level at each beat. That is the loudest low-band energy within `KICK_JUMP_S` (60 ms) after the beat, less the quietest within 60 ms before, compared as square roots.
- **Results on the full library.**
  - Main cluster: 68.5 → 95.8 %.
  - MP3 grid ≤ 20 ms, Traktor's offset removed: 67.3 → 94.2 %.
  - 8 of 1063 main-cluster tracks got worse.
  - Two more searches per track cost 13 % more time.
- **Shared path.** With four starts, the phase `fit_grid` chose when folding a double-time pass no longer changed anything: every folded phase gives the same starts, modulo one beat. `fit_grid` no longer takes the envelope, and the fallback shares the four-start path from a grid at the candidate's period.
  - Measured result-neutral on 400 library tracks (seed 7): no BPM changed, 6 first beats moved 0.63 ms at most and 3 confidences 0.003 at most, from near ties in the snap's phase refit.

- [ ] **Step 1: Write the failing tests** (in `mod tests`)

```rust
    /// Beats at `bpm` from `phase` over `seconds`: a few ms of jitter, every
    /// tenth missing, and an off-beat stray every 25th.
    fn messy_beats(bpm: f64, phase: f64, seconds: f64) -> Vec<f64> {
        let period = 60.0 / bpm;
        let mut beats = Vec::new();
        let mut k = 0usize;
        while phase + k as f64 * period < seconds {
            let t = phase + k as f64 * period;
            if k % 10 != 3 {
                beats.push(t + ((k * 7919 % 7) as f64 - 3.0) / 1000.0);
            }
            if k % 25 == 11 {
                beats.push(t + period / 2.0);
            }
            k += 1;
        }
        beats.sort_by(f64::total_cmp);
        beats
    }

    #[test]
    fn the_grid_locks_onto_messy_beats() {
        let beats = messy_beats(124.0, 0.137, 300.0);
        let grid = refine_grid(&beats, lock_tempo(&beats, 123.2).unwrap()).unwrap();
        assert!((grid.bpm() - 124.0).abs() < 0.01, "{:.4} BPM", grid.bpm());
        assert!((grid.nearest(0.137) - 0.137).abs() < 0.002, "beat at {:.4}", grid.nearest(0.137));
    }

    #[test]
    fn a_line_through_points() {
        let points: Vec<(f64, f64)> = (0..10).map(|n| (n as f64, 0.25 + 0.5 * n as f64)).collect();
        let (slope, intercept) = fit_line(&points).unwrap();
        assert!((slope - 0.5).abs() < 1e-12 && (intercept - 0.25).abs() < 1e-12);
        assert!(fit_line(&[(1.0, 1.0), (1.0, 2.0)]).is_none());
    }

    #[test]
    fn a_tempo_near_a_whole_number_snaps_and_keeps_its_beats() {
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 60.0, 0.137));
        let near = Grid { period_s: 60.0 / 124.015, phase_s: 0.137 };
        let snapped = snap(near, &envelope);
        assert!((snapped.bpm() - 124.0).abs() < 1e-9);
        let worst_ms = (0..123)
            .map(|k| 0.137 + k as f64 * 60.0 / 124.0)
            .map(|t| (snapped.nearest(t) - t).abs() * 1000.0)
            .fold(0.0, f64::max);
        assert!(worst_ms <= 5.0, "a beat {worst_ms:.1} ms off the kicks");
        for bpm in [124.03, 124.2] {
            let far = Grid { period_s: 60.0 / bpm, phase_s: 0.137 };
            assert_eq!(snap(far, &envelope), far, "{bpm} BPM snapped");
        }
    }

    #[test]
    fn the_envelope_search_reaches_back_on_long_tracks() {
        // Five minutes, the short end of real tracks: a start 0.02 BPM off
        // drifts 24 ms by the ends.
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 300.0, 0.137));
        let truth = Grid { period_s: 60.0 / 124.0, phase_s: 0.137 };
        let start = Grid { period_s: 60.0 / 124.02, phase_s: truth.nearest(150.0) };
        let grid = envelope_search(start, &envelope, true);
        assert!((grid.bpm() - 124.0).abs() <= 0.005, "{:.4} BPM", grid.bpm());
        for kick in [0.137, truth.nearest(150.0), truth.nearest(299.5)] {
            let error_ms = (grid.nearest(kick) - kick) * 1000.0;
            assert!(error_ms.abs() <= 5.0, "kick at {kick:.3} s: beat {error_ms:+.1} ms off");
        }
    }

    #[test]
    fn kick_tracks_give_their_tempo_and_grid() {
        for rate in [44100, 48000] {
            for bpm in [122.0, 123.5, 127.33] {
                let audio = kick_track(bpm, rate, 60.0, 0.137);
                let grid = beat_grid(&audio, &OnsetEnvelope::compute(&audio)).expect("a grid");
                assert!((grid.bpm() - bpm).abs() <= 0.05, "{bpm} BPM at {rate} Hz: {:.3}", grid.bpm());
                let error_ms = (grid.nearest(0.137) - 0.137) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "{bpm} BPM at {rate} Hz: beat {error_ms:+.1} ms off");
            }
        }
    }

    #[test]
    fn a_double_time_pass_folds_onto_the_kicks() {
        // The pass tracked kicks and off-beats, and the fold lands on the
        // off-beats; the search from it still ends on the kicks.
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 60.0, 0.379));
        let beats = messy_beats(248.0, 0.137, 60.0);
        let grid = searched_grid(&beats, 124.0, &envelope).expect("a grid");
        assert!((grid.bpm() - 124.0).abs() < 0.01, "{:.4} BPM", grid.bpm());
        assert!((grid.nearest(0.379) - 0.379).abs() < 0.002, "beat at {:.4}", grid.nearest(0.379));
    }

    #[test]
    fn a_first_beat_before_the_file_moves_one_beat_on() {
        // The grid beat nearest the first kick (0.137 s) is at -0.1 s.
        let envelope = OnsetEnvelope::compute(&kick_track(120.0, 44100, 10.0, 0.137));
        let first_ms = first_beat_ms(Grid { period_s: 0.5, phase_s: -0.1 }, &envelope).expect("a first beat");
        assert!((first_ms - 400.0).abs() < 1e-6, "{first_ms} ms");
    }

    #[test]
    fn beats_on_the_off_beat_still_give_a_grid_on_the_kicks() {
        // The pass's beats sit half a beat after the kicks.
        let period = 60.0 / 124.0;
        let beats = messy_beats(124.0, 0.137 + period / 2.0, 60.0);
        for hats in [0.0, 0.2] {
            let envelope = OnsetEnvelope::compute(&offbeat_hats(124.0, 44100, 60.0, 0.137, hats));
            let grid = searched_grid(&beats, 124.0, &envelope).expect("a grid");
            assert!((grid.bpm() - 124.0).abs() <= 0.05, "hats at {hats}: {:.3} BPM", grid.bpm());
            let kicks = Grid { period_s: period, phase_s: 0.137 };
            for kick in [0.137, kicks.nearest(30.0), kicks.nearest(59.5)] {
                let error_ms = (grid.nearest(kick) - kick) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "hats at {hats}: kick at {kick:.3} s, beat {error_ms:+.1} ms off");
            }
        }
    }

    #[test]
    fn beats_a_sixteenth_off_still_give_a_grid_on_the_kicks() {
        // The pass's beats sit a quarter beat before or after the kicks, with
        // hats on every 16th: from there, and from half a beat on, the search
        // only reaches the hats.
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&sixteenth_hats(124.0, 44100, 60.0, 0.137, 0.3));
        let kicks = Grid { period_s: period, phase_s: 0.137 };
        for quarter in [0.25, 0.75] {
            let beats = messy_beats(124.0, 0.137 + quarter * period, 60.0);
            let grid = searched_grid(&beats, 124.0, &envelope).expect("a grid");
            assert!((grid.bpm() - 124.0).abs() <= 0.05, "beats {quarter} beat on: {:.3} BPM", grid.bpm());
            for kick in [0.137, kicks.nearest(30.0), kicks.nearest(59.5)] {
                let error_ms = (grid.nearest(kick) - kick) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "beats {quarter} beat on: kick at {kick:.3} s, beat {error_ms:+.1} ms off");
            }
        }
    }

    #[test]
    fn a_tempo_without_a_beat_fit_still_gets_its_grid() {
        // Too few beats to fit (or no pass): the search starts from the
        // candidate alone, 1.5 % fast as the consensus often is.
        for (bpm, hats) in [(124.0, 0.0), (124.0, 0.2), (127.33, 0.0)] {
            let envelope = OnsetEnvelope::compute(&offbeat_hats(bpm, 44100, 60.0, 0.137, hats));
            let (beats, candidate) = ([0.5, 1.0, 1.5], bpm * 1.015);
            assert!(fit_grid(&beats, candidate).is_none());
            let grid = searched_grid(&beats, candidate, &envelope).expect("a grid");
            assert!((grid.bpm() - bpm).abs() <= 0.05, "{bpm} BPM, hats at {hats}: {:.3}", grid.bpm());
            let kicks = Grid { period_s: 60.0 / bpm, phase_s: 0.137 };
            for kick in [0.137, kicks.nearest(30.0), kicks.nearest(59.5)] {
                let error_ms = (grid.nearest(kick) - kick) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "{bpm} BPM, hats at {hats}: kick at {kick:.3} s, beat {error_ms:+.1} ms off");
            }
        }
        let silence = MonoAudio { samples: vec![0.0; 44100 * 10], sample_rate: 44100, duration_ms: 10_000 };
        assert_eq!(searched_grid(&[], 124.0, &OnsetEnvelope::compute(&silence)), None);
    }

    #[test]
    fn off_beat_hats_leave_the_grid_on_the_kicks() {
        // The hats outscore the kicks in the onset envelope's full band.
        for (bpm, rate, gain) in [(124.0, 44100, 0.1), (124.0, 44100, 0.3), (128.0, 48000, 0.2)] {
            let case = format!("{bpm} BPM at {rate} Hz, hats at {gain}");
            let result = detect_bpm_from_samples(&offbeat_hats(bpm, rate, 60.0, 0.137, gain)).unwrap().expect("a tempo");
            assert!((result.bpm - bpm).abs() <= 0.05, "{case}: {:.3} BPM", result.bpm);
            let first_ms = result.first_beat_ms.expect("a first beat");
            assert!((first_ms - 137.0).abs() <= 5.0, "{case}: first beat at {first_ms:.1} ms");
            let grid = Grid { period_s: 60.0 / result.bpm, phase_s: first_ms / 1000.0 };
            let kicks = Grid { period_s: 60.0 / bpm, phase_s: 0.137 };
            for kick in [0.137, kicks.nearest(30.0), kicks.nearest(59.5)] {
                let error_ms = (grid.nearest(kick) - kick) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "{case}: kick at {kick:.3} s, beat {error_ms:+.1} ms off");
            }
            assert!(result.confidence >= 0.9, "{case}: confidence {:.2}", result.confidence);
        }
    }

    #[test]
    fn an_off_beat_bass_leaves_the_grid_on_the_kicks() {
        // The bass rises out of near silence on every off-beat, the kick
        // lands on the held bass.
        for (bpm, rate) in [(124.0, 44100), (128.0, 48000)] {
            let case = format!("{bpm} BPM at {rate} Hz");
            let result = detect_bpm_from_samples(&offbeat_bass(bpm, rate, 60.0, 0.137, 110.0, 0.3)).unwrap().expect("a tempo");
            assert!((result.bpm - bpm).abs() <= 0.05, "{case}: {:.3} BPM", result.bpm);
            let first_ms = result.first_beat_ms.expect("a first beat");
            let grid = Grid { period_s: 60.0 / result.bpm, phase_s: first_ms / 1000.0 };
            let kicks = Grid { period_s: 60.0 / bpm, phase_s: 0.137 };
            for kick in [0.137, kicks.nearest(30.0), kicks.nearest(59.5)] {
                let error_ms = (grid.nearest(kick) - kick) * 1000.0;
                assert!(error_ms.abs() <= 5.0, "{case}: kick at {kick:.3} s, beat {error_ms:+.1} ms off");
            }
        }
    }
```

In `onset.rs`'s `mod tests`, the envelope's timing:

```rust
    #[test]
    fn the_onset_strength_peaks_on_the_kicks() {
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 30.0, 0.137));
        let best = (100..=180)
            .map(|ms| ms as f64 / 1000.0)
            .max_by(|a, b| envelope.onset_strength(*a, period).total_cmp(&envelope.onset_strength(*b, period)))
            .unwrap();
        assert!((best - 0.137).abs() <= 0.001, "peak at {best:.3}");
    }

    #[test]
    fn the_kick_phase_is_stronger_than_an_off_beat_bass() {
        // The bass rises out of silence, the kick on top of the held bass.
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&offbeat_bass(124.0, 44100, 30.0, 0.137, 110.0, 0.3));
        let (kick, bass) = (envelope.kick_strength(0.137, period), envelope.kick_strength(0.137 + period / 2.0, period));
        assert!(kick > 1.2 * bass, "kick {kick:.1}, bass {bass:.1}");
    }
```

The signals these tests use, in `test_signals.rs` (`white_noise` is for Task 12):

```rust
/// `kick_track` with an open hi-hat on every off-beat, as in most house and
/// techno: white noise, high-passed by a first difference, fading over 40 ms,
/// at `hat_gain`.
pub fn offbeat_hats(bpm: f64, sample_rate: u32, seconds: f64, first_s: f64, hat_gain: f64) -> MonoAudio {
    let mut track = kick_track(bpm, sample_rate, seconds, first_s);
    let rate = sample_rate as f64;
    let total = track.samples.len();
    let length = (0.08 * rate) as usize;
    let mut state: u32 = 99;
    let mut beat = 0;
    loop {
        let start = ((first_s + (beat as f64 + 0.5) * 60.0 / bpm) * rate).round() as usize;
        if start >= total {
            break;
        }
        let mut previous = 0.0;
        for j in 0..length.min(total - start) {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let noise = (state >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0;
            let t = j as f64 / rate;
            track.samples[start + j] += (hat_gain * (noise - previous) * (-t / 0.04).exp()) as f32;
            previous = noise;
        }
        beat += 1;
    }
    track
}

/// `kick_track` with a closed hi-hat on each 16th note between the kicks, as
/// in most house and techno: white noise, high-passed by a first difference,
/// fading over 15 ms, at `hat_gain`.
pub fn sixteenth_hats(bpm: f64, sample_rate: u32, seconds: f64, first_s: f64, hat_gain: f64) -> MonoAudio {
    let mut track = kick_track(bpm, sample_rate, seconds, first_s);
    let rate = sample_rate as f64;
    let total = track.samples.len();
    let length = (0.05 * rate) as usize;
    let mut state: u32 = 7;
    let mut sixteenth = 0;
    loop {
        let start = ((first_s + sixteenth as f64 * 15.0 / bpm) * rate).round() as usize;
        if start >= total {
            break;
        }
        if sixteenth % 4 != 0 {
            let mut previous = 0.0;
            for j in 0..length.min(total - start) {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let noise = (state >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0;
                let t = j as f64 / rate;
                track.samples[start + j] += (hat_gain * (noise - previous) * (-t / 0.015).exp()) as f32;
                previous = noise;
            }
        }
        sixteenth += 1;
    }
    track
}

/// `kick_track` with a sidechained bass, as in most house: a `bass_hz` sine
/// at `bass_gain` from each off-beat until the next kick, silent under the
/// kick. The bass rises from near silence, the kick on top of the bass.
pub fn offbeat_bass(bpm: f64, sample_rate: u32, seconds: f64, first_s: f64, bass_hz: f64, bass_gain: f64) -> MonoAudio {
    let mut track = kick_track(bpm, sample_rate, seconds, first_s);
    let rate = sample_rate as f64;
    let period = 60.0 / bpm;
    for (i, sample) in track.samples.iter_mut().enumerate() {
        let t = i as f64 / rate - first_s;
        if t < 0.0 {
            continue;
        }
        let in_beat = t / period - (t / period).floor();
        if in_beat >= 0.5 {
            *sample += (bass_gain * (2.0 * PI * bass_hz * t).sin()) as f32;
        }
    }
    track
}

/// White noise, uniform in ±`amplitude` (a constant-seeded LCG): no beat at all.
pub fn white_noise(sample_rate: u32, seconds: f64, amplitude: f64) -> MonoAudio {
    let mut state: u32 = 0x0BAD_5EED;
    let samples = (0..(sample_rate as f64 * seconds) as usize)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (((state >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0) * amplitude) as f32
        })
        .collect();
    MonoAudio { samples, sample_rate, duration_ms: (seconds * 1000.0) as u64 }
}
```

The test modules import them: `use crate::audio::test_signals::{kick_track, offbeat_bass, offbeat_hats, rolling_bass, sixteenth_hats, tempo_change, white_noise};` in `bpm.rs` (`rolling_bass` is for Task 12), `use crate::audio::test_signals::{kick_track, offbeat_bass};` in `onset.rs`.

Update the old tests to the new result:
- `.expect("BPM detection should succeed")` becomes `.unwrap().expect("a tempo")`;
- `test_bpm_detection_silence` asserts `detect_bpm_from_samples(&audio).unwrap().is_none()`;
- `test_bpm_detection_short_audio` stays `is_ok()`;
- `test_bpm_detection_120bpm`: delete its `result.confidence > 0.0` assertion for now. Confidence is 0.0 until Task 12, which puts it back.

- [ ] **Step 2: Run to see them fail**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: compile errors (`Grid`, `lock_tempo`, `beat_grid`, `onset_strength`… missing).

- [ ] **Step 3: Implement**

Update the module's top comment to describe the new steps (spec §2: candidate, fit, snap, first beat, confidence). Add `use super::onset::OnsetEnvelope;`. Change `detect_bpm` to return `Result<Option<BpmResult>, String>`, and add:

```rust
/// A tempo this close to a whole number becomes it (spec §2, step 3).
/// Measured with recodeck-eval against Traktor on the whole library: 0.02 and
/// 0.05 give the most tempos within 0.005 BPM and the most MP3 grids within
/// 20 ms, ahead of no snap and of 0.1. 0.02 is the smaller of the best, so
/// fewer tempos that really sit off a whole number get moved.
const SNAP_BPM: f64 = 0.02;

/// The tempo search around the candidate: ±2 %, in steps of 0.01 BPM. Stage 1
/// of the envelope search spans the same ±2 %, with its own step.
const LOCK_RANGE: f64 = 0.02;
const LOCK_STEP_BPM: f64 = 0.01;

/// The longest duration the envelope search's first tempo step shrinks for.
/// Tracks up to 10 minutes keep the exact step; past that the step stays put,
/// so the search's cost grows linearly, not with the square of the duration.
/// Longer files are DJ mixes, which have no one constant grid anyway.
const STAGE1_MAX_S: f64 = 600.0;

/// A constant beat grid: beat k at `phase_s + k × period_s` seconds.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Grid {
    period_s: f64,
    phase_s: f64,
}

impl Grid {
    fn bpm(&self) -> f64 {
        60.0 / self.period_s
    }

    /// The grid beat nearest t.
    fn nearest(&self, t: f64) -> f64 {
        self.phase_s + ((t - self.phase_s) / self.period_s).round() * self.period_s
    }
}

/// Detect BPM and beat grid from decoded audio (spec 2026-10-17, §2). Ok(None)
/// when no tempo is found; never a BPM of 0.
pub fn detect_bpm_from_samples(audio: &MonoAudio) -> Result<Option<BpmResult>, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }
    let envelope = OnsetEnvelope::compute(audio);
    let Some(grid) = beat_grid(audio, &envelope) else { return Ok(None) };
    // Step 4 (first beat) and step 5 (confidence) come in Task 12.
    Ok(Some(BpmResult { bpm: grid.bpm(), confidence: 0.0, first_beat_ms: None }))
}

/// Steps 1–3: the candidate tempo from aubio's passes, a grid fitted to the
/// low-passed SpecFlux pass's beats (or from the candidate alone) and refined
/// on the envelope, then snapped. None when no tempo is found.
fn beat_grid(audio: &MonoAudio, envelope: &OnsetEnvelope) -> Option<Grid> {
    let filtered = MonoAudio {
        samples: low_pass_filter(&audio.samples, audio.sample_rate, 500.0),
        sample_rate: audio.sample_rate,
        duration_ms: audio.duration_ms,
    };
    let mut candidates: Vec<(f64, f64)> = Vec::new();
    let mut grid_pass: Option<TempoPass> = None;
    for mode in [OnsetMode::SpecFlux, OnsetMode::Hfc, OnsetMode::Complex] {
        let Ok(pass) = run_tempo_pass(&filtered, mode) else { continue };
        let (ibi_bpm, ibi_conf) = compute_bpm_from_ibis(&pass.beats);
        if ibi_bpm > 0.0 {
            candidates.push((fold_to_dj_range(ibi_bpm), ibi_conf));
        }
        if pass.aubio_bpm > 0.0 {
            candidates.push((fold_to_dj_range(pass.aubio_bpm), pass.aubio_confidence * 0.8));
        }
        if mode == OnsetMode::SpecFlux {
            grid_pass = Some(pass);
        }
    }
    // Cross-check on the unfiltered audio, at a lower weight.
    if let Ok(pass) = run_tempo_pass(audio, OnsetMode::SpecFlux) {
        let (ibi_bpm, ibi_conf) = compute_bpm_from_ibis(&pass.beats);
        if ibi_bpm > 0.0 {
            candidates.push((fold_to_dj_range(ibi_bpm), ibi_conf * 0.6));
        }
    }
    let candidate = pick_consensus(&candidates)?;
    let beats = grid_pass.map(|pass| pass.beats).unwrap_or_default();
    Some(snap(searched_grid(&beats, candidate, envelope)?, envelope))
}

/// Step 2: the envelope search from four phases a quarter beat apart, which
/// together cover the whole beat, and the result on the kicks wins: by then
/// each has its tempo, so its low-band strength over the track means
/// something. The phases start from the grid fitted to the pass's beats: its
/// tempo is close, but those beats can sit on any 16th of the beat (the pass
/// spaces them by its own period), and each search only reaches an eighth of
/// a beat, past which the hats on the other 16ths outscore the kicks. A fit
/// folded from a pass at twice the tempo may sit on either half of the beat;
/// the four starts cover both. When the beats give no grid (no pass, or too
/// few beats near the candidate), they start at the candidate's period. None
/// when that low-band strength is zero, in practice only in digital silence.
fn searched_grid(beats: &[f64], candidate: f64, envelope: &OnsetEnvelope) -> Option<Grid> {
    let fit = fit_grid(beats, candidate).unwrap_or(Grid { period_s: 60.0 / candidate, phase_s: 0.0 });
    let starts = (0..4).map(|i| Grid { phase_s: fit.phase_s + i as f64 * fit.period_s / 4.0, ..fit });
    on_the_kicks(starts.map(|start| envelope_search(start, envelope, true)), envelope)
        .filter(|grid| envelope.kick_strength(grid.phase_s, grid.period_s) > 0.0)
}

/// Of several grids, the one whose beats the low band jumps at most: the one
/// on the kicks (see `kick_strength`).
fn on_the_kicks(grids: impl Iterator<Item = Grid>, envelope: &OnsetEnvelope) -> Option<Grid> {
    grids.max_by(|a, b| envelope.kick_strength(a.phase_s, a.period_s).total_cmp(&envelope.kick_strength(b.phase_s, b.period_s)))
}

/// Step 2: the constant grid through the beats near `candidate`. A pass that
/// tracked twice (or half) the tempo is locked at its own rate, then folded.
/// A folded faster grid may sit on the off-beats; `searched_grid` starts from
/// every quarter beat of it, so the kicks are found either way.
fn fit_grid(beats: &[f64], candidate: f64) -> Option<Grid> {
    let (pass_bpm, _) = compute_bpm_from_ibis(beats);
    let factor = if pass_bpm > 0.0 { 2f64.powi((pass_bpm / candidate).log2().round().clamp(-2.0, 2.0) as i32) } else { 1.0 };
    let fast = refine_grid(beats, lock_tempo(beats, candidate * factor)?)?;
    Some(Grid { period_s: fast.period_s * factor, phase_s: fast.phase_s })
}

/// The tempo within ±2 % of `bpm` that the beats line up with best, with its
/// phase. Each beat is a unit vector at its phase within the beat; the tempo
/// whose vectors add up longest wins, and their direction is the phase.
/// Missing beats cost nothing, and off-beat strays mostly cancel out.
fn lock_tempo(beats: &[f64], bpm: f64) -> Option<Grid> {
    if beats.len() < MIN_BEATS_FOR_IBI {
        return None;
    }
    let steps = (bpm * LOCK_RANGE / LOCK_STEP_BPM).round() as i64;
    let mut best = (f64::NEG_INFINITY, 0.0, bpm); // (length, angle, bpm)
    for s in -steps..=steps {
        let candidate = bpm + s as f64 * LOCK_STEP_BPM;
        let period = 60.0 / candidate;
        let (mut x, mut y) = (0.0, 0.0);
        for &t in beats {
            let angle = 2.0 * PI * t / period;
            x += angle.cos();
            y += angle.sin();
        }
        let length = x.hypot(y);
        if length > best.0 {
            best = (length, y.atan2(x), candidate);
        }
    }
    let period_s = 60.0 / best.2;
    Some(Grid { period_s, phase_s: (best.1 / (2.0 * PI)).rem_euclid(1.0) * period_s })
}

/// Least squares through the beats within a quarter beat of `grid`: beat
/// time = phase + n × period over their beat numbers n. Done twice, so beats
/// the first fit moved out of reach drop out. None with too few beats.
fn refine_grid(beats: &[f64], mut grid: Grid) -> Option<Grid> {
    for _ in 0..2 {
        let points: Vec<(f64, f64)> = beats
            .iter()
            .filter_map(|&t| {
                let n = ((t - grid.phase_s) / grid.period_s).round();
                let offset = t - (grid.phase_s + n * grid.period_s);
                (offset.abs() <= grid.period_s / 4.0).then_some((n, t))
            })
            .collect();
        if points.len() < MIN_BEATS_FOR_IBI {
            return None;
        }
        let (period_s, phase_s) = fit_line(&points)?;
        grid = Grid { period_s, phase_s };
    }
    Some(grid)
}

/// Ordinary least squares y = a + b·x, as (b, a). None when x does not vary.
fn fit_line(points: &[(f64, f64)]) -> Option<(f64, f64)> {
    let n = points.len() as f64;
    let mean_x = points.iter().map(|p| p.0).sum::<f64>() / n;
    let mean_y = points.iter().map(|p| p.1).sum::<f64>() / n;
    let sxx: f64 = points.iter().map(|p| (p.0 - mean_x).powi(2)).sum();
    if sxx <= 0.0 {
        return None;
    }
    let sxy: f64 = points.iter().map(|p| (p.0 - mean_x) * (p.1 - mean_y)).sum();
    let slope = sxy / sxx;
    Some((slope, mean_y - slope * mean_x))
}

/// Step 2's second way (spec §2), needed because aubio's beats drift around
/// its own period: the tempo (unless `search_tempo` is false) and phase whose
/// grid carries the most onset strength, searched coarse to fine around the
/// start's beat nearest the middle, within an eighth of a beat of it.
fn envelope_search(grid: Grid, envelope: &OnsetEnvelope, search_tempo: bool) -> Grid {
    let middle = envelope.duration_s() / 2.0;
    let mut best = Grid { phase_s: grid.nearest(middle), ..grid };
    let mut best_score = envelope.onset_strength(best.phase_s, best.period_s);
    // Stage 2 reaches back ±15 ms from the phase stage 1 leaves. Off by half
    // its tempo step, stage 1's grid drifts duration × step / (4 × bpm) by the
    // ends, which smears its phase about as much; this step keeps that drift
    // at a quarter of the reach, so long tracks get a finer step (up to
    // STAGE1_MAX_S).
    let reach_s = 0.015;
    let coarse_bpm_step = (grid.bpm() * reach_s / envelope.duration_s().min(STAGE1_MAX_S)).min(0.05);
    // Per stage: BPM step and span either side, phase step and span either side (s).
    // Stage 1's phase stays within an eighth of a beat of the start, as further
    // out the full band's off-beat hats outscore the kicks. A start fitted to
    // aubio's beats can be on any 16th of the beat, so searched_grid covers
    // the beat with four starts a quarter beat apart.
    let stages = [
        (coarse_bpm_step, grid.bpm() * LOCK_RANGE, 0.005, grid.period_s / 8.0),
        (0.01, 0.05, 0.001, reach_s),
        (0.002, 0.01, 0.001, 0.003),
    ];
    for (bpm_step, bpm_span, phase_step, phase_span) in stages {
        let centre = best;
        let bpm_steps = if search_tempo { (bpm_span / bpm_step).round() as i64 } else { 0 };
        let phase_steps = (phase_span / phase_step).round() as i64;
        for b in -bpm_steps..=bpm_steps {
            let period_s = 60.0 / (centre.bpm() + b as f64 * bpm_step);
            for p in -phase_steps..=phase_steps {
                let candidate = Grid { period_s, phase_s: centre.phase_s + p as f64 * phase_step };
                let score = envelope.onset_strength(candidate.phase_s, candidate.period_s);
                if score > best_score {
                    best = candidate;
                    best_score = score;
                }
            }
        }
    }
    best
}

/// Step 3: a tempo within SNAP_BPM of a whole number becomes it, and the phase
/// is refitted at that tempo on the envelope, around the beat nearest the
/// middle, so the new tempo moves the ends least.
fn snap(grid: Grid, envelope: &OnsetEnvelope) -> Grid {
    let whole = grid.bpm().round();
    if (grid.bpm() - whole).abs() > SNAP_BPM {
        return grid;
    }
    let anchor = grid.nearest(envelope.duration_s() / 2.0);
    envelope_search(Grid { period_s: 60.0 / whole, phase_s: anchor }, envelope, false)
}
```

Rewrite `pick_consensus` to return the candidate only (no integer snap, no rounding):

```rust
/// Step 1: the candidate tempo: the median of the best cluster of folded
/// candidates, each cluster scored by its confidences times its size.
fn pick_consensus(candidates: &[(f64, f64)]) -> Option<f64> {
    let mut sorted = candidates.to_vec();
    sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
    let (&first, rest) = sorted.split_first()?;
    let mut clusters: Vec<Vec<(f64, f64)>> = Vec::new();
    let mut current = vec![first];
    for &(bpm, conf) in rest {
        let centre = current.iter().map(|c| c.0).sum::<f64>() / current.len() as f64;
        if (bpm - centre).abs() <= CONSENSUS_TOLERANCE {
            current.push((bpm, conf));
        } else {
            clusters.push(std::mem::replace(&mut current, vec![(bpm, conf)]));
        }
    }
    clusters.push(current);
    let score = |c: &Vec<(f64, f64)>| c.iter().map(|x| x.1).sum::<f64>() * c.len() as f64;
    let best = clusters.iter().max_by(|a, b| score(a).total_cmp(&score(b)))?;
    let mut bpms: Vec<f64> = best.iter().map(|c| c.0).collect();
    bpms.sort_by(f64::total_cmp);
    Some(bpms[bpms.len() / 2])
}
```

In `onset.rs`:
- Add `ENVELOPE_LATENCY_MS` (start at 0.0) and subtract it in `start_s`: `(FRAME / 2) as f64 / rate - ENVELOPE_LATENCY_MS / 1000.0`.
- Remove the `dead_code` allow on `full`.
- Add `onset_strength`, which samples `low + full` linearly interpolated at each grid beat:

```rust
/// Where the flux peaks sit from an onset, in ms (negative: before it):
/// measured on the synthetic kick tests and taken off the frame times, so a
/// grid found on the envelope sits on the kicks.
const ENVELOPE_LATENCY_MS: f64 = 0.0;

    /// The envelope's flux at a frame: low plus full band.
    fn envelope_flux(&self, frame: usize) -> f32 {
        self.low[frame] + self.full[frame]
    }

    /// Low plus full-band flux at time t, interpolated between frames.
    fn flux_at(&self, t: f64) -> f64 {
        let x = (t - self.start_s) / self.frame_s;
        if x < 0.0 || self.low.is_empty() {
            return 0.0;
        }
        let i = x.floor() as usize;
        if i + 1 >= self.low.len() {
            return 0.0;
        }
        let w = x - i as f64;
        let at = |j: usize| self.envelope_flux(j) as f64;
        at(i) * (1.0 - w) + at(i + 1) * w
    }

    /// The onset strength on a grid's beats: what the envelope search maximises.
    pub fn onset_strength(&self, phase_s: f64, period_s: f64) -> f64 {
        self.beats(phase_s, period_s).map(|t| self.flux_at(t)).sum()
    }
```

Callers:
- `commands/analysis.rs`, `analyze_tracks_batch`: `let bpm_result = bpm::detect_bpm_from_samples(&audio).ok().flatten();`
- `recodeck-eval.rs`, `analyze`: `bpm = detect_bpm_from_samples(&audio).ok().flatten();` and delete the "Today's detection reports a failure as BPM 0." comment.

- [ ] **Step 4: Calibrate `ENVELOPE_LATENCY_MS`**

Run: `cd src-tauri && cargo test --lib -- audio::bpm::tests::kick_tracks_give_their_tempo_and_grid audio::onset::tests::the_onset_strength_peaks_on_the_kicks --nocapture`

- Temporarily add `eprintln!` before the kick test's assertions, so every case shows its phase error.
- Set `ENVELOPE_LATENCY_MS` to the mean of the six errors, run again, then remove the prints.
- Measured 2026-10-18. At 0.0 the six errors were −1.97, −2.12, −2.64, −1.84, −1.72 and −2.47 ms, so the constant is −2.13. After that every case is within ±0.64 ms over the whole track, and within 0.001 BPM. `onset_strength` peaks at 0.137 s.

Expected: PASS. If any case is still beyond ±5 ms or ±0.05 BPM, do not loosen the test: stop and report the numbers.

- [ ] **Step 5: Run everything**

Run: `cd src-tauri && cargo test --lib && cargo check --features eval --bin recodeck-eval`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/audio/bpm.rs src-tauri/src/audio/onset.rs src-tauri/src/commands/analysis.rs src-tauri/src/bin/recodeck-eval.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "feat(bpm): fit a constant grid through precise beats, refine it on the onset envelope, snap, no 0 BPM"
```

### Task 12: First beat and confidence

**Files:**
- Modify: `src-tauri/src/audio/bpm.rs`

**Noise fix (2026-10-18, re-review).**
- White noise got a confident tempo: 0.7–0.9 at amplitudes 0.002–0.3. A beat counted as a hit when the low band's peak within 20 ms reached half its peak within half a beat, and noise does that 77–90 % of the time.
- `kick_near` (onset.rs) now asks for a peak that clears 3× the 90th percentile of the low-band flux within half a beat.
- Measured share of hits per rule:
  - 3× the median: noise 98–99 %.
  - ½ of the track's 99.5th percentile: noise 81–92 %.
  - The beat's strongest low onset: kicks under an off-beat bass drop to 68 %.
  - 3× the 90th percentile: white or brown noise 0–2 %; kicks, hats, off-beat bass and −40 dB kicks over a −60 dB floor 100 %; the tempo change 9 %.
- Noise now scores 0.00–0.01, while steady kicks stay at 1.0 and the tempo change at 0.55.

**Confidence from level jumps (2026-10-18, Checkpoint 2).** This replaces the 90th-percentile rule above.
- **Cause.** On the real library the 90th percentile of the low band's log flux around a beat is set by the bass line's onsets.
  - Kicks reach only 1.5–2.1× of it at the median, so only 5–33 % of beats cleared 3×.
  - Right tempos scored a median 0.207 (0.1 % at ≥ 0.9), wrong ones 0.057. Even Traktor's own grid scored a median 0.18.
  - `music_windows` was not the cause: 51–99 % of the windows count as music.
- **Rule.** A beat is a hit when the low band's level jump within 20 ms of it is at least `KICK_OVER_SIXTEENTHS` (1.25) × the largest jump at the beat's other quarters (−¼, +¼, +½ beat).
  - The jump is `kick_strength`'s: the loudest within 60 ms after, less the quietest within 60 ms before, as square roots of the energy.
- **Whole library, target set (right = within 0.5 BPM of Traktor), old → new.**
  - Right tempos: median 0.207 → 0.777, ≥ 0.9 0.1 → 22.2 %, ≥ 0.5 6.5 → 86.2 %.
  - Wrong tempos: median 0.057 → 0.138.
  - Right-tempo grids within ⅛ beat of half a beat off: median 0.182 → 0.356 (10 tracks).
  - The report's means: right 0.237 → 0.734, wrong 0.154 → 0.356.
  - BPM is unchanged, and grids are unchanged within the eval's run-to-run noise: two runs of the same code differ on about 30 first beats, by under 1 ms.
- **Synthetic.** Noise 0.06–0.09, the tempo change 0.63, steady kicks 1.0. The rolling bass's true grid goes from 0.44 to 1.0, and its grid half a beat off scores 0.0.
- **Onset within 20 ms (review fix).** The jump's 60 ms after-window reached kicks that come later, so on the kick test grids from 60 ms before the kicks to 40 ms after them all scored 1.0: a flam looked perfectly confident.
  - A hit now also needs the low band's strongest flux within `KICK_ONSET_REACH_BEATS` (⅛ beat) of the beat to lie within 20 ms of it.
  - Kick test, grid offset → confidence: ±15 ms 1.0; −20 ms 0.78 and +20 ms 0.22; ±25 ms and beyond 0.0.
  - Synthetic: noise 0.02–0.04, the tempo change 0.55. Steady kicks, hats, the off-beat bass and the rolling bass stay at 1.0, and the rolling bass half a beat off at 0.0.
- **Whole library, target set, run p2-conf20, level jumps alone → with the onset check.**
  - Right tempos: median 0.777 → 0.583, ≥ 0.9 22.2 → 1.3 %, ≥ 0.5 86.2 → 67.4 %.
  - Wrong tempos: median 0.138 → 0.061.
  - Right-tempo grids within ⅛ beat of half a beat off: median 0.356 → 0.280 (9 tracks).
  - The report's means: right 0.734 → 0.567, wrong 0.356 → 0.261.
  - BPM is unchanged on 1957 of 1958 rows. The other sits at 128.980, exactly 0.02 from 129, and snapped this run: run-to-run noise at the snap's edge, as `kick_near` does not touch the tempo.
- **The onset from the envelope (variant C).** Spec §2 step 5 says "within 20 ms of an envelope peak", and the grid search maximises the envelope (low plus full band). The onset check now takes the envelope's strongest flux within ⅛ beat, not the low band's.
  - Diagnostic, right-tempo tracks: each track's median offset of the peak from our grid beats.
    - Low band: library median +3.1 ms (p10 −0.7, p90 +7.4).
    - Envelope: library median −0.1 ms (p10 −1.1, p90 +0.5).
    - Both medians are well inside ±20 ms, so the low band's drop comes from its peak scattering from beat to beat, not from a shift.
  - Kick test, grid offset → confidence: ±15 ms 1.0; −20 ms 0.59 and +20 ms 0.41; ±25 ms and beyond 0.0.
  - Synthetic: noise 0.03, the tempo change 0.56. Steady kicks, hats, 16th hats, the off-beat bass and the rolling bass stay at 1.0, and the rolling bass half a beat off at 0.0.
  - Whole library, target set, run p2-confenv:
    - Right tempos: median 0.754 (p2-conf 0.777, p2-conf20 0.583), ≥ 0.9 19.1 %, ≥ 0.5 84.0 %.
    - Wrong tempos: median 0.063.
    - Half-beat-off grids: median 0.335 (10 tracks).
    - The report's means: right 0.715, wrong 0.321.
    - BPM is identical to p2-conf on every row.

- [ ] **Step 1: Write the failing tests** (add `tempo_change` to the `test_signals` import)

```rust
    #[test]
    fn the_first_beat_is_the_first_kick() {
        for (rate, first) in [(44100, 0.137), (48000, 0.137), (44100, 8.137)] {
            let audio = kick_track(123.5, rate, 60.0, first);
            let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");
            assert!((result.bpm - 123.5).abs() <= 0.05, "{rate} Hz, first kick at {first} s: {:.3} BPM", result.bpm);
            let first_ms = result.first_beat_ms.expect("a first beat");
            assert!((first_ms - first * 1000.0).abs() <= 5.0, "{rate} Hz, first kick at {first} s: {first_ms:.1} ms");
        }
    }

    #[test]
    fn a_tempo_change_lowers_the_confidence() {
        let steady = detect_bpm_from_samples(&kick_track(123.0, 44100, 60.0, 0.137)).unwrap().expect("a tempo");
        let changing = detect_bpm_from_samples(&tempo_change(120.0, 126.0, 44100, 30.0)).unwrap().expect("a tempo");
        assert!(steady.confidence >= 0.9, "steady {:.2}", steady.confidence);
        assert!(changing.confidence < steady.confidence, "changing {:.2}, steady {:.2}", changing.confidence, steady.confidence);
    }

    #[test]
    fn noise_gets_no_confident_tempo() {
        for amplitude in [0.002, 0.1, 0.3] {
            if let Some(result) = detect_bpm_from_samples(&white_noise(44100, 60.0, amplitude)).unwrap() {
                assert!(result.confidence < 0.3, "noise at {amplitude}: {:.2} BPM, confidence {:.2}", result.bpm, result.confidence);
            }
        }
    }

    #[test]
    fn quiet_kicks_keep_their_tempo_and_confidence() {
        // Kicks at -40 dB over a -60 dB noise floor.
        let mut audio = kick_track(124.0, 44100, 60.0, 0.137);
        let noise = white_noise(44100, 60.0, 0.002);
        for (sample, n) in audio.samples.iter_mut().zip(&noise.samples) {
            *sample = *sample * 0.01 + n;
        }
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");
        assert!((result.bpm - 124.0).abs() <= 0.05, "{:.3} BPM", result.bpm);
        assert!(result.confidence >= 0.9, "confidence {:.2}", result.confidence);
    }

    #[test]
    fn a_rolling_bass_leaves_the_kicks_confident() {
        // The bass rises on every 16th between the kicks, as often as the
        // kick, and over the whole low band, as on real bass lines.
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&rolling_bass(124.0, 44100, 60.0, 0.137, 55.0, 0.3));
        let confidence = grid_confidence(Grid { period_s: period, phase_s: 0.137 }, &envelope);
        assert!(confidence >= 0.9, "confidence {confidence:.2}");
    }

    #[test]
    fn a_grid_a_flam_off_the_kicks_scores_low() {
        // 35 ms off, kick and beat sound as two hits; 10 ms off, as one.
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&kick_track(124.0, 44100, 60.0, 0.137));
        for offset_ms in [-35.0, 35.0, -10.0, 10.0] {
            let grid = Grid { period_s: period, phase_s: 0.137 + offset_ms / 1000.0 };
            let confidence = grid_confidence(grid, &envelope);
            if f64::abs(offset_ms) > 20.0 {
                assert!(confidence < 0.5, "{offset_ms:+} ms off: confidence {confidence:.2}");
            } else {
                assert!(confidence >= 0.9, "{offset_ms:+} ms off: confidence {confidence:.2}");
            }
        }
    }

    #[test]
    fn a_grid_half_a_beat_off_a_rolling_bass_scores_low() {
        let period = 60.0 / 124.0;
        let envelope = OnsetEnvelope::compute(&rolling_bass(124.0, 44100, 60.0, 0.137, 55.0, 0.3));
        let confidence = grid_confidence(Grid { period_s: period, phase_s: 0.137 + period / 2.0 }, &envelope);
        assert!(confidence < 0.5, "confidence {confidence:.2}");
    }
```

The rolling bass, in `test_signals.rs`:

```rust
/// `kick_track` with a rolling bass, as in psytrance and much techno: a note
/// on each 16th between the kicks, rising in 2 ms and fading over 60 ms, at
/// `bass_gain`. It has a second and third harmonic, so like a real bass line
/// it fills the whole low band, and its flux rises as often as the kick's.
pub fn rolling_bass(bpm: f64, sample_rate: u32, seconds: f64, first_s: f64, bass_hz: f64, bass_gain: f64) -> MonoAudio {
    let mut track = kick_track(bpm, sample_rate, seconds, first_s);
    let rate = sample_rate as f64;
    let total = track.samples.len();
    let length = (15.0 / bpm * rate) as usize;
    let mut sixteenth = 0;
    loop {
        let start = ((first_s + sixteenth as f64 * 15.0 / bpm) * rate).round() as usize;
        if start >= total {
            break;
        }
        if sixteenth % 4 != 0 {
            for j in 0..length.min(total - start) {
                let t = j as f64 / rate;
                let envelope = (t / 0.002).min(1.0) * (-t / 0.06).exp();
                let w = 2.0 * PI * bass_hz * t;
                let note = w.sin() + 0.7 * (2.0 * w).sin() + 0.5 * (3.0 * w).sin();
                track.samples[start + j] += (bass_gain * envelope * note) as f32;
            }
        }
        sixteenth += 1;
    }
    track
}
```

Put back the `result.confidence > 0.0` assertion in `test_bpm_detection_120bpm` that Task 11 removed.

- [ ] **Step 2: Run to see them fail**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: FAIL ("a first beat" panics; confidence is 0.0).

- [ ] **Step 3: Implement**

```rust
/// How close a grid beat must be to a kick to count (spec §2, step 5).
const HIT_TOLERANCE_S: f64 = 0.020;

/// Step 4: the grid beat nearest the first strong low-band onset, in ms:
/// where the music starts, and the first bar's downbeat.
fn first_beat_ms(grid: Grid, envelope: &OnsetEnvelope) -> Option<f64> {
    let mut beat = grid.nearest(envelope.first_strong_low_onset()?);
    if beat < 0.0 {
        beat += grid.period_s;
    }
    Some(beat * 1000.0)
}

/// Step 5: the share of grid beats inside music sections that have a kick
/// within 20 ms: the envelope's strongest onset nearby is that close, and the
/// low band jumps there more than at the beat's other 16ths (see `kick_near`). A steady track scores near 1; a tempo change or a live
/// recording scores lower, because the grid drifts off beats that are still
/// there; noise scores low.
fn grid_confidence(grid: Grid, envelope: &OnsetEnvelope) -> f64 {
    let music = envelope.music_windows();
    let (mut beats, mut hits) = (0usize, 0usize);
    for t in envelope.beats(grid.phase_s, grid.period_s) {
        if !envelope.in_music(&music, t) {
            continue;
        }
        beats += 1;
        if envelope.kick_near(t, HIT_TOLERANCE_S, grid.period_s) {
            hits += 1;
        }
    }
    if beats == 0 { 0.0 } else { hits as f64 / beats as f64 }
}
```

In `detect_bpm_from_samples`:

```rust
    Ok(Some(BpmResult {
        bpm: grid.bpm(),
        confidence: grid_confidence(grid, &envelope),
        first_beat_ms: first_beat_ms(grid, &envelope),
    }))
```

- [ ] **Step 4: Run to see them pass**

Run: `cd src-tauri && cargo test --lib audio::bpm`
Expected: PASS. If Task 11 had to mark its phase check `#[ignore]`, the first-beat assertion here misses the same way. Split it into its own test with the same `#[ignore = "needs the envelope search (Task 14)"]`; the BPM and confidence assertions must still pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/bpm.rs
git commit -m "feat(bpm): first beat from the first kick, confidence from grid hits"
```

### Task 13: Measure, tune the snap, decide gapless

- [ ] **Step 1: Run** the tool as `p2-grid` and add a row to Results.
- [ ] **Step 2: `SNAP_BPM`.** Run with `SNAP_BPM` set to `0.0`, `0.02` and `0.1` (names `p2-snap0`, `p2-snap002`, `p2-snap01`); `p2-grid` is 0.05. Add a row for each.
  - Keep the value with the highest "within ±0.05" share on the target set.
  - On a tie, the higher "within ±0.5" share wins. Then the smaller value.
  - Set the constant and run `cargo test --lib audio::bpm`.
- [ ] **Step 3: Gapless.** Set `GAPLESS = true` in `decoder.rs` and run `p2-gapless`. Compare the MP3 grid against `p2-grid`: the "≤20" share, and the signed median against the lossless one.
  - Keep `true` only if the MP3 "≤20" share rises by more than 1 point.
  - Otherwise set it back to `false`.
- [ ] **Step 4: Check the targets** on the best run:
  - BPM within ±0.5 ≥ 98 % on the target set;
  - grid ≤20 ms ≥ 90 % for MP3. The user decided 2026-10-18 that only 4 WAV/AIFF/FLAC tracks have a Traktor marker, so lossless is reported, not targeted; the synthetic ±5 ms tests cover it;
  - seconds per track ≤ 1.5 × the baseline.

  Also note the signed medians. If WAV/AIFF/FLAC sit more than 5 ms from Traktor in one direction, report it at the checkpoint and do not tune toward Traktor.
- [ ] **Step 5: Commit** the constants and the Results rows:

```bash
git add src-tauri/src/audio/bpm.rs src-tauri/src/audio/decoder.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "tune(bpm): snap and gapless settings measured against Traktor"
```

### Task 14: Envelope search (done in Task 11)

**Done in Task 11** (needed: aubio's beat phase drifts). Task 11 has the final code; this task's text is what it started from. Go from Task 13 to Task 15.

**Files:**
- Modify: `src-tauri/src/audio/onset.rs`, `src-tauri/src/audio/bpm.rs`

- [ ] **Step 1: Envelope timing.**
  - Add `ENVELOPE_LATENCY_MS` (start at 0.0) to `onset.rs`. Subtract it in `start_s`: `(FRAME / 2) as f64 / rate - ENVELOPE_LATENCY_MS / 1000.0`.
  - Add `onset_strength`, which samples `low + full` linearly interpolated at each grid beat:

```rust
    /// Low plus full-band flux at time t, interpolated between frames.
    fn flux_at(&self, t: f64) -> f64 {
        let x = (t - self.start_s) / self.frame_s;
        if x < 0.0 || self.low.is_empty() {
            return 0.0;
        }
        let i = x.floor() as usize;
        if i + 1 >= self.low.len() {
            return 0.0;
        }
        let w = x - i as f64;
        let at = |j: usize| (self.low[j] + self.full[j]) as f64;
        at(i) * (1.0 - w) + at(i + 1) * w
    }

    /// The onset strength on a grid's beats: what the envelope search maximises.
    pub fn onset_strength(&self, phase_s: f64, period_s: f64) -> f64 {
        self.beats(phase_s, period_s).map(|t| self.flux_at(t)).sum()
    }
```

  - Calibrate with a test. On `kick_track(124.0, 44100, 30.0, 0.137)`, `onset_strength` must peak within ±1 ms of phase 0.137, scanning phases 0.100–0.180 s in 1 ms steps. Print the best phase, set `ENVELOPE_LATENCY_MS` to the difference, and assert ±1 ms. Remove the `dead_code` allow on `full`.

- [ ] **Step 2: Search** (in `bpm.rs`). Write a test first: on a kick track with `BEAT_LATENCY_MS` deliberately wrong by 8 ms, the searched grid is within ±2 ms of the kicks. Then implement:

```rust
/// Step 2's second way (spec §2), used because the measurement asked for it:
/// the tempo (unless snapped) and phase whose grid carries the most onset
/// strength, searched coarse to fine around the beat nearest the middle.
fn envelope_search(grid: Grid, envelope: &OnsetEnvelope, search_tempo: bool) -> Grid {
    let middle = envelope.duration_s() / 2.0;
    let mut best = Grid { phase_s: grid.nearest(middle), ..grid };
    let mut best_score = envelope.onset_strength(best.phase_s, best.period_s);
    let coarse_bpm = if search_tempo { (0.05, grid.bpm() * 0.02) } else { (0.05, 0.0) };
    let fine_bpm = if search_tempo { (0.01, 0.05) } else { (0.01, 0.0) };
    for ((bpm_step, bpm_span), (phase_step, phase_span)) in
        [(coarse_bpm, (0.005, grid.period_s / 2.0)), (fine_bpm, (0.001, 0.005))]
    {
        let centre = best;
        let bpm_steps = (bpm_span / bpm_step).round() as i64;
        let phase_steps = (phase_span / phase_step).round() as i64;
        for b in -bpm_steps..=bpm_steps {
            let period_s = 60.0 / (centre.bpm() + b as f64 * bpm_step);
            for p in -phase_steps..=phase_steps {
                let candidate = Grid { period_s, phase_s: centre.phase_s + p as f64 * phase_step };
                let score = envelope.onset_strength(candidate.phase_s, candidate.period_s);
                if score > best_score {
                    best = candidate;
                    best_score = score;
                }
            }
        }
    }
    best
}
```

  In `beat_grid`, after `snap`:

```rust
    let snapped = snap(grid, &beats);
    // A snapped tempo stays; only its phase is searched.
    let whole = (snapped.bpm() - snapped.bpm().round()).abs() < 1e-9;
    Some(envelope_search(snapped, envelope, !whole))
```

- [ ] **Step 3: Measure.** Run `p2-search` and add a row.
  - Keep the search if all three hold:
    - at least one of three figures rose: BPM ±0.5 (target set), grid ≤20 ms MP3, grid ≤20 ms WAV/AIFF/FLAC;
    - none of the three fell by more than 0.5 points;
    - time stays ≤ 1.5 × the baseline.
  - Otherwise revert with `git checkout -- src-tauri/src/audio/bpm.rs src-tauri/src/audio/onset.rs` and record "dropped".
  - If kept, remove the `#[ignore]` from Task 11's phase test and from Task 12's first-beat test; both must pass.
- [ ] **Step 4: Commit** (kept code, or only the Results row):

```bash
git add src-tauri/src/audio/bpm.rs src-tauri/src/audio/onset.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "feat(bpm): envelope search for tempo and phase (measured)"
```

### Task 15: CHECKPOINT 2

- [ ] Run `cd src-tauri && cargo test --lib && cargo check --features eval --bin recodeck-eval`. Then stop and report to the user in Serbian:
  - BPM ±0.05 and ±0.5 against the baseline;
  - the grid ≤10/20/40 ms per format, and bar phase against Traktor and Rekordbox;
  - the confidence gap, and time per track;
  - which targets were met.

  If a target was missed, say so: the user decides whether this part ships. Wait for the go-ahead.

---

# Phase 3: Key (spec §3)

Every measured step uses the **consensus** block of the report. Keep a step only if the MIREX score rises against the best kept so far; on a tie, the exact share decides. A step that is dropped is reverted with `git checkout -- src-tauri/src/audio/key.rs` and only its Results row is committed.

### Task 16: Open Key from `formats::keys`

**Files:**
- Modify: `src-tauri/src/formats/keys.rs`, `src-tauri/src/audio/key.rs`

- [ ] **Step 1: Failing test** (in `keys.rs` tests)

```rust
    #[test]
    fn open_key_is_standard() {
        assert_eq!(open_key("8B").as_deref(), Some("1d")); // C
        assert_eq!(open_key("8A").as_deref(), Some("1m")); // A minor
        assert_eq!(open_key("1A").as_deref(), Some("6m"));
        assert_eq!(open_key("6B").as_deref(), Some("11d"));
        for n in 1..=12 {
            for letter in ["A", "B"] {
                let code = format!("{n}{letter}");
                assert_eq!(camelot_from_tag(&open_key(&code).unwrap()), Some(code.clone()));
            }
        }
        assert_eq!(open_key("Am"), None);
    }
```

- [ ] **Step 2: Run to see it fail.** Run `cd src-tauri && cargo test --lib formats::keys`. Expected: compile error.
- [ ] **Step 3: Implement**

```rust
/// Camelot to Open Key as Traktor shows it ("8B" → "1d", "8A" → "1m").
pub fn open_key(camelot: &str) -> Option<String> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(format!("{}{}", (number + 4) % 12 + 1, if minor { 'm' } else { 'd' }))
}
```

In `key.rs`:
- delete `OPENKEY_MAJOR` and `OPENKEY_MINOR`;
- set `open_key: crate::formats::keys::open_key(&camelot).unwrap_or_default()`, computed after `camelot`;
- fix the `KeyResult::open_key` doc example to "1m", "11d".

- [ ] **Step 4: Run.** Run `cd src-tauri && cargo test --lib`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/formats/keys.rs src-tauri/src/audio/key.rs
git commit -m "fix(key): standard Open Key from formats::keys"
```

### Task 17: The kick test, and frame chroma computed once

**Files:**
- Modify: `src-tauri/src/audio/key.rs`

- [ ] **Step 1: The kick test** (in `mod tests`)

```rust
    /// A minor as four chords (Am, Dm, Am, E: i–iv–i–V), 2.5 s each, under a
    /// loud kick (a 120 → 50 Hz sweep, 0.15 s) on every beat at 125 BPM.
    fn a_minor_under_a_kick(sample_rate: u32, seconds: f64) -> MonoAudio {
        let chords: [&[f64]; 4] =
            [&[220.0, 261.63, 329.63], &[293.66, 349.23, 440.0], &[220.0, 261.63, 329.63], &[329.63, 415.30, 493.88]];
        let rate = sample_rate as f64;
        let beat = 60.0 / 125.0;
        let sweep = (50.0f64 / 120.0).ln() / 0.15;
        let samples = (0..(rate * seconds) as usize)
            .map(|i| {
                let t = i as f64 / rate;
                let chord = chords[((t / 2.5) as usize) % 4];
                let mut s = 0.0;
                for &f in chord {
                    for (h, w) in [(1.0, 1.0), (2.0, 0.5), (3.0, 0.25), (4.0, 0.125)] {
                        s += w * (2.0 * PI * f * h * t).sin();
                    }
                }
                s /= chord.len() as f64 * 1.875;
                let tk = t % beat;
                if tk < 0.15 {
                    s += 1.5 * (2.0 * PI * 120.0 * ((sweep * tk).exp() - 1.0) / sweep).sin() * (-tk / 0.08).exp();
                }
                (s * 0.5) as f32
            })
            .collect();
        MonoAudio { samples, sample_rate, duration_ms: (seconds * 1000.0) as u64 }
    }

    #[test]
    fn a_minor_under_a_loud_kick_is_8a() {
        let result = detect_key_from_samples(&a_minor_under_a_kick(44100, 40.0)).unwrap();
        assert_eq!(result.camelot, "8A", "got {} ({})", result.camelot, result.musical_key);
    }
```

Run `cd src-tauri && cargo test --lib audio::key::tests::a_minor_under_a_loud_kick_is_8a`. If it fails with today's code, add `#[ignore = "phase 3: must pass by Task 23"]` and note the result in the commit.

- [ ] **Step 2: Frame chroma refactor.** Behaviour should stay the same; the segment edges move to frame boundaries. Split `compute_chromagram`:

```rust
/// The bins the chroma reads: up to the highest harmonic plus the whitening window.
fn used_bins(sample_rate: u32) -> usize {
    let top = (MAX_FREQ * NUM_HARMONICS as f64 * FFT_SIZE as f64 / sample_rate as f64).ceil() as usize;
    (top + WHITENING_WINDOW + 2).min(FFT_SIZE / 2 + 1)
}

/// The chroma of each frame of `samples` (FFT_SIZE samples every HOP_SIZE),
/// before any summing.
fn frame_chromas(samples: &[f32], sample_rate: u32, tuning_offset_cents: f64) -> Vec<[f64; 12]> {
    let ref_a = 440.0 * 2.0f64.powf(tuning_offset_cents / 1200.0);
    let fft = FftPlanner::new().plan_fft_forward(FFT_SIZE);
    let bins = used_bins(sample_rate);
    let window: Vec<f64> =
        (0..FFT_SIZE).map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (FFT_SIZE - 1) as f64).cos())).collect();
    // `bin_info`: the exact closure from compute_chromagram (frequency → pitch class + freq_weight), over 0..bins.
    let bin_info: Vec<Option<(usize, f64)>> = (0..bins)
        .map(|bin| {
            let freq = bin as f64 * sample_rate as f64 / FFT_SIZE as f64;
            if !(MIN_FREQ..=MAX_FREQ).contains(&freq) {
                None
            } else {
                let semitones_from_a = 12.0 * (freq / ref_a).log2();
                let pitch_class = ((semitones_from_a.round() as i32 + 9) % 12 + 12) % 12;
                Some((pitch_class as usize, freq_weight(freq)))
            }
        })
        .collect();
    let frames = if samples.len() >= FFT_SIZE { (samples.len() - FFT_SIZE) / HOP_SIZE + 1 } else { 0 };
    (0..frames)
        .map(|f| {
            let start = f * HOP_SIZE;
            let mut buffer: Vec<Complex<f64>> = samples[start..start + FFT_SIZE]
                .iter()
                .enumerate()
                .map(|(i, &s)| Complex::new(s as f64 * window[i], 0.0))
                .collect();
            fft.process(&mut buffer);
            let magnitudes: Vec<f64> = (0..bins).map(|b| buffer[b].norm()).collect();
            chroma_of(&magnitudes, &bin_info, sample_rate)
        })
        .collect()
}

/// One frame's chroma from its magnitudes: each bin whitened by its
/// neighbourhood, with its harmonics, weighted by frequency.
fn chroma_of(magnitudes: &[f64], bin_info: &[Option<(usize, f64)>], sample_rate: u32) -> [f64; 12] {
    let half_w = WHITENING_WINDOW / 2;
    let whiten = |bin: usize| {
        let lo = bin.saturating_sub(half_w);
        let hi = (bin + half_w + 1).min(magnitudes.len());
        let average = magnitudes[lo..hi].iter().sum::<f64>() / (hi - lo) as f64;
        if average > 1e-12 { magnitudes[bin] / average } else { 0.0 }
    };
    let mut chroma = [0.0f64; 12];
    for (bin, info) in bin_info.iter().enumerate() {
        let Some((pc, weight)) = info else { continue };
        let mut energy = whiten(bin) * HARMONIC_WEIGHTS[0] * weight;
        for h in 1..NUM_HARMONICS {
            let harmonic_bin = bin * (h + 1);
            let h_freq = harmonic_bin as f64 * sample_rate as f64 / FFT_SIZE as f64;
            if harmonic_bin < magnitudes.len() && h_freq <= MAX_FREQ * NUM_HARMONICS as f64 {
                energy += whiten(harmonic_bin) * HARMONIC_WEIGHTS[h] * weight;
            }
        }
        chroma[*pc] += energy;
    }
    chroma
}

/// Frame chromas summed and normalised to 1.
fn sum_chromas(frames: &[[f64; 12]]) -> [f64; 12] {
    let mut chroma = [0.0f64; 12];
    for frame in frames {
        for (total, value) in chroma.iter_mut().zip(frame) {
            *total += value;
        }
    }
    let total: f64 = chroma.iter().sum();
    if total > 0.0 {
        for value in chroma.iter_mut() {
            *value /= total;
        }
    }
    chroma
}
```

In `detect_key_from_samples`, compute the frames once and cut segments in frames:

```rust
    let frames = frame_chromas(analysis_samples, audio.sample_rate, tuning_offset_cents);
    let segment_frames = segment_samples.saturating_sub(FFT_SIZE) / HOP_SIZE + 1;
    let segment_hop_frames = (segment_hop / HOP_SIZE).max(1);
    let num_segments = if frames.len() >= segment_frames {
        (frames.len() - segment_frames) / segment_hop_frames + 1
    } else {
        0
    };
    let (best_key_index, best_is_minor, best_corr, second_best_corr, vote_fraction) =
        if num_segments >= MIN_SEGMENTS_FOR_VOTING {
            segment_voted_key(&frames, segment_frames, segment_hop_frames)
        } else {
            let (k, m, c1, c2) = match_key_profiles(&sum_chromas(&frames));
            (k, m, c1, c2, 1.0)
        };
```

`segment_voted_key(frames: &[[f64; 12]], segment_frames: usize, hop_frames: usize)` loops `offset` over frames. It takes `sum_chromas(&frames[offset..offset + segment_frames])` in place of `compute_chromagram`; the rest of its body is unchanged. Delete `compute_chromagram` if nothing else uses it.

- [ ] **Step 3: Tests.** Run `cd src-tauri && cargo test --lib audio::key`. Expected: PASS (the kick test may stay ignored).
- [ ] **Step 4: Measure** `p3-frames`. The consensus MIREX should be within 0.005 of the baseline; it is a refactor. If it is lower by more, look for the difference before going on. Record the row.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/key.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "refactor(key): frame chroma computed once; A minor under a kick test"
```

### Task 18: Remove the heuristics (spec §3, step 1)

- [ ] **Step 1:** In `match_key_profiles`, delete:
  - the "Minor key bias" block;
  - the "Dominant confusion fix" block;
  - the "cross quality" block.

  The function returns the vote's `(best_key, best_is_minor, best_corr, second_best_corr)` with no `mut`. Update its doc comment and the module's top comment (item 3 mentions the minor bias and dominant correction).
- [ ] **Step 2:** Run `cd src-tauri && cargo test --lib audio::key`. If one of the loose chord tests now fails, the test was leaning on a heuristic.
  - Do not re-add the heuristic.
  - If the step is kept, mark that test `#[ignore = "leaned on a removed heuristic (Task 18)"]` and list it at Checkpoint 3.
- [ ] **Step 3:** Measure `p3-noheur`, then keep or drop it by the rule. Commit:

```bash
git add src-tauri/src/audio/key.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "fix(key): drop the parallel-minor, fifth and cross-check heuristics (measured)"
```

### Task 19: Harmonic/percussive separation (step 2.1)

- [ ] **Step 1: Test first**

```rust
    #[test]
    fn a_drum_hit_is_not_harmonic() {
        // 12 frames × 40 bins: a held note in bin 10, a broadband hit in frame 6.
        let mut spectrogram = vec![vec![0.01f32; 40]; 12];
        for frame in spectrogram.iter_mut() {
            frame[10] = 1.0;
        }
        for bin in 0..40 {
            spectrogram[6][bin] = 1.0;
        }
        let harmonic = harmonic_part(&spectrogram);
        assert_eq!(harmonic[3][10], 1.0); // the note stays
        assert_eq!(harmonic[6][25], 0.0); // the hit goes
    }
```

- [ ] **Step 2: Implement**

```rust
/// Harmonic/percussive separation (spec §3, step 2.1): the median filters'
/// sizes, in frames along time and in bins along frequency.
const HPSS_TIME_FRAMES: usize = 9;
const HPSS_FREQ_BINS: usize = 17;

/// The harmonic part of a magnitude spectrogram (frames × bins): a bin keeps
/// its magnitude where the median along time (held notes) is at least the
/// median along frequency (drum hits), else it becomes 0.
fn harmonic_part(spectrogram: &[Vec<f32>]) -> Vec<Vec<f32>> {
    let frames = spectrogram.len();
    let Some(bins) = spectrogram.first().map(Vec::len) else { return Vec::new() };
    let mut scratch: Vec<f32> = Vec::with_capacity(HPSS_FREQ_BINS.max(HPSS_TIME_FRAMES));
    let mut median = |values: &mut dyn Iterator<Item = f32>| -> f32 {
        scratch.clear();
        scratch.extend(values);
        let mid = scratch.len() / 2;
        *scratch.select_nth_unstable_by(mid, f32::total_cmp).1
    };
    let mut out = vec![vec![0f32; bins]; frames];
    for f in 0..frames {
        let (t0, t1) = (f.saturating_sub(HPSS_TIME_FRAMES / 2), (f + HPSS_TIME_FRAMES / 2 + 1).min(frames));
        for b in 0..bins {
            let along_time = median(&mut (t0..t1).map(|g| spectrogram[g][b]));
            let (b0, b1) = (b.saturating_sub(HPSS_FREQ_BINS / 2), (b + HPSS_FREQ_BINS / 2 + 1).min(bins));
            let along_frequency = median(&mut spectrogram[f][b0..b1].iter().copied());
            if along_time >= along_frequency {
                out[f][b] = spectrogram[f][b];
            }
        }
    }
    out
}
```

`frame_chromas` now keeps the magnitudes (as `f32`, only `used_bins`), runs `harmonic_part` over them, and builds each frame's chroma from the harmonic part:

```rust
    let spectrogram: Vec<Vec<f32>> = (0..frames)
        .map(|f| {
            /* window + FFT as before */
            (0..bins).map(|b| buffer[b].norm() as f32).collect()
        })
        .collect();
    harmonic_part(&spectrogram)
        .iter()
        .map(|m| chroma_of(&m.iter().map(|&v| v as f64).collect::<Vec<_>>(), &bin_info, sample_rate))
        .collect()
```

- [ ] **Step 3:** Run `cd src-tauri && cargo test --lib audio::key`. Measure `p3-hpss`, check time against 1.5 × the baseline, then keep or drop it by the rule (time over budget means drop). Commit:

```bash
git add src-tauri/src/audio/key.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "feat(key): chroma from the harmonic part only (measured)"
```

### Task 20: Per-frame normalisation (step 2.2)

- [ ] **Step 1: Test first**

```rust
    #[test]
    fn a_frame_sums_to_one() {
        let frame = normalized([2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0]);
        assert!((frame.iter().sum::<f64>() - 1.0).abs() < 1e-12);
        assert_eq!(normalized([0.0; 12]), [0.0; 12]);
    }
```

- [ ] **Step 2: Implement**

```rust
/// A frame's chroma scaled to sum 1, so loud frames (drums) weigh no more
/// than quiet ones (spec §3, step 2.2).
fn normalized(mut chroma: [f64; 12]) -> [f64; 12] {
    let total: f64 = chroma.iter().sum();
    if total > 1e-12 {
        for value in chroma.iter_mut() {
            *value /= total;
        }
    }
    chroma
}
```

Apply it to each frame's chroma in `frame_chromas`.

- [ ] **Step 3:** Run the tests, measure `p3-norm`, keep or drop by the rule, and commit (`feat(key): each frame's chroma normalised (measured)`).

### Task 21: Frequency floor (step 2.3)

- [ ] **Step 1:** `MIN_FREQ` also drives `estimate_tuning`, so give the chroma its own floor.
  - Add `const CHROMA_MIN_FREQ: f64 = 65.0;` with a one-line doc ("the lowest frequency the chroma reads; tuning keeps MIN_FREQ").
  - Use it only in `frame_chromas`' `bin_info`.
  - Measure `CHROMA_MIN_FREQ` at `100.0` (`p3-floor100`) and at `130.0` (`p3-floor130`) against 65.
- [ ] **Step 2:** Keep the best by the rule (65 if neither is better). Run `cargo test --lib audio::key`, then commit (`tune(key): chroma frequency floor (measured)`).

### Task 22: Profiles (step 3)

- [ ] **Step 1: Implement the choice**

```rust
/// Temperley's profiles ("What's Key for Key?", 1999).
const TEMPERLEY_MAJOR: [f64; 12] = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TEMPERLEY_MINOR: [f64; 12] = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

/// Which profiles choose the key: one set alone, or today's three-way vote
/// (spec §3, step 3). Measured; see the plan's Results.
enum Profiles {
    Vote,
    Single(&'static [f64; 12], &'static [f64; 12]),
}
const PROFILES: Profiles = Profiles::Vote;
```

At the top of `match_key_profiles`, for `Profiles::Single(major, minor)`, return that set's best key with its best and second-best correlation. That is the same loop as one profile set in the vote. For `Profiles::Vote`, run the vote as before.

- [ ] **Step 2:** Measure `Single` with each of Shaath, EDMA, Krumhansl and Temperley (`p3-shaath`, `p3-edma`, `p3-krumhansl`, `p3-temperley`) against the vote.
- [ ] **Step 3:** Keep the best by the rule. If the vote wins, delete the `Profiles` switch and the Temperley tables. If one set wins, delete the vote code and the unused sets. Run the tests and commit (`tune(key): key profiles (measured)`).

### Task 23: CHECKPOINT 3

- [ ] Remove the kick test's `#[ignore]` if it now passes. If it still fails, leave it ignored and say so.
- [ ] Run `cd src-tauri && cargo test --lib && cargo check --features eval --bin recodeck-eval`.
- [ ] Stop and report to the user in Serbian:
  - key exact and MIREX on the consensus set, against the baseline and the 75 % target;
  - which steps were kept and which dropped;
  - the predicted-key spread (no longer 42 % in two keys?);
  - the confidence gap, and time per track.

  Wait for the go-ahead.

---

# Phase 4: data, tags, re-analysis (spec §4, §5)

### Task 24: Migration 022 and `ANALYSIS_VERSION`

**Files:**
- Create: `src-tauri/src/db/migrations/022_analysis_grid.sql`, `src-tauri/src/db/analysis.rs`
- Modify: `src-tauri/src/db/mod.rs`, `src-tauri/src/audio/mod.rs`

- [ ] **Step 1: Failing test.** Create `db/analysis.rs` with only its header and this test module, and add `pub mod analysis;` to `db/mod.rs`:

```rust
// src-tauri/src/db/analysis.rs
// What analysis stores and which tracks need it (spec 2026-10-17, §4, §5).

use super::Database;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn db() -> Database {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        db
    }

    fn track(db: &Database, path: &str) -> i64 {
        db.conn.execute("INSERT INTO tracks (file_path, file_hash, title) VALUES (?1, ?1, ?1)", params![path]).unwrap();
        db.conn.last_insert_rowid()
    }

    #[test]
    fn migration_022_runs_once_and_clears_failed_bpms() {
        let db = db();
        let failed = track(&db, "/m/failed.mp3");
        let found = track(&db, "/m/found.mp3");
        db.save_bpm_analysis(failed, 0.0, 0.0).unwrap();
        db.save_bpm_analysis(found, 124.0, 0.9).unwrap();
        // As before 022: drop its columns, then migrate again, twice.
        db.conn
            .execute_batch(
                "ALTER TABLE track_analysis DROP COLUMN first_beat_ms;
                 ALTER TABLE track_analysis DROP COLUMN analysis_version;",
            )
            .unwrap();
        db.run_migrations().unwrap();
        db.run_migrations().unwrap();
        let bpm = |id: i64| -> Option<f64> {
            db.conn.query_row("SELECT bpm FROM track_analysis WHERE track_id = ?1", [id], |r| r.get(0)).unwrap()
        };
        assert_eq!(bpm(failed), None);
        assert_eq!(bpm(found), Some(124.0));
        let version: Option<i64> = db
            .conn
            .query_row("SELECT analysis_version FROM track_analysis WHERE track_id = ?1", [found], |r| r.get(0))
            .unwrap();
        assert_eq!(version, None);
    }
}
```

- [ ] **Step 2: Run to see it fail.** Run `cd src-tauri && cargo test --lib db::analysis`. Expected: FAIL; the column does not exist to drop.
- [ ] **Step 3: Implement**

`022_analysis_grid.sql`:

```sql
-- Migration 022 (spec 2026-10-17, §4): the beat grid, and which analysis
-- version produced a row's values. NULL: from tags, or from analysis before
-- versions. A BPM of 0 was a failed analysis: cleared so it is retried.
ALTER TABLE track_analysis ADD COLUMN first_beat_ms REAL;
ALTER TABLE track_analysis ADD COLUMN analysis_version INTEGER;
UPDATE track_analysis SET bpm = NULL, bpm_confidence = NULL WHERE bpm = 0;
```

In `run_migrations`, after migration 021:

```rust
        // Migration 022: the beat grid and the analysis version (spec
        // 2026-10-17, §4). ALTER TABLE is not idempotent, so the column is
        // checked for first.
        let has_analysis_version: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('track_analysis') WHERE name = 'analysis_version'",
            [],
            |row| row.get(0),
        )?;
        if !has_analysis_version {
            self.conn.execute_batch(include_str!("migrations/022_analysis_grid.sql"))?;
        }
```

`audio/mod.rs`:

```rust
/// The version of BPM, key and grid detection. A track analysed with an
/// older one, never analysed, or only tagged needs analysis (spec 2026-10-17,
/// §4). Raise it when detection changes enough to be worth a re-analysis.
pub const ANALYSIS_VERSION: i64 = 1;
```

- [ ] **Step 4: Run to see it pass.** Run `cd src-tauri && cargo test --lib`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations/022_analysis_grid.sql src-tauri/src/db/analysis.rs src-tauri/src/db/mod.rs src-tauri/src/audio/mod.rs
git commit -m "feat(db): migration 022 adds the beat grid and the analysis version"
```

### Task 25: Save rules and the needs-analysis rule

**Files:**
- Modify: `src-tauri/src/db/analysis.rs`

- [ ] **Step 1: Failing tests** (add to `mod tests`, with `use crate::audio::bpm::BpmResult; use crate::audio::key::KeyResult; use tempfile::TempDir;`)

```rust
    type Row = (Option<f64>, Option<f64>, Option<f64>, Option<String>, Option<f64>, Option<i64>);

    fn row(db: &Database, id: i64) -> Row {
        db.conn
            .query_row(
                "SELECT bpm, bpm_confidence, first_beat_ms, musical_key, key_confidence, analysis_version
                 FROM track_analysis WHERE track_id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .unwrap()
    }

    fn found_bpm(bpm: f64, first: Option<f64>) -> BpmResult {
        BpmResult { bpm, confidence: 0.9, first_beat_ms: first }
    }

    fn found_key(camelot: &str) -> KeyResult {
        KeyResult { camelot: camelot.into(), open_key: String::new(), musical_key: String::new(), confidence: 0.7 }
    }

    #[test]
    fn what_was_found_is_saved_with_the_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), Some(0.9), Some(137.0), Some("8A".into()), Some(0.7), Some(1)));
    }

    #[test]
    fn a_new_bpm_never_pairs_with_an_old_grid() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), None, 1).unwrap();
        db.save_analysis(id, Some(&found_bpm(125.0, None)), None, 1).unwrap();
        assert_eq!(row(&db, id).2, None);
    }

    #[test]
    fn what_was_not_found_keeps_the_stored_value() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, Some(137.0))), Some(&found_key("8A")), 1).unwrap();
        db.save_analysis(id, None, None, 2).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), Some(0.9), Some(137.0), Some("8A".into()), Some(0.7), Some(2)));
    }

    #[test]
    fn a_file_that_would_not_decode_still_gets_the_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, None, None, 1).unwrap();
        assert_eq!(row(&db, id), (None, None, None, None, None, Some(1)));
    }

    #[test]
    fn tag_values_have_no_confidence_and_no_version() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_tag_analysis(id, Some(124.0), Some("8A")).unwrap();
        assert_eq!(row(&db, id), (Some(124.0), None, None, Some("8A".into()), None, None));
    }

    #[test]
    fn tags_never_overwrite_an_analysis() {
        let db = db();
        let id = track(&db, "/m/a.mp3");
        db.save_analysis(id, Some(&found_bpm(124.0, None)), None, 1).unwrap();
        db.save_tag_analysis(id, Some(128.0), Some("5A")).unwrap();
        assert_eq!(row(&db, id).0, Some(124.0));
        assert_eq!(row(&db, id).3, None);
    }

    #[test]
    fn the_rule_needs_an_old_version_and_a_file_on_disk() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.wav");
        std::fs::write(&file, b"x").unwrap();
        let there = file.to_string_lossy().to_string();
        let gone = dir.path().join("gone.wav").to_string_lossy().to_string();
        assert!(needs_analysis(None, &there, 1));
        assert!(needs_analysis(Some(0), &there, 1));
        assert!(!needs_analysis(Some(1), &there, 1));
        assert!(!needs_analysis(None, &gone, 1));
        assert!(is_current(Some(1), 1) && is_current(Some(2), 1));
        assert!(!is_current(None, 1) && !is_current(Some(0), 1));
    }

    #[test]
    fn tracks_needing_analysis_skip_current_and_missing_ones() {
        let dir = TempDir::new().unwrap();
        let path = |name: &str| {
            let p = dir.path().join(name);
            std::fs::write(&p, b"x").unwrap();
            p.to_string_lossy().to_string()
        };
        let db = db();
        let current = track(&db, &path("current.wav"));
        let old = track(&db, &path("old.wav"));
        let tagged = track(&db, &path("tagged.wav"));
        let never = track(&db, &path("never.wav"));
        let missing = track(&db, &dir.path().join("missing.wav").to_string_lossy());
        db.save_analysis(current, Some(&found_bpm(124.0, None)), None, 1).unwrap();
        db.save_bpm_analysis(old, 124.0, 0.9).unwrap();
        db.save_tag_analysis(tagged, Some(124.0), None).unwrap();
        db.save_bpm_analysis(missing, 124.0, 0.9).unwrap();

        let needing: Vec<(i64, bool)> =
            on_disk(db.tracks_not_current(1).unwrap()).into_iter().map(|t| (t.id, t.has_old_values)).collect();
        assert_eq!(needing, vec![(old, true), (tagged, false), (never, false)]);
        assert_eq!(db.analysis_version(current).unwrap(), Some(1));
        assert_eq!(db.analysis_version(never).unwrap(), None);
    }
```

- [ ] **Step 2: Run to see them fail.** Run `cd src-tauri && cargo test --lib db::analysis`. Expected: compile errors.
- [ ] **Step 3: Implement** (below the header):

```rust
use crate::audio::bpm::BpmResult;
use crate::audio::key::KeyResult;
use crate::missing_files::is_missing;
use rusqlite::{params, OptionalExtension, Result};

/// A track not analysed with the current version.
#[derive(Debug, Clone, PartialEq)]
pub struct NotCurrent {
    pub id: i64,
    pub path: String,
    /// It has a BPM or key from an older analysis: one with a confidence, not a tag.
    pub has_old_values: bool,
}

/// Whether a track's stored analysis is from `version` or newer.
pub fn is_current(stored_version: Option<i64>, version: i64) -> bool {
    stored_version.map_or(false, |v| v >= version)
}

/// The rule of §4: a track needs analysis when its stored version is missing
/// or older than `version` and its file is on disk.
pub fn needs_analysis(stored_version: Option<i64>, path: &str, version: i64) -> bool {
    !is_current(stored_version, version) && !is_missing(path)
}

/// The tracks whose file is on disk. Call it without the database lock: a
/// sleeping external drive can take seconds to answer (as `mark_missing`).
pub fn on_disk(tracks: Vec<NotCurrent>) -> Vec<NotCurrent> {
    tracks.into_iter().filter(|t| !is_missing(&t.path)).collect()
}

impl Database {
    /// Saves one analysis of a track whose file was read (§4, Saving). What
    /// was found replaces the stored value: the BPM with its confidence and
    /// grid, the key with its confidence, each together or not at all. What
    /// was not found keeps the stored value. The version is written either way.
    pub fn save_analysis(&self, track_id: i64, bpm: Option<&BpmResult>, key: Option<&KeyResult>, version: i64) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO track_analysis (track_id, analysis_version, analyzed_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(track_id) DO UPDATE SET
                analysis_version = excluded.analysis_version,
                analyzed_at = excluded.analyzed_at",
            params![track_id, version],
        )?;
        if let Some(b) = bpm {
            tx.execute(
                "UPDATE track_analysis SET bpm = ?2, bpm_confidence = ?3, first_beat_ms = ?4 WHERE track_id = ?1",
                params![track_id, b.bpm, b.confidence, b.first_beat_ms],
            )?;
        }
        if let Some(k) = key {
            tx.execute(
                "UPDATE track_analysis SET musical_key = ?2, key_confidence = ?3 WHERE track_id = ?1",
                params![track_id, k.camelot, k.confidence],
            )?;
        }
        tx.commit()
    }

    /// The BPM and key a new track's tags carry (§4, Tags): no confidence and
    /// no version, so analysis replaces them. A track that already has an
    /// analysis row keeps it.
    pub fn save_tag_analysis(&self, track_id: i64, bpm: Option<f64>, camelot: Option<&str>) -> Result<()> {
        if bpm.is_none() && camelot.is_none() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO track_analysis (track_id, bpm, musical_key, analyzed_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(track_id) DO NOTHING",
            params![track_id, bpm, camelot],
        )?;
        Ok(())
    }

    /// The version that produced a track's analysis; None when there is none.
    pub fn analysis_version(&self, track_id: i64) -> Result<Option<i64>> {
        Ok(self
            .conn
            .query_row("SELECT analysis_version FROM track_analysis WHERE track_id = ?1", [track_id], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .optional()?
            .flatten())
    }

    /// Tracks not analysed with `version`, by id, whether or not their file
    /// is on disk: `on_disk` finishes the §4 rule outside the lock.
    pub fn tracks_not_current(&self, version: i64) -> Result<Vec<NotCurrent>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path,
                    (a.bpm IS NOT NULL AND a.bpm_confidence IS NOT NULL)
                    OR (a.musical_key IS NOT NULL AND a.key_confidence IS NOT NULL)
             FROM tracks t LEFT JOIN track_analysis a ON a.track_id = t.id
             WHERE a.analysis_version IS NULL OR a.analysis_version < ?1
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([version], |r| {
            Ok(NotCurrent { id: r.get(0)?, path: r.get(1)?, has_old_values: r.get::<_, Option<bool>>(2)?.unwrap_or(false) })
        })?;
        rows.collect()
    }
}
```

- [ ] **Step 4: Run to see them pass.** Run `cd src-tauri && cargo test --lib db::analysis`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/analysis.rs
git commit -m "feat(db): one save per analysis, tag values without confidence, needs-analysis rule"
```

### Task 26: Duplicate merge keeps BPM with its confidence, and the grid with its file

**Files:**
- Modify: `src-tauri/src/db/merge.rs`

`fill_row_from` fills each NULL column of the kept track (K) from the merged one (R), reading the column list from `pragma_table_info`. With migration 022 it would also pick up `first_beat_ms` and `analysis_version`, so K's BPM could pair with R's grid, and K could inherit a current version and never be re-analysed. It already pairs a tag BPM (no confidence) with R's confidence.

- [ ] **Step 1: Failing test** (in `merge.rs` tests, next to `the_kept_copys_own_bpm_wins_and_deep_analysis_fills_missing_columns`)

```rust
    #[test]
    fn bpm_and_key_move_with_their_confidence_and_the_grid_stays_with_its_file() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        // K: a tag BPM (no confidence), no key. R: analysed BPM, grid, key and version.
        db.conn.execute("INSERT INTO track_analysis (track_id, bpm) VALUES (?1, 124.0)", [k]).unwrap();
        db.conn
            .execute(
                "INSERT INTO track_analysis (track_id, bpm, bpm_confidence, first_beat_ms, musical_key, key_confidence, analysis_version)
                 VALUES (?1, 125.0, 0.9, 137.0, '8A', 0.7, 1)",
                [r],
            )
            .unwrap();

        merge(&db, k, &[r]);

        let row: (Option<f64>, Option<f64>, Option<f64>, Option<String>, Option<f64>, Option<i64>) = db
            .conn
            .query_row(
                "SELECT bpm, bpm_confidence, first_beat_ms, musical_key, key_confidence, analysis_version
                 FROM track_analysis WHERE track_id = ?1",
                [k],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .unwrap();
        assert_eq!(row, (Some(124.0), None, None, Some("8A".into()), Some(0.7), None));
    }

    #[test]
    fn a_kept_copy_without_analysis_takes_the_bpm_but_not_the_grid() {
        let db = db();
        let k = track(&db, "K");
        let r = track(&db, "R");
        db.conn
            .execute(
                "INSERT INTO track_analysis (track_id, bpm, bpm_confidence, first_beat_ms, analysis_version)
                 VALUES (?1, 125.0, 0.9, 137.0, 1)",
                [r],
            )
            .unwrap();

        merge(&db, k, &[r]);

        let row: (Option<f64>, Option<f64>, Option<f64>, Option<i64>) = db
            .conn
            .query_row(
                "SELECT bpm, bpm_confidence, first_beat_ms, analysis_version FROM track_analysis WHERE track_id = ?1",
                [k],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(row, (Some(125.0), Some(0.9), None, None));
    }
```

- [ ] **Step 2: Run to see them fail.** Run `cd src-tauri && cargo test --lib db::merge`. Expected: FAIL (K gets R's confidence, grid and version).
- [ ] **Step 3: Implement**

```rust
/// track_analysis columns the column-by-column fill leaves alone: the file's
/// own audio pictures; the BPM and key, which move in pairs with their
/// confidence (`fill_analysis_pairs`); and the grid and version, which belong
/// to the file that was read (spec 2026-10-17, §4). A kept copy without them
/// is re-analysed.
const ANALYSIS_NOT_FILLED: [&str; 9] = [
    "waveform_overview",
    "waveform_detail",
    "spectrogram_data",
    "bpm",
    "bpm_confidence",
    "musical_key",
    "key_confidence",
    "first_beat_ms",
    "analysis_version",
];

/// K takes R's BPM with R's confidence when K has no BPM, and likewise the
/// key: a value never pairs with another value's confidence. Runs before
/// `fill_row_from`, which deletes R's row.
fn fill_analysis_pairs(conn: &Connection, k: i64, r: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO track_analysis (track_id)
         SELECT ?1 WHERE EXISTS (SELECT 1 FROM track_analysis WHERE track_id = ?2)",
        params![k, r],
    )?;
    for (value, confidence) in [("bpm", "bpm_confidence"), ("musical_key", "key_confidence")] {
        conn.execute(
            &format!(
                "UPDATE track_analysis SET
                    {value} = (SELECT {value} FROM track_analysis WHERE track_id = ?2),
                    {confidence} = (SELECT {confidence} FROM track_analysis WHERE track_id = ?2)
                 WHERE track_id = ?1 AND {value} IS NULL"
            ),
            params![k, r],
        )?;
    }
    Ok(())
}
```

In `merge_one`, replace `fill_row_from(conn, "track_analysis", k, r, &AUDIO_PICTURE_COLUMNS)?;` with:

```rust
    fill_analysis_pairs(conn, k, r)?;
    fill_row_from(conn, "track_analysis", k, r, &ANALYSIS_NOT_FILLED)?;
```

If `AUDIO_PICTURE_COLUMNS` has no other user, delete it and keep its "never carried to another copy" note in `ANALYSIS_NOT_FILLED`'s comment.

- [ ] **Step 4: Run.** Run `cd src-tauri && cargo test --lib db::merge`. Expected: PASS, including the older analysis merge tests.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/merge.rs
git commit -m "fix(merge): BPM and key move with their confidence; the grid stays with its file"
```

### Task 27: The batch uses the rule and one save; Home's list

**Files:**
- Modify: `src-tauri/src/commands/analysis.rs`, `src-tauri/src/db/home.rs`

- [ ] **Step 1: Failing Home test** (in `db/home.rs` tests)

```rust
    #[test]
    fn a_track_read_without_a_bpm_leaves_the_list() {
        let db = db();
        let read = track(&db, "read");
        let old = track(&db, "old");
        db.save_analysis(read, None, None, crate::audio::ANALYSIS_VERSION).unwrap();
        db.save_analysis(old, None, None, crate::audio::ANALYSIS_VERSION - 1).unwrap();
        assert_eq!(db.get_track_ids_without_bpm().unwrap(), vec![old]);
    }
```

- [ ] **Step 2: Run to see it fail.** Run `cd src-tauri && cargo test --lib db::home`. Expected: FAIL (`read` is listed).
- [ ] **Step 3: Implement Home.** In `get_track_ids_without_bpm`, update the doc comment (it says analysis "skips only tracks with both a BPM and a key"; now it uses the needs-analysis rule) and use:

```rust
        let mut stmt = self.conn.prepare(
            "SELECT t.id FROM tracks t
             LEFT JOIN track_analysis a ON a.track_id = t.id
             WHERE a.bpm IS NULL
               AND (a.analysis_version IS NULL OR a.analysis_version < ?1)
             ORDER BY t.id",
        )?;
        let rows = stmt.query_map([crate::audio::ANALYSIS_VERSION], |row| row.get::<_, i64>(0))?;
```

- [ ] **Step 4: Implement the batch.** In `commands/analysis.rs` add:

```rust
use crate::audio::ANALYSIS_VERSION;
use crate::db::analysis::is_current;
use crate::missing_files::is_missing;
```

In the gather, replace the `has_bpm && has_key` check. Only the version is checked under the lock; each worker checks the disk with `is_missing` (below), so the batch and the §4 rule never disagree:

```rust
                    let track = db.get_track(id).ok()?;
                    // Unless forced, only what needs analysis (spec §4): not
                    // analysed with this version. The file check is the worker's.
                    if !force && is_current(db.analysis_version(id).unwrap_or(None), ANALYSIS_VERSION) {
                        return None;
                    }
```

Replace the per-track closure body inside `par_iter().for_each(...)`:

```rust
                if cancelled.load(Ordering::SeqCst) {
                    return;
                }
                let emit = |bpm_value: Option<f64>, key_value: Option<String>| {
                    let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app3.emit("analysis-progress", &AnalysisProgressEvent {
                        current, total, track_id: *track_id, track_name: track_name.clone(),
                        bpm: bpm_value, musical_key: key_value,
                    });
                };
                // One save per track whose file was read (spec 2026-10-17, §4).
                let save = |found_bpm: Option<&bpm::BpmResult>, found_key: Option<&key::KeyResult>| {
                    let st = app3.state::<AppState>();
                    let Ok(guard) = st.db.lock() else { return };
                    if let Some(db) = guard.as_ref() {
                        if let Err(e) = db.save_analysis(*track_id, found_bpm, found_key, ANALYSIS_VERSION) {
                            eprintln!("[batch_analysis] Saving track {} failed: {}", track_id, e);
                        }
                    }
                };

                // A file not on disk saves nothing: Missing Files handles it.
                if is_missing(file_path) {
                    eprintln!("[batch_analysis] Skipping missing file: {}", file_path);
                    failed.fetch_add(1, Ordering::SeqCst);
                    emit(None, None);
                    return;
                }

                let audio = match decoder::decode_to_mono(Path::new(file_path)) {
                    Ok(a) => a,
                    Err(e) => {
                        eprintln!("[batch_analysis] Decode failed for track {}: {}", track_id, e);
                        // Read but not decodable: it waits for the next version or a forced re-analysis.
                        save(None, None);
                        failed.fetch_add(1, Ordering::SeqCst);
                        emit(None, None);
                        return;
                    }
                };
                if cancelled.load(Ordering::SeqCst) {
                    return;
                }

                let bpm_result = bpm::detect_bpm_from_samples(&audio).ok().flatten();
                let key_result = key::detect_key_from_samples(&audio).ok();
                save(bpm_result.as_ref(), key_result.as_ref());

                if bpm_result.is_some() || key_result.is_some() {
                    analyzed.fetch_add(1, Ordering::SeqCst);
                } else {
                    failed.fetch_add(1, Ordering::SeqCst);
                }
                emit(bpm_result.as_ref().map(|r| r.bpm), key_result.as_ref().map(|r| r.camelot.clone()));
```

- [ ] **Step 5: Run.** Run `cd src-tauri && cargo test --lib`. Expected: PASS. `has_bpm_analysis` and `has_key_analysis` may now be unused outside tests; leave them, they are `pub`.
- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/analysis.rs src-tauri/src/db/home.rs
git commit -m "feat(analysis): batch uses the needs-analysis rule and saves once per track"
```

### Task 28: Tags: key read, no confidence

**Files:**
- Modify: `src-tauri/src/scanner.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/missing_files.rs`, `src-tauri/src/commands/playlists.rs`

- [ ] **Step 1: Failing test** (in `scanner.rs` tests)

```rust
    #[test]
    fn a_key_tag_is_imported_as_camelot_without_confidence() {
        use lofty::config::WriteOptions;
        use lofty::tag::{ItemKey, Tag, TagExt, TagType};
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("keyed.wav");
        crate::test_support::write_wav(&file, 1000, 3);
        let mut tag = Tag::new(TagType::Id3v2);
        assert!(tag.insert_text(ItemKey::InitialKey, "1m".to_string()));
        tag.save_to_path(&file, WriteOptions::default()).unwrap();

        let (_, _, _, tag_key) = Scanner::extract_metadata(&file).unwrap();
        assert_eq!(tag_key.as_deref(), Some("8A"));

        let ImportOutcome::Imported(id) = Scanner::import_file(&db, &file).unwrap() else { panic!("not imported") };
        let analysis = db.get_track_analysis(id).unwrap().expect("a row");
        assert_eq!(analysis.musical_key.as_deref(), Some("8A"));
        assert_eq!(analysis.key_confidence, None);
    }
```

If the lofty paths differ in 0.22, check them with context7 (`lofty` 0.22: `Tag::insert_text`, `TagExt::save_to_path`, `WriteOptions`).

- [ ] **Step 2: Run to see it fail.** Run `cd src-tauri && cargo test --lib scanner`. Expected: compile error (3-tuple).
- [ ] **Step 3: Implement**
  - `extract_metadata` returns `(Track, Option<f64>, Option<String>, Option<String>)`, with the last item the Camelot key. Update the doc comment. Inside the big tuple, read:

    ```rust
    // Key from the tags (ID3 TKEY, MP4 initialkey, Vorbis INITIALKEY/KEY), as Camelot.
    let key = tag.get_string(&ItemKey::InitialKey).and_then(crate::formats::keys::camelot_from_tag);
    ```

    Return it as the 11th element; the `else` branch gains one `None`.
  - One helper for both import paths, in `impl Scanner`:

    ```rust
    /// What a new track's tags give the library (spec 2026-10-17, §4). BPM
    /// and key fill in until analysis replaces them (no confidence, no
    /// version). A genre is saved with source 'tag', below anything the
    /// user set. Both import paths call this.
    pub fn save_tag_values(db: &Database, id: i64, bpm: Option<f64>, genre: Option<String>, key: Option<String>) {
        let _ = db.save_tag_analysis(id, bpm, key.as_deref());
        if let Some(genre) = genre {
            let _ = db.save_track_genre(id, &genre, "tag");
        }
    }
    ```

  - `import_file`: `let (track, tag_bpm, tag_genre, tag_key) = Self::extract_metadata(path)?;`. Replace the BPM and genre blocks after `create_track` with `Self::save_tag_values(db, id, tag_bpm, tag_genre, tag_key);`.
  - `commands/library.rs`: `let (track, tag_bpm, tag_genre, tag_key) = metadata;`. Replace its two blocks after `create_track` with `Scanner::save_tag_values(db, id, tag_bpm, tag_genre, tag_key);`. The test of `import_file` covers the helper both paths share.
  - `commands/playlists.rs` (around line 640) copies a BPM to a new track with `bpm_confidence.unwrap_or(1.0)`. That would turn a tag BPM into a confident one, which then counts as "older analysis" for the prompt. Keep an absent confidence absent:

    ```rust
                    if let Some(bpm) = src_track.bpm {
                        // A tag BPM has no confidence; the copy keeps it that way.
                        let _ = match src_track.bpm_confidence {
                            Some(confidence) => db.save_bpm_analysis(new_id, bpm, confidence),
                            None => db.save_tag_analysis(new_id, Some(bpm), None),
                        };
                    }
    ```
  - `missing_files.rs`: `Ok((track, _, _, _))`. Other test call sites: `let (track, _, _, _) = ...`.
  - Update the doc comment on `import_file` ("If the file has BPM in its tags…") to say BPM and key.
- [ ] **Step 4: Run.** Run `cd src-tauri && cargo test --lib`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scanner.rs src-tauri/src/commands/library.rs src-tauri/src/missing_files.rs src-tauri/src/commands/playlists.rs
git commit -m "feat(scan): read the key tag; tag BPM and key carry no confidence"
```

### Task 29: Status commands and frontend API

**Files:**
- Modify: `src-tauri/src/commands/analysis.rs`, `src-tauri/src/audio/mod.rs`, `src-tauri/src/lib.rs`, `src/types/track.ts`, `src/lib/tauri-api.ts`

- [ ] **Step 1: Failing test** (add a `#[cfg(test)] mod tests` to `commands/analysis.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_estimate_rounds_up_to_five_minutes() {
        assert_eq!(estimate_minutes(0, 2.0, 8), 0);
        assert_eq!(estimate_minutes(10, 2.0, 8), 5);
        assert_eq!(estimate_minutes(1200, 2.0, 8), 5); // 300 s
        assert_eq!(estimate_minutes(1201, 2.0, 8), 10);
        assert_eq!(estimate_minutes(8000, 2.0, 0), 270); // no core count: one core
    }
}
```

- [ ] **Step 2: Run to see it fail.** Run `cd src-tauri && cargo test --lib commands::analysis`. Expected: compile error.
- [ ] **Step 3: Implement**

`audio/mod.rs`. Use the latest "seconds per track on one core" in Results; Task 32 updates it from the final run.

```rust
/// Seconds one core spends on a track (decode, BPM, key), from recodeck-eval:
/// the re-analysis estimate (spec §5).
pub const SECONDS_PER_TRACK: f64 = /* latest measured value */;
```

`commands/analysis.rs`:

```rust
use crate::audio::SECONDS_PER_TRACK;
use crate::db::analysis::{on_disk, NotCurrent};

/// What analysis status Settings and the start-up prompt show (spec §5).
#[derive(Debug, Clone, Serialize)]
pub struct AnalysisStatus {
    /// ANALYSIS_VERSION.
    pub version: i64,
    /// Tracks that need analysis (§4), files on disk only.
    pub needing: usize,
    /// Of those, tracks with a BPM or key from an older analysis (not a tag).
    pub with_old_values: usize,
    pub estimate_minutes: u32,
}

/// tracks × seconds per track ÷ cores, in minutes, rounded up to 5.
pub fn estimate_minutes(tracks: usize, seconds_per_track: f64, cores: usize) -> u32 {
    if tracks == 0 {
        return 0;
    }
    let minutes = tracks as f64 * seconds_per_track / cores.max(1) as f64 / 60.0;
    ((minutes / 5.0).ceil().max(1.0) * 5.0) as u32
}

/// Tracks that need analysis (§4): read under the lock, then the disk is
/// checked after it is released, as `count_missing_tracks` does.
fn needing_analysis(app: &AppHandle) -> Result<Vec<NotCurrent>, AppError> {
    let candidates = {
        let state = app.state::<AppState>();
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        db.tracks_not_current(ANALYSIS_VERSION)
            .map_err(|e| AppError::Database(format!("Failed to list tracks to analyze: {}", e)))?
    };
    Ok(on_disk(candidates))
}

/// Async, off the main thread: it runs at start-up and on every Settings visit,
/// and a sleeping drive can make the disk check slow.
#[tauri::command]
pub async fn analysis_status(app: AppHandle) -> Result<AnalysisStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let tracks = needing_analysis(&app)?;
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
        Ok(AnalysisStatus {
            version: ANALYSIS_VERSION,
            needing: tracks.len(),
            with_old_values: tracks.iter().filter(|t| t.has_old_values).count(),
            estimate_minutes: estimate_minutes(tracks.len(), SECONDS_PER_TRACK, cores),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Analysis status task failed: {}", e)))?
}

/// The tracks `analysis_status` counts as needing analysis.
#[tauri::command]
pub async fn track_ids_needing_analysis(app: AppHandle) -> Result<Vec<i64>, AppError> {
    tauri::async_runtime::spawn_blocking(move || Ok(needing_analysis(&app)?.into_iter().map(|t| t.id).collect()))
        .await
        .map_err(|e| AppError::Internal(format!("Analysis list task failed: {}", e)))?
}
```

`lib.rs` `invoke_handler`: add `commands::analysis::analysis_status` and `commands::analysis::track_ids_needing_analysis` next to `cancel_analysis`.

`src/types/track.ts`:

```ts
/** What analysis_status reports (spec 2026-10-17, §5). */
export interface AnalysisStatus {
  version: number
  /** Tracks that need analysis, files on disk only. */
  needing: number
  /** Of those, tracks with a BPM or key from an older analysis (not a tag). */
  with_old_values: number
  estimate_minutes: number
}
```

`src/lib/tauri-api.ts`, next to `cancelAnalysis` (import `AnalysisStatus`):

```ts
  async analysisStatus(): Promise<AnalysisStatus> {
    return await invoke('analysis_status')
  },

  async trackIdsNeedingAnalysis(): Promise<number[]> {
    return await invoke('track_ids_needing_analysis')
  },
```

- [ ] **Step 4: Run.** Run `cd src-tauri && cargo test --lib && cd .. && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/analysis.rs src-tauri/src/audio/mod.rs src-tauri/src/lib.rs src/types/track.ts src/lib/tauri-api.ts
git commit -m "feat(analysis): analysis status and the tracks that need analysis"
```

### Task 30: Prompt rule, hint and prompt component

**Files:**
- Create: `src/lib/reanalysis.ts`, `src/lib/reanalysis.test.ts`, `src/components/ReanalyzePrompt.tsx`, `src/components/ReanalyzePrompt.css`, `src/components/ReanalyzePrompt.test.tsx`

- [ ] **Step 1: Failing tests**

`src/lib/reanalysis.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AnalysisStatus } from '../types/track'
import { reanalyzeHint, shouldPromptReanalysis } from './reanalysis'

const status = (over: Partial<AnalysisStatus> = {}): AnalysisStatus => ({
  version: 1,
  needing: 40,
  with_old_values: 30,
  estimate_minutes: 5,
  ...over,
})

describe('shouldPromptReanalysis', () => {
  it('asks once per version, when there is older analysis', () => {
    expect(shouldPromptReanalysis(status(), null)).toBe(true)
    expect(shouldPromptReanalysis(status(), '0')).toBe(true)
    expect(shouldPromptReanalysis(status(), '1')).toBe(false)
    expect(shouldPromptReanalysis(status({ version: 2 }), '1')).toBe(true)
  })

  it('never for a library with no older analysis', () => {
    expect(shouldPromptReanalysis(status({ with_old_values: 0 }), null)).toBe(false)
  })

  it('reads a broken setting as never asked', () => {
    expect(shouldPromptReanalysis(status(), 'x')).toBe(true)
  })
})

describe('reanalyzeHint', () => {
  it('counts the tracks and the minutes', () => {
    expect(reanalyzeHint(status())).toBe(
      "40 tracks aren't analyzed with the current version (about 5 min).",
    )
    expect(reanalyzeHint(status({ needing: 1 }))).toBe(
      "1 track isn't analyzed with the current version (about 5 min).",
    )
  })

  it('says when everything is current', () => {
    expect(reanalyzeHint(status({ needing: 0 }))).toBe(
      'All tracks use the current analysis.',
    )
  })
})
```

`src/components/ReanalyzePrompt.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AnalysisStatus } from '../types/track'
import { ReanalyzePrompt } from './ReanalyzePrompt'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const status: AnalysisStatus = {
  version: 1,
  needing: 1234,
  with_old_values: 1200,
  estimate_minutes: 15,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render() {
  const onLater = vi.fn()
  const onReanalyze = vi.fn()
  act(() =>
    root.render(
      <ReanalyzePrompt status={status} onLater={onLater} onReanalyze={onReanalyze} />,
    ),
  )
  return { onLater, onReanalyze }
}

function button(label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )
  if (!found) throw new Error(`no ${label} button`)
  return found
}

describe('ReanalyzePrompt', () => {
  it('says how many tracks and how long', () => {
    render()
    expect(host.textContent).toContain('Better BPM and key detection')
    expect(host.textContent).toContain('Re-analyze 1234 tracks now?')
    expect(host.textContent).toContain('about 15 min')
  })

  it('Re-analyze and Later each answer once', () => {
    const { onLater, onReanalyze } = render()
    act(() => button('Re-analyze').click())
    expect(onReanalyze).toHaveBeenCalledTimes(1)
    act(() => button('Later').click())
    expect(onLater).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to see them fail.** Run `npx vitest run src/lib/reanalysis.test.ts src/components/ReanalyzePrompt.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement**

`src/lib/reanalysis.ts`:

```ts
// Re-analysis after detection improves (spec 2026-10-17, §5): when the
// once-per-version prompt shows, and what Settings → Database says.
import type { AnalysisStatus } from '../types/track'

/** The setting holding the analysis version the prompt was last shown for. */
export const PROMPTED_VERSION_KEY = 'analysis_prompted_version'

/** Once per version, and only for a library with older analysis: tag values
 * carry no confidence, so a fresh library gets no "better detection" message. */
export function shouldPromptReanalysis(
  status: AnalysisStatus,
  promptedVersion: string | null,
): boolean {
  const prompted = Number(promptedVersion ?? 0)
  return (
    (Number.isFinite(prompted) ? prompted : 0) < status.version &&
    status.with_old_values > 0
  )
}

/** The hint under Settings → Database's Re-analyze button. */
export function reanalyzeHint(status: AnalysisStatus): string {
  if (status.needing === 0) return 'All tracks use the current analysis.'
  const tracks =
    status.needing === 1 ? "1 track isn't" : `${status.needing} tracks aren't`
  return `${tracks} analyzed with the current version (about ${status.estimate_minutes} min).`
}
```

`src/components/ReanalyzePrompt.tsx`:

```tsx
import { useOverlay } from '../lib/overlays'
import type { AnalysisStatus } from '../types/track'
import './ReanalyzePrompt.css'

interface ReanalyzePromptProps {
  status: AnalysisStatus
  onLater: () => void
  onReanalyze: () => void
}

// Once per analysis version (spec 2026-10-17, §5): detection got better;
// re-analyze now, or later from Settings → Database. Esc counts as Later.
export function ReanalyzePrompt({ status, onLater, onReanalyze }: ReanalyzePromptProps) {
  useOverlay(true, onLater)
  return (
    <div className="modal-overlay" onClick={onLater}>
      <div
        className="modal-content reanalyze-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reanalyze-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reanalyze-prompt-title">Better BPM and key detection</h3>
        <p className="reanalyze-prompt__text">
          This version finds BPM, key and the beat grid more accurately. Re-analyze{' '}
          {status.needing} tracks now?
        </p>
        <p className="reanalyze-prompt__note">
          It takes about {status.estimate_minutes} min, and you can keep using RecoDeck.
        </p>
        <div className="reanalyze-prompt__footer">
          <button type="button" className="btn" onClick={onLater}>
            Later
          </button>
          <button type="button" className="btn btn--primary" onClick={onReanalyze}>
            Re-analyze
          </button>
        </div>
      </div>
    </div>
  )
}
```

The JSX `Re-analyze{' '}\n{status.needing}` renders "Re-analyze 1234 tracks now?" as the test expects. If the formatter splits the text differently, check `textContent`.

`src/components/ReanalyzePrompt.css`. It uses the same variables as `WhatsNewDialog.css`; check there and reuse what that file uses:

```css
/* The once-per-version re-analysis prompt (spec 2026-10-17, §5). */
.reanalyze-prompt {
  width: min(460px, calc(100vw - 48px));
}

.reanalyze-prompt h3 {
  margin: 0 0 8px;
}

.reanalyze-prompt__text {
  margin: 0;
}

.reanalyze-prompt__note {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.reanalyze-prompt__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
```

- [ ] **Step 4: Run to see them pass.** Run `npx vitest run src/lib/reanalysis.test.ts src/components/ReanalyzePrompt.test.tsx && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/reanalysis.ts src/lib/reanalysis.test.ts src/components/ReanalyzePrompt.tsx src/components/ReanalyzePrompt.css src/components/ReanalyzePrompt.test.tsx
git commit -m "feat(ui): re-analysis prompt and Settings hint text"
```

### Task 31: Wire the prompt and Settings → Database

**Files:**
- Modify (scripts only): `src/App.tsx`, `src/components/settings/SettingsContext.tsx`
- Modify: `src/components/settings/DatabaseSection.tsx`

- [ ] **Step 1: App.tsx by script** (the formatter hook reformats the whole file on Edit). Save it as `$EVAL_OUT/wire_app.py` and run `python3 -I "$EVAL_OUT/wire_app.py"` from the repo root:

```python
from pathlib import Path

path = Path("src/App.tsx")
text = path.read_text()

def replace_once(old, new):
    global text
    assert text.count(old) == 1, f"expected one of: {old[:60]!r}"
    text = text.replace(old, new)

replace_once(
    "import { WhatsNewDialog } from './components/WhatsNewDialog'\n",
    "import { WhatsNewDialog } from './components/WhatsNewDialog'\n"
    "import { ReanalyzePrompt } from './components/ReanalyzePrompt'\n"
    "import { PROMPTED_VERSION_KEY, shouldPromptReanalysis } from './lib/reanalysis'\n",
)
replace_once("  AnalysisProgressEvent,\n", "  AnalysisProgressEvent,\n  AnalysisStatus,\n")
replace_once(
    "  // What's New dialog state\n",
    "  // Re-analysis prompt (spec 2026-10-17, §5): shown once What's New is closed\n"
    "  const [reanalyzeStatus, setReanalyzeStatus] = useState<AnalysisStatus | null>(null)\n\n"
    "  // What's New dialog state\n",
)
replace_once(
    "        console.warn(\"Failed to check version for What's New dialog\")\n      }\n",
    "        console.warn(\"Failed to check version for What's New dialog\")\n      }\n\n"
    "      // Once per analysis version: offer to re-analyze with better detection\n"
    "      try {\n"
    "        const [status, prompted] = await Promise.all([\n"
    "          tauriApi.analysisStatus(),\n"
    "          tauriApi.getSetting(PROMPTED_VERSION_KEY),\n"
    "        ])\n"
    "        if (shouldPromptReanalysis(status, prompted)) setReanalyzeStatus(status)\n"
    "      } catch {\n"
    "        console.warn('Failed to check whether analysis is current')\n"
    "      }\n",
)
replace_once(
    "  // Handler for when user clicks on track metadata in player\n",
    "  // Every track that needs analysis: the re-analysis prompt and Settings → Database.\n"
    "  async function reanalyzeLibrary() {\n"
    "    if (analyzing) {\n"
    "      toast('Analysis is already running', { kind: 'info' })\n"
    "      return\n"
    "    }\n"
    "    try {\n"
    "      const ids = await tauriApi.trackIdsNeedingAnalysis()\n"
    "      if (ids.length === 0) {\n"
    "        toast('All tracks use the current analysis', { kind: 'info' })\n"
    "        return\n"
    "      }\n"
    "      void analyzeTrackIds(ids)\n"
    "    } catch (err) {\n"
    "      toast(`Couldn't start the analysis: ${getErrorMessage(err)}`, { kind: 'error' })\n"
    "    }\n"
    "  }\n\n"
    "  // Both answers save the version, so the prompt shows once per version.\n"
    "  function closeReanalyzePrompt(reanalyze: boolean) {\n"
    "    const status = reanalyzeStatus\n"
    "    setReanalyzeStatus(null)\n"
    "    if (status) {\n"
    "      tauriApi.setSetting(PROMPTED_VERSION_KEY, String(status.version)).catch(() => {})\n"
    "    }\n"
    "    if (reanalyze) void reanalyzeLibrary()\n"
    "  }\n\n"
    "  // Handler for when user clicks on track metadata in player\n",
)
replace_once(
    "          onClose={() => setWhatsNew(null)}\n        />\n      )}\n",
    "          onClose={() => setWhatsNew(null)}\n        />\n      )}\n\n"
    "      {reanalyzeStatus && !whatsNew && (\n"
    "        <ReanalyzePrompt\n"
    "          status={reanalyzeStatus}\n"
    "          onLater={() => closeReanalyzePrompt(false)}\n"
    "          onReanalyze={() => closeReanalyzePrompt(true)}\n"
    "        />\n"
    "      )}\n",
)
replace_once(
    "onNotification={(message, type) => toast(message, { kind: type })}\n",
    "onNotification={(message, type) => toast(message, { kind: type })}\n"
    "                  onReanalyzeLibrary={() => void reanalyzeLibrary()}\n",
)
path.write_text(text)
print("App.tsx wired")
```

- [ ] **Step 2: SettingsContext.tsx by script** (`$EVAL_OUT/wire_settings.py`, same `replace_once` helper):

```python
from pathlib import Path

path = Path("src/components/settings/SettingsContext.tsx")
text = path.read_text()

def replace_once(old, new):
    global text
    assert text.count(old) == 1, f"expected one of: {old[:60]!r}"
    text = text.replace(old, new)

replace_once(
    "  // Callbacks surfaced for sub-components that need them (e.g. DuplicatesModal)\n  onFoldersChanged: () => void\n",
    "  // Callbacks surfaced for sub-components that need them (e.g. DuplicatesModal)\n  onFoldersChanged: () => void\n"
    "  /** Re-analyzes every track that needs it (spec 2026-10-17, §5); App runs it. */\n"
    "  onReanalyzeLibrary?: () => void\n",
)
replace_once(
    "export interface SettingsCallbacks {\n  onFoldersChanged: () => void\n",
    "export interface SettingsCallbacks {\n  onFoldersChanged: () => void\n  onReanalyzeLibrary?: () => void\n",
)
replace_once(
    "  const { onFoldersChanged, onThemeChanged, onNotification } = callbacks",
    "  const { onFoldersChanged, onThemeChanged, onNotification, onReanalyzeLibrary } = callbacks",
)
replace_once("    onFoldersChanged, onNotification,\n", "    onFoldersChanged, onNotification, onReanalyzeLibrary,\n")
path.write_text(text)
print("SettingsContext.tsx wired")
```

`SettingsView`'s props extend `SettingsCallbacks`, so it passes the new prop on unchanged.

- [ ] **Step 3: DatabaseSection.tsx** (a normal Edit is fine; the file is prettier-clean). Add imports and state:

```tsx
import { listen } from '@tauri-apps/api/event'
import { reanalyzeHint } from '../../lib/reanalysis'
import type { AnalysisStatus } from '../../types/track'
```

```tsx
  const { onFoldersChanged, onNotification, onReanalyzeLibrary } = useSettingsContext()
  // Which tracks need analysis; read again when an analysis ends.
  const [analysis, setAnalysis] = useState<AnalysisStatus | null>(null)

  const loadAnalysisStatus = useCallback(() => {
    tauriApi
      .analysisStatus()
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
  }, [])

  useEffect(() => {
    loadAnalysisStatus()
    const unlisten = listen('analysis-complete', () => loadAnalysisStatus())
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [loadAnalysisStatus])
```

Add a third block after the Missing Files block. As the spec says, the button reads "Re-analyze"; the hint under it says what it does:

```tsx
        <div>
          <button
            onClick={() => onReanalyzeLibrary?.()}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
            disabled={!analysis || analysis.needing === 0 || !onReanalyzeLibrary}
          >
            Re-analyze
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {analysis
              ? reanalyzeHint(analysis)
              : 'Checking which tracks need analysis…'}
          </p>
        </div>
```

Update the section description to "Clean up duplicate tracks and missing files, and re-analyze the library."

- [ ] **Step 4: Checks.** Run `npx tsc --noEmit && npx vitest run && npm run lint`. Expected: tsc and vitest pass; lint has only the 9 pre-existing errors.
- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/settings/SettingsContext.tsx src/components/settings/DatabaseSection.tsx
git commit -m "feat(ui): re-analysis prompt once per version; Re-analyze in Settings"
```

### Task 32: Final run, estimate, checks (CHECKPOINT 4)

- [ ] **Step 1: Final run** of the tool on the whole reference set: `p4-final`. Add the row.
- [ ] **Step 2:** Set `SECONDS_PER_TRACK` in `audio/mod.rs` to the final "seconds per track on one core". Run `cargo test --lib`, then commit with the Results row:

```bash
git add src-tauri/src/audio/mod.rs docs/superpowers/plans/2026-10-18-analysis-accuracy.md
git commit -m "chore(analysis): final measurement and re-analysis estimate"
```

- [ ] **Step 3: All checks** (the test-runner agent):
  - `cd src-tauri && cargo test --lib`;
  - `cargo check --features eval --bin recodeck-eval`;
  - `cargo build`;
  - `npx tsc --noEmit && npx vitest run && npm run lint`.
- [ ] **Step 4: Whole-branch review** (a code reviewer on `git diff main...HEAD`). Fix what it finds and run the checks again.
- [ ] **Step 5: CHECKPOINT.** Stop and report to the user in Serbian:
  - the final numbers against the baseline and the targets;
  - what ships;
  - the manual dev test.

  The dev test, against the real library:
  - the prompt shows once, after What's New;
  - Later, then restart: no prompt;
  - Settings → Database shows the hint and the button;
  - Re-analyze runs with progress and Cancel;
  - Home's "Not analyzed" count drops as tracks are read;
  - a re-analyzed track's key cell shows a percentage again.

  Warn the user first: dev and the installed app share the database. Release is a separate decision.

---

## Results

Aggregate numbers only. "Target set" is BPM where Traktor and Rekordbox agree within 0.5, or where Rekordbox has no value. "Consensus" is key where Traktor equals Rekordbox.

| Run | Commit | BPM ±0.05 | BPM ±0.5 | Grid ≤20 ms MP3 | Grid ≤20 ms lossless | Key exact (consensus) | MIREX (consensus) | s/track/core | Kept? |
|---|---|---|---|---|---|---|---|---|---|
| spec baseline (DB vs Traktor, 1326 tracks) | — | — | 87 % (all) | — | — | 28 % (vs Traktor) | — | — | — |
| p1-baseline (1591 measured) | ec524f0 | 20.3 % | 20.9 % | — | — | 34.8 % | 0.501 | 2.99 | — |
| p1-warm (time only) | ec524f0 | 20.3 % | 20.9 % | — | — | 34.8 % | 0.501 | 1.26 | — |
| p2-grid | df08804 | 98.5 % | 98.9 % | 3.8 % (67.3 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 3.94 | — |
| p2-gapless | df08804 + GAPLESS | 98.3 % | 99.0 % | 2.0 % (3.6 % at -19.9 ms) | 100.0 % | 34.8 % | 0.500 | 3.98 | no |
| p2-fix | abd1458 | 98.9 % | 98.9 % | 4.9 % (94.2 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 1.84 | — |
| p2-snap0 | abd1458, SNAP 0.0 | 98.9 % | 98.9 % | 5.1 % (93.8 % at -26.9 ms) | 100.0 % | 34.8 % | 0.501 | 1.81 | no |
| p2-snap002 | abd1458, SNAP 0.02 | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 1.84 | yes |
| p2-snap01 | abd1458, SNAP 0.1 | 98.8 % | 98.9 % | 4.9 % (94.1 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 1.86 | no |
| p2-final | 5bbf3e2 | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 1.75 | yes |
| p2-conf | 52b419d | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 34.8 % | 0.501 | 1.81 | yes |
| p2-conf20 | fc7c3e9 | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 35.0 % | 0.500 | 1.58 | no |
| p2-confenv | 1c1fbfb | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 35.0 % | 0.500 | 3.69* | yes |
| p3-frames | 2ccab73 | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 35.0 % | 0.500 | 1.55 | — (refactor) |
| p3-noheur | 35a94d9 + Task 18 | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 30.2 % | 0.471 | 3.76* | no |
| p3-frames-rerun | 4555a2d (time only) | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 35.0 % | 0.500 | 3.64 | — |
| p3-hpss | 4555a2d + binary mask | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 37.4 % | 0.540 | 4.90 | no |
| p3-hpss-soft | 4555a2d + soft mask | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 36.8 % | 0.528 | 3.91 | — |
| p3-hpss-final | a2fedad | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 36.8 % | 0.528 | 4.01 | yes |
| p3-norm | 8b3a07f + Task 20 | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 36.7 % | 0.527 | 3.95 | no |
| p3-floor100 | 8b3a07f, floor 100 Hz | 98.9 % | 98.9 % | 4.8 % (94.2 % at -26.8 ms) | 100.0 % | 36.8 % | 0.531 | 3.97 | no |
| p3-floor130 | 8b3a07f, floor 130 Hz | 98.9 % | 98.9 % | 4.8 % (94.3 % at -26.8 ms) | 100.0 % | 35.4 % | 0.519 | 3.98 | no |

Baseline notes (p1-baseline):
- **BPM errors point up.** Most misses are above Traktor: 34.6 % are +0.5 to +1.5 and 43.7 % are above +1.5. Half or double is 0 %.
- **Key.**
  - Exact against Traktor is 28.3 % (MIREX 0.437), against Rekordbox 31.2 % (MIREX 0.440), and on consensus 34.8 % (MIREX 0.501, 821 tracks).
  - The predicted keys are skewed: 6A is 23.4 %, 1A 15.1 %.
- **Confidence.** BPM: right 1.000, wrong 0.998, so it carries no signal. Key: right 0.539, wrong 0.436.
- **Reference ceiling, Traktor against Rekordbox.**
  - BPM: ±0.5 98.7 % (1200 tracks).
  - Key: the same on 68.4 % (1201 tracks).
  - Grid on MP3: Rekordbox sits 27.3 ms earlier than Traktor (signed median), and ≤20 ms is 38.2 %. That is likely encoder delay handled differently. On WAV/AIFF/FLAC only 1 track can be compared.
- **Formats.** Only 4 measured WAV/AIFF/FLAC tracks have a Traktor marker; the reference set is almost all MP3.
- **The spec's "87 % BPM" figure measured Traktor's own tags, not RecoDeck's detection.** In the library, 7165 of 8073 tracks hold a tag BPM (confidence 0.99), and only 839 hold a detected one.
- **Time.** 2.99 s per measured track, so the budget is ≤ 4.5 s.

Phase 2 notes (p2-final, 2026-10-18):
- **Grid ≤20 ms MP3 column.** The first number is against Traktor's marker as is. The bracket removes one constant: the signed median of the right-tempo MP3 offsets within ±40 ms (−26.8 ms).
  - Traktor sits 26.8 ms after our MP3 timeline on every MP3. Rekordbox does so on some files and not others: 43.5 % of MP3s match our timeline in Rekordbox, 22.8 % match Traktor's.
  - Against Rekordbox's marker as is, MP3 ≤20 ms is 64.0 %.
  - **Decision (user, Checkpoint 2, 2026-10-18):** the MP3 grid target is counted with this constant removed: 94.2 %, met. `first_beat_ms` stays in our decoder's timeline; the per-app MP3 offsets belong to export.
  - WAV/AIFF/FLAC (4 tracks) sit −1.0 ms from Traktor (signed median), so the lossless timeline agrees.
  - Per format, p2-final: MP3 ≤10 3.1 %, ≤20 4.8 %, ≤40 97.0 % as is; WAV/AIFF/FLAC ≤10 75 %, ≤20 100 %, ≤40 100 %.
- **Bar phase** (right tempo): agrees with Traktor's marker on 92.7 % (p2-grid: 78.7 %) and with Rekordbox's downbeat on 93.2 % (78.9 %).
- **Gapless.** `GAPLESS = true` moves every MP3 grid 25 ms earlier (about the MP3 encoder plus decoder delay, 576 + 529 samples at 44.1 kHz), away from both references, so it stays `false`.
- **SNAP_BPM.** 0.0, 0.02 and 0.05 tie on ±0.05 (1557 of 1575) and ±0.5 (1558), so the rule as written picks 0.0. The rule was extended with two finer measures, which 0.02 wins: within ±0.005, 1543 against 1526 for 0.0; MP3 grid with the offset removed, 94.2 % against 93.8 %. 0.02 is the smaller of the two best (0.02, 0.05). The user confirmed 0.02 at Checkpoint 2 (2026-10-18).
- **Confidence.** The median is 0.207 for right tempos and 0.057 for wrong ones, so there is a gap; 0.1 % of right tempos are ≥ 0.9. At Checkpoint 2 the user chose the level-jump rule with c = 1.25 (prototype: right 0.780, wrong 0.308, noise 0.07). Built in 52b419d and measured as p2-conf: right-tempo median 0.777 (22.2 % ≥ 0.9, 86.2 % ≥ 0.5), wrong 0.138; report means right 0.734, wrong 0.356. BPM is identical on every row.
- **Confidence window** (after review). p2-conf's level jump counted grids from −60 to +40 ms off the kicks as hits. p2-conf20 also required the low band's peak within 20 ms: right-tempo median 0.583, dropped. p2-confenv requires the envelope's peak (low plus full band, spec §2 step 5) within 20 ms: right 0.754 (19.1 % ≥ 0.9, 84.0 % ≥ 0.5), wrong 0.063, kept. *Its time was measured while another job ran.
- **Phase 3 compares against p3-frames** (MIREX 0.500, exact 35.0 %): the refactor is the current code.
- **Key errors are mostly a fifth up** (p3-frames, consensus): exact 35.0 %, same mode a fifth up 21.9 %, a fifth down 2.1 %, parallel 18.4 %. That is where the 6A/1A skew comes from (true 5A read as 6A, 12A as 1A). The synthetic A minor under a kick reads 12B (E), the same error. p3-noheur (Task 18) raised the fifth-up share to 25.3 % and MIREX fell to 0.471, so it was dropped; the dominant fix was holding some of this back.
- **Harmonic/percussive separation (Task 19).** The plan's binary mask gave MIREX 0.540 (exact 37.4 %) but broke `test_key_detection_different_sample_rate`: a pure 440 Hz tone at 48 kHz read 1B, because whitened faint bins were zeroed at random. The kept soft mask H²/(H²+P²) gives MIREX 0.528 (exact 36.8 %) and passes every test. Medians come from running sorted windows, and the spectrogram is processed 512 frames at a time, since the key region is unbounded. The fifth-up share stays 21.9 %. Key confidence separates less: right 0.502, wrong 0.455 (was 0.536 / 0.433).
- **Times from p2-confenv on** were measured with the Mac in Low Power Mode (`pmset powermode 1`). p3-frames re-ran at 3.64 s/track against 1.55 before, so each step's time is compared with a same-day re-run: p3-hpss-final is 1.10× p3-frames-rerun.
- **Tasks 20–21.** Per-frame normalisation: MIREX 0.527, dropped. Chroma floor: 65 Hz is today's `MIN_FREQ` and stays (`CHROMA_MIN_FREQ`, 5d736c9). 100 Hz gave 0.531 (about 2–3 tracks, within noise; fifth up 22.7 %) but broke the 48 kHz pure-tone test, the second variant that test blocked. 130 Hz gave 0.519.
- **Run-to-run noise.** Two runs of the same code differ on about 30 of 1958 first beats by < 1 ms, and on one wrong-tempo track by 204 ms. BPM and key do not move. The source is not found yet (likely state inside aubio).
- **Time.** p1-warm and p2-final ran back to back on a warm file cache with nothing else running: 1.26 → 1.75 s per track, 1.39× the baseline. The other rows' times are not comparable: p2-grid and p2-gapless ran with a cold cache, the others warm.
- **Fast and long tracks.** 7 of 1591 measured tracks are above 160 BPM in Traktor. 17 are longer than 10 min; the slowest takes 30 s.
