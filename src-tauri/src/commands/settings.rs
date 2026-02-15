// Tauri commands for app settings management
// Handles library folders, theme selection, and generic key-value settings.
// All settings are stored in the SQLite `settings` table as JSON strings.

use crate::commands::library::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Response type for library folder operations
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryFoldersResponse {
    pub folders: Vec<String>,
}

// --- Generic settings commands ---

/// Get a setting by key. Returns null if not found.
#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.get_setting(&key)
        .map_err(|e| format!("Failed to get setting '{}': {}", key, e))
}

/// Set a setting value (upsert).
#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.set_setting(&key, &value)
        .map_err(|e| format!("Failed to set setting '{}': {}", key, e))
}

// --- Library folder management ---

/// Get all saved library folders.
/// Returns an empty array if no folders have been configured.
#[tauri::command]
pub fn get_library_folders(state: State<AppState>) -> Result<Vec<String>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let value = db
        .get_setting("library_folders")
        .map_err(|e| format!("Failed to get library folders: {}", e))?;

    match value {
        Some(json_str) => {
            let folders: Vec<String> = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse library folders JSON: {}", e))?;
            Ok(folders)
        }
        None => Ok(Vec::new()),
    }
}

/// Add a library folder. Prevents duplicates.
/// Returns the updated list of folders.
#[tauri::command]
pub fn add_library_folder(state: State<AppState>, path: String) -> Result<Vec<String>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Load existing folders
    let mut folders = match db
        .get_setting("library_folders")
        .map_err(|e| format!("Failed to get library folders: {}", e))?
    {
        Some(json_str) => serde_json::from_str::<Vec<String>>(&json_str)
            .map_err(|e| format!("Failed to parse library folders JSON: {}", e))?,
        None => Vec::new(),
    };

    // Check for duplicates (case-sensitive path comparison)
    if folders.contains(&path) {
        return Err(format!("Folder already in library: {}", path));
    }

    // Verify the path exists and is a directory
    let dir_path = std::path::Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Add the folder
    folders.push(path);

    // Save back to settings
    let json_str = serde_json::to_string(&folders)
        .map_err(|e| format!("Failed to serialize library folders: {}", e))?;
    db.set_setting("library_folders", &json_str)
        .map_err(|e| format!("Failed to save library folders: {}", e))?;

    Ok(folders)
}

/// Remove a library folder by path.
/// Returns the updated list of folders.
#[tauri::command]
pub fn remove_library_folder(state: State<AppState>, path: String) -> Result<Vec<String>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Load existing folders
    let mut folders = match db
        .get_setting("library_folders")
        .map_err(|e| format!("Failed to get library folders: {}", e))?
    {
        Some(json_str) => serde_json::from_str::<Vec<String>>(&json_str)
            .map_err(|e| format!("Failed to parse library folders JSON: {}", e))?,
        None => Vec::new(),
    };

    // Remove the folder
    let original_len = folders.len();
    folders.retain(|f| f != &path);

    if folders.len() == original_len {
        return Err(format!("Folder not found in library: {}", path));
    }

    // Save back to settings
    let json_str = serde_json::to_string(&folders)
        .map_err(|e| format!("Failed to serialize library folders: {}", e))?;
    db.set_setting("library_folders", &json_str)
        .map_err(|e| format!("Failed to save library folders: {}", e))?;

    Ok(folders)
}

// --- Theme commands ---

/// Get the current theme. Returns "midnight" as default if not set.
#[tauri::command]
pub fn get_theme(state: State<AppState>) -> Result<String, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let value = db
        .get_setting("theme")
        .map_err(|e| format!("Failed to get theme: {}", e))?;

    Ok(value.unwrap_or_else(|| "midnight".to_string()))
}

/// Set the current theme. Validates against known theme names.
#[tauri::command]
pub fn set_theme(state: State<AppState>, theme: String) -> Result<(), String> {
    // Validate theme name
    let valid_themes = ["midnight", "carbon", "dawn", "neon"];
    if !valid_themes.contains(&theme.as_str()) {
        return Err(format!(
            "Invalid theme '{}'. Valid themes: {}",
            theme,
            valid_themes.join(", ")
        ));
    }

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.set_setting("theme", &theme)
        .map_err(|e| format!("Failed to save theme: {}", e))
}
