# Phase 28: Backend Commands and Message Persistence - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

All conversation and message CRUD operations as Tauri commands — create, list, load, delete, rename, auto-title, and per-message save. The existing `ai_chat` command gains transparent persistence when a `conversation_id` is provided. Other AI commands (playlist, recommendations, mix-prep) remain unchanged. No frontend UI changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Persistence strategy
- Transparent backend persistence: modify `ai_chat` to accept an optional `conversation_id` parameter
- When `conversation_id` is provided: save user message to DB before calling Claude, save assistant response after
- When `conversation_id` is `None`: existing behavior unchanged (COMPAT-01 satisfied)
- Frontend still passes `conversation_history` array — backend does NOT load history from DB
- `ai_chat` return type stays `Result<String, AppError>` — no breaking change
- Only `ai_chat` persists messages; playlist/recommendations/mix-prep commands are standalone, no persistence

### Command organization
- New `src-tauri/src/commands/conversations.rs` module for CRUD commands
- `ai.rs` stays focused on AI inference (614 lines, unchanged except `conversation_id` param on `ai_chat`)
- DB query methods (create_conversation, list_conversations, etc.) stay in `db/mod.rs` as methods on the `Database` impl block — consistent with existing pattern (tracks, playlists, settings all in mod.rs)

### Auto-title behavior
- Title is set on first user message save: when `ai_chat` saves the first user message to a conversation with an empty title, it truncates to 50 chars and updates the title
- Hard truncation at 50 chars (no word boundary, no ellipsis) — it's a title preview
- Include a `rename_conversation` Tauri command so Phase 29 UI can wire a rename button

### Metadata usage
- `metadata_json` column stays NULL for all messages in this phase
- Column exists for future extensibility (token counts, model version, etc.) but no premature decisions

### PRAGMA foreign_keys
- Move `PRAGMA foreign_keys = ON` to `Database::new()` / connection opening — not just `run_migrations()`
- Every connection gets FK enforcement automatically, including CRUD operations

### Claude's Discretion
- UUID generation approach (uuid crate is already in Cargo.toml)
- Exact error handling for persistence failures (should a failed DB save abort the chat response?)
- Ordering of list_conversations results (created_at DESC is the requirement, implementation details flexible)
- Test strategy for new commands

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database patterns
- `src-tauri/src/db/mod.rs` — Database struct, `run_migrations()`, migration loading via `include_str!`, all query methods
- `src-tauri/src/db/migrations/005_ai_conversations.sql` — Table schemas for `ai_conversations` and `ai_messages` (created in Phase 27)

### Existing AI commands
- `src-tauri/src/commands/ai.rs` — Current `ai_chat` signature (line 543), `ChatMessage` struct (line 40), all Tauri command registrations
- `src-tauri/src/commands/mod.rs` — Command module exports and Tauri handler registration

### Frontend API contract
- `src/lib/tauri-api.ts` — `aiChat(message, conversationHistory)` wrapper (line 385), all AI command invocations

### Requirements
- `.planning/REQUIREMENTS.md` — CONV-01 through CONV-05, MSG-01 through MSG-03, COMPAT-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatMessage` struct in `ai.rs`: `{ role: String, content: String, timestamp: Option<String> }` — reuse for message serialization
- `AppState` with `db: Mutex<Option<Database>>` — all commands follow the same lock-guard pattern
- `get_api_key_from_db` helper — example of clean DB access from commands
- `uuid` crate already in `Cargo.toml`

### Established Patterns
- Tauri commands are `pub async fn` with `#[tauri::command]` attribute in `src-tauri/src/commands/`
- DB access: `state.db.lock() -> db_guard -> db.method()` — consistent across all command files
- All DB queries are methods on `Database` struct in `db/mod.rs`
- Error handling: `AppError` enum with typed variants, `thiserror` derivation
- Commands registered in `mod.rs` and wired in Tauri builder

### Integration Points
- `ai_chat` in `ai.rs` line 543 — add `conversation_id: Option<String>` parameter
- `src-tauri/src/commands/mod.rs` — register new `conversations.rs` module and export commands
- `src/lib/tauri-api.ts` — add TypeScript wrappers for new conversation commands
- Tauri builder in `main.rs` or `lib.rs` — register new command handlers

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the command surface is well-defined in REQUIREMENTS.md (CONV-01 through CONV-05, MSG-01 through MSG-03). Key implementation notes:
- `create_conversation` returns the new `conversation_id` (UUID string)
- `list_conversations` returns `Vec<{id, title, created_at}>` ordered by `created_at DESC`
- `get_conversation_messages` returns `Vec<{id, role, content, created_at}>` ordered by `created_at ASC`
- `delete_conversation` triggers CASCADE delete of messages (enforced by FK + PRAGMA)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-backend-commands-and-message-persistence*
*Context gathered: 2026-03-15*
