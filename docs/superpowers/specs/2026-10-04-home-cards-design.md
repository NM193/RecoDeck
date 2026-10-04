# Home as a Grid of Cards — Design

## Why

Home is the first page RecoDeck opens on. Today it greets you, then shows a
grid of widgets: two of them are AI widgets that do nothing while AI is off,
Recently Played and Recently Added are lists you cannot play from, and Library
Insights is four averages. With 8,583 tracks, play history, Spotify and
YouTube Music likes, watched DJs and their gigs, there is much more worth
seeing first.

Mockup (approved): [`2026-10-04-home-cards-mockup.html`](./2026-10-04-home-cards-mockup.html).
The direction is a **grid of cards** (option B of three), in the **quiet style**
(dark cards, small grey titles; colour comes only from numbers, covers and
genre tiles), with Recently played as a **list without artwork**. Every button
has a **6px** corner radius (`--radius-md`), pills included.

This spec replaces the "Home" section of
[`2026-10-03-search-home-sections-design.md`](./2026-10-03-search-home-sections-design.md)
(its three Home widgets and its plan 2). That spec's queries and its All Tracks
filter are shared with this one; see "Depends on".

## The grid

Home keeps its widget grid: `react-grid-layout`, 4 columns, rows of 120px,
cards dragged by their title and resized from their corner while customizing.
The greeting and the date stay above it.

The card catalog has 15 cards in four groups. The catalog lists them under
these groups; on Home a card shows no group.

| Group | Card | Shows | Click | Default w×h | Min | Max |
|---|---|---|---|---|---|---|
| Jump back in | **Recently played** | track rows: title, artist, BPM, key, time played | plays (see Playing) | 2×2 | 2×1 | 4×3 |
| | **Recently added** | track rows: title, artist, BPM, key, date added | plays | 2×2 | 2×1 | 4×3 |
| | **Sets you saved lately** | rows: title, channel, date saved | opens the set in Sets | 2×2 | 2×1 | 4×3 |
| | **Your DJs** | round photos, name, one line ("next gig Tue, Oct 6", "watching for sets") | opens the DJ page | 4×1 | 2×1 | 4×2 |
| Needs you | **Needs you** | one row per kind of news, with its number (below) | each row opens its place | 2×2 | 2×1 | 4×2 |
| | **New likes you don't own** | one row per Spotify / YouTube Music list with new likes not owned, for a service shown in the sidebar | opens the list | 2×2 | 2×1 | 4×3 |
| | **New sets** | sets your watched DJs' searches found that you have not seen (see New sets) | opens the set in Sets | 2×2 | 2×1 | 4×3 |
| | **Your DJs play next** | upcoming gigs of every DJ with a page: date block, "DJ · venue", city | opens the DJ page | 2×2 | 2×1 | 4×3 |
| Your library | **Library stats** | see Library stats | — | 1×1 | 1×1 | 4×1 |
| | **Library by genre** | tiles: the 6 biggest genres, Added lately, Never played, with counts | opens All Tracks filtered | 2×2 | 2×1 | 4×3 |
| | **BPM & key** | BPM bars by range; key counts | a bar or key opens All Tracks filtered | 2×2 | 2×1 | 4×2 |
| | **Not analyzed** | how many tracks have no BPM; **Analyze all** | Analyze all | 1×1 | 1×1 | 2×1 |
| Gig prep | **Your playlists** | playlist cards (cover, name, count); ▶ over the cover | opens the playlist; ▶ plays it | 4×1 | 2×1 | 4×3 |
| | **Quick actions** | Import folder, Analyze all, Open Sets, New playlist | each does its action | 2×1 | 2×1 | 4×1 |
| | **Last playlist** | the playlist you last played from: cover, name, count, ▶, its tracks | ▶ plays it; a row plays from there | 2×2 | 2×1 | 4×3 |

A list longer than its card scrolls inside the card, and the wheel stays in
the card, as on the DJ Overview. Lists read at most: 20 recently played, 20
recently added, 10 saved sets, 20 new sets, 20 gigs, every track of the last
playlist.

