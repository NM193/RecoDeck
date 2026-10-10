// src-tauri/src/formats/traktor.rs
// Traktor NML (spec: Export to DJ Software → Traktor NML): the collection of
// the exported tracks and the playlists under a RecoDeck folder, loaded in
// Traktor through right-click Playlists → Import Playlist. The shape follows
// Traktor 3.11.1's own files (fixtures/traktor_real.nml).

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
        (boot_volume.to_string(), path.clone())
    };
    let (folders, file) = rest.rsplit_once('/').unwrap_or(("", rest.as_str()));
    let mut dir: String = folders.split('/').filter(|f| !f.is_empty()).map(|f| format!("/:{f}")).collect();
    dir.push_str("/:");
    TraktorLocation { volume, dir, file: file.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
