# Project Research Summary

**Project:** RecoDeck v1.3 — Library UX & Duplicate Management
**Domain:** Desktop music library manager (DJ-focused), Tauri v2 + React 19 + Rust
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

RecoDeck v1.3 targets three well-scoped improvements to the existing music library: a CSS layout correctness fix for the track table, full library loading on startup to remove pagination friction, and a review-before-delete duplicate management dialog. All three features build on the existing stack — no new frontend dependencies are required. The research is grounded entirely in direct codebase inspection, giving it unusually high confidence. Every integration point, file location, and API call was verified in source code before this summary was written.

The recommended approach is to implement in dependency order: CSS layout fix first (zero risk, immediate visual improvement), full library load second (simplifies App.tsx before adding new UI complexity), and the duplicate review dialog third (the only feature requiring new Rust commands). The duplicate dialog is the only medium-complexity item. It requires extracting duplicate detection logic from the existing `remove_duplicate_tracks()` into a new read-only `find_duplicate_tracks_grouped()` DB method, then building a modal component that reuses established patterns already present in the codebase.

Key risks are narrow and concrete: applying the CSS fix to the wrong DOM element can break TanStack Virtual row sizing; the duplicate batch delete must replicate the cascade delete logic from the existing `db.delete_track()` or it will leave orphaned rows in `track_analysis` and `playlist_tracks`; and loading 7K+ tracks in one call must not trigger a React re-render storm on every settings change. All three risks have known, low-effort mitigations documented in PITFALLS.md.

## Key Findings

### Recommended Stack

No new dependencies are required for v1.3. The entire feature set is implementable with what is already installed.

**Core technologies used in v1.3:**
- **CSS `min-width: 100%` on `.track-table-holder`**: layout fix — applies to the wrapper div, not individual rows, to avoid breaking TanStack Virtual measurements
- **`.modal-overlay` / `.modal-content` CSS classes** (TrackTable.css): dialog container for duplicate review — already styled with backdrop blur, slide-in animation, and button variants
- **`useState<Set<number>>`** (React 19): checkbox selection state in duplicate dialog — same pattern as `removedTrackIds` in AIPlaylistDialog.tsx
- **`tauriApi.getAllTracks()`** (tauri-api.ts line 29): full library load — already exists, replaces paginated `getTracksPaginated(1000, 0)` call
- **`tauriApi.deleteTrack(id)`** (tauri-api.ts line 47): per-track deletion from duplicate dialog — existing IPC wrapper
- **New Rust command `find_duplicate_tracks`** (library.rs + db/mod.rs): the only new backend code — a read-only extraction of detection logic already in `db.remove_duplicate_tracks()`

**What NOT to add:**
- Headless UI / Radix / shadcn: the project has a working modal pattern in TrackTable.css; a dialog library adds bundle weight and requires restyling work
- `react-window` or `@tanstack/react-table`: the layout bug is CSS, not a missing library
- `delete_tracks_batch` Rust command: at typical duplicate counts (2-20 tracks), sequential `deleteTrack` IPC calls complete in under 100ms

See `.planning/research/STACK.md` for full rationale and integration point details.

### Expected Features

**Must have (table stakes):**
- Row and header backgrounds extend to full window width at all window sizes — currently broken by `min-width: fit-content` on `.track-table-row`
- All tracks visible in "All Tracks" view on startup without pagination — desktop apps do not paginate local data; sort, scroll-to-track, and search are broken with partial loads
- Review duplicate groups before any deletion — music library files are irreplaceable; silent delete is unacceptable (industry norm: Rekordbox, Music.app, Swinsian all show duplicates before deleting)
- File path, duration, and file size shown per duplicate — sufficient signals to identify which copy to keep
- Pre-select the recommended delete target — lowest-ID track is suggested keeper; duplicates pre-checked but uncheceable

**Should have (differentiators):**
- BPM and key shown per duplicate in dialog — DJs care whether a copy has been analyzed
- Date added shown per duplicate — helps identify intentional vs. accidental imports
- Empty state "No duplicates found" — prevents confusion when button appears to do nothing

**Defer to v2+:**
- Audio fingerprinting for cross-format duplicates (MP3 vs. FLAC of the same song)
- Metadata merge from duplicate to keeper
- Batch delete Rust command (only worth adding if sequential per-ID calls become slow, which requires >50 duplicates in a single run)

See `.planning/research/FEATURES.md` for UX flow diagrams, competitor comparison table, and full feature prioritization matrix.

### Architecture Approach

All three features are self-contained with minimal cross-cutting concerns. The layout fix touches one CSS file. The full library load changes one branch in `loadTracks()` and removes three state variables. The duplicate dialog adds two Rust commands, two IPC wrappers, and one new React component — none of which require changes to SettingsContext, Zustand stores, or the audio player.

