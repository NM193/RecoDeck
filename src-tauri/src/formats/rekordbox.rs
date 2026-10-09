// src-tauri/src/formats/rekordbox.rs
// Rekordbox XML (spec: Export to DJ Software → Rekordbox XML): the collection
// of the exported tracks and the playlists under a RecoDeck folder, loaded in
// Rekordbox through Preferences → Advanced → Database → rekordbox xml.

use super::{keys, xml::attr, ExportLibrary, ExportNode, ExportTrack};
use std::collections::HashSet;
use std::fmt::Write;
use std::path::Path;

/// The whole file. Tracks whose file is gone are left out of the collection
/// and of every playlist.
pub fn write(lib: &ExportLibrary, app_version: &str) -> String {
    let present = lib.present();
    let tracks: Vec<&ExportTrack> = lib.tracks.iter().filter(|t| t.exists).collect();
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str("<DJ_PLAYLISTS Version=\"1.0.0\">\n");
    let _ = writeln!(out, "  <PRODUCT Name=\"RecoDeck\" Version=\"{}\" Company=\"RecoDeck\"/>", attr(app_version));
    let _ = writeln!(out, "  <COLLECTION Entries=\"{}\">", tracks.len());
    for track in tracks {
        write_track(&mut out, track);
    }
    out.push_str("  </COLLECTION>\n");
    out.push_str("  <PLAYLISTS>\n");
    out.push_str("    <NODE Type=\"0\" Name=\"ROOT\" Count=\"1\">\n");
    let _ = writeln!(out, "      <NODE Type=\"0\" Name=\"RecoDeck\" Count=\"{}\">", lib.tree.len());
    for node in &lib.tree {
        write_node(&mut out, node, &present, 4);
    }
    out.push_str("      </NODE>\n");
    out.push_str("    </NODE>\n");
    out.push_str("  </PLAYLISTS>\n");
    out.push_str("</DJ_PLAYLISTS>\n");
    out
}

/// One collection entry, its attributes in the order Rekordbox writes them.
fn write_track(out: &mut String, t: &ExportTrack) {
    let text = |value: &Option<String>| attr(value.as_deref().unwrap_or(""));
    let _ = writeln!(
        out,
        "    <TRACK TrackID=\"{id}\" Name=\"{name}\" Artist=\"{artist}\" Composer=\"\" Album=\"{album}\" Grouping=\"\" Genre=\"{genre}\" Kind=\"{kind}\" Size=\"{size}\" TotalTime=\"{time}\" DiscNumber=\"0\" TrackNumber=\"{number}\" Year=\"{year}\" AverageBpm=\"{bpm:.2}\" DateAdded=\"{added}\" BitRate=\"{bitrate}\" SampleRate=\"{rate}\" Comments=\"{comment}\" PlayCount=\"{plays}\" Rating=\"{rating}\" Location=\"{location}\" Remixer=\"\" Tonality=\"{key}\" Label=\"{label}\" Mix=\"\"/>",
        id = t.id,
        name = text(&t.title),
        artist = text(&t.artist),
        album = text(&t.album),
        genre = text(&t.genre),
        kind = attr(&kind(t.file_format.as_deref(), &t.path)),
        size = t.file_size.unwrap_or(0),
        time = t.duration_ms.unwrap_or(0).max(0) / 1000,
        number = t.track_number.unwrap_or(0),
        year = t.year.unwrap_or(0),
        bpm = t.bpm.unwrap_or(0.0),
        added = attr(t.date_added.as_deref().and_then(|d| d.get(..10)).unwrap_or("")),
        bitrate = t.bitrate.unwrap_or(0),
        rate = t.sample_rate.unwrap_or(0),
        comment = text(&t.comment),
        plays = t.play_count.max(0),
        rating = t.rating.clamp(0, 5) * 51,
        location = location(&t.path),
        key = t.camelot.as_deref().and_then(keys::rekordbox_tonality).unwrap_or(""),
        label = text(&t.label),
    );
}

