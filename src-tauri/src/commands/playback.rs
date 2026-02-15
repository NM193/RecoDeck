use crate::audio::decoder::AudioDecoder;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::task;

/// Playback state shared across commands
pub struct PlaybackState {
    pub decoder: Arc<Mutex<Option<AudioDecoder>>>,
    pub is_playing: Arc<Mutex<bool>>,
    pub current_track_id: Arc<Mutex<Option<i64>>>,
    pub task_generation: Arc<Mutex<u64>>,
}

impl PlaybackState {
    pub fn new() -> Self {
        Self {
            decoder: Arc::new(Mutex::new(None)),
            is_playing: Arc::new(Mutex::new(false)),
            current_track_id: Arc::new(Mutex::new(None)),
            task_generation: Arc::new(Mutex::new(0)),
        }
    }
}

/// Playback status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackStatus {
    pub is_playing: bool,
    pub track_id: Option<i64>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub sample_rate: u32,
}

/// Load and prepare a track for playback
#[tauri::command]
pub async fn load_track(
    track_id: i64,
    app_state: State<'_, crate::commands::library::AppState>,
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    // Get track from database
    let db = app_state.db.lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;
    
    let db = db.as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let track = db.get_track(track_id)
        .map_err(|e| format!("Failed to get track: {}", e))?;
    let file_path = PathBuf::from(&track.file_path);

    // Create decoder
    let decoder = AudioDecoder::new(&file_path)?;

    let sample_rate = decoder.sample_rate();
    let duration_ms = decoder.duration_ms();

    // Increment generation to cancel any running tasks
    {
        let mut gen = playback_state.task_generation.lock()
            .map_err(|e| format!("Failed to lock generation: {}", e))?;
        *gen += 1;
    }

    // Store decoder
    let mut decoder_lock = playback_state.decoder.lock()
        .map_err(|e| format!("Failed to lock decoder: {}", e))?;
    *decoder_lock = Some(decoder);

    // Update state
    let mut track_id_lock = playback_state.current_track_id.lock()
        .map_err(|e| format!("Failed to lock track ID: {}", e))?;
    *track_id_lock = Some(track_id);

    let mut is_playing_lock = playback_state.is_playing.lock()
        .map_err(|e| format!("Failed to lock playing state: {}", e))?;
    *is_playing_lock = false;

    Ok(PlaybackStatus {
        is_playing: false,
        track_id: Some(track_id),
        position_ms: 0,
        duration_ms,
        sample_rate,
    })
}

/// Start streaming audio chunks to the frontend
#[tauri::command]
pub async fn play(
    app: AppHandle,
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    // Set playing state
    {
        let mut is_playing = playback_state.is_playing.lock()
            .map_err(|e| format!("Failed to lock playing state: {}", e))?;
        *is_playing = true;
    }

    // Clone the Arc pointers (not the entire state)
    let decoder_arc = Arc::clone(&playback_state.decoder);
    let is_playing_arc = Arc::clone(&playback_state.is_playing);
    let generation_arc = Arc::clone(&playback_state.task_generation);

    // Capture current generation
    let current_generation = {
        let gen = playback_state.task_generation.lock().unwrap();
        *gen
    };

    // Spawn background task to stream audio chunks
    task::spawn(async move {
        let mut consecutive_errors = 0;
        // Increased limit since decode errors are now handled internally by skipping packets
        // This limit is mainly for other types of errors (I/O, etc.)
        const MAX_CONSECUTIVE_ERRORS: u32 = 20;

        loop {
            // Check if task was cancelled (generation changed)
            {
                let gen = generation_arc.lock().unwrap();
                if *gen != current_generation {
                    println!("[playback] Task cancelled (generation mismatch)");
                    break;
                }
            }

            // Check if still playing
            let is_playing = {
                let is_playing_lock = is_playing_arc.lock().unwrap();
                *is_playing_lock
            };

            if !is_playing {
                break;
            }

            // Decode next chunk
            let chunk_result = {
                let mut decoder_lock = decoder_arc.lock().unwrap();
                if let Some(decoder) = decoder_lock.as_mut() {
                    decoder.decode_next_chunk()
                } else {
                    break;
                }
            };

            match chunk_result {
                Ok(Some(chunk)) => {
                    // Reset error counter on successful decode
                    consecutive_errors = 0;
                    
                    if chunk.is_end {
                        // End of track reached - only log warnings for early end
                        let position_ms = chunk.position_ms;
                        let duration_ms = chunk.duration_ms;
                        let gap_ms = if duration_ms > position_ms {
                            duration_ms - position_ms
                        } else {
                            0
                        };

                        if gap_ms > 30000 {
                            eprintln!("[playback] WARNING: Track ended early! position={}ms, duration={}ms, gap={}ms (~{}s)",
                                     position_ms, duration_ms, gap_ms, gap_ms / 1000);
                        }

                        let _ = app.emit("audio-ended", ());
                        break;
                    }

                    // Emit chunk to frontend
                    if app.emit("audio-chunk", &chunk).is_err() {
                        break;
                    }

                    // Small delay to prevent overwhelming the IPC channel
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
                Ok(None) => {
                    // End of file - only log warnings for early end
                    let (position_ms, duration_ms) = {
                        let decoder_lock = decoder_arc.lock().unwrap();
                        if let Some(decoder) = decoder_lock.as_ref() {
                            (decoder.current_position_ms(), decoder.duration_ms())
                        } else {
                            (0, 0)
                        }
                    };
                    let gap_ms = if duration_ms > position_ms {
                        duration_ms - position_ms
                    } else {
                        0
                    };

                    if gap_ms > 30000 {
                        eprintln!("[playback] WARNING: Track ended early (Ok(None))! position={}ms, duration={}ms, gap={}ms (~{}s)",
                                 position_ms, duration_ms, gap_ms, gap_ms / 1000);
                    }

                    let _ = app.emit("audio-ended", ());
                    break;
                }
                Err(e) => {
                    // Non-decode errors (I/O errors, etc.) - decode errors are now handled internally
                    consecutive_errors += 1;
                    
                    // Get current position for logging
                    let position_ms = {
                        let decoder_lock = decoder_arc.lock().unwrap();
                        if let Some(decoder) = decoder_lock.as_ref() {
                            decoder.current_position_ms()
                        } else {
                            0
                        }
                    };
                    
                    eprintln!("[playback] Playback error (attempt {}/{}): {} (position={}ms)", 
                              consecutive_errors, MAX_CONSECUTIVE_ERRORS, e, position_ms);
                    
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                        eprintln!("[playback] Too many consecutive errors, stopping playback");
                        let _ = app.emit("audio-error", format!("Playback error: {}", e));
                        break;
                    }
                    
                    // Brief pause before retry (transient errors after seek may resolve)
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }
            }
        }

        // Reset playing state when done
        let mut is_playing = is_playing_arc.lock().unwrap();
        *is_playing = false;
    });

    get_playback_status(playback_state).await
}

