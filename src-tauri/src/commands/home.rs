// src-tauri/src/commands/home.rs
//! Home's cards (Home cards spec, Data): what they read beyond Search's
//! sections (`commands/sections.rs`). Local data only.

use tauri::State;

use crate::commands::library::AppState;
use crate::commands::sections::with_db;
use crate::db::home::UpcomingGig;
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
}
