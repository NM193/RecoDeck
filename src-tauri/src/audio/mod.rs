// Audio processing (DSP)
// Modules: decoder, bpm, key, waveform, spectrogram, loudness, fingerprint

pub mod decoder;
pub mod bpm;
pub mod key;
pub mod onset;
// Only the eval tool measures with these.
#[cfg(any(feature = "eval", test))]
pub mod scoring;
pub mod waveform;

#[cfg(test)]
pub(crate) mod test_signals;

/// The version of BPM, key and grid detection. A track analysed with an
/// older one, never analysed, or only tagged needs analysis (spec 2026-10-17,
/// §4). Raise it when detection changes enough to be worth a re-analysis.
pub const ANALYSIS_VERSION: i64 = 1;

/// Seconds one core spends on a track (decode, BPM, key), from recodeck-eval:
/// the re-analysis estimate (spec §5). Measured 2026-10-18: 1.81 s on a quiet
/// machine (p3-final), 1.93 s with other work running (p4-final).
pub const SECONDS_PER_TRACK: f64 = 1.9;

/// Get MIME type for an audio file based on its extension.
/// Shared across stream:// protocol handler (lib.rs) and companion server streaming (streaming.rs).
pub fn audio_mime_type(path: &str) -> &'static str {
    match std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("aiff") | Some("aif") => "audio/aiff",
        _ => "application/octet-stream",
    }
}
