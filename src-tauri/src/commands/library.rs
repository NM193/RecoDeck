// Tauri commands for library management

use crate::db::{Database, Track};
use crate::error::AppError;
use crate::scanner::{ScanResult, Scanner};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::ipc::Response;

/// Application state with database connection
pub struct AppState {
    pub db: Mutex<Option<Database>>,
    /// Pre-built AI context JSON, rebuilt on library changes
    pub ai_context_cache: Mutex<Option<String>>,
    /// Cached taste profile JSON, rebuilt on library changes
    pub taste_profile_cache: Mutex<Option<String>>,
    /// Path to the SQLite database file (needed for companion server's own connection)
    pub db_path: Mutex<Option<String>>,
    /// Cancellation flag for batch analysis (checked by Rayon workers)
    pub analysis_cancelled: Arc<AtomicBool>,
}

/// Serializable track for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackDTO {
    pub id: Option<i64>,
    pub file_path: String,
    pub file_hash: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub label: Option<String>,
    pub duration_ms: Option<i32>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub file_size: Option<i64>,
    pub date_added: Option<String>,
    pub date_modified: Option<String>,
    pub play_count: i32,
    pub rating: i32,
    pub comment: Option<String>,
    pub artwork_path: Option<String>,
    pub genre: Option<String>,
    pub genre_source: Option<String>, // 'user', 'tag', 'ai'
    // Analysis fields (from track_analysis table via LEFT JOIN)
    pub bpm: Option<f64>,
    pub bpm_confidence: Option<f64>,
    pub musical_key: Option<String>,
    pub key_confidence: Option<f64>,
}

impl From<Track> for TrackDTO {
    fn from(track: Track) -> Self {
        TrackDTO {
            id: track.id,
            file_path: track.file_path,
            file_hash: track.file_hash,
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.album_artist,
            track_number: track.track_number,
            year: track.year,
            label: track.label,
            duration_ms: track.duration_ms,
            file_format: track.file_format,
            bitrate: track.bitrate,
            sample_rate: track.sample_rate,
            file_size: track.file_size,
            date_added: track.date_added,
            date_modified: track.date_modified,
            play_count: track.play_count,
            rating: track.rating,
            comment: track.comment,
            artwork_path: track.artwork_path,
            genre: track.genre,
            genre_source: track.genre_source,
            bpm: None,
            bpm_confidence: None,
            musical_key: None,
            key_confidence: None,
        }
    }
}

impl From<TrackDTO> for Track {
    fn from(dto: TrackDTO) -> Self {
        Track {
            id: dto.id,
            file_path: dto.file_path,
            file_hash: dto.file_hash,
            title: dto.title,
            artist: dto.artist,
            album: dto.album,
            album_artist: dto.album_artist,
            track_number: dto.track_number,
            year: dto.year,
            label: dto.label,
            duration_ms: dto.duration_ms,
            file_format: dto.file_format,
            bitrate: dto.bitrate,
            sample_rate: dto.sample_rate,
            file_size: dto.file_size,
            date_added: dto.date_added,
            date_modified: dto.date_modified,
            play_count: dto.play_count,
            rating: dto.rating,
            comment: dto.comment,
            artwork_path: dto.artwork_path,
            genre: dto.genre,
            genre_source: dto.genre_source,
            // Note: bpm/bpm_confidence are analysis-only fields, not stored on Track
        }
    }
}

