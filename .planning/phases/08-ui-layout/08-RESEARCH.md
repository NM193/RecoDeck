# Phase 8: UI Layout - Research

**Researched:** 2026-03-01
**Domain:** React layout architecture, Framer Motion transitions, drag-resize sidebar, album art extraction via Tauri IPC
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Sidebar structure**: Three collapsible sections — Navigation (Home, Search), Folders (library tree), Playlists. Resizable via drag handle on right edge, width persisted across sessions. No top header bar — logo, Scan Folder button, and Settings gear merge into the sidebar top area. Current FolderTree component refactored to fit within the collapsible Folders section.

- **Home view**: Library overview dashboard — total tracks, recent additions, playlist count, quick stats. Spotify-style square cards for playlists (album art, name below, shadow on hover, rounded corners, 4-5 per row). Home is the default view when no folder or playlist is selected.

- **Now-playing bar**: Spotify 3-column layout — Left (album art thumbnail + track info), Center (transport controls + progress bar), Right (volume + queue + extras). Track info shows: title, artist, BPM, musical key (Camelot), and genre. Album art thumbnail is expandable — clicking opens a larger now-playing view.

- **Playlist detail headers**: Large album art header when viewing a playlist (Spotify-style). DJ-enhanced metadata: playlist name, track count, total duration, BPM range, key distribution, energy range. Header compresses/fades on scroll (sticky header behavior).

- **Album art source**: Fallback chain: embedded cover art (ID3/Vorbis) → folder images (cover.jpg, folder.jpg) → styled placeholder with genre color or initials. Art extraction requires Rust backend work to read embedded images from audio files.

- **View transitions**: Subtle fast crossfade between views (150-250ms) using Framer Motion `AnimatePresence`. State-driven navigation (no client-side router) — state variables control which view renders. Sticky header fade on scroll for playlist detail views.

- **Hover and micro-interactions**: Cards — slight scale up on hover (1.02-1.05x) + shadow increase. Sidebar items — background highlight on hover. All transitions use CSS or Framer Motion for consistency.

### Claude's Discretion

- Exact now-playing bar height
- Card grid responsive breakpoints and card sizing
- Loading skeleton design for Home view
- Scroll behavior performance optimizations
- Expandable now-playing view design and animation
- How to organize the refactored App.tsx (component extraction strategy)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UIUX-02 | Redesign sidebar navigation with library sections and playlist list | Resizable drag sidebar pattern (mousedown/mousemove + localStorage), collapsible sections via CSS height transition, FolderTree refactor into Folders section |
| UIUX-03 | Implement album art grid views for library browsing | CSS Grid auto-fill with minmax, Tauri IPC `tauri::ipc::Response` for binary art data, lofty 0.22 Picture.data() extraction, fallback chain pattern |
| UIUX-04 | Redesign now-playing bar fixed at bottom with track info, controls, progress | 3-column CSS flex layout at 72-90px height, existing playerStore + audioPlayer wiring preserved, left/center/right column division |
| UIUX-05 | Add smooth Framer Motion transitions across all view changes | framer-motion 11.18.2 already installed, AnimatePresence with mode="wait" for sequential crossfade, motion.div with opacity/x variants, 150-250ms duration per spec |

</phase_requirements>

---

## Summary

Phase 8 is a pure frontend layout redesign — no new data models, no new Zustand stores, and no changes to the audio engine. The primary work is: (1) decomposing the monolithic `App.tsx` (~1460 lines) into discrete layout components, (2) redesigning `Player.tsx` into a 3-column Spotify bar, (3) refactoring `FolderTree.tsx` into a collapsible multi-section sidebar with a resize handle, (4) building a new `HomeView` with a playlist card grid, (5) adding a playlist detail header with scroll compression, and (6) wiring `AnimatePresence` crossfades between all view states.

The critical new backend work is album art extraction. The `artwork_path` field already exists in the DB schema and `Track` model but is always `None` — the scanner sets it to `None` explicitly. Lofty 0.22 (already a dependency) has `Picture.data()` and `pic_type()` on `TaggedFile`, so art can be extracted. The recommended approach is a new Tauri IPC command `get_track_artwork(track_id)` that reads embedded art on demand and returns raw bytes via `tauri::ipc::Response`, which the frontend converts to a data URL (`data:image/jpeg;base64,...`). This avoids large file caching complexity and works with the existing fallback chain (folder `cover.jpg` → placeholder).

