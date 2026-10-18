// BPM (tempo) and beat grid detection (spec 2026-10-17, §2).
//
// 1. Candidate: aubio Tempo passes (SpecFlux, Hfc, Complex) on audio low-passed
//    at 500 Hz, plus SpecFlux on the unfiltered audio as a cross-check. Each
//    pass gives a tempo from its median inter-beat interval and aubio's own
//    estimate; all are folded to 70–160 BPM and the best cluster's median is
//    the candidate.
// 2. Fit: the constant grid that lines up best with the low-passed SpecFlux
//    pass's precise beat times: a tempo search within ±2 % of the candidate,
//    then a least-squares line through the beats within a quarter beat. That
//    grid is refined on the onset envelope: aubio spaces its beats by its own,
//    slightly fast period, so their phase drifts by a varying amount, while
//    the envelope sits at a steady offset from the kicks. Their phase can be
//    on any 16th of the beat, so the search also starts a quarter, a half and
//    three quarters of a beat on, and keeps the result on the kicks. Without
//    such beats, it starts from the candidate's period alone.
// 3. Snap: a tempo within SNAP_BPM of a whole number becomes it, and the phase
//    is refitted on the envelope.
// 4. First beat: the grid beat nearest the first strong low-band onset.
// 5. Confidence: the share of grid beats inside music sections with a kick
//    within 20 ms: the envelope's strongest onset nearby is that close, and
//    the low band jumps there more than at the beat's other 16ths.
//
// No tempo found gives None, never a BPM of 0.

use bliss_audio_aubio_rs::{OnsetMode, Tempo};
use std::f64::consts::PI;
use std::path::Path;

use super::decoder::{decode_to_mono, MonoAudio};
use super::onset::OnsetEnvelope;

/// Result of BPM detection for a single track
#[derive(Debug, Clone)]
pub struct BpmResult {
    /// Detected BPM (beats per minute)
    pub bpm: f64,
    /// Confidence score (0.0 to 1.0) — higher means more reliable detection
    pub confidence: f64,
    /// A grid beat that starts a bar, in ms from the file's start (spec
    /// 2026-10-17, §2): the one nearest the first strong low-band onset. None
    /// when the low band never has a strong onset.
    pub first_beat_ms: Option<f64>,
}

/// Standard buffer size for onset/tempo detection.
/// 1024 samples is a good balance between time and frequency resolution.
const BUF_SIZE: usize = 1024;

/// Hop size — how many samples to advance between frames.
/// 512 samples = 50% overlap, which gives good temporal resolution for beat tracking.
const HOP_SIZE: usize = 512;

/// DJ-range lower bound for octave folding.
/// Virtually all dance music falls in 70–160 BPM.
const DJ_RANGE_LOW: f64 = 70.0;

/// DJ-range upper bound for octave folding.
const DJ_RANGE_HIGH: f64 = 160.0;

/// Minimum number of beats needed to compute a reliable IBI-based BPM.
/// With fewer beats, the median IBI is unreliable.
const MIN_BEATS_FOR_IBI: usize = 8;

/// Maximum BPM deviation (in BPM) for two candidates to be considered "agreeing".
/// Tight tolerance for electronic music which has machine-stable tempo.
const CONSENSUS_TOLERANCE: f64 = 1.5;

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

/// Detect the BPM (tempo) of an audio file.
pub fn detect_bpm(path: &Path) -> Result<Option<BpmResult>, String> {
    let audio = decode_to_mono(path)?;
    detect_bpm_from_samples(&audio)
}

/// Apply a simple 1st-order low-pass filter (RC filter) at the given cutoff frequency.
///
/// For BPM detection, a cutoff of ~500Hz preserves kick drums and bass while removing
/// hi-hat and cymbal energy that causes false onset triggers and BPM overestimation.
fn low_pass_filter(samples: &[f32], sample_rate: u32, cutoff_hz: f64) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }

    let rc = 1.0 / (2.0 * PI * cutoff_hz);
    let dt = 1.0 / sample_rate as f64;
    let alpha = dt / (rc + dt);

    let mut filtered = Vec::with_capacity(samples.len());
    let mut prev = samples[0] as f64;
    filtered.push(samples[0]);

    for &sample in &samples[1..] {
        prev = prev + alpha * (sample as f64 - prev);
        filtered.push(prev as f32);
    }

    filtered
}

/// Detect BPM and beat grid from decoded audio (spec 2026-10-17, §2). Ok(None)
/// when no tempo is found; never a BPM of 0.
pub fn detect_bpm_from_samples(audio: &MonoAudio) -> Result<Option<BpmResult>, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }
    let envelope = OnsetEnvelope::compute(audio);
    let Some(grid) = beat_grid(audio, &envelope) else { return Ok(None) };
    Ok(Some(BpmResult {
        bpm: grid.bpm(),
        confidence: grid_confidence(grid, &envelope),
        first_beat_ms: first_beat_ms(grid, &envelope),
    }))
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

/// aubio's silence threshold (`aubio_silence_detection`, default -90 dB).
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

