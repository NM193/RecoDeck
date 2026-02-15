// Main AI chat panel component - expandable chat interface

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { useAIStore } from '../../store/aiStore';
import { ChatMessage } from './ChatMessage';
import { FloatingButton } from './FloatingButton';
import { tauriApi } from '../../lib/tauri-api';

interface AIChatPanelProps {
  onPlaylistCreated?: (playlistId: number) => void;
}

export function AIChatPanel({ onPlaylistCreated }: AIChatPanelProps) {
  const {
    isOpen,
    setIsOpen,
    isApiKeyConfigured,
    checkApiKeyStatus,
    chatHistory,
    isGenerating,
    error,
    sendMessage,
    clearHistory,
    pendingPlaylist,
    generatePlaylist,
    clearPendingPlaylist,
  } = useAIStore();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check API key status on mount and when panel opens
  useEffect(() => {
    checkApiKeyStatus();
  }, [checkApiKeyStatus]);

  useEffect(() => {
    if (isOpen) {
      checkApiKeyStatus();
    }
  }, [isOpen, checkApiKeyStatus]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isGenerating]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;

    // Re-check API key status before sending
    await checkApiKeyStatus();

    const message = inputValue.trim();
    setInputValue('');

    // Detect if user is asking for a playlist
    const isPlaylistRequest = /create|make|generate|build.*playlist/i.test(message);

    if (isPlaylistRequest) {
      await generatePlaylist(message);
    } else {
      await sendMessage(message);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!pendingPlaylist) return;

    try {
      // Create playlist in database
      const playlist = await tauriApi.createPlaylist(pendingPlaylist.name, null);

      // Add tracks to playlist
      for (const trackId of pendingPlaylist.track_ids) {
        await tauriApi.addTrackToPlaylist(playlist.id!, trackId);
      }

      // Notify parent
      if (onPlaylistCreated && playlist.id) {
        onPlaylistCreated(playlist.id);
      }

      // Clear pending playlist
      clearPendingPlaylist();

      // Add success message to chat
      await sendMessage(`Great! Created playlist "${pendingPlaylist.name}" with ${pendingPlaylist.track_ids.length} tracks.`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  if (!isOpen) {
    return <FloatingButton onClick={() => setIsOpen(true)} />;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-28 right-8 z-50 w-[420px] h-[650px] rounded-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(31, 41, 55, 0.95) 100%)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.9), 0 0 60px rgba(6, 182, 212, 0.4), 0 0 30px rgba(59, 130, 246, 0.3)',
        }}
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
            boxShadow: '0 4px 20px rgba(6, 182, 212, 0.3)',
          }}
        >
          {/* Animated background shimmer */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              animation: 'shimmer 3s infinite',
            }}
          />
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <h3 className="font-semibold">AI Playlist Assistant</h3>
          </div>
          <div className="flex items-center gap-2">
            {chatHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Clear chat history"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin scrollbar-thumb-blue-500/50 scrollbar-track-gray-800/30"
          style={{
            background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
          }}
        >
          {!isApiKeyConfigured && (
            <div
              className="rounded-xl p-5 text-yellow-200 text-sm border border-yellow-500/40"
              style={{
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(202, 138, 4, 0.15) 100%)',
                boxShadow: '0 4px 15px rgba(234, 179, 8, 0.2)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <p className="font-bold">API Key Required</p>
              </div>
              <p className="opacity-90">Please configure your Claude API key in Settings to use the AI assistant.</p>
            </div>
          )}

          {chatHistory.length === 0 && isApiKeyConfigured && (
            <div className="text-center text-gray-400 py-8">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm">Ask me to create a playlist!</p>
              <p className="text-xs mt-2 opacity-75">
                Try: "Create a Sunday chill playlist"
              </p>
            </div>
          )}

          {chatHistory.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}

          {isGenerating && (
            <div className="flex items-center gap-3 text-blue-300 text-sm px-4 py-3 rounded-xl" style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.15) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce shadow-lg" style={{ animationDelay: '0ms', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce shadow-lg" style={{ animationDelay: '150ms', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce shadow-lg" style={{ animationDelay: '300ms', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
              </div>
              <span className="font-medium">AI is thinking...</span>
            </div>
          )}

          {error && (
            <div
              className="rounded-xl p-4 text-red-200 text-sm border border-red-500/40"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.15) 100%)',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <p className="font-bold">Error</p>
              </div>
              <p className="opacity-90">{error}</p>
            </div>
          )}

          {pendingPlaylist && (
            <div
              className="rounded-xl p-5 border border-green-500/40"
              style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.15) 100%)',
                boxShadow: '0 4px 20px rgba(34, 197, 94, 0.25)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
                <p className="text-green-200 font-bold text-lg">{pendingPlaylist.name}</p>
              </div>
              <p className="text-gray-200 text-sm mb-3 leading-relaxed">{pendingPlaylist.description}</p>
              <div className="flex items-center gap-2 text-gray-300 text-xs mb-4 bg-black/20 rounded-lg px-3 py-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <span className="font-semibold">{pendingPlaylist.track_ids.length} tracks</span>
                <span className="opacity-60">•</span>
                <span className="opacity-90">{pendingPlaylist.reasoning}</span>
              </div>
              <button
                onClick={handleCreatePlaylist}
                className="w-full py-3 text-white rounded-xl transition-all text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                }}
              >
                ✨ Create Playlist
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="p-5"
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
            borderTop: '1px solid rgba(6, 182, 212, 0.3)',
            boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="flex items-end gap-2">
            <TextareaAutosize
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isApiKeyConfigured
                  ? 'Ask me to create a playlist...'
                  : 'Configure API key in Settings first'
              }
              disabled={!isApiKeyConfigured || isGenerating}
              className="flex-1 text-white rounded-xl px-5 py-3 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] max-h-32 transition-all"
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.3)',
              }}
              minRows={1}
              maxRows={4}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || !isApiKeyConfigured || isGenerating}
              className="p-3 text-white rounded-xl transition-all disabled:cursor-not-allowed"
              style={{
                background: !inputValue.trim() || !isApiKeyConfigured || isGenerating
                  ? 'rgba(75, 85, 99, 0.5)'
                  : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                boxShadow: !inputValue.trim() || !isApiKeyConfigured || isGenerating
                  ? 'none'
                  : '0 4px 15px rgba(6, 182, 212, 0.4)',
              }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
