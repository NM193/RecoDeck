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
