// Musical key detection using Chromagram + multi-profile matching with segment voting.
//
// Improvements over basic chromagram approach:
// 1. Tuning estimation: detects if A≠440Hz and adjusts pitch-class mapping
// 2. Harmonic Product Spectrum (HPS) weighting: accounts for harmonics of each
//    fundamental frequency, giving a cleaner pitch-class distribution
// 3. 3-way independent voting: Shaath + EDMA + Krumhansl profiles vote independently,
//    majority rule (2+ agree) determines winner, with minor key bias and dominant
//    confusion correction for ambiguous detections
// 4. Spectral whitening to remove bass-heavy bias
// 5. Frequency weighting to reduce sub-bass influence (kick drums in EDM)
// 6. Segment-based voting: divides track into overlapping segments, detects key
//    per segment, and takes the majority vote — eliminates tritone errors caused
//    by individual sections with ambiguous harmonic content
//
// Algorithm overview:
// 1. Decode audio file to mono f32 PCM (reuses existing decoder)
// 2. Estimate tuning offset from A=440Hz (±50 cents)
// 3. Skip 15% intro + 15% outro
// 4. If track is long enough (>= 3 segments): segment-based voting
//    a. Divide into 30-second overlapping segments (50% overlap)
//    b. Compute chromagram per segment
//    c. Match key profiles per segment
//    d. Take majority vote across all segments
// 5. Otherwise: single chromagram for the whole analysis region
// 6. Return the best matching key in Camelot/Open Key/musical notation
//
// References:
// - Krumhansl, C.L. (1990). Cognitive Foundations of Musical Pitch.
// - Shaath, I. (2011). Estimation of key in digital music recordings (MSc thesis).
// - Mauch, M. & Dixon, S. (2010). Approximate Note Transcription (harmonic analysis).
// - Essentia Key algorithm: EDMA profiles from MTG, UPF Barcelona.

use rustfft::{num_complex::Complex, FftPlanner};
use std::f64::consts::PI;
use std::path::Path;

use super::decoder::{decode_to_mono, MonoAudio};

/// Result of key detection for a single track
#[derive(Debug, Clone)]
pub struct KeyResult {
    /// Detected key in Camelot notation (e.g., "8A", "11B")
    pub camelot: String,
    /// Detected key in Open Key notation (e.g., "8m", "11d")
    pub open_key: String,
    /// Detected key in standard musical notation (e.g., "Am", "C")
    pub musical_key: String,
    /// Confidence score (0.0 to 1.0) — higher means more reliable detection
    pub confidence: f64,
}

/// FFT window size for chromagram computation.
/// 8192 samples gives ~5.4Hz resolution at 44100Hz — better separation of
/// adjacent semitones in the lower octaves (e.g., C2=65Hz vs C#2=69Hz).
const FFT_SIZE: usize = 8192;

/// Hop size between consecutive FFT frames.
/// 4096 = 50% overlap for good temporal coverage without excessive computation.
const HOP_SIZE: usize = 4096;

/// Number of bins for spectral whitening moving average.
/// 40 bins ≈ 215Hz at 44100/8192 — wide enough to flatten bass bias in EDM.
const WHITENING_WINDOW: usize = 40;

/// Minimum frequency to consider for chromagram (Hz). ~C2 = 65Hz.
const MIN_FREQ: f64 = 65.0;

/// Maximum frequency to consider for chromagram (Hz).
/// Above ~2000Hz, harmonics dominate over fundamentals.
const MAX_FREQ: f64 = 2000.0;

/// Number of harmonics to consider in Harmonic Product Spectrum weighting.
/// 1 = fundamental only, 3 = fundamental + 2 harmonics.
const NUM_HARMONICS: usize = 3;

/// Harmonic weights: how much each harmonic contributes.
/// Fundamental=1.0, 2nd harmonic=0.5, 3rd harmonic=0.25
const HARMONIC_WEIGHTS: [f64; NUM_HARMONICS] = [1.0, 0.5, 0.25];

/// Tuning estimation: number of cents to search around A=440Hz.
/// ±50 cents = ±half a semitone (covers virtually all tuning variations).
const TUNING_SEARCH_CENTS: i32 = 50;

/// Tuning estimation: step size in cents for the search grid.
const TUNING_STEP_CENTS: i32 = 5;

/// Duration of each segment for segment-based voting (seconds).
const SEGMENT_DURATION: f64 = 30.0;

/// Overlap fraction between adjacent segments (0.5 = 50% overlap).
const SEGMENT_OVERLAP: f64 = 0.5;

/// Minimum number of segments needed to use voting instead of single chromagram.
const MIN_SEGMENTS_FOR_VOTING: usize = 3;

/// Shaath's custom key profiles (from libKeyFinder MSc thesis, 2011)
/// Empirically derived — better for popular/electronic music than Krumhansl-Schmuckler.
const SHAATH_MAJOR: [f64; 12] = [
    6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.2,
];

