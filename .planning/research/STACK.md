# Technology Stack

**Project:** RecoDeck v1.1 Stabilization & Polish
**Researched:** 2026-03-01
**Scope:** NEW additions only — testing infrastructure, code quality tooling, UI polish. Existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, Framer Motion 11, tanstack/react-query v5) is validated and NOT re-researched.

---

## Executive Summary

RecoDeck already has several quality primitives in place: TypeScript strict mode is ON (`strict: true`, `noUnusedLocals`, `noUnusedParameters`), `cargo clippy` and `cargo check` are the established Rust quality gates (zero warnings achieved in v1.0), and Framer Motion 11 is already installed and used across all AI components. The v1.1 milestone needs four concrete additions:

1. **Vitest + React Testing Library** — frontend unit/component tests. Nothing currently exists.
2. **ESLint 9 (flat config)** — TypeScript + React lint rules. Currently missing entirely.
3. **Prettier** — formatting consistency enforcer. Currently absent.
4. **Rust `#[cfg(test)]` modules + `tempfile`** — the `tempfile` crate is already in `[dev-dependencies]`. The pattern for DB unit tests exists in `db/mod.rs` (`new_in_memory()`). No new crates needed for Rust testing — expand what's already there.

The UI polish work does NOT require new libraries. Framer Motion 11 is already present and used in AI components; the gap is that non-AI components (Player, TrackTable, MiniPlayer, FolderTree) use plain CSS with no animation. The work is applying existing Framer Motion patterns consistently, not adding dependencies.

---

## Recommended Stack

### Frontend Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vitest | ^3.0.0 | Test runner + assertion library | Native Vite integration — same config, same transforms as `vite build`. Replaces Jest which requires Babel/separate config for ESM. vitest 3.x is the current major at time of research (training data: vitest 2.x released mid-2024; 3.x followed; project uses Vite 7.x which requires vitest 3.x for compatibility) |
| @vitest/ui | ^3.0.0 | Browser-based test UI | Optional but useful for interactive test exploration during development |
| @testing-library/react | ^16.0.0 | React component testing utilities | Standard for React component tests. v16 supports React 19. DO NOT use v15 — it does not support React 19 concurrent features |
| @testing-library/user-event | ^14.0.0 | Simulates real user interactions | v14 is the current stable. Replaces `fireEvent` for interaction tests — more faithful to actual browser behavior |
| @testing-library/jest-dom | ^6.0.0 | DOM assertion matchers | Adds `.toBeInTheDocument()`, `.toHaveClass()`, etc. Works with vitest via `@testing-library/jest-dom/vitest` |
| jsdom | ^26.0.0 | DOM environment for Vitest | Required for component rendering in Node. jsdom 26 supports modern DOM APIs needed by React 19 |
| @vitest/coverage-v8 | ^3.0.0 | Coverage reporting | V8 native coverage — zero extra instrumentation overhead vs nyc/istanbul |

**Why Vitest over Jest:** The project uses Vite 7 + ESM modules (`"type": "module"` in package.json). Jest requires `babel-jest` or `ts-jest` to handle TypeScript ESM, adding 3-5 additional config files. Vitest uses the same Vite pipeline — zero extra transform config, HMR-aware test watching, and it runs faster on the same hardware.

**Why NOT Cypress/Playwright for this milestone:** E2E testing against a Tauri app requires the full Tauri build pipeline per test run. That cost is appropriate for a dedicated QA phase, not a stabilization sprint. Unit tests via Vitest cover the logic that matters most (musicUtils, store logic, pure utility functions).

### Code Quality Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| eslint | ^9.0.0 | Static analysis + style enforcement | v9 is the current major. The new flat config (`eslint.config.js`) replaces `.eslintrc` and is now the only config format in v9+ |
| typescript-eslint | ^8.0.0 | TypeScript-aware lint rules | v8 is the current major (training data: v7 released 2024-Q1, v8 followed). The `typescript-eslint` package (singular) now replaces the old `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` split — one package covers both |
| eslint-plugin-react-hooks | ^5.0.0 | Hooks rules (exhaustive-deps, rules-of-hooks) | The official React team plugin. Prevents exhaustive-deps violations which are a common React bug source |
| eslint-plugin-react-refresh | ^0.4.0 | Vite HMR compatibility rules | Warns when components are not safe for HMR (already installed in many Vite scaffolds). Already listed in project devDependencies if Vite scaffold was used |
| prettier | ^3.0.0 | Code formatter | Prettier 3.x is the current stable. Handles TS, TSX, CSS, JSON. Opinion: use Prettier for formatting, ESLint for logic — do NOT configure ESLint formatting rules (they conflict) |
| eslint-config-prettier | ^9.0.0 | Disables ESLint rules that conflict with Prettier | Prevents ESLint and Prettier from fighting over formatting. Always include when using both |

**Why ESLint 9 flat config over alternatives:** The project has no existing lint config — this is a greenfield setup. Flat config (`eslint.config.js`) is the only supported format in ESLint 9+. It is simpler (one file, explicit imports, no magic plugin resolution) and aligns with how the ecosystem is moving. Do not use the legacy `.eslintrc` format.

