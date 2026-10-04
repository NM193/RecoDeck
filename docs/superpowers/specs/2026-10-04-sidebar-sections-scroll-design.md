# Sidebar: Section Headers Stay in View — Design

## Why

The sidebar scrolls as one long column (`.sidebar-scroll`). Open Folders on a
library with dozens of folders and PLAYLISTS, SPOTIFY and YOUTUBE MUSIC are
pushed below the window: to reach a playlist you scroll past every folder
first.

## Behaviour

- The top (avatar, collapse toggle) and the nav (Home, Sets, All Tracks,
  Search) stay where they are.
- Below the nav, **every section header is always visible**: FOLDERS,
  PLAYLISTS, SPOTIFY, YOUTUBE MUSIC.
- An open section's **body scrolls inside itself**; the sidebar as a whole no
  longer scrolls.
- **Space follows content** (chosen of three options): several sections can be
  open; a short one (Spotify's five lists) keeps its whole height, and the
  long ones share what is left, each scrolling inside. When everything fits,
  nothing scrolls and the headers simply follow each other.
- An open body never shrinks below three rows (about 96px); if the window is
  so short that even that does not fit, the section area as a whole scrolls,
  as a fallback.
- A body's scroll position is kept while it stays open; the item in view (an
  open folder, the active playlist) is scrolled into view when its body opens.
- The collapsed rail is unchanged.

## How

The section area becomes a flex column filling the height under the nav
(`flex: 1; min-height: 0`). Each section is a header plus a body; the body is
`flex: 0 1 auto; min-height: 96px; overflow-y: auto`. Flexbox shrinks items in
proportion to their size, so a long body gives up space and a short one keeps
its own — which is the "space follows content" rule without code. The
sidebar's scrollbar styling moves to the bodies.

Files: `src/components/layout/Sidebar.tsx` (the section area wrapper; the
sections already render a header and a body) and
`src/components/layout/Sidebar.css`.

## Testing

By hand, in WebKit (the Tauri window): Folders open with every folder expanded
→ all four headers visible, folders scroll inside; open Playlists too → both
scroll, Spotify keeps its height; close Folders → Playlists grows; a short
window → each body keeps three rows; resize the window and drag the sidebar's
width; the rail.

## Out of scope

Remembering which sections are open across restarts, and drag & drop into the
sidebar (the Interactions spec).
