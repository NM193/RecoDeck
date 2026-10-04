// src/lib/trackTable/cells.ts
// What the track table's cells show (track table spec, Columns and Rows).
import { parseUtcDate } from './filter'

/** Shown for a missing value. */
export const MISSING = '—'

/** m:ss. */
export function formatTime(ms: number | undefined): string {
  if (!ms) return MISSING
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function localDay(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * "today", "yesterday", "Oct 2", or "Oct 2, 2025" in another year, by the
 * local day of the stored UTC time.
 */
export function formatAdded(dateAdded: string | undefined, now: number = Date.now()): string {
  const added = parseUtcDate(dateAdded)
  if (added === null) return MISSING
  const days = Math.round((localDay(now) - localDay(added)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  const sameYear = new Date(added).getFullYear() === new Date(now).getFullYear()
  return new Date(added).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "mp3 · 320". */
export function formatFormat(format: string | undefined, bitrate: number | undefined): string {
  if (!format) return MISSING
  const name = format.toLowerCase()
  return bitrate ? `${name} · ${bitrate}` : name
}

/**
 * A cover for a track without artwork: a diagonal gradient whose hue comes
 * from the title, so the same track always gets the same one.
 */
export function titleGradient(title: string | undefined): string {
  let hash = 0
  for (const char of title ?? '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 25) % 360} 65% 18%))`
}
