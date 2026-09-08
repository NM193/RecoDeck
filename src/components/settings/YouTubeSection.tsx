import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

/** "8h 12m" — the reset is at midnight Pacific, roughly 9am here. */
function formatReset(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function YouTubeSection() {
  const {
    ytKeyConfigured, ytKeyInput, setYtKeyInput,
    showYtKey, setShowYtKey, ytSaving, ytTesting, ytQuota, ytTestResult,
    handleSaveYouTubeKey, handleDeleteYouTubeKey, handleTestYouTubeKey,
  } = useSettingsContext()

  const usedRatio = ytQuota ? Math.min(1, ytQuota.spent / ytQuota.daily_limit) : 0

  return (
    <>
      <p className="settings-description">
        Pull tracklists out of DJ set descriptions and comments. Needs your own YouTube
        Data API v3 key — the free daily allowance is granted per key, so everyone brings
        their own rather than sharing one.
      </p>

      <div className="sv-subsection">
        <label htmlFor="yt-api-key" className="sv-setting-row__label">YouTube Data API v3 Key</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            id="yt-api-key"
            type={showYtKey ? 'text' : 'password'}
            placeholder={ytKeyConfigured ? '••••••••••••••••' : 'AIza...'}
            value={ytKeyInput}
            onChange={(e) => setYtKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveYouTubeKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowYtKey(!showYtKey)}
            className="btn-icon"
            title={showYtKey ? 'Hide' : 'Show'}
            type="button"
          >
            <Icon name={showYtKey ? 'EyeOff' : 'Eye'} size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveYouTubeKey}
            disabled={ytSaving || !ytKeyInput.trim()}
            className="btn-primary btn-small"
          >
            {ytSaving ? 'Saving...' : ytKeyConfigured ? 'Update Key' : 'Save Key'}
          </button>
          {ytKeyConfigured && (
            <>
              <button
                onClick={handleTestYouTubeKey}
                disabled={ytTesting}
                className="btn-secondary btn-small"
                title="Costs 1 quota unit"
              >
                {ytTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={handleDeleteYouTubeKey} className="btn-secondary btn-small">
                Delete Key
              </button>
            </>
          )}
        </div>

        {ytKeyConfigured && !ytTestResult && (
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Key saved — press Test Connection to check it
          </p>
        )}

        {ytTestResult && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              color: ytTestResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
              background: ytTestResult.ok
                ? 'rgba(var(--color-success-rgb), 0.1)'
                : 'rgba(var(--color-danger-rgb), 0.1)',
              border: `1px solid ${
                ytTestResult.ok
                  ? 'rgba(var(--color-success-rgb), 0.35)'
                  : 'rgba(var(--color-danger-rgb), 0.35)'
              }`,
            }}
          >
            {ytTestResult.ok ? '✓ ' : '✗ '}
            {ytTestResult.message}
            {!ytTestResult.ok && (
              <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                Paste a different key above and press Update Key, then test again.
              </div>
            )}
          </div>
        )}
      </div>

      {ytQuota && (
        <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
          <label className="sv-setting-row__label">Daily quota</label>
          <div
            style={{
              height: 6, marginTop: '0.5rem', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)', overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${usedRatio * 100}%`, height: '100%',
                background: ytQuota.exhausted ? 'var(--color-danger)' : 'var(--accent)',
              }}
            />
          </div>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {ytQuota.spent.toLocaleString()} of {ytQuota.daily_limit.toLocaleString()} units used
            {' · '}{ytQuota.remaining.toLocaleString()} left
            {' · '}resets in {formatReset(ytQuota.seconds_until_reset)}
          </p>
          <p className="settings-hint">
            Counted here, not by YouTube — it reports nothing. A set costs 5–7 units, a
            search by DJ name costs 100. If the same key is used in another app, that
            spending is invisible here.
          </p>
        </div>
      )}

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">How to get a key</label>
        <ol className="settings-hint" style={{ marginTop: '0.5rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              console.cloud.google.com
            </a>{' '}
            and create a project
          </li>
          <li>APIs &amp; Services → Library → enable <strong>YouTube Data API v3</strong></li>
          <li>Credentials → Create credentials → <strong>API key</strong></li>
          <li>Restrict key → API restrictions → allow only YouTube Data API v3</li>
          <li>Paste it above and press Test Connection</li>
        </ol>
        <p className="settings-hint" style={{ marginTop: '0.75rem' }}>
          No credit card needed — 10,000 units a day is the free tier. Note that a desktop
          app cannot use referrer or IP restrictions, so the key can only be limited to
          which API it may call.
        </p>
      </div>
    </>
  )
}
