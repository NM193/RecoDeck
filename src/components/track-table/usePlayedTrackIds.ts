// src/components/track-table/usePlayedTrackIds.ts
// Every track played at least once, for the filter's Played field. Read when
// Played is set; null until the first read answers.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'

export function usePlayedTrackIds(wanted: boolean): ReadonlySet<number> | null {
  const [ids, setIds] = useState<ReadonlySet<number> | null>(null)

  useEffect(() => {
    if (!wanted) return
    let current = true
    tauriApi
      .getPlayedTrackIds()
      .then((list) => {
        if (current) setIds(new Set(list))
      })
      .catch((err) => {
        console.warn('[TrackTable] Failed to read played tracks:', err)
        if (current) setIds(new Set())
      })
    return () => {
      current = false
    }
  }, [wanted])

  return wanted ? ids : null
}
