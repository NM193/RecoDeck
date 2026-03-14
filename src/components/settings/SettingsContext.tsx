import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { open, ask } from '@tauri-apps/plugin-dialog'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { tauriApi } from '../../lib/tauri-api'
import { useAIStore } from '../../store/aiStore'

// --- Types ---

interface UpdateProgress {
  status: 'checking' | 'downloading' | 'installing'
  progress: number
  totalBytes?: number
  downloadedBytes?: number
}

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  folder: string
}

export interface SettingsContextValue {
  // Library
  folders: string[]
  loading: boolean
  error: string | null
  setError: (error: string | null) => void
  scanningFolder: string | null
  scanProgress: ScanProgress | null
  scanStartTime: number | null
  handleAddFolder: () => Promise<void>
  handleRemoveFolder: (path: string) => Promise<void>
  handleRescanFolder: (path: string) => Promise<void>
  handleRescanAll: () => Promise<void>

  // Appearance
  currentTheme: string
  handleThemeChange: (themeId: string) => Promise<void>

  // Audio
  crossfadeEnabled: boolean
  crossfadeDuration: number
  handleCrossfadeEnabledChange: (enabled: boolean) => Promise<void>
  handleCrossfadeDurationChange: (duration: number) => Promise<void>

  // Database
  cleaningDuplicates: boolean
  normalizingPaths: boolean
  handleCleanupDuplicates: () => Promise<void>
  handleNormalizePaths: () => Promise<void>

  // AI
  isApiKeyConfigured: boolean
  apiKeyInput: string
  setApiKeyInput: (value: string) => void
  showApiKey: boolean
  setShowApiKey: (value: boolean) => void
  aiSaving: boolean
  handleSaveApiKey: () => Promise<void>
  handleDeleteApiKey: () => Promise<void>

  // Companion
  companionRunning: boolean
  companionUrl: string | null
  companionToken: string | null
  companionPortInput: string
  setCompanionPortInput: (value: string) => void
  companionActiveStreams: number
  companionLoading: boolean
  companionAutostart: boolean
  handleStartCompanion: () => Promise<void>
  handleStopCompanion: () => Promise<void>
  handleRegenerateToken: () => Promise<void>
  handleCompanionAutostartChange: (enabled: boolean) => Promise<void>

  // About
  appVersion: string
  updateChecking: boolean
  updateProgress: UpdateProgress | null
  handleCheckForUpdates: () => Promise<void>
}

// --- Callback props ---

export interface SettingsCallbacks {
  onFoldersChanged: () => void
  onThemeChanged: (theme: string) => void
  onNotification?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettingsContext() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsContext must be used inside SettingsProvider')
  return ctx
}

