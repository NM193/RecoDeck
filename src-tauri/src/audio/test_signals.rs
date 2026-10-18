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
