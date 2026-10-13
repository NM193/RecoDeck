import { useEffect, useRef, useState } from 'react'
import { audioPlayer } from '../../lib/audioPlayer'
import { MAX_STRETCH, masterRange } from '../../lib/masterBpm'
import { useCurrentMasterRate, useMasterBpmStore } from '../../store/masterBpmStore'
import { usePlayerStore } from '../../store/playerStore'

const PRESETS = [120, 122, 124, 126, 128]
/** Slider range when the track has no BPM to centre it on. */
const FREE_MIN = 80
const FREE_MAX = 160

/**
 * Master BPM button for the player bar: a global tempo every track plays at.
 * Also applies the setting to the audio player whenever it, or the track, changes.
 */
export function MasterBpmControl() {
  const enabled = useMasterBpmStore((s) => s.enabled)
  const bpm = useMasterBpmStore((s) => s.bpm)
  const setEnabled = useMasterBpmStore((s) => s.setEnabled)
  const setBpm = useMasterBpmStore((s) => s.setBpm)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const rate = useCurrentMasterRate()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    audioPlayer.setMasterBpm(enabled ? bpm : null)
    audioPlayer.setBaseRate(rate.rate)
  }, [enabled, bpm, rate.rate])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The master can only go as far from the playing track as it can be stretched.
  const range = masterRange(rate.reading)
  const sliderMin = rate.reading ? range.min : FREE_MIN
  const sliderMax = rate.reading ? range.max : FREE_MAX
  const setInRange = (value: number) =>
    setBpm(Math.min(range.max, Math.max(range.min, value)))

  const commitDraft = () => {
    if (draft !== null) {
      const n = parseFloat(draft.replace(',', '.'))
      if (Number.isFinite(n)) setInRange(n)
    }
    setDraft(null)
  }

  const step = (delta: number) => setInRange(bpm + delta)
  const trackBpm = currentTrack?.bpm ? Math.round(currentTrack.bpm) : null
  const limitPct = Math.round(MAX_STRETCH * 100)
  const tip = enabled ? `Master BPM ${bpm}` : 'Master BPM'

  return (
    <div className="master-bpm" ref={wrapRef}>
      <button
        className={`now-playing-bar__btn now-playing-bar__btn--action master-bpm__btn${enabled ? ' now-playing-bar__btn--toggle now-playing-bar__btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        data-tip={tip}
        aria-label={tip}
        aria-expanded={open}
      >
        <span className="master-bpm__label">{enabled ? Math.round(bpm * 10) / 10 : 'BPM'}</span>
      </button>

      {open && (
        <div className="master-bpm__popup" role="dialog" aria-label="Master BPM">
          <div className="master-bpm__head">
            <span>Master BPM</span>
            <button
              className={`master-bpm__switch${enabled ? ' is-on' : ''}`}
              role="switch"
              aria-checked={enabled}
              aria-label="Master BPM on or off"
              onClick={() => setEnabled(!enabled)}
            />
          </div>

          <div className="master-bpm__row">
            <button className="master-bpm__step" onClick={() => step(-1)} aria-label="Lower by 1 BPM">
              −
            </button>
            <input
              className="master-bpm__input"
              inputMode="decimal"
              value={draft ?? String(bpm)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              aria-label="Master BPM"
            />
            <button className="master-bpm__step" onClick={() => step(1)} aria-label="Raise by 1 BPM">
              +
            </button>
          </div>

          <input
            type="range"
            className="master-bpm__slider"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={Math.min(sliderMax, Math.max(sliderMin, Math.round(bpm)))}
            onChange={(e) => setInRange(Number(e.target.value))}
            aria-label="Master BPM slider"
          />

          {rate.reading && (
            <div className="master-bpm__range">
              <span>{range.min}</span>
              <span>±{limitPct}%</span>
              <span>{range.max}</span>
            </div>
          )}

          <div className="master-bpm__presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`master-bpm__preset${Math.round(bpm) === p ? ' is-active' : ''}`}
                onClick={() => setInRange(p)}
                disabled={p < range.min || p > range.max}
              >
                {p}
              </button>
            ))}
            {trackBpm && (
              <button className="master-bpm__preset" onClick={() => setBpm(trackBpm)}>
                Track: {trackBpm}
              </button>
            )}
          </div>

          <div className="master-bpm__hint">
            {enabled && rate.kind === 'limited'
              ? `This track is far from the master BPM, so it is stretched by the most it can be: ${limitPct}%.`
              : enabled && rate.kind === 'no-bpm'
                ? 'This track has no BPM, so it plays as it is.'
                : 'Every track plays at this tempo. The pitch stays the same.'}
          </div>
        </div>
      )}
    </div>
  )
}
