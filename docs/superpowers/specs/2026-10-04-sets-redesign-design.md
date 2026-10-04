# Sets, Redesigned — Design

## Why

Sets works, but it looks and reads badly: a "Set" tab with a box, a quota
line and a hint; an open set as a title over a row of small text buttons
("play here", "open in browser", "look again · 5–7 units"), a paragraph of
summary, then dense rows; a library that is a plain list; a video that closes
the moment you switch tab or leave Sets. What Sets does stays, apart from the
two things "Dropped" names; the page around it is rebuilt.

Mockup (approved): [`2026-10-04-sets-redesign-mockup.html`](./2026-10-04-sets-redesign-mockup.html)
— option **A**: Sets opens on its **library**, and a set opens on a **page of
its own**, full width, like a DJ page. Every button has a **6px** corner
radius. The track playing is marked by the **equalizer** of the Home spec.

## Sets home: the library

From the top:

1. **One box**: "Paste a set link, or type a DJ's name", with the quota under
   it ("9,340 units left today · a set costs 5–7 · reopening one costs
   nothing"). What the box offers depends on what is in it, in a **dropdown
   under the box**:
   - **A YouTube link** → one row, "Open this set · 5–7 units", or "In your
     library · free" when the set is stored. Enter or a click opens the set
     page (fetching and storing it first, as Process does today).
   - **Text, 2 characters or more** → free results from what is stored, as
     you type: **Your sets** (title, DJ or channel contains the text; at most
     5) and **Tracks in your sets** (today's "Where did I hear this?",
     `searchYouTubeTracks`; at most 8), each opening the set — a track at its
     cue, playing from there. The last row is always **Search YouTube for sets
     by "…" · 101 units**; only that row spends quota. Its results **replace
     the page below the box**, as today's found list does (thumbnail, title,
     channel, date, length, "12 tracks in the description" or "no tracklist",
     "in your library"), each opening at 5–7 units; Esc or clearing the box
     returns to the library.
   - **Empty** → no dropdown.
   A DJ page's **Find more** opens Sets with the DJ's name in this box (today's
   `initialQuery`), nothing spent until the YouTube row is chosen.
2. **Tabs**: Library (count) · Saved tracks (count) · Following (badge) ·
   Stats. On the right of the Library tab: **By DJ** / **Newest**.
3. **New from DJs you watch** (Library tab only): the unseen finds of the Home
   spec's "New sets" (`yt_dj_finds.seen_at`), newest first, as cards —
   thumbnail, DJ, title, "saved" or "opening costs 5–7". A card opens the set.
   **Mark all seen** at the row's right. Hidden when there are none.
4. **Your sets**: cards in a grid of 4 (3 below 1100px) — the YouTube
   thumbnail (`mqdefault`) with the length on it, the title on two lines, then
   "channel · 41 tracks" ("no tracklist yet" when it has none). **Newest**:
   one grid, by date saved. **By DJ**: a heading per DJ (the name links to the
   DJ page, with the set count), each with its grid; DJs with the most sets
   first, as today's grouping.

Empty library: "Nothing here yet — paste a set link or type a DJ's name above."

**Back** to the library restores its tab, grouping and scroll: they are kept in
App (beside `SetsStart`), so they survive Sets being remounted by a trip
through a DJ page.

## The set page

The **hero stays put**; only what is under it — the strip, the filter and the
rows — scrolls, as on a DJ page (`DjView.css`). The video lives in the hero's
box and must not scroll (see Playing).

**Back**: "‹ Sets" at the top.

**Hero**, on a dark warm gradient:
- left: the thumbnail (`hqdefault`), 300px wide, 16:9, with the length; this
  box is where the video plays;
- right: the title; the DJs as links to their pages (`billingParts`, "b2b" /
  "vs" between them, as today), then "· channel · saved Sep 27";
- the numbers: **41** tracks · **3** lists · **3** you own (green) · **37**
  missing · **1** ID — parts with nothing left out;
- a muted line for the source and status: "from 3 crossed lists · strongest
  source: the description" (or "comment by …"), with today's status label when
  it is not plain ("assembled from comments", "low confidence"), and any
  notice ("Found 4 more tracks");
- **Play set** (accent) and **⋯**. The ⋯ menu: Open on YouTube · Look again
  for a tracklist (5–7 units) · Copy missing tracks (37) · Remove from library
  (asks first; a set that is playing stops first). Look again on a playing set
  keeps it playing and replaces its rows.

**Strip**: today's `SetTimeline` as it is (each record a block, its height the
tempo when owned, unknown blocks red, the playing block in the accent colour,
the current position), full width under the hero. A list with no timestamps
shows today's sentence instead.

