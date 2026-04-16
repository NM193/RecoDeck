# Phase 29: Conversation UI - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Frontend UI for AI chat conversations — a full main-content view with an always-visible conversation list panel and a chat area. Users can create, list, load, delete, and rename conversations. Last active conversation restores when navigating to the chat view. Existing AI features (Playlist Dialog, Recommendations, Mix Prep) stay as separate panels — no changes to those.

</domain>

<decisions>
## Implementation Decisions

### Chat placement
- Full main-content view, not a floating popup — chat becomes a new view like Settings or Search
- Add "AI Chat" as a new nav item in the sidebar (below Search, above Folders section)
- The chat view has two panels: conversation list (left) and chat area (right)
- Conversation list panel is always visible (no collapse/toggle)
- Existing AI panels (AIPlaylistDialog, RecommendationsPanel, MixPrepPanel) stay unchanged as separate features
- The commented-out `PlayerAIChat` import in App.tsx and the floating `AIChatPanel` are superseded by this new view

### Chat header
- Shows the active conversation title (editable on click for rename) with action buttons
- Clean and minimal — no gradient header, fits the existing Spotify-style dark theme
- Actions in header: could include New Chat or other controls at Claude's discretion

### Conversation list
- Each item shows: conversation title + relative date ("2h ago", "Yesterday", "Mar 12")
- No message preview snippet — title and date only
- "New Chat" button at the top of the conversation list panel (prominent, always visible)
- Empty state: chat bubble icon + "Start a conversation" text + prominent New Chat button (similar to existing empty state pattern in AIChatPanel)

### Session restore
- Store last active `conversation_id` in localStorage
- App starts on Home view as usual — user navigates to "AI Chat" in sidebar to see chat
- When chat view mounts: load conversation list, restore last active conversation from localStorage
- If stored conversation_id no longer exists (was deleted), fall back to empty state

### Conversation switching
- When clicking a conversation, call `getConversationMessages()` from tauriApi and replace `chatHistory` in Zustand store
- No in-memory caching — each switch loads fresh from DB
- The store's `chatHistory` becomes a view of the currently active conversation's messages

### Delete & rename UX
- Right-click context menu on conversation items (Rename / Delete options) — consistent with existing playlist context menu pattern in Sidebar.tsx
- Rename: inline edit — title becomes an editable text field in-place, Enter to save, Escape to cancel
- Delete: native Tauri `confirm()` dialog — "Delete conversation and all messages?" with OK/Cancel
- After delete: if the deleted conversation was active, clear chat area and show empty state

### Claude's Discretion
- Exact layout widths for conversation list vs chat area
- Animation/transition when switching conversations
- How to handle the `sendMessage` flow to include `conversationId` (wiring aiStore to use the new persistence)
- Whether to keep or remove the old `AIChatPanel.tsx` and `PlayerAIChat.tsx` files
- Keyboard shortcut changes (Cmd+K currently toggles the floating panel)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing chat components (to replace/adapt)
- `src/components/ai/AIChatPanel.tsx` — Current floating chat panel (message list, input, pending playlist UI)
- `src/components/ai/ChatMessage.tsx` — Message bubble component with markdown rendering (reusable)
- `src/components/ai/PlayerAIChat.tsx` — Alternative floating chat (commented out in App.tsx)
- `src/components/ai/FloatingButton.tsx` — FAB toggle button (will be replaced by sidebar nav item)

### State management
- `src/store/aiStore.ts` — Zustand store: chatHistory, sendMessage, clearHistory, isOpen, isGenerating, error, pendingPlaylist
- `src/types/ai.ts` — ChatMessage, Conversation, ConversationMessage types (Conversation + ConversationMessage added in Phase 28)

### API layer
- `src/lib/tauri-api.ts` — All conversation commands: createConversation, listConversations, getConversationMessages, deleteConversation, renameConversation, aiChat (with optional conversationId)

### Layout and navigation
- `src/components/layout/Sidebar.tsx` — Sidebar nav items (Home, All Tracks, Search), collapsible sections, context menu pattern
- `src/components/layout/AppShell.tsx` — Main layout container
- `src/App.tsx` — View routing, activeView state, sidebar wiring

### Requirements
- `.planning/REQUIREMENTS.md` — UI-01 through UI-04

### Prior phase context
- `.planning/phases/28-backend-commands-and-message-persistence/28-CONTEXT.md` — Backend decisions: persistence strategy, command organization, auto-title behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatMessage.tsx`: Message bubble with markdown rendering — reuse directly in new chat view
- `useAIStore`: Zustand store with sendMessage, chatHistory, isGenerating, error — extend with conversationId tracking
- `Icon` component: Lucide icons used throughout app — use for chat nav item and actions
- `Section` component in Sidebar.tsx: Collapsible section pattern — reference for conversation list structure
- Tauri `confirm()` dialog: Already imported in App.tsx — use for delete confirmation
- `PromptModal` component: Modal pattern exists if needed

### Established Patterns
- View routing: `activeView` state in App.tsx controls which view renders in main content area
- Sidebar nav items: `sidebar-nav-item` CSS class with `--active` modifier for selected state
- Context menus: Right-click menu pattern in Sidebar.tsx (state tracks position, ref for click-outside dismiss)
- Dark theme: `bg-gray-900`, `text-gray-100`, blue accent colors, consistent with Spotify-style design
- Framer Motion: Used for animations (AnimatePresence, motion.div) throughout the app

### Integration Points
- `App.tsx`: Add new `activeView` value (e.g., 'ai-chat'), render new ChatView component
- `Sidebar.tsx`: Add "AI Chat" nav item between Search and Folders section
- `aiStore.ts`: Add `currentConversationId`, `conversations` list, `loadConversation()`, `createNewConversation()` actions
- `tauriApi.ts`: All conversation methods already exist from Phase 28 — just need to call them from the store

</code_context>

<specifics>
## Specific Ideas

- Chat view layout: sidebar conversation list on the left (always visible), chat messages + input on the right — like ChatGPT's layout but in the app's dark theme
- Conversation list items are scannable: title + relative date, right-click for actions
- "New Chat" is the most prominent action in the conversation list
- Inline rename (click title to edit) matches the direct manipulation feel of the app
- Native confirm dialog for delete keeps things simple and OS-consistent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-conversation-ui*
*Context gathered: 2026-03-16*