const SHAATH_MINOR: [f64; 12] = [
    6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 4.7, 4.0, 2.7, 3.4, 3.2,
];

/// EDMA key profiles (auto-extracted from Electronic Dance Music corpus)
/// From Essentia library (Music Technology Group, UPF Barcelona).
/// Optimized for EDM/electronic genres — typically outperforms Shaath on electronic music.
const EDMA_MAJOR: [f64; 12] = [
    1.00, 0.29, 0.50, 0.40, 0.60, 0.56, 0.32, 0.80, 0.31, 0.45, 0.42, 0.39,
];

const EDMA_MINOR: [f64; 12] = [
    1.00, 0.31, 0.44, 0.58, 0.33, 0.49, 0.29, 0.78, 0.43, 0.29, 0.53, 0.32,
];

/// Krumhansl-Schmuckler key profiles (from Cognitive Foundations of Musical Pitch, 1990)
/// Derived from listener ratings — have a stronger tonic bias than Shaath/EDMA, which
/// helps counteract dominant confusion in key detection.
const KRUMHANSL_MAJOR: [f64; 12] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];

const KRUMHANSL_MINOR: [f64; 12] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/// Musical key names for major keys (indexed by pitch class: 0=C, 1=C#/Db, ..., 11=B)
const MAJOR_NAMES: [&str; 12] = [
    "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

/// Musical key names for minor keys
const MINOR_NAMES: [&str; 12] = [
    "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm",
];

/// Camelot wheel notation for major keys (indexed by pitch class: 0=C, ..., 11=B)
const CAMELOT_MAJOR: [&str; 12] = [
    "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
];

/// Camelot wheel notation for minor keys (indexed by pitch class)
const CAMELOT_MINOR: [&str; 12] = [
    "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A",
];

/// Open Key notation for major keys (indexed by pitch class: 0=C, ..., 11=B)
const OPENKEY_MAJOR: [&str; 12] = [
    "8d", "3d", "10d", "5d", "12d", "7d", "2d", "9d", "4d", "11d", "6d", "1d",
];

/// Open Key notation for minor keys (indexed by pitch class)
const OPENKEY_MINOR: [&str; 12] = [
    "5m", "12m", "7m", "2m", "9m", "4m", "11m", "6m", "1m", "8m", "3m", "10m",
];

/// Detect the musical key of an audio file.
pub fn detect_key(path: &Path) -> Result<KeyResult, String> {
    let audio = decode_to_mono(path)?;
    detect_key_from_samples(&audio)
}

/// Detect key from pre-decoded mono audio samples.
///
/// For tracks longer than ~90 seconds of usable audio, uses segment-based voting:
/// divides the track into overlapping 30-second windows, detects the key independently
/// for each window, and takes the majority vote. This dramatically reduces tritone
/// errors and other misdetections caused by individual sections with ambiguous harmony.
pub fn detect_key_from_samples(audio: &MonoAudio) -> Result<KeyResult, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }

    if audio.samples.len() < FFT_SIZE {
        return Err(format!(
            "Audio too short for key detection: {} samples (need at least {})",
            audio.samples.len(),
            FFT_SIZE
        ));
    }

    // Step 1: Estimate tuning offset from A=440Hz
    let tuning_offset_cents = estimate_tuning(&audio.samples, audio.sample_rate);

    // Step 2: Determine analysis region (skip 15% intro + 15% outro)
    let total_len = audio.samples.len();
    let skip = total_len * 15 / 100;
    let analysis_samples = if total_len > FFT_SIZE * 3 {
        &audio.samples[skip..total_len - skip]
    } else {
        &audio.samples[..]
    };

    // Step 3: Decide between segment-based voting and single chromagram
    let segment_samples = (SEGMENT_DURATION * audio.sample_rate as f64) as usize;
    let segment_hop = (segment_samples as f64 * (1.0 - SEGMENT_OVERLAP)) as usize;

    let num_segments = if analysis_samples.len() >= segment_samples {
        (analysis_samples.len() - segment_samples) / segment_hop + 1
    } else {
        0
    };

    let (best_key_index, best_is_minor, best_corr, second_best_corr, vote_fraction) =
        if num_segments >= MIN_SEGMENTS_FOR_VOTING {
            segment_voted_key(
                analysis_samples,
                audio.sample_rate,
                tuning_offset_cents,
                segment_samples,
                segment_hop,
            )
        } else {
            let chromagram =
                compute_chromagram(analysis_samples, audio.sample_rate, tuning_offset_cents)?;
            let (k, m, c1, c2) = match_key_profiles(&chromagram);
            (k, m, c1, c2, 1.0) // single pass = 100% "agreement"
        };

    // Step 4: Convert to Camelot, Open Key, and musical notation
    let camelot = if best_is_minor {
        CAMELOT_MINOR[best_key_index].to_string()
    } else {
        CAMELOT_MAJOR[best_key_index].to_string()
    };

    let open_key = if best_is_minor {
        OPENKEY_MINOR[best_key_index].to_string()
    } else {
        OPENKEY_MAJOR[best_key_index].to_string()
    };

    let musical_key = if best_is_minor {
        MINOR_NAMES[best_key_index].to_string()
    } else {
        MAJOR_NAMES[best_key_index].to_string()
    };

    // Step 5: Compute confidence — incorporates correlation gap AND vote agreement
    let confidence = if best_corr > 0.0 {
        let gap = best_corr - second_best_corr;
        let gap_score = (gap * 8.0).clamp(0.0, 1.0);
        let strength = best_corr.clamp(0.0, 1.0);
        let base = gap_score * 0.7 + strength * 0.3;
        // Vote agreement: scale confidence by how many segments agreed
        let agreement_factor = 0.5 + 0.5 * vote_fraction;
        (base * agreement_factor).clamp(0.0, 1.0)
    } else {
        0.0
    };

    Ok(KeyResult {
        camelot,
        open_key,
        musical_key,
        confidence,
    })
}

