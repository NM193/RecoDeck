# Analysis accuracy: BPM, key and a beat grid

Date: 2026-10-17. The first part of the beat-grid work (ideas: Track Studio, grid check report, beatmatch crossfade,
master BPM). The rule agreed for it: measure BPM and key detection before building on them.

## Problem

The stored analysis of a real library was compared with Traktor's collection for the same files (1326 tracks):

| | Matches Traktor | The rest |
|---|---|---|
| BPM (±0.5) | 87% | 6% off by about 1, 7% off by 2–5, 0.2% half/double time |
| Key (exact) | 28% | 25% one step on the Camelot wheel, 19% parallel major/minor, 2% relative, 26% other |

- **BPM errors point up.** Almost every wrong BPM is 1–3 above Traktor's (122 → 123, 116 → 117.45).
  `compute_bpm_from_ibis` uses beat times rounded down to the 512-sample hop, so the interval BPM can only be
  `60·sr/(512·n)`: 117.45, 120.2, 123.0, 126.0, 129.2… at 44.1 kHz. aubio reports where the beat falls inside the hop;
  `run_tempo_analysis` drops it. aubio's own `get_bpm()` is read once, after the last frame, so it describes the outro.
- **Key leans on two heuristics.** In `match_key_profiles` a major result flips to the parallel minor when the
  correlations are close, and the root moves a fifth when the fifth is close. These match the two biggest error
  groups. Kick and bass between 65 and 130 Hz count toward the chromagram. 42% of the library sits in two keys (6A, 1A);
  Traktor spreads the same tracks evenly.
- **Confidence says nothing.** Wrong BPMs average 0.99, the same as right ones.
- **No grid.** Beat positions are computed, then thrown away. The crossfade's phase alignment assumes beat 1 sits at
  0 ms in both tracks (`audioPlayer.ts`, `phase = position % beatMs`).
- **Smaller problems:**
  - Tag BPM and detected BPM share one column, and every analysis overwrites the tag.
  - Key tags are never read.
  - A failed BPM is saved as `0.0`, which counts as analysed, so it is never retried.
  - Nothing records which algorithm produced a value.
  - `OPENKEY_*` reuses the Camelot numbers (C = "8d"; Open Key has C = "1d"). It is not shown anywhere.
  - A packet that fails to decode is dropped, which shifts every later sample earlier.

## Goal

BPM and key good enough to build on, plus a stored beat grid, each checked by a measurement anyone with a
Traktor or Rekordbox collection can repeat.

**Targets** (reference = Traktor; for key, the tracks where Traktor and Rekordbox agree):

| | Target |
|---|---|
| BPM within ±0.5 | ≥ 98% (excluding tracks where Traktor and Rekordbox differ by more than 0.5) |
| First beat within 20 ms of Traktor's grid, mod one beat | ≥ 90%, for MP3 and for WAV/AIFF/FLAC separately |
| Key exact | ≥ 75% |
| Time per track | no slower than today's |

If key stays under its target after the steps in §3, the work stops there and the numbers go to the user. A model
(ONNX) would be a separate decision.

## Out of scope

Each of these is its own spec later:
- using the grid in the crossfade (beatmatch);
- master BPM changes;
- Track Studio (grid editing, cues);
- the grid check report;
- writing the grid into the Rekordbox/Traktor export.

Also out of scope: tempo ranges other than today's 70–160 fold, and tracks whose tempo changes. Those get a low
confidence and nothing else.

## 1. Measurement tool: `recodeck-eval`

New binary `src-tauri/src/bin/recodeck-eval.rs`, for development only. It never opens the library database.

```
recodeck-eval --traktor <collection.nml> [--rekordbox <collection.xml>] [--sample N --seed S] [--csv <out.csv>]
```

**Inputs**
- **Traktor NML:**
  - path from `LOCATION` (`DIR` with `/:` → `/`, plus `FILE`);
  - BPM from `TEMPO@BPM`;
  - key from `MUSICAL_KEY@VALUE`, converted through `formats::keys`;
  - grid from the first `CUE_V2` with `TYPE="4"` (`START`, ms).
- **Rekordbox XML** (File → Export Collection in xml format):
  - path from `TRACK@Location` (a `file://localhost` URL, percent-decoded);
  - BPM from `AverageBpm`;
  - key from `Tonality`, either a classic name ("Am") or Camelot;
  - grid from the first `TEMPO` (`Inizio` s, `Battito` = beat in the bar).
- Paths are NFC-normalised and joined across the two files.

