// Mobile player bar — bottom bar with playback controls

import { useState, useEffect, useRef, useCallback } from "react";
import type { Track } from "../../src/types/track";

interface MobilePlayerProps {
  track: Track;
  isPlaying: boolean;
  audio: HTMLAudioElement;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MobilePlayer({
  track,
  isPlaying,
  audio,
  onPlayPause,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: MobilePlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      if (!seeking) {
        setCurrentTime(audio.currentTime);
      }
    };
    const updateDuration = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("loadedmetadata", updateDuration);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("loadedmetadata", updateDuration);
    };
  }, [audio, seeking]);

  const handleSeek = useCallback(
    (clientX: number) => {
      if (!seekBarRef.current || !duration) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [audio, duration]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Compact bar (bottom of screen)
  if (!expanded) {
    return (
      <div className="mobile-player-bar" onClick={() => setExpanded(true)}>
        <div
          className="mobile-player-bar-progress"
          style={{ width: `${progress}%` }}
        />
        <div className="mobile-player-bar-content">
          <div className="mobile-player-bar-info">
            <span className="mobile-player-bar-title">
              {track.title || "Unknown"}
            </span>
            <span className="mobile-player-bar-artist">
              {track.artist || "Unknown Artist"}
            </span>
          </div>
          <div className="mobile-player-bar-controls">
            <button
              className="mobile-player-btn"
              onClick={(e) => {
                e.stopPropagation();
                onPlayPause();
              }}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              className="mobile-player-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              disabled={!hasNext}
            >
              ⏭
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen player
  return (
    <div className="mobile-player-full">
      <button
        className="mobile-player-collapse"
        onClick={() => setExpanded(false)}
      >
        ▼
      </button>

      <div className="mobile-player-full-info">
        <h2 className="mobile-player-full-title">
          {track.title || "Unknown"}
        </h2>
        <p className="mobile-player-full-artist">
          {track.artist || "Unknown Artist"}
        </p>
        {track.album && (
          <p className="mobile-player-full-album">{track.album}</p>
        )}
      </div>

      <div className="mobile-player-seek">
        <div
          ref={seekBarRef}
          className="mobile-player-seek-bar"
          onClick={(e) => handleSeek(e.clientX)}
          onTouchStart={() => setSeeking(true)}
          onTouchEnd={(e) => {
            setSeeking(false);
            const touch = e.changedTouches[0];
            if (touch) handleSeek(touch.clientX);
          }}
        >
          <div
            className="mobile-player-seek-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mobile-player-times">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="mobile-player-full-controls">
        <button
          className="mobile-player-btn-lg"
          onClick={onPrevious}
          disabled={!hasPrevious}
        >
          ⏮
        </button>
        <button className="mobile-player-btn-xl" onClick={onPlayPause}>
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          className="mobile-player-btn-lg"
          onClick={onNext}
          disabled={!hasNext}
        >
          ⏭
        </button>
      </div>

      {track.bpm && (
        <div className="mobile-player-meta">
          <span>{Math.round(track.bpm)} BPM</span>
          {track.musical_key && <span>{track.musical_key}</span>}
          {track.genre && <span>{track.genre}</span>}
        </div>
      )}
    </div>
  );
}
