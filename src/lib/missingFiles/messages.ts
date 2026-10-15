// Texts the Missing Files flow shows (spec 2026-10-15).

import type { MissingFixSummary } from '../../types/track'

/** After a scan: null when no moved file was followed. */
export function followedMessage(relinked: number): string | null {
  if (relinked <= 0) return null
  return `Followed ${relinked} moved ${relinked === 1 ? 'file' : 'files'}`
}

/** After an apply: the non-zero counts, e.g. "Relinked 2 · removed 1". */
export function fixSummaryMessage(s: MissingFixSummary): string {
  const parts: string[] = []
  if (s.relinked > 0) parts.push(`relinked ${s.relinked}`)
  if (s.merged > 0) parts.push(`merged ${s.merged}`)
  if (s.removed > 0) parts.push(`removed ${s.removed}`)
  if (s.skipped.length > 0) parts.push(`${s.skipped.length} skipped`)
  const text = parts.join(' · ') || 'nothing changed'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
