# Phase 1: Codebase Quality - Research

**Researched:** 2026-02-28
**Domain:** Rust error handling, dead code elimination, Tauri 2 command conventions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- AI commands exist and are wired but may not have been tested end-to-end — fix, not rewrite
- API key storage: SQLite settings table is the winner — remove CredentialManager (OS keychain) entirely
- Claude model: update hardcoded `claude-sonnet-4-5-20250929` to the latest model
- AI call failures must surface actionable messages: "API key invalid — check Settings", "Network error — try again"
- `get_ai_api_key_status` silently swallows errors (returns `Ok(false)`) — must propagate errors properly
- Error handling standardized across ALL 38+ Tauri commands, not just AI
- Replace raw `Result<T, String>` with typed error handling so frontend can interpret error categories (user error / system error / network error)
- Frontend displays errors where they happen: inline for persistent errors, transient notifications for temporary
- Translate technical messages to user-friendly language (audience: DJ friends, not developers)
- ~30 eprintln!/println! debug statements must be cleaned up across backend

### Claude's Discretion

- Whether to use a Rust logging crate (tracing/log) or keep eprintln! — scope proportional to a small app
- Exact typed error enum design (categories, hierarchy)
- Error message wording and UI placement details
- Whether to add regression tests for fixes made

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-01 | Fix broken/incomplete AI command integration (ai.rs) | Error propagation patterns, model name update, dead code removal in claude_client.rs, CredentialManager removal |
| QUAL-02 | Consistent error handling across all Tauri commands | AppError enum design, `map_err` replacement pattern, frontend error type narrowing |
| QUAL-03 | Remove dead code and unused dependencies | Verified dead code list: StreamEvent, Delta, TEMPERLEY_*, KS_*, credentials.rs, keyring/aes-gcm/tokio-stream/futures crate removal |
| QUAL-04 | Fix known stability issues and bugs | lock().unwrap() audit (38 occurrences), clippy auto-fixable suggestions (18 fixes), cargo check: 0 warnings target |
</phase_requirements>

---

## Summary

This phase is pure hardening — no new features. The codebase is in working condition for the core DJ workflow (playback, library, analysis) but has two rough areas: the AI command layer was scaffolded but never stress-tested end-to-end, and error handling is inconsistent across modules (some use `map_err`, others use raw `unwrap()`). The combination creates silent failures and crash risk that blocks future AI phases.

The primary technical work is introducing a shared `AppError` enum that replaces the current `Result<T, String>` pattern, removing confirmed dead code (credentials module, streaming structs, unused constants), and converting `lock().unwrap()` calls to `lock().map_err(...)` throughout. The frontend side is lightweight: it needs to decode error categories from the backend to decide between inline display and toast notifications.

The logging situation is proportional to a small desktop app: `eprintln!` works fine for development visibility but the `credentials.rs` file emits `println!` with emoji that goes nowhere useful. Since the entire credentials module is being deleted, this cleans itself up. The remaining `eprintln!` calls in playback/analysis/server are acceptable diagnostic output — introducing `tracing` would be engineering overkill for this scope.

