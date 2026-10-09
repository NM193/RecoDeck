# Interactions I3a: Motion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every transition in the app on the spec's three durations and one easing — `--motion-fast` 120ms, `--motion-base` 180ms, `--motion-slow` 240ms, `--ease` — and reduced motion respected everywhere: in CSS by shortening the tokens, in framer-motion through `MotionConfig`.

**Architecture:**
- **CSS**: 98 `transition:` / one-shot `animation:` declarations in 21 files change only their duration and easing (property lists and formatting stay). The role decides the token: hover, press, colour, border, opacity → fast; chevrons, switches, collapsing (the sidebar's width, the bar's height) and a modal, flyout or menu opening → base; panels (the playlist header shrinking) and progress fills → slow. Every easing becomes `var(--ease)`.
- **Kept**: looping animations (`… infinite`: spinners, shimmers, the equalizer, pulses) — not transitions; the two players' seek fill, `width 0.05s linear`, which follows the playhead (a comment says so); `transition: none`.
- **Reduced motion**: `globals.css` sets `--motion-base` and `--motion-slow` to `var(--motion-fast)` under `prefers-reduced-motion: reduce`; the menus, toasts and the shortcuts sheet already swap their movement for a fade in their own rules, and now so do the old modal (`.modal-content`, which slid in) and the AI context menu (which grew); the rail's flyout only fades already.
- **framer-motion**: its literal durations use `MOTION` / `EASE` from `src/lib/motion.ts` (the page fade, a sidebar section collapsing, the expanded now-playing view, and the AI panels); `MotionConfig reducedMotion="user"` around App makes every framer animation drop movement and keep fades when the system asks.

**Tech Stack:** CSS custom properties, framer-motion, React 19.

**Spec:** `docs/superpowers/specs/2026-10-04-interactions-design.md` — "Motion" ("Every existing `transition:` in the CSS moves to these tokens"), I1's and I2's notes. I3 becomes two plans: **I3a** (this) and **I3b** (controls and loading).

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 5 writes them into the spec):
- **I3 is split** into I3a (motion: mechanical, every stylesheet) and I3b (controls and loading: `.btn--icon`, `.btn--pill`, `Button` with its working state, the Settings / DJ pages / modals sweep, `Skeleton`), so each diff stays reviewable.
- **One-shot `animation:`s** (a modal's fade-in and slide-in, the rail's flyout, the AI context menu) count as "a menu or popover opening": base.
- **Progress fills** (scanning, analysis, export, the update download) are slow: they smooth a value's steps, like a panel. The seek fill is the exception (above).
- **The sidebar's width** when it collapses (`.app-shell` while `.sidebar-width-animating`, 150ms) and the bar's height (`min-height`, 150ms) are "a section collapsing": base.
- **The AI panels** (not shown in this build, `AI_ENABLED = false`) follow the same rules, so the rule has no exceptions left in the code.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `ce1ee35`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` passes at every task's end.
- **Builds and tests:**
  - No Rust change; no new test (CSS and framer props). `vitest` stays at 663: 662 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`).
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline; `vite build` passes.
  - After it, the only literal durations left in `src/**/*.css` are the looping animations and the two seek fills.
- **In WebKit** (the I2 test page: the real Sidebar and TrackTable), computed styles: a folder row `background-color 0.12s cubic-bezier(0.2, 0, 0, 1)`, a section's chevron `transform 0.18s …`, a nav item `background, color 0.12s …`, the track table's search box `border-color 0.12s …`; with reduced motion emulated the chevron is `0.12s`; a Playlists section still collapses and opens (framer), with no error, in both.

**Reviewed:** an independent review found no blocker or should-fix point. Folded in: under reduced motion the old modal still slid and the AI context menu still grew (the tokens only shortened them) → both fade instead, and `globals.css`'s comment says where movement goes. Noted, not changed: a few durations move a little (the sidebar's width 150 → 180ms, the old modal's fade 150 → 180ms, the playlist header 300 → 240ms), within the spec's roles.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/styles/globals.css` | modify | the tokens under reduced motion |
| `src/App.tsx` | modify | `MotionConfig`; the page fade on the tokens |
| `src/components/layout/Sidebar.tsx`, `NowPlayingBar.tsx`, `src/components/ai/*.tsx` (5) | modify | framer durations on `MOTION` / `EASE` |
| 21 stylesheets (Tasks 2–4) | modify | transitions on the tokens |
| `docs/superpowers/specs/2026-10-04-interactions-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `ce1ee35`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 662 passed (663)`; `npx tsc --noEmit -p .`: no errors; `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: Reduced motion, and framer-motion on the tokens

**Files:** Modify `src/styles/globals.css`, `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/NowPlayingBar.tsx`, `src/components/ai/ConversationList.tsx`, `src/components/ai/MixPrepPanel.tsx`, `src/components/ai/ChatArea.tsx`, `src/components/ai/RecommendationsPanel.tsx`, `src/components/ai/AIPlaylistDialog.tsx`.

- [ ] **Step 1: The tokens under reduced motion**

In `src/styles/globals.css`, replace

```css
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}

/* Midnight theme - Spotify warm blacks (default) */
:root[data-theme='midnight'] {
  /* Base backgrounds -- Spotify warm blacks, not blue-tinted */
  --bg-primary: #121212;
  --bg-secondary: #181818;
  --bg-tertiary: #282828;
```

with

```css
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}

/* Reduced motion: nothing takes longer than fast. What moves as it appears
   (menus, toasts, dialogs, the shortcuts sheet) fades instead, in its own
   rule; framer-motion drops movement through App's MotionConfig. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-base: var(--motion-fast);
    --motion-slow: var(--motion-fast);
  }
}

/* Midnight theme - Spotify warm blacks (default) */
:root[data-theme='midnight'] {
  /* Base backgrounds -- Spotify warm blacks, not blue-tinted */
  --bg-primary: #121212;
  --bg-secondary: #181818;
  --bg-tertiary: #282828;
```

- [ ] **Step 2: App — `MotionConfig`, the page fade**

In `src/App.tsx`, replace

```tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
```

with

```tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
```

In `src/App.tsx`, replace

```tsx
  Playlist,
  LibraryFolder,
  MoveReport,
  AnalysisProgressEvent,
  AnalysisCompleteEvent,
} from './types/track'
import './App.css'
import './components/TrackTable.css'

const AI_ENABLED = false

type PromptAction =
```

with

```tsx
  Playlist,
  LibraryFolder,
  MoveReport,
  AnalysisProgressEvent,
  AnalysisCompleteEvent,
} from './types/track'
import { EASE, MOTION } from './lib/motion'
import './App.css'
import './components/TrackTable.css'

const AI_ENABLED = false

type PromptAction =
```

In `src/App.tsx`, replace

```tsx
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (hash === '#mini-player') {
    return <MiniPlayer />
  }

  return <AppContent />
}

function AppContent() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  // True once initDatabase has succeeded. `loading` is not enough: it turns
```

with

```tsx
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // framer-motion follows the system's reduced motion: no movement, only fades.
  return (
    <MotionConfig reducedMotion="user">
      {hash === '#mini-player' ? <MiniPlayer /> : <AppContent />}
    </MotionConfig>
  )
}

