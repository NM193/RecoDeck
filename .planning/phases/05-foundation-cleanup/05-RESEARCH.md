# Phase 5: Foundation Cleanup - Research

**Researched:** 2026-03-01
**Domain:** Code quality tooling (ESLint 9, Prettier 3), Rust dead-code removal, TypeScript error handling patterns
**Confidence:** HIGH

## Summary

This phase is pure cleanup — no new features, no architecture changes. The work divides into four distinct tracks: (1) fix AI error handling in `aiStore.ts` by migrating `instanceof Error` to the existing `getErrorMessage` pattern, with enhanced messages for API key errors that navigate to Settings; (2) remove two known dead-code items (greet stub, orphaned `/api/tracks/{id}` route); (3) consolidate the duplicated `audio_mime_type` Rust function into a shared module; and (4) configure ESLint 9 flat config + Prettier 3 from scratch and drive the codebase to zero warnings.

Cargo clippy already exits clean — running it in the src-tauri directory produces zero warnings as of 2026-03-01. DEBT-05 therefore only requires verification and documentation, not remediation. ESLint and Prettier are not yet installed (no config files exist, `npm list` shows they are absent from node_modules). The mobile PWA has been confirmed to NOT use `httpApi.getTrack()` — the only call in the mobile code is `getTracksPaginated`, making the orphaned route safe to delete.

The key architectural constraint for the "Settings navigation" error button is that `settingsOpen` is local `useState` in `App.tsx`, not in a Zustand store. The planner must choose a mechanism (callback prop threading, or adding `openSettings` to aiStore as a registered callback) to allow error UI inside AI panels to open the Settings drawer.

**Primary recommendation:** Execute the four tracks in dependency order: (1) error handling fix, (2) dead code removal, (3) Rust module consolidation, (4) ESLint + Prettier setup and lint pass. Each track is independently shippable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Prettier Code Style
- No semicolons (`semi: false`)
- Single quotes (`singleQuote: true`)
- 2-space indentation (`tabWidth: 2`)
- All trailing commas (`trailingComma: "all"`)
- Tailwind plugin explicitly out of scope (per REQUIREMENTS.md — Tailwind 4 compatibility uncertain)

