// BPM (tempo) detection using aubio's Tempo tracker with multi-mode consensus.
//
// Improvements over basic aubio get_bpm():
// 1. IBI-based detection: collect actual beat positions from do_result(),
//    compute BPM from median inter-beat intervals (much more robust)
// 2. Multi-mode consensus: run multiple onset detection modes and cross-validate
// 3. DJ-range octave folding: normalize to 70–160 BPM (covers all dance music)
// 4. Low-pass filtering: 500Hz cutoff removes hi-hat interference that causes
//    onset detectors to trigger between kicks, producing overestimated BPM
// 5. Cross-check: SpecFlux on unfiltered audio as independent reference
//
// Algorithm overview:
// 1. Decode audio file to mono f32 PCM
// 2. Low-pass filter audio at 500Hz to isolate kick drum transients
// 3. Run aubio Tempo with multiple onset modes on filtered audio
// 4. Run SpecFlux on original unfiltered audio as cross-check
// 5. For each mode: collect beat positions, compute BPM from median IBI
// 6. Also get aubio's own get_bpm() estimate as a secondary signal
// 7. Fold all candidates into DJ range (70–160 BPM)
// 8. Cluster candidates and pick the consensus BPM
// 9. Return BPM and confidence

use bliss_audio_aubio_rs::{OnsetMode, Tempo};
use std::f64::consts::PI;
use std::path::Path;

use super::decoder::{decode_to_mono, MonoAudio};

/// Result of BPM detection for a single track
#[derive(Debug, Clone)]
pub struct BpmResult {
    /// Detected BPM (beats per minute)
    pub bpm: f64,
    /// Confidence score (0.0 to 1.0) — higher means more reliable detection
    pub confidence: f64,
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

/// Detect the BPM (tempo) of an audio file.
pub fn detect_bpm(path: &Path) -> Result<BpmResult, String> {
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

/// Detect BPM from pre-decoded mono audio samples.
///
/// Uses multi-mode consensus with low-pass filtering:
/// 1. Low-pass filter audio at 500Hz to remove hi-hat interference
/// 2. Run all onset modes (SpecFlux, Hfc, Complex) on filtered audio
/// 3. Also run SpecFlux on original unfiltered audio as cross-check
/// 4. Fold candidates into DJ range and pick consensus
pub fn detect_bpm_from_samples(audio: &MonoAudio) -> Result<BpmResult, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }

    // Low-pass filter to remove hi-hat interference that causes BPM overestimation
    let filtered_samples = low_pass_filter(&audio.samples, audio.sample_rate, 500.0);
    let filtered_audio = MonoAudio {
        samples: filtered_samples,
        sample_rate: audio.sample_rate,
        duration_ms: audio.duration_ms,
    };

    let mut candidates: Vec<(f64, f64)> = Vec::new(); // (bpm, confidence)

    // Run all onset modes on filtered audio (hi-hat removed)
    let modes_filtered = [OnsetMode::SpecFlux, OnsetMode::Hfc, OnsetMode::Complex];
    for &mode in &modes_filtered {
        if let Ok((ibi_bpm, ibi_conf, aubio_bpm, aubio_conf)) =
            run_tempo_analysis(&filtered_audio, mode)
        {
            // IBI-based result (primary — more robust)
            if ibi_bpm > 0.0 {
                let folded = fold_to_dj_range(ibi_bpm);
                candidates.push((folded, ibi_conf));
            }

            // aubio's own get_bpm() (secondary signal)
            if aubio_bpm > 0.0 {
                let folded = fold_to_dj_range(aubio_bpm);
                candidates.push((folded, aubio_conf * 0.8)); // slight penalty vs IBI
            }
        }
    }

    // Cross-check: run SpecFlux on original unfiltered audio
    // SpecFlux is least affected by hi-hats; the unfiltered result acts as a reference
    if let Ok((ibi_bpm, ibi_conf, _, _)) = run_tempo_analysis(audio, OnsetMode::SpecFlux) {
        if ibi_bpm > 0.0 {
            let folded = fold_to_dj_range(ibi_bpm);
            candidates.push((folded, ibi_conf * 0.6)); // lower weight for unfiltered
        }
    }

    if candidates.is_empty() {
        return Ok(BpmResult {
            bpm: 0.0,
            confidence: 0.0,
        });
    }

    // Find consensus among candidates
    pick_consensus(&candidates)
}

