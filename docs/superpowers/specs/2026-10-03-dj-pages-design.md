# DJ Pages — Design

## Why

RecoDeck already knows a lot about the DJs its user follows — whose sets are
saved, which tracks those sets contain, which of them are in the library — but
it is scattered across the Sets section and there is nowhere to look at one DJ.

A DJ page puts it in one place: where they play next, what they made, what they
keep playing, and which of all that is still missing from the library.

Mockup: [`2026-10-03-dj-pages-mockup.html`](./2026-10-03-dj-pages-mockup.html).
The first section (layout A with the customizable overview) is the approved
design; the second is the earlier comparison, kept for its Search mock. Mockup
copy and data are samples — the wording below is what ships.

## Depends on

The **Spotify section** (`2026-10-03-spotify-section-design.md`): its connection
and token handling, its Spotify title → artist/title/mix conversion, its row
actions and Owned / Maybe / Missing states, its `spotify_match_verdicts` table,
and its memoized library index. DJ pages are built after it and reuse all of these.

## Scope

In:
- DJs in Search, and clickable DJ names in Sets.
- A DJ page: header with photo, tabs **Overview / Tracks / Plays / Sets / Gigs**.
- Tracks and remixes from Spotify; gigs from Resident Advisor; "what they play"
  and sets from the user's saved sets.
- A customizable Overview, one layout for every DJ page.

Out:
- Fun facts / AI-written text (dropped during design).
- Discogs, Beatport, Bandsintown (Discogs may follow if Spotify proves too thin
  for vinyl-only artists; Bandsintown keys are only issued to artists/partners).
- Wikipedia photos.
- Two different artists with the same name having separate pages (see "Who is who").

## Navigation