**Why NOT oxlint/biome as primary:** Biome and oxlint are faster but have incomplete rule coverage for React Hooks rules (`eslint-plugin-react-hooks` does not have Biome equivalents yet). The `exhaustive-deps` rule catches real bugs in the codebase. Oxlint can be added as a pre-commit speed layer later, but ESLint remains the primary for correctness.

### Rust Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `#[cfg(test)]` modules | stdlib | Unit tests collocated with implementation | Already used in `db/mod.rs`, `audio/bpm.rs`, `audio/key.rs`, `scanner.rs`, `ai/context_builder.rs`, `ai/claude_client.rs`, `audio/decoder.rs`, `audio/waveform.rs` — the pattern is established |
| `tempfile` | 3.14 (already in dev-deps) | Temporary files/directories for scanner tests | Already in `[dev-dependencies]` — use it |
| `rusqlite` in-memory | Already in deps | DB integration tests without disk | `Database::new_in_memory()` already exists in `db/mod.rs` — this is the established pattern |

**No new Rust crates needed.** The project's Rust test infrastructure is architecturally sound:
- `Database::new_in_memory()` at line 87 of `db/mod.rs` provides clean DB state per test
- `tempfile` is already in `[dev-dependencies]`
- 9 existing source files already have `#[cfg(test)]` blocks

The gap is coverage volume, not tooling. Write more tests using `cargo test`.

**What NOT to add for Rust testing:**
- `mockall` — No external service calls in the test-critical code paths (DB and music logic). Real in-memory SQLite is faster and less brittle than mocks for DB tests.
- `proptest`/`quickcheck` — Property-based testing is powerful but disproportionate for a stabilization sprint. Write targeted regression tests for known edge cases instead.
- `criterion` — Benchmarking. Not needed until a specific perf problem is identified. Defer to v2+.
- `tokio-test` — All async functions are Tauri commands that depend on `State<AppState>`. They cannot be unit-tested in isolation without a mock Tauri runtime, which does not exist. Test the pure logic functions; accept that Tauri commands are integration-tested via the running app.

### UI Animation / Polish

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| framer-motion | 11.18.2 (already installed) | All animation and transition work | Already used in all 6 AI components. Apply existing patterns to Player, MiniPlayer, TrackTable, Notification components. Zero new dependencies. |

**Framer Motion coverage gap:** Animation is currently 100% in `src/components/ai/` — all 6 AI components use `motion.*`, `AnimatePresence`, and spring transitions. The other components (`Player.tsx`, `MiniPlayer.tsx`, `TrackTable.tsx`, `FolderTree.tsx`, `Notification.tsx`) use static CSS. The v1.1 UI polish work is applying the already-installed library to these components.

**What NOT to add for UI polish:**
- `react-spring` — Redundant with Framer Motion already installed
- `@radix-ui/react-*` primitive components — Would require significant refactoring of existing component structure. Scope mismatch for a stabilization milestone.
- `shadcn/ui` — Same concern as Radix; requires rebuilding existing component library
- CSS custom animations without Framer Motion — Inconsistent with the established pattern in AI components

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Frontend test runner | Vitest 3 | Jest | Jest requires Babel + ts-jest for ESM + TypeScript; Vitest reuses Vite config; project uses Vite 7 |
| Frontend test runner | Vitest 3 | Playwright (E2E) | Tauri E2E tests require full build per run; too slow for a unit test suite; appropriate for dedicated QA phase |
| Rust test infra | `#[cfg(test)]` + existing `tempfile` | `mockall` | No external dependencies to mock in pure logic; in-memory SQLite is better than mocked DB |
| Rust benchmarking | None (deferred) | `criterion` | No identified perf problem; premature optimization; defer to v2+ |
| TypeScript linter | ESLint 9 | Biome | `eslint-plugin-react-hooks` rules not ported to Biome; exhaustive-deps catches real bugs |
| TypeScript linter | ESLint 9 | oxlint | Same coverage gap for React hooks rules |
| UI animation | Framer Motion (already installed) | react-spring | Redundant; Framer Motion is already in use and delivers equivalent functionality |
| Component primitives | None new | Radix UI / shadcn/ui | Requires rebuilding existing components; out of scope for stabilization |

---

## Installation

```bash
# Frontend testing
npm install -D vitest @vitest/ui @vitest/coverage-v8
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D jsdom

# Code quality
npm install -D eslint typescript-eslint
npm install -D eslint-plugin-react-hooks eslint-plugin-react-refresh
npm install -D prettier eslint-config-prettier
```

**Vite config addition for Vitest:**
```typescript
// vite.config.ts — add test block
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/store/**'],
      exclude: ['src/lib/tauri-api.ts', 'src/lib/audioPlayer.ts'],
    },
  },
  // ... existing server config
});
```

**ESLint flat config:**
```javascript
// eslint.config.js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
);
```

