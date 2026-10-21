# Analysis accuracy: BPM, key and a beat grid

Date: 2026-10-17. This is the first part of the beat-grid work, which also feeds Track Studio, the grid check report,
the beatmatch crossfade and master BPM. The rule agreed for it: measure BPM and key detection before building on them.

## Problem

The stored analysis of a real library was compared with Traktor's collection for the same files (1326 tracks):

| | Matches Traktor | The rest |
|---|---|---|
| BPM (±0.5) | 87% | 6% off by about 1, 7% off by 2–5, 0.2% half/double time |
| Key (exact) | 28% | 25% one step on the Camelot wheel, 19% parallel major/minor, 2% relative, 26% other |

- **BPM errors point up.** Almost every wrong BPM is 1–3 above Traktor's (122 → 123, 116 → 117.45). The causes:
  - `compute_bpm_from_ibis` uses beat times rounded down to the 512-sample hop. The interval BPM can therefore only
    be `60·sr/(512·n)`: 117.45, 120.2, 123.0, 126.0, 129.2… at 44.1 kHz.
  - aubio reports where the beat falls inside the hop, and `run_tempo_analysis` drops it.
  - aubio's own `get_bpm()` is read once, after the last frame, so it describes the outro.
- **Key leans on two heuristics in `match_key_profiles`.** A major result flips to the parallel minor when the
  correlations are close, and the root moves a fifth when the fifth is close. These match the two biggest error
  groups.
  - Kick and bass between 65 and 130 Hz count toward the chromagram.
  - 42% of the library sits in two keys (6A, 1A), while Traktor spreads the same tracks evenly.
- **Confidence says nothing.** Wrong BPMs average 0.99, the same as right ones.
- **No grid.** Beat positions are computed, then thrown away. The crossfade's phase alignment assumes beat 1 sits at
  0 ms in both tracks (`audioPlayer.ts`, `phase = position % beatMs`).
- **Smaller problems:**
  - Tag BPM and detected BPM share one column, and every analysis overwrites the tag.
  - Key tags are never read.
  - A failed BPM is saved as `0.0`, which counts as analysed, so it is never retried.
  - Nothing records which algorithm produced a value.
  - `OPENKEY_*` in `key.rs` reuses the Camelot numbers (C = "8d"; Open Key has C = "1d"). It is not shown anywhere.
  - A packet that fails to decode is dropped, which shifts every later sample earlier.

## Goal

BPM and key good enough to build on, plus a stored beat grid. Each is checked by a measurement that anyone with a
Traktor or Rekordbox collection can repeat.

**Targets.** The reference is Traktor; for key it is the tracks where Traktor and Rekordbox agree.

| | Target |
|---|---|
| BPM within ±0.5 | ≥ 98%, leaving out tracks where Traktor and Rekordbox differ by more than 0.5 |
| First beat within 20 ms of Traktor's grid (§1, Grid) | ≥ 90%, for MP3 and for WAV/AIFF/FLAC separately |
| Key exact | ≥ 75% |
| Time per track | at most 1.5× today's. Within that, accuracy wins |

**A missed target stops only its own part.**
- After the steps listed for a part (§2 BPM and grid, §3 key), that part keeps its best measured version.
- The numbers then go to the user, who decides whether it ships.
- The other parts go ahead.
- §4 and §5 ship either way, as long as BPM and key are no worse than the baseline.
- A model (ONNX) for key would be a separate decision.

## Phases

The plan follows these phases and stops after each one to show the user the numbers:
1. **The tool and the baseline (§1).** Today's code, measured. The tool needs `camelot_from_traktor` and the tag key
   parser (§4) to read both collections, so those two are built in this phase.
2. **BPM, grid and decoder (§2).** `detect_bpm` changes its result here. The four unused commands (§4) still call
   it, so they are removed in this phase.
3. **Key (§3).**
4. **Data, tags, re-analysis (§4, §5).** Then a final run on the whole reference set.

## Out of scope

Each of these is its own spec later:
- using the grid in the crossfade (beatmatch);
- master BPM changes;
- Track Studio (grid editing, cues);
- the grid check report;
- writing the grid into the Rekordbox/Traktor export.

Also out of scope:
- tempo ranges other than today's 70–160 fold;
- tracks whose tempo changes: they get a low confidence and nothing else.

## 1. Measurement tool: `recodeck-eval`

New binary `src-tauri/src/bin/recodeck-eval.rs`, for development only. It never opens the library database.

**Build.** It sits behind a Cargo feature, so the app gains no dependency:
- `[[bin]] name = "recodeck-eval"`, `required-features = ["eval"]`;
- `eval = ["dep:roxmltree"]`, with `roxmltree` optional.

