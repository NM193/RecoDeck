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
2. **Tabs**: Library (count, and "· 3 new" for unseen finds) · Saved tracks
   (count) · Following (badge: channel news) · Stats. On the right of the Library tab: **By DJ** / **Newest**.
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

**As built by plan S3:**

- The box is `src/components/sets/SetsBox.tsx`, its rules pure in
  `src/lib/sets/box.ts` (tested): a link is any watch, youtu.be, live, shorts
  or embed address or a bare 11-character id; text is matched against the
  title, the channel and the DJ, without case or accents. The old Process /
  Search button goes: ↑ / ↓ move through the dropdown (the lit row kept in
  view), Enter opens the row lit (the first, so a free result comes before
  the YouTube search), a press chooses a row before the box loses focus, Esc
  closes the dropdown and then clears the box. Enter on a closed dropdown
  only opens it, and on the YouTube row it waits until the free track search
  has answered, so a name typed fast and Enter never spends 101 units before
  the free results show; the last results stay while the next are read, so
  the rows do not jump. One YouTube search runs at a time, and one answering
  after Esc, an opened set or a newer search is dropped; its heading names
  what was searched. With fewer than 101 units left, the row says how many.
  "Reading…" shows in the box while a set is fetched or YouTube searched. The dropdown sits inside the main area, so it can never
  cover the set video (the bar is below the main area, a set's page box is
  not on the library) and does not report itself as an overlay.
- YouTube's results replace the page below the box under "2 sets found on
  YouTube — opening one costs 5–7 units" and "Back to your library"; one
  already in the library says "in your library" and opens at no cost.
- The tabs are the mockup's buttons: "Library 16 · 3 new", "Saved tracks 4",
  "Following" (its badge counts the channels' news only) and "Stats", with
  By DJ / Newest on the right of the Library tab.
- New from DJs you watch shows up to 20 unseen finds, newest first, in a grid
  that wraps (cards at least 260px): the thumbnail, the DJ in orange, the
  title, "saved" or "opening costs 5–7". Mark all seen works as Home's, with
  its toast and Undo. The finds are read with the library: on arrival, after
  a check and after a set is opened (which marks it seen).
- Your sets: 4 cards to a row, 3 when the window is under 1100px wide; the
  library is up to 1180px wide (it was 900px) so the cards have room. Newest
  is the grouping Sets starts on, as the mockup draws it (By DJ gives every
  DJ a row, which with many one-set DJs is long). The library list's bin
  goes; removing a set is on its page's ⋯, and on its page's error when a
  stored set cannot be read.
- A set opened from the library leaves New from DJs you watch at once: the
  finds are read again after it is marked seen.
- A DJ page's Find more fills the box and focuses it, so the dropdown shows
  the free results at once; nothing is spent until the YouTube row.

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

**As built by plan S2:**

- The page is `src/components/sets/SetPage.tsx` with its row
  (`SetTrackRow.tsx`), `SetPage.css`, and `TrackScrubber` and `StoreLinks`
  moved out of `SetsView` beside it; its words and numbers are pure functions
  in `src/lib/sets/setPage.ts` (tested). `SetsView` keeps the data and which
  page shows; the `'set'` tab is gone and Sets opens on its library.
- Until plan S3 builds the library home, today's box (the input with
  "Process" / "Search · 101 units", the quota line, the found list) sits above
  the tabs, and the Library tab keeps today's list, "Where did I hear this?"
  and By DJ / Newest first.
- Back returns to the library's tab, grouping and scroll from a small store
  (`useSetsView`) that outlives `SetsView`, so a trip through a DJ page keeps
  them; the scroll comes back once the list has loaded, and another tab
  starts at its top. The sidebar's Sets, pressed while a set's page shows,
  goes back to the library too (`requestLibrary`). `SetsStart` is unchanged:
  no caller opens a set at a cue from outside Sets yet, so it has no cue.
- One opener, `openSet(videoId, { cueMs, title })`: the page shows at once
  with the title the opener or the library knows ("Reading the set…" when
  neither does) and eight skeleton rows; a stored set is stored again (its
  rows refilled; `added_at` is kept); a set not stored is fetched and stored.
  A failure says "Couldn't read this set: …" with Try again ("This set" as
  the title when none is known) and shows an error toast, which a retry
  replaces. Opened at a track, its row is scrolled to the middle and the set
  plays from its cue. A newer open, or Back, gives up an open still on its
  way: it neither shows, nor plays, nor fetches (so React's StrictMode
  double mount spends 5–7 units once). A pasted link, a found set and a
  channel's upload open their page only if nothing else was opened since.
