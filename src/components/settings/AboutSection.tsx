import { useSettingsContext } from './SettingsContext'

export function AboutSection() {
  const { appVersion, updateChecking, updateProgress, handleCheckForUpdates } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">About</h2>

      <p className="settings-description">RecoDeck v{appVersion || '—'}</p>

      <button
        onClick={handleCheckForUpdates}
        disabled={updateChecking}
        className="btn-primary btn-small"
      >
        {updateChecking
          ? updateProgress?.status === 'checking' ? 'Checking...' : 'Downloading...'
          : 'Check for Updates'}
      </button>

      <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
        Manually check for app updates from GitHub Releases.
      </p>

      {/* Update progress bar */}
      {updateProgress && (
        <div className="settings-update-progress" style={{ marginTop: '1rem' }}>
          <div className="settings-update-progress-header">
            <span className="settings-update-progress-label">
              {updateProgress.status === 'checking' && 'Checking for updates...'}
              {updateProgress.status === 'downloading' &&
                (updateProgress.totalBytes
                  ? `Downloading... ${formatBytes(updateProgress.downloadedBytes ?? 0)} / ${formatBytes(updateProgress.totalBytes)}`
                  : 'Downloading...')}
              {updateProgress.status === 'installing' &&
                (updateProgress.progress >= 100
                  ? 'Restarting to apply update...'
                  : 'Installing update...')}
            </span>
            {updateProgress.status !== 'checking' && (
              <span className="settings-update-progress-percent">
                {updateProgress.progress}%
              </span>
            )}
          </div>
          <div className={`settings-update-progress-bar ${updateProgress.status === 'checking' ? 'settings-update-progress-bar--indeterminate' : ''}`}>
            <div
              className="settings-update-progress-fill"
              style={{
                width: updateProgress.status === 'checking' ? '30%' : `${updateProgress.progress}%`,
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
