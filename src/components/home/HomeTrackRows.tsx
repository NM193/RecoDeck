// src/components/home/HomeTrackRows.tsx
// Track rows on Home's cards (Home cards spec, Cards in detail): number,
// title over artist, BPM, key and a last column. Under the mouse the number
// turns into ▶; ▶ or a double click plays, with the card's list as the queue.
// The track playing shows the equalizer and its title in the accent colour;
// under the mouse, pause while it plays and ▶ while it is paused. A row is a
// drag source carrying that one row (Interactions spec, Drag and drop).
import { useMemo } from 'react'
import { Icon } from '../Icon'
import { Equalizer } from '../Equalizer'
import { audioPlayer } from '../../lib/audioPlayer'
import { useTrackDrag } from '../../lib/drag/useTrackDrag'
import { useTrackDragStore } from '../../lib/drag/trackDrag'
import type { DropTarget } from '../../lib/drag/dropTargets'
import { bpmLabel } from '../../lib/home/labels'
import { usePlayerStore } from '../../store/playerStore'
import type { LibraryFolder, Track } from '../../types/track'

export interface TrackRowActions {
  /** `playlistId`: the playlist the play is recorded under. */
  onPlay: (
    track: Track,
    list: Track[],
    index: number,
    playlistId?: number,
  ) => void
  /** A row dropped on a playlist in the sidebar. */
  onAddToPlaylist: (tracks: Track[], playlistId: number) => void
  /** A row dropped on a library folder in the sidebar. */
  onMoveToFolder: (tracks: Track[], folder: LibraryFolder) => void
}

interface HomeTrackRowsProps<T extends Track> extends TrackRowActions {
  /** Names the drag source: the card's id. */
  table: string
  tracks: T[]
  /** Draws only the first rows (a long playlist); a play still queues them all. */
  limit?: number
  /** The last column: when it was played, added, or its length. */
  last: (track: T) => string
}

// The playing row's button: pause, or play on from where it stopped.
function togglePlayback() {
  if (usePlayerStore.getState().isPlaying) {
    audioPlayer.pause()
  } else {
    audioPlayer
      .resume()
      .catch((err) =>
        usePlayerStore.getState().setError(`Playback error: ${err}`),
      )
  }
}

export function HomeTrackRows<T extends Track>({
  table,
  tracks,
  limit,
  last,
  onPlay,
  onAddToPlaylist,
  onMoveToFolder,
}: HomeTrackRowsProps<T>) {
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)

  const startDrag = useTrackDrag({
    begin: (track) => ({
      tracks: [track],
      table,
      reorder: false,
      playlistId: null,
    }),
    onDrop: (payload, target: DropTarget) => {
      if (target.kind === 'playlist') onAddToPlaylist(payload.tracks, target.id)
      else if (target.kind === 'folder') {
        onMoveToFolder(payload.tracks, {
          path: target.path,
          label: target.name,
        })
      }
    },
  })
  // The row being dragged dims.
  const dragged = useTrackDragStore((state) =>
    state.payload?.table === table ? state.payload.tracks : null,
  )
  const draggedIds = useMemo(
    () => new Set(dragged?.map((t) => t.id)),
    [dragged],
  )

  const drawn = limit === undefined ? tracks : tracks.slice(0, limit)

  return (
    <div className="home-rows">
      {drawn.map((track, index) => {
        const playing =
          currentTrack != null &&
          track.id === currentTrack.id &&
          track.file_path === currentTrack.file_path
        const play = () => onPlay(track, tracks, index)
        return (
          <div
            key={`${track.id}\n${track.file_path}`}
            className={`home-row${playing ? ' home-row--playing' : ''}${draggedIds.has(track.id) ? ' home-row--dragging' : ''}`}
            // A press drags the row, not the text in it.
            onMouseDown={(e) => {
              if (e.button === 0 && !(e.target as Element).closest('button'))
                e.preventDefault()
            }}
            onPointerDown={(e) => startDrag(e, track)}
            onDoubleClick={play}
          >
            <span className="home-row__no">
              {playing ? (
                <Equalizer playing={isPlaying} />
              ) : (
                <span className="home-row__number">{index + 1}</span>
              )}
              <button
                type="button"
                className="home-row__action"
                aria-label={
                  playing
                    ? isPlaying
                      ? 'Pause'
                      : 'Play'
                    : `Play ${track.title || 'track'}`
                }
                onClick={(e) => {
                  // The second click of a double click: the first did it.
                  if (e.detail > 1) return
                  if (playing) togglePlayback()
                  else play()
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon
                  name={playing && isPlaying ? 'Pause' : 'Play'}
                  size={13}
                />
              </button>
            </span>
            <span className="home-row__text">
              <span className="home-row__title">
                {track.title || 'Untitled'}
              </span>
              <span className="home-row__artist">
                {track.artist || 'Unknown Artist'}
              </span>
            </span>
            <span className="home-row__figure">{bpmLabel(track.bpm)}</span>
            <span className="home-row__figure">{track.musical_key || '—'}</span>
            <span className="home-row__last">{last(track)}</span>
          </div>
        )
      })}
    </div>
  )
}