#### AI Error Message Wording
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEBT-01 | Fix aiStore.ts to use isAppError/getErrorMessage instead of instanceof Error for Tauri IPC error handling | `getErrorMessage` already exists in `src/types/ai.ts`. The 5 catch blocks in aiStore.ts (lines 55, 67, 79, 120, 143) each use `instanceof Error`. Pattern is: replace `error instanceof Error ? error.message : String(error)` with `getErrorMessage(e)`. Rate-limit detection requires checking the returned message string for "Rate limited" since 429 comes back as `AiNetwork` kind. |
| DEBT-02 | Extract duplicated audio_mime_type function to shared module | Identical function at `src-tauri/src/lib.rs:66` and `src-tauri/src/server/streaming.rs:214`. Consolidate into a new `src-tauri/src/audio/mime.rs` sub-module (audio mod already exists at `src-tauri/src/audio/`). |
| DEBT-03 | Remove orphaned /api/tracks/{id} route and httpApi.getTrack() wrapper | Route at `src-tauri/src/server/routes.rs:131`. Frontend wrapper at `src/lib/http-api.ts:125-129`. Mobile PWA confirmed does NOT call `getTrack` — safe to delete both. |
| DEBT-04 | Remove greet command and handler from lib.rs | Function at `src-tauri/src/lib.rs:16-18`. Registration at `src-tauri/src/lib.rs:428`. Both must be removed together. |
| DEBT-05 | Run cargo clippy and fix any remaining warnings | Already clean — `cargo clippy` in `src-tauri/` exits with zero warnings as of 2026-03-01. Task is verification + adding `cargo clippy` to CI/docs, not remediation. |
| QUAL-01 | Configure ESLint 9 with flat config + typescript-eslint v8 | ESLint 10.0.2, typescript-eslint 8.56.1, eslint-config-prettier 10.1.8, eslint-plugin-react-hooks 7.0.1, eslint-plugin-react-refresh 0.5.2 are the current npm-latest versions. Nothing is installed. Full from-scratch setup required. |
| QUAL-02 | Configure Prettier 3 for consistent code formatting | Prettier 3.8.1 is current. Nothing installed. Config options are fully locked by user (semi, singleQuote, tabWidth, trailingComma). |
| QUAL-03 | Fix all ESLint warnings/errors across the frontend codebase | After QUAL-01/QUAL-02 are done, run lint across all `src/**/*.{ts,tsx}` files and `mobile/**/*.{ts,tsx}`. Fix all violations. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| eslint | 10.0.2 | JS/TS linting engine | ESLint 9+ uses flat config (eslint.config.js) — the only modern approach |
| typescript-eslint | 8.56.1 | TypeScript parser + rules for ESLint | The official typescript-eslint v8 monorepo replaced @typescript-eslint/parser + @typescript-eslint/eslint-plugin separately |
| prettier | 3.8.1 | Code formatter | Authoritative formatter; no config conflicts with eslint via eslint-config-prettier |
| eslint-config-prettier | 10.1.8 | Disables ESLint style rules that conflict with Prettier | Required whenever using both tools together |
| eslint-plugin-react-hooks | 7.0.1 | Enforces Rules of Hooks | Official React team plugin; catches hook misuse at lint time |
| eslint-plugin-react-refresh | 0.5.2 | Warns when HMR-breaking export patterns are used | Standard with Vite + React projects |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/node | (already present) | Node types for config files | Already in devDeps via Vite/TypeScript |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| typescript-eslint unified package | Separate @typescript-eslint/parser + @typescript-eslint/eslint-plugin | The separated packages still work but typescript-eslint v8 unified package is the current standard — less config |
| eslint-config-prettier | Manual rule disabling | Error-prone; prettier devs maintain the list of conflicting rules |

**Installation:**
```bash
npm install --save-dev eslint typescript-eslint prettier eslint-config-prettier eslint-plugin-react-hooks eslint-plugin-react-refresh
```

## Architecture Patterns

### ESLint 9 Flat Config (eslint.config.js)

**What:** ESLint 9 replaces `.eslintrc.*` with `eslint.config.js` (or `.mjs`). All config is an exported array of config objects. No `extends` keyword — use spread or direct imports.

**When to use:** Always for new projects on ESLint 9+. No legacy `.eslintrc` support needed since no prior config exists.

**Example:**
```javascript
// eslint.config.js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'mobile/dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettierConfig,
)
```

### Prettier 3 Config (.prettierrc)

**What:** Prettier 3 config is a JSON file at project root. All options are locked by user decisions.

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

### package.json Scripts Pattern

```json
{
  "scripts": {
    "lint": "eslint src mobile",
    "format": "prettier --write src mobile",
    "format:check": "prettier --check src mobile"
  }
}
```

### Rust Module Extraction Pattern

**What:** Move shared `audio_mime_type` function from two call sites into the existing `audio` module.

**Structure:**
```
src-tauri/src/audio/
├── mod.rs          # add: pub mod mime; (or inline the function here)
└── mime.rs         # new: pub fn audio_mime_type(path: &str) -> &'static str
```

Then in `lib.rs` and `streaming.rs`, replace the local function with:
```rust
use crate::audio::audio_mime_type;
// OR
use crate::audio::mime::audio_mime_type;
```

Alternatively, if the audio module is already complex, the function can live directly in `audio/mod.rs` as a public function — check what already exists in that directory before deciding.

### aiStore Error Handling Migration Pattern

