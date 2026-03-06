# Phase 9: UI Views and Mobile - Research

**Researched:** 2026-03-06
**Domain:** React UI component redesign (CSS, virtualizer patterns, state-driven navigation) + Mobile PWA CSS token alignment
**Confidence:** HIGH — based entirely on existing codebase inspection (no external library questions; all patterns already established in Phases 7-8)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Track table (UIUX-06)**
- Spotify-style hover state: full-row background highlight on hover, play button appears in the # column replacing the track number
- Row selection: single click selects a row (visual highlight); double-click plays the track and loads the full sorted list into the queue
- Row numbering: track number shown in leftmost column; replaced by play icon on hover; replaced by speaker icon on currently playing track
- Default columns: #, Title+Artist (combined cell), BPM, Key (Camelot), Genre, Duration — consistent with existing TrackTable columns
- Multi-select: not required for this phase
- The existing `TrackTable.tsx` (virtualizer, sort, search) is the base to redesign — not a rebuild from scratch

**Playlist detail track listing (UIUX-07)**
- `PlaylistDetailHeader` already built in Phase 8 (art, DJ metadata, scroll compression)
- Below the header: reuse TrackTable with a playlist context flag — adds a track number column reflecting playlist order, shows remove-from-playlist action in row context menu
- Playlist track numbers are sequential (1, 2, 3...) based on playlist order, not library index
- No separate new component needed — TrackTable gains a `playlistMode` prop to adjust column layout and behavior

