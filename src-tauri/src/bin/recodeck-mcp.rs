//! recodeck-mcp — a read-only MCP (Model Context Protocol) server over stdio.
//!
//! Lets the Claude desktop app search the RecoDeck library. Newline-delimited
//! JSON-RPC 2.0. The database is opened read-only; nothing is ever written.
//!
//! Usage: recodeck-mcp [--db <path>]   (or RECODECK_DB env var)

use recodeck_lib::ai::tool_executor::execute_tool;
use recodeck_lib::db::Database;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;

const MAX_LIMIT: u64 = 50;
const MAX_PLAYLIST_TRACKS: usize = 200;

fn db_path() -> PathBuf {
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--db" {
            if let Some(p) = args.next() {
                return PathBuf::from(p);
            }
        }
    }
    if let Ok(p) = std::env::var("RECODECK_DB") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join("Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.db")
}

fn tools() -> Value {
    json!([
        {
            "name": "search_library",
            "description": "Search the user's RecoDeck music library. Returns tracks with title, artist, genre, BPM, key (Camelot), year, label, rating and play count. All filters are optional and combine.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Free-text search (title, artist, album)" },
                    "artist": { "type": "string", "description": "Artist name (partial match)" },
                    "genre": { "type": "string", "description": "Genre, e.g. 'House', 'Techno'" },
                    "bpm_range": {
                        "type": "object",
                        "properties": {
                            "min": { "type": "number" },
                            "max": { "type": "number" }
                        },
                        "required": ["min", "max"]
                    },
                    "key": { "type": "string", "description": "Musical key, e.g. '8A'" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags that must all be present" },
                    "limit": { "type": "integer", "description": "Max tracks (default 20, max 50)", "default": 20 }
                }
            }
        },
        {
            "name": "list_playlists",
            "description": "List the user's playlists and folders (id, name, type, parent_id).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "create_playlist",
            "description": "Create a new manual playlist from track ids (take the ids from search_library or get_playlist_tracks). Only adds; never changes or deletes existing playlists. The RecoDeck app must be reopened or its playlists reloaded to show it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Name of the new playlist" },
                    "track_ids": { "type": "array", "items": { "type": "integer" }, "description": "Track ids in playlist order (max 200)" }
                },
                "required": ["name", "track_ids"]
            }
        },
        {
            "name": "library_health",
            "description": "Counts showing how complete the library data is: total tracks, and how many lack a title, artist, genre, BPM or musical key, plus extra duplicate copies (same title and artist). Check this before relying on key or BPM filters.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_playlist_tracks",
            "description": "List the tracks in one playlist, in playlist order (use list_playlists to find the id). Returns title, artist, genre, BPM, key, year and rating, capped at 200 tracks.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "playlist_id": { "type": "integer", "description": "Playlist id from list_playlists" }
                },
                "required": ["playlist_id"]
            }
        }
    ])
}

fn text_result(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

fn create_playlist(path: &std::path::Path, args: &Value) -> Value {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    let ids: Vec<i64> = args
        .get("track_ids")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_i64()).collect())
        .unwrap_or_default();
    if name.is_empty() || ids.is_empty() {
        return text_result("name and a non-empty track_ids are required".to_string(), true);
    }
    if ids.len() > MAX_PLAYLIST_TRACKS {
        return text_result(format!("At most {MAX_PLAYLIST_TRACKS} tracks per playlist"), true);
    }
    // The only write path: a separate read-write connection, used just here.
    let wdb = match Database::new(path) {
        Ok(db) => db,
        Err(e) => return text_result(format!("Cannot open database for writing: {e}"), true),
    };
    let playlist_id = match wdb.create_playlist(name, "manual", None) {
        Ok(id) => id,
        Err(e) => return text_result(format!("Failed to create playlist: {e}"), true),
    };
    let (mut added, mut skipped) = (0, 0);
    for id in &ids {
        match wdb.add_track_to_playlist(playlist_id, *id) {
            Ok(true) => added += 1,
            _ => skipped += 1,
        }
    }
    text_result(
        json!({ "playlist_id": playlist_id, "name": name, "tracks_added": added, "tracks_skipped": skipped })
            .to_string(),
        false,
    )
}