- Look again never takes the page: answering after Back or another set, it
  is stored (and a playing set gets its rows) and says what it found in a
  toast ("Looked again at …: 12 → 13 tracks."). Its failures and its "only N
  units left" warning are toasts too (the page has no error line). Removing a set asks first (the native confirm),
  from ⋯ and from the library row's bin, says "Removed from your library",
  and goes back to the library when its page was open; its saved tracks go
  with it.
- The hero puts "‹ Sets" above the title, as the mockup; the thumbnail's
  length sits bottom right. ⋯ is the shared `Menu`: Open on YouTube (at the
  position playing, when this set plays), Look again for a tracklist (5–7
  units), Copy missing tracks (its count; a toast says how many were copied),
  Remove from library (only for a set in it).
- Playing here, the hero is the mockup's compact one: the numbers and the
  source line go and the title is 18px. The picture keeps to the top when the
  text beside it is taller, and both give way on a narrow window (the
  thumbnail down to 200px, the video to 240px), so at 800×600 the rows keep
  272px and nothing scrolls sideways.
- A list assembled from scattered comments has no lists to count: its line
  reads "assembled from comments", without "from N lists". "Named without a
  timestamp" shows under a set with no rows too.
- Rows: the number's ▶ shows on hover and when it has the keyboard (opacity,
  so it stays reachable; only the keyboard's focus hides the number, as
  WebView2 focuses a clicked button); the store links follow the title in the
  spec's order (Beatport · Discogs · Bandcamp · Spotify), on hover and while
  the row holds the keyboard's focus; the playing row takes the
  track table's playing colour (the accent drawn toward the text, which reads
  on the light themes); an ID row is muted, with no "missing" and no ♡.
- The filter is four buttons with their counts (`aria-pressed`), in the
  mockup's tab style; another set is another page, so it starts on All.
- `SetsView.css` loses the rules only the old Set tab and video band used.

## Playing

**Play set**, or ▶ on a row, opens the video in the hero's box, which grows to
440px wide while this set plays on its page. Under the video, today's
**TrackScrubber** (the bar for winding through the one record playing) stays.
The hero's buttons become **Pause / Play**, **⏮**, **⏭** and **✕ Stop**, then
⋯. ⏮ and ⏭, the equalizer and every label of "what is playing" follow the
track the playhead is in (today's `currentTrack`, from the panel's position),
not the last row clicked — so ⏮ / ⏭ work right after Play set and after the
video runs on. They step between timed rows only, and are disabled for an
untimed list. The panel's position is polled every 400ms, so after each seek
the expected position is set at once and a second quick ⏭ steps from there.

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
  exactly then. The hero box registers itself with `useSetPlayer` through a
  callback ref when it mounts and unregisters when it unmounts, so the handoff
  needs no timers and holds both for App's view fade and for library ↔ set page
  inside Sets (no fade);
- it follows its box every frame the box moves or resizes — a
  `requestAnimationFrame` check of the box's rectangle while a set plays,
  sending new bounds only when they change — so a sidebar collapse, a banner
  above the content or a window resize never leaves it behind;
- **while any overlay is open** it is moved off-screen through the existing
  `set_youtube_panel_bounds` and keeps playing, then put back when the last
  overlay closes. Overlays report themselves through one small App hook
  (`useOverlay`, Interactions spec); every one of today's overlays calls it:
  `PromptModal`, the delete-folder modal, `EQModal`, `DuplicatesModal`,
  `ExportPlaylistModal`, `SharePlaylistModal`, `WhatsNewDialog`, the
  TrackTable and FolderTree menus, `DjCandidatesMenu`, the NowPlayingBar menus
  and its expanded view, `SidebarFlyout` (it opens on hover beside the video),
  the hero's ⋯ menu, and the new Filter and Columns popovers;
- if the panel cannot be shown, the set opens in the browser, as today.

This moves the set player out of `SetsView` into App: a `useSetPlayer` hook
that holds the playing set (its video, url and parsed tracks — the bar needs
them while Sets is not mounted), the panel's state, and which box the panel
sits in; and a `SetPlayerBar` beside the bottom player. Today's rule that
leaving Sets closes the video goes.

