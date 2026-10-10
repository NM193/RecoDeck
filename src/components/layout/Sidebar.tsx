// Sidebar — resizable, 2 collapsible sections: Folders, Playlists; collapses to an icon rail (SidebarRail.tsx); section icon colours are set by right-click
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon, type IconName } from '../Icon'
import type { Playlist } from '../../types/track'
import { FolderTree, type FolderTreeRef } from '../FolderTree'
import { SidebarRail } from './SidebarRail'
import { SidebarColourMenu } from './SidebarColourMenu'
import { useSectionHeights } from './useSectionHeights'
import type { NavItem, SidebarSpotify, SidebarYouTubeMusic } from './sidebarTypes'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { SpotifyLists } from '../spotify/SpotifyLists'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { YouTubeMusicLists } from '../youtube-music/YouTubeMusicLists'
import { useFolderTreeStore } from '../../store/folderTreeStore'
import { useOverlay } from '../../lib/overlays'
import {
  COLLAPSED_WIDTH,
  SECTION_LABELS,
  type ActiveView,
  colourFor,
  sectionForView,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'
import { EASE, MOTION } from '../../lib/motion'
import './Sidebar.css'

// --- Constants ---

const MIN_WIDTH = 180
const MAX_WIDTH = 400
const STORAGE_KEY = 'sidebar_width'
const DEFAULT_WIDTH = 240

/** The width the user dragged the full sidebar to, or the default. */
function readStoredWidth(): number {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable; the default width will do.
  }
  const width = parseInt(stored ?? '', 10)
  return !isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH
    ? width
    : DEFAULT_WIDTH
}

// --- Section component ---

interface SectionProps {
  /** Which section: its list wrapper says so, for the measuring. */
  section: SidebarSection
  title: string
  iconName?: IconName
  /** Drawn instead of `iconName` — for Spotify, which lucide does not draw. */
  glyph?: ReactNode
  expanded: boolean
  onToggle: () => void
  iconStyle?: React.CSSProperties
  onContextMenu?: (e: React.MouseEvent) => void
  /** Shown right-aligned in the header. It sits inside the header button, so
   *  it must not be interactive itself. */
  trailing?: React.ReactNode
  /** The list's height from `useSectionHeights`; 0 until measured. */
  height?: number
  /** Whether a change of `height` animates (open / close) or is immediate (resize). */
  animateHeight: boolean
  /** `useSectionHeights`' ref for the list wrapper. */
  contentRef: (el: HTMLDivElement | null) => (() => void) | undefined
  children: React.ReactNode
}

function Section({
  section,
  title,
  iconName,
  glyph,
  expanded,
  onToggle,
  iconStyle,
  onContextMenu,
  trailing,
  height,
  animateHeight,
  contentRef,
  children,
}: SectionProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Set by the header when it opens the list: the selected row is shown once it is open. */
  const justOpened = useRef(false)

  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section__header"
        onClick={() => {
          justOpened.current = !expanded
          onToggle()
        }}
        onContextMenu={onContextMenu}
        type="button"
      >
        <span
          className={`sidebar-section__chevron ${expanded ? '' : 'sidebar-section__chevron--collapsed'}`}
        >
          <Icon name="ChevronDown" size={14} />
        </span>
        {glyph ?? (iconName && <Icon name={iconName} size={14} style={iconStyle} />)}
        <span className="sidebar-section__title">{title}</span>
        {trailing != null && (
          <span className="sidebar-section__trailing">{trailing}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            ref={bodyRef}
            className="sidebar-section__body"
            // Scrolls while tracks are dragged near its edge.
            data-drop-scroll
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              // 0 until measured, so a list never starts at its full height
              // and pushes the headers below it off screen.
              height: height ?? 0,
              opacity: 1,
              transition: { duration: animateHeight ? MOTION.base : 0, ease: EASE },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: MOTION.base, ease: EASE },
            }}
            // No scrollbar while the height moves (it would flash and shift the rows).
            onAnimationStart={() => {
              bodyRef.current?.setAttribute('data-animating', '')
            }}
            onAnimationComplete={() => {
              bodyRef.current?.removeAttribute('data-animating')
              if (!justOpened.current) return
              justOpened.current = false
              bodyRef.current
                ?.querySelector('.folder-row.selected')
                ?.scrollIntoView({ block: 'nearest' })
            }}
          >
            <div
              className="sidebar-section__content"
              data-section={section}
              ref={contentRef}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- Sidebar props ---

