// Tauri commands for AI features
//
// Provides commands for:
// - API key management (stored in settings DB)
// - Pre-cached library context for instant AI responses
// - Playlist generation
// - Chat interaction

use crate::ai::{ClaudeClient, TrackContextBuilder, SYSTEM_PROMPT};
use crate::commands::library::AppState;
use crate::db::{Track, TrackAnalysis};
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Generated playlist from AI
#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratedPlaylist {
    pub name: String,
    pub description: String,
    pub track_ids: Vec<i64>,
    pub reasoning: String,
}

/// Recommendation result from AI -- track IDs + reasoning, no name/description
#[derive(Debug, Serialize, Deserialize)]
pub struct RecommendationResult {
    pub track_ids: Vec<i64>,
    pub reasoning: String,
}

/// AI-optimized track order for key-compatible mixing
#[derive(Debug, Serialize, Deserialize)]
pub struct RecommendedOrder {
    pub track_ids: Vec<i64>,
    pub reasoning: String,
}

/// Chat message for conversation history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
    pub timestamp: Option<String>,
}

const AI_API_KEY_SETTING: &str = "ai_api_key";

/// Helper: get API key from settings DB
fn get_api_key_from_db(state: &State<'_, AppState>) -> Result<Option<String>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    match db.get_setting(AI_API_KEY_SETTING) {
        Ok(Some(val)) if !val.is_empty() => Ok(Some(val)),
        Ok(_) => Ok(None),
        Err(e) => Err(AppError::Database(format!("Failed to read API key setting: {}", e))),
    }
}

/// Helper: build and cache AI context from current library
fn rebuild_context_cache(state: &State<'_, AppState>) -> Result<String, AppError> {
    let context = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let tracks = db.get_all_tracks().map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

        let tracks_with_analysis: Vec<(Track, Option<TrackAnalysis>)> = tracks
            .into_iter()
            .map(|track| {
                let analysis = track
                    .id
                    .and_then(|id| db.get_track_analysis(id).ok().flatten());
                (track, analysis)
            })
            .collect();

        TrackContextBuilder::build_full_context(&tracks_with_analysis)?
    };

    // Store in cache
    let mut cache = state.ai_context_cache.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    *cache = Some(context.clone());

    Ok(context)
}

/// Helper: get cached context or rebuild it
fn get_or_build_context(state: &State<'_, AppState>) -> Result<String, AppError> {
    // Try cache first
    {
        let cache = state.ai_context_cache.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        if let Some(ref cached) = *cache {
            return Ok(cached.clone());
        }
    }
    // Cache miss - rebuild
    rebuild_context_cache(state)
}

// --- Tauri Commands ---

/// Set the Claude API key (stores in settings DB)
#[tauri::command]
pub async fn set_ai_api_key(state: State<'_, AppState>, api_key: String) -> Result<(), AppError> {
    if api_key.trim().is_empty() {
        return Err(AppError::Validation("API key cannot be empty".to_string()));
    }

    let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    db.set_setting(AI_API_KEY_SETTING, &api_key)
        .map_err(|e| AppError::Database(format!("Failed to save API key: {}", e)))?;

    Ok(())
}

/// Get API key status (whether one is configured). Propagates errors to caller.
#[tauri::command]
pub async fn get_ai_api_key_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    match get_api_key_from_db(&state) {
        Ok(Some(_)) => Ok(true),
        Ok(None) => Ok(false),
        Err(e) => Err(e), // propagate, don't swallow
    }
}

/// Delete the stored API key
#[tauri::command]
pub async fn delete_ai_api_key(state: State<'_, AppState>) -> Result<(), AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    db.set_setting(AI_API_KEY_SETTING, "")
        .map_err(|e| AppError::Database(format!("Failed to delete API key: {}", e)))?;
    Ok(())
}

/// Rebuild the AI context cache (call after scan/analysis/library changes)
#[tauri::command]
pub async fn rebuild_ai_context(state: State<'_, AppState>) -> Result<(), AppError> {
    rebuild_context_cache(&state)?;
    Ok(())
}

