// src/components/layout/SidebarRail.tsx
// The sidebar collapsed to icons: nav items, Folders and Playlists as icons
// that open flyouts, tooltips after a short hover, the profile at the bottom.
// While tracks are dragged, resting on Folders or Playlists opens its flyout,
// which closes again when the drag ends.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { registerDropOpener, useTrackDragStore } from '../../lib/drag/trackDrag'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { SECTION_LABELS, type SidebarSection } from '../../lib/sidebarPrefs'
import type { FlyoutSection, NavItem } from './sidebarTypes'
import { SidebarFlyout } from './SidebarFlyout'
import { GLIDE } from '../../lib/glide/glide'
import { useGlideTo, useHoverGlide } from '../../lib/glide/useGlide'

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
  /** The YouTube Music number; null hides its icon (not connected, or hidden). */
  youtubeMusicNew: number | null
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
  youtubeMusicNew,
  renderSection,
}: SidebarRailProps) {
  // --- Tooltip ---
  const [tip, setTip] = useState<{
    label: string
    top: number
    left: number
  } | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The rail's sliding highlights (Micro-interactions spec, Sidebar): the
  // hover, and the open section painted over it. aria-current marks the open
  // section only; --active also marks the section whose flyout is open.
  const railNavRef = useRef<HTMLDivElement>(null)
  const railHoverRef = useRef<HTMLSpanElement>(null)
  const railOpenRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(railNavRef, railHoverRef, '.sidebar-rail__item', GLIDE.row)
  useGlideTo(railNavRef, railOpenRef, '[aria-current="page"]', GLIDE.row)

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

  const openFlyout = useCallback((section: FlyoutSection, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setFlyout({
      section,
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 320)),
      left: rect.right + 6,
      anchor,
    })
  }, [])

  const toggleFlyout =
    (section: FlyoutSection) => (e: React.MouseEvent<HTMLElement>) => {
      hideTip()
      if (flyout?.section === section) {
        setFlyout(null)
        return
      }
      openFlyout(section, e.currentTarget)
    }

  // Dragging tracks: resting on Folders or Playlists opens its flyout, so its
  // rows can be dropped on; one opened so closes when the drag ends.
  const openedByDrag = useRef(false)
  useEffect(() => {
    const unregister = registerDropOpener('rail', (section, anchor) => {
      if (section !== 'folders' && section !== 'playlists') return
      clearTimeout(tipTimer.current)
      setTip(null)
      openedByDrag.current = true
      openFlyout(section, anchor)
    })
    const unsubscribe = useTrackDragStore.subscribe((state, previous) => {
      if (state.payload || !previous.payload || !openedByDrag.current) return
      openedByDrag.current = false
      setFlyout(null)
    })
    return () => {
      unregister()
      unsubscribe()
    }
  }, [openFlyout])

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
      data-drop-open={
        (section === 'folders' || section === 'playlists') && flyout?.section !== section
          ? `rail:${section}`
          : undefined
      }
      aria-label={badge != null && badge > 0 ? `${label}, ${badge} new` : label}
      aria-haspopup="dialog"
      aria-expanded={flyout?.section === section}
      aria-current={activeSection === section ? 'page' : undefined}
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
          data-tip="Expand sidebar" data-tip-keys="sidebar"
          aria-label="Expand sidebar"
        >
          <Icon name="PanelLeft" size={14} />
        </button>
      </div>

      <div className="glide-track sidebar-rail__nav" ref={railNavRef}>
        <span ref={railHoverRef} className="glide" aria-hidden="true" />
        <span ref={railOpenRef} className="glide glide--open" aria-hidden="true" />
        {navItems.map((item) => (
          <button
            key={item.section}
            className={`sidebar-rail__item ${activeSection === item.section ? 'sidebar-rail__item--active' : ''}`}
            onClick={item.onClick}
            onContextMenu={onColourMenu(item.section)}
            onMouseEnter={flyout ? undefined : showTip(item.label)}
            onMouseLeave={hideTip}
            aria-label={item.label}
            aria-current={activeSection === item.section ? 'page' : undefined}
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
        {youtubeMusicNew !== null &&
          sectionButton(
            'youtube-music',
            SECTION_LABELS['youtube-music'],
            <YouTubeGlyph size={16} style={iconStyle('youtube-music')} />,
            youtubeMusicNew,
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
