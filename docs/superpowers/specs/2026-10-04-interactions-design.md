# Interactions — Design

## Why

How RecoDeck responds is uneven. Transitions run at 0.1s, 0.15s, 0.2s and
0.3s with no rule; buttons are styled per page, with different radii; menus
pop in with no motion; lists are blank while they load; feedback comes from
places that look nothing alike (`Notification` toasts, the sidebar's typed-out
`HeaderNotification`, `UpdateToast`); there are no global shortcuts (Space
does not play or pause); tracks cannot be dragged anywhere.

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
| `--motion-base` | 180ms | menus and popovers opening, sections collapsing, chevrons, the page fade |
| `--motion-slow` | 240ms | panels, toasts, content appearing after loading |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` | everything |

- A **menu or popover** opens with a fade, a 4px drop and a scale from 0.98
  (base), and closes faster (fast).
- A **section** collapses by animating its height (`grid-template-rows:
  0fr ↔ 1fr`, base); its chevron turns.
- A **page change** keeps App's fade (`AnimatePresence`, exit then enter), at
  base each way.
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

**Rows and cards**: hover one step lighter, selected a tinted background,
pressed one step darker; all at fast. Tabs and segmented controls follow
buttons.

Page-specific button styles (`btn-primary`, `dj-btn`, `sets-filter__btn`,
`dashboard-header__btn`, …) are replaced on each redesigned page by that
page's plan. The pages no spec redesigns — Settings, the DJ pages, the modals
— get the shared classes in **this plan's last task** (the sweep).

## Menus

One `Menu` component serves every menu: right-click menus (track tables, the
sidebar), ⋯ menus, and submenus.
- opens at the pointer or under its button, flipping to stay on screen;
- one menu at a time; a click outside, Esc, or choosing an item closes it;
- ↑ ↓ move through items, → opens a submenu, ← closes it, Enter chooses;
- destructive items are red and ask first (a confirm in the menu's place, not
  a native dialog);
- every open menu, popover and modal registers with App's `useOverlay` (Sets
  spec), which this plan builds.

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

- `toast(message, { kind, action, detail })` from anywhere; a `Toaster` in App
  renders them **bottom-centre, above the player** (and above the set bar when
  it shows);
- kinds: **success** and **info** leave after 4s, **warning** (amber; today's
  `'warning'` notifications) after 6s — all paused while hovered; **error**
  stays until closed (✕);
- an **action** on the right — **Undo**, **Open**, **Try again** — runs and
  closes the toast; **detail** is shown on hover (e.g. why tracks were
  skipped);
- at most 3 at a time; a fourth pushes the oldest out; they slide in from 8px
  below (slow) and fade out (base).

**Undo** is offered where an action can be put back exactly. Each plan wires
the Undo of the actions it builds; this plan wires the ones for actions that
exist today and builds what they need:

| Action | Undo | Built by |
|---|---|---|
| Add to playlist | removes only the tracks this add put in (`add_tracks_to_playlist` answers which) | track table plan |
| Delete from playlist | before deleting, capture the playlist's full stored order (`get_playlist_tracks`, not the table's view); Undo calls `add_tracks_to_playlist`, then `reorder_playlist_tracks` with that order | track table plan |
| Reorder by dragging (playlist) | `reorder_playlist_tracks` with the order before the drop | track table plan |
| Set genre / Clear genre | new `restore_track_genres([{ id, genre, source }])`, which writes both columns as given (today's `set_track_genre` always writes `'user'`, and `save_track_genre` will not overwrite a user genre) | track table plan 4 |
| Move to folder | `move_tracks_to_folder` once per original folder, skips reported as a move reports them | track table plan |
| Mark all seen (new sets) | `mark_all_dj_finds_seen` answers the `(name_key, video_id)` rows it changed; new `mark_dj_finds_unseen(rows)` clears only those; raises Home's data-version number | Home plan |
| Remove a heart (Saved tracks) | hearts it again with its old `saved_at`, so it keeps its place (`save_youtube_track` gains an optional `saved_at`) | this plan |

Removing a set from the library, deleting files and deleting playlists keep
asking first instead; they have no Undo.

## Keyboard

`⌘` means Ctrl on Windows, as the existing ⌘\ handler already treats it.
Global, unless focus is in a text field or a menu, popover or modal is open:

| Keys | Does |
|---|---|
| Space | play / pause **whichever played last** — the bottom player or the set video — so pausing the video and pressing Space again resumes the video |
| ⌘→ / ⌘← | next / previous: the set's ⏭ / ⏮ when the set video is the one that played last, else the bottom player's tracks |
| ⌘K | open Search |
| ⌘F | focus the page's search box (track table, Sets' box); the browser's own find is cancelled |
| ⌘/ | show the shortcuts (a small sheet listing this table) |
| ⌘\ | collapse the sidebar (exists) |
| Esc | cancel a drag; else close the topmost menu, popover or modal; else clear the focused table's selection |

A focused control keeps its own Space only while it shows the keyboard ring
(`:focus-visible`) — a button, checkbox, select, switch or `[role=button]` —
so a button just clicked with the mouse (WebView2 focuses it) does not take
Space from play / pause. Held keys (`repeat`) are ignored.

In a focused track table (track table spec): ↑ ↓ move the selection (Shift
extends it), Enter plays the selected track, ⌘A selects every row shown.

The set video's part of Space and ⌘→ / ⌘← is wired by the Sets plan, when
`useSetPlayer` exists; until then they act on the bottom player.

## Drag and drop

Built by the **track table plan** (it needs that plan's multi-select, Move to
folder and bulk playlist commands); the Home plan adds Home's track rows as a
source. The rules:

- **Sources**: the selected tracks of any track table; pressing an unselected
  row and dragging selects it alone first. From Home's track rows (no
  selection there) a drag carries the one row.
- **Targets**:
  - a **playlist** in the sidebar's Playlists section → added (toast with
    Undo);
  - a **library folder** in the sidebar's **Folders** section → moved, by the
    track table spec's Move to folder rules (skips, the current track, the
    queue), toast with Undo. Only the Folders section moves files;
  - a **playlist folder** (in Playlists) takes nothing; resting on it for 600ms
    opens it, as resting on a collapsed library folder does, so nested targets
    can be reached while dragging;
  - within a **playlist's own table** → reordered, only while that table has
    no sort, no search and no filter; otherwise reordering is off there (the
    pointer shows not-allowed). A line shows where the tracks land; toast with
    Undo.
- **While dragging**: a small label follows the pointer ("3 tracks"), the
  dragged rows dim, a valid target lights up (accent tint and outline), the
  sidebar's scrolling sections and a long playlist scroll when the pointer
  nears their edge, a collapsed sidebar opens its flyout when the pointer rests
  on a section's icon for 600ms, and Esc cancels.
- **How**: pointer events, not HTML5 drag and drop — rows of the virtualized
  table unmount while the list scrolls, which cancels a native drag, and the
  Tauri window's file-drop handling would intercept it. A 4px move starts a
  drag; move and up listeners sit on `window` (pointer capture on a row would
  be lost when it unmounts); targets are found with `elementFromPoint` and
  `data-drop-*` attributes, so sections that scroll and a flyout that opens
  mid-drag need no re-measuring.

## What this plan builds

Tokens and controls (with the sweep as its last task), `Button`, `Menu`,
`useOverlay`, `Toaster` with `toast()`, `Skeleton`, `useShortcuts`, the Undo of
genre changes (`restore_track_genres`) and of heart removal (`saved_at` on
`save_youtube_track`), and the drag layer's building blocks (`useTrackDrag`,
the target attributes) without wiring sources or targets. It removes
`Notification`, `HeaderNotification` and the sidebar toast, and moves every
`transition:` to the tokens.

**Order**: this plan comes **later**, after some of the page redesigns (the
user's choice). A plan that comes before it builds, from this spec, only the
pieces it needs that do not exist yet — e.g. the track table plan builds the
toast with Undo and the drag layer, the Sets plan builds `useOverlay` — to this
spec's rules, so they need no rework. This plan then builds what is still
missing, moves the remaining transitions to the tokens, and does the sweep;
each page plan wires its own Undo rows, drag sources and targets, and
shortcuts as the tables above say.

Built already by track table plan 4: `Menu` (without the confirm in the
menu's place), `toast()` and the `Toaster` (without the detail on hover,
built by plan 5), and `restore_track_genres` with Set / Clear genre's Undo.
Built by track table plan 6: the whole drag layer (`useTrackDrag`,
`startTrackDrag`, the `data-drop-*` targets and `DragGhost`, in
`src/lib/drag/`), with the track table as the source and the sidebar's
playlists, library folders and rail icons as targets; Home's rows are left
for the Home plan.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
  target lookup from `data-drop-*`.
- Rust: `restore_track_genres` writes genre and source as given, including
  back to none and over a user genre; `save_youtube_track` keeps a given
  `saved_at`.
- By hand (WebKit): every control's states; reduced motion; skeletons never
  flash on a fast read; Set genre on a track with a tag genre, Undo, the tag
  genre and its source are back; remove a heart, Undo, it is back in its
  place; Space in a text field types; Space after clicking a button plays /
  pauses; the sweep leaves no page-specific button style behind.

## Out of scope

New features beyond these behaviours, touch gestures, configurable shortcuts.
