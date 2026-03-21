// ChatArea — right panel: header with editable title, message thread, typing indicator, input area

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TextareaAutosize from 'react-textarea-autosize'
import { ChatMessage } from './ChatMessage'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import { useAIStore } from '../../store/aiStore'
import type { ActionResult, ChatMessage as ChatMessageType, Conversation, GeneratedPlaylist } from '../../types/ai'

function ActionCard({ action }: { action: ActionResult }) {
  const iconMap: Record<string, string> = {
    create_playlist: '📋',
    tag_tracks: '🏷️',
    queue_tracks: '▶️',
    search_library: '🔍',
    recall_conversations: '💬',
    save_preference: '🧠',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      marginTop: '0.5rem',
      borderRadius: '8px',
      background: action.success ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      border: `1px solid ${action.success ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      fontSize: '0.8rem',
      color: action.success ? '#6ee7b7' : '#fca5a5',
    }}>
      <span>{iconMap[action.tool_name] || '⚡'}</span>
      <span>{action.summary}</span>
    </div>
  );
}

interface ChatAreaProps {
  currentConversationId: string | null
  chatHistory: ChatMessageType[]
  isGenerating: boolean
  isApiKeyConfigured: boolean
  error: string | null
  pendingPlaylist: GeneratedPlaylist | null
  conversations: Conversation[]
  onSendMessage: (message: string) => void
  onRenameConversation: (id: string, title: string) => void
  onCreatePlaylist: () => void
  onClearPendingPlaylist: () => void
}

export function ChatArea({
  currentConversationId,
  chatHistory,
  isGenerating,
  isApiKeyConfigured,
  error,
  pendingPlaylist,
  conversations,
  onSendMessage,
  onRenameConversation,
  onCreatePlaylist,
  onClearPendingPlaylist,
}: ChatAreaProps) {
  const [inputValue, setInputValue] = useState('')
  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const lastActions = useAIStore((s) => s.lastActions)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive or generating
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isGenerating])

  // Auto-focus title input when renaming
  useEffect(() => {
    if (isRenamingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isRenamingTitle])

  // Derive current conversation title
  const currentTitle =
    conversations.find((c) => c.id === currentConversationId)?.title ?? ''

  // Title rename handlers
  const startTitleRename = () => {
    setTitleValue(currentTitle)
    setIsRenamingTitle(true)
  }

  const saveTitleRename = () => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== currentTitle && currentConversationId) {
      onRenameConversation(currentConversationId, trimmed)
    }
    setIsRenamingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitleRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsRenamingTitle(false)
    }
  }

  // Send handler
  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return
    onSendMessage(inputValue.trim())
    setInputValue('')
  }

  // Create playlist handler (mirrors AIChatPanel logic)
  const handleCreatePlaylist = async () => {
    if (!pendingPlaylist) return

    try {
      const playlist = await tauriApi.createPlaylist(pendingPlaylist.name, null)

      for (const trackId of pendingPlaylist.track_ids) {
        await tauriApi.addTrackToPlaylist(playlist.id!, trackId)
      }

      onCreatePlaylist()
      onClearPendingPlaylist()
    } catch (err) {
      console.error('Failed to create playlist:', err)
    }
  }

  const isDisabled = !isApiKeyConfigured || isGenerating
  const canSend = !!inputValue.trim() && isApiKeyConfigured && !isGenerating

  return (
    <div className="chat-view__chat-area">
      {/* Header — only show when a conversation is active */}
      {currentConversationId && (
        <div className="chat-header">
          {isRenamingTitle ? (
            <input
              ref={titleInputRef}
              className="chat-header__title-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={saveTitleRename}
            />
          ) : (
            <span
              className="chat-header__title"
              onClick={startTitleRename}
            >
              {currentTitle || 'New conversation'}
            </span>
          )}
          <div className="chat-header__actions">
            {/* Placeholder for future actions */}
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="chat-messages">
        {!isApiKeyConfigured ? (
          <div className="chat-api-warning">
            <Icon
              name="TriangleAlert"
              size={40}
              style={{ opacity: 0.3, marginBottom: 16 }}
            />
            <h2 className="chat-api-warning__heading">API Key Required</h2>
            <p className="chat-api-warning__body">
              Configure your Claude API key in Settings to use the AI assistant.
            </p>
          </div>
        ) : !currentConversationId && chatHistory.length === 0 ? (
          <div className="chat-messages__empty">
            <Icon
              name="MessageCircle"
              size={40}
              style={{ opacity: 0.3, marginBottom: 16 }}
            />
            <h2 className="chat-messages__empty-heading">
              Start a conversation
            </h2>
            <p className="chat-messages__empty-body">
              Ask anything about your library.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentConversationId ?? 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {chatHistory.map((msg, index) => (
                <div key={index}>
                  <ChatMessage message={msg} />
                  {msg.role === 'assistant' && lastActions.length > 0 && index === chatHistory.length - 1 && (
                    <div style={{ marginTop: '0.25rem' }}>
                      {lastActions
                        .filter((a) => a.tool_name !== 'search_library')
                        .map((action, i) => (
                          <ActionCard key={i} action={action} />
                        ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Pending playlist card */}
              {pendingPlaylist && (
                <div className="chat-pending-playlist">
                  <p className="chat-pending-playlist__title">
                    {pendingPlaylist.name}
                  </p>
                  <p className="chat-pending-playlist__desc">
                    {pendingPlaylist.description}
                  </p>
                  <p className="chat-pending-playlist__meta">
                    {pendingPlaylist.track_ids.length} tracks &middot;{' '}
                    {pendingPlaylist.reasoning}
                  </p>
                  <button
                    className="chat-pending-playlist__btn"
                    onClick={handleCreatePlaylist}
                    type="button"
                  >
                    Create Playlist
                  </button>
                </div>
              )}

              {/* Typing indicator */}
              {isGenerating && (
                <div className="chat-typing">
                  <div className="chat-typing__dots">
                    <span className="chat-typing__dot" />
                    <span className="chat-typing__dot" />
                    <span className="chat-typing__dot" />
                  </div>
                  <span className="chat-typing__text">AI is thinking...</span>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="chat-error">
                  <p className="chat-error__heading">Something went wrong</p>
                  <p className="chat-error__body">
                    {error} &middot; Try again or check Settings.
                  </p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Input area */}
      <div className="chat-input">
        <div className="chat-input__row">
          <TextareaAutosize
            className="chat-input__textarea"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={
              isApiKeyConfigured
                ? 'Ask me anything about your music...'
                : 'Configure API key in Settings first'
            }
            disabled={isDisabled}
            minRows={1}
            maxRows={4}
          />
          <button
            className={`chat-input__send-btn ${canSend ? 'chat-input__send-btn--active' : 'chat-input__send-btn--disabled'}`}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            aria-disabled={!canSend}
          >
            <Icon name="ArrowUp" size={18} />
          </button>
        </div>
        <p className="chat-input__hint">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
