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

/// Traktor's MUSICAL_KEY value to Camelot (21 → "8A"); None outside 0–23.
pub fn camelot_from_traktor(value: u8) -> Option<String> {
    let (table, letter) = match value {
        0..=11 => (&TRAKTOR_MAJOR, 'B'),
        12..=23 => (&TRAKTOR_MINOR, 'A'),
        _ => return None,
    };
    let number = table.iter().position(|&v| v == value)? + 1;
    Some(format!("{number}{letter}"))
}

/// A key tag as DJ software writes it, to Camelot: Camelot ("8A", "08a"),
/// Open Key ("1m", "6d") or a name ("Am", "A minor", "Amin", "F#m", "Gbm",
/// "C", "C major", "Cmaj", "Db", with ♯/♭ too). None for anything else.
pub fn camelot_from_tag(tag: &str) -> Option<String> {
    let tag = tag.trim();
    if tag.starts_with(|c: char| c.is_ascii_digit()) {
        let letter = tag.chars().last()?;
        let number: usize = tag[..tag.len() - letter.len_utf8()].parse().ok()?;
        if !(1..=12).contains(&number) {
            return None;
        }
        // Open Key counts from C (1d) where Camelot counts from B (1B): 1d is 8B.
        let from_open = (number + 6) % 12 + 1;
        return match letter.to_ascii_uppercase() {
            'A' => Some(format!("{number}A")),
            'B' => Some(format!("{number}B")),
            'M' => Some(format!("{from_open}A")),
            'D' => Some(format!("{from_open}B")),
            _ => None,
        };
    }
    let mut chars = tag.chars();
    let root = match chars.next()?.to_ascii_uppercase() {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return None,
    };
    let rest = chars.as_str();
    let (shift, rest) = match rest.chars().next() {
        Some(c @ ('#' | '♯')) => (1, &rest[c.len_utf8()..]),
        Some(c @ ('b' | '♭')) => (11, &rest[c.len_utf8()..]),
        _ => (0, rest),
    };
    let minor = match rest.trim().to_ascii_lowercase().as_str() {
        "" | "maj" | "major" => false,
        "m" | "min" | "minor" => true,
        _ => return None,
    };
    let pitch = (root + shift) % 12;
    // A minor key has its relative major's number: three semitones up.
    let number = camelot_number(if minor { (pitch + 3) % 12 } else { pitch });
    Some(format!("{number}{}", if minor { 'A' } else { 'B' }))
}

/// The Camelot number of the major key on pitch class `pitch`: C (0) is 8,
/// and each fifth up (7 semitones) is one more.
fn camelot_number(pitch: usize) -> usize {
    (7 * pitch + 7) % 12 + 1
}

/// "8A" → (8, true); "12b" → (12, false). Spaces and case do not matter.
pub(crate) fn parse_camelot(code: &str) -> Option<(usize, bool)> {
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

    #[test]
    fn traktor_values_to_camelot_and_back() {
        for n in 1..=12 {
            for letter in ["A", "B"] {
                let code = format!("{n}{letter}");
                assert_eq!(camelot_from_traktor(traktor_key(&code).unwrap()).as_deref(), Some(code.as_str()));
            }
        }
        assert_eq!(camelot_from_traktor(21).as_deref(), Some("8A"));
        assert_eq!(camelot_from_traktor(0).as_deref(), Some("8B"));
        assert_eq!(camelot_from_traktor(24), None);
    }

    #[test]
    fn key_tags_in_every_accepted_form() {
        for (tag, camelot) in [
            ("8A", "8A"), ("08a", "8A"), (" 12b ", "12B"),
            ("1m", "8A"), ("6d", "1B"), ("11d", "6B"), ("6m", "1A"), ("10m", "5A"), ("5m", "12A"), ("12m", "7A"),
            ("Am", "8A"), ("A minor", "8A"), ("Amin", "8A"), ("F#m", "11A"), ("Gbm", "11A"),
            ("F♯m", "11A"), ("G♭ minor", "11A"), ("Ebm", "2A"), ("bbm", "3A"),
            ("C", "8B"), ("C major", "8B"), ("Cmaj", "8B"), ("Db", "3B"), ("D♭", "3B"), ("C#", "3B"),
        ] {
            assert_eq!(camelot_from_tag(tag).as_deref(), Some(camelot), "{tag:?}");
        }
    }

    #[test]
    fn every_rekordbox_name_reads_back() {
        for n in 1..=12 {
            assert_eq!(camelot_from_tag(MINOR[n - 1]), Some(format!("{n}A")));
            assert_eq!(camelot_from_tag(MAJOR[n - 1]), Some(format!("{n}B")));
        }
    }

    #[test]
    fn other_key_tags_are_ignored() {
        for bad in ["", "0A", "13A", "8C", "8", "13m", "0d", "H", "Hm", "Am7", "Cmaj7", "C##", "m", "#", "o", "Ab minorr", "1 2A"] {
            assert_eq!(camelot_from_tag(bad), None, "{bad:?}");
        }
    }
}