**Filter**: All 41 · You own 3 · Missing 37 · IDs 1 (IDs is new: only the
unknown rows). Shown when the set has a tracklist.

**Track rows**, columns: # · Time · Track · Lists · You own · ♡.
- **#**: the index; the equalizer while the video is inside this track.
  Hovering a row turns its number into ▶, which plays the set from this track;
  hovering the row playing shows a pause icon, which pauses the video (as on
  Home).
- **Time**: the cue.
- **Track**: "artist — title (mix)", with today's " ?" on an uncertain row; a
  second, muted line when there is one of today's extras: "or: …" (other
  lists' names, with their votes), "maybe: …" (a suggestion for an ID), "asked
  3×, no answer". An ID reads "ID". On hover, the store links (Beatport ·
  Discogs · Bandcamp · Spotify) follow the title.
- **Lists**: votes / lists ("2/3"), dim when a lone list disagrees; "comments"
  for a row from the comments.
- **You own**: "▶ have it" (a 6px pill; plays your file in the bottom player,
  queue = the owned tracks of the set, as today) or "missing".
- **♡**: saves the track to Saved tracks, as today.
- An untimed list has no Time and no ▶; a row with a timed copy elsewhere shows
  "↳ 12:30", which opens that set and plays it from there, as today.

After the rows: **Named without a timestamp**, as today, restyled. A set with
no tracklist shows today's sentence ("Nothing in the description…") under the
hero.

**Opening a set** (from a card, a new find, a track hit, an echo, a Saved
track, a DJ page, Home): the page opens at once with what is known (the
thumbnail and title from the card or hit) and skeleton rows while it reads; a
set that is not stored is fetched (5–7 units) as today. A fetch failure or a
quota refusal shows on the page in place of the rows ("Couldn't read this set:
…", with Try again) and as an error toast (Interactions spec). Opening a set
marks its video's finds seen (Home spec), on every open. Opening at a track (a
hit, an echo, a Saved track) scrolls to that row and plays the set from its
cue, replacing whatever set was playing; opening from a card or a new find
does not start playback.

## Playing

**Play set**, or ▶ on a row, opens the video in the hero's box, which grows to
440px wide while this set plays on its page. Under the video, today's
**TrackScrubber** (the bar for winding through the one record playing) stays.
The hero's buttons become **Pause / Play**, **⏮**, **⏭** and **✕ Stop**, then
⋯. ⏮ and ⏭, the equalizer and every label of "what is playing" follow the
track the playhead is in (today's `currentTrack`, from the panel's position),
not the last row clicked — so ⏮ / ⏭ work right after Play set and after the
video runs on.

**Leaving the set page** — back to the library, to another set's page, to Home
or anywhere in the app — keeps the video playing in a **bar above the bottom
player**: the small video, "17:00 Raw Instinct — De La Bass" over the set's
title, ⏮ ⏸ ⏭ ✕. Clicking the bar's text opens the set page again; ✕ stops and
closes it. Opening another set's page while one plays leaves the playing one in
the bar until Play set is pressed there (or a track of it is opened, above).

**Where the panel sits.** The video is today's native child webview, placed
over a DOM box; it cannot scroll and it draws above the page. So:
- it sits in the hero's box exactly while the playing set's page is mounted
  with its hero box; otherwise it sits in the bar's box, and the bar shows
  exactly then. The handoff waits for the view change to finish (App's 0.2s
  fade), so the panel never points at a box that is leaving;
- it follows its box every frame the box moves or resizes — a
  `requestAnimationFrame` check of the box's rectangle while a set plays,
  sending new bounds only when they change — so a sidebar collapse, a banner
  above the content or a window resize never leaves it behind;
- **while any overlay is open** — a modal (prompt, delete-folder, EQ), a
  context or ⋯ menu, a popover (Filter, Columns), the expanded player — it is
  moved off-screen through the existing `set_youtube_panel_bounds` and keeps
  playing, then put back when the last overlay closes. Overlays report
  themselves through one small App hook (`useOverlay`), which every overlay
  component calls;
- if the panel cannot be shown, the set opens in the browser, as today.

This moves the set player out of `SetsView` into App: a `useSetPlayer` hook
that holds the playing set (its video, url and parsed tracks — the bar needs
them while Sets is not mounted), the panel's state, and which box the panel
sits in; and a `SetPlayerBar` beside the bottom player. Today's rule that
leaving Sets closes the video goes.

Your own file and the set's video do not play over each other: starting a
file in the bottom player pauses the video, and Play / ▶ on the set pauses the
bottom player.

