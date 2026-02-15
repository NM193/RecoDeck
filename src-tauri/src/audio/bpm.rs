// BPM (tempo) detection using aubio's Tempo tracker.
//
// The aubio library is the industry standard for onset/tempo detection.
// We use its Tempo struct which performs onset detection + autocorrelation
// to determine the tempo of an audio signal.
//
// Algorithm overview:
// 1. Decode audio file to mono f32 PCM
// 2. Feed audio in overlapping frames to aubio's Tempo tracker
// 3. Tempo tracker detects onsets (transients) and computes autocorrelation
// 4. Returns BPM estimate and confidence score
//
// The BPM result is stored in the track_analysis table alongside other DSP data.

use bliss_audio_aubio_rs::{OnsetMode, Tempo};
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

/// Detect the BPM (tempo) of an audio file.
///
/// Uses aubio's Tempo tracker to analyze the full audio file.
/// Returns the detected BPM and a confidence score.
///
/// # Arguments
/// * `path` - Path to the audio file (MP3, FLAC, WAV, AIFF, etc.)
///
/// # Returns
/// * `Ok(BpmResult)` - Detected BPM and confidence
/// * `Err(String)` - Error message if detection fails
pub fn detect_bpm(path: &Path) -> Result<BpmResult, String> {
    // Step 1: Decode the audio file to mono f32
    let audio = decode_to_mono(path)?;
    
    // Step 2: Run BPM detection on the decoded audio
    detect_bpm_from_samples(&audio)
}

