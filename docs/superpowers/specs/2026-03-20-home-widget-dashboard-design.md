# Home Section — Customizable Widget Dashboard

## Overview

Replace the current static HomeView (2 stat cards + playlist grid) with a fully customizable widget dashboard. Users can add, remove, resize, and rearrange widgets on a 4-column snap grid. Layout persists to SQLite.

## Two Modes

### Normal Mode
- Clean dashboard rendering the user's saved widget layout
- Greeting header with date and a "Customize" button top-right
- Widgets are interactive (clickable playlists, action buttons, etc.)

### Edit Mode
- Activated by clicking "Customize"
- Widget catalog sidebar slides in from the left (pushes grid content)
- Placed widgets show: drag handle (top bar), resize corners, delete (X) button
- "Save Layout" persists to SQLite, "Cancel" reverts to last saved state
- Header bar changes to purple accent with "Editing Dashboard" label

## Grid System

- **Engine:** `react-grid-layout` library
- **Columns:** 4
- **Row height:** ~120px
- **Snap:** Widgets snap to grid on drop and resize
- **Compaction:** Vertical (no empty gaps between rows)
- **Drag handle:** Top bar only (widget content remains clickable)
- **Collision:** Widgets push each other when overlapping

## Widget Catalog

| Widget | Default Size | Min | Max | Description |
|--------|-------------|-----|-----|-------------|
| Recently Played | 2x1 | 2x1 | 4x2 | Last played playlists/tracks with timestamps |
| Quick Actions | 2x1 | 2x1 | 4x1 | Shortcut buttons: AI Playlist, Analyze, AI Chat, Import |
| Library Stats | 2x1 | 1x1 | 4x1 | Track count, playlist count, folder count |
| AI Recommendations | 2x1 | 2x1 | 4x2 | Suggested playlists/tracks from AI |
| Recently Added | 4x1 | 2x1 | 4x2 | Horizontal row of newest imports |
| Library Insights | 4x1 | 2x1 | 4x1 | Top genre, BPM range, top key, avg energy |
| Your Playlists | 4x2 | 2x1 | 4x3 | Playlist card grid (migrated from current HomeView) |

## Default Layout (New Users)

```
Row 1: [Recently Played 2x1] [Quick Actions 2x1]
Row 2: [Library Stats 2x1]   [AI Recommendations 2x1]
Row 3: [Recently Added 4x1]
Row 4: [Your Playlists 4x2]
```

## Component Architecture

```
HomeView (dashboard container)
├── DashboardHeader (greeting + date + customize button)
├── WidgetCatalog (sidebar, edit mode only)
└── DashboardGrid (react-grid-layout wrapper)
    ├── WidgetWrapper (edit mode chrome: drag handle, resize, delete)
    │   └── <SpecificWidget />
    ├── WidgetWrapper
    │   └── <SpecificWidget />
    └── ... more widgets
```

## Data Sources Per Widget

| Widget | Data Source | New API Needed? |
|--------|-----------|-----------------|
| Recently Played | `get_recently_played(limit)` | Yes — new command + `play_history` table |
| Quick Actions | Static config, triggers app navigation | No |
| Library Stats | Existing `totalTrackCount` + playlist count + folder count (count `libraryFolders` from settings) | No |
| AI Recommendations | Existing AI store methods, cached | No |
| Recently Added | `get_recently_added(limit)` | Yes — new command, sorts by `date_added` column |
| Library Insights | `get_library_insights()` | Yes — new command, aggregates stats |
| Your Playlists | Existing `playlists` prop | No |

## Backend Changes

### New SQLite Tables

```sql
CREATE TABLE play_history (
  id INTEGER PRIMARY KEY,
  track_id INTEGER REFERENCES tracks(id),
  playlist_id INTEGER REFERENCES playlists(id),  -- nullable: null when playing from All Tracks or folder view
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dashboard_layout (
  id INTEGER PRIMARY KEY DEFAULT 1,
  layout_json TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### New Tauri Commands

| Command | Purpose |
|---------|---------|
| `get_recently_played(limit)` | Returns last N played tracks/playlists with timestamps |
| `get_recently_added(limit)` | Returns tracks sorted by `created_at` DESC |
| `get_library_insights()` | Aggregates top genre, BPM range, top key, avg energy |
| `save_dashboard_layout(json)` | Persists layout to `dashboard_layout` table |
| `get_dashboard_layout()` | Returns saved layout or null (triggers default) |
| `record_play_event(track_id, playlist_id)` | Inserts into `play_history` |

### Integration Point

`record_play_event` must be called from the existing player logic whenever a track starts playing.

## State Management

New Zustand store: `dashboardStore`

```typescript
interface DashboardState {
  layout: LayoutItem[]          // react-grid-layout format
  isEditMode: boolean
  savedLayout: LayoutItem[]     // for cancel/revert
  activeWidgets: string[]       // widget IDs currently on grid

  enterEditMode: () => void
  exitEditMode: () => void
  saveLayout: () => Promise<void>
  cancelEdit: () => void
  addWidget: (widgetId: string) => void
  removeWidget: (widgetId: string) => void
  updateLayout: (layout: LayoutItem[]) => void
  loadLayout: () => Promise<void>
}
```

## File Structure

### New Files
```
src/components/views/widgets/
├── WidgetWrapper.tsx
├── WidgetWrapper.css
├── WidgetCatalog.tsx
├── WidgetCatalog.css
├── DashboardHeader.tsx
├── RecentlyPlayedWidget.tsx
├── QuickActionsWidget.tsx
├── LibraryStatsWidget.tsx
├── AIRecommendationsWidget.tsx
├── RecentlyAddedWidget.tsx
├── LibraryInsightsWidget.tsx
└── PlaylistsWidget.tsx

src/store/dashboardStore.ts

src-tauri/src/commands/dashboard.rs
src-tauri/src/db/migrations/  (new migration)
```

### Modified Files
```
src/components/views/HomeView.tsx    — rewrite as dashboard container
src/components/views/HomeView.css    — rewrite for grid + edit mode styles
src/App.tsx                          — pass new props, wire play recording
src/store/playerStore.ts             — call record_play_event on play
src/lib/tauri-api.ts                 — add new Tauri commands
src-tauri/src/lib.rs                 — register new commands
```

## New Dependencies

- `react-grid-layout` — grid layout engine with drag/drop/resize
- `@types/react-grid-layout` — TypeScript definitions

## Design Decisions

1. **react-grid-layout over custom implementation** — battle-tested, handles collision detection, serialization, responsive breakpoints. Avoids reinventing complex drag-and-drop grid logic.
2. **Single-row dashboard_layout table** — simple, one user per desktop app. JSON blob is flexible for layout schema evolution.
3. **play_history as separate table** — keeps track table clean, enables future features (play counts, listening trends).
4. **Widget catalog as sidebar (not modal)** — users can see the grid while browsing widgets. V1 uses click-to-add (appends widget at next available position). Drag-from-catalog-to-grid can be added later via `react-grid-layout`'s `Droppable` API.
5. **Vertical compaction** — prevents floating widgets with empty space below, keeps dashboard tidy automatically.
