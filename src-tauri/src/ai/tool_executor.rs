// Tool Executor
//
// Dispatches tool-use calls from the Claude AI to the appropriate database
// operations and returns structured results for both the AI (tool result text)
// and the frontend (ActionResult).

use crate::db::Database;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Result of a single AI tool execution, shown to the user in the chat UI.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ActionResult {
    /// The name of the tool that was called
    pub tool_name: String,
    /// Whether the tool execution succeeded
    pub success: bool,
    /// Human-readable summary of what was done
    pub summary: String,
    /// Optional structured data payload (e.g. track list, playlist ID)
    pub data: Option<Value>,
}

/// Execute a named tool with the given JSON input.
///
/// Returns `(tool_result_text, ActionResult)` where:
/// - `tool_result_text` is the string sent back to Claude as the tool result
/// - `ActionResult` is the structured record shown in the chat UI
pub fn execute_tool(db: &Database, tool_name: &str, input: &Value) -> (String, ActionResult) {
    match tool_name {
        "search_library" => execute_search_library(db, input),
        "create_playlist" => execute_create_playlist(db, input),
        "tag_tracks" => execute_tag_tracks(db, input),
        "queue_tracks" => execute_queue_tracks(db, input),
        "recall_conversations" => execute_recall_conversations(db, input),
        "save_preference" => execute_save_preference(db, input),
        unknown => {
            let msg = format!("Unknown tool: {}", unknown);
            (
                msg.clone(),
                ActionResult {
                    tool_name: unknown.to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            )
        }
    }
}

// ── Per-tool implementations ────────────────────────────────────────────────

fn execute_search_library(db: &Database, input: &Value) -> (String, ActionResult) {
    let query = input.get("query").and_then(|v| v.as_str());
    let artist = input.get("artist").and_then(|v| v.as_str());
    let genre = input.get("genre").and_then(|v| v.as_str());
    let key = input.get("key").and_then(|v| v.as_str());
    let limit = input
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20) as usize;

    let bpm_min = input
        .get("bpm_range")
        .and_then(|r| r.get("min"))
        .and_then(|v| v.as_f64());
    let bpm_max = input
        .get("bpm_range")
        .and_then(|r| r.get("max"))
        .and_then(|v| v.as_f64());

    let tags: Option<Vec<String>> = input
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());

    match db.search_tracks_filtered(
        query,
        artist,
        genre,
        bpm_min,
        bpm_max,
        key,
        tags.as_deref(),
        limit,
    ) {
        Ok(results) => {
            let track_objects: Vec<Value> = results
                .iter()
                .map(|(track, bpm, musical_key)| {
                    json!({
                        "id": track.id,
                        "title": track.title,
                        "artist": track.artist,
                        "album": track.album,
                        "genre": track.genre,
                        "bpm": bpm,
                        "key": musical_key,
                        "duration_ms": track.duration_ms,
                        "year": track.year,
                        "label": track.label,
                        "rating": track.rating,
                        "play_count": track.play_count,
                    })
                })
                .collect();

            let count = track_objects.len();
            let result_json = serde_json::to_string(&track_objects)
                .unwrap_or_else(|_| "[]".to_string());

            let summary = if count == 0 {
                "No tracks found matching the search criteria".to_string()
            } else {
                format!("Found {} track{}", count, if count == 1 { "" } else { "s" })
            };

            (
                result_json.clone(),
                ActionResult {
                    tool_name: "search_library".to_string(),
                    success: true,
                    summary,
                    data: Some(Value::Array(track_objects)),
                },
            )
        }
        Err(e) => {
            let msg = format!("Search failed: {}", e);
            (
                msg.clone(),
                ActionResult {
                    tool_name: "search_library".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            )
        }
    }
}

