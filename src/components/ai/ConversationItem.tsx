// ConversationItem — single conversation row with title, date, context menu, inline rename

import { useState, useRef, useEffect } from 'react'
import { Icon } from '../Icon'
import type { Conversation } from '../../types/ai'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

/** Format epoch seconds to a relative date string */
function formatRelativeDate(epochSeconds: number): string {
  const now = Date.now()
  const diffMs = now - epochSeconds * 1000
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'Just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  if (diffHr < 48) return 'Yesterday'

  return new Date(epochSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Auto-focus rename input
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  // Click-outside to dismiss context menu
  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  const startRename = () => {
    setCtxMenu(null)
    setRenameValue(conversation.title)
    setIsRenaming(true)
  }

  const saveRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  const handleDelete = () => {
    setCtxMenu(null)
    onDelete(conversation.id)
  }

  return (
    <div
      className={`conv-item ${isActive ? 'conv-item--active' : ''}`}
      onClick={() => !isRenaming && onSelect(conversation.id)}
      onContextMenu={handleContextMenu}
    >
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="conv-item__rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={saveRename}
        />
      ) : (
        <p className="conv-item__title">
          {conversation.title || 'New conversation'}
        </p>
      )}
      <p className="conv-item__date">
        {formatRelativeDate(conversation.created_at)}
      </p>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="conv-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            className="conv-ctx-menu__item"
            onClick={startRename}
            type="button"
          >
            <Icon name="Pencil" size={14} />
            Rename
          </button>
          <button
            className="conv-ctx-menu__item conv-ctx-menu__item--danger"
            onClick={handleDelete}
            type="button"
          >
            <Icon name="Trash2" size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
