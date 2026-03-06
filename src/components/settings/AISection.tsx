import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'

export function AISection() {
  const {
    isApiKeyConfigured, apiKeyInput, setApiKeyInput,
    showApiKey, setShowApiKey, aiSaving,
    handleSaveApiKey, handleDeleteApiKey,
  } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">AI Assistant</h2>
      <p className="settings-description">
        Configure your Claude API key to enable AI-powered playlist generation.
      </p>

      <div className="sv-subsection">
        <label htmlFor="api-key" className="sv-setting-row__label">Claude API Key</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            id="api-key"
            type={showApiKey ? 'text' : 'password'}
            placeholder={isApiKeyConfigured ? '••••••••••••••••' : 'sk-ant-api03-...'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey() }}
            className="settings-text-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="btn-icon"
            title={showApiKey ? 'Hide' : 'Show'}
            type="button"
          >
            <Icon name={showApiKey ? 'EyeOff' : 'Eye'} size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveApiKey}
            disabled={aiSaving || !apiKeyInput.trim()}
            className="btn-primary btn-small"
          >
            {aiSaving ? 'Saving...' : isApiKeyConfigured ? 'Update Key' : 'Save Key'}
          </button>
          {isApiKeyConfigured && (
            <button onClick={handleDeleteApiKey} className="btn-secondary btn-small">
              Delete Key
            </button>
          )}
        </div>

        {isApiKeyConfigured && (
          <p className="settings-success" style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.875rem' }}>
            ✓ API key configured
          </p>
        )}

        <p className="settings-hint" style={{ marginTop: '1rem' }}>
          Get your API key from{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#60a5fa', textDecoration: 'underline' }}
          >
            console.anthropic.com
          </a>
        </p>
      </div>
    </section>
  )
}
