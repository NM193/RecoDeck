// Sidebar — resizable, 2 collapsible sections: Folders, Playlists
import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon, type IconName } from '../Icon'
import type { Playlist } from '../../types/track'
import { FolderTree, type FolderTreeRef } from '../FolderTree'
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
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

function Section({ title, iconName, expanded, onToggle, onContextMenu, children }: SectionProps) {
  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section__header"
        onClick={onToggle}
        onContextMenu={onContextMenu}
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
  activeView: 'home' | 'all-tracks' | 'folder' | 'playlist' | 'settings' | 'search' | 'ai-chat'
  toastMessage?: string | null
  onToastDismiss?: () => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onAnalyzeAll: () => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
  onRenamePlaylist: (id: number, currentName: string) => void
  onDeletePlaylist: (id: number, name: string) => void
  onSharePlaylist?: (playlistId: number, playlistName: string) => void
  onExportPlaylist?: (playlistId: number, playlistName: string) => void
  onCreateSubfolder: (parentPath: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onDeleteFolder: (folderPath: string, folderName: string) => void
  folderTreeRef?: React.Ref<FolderTreeRef>
  onOpenSettings: () => void
  onNavigateHome: () => void
  onShowAllTracks: () => void
  onSearch?: () => void
  onNavigateAIChat?: () => void
}

// --- Main Sidebar ---

export function Sidebar({
  libraryFolders,
  playlists,
  selectedFolder,
  selectedPlaylistId,
  totalTrackCount,
  activeView,
  toastMessage,
  onToastDismiss,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onAnalyzeAll,
  onCreatePlaylist,
  onCreateFolder,
  onRenamePlaylist,
  onDeletePlaylist,
  onSharePlaylist,
  onExportPlaylist,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  folderTreeRef,
  onOpenSettings,
  onNavigateHome,
  onShowAllTracks,
  onSearch,
  onNavigateAIChat,
}: SidebarProps) {
  // Section expand states — all start expanded
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true)

  // Context menu for Playlists header
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  // Auto-dismiss toast after 2s
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => onToastDismiss?.(), 2000)
    return () => clearTimeout(timer)
  }, [toastMessage, onToastDismiss])

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
      </div>

      {/* Scrollable content */}
      <div className="sidebar-scroll">
        {/* Top nav items */}
        <div className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeView === 'home' ? 'sidebar-nav-item--active' : ''}`}
            onClick={onNavigateHome}
            type="button"
          >
            <Icon name="House" size={16} />
            <span>Home</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeView === 'all-tracks' ? 'sidebar-nav-item--active' : ''}`}
            onClick={onShowAllTracks}
            type="button"
          >
            <Icon name="Music" size={16} />
            <span>All Tracks</span>
            {totalTrackCount != null && totalTrackCount > 0 && (
              <span className="sidebar-nav-item__count">({totalTrackCount})</span>
            )}
          </button>
          <button
            className={`sidebar-nav-item ${activeView === 'search' ? 'sidebar-nav-item--active' : ''}`}
            onClick={onSearch}
            type="button"
          >
            <Icon name="Search" size={16} />
            <span>Search</span>
          </button>
          {onNavigateAIChat && (
            <button
              className={`sidebar-nav-item ${activeView === 'ai-chat' ? 'sidebar-nav-item--active' : ''}`}
              onClick={onNavigateAIChat}
              type="button"
            >
              <Icon name="MessageSquare" size={16} />
              <span>AI Chat</span>
            </button>
          )}
        </div>

        {/* Folders section */}
        <Section
          title="Folders"
          iconName="Disc3"
          expanded={foldersExpanded}
          onToggle={() => setFoldersExpanded((v) => !v)}
        >
          <FolderTree
            ref={folderTreeRef}
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
            onExportPlaylist={onExportPlaylist}
            onCreateSubfolder={onCreateSubfolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            section="folders"
          />
        </Section>

        {/* Divider */}
        <div className="sidebar-divider" />

        {/* Playlists section */}
        <Section
          title="Playlists"
          iconName="ListMusic"
          expanded={playlistsExpanded}
          onToggle={() => setPlaylistsExpanded((v) => !v)}
          onContextMenu={(e) => {
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY })
          }}
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
            onExportPlaylist={onExportPlaylist}
            onCreateSubfolder={onCreateSubfolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            section="playlists"
          />
        </Section>
      </div>

      {/* Playlists header context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="sidebar-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => { onCreatePlaylist(null); setCtxMenu(null) }}
            type="button"
          >
            <Icon name="Plus" size={14} />
            Create Playlist
          </button>
          <button
            className="sidebar-ctx-menu__item"
            onClick={() => { onCreateFolder(null); setCtxMenu(null) }}
            type="button"
          >
            <Icon name="FolderPlus" size={14} />
            Create Folder
          </button>
        </div>
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="sidebar-toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

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
