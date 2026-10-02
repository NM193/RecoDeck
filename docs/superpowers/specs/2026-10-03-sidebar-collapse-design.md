# Collapsible Sidebar and Section Colours — Design

## Why

On a narrower window the sidebar takes a third of the width and the track table
loses columns. The sidebar should be able to step aside to icons only — by hand,
and by itself when the window gets narrow. While doing that, the active section's
icon gets a colour, so "where am I" reads at a glance even with icons only.

Mockup: [`2026-10-03-sidebar-collapse-mockup.html`](./2026-10-03-sidebar-collapse-mockup.html)
(approved).

This spec does not depend on the Spotify section and can land before it. Where
it mentions SPOTIFY, that section follows the same rules once it exists.

## Collapsing

### Two widths

- **Full** — the sidebar as today, at the width the user has dragged it to
  (the existing handle, 180–400px, stored in `localStorage['sidebar_width']`).
- **Icons only** — 60px. The logo becomes a small stacked "RECO / DECK"
  wordmark rendered as text (there is no small logo asset), nav items become
  40×36 icon buttons, sections (Folders, Playlists, Spotify) become single
  icons, and the profile icon moves to the bottom.

`Sidebar.tsx` stays the only writer of `--sidebar-width` on
`document.documentElement`, as it is today: the dragged width when full, `60px`
when collapsed. Expanding restores the dragged width. In icons-only mode the
drag handle is not rendered.

The width animates (~150ms) only when toggling between the two states; while
the user drags the handle the transition is off, so dragging does not lag.

### The toggle

- The macOS sidebar icon (Lucide `panel-left`), 14px, `--text-muted`, no box,
  to the **right of** the profile icon. `--text-primary` on hover. In icons-only
  mode it sits under the small wordmark.
- Keyboard: `⌘\` (Ctrl+\ on Windows) toggles.

### State — one rule

There is a single boolean, **collapsed**, stored in
`localStorage['sidebar_collapsed']` next to the width (read synchronously, so
the first render already has the right width — no flash).

- **Manual toggle** (icon or `⌘\`) flips it.
- **Window crossing 1100px** sets it (and stores it, exactly like a toggle):
  shrinking below 1100px collapses;
  growing to 1100px or more expands. Only the *crossing* acts — resizing within
  one side of the line does nothing, so a manual choice stands until the next
  crossing.
- **On start** the stored value is used, except that a window already narrower
  than 1100px starts collapsed.

There is no separate "override" or "follow the window" mode, and nothing to reset.

### In icons-only mode

- **Tooltip** with the item's name on hover (after ~400ms).
- **Folders / Playlists / Spotify** icons open a **flyout** beside the icon on
  click: the same content the expanded section shows (folder tree, playlists
  with their folders, Spotify lists with counts), scrolling if long.
  - Clicking a leaf (a folder of tracks, a playlist, a Spotify list) navigates
    and closes the flyout. Clicking a playlist *folder* expands it in place, as
    it does in the full sidebar.
  - The existing right-click menus on playlists and folders work inside the
    flyout unchanged.
  - Escape or a click outside closes it.
  - The flyout fades in with opacity only — no transform — because
    FolderTree's menus are `position: fixed` and a transformed ancestor would
    misplace them.
- The Spotify new-likes **number** stays visible: 9px, `--accent-hover`, at the
  icon's top-right.
- The active item keeps its grey background and coloured icon (below).

## Section colours

### Active icon colour

The icon of the active nav item (or of a section, when a list inside it is
open) is drawn in that section's colour; inactive icons stay
`--text-secondary`. Text and background of the active item are unchanged.

Defaults:

| Section | Colour |
|---|---|
| Home | `#60a5fa` |
| Sets | `#fb923c` |
| All Tracks | `#818cf8` |
| Search | `#2dd4bf` |
| Folders | `#a78bfa` |
| Playlists | `#f472b6` |
| Spotify | `#1ed760` |
| AI Chat (hidden today behind `AI_ENABLED`) | `#818cf8` |

Spotify is no exception: its icon follows the same rule and its colour can be
changed like any other.

### Changing a colour: right-click

Right-clicking a top-level nav item or a section header — in either width —
opens a menu with a **colour block**:
- header `<Section> · icon colour`;
- 8 swatches in one row (this list wins over the mockup, which predates it): `#60a5fa`, `#fb923c`, `#818cf8`, `#2dd4bf`,
  `#a78bfa`, `#f472b6`, `#1ed760`, `#facc15` — the current one ringed (a custom
  colour rings nothing); clicking one applies it and closes the menu;
- **Custom colour…** — the system colour picker (`<input type="color">`);
- **Reset to default**.

The **Playlists** header already has a right-click menu (**Create Playlist**,
**Create Folder**). It keeps those items: the colour block is added at the top,
then a separator, then the existing items. In icons-only mode the Playlists icon
opens this same combined menu. All other right-click menus (on individual
playlists and folders) are untouched.

Colours are stored in the `settings` table as JSON (`sidebar_colours`: section
id → hex), through the existing `getSetting` / `setSetting`. Unknown section
ids are ignored; a missing or invalid hex falls back to the default. Until the
value has loaded, icons use the defaults. There is no Settings screen for this.

## Where the code goes

- `src/components/layout/Sidebar.tsx` / `.css` — collapsed rendering, the
  toggle, tooltips, flyouts, active colours, the colour block (merged into the
  Playlists header menu), and `--sidebar-width` (as today).
- `src/App.tsx` — calls `useSidebarPrefs` (collapsed flag, toggle, colours),
  registers the 1100px crossing listener and the `⌘\` shortcut, and passes the
  values to `Sidebar` (built there as today) and to `AppShell`. `AppShell`
  receives the sidebar as a ready-made node, so it is not where the state lives.
- `src/components/FolderTree.tsx` — reused as-is inside the Folders/Playlists
  flyouts.
- A small `useSidebarPrefs` hook for the collapsed flag and the colours.

## Testing

- **TypeScript:** the collapse rule — toggle flips; crossing below/above 1100px
  sets; moving within one side does nothing; start-up uses the stored value
  unless the window is under 1100px. Colour parsing — unknown ids ignored,
  invalid hex → default. Flyout — leaf click navigates and closes, folder click
  expands, Escape and outside click close.
- **By hand:** drag the sidebar wider, collapse, expand → the dragged width
  returns; drag while expanded → no lag; shrink the window across 1100px both
  ways, and toggle by hand in between; right-click every section; the Playlists
  header menu shows colours *and* Create Playlist / Create Folder; restart →
  width, collapsed state and colours persist with no flash.