```
cargo run --release --features eval --bin recodeck-eval -- \
  --traktor <collection.nml> [--rekordbox <collection.xml>] [--sample N --seed S] [--csv <out.csv>]
```

**Inputs**
- **Traktor NML:**
  - Path: `LOCATION` `DIR` (with `/:` → `/`) plus `FILE`.
  - A `VOLUME` that isn't the boot volume (`formats::volumes::boot_volume_name()`) is prefixed with
    `/Volumes/<VOLUME>`. This is the inverse of `formats/traktor.rs::location()`.
  - BPM from `TEMPO@BPM`.
  - Key from `MUSICAL_KEY@VALUE`, converted with a new `formats::keys::camelot_from_traktor`.
  - Grid from the first `CUE_V2` with `TYPE="4"` (`START`, in ms).
- **Rekordbox XML** (File → Export Collection in xml format):
  - Path from `TRACK@Location`, a `file://localhost` URL, percent-decoded.
  - BPM from `AverageBpm`.
  - Key from `Tonality`, read with the §4 tag parser.
  - Grid from the first `TEMPO` (`Inizio` in s; `Battito` is the beat in the bar).
- Paths are NFC-normalised and joined across the two files.
- The report says how many referenced files were not found on disk.

**Run**
- It uses the same `decode_to_mono`, BPM, grid and key functions as the app, on every referenced file that exists.
  `--sample` picks a random subset instead.
- It runs on all cores (rayon).
- To compare variants, change the code and run again. The tool has no algorithm switches.

**Report (stdout)**
- **BPM:**
  - share within ±0.05 and within ±0.5;
  - off by 0.5–1.5; half/double; other;
  - signed error buckets.
- **Key:**
  - exact, ±1 on the wheel, relative, parallel, other;
  - the MIREX weighted score (1 / 0.5 / 0.3 / 0.2);
  - each against Traktor, against Rekordbox, and on the consensus set (where both agree);
  - the distribution of predicted keys.
- **Grid:**
  - The phase error is the distance from Traktor's marker time to our nearest grid beat, using our BPM and
    `first_beat_ms`.
  - It shows the median and the share within 10, 20 and 40 ms, per format.
  - Bar phase is shown against Traktor's marker (mod 4 beats) and against Rekordbox `Battito`.
- **References:** how often Traktor and Rekordbox agree with each other. That is the ceiling.
- **Confidence:** the mean for right and for wrong answers. A useful confidence shows a gap.
- **Time:**
  - wall time;
  - `seconds per track on one core` (wall time × cores ÷ tracks). §5 uses this figure.

`--csv` writes one row per track. It holds file paths, so it is never committed (see Privacy).

The XML reading stays in the binary. The pure logic lives in the library, so a plain `cargo test` covers it:
- the Traktor location inverse, in `formats::traktor`;
- the Rekordbox URL decode, in `formats::rekordbox`;
- the key conversions, in `formats::keys`.

The first run measures today's code (the baseline). A change in §2 or §3 stays only if the tool shows it helps.

## 2. BPM and grid

`detect_bpm` returns more than today:

```rust
pub struct BpmResult { pub bpm: f64, pub confidence: f64, pub first_beat_ms: Option<f64> }
```

### Onset envelope

The onset envelope is always computed: steps 2, 4 and 5 use it.
- Two bands, low (kick) and full, of spectral flux.
- A hop of 256 samples or finer, interpolated.

### Steps

1. **Candidate.** Today's aubio passes and consensus give a starting tempo, with one change. Beat times come from
   aubio's last-beat time (`get_last`), which includes the in-hop position and also keeps beats that fall exactly on a
   hop boundary.
   - aubio still moves `last_beat` in hops that its silence check rejects. Those hops are dropped by running the same
     check (`aubio_silence_detection`, −90 dB) on each input hop.
   - Folding to 70–160 stays.
2. **Fit.** Find the tempo and phase whose constant grid lines up best with the beats across the whole track.
   - **The cheap way first:** a least-squares line through the precise beat times, with outliers (> ¼ beat) dropped.
   - **The envelope search** is added only if the tool shows it is needed. It tries tempos within ±2% of the
     candidate at 0.01 BPM and phases at 1 ms, coarse to fine, and scores each by the envelope at the grid points.
   - **Latency.** aubio applies no latency compensation (`tempo.c`, `delay = 0`), and its window and peak picker report
     beats late by a roughly constant amount. That amount is measured on the synthetic click tests and subtracted as one
     constant, `BEAT_LATENCY_MS`.
