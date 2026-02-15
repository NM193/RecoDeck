// Folder tree panel — Traktor-style left sidebar
// Two sections:
//   1. Track Collection — scanned library folders with track counts
//   2. Playlists — user-created playlists and folders

import { useState, useEffect, useCallback, useRef } from "react";
import { tauriApi } from "../lib/tauri-api";
import type { FolderInfo, Playlist } from "../types/track";
import { Icon } from "./Icon";
import "./FolderTree.css";

// --- Types ---

interface FolderTreeProps {
  libraryFolders: string[];
  playlists: Playlist[];
  selectedFolder: string | null;
  selectedPlaylistId: number | null;
  totalTrackCount?: number;
  onFolderSelect: (folderPath: string | null) => void;
  onPlaylistSelect: (playlistId: number) => void;
  onAnalyzeFolder: (folderPath: string) => void;
  onAnalyzeAll: () => void;
  onCreatePlaylist: (parentId: number | null) => void;
  onCreateFolder: (parentId: number | null) => void;
  onRenamePlaylist: (id: number, currentName: string) => void;
  onDeletePlaylist: (id: number, name: string) => void;
}

interface FolderNodeData {
  info: FolderInfo;
  children: FolderNodeData[] | null;
  expanded: boolean;
}

type ContextMenuType = "all-tracks" | "library" | "playlist-header" | "playlist-item" | "folder-item";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: ContextMenuType;
  folderPath?: string;
  folderName?: string;
  playlistId?: number;
  playlistName?: string;
  playlistParentId?: number | null;
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
  node: FolderNodeData;
  depth: number;
  selectedFolder: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, name: string) => void;
}) {
  const isSelected = selectedFolder === node.info.path;
  const hasChildren = node.info.has_subfolders;
  const isExpanded = node.expanded;

  return (
    <div className="folder-node">
      <div
        className={`folder-row ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.info.path)}
        onContextMenu={(e) =>
          onContextMenu(e, node.info.path, node.info.name)
        }
      >
        <span
          className={`folder-arrow ${hasChildren ? "has-children" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.info.path);
          }}
        >
          {hasChildren && <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={16} />}
        </span>
        <Icon
          name={isExpanded && hasChildren ? "FolderOpen" : "Folder"}
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
  );
}

// --- Main FolderTree Component ---