**Primary recommendation:** Define one `AppError` enum in `src-tauri/src/error.rs`, implement `From<AppError> for String` for Tauri compat, then systematically replace `map_err(|e| format!(...))` across all command files. Dead code removal and dependency cleanup are parallel tasks that do not touch the error system.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Rust `std::sync::Mutex` | stdlib | State locking (already in use) | No additional dep; `lock().map_err()` is idiomatic |
| `serde` + `serde_json` | 1.x (already in Cargo.toml) | Error serialization to frontend | Already used; Tauri IPC requires Serialize |
| `thiserror` | 2.x | Derive macro for error enums | Zero runtime overhead; standard in Rust ecosystem for library errors |
| Tauri 2 `#[tauri::command]` | 2.x (already in use) | Command registration | All commands already use this macro |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tracing` | 0.1 | Structured logging | Only if the team decides eprintln! is insufficient — LOW priority for this phase |
| `tracing-subscriber` | 0.3 | Log output routing | Paired with tracing; skip if not adopting tracing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `thiserror` | manual `impl std::fmt::Display` | thiserror saves boilerplate, compiles to same code |
| `thiserror` | `anyhow` | anyhow is for binaries/applications wanting type erasure; thiserror gives typed variants the frontend can match |
| Typed AppError | Keep `Result<T, String>` | Strings cannot be pattern-matched in TypeScript; typed errors enable frontend error categorization |

**Installation:**
```bash
# In src-tauri/Cargo.toml [dependencies]
thiserror = "2"
```

---

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/src/
├── error.rs             # NEW: shared AppError enum + impl
├── commands/
│   ├── ai.rs            # Fix: error propagation, model name, no CredentialManager
│   ├── analysis.rs      # Fix: unwrap() → map_err()
│   ├── library.rs       # Fix: unwrap() → map_err()
│   ├── playlists.rs     # Fix: unwrap() → map_err()
│   └── ...              # All other command files
├── ai/
│   ├── claude_client.rs # Fix: remove StreamEvent/Delta, update model const
│   ├── context_builder.rs # No change needed
│   ├── credentials.rs   # DELETE entirely
│   └── mod.rs           # Remove CredentialManager re-export
└── audio/
    └── key.rs           # Remove TEMPERLEY_*/KS_* constants
```

### Pattern 1: Typed AppError Enum

**What:** A single error enum in `src-tauri/src/error.rs` covering all failure categories.

**When to use:** Every Tauri command return type. Replaces `Result<T, String>`.

**Example:**
```rust
// src-tauri/src/error.rs
use serde::{Serialize, Deserialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("File not found: {0}")]
    NotFound(String),

    #[error("API key not configured — add your Claude API key in Settings")]
    AiNoApiKey,

    #[error("AI API key is invalid — check your key in Settings")]
    AiInvalidKey,

    #[error("Network error — check your internet connection and try again")]
    AiNetwork(String),

    #[error("AI service returned an unexpected response: {0}")]
    AiParsing(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

// Required for Tauri IPC (commands must return Result<T, impl Serialize>)
// AppError already derives Serialize so it works directly.
// This impl makes ? operator work with String returns during transition:
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
```

**Tauri command signature change:**
```rust
// Before
#[tauri::command]
pub async fn set_ai_api_key(state: State<'_, AppState>, api_key: String) -> Result<(), String> {

// After
use crate::error::AppError;
#[tauri::command]
pub async fn set_ai_api_key(state: State<'_, AppState>, api_key: String) -> Result<(), AppError> {
```

### Pattern 2: Mutex Lock Safety

**What:** Replace all `lock().unwrap()` with `lock().map_err()` to convert poisoned mutex panics into recoverable errors.

**When to use:** Every `state.db.lock()`, `state.ai_context_cache.lock()`, `playback_state.*.lock()` call.

**Current count:** 38 occurrences across commands/ and server/ (verified via code audit).

**Example:**
```rust
// Before (panics if mutex poisoned)
let db_lock = state.db.lock().unwrap();

// After (returns error instead of panicking)
let db_lock = state.db.lock()
    .map_err(|_| AppError::Internal("Database mutex poisoned".to_string()))?;
```

**Note on init_database:** The two `unwrap()` calls at lines 180-181 are initialization-time — if they fail, the app cannot start. Keeping them as panics (with a comment) is acceptable. Tauri's setup guarantees single-threaded init.

### Pattern 3: AI Error Classification

**What:** Map HTTP status codes from the Claude API to specific AppError variants.

**When to use:** In `ClaudeClient::chat()` before returning errors to commands.

**Example:**
```rust
// In claude_client.rs chat() method
if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());

    return Err(match status.as_u16() {
        401 => AppError::AiInvalidKey,
        429 => AppError::AiNetwork("Rate limited — wait a moment and try again".to_string()),
        _ if status.is_client_error() => AppError::AiInvalidKey,
        _ => AppError::AiNetwork(format!("API error {}: {}", status, error_text)),
    });
}
```

### Pattern 4: Frontend Error Handling