/// Progress event emitted during folder scanning
#[derive(Clone, Serialize)]
pub struct ScanProgressEvent {
    pub folder: String,
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Serializable scan result for frontend
#[derive(Debug, Serialize)]
pub struct ScanResultDTO {
    pub total_files: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<ScanErrorDTO>,
}

#[derive(Debug, Serialize)]
pub struct ScanErrorDTO {
    pub file_path: String,
    pub error: String,
}

impl From<ScanResult> for ScanResultDTO {
    fn from(result: ScanResult) -> Self {
        ScanResultDTO {
            total_files: result.total_files,
            imported: result.imported,
            skipped: result.skipped,
            errors: result
                .errors
                .into_iter()
                .map(|e| ScanErrorDTO {
                    file_path: e.file_path.to_string_lossy().to_string(),
                    error: e.error,
                })
                .collect(),
        }
    }
}

/// Initialize the database.
/// Creates parent directories if they don't exist (needed for persistent DB path).
#[tauri::command]
pub fn init_database(
    state: State<AppState>,
    app_handle: tauri::AppHandle,
    db_path: String,
) -> Result<String, AppError> {
    let path = Path::new(&db_path);

    // Create parent directory if it doesn't exist (e.g., ~/Library/Application Support/com.nemanjamarjanovic.recodeck/)
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Internal(format!("Failed to create database directory: {}", e)))?;
        }
    }

    let db = Database::new(path)
        .map_err(|e| AppError::Database(format!("Failed to open database: {}", e)))?;

    db.run_migrations()
        .map_err(|e| AppError::Database(format!("Failed to run migrations: {}", e)))?;

    // PERFORMANCE: Skip expensive maintenance operations on startup
    // Users can run these manually via settings if needed:
    // - remove_duplicate_tracks() - loads all tracks into memory
    // - normalize_all_file_paths() - loads all tracks into memory
    // Both are now exposed as manual commands: cleanup_duplicate_tracks, normalize_file_paths

    // Panic on init is acceptable -- app cannot start without DB
    *state.db_path.lock().unwrap() = Some(db_path);
    *state.db.lock().unwrap() = Some(db);

    // Auto-start companion server if enabled (non-blocking)
    tauri::async_runtime::spawn(
        crate::commands::server::auto_start_companion(app_handle)
    );

    Ok("Database initialized successfully".to_string())
}

/// Get all tracks from the library (includes analysis data like BPM)
#[tauri::command]
pub fn get_all_tracks(state: State<AppState>) -> Result<Vec<TrackDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    // Use LEFT JOIN query to include analysis data (BPM, key, etc.)
    let rows = db.get_all_tracks_with_analysis()
        .map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

    Ok(rows.into_iter().map(|(track, bpm, bpm_conf, key, key_conf)| {
        let mut dto = TrackDTO::from(track);
        dto.bpm = bpm;
        dto.bpm_confidence = bpm_conf;
        dto.musical_key = key;
        dto.key_confidence = key_conf;
        dto
    }).collect())
}

/// Get a single track by ID
#[tauri::command]
pub fn get_track(state: State<AppState>, id: i64) -> Result<TrackDTO, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let track = db.get_track(id)
        .map_err(|e| AppError::Database(format!("Failed to get track: {}", e)))?;

    Ok(TrackDTO::from(track))
}

/// Update a track
#[tauri::command]
pub fn update_track(state: State<AppState>, track: TrackDTO) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.update_track(&Track::from(track))
        .map_err(|e| AppError::Database(format!("Failed to update track: {}", e)))
}

/// Delete a track
#[tauri::command]
pub fn delete_track(state: State<AppState>, id: i64) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.delete_track(id)
        .map_err(|e| AppError::Database(format!("Failed to delete track: {}", e)))
}

/// Count total tracks
#[tauri::command]
pub fn count_tracks(state: State<AppState>) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.count_tracks()
        .map_err(|e| AppError::Database(format!("Failed to count tracks: {}", e)))
}

