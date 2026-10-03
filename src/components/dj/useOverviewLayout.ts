// src/components/dj/useOverviewLayout.ts
// The overview's cards, in order: one layout for every DJ page, stored as a
// list of card ids under `dj_overview_layout` in settings. Read once per run
// of the app and kept here, so a DJ page opened later shows it at once (no
// empty flash, no read racing a write just made); written on Done.
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

/** The layout last read or saved; every write goes through `save`, so it stays true. */
let known: OverviewCardId[] | null = null

export function useOverviewLayout(): OverviewLayout {
  const [ids, setIds] = useState<OverviewCardId[] | null>(() => known)

  useEffect(() => {
    if (known !== null) return
    let alive = true
    // A save made while this read was out wins over what the read found.
    const settle = (read: OverviewCardId[]) => {
      if (known === null) known = read
      if (alive) setIds(known)
    }
    tauriApi.getSetting(OVERVIEW_SETTING).then(
      (raw) => settle(parseOverview(raw)),
      // An unreadable setting is a missing one: the default layout.
      () => settle(parseOverview(null)),
    )
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback((next: OverviewCardId[]) => {
    known = next
    setIds(next)
    // A failed write keeps the new layout for this run; the next run reads the stored one.
    tauriApi
      .setSetting(OVERVIEW_SETTING, serializeOverview(next))
      .catch((error: unknown) => {
        console.error('[DJ] could not save the overview layout', error)
      })
  }, [])

  return { ids, save }
}