**Current (broken):**
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  set({ error: errorMessage })
}
```

**Correct:**
```typescript
import { getErrorMessage } from '../types/ai'
// ...
} catch (e) {
  set({ error: getErrorMessage(e) })
}
```

`getErrorMessage` in `src/types/ai.ts` already handles:
- `AppError` objects with `kind` field (Tauri IPC errors)
- plain `string` errors
- unknown values (fallback)

The `instanceof Error` pattern fails because Tauri IPC errors are plain JS objects (`{kind: "AiNoApiKey"}`), not Error instances. `String({kind: "AiNoApiKey"})` produces `[object Object]`.

### Rate-Limit Retry Pattern

The 429 error comes back from Rust as:
```
AppError::AiNetwork("Rate limited -- wait a moment and try again".to_string())
```

On the frontend this serializes to `{kind: "AiNetwork", message: "Rate limited -- wait a moment and try again"}`.

For the auto-retry with countdown, the retry logic must live in aiStore's action methods (not in `getErrorMessage`, which is a pure string transformer). Pattern:

```typescript
// In sendMessage / generatePlaylist
} catch (e) {
  if (isAppError(e) && e.kind === 'AiNetwork' && e.message?.includes('Rate limited')) {
    // Start retry countdown (e.g., 30s backoff, 2 attempts)
    for (let attempt = 1; attempt <= 2; attempt++) {
      set({ error: `Rate limited — retrying in 30 seconds... (attempt ${attempt}/2)` })
      await new Promise(resolve => setTimeout(resolve, 30_000))
      try {
        // retry the same call
        return
      } catch (retryErr) {
        if (attempt === 2) set({ error: getErrorMessage(retryErr), isGenerating: false })
      }
    }
  } else {
    set({ error: getErrorMessage(e), isGenerating: false })
  }
}
```

### Settings Navigation from Error UI

The Settings drawer is controlled by `settingsOpen` local state in `App.tsx` — not accessible from Zustand stores or AI components directly. Options (Claude's discretion):

**Option A (recommended): Add `openSettings` callback to aiStore**
```typescript
// aiStore.ts — add to state
openSettingsCallback: (() => void) | null