**Run**
- Uses the same `decode_to_mono`, BPM, grid and key functions as the app, on every referenced file that exists.
  Without `--sample`, it runs on all of them.
- Uses all cores (rayon).
- To compare variants, change the code and run again. The tool has no algorithm switches.

**Report (stdout)**
- **BPM:** share within ±0.05 and ±0.5; off by 0.5–1.5; half/double; other. Signed error buckets.
- **Key:** exact, ±1 on the wheel, relative, parallel, other, and the MIREX weighted score (1 / 0.5 / 0.3 / 0.2).
  - Shown against Traktor, against Rekordbox, and on the consensus set (both references agree).
  - Plus the predicted-key distribution.
- **Grid:** phase error mod one beat (median, share ≤ 10 / 20 / 40 ms), per format. Bar phase against
  Traktor's marker mod 4 beats, and against Rekordbox `Battito`.
- **References:** how often Traktor and Rekordbox agree with each other, as the ceiling.
- **Confidence:** the mean for right and for wrong answers, so a useful confidence shows up as a gap.
- **Time:** seconds per track (release build).

`--csv` writes one row per track. It holds file paths, so it is never committed (see Privacy).

The first run measures today's code (baseline). Every change in §2 and §3 is kept only if the tool shows it helps.

## 2. BPM and grid

`detect_bpm` returns more than today:

```rust
pub struct BpmResult { pub bpm: f64, pub confidence: f64, pub first_beat_ms: Option<f64> }
```

**Steps**
1. **Candidate.** Today's aubio passes and consensus give a starting tempo, with one change: beat times use aubio's
   in-hop position, i.e. the real beat time, not the hop's start. Folding to 70–160 stays.
2. **Fit.** The tempo and phase that line a constant grid up best with the onsets across the whole track: tempo within
   ±2% of the candidate at 0.01 BPM, phase at 1 ms, coarse to fine. The onsets are a low-band (kick) plus full-band
   onset envelope at a hop of 256 samples or finer, interpolated.
   - The plan tries the cheap way first: a least-squares line through aubio's precise beat times, with outliers
     dropped.
   - The envelope search is added only if the tool shows it is needed.
3. **Snap.** A tempo within `SNAP_BPM` (start at 0.05; the tool tunes it) of a whole number becomes that number, and
   the phase is refitted at it.
4. **First beat.** `first_beat_ms` is the grid beat nearest to the first strong onset (where the music starts). The grid
   counts bars of 4 beats from it, so it doubles as the downbeat. Bar phase is measured but has no target; Track Studio
   will let the user move it.
5. **Confidence.** The share of grid beats in sections with music that land within 20 ms of an onset. Sections with no
   beats (breakdowns) are left out. A steady track scores near 1; a tempo change or a live recording scores low.

When no tempo is found, the result is `None`, never `0.0` (§4).

**Decoder timeline** (`decoder.rs`)
- A packet that fails to decode is replaced by silence of the packet's length, so later samples keep their time.
- MP3/AAC encoder delay (`enable_gapless`): the tool measures the MP3 grid offset against Traktor both ways and against
  WAV/AIFF. The setting that lines MP3 up with Traktor stays.
  - Whether the WebView player uses the same timeline is checked in the beatmatch spec, where the grid is first used.

## 3. Key

These steps run in order. After each one the tool runs on the consensus set, and a step stays only if the MIREX
score goes up (exact share as the tie-break):

1. Remove the parallel-minor flip, the dominant (fifth) fix and the cross check from `match_key_profiles`.
2. Less drums:
   - median-filter harmonic/percussive separation on the magnitude spectrogram, with chroma from the harmonic part only;
   - normalise each frame's chroma before summing, so loud drum frames don't outweigh the rest;
   - try a lower frequency floor of 65, 100 and 130 Hz.
3. Profiles: each set alone (Shaath, EDMA, Krumhansl, plus Temperley) against today's vote; keep the best.
4. Fix the Open Key tables to standard Open Key (C = 1d, Am = 1m).

Confidence stays the gap between the best and second-best correlation, computed after the heuristics are gone.

## 4. Data, tags and what needs analysis

**Migration `022_analysis_grid.sql`**, with the column-check guard used for earlier `ALTER TABLE` migrations:

```sql
ALTER TABLE track_analysis ADD COLUMN first_beat_ms REAL;       -- a grid beat that starts a bar, ms from the file start
ALTER TABLE track_analysis ADD COLUMN analysis_version INTEGER; -- NULL: from tags or from analysis before this spec
```

