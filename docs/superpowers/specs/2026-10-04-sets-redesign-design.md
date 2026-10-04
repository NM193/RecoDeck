# Sets, Redesigned — Design

## Why

Sets works, but it looks and reads badly: a "Set" tab with a box, a quota
line and a hint; an open set as a title over a row of small text buttons
("play here", "open in browser", "look again · 5–7 units"), a paragraph of
summary, then dense rows; a library that is a plain list; a video that closes
the moment you switch tab or leave Sets. Everything Sets does stays; the page
around it is rebuilt.

Mockup (approved): [`2026-10-04-sets-redesign-mockup.html`](./2026-10-04-sets-redesign-mockup.html)
— option **A**: Sets opens on its **library**, and a set opens on a **page of
its own**, full width, like a DJ page. Every button has a **6px** corner
radius. The track playing is marked by the **equalizer** of the Home spec.

## Sets home: the library

From the top:

1. **One box**: "Paste a set link, or type a DJ's name", with the quota under
   it ("9,340 units left today · a set costs 5–7 · reopening one costs
   nothing"). What the box offers depends on what is in it:
   - **A YouTube link** → one row, "Open this set · 5–7 units", or "In your
     library · free" when the set is stored. Enter or a click opens the set
     page (fetching and storing it first, as Process does today).
   - **Text, 2 characters or more** → free results from what is stored, as
     you type: **Your sets** (title, DJ or channel contains the text) and
     **Tracks in your sets** (today's "Where did I hear this?",
     `searchYouTubeTracks`), each opening the set — a track at its cue. The
     last row is always **Search YouTube for sets by "…" · 101 units**; only
     that row spends quota. Its results replace the page below the box, as
     today's found list does (thumbnail, title, channel, date, length, "12
     tracks in the description" or "no tracklist", "in your library"), each
     opening at 5–7 units.
   - **Empty** → the page below.
2. **Tabs**: Library (count) · Saved tracks (count) · Following (badge with
   new finds) · Stats. On the right of the Library tab: **By DJ** / **Newest**.
3. **New from DJs you watch** (Library tab only): the unseen finds of the Home
   spec's "New sets" (`yt_dj_finds.seen_at`), newest first, as cards —
   thumbnail, DJ, title, "saved" or "opening costs 5–7". A card opens the set
   (and marks it seen). **Mark all seen** at the row's right. Hidden when there
   are none.
4. **Your sets**: cards in a grid of 4 (3 below 1100px) — the YouTube
   thumbnail (`mqdefault`) with the length on it, the title on two lines, then
   "channel · 41 tracks" ("no tracklist yet" when it has none). **Newest**:
   one grid, by date saved. **By DJ**: a heading per DJ (the name links to the
   DJ page, with the set count), each with its grid; DJs with the most sets
   first, as today's grouping.

Empty library: "Nothing here yet — paste a set link or type a DJ's name above."

## The set page

**Back**: "‹ Sets" at the top returns to the library as it was (tab, grouping,
scroll).

**Hero**, on a dark warm gradient:
- left: the thumbnail (`hqdefault`), 300px wide, 16:9, with the length; this
  box is where the video plays;
- right: the title; the DJs as links to their pages (`billingParts`, "b2b" /
  "vs" between them, as today), then "· channel · saved Sep 27";
- the numbers: **41** tracks · **3** lists · **3** you own (green) · **37**
  missing · **1** ID — parts with nothing left out;
- a muted line for the source: "from 3 crossed lists · strongest source: the
  description" (or "comment by …"), and any notice ("Found 4 more tracks");
- **Play set** (accent) and **⋯**. The ⋯ menu: Open on YouTube · Look again
  for a tracklist (5–7 units) · Copy missing tracks (37) · Remove from library
  (asks first).

**Strip**: today's `SetTimeline` (each record a block, owned ones green, the
tempo shape, the current position), full width under the hero. A list with no
timestamps shows today's sentence instead.

**Filter**: All 41 · You own 3 · Missing 37 · IDs 1 (IDs is new: only the
unknown rows). Shown when the set has a tracklist.

**Track rows**, columns: # · Time · Track · Lists · You own · ♡.
- **#**: the index; the equalizer while the video is inside this track.
  Hovering turns it into ▶, which plays the set from this track.
- **Time**: the cue.
- **Track**: "artist — title (mix)"; a second, muted line when there is one of
  today's extras: "or: …" (other lists' names, with their votes), "maybe: …"
  (a suggestion for an ID), "asked 3×, no answer". An ID reads "ID". On hover,
  the store links (Beatport · Discogs · Bandcamp · Spotify) follow the title.
