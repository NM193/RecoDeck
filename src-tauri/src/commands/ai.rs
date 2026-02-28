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