/// Scan a directory and import tracks.
/// Runs on a background thread so the UI stays responsive.
/// Emits throttled `scan-progress` events for real-time progress.
#[tauri::command]
pub async fn scan_directory(app: AppHandle, path: String) -> Result<ScanResultDTO, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();

        // 1. Load known paths (brief lock)
        let known_paths = {
            let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
            let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
            db.get_all_file_paths().map_err(|e| AppError::Database(format!("Failed to get file paths: {}", e)))?
        }; // lock released

        // 2. Scan filesystem for audio files (no lock needed)
        let files = Scanner::scan_directory(Path::new(&path));
        let total_files = files.len();
        let mut imported = 0;
        let mut skipped = 0;
        let mut errors = Vec::new();
        let mut last_emit = Instant::now();
        let emit_interval = std::time::Duration::from_millis(150);

        for (idx, file_path) in files.iter().enumerate() {
            let file_name = file_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            // Skip files already in DB (no I/O needed)
            let path_str = file_path.to_string_lossy().to_string();
            if known_paths.contains(&path_str) {
                skipped += 1;
                if last_emit.elapsed() >= emit_interval {
                    let _ = app.emit("scan-progress", &ScanProgressEvent {
                        folder: path.clone(), current: idx + 1, total: total_files, current_file: file_name,
                    });
                    last_emit = Instant::now();
                }
                continue;
            }

            // 3. Extract metadata + hash (no lock needed, this is the expensive part)
            let metadata = match Scanner::extract_metadata(file_path) {
                Ok(m) => m,
                Err(e) => {
                    errors.push(crate::scanner::ScanError {
                        file_path: file_path.clone(),
                        error: e,
                    });
                    continue;
                }
            };

            // 4. Insert into DB (brief lock per file)
            let (track, tag_bpm, tag_genre) = metadata;
            {
                let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
                let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

                // Check for duplicate hash
                if track.file_hash != "unknown"
                    && db.track_exists_with_hash(&track.file_hash).unwrap_or(false) {
                        skipped += 1;
                        continue;
                    }

                match db.create_track(&track) {
                    Ok(id) => {
                        if let Some(bpm) = tag_bpm {
                            let _ = db.save_bpm_analysis(id, bpm, 0.99);
                        }
                        if let Some(genre) = tag_genre {
                            let _ = db.save_track_genre(id, &genre, "tag");
                        }
                        imported += 1;
                    }
                    Err(e) => {
                        let err_str = format!("{}", e);
                        if err_str.contains("UNIQUE constraint") {
                            skipped += 1;
                        } else {
                            errors.push(crate::scanner::ScanError {
                                file_path: file_path.clone(),
                                error: err_str,
                            });
                        }
                    }
                }
            } // lock released after each file

            // Throttle: emit at most every 150ms
            if last_emit.elapsed() >= emit_interval {
                let _ = app.emit("scan-progress", &ScanProgressEvent {
                    folder: path.clone(), current: idx + 1, total: total_files, current_file: file_name,
                });
                last_emit = Instant::now();
            }
        }

        // Always emit final progress (100%)
        if total_files > 0 {
            let _ = app.emit("scan-progress", &ScanProgressEvent {
                folder: path.clone(),
                current: total_files,
                total: total_files,
                current_file: String::new(),
            });
        }

        Ok(ScanResultDTO::from(ScanResult {
            total_files,
            imported,
            skipped,
            errors,
        }))
    }).await.map_err(|e| AppError::Internal(format!("Scan task failed: {}", e)))?
}

/// Search tracks by query string across all text fields (includes analysis data)
#[tauri::command]
pub fn search_tracks(state: State<AppState>, query: String) -> Result<Vec<TrackDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let rows = db.search_tracks_with_analysis(&query)
        .map_err(|e| AppError::Database(format!("Failed to search tracks: {}", e)))?;

    Ok(rows.into_iter().map(|(track, bpm, bpm_conf, key, key_conf)| {
        let mut dto = TrackDTO::from(track);
        dto.bpm = bpm;
        dto.bpm_confidence = bpm_conf;
        dto.musical_key = key;
        dto.key_confidence = key_conf;
        dto
    }).collect())
}

/// Get list of audio files in a directory (without importing)
#[tauri::command]
pub fn list_audio_files(path: String) -> Result<Vec<String>, AppError> {
    let files = Scanner::scan_directory(Path::new(&path));
    Ok(files
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Folder info for the folder tree panel
#[derive(Debug, Serialize)]
pub struct FolderInfoDTO {
    pub name: String,
    pub path: String,
    pub track_count: i64,
    pub has_subfolders: bool,
}

/// List immediate subdirectories of a path, with track counts from DB
#[tauri::command]
pub fn list_subdirectories(state: State<AppState>, path: String) -> Result<Vec<FolderInfoDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(AppError::Validation(format!("Not a directory: {}", path)));
    }

    let mut folders = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    // Skip hidden folders (starting with .)
                    if name.starts_with('.') {
                        continue;
                    }

                    let folder_path = entry.path().to_string_lossy().to_string();

                    // Count tracks directly in this folder (shallow, non-recursive) from DB
                    // This matches what the user sees when clicking this subfolder
                    let track_count = db.count_tracks_in_folder_shallow(&folder_path).unwrap_or(0);

                    // Check if this folder has subdirectories
                    let has_subfolders = std::fs::read_dir(entry.path())
                        .map(|entries| {
                            entries.flatten().any(|e| {
                                e.file_type().map(|t| t.is_dir()).unwrap_or(false)
                                    && !e
                                        .file_name()
                                        .to_string_lossy()
                                        .starts_with('.')
                            })
                        })
                        .unwrap_or(false);

                    folders.push(FolderInfoDTO {
                        name,
                        path: folder_path,
                        track_count,
                        has_subfolders,
                    });
                }
            }
        }
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(folders)
}

