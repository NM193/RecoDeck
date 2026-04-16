import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { confirm } from '@tauri-apps/plugin-dialog'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { ChatView } from './components/ai/ChatView'
import { PromptModal } from './components/PromptModal'
import { SharePlaylistModal } from './components/SharePlaylistModal'
import { ExportPlaylistModal } from './components/ExportPlaylistModal'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { getChangesForVersion, type VersionChanges } from './lib/changelog'
import appPackage from '../package.json'
import { Notification } from './components/Notification'
import { UpdateToast } from './components/UpdateToast'
import {
  AnalysisProgress,
  type AnalysisProgressData,
} from './components/AnalysisProgress'
// import { PlayerAIChat } from './components/ai/PlayerAIChat'
import { AIPlaylistDialog } from './components/ai/AIPlaylistDialog'
import { RecommendationsPanel } from './components/ai/RecommendationsPanel'
import { MixPrepPanel } from './components/ai/MixPrepPanel'
import { AppShell } from './components/layout/AppShell'
import { Sidebar } from './components/layout/Sidebar'
import type { FolderTreeRef } from './components/FolderTree'
import { usePlayerStore } from './store/playerStore'
import { useAIStore } from './store/aiStore'
import { tauriApi } from './lib/tauri-api'
import type { Track, Playlist, AnalysisProgressEvent, AnalysisCompleteEvent } from './types/track'
import './App.css'
import './components/TrackTable.css'

const AI_ENABLED = false

type PromptAction =
  | { kind: 'create-playlist'; parentId: number | null }
  | { kind: 'create-folder'; parentId: number | null }
  | { kind: 'rename'; id: number; currentName: string }
  | { kind: 'create-subfolder'; parentPath: string }
  | { kind: 'rename-folder'; folderPath: string; currentName: string }

function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (hash === '#mini-player') {
    return <MiniPlayer />
  }

  return <AppContent />
}

