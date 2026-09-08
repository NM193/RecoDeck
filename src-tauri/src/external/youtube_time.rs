//! Calendar helpers for the YouTube quota counter.
//!
//! The quota resets at midnight **Pacific**, which is around 09:00 local time
//! here — so "today" for quota purposes is not the local day, and a naive
//! local-date key would hand the user a fresh 10,000 units nine hours early.
//!
//! The project has no date library and Rule 1 says not to add one for this, so
//! the civil-calendar conversion is done directly. It is small, deterministic
//! and covered by tests, including the two US daylight-saving transitions.

use std::time::{SystemTime, UNIX_EPOCH};

const SECONDS_PER_DAY: i64 = 86_400;

/// Days since 1970-01-01 -> (year, month, day). Howard Hinnant's algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// (year, month, day) -> days since 1970-01-01.
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 } as i64;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// 0 = Sunday.
fn weekday_from_days(z: i64) -> i64 {
    ((z % 7) + 11) % 7
}

fn floor_div(a: i64, b: i64) -> i64 {
    if a >= 0 { a / b } else { -(((-a) + b - 1) / b) }
}

/// Day of month of the n-th Sunday of a month (n starts at 1).
fn nth_sunday(y: i64, m: u32, n: u32) -> u32 {
    let first = days_from_civil(y, m, 1);
    let to_first_sunday = (7 - weekday_from_days(first)) % 7;
    (1 + to_first_sunday + 7 * (n as i64 - 1)) as u32
}

/// US daylight saving since 2007: from 02:00 local on the second Sunday of
/// March (10:00 UTC) to 02:00 local on the first Sunday of November (09:00 UTC).
fn is_pacific_dst(unix_secs: i64) -> bool {
    let (year, _, _) = civil_from_days(floor_div(unix_secs, SECONDS_PER_DAY));
    let start =
        days_from_civil(year, 3, nth_sunday(year, 3, 2)) * SECONDS_PER_DAY + 10 * 3_600;
    let end = days_from_civil(year, 11, nth_sunday(year, 11, 1)) * SECONDS_PER_DAY + 9 * 3_600;
    unix_secs >= start && unix_secs < end
}

/// -7h during daylight saving, -8h otherwise.
fn pacific_offset(unix_secs: i64) -> i64 {
    if is_pacific_dst(unix_secs) {
        -7 * 3_600
    } else {
        -8 * 3_600
    }
}

/// Which Pacific calendar day a UTC instant belongs to, as YYYY-MM-DD.
/// This string is the quota bucket key.
pub fn pacific_day(unix_secs: i64) -> String {
    let local = unix_secs + pacific_offset(unix_secs);
    let (y, m, d) = civil_from_days(floor_div(local, SECONDS_PER_DAY));
    format!("{y:04}-{m:02}-{d:02}")
}

/// Seconds from now until the quota resets, for showing "back in Xh".
pub fn seconds_until_pacific_midnight(unix_secs: i64) -> i64 {
    let local = unix_secs + pacific_offset(unix_secs);
    let next_midnight = (floor_div(local, SECONDS_PER_DAY) + 1) * SECONDS_PER_DAY;
    next_midnight - local
}

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// UTC timestamp in the same shape the standalone tool writes into fixtures.
pub fn iso_now() -> String {
    let secs = now_unix();
    let (y, m, d) = civil_from_days(floor_div(secs, SECONDS_PER_DAY));
    let time_of_day = secs.rem_euclid(SECONDS_PER_DAY);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z",
        time_of_day / 3_600,
        (time_of_day % 3_600) / 60,
        time_of_day % 60
    )
}

/// The same instant without fractional seconds, which is the shape the YouTube
/// API wants for `publishedAfter`.
pub fn iso_seconds(unix_secs: i64) -> String {
    let (y, m, d) = civil_from_days(floor_div(unix_secs, SECONDS_PER_DAY));
    let time_of_day = unix_secs.rem_euclid(SECONDS_PER_DAY);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        time_of_day / 3_600,
        (time_of_day % 3_600) / 60,
        time_of_day % 60
    )
}

