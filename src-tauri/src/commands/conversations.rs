// Tauri commands for AI conversation management

use crate::commands::library::AppState;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Serializable conversation for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationDTO {
    pub id: String,
    pub title: String,
    pub created_at: i64,
}

/// Serializable message for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessageDTO {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

/// Create a new conversation. Returns the conversation with its generated ID.
#[tauri::command]
pub fn create_conversation(
    state: State<AppState>,
) -> Result<ConversationDTO, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let id = db.create_conversation()
        .map_err(|e| AppError::Database(format!("Failed to create conversation: {}", e)))?;

    let conversations = db.list_conversations()
        .map_err(|e| AppError::Database(format!("Failed to list conversations: {}", e)))?;

    let conv = conversations.into_iter().find(|c| c.id == id)
        .ok_or_else(|| AppError::Database("Created conversation not found".to_string()))?;

    Ok(ConversationDTO {
        id: conv.id,
        title: conv.title,
        created_at: conv.created_at,
    })
}

/// List all conversations ordered by most recent first.
#[tauri::command]
pub fn list_conversations(
    state: State<AppState>,
) -> Result<Vec<ConversationDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let conversations = db.list_conversations()
        .map_err(|e| AppError::Database(format!("Failed to list conversations: {}", e)))?;

    Ok(conversations.into_iter().map(|c| ConversationDTO {
        id: c.id,
        title: c.title,
        created_at: c.created_at,
    }).collect())
}

/// Get all messages for a conversation, ordered oldest first.
#[tauri::command]
pub fn get_conversation_messages(
    state: State<AppState>,
    conversation_id: String,
) -> Result<Vec<ConversationMessageDTO>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let messages = db.get_conversation_messages(&conversation_id)
        .map_err(|e| AppError::Database(format!("Failed to get messages: {}", e)))?;

    Ok(messages.into_iter().map(|m| ConversationMessageDTO {
        id: m.id,
        conversation_id: m.conversation_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
    }).collect())
}

/// Delete a conversation and all its messages.
#[tauri::command]
pub fn delete_conversation(
    state: State<AppState>,
    conversation_id: String,
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.delete_conversation(&conversation_id)
        .map_err(|e| AppError::Database(format!("Failed to delete conversation: {}", e)))?;

    Ok(())
}

/// Rename a conversation.
#[tauri::command]
pub fn rename_conversation(
    state: State<AppState>,
    conversation_id: String,
    title: String,
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    db.rename_conversation(&conversation_id, &title)
        .map_err(|e| AppError::Database(format!("Failed to rename conversation: {}", e)))?;

    Ok(())
}
