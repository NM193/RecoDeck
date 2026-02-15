// Waveform generation for Traktor-style RGB visualization
// Computes peak amplitude + frequency band energy (low/mid/high → RGB)

use super::decoder::decode_to_mono;
use rustfft::{FftPlanner, num_complex::Complex};
use std::path::Path;

/// Waveform point with peak amplitude and RGB frequency bands
#[derive(Debug, Clone, Copy)]
pub struct WaveformPoint {
    /// Peak amplitude (0.0-1.0)
    pub peak: f32,
    /// Low frequency energy (bass) - maps to Red (0-255)
    pub low: u8,
    /// Mid frequency energy - maps to Green (0-255)
    pub mid: u8,
    /// High frequency energy (treble) - maps to Blue (0-255)
    pub high: u8,
}

/// Waveform data with metadata
#[derive(Debug, Clone)]
pub struct WaveformData {
    pub points: Vec<WaveformPoint>,
    pub sample_rate: u32,
    pub duration_ms: u64,
}

impl WaveformData {
    /// Serialize to binary BLOB for database storage
    /// Format: [version:u8, sample_rate:u32, duration_ms:u64, points_count:u32, points...]
    /// Each point: [peak:f32, low:u8, mid:u8, high:u8]
    pub fn to_blob(&self) -> Vec<u8> {
        let mut blob = Vec::with_capacity(17 + self.points.len() * 7);
        
        // Header
        blob.push(1); // version
        blob.extend_from_slice(&self.sample_rate.to_le_bytes());
        blob.extend_from_slice(&self.duration_ms.to_le_bytes());
        blob.extend_from_slice(&(self.points.len() as u32).to_le_bytes());
        
        // Points
        for point in &self.points {
            blob.extend_from_slice(&point.peak.to_le_bytes());
            blob.push(point.low);
            blob.push(point.mid);
            blob.push(point.high);
        }
        
        blob
    }
    
    /// Deserialize from binary BLOB
    pub fn from_blob(blob: &[u8]) -> Result<Self, String> {
        if blob.len() < 17 {
            return Err("Invalid waveform BLOB: too short".to_string());
        }
        
        let version = blob[0];
        if version != 1 {
            return Err(format!("Unsupported waveform version: {}", version));
        }
        
        let sample_rate = u32::from_le_bytes([blob[1], blob[2], blob[3], blob[4]]);
        let duration_ms = u64::from_le_bytes([
            blob[5], blob[6], blob[7], blob[8],
            blob[9], blob[10], blob[11], blob[12],
        ]);
        let points_count = u32::from_le_bytes([blob[13], blob[14], blob[15], blob[16]]) as usize;
        
        let expected_len = 17 + points_count * 7;
        if blob.len() != expected_len {
            return Err(format!(
                "Invalid waveform BLOB: expected {} bytes, got {}",
                expected_len,
                blob.len()
            ));
        }
        
        let mut points = Vec::with_capacity(points_count);
        let mut offset = 17;
        
        for _ in 0..points_count {
            let peak = f32::from_le_bytes([
                blob[offset],
                blob[offset + 1],
                blob[offset + 2],
                blob[offset + 3],
            ]);
            let low = blob[offset + 4];
            let mid = blob[offset + 5];
            let high = blob[offset + 6];
            
            points.push(WaveformPoint { peak, low, mid, high });
            offset += 7;
        }
        
        Ok(WaveformData {
            points,
            sample_rate,
            duration_ms,
        })
    }
}

/// Generate waveform data from audio file
/// 
/// `target_points`: desired number of waveform points
/// - overview: 2000-4000 points (full track)
/// - detail: 8000-16000 points (for zoom)
pub fn generate_waveform(path: &Path, target_points: usize) -> Result<WaveformData, String> {
    // Decode audio to mono
    let audio = decode_to_mono(path)?;
    
    if audio.samples.is_empty() {
        return Err("Audio file has no samples".to_string());
    }
    
    let samples_per_point = (audio.samples.len() / target_points).max(1);
    let actual_points = (audio.samples.len() / samples_per_point).min(target_points);
    
    let mut points = Vec::with_capacity(actual_points);
    
    // FFT setup for frequency analysis
    let fft_size = samples_per_point.next_power_of_two().min(2048);
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);
    
    for i in 0..actual_points {
        let start = i * samples_per_point;
        let end = ((i + 1) * samples_per_point).min(audio.samples.len());
        let slice = &audio.samples[start..end];
        
        // Compute peak amplitude
        let peak = slice.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);
        
        // Compute frequency bands via FFT
        let (low, mid, high) = compute_frequency_bands(slice, fft_size, fft.as_ref(), audio.sample_rate);
        
        points.push(WaveformPoint { peak, low, mid, high });
    }
    
    Ok(WaveformData {
        points,
        sample_rate: audio.sample_rate,
        duration_ms: audio.duration_ms,
    })
}

