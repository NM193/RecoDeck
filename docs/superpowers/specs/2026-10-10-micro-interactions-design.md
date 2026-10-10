# Micro-interactions — Design

## Why

RecoDeck answers the pointer with instant background jumps. Every row, card
and menu item swaps its colour on `:hover`, controls do not respond to the
press, and tooltips are the system's: late, light-coloured and unstyled. This
spec makes hover feel alive. Highlights slide from item to item instead of
jumping, controls spring, and one fast tooltip, in the app's colours, replaces
all the system ones.

The look was picked from interactive mockups during brainstorming. They are
not in the repo. Every value they settled is recorded here.

This spec builds on the [Interactions spec](./2026-10-04-interactions-design.md)
and changes two of its rules:
- **Motion** gains two easings, *soft* and *spring*, for the movements below.
  Everything else keeps `--ease`.
- **Rows and cards** no longer change their own background on hover. A
  sliding highlight shows the hover instead.

## Motion tokens

These are added to `src/styles/globals.css`. The two easings are also mirrored in `src/lib/motion.ts`:

| Token | Value | For |
|---|---|---|
| `--ease-soft` | `cubic-bezier(.22, 1, .36, 1)` | slides, thickening, the flowing gradient |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | pops and zooms that pass full size and come back |
| `--glide-weak` | `color-mix(in srgb, var(--text-primary) 4.5%, transparent)` | the faint grey of the sidebar and the player. On dark themes it equals `rgba(255,255,255,.045)`; on dawn it is mixed from the dark text |
| `--border-strong` | `#3d3d3d` on dark themes, `#d1d5db` on dawn | the border of a secondary button on hover |
| `--accent-flow` | `#8b5cf6` in the built-in themes, `var(--accent-hover)` in `custom` | the middle stop of the primary button's gradient |

The duration of a slide is 240ms soft.

## The glide: one shared sliding highlight

### Core

`src/lib/glide/glide.ts` is framework-free: `createGlide(track, highlight, options)`
returns `{ moveTo(item | null), refresh(), item }`.

**Moving:**
- **Hidden → item:**
  - the highlight jumps to the item with no transition, at `opacity: 0` and
    `transform: <position> <enterFrom>`;
  - it then fades in (160ms) and grows to full size (240ms soft), from the
    item's centre (`transform-origin: center`).
- **Visible → item:** it slides to the new item. `transform: translate3d`,
  `width` and `height` each run 240ms soft.
- **`null`:** it fades out in place (140ms).
- **`refresh()`:** it re-places the current item with no transition, when the
  item has moved or changed size. `moveTo` on the item it is already on does
  this. An item that has left the DOM (a virtualized row scrolled away) leaves
  the highlight where it is.

**Position:**
- The position comes from `getBoundingClientRect()`:
  `x = item.left − track.left − track.clientLeft + track.scrollLeft`, and the
  same for `y` with `top`, `clientTop` and `scrollTop`.
- `clientLeft`/`clientTop` take off the track's border (`.sidebar-ctx-menu`
  and `.dj-export__tree` have 1px borders).
- The deltas and sizes are divided by the track's scale
  (`trackRect.width / track.offsetWidth`, and the same for height). A menu
  opens from `scale(0.98)`, and an item measured during that animation would
  otherwise come out too small and offset, and stay that way.
- The scroll offset counts when the track is itself the scroll container (a
  searchable menu's `.menu__list`), and is 0 otherwise.
- So the core works under transforms (the virtualized track table's
  `translateY` rows) and is not thrown off by scrolling. The highlight lives
  inside the scrolled content and moves with it.

**The highlight's own style:**
- **Corners:** the highlight takes the item's own corner radius (its computed
  `border-radius`, read on each move). Rows and menu items have `--radius-md`;
  folder rows have none.
- **Writing:** styles are written straight to the highlight element. A pointer
  move never re-renders React.

