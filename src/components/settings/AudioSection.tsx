import { useSettingsContext } from './SettingsContext'
import { ToggleSwitch } from './ToggleSwitch'

export function AudioSection() {
  const {
    crossfadeEnabled, crossfadeDuration,
    handleCrossfadeEnabledChange, handleCrossfadeDurationChange,
  } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Audio</h2>

      <div className="sv-setting-row">
        <div className="sv-setting-row__info">
          <span className="sv-setting-row__label">Enable beatmatch crossfade</span>
          <span className="sv-setting-row__description">
            Automatically crossfade between tracks with tempo matching
          </span>
        </div>
        <ToggleSwitch checked={crossfadeEnabled} onChange={handleCrossfadeEnabledChange} />
      </div>

      {crossfadeEnabled && (
        <div className="sv-setting-row">
          <div className="sv-setting-row__info">
            <label htmlFor="crossfade-duration" className="sv-setting-row__label">
              Crossfade duration
            </label>
            <span className="sv-setting-row__description">1-30 seconds</span>
          </div>
          <div className="settings-input-group">
            <input
              id="crossfade-duration"
              type="number"
              min="1"
              max="30"
              value={crossfadeDuration}
              onChange={(e) => handleCrossfadeDurationChange(parseInt(e.target.value, 10) || 8)}
              className="settings-number-input"
            />
            <span className="settings-input-hint">sec</span>
          </div>
        </div>
      )}
    </section>
  )
}
