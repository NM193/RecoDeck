// Chat Orchestrator
//
// Drives the multi-turn tool-use loop:
//   1. Assemble layered system prompt
//   2. Load last 20 messages from DB as conversation history
//   3. Save the incoming user message
//   4. Enter the tool-use loop (max MAX_TOOL_ROUNDS rounds):
//      a. Call Claude with tools
//      b. If response contains tool_use blocks: execute each, append results, loop
//      c. If stop_reason == "end_turn" or pure text: break
//   5. Save the final assistant response with metadata
//   6. Return ChatV2Response

use crate::ai::claude_client::{ClaudeClient, ContentBlockV2, ToolMessage, ToolMessageContent};
use crate::ai::context_assembler::{assemble_system_prompt, SessionContext};
use crate::ai::tool_definitions::get_tool_definitions;
use crate::ai::tool_executor::{execute_tool, ActionResult};
use crate::db::Database;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Maximum number of tool-use rounds per user message, to prevent runaway loops.
pub const MAX_TOOL_ROUNDS: usize = 5;

/// Response returned to the frontend by ai_chat_v2.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatV2Response {
    /// The final assistant text to display
    pub text: String,
    /// All tool actions that were executed in this turn
    pub actions: Vec<ActionResult>,
}

/// Run the full multi-turn orchestration for a single user message.
///
/// # Arguments
/// * `db` – Database reference (used for history, persistence, and tool execution)
/// * `client` – Authenticated Claude API client
/// * `message` – The user's raw message text
/// * `conversation_id` – ID of the conversation to persist into
/// * `session_context` – Optional current playback state from the frontend
/// * `taste_profile_cache` – Optional pre-built taste profile JSON string
pub async fn orchestrate_chat(
    db: &Database,
    client: &ClaudeClient,
    message: &str,
    conversation_id: &str,
    session_context: Option<&SessionContext>,
    taste_profile_cache: Option<&str>,
) -> Result<ChatV2Response, String> {
    // Build layered system prompt
    let system_prompt = assemble_system_prompt(db, taste_profile_cache, session_context);

    // Load last 20 messages from DB as conversation history
    let history = db
        .get_conversation_messages(conversation_id)
        .unwrap_or_default();

    // Build ToolMessage history (skip the last entry if it was somehow already this message)
    let history_messages: Vec<ToolMessage> = history
        .iter()
        .rev()
        .take(20)
        .rev()
        .map(|msg| ToolMessage {
            role: msg.role.clone(),
            content: ToolMessageContent::Text(msg.content.clone()),
        })
        .collect();

    // Persist the incoming user message
    if let Err(e) = db.create_message_with_metadata(conversation_id, "user", message, None) {
        eprintln!("[orchestrator] Failed to save user message: {}", e);
        // Non-fatal – continue
    }

    // Assemble the initial messages list: history + new user message
    let mut messages: Vec<ToolMessage> = history_messages;
    messages.push(ToolMessage {
        role: "user".to_string(),
        content: ToolMessageContent::Text(message.to_string()),
    });

    let tools = get_tool_definitions();
    let mut all_actions: Vec<ActionResult> = Vec::new();
    let mut final_text = String::new();

    // ── Tool-use loop ────────────────────────────────────────────────────────
    for round in 0..MAX_TOOL_ROUNDS {
        let response = client
            .chat_with_tools(&system_prompt, messages.clone(), &tools)
            .await
            .map_err(|e| format!("Claude API error (round {}): {}", round, e))?;

        // Separate content blocks by type
        let tool_use_blocks: Vec<&ContentBlockV2> = response
            .content
            .iter()
            .filter(|b| matches!(b, ContentBlockV2::ToolUse { .. }))
            .collect();

        let text_blocks: Vec<String> = response
            .content
            .iter()
            .filter_map(|b| {
                if let ContentBlockV2::Text { text } = b {
                    Some(text.clone())
                } else {
                    None
                }
            })
            .collect();

        // Accumulate any text in this response
        if !text_blocks.is_empty() {
            final_text = text_blocks.join("\n");
        }

        // If no tool calls or stop_reason is end_turn, we're done
        if tool_use_blocks.is_empty() || response.stop_reason == "end_turn" {
            break;
        }

        // Execute each tool call and collect results
        let mut tool_result_blocks: Vec<ContentBlockV2> = Vec::new();

        for block in &tool_use_blocks {
            if let ContentBlockV2::ToolUse { id, name, input } = block {
                let (result_text, action_result) = execute_tool(db, name, input);
                all_actions.push(action_result);
                tool_result_blocks.push(ContentBlockV2::ToolResult {
                    tool_use_id: id.clone(),
                    content: result_text,
                    is_error: None,
                });
            }
        }

        // Append the assistant's tool-use turn and our tool results as user turn
        messages.push(ToolMessage {
            role: "assistant".to_string(),
            content: ToolMessageContent::Blocks(response.content.clone()),
        });
        messages.push(ToolMessage {
            role: "user".to_string(),
            content: ToolMessageContent::Blocks(tool_result_blocks),
        });
    }

    // If we exhausted all rounds without a text response, use a fallback
    if final_text.is_empty() {
        final_text = "I've completed the requested actions.".to_string();
    }

    // Build metadata JSON for the assistant message (list of action names)
    let action_names: Vec<String> = all_actions.iter().map(|a| a.tool_name.clone()).collect();
    let metadata_json = if action_names.is_empty() {
        None
    } else {
        Some(
            serde_json::to_string(&json!({ "tools_used": action_names }))
                .unwrap_or_default(),
        )
    };

    // Persist the final assistant response
    if let Err(e) = db.create_message_with_metadata(
        conversation_id,
        "assistant",
        &final_text,
        metadata_json.as_deref(),
    ) {
        eprintln!("[orchestrator] Failed to save assistant message: {}", e);
        // Non-fatal
    }

    Ok(ChatV2Response {
        text: final_text,
        actions: all_actions,
    })
}
