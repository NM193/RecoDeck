// TypeScript types for AI features

/**
 * Chat message in conversation history
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Generated playlist from AI
 */
export interface GeneratedPlaylist {
  name: string;
  description: string;
  track_ids: number[];
  reasoning: string;
}

/**
 * AI chat state
 */
export interface AIChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isGenerating: boolean;
  streamingMessage: string;
  pendingPlaylist: GeneratedPlaylist | null;
  error: string | null;
}
