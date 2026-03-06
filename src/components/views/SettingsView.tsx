import { SettingsProvider, type SettingsCallbacks } from '../settings/SettingsContext'
import { useSettingsContext } from '../settings/SettingsContext'
import { LibrarySection } from '../settings/LibrarySection'
import { AppearanceSection } from '../settings/AppearanceSection'
import { AudioSection } from '../settings/AudioSection'
import { DatabaseSection } from '../settings/DatabaseSection'
import { AISection } from '../settings/AISection'
import { CompanionSection } from '../settings/CompanionSection'
import { AboutSection } from '../settings/AboutSection'
import { Icon } from '../Icon'
import './SettingsView.css'

function SettingsContent() {
  const { error, setError } = useSettingsContext()

  return (
    <div className="settings-view">
      <div className="settings-view__container">
        <h1 className="settings-view__title">Settings</h1>

        {error && (
          <div className="settings-view__error">
            {error}
            <button className="settings-view__error-dismiss" onClick={() => setError(null)}>
              <Icon name="X" size={16} />
            </button>
          </div>
        )}

        <LibrarySection />
        <hr className="settings-view__divider" />
        <AppearanceSection />
        <hr className="settings-view__divider" />
        <AudioSection />
        <hr className="settings-view__divider" />
        <DatabaseSection />
        <hr className="settings-view__divider" />
        <AISection />
        <hr className="settings-view__divider" />
        <CompanionSection />
        <hr className="settings-view__divider" />
        <AboutSection />
      </div>
    </div>
  )
}

interface SettingsViewProps extends SettingsCallbacks {}

export function SettingsView(props: SettingsViewProps) {
  return (
    <SettingsProvider callbacks={props}>
      <SettingsContent />
    </SettingsProvider>
  )
}