/// Get tracks in a specific folder (by file_path prefix), includes analysis data
#[tauri::command]
pub fn get_tracks_in_folder(state: State<AppState>, path: String) -> Result<Vec<TrackDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let rows = db
        .get_tracks_in_folder_with_analysis(&path)
        .map_err(|e| AppError::Database(format!("Failed to get tracks in folder: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|(track, bpm, bpm_conf, key, key_conf)| {
            let mut dto = TrackDTO::from(track);
            dto.bpm = bpm;
            dto.bpm_confidence = bpm_conf;
            dto.musical_key = key;
            dto.key_confidence = key_conf;
            dto
        })
        .collect())
}

/// Count tracks in a specific folder (by file_path prefix)
#[tauri::command]
pub fn count_tracks_in_folder(state: State<AppState>, path: String) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.count_tracks_in_folder(&path)
        .map_err(|e| AppError::Database(format!("Failed to count tracks: {}", e)))
}

/// Get tracks directly in a specific folder (non-recursive, shallow), includes analysis data
#[tauri::command]
pub fn get_tracks_in_folder_shallow(state: State<AppState>, path: String) -> Result<Vec<TrackDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let rows = db
        .get_tracks_in_folder_shallow_with_analysis(&path)
        .map_err(|e| AppError::Database(format!("Failed to get tracks in folder (shallow): {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|(track, bpm, bpm_conf, key, key_conf)| {
            let mut dto = TrackDTO::from(track);
            dto.bpm = bpm;
            dto.bpm_confidence = bpm_conf;
            dto.musical_key = key;
            dto.key_confidence = key_conf;
            dto
        })
        .collect())
}

/// Count tracks directly in a specific folder (non-recursive, shallow)
#[tauri::command]
pub fn count_tracks_in_folder_shallow(state: State<AppState>, path: String) -> Result<i64, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.count_tracks_in_folder_shallow(&path)
        .map_err(|e| AppError::Database(format!("Failed to count tracks (shallow): {}", e)))
}

/// Clean up tracks that are not in any of the configured library folders.
/// Removes stray files (like Viber voice messages) that were accidentally imported.
/// If no folders are configured, removes ALL tracks.
/// Returns the number of deleted tracks.
#[tauri::command]
pub fn cleanup_stray_tracks(state: State<AppState>) -> Result<usize, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    // Get library folders from settings
    let folders_json = db.get_setting("library_folders")
        .map_err(|e| AppError::Database(format!("Failed to get library folders: {}", e)))?;

    let library_folders: Vec<String> = match folders_json {
        Some(json) => serde_json::from_str(&json).unwrap_or_default(),
        None => Vec::new(),
    };

    // If no folders configured, remove ALL tracks (since none are valid)
    // Otherwise, remove tracks not in configured folders
    db.remove_tracks_not_in_folders(&library_folders)
        .map_err(|e| AppError::Database(format!("Failed to cleanup tracks: {}", e)))
}

/// Remove duplicate tracks that share the same file content (same hash) or same filename.
/// Keeps the track with the lowest ID (earliest import) for each duplicate group.
/// Returns the number of deleted duplicates.
#[tauri::command]
pub fn cleanup_duplicate_tracks(state: State<AppState>) -> Result<usize, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.remove_duplicate_tracks()
        .map_err(|e| AppError::Database(format!("Failed to cleanup duplicates: {}", e)))
}

/// A group of duplicate tracks, returned by the "review" flow (get_duplicate_groups).
/// `tracks` is ordered by id ASC — the first element is the earliest import and
/// the recommended "keep". `detection_reason` explains why the group was flagged.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroupDTO {
    pub detection_reason: String,
    pub tracks: Vec<TrackDTO>,
}

/// Return every duplicate group the app can detect, without deleting anything.
#[tauri::command]
pub fn get_duplicate_groups(
    state: State<AppState>,
) -> Result<Vec<DuplicateGroupDTO>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let groups = db
        .get_duplicate_groups()
        .map_err(|e| AppError::Database(format!("Failed to get duplicate groups: {}", e)))?;

    Ok(groups
        .into_iter()
        .map(|(reason, tracks)| DuplicateGroupDTO {
            detection_reason: reason,
            tracks: tracks.into_iter().map(TrackDTO::from).collect(),
        })
        .collect())
}