function AppContent() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  // True once initDatabase has succeeded. `loading` is not enough: it turns
```

In `src/App.tsx`, replace

```tsx
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ height: '100%', overflow: 'auto', minWidth: 0 }}
          >
            {djPage !== null ? (
              <DjView
                name={djPage.name}
                spotifyArtistId={djPage.spotifyArtistId}
```

with

```tsx
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.base, ease: EASE }}
            style={{ height: '100%', overflow: 'auto', minWidth: 0 }}
          >
            {djPage !== null ? (
              <DjView
                name={djPage.name}
                spotifyArtistId={djPage.spotifyArtistId}
```

- [ ] **Step 3: The other framer durations**

In `src/components/layout/Sidebar.tsx`, replace

```tsx
  type ActiveView,
  colourFor,
  sectionForView,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'
import './Sidebar.css'

// --- Constants ---

const MIN_WIDTH = 180
const MAX_WIDTH = 400
```

with

```tsx
  type ActiveView,
  colourFor,
  sectionForView,
  type ColourOverrides,
  type SidebarSection,
} from '../../lib/sidebarPrefs'
import { EASE, MOTION } from '../../lib/motion'
import './Sidebar.css'

// --- Constants ---

const MIN_WIDTH = 180
const MAX_WIDTH = 400
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
            initial={{ height: 0, opacity: 0 }}
            animate={{
              // 0 until measured, so a list never starts at its full height
              // and pushes the headers below it off screen.
              height: height ?? 0,
              opacity: 1,
              transition: { duration: animateHeight ? 0.2 : 0, ease: 'easeInOut' },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: 0.2, ease: 'easeInOut' },
            }}
            // No scrollbar while the height moves (it would flash and shift the rows).
            onAnimationStart={() => {
              bodyRef.current?.setAttribute('data-animating', '')
            }}
            onAnimationComplete={() => {
```

with

```tsx
            initial={{ height: 0, opacity: 0 }}
            animate={{
              // 0 until measured, so a list never starts at its full height
              // and pushes the headers below it off screen.
              height: height ?? 0,
              opacity: 1,
              transition: { duration: animateHeight ? MOTION.base : 0, ease: EASE },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: MOTION.base, ease: EASE },
            }}
            // No scrollbar while the height moves (it would flash and shift the rows).
            onAnimationStart={() => {
              bodyRef.current?.setAttribute('data-animating', '')
            }}
            onAnimationComplete={() => {
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import { useOverlay } from '../../lib/overlays'
import { registerFileControls } from '../../lib/shortcuts/players'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

with

```tsx
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import { useOverlay } from '../../lib/overlays'
import { registerFileControls } from '../../lib/shortcuts/players'
import { EASE, MOTION } from '../../lib/motion'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
        {expanded && currentTrack && (
          <motion.div
            className="now-playing-expanded"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            onClick={() => setExpanded(false)}
          >
            <button
              className="now-playing-expanded__close"
              onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
              title="Close (Escape)"
```

with

```tsx
        {expanded && currentTrack && (
          <motion.div
            className="now-playing-expanded"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: MOTION.slow, ease: EASE }}
            onClick={() => setExpanded(false)}
          >
            <button
              className="now-playing-expanded__close"
              onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
              title="Close (Escape)"
```

In `src/components/ai/ConversationList.tsx`, replace

```tsx
// ConversationList — left panel with New Chat button, conversation items, empty state

import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../Icon'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/ai'

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const last7 = today - 7 * 86400000
```

with

```tsx
// ConversationList — left panel with New Chat button, conversation items, empty state

import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../Icon'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/ai'
import { EASE, MOTION } from '../../lib/motion'

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const last7 = today - 7 * 86400000
```

In `src/components/ai/ConversationList.tsx`, replace

```tsx
                <AnimatePresence>
                  {group.items.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ConversationItem
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onSelect={onSelectConversation}
                        onRename={onRenameConversation}
```

with

```tsx
                <AnimatePresence>
                  {group.items.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: MOTION.base, ease: EASE }}
                    >
                      <ConversationItem
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onSelect={onSelectConversation}
                        onRename={onRenameConversation}
```

In `src/components/ai/MixPrepPanel.tsx`, replace

```tsx
import { tauriApi } from '../../lib/tauri-api'
import type { Track } from '../../types/track'
import type { RecommendedOrder } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { getKeyCompatibilityScore, getBpmIssue, type KeyCompatibilityTier } from '../../lib/musicUtils'
import './MixPrepPanel.css'

interface MixPrepPanelProps {
  playlistId: number
  playlistName: string
  onClose: () => void
```

with

```tsx
import { tauriApi } from '../../lib/tauri-api'
import type { Track } from '../../types/track'
import type { RecommendedOrder } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { getKeyCompatibilityScore, getBpmIssue, type KeyCompatibilityTier } from '../../lib/musicUtils'
import { EASE, MOTION } from '../../lib/motion'
import './MixPrepPanel.css'

interface MixPrepPanelProps {
  playlistId: number
  playlistName: string
  onClose: () => void
```

In `src/components/ai/MixPrepPanel.tsx`, replace

```tsx
      >
        <motion.div
          className="mix-prep-panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="mix-prep-header">
            <div className="mix-prep-header__icon">
              <Icon name="AudioWaveform" size={18} />
            </div>
```

with

```tsx
      >
        <motion.div
          className="mix-prep-panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: MOTION.slow, ease: EASE }}
        >
          {/* Header */}
          <div className="mix-prep-header">
            <div className="mix-prep-header__icon">
              <Icon name="AudioWaveform" size={18} />
            </div>
```

In `src/components/ai/ChatArea.tsx`, replace

```tsx
import TextareaAutosize from 'react-textarea-autosize'
import { ChatMessage } from './ChatMessage'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import { useAIStore } from '../../store/aiStore'
import type { ActionResult, ChatMessage as ChatMessageType, Conversation, GeneratedPlaylist } from '../../types/ai'

function ActionCard({ action }: { action: ActionResult }) {
  const iconMap: Record<string, string> = {
    create_playlist: '📋',
    tag_tracks: '🏷️',
    queue_tracks: '▶️',
```

with

```tsx
import TextareaAutosize from 'react-textarea-autosize'
import { ChatMessage } from './ChatMessage'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import { useAIStore } from '../../store/aiStore'
import type { ActionResult, ChatMessage as ChatMessageType, Conversation, GeneratedPlaylist } from '../../types/ai'
import { EASE, MOTION } from '../../lib/motion'

function ActionCard({ action }: { action: ActionResult }) {
  const iconMap: Record<string, string> = {
    create_playlist: '📋',
    tag_tracks: '🏷️',
    queue_tracks: '▶️',
```

In `src/components/ai/ChatArea.tsx`, replace

```tsx
          <AnimatePresence mode="wait">
            <motion.div
              key={currentConversationId ?? 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {chatHistory.map((msg, index) => (
                <div key={index}>
                  <ChatMessage message={msg} />
                  {msg.role === 'assistant' && lastActions.length > 0 && index === chatHistory.length - 1 && (
                    <div style={{ marginTop: '0.25rem' }}>
```

with

```tsx
          <AnimatePresence mode="wait">
            <motion.div
              key={currentConversationId ?? 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION.base, ease: EASE }}
            >
              {chatHistory.map((msg, index) => (
                <div key={index}>
                  <ChatMessage message={msg} />
                  {msg.role === 'assistant' && lastActions.length > 0 && index === chatHistory.length - 1 && (
                    <div style={{ marginTop: '0.25rem' }}>
```

In `src/components/ai/RecommendationsPanel.tsx`, replace

```tsx
import { audioPlayer } from '../../lib/audioPlayer'
import { usePlayerStore } from '../../store/playerStore'
import type { Track } from '../../types/track'
import type { RecommendationResult } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import './RecommendationsPanel.css'

interface RecommendationsPanelProps {
  seedTrack?: Track // For DISC-01 (by track)
  playlistId?: number // For DISC-02 (by playlist)
  playlistName?: string // Display name for playlist mode
```

with

```tsx
import { audioPlayer } from '../../lib/audioPlayer'
import { usePlayerStore } from '../../store/playerStore'
import type { Track } from '../../types/track'
import type { RecommendationResult } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { EASE, MOTION } from '../../lib/motion'
import './RecommendationsPanel.css'

interface RecommendationsPanelProps {
  seedTrack?: Track // For DISC-01 (by track)
  playlistId?: number // For DISC-02 (by playlist)
  playlistName?: string // Display name for playlist mode
```

In `src/components/ai/RecommendationsPanel.tsx`, replace

```tsx
    <AnimatePresence>
      <motion.div
        className="recommendations-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="recommendations-panel__header">
          <span className="recommendations-panel__header-icon">
            <Icon name="Compass" size={16} />
          </span>
```

with

```tsx
    <AnimatePresence>
      <motion.div
        className="recommendations-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: MOTION.slow, ease: EASE }}
      >
        {/* Header */}
        <div className="recommendations-panel__header">
          <span className="recommendations-panel__header-icon">
            <Icon name="Compass" size={16} />
          </span>
```

In `src/components/ai/AIPlaylistDialog.tsx`, replace

```tsx
import { usePlayerStore } from '../../store/playerStore'
import type { Track } from '../../types/track'
import type { EnergyDirection, GeneratedPlaylist } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { getKeyCompatibilityScore } from '../../lib/musicUtils'
import './AIPlaylistDialog.css'

interface AIPlaylistDialogProps {
  seedTrack: Track
  onClose: () => void
  onPlaylistSaved: (playlistId: number) => void
```

with

```tsx
import { usePlayerStore } from '../../store/playerStore'
import type { Track } from '../../types/track'
import type { EnergyDirection, GeneratedPlaylist } from '../../types/ai'
import { getErrorMessage } from '../../types/ai'
import { useAIStore } from '../../store/aiStore'
import { getKeyCompatibilityScore } from '../../lib/musicUtils'
import { EASE, MOTION } from '../../lib/motion'
import './AIPlaylistDialog.css'

interface AIPlaylistDialogProps {
  seedTrack: Track
  onClose: () => void
  onPlaylistSaved: (playlistId: number) => void
```

In `src/components/ai/AIPlaylistDialog.tsx`, replace

```tsx
    <AnimatePresence>
      <motion.div
        className="ai-playlist-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          className="ai-playlist-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ai-playlist-header">
            <span className="ai-playlist-header__icon">
              <Icon name="Sparkles" size={18} />
```

with

```tsx
    <AnimatePresence>
      <motion.div
        className="ai-playlist-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: MOTION.base, ease: EASE }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          className="ai-playlist-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: MOTION.base, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ai-playlist-header">
            <span className="ai-playlist-header__icon">
              <Icon name="Sparkles" size={18} />
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/styles/globals.css src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/NowPlayingBar.tsx src/components/ai/ConversationList.tsx src/components/ai/MixPrepPanel.tsx src/components/ai/ChatArea.tsx src/components/ai/RecommendationsPanel.tsx src/components/ai/AIPlaylistDialog.tsx
git commit -m "feat(motion): reduced motion everywhere; framer-motion on the motion tokens"
```

---

### Task 2: The shell, the library and the players

**Files:** Modify `src/App.css`, `src/components/AnalysisProgress.css`, `src/components/FolderTree.css`, `src/components/StarRating.css`, `src/components/TrackTable.css`, `src/components/Player.css`, `src/components/MiniPlayer.css`, `src/components/layout/AppShell.css`, `src/components/layout/NowPlayingBar.css`, `src/components/layout/Sidebar.css`.

- [ ] **Step 1:**

In `src/App.css`, replace

```css
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: none;
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--accent);
  color: white;
}
```

with

```css
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: none;
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
}

.btn-primary {
  background: var(--accent);
  color: white;
}
```

In `src/App.css`, replace

```css
}

.scan-progress-global .scan-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 2px;
  transition: width 0.15s ease;
}

.scan-progress-global .scan-progress__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
```

with

```css
}

.scan-progress-global .scan-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 2px;
  transition: width var(--motion-slow) var(--ease);
}

.scan-progress-global .scan-progress__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
```

In `src/components/AnalysisProgress.css`, replace

```css
  z-index: 0;
}

.analysis-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%);
  transition: width 0.3s ease-out;
  box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.3);
}

.analysis-progress-bar.indeterminate {
  width: 100% !important;
  background: linear-gradient(
```

with

```css
  z-index: 0;
}

.analysis-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%);
  transition: width var(--motion-slow) var(--ease);
  box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.3);
}

.analysis-progress-bar.indeterminate {
  width: 100% !important;
  background: linear-gradient(
```

In `src/components/AnalysisProgress.css`, replace

```css
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all 0.15s ease;
}

.analysis-cancel-btn:hover {
  background: rgba(var(--color-danger-rgb), 0.2);
  border-color: rgba(var(--color-danger-rgb), 0.4);
  color: var(--color-danger);
```

with

```css
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
}

.analysis-cancel-btn:hover {
  background: rgba(var(--color-danger-rgb), 0.2);
  border-color: rgba(var(--color-danger-rgb), 0.4);
  color: var(--color-danger);
```

In `src/components/FolderTree.css`, replace

```css
  align-items: center;
  height: 28px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background-color 0.1s ease;
  white-space: nowrap;
  overflow: hidden;
}

.folder-row:hover {
  background: var(--bg-tertiary);
```

with

```css
  align-items: center;
  height: 28px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background-color var(--motion-fast) var(--ease);
  white-space: nowrap;
  overflow: hidden;
}

.folder-row:hover {
  background: var(--bg-tertiary);
```

In `src/components/FolderTree.css`, replace

```css
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  border-radius: 3px;
  transition: color 0.1s ease;
}

.folder-arrow.has-children {
  cursor: pointer;
}
```

with

```css
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  border-radius: 3px;
  transition: color var(--motion-fast) var(--ease);
}

.folder-arrow.has-children {
  cursor: pointer;
}
```

In `src/components/StarRating.css`, replace

```css
  border: none;
  padding: 0 1px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  color: var(--border);
  transition: color 0.1s ease;
  outline: none;
}

.star-rating .star:hover,
.star-rating .star--active {
  color: var(--accent);
```

with

```css
  border: none;
  padding: 0 1px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  color: var(--border);
  transition: color var(--motion-fast) var(--ease);
  outline: none;
}

.star-rating .star:hover,
.star-rating .star--active {
  color: var(--accent);
```

In `src/components/TrackTable.css`, replace

```css
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-success);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.track-table-ai-rec-btn:hover {
  background: rgba(var(--color-success-rgb), 0.18);
  border-color: rgba(var(--color-success-rgb), 0.4);
}
```

with

```css
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-success);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease);
}

.track-table-ai-rec-btn:hover {
  background: rgba(var(--color-success-rgb), 0.18);
  border-color: rgba(var(--color-success-rgb), 0.4);
}
```

In `src/components/TrackTable.css`, replace

```css
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 10px;
  height: 32px;
  transition: border-color 0.15s ease;
}

.search-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
}
```

with

```css
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 10px;
  height: 32px;
  transition: border-color var(--motion-fast) var(--ease);
}

.search-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
}
```

In `src/components/TrackTable.css`, replace

```css
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-md);
  line-height: 1;
  flex-shrink: 0;
  transition:
    color 0.1s ease,
    background-color 0.1s ease;
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
```

with

```css
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-md);
  line-height: 1;
  flex-shrink: 0;
  transition:
    color var(--motion-fast) var(--ease),
    background-color var(--motion-fast) var(--ease);
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
```

In `src/components/TrackTable.css`, replace

```css
  background: var(--overlay-bg);
  backdrop-filter: blur(var(--overlay-blur));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
```

with

```css
  background: var(--overlay-bg);
  backdrop-filter: blur(var(--overlay-blur));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  animation: fadeIn var(--motion-base) var(--ease);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
```

In `src/components/TrackTable.css`, replace

```css
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
```

with

```css
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  animation: slideIn var(--motion-base) var(--ease);
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
```

In `src/components/TrackTable.css`, replace

```css
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-content h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
```

with

```css
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Reduced motion: the dialog fades in, it does not slide. */
@media (prefers-reduced-motion: reduce) {
  .modal-content {
    animation-name: fadeIn;
  }
}

.modal-content h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
```

In `src/components/TrackTable.css`, replace

```css
  font-size: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  margin-bottom: 20px;
  box-sizing: border-box;
}

.modal-input:focus {
  border-color: var(--accent);
```

with

```css
  font-size: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--motion-fast) var(--ease);
  margin-bottom: 20px;
  box-sizing: border-box;
}

.modal-input:focus {
  border-color: var(--accent);
```

In `src/components/TrackTable.css`, replace

```css
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  outline: none;
}

.modal-button-secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
```

with

```css
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
  outline: none;
}

.modal-button-secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
```

In `src/components/Player.css`, replace

```css
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  transition:
    color 0.15s,
    background 0.15s;
  flex-shrink: 0;
  position: relative;
}

.sc-player__btn svg {
  pointer-events: none;
```

with

```css
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  transition:
    color var(--motion-fast) var(--ease),
    background var(--motion-fast) var(--ease);
  flex-shrink: 0;
  position: relative;
}

.sc-player__btn svg {
  pointer-events: none;
```

In `src/components/Player.css`, replace

```css
  position: absolute;
  left: 0;
  height: 3px;
  background: var(--accent);
  border-radius: 1.5px;
  pointer-events: none;
  transition: width 0.05s linear;
}

/* Scrubber handle — visible on hover */
.sc-player__progress-handle {
  position: absolute;
```

with

```css
  position: absolute;
  left: 0;
  height: 3px;
  background: var(--accent);
  border-radius: 1.5px;
  pointer-events: none;
  /* It follows the playhead, not a change on screen: no motion token. */
  transition: width 0.05s linear;
}

/* Scrubber handle — visible on hover */
.sc-player__progress-handle {
  position: absolute;
```

In `src/components/Player.css`, replace

```css
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.sc-player__progress:hover .sc-player__progress-handle {
  opacity: 1;
}
```

with

```css
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--ease);
}

.sc-player__progress:hover .sc-player__progress-handle {
  opacity: 1;
}
```

In `src/components/Player.css`, replace

```css

.sc-player__meta--clickable {
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px 0px -4px -8px;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.sc-player__meta--clickable:hover {
  background: var(--bg-tertiary);
}
```

with

```css

.sc-player__meta--clickable {
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px 0px -4px -8px;
  border-radius: 6px;
  transition: background-color var(--motion-fast) var(--ease);
}

.sc-player__meta--clickable:hover {
  background: var(--bg-tertiary);
}
```

In `src/components/Player.css`, replace

```css
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.sc-player__playlist-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
}
```

with

```css
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) var(--ease);
}

.sc-player__playlist-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
}
```

In `src/components/MiniPlayer.css`, replace

```css
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.mini-player__close:hover {
  color: var(--text-primary);
  background: rgba(var(--accent-rgb), 0.08);
}
```

with

```css
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease),
    background var(--motion-fast) var(--ease);
}

.mini-player__close:hover {
  color: var(--text-primary);
  background: rgba(var(--accent-rgb), 0.08);
}
```

In `src/components/MiniPlayer.css`, replace

```css
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.mini-player__btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: rgba(var(--accent-rgb), 0.08);
}
```

with

```css
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease),
    background var(--motion-fast) var(--ease);
}

.mini-player__btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: rgba(var(--accent-rgb), 0.08);
}
```

In `src/components/MiniPlayer.css`, replace

```css
  position: absolute;
  left: 0;
  height: 4px;
  background: var(--accent);
  border-radius: 2px;
  pointer-events: none;
  transition: width 0.05s linear;
}

.mini-player__progress-handle {
  position: absolute;
  top: 50%;
```

with

```css
  position: absolute;
  left: 0;
  height: 4px;
  background: var(--accent);
  border-radius: 2px;
  pointer-events: none;
  /* It follows the playhead, not a change on screen: no motion token. */
  transition: width 0.05s linear;
}

.mini-player__progress-handle {
  position: absolute;
  top: 50%;
```

In `src/components/MiniPlayer.css`, replace

```css
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.mini-player__progress:hover .mini-player__progress-handle,
.mini-player__progress:active .mini-player__progress-handle {
  opacity: 1;
}
```

with

```css
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--ease);
}

.mini-player__progress:hover .mini-player__progress-handle,
.mini-player__progress:active .mini-player__progress-handle {
  opacity: 1;
}
```

In `src/components/layout/AppShell.css`, replace

```css
  overflow: visible;
}

/* Set on <html> by Sidebar.tsx for ~200ms around a collapse/expand only, so
   dragging the sidebar's edge never lags behind the mouse. */
.sidebar-width-animating .app-shell {
  transition: grid-template-columns 150ms ease;
}
```

with

```css
  overflow: visible;
}

/* Set on <html> by Sidebar.tsx for ~200ms around a collapse/expand only, so
   dragging the sidebar's edge never lags behind the mouse. */
.sidebar-width-animating .app-shell {
  transition: grid-template-columns var(--motion-base) var(--ease);
}
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
/* ---- 3-column inner layout ---- */
.now-playing-bar__inner {
  display: flex;
  align-items: center;
  min-height: 88px;
  padding: 0 var(--space-4);
  transition: min-height 0.15s ease;
}

.now-playing-bar__inner.is-waveform {
  min-height: 113px;
}
```

with

```css
/* ---- 3-column inner layout ---- */
.now-playing-bar__inner {
  display: flex;
  align-items: center;
  min-height: 88px;
  padding: 0 var(--space-4);
  transition: min-height var(--motion-base) var(--ease);
}

.now-playing-bar__inner.is-waveform {
  min-height: 113px;
}
```

In `src/components/layout/NowPlayingBar.css`, replace

```css

.now-playing-bar__track-info--clickable {
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: var(--radius-md);
  transition: background-color 0.15s ease;
}

.now-playing-bar__track-info--clickable:hover {
  background: var(--bg-tertiary);
}
```

with

```css

.now-playing-bar__track-info--clickable {
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: var(--radius-md);
  transition: background-color var(--motion-fast) var(--ease);
}

.now-playing-bar__track-info--clickable:hover {
  background: var(--bg-tertiary);
}
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
  position: absolute;
  left: 0;
  height: 3px;
  background: var(--text-primary);
  border-radius: 1.5px;
  pointer-events: none;
  transition: background 0.15s;
}

/* On hover: fill turns accent */
.now-playing-bar__progress--hover .now-playing-bar__progress-fill {
  background: var(--accent);
}
```

with

```css
  position: absolute;
  left: 0;
  height: 3px;
  background: var(--text-primary);
  border-radius: 1.5px;
  pointer-events: none;
  transition: background var(--motion-fast) var(--ease);
}

/* On hover: fill turns accent */
.now-playing-bar__progress--hover .now-playing-bar__progress-fill {
  background: var(--accent);
}
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
  height: 12px;
  background: var(--text-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* On hover: show thumb */
.now-playing-bar__progress--hover .now-playing-bar__progress-handle {
  opacity: 1;
```

with

```css
  height: 12px;
  background: var(--text-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--ease);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* On hover: show thumb */
.now-playing-bar__progress--hover .now-playing-bar__progress-handle {
  opacity: 1;
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition:
    color 0.15s,
    background 0.15s;
  flex-shrink: 0;
  position: relative;
}

.now-playing-bar__btn svg {
  pointer-events: none;
```

with

```css
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition:
    color var(--motion-fast) var(--ease),
    background var(--motion-fast) var(--ease);
  flex-shrink: 0;
  position: relative;
}

.now-playing-bar__btn svg {
  pointer-events: none;
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
  border: none;
  color: var(--text-primary);
  font-size: var(--text-base);
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.now-playing-bar__playlist-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
}
```

with

```css
  border: none;
  color: var(--text-primary);
  font-size: var(--text-base);
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) var(--ease);
}

.now-playing-bar__playlist-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
}
```

In `src/components/layout/NowPlayingBar.css`, replace

```css
  height: 40px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.now-playing-expanded__close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text-primary);
}
```

with

```css
  height: 40px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.now-playing-expanded__close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text-primary);
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.sidebar-top__avatar:hover {
  background: var(--accent);
  color: white;
}
```

with

```css
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.sidebar-top__avatar:hover {
  background: var(--accent);
  color: white;
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color 0.15s;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
```

with

```css
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color var(--motion-fast) var(--ease);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  color: var(--text-primary);
}

.sidebar-section__chevron {
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.sidebar-section__chevron--collapsed {
  transform: rotate(-90deg);
}
```

with

```css
  color: var(--text-primary);
}

.sidebar-section__chevron {
  display: flex;
  align-items: center;
  transition: transform var(--motion-base) var(--ease);
  flex-shrink: 0;
}

.sidebar-section__chevron--collapsed {
  transform: rotate(-90deg);
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-md);
}
```

with

```css
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-md);
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.sidebar-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

with

```css
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) var(--ease);
}

.sidebar-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
}

