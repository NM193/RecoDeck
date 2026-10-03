// src/store/folderTreeStore.ts
// What the folder tree has expanded and loaded, kept outside FolderTree so it
// survives the component unmounting: collapsing the sidebar to the icon rail
// unmounts the full-width trees, and every rail flyout mounts a fresh one.
// One store shared by every tree, split by data: `folders` (library roots and
// their subfolders) and `playlists` (expanded playlist folders).
import { create } from 'zustand'
import { tauriApi } from '../lib/tauri-api'
import type { FolderInfo } from '../types/track'

export interface FolderNodeData {
  info: FolderInfo
  children: FolderNodeData[] | null
  expanded: boolean
}

interface FoldersState {
  /** Library roots whose children are shown. */
  expandedRoots: Set<string>
  /** Loaded children per library root; each node carries its own `expanded`. */
  nodes: Map<string, FolderNodeData[]>
  /** Track count per library root. */
  rootCounts: Map<string, number>
  /** The `libraryFolders` array the counts were loaded for (compared by
   *  identity, like the effect dependency it replaces). */
  countsFor: string[] | null
}

interface PlaylistsState {
  /** Playlist folders whose children are shown. */
  expandedFolders: Set<number>
}

interface FolderTreeState {
  folders: FoldersState
  playlists: PlaylistsState

  /** Loads the root counts, unless they are already known for this array.
   *  A new array also drops what is cached for roots no longer in it. */
  loadRootCounts: (libraryFolders: string[]) => Promise<void>
  /** Expands or collapses a library root, loading its children the first time. */
  toggleRoot: (rootPath: string) => Promise<void>
  /** Expands or collapses a loaded subfolder, loading its children the first time. */
  toggleNode: (nodePath: string) => Promise<void>
  /** Drops what is cached for the root containing `affectedPath` and reloads
   *  its children and track count from disk. */
  refreshRoot: (libraryFolders: string[], affectedPath: string) => Promise<void>
  /** The library changed on disk (watcher, scan, import): reloads the root
   *  counts and every root with loaded children, keeping what is expanded. */
  invalidateAll: (libraryFolders: string[]) => Promise<void>
  togglePlaylistFolder: (folderId: number) => void
}

async function loadSubdirectories(
  folderPath: string,
): Promise<FolderNodeData[]> {
  try {
    const folders = await tauriApi.listSubdirectories(folderPath)
    return folders.map((info) => ({ info, children: null, expanded: false }))
  } catch (err) {
    console.warn('Failed to list subdirectories:', err)
    return []
  }
}

/** Returns `nodes` with the node at `targetPath` toggled, or null if absent. */
async function toggleNodeRecursive(
  nodes: FolderNodeData[],
  targetPath: string,
): Promise<FolderNodeData[] | null> {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].info.path === targetPath) {
      const node = { ...nodes[i] }
      node.expanded = !node.expanded
      if (node.expanded && node.children === null) {
        node.children = await loadSubdirectories(targetPath)
      }
      const updated = [...nodes]
      updated[i] = node
      return updated
    }
    const children = nodes[i].children
    if (children) {
      const updatedChildren = await toggleNodeRecursive(children, targetPath)
      if (updatedChildren) {
        const updated = [...nodes]
        updated[i] = { ...nodes[i], children: updatedChildren }
        return updated
      }
    }
  }
  return null
}

/** Reloads the children of `path`, and again below every node that was
 *  expanded in `previous`, so a reload keeps the user's drill-in. */
async function reloadKeepingExpansion(
  path: string,
  previous: FolderNodeData[] | null,
): Promise<FolderNodeData[]> {
  const fresh = await loadSubdirectories(path)
  const before = new Map((previous ?? []).map((n) => [n.info.path, n]))
  return Promise.all(
    fresh.map(async (node) => {
      const old = before.get(node.info.path)
      if (!old?.expanded) return node
      return {
        ...node,
        expanded: true,
        children: await reloadKeepingExpansion(node.info.path, old.children),
      }
    }),
  )
}

