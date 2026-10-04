// src/components/track-table/usePlayCounts.ts
// Plays per track for the Plays column, read while it is wanted and again
// each time App's play-version number changes (a play was recorded).
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'

export function usePlayCounts(
  wanted: boolean,
  playVersion: number,
): ReadonlyMap<number, number> | null {
  const [counts, setCounts] = useState<ReadonlyMap<number, number> | null>(null)

  useEffect(() => {
    if (!wanted) return
    let current = true
    tauriApi
      .getPlayCounts()
      .then((rows) => {
        if (current) setCounts(new Map(rows.map((row) => [row.track_id, row.plays])))
      })
      .catch((err) => console.warn('[TrackTable] Failed to count plays:', err))
    return () => {
      current = false
    }
  }, [wanted, playVersion])

  return wanted ? counts : null
}