.sidebar-drag-handle:hover,
.sidebar-drag-handle--dragging {
  background: var(--accent);
```

with

```css
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background var(--motion-fast) var(--ease);
  z-index: 10;
}

.sidebar-drag-handle:hover,
.sidebar-drag-handle--dragging {
  background: var(--accent);
```

In `src/components/layout/Sidebar.css`, replace

```css
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s;
}

.sidebar-top__toggle:hover {
  color: var(--text-primary);
}
```

with

```css
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--motion-fast) var(--ease);
}

.sidebar-top__toggle:hover {
  color: var(--text-primary);
}
```

In `src/components/layout/Sidebar.css`, replace

```css
  flex-direction: column;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  padding: 6px 0;
  animation: sidebar-flyout-in 120ms ease-out;
}

/* Opacity only — see the note in SidebarFlyout.tsx. */
@keyframes sidebar-flyout-in {
  from {
    opacity: 0;
```

with

```css
  flex-direction: column;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  padding: 6px 0;
  animation: sidebar-flyout-in var(--motion-base) var(--ease);
}

/* Opacity only — see the note in SidebarFlyout.tsx. */
@keyframes sidebar-flyout-in {
  from {
    opacity: 0;
```

In `src/components/layout/Sidebar.css`, replace

```css
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.sidebar-rail__item:hover,
.sidebar-rail__item--active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
```

with

```css
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.sidebar-rail__item:hover,
.sidebar-rail__item--active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
```

- [ ] **Step 2:** `npx vite build`: passes. Commit:

```bash
git add src/App.css src/components/AnalysisProgress.css src/components/FolderTree.css src/components/StarRating.css src/components/TrackTable.css src/components/Player.css src/components/MiniPlayer.css src/components/layout/AppShell.css src/components/layout/NowPlayingBar.css src/components/layout/Sidebar.css
git commit -m "feat(motion): the shell, the library and the players on the motion tokens"
```

---

### Task 3: The views and the modals

**Files:** Modify `src/components/DuplicatesModal.css`, `src/components/ExportPlaylistModal.css`, `src/components/eq/EQModal.css`, `src/components/views/PlaylistDetailHeader.css`, `src/components/views/SearchView.css`, `src/components/views/SettingsView.css`, `src/components/views/YouTubeMusicView.css`.

- [ ] **Step 1:**

In `src/components/DuplicatesModal.css`, replace

```css
  padding: 4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.dup-modal__close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

with

```css
  padding: 4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.dup-modal__close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

In `src/components/DuplicatesModal.css`, replace

```css
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.dup-tab:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
```

with

```css
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
}

.dup-tab:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
```

In `src/components/DuplicatesModal.css`, replace

```css
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.dup-toolbar-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
}
```

with

```css
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease);
  white-space: nowrap;
}