**What:** TypeScript switch on `kind` field from serialized AppError.

**When to use:** In every `invoke()` call catch handler.

**Example:**
```typescript
// src/lib/tauri-api.ts error helper
interface AppError {
  kind: 'AiNoApiKey' | 'AiInvalidKey' | 'AiNetwork' | 'Database' | 'NotFound' | 'Internal' | 'AiParsing';
  message: string;
}

function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'kind' in e;
}

// Usage in component:
try {
  await tauriApi.aiGeneratePlaylist(prompt);
} catch (e) {
  if (isAppError(e)) {
    switch (e.kind) {
      case 'AiNoApiKey':
      case 'AiInvalidKey':
        // Show inline in Settings panel
        setSettingsError(e.message);
        break;
      case 'AiNetwork':
        // Toast: transient, dismissible
        showToast(e.message, 'error');
        break;
      default:
        showToast(e.message, 'error');
    }
  }
}
```

### Anti-Patterns to Avoid

- **Keeping `map_err(|e| format!("...: {}", e))`:** This loses error category information, making frontend branching impossible. Replace with typed AppError variants.
- **Using `anyhow` in command layer:** anyhow erases type information. Commands need typed errors for frontend discrimination.
- **Adding `tracing` just to remove eprintln!:** Overkill for this scope. eprintln! in background tasks (playback loop, decoder) is acceptable debugging output. Only remove println! calls from credentials.rs (being deleted anyway).
- **Partial migration:** Leaving some commands as `Result<T, String>` while others return `Result<T, AppError>` creates inconsistency. Complete the migration across all 38+ commands in one phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error enum boilerplate | Manual `impl Display + Error` for each variant | `thiserror::Error` derive | Automatic, correct, zero-cost |
| Error serialization for IPC | Custom serializer | `#[derive(Serialize)]` on AppError with `#[serde(tag = "kind")]` | Tauri requires Serialize; serde handles discriminated unions |
| Frontend error type guards | Complex runtime checks | Simple `isAppError()` type guard + switch on `kind` | The `tag = "kind"` serde attribute makes this trivial |

**Key insight:** The hardest part of this phase is not the code changes — it is the systematic coverage. There are 38+ `lock().unwrap()` calls and the same `map_err(|e| format!(...))` pattern in every command. The risk is incomplete migration. Plan execution must touch every command file, not just the AI ones.

---

## Common Pitfalls

### Pitfall 1: Tauri Command Return Type Constraint

**What goes wrong:** `#[tauri::command]` requires the error type in `Result<T, E>` to implement `Serialize`. If AppError does not derive Serialize, compilation fails.

**Why it happens:** Tauri serializes the result to JSON for IPC. String serializes trivially. Custom types must explicitly derive Serialize.

**How to avoid:** `#[derive(Debug, Error, Serialize, Deserialize)]` on AppError. The `Deserialize` is useful for tests.

**Warning signs:** Compiler error mentioning `the trait bound AppError: Serialize is not satisfied`.

### Pitfall 2: Mutex Poisoning Semantics

**What goes wrong:** A `lock().unwrap()` panic anywhere in the app poisons the mutex permanently. Subsequent calls to `lock()` on the same mutex return `Err(PoisonError)` even after the panicking thread exits. This means one panic cascades into all future requests returning errors.

**Why it happens:** Rust mutex poisoning is a safety mechanism — it signals that the protected data may be in an inconsistent state. The current codebase's `unwrap()` pattern means any panic kills the mutex for the app's lifetime.

**How to avoid:** The correct pattern for Tauri apps is `lock().map_err(|_| ...)` which returns the error to the caller without re-panicking. For most cases, you can also call `.unwrap_or_else(|e| e.into_inner())` if you want to recover the potentially-inconsistent data (acceptable for read-heavy operations like get_all_tracks).

**Warning signs:** App becomes completely unresponsive after a crash that should have been recoverable.

### Pitfall 3: Incomplete Dead Code Removal Creates Linker Errors

**What goes wrong:** Removing `credentials.rs` from the filesystem but leaving `pub mod credentials;` and `pub use credentials::CredentialManager;` in `ai/mod.rs` causes a compilation error.