## Saved tracks

Rows in the set page's style: cue · "artist — title (mix)" over the set's
title (a link that opens that set at the cue) · store links · ♥ (removes it).
**Copy list** at the top right, as today. Empty: "Heart a track in any set to
keep it here."

## Following

Above two lists, today's box ("Follow a channel, or watch a DJ by name"),
deciding as today: a channel link, handle or id follows the channel; a bare
name offers **Watch "…" as a DJ** or **Search for a channel anyway · 100
units** (today's `bareName` guard). The check-all buttons stay at the top of
each list.

- **DJs you watch** (with **Search all now · N×100 units**): round photo (the
  DJ's `imageUrl` from `get_known_djs`, else the initials — read-only, no
  profile is created), the name (links to the DJ page), "checks: Never / Daily
  / Weekly", the auto-import switch ("fetch new sets automatically"), last
  checked, **Check now · 100 units**, Unwatch. A row expands to **everything
  found so far** (`listYouTubeDjFinds`), seen or not — the free way back to a
  find after Mark all seen.
- **Channels you follow** (with **Check all · 1–2 units each**): title and
  handle, the check select, last checked, **Check now · 1–2 units**, Unfollow.
  A row expands to its recent uploads (`listYouTubeChannelUploads`), as today.

A check's news shows as today: a DJ's finds land in the library's **New from
DJs you watch**; a channel's new uploads show under that channel for this
session (as today, in memory), until opened or dismissed — dismissing marks the
channel seen up to its newest upload (`markYouTubeChannelSeen`), as today. The
Following badge counts both: unseen DJ finds plus this session's channel news.

Per-row checks need two new commands that check one item:
`check_youtube_dj(name_key)` and `check_youtube_channel(channel_id)`, beside
today's check-all `check_youtube_djs` and `check_youtube_channels`.

## Stats

Four cards in a grid, in Home's quiet card style: **Most played** (artists and
counts), **Doing the rounds** (records in more than one set), **Most gaps**
(sets with the most IDs; a row opens the set), **Quota** (spent, left, resets
in). The summary line above them stays ("29 sets · 412 named tracks · 37 still
unidentified").

## Dropped

- The **minimise / "video"** toggle: the video is small exactly when you are
  not on its page (the bar); on the page it is the hero's.
- The hero's **♡** of the mockup: hearts stay on tracks.

## What changes in the code

- `SetsView.tsx` (2,179 lines) is split: the library page, the set page, the
  track row, the box and its dropdown, Saved, Following and Stats become their
  own components under `src/components/sets/`; parsing, matching and the stored
  data are untouched.
- The `'set'` tab goes; `SetsStart` gains the page to open (`library` or a
  set, optionally at a cue), so Back from a DJ page, Home's "New sets" and Open
  in Sets keep working.
- The set player moves to App as above, with `useOverlay`.
- New commands: `check_youtube_dj(name_key)`, `check_youtube_channel(channel_id)`.

**Depends on** the Home spec's `yt_dj_finds.seen_at` (migration 018),
`get_new_dj_finds`, `mark_dj_finds_seen`, `mark_all_dj_finds_seen` and the
equalizer component; **this plan includes whichever of them do not exist yet**
when it is written. Plan order: (1) the set player into App with
`SetPlayerBar` and `useOverlay`; (2) splitting the components and the set page;
(3) the library and the box; (4) Following, Saved and Stats.

## Testing

- TypeScript: what the box offers for a link, a stored link, text and empty;
  the filter counts (IDs only unknown rows); the hero's numbers with parts
  left out; By DJ grouping order; which box the panel belongs in (page mounted
  or not); ⏮ / ⏭ from the playhead's track.
- Rust: `check_youtube_dj` and `check_youtube_channel` check only their item
  (with the network mocked as the existing check tests do).
- By hand (WebKit): paste a link (stored and not), type a DJ (free results
  first, YouTube only on its row); open a set from each place; Back keeps the
  library's tab and scroll, also after a DJ page; Play set then ⏭ at once; let
  the video run into the next track and ⏮ / ⏭ follow it; the hero stays while
  the rows scroll; leave to Home and the bar keeps playing; collapse the
  sidebar and the video follows; open a context menu, the EQ, a prompt over
  the bar — the video steps aside and comes back; ✕ stops; a file from "have
  it" pauses the video; opening a Saved track plays that set at its cue;
  Following's per-row checks and expanding rows; every button is 6px.

## Out of scope

Changes to how tracklists are read or matched, other new network features, and
anything on the DJ pages.
