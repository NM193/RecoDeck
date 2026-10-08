# Interactions I2: Menus and Keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidebar's right-click menus become the shared `Menu` (Delete asks in the menu's place), and the app gets its global keys: Space, ⌘→ / ⌘← on whichever player played last, ⌘K, ⌘F, and ⌘/ for a sheet listing them.

**Architecture:**
- **Menu** (`src/components/menu/Menu.tsx`): an optional `heading` — muted, over the items — naming what was right-clicked, as the sidebar's old menus did.
- **Sidebar menus** (`src/components/FolderTree.tsx`): the right-click state holds where and what (`ContextMenuState | null`); `menuEntries()` builds each kind's items for `Menu`. Delete (a playlist or a playlist folder) carries `confirm`, so App's `handleDeletePlaylist` loses its native dialog (and `onDeletePlaylist` takes only the id). The rail's `SidebarFlyout` counts a press on a `.menu` as inside, since `Menu` lives in body. The tree's old two-section render — unused since the sidebar redesign passes `section` everywhere — goes, with its All Tracks menu, the `onAnalyzeAll` prop chain (App's `handleAnalyzeAll`) and the old `.context-menu` styles in `FolderTree.css` and `TrackTable.css`.
- **Pure TypeScript** (tested), `src/lib/shortcuts/shortcuts.ts`: `shortcutFor(press, context)` — which key does what, and when it is someone else's (typing, an overlay open, a control with the keyboard ring keeping Space, a held key); `isTextField`, `ownsSpace`, `focusPageSearch`, `modKeyLabel`, `SHORTCUT_ROWS`.
- **Players** (tested), `src/lib/shortcuts/players.ts`: `trackLastPlayed()` subscribes to the bottom player's `isPlaying` and the set video's panel state and notes which started last; `drivePlayer(action)` sends Space / ⌘→ / ⌘← to the set (`togglePause`, `step`) while it played last and is open, else to the bottom player's buttons, which `NowPlayingBar` hands over with `registerFileControls`.
- **Hook and sheet**: `useShortcuts(actions)` in App (a window `keydown`; a key a component already handled is left alone; it notes whether Tab or a press moved focus last, and skips while tracks are dragged); `ShortcutsSheet` (an overlay). App gets `openSearch()` (the sidebar's Search, now shared with ⌘K). The pages' search boxes carry `data-page-search` for ⌘F.

**Tech Stack:** React 19, TypeScript, zustand, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-interactions-design.md` — "Menus", "Keyboard", "Testing" (shortcut routing), and I1's note on the rest of the spec (I2 menus and keys, I3 the sweep).

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 5 writes them into the spec):
- **`Menu` gets a `heading`**: the sidebar's menus named what was right-clicked ("WARM UP", "PLAYLISTS"); without it a menu on a row that shows no selection would not say whose it is. Only the top panel has one.
- **Delete Folder** (a library folder on disk) keeps its dialog: it asks whether the files go too, which a menu's question cannot. It stays red.
- **The dead render goes**: FolderTree's default branch drew both sections in one panel; every caller passes `section` since the sidebar redesign, so `section` becomes required and the branch, its All Tracks › Analyze All Tracks menu (nothing else opens it), `onAnalyzeAll` from App through Sidebar, and the styles only it used are removed. Home's Analyze all is untouched (its own handler).
- **⌘K on Search** goes to Search's box instead of reloading the page — "on Search" being the view shown (`activeView`), not `showSearch`, which stays true under a DJ page opened from Search. **⌘F** with no search box on the page does nothing (and the WebView's own find stays cancelled).
- **⌘/ with Shift** counts: "/" is Shift+7 on the Serbian and German layouts. "?" (Shift+/ on a US layout) counts too.
- **Whichever played last** is noted from the stores, not from the buttons: a file starting (`isPlaying` false → true) or the video starting (its panel state turning to playing or buffering — a click inside the video too). A set that is closed falls back to the bottom player.
- **Space on a focused control**: only a control that Tab brought focus to, and that shows the keyboard ring (`:focus-visible`), keeps Space; elsewhere Space plays and pauses, also right after clicking a button with the mouse (WebView2 focuses it and can call it `:focus-visible` once a key is pressed; WebKit does not focus it). `preventDefault` stops the WebView scrolling the page.
- **While tracks are dragged** the shortcuts wait (Esc is the drag's).
- **Esc** needs nothing new: the drag layer hears it first (capture, and stops it), then the overlay stack, then the focused track table clears its selection.
- **`Skeleton` moves to I3**, with the loading states it replaces (they sit in the pages I3 sweeps).

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `adec4ab`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` and each task's tests pass at every task's end.
- **Builds and tests:**
  - No Rust change.
  - `vitest`: 13 new. The repo counts 663 after it: 662 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes.
- **In WebKit** (a test page with the real Sidebar and TrackTable, the shortcuts hook, the sheet, a stand-in for the bottom player's buttons, and the real set player store), in the dark Midnight and the light Dawn themes:
  - the collapsed rail's Playlists flyout: a right-click's Rename and Delete (after its question) run, the flyout staying open; a press elsewhere closes it;
  - right-click Warm Up: "WARM UP" over Share playlist, Export to folder, Rename, Delete; Delete: `Delete "Warm Up"? This cannot be undone.` in the menu's place; Delete deletes, nothing else asked; the Sets folder: Create Playlist, Create Folder, Rename, Delete; Esc closes; the Playlists area: "PLAYLISTS" over Create Playlist, Create Folder; the music folder: Analyze Tracks, New Subfolder; House: New Subfolder, Rename Folder, Delete Folder (its dialog, no question in the menu);
  - Space, Space: the bar plays, pauses; a set starts and plays: Space pauses the video, Space (the video paused) plays it again, ⌘→ seeks to the next cue (720 s), ⌘← to the one before (300 s); the bar's file starts: Space pauses the file, Ctrl+→ is the bar's next;
  - typing "a b" in a field types it; a button clicked with the mouse, then Space: plays (also when script focus makes WebKit call it `:focus-visible`); a button reached after Tab, Space: presses the button; a menu open: Space does nothing;
  - ⌘K: Search; ⌘F: the track table's box; ⌘/: the sheet, 11 rows; Space with it open does nothing; ⌘/ closes it, ⇧⌘/ opens it, Esc and a press outside close it.

**Reviewed:** an independent review of the first version (committed as `81eee81`) found one blocker and two should-fix points; all are folded in above and checked:
- **Blocker — a flyout's menu did nothing.** In the collapsed rail, FolderTree sits in `SidebarFlyout`, which closes on any press outside its own DOM; `Menu` lives in body, so pressing an item closed the flyout and unmounted the menu before the click. The flyout now counts a press on `.menu` as inside.
- **⌘K on a DJ page opened from Search** only focused the DJ's track search (`showSearch` stays true underneath) → it asks for the view shown.
- **Space after a click** could press the clicked button on WebView2, which may report `:focus-visible` once a key is pressed → Space is a control's only when Tab moved focus last.
- Also: the shortcuts wait while tracks are dragged; `onDeletePlaylist` takes only the id now.
- Left as it is: ⌘K and ⌘/ do nothing while typing in a field, as the spec's "unless focus is in a text field" says.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/components/menu/Menu.tsx`, `Menu.css` | modify | `heading` |
| `src/components/FolderTree.tsx` | rewrite | menus on `Menu`; the dead render goes |
| `src/components/FolderTree.css`, `src/components/TrackTable.css` | modify | the old menu and render styles go |
| `src/components/layout/Sidebar.tsx`, `src/App.tsx` | modify | `onAnalyzeAll` goes; Delete without the native dialog; `openSearch`, `useShortcuts`, the sheet |
| `src/components/layout/SidebarFlyout.tsx` | modify | a press on a menu is inside |
| `src/lib/shortcuts/shortcuts.ts`, `players.ts` (+ tests), `useShortcuts.ts` | create | the keys |
| `src/components/ShortcutsSheet.tsx`, `ShortcutsSheet.css` | create | ⌘/ |
| `src/components/layout/NowPlayingBar.tsx` | modify | hands over its buttons |
| `src/components/TrackTable.tsx`, `sets/SetsBox.tsx`, `dj/DjTracksTab.tsx`, `views/SearchView.tsx`, `views/StreamingListView.tsx` | modify | `data-page-search` |
| `src/lib/overlays.ts` | modify | its comment |
| `docs/superpowers/specs/2026-10-04-interactions-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `adec4ab`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 649 passed (650)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: A heading on a menu

**Files:** Modify `src/components/menu/Menu.tsx`, `src/components/menu/Menu.css`.

- [ ] **Step 1:**

In `src/components/menu/Menu.tsx`, replace

```tsx
interface MenuProps {
  /** Where it opens: the pointer, for a right-click. */
  at: { x: number; y: number }
  entries: MenuEntry[]
  /** Names the menu for screen readers. */
  label: string
  onClose: () => void
}

export function Menu({ at, entries, label, onClose }: MenuProps) {
  useOverlay(true, onClose)
  const [asking, setAsking] = useState<MenuAction | null>(null)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
```

with

```tsx
interface MenuProps {
  /** Where it opens: the pointer, for a right-click. */
  at: { x: number; y: number }
  entries: MenuEntry[]
  /** Names the menu for screen readers. */
  label: string
  /** Muted over the items: what was right-clicked ("Peak Time"). */
  heading?: string
  onClose: () => void
}

export function Menu({ at, entries, label, heading, onClose }: MenuProps) {
  useOverlay(true, onClose)
  const [asking, setAsking] = useState<MenuAction | null>(null)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
```

In `src/components/menu/Menu.tsx`, replace

```tsx
    ) : (
      <MenuPanel
        entries={entries}
        x={at.x}
        y={at.y}
        label={label}
        takeFocus
        onChoose={(action) => {
          if (action.confirm) {
            setAsking(action)
            return
          }
```

with

```tsx
    ) : (
      <MenuPanel
        entries={entries}
        x={at.x}
        y={at.y}
        label={label}
        heading={heading}
        takeFocus
        onChoose={(action) => {
          if (action.confirm) {
            setAsking(action)
            return
          }
```

In `src/components/menu/Menu.tsx`, replace

```tsx
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
  label: string
  onChoose: (action: MenuAction) => void
  /** A submenu's ←: back to its parent. */
  onBack?: () => void
  /** The menu, and a submenu opened from the keyboard, take the keys. */
  takeFocus?: boolean
  /** A submenu opened from the keyboard starts on its first item. */
```

with

```tsx
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
  label: string
  heading?: string
  onChoose: (action: MenuAction) => void
  /** A submenu's ←: back to its parent. */
  onBack?: () => void
  /** The menu, and a submenu opened from the keyboard, take the keys. */
  takeFocus?: boolean
  /** A submenu opened from the keyboard starts on its first item. */
```

In `src/components/menu/Menu.tsx`, replace

```tsx
function MenuPanel({
  entries,
  x,
  flipX,
  y,
  label,
  onChoose,
  onBack,
  takeFocus = false,
  startActive = false,
  search,
}: MenuPanelProps) {
```

with

```tsx
function MenuPanel({
  entries,
  x,
  flipX,
  y,
  label,
  heading,
  onChoose,
  onBack,
  takeFocus = false,
  startActive = false,
  search,
}: MenuPanelProps) {
```

In `src/components/menu/Menu.tsx`, replace

```tsx
              setQuery(event.target.value)
              setActive(-1)
            }}
            onKeyDown={onSearchKeyDown}
          />
        )}
        {search && shown.length === 0 && <div className="menu__empty">{search.empty}</div>}
        <div className={search ? 'menu__list' : undefined}>
          {shown.map((entry, index) => {
            if (entry.kind === 'separator') {
              return <div key={index} role="separator" className="menu__separator" />
            }
```

with

```tsx
              setQuery(event.target.value)
              setActive(-1)
            }}
            onKeyDown={onSearchKeyDown}
          />
        )}
        {heading && <div className="menu__heading">{heading}</div>}
        {search && shown.length === 0 && <div className="menu__empty">{search.empty}</div>}
        <div className={search ? 'menu__list' : undefined}>
          {shown.map((entry, index) => {
            if (entry.kind === 'separator') {
              return <div key={index} role="separator" className="menu__separator" />
            }
```

In `src/components/menu/Menu.css`, replace

```css

.menu__empty {
  padding: 6px 10px;
  color: var(--text-muted);
}

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}
```

with

```css

.menu__empty {
  padding: 6px 10px;
  color: var(--text-muted);
}

/* What was right-clicked, over the items. */
.menu__heading {
  overflow: hidden;
  padding: 5px 10px 6px;
  color: var(--text-muted);
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/menu/Menu.tsx src/components/menu/Menu.css
git commit -m "feat(menu): a muted heading naming what was right-clicked"
```

---

### Task 2: The sidebar's menus on Menu

**Files:** Rewrite `src/components/FolderTree.tsx`; modify `src/components/FolderTree.css`, `src/components/TrackTable.css`, `src/components/layout/Sidebar.tsx`, `src/components/layout/SidebarFlyout.tsx`, `src/App.tsx`.

- [ ] **Step 1: FolderTree** — the menus on `Menu`, Delete asking in its place; the old render goes

Replace the whole of `src/components/FolderTree.tsx` with:

```tsx
// Folder tree — the sidebar's Folders (scanned library folders with track
// counts) or its Playlists (playlists and playlist folders), one per tree.

import { useState, useEffect } from 'react'
import type { Playlist } from '../types/track'
import {
  useFolderTreeStore,
  type FolderNodeData,
} from '../store/folderTreeStore'
import { Icon } from './Icon'
import { registerDropOpener } from '../lib/drag/trackDrag'
import { Menu, type MenuEntry } from './menu/Menu'
import './FolderTree.css'

// Dragged tracks land on a playlist (added) or a library folder (moved);
// resting on a closed folder opens it (Interactions spec, Drag and drop). The
// rows carry data-drop-open only while closed, so these only ever open.
registerDropOpener('playlist-folder', (id) =>
  useFolderTreeStore.getState().togglePlaylistFolder(Number(id)),
)
registerDropOpener('library-root', (path) => void useFolderTreeStore.getState().toggleRoot(path))
registerDropOpener('library-node', (path) => void useFolderTreeStore.getState().toggleNode(path))

// --- Types ---

/** The refresh handle Sidebar exposes (as `folderTreeRef`) for App. */
export interface FolderTreeRef {
  /** Invalidate cached children for the library root containing `affectedPath`
   *  and re-fetch subdirectories from disk. */
  refreshLibraryRoot: (affectedPath: string) => Promise<void>
}

interface FolderTreeProps {
  libraryFolders: string[]
  playlists: Playlist[]
  selectedFolder: string | null
  selectedPlaylistId: number | null
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onExportPlaylist?: (playlistId: number, playlistName: string) => void
  onCreateSubfolder: (parentPath: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onDeleteFolder: (folderPath: string, folderName: string) => void
  /** The section it draws: the sidebar's Folders or Playlists. */
  section: 'folders' | 'playlists'
}

type ContextMenuType =
  | 'library'
  | 'subfolder'
  | 'playlist-header'
  | 'playlist-item'
  | 'folder-item'

interface ContextMenuState {
  x: number
  y: number
  type: ContextMenuType
  folderPath?: string
  folderName?: string
  playlistId?: number
  playlistName?: string
  playlistParentId?: number | null
}

// --- FolderNode (recursive tree item for library folders) ---

function FolderNode({
  node,
  depth,
  selectedFolder,
  onSelect,
  onToggle,
  onContextMenu,
}: {
  node: FolderNodeData
  depth: number
  selectedFolder: string | null
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onContextMenu: (e: React.MouseEvent, path: string, name: string) => void
}) {
  const isSelected = selectedFolder === node.info.path
  const hasChildren = node.info.has_subfolders
  const isExpanded = node.expanded

  return (
    <div className="folder-node">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.info.path)}
        onContextMenu={(e) => onContextMenu(e, node.info.path, node.info.name)}
        data-drop="folder"
        data-drop-path={node.info.path}
        data-drop-name={node.info.name}
        data-drop-open={hasChildren && !isExpanded ? `library-node:${node.info.path}` : undefined}
      >
        <span
          className={`folder-arrow ${hasChildren ? 'has-children' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(node.info.path)
          }}
        >
          {hasChildren && (
            <Icon
              name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
              size={16}
            />
          )}
        </span>
        <Icon
          name={isExpanded && hasChildren ? 'FolderOpen' : 'Folder'}
          size={16}
          className="folder-icon"
        />
        <span className="folder-name">{node.info.name}</span>
        {node.info.track_count > 0 && (
          <span className="folder-count">({node.info.track_count})</span>
        )}
      </div>

      {isExpanded && node.children && (
        <div className="folder-children">
          {node.children.map((child) => (
            <FolderNode
              key={child.info.path}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className="folder-empty"
              style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
            >
              No subfolders
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Main FolderTree Component ---

export function FolderTree({
  libraryFolders,
  playlists,
  selectedFolder,
  selectedPlaylistId,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onExportPlaylist,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  section,
}: FolderTreeProps) {
  // ===== TRACK COLLECTION state =====
  // Expansion, loaded children and root counts live in a store shared by every
  // tree (split into `folders` and `playlists` data), so they survive
  // collapsing the sidebar and the rail's flyouts (which mount a fresh tree
  // each time). Refreshing is Sidebar's job: it is always mounted.
  const {
    expandedRoots: libraryExpandedRoots,
    nodes: libraryNodes,
    rootCounts,
  } = useFolderTreeStore((s) => s.folders)
  const loadRootCounts = useFolderTreeStore((s) => s.loadRootCounts)
  const toggleLibraryRoot = useFolderTreeStore((s) => s.toggleRoot)
  const toggleLibraryNode = useFolderTreeStore((s) => s.toggleNode)

  // ===== PLAYLISTS state =====
  const expandedPlaylistFolders = useFolderTreeStore(
    (s) => s.playlists.expandedFolders,
  )
  const togglePlaylistFolder = useFolderTreeStore(
    (s) => s.togglePlaylistFolder,
  )

  // ===== CONTEXT MENU =====
  // The shared Menu (Interactions spec, Menus): Esc, a press outside and
  // useOverlay are its own.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Load track counts for library folders (skipped when already known for
  // this list of folders, e.g. when a flyout mounts a new tree)
  useEffect(() => {
    void loadRootCounts(libraryFolders)
  }, [libraryFolders, loadRootCounts])

  // Context menu handlers
  const showContextMenu = (
    e: React.MouseEvent,
    state: Partial<ContextMenuState>,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'library',
      ...state,
    })
  }

  const closeContextMenu = () => setContextMenu(null)

  // Each right-click's items. Delete (a playlist or a playlist folder) has no
  // Undo, so it asks in the menu's place; Delete Folder opens its dialog,
  // which asks whether the files go too.
  function menuEntries(menu: ContextMenuState): MenuEntry[] {
    const folderPath = menu.folderPath ?? ''
    const folderName = menu.folderName ?? ''
    const playlistId = menu.playlistId ?? 0
    const playlistName = menu.playlistName ?? ''
    const deletePlaylist: MenuEntry = {
      kind: 'action',
      label: 'Delete',
      icon: 'Trash2',
      danger: true,
      confirm: { message: `Delete "${playlistName}"? This cannot be undone.`, label: 'Delete' },
      onSelect: () => onDeletePlaylist(playlistId),
    }
    const renamePlaylist: MenuEntry = {
      kind: 'action',
      label: 'Rename',
      icon: 'Pencil',
      onSelect: () => onRenamePlaylist(playlistId, playlistName),
    }
    switch (menu.type) {
      case 'library':
        return [
          { kind: 'action', label: 'Analyze Tracks', icon: 'Zap', onSelect: () => onAnalyzeFolder(folderPath) },
          { kind: 'action', label: 'New Subfolder', icon: 'FolderPlus', onSelect: () => onCreateSubfolder(folderPath) },
        ]
      case 'subfolder':
        return [
          { kind: 'action', label: 'New Subfolder', icon: 'FolderPlus', onSelect: () => onCreateSubfolder(folderPath) },
          {
            kind: 'action',
            label: 'Rename Folder',
            icon: 'Pencil',
            onSelect: () => onRenameFolder(folderPath, folderName),
          },
          { kind: 'separator' },
          {
            kind: 'action',
            label: 'Delete Folder',
            icon: 'Trash2',
            danger: true,
            onSelect: () => onDeleteFolder(folderPath, folderName),
          },
        ]
      case 'playlist-header':
        return [
          { kind: 'action', label: 'Create Playlist', icon: 'Plus', onSelect: () => onCreatePlaylist(null) },
          { kind: 'action', label: 'Create Folder', icon: 'FolderPlus', onSelect: () => onCreateFolder(null) },
        ]
      case 'playlist-item':
        return [
          ...(onSharePlaylist
            ? [
                {
                  kind: 'action',
                  label: 'Share playlist',
                  icon: 'Share2',
                  onSelect: () => onSharePlaylist(playlistId, playlistName),
                } satisfies MenuEntry,
              ]
            : []),
          ...(onExportPlaylist
            ? [
                {
                  kind: 'action',
                  label: 'Export to folder',
                  icon: 'FolderOutput',
                  onSelect: () => onExportPlaylist(playlistId, playlistName),
                } satisfies MenuEntry,
              ]
            : []),
          renamePlaylist,
          deletePlaylist,
        ]
      case 'folder-item':
        return [
          { kind: 'action', label: 'Create Playlist', icon: 'Plus', onSelect: () => onCreatePlaylist(playlistId) },
          { kind: 'action', label: 'Create Folder', icon: 'FolderPlus', onSelect: () => onCreateFolder(playlistId) },
          { kind: 'separator' },
          renamePlaylist,
          deletePlaylist,
        ]
    }
  }

  const menuHeading = (menu: ContextMenuState) =>
    menu.type === 'playlist-header' ? 'Playlists' : (menu.folderName ?? menu.playlistName ?? '')

  const menuEl = contextMenu && (
    <Menu
      at={{ x: contextMenu.x, y: contextMenu.y }}
      entries={menuEntries(contextMenu)}
      heading={menuHeading(contextMenu)}
      label={menuHeading(contextMenu) || 'Sidebar'}
      onClose={closeContextMenu}
    />
  )

  // Helpers
  const getFolderName = (path: string) => {
    const parts = path.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || path
  }

  // Build playlist tree: separate root items and children by parent_id
  const rootPlaylists = playlists.filter((p) => p.parent_id === null)
  const getChildren = (parentId: number) =>
    playlists.filter((p) => p.parent_id === parentId)

  // Render a playlist or folder item
  function renderPlaylistItem(p: Playlist, depth: number) {
    const isFolder = p.playlist_type === 'folder'
    const isExpanded = expandedPlaylistFolders.has(p.id)
    const isSelected = selectedPlaylistId === p.id
    const children = isFolder ? getChildren(p.id) : []

    return (
      <div key={p.id} className="playlist-node">
        <div
          className={`folder-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          // A playlist takes dragged tracks; a playlist folder takes none.
          data-drop={isFolder ? 'none' : 'playlist'}
          data-drop-id={isFolder ? undefined : p.id}
          data-drop-open={isFolder && !isExpanded ? `playlist-folder:${p.id}` : undefined}
          onClick={() => {
            if (isFolder) {
              togglePlaylistFolder(p.id)
            } else {
              onPlaylistSelect(p.id)
            }
          }}
          onContextMenu={(e) =>
            showContextMenu(e, {
              type: isFolder ? 'folder-item' : 'playlist-item',
              playlistId: p.id,
              playlistName: p.name,
              playlistParentId: p.parent_id,
            })
          }
        >
          {/* Arrow for folders */}
          <span
            className={`folder-arrow ${isFolder ? 'has-children' : ''}`}
            onClick={(e) => {
              if (isFolder) {
                e.stopPropagation()
                togglePlaylistFolder(p.id)
              }
            }}
          >
            {isFolder && (
              <Icon
                name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                size={16}
              />
            )}
          </span>

          {/* Icon */}
          <Icon
            name={
              isFolder ? (isExpanded ? 'FolderOpen' : 'Folder') : 'ListMusic'
            }
            size={16}
            className="folder-icon"
          />

          {/* Name */}
          <span className="folder-name">{p.name}</span>

          {/* Track count for playlists */}
          {!isFolder && p.track_count > 0 && (
            <span className="folder-count">({p.track_count})</span>
          )}
        </div>

        {/* Children (for folders) */}
        {isFolder && isExpanded && (
          <div className="folder-children">
            {children.map((child) => renderPlaylistItem(child, depth + 1))}
            {children.length === 0 && (
              <div
                className="folder-empty"
                style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
              >
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ===== Render helpers =====

  function renderFoldersContent() {
    return (
      <div className="folder-tree-section-body">
              {/* Library folder roots */}
              {libraryFolders.map((folderPath) => {
                const isExpanded = libraryExpandedRoots.has(folderPath)
                const name = getFolderName(folderPath)
                const count = rootCounts.get(folderPath) ?? 0
                const children = libraryNodes.get(folderPath)
                const isRootSelected =
                  selectedFolder === folderPath && selectedPlaylistId === null

                return (
                  <div key={folderPath} className="folder-root">
                    <div
                      className={`folder-row root-folder ${isRootSelected ? 'selected' : ''}`}
                      data-drop="folder"
                      data-drop-path={folderPath}
                      data-drop-name={name}
                      data-drop-open={isExpanded ? undefined : `library-root:${folderPath}`}
                      onClick={() => onFolderSelect(folderPath)}
                      onContextMenu={(e) =>
                        showContextMenu(e, {
                          type: 'library',
                          folderPath,
                          folderName: name,
                        })
                      }
                    >
                      <span
                        className="folder-arrow has-children"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLibraryRoot(folderPath)
                        }}
                      >
                        <Icon
                          name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                          size={16}
                        />
                      </span>
                      <Icon
                        name={isExpanded ? 'FolderOpen' : 'Folder'}
                        size={16}
                        className="folder-icon"
                      />
                      <span className="folder-name">{name}</span>
                      {count > 0 && (
                        <span className="folder-count">({count})</span>
                      )}
                    </div>

                    {isExpanded && children && (
                      <div className="folder-children">
                        {children.map((child) => (
                          <FolderNode
                            key={child.info.path}
                            node={child}
                            depth={1}
                            selectedFolder={selectedFolder}
                            onSelect={(p) => onFolderSelect(p)}
                            onToggle={toggleLibraryNode}
                            onContextMenu={(e, path, n) =>
                              showContextMenu(e, {
                                type: libraryFolders.includes(path)
                                  ? 'library'
                                  : 'subfolder',
                                folderPath: path,
                                folderName: n,
                              })
                            }
                          />
                        ))}
                        {children.length === 0 && (
                          <div
                            className="folder-empty"
                            style={{ paddingLeft: '44px' }}
                          >
                            No subfolders
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {libraryFolders.length === 0 && (
                <div className="folder-empty" style={{ paddingLeft: '28px' }}>
                  No library folders yet
                </div>
              )}
            </div>
    )
  }

  function renderPlaylistsContent() {
    return (
      <div
        className="folder-tree-section-body"
        onContextMenu={(e) =>
          showContextMenu(e, {
            type: 'playlist-header',
          })
        }
      >
        {rootPlaylists.map((p) => renderPlaylistItem(p, 0))}
        {rootPlaylists.length === 0 && (
          <div className="folder-empty playlist-empty-hint">
            Right-click to create a playlist
          </div>
        )}
      </div>
    )
  }

  // One section's content (the sidebar draws the header and the scrolling).
  if (section === 'folders') {
    return (
      <>
        {renderFoldersContent()}
        {menuEl}
      </>
    )
  }

  return (
    <>
      {renderPlaylistsContent()}
      {menuEl}
    </>
  )
}
```

- [ ] **Step 2: The styles only the old menus and render used**

In `src/components/FolderTree.css`, replace

```css
/* Folder Tree Panel — Traktor-style left sidebar */
/* Two sections: Track Collection + Explorer (Home) */

.folder-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  overflow: hidden;
  user-select: none;
}

/* --- Scrollable content area --- */

.folder-tree-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* --- Section (Track Collection / Explorer) --- */

.folder-tree-section {
  border-bottom: 1px solid var(--border);
}

.folder-tree-section:last-child {
  border-bottom: none;
}

.folder-tree-section-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.1s ease;
}

.folder-tree-section-header:hover {
  background: var(--surface, var(--bg-tertiary));
}

.section-arrow {
  width: 14px;
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-icon {
  font-size: 13px;
  margin-right: 6px;
  flex-shrink: 0;
  line-height: 1;
}

.folder-tree-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-secondary);
}

.folder-tree-section-body {
  padding: 2px 0 2px 10px;
}

/* --- Folder Rows --- */
```

with

```css
/* src/components/FolderTree.css */
/* The sidebar's Folders and Playlists trees: rows, arrows, counts. */

.folder-tree-section-body {
  padding: 2px 0 2px 10px;
}

/* --- Folder Rows --- */
```

In `src/components/FolderTree.css`, replace

```css
}

.folder-row.selected .folder-arrow {
  color: rgba(255, 255, 255, 0.8);
}

/* "All Tracks" root item */
.root-all {
  padding: 0 12px;
  height: 28px;
  font-weight: 500;
}

/* Root library/explorer folder */
.root-folder {
  font-weight: 500;
}

/* --- Arrow / Expand Toggle --- */
```

with

```css
}

.folder-row.selected .folder-arrow {
  color: rgba(255, 255, 255, 0.8);
}

/* Root library/explorer folder */
.root-folder {
  font-weight: 500;
}

/* --- Arrow / Expand Toggle --- */
```

In `src/components/FolderTree.css`, replace

```css
  font-style: italic;
  height: 24px;
  display: flex;
  align-items: center;
}

/* --- Context Menu --- */

.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.2);
  min-width: 180px;
  padding: 0;
  overflow: hidden;
}

.context-menu-header {
  padding: 8px 12px 6px 12px;
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color 0.1s ease;
  gap: 8px;
}

/* Button reset so <button> items don't use browser default (white) background */
button.context-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  color: var(--text-primary);
  padding: 7px 12px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu-item:hover {
  background: var(--accent);
  color: #ffffff;
}

.context-menu-icon {
  flex-shrink: 0;
}

.context-menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0;
}

.context-menu-item-danger:hover {
  background: var(--color-danger);
}

/* Submenu indicator and styling */
.context-menu-item-submenu {
  position: relative;
  justify-content: space-between;
}

.context-menu-arrow {
  color: var(--text-secondary);
  margin-left: auto;
  flex-shrink: 0;
}

.context-menu-item-submenu:hover .context-menu-arrow {
  color: #ffffff;
}

.context-submenu {
  min-width: 160px;
  max-height: 300px;
  overflow-y: auto;
}

.context-menu-item-disabled {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: not-allowed;
  opacity: 0.5;
  gap: 8px;
}

.context-menu-hint {
  font-size: 10px;
  color: var(--text-secondary);
  margin-left: auto;
  font-style: italic;
}

/* Playlist empty hint */
.playlist-empty-hint {
  padding-left: 28px !important;
  font-style: italic;
}

/* --- Scrollbar styling --- */

.folder-tree-scroll::-webkit-scrollbar {
  width: 8px;
}

.folder-tree-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.folder-tree-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.folder-tree-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

with

```css
  font-style: italic;
  height: 24px;
  display: flex;
  align-items: center;
}

/* Playlist empty hint */
.playlist-empty-hint {
  padding-left: 28px !important;
  font-style: italic;
}
```

In `src/components/TrackTable.css`, replace

```css

.modal-button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* The sidebar's menus (FolderTree) still use these until the Interactions
   plan moves them to the shared Menu; the track table's menu is Menu. */
.context-menu-item-active {
  background: var(--bg-tertiary);
  font-weight: 500;
}

.context-menu-checkmark {
  margin-left: auto;
  color: var(--accent);
  font-weight: bold;
}

button.context-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  color: var(--text-primary);
  padding: 7px 12px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

button.context-menu-item:hover {
  background: var(--accent);
  color: #fff;
}

/* Ensure no gaps in context menu */
.context-menu,
.context-submenu {
  padding: 0;
}

.context-menu > *:first-child,
.context-submenu > *:first-child {
  margin-top: 0;
}

.context-menu > *:last-child,
.context-submenu > *:last-child {
  margin-bottom: 0;
}

/* --- Dragging (track table spec, Dragging) --- */

.data-row--dragging {
  opacity: 0.45;
}
```

with

```css

.modal-button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Dragging (track table spec, Dragging) --- */

.data-row--dragging {
  opacity: 0.45;
}
```

- [ ] **Step 3: `onAnalyzeAll` goes; Delete no longer opens a native dialog; the flyout keeps its menu**

In `src/components/layout/Sidebar.tsx`, replace

```tsx
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onAnalyzeAll: () => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number, name: string) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onExportPlaylist?: (playlistId: number, playlistName: string) => void
  onCreateSubfolder: (parentPath: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onDeleteFolder: (folderPath: string, folderName: string) => void
  folderTreeRef?: React.Ref<FolderTreeRef>
```

with

```tsx
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onExportPlaylist?: (playlistId: number, playlistName: string) => void
  onCreateSubfolder: (parentPath: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onDeleteFolder: (folderPath: string, folderName: string) => void
  folderTreeRef?: React.Ref<FolderTreeRef>
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
  colours,
  onSetColour,
  onResetColour,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onAnalyzeAll,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onExportPlaylist,
```

with

```tsx
  colours,
  onSetColour,
  onResetColour,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onExportPlaylist,
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx

  const treeProps = {
    libraryFolders,
    playlists,
    selectedFolder,
    selectedPlaylistId,
    totalTrackCount,
    onFolderSelect,
    onPlaylistSelect,
    onAnalyzeFolder,
    onAnalyzeAll,
    onCreatePlaylist,
    onCreateFolder,
    onRenamePlaylist,
    onDeletePlaylist,
    onSharePlaylist,
    onExportPlaylist,
```

with

```tsx

  const treeProps = {
    libraryFolders,
    playlists,
    selectedFolder,
    selectedPlaylistId,
    onFolderSelect,
    onPlaylistSelect,
    onAnalyzeFolder,
    onCreatePlaylist,
    onCreateFolder,
    onRenamePlaylist,
    onDeletePlaylist,
    onSharePlaylist,
    onExportPlaylist,
```

In `src/components/layout/SidebarFlyout.tsx`, replace

```tsx
// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// No transform on it or its ancestors: FolderTree's own menus are
// position: fixed, and a transformed ancestor would misplace them.
import { useEffect, useRef, type ReactNode } from 'react'
import { useOverlay } from '../../lib/overlays'

interface SidebarFlyoutProps {
  title: string
  top: number
```

with

```tsx
// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// A menu opened from inside it (FolderTree's right-click, the shared Menu)
// lives in body, and a press on it is not "outside".
import { useEffect, useRef, type ReactNode } from 'react'
import { useOverlay } from '../../lib/overlays'

interface SidebarFlyoutProps {
  title: string
  top: number
```

In `src/components/layout/SidebarFlyout.tsx`, replace

```tsx
  useOverlay(true, onClose)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
```

with

```tsx
  useOverlay(true, onClose)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      if ((target as Element).closest?.('.menu')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
```

In `src/App.tsx`, replace

```tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { confirm } from '@tauri-apps/plugin-dialog'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
```

with

```tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
```

In `src/App.tsx`, replace

```tsx
      toast(deleteFiles ? 'Folder and files deleted' : 'Folder removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Delete playlist/folder — use Tauri's confirm (native dialog)
  async function handleDeletePlaylist(id: number, name: string) {
    const confirmed = await confirm(
      `Delete "${name}"? This cannot be undone.`,
      { title: 'Delete', kind: 'warning' },
    )
    if (!confirmed) return

    try {
      await tauriApi.deletePlaylist(id)

      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null)
        setSelectedFolder(null)
```

with

```tsx
      toast(deleteFiles ? 'Folder and files deleted' : 'Folder removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Delete a playlist or playlist folder: the sidebar's menu asked first,
  // in its place (it has no Undo).
  async function handleDeletePlaylist(id: number) {
    try {
      await tauriApi.deletePlaylist(id)

      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null)
        setSelectedFolder(null)
```

In `src/App.tsx`, replace

```tsx
      await loadTracks()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Analyze all tracks — BPM and Key (parallel batch)
  async function handleAnalyzeAll() {
    if (analyzing) return
    try {
      // Use already-loaded tracks if available, otherwise fetch
      const trackIds =
        tracks.length > 0
          ? tracks.filter((t) => t.id).map((t) => t.id)
          : (await tauriApi.getAllTracks()).filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        toast('No tracks in library', { kind: 'info' })
        return
      }

      await analyzeTrackIds(trackIds)
    } catch (err) {
      // Reading the library failed; analyzeTrackIds reports its own failures.
      setError(err instanceof Error ? err.message : String(err))
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Home's New sets: Mark all seen. Its Undo marks exactly the rows it
  // changed unseen again; Home reads again after each.
  async function handleMarkAllSetsSeen() {
    try {
      const rows = await tauriApi.markAllDjFindsSeen()
      setDataVersion((version) => version + 1)
```

with

```tsx
      await loadTracks()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Home's New sets: Mark all seen. Its Undo marks exactly the rows it
  // changed unseen again; Home reads again after each.
  async function handleMarkAllSetsSeen() {
    try {
      const rows = await tauriApi.markAllDjFindsSeen()
      setDataVersion((version) => version + 1)
```

In `src/App.tsx`, replace

```tsx
      colours={sidebarPrefs.colours}
      onSetColour={sidebarPrefs.setColour}
      onResetColour={sidebarPrefs.resetColour}
      onFolderSelect={handleFolderSelect}
      onPlaylistSelect={handlePlaylistSelect}
      onAnalyzeFolder={handleAnalyzeFolder}
      onAnalyzeAll={handleAnalyzeAll}
      onCreatePlaylist={handleCreatePlaylist}
      onCreateFolder={handleCreateFolder}
      onRenamePlaylist={handleRenamePlaylist}
      onDeletePlaylist={handleDeletePlaylist}
      onSharePlaylist={handleSharePlaylist}
      onExportPlaylist={(id, name) =>
```

with

```tsx
      colours={sidebarPrefs.colours}
      onSetColour={sidebarPrefs.setColour}
      onResetColour={sidebarPrefs.resetColour}
      onFolderSelect={handleFolderSelect}
      onPlaylistSelect={handlePlaylistSelect}
      onAnalyzeFolder={handleAnalyzeFolder}
      onCreatePlaylist={handleCreatePlaylist}
      onCreateFolder={handleCreateFolder}
      onRenamePlaylist={handleRenamePlaylist}
      onDeletePlaylist={handleDeletePlaylist}
      onSharePlaylist={handleSharePlaylist}
      onExportPlaylist={(id, name) =>
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors; `grep -rn "context-menu\|onAnalyzeAll" src`: nothing. Commit:

```bash
git add src/components/FolderTree.tsx src/components/FolderTree.css src/components/TrackTable.css src/components/layout/Sidebar.tsx src/components/layout/SidebarFlyout.tsx src/App.tsx
git commit -m "feat(sidebar): right-click menus on the shared Menu; Delete asks in its place"
```

---

### Task 3: Which key does what, and which player

**Files:** Create `src/lib/shortcuts/shortcuts.ts`, `src/lib/shortcuts/shortcuts.test.ts`, `src/lib/shortcuts/players.ts`, `src/lib/shortcuts/players.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/shortcuts/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTextField, modKeyLabel, ownsSpace, shortcutFor, type KeyPress } from './shortcuts'

const press = (key: string, over: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...over,
})
const free = { typing: false, overlayOpen: false, dragging: false, controlHasSpace: false }

describe('which key does what', () => {
  it('reads the spec table, ⌘ as Ctrl too', () => {
    expect(shortcutFor(press(' '), free)).toBe('play-pause')
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), free)).toBe('next')
    expect(shortcutFor(press('ArrowLeft', { ctrlKey: true }), free)).toBe('previous')
    expect(shortcutFor(press('k', { metaKey: true }), free)).toBe('search')
    expect(shortcutFor(press('f', { ctrlKey: true }), free)).toBe('find')
    expect(shortcutFor(press('/', { metaKey: true }), free)).toBe('sheet')
  })

  it('takes ⌘/ with Shift, as layouts where "/" is Shift+7 type it', () => {
    expect(shortcutFor(press('/', { metaKey: true, shiftKey: true }), free)).toBe('sheet')
    expect(shortcutFor(press('ArrowRight', { metaKey: true, shiftKey: true }), free)).toBeNull()
  })

  it('leaves other keys alone', () => {
    expect(shortcutFor(press('ArrowRight'), free)).toBeNull()
    expect(shortcutFor(press('k'), free)).toBeNull()
    expect(shortcutFor(press(' ', { shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(press('k', { metaKey: true, altKey: true }), free)).toBeNull()
  })

  it('ignores a held key', () => {
    expect(shortcutFor(press(' ', { repeat: true }), free)).toBeNull()
  })

  it('gives way while typing, with a menu, popover or modal open, or while dragging', () => {
    expect(shortcutFor(press(' '), { ...free, typing: true })).toBeNull()
    expect(shortcutFor(press('k', { metaKey: true }), { ...free, typing: true })).toBeNull()
    expect(shortcutFor(press(' '), { ...free, overlayOpen: true })).toBeNull()
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), { ...free, overlayOpen: true })).toBeNull()
    expect(shortcutFor(press(' '), { ...free, dragging: true })).toBeNull()
  })

  it('leaves Space to a control that shows the keyboard ring, not its ⌘ keys', () => {
    expect(shortcutFor(press(' '), { ...free, controlHasSpace: true })).toBeNull()
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), { ...free, controlHasSpace: true })).toBe('next')
  })
})

describe('what focus holds', () => {
  it('knows a text field', () => {
    const text = document.createElement('input')
    const box = document.createElement('input')
    box.type = 'checkbox'
    const area = document.createElement('textarea')
    const div = document.createElement('div')
    expect(isTextField(text)).toBe(true)
    expect(isTextField(area)).toBe(true)
    expect(isTextField(box)).toBe(false)
    expect(isTextField(div)).toBe(false)
    expect(isTextField(null)).toBe(false)
  })

  it('never lets a plain element keep Space, nor a button focus did not reach by Tab', () => {
    expect(ownsSpace(document.createElement('div'), true)).toBe(false)
    expect(ownsSpace(document.body, true)).toBe(false)
    expect(ownsSpace(null, true)).toBe(false)
    expect(ownsSpace(document.createElement('button'), false)).toBe(false)
  })

  it('writes ⌘ as Ctrl on Windows', () => {
    expect(modKeyLabel('MacIntel')).toBe('⌘')
    expect(modKeyLabel('Win32')).toBe('Ctrl')
  })
})
```

Create `src/lib/shortcuts/players.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tauri-api', () => ({
  tauriApi: {
    seekYouTubePanel: vi.fn(() => Promise.resolve()),
    playYouTubePanel: vi.fn(() => Promise.resolve()),
    pauseYouTubePanel: vi.fn(() => Promise.resolve()),
    closeYouTubePanel: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('../audioPlayer', () => ({ audioPlayer: { pause: vi.fn() } }))

import { usePlayerStore } from '../../store/playerStore'
import { useSetPlayer } from '../../store/setPlayerStore'
import type { TracklistResult } from '../tracklist'
import {
  drivePlayer,
  forgetLastPlayed,
  lastPlayed,
  registerFileControls,
  trackLastPlayed,
  whichPlayer,
} from './players'

const aSet = { video: { id: 'v1' }, tracks: [] } as unknown as TracklistResult
const panel = (player_state: number) => ({ position_ms: 0, duration_ms: 3_600_000, player_state })

let stopTracking: () => void
beforeEach(() => {
  usePlayerStore.setState({ isPlaying: false })
  useSetPlayer.setState({ playing: null, panel: null })
  forgetLastPlayed()
  stopTracking = trackLastPlayed()
})
afterEach(() => stopTracking())

describe('which player played last', () => {
  it('is your own files when nothing played, or the set is gone', () => {
    expect(whichPlayer(null, true)).toBe('file')
    expect(whichPlayer('set', false)).toBe('file')
    expect(whichPlayer('file', true)).toBe('file')
    expect(whichPlayer('set', true)).toBe('set')
  })

  it('follows whichever started playing, a click inside the video too', () => {
    usePlayerStore.setState({ isPlaying: true })
    expect(lastPlayed()).toBe('file')
    useSetPlayer.setState({ playing: { result: aSet, startMs: 0 }, panel: panel(1) })
    expect(lastPlayed()).toBe('set')
    // The video paused (by you, or because your file started): it played last until the file plays.
    useSetPlayer.setState({ panel: panel(2) })
    expect(lastPlayed()).toBe('set')
    usePlayerStore.setState({ isPlaying: false })
    usePlayerStore.setState({ isPlaying: true })
    expect(lastPlayed()).toBe('file')
  })
})

describe('Space and ⌘→ / ⌘←', () => {
  it('drive the set while it played last, so a paused video resumes', () => {
    const togglePause = vi.fn()
    const step = vi.fn()
    useSetPlayer.setState({ playing: { result: aSet, startMs: 0 }, panel: panel(1), togglePause, step })
    useSetPlayer.setState({ panel: panel(2) })
    const file = { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() }
    const unregister = registerFileControls(file)

    drivePlayer('play-pause')
    drivePlayer('next')
    drivePlayer('previous')
    expect(togglePause).toHaveBeenCalledTimes(1)
    expect(step.mock.calls).toEqual([[1], [-1]])
    expect(file.playPause).not.toHaveBeenCalled()
    unregister()
  })

  it("drive the bar's buttons otherwise, and nothing once the bar is gone", () => {
    const file = { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() }
    const unregister = registerFileControls(file)
    drivePlayer('play-pause')
    drivePlayer('next')
    drivePlayer('previous')
    expect(file.playPause).toHaveBeenCalledTimes(1)
    expect(file.next).toHaveBeenCalledTimes(1)
    expect(file.previous).toHaveBeenCalledTimes(1)

    unregister()
    drivePlayer('play-pause')
    expect(file.playPause).toHaveBeenCalledTimes(1)
  })
})
```

Run `npx vitest run src/lib/shortcuts`: FAIL — `./shortcuts` and `./players` do not exist.

- [ ] **Step 2: The rules and the players**

Create `src/lib/shortcuts/shortcuts.ts`:

```ts
// src/lib/shortcuts/shortcuts.ts
// The global shortcuts (Interactions spec, Keyboard): which key does what,
// and when a key is someone else's — a text field's, an open menu's, or a
// control's that shows the keyboard ring (its own Space). ⌘ is Ctrl on
// Windows, as the sidebar's ⌘\ already reads it.

export type Shortcut = 'play-pause' | 'next' | 'previous' | 'search' | 'find' | 'sheet'

export interface KeyPress {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export interface ShortcutContext {
  /** Focus is in a text field: its keys are its own. */
  typing: boolean
  /** A menu, popover or modal is open. */
  overlayOpen: boolean
  /** Tracks are being dragged: Esc is the drag's, the rest waits. */
  dragging: boolean
  /** A control showing the keyboard ring has focus: Space is its own. */
  controlHasSpace: boolean
}

/** What a key press does here, or null when it is not a global shortcut now. */
export function shortcutFor(press: KeyPress, context: ShortcutContext): Shortcut | null {
  if (press.repeat || press.altKey || context.typing || context.overlayOpen || context.dragging) return null
  if (!press.metaKey && !press.ctrlKey) {
    if (press.key === ' ' && !press.shiftKey && !context.controlHasSpace) return 'play-pause'
    return null
  }
  // "/" takes Shift on many layouts (Shift+7 on a Serbian or German one).
  if (press.key === '/' || press.key === '?') return 'sheet'
  if (press.shiftKey) return null
  switch (press.key) {
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'previous'
    case 'k':
    case 'K':
      return 'search'
    case 'f':
    case 'F':
      return 'find'
  }
  return null
}

const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

/** A text field: a text input, a textarea, or editable text. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable === true
}

const SPACE_CONTROLS = [
  'button',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select',
  'summary',
].join(', ')

/**
 * A control that keeps its own Space: one reached from the keyboard (Tab)
 * that shows the keyboard ring. A button just clicked with the mouse does
 * not — WebView2 focuses it, and can call it :focus-visible once a key is
 * pressed — so Space still plays and pauses.
 */
export function ownsSpace(el: Element | null, focusFromKeyboard: boolean): boolean {
  if (!focusFromKeyboard || !el || !el.matches(SPACE_CONTROLS)) return false
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/** ⌘F: the page's own search box (marked `data-page-search`), focused with its text selected. */
export function focusPageSearch(): boolean {
  const box = [...document.querySelectorAll<HTMLInputElement>('[data-page-search]')].find(
    (el) => el.getClientRects().length > 0,
  )
  if (!box) return false
  box.focus()
  box.select()
  return true
}

/** "⌘" on macOS, "Ctrl" on Windows: how the sheet writes the key. */
export function modKeyLabel(platform: string = navigator.platform): string {
  return platform.startsWith('Win') ? 'Ctrl' : '⌘'
}

/** The sheet's rows (⌘/), in the spec's order. "⌘" is written as `modKeyLabel()`. */
export const SHORTCUT_ROWS: ReadonlyArray<{ keys: string[]; does: string }> = [
  { keys: ['Space'], does: 'Play or pause — the player or the set, whichever played last' },
  { keys: ['⌘', '→'], does: 'Next track' },
  { keys: ['⌘', '←'], does: 'Previous track' },
  { keys: ['⌘', 'K'], does: 'Search' },
  { keys: ['⌘', 'F'], does: "Find on this page: the page's search box" },
  { keys: ['⌘', '\\'], does: 'Collapse or open the sidebar' },
  { keys: ['⌘', '/'], does: 'These shortcuts' },
  { keys: ['Esc'], does: 'Cancel a drag, close a menu, or clear the selection' },
  { keys: ['↑', '↓'], does: 'In a track list: move the selection (Shift adds to it)' },
  { keys: ['Enter'], does: 'In a track list: play the selected track' },
  { keys: ['⌘', 'A'], does: 'In a track list: select every row shown' },
]
```

Create `src/lib/shortcuts/players.ts`:

```ts
// src/lib/shortcuts/players.ts
// Which player Space and ⌘→ / ⌘← drive (Interactions spec, Keyboard): the one
// that played last — your own files (the bottom player) or the set video —
// so pausing the video and pressing Space again resumes the video.
import { usePlayerStore } from '../../store/playerStore'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'

export type PlayerKind = 'file' | 'set'

/** The bottom player's buttons. */
export interface FileControls {
  playPause: () => void
  next: () => void
  previous: () => void
}

let last: PlayerKind | null = null
let fileControls: FileControls | null = null

/** The bottom player hands over its buttons while it is mounted; the answer takes them back. */
export function registerFileControls(controls: FileControls): () => void {
  fileControls = controls
  return () => {
    if (fileControls === controls) fileControls = null
  }
}

/** Notes which player starts playing (a click inside the video counts too); the answer stops. */
export function trackLastPlayed(): () => void {
  const offFile = usePlayerStore.subscribe((state, before) => {
    if (state.isPlaying && !before.isPlaying) last = 'file'
  })
  const offSet = useSetPlayer.subscribe((state, before) => {
    if (videoIsPlaying(state.panel) && !videoIsPlaying(before.panel)) last = 'set'
  })
  return () => {
    offFile()
    offSet()
  }
}

export function lastPlayed(): PlayerKind | null {
  return last
}

/** Tests: nothing has played. */
export function forgetLastPlayed(): void {
  last = null
}

/** The set video when it played last and is still open; else your own files. */
export function whichPlayer(lastKind: PlayerKind | null, setOpen: boolean): PlayerKind {
  return lastKind === 'set' && setOpen ? 'set' : 'file'
}

/** Space, ⌘→ or ⌘←, on whichever player played last: the set's ⏯ ⏭ ⏮, or the bar's. */
export function drivePlayer(action: 'play-pause' | 'next' | 'previous'): void {
  const set = useSetPlayer.getState()
  if (whichPlayer(last, set.playing !== null) === 'set') {
    if (action === 'play-pause') set.togglePause()
    else set.step(action === 'next' ? 1 : -1)
    return
  }
  if (action === 'play-pause') fileControls?.playPause()
  else if (action === 'next') fileControls?.next()
  else fileControls?.previous()
}
```

- [ ] **Step 3:** `npx vitest run src/lib/shortcuts`: PASS, 13. Commit:

```bash
git add src/lib/shortcuts/shortcuts.ts src/lib/shortcuts/shortcuts.test.ts src/lib/shortcuts/players.ts src/lib/shortcuts/players.test.ts
git commit -m "feat(keys): which key does what, and which player played last"
```

---

### Task 4: The keys in the app

**Files:** Create `src/lib/shortcuts/useShortcuts.ts`, `src/components/ShortcutsSheet.tsx`, `src/components/ShortcutsSheet.css`; modify `src/App.tsx`, `src/components/layout/NowPlayingBar.tsx`, `src/lib/overlays.ts`, `src/components/TrackTable.tsx`, `src/components/sets/SetsBox.tsx`, `src/components/dj/DjTracksTab.tsx`, `src/components/views/SearchView.tsx`, `src/components/views/StreamingListView.tsx`.

- [ ] **Step 1: The hook and the sheet**

Create `src/lib/shortcuts/useShortcuts.ts`:

```ts
// src/lib/shortcuts/useShortcuts.ts
// App's global keys (Interactions spec, Keyboard). A key a component already
// handled (preventDefault) is left alone; Esc is the overlays', the drag
// layer's and the track table's own.
import { useEffect, useRef } from 'react'
import { isOverlayOpen } from '../overlays'
import { useTrackDragStore } from '../drag/trackDrag'
import { drivePlayer, trackLastPlayed } from './players'
import { focusPageSearch, isTextField, ownsSpace, shortcutFor } from './shortcuts'

export interface ShortcutActions {
  openSearch: () => void
  toggleSheet: () => void
}

export function useShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })

  useEffect(() => trackLastPlayed(), [])

  // How focus last moved: Tab, or a press (which may focus a button).
  const focusFromKeyboard = useRef(false)
  useEffect(() => {
    const onPointerDown = () => {
      focusFromKeyboard.current = false
    }
    const onTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') focusFromKeyboard.current = true
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onTab, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onTab, true)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const focused = document.activeElement
      const shortcut = shortcutFor(event, {
        typing: isTextField(focused),
        overlayOpen: isOverlayOpen(),
        dragging: useTrackDragStore.getState().payload !== null,
        controlHasSpace: ownsSpace(focused, focusFromKeyboard.current),
      })
      if (!shortcut) return
      // Also the WebView's own: Space scrolling the page, ⌘F's find.
      event.preventDefault()
      if (shortcut === 'play-pause' || shortcut === 'next' || shortcut === 'previous') drivePlayer(shortcut)
      else if (shortcut === 'search') actionsRef.current.openSearch()
      else if (shortcut === 'find') focusPageSearch()
      else actionsRef.current.toggleSheet()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
```

Create `src/components/ShortcutsSheet.tsx`:

```tsx
// src/components/ShortcutsSheet.tsx
// ⌘/: the keyboard shortcuts on a small sheet (Interactions spec, Keyboard).
// An overlay: Esc, a press outside, ✕ or ⌘/ again closes it.
import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '../lib/overlays'
import { SHORTCUT_ROWS, modKeyLabel } from '../lib/shortcuts/shortcuts'
import { Icon } from './Icon'
import './ShortcutsSheet.css'

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  useOverlay(true, onClose)
  const titleId = useId()

  // ⌘/ closes it too (the global shortcuts give way while it is open).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === '/' || event.key === '?')) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const mod = modKeyLabel()
  return createPortal(
    <div
      className="shortcuts-sheet__backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="shortcuts-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="shortcuts-sheet__head">
          <h2 id={titleId} className="shortcuts-sheet__title">
            Keyboard shortcuts
          </h2>
          <button type="button" className="link-btn" aria-label="Close" onClick={onClose}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <dl className="shortcuts-sheet__list">
          {SHORTCUT_ROWS.map((row) => (
            <div className="shortcuts-sheet__row" key={row.does}>
              <dt className="shortcuts-sheet__keys">
                {row.keys.map((key) => (
                  <kbd key={key}>{key === '⌘' ? mod : key}</kbd>
                ))}
              </dt>
              <dd className="shortcuts-sheet__does">{row.does}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  )
}
```

Create `src/components/ShortcutsSheet.css`:

```css
/* src/components/ShortcutsSheet.css */
/* ⌘/: a small card over a dimmed window, the keys as caps. */

.shortcuts-sheet__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.45);
  animation: shortcuts-fade-in var(--motion-base) var(--ease);
}

.shortcuts-sheet {
  width: min(460px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 16px 18px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.55);
  color: var(--text-primary);
  animation: shortcuts-in var(--motion-base) var(--ease);
}

@keyframes shortcuts-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes shortcuts-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shortcuts-sheet {
    animation-name: shortcuts-fade-in;
    animation-duration: var(--motion-fast);
  }
}

.shortcuts-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.shortcuts-sheet__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
}

.shortcuts-sheet__list {
  margin: 0;
}

.shortcuts-sheet__row {
  display: grid;
  grid-template-columns: 112px 1fr;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.shortcuts-sheet__keys {
  display: flex;
  gap: 4px;
}

.shortcuts-sheet__keys kbd {
  min-width: 22px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 7%);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-xs, 11px);
  text-align: center;
}

.shortcuts-sheet__does {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.4;
}
```

- [ ] **Step 2: App** — `openSearch` (the sidebar's and ⌘K's), the hook, the sheet

In `src/App.tsx`, replace

```tsx
import { importSet, setsToAutoImport } from './lib/tracklist/importSet'
import type { ChannelNews } from './types/youtube'
import { getErrorMessage } from './types/ai'
import type { TrackFilter } from './lib/trackTable/filter'
import appPackage from '../package.json'
import { UpdateToast } from './components/UpdateToast'
import {
  AnalysisProgress,
  type AnalysisProgressData,
} from './components/AnalysisProgress'
// import { PlayerAIChat } from './components/ai/PlayerAIChat'
import { AIPlaylistDialog } from './components/ai/AIPlaylistDialog'
```

with

```tsx
import { importSet, setsToAutoImport } from './lib/tracklist/importSet'
import type { ChannelNews } from './types/youtube'
import { getErrorMessage } from './types/ai'
import type { TrackFilter } from './lib/trackTable/filter'
import appPackage from '../package.json'
import { UpdateToast } from './components/UpdateToast'
import { ShortcutsSheet } from './components/ShortcutsSheet'
import {
  AnalysisProgress,
  type AnalysisProgressData,
} from './components/AnalysisProgress'
// import { PlayerAIChat } from './components/ai/PlayerAIChat'
import { AIPlaylistDialog } from './components/ai/AIPlaylistDialog'
```

In `src/App.tsx`, replace

```tsx
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
import { tauriApi } from './lib/tauri-api'
import { dismissToast, toast } from './lib/toast'
import { audioPlayer } from './lib/audioPlayer'
import { evictArtworkCache } from './lib/artworkCache'
import { thumbnails } from './lib/thumbnails/thumbnails'
import {
  folderName,
  movedMessage,
```

with

```tsx
import type { ActiveView } from './lib/sidebarPrefs'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
import { tauriApi } from './lib/tauri-api'
import { dismissToast, toast } from './lib/toast'
import { useShortcuts } from './lib/shortcuts/useShortcuts'
import { focusPageSearch } from './lib/shortcuts/shortcuts'
import { audioPlayer } from './lib/audioPlayer'
import { evictArtworkCache } from './lib/artworkCache'
import { thumbnails } from './lib/thumbnails/thumbnails'
import {
  folderName,
  movedMessage,
```

In `src/App.tsx`, replace

```tsx
  // What's New dialog state
  const [whatsNew, setWhatsNew] = useState<{
    version: string
    changes: VersionChanges
  } | null>(null)

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressData | null>(null)
  const analysisStartTimeRef = useRef<number>(0)

  // Scan progress state (global, survives Settings unmount)
```

with

```tsx
  // What's New dialog state
  const [whatsNew, setWhatsNew] = useState<{
    version: string
    changes: VersionChanges
  } | null>(null)

  // The global keys (Interactions spec, Keyboard): ⌘K opens Search (on
  // Search, its box), ⌘/ the shortcuts sheet; Space and ⌘→ / ⌘← drive
  // whichever player played last.
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useShortcuts({
    // The view shown, not showSearch: that stays true under a DJ page opened from Search.
    openSearch: () => (activeView === 'search' ? void focusPageSearch() : openSearch()),
    toggleSheet: () => setShortcutsOpen((open) => !open),
  })

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressData | null>(null)
  const analysisStartTimeRef = useRef<number>(0)

  // Scan progress state (global, survives Settings unmount)
```

In `src/App.tsx`, replace

```tsx
    }
    setShowSearch(djPage.from.view === 'search')
    setShowSets(false)
    setDjPage(null)
  }

  // Sets, arriving on a set's page or with a DJ's name in its box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setSetsVisit((visit) => visit + 1)
```

with

```tsx
    }
    setShowSearch(djPage.from.view === 'search')
    setShowSets(false)
    setDjPage(null)
  }

  // Search, from the sidebar or ⌘K: the other views close.
  function openSearch() {
    setShowSearch(true)
    setStreamList(null)
    setDjPage(null)
    setShowSets(false)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowAIChat(false)
    loadTracks(null, null)
  }

  // Sets, arriving on a set's page or with a DJ's name in its box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setSetsVisit((visit) => visit + 1)