.dup-toolbar-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
}
```

In `src/components/DuplicatesModal.css`, replace

```css

.dup-row {
  display: flex;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.dup-row:last-child {
  border-bottom: none;
}
```

with

```css

.dup-row {
  display: flex;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  transition: background var(--motion-fast) var(--ease);
}

.dup-row:last-child {
  border-bottom: none;
}
```

In `src/components/ExportPlaylistModal.css`, replace

```css
  margin-bottom: 8px;
}

.export-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.15s ease;
}

.export-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
```

with

```css
  margin-bottom: 8px;
}

.export-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-slow) var(--ease);
}

.export-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
```

In `src/components/eq/EQModal.css`, replace

```css
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition: color 0.15s, background 0.15s;
  padding: 0;
  line-height: 1;
}

.eq-modal__close-btn:hover {
  color: var(--text-primary, var(--text));
```

with

```css
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition: color var(--motion-fast) var(--ease), background var(--motion-fast) var(--ease);
  padding: 0;
  line-height: 1;
}

.eq-modal__close-btn:hover {
  color: var(--text-primary, var(--text));
```

In `src/components/eq/EQModal.css`, replace

```css
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.eq-modal__toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.eq-modal__toggle-input:checked + .eq-modal__toggle-switch {
  background: var(--accent);
}
```

with

```css
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  transition: background var(--motion-base) var(--ease);
  flex-shrink: 0;
}

