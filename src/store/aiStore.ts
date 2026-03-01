import { create } from 'zustand'
import { getErrorMessage, isAppError } from '../types/ai'
import type { ChatMessage, GeneratedPlaylist } from '../types/ai'
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

  // Playlist generation
  pendingPlaylist: GeneratedPlaylist | null

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
  clearHistory: () => void
  setError: (error: string | null) => void

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
  pendingPlaylist: null,
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
      const response = await tauriApi.aiChat(message, chatHistory)

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
            const retryResponse = await tauriApi.aiChat(message, chatHistory)
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

  clearHistory: () => set({ chatHistory: [], error: null }),

  setError: (error) => set({ error }),

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
