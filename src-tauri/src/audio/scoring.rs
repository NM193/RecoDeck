// src-tauri/src/audio/scoring.rs
// How close an analysis is to a reference (spec 2026-10-17, §1): the
// measures recodeck-eval reports. They live in the library so plain
// `cargo test` covers them.

use crate::formats::keys::parse_camelot;

/// How our BPM compares with the reference's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BpmMatch {
    /// Within ±0.05.
    Exact,
    /// Within ±0.5.
    Close,
    /// 0.5 to 1.5 off.
    OffByOne,
    /// Half or double the reference (within 1 BPM at the doubled tempo).
    HalfOrDouble,
    Other,
}

/// Labels of `signed_bucket`'s buckets, in order.
pub const SIGNED_BUCKETS: [&str; 7] =
    ["< -1.5", "-1.5 to -0.5", "-0.5 to -0.05", "±0.05", "0.05 to 0.5", "0.5 to 1.5", "> 1.5"];

/// How our key relates to the reference key, both in Camelot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeyMatch {
    Exact,
    /// One step round the wheel in the same mode: a fifth up or down.
    Fifth,
    /// The relative major or minor: same number, other letter.
    Relative,
    /// Same root, other mode (Am and A).
    Parallel,
    Other,
}

pub fn bpm_match(ours: f64, reference: f64) -> BpmMatch {
    let off = (ours - reference).abs();
    if off <= 0.05 {
        BpmMatch::Exact
    } else if off <= 0.5 {
        BpmMatch::Close
    } else if off <= 1.5 {
        BpmMatch::OffByOne
    } else if (ours - 2.0 * reference).abs() <= 1.0 || (2.0 * ours - reference).abs() <= 1.0 {
        BpmMatch::HalfOrDouble
    } else {
        BpmMatch::Other
    }
}

/// Which `SIGNED_BUCKETS` bucket a BPM error (ours − reference) falls in.
pub fn signed_bucket(error: f64) -> usize {
    match error {
        e if e < -1.5 => 0,
        e if e < -0.5 => 1,
        e if e < -0.05 => 2,
        e if e <= 0.05 => 3,
        e if e <= 0.5 => 4,
        e if e <= 1.5 => 5,
        _ => 6,
    }
}

/// None when either is not a Camelot code.
pub fn key_match(ours: &str, reference: &str) -> Option<KeyMatch> {
    let (n, minor) = parse_camelot(ours)?;
    let (r, reference_minor) = parse_camelot(reference)?;
    Some(if n == r && minor == reference_minor {
        KeyMatch::Exact
    } else if minor == reference_minor && (wheel_step(r, n) == 1 || wheel_step(n, r) == 1) {
        KeyMatch::Fifth
    } else if n == r {
        KeyMatch::Relative
    } else if minor != reference_minor && (if minor { wheel_step(n, r) } else { wheel_step(r, n) }) == 3 {
        // A major key's number is its parallel minor's plus three (Am 8A, A 11B).
        KeyMatch::Parallel
    } else {
        KeyMatch::Other
    })
}

/// The MIREX weighted score as mir_eval computes it by default: exact 1, our
/// key a fifth above the reference in the same mode 0.5, relative 0.3,
/// parallel 0.2, anything else 0.
pub fn mirex_score(ours: &str, reference: &str) -> Option<f64> {
    let (n, _) = parse_camelot(ours)?;
    let (r, _) = parse_camelot(reference)?;
    Some(match key_match(ours, reference)? {
        KeyMatch::Exact => 1.0,
        KeyMatch::Fifth if wheel_step(r, n) == 1 => 0.5,
        KeyMatch::Relative => 0.3,
        KeyMatch::Parallel => 0.2,
        _ => 0.0,
    })
}

/// Steps clockwise from `from` to `to` on the 12-number wheel.
fn wheel_step(from: usize, to: usize) -> usize {
    (to + 12 - from) % 12
}

/// The signed distance in ms from a reference grid marker to the nearest beat
/// of our grid (`bpm`, a beat at `first_beat_ms`); positive when ours is later.
pub fn grid_offset_ms(bpm: f64, first_beat_ms: f64, marker_ms: f64) -> f64 {
    let beat_ms = 60_000.0 / bpm;
    let beats = ((marker_ms - first_beat_ms) / beat_ms).round();
    first_beat_ms + beats * beat_ms - marker_ms
}

