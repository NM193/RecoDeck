// Floating AI chat button - appears in bottom-right corner when chat is closed

import { motion } from 'framer-motion';
import { Icon } from '../Icon';

interface FloatingButtonProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function FloatingButton({ onClick, hasUnread = false }: FloatingButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-28 right-8 z-50 w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center group"
      style={{
        boxShadow: '0 0 60px rgba(6, 182, 212, 0.8), 0 0 30px rgba(59, 130, 246, 0.6), 0 10px 40px rgba(0, 0, 0, 0.5)',
        border: '3px solid rgba(255, 255, 255, 0.3)',
      }}
      initial={{ scale: 0, opacity: 0, rotate: -180 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0, rotate: 180 }}
      whileHover={{
        scale: 1.15,
        boxShadow: '0 0 80px rgba(6, 182, 212, 1), 0 0 40px rgba(59, 130, 246, 0.8), 0 15px 50px rgba(0, 0, 0, 0.6)',
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      title="Open AI Assistant (Cmd+K)"
    >
      {/* AI Sparkle Icon */}
      <Icon name="Sparkles" size={40} className="text-white drop-shadow-lg" />

      {/* Unread badge */}
      {hasUnread && (
        <motion.div
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}

      {/* Pulse animation */}
      <motion.div
        className="absolute inset-0 rounded-full bg-blue-400 opacity-75"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </motion.button>
  );
}