export function FolderTree({
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
}: FolderTreeProps) {
  // ===== TRACK COLLECTION state =====
  const [libraryNodes, setLibraryNodes] = useState<
    Map<string, FolderNodeData[]>
  >(new Map());
  const [libraryExpandedRoots, setLibraryExpandedRoots] = useState<
    Set<string>
  >(new Set());
  const [rootCounts, setRootCounts] = useState<Map<string, number>>(new Map());
  const [collectionExpanded, setCollectionExpanded] = useState(true);

  // ===== PLAYLISTS state =====
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);
  const [expandedPlaylistFolders, setExpandedPlaylistFolders] = useState<
    Set<number>
  >(new Set());

  // ===== CONTEXT MENU =====
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: "library",
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load track counts for library folders
  useEffect(() => {
    async function loadRootCounts() {
      const counts = new Map<string, number>();
      for (const folder of libraryFolders) {
        try {
          const count = await tauriApi.countTracksInFolder(folder);
          counts.set(folder, count);
        } catch {
          counts.set(folder, 0);
        }
      }
      setRootCounts(counts);
    }
    if (libraryFolders.length > 0) {
      loadRootCounts();
    }
  }, [libraryFolders]);

  // Load subdirectories
  const loadSubdirectories = useCallback(
    async (folderPath: string): Promise<FolderNodeData[]> => {
      try {
        const folders = await tauriApi.listSubdirectories(folderPath);
        return folders.map((info) => ({
          info,
          children: null,
          expanded: false,
        }));
      } catch (err) {
        console.warn("Failed to list subdirectories:", err);
        return [];
      }
    },
    []
  );

  // Toggle library root
  const toggleLibraryRoot = useCallback(
    async (rootPath: string) => {
      setLibraryExpandedRoots((prev) => {
        const next = new Set(prev);
        if (next.has(rootPath)) next.delete(rootPath);
        else next.add(rootPath);
        return next;
      });
      if (!libraryNodes.has(rootPath)) {
        const children = await loadSubdirectories(rootPath);
        setLibraryNodes((prev) => {
          const next = new Map(prev);
          next.set(rootPath, children);
          return next;
        });
      }
    },
    [libraryNodes, loadSubdirectories]
  );

  // Recursive toggle for library subfolder nodes
  async function toggleNodeRecursive(
    nodes: FolderNodeData[],
    targetPath: string
  ): Promise<FolderNodeData[] | null> {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].info.path === targetPath) {
        const node = { ...nodes[i] };
        node.expanded = !node.expanded;
        if (node.expanded && node.children === null) {
          node.children = await loadSubdirectories(targetPath);
        }
        const updated = [...nodes];
        updated[i] = node;
        return updated;
      }
      if (nodes[i].children) {
        const updatedChildren = await toggleNodeRecursive(
          nodes[i].children!,
          targetPath
        );
        if (updatedChildren) {
          const updated = [...nodes];
          updated[i] = { ...nodes[i], children: updatedChildren };
          return updated;
        }
      }
    }
    return null;
  }

  const toggleLibraryNode = useCallback(
    async (nodePath: string) => {
      for (const [rootPath, children] of libraryNodes.entries()) {
        if (!children) continue;
        const updated = await toggleNodeRecursive(children, nodePath);
        if (updated) {
          setLibraryNodes((prev) => {
            const next = new Map(prev);
            next.set(rootPath, [...updated]);
            return next;
          });
          break;
        }
      }
    },
    [libraryNodes, loadSubdirectories]
  );

  // Toggle playlist folder expand/collapse
  const togglePlaylistFolder = (folderId: number) => {
    setExpandedPlaylistFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Context menu handlers
  const showContextMenu = (e: React.MouseEvent, state: Partial<ContextMenuState>) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "library",
      ...state,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) closeContextMenu();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu.visible]);

  // Helpers
  const getFolderName = (path: string) => {
    const parts = path.replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || path;
  };

  const isAllSelected = selectedFolder === null && selectedPlaylistId === null;

  // Build playlist tree: separate root items and children by parent_id
  const rootPlaylists = playlists.filter((p) => p.parent_id === null);
  const getChildren = (parentId: number) =>
    playlists.filter((p) => p.parent_id === parentId);

  // Render a playlist or folder item
  function renderPlaylistItem(p: Playlist, depth: number) {
    const isFolder = p.playlist_type === "folder";
    const isExpanded = expandedPlaylistFolders.has(p.id);
    const isSelected = selectedPlaylistId === p.id;
    const children = isFolder ? getChildren(p.id) : [];

    return (
      <div key={p.id} className="playlist-node">
        <div
          className={`folder-row ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            if (isFolder) {
              togglePlaylistFolder(p.id);
            } else {
              onPlaylistSelect(p.id);
            }
          }}
          onContextMenu={(e) =>
            showContextMenu(e, {
              type: isFolder ? "folder-item" : "playlist-item",
              playlistId: p.id,
              playlistName: p.name,
              playlistParentId: p.parent_id,
            })
          }
        >
          {/* Arrow for folders */}
          <span
            className={`folder-arrow ${isFolder ? "has-children" : ""}`}
            onClick={(e) => {
              if (isFolder) {
                e.stopPropagation();
                togglePlaylistFolder(p.id);
              }
            }}
          >
            {isFolder && <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={16} />}
          </span>

          {/* Icon */}
          <Icon
            name={isFolder ? (isExpanded ? "FolderOpen" : "Folder") : "ListMusic"}
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
    );
  }

  return (
    <div className="folder-tree">
      <div className="folder-tree-scroll">
        {/* ========== TRACK COLLECTION SECTION ========== */}
        <div className="folder-tree-section">
          <div
            className="folder-tree-section-header"
            onClick={() => setCollectionExpanded((prev) => !prev)}
          >
            <span className="section-arrow">
              <Icon name={collectionExpanded ? "ChevronDown" : "ChevronRight"} size={16} />
            </span>
            <Icon name="Disc3" size={16} className="section-icon" />
            <span className="folder-tree-title">Track Collection</span>
          </div>

          {collectionExpanded && (
            <div className="folder-tree-section-body">
              {/* "All Tracks" node */}
              <div
                className={`folder-row root-all ${isAllSelected ? "selected" : ""}`}
                onClick={() => onFolderSelect(null)}
                onContextMenu={(e) =>
                  showContextMenu(e, { type: "all-tracks" })
                }
              >
                <span className="folder-arrow" />
                <Icon name="Music" size={16} className="folder-icon" />
                <span className="folder-name">All Tracks</span>
                {totalTrackCount != null && totalTrackCount > 0 && (
                  <span className="folder-count">({totalTrackCount})</span>
                )}
              </div>

              {/* Library folder roots */}
              {libraryFolders.map((folderPath) => {
                const isExpanded = libraryExpandedRoots.has(folderPath);
                const name = getFolderName(folderPath);
                const count = rootCounts.get(folderPath) ?? 0;
                const children = libraryNodes.get(folderPath);
                const isRootSelected =
                  selectedFolder === folderPath && selectedPlaylistId === null;

                return (
                  <div key={folderPath} className="folder-root">
                    <div
                      className={`folder-row root-folder ${isRootSelected ? "selected" : ""}`}
                      onClick={() => onFolderSelect(folderPath)}
                      onContextMenu={(e) =>
                        showContextMenu(e, {
                          type: "library",
                          folderPath,
                          folderName: name,
                        })
                      }
                    >
                      <span
                        className="folder-arrow has-children"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLibraryRoot(folderPath);
                        }}
                      >
                        <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={16} />
                      </span>
                      <Icon
                        name={isExpanded ? "FolderOpen" : "Folder"}
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
                                type: "library",
                                folderPath: path,
                                folderName: n,
                              })
                            }
                          />
                        ))}
                        {children.length === 0 && (
                          <div
                            className="folder-empty"
                            style={{ paddingLeft: "44px" }}
                          >
                            No subfolders
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {libraryFolders.length === 0 && (
                <div className="folder-empty" style={{ paddingLeft: "28px" }}>
                  No library folders yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== PLAYLISTS SECTION ========== */}
        <div className="folder-tree-section">
          <div
            className="folder-tree-section-header"
            onClick={() => setPlaylistsExpanded((prev) => !prev)}
            onContextMenu={(e) =>
              showContextMenu(e, {
                type: "playlist-header",
              })
            }
          >
            <span className="section-arrow">
              <Icon name={playlistsExpanded ? "ChevronDown" : "ChevronRight"} size={16} />
            </span>
            <Icon name="ListMusic" size={16} className="section-icon" />
            <span className="folder-tree-title">Playlists</span>
          </div>

          {playlistsExpanded && (
            <div
              className="folder-tree-section-body"
              onContextMenu={(e) =>
                showContextMenu(e, {
                  type: "playlist-header",
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
          )}
        </div>
      </div>

      {/* ========== CONTEXT MENU ========== */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* --- All Tracks context menu --- */}
          {contextMenu.type === "all-tracks" && (
            <>
              <div className="context-menu-header">All Tracks</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onAnalyzeAll();
                  closeContextMenu();
                }}
              >
                <Icon name="Zap" size={16} className="context-menu-icon" />
                Analyze All Tracks
              </div>
            </>
          )}

          {/* --- Library folder context menu --- */}
          {contextMenu.type === "library" && (
            <>
              <div className="context-menu-header">
                {contextMenu.folderName}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onAnalyzeFolder(contextMenu.folderPath!);
                  closeContextMenu();
                }}
              >
                <Icon name="Zap" size={16} className="context-menu-icon" />
                Analyze Tracks
              </div>
            </>
          )}

          {/* --- Playlists header context menu --- */}
          {contextMenu.type === "playlist-header" && (
            <>
              <div className="context-menu-header">Playlists</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreatePlaylist(null);
                  closeContextMenu();
                }}
              >
                <Icon name="Plus" size={16} className="context-menu-icon" />
                Create Playlist
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreateFolder(null);
                  closeContextMenu();
                }}
              >
                <Icon name="FolderPlus" size={16} className="context-menu-icon" />
                Create Folder
              </div>
            </>
          )}

          {/* --- Playlist item context menu --- */}
          {contextMenu.type === "playlist-item" && (
            <>
              <div className="context-menu-header">
                {contextMenu.playlistName}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreatePlaylist(contextMenu.playlistParentId ?? null);
                  closeContextMenu();
                }}
              >
                <Icon name="Plus" size={16} className="context-menu-icon" />
                Create Playlist
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreateFolder(contextMenu.playlistParentId ?? null);
                  closeContextMenu();
                }}
              >
                <Icon name="FolderPlus" size={16} className="context-menu-icon" />
                Create Folder
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item"
                onClick={() => {
                  onRenamePlaylist(
                    contextMenu.playlistId!,
                    contextMenu.playlistName!
                  );
                  closeContextMenu();
                }}
              >
                <Icon name="Pencil" size={16} className="context-menu-icon" />
                Rename
              </div>
              <div
                className="context-menu-item context-menu-item-danger"
                onClick={() => {
                  onDeletePlaylist(
                    contextMenu.playlistId!,
                    contextMenu.playlistName!
                  );
                  closeContextMenu();
                }}
              >
                <Icon name="Trash2" size={16} className="context-menu-icon" />
                Delete
              </div>
            </>
          )}

          {/* --- Folder item context menu --- */}
          {contextMenu.type === "folder-item" && (
            <>
              <div className="context-menu-header">
                {contextMenu.playlistName}
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreatePlaylist(contextMenu.playlistId!);
                  closeContextMenu();
                }}
              >
                <Icon name="Plus" size={16} className="context-menu-icon" />
                Create Playlist
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onCreateFolder(contextMenu.playlistId!);
                  closeContextMenu();
                }}
              >
                <Icon name="FolderPlus" size={16} className="context-menu-icon" />
                Create Folder
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item"
                onClick={() => {
                  onRenamePlaylist(
                    contextMenu.playlistId!,
                    contextMenu.playlistName!
                  );
                  closeContextMenu();
                }}
              >
                <Icon name="Pencil" size={16} className="context-menu-icon" />
                Rename
              </div>
              <div
                className="context-menu-item context-menu-item-danger"
                onClick={() => {
                  onDeletePlaylist(
                    contextMenu.playlistId!,
                    contextMenu.playlistName!
                  );
                  closeContextMenu();
                }}
              >
                <Icon name="Trash2" size={16} className="context-menu-icon" />
                Delete
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