fn execute_create_playlist(db: &Database, input: &Value) -> (String, ActionResult) {
    let name = match input.get("name").and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n,
        _ => {
            let msg = "create_playlist requires a non-empty 'name' field".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "create_playlist".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let track_ids: Vec<i64> = match input.get("track_ids").and_then(|v| v.as_array()) {
        Some(arr) => arr.iter().filter_map(|v| v.as_i64()).collect(),
        None => {
            let msg = "create_playlist requires a 'track_ids' array".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "create_playlist".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    match db.create_playlist(name, "ai_generated", None) {
        Ok(playlist_id) => {
            let mut added = 0usize;
            let mut errors: Vec<String> = Vec::new();

            for track_id in &track_ids {
                match db.add_track_to_playlist(playlist_id, *track_id) {
                    Ok(_) => added += 1,
                    Err(e) => errors.push(format!("track {}: {}", track_id, e)),
                }
            }

            let summary = if errors.is_empty() {
                format!(
                    "Created playlist \"{}\" with {} track{}",
                    name,
                    added,
                    if added == 1 { "" } else { "s" }
                )
            } else {
                format!(
                    "Created playlist \"{}\" with {} track{} ({} error{})",
                    name,
                    added,
                    if added == 1 { "" } else { "s" },
                    errors.len(),
                    if errors.len() == 1 { "" } else { "s" }
                )
            };

            let result_text = format!(
                "{{\"playlist_id\":{},\"name\":\"{}\",\"tracks_added\":{}}}",
                playlist_id, name, added
            );

            (
                result_text,
                ActionResult {
                    tool_name: "create_playlist".to_string(),
                    success: true,
                    summary,
                    data: Some(json!({
                        "playlist_id": playlist_id,
                        "name": name,
                        "tracks_added": added,
                    })),
                },
            )
        }
        Err(e) => {
            let msg = format!("Failed to create playlist: {}", e);
            (
                msg.clone(),
                ActionResult {
                    tool_name: "create_playlist".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            )
        }
    }
}

fn execute_tag_tracks(db: &Database, input: &Value) -> (String, ActionResult) {
    let track_ids: Vec<i64> = match input.get("track_ids").and_then(|v| v.as_array()) {
        Some(arr) => arr.iter().filter_map(|v| v.as_i64()).collect(),
        None => {
            let msg = "tag_tracks requires a 'track_ids' array".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "tag_tracks".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let add_tags: Vec<String> = input
        .get("add_tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let remove_tags: Vec<String> = input
        .get("remove_tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let category = input
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("general");

    let mut added_count = 0usize;
    let mut removed_count = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for tag_name in &add_tags {
        match db.get_or_create_tag(tag_name, category) {
            Ok(tag_id) => {
                for track_id in &track_ids {
                    match db.add_tag_to_track(*track_id, tag_id) {
                        Ok(_) => added_count += 1,
                        Err(e) => errors.push(format!("add tag '{}' to track {}: {}", tag_name, track_id, e)),
                    }
                }
            }
            Err(e) => errors.push(format!("get/create tag '{}': {}", tag_name, e)),
        }
    }

    for tag_name in &remove_tags {
        match db.get_tag_by_name(tag_name) {
            Ok(Some(tag_id)) => {
                for track_id in &track_ids {
                    match db.remove_tag_from_track(*track_id, tag_id) {
                        Ok(_) => removed_count += 1,
                        Err(e) => errors.push(format!("remove tag '{}' from track {}: {}", tag_name, track_id, e)),
                    }
                }
            }
            Ok(None) => {} // Tag doesn't exist, nothing to remove
            Err(e) => errors.push(format!("look up tag '{}': {}", tag_name, e)),
        }
    }

    let summary = format!(
        "Tagged {} track{}: added {} tag application{}, removed {} tag application{}{}",
        track_ids.len(),
        if track_ids.len() == 1 { "" } else { "s" },
        added_count,
        if added_count == 1 { "" } else { "s" },
        removed_count,
        if removed_count == 1 { "" } else { "s" },
        if errors.is_empty() { String::new() } else { format!(" ({} error{})", errors.len(), if errors.len() == 1 { "" } else { "s" }) },
    );

    let result_text = format!(
        "{{\"tracks_tagged\":{},\"tags_added\":{},\"tags_removed\":{}}}",
        track_ids.len(),
        added_count,
        removed_count
    );

    (
        result_text,
        ActionResult {
            tool_name: "tag_tracks".to_string(),
            success: errors.is_empty(),
            summary,
            data: Some(json!({
                "tracks_tagged": track_ids.len(),
                "tags_added": added_count,
                "tags_removed": removed_count,
            })),
        },
    )
}

fn execute_queue_tracks(db: &Database, input: &Value) -> (String, ActionResult) {
    let track_ids: Vec<i64> = match input.get("track_ids").and_then(|v| v.as_array()) {
        Some(arr) => arr.iter().filter_map(|v| v.as_i64()).collect(),
        None => {
            let msg = "queue_tracks requires a 'track_ids' array".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "queue_tracks".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let mode = input
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("append");

    // Validate all track IDs exist and collect their data
    let mut valid_tracks: Vec<Value> = Vec::new();
    let mut missing: Vec<i64> = Vec::new();

    for track_id in &track_ids {
        if let Ok(track) = db.get_track(*track_id) {
            let analysis = db.get_track_analysis(*track_id).ok().flatten();
            valid_tracks.push(json!({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "file_path": track.file_path,
                "bpm": analysis.as_ref().and_then(|a| a.bpm),
                "key": analysis.as_ref().and_then(|a| a.musical_key.clone()),
                "duration_ms": track.duration_ms,
            }));
        } else {
            missing.push(*track_id);
        }
    }

    if !missing.is_empty() {
        let msg = format!(
            "Some track IDs not found: {:?}",
            missing
        );
        return (
            msg.clone(),
            ActionResult {
                tool_name: "queue_tracks".to_string(),
                success: false,
                summary: msg,
                data: None,
            },
        );
    }

    let count = valid_tracks.len();
    let summary = format!(
        "Queued {} track{} (mode: {})",
        count,
        if count == 1 { "" } else { "s" },
        mode
    );

    let result_data = json!({
        "tracks": valid_tracks,
        "mode": mode,
        "count": count,
    });

    let result_text = serde_json::to_string(&result_data)
        .unwrap_or_else(|_| format!("{{\"count\":{},\"mode\":\"{}\"}}", count, mode));

    (
        result_text,
        ActionResult {
            tool_name: "queue_tracks".to_string(),
            success: true,
            summary,
            data: Some(result_data),
        },
    )
}

fn execute_recall_conversations(db: &Database, input: &Value) -> (String, ActionResult) {
    let query = match input.get("query").and_then(|v| v.as_str()) {
        Some(q) if !q.is_empty() => q,
        _ => {
            let msg = "recall_conversations requires a non-empty 'query' field".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "recall_conversations".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let limit = input
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(5) as usize;

    match db.search_conversations(query, limit) {
        Ok(results) => {
            let count = results.len();
            let excerpts: Vec<Value> = results
                .iter()
                .map(|(conv_id, title, messages)| {
                    let snippets: Vec<Value> = messages
                        .iter()
                        .map(|msg| {
                            json!({
                                "role": msg.role,
                                "content": &msg.content[..msg.content.len().min(300)],
                            })
                        })
                        .collect();
                    json!({
                        "conversation_id": conv_id,
                        "title": title,
                        "messages": snippets,
                    })
                })
                .collect();

            let result_json = serde_json::to_string(&excerpts)
                .unwrap_or_else(|_| "[]".to_string());

            let summary = if count == 0 {
                format!("No past conversations found matching \"{}\"", query)
            } else {
                format!("Found {} past conversation{} matching \"{}\"", count, if count == 1 { "" } else { "s" }, query)
            };

            (
                result_json,
                ActionResult {
                    tool_name: "recall_conversations".to_string(),
                    success: true,
                    summary,
                    data: Some(Value::Array(excerpts)),
                },
            )
        }
        Err(e) => {
            let msg = format!("Conversation search failed: {}", e);
            (
                msg.clone(),
                ActionResult {
                    tool_name: "recall_conversations".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            )
        }
    }
}

fn execute_save_preference(db: &Database, input: &Value) -> (String, ActionResult) {
    let category = match input.get("category").and_then(|v| v.as_str()) {
        Some(c) if !c.is_empty() => c,
        _ => {
            let msg = "save_preference requires a non-empty 'category' field".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "save_preference".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let preference = match input.get("preference").and_then(|v| v.as_str()) {
        Some(p) if !p.is_empty() => p,
        _ => {
            let msg = "save_preference requires a non-empty 'preference' field".to_string();
            return (
                msg.clone(),
                ActionResult {
                    tool_name: "save_preference".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            );
        }
    };

    let context = input.get("context").and_then(|v| v.as_str());

    match db.save_preference(category, preference, context) {
        Ok(id) => {
            let summary = format!("Saved preference [{}]: \"{}\"", category, preference);
            let result_text = format!(
                "{{\"id\":{},\"category\":\"{}\",\"saved\":true}}",
                id, category
            );
            (
                result_text,
                ActionResult {
                    tool_name: "save_preference".to_string(),
                    success: true,
                    summary,
                    data: Some(json!({
                        "id": id,
                        "category": category,
                        "preference": preference,
                    })),
                },
            )
        }
        Err(e) => {
            let msg = format!("Failed to save preference: {}", e);
            (
                msg.clone(),
                ActionResult {
                    tool_name: "save_preference".to_string(),
                    success: false,
                    summary: msg,
                    data: None,
                },
            )
        }
    }
}
