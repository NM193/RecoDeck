// Musical key detection using Chromagram + Krumhansl-Schmuckler algorithm.
//
// Algorithm overview:
// 1. Decode audio file to mono f32 PCM (reuses existing decoder)
// 2. Compute chromagram: 12 pitch class energy distribution using FFT
//    - Window the signal with a Hanning window
//    - Apply FFT to get frequency spectrum
//    - Map FFT bins to pitch classes (C through B) in the range 65Hz–2000Hz
//    - Sum magnitudes per pitch class across all frames
// 3. Correlate chromagram with Krumhansl-Schmuckler key profiles for all 24 keys
// 4. Return the best matching key in Camelot notation (primary) + musical notation
//
// Reference: Krumhansl, C.L. (1990). Cognitive Foundations of Musical Pitch.
// The K-S profiles represent the expected pitch class distribution for major/minor keys.
//
// The key result is stored in the track_analysis table alongside other DSP data.

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
/// 4096 samples gives ~10Hz resolution at 44100Hz — sufficient to distinguish
/// adjacent semitones in the lower octaves (e.g., C2=65Hz vs C#2=69Hz).
const FFT_SIZE: usize = 4096;

/// Hop size between consecutive FFT frames.
/// 2048 = 50% overlap for good temporal coverage without excessive computation.
const HOP_SIZE: usize = 2048;

/// Minimum frequency to consider for chromagram (Hz).
/// Below this, bass rumble and noise dominate. ~C2 = 65Hz.
const MIN_FREQ: f64 = 65.0;

/// Maximum frequency to consider for chromagram (Hz).
/// Above ~2000Hz, harmonics rather than fundamentals dominate,
/// which can distort the pitch class distribution.
const MAX_FREQ: f64 = 2000.0;

/// Shaath's custom key profiles (from libKeyFinder)
/// These profiles were empirically derived and work better for popular/electronic music
/// than traditional Krumhansl-Schmuckler profiles.
/// Source: Ibrahim Shaath's MSc thesis "Estimation of key in digital music recordings" (2011)
const SHAATH_MAJOR: [f64; 12] = [
    6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.2,
];

const SHAATH_MINOR: [f64; 12] = [
    6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 4.7, 4.0, 2.7, 3.4, 3.2,
];

/// Temperley's key profiles (alternative, good for classical music)
const TEMPERLEY_MAJOR: [f64; 12] = [
    5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0,
];

const TEMPERLEY_MINOR: [f64; 12] = [
    5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0,
];

/// Krumhansl-Schmuckler profiles (original, kept for reference)
const KS_MAJOR: [f64; 12] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];