The DJ page is a new view in `src/App.tsx`: `activeView = 'dj'` with a
`djKey` (the name key). The page header has a **Back** arrow that returns to the
view it was opened from (Search or Sets, including Sets' open set). The Search
query is held in `App.tsx` rather than in `SearchView`'s local state, so Back
to Search shows the same query and results. Opening
another DJ from inside a DJ page replaces it; Back still returns to where the
first one was opened from.

## Getting there

### Search

The existing Search view gets a **DJs** row above Tracks, as round-photo cards.

Order:
1. DJs the user already knows — names extracted from saved sets
   (`extractDjName`, split as below) and watched DJs — whose name contains the
   query. Instant, no network.
2. Spotify artist search results for the query, minus names already shown.
   Only when Spotify is connected; debounced (~300ms), at most 6 cards.

Card subtitle: `6 sets` for known DJs, plus `· you own 23` once the page has
been opened at least once (that number needs the cached tracks); `on Spotify`
for Spotify-only results.

### From Sets

The DJ name chip in the Sets view becomes a link to the DJ page. A b2b set
("Marco Carola b2b Luciano") shows each name as its own link; names are split
with `/\s+(b2b|vs)\s+/i` — case-insensitive, as `extractDjName` already treats b2b.

## Who is who

A DJ page is keyed by the name key (`trim().to_lowercase()`, the same rule as
watched DJs). Its profile holds a Spotify artist id and an RA artist.

- **Opened from a Spotify search card:** that card's artist id is stored as a
  manual match, replacing any different id the key had.
- **Opened any other way, with no stored id:** resolved automatically — the
  Spotify artist search result whose name equals the DJ name
  (case-insensitive); among several, the one with the most followers if Spotify
  returns followers, otherwise the first. RA is resolved the same way from RA's
  artist search.
- The page's `⋯` menu has **Not this artist?**, listing the other search results
  per source, plus "none". A manual choice is never overwritten automatically.

Two different artists sharing a name share one page; "Not this artist?" picks
which one it shows.

## The page

Copy is gender-neutral throughout ("Tracks & remixes", "What they play").

### Header

Full-width hero with the Spotify artist photo (a gradient when there is none),
kicker `DJ · Producer`, the name, and a meta line:
`You own 23 of 214 tracks · 6 sets saved · next gig Sat, Oct 12`
("you own" counts Owned only; parts with no data are left out). Buttons:
**Watch for sets** (the existing watched-DJ toggle), **Spotify** ↗ (artist
page), **RA** ↗ (see the RA link rule below).

### Tabs

| Tab | Content |
|---|---|
| **Overview** | The chosen cards in the chosen order (below). |
| **Tracks** `214` | Every track they made or remixed, in the Spotify-section table style, filters **All / Missing / Maybe / Owned**, and the same row actions — including Maybe's Yes/No sub-row, stored in `spotify_match_verdicts`. Columns: `# · Title · Artist · Released · Status`. Newest first. |
| **Plays** `38` | Tracks from their saved sets, most-played first: `Track · in N of M sets · Status`. Only named tracks; IDs excluded. |
| **Sets** `6` | Their saved sets as cards (title, length, track count). |
| **Gigs** `9` | Upcoming gigs (date, venue, city, lineup), then **Past gigs**. |

**Sets tab actions:**
- Clicking a set card switches to the Sets view with that set open. `SetsView`
  gains an optional `openVideoId` prop for this.
- The last card, **Find more**, switches to the Sets view's **Set** tab with
  the DJ's name in the search box, **not run** — the user presses Search there, where the cost
  (100 units) is already shown before the click. `SetsView` gains an optional
  `initialQuery` prop.

### Overview and customizing it

A two-column grid of cards. Available cards:

| Card | Default | Width |
|---|---|---|
| Upcoming gigs (next 3) | on | half |
| What they play (top 4) | on | half |
| Tracks & remixes (newest 3, with filter chips) | on | full |
| Latest sets (3) | off | full |
| Photos (Spotify + RA photos) | off | half |
| Past gigs (last 3) | off | half |
| Missing tracks (newest 5 Missing) | off | full |

A small sliders icon at the end of the tab row (grey, no box) switches to
editing: an indigo bar `Customizing the overview · applies to every DJ page`
with **Reset** and **Done**; cards get a drag handle and ×; hidden cards appear
as `+ Card name` pills underneath. Dragging uses `react-grid-layout` (as on
Home), widths fixed per card, no resizing.

Stored in `settings` as JSON (`dj_overview_layout`): an **ordered list of card
ids only**, never raw grid coordinates. On **Done** the order is read off the
grid by sorting cards by (y, x). On render the grid is rebuilt by packing the
cards in that order, two columns, full-width cards taking a row. Unknown ids are
ignored; a missing or invalid value means the default layout.

Each card title links to its tab (`all 9 →`).

### Without Spotify connected

Disconnecting Spotify also deletes `dj_spotify_releases`, `dj_spotify_tracks`
and the Spotify columns of `dj_profiles`, the same as the Spotify section's own
data; RA data and manual RA matches stay.

Sets, Plays and Gigs work. The hero uses a gradient, the meta line drops the
"you own" part, and Tracks (tab and card) shows `Connect Spotify to see their
tracks` with a button to Settings → Spotify.

## Data

### Spotify (tracks, photo, genres)

**Releases.** The artist's releases with
`include_groups=album,single,appears_on,compilation`, 50 per page. A track
belongs on the page when the artist is among the **track's** artists, not
merely the release's — that keeps remixes on other labels' releases and drops
the rest of a compilation.

**Cost, bounded:**
- Releases never change, so their ids are remembered (`dj_spotify_releases`).
  Only releases not seen before have their tracks fetched — the first open does
  the work, later refreshes fetch the release list (a few pages) plus whatever
  is new.
- Tracks are fetched with the batched several-albums call (20 per request) when
  available. A DJ with 400 releases is then ~8 list pages + ~20 track requests
  — a lower bound, since a large compilation's tracks beyond the first page
  need follow-up requests.
- If the batched call is not available, the **first** fetch takes the artist's
  own albums and singles plus the newest **150** `appears_on`/`compilation`
  releases; a **Load older releases** row at the end of the Tracks tab fetches
  the next 150. Only releases inside the fetched window are recorded in
  `dj_spotify_releases`, so resuming an interrupted fetch never pulls in the
  ones left out on purpose.
- 429 responses wait for `Retry-After`, as the Spotify section does.

**Progress.** Tracks appear as batches arrive (a `dj-tracks-progress` event per
batch); the Tracks tab shows `Loading releases… 120 of 400`. Rows are written
per completed batch, so an interrupted first fetch keeps what it got and
continues from the unseen releases on the next open. A failed refresh leaves
the cached rows as they are and shows `couldn't refresh` in the tab.

**Duplicates** (the same recording on a single and an album) collapse by ISRC
when Spotify returns one, otherwise by normalised artist + title + mix; the
earliest release date is shown.

**Ownership** is the Spotify section's Owned / Maybe / Missing, with the same
library index and verdicts.

### Resident Advisor (gigs)

- RA has no public API. The page reads the same GraphQL endpoint ra.co itself
  uses (no key), for: artist search (resolving), upcoming events, past events.
- Requests are made only when a DJ page is opened and the cache is stale —
  never in the background, never in bulk.
- **Any failure** shows the Gigs card and tab as **Gigs on Resident Advisor ↗**.
  Nothing else on the page depends on RA.
- The parser treats every field as optional and drops events it cannot read,
  rather than failing the whole list.

**The RA link** (fallback card and header button): the stored RA artist page
when one was ever resolved; otherwise a slug guessed from the name — lower-case,
non-alphanumerics removed (`Marco Carola` → `https://ra.co/dj/marcocarola`),
which is RA's usual shape and may 404 for unusual names.

### From the library (plays, sets)

- Sets for a DJ are found in TypeScript, where `extractDjName` lives: saved sets
  whose split DJ names include this DJ (a b2b set belongs to both).
- Plays need those sets' tracks: a new command `get_yt_tracks_for_sets(video_ids)`
  in `dj.rs` returns their `yt_tracks` rows in one call. Rows that are not
  unknown are grouped by normalised artist + title (+ mix) and counted once per
  set. Ownership via the library index.

### Storage — migration `016_dj_pages.sql`

- `dj_profiles` — `name_key` (PK), `display_name`, `spotify_artist_id`,
  `spotify_manual` (0/1), `spotify_image_url`, `genres` (JSON),
  `ra_artist_id`, `ra_slug`, `ra_image_url`, `ra_manual` (0/1),
  `spotify_synced_at`, `ra_synced_at`.
- `dj_spotify_releases` — `name_key`, `release_id`, `tracks_fetched` (0/1);
  PK (`name_key`, `release_id`).
- `dj_spotify_tracks` — `name_key`, `spotify_id`, `title`, `artists`, `album`,
  `release_date`, `isrc`, `duration_ms`; PK (`name_key`, `spotify_id`).
- `dj_gigs` — `name_key`, `ra_event_id`, `date`, `venue`, `city`, `country`,
  `lineup`, `url`; PK (`name_key`, `ra_event_id`). Upcoming vs past is
  computed from `date` when read, so a cached gig moves to "past" on its own.

Changing a profile's Spotify artist (manual pick) deletes that key's
`dj_spotify_releases` and `dj_spotify_tracks` rows and refetches; the same for RA
and `dj_gigs`.

### Freshness

| Data | Refreshed when the page opens and older than |
|---|---|
| Spotify artist + release list | 7 days |
| RA gigs | 24 hours |
| Plays, sets | always current (local) |

A refresh shows cached data immediately and updates when the fetch returns. A
first open with nothing cached shows skeleton rows.

## Where the code goes

- `src-tauri/src/external/resident_advisor.rs` — the GraphQL calls and the
  tolerant parser.
- Spotify artist / release / several-albums calls added to
  `src-tauri/src/external/spotify.rs`.
- `src-tauri/src/commands/dj.rs` — resolve, refresh (with progress events), read
  a profile, set a manual match, `get_yt_tracks_for_sets`.
- `src/components/views/DjView.tsx` (+ `.css`) and `DjOverview` for the cards
  and editing mode.
- `src/App.tsx` — the `'dj'` view, `djKey`, Back target.
- `SearchView.tsx` — the DJs row. `SetsView.tsx` — DJ links, `openVideoId`,
  `initialQuery`.

## Testing

- **Rust:** RA parser on hand-written responses — missing fields, unknown
  fields, a wholly different shape (→ fallback, no panic); the guessed RA slug;
  Spotify track filtering (artist on the track vs only on the release); only
  unseen releases fetched; an interrupted first fetch resuming; duplicate
  collapsing by ISRC and by name; cache staleness; manual matches surviving an
  automatic resolve; a manual change clearing the old rows.
- **TypeScript:** b2b splitting (case-insensitive, `vs`); Plays counting (once
  per set, IDs excluded, sorted by count); overview order from (y, x) and
  packing back; invalid stored layout → default; upcoming/past from date.
- **By hand:** open Luciano from Search (DJ card and Spotify card) and from a
  KEEZY set; check gigs against ra.co; block RA locally → the link card appears
  and the rest of the page is intact; first open of a large discography shows
  progress; customize the overview, open another DJ → same layout; Back returns
  to where the page was opened.

## Open items

Confirm while planning; the design states its fallback for each:
- RA's GraphQL query shapes (artist search, upcoming and past events).
- Spotify for development-mode apps: whether the several-albums batch call,
  artist `followers`, track ISRCs and artist `genres` are still returned. The
  fallbacks are the 150-release first fetch, first-result tie-break,
  name-based duplicate collapsing, and no genres line.
