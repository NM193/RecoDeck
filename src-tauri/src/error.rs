// Shared typed error enum for all Tauri commands.
//
// Serialized with serde as a tagged enum so the frontend receives:
//   {"kind":"AiNoApiKey"}                             -- unit variants
//   {"kind":"Database","message":"..."}               -- tuple variants
//
// Frontend uses the `kind` field to distinguish error categories in switch statements.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("{0}")]
    NotFound(String),

    #[error("No API key configured -- add your Claude API key in Settings")]
    AiNoApiKey,

    #[error("API key is invalid -- check your key in Settings")]
    AiInvalidKey,

    #[error("{0}")]
    AiNetwork(String),

    #[error("AI response could not be parsed: {0}")]
    AiParsing(String),

    #[error("{0}")]
    Internal(String),

    #[error("{0}")]
    Validation(String),

    #[error("AI tool execution error: {0}")]
    AiToolExecution(String),
}