function AppContent() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  // Folder tree state
  const [libraryFolders, setLibraryFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  // Playlist state
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [showAllTracks, setShowAllTracks] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )

  // Genre state
  const [genreDefinitions, setGenreDefinitions] = useState<
    Array<{ id: number; name: string; color?: string }>
  >([])

  // Total track count for "All Tracks" display
  const [totalTrackCount, setTotalTrackCount] = useState<number>(0)

  // Name prompt modal (works in Tauri where window.prompt is not available)
  const [promptState, setPromptState] = useState<{
    open: boolean
    title: string
    defaultValue: string
    action: PromptAction | null
  }>({ open: false, title: '', defaultValue: '', action: null })

  // Confirmation modal for deleting a library subfolder
  const [deleteFolderModal, setDeleteFolderModal] = useState<{
    open: boolean
    folderPath: string
    folderName: string
  }>({ open: false, folderPath: '', folderName: '' })

  // Ref into FolderTree to refresh a root after folder mutations
  const folderTreeRef = useRef<FolderTreeRef>(null)

  // Share playlist modal
  const [sharePlaylistModal, setSharePlaylistModal] = useState<{
    open: boolean
    playlistId: number
    playlistName: string
    companionUrl: string
    companionToken: string
  } | null>(null)

  // Export playlist modal
  const [exportModal, setExportModal] = useState<{
    playlistId: number
    playlistName: string
  } | null>(null)

  // AI Playlist dialog seed track
  const [aiPlaylistSeedTrack, setAiPlaylistSeedTrack] = useState<Track | null>(
    null,
  )

  // AI Recommendations panel state
  const [recommendationSeed, setRecommendationSeed] = useState<{
    track?: Track
    playlistId?: number
    playlistName?: string
  } | null>(null)

  // Mix Prep panel state
  const [mixPrepPlaylist, setMixPrepPlaylist] = useState<{
    id: number
    name: string
  } | null>(null)

  // Notification state
  const [notification, setNotification] = useState<{
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
  } | null>(null)

  // Pending update from auto-check on launch
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

  // What's New dialog state
  const [whatsNew, setWhatsNew] = useState<{
    version: string
    changes: VersionChanges
  } | null>(null)

  // Header notification (small text next to logo, typing animation)
  const [headerNotification, setHeaderNotification] = useState<string | null>(
    null,
  )

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressData | null>(null)
  const analysisStartTimeRef = useRef<number>(0)

  // Scan progress state (global, survives Settings unmount)
  const [scanProgress, setScanProgress] = useState<{
    current: number; total: number; currentFile: string; folder: string
  } | null>(null)
  const [scanStartTime, setScanStartTime] = useState<number | null>(null)

  // Listen for scan-progress events globally
  useEffect(() => {
    const unlisten = listen<{
      folder: string; current: number; total: number; current_file: string
    }>('scan-progress', (event) => {
      const p = event.payload
      if (p.current >= p.total && p.total > 0) {
        setScanProgress(null)
        setScanStartTime(null)
        return
      } else {
        setScanProgress({ current: p.current, total: p.total, currentFile: p.current_file, folder: p.folder })
        setScanStartTime((prev) => prev ?? Date.now())
      }
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  // Cancel analysis — tells backend to stop Rayon workers
  function handleCancelAnalysis() {
    tauriApi.cancelAnalysis().catch(() => {})
  }

  // Listen for batch analysis events from backend
  useEffect(() => {
    const unlistenProgress = listen<AnalysisProgressEvent>('analysis-progress', (event) => {
      const p = event.payload
      setAnalysisProgress({
        currentIndex: p.current,
        totalTracks: p.total,
        currentTrackName: p.track_name,
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: analysisStartTimeRef.current,
      })
    })

    const unlistenComplete = listen<AnalysisCompleteEvent>('analysis-complete', (event) => {
      const e = event.payload

      // Ensure progress bar is visible for at least 600ms to avoid flashing
      const elapsed = Date.now() - analysisStartTimeRef.current
      const minDisplayMs = 600
      const delay = Math.max(0, minDisplayMs - elapsed)

      setTimeout(() => {
        setAnalysisProgress(null)
        setAnalyzing(false)

        if (e.cancelled) {
          setNotification({
            message: `Analysis cancelled. ${e.total_analyzed} of ${e.total_requested} tracks analyzed.`,
            type: 'warning',
          })
        } else if (e.total_analyzed > 0) {
          setNotification({
            message: `Analyzed ${e.total_analyzed} tracks${e.total_failed > 0 ? ` (${e.total_failed} failed)` : ''}`,
            type: 'success',
          })
        } else {
          setNotification({
            message: 'All tracks already have BPM and Key analysis',
            type: 'info',
          })
        }

        // Reload tracks and rebuild AI context (use ref to avoid stale closure)
        loadTracksRef.current()
        tauriApi.rebuildAIContext().catch(() => {})
      }, delay)
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenComplete.then((fn) => fn())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    initializeApp()
  }, [])

  // Register Settings callback so AI error messages can open the Settings panel
  useEffect(() => {
    useAIStore.getState().registerOpenSettings(() => {
      setShowSettings(true)
      setSelectedFolder(null)
      setSelectedPlaylistId(null)
      setShowAllTracks(false)
    })
  }, [])

  // Check for app updates silently on launch (check-only, never auto-installs)
  useEffect(() => {
    if (import.meta.env.DEV) return
    const timer = setTimeout(async () => {
      try {
        const update = await check()
        if (update) {
          setPendingUpdate(update)
        }
      } catch (err) {
        console.warn('Auto update check failed:', err)
      }
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  async function initializeApp() {
    const splashStart = Date.now()
    try {
      const dataDir = await appDataDir()
      const dbPath = await join(dataDir, 'recodeck.db')
      await tauriApi.initDatabase(dbPath)

      // PERFORMANCE: Skip expensive path normalization on startup
      // This operation loads all tracks into memory - users can run it manually via settings if needed

      // Load saved theme
      try {
        const savedTheme = await tauriApi.getTheme()
        if (savedTheme === 'custom') {
          const customColors = await tauriApi.getCustomThemeColors()
          applyTheme(savedTheme, customColors ?? undefined)
        } else {
          applyTheme(savedTheme)
        }
      } catch {
        console.warn('Failed to load saved theme, using default')
      }

      // Load library folders
      let folders: string[] = []
      try {
        folders = await tauriApi.getLibraryFolders()
        setLibraryFolders(folders)
      } catch {
        console.warn('Failed to load library folders')
      }

      // PERFORMANCE: Skip stray track cleanup on startup - will be optimized to use SQL
      // Users can run this manually via settings if needed

      // PERFORMANCE: Skip library scanning on startup - file watcher will catch new files
      // Users can manually scan via settings if needed

      // Load playlists
      await loadPlaylists()

      // Load genre definitions
      await loadGenreDefinitions()

      // Check if we should show "What's New" dialog
      try {
        const lastSeen = await tauriApi.getSetting('last_seen_version')
        const currentVersion = appPackage.version
        if (lastSeen === null) {
          // Fresh install — record version, do NOT show modal
          await tauriApi.setSetting('last_seen_version', currentVersion)
        } else if (lastSeen !== currentVersion) {
          const changes = getChangesForVersion(currentVersion)
          const hasAny = changes.added.length > 0 || changes.changed.length > 0 || changes.fixed.length > 0
          if (hasAny) {
            setWhatsNew({ version: `v${currentVersion}`, changes })
          }
          await tauriApi.setSetting('last_seen_version', currentVersion)
        }
      } catch {
        console.warn('Failed to check version for What\'s New dialog')
      }

      // PERFORMANCE: Don't load all tracks on startup - load only total count
      // Tracks will be loaded when user selects a folder or playlist
      try {
        const total = await tauriApi.countTracks()
        setTotalTrackCount(total)
      } catch {
        console.warn('Failed to get track count')
      }

      // Set empty tracks array initially
      setTracks([])

      // Rebuild taste profile cache in background (non-blocking)
      tauriApi.rebuildTasteProfile().catch(console.error)

      // Start file watcher on library folders
      if (folders.length > 0) {
        try {
          await tauriApi.startFileWatcher(folders)
          console.log('File watcher started for', folders.length, 'folders')
        } catch (watchErr) {
          console.warn('Failed to start file watcher:', watchErr)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      // Show splash screen for at least 2.5s so the logo animation plays
      const elapsed = Date.now() - splashStart
      const remaining = Math.max(0, 2500 - elapsed)
      setTimeout(() => setLoading(false), remaining)
    }
  }

  // Load tracks — all, by folder, or by playlist
  const loadTracks = useCallback(
    async (folderPath?: string | null, playlistId?: number | null) => {
      try {
        const folder = folderPath !== undefined ? folderPath : selectedFolder
        const playlist =
          playlistId !== undefined ? playlistId : selectedPlaylistId

        let result: Track[]
        let total = 0

        if (playlist) {
          result = await tauriApi.getPlaylistTracks(playlist)
        } else if (folder) {
          // Use recursive query for library root folders, shallow for subfolders
          const isRootFolder = libraryFolders.includes(folder)
          result = isRootFolder
            ? await tauriApi.getTracksInFolder(folder)
            : await tauriApi.getTracksInFolderShallow(folder)
        } else {
          // Load all tracks in one shot — SQLite is fast and TanStack Virtual handles rendering
          result = await tauriApi.getAllTracks()
          total = result.length
        }

        setTracks(result)

        // Always update total track count
        try {
          if (total === 0) {
            total = await tauriApi.countTracks()
          }
          setTotalTrackCount(total)
        } catch {
          // Ignore count errors
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [selectedFolder, selectedPlaylistId, libraryFolders],
  )

  // Backend search for "All Tracks" view — searches entire DB, not just loaded tracks
  const handleSearch = useCallback(
    async (query: string) => {
      // Only use backend search in "All Tracks" view (no folder/playlist selected)
      if (selectedFolder || selectedPlaylistId) return

      if (!query) {
        // Search cleared — restore full library view
        loadTracks()
        return
      }

      try {
        const results = await tauriApi.searchTracks(query)
        setTracks(results)
      } catch (err) {
        console.error('Backend search failed:', err)
      }
    },
    [selectedFolder, selectedPlaylistId, loadTracks],
  )

  // Load playlists from backend
  const loadPlaylists = useCallback(async () => {
    try {
      const all = await tauriApi.getAllPlaylists()
      setPlaylists(all)
    } catch (err) {
      console.warn('Failed to load playlists:', err)
    }
  }, [])

  // Load genre definitions from backend
  const loadGenreDefinitions = useCallback(async () => {
    try {
      const defs = await tauriApi.getGenreDefinitions()
      setGenreDefinitions(defs)
    } catch (err) {
      console.warn('Failed to load genre definitions:', err)
    }
  }, [])

  // Keep a ref to loadTracks so the event listener always uses the latest version
  const loadTracksRef = useRef(loadTracks)
  loadTracksRef.current = loadTracks
  const libraryFoldersRef = useRef(libraryFolders)
  libraryFoldersRef.current = libraryFolders

  // Ref for TrackTable to access scroll methods
  const trackTableRef = useRef<TrackTableRef>(null)

  // Listen for file system changes and auto-refresh
  useEffect(() => {
    let unlisten: (() => void) | undefined

    listen('library-changed', async () => {
      console.log('Library changed detected, re-scanning...')
      // Re-scan all library folders to pick up new files
      for (const folder of libraryFoldersRef.current) {
        try {
          await tauriApi.scanDirectory(folder)
        } catch (err) {
          console.warn(`Failed to re-scan folder ${folder}:`, err)
        }
      }
      // Reload tracks
      await loadTracksRef.current()
      // Rebuild AI context cache
      tauriApi.rebuildAIContext().catch(() => {})
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  function hexToRgb(hex: string): string {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
    if (!m) return '99, 102, 241'
    return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
  }

  function lightenHex(hex: string, amount: number): string {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
    if (!m) return hex
    const r = Math.min(255, parseInt(m[1], 16) + amount)
    const g = Math.min(255, parseInt(m[2], 16) + amount)
    const b = Math.min(255, parseInt(m[3], 16) + amount)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  const CUSTOM_THEME_VARS = [
    'accent',
    'accent-hover',
    'accent-rgb',
    'bg-primary',
    'bg-secondary',
    'bg-tertiary',
    'text-primary',
    'text-secondary',
    'border',
    'surface',
    'waveform-color',
    'waveform-played',
    'spectrogram-bg',
  ]

  function applyTheme(theme: string, customColors?: Record<string, string>) {
    const root = document.documentElement.style
    document.documentElement.setAttribute('data-theme', theme)
    if (theme === 'custom' && customColors) {
      const validHex = /^#[0-9A-Fa-f]{6}$/
      for (const [key, value] of Object.entries(customColors)) {
        if (validHex.test(value)) {
          root.setProperty('--' + key, value)
        }
      }
      if (customColors.accent && validHex.test(customColors.accent)) {
        root.setProperty('--accent-hover', lightenHex(customColors.accent, 30))
        root.setProperty('--accent-rgb', hexToRgb(customColors.accent))
        root.setProperty('--waveform-color', customColors.accent)
        root.setProperty(
          '--waveform-played',
          lightenHex(customColors.accent, 60),
        )
      }
      if (customColors['bg-primary']) {
        root.setProperty('--spectrogram-bg', customColors['bg-primary'])
      }
    } else {
      for (const name of CUSTOM_THEME_VARS) {
        root.removeProperty('--' + name)
      }
    }
  }

  // Settings callbacks
  async function handleFoldersChanged() {
    let folders: string[] = []
    try {
      folders = await tauriApi.getLibraryFolders()
      setLibraryFolders(folders)
    } catch {
      console.warn('Failed to refresh library folders')
    }
    // Restart file watcher with updated folders
    try {
      await tauriApi.startFileWatcher(folders)
    } catch {
      console.warn('Failed to restart file watcher')
    }
    loadTracks()
  }

  function handleThemeChanged(theme: string) {
    applyTheme(theme)
  }

  // Folder selection from Track Collection
  async function handleFolderSelect(folderPath: string | null) {
    setSelectedFolder(folderPath)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setShowSettings(false)
    setShowSearch(false)
    setShowAIChat(false)

    await loadTracks(folderPath, null)
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId)
    setSelectedFolder(null)
    setShowAllTracks(false)
    setShowSettings(false)
    setShowSearch(false)
    setShowAIChat(false)
    await loadTracks(null, playlistId)
  }

  // Analyze folder — BPM and Key for tracks that don't have them yet (parallel batch)
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        setNotification({ message: 'No audio tracks found in this folder', type: 'info' })
        return
      }

      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: trackIds.length,
        currentTrackName: 'Preparing analysis...',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })

      // Yield to event loop so React commits the progress bar render
      // before backend events can clear it
      await new Promise((r) => setTimeout(r, 0))

      await tauriApi.analyzeTracksBatch(trackIds, true)
      // Returns instantly — backend events update progress from here
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Analyze a single track (BPM + Key) — uses batch for decode-once benefit
  async function handleAnalyzeTrack(track: Track) {
    try {
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: 1,
        currentTrackName: track.title || track.file_path.split('/').pop() || 'Unknown',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })
      await new Promise((r) => setTimeout(r, 0))
      await tauriApi.analyzeTracksBatch([track.id], true)
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }


  // Create playlist — open name modal (prompt() doesn't work in Tauri)
  function handleCreatePlaylist(parentId: number | null) {
    setPromptState({
      open: true,
      title: 'Playlist name',
      defaultValue: '',
      action: { kind: 'create-playlist', parentId },
    })
  }

  // Create folder — open name modal
  function handleCreateFolder(parentId: number | null) {
    setPromptState({
      open: true,
      title: 'Folder name',
      defaultValue: '',
      action: { kind: 'create-folder', parentId },
    })
  }

  // Rename playlist/folder — open name modal
  function handleRenamePlaylist(id: number, currentName: string) {
    setPromptState({
      open: true,
      title: 'New name',
      defaultValue: currentName,
      action: { kind: 'rename', id, currentName },
    })
  }

  async function handlePromptConfirm(value: string) {
    const { action } = promptState
    setPromptState((p) => ({ ...p, open: false, action: null }))
    if (!action) return

    try {
      if (action.kind === 'create-playlist') {
        await tauriApi.createPlaylist(value, action.parentId)
        await loadPlaylists()
      } else if (action.kind === 'create-folder') {
        await tauriApi.createPlaylistFolder(value, action.parentId)
        await loadPlaylists()
      } else if (action.kind === 'rename') {
        if (value === action.currentName) return
        await tauriApi.renamePlaylist(action.id, value)
        await loadPlaylists()
      } else if (action.kind === 'create-subfolder') {
        await tauriApi.createFolderOnDisk(action.parentPath, value)
        folderTreeRef.current?.refreshLibraryRoot(action.parentPath)
        setNotification({
          message: `Created folder "${value}"`,
          type: 'success',
        })
      } else if (action.kind === 'rename-folder') {
        if (value === action.currentName) return
        const newPath = await tauriApi.renameFolderOnDisk(
          action.folderPath,
          value,
        )
        folderTreeRef.current?.refreshLibraryRoot(newPath)
        if (selectedFolder === action.folderPath) {
          setSelectedFolder(newPath)
          await loadTracks(newPath, null)
        } else {
          await loadTracks()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Create subfolder — open name modal, then call Rust command
  function handleCreateSubfolder(parentPath: string) {
    setPromptState({
      open: true,
      title: 'New folder name',
      defaultValue: '',
      action: { kind: 'create-subfolder', parentPath },
    })
  }

  // Rename folder — open name modal, pre-filled
  function handleRenameFolder(folderPath: string, currentName: string) {
    setPromptState({
      open: true,
      title: 'Rename folder',
      defaultValue: currentName,
      action: { kind: 'rename-folder', folderPath, currentName },
    })
  }

  // Delete folder — open confirmation modal with "empty only" / "delete all files" choice
  function handleDeleteFolder(folderPath: string, folderName: string) {
    setDeleteFolderModal({ open: true, folderPath, folderName })
  }

  async function confirmDeleteFolder(deleteFiles: boolean) {
    const { folderPath } = deleteFolderModal
    setDeleteFolderModal({ open: false, folderPath: '', folderName: '' })
    if (!folderPath) return
    try {
      await tauriApi.deleteFolderOnDisk(folderPath, deleteFiles)
      folderTreeRef.current?.refreshLibraryRoot(folderPath)
      if (selectedFolder === folderPath) {
        setSelectedFolder(null)
        await loadTracks(null, null)
      } else {
        await loadTracks()
      }
      setNotification({
        message: deleteFiles
          ? 'Folder and files deleted'
          : 'Folder removed',
        type: 'success',
      })
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
        await loadTracks(null, null)
      }

      await loadPlaylists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Share playlist — open modal with QR code if Companion is running
  async function handleSharePlaylist(playlistId: number, playlistName: string) {
    try {
      const status = await tauriApi.getCompanionStatus()
      if (!status.running || !status.url || !status.token) {
        setNotification({
          message: 'Enable Companion in Settings first',
          type: 'warning',
        })
        return
      }
      setSharePlaylistModal({
        open: true,
        playlistId,
        playlistName,
        companionUrl: status.url,
        companionToken: status.token,
      })
    } catch (err) {
      setNotification({
        message:
          err instanceof Error ? err.message : 'Failed to get Companion status',
        type: 'error',
      })
    }
  }

  // Add track to playlist
  async function handleAddToPlaylist(track: Track, playlistId: number) {
    try {
      await tauriApi.addTrackToPlaylist(playlistId, track.id)
      await loadPlaylists() // Refresh playlist counts
      const playlist = playlists.find((p) => p.id === playlistId)
      setHeaderNotification(`Added to ${playlist?.name ?? 'playlist'}`)
    } catch (err) {
      setNotification({
        message: `Failed to add: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Remove track from playlist (when viewing a playlist)
  async function handleRemoveFromPlaylist(track: Track) {
    if (selectedPlaylistId == null) return
    try {
      await tauriApi.removeTrackFromPlaylist(selectedPlaylistId, track.id)
      await loadTracks(null, selectedPlaylistId) // Refresh playlist tracks
      await loadPlaylists() // Refresh playlist counts
      setHeaderNotification(`Removed from playlist`)
    } catch (err) {
      setNotification({
        message: `Failed to remove: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Set genre for track
  async function handleSetGenre(track: Track, genre: string) {
    try {
      await tauriApi.setTrackGenre(track.id, genre)
      await loadTracks() // Refresh tracks to show updated genre
      await loadGenreDefinitions() // Refresh in case it's a new genre
      setNotification({
        message: `Genre set to "${genre}" for ${track.title || 'track'}`,
        type: 'success',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Clear genre for track
  async function handleClearGenre(track: Track) {
    try {
      await tauriApi.clearTrackGenre(track.id)
      await loadTracks() // Refresh tracks to show cleared genre
      setNotification({
        message: `Genre cleared for ${track.title || 'track'}`,
        type: 'info',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Persist a track update (rating, comment, etc.) and refresh the list
  async function handleUpdateTrack(track: Track) {
    try {
      await tauriApi.updateTrack(track)
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
      const trackIds = tracks.length > 0
        ? tracks.filter((t) => t.id).map((t) => t.id)
        : (await tauriApi.getAllTracks()).filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        setNotification({ message: 'No tracks in library', type: 'info' })
        return
      }

      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: trackIds.length,
        currentTrackName: 'Preparing analysis...',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })

      // Yield to event loop so React commits the progress bar render
      await new Promise((r) => setTimeout(r, 0))

      await tauriApi.analyzeTracksBatch(trackIds, false)
      // Returns instantly — backend events update progress from here
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Handler for when user clicks on track metadata in player
  const handleScrollToCurrentTrack = useCallback(() => {
    if (trackTableRef.current) {
      console.log('[App] Scrolling to current track in table')
      trackTableRef.current.scrollToCurrentTrack()
    } else {
      console.warn('[App] TrackTable ref not available')
    }
  }, [])

  const handleGenerateAIPlaylist = useCallback((track: Track) => {
    setAiPlaylistSeedTrack(track)
  }, [])

  const handleGetRecommendations = useCallback((track: Track) => {
    setRecommendationSeed({ track })
  }, [])

  const handleGetPlaylistRecommendations = useCallback(
    (playlistId: number, playlistName: string) => {
      setRecommendationSeed({ playlistId, playlistName })
    },
    [],
  )

  const handleOpenMixPrep = useCallback(
    (playlistId: number, playlistName: string) => {
      setMixPrepPlaylist({ id: playlistId, name: playlistName })
    },
    [],
  )

  const { setIsLoading, setError: setPlayerError, setQueue } = usePlayerStore()

  const handleTrackClick = (track: Track) => {
    console.log('Clicked track:', track)
  }

  const handlePlayTrack = async (
    track: Track,
    sortedTracks: Track[],
    trackIndex: number,
  ) => {
    if (!track.file_path) {
      console.error('[App] Track has no file path')
      return
    }

    if (!track.id) {
      console.error('[App] Track has no ID')
      return
    }

    // Validate the index before proceeding
    if (trackIndex < 0 || trackIndex >= sortedTracks.length) {
      console.error(
        `[App] Invalid track index: ${trackIndex} (queue length: ${sortedTracks.length})`,
      )
      setPlayerError('Invalid track index')
      return
    }

    // Double-check that the track at the index matches what we expect
    const trackAtIndex = sortedTracks[trackIndex]
    if (
      trackAtIndex.id !== track.id ||
      trackAtIndex.file_path !== track.file_path
    ) {
      console.error(
        `[App] Track mismatch! Expected track ${track.id} at index ${trackIndex}, but found ${trackAtIndex.id}`,
      )
      setPlayerError('Track index mismatch')
      return
    }

    try {
      setIsLoading(true)
      setPlayerError(null)

      // Use the index passed directly from TrackTable to avoid searching
      // This ensures we play the exact track the user clicked, even if there are duplicates
      console.log(
        `[App] Playing track at index ${trackIndex}/${sortedTracks.length}: "${track.title || track.file_path}"`,
      )
      console.log(
        `[App] Queue verification: track at index ${trackIndex} is "${sortedTracks[trackIndex].title || sortedTracks[trackIndex].file_path}"`,
      )

      // Set the queue with the sorted/filtered tracks array and start at the clicked track
      // This way next/previous buttons will work in the sorted order
      setQueue(sortedTracks, trackIndex)

      // Record play event for dashboard
      const trackToPlay = sortedTracks[trackIndex]
      if (trackToPlay?.id) {
        tauriApi.recordPlayEvent(trackToPlay.id, selectedPlaylistId ?? null).catch(console.error)
      }
    } catch (err) {
      console.error('[App] Play error:', err)
      setPlayerError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="loading-screen">
          <img
            src="/recodeck-logo.gif"
            alt="RecoDeck"
            className="loading-logo"
          />
          <p className="loading-subtitle">Preparing your library</p>
          <div className="loading-progress-track">
            <div className="loading-progress-fill" />
            <div className="loading-progress-shine" />
          </div>
          <div className="loading-dots">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-container error">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={initializeApp}>Retry</button>
        </div>
      </div>
    )
  }

  // Determine empty state message
  const emptyTitle = selectedPlaylistId
    ? 'Playlist is empty'
    : selectedFolder
      ? 'No tracks in this folder'
      : 'No tracks in library'

  const emptySubtitle = selectedPlaylistId
    ? 'Add tracks to this playlist from the track table'
    : selectedFolder
      ? "This folder doesn't contain any imported tracks"
      : 'Click "Scan Folder" to add music to your library'

  // Derive a unique view key so AnimatePresence knows when to animate
  const viewKey = showSettings
    ? 'settings'
    : showSearch
      ? 'search'
      : showAIChat
        ? 'ai-chat'
        : selectedPlaylistId
          ? `playlist-${selectedPlaylistId}`
          : selectedFolder
            ? `folder-${selectedFolder}`
            : showAllTracks
              ? 'all-tracks'
              : 'home'

  const activeView: 'home' | 'all-tracks' | 'folder' | 'playlist' | 'settings' | 'search' | 'ai-chat' = showSettings
    ? 'settings'
    : showSearch
      ? 'search'
      : showAIChat
        ? 'ai-chat'
        : selectedPlaylistId
          ? 'playlist'
          : selectedFolder
            ? 'folder'
            : showAllTracks
              ? 'all-tracks'
              : 'home'

  const sidebarEl = (
    <Sidebar
      libraryFolders={libraryFolders}
      playlists={playlists}
      selectedFolder={selectedFolder}
      selectedPlaylistId={selectedPlaylistId}
      totalTrackCount={totalTrackCount}
      activeView={activeView}
      toastMessage={headerNotification}
      onToastDismiss={() => setHeaderNotification(null)}
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
        setExportModal({ playlistId: id, playlistName: name })
      }
      onCreateSubfolder={handleCreateSubfolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
      folderTreeRef={folderTreeRef}
      onOpenSettings={() => {
        setShowSettings(true)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setShowSearch(false)
        setShowAIChat(false)
      }}
      onNavigateHome={() => {
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setShowSettings(false)
        setShowSearch(false)
        setShowAIChat(false)
      }}
      onShowAllTracks={() => {
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(true)
        setShowSettings(false)
        setShowSearch(false)
        setShowAIChat(false)
        loadTracks(null, null)
      }}
      onSearch={() => {
        setShowSearch(true)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setShowSettings(false)
        setShowAIChat(false)
        loadTracks(null, null)
      }}
      onNavigateAIChat={
        AI_ENABLED
          ? () => {
              setShowAIChat(true)
              setShowSettings(false)
              setShowSearch(false)
              setSelectedFolder(null)
              setSelectedPlaylistId(null)
              setShowAllTracks(false)
            }
          : undefined
      }
    />
  )

  const mainEl = (
    <>
      {/* Analysis progress bar (Traktor-style) */}
      <AnalysisProgress
        progress={analysisProgress}
        onCancel={handleCancelAnalysis}
      />

      {/* Scan progress bar (global — visible from any view) */}
      {scanProgress && (
        <div className="scan-progress-global">
          <div className="scan-progress__bar-wrapper">
            <div
              className="scan-progress__bar"
              style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="scan-progress__info">
            <span className="scan-progress__count">
              Scanning: [{scanProgress.current}/{scanProgress.total}]{' '}
              {scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%
            </span>
            {scanStartTime && scanProgress.current > 0 && (() => {
              const elapsed = Date.now() - scanStartTime
              const avg = elapsed / scanProgress.current
              const remaining = avg * (scanProgress.total - scanProgress.current)
              if (remaining < 60000) return <span className="scan-progress__eta">{Math.ceil(remaining / 1000)}s remaining</span>
              const mins = Math.ceil(remaining / 60000)
              return <span className="scan-progress__eta">{mins} min{mins === 1 ? '' : 's'} remaining</span>
            })()}
          </div>
          {scanProgress.currentFile && (
            <div className="scan-progress__filename">{scanProgress.currentFile}</div>
          )}
        </div>
      )}

      {/* Main content — Home view when nothing selected, TrackTable otherwise */}
      {/* AnimatePresence mode="wait" ensures old view fully exits before new view enters */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minWidth: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ height: '100%', overflow: 'auto', minWidth: 0 }}
          >
            {showSettings ? (
              <SettingsView
                onFoldersChanged={handleFoldersChanged}
                onThemeChanged={handleThemeChanged}
                onNotification={(message, type) => setNotification({ message, type })}
              />
            ) : showSearch ? (
              <SearchView
                tracks={tracks}
                playlists={playlists}
                onTrackPlay={handlePlayTrack}
                onPlaylistSelect={(id) => {
                  handlePlaylistSelect(id)
                  setShowSearch(false)
                }}
              />
            ) : showAIChat ? (
              <ChatView onPlaylistCreated={loadPlaylists} />
            ) : !selectedFolder && !selectedPlaylistId && !showAllTracks ? (
              <HomeView
                playlists={playlists}
                totalTrackCount={totalTrackCount}
                folderCount={libraryFolders.length}
                onPlaylistSelect={handlePlaylistSelect}
                onNavigateAIChat={
                  AI_ENABLED
                    ? () => {
                        setShowAIChat(true)
                        setSelectedPlaylistId(null)
                        setSelectedFolder(null)
                        setShowAllTracks(false)
                        setShowSearch(false)
                        setShowSettings(false)
                      }
                    : undefined
                }
                onOpenSettings={() => {
                  setShowSettings(true)
                  setShowAIChat(false)
                  setSelectedPlaylistId(null)
                  setSelectedFolder(null)
                  setShowAllTracks(false)
                  setShowSearch(false)
                }}
              />
            ) : tracks.length === 0 ? (
              <div className="empty-state">
                <h2>{emptyTitle}</h2>
                <p>{emptySubtitle}</p>
              </div>
            ) : (
              <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* Playlist detail header with scroll compression */}
                {selectedPlaylistId != null && (() => {
                  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId)
                  return selectedPlaylist ? (
                    <PlaylistDetailHeader
                      playlist={selectedPlaylist}
                      tracks={tracks}
                    />
                  ) : null
                })()}

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minWidth: 0 }}>
                  <TrackTable
                    ref={trackTableRef}
                    tracks={tracks}
                    playlists={playlists}
                    selectedPlaylistId={selectedPlaylistId}
                    onTrackClick={handleTrackClick}
                    onTrackDoubleClick={handlePlayTrack}
                    onAnalyzeTrack={handleAnalyzeTrack}
                    onAddToPlaylist={handleAddToPlaylist}
                    onRemoveFromPlaylist={handleRemoveFromPlaylist}
                    onSetGenre={handleSetGenre}
                    onClearGenre={handleClearGenre}
                    onUpdateTrack={handleUpdateTrack}
                    genreDefinitions={genreDefinitions}
                    onGenerateAIPlaylist={
                      AI_ENABLED ? handleGenerateAIPlaylist : undefined
                    }
                    onGetPlaylistRecommendations={
                      AI_ENABLED ? handleGetPlaylistRecommendations : undefined
                    }
                    onOpenMixPrep={AI_ENABLED ? handleOpenMixPrep : undefined}
                    onSearch={!selectedFolder && !selectedPlaylistId ? handleSearch : undefined}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )

  const playerEl = (
    <NowPlayingBar
      playlists={playlists}
      onTrackMetaClick={handleScrollToCurrentTrack}
      onAddToPlaylist={async (trackId, playlistId) => {
        try {
          await tauriApi.addTrackToPlaylist(playlistId, trackId)
          await loadPlaylists()
          const playlist = playlists.find((p) => p.id === playlistId)
          setHeaderNotification(`Added to ${playlist?.name ?? 'playlist'}`)
        } catch (err) {
          setNotification({
            message: `Failed to add: ${err instanceof Error ? err.message : String(err)}`,
            type: 'error',
          })
        }
      }}
      onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}
      onGetRecommendations={AI_ENABLED ? handleGetRecommendations : undefined}
    />
  )

  return (
    <>
      <AppShell sidebar={sidebarEl} main={mainEl} player={playerEl} />

      {/* Name prompt for Create Playlist / Create Folder / Rename (works in Tauri) */}
      <PromptModal
        open={promptState.open}
        title={promptState.title}
        defaultValue={promptState.defaultValue}
        onConfirm={handlePromptConfirm}
        onCancel={() =>
          setPromptState((p) => ({ ...p, open: false, action: null }))
        }
      />

      {/* Confirmation modal for deleting a library subfolder */}
      {deleteFolderModal.open && (
        <div
          className="modal-overlay"
          onClick={() =>
            setDeleteFolderModal({
              open: false,
              folderPath: '',
              folderName: '',
            })
          }
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {deleteFolderModal.folderName}?</h3>
            <p className="modal-subtitle">{deleteFolderModal.folderPath}</p>
            <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <button
                type="button"
                className="modal-button modal-button-secondary"
                onClick={() => confirmDeleteFolder(false)}
              >
                Remove from library only
              </button>
              <button
                type="button"
                className="modal-button modal-button-primary"
                onClick={() => confirmDeleteFolder(true)}
              >
                Delete folder and all files
              </button>
              <button
                type="button"
                className="modal-button modal-button-secondary"
                onClick={() =>
                  setDeleteFolderModal({
                    open: false,
                    folderPath: '',
                    folderName: '',
                  })
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share playlist modal (QR + link) */}
      {sharePlaylistModal && (
        <SharePlaylistModal
          open={sharePlaylistModal.open}
          playlistId={sharePlaylistModal.playlistId}
          playlistName={sharePlaylistModal.playlistName}
          companionUrl={sharePlaylistModal.companionUrl}
          companionToken={sharePlaylistModal.companionToken}
          onClose={() => setSharePlaylistModal(null)}
        />
      )}

      {/* Export playlist modal (copy tracks to a destination folder) */}
      {exportModal && (
        <ExportPlaylistModal
          playlistId={exportModal.playlistId}
          playlistName={exportModal.playlistName}
          onClose={() => setExportModal(null)}
          onSuccess={(msg, folderPath) => {
            setNotification({ message: msg, type: 'success' })
            // Refresh tracks + the library tree root that contains the new folder
            // so auto-imported files appear immediately.
            void loadTracks()
            void folderTreeRef.current?.refreshLibraryRoot(folderPath)
          }}
          onError={(msg) => setNotification({ message: msg, type: 'error' })}
        />
      )}

      {/* Update available toast — click Install to download, install, and restart */}
      {pendingUpdate && (
        <UpdateToast
          version={pendingUpdate.version}
          onInstall={async () => {
            const update = pendingUpdate
            setPendingUpdate(null)
            setNotification({ message: `Downloading update v${update.version}...`, type: 'info' })
            try {
              await update.downloadAndInstall()
              const isWindows = navigator.platform.startsWith('Win')
              if (isWindows) {
                setNotification({ message: 'Update installed. The app will restart automatically.', type: 'success' })
              } else {
                setNotification({ message: 'Restarting app...', type: 'success' })
                await relaunch()
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              setNotification({ message: `Update failed: ${msg}`, type: 'error' })
            }
          }}
          onLater={() => setPendingUpdate(null)}
        />
      )}

      {/* Notification toast */}
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* What's New dialog */}
      {whatsNew && (
        <WhatsNewDialog
          version={whatsNew.version}
          changes={whatsNew.changes}
          onClose={() => setWhatsNew(null)}
        />
      )}

      {/* AI Chat integrated into player — hidden for now */}

      {/* AI Playlist Generation Dialog */}
      {AI_ENABLED && aiPlaylistSeedTrack && (
        <AIPlaylistDialog
          seedTrack={aiPlaylistSeedTrack}
          onClose={() => setAiPlaylistSeedTrack(null)}
          onPlaylistSaved={(_playlistId) => {
            setAiPlaylistSeedTrack(null)
            loadPlaylists()
            setNotification({
              message: 'AI playlist created successfully!',
              type: 'success',
            })
          }}
        />
      )}

      {/* AI Recommendations Panel */}
      {AI_ENABLED && recommendationSeed && (
        <RecommendationsPanel
          seedTrack={recommendationSeed.track}
          playlistId={recommendationSeed.playlistId}
          playlistName={recommendationSeed.playlistName}
          onClose={() => setRecommendationSeed(null)}
        />
      )}

      {/* Mix Prep Panel */}
      {AI_ENABLED && mixPrepPlaylist && (
        <MixPrepPanel
          playlistId={mixPrepPlaylist.id}
          playlistName={mixPrepPlaylist.name}
          onClose={() => setMixPrepPlaylist(null)}
          onPlaylistReordered={() => {
            const reorderedId = mixPrepPlaylist.id
            setMixPrepPlaylist(null)
            setNotification({
              message: 'Playlist order updated!',
              type: 'success',
            })
            // Refresh the playlist tracks if we're currently viewing this playlist
            if (selectedPlaylistId === reorderedId) {
              loadTracks(null, reorderedId)
            }
          }}
        />
      )}
    </>
  )
}

export default App
