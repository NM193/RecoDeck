# Phase 8: UI Layout - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the app shell to match Spotify's desktop layout: persistent sidebar with navigation, collapsible sections for folders and playlists, album art grids on the Home view and playlist detail headers, a Spotify 3-column now-playing bar fixed at the bottom, and smooth Framer Motion transitions between views. The existing TrackTable and its columns/behavior are NOT redesigned here (that's Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Sidebar structure
- Three collapsible sections: Navigation (Home, Search), Folders (library tree), Playlists
- Resizable via drag handle on the right edge — width persisted across sessions
- No top header bar — logo, Scan Folder button, and Settings gear merge into the sidebar top area
- Current FolderTree component refactored to fit within the collapsible Folders section

### Home view
- Library overview dashboard: total tracks, recent additions, playlist count, quick stats
- Spotify-style square cards for playlists (album art, name below, shadow on hover, rounded corners, 4-5 per row)
- Home is the default view when no folder or playlist is selected

### Now-playing bar
- Spotify 3-column layout: Left (album art thumbnail + track info), Center (transport controls + progress bar), Right (volume + queue + extras)
- Track info shows: title, artist, BPM, musical key (Camelot), and genre
- Album art thumbnail is expandable — clicking opens a larger now-playing view
- Bar height: Claude's discretion (likely 72-90px to fit album art and 3-column layout)

### Playlist detail headers
- Large album art header when viewing a playlist (Spotify-style)
- DJ-enhanced metadata: playlist name, track count, total duration, BPM range, key distribution, energy range
- Header compresses/fades on scroll (sticky header behavior)

### Album art source
- Fallback chain: embedded cover art (ID3/Vorbis) → folder images (cover.jpg, folder.jpg) → styled placeholder with genre color or initials
- Art extraction requires Rust backend work to read embedded images from audio files

### View transitions
- Subtle fast crossfade between views (150-250ms) using Framer Motion AnimatePresence
- State-driven navigation (no client-side router) — state variables control which view renders
- Sticky header fade on scroll for playlist detail views

### Hover and micro-interactions
- Cards: slight scale up on hover (1.02-1.05x) + shadow increase
- Sidebar items: background highlight on hover
- All transitions use CSS or Framer Motion for consistency

### Claude's Discretion
- Exact now-playing bar height
- Card grid responsive breakpoints and card sizing
- Loading skeleton design for Home view
- Scroll behavior performance optimizations
- Expandable now-playing view design and animation
- How to organize the refactored App.tsx (component extraction strategy)

</decisions>

<specifics>
## Specific Ideas

- "I want it to feel like Spotify" — dark theme already done in Phase 7, this phase brings the layout
- Playlist headers should show DJ-useful info (BPM range, key distribution) alongside the standard Spotify metadata
- Album art expandable from the now-playing bar — like Spotify's full-screen mode
- Collapsible sidebar sections let DJs hide what they don't need (e.g., collapse Navigation to focus on Playlists)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Player.tsx` / `Player.css`: Current 48px SoundCloud-style bar — will be redesigned into 3-column layout
- `FolderTree.tsx` / `FolderTree.css`: Full folder tree + playlist sidebar — sections extracted into collapsible groups
- `Icon.tsx`: Icon component already supports all needed icons
- `playerStore.ts`: Zustand store with all playback state (currentTrack, isPlaying, queue, volume, etc.)
- `framer-motion` (v11): Already installed, unused — available for AnimatePresence transitions
- Design tokens in `globals.css`: Full Spotify-inspired token system (colors, typography, spacing, radii)

### Established Patterns
- State-driven rendering: App.tsx uses state (selectedFolder, selectedPlaylistId) to drive what shows in main area
- CSS modules pattern: Each component has its own .css file using design tokens
- Zustand stores: playerStore for playback, aiStore for AI features — no additional stores yet

### Integration Points
- `App.tsx` (~1460 lines): Monolithic component that needs decomposition — extract Sidebar, NowPlayingBar, HomeView as separate components
- `tauriApi`: Already has getTracksInFolder, getDebugTracks, playlist CRUD — may need new endpoint for album art extraction
- `audioPlayer.ts`: Handles actual audio playback, Player.tsx wraps it — now-playing bar redesign wraps the same audioPlayer

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-ui-layout*
*Context gathered: 2026-03-01*