.eq-modal__toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--motion-base) var(--ease);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.eq-modal__toggle-input:checked + .eq-modal__toggle-switch {
  background: var(--accent);
}
```

In `src/components/eq/EQModal.css`, replace

```css
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.eq-modal__preset-select:hover,
.eq-modal__preset-select:focus {
  border-color: var(--accent);
}
```

with

```css
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color var(--motion-fast) var(--ease);
}

.eq-modal__preset-select:hover,
.eq-modal__preset-select:focus {
  border-color: var(--accent);
}
```

In `src/components/eq/EQModal.css`, replace

```css
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;
}

.eq-modal__slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
```

with

```css
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  transition: transform var(--motion-fast) var(--ease);
}

.eq-modal__slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
```

In `src/components/eq/EQModal.css`, replace

```css
  height: 14px;
  background: var(--accent);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;
}

.eq-modal__slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}
```

with

```css
  height: 14px;
  background: var(--accent);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  transition: transform var(--motion-fast) var(--ease);
}

.eq-modal__slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
  background: linear-gradient(
    180deg,
    var(--bg-tertiary) 0%,
    var(--bg-primary) 100%
  );
  border-bottom: 1px solid var(--border-subtle);
  transition: all 0.3s ease;
  flex-shrink: 0;
}