3. **Snap.** A tempo within `SNAP_BPM` of a whole number becomes that number, and the phase is refitted at it.
   `SNAP_BPM` starts at 0.05; the tool tunes it.
4. **First beat.**
   - `first_beat_ms` is the grid beat nearest the first strong onset in the low band, i.e. where the music starts.
   - The grid counts bars of 4 beats from it, so it is also the downbeat.
   - Bar phase is measured but has no target. Track Studio will let the user move it.
5. **Confidence.** The share of grid beats inside music sections that land within 20 ms of an envelope peak.
   - Music sections are found from the envelope alone, without the grid: 2-second windows whose low-band energy is
     above 10% of the track's median. Breakdowns without a kick drop out.
   - A steady track scores near 1. A tempo change or a live recording scores low, because the grid drifts away from
     beats that are still there.

When no tempo is found, the result is `None`, never `0.0` (§4).

### Decoder timeline (`decoder.rs`)

- A packet that fails to decode becomes silence of the packet's length, so later samples keep their time.
- MP3/AAC encoder delay (`enable_gapless`): the tool measures the MP3 grid offset against Traktor both ways, and
  against WAV/AIFF. The setting that lines MP3 up with Traktor stays.
- Whether the WebView player uses the same timeline is checked in the beatmatch spec, where the grid is first used.

## 3. Key

These steps run in order. After each one the tool runs on the consensus set. A step stays only if the MIREX score
goes up; the exact share breaks ties.

1. Remove three things from `match_key_profiles`: the parallel-minor flip, the dominant (fifth) fix and the cross check.
2. Less drums. Each of the three sub-steps is measured on its own:
   1. Harmonic/percussive separation by median filter on the magnitude spectrogram, with chroma taken from the
      harmonic part only.
   2. Normalise each frame's chroma before summing, so loud drum frames don't outweigh the rest.
   3. A lower frequency floor of 65, 100 or 130 Hz.
3. Profiles: each set alone (Shaath, EDMA, Krumhansl, plus Temperley) against today's vote. The best one stays.

**Confidence formula stays as today:** 0.7 × gap score + 0.3 × strength, scaled by segment agreement. It is computed
after the heuristics are gone.

**Not measured:** Open Key moves to `formats::keys` as standard Open Key (C = 1d, Am = 1m). `key.rs` takes it from
there and drops its own `OPENKEY_*` tables.

## 4. Data, tags and what needs analysis

**Migration `022_analysis_grid.sql`.** It uses the column-check guard of earlier `ALTER TABLE` migrations.

```sql
ALTER TABLE track_analysis ADD COLUMN first_beat_ms REAL;       -- a grid beat that starts a bar, ms from file start
ALTER TABLE track_analysis ADD COLUMN analysis_version INTEGER; -- NULL: from tags or from analysis before this spec
UPDATE track_analysis SET bpm = NULL, bpm_confidence = NULL WHERE bpm = 0;  -- old failures
```

`audio::ANALYSIS_VERSION: i64 = 1` goes up whenever detection changes enough to be worth a re-analysis.

**Saving.** There is one call per track in `analyze_tracks_batch`.
- It writes `bpm`, `bpm_confidence`, `first_beat_ms`, `musical_key`, `key_confidence` and
  `analysis_version = ANALYSIS_VERSION`.
- **What detection could not find keeps the stored value.** BPM and `first_beat_ms` (with `bpm_confidence`) are written
  together or not at all, so a new BPM never pairs with an old grid. Key and `key_confidence` work the same way.
  Nothing is ever saved as `0.0`.
- **The version is written whenever the file was read**, including when detection found nothing or the file could not
  be decoded. Such a track waits for the next version or a forced re-analysis, not the next start-up.
- **A file not on disk** saves nothing. Missing Files handles it.

**Needs analysis.** A track needs analysis when `analysis_version IS NULL OR analysis_version < ANALYSIS_VERSION` and
its file is on disk.
- "On disk" means `!missing_files::is_missing(path)`.
- `analyze_tracks_batch` uses the same check instead of `path.exists()`, so the rule and the batch never disagree.
- **`analyze_tracks_batch` with `force = false`** uses this rule instead of "has BPM and key".
- **`force = true`** (the context menu, a folder) re-analyses as today.
- **Home's "Analyze all"** lists tracks with no BPM that need analysis (`db/home.rs::get_track_ids_without_bpm` gains
  the version condition). Once a track has been read and has no BPM, it leaves the list instead of staying there for
  good.

**Unused writers removed.** `analyze_bpm`, `analyze_key`, `analyze_all_bpm` and `analyze_all_keys` save `0.0` and write
no version. Nothing in the UI calls them, so they are removed along with their `tauri-api.ts` wrappers. That leaves
`analyze_tracks_batch` as the only writer.