/// Delete a list of tracks in bulk. Cleans up `track_analysis` and
/// `playlist_tracks` rows for each id. Returns the number of rows removed.
#[tauri::command]
pub fn delete_tracks_bulk(
    state: State<AppState>,
    track_ids: Vec<i64>,
) -> Result<usize, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.bulk_delete_tracks(&track_ids)
        .map_err(|e| AppError::Database(format!("Failed to bulk-delete tracks: {}", e)))
}

/// Normalize all file paths in the database (remove double slashes, trailing slashes).
/// Fixes paths that were stored incorrectly during scanning.
/// Returns the number of tracks updated.
#[tauri::command]
pub fn normalize_file_paths(state: State<AppState>) -> Result<usize, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.normalize_all_file_paths()
        .map_err(|e| AppError::Database(format!("Failed to normalize file paths: {}", e)))
}

/// Debug info about tracks in database
#[derive(Debug, Serialize)]
pub struct DebugTrackInfo {
    pub id: i64,
    pub file_path: String,
    pub file_hash: String,
    pub filename: String,
}

/// Get debug info about all tracks (for troubleshooting duplicates)
#[tauri::command]
pub fn get_debug_tracks(state: State<AppState>) -> Result<Vec<DebugTrackInfo>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let tracks = db.get_all_tracks()
        .map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

    Ok(tracks.into_iter().filter_map(|t| {
        t.id.map(|id| {
            let filename = t.file_path
                .rsplit('/')
                .next()
                .unwrap_or(&t.file_path)
                .to_string();
            DebugTrackInfo {
                id,
                file_path: t.file_path,
                file_hash: t.file_hash,
                filename,
            }
        })
    }).collect())
}

/// Extract embedded album artwork from an audio file.
/// Returns binary image data (JPEG or PNG) from the file's embedded tags,
/// or falls back to a folder cover image (cover.jpg, folder.jpg, etc.).
/// Returns an error string "no_artwork" if no artwork is found.
#[tauri::command]
pub async fn get_track_artwork(
    track_id: i64,
    state: State<'_, AppState>,
) -> Result<Response, String> {
    use lofty::file::TaggedFileExt;

    let file_path = {
        let db = state.db.lock().unwrap();
        let db = db.as_ref().ok_or("Database not initialized")?;
        let track = db.get_track(track_id).map_err(|e| e.to_string())?;
        track.file_path.clone()
    };

    // Try embedded art via lofty
    if let Ok(tagged_file) = lofty::read_from_path(&file_path) {
        for tag in tagged_file.tags() {
            if let Some(picture) = tag.pictures().first() {
                let data: Vec<u8> = picture.data().to_vec();
                return Ok(Response::new(data));
            }
        }
    }

    // Try folder cover images
    if let Some(folder) = std::path::Path::new(&file_path).parent() {
        for name in &[
            "cover.jpg", "cover.png",
            "folder.jpg", "folder.png",
            "Cover.jpg", "Cover.png",
            "Folder.jpg", "Folder.png",
        ] {
            let cover_path = folder.join(name);
            if cover_path.exists() {
                if let Ok(bytes) = std::fs::read(&cover_path) {
                    return Ok(Response::new(bytes));
                }
            }
        }
    }

    Err("no_artwork".to_string())
}

// --- Folder mutation helpers ---

/// Reject empty names or names containing path separators / shell-unsafe chars.
fn validate_folder_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "Folder name cannot be empty".to_string(),
        ));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(AppError::Validation("Invalid folder name".to_string()));
    }
    const FORBIDDEN: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    if trimmed.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(AppError::Validation(
            "Folder name cannot contain any of: / \\ : * ? \" < > |".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Load registered library root folders from settings.
fn library_roots(db: &Database) -> Result<Vec<String>, AppError> {
    let raw = db
        .get_setting("library_folders")
        .map_err(|e| AppError::Database(format!("Failed to read library_folders: {}", e)))?;
    match raw {
        Some(json) => serde_json::from_str::<Vec<String>>(&json).map_err(|e| {
            AppError::Internal(format!("Invalid library_folders JSON: {}", e))
        }),
        None => Ok(Vec::new()),
    }
}

/// Canonicalize and confirm `target` sits inside one of the registered library roots.
fn assert_within_library_roots(db: &Database, target: &Path) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(target)
        .map_err(|e| AppError::Validation(format!("Invalid path '{}': {}", target.display(), e)))?;
    let roots = library_roots(db)?;
    let within = roots.iter().any(|folder| {
        std::fs::canonicalize(folder)
            .map(|canon| canonical.starts_with(&canon))
            .unwrap_or(false)
    });
    if !within {
        return Err(AppError::Validation(format!(
            "Path is not within a registered library folder: {}",
            target.display()
        )));
    }
    Ok(())
}

/// Reject operating on a path that IS itself a library root.
fn assert_not_library_root(db: &Database, target: &Path) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(target)
        .map_err(|e| AppError::Validation(format!("Invalid path '{}': {}", target.display(), e)))?;
    let roots = library_roots(db)?;
    let is_root = roots.iter().any(|folder| {
        std::fs::canonicalize(folder)
            .map(|canon| canon == canonical)
            .unwrap_or(false)
    });
    if is_root {
        return Err(AppError::Validation(
            "Cannot modify a library root folder; remove it from the library instead".to_string(),
        ));
    }
    Ok(())
}