The Framer Motion library is already installed at v11.18.2 but unused. `AnimatePresence` with `mode="wait"` gives sequential exit-then-enter crossfade. For the state-driven navigation pattern already in use, wrapping the current view in `AnimatePresence` with a `key` prop change triggers the transition without any router dependency.

**Primary recommendation:** Build layout bottom-up in three sub-phases: (08-01) sidebar refactor + resize, (08-02) album art pipeline + now-playing bar + home view grid + playlist header, (08-03) AnimatePresence wiring for all view transitions.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | 11.18.2 (installed) | AnimatePresence crossfades, card hover animations | Already installed, locked per decisions, official React animation library |
| lofty | 0.22 (installed in Cargo) | Extract embedded artwork from audio files (ID3/Vorbis/FLAC) | Already the metadata library used in scanner.rs; provides Picture.data() |
| Zustand | 5.0.11 (installed) | App-level navigation state (currentView, selectedFolder, selectedPlaylistId) | Established pattern in this codebase |
| CSS custom properties | — | Design tokens from globals.css for all layout sizing | Phase 7 established the full token system; no new tokens needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| IntersectionObserver (browser native) | — | Playlist detail header fade-on-scroll detection | Observe sentinel element above header; toggles compressed class |
| localStorage (browser native) | — | Persist sidebar width across sessions | Simple key-value: `sidebar_width` |
| react-router-dom | 7.13.0 (installed) | NOT used for navigation in this phase | Decision locked: state-driven navigation only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AnimatePresence mode="wait" | CSS transitions only | Framer Motion gives cleaner exit animation guarantee; CSS alone can't reliably animate unmounted elements |
| tauri::ipc::Response for binary art | Base64 string return | Binary response bypasses JSON serialization overhead; preferable for image data |
| IntersectionObserver for scroll fade | onScroll listener | IntersectionObserver is more performant; fires on a separate thread |

**Installation:** Nothing new to install — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

After Phase 8, `src/` should look like:

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Root layout: CSS Grid, assembles sidebar + main + player
│   │   ├── Sidebar.tsx          # Resizable sidebar: 3 collapsible sections
│   │   ├── NowPlayingBar.tsx    # Redesigned 3-column player bar
│   │   └── ResizeHandle.tsx     # Drag handle between sidebar and main area
│   ├── views/
│   │   ├── HomeView.tsx         # Dashboard: stats + playlist card grid
│   │   └── PlaylistDetailHeader.tsx # Large art header with DJ metadata + scroll compress
│   ├── Player.tsx               # Existing — gutted and rebuilt as NowPlayingBar wrapper
│   ├── FolderTree.tsx           # Existing — refactored into Sidebar sections
│   └── ...existing components
├── App.tsx                      # Slimmed: delegates rendering to AppShell
└── ...
```

**Note:** The CONTEXT.md notes App.tsx architecture refactor is listed as deferred in REQUIREMENTS.md (ARCH-01), but CONTEXT.md clarifies the phase boundary: extracting `Sidebar`, `NowPlayingBar`, `HomeView` as new components IS in scope. The deferred ARCH-01 refers to deeper state management extraction — keep all existing state in App.tsx/AppContent, just extract render output into sub-components via props.

### Pattern 1: CSS Grid App Shell

**What:** The outermost layout uses CSS Grid with named areas. The now-playing bar spans full width at the bottom.

**When to use:** Any time you need a fixed bottom bar that doesn't interact with the scrollable content above.

**Example:**
```css
/* Source: established Spotify layout pattern */
.app-shell {
  display: grid;
  grid-template-areas:
    "sidebar main"
    "player  player";
  grid-template-columns: var(--sidebar-width, 240px) 1fr;
  grid-template-rows: 1fr var(--player-height, 88px);
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}

.app-shell__sidebar  { grid-area: sidebar; overflow: hidden; }
.app-shell__main     { grid-area: main;    overflow: hidden; }
.app-shell__player   { grid-area: player;  border-top: 1px solid var(--border); }
```

The sidebar width is driven by a CSS custom property updated via JS (from localStorage + drag). This approach avoids re-renders during drag — only the CSS variable changes, not React state.

### Pattern 2: Sidebar Width Persistence via CSS Variable + localStorage

**What:** Sidebar width stored in localStorage; applied as a CSS variable on the root. Drag handle updates the variable directly via `document.documentElement.style.setProperty` during drag (no React setState), then commits to localStorage on mouseup.

**When to use:** Drag-resize pattern where you want 60fps drag without React re-renders.

**Example:**
```typescript
// Source: verified pattern from Stackademic sidebar article
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 180
const MAX_WIDTH = 400