/// Segment-based key detection with majority voting.
///
/// Divides audio into overlapping segments, detects key per segment, then picks
/// the key that wins the most votes (tie-broken by total correlation strength).
///
/// Returns (pitch_class, is_minor, avg_best_corr, avg_second_corr, vote_fraction)
fn segment_voted_key(
    samples: &[f32],
    sample_rate: u32,
    tuning_offset_cents: f64,
    segment_size: usize,
    segment_hop: usize,
) -> (usize, bool, f64, f64, f64) {
    // Each of 24 keys is encoded as root*2 + (1 if minor, 0 if major)
    let mut votes: [(usize, f64); 24] = [(0, 0.0); 24]; // (count, total_correlation)

    let mut offset = 0;
    while offset + segment_size <= samples.len() {
        let segment = &samples[offset..offset + segment_size];
        if let Ok(chromagram) = compute_chromagram(segment, sample_rate, tuning_offset_cents) {
            let (key, is_minor, corr, _) = match_key_profiles(&chromagram);
            let index = key * 2 + if is_minor { 1 } else { 0 };
            votes[index].0 += 1;
            votes[index].1 += corr;
        }
        offset += segment_hop;
    }

    // Find best key by vote count, tie-break by total correlation
    let mut best_idx = 0;
    for i in 1..24 {
        if votes[i].0 > votes[best_idx].0
            || (votes[i].0 == votes[best_idx].0 && votes[i].1 > votes[best_idx].1)
        {
            best_idx = i;
        }
    }

    let best_key = best_idx / 2;
    let best_is_minor = best_idx % 2 == 1;
    let best_votes = votes[best_idx].0;
    let avg_corr = if best_votes > 0 {
        votes[best_idx].1 / best_votes as f64
    } else {
        0.0
    };

    // Total segments that produced a valid result
    let total_segments: usize = votes.iter().map(|v| v.0).sum();
    let vote_fraction = if total_segments > 0 {
        best_votes as f64 / total_segments as f64
    } else {
        0.0
    };

    // Find second-best key
    let mut second_idx = if best_idx == 0 { 1 } else { 0 };
    for i in 0..24 {
        if i == best_idx {
            continue;
        }
        if votes[i].0 > votes[second_idx].0
            || (votes[i].0 == votes[second_idx].0 && votes[i].1 > votes[second_idx].1)
        {
            second_idx = i;
        }
    }
    let second_votes = votes[second_idx].0;
    let second_corr = if second_votes > 0 {
        votes[second_idx].1 / second_votes as f64
    } else {
        0.0
    };

    (best_key, best_is_minor, avg_corr, second_corr, vote_fraction)
}

