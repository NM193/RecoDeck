// src/store/setPlayerStore.ts
// The set playing in the YouTube panel (Sets redesign spec, Playing): which
// set, where the video is, and which box the panel sits in. It lives in App,
// not in Sets, so the video keeps playing in the bar above the player when
// you leave the set — the bar needs the set's tracks while Sets is closed.
// `SetPlayerEngine` (mounted once in App) opens, places, polls and closes
// the panel; everything else reads and acts through this store.
//
// The panel takes its orders through the companion server, which keeps ONE
// instruction (seek, pause or play) that the player page polls every 400ms:
// so a seek is never followed by a play (the page's seek plays anyway), and
// nothing is sent until the new page is listening.
import { create } from 'zustand'
import { tauriApi } from '../lib/tauri-api'
import { audioPlayer } from '../lib/audioPlayer'
import { queuePanel } from '../lib/setPlayer/panelQueue'
import {
  SEEK_SETTLE_MS,
  STATE_SETTLE_MS,
  believedPosition,
  believedState,
  isPlayingState,
  stepCue,
  type PendingSeek,
  type PendingState,
} from '../lib/setPlayer/playhead'
import type { TracklistResult } from '../lib/tracklist'
import { usePlayerStore } from './playerStore'
import { YT_PLAYING, type YouTubePanelState } from '../types/youtube'

export interface PlayingSet {
  /** The parsed set: its video (id, url, title, channel, length) and tracks. */
  result: TracklistResult
  /** Where it was asked to start, in ms: the panel opens there. */
  startMs: number
}

interface SetPlayerState {
  playing: PlayingSet | null
  /** What the panel last reported, with a seek, play or pause just sent applied. */
  panel: YouTubePanelState | null
  /** The video has reported its length since it opened: the page is listening. */
  reported: boolean
  /** A seek asked for before that: sent with the first report. */
  deferredSeek: number | null
  pendingSeek: PendingSeek | null
  pendingState: PendingState | null
  /** The playing set's page box, while that page is mounted. */
  pageBox: HTMLElement | null
  /** The bar's box, while the bar shows. */
  barBox: HTMLElement | null

  /** Plays a set from a cue; the set already playing is sought instead. */
  play: (result: TracklistResult, cueMs: number) => void
  seek: (ms: number) => void
  /** ⏮ (-1) / ⏭ (1) from the track the playhead is in. */
  step: (direction: 1 | -1) => void
  togglePause: () => void
  /** ✕: stops the video and closes the panel. */
  stop: () => void
  /** Look again on the playing set: new rows, the video plays on. */
  replaceResult: (result: TracklistResult) => void
  /** A poll's report. */
  setPanel: (state: YouTubePanelState) => void
  /** Callback refs: a box registers when it mounts, null when it unmounts. */
  attachPageBox: (el: HTMLElement | null) => void
  attachBarBox: (el: HTMLElement | null) => void
}

/** Playing or buffering: the video means to play. */
export function videoIsPlaying(panel: YouTubePanelState | null): boolean {
  return panel !== null && isPlayingState(panel.player_state)
}

/**
 * The app starts the video itself (Play set, ▶, a seek, the bar's Play):
 * your own file stops at once. The engine's latch covers the one start the
 * app cannot see coming — a click inside the panel.
 */
function pauseOwnFile() {
  if (!usePlayerStore.getState().isPlaying) return
  audioPlayer.pause()
  usePlayerStore.getState().setIsPlaying(false)
}

const holding = (playing: boolean): PendingState => ({ playing, until: Date.now() + STATE_SETTLE_MS })

export const useSetPlayer = create<SetPlayerState>((set, get) => ({
  playing: null,
  panel: null,
  reported: false,
  deferredSeek: null,
  pendingSeek: null,
  pendingState: null,
  pageBox: null,
  barBox: null,

  play: (result, cueMs) => {
    if (get().playing?.result.video.id === result.video.id) {
      get().seek(cueMs)
      return
    }
    pauseOwnFile()
    // The panel opens at the cue (the engine); until it reports, it is there,
    // starting (buffering), so the button already offers Pause.
    set({
      playing: { result, startMs: cueMs },
      panel: { position_ms: cueMs, duration_ms: 0, player_state: 3 },
      reported: false,
      deferredSeek: null,
      pendingSeek: null,
      pendingState: null,
    })
  },

  seek: (ms) => {
    const { playing, panel, reported } = get()
    if (!playing) return
    pauseOwnFile()
    // The page's seek plays as well: it is playing from here.
    const next = { position_ms: ms, duration_ms: panel?.duration_ms ?? 0, player_state: 3 }
    if (!reported) {
      // The new page takes the first instruction it sees as its starting
      // point and would drop this one: it waits for the first report (and
      // opens there, if the panel is not open yet).
      set({ panel: next, deferredSeek: ms, playing: { ...playing, startMs: ms } })
      return
    }
    set({
      panel: next,
      pendingSeek: { ms, until: Date.now() + SEEK_SETTLE_MS },
      pendingState: holding(true),
    })
    void tauriApi.seekYouTubePanel(Math.floor(ms / 1000)).catch(() => {})
  },

  step: (direction) => {
    const { playing, panel } = get()
    if (!playing) return
    const cue = stepCue(playing.result.tracks, Boolean(playing.result.untimed), panel?.position_ms ?? 0, direction)
    if (cue !== null) get().seek(cue)
  },

  togglePause: () => {
    const { playing, panel } = get()
    if (!playing || !panel) return
    if (videoIsPlaying(panel)) {
      void tauriApi.pauseYouTubePanel().catch(() => {})
      set({ panel: { ...panel, player_state: 2 }, pendingState: holding(false) })
    } else {
      pauseOwnFile()
      void tauriApi.playYouTubePanel().catch(() => {})
      set({ panel: { ...panel, player_state: YT_PLAYING }, pendingState: holding(true) })
    }
  },

  stop: () => {
    if (!get().playing) return
    set({ playing: null, panel: null, reported: false, deferredSeek: null, pendingSeek: null, pendingState: null })
    // After any open still on its way, so it is the one closed.
    void queuePanel(() => tauriApi.closeYouTubePanel()).catch(() => {})
  },

  replaceResult: (result) => {
    const playing = get().playing
    if (playing?.result.video.id === result.video.id) set({ playing: { ...playing, result } })
  },

  setPanel: (state) => {
    // No length yet: the page is still loading (or the state was just
    // cleared), and what it says is not about this video.
    if (state.duration_ms <= 0) return
    const { pendingSeek, pendingState, deferredSeek, reported } = get()
    const now = Date.now()
    set({
      panel: {
        ...state,
        position_ms: believedPosition(state.position_ms, pendingSeek, now),
        player_state: believedState(state.player_state, pendingState, now),
      },
      reported: true,
      deferredSeek: null,
      pendingSeek: pendingSeek && now < pendingSeek.until ? pendingSeek : null,
      pendingState: pendingState && now < pendingState.until ? pendingState : null,
    })
    // The page is listening now: the seek asked for before it was goes out.
    if (!reported && deferredSeek !== null) get().seek(deferredSeek)
  },

  attachPageBox: (el) => set({ pageBox: el }),
  attachBarBox: (el) => set({ barBox: el }),
}))
