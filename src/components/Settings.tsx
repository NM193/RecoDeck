// Settings panel component
// Provides: library folder management (add/remove) and theme selection.
// All changes persist to SQLite via the settings table.

import { useState, useEffect } from "react";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { tauriApi } from "../lib/tauri-api";
import { useAIStore } from "../store/aiStore";
import { Icon } from "./Icon";
import "./Settings.css";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onFoldersChanged: () => void;
  onThemeChanged: (theme: string) => void;
  onKeyNotationChanged?: (notation: string) => void;
  onWaveformStyleChanged?: (style: string) => void;
  onNotification?: (message: string, type: "info" | "success" | "warning" | "error") => void;
}

const THEMES = [
  { id: "midnight", name: "Midnight", description: "Deep dark with indigo accents" },
  { id: "carbon", name: "Carbon", description: "Neutral dark with blue accents" },
  { id: "dawn", name: "Dawn", description: "Light theme" },
  { id: "neon", name: "Neon", description: "Dark with vibrant neon accents" },
];

const KEY_NOTATIONS = [
  { id: "camelot", name: "Camelot", description: "8A, 11B (Mixed In Key)" },
  { id: "openkey", name: "Open Key", description: "8m, 11d (Traktor)" },
];

const WAVEFORM_STYLES = [
  { id: "traktor_rgb", name: "Traktor RGB", description: "Colored frequency bands (bass/mid/treble)" },
  { id: "mono_peaks", name: "Mono Peaks", description: "Classic single-color waveform" },
  { id: "bars", name: "Bars", description: "Simple bar visualization" },
];

type SettingsTab = 'library' | 'appearance' | 'audio' | 'database' | 'ai' | 'app';

