// AIPlaylistDialog: two-step modal for AI playlist generation from a seed track
// Step 1: config (seed info, energy direction, duration)
// Step 2: results (track list with transition indicators, remove, regenerate, save)

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../Icon';
import { tauriApi } from '../../lib/tauri-api';
import { audioPlayer } from '../../lib/audioPlayer';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../types/track';
import type { EnergyDirection, GeneratedPlaylist } from '../../types/ai';
import { getErrorMessage } from '../../types/ai';
import { useAIStore } from '../../store/aiStore';
import { getKeyCompatibility } from '../../lib/musicUtils';
import './AIPlaylistDialog.css';

interface AIPlaylistDialogProps {
  seedTrack: Track;
  onClose: () => void;
  onPlaylistSaved: (playlistId: number) => void;
}

type DialogStep = 'config' | 'generating' | 'results' | 'saving';

function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60000)} min`;
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

interface TransitionIndicatorProps {
  trackA: Track;
  trackB: Track;
}

function TransitionIndicator({ trackA, trackB }: TransitionIndicatorProps) {
  const bpmDelta =
    trackA.bpm != null && trackB.bpm != null
      ? Math.abs(trackA.bpm - trackB.bpm)
      : null;
  const keyCompat = getKeyCompatibility(trackA.musical_key, trackB.musical_key);

  const bpmClass =
    bpmDelta == null
      ? 'ai-playlist-transition__bpm--red'
      : bpmDelta <= 5
        ? 'ai-playlist-transition__bpm--green'
        : bpmDelta <= 10
          ? 'ai-playlist-transition__bpm--yellow'
          : 'ai-playlist-transition__bpm--red';

  const keyClass =
    keyCompat === 'perfect'
      ? 'ai-playlist-transition__key--perfect'
      : keyCompat === 'compatible'
        ? 'ai-playlist-transition__key--compatible'
        : 'ai-playlist-transition__key--clash';

  return (
    <div className="ai-playlist-transition">
      <span className={`ai-playlist-transition__bpm ${bpmClass}`}>
        {bpmDelta != null ? `±${bpmDelta} BPM` : 'BPM ?'}
      </span>
      <span className={`ai-playlist-transition__key ${keyClass}`}>
        {keyCompat === 'perfect' ? 'Same key' : keyCompat === 'compatible' ? 'Compatible' : 'Clash'}
      </span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export function AIPlaylistDialog({ seedTrack, onClose, onPlaylistSaved }: AIPlaylistDialogProps) {
  const [step, setStep] = useState<DialogStep>('config');
  const [energyDirection, setEnergyDirection] = useState<EnergyDirection>('maintain');
  const [targetDurationMin, setTargetDurationMin] = useState(60);
  const [result, setResult] = useState<GeneratedPlaylist | null>(null);
  const [resultTracks, setResultTracks] = useState<Track[]>([]);
  const [removedTrackIds, setRemovedTrackIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Escape key closes dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // --------------------------------------------------------------------------
  // Generate flow
  // --------------------------------------------------------------------------
  const generate = useCallback(async () => {
    setStep('generating');
    setError(null);
    setRemovedTrackIds(new Set());

    try {
      const generated = await tauriApi.aiGeneratePlaylistFromSeed(
        seedTrack.id,
        energyDirection,
        targetDurationMin,
      );

      // Fetch full Track objects (filter out null — hallucinated IDs)
      const trackResults = await Promise.all(
        generated.track_ids.map((id) => tauriApi.getTrack(id).catch(() => null)),
      );
      const tracks = trackResults.filter((t): t is Track => t !== null);

      setResult(generated);
      setResultTracks(tracks);
      setPlaylistName(generated.name);
      setStep('results');
    } catch (e) {
      setError(getErrorMessage(e));
      setStep('config');
    }
  }, [seedTrack.id, energyDirection, targetDurationMin]);

  // --------------------------------------------------------------------------
  // Play track row
  // --------------------------------------------------------------------------
  const handlePlayTrack = useCallback(async (track: Track) => {
    if (!track.file_path) return;
    try {
      usePlayerStore.getState().setCurrentTrack(track);
      await audioPlayer.loadTrack(track.file_path, track.id);
      await audioPlayer.play();
    } catch (e) {
      console.error('[AIPlaylistDialog] Play error:', e);
    }
  }, []);

  // --------------------------------------------------------------------------
  // Remove track
  // --------------------------------------------------------------------------
  const handleRemoveTrack = useCallback((trackId: number) => {
    setRemovedTrackIds((prev) => {
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  // --------------------------------------------------------------------------
  // Save flow
  // --------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!result || !playlistName.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const playlist = await tauriApi.createPlaylist(playlistName.trim(), null);
      const activeTrackIds = result.track_ids.filter((id) => !removedTrackIds.has(id));
      for (const trackId of activeTrackIds) {
        await tauriApi.addTrackToPlaylist(playlist.id!, trackId);
      }
      onPlaylistSaved(playlist.id!);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
      setIsSaving(false);
    }
  }, [result, playlistName, removedTrackIds, onPlaylistSaved, onClose]);

  // --------------------------------------------------------------------------
  // Derived state
  // --------------------------------------------------------------------------
  const activeTracks = resultTracks.filter((t) => !removedTrackIds.has(t.id));
  const totalDurationMs = activeTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const targetDurationMs = targetDurationMin * 60 * 1000;
  const isDurationShort = totalDurationMs > 0 && totalDurationMs < targetDurationMs * 0.75;

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------
  const energyOptions: { value: EnergyDirection; label: string }[] = [
    { value: 'build_up', label: 'Build Up' },
    { value: 'maintain', label: 'Maintain' },
    { value: 'wind_down', label: 'Wind Down' },
  ];

  const durationOptions = [30, 60, 90, 120];

  return (
    <AnimatePresence>
      <motion.div
        className="ai-playlist-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          className="ai-playlist-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ai-playlist-header">
            <span className="ai-playlist-header__icon">
              <Icon name="Sparkles" size={18} />
            </span>
            <span className="ai-playlist-header__title">Generate AI Playlist</span>
            <button
              type="button"
              className="ai-playlist-header__close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <Icon name="X" size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="ai-playlist-body">
            {/* ----------------------------------------------------------------
                Step: config
            ---------------------------------------------------------------- */}
            {step === 'config' && (
              <div className="ai-playlist-config">
                {/* Seed track info */}
                <div className="ai-playlist-seed-info">
                  <div className="ai-playlist-seed-info__label">Seed Track</div>
                  <div className="ai-playlist-seed-info__title">
                    {seedTrack.title || 'Unknown Title'}
                  </div>
                  <div className="ai-playlist-seed-info__artist">
                    {seedTrack.artist || 'Unknown Artist'}
                  </div>
                  <div className="ai-playlist-seed-info__meta">
                    {seedTrack.bpm != null && (
                      <span className="ai-playlist-seed-info__badge">
                        {Math.round(seedTrack.bpm)} BPM
                      </span>
                    )}
                    {seedTrack.musical_key && (
                      <span className="ai-playlist-seed-info__badge">
                        {seedTrack.musical_key}
                      </span>
                    )}
                  </div>
                </div>

                {/* Energy direction */}
                <div>
                  <div className="ai-playlist-control-label">Energy Direction</div>
                  <div
                    className="ai-playlist-segmented"
                    role="radiogroup"
                    aria-label="Energy direction"
                  >
                    {energyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={energyDirection === opt.value}
                        className={`ai-playlist-segmented__option${energyDirection === opt.value ? ' ai-playlist-segmented__option--active' : ''}`}
                        onClick={() => setEnergyDirection(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration presets */}
                <div>
                  <div className="ai-playlist-control-label">Target Duration</div>
                  <div className="ai-playlist-duration-presets">
                    {durationOptions.map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`ai-playlist-duration-btn${targetDurationMin === min ? ' ai-playlist-duration-btn--active' : ''}`}
                        onClick={() => setTargetDurationMin(min)}
                      >
                        {min < 60 ? `${min} min` : `${min / 60} hr`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="ai-playlist-error">
                    {error}
                    {error.includes('Settings') && (
                      <button
                        type="button"
                        className="ai-playlist-error__settings-btn"
                        onClick={() => useAIStore.getState().openSettingsCallback?.()}
                        style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '0.85em', cursor: 'pointer', borderRadius: '4px', border: '1px solid currentColor', background: 'transparent', color: 'inherit' }}
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------------------
                Step: generating
            ---------------------------------------------------------------- */}
            {step === 'generating' && (
              <div className="ai-playlist-generating">
                <div className="ai-playlist-generating__spinner" role="status" />
                <div className="ai-playlist-generating__text">
                  Curating your playlist...
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------
                Step: results
            ---------------------------------------------------------------- */}
            {step === 'results' && result && (
              <div className="ai-playlist-results">
                {/* AI Reasoning (collapsible) */}
                <details
                  className="ai-playlist-reasoning"
                  open={showReasoning}
                  onToggle={(e) => setShowReasoning((e.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary className="ai-playlist-reasoning__summary">
                    AI Reasoning {showReasoning ? '▲' : '▼'}
                  </summary>
                  <div className="ai-playlist-reasoning__content">{result.reasoning}</div>
                </details>

                {/* Duration info + warning */}
                <div className="ai-playlist-duration-info">
                  Total: ~{formatMinutes(totalDurationMs)} of {targetDurationMin} min requested
                  ({activeTracks.length} tracks)
                </div>
                {isDurationShort && (
                  <div className="ai-playlist-warning">
                    <Icon name="TriangleAlert" size={14} />
                    Playlist is shorter than 75% of the requested duration. The AI may have found
                    fewer matching tracks.
                  </div>
                )}

                {/* Energy direction control (available in results for regeneration) */}
                <div className="ai-playlist-results-energy">
                  <div className="ai-playlist-control-label">Energy Direction (for regenerate)</div>
                  <div
                    className="ai-playlist-segmented"
                    role="radiogroup"
                    aria-label="Energy direction"
                  >
                    {energyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={energyDirection === opt.value}
                        className={`ai-playlist-segmented__option${energyDirection === opt.value ? ' ai-playlist-segmented__option--active' : ''}`}
                        onClick={() => setEnergyDirection(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Track list */}
                {activeTracks.length === 0 ? (
                  <div className="ai-playlist-empty">
                    All tracks removed. Click Regenerate to get new suggestions.
                  </div>
                ) : (
                  <div className="ai-playlist-track-list">
                    {activeTracks.map((track, idx) => (
                      <div key={track.id}>
                        {/* Track row */}
                        <div className="ai-playlist-track-row">
                          {/* Play button */}
                          <button
                            type="button"
                            className="ai-playlist-track-play"
                            onClick={() => handlePlayTrack(track)}
                            disabled={!track.file_path}
                            title={track.file_path ? 'Preview track' : 'No file path available'}
                          >
                            <Icon name="Play" size={14} />
                          </button>

                          {/* Track info */}
                          <div className="ai-playlist-track-info">
                            <div className="ai-playlist-track-title">
                              {track.title || 'Unknown Title'}
                            </div>
                            <div className="ai-playlist-track-artist">
                              {track.artist || 'Unknown Artist'}
                            </div>
                          </div>

                          {/* BPM + Key badges */}
                          <div className="ai-playlist-track-badges">
                            <span className="ai-playlist-track-badge">
                              {track.bpm != null ? `${Math.round(track.bpm)} BPM` : '--'}
                            </span>
                            <span className="ai-playlist-track-badge">
                              {track.musical_key ?? '--'}
                            </span>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            className="ai-playlist-track-remove"
                            onClick={() => handleRemoveTrack(track.id)}
                            title="Remove from playlist"
                          >
                            <Icon name="X" size={14} />
                          </button>
                        </div>

                        {/* Transition indicator between adjacent tracks */}
                        {idx < activeTracks.length - 1 && (
                          <TransitionIndicator
                            trackA={track}
                            trackB={activeTracks[idx + 1]}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="ai-playlist-error">
                    {error}
                    {error.includes('Settings') && (
                      <button
                        type="button"
                        className="ai-playlist-error__settings-btn"
                        onClick={() => useAIStore.getState().openSettingsCallback?.()}
                        style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '0.85em', cursor: 'pointer', borderRadius: '4px', border: '1px solid currentColor', background: 'transparent', color: 'inherit' }}
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------------------
                Step: saving — name input
            ---------------------------------------------------------------- */}
            {step === 'saving' && (
              <div className="ai-playlist-save">
                <div className="ai-playlist-save__label">
                  Enter a name for your new playlist:
                </div>
                <input
                  type="text"
                  className="ai-playlist-save-input"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') setStep('results');
                  }}
                  placeholder="Playlist name..."
                  autoFocus
                />
                {error && (
                  <div className="ai-playlist-error">
                    {error}
                    {error.includes('Settings') && (
                      <button
                        type="button"
                        className="ai-playlist-error__settings-btn"
                        onClick={() => useAIStore.getState().openSettingsCallback?.()}
                        style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '0.85em', cursor: 'pointer', borderRadius: '4px', border: '1px solid currentColor', background: 'transparent', color: 'inherit' }}
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="ai-playlist-actions">
            {step === 'config' && (
              <>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--primary"
                  onClick={generate}
                >
                  Generate
                </button>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </>
            )}

            {step === 'generating' && (
              <button
                type="button"
                className="ai-playlist-actions__btn ai-playlist-actions__btn--ghost"
                onClick={onClose}
              >
                Cancel
              </button>
            )}

            {step === 'results' && (
              <>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--primary"
                  onClick={() => setStep('saving')}
                  disabled={activeTracks.length === 0}
                >
                  Save Playlist
                </button>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--secondary"
                  onClick={generate}
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </>
            )}

            {step === 'saving' && (
              <>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--primary"
                  onClick={handleSave}
                  disabled={isSaving || !playlistName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="ai-playlist-actions__btn ai-playlist-actions__btn--ghost"
                  onClick={() => setStep('results')}
                  disabled={isSaving}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