export function initialFolderTreeState(): Pick<
  FolderTreeState,
  'folders' | 'playlists'
> {
  return {
    folders: {
      expandedRoots: new Set(),
      nodes: new Map(),
      rootCounts: new Map(),
      countsFor: null,
    },
    playlists: { expandedFolders: new Set() },
  }
}

export const useFolderTreeStore = create<FolderTreeState>((set, get) => {
  const setFolders = (update: (prev: FoldersState) => Partial<FoldersState>) =>
    set((s) => ({ folders: { ...s.folders, ...update(s.folders) } }))

  const setRootNodes = (rootPath: string, children: FolderNodeData[]) =>
    setFolders((f) => {
      const nodes = new Map(f.nodes)
      nodes.set(rootPath, children)
      return { nodes }
    })

  return {
    ...initialFolderTreeState(),

    loadRootCounts: async (libraryFolders) => {
      if (get().folders.countsFor === libraryFolders) return
      const keep = (root: string) => libraryFolders.includes(root)
      setFolders((f) => ({
        countsFor: libraryFolders,
        nodes: new Map([...f.nodes].filter(([root]) => keep(root))),
        expandedRoots: new Set([...f.expandedRoots].filter(keep)),
        rootCounts: new Map([...f.rootCounts].filter(([root]) => keep(root))),
      }))
      if (libraryFolders.length === 0) return
      const counts = new Map<string, number>()
      for (const folder of libraryFolders) {
        try {
          counts.set(folder, await tauriApi.countTracksInFolder(folder))
        } catch {
          counts.set(folder, 0)
        }
      }
      // A newer list of folders may have started loading meanwhile.
      if (get().folders.countsFor !== libraryFolders) return
      setFolders(() => ({ rootCounts: counts }))
    },

    toggleRoot: async (rootPath) => {
      setFolders((f) => {
        const expandedRoots = new Set(f.expandedRoots)
        if (expandedRoots.has(rootPath)) expandedRoots.delete(rootPath)
        else expandedRoots.add(rootPath)
        return { expandedRoots }
      })
      if (!get().folders.nodes.has(rootPath)) {
        setRootNodes(rootPath, await loadSubdirectories(rootPath))
      }
    },

    // Like the component code it came from, toggleNode, refreshRoot and
    // invalidateAll write back a snapshot taken before their await, so one can
    // overwrite another that finished in between (rare; left as it was).
    toggleNode: async (nodePath) => {
      for (const [rootPath, children] of get().folders.nodes.entries()) {
        if (!children) continue
        const updated = await toggleNodeRecursive(children, nodePath)
        if (updated) {
          setRootNodes(rootPath, updated)
          break
        }
      }
    },

    refreshRoot: async (libraryFolders, affectedPath) => {
      const root = libraryFolders.find(
        (r) => affectedPath === r || affectedPath.startsWith(r + '/'),
      )
      if (!root) return
      setRootNodes(root, await loadSubdirectories(root))
      try {
        const count = await tauriApi.countTracksInFolder(root)
        setFolders((f) => {
          const rootCounts = new Map(f.rootCounts)
          rootCounts.set(root, count)
          return { rootCounts }
        })
      } catch {
        // ignore count refresh failures
      }
    },

    invalidateAll: async (libraryFolders) => {
      // Captured before loadRootCounts prunes roots no longer in the library.
      const loaded = [...get().folders.nodes].filter(([root]) =>
        libraryFolders.includes(root),
      )
      setFolders(() => ({ countsFor: null }))
      await Promise.all([
        get().loadRootCounts(libraryFolders),
        ...loaded.map(async ([root, previous]) =>
          setRootNodes(root, await reloadKeepingExpansion(root, previous)),
        ),
      ])
    },

    togglePlaylistFolder: (folderId) =>
      set((s) => {
        const expandedFolders = new Set(s.playlists.expandedFolders)
        if (expandedFolders.has(folderId)) expandedFolders.delete(folderId)
        else expandedFolders.add(folderId)
        return { playlists: { expandedFolders } }
      }),
  }
})