**Header links** (right of a card's title): Recently added → "All Tracks"
(All Tracks filtered to Added lately); Library by genre → "8,583 tracks" (All
Tracks, unfiltered); Last playlist → "Open" (the playlist); New sets → "Mark
all seen". Other cards have none; the mockup's "Show all", "All" and "Resident
Advisor" links are dropped, and Not analyzed's Analyze all is a button in the
card's body.

**Titles** ship as the catalog table names the cards ("Library stats", "Library
by genre", "New sets"); the mockup's titles were drafts.

### Default layout

Eight cards, as in the mockup:

| Card | x | y | w×h |
|---|---|---|---|
| Needs you | 0 | 0 | 2×2 |
| Recently played | 2 | 0 | 2×2 |
| Your DJs play next | 0 | 2 | 2×2 |
| Library by genre | 2 | 2 | 2×2 |
| Your playlists | 0 | 4 | 4×1 |
| Library stats | 0 | 5 | 1×1 |
| Not analyzed | 1 | 5 | 1×1 |
| Quick actions | 2 | 5 | 2×1 |

### Leaving the old Home

- **Removed:** the AI Recommendations and Library Insights widgets (their
  files are deleted; BPM & key replaces Library Insights), and the AI buttons
  of Quick Actions. If AI comes back, it gets a card of its own then.
- Card ids that keep their meaning keep their id: `recently-played`,
  `recently-added`, `library-stats`, `quick-actions`, `playlists`.
- The stored layout becomes `{ "version": 2, "layout": [...] }`. A stored
  layout in the old form (a bare list) is replaced **once** by the default
  layout, which is written back at once; after that Home shows what Customize
  saved. (Today's stored layout holds three cards.)
- On load, unknown or removed ids are dropped, each card's min/max come from
  the catalog, not from what was stored, and its stored w/h is clamped into
  them (react-grid-layout enforces limits only while resizing).

## Cards in detail

**Track rows** (Recently played, Recently added, Last playlist): number, title
over artist, BPM, key, and a last column — the time played ("22:39" today,
"yesterday", else "Oct 2"), the date added (same rule), or the length (Last
playlist). Missing BPM or key shows "—". Hovering a row turns its number into
▶; clicking ▶, or double-clicking the row, plays. The track playing now shows
▮▮ and its title in the accent colour; clicking ▮▮ pauses, as the player's
button does. The queue is the card's list as it was when you pressed play:
Recently played then re-reads and the track moves to the top, but the queue
keeps its order.

`date_added`, `yt_sets.added_at` and `played_at` are UTC; the labels compare
local calendar days ("today", "yesterday") after converting them to local
time.

**Needs you** rows, each left out when its number is 0; with all of them 0 the
card says "Nothing new":

| Row | Number | Click |
|---|---|---|
| New Spotify likes you don't own | the sidebar's Spotify number (`newCounts.total`), when Spotify is shown in the sidebar | the list with the most new likes |
| New YouTube Music likes | the same for YouTube Music | the same |
| New sets | the New sets count (below) | Sets, on its library (`SetsStart` gains a library start) |
| Tracks not analyzed | tracks with no BPM | Analyze all |
| Next gig | the earliest upcoming gig of your DJs, as "Tue · Traumer plays Hï Ibiza · Oct 6" | that DJ's page |

**New sets.** News is about a video. A video is new while none of its find
rows (`yt_dj_finds`) is seen. "Seen" is a new nullable column
`yt_dj_finds.seen_at` (migration 018, no default; NULL is unseen; marking
writes SQLite `datetime('now')`). A find row is written already seen when its
video is in `yt_sets` at that moment or already has a seen row — so a set you
imported or opened before any search found it, or a b2b set a second DJ's
search finds later, never comes back as new. (Auto-import files a set after
its find is written, so an auto-imported set is new.) A video's finds become
seen when its set is opened anywhere (Sets, Home, a DJ page), or with **Mark
all seen** on the New sets card. Opening Sets by itself marks nothing. On the
first start with migration 018, every find already stored is marked seen, so
news starts with the next search.

Both kinds of find count: those auto-import already filed in `yt_sets` (they
open at no cost) and those it did not (opening one fetches it, 5–7 units). A
row shows the title, the DJ, the channel, and "saved" or "5–7 units". The
count is of distinct videos; a video found by two DJs' searches shows once,
under the DJ whose row has the earliest `first_seen_at` (then the lowest name
key, as one check stamps its rows with the same second). Newest first means by
that earliest `first_seen_at`. Followed channels' new uploads are
not stored until Sets checks them, so they are not on Home.

**Library stats.** At 1×1: the track count, and "N added lately" under it. At
2×1 and wider: tracks, playlists and folders, with "N added lately · N never
played" under them.

**BPM & key.** BPM bars are half-open ranges, `[min, max)`: `< 115`
(`min 0, max 115`), `115–119` (`115, 120`), `120–124`, `125–129`, `130–134`,
`135+` (`135, none`). Tracks without BPM are not counted. Key: the count per
key as stored (`track_analysis.musical_key`), biggest first. Today the key is
known for 97 of 8,583 tracks, so the card says "key known for 97 tracks" under
the key counts. A bar or a key opens All Tracks with that filter; a bar's count
equals what All Tracks then shows.

**Not analyzed** counts tracks with no BPM (223 today), subtitle "no BPM yet".
Its **Analyze all**, and Quick actions' **Analyze all**, analyze exactly the
tracks without a BPM (`get_track_ids_without_bpm()`). Sending every id would
not do: `analyze_tracks_batch(ids, force = false)` skips only tracks that have
both BPM and key, and only 97 have a key. App's analysis code is split so that
`handleAnalyzeAll` (the sidebar's "Analyze All Tracks", unchanged) and Home's
Analyze all share one `analyzeTrackIds(ids)`.

**Quick actions:** Import folder opens Settings with its Library section open;
Analyze all as above; Open Sets opens Sets; New playlist asks for a name, as
the sidebar's Create Playlist does.

**Empty cards** show one line of text, never a blank card:

| Card | Text |
|---|---|
| Recently played | Nothing played yet |
| Recently added, Library stats | No tracks yet |
| Sets you saved lately | No saved sets yet |
| Your DJs | No DJs yet — open a DJ page or watch a DJ in Sets |
| New likes you don't own | No new likes |
| New sets | No new sets |
| Your DJs play next | No upcoming gigs |
| Library by genre | No genres yet |
| BPM & key | Nothing analyzed yet |
| Not analyzed (0) | Everything is analyzed |
| Your playlists | No playlists yet |
| Last playlist | Play a playlist and it shows here |

## Playing

There is no new player. A play from Home goes through App's play handler, as a
double click in All Tracks or a playlist does: the track starts in the player
at the bottom, and the queue is the card's list, so next and previous follow
the card. A playlist's ▶ (Your playlists, Last playlist) plays the playlist
from its first track with the playlist as the queue.

A play records the playlist it came from. Today a play records the playlist
only when that playlist is open in the table; App's play handler gains an
optional playlist id, which Your playlists and Last playlist pass, so Last
playlist follows plays made from Home.

## Navigation from Home

A DJ page opened from Home (Your DJs, Your DJs play next, Needs you's next gig)
returns to Home on Back: App's `DjOrigin` gains `{ view: 'home' }`, and
`closeDj` handles it. Today it would fall back to Search.

## Staying current

Cards read their data when Home opens. While Home stays open, App passes a
number that it raises after each recorded play, after an analysis finishes, on
`library-changed` (the folder watcher's rescan) and on `yt-new-sets` (with the
auto-import that follows it). Home raises it too, through an App callback,
after Mark all seen and after a set is opened from Home. Every card reads its
data again when it changes;
the reads are local and cheap. The Spotify and YouTube Music numbers are App
state already and follow on their own.

## Customize

As today — Customize, then drag, resize, × to remove, Save or Cancel — with:

- the catalog grouped under Jump back in, Needs you, Your library, Gig prep,
  each card marked "on Home" or "+ Add";
- **Reset**, which puts back the default layout (Save still needed).

## Data

All local: Home makes no network request and spends no YouTube quota.

| Card | Source |
|---|---|
| Recently played | `get_recently_played_tracks(limit)` — from the Search spec; each row is a full track with its analysis and its latest `played_at` |
| Recently added | new `get_recently_added_tracks(limit)`: full track rows with analysis, newest `date_added` first (shared with Search's Recently added) |
| Sets you saved lately | existing `listYouTubeSets()` (newest first) |
| Your DJs | `get_known_djs(today)` and `localStorage['dj_recent']` — from the Search spec |
| Needs you, New likes | App's `spotify.newCounts` and YouTube Music's `newCounts`, as the sidebar shows them |
| New sets | new `get_new_dj_finds(limit)`: distinct unseen finds, newest first, each with the DJ's name and whether it is in `yt_sets`, plus the total count; new `mark_dj_finds_seen(video_ids)` and `mark_all_dj_finds_seen()` |
| Your DJs play next | new `get_upcoming_gigs(today, limit)`: gigs on or after `today` (the local day, as `splitGigs` uses it) of every DJ in `dj_profiles`, soonest first, with the DJ's name |
| Library stats | App's counts, plus `get_library_groups()` — from the Search spec |
| Library by genre | `get_library_groups()` — from the Search spec |
| BPM & key | new `get_bpm_key_counts()`: tracks per BPM range and per key |
| Not analyzed | new `get_track_ids_without_bpm()` (its length is the count) |
| Your playlists | App's playlists |
| Last playlist | new `get_last_played_playlist()`: the newest `play_history` row with a playlist that still exists, then `getPlaylistTracks` |

`get_recently_played`, `get_recently_added` and `get_library_insights`, used
only by the old widgets, are removed with them if nothing else calls them.

HomeView gains the props the cards act through, passed by App:
`onPlayTrack(track, list, index, playlistId?)`, `onPlayPlaylist(id)`,
`onOpenDj(name)`, `onOpenSet(videoId)`, `onOpenSets()`,
`onOpenAllTracks(filter)`, `onOpenPlaylist(id)`,
`onOpenStreamList(service, listId)`, `onAnalyzeTracks(ids)`,
`onCreatePlaylist()`, `onImportFolder()`, the data-version number, and the
Spotify and YouTube Music new counts and lists.

## Depends on

The Search spec's plan builds `get_recently_played_tracks`,
`get_recently_added_tracks`, `get_known_djs`, `get_library_groups`,
`get_played_track_ids`, the `dj_recent` order and the All Tracks filter. **The Home plan includes whichever of these
do not exist yet when it is written**, so it can be built before or after
Search part 1.

This spec extends the All Tracks filter with
`{ kind: 'bpm'; min: number; max: number | null }` (half-open, as above) and
`{ kind: 'key'; key: string }`, shown as chips "BPM 125–129 ×", "Key 6A ×".
If the All Tracks redesign (its own spec, after Sets) moves where the filter
shows, the filter's kinds stay as written here.

The plan groups its tasks: backend queries, then App wiring, then the cards,
then Customize.

## Testing

- Rust, each new query on an in-memory database: recently played returns
  `played_at` and analysis; recently added newest first with analysis; new
  finds unseen only, distinct by video (first finder's DJ), filed and unfiled
  both, with the right count; marking one video and marking all; migration 018
  marks every existing find seen; upcoming gigs from today on, soonest first, across DJs; BPM
  ranges at their edges (114.9 → `< 115`, 115 → `115–119`, 119.9 → `115–119`,
  135 → `135+`) and tracks without BPM left out; key counts; ids without BPM;
  the last played playlist skips a deleted playlist.
- TypeScript: the stored layout (old form → default once; unknown ids dropped;
  min/max from the catalog), the Needs you rows (zero rows left out, "Nothing
  new"), the time label (today "22:39", "yesterday", "Oct 2", and a UTC time
  just before local midnight), a BPM bar's filter, Library stats by width,
  stored sizes clamped.
- By hand: the default layout on first start; play from each track card, and
  next/previous follow the card; ▶ on a playlist; Last playlist changes after a
  play from Home; Recently played updates while Home is open; Back from a DJ
  page opened on Home returns to Home; opening a new set clears it from New
  sets and Needs you, Mark all seen clears them all, opening Sets alone clears
  nothing; Not analyzed and Needs you agree after an analysis; Customize add/remove/resize/Reset/Save survives a restart; every
  card's empty text; Analyze all from Home analyzes the 223, not the library or
  a playlist.

Wiring notes for the plan: `recordPlayEvent` is fire-and-forget today, so the
number is raised after it resolves; on `library-changed`, after the rescan and
`loadTracks` finish; in the `yt-new-sets` handler, before its early returns and
again after the auto-import.

## Out of scope

AI cards, anything fetched from the network, checking channels for new sets
from Home, cross-device layouts, and anything the Sets redesign spec adds to
Sets (a new-sets row in its library, its own Mark all seen). Until that ships,
Sets' library shows stored sets only, and the New sets card is where unfiled
finds are seen.
