# Search Before You Type, and the Same Sections on Home — Design

## Why

The Search page is empty until you type: a magnifier and "Search your library".
With 8,500 tracks, a handful of DJ pages and a few hundred plays in the history,
there is plenty to show there. Mockup:
[`2026-10-03-search-empty-mockup.html`](./2026-10-03-search-empty-mockup.html)
— the approved direction is **A + B**: A's rows (recent searches, recently
played, your DJs) with B's genre tiles, and the page can be customized.

The same sections are useful on Home, which already has a widget grid. They
are built once and used in both places.

## Sections

Each section is one component that reads only local data — no network, no
quota — and renders nothing when it has nothing to show.

| Section | Shows | Click | Data |
|---|---|---|---|
| **Recent searches** | the last 10 searches as chips, each with ×; "Clear" | runs that search again | `localStorage['search_recent']`, this machine only |
| **Recently played** | 6 tiles (cover or gradient, title, artist), play button on hover; "Show all" | plays the track; Show all opens the full list | `play_history` joined to `tracks`, newest first, one tile per track |
| **Your DJs** | round photos (Spotify image, else initials on a gradient), name, one line: next gig, else sets saved, else tracks owned | opens the DJ page | `dj_profiles` ∪ `yt_watched_djs`, most recently opened first |
| **Your library by genre** | tiles for the 6 biggest genres with track counts, plus **Recently added** (last 30 days) and **Never played** | opens All Tracks filtered to that genre or group | `tracks.genre`, `date_added`, `play_count` |
| **Recently added** | 6 rows (title, artist, "today" / "2 days ago") | plays the track | `tracks.date_added` |
| **Sets you saved lately** | 3 rows (DJ · set, owned count) | opens the set in Sets | `yt_sets` |

A search is remembered when its results are shown and the user acts on one
(opens, plays) or the query sits unchanged for 2 seconds. Duplicates move to
the front; the list keeps 10.

## Search

- With an empty query the page shows the enabled sections in the chosen order,
  under the search field. Typing hides them and shows results as today;
  clearing the field brings them back.
- Default: Recent searches, Recently played, Your DJs, Your library by genre.
  Recently added and Sets you saved lately are available but off.
- **Customize** — a sliders button at the right of the search field opens an
  edit mode like the DJ page's Overview: each section gets a switch and a drag
  handle; **Done** saves. Stored in `localStorage['search_sections']` as an
  ordered list of enabled ids; unknown ids are dropped, and a section added in
  a later version starts off.
- Empty library and no history: only the current "Search your library" text,
  as today.

## Home

Home's widget registry (`src/components/views/widgets/widgetRegistry.ts`)
gains three widgets that wrap the same components: **Your DJs**, **Library by
genre** and **Sets you saved lately**. They are added from Home's existing
widget catalog; the default Home layout does not change. Home's existing
Recently Played and Recently Added widgets stay as they are.

## Navigation

The sections need callbacks App already has: play a track (`onPlayTrack`),
open a DJ page (`openDjPage`), open Sets on a set (`openSets`), open All Tracks
with a filter. The last one is new: All Tracks gains an optional starting
filter (`genre`, `recent`, `never-played`) that App passes when a genre tile
is clicked; the existing filter UI shows it and can clear it.

## Data

Rust gains read commands for what the frontend cannot already see:

- `get_recently_played(limit)` — distinct tracks from `play_history`, newest
  play first.
- `get_genre_counts(limit)` — `genre, COUNT(*)` from `tracks`, biggest first.
- `get_known_djs(limit)` — DJ profiles and watched DJs merged by name key,
  with image URL, next gig date, saved set count and owned track count.

Recently added, never played and saved sets can use data the frontend already
loads (the library and the Sets library); the plan decides per section.

## Testing

- Rust: each new query on an in-memory database — distinct and ordered plays,
  genre counts ignoring NULL, DJ merge by name key with the right one-line
  fact.
- TypeScript: recent-searches list rules (dedupe to front, cap 10, clear), the
  section-order storage (unknown ids dropped, new ids off), the "one line" for
  a DJ.
- By hand: empty query shows the sections; typing hides them; customize,
  restart, order kept; a genre tile opens All Tracks filtered; the three Home
  widgets can be added.

## Out of scope

Recommendations, AI, anything fetched from the network, cross-device sync of
recent searches.
