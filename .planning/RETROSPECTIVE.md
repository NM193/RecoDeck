# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-01
**Phases:** 4 | **Plans:** 9 | **Timeline:** 13 days

### What Was Built
- Unified error handling (AppError enum, thiserror v2) and zero-warning codebase
- Mobile companion PWA with QR connect, library browsing, search, and authenticated audio streaming
- AI smart playlist generation from seed tracks with energy direction and BPM/key-aware ordering
- AI track recommendations (similar track + playlist-based discovery) with slide-in panel
- Mix prep tools: energy arc visualization, transition issue detection, AI-optimized playlist reorder

### What Worked
- Phase dependency ordering (quality first, then independent mobile, then AI chain) kept each phase clean
- Existing code audit approach for Phase 2 (mobile) — most code existed, plans focused on gaps rather than rebuilding
- Shared utilities pattern (`musicUtils.ts`) established early in Phase 4 and reused across components
- Summary frontmatter and dependency graphs provided clear cross-phase tracing

### What Was Inefficient
- Milestone audit ran before Phases 3-4 were executed, producing a stale `gaps_found` result
- Summary frontmatter `requirements_completed` was empty on several plans despite requirements being satisfied
- Frontend error type guards (`isAppError`/`getErrorMessage`) were built but never consumed by any component

### Patterns Established
- `AppError` enum with thiserror + tagged serde for Tauri IPC error handling
- `pub(crate)` visibility for cross-module method sharing in Rust
- OR-logic filtering for seed context (BPM or key match) to handle small libraries
- `execute_batch` with string-built SQL for atomic multi-row updates
- `src/components/ai/` directory for all AI UI components
- `src/lib/musicUtils.ts` as shared BPM/key compatibility utility

### Key Lessons
1. Run milestone audit only after all phases are complete — stale audits create noise
2. Stream ticket design must account for HTTP Range audio behavior (multi-request per seek)
3. BPM works as a reasonable energy proxy when loudness data isn't available, but real loudness analysis would improve mix prep
4. Small library sizes require relaxed filtering (OR instead of AND) for AI features to produce useful results

### Cost Observations
- Model mix: primarily sonnet for executor agents, balanced profile
- Average plan execution: ~7 min
- Notable: Phase 2 was fastest per-plan because most code existed — audit+gap-fill is efficient

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 13 days | 4 | Initial GSD workflow adoption, quality-first phase ordering |

### Top Lessons (Verified Across Milestones)

1. Quality/cleanup phases first — unblocks all downstream work
2. Audit existing code before rebuilding — gap-fill is faster than rewrite
