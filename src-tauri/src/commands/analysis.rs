// Tauri commands for audio analysis (BPM, key, loudness, etc.)
//
// These commands bridge the Rust DSP analysis modules to the frontend.
// Each analysis command:
// 1. Reads the track's file_path from the database
// 2. Runs the analysis algorithm on the audio file
// 3. Stores results back in the track_analysis table
// 4. Returns the result to the frontend

use crate::audio::bpm;
use crate::audio::decoder;
use crate::audio::key;
use crate::commands::library::AppState;
use crate::error::AppError;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};

/// DTO for full track analysis result sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackAnalysisDTO {
    pub track_id: i64,
    pub bpm: Option<f64>,
    pub bpm_confidence: Option<f64>,
    pub musical_key: Option<String>,
    pub key_confidence: Option<f64>,
    pub loudness_lufs: Option<f64>,
    pub dynamic_range: Option<f64>,
    pub spectral_centroid: Option<f64>,
    pub analyzed_at: Option<String>,
}

/// Get the analysis data for a track (returns whatever analysis has been done so far)
#[tauri::command]
pub fn get_track_analysis(state: State<AppState>, track_id: i64) -> Result<Option<TrackAnalysisDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let analysis = db.get_track_analysis(track_id)
        .map_err(|e| AppError::Database(format!("Failed to get analysis for track {}: {}", track_id, e)))?;

    Ok(analysis.map(|a| TrackAnalysisDTO {
        track_id: a.track_id,
        bpm: a.bpm,
        bpm_confidence: a.bpm_confidence,
        musical_key: a.musical_key,
        key_confidence: a.key_confidence,
        loudness_lufs: a.loudness_lufs,
        dynamic_range: a.dynamic_range,
        spectral_centroid: a.spectral_centroid,
        analyzed_at: a.analyzed_at,
    }))
}

/// DTO for waveform data sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformDTO {
    pub track_id: i64,
    pub data: Vec<u8>, // Binary BLOB
}

/// Analyze waveform for a track and store in database.
/// Generates both overview (2500 points) and detail (10000 points) waveforms.
/// This is idempotent - if waveform already exists, it will be regenerated.
#[tauri::command]
pub fn analyze_waveform(state: State<AppState>, track_id: i64) -> Result<(), AppError> {
    use crate::audio::waveform::generate_waveform;

    // Get the track's file path from the database
    let file_path = {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        let track = db.get_track(track_id)
            .map_err(|e| AppError::Database(format!("Failed to get track {}: {}", track_id, e)))?;
        track.file_path
    };

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("Audio file not found: {}", file_path)));
    }

    eprintln!("[analyze_waveform] Analyzing track {} at: {}", track_id, file_path);

    // Generate overview waveform (2500 points - full track view)
    let overview = generate_waveform(path, 2500)
        .map_err(|e| AppError::Internal(format!("Failed to generate overview waveform: {}", e)))?;
    let overview_blob = overview.to_blob();

    // Generate detail waveform (10000 points - for zoom)
    let detail = generate_waveform(path, 10000)
        .map_err(|e| AppError::Internal(format!("Failed to generate detail waveform: {}", e)))?;
    let detail_blob = detail.to_blob();

    eprintln!(
        "[analyze_waveform] Track {}: overview={} bytes, detail={} bytes",
        track_id,
        overview_blob.len(),
        detail_blob.len()
    );

    // Save to database
    {
        let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
        db.save_waveform(track_id, &overview_blob, &detail_blob)
            .map_err(|e| AppError::Database(format!("Failed to save waveform: {}", e)))?;
    }

    Ok(())
}

/// Get waveform data for a track.
/// Level: "overview" or "detail"
/// Returns binary BLOB that frontend will deserialize.
#[tauri::command]
pub fn get_waveform(state: State<AppState>, track_id: i64, level: String) -> Result<Option<Vec<u8>>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.get_waveform(track_id, &level)
        .map_err(|e| AppError::Database(format!("Failed to get waveform: {}", e)))
}

// --- Batch analysis (parallel, decode-once, event-driven) ---

/// Progress event emitted per-track during batch analysis
#[derive(Clone, Serialize)]
pub struct AnalysisProgressEvent {
    pub current: usize,
    pub total: usize,
    pub track_id: i64,
    pub track_name: String,
    pub bpm: Option<f64>,
    pub musical_key: Option<String>,
}

/// Completion event emitted when batch analysis finishes or is cancelled
#[derive(Clone, Serialize)]
pub struct AnalysisCompleteEvent {
    pub total_analyzed: usize,
    pub total_requested: usize,
    pub total_failed: usize,
    pub cancelled: bool,
}

