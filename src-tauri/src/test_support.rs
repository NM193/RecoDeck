//! Helpers shared by tests in several modules.

use std::path::Path;

/// Writes a silent 8 kHz mono 16-bit WAV of `millis` length that lofty can
/// read. `seed` fills the samples, so two files with the same length can still
/// have different content (and hash).
pub fn write_wav(path: &Path, millis: u32, seed: u8) {
    let rate: u32 = 8000;
    let data_len = rate * 2 * millis / 1000;
    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, seed);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}

/// Like `write_wav`, plus a RIFF INFO tag whose item claims more bytes than
/// it has: lofty's normal read fails with "invalid item size", as on real
/// files with damaged tags. The audio itself is fine.
pub fn write_wav_with_broken_tag(path: &Path, millis: u32, seed: u8) {
    write_wav(path, millis, seed);
    let mut bytes = std::fs::read(path).unwrap();
    let mut info = b"INFO".to_vec();
    info.extend_from_slice(b"INAM");
    info.extend_from_slice(&500u32.to_le_bytes());
    info.extend_from_slice(b"Title\0");
    bytes.extend_from_slice(b"LIST");
    bytes.extend_from_slice(&(info.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&info);
    let riff_len = (bytes.len() - 8) as u32;
    bytes[4..8].copy_from_slice(&riff_len.to_le_bytes());
    std::fs::write(path, bytes).unwrap();
}
