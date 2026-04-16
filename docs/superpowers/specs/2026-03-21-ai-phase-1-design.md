# AI Phase 1: Intelligent Chat with Tool-Use Architecture

## Overview

Transform RecoDeck's AI chat from a text-only advisor into a DJ command center that understands your taste, remembers past conversations, and takes direct actions on your library — creating playlists, tagging tracks, and controlling playback from natural language.

## Goals

- Claude becomes context-aware: knows your taste, preferences, and what you're doing right now
- Claude takes actions: creates playlists, tags tracks, queues music — not just suggests
- Claude remembers: recalls past conversations and learns your preferences over time
- The chat is the primary interface for AI-powered library management

## Non-Goals (Deferred)

- Streaming responses (can be layered on later without architecture changes)
- Audio-based similarity (embeddings, deep analysis) — future AI Phase 2
- Auto-tagging on import — future AI Phase 2
- Multi-user support

## Architecture

### Approach: Claude Tool-Use API

Use Claude's native `tool_use` capability. Define typed tools that Claude can call during conversation. The Rust backend orchestrates a multi-turn loop: Claude responds with tool calls, Rust executes them, sends results back, Claude gives a final answer.

### Request Flow

1. Frontend sends user message via `invoke("ai_chat_v2")`
2. Rust Chat Orchestrator assembles context (identity + taste profile + preferences + session + conversation history)
3. Rust calls Claude API with messages + tool definitions
4. Claude responds with text and/or `tool_use` blocks
5. Rust executes requested tools (create playlist, search library, etc.)
6. Rust sends tool results back to Claude
7. Claude gives final response summarizing what was done
8. Rust returns structured response to frontend: `{ text: String, actions: Vec<ActionResult> }`
9. Frontend renders message and refreshes affected UI state

The tool-use loop caps at **5 round-trips** to prevent runaway API calls. Typical interactions need 1-2 rounds.

### New Tauri Command

```rust
#[tauri::command]
async fn ai_chat_v2(
    message: String,
    conversation_id: String,
    session_context: Option<SessionContext>, // now playing, queue, active playlist from frontend
    state: State<'_, AppState>,
) -> Result<ChatV2Response, AppError>

struct SessionContext {
    now_playing: Option<TrackSummary>,   // current track from playerStore
    recent_queue: Vec<TrackSummary>,     // last 5 queued tracks
    active_playlist_id: Option<i64>,     // playlist being viewed
}

struct ChatV2Response {
    text: String,
    actions: Vec<ActionResult>,
}

struct ActionResult {
    tool_name: String,
    success: bool,
    summary: String, // "Created playlist 'Warm-Up Set' with 8 tracks"
    data: Option<serde_json::Value>, // structured result for frontend
}
```

Exists alongside current `ai_chat` — no breaking changes to existing functionality.

## Tools

Six tools Claude can call during conversation:

### 1. search_library

Search tracks by criteria. Foundation tool — Claude searches before acting.

```json
{
  "name": "search_library",
  "parameters": {
    "query": "string (optional) — free-text search across title, artist, album",
    "artist": "string (optional) — filter by artist name",
    "genre": "string (optional) — filter by genre",
    "bpm_range": "[min, max] (optional) — BPM range filter",
    "key": "string (optional) — Camelot key filter (e.g., '8A')",
    "tags": "string[] (optional) — filter by tags",
    "limit": "number (optional, default 20) — max results"
  },
  "returns": "Array of track objects: { id, title, artist, bpm, key, genre, duration_ms, rating, play_count }"
}
```

### 2. create_playlist

Create a playlist from track IDs.

```json
{
  "name": "create_playlist",
  "parameters": {
    "name": "string — playlist name",
    "track_ids": "number[] — ordered list of track IDs",
    "description": "string (optional) — playlist description"
  },
  "returns": "{ playlist_id, name, track_count }"
}
```

### 3. tag_tracks

Add or remove tags on tracks. Supports batch operations.

```json
{
  "name": "tag_tracks",
  "parameters": {
    "track_ids": "number[] — tracks to tag",
    "add_tags": "string[] (optional) — tags to add",
    "remove_tags": "string[] (optional) — tags to remove",
    "category": "string (optional) — tag category: mood | energy | venue | vibe"
  },
  "returns": "{ updated_count, tags_added, tags_removed }"
}
```

### 4. queue_tracks

Control playback queue. Note: the queue lives in the frontend `playerStore` (Zustand), not in Rust. The orchestrator returns queued track IDs in `ActionResult.data` and the frontend applies them to `playerStore` post-response.

```json
{
  "name": "queue_tracks",
  "parameters": {
    "track_ids": "number[] — tracks to queue",
    "mode": "'play_now' | 'append' | 'play_next'"
  },
  "returns": "{ queued_count, mode, now_playing?: track_summary }"
}
```

### 5. recall_conversations

Search past conversations for relevant context.

```json
{
  "name": "recall_conversations",
  "parameters": {
    "query": "string — search query",
    "limit": "number (optional, default 5) — max conversation snippets"
  },
  "returns": "Array of { conversation_id, title, relevant_messages: [{ role, content, created_at }] }"
}
```

