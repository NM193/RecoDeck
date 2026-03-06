import { useSettingsContext } from './SettingsContext'

export function DatabaseSection() {
  const {
    cleaningDuplicates, normalizingPaths,
    handleCleanupDuplicates, handleNormalizePaths,
  } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Database Maintenance</h2>
      <p className="settings-description">
        Clean up duplicate tracks and optimize your library database.
      </p>

      <div className="sv-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <button
            onClick={handleCleanupDuplicates}
            disabled={cleaningDuplicates || normalizingPaths}
            className="btn-primary btn-small"
            style={{ width: '100%' }}
          >
            {cleaningDuplicates ? 'Removing Duplicates...' : 'Remove Duplicate Tracks'}
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
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
            {normalizingPaths ? 'Normalizing Paths...' : 'Normalize File Paths'}
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Fixes file paths with double slashes or other formatting issues.
            Run this if you have path-related problems.
          </p>
        </div>
      </div>
    </section>
  )
}
