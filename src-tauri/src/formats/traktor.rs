// src-tauri/src/formats/traktor.rs
// Traktor NML (spec: Export to DJ Software → Traktor NML): the collection of
// the exported tracks and the playlists under a RecoDeck folder, loaded in
// Traktor through right-click Playlists → Import Playlist. The shape follows
// Traktor 3.11.1's own files (fixtures/traktor_real.nml).

use super::{keys, xml::attr, ExportLibrary, ExportNode, ExportTrack};
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use unicode_normalization::UnicodeNormalization;

/// Where Traktor files a track: the volume, the folders in its `/:` form, the file.
#[derive(Debug, Clone, PartialEq)]
pub struct TraktorLocation {
    pub volume: String,
    pub dir: String,
    pub file: String,
}

impl TraktorLocation {
    /// How a playlist refers to the track: VOLUME + DIR + FILE.
    pub fn key(&self) -> String {
        format!("{}{}{}", self.volume, self.dir, self.file)
    }
}

/// A path as Traktor stores it. The volume is the drive in a Windows path
/// ("C:"), the name after /Volumes/ for an external drive, else the boot
/// volume. Names are NFC, as Traktor writes them even when a name is
/// decomposed on disk; in any other form the track would be new to Traktor.
pub fn location(path: &str, boot_volume: &str) -> TraktorLocation {
    let path: String = path.nfc().collect();
    let windows = matches!(path.as_bytes(), [l, b':', b'\\' | b'/', ..] if l.is_ascii_alphabetic());
    let (volume, rest) = if windows {
        (path[..2].to_string(), path[2..].replace('\\', "/"))
    } else if let Some((name, rest)) = path.strip_prefix("/Volumes/").and_then(|p| p.split_once('/')) {
        (name.to_string(), format!("/{rest}"))
    } else {
        (boot_volume.nfc().collect(), path.clone())
    };
    let (folders, file) = rest.rsplit_once('/').unwrap_or(("", rest.as_str()));
    let mut dir: String = folders.split('/').filter(|f| !f.is_empty()).map(|f| format!("/:{f}")).collect();
    dir.push_str("/:");
    TraktorLocation { volume, dir, file: file.to_string() }
}

/// The whole file. Tracks whose file is gone are left out of the collection
/// and of every playlist.
pub fn write(lib: &ExportLibrary, boot_volume: &str) -> String {
    let tracks: Vec<(&ExportTrack, TraktorLocation)> = lib
        .tracks
        .iter()
        .filter(|t| t.exists)
        .map(|t| (t, location(&t.path, boot_volume)))
        .collect();
    let primary_keys: HashMap<i64, String> = tracks.iter().map(|(t, at)| (t.id, at.key())).collect();
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n");
    out.push_str("<NML VERSION=\"19\"><HEAD COMPANY=\"www.native-instruments.com\" PROGRAM=\"Traktor\"></HEAD>\n");
    // One file stored twice (composed and decomposed paths) is one entry for Traktor.
    let mut written: HashSet<String> = HashSet::new();
    let mut entries = String::new();
    for (track, at) in &tracks {
        if written.insert(at.key()) {
            write_entry(&mut entries, track, at);
        }
    }
    let _ = write!(out, "<COLLECTION ENTRIES=\"{}\">", written.len());
    out.push_str(&entries);
    out.push_str("</COLLECTION>\n");
    out.push_str("<SETS ENTRIES=\"0\"></SETS>\n");
    out.push_str("<PLAYLISTS><NODE TYPE=\"FOLDER\" NAME=\"$ROOT\"><SUBNODES COUNT=\"1\">");
    let _ = write!(out, "<NODE TYPE=\"FOLDER\" NAME=\"RecoDeck\"><SUBNODES COUNT=\"{}\">", lib.tree.len());
    for node in &lib.tree {
        write_node(&mut out, node, &primary_keys);
    }
    out.push_str("</SUBNODES>\n</NODE>\n</SUBNODES>\n</NODE>\n</PLAYLISTS>\n");
    out.push_str("<INDEXING></INDEXING>\n</NML>\n");
    out
}

