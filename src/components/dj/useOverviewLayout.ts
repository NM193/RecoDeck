// src/components/dj/useOverviewLayout.ts
// The overview's cards, in order: one layout for every DJ page, stored as a
// list of card ids under `dj_overview_layout` in settings. Read once when a
// DJ page opens (so the Overview tab does not flash on every return to it),
// written on Done.
import { useCallback, useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import {
  OVERVIEW_SETTING,
  parseOverview,
  serializeOverview,
  type OverviewCardId,
} from '../../lib/dj/overview'

export interface OverviewLayout {
  /** The cards in order; null until settings answered. */
  ids: OverviewCardId[] | null
  /** Done: shown at once, stored for every DJ page. */
  save: (ids: OverviewCardId[]) => void
}

export function useOverviewLayout(): OverviewLayout {
  const [ids, setIds] = useState<OverviewCardId[] | null>(null)

  useEffect(() => {
    let alive = true
    tauriApi.getSetting(OVERVIEW_SETTING).then(
      (raw) => {
        if (alive) setIds(parseOverview(raw))
      },
      // An unreadable setting is a missing one: the default layout.
      () => {
        if (alive) setIds(parseOverview(null))
      },
    )
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback((next: OverviewCardId[]) => {
    setIds(next)
    // A failed write keeps the new layout on this page; the next page reads the stored one.
    tauriApi
      .setSetting(OVERVIEW_SETTING, serializeOverview(next))
      .catch((error: unknown) => {
        console.error('[DJ] could not save the overview layout', error)
      })
  }, [])

  return { ids, save }
}
