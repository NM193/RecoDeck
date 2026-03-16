// ConversationList — left panel with New Chat button, conversation items, empty state

import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../Icon'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/ai'

interface ConversationListProps {
  conversations: Conversation[]
  currentConversationId: string | null
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
}

export function ConversationList({
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}: ConversationListProps) {
  return (
    <div className="chat-view__conversation-list">
      <div className="conv-list__header">
        <button
          className="conv-list__new-chat-btn"
          onClick={onNewChat}
          type="button"
        >
          <Icon name="Plus" size={16} />
          New Chat
        </button>
      </div>

      <div className="conv-list__items">
        {conversations.length === 0 ? (
          <div className="conv-list__empty">
            <Icon
              name="MessageCircle"
              size={32}
              className="conv-list__empty-icon"
            />
            <h2 className="conv-list__empty-heading">No conversations yet</h2>
            <p className="conv-list__empty-body">
              Start a new one to get going.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {conversations.map((conv) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ConversationItem
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={onSelectConversation}
                  onRename={onRenameConversation}
                  onDelete={onDeleteConversation}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