function Sidebar() {
  const isResizing = useRef(false)

  useEffect(() => {
    const saved = parseInt(localStorage.getItem('sidebar_width') ?? '', 10)
    if (!isNaN(saved)) {
      document.documentElement.style.setProperty('--sidebar-width', `${saved}px`)
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX))
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
  }

  const onMouseUp = (e: MouseEvent) => {
    isResizing.current = false
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX))
    localStorage.setItem('sidebar_width', String(newWidth))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  return (
    <aside className="sidebar">
      {/* content */}
      <div className="resize-handle" onMouseDown={onMouseDown} />
    </aside>
  )
}
```

### Pattern 3: AnimatePresence Crossfade for State-Driven Views

**What:** Wrap the current view in `AnimatePresence` with `mode="wait"`. Change the `key` prop to trigger exit + enter animations. Old view fades out, new view fades in.

**When to use:** When state (not URL) controls which view is visible — which is exactly the existing pattern.

**Example:**
```typescript
// Source: framer-motion v11 AnimatePresence pattern
import { AnimatePresence, motion } from 'framer-motion'

// Determine current view key from state
const viewKey = selectedPlaylistId
  ? `playlist-${selectedPlaylistId}`
  : selectedFolder
  ? `folder-${selectedFolder}`
  : 'home'

return (
  <AnimatePresence mode="wait">
    <motion.div
      key={viewKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {currentView}
    </motion.div>
  </AnimatePresence>
)
```

`mode="wait"` ensures the exiting view fully disappears before the entering view appears. For 150-250ms crossfade, use `duration: 0.15` to `duration: 0.25`.

### Pattern 4: Album Art Extraction via Tauri IPC

**What:** New Tauri command `get_track_artwork(track_id)` reads embedded art using lofty, returns raw bytes via `tauri::ipc::Response`. Frontend converts ArrayBuffer to data URL.

**When to use:** On-demand — called when a track card or the now-playing bar needs to display art. Results cached in a module-level Map to avoid repeated IPC calls.

**Rust side:**
```rust
// Source: Tauri v2 docs - tauri::ipc::Response for binary data
use tauri::ipc::Response;

#[tauri::command]
async fn get_track_artwork(
    track_id: i64,
    state: State<'_, AppState>,
) -> Result<Response, String> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().ok_or("Database not initialized")?;
    let track = db.get_track(track_id).map_err(|e| e.to_string())?;

    let file_path = &track.file_path;

    // Try embedded art via lofty
    if let Ok(tagged_file) = lofty::read_from_path(file_path) {
        if let Some(tag) = tagged_file.primary_tag() {
            if let Some(picture) = tag.pictures().first() {
                return Ok(Response::new(picture.data().to_vec()));
            }
        }
    }

    // Try folder cover images
    let folder = std::path::Path::new(file_path).parent();
    for name in &["cover.jpg", "cover.png", "folder.jpg", "folder.png"] {
        if let Some(cover_path) = folder.map(|f| f.join(name)) {
            if cover_path.exists() {
                if let Ok(bytes) = std::fs::read(&cover_path) {
                    return Ok(Response::new(bytes));
                }
            }
        }
    }

    Err("no_artwork".to_string())
}
```

**Frontend side:**
```typescript
// Source: Tauri v2 - invoke with ArrayBuffer response
const artworkCache = new Map<number, string | null>()