/// Analyze multiple tracks in parallel using Rayon.
/// Decodes each file once and runs BPM + Key detection on the shared audio data.
/// Progress and completion are reported via Tauri events.
/// Returns immediately — all work (including DB gathering) happens on a background thread.
#[tauri::command]
pub async fn analyze_tracks_batch(
    app: AppHandle,
    track_ids: Vec<i64>,
    force: bool,
) -> Result<(), AppError> {
    // Reset cancellation flag (AtomicBool — no lock needed)
    let state = app.state::<AppState>();
    state.analysis_cancelled.store(false, Ordering::SeqCst);
    let cancelled = state.analysis_cancelled.clone();

    // Everything runs in background — command returns immediately
    tauri::async_runtime::spawn(async move {
        // Gather track info from DB on a blocking thread (avoids blocking async runtime)
        let app2 = app.clone();
        let track_ids2 = track_ids.clone();
        let gather_result = tauri::async_runtime::spawn_blocking(move || {
            let state = app2.state::<AppState>();
            let db_lock = state.db.lock().map_err(|_| "State lock failed".to_string())?;
            let db = db_lock.as_ref().ok_or_else(|| "Database not initialized".to_string())?;

            let tracks: Vec<(i64, String, String)> = track_ids2
                .iter()
                .filter_map(|&id| {
                    let track = db.get_track(id).ok()?;
                    if !force {
                        let has_bpm = db.has_bpm_analysis(id).unwrap_or(false);
                        let has_key = db.has_key_analysis(id).unwrap_or(false);
                        if has_bpm && has_key {
                            return None;
                        }
                    }
                    let name = track.title.clone().unwrap_or_else(|| {
                        track.file_path.rsplit('/').next().unwrap_or("Unknown").to_string()
                    });
                    Some((id, track.file_path, name))
                })
                .collect();
            Ok::<_, String>(tracks)
        }).await;

        let tracks_to_analyze = match gather_result {
            Ok(Ok(t)) => t,
            _ => {
                let _ = app.emit("analysis-complete", &AnalysisCompleteEvent {
                    total_analyzed: 0, total_requested: track_ids.len(),
                    total_failed: 0, cancelled: false,
                });
                return;
            }
        };

        let total = tracks_to_analyze.len();
        if total == 0 {
            let _ = app.emit("analysis-complete", &AnalysisCompleteEvent {
                total_analyzed: 0, total_requested: track_ids.len(),
                total_failed: 0, cancelled: false,
            });
            return;
        }

        // Rayon parallel analysis on a blocking thread
        let app3 = app.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            use std::sync::atomic::AtomicUsize;

            let analyzed = AtomicUsize::new(0);
            let failed = AtomicUsize::new(0);
            let progress_counter = AtomicUsize::new(0);

            tracks_to_analyze.par_iter().for_each(|(track_id, file_path, track_name)| {
                if cancelled.load(Ordering::SeqCst) {
                    return;
                }

                let path = Path::new(file_path);
                if !path.exists() {
                    eprintln!("[batch_analysis] Skipping missing file: {}", file_path);
                    failed.fetch_add(1, Ordering::SeqCst);
                    let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app3.emit("analysis-progress", &AnalysisProgressEvent {
                        current, total, track_id: *track_id, track_name: track_name.clone(),
                        bpm: None, musical_key: None,
                    });
                    return;
                }

                // Decode once
                let audio = match decoder::decode_to_mono(path) {
                    Ok(a) => a,
                    Err(e) => {
                        eprintln!("[batch_analysis] Decode failed for track {}: {}", track_id, e);
                        failed.fetch_add(1, Ordering::SeqCst);
                        let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
                        let _ = app3.emit("analysis-progress", &AnalysisProgressEvent {
                            current, total, track_id: *track_id, track_name: track_name.clone(),
                            bpm: None, musical_key: None,
                        });
                        return;
                    }
                };

                if cancelled.load(Ordering::SeqCst) {
                    return;
                }

                // Analyze BPM and Key from the same decoded audio
                let bpm_result = bpm::detect_bpm_from_samples(&audio).ok();
                let key_result = key::detect_key_from_samples(&audio).ok();

                let bpm_val = bpm_result.as_ref().map(|r| r.bpm);
                let key_val = key_result.as_ref().map(|r| r.camelot.clone());

                // Save results to DB (brief lock)
                {
                    let st = app3.state::<AppState>();
                    let db_lock = st.db.lock();
                    if let Ok(guard) = db_lock {
                        if let Some(db) = guard.as_ref() {
                            if let Some(ref bpm_r) = bpm_result {
                                let _ = db.save_bpm_analysis(*track_id, bpm_r.bpm, bpm_r.confidence);
                            }
                            if let Some(ref key_r) = key_result {
                                let _ = db.save_key_analysis(*track_id, &key_r.camelot, key_r.confidence);
                            }
                        }
                    }
                }

                if bpm_result.is_some() || key_result.is_some() {
                    analyzed.fetch_add(1, Ordering::SeqCst);
                } else {
                    failed.fetch_add(1, Ordering::SeqCst);
                }

                let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
                let _ = app3.emit("analysis-progress", &AnalysisProgressEvent {
                    current, total, track_id: *track_id, track_name: track_name.clone(),
                    bpm: bpm_val, musical_key: key_val,
                });
            });

            let was_cancelled = cancelled.load(Ordering::SeqCst);
            let _ = app3.emit("analysis-complete", &AnalysisCompleteEvent {
                total_analyzed: analyzed.load(Ordering::SeqCst),
                total_requested: total,
                total_failed: failed.load(Ordering::SeqCst),
                cancelled: was_cancelled,
            });
        }).await;
    });

    Ok(())
}

/// Cancel an in-progress batch analysis.
/// Sets the cancellation flag; Rayon workers will stop at next check point.
#[tauri::command]
pub fn cancel_analysis(state: State<AppState>) -> Result<(), AppError> {
    state.analysis_cancelled.store(true, Ordering::SeqCst);
    Ok(())
}