**Tags.** The user chose: analysis wins, and tags fill in until then.
- **Reading.** On import, BPM is read as today, and now key too, from `ItemKey::InitialKey` (ID3 TKEY, MP4 iTunes
  initialkey, Vorbis INITIALKEY/KEY).
  - Both import paths change: `scanner.rs::import_file` and the tag read in `commands/library.rs`.
  - Both unpack the `(track, tag_bpm, tag_genre)` tuple, which gains `tag_key`.
- **Accepted key forms.** Anything else is ignored.
  - Camelot: "8A", "08a".
  - Open Key: "1m", "6d".
  - Names: "Am", "A minor", "Amin", "F#m", "Gbm", "C", "C major", "Cmaj", "Db", including ♯/♭.
- **Stored values.**
  - Key is stored as Camelot with `key_confidence = NULL`, so the key cell shows no percentage.
  - Tag BPM is now stored with `bpm_confidence = NULL` instead of 0.99, since a tag value has no confidence.
  - Both have `analysis_version = NULL`.
- **Where the code lives.** The parser (`formats::keys::camelot_from_tag`) and `camelot_from_traktor` live in
  `formats::keys`, next to the existing notation tables.

## 5. Re-analysis

**Status command**

`analysis_status() -> AnalysisStatus`:

```rust
pub struct AnalysisStatus {
    pub version: i64,           // ANALYSIS_VERSION
    pub needing: usize,         // tracks that need analysis (§4), files on disk only
    pub with_old_values: usize, // of those, tracks with a BPM or key that has a confidence (an older analysis, not a tag)
    pub estimate_minutes: u32,  // needing × SECONDS_PER_TRACK ÷ cores, rounded up to 5
}
```

- `SECONDS_PER_TRACK` is the tool's "seconds per track on one core".
- `cores` is `std::thread::available_parallelism()`.
- `track_ids_needing_analysis() -> Vec<i64>` returns the same set as `needing`.

**One prompt per version**

The prompt appears after start-up, once the library has loaded, when both are true:
- the setting `analysis_prompted_version` < `status.version`;
- `status.with_old_values > 0`.

Someone who has never analysed gets no "improved" message, because new tag values carry no confidence.

```
Better BPM and key detection
This version finds BPM, key and the beat grid more accurately. Re-analyze {needing} tracks now?
It takes about {estimate_minutes} min, and you can keep using RecoDeck.
                                                      [Later]  [Re-analyze]
```

- Both buttons save `analysis_prompted_version = status.version`.
- **Re-analyze** runs `analyze_tracks_batch(track_ids_needing_analysis(), force = false)`.

**Settings → Database, "Re-analyze library"**
- When `needing > 0`:
  - the hint reads "{needing} tracks aren't analyzed with the current version (about {estimate_minutes} min).";
  - the button reads Re-analyze.
- When `needing = 0`, the hint reads "All tracks use the current analysis." and the button is disabled.

Progress and Cancel use the existing analysis progress UI and events.

## Tests

**BPM and grid (unit, synthetic)**
- Click tracks at 122.0, 123.5 and 127.33 BPM with the first click at a known offset (e.g. 137 ms), at 44.1 and 48 kHz.
- One more with 8 s of silence before the first click.
- BPM must be within ±0.05 (today's tests allow ±3), and `first_beat_ms` within ±5 ms.
- A track whose tempo changes halfway must get a lower confidence than a steady one.

**Key (unit)**
- Today's chord tests.
- An A minor chord under a loud 50–120 Hz kick on every beat must still give 8A.

**Decoder.** A corrupt packet must leave the samples after it at their original time. If a corrupt fixture can't be
built, test the gap-filling helper instead.

**DB**
- Migration 022 is idempotent and clears `0.0` BPMs.
- The needs-analysis rule, including that missing files are left out.
- The save rules: BPM and grid are written together; a value that wasn't found is kept; the version is written after
  a decode failure.
- `analysis_status` counts.
- Home's list leaves out tracks that have been read and have no BPM.

**Tags.** The key parser for every accepted form, a list of forms it must reject, and both import paths.

**Frontend (vitest).** When the prompt shows, and the Settings hint.

**Real library.** `recodeck-eval` runs before and after each phase on the maintainer's Traktor and Rekordbox
collections, locally. The aggregate numbers go into the plan's results section.

## Privacy

The repo is public.
- The eval tool takes every path as an argument.
- Its CSV and stdout stay on the machine.
- Commits and docs carry aggregate percentages only, never track names, paths or the collection files.
- Fixtures are synthetic.
