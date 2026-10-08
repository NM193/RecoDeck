// src-tauri/src/commands/home.rs
//! Home's cards (Home cards spec, Data): what they read beyond Search's
//! sections (`commands/sections.rs`). Local data only.

use tauri::State;

use crate::commands::library::AppState;
use crate::commands::sections::with_db;
use crate::db::home::{BpmKeyCounts, LastPlayedPlaylist, UpcomingGig};
use crate::error::AppError;

/// The gigs on or after `today` (the user's local day, "2026-10-04") of every
/// DJ with a page, soonest first.
#[tauri::command]
pub fn get_upcoming_gigs(today: String, limit: i64, state: State<AppState>) -> Result<Vec<UpcomingGig>, AppError> {
    with_db(&state, "upcoming gigs", |db| db.get_upcoming_gigs(&today, limit))
}

/// Every track with no BPM: Not analyzed's number, and what Analyze all analyzes.
#[tauri::command]
pub fn get_track_ids_without_bpm(state: State<AppState>) -> Result<Vec<i64>, AppError> {
    with_db(&state, "tracks without a BPM", |db| db.get_track_ids_without_bpm())
}

/// The playlist played from most recently, while it exists: Last playlist.
#[tauri::command]
pub fn get_last_played_playlist(state: State<AppState>) -> Result<Option<LastPlayedPlaylist>, AppError> {
    with_db(&state, "the last played playlist", |db| db.get_last_played_playlist())
}

/// The tracks per BPM range and per key: BPM & key.
#[tauri::command]
pub fn get_bpm_key_counts(state: State<AppState>) -> Result<BpmKeyCounts, AppError> {
    with_db(&state, "BPM and key counts", |db| db.get_bpm_key_counts())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn an_upcoming_gig_is_camel_case() {
        let gig = UpcomingGig {
            name_key: "traumer".into(),
            display_name: "Traumer".into(),
            event_id: "e2".into(),
            date: "2026-10-06".into(),
            venue: Some("Hï Ibiza".into()),
            city: Some("Ibiza".into()),
            country: None,
        };

        assert_eq!(
            serde_json::to_value(gig).unwrap(),
            json!({
                "nameKey": "traumer",
                "displayName": "Traumer",
                "eventId": "e2",
                "date": "2026-10-06",
                "venue": "Hï Ibiza",
                "city": "Ibiza",
                "country": null
            })
        );
    }

    #[test]
    fn bpm_and_key_counts_are_camel_case() {
        let counts = BpmKeyCounts {
            bpm: vec![
                crate::db::home::BpmRangeCount { min: None, max: Some(115), count: 3 },
                crate::db::home::BpmRangeCount { min: Some(135), max: None, count: 1 },
            ],
            keys: vec![crate::db::home::KeyCount { key: "8A".into(), count: 2 }],
        };
        let last = LastPlayedPlaylist {
            playlist_id: 4,
            name: "Peak".into(),
            played_at: 1_759_000_000,
        };

        assert_eq!(
            serde_json::to_value(counts).unwrap(),
            json!({
                "bpm": [{ "min": null, "max": 115, "count": 3 }, { "min": 135, "max": null, "count": 1 }],
                "keys": [{ "key": "8A", "count": 2 }]
            })
        );
        assert_eq!(
            serde_json::to_value(last).unwrap(),
            json!({ "playlistId": 4, "name": "Peak", "playedAt": 1_759_000_000 })
        );
    }
}
