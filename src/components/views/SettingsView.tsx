import { SettingsProvider, type SettingsCallbacks } from '../settings/SettingsContext'
import { useSettingsContext } from '../settings/SettingsContext'
import { LibrarySection } from '../settings/LibrarySection'
import { AppearanceSection } from '../settings/AppearanceSection'
import { AudioSection } from '../settings/AudioSection'
import { DatabaseSection } from '../settings/DatabaseSection'
import { AISection } from '../settings/AISection'
import { YouTubeSection } from '../settings/YouTubeSection'
import { CompanionSection } from '../settings/CompanionSection'
import { AboutSection } from '../settings/AboutSection'
import { CollapsibleSection } from '../settings/CollapsibleSection'
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

        {/* Closed by default: eight sections stacked open is a page nobody
            reads to the bottom of, and the summaries are the contents list. */}
        <CollapsibleSection
          id="library"
          title="Library Folders"
          summary="Where your music lives, and rescanning it"
        >
          <LibrarySection />
        </CollapsibleSection>

        <CollapsibleSection id="appearance" title="Appearance" summary="Theme">
          <AppearanceSection />
        </CollapsibleSection>

        <CollapsibleSection id="audio" title="Audio" summary="Crossfade and beatmatching">
          <AudioSection />
        </CollapsibleSection>

        <CollapsibleSection
          id="database"
          title="Database Maintenance"
          summary="Duplicates, stray tracks, and tidying the database"
        >
          <DatabaseSection />
        </CollapsibleSection>

        <CollapsibleSection
          id="ai"
          title="AI Assistant"
          summary="Your Anthropic API key and what the assistant may see"
        >
          <AISection />
        </CollapsibleSection>

        <CollapsibleSection
          id="youtube"
          title="YouTube Tracklists"
          summary="Your API key and what is left of today's quota"
        >
          <YouTubeSection />
        </CollapsibleSection>

        <CollapsibleSection
          id="companion"
          title="Mobile Companion"
          summary="Control playback from your phone"
        >
          <CompanionSection />
        </CollapsibleSection>

        <CollapsibleSection id="about" title="About" summary="Version and updates">
          <AboutSection />
        </CollapsibleSection>
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