/// Generate a playlist using AI
#[tauri::command]
pub async fn ai_generate_playlist(
    state: State<'_, AppState>,
    prompt: String,
) -> Result<GeneratedPlaylist, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Use cached context (instant)
    let track_context = get_or_build_context(&state)?;

    // Create Claude client and generate playlist
    let client = ClaudeClient::new(api_key);
    let response = client
        .generate_playlist(prompt, track_context, SYSTEM_PROMPT.to_string())
        .await?;

    Ok(GeneratedPlaylist {
        name: response.name,
        description: response.description,
        track_ids: response.track_ids,
        reasoning: response.reasoning,
    })
}

/// Generate a playlist from a seed track with energy direction and target duration.
/// This is the structured entry point (used by the AI Playlist Dialog).
/// The existing ai_generate_playlist remains for free-text chat flow.
#[tauri::command]
pub async fn ai_generate_playlist_from_seed(
    state: State<'_, AppState>,
    seed_track_id: i64,
    energy_direction: String,
    target_duration_min: i32,
) -> Result<GeneratedPlaylist, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Get seed track info (title, artist) and analysis (BPM, key)
    let (seed_title, seed_artist, seed_bpm, seed_key) = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let track = db.get_track(seed_track_id)
            .map_err(|e| AppError::Database(format!("Seed track {} not found: {}", seed_track_id, e)))?;

        let analysis = db.get_track_analysis(seed_track_id)
            .map_err(|e| AppError::Database(format!("Failed to get track analysis: {}", e)))?;

        (
            track.title.clone().unwrap_or_else(|| "Unknown".to_string()),
            track.artist.clone().unwrap_or_else(|| "Unknown".to_string()),
            analysis.as_ref().and_then(|a| a.bpm),
            analysis.as_ref().and_then(|a| a.musical_key.clone()),
        )
    };

    // Get all tracks with analysis for context building
    let all_tracks = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let tracks = db.get_all_tracks()
            .map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

        let tracks_with_analysis: Vec<(Track, Option<TrackAnalysis>)> = tracks
            .into_iter()
            .map(|track| {
                let analysis = track
                    .id
                    .and_then(|id| db.get_track_analysis(id).ok().flatten());
                (track, analysis)
            })
            .collect();

        tracks_with_analysis
    };

    // Build seed-aware context (filtered by BPM/key neighborhood)
    let track_context = TrackContextBuilder::build_seed_context(
        &all_tracks,
        seed_bpm,
        seed_key.as_deref(),
        &energy_direction,
    )?;

    // Build energy-direction-specific instructions
    let energy_instruction = match energy_direction.as_str() {
        "build_up" => "BPM should GRADUALLY INCREASE from the seed track's BPM. Move CLOCKWISE on the Camelot wheel (increasing key numbers). Start near the seed BPM and end 10-20 BPM higher. Energy should build throughout the set.",
        "wind_down" => "BPM should GRADUALLY DECREASE from the seed track's BPM. Move COUNTER-CLOCKWISE on the Camelot wheel (decreasing key numbers). End 10-20 BPM lower than the seed. Energy should wind down throughout the set.",
        _ => "Maintain BPM within ±8 BPM of the seed track. Stay in the same Camelot key neighborhood (±1 step). Energy should remain consistent throughout the set.",
    };

    // Estimate track count from target duration (assume ~5 min average track)
    let estimated_track_count = (target_duration_min as f64 / 5.0).ceil() as i32;

    // Build the user prompt
    let seed_info = match (seed_bpm, &seed_key) {
        (Some(bpm), Some(key)) => format!("BPM: {:.1}, Key: {}", bpm, key),
        (Some(bpm), None) => format!("BPM: {:.1}, Key: unknown", bpm),
        (None, Some(key)) => format!("BPM: unknown, Key: {}", key),
        (None, None) => "BPM: unknown, Key: unknown".to_string(),
    };

    let prompt = format!(
        "Generate a {}-minute DJ set starting from seed track: \"{}\" by {} (ID: {}, {}).\n\n\
        Energy direction: {}\n\n\
        {}\n\n\
        Select approximately {} tracks from the library. The seed track (ID {}) MUST be the first track in the list.\n\
        Order tracks for optimal flow with smooth BPM transitions (max ±10 BPM between adjacent tracks) and Camelot-compatible key transitions.\n\
        Return track_ids in play order.",
        target_duration_min, seed_title, seed_artist, seed_track_id, seed_info,
        energy_direction.replace('_', " "),
        energy_instruction,
        estimated_track_count, seed_track_id
    );

    let client = ClaudeClient::new(api_key);
    let response = client
        .generate_playlist(prompt, track_context, SYSTEM_PROMPT.to_string())
        .await?;

    Ok(GeneratedPlaylist {
        name: response.name,
        description: response.description,
        track_ids: response.track_ids,
        reasoning: response.reasoning,
    })
}

