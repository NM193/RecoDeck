# Phase 27: Conversation Database Schema - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Create two new SQLite tables (`ai_conversations` and `ai_messages`) via a new migration file. Tables are created idempotently on app startup. This phase is schema-only — no Rust commands or frontend changes.

</domain>

<decisions>
## Implementation Decisions

### Delete behavior
- Hard CASCADE delete: when a conversation is deleted, all its messages are permanently removed from the database
- UI must show a confirmation dialog before deleting a conversation (Phase 29 will implement this)
- No soft-delete — conversations are removed permanently

### Legacy table
- Existing `ai_chat_history` table in `001_init.sql` can be left as-is — it's a different schema (flat, no conversations, has playlist_id FK)
- New tables are additive — no migration of existing data needed
- Claude's discretion on whether to drop the old table or leave it

### Claude's Discretion
- Migration file naming and numbering (next would be `005_ai_conversations.sql`)
- Idempotency strategy (CREATE TABLE IF NOT EXISTS vs column check)
- Index strategy for the new tables (e.g., index on conversation_id in ai_messages for fast lookups)
- Whether to enable PRAGMA foreign_keys for CASCADE behavior

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database patterns
- `src-tauri/src/db/mod.rs` — Database struct, `run_migrations()` method, migration loading pattern via `include_str!`
- `src-tauri/src/db/migrations/001_init.sql` — Existing `ai_chat_history` table (lines 144-150), table creation patterns
- `src-tauri/src/db/migrations/003_genre.sql` — Example of idempotent migration with column existence check
- `src-tauri/src/db/migrations/004_performance_indexes.sql` — Latest migration file, index creation pattern

### Requirements
- `.planning/REQUIREMENTS.md` — DB-01, DB-02 define exact column specs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Database` struct in `db/mod.rs`: wraps `rusqlite::Connection`, all queries are methods on this struct
- `run_migrations()`: loads SQL files via `include_str!`, runs them in sequence with idempotency checks

### Established Patterns
- Migrations are numbered SQL files: `001_init.sql`, `002_playlists_parent.sql`, etc.
- Later migrations (002, 003) check for column/table existence before running for idempotency
- `001_init.sql` uses `CREATE TABLE IF NOT EXISTS` — safe to re-run
- All table IDs in existing schema use INTEGER PRIMARY KEY (auto-increment) — but requirements specify TEXT PK with UUIDs for new tables

### Integration Points
- `run_migrations()` in `db/mod.rs` must be updated to include the new migration file
- UUID generation will need the `uuid` crate (already in Cargo.toml per user constraint)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — schema is well-defined in requirements. Key specs:
- `ai_conversations`: id TEXT PK, title TEXT, created_at INTEGER
- `ai_messages`: id TEXT PK, conversation_id TEXT FK, role TEXT, content TEXT, metadata_json TEXT NULL, created_at INTEGER

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-conversation-database-schema*
*Context gathered: 2026-03-15*
