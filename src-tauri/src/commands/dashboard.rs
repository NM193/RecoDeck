use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::library::AppState;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayCount {
    pub track_id: i64,
    pub plays: i64,
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

/// Every track played at least once, for the track table's Played filter.
#[tauri::command]
pub fn get_played_track_ids(state: State<AppState>) -> Result<Vec<i64>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    db.get_played_track_ids()
        .map_err(|e| AppError::Internal(format!("Failed to read played tracks: {}", e)))
}

/// How many times each played track was played (the track table's Plays column).
#[tauri::command]
pub fn get_play_counts(state: State<AppState>) -> Result<Vec<PlayCount>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    let rows = db
        .get_play_counts()
        .map_err(|e| AppError::Internal(format!("Failed to count plays: {}", e)))?;
    Ok(rows
        .into_iter()
        .map(|(track_id, plays)| PlayCount { track_id, plays })
        .collect())
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