/// Reads back a timestamp written by `iso_now` — `YYYY-MM-DDTHH:MM:SS...Z`.
///
/// Only the shape this module writes is accepted. Anything else returns None,
/// and every caller treats that as "never checked", which errs towards doing
/// the work rather than silently skipping a channel forever.
pub fn unix_from_iso(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    fn number(part: &str) -> Option<i64> {
        if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    }

    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    // The separator between date and time is 'T' in what we write; SQLite's own
    // datetime('now') uses a space, and rows written by it must still parse.
    if bytes[10] != b'T' && bytes[10] != b' ' {
        return None;
    }

    let year = number(&text[0..4])?;
    let month = number(&text[5..7])?;
    let day = number(&text[8..10])?;
    let hour = number(&text[11..13])?;
    let minute = number(&text[14..16])?;
    let second = number(&text[17..19])?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }

    Some(
        days_from_civil(year, month as u32, day as u32) * SECONDS_PER_DAY
            + hour * 3_600
            + minute * 60
            + second,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn winter_uses_standard_time() {
        // 2026-01-15 12:00 UTC -> 04:00 PST, same date
        assert_eq!(pacific_day(1_768_478_400), "2026-01-15");
    }

    #[test]
    fn the_pacific_day_is_not_the_local_day() {
        // 2026-06-01 05:00 UTC is already June here, but still May 31 in
        // California — quota belongs to the Pacific day, not ours.
        assert_eq!(pacific_day(1_780_290_000), "2026-05-31");
        // 07:00 UTC is exactly midnight PDT: the new quota day begins.
        assert_eq!(pacific_day(1_780_297_200), "2026-06-01");
    }

    #[test]
    fn midnight_boundary_flips_the_day_in_winter() {
        assert_eq!(pacific_day(1_767_254_399), "2025-12-31"); // 07:59:59Z
        assert_eq!(pacific_day(1_767_254_400), "2026-01-01"); // 08:00:00Z
    }

    #[test]
    fn daylight_saving_transitions_are_where_the_law_puts_them() {
        // 2026: DST runs 2026-03-08 10:00Z to 2026-11-01 09:00Z
        assert!(!is_pacific_dst(1_772_964_000 - 1));
        assert!(is_pacific_dst(1_772_964_000));
        assert!(is_pacific_dst(1_793_523_600 - 1));
        assert!(!is_pacific_dst(1_793_523_600));
    }

    #[test]
    fn summer_is_seven_hours_behind() {
        assert_eq!(pacific_offset(1_783_188_000), -7 * 3_600); // 2026-07-04
        assert_eq!(pacific_offset(1_768_478_400), -8 * 3_600); // 2026-01-15
    }

    #[test]
    fn reset_countdown_stays_inside_a_day() {
        for secs in [1_768_478_400_i64, 1_780_290_000, 1_783_188_000] {
            let left = seconds_until_pacific_midnight(secs);
            assert!(left > 0 && left <= SECONDS_PER_DAY, "got {left}");
            // Crossing that many seconds must land on a different Pacific day.
            assert_ne!(pacific_day(secs), pacific_day(secs + left));
        }
    }

    #[test]
    fn a_written_timestamp_reads_back_as_the_same_instant() {
        for secs in [0_i64, 1_768_478_400, 1_780_290_000, 1_783_188_123] {
            let text = {
                // iso_now() reads the clock, so build the same shape from a fixed instant.
                let (y, m, d) = civil_from_days(floor_div(secs, SECONDS_PER_DAY));
                let time_of_day = secs.rem_euclid(SECONDS_PER_DAY);
                format!(
                    "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z",
                    time_of_day / 3_600,
                    (time_of_day % 3_600) / 60,
                    time_of_day % 60
                )
            };
            assert_eq!(unix_from_iso(&text), Some(secs), "{text}");
        }
    }

    #[test]
    fn sqlite_datetime_now_is_also_accepted() {
        // Rows written by `datetime('now')` use a space, not a 'T'.
        assert_eq!(
            unix_from_iso("2026-01-15 12:00:00"),
            unix_from_iso("2026-01-15T12:00:00.000Z")
        );
    }

    #[test]
    fn nonsense_is_rejected_rather_than_guessed_at() {
        for text in ["", "yesterday", "2026-01-15", "20260115T120000Z", "2026-13-01T00:00:00Z"] {
            assert_eq!(unix_from_iso(text), None, "{text}");
        }
    }

    #[test]
    fn published_after_carries_no_fractional_seconds() {
        // The API rejects the fractional form iso_now() writes.
        assert_eq!(iso_seconds(1_768_478_400), "2026-01-15T12:00:00Z");
        assert!(!iso_seconds(1_768_478_400).contains('.'));
        // And it still reads back as the same instant.
        assert_eq!(unix_from_iso(&iso_seconds(1_768_478_400)), Some(1_768_478_400));
    }

    #[test]
    fn civil_conversions_round_trip() {
        for (y, m, d) in [(1970, 1, 1), (2000, 2, 29), (2026, 9, 7), (2038, 12, 31)] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
        }
    }
}