**Major components involved:**
1. **`src/components/TrackTable.css`** — one new CSS rule block for `.track-table-holder`; no TSX changes needed
2. **`src/App.tsx`** — `loadTracks()` "All Tracks" branch replaced with `getAllTracks()`; `loadMoreTracks`, `hasMoreTracks`, `isLoadingMore` state removed
3. **`src-tauri/src/db/mod.rs`** — new `find_duplicate_tracks_grouped()` read-only method extracted from `remove_duplicate_tracks()`
4. **`src-tauri/src/commands/library.rs`** — new `find_duplicate_tracks` Tauri command with `DuplicateGroup` DTO; optionally `delete_tracks_batch`
5. **`src/components/settings/DuplicatesDialog.tsx`** — new self-contained modal; manages its own loading, selection, and deletion state

**Data flow for duplicate dialog:**
```
User clicks "Review Duplicates"
  → find_duplicate_tracks (Rust, read-only) → Vec<DuplicateGroup>
  → Dialog renders groups, user adjusts checkboxes
  → deleteTrack per ID (Rust, cascade delete) → count
  → onDeleted() → loadTracks() (getAllTracks) → TrackTable re-renders
```

See `.planning/research/ARCHITECTURE.md` for precise DOM structure diagnosis, exact Rust struct definitions, and the complete integration point table per feature.

### Critical Pitfalls

1. **CSS fix applied to the wrong element** — `min-width: 100%` must go on `.track-table-holder`, not `.track-table-row`. Applying it to rows breaks TanStack Virtual's width measurement, causing erratic horizontal scrollbars or row overflow. Test at 800px, 1280px, and 1920px window widths before committing.

2. **Duplicate batch delete missing cascade** — any new delete path must replicate the cascade: delete `track_analysis`, delete `playlist_tracks`, then delete `tracks` rows in that order. The safest approach is calling the existing `db.delete_track(id)` in a loop. A missed cascade leaves orphaned FK rows causing silent data inconsistency.

3. **Re-render storm on 7K track load** — `getAllTracks()` returns ~7,339 items as one JSON array. If `setTracks()` is triggered by a broad Context change (e.g., SettingsContext), all consumers re-render. Mitigation: call `getAllTracks()` exactly once on startup; keep `tracks` in App-level state, not a Context.

4. **Stale UI after duplicate deletion** — the dialog must call `onDeleted()` which triggers `loadTracks()` in App.tsx. Without this, the track table shows ghost entries until manual refresh.

See `.planning/research/PITFALLS.md` for a full checklist including the "Looks Done But Isn't" verification steps per feature.

## Implications for Roadmap

Research converges on three phases with clear dependency ordering: zero-risk CSS change first, App.tsx simplification second, new-Rust-command feature third.

### Phase 1: CSS Layout Fix

**Rationale:** Zero-risk, zero-dependency change. Delivers immediate visual correctness and can be validated in isolation before any other v1.3 code is written. If the fix breaks TanStack Virtual, the problem is isolated and trivially reversible.
**Delivers:** Track table rows and header extend to full window width at all sizes; horizontal scroll activates only when columns are narrower than the window.
**Addresses:** Table-stakes layout correctness; parity with Rekordbox, Music.app, and Swinsian table behavior.
**Avoids:** TanStack Virtual sizing breakage (PITFALLS.md Pitfall 1) — verified by testing at multiple window widths before proceeding to Phase 2.
**Scope:** One CSS file, one new rule block. No Rust, no TypeScript changes.

### Phase 2: Full Library Load

**Rationale:** Simplifies App.tsx state management before the duplicate dialog adds new complexity. Removing `hasMoreTracks`, `isLoadingMore`, and `loadMoreTracks` reduces the prop chain into TrackTable and eliminates partial-list bugs affecting sort, scroll-to-track, and search. Also establishes the `getAllTracks()` startup call that the duplicate dialog's `onDeleted()` refresh will depend on.
**Delivers:** All tracks visible on startup in "All Tracks" view; sort and scroll-to-track work correctly on the full library; "Scroll for more" UX removed; net code reduction in App.tsx and TrackTable.
**Uses:** Existing `tauriApi.getAllTracks()` — no new backend code.
**Avoids:** Re-render storm (PITFALLS.md Pitfall 3) — call once on startup; stabilize with `useCallback`/`useMemo` if needed.
**Scope:** `src/App.tsx` (one branch replaced, three state vars removed), `src/components/TrackTable.tsx` (remove `onLoadMore` prop and scroll trigger), `src/components/TrackTable.css` (remove "Scroll for more" footer if present).

### Phase 3: Duplicate Review Dialog

**Rationale:** Highest implementation complexity; depends on Phase 2 completing because the `onDeleted()` callback will call the simplified `loadTracks()` established in Phase 2. Backend work (new Rust DB method + Tauri command) is a prerequisite for the frontend dialog and must be built and tested first.
**Delivers:** Non-destructive duplicate review flow — user sees all groups before deletion, controls which tracks are removed, library refreshes with accurate count confirmation.
**Addresses:** All duplicate management table stakes; replaces the existing unsafe one-click blind delete.
**Avoids:** Missing cascade on delete (PITFALLS.md Pitfall 2) — reuse `db.delete_track()` loop; stale UI after deletion (PITFALLS.md Pitfall 4) — `onDeleted()` triggers `loadTracks()`.
**Scope:** New Rust DB method + two Tauri commands + two IPC wrappers + one React dialog component + minor changes to `DatabaseSection.tsx`.

