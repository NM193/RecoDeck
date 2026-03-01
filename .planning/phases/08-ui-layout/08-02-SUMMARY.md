---
phase: 08-ui-layout
plan: "02"
subsystem: frontend-ui
tags: [player-bar, spotify-layout, home-view, playlist-header, artwork, dj-metadata, scroll-compression]
dependency_graph:
  requires:
    - 08-01 (artworkCache, CSS design tokens, AppShell grid)
    - src/store/playerStore.ts (all playback state)
    - src/lib/audioPlayer.ts (audio engine)
    - src/lib/artworkCache.ts (getTrackArtworkUrl)
  provides:
    - NowPlayingBar 3-column Spotify-style player bar
    - HomeView dashboard with stats and playlist card grid
    - PlaylistDetailHeader with DJ metadata and scroll compression
  affects:
    - src/App.tsx (Player replaced with NowPlayingBar, HomeView and PlaylistDetailHeader added)
tech_stack:
  added: []
  patterns:
    - IntersectionObserver for scroll compression (no scroll event listeners)
    - Async artwork loading with cancellation via boolean flag
    - Deterministic gradient generation from playlist name hash
    - Frontend-only DJ metadata computation (no new backend commands)
key_files:
  created:
    - src/components/layout/NowPlayingBar.tsx
    - src/components/layout/NowPlayingBar.css
    - src/components/views/HomeView.tsx
    - src/components/views/HomeView.css
    - src/components/views/PlaylistDetailHeader.tsx
    - src/components/views/PlaylistDetailHeader.css
  modified:
    - src/App.tsx (imported NowPlayingBar/HomeView/PlaylistDetailHeader, replaced Player, added view routing)
decisions:
  - NowPlayingBar wraps all existing Player.tsx logic inline (approach b) — avoids indirection while keeping Player.tsx as fallback for MiniPlayer imports
  - HomeView uses gradient placeholders instead of N+1 artwork API calls — avoids waterfall on home view load
  - PlaylistDetailHeader sentinel div placed inside component before header — keeps observer logic self-contained
  - Playlist card artwork deferred to future enhancement — placeholder approach chosen for performance
metrics:
  duration: "~8 minutes"
  completed_date: "2026-03-01"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
---

# Phase 8 Plan 02: View Components Summary

**One-liner:** Spotify 3-column NowPlayingBar with async artwork, HomeView playlist grid with hover animations, and PlaylistDetailHeader with IntersectionObserver scroll compression and DJ metadata

## What Was Built

### Task 1: NowPlayingBar + HomeView

**NowPlayingBar** (`src/components/layout/NowPlayingBar.tsx` + `.css`):
- 3-column flexbox layout at 88px height matching the AppShell `--player-height` grid row
- Left column: 56x56px album art thumbnail (async loaded via `getTrackArtworkUrl`, placeholder with Music icon when missing), track title (bold, truncated), artist (secondary color), metadata line showing `{BPM} BPM · {key} · {genre}`
- Center column: shuffle/prev/play/next/repeat transport buttons + progress bar with drag-seek behavior
- Right column: volume popup slider, mini player button, add-to-playlist dropdown, AI playlist/recommendations buttons (conditional on AI_ENABLED)
- Play button uses filled circle (white bg, dark icon) matching Spotify style
- All existing audio logic preserved verbatim: crossfade handling, generation counter for rapid track switches, mini player event emitting, repeat/shuffle logic, keyboard handler pass-through via refs

**HomeView** (`src/components/views/HomeView.tsx` + `.css`):
- Stats section: two stat cards showing total track count and playlist count with icon badges
- Playlist card grid: `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` with `gap: var(--space-5)`
- Each card: square art area with deterministic gradient placeholder (8-color palette, hash from playlist name), playlist name (bold, truncated), track count subtitle
- Hover state: `transform: scale(1.03)` + `box-shadow: 0 8px 24px rgba(0,0,0,0.4)` with `transition: all 0.2s ease`
- Filters to manual + AI playlist types only (excludes folder-type playlists)
- Empty state with ListMusic icon when no playlists exist

**App.tsx routing**: Shows HomeView when `!selectedFolder && !selectedPlaylistId`, falls through to empty state or TrackTable otherwise.

### Task 2: PlaylistDetailHeader

**PlaylistDetailHeader** (`src/components/views/PlaylistDetailHeader.tsx` + `.css`):
- Large 200x200px album art (art from first track via `getTrackArtworkUrl`), playlist name at `--text-3xl`, "Playlist" type label
- DJ metadata row with icons: track count, total duration (formatted as `Xh Ym` or `Xm Ys`), BPM range (`min - max BPM`), top 3 musical keys by frequency
- All metadata computed frontend-only from `tracks[]` — zero new backend API calls
- Sticky positioning (`position: sticky; top: 0; z-index: 10`) for scroll-following
- IntersectionObserver on sentinel div: when sentinel scrolls out of view → adds `.playlist-header--compressed` class
- Compressed state: art shrinks to 48px, metadata row hides (`opacity: 0; max-height: 0`), name shrinks to `--text-lg`, padding reduces — all with `transition: all 0.3s ease`
- Gradient placeholder (accent-colored) when no artwork found

**App.tsx wiring**: Main content area uses `overflowY: auto` scroll context. PlaylistDetailHeader renders above TrackTable when `selectedPlaylistId != null`.

## Verification Results

1. `npx tsc --noEmit` — PASSED (no TypeScript errors)
2. NowPlayingBar.css contains `.now-playing-bar__left`, `.now-playing-bar__center`, `.now-playing-bar__right` — PASSED (3 matches)
3. NowPlayingBar.tsx uses `usePlayerStore` — PASSED
4. HomeView.css contains `auto-fill` in grid-template-columns — PASSED (1 match)
5. Playlist cards have `scale(1.03)` hover transform and `box-shadow` — PASSED
6. PlaylistDetailHeader.tsx uses `IntersectionObserver` — PASSED (2 occurrences)
7. PlaylistDetailHeader shows BPM range, key distribution, total duration — PASSED (all 3 helpers)
8. App.tsx renders HomeView when no folder/playlist selected, PlaylistDetailHeader when playlist selected — PASSED

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `b4553e5` — feat(08-02): add NowPlayingBar 3-column layout and HomeView playlist grid
- `fa6a942` — feat(08-02): add PlaylistDetailHeader with DJ metadata and scroll compression

## Self-Check: PASSED

All 6 created files exist on disk. Both task commits (b4553e5, fa6a942) verified in git log.
