// Tauri commands for audio analysis (BPM, key, loudness, etc.)
//
// These commands bridge the Rust DSP analysis modules to the frontend.
// Each analysis command:
// 1. Reads the track's file_path from the database
// 2. Runs the analysis algorithm on the audio file
// 3. Stores results back in the track_analysis table
// 4. Returns the result to the frontend

use crate::audio::bpm;
use crate::audio::key;
use crate::commands::library::AppState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

/// DTO for BPM analysis result sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpmResultDTO {
    pub track_id: i64,
    pub bpm: f64,
    pub confidence: f64,
}

/// DTO for key analysis result sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyResultDTO {
    pub track_id: i64,
    /// Camelot notation (e.g., "8A", "11B")
    pub camelot: String,
    /// Open Key notation (e.g., "8m", "11d") — used by Traktor
    pub open_key: String,
    /// Musical notation (e.g., "Am", "C")
    pub musical_key: String,
    pub confidence: f64,
}

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

/// Analyze a single track's BPM.
///
/// Workflow:
/// 1. Look up the track's file_path in the database
/// 2. Decode the audio file and run aubio BPM detection
/// 3. Store the result in the track_analysis table
/// 4. Return the BPM and confidence to the frontend
#[tauri::command]
pub fn analyze_bpm(state: State<AppState>, track_id: i64) -> Result<BpmResultDTO, String> {
    // Get the track's file path from the database
    let file_path = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        let track = db.get_track(track_id)
            .map_err(|e| format!("Failed to get track {}: {}", track_id, e))?;
        track.file_path
    };

    // Run BPM detection on the audio file
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    eprintln!("[analyze_bpm] Analyzing track {} at: {}", track_id, file_path);

    let bpm_result = bpm::detect_bpm(path)
        .map_err(|e| format!("BPM detection failed for track {}: {}", track_id, e))?;

    eprintln!(
        "[analyze_bpm] Track {}: BPM={:.1}, confidence={:.2}",
        track_id, bpm_result.bpm, bpm_result.confidence
    );

    // Save the result to the database
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.save_bpm_analysis(track_id, bpm_result.bpm, bpm_result.confidence)
            .map_err(|e| format!("Failed to save BPM analysis: {}", e))?;
    }

    Ok(BpmResultDTO {
        track_id,
        bpm: bpm_result.bpm,
        confidence: bpm_result.confidence,
    })
}

/// Get the analysis data for a track (returns whatever analysis has been done so far)
#[tauri::command]
pub fn get_track_analysis(state: State<AppState>, track_id: i64) -> Result<Option<TrackAnalysisDTO>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let analysis = db.get_track_analysis(track_id)
        .map_err(|e| format!("Failed to get analysis for track {}: {}", track_id, e))?;

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

/// Analyze a single track's musical key.
///
/// Workflow:
/// 1. Look up the track's file_path in the database
/// 2. Decode the audio file and compute chromagram via FFT
/// 3. Match against Krumhansl-Schmuckler key profiles for all 24 keys
/// 4. Store the result (Camelot notation) in the track_analysis table
/// 5. Return the key and confidence to the frontend
#[tauri::command]
pub fn analyze_key(state: State<AppState>, track_id: i64) -> Result<KeyResultDTO, String> {
    // Get the track's file path from the database
    let file_path = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        let track = db.get_track(track_id)
            .map_err(|e| format!("Failed to get track {}: {}", track_id, e))?;
        track.file_path
    };

    // Run key detection on the audio file
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    eprintln!("[analyze_key] Analyzing track {} at: {}", track_id, file_path);

    let key_result = key::detect_key(path)
        .map_err(|e| format!("Key detection failed for track {}: {}", track_id, e))?;

    eprintln!(
        "[analyze_key] Track {}: Key={} ({}), confidence={:.2}",
        track_id, key_result.camelot, key_result.musical_key, key_result.confidence
    );

    // Save the result to the database (stores Camelot notation as the key value)
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.save_key_analysis(track_id, &key_result.camelot, key_result.confidence)
            .map_err(|e| format!("Failed to save key analysis: {}", e))?;
    }

    Ok(KeyResultDTO {
        track_id,
        camelot: key_result.camelot,
        open_key: key_result.open_key,
        musical_key: key_result.musical_key,
        confidence: key_result.confidence,
    })
}

