// src/components/sets/SetsLibrary.tsx
// The Library tab (Sets redesign spec, Sets home): the sets watched DJs'
// searches found that you have not seen, as cards with Mark all seen; then
// your sets as cards — newest first in one grid, or under each DJ, the DJs
// with the most sets first, each name opening the DJ's page.
import { useMemo } from 'react'
import { msToCue } from '../../lib/tracklist'
import { groupByDj } from '../../lib/tracklist/djName'
import { setCardLine } from '../../lib/sets/box'
import { thumbnailUrl } from '../../lib/sets/setPage'
import type { NewDjFind } from '../../types/home'
import type { YtSetSummary } from '../../types/youtube'
import { HoverGlide } from '../HoverGlide'
import './SetsHome.css'

interface SetsLibraryProps {
  sets: YtSetSummary[]
  /** Unseen finds, newest first. */
  newFinds: NewDjFind[]
  grouping: 'dj' | 'recent'
  onOpenSet: (videoId: string, title: string) => void
  onOpenDj?: (name: string) => void
  onMarkAllSeen: () => void
}

function SetCard({ set, onOpen }: { set: YtSetSummary; onOpen: () => void }) {
  return (
    <button type="button" className="set-card" onClick={onOpen}>
      <span className="set-card__thumb" style={{ backgroundImage: `url(${thumbnailUrl(set.video_id, 'mqdefault')})` }}>
        {set.duration_ms ? <span className="set-card__length">{msToCue(set.duration_ms)}</span> : null}
      </span>
      <span className="set-card__title" title={set.title}>
        {set.title}
      </span>
      <span className="set-card__line">{setCardLine(set)}</span>
    </button>
  )
}

export function SetsLibrary({ sets, newFinds, grouping, onOpenSet, onOpenDj, onMarkAllSeen }: SetsLibraryProps) {
  const byDj = useMemo(() => groupByDj(sets), [sets])
  const grid = (list: YtSetSummary[]) => (
    <HoverGlide className="set-cards" item=".set-card" kind="card">
      {list.map((set) => (
        <SetCard key={set.video_id} set={set} onOpen={() => onOpenSet(set.video_id, set.title)} />
      ))}
    </HoverGlide>
  )

  return (
    <>
      {newFinds.length > 0 && (
        <section className="sets-home__section">
          <div className="sets-home__head">
            <h2 className="sets-home__heading">New from DJs you watch</h2>
            <button type="button" className="link-btn" onClick={onMarkAllSeen}>
              Mark all seen
            </button>
          </div>
          <HoverGlide className="new-finds" item=".new-find" kind="card">
            {newFinds.map((find) => (
              <button
                key={find.videoId}
                type="button"
                className="new-find"
                onClick={() => onOpenSet(find.videoId, find.title)}
              >
                <span
                  className="new-find__thumb"
                  style={{ backgroundImage: `url(${thumbnailUrl(find.videoId, 'mqdefault')})` }}
                />
                <span className="new-find__text">
                  <span className="new-find__dj">{find.displayName}</span>
                  <span className="new-find__title" title={find.title}>
                    {find.title}
                  </span>
                  <span className="new-find__cost">{find.saved ? 'saved' : 'opening costs 5–7'}</span>
                </span>
              </button>
            ))}
          </HoverGlide>
        </section>
      )}

      <section className="sets-home__section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">Your sets</h2>
          {sets.length > 0 && <span className="sets-home__count">{sets.length.toLocaleString('en-US')}</span>}
        </div>
        {sets.length === 0 ? (
          <p className="sets-home__empty">Nothing here yet — paste a set link or type a DJ&apos;s name above.</p>
        ) : grouping === 'recent' ? (
          grid(sets)
        ) : (
          byDj.map((group) => (
            <div className="sets-home__dj" key={group.dj}>
              <div className="sets-home__dj-head">
                {onOpenDj ? (
                  <button type="button" className="sets-home__dj-name" onClick={() => onOpenDj(group.dj)}>
                    {group.dj}
                  </button>
                ) : (
                  <span className="sets-home__dj-name">{group.dj}</span>
                )}
                <span className="sets-home__count">
                  {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                </span>
              </div>
              {grid(group.sets)}
            </div>
          ))
        )}
      </section>
    </>
  )
}