async function getTrackArtwork(trackId: number): Promise<string | null> {
  if (artworkCache.has(trackId)) return artworkCache.get(trackId)!

  try {
    const buffer = await invoke<ArrayBuffer>('get_track_artwork', { trackId })
    const bytes = new Uint8Array(buffer)
    const blob = new Blob([bytes])
    const url = URL.createObjectURL(blob)
    artworkCache.set(trackId, url)
    return url
  } catch {
    artworkCache.set(trackId, null)
    return null
  }
}
```

Note: `invoke` with `tauri::ipc::Response` returns an `ArrayBuffer` in the frontend, not a typed value.

### Pattern 5: Playlist Detail Header with Scroll Compression

**What:** A large hero header (playlist art + metadata) that shrinks/fades as the user scrolls into the track list. Uses IntersectionObserver on a sentinel div placed above the header.

**When to use:** Playlist detail view, when `selectedPlaylistId` is set.

**Example:**
```typescript
// Source: IntersectionObserver pattern for sticky header behavior
function PlaylistDetailHeader({ playlistId }: { playlistId: number }) {
  const [compressed, setCompressed] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setCompressed(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} style={{ height: 1 }} />
      <div className={`playlist-header ${compressed ? 'playlist-header--compressed' : ''}`}>
        {/* large art + metadata */}
      </div>
    </>
  )
}
```

CSS handles the transition:
```css
.playlist-header {
  transition: all 0.3s ease;
  padding: var(--space-8);
}
.playlist-header--compressed {
  padding: var(--space-3) var(--space-5);
  background: var(--bg-secondary);
}
```

### Anti-Patterns to Avoid

- **Calling setState during drag**: Update CSS custom properties directly during `mousemove`, commit to state only on `mouseup`. React state updates during fast mouse events cause frame drops.
- **Caching artwork as base64 strings in React state**: Use module-level `Map` or a simple in-module cache — storing many base64 strings in Zustand/React state triggers unnecessary re-renders.
- **Using `AnimatePresence mode="sync"` (default)**: With state-driven navigation, both views can briefly be in the DOM simultaneously, causing layout conflicts. Use `mode="wait"`.
- **Blocking App.tsx render on album art fetch**: Album art should load asynchronously; always show placeholder first, replace with art when resolved.
- **Duplicating player logic in NowPlayingBar**: The existing `Player.tsx` contains all the crossfade, queue, and audio event logic — refactor its JSX layout only, keep all logic intact.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exit/enter view animations | Custom CSS keyframe mounting/unmounting hack | `AnimatePresence` from framer-motion | Unmounting animations cannot be done in pure CSS reliably; Framer Motion defers unmount until exit animation completes |
| Artwork extraction from MP3/FLAC/OGG | Custom ID3 parser in Rust | `lofty` (already installed) | lofty handles ID3v1/v2, Vorbis, FLAC, MP4, APE — format-specific artwork access behind a unified API |
| Card grid layout | Manual flexbox wrap arithmetic | CSS Grid `repeat(auto-fill, minmax(...))`  | Browser handles responsive column counts, gap, and wrapping automatically |
| Scroll-based header fade | `onScroll` state updates | `IntersectionObserver` | IntersectionObserver runs off main thread; scroll listeners can cause jank |

**Key insight:** All required libraries are already installed. This phase is a refactor + layout task, not a library integration task.

---

## Common Pitfalls

### Pitfall 1: App.tsx State vs Component Extraction Scope

**What goes wrong:** Trying to extract all state from App.tsx into new stores as part of this phase, leading to a massive refactor that breaks unrelated features.

**Why it happens:** App.tsx is ~1460 lines and clearly needs decomposition, but ARCH-01 (state management refactor) is explicitly deferred. The phase boundary is: extract render output into sub-components via props, keep state in App.tsx/AppContent.

**How to avoid:** New components (`Sidebar`, `NowPlayingBar`, `HomeView`) receive state and callbacks as props from App.tsx. No new Zustand stores. No prop drilling restructuring.

**Warning signs:** If a PR includes changes to `playerStore.ts` or `aiStore.ts`, it's out of scope.

### Pitfall 2: Animation Key Collision

**What goes wrong:** `AnimatePresence` doesn't trigger a transition because the `key` prop didn't change, so the old and new views look the same to React (same key = same component = update, not mount/unmount).

**Why it happens:** Using boolean state (`showHome: boolean`) as key instead of a discriminated view identifier.

**How to avoid:** Always use a unique string key that encodes the full view identity:
```typescript
const viewKey = selectedPlaylistId
  ? `playlist-${selectedPlaylistId}`
  : selectedFolder
  ? `folder-${selectedFolder}`
  : 'home'