/// Which beat of our 4-beat bar (counted from `first_beat_ms`) a reference
/// downbeat lands on: 0 when the bars agree.
pub fn bar_offset(bpm: f64, first_beat_ms: f64, downbeat_ms: f64) -> u8 {
    let beat_ms = 60_000.0 / bpm;
    (((downbeat_ms - first_beat_ms) / beat_ms).round() as i64).rem_euclid(4) as u8
}

/// Rekordbox's downbeat: its marker at `marker_ms` is beat `beat_in_bar` (Battito, 1–4).
pub fn downbeat_ms(marker_ms: f64, beat_in_bar: u32, bpm: f64) -> f64 {
    marker_ms - beat_in_bar.saturating_sub(1) as f64 * 60_000.0 / bpm
}

/// The median (of the middle two for an even count); None for no values.
pub fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let mid = values.len() / 2;
    Some(if values.len() % 2 == 0 { (values[mid - 1] + values[mid]) / 2.0 } else { values[mid] })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bpm_matches() {
        assert_eq!(bpm_match(124.04, 124.0), BpmMatch::Exact);
        assert_eq!(bpm_match(124.4, 124.0), BpmMatch::Close);
        assert_eq!(bpm_match(122.9, 124.0), BpmMatch::OffByOne);
        assert_eq!(bpm_match(248.5, 124.0), BpmMatch::HalfOrDouble);
        assert_eq!(bpm_match(62.2, 124.0), BpmMatch::HalfOrDouble);
        assert_eq!(bpm_match(130.0, 124.0), BpmMatch::Other);
    }

    #[test]
    fn signed_buckets() {
        let buckets: Vec<usize> = [-2.0, -1.0, -0.2, -0.05, 0.0, 0.05, 0.2, 1.0, 2.0].iter().map(|&e| signed_bucket(e)).collect();
        assert_eq!(buckets, vec![0, 1, 2, 3, 3, 3, 4, 5, 6]);
    }

    #[test]
    fn key_relations() {
        assert_eq!(key_match("8A", "8A"), Some(KeyMatch::Exact));
        assert_eq!(key_match("9A", "8A"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("7A", "8A"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("1B", "12B"), Some(KeyMatch::Fifth));
        assert_eq!(key_match("8B", "8A"), Some(KeyMatch::Relative));
        assert_eq!(key_match("11B", "8A"), Some(KeyMatch::Parallel)); // A major against A minor
        assert_eq!(key_match("8A", "11B"), Some(KeyMatch::Parallel));
        assert_eq!(key_match("2A", "8A"), Some(KeyMatch::Other));
        assert_eq!(key_match("Am", "8A"), None);
    }

    #[test]
    fn mirex_weights() {
        assert_eq!(mirex_score("8A", "8A"), Some(1.0));
        assert_eq!(mirex_score("9A", "8A"), Some(0.5)); // a fifth above the reference
        assert_eq!(mirex_score("7A", "8A"), Some(0.0)); // a fifth below scores nothing (mir_eval's default)
        assert_eq!(mirex_score("8B", "8A"), Some(0.3));
        assert_eq!(mirex_score("11B", "8A"), Some(0.2));
        assert_eq!(mirex_score("2A", "8A"), Some(0.0));
    }

    #[test]
    fn grid_offsets() {
        // 120 BPM: a beat every 500 ms from 100 ms.
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_600.0), 0.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_590.0), 10.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 1_620.0), -20.0);
        assert_eq!(grid_offset_ms(120.0, 100.0, 40.0), 60.0);
    }

    #[test]
    fn bar_offsets() {
        assert_eq!(bar_offset(120.0, 100.0, 2_100.0), 0);
        assert_eq!(bar_offset(120.0, 100.0, 600.0), 1);
        assert_eq!(bar_offset(120.0, 100.0, -400.0), 3);
    }

    #[test]
    fn rekordbox_downbeats() {
        assert_eq!(downbeat_ms(1_000.0, 1, 120.0), 1_000.0);
        assert_eq!(downbeat_ms(1_000.0, 3, 120.0), 0.0);
    }

    #[test]
    fn medians() {
        assert_eq!(median(&mut []), None);
        assert_eq!(median(&mut [3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&mut [4.0, 1.0, 2.0, 3.0]), Some(2.5));
    }
}
