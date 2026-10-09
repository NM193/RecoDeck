// src/components/sets/SetsSaved.tsx
// Saved tracks (Sets redesign spec, Saved tracks): the hearted tracks of
// every set, in the set page's row style — the cue, the track over its set's
// title (which opens the set there), the store links, ♥ to let it go — and
// Copy list at the top right.
import { Icon } from '../Icon'
import { StoreLinks } from './StoreLinks'
import { toast } from '../../lib/toast'
import { savedList } from '../../lib/sets/setPage'
import type { SavedTrack } from '../../types/youtube'
import './SetsTabs.css'

interface SetsSavedProps {
  saved: SavedTrack[]
  /** The set the track was saved from, playing from its cue. */
  onOpenAt: (videoId: string, cueMs: number, title: string | null) => void
  onRemove: (track: SavedTrack) => void
}

export function SetsSaved({ saved, onOpenAt, onRemove }: SetsSavedProps) {
  return (
    <section className="saved">
      <div className="sets-home__head">
        <h2 className="sets-home__heading">Saved tracks</h2>
        {saved.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              void navigator.clipboard.writeText(savedList(saved))
              toast(`Copied ${saved.length} ${saved.length === 1 ? 'track' : 'tracks'}`)
            }}
          >
            Copy list
          </button>
        )}
      </div>
      {saved.length === 0 && <p className="follow-note">Heart a track in any set to keep it here.</p>}
      {saved.map((t) => (
        <div className="saved-row" key={t.id ?? `${t.video_id}|${t.cue_ms}|${t.title}`}>
          <span className="saved-row__cue">{t.cue}</span>
          <span className="saved-row__track">
            <span className="saved-row__name">
              {t.artist ? `${t.artist} — ${t.title}` : t.title}
              {t.mix && <span className="set-row__mix"> ({t.mix})</span>}
              <StoreLinks artist={t.artist} title={t.title} mix={t.mix} className="saved-row__stores" />
            </span>
            <button
              type="button"
              className="saved-row__set"
              title={`Open ${t.set_title ?? 'the set'} at ${t.cue ?? 'this track'}`}
              onClick={() => onOpenAt(t.video_id, t.cue_ms, t.set_title ?? null)}
            >
              {t.set_title ?? 'the set'}
            </button>
          </span>
          <button
            type="button"
            className="saved-row__heart"
            aria-label="Remove from Saved tracks"
            onClick={() => onRemove(t)}
          >
            <Icon name="Heart" size={13} />
          </button>
        </div>
      ))}
    </section>
  )
}