**Options:**
- `enterFrom`: the transform it grows from (table below);
- `tintFor(item)`: optional. A highlight may change colour, as the menu's does
  on Delete. `background-color` then transitions with the slide.

### Hooks

Both hooks take the track's ref and the highlight's ref.

**Options are module constants** (`GLIDE.row`, or a `menuGlide(...)` made at
module level). They are read when the glide is attached.

**`useHoverGlide(trackRef, highlightRef, itemSelector, options)`** follows the
pointer:
- **Events:** a delegated `pointerover` on the track, with
  `item = target.closest(itemSelector)` when that item is inside the track. A
  `pointermove` on the track only records the last pointer position.
- **Gaps:** in a gap between items (inside the track but on no item), it waits
  **80ms** before `moveTo(null)`, so moving between cards does not blink.
  `pointerleave` from the track works the same way.
- **Scrolling:**
  - one capture-phase `scroll` listener on `document` (passive, at most one rAF
    per frame) re-checks what is under the last pointer position with
    `document.elementFromPoint`;
  - this is needed because most tracks are not the scroller, and `scroll` does
    not bubble;
  - a list scrolling under a still pointer moves the highlight to the new item;
  - a `ResizeObserver` on the track does the same re-check, after
    `refresh()`, when rows come or go under a still pointer.
- **Dragging:** while a track is being dragged (`useTrackDragStore`'s `payload`
  is not null), it calls `moveTo(null)` and ignores the pointer. Drop targets
  keep their own highlight.

**`useGlideTo(trackRef, highlightRef, selector, options)`** follows the item
that matches `selector` (the open page, `.menu__item--active`):
- **Measuring:** a layout effect looks it up after every render of its
  component; a `querySelector` is cheap, and `moveTo` on the same item only
  refreshes. It also calls `refresh()` from a `ResizeObserver` on the track.
- **No match:** `moveTo(null)`.
- **`useTabThumb`:** this hook generalizes it, but the tab bars keep
  `useTabThumb` and are not changed.

### Layering

- **The track:**
  - it carries the shared class `.glide-track` (`position: relative;
    isolation: isolate`);
  - that rule lives in `controls.css`, which loads before every page's own
    CSS, so a page's own `position` wins at equal specificity, and
    `.sidebar-ctx-menu` stays `fixed`;
  - **a track must never contain a popup that has to paint outside it,**
    because the isolation caps the popup's z-index:
    - YouTube Music's list menu (`.ytm-list-menu`), today rendered inside
      its list, moves to a portal on `document.body`;
    - the player's right group, which holds the volume popup and the Add to
      playlist menu, is the one exception (see Player bar).
- **The highlight:** an absolute `<span aria-hidden="true" className="glide">`
  at `top: 0; left: 0`, with `z-index: -1` and `pointer-events: none`. Each
  component renders it in its JSX, as one of the track's first children, and
  passes its ref to the hook.
- **Paint order:**
  - inside the track's own stacking context, the highlight paints above the
    track's background and under every item's background and content;
  - an item that keeps a background of its own (a selected row) covers it.
- **`overflow: clip`:** the highlight is a sibling of the items, not a child,
  so an item's `overflow: clip` (`.data-row`) does not cut it.