`audio::ANALYSIS_VERSION: i64 = 1`. It goes up whenever detection changes in a way that is worth a re-analysis.

**Saving** (one call per track, in `analyze_tracks_batch`):
- writes `bpm`, `bpm_confidence`, `first_beat_ms`, `musical_key`, `key_confidence` and
  `analysis_version = ANALYSIS_VERSION`;
- **A value detection could not find keeps the stored value.** A tag BPM survives a failed BPM, and nothing is ever
  saved as `0.0`. The version is still written, so the track is not retried until the next version.
- A file that can't be decoded saves nothing, so it is retried next time.

**Needs analysis:** `analysis_version IS NULL OR analysis_version < ANALYSIS_VERSION`.
- This replaces "has BPM and key" in `analyze_tracks_batch` with `force = false`.
- `force = true` (the context menu, a folder) re-analyses as today.
- Home's "Analyze all" (tracks without BPM) does not change.

**Tags** (the user's choice: analysis wins; tags fill in until then):
- **Import:** reads BPM as today, and now key from `ItemKey::InitialKey` (ID3 TKEY, MP4 iTunes initialkey, Vorbis
  INITIALKEY/KEY).
- **Key forms accepted:**
  - Camelot ("8A", "08a");
  - Open Key ("1m", "6d");
  - names ("Am", "A minor", "Amin", "F#m", "Gbm", "C", "C major", "Db", including ♯/♭).
  - Anything else is ignored.
- **Storage:** stored as Camelot with `key_confidence = NULL`, so the key cell shows no percentage, and with
  `analysis_version = NULL`.
- The parser lives in `formats::keys`, next to the existing notation tables.

## 5. Re-analysis

- **One prompt per version.** It appears after start-up, once the library has loaded, when both are true:
  - setting `analysis_prompted_version` < `ANALYSIS_VERSION`;
  - some tracks need analysis and already have a BPM or a key from an older analysis or from tags.

  ```
  Better BPM and key detection
  This version finds BPM, key and the beat grid more accurately. Re-analyze {N} tracks now?
  It takes about {X} min, and you can keep using RecoDeck.
                                                      [Later]  [Re-analyze]
  ```
  - **Both buttons** save `analysis_prompted_version = ANALYSIS_VERSION`.
  - **Re-analyze** runs `analyze_tracks_batch(ids, force = false)` on the tracks that need analysis.
  - **{X}:** `N × SECONDS_PER_TRACK / cores`, rounded up to 5 minutes. `SECONDS_PER_TRACK` is the constant the tool
    measured.
- **Settings → Database, "Re-analyze library":**
  - with tracks to do, the hint is "{N} tracks were analyzed by an older version." and the button is Re-analyze;
  - otherwise the hint is "All tracks use the current analysis." and the button is disabled.
- **Progress and Cancel** use the existing analysis progress UI and events.
- **New commands:**
  - `count_tracks_needing_analysis() -> { needing: usize, with_old_values: usize }`;
  - `track_ids_needing_analysis() -> Vec<i64>`.

## Tests

- **BPM and grid (unit, synthetic):** click tracks at 122.0, 123.5 and 127.33 BPM with the first click at a known
  offset (e.g. 137 ms), at 44.1 and 48 kHz, plus one with 8 s of silence before the first click.
  - BPM must be within ±0.05 (today's tests allow ±3) and `first_beat_ms` within ±5 ms.
  - A track with a tempo change halfway must get a confidence below a steady one.
- **Key (unit):** today's chord tests, plus an A minor chord under a loud 50–120 Hz kick on every beat, which must
  still give 8A.
- **Decoder:** a corrupt packet keeps the samples after it at their original time (or a test on the gap-filling helper,
  if a corrupt fixture can't be built).
- **DB:**
  - migration 022 is idempotent;
  - the needs-analysis rule;
  - the "keep the stored value" save rule;
  - the counts for the prompt.
- **Tags:** the key parser for every accepted form, and a rejection list.
- **Frontend (vitest):** when the prompt shows, and the minutes estimate.
- **Real library:** `recodeck-eval` before and after, on the maintainer's Traktor and Rekordbox collections, locally.
  The aggregate numbers go into the plan's results section.

## Privacy

The repo is public:
- The eval tool takes every path as an argument.
- Its CSV and stdout stay on the machine.
- Commits and docs carry aggregate percentages only, never track names, paths or the collection files.
- Fixtures are synthetic.