/// A folder (Type 0) with its children, or a playlist (Type 1) that refers to
/// collection entries by TrackID (KeyType 0).
fn write_node(out: &mut String, node: &ExportNode, present: &HashSet<i64>, depth: usize) {
    let pad = "  ".repeat(depth);
    match node {
        ExportNode::Folder { name, children } => {
            let _ = writeln!(out, "{pad}<NODE Type=\"0\" Name=\"{}\" Count=\"{}\">", attr(name), children.len());
            for child in children {
                write_node(out, child, present, depth + 1);
            }
            let _ = writeln!(out, "{pad}</NODE>");
        }
        ExportNode::Playlist { name, track_ids } => {
            let ids: Vec<i64> = track_ids.iter().copied().filter(|id| present.contains(id)).collect();
            let _ = writeln!(out, "{pad}<NODE Name=\"{}\" Type=\"1\" KeyType=\"0\" Entries=\"{}\">", attr(name), ids.len());
            for id in ids {
                let _ = writeln!(out, "{pad}  <TRACK Key=\"{id}\"/>");
            }
            let _ = writeln!(out, "{pad}</NODE>");
        }
    }
}

/// `file://localhost` and the path, every byte outside the unreserved set
/// percent-encoded and `/` kept. The path keeps the Unicode normalization it
/// has on disk. A Windows path keeps its drive: file://localhost/C:/Music/a.mp3;
/// `\` becomes `/` only in a Windows-shaped path (`C:\...`), elsewhere it is a name character.
pub fn location(path: &str) -> String {
    let windows = matches!(path.as_bytes(), [l, b':', b'\\' | b'/', ..] if l.is_ascii_alphabetic());
    let unified = if windows { path.replace('\\', "/") } else { path.to_string() };
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
    use super::super::{ExportLibrary, ExportNode, ExportTrack};
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

    fn sample() -> ExportLibrary {
        let t1 = ExportTrack {
            id: 1,
            path: "/Users/dj/Music/Čeh & # 100%.mp3".into(),
            exists: true,
            title: Some("Ça & Va".into()),
            artist: Some("Nina \"N\" Kraviz".into()),
            album: Some("Trip".into()),
            genre: Some("Techno".into()),
            label: Some("Trip".into()),
            year: Some(2024),
            track_number: Some(3),
            duration_ms: Some(412_345),
            bitrate: Some(320),
            sample_rate: Some(44_100),
            file_size: Some(10_000_000),
            file_format: Some("mp3".into()),
            bpm: Some(124.0),
            camelot: Some("8A".into()),
            rating: 4,
            comment: Some("line one\nline two".into()),
            play_count: 3,
            date_added: Some("2026-09-01 12:30:00".into()),
        };
        let t2 = ExportTrack {
            id: 2,
            path: r"C:\Music\Warm up.flac".into(),
            exists: true,
            title: Some("Warm <Up>".into()),
            file_format: Some("flac".into()),
            ..ExportTrack::default()
        };
        // In a playlist, but its file is gone: left out everywhere.
        let t3 = ExportTrack { id: 3, path: "/Volumes/USB/gone.mp3".into(), exists: false, ..ExportTrack::default() };
        ExportLibrary {
            tracks: vec![t1, t2, t3],
            tree: vec![
                ExportNode::Folder {
                    name: "Gigs & Raves".into(),
                    children: vec![ExportNode::Playlist { name: "Friday".into(), track_ids: vec![1, 2, 3] }],
                },
                ExportNode::Playlist { name: "Warm-up".into(), track_ids: vec![2] },
            ],
        }
    }

    #[test]
    fn the_file_matches_the_golden_sample() {
        assert_eq!(write(&sample(), "0.0.0-test"), include_str!("fixtures/rekordbox_sample.xml"));
    }

    #[test]
    fn a_backslash_in_a_mac_name_is_part_of_the_name() {
        assert_eq!(location("/Music/AC\\DC - Live.mp3"), "file://localhost/Music/AC%5CDC%20-%20Live.mp3");
    }

    #[test]
    fn odd_formats_and_dates_are_escaped_too() {
        let lib = ExportLibrary {
            tracks: vec![ExportTrack {
                id: 9,
                path: "/a/b.x".into(),
                exists: true,
                file_format: Some("a&b\"c".into()),
                date_added: Some("<2026-09-01>".into()),
                ..ExportTrack::default()
            }],
            tree: vec![],
        };
        let xml = write(&lib, "t");
        assert!(xml.contains("Kind=\"A&amp;B&quot;C File\""), "{xml}");
        assert!(xml.contains("DateAdded=\"&lt;2026-09-0\""), "{xml}");
    }
}
