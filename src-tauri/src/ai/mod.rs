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
pub mod tool_definitions;
pub mod tool_executor;
pub mod context_assembler;
pub mod orchestrator;

// Re-export commonly used types
pub use claude_client::ClaudeClient;
pub use context_builder::TrackContextBuilder;
pub use system_prompt::SYSTEM_PROMPT;
pub use taste_profile::build_taste_profile;
pub use tool_definitions::get_tool_definitions;
pub use tool_executor::{execute_tool, ActionResult};
pub use context_assembler::{assemble_system_prompt, SessionContext, TrackSummary};
pub use orchestrator::{orchestrate_chat_inner, build_metadata_json, ChatV2Response};
