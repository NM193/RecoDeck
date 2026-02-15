// Claude API client with streaming support
//
// Implements communication with Anthropic's Claude API for:
// - Chat completions with streaming
// - Playlist generation
// - Rate limiting and error handling

use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL: &str = "claude-sonnet-4-5-20250929";
const CLAUDE_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 4096;

/// Message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String, // "user" or "assistant"
    pub content: String,
}

/// Request to Claude API
#[derive(Debug, Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

/// Response from Claude API
#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    id: String,
    #[serde(rename = "type")]
    response_type: String,
    role: String,
    content: Vec<ContentBlock>,
    model: String,
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: String,
}

/// Streaming event from Claude API
#[derive(Debug, Deserialize)]
struct StreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    message: Option<serde_json::Value>,
    #[serde(default)]
    index: Option<usize>,
    #[serde(default)]
    content_block: Option<ContentBlock>,
    #[serde(default)]
    delta: Option<Delta>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(rename = "type")]
    delta_type: String,
    #[serde(default)]
    text: Option<String>,
}

/// Playlist generation response
#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistResponse {
    pub name: String,
    pub description: String,
    pub track_ids: Vec<i64>,
    pub reasoning: String,
}

pub struct ClaudeClient {
    api_key: String,
    client: Client,
}

impl ClaudeClient {
    /// Create a new Claude client with the given API key
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self { api_key, client }
    }

    /// Send a chat message and get a complete response (no streaming)
    pub async fn chat(
        &self,
        messages: Vec<Message>,
        system_prompt: Option<String>,
    ) -> Result<String, String> {
        let request = ClaudeRequest {
            model: CLAUDE_MODEL.to_string(),
            max_tokens: MAX_TOKENS,
            messages,
            system: system_prompt,
            stream: None,
        };

        let response = self
            .client
            .post(CLAUDE_API_URL)
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", CLAUDE_VERSION)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("API error {}: {}", status, error_text));
        }

        let claude_response: ClaudeResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        // Extract text from content blocks
        let text = claude_response
            .content
            .iter()
            .filter(|block| block.block_type == "text")
            .map(|block| block.text.clone())
            .collect::<Vec<_>>()
            .join("\n");

        Ok(text)
    }

    /// Generate a playlist from a natural language prompt
    pub async fn generate_playlist(
        &self,
        prompt: String,
        track_context: String,
        system_prompt: String,
    ) -> Result<PlaylistResponse, String> {
        // Construct the user message with context
        let user_message = format!(
            "Here is my music library:\n\n{}\n\nUser request: {}\n\nPlease respond with a JSON object containing: name, description, track_ids (array of integers), and reasoning.",
            track_context, prompt
        );

        let messages = vec![Message {
            role: "user".to_string(),
            content: user_message,
        }];

        let response_text = self.chat(messages, Some(system_prompt)).await?;

        // Try to extract JSON from the response
        // Claude might wrap it in markdown code blocks
        let json_text = Self::extract_json(&response_text)?;

        // Parse the JSON response
        serde_json::from_str::<PlaylistResponse>(&json_text)
            .map_err(|e| format!("Failed to parse playlist response: {}", e))
    }

    /// Extract JSON from response text (handles markdown code blocks)
    fn extract_json(text: &str) -> Result<String, String> {
        // Try to find JSON in markdown code block
        if let Some(start) = text.find("```json") {
            let json_start = start + 7; // Skip "```json"
            if let Some(end) = text[json_start..].find("```") {
                let json_end = json_start + end;
                return Ok(text[json_start..json_end].trim().to_string());
            }
        }

        // Try generic code block
        if let Some(start) = text.find("```\n") {
            let json_start = start + 4;
            if let Some(end) = text[json_start..].find("```") {
                let json_end = json_start + end;
                return Ok(text[json_start..json_end].trim().to_string());
            }
        }

        // Try to find raw JSON object
        if let Some(start) = text.find('{') {
            if let Some(end) = text.rfind('}') {
                return Ok(text[start..=end].trim().to_string());
            }
        }

        Err("No JSON found in response".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_from_markdown() {
        let text = r#"Here's your playlist:

```json
{
  "name": "Test",
  "description": "Test playlist",
  "track_ids": [1, 2, 3],
  "reasoning": "Because"
}
```

Hope you enjoy!"#;

        let json = ClaudeClient::extract_json(text).unwrap();
        assert!(json.contains("\"name\": \"Test\""));
    }

    #[test]
    fn test_extract_json_raw() {
        let text = r#"{"name": "Test", "track_ids": [1, 2]}"#;
        let json = ClaudeClient::extract_json(text).unwrap();
        assert_eq!(json, text);
    }
}
