import { useEffect, useState, useRef, useCallback } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Icon } from './Icon';
import './MiniPlayer.css';
import type { Track } from '../types/track';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
}

export function MiniPlayer() {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    isLoading: false,
  });

  // Local drag position for immediate visual feedback during seeking
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  const progressRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const unlistenState = listen<PlayerState>('player-state', (ev) => {
      // Don't override position while user is dragging
      if (isDraggingRef.current) {
        setState((prev) => ({ ...ev.payload, position: prev.position }));
      } else {
        setState(ev.payload);
      }
    });

    // Lightweight position-only updates (~10x/sec, avoids serializing the full queue)
    const unlistenPos = listen<{ position: number; duration: number }>('player-position', (ev) => {
      if (!isDraggingRef.current) {
        setState((prev) => ({ ...prev, position: ev.payload.position, duration: ev.payload.duration }));
      }
    });

    emit('request-player-state', null);

    return () => {
      unlistenState.then((fn) => fn());
      unlistenPos.then((fn) => fn());
    };
  }, []);

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

  const handlePlayPause = useCallback(() => {
    emit('player-action', { type: 'playPause' });
  }, []);

  const handlePrevious = useCallback(() => {
    emit('player-action', { type: 'previous' });
  }, []);

  const handleNext = useCallback(() => {
    emit('player-action', { type: 'next' });
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const effectiveDuration = state.duration || (state.currentTrack?.duration_ms ?? 0);
  const displayPosition = dragPosition ?? state.position;
  const progress = effectiveDuration > 0
    ? Math.min(100, Math.max(0, (displayPosition / effectiveDuration) * 100))
    : 0;

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
    if (!state.currentTrack || effectiveDuration === 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const DRAG_THRESHOLD = 5;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        // Update local position immediately for visual feedback
        setDragPosition(calcSeekPosition(ev.clientX));
      }
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      isDraggingRef.current = false;
      const seekPos = Math.floor(calcSeekPosition(ev.clientX));
      setDragPosition(null);
      // Send seek action to main window only on release
      emit('player-action', { type: 'seek', payload: seekPos });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  let artworkUrl: string | null = null;
  if (state.currentTrack?.artwork_path) {
    try {
      artworkUrl = convertFileSrc(state.currentTrack.artwork_path);
    } catch {
      artworkUrl = null;
    }
  }

  return (
    <div className="mini-player">
      <div className="mini-player__header">
        <h2 className="mini-player__title">Now Playing</h2>
        <button
          className="mini-player__close"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
        >
          <Icon name="X" size={20} />
        </button>
      </div>

      <div className="mini-player__artwork">
        {state.currentTrack ? (
          artworkUrl ? (
            <img src={artworkUrl} alt="" className="mini-player__artwork-img" />
          ) : (
            <div className="mini-player__artwork-placeholder">
              <Icon name="Music" size={64} className="mini-player__artwork-icon" />
            </div>
          )
        ) : (
          <div className="mini-player__artwork-placeholder mini-player__artwork-placeholder--empty">
            <Icon name="Music" size={64} className="mini-player__artwork-icon" />
          </div>
        )}
      </div>

      {state.currentTrack && (
        <div className="mini-player__meta">
          <span className="mini-player__track-title">
            {state.currentTrack.title || 'Unknown'}
          </span>
          <span className="mini-player__track-artist">
            {state.currentTrack.artist || 'Unknown'}
          </span>
        </div>
      )}

      <div className="mini-player__controls">
        <button
          className="mini-player__btn"
          onClick={handlePrevious}
          disabled={!state.currentTrack || state.isLoading}
          title="Previous"
          aria-label="Previous"
        >
          <Icon name="SkipBack" size={24} />
        </button>
        <button
          className="mini-player__btn mini-player__btn--play"
          onClick={handlePlayPause}
          disabled={!state.currentTrack || state.isLoading}
          title={state.isPlaying ? 'Pause' : 'Play'}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={state.isPlaying ? 'Pause' : 'Play'} size={32} />
        </button>
        <button
          className="mini-player__btn"
          onClick={handleNext}
          disabled={!state.currentTrack || state.isLoading}
          title="Next"
          aria-label="Next"
        >
          <Icon name="SkipForward" size={24} />
        </button>
      </div>

      <div className="mini-player__progress-wrap">
        <span className="mini-player__time">{formatTime(displayPosition)}</span>
        <div
          className="mini-player__progress"
          ref={progressRef}
          onMouseDown={handleProgressMouseDown}
        >
          <div className="mini-player__progress-track" />
          <div
            className="mini-player__progress-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="mini-player__progress-handle"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="mini-player__time">{formatTime(effectiveDuration)}</span>
      </div>

      {!state.currentTrack && (
        <p className="mini-player__empty">No track loaded. Play from the main window.</p>
      )}
    </div>
  );
}