- **Lists**: votes / lists ("2/3"), dim when a lone list disagrees; "comments"
  for a row from the comments.
- **You own**: "▶ have it" (a 6px pill; plays your file in the bottom player,
  queue = the owned tracks of the set, as today) or "missing".
- **♡**: saves the track to Saved tracks, as today.
- An untimed list has no Time and no ▶; a row with a timed copy elsewhere shows
  "↳ 12:30", which opens that set there, as today.

After the rows: **Named without a timestamp**, as today, restyled. A set with
no tracklist shows today's sentence ("Nothing in the description…") under the
hero.

## Playing

**Play set**, or ▶ on a row, opens the video in the hero's box, which grows to
440px wide while the set plays on its page. The hero's buttons become **Pause
/ Play**, **⏮** and **⏭** (previous / next track of the set, today's `step`)
and ⋯.

**Leaving the set page** — back to the library, to another set's page, to Home
or anywhere in the app — keeps the video playing: it moves into a **bar above
the bottom player**, as today's minimised bar but app-wide: the small video,
"17:00 Raw Instinct — De La Bass" over the set's title, ⏮ ⏸ ⏭ ✕. Clicking the
bar's text opens the set page again; ✕ stops and closes it. Opening another
set's page while one plays leaves the playing one in the bar until Play set is
pressed there.

This moves the set player out of `SetsView` into App (a `useSetPlayer` hook
and a `SetPlayerBar` beside the bottom player): the playing set, the panel's
state and which box the panel sits in (the hero's or the bar's). The panel
stays the native webview it is today, placed over that box; today's rule that
leaving Sets closes it goes.

Your own file and the set's video do not play over each other: starting a
file in the bottom player pauses the video, and Play / ▶ on the set pauses the
bottom player.

## Saved tracks

Rows in the set page's style: cue · "artist — title (mix)" over the set's
title (a link that opens that set at the cue) · store links · ♥ (removes it).
**Copy list** at the top right, as today. Empty: "Heart a track in any set to
keep it here."

## Following

Two lists, with today's box above them ("Follow a channel, or watch a DJ by
name"):
- **DJs you watch**: round photo (the DJ page's, else the initials), the name
  (links to the DJ page), "checks: Never / Daily / Weekly" (a select), the
  auto-import switch ("fetch new sets automatically"), last checked, **Check
  now · 100 units**, Unwatch.
- **Channels you follow**: title and handle, the check select, last checked,
  **Check now · 1–2 units**, Unfollow.

A check's news shows as today: a DJ's finds land in the library's **New from
DJs you watch**; a channel's new uploads show under that channel until opened
or dismissed.

## Stats

Four cards in a grid, in Home's quiet card style: **Most played** (artists and
counts), **Doing the rounds** (records in more than one set), **Most gaps**
(sets with the most IDs; a row opens the set), **Quota** (spent, left, resets
in). The summary line above them stays ("29 sets · 412 named tracks · 37 still
unidentified").

## What changes in the code

- `SetsView.tsx` (2,179 lines) is split: the library page, the set page, the
  track row, Saved, Following, Stats and the search box become their own
  components under `src/components/sets/`; parsing, matching and the stored
  data are untouched.
- The `'set'` tab goes; `SetsStart` gains the page to open (`library` or a
  set), so Back from a DJ page, Home's "New sets" and Open in Sets keep
  working.
- The set player moves to App as above.
- New queries: none beyond the Home spec's finds (`get_new_dj_finds`,
  `mark_dj_finds_seen`, `mark_all_dj_finds_seen`), which this page uses too.

## Testing

- TypeScript: what the box offers for a link, a stored link, text and empty;
  the filter counts (IDs only unknown rows); the hero's numbers with parts
  left out; By DJ grouping order.
- By hand: paste a link (stored and not), type a DJ (free results first,
  YouTube only on its row), open a set from each place (card, new find, track
  hit, DJ page, Home), Back keeps the library's tab and scroll; Play set, ▶ on
  a row, ⏮ ⏭, the equalizer follows the video; leave to Home and the bar keeps
  playing, click it to return, ✕ stops; a file played from "have it" pauses
  the video; Saved, Following and Stats do what they do today; every button is
  6px.

## Out of scope

Changes to how tracklists are read or matched, new network features, and
anything on the DJ pages.
