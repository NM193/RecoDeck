// Tauri commands for playlist management

use crate::commands::library::{AppState, TrackDTO};
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

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
) -> Result<PlaylistDTO, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let id = db
        .create_playlist(&name, "manual", parent_id)
        .map_err(|e| AppError::Database(format!("Failed to create playlist: {}", e)))?;

    let playlist = db
        .get_playlist(id)
        .map_err(|e| AppError::Database(format!("Failed to get playlist: {}", e)))?;

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
) -> Result<PlaylistDTO, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let id = db
        .create_playlist(&name, "folder", parent_id)
        .map_err(|e| AppError::Database(format!("Failed to create folder: {}", e)))?;

    let playlist = db
        .get_playlist(id)
        .map_err(|e| AppError::Database(format!("Failed to get folder: {}", e)))?;

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
pub fn get_all_playlists(state: State<AppState>) -> Result<Vec<PlaylistDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let playlists = db
        .get_all_playlists()
        .map_err(|e| AppError::Database(format!("Failed to get playlists: {}", e)))?;

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
pub fn rename_playlist(state: State<AppState>, id: i64, name: String) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.rename_playlist(id, &name)
        .map_err(|e| AppError::Database(format!("Failed to rename: {}", e)))
}

/// Delete a playlist or folder (and its children/track associations)
#[tauri::command]
pub fn delete_playlist(state: State<AppState>, id: i64) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.delete_playlist(id)
        .map_err(|e| AppError::Database(format!("Failed to delete: {}", e)))
}

/// Get tracks in a playlist (with analysis data)
#[tauri::command]
pub fn get_playlist_tracks(state: State<AppState>, playlist_id: i64) -> Result<Vec<TrackDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let rows = db
        .get_playlist_tracks(playlist_id)
        .map_err(|e| AppError::Database(format!("Failed to get playlist tracks: {}", e)))?;

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
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.add_track_to_playlist(playlist_id, track_id)
        .map_err(|e| AppError::Database(format!("Failed to add track: {}", e)))
}

/// Remove a track from a playlist
#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<AppState>,
    playlist_id: i64,
    track_id: i64,
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.remove_track_from_playlist(playlist_id, track_id)
        .map_err(|e| AppError::Database(format!("Failed to remove track: {}", e)))
}

/// Reorder tracks in a playlist (atomic position update)
#[tauri::command]
pub fn reorder_playlist_tracks(
    state: State<AppState>,
    playlist_id: i64,
    ordered_track_ids: Vec<i64>,
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.reorder_playlist_tracks(playlist_id, &ordered_track_ids)
        .map_err(|e| AppError::Database(format!("Failed to reorder playlist: {}", e)))
}

// --- Export ---

