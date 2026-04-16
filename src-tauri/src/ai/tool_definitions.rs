// Tool definitions for Claude AI tool-use integration
//
// Defines the 6 tools available to the AI assistant:
// - search_library: find tracks matching filters
// - create_playlist: assemble a new playlist from track IDs
// - tag_tracks: add or remove tags on one or more tracks
// - queue_tracks: send tracks to the playback queue
// - recall_conversations: search past conversation history
// - save_preference: persist a user preference for future sessions

use crate::ai::claude_client::ToolDefinition;
use serde_json::json;

/// Return all tool definitions exposed to the Claude AI assistant.
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "search_library".to_string(),
            description: "Search the user's music library for tracks matching the given criteria. \
                          Returns a list of matching tracks with their metadata."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Free-text search query (matches title, artist, album, etc.)"
                    },
                    "artist": {
                        "type": "string",
                        "description": "Filter by artist name (partial match)"
                    },
                    "genre": {
                        "type": "string",
                        "description": "Filter by genre (e.g. 'House', 'Techno', 'Drum & Bass')"
                    },
                    "bpm_range": {
                        "type": "object",
                        "description": "Filter by BPM range",
                        "properties": {
                            "min": {
                                "type": "number",
                                "description": "Minimum BPM (inclusive)"
                            },
                            "max": {
                                "type": "number",
                                "description": "Maximum BPM (inclusive)"
                            }
                        },
                        "required": ["min", "max"]
                    },
                    "key": {
                        "type": "string",
                        "description": "Musical key filter (e.g. '8A', 'Camelot notation', or 'Am')"
                    },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "One or more tags that must be present on the track"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of tracks to return (default 20, max 100)",
                        "default": 20
                    }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "create_playlist".to_string(),
            description: "Create a new playlist from a list of track IDs. \
                          The playlist is saved to the user's library and can be played immediately."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name for the new playlist"
                    },
                    "track_ids": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "Ordered list of track IDs to include in the playlist"
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional description of the playlist's theme or purpose"
                    }
                },
                "required": ["name", "track_ids"]
            }),
        },
        ToolDefinition {
            name: "tag_tracks".to_string(),
            description: "Add or remove tags on one or more tracks. \
                          Tags can be used later to quickly filter and organise the library."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "track_ids": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "IDs of the tracks to modify"
                    },
                    "add_tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Tags to add to the tracks"
                    },
                    "remove_tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Tags to remove from the tracks"
                    },
                    "category": {
                        "type": "string",
                        "enum": ["mood", "energy", "venue", "vibe"],
                        "description": "Optional category that classifies the tags being applied"
                    }
                },
                "required": ["track_ids"]
            }),
        },
        ToolDefinition {
            name: "queue_tracks".to_string(),
            description: "Send one or more tracks to the playback queue. \
                          Supports playing immediately, appending, or inserting as the next track."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "track_ids": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "Ordered list of track IDs to queue"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["play_now", "append", "play_next"],
                        "description": "How to insert the tracks into the queue: \
                                        play_now replaces the current queue, \
                                        append adds to the end, \
                                        play_next inserts after the currently playing track"
                    }
                },
                "required": ["track_ids", "mode"]
            }),
        },
        ToolDefinition {
            name: "recall_conversations".to_string(),
            description: "Search the user's past AI conversations for relevant context, \
                          preferences, or prior recommendations."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query describing what to look for in past conversations"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of conversation excerpts to return (default 5, max 20)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }),
        },
        ToolDefinition {
            name: "save_preference".to_string(),
            description: "Persist a user preference so the AI can reference it in future sessions. \
                          Use this when the user expresses a lasting taste, habit, or workflow preference."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["genre", "mixing", "artist", "context", "general"],
                        "description": "Category that best describes the preference: \
                                        genre (music styles), mixing (DJ techniques/transitions), \
                                        artist (favourite or avoided artists), \
                                        context (venue/time/event type), \
                                        general (anything else)"
                    },
                    "preference": {
                        "type": "string",
                        "description": "The preference text to save, written in plain language"
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional situational context that qualifies when this preference applies \
                                        (e.g. 'when playing at an outdoor festival')"
                    }
                },
                "required": ["category", "preference"]
            }),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_returns_six_tools() {
        let tools = get_tool_definitions();
        assert_eq!(tools.len(), 6);
    }

    #[test]
    fn test_tool_names_are_correct() {
        let tools = get_tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"search_library"));
        assert!(names.contains(&"create_playlist"));
        assert!(names.contains(&"tag_tracks"));
        assert!(names.contains(&"queue_tracks"));
        assert!(names.contains(&"recall_conversations"));
        assert!(names.contains(&"save_preference"));
    }

    #[test]
    fn test_all_schemas_are_objects() {
        for tool in get_tool_definitions() {
            let schema_type = tool.input_schema.get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            assert_eq!(
                schema_type, "object",
                "Tool '{}' input_schema must have type 'object'",
                tool.name
            );
        }
    }

    #[test]
    fn test_required_fields_present() {
        // Tools that have non-empty required arrays
        let tools = get_tool_definitions();
        let queue = tools.iter().find(|t| t.name == "queue_tracks").unwrap();
        let required = queue.input_schema["required"].as_array().unwrap();
        assert!(required.iter().any(|v| v.as_str() == Some("track_ids")));
        assert!(required.iter().any(|v| v.as_str() == Some("mode")));

        let save_pref = tools.iter().find(|t| t.name == "save_preference").unwrap();
        let required = save_pref.input_schema["required"].as_array().unwrap();
        assert!(required.iter().any(|v| v.as_str() == Some("category")));
        assert!(required.iter().any(|v| v.as_str() == Some("preference")));
    }
}
