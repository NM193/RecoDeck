// src/components/dj/DjSetsTab.tsx
// The Sets tab: the DJ's saved sets as cards, each opening in Sets, then
// "Find more", which opens Sets with the name typed in its box (not run).
import { Icon } from '../Icon'
import { setMeta, setThumbnail } from '../../lib/dj/page'
import type { YtSetSummary } from '../../types/youtube'

/** One saved set: its YouTube thumbnail, title and "1 h 52 min · 24 tracks". The overview's Sets card shows these too. */
export function SetCard({
  set,
  onOpen,
}: {
  set: YtSetSummary
  onOpen: (videoId: string) => void
}) {
  return (
    <button
      type="button"
      className="dj-set"
      onClick={() => onOpen(set.video_id)}
    >
      <span className="dj-set__thumb">
        <img
          src={setThumbnail(set.video_id)}
          alt=""
          loading="lazy"
          // No thumbnail (a removed video): the grey box stays.
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
      </span>
      <span className="dj-set__text">
        <b>{set.title}</b>
        <span>{setMeta(set)}</span>
      </span>
    </button>
  )
}

interface DjSetsTabProps {
  name: string
  /** Null while the library of sets is read. */
  sets: YtSetSummary[] | null
  onOpenSet: (videoId: string) => void
  onFindMore: () => void
}

export function DjSetsTab({
  name,
  sets,
  onOpenSet,
  onFindMore,
}: DjSetsTabProps) {
  if (sets === null) return <p className="dj-note">Reading your saved sets…</p>
  return (
    <>
      {sets.length === 0 && (
        <p className="dj-note">No saved sets of {name} yet.</p>
      )}
      <div className="dj-sets">
        {sets.map((set) => (
          <SetCard key={set.video_id} set={set} onOpen={onOpenSet} />
        ))}
        <button
          type="button"
          className="dj-set dj-set--more"
          onClick={onFindMore}
        >
          <span className="dj-set__thumb">
            <Icon name="Search" size={20} />
          </span>
          <span className="dj-set__text">
            <b>Find more</b>
            <span>Search YouTube for {name}</span>
          </span>
        </button>
      </div>
    </>
  )
}