/* ---- Compressed state ---- */
.playlist-header--compressed {
  padding: var(--space-3) var(--space-5);
```

with

```css
  background: linear-gradient(
    180deg,
    var(--bg-tertiary) 0%,
    var(--bg-primary) 100%
  );
  border-bottom: 1px solid var(--border-subtle);
  transition: all var(--motion-slow) var(--ease);
  flex-shrink: 0;
}

/* ---- Compressed state ---- */
.playlist-header--compressed {
  padding: var(--space-3) var(--space-5);
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
  width: 200px;
  height: 200px;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  transition: all 0.3s ease;
}

.playlist-header--compressed .playlist-header__art {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
```

with

```css
  width: 200px;
  height: 200px;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  transition: all var(--motion-slow) var(--ease);
}

.playlist-header--compressed .playlist-header__art {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
.playlist-header__art-initial {
  font-size: 4rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: font-size 0.3s ease;
}

.playlist-header--compressed .playlist-header__art-initial {
  font-size: 1.2rem;
}
```

with

```css
.playlist-header__art-initial {
  font-size: 4rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: font-size var(--motion-slow) var(--ease);
}

.playlist-header--compressed .playlist-header__art-initial {
  font-size: 1.2rem;
}
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
.playlist-header__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
  transition: all 0.3s ease;
}

.playlist-header__type {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: opacity 0.3s ease;
}

.playlist-header--compressed .playlist-header__type {
  display: none;
}
```

with

```css
.playlist-header__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
  transition: all var(--motion-slow) var(--ease);
}

.playlist-header__type {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: opacity var(--motion-slow) var(--ease);
}

.playlist-header--compressed .playlist-header__type {
  display: none;
}
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
  color: var(--text-primary);
  margin: 0;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: font-size 0.3s ease;
}

.playlist-header--compressed .playlist-header__name {
  font-size: var(--text-lg);
  font-weight: 600;
}
```

with

```css
  color: var(--text-primary);
  margin: 0;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: font-size var(--motion-slow) var(--ease);
}

.playlist-header--compressed .playlist-header__name {
  font-size: var(--text-lg);
  font-weight: 600;
}
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
/* ---- DJ metadata row ---- */
.playlist-header__meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  transition: opacity 0.3s ease, max-height 0.3s ease;
  overflow: hidden;
  max-height: 40px;
}

.playlist-header--compressed .playlist-header__meta {
  opacity: 0;
```

with

```css
/* ---- DJ metadata row ---- */
.playlist-header__meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  transition: opacity var(--motion-slow) var(--ease), max-height var(--motion-slow) var(--ease);
  overflow: hidden;
  max-height: 40px;
}

.playlist-header--compressed .playlist-header__meta {
  opacity: 0;
```

In `src/components/views/PlaylistDetailHeader.css`, replace

```css
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.playlist-header__toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
```

with

```css
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.playlist-header__toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
```

In `src/components/views/SearchView.css`, replace

```css
  align-items: center;
  gap: var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-view__input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
}
```

with

```css
  align-items: center;
  gap: var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  transition: border-color var(--motion-fast) var(--ease), box-shadow var(--motion-fast) var(--ease);
}

.search-view__input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
}
```

In `src/components/views/SearchView.css`, replace

```css
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition: color 0.15s ease;
}

.search-view__input-clear:hover {
  color: var(--text-primary);
}
```

with

```css
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition: color var(--motion-fast) var(--ease);
}

.search-view__input-clear:hover {
  color: var(--text-primary);
}
```

In `src/components/views/SearchView.css`, replace

```css
  flex: none;
  display: flex;
  align-items: center;
  height: 48px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
  padding: 0 var(--space-2);
  gap: 0;
}

.search-view__track-row:hover {
  background: var(--bg-tertiary);
```

with

```css
  flex: none;
  display: flex;
  align-items: center;
  height: 48px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
  padding: 0 var(--space-2);
  gap: 0;
}

.search-view__track-row:hover {
  background: var(--bg-tertiary);
```

In `src/components/views/SearchView.css`, replace

```css
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.search-view__dj-card:hover {
  background: var(--bg-tertiary);
}
```

with

```css
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.search-view__dj-card:hover {
  background: var(--bg-tertiary);
}
```

In `src/components/views/SearchView.css`, replace

```css
  border: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.search-view__playlist-card:hover {
  background: var(--bg-tertiary);
}
```

with

```css
  border: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease);
}

.search-view__playlist-card:hover {
  background: var(--bg-tertiary);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  color: var(--accent);
}

.sv-collapsible__chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform 0.15s ease-out;
}

.sv-collapsible--open .sv-collapsible__chevron {
  transform: rotate(90deg);
}
```

with

```css
  color: var(--accent);
}

.sv-collapsible__chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform var(--motion-base) var(--ease);
}

.sv-collapsible--open .sv-collapsible__chevron {
  transform: rotate(90deg);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  border-radius: 11px;
  border: none;
  background: var(--bg-tertiary);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.toggle-switch--on {
  background: var(--accent);
}
```

with

```css
  border-radius: 11px;
  border: none;
  background: var(--bg-tertiary);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background var(--motion-base) var(--ease);
}

