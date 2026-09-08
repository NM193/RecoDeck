import { msToCue, type Track } from '../../lib/tracklist'

/**
 * The set as a strip: one block per track, as wide as the track is long.
 *
 * It answers at a glance what a list cannot — where the unknowns sit, how the
 * set is paced, and how much of it is actually identified. Red blocks are slots
 * nobody named; clicking any block plays from there.
 */
export function SetTimeline({
  tracks,
  durationMs,
  onSeek,
}: {
  tracks: Track[]
  durationMs: number
  onSeek: (cueMs: number) => void
}) {
  if (!durationMs || tracks.length === 0) return null

  const marks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(durationMs * fraction))

  return (
    <div className="sets-timeline">
      <div className="sets-timeline__strip">
        {tracks.map((track, i) => {
          const next = tracks[i + 1]?.cueMs ?? durationMs
          const left = (track.cueMs / durationMs) * 100
          const width = Math.max(0.2, ((next - track.cueMs) / durationMs) * 100)
          const name = track.isUnknown
            ? 'ID — nobody named it'
            : track.artist
              ? `${track.artist} — ${track.title}`
              : track.title

          return (
            <button
              key={track.index}
              type="button"
              className={`sets-timeline__block ${
                track.isUnknown ? 'sets-timeline__block--unknown' : ''
              }`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${track.cue}  ${name}`}
              onClick={() => onSeek(track.cueMs)}
            />
          )
        })}
      </div>
      <div className="sets-timeline__scale">
        {marks.map((ms, i) => (
          <span key={ms} className={i === marks.length - 1 ? 'sets-timeline__end' : undefined}>
            {msToCue(ms)}
          </span>
        ))}
      </div>
    </div>
  )
}
