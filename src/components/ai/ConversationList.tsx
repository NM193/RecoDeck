// ConversationList — left panel with New Chat button, conversation items, empty state

import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../Icon'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/ai'

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const last7 = today - 7 * 86400000

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    const ts = conv.created_at * 1000
    if (ts >= today) groups[0].items.push(conv)
    else if (ts >= yesterday) groups[1].items.push(conv)
    else if (ts >= last7) groups[2].items.push(conv)
    else groups[3].items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}

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
          <>
            {groupByDate(conversations).map((group) => (
              <div key={group.label}>
                <div className="conv-list__date-group">{group.label}</div>
                <AnimatePresence>
                  {group.items.map((conv) => (
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
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