.toggle-switch--on {
  background: var(--accent);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s ease;
  pointer-events: none;
}

.toggle-switch--on .toggle-switch__thumb {
  transform: translateX(18px);
}
```

with

```css
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform var(--motion-base) var(--ease);
  pointer-events: none;
}

.toggle-switch--on .toggle-switch__thumb {
  transform: translateX(18px);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.folder-item:hover {
  border-color: var(--border);
}
```

with

```css
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all var(--motion-fast) var(--ease);
}

.folder-item:hover {
  border-color: var(--border);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  border: 1px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background: var(--surface);
  color: var(--text-primary);
  border-color: var(--border);
```

with

```css
  border: 1px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all var(--motion-fast) var(--ease);
}

.btn-icon:hover {
  background: var(--surface);
  color: var(--text-primary);
  border-color: var(--border);
```

In `src/components/views/SettingsView.css`, replace

```css
  align-items: flex-start;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.theme-card:hover {
  border-color: var(--border);
}
```

with

```css
  align-items: flex-start;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease);
  text-align: left;
}

.theme-card:hover {
  border-color: var(--border);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.settings-number-input:focus {
  outline: none;
  border-color: var(--accent);
}
```

with

```css
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all var(--motion-fast) var(--ease);
}

.settings-number-input:focus {
  outline: none;
  border-color: var(--accent);
}
```

In `src/components/views/SettingsView.css`, replace

```css
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
  font-family: inherit;
}

.settings-text-input:focus {
  outline: none;
  border-color: var(--accent);
```

with

```css
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all var(--motion-fast) var(--ease);
  font-family: inherit;
}

.settings-text-input:focus {
  outline: none;
  border-color: var(--accent);
```

In `src/components/views/SettingsView.css`, replace

```css
}

.settings-update-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 3px;
  transition: width 0.2s ease;
}

.settings-update-progress-bar--indeterminate .settings-update-progress-fill {
  animation: settings-progress-indeterminate 1.5s ease-in-out infinite;
}
```

with

```css
}

.settings-update-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 3px;
  transition: width var(--motion-slow) var(--ease);
}

.settings-update-progress-bar--indeterminate .settings-update-progress-fill {
  animation: settings-progress-indeterminate 1.5s ease-in-out infinite;
}
```

In `src/components/views/SettingsView.css`, replace

```css
}

.scan-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 2px;
  transition: width 0.15s ease;
}

.scan-progress__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
```

with

```css
}

.scan-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 2px;
  transition: width var(--motion-slow) var(--ease);
}

.scan-progress__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
```

In `src/components/views/YouTubeMusicView.css`, replace

```css

.ytm-sets__toggle:hover {
  color: var(--text-primary);
}

.ytm-sets__chevron {
  transition: transform 0.15s ease;
}

.ytm-sets--open .ytm-sets__chevron {
  transform: rotate(90deg);
}
```

with

```css

.ytm-sets__toggle:hover {
  color: var(--text-primary);
}

.ytm-sets__chevron {
  transition: transform var(--motion-base) var(--ease);
}

.ytm-sets--open .ytm-sets__chevron {
  transform: rotate(90deg);
}
```

- [ ] **Step 2:** `npx vite build`: passes. Commit:

```bash
git add src/components/DuplicatesModal.css src/components/ExportPlaylistModal.css src/components/eq/EQModal.css src/components/views/PlaylistDetailHeader.css src/components/views/SearchView.css src/components/views/SettingsView.css src/components/views/YouTubeMusicView.css
git commit -m "feat(motion): the views and the modals on the motion tokens"
```

---

### Task 4: The AI panels

**Files:** Modify `src/components/ai/AIPlaylistDialog.css`, `src/components/ai/ChatView.css`, `src/components/ai/MixPrepPanel.css`, `src/components/ai/RecommendationsPanel.css`.

- [ ] **Step 1:**

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
}

.ai-playlist-header__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
```

with

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.ai-playlist-header__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background 0.15s,
    color 0.15s;
  text-align: center;
}

.ai-playlist-segmented__option:hover:not(
    .ai-playlist-segmented__option--active
  ) {
```

with

```css
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  text-align: center;
}

.ai-playlist-segmented__option:hover:not(
    .ai-playlist-segmented__option--active
  ) {
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  cursor: pointer;
  padding: 10px 0;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  text-align: center;
}

.ai-playlist-duration-btn:hover:not(.ai-playlist-duration-btn--active) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
```

with

```css
  cursor: pointer;
  padding: 10px 0;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease);
  text-align: center;
}

.ai-playlist-duration-btn:hover:not(.ai-playlist-duration-btn--active) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  display: grid;
  grid-template-columns: 32px 1fr auto auto 32px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  transition: background 0.1s;
}

.ai-playlist-track-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

with

```css
  display: grid;
  grid-template-columns: 32px 1fr auto auto 32px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  transition: background var(--motion-fast) var(--ease);
}

.ai-playlist-track-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.ai-playlist-track-play:hover:not(:disabled) {
  background: rgba(var(--accent-rgb), 0.2);
  color: var(--accent-hover);
```

with

```css
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.ai-playlist-track-play:hover:not(:disabled) {
  background: rgba(var(--accent-rgb), 0.2);
  color: var(--accent-hover);
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.ai-playlist-track-remove:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--color-danger);
```

with

```css
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.ai-playlist-track-remove:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--color-danger);
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s,
    opacity 0.15s;
}

.ai-playlist-actions__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

with

```css
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease),
    opacity var(--motion-fast) var(--ease);
}

.ai-playlist-actions__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

In `src/components/ai/AIPlaylistDialog.css`, replace

```css
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 10px 14px;
  font-size: var(--text-md);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.ai-playlist-save-input:focus {
  border-color: var(--accent);
}
```

with

```css
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 10px 14px;
  font-size: var(--text-md);
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--motion-fast) var(--ease);
}

.ai-playlist-save-input:focus {
  border-color: var(--accent);
}
```

In `src/components/ai/ChatView.css`, replace

```css
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s;
}

.conv-list__new-chat-btn:hover {
  opacity: 0.85;
}
```

with

```css
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity var(--motion-fast) var(--ease);
}

.conv-list__new-chat-btn:hover {
  opacity: 0.85;
}
```

In `src/components/ai/ChatView.css`, replace

```css
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
  transition: background 0.12s;
  position: relative;
}

.conv-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
```

with

```css
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
  transition: background var(--motion-fast) var(--ease);
  position: relative;
}

.conv-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
```

In `src/components/ai/ChatView.css`, replace

```css
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}

.chat-header__action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

with

```css
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.chat-header__action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

In `src/components/ai/ChatView.css`, replace

```css
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.chat-chip:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
}
```

with

```css
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.chat-chip:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
}
```

In `src/components/ai/ChatView.css`, replace

```css
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  flex-shrink: 0;
}

.chat-input__send-btn--active {
  background: #3b82f6;
  color: white;
```

with

```css
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.chat-input__send-btn--active {
  background: #3b82f6;
  color: white;
```

In `src/components/ai/ChatView.css`, replace

