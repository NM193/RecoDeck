import { useSettingsContext } from './SettingsContext'
import { THEMES } from './constants'

export function AppearanceSection() {
  const { currentTheme, handleThemeChange } = useSettingsContext()

  return (
    <section className="sv-section">
      <h2 className="sv-section__title">Appearance</h2>

      {/* Theme */}
      <div className="sv-subsection">
        <h3 className="settings-subsection-title">Theme</h3>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card ${currentTheme === theme.id ? 'theme-card--active' : ''}`}
              onClick={() => handleThemeChange(theme.id)}
            >
              <div className={`theme-preview theme-preview--${theme.id}`}>
                <div className="theme-preview-bar" />
                <div className="theme-preview-content">
                  <div className="theme-preview-line" />
                  <div className="theme-preview-line theme-preview-line--short" />
                </div>
              </div>
              <span className="theme-name">{theme.name}</span>
              <span className="theme-description">{theme.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