export function Settings({ isOpen, onClose, onFoldersChanged, onThemeChanged, onKeyNotationChanged, onWaveformStyleChanged, onNotification }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('library');
  const [folders, setFolders] = useState<string[]>([]);
  const [currentTheme, setCurrentTheme] = useState("midnight");
  const [keyNotation, setKeyNotation] = useState("camelot");
  const [waveformStyle, setWaveformStyle] = useState("traktor_rgb");
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanningFolder, setScanningFolder] = useState<string | null>(null);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [normalizingPaths, setNormalizingPaths] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");

  // AI settings
  const { isApiKeyConfigured, checkApiKeyStatus, setApiKey, deleteApiKey } = useAIStore();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // Load settings when panel opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  async function loadSettings() {
    try {
      setError(null);
      const [loadedFolders, loadedTheme, loadedKeyNotation, loadedWaveformStyle, loadedCrossfadeEnabled, loadedCrossfadeDuration] = await Promise.all([
        tauriApi.getLibraryFolders(),
        tauriApi.getTheme(),
        tauriApi.getSetting("key_notation").catch(() => "camelot"),
        tauriApi.getSetting("waveform_style").catch(() => "traktor_rgb"),
        tauriApi.getSetting("crossfade_enabled").catch(() => "false"),
        tauriApi.getSetting("crossfade_duration_sec").catch(() => "8"),
      ]);

      // Check AI API key status
      await checkApiKeyStatus();
      try {
        setAppVersion(await getVersion());
      } catch {
        setAppVersion("—");
      }
      setFolders(loadedFolders);
      setCurrentTheme(loadedTheme);
      setKeyNotation(loadedKeyNotation || "camelot");
      setWaveformStyle(loadedWaveformStyle || "traktor_rgb");
      setCrossfadeEnabled(loadedCrossfadeEnabled === "true");
      setCrossfadeDuration(parseInt(loadedCrossfadeDuration || "8", 10) || 8);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddFolder() {
    try {
      setError(null);

      // Open folder picker
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Add Library Folder",
      });

      if (!selectedPath) return; // User cancelled

      setLoading(true);

      // Add folder to settings (persists to DB)
      const updatedFolders = await tauriApi.addLibraryFolder(selectedPath as string);
      setFolders(updatedFolders);

      // Scan the newly added folder
      setScanningFolder(selectedPath as string);
      const result = await tauriApi.scanDirectory(selectedPath as string);
      setScanningFolder(null);

      console.log("Scan result:", result);

      // Notify parent to reload tracks
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScanningFolder(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFolder(path: string) {
    try {
      setError(null);

      // Show confirmation dialog
      const confirmed = await ask(
        `Remove this folder from your library?\n\n${path}\n\nAll tracks from this folder will be removed from your library (playlists will be kept).`,
        {
          title: "Remove Library Folder",
          kind: "warning",
          okLabel: "Remove",
          cancelLabel: "Cancel",
        }
      );

      // User cancelled
      if (!confirmed) {
        return;
      }

      setLoading(true);

      // Only remove if folder exists in settings (it does, since we're removing it)
      const updatedFolders = await tauriApi.removeLibraryFolder(path);
      setFolders(updatedFolders);

      // Clean up tracks from the removed folder (keeps playlists intact)
      try {
        const removed = await tauriApi.cleanupStrayTracks();
        if (removed > 0) {
          console.log(`Removed ${removed} tracks from removed folder`);
          onNotification?.(
            `Removed ${removed} track${removed > 1 ? "s" : ""} from library`,
            "info"
          );
        }
      } catch (cleanupErr) {
        console.warn("Failed to cleanup tracks:", cleanupErr);
      }

      // Notify parent to reload tracks and refresh UI
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRescanFolder(path: string) {
    try {
      setError(null);
      setScanningFolder(path);

      const result = await tauriApi.scanDirectory(path);
      console.log("Rescan result:", result);

      setScanningFolder(null);
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScanningFolder(null);
    }
  }

  async function handleRescanAll() {
    try {
      setError(null);
      setLoading(true);

      for (const folder of folders) {
        setScanningFolder(folder);
        await tauriApi.scanDirectory(folder);
      }

      setScanningFolder(null);
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScanningFolder(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCleanupDuplicates() {
    try {
      setError(null);
      setCleaningDuplicates(true);

      const duplicatesRemoved = await tauriApi.cleanupDuplicateTracks();

      if (duplicatesRemoved > 0) {
        onNotification?.(
          `Successfully removed ${duplicatesRemoved} duplicate track${duplicatesRemoved > 1 ? "s" : ""}`,
          "success"
        );
        // Notify parent to reload tracks
        onFoldersChanged();
      } else {
        onNotification?.("No duplicates found", "info");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onNotification?.(errorMsg, "error");
    } finally {
      setCleaningDuplicates(false);
    }
  }

  async function handleNormalizePaths() {
    try {
      setError(null);
      setNormalizingPaths(true);

      const pathsNormalized = await tauriApi.normalizeFilePaths();

      if (pathsNormalized > 0) {
        onNotification?.(
          `Successfully normalized ${pathsNormalized} file path${pathsNormalized > 1 ? "s" : ""}`,
          "success"
        );
        // Notify parent to reload tracks
        onFoldersChanged();
      } else {
        onNotification?.("All file paths are already normalized", "info");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onNotification?.(errorMsg, "error");
    } finally {
      setNormalizingPaths(false);
    }
  }

  async function handleThemeChange(themeId: string) {
    try {
      setError(null);

      // Save to DB
      await tauriApi.setTheme(themeId);
      setCurrentTheme(themeId);

      // Apply immediately
      onThemeChanged(themeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleKeyNotationChange(notation: string) {
    try {
      setError(null);

      // Save to DB
      await tauriApi.setSetting("key_notation", notation);
      setKeyNotation(notation);

      // Notify parent to update display
      onKeyNotationChanged?.(notation);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleWaveformStyleChange(style: string) {
    try {
      setError(null);

      // Save to DB
      await tauriApi.setSetting("waveform_style", style);
      setWaveformStyle(style);

      // Notify parent to update display
      onWaveformStyleChanged?.(style);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCrossfadeEnabledChange(enabled: boolean) {
    try {
      setError(null);

      // Save to DB
      await tauriApi.setSetting("crossfade_enabled", enabled ? "true" : "false");
      setCrossfadeEnabled(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCrossfadeDurationChange(duration: number) {
    try {
      setError(null);

      // Clamp duration between 1 and 30 seconds
      const clamped = Math.max(1, Math.min(30, duration));

      // Save to DB
      await tauriApi.setSetting("crossfade_duration_sec", clamped.toString());
      setCrossfadeDuration(clamped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // AI Assistant handlers
  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) {
      setError("Please enter an API key");
      return;
    }

    try {
      setError(null);
      setAiSaving(true);
      await setApiKey(apiKeyInput.trim());
      // Re-check status to ensure it's updated
      await checkApiKeyStatus();
      setApiKeyInput("");
      onNotification?.("API key saved successfully! You can now use the AI assistant.", "success");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onNotification?.(errorMsg, "error");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleDeleteApiKey() {
    const confirmed = await ask(
      "Are you sure you want to delete your Claude API key?",
      {
        title: "Delete API Key",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      }
    );

    if (!confirmed) return;

    try {
      setError(null);
      await deleteApiKey();
      setApiKeyInput("");
      onNotification?.("API key deleted", "info");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onNotification?.(errorMsg, "error");
    }
  }

  async function handleCheckForUpdates() {
    try {
      setUpdateChecking(true);
      setError(null);
      const update = await check();
      if (update) {
        onNotification?.(`Update ${update.version} available. Downloading...`, "info");
        await update.downloadAndInstall();
        await relaunch();
      } else {
        onNotification?.("You're on the latest version.", "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Update check failed: ${msg}`);
      onNotification?.(`Update check failed: ${msg}`, "error");
    } finally {
      setUpdateChecking(false);
    }
  }

  // Extract folder name from full path for display
  function getFolderName(path: string): string {
    const parts = path.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || path;
  }

  if (!isOpen) return null;

  const renderLibraryContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">Library Folders</h3>

      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-actions">
            {folders.length > 0 && (
              <button
                className="btn-secondary btn-small"
                onClick={handleRescanAll}
                disabled={loading || scanningFolder !== null}
              >
                {scanningFolder ? "Scanning..." : "Rescan All"}
              </button>
            )}
            <button
              className="btn-primary btn-small"
              onClick={handleAddFolder}
              disabled={loading}
            >
              Add Folder
            </button>
          </div>
        </div>

        {folders.length === 0 ? (
          <div className="settings-empty">
            <p>No library folders configured.</p>
            <p className="settings-empty-hint">
              Add a folder to scan for music files (MP3, FLAC, WAV, AIFF).
            </p>
          </div>
        ) : (
          <div className="folder-list">
            {folders.map((folder) => (
              <div key={folder} className="folder-item">
                <div className="folder-info">
                  <Icon name="Folder" size={20} className="folder-icon" />
                  <div className="folder-details">
                    <span className="folder-name">{getFolderName(folder)}</span>
                    <span className="folder-path">{folder}</span>
                  </div>
                </div>
                <div className="folder-actions">
                  {scanningFolder === folder ? (
                    <span className="folder-scanning">Scanning...</span>
                  ) : (
                    <>
                      <button
                        className="btn-icon"
                        onClick={() => handleRescanFolder(folder)}
                        title="Rescan this folder"
                        disabled={loading || scanningFolder !== null}
                      >
                        <Icon name="RotateCw" size={16} />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        onClick={() => handleRemoveFolder(folder)}
                        title="Remove this folder"
                        disabled={loading || scanningFolder !== null}
                      >
                        <Icon name="X" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAppearanceContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">Appearance</h3>

      <section className="settings-section">
        <h4 className="settings-subsection-title">Theme</h4>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card ${currentTheme === theme.id ? "theme-card--active" : ""}`}
              onClick={() => handleThemeChange(theme.id)}
            >
              <div className={`theme-preview theme-preview--${theme.id}`}>
                <div className="theme-preview-bar" />
                <div className="theme-preview-content">
                  <div className="theme-preview-line" />
                  <div className="theme-preview-line theme-preview-line--short" />
                </div>
              </div>
              <span className="theme-name">{theme.name}</span>
              <span className="theme-description">{theme.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h4 className="settings-subsection-title">Key Notation</h4>
        <div className="key-notation-list">
          {KEY_NOTATIONS.map((notation) => (
            <button
              key={notation.id}
              className={`notation-option ${keyNotation === notation.id ? "notation-option--active" : ""}`}
              onClick={() => handleKeyNotationChange(notation.id)}
            >
              <div className="notation-info">
                <span className="notation-name">{notation.name}</span>
                <span className="notation-description">{notation.description}</span>
              </div>
              {keyNotation === notation.id && <Icon name="Check" size={16} className="notation-check" />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h4 className="settings-subsection-title">Waveform Style</h4>
        <div className="key-notation-list">
          {WAVEFORM_STYLES.map((style) => (
            <button
              key={style.id}
              className={`notation-option ${waveformStyle === style.id ? "notation-option--active" : ""}`}
              onClick={() => handleWaveformStyleChange(style.id)}
            >
              <div className="notation-info">
                <span className="notation-name">{style.name}</span>
                <span className="notation-description">{style.description}</span>
              </div>
              {waveformStyle === style.id && <Icon name="Check" size={16} className="notation-check" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const renderAudioContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">Audio Setup</h3>

      <section className="settings-section">
        <h4 className="settings-subsection-title">Crossfade</h4>
        <div className="settings-crossfade">
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={crossfadeEnabled}
              onChange={(e) => handleCrossfadeEnabledChange(e.target.checked)}
            />
            <span>Enable beatmatch crossfade</span>
            <span className="settings-checkbox-description">
              Automatically crossfade between tracks with tempo matching
            </span>
          </label>

          {crossfadeEnabled && (
            <div className="settings-crossfade-duration">
              <label htmlFor="crossfade-duration">Crossfade duration (seconds)</label>
              <div className="settings-input-group">
                <input
                  id="crossfade-duration"
                  type="number"
                  min="1"
                  max="30"
                  value={crossfadeDuration}
                  onChange={(e) => handleCrossfadeDurationChange(parseInt(e.target.value, 10) || 8)}
                  className="settings-number-input"
                />
                <span className="settings-input-hint">1-30 seconds</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderAppContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">About</h3>

      <section className="settings-section">
        <p className="settings-description">
          RecoDeck v{appVersion || "—"}
        </p>
        <button
          onClick={handleCheckForUpdates}
          disabled={updateChecking}
          className="btn-primary btn-small"
          style={{ marginTop: "0.5rem" }}
        >
          {updateChecking ? "Checking..." : "Check for Updates"}
        </button>
        <p className="settings-hint" style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.7 }}>
          Manually check for app updates from GitHub Releases.
        </p>
      </section>
    </div>
  );

  const renderDatabaseContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">Database Maintenance</h3>

      <section className="settings-section">
        <p className="settings-description">
          Clean up duplicate tracks and optimize your library database.
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <button
              onClick={handleCleanupDuplicates}
              disabled={cleaningDuplicates || normalizingPaths}
              className="btn-primary btn-small"
              style={{ width: '100%' }}
            >
              {cleaningDuplicates ? "Removing Duplicates..." : "Remove Duplicate Tracks"}
            </button>
            <p className="settings-hint" style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
              Finds and removes duplicate tracks based on file content and filename.
              Keeps the earliest imported version of each track.
            </p>
          </div>

          <div>
            <button
              onClick={handleNormalizePaths}
              disabled={cleaningDuplicates || normalizingPaths}
              className="btn-secondary btn-small"
              style={{ width: '100%' }}
            >
              {normalizingPaths ? "Normalizing Paths..." : "Normalize File Paths"}
            </button>
            <p className="settings-hint" style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
              Fixes file paths with double slashes or other formatting issues.
              Run this if you have path-related problems.
            </p>
          </div>
        </div>
      </section>
    </div>
  );

  const renderAIContent = () => (
    <div className="settings-tab-content">
      <h3 className="settings-tab-title">AI Assistant</h3>

      <section className="settings-section">
        <p className="settings-description">
          Configure your Claude API key to enable AI-powered playlist generation.
        </p>

        <div className="settings-input-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="api-key">Claude API Key</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              placeholder={isApiKeyConfigured ? "••••••••••••••••" : "sk-ant-api03-..."}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveApiKey();
                }
              }}
              className="settings-text-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="btn-icon"
              title={showApiKey ? "Hide" : "Show"}
              type="button"
            >
              <Icon name={showApiKey ? "EyeOff" : "Eye"} size={20} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveApiKey}
            disabled={aiSaving || !apiKeyInput.trim()}
            className="btn-primary btn-small"
          >
            {aiSaving ? "Saving..." : isApiKeyConfigured ? "Update Key" : "Save Key"}
          </button>
          {isApiKeyConfigured && (
            <button
              onClick={handleDeleteApiKey}
              className="btn-secondary btn-small"
            >
              Delete Key
            </button>
          )}
        </div>

        {isApiKeyConfigured && (
          <p className="settings-success" style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.875rem' }}>
            ✓ API key configured
          </p>
        )}

        <p className="settings-hint" style={{ marginTop: '1rem', fontSize: '0.75rem', opacity: 0.7 }}>
          Get your API key from{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#60a5fa', textDecoration: 'underline' }}
          >
            console.anthropic.com
          </a>
        </p>
      </section>
    </div>
  );

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Preferences</h2>
          <button className="settings-close" onClick={onClose} title="Close">
            <Icon name="X" size={20} />
          </button>
        </div>

        {error && (
          <div className="settings-error">
            {error}
            <button className="settings-error-dismiss" onClick={() => setError(null)}>
              <Icon name="X" size={16} />
            </button>
          </div>
        )}

        <div className="settings-body">
          {/* Left sidebar menu */}
          <nav className="settings-sidebar">
            <button
              className={`settings-menu-item ${activeTab === 'library' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              <Icon name="FolderOpen" size={20} />
              Library Folders
            </button>
            <button
              className={`settings-menu-item ${activeTab === 'appearance' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              <Icon name="Palette" size={20} />
              Appearance
            </button>
            <button
              className={`settings-menu-item ${activeTab === 'audio' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <Icon name="Volume2" size={20} />
              Audio Setup
            </button>
            <button
              className={`settings-menu-item ${activeTab === 'database' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('database')}
            >
              <Icon name="Database" size={20} />
              Database Maintenance
            </button>
            <button
              className={`settings-menu-item ${activeTab === 'ai' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <Icon name="Sparkles" size={20} />
              AI Assistant
            </button>
            <button
              className={`settings-menu-item ${activeTab === 'app' ? 'settings-menu-item--active' : ''}`}
              onClick={() => setActiveTab('app')}
            >
              <Icon name="Info" size={20} />
              About
            </button>
          </nav>

          {/* Right content panel */}
          <div className="settings-content">
            {activeTab === 'library' && renderLibraryContent()}
            {activeTab === 'appearance' && renderAppearanceContent()}
            {activeTab === 'audio' && renderAudioContent()}
            {activeTab === 'database' && renderDatabaseContent()}
            {activeTab === 'ai' && renderAIContent()}
            {activeTab === 'app' && renderAppContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