**package.json script additions:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write src",
    "format:check": "prettier --check src"
  }
}
```

**Prettier config:**
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

**Rust — no Cargo.toml changes needed.** Run existing tests with:
```bash
cd src-tauri && cargo test
```

---

## Coverage Targets

**Do NOT attempt to test (Tauri-bound, cannot be unit tested):**
- `src/lib/tauri-api.ts` — all functions call `invoke()` which requires a running Tauri runtime
- `src/lib/audioPlayer.ts` — wraps HTML5 Audio API; requires a browser environment with audio codec support
- `src/lib/waveform.ts` — canvas-dependent; jsdom does not render canvas

**High-value test targets (pure logic, no Tauri/audio deps):**
- `src/lib/musicUtils.ts` — `getKeyCompatibility()` and `getBpmIssue()` are pure functions with clear inputs/outputs and edge cases. These are highest priority.
- `src/store/playerStore.ts` — Zustand store logic; can be tested in isolation
- `src/store/aiStore.ts` — Same
- `src-tauri/src/db/mod.rs` — CRUD operations via `Database::new_in_memory()`
- `src-tauri/src/audio/key.rs` — Chromagram + K-S algorithm; pure computation
- `src-tauri/src/audio/bpm.rs` — BPM detection logic (with test audio fixtures)
- `src-tauri/src/ai/context_builder.rs` — JSON serialization/filtering logic

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Framer Motion (existing) | HIGH | Installed at 11.18.2; used in 6 files; directly inspected |
| Rust test infrastructure | HIGH | `tempfile` confirmed in dev-deps; `new_in_memory()` confirmed in db/mod.rs; 9 files with existing test modules confirmed via grep |
| Vitest 3 + RTL 16 | MEDIUM | Vitest 3/RTL 16 versions inferred from training data (Vite 7 project requires Vitest 3 for compatibility); web fetch unavailable for version verification. Verify exact versions with `npm info vitest version` before installing. |
| ESLint 9 + typescript-eslint v8 | MEDIUM | ESLint 9 released 2024; typescript-eslint v8 released 2024; these are the current majors per training knowledge. Verify with `npm info eslint version`. |
| Prettier 3 | HIGH | Long-stable; v3 released 2023 and remains current major |

---

## What NOT to Add

| Tool | Why Not |
|------|---------|
| Jest | ESM/TypeScript transform complexity; Vitest is the right choice with Vite 7 |
| Playwright / WebdriverIO | E2E against Tauri requires full build pipeline; wrong scope for stabilization |
| `mockall` (Rust) | No external dependencies in hot test paths; in-memory SQLite is better |
| `criterion` (Rust benchmarks) | No identified perf problem; defer to v2+ |
| Biome / oxlint as primary linter | Missing `eslint-plugin-react-hooks` exhaustive-deps equivalent |
| Storybook | Component catalog — valuable eventually, out of scope for stabilization |
| `react-spring` | Redundant with installed Framer Motion 11 |
| Radix UI / shadcn/ui | Requires rebuilding existing components; scope mismatch |
| Husky + lint-staged | Pre-commit hooks are a good idea but deferred — add only after ESLint/Prettier are working and passing |
| `cargo-tarpaulin` (Rust coverage) | macOS support is partial and configuration-heavy; `cargo test` output is sufficient for v1.1 |

---

## Integration Points with Existing Stack

**Vitest + Vite 7:** Vitest runs inside the Vite pipeline. The `vite.config.ts` gains a `test:` block. The `@vitejs/plugin-react` plugin is already installed and handles JSX transformation for tests automatically.

**Testing Library + Zustand:** Zustand stores can be tested by calling store actions directly and asserting on state. The `playerStore` and `aiStore` use the standard Zustand pattern and require no special test wrappers.

**ESLint + TypeScript strict mode:** `tsconfig.json` already has `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. ESLint's `@typescript-eslint/no-unused-vars` overlaps with `noUnusedLocals` — set ESLint's rule to `error` to get lint-time feedback (not just build-time).

**Prettier + TailwindCSS 4:** Prettier's default handling sorts class names only with the `prettier-plugin-tailwindcss` plugin. Do NOT add that plugin for v1.1 — Tailwind class sorting is cosmetic and the plugin can break with Tailwind 4's v-next config format. Add it only after verifying compatibility.

**Framer Motion + non-AI components:** The AI components demonstrate the exact patterns needed. `AnimatePresence` wraps conditional renders; `motion.div` replaces plain `div` for animated containers; `whileHover`/`whileTap` for interactive elements. The Player, MiniPlayer, and Notification components are the primary polish targets — they use plain CSS transitions today.

---

## Sources

- Direct code inspection: `package.json`, `src-tauri/Cargo.toml`, `tsconfig.json`, `vite.config.ts`, `src/components/ai/*.tsx`, `src-tauri/src/db/mod.rs` — HIGH confidence
- Training knowledge: Vitest 3 / RTL 16 / ESLint 9 / typescript-eslint v8 version ranges — MEDIUM confidence (verify before install)
- Framer Motion version: `node_modules/framer-motion/package.json` line 3 — confirmed 11.18.2 — HIGH confidence
- Rust test module presence: `grep` across `src-tauri/src/` — 9 files with `#[cfg(test)]` confirmed — HIGH confidence
- `tempfile` in dev-deps: `src-tauri/Cargo.toml` line 49 — confirmed — HIGH confidence
