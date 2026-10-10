// src-tauri/src/formats/keys.rs
// Keys for the DJ programs. Analysis stores Camelot ("8A"); each program wants
// its own notation: Rekordbox a name ("Am"), Traktor a number.

const MINOR: [&str; 12] = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "Dbm"];
const MAJOR: [&str; 12] = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

/// Traktor's MUSICAL_KEY values by Camelot number: 0–11 are C…B major and
/// 12–23 C…B minor (checked against Traktor 3.11.1's own collection).
const TRAKTOR_MINOR: [u8; 12] = [20, 15, 22, 17, 12, 19, 14, 21, 16, 23, 18, 13];
const TRAKTOR_MAJOR: [u8; 12] = [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4];

/// Camelot to the classic notation Rekordbox shows ("8A" → "Am"); None for
/// anything that is not one of the 24 codes.
pub fn rekordbox_tonality(camelot: &str) -> Option<&'static str> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(if minor { MINOR[number - 1] } else { MAJOR[number - 1] })
}

/// Camelot to Traktor's MUSICAL_KEY value ("8A" → 21, A minor); None for
/// anything that is not one of the 24 codes.
pub fn traktor_key(camelot: &str) -> Option<u8> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(if minor { TRAKTOR_MINOR[number - 1] } else { TRAKTOR_MAJOR[number - 1] })
}

/// "8A" → (8, true); "12b" → (12, false). Spaces and case do not matter.
fn parse_camelot(code: &str) -> Option<(usize, bool)> {
    let code = code.trim().to_ascii_uppercase();
    let minor = match code.chars().last()? {
        'A' => true,
        'B' => false,
        _ => return None,
    };
    let number: usize = code[..code.len() - 1].parse().ok()?;
    (1..=12).contains(&number).then_some((number, minor))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_24_codes_map_to_rekordbox_keys() {
        let minor: Vec<_> = (1..=12).map(|n| rekordbox_tonality(&format!("{n}A")).unwrap()).collect();
        let major: Vec<_> = (1..=12).map(|n| rekordbox_tonality(&format!("{n}B")).unwrap()).collect();
        assert_eq!(minor, MINOR);
        assert_eq!(major, MAJOR);
        assert_eq!(rekordbox_tonality("8A"), Some("Am"));
        assert_eq!(rekordbox_tonality("8B"), Some("C"));
        assert_eq!(rekordbox_tonality("11A"), Some("F#m"));
    }

    #[test]
    fn spaces_and_case_do_not_matter() {
        assert_eq!(rekordbox_tonality(" 12b "), Some("E"));
    }

    #[test]
    fn anything_else_has_no_key() {
        for bad in ["", "A", "0A", "13A", "8C", "Am", "8", "-1A"] {
            assert_eq!(rekordbox_tonality(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn all_24_codes_map_to_traktor_keys() {
        // Each step round the Camelot wheel is a fifth (7 semitones), 8B is C (0),
        // and a minor key is its relative major's root + 9, counted from 12.
        for n in 1..=12usize {
            let major = (7 * (n + 4) % 12) as u8;
            assert_eq!(traktor_key(&format!("{n}B")), Some(major), "{n}B");
            assert_eq!(traktor_key(&format!("{n}A")), Some(12 + (major + 9) % 12), "{n}A");
        }
    }

    #[test]
    fn traktor_keys_match_what_traktor_wrote() {
        // From a Traktor 3.11.1 collection: its Open Key text beside its value.
        assert_eq!(traktor_key("8A"), Some(21)); // 1m, A minor
        assert_eq!(traktor_key("6B"), Some(10)); // 11d, B♭ major
        assert_eq!(traktor_key("1A"), Some(20)); // 6m, G♯ minor
        assert_eq!(traktor_key("5A"), Some(12)); // 10m, C minor
        assert_eq!(traktor_key("12A"), Some(13)); // 5m, C♯ minor
        assert_eq!(traktor_key("7A"), Some(14)); // 12m, D minor
    }

    #[test]
    fn anything_else_has_no_traktor_key() {
        for bad in ["", "A", "0A", "13A", "8C", "Am", "8", "-1A"] {
            assert_eq!(traktor_key(bad), None, "{bad:?}");
        }
    }
}
