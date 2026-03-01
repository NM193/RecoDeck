// MixPrepPanel: Full-screen modal for mix preparation analysis.
// Provides three sections:
//   1. Energy Arc (MIXP-02) -- SVG bar chart using BPM as energy proxy
//   2. Transition Issues (MIXP-03) -- adjacent track BPM/key compatibility
//   3. AI Suggested Order (MIXP-01) -- AI-optimized playlist ordering with Apply button
//
// loudness_lufs not implemented -- BPM used as energy proxy for Phase 4

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import type { Track } from '../../types/track'
import type { RecommendedOrder } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { getKeyCompatibility, getBpmIssue } from '../../lib/musicUtils'
import './MixPrepPanel.css'

interface MixPrepPanelProps {
  playlistId: number
  playlistName: string
  onClose: () => void
  onPlaylistReordered: () => void
}

// --- Energy Arc Component ---
// Renders an inline SVG bar chart. Bar height = BPM normalized to playlist range.
// Color: green (low BPM) to red (high BPM) using HSL hue 120→0.
// Tracks with no BPM show minimum-height (4px) gray bars.
function EnergyArc({ tracks }: { tracks: Track[] }) {
  const bpms = tracks.map((t) => t.bpm ?? 0)
  const validBpms = bpms.filter((b) => b > 0)
  const min = validBpms.length > 0 ? Math.min(...validBpms) : 0
  const max = validBpms.length > 0 ? Math.max(...validBpms) : 1
  const range = max - min || 1

  const BAR_WIDTH = 24
  const BAR_GAP = 4
  const MAX_HEIGHT = 80
  const LABEL_HEIGHT = 40
  const svgWidth = Math.max(tracks.length * (BAR_WIDTH + BAR_GAP), 100)

  return (
    <svg
      width={svgWidth}
      height={MAX_HEIGHT + LABEL_HEIGHT}
      role="img"
      aria-label="Energy arc visualization -- bar height represents BPM"
      className="mix-prep-energy-arc"
    >
      {tracks.map((track, i) => {
        const bpm = track.bpm ?? 0
        // Minimum bar height of 4px for tracks without BPM data
        const height =
          bpm > 0 ? Math.max(4, ((bpm - min) / range) * MAX_HEIGHT) : 4
        const y = MAX_HEIGHT - height
        // Color: green (low energy, hue 120) to red (high energy, hue 0)
        const hue = bpm > 0 ? Math.round((1 - (bpm - min) / range) * 120) : 0
        const x = i * (BAR_WIDTH + BAR_GAP)
        return (
          <g key={track.id ?? i}>
            <rect
              x={x}
              y={y}
              width={BAR_WIDTH}
              height={height}
              fill={bpm > 0 ? `hsl(${hue}, 70%, 50%)` : '#555'}
              rx={3}
            />
            <title>
              {track.title || 'Unknown'}:{' '}
              {bpm > 0 ? `${Math.round(bpm)} BPM` : 'No BPM data'}
            </title>
            {/* Track number label */}
            <text
              x={x + BAR_WIDTH / 2}
              y={MAX_HEIGHT + 16}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="10"
            >
              {i + 1}
            </text>
            {/* BPM label if track has data */}
            {bpm > 0 && (
              <text
                x={x + BAR_WIDTH / 2}
                y={MAX_HEIGHT + 28}
                textAnchor="middle"
                fill="rgba(255,255,255,0.3)"
                fontSize="8"
              >
                {Math.round(bpm)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// --- Main Panel ---
export function MixPrepPanel({
  playlistId,
  playlistName,
  onClose,
  onPlaylistReordered,
}: MixPrepPanelProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loadingTracks, setLoadingTracks] = useState(true)
  const [tracksError, setTracksError] = useState<string | null>(null)

  // AI suggested order state
  const [suggestedOrder, setSuggestedOrder] = useState<RecommendedOrder | null>(
    null,
  )
  const [isGeneratingOrder, setIsGeneratingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Load playlist tracks on mount
  useEffect(() => {
    async function load() {
      try {
        setLoadingTracks(true)
        const result = await tauriApi.getPlaylistTracks(playlistId)
        setTracks(result)
      } catch (err) {
        setTracksError(getErrorMessage(err))
      } finally {
        setLoadingTracks(false)
      }
    }
    load()
  }, [playlistId])

  // Computed values from tracks
  const analyzedCount = tracks.filter((t) => t.bpm != null && t.bpm > 0).length
  const totalCount = tracks.length
  const showBpmWarning = totalCount > 0 && analyzedCount < totalCount * 0.5

  // --- Section 2: Transition Issues ---
  // Only pairs with at least one issue are shown.
  const transitionIssues = tracks
    .slice(0, -1)
    .map((trackA, i) => {
      const trackB = tracks[i + 1]
      const bpmIssue = getBpmIssue(trackA.bpm, trackB.bpm)
      const keyCompat = getKeyCompatibility(
        trackA.musical_key,
        trackB.musical_key,
      )
      return { trackA, trackB, bpmIssue, keyCompat }
    })
    .filter(
      ({ bpmIssue, keyCompat }) => bpmIssue === 'bad' || keyCompat === 'clash',
    )

  // --- Section 3: AI Suggested Order ---
  const handleGetSuggestedOrder = useCallback(async () => {
    setIsGeneratingOrder(true)
    setOrderError(null)
    setSuggestedOrder(null)
    try {
      const result = await tauriApi.aiOptimizePlaylistOrder(playlistId)
      setSuggestedOrder(result)
    } catch (err) {
      setOrderError(getErrorMessage(err))
    } finally {
      setIsGeneratingOrder(false)
    }
  }, [playlistId])

  const handleApplyOrder = useCallback(async () => {
    if (!suggestedOrder) return
    setIsApplying(true)
    try {
      await tauriApi.reorderPlaylistTracks(playlistId, suggestedOrder.track_ids)
      onPlaylistReordered()
    } catch (err) {
      setOrderError(getErrorMessage(err))
      setIsApplying(false)
    }
  }, [suggestedOrder, playlistId, onPlaylistReordered])

  // Resolve suggested order track IDs to full Track objects
  const suggestedTracks: Track[] = suggestedOrder
    ? suggestedOrder.track_ids.flatMap((id) => {
        const found = tracks.find((t) => t.id === id)
        return found ? [found] : []
      })
    : []

  // Helper: BPM badge class
  function bpmBadgeClass(issue: 'ok' | 'warn' | 'bad') {
    if (issue === 'ok') return 'mix-prep-badge mix-prep-badge--ok'
    if (issue === 'warn') return 'mix-prep-badge mix-prep-badge--warn'
    return 'mix-prep-badge mix-prep-badge--bad'
  }

  // Helper: key badge class
  function keyBadgeClass(compat: 'perfect' | 'compatible' | 'clash') {
    if (compat === 'perfect') return 'mix-prep-badge mix-prep-badge--ok'
    if (compat === 'compatible') return 'mix-prep-badge mix-prep-badge--warn'
    return 'mix-prep-badge mix-prep-badge--bad'
  }

  return (
    <AnimatePresence>
      <motion.div
        className="mix-prep-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          className="mix-prep-panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="mix-prep-header">
            <div className="mix-prep-header__icon">
              <Icon name="AudioWaveform" size={18} />
            </div>
            <div className="mix-prep-header__title">
              Mix Prep
              <span className="mix-prep-header__subtitle">
                {' '}
                — {playlistName}
              </span>
            </div>
            <button
              className="mix-prep-header__close"
              onClick={onClose}
              aria-label="Close mix prep panel"
            >
              <Icon name="X" size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="mix-prep-body">
            {loadingTracks ? (
              <div className="mix-prep-empty">
                <span className="mix-prep-spinner">
                  <Icon name="Loader" size={18} />
                </span>{' '}
                Loading tracks...
              </div>
            ) : tracksError ? (
              <div className="mix-prep-error">{tracksError}</div>
            ) : tracks.length === 0 ? (
              <div className="mix-prep-empty">
                This playlist is empty. Add some tracks first.
              </div>
            ) : (
              <>
                {/* Section 1: Energy Arc */}
                <div className="mix-prep-section">
                  <h3 className="mix-prep-section__title">
                    <span className="mix-prep-section__title-icon">
                      <Icon name="Activity" size={12} />
                    </span>
                    Energy Arc
                  </h3>

                  {showBpmWarning && (
                    <div className="mix-prep-warning">
                      <Icon name="TriangleAlert" size={14} />
                      Only {analyzedCount} of {totalCount} tracks have BPM data.
                      Analyze more tracks for an accurate energy arc.
                    </div>
                  )}

                  <div className="mix-prep-energy-arc-container">
                    <EnergyArc tracks={tracks} />
                  </div>
                </div>

                <div className="mix-prep-divider" />

                {/* Section 2: Transition Issues */}
                <div className="mix-prep-section">
                  <h3 className="mix-prep-section__title">
                    <span className="mix-prep-section__title-icon">
                      <Icon name="ArrowLeftRight" size={12} />
                    </span>
                    Transition Issues
                  </h3>

                  {transitionIssues.length === 0 ? (
                    <div className="mix-prep-success">
                      <Icon name="CircleCheck" size={16} />
                      No transition issues detected — all adjacent pairs have
                      compatible BPM and keys.
                    </div>
                  ) : (
                    <div className="mix-prep-transitions">
                      {transitionIssues.map(
                        ({ trackA, trackB, bpmIssue, keyCompat }, i) => {
                          const bpmDelta =
                            trackA.bpm != null && trackB.bpm != null
                              ? Math.abs(trackA.bpm - trackB.bpm).toFixed(0)
                              : null
                          return (
                            <div
                              key={i}
                              className="mix-prep-transition-row mix-prep-transition-row--issue"
                            >
                              <div className="mix-prep-transition__track">
                                {trackA.title || trackA.artist || 'Unknown'}
                              </div>
                              <span className="mix-prep-transition__arrow">
                                <Icon name="ArrowRight" size={12} />
                              </span>
                              <div className="mix-prep-transition__track">
                                {trackB.title || trackB.artist || 'Unknown'}
                              </div>
                              <div className="mix-prep-transition-badges">
                                {bpmDelta && (
                                  <span className={bpmBadgeClass(bpmIssue)}>
                                    {bpmDelta} BPM
                                  </span>
                                )}
                                {(!trackA.bpm || !trackB.bpm) && (
                                  <span className="mix-prep-badge mix-prep-badge--bad">
                                    No BPM
                                  </span>
                                )}
                                <span className={keyBadgeClass(keyCompat)}>
                                  {keyCompat === 'perfect'
                                    ? 'Perfect key'
                                    : keyCompat === 'compatible'
                                      ? 'Compat. key'
                                      : 'Key clash'}
                                </span>
                              </div>
                            </div>
                          )
                        },
                      )}
                    </div>
                  )}
                </div>

                <div className="mix-prep-divider" />

                {/* Section 3: AI Suggested Order */}
                <div className="mix-prep-section">
                  <h3 className="mix-prep-section__title">
                    <span className="mix-prep-section__title-icon">
                      <Icon name="Sparkles" size={12} />
                    </span>
                    AI Suggested Order
                  </h3>

                  <div className="mix-prep-suggested">
                    {!suggestedOrder && !isGeneratingOrder && (
                      <button
                        className="mix-prep-suggested__generate-btn"
                        onClick={handleGetSuggestedOrder}
                        disabled={tracks.length < 2}
                      >
                        <Icon name="Wand" size={16} />
                        Get AI Suggested Order
                      </button>
                    )}

                    {isGeneratingOrder && (
                      <div className="mix-prep-suggested__generating">
                        <span className="mix-prep-spinner">
                          <Icon name="Loader" size={16} />
                        </span>
                        Analyzing playlist for optimal mix order...
                      </div>
                    )}

                    {orderError && (
                      <div className="mix-prep-error">
                        {orderError}
                        {orderError.includes('Settings') && (
                          <button
                            type="button"
                            onClick={() =>
                              useAIStore.getState().openSettingsCallback?.()
                            }
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              fontSize: '0.85em',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              border: '1px solid currentColor',
                              background: 'transparent',
                              color: 'inherit',
                            }}
                          >
                            Open Settings
                          </button>
                        )}
                      </div>
                    )}

                    {suggestedOrder && suggestedTracks.length > 0 && (
                      <>
                        {suggestedOrder.reasoning && (
                          <div className="mix-prep-suggested__reasoning">
                            <strong>AI Reasoning</strong>
                            {suggestedOrder.reasoning}
                          </div>
                        )}

                        <div className="mix-prep-suggested__track-list">
                          {suggestedTracks.map((track, i) => {
                            const nextTrack = suggestedTracks[i + 1]
                            const bpmIssue = nextTrack
                              ? getBpmIssue(track.bpm, nextTrack.bpm)
                              : null
                            const keyCompat = nextTrack
                              ? getKeyCompatibility(
                                  track.musical_key,
                                  nextTrack.musical_key,
                                )
                              : null
                            return (
                              <div key={track.id ?? i}>
                                <div className="mix-prep-suggested__track-row">
                                  <span className="mix-prep-suggested__position">
                                    {i + 1}.
                                  </span>
                                  <div className="mix-prep-suggested__track-info">
                                    <div className="mix-prep-suggested__track-title">
                                      {track.title || 'Unknown'}
                                    </div>
                                    <div className="mix-prep-suggested__track-meta">
                                      {track.artist || ''}
                                      {track.bpm
                                        ? ` · ${Math.round(track.bpm)} BPM`
                                        : ''}
                                      {track.musical_key
                                        ? ` · ${track.musical_key}`
                                        : ''}
                                    </div>
                                  </div>
                                  {bpmIssue && keyCompat && (
                                    <div className="mix-prep-transition-badges">
                                      <span className={bpmBadgeClass(bpmIssue)}>
                                        {track.bpm && nextTrack.bpm
                                          ? `${Math.abs(track.bpm - nextTrack.bpm).toFixed(0)}`
                                          : '?'}{' '}
                                        BPM
                                      </span>
                                      <span
                                        className={keyBadgeClass(keyCompat)}
                                      >
                                        {keyCompat === 'perfect'
                                          ? 'Key'
                                          : keyCompat === 'compatible'
                                            ? 'Compat.'
                                            : 'Clash'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        <div className="mix-prep-suggested__actions">
                          <button
                            className="mix-prep-btn-primary"
                            onClick={handleApplyOrder}
                            disabled={isApplying}
                          >
                            {isApplying ? (
                              <>
                                <span className="mix-prep-spinner">
                                  <Icon name="Loader" size={14} />
                                </span>
                                Applying...
                              </>
                            ) : (
                              <>
                                <Icon name="Check" size={14} />
                                Apply Order
                              </>
                            )}
                          </button>
                          <button
                            className="mix-prep-btn-secondary"
                            onClick={handleGetSuggestedOrder}
                            disabled={isGeneratingOrder || isApplying}
                          >
                            <Icon name="RefreshCw" size={14} />
                            Re-analyze
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
