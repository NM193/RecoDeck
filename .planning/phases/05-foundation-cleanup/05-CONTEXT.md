# Phase 5: Foundation Cleanup - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate tech debt and enforce code quality tooling. Fix AI error handling, consolidate duplicated Rust functions, remove dead code (greet stub + orphaned route), configure ESLint 9 + Prettier 3, and run a full lint pass to achieve zero errors/warnings. No new features, no architecture changes.

</domain>

<decisions>
## Implementation Decisions

### Prettier Code Style
- No semicolons (`semi: false`)
- Single quotes (`singleQuote: true`)
- 2-space indentation (`tabWidth: 2`)
- All trailing commas (`trailingComma: "all"`)
- Tailwind plugin explicitly out of scope (per REQUIREMENTS.md — Tailwind 4 compatibility uncertain)

### AI Error Message Wording
- Friendly + specific: error messages should include context about what went wrong (e.g., "Couldn't generate playlist — API key may be invalid" not just "Something went wrong")
- Different error types get different messages: auth errors mention API key, network errors suggest retrying, rate limits show retry countdown
- Rate limit (429) errors: auto-retry with visible feedback ("Rate limited — retrying in X seconds...") before giving up
- Invalid/missing API key errors: include a clickable link or button that navigates the user to the Settings panel ("API key invalid — check Settings")
- Keep current inline error display — errors appear in the panel where the AI result would be (no toast migration)

### Claude's Discretion
- ESLint rule strictness and plugin selection (recommended: start with typescript-eslint recommended preset)
- Exact retry count and backoff timing for rate limits
- How to structure the shared `audio_mime_type` module in Rust
- Whether to audit for additional dead code beyond the 2 listed items (greet + orphaned route)
- Line length, bracket spacing, and other Prettier options not discussed

</decisions>

<specifics>
## Specific Ideas

- AI error messages should feel informative, not alarming — help the user fix the problem
- The Settings navigation on API key errors should be a real interactive element, not just text saying "go to settings"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isAppError()` / `getErrorMessage()` in `src/types/ai.ts` — already handles Tauri IPC error extraction, used by AI components but NOT by `aiStore.ts` (the fix target)
- `AIPlaylistDialog`, `RecommendationsPanel`, `MixPrepPanel` already use `getErrorMessage` — aiStore should follow the same pattern

### Established Patterns
- Tauri commands use `State<AppState>` with `db.lock().unwrap()` pattern
- Error handling in AI components: catch → `getErrorMessage(e)` → set error state → display inline
- No ESLint or Prettier config exists — building from scratch

### Integration Points
- `aiStore.ts` catch blocks (lines 55, 67, 79, 120, 143) — all need `getErrorMessage` migration
- `audio_mime_type` duplicated at `src-tauri/src/lib.rs:66` and `src-tauri/src/server/streaming.rs:214` — consolidate to shared module
- `greet` function at `lib.rs:16`, registered at `lib.rs:428` — remove both
- `/api/tracks/{id}` route at `routes.rs:131` + `httpApi.getTrack()` at `http-api.ts:126` — verify no mobile PWA usage, then remove
- `package.json` needs `lint`, `format`, and `format:check` scripts added

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-foundation-cleanup*
*Context gathered: 2026-03-01*