- **Two highlights in one track** (the sidebar's hover and open page): the
  hover highlight comes first and the open-page one second, so the open page
  paints on top.

### How each highlight appears (`enterFrom`)

| Where | `enterFrom` |
|---|---|
| Rows, sidebar | `scaleY(.4)` |
| Menus | `scaleY(.5)` |
| Cards | `scale(.94)` |
| Icon buttons (the player bar) | `scale(.6)` |

### Reduced motion

Opacity only. The highlight jumps to each item and fades: no growing and no
sliding.

## Rows

**Where:** each of these track lists gets `useHoverGlide`, and its
`:hover { background }` goes:
- the TrackTable (`.data-row`);
- Home (`.home-row`), and the Home cards' news, gigs and sets
  (`.home-news`, `.home-gig`, `.home-set`);
- Search (`.search-view__track-row`, `.search-row`);
- Sets (`.set-row` without its head and skeleton rows, `.saved-row`, and the
  search results' `.sets-found`, which get a list element of their own as the
  track and keep `--bg-secondary` as their hover colour);
- every list built on `.spotify-row--data`:
  - `StreamingListView` (the Spotify and YouTube Music lists);
  - the DJ page's `DjTracksTab` and `DjPlaysTab`;
- YouTube Music's sets (`.ytm-sets__row`);
- the DJ Export modal's playlist list (`.dj-export__row`).

**What changes:**
- **Highlight:** `--bg-tertiary`, `enterFrom: scaleY(.4)`.
- **Number → play:** in every list that has them (the TrackTable, Search,
  Home and Sets):
  - the number (or the equalizer) and the ▶ sit in the same cell, one over the
    other, and cross-fade with opacity (120ms) on hover;
  - this replaces the swaps there today: `display` in the TrackTable and
    Search, `visibility` in Sets, and an opacity change with no transition on
    Home.
- **Keyboard:**
  - the TrackTable's ▶ gets `tabIndex={-1}`. The table has its own keys
    (↑ ↓, Enter plays), so a hidden ▶ on every rendered row must not become
    a Tab stop;
  - Home and Sets keep their ▶ in the Tab order, as today.
- **Hover-only extras:** the heart and ⋯ from the mockup have no counterpart
  in the app's rows, and **no new hover-only buttons are added**. The Sets
  rows' store links keep showing on hover as they do today.
- **A selected or playing row:**
  - it keeps its own opaque background, and the highlight passes under it;
  - the stronger tint for hover on a selected or playing row stays;
  - **Sets:** the playing row's tint (`.set-row--now`) is translucent, so the
    highlight shows through it. That reads as its hover state, and it is kept.

### The TrackTable's sticky cells

`.cell-index` and `.cell-art` are `position: sticky` and wear `--row-bg`. It is
opaque so that they cover the cells scrolling under them sideways. A row that
turned transparent would leave them as a dark block over the highlight. So:
- **Plain rows:** `--row-bg` becomes `transparent`. The table body behind is
  `--bg-primary`, so nothing looks different at rest.
- **Not scrolled sideways:** the sticky cells are transparent too.
- **Scrolled sideways:**
  - a **new** passive `scroll` listener on the scroll area (`parentRef`,
    `.track-table-scroll-area`) toggles `.track-table--scrolled-x` while
    `scrollLeft > 0`. Today only the virtualizer listens to that element;
  - while the class is on, a plain row's sticky cells are opaque again
    (`--bg-primary`); selected and playing rows keep their own tint;
  - under the pointer they fade to the hover colour (240ms soft) instead of
    showing the highlight.
- **Virtualization:** the highlight sits in the virtualizer's inner element
  with the rows. It is measured with `getBoundingClientRect`, so the rows'
  `translateY` does not matter.

## Sidebar

**Hover:**
- `--glide-weak` slides between items (`enterFrom: scaleY(.4)`).
- The hovered item's icon and label move 3px right (240ms soft). Its count and
  a folder's arrow stay put.

**The open page:**
- A translucent accent, `rgba(var(--accent-rgb), .2)`, slides to the item that
  is open (`useGlideTo`). There is no accent bar.
- The text is `--text-primary`.
- The icon keeps its section colour, as today (`colourFor`, the accent unless
  the user picked one).
- **Changed:** an open playlist or folder (`.folder-row.selected`) moves from a
  solid accent with white text to this translucent accent, so "open" looks the
  same across the sidebar.

**One glide pair per container:**
- The nav (`.sidebar-nav`) is outside `.sidebar-scroll`, and each section
  (Folders, Playlists, Spotify, …) scrolls its own list. Each of these
  containers has its own hover glide and its own open-page glide.
- Inside one container the open-page highlight slides.
- **Across containers:**
  - when the open page moves from the nav to a playlist, the nav's highlight
    fades out in place and the playlist's grows in;
  - sliding across a scroll area's edge would be clipped, and would not follow
    its scroll.

**Rail (collapsed sidebar):**
- It gets the same hover and open-page glides.
- `.sidebar-rail__item--active` is set both on the open section and on the
  section whose flyout is open. So the open-page glide follows a new
  `aria-current="page"`, which only the open section's item carries.
- Its hand-made tooltip (`SidebarRail.tsx`, `.sidebar-tooltip`) is replaced by
  the tooltip system in plan (c), not here.

## Menus

**The shared `menu/Menu.tsx`**, used by the TrackTable, FolderTree, SetPage
and PlaylistDetailHeader:
- **The highlight:**
  - `rgba(var(--accent-rgb), .22)` slides between items
    (`enterFrom: scaleY(.5)`);
  - it follows `.menu__item--active` through `useGlideTo`. Both the pointer
    and the arrow keys set `active`, so they move it alike;
  - when `active` becomes `-1`, it fades out in place;
  - `.menu__item--active` loses its own background.
- **The track** is the `<div>` that wraps the items (`Menu.tsx`, the one with
  `className={search ? 'menu__list' : undefined}`). It gets a class of its own,
  `menu__items`, and is the same element in every menu:
  - in a plain menu, the panel (`panelRef`, `.menu`) scrolls around it;
  - in a searchable menu, it is `.menu__list` and scrolls itself. The core
    then adds its `scrollTop`.
- **The active item:** its icon turns `--accent-hover`, and a submenu's
  chevron moves 2px right (soft).
- **Delete** (`danger`): while it is active, the highlight turns
  `rgba(var(--color-danger-rgb), .2)`, and its colour changes as it slides.
  The danger text colour stays as it is.
- **A submenu** has its own glide.

**`.sidebar-ctx-menu`** (Sidebar, SidebarColourMenu, the YouTube Music lists):
these menus hover in CSS only. They get `useHoverGlide` with the same look,
the red tint included on Remove/Delete.

- Their items are full-width, so they get `border-radius: 0`. The
  `<label>` (Custom colour…) and the buttons would otherwise have different
  corners.
- YouTube Music's **Remove** item gets a modifier class,
  `sidebar-ctx-menu__item--danger`, for the red tint.

**Other dropdowns get the same accent highlight:**
- **`SelectMenu`:** follows `.select-menu__option--active` (`useGlideTo`). Its
  list is a `<ul>`, so the highlight there is an `<li role="presentation"
  aria-hidden="true">`.
- **The Sets search box:** follows `.sets-box__row--active` (`useGlideTo`).
- **The player's Add to playlist menu:** `.now-playing-bar__playlist-item`
  (`useHoverGlide`).
- **`DjCandidatesMenu`:** `.dj-menu__choice:not(:disabled)` (`useHoverGlide`).

Hover glides skip disabled items, as today's `:hover` rules do: a disabled
button still gets `pointerover`.

**Not included:** the ChatView menu, the Recommendations panel and the AI
playlist dialog. AI is turned off (`AI_ENABLED = false`), so none of them can
be reached or tried.

**Reduced motion:** the highlight only fades, and the chevron does not move.

## Cards

**Every card type gets a hover glide** (`enterFrom: scale(.94)`).

| Card (glide item) | Today | Highlight colour |
|---|---|---|
| Search tile (`.search-tile`, 150px square, horizontal scroll) | no fill, no padding | `--bg-tertiary` |
| Search DJ card (`.search-view__dj-card`) | `--bg-secondary` fill | `--bg-tertiary` |
| Search playlist card (`.search-view__playlist-card`) | `--bg-secondary` fill | `--bg-tertiary` |
| Home playlist tile (`.home-playlist`, which holds `.home-playlist__open` and the play button) | `--bg-tertiary` fill on `__open` | `color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 6%)` |
| Set card (`.set-card`) | no fill | `--bg-tertiary` |
| Search DJ tile (`.search-dj`), Home DJ (`.home-dj`), Sets' new finds (`.new-find`) | as today | today's hover colour |

**Cards with no fill** get 8px of padding and `--radius-lg`, so the highlight
shows around the cover:
- **Search tiles:**
  - the cover stays 150px, so the tile becomes 166px;
  - `.search-tiles`' gap drops from 14px to 0, so the covers end up 16px
    apart;
  - `margin-inline: -8px` keeps the first cover aligned with the heading
    above.
- **Set cards:** `.set-cards`' gap drops from 16px to 0 and gets the same
  `-8px` inline margin, so the covers stay where they are.

**Cards with a fill:**
- While hovered, the card's own background fades to transparent (240ms soft)
  as the highlight arrives underneath it, in today's hover colour.
- **Home:** the rule is keyed on `.home-playlist:hover .home-playlist__open`.
  Moving onto the play button therefore stays on the same card and is not a
  gap.
- The colours stay what they are today, and only the movement is new.

**The play button pops.** This applies only where a card already has one; no
new play buttons are added:
- **Search tile:** the play button becomes a round accent button at the
  cover's bottom right.
- **Home playlist tile:**
  - its 44px cover is too small for a corner button, so the play button
    becomes a round 32px accent button at the tile's right end, centred
    vertically;
  - `.home-playlist__open` gets enough right padding that the button never
    covers the name or count;
  - today's dark square over the cover goes.
- **The pop:**
  - `opacity: 0; transform: translateY(10px) scale(.4)` → `opacity: 1; transform: none`;
  - opacity runs 180ms and the transform 420ms spring;
  - on hover of the button itself: `scale(1.08)`.
- Keyboard focus shows the button as hover does.

**Set cards** keep their `brightness(1.1)` on the thumbnail. The duration badge
keeps the bottom-right corner.

**Reduced motion:** the play button only fades.

## Player bar

### Transport

`NowPlayingBar`: shuffle, previous, play, next and repeat. The buttons are
already 28px with a 6px radius; only their movement changes.

**Small buttons:**
- A grey rounded square slides between them (`useHoverGlide` on the transport
  group, `enterFrom: scale(.6)`). Its colour is the mockup's, a little
  stronger than the sidebar's: `color-mix(in srgb, var(--text-primary) 8%,
  transparent)`.
  - Play is skipped, because it has its own white background.
  - A disabled button (no track) is skipped too.
- The button springs to `scale(1.12)` on hover (280ms spring).
- A press shrinks it to `scale(.88)` (90ms).

**Play:**
- a 36px white rounded square, as today;
- **hover:** `scale(1.1)` (320ms spring) with a ring,
  `box-shadow: 0 0 0 5px rgba(var(--accent-rgb), .3)` (280ms);
- **press:** `scale(.9)`;
- **play ↔ pause:**
  - both icons sit one over the other, and cross-fade (opacity 160ms,
    transform 320ms spring);
  - hidden, play is `rotate(90deg) scale(.5)` and pause is
    `rotate(-90deg) scale(.5)`;
  - so going to pause, play turns away clockwise as pause turns in after it,
    and going back reverses it.

**Toggles when on** (shuffle, repeat, and the EQ button, which uses the same
`--toggle.--active` classes):
- the accent colour only;
- the dot (`::after`) goes;
- the repeat-one "1" badge stays.

**Accessibility:** these buttons have only a `title` today. They get an
`aria-label` in plan (c) (see Tooltips).

### The right-hand actions

The icon buttons on the bar's right (mute and the `.now-playing-bar__btn--action`
buttons; `.now-playing-bar__right .now-playing-bar__btn:not(:disabled)`) have
no hover background today. They get the transport's look: the same grey slides
between them (`enterFrom: scale(.6)`), and the button springs to 1.12.

The volume popup and the Add to playlist menu open upward from this group.
An isolated track would cap their z-index, so its track gets `z-index: 150`,
today's value of the volume wrapper:
- the group as a whole stays above the main area;
- it stays under the expanded now-playing view (`.now-playing-expanded`,
  fixed, z 200), which today covers these buttons.

**Reduced motion:** no scaling, rotation or spring. The colour changes stay.

## Progress bar

**On hover or while dragging** (`--hover`):
- **Thickness:** the track, the fill and the hover fill go from 3px to 6px
  (240ms soft), with their corners rounding along. The 16px hit area does not change, so nothing around it moves.
- **Fill:** it turns accent, as today.
- **Hover fill:** the lighter part from the position to the pointer (it
  exists today) moves from `rgba(255,255,255,.3)` to
  `color-mix(in srgb, var(--text-primary) 30%, transparent)`, so it shows on
  dawn.
- **Handle (12px):** it springs in from `scale(0)` (320ms spring, opacity
  120ms) instead of today's fade.
- **The time bubble:**
  - it follows the pointer and springs up as it appears, from
    `opacity: 0; translate(-50%, 6px) scale(.8)` to `translate(-50%, 0)`
    (280ms spring, opacity 120ms). The handle's and the bubble's new
    transforms keep their `translate(-50%…)` centring;
  - it stays its own element, outside the tooltip system.

**Reduced motion:** the thickness and the colours change without animating,
and the handle and the bubble only fade.

## Stars

`StarRating` is used in the TrackTable's Rating column.

As in the mockup (its curve, `cubic-bezier(.34, 1.4, .64, 1)`, is a softer
spring than `--ease-spring`):

**The wave:**
- Each star's colour changes over 150ms, after a delay of 24ms × its index
  (0–4). Lighting and dimming both ripple from the left.
- **The pulse:** each star that newly lights pulses, `scale` 1 → 1.22 (at 45%)
  → 1, over 280ms.
  - Its delay is 24ms × its distance from the first star that newly lit, so
    from 2 to 4, stars 3 and 4 pulse 0 and 24ms apart.
  - The star under the pointer does not pulse; it zooms.

**Zoom:** only the star under the pointer zooms, to `scale(1.28)` (260ms, no
delay).

**Implementation:**
- the pulse is a Web Animations call (`element.animate`), made in a layout
  effect when the shown value grows;
- it runs on an inner glyph span, `.star__glyph`, so it never fights the
  button's own zoom;
- no class juggling, and nothing re-renders.

**What stays:**
- the preview fill (`display = hovered ?? value`), which exists today;
- a `readonly` rating, which gets none of this.

**Reduced motion:** colour only.

## Buttons

`src/styles/controls.css`. There is no movement on hover.

**Secondary (`.btn`):**
- keeps today's 6% lighten and `--text-primary`, and also gets
  `border-color: var(--border-strong)`;
- `:active` keeps `scale(.97)`;
- the TrackTable toolbar's Filter and Columns are `.btn`s, so they get this
  too.

**Primary (`.btn--primary`), the flowing gradient:**
- `background-image: linear-gradient(110deg, var(--accent) 0%, var(--accent) 35%, var(--accent-flow) 65%, var(--accent-hover) 100%)`;
- `background-size: 220% 100%`;
- `background-position` goes from `0 0` to `100% 0` on hover, 700ms soft;
- `:active` stays a darker solid accent;
- with reduced motion: no flow, `--accent-hover` instead.

**Danger (`.btn--danger`):** unchanged.

**Icon toolbars:**
- The mockup's icon toolbar has one real counterpart, the player bar's
  right-hand actions (see Player bar).
- `.btn--icon` is only used alone (Settings, `DjCandidatesMenu`), and keeps
  today's hover.

## Tooltips

### The layer

- **One layer:**
  - a single `<TooltipLayer/>`, in a portal, at `position: fixed` and
    `z-index: 10002`, above `.menu` (10000) and `.modal-overlay` (10001);
  - it is mounted at the top of `App`'s render, before the `#mini-player`
    branch, so the MiniPlayer window gets it too.