/// Estimate the tuning offset from A=440Hz in cents.
///
/// Many tracks are not tuned to exactly A=440Hz. Even a ±10 cent offset
/// can shift the chromagram enough to produce incorrect key detection.
///
/// Method: compute a high-resolution pitch histogram around each semitone
/// and find the offset that maximizes the total energy aligned to semitone bins.
///
/// Returns offset in cents (e.g., -8.0 means tuned ~8 cents flat of A=440).
fn estimate_tuning(samples: &[f32], sample_rate: u32) -> f64 {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let half_fft = FFT_SIZE / 2 + 1;

    // Hanning window
    let window: Vec<f64> = (0..FFT_SIZE)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (FFT_SIZE - 1) as f64).cos()))
        .collect();

    // Analyze a portion of the track (middle section, up to 30 seconds)
    let total_len = samples.len();
    let max_samples = (30.0 * sample_rate as f64) as usize;
    let analysis_len = total_len.min(max_samples);
    let start_offset = if total_len > analysis_len {
        (total_len - analysis_len) / 2
    } else {
        0
    };
    let analysis_samples = &samples[start_offset..start_offset + analysis_len];

    // Accumulate magnitude spectrum across frames
    let mut avg_magnitudes = vec![0.0f64; half_fft];
    let num_frames = analysis_samples.len().saturating_sub(FFT_SIZE) / HOP_SIZE + 1;

    for frame_idx in 0..num_frames.min(100) {
        // Cap at 100 frames for speed
        let start = frame_idx * HOP_SIZE;
        let end = start + FFT_SIZE;
        if end > analysis_samples.len() {
            break;
        }

        let mut buffer: Vec<Complex<f64>> = analysis_samples[start..end]
            .iter()
            .enumerate()
            .map(|(i, &s)| Complex::new(s as f64 * window[i], 0.0))
            .collect();

        fft.process(&mut buffer);

        for (bin, mag) in avg_magnitudes.iter_mut().enumerate().take(half_fft) {
            *mag += buffer[bin].norm();
        }
    }

    // Try different tuning offsets and find the one that gives the sharpest
    // alignment between spectral peaks and semitone frequencies
    let mut best_offset = 0.0f64;
    let mut best_score = f64::NEG_INFINITY;

    let mut offset_cents = -TUNING_SEARCH_CENTS;
    while offset_cents <= TUNING_SEARCH_CENTS {
        let ref_a = 440.0 * 2.0f64.powf(offset_cents as f64 / 1200.0);
        let mut score = 0.0;

        // For each semitone in the analysis range, check how much energy
        // is concentrated right on the semitone frequency vs spread around it
        for semitone in -33..=30 {
            // ~C2 to ~B5
            let freq = ref_a * 2.0f64.powf(semitone as f64 / 12.0);
            if freq < MIN_FREQ || freq > MAX_FREQ {
                continue;
            }

            let bin = (freq * FFT_SIZE as f64 / sample_rate as f64).round() as usize;
            if bin >= half_fft {
                continue;
            }

            // Energy at the exact bin (and immediate neighbors for tolerance)
            let lo = bin.saturating_sub(1);
            let hi = (bin + 2).min(half_fft);
            let energy: f64 = avg_magnitudes[lo..hi].iter().sum();
            score += energy;
        }

        if score > best_score {
            best_score = score;
            best_offset = offset_cents as f64;
        }

        offset_cents += TUNING_STEP_CENTS;
    }

    best_offset
}

/// Frequency-dependent weight to reduce sub-bass influence on the chromagram.
///
/// In electronic music, kick drums dominate the 50-130 Hz range, but bass lines
/// (60-130 Hz) also carry key harmonic information in deep/tech house. This weighting
/// balances kick drum attenuation against bass line preservation, while giving full
/// weight to melodic/harmonic content above 250 Hz.
#[inline]
fn freq_weight(freq: f64) -> f64 {
    if freq < 130.0 {
        // Sub-bass (65-130 Hz): moderate reduction — bass lines carry harmonic info
        0.4
    } else if freq < 250.0 {
        // Low-mid (130-250 Hz): slight reduction — useful harmonic content
        0.7
    } else {
        // Mid and above (250-2000 Hz): full weight — melodies, chords, harmonics
        1.0
    }
}

