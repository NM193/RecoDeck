---
phase: 01-codebase-quality
plan: 01
subsystem: backend-errors
tags: [error-handling, tauri-commands, ai-integration, typescript]
dependency_graph:
  requires: []
  provides: [typed-error-system, ai-error-classification, frontend-error-guard]
  affects: [all-tauri-commands, ai-commands, frontend-components]
tech_stack:
  added: [thiserror = "2"]
  patterns: [tagged-serde-enum, Result<T,AppError>, AppError-propagation]
key_files:
  created:
    - src-tauri/src/error.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/commands/ai.rs
    - src-tauri/src/commands/library.rs
    - src-tauri/src/commands/analysis.rs
    - src-tauri/src/commands/playback.rs
    - src-tauri/src/commands/playlists.rs
    - src-tauri/src/commands/genre.rs
    - src-tauri/src/commands/settings.rs
    - src-tauri/src/commands/server.rs
    - src-tauri/src/commands/watcher.rs
    - src-tauri/src/ai/claude_client.rs
    - src-tauri/src/ai/context_builder.rs
    - src/types/ai.ts
    - src/lib/tauri-api.ts
decisions:
  - "Used thiserror v2 instead of manual Display impls -- cleaner, derives Error trait automatically"
  - "Tagged serde enum with kind/content shape chosen for frontend switch-based discrimination"
  - "Claude model updated to claude-sonnet-4-20250514 (latest stable Sonnet at time of writing)"
  - "Removed unused imports from tauri-api.ts due to noUnusedLocals:true -- types accessible directly from types/ai.ts"
  - "context_builder.rs return type also updated to AppError (deviation: not in original plan but required for ai.rs compilation)"
metrics:
  duration: "9 minutes"
  completed: "2026-02-28"
  tasks_completed: 2
  files_modified: 16
---

# Phase 1 Plan 1: Typed Error System and AI Command Migration Summary

Implemented a shared `AppError` enum with `thiserror` and migrated all 38+ Tauri commands from `Result<T, String>` to `Result<T, AppError>`, fixing broken AI error handling and adding TypeScript types for structured error discrimination in the frontend.

## What Was Built

### Backend: AppError enum (src-tauri/src/error.rs)

New typed error enum with 8 variants, serialized as a tagged enum for IPC:

```rust
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    Database(String),
    NotFound(String),
    AiNoApiKey,           // unit variant -- no message
    AiInvalidKey,         // unit variant -- no message
    AiNetwork(String),
    AiParsing(String),
    Internal(String),
    Validation(String),
}
```

Frontend receives `{"kind":"AiNoApiKey"}` or `{"kind":"Database","message":"..."}`.

### Backend: ClaudeClient HTTP error classification

HTTP errors from Anthropic API now produce typed errors:
- 401 -> `AppError::AiInvalidKey`
- 429 -> `AppError::AiNetwork("Rate limited -- wait a moment and try again")`
- Timeout -> `AppError::AiNetwork("Request timed out -- ...")`
- Connection error -> `AppError::AiNetwork("Could not connect to AI service -- ...")`
- Other client errors -> `AppError::AiInvalidKey`

### Backend: get_ai_api_key_status fix

Before (silent error swallowing):
```rust
Err(e) => {
    eprintln!("Error checking API key status: {}", e);
    Ok(false)  // swallowed!
}
```

After (error propagation):
```rust
Err(e) => Err(e),  // propagate to caller
```

### Frontend: TypeScript error types (src/types/ai.ts)

New exports:
- `AppErrorKind` union type with 8 variants
- `AppError` interface with `kind` and optional `message`
- `isAppError(e: unknown): e is AppError` type guard
- `getErrorMessage(e: unknown): string` utility

Usage in components:
```typescript
try {
  await tauriApi.aiGeneratePlaylist(prompt);
} catch (e) {
  if (isAppError(e) && e.kind === 'AiNoApiKey') {
    // Show "add API key" prompt
  } else {
    setError(getErrorMessage(e));
  }
}
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated context_builder.rs return type to AppError**
- **Found during:** Task 1 (cargo check)
- **Issue:** `TrackContextBuilder::build_full_context` returned `Result<String, String>`, but `commands/ai.rs` uses `?` operator on its result -- would cause type mismatch
- **Fix:** Changed return type signature in `context_builder.rs` from `Result<String, String>` to `Result<String, AppError>` for both `build_full_context` and `build_smart_context`
- **Files modified:** `src-tauri/src/ai/context_builder.rs`
- **Impact:** Clean compilation with zero errors

**2. [Rule 2 - Missing] Removed unused imports from tauri-api.ts**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** `noUnusedLocals: true` in tsconfig.json flagged `AppError`, `isAppError`, `getErrorMessage` as unused
- **Fix:** Removed runtime imports from `tauri-api.ts`; left a comment directing components to import directly from `../types/ai`
- **Files modified:** `src/lib/tauri-api.ts`
- **Impact:** TypeScript compiles cleanly; utilities are available from `types/ai.ts` for any component to import

## Verification Results

1. `cargo check` -- Finished with 0 errors, 7 pre-existing warnings (unchanged)
2. `tsc --noEmit` -- Passed with 0 errors
3. No `Result<T, String>` remain in Tauri command signatures
4. `get_ai_api_key_status` propagates errors (no `Ok(false)` on error path)
5. `serde(tag = "kind", content = "message")` confirmed in error.rs
6. `CLAUDE_MODEL` updated to `"claude-sonnet-4-20250514"`

## Self-Check: PASSED

Files created/modified verified:
- FOUND: src-tauri/src/error.rs
- FOUND: src/types/ai.ts (AppError interface, isAppError guard, getErrorMessage)
- FOUND: All 9 command files migrated (cargo check passes)

Commits verified:
- 15f6506: feat(01-01): create AppError enum and migrate all backend commands
- 9006f86: feat(01-01): add frontend AppError types and type guard
