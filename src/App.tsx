import { useEffect, useState, useCallback, useRef } from "react";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { appDataDir, join } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { TrackTable, type TrackTableRef } from "./components/TrackTable";
import { Player } from "./components/Player";
import { Settings } from "./components/Settings";
import { FolderTree } from "./components/FolderTree";
import { PromptModal } from "./components/PromptModal";
import { Notification } from "./components/Notification";
import { AnalysisProgress, type AnalysisProgressData } from "./components/AnalysisProgress";
import { PlayerAIChat } from "./components/ai/PlayerAIChat";
import { Icon } from "./components/Icon";
import { usePlayerStore } from "./store/playerStore";
import { tauriApi } from "./lib/tauri-api";
import type { Track, Playlist } from "./types/track";
import "./App.css";
import "./components/TrackTable.css";

type PromptAction =
  | { kind: "create-playlist"; parentId: number | null }
  | { kind: "create-folder"; parentId: number | null }
  | { kind: "rename"; id: number; currentName: string };

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [keyNotation, setKeyNotation] = useState<"camelot" | "openkey">("camelot");
  const [, setWaveformStyle] = useState<string>("traktor_rgb");

  // Folder tree state
  const [libraryFolders, setLibraryFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Playlist state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null
  );

  // Genre state
  const [genreDefinitions, setGenreDefinitions] = useState<Array<{ id: number; name: string; color?: string }>>([]);

  // Total track count for "All Tracks" display
  const [totalTrackCount, setTotalTrackCount] = useState<number>(0);

  // Pagination state for lazy loading
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Name prompt modal (works in Tauri where window.prompt is not available)
  const [promptState, setPromptState] = useState<{
    open: boolean;
    title: string;
    defaultValue: string;
    action: PromptAction | null;
  }>({ open: false, title: "", defaultValue: "", action: null });

  // Notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  } | null>(null);

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressData | null>(null);
  const [analysisCancelled, setAnalysisCancelled] = useState(false);

  // Cancel analysis
  function handleCancelAnalysis() {
    setAnalysisCancelled(true);
    setAnalysisProgress(null);
  }

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      const dataDir = await appDataDir();
      const dbPath = await join(dataDir, "recodeck.db");
      await tauriApi.initDatabase(dbPath);

      // PERFORMANCE: Skip expensive path normalization on startup
      // This operation loads all tracks into memory - users can run it manually via settings if needed

      // Load saved theme
      try {
        const savedTheme = await tauriApi.getTheme();
        applyTheme(savedTheme);
      } catch {
        console.warn("Failed to load saved theme, using default");
      }

      // Load saved key notation preference
      try {
        const savedKeyNotation = await tauriApi.getSetting("key_notation");
        if (savedKeyNotation === "openkey" || savedKeyNotation === "camelot") {
          setKeyNotation(savedKeyNotation);
        }
      } catch {
        console.warn("Failed to load key notation preference, using default");
      }

      // Load saved waveform style preference
      try {
        const savedWaveformStyle = await tauriApi.getSetting("waveform_style");
        if (savedWaveformStyle) {
          setWaveformStyle(savedWaveformStyle);
        }
      } catch {
        console.warn("Failed to load waveform style preference, using default");
      }

      // Load library folders
      let folders: string[] = [];
      try {
        folders = await tauriApi.getLibraryFolders();
        setLibraryFolders(folders);
      } catch {
        console.warn("Failed to load library folders");
      }

      // PERFORMANCE: Skip stray track cleanup on startup - will be optimized to use SQL
      // Users can run this manually via settings if needed

      // PERFORMANCE: Skip library scanning on startup - file watcher will catch new files
      // Users can manually scan via settings if needed

      // Load playlists
      await loadPlaylists();

      // Load genre definitions
      await loadGenreDefinitions();

      // PERFORMANCE: Don't load all tracks on startup - load only total count
      // Tracks will be loaded when user selects a folder or playlist
      try {
        const total = await tauriApi.countTracks();
        setTotalTrackCount(total);
      } catch {
        console.warn("Failed to get track count");
      }

      // Set empty tracks array initially
      setTracks([]);

      // Start file watcher on library folders
      if (folders.length > 0) {
        try {
          await tauriApi.startFileWatcher(folders);
          console.log("File watcher started for", folders.length, "folders");
        } catch (watchErr) {
          console.warn("Failed to start file watcher:", watchErr);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Load tracks — all, by folder, or by playlist
  const loadTracks = useCallback(
    async (folderPath?: string | null, playlistId?: number | null) => {
      try {
        const folder =
          folderPath !== undefined ? folderPath : selectedFolder;
        const playlist =
          playlistId !== undefined ? playlistId : selectedPlaylistId;

        let result: Track[];
        let total = 0;

        if (playlist) {
          result = await tauriApi.getPlaylistTracks(playlist);
          setHasMoreTracks(false); // Playlists load all tracks at once
        } else if (folder) {
          // Use recursive query for library root folders, shallow for subfolders
          const isRootFolder = libraryFolders.includes(folder);
          result = isRootFolder
            ? await tauriApi.getTracksInFolder(folder)
            : await tauriApi.getTracksInFolderShallow(folder);
          setHasMoreTracks(false); // Folder views load all tracks at once
        } else {
          // PERFORMANCE: For "All Tracks" view, load in batches
          // Load first 1000 tracks initially - good balance between performance and UX
          const batchSize = 1000;
          result = await tauriApi.getTracksPaginated(batchSize, 0);

          // Get total count to determine if there are more tracks
          total = await tauriApi.countTracks();
          setHasMoreTracks(result.length < total);
        }

        setTracks(result);

        // Always update total track count
        try {
          if (total === 0) {
            total = await tauriApi.countTracks();
          }
          setTotalTrackCount(total);
        } catch {
          // Ignore count errors
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [selectedFolder, selectedPlaylistId, libraryFolders]
  );

  // Load more tracks (for "All Tracks" pagination)
  const loadMoreTracks = useCallback(async () => {
    if (isLoadingMore || !hasMoreTracks || selectedFolder || selectedPlaylistId) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const batchSize = 1000;
      const currentOffset = tracks.length;

      const moreTracks = await tauriApi.getTracksPaginated(batchSize, currentOffset);

      if (moreTracks.length > 0) {
        setTracks(prev => [...prev, ...moreTracks]);
        setHasMoreTracks(tracks.length + moreTracks.length < totalTrackCount);
      } else {
        setHasMoreTracks(false);
      }
    } catch (err) {
      console.error("Failed to load more tracks:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreTracks, selectedFolder, selectedPlaylistId, tracks.length, totalTrackCount]);

  // Load playlists from backend
  const loadPlaylists = useCallback(async () => {
    try {
      const all = await tauriApi.getAllPlaylists();
      setPlaylists(all);
    } catch (err) {
      console.warn("Failed to load playlists:", err);
    }
  }, []);

  // Load genre definitions from backend
  const loadGenreDefinitions = useCallback(async () => {
    try {
      const defs = await tauriApi.getGenreDefinitions();
      setGenreDefinitions(defs);
    } catch (err) {
      console.warn("Failed to load genre definitions:", err);
    }
  }, []);

  // Keep a ref to loadTracks so the event listener always uses the latest version
  const loadTracksRef = useRef(loadTracks);
  loadTracksRef.current = loadTracks;
  const libraryFoldersRef = useRef(libraryFolders);
  libraryFoldersRef.current = libraryFolders;

  // Ref for TrackTable to access scroll methods
  const trackTableRef = useRef<TrackTableRef>(null);

  // Listen for file system changes and auto-refresh
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen("library-changed", async () => {
      console.log("Library changed detected, re-scanning...");
      // Re-scan all library folders to pick up new files
      for (const folder of libraryFoldersRef.current) {
        try {
          await tauriApi.scanDirectory(folder);
        } catch (err) {
          console.warn(`Failed to re-scan folder ${folder}:`, err);
        }
      }
      // Reload tracks
      await loadTracksRef.current();
      // Rebuild AI context cache
      tauriApi.rebuildAIContext().catch(() => {});
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  function applyTheme(theme: string) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  // Settings callbacks
  async function handleFoldersChanged() {
    let folders: string[] = [];
    try {
      folders = await tauriApi.getLibraryFolders();
      setLibraryFolders(folders);
    } catch {
      console.warn("Failed to refresh library folders");
    }
    // Restart file watcher with updated folders
    try {
      await tauriApi.startFileWatcher(folders);
    } catch {
      console.warn("Failed to restart file watcher");
    }
    loadTracks();
  }

  function handleThemeChanged(theme: string) {
    applyTheme(theme);
  }

  function handleKeyNotationChanged(notation: string) {
    if (notation === "openkey" || notation === "camelot") {
      setKeyNotation(notation);
    }
  }

  function handleWaveformStyleChanged(style: string) {
    setWaveformStyle(style);
  }

  // Folder selection from Track Collection
  async function handleFolderSelect(folderPath: string | null) {
    setSelectedFolder(folderPath);
    setSelectedPlaylistId(null);

    // Debug: show what we're searching for
    if (folderPath) {
      console.log(`=== Selecting folder: ${folderPath} ===`);
      try {
        const debugTracks = await tauriApi.getDebugTracks();
        const pattern = `${folderPath}/`;
        console.log(`Looking for tracks starting with: ${pattern}`);
        const matching = debugTracks.filter(t => t.file_path.startsWith(pattern));
        console.log(`Found ${matching.length} matching tracks:`);
        matching.forEach(t => console.log(`  - ${t.file_path}`));
        const nonMatching = debugTracks.filter(t => !t.file_path.startsWith(pattern));
        console.log(`Non-matching tracks (${nonMatching.length}):`);
        nonMatching.forEach(t => console.log(`  - ${t.file_path}`));
      } catch {
        // ignore
      }
    }

    await loadTracks(folderPath, null);
  }

  // Playlist selection
  async function handlePlaylistSelect(playlistId: number) {
    setSelectedPlaylistId(playlistId);
    setSelectedFolder(null);
    await loadTracks(null, playlistId);
  }

  // Analyze folder — BPM and Key for tracks that don't have them yet
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      setAnalyzing(true);
      setAnalysisCancelled(false);
      setError(null);

      const folderTracks = await tauriApi.getTracksInFolder(folderPath);
      
      // Filter tracks that need analysis
      const tracksToAnalyze = folderTracks.filter(
        (t) => t.id && (!t.bpm || !t.musical_key)
      );

      if (tracksToAnalyze.length === 0) {
        if (folderTracks.length === 0) {
          setNotification({
            message: "No audio tracks found in this folder",
            type: "info",
          });
        } else {
          setNotification({
            message: "All tracks in this folder already have BPM and Key analysis",
            type: "info",
          });
        }
        return;
      }

      // Calculate total duration and size
      const totalDurationMs = tracksToAnalyze.reduce(
        (sum, t) => sum + (t.duration_ms || 0),
        0
      );
      const totalSizeBytes = tracksToAnalyze.reduce(
        (sum, t) => sum + (t.file_size || 0),
        0
      );

      const startTime = Date.now();
      let bpmCount = 0;
      let keyCount = 0;

      for (let i = 0; i < tracksToAnalyze.length; i++) {
        if (analysisCancelled) {
          setNotification({
            message: `Analysis cancelled. Analyzed ${bpmCount + keyCount} tracks.`,
            type: "warning",
          });
          break;
        }

        const track = tracksToAnalyze[i];
        if (!track.id) continue;

        // Update progress
        setAnalysisProgress({
          currentIndex: i + 1,
          totalTracks: tracksToAnalyze.length,
          currentTrackName: track.title || track.file_path.split("/").pop() || "Unknown",
          totalDurationMs,
          totalSizeBytes,
          startTime,
        });

        // Allow UI to update by yielding to the event loop
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
          if (!track.bpm) {
            await tauriApi.analyzeBpm(track.id);
            bpmCount++;
          }
          if (!track.musical_key) {
            await tauriApi.analyzeKey(track.id);
            keyCount++;
          }
        } catch (err) {
          console.warn(`Failed to analyze track ${track.id}:`, err);
        }
      }

      setAnalysisProgress(null);
      await loadTracks();

      if (!analysisCancelled && (bpmCount > 0 || keyCount > 0)) {
        const parts = [];
        if (bpmCount > 0) parts.push(`BPM: ${bpmCount}`);
        if (keyCount > 0) parts.push(`Key: ${keyCount}`);
        setNotification({
          message: `Analyzed ${parts.join(", ")} tracks in folder`,
          type: "success",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisCancelled(false);
      // Rebuild AI context cache with updated analysis data
      tauriApi.rebuildAIContext().catch(() => {});
    }
  }

  // Analyze a single track (BPM + Key)
  async function handleAnalyzeTrack(track: Track) {
    try {
      setAnalyzing(true);
      setAnalysisCancelled(false);
      setError(null);

      // Show progress for single track
      setAnalysisProgress({
        currentIndex: 1,
        totalTracks: 1,
        currentTrackName: track.title || track.file_path.split("/").pop() || "Unknown",
        totalDurationMs: track.duration_ms || 0,
        totalSizeBytes: track.file_size || 0,
        startTime: Date.now(),
      });

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));

      // Always analyze both BPM and Key (re-analyze if already exists)
      await tauriApi.analyzeBpm(track.id);
      await tauriApi.analyzeKey(track.id);

      setAnalysisProgress(null);
      await loadTracks();

      setNotification({
        message: `Analysis complete for "${track.title || "track"}"`,
        type: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisCancelled(false);
      // Rebuild AI context cache with updated analysis data
      tauriApi.rebuildAIContext().catch(() => {});
    }
  }

  // Analyze BPM only for a single track
  async function handleAnalyzeBpm(track: Track) {
    try {
      setAnalyzing(true);
      setAnalysisCancelled(false);
      setError(null);

      // Show progress for single track
      setAnalysisProgress({
        currentIndex: 1,
        totalTracks: 1,
        currentTrackName: track.title || track.file_path.split("/").pop() || "Unknown",
        totalDurationMs: track.duration_ms || 0,
        totalSizeBytes: track.file_size || 0,
        startTime: Date.now(),
      });

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));

      await tauriApi.analyzeBpm(track.id);

      setAnalysisProgress(null);
      await loadTracks();

      setNotification({
        message: `BPM analysis complete for "${track.title || "track"}"`,
        type: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotification({
        message: `BPM analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisCancelled(false);
      // Rebuild AI context cache with updated analysis data
      tauriApi.rebuildAIContext().catch(() => {});
    }
  }

  // Analyze Key only for a single track
  async function handleAnalyzeKey(track: Track) {
    try {
      setAnalyzing(true);
      setAnalysisCancelled(false);
      setError(null);

      // Show progress for single track
      setAnalysisProgress({
        currentIndex: 1,
        totalTracks: 1,
        currentTrackName: track.title || track.file_path.split("/").pop() || "Unknown",
        totalDurationMs: track.duration_ms || 0,
        totalSizeBytes: track.file_size || 0,
        startTime: Date.now(),
      });

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));

      await tauriApi.analyzeKey(track.id);

      setAnalysisProgress(null);
      await loadTracks();

      setNotification({
        message: `Key analysis complete for "${track.title || "track"}"`,
        type: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotification({
        message: `Key analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisCancelled(false);
      // Rebuild AI context cache with updated analysis data
      tauriApi.rebuildAIContext().catch(() => {});
    }
  }

  // Create playlist — open name modal (prompt() doesn't work in Tauri)
  function handleCreatePlaylist(parentId: number | null) {
    setPromptState({
      open: true,
      title: "Playlist name",
      defaultValue: "",
      action: { kind: "create-playlist", parentId },
    });
  }

  // Create folder — open name modal
  function handleCreateFolder(parentId: number | null) {
    setPromptState({
      open: true,
      title: "Folder name",
      defaultValue: "",
      action: { kind: "create-folder", parentId },
    });
  }

  // Rename playlist/folder — open name modal
  function handleRenamePlaylist(id: number, currentName: string) {
    setPromptState({
      open: true,
      title: "New name",
      defaultValue: currentName,
      action: { kind: "rename", id, currentName },
    });
  }

  async function handlePromptConfirm(value: string) {
    const { action } = promptState;
    setPromptState((p) => ({ ...p, open: false, action: null }));
    if (!action) return;

    try {
      if (action.kind === "create-playlist") {
        await tauriApi.createPlaylist(value, action.parentId);
      } else if (action.kind === "create-folder") {
        await tauriApi.createPlaylistFolder(value, action.parentId);
      } else if (action.kind === "rename") {
        if (value === action.currentName) return;
        await tauriApi.renamePlaylist(action.id, value);
      }
      await loadPlaylists();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Delete playlist/folder — use Tauri's confirm (native dialog)
  async function handleDeletePlaylist(id: number, name: string) {
    const confirmed = await confirm(
      `Delete "${name}"? This cannot be undone.`,
      { title: "Delete", kind: "warning" }
    );
    if (!confirmed) return;

    try {
      await tauriApi.deletePlaylist(id);

      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
        setSelectedFolder(null);
        await loadTracks(null, null);
      }

      await loadPlaylists();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Add track to playlist
  async function handleAddToPlaylist(track: Track, playlistId: number) {
    try {
      await tauriApi.addTrackToPlaylist(playlistId, track.id);
      await loadPlaylists(); // Refresh playlist counts
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Set genre for track
  async function handleSetGenre(track: Track, genre: string) {
    try {
      await tauriApi.setTrackGenre(track.id, genre);
      await loadTracks(); // Refresh tracks to show updated genre
      await loadGenreDefinitions(); // Refresh in case it's a new genre
      setNotification({
        message: `Genre set to "${genre}" for ${track.title || "track"}`,
        type: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Clear genre for track
  async function handleClearGenre(track: Track) {
    try {
      await tauriApi.clearTrackGenre(track.id);
      await loadTracks(); // Refresh tracks to show cleared genre
      setNotification({
        message: `Genre cleared for ${track.title || "track"}`,
        type: "info",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Scan directory button
  async function handleScanDirectory() {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select Music Folder",
      });

      if (!selectedPath) return;

      setLoading(true);
      setError(null);

      try {
        await tauriApi.addLibraryFolder(selectedPath as string);
      } catch {
        // Folder might already exist
      }

      const result = await tauriApi.scanDirectory(selectedPath as string);
      console.log("Scan result:", result);

      alert(
        `Scanned ${result.total_files} files\nImported: ${result.imported}\nSkipped: ${result.skipped}`
      );

      let folders: string[] = [];
      try {
        folders = await tauriApi.getLibraryFolders();
        setLibraryFolders(folders);
      } catch {
        console.warn("Failed to refresh library folders");
      }

      // Restart file watcher with updated folder list
      try {
        await tauriApi.startFileWatcher(folders);
      } catch {
        console.warn("Failed to restart file watcher");
      }

      await loadTracks();
      await loadPlaylists();

      // Rebuild AI context cache in background
      tauriApi.rebuildAIContext().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Analyze all BPM
  async function handleAnalyzeAll() {
    if (analyzing) return;
    try {
      setAnalyzing(true);
      setAnalysisCancelled(false);
      setError(null);

      // Get all tracks
      const allTracks = await tauriApi.getAllTracks();
      
      // Filter tracks that need analysis
      const tracksToAnalyze = allTracks.filter(
        (t) => t.id && (!t.bpm || !t.musical_key)
      );

      if (tracksToAnalyze.length === 0) {
        setNotification({
          message: "All tracks already have BPM and Key analysis",
          type: "info",
        });
        return;
      }

      // Calculate total duration and size
      const totalDurationMs = tracksToAnalyze.reduce(
        (sum, t) => sum + (t.duration_ms || 0),
        0
      );
      const totalSizeBytes = tracksToAnalyze.reduce(
        (sum, t) => sum + (t.file_size || 0),
        0
      );

      const startTime = Date.now();
      let bpmCount = 0;
      let keyCount = 0;

      for (let i = 0; i < tracksToAnalyze.length; i++) {
        if (analysisCancelled) {
          setNotification({
            message: `Analysis cancelled. Analyzed ${bpmCount + keyCount} tracks.`,
            type: "warning",
          });
          break;
        }

        const track = tracksToAnalyze[i];
        if (!track.id) continue;

        // Update progress
        setAnalysisProgress({
          currentIndex: i + 1,
          totalTracks: tracksToAnalyze.length,
          currentTrackName: track.title || track.file_path.split("/").pop() || "Unknown",
          totalDurationMs,
          totalSizeBytes,
          startTime,
        });

        // Allow UI to update by yielding to the event loop
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
          if (!track.bpm) {
            await tauriApi.analyzeBpm(track.id);
            bpmCount++;
          }
          if (!track.musical_key) {
            await tauriApi.analyzeKey(track.id);
            keyCount++;
          }
        } catch (err) {
          console.warn(`Failed to analyze track ${track.id}:`, err);
        }
      }

      setAnalysisProgress(null);
      await loadTracks();

      if (!analysisCancelled && (bpmCount > 0 || keyCount > 0)) {
        const parts = [];
        if (bpmCount > 0) parts.push(`BPM: ${bpmCount}`);
        if (keyCount > 0) parts.push(`Key: ${keyCount}`);
        setNotification({
          message: `Analyzed ${parts.join(", ")} tracks`,
          type: "success",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisCancelled(false);
      // Rebuild AI context cache with updated analysis data
      tauriApi.rebuildAIContext().catch(() => {});
    }
  }

  // Handler for when user clicks on track metadata in player
  const handleScrollToCurrentTrack = useCallback(() => {
    if (trackTableRef.current) {
      console.log('[App] Scrolling to current track in table');
      trackTableRef.current.scrollToCurrentTrack();
    } else {
      console.warn('[App] TrackTable ref not available');
    }
  }, []);

  const {
    setIsLoading,
    setError: setPlayerError,
    setQueue,
  } = usePlayerStore();

  const handleTrackClick = (track: Track) => {
    console.log("Clicked track:", track);
  };

  const handlePlayTrack = async (track: Track, sortedTracks: Track[], trackIndex: number) => {
    if (!track.file_path) {
      console.error("[App] Track has no file path");
      return;
    }

    if (!track.id) {
      console.error("[App] Track has no ID");
      return;
    }

    // Validate the index before proceeding
    if (trackIndex < 0 || trackIndex >= sortedTracks.length) {
      console.error(`[App] Invalid track index: ${trackIndex} (queue length: ${sortedTracks.length})`);
      setPlayerError("Invalid track index");
      return;
    }

    // Double-check that the track at the index matches what we expect
    const trackAtIndex = sortedTracks[trackIndex];
    if (trackAtIndex.id !== track.id || trackAtIndex.file_path !== track.file_path) {
      console.error(`[App] Track mismatch! Expected track ${track.id} at index ${trackIndex}, but found ${trackAtIndex.id}`);
      setPlayerError("Track index mismatch");
      return;
    }

    try {
      setIsLoading(true);
      setPlayerError(null);

      // Use the index passed directly from TrackTable to avoid searching
      // This ensures we play the exact track the user clicked, even if there are duplicates
      console.log(`[App] Playing track at index ${trackIndex}/${sortedTracks.length}: "${track.title || track.file_path}"`);
      console.log(`[App] Queue verification: track at index ${trackIndex} is "${sortedTracks[trackIndex].title || sortedTracks[trackIndex].file_path}"`);

      // Set the queue with the sorted/filtered tracks array and start at the clicked track
      // This way next/previous buttons will work in the sorted order
      setQueue(sortedTracks, trackIndex);
    } catch (err) {
      console.error("[App] Play error:", err);
      setPlayerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="loading-screen">
          <h1 className="loading-title">RecoDeck</h1>
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
    );
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
    );
  }

  // Determine empty state message
  const emptyTitle = selectedPlaylistId
    ? "Playlist is empty"
    : selectedFolder
      ? "No tracks in this folder"
      : "No tracks in library";

  const emptySubtitle = selectedPlaylistId
    ? "Add tracks to this playlist from the track table"
    : selectedFolder
      ? "This folder doesn't contain any imported tracks"
      : 'Click "Scan Folder" to add music to your library';

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>RecoDeck</h1>
        <div className="header-actions">
          <button onClick={handleScanDirectory} className="btn-primary">
            Scan Folder
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="btn-secondary btn-settings"
            title="Settings"
          >
            <Icon name="Settings" size={20} />
          </button>
        </div>
      </header>

      {/* Analysis progress bar (Traktor-style) */}
      <AnalysisProgress 
        progress={analysisProgress} 
        onCancel={handleCancelAnalysis}
      />

      <div className="app-body">
        {/* Left sidebar — Folder Tree + Playlists */}
        <aside className="app-sidebar">
          <FolderTree
            libraryFolders={libraryFolders}
            playlists={playlists}
            selectedFolder={selectedFolder}
            selectedPlaylistId={selectedPlaylistId}
            totalTrackCount={totalTrackCount}
            onFolderSelect={handleFolderSelect}
            onPlaylistSelect={handlePlaylistSelect}
            onAnalyzeFolder={handleAnalyzeFolder}
            onAnalyzeAll={handleAnalyzeAll}
            onCreatePlaylist={handleCreatePlaylist}
            onCreateFolder={handleCreateFolder}
            onRenamePlaylist={handleRenamePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
          />
        </aside>

        {/* Main content — Track Table */}
        <main className="app-main">
          {tracks.length === 0 ? (
            <div className="empty-state">
              <h2>{emptyTitle}</h2>
              <p>{emptySubtitle}</p>
            </div>
          ) : (
            <TrackTable
              ref={trackTableRef}
              tracks={tracks}
              playlists={playlists}
              keyNotation={keyNotation}
              onTrackClick={handleTrackClick}
              onTrackDoubleClick={handlePlayTrack}
              onAnalyzeTrack={handleAnalyzeTrack}
              onAnalyzeBpm={handleAnalyzeBpm}
              onAnalyzeKey={handleAnalyzeKey}
              onAddToPlaylist={handleAddToPlaylist}
              onSetGenre={handleSetGenre}
              onClearGenre={handleClearGenre}
              genreDefinitions={genreDefinitions}
              onLoadMore={loadMoreTracks}
              hasMoreTracks={hasMoreTracks}
              isLoadingMore={isLoadingMore}
            />
          )}
        </main>
      </div>

      {/* Player bar */}
      <Player
        playlists={playlists}
        onTrackMetaClick={handleScrollToCurrentTrack}
        onAddToPlaylist={async (trackId, playlistId) => {
          try {
            await tauriApi.addTrackToPlaylist(playlistId, trackId);
            await loadPlaylists();
            setNotification({
              message: 'Track added to playlist',
              type: 'success',
            });
          } catch (err) {
            setNotification({
              message: `Failed to add to playlist: ${err instanceof Error ? err.message : String(err)}`,
              type: 'error',
            });
          }
        }}
      />

      {/* Settings panel */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onFoldersChanged={handleFoldersChanged}
        onThemeChanged={handleThemeChanged}
        onKeyNotationChanged={handleKeyNotationChanged}
        onWaveformStyleChanged={handleWaveformStyleChanged}
        onNotification={(message, type) => setNotification({ message, type })}
      />

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

      {/* Notification toast */}
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* AI Chat integrated into player */}
      <PlayerAIChat
        onPlaylistCreated={() => {
          // Reload playlists to show the new one
          loadPlaylists();
          // Show notification
          setNotification({
            message: "Playlist created successfully!",
            type: "success",
          });
        }}
      />
    </div>
  );
}

export default App;
