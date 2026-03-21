// TypeScript types for AI features

/**
 * Chat message in conversation history
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

/**
 * Generated playlist from AI
 */
export interface GeneratedPlaylist {
  name: string
  description: string
  track_ids: number[]
  reasoning: string
}

/**
 * Energy direction for AI seed-track playlist generation.
 */
export type EnergyDirection = 'build_up' | 'maintain' | 'wind_down'

/**
 * Result from AI track recommendation commands.
 */
export interface RecommendationResult {
  track_ids: number[]
  reasoning: string
}

/**
 * AI-optimized track order for key-compatible mixing.
 */
export interface RecommendedOrder {
  track_ids: number[]
  reasoning: string
}

/**
 * Conversation summary returned by list_conversations
 */
export interface Conversation {
  id: string
  title: string
  created_at: number
}

/**
 * Message from a conversation returned by get_conversation_messages
 */
export interface ConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

/**
 * AI chat state
 */
export interface AIChatState {
  isOpen: boolean
  messages: ChatMessage[]
  isGenerating: boolean
  streamingMessage: string
  pendingPlaylist: GeneratedPlaylist | null
  error: string | null
}

/**
 * Structured error from Tauri backend.
 * Matches the Rust AppError enum serialized with #[serde(tag = "kind", content = "message")].
 * Unit variants (AiNoApiKey, AiInvalidKey) have no message field.
 */
export type AppErrorKind =
  | 'Database'
  | 'NotFound'
  | 'AiNoApiKey'
  | 'AiInvalidKey'
  | 'AiNetwork'
  | 'AiParsing'
  | 'Internal'
  | 'Validation'

export interface AppError {
  kind: AppErrorKind
  message?: string
}

/**
 * Type guard: checks if an unknown catch value is a structured AppError.
 * Tauri IPC catch blocks receive either a string or an AppError object.
 */
export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'kind' in e
}

export interface ActionResult {
  tool_name: string;
  success: boolean;
  summary: string;
  data?: Record<string, unknown>;
}

export interface ChatV2Response {
  text: string;
  actions: ActionResult[];
}

export interface SessionContext {
  now_playing: TrackSummary | null;
  recent_queue: TrackSummary[];
  active_playlist_id: number | null;
}

export interface TrackSummary {
  id: number;
  title: string;
  artist: string | null;
  bpm: number | null;
  key: string | null;
}

/**
 * Extract a user-friendly error message from any Tauri error.
 * Falls back to generic message if the error shape is unexpected.
 */
export function getErrorMessage(e: unknown): string {
  if (isAppError(e)) {
    // Unit variants without message field -- use kind as the message source
    switch (e.kind) {
      case 'AiNoApiKey':
        return 'No API key configured -- add your Claude API key in Settings'
      case 'AiInvalidKey':
        return 'API key is invalid -- check your key in Settings'
      default:
        return e.message ?? 'An unexpected error occurred'
    }
  }
  if (typeof e === 'string') return e
  return 'An unexpected error occurred'
}
