import { useEffect, useRef, useState, useCallback } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '../store/playerStore';
import { audioPlayer } from '../lib/audioPlayer';
import { tauriApi } from '../lib/tauri-api';
import type { Playlist } from '../types/track';
import { Icon } from './Icon';
import './Player.css';

interface PlayerProps {
  playlists?: Playlist[];
  onAddToPlaylist?: (trackId: number, playlistId: number) => void;
  onTrackMetaClick?: () => void;
}

export function Player({ playlists = [], onAddToPlaylist, onTrackMetaClick }: PlayerProps) {
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
  } = usePlayerStore();

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.7);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false);
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false);
  const [crossfadeDurationSec, setCrossfadeDurationSec] = useState(8);
  const [crossfadeTriggered, setCrossfadeTriggered] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  // Refs to avoid stale closures in audio callbacks (so the useEffect only runs once)
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;

  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  const currentTrackIndexRef = useRef(currentTrackIndex);
  currentTrackIndexRef.current = currentTrackIndex;

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  const crossfadeEnabledRef = useRef(crossfadeEnabled);
  crossfadeEnabledRef.current = crossfadeEnabled;

  const crossfadeDurationSecRef = useRef(crossfadeDurationSec);
  crossfadeDurationSecRef.current = crossfadeDurationSec;

  const crossfadeTriggeredRef = useRef(crossfadeTriggered);
  crossfadeTriggeredRef.current = crossfadeTriggered;

  // Cooldown: timestamp of last crossfade swap, prevents re-triggering immediately
  const crossfadeCooldownUntilRef = useRef(0);

  // Refs for mini player action handlers (assigned after handlers are defined)
  const handlePlayPauseRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});

  // Load crossfade settings on mount
  useEffect(() => {
    (async () => {
      try {
        const [enabled, duration] = await Promise.all([
          tauriApi.getSetting("crossfade_enabled").catch(() => "false"),
          tauriApi.getSetting("crossfade_duration_sec").catch(() => "8"),
        ]);
        const isEnabled = enabled === "true";
        const durationSec = parseInt(duration || "8", 10) || 8;
        setCrossfadeEnabled(isEnabled);
        setCrossfadeDurationSec(durationSec);
        audioPlayer.setCrossfadeEnabled(isEnabled);
        audioPlayer.setCrossfadeDuration(durationSec);
      } catch (err) {
        console.warn("Failed to load crossfade settings:", err);
      }
    })();
  }, []);

  // Set up audio player callbacks (runs once on mount, cleans up on unmount)
  useEffect(() => {
    audioPlayer.onPositionUpdate = (pos) => {
      if (!isDraggingRef.current) setPosition(pos);
    };

    audioPlayer.onDurationChange = (dur) => {
      setDuration(dur);
    };

    audioPlayer.onTrackEnded = () => {
      console.log('[Player] onTrackEnded fired, currentIndex:', currentTrackIndexRef.current, 'queueLength:', queueRef.current.length, 'repeatMode:', repeatModeRef.current, 'crossfadeTriggered:', crossfadeTriggeredRef.current);

      // Check if this was a crossfade completion (track already changed in audioPlayer)
      // If crossfadeTriggered was true AND audioPlayer is in crossfading state, we were in a crossfade
      const wasCrossfading = crossfadeTriggeredRef.current && audioPlayer.isCrossfadingState;
      if (wasCrossfading) {
        console.log('[Player] onTrackEnded: crossfade was active, marking as completed');
        crossfadeCompletedRef.current = true;
        // Prevent crossfade monitor from re-triggering for 5 seconds after swap
        crossfadeCooldownUntilRef.current = Date.now() + 5000;
      } else {
        console.log('[Player] onTrackEnded: normal track end (no crossfade)');
      }

      // Reset crossfade trigger flag
      setCrossfadeTriggered(false);

      if (repeatModeRef.current === 'one') {
        // Repeat current track - no crossfade
        const track = currentTrackRef.current;
        if (track) {
          (async () => {
            try {
              await audioPlayer.loadTrack(track.file_path, track.id);
              await audioPlayer.play();
            } catch (err) {
              setError(`Failed to repeat track: ${err}`);
            }
          })();
        }
      } else {
        // Normal track end or crossfade completion
        // Calculate next index
        let nextIndex = currentTrackIndexRef.current + 1;
        console.log('[Player] Calculating next track: currentIndex=' + currentTrackIndexRef.current + ', nextIndex=' + nextIndex + ', queueLength=' + queueRef.current.length);

        if (nextIndex >= queueRef.current.length) {
          if (repeatModeRef.current === 'all') {
            nextIndex = 0; // Wrap to start
            console.log('[Player] End of queue, repeat all - wrapping to index 0');
          } else {
            // Repeat off: stop at end
            console.log('[Player] End of queue, repeat off - stopping playback');
            setIsPlaying(false);
            setPosition(0);
            return;
          }
        }

        const nextTrack = queueRef.current[nextIndex];
        if (!nextTrack) {
          console.error('[Player] Next track not found at index', nextIndex);
          setIsPlaying(false);
          return;
        }

        console.log('[Player] Advancing to next track:', nextTrack.title || nextTrack.file_path);

        // Update to next track index
        // If crossfade completed, this will just update the track reference without reloading
        playTrackAtIndex(nextIndex);
      }
    };

    audioPlayer.onPlayStateChange = (playing) => {
      setIsPlaying(playing);
    };

    audioPlayer.onError = (err) => {
      setError(err);
      setIsPlaying(false);
    };

    // Listen for audio errors from backend (native playback)
    const unlistenError = listen<string>('audio-error', (event) => {
      setError(event.payload);
      setIsPlaying(false);
    });

    return () => {
      audioPlayer.cleanup();
      unlistenError.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update volume when it changes
  useEffect(() => {
    audioPlayer.setVolume(volume);
  }, [volume]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Load and play track when currentTrackIndex changes.
  // We track a local generation counter so that if the effect fires again
  // (e.g. rapid song switches) the stale async chain bails out.
  const loadGenRef = useRef(0);
  const crossfadeCompletedRef = useRef(false);
  useEffect(() => {
    if (currentTrackIndex >= 0 && queue[currentTrackIndex]) {
      const track = queue[currentTrackIndex];
      const gen = ++loadGenRef.current;
      console.log(`[Player] useEffect triggered: loading track index=${currentTrackIndex}, gen=${gen}, track="${track.title || track.file_path}"`);
      console.log(`[Player] useEffect: queue length=${queue.length}, track at index is:`, {
        id: track.id,
        title: track.title,
        file_path: track.file_path,
      });

      // If crossfade just completed, the track is already loaded and playing
      // Just update the currentTrack reference without reloading
      if (crossfadeCompletedRef.current) {
        console.log('[Player] useEffect: crossfade completed, updating track reference without reloading');
        crossfadeCompletedRef.current = false;
        setCurrentTrack(track);
        setCrossfadeTriggered(false);
        if (track.duration_ms) {
          audioPlayer.setMetadataDuration(track.duration_ms);
        }
        return;
      }

      setCurrentTrack(track);
      setCrossfadeTriggered(false); // Reset crossfade trigger on track change

      (async () => {
        try {
          setIsLoading(true);
          setError(null);
          console.log(`[Player] useEffect: starting loadTrack for "${track.title || track.file_path}"`);
          await audioPlayer.loadTrack(track.file_path, track.id);
          if (gen !== loadGenRef.current) {
            console.log(`[Player] useEffect: gen mismatch after loadTrack (${gen} vs ${loadGenRef.current}), aborting`);
            return;
          }
          // Set metadata duration for internal use (crossfade trigger, premature-end detection).
          // Don't override displayed duration — let the browser report actual playable length.
          if (track.duration_ms) {
            audioPlayer.setMetadataDuration(track.duration_ms);
          }
          console.log(`[Player] useEffect: loadTrack complete, calling play()`);
          await audioPlayer.play();
          console.log(`[Player] useEffect: play() completed successfully`);
        } catch (err) {
          if (gen !== loadGenRef.current) {
            console.log(`[Player] useEffect: gen mismatch in catch (${gen} vs ${loadGenRef.current}), ignoring error`);
            return;
          }
          console.error(`[Player] useEffect: error during load/play:`, err);
          setError(`Failed to play track: ${err}`);
          setIsPlaying(false);
        } finally {
          if (gen === loadGenRef.current) {
            console.log(`[Player] useEffect: cleaning up, setting isLoading=false`);
            setIsLoading(false);
          }
        }
      })();
    } else if (currentTrackIndex >= 0) {
      console.warn(`[Player] useEffect: invalid state - currentTrackIndex=${currentTrackIndex} but no track in queue`);
    }
  }, [currentTrackIndex, queue, setCurrentTrack, setIsLoading, setError, setIsPlaying]);

  // Monitor position for crossfade trigger
  useEffect(() => {
    if (!crossfadeEnabledRef.current || !currentTrack || !isPlaying || crossfadeTriggered) {
      return;
    }

    // Don't crossfade on repeat one
    if (repeatMode === 'one') {
      return;
    }

    // Cooldown: don't re-trigger right after a crossfade swap
    if (Date.now() < crossfadeCooldownUntilRef.current) {
      return;
    }

    // Check if we're near the end
    const crossfadeDurationMs = crossfadeDurationSecRef.current * 1000;

    // Use metadata duration (from backend/symphonia) when available — more
    // reliable than browser-reported duration for VBR and certain formats.
    const trackDuration = currentTrack.duration_ms || duration;

    // Safety guards: don't trigger crossfade if values are unreliable
    // - Track must have played at least 2x the crossfade duration (avoids
    //   triggering on initial position/duration estimates that haven't settled)
    // - Duration must be at least 3x the crossfade duration (very short tracks
    //   shouldn't crossfade)
    if (position < crossfadeDurationMs * 2) {
      return;
    }
    if (trackDuration < crossfadeDurationMs * 3) {
      return;
    }

    const timeUntilEnd = trackDuration - position;

    if (timeUntilEnd > 0 && timeUntilEnd <= crossfadeDurationMs + 500) { // +500ms buffer
      // Check if there's a next track
      let nextTrackIndex = currentTrackIndex + 1;
      if (nextTrackIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextTrackIndex = 0; // Wrap to start
        } else {
          return; // No next track
        }
      }

      const nextTrack = queue[nextTrackIndex];
      if (nextTrack) {
        console.log(`[Player] Attempting crossfade: ${currentTrack.title} → ${nextTrack.title}`);

        // Start crossfade
        audioPlayer.startCrossfadeToNext(
          nextTrack.file_path,
          nextTrack.id,
          nextTrack.bpm ?? null,
          currentTrack.bpm ?? null
        ).then(() => {
          // Crossfade started successfully
          console.log('[Player] Crossfade started successfully');
          setCrossfadeTriggered(true);
          crossfadeTriggeredRef.current = true;
        }).catch((err) => {
          // Crossfade failed or not supported - normal track transition will happen
          console.log('[Player] Crossfade not available:', err.message);
          setCrossfadeTriggered(false);
          crossfadeTriggeredRef.current = false;
        });
      }
    }
  }, [position, duration, currentTrack, currentTrackIndex, queue, repeatMode, isPlaying, crossfadeTriggered]);

  // Close playlist menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setShowPlaylistMenu(false);
      }
    };
    if (showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPlaylistMenu]);

  // Handle volume popup interaction (keep open during drag)
  useEffect(() => {
    if (isVolumeInteracting) {
      const handleMouseUp = () => {
        setIsVolumeInteracting(false);
      };
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isVolumeInteracting]);

  // --- Handlers ---

  const handlePlayPause = async () => {
    if (!currentTrack) return;
    try {
      setIsLoading(true);
      setError(null);
      if (isPlaying) {
        audioPlayer.pause();
      } else {
        await audioPlayer.resume();
      }
    } catch (err) {
      setError(`Playback error: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevious = async () => {
    if (!currentTrack) return;

    // If more than 3 seconds into track, restart current track
    if (position > 3000) {
      try {
        await audioPlayer.seek(0);
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } else {
      // Go to actual previous track
      playPrevious();
    }
  };

  const handleNext = () => {
    // Abort any active crossfade when user manually skips
    setCrossfadeTriggered(false);
    crossfadeTriggeredRef.current = false;
    playNext();
  };

  handlePlayPauseRef.current = handlePlayPause;
  handlePreviousRef.current = handlePrevious;
  handleNextRef.current = handleNext;

  // Emit player state for mini player window (and listen for actions)
  useEffect(() => {
    const unReq = listen('request-player-state', () => {
      const s = usePlayerStore.getState();
      emit('player-state', {
        currentTrack: s.currentTrack,
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
        isLoading: s.isLoading,
      });
    });
    const unAct = listen<{ type: string; payload?: number }>('player-action', (ev) => {
      const { type, payload } = ev.payload;
      if (type === 'playPause') handlePlayPauseRef.current();
      else if (type === 'previous') handlePreviousRef.current();
      else if (type === 'next') handleNextRef.current();
      else if (type === 'seek' && typeof payload === 'number') {
        audioPlayer.seek(payload).catch((err) => setError(err?.message ?? String(err)));
      }
    });
    return () => {
      unReq.then((fn) => fn());
      unAct.then((fn) => fn());
    };
  }, []);

  // Throttled position emit for mini player (every 250ms instead of every tick)
  const lastPositionEmitRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastPositionEmitRef.current < 250) return;
    lastPositionEmitRef.current = now;
    emit('player-position', { position, duration });
  }, [position, duration]);

  // Emit full player state only when non-position fields change (infrequent)
  useEffect(() => {
    emit('player-state', {
      currentTrack,
      isPlaying,
      position,
      duration,
      isLoading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isPlaying, isLoading]);

  const handleRepeatToggle = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const handleVolumeToggle = () => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
  };

  const handleAddToPlaylist = (playlistId: number) => {
    if (currentTrack && onAddToPlaylist) {
      onAddToPlaylist(currentTrack.id, playlistId);
    }
    setShowPlaylistMenu(false);
  };

  // --- Progress bar seeking (click + drag) ---

  // Use audioPlayer.duration as fallback — store can lag one render, especially in native mode
  const effectiveDuration = duration || audioPlayer.duration || 0;

  const calcSeekPosition = useCallback(
    (clientX: number) => {
      if (!progressRef.current || effectiveDuration === 0) return 0;
      const rect = progressRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * effectiveDuration;
    },
    [effectiveDuration]
  );

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    if (!currentTrack || effectiveDuration === 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const DRAG_THRESHOLD = 5;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      if (isDraggingRef.current) {
        setPosition(calcSeekPosition(ev.clientX));
      }
    };

    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsDragging(false);
      const pos = calcSeekPosition(ev.clientX);
      try {
        await audioPlayer.seek(Math.floor(pos));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- Helpers ---

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  // Filter playlists to only manual ones (not folders)
  const manualPlaylists = playlists.filter((p) => p.playlist_type === 'manual');

  // Choose volume icon based on state
  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return 'VolumeX';
    if (volume < 0.5) return 'Volume1';
    return 'Volume2';
  };

  // --- Render ---

  return (
    <div className={`sc-player ${!currentTrack ? 'sc-player--empty' : ''}`}>
      {error && (
        <div className="sc-player__error">
          {error}
          <button className="sc-player__error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="sc-player__bar">
        {/* Left: Transport controls */}
        <div className="sc-player__controls">
          <button
            className="sc-player__btn"
            onClick={handlePrevious}
            disabled={!currentTrack || isLoading}
            title="Previous"
          >
            <Icon name="SkipBack" size={20} />
          </button>

          <button
            className="sc-player__btn sc-player__btn--play"
            onClick={handlePlayPause}
            disabled={!currentTrack || isLoading}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={isPlaying ? 'Pause' : 'Play'} size={20} />
          </button>

          <button
            className="sc-player__btn"
            onClick={handleNext}
            disabled={!currentTrack || isLoading}
            title="Next"
          >
            <Icon name="SkipForward" size={20} />
          </button>

          <button
            className={`sc-player__btn sc-player__btn--toggle ${isShuffle ? 'sc-player__btn--active' : ''}`}
            onClick={() => setShuffle(!isShuffle)}
            title="Shuffle"
          >
            <Icon name="Shuffle" size={20} />
          </button>

          <button
            className={`sc-player__btn sc-player__btn--toggle ${repeatMode !== 'off' ? 'sc-player__btn--active' : ''}`}
            onClick={handleRepeatToggle}
            title={repeatMode === 'one' ? 'Repeat One' : repeatMode === 'all' ? 'Repeat All' : 'Repeat'}
          >
            <Icon name="Repeat" size={20} />
            {repeatMode === 'one' && <span className="sc-player__repeat-badge">1</span>}
          </button>
        </div>

        {/* Middle: Timeline */}
        <div className="sc-player__timeline">
          <span className="sc-player__time">{formatTime(position)}</span>

          <div
            className="sc-player__progress"
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
          >
            <div className="sc-player__progress-track" />
            <div
              className="sc-player__progress-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="sc-player__progress-handle"
              style={{ left: `${progress}%` }}
            />
          </div>

          <span className="sc-player__time">{formatTime(duration)}</span>
        </div>

        {/* Volume */}
        <div
          className="sc-player__volume"
          ref={volumeRef}
          onMouseEnter={() => {
            // Clear any pending hide timeout
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = null;
            }
            setShowVolumeSlider(true);
          }}
          onMouseLeave={() => {
            // Don't hide if user is interacting with the slider
            if (isVolumeInteracting) {
              return;
            }
            // Delay hiding to allow moving mouse to popup
            hideTimeoutRef.current = setTimeout(() => {
              setShowVolumeSlider(false);
              hideTimeoutRef.current = null;
            }, 200);
          }}
        >
          <button
            className="sc-player__btn"
            onClick={handleVolumeToggle}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <Icon name={getVolumeIcon()} size={20} />
          </button>

          {showVolumeSlider && (
            <div 
              className="sc-player__volume-popup"
              onMouseDown={() => setIsVolumeInteracting(true)}
              onMouseEnter={() => {
                // Clear any pending hide timeout when entering popup
                if (hideTimeoutRef.current) {
                  clearTimeout(hideTimeoutRef.current);
                  hideTimeoutRef.current = null;
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
                className="sc-player__volume-slider"
                style={{
                  background: `linear-gradient(to top, var(--accent) 0%, var(--accent) ${(isMuted ? 0 : volume) * 100}%, var(--border) ${(isMuted ? 0 : volume) * 100}%, var(--border) 100%)`
                }}
              />
            </div>
          )}
        </div>

        {/* Right: Track info + actions */}
        <div className="sc-player__right">
          {/* Artwork thumbnail */}
          <div className="sc-player__artwork">
            {currentTrack ? (
              <div className="sc-player__artwork-placeholder">
                <Icon name="Music" size={20} className="opacity-50" />
              </div>
            ) : (
              <div className="sc-player__artwork-placeholder sc-player__artwork-placeholder--empty" />
            )}
          </div>

          {/* Track meta */}
          <div
            className={`sc-player__meta ${currentTrack ? 'sc-player__meta--clickable' : ''}`}
            onClick={() => {
              if (currentTrack && onTrackMetaClick) {
                onTrackMetaClick();
              }
            }}
            title={currentTrack ? 'Click to scroll to track in library' : undefined}
          >
            {currentTrack ? (
              <>
                <span className="sc-player__label">
                  {currentTrack.label || currentTrack.album || currentTrack.artist || 'Unknown'}
                </span>
                <span className="sc-player__title">
                  {currentTrack.artist || 'Unknown'} - {currentTrack.title || 'Unknown'}
                </span>
              </>
            ) : (
              <>
                <span className="sc-player__label sc-player__label--empty">No track loaded</span>
                <span className="sc-player__title sc-player__title--empty">
                  Double-click a track to play
                </span>
              </>
            )}
          </div>

          {/* Open Mini Player */}
          <button
            className="sc-player__btn sc-player__btn--action"
            onClick={() =>
              import('../lib/miniPlayer')
                .then((m) => m.openMiniPlayer())
                .catch((err) => console.error('[Player] Mini player open failed:', err))
            }
            title="Open Mini Player"
          >
            <Icon name="PictureInPicture2" size={20} />
          </button>

          {/* Add to playlist */}
          <div className="sc-player__playlist-wrapper" ref={playlistMenuRef}>
            <button
              className="sc-player__btn sc-player__btn--action"
              onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
              disabled={!currentTrack}
              title="Add to playlist"
            >
              <Icon name="ListPlus" size={20} />
            </button>

            {showPlaylistMenu && (
              <div className="sc-player__playlist-menu">
                <div className="sc-player__playlist-header">Add to playlist</div>
                {manualPlaylists.length > 0 ? (
                  manualPlaylists.map((p) => (
                    <button
                      key={p.id}
                      className="sc-player__playlist-item"
                      onClick={() => handleAddToPlaylist(p.id)}
                    >
                      <Icon name="ListMusic" size={16} className="opacity-50" style={{ flexShrink: 0 }} />
                      <span>{p.name}</span>
                      <span className="sc-player__playlist-count">{p.track_count}</span>
                    </button>
                  ))
                ) : (
                  <div className="sc-player__playlist-empty">No playlists created yet</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
