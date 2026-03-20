use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::library::AppState;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayHistoryEntry {
    pub track_id: i64,
    pub playlist_id: Option<i64>,
    pub played_at: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentlyAddedTrack {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub file_path: String,
    pub date_added: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryInsights {
    pub top_genre: Option<String>,
    pub bpm_min: Option<f64>,
    pub bpm_max: Option<f64>,
    pub top_key: Option<String>,
    pub avg_energy: Option<f64>,
    pub total_tracks: i64,
    pub analyzed_tracks: i64,
}

#[tauri::command]
pub fn record_play_event(
    track_id: i64,
    playlist_id: Option<i64>,
    state: State<AppState>,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    db.record_play_event(track_id, playlist_id)
        .map_err(|e| AppError::Internal(format!("Failed to record play event: {}", e)))
}

#[tauri::command]
pub fn get_recently_played(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<PlayHistoryEntry>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let limit = limit.unwrap_or(10);
    let rows = db
        .get_recently_played(limit)
        .map_err(|e| AppError::Internal(format!("Failed to query play history: {}", e)))?;

    let entries = rows
        .into_iter()
        .map(|(track_id, playlist_id, played_at, title, artist, file_path)| PlayHistoryEntry {
            track_id,
            playlist_id,
            played_at,
            title,
            artist,
            file_path,
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn get_recently_added(
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<RecentlyAddedTrack>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let limit = limit.unwrap_or(10);
    let rows = db
        .get_recently_added(limit)
        .map_err(|e| AppError::Internal(format!("Failed to query recently added: {}", e)))?;

    let tracks = rows
        .into_iter()
        .map(|(id, title, artist, file_path, date_added)| RecentlyAddedTrack {
            id,
            title,
            artist,
            file_path,
            date_added,
        })
        .collect();

    Ok(tracks)
}

#[tauri::command]
pub fn get_library_insights(state: State<AppState>) -> Result<LibraryInsights, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let (total_tracks, analyzed_tracks, top_genre, bpm_min, bpm_max, top_key, avg_energy) = db
        .get_library_insights()
        .map_err(|e| AppError::Internal(format!("Failed to get library insights: {}", e)))?;

    Ok(LibraryInsights {
        top_genre,
        bpm_min,
        bpm_max,
        top_key,
        avg_energy,
        total_tracks,
        analyzed_tracks,
    })
}

#[tauri::command]
pub fn save_dashboard_layout(
    layout_json: String,
    state: State<AppState>,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    db.save_dashboard_layout(&layout_json)
        .map_err(|e| AppError::Internal(format!("Failed to save dashboard layout: {}", e)))
}

#[tauri::command]
pub fn get_dashboard_layout(state: State<AppState>) -> Result<Option<String>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    db.get_dashboard_layout()
        .map_err(|e| AppError::Internal(format!("Failed to get dashboard layout: {}", e)))
}