```

**Warning signs:** Views snap-switch without animation despite `AnimatePresence` being present.

### Pitfall 3: Resize Handle Outside the Grid

**What goes wrong:** The resize handle is rendered inside the sidebar div, causing the draggable area to not update the grid column width correctly.

**Why it happens:** If `--sidebar-width` CSS variable is set on the sidebar element itself, the handle is also inside that element and doesn't properly reflect the grid column resize.

**How to avoid:** Set `--sidebar-width` on `:root` or on `.app-shell` (the grid container). The handle can be a separate element positioned at the right edge of the sidebar column.

**Warning signs:** Drag works visually for the sidebar but the main content area doesn't expand/contract.

### Pitfall 4: lofty Picture API Mismatch with lofty 0.22

**What goes wrong:** Using `TaggedFile.tag()` instead of `tagged_file.primary_tag()`, or calling `.pictures()` on a tag that doesn't implement it for the specific format.

**Why it happens:** lofty's API differs between tag types; not all formats use the same picture trait.

**How to avoid:** Use `tagged_file.primary_tag()` which returns the most appropriate tag for the format. Then call `tag.pictures()` — this is available on `Tag` via the `TagExt` trait. Alternatively, use `tagged_file.tags().iter().flat_map(|t| t.pictures())` for robustness.

**Warning signs:** Rust compilation error about missing `pictures()` method on a concrete tag type.

### Pitfall 5: Collapsible Section Height Animation via CSS

**What goes wrong:** Animating `height: 0` to `height: auto` with CSS transitions doesn't work — CSS cannot transition to/from `auto`.

**Why it happens:** A common CSS animation pitfall that catches developers off guard.

**How to avoid:** Use `max-height` transitioning from `0` to a large value (e.g., `max-height: 1000px`) with `overflow: hidden`, or use Framer Motion's `AnimatePresence` + `motion.div` with `initial={{ height: 0 }}` and `animate={{ height: 'auto' }}` (Framer Motion handles this via layout animation).

**Warning signs:** Collapsible sections snap open/closed with no animation.

---

## Code Examples

### 3-Column Now-Playing Bar Structure

```tsx
// Spotify 3-column player bar — replaces current .sc-player__bar
// Source: verified Spotify layout pattern, adapted for existing playerStore

<div className="now-playing-bar">
  {/* LEFT: album art + track info */}
  <div className="now-playing-bar__left">
    <div className="now-playing-bar__artwork" onClick={onExpandArtwork}>
      {artworkUrl
        ? <img src={artworkUrl} alt="" />
        : <div className="now-playing-bar__artwork-placeholder"><Icon name="Music" /></div>
      }
    </div>
    <div className="now-playing-bar__track-info">
      <span className="now-playing-bar__title">{currentTrack?.title}</span>
      <span className="now-playing-bar__artist">{currentTrack?.artist}</span>
      <span className="now-playing-bar__meta">
        {currentTrack?.bpm && `${Math.round(currentTrack.bpm)} BPM`}
        {currentTrack?.musical_key && ` · ${currentTrack.musical_key}`}
        {currentTrack?.genre && ` · ${currentTrack.genre}`}
      </span>
    </div>
  </div>

  {/* CENTER: transport + progress */}
  <div className="now-playing-bar__center">
    <div className="now-playing-bar__controls">
      {/* shuffle, prev, play/pause, next, repeat */}
    </div>
    <div className="now-playing-bar__progress-row">
      <span>{formatTime(position)}</span>
      <div className="now-playing-bar__progress" onMouseDown={handleProgressMouseDown}>
        {/* existing progress bar markup */}
      </div>
      <span>{formatTime(duration)}</span>
    </div>
  </div>

  {/* RIGHT: volume + extras */}
  <div className="now-playing-bar__right">
    {/* volume control, mini player, add to playlist, AI buttons */}
  </div>
</div>
```

CSS layout:
```css
.now-playing-bar {
  display: flex;
  align-items: center;
  height: 88px;          /* Claude's discretion: 88px fits art + 3-column comfortably */
  padding: 0 var(--space-4);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.now-playing-bar__left   { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); }
.now-playing-bar__center { flex: 2; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.now-playing-bar__right  { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); }

.now-playing-bar__artwork {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  overflow: hidden;
  cursor: pointer;
}
```

### Playlist Card Grid (Home View)

```css
/* Source: CSS Grid auto-fill pattern */
.home-playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-5);
  padding: var(--space-6);
}

.playlist-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.playlist-card:hover {
  background: var(--bg-tertiary);
  transform: scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.playlist-card__art {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-3);
}

.playlist-card__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-card__name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Sidebar Collapsible Section with Animation

