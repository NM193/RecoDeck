import { useEffect, useRef, useState, useCallback } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { usePlayerStore } from '../../store/playerStore'
import { audioPlayer } from '../../lib/audioPlayer'
import { tauriApi } from '../../lib/tauri-api'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
  onGenerateAIPlaylist?: (track: Track) => void
  onGetRecommendations?: (track: Track) => void
}

export function NowPlayingBar({
  playlists = [],
  onAddToPlaylist,
  onTrackMetaClick,
  onGenerateAIPlaylist,
  onGetRecommendations,
}: NowPlayingBarProps) {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    isLoading,
    error,
    queue,
    currentTrackIndex,
    repeatMode,
    isShuffle,
    setPosition,
    setDuration,
    setVolume,
    setIsPlaying,
    setIsLoading,
    setError,
    setCurrentTrack,
    playNext,
    playPrevious,
    setRepeatMode,
    setShuffle,
    playTrackAtIndex,
  } = usePlayerStore()

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [prevVolume, setPrevVolume] = useState(0.7)
  const [isDragging, setIsDragging] = useState(false)
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false)
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [crossfadeDurationSec, setCrossfadeDurationSec] = useState(8)
  const [crossfadeTriggered, setCrossfadeTriggered] = useState(false)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)

  const progressRef = useRef<HTMLDivElement>(null)
  const playlistMenuRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<number | null>(null)

  // Refs to avoid stale closures in audio callbacks
  const isDraggingRef = useRef(isDragging)
  isDraggingRef.current = isDragging

  const repeatModeRef = useRef(repeatMode)
  repeatModeRef.current = repeatMode

  const currentTrackRef = useRef(currentTrack)
  currentTrackRef.current = currentTrack

  const currentTrackIndexRef = useRef(currentTrackIndex)
  currentTrackIndexRef.current = currentTrackIndex

  const queueRef = useRef(queue)
  queueRef.current = queue

  const playNextRef = useRef(playNext)
  playNextRef.current = playNext

  const crossfadeEnabledRef = useRef(crossfadeEnabled)
  crossfadeEnabledRef.current = crossfadeEnabled

  const crossfadeDurationSecRef = useRef(crossfadeDurationSec)
  crossfadeDurationSecRef.current = crossfadeDurationSec

  const crossfadeTriggeredRef = useRef(crossfadeTriggered)
  crossfadeTriggeredRef.current = crossfadeTriggered

  // Cooldown: timestamp of last crossfade swap
  const crossfadeCooldownUntilRef = useRef(0)

  // Refs for mini player action handlers
  const handlePlayPauseRef = useRef<() => void>(() => {})
  const handlePreviousRef = useRef<() => void>(() => {})
  const handleNextRef = useRef<() => void>(() => {})

  // Load album artwork when current track changes
  useEffect(() => {
    if (!currentTrack) {
      setArtworkUrl(null)
      return
    }
    let cancelled = false
    getTrackArtworkUrl(currentTrack.id).then((url) => {
      if (!cancelled) setArtworkUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [currentTrack?.id])

  // Load crossfade settings on mount
  useEffect(() => {
    ;(async () => {
      try {
        const [enabled, duration] = await Promise.all([
          tauriApi.getSetting('crossfade_enabled').catch(() => 'false'),
          tauriApi.getSetting('crossfade_duration_sec').catch(() => '8'),
        ])
        const isEnabled = enabled === 'true'
        const durationSec = parseInt(duration || '8', 10) || 8
        setCrossfadeEnabled(isEnabled)
        setCrossfadeDurationSec(durationSec)
        audioPlayer.setCrossfadeEnabled(isEnabled)
        audioPlayer.setCrossfadeDuration(durationSec)
      } catch (err) {
        console.warn('Failed to load crossfade settings:', err)
      }
    })()
  }, [])

  // Set up audio player callbacks (runs once on mount)
  useEffect(() => {
    audioPlayer.onPositionUpdate = (pos) => {
      if (!isDraggingRef.current) setPosition(pos)
    }

    audioPlayer.onDurationChange = (dur) => {
      setDuration(dur)
    }

    audioPlayer.onTrackEnded = () => {
      console.log(
        '[NowPlayingBar] onTrackEnded fired, currentIndex:',
        currentTrackIndexRef.current,
        'queueLength:',
        queueRef.current.length,
        'repeatMode:',
        repeatModeRef.current,
        'crossfadeTriggered:',
        crossfadeTriggeredRef.current,
      )

      const wasCrossfading =
        crossfadeTriggeredRef.current && audioPlayer.isCrossfadingState
      if (wasCrossfading) {
        console.log(
          '[NowPlayingBar] onTrackEnded: crossfade was active, marking as completed',
        )
        crossfadeCompletedRef.current = true
        crossfadeCooldownUntilRef.current = Date.now() + 5000
      } else {
        console.log('[NowPlayingBar] onTrackEnded: normal track end (no crossfade)')
      }

      setCrossfadeTriggered(false)

      if (repeatModeRef.current === 'one') {
        const track = currentTrackRef.current
        if (track) {
          ;(async () => {
            try {
              await audioPlayer.loadTrack(track.file_path, track.id)
              await audioPlayer.play()
            } catch (err) {
              setError(`Failed to repeat track: ${err}`)
            }
          })()
        }
      } else {
        let nextIndex = currentTrackIndexRef.current + 1
        console.log(
          '[NowPlayingBar] Calculating next track: currentIndex=' +
            currentTrackIndexRef.current +
            ', nextIndex=' +
            nextIndex +
            ', queueLength=' +
            queueRef.current.length,
        )

        if (nextIndex >= queueRef.current.length) {
          if (repeatModeRef.current === 'all') {
            nextIndex = 0
            console.log('[NowPlayingBar] End of queue, repeat all - wrapping to index 0')
          } else {
            console.log('[NowPlayingBar] End of queue, repeat off - stopping playback')
            setIsPlaying(false)
            setPosition(0)
            return
          }
        }

        const nextTrack = queueRef.current[nextIndex]
        if (!nextTrack) {
          console.error('[NowPlayingBar] Next track not found at index', nextIndex)
          setIsPlaying(false)
          return
        }

        console.log('[NowPlayingBar] Advancing to next track:', nextTrack.title || nextTrack.file_path)
        playTrackAtIndex(nextIndex)
      }
    }

    audioPlayer.onPlayStateChange = (playing) => {
      setIsPlaying(playing)
    }

    audioPlayer.onError = (err) => {
      setError(err)
      setIsPlaying(false)
    }

    const unlistenError = listen<string>('audio-error', (event) => {
      setError(event.payload)
      setIsPlaying(false)
    })

    return () => {
      audioPlayer.cleanup()
      unlistenError.then((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update volume when it changes
  useEffect(() => {
    audioPlayer.setVolume(volume)
  }, [volume])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  // Load and play track when currentTrackIndex changes
  const loadGenRef = useRef(0)
  const crossfadeCompletedRef = useRef(false)
  useEffect(() => {
    if (currentTrackIndex >= 0 && queue[currentTrackIndex]) {
      const track = queue[currentTrackIndex]
      const gen = ++loadGenRef.current
      console.log(
        `[NowPlayingBar] useEffect triggered: loading track index=${currentTrackIndex}, gen=${gen}, track="${track.title || track.file_path}"`,
      )

      if (crossfadeCompletedRef.current) {
        console.log(
          '[NowPlayingBar] useEffect: crossfade completed, updating track reference without reloading',
        )
        crossfadeCompletedRef.current = false
        setCurrentTrack(track)
        setCrossfadeTriggered(false)
        if (track.duration_ms) {
          audioPlayer.setMetadataDuration(track.duration_ms)
        }
        return
      }

      setCurrentTrack(track)
      setCrossfadeTriggered(false)
      ;(async () => {
        try {
          setIsLoading(true)
          setError(null)
          console.log(`[NowPlayingBar] useEffect: starting loadTrack for "${track.title || track.file_path}"`)
          await audioPlayer.loadTrack(track.file_path, track.id)
          if (gen !== loadGenRef.current) {
            console.log(`[NowPlayingBar] useEffect: gen mismatch after loadTrack (${gen} vs ${loadGenRef.current}), aborting`)
            return
          }
          if (track.duration_ms) {
            audioPlayer.setMetadataDuration(track.duration_ms)
          }
          console.log(`[NowPlayingBar] useEffect: loadTrack complete, calling play()`)
          await audioPlayer.play()
          console.log(`[NowPlayingBar] useEffect: play() completed successfully`)
        } catch (err) {
          if (gen !== loadGenRef.current) {
            console.log(`[NowPlayingBar] useEffect: gen mismatch in catch (${gen} vs ${loadGenRef.current}), ignoring error`)
            return
          }
          console.error(`[NowPlayingBar] useEffect: error during load/play:`, err)
          setError(`Failed to play track: ${err}`)
          setIsPlaying(false)
        } finally {
          if (gen === loadGenRef.current) {
            setIsLoading(false)
          }
        }
      })()
    } else if (currentTrackIndex >= 0) {
      console.warn(`[NowPlayingBar] useEffect: invalid state - currentTrackIndex=${currentTrackIndex} but no track in queue`)
    }
  }, [
    currentTrackIndex,
    queue,
    setCurrentTrack,
    setIsLoading,
    setError,
    setIsPlaying,
  ])

  // Monitor position for crossfade trigger
  useEffect(() => {
    if (
      !crossfadeEnabledRef.current ||
      !currentTrack ||
      !isPlaying ||
      crossfadeTriggered
    ) {
      return
    }

    if (repeatMode === 'one') {
      return
    }

    if (Date.now() < crossfadeCooldownUntilRef.current) {
      return
    }

    const crossfadeDurationMs = crossfadeDurationSecRef.current * 1000
    const trackDuration = currentTrack.duration_ms || duration

    if (position < crossfadeDurationMs * 2) {
      return
    }
    if (trackDuration < crossfadeDurationMs * 3) {
      return
    }

    const timeUntilEnd = trackDuration - position

    if (timeUntilEnd > 0 && timeUntilEnd <= crossfadeDurationMs + 500) {
      let nextTrackIndex = currentTrackIndex + 1
      if (nextTrackIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextTrackIndex = 0
        } else {
          return
        }
      }

      const nextTrack = queue[nextTrackIndex]
      if (nextTrack) {
        console.log(`[NowPlayingBar] Attempting crossfade: ${currentTrack.title} → ${nextTrack.title}`)

        audioPlayer
          .startCrossfadeToNext(
            nextTrack.file_path,
            nextTrack.id,
            nextTrack.bpm ?? null,
            currentTrack.bpm ?? null,
          )
          .then(() => {
            console.log('[NowPlayingBar] Crossfade started successfully')
            setCrossfadeTriggered(true)
            crossfadeTriggeredRef.current = true
          })
          .catch((err) => {
            console.log('[NowPlayingBar] Crossfade not available:', err.message)
            setCrossfadeTriggered(false)
            crossfadeTriggeredRef.current = false
          })
      }
    }
  }, [
    position,
    duration,
    currentTrack,
    currentTrackIndex,
    queue,
    repeatMode,
    isPlaying,
    crossfadeTriggered,
  ])

  // Close playlist menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        playlistMenuRef.current &&
        !playlistMenuRef.current.contains(e.target as Node)
      ) {
        setShowPlaylistMenu(false)
      }
    }
    if (showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPlaylistMenu])

  // Handle volume popup interaction (keep open during drag)
  useEffect(() => {
    if (isVolumeInteracting) {
      const handleMouseUp = () => {
        setIsVolumeInteracting(false)
      }
      document.addEventListener('mouseup', handleMouseUp)
      return () => document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isVolumeInteracting])

  // --- Emit player state for mini player ---

  const handlePlayPause = async () => {
    if (!currentTrack) return
    try {
      setIsLoading(true)
      setError(null)
      if (isPlaying) {
        audioPlayer.pause()
      } else {
        await audioPlayer.resume()
      }
    } catch (err) {
      setError(`Playback error: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePrevious = async () => {
    if (!currentTrack) return
    if (position > 3000) {
      try {
        await audioPlayer.seek(0)
        await new Promise((resolve) => setTimeout(resolve, 150))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } else {
      playPrevious()
    }
  }

  const handleNext = () => {
    setCrossfadeTriggered(false)
    crossfadeTriggeredRef.current = false
    playNext()
  }

  handlePlayPauseRef.current = handlePlayPause
  handlePreviousRef.current = handlePrevious
  handleNextRef.current = handleNext

  // Emit player state for mini player window
  useEffect(() => {
    const unReq = listen('request-player-state', () => {
      const s = usePlayerStore.getState()
      emit('player-state', {
        currentTrack: s.currentTrack,
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
        isLoading: s.isLoading,
      })
    })
    const unAct = listen<{ type: string; payload?: number }>(
      'player-action',
      (ev) => {
        const { type, payload } = ev.payload
        if (type === 'playPause') handlePlayPauseRef.current()
        else if (type === 'previous') handlePreviousRef.current()
        else if (type === 'next') handleNextRef.current()
        else if (type === 'seek' && typeof payload === 'number') {
          audioPlayer
            .seek(payload)
            .catch((err) => setError(err?.message ?? String(err)))
        }
      },
    )
    return () => {
      unReq.then((fn) => fn())
      unAct.then((fn) => fn())
    }
  }, [])

  // Throttled position emit for mini player
  const lastPositionEmitRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (now - lastPositionEmitRef.current < 250) return
    lastPositionEmitRef.current = now
    emit('player-position', { position, duration })
  }, [position, duration])

  // Emit full player state when non-position fields change
  useEffect(() => {
    emit('player-state', {
      currentTrack,
      isPlaying,
      position,
      duration,
      isLoading,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isPlaying, isLoading])

  const handleRepeatToggle = () => {
    if (repeatMode === 'off') setRepeatMode('all')
    else if (repeatMode === 'all') setRepeatMode('one')
    else setRepeatMode('off')
  }

  const handleVolumeToggle = () => {
    if (isMuted) {
      setVolume(prevVolume)
      setIsMuted(false)
    } else {
      setPrevVolume(volume)
      setVolume(0)
      setIsMuted(true)
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (val > 0) setIsMuted(false)
  }

  const handleAddToPlaylist = (playlistId: number) => {
    if (currentTrack && onAddToPlaylist) {
      onAddToPlaylist(currentTrack.id, playlistId)
    }
    setShowPlaylistMenu(false)
  }

  // Progress bar seeking (click + drag)
  const effectiveDuration = duration || audioPlayer.duration || 0

  const calcSeekPosition = useCallback(
    (clientX: number) => {
      if (!progressRef.current || effectiveDuration === 0) return 0
      const rect = progressRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * effectiveDuration
    },
    [effectiveDuration],
  )

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    if (!currentTrack || effectiveDuration === 0) return
    e.preventDefault()
    const startX = e.clientX
    const DRAG_THRESHOLD = 5

    const onMove = (ev: MouseEvent) => {
      if (
        !isDraggingRef.current &&
        Math.abs(ev.clientX - startX) > DRAG_THRESHOLD
      ) {
        isDraggingRef.current = true
        setIsDragging(true)
      }
      if (isDraggingRef.current) {
        setPosition(calcSeekPosition(ev.clientX))
      }
    }

    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setIsDragging(false)
      const pos = calcSeekPosition(ev.clientX)
      try {
        await audioPlayer.seek(Math.floor(pos))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // --- Helpers ---

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0

  const manualPlaylists = playlists.filter((p) => p.playlist_type === 'manual')

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return 'VolumeX'
    if (volume < 0.5) return 'Volume1'
    return 'Volume2'
  }

  // Build metadata line for left column
  const metadataLine = currentTrack
    ? [
        currentTrack.bpm ? `${Math.round(currentTrack.bpm)} BPM` : null,
        currentTrack.musical_key || null,
        currentTrack.genre || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  // --- Render ---

  return (
    <div className={`now-playing-bar ${!currentTrack ? 'now-playing-bar--empty' : ''}`}>
      {error && (
        <div className="now-playing-bar__error">
          {error}
          <button
            className="now-playing-bar__error-close"
            onClick={() => setError(null)}
          >
            x
          </button>
        </div>
      )}

      <div className="now-playing-bar__inner">
        {/* LEFT: Album art + track info */}
        <div className="now-playing-bar__left">
          <div
            className="now-playing-bar__artwork"
            onClick={() => currentTrack && onTrackMetaClick?.()}
            title={currentTrack ? 'Click to scroll to track in library' : undefined}
            style={{ cursor: currentTrack ? 'pointer' : 'default' }}
          >
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt="Album art"
                className="now-playing-bar__artwork-img"
              />
            ) : (
              <div className="now-playing-bar__artwork-placeholder">
                {currentTrack && <Icon name="Music" size={20} className="opacity-50" />}
              </div>
            )}
          </div>

          <div
            className={`now-playing-bar__track-info ${currentTrack ? 'now-playing-bar__track-info--clickable' : ''}`}
            onClick={() => currentTrack && onTrackMetaClick?.()}
            title={currentTrack ? 'Click to scroll to track in library' : undefined}
          >
            {currentTrack ? (
              <>
                <span className="now-playing-bar__title">
                  {currentTrack.title || 'Unknown'}
                </span>
                <span className="now-playing-bar__artist">
                  {currentTrack.artist || 'Unknown Artist'}
                </span>
                {metadataLine && (
                  <span className="now-playing-bar__metadata">{metadataLine}</span>
                )}
              </>
            ) : (
              <>
                <span className="now-playing-bar__title now-playing-bar__title--empty">
                  No track loaded
                </span>
                <span className="now-playing-bar__artist now-playing-bar__artist--empty">
                  Double-click a track to play
                </span>
              </>
            )}
          </div>
        </div>

        {/* CENTER: Transport controls + progress */}
        <div className="now-playing-bar__center">
          {/* Transport controls row */}
          <div className="now-playing-bar__controls">
            <button
              className={`now-playing-bar__btn now-playing-bar__btn--toggle ${isShuffle ? 'now-playing-bar__btn--active' : ''}`}
              onClick={() => setShuffle(!isShuffle)}
              title="Shuffle"
            >
              <Icon name="Shuffle" size={16} />
            </button>

            <button
              className="now-playing-bar__btn"
              onClick={handlePrevious}
              disabled={!currentTrack || isLoading}
              title="Previous"
            >
              <Icon name="SkipBack" size={18} />
            </button>

            <button
              className="now-playing-bar__btn now-playing-bar__btn--play"
              onClick={handlePlayPause}
              disabled={!currentTrack || isLoading}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              <Icon name={isPlaying ? 'Pause' : 'Play'} size={20} />
            </button>

            <button
              className="now-playing-bar__btn"
              onClick={handleNext}
              disabled={!currentTrack || isLoading}
              title="Next"
            >
              <Icon name="SkipForward" size={18} />
            </button>

            <button
              className={`now-playing-bar__btn now-playing-bar__btn--toggle ${repeatMode !== 'off' ? 'now-playing-bar__btn--active' : ''}`}
              onClick={handleRepeatToggle}
              title={
                repeatMode === 'one'
                  ? 'Repeat One'
                  : repeatMode === 'all'
                    ? 'Repeat All'
                    : 'Repeat'
              }
            >
              <Icon name="Repeat" size={16} />
              {repeatMode === 'one' && (
                <span className="now-playing-bar__repeat-badge">1</span>
              )}
            </button>
          </div>

          {/* Progress row */}
          <div className="now-playing-bar__progress-row">
            <span className="now-playing-bar__time">{formatTime(position)}</span>

            <div
              className="now-playing-bar__progress"
              ref={progressRef}
              onMouseDown={handleProgressMouseDown}
            >
              <div className="now-playing-bar__progress-track" />
              <div
                className="now-playing-bar__progress-fill"
                style={{ width: `${progress}%` }}
              />
              <div
                className="now-playing-bar__progress-handle"
                style={{ left: `${progress}%` }}
              />
            </div>

            <span className="now-playing-bar__time">{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* RIGHT: Volume + extras */}
        <div className="now-playing-bar__right">
          {/* Volume */}
          <div
            className="now-playing-bar__volume"
            ref={volumeRef}
            onMouseEnter={() => {
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
                hideTimeoutRef.current = null
              }
              setShowVolumeSlider(true)
            }}
            onMouseLeave={() => {
              if (isVolumeInteracting) return
              hideTimeoutRef.current = setTimeout(() => {
                setShowVolumeSlider(false)
                hideTimeoutRef.current = null
              }, 200)
            }}
          >
            <button
              className="now-playing-bar__btn"
              onClick={handleVolumeToggle}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <Icon name={getVolumeIcon()} size={18} />
            </button>

            {showVolumeSlider && (
              <div
                className="now-playing-bar__volume-popup"
                onMouseDown={() => setIsVolumeInteracting(true)}
                onMouseEnter={() => {
                  if (hideTimeoutRef.current) {
                    clearTimeout(hideTimeoutRef.current)
                    hideTimeoutRef.current = null
                  }
                }}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="now-playing-bar__volume-slider"
                  style={{
                    background: `linear-gradient(to top, var(--accent) 0%, var(--accent) ${(isMuted ? 0 : volume) * 100}%, var(--border) ${(isMuted ? 0 : volume) * 100}%, var(--border) 100%)`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Open Mini Player */}
          <button
            className="now-playing-bar__btn now-playing-bar__btn--action"
            onClick={() =>
              import('../../lib/miniPlayer')
                .then((m) => m.openMiniPlayer())
                .catch((err) =>
                  console.error('[NowPlayingBar] Mini player open failed:', err),
                )
            }
            title="Open Mini Player"
          >
            <Icon name="PictureInPicture2" size={18} />
          </button>

          {/* Add to playlist */}
          <div className="now-playing-bar__playlist-wrapper" ref={playlistMenuRef}>
            <button
              className="now-playing-bar__btn now-playing-bar__btn--action"
              onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
              disabled={!currentTrack}
              title="Add to playlist"
            >
              <Icon name="ListPlus" size={18} />
            </button>

            {showPlaylistMenu && (
              <div className="now-playing-bar__playlist-menu">
                <div className="now-playing-bar__playlist-header">
                  Add to playlist
                </div>
                {manualPlaylists.length > 0 ? (
                  manualPlaylists.map((p) => (
                    <button
                      key={p.id}
                      className="now-playing-bar__playlist-item"
                      onClick={() => handleAddToPlaylist(p.id)}
                    >
                      <Icon
                        name="ListMusic"
                        size={14}
                        className="opacity-50"
                        style={{ flexShrink: 0 }}
                      />
                      <span>{p.name}</span>
                      <span className="now-playing-bar__playlist-count">
                        {p.track_count}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="now-playing-bar__playlist-empty">
                    No playlists created yet
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generate AI Playlist from current track */}
          {onGenerateAIPlaylist && (
            <button
              className="now-playing-bar__btn now-playing-bar__btn--action"
              onClick={() => currentTrack && onGenerateAIPlaylist(currentTrack)}
              disabled={!currentTrack}
              title="Generate AI Playlist from this track"
            >
              <Icon name="Sparkles" size={18} />
            </button>
          )}

          {/* Get AI Recommendations */}
          {onGetRecommendations && (
            <button
              className="now-playing-bar__btn now-playing-bar__btn--action"
              onClick={() => currentTrack && onGetRecommendations(currentTrack)}
              disabled={!currentTrack}
              title={
                currentTrack
                  ? 'Get similar track recommendations'
                  : 'Play a track first to get recommendations'
              }
            >
              <Icon name="Compass" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
