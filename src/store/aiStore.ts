import { create } from 'zustand'
import { getErrorMessage, isAppError } from '../types/ai'
import type { ChatMessage, ChatV2Response, ActionResult, SessionContext, GeneratedPlaylist, Conversation, ConversationMessage } from '../types/ai'
import { tauriApi } from '../lib/tauri-api'

interface AIState {
  // UI state
  isOpen: boolean
  isApiKeyConfigured: boolean

  // Chat state
  chatHistory: ChatMessage[]
  isGenerating: boolean
  streamingMessage: string
  error: string | null

  // Conversation state
  currentConversationId: string | null
  conversations: Conversation[]

  // Playlist generation
  pendingPlaylist: GeneratedPlaylist | null

  // V2 action results
  lastActions: ActionResult[]

  // Settings navigation callback
  openSettingsCallback: (() => void) | null
  registerOpenSettings: (callback: () => void) => void

  // Actions
  setIsOpen: (isOpen: boolean) => void
  checkApiKeyStatus: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  deleteApiKey: () => Promise<void>

  // Chat actions
  sendMessage: (message: string) => Promise<void>
  sendMessageV2: (sessionContext?: SessionContext) => Promise<void>
  clearHistory: () => void
  setError: (error: string | null) => void

  // Conversation actions
  loadConversations: () => Promise<void>
  createNewConversation: () => Promise<void>
  loadConversation: (conversationId: string) => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
  renameConversation: (conversationId: string, title: string) => Promise<void>
  setCurrentConversationId: (id: string | null) => void

  // Playlist actions
  generatePlaylist: (prompt: string) => Promise<void>
  clearPendingPlaylist: () => void
}

