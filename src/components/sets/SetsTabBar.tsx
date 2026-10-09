// src/components/sets/SetsTabBar.tsx
// Sets' tabs as one bar, the selected one on a thumb that glides to it, as on
// the DJ page (the shared .tabs in controls.css). A component of its own so
// the thumb is measured again each time the bar appears: it is gone while
// YouTube's results or a set are shown.
import { useRef } from 'react'
import { tabKeyTarget, useTabThumb } from '../../lib/useTabThumb'
import type { SetsTab } from '../../store/setsViewStore'

const TABS: readonly SetsTab[] = ['library', 'saved', 'channels', 'stats']

const LABELS: Record<SetsTab, string> = {
  library: 'Library',
  saved: 'Saved tracks',
  channels: 'Following',
  stats: 'Stats',
}

interface SetsTabBarProps {
  tab: SetsTab
  onTab: (tab: SetsTab) => void
  /** Sets in the library, and how many of them are new finds. */
  library: number
  newFinds: number
  saved: number
  /** New sets on followed channels: the Following tab's badge. */
  channelNews: number
}

export function SetsTabBar({
  tab,
  onTab,
  library,
  newFinds,
  saved,
  channelNews,
}: SetsTabBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  const thumb = useTabThumb(bar, tab)

  return (
    <div className="tabs" role="tablist" aria-label="Sets" ref={bar}>
      <span className="tabs__thumb" aria-hidden="true" style={thumb} />
      {TABS.map((t, i) => (
        <button
          type="button"
          role="tab"
          key={t}
          id={`sets-tab-${t}`}
          aria-controls="sets-panel"
          aria-selected={tab === t}
          tabIndex={tab === t ? 0 : -1}
          className="tabs__tab"
          onClick={() => onTab(t)}
          onKeyDown={(event) => {
            const next = tabKeyTarget(event.key, i, TABS.length)
            if (next === null) return
            event.preventDefault()
            onTab(TABS[next])
            document.getElementById(`sets-tab-${TABS[next]}`)?.focus()
          }}
        >
          {LABELS[t]}
          {t === 'library' && (
            <small>
              {library.toLocaleString('en-US')}
              {newFinds > 0 ? ` · ${newFinds} new` : ''}
            </small>
          )}
          {t === 'saved' && <small>{saved.toLocaleString('en-US')}</small>}
          {t === 'channels' && channelNews > 0 && (
            <span className="sets-home__badge">{channelNews}</span>
          )}
        </button>
      ))}
    </div>
  )
}
