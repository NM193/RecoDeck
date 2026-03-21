# Chat UI Redesign — ChatGPT-Style DJ Chat

## Overview

Full visual redesign of the AI chat interface (sidebar + chat area). Replace the current generic chatbot look with a clean ChatGPT-style layout: no bubbles on assistant messages, structured content rendering, inline action buttons, and a minimal conversation sidebar grouped by date.

## Goals

- Clean, professional chat UI that matches RecoDeck's dark theme
- Assistant messages rendered as plain text (no bubble), user messages as subtle blue pills
- Inline "Add to Playlists" button when Claude creates a playlist
- Empty state with text-only suggestion chips
- Sidebar with date-grouped conversations
- No AI branding/avatars

## Non-Goals

- Streaming text animation (future work)
- Markdown code block syntax highlighting
- Chat search/filter

## Design

### Message Styles

**User messages:**
- Right-aligned blue pill: `background: #2563eb`, white text
- `border-radius: 18px 18px 4px 18px` (tail on bottom-right)
- Max width 60% of chat area
- No timestamp visible (clean look)

**Assistant messages:**
- No bubble — plain text on the dark background
- `color: #e2e8f0`, `line-height: 1.7`, `max-width: 600px`
- Separated from next message by subtle `border-bottom: 1px solid rgba(255,255,255,0.04)` with `padding-bottom: 20px`
- Markdown rendered with styled overrides (bold as `#f8fafc`, lists with indigo bullets, links as blue underlined)

**Track lists (in assistant messages):**
- Keep as markdown rendering — do NOT attempt to parse/detect track lists from text
- The `markdown-to-jsx` library renders numbered lists and bold text naturally
- Style the markdown overrides so lists look clean: `ol`/`li` with proper spacing, bold track names in `#f1f5f9`
- This is a cosmetic redesign, not a structured data renderer. Structured track rendering is a future enhancement.

**Playlist action button:**
- Uses the existing `pendingPlaylist` store state (global, not per-message)
- When `pendingPlaylist` is non-null, render the "Add to Playlists" button as a standalone card below the latest assistant message (same position as today, just restyled)
- Ghost button style: `background: rgba(99,102,241,0.12)`, `border: 1px solid rgba(99,102,241,0.25)`, `border-radius: 8px`
- Text: "+ Add to Playlists" in `#a5b4fc`
- On click: creates the playlist in the DB using existing `handleCreatePlaylist` logic, button becomes disabled with text "Added"
- State resets when `pendingPlaylist` is cleared (existing behavior)

### Sidebar

**Layout:**
- Width: 220px, background `#111318`
- Border-right: `1px solid rgba(255,255,255,0.06)`

**New chat button:**
- Top of sidebar, 12px padding
- Ghost style: `background: rgba(99,102,241,0.12)`, `border: 1px solid rgba(99,102,241,0.2)`, `border-radius: 8px`
- Text: "+ New chat" in `#a5b4fc`

**Conversation list:**
- Grouped by date: "Today", "Yesterday", "Previous 7 days", "Older"
- Group headers: `font-size: 10px`, uppercase, `letter-spacing: 0.5px`, `color: #4b5563`, `font-weight: 600`
- Items: just the title, `font-size: 13px`, `color: #94a3b8`
- Active item: subtle background `rgba(255,255,255,0.05)`, text `#e2e8f0`
- Hover: same subtle background
- Right-click context menu for rename/delete (keep existing behavior)

### Empty State

**Centered in chat area:**
- Heading: "What can I help you with?" — `font-size: 18px`, `font-weight: 600`, `color: #e2e8f0`
- Subheading: "Ask anything about your music library" — `font-size: 13px`, `color: #64748b`

**Suggestion chips:**
- Flex-wrap layout, centered, max-width 480px
- 5 chips: "Make me a warm-up set", "What's in my library?", "Tag my house tracks", "Play something chill", "Optimize my set order"
- Text-only, no emojis
- Style: `padding: 7px 14px`, `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`, `border-radius: 20px`, `color: #94a3b8`, `font-size: 12px`
- Hover: slightly brighter border/text
- On click: fills input and auto-sends

### Input Area

**Container:**
- `border-top: 1px solid rgba(255,255,255,0.06)`
- `padding: 14px 32px 16px`

**Input field:**
- Rounded container: `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`, `border-radius: 12px`, `padding: 10px 14px`
- Send button inside the container (right side)
- Send button: 30x30px, `border-radius: 8px`
  - Empty state: `background: #374151`, arrow `#64748b`
  - Has text: `background: #3b82f6`, arrow white
- Hint text below: `font-size: 10px`, `color: #374151`

### Typing Indicator

- Keep existing bouncing dots animation
- Render in the same style as assistant messages (no bubble)
- Text: "Thinking..." in `#94a3b8` (changed from "AI is thinking...")

### CSS Location

All new styles go into `ChatView.css` following the existing project convention. ChatMessage.tsx replaces Tailwind utility classes with CSS classes defined in ChatView.css.

### Action Confirmation Cards

- For non-playlist actions (tag_tracks, queue_tracks, save_preference)
- Small inline card below assistant message
- Icon + summary text
- Success: green tint (`rgba(52, 211, 153, 0.1)`)
- Keep the existing ActionCard component design (already clean)

## Files to Change

| File | Changes |
|------|---------|
| `src/components/ai/ChatMessage.tsx` | Complete rewrite — remove bubbles from assistant, restyle user pills, add track list renderer, add playlist button |
| `src/components/ai/ChatArea.tsx` | Update empty state with suggestion chips, restyle input area, update message rendering |
| `src/components/ai/ChatView.css` | Major restyle — sidebar date groups, conversation items, input container, message spacing |
| `src/components/ai/ChatView.tsx` | Pass suggestion chip handler, minor wiring |
| `src/components/ai/ConversationList.tsx` | Add date grouping logic |
| `src/components/ai/ConversationItem.tsx` | Simplify styling to match new design |

## Migration

- Replace inline Tailwind classes in ChatMessage.tsx with CSS classes matching the project convention
- Keep all existing functionality (rename, delete, context menu)
- No backend changes needed
