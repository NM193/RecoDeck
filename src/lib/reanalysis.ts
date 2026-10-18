// Re-analysis after detection improves (spec 2026-10-17, §5): when the
// once-per-version prompt shows, and what Settings → Database says.
import type { AnalysisStatus } from '../types/track'

/** The setting holding the analysis version the prompt was last shown for. */
export const PROMPTED_VERSION_KEY = 'analysis_prompted_version'

/** Once per version, and only for a library with older analysis: tag values
 * carry no confidence, so a fresh library gets no "better detection" message. */
export function shouldPromptReanalysis(
  status: AnalysisStatus,
  promptedVersion: string | null,
): boolean {
  const prompted = Number(promptedVersion ?? 0)
  return (
    (Number.isFinite(prompted) ? prompted : 0) < status.version &&
    status.with_old_values > 0
  )
}

/** The hint under Settings → Database's Re-analyze button. */
export function reanalyzeHint(status: AnalysisStatus): string {
  if (status.needing === 0) return 'All tracks use the current analysis.'
  const tracks =
    status.needing === 1 ? "1 track isn't" : `${status.needing} tracks aren't`
  return `${tracks} analyzed with the current version (about ${status.estimate_minutes} min).`
}