```tsx
// Using Framer Motion for height: 0 → auto animation
import { AnimatePresence, motion } from 'framer-motion'

function SidebarSection({ title, icon, children }: SidebarSectionProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="sidebar-section">
      <button className="sidebar-section__header" onClick={() => setExpanded(!expanded)}>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS height transitions for collapsibles | Framer Motion `height: 'auto'` via layout animations | framer-motion v6+ | Framer handles the `auto` measurement; CSS cannot |
| `window.location.hash` for SPA routing | State-driven views (already used) | Established in codebase | Phase keeps this pattern; router not introduced |
| onScroll listener for sticky effects | IntersectionObserver API | ~2018 (now universal) | Off-main-thread intersection detection |
| Base64 string IPC for binary | `tauri::ipc::Response` raw bytes | Tauri v2 | Bypasses JSON serialization, faster for images |

**Deprecated/outdated:**
- `.sc-player` CSS class prefix: The current Player.css uses a SoundCloud-inspired naming convention. Phase 8 replaces the entire Player.tsx render output; old CSS can be removed cleanly.
- Top `<header>` bar in App.css (`.app-header`): Phase 8 removes the top bar entirely — logo, scan, and settings move to sidebar top area. The `.app-header` CSS class becomes dead code.

---

## Open Questions

1. **Album art binary invoke return type in Tauri v2**
   - What we know: `tauri::ipc::Response::new(bytes)` is documented for returning raw binary. The frontend receives an `ArrayBuffer` from `invoke()`.
   - What's unclear: Whether `invoke<ArrayBuffer>('get_track_artwork', ...)` requires any special frontend configuration (e.g., `InvokeOptions`), or if Tauri v2 infers the binary response automatically.
   - Recommendation: During 08-02 implementation, test with a simple command first. If `invoke<ArrayBuffer>` doesn't work directly, fall back to base64 string encoded on the Rust side (`use base64::encode`).

2. **Framer Motion `height: 'auto'` performance with long sidebar**
   - What we know: Framer Motion measures the element to animate from/to `auto` height, which requires a layout measurement pass.
   - What's unclear: Whether animating height on a section that contains a large FolderTree (with many nodes) causes visible jank.
   - Recommendation: Test with real library data during 08-01. If performance is poor, fall back to CSS `max-height` transition which avoids Framer layout measurement.

3. **Playlist DJ metadata aggregation (BPM range, key distribution)**
   - What we know: `getPlaylistTracks(id)` returns all tracks with BPM and musical_key fields from the analysis JOIN.
   - What's unclear: Whether computing BPM range and key distribution on the frontend from already-loaded tracks is sufficient, or if a dedicated backend aggregate query is needed.
   - Recommendation: Compute on the frontend from the loaded playlist tracks — avoids a new backend command and the data is already available. The computation is trivial (min/max BPM, count by key).

---

## Sources

### Primary (HIGH confidence)

- Tauri v2 official docs (v2.tauri.app/develop/calling-rust/) — `tauri::ipc::Response` for binary data return
- lofty 0.22 docs.rs (docs.rs/lofty/0.22.0) — `Picture.data()` method for embedded artwork bytes
- Codebase direct read — `src-tauri/Cargo.toml` (lofty 0.22 confirmed), `package.json` (framer-motion 11.18.2 confirmed), `src/components/Player.tsx` (existing player logic), `src/App.tsx` (current state architecture), `src/styles/globals.css` (full token system)

### Secondary (MEDIUM confidence)

- framer-motion AnimatePresence mode documentation (motion.dev/tutorials/react-animate-presence-modes) — mode="wait" sequential animation, mode="sync" default behavior
- Stackademic resizable sidebar article — mousedown/mousemove pattern with localStorage, CSS variable approach verified against multiple sources
- IntersectionObserver for sticky header fade — pattern corroborated by Smashing Magazine and multiple dev.to sources (2021-2024)

### Tertiary (LOW confidence)

- `invoke<ArrayBuffer>` frontend type for binary Tauri IPC response — documented in Tauri issues/discussions but not verified against official v2 API reference. Flag for implementation-time verification.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and version-verified from package.json and Cargo.toml
- Architecture: HIGH — patterns derived from existing codebase code reads + official library docs
- Pitfalls: MEDIUM — derived from known CSS/React patterns and codebase-specific constraints; the lofty API pitfall is LOW (single source)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries; lofty API could shift on minor version bump)
