import { useState } from 'react'
import { useSettingsContext } from './SettingsContext'
import { DuplicatesModal } from '../DuplicatesModal'

export function DatabaseSection() {
  const { cleaningDuplicates, onFoldersChanged, onNotification } =
    useSettingsContext()

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Database Maintenance</h2>
      <p className="settings-description">
        Clean up duplicate tracks and optimize your library database.
      </p>

      <div className="sv-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            disabled={cleaningDuplicates}
            className="btn-primary btn-small"
            style={{ width: '100%' }}
          >
            Review Duplicate Tracks
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Review and selectively remove duplicate tracks from your library.
          </p>
        </div>
      </div>

      {showDuplicatesModal && (
        <DuplicatesModal
          onClose={() => setShowDuplicatesModal(false)}
          onTracksChanged={onFoldersChanged}
          onNotification={(msg, type) =>
            onNotification?.(msg, type)
          }
        />
      )}
    </section>
  )
}