interface SidebarProps {
  libraryFolders: string[]
  playlists: Playlist[]
  selectedFolder: string | null
  selectedPlaylistId: number | null
  totalTrackCount?: number
  activeView: ActiveView
  collapsed: boolean
  onToggleCollapsed: () => void
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onExportPlaylist?: (playlistId: number, playlistName: string) => void
  onExportToDj?: (playlistId: number) => void
  onCreateSubfolder: (parentPath: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onDeleteFolder: (folderPath: string, folderName: string) => void
  folderTreeRef?: React.Ref<FolderTreeRef>
  onOpenSettings: () => void
  onNavigateHome: () => void
  onShowAllTracks: () => void
  onSearch?: () => void
  onNavigateSets?: () => void
  onNavigateAIChat?: () => void
  spotify?: SidebarSpotify
  youtubeMusic?: SidebarYouTubeMusic
}

// --- Main Sidebar ---

export function Sidebar({
  libraryFolders,
  playlists,
  selectedFolder,
  selectedPlaylistId,
  totalTrackCount,
  activeView,
  collapsed,
  onToggleCollapsed,
  colours,
  onSetColour,
  onResetColour,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onExportPlaylist,
  onExportToDj,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  folderTreeRef,
  onOpenSettings,
  onNavigateHome,
  onShowAllTracks,
  onSearch,
  onNavigateSets,
  onNavigateAIChat,
  spotify,
  youtubeMusic,
}: SidebarProps) {
  // The folder tree's expansion and loaded children live in a store that
  // outlives the trees (collapsing unmounts them; each flyout mounts a new
  // one), so the refresh handle lives here, where it is always mounted —
  // otherwise a refresh while no tree is showing would leave the cache stale.
  useImperativeHandle(
    folderTreeRef,
    () => ({
      refreshLibraryRoot: (affectedPath: string) =>
        useFolderTreeStore.getState().refreshRoot(libraryFolders, affectedPath),
    }),
    [libraryFolders],
  )

  // Section expand states — all start expanded
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true)
  const [spotifyExpanded, setSpotifyExpanded] = useState(true)
  const [youtubeMusicExpanded, setYouTubeMusicExpanded] = useState(true)

  // The open sections share the height under the nav (spec: sidebar sections
  // scroll); each open list gets its share and scrolls inside.
  const openSections: SidebarSection[] = []
  if (foldersExpanded) openSections.push('folders')
  if (playlistsExpanded) openSections.push('playlists')
  if (spotify && spotifyExpanded) openSections.push('spotify')
  if (youtubeMusic && youtubeMusicExpanded) openSections.push('youtube-music')
  const { areaRef, contentRef, heights, animate } =
    useSectionHeights(openSections)