Your own file and the set's video do not play over each other: starting a
file in the bottom player pauses the video, and Play / ▶ on the set pauses the
bottom player.

**As built by plan S1** (the first of four: the player, the set page, the
library and the box, then Following, Saved and Stats):

- `useSetPlayer` is a zustand store (`src/store/setPlayerStore.ts`): the
  playing set (its parsed result and the cue it opened at), the panel's last
  report, and the two boxes; `play`, `seek`, `step`, `togglePause`, `stop`,
  `replaceResult`. `SetPlayerEngine`, a component App mounts once in its
  player area (so a poll re-renders only the bar and the set), opens the
  panel at its box, follows the box every frame, polls every 400ms and keeps
  the two players apart; on start it closes a panel left from before a
  reload. The pure parts — the playhead's track, ⏮ / ⏭'s cue, which box, the
  bounds, what to believe right after a seek, play or pause — live in
  `src/lib/setPlayer/` with their tests.
- The panel takes its orders through the companion server, which keeps one
  instruction (seek, pause or play) that the player page polls every 400ms,
  and a new page takes the first one it sees as its starting point. So a seek
  is never followed by a play (the page's seek plays anyway), and a seek
  asked for before the video has reported its length waits and goes out with
  the first report (the panel opens at it if it is not open yet) — ⏭ right
  after Play set lands. Play and pause are believed for 1.2s while the poll
  catches up, and a set starts as buffering, so the button says Pause at once.
- Every call that creates, moves or closes the webview waits its turn, so ✕
  pressed while the panel is still opening closes it, and two quick sets
  never race for the panel.
- When the app starts the video itself (Play set, ▶, a seek, Play) your file
  stops at once; the latch is only for a click inside the panel, and only
  while the video is playing.
- Until plan S2 builds the set page, the page box is Sets' video band above
  the Set tab (today's player, its minimise gone): ⏮, Pause / Play, ⏭ and
  close over the video, the scrubber under it, shown while the set open in
  the Set tab is the one playing.
- The bar sits in the player area above the bottom player, across the whole
  window, 54px high with an 84×47 video; the toasts stay above it, over the
  main area.
- Off the window means x and y at −10000, keeping the box's size (320×180
  when there is no box), so the video does not reflow.
- Another set closes the panel before the new one opens, which forgets the
  last set's position; until the video reports its length, the store keeps
  the cue it opened at. After a seek, a report more than 2.5s from it is taken
  as stale for 1.5s.
- Every `openSets` is a new SetsView (a visit counter in its key), so the
  bar's text opens the set even from Sets' own library.
- Removing the playing set from the library stops it first; Look again on it
  keeps it playing with the new rows.
- The overlays that report themselves now: `PromptModal`, the delete-folder
  modal, `EQModal`, `DuplicatesModal`, `ExportPlaylistModal` (Esc waits for a
  running export, as its backdrop does), `SharePlaylistModal`,
  `WhatsNewDialog`, the FolderTree menu, `DjCandidatesMenu`, the
  NowPlayingBar's playlist menu and expanded view, `SidebarFlyout`, and two
  the list above missed — the sidebar's colour menu and YouTube Music's list
  menu — besides the shared `Menu`, `Popover` (the Filter and Columns
  popovers) and the TrackTable menus that already did. The hero's ⋯ menu
  comes with plan S2, on the shared `Menu`.
- Left as they are: leaving the set page, the video stays over the fading
  page for App's 200ms view fade; the frame check runs while a set is loaded,
  paused too; a keyboard press on the bar's text or ✕ leaves focus on the
  page, as the bar goes; the old top-right notifications sit under the video
  band on Sets until the Interactions sweep replaces them with toasts.

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
session, until opened or dismissed — dismissing marks the channel seen up to
its newest upload (`markYouTubeChannelSeen`), as today. The session's channel
news is kept in **App** (beside `SetsStart`), fed by App's existing
`yt-new-sets` listener and by the check buttons, so it survives tab switches,
set pages and trips out of Sets — and news from a background check is there
when App's toast says "see Sets › Following". The **Following** badge counts
that channel news; unseen DJ finds show on the **Library** tab instead
("Library 29 · 3 new"), where their row is.

Per-row checks need two new commands that check one item:
`check_youtube_dj(name_key)` and `check_youtube_channel(channel_id)`, beside
today's check-all `check_youtube_djs` and `check_youtube_channels`.

**As built by plan S4** (with Saved tracks and Stats):

- Rust: what a check covers is `covered(items, scope, now)` over a
  `Checkable` trait (a channel, a watched DJ) with `CheckScope::{All, Due,
  One(key)}` — the buttons, the timer and a row — tested as `is_due` is. A
  row's Check now runs whatever its interval says, Never included, because
  someone asked. The new commands are `check_youtube_channel(channel_id)`
  and `check_youtube_dj(name_key)`. A row's check that could not reach
  YouTube answers the error (the toast says it) rather than "Nothing new";
  the buttons and the timer still skip what failed, as today.
- The channels' news is a small store (`useChannelNews`), fed by App's
  `yt-new-sets` listener and by Following's checks; a DJ's finds are not
  kept there (they are stored, and show on the library). It keeps each
  channel's newest upload, so Dismiss moves the marker there even when the
  row's ▾ is closed. Following's badge counts only the channels still
  followed; ✕ clears a channel's news. App's notification for a timer's
  finds names where they are: Sets › Library (DJs), Sets › Following
  (channels).
- Which check is running lives in that store too, so leaving the tab and
  coming back keeps the buttons disabled — a second press cannot spend the
  units again. An upload's "get it" leaves the news alone when the fetch
  fails. A row's ▾ that is closed (or another row opened) before its
  uploads arrive stays closed. Watching a DJ already watched, or following a
  channel already followed, says so and spends nothing.
- The box under the tabs (`SetsFollowing.tsx`, with `SetsTabs.css`): a
  channel link or @handle follows it (2 units); a name asks first — Watch "…"
  as a DJ, or Search for a channel anyway (100 units). Today's paragraphs
  become one line under it.
- A DJ's row: the photo (or the initials on the DJ's hue), the name (opening
  the DJ page), "checked Oct 2" / "never checked", Check now · 100 units, ▾
  (everything found so far) and ✕ (unwatch, as today without asking); under
  it "checks" with the shared `SelectMenu` (Never / Daily / Weekly) and the
  settings' `ToggleSwitch` "fetch new sets automatically". A channel's row:
  its name, "@handle · checked …", Check now · 1–2 units, ▾ (its recent
  uploads, 1–2 units) and ✕, and its "checks". A channel's news shows under
  its row as "2 new sets" with Dismiss; "get it · 5–7 units" fetches and opens
  an upload and moves the channel's last-seen marker there, as today.