/// Create a new subdirectory inside `parent_path`. Returns the absolute path of the new folder.
#[tauri::command]
pub fn create_folder_on_disk(
    state: State<AppState>,
    parent_path: String,
    folder_name: String,
) -> Result<String, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let clean_name = validate_folder_name(&folder_name)?;
    let parent = Path::new(&parent_path);
    if !parent.is_dir() {
        return Err(AppError::Validation(format!(
            "Parent path is not a directory: {}",
            parent_path
        )));
    }
    assert_within_library_roots(db, parent)?;

    let new_path = parent.join(&clean_name);
    if new_path.exists() {
        return Err(AppError::Validation(format!(
            "A file or folder already exists at: {}",
            new_path.display()
        )));
    }
    std::fs::create_dir(&new_path)
        .map_err(|e| AppError::Internal(format!("Failed to create folder: {}", e)))?;

    Ok(new_path.to_string_lossy().to_string())
}

/// Rename an existing folder. Also rewrites tracks.file_path rows whose prefix matched.
#[tauri::command]
pub fn rename_folder_on_disk(
    state: State<AppState>,
    folder_path: String,
    new_name: String,
) -> Result<String, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let clean_name = validate_folder_name(&new_name)?;

    let old = Path::new(&folder_path);
    if !old.is_dir() {
        return Err(AppError::Validation(format!(
            "Folder does not exist: {}",
            folder_path
        )));
    }
    assert_within_library_roots(db, old)?;
    assert_not_library_root(db, old)?;

    let parent = old
        .parent()
        .ok_or_else(|| AppError::Validation("Folder has no parent directory".to_string()))?;
    let new_path = parent.join(&clean_name);

    if new_path == old {
        return Ok(folder_path);
    }
    if new_path.exists() {
        return Err(AppError::Validation(format!(
            "A file or folder already exists at: {}",
            new_path.display()
        )));
    }

    std::fs::rename(old, &new_path)
        .map_err(|e| AppError::Internal(format!("Failed to rename folder: {}", e)))?;

    let new_path_str = new_path.to_string_lossy().to_string();
    db.rename_tracks_folder(&folder_path, &new_path_str)
        .map_err(|e| AppError::Database(format!("Failed to update track paths: {}", e)))?;

    Ok(new_path_str)
}

/// Delete a folder. If `delete_files` is true, recursively removes the folder and
/// all its contents; otherwise std::fs::remove_dir will fail on non-empty folders
/// (the caller should ensure it's empty first).
#[tauri::command]
pub fn delete_folder_on_disk(
    state: State<AppState>,
    folder_path: String,
    delete_files: bool,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let target = Path::new(&folder_path);
    if !target.is_dir() {
        return Err(AppError::Validation(format!(
            "Folder does not exist: {}",
            folder_path
        )));
    }
    assert_within_library_roots(db, target)?;
    assert_not_library_root(db, target)?;

    if delete_files {
        std::fs::remove_dir_all(target)
            .map_err(|e| AppError::Internal(format!("Failed to delete folder: {}", e)))?;
    } else {
        std::fs::remove_dir(target).map_err(|e| {
            AppError::Validation(format!(
                "Folder is not empty or could not be removed: {}",
                e
            ))
        })?;
    }

    db.delete_tracks_in_folder_prefix(&folder_path)
        .map_err(|e| AppError::Database(format!("Failed to delete tracks: {}", e)))?;

    Ok(())
}
