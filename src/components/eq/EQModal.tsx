import { useEffect, useRef, useState } from 'react'
import './EQModal.css'
import { EQ_BANDS } from '../../lib/eqConstants'
import {
  detectPreset,
  EQ_PRESETS,
  EQ_PRESET_NAMES,
  type EqPresetName,
} from '../../lib/eqPresets'
import { audioPlayer } from '../../lib/audioPlayer'
import { tauriApi } from '../../lib/tauri-api'

interface EQModalProps {
  open: boolean
  onClose: () => void
  onEnabledChange: (enabled: boolean) => void
}

export function EQModal({ open, onClose, onEnabledChange }: EQModalProps) {
  const [enabled, setEnabled] = useState(false)
  const [bands, setBands] = useState<number[]>(new Array(EQ_BANDS.length).fill(0))
  const [activePreset, setActivePreset] = useState<EqPresetName | 'custom'>('flat')

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load EQ state when modal opens
  useEffect(() => {
    if (!open) return
    const state = audioPlayer.getEqState()
    setEnabled(state.enabled)
    setBands(state.bands)
    setActivePreset(detectPreset(state.bands))
  }, [open])

  // Keyboard close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [])

  if (!open) return null

  function schedulePersist(
    nextEnabled: boolean,
    nextBands: number[],
    nextPreset: EqPresetName | 'custom'
  ) {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      tauriApi
        .setSetting(
          'eq_state',
          JSON.stringify({ enabled: nextEnabled, bands: nextBands, preset: nextPreset })
        )
        .catch(() => {
          // Non-critical — ignore persistence errors silently
        })
    }, 300)
  }

  function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const newEnabled = e.target.checked
    audioPlayer.setEqEnabled(newEnabled)
    setEnabled(newEnabled)
    onEnabledChange(newEnabled)
    schedulePersist(newEnabled, bands, activePreset)
  }

  function handleBandChange(index: number, rawValue: string) {
    const dB = parseFloat(rawValue)
    audioPlayer.setEqBandGain(index, dB)
    const nextBands = bands.map((b, i) => (i === index ? dB : b))
    const nextPreset = detectPreset(nextBands)
    setBands(nextBands)
    setActivePreset(nextPreset)
    schedulePersist(enabled, nextBands, nextPreset)
  }

  function handlePresetChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as EqPresetName | 'custom'
    if (value === 'custom') return
    const preset = EQ_PRESETS[value]
    audioPlayer.setAllBands(preset.gains)
    setBands(preset.gains)
    setActivePreset(value)
    schedulePersist(enabled, preset.gains, value)
  }

  function formatDb(dB: number): string {
    if (dB === 0) return '0'
    return dB > 0 ? `+${dB.toFixed(1)}` : dB.toFixed(1)
  }

  function sliderBackground(dB: number): string {
    // Center (0 dB) is at 50%. Range is -12 to +12 = 24 dB span.
    const pct = ((dB + 12) / 24) * 100
    const center = 50
    const low = Math.min(pct, center)
    const high = Math.max(pct, center)
    return `linear-gradient(to top, var(--border) 0%, var(--border) ${low}%, var(--accent) ${low}%, var(--accent) ${high}%, var(--border) ${high}%, var(--border) 100%)`
  }

  return (
    <div
      className="eq-modal__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="eq-modal__container" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="eq-modal__header">
          <span className="eq-modal__title">Equalizer</span>
          <button className="eq-modal__close-btn" onClick={onClose} aria-label="Close EQ">
            &#x2715;
          </button>
        </div>

        {/* Controls row: toggle + preset dropdown */}
        <div className="eq-modal__controls">
          <label className="eq-modal__toggle-label">
            <input
              type="checkbox"
              className="eq-modal__toggle-input"
              checked={enabled}
              onChange={handleToggle}
            />
            <span className="eq-modal__toggle-switch" />
            <span className="eq-modal__toggle-text">EQ {enabled ? 'On' : 'Off'}</span>
          </label>

          <select
            className="eq-modal__preset-select"
            value={activePreset}
            onChange={handlePresetChange}
          >
            {EQ_PRESET_NAMES.map((name) => (
              <option key={name} value={name}>
                {EQ_PRESETS[name].label}
              </option>
            ))}
            {activePreset === 'custom' && (
              <option value="custom">Custom</option>
            )}
          </select>
        </div>

        {/* Sliders grid */}
        <div className="eq-modal__sliders">
          {EQ_BANDS.map((band, i) => (
            <div key={band.freq} className="eq-modal__band-col">
              <span className="eq-modal__db-label">{formatDb(bands[i])}</span>
              <input
                type="range"
                className="eq-modal__slider"
                min={-12}
                max={12}
                step={0.1}
                value={bands[i]}
                style={{ background: sliderBackground(bands[i]) }}
                onChange={(e) => handleBandChange(i, e.target.value)}
              />
              <span className="eq-modal__freq-label">{band.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