/// Get AI track recommendations based on a seed track (DISC-01).
/// Returns tracks from the user's library that are most similar to the seed.
#[tauri::command]
pub async fn ai_recommend_similar(
    state: State<'_, AppState>,
    seed_track_id: i64,
    count: i32,
) -> Result<RecommendationResult, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Get seed track info and analysis
    let (seed_title, seed_artist, seed_bpm, seed_key) = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let track = db.get_track(seed_track_id)
            .map_err(|e| AppError::Database(format!("Seed track {} not found: {}", seed_track_id, e)))?;

        let analysis = db.get_track_analysis(seed_track_id)
            .map_err(|e| AppError::Database(format!("Failed to get track analysis: {}", e)))?;

        (
            track.title.clone().unwrap_or_else(|| "Unknown".to_string()),
            track.artist.clone().unwrap_or_else(|| "Unknown".to_string()),
            analysis.as_ref().and_then(|a| a.bpm),
            analysis.as_ref().and_then(|a| a.musical_key.clone()),
        )
    };

    // Get all tracks with analysis for context building
    let all_tracks = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let tracks = db.get_all_tracks()
            .map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

        tracks.into_iter()
            .map(|track| {
                let analysis = track
                    .id
                    .and_then(|id| db.get_track_analysis(id).ok().flatten());
                (track, analysis)
            })
            .collect::<Vec<(Track, Option<TrackAnalysis>)>>()
    };

    // Build seed-aware context (filtered by BPM/key neighborhood, neutral direction)
    let track_context = TrackContextBuilder::build_seed_context(
        &all_tracks,
        seed_bpm,
        seed_key.as_deref(),
        "maintain", // Neutral direction for recommendations
    )?;

    // Build the seed info string
    let seed_info = match (seed_bpm, &seed_key) {
        (Some(bpm), Some(key)) => format!("BPM: {:.1}, Key: {}", bpm, key),
        (Some(bpm), None) => format!("BPM: {:.1}, Key: unknown", bpm),
        (None, Some(key)) => format!("BPM: unknown, Key: {}", key),
        (None, None) => "BPM: unknown, Key: unknown".to_string(),
    };

    let prompt = format!(
        "Find {} tracks from my library that are most similar to \"{}\" by {} (ID: {}, {}). \
        Prioritize BPM compatibility (within +/-8 BPM) and Camelot key compatibility (same key or +/-1 step). \
        Also consider genre and energy similarity. \
        Do NOT include the seed track itself (ID {}). \
        Return ONLY a JSON object: {{ \"track_ids\": [...], \"reasoning\": \"...\" }}",
        count, seed_title, seed_artist, seed_track_id, seed_info, seed_track_id
    );

    let client = ClaudeClient::new(api_key);
    let messages = vec![crate::ai::claude_client::Message {
        role: "user".to_string(),
        content: format!("Here is my music library:\n\n{}\n\n{}", track_context, prompt),
    }];

    let response_text = client.chat(messages, Some(SYSTEM_PROMPT.to_string())).await?;
    let json = ClaudeClient::extract_json(&response_text)?;

    serde_json::from_str::<RecommendationResult>(&json)
        .map_err(|e| AppError::AiParsing(format!("Recommendation response invalid: {}", e)))
}

