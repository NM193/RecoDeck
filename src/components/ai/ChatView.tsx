// ChatView — full main-content AI chat view with conversation list + chat area

import { useEffect } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useAIStore } from '../../store/aiStore'
import { usePlayerStore } from '../../store/playerStore'
import { ConversationList } from './ConversationList'
import { ChatArea } from './ChatArea'
import type { SessionContext } from '../../types/ai'
import type { Track } from '../../types/track'
import './ChatView.css'

export function ChatView() {
  const {
    chatHistory,
    isGenerating,
    isApiKeyConfigured,
    error,
    pendingPlaylist,
    currentConversationId,
    conversations,
    checkApiKeyStatus,
    loadConversations,
    createNewConversation,
    loadConversation,
    deleteConversation,
    renameConversation,
    sendMessageV2,
    clearPendingPlaylist,
  } = useAIStore()

  const { currentTrack, queue, currentTrackIndex, applyQueueAction } = usePlayerStore()

  // On mount: check API key, load conversations, restore last active
  useEffect(() => {
    checkApiKeyStatus()
    loadConversations().then(() => {
      const savedId = localStorage.getItem('lastActiveConversationId')
      if (savedId) {
        loadConversation(savedId).catch(() => {
          localStorage.removeItem('lastActiveConversationId')
        })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = async () => {
    await createNewConversation()
  }

  const handleSelectConversation = async (id: string) => {
    await loadConversation(id)
  }

  const handleDeleteConversation = async (id: string) => {
    const confirmed = await confirm(
      'Delete this conversation and all its messages? This cannot be undone.',
    )
    if (confirmed) {
      await deleteConversation(id)
    }
  }

  const handleRenameConversation = async (id: string, title: string) => {
    await renameConversation(id, title)
  }

  const handleSendMessage = async (message: string) => {
    // Auto-create conversation if none active
    if (!currentConversationId) {
      await createNewConversation()
    }

    // Add user message to chat history via store before calling V2
    // sendMessageV2 reads the last user message from chatHistory, so we add it first
    useAIStore.getState().chatHistory // ensure we have the latest state
    useAIStore.setState((s) => ({
      chatHistory: [
        ...s.chatHistory,
        {
          role: 'user' as const,
          content: message,
          timestamp: new Date().toISOString(),
        },
      ],
    }))

    // Build SessionContext from current player state
    const buildTrackSummary = (track: Track) => ({
      id: track.id,
      title: track.title ?? track.file_path.split('/').pop() ?? 'Unknown',
      artist: track.artist ?? null,
      bpm: track.bpm ?? null,
      key: track.musical_key ?? null,
    })

    const sessionContext: SessionContext = {
      now_playing: currentTrack ? buildTrackSummary(currentTrack) : null,
      recent_queue: queue
        .slice(Math.max(0, currentTrackIndex - 2), currentTrackIndex + 5)
        .map(buildTrackSummary),
      active_playlist_id: null,
    }

    await sendMessageV2(sessionContext)

    // After sendMessageV2 completes, check lastActions for queue_tracks and apply
    const actions = useAIStore.getState().lastActions
    for (const action of actions) {
      if (action.tool_name === 'queue_tracks' && action.success && action.data) {
        const raw = action.data as Record<string, unknown>
        const mode = typeof raw['mode'] === 'string' ? raw['mode'] : 'append'
        const rawTracks = Array.isArray(raw['tracks']) ? raw['tracks'] as Record<string, unknown>[] : []
        const tracks: Track[] = rawTracks.map((t) => ({
          id: typeof t['id'] === 'number' ? t['id'] : 0,
          file_path: typeof t['file_path'] === 'string' ? t['file_path'] : '',
          file_hash: '',
          title: typeof t['title'] === 'string' ? t['title'] : undefined,
          artist: typeof t['artist'] === 'string' ? t['artist'] : undefined,
          bpm: typeof t['bpm'] === 'number' ? t['bpm'] : undefined,
          musical_key: typeof t['key'] === 'string' ? t['key'] : undefined,
          duration_ms: typeof t['duration_ms'] === 'number' ? t['duration_ms'] : undefined,
          play_count: 0,
          rating: 0,
        }))
        if (tracks.length > 0) {
          applyQueueAction(tracks, mode)
        }
      }
    }

    // Refresh conversation list to pick up auto-title
    await loadConversations()
  }

  return (
    <div className="chat-view">
      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      <ChatArea
        currentConversationId={currentConversationId}
        chatHistory={chatHistory}
        isGenerating={isGenerating}
        isApiKeyConfigured={isApiKeyConfigured}
        error={error}
        pendingPlaylist={pendingPlaylist}
        conversations={conversations}
        onSendMessage={handleSendMessage}
        onRenameConversation={handleRenameConversation}
        onCreatePlaylist={() => loadConversations()}
        onClearPendingPlaylist={clearPendingPlaylist}
      />
    </div>
  )
}
