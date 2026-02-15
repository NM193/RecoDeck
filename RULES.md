# ⚠️ DEVELOPMENT RULES — READ FIRST

> **This section is mandatory for any AI coding assistant (Cursor, Claude Code, or any other tool) working on this project. These rules cannot be overridden, skipped, or worked around.**

---

## Rule 1: Scope Lock

- **DO NOT** add features, libraries, or architectural changes not described in this plan.
- **DO NOT** refactor working code unless explicitly requested by the developer.
- **DO NOT** change the tech stack (Tauri v2, React, TypeScript, Rust, SQLite, ONNX Runtime) without explicit approval.
- **DO NOT** introduce new dependencies without justification tied to a specific plan feature.
- **DO NOT** skip steps in the phase milestones — they are ordered intentionally.
- **DO NOT** "improve" or "optimize" code that is working and passing tests unless asked.
- **IF** something seems missing from the plan, **ASK** the developer before implementing.

---

## Rule 2: Interview Protocol

Before starting ANY new phase, milestone, or significant feature implementation:

> **Read this plan file and interview the developer in detail using AskUser/AskUserQuestionTool about literally anything: technical implementation, UI & UX, concerns, tradeoffs, etc.**

This means:
- Before Phase 1 starts → interview about scaffold choices, folder structure, initial UI decisions
- Before each milestone within a phase → interview about specific implementation details
- When encountering ambiguity → ask, don't assume
- When multiple valid approaches exist → present options and ask
- When a decision has downstream consequences → flag it and discuss

---

## Rule 3: Testing Gates

**No milestone is complete until it passes its validation gate.** You cannot proceed to the next milestone until the current one is verified.

Gate process:
1. Implement the milestone
2. Run all relevant tests (unit, integration, manual)
3. **Demo to developer** — show what was built, explain what it does
4. Developer confirms: "approved" or "needs changes"
5. Only after "approved" → move to next milestone

**If a test fails or the developer says "this isn't what I'm looking for":**
- Stop immediately
- Do not attempt to fix and move forward simultaneously
- Fix the issue, re-test, re-demo
- Get explicit approval before proceeding

---

## Rule 4: Code Quality Standards

- Every Rust module must have basic unit tests before moving on
- Every React component must render without errors before moving on
- Every Tauri IPC command must be testable in isolation
- No `unwrap()` in production Rust code — use proper error handling
- No `any` type in TypeScript — use proper interfaces
- All database queries must use parameterized statements (no SQL injection)
- Comments are required for non-obvious logic, especially in audio/AI code

---

## Rule 5: File & Naming Conventions

- Rust: snake_case for files, functions, variables; PascalCase for types/structs
- TypeScript/React: PascalCase for components; camelCase for functions/variables
- CSS: kebab-case for custom properties, BEM-ish for custom classes
- Database: snake_case for tables and columns
- Follow the file structure defined in Section 13 exactly

---

## Rule 6: Communication

- When writing code, always explain **what** you're doing and **why**
- When making a choice between alternatives, explain the tradeoff
- When something is complex, add inline comments
- Never silently change behavior — always call out behavioral changes explicitly

---

## Rule 7: Progress Tracking

After completing ANY implementation (feature, milestone, file creation, or significant change):

> **Update PROGRESS.md immediately with what was completed, when, and any relevant notes.**

This means:
- When a file is created → log it in PROGRESS.md
- When a milestone is completed → update the milestone section
- When a feature is implemented → document it with date and details
- When a phase is finished → mark it complete with summary

Format:
- Use clear sections by Phase and Milestone
- Include dates (YYYY-MM-DD format)
- Note any deviations from the plan
- Link to relevant files or commits
- Keep it concise but informative

**PROGRESS.md serves as the single source of truth for project status.**

---

*Reference: RecoDeck-Project-Plan.md for full project specification*