/// One collection entry. Its elements and INFO's attributes come in the order
/// Traktor writes them, and, as Traktor does, what is empty is left out.
/// Not written: MODIFIED_DATE (Traktor would take the entry as newer than its
/// own), FLAGS, LOCK, INFO KEY (a tag's text), cues and loudness.
fn write_entry(out: &mut String, t: &ExportTrack, at: &TraktorLocation) {
    out.push_str("<ENTRY");
    if let Some(title) = filled(&t.title) {
        let _ = write!(out, " TITLE=\"{}\"", text(title));
    }
    if let Some(artist) = filled(&t.artist) {
        let _ = write!(out, " ARTIST=\"{}\"", text(artist));
    }
    let _ = writeln!(
        out,
        "><LOCATION DIR=\"{}\" FILE=\"{}\" VOLUME=\"{volume}\" VOLUMEID=\"{volume}\"></LOCATION>",
        text(&at.dir),
        text(&at.file),
        volume = text(&at.volume),
    );
    let number = t.track_number.filter(|n| *n > 0);
    let album = filled(&t.album);
    if number.is_some() || album.is_some() {
        out.push_str("<ALBUM");
        if let Some(number) = number {
            let _ = write!(out, " TRACK=\"{number}\"");
        }
        if let Some(album) = album {
            let _ = write!(out, " TITLE=\"{}\"", text(album));
        }
        out.push_str("></ALBUM>\n");
    }
    out.push_str("<INFO");
    for (name, value) in info(t) {
        let _ = write!(out, " {name}=\"{}\"", text(&value));
    }
    out.push_str("></INFO>\n");
    if let Some(bpm) = t.bpm.filter(|bpm| bpm.is_finite() && *bpm > 0.0) {
        let _ = writeln!(out, "<TEMPO BPM=\"{bpm:.6}\" BPM_QUALITY=\"100.000000\"></TEMPO>");
    }
    if let Some(key) = t.camelot.as_deref().and_then(keys::traktor_key) {
        let _ = writeln!(out, "<MUSICAL_KEY VALUE=\"{key}\"></MUSICAL_KEY>");
    }
    out.push_str("</ENTRY>\n");
}

/// INFO's attributes in Traktor's order and units: bit/s, stars × 51, dates as 2026/9/1, and KiB and whole seconds rounded up, as in Traktor's own collection.
fn info(t: &ExportTrack) -> Vec<(&'static str, String)> {
    let mut info = Vec::new();
    if let Some(kbps) = t.bitrate.filter(|kbps| *kbps > 0) {
        info.push(("BITRATE", (i64::from(kbps) * 1000).to_string()));
    }
    if let Some(genre) = filled(&t.genre) {
        info.push(("GENRE", genre.to_string()));
    }
    if let Some(label) = filled(&t.label) {
        info.push(("LABEL", label.to_string()));
    }
    if let Some(comment) = filled(&t.comment) {
        info.push(("COMMENT", comment.to_string()));
    }
    if t.play_count > 0 {
        info.push(("PLAYCOUNT", t.play_count.to_string()));
    }
    if let Some(ms) = t.duration_ms.filter(|ms| *ms > 0) {
        let seconds = f64::from(ms) / 1000.0;
        info.push(("PLAYTIME", ((i64::from(ms) + 999) / 1000).to_string()));
        info.push(("PLAYTIME_FLOAT", format!("{seconds:.6}")));
    }
    if t.rating > 0 {
        info.push(("RANKING", (t.rating.min(5) * 51).to_string()));
    }
    if let Some(date) = t.date_added.as_deref().and_then(traktor_date) {
        info.push(("IMPORT_DATE", date));
    }
    if let Some(year) = t.year.filter(|year| *year > 0) {
        info.push(("RELEASE_DATE", format!("{year}/1/1")));
    }
    if let Some(bytes) = t.file_size.filter(|bytes| *bytes > 0) {
        info.push(("FILESIZE", ((bytes + 1023) / 1024).to_string()));
    }
    info
}

