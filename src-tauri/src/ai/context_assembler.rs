// Context Assembler V2
//
// Builds the layered system prompt used by the ai_chat_v2 orchestrator.
// Four layers are combined into a single string:
//   Layer 1 – base identity (SYSTEM_PROMPT constant)
//   Layer 2 – taste profile JSON (passed in from cache)
//   Layer 3 – explicit preferences from the database
//   Layer 4 – current session context (now playing, queue, active playlist)
// Plus a tool-usage guidelines section.

use crate::ai::system_prompt::SYSTEM_PROMPT;
use crate::db::Database;
use serde::Deserialize;

/// Lightweight track summary used inside SessionContext.
#[derive(Deserialize, Debug, Clone)]
pub struct TrackSummary {
    pub id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
}

/// Current playback/session context provided by the frontend.
#[derive(Deserialize, Debug, Clone)]
pub struct SessionContext {
    /// The track currently playing (if any)
    pub now_playing: Option<TrackSummary>,
    /// Last few tracks in the queue
    pub recent_queue: Vec<TrackSummary>,
    /// The playlist currently open/active (if any)
    pub active_playlist_id: Option<i64>,
}

/// Build the full layered system prompt for the v2 chat.
///
/// - `taste_profile_json`: pre-built JSON string from the taste profile cache
/// - `session_context`: current playback state from the frontend
pub fn assemble_system_prompt(
    db: &Database,
    taste_profile_json: Option<&str>,
    session_context: Option<&SessionContext>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    // ── Layer 1: Base identity ───────────────────────────────────────────────
    parts.push(SYSTEM_PROMPT.trim().to_string());

    // ── Layer 2: Taste profile ───────────────────────────────────────────────
    if let Some(profile) = taste_profile_json {
        if !profile.trim().is_empty() {
            parts.push(format!(
                "\n## User Taste Profile\n\nHere is an aggregate snapshot of the user's music library and listening history. Use this to inform your suggestions:\n\n```json\n{}\n```",
                profile.trim()
            ));
        }
    }

    // ── Layer 3: Explicit preferences from DB ────────────────────────────────
    if let Ok(prefs) = db.get_all_preferences() {
        if !prefs.is_empty() {
            let mut pref_lines = String::new();
            for (_, category, preference, context) in &prefs {
                let line = if let Some(ctx) = context {
                    format!("  - [{}] {} (context: {})", category, preference, ctx)
                } else {
                    format!("  - [{}] {}", category, preference)
                };
                pref_lines.push_str(&line);
                pref_lines.push('\n');
            }
            parts.push(format!(
                "\n## User Preferences\n\nThe user has explicitly stated these preferences in past sessions:\n\n{}",
                pref_lines.trim_end()
            ));
        }
    }

    // ── Layer 4: Current session context ────────────────────────────────────
    if let Some(session) = session_context {
        let mut session_lines = String::new();

        if let Some(np) = &session.now_playing {
            let bpm_str = np.bpm.map(|b| format!("{:.1} BPM", b)).unwrap_or_else(|| "? BPM".to_string());
            let key_str = np.key.clone().unwrap_or_else(|| "?".to_string());
            let artist_str = np.artist.clone().unwrap_or_else(|| "Unknown".to_string());
            session_lines.push_str(&format!(
                "Now playing: \"{}\" by {} (ID: {}, {}, Key: {})\n",
                np.title, artist_str, np.id, bpm_str, key_str
            ));
        }

        if !session.recent_queue.is_empty() {
            session_lines.push_str("Recent queue:\n");
            for track in &session.recent_queue {
                let bpm_str = track.bpm.map(|b| format!("{:.1}", b)).unwrap_or_else(|| "?".to_string());
                let key_str = track.key.clone().unwrap_or_else(|| "?".to_string());
                let artist_str = track.artist.clone().unwrap_or_else(|| "Unknown".to_string());
                session_lines.push_str(&format!(
                    "  - \"{}\" by {} (ID: {}, {} BPM, {})\n",
                    track.title, artist_str, track.id, bpm_str, key_str
                ));
            }
        }

        if let Some(playlist_id) = session.active_playlist_id {
            session_lines.push_str(&format!("Active playlist ID: {}\n", playlist_id));
        }

        if !session_lines.is_empty() {
            parts.push(format!(
                "\n## Current Session\n\n{}",
                session_lines.trim_end()
            ));
        }
    }

    // ── Tool usage guidelines ────────────────────────────────────────────────
    parts.push(
        r#"

## Tool Usage Guidelines

You have 6 tools available. Use them proactively to give the best DJ assistance:

1. **search_library** – Search before queuing or creating playlists. Always verify tracks exist.
2. **create_playlist** – After searching, assemble playlists from the found track IDs.
3. **tag_tracks** – Apply mood/energy/vibe tags when the user wants to organize their library.
4. **queue_tracks** – Send tracks to the player. Use mode "play_now", "append", or "play_next".
5. **recall_conversations** – Search past chats when the user references something from before.
6. **save_preference** – Persist any lasting taste or workflow preference the user expresses.

Rules:
- Always search first, then queue or playlist. Never assume track IDs.
- Save preferences when the user expresses lasting tastes ("I always", "I prefer", "I never").
- Be concise in your text replies — the actions speak for themselves.
- When referencing tracks, use their IDs from search results."#
        .to_string(),
    );

    parts.join("\n")
}