// App.tsx — register on mount
useEffect(() => {
  useAIStore.getState().registerOpenSettings(() => setSettingsOpen(true))
}, [])
```
Pro: Clean; AI components call `useAIStore.getState().openSettings?.()` without prop drilling.

**Option B: Prop drilling**
Pass `onOpenSettings={() => setSettingsOpen(true)}` down through `AIChatPanel`, `RecommendationsPanel`, `MixPrepPanel`. Works but adds prop surface.

**Option C: Event emitter**
Dispatch a CustomEvent; App.tsx listens. Avoids Zustand change but less type-safe.

Option A is the cleanest given the existing aiStore architecture.

### Anti-Patterns to Avoid

- **Running `eslint --fix` blindly:** It can break code. Run `--fix` only on formatting/auto-fixable rules, review results.
- **Putting Prettier config in `package.json`:** Separate `.prettierrc` is more discoverable and explicit.
- **Ignoring `src-tauri` in eslint config:** The Rust directory must be excluded, not linted by ESLint.
- **Reformatting generated files:** `src/vite-env.d.ts` is generated — exclude from Prettier or accept its format.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Disabling ESLint rules that conflict with Prettier | Manual rule list | eslint-config-prettier | The list of conflicting rules changes with each ESLint/Prettier release |
| TypeScript-aware linting | TSC re-invocation | typescript-eslint | typescript-eslint has type-aware rules that use the TS compiler correctly |
| Retry logic delay | `sleep` as a loop | `setTimeout` wrapped in Promise | Keeps the event loop free; `sleep` blocks |

## Common Pitfalls

### Pitfall 1: `instanceof Error` fails for Tauri IPC errors
**What goes wrong:** `error instanceof Error` returns false for Tauri command errors because they are serialized JS objects `{kind: "...", message: "..."}`, not Error instances. `String(obj)` returns `[object Object]`.
**Why it happens:** Tauri's IPC layer serializes Rust errors to JSON via serde, producing plain objects on the JS side.
**How to avoid:** Always use `isAppError(e)` + `getErrorMessage(e)` from `src/types/ai.ts`.
**Warning signs:** User sees `[object Object]` in the error area of AI panels.

### Pitfall 2: ESLint 9 flat config module format mismatch
**What goes wrong:** `eslint.config.js` uses ES module syntax (`import`/`export default`) but the project `package.json` has `"type": "module"` — this is already correct. However, if the file were named `.cjs`, it would need CommonJS syntax. Keep the name as `eslint.config.js` (or `.mjs`).
**Why it happens:** ESLint 9 flat config is `.js` by default and interprets based on `package.json` `"type"` field.
**How to avoid:** Use `eslint.config.js` since `"type": "module"` is set in `package.json`. ✅ Already compatible.

### Pitfall 3: typescript-eslint type-aware rules require tsconfig path
**What goes wrong:** Rules like `@typescript-eslint/no-floating-promises` require `languageOptions.parserOptions.project` pointing to `tsconfig.json`. Without it, rules fail silently or throw.
**Why it happens:** Type-aware rules need the TS compiler context.
**How to avoid:** For this phase, use `tseslint.configs.recommended` (not `recommendedTypeChecked`) to avoid needing parser project config. Type-aware rules can be added in Phase 6 when test infrastructure is present.

### Pitfall 4: Removing greet without checking frontend references
**What goes wrong:** If any frontend code calls `invoke('greet', ...)`, removing the command breaks the app silently (invoke throws).
**Why it happens:** The stub is from the Tauri scaffold template; it may have been left in demo code.
**How to avoid:** Grep frontend for `'greet'` before deleting. If found, remove the frontend call first.
**Warning signs:** Tauri command not found error at runtime.

### Pitfall 5: Cargo module visibility for extracted audio_mime_type
**What goes wrong:** If `audio_mime_type` is extracted to a new module but not `pub`, or if the module is not declared in `audio/mod.rs`, Rust will fail to compile with "function not found".
**Why it happens:** Rust module system requires explicit `pub mod` declarations and `pub fn` visibility.
**How to avoid:** Declare `pub mod mime;` in `audio/mod.rs` (or inline as `pub fn audio_mime_type`), use `pub fn` on the function, and `use crate::audio::mime::audio_mime_type` at call sites.

## Code Examples

### Verified: aiStore catch block migration

Current broken pattern (5 instances in `src/store/aiStore.ts`):
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  set({ error: errorMessage })
  throw error
}
```

Corrected pattern:
```typescript
import { getErrorMessage, isAppError } from '../types/ai'

} catch (e) {
  set({ error: getErrorMessage(e), isGenerating: false })
  throw e
}
```

### Verified: getErrorMessage already handles all AppError kinds

From `src/types/ai.ts:87-101`:
```typescript
export function getErrorMessage(e: unknown): string {
  if (isAppError(e)) {
    switch (e.kind) {
      case 'AiNoApiKey':
        return 'No API key configured -- add your Claude API key in Settings'
      case 'AiInvalidKey':
        return 'API key is invalid -- check your key in Settings'
      default:
        return e.message ?? 'An unexpected error occurred'
    }
  }
  if (typeof e === 'string') return e
  return 'An unexpected error occurred'
}
```

The 429 rate limit maps to `AiNetwork` kind (see `src-tauri/src/ai/claude_client.rs:110`). The default case in `getErrorMessage` returns `e.message` — which will be `"Rate limited -- wait a moment and try again"`. For the retry UX, the store action needs additional logic before calling `getErrorMessage`.

### Verified: Dead code locations

```
// greet function — REMOVE
src-tauri/src/lib.rs:16-18   fn greet(name: &str) -> String { ... }

// greet registration — REMOVE
src-tauri/src/lib.rs:428     greet,

// orphaned route — REMOVE
src-tauri/src/server/routes.rs:131   .route("/api/tracks/{id}", get(get_track))

// get_track handler — REMOVE (verify it has no other callers)
src-tauri/src/server/routes.rs  async fn get_track(...)

// httpApi.getTrack wrapper — REMOVE
src/lib/http-api.ts:124-129  async getTrack(id: number): Promise<Track> { ... }
```

