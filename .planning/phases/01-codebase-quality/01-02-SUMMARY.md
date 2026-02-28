---
phase: 01-codebase-quality
plan: 02
subsystem: database
tags: [rust, clippy, cargo, dead-code, cleanup, type-aliases]

# Dependency graph
requires:
  - phase: 01-codebase-quality/01-01
    provides: AppError typed error system that replaced String errors
provides:
  - Zero cargo check/clippy warnings baseline
  - credentials.rs deleted, CredentialManager fully removed
  - TrackWithAnalysis type alias for db tuple return types
  - CompanionStartResult type alias for server.rs
affects:
  - 02-mobile-companion
  - 03-ai-enhancement

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type alias pattern for complex Rust tuple return types (TrackWithAnalysis)"
    - "Minimal deserialization structs - only fields actually used in code"

key-files:
  created: []
  modified:
    - src-tauri/src/ai/mod.rs
    - src-tauri/src/ai/claude_client.rs
    - src-tauri/src/audio/key.rs
    - src-tauri/src/db/mod.rs
    - src-tauri/src/commands/server.rs
    - src-tauri/src/commands/playback.rs
    - src-tauri/src/commands/watcher.rs
    - src-tauri/src/commands/library.rs
    - src-tauri/src/scanner.rs
    - src-tauri/src/server/mod.rs
    - src-tauri/Cargo.toml

key-decisions:
  - "Simplify ClaudeResponse to only fields accessed (content) rather than full API response shape"
  - "Remove reqwest stream feature - server streaming uses axum Body, not reqwest streaming"
  - "Use TrackWithAnalysis type alias to resolve type_complexity warnings without changing db API"

patterns-established:
  - "Zero-warning policy: cargo check and cargo clippy must produce 0 warnings"
  - "Minimal struct deserialization: only declare fields you actually access"

requirements-completed: [QUAL-03, QUAL-04]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 1 Plan 02: Dead Code Removal and Zero-Warning Baseline Summary

**Deleted credentials.rs and 4 unused Cargo deps, removed all 31 clippy warnings (20 auto-fixed, 11 manual) to reach a zero-warning baseline with 78 tests passing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T19:51:45Z
- **Completed:** 2026-02-28T19:57:45Z
- **Tasks:** 2
- **Files modified:** 12 (1 deleted)

## Accomplishments

- Deleted `credentials.rs` (keyring-based OS keychain module, unused since Plan 01-01 migration) and removed all references
- Removed 4 unused Cargo dependencies: keyring, aes-gcm, tokio-stream, futures (and reqwest `stream` feature)
- Removed dead structs (StreamEvent, Delta) and unused constants (TEMPERLEY_MAJOR, TEMPERLEY_MINOR, KS_MAJOR, KS_MINOR)
- Achieved zero warnings from `cargo check` and `cargo clippy` (started at 31 warnings)
- All 78 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dead code and unused dependencies** - `491fb92` (chore)
2. **Task 2: Fix all cargo clippy warnings to achieve zero-warning baseline** - `bbd2bef` (fix)

## Files Created/Modified

- `src-tauri/src/ai/credentials.rs` - DELETED (keyring-based credential storage, unused)
- `src-tauri/src/ai/mod.rs` - Removed credentials module declaration and CredentialManager re-export
- `src-tauri/src/ai/claude_client.rs` - Removed StreamEvent, Delta structs; simplified ClaudeResponse to content-only; removed stream field from ClaudeRequest
- `src-tauri/src/audio/key.rs` - Removed TEMPERLEY_MAJOR, TEMPERLEY_MINOR, KS_MAJOR, KS_MINOR constants; auto-fixed range_contains pattern
- `src-tauri/src/db/mod.rs` - Added TrackWithAnalysis type alias; replaced 6 complex tuple return types; fixed doc_lazy_continuation warning; auto-fixed manual_flatten
- `src-tauri/src/commands/server.rs` - Added CompanionStartResult type alias; auto-fixed Default impl
- `src-tauri/src/commands/playback.rs` - Auto-fixed 2x implicit_saturating_sub, 2x redundant_closure, added Default impl
- `src-tauri/src/commands/watcher.rs` - Auto-fixed Default impl for WatcherState
- `src-tauri/src/commands/library.rs` - Auto-fixed collapsible_if
- `src-tauri/src/scanner.rs` - Auto-fixed manual_range_contains and collapsible_if
- `src-tauri/src/server/mod.rs` - Auto-fixed needless_question_mark and needless_borrows_for_generic_args
- `src-tauri/Cargo.toml` - Removed keyring, aes-gcm, tokio-stream, futures deps; removed reqwest stream feature

## Decisions Made

- **ClaudeResponse simplification**: Reduced from 6 fields to 1 (content only). The API sends id, type, role, model, stop_reason but none are used by the code. Minimal deserialization avoids dead_code warnings without suppression.
- **reqwest stream feature removal**: The companion server uses axum's Body for streaming, not reqwest's stream feature. Confirmed safe to remove.
- **TrackWithAnalysis type alias**: The tuple `(Track, Option<f64>, Option<f64>, Option<String>, Option<f64>)` appears in 6 db functions. A type alias resolves all 6 type_complexity warnings without changing the public API shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed dead fields from ClaudeResponse**
- **Found during:** Task 1 (removing dead code)
- **Issue:** ClaudeResponse had 5 unused fields (id, response_type, role, model, stop_reason) that triggered dead_code warnings even after removing StreamEvent/Delta
- **Fix:** Simplified ClaudeResponse to only declare `content: Vec<ContentBlock>` - the only field accessed by code
- **Files modified:** src-tauri/src/ai/claude_client.rs
- **Verification:** cargo check produced 0 warnings
- **Committed in:** 491fb92 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/dead code)
**Impact on plan:** Auto-fix was a natural extension of the dead code removal goal. No scope creep.

## Issues Encountered

None - plan executed as specified. The dead code removal cascade (credentials -> ClaudeResponse fields) was handled inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Zero-warning baseline established for Phase 1 completion
- Codebase is clean: no dead code, no unused dependencies
- Phase 2 (Mobile Companion) can proceed - server module is clean and well-typed
- Phase 3 (AI Enhancement) starts with clean AI module (claude_client.rs, context_builder.rs, system_prompt.rs)

---
*Phase: 01-codebase-quality*
*Completed: 2026-02-28*