/// Progress event emitted per-track while exporting a playlist to a folder
#[derive(Clone, Serialize)]
pub struct ExportProgressEvent {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Summary of an export run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResultDTO {
    pub exported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    /// Actual folder name created inside the destination (may include a "_2" suffix if collided)
    pub folder_name: String,
    /// Absolute path to the created folder
    pub folder_path: String,
    /// Number of new track rows inserted into the library DB (only when the
    /// destination is inside a registered library root).
    pub imported: usize,
}

/// Replace characters that are illegal in cross-platform filenames with `_`
fn sanitize_filename(name: &str) -> String {
    const FORBIDDEN: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    let cleaned: String = name
        .chars()
        .map(|c| if FORBIDDEN.contains(&c) || (c as u32) < 0x20 { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// If `dest_dir/filename` exists, return `dest_dir/{stem}_2.{ext}`, `_3`, etc.
fn unique_path_in(dest_dir: &Path, filename: &str) -> PathBuf {
    let candidate = dest_dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.to_string());
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    let mut i: u32 = 2;
    loop {
        let candidate_name = match &ext {
            Some(e) => format!("{}_{}.{}", stem, i, e),
            None => format!("{}_{}", stem, i),
        };
        let candidate = dest_dir.join(&candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}

/// Copy playlist tracks into a new subfolder under `dest_path`.
/// Creates `{dest_path}/{folder_name}/` (suffixing `_2`, `_3`… if it already exists),
/// then copies every track in there and emits "export-progress" per track.
#[tauri::command]
pub fn export_playlist_to_folder(
    playlist_id: i64,
    dest_path: String,
    folder_name: String,
    rename_files: bool,
    export_m3u: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ExportResultDTO, AppError> {
    let parent_dir = Path::new(&dest_path);
    if !parent_dir.is_dir() {
        return Err(AppError::Validation(format!(
            "Destination is not a directory: {}",
            dest_path
        )));
    }

    // Fetch playlist + tracks, then release the DB lock before any file I/O
    // so other commands (playback status, etc.) aren't blocked for the whole export.
    let (playlist_name, tracks): (String, Vec<TrackDTO>) = {
        let db_lock = state
            .db
            .lock()
            .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock
            .as_ref()
            .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let playlist = db
            .get_playlist(playlist_id)
            .map_err(|e| AppError::Database(format!("Failed to get playlist: {}", e)))?;
        let rows = db
            .get_playlist_tracks(playlist_id)
            .map_err(|e| AppError::Database(format!("Failed to get playlist tracks: {}", e)))?;

        let tracks: Vec<TrackDTO> = rows
            .into_iter()
            .map(|(track, bpm, bpm_conf, key, key_conf)| {
                let mut dto = TrackDTO::from(track);
                dto.bpm = bpm;
                dto.bpm_confidence = bpm_conf;
                dto.musical_key = key;
                dto.key_confidence = key_conf;
                dto
            })
            .collect();
        (playlist.name, tracks)
    };

    // Create the subfolder the user asked for (fall back to playlist name if empty).
    // Collision-suffix with "_2", "_3"… using the same helper as file collisions.
    let requested_name = if folder_name.trim().is_empty() {
        playlist_name.clone()
    } else {
        folder_name.clone()
    };
    let sanitized = sanitize_filename(&requested_name);
    let dest_dir_path = unique_path_in(parent_dir, &sanitized);
    let final_folder_name = dest_dir_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| sanitized.clone());
    std::fs::create_dir(&dest_dir_path).map_err(|e| {
        AppError::Internal(format!(
            "Failed to create export folder '{}': {}",
            dest_dir_path.display(),
            e
        ))
    })?;
    let dest_dir = dest_dir_path.as_path();

    let total = tracks.len();
    let mut exported: usize = 0;
    let mut skipped: usize = 0;
    let mut errors: Vec<String> = Vec::new();
    // (final_filename, source TrackDTO) — accumulated for m3u output and DB import
    let mut copied: Vec<(String, TrackDTO)> = Vec::with_capacity(total);

    for (idx, track) in tracks.into_iter().enumerate() {
        let position = idx + 1;
        let src = Path::new(&track.file_path);

        let display_name: String = if !src.is_file() {
            // Source not present — record skip, still emit progress
            skipped += 1;
            src.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| track.file_path.clone())
        } else {
            let ext = src
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_else(|| "mp3".to_string());
            let base = if rename_files {
                let artist = track
                    .artist
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Unknown");
                let title = track
                    .title
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Untitled");
                sanitize_filename(&format!("{:02} - {} - {}.{}", position, artist, title, ext))
            } else {
                src.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("track_{}.{}", position, ext))
            };
            let unique = unique_path_in(dest_dir, &base);
            let final_name = unique
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or(base);

            match std::fs::copy(src, &unique) {
                Ok(_) => {
                    exported += 1;
                    copied.push((final_name.clone(), track.clone()));
                }
                Err(e) => {
                    errors.push(format!("{}: {}", track.file_path, e));
                }
            }
            final_name
        };

        let _ = app.emit(
            "export-progress",
            &ExportProgressEvent {
                current: position,
                total,
                current_file: display_name,
            },
        );
    }

    // If the destination is inside a registered library root, insert track rows
    // for the copied files so they show up in the library view. This bypasses the
    // scanner's hash-dedup (which would skip them because the copies share the
    // original hash).
    let mut imported: usize = 0;
    {
        let db_lock = state
            .db
            .lock()
            .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock
            .as_ref()
            .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let library_folders: Vec<String> = match db.get_setting("library_folders") {
            Ok(Some(json)) => serde_json::from_str(&json).unwrap_or_default(),
            _ => Vec::new(),
        };

        let dest_str = dest_dir.to_string_lossy().to_string();
        let within_library = library_folders.iter().any(|root| {
            dest_str == *root
                || dest_str.starts_with(&format!("{}/", root))
                || dest_str.starts_with(&format!("{}\\", root))
        });

        if within_library {
            for (filename, src_track) in &copied {
                let new_path = dest_dir.join(filename).to_string_lossy().to_string();
                let new_track = crate::db::Track {
                    id: None,
                    file_path: new_path,
                    file_hash: src_track.file_hash.clone(),
                    title: src_track.title.clone(),
                    artist: src_track.artist.clone(),
                    album: src_track.album.clone(),
                    album_artist: src_track.album_artist.clone(),
                    track_number: src_track.track_number,
                    year: src_track.year,
                    label: src_track.label.clone(),
                    duration_ms: src_track.duration_ms,
                    file_format: src_track.file_format.clone(),
                    bitrate: src_track.bitrate,
                    sample_rate: src_track.sample_rate,
                    file_size: src_track.file_size,
                    date_added: None,
                    date_modified: src_track.date_modified.clone(),
                    play_count: src_track.play_count,
                    rating: src_track.rating,
                    comment: src_track.comment.clone(),
                    artwork_path: src_track.artwork_path.clone(),
                    genre: src_track.genre.clone(),
                    genre_source: src_track.genre_source.clone(),
                };
                if let Ok(new_id) = db.create_track(&new_track) {
                    // Mirror BPM/key analysis so the new rows show BPM & Key columns filled in
                    if let Some(bpm) = src_track.bpm {
                        let _ = db.save_bpm_analysis(
                            new_id,
                            bpm,
                            src_track.bpm_confidence.unwrap_or(1.0),
                        );
                    }
                    imported += 1;
                }
            }
        }
    }

    if export_m3u {
        let m3u_name = format!("{}.m3u8", sanitize_filename(&playlist_name));
        let m3u_path = dest_dir.join(&m3u_name);
        let mut content = String::from("#EXTM3U\n");
        for (filename, track) in &copied {
            let duration_seconds = track.duration_ms.map(|ms| ms / 1000).unwrap_or(-1);
            let artist = track.artist.as_deref().unwrap_or("");
            let title = track.title.as_deref().unwrap_or("");
            content.push_str(&format!(
                "#EXTINF:{},{} - {}\n",
                duration_seconds, artist, title
            ));
            content.push_str(filename);
            content.push('\n');
        }
        if let Err(e) = std::fs::write(&m3u_path, content) {
            errors.push(format!("Failed to write {}: {}", m3u_name, e));
        }
    }

    Ok(ExportResultDTO {
        exported,
        skipped,
        errors,
        folder_name: final_folder_name,
        folder_path: dest_dir_path.to_string_lossy().to_string(),
        imported,
    })
}

/// Open a native folder picker. Returns the selected path or None if cancelled.
///
/// Uses the callback-based API (not blocking_pick_folder) to avoid deadlocks on
/// macOS where the dialog runs on the main thread.
#[tauri::command]
pub fn pick_export_folder(app: AppHandle) -> Result<Option<String>, AppError> {
    let (tx, rx) = std::sync::mpsc::sync_channel::<Option<tauri_plugin_dialog::FilePath>>(1);
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let folder = rx
        .recv()
        .map_err(|e| AppError::Internal(format!("Dialog channel closed: {}", e)))?;
    Ok(folder.map(|p| p.to_string()))
}
