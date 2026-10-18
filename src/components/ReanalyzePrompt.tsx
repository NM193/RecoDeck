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
  return (
    <div className="modal-overlay" onClick={onLater}>
      <div
        className="modal-content reanalyze-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reanalyze-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reanalyze-prompt-title">Better BPM and key detection</h3>
        <p className="reanalyze-prompt__text">
          This version finds BPM, key and the beat grid more accurately.
          Re-analyze {status.needing} tracks now?
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
