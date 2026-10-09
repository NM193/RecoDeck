// src/lib/setPlayer/SetPlayerEngine.ts
// The set player's engine (Sets redesign spec, Playing), mounted once in App
// as a component of its own, so a poll re-renders nothing but the bar and the
// set. While a set plays it opens the YouTube panel at its box, keeps it
// there every frame the box moves or resizes (a sidebar collapse, a banner, a
// window resize), moves it off the window while a menu, popover or modal is
// open, polls where the video is, and keeps the video and your own files
// from playing over each other.
import { useEffect, useRef } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { tauriApi } from '../tauri-api'
import { isOverlayOpen } from '../overlays'
import { audioPlayer } from '../audioPlayer'
import { playerPageUrl, watchUrl } from '../youtubeWindow'
import { panelBounds, panelBox, sameBounds, type Bounds } from './panelBounds'
import { queuePanel } from './panelQueue'
import { useSetPlayer, videoIsPlaying, type PlayingSet } from '../../store/setPlayerStore'
import { usePlayerStore } from '../../store/playerStore'
import { YT_PLAYING } from '../../types/youtube'

/** How often the panel is asked where the video is. */
const POLL_MS = 400

async function openPanel(playing: PlayingSet, bounds: Bounds): Promise<void> {
  // The player page needs a real http origin, which the companion server
  // provides. It is normally already running; start it if it is not.
  let status = await tauriApi.getCompanionStatus()
  if (!status.running || !status.port) status = await tauriApi.startCompanionServer()
  if (!status.port) throw new Error('The local server could not be started')
  // Closing first forgets the last set's position, so this one does not
  // start out reading it.
  await tauriApi.closeYouTubePanel().catch(() => {})
  await tauriApi.openYouTubePanel(
    playerPageUrl(status.port, playing.result.video.id, playing.startMs),
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  )
}

export function SetPlayerEngine(): null {
  const videoId = useSetPlayer((s) => s.playing?.result.video.id ?? null)

  // A panel left over from before a reload has no set to belong to.
  useEffect(() => {
    void queuePanel(() => tauriApi.closeYouTubePanel()).catch(() => {})
  }, [])

  // Open the panel at its box, then keep it there: a check of the box's
  // rectangle every frame while a set plays, sending new bounds only when
  // they change. No timers in the handoff between the page's box and the
  // bar's: whichever is registered when the frame runs wins. Every call that
  // creates, moves or closes the webview waits its turn (`queuePanel`), so a
  // stop or another set never overtakes an open still on its way.
  useEffect(() => {
    if (!videoId) return
    let live = true
    let opening = false
    let opened = false
    let last: Bounds | null = null
    let frame = 0
    const tick = () => {
      if (!live) return
      const { pageBox, barBox, playing } = useSetPlayer.getState()
      const box = panelBox(pageBox, barBox)
      const rect = box?.isConnected ? box.getBoundingClientRect() : null
      const bounds = panelBounds(rect, isOverlayOpen())
      if (!opened) {
        if (!opening && rect && playing) {
          opening = true
          queuePanel(() => openPanel(playing, bounds)).then(
            () => {
              if (!live) return
              opened = true
              last = bounds
            },
            (err) => {
              if (!live) return
              // If the in-window panel cannot be shown, the browser still can.
              console.error('[Sets] panel failed, falling back to the browser', err)
              void openUrl(watchUrl(playing.result.video.url, playing.startMs))
              useSetPlayer.getState().stop()
            },
          )
        }
      } else if (!sameBounds(last, bounds)) {
        last = bounds
        void queuePanel(() =>
          tauriApi.setYouTubePanelBounds(bounds.x, bounds.y, bounds.width, bounds.height),
        ).catch(() => {})
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(frame)
    }
  }, [videoId])

  // Where the video is: the panel reports to the companion server, so it is
  // polled rather than observed, and only while a set plays.
  useEffect(() => {
    if (!videoId) return
    let live = true
    const timer = window.setInterval(() => {
      tauriApi
        .youtubePanelState()
        .then((state) => {
          if (live && useSetPlayer.getState().playing?.result.video.id === videoId) {
            useSetPlayer.getState().setPanel(state)
          }
        })
        .catch(() => {})
    }, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [videoId])

  // --- two players, one pair of ears -----------------------------------
  //
  // The video and the app's own player are separate engines that know nothing
  // about each other, so whichever starts hands the other a pause. When the
  // app starts the video itself, the store stops your file directly; this is
  // for the two starts it cannot see coming.
  const isPlayingOwnFile = usePlayerStore((state) => state.isPlaying)
  const setOwnIsPlaying = usePlayerStore((state) => state.setIsPlaying)
  const videoPlaying = useSetPlayer((s) => s.panel?.player_state === YT_PLAYING)

  /**
   * True from the moment the video is asked to stand down until it says it
   * has. The panel's state arrives through a poll, so for the best part of a
   * second after "have it" is clicked the video still reports itself as
   * playing; without this latch the file would be paused a moment after it
   * began.
   */
  const waitingForVideoToStop = useRef(false)

  // The pause landed. Whatever the video reports from here is current again.
  useEffect(() => {
    if (!videoPlaying) waitingForVideoToStop.current = false
  }, [videoPlaying])

  // The video started from a click inside the panel.
  useEffect(() => {
    if (videoPlaying && isPlayingOwnFile && !waitingForVideoToStop.current) {
      audioPlayer.pause()
      setOwnIsPlaying(false)
    }
  }, [videoPlaying, isPlayingOwnFile, setOwnIsPlaying])

  // A file of your own started, so a playing video steps back. A paused one
  // needs nothing, and must not leave the latch set with no pause to clear it.
  const wasPlayingOwnFile = useRef(false)
  useEffect(() => {
    const started = isPlayingOwnFile && !wasPlayingOwnFile.current
    wasPlayingOwnFile.current = isPlayingOwnFile
    if (started && videoId && videoIsPlaying(useSetPlayer.getState().panel)) {
      // Said before the request goes out, so the rule above is already deaf
      // to the reports still in flight.
      waitingForVideoToStop.current = true
      void tauriApi.pauseYouTubePanel().catch(() => {})
    }
  }, [isPlayingOwnFile, videoId])

  return null
}
