import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { SetPlayerBar } from './components/sets/SetPlayerBar'
import { SetPlayerEngine } from './lib/setPlayer/SetPlayerEngine'
import { useOverlay } from './lib/overlays'
import { useSetsView } from './store/setsViewStore'
import { useChannelNews } from './store/channelNewsStore'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { SetsView } from './components/views/SetsView'
import { ChatView } from './components/ai/ChatView'
import { PromptModal } from './components/PromptModal'
import { SharePlaylistModal } from './components/SharePlaylistModal'
import { ExportPlaylistModal } from './components/ExportPlaylistModal'
import { DjExportModal } from './components/DjExportModal'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { getChangesForVersion, type VersionChanges } from './lib/changelog'
import { importSet, setsToAutoImport } from './lib/tracklist/importSet'
import type { ChannelNews } from './types/youtube'
import { getErrorMessage } from './types/ai'
import type { TrackFilter } from './lib/trackTable/filter'
import appPackage from '../package.json'
import { UpdateToast } from './components/UpdateToast'
import { ShortcutsSheet } from './components/ShortcutsSheet'
import { ErrorBoundary } from './components/ErrorBoundary'
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
import { useSidebarPrefs } from './components/layout/useSidebarPrefs'
import { useSpotify } from './components/spotify/useSpotify'
import { SpotifyView } from './components/views/SpotifyView'
import {
  useYouTubeMusic,
  useYouTubeMusicMatches,
} from './components/youtube-music/useYouTubeMusic'
import { YouTubeMusicView } from './components/views/YouTubeMusicView'
import { DjView } from './components/views/DjView'
import { openSettingsSection } from './components/settings/openSections'
import { djKey } from './lib/dj/names'
import { noteDjOpened } from './lib/search/storage'
import { useFolderTreeStore } from './store/folderTreeStore'
import { useTrackTableLayout } from './store/trackTableLayoutStore'
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
  skipDetail,
  undoGroups,
  type Skip,
} from './lib/trackTable/moveMessages'
import {
  addedMessage,
  alreadyMessage,
  genreClearedMessage,
  genreSetMessage,
  genreSnapshot,
  removedMessage,
  tracksSubject,
} from './lib/trackTable/bulkMessages'
import type {
  Track,
  Playlist,
  LibraryFolder,
  MoveReport,
  AnalysisProgressEvent,
  AnalysisCompleteEvent,
} from './types/track'
import { EASE, MOTION } from './lib/motion'
import './App.css'
import './components/TrackTable.css'

const AI_ENABLED = false

type PromptAction =
  | { kind: 'create-playlist'; parentId: number | null }
  | { kind: 'create-folder'; parentId: number | null }
  | { kind: 'rename'; id: number; currentName: string }
  | { kind: 'create-subfolder'; parentPath: string }
  | { kind: 'rename-folder'; folderPath: string; currentName: string }

/** Where a DJ page was first opened from: Back returns there. */
type DjOrigin =
  | { view: 'search' }
  | { view: 'sets'; openVideoId: string | null }
  | { view: 'home' }
/** The open Spotify or YouTube Music list: 'all', or a list id. */
type StreamList = { service: 'spotify' | 'youtube-music'; listId: string }

interface DjPageState {
  name: string
  /** From a Spotify search card: that artist, stored as a manual match. */
  spotifyArtistId: string | null
  from: DjOrigin
}

/**
 * What the Sets view opens with: a set to open on its page (Back from a DJ
 * page opened from it, a DJ page's set card, Home, Search, the set bar) or a
 * DJ's name in its box (a DJ page's Find more), or its Library tab (Home's
 * Needs you). SetsView reads them once, when it mounts.
 */
interface SetsStart {
  openVideoId: string | null
  initialQuery: string
  tab?: 'library'
}

const NO_SETS_START: SetsStart = { openVideoId: null, initialQuery: '' }

function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // framer-motion follows the system's reduced motion: no movement, only fades.
  return (
    <MotionConfig reducedMotion="user">
      {hash === '#mini-player' ? <MiniPlayer /> : <AppContent />}
    </MotionConfig>
  )
}

