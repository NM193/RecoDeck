// src-tauri/src/formats/keys.rs
// Keys for the DJ programs. Analysis stores Camelot ("8A"); each program wants
// its own notation.

const MINOR: [&str; 12] = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "Dbm"];
const MAJOR: [&str; 12] = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

/// Camelot to the classic notation Rekordbox shows ("8A" → "Am"); None for
/// anything that is not one of the 24 codes.
pub fn rekordbox_tonality(camelot: &str) -> Option<&'static str> {
    let (number, minor) = parse_camelot(camelot)?;
    Some(if minor { MINOR[number - 1] } else { MAJOR[number - 1] })
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
}
