// RecommendationsPanel: slide-in right drawer for AI track recommendations.
// Supports two modes:
//   - seedTrack: find similar tracks (DISC-01)
//   - playlistId: find tracks that complement an existing playlist (DISC-02)

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../Icon';
import { tauriApi } from '../../lib/tauri-api';
import { audioPlayer } from '../../lib/audioPlayer';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../types/track';
import type { RecommendationResult } from '../../types/ai';
import { getErrorMessage } from '../../types/ai';
import './RecommendationsPanel.css';

interface RecommendationsPanelProps {
  seedTrack?: Track;       // For DISC-01 (by track)
  playlistId?: number;     // For DISC-02 (by playlist)
  playlistName?: string;   // Display name for playlist mode
  onClose: () => void;
}

type PanelStep = 'generating' | 'results' | 'error';

export function RecommendationsPanel({
  seedTrack,
  playlistId,
  playlistName,
  onClose,
}: RecommendationsPanelProps) {
  const [step, setStep] = useState<PanelStep>('generating');
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [resultTracks, setResultTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch recommendations on mount
  const fetchRecommendations = useCallback(async () => {
    setStep('generating');
    setError(null);

    try {
      let recommendation: RecommendationResult;

      if (seedTrack?.id) {
        recommendation = await tauriApi.aiRecommendSimilar(seedTrack.id, 10);
      } else if (playlistId != null) {
        recommendation = await tauriApi.aiRecommendForPlaylist(playlistId, 10);
      } else {
        setError('No seed track or playlist provided');
        setStep('error');
        return;
      }

      // Fetch full Track objects for returned IDs (filter nulls for hallucinated IDs)
      const trackResults = await Promise.all(
        recommendation.track_ids.map((id) => tauriApi.getTrack(id).catch(() => null)),
      );
      const tracks = trackResults.filter((t): t is Track => t !== null);

      setResult(recommendation);
      setResultTracks(tracks);
      setStep('results');
    } catch (e) {
      setError(getErrorMessage(e));
      setStep('error');
    }
  }, [seedTrack, playlistId]);

  useEffect(() => {
    fetchRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play a track from the results list
  const handlePlayTrack = useCallback(async (track: Track) => {
    if (!track.file_path) return;
    try {
      usePlayerStore.getState().setCurrentTrack(track);
      await audioPlayer.loadTrack(track.file_path, track.id);
      await audioPlayer.play();
    } catch (e) {
      console.error('[RecommendationsPanel] Play error:', e);
    }
  }, []);

  // Add track to currently selected playlist (if available)
  const handleAddTrack = useCallback(async (track: Track) => {
    if (playlistId == null) return;
    try {
      await tauriApi.addTrackToPlaylist(playlistId, track.id);
    } catch (e) {
      console.error('[RecommendationsPanel] Add to playlist error:', e);
    }
  }, [playlistId]);

  // Derive header subtitle
  const seedLabel = seedTrack
    ? `Similar to: ${seedTrack.title || 'Unknown'}`
    : playlistName
      ? `For playlist: ${playlistName}`
      : 'Playlist recommendations';

  return (
    <AnimatePresence>
      <motion.div
        className="recommendations-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="recommendations-panel__header">
          <span className="recommendations-panel__header-icon">
            <Icon name="Compass" size={16} />
          </span>
          <span className="recommendations-panel__header-title">
            AI Recommendations
          </span>
          <button
            type="button"
            className="recommendations-panel__header-close"
            onClick={onClose}
            aria-label="Close recommendations panel"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Seed info */}
        <div className="recommendations-panel__seed-info">
          <div className="recommendations-panel__seed-label">
            {seedTrack ? 'Seed Track' : 'Playlist'}
          </div>
          <div className="recommendations-panel__seed-name">{seedLabel}</div>
        </div>

        {/* Body */}
        <div className="recommendations-panel__body">
          {/* Generating state */}
          {step === 'generating' && (
            <div className="recommendations-panel__generating">
              <div className="recommendations-panel__spinner" role="status" />
              <div className="recommendations-panel__generating-text">
                Finding similar tracks in your library...
              </div>
            </div>
          )}

          {/* Error state */}
          {step === 'error' && (
            <div className="recommendations-panel__error">
              <span>{error}</span>
              <button
                type="button"
                className="recommendations-panel__retry-btn"
                onClick={fetchRecommendations}
              >
                Retry
              </button>
            </div>
          )}

          {/* Results state */}
          {step === 'results' && result && (
            <>
              {/* Count info */}
              <div className="recommendations-panel__count">
                {resultTracks.length} tracks found
              </div>

              {/* Reasoning (collapsible) */}
              {result.reasoning && (
                <details className="recommendations-panel__reasoning">
                  <summary>AI Reasoning</summary>
                  <div className="recommendations-panel__reasoning-content">
                    {result.reasoning}
                  </div>
                </details>
              )}

              {/* Track list */}
              {resultTracks.length === 0 ? (
                <div className="recommendations-panel__empty">
                  <Icon name="SearchX" size={32} />
                  <span>No matching tracks found in your library.</span>
                  <button
                    type="button"
                    className="recommendations-panel__retry-btn"
                    onClick={fetchRecommendations}
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <div className="recommendations-panel__track-list">
                  {resultTracks.map((track) => (
                    <div key={track.id} className="recommendations-panel__track-row">
                      {/* Play button */}
                      <button
                        type="button"
                        className="recommendations-panel__track-play"
                        onClick={() => handlePlayTrack(track)}
                        disabled={!track.file_path}
                        title={track.file_path ? 'Preview track' : 'No file available'}
                      >
                        <Icon name="Play" size={13} />
                      </button>

                      {/* Track info */}
                      <div className="recommendations-panel__track-info">
                        <div className="recommendations-panel__track-title">
                          {track.title || 'Unknown Title'}
                        </div>
                        <div className="recommendations-panel__track-artist">
                          {track.artist || 'Unknown Artist'}
                        </div>
                      </div>

                      {/* BPM + Key badges */}
                      <div className="recommendations-panel__track-badges">
                        <span className="recommendations-panel__track-badge">
                          {track.bpm != null ? `${Math.round(track.bpm)} BPM` : '--'}
                        </span>
                        <span className="recommendations-panel__track-badge">
                          {track.musical_key ?? '--'}
                        </span>
                      </div>

                      {/* Add to playlist button (only in playlist mode) */}
                      {playlistId != null && (
                        <button
                          type="button"
                          className="recommendations-panel__track-add"
                          onClick={() => handleAddTrack(track)}
                          title="Add to this playlist"
                        >
                          <Icon name="ListPlus" size={14} />
                        </button>
                      )}
                      {/* Spacer when not in playlist mode to keep grid aligned */}
                      {playlistId == null && <span />}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