/// Pause playback
#[tauri::command]
pub async fn pause(
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    {
        let mut is_playing = playback_state.is_playing.lock()
            .map_err(|e| format!("Failed to lock playing state: {}", e))?;
        *is_playing = false;
    }

    get_playback_status(playback_state).await
}

/// Resume playback
#[tauri::command]
pub async fn resume(
    app: AppHandle,
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    play(app, playback_state).await
}

/// Seek to a specific position in milliseconds
#[tauri::command]
pub async fn seek(
    position_ms: u64,
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    // Increment generation first to cancel running task
    {
        let mut gen = playback_state.task_generation.lock()
            .map_err(|e| format!("Failed to lock generation: {}", e))?;
        *gen += 1;
    }

    // Brief delay to ensure old task notices cancellation
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    {
        let mut decoder_lock = playback_state.decoder.lock()
            .map_err(|e| format!("Failed to lock decoder: {}", e))?;

        if let Some(decoder) = decoder_lock.as_mut() {
            decoder.seek(position_ms)?;
        }
    }

    get_playback_status(playback_state).await
}

/// Stop playback and unload track
#[tauri::command]
pub async fn stop(
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    let mut is_playing = playback_state.is_playing.lock()
        .map_err(|e| format!("Failed to lock playing state: {}", e))?;
    *is_playing = false;

    let mut decoder_lock = playback_state.decoder.lock()
        .map_err(|e| format!("Failed to lock decoder: {}", e))?;
    *decoder_lock = None;

    let mut track_id_lock = playback_state.current_track_id.lock()
        .map_err(|e| format!("Failed to lock track ID: {}", e))?;
    *track_id_lock = None;

    Ok(PlaybackStatus {
        is_playing: false,
        track_id: None,
        position_ms: 0,
        duration_ms: 0,
        sample_rate: 0,
    })
}

/// Get current playback status
#[tauri::command]
pub async fn get_playback_status(
    playback_state: State<'_, PlaybackState>,
) -> Result<PlaybackStatus, String> {
    let is_playing = {
        let is_playing_lock = playback_state.is_playing.lock()
            .map_err(|e| format!("Failed to lock playing state: {}", e))?;
        *is_playing_lock
    };

    let track_id = {
        let track_id_lock = playback_state.current_track_id.lock()
            .map_err(|e| format!("Failed to lock track ID: {}", e))?;
        *track_id_lock
    };

    let (position_ms, duration_ms, sample_rate) = {
        let decoder_lock = playback_state.decoder.lock()
            .map_err(|e| format!("Failed to lock decoder: {}", e))?;

        if let Some(decoder) = decoder_lock.as_ref() {
            (decoder.current_position_ms(), decoder.duration_ms(), decoder.sample_rate())
        } else {
            (0, 0, 0)
        }
    };

    Ok(PlaybackStatus {
        is_playing,
        track_id,
        position_ms,
        duration_ms,
        sample_rate,
    })
}