const KS_MINOR: [f64; 12] = [
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
/// The Camelot wheel is the standard DJ key notation system.
/// Major keys use the "B" suffix (inner ring).
const CAMELOT_MAJOR: [&str; 12] = [
    "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
];

/// Camelot wheel notation for minor keys (indexed by pitch class)
/// Minor keys use the "A" suffix (outer ring).
const CAMELOT_MINOR: [&str; 12] = [
    "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A",
];

/// Open Key notation for major keys (indexed by pitch class: 0=C, ..., 11=B)
/// Used by Traktor and other DJ software.
/// Major keys use the "d" suffix (Dur = German for major).
const OPENKEY_MAJOR: [&str; 12] = [
    "8d", "3d", "10d", "5d", "12d", "7d", "2d", "9d", "4d", "11d", "6d", "1d",
];

/// Open Key notation for minor keys (indexed by pitch class)
/// Minor keys use the "m" suffix (Moll = German for minor).
const OPENKEY_MINOR: [&str; 12] = [
    "5m", "12m", "7m", "2m", "9m", "4m", "11m", "6m", "1m", "8m", "3m", "10m",
];

/// Detect the musical key of an audio file.
///
/// Uses FFT-based chromagram computation followed by Krumhansl-Schmuckler
/// profile matching. Returns the key in Camelot notation (primary) and
/// standard musical notation (secondary).
///
/// # Arguments
/// * `path` - Path to the audio file (MP3, FLAC, WAV, AIFF, etc.)
///
/// # Returns
/// * `Ok(KeyResult)` - Detected key and confidence
/// * `Err(String)` - Error message if detection fails
pub fn detect_key(path: &Path) -> Result<KeyResult, String> {
    // Step 1: Decode the audio file to mono f32
    let audio = decode_to_mono(path)?;

    // Step 2: Run key detection on the decoded audio
    detect_key_from_samples(&audio)
}

/// Detect key from pre-decoded mono audio samples.
///
/// Separated from file I/O to allow testing with synthetic signals
/// and reuse when audio is already decoded (e.g., from a shared analysis pipeline).
pub fn detect_key_from_samples(audio: &MonoAudio) -> Result<KeyResult, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }

    // Need at least one full FFT frame
    if audio.samples.len() < FFT_SIZE {
        return Err(format!(
            "Audio too short for key detection: {} samples (need at least {})",
            audio.samples.len(),
            FFT_SIZE
        ));
    }

    // Step 1: Compute chromagram from FFT analysis
    let chromagram = compute_chromagram(&audio.samples, audio.sample_rate)?;

    // Step 2: Correlate with all 24 key profiles and find the best match
    let (best_key_index, best_is_minor, best_corr, second_best_corr) =
        match_key_profiles(&chromagram);

    // Step 3: Convert to Camelot, Open Key, and musical notation
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

    // Step 4: Compute confidence from correlation values.
    // Confidence is based on how much the best correlation stands out from the second-best.
    // A clear winner (large gap) → high confidence. Ambiguous (small gap) → low confidence.
    let confidence = if best_corr > 0.0 {
        // Gap between best and second-best correlations.
        // Typical gap range is 0.01–0.15 for real music.
        let gap = best_corr - second_best_corr;
        // Scale gap so that 0.1 → ~0.8 confidence
        let gap_score = (gap * 8.0).clamp(0.0, 1.0);
        // Also factor in the absolute correlation strength
        let strength = best_corr.clamp(0.0, 1.0);
        // Blend: 70% gap-based + 30% strength-based
        (gap_score * 0.7 + strength * 0.3).clamp(0.0, 1.0)
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

/// Compute a chromagram (12-dimensional pitch class energy distribution) from audio samples.
///
/// The chromagram is a 12-element array where each element represents the total energy
/// for one pitch class (C, C#, D, ..., B) accumulated across all FFT frames.
///
/// Process:
/// 1. Slide a Hanning-windowed frame across the audio
/// 2. FFT each frame to get the frequency spectrum
/// 3. Map each FFT bin's frequency to a pitch class (using 12-TET tuning, A=440Hz)
/// 4. Sum the power (magnitude squared) for each pitch class
/// 5. Normalize so the chromagram sums to 1.0
fn compute_chromagram(samples: &[f32], sample_rate: u32) -> Result<[f64; 12], String> {
    let mut chromagram = [0.0f64; 12];
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    // Precompute Hanning window coefficients
    let window: Vec<f64> = (0..FFT_SIZE)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (FFT_SIZE - 1) as f64).cos()))
        .collect();

    // Precompute frequency-to-pitch-class mapping for each FFT bin.
    // Pitch class formula (12-TET, A4=440Hz):
    //   semitones_from_A = 12 * log2(freq / 440)
    //   pitch_class = (round(semitones_from_A) + 9) mod 12
    // Where +9 shifts from A-based to C-based indexing (C=0, C#=1, ..., A=9, ..., B=11)
    let bin_to_pitch_class: Vec<Option<usize>> = (0..FFT_SIZE / 2 + 1)
        .map(|bin| {
            let freq = bin as f64 * sample_rate as f64 / FFT_SIZE as f64;
            if freq < MIN_FREQ || freq > MAX_FREQ {
                None // Outside musical range
            } else {
                let semitones_from_a = 12.0 * (freq / 440.0).log2();
                // +9 shifts A (index 0 in semitones) to position 9 in chromagram (C=0 based)
                let pitch_class = ((semitones_from_a.round() as i32 + 9) % 12 + 12) % 12;
                Some(pitch_class as usize)
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

        // Perform FFT in-place
        fft.process(&mut buffer);

        // Accumulate power (magnitude squared) for each pitch class
        for (bin, pc) in bin_to_pitch_class.iter().enumerate() {
            if let Some(pc) = pc {
                let magnitude_sq = buffer[bin].norm_sqr();
                chromagram[*pc] += magnitude_sq;
            }
        }
    }

    // Normalize chromagram to sum to 1.0 (removes amplitude/duration dependence)
    let total: f64 = chromagram.iter().sum();
    if total > 0.0 {
        for val in chromagram.iter_mut() {
            *val /= total;
        }
    }

    Ok(chromagram)
}

/// Match the computed chromagram against all 24 key profiles using Pearson correlation.
/// Uses Shaath's custom profiles which work better for popular/electronic music.
///
/// Returns (pitch_class_index, is_minor, best_correlation, second_best_correlation)
fn match_key_profiles(chromagram: &[f64; 12]) -> (usize, bool, f64, f64) {
    let mut best_key = 0;
    let mut best_is_minor = false;
    let mut best_correlation = f64::NEG_INFINITY;
    let mut second_best_correlation = f64::NEG_INFINITY;

    // Test all 24 keys (12 major + 12 minor)
    for root in 0..12 {
        // Rotate the key profile so index 0 aligns with the root note.
        // e.g., for D major (root=2): the profile's "tonic" entry aligns with D in the chromagram.
        let major_corr = pearson_correlation(chromagram, &SHAATH_MAJOR, root);
        let minor_corr = pearson_correlation(chromagram, &SHAATH_MINOR, root);

        // Track best and second-best correlations
        for (corr, is_minor) in [(major_corr, false), (minor_corr, true)] {
            if corr > best_correlation {
                second_best_correlation = best_correlation;
                best_correlation = corr;
                best_key = root;
                best_is_minor = is_minor;
            } else if corr > second_best_correlation {
                second_best_correlation = corr;
            }
        }
    }

    (best_key, best_is_minor, best_correlation, second_best_correlation)
}

/// Compute Pearson correlation between the chromagram and a key profile,
/// with the profile rotated by `root` semitones.
///
/// The rotation aligns the profile so that the tonic (index 0 in the profile)
/// corresponds to pitch class `root` in the chromagram.
///
/// Pearson r = (n·Σxy - Σx·Σy) / sqrt((n·Σx² - (Σx)²) · (n·Σy² - (Σy)²))
fn pearson_correlation(chromagram: &[f64; 12], profile: &[f64; 12], root: usize) -> f64 {
    let n = 12.0;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_x2 = 0.0;
    let mut sum_y2 = 0.0;

    for i in 0..12 {
        // x = chromagram value at pitch class (root + i) % 12
        // y = profile value at position i (relative to tonic)
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
        0.0 // Avoid division by zero (happens with constant/silence input)
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
                sum / n_freqs // Normalize to prevent clipping
            })
            .collect();

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    /// Generate a richer chord with harmonics for more realistic pitch class detection.
    /// Each fundamental gets 3 harmonics with decreasing amplitude.
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
                    // Fundamental + 3 harmonics (decreasing amplitude)
                    sum += (2.0 * PI_F32 * freq as f32 * t).sin();
                    sum += 0.5 * (2.0 * PI_F32 * (freq * 2.0) as f32 * t).sin();
                    sum += 0.25 * (2.0 * PI_F32 * (freq * 3.0) as f32 * t).sin();
                    sum += 0.125 * (2.0 * PI_F32 * (freq * 4.0) as f32 * t).sin();
                }
                sum / (n_freqs * 1.875) // Normalize (1 + 0.5 + 0.25 + 0.125 = 1.875)
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
        // Pure A tone at 440Hz — should detect A major or A minor
        let audio = generate_tone(440.0, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // A = pitch class 9, so Camelot should be 11B (A major) or 8A (A minor)
        assert!(
            result.camelot == "11B" || result.camelot == "8A",
            "440Hz tone should detect A major (11B) or A minor (8A), got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_c_major_chord() {
        // C major chord with harmonics: C4 (261.63Hz) + E4 (329.63Hz) + G4 (392.00Hz)
        let audio = generate_rich_chord(&[261.63, 329.63, 392.00], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // Should detect C major (8B) or its relative minor Am (8A)
        // The Camelot "8" column is C major / A minor
        let camelot_num = &result.camelot[..result.camelot.len() - 1];
        assert!(
            camelot_num == "8" || result.camelot == "5A",
            "C major chord should detect key in the C/Am region, got {} ({})",
            result.camelot,
            result.musical_key
        );
        assert!(result.confidence > 0.0, "Confidence should be positive");
    }

    #[test]
    fn test_key_detection_a_minor_chord() {
        // A minor chord with harmonics: A3 (220Hz) + C4 (261.63Hz) + E4 (329.63Hz)
        let audio = generate_rich_chord(&[220.0, 261.63, 329.63], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // Am and C major share the same notes, so either is acceptable
        // Camelot 8A = Am, 8B = C major
        let camelot_num = &result.camelot[..result.camelot.len() - 1];
        assert!(
            camelot_num == "8" || camelot_num == "5",
            "A minor chord should detect Am/C region, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_key_detection_d_minor_chord() {
        // D minor chord: D4 (293.66Hz) + F4 (349.23Hz) + A4 (440.00Hz)
        let audio = generate_rich_chord(&[293.66, 349.23, 440.00], 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // D minor = 7A in Camelot, F major = 7B (relative major)
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
        // Audio shorter than one FFT frame (4096 samples)
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
        // Silence — chromagram is all zeros, correlations are undefined
        let audio = MonoAudio {
            samples: vec![0.0; 44100 * 10], // 10 seconds of silence
            sample_rate: 44100,
            duration_ms: 10000,
        };
        let result = detect_key_from_samples(&audio).expect("Should handle silence");
        // Silence should produce very low confidence
        assert!(
            result.confidence < 0.5,
            "Silence should produce low confidence, got {:.2}",
            result.confidence
        );
    }

    #[test]
    fn test_key_result_camelot_format() {
        // Verify the Camelot notation is well-formed
        let audio = generate_tone(440.0, 44100, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // Camelot: 1-12 followed by A or B
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
        // 48kHz audio (common for FLAC/WAV)
        let audio = generate_tone(440.0, 48000, 10.0);
        let result = detect_key_from_samples(&audio).expect("Key detection should succeed");

        // Should still detect A regardless of sample rate
        assert!(
            result.camelot == "11B" || result.camelot == "8A",
            "440Hz at 48kHz should detect A, got {} ({})",
            result.camelot,
            result.musical_key
        );
    }

    #[test]
    fn test_camelot_tables_valid() {
        // Verify all 24 Camelot entries are well-formed
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

        // Verify no duplicate Camelot codes
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
        // Major keys should not end with 'm'
        for name in MAJOR_NAMES {
            assert!(
                !name.ends_with('m'),
                "Major key should not end with 'm': {}",
                name
            );
        }
        // Minor keys should end with 'm'
        for name in MINOR_NAMES {
            assert!(
                name.ends_with('m'),
                "Minor key should end with 'm': {}",
                name
            );
        }
    }
}
