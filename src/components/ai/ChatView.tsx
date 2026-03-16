// ChatView — full main-content AI chat view with conversation list + chat area

import { useEffect } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useAIStore } from '../../store/aiStore'
import { ConversationList } from './ConversationList'
import { ChatArea } from './ChatArea'
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
    sendMessage,
    clearPendingPlaylist,
  } = useAIStore()

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
    await sendMessage(message)
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
