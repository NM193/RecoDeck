// Export playlist to folder — picks a destination folder, copies track files,
// optionally renames them and writes an .m3u8. Listens to "export-progress"
// events for a live progress bar.

import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { tauriApi } from '../lib/tauri-api'
import './ExportPlaylistModal.css'

interface ExportProgressEvent {
  current: number
  total: number
  current_file: string
}

interface ExportPlaylistModalProps {
  playlistId: number
  playlistName: string
  onClose: () => void
  onSuccess: (message: string, folderPath: string) => void
  onError: (message: string) => void
}

export function ExportPlaylistModal({
  playlistId,
  playlistName,
  onClose,
  onSuccess,
  onError,
}: ExportPlaylistModalProps) {
  const [folderName, setFolderName] = useState(playlistName)
  const [renameFiles, setRenameFiles] = useState(false)
  const [exportM3u, setExportM3u] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{
    current: number
    total: number
    currentFile: string
  } | null>(null)

  const unlistenRef = useRef<UnlistenFn | null>(null)
  useEffect(() => {
    return () => {
      unlistenRef.current?.()
    }
  }, [])

  async function handleExport() {
    try {
      const dest = await tauriApi.pickExportFolder()
      if (!dest) return

      setRunning(true)
      setProgress({ current: 0, total: 0, currentFile: '' })

      unlistenRef.current = await listen<ExportProgressEvent>(
        'export-progress',
        (event) => {
          const p = event.payload
          setProgress({
            current: p.current,
            total: p.total,
            currentFile: p.current_file,
          })
        },
      )

      const nameToUse = folderName.trim() || playlistName
      const result = await tauriApi.exportPlaylistToFolder(
        playlistId,
        dest,
        nameToUse,
        renameFiles,
        exportM3u,
      )

      unlistenRef.current?.()
      unlistenRef.current = null

      // The backend already inserted track rows for us when the destination
      // was inside a library root — it reports the count here.
      const importSuffix =
        result.imported > 0 ? ` · ${result.imported} added to library` : ''
      const skippedSuffix =
        result.skipped > 0 ? ` (${result.skipped} not found on disk)` : ''
      onSuccess(
        `Exported ${result.exported} tracks to "${result.folder_name}"${skippedSuffix}${importSuffix}`,
        result.folder_path,
      )
      onClose()
    } catch (err) {
      unlistenRef.current?.()
      unlistenRef.current = null
      setRunning(false)
      setProgress(null)
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleOverlayClick() {
    if (running) return
    onClose()
  }

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Export — {playlistName}</h3>
        <p className="export-hint">
          Files are copied into a new subfolder; your library files stay in
          place.
        </p>

        <label className="export-field">
          <span>Folder name</span>
          <input
            type="text"
            className="modal-input"
            value={folderName}
            disabled={running}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={playlistName}
          />
        </label>

        <label className="export-option">
          <input
            type="checkbox"
            checked={renameFiles}
            disabled={running}
            onChange={(e) => setRenameFiles(e.target.checked)}
          />
          <span>Rename files (01 - Artist - Title.mp3)</span>
        </label>

        <label className="export-option">
          <input
            type="checkbox"
            checked={exportM3u}
            disabled={running}
            onChange={(e) => setExportM3u(e.target.checked)}
          />
          <span>Export M3U playlist file</span>
        </label>

        {progress && (
          <div className="export-progress">
            <div className="export-progress-bar">
              <div
                className="export-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="export-progress-meta">
              <span>
                {progress.current} / {progress.total}
              </span>
              <span className="export-progress-file" title={progress.currentFile}>
                {progress.currentFile || '…'}
              </span>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-button modal-button-primary"
            onClick={handleExport}
            disabled={running}
          >
            {running ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
