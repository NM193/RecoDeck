// AI Chat integrated into the player bar
// Expandable chat that slides up from the bottom

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { useAIStore } from '../../store/aiStore';
import { ChatMessage } from './ChatMessage';
import { tauriApi } from '../../lib/tauri-api';
import { Icon } from '../Icon';

interface PlayerAIChatProps {
  onPlaylistCreated?: (playlistId: number) => void;
}

export function PlayerAIChat({ onPlaylistCreated }: PlayerAIChatProps) {
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
  const [playlistName, setPlaylistName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check API key status on mount
  useEffect(() => {
    checkApiKeyStatus();
  }, [checkApiKeyStatus]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isGenerating]);

  // Handle keyboard shortcuts (Cmd+K / Ctrl+K to toggle, Escape to close)
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

  const handleShowNamePrompt = () => {
    if (!pendingPlaylist) return;
    setPlaylistName(pendingPlaylist.name);
    setShowNamePrompt(true);
  };

  const handleCreatePlaylist = async () => {
    if (!pendingPlaylist) return;

    const finalName = playlistName.trim() || pendingPlaylist.name;
    setShowNamePrompt(false);

    try {
      // Create playlist in database
      const playlist = await tauriApi.createPlaylist(finalName, null);

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
      await sendMessage(`Great! Created playlist "${finalName}" with ${pendingPlaylist.track_ids.length} tracks.`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ai-chat-toggle"
        style={{
          position: 'absolute',
          right: '20px',
          bottom: '80px',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.6), 0 4px 15px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          zIndex: 100,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 0 40px rgba(6, 182, 212, 0.8), 0 6px 20px rgba(0, 0, 0, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.6), 0 4px 15px rgba(0, 0, 0, 0.4)';
        }}
        title="AI Assistant (Cmd+K)"
      >
        <Icon name="Sparkles" size={28} className="text-white" />
      </button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="player-ai-chat-panel"
            style={{
              position: 'absolute',
              bottom: '80px',
              right: '20px',
              width: '450px',
              height: '500px',
              background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.98) 0%, rgba(31, 41, 55, 0.98) 100%)',
              border: '2px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(6, 182, 212, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backdropFilter: 'blur(20px)',
              zIndex: 99,
            }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'white',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
                <Icon name="Zap" size={20} strokeWidth={2} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>AI Playlist Assistant</h3>
              </div>
              <div style={{ display: 'flex', gap: '8px', zIndex: 1 }}>
                {chatHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    title="Clear chat history"
                  >
                    <Icon name="Trash2" size={16} strokeWidth={2} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                >
                  <Icon name="X" size={18} strokeWidth={2} />
                </button>
              </div>
              {/* Shimmer effect */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                  animation: 'shimmer 3s infinite',
                  opacity: 0.3,
                }}
              />
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
              }}
            >
              {!isApiKeyConfigured && (
                <div
                  style={{
                    borderRadius: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(202, 138, 4, 0.15) 100%)',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    boxShadow: '0 4px 15px rgba(234, 179, 8, 0.2)',
                    color: '#fef08a',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}>
                    <Icon name="CircleAlert" size={20} />
                    <span>API Key Required</span>
                  </div>
                  <p style={{ margin: 0, opacity: 0.9 }}>Please configure your Claude API key in Settings to use the AI assistant.</p>
                </div>
              )}

              {chatHistory.length === 0 && isApiKeyConfigured && (
                <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '60px' }}>
                  <Icon name="MessageCircle" size={64} strokeWidth={1.5} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                  <p style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Ask me to create a playlist!</p>
                  <p style={{ fontSize: '12px', opacity: 0.75, margin: 0 }}>
                    Try: "Create a Sunday chill playlist"
                  </p>
                </div>
              )}

              {chatHistory.map((message, index) => (
                <ChatMessage key={index} message={message} />
              ))}

              {isGenerating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.15) 100%)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', fontSize: '14px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', background: '#60a5fa', borderRadius: '50%', animation: 'bounce 1s infinite', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
                    <span style={{ width: '10px', height: '10px', background: '#60a5fa', borderRadius: '50%', animation: 'bounce 1s infinite 0.15s', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
                    <span style={{ width: '10px', height: '10px', background: '#60a5fa', borderRadius: '50%', animation: 'bounce 1s infinite 0.3s', boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)' }} />
                  </div>
                  <span style={{ fontWeight: 500 }}>AI is thinking...</span>
                </div>
              )}

              {error && (
                <div style={{ borderRadius: '12px', padding: '16px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.15) 100%)', border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '14px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}>
                    <Icon name="CircleAlert" size={20} />
                    <span>Error</span>
                  </div>
                  <p style={{ margin: 0, opacity: 0.9 }}>{error}</p>
                </div>
              )}

              {pendingPlaylist && (
                <div style={{ borderRadius: '12px', padding: '20px', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.15) 100%)', border: '1px solid rgba(34, 197, 94, 0.4)', boxShadow: '0 4px 20px rgba(34, 197, 94, 0.25)', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Icon name="CircleCheck" size={24} style={{ color: '#4ade80' }} />
                    <p style={{ color: '#86efac', fontWeight: 'bold', fontSize: '16px', margin: 0 }}>{pendingPlaylist.name}</p>
                  </div>
                  <p style={{ color: '#d1d5db', fontSize: '14px', marginBottom: '12px', lineHeight: '1.5' }}>{pendingPlaylist.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#d1d5db', marginBottom: '16px' }}>
                    <Icon name="Music" size={16} />
                    <span style={{ fontWeight: 600 }}>{pendingPlaylist.track_ids.length} tracks</span>
                    <span style={{ opacity: 0.6 }}>•</span>
                    <span style={{ opacity: 0.9 }}>{pendingPlaylist.reasoning}</span>
                  </div>

                  {/* Playlist name input */}
                  {showNamePrompt ? (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', color: '#86efac', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Playlist Name</label>
                      <input
                        type="text"
                        value={playlistName}
                        onChange={(e) => setPlaylistName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreatePlaylist();
                          if (e.key === 'Escape') setShowNamePrompt(false);
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(34, 197, 94, 0.5)',
                          borderRadius: '8px',
                          color: 'white',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button
                          onClick={handleCreatePlaylist}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Create
                        </button>
                        <button
                          onClick={() => setShowNamePrompt(false)}
                          style={{
                            padding: '10px 16px',
                            background: 'rgba(107, 114, 128, 0.3)',
                            border: '1px solid rgba(107, 114, 128, 0.5)',
                            borderRadius: '8px',
                            color: '#d1d5db',
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleShowNamePrompt}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        border: 'none',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(34, 197, 94, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(34, 197, 94, 0.4)';
                      }}
                    >
                      Create Playlist
                    </button>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '16px 20px', background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)', borderTop: '1px solid rgba(6, 182, 212, 0.3)', boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.5)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <TextareaAutosize
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={isApiKeyConfigured ? 'Ask me to create a playlist...' : 'Configure API key in Settings first'}
                  disabled={!isApiKeyConfigured || isGenerating}
                  minRows={1}
                  maxRows={3}
                  style={{
                    flex: 1,
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: 'white',
                    fontSize: '14px',
                    resize: 'none',
                    outline: 'none',
                    boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.3)',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !isApiKeyConfigured || isGenerating}
                  style={{
                    padding: '12px',
                    background: !inputValue.trim() || !isApiKeyConfigured || isGenerating ? 'rgba(75, 85, 99, 0.5)' : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: !inputValue.trim() || !isApiKeyConfigured || isGenerating ? 'not-allowed' : 'pointer',
                    boxShadow: !inputValue.trim() || !isApiKeyConfigured || isGenerating ? 'none' : '0 4px 15px rgba(6, 182, 212, 0.4)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="Send" size={24} strokeWidth={2.5} style={{ color: 'white' }} />
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '8px 0 0 0' }}>Press Enter to send, Shift+Enter for new line</p>
            </div>

            <style>{`
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