/// Whether aubio would call this hop silent: its mean square, in dB, below -90.
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

/// Compute BPM from inter-beat intervals (IBIs).
///
/// This is more robust than aubio's get_bpm() because:
/// - We discard outlier intervals (beats that are too close or too far apart)
/// - We use the median IBI rather than an autocorrelation estimate
/// - The median is resistant to occasional false/missed detections
fn compute_bpm_from_ibis(beat_positions: &[f64]) -> (f64, f64) {
    if beat_positions.len() < MIN_BEATS_FOR_IBI {
        return (0.0, 0.0);
    }

    // Compute inter-beat intervals
    let mut ibis: Vec<f64> = beat_positions
        .windows(2)
        .map(|w| w[1] - w[0])
        .filter(|&ibi| ibi > 0.1 && ibi < 2.0) // Filter: 30–600 BPM equivalent
        .collect();

    if ibis.len() < MIN_BEATS_FOR_IBI / 2 {
        return (0.0, 0.0);
    }

    // Sort for median computation and outlier filtering
    ibis.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // Remove outliers: discard bottom and top 15% of IBIs
    let trim_count = ibis.len() * 15 / 100;
    let trimmed = if trim_count > 0 && ibis.len() > trim_count * 2 + 4 {
        &ibis[trim_count..ibis.len() - trim_count]
    } else {
        &ibis
    };

    if trimmed.is_empty() {
        return (0.0, 0.0);
    }

    // Median IBI
    let median_ibi = trimmed[trimmed.len() / 2];

    // BPM from median IBI
    let bpm = 60.0 / median_ibi;

    // Confidence: based on consistency of IBIs (low variance = high confidence)
    let mean_ibi: f64 = trimmed.iter().sum::<f64>() / trimmed.len() as f64;
    let variance: f64 =
        trimmed.iter().map(|&x| (x - mean_ibi).powi(2)).sum::<f64>() / trimmed.len() as f64;
    let std_dev = variance.sqrt();
    let cv = std_dev / mean_ibi; // coefficient of variation

    // CV < 0.05 → very consistent beats → high confidence
    // CV > 0.30 → inconsistent → low confidence
    let consistency_score = (1.0 - cv * 4.0).clamp(0.0, 1.0);

    // Also factor in number of beats (more beats = more reliable)
    let count_score = (trimmed.len() as f64 / 50.0).clamp(0.0, 1.0);

    let confidence = (consistency_score * 0.7 + count_score * 0.3).clamp(0.0, 1.0);

    (bpm, confidence)
}

