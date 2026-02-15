// AI module for Claude API integration and playlist generation
//
// This module provides:
// - Claude API client with streaming support
// - Secure credential storage via OS keychain
// - Track context building for AI consumption
// - System prompts for DJ-focused AI assistance

pub mod system_prompt;
pub mod credentials;
pub mod context_builder;
pub mod claude_client;

// Re-export commonly used types
pub use claude_client::ClaudeClient;
pub use credentials::CredentialManager;
pub use context_builder::TrackContextBuilder;
pub use system_prompt::SYSTEM_PROMPT;
