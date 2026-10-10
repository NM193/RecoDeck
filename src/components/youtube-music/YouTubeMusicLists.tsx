// The items under YOUTUBE MUSIC: All playlists, Liked music, then each
// playlist in the order it was added, and "+ Add playlist" at the end.
// Right-click a playlist to remove it. Used by the full sidebar and by the
// rail's flyout; styled with FolderTree's rows, like SpotifyLists.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { GLIDE } from '../../lib/glide/glide'
import { useGlideTo, useHoverGlide } from '../../lib/glide/useGlide'
import { useOverlay } from '../../lib/overlays'
import { getErrorMessage } from '../../types/ai'
import {
  ALL_YTM_LISTS,
  LIKED_MUSIC,
  type YtmList,
} from '../../types/youtubeMusic'

interface YouTubeMusicListsProps {
  lists: YtmList[]
  /** Tracks behind each item, plus ALL_YTM_LISTS. */
  counts: Map<string, number>
  /** New-and-missing per list; absent means none. */
  newByList: Map<string, number>
  activeListId: string | null
  onOpen: (listId: string) => void
  /** Rejects with the one line to show under the field. */
  onAdd: (link: string) => Promise<void>
  onRemove: (listId: string) => Promise<void>
}

export function YouTubeMusicLists({
  lists,
  counts,
  newByList,
  activeListId,
  onOpen,
  onAdd,
  onRemove,
}: YouTubeMusicListsProps) {
  /** The + Add playlist field is open. */
  const [adding, setAdding] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; listId: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // The list's sliding highlights (Micro-interactions spec, Sidebar): the
  // hover, and the open playlist painted over it.
  const bodyRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const openRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(bodyRef, hoverRef, '.folder-row', GLIDE.row)
  useGlideTo(bodyRef, openRef, '.folder-row.selected', GLIDE.row)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(menu !== null, () => setMenu(null))

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const closeField = () => {
    setAdding(false)
    setLink('')
    setError(null)
  }

  const submit = () => {
    const text = link.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    onAdd(text)
      .then(closeField)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setBusy(false))
  }

  const remove = (listId: string) => {
    setMenu(null)
    setError(null)
    onRemove(listId).catch((e: unknown) => setError(getErrorMessage(e)))
  }

  const item = (list: {
    id: string
    name: string
    icon: 'ListMusic' | 'Heart'
    fresh: number
    gone: boolean
    removable: boolean
  }) => (
    <button
      key={list.id}
      type="button"
      className={`folder-row spotify-list-row ${activeListId === list.id ? 'selected' : ''}`}
      onClick={() => onOpen(list.id)}
      onContextMenu={
        list.removable
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({
                x: Math.min(e.clientX, window.innerWidth - 180),
                y: Math.min(e.clientY, window.innerHeight - 60),
                listId: list.id,
              })
            }
          : undefined
      }
      title={list.gone ? `${list.name} — no longer available` : list.name}
    >
      <Icon name={list.icon} size={14} className="spotify-list-row__icon" />
      <span className="folder-name">{list.name}</span>
      {list.gone && <span className="ytm-list-row__gone">no longer available</span>}
      {list.fresh > 0 && (
        <span className="spotify-list-row__new">{list.fresh}</span>
      )}
      <span className="folder-count">({counts.get(list.id) ?? 0})</span>
    </button>
  )

  return (
    <div className="glide-track folder-tree-section-body" ref={bodyRef}>
      <span ref={hoverRef} className="glide" aria-hidden="true" />
      <span ref={openRef} className="glide glide--open" aria-hidden="true" />
      {/* All playlists carries no number: the header already holds the distinct total. */}
      {item({
        id: ALL_YTM_LISTS,
        name: 'All playlists',
        icon: 'ListMusic',
        fresh: 0,
        gone: false,
        removable: false,
      })}
      {lists.map((list) =>
        item({
          id: list.id,
          name: list.name,
          icon: list.id === LIKED_MUSIC ? 'Heart' : 'ListMusic',
          fresh: newByList.get(list.id) ?? 0,
          gone: list.unavailableAt !== null,
          removable: list.id !== LIKED_MUSIC,
        }),
      )}

      {adding ? (
        <div className="ytm-add">
          <input
            // Opened by a click on "Add playlist": focus goes where the user is looking.
            autoFocus
            type="text"
            className="ytm-add__input"
            placeholder="Playlist link or id"
            aria-label="YouTube playlist link or id"
            value={link}
            readOnly={busy}
            aria-busy={busy}
            spellCheck={false}
            onChange={(e) => {
              setLink(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') closeField()
            }}
          />
          {busy && <span className="ytm-add__hint">Reading the playlist…</span>}
        </div>
      ) : (
        <button
          type="button"
          className="folder-row spotify-list-row"
          onClick={() => setAdding(true)}
        >
          <Icon name="Plus" size={14} className="spotify-list-row__icon" />
          <span className="folder-name">Add playlist</span>
        </button>
      )}
      {error && (
        <div className="ytm-add__error" role="alert">
          {error}
        </div>
      )}

      {/* In a portal: the list is an isolated glide track, which would cap
          the menu's z-index under the main area. */}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="sidebar-ctx-menu ytm-list-menu"
            style={{ top: menu.y, left: menu.x }}
            role="menu"
          >
            <button
              type="button"
              className="sidebar-ctx-menu__item"
              role="menuitem"
              onClick={() => remove(menu.listId)}
            >
              <Icon name="Trash2" size={14} />
              Remove
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