### 6. save_preference

Store an explicit user preference.

```json
{
  "name": "save_preference",
  "parameters": {
    "category": "string — preference category (genre, mixing, artist, context, general)",
    "preference": "string — the preference statement",
    "context": "string (optional) — when this preference applies"
  },
  "returns": "{ saved: true, category, preference }"
}
```

## Taste Profile & Memory

### Implicit Learning (Automatic)

A compact JSON profile (~500 tokens) rebuilt on app launch and after every 10 plays. Derived from:

- **Play counts & frequency** — most played tracks, artists, genres
- **Ratings** — tracks rated 4-5 stars, distribution patterns
- **Playlist curation** — genre/BPM/key distributions across user playlists
- **Library composition** — top genres, BPM ranges, artist counts
- **Tag usage** — most applied mood/energy/venue/vibe tags

Stored in new `taste_profile` SQLite table as a JSON blob. Cached in Rust `AppState` for instant inclusion in every request.

### Explicit Preferences (User-Driven)

Saved by Claude via the `save_preference` tool when the user expresses preferences in conversation. Examples:

- "I prefer deep house over tech house for warm-ups"
- "I always start below 124 BPM and build up"
- "Don't suggest Deadmau5"
- "For outdoor events, lean toward progressive"

Stored in new `user_preferences` SQLite table with columns: `id`, `category`, `preference`, `context`, `created_at`.

### Conversation Memory

Uses existing `ai_conversations` + `ai_messages` tables. The `recall_conversations` tool performs keyword-based search across message content and returns relevant snippets (not full transcripts). Tool calls and results stored in `metadata_json` column for recall and debugging.

## Context Assembly

Layered context injected into Claude's system prompt on every request:

| Layer | Content | ~Tokens | Strategy |
|-------|---------|---------|----------|
| 1. Identity | DJ persona, Camelot knowledge, mixing rules, tool instructions | 800 | Always included |
| 2. Taste Profile | Top genres, BPM ranges, favorite artists, library stats | 500 | Always included |
| 3. Explicit Preferences | All saved user preferences | 300 | Always included |
| 4. Current Session | Now playing, recent queue, active playlist | 600 | Always included |
| 5. Conversation History | Last N messages in current conversation | 1000 | Sliding window, trimmed to fit |
| 6. Recalled Conversations | Past chat snippets matching current topic | 500 | On demand (via recall_conversations tool) |

**Typical request size: ~3,700 tokens** (well within Sonnet's context window).

**Key change from today:** The current context builder dumps up to 5K tracks as JSON. In Phase 1, Claude uses `search_library` to query what it needs. Base context is about *who you are*, not *what you have*.

### Taste Profile Rebuild Schedule

- On app launch (ensures fresh profile each session)
- After every 10 track plays (incremental learning)
- Cached in `AppState` — no DB hit per chat request

## Database Changes

### New Tables

```sql
-- Taste profile cache
CREATE TABLE taste_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    profile_json TEXT NOT NULL,
    rebuilt_at INTEGER NOT NULL
);

-- Explicit user preferences
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    preference TEXT NOT NULL,
    context TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Migration

New migration `007_ai_phase1.sql` with both tables.

## Frontend Changes

### ChatView Updates

- Call `ai_chat_v2` instead of `ai_chat`
- Render `ActionResult` items as inline action confirmations in the chat bubble (e.g., "Created playlist 'Warm-Up Set' with 8 tracks" with a link to the playlist)
- Refresh affected stores after actions: call `loadPlaylists()` if playlist created, update queue in `playerStore` if tracks queued, refresh track list if tags changed

### aiStore Updates

- New `sendMessageV2()` action that calls `ai_chat_v2` and handles structured response
- Store action results alongside messages for display
- Taste profile status indicator (optional: show "learning..." after plays)

### Action Confirmation UI

Action results rendered as compact cards within chat messages:
- Playlist created → name + track count + "Open" link
- Tracks queued → count + mode + now-playing info
- Tags applied → count + tag names
- Preference saved → category + preference text

## Error Handling

- **Tool execution failure** — error sent back to Claude as tool result. Claude adapts conversationally ("I couldn't find any progressive house. Want me to broaden the search?")
- **API failure** — existing error handling in claude_client.rs applies. Frontend shows error state
- **Max rounds exceeded** — Claude returns what it has with explanation ("I've done what I can — here's what I found so far")
- **No API key** — existing flow: settings page prompts for key

## Testing Strategy

- **Rust unit tests** — tool executor functions tested independently with mock DB
- **Integration tests** — chat orchestrator with mock Claude API responses containing tool_use blocks
- **Frontend tests** — ChatView renders action confirmations correctly
- **Manual testing** — end-to-end conversations exercising each tool

## Migration Path

- `ai_chat_v2` is a new command — existing `ai_chat` remains unchanged
- Frontend switches to v2 — old chat UI still works until cutover
- Taste profile builds in background — no user action required
- Preferences accumulate over time through natural conversation