/// Compute a chromagram (12-dimensional pitch class energy distribution) from audio samples.
///
/// Analyzes the given sample buffer directly (no intro/outro skipping — caller handles that).
///
/// Enhanced with:
/// - Tuning correction (adjusts reference frequency based on estimated offset)
/// - Harmonic Product Spectrum weighting (reinforces fundamentals over harmonics)
/// - Spectral whitening (removes tonal bias from bass-heavy music)
/// - Frequency weighting (reduces sub-bass kick drum influence)
fn compute_chromagram(
    samples: &[f32],
    sample_rate: u32,
    tuning_offset_cents: f64,
) -> Result<[f64; 12], String> {
    // Tuning-corrected reference frequency for A
    let ref_a = 440.0 * 2.0f64.powf(tuning_offset_cents / 1200.0);

    let mut chromagram = [0.0f64; 12];
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let half_fft = FFT_SIZE / 2 + 1;

    // Precompute Hanning window coefficients
    let window: Vec<f64> = (0..FFT_SIZE)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (FFT_SIZE - 1) as f64).cos()))
        .collect();

    // Precompute frequency-to-pitch-class mapping with tuning correction and frequency weight.
    let bin_info: Vec<Option<(usize, f64)>> = (0..half_fft)
        .map(|bin| {
            let freq = bin as f64 * sample_rate as f64 / FFT_SIZE as f64;
            if !(MIN_FREQ..=MAX_FREQ).contains(&freq) {
                None
            } else {
                // Use tuning-corrected reference instead of fixed 440Hz
                let semitones_from_a = 12.0 * (freq / ref_a).log2();
                let pitch_class = ((semitones_from_a.round() as i32 + 9) % 12 + 12) % 12;
                Some((pitch_class as usize, freq_weight(freq)))
            }
        })
        .collect();

    // Process audio in overlapping frames
    let num_frames = (samples.len().saturating_sub(FFT_SIZE)) / HOP_SIZE + 1;

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_SIZE;
        let end = start + FFT_SIZE;
        if end > samples.len() {
            break;
        }

        // Apply Hanning window and convert to complex values for FFT
        let mut buffer: Vec<Complex<f64>> = samples[start..end]
            .iter()
            .enumerate()
            .map(|(i, &s)| Complex::new(s as f64 * window[i], 0.0))
            .collect();

        fft.process(&mut buffer);

        // Extract magnitudes for the positive frequency half
        let magnitudes: Vec<f64> = (0..half_fft).map(|bin| buffer[bin].norm()).collect();

        // Spectral whitening: divide each bin by the local average magnitude
        let half_w = WHITENING_WINDOW / 2;

        // HPS-weighted chromagram accumulation
        for (bin, info) in bin_info.iter().enumerate() {
            if let Some((pc, weight)) = info {
                // Spectral whitening for the fundamental
                let lo = bin.saturating_sub(half_w);
                let hi = (bin + half_w + 1).min(half_fft);
                let local_avg: f64 = magnitudes[lo..hi].iter().sum::<f64>() / (hi - lo) as f64;
                let whitened = if local_avg > 1e-12 {
                    magnitudes[bin] / local_avg
                } else {
                    0.0
                };

                // Fundamental contribution with frequency weight
                let mut weighted_energy = whitened * HARMONIC_WEIGHTS[0] * weight;

                // Harmonic contributions: check if harmonics at 2x, 3x, etc.
                // also map to the same pitch class (reinforces the fundamental)
                for h in 1..NUM_HARMONICS {
                    let harmonic_bin = bin * (h + 1);
                    if harmonic_bin < half_fft {
                        let h_freq =
                            harmonic_bin as f64 * sample_rate as f64 / FFT_SIZE as f64;
                        if h_freq <= MAX_FREQ * (NUM_HARMONICS as f64) {
                            // Whiten the harmonic bin too
                            let h_lo = harmonic_bin.saturating_sub(half_w);
                            let h_hi = (harmonic_bin + half_w + 1).min(half_fft);
                            let h_avg: f64 = magnitudes[h_lo..h_hi].iter().sum::<f64>()
                                / (h_hi - h_lo) as f64;
                            let h_whitened = if h_avg > 1e-12 {
                                magnitudes[harmonic_bin] / h_avg
                            } else {
                                0.0
                            };
                            // Harmonics also get frequency weight of the fundamental
                            weighted_energy += h_whitened * HARMONIC_WEIGHTS[h] * weight;
                        }
                    }
                }

                chromagram[*pc] += weighted_energy;
            }
        }
    }

    // Normalize chromagram to sum to 1.0
    let total: f64 = chromagram.iter().sum();
    if total > 0.0 {
        for val in chromagram.iter_mut() {
            *val /= total;
        }
    }

    Ok(chromagram)
}