/// Analyze key for all tracks that haven't had key analysis yet.
/// Returns the list of results.
/// Releases the DB mutex during heavy DSP work so other commands aren't blocked.
#[tauri::command]
pub fn analyze_all_keys(state: State<AppState>) -> Result<Vec<KeyResultDTO>, String> {
    // Get all tracks that need key analysis (brief lock)
    let tracks_to_analyze: Vec<(i64, String)> = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        let all_tracks = db.get_all_tracks()
            .map_err(|e| format!("Failed to get tracks: {}", e))?;

        all_tracks
            .into_iter()
            .filter_map(|t| {
                let id = t.id?;
                let has_key = db.has_key_analysis(id).unwrap_or(false);
                if has_key { None } else { Some((id, t.file_path)) }
            })
            .collect()
    }; // lock released

    eprintln!("[analyze_all_keys] {} tracks need key analysis", tracks_to_analyze.len());

    let mut results = Vec::new();

    for (track_id, file_path) in &tracks_to_analyze {
        let path = Path::new(file_path);
        if !path.exists() {
            eprintln!("[analyze_all_keys] Skipping missing file: {}", file_path);
            continue;
        }

        // Heavy DSP work — no lock held
        match key::detect_key(path) {
            Ok(key_result) => {
                eprintln!(
                    "[analyze_all_keys] Track {}: Key={} ({}), confidence={:.2}",
                    track_id, key_result.camelot, key_result.musical_key, key_result.confidence
                );

                // Brief lock to save result
                {
                    let db_lock = state.db.lock().unwrap();
                    let db = db_lock.as_ref().ok_or("Database not initialized")?;
                    db.save_key_analysis(*track_id, &key_result.camelot, key_result.confidence)
                        .map_err(|e| format!("Failed to save key analysis: {}", e))?;
                }

                results.push(KeyResultDTO {
                    track_id: *track_id,
                    camelot: key_result.camelot,
                    open_key: key_result.open_key,
                    musical_key: key_result.musical_key,
                    confidence: key_result.confidence,
                });
            }
            Err(e) => {
                eprintln!("[analyze_all_keys] Error analyzing track {}: {}", track_id, e);
            }
        }
    }

    eprintln!("[analyze_all_keys] Completed: {} tracks analyzed", results.len());

    Ok(results)
}

/// Analyze BPM for all tracks that haven't been analyzed yet.
/// Returns the number of tracks analyzed.
/// Releases the DB mutex during heavy DSP work so other commands aren't blocked.
#[tauri::command]
pub fn analyze_all_bpm(state: State<AppState>) -> Result<Vec<BpmResultDTO>, String> {
    // Get all tracks that need BPM analysis (brief lock)
    let tracks_to_analyze: Vec<(i64, String)> = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        let all_tracks = db.get_all_tracks()
            .map_err(|e| format!("Failed to get tracks: {}", e))?;

        all_tracks
            .into_iter()
            .filter_map(|t| {
                let id = t.id?;
                let has_bpm = db.has_bpm_analysis(id).unwrap_or(false);
                if has_bpm { None } else { Some((id, t.file_path)) }
            })
            .collect()
    }; // lock released

    eprintln!("[analyze_all_bpm] {} tracks need BPM analysis", tracks_to_analyze.len());

    let mut results = Vec::new();

    for (track_id, file_path) in &tracks_to_analyze {
        let path = Path::new(file_path);
        if !path.exists() {
            eprintln!("[analyze_all_bpm] Skipping missing file: {}", file_path);
            continue;
        }

        // Heavy DSP work — no lock held
        match bpm::detect_bpm(path) {
            Ok(bpm_result) => {
                eprintln!(
                    "[analyze_all_bpm] Track {}: BPM={:.1}, confidence={:.2}",
                    track_id, bpm_result.bpm, bpm_result.confidence
                );

                // Brief lock to save result
                {
                    let db_lock = state.db.lock().unwrap();
                    let db = db_lock.as_ref().ok_or("Database not initialized")?;
                    db.save_bpm_analysis(*track_id, bpm_result.bpm, bpm_result.confidence)
                        .map_err(|e| format!("Failed to save BPM analysis: {}", e))?;
                }

                results.push(BpmResultDTO {
                    track_id: *track_id,
                    bpm: bpm_result.bpm,
                    confidence: bpm_result.confidence,
                });
            }
            Err(e) => {
                eprintln!("[analyze_all_bpm] Error analyzing track {}: {}", track_id, e);
            }
        }
    }

    eprintln!("[analyze_all_bpm] Completed: {} tracks analyzed", results.len());

    Ok(results)
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
pub fn analyze_waveform(state: State<AppState>, track_id: i64) -> Result<(), String> {
    use crate::audio::waveform::generate_waveform;
    
    // Get the track's file path from the database
    let file_path = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        let track = db.get_track(track_id)
            .map_err(|e| format!("Failed to get track {}: {}", track_id, e))?;
        track.file_path
    };

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    eprintln!("[analyze_waveform] Analyzing track {} at: {}", track_id, file_path);

    // Generate overview waveform (2500 points - full track view)
    let overview = generate_waveform(path, 2500)
        .map_err(|e| format!("Failed to generate overview waveform: {}", e))?;
    let overview_blob = overview.to_blob();

    // Generate detail waveform (10000 points - for zoom)
    let detail = generate_waveform(path, 10000)
        .map_err(|e| format!("Failed to generate detail waveform: {}", e))?;
    let detail_blob = detail.to_blob();

    eprintln!(
        "[analyze_waveform] Track {}: overview={} bytes, detail={} bytes",
        track_id,
        overview_blob.len(),
        detail_blob.len()
    );

    // Save to database
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.save_waveform(track_id, &overview_blob, &detail_blob)
            .map_err(|e| format!("Failed to save waveform: {}", e))?;
    }

    Ok(())
}

/// Get waveform data for a track.
/// Level: "overview" or "detail"
/// Returns binary BLOB that frontend will deserialize.
#[tauri::command]
pub fn get_waveform(state: State<AppState>, track_id: i64, level: String) -> Result<Option<Vec<u8>>, String> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.get_waveform(track_id, &level)
        .map_err(|e| format!("Failed to get waveform: {}", e))
}