  // Right-click menu: a section's colour, plus Create Playlist / Folder on Playlists.
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    section: SidebarSection
    withCreate: boolean
  } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(ctxMenu !== null, () => setCtxMenu(null))

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node))
        setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // Drag state
  const isDragging = useRef(false)
  const [dragging, setDragging] = useState(false)

  // Sidebar.tsx is the only writer of --sidebar-width: the dragged width when
  // full, the rail when collapsed. Only a toggle animates — never a drag.
  // A layout effect, so the first paint already has the right width.
  const firstWidthRun = useRef(true)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      '--sidebar-width',
      `${collapsed ? COLLAPSED_WIDTH : readStoredWidth()}px`,
    )
    if (firstWidthRun.current) {
      firstWidthRun.current = false
      return
    }
    root.classList.add('sidebar-width-animating')
    const timer = setTimeout(
      () => root.classList.remove('sidebar-width-animating'),
      200,
    )
    return () => {
      clearTimeout(timer)
      root.classList.remove('sidebar-width-animating')
    }
  }, [collapsed])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    setDragging(true)

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX))
      document.documentElement.style.setProperty(
        '--sidebar-width',
        `${newWidth}px`,
      )
    }

    const onMouseUp = (ev: MouseEvent) => {
      isDragging.current = false
      setDragging(false)
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX))
      try {
        localStorage.setItem(STORAGE_KEY, String(newWidth))
      } catch {
        // Storage can be unavailable; the width still applies for this session.
      }
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const activeSection = sectionForView(activeView)
  const iconStyle = (
    section: SidebarSection,
  ): React.CSSProperties | undefined =>
    activeSection === section
      ? { color: colourFor(section, colours) }
      : undefined

  const navItems: NavItem[] = [
    {
      section: 'home',
      label: SECTION_LABELS.home,
      icon: 'House',
      onClick: onNavigateHome,
    },
    ...(onNavigateSets
      ? [
          {
            section: 'sets' as const,
            label: SECTION_LABELS.sets,
            // Not ListMusic (playlists) and not Disc3 (folders) — both are
            // already in this sidebar. A set is a broadcast of a performance,
            // which is the one thing nothing else here is.
            icon: 'Radio' as const,
            onClick: onNavigateSets,
          },
        ]
      : []),
    {
      section: 'all-tracks',
      label: SECTION_LABELS['all-tracks'],
      icon: 'Music',
      onClick: onShowAllTracks,
      count: totalTrackCount,
    },
    {
      section: 'search',
      label: SECTION_LABELS.search,
      icon: 'Search',
      onClick: () => onSearch?.(),
    },
    ...(onNavigateAIChat
      ? [
          {
            section: 'ai-chat' as const,
            label: SECTION_LABELS['ai-chat'],
            icon: 'MessageSquare' as const,
            onClick: onNavigateAIChat,
          },
        ]
      : []),
  ]

  const treeProps = {
    libraryFolders,
    playlists,
    selectedFolder,
    selectedPlaylistId,
    onFolderSelect,
    onPlaylistSelect,
    onAnalyzeFolder,
    onCreatePlaylist,
    onCreateFolder,
    onRenamePlaylist,
    onDeletePlaylist,
    onSharePlaylist,
    onExportPlaylist,
    onExportToDj,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
  }

  const openColourMenu =
    (section: SidebarSection, withCreate = false) =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      setCtxMenu({
        x: Math.min(e.clientX, window.innerWidth - 264),
        y: Math.min(e.clientY, window.innerHeight - 240),
        section,
        withCreate,
      })
    }

  const colourMenuEl = ctxMenu && (
    <div
      ref={ctxRef}
      className="sidebar-ctx-menu"
      style={{ top: ctxMenu.y, left: ctxMenu.x }}
    >
      <SidebarColourMenu
        label={SECTION_LABELS[ctxMenu.section]}
        current={colourFor(ctxMenu.section, colours)}
        onPick={(hex) => {
          onSetColour(ctxMenu.section, hex)
          setCtxMenu(null)
        }}
        onCustom={(hex) => onSetColour(ctxMenu.section, hex)}
        onReset={() => {
          onResetColour(ctxMenu.section)
          setCtxMenu(null)
        }}
      />
      {ctxMenu.withCreate && (
        <>
          <div className="sidebar-ctx-menu__sep" />
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => {
              onCreatePlaylist(null)
              setCtxMenu(null)
            }}
            type="button"
          >
            <Icon name="Plus" size={14} />
            Create Playlist
          </button>
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => {
              onCreateFolder(null)
              setCtxMenu(null)
            }}
            type="button"
          >
            <Icon name="FolderPlus" size={14} />
            Create Folder
          </button>
        </>
      )}
    </div>
  )

  if (collapsed) {
    return (
      <>
        <SidebarRail
          navItems={navItems}
          activeSection={activeSection}
          iconStyle={iconStyle}
          onColourMenu={openColourMenu}
          onToggleCollapsed={onToggleCollapsed}
          onOpenSettings={onOpenSettings}
          settingsActive={activeView === 'settings'}
          spotifyNew={spotify ? spotify.newTotal : null}
          youtubeMusicNew={youtubeMusic ? youtubeMusic.newTotal : null}
          renderSection={(section, close) =>
            section === 'spotify' ? (
              spotify && (
                <SpotifyLists
                  lists={spotify.lists}
                  counts={spotify.counts}
                  newByList={spotify.newByList}
                  activeListId={spotify.activeListId}
                  onOpen={(id) => {
                    spotify.onOpenList(id)
                    close()
                  }}
                />
              )
            ) : section === 'youtube-music' ? (
              youtubeMusic && (
                <YouTubeMusicLists
                  lists={youtubeMusic.lists}
                  counts={youtubeMusic.counts}
                  newByList={youtubeMusic.newByList}
                  activeListId={youtubeMusic.activeListId}
                  onOpen={(id) => {
                    youtubeMusic.onOpenList(id)
                    close()
                  }}
                  onAdd={youtubeMusic.onAddPlaylist}
                  onRemove={youtubeMusic.onRemovePlaylist}
                />
              )
            ) : (
              // Navigating closes the flyout; expanding a playlist folder does
              // not, because FolderTree handles that without calling these.
              <FolderTree
                {...treeProps}
                section={section}
                onFolderSelect={(path) => {
                  onFolderSelect(path)
                  close()
                }}
                onPlaylistSelect={(id) => {
                  onPlaylistSelect(id)
                  close()
                }}
              />
            )
          }
        />
        {colourMenuEl}
      </>
    )
  }

  return (
    <div className="sidebar">
      {/* Top area — logo + avatar settings */}
      <div className="sidebar-top">
        <div className="sidebar-top__brand">
          <img
            src="/recodeck-logo.gif"
            alt="RecoDeck"
            className="sidebar-top__logo"
          />
        </div>
        <button
          className={`sidebar-top__avatar ${activeView === 'settings' ? 'sidebar-top__avatar--active' : ''}`}
          onClick={onOpenSettings}
          type="button"
          title="Settings"
        >
          <Icon name="User" size={16} />
        </button>
        <button
          className="sidebar-top__toggle"
          onClick={onToggleCollapsed}
          type="button"
          title="Collapse sidebar (⌘\)"
          aria-label="Collapse sidebar"
        >
          <Icon name="PanelLeft" size={14} />
        </button>
      </div>

      {/* Top nav items — they stay put; the sections share the space below */}
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.section}
            className={`sidebar-nav-item ${activeSection === item.section ? 'sidebar-nav-item--active' : ''}`}
            onClick={item.onClick}
            onContextMenu={openColourMenu(item.section)}
            type="button"
          >
            <Icon
              name={item.icon}
              size={16}
              style={iconStyle(item.section)}
            />
            <span>{item.label}</span>
            {item.count != null && item.count > 0 && (
              <span className="sidebar-nav-item__count">({item.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* The sections. Only their lists scroll; this area scrolls as a whole
          only when even three rows per open list do not fit. */}
      <div className="sidebar-scroll" ref={areaRef} data-drop-scroll>
        {/* Folders section */}
        <Section
          section="folders"
          height={heights.folders}
          animateHeight={animate}
          contentRef={contentRef}
          title="Folders"
          iconName="Disc3"
          expanded={foldersExpanded}
          onToggle={() => setFoldersExpanded((v) => !v)}
          iconStyle={iconStyle('folders')}
          onContextMenu={openColourMenu('folders')}
        >
          <FolderTree {...treeProps} section="folders" />
        </Section>

        {/* Divider */}
        <div className="sidebar-divider" />

        {/* Playlists section */}
        <Section
          section="playlists"
          height={heights.playlists}
          animateHeight={animate}
          contentRef={contentRef}
          title="Playlists"
          iconName="ListMusic"
          expanded={playlistsExpanded}
          onToggle={() => setPlaylistsExpanded((v) => !v)}
          iconStyle={iconStyle('playlists')}
          onContextMenu={openColourMenu('playlists', true)}
        >
          <FolderTree {...treeProps} section="playlists" />
        </Section>

        {/* Spotify section — only once an account is connected */}
        {spotify && (
          <>
            <div className="sidebar-divider" />
            <Section
              section="spotify"
              height={heights.spotify}
              animateHeight={animate}
              contentRef={contentRef}
              title="Spotify"
              glyph={<SpotifyGlyph size={14} style={iconStyle('spotify')} />}
              expanded={spotifyExpanded}
              onToggle={() => setSpotifyExpanded((v) => !v)}
              onContextMenu={openColourMenu('spotify')}
              trailing={
                spotify.newTotal > 0 ? (
                  <span className="sidebar-section__new">
                    {spotify.newTotal}
                    <span className="spotify-sr-only"> new</span>
                  </span>
                ) : undefined
              }
            >
              <SpotifyLists
                lists={spotify.lists}
                counts={spotify.counts}
                newByList={spotify.newByList}
                activeListId={spotify.activeListId}
                onOpen={spotify.onOpenList}
              />
            </Section>
          </>
        )}

        {/* YouTube Music section — connected, and Show in sidebar on */}
        {youtubeMusic && (
          <>
            <div className="sidebar-divider" />
            <Section
              section="youtube-music"
              height={heights['youtube-music']}
              animateHeight={animate}
              contentRef={contentRef}
              title="YouTube Music"
              glyph={
                <YouTubeGlyph size={14} style={iconStyle('youtube-music')} />
              }
              expanded={youtubeMusicExpanded}
              onToggle={() => setYouTubeMusicExpanded((v) => !v)}
              onContextMenu={openColourMenu('youtube-music')}
              trailing={
                youtubeMusic.newTotal > 0 ? (
                  <span className="sidebar-section__new">
                    {youtubeMusic.newTotal}
                    <span className="spotify-sr-only"> new</span>
                  </span>
                ) : undefined
              }
            >
              <YouTubeMusicLists
                lists={youtubeMusic.lists}
                counts={youtubeMusic.counts}
                newByList={youtubeMusic.newByList}
                activeListId={youtubeMusic.activeListId}
                onOpen={youtubeMusic.onOpenList}
                onAdd={youtubeMusic.onAddPlaylist}
                onRemove={youtubeMusic.onRemovePlaylist}
              />
            </Section>
          </>
        )}
      </div>

      {colourMenuEl}

      {/* Drag resize handle */}
      <div
        className={`sidebar-drag-handle ${dragging ? 'sidebar-drag-handle--dragging' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
      />
    </div>
  )
}
