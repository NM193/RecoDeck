use serde::{Deserialize, Serialize};
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::conv::FromSample;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{Time, TimeBase};

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
            self.current_position_ms = (time.seconds * 1000) + (time.frac * 1000.0) as u64;
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
            let max_seek_position = self.duration_ms.saturating_sub(margin_ms);
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

/// Frames of silence that stand in for a packet that failed to decode, so
/// the samples after it keep their time (spec 2026-10-17, §2): the packet's
/// duration in the track's time base, at the sample rate.
fn gap_frames(duration: u64, time_base: Option<TimeBase>, sample_rate: u32) -> usize {
    let frames = match time_base {
        Some(tb) if tb.numer != 0 && tb.denom != 0 => {
            let t = tb.calc_time(duration);
            ((t.seconds as f64 + t.frac) * sample_rate as f64).round() as usize
        }
        _ => duration as usize,
    };
    frames.min((MAX_GAP_S * sample_rate as f64) as usize)
}

/// Longest silence one failed packet stands for: real packets last milliseconds, so more is a corrupt header.
const MAX_GAP_S: f64 = 10.0;

/// Whether MP3/AAC encoder delay and padding are trimmed for analysis. Set by
/// measurement (spec §2, decoder timeline): the setting that lines MP3 grids
/// up with Traktor's.
const GAPLESS: bool = false;

/// Why a file could not be decoded. The difference matters to analysis: a file
/// that could not be read (no permission, a flaky or unmounted drive) may
/// decode next time, while one that was read but is not decodable audio will
/// not, so only that one counts as analysed.
#[derive(Debug, Clone, PartialEq)]
pub enum DecodeError {
    /// The file could not be opened or read (an I/O error other than its end).
    Unreadable(String),
    /// The file was read but is not audio this decoder handles (unsupported
    /// format, no audio track, codec error).
    Undecodable(String),
}

impl DecodeError {
    /// An I/O error that is not the end of the file means the file could not
    /// be read; anything else from the decoder is about the content.
    fn of(e: &symphonia::core::errors::Error, message: String) -> Self {
        match e {
            symphonia::core::errors::Error::IoError(io)
                if io.kind() != std::io::ErrorKind::UnexpectedEof =>
            {
                DecodeError::Unreadable(message)
            }
            _ => DecodeError::Undecodable(message),
        }
    }

    /// True when a later attempt may succeed.
    pub fn is_transient(&self) -> bool {
        matches!(self, DecodeError::Unreadable(_))
    }
}

/// The file, noting any I/O error other than its end: the probe swallows
/// read errors into "no suitable format", so the failure kind has to be kept
/// here.
struct WatchedFile {
    file: std::fs::File,
    failed: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl WatchedFile {
    fn note<T>(&self, result: std::io::Result<T>) -> std::io::Result<T> {
        if let Err(e) = &result {
            if e.kind() != std::io::ErrorKind::UnexpectedEof {
                self.failed.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        }
        result
    }
}

impl std::io::Read for WatchedFile {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let result = self.file.read(buf);
        self.note(result)
    }
}

impl std::io::Seek for WatchedFile {
    fn seek(&mut self, pos: std::io::SeekFrom) -> std::io::Result<u64> {
        let result = self.file.seek(pos);
        self.note(result)
    }
}

impl symphonia::core::io::MediaSource for WatchedFile {
    fn is_seekable(&self) -> bool {
        true
    }
    fn byte_len(&self) -> Option<u64> {
        self.file.metadata().ok().map(|m| m.len())
    }
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::Unreadable(m) | DecodeError::Undecodable(m) => f.write_str(m),
        }
    }
}

