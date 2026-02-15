// Individual chat message component with markdown rendering

import Markdown from 'markdown-to-jsx';
import type { ChatMessage as ChatMessageType } from '../../types/ai';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 shadow-lg ${
          isUser
            ? 'text-white'
            : 'text-gray-100 border border-blue-500/20'
        }`}
        style={
          isUser
            ? {
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
              }
            : {
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), 0 0 20px rgba(59, 130, 246, 0.1)',
              }
        }
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
            <Markdown
              options={{
                overrides: {
                  a: {
                    props: {
                      className: 'text-blue-400 hover:text-blue-300 underline',
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    },
                  },
                  code: {
                    props: {
                      className: 'bg-gray-800 px-1 py-0.5 rounded text-xs font-mono',
                    },
                  },
                  pre: {
                    props: {
                      className: 'bg-gray-800 p-3 rounded mt-2 overflow-x-auto',
                    },
                  },
                },
              }}
            >
              {message.content}
            </Markdown>
          </div>
        )}

        {message.timestamp && (
          <p className="text-xs opacity-70 mt-2 font-medium">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