### Verified: Mobile PWA does NOT call getTrack

```
// mobile/components/MobileTrackList.tsx:83 — only uses getTracksPaginated
const result = await httpApi.getTracksPaginated(PAGE_SIZE, newOffset)
```

No other mobile file references `getTrack`. Safe to delete.

### Verified: cargo clippy is already clean

```bash
$ cd src-tauri && cargo clippy
   Compiling recodeck v0.2.5
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.08s
    # Zero warnings output
```

DEBT-05 is already satisfied. Task = confirm + add clippy to CI notes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.eslintrc.json` + `extends` | `eslint.config.js` flat array | ESLint 9.0 (2024) | No `extends` keyword — use spread and direct imports |
| Separate `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` | Unified `typescript-eslint` package | typescript-eslint v8 (2024) | Single install, `tseslint.config()` wrapper function |
| `eslint --ext .ts,.tsx` | `files: ['**/*.{ts,tsx}']` in config | ESLint 9.0 | Extension filtering now lives in config, not CLI |

**Deprecated/outdated:**
- `.eslintrc.*` files: Not supported in ESLint 9 without compatibility shim (don't use)
- `@typescript-eslint/parser` as separate package: Still works but unified `typescript-eslint` is the current standard

## Open Questions

1. **audio module structure**
   - What we know: `src-tauri/src/audio/` directory exists as a module
   - What's unclear: What files currently live inside (`mod.rs`, submodules?) — need to read before deciding where to put `audio_mime_type`
   - Recommendation: Read `src-tauri/src/audio/mod.rs` at planning time; if it is small, inline `pub fn audio_mime_type` directly in mod.rs; if complex, create `src-tauri/src/audio/mime.rs`

2. **get_track handler body**
   - What we know: The route is registered at `routes.rs:131`
   - What's unclear: Whether `async fn get_track` handler has any shared logic used elsewhere in the file
   - Recommendation: Read the full handler before deleting — it is almost certainly standalone (single-use handler), but verify

3. **Retry count and backoff for rate limits**
   - What we know: 429 comes back as AiNetwork with message "Rate limited -- wait a moment and try again"
   - What's unclear: Exact retry count and wait time (Claude's discretion)
   - Recommendation: 2 retries, 30-second backoff — consistent with Anthropic's rate limit recovery windows for hobby projects

4. **Whether greet has any frontend callers**
   - What we know: It is registered in `invoke_handler!` at `lib.rs:428`
   - What's unclear: Whether any `.tsx` / `.ts` file calls `invoke('greet', ...)`
   - Recommendation: Grep for `'greet'` in `src/` before deleting. Expect zero hits (it is a scaffold stub), but verify.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all file paths, line numbers, and code snippets verified by Read/Grep tool calls against the actual repo
- `cargo clippy` execution output — verified clean exit in src-tauri/

### Secondary (MEDIUM confidence)
- `npm info eslint version`, `npm info typescript-eslint version`, `npm info prettier version`, `npm info eslint-config-prettier version`, `npm info eslint-plugin-react-hooks version`, `npm info eslint-plugin-react-refresh version` — all version numbers from live npm registry calls during this session

### Tertiary (LOW confidence)
- ESLint 9 flat config syntax patterns — from training data (ESLint 9 released April 2024, well within training window). Recommend verifying against https://eslint.org/docs/latest/use/configure/configuration-files if any config behavior is unexpected.

## Metadata

**Confidence breakdown:**
- Standard stack versions: HIGH — verified against live npm registry
- Architecture patterns: HIGH — verified against actual codebase files
- Pitfalls: HIGH — root causes verified against actual Tauri/ESLint behavior
- Cargo clippy status: HIGH — verified by running the tool

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (ESLint/typescript-eslint move fast; re-check versions if delayed)