- **Events:** delegated listeners on `document`: `pointerover` and
  `pointerout`, plus `focusin` and `focusout`, which count only when the
  element matches `:focus-visible`.
- **Attributes:**
  - `data-tip="Next"`: the text;
  - `data-tip-keys="next"`: optional. The keys come from `SHORTCUT_ROWS`
    through a new `shortcutKeys(id)`:
    - each row in `SHORTCUT_ROWS` gains an `id`;
    - `⌘` is written through `modKeyLabel()`, so Windows shows Ctrl, as the ⌘/
      sheet does;
    - a tooltip's keys therefore never drift from the sheet;
  - `data-tip-overflow`: show only while the text is cut off (see Migration);
  - `data-tip-side`: `top`, `right` or `bottom`, read from the closest
    ancestor that has it. The default is `bottom`. `NowPlayingBar` sets `top`
    and the sidebar rail sets `right`.
- **When no tooltip shows:**
  - inside an element marked `data-tip-off`. While its flyout is open, the
    rail sets it on `.sidebar-rail__nav` and the avatar, as its own tooltip
    does today. The flyout's own rows keep their tips;
  - while a track is being dragged (`useTrackDragStore`'s `payload` is not
    null).
- **Pure logic:** the timing and the placement are pure functions
  (`src/lib/tooltip/`), tested on their own.

