import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tauriApi } from '../lib/tauri-api'
import { useFolderTreeStore, initialFolderTreeState } from './folderTreeStore'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    listSubdirectories: vi.fn(),
    countTracksInFolder: vi.fn(),
  },
}))

const listSubdirectories = vi.mocked(tauriApi.listSubdirectories)
const countTracksInFolder = vi.mocked(tauriApi.countTracksInFolder)

const info = (path: string, has_subfolders = true) => ({
  path,
  name: path.split('/').pop()!,
  track_count: 0,
  has_subfolders,
})

const store = () => useFolderTreeStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useFolderTreeStore.setState(initialFolderTreeState())
  listSubdirectories.mockImplementation(async (path: string) => {
    if (path === '/music') return [info('/music/house'), info('/music/techno')]
    if (path === '/music/house') return [info('/music/house/deep', false)]
    return []
  })
  countTracksInFolder.mockResolvedValue(42)
})

describe('folderTreeStore', () => {
  it('loads a root once and keeps a drilled-in subfolder expanded', async () => {
    await store().toggleRoot('/music')
    await store().toggleNode('/music/house')

    // Collapsing and re-expanding the root (or a remounted tree) reuses the cache.
    await store().toggleRoot('/music')
    await store().toggleRoot('/music')

    expect(listSubdirectories).toHaveBeenCalledTimes(2) // /music, /music/house
    const { expandedRoots, nodes } = store().folders
    expect(expandedRoots.has('/music')).toBe(true)
    const house = nodes.get('/music')!.find((n) => n.info.path === '/music/house')!
    expect(house.expanded).toBe(true)
    expect(house.children?.map((c) => c.info.path)).toEqual(['/music/house/deep'])
  })

  it('loads the root counts once per list of folders', async () => {
    const folders = ['/music']
    await store().loadRootCounts(folders)
    await store().loadRootCounts(folders)
    expect(countTracksInFolder).toHaveBeenCalledTimes(1)
    expect(store().folders.rootCounts.get('/music')).toBe(42)

    await store().loadRootCounts(['/music'])
    expect(countTracksInFolder).toHaveBeenCalledTimes(2)
  })

  it('refresh replaces the cached children and count of the affected root', async () => {
    await store().toggleRoot('/music')
    await store().toggleNode('/music/house')

    listSubdirectories.mockResolvedValueOnce([info('/music/minimal')])
    countTracksInFolder.mockResolvedValueOnce(7)
    await store().refreshRoot(['/other', '/music'], '/music/house/deep')

    const children = store().folders.nodes.get('/music')!
    expect(children.map((n) => n.info.path)).toEqual(['/music/minimal'])
    expect(store().folders.rootCounts.get('/music')).toBe(7)
    expect(store().folders.expandedRoots.has('/music')).toBe(true)
  })

  it('refresh ignores a path outside every library root', async () => {
    await store().refreshRoot(['/music'], '/elsewhere/x')
    expect(listSubdirectories).not.toHaveBeenCalled()
  })

  it('toggles playlist folders', () => {
    store().togglePlaylistFolder(3)
    expect(store().playlists.expandedFolders.has(3)).toBe(true)
    store().togglePlaylistFolder(3)
    expect(store().playlists.expandedFolders.has(3)).toBe(false)
  })
})