/// A folder with its children, or a playlist that refers to collection
/// entries by their VOLUME + DIR + FILE.
fn write_node(out: &mut String, node: &ExportNode, primary_keys: &HashMap<i64, String>) {
    match node {
        ExportNode::Folder { name, children } => {
            let _ = write!(out, "<NODE TYPE=\"FOLDER\" NAME=\"{}\"><SUBNODES COUNT=\"{}\">", text(name), children.len());
            for child in children {
                write_node(out, child, primary_keys);
            }
            out.push_str("</SUBNODES>\n</NODE>\n");
        }
        ExportNode::Playlist { id, name, track_ids } => {
            let entries: Vec<&String> = track_ids.iter().filter_map(|id| primary_keys.get(id)).collect();
            let _ = write!(
                out,
                "<NODE TYPE=\"PLAYLIST\" NAME=\"{}\"><PLAYLIST ENTRIES=\"{}\" TYPE=\"LIST\" UUID=\"{}\">",
                text(name),
                entries.len(),
                playlist_uuid(*id),
            );
            for key in entries {
                let _ = writeln!(out, "<ENTRY><PRIMARYKEY TYPE=\"TRACK\" KEY=\"{}\"></PRIMARYKEY>", text(key));
                out.push_str("</ENTRY>\n");
            }
            out.push_str("</PLAYLIST>\n</NODE>\n");
        }
    }
}

/// A playlist's UUID: "recodeck" in hex, then its id — 32 hex digits like
/// Traktor's own, the same on every export.
fn playlist_uuid(id: i64) -> String {
    format!("7265636f6465636b{id:016x}")
}

/// SQLite's "2026-09-01 12:30:00" as Traktor's "2026/9/1".
fn traktor_date(datetime: &str) -> Option<String> {
    let mut parts = datetime.get(..10)?.split('-');
    let year: u32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    Some(format!("{year}/{month}/{day}"))
}

/// An attribute value as Traktor writes it: escaped, but `'` kept as it is.
fn text(value: &str) -> String {
    attr(value).replace("&apos;", "'")
}