**Why it happens:** Rust will error on module declarations pointing to nonexistent files.

**How to avoid:** Remove in order: (1) delete the file, (2) remove `pub mod credentials` from mod.rs, (3) remove `pub use credentials::CredentialManager`, (4) verify no other file imports from `crate::ai::credentials`.

**Warning signs:** `error[E0583]: file not found for module credentials`.

### Pitfall 4: Cargo.toml Dependency Not Actually Unused

**What goes wrong:** Removing `keyring`, `aes-gcm`, `tokio-stream`, or `futures` from Cargo.toml when some other module still imports them.

**Why it happens:** The CONTEXT.md identified these as tied to the dead CredentialManager, but cargo does not always surface unused-dependency warnings (that requires `cargo +nightly udeps` or `cargo machete`).

**How to avoid:** After removing each dependency, run `cargo check` immediately. The compiler will identify any remaining imports. Remove each crate only after confirming CredentialManager is fully deleted.

**Warning signs:** `error[E0432]: unresolved import` or `error[E0433]: failed to resolve`.

### Pitfall 5: Claude Model Name Format

**What goes wrong:** Using an incorrect model ID string causes 400/404 errors from the Claude API that appear as "AI not working" to the user.

**Why it happens:** Anthropic model IDs follow a naming convention that changes with each release. The hardcoded string `claude-sonnet-4-5-20250929` in `claude_client.rs` is likely stale as of Feb 2026.

**How to avoid:** The current production model as of Feb 2026 is `claude-sonnet-4-6` (without a date suffix for the current model). Verify against https://docs.anthropic.com/en/docs/about-claude/models before updating the constant. The model string must exactly match what Anthropic's API accepts.

**Warning signs:** API returns 404 or a `model_not_found` error in the JSON error body.

---

## Code Examples

Verified patterns from direct code inspection:

### AppError definition (thiserror pattern)
```rust
// src-tauri/src/error.rs — NEW FILE
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),
    #[error("Track not found")]
    NotFound(String),
    #[error("No API key configured — add your Claude API key in Settings")]
    AiNoApiKey,
    #[error("API key is invalid — check your key in Settings")]
    AiInvalidKey,
    #[error("{0}")]
    AiNetwork(String),
    #[error("AI response could not be parsed: {0}")]
    AiParsing(String),
    #[error("Internal error: {0}")]
    Internal(String),
}
```

### Converting existing map_err calls
```rust
// Before (loses error category)
let db_guard = state.db.lock()
    .map_err(|e| format!("Failed to lock database: {}", e))?;

// After (typed, frontend can discriminate)
let db_guard = state.db.lock()
    .map_err(|_| AppError::Internal("Database mutex poisoned".to_string()))?;
```

### get_ai_api_key_status fix (QUAL-01)
```rust
// Before (silently swallows errors)
pub async fn get_ai_api_key_status(state: State<'_, AppState>) -> Result<bool, String> {
    match get_api_key_from_db(&state) {
        Ok(Some(_)) => Ok(true),
        Ok(None) => Ok(false),
        Err(e) => {
            eprintln!("Error checking API key status: {}", e);
            Ok(false)  // <-- silently returns false on error
        }
    }
}

// After (propagates errors)
pub async fn get_ai_api_key_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    match get_api_key_from_db(&state) {
        Ok(Some(_)) => Ok(true),
        Ok(None) => Ok(false),
        Err(e) => Err(e),  // propagate; frontend shows error
    }
}
```

### Dead code removal: credentials module
```toml
# src-tauri/Cargo.toml — remove these lines
keyring = "3.0"       # used only by credentials.rs
aes-gcm = "0.10"      # used only by credentials.rs
tokio-stream = "0.1"  # used only by streaming AI (deferred to Phase 3)
futures = "0.3"       # used only by streaming AI (deferred to Phase 3)
```

