import { QRCodeSVG } from 'qrcode.react'
import { useSettingsContext } from './SettingsContext'
import { ToggleSwitch } from './ToggleSwitch'

export function CompanionSection() {
  const {
    companionRunning, companionUrl, companionToken,
    companionPortInput, setCompanionPortInput,
    companionActiveStreams, companionLoading,
    companionAutostart,
    handleStartCompanion, handleStopCompanion,
    handleRegenerateToken, handleCompanionAutostartChange,
  } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Mobile Companion</h2>
      <p className="settings-description">
        Stream music from this computer to your phone over WiFi. Open the URL on your phone's browser.
      </p>

      {/* Port configuration */}
      {!companionRunning && (
        <div className="sv-setting-row" style={{ marginBottom: '1rem' }}>
          <div className="sv-setting-row__info">
            <label htmlFor="companion-port" className="sv-setting-row__label">Port</label>
            <span className="sv-setting-row__description">Default: 8384</span>
          </div>
          <input
            id="companion-port"
            type="number"
            min="1024"
            max="65535"
            value={companionPortInput}
            onChange={(e) => setCompanionPortInput(e.target.value)}
            className="settings-number-input"
            style={{ width: '100px' }}
          />
        </div>
      )}

      {/* Start/Stop button */}
      <button
        onClick={companionRunning ? handleStopCompanion : handleStartCompanion}
        disabled={companionLoading}
        className={companionRunning ? 'btn-secondary btn-small' : 'btn-primary btn-small'}
        style={{ width: '100%' }}
      >
        {companionLoading
          ? companionRunning ? 'Stopping...' : 'Starting...'
          : companionRunning ? 'Stop Server' : 'Start Server'}
      </button>

      {/* Connection info (shown when running) */}
      {companionRunning && companionUrl && (
        <div className="companion-info" style={{
          marginTop: '1.5rem', padding: '1rem', borderRadius: '8px',
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#10b981', display: 'inline-block',
            }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Server Running</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>
              {companionActiveStreams} active stream{companionActiveStreams !== 1 ? 's' : ''}
            </span>
          </div>

          {/* QR Code */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginBottom: '1.5rem', padding: '1rem', background: 'white', borderRadius: '8px',
          }}>
            {companionUrl && companionToken ? (
              <QRCodeSVG value={`${companionUrl}/?token=${companionToken}`} size={180} level="M" />
            ) : (
              <div style={{
                width: 180, height: 180, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#999', fontSize: '0.75rem',
              }}>
                Loading...
              </div>
            )}
            <span style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.5rem' }}>
              {companionUrl?.startsWith('http://127.0.0.1')
                ? 'Phone and desktop must be on same WiFi — LAN IP not detected'
                : 'Scan with your phone camera to connect'}
            </span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
              URL
            </label>
            <div style={{
              padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: '4px',
              fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--accent)',
              wordBreak: 'break-all', userSelect: 'all',
            }}>
              {companionUrl}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
              Auth Token
            </label>
            <div style={{
              padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: '4px',
              fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-primary)',
              wordBreak: 'break-all', userSelect: 'all',
            }}>
              {companionToken}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleRegenerateToken} disabled={companionLoading} className="btn-secondary btn-small">
              Regenerate Token
            </button>
          </div>

          <p className="settings-hint" style={{ marginTop: '1rem', fontSize: '0.7rem', opacity: 0.6 }}>
            Your token and port are saved — your phone stays paired across restarts.
            Regenerating the token will disconnect all connected devices.
          </p>
        </div>
      )}

      {/* Auto-start toggle */}
      <div className="sv-setting-row" style={{ marginTop: '1.5rem' }}>
        <div className="sv-setting-row__info">
          <span className="sv-setting-row__label">Auto-start server on launch</span>
          <span className="sv-setting-row__description">
            Your phone will reconnect without re-pairing
          </span>
        </div>
        <ToggleSwitch checked={companionAutostart} onChange={handleCompanionAutostartChange} />
      </div>

      <p className="settings-hint" style={{ marginTop: '1rem' }}>
        The server runs on your local network only. Your phone must be connected to the same WiFi network.
        Supported formats: MP3, AAC/M4A, WAV. FLAC and OGG may not work on all mobile browsers.
      </p>
    </section>
  )
}