fn filled(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::{ExportLibrary, ExportNode, ExportTrack};

    const BOOT: &str = "Macintosh HD";
    const REAL: &str = include_str!("fixtures/traktor_real.nml");

    fn loc(volume: &str, dir: &str, file: &str) -> TraktorLocation {
        TraktorLocation { volume: volume.into(), dir: dir.into(), file: file.into() }
    }

    #[test]
    fn a_file_on_the_boot_disk_is_on_the_boot_volume() {
        let at = location("/Users/dj/Music/a.mp3", BOOT);
        assert_eq!(at, loc("Macintosh HD", "/:Users/:dj/:Music/:", "a.mp3"));
        assert_eq!(at.key(), "Macintosh HD/:Users/:dj/:Music/:a.mp3");
    }

    #[test]
    fn a_file_on_an_external_drive_is_on_that_volume() {
        assert_eq!(location("/Volumes/USB Stick/Sets/b.aiff", BOOT), loc("USB Stick", "/:Sets/:", "b.aiff"));
        assert_eq!(location("/Volumes/USB/a.mp3", BOOT), loc("USB", "/:", "a.mp3"));
    }

    #[test]
    fn a_windows_path_is_on_its_drive() {
        assert_eq!(location(r"C:\Music\Warm up.flac", BOOT), loc("C:", "/:Music/:", "Warm up.flac"));
        assert_eq!(location("d:/x.mp3", BOOT), loc("d:", "/:", "x.mp3"));
    }

    #[test]
    fn names_are_composed_as_traktor_writes_them() {
        // "č" as c + combining caron (NFD), as macOS can store it; Traktor writes "č".
        assert_eq!(location("/m/c\u{30C}/c\u{30C}.mp3", BOOT), loc("Macintosh HD", "/:m/:\u{10D}/:", "\u{10D}.mp3"));
    }

    #[test]
    fn a_backslash_in_a_mac_name_is_part_of_the_name() {
        assert_eq!(location("/Music/AC\\DC.mp3", BOOT), loc("Macintosh HD", "/:Music/:", "AC\\DC.mp3"));
    }

    #[test]
    fn a_real_track_gets_the_location_traktor_gave_it() {
        let at = location(
            "/Users/dj/Music/Set B/Artist Five - Track Three (Extended Mix) [Label Three].mp3",
            BOOT,
        );
        let element = format!(
            "<LOCATION DIR=\"{}\" FILE=\"{}\" VOLUME=\"{v}\" VOLUMEID=\"{v}\"></LOCATION>",
            at.dir,
            at.file,
            v = at.volume
        );
        assert!(REAL.contains(&element), "{element}");
        let key = format!("<PRIMARYKEY TYPE=\"TRACK\" KEY=\"{}\"></PRIMARYKEY>", at.key());
        assert!(REAL.contains(&key), "{key}");
    }

    #[test]
    fn dates_take_traktors_form() {
        assert_eq!(traktor_date("2026-09-01 12:30:00").as_deref(), Some("2026/9/1"));
        assert_eq!(traktor_date("2026-10-04").as_deref(), Some("2026/10/4"));
        assert_eq!(traktor_date("<2026-09-01>"), None);
        assert_eq!(traktor_date(""), None);
    }

    #[test]
    fn a_playlist_uuid_is_its_id_in_32_hex_digits() {
        assert_eq!(playlist_uuid(10), "7265636f6465636b000000000000000a");
        assert_eq!(playlist_uuid(i64::from(u32::MAX)).len(), 32);
    }

    fn sample() -> ExportLibrary {
        let t1 = ExportTrack {
            id: 1,
            // "Č" decomposed, as macOS can store it: written composed.
            path: "/Users/dj/Music/C\u{30C}eh & Don't # 100%.mp3".into(),
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
            file_size: Some(9_999_800),
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
        let t4 = ExportTrack {
            id: 4,
            path: "/Volumes/USB Stick/Sets/b.aiff".into(),
            exists: true,
            title: Some("B".into()),
            bpm: Some(126.5),
            camelot: Some("12B".into()),
            ..ExportTrack::default()
        };
        ExportLibrary {
            tracks: vec![t1, t2, t3, t4],
            tree: vec![
                ExportNode::Folder {
                    name: "Gigs & Raves".into(),
                    children: vec![ExportNode::Playlist { id: 10, name: "Friday".into(), track_ids: vec![1, 2, 3, 4] }],
                },
                ExportNode::Playlist { id: 11, name: "Warm-up".into(), track_ids: vec![2] },
            ],
        }
    }

    #[test]
    fn odd_values_are_left_out_or_kept_in_range() {
        let lib = ExportLibrary {
            tracks: vec![
                ExportTrack { id: 1, path: "/a.mp3".into(), exists: true, bpm: Some(f64::NAN), rating: 9, ..ExportTrack::default() },
                ExportTrack { id: 2, path: "/b.mp3".into(), exists: true, bpm: Some(f64::INFINITY), ..ExportTrack::default() },
                ExportTrack { id: 3, path: "/c.mp3".into(), exists: true, bpm: Some(0.0), ..ExportTrack::default() },
                ExportTrack { id: 4, path: "/gone.mp3".into(), exists: false, ..ExportTrack::default() },
            ],
            tree: vec![ExportNode::Playlist { id: 1, name: "Gone".into(), track_ids: vec![4] }],
        };
        let nml = write(&lib, BOOT);
        assert!(!nml.contains("<TEMPO"), "{nml}");
        // A track without a title has none, as in Traktor's own files.
        assert!(nml.contains("<ENTRY><LOCATION DIR=\"/:\" FILE=\"a.mp3\""), "{nml}");
        assert!(nml.contains("RANKING=\"255\""), "{nml}");
        // A playlist whose files are all gone is written empty.
        assert!(nml.contains("<PLAYLIST ENTRIES=\"0\" TYPE=\"LIST\" UUID=\"7265636f6465636b0000000000000001\"></PLAYLIST>\n"), "{nml}");
    }

    #[test]
    fn one_file_stored_twice_is_one_entry() {
        // The same file as a composed and a decomposed path.
        let lib = ExportLibrary {
            tracks: vec![
                ExportTrack { id: 1, path: "/m/\u{10D}.mp3".into(), exists: true, ..ExportTrack::default() },
                ExportTrack { id: 2, path: "/m/c\u{30C}.mp3".into(), exists: true, ..ExportTrack::default() },
            ],
            tree: vec![ExportNode::Playlist { id: 5, name: "Set".into(), track_ids: vec![1, 2] }],
        };
        let nml = write(&lib, BOOT);
        assert!(nml.contains("<COLLECTION ENTRIES=\"1\">"), "{nml}");
        assert_eq!(nml.matches("<LOCATION ").count(), 1, "{nml}");
        assert!(nml.contains("<PLAYLIST ENTRIES=\"2\""), "{nml}");
    }

    #[test]
    fn the_boot_volume_name_is_composed_too() {
        assert_eq!(location("/a.mp3", "Disque E\u{301}").volume, "Disque \u{C9}");
    }

    #[test]
    fn the_file_matches_the_golden_sample() {
        assert_eq!(write(&sample(), BOOT), include_str!("fixtures/traktor_sample.nml"));
    }

    #[test]
    fn it_starts_as_a_real_traktor_file_does() {
        let head = |nml: &str| nml.lines().take(2).collect::<Vec<_>>().join("\n");
        assert_eq!(head(&write(&sample(), BOOT)), head(REAL));
    }

    /// Attribute names of the first `<tag …>` element, in order. Values hold no raw quote.
    fn attribute_names(nml: &str, tag: &str) -> Vec<String> {
        let open = format!("<{tag} ");
        let start = nml.find(&open).expect("the element") + open.len();
        let end = start + nml[start..].find('>').expect("a closed element");
        nml[start..end]
            .split('"')
            .step_by(2)
            .map(|name| name.trim().trim_end_matches('=').to_string())
            .filter(|name| !name.is_empty())
            .collect()
    }

    /// The elements inside the collection's first entry, in order.
    fn entry_elements(nml: &str) -> Vec<String> {
        let start = nml.find("<ENTRY ").expect("an entry");
        let end = start + nml[start..].find("</ENTRY>").expect("a closed entry");
        nml[start..end]
            .split('<')
            .skip(2)
            .filter(|piece| !piece.starts_with('/'))
            .map(|piece| piece.split([' ', '>']).next().unwrap_or("").to_string())
            .collect()
    }

    /// Every name of `ours` comes in `real`, in the same order.
    fn in_order(ours: &[String], real: &[String]) -> bool {
        let mut rest = real.iter();
        ours.iter().all(|name| rest.any(|r| r == name))
    }

    #[test]
    fn an_entry_follows_the_order_of_a_real_traktor_file() {
        let ours = write(&sample(), BOOT);
        for tag in ["ENTRY", "INFO"] {
            let (o, r) = (attribute_names(&ours, tag), attribute_names(REAL, tag));
            assert!(in_order(&o, &r), "{tag}: {o:?} is not in the order of {r:?}");
        }
        // The sample's first track carries everything RecoDeck writes.
        assert_eq!(attribute_names(&ours, "INFO").len(), 11);
        assert_eq!(attribute_names(&ours, "LOCATION"), attribute_names(REAL, "LOCATION"));
        let (o, r) = (entry_elements(&ours), entry_elements(REAL));
        assert_eq!(o, ["LOCATION", "ALBUM", "INFO", "TEMPO", "MUSICAL_KEY"]);
        assert!(in_order(&o, &r), "{o:?} is not in the order of {r:?}");
    }
}
