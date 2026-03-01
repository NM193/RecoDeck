---
phase: 08-ui-layout
plan: 01
subsystem: ui
tags: [react, css-grid, sidebar, framer-motion, rust, lofty, tauri-ipc, artwork]

# Dependency graph
requires:
  - phase: 07-ui-foundation
    provides: design tokens and CSS variables used throughout layout
provides:
  - CSS Grid AppShell root layout (sidebar | main / player named areas)
  - Resizable sidebar with localStorage width persistence
  - Three collapsible sections (Navigation, Folders, Playlists) with Framer Motion animation
  - get_track_artwork Rust/Tauri IPC command with lofty embedded art + folder fallback
  - Frontend artwork cache utility (module-level Map, blob URL management)
affects:
  - 08-02 (HomeView cards and NowPlayingBar will consume artwork pipeline)
  - 08-03 (player redesign builds on AppShell player area)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CSS Grid named areas for app shell layout (sidebar/main/player)
    - --sidebar-width CSS custom property updated directly on documentElement for 60fps drag
    - Framer Motion AnimatePresence + motion.div for collapsible section animation
    - FolderTree section prop for rendering folder or playlist subtree independently
    - Module-level Map cache (artworkCache.ts) for blob URLs, not React state or Zustand
    - Tauri binary Response for returning image bytes from Rust command

key-files:
  created:
    - src/components/layout/AppShell.tsx
    - src/components/layout/AppShell.css
    - src/components/layout/Sidebar.tsx
    - src/components/layout/Sidebar.css
    - src/lib/artworkCache.ts
  modified:
    - src/App.tsx
    - src/App.css
    - src/components/FolderTree.tsx
    - src-tauri/src/commands/library.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri-api.ts

key-decisions:
  - "FolderTree section prop approach chosen over splitting into two sub-components — minimizes risk to complex context menu / tree state, keeps single component instance managing state"
  - "CSS custom property --sidebar-width updated directly on documentElement during drag (not React state) for 60fps performance; committed to localStorage on mouseup"
  - "Tauri ipc::Response used for binary artwork data (Vec<u8>), avoiding base64 encoding overhead"
  - "lofty TaggedFileExt trait imported locally in command function to avoid polluting module namespace"
  - "lucide-react House icon used instead of Home (Home not in icons export in this version)"

requirements-completed:
  - UIUX-02
  - UIUX-03

# Metrics
duration: 35min
completed: 2026-03-01
---

# Phase 08 Plan 01: App Shell Layout + Artwork Pipeline Summary

**CSS Grid AppShell with resizable 3-section Sidebar and lofty-based track artwork extraction via Tauri IPC binary response**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-01T14:00:00Z
- **Completed:** 2026-03-01T14:35:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- AppShell.tsx replaces flexbox app layout with CSS Grid (sidebar | main + player named areas)
- Sidebar.tsx with drag-resize handle (180-400px, 60fps CSS var update, localStorage persist)
- Three Framer Motion collapsible sections: Navigation (Home/Search), Folders, Playlists
- Logo, Scan Folder, Settings moved to sidebar top — no separate header bar in App.tsx
- get_track_artwork Rust command using lofty embedded tag extraction with folder cover fallback
- artworkCache.ts module-level Map cache with blob URL lifecycle management

## Task Commits

Each task was committed atomically:

1. **Task 1: CSS Grid AppShell + Sidebar with collapsible sections and drag resize** - `979c0c4` (feat)
2. **Task 2: Rust get_track_artwork command + frontend artwork cache** - `3aa55e7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/components/layout/AppShell.tsx` - CSS Grid root layout (sidebar/main/player areas)
- `src/components/layout/AppShell.css` - Grid template with named areas and --sidebar-width property
- `src/components/layout/Sidebar.tsx` - Resizable sidebar with 3 collapsible sections and drag handle
- `src/components/layout/Sidebar.css` - Sidebar styling, section headers, drag handle, hover states
- `src/lib/artworkCache.ts` - Module-level Map cache returning blob URLs, with evict/clear utilities
- `src/App.tsx` - Replaced header/sidebar/main/player flexbox with AppShell + Sidebar composition
- `src/App.css` - Removed obsolete .app-header/.app-body/.app-sidebar/.app-main classes
- `src/components/FolderTree.tsx` - Added `section` prop ('folders'|'playlists') for selective rendering
- `src-tauri/src/commands/library.rs` - Added get_track_artwork command with lofty + folder fallback
- `src-tauri/src/lib.rs` - Registered get_track_artwork in invoke_handler
- `src/lib/tauri-api.ts` - Added getTrackArtwork wrapper returning ArrayBuffer

## Decisions Made
- FolderTree kept as single component with `section` prop rather than splitting — complex context menu/tree state stays in one place
- --sidebar-width CSS custom property updated directly on `document.documentElement` during drag for 60fps; React state only for dragging indicator
- `lofty::ipc::Response` (binary) used for artwork bytes — avoids base64 encoding
- `House` icon name used instead of `Home` (Home not exported in lucide-react icons object for this version)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lucide-react icon name Home -> House**
- **Found during:** Task 1 (Sidebar component)
- **Issue:** "Home" icon name is not in the lucide-react `icons` export object for this version; TypeScript error
- **Fix:** Changed to "House" which is the correct exported name
- **Files modified:** src/components/layout/Sidebar.tsx
- **Verification:** TypeScript compiled without errors
- **Committed in:** 979c0c4 (Task 1 commit)

**2. [Rule 1 - Bug] lofty TaggedFileExt trait import needed**
- **Found during:** Task 2 (get_track_artwork command)
- **Issue:** `tagged_file.tags()` method not in scope — requires TaggedFileExt trait import
- **Fix:** Added `use lofty::file::TaggedFileExt;` inside function scope
- **Files modified:** src-tauri/src/commands/library.rs
- **Verification:** `cargo check` passed cleanly
- **Committed in:** 3aa55e7 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were compile-time errors caught immediately. No scope creep.

## Issues Encountered
None beyond the two auto-fixed compilation issues.

## Next Phase Readiness
- AppShell layout foundation complete — Plan 02 can add HomeView cards in main area
- Sidebar sections visible and functioning — Plan 02 can style with artwork thumbnails
- getTrackArtworkUrl cache utility ready for Plan 02 HomeView and NowPlayingBar consumers
- No blockers

---
*Phase: 08-ui-layout*
*Completed: 2026-03-01*

## Self-Check: PASSED

- AppShell.tsx: FOUND
- AppShell.css: FOUND (contains grid-template-areas)
- Sidebar.tsx: FOUND (min_lines 80+)
- Sidebar.css: FOUND (min_lines 30+)
- artworkCache.ts: FOUND
- library.rs: contains get_track_artwork
- lib.rs: contains get_track_artwork in invoke_handler
- tauri-api.ts: contains getTrackArtwork
- Commits 979c0c4 and 3aa55e7: VERIFIED
- TypeScript: passes with no errors
- Rust cargo check: passes with no errors