/// Get AI track recommendations based on an existing playlist's vibe (DISC-02).
/// Analyzes the playlist's aggregate BPM/key profile and finds complementary tracks.
#[tauri::command]
pub async fn ai_recommend_for_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    count: i32,
) -> Result<RecommendationResult, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Get playlist tracks with analysis
    let (playlist_track_ids, playlist_summary, median_bpm, most_common_key) = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let playlist_tracks = db.get_playlist_tracks(playlist_id)
            .map_err(|e| AppError::Database(format!("Failed to get playlist tracks: {}", e)))?;

        if playlist_tracks.is_empty() {
            return Err(AppError::Validation("Playlist is empty -- add some tracks first".to_string()));
        }

        // Collect track IDs for exclusion
        let track_ids: Vec<i64> = playlist_tracks.iter()
            .filter_map(|(t, _, _, _, _)| t.id)
            .collect();

        // Calculate median BPM
        let mut bpms: Vec<f64> = playlist_tracks.iter()
            .filter_map(|(_, bpm, _, _, _)| *bpm)
            .collect();
        bpms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = if bpms.is_empty() { None } else { Some(bpms[bpms.len() / 2]) };

        // Find most common key
        let mut key_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for (_, _, _, key, _) in &playlist_tracks {
            if let Some(k) = key {
                *key_counts.entry(k.clone()).or_insert(0) += 1;
            }
        }
        let common_key = key_counts.into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(key, _)| key);

        // Build summary of playlist tracks for the prompt
        let summary: Vec<String> = playlist_tracks.iter()
            .map(|(t, bpm, _, key, _)| {
                let title = t.title.clone().unwrap_or_else(|| "Unknown".to_string());
                let artist = t.artist.clone().unwrap_or_else(|| "Unknown".to_string());
                let bpm_str = bpm.map(|b| format!("{:.0} BPM", b)).unwrap_or_else(|| "? BPM".to_string());
                let key_str = key.clone().unwrap_or_else(|| "?".to_string());
                format!("  - \"{}\" by {} ({}, {})", title, artist, bpm_str, key_str)
            })
            .collect();

        (track_ids, summary.join("\n"), median, common_key)
    };

    // Get full library context using seed context with playlist's aggregate values
    let all_tracks = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let tracks = db.get_all_tracks()
            .map_err(|e| AppError::Database(format!("Failed to get tracks: {}", e)))?;

        tracks.into_iter()
            .map(|track| {
                let analysis = track
                    .id
                    .and_then(|id| db.get_track_analysis(id).ok().flatten());
                (track, analysis)
            })
            .collect::<Vec<(Track, Option<TrackAnalysis>)>>()
    };

    let track_context = TrackContextBuilder::build_seed_context(
        &all_tracks,
        median_bpm,
        most_common_key.as_deref(),
        "maintain",
    )?;

    // Build exclusion list
    let exclusion_str = playlist_track_ids.iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(", ");

    let prompt = format!(
        "I have a playlist with these tracks:\n{}\n\n\
        The playlist has a median BPM around {:.0} and primarily uses key {}.\n\n\
        Find {} tracks from my library that would fit well with this playlist's vibe. \
        Prioritize BPM compatibility and Camelot key compatibility with the playlist's profile. \
        IMPORTANT: Do NOT include any of these track IDs already in the playlist: [{}]. \
        Return ONLY a JSON object: {{ \"track_ids\": [...], \"reasoning\": \"...\" }}",
        playlist_summary,
        median_bpm.unwrap_or(128.0),
        most_common_key.as_deref().unwrap_or("unknown"),
        count,
        exclusion_str
    );

    let client = ClaudeClient::new(api_key);
    let messages = vec![crate::ai::claude_client::Message {
        role: "user".to_string(),
        content: format!("Here is my music library:\n\n{}\n\n{}", track_context, prompt),
    }];

    let response_text = client.chat(messages, Some(SYSTEM_PROMPT.to_string())).await?;
    let json = ClaudeClient::extract_json(&response_text)?;

    serde_json::from_str::<RecommendationResult>(&json)
        .map_err(|e| AppError::AiParsing(format!("Recommendation response invalid: {}", e)))
}

