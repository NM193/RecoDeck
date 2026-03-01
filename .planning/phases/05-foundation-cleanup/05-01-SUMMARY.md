---
phase: 05-foundation-cleanup
plan: 01
subsystem: ai-error-handling, audio-module
tags: [debt-reduction, error-handling, rust-refactor, typescript]
dependency_graph:
  requires: []
  provides: [ai-friendly-errors, settings-navigation-from-ai, shared-audio-mime-type]
  affects: [src/store/aiStore.ts, src/App.tsx, src/components/ai/, src-tauri/src/audio/mod.rs, src-tauri/src/lib.rs, src-tauri/src/server/streaming.rs]
tech_stack:
  added: []
  patterns: [getErrorMessage-error-utility, zustand-callback-registration, rate-limit-retry-with-backoff]
key_files:
  created: []
  modified:
    - src/store/aiStore.ts
    - src/App.tsx
    - src/components/ai/AIChatPanel.tsx
    - src/components/ai/AIPlaylistDialog.tsx
    - src/components/ai/RecommendationsPanel.tsx
    - src/components/ai/MixPrepPanel.tsx
    - src-tauri/src/audio/mod.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/server/streaming.rs
decisions:
  - "Rate-limit retry inlined in each catch block (not a shared helper) because the retry operation and success-state updates differ per operation"
  - "Settings button detected by error string containing 'Settings' — no separate error type field needed"
  - "audio_mime_type placed in audio/mod.rs directly (not a separate mime.rs) since the module is small"
metrics:
  duration: "~20 minutes"
  completed: "2026-03-01"
  tasks_completed: 2
  files_modified: 9
---

# Phase 5 Plan 01: AI Error Handling and audio_mime_type Consolidation Summary

**One-liner:** Fixed AI [object Object] bug with getErrorMessage utility, added clickable Settings navigation from AI error displays, and eliminated duplicate audio_mime_type Rust function across two files.

## What Was Built

### Task 1: AI Error Handling Migration (DEBT-01)

The root cause of the `[object Object]` error display bug: Tauri IPC errors are plain objects (not Error instances), so `instanceof Error` always returned false and `String(error)` serialized the object as `[object Object]`. Fixed by switching all 5 catch blocks in `aiStore.ts` to use the existing `getErrorMessage(e)` utility that already knows how to handle Tauri's structured `AppError` objects.

Additional improvements added as part of this fix:

**Rate-limit auto-retry:** When `sendMessage` or `generatePlaylist` receives an `AiNetwork` error with "Rate limited" in the message, they now retry up to 2 times with 30-second backoff, displaying countdown feedback like "Rate limited — retrying in 30 seconds... (attempt 1/2)".

**Settings navigation from errors:** `AiNoApiKey` and `AiInvalidKey` errors display messages containing "Settings" (e.g., "No API key configured -- add your Claude API key in Settings"). All 4 AI components now detect the word "Settings" in the error and render a clickable `<button type="button">Open Settings</button>` that calls `useAIStore.getState().openSettingsCallback?.()`.

The `openSettingsCallback` is registered by `App.tsx` on mount:
```typescript
useEffect(() => {
  useAIStore.getState().registerOpenSettings(() => setSettingsOpen(true));
}, []);
```

### Task 2: audio_mime_type Consolidation (DEBT-02) + Clippy Verification (DEBT-05)

The identical `audio_mime_type` function existed in two places: `src-tauri/src/lib.rs` (for the `stream://` URI scheme handler) and `src-tauri/src/server/streaming.rs` (for the Axum companion server). This was a maintenance risk — if MIME mappings needed updating, both copies needed updating in sync.

Moved to a single `pub fn audio_mime_type` in `src-tauri/src/audio/mod.rs`:
- `lib.rs` now imports: `use audio::audio_mime_type;`
- `streaming.rs` now imports: `use crate::audio::audio_mime_type;`

`cargo clippy` confirmed zero warnings after the consolidation (DEBT-05 verified).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a8c2e24 | feat(05-01): migrate AI error handling to getErrorMessage with Settings navigation |
| 2 | d4e0a5e | refactor(05-01): consolidate audio_mime_type to shared audio module |

## Verification Results

All plan verification checks passed:

1. `getErrorMessage` appears in aiStore.ts import and all catch blocks — PASS
2. `instanceof Error` does not appear in aiStore.ts — PASS
3. Rate-limit retry logic exists in aiStore.ts — PASS
4. `openSettingsCallback` and `registerOpenSettings` in aiStore.ts — PASS
5. `registerOpenSettings` called in App.tsx — PASS
6. `openSettingsCallback` in all 4 AI components — PASS (AIChatPanel: 1, AIPlaylistDialog: 3, RecommendationsPanel: 1, MixPrepPanel: 1)
7. "Open Settings" button text in all 4 components — PASS
8. `pub fn audio_mime_type` in audio/mod.rs — PASS
9. No local `fn audio_mime_type` in lib.rs — PASS
10. No local `fn audio_mime_type` in streaming.rs — PASS
11. Import lines exist in lib.rs and streaming.rs — PASS
12. `cargo check` zero errors, `cargo clippy` zero warnings — PASS
13. `npx tsc --noEmit` exit code 0 — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] src/store/aiStore.ts modified and committed (a8c2e24)
- [x] src/App.tsx modified and committed (a8c2e24)
- [x] src/components/ai/AIChatPanel.tsx modified and committed (a8c2e24)
- [x] src/components/ai/AIPlaylistDialog.tsx modified and committed (a8c2e24)
- [x] src/components/ai/RecommendationsPanel.tsx modified and committed (a8c2e24)
- [x] src/components/ai/MixPrepPanel.tsx modified and committed (a8c2e24)
- [x] src-tauri/src/audio/mod.rs modified and committed (d4e0a5e)
- [x] src-tauri/src/lib.rs modified and committed (d4e0a5e)
- [x] src-tauri/src/server/streaming.rs modified and committed (d4e0a5e)
