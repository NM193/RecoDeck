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
  long ones share what is left equally, each scrolling inside. When everything
  fits, nothing scrolls and the headers simply follow each other.
- An open body never shrinks below three rows (about 96px); if the window is
  so short that even that does not fit, the section area as a whole scrolls,
  as a fallback.
- A body's scroll position is kept while it stays open; the item in view (an
  open folder, the active playlist) is scrolled into view when its body opens.
- The collapsed rail is unchanged.

## How

The nav moves out of the scrolling area; below it, the section area fills the
rest of the height (`flex: 1; min-height: 0`) and only scrolls as the fallback
above.

Flexbox alone cannot give "space follows content": when the lists overflow it
shrinks every item in proportion to its size, so a short Spotify list would
shrink and scroll too. So each open section's list gets an explicit height,
from a pure function `distributeHeights(available, natural)`:
- `available` is the section area's height minus the headers and dividers;
  `natural` is each open list's own height (measured with `ResizeObserver` on
  an inner wrapper, so a folder expanding or a list growing re-measures);
- lists that fit in an equal share of what is left keep their whole height
  (shortest first); the rest share the remainder equally and scroll inside;
- never below 96px (or the list's own height, if shorter).

The list's height is animated (the existing framer-motion body animates to the
number instead of `auto`), so opening one section smoothly makes room in the
others. The sidebar's scrollbar styling moves to the lists.

Files: `src/lib/sidebarSections.ts` (the function, unit-tested),
`src/components/layout/useSectionHeights.ts` (the measuring),
`src/components/layout/Sidebar.tsx` and `src/components/layout/Sidebar.css`.

## Testing

By hand, in WebKit (the Tauri window): Folders open with every folder expanded
→ all four headers visible, folders scroll inside; open Playlists too → both
scroll, Spotify keeps its height; close Folders → Playlists grows; a short
window → each body keeps three rows; resize the window and drag the sidebar's
width; the rail.

## Out of scope

Remembering which sections are open across restarts, and drag & drop into the
sidebar (the Interactions spec).