/// `decode_to_mono` with the kind of failure kept, for the batch.
pub fn decode_to_mono_typed(path: &Path) -> Result<MonoAudio, DecodeError> {
    // Open and probe the audio file
    let file = std::fs::File::open(path)
        .map_err(|e| DecodeError::Unreadable(format!("Failed to open audio file: {}", e)))?;
    
    let io_failed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let watched = WatchedFile { file, failed: io_failed.clone() };
    let mss = MediaSourceStream::new(Box::new(watched), Default::default());
    // A read error anywhere makes the failure transient, however it surfaced.
    let classify = |e: DecodeError| {
        if io_failed.load(std::sync::atomic::Ordering::SeqCst) {
            DecodeError::Unreadable(e.to_string())
        } else {
            e
        }
    };
    
    let mut hint = Hint::new();
    if let Some(ext) = path.extension() {
        hint.with_extension(&ext.to_string_lossy());
    }
    
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions { enable_gapless: GAPLESS, ..Default::default() },
            &MetadataOptions::default(),
        )
        .map_err(|e| classify(DecodeError::of(&e, format!("Failed to probe audio format: {}", e))))?;
    
    let mut format_reader = probed.format;
    
    let track = format_reader
        .default_track()
        .ok_or_else(|| DecodeError::Undecodable("No audio tracks found".to_string()))?;
    
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let time_base = track.codec_params.time_base;
    
    // Calculate duration from frame count
    let duration_ms = if let Some(n_frames) = track.codec_params.n_frames {
        n_frames * 1000 / sample_rate as u64
    } else {
        0
    };
    
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| DecodeError::of(&e, format!("Failed to create decoder: {}", e)))?;
    
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
            Err(e) => return Err(classify(DecodeError::of(&e, format!("Error reading packet: {}", e)))),
        };
        
        // Skip packets from other tracks
        if packet.track_id() != track_id {
            continue;
        }
        
        // Decode the packet
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Silence of the packet's length keeps every later sample at its time.
                eprintln!("[decode_to_mono] Corrupted packet replaced by silence: {}", msg);
                let gap = gap_frames(packet.dur(), time_base, sample_rate);
                all_samples.resize(all_samples.len() + gap, 0.0);
                decoder.reset();
                continue;
            }
            Err(e) => return Err(classify(DecodeError::of(&e, format!("Decode error: {}", e)))),
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

/// Decode an entire audio file to mono f32 samples.
/// 
/// This is the foundation for all DSP analysis in RecoDeck.
/// It reads the full file, decodes all packets, converts to f32,
/// and mixes down to mono (if stereo/multichannel).
///
/// The samples are NOT resampled — they stay at the file's native sample rate.
/// Individual analysis modules can resample if needed (e.g., to 16kHz for AI models).
pub fn decode_to_mono(path: &Path) -> Result<MonoAudio, String> {
    decode_to_mono_typed(path).map_err(|e| e.to_string())
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
    fn a_failed_packet_is_silence_of_its_length() {
        use symphonia::core::units::TimeBase;
        assert_eq!(gap_frames(1152, Some(TimeBase::new(1, 44100)), 44100), 1152);
        assert_eq!(gap_frames(1024, Some(TimeBase::new(1, 48000)), 48000), 1024);
        // A time base finer than the sample rate.
        assert_eq!(gap_frames(2048, Some(TimeBase::new(1, 96000)), 48000), 1024);
        // No time base: one frame per tick.
        assert_eq!(gap_frames(576, None, 44100), 576);
        // A corrupt header cannot ask for an endless gap.
        assert_eq!(gap_frames(u32::MAX as u64, Some(TimeBase::new(1, 1)), 44100), 441_000);
    }

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

    #[test]
    fn a_path_that_cannot_be_read_is_transient_and_garbage_is_not() {
        let dir = tempfile::TempDir::new().unwrap();

        // A directory opens but cannot be read.
        let e = decode_to_mono_typed(dir.path()).unwrap_err();
        assert!(e.is_transient(), "a directory: {e}");

        // A file that cannot be opened (permission removed).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let locked = dir.path().join("locked.mp3");
            std::fs::write(&locked, vec![7u8; 4096]).unwrap();
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
            if std::fs::File::open(&locked).is_err() {
                let e = decode_to_mono_typed(&locked).unwrap_err();
                assert!(e.is_transient(), "no permission: {e}");
            }
        }

        // A file that opens but is no audio.
        let garbage = dir.path().join("garbage.mp3");
        let bytes: Vec<u8> = (0..20_000u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
        std::fs::write(&garbage, bytes).unwrap();
        let e = decode_to_mono_typed(&garbage).unwrap_err();
        assert!(!e.is_transient(), "garbage: {e}");
        // The string API keeps working for the other callers.
        assert!(decode_to_mono(&garbage).is_err());
    }
}
