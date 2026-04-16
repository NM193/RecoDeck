# Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AI chat UI from generic chatbot to a clean ChatGPT-style layout with date-grouped sidebar, no assistant bubbles, suggestion chips, and inline playlist action buttons.

**Architecture:** Pure frontend CSS/React changes. Rewrite ChatMessage.tsx to remove bubble styling from assistant messages. Add date-grouping logic to ConversationList. Add suggestion chips to empty state. Restyle input, sidebar, and message rendering via ChatView.css.

**Tech Stack:** React 19, TypeScript, CSS (project convention with CSS custom properties), markdown-to-jsx

**Spec:** `docs/superpowers/specs/2026-03-22-chat-ui-redesign.md`

---

## File Structure

### Modified Files
| File | Responsibility |
|------|---------------|
| `src/components/ai/ChatView.css` | All chat styles — sidebar, messages, input, empty state, chips |
| `src/components/ai/ChatMessage.tsx` | Individual message rendering — user pills, assistant plain text, markdown |
| `src/components/ai/ChatArea.tsx` | Chat area — empty state with chips, input restyle, pending playlist restyle |
| `src/components/ai/ConversationList.tsx` | Date-grouped conversation rendering |
| `src/components/ai/ConversationItem.tsx` | Simplified conversation row (remove date display) |
| `src/components/ai/ChatView.tsx` | Wire suggestion chip sends |

---

## Task 1: ChatView.css — Message Styles

**Files:**
- Modify: `src/components/ai/ChatView.css`

- [ ] **Step 1: Add user message styles**

Append to `src/components/ai/ChatView.css`:

```css
/* ===== Message styles (redesign) ===== */

.chat-msg {
  margin-bottom: 20px;
}

.chat-msg--user {
  display: flex;
  justify-content: flex-end;
}

.chat-msg__user-pill {
  background: #2563eb;
  color: white;
  padding: 10px 16px;
  border-radius: 18px 18px 4px 18px;
  max-width: 60%;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.chat-msg--assistant {
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 24px;
}

.chat-msg__assistant-text {
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.7;
  max-width: 600px;
}

/* Markdown overrides for assistant messages */
.chat-msg__assistant-text strong {
  color: #f8fafc;
  font-weight: 600;
}

.chat-msg__assistant-text a {
  color: #60a5fa;
  text-decoration: underline;
}

.chat-msg__assistant-text a:hover {
  color: #93bbfd;
}

.chat-msg__assistant-text ol,
.chat-msg__assistant-text ul {
  padding-left: 1.25em;
  margin: 8px 0;
}

.chat-msg__assistant-text li {
  margin-bottom: 4px;
  color: #e2e8f0;
}

.chat-msg__assistant-text li::marker {
  color: #6366f1;
}

.chat-msg__assistant-text code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.chat-msg__assistant-text pre {
  background: rgba(255, 255, 255, 0.04);
  padding: 12px;
  border-radius: 8px;
  margin: 8px 0;
  overflow-x: auto;
}

.chat-msg__assistant-text p {
  margin: 0 0 8px;
}

.chat-msg__assistant-text p:last-child {
  margin-bottom: 0;
}

.chat-msg__assistant-text h1,
.chat-msg__assistant-text h2,
.chat-msg__assistant-text h3 {
  color: #f1f5f9;
  margin: 16px 0 8px;
  font-weight: 600;
}

.chat-msg__assistant-text h1 { font-size: 18px; }
.chat-msg__assistant-text h2 { font-size: 16px; }
.chat-msg__assistant-text h3 { font-size: 14px; }
```

