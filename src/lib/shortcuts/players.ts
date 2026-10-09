// src/lib/shortcuts/players.ts
// Which player Space and ⌘→ / ⌘← drive (Interactions spec, Keyboard): the one
// that played last — your own files (the bottom player) or the set video —
// so pausing the video and pressing Space again resumes the video.
import { usePlayerStore } from '../../store/playerStore'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'

export type PlayerKind = 'file' | 'set'

/** The bottom player's buttons. */
export interface FileControls {
  playPause: () => void
  next: () => void
  previous: () => void
}

let last: PlayerKind | null = null
let fileControls: FileControls | null = null

/** The bottom player hands over its buttons while it is mounted; the answer takes them back. */
export function registerFileControls(controls: FileControls): () => void {
  fileControls = controls
  return () => {
    if (fileControls === controls) fileControls = null
  }
}

/** Notes which player starts playing (a click inside the video counts too); the answer stops. */
export function trackLastPlayed(): () => void {
  const offFile = usePlayerStore.subscribe((state, before) => {
    if (state.isPlaying && !before.isPlaying) last = 'file'
  })
  const offSet = useSetPlayer.subscribe((state, before) => {
    if (videoIsPlaying(state.panel) && !videoIsPlaying(before.panel)) last = 'set'
  })
  return () => {
    offFile()
    offSet()
  }
}

export function lastPlayed(): PlayerKind | null {
  return last
}

/** Tests: nothing has played. */
export function forgetLastPlayed(): void {
  last = null
}

/** The set video when it played last and is still open; else your own files. */
export function whichPlayer(lastKind: PlayerKind | null, setOpen: boolean): PlayerKind {
  return lastKind === 'set' && setOpen ? 'set' : 'file'
}

/** Space, ⌘→ or ⌘←, on whichever player played last: the set's ⏯ ⏭ ⏮, or the bar's. */
export function drivePlayer(action: 'play-pause' | 'next' | 'previous'): void {
  const set = useSetPlayer.getState()
  if (whichPlayer(last, set.playing !== null) === 'set') {
    if (action === 'play-pause') set.togglePause()
    else set.step(action === 'next' ? 1 : -1)
    return
  }
  if (action === 'play-pause') fileControls?.playPause()
  else if (action === 'next') fileControls?.next()
  else fileControls?.previous()
}
