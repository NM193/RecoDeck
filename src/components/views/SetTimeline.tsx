import { msToCue, type Track } from '../../lib/tracklist'

/**
 * The set as a strip: one block per track, as wide as the track is long.
 *
 * It answers at a glance what a list cannot — where the unknowns sit, how the
 * set is paced, and how much of it is actually identified. Red blocks are slots
 * nobody named; clicking any block plays from there.
 *
 * Where enough of the set is in the library, the blocks also carry height: the
 * tempo of each record, so the shape of the strip is the shape of the set. A DJ
 * builds and releases over two hours, and a row of equal blocks cannot show it.
 *
 * The tempo is the one measured on the user's own copy of the record. A DJ
 * pitches, so this is the record's tempo rather than the night's — close enough
 * to show the arc, and the only figure that exists without decoding the video.
 */

/** Below this many measured tracks the arc is noise, so the flat strip stays. */
const MIN_MEASURED = 3

export function SetTimeline({
  tracks,
  durationMs,
  onSeek,
  positionMs,
  playingIndex,
  bpmByIndex,
}: {
  tracks: Track[]
  durationMs: number
  onSeek: (cueMs: number) => void
  /** Where the video is, when it is open. Draws the playhead. */
  positionMs?: number
  /** The block to light up, so the strip says which one this is. */
  playingIndex?: number | null
  /** Tempo of the records the user owns, by track index. */
  bpmByIndex?: Map<number, number>
}) {
  if (!durationMs || tracks.length === 0) return null

  const marks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(durationMs * fraction))

  const measured = tracks
    .map((t) => bpmByIndex?.get(t.index))
    .filter((bpm): bpm is number => typeof bpm === 'number' && bpm > 0)

  const showTempo = measured.length >= MIN_MEASURED
  const lowest = showTempo ? Math.min(...measured) : 0
  const highest = showTempo ? Math.max(...measured) : 0
  // A set that never changes tempo would divide by zero and, worse, would draw
  // every bar at the bottom. A flat set is a full strip, not an empty one.
  const span = Math.max(1, highest - lowest)

  /** 0.35 to 1 rather than 0 to 1: the slowest record is still a record. */
  const heightOf = (bpm: number) => 0.35 + 0.65 * ((bpm - lowest) / span)

  return (
    <div className="sets-timeline">
      <div className={`sets-timeline__strip ${showTempo ? 'sets-timeline__strip--tempo' : ''}`}>
        {tracks.map((track, i) => {
          const next = tracks[i + 1]?.cueMs ?? durationMs
          const left = (track.cueMs / durationMs) * 100
          const width = Math.max(0.2, ((next - track.cueMs) / durationMs) * 100)
          const name = track.isUnknown
            ? 'ID — nobody named it'
            : track.artist
              ? `${track.artist} — ${track.title}`
              : track.title

          const bpm = bpmByIndex?.get(track.index)
          const height = showTempo && bpm ? `${heightOf(bpm) * 100}%` : undefined

          return (
            <button
              key={track.index}
              type="button"
              className={`sets-timeline__block ${
                track.isUnknown ? 'sets-timeline__block--unknown' : ''
              } ${track.index === playingIndex ? 'sets-timeline__block--playing' : ''} ${
                showTempo && !bpm ? 'sets-timeline__block--unmeasured' : ''
              }`}
              style={{ left: `${left}%`, width: `${width}%`, height }}
              title={`${track.cue}  ${name}${bpm ? `  ·  ${Math.round(bpm)} BPM` : ''}`}
              onClick={() => onSeek(track.cueMs)}
            />
          )
        })}

        {/* Where the video actually is, which the blocks alone cannot say. */}
        {positionMs != null && positionMs > 0 && (
          <div
            className="sets-timeline__playhead"
            style={{ left: `${Math.min(100, (positionMs / durationMs) * 100)}%` }}
          />
        )}
      </div>

      <div className="sets-timeline__scale">
        {marks.map((ms, i) => (
          <span key={ms} className={i === marks.length - 1 ? 'sets-timeline__end' : undefined}>
            {msToCue(ms)}
          </span>
        ))}
      </div>

      {showTempo && (
        <p className="sets-timeline__legend">
          Height is tempo, {Math.round(lowest)}–{Math.round(highest)} BPM, from the{' '}
          {measured.length} of {tracks.length} you own. Short flat blocks are records not in the
          library.
        </p>
      )}
    </div>
  )
}
