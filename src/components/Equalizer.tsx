// src/components/Equalizer.tsx
// Three thin bars for the track playing (track table spec, Rows): they move
// while it plays and stand still, mid-move, while it is paused. The Home and
// Sets specs use it too. Its colour is the text colour around it.
import './Equalizer.css'

export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'equalizer equalizer--playing' : 'equalizer'} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
