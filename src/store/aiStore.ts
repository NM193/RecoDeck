import { create } from 'zustand';
import type { ChatMessage, GeneratedPlaylist } from '../types/ai';
import { tauriApi } from '../lib/tauri-api';

interface AIState {
  // UI state
  isOpen: boolean;
  isApiKeyConfigured: boolean;

  // Chat state
  chatHistory: ChatMessage[];
  isGenerating: boolean;
  streamingMessage: string;
  error: string | null;

  // Playlist generation
  pendingPlaylist: GeneratedPlaylist | null;

  // Actions
  setIsOpen: (isOpen: boolean) => void;
  checkApiKeyStatus: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;

  // Chat actions
  sendMessage: (message: string) => Promise<void>;
  clearHistory: () => void;
  setError: (error: string | null) => void;

  // Playlist actions
  generatePlaylist: (prompt: string) => Promise<void>;
  clearPendingPlaylist: () => void;
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

  // UI actions
  setIsOpen: (isOpen) => set({ isOpen }),

  // API key management
  checkApiKeyStatus: async () => {
    try {
      console.log('[AI Store] Checking API key status...');
      const isConfigured = await tauriApi.getAIApiKeyStatus();
      console.log('[AI Store] API key status result:', isConfigured);
      set({ isApiKeyConfigured: isConfigured });
    } catch (error) {
      console.error('[AI Store] Failed to check API key status:', error);
      set({ isApiKeyConfigured: false });
    }
  },

  setApiKey: async (key: string) => {
    try {
      console.log('[AI Store] Saving API key (length:', key.length, ')...');
      await tauriApi.setAIApiKey(key);
      console.log('[AI Store] API key saved successfully, setting isApiKeyConfigured=true');
      set({ isApiKeyConfigured: true, error: null });
    } catch (error) {
      console.error('[AI Store] Failed to save API key:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteApiKey: async () => {
    try {
      await tauriApi.deleteAIApiKey();
      set({ isApiKeyConfigured: false, error: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
      throw error;
    }
  },

  // Chat actions
  sendMessage: async (message: string) => {
    const { chatHistory, isApiKeyConfigured } = get();
    console.log('[AI Store] sendMessage called, isApiKeyConfigured:', isApiKeyConfigured);

    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    set({
      chatHistory: [...chatHistory, userMessage],
      isGenerating: true,
      error: null,
    });

    try {
      // Send to AI
      console.log('[AI Store] Calling tauriApi.aiChat...');
      const response = await tauriApi.aiChat(message, chatHistory);

      // Add assistant response to history
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        chatHistory: [...state.chatHistory, assistantMessage],
        isGenerating: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({
        error: errorMessage,
        isGenerating: false,
      });
    }
  },

  clearHistory: () => set({ chatHistory: [], error: null }),

  setError: (error) => set({ error }),

  // Playlist generation
  generatePlaylist: async (prompt: string) => {
    set({ isGenerating: true, error: null, pendingPlaylist: null });

    try {
      const playlist = await tauriApi.aiGeneratePlaylist(prompt);
      set({
        pendingPlaylist: playlist,
        isGenerating: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({
        error: errorMessage,
        isGenerating: false,
      });
    }
  },

  clearPendingPlaylist: () => set({ pendingPlaylist: null }),
}));
