import { useEffect, useRef } from 'react'
import { useOverlay } from '../lib/overlays'
import type { AnalysisStatus } from '../types/track'
import './ReanalyzePrompt.css'

interface ReanalyzePromptProps {
  status: AnalysisStatus
  onLater: () => void
  onReanalyze: () => void
}

// Once per analysis version (spec 2026-10-17, §5): detection got better;
// re-analyze now, or later from Settings → Database. Esc counts as Later.
export function ReanalyzePrompt({
  status,
  onLater,
  onReanalyze,
}: ReanalyzePromptProps) {
  useOverlay(true, onLater)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Focus the dialog, not a button: a stray Enter must not start a long run.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-content reanalyze-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reanalyze-prompt-title"
      >
        <h3 id="reanalyze-prompt-title">Better BPM and key detection</h3>
        <p className="reanalyze-prompt__text">
          This version finds BPM, key and the beat grid more accurately.
          Re-analyze {status.needing.toLocaleString('en-US')}{' '}
          {status.needing === 1 ? 'track' : 'tracks'} now?
        </p>
        <p className="reanalyze-prompt__note">
          It takes about {status.estimate_minutes} min, and you can keep using
          RecoDeck.
        </p>
        <div className="reanalyze-prompt__footer">
          <button type="button" className="btn" onClick={onLater}>
            Later
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onReanalyze}
          >
            Re-analyze
          </button>
        </div>
      </div>
    </div>
  )
}