/// Match the computed chromagram against all 24 key profiles using 3-way independent voting.
///
/// Three profile sets (Shaath, EDMA, Krumhansl) each independently select their top-1 key.
/// Majority vote (2+ agree) determines the winner. If all three disagree, the profile with
/// the highest absolute correlation wins. Post-processing applies:
/// 1. Minor key bias for ambiguous major/minor detections (electronic music is ~70% minor)
/// 2. Dominant confusion penalty — if the detected key might be the dominant (V) of the
///    true tonic, prefer the tonic when correlations are close
///
/// Returns (pitch_class_index, is_minor, best_correlation, second_best_correlation)
fn match_key_profiles(chromagram: &[f64; 12]) -> (usize, bool, f64, f64) {
    let profile_sets: [(&[f64; 12], &[f64; 12]); 3] = [
        (&SHAATH_MAJOR, &SHAATH_MINOR),
        (&EDMA_MAJOR, &EDMA_MINOR),
        (&KRUMHANSL_MAJOR, &KRUMHANSL_MINOR),
    ];

    // Each profile set independently selects its best key
    // Stores: (key, is_minor, best_corr, second_corr)
    let mut profile_winners: [(usize, bool, f64, f64); 3] =
        [(0, false, f64::NEG_INFINITY, f64::NEG_INFINITY); 3];

    for (p_idx, (major_p, minor_p)) in profile_sets.iter().enumerate() {
        let mut best_corr = f64::NEG_INFINITY;
        let mut second_corr = f64::NEG_INFINITY;
        let mut best_key = 0;
        let mut best_is_minor = false;

        for root in 0..12 {
            for is_minor in [false, true] {
                let profile = if is_minor { minor_p } else { major_p };
                let corr = pearson_correlation(chromagram, profile, root);

                if corr > best_corr {
                    second_corr = best_corr;
                    best_corr = corr;
                    best_key = root;
                    best_is_minor = is_minor;
                } else if corr > second_corr {
                    second_corr = corr;
                }
            }
        }

        profile_winners[p_idx] = (best_key, best_is_minor, best_corr, second_corr);
    }

    // 3-way majority vote: check if any key got 2+ votes
    let (mut best_key, mut best_is_minor, mut best_corr, second_best_corr) = {
        let mut found_majority = None;

        // Check each pair for agreement
        for i in 0..3 {
            for j in (i + 1)..3 {
                if profile_winners[i].0 == profile_winners[j].0
                    && profile_winners[i].1 == profile_winners[j].1
                {
                    // Found at least 2 agreeing — use this key
                    let key = profile_winners[i].0;
                    let is_minor = profile_winners[i].1;

                    // Average correlations from all agreeing profiles
                    let mut corr_sum = 0.0;
                    let mut second_sum = 0.0;
                    let mut count = 0.0;
                    for w in &profile_winners {
                        if w.0 == key && w.1 == is_minor {
                            corr_sum += w.2;
                            second_sum += w.3;
                            count += 1.0;
                        }
                    }

                    let avg_corr = corr_sum / count;
                    let avg_second = second_sum / count;

                    // Prefer majority with more voters (3 > 2)
                    if let Some((_, _, _, _, prev_count)) = found_majority {
                        if count > prev_count {
                            found_majority = Some((key, is_minor, avg_corr, avg_second, count));
                        }
                    } else {
                        found_majority = Some((key, is_minor, avg_corr, avg_second, count));
                    }
                }
            }
        }

        if let Some((key, is_minor, corr, second, _)) = found_majority {
            (key, is_minor, corr, second)
        } else {
            // All three disagree → use whichever profile had the highest absolute correlation
            let winner = profile_winners
                .iter()
                .enumerate()
                .max_by(|a, b| a.1 .2.abs().partial_cmp(&b.1 .2.abs()).unwrap())
                .map(|(idx, _)| idx)
                .unwrap_or(0);
            (
                profile_winners[winner].0,
                profile_winners[winner].1,
                profile_winners[winner].2,
                profile_winners[winner].3,
            )
        }
    };

    // Minor key bias: electronic music is ~70% minor keys. When the correlation
    // difference between major and minor variants of the same root is very small,
    // bias toward minor.
    if !best_is_minor {
        let num_profiles = profile_sets.len() as f64;
        let major_avg: f64 = profile_sets
            .iter()
            .map(|(major_p, _)| pearson_correlation(chromagram, major_p, best_key))
            .sum::<f64>()
            / num_profiles;
        let minor_avg: f64 = profile_sets
            .iter()
            .map(|(_, minor_p)| pearson_correlation(chromagram, minor_p, best_key))
            .sum::<f64>()
            / num_profiles;

        if major_avg - minor_avg < 0.02 {
            best_is_minor = true;
        }
    }

    // Dominant confusion fix: if a key a perfect 5th below (the potential tonic)
    // has a similar correlation, prefer it — we likely detected the dominant.
    // In semitone math: 5 semitones up from the detected key = a 4th up = a 5th down,
    // i.e., the detected key is the dominant of the candidate tonic.
    let tonic_candidate = (best_key + 5) % 12;
    let num_profiles = profile_sets.len() as f64;

    // Check same quality (major→major, minor→minor)
    let tonic_corr: f64 = profile_sets
        .iter()
        .map(|(major_p, minor_p)| {
            let profile = if best_is_minor { minor_p } else { major_p };
            pearson_correlation(chromagram, profile, tonic_candidate)
        })
        .sum::<f64>()
        / num_profiles;

    if best_corr - tonic_corr < 0.05 {
        best_key = tonic_candidate;
        best_corr = tonic_corr;
    }

    // Also check cross quality: if we detected major, the tonic might be minor
    // (e.g., detected E major but actual key is A minor)
    let tonic_cross_corr: f64 = profile_sets
        .iter()
        .map(|(major_p, minor_p)| {
            let profile = if best_is_minor { major_p } else { minor_p };
            pearson_correlation(chromagram, profile, tonic_candidate)
        })
        .sum::<f64>()
        / num_profiles;

    if best_corr - tonic_cross_corr < 0.05 {
        best_key = tonic_candidate;
        best_is_minor = !best_is_minor;
        best_corr = tonic_cross_corr;
    }

    (best_key, best_is_minor, best_corr, second_best_corr)
}