### Look

- **Surface:** `--bg-elevated`, a 1px `--border`, 6px radius, 26px tall,
  0 8px of padding, 11.5px weight 500, `box-shadow: 0 8px 20px rgba(0,0,0,.45)`.
  It wraps at 280px for long text.
- **Shortcut chips:** 10.5px, `--text-secondary`, a faint background, a 1px
  border and a 4px radius. For example Play `Space`, Previous `⌘` `←`,
  Next `⌘` `→`.
- **Appearing:** it fades in (140ms) and rises 4px (180ms soft).

### Timing

- **First tooltip:** it shows **200ms** after the pointer settles on an element.
- **Warm:** for **400ms** after a tooltip hides, the next one shows at once.

### Gliding

- **If a tooltip is visible** and the pointer moves to another element with a
  tooltip, the same tooltip **glides** there:
  - `left`, `top` and `width` run 260ms soft, and the new width is measured
    from the new content;
  - the text cross-fades: 110ms out, then in.
- **If the tooltip is hidden but warm,** the new one appears in place at once,
  with no glide.

### Placement

- **Side:** the tooltip goes on its side, centred on the element, with a 6px
  gap.
- **Flip:** with no room on that side, it goes on the opposite side.
- **Edges:** horizontally it is kept 8px inside the window.

