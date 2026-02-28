// File system watcher -- watches library folders for new/removed audio files
// and emits Tauri events so the frontend auto-refreshes.

use crate::error::AppError;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// Managed state holding the active file watcher (so it doesn't get dropped).
pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self::new()
    }
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

/// Audio file extensions we care about
fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "aiff" | "aif"
            )
        })
        .unwrap_or(false)
}

/// Start watching the given library folders for file changes.
/// When audio files are created, modified, or removed, emits a "library-changed" event
/// so the frontend can re-scan and reload.
#[tauri::command]
pub fn start_file_watcher(
    app: AppHandle,
    watcher_state: State<WatcherState>,
    folders: Vec<String>,
) -> Result<(), AppError> {
    let mut watcher_lock = watcher_state.watcher.lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;

    // Drop any existing watcher first
    *watcher_lock = None;

    if folders.is_empty() {
        return Ok(());
    }

    // Debounce: only emit events if enough time has passed since the last one
    let last_emit = std::sync::Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10)));
    let app_handle = app.clone();

    let watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            // Catch panics to prevent watcher thread from crashing the app
            let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
                if let Ok(event) = result {
                    // Only react to create/modify/remove events
                    let dominated = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    );
                    if !dominated {
                        return;
                    }

                    // Check if any affected path is an audio file
                    let has_audio = event.paths.iter().any(|p| is_audio_file(p));
                    if !has_audio {
                        return;
                    }

                    // Debounce: at most one event per 2 seconds
                    if let Ok(mut last) = last_emit.lock() {
                        if last.elapsed() < Duration::from_secs(2) {
                            return;
                        }
                        *last = Instant::now();
                    }

                    // Emit event to frontend
                    let _ = app_handle.emit("library-changed", ());
                }
            }));
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .map_err(|e| AppError::Internal(format!("Failed to create file watcher: {}", e)))?;

    *watcher_lock = Some(watcher);

    // Now watch each folder
    let watcher_ref = watcher_lock.as_mut().unwrap();
    for folder in &folders {
        let path = Path::new(folder);
        if path.is_dir() {
            watcher_ref
                .watch(path, RecursiveMode::Recursive)
                .map_err(|e| AppError::Internal(format!("Failed to watch {}: {}", folder, e)))?;
        }
    }

    Ok(())
}