export function SettingsProvider({
  callbacks,
  children,
}: {
  callbacks: SettingsCallbacks
  children: ReactNode
}) {
  const { onFoldersChanged, onThemeChanged, onNotification } = callbacks

  // --- State ---
  const [folders, setFolders] = useState<string[]>([])
  const [currentTheme, setCurrentTheme] = useState('midnight')
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [crossfadeDuration, setCrossfadeDuration] = useState(8)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanningFolder, setScanningFolder] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scanStartTime, setScanStartTime] = useState<number | null>(null)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [normalizingPaths, setNormalizingPaths] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)

  // AI
  const { isApiKeyConfigured, checkApiKeyStatus, setApiKey, deleteApiKey } = useAIStore()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)

  // Companion
  const [companionRunning, setCompanionRunning] = useState(false)
  const [companionUrl, setCompanionUrl] = useState<string | null>(null)
  const [companionToken, setCompanionToken] = useState<string | null>(null)
  const [_companionPort, setCompanionPort] = useState<number>(8384)
  const [companionPortInput, setCompanionPortInput] = useState('8384')
  const [companionActiveStreams, setCompanionActiveStreams] = useState(0)
  const [companionLoading, setCompanionLoading] = useState(false)
  const [companionAutostart, setCompanionAutostart] = useState(false)

  // --- Load settings on mount ---
  useEffect(() => {
    loadSettings()
  }, [])

  // Listen for scan-progress events
  useEffect(() => {
    const unlisten = listen<{
      folder: string
      current: number
      total: number
      current_file: string
    }>('scan-progress', (event) => {
      setScanProgress({
        current: event.payload.current,
        total: event.payload.total,
        currentFile: event.payload.current_file,
        folder: event.payload.folder,
      })
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  // Listen for companion-started events
  useEffect(() => {
    const unlisten = listen<{
      running: boolean
      url: string | null
      token: string | null
      port: number | null
      active_streams: number
    }>('companion-started', (event) => {
      const info = event.payload
      setCompanionRunning(info.running)
      setCompanionUrl(info.url)
      setCompanionToken(info.token)
      if (info.port) {
        setCompanionPort(info.port)
        setCompanionPortInput(info.port.toString())
      }
      setCompanionActiveStreams(info.active_streams ?? 0)
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  async function loadSettings() {
    try {
      setError(null)
      const [
        loadedFolders,
        loadedTheme,
        loadedCrossfadeEnabled,
        loadedCrossfadeDuration,
      ] = await Promise.all([
        tauriApi.getLibraryFolders(),
        tauriApi.getTheme(),
        tauriApi.getSetting('crossfade_enabled').catch(() => 'false'),
        tauriApi.getSetting('crossfade_duration_sec').catch(() => '8'),
      ])

      await checkApiKeyStatus()

      try {
        const status = await tauriApi.getCompanionStatus()
        setCompanionRunning(status.running)
        setCompanionUrl(status.url)
        setCompanionToken(status.token)
        if (status.port) {
          setCompanionPort(status.port)
          setCompanionPortInput(status.port.toString())
        }
        setCompanionActiveStreams(status.active_streams)
      } catch { /* Companion commands may not be available */ }

      try {
        const autostart = await tauriApi.getSetting('companion_autostart')
        setCompanionAutostart(autostart !== 'false')
      } catch {
        setCompanionAutostart(true)
      }

      try {
        setAppVersion(await getVersion())
      } catch {
        setAppVersion('—')
      }

      setFolders(loadedFolders)
      setCurrentTheme(loadedTheme)
      setCrossfadeEnabled(loadedCrossfadeEnabled === 'true')
      setCrossfadeDuration(parseInt(loadedCrossfadeDuration || '8', 10) || 8)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // --- Library handlers ---

  async function handleAddFolder() {
    try {
      setError(null)
      const selectedPath = await open({ directory: true, multiple: false, title: 'Add Library Folder' })
      if (!selectedPath) return
      setLoading(true)
      const updatedFolders = await tauriApi.addLibraryFolder(selectedPath as string)
      setFolders(updatedFolders)
      setScanningFolder(selectedPath as string)
      setScanStartTime(Date.now())
      await tauriApi.scanDirectory(selectedPath as string)
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
      onFoldersChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveFolder(path: string) {
    try {
      setError(null)
      const confirmed = await ask(
        `Remove this folder from your library?\n\n${path}\n\nAll tracks from this folder will be removed from your library (playlists will be kept).`,
        { title: 'Remove Library Folder', kind: 'warning', okLabel: 'Remove', cancelLabel: 'Cancel' },
      )
      if (!confirmed) return
      setLoading(true)
      const updatedFolders = await tauriApi.removeLibraryFolder(path)
      setFolders(updatedFolders)
      try {
        const removed = await tauriApi.cleanupStrayTracks()
        if (removed > 0) {
          onNotification?.(`Removed ${removed} track${removed > 1 ? 's' : ''} from library`, 'info')
        }
      } catch (cleanupErr) {
        console.warn('Failed to cleanup tracks:', cleanupErr)
      }
      onFoldersChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRescanFolder(path: string) {
    try {
      setError(null)
      setScanningFolder(path)
      setScanStartTime(Date.now())
      await tauriApi.scanDirectory(path)
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
      onFoldersChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
    }
  }

  async function handleRescanAll() {
    try {
      setError(null)
      setLoading(true)
      for (const folder of folders) {
        setScanningFolder(folder)
        setScanStartTime(Date.now())
        setScanProgress(null)
        await tauriApi.scanDirectory(folder)
      }
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
      onFoldersChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScanningFolder(null)
      setScanProgress(null)
      setScanStartTime(null)
    } finally {
      setLoading(false)
    }
  }

  // --- Appearance handlers ---

  async function handleThemeChange(themeId: string) {
    try {
      setError(null)
      await tauriApi.setTheme(themeId)
      setCurrentTheme(themeId)
      onThemeChanged(themeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // --- Audio handlers ---

  async function handleCrossfadeEnabledChange(enabled: boolean) {
    try {
      setError(null)
      await tauriApi.setSetting('crossfade_enabled', enabled ? 'true' : 'false')
      setCrossfadeEnabled(enabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleCrossfadeDurationChange(duration: number) {
    try {
      setError(null)
      const clamped = Math.max(1, Math.min(30, duration))
      await tauriApi.setSetting('crossfade_duration_sec', clamped.toString())
      setCrossfadeDuration(clamped)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // --- Database handlers ---

  async function handleCleanupDuplicates() {
    try {
      setError(null)
      setCleaningDuplicates(true)
      const duplicatesRemoved = await tauriApi.cleanupDuplicateTracks()
      if (duplicatesRemoved > 0) {
        onNotification?.(`Successfully removed ${duplicatesRemoved} duplicate track${duplicatesRemoved > 1 ? 's' : ''}`, 'success')
        onFoldersChanged()
      } else {
        onNotification?.('No duplicates found', 'info')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      onNotification?.(errorMsg, 'error')
    } finally {
      setCleaningDuplicates(false)
    }
  }

  async function handleNormalizePaths() {
    try {
      setError(null)
      setNormalizingPaths(true)
      const pathsNormalized = await tauriApi.normalizeFilePaths()
      if (pathsNormalized > 0) {
        onNotification?.(`Successfully normalized ${pathsNormalized} file path${pathsNormalized > 1 ? 's' : ''}`, 'success')
        onFoldersChanged()
      } else {
        onNotification?.('All file paths are already normalized', 'info')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      onNotification?.(errorMsg, 'error')
    } finally {
      setNormalizingPaths(false)
    }
  }

  // --- AI handlers ---

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) {
      setError('Please enter an API key')
      return
    }
    try {
      setError(null)
      setAiSaving(true)
      await setApiKey(apiKeyInput.trim())
      await checkApiKeyStatus()
      setApiKeyInput('')
      onNotification?.('API key saved successfully! You can now use the AI assistant.', 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      onNotification?.(errorMsg, 'error')
    } finally {
      setAiSaving(false)
    }
  }

  async function handleDeleteApiKey() {
    const confirmed = await ask('Are you sure you want to delete your Claude API key?', {
      title: 'Delete API Key',
      kind: 'warning',
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
    try {
      setError(null)
      await deleteApiKey()
      setApiKeyInput('')
      onNotification?.('API key deleted', 'info')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      onNotification?.(errorMsg, 'error')
    }
  }

  // --- Companion handlers ---

  async function handleStartCompanion() {
    try {
      setError(null)
      setCompanionLoading(true)
      const portNum = parseInt(companionPortInput, 10) || 8384
      const info = await tauriApi.startCompanionServer(portNum)
      setCompanionRunning(info.running)
      setCompanionUrl(info.url)
      setCompanionToken(info.token)
      if (info.port) {
        setCompanionPort(info.port)
        setCompanionPortInput(info.port.toString())
      }
      setCompanionActiveStreams(info.active_streams)
      onNotification?.('Mobile companion server started', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onNotification?.(msg, 'error')
    } finally {
      setCompanionLoading(false)
    }
  }

  async function handleStopCompanion() {
    try {
      setError(null)
      setCompanionLoading(true)
      await tauriApi.stopCompanionServer()
      setCompanionRunning(false)
      setCompanionUrl(null)
      setCompanionToken(null)
      setCompanionActiveStreams(0)
      onNotification?.('Mobile companion server stopped', 'info')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onNotification?.(msg, 'error')
    } finally {
      setCompanionLoading(false)
    }
  }

  async function handleRegenerateToken() {
    try {
      setError(null)
      setCompanionLoading(true)
      const info = await tauriApi.regenerateCompanionToken()
      setCompanionRunning(info.running)
      setCompanionUrl(info.url)
      setCompanionToken(info.token)
      if (info.port) {
        setCompanionPort(info.port)
        setCompanionPortInput(info.port.toString())
      }
      setCompanionActiveStreams(info.active_streams)
      onNotification?.('Token regenerated. Reconnect your phone.', 'info')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onNotification?.(msg, 'error')
    } finally {
      setCompanionLoading(false)
    }
  }

  async function handleCompanionAutostartChange(enabled: boolean) {
    setCompanionAutostart(enabled)
    try {
      await tauriApi.setSetting('companion_autostart', enabled ? 'true' : 'false')
    } catch {
      setCompanionAutostart(!enabled)
    }
  }

  // --- About handlers ---

  async function handleCheckForUpdates() {
    try {
      setUpdateChecking(true)
      setError(null)
      setUpdateProgress({ status: 'checking', progress: 0 })

      const update = await check()

      if (update) {
        setUpdateProgress({ status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })
        onNotification?.(`Update ${update.version} available. Downloading...`, 'info')

        let downloadedBytes = 0
        let totalBytes = 0

        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            totalBytes = event.data.contentLength ?? 0
            setUpdateProgress((p) => p ? { ...p, totalBytes, downloadedBytes: 0, progress: 0 } : p)
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength
            const progress = totalBytes > 0 ? Math.min(95, Math.round((downloadedBytes / totalBytes) * 100)) : 0
            setUpdateProgress((p) => p ? { ...p, downloadedBytes, totalBytes, progress } : p)
          } else if (event.event === 'Finished') {
            setUpdateProgress((p) => p ? { ...p, status: 'installing', progress: 98 } : p)
          }
        })

        setUpdateProgress((p) => p ? { ...p, status: 'installing', progress: 100 } : p)

        const restartNow = await ask(
          'Update v' + update.version + ' has been downloaded.\n\nDo you want to restart now to apply it? If you choose Later, the new version will be applied the next time you open the app.',
          { title: 'Restart to Update', kind: 'info', okLabel: 'Restart Now', cancelLabel: 'Later' },
        )

        if (restartNow) {
          const isWindows = navigator.platform.startsWith('Win')
          if (isWindows) {
            // NSIS auto-exits the process after install — relaunch() would crash
            onNotification?.('Update installed. The app will close and restart automatically.', 'success')
          } else {
            onNotification?.('Restarting app...', 'success')
            await relaunch()
          }
        } else {
          onNotification?.('Update will be applied when you restart the app.', 'info')
        }
      } else {
        setUpdateProgress(null)
        onNotification?.("You're on the latest version.", 'success')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Update check failed: ${msg}`)
      onNotification?.(`Update check failed: ${msg}`, 'error')
      setUpdateProgress(null)
    } finally {
      setUpdateChecking(false)
      setUpdateProgress(null)
    }
  }

  // --- Context value ---

  const value: SettingsContextValue = {
    folders, loading, error, setError, scanningFolder, scanProgress, scanStartTime,
    handleAddFolder, handleRemoveFolder, handleRescanFolder, handleRescanAll,
    currentTheme, handleThemeChange,
    crossfadeEnabled, crossfadeDuration,
    handleCrossfadeEnabledChange, handleCrossfadeDurationChange,
    cleaningDuplicates, normalizingPaths,
    handleCleanupDuplicates, handleNormalizePaths,
    isApiKeyConfigured, apiKeyInput, setApiKeyInput, showApiKey, setShowApiKey, aiSaving,
    handleSaveApiKey, handleDeleteApiKey,
    companionRunning, companionUrl, companionToken, companionPortInput, setCompanionPortInput,
    companionActiveStreams, companionLoading, companionAutostart,
    handleStartCompanion, handleStopCompanion, handleRegenerateToken, handleCompanionAutostartChange,
    appVersion, updateChecking, updateProgress, handleCheckForUpdates,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