### Hiding

- **When:** the pointer leaving, a press, any scroll, `Esc`, the window losing
  focus, or the element leaving the DOM. An element that leaves the DOM while
  its tip waits gets no tip at all.
- **After a press or `Esc`:** the element gets no tip again until the pointer
  leaves it.
- **Keyboard:**
  - a tooltip shown by keyboard focus hides on `focusout`;
  - `Enter` or `Space` hides it too, since pressing may change what it would
    say (Play turns into Pause).
- **Hidden means hidden:** once faded out, the tooltip is `visibility: hidden`,
  so a screen reader cannot reach its stale text.

### Accessibility

- **Role:** the layer has `role="tooltip"`.
- **No `aria-describedby`:** the target's accessible name carries the text, so
  the layer does not set it.
The migration handles three cases:
- **No visible text** (icon-only buttons, the transport, a glyph like `✕` in
  `.search-clear`): `aria-label` = the tip.
- **Visible text that says the same** as the tip: nothing.
- **Visible text that says something else** ("Connect…" with "Save the Client
  ID first", "Recommend" with "Get AI recommendations for this playlist",
  "Yes" with "This is the file"):
  - `aria-description` = the tip, so the visible name stays the name and the
    tip stays a description, as `title` gave it;
  - Chromium and WebKit both expose `aria-description`.

