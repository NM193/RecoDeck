import { create } from 'zustand';
import type { Track } from '../types/track';

interface PlayerState {
  // Current track
  currentTrack: Track | null;

  // Playback state
  isPlaying: boolean;
  position: number; // milliseconds
  duration: number; // milliseconds

  // Volume
  volume: number; // 0.0 to 1.0

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Queue management
  queue: Track[];
  currentTrackIndex: number; // -1 when no queue
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  originalQueue: Track[]; // Store original order before shuffle

  // Actions
  setCurrentTrack: (track: Track | null) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Queue actions
  setQueue: (tracks: Track[], startIndex?: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  setRepeatMode: (mode: 'off' | 'all' | 'one') => void;
  setShuffle: (enabled: boolean) => void;
  playTrackAtIndex: (index: number) => void;
}

const initialState = {
  currentTrack: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.7,
  isLoading: false,
  error: null,
  queue: [],
  currentTrackIndex: -1,
  repeatMode: 'off' as const,
  isShuffle: false,
  originalQueue: [],
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentTrack: (track) => set({ currentTrack: track }),

  setPosition: (position) => set({ position }),

  setDuration: (duration) => set({ duration }),

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),

  // Queue management
  setQueue: (tracks, startIndex = 0) => {
    console.log(`[PlayerStore] setQueue called: ${tracks.length} tracks, startIndex=${startIndex}`);
    if (startIndex >= 0 && startIndex < tracks.length) {
      console.log(`[PlayerStore] setQueue: track at index ${startIndex} is "${tracks[startIndex].title || tracks[startIndex].file_path}"`);
    } else {
      console.error(`[PlayerStore] setQueue: INVALID INDEX ${startIndex} for queue length ${tracks.length}`);
    }
    set({
      queue: [...tracks],
      originalQueue: [...tracks],
      currentTrackIndex: startIndex,
    });
  },

  playNext: () => {
    const state = get();
    const { queue, currentTrackIndex, repeatMode } = state;
    if (queue.length === 0) return;

    let nextIndex = currentTrackIndex + 1;

    // Handle end of queue
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0; // Wrap to start
      } else {
        return; // Stop at end
      }
    }

    set({ currentTrackIndex: nextIndex });
  },

  playPrevious: () => {
    const state = get();
    const { queue, currentTrackIndex } = state;
    if (queue.length === 0 || currentTrackIndex <= 0) return;

    set({ currentTrackIndex: currentTrackIndex - 1 });
  },

  setRepeatMode: (mode) => set({ repeatMode: mode }),

  setShuffle: (enabled) => {
    const state = get();
    if (enabled === state.isShuffle) return;

    if (enabled) {
      // Shuffle: randomize queue but keep current track at current position
      const currentTrack = state.queue[state.currentTrackIndex];
      const shuffled = [...state.queue];

      // Fisher-Yates shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Find current track in shuffled array and swap to current index
      if (currentTrack) {
        const newCurrentIndex = shuffled.findIndex(t => t.id === currentTrack.id);
        if (newCurrentIndex !== -1 && newCurrentIndex !== state.currentTrackIndex) {
          [shuffled[state.currentTrackIndex], shuffled[newCurrentIndex]] =
            [shuffled[newCurrentIndex], shuffled[state.currentTrackIndex]];
        }
      }

      set({ isShuffle: true, queue: shuffled });
    } else {
      // Unshuffle: restore original queue order, find current track position
      const currentTrack = state.queue[state.currentTrackIndex];
      const newIndex = currentTrack
        ? state.originalQueue.findIndex(t => t.id === currentTrack.id)
        : -1;

      set({
        isShuffle: false,
        queue: [...state.originalQueue],
        currentTrackIndex: newIndex !== -1 ? newIndex : state.currentTrackIndex,
      });
    }
  },

  playTrackAtIndex: (index) => {
    const state = get();
    if (index >= 0 && index < state.queue.length) {
      set({ currentTrackIndex: index });
    }
  },
}));