**Search experience (UIUX-08)**
- Search is triggered via the Search item in the sidebar navigation (already exists as a nav section in Phase 8's sidebar)
- Search view replaces the main content area when active — not a modal or overlay
- Results displayed in Spotify-style sectioned layout: "Tracks" section (track rows), "Playlists" section (playlist cards matching the Home view card style)
- No albums/artists sections — RecoDeck's data model is track-centric; playlists are the closest equivalent to albums
- Search is frontend-side filtering (same pattern as TrackTable's existing search) — no new Tauri command needed
- Empty state when no query: "Search your library" with search icon — not a blank screen

**Mobile PWA update (UIUX-10)**
- Scope: CSS/token alignment — apply the new design tokens (Spotify warm blacks, Inter font, indigo accent) to the mobile PWA HTML/CSS served by the Axum server
- Not a full interaction redesign — the mobile PWA's browse/search/stream functionality stays the same
- Dark theme only — no light mode needed for mobile (matches desktop)
- Mobile PWA lives in `src-tauri/src/server/` (actually in `mobile/` directory served via Axum)

### Claude's Discretion
- Exact hover transition timing and easing for track rows (keep consistent with Phase 8 card hover patterns: scale 1.02-1.05x guidance applies to cards, not rows — rows use background only)
- Search results section ordering and visual dividers between sections
- Context menu styling for row actions (add to playlist, analyze, set genre)
- Mobile PWA responsive breakpoints and touch target sizing

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UIUX-06 | Redesign track table/list with Spotify-style hover states and selection | TrackTable.tsx analysis shows existing columns, hover logic, and virtualizer patterns; research identifies exact CSS additions needed (# column, row-selected state, speaker icon for playing) |
| UIUX-07 | Redesign playlist view with header art, metadata, and track listing | PlaylistDetailHeader.tsx already complete; TrackTable needs `playlistMode` prop; sequential numbering (1,2,3...) maps to playlist order in existing data model |
| UIUX-08 | Redesign search experience with Spotify-style results layout | SearchView is a new component; App.tsx view-switching pattern identified; frontend filtering already works in TrackTable; playlist card reuse from HomeView.css documented |
| UIUX-10 | Update mobile PWA companion to match new desktop design language | mobile/mobile.css uses old blue-tinted dark theme (#0a0a0f vs desktop #121212); exact token delta documented below; font change identified (Inter not specified) |
</phase_requirements>

---

## Summary

Phase 9 is a **pure CSS and component redesign phase** — no new Rust commands, no new data models, no new API endpoints. All four requirements operate on already-existing components and data patterns established in Phases 7 and 8. The work divides cleanly into three frontend sub-tasks and one mobile CSS alignment task.

The largest surface area is TrackTable.tsx (1112 lines), which needs a column layout change (adding a # column with hover state) and a `playlistMode` prop. The search view is the only net-new component, but it can be built from existing pieces: TrackTable rows for tracks, HomeView card style for playlists, and the existing App.tsx view-switching pattern. The mobile PWA alignment is a targeted CSS variable update — the token names are already compatible, only the values need updating to match `globals.css`.

**Primary recommendation:** Work in four focused waves — (1) TrackTable visual redesign + playlistMode prop, (2) SearchView new component, (3) App.tsx search navigation wiring, (4) mobile/mobile.css token alignment.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-virtual` | already in use | Virtualizer for TrackTable rows | Already powering TrackTable — keep, don't touch |
| `framer-motion` | already in use | AnimatePresence view transitions | Already used for view switching in App.tsx |
| `lucide-react` | already in use | Icon set — play, speaker, search icons | Icon component wraps this; all needed icons available |
| CSS Custom Properties | N/A | Design tokens from globals.css | Established in Phase 7; all new CSS must use tokens only |

### No New Dependencies

This phase adds **zero** new npm packages or Cargo crates. All required libraries are already installed and configured.

---

## Architecture Patterns

### Recommended File Structure (changes only)

```
src/
├── components/
│   ├── TrackTable.tsx          # MODIFY: add # column, selectedRow state, playlistMode prop
│   ├── TrackTable.css          # MODIFY: Spotify row hover, playing indicator, row selection
│   └── views/
│       ├── SearchView.tsx      # NEW: sectioned search results view
│       └── SearchView.css      # NEW: section headers, dividers, empty state
mobile/
└── mobile.css                  # MODIFY: update CSS variables to match desktop tokens
src/
└── App.tsx                     # MODIFY: add 'search' view branch to viewKey/activeView logic
```

### Pattern 1: TrackTable # Column with Hover State

**What:** Add a leftmost `#` column that shows track index by default, play icon on row hover, speaker/bars icon when that row is currently playing. This is the core Spotify signature.

**When to use:** All contexts — library view, folder view, playlist view

**Implementation notes from code inspection:**

The current `TrackTable.tsx` has these relevant states:
- `isPlayingTrack` boolean computed per row (line 597-600)
- No `selectedRow` state (needs addition)
- No `hoveredRow` state needed — CSS `:hover` handles the icon swap via CSS `content`/opacity tricks or inline conditional rendering

The current column structure (from TrackTable.tsx lines 532-581):
```
Title | Artist | Album | BPM | Key | Genre | Duration | Format
```

Phase 9 target column structure (per CONTEXT.md locked decision):
```
# | Title+Artist (combined) | BPM | Key | Genre | Duration
```

This is a **column layout change** — not a row logic change. The sort logic, virtualizer, and context menus are unchanged.

**Row number display logic:**
```tsx
// In playlistMode: show 1-based position in playlist (virtualRow.index + 1)
// In library mode: show 1-based position in current sort (virtualRow.index + 1)
// On hover: show <Play icon> (CSS :hover or hoveredRowIndex state)
// When playing: show <Speaker/Volume2 icon> in accent color
```

**CSS approach for the # column icon swap (use CSS, not extra React state):**
```css
/* Default: show number text */
.cell-index .row-number { display: block; }
.cell-index .row-play   { display: none; }

/* Hover: hide number, show play button */
.data-row:hover .cell-index .row-number { display: none; }
.data-row:hover .cell-index .row-play   { display: block; }

/* Playing: always show speaker icon, in accent color */
.data-row--playing .cell-index .row-number { display: none; }
.data-row--playing .cell-index .row-play   { display: none; }
.data-row--playing .cell-index .row-playing { display: block; }
```

**Row selection state** (single click selects, double-click plays):
```tsx
const [selectedRowId, setSelectedRowId] = useState<number | null>(null)

// onClick: setSelectedRowId(track.id)
// onDoubleClick: play track (existing handler)
```

CSS class for selected row:
```css
.data-row--selected {
  background: rgba(var(--accent-rgb), 0.08);
}
```

### Pattern 2: TrackTable `playlistMode` Prop

**What:** A boolean prop that switches from library column layout to playlist column layout (adds sequential numbering context, surfaces remove-from-playlist in context menu).

**Integration point (from App.tsx inspection):**
`selectedPlaylistId != null` is already passed as prop. Playlist mode should be derived from this — the new `playlistMode` prop simply makes the column behavior explicit.

```tsx
// TrackTable receives:
playlistMode?: boolean  // when true: row # = playlist position, not library index

// In playlistMode, the # column shows playlist order position
// The existing onRemoveFromPlaylist is already wired up from App.tsx
```

### Pattern 3: SearchView Component

**What:** A new top-level view (lives at same level as HomeView, SettingsView) that replaces the main content area when the user navigates to Search via the sidebar.

**App.tsx integration (from code inspection at lines 1062-1080):**
Current `viewKey` / `activeView` logic:
```
settings → 'settings'
selectedPlaylistId → 'playlist-{id}'
selectedFolder → 'folder-{path}'
showAllTracks → 'all-tracks'
default → 'home'
```

Phase 9 adds a `showSearch` boolean state and a `'search'` branch:
```tsx
// New state
const [showSearch, setShowSearch] = useState(false)

// viewKey update
const viewKey = showSettings ? 'settings'
  : showSearch ? 'search'
  : selectedPlaylistId ? `playlist-${selectedPlaylistId}`
  : selectedFolder ? `folder-${selectedFolder}`
  : showAllTracks ? 'all-tracks'
  : 'home'

// activeView type expansion
type ActiveView = 'home' | 'all-tracks' | 'folder' | 'playlist' | 'settings' | 'search'
```

**SearchView layout:**
```
SearchView
├── Search input (large, prominent — not the table's inline search)
├── [when query empty] Empty state: search icon + "Search your library" text
├── [when query has results]
│   ├── Section: "Tracks" (N results)
│   │   └── TrackRow component (subset of TrackTable row — or render a light TrackTable)
│   └── Section: "Playlists" (N results)
│       └── PlaylistCard components (reuse .home-view__card styles)
└── [when query has no results] Empty: "No results for '{query}'"
```

**Filtering approach (frontend-side per locked decision):**
```tsx
const filteredTracks = useMemo(() => {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return allTracks.filter(t =>
    [t.title, t.artist, t.album, t.genre].some(f => f?.toLowerCase().includes(q))
  )
}, [allTracks, query])

const filteredPlaylists = useMemo(() => {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return allPlaylists.filter(p => p.name.toLowerCase().includes(q))
}, [allPlaylists, query])
```

SearchView needs `tracks` and `playlists` passed from App.tsx (both are already in App state).

### Pattern 4: Mobile PWA CSS Token Alignment

**What:** Update `mobile/mobile.css` CSS variables to match the Spotify warm blacks from `globals.css` midnight theme and add Inter font declaration.

**Current mobile.css tokens (OLD — blue-tinted):**
```css
--accent: #6366f1;          /* same — keep */
--bg-primary: #0a0a0f;      /* OLD blue-tinted */
--bg-secondary: #12121a;    /* OLD blue-tinted */
--bg-tertiary: #1a1a28;     /* OLD blue-tinted */
--text-primary: #e0e0e8;    /* OLD slightly blue */
--text-secondary: #8888a0;  /* OLD slightly blue */
--border: #2a2a3a;          /* OLD blue-tinted */
--surface: #16161f;         /* OLD blue-tinted */
```

**Target tokens (match desktop midnight theme from globals.css):**
```css
--accent: #6366f1;          /* keep */
--bg-primary: #121212;      /* Spotify warm black */
--bg-secondary: #181818;    /* Spotify warm black */
--bg-tertiary: #282828;     /* Spotify warm black */
--text-primary: #ffffff;    /* pure white */
--text-secondary: #b3b3b3;  /* Spotify secondary */
--border: #333333;          /* neutral border */
--surface: #1e1e1e;         /* warm surface */
--danger: #e53e3e;          /* keep */
--success: #1ed760;         /* update to Spotify green */
```

**Font alignment:**
```css
/* Current mobile.css body font: */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Target (match desktop globals.css): */
font-family: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Note: Inter Variable is loaded via desktop's Vite/Tauri build but NOT by the mobile PWA bundle. The mobile PWA is a separate Vite app in `mobile/` directory. Check if Inter is available via Google Fonts or add a `@import` in mobile.css. The fallback chain handles the case gracefully.

**Mobile index.html theme-color update:**
```html
<!-- Current: -->
<meta name="theme-color" content="#0a0a0f">
<!-- Target: -->
<meta name="theme-color" content="#121212">
```

### Established Patterns to Follow

**Token-only CSS (HIGH confidence — Phase 7 decision)**
All new CSS must use CSS custom properties only. No hardcoded hex colors.

**CSS modules per component (HIGH confidence — established pattern)**
New `SearchView.css` must be co-located at `src/components/views/SearchView.css`.

**Hover transitions: 0.15s ease (HIGH confidence — from existing TrackTable.css)**
```css
transition: background-color 0.15s ease;
```
Confirmed from TrackTable.css line 201. Use this for row hover. Cards use `0.2s ease` (HomeView.css line 95). Rows use the shorter duration.

**No scale transform on rows (from CONTEXT.md locked)**
Cards use scale(1.03). Rows use background-color only.

### Anti-Patterns to Avoid

- **Rebuilding TrackTable from scratch:** Logic (virtualizer, sort, context menus, lazy loading) is complex and battle-tested. Modify CSS and add props only.
- **Using hardcoded colors:** `var(--bg-tertiary)` not `#282828`. All new CSS uses tokens.
- **Adding albumart API calls to SearchView:** HomeView explicitly uses gradient placeholders to avoid N+1 API calls — follow the same pattern for playlist cards in search results.
- **Making SearchView depend on a new Tauri command:** Filtering is frontend-side per locked decision.
- **useVirtualizer in SearchView:** Search results will be a short list (filtered). Virtualization is only needed for 1000+ item lists. SearchView renders tracks as a flat list without virtualization.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row hover icon swap | JavaScript hover state + re-render | CSS `:hover` selector on parent `.data-row` | Zero JS overhead, no re-render per row |
| Search filtering | Debounced Tauri command | Frontend `useMemo` filter (existing pattern) | Already done in TrackTable; same pattern |
| Playlist card in search | New card component | `.home-view__card` CSS class reuse | Identical design, same data shape |
| View transition animation | Custom CSS animation | `AnimatePresence` + `motion.div` with viewKey | Already wired in App.tsx |
| Touch targets on mobile | Custom hit area JS | CSS `min-height: 44px` on `.mobile-track-item` | Standard iOS/Android guideline |

---

## Common Pitfalls

### Pitfall 1: Virtualizer row height mismatch after adding # column

**What goes wrong:** Adding a leftmost column to the virtualizer rows without updating `estimateSize` causes rows to be incorrectly positioned. The virtualizer uses `estimateSize: () => 32` (from TrackTable.tsx line 366).

**Why it happens:** The virtualizer pre-calculates total scroll height from estimated sizes. If actual row DOM height changes (due to new padding/content), items desync.

**How to avoid:** Keep row height at 32px (or 40px if the design calls for taller rows). Update `estimateSize` to match. The # column should not increase row height — it fits within the existing 32px.

**Warning signs:** Rows stacking on top of each other or large gaps between rows.

### Pitfall 2: # column overlaps with existing `data-row--playing` left border

**What goes wrong:** Current `.data-row--playing` has `border-left: 3px solid var(--accent)` (TrackTable.css line 214). If the # column has `padding: 0 12px`, the left border competes visually with the column.

**Why it happens:** The left accent border was the previous "playing" indicator. The new design replaces this with the speaker icon in the # column.

**How to avoid:** Remove `border-left` from `.data-row--playing` when adding the # column. The speaker icon in accent color is sufficient indicator.

### Pitfall 3: Title+Artist combined column breaks existing sort

**What goes wrong:** The locked decision combines Title and Artist into one cell. If the sort column header click still maps to 'title' or 'artist' individually, the column header label no longer matches.

**Why it happens:** Existing sort state (`SortColumn` type) has separate `'title'` and `'artist'` values.

**How to avoid:** Keep both 'title' and 'artist' as valid sort columns but display them under a single "Title" column header. Clicking sorts by title; a secondary sort indicator could show artist sort. Alternatively: only `sortBy: 'title'` for the combined column — simpler, matches Spotify where "Title" sorts by title.

### Pitfall 4: Search view gets `allTracks` from wrong source

**What goes wrong:** App.tsx `tracks` state is the currently-filtered set (by folder or playlist). SearchView needs ALL library tracks, not just the current folder/playlist.

**Why it happens:** `loadTracks(folderPath, playlistId)` filters by the active context. When search view is active, no context filter should apply.

**How to avoid:** SearchView should receive all tracks. When `showSearch` is active, ensure `loadTracks(null, null)` is called (or SearchView gets its own `allTracks` prop passed from App.tsx's initial library load).

### Pitfall 5: Mobile PWA font not loading

**What goes wrong:** `'Inter Variable'` is not served by the Axum server — the mobile PWA bundles its own assets.

**Why it happens:** Desktop app loads Inter via `@fontsource-variable/inter` through the desktop Vite bundle. Mobile is a separate Vite app in `mobile/`.

**How to avoid:** Either (a) add `@fontsource/inter` to `mobile/package.json` or (b) add a Google Fonts import to `mobile/index.html`. Option (b) requires internet access on mobile device. Option (a) is reliable but adds a build step. The system font fallback (`-apple-system`) is acceptable given CONTEXT.md says this is CSS/token alignment, not a full redesign.

**Recommendation:** Add a Google Fonts import for Inter to `mobile/index.html` (matches existing `font-family: 'Inter Variable', 'Inter', ...` fallback chain). If offline use is required, the `-apple-system` fallback is sufficient.

### Pitfall 6: SearchView `playlistMode` in track rows

**What goes wrong:** When search results show tracks, double-clicking a track should play it and load the search results as the queue. The search context differs from the library/playlist context.

**Why it happens:** `handlePlayTrack` in App.tsx expects `sortedTracks` from TrackTable. SearchView has its own filtered track array.

**How to avoid:** Pass `handlePlayTrack` (or a new `onSearchTrackPlay`) to SearchView and let SearchView manage the sorted context. The player store's `setQueue` accepts any `Track[]`.

---

## Code Examples

### TrackTable # Column JSX (verified from existing row structure)

```tsx
// Source: TrackTable.tsx lines 593-688 (existing row pattern)
// Add BEFORE .cell-title in each virtualRow:

<div className="table-cell cell-index">
  {isPlayingTrack ? (
    <span className="row-playing">
      <Icon name="Volume2" size={14} />
    </span>
  ) : (
    <>
      <span className="row-number">{virtualRow.index + 1}</span>
      <span className="row-play">
        <Icon name="Play" size={14} />
      </span>
    </>
  )}
</div>
```

### TrackTable # Column CSS

```css
/* Source: extends TrackTable.css established patterns */
.cell-index {
  flex: 0 0 48px;
  justify-content: center;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  position: relative;
}

.row-number { display: block; }
.row-play   { display: none; color: var(--text-primary); }
.row-playing { color: var(--accent); }

.data-row:hover .row-number { display: none; }
.data-row:hover .row-play   { display: block; }
.data-row--playing .row-number { display: none; }
.data-row--playing .row-play   { display: none; }
```

### Row Selection CSS

```css
/* Source: extends TrackTable.css .data-row pattern */
.data-row--selected {
  background: rgba(var(--accent-rgb), 0.08);
}

.data-row--selected:hover {
  background: rgba(var(--accent-rgb), 0.13);
}
```

### SearchView Empty State JSX

```tsx
// Source: HomeView empty state pattern (HomeView.css .home-view__empty)
{!query && (
  <div className="search-view__empty">
    <Icon name="Search" size={48} className="search-view__empty-icon" />
    <h2 className="search-view__empty-title">Search your library</h2>
    <p className="search-view__empty-subtitle">
      Find tracks, playlists, artists, and more
    </p>
  </div>
)}
```

### SearchView Section Header

```tsx
// Spotify-style section: "Tracks" or "Playlists" with count
<div className="search-view__section">
  <div className="search-view__section-header">
    <h3 className="search-view__section-title">Tracks</h3>
    <span className="search-view__section-count">{filteredTracks.length}</span>
  </div>
  {/* track rows or playlist cards */}
</div>
```

### Mobile CSS Variable Update

```css
/* Source: globals.css midnight theme — exact values to apply to mobile/mobile.css */
:root {
  --accent: #6366f1;         /* unchanged */
  --bg-primary: #121212;     /* was #0a0a0f */
  --bg-secondary: #181818;   /* was #12121a */
  --bg-tertiary: #282828;    /* was #1a1a28 */
  --text-primary: #ffffff;   /* was #e0e0e8 */
  --text-secondary: #b3b3b3; /* was #8888a0 */
  --border: #333333;         /* was #2a2a3a */
  --surface: #1e1e1e;        /* was #16161f */
  --danger: #e53e3e;         /* was #ef4444 — update to match desktop */
  --success: #1ed760;        /* was #10b981 — update to Spotify green */
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Playing indicator: `border-left: 3px accent` | Speaker icon in # column + no border-left | Phase 9 | Cleaner Spotify parity; left border was a workaround |
| Track number: none (no # column) | # column with hover play icon | Phase 9 | Core Spotify signature interaction |
| Title + Artist as separate columns | Title+Artist combined cell | Phase 9 | Reduces horizontal scroll need; matches Spotify compact layout |
| Mobile: blue-tinted dark theme (#0a0a0f) | Warm black matching desktop (#121212) | Phase 9 | Visual consistency between desktop and mobile companion |
| Search: embedded in TrackTable's search bar | Dedicated full-view SearchView | Phase 9 | Spotify-style sectioned results with playlist cards |

---

## Open Questions

1. **SearchView track row rendering approach**
   - What we know: Locked decision says frontend filtering; TrackTable is the virtualizer baseline
   - What's unclear: Should SearchView render a simplified row (no header, no sort, no footer) or render a full TrackTable with reduced props? A simplified row avoids complexity; TrackTable carries a lot of context menu state.
   - Recommendation: Render a simple flat list of track rows (not a full TrackTable) for search results. The search view has short, dynamic result sets — virtualization overhead is unnecessary. Reuse `.track-table-row` and `.table-cell` CSS classes for visual consistency.

2. **Inter font on mobile PWA**
   - What we know: Desktop uses Inter via @fontsource-variable; mobile is a separate Vite build
   - What's unclear: Is the mobile PWA typically used with internet access (enabling Google Fonts) or offline?
   - Recommendation: Add `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap')` to `mobile/index.html`. The system fallback handles offline gracefully. This is a minor visual improvement, not a breaking dependency.

3. **SearchView: where does `allTracks` come from?**
   - What we know: App.tsx `tracks` state is context-filtered (folder or playlist)
   - What's unclear: Phase 8's sidebar has a Search nav item — when clicked, does it just set `showSearch = true` without changing the track set?
   - Recommendation: When `showSearch` becomes true, call `loadTracks(null, null)` to ensure all tracks are loaded. SearchView then filters from `tracks` (the full library). This is consistent with how "All Tracks" view already works.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4 + jsdom |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UIUX-06 | TrackTable renders # column and selectedRow state | manual-only | N/A — components excluded from test scope (see REQUIREMENTS.md) | N/A |
| UIUX-07 | TrackTable `playlistMode` prop changes column layout | manual-only | N/A — component coupling to Tauri IPC | N/A |
| UIUX-08 | SearchView filters tracks and playlists by query | unit (if pure filter fn extracted) | `npx vitest run src/lib/searchFilter.test.ts` | ❌ Wave 0 optional |
| UIUX-10 | Mobile CSS tokens match desktop midnight theme | manual-only | N/A — CSS visual check | N/A |

**Note:** REQUIREMENTS.md explicitly excludes component-level React tests: "Components deeply coupled to Tauri IPC + audioPlayer singleton — mock overhead exceeds value." All four requirements in this phase are visual/interaction changes. Testing is manual (visual verification) per established project policy.

The only testable unit is the search filter function — if extracted to a pure utility in `src/lib/`. This is optional since the search logic is trivially simple (string includes check).

### Sampling Rate

- **Per task commit:** `npx vitest run` (existing test suite must remain green)
- **Per wave merge:** `npx vitest run` + manual visual check of affected components
- **Phase gate:** Full suite green + visual walkthrough of all four requirement behaviors before `/gsd:verify-work`

### Wave 0 Gaps

None required — existing test infrastructure covers all currently-testable phase code. If a `searchFilter.ts` utility is extracted, create `src/lib/searchFilter.test.ts`.

---

## Sources

### Primary (HIGH confidence)

- `src/components/TrackTable.tsx` — full component inspection (column structure, virtualizer config, playing track logic, sort state, props interface)
- `src/components/TrackTable.css` — existing CSS patterns (row hover, playing state, cell widths, transition durations)
- `src/App.tsx` — view switching logic (viewKey, activeView, AnimatePresence pattern, all state vars)
- `src/styles/globals.css` — design token values (midnight theme exact hex values)
- `mobile/mobile.css` — current mobile token values (identified exact diff vs desktop)
- `src/components/views/HomeView.css` — playlist card patterns for reuse in SearchView
- `src/components/views/PlaylistDetailHeader.tsx` — Phase 8 complete implementation
- `src-tauri/src/server/mod.rs` — mobile PWA serving path (`mobile/` directory confirmed)
- `.planning/phases/09-ui-views-and-mobile/09-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- Spotify design language (CSS-only hover icon swap pattern) — cross-verified with existing Phase 8 patterns; no external source needed

### Tertiary (LOW confidence — not required)

- Inter font on Google Fonts — standard knowledge, not verified for offline availability in this project context

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all libraries already in project
- Architecture: HIGH — all patterns directly observed in existing codebase
- Pitfalls: HIGH — identified from direct code inspection (virtualizer height, left border conflict, combined column sort)
- Mobile alignment: HIGH — exact hex values from globals.css vs mobile.css compared directly

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable — no fast-moving dependencies)