/// Fold a BPM value into the DJ range (70–160 BPM) by octave halving/doubling.
///
/// This handles the most common BPM detection errors:
/// - Half-time detection (e.g., 63 → 126)
/// - Double-time detection (e.g., 254 → 127)
/// - Triple-time detection (e.g., 381 → 127 via two halvings... 381→190→95... close)
fn fold_to_dj_range(bpm: f64) -> f64 {
    if bpm <= 0.0 {
        return 0.0;
    }
    let mut b = bpm;
    while b > DJ_RANGE_HIGH {
        b /= 2.0;
    }
    while b < DJ_RANGE_LOW {
        b *= 2.0;
    }
    b
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_signals::{kick_track, offbeat_bass, offbeat_hats, rolling_bass, sixteenth_hats, tempo_change, white_noise};
    use std::f32::consts::PI;

    fn low_passed(audio: &MonoAudio) -> MonoAudio {
        MonoAudio { samples: low_pass_filter(&audio.samples, audio.sample_rate, 500.0), ..audio.clone() }
    }

    #[test]
    fn silence_is_below_minus_90_db() {
        assert!(is_silent(&[0.0; 512]));
        assert!(is_silent(&[1e-5; 512])); // -100 dB
        assert!(!is_silent(&[1e-4; 512])); // -80 dB
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

    #[test]
    fn a_tempo_change_lowers_the_confidence() {
        let steady = detect_bpm_from_samples(&kick_track(123.0, 44100, 60.0, 0.137)).unwrap().expect("a tempo");
        let changing = detect_bpm_from_samples(&tempo_change(120.0, 126.0, 44100, 30.0)).unwrap().expect("a tempo");
        assert!(steady.confidence >= 0.9, "steady {:.2}", steady.confidence);
        assert!(changing.confidence < steady.confidence, "changing {:.2}, steady {:.2}", changing.confidence, steady.confidence);
    }

    /// Generate a synthetic click track at a known BPM for testing, with a
    /// quiet noise floor (about -60 dB) from the first click on, as real music
    /// never goes digitally silent between hits.
    fn generate_click_track(bpm: f64, sample_rate: u32, duration_seconds: f64) -> MonoAudio {
        let total_samples = (sample_rate as f64 * duration_seconds) as usize;
        let mut samples = vec![0.0f32; total_samples];

        let samples_per_beat = (60.0 / bpm) * sample_rate as f64;
        let click_duration = (sample_rate as f64 * 0.005) as usize; // 5ms click

        let mut position = 0.0f64;
        while (position as usize) < total_samples {
            let start = position as usize;
            for j in 0..click_duration {
                let idx = start + j;
                if idx < total_samples {
                    let t = j as f32 / sample_rate as f32;
                    samples[idx] = (2.0 * PI * 1000.0 * t).sin() * (-t * 500.0).exp();
                }
            }
            position += samples_per_beat;
        }

        // Deterministic noise (a constant-seeded LCG), uniform in +-0.002; the first click is at 0.
        let mut state: u32 = 0x1234_5678;
        for sample in &mut samples {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            *sample += ((state >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0) * 0.002;
        }

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    #[test]
    fn test_bpm_detection_120bpm() {
        let audio = generate_click_track(120.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");

        assert!(
            (result.bpm - 120.0).abs() < 3.0,
            "Expected BPM ~120, got {:.1}",
            result.bpm
        );
        assert!(result.confidence > 0.0, "Confidence should be positive");
    }

    #[test]
    fn test_bpm_detection_128bpm() {
        let audio = generate_click_track(128.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");

        assert!(
            (result.bpm - 128.0).abs() < 3.0,
            "Expected BPM ~128, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_detection_140bpm() {
        let audio = generate_click_track(140.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");

        assert!(
            (result.bpm - 140.0).abs() < 3.0,
            "Expected BPM ~140, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_detection_empty_audio() {
        let audio = MonoAudio {
            samples: Vec::new(),
            sample_rate: 44100,
            duration_ms: 0,
        };
        let result = detect_bpm_from_samples(&audio);
        assert!(result.is_err(), "Empty audio should return an error");
    }

    #[test]
    fn test_bpm_detection_silence() {
        let audio = MonoAudio {
            samples: vec![0.0; 44100 * 30],
            sample_rate: 44100,
            duration_ms: 30000,
        };
        assert!(detect_bpm_from_samples(&audio).unwrap().is_none());
    }

    #[test]
    fn test_bpm_detection_short_audio() {
        let audio = generate_click_track(126.0, 44100, 2.0);
        let result = detect_bpm_from_samples(&audio);
        assert!(result.is_ok(), "Should handle short audio without crashing");
    }

    #[test]
    fn test_bpm_detection_different_sample_rate() {
        let audio = generate_click_track(125.0, 48000, 30.0);
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");

        assert!(
            (result.bpm - 125.0).abs() < 3.0,
            "Expected BPM ~125, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_result_fields() {
        let audio = generate_click_track(126.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).unwrap().expect("a tempo");

        assert!(
            result.confidence >= 0.0 && result.confidence <= 1.0,
            "Confidence should be in [0, 1], got {:.2}",
            result.confidence
        );
        assert!(
            result.bpm >= 40.0 && result.bpm <= 300.0,
            "BPM should be in [40, 300], got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_fold_to_dj_range() {
        // Double-time: 254 → 127
        assert!((fold_to_dj_range(254.0) - 127.0).abs() < 0.1);
        // Half-time: 63 → 126
        assert!((fold_to_dj_range(63.0) - 126.0).abs() < 0.1);
        // Already in range: 128 stays 128
        assert!((fold_to_dj_range(128.0) - 128.0).abs() < 0.1);
        // High value: 199.6 → 99.8
        assert!((fold_to_dj_range(199.6) - 99.8).abs() < 0.1);
        // Zero stays zero
        assert_eq!(fold_to_dj_range(0.0), 0.0);
    }

    #[test]
    fn test_compute_bpm_from_ibis() {
        // Simulate perfect 120 BPM beats (0.5s intervals)
        let beats: Vec<f64> = (0..60).map(|i| i as f64 * 0.5).collect();
        let (bpm, conf) = compute_bpm_from_ibis(&beats);
        assert!(
            (bpm - 120.0).abs() < 0.1,
            "Expected 120 BPM from IBIs, got {:.2}",
            bpm
        );
        assert!(conf > 0.5, "Consistent IBIs should give high confidence");
    }

    #[test]
    fn test_compute_bpm_from_ibis_with_outliers() {
        // 120 BPM beats with some outliers (missed/extra beats)
        let mut beats: Vec<f64> = (0..50).map(|i| i as f64 * 0.5).collect();
        // Add a few outlier beats at wrong positions
        beats.push(0.25); // extra beat
        beats.push(12.75); // extra beat
        beats.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let (bpm, _conf) = compute_bpm_from_ibis(&beats);
        // Should still be close to 120 despite outliers
        assert!(
            (bpm - 120.0).abs() < 5.0,
            "Expected ~120 BPM despite outliers, got {:.2}",
            bpm
        );
    }

    #[test]
    fn test_compute_bpm_from_ibis_too_few_beats() {
        let beats: Vec<f64> = vec![0.0, 0.5, 1.0]; // Only 3 beats
        let (bpm, _) = compute_bpm_from_ibis(&beats);
        assert_eq!(bpm, 0.0, "Too few beats should return 0");
    }
}
