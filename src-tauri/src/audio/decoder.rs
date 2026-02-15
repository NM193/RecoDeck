use serde::{Deserialize, Serialize};
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::conv::FromSample;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

/// PCM audio chunk sent to frontend (f32 samples, interleaved stereo)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioChunk {
    /// Interleaved stereo samples (L, R, L, R, ...) in range [-1.0, 1.0]
    pub samples: Vec<f32>,
    /// Sample rate (e.g., 44100, 48000)
    pub sample_rate: u32,
    /// Current position in milliseconds
    pub position_ms: u64,
    /// Total duration in milliseconds
    pub duration_ms: u64,
    /// True if this is the last chunk
    pub is_end: bool,
}

/// Audio decoder for streaming playback
pub struct AudioDecoder {
    format_reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    sample_rate: u32,
    duration_ms: u64,
    current_position_ms: u64,
}

impl AudioDecoder {
    /// Create a new audio decoder from file path
    pub fn new(path: &Path) -> Result<Self, String> {
        // Open the media source
        let file = std::fs::File::open(path)
            .map_err(|e| format!("Failed to open audio file: {}", e))?;
        
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        // Create a hint to help the format registry guess the format
        let mut hint = Hint::new();
        if let Some(ext) = path.extension() {
            hint.with_extension(&ext.to_string_lossy());
        }

        // Probe the media source for a format
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| format!("Failed to probe audio format: {}", e))?;

        let format_reader = probed.format;

        // Get the default track (first audio track)
        let track = format_reader
            .default_track()
            .ok_or_else(|| "No audio tracks found".to_string())?;

        let track_id = track.id;

        // Create a decoder for the track
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("Failed to create decoder: {}", e))?;

        // Calculate duration
        let duration_ms = if let Some(n_frames) = track.codec_params.n_frames {
            let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
            n_frames * 1000 / sample_rate as u64
        } else {
            0 // Unknown duration
        };

        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

        Ok(Self {
            format_reader,
            decoder,
            track_id,
            sample_rate,
            duration_ms,
            current_position_ms: 0,
        })
    }

    /// Decode the next chunk of audio
    /// Returns None when EOF is reached
    pub fn decode_next_chunk(&mut self) -> Result<Option<AudioChunk>, String> {
        // Get the next packet from the format reader
        let packet = match self.format_reader.next_packet() {
            Ok(packet) => packet,
            Err(symphonia::core::errors::Error::IoError(e)) 
                if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                // End of file reached
                return Ok(Some(AudioChunk {
                    samples: Vec::new(),
                    sample_rate: self.sample_rate,
                    position_ms: self.current_position_ms,
                    duration_ms: self.duration_ms,
                    is_end: true,
                }));
            }
            Err(e) => return Err(format!("Error reading packet: {}", e)),
        };

        // Skip packets that don't belong to our track
        if packet.track_id() != self.track_id {
            return self.decode_next_chunk();
        }

        // Decode the packet
        let decoded = match self.decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Skip corrupted packets, continue decoding (matches decode_to_mono behavior)
                eprintln!("[decoder] Skipping corrupted packet: {}", msg);
                // Reset decoder state after error to avoid cascading errors
                self.decoder.reset();
                return self.decode_next_chunk();
            }
            Err(e) => return Err(format!("Decode error: {}", e)),
        };

        // Convert to interleaved f32 stereo samples
        let samples = convert_to_stereo_f32(&decoded);

        // Update position based on packet timestamp
        let ts = packet.ts();
        let time_base = self.decoder.codec_params().time_base;
        if let Some(tb) = time_base {
            let time = tb.calc_time(ts);
            self.current_position_ms = (time.seconds as u64 * 1000) + (time.frac * 1000.0) as u64;
        }

        Ok(Some(AudioChunk {
            samples,
            sample_rate: self.sample_rate,
            position_ms: self.current_position_ms,
            duration_ms: self.duration_ms,
            is_end: false,
        }))
    }

    /// Seek to a specific time position in milliseconds
    pub fn seek(&mut self, position_ms: u64) -> Result<(), String> {
        // Clamp seek position to valid range
        // Leave a small margin before the end to avoid "end of stream" errors
        let clamped_position = if self.duration_ms > 0 {
            let margin_ms = 100;
            let max_seek_position = if self.duration_ms > margin_ms {
                self.duration_ms - margin_ms
            } else {
                0
            };
            let final_position = position_ms.min(max_seek_position);
            println!("[decoder] Seeking: requested={}ms, duration={}ms, clamped={}ms",
                     position_ms, self.duration_ms, final_position);
            final_position
        } else {
            println!("[decoder] Seeking: requested={}ms (unknown duration)", position_ms);
            position_ms
        };

        // Convert milliseconds to Time (seconds + fractional seconds)
        // Time::from(u64) treats the value as SECONDS, so we must convert manually
        let time = Time {
            seconds: clamped_position / 1000,
            frac: (clamped_position % 1000) as f64 / 1000.0,
        };

        self.format_reader
            .seek(
                symphonia::core::formats::SeekMode::Accurate,
                symphonia::core::formats::SeekTo::Time { time, track_id: Some(self.track_id) },
            )
            .map_err(|e| {
                eprintln!("[decoder] Seek failed at position {}ms ({}s): {}", clamped_position, time.seconds, e);
                format!("Seek error: {}", e)
            })?;

        // Reset decoder state after seek (Symphonia best practice)
        // This prevents decode errors on the first packet after seek
        self.decoder.reset();

        self.current_position_ms = clamped_position;
        println!("[decoder] Seek successful to {}ms", clamped_position);
        Ok(())
    }

    /// Get current playback position in milliseconds
    pub fn current_position_ms(&self) -> u64 {
        self.current_position_ms
    }

    /// Get total duration in milliseconds
    pub fn duration_ms(&self) -> u64 {
        self.duration_ms
    }

    /// Get sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