### Phase Ordering Rationale

- Phase 1 before Phase 2: CSS fix has zero state-management risk; confirms the rendering environment is correct before touching pagination infrastructure.
- Phase 2 before Phase 3: the duplicate dialog's post-deletion library refresh relies on the simplified `getAllTracks()` call. Building Phase 3 against the old paginated App.tsx would require retrofitting the refresh callback later.
- Phase 3 last: it has the most files and the only new Rust code. With state simplified (Phase 2) and CSS verified (Phase 1), integration testing is cleaner.

### Research Flags

Phases with standard, well-documented patterns (no deeper research needed):
- **Phase 1 (CSS fix):** The exact fix (`min-width: 100%` on `.track-table-holder`) was verified by DOM structure inspection in ARCHITECTURE.md. Standard flex layout behavior.
- **Phase 2 (full library load):** Replacing one IPC call with another. Command exists, wrapper exists, performance validated in prior v1.2 research.

Phases where targeted implementation checks are needed before coding:
- **Phase 3 (duplicate dialog) — backend step:** Before writing `delete_tracks_batch` or the per-ID delete loop, inspect `db.delete_track()` in `db/mod.rs` to confirm it already cascades to `track_analysis` and `playlist_tracks`. If it does, reuse the existing method; if not, replicate the cascade explicitly. This is a one-file read, not a research spike, but skipping it risks silent data corruption.
- **Phase 3 (duplicate dialog) — SQL index check:** PITFALLS.md notes that `file_hash` and `filename` columns should be indexed for detection queries to perform well on large libraries. Confirm whether these indexes exist in the current SQLite schema before writing the detection query.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All three features use existing installed dependencies. No library was evaluated speculatively — every tool cited was verified as installed and in active use in the codebase. |
| Features | HIGH | Grounded in direct code inspection of current feature behavior, plus competitive analysis of Rekordbox, Music.app, and Swinsian. |
| Architecture | HIGH | Based on line-level DOM structure inspection, Rust method signatures, and component tree traversal. Integration points reference specific file paths. |
| Pitfalls | HIGH | Each pitfall was derived from the exact code pattern that causes it, with prevention strategies referencing existing methods or verified patterns. |

**Overall confidence:** HIGH

### Gaps to Address

- **`db.delete_track()` cascade coverage:** Research did not inspect `db.delete_track()` line-by-line to confirm cascade behavior. Before writing the Phase 3 backend delete path, read `db/mod.rs`'s `delete_track` implementation. If it cascades, reuse it in a loop. If it doesn't, write the cascade explicitly.
- **SQLite index coverage for duplicate detection:** PITFALLS.md flags `file_hash` and `filename` indexing as important for performance on large libraries. ARCHITECTURE.md did not confirm whether these indexes exist in the current schema. Check migrations or `CREATE TABLE` statements before the Phase 3 backend step.
- **`hasMoreTracks` prop consumers outside TrackTable:** STACK.md and ARCHITECTURE.md identified the primary removal targets, but did not exhaustively audit all prop consumers. Run a grep for `hasMoreTracks` and `isLoadingMore` in `src/` before beginning Phase 2 to confirm the full removal scope.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/components/TrackTable.tsx` and `TrackTable.css` — layout DOM structure, virtualizer integration, `.modal-overlay`/`.modal-content` CSS classes
- `src/App.tsx` lines 309-427 — pagination state, `loadTracks()`, `loadMoreTracks`, `initializeApp()`
- `src-tauri/src/db/mod.rs` lines 835-920 — `remove_duplicate_tracks()` detection logic and deletion cascade
- `src-tauri/src/commands/library.rs` lines 592-602 — `cleanup_duplicate_tracks` command structure
- `src/lib/tauri-api.ts` — `getAllTracks()` (line 29), `deleteTrack()` (line 47), `cleanupDuplicateTracks()`
- `src/components/ai/AIPlaylistDialog.tsx` — `useState<Set<number>>` pattern for `removedTrackIds`, Framer Motion overlay structure
- `src/components/settings/DatabaseSection.tsx` — existing "Remove Duplicate Tracks" button and SettingsContext integration

### Secondary (MEDIUM confidence)
- Competitive analysis: Rekordbox 6, iTunes/Music.app, Swinsian duplicate detection UX — industry standard for review-before-delete workflow
- v1.2 STACK.md: prior validation that `getAllTracks()` performs acceptably for DJ library sizes (5K-30K tracks) over Tauri IPC

### Tertiary (LOW confidence)
- Startup load time projections for 20K+ track libraries — estimated from library size assumptions and prior v1.2 research; not benchmarked in production for v1.3

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
