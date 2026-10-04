# Search Before You Type, and the Same Sections on Home — Design

## Why

The Search page is empty until you type: a magnifier and "Search your library".
With 8,500 tracks, a handful of DJ pages and a few hundred plays in the history,
there is plenty to show there. Mockup:
[`2026-10-03-search-empty-mockup.html`](./2026-10-03-search-empty-mockup.html)
— the approved direction is **A + B**: A's rows (recent searches, recently
played, your DJs) with B's genre tiles, and the page can be customized.

Home is redesigned in its own spec
([`2026-10-04-home-cards-design.md`](./2026-10-04-home-cards-design.md)). Only
the queries and the All Tracks filter are shared with it; the sections below
are built for Search alone.

## Sections

Each section is one component that reads only local data (no network, no
quota). A section with nothing to show is not rendered.

| Section | Shows | Click | Data |
|---|---|---|---|
| **Recent searches** | the last 10 searches as chips, each with ×; "Clear" | runs that search again | `localStorage['search_recent']`, this machine only |
| **Recently played** | 6 tiles: the file's artwork as the track table spec's 72px thumbnail (`artwork_path` is empty for every track), else a gradient from the title; title, artist; play button on hover | plays the track | new `get_recently_played_tracks(limit)` |
| **Your DJs** | round photos (Spotify image, else initials on a gradient), name, one line | opens the DJ page | new `get_known_djs(today)` + `localStorage['dj_recent']` |
| **Your library by genre** | tiles for the 6 biggest genres with counts, plus **Recently added** and **Never played** with counts | opens All Tracks with that filter | new `get_library_groups()` |
| **Recently added** | 6 rows (title, artist, "today" / "2 days ago") | plays the track | new `get_recently_added_tracks(limit)` (full track rows, shared with Home; the old `get_recently_added` returns five fields and cannot be played) |
| **Sets you saved lately** | 3 rows (title, channel, date saved) | opens the set in Sets | existing `listYouTubeSets()`, newest first |

**Recent searches.** A query is remembered when, trimmed, it is non-empty and
either the user opens or plays one of its results, or it stays unchanged for 2
seconds after the last keystroke while it has results. Comparison is
case-insensitive; a repeat moves to the front; the list keeps 10.

**Your DJs.** `get_known_djs(today)` returns one row per name key, merging
`dj_profiles` and `yt_watched_djs`: `nameKey`, `displayName`, `imageUrl`
(`spotify_image_url`, else `ra_image_url`), `nextGig` (the earliest
`dj_gigs` date on or after `today` — the local day, "2026-10-04", passed by the
frontend as `splitGigs` uses it — with its venue), `watched`. The one line
is the next gig ("next gig Sat, Oct 3"), else "watching for sets" when
watched, else nothing. Order: the DJ pages opened most recently first — the
frontend keeps `localStorage['dj_recent']` (name keys, newest first, max 20),
written when a DJ page opens — then the rest by name. No migration.

**Library groups.** `get_library_groups()` returns the genres with counts
(`genre IS NOT NULL`, biggest first, top 6), the count added in the last 30
days (`date_added` is SQLite's `datetime('now')`, `YYYY-MM-DD HH:MM:SS` in
**UTC**, compared with `datetime('now', '-30 days')`), and the count never played. **Never
played** means no row in `play_history` for the track — `tracks.play_count`
is not kept up to date (it is 0 on every track while the history holds 441
distinct tracks), so it is not used.

**Recently played.** `get_recently_played_tracks(limit)` returns distinct
tracks by their latest play (`MAX(played_at)`), joined to `tracks` with an
inner join so deleted files drop out, newest first, as full `Track` rows with
their analysis (BPM, key) and that latest `played_at` (Home's Recently played
shows the time). The
existing `get_recently_played` (one row per play) is removed with Home's old
Recently Played widget (Home spec).

## Search

- With an empty query the page shows the enabled sections in the chosen order,
  under the search field. Typing hides them and shows results as today;
  clearing the field brings them back.
- Default: Recent searches, Recently played, Your DJs, Your library by genre.
  Recently added and Sets you saved lately are available but off.
- **Customize** — a sliders button at the right of the search field turns the
  sections into a plain list: each row has a switch, and ▲ / ▼ buttons to move
  it. No grid and no drag library (the DJ Overview's packed grid is not
  reused). **Done** saves. Stored in `localStorage['search_sections']` as an
  ordered list of `{ id, on }`; unknown ids are dropped, and a section added in
  a later version is appended, off.
- With an empty library and no history: only the current "Search your
  library" text, as today.

## All Tracks filter (new)

All Tracks has only a text search today. It gains a filter: the `TrackFilter`
object of the track table spec
([`2026-10-04-track-table-design.md`](./2026-10-04-track-table-design.md)),
which also defines its panel and how it shows.

- App's `tableFilter: TrackFilter | null` (track table spec), set by a genre
  tile as it opens All Tracks, and cleared whenever another view opens. The
  track table plan builds the filter; this plan comes after it and only sets
  it.
- A genre tile sets `{ genre }`; **Recently added** `{ added: 30 }`; **Never
  played** `{ played: 'never' }` (played ids from new `get_played_track_ids()`,
  read when this filter is chosen).
- It shows in the table's **Filter** button ("Genre: Tech House ✕" becomes
  "Tech House ✕"), not as a chip; ✕ clears it. The text search still works
  within the filtered tracks.

## Home

**Superseded** by [`2026-10-04-home-cards-design.md`](./2026-10-04-home-cards-design.md):
Home becomes a grid of 15 cards, and the three widgets planned here are among
them. This spec's plan 2 is replaced by that spec's plan.

## Navigation

Play a track uses App's existing play handler; a DJ page uses `openDjPage`;
a set uses `openSets({ openVideoId })`; a genre tile sets `allTracksFilter`
and opens All Tracks.

## Plan split

One spec, one plan here: **Search sections and the All Tracks filter**. The
Home widgets moved to the Home cards spec.

## Testing

- Rust: each new query on an in-memory database — distinct plays ordered by
  latest play with deleted tracks left out; genre counts ignoring NULL; the
  30-day and never-played counts; the DJ merge by name key and the next gig
  only from today on.
- TypeScript: recent-searches list rules (dedupe to front, cap 10, clear), the
  section-order storage (unknown ids dropped, new ids off), the "one line" for
  a DJ.
- By hand: empty query shows the sections; typing hides them; customize,
  restart, order kept; a genre tile opens All Tracks filtered.

## Out of scope

Recommendations, AI, anything fetched from the network, cross-device sync of
recent searches.
