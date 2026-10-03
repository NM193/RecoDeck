// src/components/layout/SidebarRail.tsx
// The sidebar collapsed to icons: nav items, Folders and Playlists as icons
// that open flyouts, tooltips after a short hover, the profile at the bottom.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { SECTION_LABELS, type SidebarSection } from '../../lib/sidebarPrefs'
import type { FlyoutSection, NavItem } from './sidebarTypes'
import { SidebarFlyout } from './SidebarFlyout'

interface SidebarRailProps {
  navItems: NavItem[]
  activeSection: SidebarSection | null
  iconStyle: (section: SidebarSection) => React.CSSProperties | undefined
  /** Right-click handler factory; `withCreate` adds Create Playlist / Folder. */
  onColourMenu: (
    section: SidebarSection,
    withCreate?: boolean,
  ) => (e: React.MouseEvent) => void
  onToggleCollapsed: () => void
  onOpenSettings: () => void
  settingsActive: boolean
  /** The Spotify new-likes number; null hides the Spotify icon (not connected). */
  spotifyNew: number | null
  /** Section contents for the flyouts; `close` is called after a navigation. */
  renderSection: (section: FlyoutSection, close: () => void) => ReactNode
}

const TOOLTIP_DELAY_MS = 400

export function SidebarRail({
  navItems,
  activeSection,
  iconStyle,
  onColourMenu,
  onToggleCollapsed,
  onOpenSettings,
  settingsActive,
  spotifyNew,
  renderSection,
}: SidebarRailProps) {
  // --- Tooltip ---
  const [tip, setTip] = useState<{
    label: string
    top: number
    left: number
  } | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showTip = (label: string) => (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(tipTimer.current)
    tipTimer.current = setTimeout(
      () =>
        setTip({
          label,
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        }),
      TOOLTIP_DELAY_MS,
    )
  }
  const hideTip = () => {
    clearTimeout(tipTimer.current)
    setTip(null)
  }
  useEffect(() => () => clearTimeout(tipTimer.current), [])

  // --- Flyout ---
  const [flyout, setFlyout] = useState<{
    section: FlyoutSection
    top: number
    left: number
    anchor: HTMLElement
  } | null>(null)
  const closeFlyout = useCallback(() => setFlyout(null), [])

  const toggleFlyout =
    (section: FlyoutSection) => (e: React.MouseEvent<HTMLElement>) => {
      hideTip()
      if (flyout?.section === section) {
        setFlyout(null)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      setFlyout({
        section,
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 320)),
        left: rect.right + 6,
        anchor: e.currentTarget,
      })
    }

  /** `badge`, when above zero, is a small number at the icon's top-right. */
  const sectionButton = (
    section: FlyoutSection,
    label: string,
    glyph: ReactNode,
    badge?: number,
  ) => (
    <button
      className={`sidebar-rail__item ${activeSection === section || flyout?.section === section ? 'sidebar-rail__item--active' : ''}`}
      onClick={toggleFlyout(section)}
      onContextMenu={onColourMenu(section, section === 'playlists')}
      onMouseEnter={flyout ? undefined : showTip(label)}
      onMouseLeave={hideTip}
      aria-label={
        badge != null && badge > 0 ? `${label}, ${badge} new` : label
      }
      aria-haspopup="dialog"
      aria-expanded={flyout?.section === section}
      type="button"
    >
      {glyph}
      {badge != null && badge > 0 && (
        <span className="sidebar-rail__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  )

  return (
    <div className="sidebar sidebar--rail">
      <div className="sidebar-rail__top">
        <span
          className="sidebar-rail__wordmark"
          role="img"
          aria-label="RecoDeck"
        >
          RECO
          <br />
          DECK
        </span>
        <button
          className="sidebar-top__toggle"
          onClick={onToggleCollapsed}
          type="button"
          title="Expand sidebar (⌘\)"
          aria-label="Expand sidebar"
        >
          <Icon name="PanelLeft" size={14} />
        </button>
      </div>

      <div className="sidebar-rail__nav">
        {navItems.map((item) => (
          <button
            key={item.section}
            className={`sidebar-rail__item ${activeSection === item.section ? 'sidebar-rail__item--active' : ''}`}
            onClick={item.onClick}
            onContextMenu={onColourMenu(item.section)}
            onMouseEnter={flyout ? undefined : showTip(item.label)}
            onMouseLeave={hideTip}
            aria-label={item.label}
            type="button"
          >
            <Icon name={item.icon} size={16} style={iconStyle(item.section)} />
          </button>
        ))}
        <span className="sidebar-rail__divider" />
        {sectionButton(
          'folders',
          SECTION_LABELS.folders,
          <Icon name="Disc3" size={16} style={iconStyle('folders')} />,
        )}
        {sectionButton(
          'playlists',
          SECTION_LABELS.playlists,
          <Icon name="ListMusic" size={16} style={iconStyle('playlists')} />,
        )}
        {spotifyNew !== null &&
          sectionButton(
            'spotify',
            SECTION_LABELS.spotify,
            <SpotifyGlyph size={16} style={iconStyle('spotify')} />,
            spotifyNew,
          )}
      </div>

      <button
        className={`sidebar-top__avatar sidebar-rail__avatar ${settingsActive ? 'sidebar-top__avatar--active' : ''}`}
        onClick={onOpenSettings}
        onMouseEnter={flyout ? undefined : showTip('Settings')}
        onMouseLeave={hideTip}
        aria-label="Settings"
        type="button"
      >
        <Icon name="User" size={16} />
      </button>

      {tip && (
        <div
          className="sidebar-tooltip"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </div>
      )}

      {flyout && (
        <SidebarFlyout
          title={SECTION_LABELS[flyout.section]}
          top={flyout.top}
          left={flyout.left}
          anchor={flyout.anchor}
          onClose={closeFlyout}
        >
          {renderSection(flyout.section, closeFlyout)}
        </SidebarFlyout>
      )}
    </div>
  )
}