fn call_tool(db: &Database, path: &std::path::Path, name: &str, args: &Value) -> Value {
    match name {
        "create_playlist" => create_playlist(path, args),
        "search_library" => {
            let mut input = args.clone();
            let limit = input
                .get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(20)
                .min(MAX_LIMIT);
            input["limit"] = json!(limit);
            let (text, result) = execute_tool(db, "search_library", &input);
            text_result(text, !result.success)
        }
        "list_playlists" => match db.get_all_playlists() {
            Ok(list) => {
                let rows: Vec<Value> = list
                    .iter()
                    .map(|p| {
                        json!({
                            "id": p.id,
                            "name": p.name,
                            "type": p.playlist_type,
                            "parent_id": p.parent_id,
                        })
                    })
                    .collect();
                text_result(Value::Array(rows).to_string(), false)
            }
            Err(e) => text_result(format!("Failed to list playlists: {e}"), true),
        },
        "library_health" => match db.library_health() {
            Ok((total, no_title, no_artist, no_genre, no_bpm, no_key, dupes)) => text_result(
                json!({
                    "total_tracks": total,
                    "missing_title": no_title,
                    "missing_artist": no_artist,
                    "missing_genre": no_genre,
                    "missing_bpm": no_bpm,
                    "missing_key": no_key,
                    "duplicate_extra_copies": dupes,
                })
                .to_string(),
                false,
            ),
            Err(e) => text_result(format!("Failed to read library health: {e}"), true),
        },
        "get_playlist_tracks" => {
            let Some(id) = args.get("playlist_id").and_then(|v| v.as_i64()) else {
                return text_result("playlist_id is required".to_string(), true);
            };
            match db.get_playlist_tracks(id) {
                Ok(rows) => {
                    let tracks: Vec<Value> = rows
                        .iter()
                        .take(MAX_PLAYLIST_TRACKS)
                        .map(|(t, bpm, _, key, _)| {
                            json!({
                                "id": t.id,
                                "title": t.title,
                                "artist": t.artist,
                                "genre": t.genre,
                                "bpm": bpm,
                                "key": key,
                                "year": t.year,
                                "rating": t.rating,
                            })
                        })
                        .collect();
                    text_result(Value::Array(tracks).to_string(), false)
                }
                Err(e) => text_result(format!("Failed to get playlist tracks: {e}"), true),
            }
        }
        other => text_result(format!("Unknown tool: {other}"), true),
    }
}

fn handle(db: &Database, path: &std::path::Path, msg: &Value) -> Option<Value> {
    let method = msg.get("method")?.as_str()?;
    let id = msg.get("id").cloned();
    // Notifications carry no id and get no reply.
    let id = match id {
        Some(i) => i,
        None => return None,
    };
    let result = match method {
        "initialize" => {
            let version = msg
                .pointer("/params/protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("2024-11-05");
            json!({
                "protocolVersion": version,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "recodeck", "version": env!("CARGO_PKG_VERSION") }
            })
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tools() }),
        "tools/call" => {
            let name = msg
                .pointer("/params/name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = msg.pointer("/params/arguments").cloned().unwrap_or(json!({}));
            call_tool(db, path, name, &args)
        }
        _ => {
            return Some(json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {method}") }
            }))
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn main() {
    let path = db_path();
    let db = match Database::new_read_only(&path) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("recodeck-mcp: cannot open database {}: {e}", path.display());
            std::process::exit(1);
        }
    };

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(reply) = handle(&db, &path, &msg) {
            let _ = writeln!(stdout, "{reply}");
            let _ = stdout.flush();
        }
    }
}
