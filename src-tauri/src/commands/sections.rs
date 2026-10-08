// src-tauri/src/commands/sections.rs
//! The Search page's sections before you type (Search spec), shared with
//! Home: tracks played and added lately, the DJs the user knows, and the
//! library's biggest genres. Local data only.

use serde::Serialize;
use tauri::State;

use crate::commands::library::{AppState, TrackDTO};
use crate::db::sections::{KnownDj, LibraryGroups};
use crate::db::{Database, TrackWithAnalysis};
use crate::error::AppError;

/// A track played lately, with the time of its latest play.
#[derive(Debug, Serialize)]
pub struct RecentlyPlayedTrack {
    #[serde(flatten)]
    pub track: TrackDTO,
    /// Unix seconds.
    pub played_at: i64,
}

fn track_dto((track, bpm, bpm_confidence, musical_key, key_confidence): TrackWithAnalysis) -> TrackDTO {
    let mut dto = TrackDTO::from(track);
    dto.bpm = bpm;
    dto.bpm_confidence = bpm_confidence;
    dto.musical_key = musical_key;
    dto.key_confidence = key_confidence;
    dto
}

fn with_db<T>(
    state: &State<AppState>,
    what: &str,
    read: impl FnOnce(&Database) -> rusqlite::Result<T>,
) -> Result<T, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;
    read(db).map_err(|e| AppError::Internal(format!("Failed to read {what}: {e}")))
}

/// Distinct tracks by their latest play, newest first.
#[tauri::command]
pub fn get_recently_played_tracks(
    limit: i64,
    state: State<AppState>,
) -> Result<Vec<RecentlyPlayedTrack>, AppError> {
    let rows = with_db(&state, "recently played tracks", |db| db.get_recently_played_tracks(limit))?;
    Ok(rows
        .into_iter()
        .map(|(row, played_at)| RecentlyPlayedTrack { track: track_dto(row), played_at })
        .collect())
}

/// The tracks added lately, newest first, as full rows.
#[tauri::command]
pub fn get_recently_added_tracks(limit: i64, state: State<AppState>) -> Result<Vec<TrackDTO>, AppError> {
    let rows = with_db(&state, "recently added tracks", |db| db.get_recently_added_tracks(limit))?;
    Ok(rows.into_iter().map(track_dto).collect())
}

/// Every DJ with a page or watched for sets; `today` ("2026-10-04", the
/// user's local day) picks each one's next gig.
#[tauri::command]
pub fn get_known_djs(today: String, state: State<AppState>) -> Result<Vec<KnownDj>, AppError> {
    with_db(&state, "known DJs", |db| db.get_known_djs(&today))
}

/// The 6 biggest genres, the count added in the last 30 days and the count never played.
#[tauri::command]
pub fn get_library_groups(state: State<AppState>) -> Result<LibraryGroups, AppError> {
    with_db(&state, "library groups", |db| db.get_library_groups())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sections::{GenreCount, NextGig};
    use crate::db::Track;
    use serde_json::json;

    fn track(title: &str) -> Track {
        Track {
            id: Some(7),
            file_path: "/m/a.mp3".into(),
            file_hash: "h".into(),
            title: Some(title.into()),
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: None,
            file_format: None,
            bitrate: None,
            sample_rate: None,
            file_size: None,
            date_added: None,
            date_modified: None,
            play_count: 0,
            rating: 0,
            comment: None,
            artwork_path: None,
            genre: None,
            genre_source: None,
        }
    }

    // What the frontend reads: a Track with `played_at` beside its fields.
    #[test]
    fn a_recently_played_track_is_a_flat_track_with_its_analysis_and_played_at() {
        let row = (track("A"), Some(126.0), Some(0.9), Some("8A".to_string()), Some(0.8));

        let value = serde_json::to_value(RecentlyPlayedTrack { track: track_dto(row), played_at: 300 }).unwrap();

        assert_eq!(value["id"], json!(7));
        assert_eq!(value["title"], json!("A"));
        assert_eq!(value["file_path"], json!("/m/a.mp3"));
        assert_eq!(value["bpm"], json!(126.0));
        assert_eq!(value["musical_key"], json!("8A"));
        assert_eq!(value["played_at"], json!(300));
    }

    #[test]
    fn known_djs_and_library_groups_are_camel_case() {
        let dj = KnownDj {
            name_key: "traumer".into(),
            display_name: "Traumer".into(),
            image_url: None,
            next_gig: Some(NextGig { date: "2026-10-12".into(), venue: Some("The Nest".into()) }),
            watched: false,
        };
        let groups = LibraryGroups {
            genres: vec![GenreCount { genre: "House".into(), count: 3 }],
            added_recently: 1,
            never_played: 9,
        };

        assert_eq!(
            serde_json::to_value(dj).unwrap(),
            json!({
                "nameKey": "traumer",
                "displayName": "Traumer",
                "imageUrl": null,
                "nextGig": { "date": "2026-10-12", "venue": "The Nest" },
                "watched": false
            })
        );
        assert_eq!(
            serde_json::to_value(groups).unwrap(),
            json!({ "genres": [{ "genre": "House", "count": 3 }], "addedRecently": 1, "neverPlayed": 9 })
        );
    }
}