```

In `src/App.tsx`, replace

```tsx
        setShowSettings(false)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
      }}
      onShowAllTracks={() => openAllTracks()}
      onSearch={() => {
        setShowSearch(true)
        setStreamList(null)
        setDjPage(null)
        setShowSets(false)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setTableFilter(null)
        setShowSettings(false)
        setShowAIChat(false)
        loadTracks(null, null)
      }}
      onNavigateSets={() => {
        // Sets already showing keeps its start: a new one would remount it and lose its state.
        const setsShowing =
          showSets &&
          djPage === null &&
          shownSpotifyList === null &&
```

with

```tsx
        setShowSettings(false)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
      }}
      onShowAllTracks={() => openAllTracks()}
      onSearch={openSearch}
      onNavigateSets={() => {
        // Sets already showing keeps its start: a new one would remount it and lose its state.
        const setsShowing =
          showSets &&
          djPage === null &&
          shownSpotifyList === null &&
```

In `src/App.tsx`, replace

```tsx
            }
          }}
          onLater={() => setPendingUpdate(null)}
        />
      )}

      {/* What's New dialog */}
      {whatsNew && (
        <WhatsNewDialog
          version={whatsNew.version}
          changes={whatsNew.changes}
          onClose={() => setWhatsNew(null)}
```

with

```tsx
            }
          }}
          onLater={() => setPendingUpdate(null)}
        />
      )}

      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}

      {/* What's New dialog */}
      {whatsNew && (
        <WhatsNewDialog
          version={whatsNew.version}
          changes={whatsNew.changes}
          onClose={() => setWhatsNew(null)}
```

- [ ] **Step 3: The bar hands over its buttons**

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import { useOverlay } from '../../lib/overlays'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

with

```tsx
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import { useOverlay } from '../../lib/overlays'
import { registerFileControls } from '../../lib/shortcuts/players'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
  }

  handlePlayPauseRef.current = handlePlayPause
  handlePreviousRef.current = handlePrevious
  handleNextRef.current = handleNext

  // Emit player state for mini player window
  useEffect(() => {
    const unReq = listen('request-player-state', () => {
      const s = usePlayerStore.getState()
      emit('player-state', {
        currentTrack: s.currentTrack,
```

with

```tsx
  }

  handlePlayPauseRef.current = handlePlayPause
  handlePreviousRef.current = handlePrevious
  handleNextRef.current = handleNext

  // Space and ⌘→ / ⌘← (useShortcuts) reach these buttons while the bar is here.
  useEffect(
    () =>
      registerFileControls({
        playPause: () => handlePlayPauseRef.current(),
        next: () => handleNextRef.current(),
        previous: () => handlePreviousRef.current(),
      }),
    [],
  )

  // Emit player state for mini player window
  useEffect(() => {
    const unReq = listen('request-player-state', () => {
      const s = usePlayerStore.getState()
      emit('player-state', {
        currentTrack: s.currentTrack,
```

In `src/lib/overlays.ts`, replace

```ts
// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. The set video reads `isOverlayOpen()` every frame while a set
// plays (it steps off the window); global shortcuts will once their plan
// builds them.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []
```

with

```ts
// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. The set video reads `isOverlayOpen()` every frame while a set
// plays (it steps off the window); the global shortcuts (useShortcuts) give
// way while one is open.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []
```

- [ ] **Step 4: The pages' search boxes, for ⌘F**

In `src/components/TrackTable.tsx`, replace

```tsx
          <div className="search-input-wrapper">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
```

with

```tsx
          <div className="search-input-wrapper">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search tracks..."
              data-page-search
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
```

In `src/components/sets/SetsBox.tsx`, replace

```tsx
    <div className="sets-box">
      <div className="sets-box__field">
        <Icon name="Search" size={16} className="sets-box__icon" />
        <input
          className="sets-box__input"
          placeholder="Paste a set link, or type a DJ's name"
          value={value}
          autoFocus={autoFocus}
          role="combobox"
          aria-label="Paste a set link, or type a DJ's name"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
```

with

```tsx
    <div className="sets-box">
      <div className="sets-box__field">
        <Icon name="Search" size={16} className="sets-box__icon" />
        <input
          className="sets-box__input"
          placeholder="Paste a set link, or type a DJ's name"
          data-page-search
          value={value}
          autoFocus={autoFocus}
          role="combobox"
          aria-label="Paste a set link, or type a DJ's name"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
```

In `src/components/dj/DjTracksTab.tsx`, replace

```tsx
            <Icon name="Search" size={14} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search their tracks…"
              spellCheck={false}
            />
          </label>
          <StatusChips
            counts={counts}
            filter={filter}
```

with

```tsx
            <Icon name="Search" size={14} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search their tracks…"
              data-page-search
              spellCheck={false}
            />
          </label>
          <StatusChips
            counts={counts}
            filter={filter}
```

In `src/components/views/SearchView.tsx`, replace

```tsx
        <div className="search-view__input-wrapper">
          <Icon name="Search" size={20} className="search-view__input-icon" />
          <input
            type="text"
            className="search-view__input"
            placeholder="Search tracks, playlists, artists..."
            value={query}
            onChange={(e) => {
              // Typing leaves Customize unsaved, as Cancel does.
              setCustomizing(false)
              onQueryChange(e.target.value)
            }}
```

with

```tsx
        <div className="search-view__input-wrapper">
          <Icon name="Search" size={20} className="search-view__input-icon" />
          <input
            type="text"
            className="search-view__input"
            placeholder="Search tracks, playlists, artists..."
            data-page-search
            value={query}
            onChange={(e) => {
              // Typing leaves Customize unsaved, as Cancel does.
              setCustomizing(false)
              onQueryChange(e.target.value)
            }}
```

In `src/components/views/StreamingListView.tsx`, replace

```tsx
          <Icon name="Search" size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title}…`}
            spellCheck={false}
          />
        </label>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
```

with

```tsx
          <Icon name="Search" size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title}…`}
            data-page-search
            spellCheck={false}
          />
        </label>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
```

- [ ] **Step 5:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 662 passed (663)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/lib/shortcuts/useShortcuts.ts src/components/ShortcutsSheet.tsx src/components/ShortcutsSheet.css src/App.tsx src/components/layout/NowPlayingBar.tsx src/lib/overlays.ts src/components/TrackTable.tsx src/components/sets/SetsBox.tsx src/components/dj/DjTracksTab.tsx src/components/views/SearchView.tsx src/components/views/StreamingListView.tsx
git commit -m "feat(keys): Space, ⌘→ / ⌘←, ⌘K, ⌘F and the ⌘/ sheet"
```

---

### Task 5: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-interactions-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-interactions-design.md`, replace

```markdown
  Delete folder asking in its place; `useShortcuts`, the shortcuts sheet and
  "whichever played last"; `Skeleton`. **I3** (the sweep): every
  `transition:` on the tokens; `.btn--icon`, `.btn--pill` and the `Button`
  component with its working state; Settings, the DJ pages and the modals on
  the shared controls.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

with

```markdown
  Delete folder asking in its place; `useShortcuts`, the shortcuts sheet and
  "whichever played last"; `Skeleton`. **I3** (the sweep): every
  `transition:` on the tokens; `.btn--icon`, `.btn--pill` and the `Button`
  component with its working state; Settings, the DJ pages and the modals on
  the shared controls.

**As built by plan I2** (menus and keys):
- The sidebar's right-click menus (Folders, Playlists) are the shared
  `Menu`, with a muted heading naming what was right-clicked (`heading`, new
  on `Menu`). Delete — a playlist or a playlist folder — asks in the menu's
  place (`Delete "Warm Up"? This cannot be undone.`), and App's native
  dialog for it goes; Delete Folder still opens its dialog, which asks
  whether the files go too. In the rail's flyouts the menu works the same:
  the flyout counts a press on a menu as inside. FolderTree's old
  two-section render, unused since the sidebar redesign, goes with its All
  Tracks menu (App's `handleAnalyzeAll`) and the old `.context-menu`
  styles.
- `useShortcuts` (in App) reads keys through `shortcutFor`: Space, ⌘→ / ⌘←,
  ⌘K, ⌘F and ⌘/ (with or without Shift: "/" is Shift+7 on some layouts); ⌘
  is Ctrl too. They give way while typing, while any overlay is open, while
  tracks are dragged, and to a key a component already handled. Space stays
  a control's only when Tab brought focus there and it shows the keyboard
  ring — a button just clicked never keeps it (WebView2 can call it
  :focus-visible once a key is pressed). Held keys are ignored.
- Whichever played last: `trackLastPlayed` notes which player starts
  playing — the bottom player's `isPlaying`, or the set video's state (a
  click inside the video counts). Space and ⌘→ / ⌘← drive the set
  (`togglePause`, `step`) while it played last and is open, else the bottom
  player's buttons, which NowPlayingBar hands over (`registerFileControls`).
- ⌘K opens Search; on Search (the view shown, not a DJ page opened from
  it) it goes to its box. ⌘F focuses the page's
  search box — the inputs marked `data-page-search` (the track table,
  Search, Sets' box, a DJ's tracks, a streaming list) — its text selected.
- ⌘/ opens the shortcuts sheet (`ShortcutsSheet`): the table above, ⌘
  written as Ctrl on Windows; Esc, a press outside, ✕ or ⌘/ closes it.
- Esc keeps its order through what exists: the drag layer hears it first,
  then the overlay stack (`useOverlay`), then the focused track table.
- `Skeleton` moves to I3, with the loading states it replaces.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-interactions-design.md
git commit -m "docs(spec): Interactions I2 as built"
```

---

### Task 6: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 662 passed (663)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`; `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 462 passed (unchanged).
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Right-click a playlist in the sidebar: its name on top, then Share, Export, Rename, Delete; Delete asks in the menu (Cancel keeps it). Right-click a library subfolder: Delete Folder still opens the dialog with the files choice.
  - Collapse the sidebar (⌘\), open the Playlists flyout, right-click a playlist: Rename works from there.
  - Play a track; click somewhere empty; Space pauses and plays. Click a button (e.g. Filter), then Space: it still plays / pauses — on Windows too, where the button takes focus.
  - Play a set (Sets › a set › Play set); Space pauses the video, Space resumes it; ⌘→ / ⌘← jump between its tracks. Play a file again: Space is the file's.
  - Type in a search box: Space types a space.
  - ⌘K: Search, with its box ready; ⌘F on All Tracks: the table's search box; ⌘/: the sheet (Ctrl on Windows); Esc closes it.