- What a check found is said in a toast: "2 new sets from Traumer — see
  Library", "Nothing new on Cercle", "4 new sets from 2 DJs — see Library".
  Search all refuses with a warning when the quota is short, as today.
  Following's checks keep their own busy state, so the library's box no
  longer reads "Reading…" while they run.
- Saved tracks (`SetsSaved.tsx`): the cue; the track over its set's title,
  which opens the set at the cue; the store links on hover (and while the row
  holds the keyboard); ♥ removes it. Copy list says how many it copied.
- Stats (`SetsStats.tsx`): the summary line, then the four cards two to a row
  (one under a 900px window); Quota shows what was spent, what is left of the
  day's units and when they reset.
- `SetsView.css` loses the rules only the old Following, Saved and Stats
  used.

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
equalizer component, the Search spec's `get_known_djs` (DJ photos in
Following), and the Interactions spec's `useOverlay`, toasts and shared
controls; **this plan includes whichever of them do not exist yet** when it is
written. Plan order: (1) the set player into App with
`SetPlayerBar` and `useOverlay`; (2) splitting the components and the set page;
(3) the library and the box; (4) Following, Saved and Stats.

## Testing

- TypeScript: what the box offers for a link, a stored link, text and empty;
  the filter counts (IDs only unknown rows); the hero's numbers with parts
  left out; By DJ grouping order; which box the panel belongs in (page mounted
  or not); ⏮ / ⏭ from the playhead's track.
- Rust: the choice of what a check covers (one DJ or channel, all, or only
  those due) is a pure function, tested as `is_due` is; the two new commands
  pass one key into it. (The network calls themselves are not unit-tested
  today, and stay so.)
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