/// Run aubio Tempo with a specific onset mode.
/// Returns (ibi_bpm, ibi_confidence, aubio_bpm, aubio_confidence).
fn run_tempo_analysis(
    audio: &MonoAudio,
    mode: OnsetMode,
) -> Result<(f64, f64, f64, f64), String> {
    let mut tempo = Tempo::new(mode, BUF_SIZE, HOP_SIZE, audio.sample_rate)
        .map_err(|e| format!("Failed to create aubio Tempo detector: {:?}", e))?;

    let samples = &audio.samples;
    let total_hops = samples.len() / HOP_SIZE;

    // Collect beat positions (in seconds) from do_result()
    let mut beat_positions: Vec<f64> = Vec::new();

    for i in 0..total_hops {
        let start = i * HOP_SIZE;
        let end = start + HOP_SIZE;
        if end > samples.len() {
            break;
        }

        let frame = &samples[start..end];
        let beat = tempo
            .do_result(frame)
            .map_err(|e| format!("Tempo detection error at frame {}: {:?}", i, e))?;

        // beat > 0.0 means a beat was detected at this position
        if beat > 0.0 {
            let position_seconds = i as f64 * HOP_SIZE as f64 / audio.sample_rate as f64;
            beat_positions.push(position_seconds);
        }
    }

    // IBI-based BPM from collected beat positions
    let (ibi_bpm, ibi_confidence) = compute_bpm_from_ibis(&beat_positions);

    // aubio's own autocorrelation-based BPM
    let aubio_bpm = tempo.get_bpm() as f64;
    let aubio_confidence = (tempo.get_confidence() as f64).clamp(0.0, 1.0);

    Ok((ibi_bpm, ibi_confidence, aubio_bpm, aubio_confidence))
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

/// Pick the consensus BPM from a list of (bpm, confidence) candidates.
///
/// Strategy:
/// 1. Sort candidates by BPM
/// 2. Cluster candidates within CONSENSUS_TOLERANCE of each other
/// 3. Score each cluster by: sum of confidences * number of members
/// 4. Pick the best cluster
/// 5. Return the median BPM from that cluster (robust against outliers)
/// 6. Snap to nearest integer if within ±0.3 BPM (electronic music convention)
fn pick_consensus(candidates: &[(f64, f64)]) -> Result<BpmResult, String> {
    if candidates.is_empty() {
        return Ok(BpmResult {
            bpm: 0.0,
            confidence: 0.0,
        });
    }

    if candidates.len() == 1 {
        return Ok(BpmResult {
            bpm: candidates[0].0,
            confidence: candidates[0].1,
        });
    }

    // Sort by BPM
    let mut sorted: Vec<(f64, f64)> = candidates.to_vec();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    // Cluster: group candidates within CONSENSUS_TOLERANCE BPM of each other
    let mut clusters: Vec<Vec<(f64, f64)>> = Vec::new();
    let mut current_cluster: Vec<(f64, f64)> = vec![sorted[0]];

    for &(bpm, conf) in &sorted[1..] {
        let cluster_center = current_cluster.iter().map(|c| c.0).sum::<f64>()
            / current_cluster.len() as f64;

        if (bpm - cluster_center).abs() <= CONSENSUS_TOLERANCE {
            current_cluster.push((bpm, conf));
        } else {
            clusters.push(current_cluster);
            current_cluster = vec![(bpm, conf)];
        }
    }
    clusters.push(current_cluster);

    // Score each cluster: sum_of_confidences * member_count (rewards agreement)
    let best_cluster = clusters
        .iter()
        .max_by(|a, b| {
            let score_a = a.iter().map(|c| c.1).sum::<f64>() * a.len() as f64;
            let score_b = b.iter().map(|c| c.1).sum::<f64>() * b.len() as f64;
            score_a.partial_cmp(&score_b).unwrap()
        })
        .unwrap();

    // Median BPM from the best cluster (more robust than confidence-weighted average)
    let mut cluster_bpms: Vec<f64> = best_cluster.iter().map(|c| c.0).collect();
    cluster_bpms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let bpm = cluster_bpms[cluster_bpms.len() / 2];

    // Overall confidence: based on cluster agreement
    let max_conf = best_cluster
        .iter()
        .map(|c| c.1)
        .fold(0.0f64, f64::max);

    // Bonus for multi-mode agreement
    let agreement_bonus = if best_cluster.len() >= 3 {
        0.15
    } else if best_cluster.len() >= 2 {
        0.08
    } else {
        0.0
    };

    let confidence = (max_conf + agreement_bonus).clamp(0.0, 1.0);

    // Integer snap: electronic music almost always has whole-number BPM.
    // If within ±0.3 of an integer, snap to it.
    let nearest_int = bpm.round();
    let bpm = if (bpm - nearest_int).abs() <= 0.3 {
        nearest_int
    } else {
        // Keep 2 decimal places for non-integer BPMs
        (bpm * 100.0).round() / 100.0
    };

    Ok(BpmResult { bpm, confidence })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    /// Generate a synthetic click track at a known BPM for testing.
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

        MonoAudio {
            samples,
            sample_rate,
            duration_ms: (duration_seconds * 1000.0) as u64,
        }
    }

    #[test]
    fn test_bpm_detection_120bpm() {
        let audio = generate_click_track(120.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");

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
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");

        assert!(
            (result.bpm - 128.0).abs() < 3.0,
            "Expected BPM ~128, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_detection_140bpm() {
        let audio = generate_click_track(140.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");

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
        let result = detect_bpm_from_samples(&audio).expect("Should not error on silence");

        assert!(
            result.bpm == 0.0 || result.confidence < 0.3,
            "Silence should produce BPM=0 or low confidence, got bpm={:.1} conf={:.2}",
            result.bpm,
            result.confidence
        );
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
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");

        assert!(
            (result.bpm - 125.0).abs() < 3.0,
            "Expected BPM ~125, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_result_fields() {
        let audio = generate_click_track(126.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");

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