/// Convert decoded audio buffer to interleaved stereo f32 samples
fn convert_to_stereo_f32(decoded: &AudioBufferRef) -> Vec<f32> {
    match decoded {
        AudioBufferRef::F32(buf) => {
            let channels = buf.spec().channels.count();
            let frames = buf.frames();
            
            if channels == 1 {
                // Mono: duplicate to stereo
                let mono = buf.chan(0);
                let mut stereo = Vec::with_capacity(frames * 2);
                for &sample in mono {
                    stereo.push(sample);
                    stereo.push(sample);
                }
                stereo
            } else if channels >= 2 {
                // Stereo or more: take first two channels
                let left = buf.chan(0);
                let right = buf.chan(1);
                let mut stereo = Vec::with_capacity(frames * 2);
                for i in 0..frames {
                    stereo.push(left[i]);
                    stereo.push(right[i]);
                }
                stereo
            } else {
                Vec::new()
            }
        }
        AudioBufferRef::U8(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::U16(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::U24(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::U32(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::S8(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::S16(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::S24(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::S32(buf) => convert_buffer_to_f32(buf),
        AudioBufferRef::F64(buf) => convert_buffer_to_f32(buf),
    }
}

/// Generic converter for any sample format to interleaved stereo f32
fn convert_buffer_to_f32<S>(buf: &symphonia::core::audio::AudioBuffer<S>) -> Vec<f32>
where
    S: symphonia::core::sample::Sample,
    f32: FromSample<S>,
{
    let channels = buf.spec().channels.count();
    let frames = buf.frames();

    if channels == 1 {
        // Mono: duplicate to stereo
        let mono = buf.chan(0);
        let mut stereo = Vec::with_capacity(frames * 2);
        for &sample in mono {
            let f = f32::from_sample(sample);
            stereo.push(f);
            stereo.push(f);
        }
        stereo
    } else if channels >= 2 {
        // Stereo or more: take first two channels
        let left = buf.chan(0);
        let right = buf.chan(1);
        let mut stereo = Vec::with_capacity(frames * 2);
        for i in 0..frames {
            stereo.push(f32::from_sample(left[i]));
            stereo.push(f32::from_sample(right[i]));
        }
        stereo
    } else {
        Vec::new()
    }
}

/// Result of decoding an entire audio file to mono f32 samples.
/// Used as input for DSP analysis (BPM, key, waveform, spectrogram, etc.)
#[derive(Debug, Clone)]
pub struct MonoAudio {
    /// Mono audio samples in range [-1.0, 1.0]
    pub samples: Vec<f32>,
    /// Sample rate of the audio (e.g., 44100, 48000)
    pub sample_rate: u32,
    /// Total duration in milliseconds
    pub duration_ms: u64,
}

/// Decode an entire audio file to mono f32 samples.
/// 
/// This is the foundation for all DSP analysis in RecoDeck.
/// It reads the full file, decodes all packets, converts to f32,
/// and mixes down to mono (if stereo/multichannel).
///
/// The samples are NOT resampled — they stay at the file's native sample rate.
/// Individual analysis modules can resample if needed (e.g., to 16kHz for AI models).
pub fn decode_to_mono(path: &Path) -> Result<MonoAudio, String> {
    // Open and probe the audio file
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    
    let mut hint = Hint::new();
    if let Some(ext) = path.extension() {
        hint.with_extension(&ext.to_string_lossy());
    }
    
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe audio format: {}", e))?;
    
    let mut format_reader = probed.format;
    
    let track = format_reader
        .default_track()
        .ok_or_else(|| "No audio tracks found".to_string())?;
    
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    
    // Calculate duration from frame count
    let duration_ms = if let Some(n_frames) = track.codec_params.n_frames {
        n_frames * 1000 / sample_rate as u64
    } else {
        0
    };
    
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    // Collect all decoded mono samples
    let mut all_samples: Vec<f32> = Vec::new();
    
    loop {
        let packet = match format_reader.next_packet() {
            Ok(packet) => packet,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break; // End of file
            }
            Err(e) => return Err(format!("Error reading packet: {}", e)),
        };
        
        // Skip packets from other tracks
        if packet.track_id() != track_id {
            continue;
        }
        
        // Decode the packet
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Skip corrupted packets, continue decoding
                eprintln!("[decode_to_mono] Skipping corrupted packet: {}", msg);
                continue;
            }
            Err(e) => return Err(format!("Decode error: {}", e)),
        };
        
        // Convert to mono f32 and append
        let mono_chunk = convert_to_mono_f32(&decoded);
        all_samples.extend_from_slice(&mono_chunk);
    }
    
    // Recalculate duration from actual sample count if needed
    let actual_duration_ms = if sample_rate > 0 {
        (all_samples.len() as u64 * 1000) / sample_rate as u64
    } else {
        duration_ms
    };
    
    Ok(MonoAudio {
        samples: all_samples,
        sample_rate,
        duration_ms: actual_duration_ms,
    })
}

/// Convert decoded audio buffer to mono f32 samples.
/// If stereo/multichannel, averages all channels to produce mono output.
fn convert_to_mono_f32(decoded: &AudioBufferRef) -> Vec<f32> {
    match decoded {
        AudioBufferRef::F32(buf) => mix_to_mono_f32(buf),
        AudioBufferRef::U8(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::U16(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::U24(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::U32(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::S8(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::S16(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::S24(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::S32(buf) => mix_to_mono_generic(buf),
        AudioBufferRef::F64(buf) => mix_to_mono_generic(buf),
    }
}

/// Mix f32 buffer channels down to mono
fn mix_to_mono_f32(buf: &symphonia::core::audio::AudioBuffer<f32>) -> Vec<f32> {
    let channels = buf.spec().channels.count();
    let frames = buf.frames();
    
    if channels == 0 || frames == 0 {
        return Vec::new();
    }
    
    if channels == 1 {
        // Already mono — just copy
        buf.chan(0).to_vec()
    } else {
        // Average all channels to produce mono
        let mut mono = vec![0.0f32; frames];
        let scale = 1.0 / channels as f32;
        for ch in 0..channels {
            let channel_data = buf.chan(ch);
            for (i, &sample) in channel_data.iter().enumerate() {
                mono[i] += sample * scale;
            }
        }
        mono
    }
}

/// Generic mixer: convert any sample format to f32 mono
fn mix_to_mono_generic<S>(buf: &symphonia::core::audio::AudioBuffer<S>) -> Vec<f32>
where
    S: symphonia::core::sample::Sample,
    f32: FromSample<S>,
{
    let channels = buf.spec().channels.count();
    let frames = buf.frames();
    
    if channels == 0 || frames == 0 {
        return Vec::new();
    }
    
    if channels == 1 {
        buf.chan(0).iter().map(|&s| f32::from_sample(s)).collect()
    } else {
        let mut mono = vec![0.0f32; frames];
        let scale = 1.0 / channels as f32;
        for ch in 0..channels {
            let channel_data = buf.chan(ch);
            for (i, &sample) in channel_data.iter().enumerate() {
                mono[i] += f32::from_sample(sample) * scale;
            }
        }
        mono
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_audio_decoder_basic() {
        // This test requires a test audio file
        // Skip if not available (would need to be added to test fixtures)
        let test_file = PathBuf::from("test_fixtures/test.mp3");
        if !test_file.exists() {
            println!("Skipping test: no test audio file available");
            return;
        }

        let mut decoder = AudioDecoder::new(&test_file).unwrap();
        
        // Decode first chunk
        let chunk = decoder.decode_next_chunk().unwrap();
        assert!(chunk.is_some());
        
        let chunk = chunk.unwrap();
        assert!(!chunk.samples.is_empty());
        assert!(chunk.sample_rate > 0);
    }
}
