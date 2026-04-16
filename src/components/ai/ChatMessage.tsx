// Individual chat message — user pill or assistant plain text with markdown

import Markdown from 'markdown-to-jsx'
import type { ChatMessage as ChatMessageType } from '../../types/ai'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__user-pill">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-msg chat-msg--assistant">
      <div className="chat-msg__assistant-text">
        <Markdown
          options={{
            overrides: {
              a: {
                props: {
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
              },
            },
          }}
        >
          {message.content}
        </Markdown>
      </div>
    </div>
  )
}
