# Phase 9: UI Views and Mobile - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the remaining content views — track table, playlist detail track listing, and search results — to match the Spotify design language established in Phases 7-8. Update the mobile PWA companion to reflect the same dark theme and layout conventions as the redesigned desktop app. The shell (sidebar, now-playing bar, home view) is already done in Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Track table (UIUX-06)
- Spotify-style hover state: full-row background highlight on hover, play button appears in the # column replacing the track number
- Row selection: single click selects a row (visual highlight); double-click plays the track and loads the full sorted list into the queue
- Row numbering: track number shown in leftmost column; replaced by play icon on hover; replaced by speaker icon on currently playing track
- Default columns: #, Title+Artist (combined cell), BPM, Key (Camelot), Genre, Duration — consistent with existing TrackTable columns
- Multi-select: not required for this phase
- The existing `TrackTable.tsx` (virtualizer, sort, search) is the base to redesign — not a rebuild from scratch

### Playlist detail track listing (UIUX-07)
- `PlaylistDetailHeader` already built in Phase 8 (art, DJ metadata, scroll compression)
- Below the header: reuse TrackTable with a playlist context flag — adds a track number column reflecting playlist order, shows remove-from-playlist action in row context menu
- Playlist track numbers are sequential (1, 2, 3...) based on playlist order, not library index
- No separate new component needed — TrackTable gains a `playlistMode` prop to adjust column layout and behavior

### Search experience (UIUX-08)
- Search is triggered via the Search item in the sidebar navigation (already exists as a nav section in Phase 8's sidebar)
- Search view replaces the main content area when active — not a modal or overlay
- Results displayed in Spotify-style sectioned layout: "Tracks" section (track rows), "Playlists" section (playlist cards matching the Home view card style)
- No albums/artists sections — RecoDeck's data model is track-centric; playlists are the closest equivalent to albums
- Search is frontend-side filtering (same pattern as TrackTable's existing search) — no new Tauri command needed
- Empty state when no query: "Search your library" with search icon — not a blank screen

### Mobile PWA update (UIUX-10)
- Scope: CSS/token alignment — apply the new design tokens (Spotify warm blacks, Inter font, indigo accent) to the mobile PWA HTML/CSS served by the Axum server
- Not a full interaction redesign — the mobile PWA's browse/search/stream functionality stays the same
- Dark theme only — no light mode needed for mobile (matches desktop)
- Mobile PWA lives in `src-tauri/src/server/` — HTML/CSS served statically from the Rust server

### Claude's Discretion
- Exact hover transition timing and easing for track rows (keep consistent with Phase 8 card hover patterns: scale 1.02-1.05x guidance applies to cards, not rows — rows use background only)
- Search results section ordering and visual dividers between sections
- Context menu styling for row actions (add to playlist, analyze, set genre)
- Mobile PWA responsive breakpoints and touch target sizing

</decisions>

<specifics>
## Specific Ideas

- Track table play icon on hover is a Spotify signature — critical for the "feels like Spotify" goal
- PlaylistDetailHeader already handles the visual header; the track listing below it just needs to look consistent with the new track table
- Search view should feel like Spotify's search results page — sectioned, not a flat list
- Mobile PWA is a "port" of the new design tokens, not a redesign — keep scope tight

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TrackTable.tsx` / `TrackTable.css`: Full virtualizer-based table with sort, search, context menus — redesign the visuals, keep the logic
- `PlaylistDetailHeader.tsx`: Already built in Phase 8 with scroll compression and DJ metadata — plug track listing below it
- `HomeView.tsx`: Playlist cards with hover scale — reuse the same card component for search result playlist cards
- `playerStore.ts`: `currentTrack` state for "now playing" indicator in the track number column
- Design tokens in `globals.css`: Full Spotify-inspired token set — all new CSS uses these tokens only
- `src-tauri/src/server/routes.rs` + static files: Mobile PWA entry point for CSS/HTML updates

### Established Patterns
- CSS modules per component (co-located `.css` files)
- Design tokens only — no hardcoded hex colors
- State-driven navigation — search view triggered by sidebar nav state, not a router
- Virtualizer pattern (`useVirtualizer` from `@tanstack/react-virtual`) already in TrackTable — keep it
- Hover micro-interactions from Phase 8: cards use CSS transitions; rows should follow same pattern

### Integration Points
- `App.tsx` drives which view renders — add `view === 'search'` branch alongside existing folder/playlist/home branches
- TrackTable receives `selectedPlaylistId` prop — extend to `playlistMode` boolean for playlist-specific column layout
- Mobile PWA CSS is served from the Rust server static files — locate in `src-tauri/src/server/` or adjacent assets directory

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-ui-views-and-mobile*
*Context gathered: 2026-03-06*