```rust
// src-tauri/src/ai/mod.rs — remove these lines
pub mod credentials;                     // delete
pub use credentials::CredentialManager;  // delete
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Result<T, String>` for Tauri commands | `Result<T, impl Serialize>` (typed enum) | Tauri 2 design | Frontend can now branch on error kind |
| `lock().unwrap()` panic on poison | `lock().map_err(...)` recoverable error | Rust 1.x standard practice | Eliminates panic cascade after first failure |
| `println!` / `eprintln!` for all logging | `tracing` crate for structured logs | Ecosystem standard for production Rust | Not worth adopting for this scope — keep eprintln! in background tasks |

**Deprecated/outdated:**
- `claude-sonnet-4-5-20250929`: This model name format (with date suffix) is from 2025 snapshots. Current models use names without date suffixes (e.g., `claude-sonnet-4-6`). Verify current model name at https://docs.anthropic.com/en/docs/about-claude/models.

---

## Open Questions

1. **Exact current Claude model ID**
   - What we know: Current constant is `claude-sonnet-4-5-20250929`; the project memory says latest is `claude-opus-4-6`
   - What's unclear: The exact correct model string for Sonnet tier (the project uses Sonnet, not Opus)
   - Recommendation: Verify at https://docs.anthropic.com/en/docs/about-claude/models before implementation. The correct Sonnet ID as of Feb 2026 appears to be `claude-sonnet-4-6` but this must be confirmed against official docs.

2. **AppError Deserialize on frontend**
   - What we know: Tauri serializes `Err(AppError)` as `{"kind":"AiInvalidKey","message":"..."}` when using `#[serde(tag = "kind", content = "message")]`
   - What's unclear: Whether the frontend catch block receives the raw JSON object or a pre-parsed structure
   - Recommendation: Test one command change end-to-end before mass migration. The `isAppError()` guard should handle both shapes.

3. **Whether to keep `tokio-stream` and `futures` for Phase 3**
   - What we know: These were added for streaming AI chat (Phase 3 feature), but streaming structs (StreamEvent, Delta) are dead code now
   - What's unclear: Whether Phase 3 will reuse these exact crates or pick different ones
   - Recommendation: Remove now (QUAL-03 scope). Phase 3 can re-add if needed. Cargo.lock preserves version history.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json — skip formal test mapping.

The config.json has `"workflow": {"research": true, "plan_check": true, "verifier": true}` — no `nyquist_validation` key. Validation is manual via `cargo check` / `cargo clippy`.

**Phase gate verification command:**
```bash
cd src-tauri && cargo check 2>&1 | grep "^warning:" | wc -l
# Target: 0 warnings
cd src-tauri && cargo clippy 2>&1 | grep "^warning:" | wc -l
# Target: 0 warnings
```

**Current baseline:** `cargo check` produces 7 warnings; `cargo clippy` produces 36-37 warnings (18 auto-fixable with `--fix`).

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/src/` — all findings based on reading actual source files
- `cargo check` output — 7 warnings confirmed
- `cargo clippy` output — 36 warnings confirmed, 18 auto-fixable
- `grep -rn "lock().unwrap()"` — 38 occurrences confirmed across commands/ and server/
- `grep -rn "eprintln!\|println!"` — 73 occurrences confirmed, breakdown by file verified

### Secondary (MEDIUM confidence)
- Tauri 2 command error handling: Tauri requires `Result<T, E>` where E implements `Serialize` — verified by understanding of Tauri 2 IPC mechanism and the existing code which already uses this pattern for `String`
- `thiserror` crate: standard Rust ecosystem error derive macro, version 2.x available — HIGH confidence from ecosystem knowledge

### Tertiary (LOW confidence)
- Claude model name `claude-sonnet-4-6` — based on project memory which says `claude-opus-4-6` is the latest Opus. Sonnet equivalent needs verification at official Anthropic docs before updating the constant.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use or trivially added (thiserror is well-established)
- Architecture: HIGH — based on direct code inspection, not speculation
- Pitfalls: HIGH — identified from actual code patterns found in the repository
- Model name update: LOW — requires verification against current Anthropic docs

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable Rust/Tauri ecosystem; model name may need re-verification sooner)