/// Compute Pearson correlation between the chromagram and a key profile,
/// with the profile rotated by `root` semitones.
fn pearson_correlation(chromagram: &[f64; 12], profile: &[f64; 12], root: usize) -> f64 {
    let n = 12.0;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_x2 = 0.0;
    let mut sum_y2 = 0.0;

    for i in 0..12 {
        let x = chromagram[(root + i) % 12];
        let y = profile[i];

        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
        sum_y2 += y * y;
    }

    let numerator = n * sum_xy - sum_x * sum_y;
    let denominator = ((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y)).sqrt();

    if denominator < 1e-10 {
        0.0
    } else {
        numerator / denominator
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI as PI_F32;

    /// Generate a synthetic pure tone at a given frequency.
    fn generate_tone(frequency: f64, sample_rate: u32, duration_seconds: f64) -> MonoAudio {
        let total_samples = (sample_rate as f64 * duration_seconds) as usize;
        let samples: Vec<f32> = (0..total_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                (2.0 * PI_F32 * frequency as f32 * t).sin()
            })
            .collect();

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    /// Generate a chord (multiple frequencies summed and normalized).
    #[allow(dead_code)]
    fn generate_chord(frequencies: &[f64], sample_rate: u32, duration_seconds: f64) -> MonoAudio {
        let total_samples = (sample_rate as f64 * duration_seconds) as usize;
        let n_freqs = frequencies.len() as f32;
        let samples: Vec<f32> = (0..total_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                let sum: f32 = frequencies
                    .iter()
                    .map(|&freq| (2.0 * PI_F32 * freq as f32 * t).sin())
                    .sum();
                sum / n_freqs
            })
            .collect();

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    /// Generate a richer chord with harmonics for more realistic pitch class detection.
    fn generate_rich_chord(
        frequencies: &[f64],
        sample_rate: u32,
        duration_seconds: f64,
    ) -> MonoAudio {
        let total_samples = (sample_rate as f64 * duration_seconds) as usize;
        let n_freqs = frequencies.len() as f32;
        let samples: Vec<f32> = (0..total_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                let mut sum = 0.0f32;
                for &freq in frequencies {
                    sum += (2.0 * PI_F32 * freq as f32 * t).sin();
                    sum += 0.5 * (2.0 * PI_F32 * (freq * 2.0) as f32 * t).sin();
                    sum += 0.25 * (2.0 * PI_F32 * (freq * 3.0) as f32 * t).sin();
                    sum += 0.125 * (2.0 * PI_F32 * (freq * 4.0) as f32 * t).sin();
                }
                sum / (n_freqs * 1.875)
            })
            .collect();

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    #[test]
    fn test_key_detection_a_440() {
        let audio = generate_tone(440.0, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        assert!(
            result.camelot == "11B" || result.camelot == "8A",
            "440Hz tone should detect A major (11B) or A minor (8A), got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_c_major_chord() {
        let audio = generate_rich_chord(&[261.63, 329.63, 392.00], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        let camelot_num: u32 = result.camelot[..result.camelot.len() - 1].parse().unwrap();
        assert!(
            camelot_num >= 7 && camelot_num <= 10,
            "C major chord should detect key near C/Am/Em/G region, got {} ({})",
            result.camelot,
            result.musical_key
        );
        assert!(result.confidence > 0.0, "Confidence should be positive");
    }

    #[test]
    fn test_key_detection_a_minor_chord() {
        let audio = generate_rich_chord(&[220.0, 261.63, 329.63], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        let camelot_num = &result.camelot[..result.camelot.len() - 1];
        assert!(
            camelot_num == "8" || camelot_num == "5" || camelot_num == "9",
            "A minor chord should detect Am/C/Em region, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_d_minor_chord() {
        let audio = generate_rich_chord(&[293.66, 349.23, 440.00], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        let camelot_num = &result.camelot[..result.camelot.len() - 1];
        assert!(
            camelot_num == "7" || camelot_num == "10" || camelot_num == "8",
            "D minor chord should detect Dm/F region, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_empty_audio() {
        let audio = MonoAudio {
            samples: Vec::new(),
            sample_rate: 44100,
            duration_ms: 0,
        };
        let result = detect_key_from_samples(&audio);
        assert!(result.is_err(), "Empty audio should return an error");
    }

    #[test]
    fn test_key_detection_too_short_audio() {
        let audio = MonoAudio {
            samples: vec![0.0; 100],
            sample_rate: 44100,
            duration_ms: 2,
        };
        let result = detect_key_from_samples(&audio);
        assert!(result.is_err(), "Too-short audio should return an error");
    }

    #[test]
    fn test_key_detection_silence() {
        let audio = MonoAudio {
            samples: vec![0.0; 44100 * 10],
            sample_rate: 44100,
            duration_ms: 10000,
        };
        let result = detect_key_from_samples(&audio).expect("Should handle silence");
        assert!(
            result.confidence < 0.5,
            "Silence should produce low confidence, got {:.2}",
            result.confidence
        );
    }

    #[test]
    fn test_key_result_camelot_format() {
        let audio = generate_tone(440.0, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        assert!(
            result.camelot.ends_with('A') || result.camelot.ends_with('B'),
            "Camelot should end with A or B, got {}",
            result.camelot
        );
        let num_part = &result.camelot[..result.camelot.len() - 1];
        let num: u32 = num_part
            .parse()
            .expect("Camelot number part should be a valid integer");
        assert!(
            num >= 1 && num <= 12,
            "Camelot number should be 1-12, got {}",
            num
        );
    }

    #[test]
    fn test_key_result_confidence_range() {
        let audio = generate_tone(440.0, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        assert!(
            result.confidence >= 0.0 && result.confidence <= 1.0,
            "Confidence should be in [0, 1], got {:.2}",
            result.confidence
        );
    }

    #[test]
    fn test_key_detection_different_sample_rate() {
        let audio = generate_tone(440.0, 48000, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // Pure tone at 48kHz may detect A major (11B), A minor (8A), or harmonically
        // related keys like F#m (11A) due to independent voting between profiles.
        // All are valid for a pure 440Hz tone.
        let camelot_num: u32 = result.camelot[..result.camelot.len() - 1].parse().unwrap();
        assert!(
            camelot_num == 11 || camelot_num == 8,
            "440Hz at 48kHz should detect A-related key, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_detuned_a() {
        // A tuned 15 cents sharp (A=443.8Hz) — should still detect A
        let detuned_a = 440.0 * 2.0f64.powf(15.0 / 1200.0); // ~443.8Hz
        let audio = generate_tone(detuned_a, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        assert!(
            result.camelot == "11B" || result.camelot == "8A",
            "Detuned A (~444Hz) should still detect A, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_tuning_estimation_a440() {
        // Pure A=440Hz tone — tuning offset should be near 0
        let audio = generate_tone(440.0, 44100, 10.0);
        let offset = estimate_tuning(&audio.samples, audio.sample_rate);
        assert!(
            offset.abs() <= 10.0,
            "A=440Hz should estimate offset near 0, got {} cents",
            offset
        );
    }

    #[test]
    fn test_camelot_tables_valid() {
        for name in CAMELOT_MAJOR.iter().chain(CAMELOT_MINOR.iter()) {
            let num_part = &name[..name.len() - 1];
            let letter = &name[name.len() - 1..];
            let num: u32 = num_part.parse().expect("Camelot number should parse");
            assert!(num >= 1 && num <= 12, "Number should be 1-12, got {}", num);
            assert!(
                letter == "A" || letter == "B",
                "Letter should be A or B, got {}",
                letter
            );
        }

        let mut all_codes: Vec<&str> = CAMELOT_MAJOR
            .iter()
            .chain(CAMELOT_MINOR.iter())
            .copied()
            .collect();
        all_codes.sort();
        all_codes.dedup();
        assert_eq!(
            all_codes.len(),
            24,
            "Should have 24 unique Camelot codes"
        );
    }

    #[test]
    fn test_musical_key_names_valid() {
        for name in MAJOR_NAMES {
            assert!(
                !name.ends_with('m'),
                "Major key should not end with 'm': {}",
                name
            );
        }
        for name in MINOR_NAMES {
            assert!(
                name.ends_with('m'),
                "Minor key should end with 'm': {}",
                name
            );
        }
    }

    #[test]
    fn test_segment_voting_with_long_audio() {
        // 120 seconds of D minor chord — should be long enough for segment voting
        let audio = generate_rich_chord(&[293.66, 349.23, 440.00], 44100, 120.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        let camelot_num = &result.camelot[..result.camelot.len() - 1];
        assert!(
            camelot_num == "7" || camelot_num == "10" || camelot_num == "8",
            "Long D minor chord with segment voting should detect Dm/F region, got {} ({})",
            result.camelot,
            result.musical_key
        );
        // Segment voting should give high confidence for consistent audio
        assert!(
            result.confidence > 0.3,
            "Consistent signal across segments should produce decent confidence, got {:.2}",
            result.confidence
        );
    }

    #[test]
    fn test_freq_weight_values() {
        // Sub-bass should be weighted moderately (bass lines carry harmonic info)
        assert!(freq_weight(80.0) < 0.5);
        // Low-mid should be moderate
        assert!(freq_weight(200.0) > 0.5 && freq_weight(200.0) < 0.8);
        // Mid and above should be full weight
        assert!((freq_weight(500.0) - 1.0).abs() < f64::EPSILON);
        assert!((freq_weight(1500.0) - 1.0).abs() < f64::EPSILON);
    }
}
