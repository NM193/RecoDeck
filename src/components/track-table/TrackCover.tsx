// src/components/track-table/TrackCover.tsx
// A row's cover (track table spec, Rows): the artwork thumbnail, faded in
// when it arrives (at once when it was read before); a quiet empty square
// while it is read and for a track without artwork, as in Traktor. Give it
// `key={track.id}` where rows are reused.
import { useEffect, useState } from 'react'
import type { Track } from '../../types/track'
import { thumbnails } from '../../lib/thumbnails/thumbnails'
import type { Thumb } from '../../lib/thumbnails/queue'

export function TrackCover({ track }: { track: Track }) {
  // What was known when the row appeared: a cover read before shows at once.
  const [known] = useState(() => thumbnails.cached(track.id))
  const [thumb, setThumb] = useState<Thumb | undefined>(known)

  useEffect(() => {
    if (thumb !== undefined) return
    // Cancelled when the row leaves the view before its turn.
    return thumbnails.request(track.id, setThumb)
  }, [track.id, thumb])

  return (
    <span className="tt-cover">
      {thumb && (
        <img
          className={known === undefined ? 'tt-cover__img tt-cover__img--in' : 'tt-cover__img'}
          src={thumb}
          alt=""
          draggable={false}
        />
      )}
    </span>
  )
}
