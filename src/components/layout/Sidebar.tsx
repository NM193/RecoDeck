// Sidebar — resizable, 3 collapsible sections: Navigation, Folders, Playlists
import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon, type IconName } from '../Icon'
import type { Playlist } from '../../types/track'
import { FolderTree } from '../FolderTree'
import './Sidebar.css'

// --- Constants ---

const MIN_WIDTH = 180
const MAX_WIDTH = 400
const STORAGE_KEY = 'sidebar_width'
const DEFAULT_WIDTH = 240

// --- Section component ---

interface SectionProps {
  title: string
  iconName: IconName
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, iconName, expanded, onToggle, children }: SectionProps) {
  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section__header"
        onClick={onToggle}
        type="button"
      >
        <span className={`sidebar-section__chevron ${expanded ? '' : 'sidebar-section__chevron--collapsed'}`}>
          <Icon name="ChevronDown" size={14} />
        </span>
        <Icon name={iconName} size={14} />
        <span className="sidebar-section__title">{title}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="sidebar-section__body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {children}
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
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onAnalyzeAll: () => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number, name: string) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onScanDirectory: () => void
  onOpenSettings: () => void
  onNavigateHome: () => void
}

// --- Main Sidebar ---

export function Sidebar({
  libraryFolders,
  playlists,
  selectedFolder,
  selectedPlaylistId,
  totalTrackCount,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onAnalyzeAll,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onScanDirectory,
  onOpenSettings,
  onNavigateHome,
}: SidebarProps) {
  // Section expand states — all start expanded
  const [navExpanded, setNavExpanded] = useState(true)
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true)

  // Drag state
  const isDragging = useRef(false)
  const [dragging, setDragging] = useState(false)

  // On mount: restore sidebar width from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const width = parseInt(stored, 10)
      if (!isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH) {
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
      }
    } else {
      document.documentElement.style.setProperty('--sidebar-width', `${DEFAULT_WIDTH}px`)
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    setDragging(true)

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX))
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
    }

    const onMouseUp = (ev: MouseEvent) => {
      isDragging.current = false
      setDragging(false)
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX))
      localStorage.setItem(STORAGE_KEY, String(newWidth))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const isHomeActive = selectedFolder === null && selectedPlaylistId === null

  return (
    <div className="sidebar">
      {/* Top area — logo, scan, settings */}
      <div className="sidebar-top">
        <div className="sidebar-top__brand">
          <img
            src="/recodeck-logo.png"
            alt="RecoDeck"
            className="sidebar-top__logo"
          />
        </div>
        <div className="sidebar-top__actions">
          <button
            className="sidebar-top__scan-btn"
            onClick={onScanDirectory}
            type="button"
          >
            Scan Folder
          </button>
          <button
            className="sidebar-top__settings-btn"
            onClick={onOpenSettings}
            type="button"
            title="Settings"
          >
            <Icon name="Settings" size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="sidebar-scroll">
        {/* Navigation section */}
        <Section
          title="Navigation"
          iconName="Compass"
          expanded={navExpanded}
          onToggle={() => setNavExpanded((v) => !v)}
        >
          <button
            className={`sidebar-nav-item ${isHomeActive ? 'sidebar-nav-item--active' : ''}`}
            onClick={onNavigateHome}
            type="button"
          >
            <Icon name="House" size={16} className="sidebar-nav-item__icon" />
            Home
          </button>
          <button
            className="sidebar-nav-item"
            type="button"
            disabled
            title="Search coming soon"
          >
            <Icon name="Search" size={16} className="sidebar-nav-item__icon" />
            Search
          </button>
        </Section>

        {/* Folders section */}
        <Section
          title="Folders"
          iconName="Disc3"
          expanded={foldersExpanded}
          onToggle={() => setFoldersExpanded((v) => !v)}
        >
          <FolderTree
            libraryFolders={libraryFolders}
            playlists={playlists}
            selectedFolder={selectedFolder}
            selectedPlaylistId={selectedPlaylistId}
            totalTrackCount={totalTrackCount}
            onFolderSelect={onFolderSelect}
            onPlaylistSelect={onPlaylistSelect}
            onAnalyzeFolder={onAnalyzeFolder}
            onAnalyzeAll={onAnalyzeAll}
            onCreatePlaylist={onCreatePlaylist}
            onCreateFolder={onCreateFolder}
            onRenamePlaylist={onRenamePlaylist}
            onDeletePlaylist={onDeletePlaylist}
            onSharePlaylist={onSharePlaylist}
            section="folders"
          />
        </Section>

        {/* Playlists section */}
        <Section
          title="Playlists"
          iconName="ListMusic"
          expanded={playlistsExpanded}
          onToggle={() => setPlaylistsExpanded((v) => !v)}
        >
          <FolderTree
            libraryFolders={libraryFolders}
            playlists={playlists}
            selectedFolder={selectedFolder}
            selectedPlaylistId={selectedPlaylistId}
            totalTrackCount={totalTrackCount}
            onFolderSelect={onFolderSelect}
            onPlaylistSelect={onPlaylistSelect}
            onAnalyzeFolder={onAnalyzeFolder}
            onAnalyzeAll={onAnalyzeAll}
            onCreatePlaylist={onCreatePlaylist}
            onCreateFolder={onCreateFolder}
            onRenamePlaylist={onRenamePlaylist}
            onDeletePlaylist={onDeletePlaylist}
            onSharePlaylist={onSharePlaylist}
            section="playlists"
          />
        </Section>
      </div>

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