```css
  padding: 8px 16px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: var(--radius-md);
  margin-top: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.chat-pending-playlist:hover {
  opacity: 0.85;
}
```

with

```css
  padding: 8px 16px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: var(--radius-md);
  margin-top: 12px;
  cursor: pointer;
  transition: opacity var(--motion-fast) var(--ease);
}

.chat-pending-playlist:hover {
  opacity: 0.85;
}
```

In `src/components/ai/ChatView.css`, replace

```css
  border-radius: var(--radius-md);
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transform: scale(0.95);
  animation: conv-ctx-in 120ms ease-out forwards;
}

@keyframes conv-ctx-in {
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.conv-ctx-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.conv-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

with

```css
  border-radius: var(--radius-md);
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transform: scale(0.95);
  animation: conv-ctx-in var(--motion-base) var(--ease) forwards;
}

@keyframes conv-ctx-in {
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Reduced motion: the menu fades in, it does not grow. */
@media (prefers-reduced-motion: reduce) {
  .conv-ctx-menu {
    transform: none;
  }
}

.conv-ctx-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) var(--ease);
}

.conv-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

In `src/components/ai/MixPrepPanel.css`, replace

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
}

.mix-prep-header__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
```

with

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.mix-prep-header__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
```

In `src/components/ai/MixPrepPanel.css`, replace

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.mix-prep-suggested__generate-btn:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.6) 0%,
```

with

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition:
    background var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease);
}

.mix-prep-suggested__generate-btn:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.6) 0%,
```

In `src/components/ai/MixPrepPanel.css`, replace

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    background 0.15s,
    opacity 0.15s;
}

.mix-prep-btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
```

with

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    background var(--motion-fast) var(--ease),
    opacity var(--motion-fast) var(--ease);
}

.mix-prep-btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
```

In `src/components/ai/MixPrepPanel.css`, replace

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    background 0.15s,
    color 0.15s;
}

.mix-prep-btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}
```

with

```css
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.mix-prep-btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}
```

In `src/components/ai/RecommendationsPanel.css`, replace

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.recommendations-panel__header-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
```

with

```css
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.recommendations-panel__header-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
```

In `src/components/ai/RecommendationsPanel.css`, replace

```css
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-size: var(--text-sm);
  color: var(--color-danger);
  cursor: pointer;
  align-self: flex-start;
  transition: background 0.15s;
}

.recommendations-panel__retry-btn:hover {
  background: rgba(var(--color-danger-rgb), 0.25);
}
```

with

```css
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-size: var(--text-sm);
  color: var(--color-danger);
  cursor: pointer;
  align-self: flex-start;
  transition: background var(--motion-fast) var(--ease);
}

.recommendations-panel__retry-btn:hover {
  background: rgba(var(--color-danger-rgb), 0.25);
}
```

In `src/components/ai/RecommendationsPanel.css`, replace

```css
  grid-template-columns: 30px 1fr auto 30px;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-md);
  margin: 0 4px;
  transition: background 0.1s;
}

.recommendations-panel__track-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

with

```css
  grid-template-columns: 30px 1fr auto 30px;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-md);
  margin: 0 4px;
  transition: background var(--motion-fast) var(--ease);
}

.recommendations-panel__track-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

In `src/components/ai/RecommendationsPanel.css`, replace

```css
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.recommendations-panel__track-play:hover:not(:disabled) {
  background: rgba(var(--color-success-rgb), 0.15);
  color: var(--color-success);
```

with

```css
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.recommendations-panel__track-play:hover:not(:disabled) {
  background: rgba(var(--color-success-rgb), 0.15);
  color: var(--color-success);
```

In `src/components/ai/RecommendationsPanel.css`, replace

```css
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.recommendations-panel__track-add:hover {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
```

with

```css
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  flex-shrink: 0;
}

.recommendations-panel__track-add:hover {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
```

- [ ] **Step 2:** `npx vite build`: passes; this lists nothing but the looping animations and the two seek fills:

```bash
python3 - <<'PY'
import re, glob
for f in sorted(glob.glob('src/**/*.css', recursive=True)):
    s = open(f).read()
    for m in re.finditer(r'(transition|animation)\s*:\s*([^;{}]+);', s):
        rest = re.sub(r'var\(--motion-(fast|base|slow)\)', '', m.group(2))
        if re.search(r'(?<![\w.-])\d*\.?\d+m?s\b', rest):
            print(f, s.count('\n', 0, m.start()) + 1, ' '.join(m.group(2).split()))
PY
```

Commit:

```bash
git add src/components/ai/AIPlaylistDialog.css src/components/ai/ChatView.css src/components/ai/MixPrepPanel.css src/components/ai/RecommendationsPanel.css
git commit -m "feat(motion): the AI panels on the motion tokens"
```

---

### Task 5: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-interactions-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-interactions-design.md`, replace

```markdown
- ⌘/ opens the shortcuts sheet (`ShortcutsSheet`): the table above, ⌘
  written as Ctrl on Windows; Esc, a press outside, ✕ or ⌘/ closes it.
- Esc keeps its order through what exists: the drag layer hears it first,
  then the overlay stack (`useOverlay`), then the focused track table.
- `Skeleton` moves to I3, with the loading states it replaces.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

with

```markdown
- ⌘/ opens the shortcuts sheet (`ShortcutsSheet`): the table above, ⌘
  written as Ctrl on Windows; Esc, a press outside, ✕ or ⌘/ closes it.
- Esc keeps its order through what exists: the drag layer hears it first,
  then the overlay stack (`useOverlay`), then the focused track table.
- `Skeleton` moves to I3, with the loading states it replaces.

**As built by plan I3a** (motion):
- Every `transition:` in the CSS is on the tokens, with `--ease`: hover,
  press, colour and border changes at fast; chevrons, switches, things
  collapsing (the sidebar's width, the bar's height) and a modal, flyout or
  menu opening at base; panels (the playlist header shrinking) and progress
  fills at slow. Kept as they are: looping animations (spinners, shimmers,
  the equalizer, pulses), which are not transitions, and the players' seek
  fill (`width 0.05s linear`), which follows the playhead.
- framer-motion's literal durations use `MOTION` and `EASE`
  (`src/lib/motion.ts`): the page fade and a sidebar section collapsing at
  base, the expanded now-playing view at slow, and the AI panels (unused in
  this build) the same way.
- Reduced motion: `--motion-base` and `--motion-slow` become fast, and
  framer-motion follows the system (`MotionConfig reducedMotion="user"`
  around App): no movement, fades only. The old modal and the AI context
  menu fade instead of sliding or growing, as the menus and toasts do.
- I3 is two plans: **I3a** (this one, motion) and **I3b** (controls and
  loading: `.btn--icon`, `.btn--pill`, `Button` with its working state,
  Settings, the DJ pages and the modals on the shared controls, `Skeleton`).

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-interactions-design.md
git commit -m "docs(spec): Interactions I3a as built"
```

---

### Task 6: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 662 passed (663)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Hover rows, buttons and the sidebar: changes feel quick and the same everywhere; a section's chevron turns and the section collapses smoothly; the page fade between views is short.
  - macOS System Settings › Accessibility › Display › Reduce motion on: menus and toasts only fade; collapsing is quick; nothing slides.