/// Compute low/mid/high frequency band energies from audio slice
/// Returns RGB values (0-255) for Traktor-style visualization
fn compute_frequency_bands(
    samples: &[f32],
    fft_size: usize,
    fft: &dyn rustfft::Fft<f32>,
    sample_rate: u32,
) -> (u8, u8, u8) {
    if samples.is_empty() {
        return (0, 0, 0);
    }
    
    // Prepare FFT input with Hann window
    let mut buffer: Vec<Complex<f32>> = samples
        .iter()
        .take(fft_size)
        .enumerate()
        .map(|(i, &s)| {
            // Hann window
            let window = 0.5 - 0.5 * ((2.0 * std::f32::consts::PI * i as f32) / (fft_size as f32 - 1.0)).cos();
            Complex::new(s * window, 0.0)
        })
        .collect();
    
    // Pad with zeros if needed
    while buffer.len() < fft_size {
        buffer.push(Complex::new(0.0, 0.0));
    }
    
    // Perform FFT
    fft.process(&mut buffer);
    
    // Compute magnitude spectrum (only first half, since it's symmetric)
    let magnitudes: Vec<f32> = buffer[..fft_size / 2]
        .iter()
        .map(|c| (c.re * c.re + c.im * c.im).sqrt())
        .collect();
    
    // Define frequency bands (in Hz)
    // Low: 20-250 Hz (bass/kick)
    // Mid: 250-4000 Hz (vocals/melody)
    // High: 4000-16000 Hz (cymbals/hi-hats)
    let freq_per_bin = sample_rate as f32 / fft_size as f32;
    
    let low_start = (20.0 / freq_per_bin) as usize;
    let low_end = (250.0 / freq_per_bin) as usize;
    let mid_end = (4000.0 / freq_per_bin) as usize;
    let high_end = (16000.0 / freq_per_bin).min(magnitudes.len() as f32) as usize;
    
    // Sum energy in each band
    let low_energy: f32 = magnitudes[low_start..low_end].iter().sum();
    let mid_energy: f32 = magnitudes[low_end..mid_end].iter().sum();
    let high_energy: f32 = magnitudes[mid_end..high_end].iter().sum();
    
    // Normalize each band independently with simple scaling
    // Typical energy values range from 0 to ~100-1000 depending on band width
    // We'll use a heuristic scale factor and clamp to 0-255
    let gamma = 0.5; // Compress dynamic range
    let min_brightness = 50.0; // Minimum visible level
    
    // Scale factors tuned for typical music at 44.1kHz with fft_size up to 2048
    let low_scale = 0.8;
    let mid_scale = 0.3;
    let high_scale = 1.5;
    
    let low_norm = (min_brightness + (low_energy * low_scale).powf(gamma)).min(255.0) as u8;
    let mid_norm = (min_brightness + (mid_energy * mid_scale).powf(gamma)).min(255.0) as u8;
    let high_norm = (min_brightness + (high_energy * high_scale).powf(gamma)).min(255.0) as u8;
    
    (low_norm, mid_norm, high_norm)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_waveform_serialization() {
        let data = WaveformData {
            points: vec![
                WaveformPoint { peak: 0.5, low: 100, mid: 150, high: 200 },
                WaveformPoint { peak: 0.8, low: 50, mid: 100, high: 150 },
            ],
            sample_rate: 44100,
            duration_ms: 5000,
        };
        
        let blob = data.to_blob();
        let restored = WaveformData::from_blob(&blob).unwrap();
        
        assert_eq!(restored.sample_rate, 44100);
        assert_eq!(restored.duration_ms, 5000);
        assert_eq!(restored.points.len(), 2);
        assert_eq!(restored.points[0].low, 100);
        assert_eq!(restored.points[1].high, 150);
    }
}