/// Get AI-optimized track order for key-compatible mixing (MIXP-01).
/// Takes a playlist's tracks and returns them reordered for smooth DJ transitions.
#[tauri::command]
pub async fn ai_optimize_playlist_order(
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<RecommendedOrder, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Get playlist tracks with analysis
    let track_list = {
        let db_guard = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        let playlist_tracks = db.get_playlist_tracks(playlist_id)
            .map_err(|e| AppError::Database(format!("Failed to get playlist tracks: {}", e)))?;

        if playlist_tracks.len() < 2 {
            return Err(AppError::Validation("Playlist needs at least 2 tracks to optimize order".to_string()));
        }

        // Build track descriptions for the prompt
        let descriptions: Vec<String> = playlist_tracks.iter()
            .map(|(t, bpm, _, key, _)| {
                let id = t.id.unwrap_or(0);
                let title = t.title.clone().unwrap_or_else(|| "Unknown".to_string());
                let artist = t.artist.clone().unwrap_or_else(|| "Unknown".to_string());
                let bpm_str = bpm.map(|b| format!("{:.1}", b)).unwrap_or_else(|| "?".to_string());
                let key_str = key.clone().unwrap_or_else(|| "?".to_string());
                format!("ID:{} \"{}\" by {} (BPM:{}, Key:{})", id, title, artist, bpm_str, key_str)
            })
            .collect();

        descriptions
    };

    let prompt = format!(
        "I have a playlist with these tracks (in their current order):\n{}\n\n\
        Reorder these tracks for optimal DJ mixing flow. Optimize for:\n\
        1. Camelot key compatibility between adjacent tracks (same key, +/-1 step, or inner/outer circle)\n\
        2. Smooth BPM transitions (minimize large BPM jumps between adjacent tracks, max +/-10 BPM)\n\
        3. Natural energy progression (gradual BPM changes, not random jumps)\n\n\
        Return ALL the same track IDs in a new optimized order.\n\
        Return ONLY a JSON object: {{ \"track_ids\": [...], \"reasoning\": \"...\" }}",
        track_list.join("\n")
    );

    let client = ClaudeClient::new(api_key);
    let messages = vec![crate::ai::claude_client::Message {
        role: "user".to_string(),
        content: prompt,
    }];

    let response_text = client.chat(messages, Some(SYSTEM_PROMPT.to_string())).await?;
    let json = ClaudeClient::extract_json(&response_text)?;

    serde_json::from_str::<RecommendedOrder>(&json)
        .map_err(|e| AppError::AiParsing(format!("Playlist order response invalid: {}", e)))
}

/// Send a chat message to AI (simple, non-streaming)
#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    message: String,
    conversation_history: Vec<ChatMessage>,
) -> Result<String, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Only include library context if the message is music-related
    let msg_lower = message.to_lowercase();
    let needs_library_context = msg_lower.contains("playlist")
        || msg_lower.contains("track")
        || msg_lower.contains("song")
        || msg_lower.contains("mix")
        || msg_lower.contains("set")
        || msg_lower.contains("recommend")
        || msg_lower.contains("similar")
        || msg_lower.contains("bpm")
        || msg_lower.contains("key")
        || msg_lower.contains("genre")
        || msg_lower.contains("library")
        || msg_lower.contains("music");

    // Use cached context (instant, no DB query)
    let track_context = if needs_library_context {
        Some(get_or_build_context(&state)?)
    } else {
        None
    };

    // Prepare conversation messages
    let mut messages: Vec<crate::ai::claude_client::Message> = conversation_history
        .iter()
        .map(|msg| crate::ai::claude_client::Message {
            role: msg.role.clone(),
            content: msg.content.clone(),
        })
        .collect();

    let user_content = if let Some(context) = track_context {
        format!("My music library context:\n{}\n\nUser: {}", context, message)
    } else {
        message
    };

    messages.push(crate::ai::claude_client::Message {
        role: "user".to_string(),
        content: user_content,
    });

    let client = ClaudeClient::new(api_key);
    let response = client.chat(messages, Some(SYSTEM_PROMPT.to_string())).await?;

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_message_serialization() {
        let msg = ChatMessage {
            role: "user".to_string(),
            content: "Test message".to_string(),
            timestamp: Some("2024-01-01".to_string()),
        };

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("Test message"));
    }
}
