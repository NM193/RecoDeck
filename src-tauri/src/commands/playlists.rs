// Tauri commands for playlist management

use crate::commands::library::{AppState, TrackDTO};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Serializable playlist for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistDTO {
    pub id: Option<i64>,
    pub name: String,
    pub playlist_type: String,
    pub parent_id: Option<i64>,
    pub track_count: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Create a new playlist (type = "manual")
#[tauri::command]
pub fn create_playlist(
    state: State<AppState>,
    name: String,
    parent_id: Option<i64>,
) -> Result<PlaylistDTO, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let id = db
        .create_playlist(&name, "manual", parent_id)
        .map_err(|e| format!("Failed to create playlist: {}", e))?;

    let playlist = db
        .get_playlist(id)
        .map_err(|e| format!("Failed to get playlist: {}", e))?;

    Ok(PlaylistDTO {
        id: playlist.id,
        name: playlist.name,
        playlist_type: playlist.playlist_type,
        parent_id: playlist.parent_id,
        track_count: 0,
        created_at: playlist.created_at,
        updated_at: playlist.updated_at,
    })
}

/// Create a new playlist folder (type = "folder")
#[tauri::command]
pub fn create_playlist_folder(
    state: State<AppState>,
    name: String,
    parent_id: Option<i64>,
) -> Result<PlaylistDTO, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let id = db
        .create_playlist(&name, "folder", parent_id)
        .map_err(|e| format!("Failed to create folder: {}", e))?;

    let playlist = db
        .get_playlist(id)
        .map_err(|e| format!("Failed to get folder: {}", e))?;

    Ok(PlaylistDTO {
        id: playlist.id,
        name: playlist.name,
        playlist_type: playlist.playlist_type,
        parent_id: playlist.parent_id,
        track_count: 0,
        created_at: playlist.created_at,
        updated_at: playlist.updated_at,
    })
}

/// Get all playlists and folders (with track counts)
#[tauri::command]
pub fn get_all_playlists(state: State<AppState>) -> Result<Vec<PlaylistDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let playlists = db
        .get_all_playlists()
        .map_err(|e| format!("Failed to get playlists: {}", e))?;

    let mut dtos = Vec::new();
    for p in playlists {
        let track_count = if p.playlist_type == "folder" {
            0
        } else {
            db.count_playlist_tracks(p.id.unwrap_or(0)).unwrap_or(0)
        };

        dtos.push(PlaylistDTO {
            id: p.id,
            name: p.name,
            playlist_type: p.playlist_type,
            parent_id: p.parent_id,
            track_count,
            created_at: p.created_at,
            updated_at: p.updated_at,
        });
    }

    Ok(dtos)
}

/// Rename a playlist or folder
#[tauri::command]
pub fn rename_playlist(state: State<AppState>, id: i64, name: String) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.rename_playlist(id, &name)
        .map_err(|e| format!("Failed to rename: {}", e))
}

/// Delete a playlist or folder (and its children/track associations)
#[tauri::command]
pub fn delete_playlist(state: State<AppState>, id: i64) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.delete_playlist(id)
        .map_err(|e| format!("Failed to delete: {}", e))
}

/// Get tracks in a playlist (with analysis data)
#[tauri::command]
pub fn get_playlist_tracks(state: State<AppState>, playlist_id: i64) -> Result<Vec<TrackDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let rows = db
        .get_playlist_tracks(playlist_id)
        .map_err(|e| format!("Failed to get playlist tracks: {}", e))?;

    Ok(rows
        .into_iter()
        .map(|(track, bpm, bpm_conf, musical_key, key_conf)| {
            let mut dto = TrackDTO::from(track);
            dto.bpm = bpm;
            dto.bpm_confidence = bpm_conf;
            dto.musical_key = musical_key;
            dto.key_confidence = key_conf;
            dto
        })
        .collect())
}

/// Add a track to a playlist
#[tauri::command]
pub fn add_track_to_playlist(
    state: State<AppState>,
    playlist_id: i64,
    track_id: i64,
) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.add_track_to_playlist(playlist_id, track_id)
        .map_err(|e| format!("Failed to add track: {}", e))
}

/// Remove a track from a playlist
#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<AppState>,
    playlist_id: i64,
    track_id: i64,
) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.remove_track_from_playlist(playlist_id, track_id)
        .map_err(|e| format!("Failed to remove track: {}", e))
}