function AppContent() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  // True once initDatabase has succeeded. `loading` is not enough: it turns
  // false after a failed init too.
  const [dbReady, setDbReady] = useState(false)
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
  const [showSets, setShowSets] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  /** The open Spotify or YouTube Music list; null when another view is open. */
  const [streamList, setStreamList] = useState<StreamList | null>(null)
  /** The open DJ page and where Back goes; null when another view is open. */
  const [djPage, setDjPage] = useState<DjPageState | null>(null)
  /** Search's query, held here so Back from a DJ page shows the same results. */
  const [searchQuery, setSearchQuery] = useState('')
  /** How Sets opens next; the sidebar's Sets opens it plain. */
  const [setsStart, setSetsStart] = useState<SetsStart>(NO_SETS_START)
  /**
   * Raised by every openSets: SetsView reads its start only when it mounts,
   * so each is a new SetsView — even one asking for the set already shown
   * (the set bar's text, from Sets' library).
   */
  const [setsVisit, setSetsVisit] = useState(0)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
  // Raised after each play is recorded: the track table's Plays column and
  // Home's cards read their counts again.
  const [playVersion, setPlayVersion] = useState(0)
  // Raised after an analysis finishes and after a rescan: Home's cards read
  // again (with playVersion, after a play).
  const [dataVersion, setDataVersion] = useState(0)
  // All Tracks opened with a filter while `tracks` holds a playlist's or a
  // folder's tracks: its rows wait for the library, so neither the wrong
  // rows nor "No tracks match" show for a moment.
  const [libraryPending, setLibraryPending] = useState(false)

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
  const sidebarPrefs = useSidebarPrefs({ dbReady })
  // YouTube Music first: while it is shown (connected, and Show in sidebar
  // on) useSpotify loads the library, whose index YouTube Music then matches
  // against. Hidden, it needs no matching. A DJ page needs the library too,
  // for Plays, Spotify or not.
  const youtubeMusic = useYouTubeMusic(dbReady)
  const youtubeMusicShown =
    youtubeMusic.connected && youtubeMusic.status?.showInSidebar !== false
  const spotify = useSpotify(
    dbReady,
    totalTrackCount,
    djPage !== null || youtubeMusicShown,
  )
  const youtubeMusicMatches = useYouTubeMusicMatches(youtubeMusic.library, spotify)

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

  // Export to DJ software (the playlist or folder whose menu opened it)
  const [djExport, setDjExport] = useState<{ openedFrom: number | null } | null>(null)

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

  // Pending update from auto-check on launch
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

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
  const [scanProgress, setScanProgress] = useState<{
    current: number
    total: number
    currentFile: string
    folder: string
  } | null>(null)
  const [scanStartTime, setScanStartTime] = useState<number | null>(null)

  // Listen for scan-progress events globally
  useEffect(() => {
    const unlisten = listen<{
      folder: string
      current: number
      total: number
      current_file: string
    }>('scan-progress', (event) => {
      const p = event.payload
      if (p.current >= p.total && p.total > 0) {
        setScanProgress(null)
        setScanStartTime(null)
        return
      } else {
        setScanProgress({
          current: p.current,
          total: p.total,
          currentFile: p.current_file,
          folder: p.folder,
        })
        setScanStartTime((prev) => prev ?? Date.now())
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // Cancel analysis — tells backend to stop Rayon workers
  function handleCancelAnalysis() {
    tauriApi.cancelAnalysis().catch(() => {})
  }

  // Listen for batch analysis events from backend
  useEffect(() => {
    const unlistenProgress = listen<AnalysisProgressEvent>(
      'analysis-progress',
      (event) => {
        const p = event.payload
        setAnalysisProgress({
          currentIndex: p.current,
          totalTracks: p.total,
          currentTrackName: p.track_name,
          totalDurationMs: 0,
          totalSizeBytes: 0,
          startTime: analysisStartTimeRef.current,
        })
      },
    )

    const unlistenComplete = listen<AnalysisCompleteEvent>(
      'analysis-complete',
      (event) => {
        const e = event.payload

        // Ensure progress bar is visible for at least 600ms to avoid flashing
        const elapsed = Date.now() - analysisStartTimeRef.current
        const minDisplayMs = 600
        const delay = Math.max(0, minDisplayMs - elapsed)

        setTimeout(() => {
          setAnalysisProgress(null)
          setAnalyzing(false)

          if (e.cancelled) {
            toast(`Analysis cancelled. ${e.total_analyzed} of ${e.total_requested} tracks analyzed.`, {
              kind: 'warning',
            })
          } else if (e.total_analyzed > 0) {
            toast(
              `Analyzed ${e.total_analyzed} tracks${e.total_failed > 0 ? ` (${e.total_failed} failed)` : ''}`,
            )
          } else {
            toast('All tracks already have BPM and Key analysis', { kind: 'info' })
          }

          // Reload tracks and rebuild AI context (use ref to avoid stale closure)
          loadTracksRef.current()
          tauriApi.rebuildAIContext().catch(() => {})
          setDataVersion((version) => version + 1)
        }, delay)
      },
    )

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
      setStreamList(null)
      setDjPage(null)
      setSelectedFolder(null)
      setSelectedPlaylistId(null)
      setShowAllTracks(false)
      setTableFilter(null)
      setShowSets(false)
      setShowSearch(false)
      setShowAIChat(false)
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
      setDbReady(true)

      // The track table's columns, before any table shows (no flash of the
      // default layout); the table remounts on every view, so it reads them here.
      await useTrackTableLayout.getState().load()

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
          const hasAny =
            changes.added.length > 0 ||
            changes.changed.length > 0 ||
            changes.fixed.length > 0
          if (hasAny) {
            setWhatsNew({ version: `v${currentVersion}`, changes })
          }
          await tauriApi.setSetting('last_seen_version', currentVersion)
        }
      } catch {
        console.warn("Failed to check version for What's New dialog")
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
  // What `tracks` holds: the whole library, or a playlist's or a folder's.
  const tracksAreLibraryRef = useRef(false)
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
        tracksAreLibraryRef.current = !playlist && !folder

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
        tracksAreLibraryRef.current = false
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

  // The automatic check for new sets runs in the background, so its result has
  // to arrive somewhere the user is actually looking — the Sets view may well be
  // closed. The Following tab carries the same event and shows the sets themselves.
  useEffect(() => {
    const stop = listen<ChannelNews[]>('yt-new-sets', async (event) => {
      // Home's New sets read again: the search has written its finds.
      setDataVersion((version) => version + 1)
      // The channels' news waits under each channel on Sets' Following tab.
      useChannelNews.getState().add(event.payload)
      const found = event.payload
      const total = found.reduce((sum, c) => sum + c.new_sets.length, 0)
      if (total === 0) return

      const who =
        found.length === 1
          ? (found[0].title ?? 'a channel you follow')
          : `${found.length} of the channels and DJs you follow`
      // A channel's news waits under it on Following; a DJ's finds are on
      // the library's New from DJs you watch.
      const where = found.every((item) => item.source === 'dj')
        ? 'Sets › Library'
        : found.every((item) => item.source !== 'dj')
          ? 'Sets › Following'
          : 'Sets'
      toast(`${total} new ${total === 1 ? 'set' : 'sets'} from ${who} — see ${where}`, {
        kind: 'info',
      })

      // Automatic import lives here rather than in the background task that
      // found these, because the parser is TypeScript: the backend can fetch a
      // set but has nothing to turn it into a tracklist.
      const wanted = found
        .filter((item) => item.auto_import)
        .flatMap((item) => item.new_sets.map((set) => set.video_id))
      if (wanted.length === 0) return

      const quota = await tauriApi.getYouTubeQuota().catch(() => null)
      const toImport = setsToAutoImport(wanted, quota?.remaining ?? 0)
      if (toImport.length === 0) return

      let imported = 0
      let empty = 0
      for (const videoId of toImport) {
        try {
          // A set that parses to nothing is not filed. Nobody chose to add it,
          // so it has to earn its row.
          const { stored } = await importSet(videoId, { onlyIfTracks: true })
          if (stored) imported += 1
          else empty += 1
        } catch {
          // One set that will not fetch must not stop the rest.
        }
      }
      // And again with the sets it filed: "saved", Sets you saved lately.
      setDataVersion((version) => version + 1)

      if (imported > 0 || empty > 0) {
        const parts: string[] = []
        if (imported > 0) {
          parts.push(`${imported} ${imported === 1 ? 'set' : 'sets'} imported automatically`)
        }
        if (empty > 0) parts.push(`${empty} had no tracklist and were skipped`)
        toast(parts.join(' · '), { kind: imported > 0 ? 'success' : 'info' })
      }
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])

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
      setDataVersion((version) => version + 1)
      // New or removed folders and changed counts, in the sidebar's tree
      void useFolderTreeStore
        .getState()
        .invalidateAll(libraryFoldersRef.current)
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
      // A scan or import may have added folders and tracks under the roots.
      void useFolderTreeStore.getState().invalidateAll(folders)
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
    setStreamList(null)
    setDjPage(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)

    await loadTracks(folderPath, null)
  }

  // A Spotify list: every other view closes, and opening it marks it seen.
  function openSpotifyList(listId: string) {
    setStreamList({ service: 'spotify', listId })
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    spotify.openList(listId)
  }

  // A YouTube Music list: the same, for the other service.
  function openYouTubeMusicList(listId: string) {
    setStreamList({ service: 'youtube-music', listId })
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    youtubeMusic.openList(listId)
  }

  // A DJ page. From another DJ page it replaces that one and keeps its origin,
  // so Back still returns to where the first one was opened. The origin's view
  // stays set underneath (showSearch / showSets; Home is what shows with
  // neither) and keeps its sidebar item lit.
  function openDj(name: string, spotifyArtistId: string | null = null, from?: DjOrigin) {
    const origin: DjOrigin =
      djPage?.from ?? from ?? (showSets ? { view: 'sets', openVideoId: null } : { view: 'search' })
    setDjPage({ name, spotifyArtistId, from: origin })
    // Search's Your DJs shows the pages opened most recently first.
    noteDjOpened(name)
  }

  // Back: the view the first DJ page was opened from — Search with its query,
  // Sets with the set the page was opened from open again, or Home. `djPage.from`
  // is gone once the page closes, so the set goes into `setsStart`.
  function closeDj() {
    if (!djPage) return
    if (djPage.from.view === 'sets') {
      openSets({ openVideoId: djPage.from.openVideoId, initialQuery: '' })
      return
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
    setDjPage(null)
    setStreamList(null)
    setShowSets(true)
    setShowSearch(false)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowAIChat(false)
  }

  // All Tracks, from the sidebar, or with a filter set from Search's genre
  // tiles or Home's cards. Search holds the whole library already, so the
  // filtered rows show at once while the tracks load again; after a playlist
  // or a folder, filtered rows wait for the library (`libraryPending`).
  function openAllTracks(filter: TrackFilter | null = null) {
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(true)
    setTableFilter(filter)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    const waiting = filter !== null && !tracksAreLibraryRef.current
    if (waiting) setLibraryPending(true)
    void loadTracks(null, null).finally(() => {
      if (waiting) setLibraryPending(false)
    })
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    await loadTracks(null, playlistId)
  }

  // Settings with one section open: a DJ page's "Connect Spotify", Home's
  // Import folder (Library).
  function openSettingsOn(section: string) {
    openSettingsSection(section)
    setShowSettings(true)
    setStreamList(null)
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setTableFilter(null)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
  }

  function openSpotifySettings() {
    openSettingsOn('spotify')
  }

  // Analyze folder — BPM and Key for tracks that don't have them yet (parallel batch)
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        toast('No audio tracks found in this folder', { kind: 'info' })
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

  // Analyze the selected tracks (BPM + Key) in one batch — decoded once each
  async function handleAnalyzeTracks(selected: Track[]) {
    // One analysis at a time: a second would reset the first one's cancel flag.
    if (analyzing) {
      toast('Analysis is already running', { kind: 'info' })
      return
    }
    const first = selected[0]
    try {
      setAnalyzing(true)
      setError(null)
      analysisStartTimeRef.current = Date.now()
      setAnalysisProgress({
        currentIndex: 0,
        totalTracks: selected.length,
        currentTrackName:
          first.title || first.file_path.split('/').pop() || 'Unknown',
        totalDurationMs: 0,
        totalSizeBytes: 0,
        startTime: Date.now(),
      })
      await new Promise((r) => setTimeout(r, 0))
      await tauriApi.analyzeTracksBatch(
        selected.map((t) => t.id),
        true,
      )
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
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
        toast(`Created folder "${value}"`)
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
  // The delete-folder modal is an overlay (useOverlay): Esc closes it, and
  // the set video steps aside while it is open.
  useOverlay(deleteFolderModal.open, () =>
    setDeleteFolderModal({ open: false, folderPath: '', folderName: '' }),
  )

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
        setTableFilter(null)
        await loadTracks(null, null)
      } else {
        await loadTracks()
      }
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
        setTableFilter(null)
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
        toast('Enable Companion in Settings first', { kind: 'warning' })
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
      toast(err instanceof Error ? err.message : 'Failed to get Companion status', {
        kind: 'error',
      })
    }
  }

  // The track table's right-click menu acts on its selection at once: one
  // call, one toast — with Undo, which puts back exactly what it changed —
  // and one reload of the view.

  // An Undo: put it back, then reload the view shown by then.
  function undoing(putBack: () => Promise<unknown>) {
    return {
      label: 'Undo',
      run: () => {
        putBack()
          .then(() => loadTracksRef.current())
          .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
      },
    }
  }

  async function handleAddToPlaylist(selected: Track[], playlistId: number) {
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    try {
      const { added, already } = await tauriApi.addTracksToPlaylist(
        playlistId,
        selected.map((t) => t.id),
      )
      await loadPlaylists()
      if (added.length === 0) {
        toast(alreadyMessage(selected, name), { kind: 'warning' })
        return
      }
      const addedTracks = selected.filter((t) => added.includes(t.id))
      toast(addedMessage(addedTracks, already.length, name), {
        action: undoing(async () => {
          await tauriApi.removeTracksFromPlaylist(playlistId, added)
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't add to ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Delete from the playlist shown; Undo adds them back in their old places.
  async function handleRemoveFromPlaylist(selected: Track[]) {
    if (selectedPlaylistId == null) return
    const playlistId = selectedPlaylistId
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    const ids = selected.map((t) => t.id)
    try {
      // The playlist's own order, not the table's sorted view.
      const before = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
      await tauriApi.removeTracksFromPlaylist(playlistId, ids)
      await loadTracks(null, playlistId)
      await loadPlaylists()
      toast(removedMessage(selected, name), {
        action: undoing(async () => {
          await tauriApi.addTracksToPlaylist(playlistId, ids)
          // The old order first; tracks added since keep their places after it.
          const now = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
          const old = new Set(before)
          await tauriApi.reorderPlaylistTracks(playlistId, [
            ...before,
            ...now.filter((id) => !old.has(id)),
          ])
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Dragged to another place in the playlist's own order: shown at once, then
  // stored; Undo puts the order before the drop back.
  async function handleReorderPlaylist(order: readonly number[]) {
    if (selectedPlaylistId == null) return
    const playlistId = selectedPlaylistId
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
    const byId = new Map(tracks.map((t) => [t.id, t]))
    setTracks(order.flatMap((id) => byId.get(id) ?? []))
    try {
      // Stored only when the table held exactly the playlist's tracks (not
      // the last view's, still showing while it loads).
      const before = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
      const shown = new Set(order)
      if (before.length !== order.length || !before.every((id) => shown.has(id))) {
        await loadTracksRef.current()
        return
      }
      await tauriApi.reorderPlaylistTracks(playlistId, [...order])
      toast(`Reordered ${name}`, {
        action: undoing(async () => {
          // The old order; tracks added since keep their places after it.
          const now = (await tauriApi.getPlaylistTracks(playlistId)).map((t) => t.id)
          const old = new Set(before)
          await tauriApi.reorderPlaylistTracks(playlistId, [
            ...before.filter((id) => now.includes(id)),
            ...now.filter((id) => !old.has(id)),
          ])
        }),
      })
    } catch (err) {
      await loadTracksRef.current()
      toast(`Couldn't reorder ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
      await tauriApi.bulkSetGenre(
        selected.map((t) => t.id),
        genre,
      )
      await loadTracks()
      await loadGenreDefinitions() // in case it is a new genre
      toast(genreSetMessage(selected, genre), {
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't set the genre: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  async function handleClearGenre(selected: Track[]) {
    const withGenre = selected.filter((t) => t.genre)
    const before = genreSnapshot(withGenre)
    try {
      await tauriApi.bulkClearGenre(withGenre.map((t) => t.id))
      await loadTracks()
      toast(genreClearedMessage(withGenre), {
        kind: 'info',
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Move to folder (track table spec): the files move on disk. The track
  // playing — and during a crossfade the one coming in — stays where it is:
  // the player streams it from its path.
  function tracksInUse(): Set<number> {
    const ids = new Set<number>()
    const current = usePlayerStore.getState().currentTrack
    if (current) ids.add(current.id)
    if (audioPlayer.incomingTrackId !== null) ids.add(audioPlayer.incomingTrackId)
    return ids
  }

  // Moves the tracks' files, then gives the player's queue their new paths,
  // forgets their covers (a folder's cover.jpg may differ), and reloads the
  // view and the sidebar's folder tree. Answers what moved and what stayed.
  async function moveFiles(
    ids: number[],
    folder: string,
  ): Promise<{ moved: MoveReport['moved']; skipped: Skip[] }> {
    const inUse = tracksInUse()
    const playing: Skip[] = ids.filter((id) => inUse.has(id)).map((id) => ({ id, reason: 'playing' }))
    const movable = ids.filter((id) => !inUse.has(id))
    const report: MoveReport =
      movable.length > 0
        ? await tauriApi.moveTracksToFolder(movable, folder)
        : { moved: [], skipped: [] }
    if (report.moved.length > 0) {
      usePlayerStore
        .getState()
        .patchTrackPaths(new Map(report.moved.map((m) => [m.id, m.newPath])))
      for (const { id } of report.moved) {
        thumbnails.forget(id)
        evictArtworkCache(id)
      }
      await loadTracksRef.current()
      // Home's track rows hold the old paths until they read again.
      setDataVersion((version) => version + 1)
      await useFolderTreeStore.getState().invalidateAll(libraryFoldersRef.current)
    }
    return { moved: report.moved, skipped: [...playing, ...report.skipped] }
  }

  async function handleMoveToFolder(selected: Track[], folder: LibraryFolder) {
    const name = folderName(folder.label)
    const byId = new Map(selected.map((t) => [t.id, t]))
    const titleOf = (id: number) => byId.get(id)?.title
    // A copy across disks takes a while: say so when it does.
    let working: number | null = null
    const slow = setTimeout(() => {
      working = toast(`Moving ${tracksSubject(selected)} to ${name}…`, { kind: 'info' })
    }, 400)
    try {
      const { moved, skipped } = await moveFiles(
        selected.map((t) => t.id),
        folder.path,
      )
      toast(movedMessage(moved.map((m) => byId.get(m.id)!), skipped, name), {
        kind: skipped.length > 0 ? 'warning' : 'success',
        detail: skipped.length > 0 ? skipDetail(skipped, titleOf) : undefined,
        // Undo: back to the folders they came from, once per folder; what
        // stays is reported as a move reports it.
        action:
          moved.length === 0
            ? undefined
            : {
                label: 'Undo',
                run: () => {
                  const oldPath = (id: number) => byId.get(id)!.file_path
                  ;(async () => {
                    const back: MoveReport['moved'] = []
                    const stayed: Skip[] = []
                    for (const group of undoGroups(moved, oldPath)) {
                      try {
                        const result = await moveFiles(group.ids, group.folder)
                        back.push(...result.moved)
                        stayed.push(...result.skipped)
                      } catch {
                        // Its folder is gone, or no longer in the library:
                        // these stay; the other folders still get theirs.
                        stayed.push(...group.ids.map((id) => ({ id, reason: 'failed' as const })))
                      }
                    }
                    if (stayed.length > 0) {
                      toast(movedMessage(back.map((m) => byId.get(m.id)!), stayed, 'where they were'), {
                        kind: 'warning',
                        detail: skipDetail(stayed, titleOf),
                      })
                    }
                  })().catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
                },
              },
      })
    } catch (err) {
      toast(`Couldn't move to ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      clearTimeout(slow)
      if (working !== null) dismissToast(working)
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

  // Home's New sets: Mark all seen. Its Undo marks exactly the rows it
  // changed unseen again; Home reads again after each.
  async function handleMarkAllSetsSeen() {
    try {
      const rows = await tauriApi.markAllDjFindsSeen()
      setDataVersion((version) => version + 1)
      const sets = new Set(rows.map((row) => row.videoId)).size
      if (sets === 0) return
      toast(`${sets.toLocaleString('en-US')} ${sets === 1 ? 'set' : 'sets'} marked seen`, {
        action: {
          label: 'Undo',
          run: () => {
            tauriApi
              .markDjFindsUnseen(rows)
              .then(() => setDataVersion((version) => version + 1))
              .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
          },
        },
      })
    } catch (err) {
      toast(`Couldn't mark the sets seen: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Home's Analyze all: exactly the tracks without a BPM, which Home read.
  function handleAnalyzeFromHome(trackIds: number[]) {
    if (analyzing) {
      toast('Analysis is already running', { kind: 'info' })
      return
    }
    if (trackIds.length === 0) {
      toast('Everything is analyzed', { kind: 'info' })
      return
    }
    void analyzeTrackIds(trackIds)
  }

  // BPM and key for these tracks, skipping those that have both (the
  // sidebar's Analyze All Tracks and Home's Analyze all).
  async function analyzeTrackIds(trackIds: number[]) {
    try {
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
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
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

  // `playlistId`: the playlist the play came from, when it is not the one
  // open in the table (Home's Your playlists).
  const handlePlayTrack = async (
    track: Track,
    sortedTracks: Track[],
    trackIndex: number,
    playlistId?: number,
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
        tauriApi
          .recordPlayEvent(trackToPlay.id, playlistId ?? selectedPlaylistId ?? null)
          .then(() => setPlayVersion((version) => version + 1))
          .catch(console.error)
      }
    } catch (err) {
      console.error('[App] Play error:', err)
      setPlayerError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // A playlist's ▶ on Home: from its first track, the playlist as the queue.
  async function playPlaylist(playlistId: number) {
    try {
      const list = await tauriApi.getPlaylistTracks(playlistId)
      if (list.length === 0) {
        toast('This playlist is empty', { kind: 'info' })
        return
      }
      await handlePlayTrack(list[0], list, 0, playlistId)
    } catch (err) {
      toast(`Could not play the playlist: ${getErrorMessage(err)}`, { kind: 'error' })
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

  // All Tracks keeps its table, and the search box in it, while the library
  // has tracks: no rows there is a search that found nothing, or the tracks
  // still loading.
  const allTracksWithLibrary =
    showAllTracks && !selectedFolder && !selectedPlaylistId && totalTrackCount > 0

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
  // A service's section and its view exist while its account is connected and
  // Show in sidebar is on. Off, an open list falls through to the default
  // view; DJ pages and Search still use Spotify.
  // (`youtubeMusicShown` is worked out next to the hooks, above.)
  const spotifyShown =
    spotify.connected && spotify.status?.showInSidebar !== false
  const shownSpotifyList =
    spotifyShown && streamList?.service === 'spotify' ? streamList.listId : null
  const shownYouTubeMusicList =
    youtubeMusicShown && streamList?.service === 'youtube-music'
      ? streamList.listId
      : null

  // The DJ page comes first: it opens over Search or Sets, whose flags stay set.
  const viewKey =
    djPage !== null
      ? `dj-${djKey(djPage.name)}`
      : shownSpotifyList !== null
      ? `spotify-${shownSpotifyList}`
      : shownYouTubeMusicList !== null
      ? `youtube-music-${shownYouTubeMusicList}`
      : showSets
        ? 'sets'
      : showSettings
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

  const activeView: ActiveView =
    djPage !== null
      ? 'dj'
      : shownSpotifyList !== null
      ? 'spotify'
      : shownYouTubeMusicList !== null
      ? 'youtube-music'
      : showSettings
        ? 'settings'
        : showSets
          ? 'sets'
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

  // A DJ page lights the section Back returns to: Search or Sets.
  const sidebarView: ActiveView = djPage !== null ? djPage.from.view : activeView

  const sidebarEl = (
    <Sidebar
      libraryFolders={libraryFolders}
      playlists={playlists}
      selectedFolder={selectedFolder}
      selectedPlaylistId={selectedPlaylistId}
      totalTrackCount={totalTrackCount}
      activeView={sidebarView}
      collapsed={sidebarPrefs.collapsed}
      onToggleCollapsed={sidebarPrefs.toggleCollapsed}
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
        setExportModal({ playlistId: id, playlistName: name })
      }
      onExportToDj={(id) => setDjExport({ openedFrom: id })}
      onCreateSubfolder={handleCreateSubfolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
      folderTreeRef={folderTreeRef}
      onOpenSettings={() => {
        setShowSettings(true)
        setStreamList(null)
        setDjPage(null)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setTableFilter(null)
        setShowSearch(false)
        setShowSets(false)
        setShowAIChat(false)
      }}
      onNavigateHome={() => {
        setStreamList(null)
        setDjPage(null)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setTableFilter(null)
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
          shownYouTubeMusicList === null
        setShowSets(true)
        if (!setsShowing) setSetsStart(NO_SETS_START)
        // Showing already, a set's page goes back to the library.
        else useSetsView.getState().requestLibrary()
        setStreamList(null)
        setDjPage(null)
        setShowSearch(false)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
        setTableFilter(null)
        setShowSettings(false)
        setShowAIChat(false)
      }}
      spotify={
        spotifyShown
          ? {
              lists: spotify.library.lists,
              counts: spotify.counts,
              newTotal: spotify.newCounts.total,
              newByList: spotify.newCounts.byList,
              activeListId: shownSpotifyList,
              onOpenList: openSpotifyList,
            }
          : undefined
      }
      youtubeMusic={
        youtubeMusicShown
          ? {
              lists: youtubeMusic.library.lists,
              counts: youtubeMusicMatches.counts,
              newTotal: youtubeMusicMatches.newCounts.total,
              newByList: youtubeMusicMatches.newCounts.byList,
              activeListId: shownYouTubeMusicList,
              onOpenList: openYouTubeMusicList,
              onAddPlaylist: youtubeMusic.addPlaylist,
              onRemovePlaylist: (listId) =>
                youtubeMusic.removePlaylist(listId).then(() => {
                  // The open list was removed: back to the default view.
                  setStreamList((p) =>
                    p?.service === 'youtube-music' && p.listId === listId
                      ? null
                      : p,
                  )
                }),
            }
          : undefined
      }
      onNavigateAIChat={
        AI_ENABLED
          ? () => {
              setShowAIChat(true)
              setStreamList(null)
              setDjPage(null)
              setShowSettings(false)
              setShowSearch(false)
              setShowSets(false)
              setSelectedFolder(null)
              setSelectedPlaylistId(null)
              setShowAllTracks(false)
              setTableFilter(null)
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
              style={{
                width: `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="scan-progress__info">
            <span className="scan-progress__count">
              Scanning: [{scanProgress.current}/{scanProgress.total}]{' '}
              {scanProgress.total > 0
                ? Math.round((scanProgress.current / scanProgress.total) * 100)
                : 0}
              %
            </span>
            {scanStartTime &&
              scanProgress.current > 0 &&
              (() => {
                const elapsed = Date.now() - scanStartTime
                const avg = elapsed / scanProgress.current
                const remaining =
                  avg * (scanProgress.total - scanProgress.current)
                if (remaining < 60000)
                  return (
                    <span className="scan-progress__eta">
                      {Math.ceil(remaining / 1000)}s remaining
                    </span>
                  )
                const mins = Math.ceil(remaining / 60000)
                return (
                  <span className="scan-progress__eta">
                    {mins} min{mins === 1 ? '' : 's'} remaining
                  </span>
                )
              })()}
          </div>
          {scanProgress.currentFile && (
            <div className="scan-progress__filename">
              {scanProgress.currentFile}
            </div>
          )}
        </div>
      )}

      {/* Main content — Home view when nothing selected, TrackTable otherwise */}
      {/* AnimatePresence mode="wait" ensures old view fully exits before new view enters */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          minWidth: 0,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.base, ease: EASE }}
            style={{ height: '100%', overflow: 'auto', minWidth: 0 }}
          >
            {/* A page that fails says so in its place; the sidebar and the player keep working. */}
            <ErrorBoundary level="page">
              {djPage !== null ? (
                <DjView
                  name={djPage.name}
                  spotifyArtistId={djPage.spotifyArtistId}
                  spotify={spotify}
                  onBack={closeDj}
                  onOpenSets={openSets}
                  onOpenDj={(name, spotifyArtistId) =>
                    openDj(name, spotifyArtistId)
                  }
                  onOpenSettings={openSpotifySettings}
                  onPlayTrack={handlePlayTrack}
                />
              ) : shownSpotifyList !== null ? (
                <SpotifyView
                  listId={shownSpotifyList}
                  spotify={spotify}
                  onPlayTrack={handlePlayTrack}
                />
              ) : shownYouTubeMusicList !== null ? (
                <YouTubeMusicView
                  listId={shownYouTubeMusicList}
                  youtubeMusic={youtubeMusic}
                  matches={youtubeMusicMatches}
                  library={spotify}
                  onPlayTrack={handlePlayTrack}
                  onOpenSet={(videoId) =>
                    openSets({ openVideoId: videoId, initialQuery: '' })
                  }
                />
              ) : showSets ? (
                <SetsView
                  // A new start is a new SetsView: it reads these props only when it mounts.
                  key={`sets-${setsVisit}`}
                  onPlayTrack={handlePlayTrack}
                  openVideoId={setsStart.openVideoId}
                  initialQuery={setsStart.initialQuery}
                  initialTab={setsStart.tab}
                  onOpenDj={(name, openVideoId) => openDj(name, null, { view: 'sets', openVideoId })}
                />
              ) : showSettings ? (
                <SettingsView
                  onFoldersChanged={handleFoldersChanged}
                  onThemeChanged={handleThemeChanged}
                  onNotification={(message, type) => toast(message, { kind: type })}
                />
              ) : showSearch ? (
                <SearchView
                  tracks={tracks}
                  playlists={playlists}
                  onTrackPlay={handlePlayTrack}
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  onOpenDj={(name, spotifyArtistId) => openDj(name, spotifyArtistId, { view: 'search' })}
                  spotify={spotify}
                  onOpenAllTracks={openAllTracks}
                  onOpenSet={(videoId) => openSets({ openVideoId: videoId, initialQuery: '' })}
                  playVersion={playVersion}
                  onPlaylistSelect={(id) => {
                    handlePlaylistSelect(id)
                    setStreamList(null)
                    setDjPage(null)
                    setShowSearch(false)
                    setShowSets(false)
                  }}
                />
              ) : showAIChat ? (
                <ChatView onPlaylistCreated={loadPlaylists} />
              ) : !selectedFolder && !selectedPlaylistId && !showAllTracks ? (
                <HomeView
                  dataVersion={playVersion + dataVersion}
                  playlists={playlists}
                  totalTrackCount={totalTrackCount}
                  folderCount={libraryFolders.length}
                  spotify={
                    spotifyShown
                      ? {
                          total: spotify.newCounts.total,
                          byList: spotify.newCounts.byList,
                          lists: spotify.library.lists,
                        }
                      : null
                  }
                  youtubeMusic={
                    youtubeMusicShown
                      ? {
                          total: youtubeMusicMatches.newCounts.total,
                          byList: youtubeMusicMatches.newCounts.byList,
                          lists: youtubeMusic.library.lists,
                        }
                      : null
                  }
                  onPlay={handlePlayTrack}
                  onPlayPlaylist={(id) => void playPlaylist(id)}
                  onOpenPlaylist={handlePlaylistSelect}
                  onOpenDj={(name) => openDj(name, null, { view: 'home' })}
                  onOpenSets={() => openSets(NO_SETS_START)}
                  onOpenSet={(videoId) => openSets({ openVideoId: videoId, initialQuery: '' })}
                  onOpenSetsLibrary={() => openSets({ ...NO_SETS_START, tab: 'library' })}
                  onMarkAllSetsSeen={() => void handleMarkAllSetsSeen()}
                  onOpenAllTracks={openAllTracks}
                  onOpenStreamList={(service, listId) =>
                    service === 'spotify' ? openSpotifyList(listId) : openYouTubeMusicList(listId)
                  }
                  onAnalyzeTracks={handleAnalyzeFromHome}
                  onCreatePlaylist={() => handleCreatePlaylist(null)}
                  onImportFolder={() => openSettingsOn('library')}
                  onAddToPlaylist={handleAddToPlaylist}
                  onMoveToFolder={handleMoveToFolder}
                />
              ) : showAllTracks && libraryPending ? (
                <div />
              ) : tracks.length === 0 && !allTracksWithLibrary ? (
                <div className="empty-state">
                  <h2>{emptyTitle}</h2>
                  <p>{emptySubtitle}</p>
                </div>
              ) : (
                <div
                  style={{
                    height: '100%',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Playlist detail header with scroll compression */}
                  {selectedPlaylistId != null &&
                    (() => {
                      const selectedPlaylist = playlists.find(
                        (p) => p.id === selectedPlaylistId,
                      )
                      return selectedPlaylist ? (
                        <PlaylistDetailHeader
                          playlist={selectedPlaylist}
                          tracks={tracks}
                          onCoverChanged={() => void loadPlaylists()}
                        />
                      ) : null
                    })()}

                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      position: 'relative',
                      minWidth: 0,
                    }}
                  >
                    <TrackTable
                      ref={trackTableRef}
                      tracks={tracks}
                      playlists={playlists}
                      selectedPlaylistId={selectedPlaylistId}
                      onTrackClick={handleTrackClick}
                      onTrackDoubleClick={handlePlayTrack}
                      onAnalyzeTracks={handleAnalyzeTracks}
                      onAddToPlaylist={handleAddToPlaylist}
                      onRemoveFromPlaylist={handleRemoveFromPlaylist}
                      onSetGenre={handleSetGenre}
                      onClearGenre={handleClearGenre}
                      onMoveToFolder={handleMoveToFolder}
                      onReorderPlaylist={handleReorderPlaylist}
                      onUpdateTrack={handleUpdateTrack}
                      genreDefinitions={genreDefinitions}
                      onGenerateAIPlaylist={
                        AI_ENABLED ? handleGenerateAIPlaylist : undefined
                      }
                      onGetPlaylistRecommendations={
                        AI_ENABLED ? handleGetPlaylistRecommendations : undefined
                      }
                      onOpenMixPrep={AI_ENABLED ? handleOpenMixPrep : undefined}
                      onSearch={
                        !selectedFolder && !selectedPlaylistId
                          ? handleSearch
                          : undefined
                      }
                      filter={tableFilter}
                      onFilterChange={setTableFilter}
                      playVersion={playVersion}
                      totalCount={
                        !selectedFolder && !selectedPlaylistId
                          ? totalTrackCount
                          : undefined
                      }
                    />
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )

  const playerEl = (
    <>
      {/* The set playing: its panel follows the set's page or this bar, and
          keeps playing when Sets closes. */}
      <SetPlayerEngine />
      <SetPlayerBar
        onOpenSet={(videoId) => openSets({ openVideoId: videoId, initialQuery: '' })}
      />
      <NowPlayingBar
        playlists={playlists}
        onTrackMetaClick={handleScrollToCurrentTrack}
        onAddToPlaylist={async (trackId, playlistId) => {
          try {
            const added = await tauriApi.addTrackToPlaylist(playlistId, trackId)
            await loadPlaylists()
            const playlistName =
              playlists.find((p) => p.id === playlistId)?.name ?? 'playlist'
            if (added) {
              toast(`Added to ${playlistName}`)
            } else {
              toast(`Track is already in ${playlistName}`, { kind: 'warning' })
            }
          } catch (err) {
            toast(`Failed to add: ${getErrorMessage(err)}`, { kind: 'error' })
          }
        }}
        onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}
        onGetRecommendations={AI_ENABLED ? handleGetRecommendations : undefined}
      />
    </>
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
            <div
              className="modal-actions"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <button type="button" className="btn" onClick={() => confirmDeleteFolder(false)}>
                Remove from library only
              </button>
              <button type="button" className="btn btn--danger" onClick={() => confirmDeleteFolder(true)}>
                Delete folder and all files
              </button>
              <button
                type="button"
                className="btn"
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
            toast(msg)
            // Refresh tracks + the library tree root that contains the new folder
            // so auto-imported files appear immediately.
            void loadTracks()
            void folderTreeRef.current?.refreshLibraryRoot(folderPath)
          }}
          onError={(msg) => toast(msg, { kind: 'error' })}
        />
      )}

      {/* Export to DJ software (Rekordbox XML) */}
      {djExport && (
        <DjExportModal openedFrom={djExport.openedFrom} onClose={() => setDjExport(null)} />
      )}

      {/* Update available toast — click Install to download, install, and restart */}
      {pendingUpdate && (
        <UpdateToast
          version={pendingUpdate.version}
          onInstall={async () => {
            const update = pendingUpdate
            setPendingUpdate(null)
            toast(`Downloading update v${update.version}...`, { kind: 'info' })
            try {
              await update.downloadAndInstall()
              const isWindows = navigator.platform.startsWith('Win')
              if (isWindows) {
                toast('Update installed. The app will restart automatically.')
              } else {
                toast('Restarting app...')
                await relaunch()
              }
            } catch (err) {
              toast(`Update failed: ${getErrorMessage(err)}`, { kind: 'error' })
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
            toast('AI playlist created successfully!')
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
            toast('Playlist order updated!')
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