### Migration

- **What moves:** every `title` attribute on a **JSX HTML element** becomes
  `data-tip`: 112 attributes in 46 files (counted with the TypeScript AST on
  2026-10-10). No code sets `title` outside JSX, and `mobile/` has none.
- **What does not:**
  - a `title` prop on a component (`Modal`, `Section`, …) stays. There are 29;
    28 stay, and `Button`'s one call site migrates (below).
    Where a component forwards its `title` prop to a DOM `title`, that inner
    attribute is one of the 112, and it migrates in the component;
  - the unused `Player.tsx` (11) is skipped.
- **The shared `Button`** (`src/components/Button.tsx`) forwards `title`
  through `{...rest}`:
  - so its call sites with `title` (`settings/YouTubeSection.tsx`, and any
    other `grep` finds) migrate to `data-tip` as well;
  - the ESLint rule also forbids `title` on `Button`.
- **Truncated text:** a `title` that only repeats the element's visible text
  (a set's name, a TrackTable cell) is there for when that text is cut off.
  - It migrates with `data-tip-overflow`, and the layer shows it only while the
    element's text, or a descendant's, overflows (`scrollWidth > clientWidth`).
  - Otherwise, a 200ms tooltip on every cell would follow the pointer across
    the table.
- **A new ESLint rule** (`no-restricted-syntax`, for `src/**/*.tsx`) forbids
  `title` on JSX HTML elements, on `motion.*` elements and on `Button`, so system tooltips do not come back. It
  ignores `src/components/Player.tsx`, which is unused and out of scope, so
  `npm run lint` stays clean.

### Disabled buttons

`.btn:disabled` keeps its pointer events on purpose, "so a title saying why
still shows". Checked on 2026-10-10 with Playwright: both WebKit (WKWebView's
engine) and Chromium (WebView2's) dispatch `pointerover` to a disabled
`<button>`. The layer sees disabled buttons, and no wrapper is needed.

### Reduced motion

No glide and no rise; the tooltip only fades.

## Out of scope

- the MiniPlayer's seek bar and the volume slider;
- the ChatView menu (AI is turned off);
- new play buttons on cards that have none (DJ, Search playlist, Sets);
- new hover-only buttons on rows (the mockup's heart and ⋯);
- the `.btn--danger` hover;
- deleting the unused `Player.tsx` / `Player.css`.

## Testing

**Unit tests** (vitest, jsdom; there is no layout, so the logic is tested with
fake rects and fake timers):
- **The glide core:**
  - the position math (rects, the border through `clientLeft`/`clientTop`,
    and the scroll offset when the track scrolls);
  - the order of states: appear (jump, then grow), slide, the 80ms gap grace,
    and fading out on `null`;
  - reduced motion (no transform transition).
- **The tooltip:**
  - timing: 200ms first, the 400ms warm window, and gliding only while visible;
  - placement: side, flip, and clamping at the edges.
- **Shortcuts:** `shortcutKeys(id)` matches `SHORTCUT_ROWS` and uses
  `modKeyLabel()`.
- **Stars:** the wave's delays (which stars light, and where the wave starts).
- **ESLint:** the rule rejects `<button title="x">` and accepts
  `<Modal title="x">`.

**Visual check:**
- the WebKit harness (Playwright WebKit, mockIPC) in the midnight and dawn
  themes. The primary button's gradient is also checked in carbon (blue
  accent) and neon (magenta);
- then the user tries each part in `tauri dev`.

## Delivery

Three plans, in order, on `feat/micro-interactions`:
- **(a)** the glide core and the tokens, then rows, the sidebar and menus;
- **(b)** cards, the player bar, the progress bar, stars and buttons;
- **(c)** the tooltip layer, the `title=` migration, the rail's tooltip and the
  ESLint rule.

Nothing ships between parts. All three ship together as **0.7.0**, once the
user has tried each one.