export const useAIStore = create<AIState>((set, get) => ({
  // Initial state
  isOpen: false,
  isApiKeyConfigured: false,
  chatHistory: [],
  isGenerating: false,
  streamingMessage: '',
  error: null,
  currentConversationId: null,
  conversations: [],
  pendingPlaylist: null,
  lastActions: [],
  openSettingsCallback: null,

  // UI actions
  setIsOpen: (isOpen) => set({ isOpen }),

  // Settings callback registration
  registerOpenSettings: (callback) => set({ openSettingsCallback: callback }),

  // API key management
  checkApiKeyStatus: async () => {
    try {
      console.log('[AI Store] Checking API key status...')
      const isConfigured = await tauriApi.getAIApiKeyStatus()
      console.log('[AI Store] API key status result:', isConfigured)
      set({ isApiKeyConfigured: isConfigured })
    } catch (e) {
      console.error('[AI Store] Failed to check API key status:', e)
      set({ isApiKeyConfigured: false })
    }
  },

  setApiKey: async (key: string) => {
    try {
      console.log('[AI Store] Saving API key (length:', key.length, ')...')
      await tauriApi.setAIApiKey(key)
      console.log(
        '[AI Store] API key saved successfully, setting isApiKeyConfigured=true',
      )
      set({ isApiKeyConfigured: true, error: null })
    } catch (e) {
      console.error('[AI Store] Failed to save API key:', e)
      set({ error: getErrorMessage(e) })
      throw e
    }
  },

  deleteApiKey: async () => {
    try {
      await tauriApi.deleteAIApiKey()
      set({ isApiKeyConfigured: false, error: null })
    } catch (e) {
      set({ error: getErrorMessage(e) })
      throw e
    }
  },

  // Chat actions
  sendMessage: async (message: string) => {
    const { chatHistory } = get()
    console.log('[AI Store] sendMessage called')

    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }

    set({
      chatHistory: [...chatHistory, userMessage],
      isGenerating: true,
      error: null,
    })

    try {
      // Send to AI
      console.log('[AI Store] Calling tauriApi.aiChat...')
      const response = await tauriApi.aiChat(message, chatHistory, get().currentConversationId ?? undefined)

      // Add assistant response to history
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      }

      set((state) => ({
        chatHistory: [...state.chatHistory, assistantMessage],
        isGenerating: false,
      }))

      // Refresh conversations list to pick up auto-title changes
      get().loadConversations()
    } catch (e) {
      if (
        isAppError(e) &&
        e.kind === 'AiNetwork' &&
        e.message?.includes('Rate limited')
      ) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          set({
            error: `Rate limited \u2014 retrying in 30 seconds... (attempt ${attempt}/2)`,
          })
          await new Promise((resolve) => setTimeout(resolve, 30_000))
          try {
            const retryResponse = await tauriApi.aiChat(message, chatHistory, get().currentConversationId ?? undefined)
            const retryAssistantMessage: ChatMessage = {
              role: 'assistant',
              content: retryResponse,
              timestamp: new Date().toISOString(),
            }
            set((state) => ({
              chatHistory: [...state.chatHistory, retryAssistantMessage],
              isGenerating: false,
              error: null,
            }))
            get().loadConversations()
            return
          } catch (retryErr) {
            if (attempt === 2) {
              set({ error: getErrorMessage(retryErr), isGenerating: false })
            }
          }
        }
      } else {
        set({ error: getErrorMessage(e), isGenerating: false })
      }
    }
  },

  sendMessageV2: async (sessionContext?: SessionContext) => {
    const state = get();
    const lastMsg = state.chatHistory[state.chatHistory.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return;

    set({ isGenerating: true, error: null, lastActions: [] });

    try {
      const response: ChatV2Response = await tauriApi.aiChatV2(
        lastMsg.content,
        state.currentConversationId!,
        sessionContext,
      );

      set((s) => ({
        chatHistory: [
          ...s.chatHistory,
          {
            role: 'assistant' as const,
            content: response.text,
            timestamp: new Date().toISOString(),
          },
        ],
        isGenerating: false,
        lastActions: response.actions,
      }));

      get().loadConversations();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ isGenerating: false, error: errorMessage });
    }
  },

  clearHistory: () => {
    set({ chatHistory: [], error: null, currentConversationId: null })
    localStorage.removeItem('lastActiveConversationId')
  },

  setError: (error) => set({ error }),

  // Conversation actions
  loadConversations: async () => {
    try {
      const conversations = await tauriApi.listConversations()
      set({ conversations })
    } catch (e) {
      console.error('[AI Store] Failed to load conversations:', e)
    }
  },

  createNewConversation: async () => {
    try {
      const conversation = await tauriApi.createConversation()
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        currentConversationId: conversation.id,
        chatHistory: [],
        error: null,
      }))
      localStorage.setItem('lastActiveConversationId', conversation.id)
    } catch (e) {
      console.error('[AI Store] Failed to create conversation:', e)
      set({ error: getErrorMessage(e) })
    }
  },

  loadConversation: async (conversationId: string) => {
    try {
      const messages = await tauriApi.getConversationMessages(conversationId)
      const chatHistory: ChatMessage[] = messages.map((m: ConversationMessage) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at * 1000).toISOString(),
      }))
      set({ chatHistory, currentConversationId: conversationId, error: null })
      localStorage.setItem('lastActiveConversationId', conversationId)
    } catch (e) {
      console.error('[AI Store] Failed to load conversation:', e)
      set({ error: getErrorMessage(e) })
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      const isActive = conversationId === get().currentConversationId
      await tauriApi.deleteConversation(conversationId)
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        ...(isActive ? { currentConversationId: null, chatHistory: [] } : {}),
      }))
      if (isActive) {
        localStorage.removeItem('lastActiveConversationId')
      }
    } catch (e) {
      console.error('[AI Store] Failed to delete conversation:', e)
      set({ error: getErrorMessage(e) })
    }
  },

  renameConversation: async (conversationId: string, title: string) => {
    try {
      await tauriApi.renameConversation(conversationId, title)
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, title } : c,
        ),
      }))
    } catch (e) {
      console.error('[AI Store] Failed to rename conversation:', e)
      set({ error: getErrorMessage(e) })
    }
  },

  setCurrentConversationId: (id) => set({ currentConversationId: id }),

  // Playlist generation
  generatePlaylist: async (prompt: string) => {
    set({ isGenerating: true, error: null, pendingPlaylist: null })

    try {
      const playlist = await tauriApi.aiGeneratePlaylist(prompt)
      set({
        pendingPlaylist: playlist,
        isGenerating: false,
      })
    } catch (e) {
      if (
        isAppError(e) &&
        e.kind === 'AiNetwork' &&
        e.message?.includes('Rate limited')
      ) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          set({
            error: `Rate limited \u2014 retrying in 30 seconds... (attempt ${attempt}/2)`,
          })
          await new Promise((resolve) => setTimeout(resolve, 30_000))
          try {
            const retryPlaylist = await tauriApi.aiGeneratePlaylist(prompt)
            set({
              pendingPlaylist: retryPlaylist,
              isGenerating: false,
              error: null,
            })
            return
          } catch (retryErr) {
            if (attempt === 2) {
              set({ error: getErrorMessage(retryErr), isGenerating: false })
            }
          }
        }
      } else {
        set({ error: getErrorMessage(e), isGenerating: false })
      }
    }
  },

  clearPendingPlaylist: () => set({ pendingPlaylist: null }),
}))
