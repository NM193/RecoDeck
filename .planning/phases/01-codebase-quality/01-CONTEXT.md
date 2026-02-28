# Phase 1: Codebase Quality - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Stabilize the existing codebase so future phases build on solid ground. Fix broken/incomplete AI command integration, establish consistent error handling across all Tauri commands, remove dead code and unused dependencies, and fix known stability issues. No new features — only hardening what exists.

</domain>

<decisions>
## Implementation Decisions

### AI fix scope
- AI commands (ai_generate_playlist, ai_chat, set/get/delete_ai_api_key, rebuild_ai_context) exist and are wired to frontend but may not have been tested end-to-end
- API key storage: currently uses SQLite settings table (working). CredentialManager (OS keychain) is fully coded but never called — resolve the duplication
- Claude model is hardcoded to `claude-sonnet-4-5-20250929` — update to latest model
- When AI calls fail (bad API key, network error, rate limit), show clear, actionable error messages — e.g., "API key invalid — check Settings" or "Network error — try again"
- `get_ai_api_key_status` silently swallows errors (returns `Ok(false)`) — should propagate errors properly

### Error handling conventions
- Standardize error handling across ALL Tauri commands (38+ commands), not just AI — matches QUAL-02 requirement
- Replace raw `Result<T, String>` with typed error handling so frontend can interpret error categories (user error vs system error vs network error)
- Frontend should display errors where they happen (inline for persistent errors, transient notifications for network/temporary errors)
- Translate technical error messages to user-friendly language — this targets DJ friends, not developers

### Logging cleanup
- ~30 `eprintln!`/`println!` debug statements scattered across backend (playback, analysis, server, credentials)
- `credentials.rs` has println! output with emoji that goes nowhere useful

### Claude's Discretion
- Whether to use a Rust logging crate (tracing/log) or keep eprintln! — scope to what's proportional for a small app
- Exact typed error enum design (categories, hierarchy)
- Error message wording and UI placement details
- Whether to add regression tests for fixes made

</decisions>

<specifics>
## Specific Ideas

- The dual API key storage (SQLite vs keychain) should be resolved to one approach — remove the unused one
- Streaming structs (StreamEvent, Delta) in claude_client.rs were pre-built for future streaming AI chat but are dead code — Phase 3 will re-implement if needed
- All 7 cargo warnings should be resolved (2 unused structs, 4 unused constants, 1 dead code)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ClaudeClient` (src-tauri/src/ai/claude_client.rs): Working Claude API client with chat and playlist generation — needs error handling improvements, not rewrite
- `TrackContextBuilder` (src-tauri/src/ai/context_builder.rs): Builds AI-consumable track context from library — reuse as-is
- `AppState` (src-tauri/src/commands/library.rs): Central state with db mutex + ai_context_cache + db_path — error handling patterns here propagate everywhere

### Established Patterns
- All Tauri commands use `State<AppState>` with `db.lock().unwrap()` pattern — unwrap() is the stability risk to address
- `TrackDTO` is the serializable bridge between Rust Track and frontend — From impl handles conversion
- Settings stored as JSON strings in SQLite `settings` table — API key follows this pattern
- `map_err(|e| format!("...: {}", e))` is the universal error conversion — replace with typed errors

### Integration Points
- `src-tauri/src/commands/mod.rs`: All commands registered here — error type changes affect every module
- `src/lib/tauri-api.ts`: Frontend IPC wrappers — needs to handle new error types
- `src-tauri/src/lib.rs`: App setup with stream protocol (lines 104-416) — mutex patterns here too

### Dead Code Identified
- `src-tauri/src/ai/credentials.rs`: Entire CredentialManager module — never called
- `claude_client.rs` lines 57-76: StreamEvent + Delta structs — never constructed
- `audio/key.rs` lines 68-82: TEMPERLEY_MAJOR/MINOR, KS_MAJOR/KS_MINOR constants — never used
- Dependencies potentially unused: `keyring`, `aes-gcm` (tied to dead CredentialManager), `tokio-stream`, `futures`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-codebase-quality*
*Context gathered: 2026-02-28*
