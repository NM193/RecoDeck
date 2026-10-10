// src/components/track-table/TrackCell.tsx
// One cell of a track row, for any column but # and the artwork (track table
// spec, Columns). Missing values show "—".
import type { ReactNode } from 'react'
import type { Track } from '../../types/track'
import { columnDef, type ColumnId } from '../../lib/trackTable/columns'
import { MISSING, formatAdded, formatFormat, formatTime } from '../../lib/trackTable/cells'
import { StarRating } from '../StarRating'

interface TrackCellProps {
  column: ColumnId
  track: Track
  /** Plays per track; null while the Plays column is hidden or loading. */
  plays: ReadonlyMap<number, number> | null
  /** Opens the comment editor; absent where comments cannot be edited. */
  onEditComment?: (track: Track) => void
  /** Saves a new rating; absent where ratings cannot be edited. */
  onRate?: (track: Track, rating: number) => void
}

const missing = <span className="cell-missing">{MISSING}</span>

function text(value: string | undefined): ReactNode {
  return value ? value : missing
}

export function TrackCell({ column, track, plays, onEditComment, onRate }: TrackCellProps) {
  const className = columnDef(column).align === 'end' ? 'tt-cell cell--end' : 'tt-cell'

  switch (column) {
    case 'title':
      return (
        <div className="tt-cell cell-title">
          <div className="cell-title__name" data-tip={track.title || undefined} data-tip-overflow>
            {track.title || <span className="cell-missing">Untitled</span>}
          </div>
          <div className="cell-title__artist" data-tip={track.artist || undefined} data-tip-overflow>
            {text(track.artist)}
          </div>
        </div>
      )
    case 'bpm':
      return <div className={className}>{track.bpm ? track.bpm.toFixed(2) : missing}</div>
    case 'key':
      return (
        <div
          className={className}
          data-tip={
            track.key_confidence != null
              ? `${track.musical_key ?? MISSING} (${Math.round(track.key_confidence * 100)}%)`
              : undefined
          } aria-description={
            track.key_confidence != null
              ? `${track.musical_key ?? MISSING} (${Math.round(track.key_confidence * 100)}%)`
              : undefined
          }
        >
          {text(track.musical_key)}
        </div>
      )
    case 'genre':
      return <div className={className} data-tip={track.genre || undefined} data-tip-overflow>{text(track.genre)}</div>
    case 'label':
      return <div className={className} data-tip={track.label || undefined} data-tip-overflow>{text(track.label)}</div>
    case 'album':
      return <div className={className} data-tip={track.album || undefined} data-tip-overflow>{text(track.album)}</div>
    case 'time':
      return <div className={className}>{formatTime(track.duration_ms)}</div>
    case 'added':
      return <div className={className}>{formatAdded(track.date_added)}</div>
    case 'format':
      return <div className={className}>{formatFormat(track.file_format, track.bitrate)}</div>
    case 'plays': {
      const count = plays?.get(track.id)
      return <div className={className}>{count ? count : missing}</div>
    }
    case 'rating':
      return (
        <div className="tt-cell cell-rating" onClick={(event) => event.stopPropagation()}>
          <StarRating
            value={track.rating ?? 0}
            readonly={!onRate}
            onChange={(rating) => onRate?.(track, rating)}
          />
        </div>
      )
    case 'comment':
      return (
        <div
          className={onEditComment ? `${className} cell-comment` : className}
          data-tip={track.comment || undefined} data-tip-overflow
          onClick={(event) => {
            if (!onEditComment) return
            event.stopPropagation()
            onEditComment(track)
          }}
        >
          {track.comment ||
            (onEditComment ? <span className="cell-missing">+ Add</span> : missing)}
        </div>
      )
  }
}
