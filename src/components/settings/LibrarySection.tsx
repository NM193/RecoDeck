import { useState, useEffect } from 'react'
import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function formatTimeRemaining(startTime: number, current: number, total: number): string | null {
  if (current === 0) return null
  const elapsed = Date.now() - startTime
  const avgPerFile = elapsed / current
  const remaining = avgPerFile * (total - current)
  if (remaining < 60000) {
    return `${Math.ceil(remaining / 1000)}s remaining`
  }
  const minutes = Math.ceil(remaining / 60000)
  return `${minutes} min${minutes === 1 ? '' : 's'} remaining`
}

export function LibrarySection() {
  const {
    folders, loading, scanningFolder, scanProgress, scanStartTime,
    handleAddFolder, handleRemoveFolder, handleRescanFolder, handleRescanAll,
  } = useSettingsContext()

  // Tick elapsed time for ETA calculation
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!scanProgress) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [scanProgress])

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Library Folders</h2>

      <div className="sv-section__actions">
        {folders.length > 0 && (
          <button
            className="btn-secondary btn-small"
            onClick={handleRescanAll}
            disabled={loading || scanningFolder !== null}
          >
            {scanningFolder ? 'Scanning...' : 'Rescan All'}
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

      {folders.length === 0 ? (
        <div className="settings-empty">
          <p>No library folders configured.</p>
          <p className="settings-empty-hint">
            Add a folder to scan for music files (MP3, FLAC, WAV, AIFF).
          </p>
        </div>
      ) : (
        <div className="folder-list">
          {folders.map((folder) => {
            const isScanning = scanningFolder === folder
            const folderProgress = isScanning ? scanProgress : null
            const percentage = folderProgress && folderProgress.total > 0
              ? Math.round((folderProgress.current / folderProgress.total) * 100)
              : 0
            const timeRemaining = folderProgress && scanStartTime
              ? formatTimeRemaining(scanStartTime, folderProgress.current, folderProgress.total)
              : null

            return (
              <div key={folder}>
                <div className="folder-item">
                  <div className="folder-info">
                    <Icon name="Folder" size={20} className="folder-icon" />
                    <div className="folder-details">
                      <span className="folder-name">{getFolderName(folder)}</span>
                      <span className="folder-path">{folder}</span>
                    </div>
                  </div>
                  <div className="folder-actions">
                    {isScanning ? (
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

                {folderProgress && (
                  <div className="scan-progress">
                    <div className="scan-progress__bar-wrapper">
                      <div
                        className="scan-progress__bar"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="scan-progress__info">
                      <span className="scan-progress__count">
                        [{folderProgress.current}/{folderProgress.total}] {percentage}%
                      </span>
                      {timeRemaining && (
                        <span className="scan-progress__eta">{timeRemaining}</span>
                      )}
                    </div>
                    <div className="scan-progress__filename">
                      {folderProgress.currentFile}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
