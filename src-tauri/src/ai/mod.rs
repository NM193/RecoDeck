// AI module for Claude API integration and playlist generation
//
// This module provides:
// - Claude API client for chat completions
// - Track context building for AI consumption
// - System prompts for DJ-focused AI assistance

pub mod system_prompt;
pub mod context_builder;
pub mod claude_client;
pub mod taste_profile;

// Re-export commonly used types
pub use claude_client::ClaudeClient;
pub use context_builder::TrackContextBuilder;
pub use system_prompt::SYSTEM_PROMPT;
pub use taste_profile::build_taste_profile;
