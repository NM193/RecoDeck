// src-tauri/src/formats/rekordbox.rs
// Rekordbox XML (spec: Export to DJ Software → Rekordbox XML): the collection
// of the exported tracks and the playlists under a RecoDeck folder, loaded in
// Rekordbox through Preferences → Advanced → Database → rekordbox xml.

use std::fmt::Write;
use std::path::Path;

/// `file://localhost` and the path, every byte outside the unreserved set
/// percent-encoded and `/` kept. The path keeps the Unicode normalization it
/// has on disk. A Windows path keeps its drive: file://localhost/C:/Music/a.mp3.
pub fn location(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let (drive, rest) = match unified.as_bytes() {
        [letter, b':', b'/', ..] if letter.is_ascii_alphabetic() => unified.split_at(2),
        _ => ("", unified.as_str()),
    };
    let mut out = String::from("file://localhost");
    if !drive.is_empty() {
        out.push('/');
        out.push_str(drive);
    }
    for byte in rest.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => out.push(byte as char),
            _ => {
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
}

/// Rekordbox's file kind, from the stored format or else the file's extension.
fn kind(format: Option<&str>, path: &str) -> String {
    let ext = format
        .map(str::to_string)
        .or_else(|| Path::new(path).extension().map(|e| e.to_string_lossy().to_string()))
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "" => String::new(),
        "mp3" => "MP3 File".into(),
        "wav" | "wave" => "WAV File".into(),
        "aif" | "aiff" => "AIFF File".into(),
        "flac" => "FLAC File".into(),
        "m4a" | "mp4" | "aac" | "alac" => "M4A File".into(),
        other => format!("{} File", other.to_ascii_uppercase()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_mac_path_is_percent_encoded() {
        assert_eq!(
            location("/Users/dj/Music/Čeh & # 100%.mp3"),
            "file://localhost/Users/dj/Music/%C4%8Ceh%20%26%20%23%20100%25.mp3"
        );
        assert_eq!(location("/a/(Original Mix).mp3"), "file://localhost/a/%28Original%20Mix%29.mp3");
    }

    #[test]
    fn a_decomposed_name_stays_decomposed() {
        // "č" as c + combining caron (NFD), as macOS can store it.
        assert_eq!(location("/m/c\u{30C}.mp3"), "file://localhost/m/c%CC%8C.mp3");
    }

    #[test]
    fn a_windows_path_keeps_its_drive() {
        assert_eq!(location(r"C:\Music\Warm up.flac"), "file://localhost/C:/Music/Warm%20up.flac");
        assert_eq!(location("d:/x.mp3"), "file://localhost/d:/x.mp3");
    }

    #[test]
    fn the_kind_comes_from_the_format_or_the_extension() {
        assert_eq!(kind(Some("mp3"), "/a.x"), "MP3 File");
        assert_eq!(kind(Some("AIFF"), "/a.x"), "AIFF File");
        assert_eq!(kind(None, "/a/b.flac"), "FLAC File");
        assert_eq!(kind(Some("ogg"), "/a.ogg"), "OGG File");
        assert_eq!(kind(None, "/a/noext"), "");
    }
}
