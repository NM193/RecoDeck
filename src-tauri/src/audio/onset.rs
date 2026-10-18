// src-tauri/src/audio/onset.rs
// The onset envelope (spec 2026-10-17, §2): spectral flux in a low band (the
// kick) and over the whole spectrum, every 128 samples. The beat grid uses it
// to refine its tempo and phase, for its first beat and its confidence.

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
/// Where the flux peaks sit from an onset, in ms (negative: before it):
/// measured on the synthetic kick tests and taken off the frame times, so a
/// grid found on the envelope sits on the kicks.
const ENVELOPE_LATENCY_MS: f64 = -2.13;

pub struct OnsetEnvelope {
    /// Seconds between frames, and the time of frame 0's centre.
    frame_s: f64,
    start_s: f64,
    /// Per frame: low-band flux, full-band flux, low-band energy.
    low: Vec<f32>,
    full: Vec<f32>,
    low_energy: Vec<f32>,
}


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
                let norm = buffer[b].norm();
                let magnitude = if norm.is_finite() { norm } else { 0.0 };
                // Log compression, then only rises count: an onset, not a held note.
                let level = (1.0 + 100.0 * magnitude).ln();
                // Frame 0 has no earlier frame to rise from: it only sets `previous`.
                let rise = if f == 0 { 0.0 } else { (level - previous[b]).max(0.0) };
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
        Self { frame_s: HOP as f64 / rate, start_s: (FRAME / 2) as f64 / rate - ENVELOPE_LATENCY_MS / 1000.0, low, full, low_energy }
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

    /// The strongest low-band flux between two times.
    fn max_low(&self, from: f64, to: f64) -> f32 {
        if self.low.is_empty() {
            return 0.0;
        }
        let (a, b) = (self.frame_at(from), self.frame_at(to));
        self.low[a.min(b)..=a.max(b)].iter().copied().fold(0.0, f32::max)
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
        // Mean per frame, so a partial last window is not mistaken for a quiet one.
        let energy: Vec<f64> = self
            .low_energy
            .chunks(self.window_frames())
            .map(|c| c.iter().map(|&e| e as f64).sum::<f64>() / c.len() as f64)
            .collect();
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

    /// Whether a low-band onset lies within `tolerance_s` of t: the strongest
    /// low-band flux that close is at least half the strongest within half a
    /// beat either side.
    pub fn kick_near(&self, t: f64, tolerance_s: f64, period_s: f64) -> bool {
        let around = self.max_low(t - period_s / 2.0, t + period_s / 2.0);
        around > 0.0 && self.max_low(t - tolerance_s, t + tolerance_s) >= 0.5 * around
    }

    /// The low-band onset strength at a grid's beats (±10 ms): which of
    /// several phases sits on the kicks.
    pub fn kick_strength(&self, phase_s: f64, period_s: f64) -> f64 {
        self.beats(phase_s, period_s).map(|t| self.max_low(t - 0.010, t + 0.010) as f64).sum()
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
        let at = |j: usize| (self.low[j] + self.full[j]) as f64;
        at(i) * (1.0 - w) + at(i + 1) * w
    }

    /// The onset strength on a grid's beats: what the envelope search maximises.
    pub fn onset_strength(&self, phase_s: f64, period_s: f64) -> f64 {
        self.beats(phase_s, period_s).map(|t| self.flux_at(t)).sum()
    }

    /// A grid's beats from 0 s to the end of the envelope.
    pub fn beats(&self, phase_s: f64, period_s: f64) -> Box<dyn Iterator<Item = f64> + '_> {
        if !(phase_s.is_finite() && period_s.is_finite() && period_s > 0.0) {
            return Box::new(std::iter::empty());
        }
        let first = (-phase_s / period_s).ceil() as i64;
        let end = self.duration_s();
        Box::new((first..).map(move |k| phase_s + k as f64 * period_s).take_while(move |&t| t <= end))
    }
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
    fn grid_beats_stay_inside_the_track() {
        let envelope = OnsetEnvelope::compute(&kick_track(120.0, 44100, 10.0, 0.137));
        let beats: Vec<f64> = envelope.beats(0.137, 0.5).collect();
        assert!(beats.first().copied().unwrap() >= 0.0 && beats.first().copied().unwrap() < 0.5);
        assert!(beats.last().copied().unwrap() <= envelope.duration_s());
        assert!((beats.len() as i64 - 20).abs() <= 1);
    }

    #[test]
    fn a_track_that_starts_with_a_hum_has_no_onset_at_frame_0() {
        let mut audio = kick_track(124.0, 44100, 30.0, 2.0);
        for (i, s) in audio.samples.iter_mut().enumerate() {
            *s += 0.05 * (2.0 * PI * 60.0 * i as f64 / 44100.0).sin() as f32;
        }
        let onset = OnsetEnvelope::compute(&audio).first_strong_low_onset().expect("an onset");
        assert!((onset - 2.0).abs() < 0.010, "first kick at 2.0, onset at {onset:.4}");
    }

    #[test]
    fn a_grid_without_a_positive_finite_period_has_no_beats() {
        let envelope = OnsetEnvelope::compute(&kick_track(120.0, 44100, 10.0, 0.137));
        assert_eq!(envelope.beats(0.0, 0.0).count(), 0);
        assert_eq!(envelope.beats(0.0, -0.5).count(), 0);
        assert_eq!(envelope.beats(f64::NAN, 0.5).count(), 0);
        assert_eq!(envelope.beats(0.0, f64::INFINITY).count(), 0);
    }
}
