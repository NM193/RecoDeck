// Chat Orchestrator
//
// Drives the multi-turn tool-use loop.
//
// # Thread-safety note
// rusqlite's `Database` is not `Send+Sync`.  Tauri commands require their
// returned futures to be `Send`.  We therefore NEVER pass `&Database` across
// an `.await` boundary.
//
// The orchestrator function takes `Send`-safe arguments only and receives a
// `tool_executor` callback that is called synchronously (no await) each time
// Claude requests tool use.  The callback is `FnMut(…) -> …` (no async),
// so it can capture a reference to data that is re-locked from the command
// layer.

use crate::ai::claude_client::{ClaudeClient, ContentBlockV2, ToolMessage, ToolMessageContent};
use crate::ai::tool_executor::ActionResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Maximum number of tool-use rounds per user message.
pub const MAX_TOOL_ROUNDS: usize = 5;

/// Response returned to the frontend by ai_chat_v2.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatV2Response {
    /// The final assistant text to display
    pub text: String,
    /// All tool actions executed in this turn
    pub actions: Vec<ActionResult>,
}

/// Execute the multi-turn tool-use loop.
///
/// All parameters are `Send`-safe; the `execute_tools` callback is synchronous
/// so that it can re-acquire the `Database` lock without crossing an await.
///
/// # Parameters
/// * `client` – Claude API client
/// * `system_prompt` – Pre-assembled system prompt string
/// * `history` – Prior conversation ToolMessages (already loaded from DB)
/// * `user_message` – The current user message text
/// * `execute_tools` – Synchronous closure that maps a slice of ToolUse blocks
///   to `(result_blocks, action_results)`.  Called once per tool-use round.
pub async fn orchestrate_chat_inner(
    client: &ClaudeClient,
    system_prompt: String,
    history: Vec<ToolMessage>,
    user_message: String,
    mut execute_tools: impl FnMut(&[ContentBlockV2]) -> (Vec<ContentBlockV2>, Vec<ActionResult>),
) -> Result<ChatV2Response, String> {
    use crate::ai::tool_definitions::get_tool_definitions;

    let tools = get_tool_definitions();

    let mut messages: Vec<ToolMessage> = history;
    messages.push(ToolMessage {
        role: "user".to_string(),
        content: ToolMessageContent::Text(user_message),
    });

    let mut all_actions: Vec<ActionResult> = Vec::new();
    let mut final_text = String::new();

    for round in 0..MAX_TOOL_ROUNDS {
        let response = client
            .chat_with_tools(&system_prompt, messages.clone(), &tools)
            .await
            .map_err(|e| format!("Claude API error (round {}): {}", round, e))?;

        let tool_use_blocks: Vec<ContentBlockV2> = response
            .content
            .iter()
            .filter(|b| matches!(b, ContentBlockV2::ToolUse { .. }))
            .cloned()
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

        if !text_blocks.is_empty() {
            final_text = text_blocks.join("\n");
        }

        if tool_use_blocks.is_empty() || response.stop_reason == "end_turn" {
            break;
        }

        // Execute tools synchronously (no await — callback re-locks DB)
        let (tool_result_blocks, round_actions) = execute_tools(&tool_use_blocks);
        all_actions.extend(round_actions);

        messages.push(ToolMessage {
            role: "assistant".to_string(),
            content: ToolMessageContent::Blocks(response.content.clone()),
        });
        messages.push(ToolMessage {
            role: "user".to_string(),
            content: ToolMessageContent::Blocks(tool_result_blocks),
        });
    }

    if final_text.is_empty() {
        final_text = "I've completed the requested actions.".to_string();
    }

    Ok(ChatV2Response {
        text: final_text,
        actions: all_actions,
    })
}

/// Build the metadata JSON string for the assistant message from a list of actions.
pub fn build_metadata_json(actions: &[ActionResult]) -> Option<String> {
    if actions.is_empty() {
        return None;
    }
    let names: Vec<&str> = actions.iter().map(|a| a.tool_name.as_str()).collect();
    serde_json::to_string(&json!({ "tools_used": names })).ok()
}