/// Detect BPM from pre-decoded mono audio samples.
///
/// This is separated from file I/O to allow testing with synthetic signals
/// and to enable reuse when audio is already decoded (e.g., from a shared pipeline).
pub fn detect_bpm_from_samples(audio: &MonoAudio) -> Result<BpmResult, String> {
    if audio.samples.is_empty() {
        return Err("No audio samples to analyze".to_string());
    }
    
    // Create aubio Tempo detector
    // Parameters:
    //   onset_mode: SpecFlux is recommended for music tempo detection —
    //               it tracks spectral changes which works well for complex audio.
    //               Falls back to Hfc (High Frequency Content) which is the default.
    //   buf_size: FFT window size for onset detection (1024)
    //   hop_size: advance between frames (512 = 50% overlap)
    //   sample_rate: match the audio's native sample rate
    let mut tempo = Tempo::new(OnsetMode::SpecFlux, BUF_SIZE, HOP_SIZE, audio.sample_rate)
        .map_err(|e| format!("Failed to create aubio Tempo detector: {:?}", e))?;
    
    // Feed audio in hop-sized chunks to the tempo tracker.
    // Each call processes one frame and updates the internal beat tracking state.
    let samples = &audio.samples;
    let total_hops = samples.len() / HOP_SIZE;
    for i in 0..total_hops {
        let start = i * HOP_SIZE;
        let end = start + HOP_SIZE;
        
        // Ensure we don't go out of bounds
        if end > samples.len() {
            break;
        }
        
        let frame = &samples[start..end];
        
        // Process this frame — feeds audio data into the beat tracker's internal state.
        // Returns > 0.0 if a beat was detected at this position.
        let _beat = tempo.do_result(frame)
            .map_err(|e| format!("Tempo detection error at frame {}: {:?}", i, e))?;
    }
    
    // Get the final BPM estimate from aubio
    let mut bpm = tempo.get_bpm() as f64;
    let confidence = tempo.get_confidence() as f64;
    
    // Clamp confidence to [0.0, 1.0] range
    let confidence = confidence.clamp(0.0, 1.0);
    
    // If BPM is 0 or unreasonable, report low confidence
    if bpm <= 0.0 || bpm < 40.0 || bpm > 300.0 {
        return Ok(BpmResult {
            bpm: 0.0,
            confidence: 0.0,
        });
    }

    // Normalize to "DJ range" (80–200 BPM) to match Traktor/Rekordbox and avoid half/double tempo mismatch.
    // Many algorithms lock onto half or double the true tempo; electronic music is usually 85–140 BPM.
    if bpm >= 40.0 && bpm < 80.0 {
        bpm *= 2.0; // e.g. 64 → 128
    } else if bpm > 200.0 && bpm <= 300.0 {
        bpm /= 2.0; // e.g. 280 → 140
    }
    
    Ok(BpmResult { bpm, confidence })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    /// Generate a synthetic click track at a known BPM for testing.
    /// Creates short impulses (clicks) at regular intervals corresponding to the target BPM.
    fn generate_click_track(bpm: f64, sample_rate: u32, duration_seconds: f64) -> MonoAudio {
        let total_samples = (sample_rate as f64 * duration_seconds) as usize;
        let mut samples = vec![0.0f32; total_samples];
        
        // Calculate samples between beats
        let samples_per_beat = (60.0 / bpm) * sample_rate as f64;
        
        // Generate clicks: short impulse (5ms) at each beat position
        let click_duration = (sample_rate as f64 * 0.005) as usize; // 5ms click
        
        let mut position = 0.0f64;
        while (position as usize) < total_samples {
            let start = position as usize;
            for j in 0..click_duration {
                let idx = start + j;
                if idx < total_samples {
                    // Decaying click: sine wave with exponential decay
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
        // Generate a 30-second click track at 120 BPM
        let audio = generate_click_track(120.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");
        
        // BPM should be within ±2 of 120
        assert!(
            (result.bpm - 120.0).abs() < 2.0,
            "Expected BPM ~120, got {:.1}",
            result.bpm
        );
        assert!(result.confidence > 0.0, "Confidence should be positive");
    }

    #[test]
    fn test_bpm_detection_128bpm() {
        // 128 BPM is the most common tempo in tech house / electronic music
        let audio = generate_click_track(128.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");
        
        // BPM should be within ±2 of 128
        assert!(
            (result.bpm - 128.0).abs() < 2.0,
            "Expected BPM ~128, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_detection_140bpm() {
        // 140 BPM — faster techno range
        let audio = generate_click_track(140.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");
        
        // BPM should be within ±3 of 140
        // (synthetic clicks at high tempos can have slight autocorrelation artifacts;
        //  real music is typically more accurate due to richer spectral content)
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
        // Pure silence — BPM should be 0 or very low confidence
        let audio = MonoAudio {
            samples: vec![0.0; 44100 * 30], // 30 seconds of silence
            sample_rate: 44100,
            duration_ms: 30000,
        };
        let result = detect_bpm_from_samples(&audio).expect("Should not error on silence");
        
        // For silence, expect either BPM=0 or very low confidence
        assert!(
            result.bpm == 0.0 || result.confidence < 0.3,
            "Silence should produce BPM=0 or low confidence, got bpm={:.1} conf={:.2}",
            result.bpm,
            result.confidence
        );
    }

    #[test]
    fn test_bpm_detection_short_audio() {
        // Very short audio (2 seconds) — might not have enough data for accurate BPM
        let audio = generate_click_track(126.0, 44100, 2.0);
        let result = detect_bpm_from_samples(&audio);
        // Should not crash, result accuracy is not critical for very short audio
        assert!(result.is_ok(), "Should handle short audio without crashing");
    }

    #[test]
    fn test_bpm_detection_different_sample_rate() {
        // 48kHz audio (common for FLAC/WAV)
        let audio = generate_click_track(125.0, 48000, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");
        
        // BPM should still be accurate regardless of sample rate
        assert!(
            (result.bpm - 125.0).abs() < 2.0,
            "Expected BPM ~125, got {:.1}",
            result.bpm
        );
    }

    #[test]
    fn test_bpm_result_fields() {
        let audio = generate_click_track(126.0, 44100, 30.0);
        let result = detect_bpm_from_samples(&audio).expect("BPM detection should succeed");
        
        // Confidence should be in [0, 1]
        assert!(result.confidence >= 0.0 && result.confidence <= 1.0,
            "Confidence should be in [0, 1], got {:.2}", result.confidence);
        
        // BPM should be in reasonable range (40-300)
        assert!(result.bpm >= 40.0 && result.bpm <= 300.0,
            "BPM should be in [40, 300], got {:.1}", result.bpm);
    }
}