- [ ] **Step 2: Verify CSS parses**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ChatView.css
git commit -m "style(chat): add redesigned message CSS — user pills, assistant plain text"
```

---

## Task 2: ChatView.css — Sidebar, Input, Empty State, Chips

**Files:**
- Modify: `src/components/ai/ChatView.css`

- [ ] **Step 1: Update sidebar styles**

Replace the existing sidebar-related CSS blocks (`.chat-view__conversation-list`, `.conv-list__*`, `.conv-item*`) with updated versions. Keep the context menu styles unchanged.

Update `.chat-view__conversation-list`:
```css
.chat-view__conversation-list {
  width: 220px;
  flex-shrink: 0;
  background: #111318;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

Update `.conv-list__new-chat-btn`:
```css
.conv-list__new-chat-btn {
  width: 100%;
  height: auto;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border-radius: 8px;
  font-size: 13px;
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

Add date group header style:
```css
.conv-list__date-group {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4b5563;
  padding: 12px 8px 6px;
  font-weight: 600;
}

.conv-list__date-group:first-child {
  padding-top: 8px;
}
```

Update `.conv-item`:
```css
.conv-item {
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

.conv-item--active {
  background: rgba(255, 255, 255, 0.05);
}

.conv-item--active .conv-item__title {
  color: #e2e8f0;
}
```

Update `.conv-item__title` — remove the border-bottom, simplify:
```css
.conv-item__title {
  font-size: 13px;
  font-weight: 400;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  line-height: 1.5;
}
```

Hide the date from individual items (date is now in group headers):
```css
.conv-item__date {
  display: none;
}
```

- [ ] **Step 2: Update input area styles**

Replace existing `.chat-input*` styles:

```css
.chat-input {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 14px 32px 16px;
  flex-shrink: 0;
}

.chat-input__row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
}

.chat-input__textarea {
  flex: 1;
  background: transparent;
  color: var(--text-primary);
  border: none;
  padding: 0;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 20px;
  max-height: 128px;
  line-height: 1.5;
}

.chat-input__textarea::placeholder {
  color: #64748b;
}

.chat-input__textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input__send-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
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
}

.chat-input__send-btn--disabled {
  background: #374151;
  color: #64748b;
  cursor: default;
}

.chat-input__hint {
  font-size: 10px;
  color: #374151;
  margin-top: 6px;
  padding-left: 2px;
}
```

- [ ] **Step 3: Add empty state and suggestion chip styles**

Append:

```css
/* ===== Empty state ===== */

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
}

.chat-empty__heading {
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0 0 6px;
}

.chat-empty__subheading {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 28px;
}

/* ===== Suggestion chips ===== */

.chat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 480px;
}

.chat-chip {
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
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

- [ ] **Step 4: Update pending playlist styles**

Replace `.chat-pending-playlist*`:

```css
.chat-pending-playlist {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 8px;
  margin-top: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.chat-pending-playlist:hover {
  opacity: 0.85;
}

.chat-pending-playlist__text {
  color: #a5b4fc;
  font-size: 13px;
  font-weight: 500;
}

.chat-pending-playlist__icon {
  color: #a5b4fc;
  font-size: 16px;
}

.chat-pending-playlist--added {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 5: Update chat area background**

Update `.chat-view__chat-area`:
```css
.chat-view__chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: #0f1117;
}
```

Update `.chat-messages` padding:
```css
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.06) transparent;
}
```

- [ ] **Step 6: Update typing indicator**

Replace `.chat-typing__text`:
```css
.chat-typing__text {
  font-size: 13px;
  color: #94a3b8;
}
```

- [ ] **Step 7: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/ai/ChatView.css
git commit -m "style(chat): redesign sidebar, input, empty state, chips, playlist button"
```

---

## Task 3: ChatMessage.tsx — Rewrite

**Files:**
- Modify: `src/components/ai/ChatMessage.tsx`

- [ ] **Step 1: Rewrite ChatMessage component**

Replace the entire contents of `src/components/ai/ChatMessage.tsx`:

```tsx
// Individual chat message — user pill or assistant plain text with markdown

import Markdown from 'markdown-to-jsx'
import type { ChatMessage as ChatMessageType } from '../../types/ai'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__user-pill">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-msg chat-msg--assistant">
      <div className="chat-msg__assistant-text">
        <Markdown
          options={{
            overrides: {
              a: {
                props: {
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
              },
            },
          }}
        >
          {message.content}
        </Markdown>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ChatMessage.tsx
git commit -m "refactor(chat): rewrite ChatMessage — user pills, assistant plain text"
```

---

## Task 4: ChatArea.tsx — Empty State, Chips, Playlist Button

**Files:**
- Modify: `src/components/ai/ChatArea.tsx`

- [ ] **Step 1: Rewrite ChatArea with new empty state and suggestion chips**

Read the current `ChatArea.tsx` to understand all props and handlers. Then update the component:

1. Add suggestion chips to the empty state (replace the `chat-messages__empty` section)
2. Update the typing indicator text from "AI is thinking..." to "Thinking..."
3. Restyle the pending playlist card as a ghost "Add to Playlists" button
4. Add `onSendMessage` call when a chip is clicked
5. Keep all existing functionality (ActionCards, error display, input, rename)

The empty state should be shown when `!currentConversationId && chatHistory.length === 0` (same condition as today). Replace the current empty state content with:

```tsx
<div className="chat-empty">
  <h2 className="chat-empty__heading">What can I help you with?</h2>
  <p className="chat-empty__subheading">Ask anything about your music library</p>
  <div className="chat-chips">
    {['Make me a warm-up set', "What's in my library?", 'Tag my house tracks', 'Play something chill', 'Optimize my set order'].map((chip) => (
      <button
        key={chip}
        className="chat-chip"
        onClick={() => onSendMessage(chip)}
        type="button"
      >
        {chip}
      </button>
    ))}
  </div>
</div>
```

Replace the pending playlist card with the ghost button:

```tsx
{pendingPlaylist && (
  <div
    className="chat-pending-playlist"
    onClick={handleCreatePlaylist}
    role="button"
    tabIndex={0}
  >
    <span className="chat-pending-playlist__icon">+</span>
    <span className="chat-pending-playlist__text">
      Add to Playlists — {pendingPlaylist.name} ({pendingPlaylist.track_ids.length} tracks)
    </span>
  </div>
)}
```

Update typing indicator text:
```tsx
<span className="chat-typing__text">Thinking...</span>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ChatArea.tsx
git commit -m "feat(chat): add suggestion chips, restyle empty state and playlist button"
```

---

## Task 5: ConversationList.tsx — Date Grouping

**Files:**
- Modify: `src/components/ai/ConversationList.tsx`

- [ ] **Step 1: Add date grouping logic**

Add a helper function inside ConversationList.tsx to group conversations by date:

```tsx
function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const last7 = today - 7 * 86400000

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    const ts = conv.created_at * 1000
    if (ts >= today) groups[0].items.push(conv)
    else if (ts >= yesterday) groups[1].items.push(conv)
    else if (ts >= last7) groups[2].items.push(conv)
    else groups[3].items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}
```

- [ ] **Step 2: Update the render to use groups**

Replace the conversation list rendering section to map over groups:

```tsx
<div className="conv-list__items">
  {conversations.length === 0 ? (
    <div className="conv-list__empty">
      {/* keep existing empty state */}
    </div>
  ) : (
    <>
      {groupByDate(conversations).map((group) => (
        <div key={group.label}>
          <div className="conv-list__date-group">{group.label}</div>
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
                  onDelete={onDeleteConversation}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </>
  )}
</div>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai/ConversationList.tsx
git commit -m "feat(chat): add date-grouped conversation list (Today/Yesterday/Older)"
```

---

## Task 6: ConversationItem.tsx — Simplify

**Files:**
- Modify: `src/components/ai/ConversationItem.tsx`

- [ ] **Step 1: Remove the date display from ConversationItem**

The date is now shown in the group header, so remove the `<p className="conv-item__date">` line from the render. Also remove the `formatRelativeDate` function since it's no longer used.

Remove the border-left active indicator (CSS now handles active state with background only). Remove `border-bottom` from items (handled via CSS removal).

Keep: inline rename, context menu, all handlers.

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ConversationItem.tsx
git commit -m "refactor(chat): simplify ConversationItem — remove date, use group headers"
```

---

## Task 7: Visual Verification

**Files:** None (manual testing)

- [ ] **Step 1: Start the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify empty state**

Open chat view with no active conversation. Verify:
- "What can I help you with?" heading centered
- 5 suggestion chips visible, text-only, no emojis
- Clicking a chip sends the message

- [ ] **Step 3: Verify message rendering**

Send a message. Verify:
- User message appears as blue pill, right-aligned
- Assistant response has no bubble, plain text on dark background
- Markdown (bold, lists) renders cleanly
- Messages separated by subtle divider

- [ ] **Step 4: Verify sidebar**

Check conversations sidebar. Verify:
- Grouped by "Today", "Yesterday", etc.
- "New chat" button is ghost-styled
- Active conversation has subtle background, no border-left
- Right-click context menu still works

- [ ] **Step 5: Verify playlist button**

Generate a playlist. Verify:
- "+ Add to Playlists" ghost button appears
- Clicking it creates the playlist
- Button becomes disabled after adding

- [ ] **Step 6: Fix any issues found**

Address bugs discovered during testing.

- [ ] **Step 7: Commit fixes**

```bash
git add -A
git commit -m "fix(chat): address visual issues from UI redesign testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Message CSS — user pills, assistant text, markdown | ChatView.css |
| 2 | Sidebar, input, empty state, chips, playlist CSS | ChatView.css |
| 3 | ChatMessage.tsx rewrite | ChatMessage.tsx |
| 4 | ChatArea — chips, empty state, playlist button | ChatArea.tsx |
| 5 | ConversationList — date grouping | ConversationList.tsx |
| 6 | ConversationItem — simplify | ConversationItem.tsx |
| 7 | Visual verification | Manual testing |
