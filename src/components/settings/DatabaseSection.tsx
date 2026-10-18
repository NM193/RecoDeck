import { useCallback, useEffect, useState } from 'react'
import { useSettingsContext } from './SettingsContext'
import { DuplicatesModal } from '../DuplicatesModal'
import { MissingFilesModal } from '../MissingFilesModal'
import { tauriApi } from '../../lib/tauri-api'
import { listen } from '@tauri-apps/api/event'
import { reanalyzeHint } from '../../lib/reanalysis'
import type { AnalysisStatus } from '../../types/track'

export function DatabaseSection() {
  const { onFoldersChanged, onNotification, onReanalyzeLibrary } = useSettingsContext()

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [showMissingModal, setShowMissingModal] = useState(false)
  // Counted in the background, so the button shows at once without a badge.
  const [missingCount, setMissingCount] = useState<number | null>(null)

  const countMissing = useCallback(() => {
    tauriApi
      .countMissingTracks()
      .then(setMissingCount)
      .catch(() => setMissingCount(null))
  }, [])

  useEffect(() => {
    countMissing()
  }, [countMissing])

  // Which tracks need analysis; read again when an analysis ends.
  const [analysis, setAnalysis] = useState<AnalysisStatus | null>(null)

  const loadAnalysisStatus = useCallback(() => {
    tauriApi
      .analysisStatus()
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
  }, [])

  useEffect(() => {
    loadAnalysisStatus()
    const unlisten = listen('analysis-complete', () => loadAnalysisStatus())
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [loadAnalysisStatus])

  return (
    <>
      <p className="settings-description">
        Clean up duplicate tracks and missing files, and re-analyze the library.
      </p>

      <div
        className="sv-subsection"
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
          >
            Review Duplicate Tracks
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Finds copies of the same track. Merge keeps one copy and moves
            playlists, plays, rating and analysis onto it. Files stay on disk
            unless you choose Trash.
          </p>
        </div>
        <div>
          <button
            onClick={() => setShowMissingModal(true)}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
          >
            Review Missing Files
            {missingCount !== null && missingCount > 0 && (
              <span className="mf-count">{missingCount}</span>
            )}
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Tracks whose file was moved, renamed or deleted. A rescan follows
            moved files on its own; review the rest here.
          </p>
        </div>
        <div>
          <button
            onClick={() => onReanalyzeLibrary?.()}
            className="btn btn--primary btn--sm"
            style={{ width: '100%' }}
            disabled={!analysis || analysis.needing === 0 || !onReanalyzeLibrary}
          >
            Re-analyze
          </button>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {analysis
              ? reanalyzeHint(analysis)
              : 'Checking which tracks need analysis…'}
          </p>
        </div>
      </div>

      {showDuplicatesModal && (
        <DuplicatesModal
          onClose={() => setShowDuplicatesModal(false)}
          onTracksChanged={onFoldersChanged}
          onNotification={(msg, type) => onNotification?.(msg, type)}
        />
      )}

      {showMissingModal && (
        <MissingFilesModal
          onClose={() => {
            setShowMissingModal(false)
            countMissing()
          }}
          onTracksChanged={onFoldersChanged}
          onNotification={(msg, type) => onNotification?.(msg, type)}
        />
      )}
    </>
  )
}
