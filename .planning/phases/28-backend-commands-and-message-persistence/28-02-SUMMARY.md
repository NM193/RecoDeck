---
phase: 28-backend-commands-and-message-persistence
plan: "02"
subsystem: ai-chat-persistence
tags: [ai, persistence, tauri-commands, typescript, rust]
dependency_graph:
  requires: [28-01]
  provides: [message-persistence-wired, ai-chat-updated]
  affects: [src-tauri/src/commands/ai.rs, src/lib/tauri-api.ts]
tech_stack:
  added: []
  patterns: [optional-parameter-pattern, non-fatal-db-error-handling, lock-scope-management]
key_files:
  created: []
  modified:
    - src-tauri/src/commands/ai.rs
    - src/lib/tauri-api.ts
decisions:
  - "Lock acquired and released in its own if-let scope — NOT held across async Claude API call"
  - "Raw user message (not library-context-prepended version) is saved to DB for fidelity"
  - "DB save failures are non-fatal: eprintln log only, AI response always returned"
  - "conversationId ?? null in TypeScript ensures Option<String> None when not passed"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-16"
  tasks_completed: 2
  files_changed: 2
---

# Phase 28 Plan 02: Message Persistence Wired into ai_chat Summary

**One-liner:** ai_chat command persists user+assistant messages to DB when conversation_id is Some, with non-fatal error handling and lock-scope safety.

## What Was Built

Wired the message persistence layer (from Plan 01) into the existing `ai_chat` Tauri command. When a `conversation_id` is provided, the user's raw message is saved before the Claude API call, and the assistant response is saved after. When no `conversation_id` is provided, behavior is identical to before (COMPAT-01 satisfied).

The TypeScript `aiChat` wrapper was updated to accept an optional `conversationId` parameter, passing it as `null` to the backend when omitted (which Rust deserializes as `Option<String>::None`).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add conversation_id parameter to ai_chat and persist messages | 045c7fe | src-tauri/src/commands/ai.rs |
| 2 | Update TypeScript aiChat wrapper to pass conversationId | dab88e4 | src/lib/tauri-api.ts |

## Key Changes

### src-tauri/src/commands/ai.rs
- `ai_chat` function signature now includes `conversation_id: Option<String>` as fourth parameter
- User message persisted before Claude call (raw input, not library-context version)
- Assistant response persisted after Claude call
- Both DB operations are in their own lock scope (not held across async boundary)
- DB failures logged with `eprintln` but are non-fatal — AI response always returned
- No other commands modified (COMPAT-01)

### src/lib/tauri-api.ts
- `aiChat` method accepts optional `conversationId?: string`
- Passes `conversationId: conversationId ?? null` to invoke (null → Rust None)
- Return type unchanged (`Promise<string>`)
- All existing callers without conversationId continue working unchanged

## Decisions Made

1. **Lock scope management:** DB lock is acquired and released in the `if let Some(ref conv_id)` block before any async work. This follows the existing pattern in the codebase and is required because `Mutex` guards cannot be held across `.await` points.

2. **Raw message persistence:** The user message saved to DB is the raw `message` string, not the version with prepended library context (`format!("My music library context:\n...\nUser: {}", ...)`). This ensures what's stored matches what the user actually typed, which is important for conversation history display.

3. **Non-fatal error handling:** `eprintln!("[ai_chat] Failed to save ...")` logs errors without bubbling them up. A failed DB write should never block the user from getting an AI response.

4. **TypeScript null coalescing:** `conversationId ?? null` (not `undefined`) ensures the JSON payload always has a `conversationId` field, making Tauri's serde deserialization of `Option<String>` reliable.

## Verification Results

- `cargo test -- --test-threads=1`: 112/112 tests pass (0 regressions)
- `npx tsc --noEmit`: TypeScript compilation clean (0 errors)
- `grep -c "conversation_id: Option<String>" ai.rs`: 1 match (only ai_chat)
- COMPAT-01: No other AI commands contain `conversation_id`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- [x] src-tauri/src/commands/ai.rs — modified
- [x] src/lib/tauri-api.ts — modified
- [x] .planning/phases/28-backend-commands-and-message-persistence/28-02-SUMMARY.md — this file

### Commits Exist
- [x] 045c7fe — feat(28-02): add conversation_id to ai_chat and persist messages
- [x] dab88e4 — feat(28-02): update aiChat TypeScript wrapper with optional conversationId

## Self-Check: PASSED
