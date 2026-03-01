// Audio processing (DSP)
// Modules: decoder, bpm, key, waveform, spectrogram, loudness, fingerprint

pub mod decoder;
pub mod bpm;
pub mod key;
pub mod waveform;

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
