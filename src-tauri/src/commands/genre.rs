// Tauri commands for genre operations

use crate::commands::library::{AppState, TrackDTO};
use crate::db::GenreDefinition;
use serde::Serialize;
use tauri::State;

/// DTO for genre counts (for sidebar display)
#[derive(Debug, Clone, Serialize)]
pub struct GenreCountDTO {
    pub genre: String,
    pub count: i64,
}

/// DTO for genre definitions
#[derive(Debug, Clone, Serialize)]
pub struct GenreDefinitionDTO {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i32,
}

impl From<GenreDefinition> for GenreDefinitionDTO {
    fn from(def: GenreDefinition) -> Self {
        GenreDefinitionDTO {
            id: def.id.unwrap_or(0),
            name: def.name,
            color: def.color,
            sort_order: def.sort_order,
        }
    }
}

/// Set genre for a track (with source='user', always overwrites)
#[tauri::command]
pub fn set_track_genre(track_id: i64, genre: String, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.save_track_genre(track_id, &genre, "user")
        .map_err(|e| format!("Failed to set genre: {}", e))
}

/// Clear genre for a track
#[tauri::command]
pub fn clear_track_genre(track_id: i64, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.clear_track_genre(track_id)
        .map_err(|e| format!("Failed to clear genre: {}", e))
}

/// Get all genres with track counts
#[tauri::command]
pub fn get_genres_with_counts(state: State<AppState>) -> Result<Vec<GenreCountDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let counts = db.get_all_genres_with_counts()
        .map_err(|e| format!("Failed to get genres: {}", e))?;

    Ok(counts.into_iter().map(|(genre, count)| GenreCountDTO { genre, count }).collect())
}

/// Get tracks by genre (with analysis data)
#[tauri::command]
pub fn get_tracks_by_genre(genre: String, state: State<AppState>) -> Result<Vec<TrackDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let rows = db.get_tracks_by_genre(&genre)
        .map_err(|e| format!("Failed to get tracks by genre: {}", e))?;

    Ok(rows.into_iter().map(|(track, bpm, bpm_conf, key, key_conf)| {
        let mut dto = TrackDTO::from(track);
        dto.bpm = bpm;
        dto.bpm_confidence = bpm_conf;
        dto.musical_key = key;
        dto.key_confidence = key_conf;
        dto
    }).collect())
}

/// Create a new genre definition
#[tauri::command]
pub fn create_genre_definition(name: String, color: Option<String>, state: State<AppState>) -> Result<i64, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.create_genre_definition(&name, color.as_deref())
        .map_err(|e| format!("Failed to create genre definition: {}", e))
}

/// Get all genre definitions
#[tauri::command]
pub fn get_genre_definitions(state: State<AppState>) -> Result<Vec<GenreDefinitionDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let defs = db.get_all_genre_definitions()
        .map_err(|e| format!("Failed to get genre definitions: {}", e))?;

    Ok(defs.into_iter().map(GenreDefinitionDTO::from).collect())
}

/// Delete a genre definition (does NOT remove genre from tracks)
#[tauri::command]
pub fn delete_genre_definition(id: i64, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.delete_genre_definition(id)
        .map_err(|e| format!("Failed to delete genre definition: {}", e))
}

/// Rename a genre definition and update all tracks with the old name
#[tauri::command]
pub fn rename_genre_definition(id: i64, new_name: String, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.rename_genre_definition(id, &new_name)
        .map_err(|e| format!("Failed to rename genre definition: {}", e))
}

/// Set genre for multiple tracks at once
#[tauri::command]
pub fn bulk_set_genre(track_ids: Vec<i64>, genre: String, state: State<AppState>) -> Result<i64, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let count = db.bulk_set_genre(&track_ids, &genre)
        .map_err(|e| format!("Failed to bulk set genre: {}", e))?;

    Ok(count as i64)
}
