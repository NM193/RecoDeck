# Interactions — Design

## Why

How RecoDeck responds is uneven. Transitions run at 0.1s, 0.15s, 0.2s and
0.3s with no rule; buttons are styled per page, with different radii; menus
pop in with no motion; lists are blank while they load; feedback comes from
three places that look nothing alike (`Notification` toasts, the sidebar's
typed-out `HeaderNotification`, `UpdateToast`); there are no global shortcuts
(Space does not play or pause); tracks cannot be dragged anywhere.

Demo (approved, interactive — hover, click, type, drag):
[`2026-10-04-interactions-demo.html`](./2026-10-04-interactions-demo.html).

This spec sets the rules every page follows, and the shared pieces that carry
them. The Home, Sets, track table and sidebar specs use it.

## Motion

Three durations and one easing, as CSS custom properties in
`src/styles/globals.css`:

| Token | Value | For |
|---|---|---|
| `--motion-fast` | 120ms | hover, press, colour and background changes |
| `--motion-base` | 180ms | menus and popovers opening, sections collapsing, chevrons |
| `--motion-slow` | 240ms | panels, toasts, content appearing after loading |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` | everything |

- A **menu or popover** opens with a fade, a 4px drop and a scale from 0.98
  (base), and closes faster (fast).
- A **section** collapses by animating its height (`grid-template-rows:
  0fr ↔ 1fr`, base); its chevron turns.
- A **page change** keeps App's fade (`AnimatePresence`), at 180ms.
- **Content after loading** fades in with a 4px rise (slow).
- With **reduced motion** (`prefers-reduced-motion`), movement goes: only
  opacity changes, at fast.

Every existing `transition:` in the CSS moves to these tokens.

## Controls

**Buttons** share one set of classes in a new `src/styles/controls.css`
(`.btn`, `.btn--primary`, `.btn--icon`, `.btn--danger`, `.btn--pill` for the
small ones like "have it"), and one `Button` component that renders them:
- corner radius **6px** (`--radius-md`) for every button, pills and tabs
  included;
- **hover**: one step lighter (fast);
- **press**: scale 0.97 and one step darker (fast);
- **focus**: a 2px accent ring with a 2px gap, only for keyboard focus
  (`:focus-visible`);
- **disabled**: 40% opacity, no pointer;
- **working**: a spinner in place of the icon, the label in its -ing form
  ("Analyzing…"), and disabled until done.

Page-specific button styles (`btn-primary`, `dj-btn`, `sets-filter__btn`,
`dashboard-header__btn`, …) are replaced by these as each page is redesigned;
the pages no spec redesigns (Settings, DJ pages, modals) get them in one sweep.

**Rows and cards**: hover one step lighter, selected a tinted background,
pressed one step darker; all at fast. Tabs and segmented controls follow
buttons.

## Menus

One `Menu` component serves every menu: right-click menus (track tables, the
sidebar), ⋯ menus, and submenus.
- opens at the pointer or under its button, flipping to stay on screen;
- one menu at a time; a click outside, Esc, or choosing an item closes it;
- ↑ ↓ move through items, → opens a submenu, ← closes it, Enter chooses;
- destructive items are red and ask first (a confirm in the menu's place, not
  a native dialog);
- every open menu, popover and modal registers with App's `useOverlay` (Sets
  spec), so the set video steps aside.

## Loading

- A list or card that is still reading shows **skeletons** — grey shapes of
  its rows, shimmering — but only after 150ms, so a fast read never flashes.
  Then the content fades in (slow). Never a blank area, never a spinner in the
  middle of a page.
- A **button** that starts work shows its working state (above) until the
  work ends.
- Long jobs keep their own progress bars (analysis, scanning).

## Feedback: toasts

One toast system replaces `Notification` and the sidebar's `HeaderNotification`
(its typed-out text goes). `UpdateToast` stays as the update prompt, restyled
with the shared controls.

- `toast(message, { kind, action })` from anywhere; a `Toaster` in App renders
  them **bottom-centre, above the player** (and above the set bar when it
  shows);
- kinds: **success** and **info** leave after 4s (paused while hovered);
  **error** stays until closed (✕);
- an **action** on the right — **Undo**, **Open**, **Try again** — runs and
  closes the toast;
- at most 3 at a time; a fourth pushes the oldest out; they slide in from 8px
  below (slow) and fade out (base).

**Undo** is offered where an action can be put back exactly:

| Action | Undo |
|---|---|
| Add to playlist | removes the tracks that this add put in (not ones already there) |
| Delete from playlist | puts them back at their positions (`reorder_playlist_tracks`) |
| Set genre / Clear genre | restores each track's previous genre and its source |
| Move to folder | moves the moved files back to where they were |
| Mark all seen (new sets) | marks those finds unseen again |
| Remove a heart (Saved tracks) | hearts it again |

Removing a set from the library, deleting files and deleting playlists keep
asking first instead; they have no Undo.

## Keyboard

Global, unless focus is in a text field or a menu, popover or modal is open:

| Keys | Does |
|---|---|
| Space | play / pause (the bottom player, or the set video when it is the one playing) — a focused button still takes its own Space |
| ⌘→ / ⌘← | next / previous track |
| ⌘K | open Search |
| ⌘F | focus the search box of the page (track table, Sets' box) |
| ⌘/ | show the shortcuts (a small sheet listing this table) |
| ⌘\ | collapse the sidebar (exists) |
| Esc | close the open menu / popover / modal; else clear the selection |

In a focused track table (track table spec): ↑ ↓ move the selection (Shift
extends it), Enter plays the selected track, ⌘A selects every row shown. Every
focusable thing shows the focus ring when reached by keyboard.

## Drag and drop

Selected tracks (track table spec) can be **dragged** from any track table and
from Home's track rows:
- onto a **playlist** in the sidebar → added (toast with Undo);
- onto a **folder** in the sidebar → moved, by the track table spec's Move to
  folder rules (skips, the track playing, the queue), toast with Undo;
- within a **playlist** whose table is in its own order (no other sort) →
  reordered (`reorder_playlist_tracks`), with a line showing where they land.

While dragging: a small label follows the pointer ("3 tracks"), the dragged
rows dim, a valid target lights up (accent tint and outline), Esc cancels. A
collapsed sidebar opens its flyout when the pointer rests on a section's icon
for 600ms.

Built on pointer events (a 4px move starts a drag; targets register their
boxes), not HTML5 drag and drop: rows of the virtualized table unmount while
the list scrolls, which cancels a native drag, and the Tauri window's file-drop
handling would intercept it.

## What this touches

- New: `src/styles/controls.css`, `Button`, `Menu`, `Toaster` with `toast()`,
  `Skeleton`, `useShortcuts`, `useOverlay` (shared with the Sets spec), and a
  drag layer (`useTrackDrag`, drop targets in the sidebar and playlist tables).
- Removed: `Notification`, `HeaderNotification` and the sidebar toast.
- Changed: every `transition:` to the tokens; every button to the shared
  classes (with each redesign, then the sweep).

Plan order: tokens and controls, toasts, menus with `useOverlay`, skeletons,
shortcuts, drag and drop. The other specs' plans use these, so this one goes
first; a plan that comes before it builds the pieces it needs from this spec.

## Testing

- TypeScript: the toast queue (max 3, error stays, hover pauses); Undo
  inverses (add only what was added, restore previous genres); shortcut
  routing (ignored while typing, a focused button keeps Space, Esc order); the
  drag layer's hit testing.
- By hand (WebKit): the demo's behaviours in the app; reduced motion on;
  skeletons never flash on a fast read; drag 3 tracks to a playlist, to a
  folder, and within a playlist, then Undo each; drag with the sidebar
  collapsed; Space never types into a field; the set video steps aside for
  every menu and modal.

## Out of scope

New features beyond these behaviours, touch gestures, configurable shortcuts.
