import { useSettingsContext } from './SettingsContext'
import { Icon } from '../Icon'
import { Button } from '../Button'

export function AISection() {
  const {
    isApiKeyConfigured, apiKeyInput, setApiKeyInput,
    showApiKey, setShowApiKey, aiSaving,
    handleSaveApiKey, handleDeleteApiKey,
  } = useSettingsContext()

  return (
    <>
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
            className="btn btn--icon"
            data-tip={showApiKey ? 'Hide' : 'Show'}
            aria-label={showApiKey ? 'Hide the key' : 'Show the key'}
            type="button"
          >
            <Icon name={showApiKey ? 'EyeOff' : 'Eye'} size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveApiKey}
            disabled={!apiKeyInput.trim()}
            working={aiSaving}
            workingLabel="Saving…"
          >
            {isApiKeyConfigured ? 'Update Key' : 'Save Key'}
          </Button>
          {isApiKeyConfigured && (
            <button type="button" onClick={handleDeleteApiKey} className="btn btn--sm">
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
    </>
  )
}
