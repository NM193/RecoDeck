# Spotify Section — Design

## Why

Tracks get liked on Spotify in the car and then never get downloaded. About a
thousand tracks sit across Liked Songs and ~20 playlists, and nothing says which
of them are already in the RecoDeck library.

The Spotify section answers one question per track — **do I own this?** — and
makes the missing ones one click away from being downloaded (SelectedRecs is the
store in use). New likes are surfaced the next time RecoDeck is opened, so they
are not forgotten again.

Mockup: [`2026-10-03-spotify-section-mockup.html`](./2026-10-03-spotify-section-mockup.html)
(open in a browser; it is the approved v5).

## Scope

In:
- Connect a Spotify account (per-user Client ID, PKCE login).
- Sync Liked Songs and **every** playlist the user owns or follows, automatically.
- Show each Spotify track as **Owned / Maybe / Missing** against the library.
- Copy, play on Spotify, and open the track's search on SelectedRecs.
- A count of new, missing likes in the sidebar.

Out:
- Writing anything to Spotify (no liking, no playlist edits).
- A shared "to download" list across Spotify and Sets.
- Manual "downloaded" checkmarks — ownership is derived from the library.

## Where it lives

### Sidebar

A new collapsible **SPOTIFY** section in the main sidebar, below FOLDERS and
PLAYLISTS, built the same way they are (chevron, icon, uppercase label). The
sidebar scrolls as a whole when FOLDERS is open.

Inside it:
- **All playlists** `(1021)` — every synced Spotify track, deduplicated.
- **Liked Songs** `(731)`
- One item per playlist, with its track count, in Spotify's order.

New likes are shown as a **plain number in the accent colour** (`--accent-hover`,
11px, weight 600), right-aligned where counts sit — no pill, no background.
- Collapsed: the number sits on the SPOTIFY header.
- Expanded: the same number also shows on each list item that received the new
  tracks.

The number counts tracks that are **new and not owned** (see "What counts as
new" below). Liking something already in the library does not raise it. On the
SPOTIFY header it is a count of distinct tracks: one track new in two playlists
counts once there, and once on each of the two list items.

Hidden entirely until Spotify is connected.

### Main view

Opened by clicking any item in the SPOTIFY section.

- **Header** in the style of the playlist detail header: cover (heart for Liked
  Songs, gradient for playlists), kicker "SPOTIFY PLAYLIST", title, and a meta
  line: `731 tracks · 452 owned · 263 missing · 16 maybe · ⟳ synced 2 min ago`.
  Clicking "synced …" runs a sync now.
- **Toolbar:** search within the list, and filter chips **All / Missing / Maybe
  / Owned** with counts. The filter is remembered per session; default is All.
- **Table** in the TrackTable style (36px header, 32px rows, 13px):
  `# · Title · Artist · Added · Status`. In **All playlists** a **Playlist**
  column is added after Artist, listing every playlist the track is in.
  Default sort: date added, newest first. In **All playlists** a track in
  several lists sorts by its newest `added_at`. Footer: `263 of 731 · sorted by
  date added, newest first`.
- **New tracks** carry an indigo dot before the title. Opening a list marks its
  tracks seen; opening **All playlists** marks every list seen.

### Row actions (Status column)

| Status | Shown |
|---|---|
| **Owned** | `✓ Owned` in `--color-success`, Spotify play button |
| **Missing** | `Missing`, Spotify play button, SelectedRecs ↗, **Copy** (primary) |
| **Maybe** | `Maybe` in `--color-warning`, Spotify play button, **Yes** / **No**; a sub-row below shows `In library: <file name>` and why it is unsure |

- **Copy** writes `Artist(s) - Title (Mix)` to the clipboard and shows
  `✓ Copied` for ~1.5s. The mix is kept: the version matters when searching a store.
- **Spotify play button** (green Spotify glyph): plays the track on the user's
  active Spotify device via the Web API. If that fails because there is no
  active device or the account is not Premium, it opens `spotify:track:<id>` in
  the Spotify app instead. No error is shown for the fallback.
- **SelectedRecs ↗** opens
  `https://srv.selectedrecs.com/#/search?text=<Artist(s) - Title, URL-encoded>`
  in the system browser — the same text as Copy, without the mix, since the
  search lists every version of a release and the mix only narrows it. Checked
  by hand: `Moreno & Prieto, Sortech - 300 Cash` finds the release.
- **Yes / No** on a Maybe row is stored and never asked again for that
  Spotify-track/library-file pair.
- Double-clicking an **Owned** row plays the library file, as everywhere else.

### Settings → Spotify

A new section next to the YouTube one:
1. Short steps for creating an app on developer.spotify.com, including the exact
   redirect URI to register.
2. **Client ID** field.
3. **Connect Spotify** / **Disconnect**, and the connected account's name.
4. Last sync result, and the playlists Spotify would not share (see below).

## How it works

### Connecting (PKCE)

- Authorization Code flow with PKCE; no client secret exists anywhere.
- RecoDeck opens the Spotify authorize page in the system browser and listens
  on a fixed loopback redirect, `http://127.0.0.1:47816/callback`, for the
  duration of the login only (axum is already a dependency). If the port is
  taken, Settings says so in one line; nothing else is attempted.
- Scopes: `user-library-read`, `playlist-read-private`,
  `playlist-read-collaborative`, `user-read-playback-state`,
  `user-modify-playback-state`.
- The Client ID and the refresh token are stored in the `settings` table, the
  same place as the YouTube API key. Access tokens live in memory only and are
  refreshed when they expire.

### Syncing

Backend: `src-tauri/src/external/spotify.rs` (HTTP, paging, token refresh) and
`src-tauri/src/commands/spotify.rs` (Tauri commands), mirroring the YouTube split.

- **First sync:** all of Liked Songs and every playlist. ~1000 tracks is on the
  order of 20–30 requests.
- **Liked Songs, afterwards:** read newest-first and stop at the first track
  already known. Unlikes are invisible to that, so the `total` Spotify reports
  is compared with the stored count; if they differ, Liked Songs is refetched
  in full.
- **Playlists, afterwards:** each playlist's `snapshot_id` is compared with the
  stored one; unchanged playlists are skipped, changed ones are refetched in
  full. Playlists no longer returned by Spotify are removed.
- **Skipped items:** podcast episodes, local files (no Spotify id), and
  Spotify-owned/editorial playlists that the API refuses to new apps. The
  refused playlists are listed in Settings by name.
- **When:** a backend loop, spawned at startup the way Sets spawns
  `spawn_channel_watcher` (`commands/youtube.rs`, started from `lib.rs`): sync
  on start, then every 10 minutes while the app is open. After every sync —
  with or without changes, and on failure — it emits a `spotify-synced` event
  carrying `{ changed, lastSyncedAt, error }`. The frontend reloads its Spotify
  data when `changed` is true, and always updates the header's "synced …" /
  "couldn't reach Spotify" line and the Reconnect bar. Clicking "synced …" runs
  the same sync on demand. The loop does nothing while no account is connected.
- **Rate limits:** a 429 waits for `Retry-After` before continuing.

### Storage — migration `015_spotify.sql`

- `spotify_tracks` — `spotify_id` (PK), `title`, `artists` (display string),
  `album`, `duration_ms`.
- `spotify_lists` — `id` (PK; `liked` for Liked Songs, else the playlist id),
  `name`, `snapshot_id`, `position`, `track_count`, `last_opened_at`.
- `spotify_list_tracks` — `list_id`, `spotify_id`, `added_at` (Spotify's: when
  it was liked/added), `first_seen_at` (RecoDeck's: when a sync first stored
  this pair); PK on both ids.
- `spotify_match_verdicts` — `spotify_id`, `library_track_id`, `verdict`
  (`yes` / `no`); PK on both ids. Rows for a deleted library track are ignored
  (and removed when noticed).

### What counts as new

A track is **new in a list** when its `first_seen_at` is later than that list's
`last_opened_at`. RecoDeck's own first-seen time is used rather than Spotify's
`added_at`: a track liked at 09:00 and first synced at 09:30, after the list was
opened at 09:10, must still count as new.

- **A list's first sync is the baseline.** When a list is stored for the first
  time — at the very first sync, or when a playlist appears later — its
  `last_opened_at` is set to that sync's time and each of its pairs gets the
  same time as `first_seen_at`. The comparison is strictly "later than", so
  nothing that already existed shows as new, and `last_opened_at` is never empty.
- **A refetch keeps `first_seen_at`.** A full refetch (Liked Songs on a `total`
  mismatch, a playlist whose `snapshot_id` changed) upserts: existing pairs keep
  their `first_seen_at`, new pairs get the sync time, and only pairs Spotify no
  longer returns are deleted. Delete-then-insert would mark the whole list new.
- **Tracks in no list** (unliked, and in no remaining playlist) are deleted from
  `spotify_tracks` at the end of a sync. Their verdicts are kept, so a re-like
  does not ask again.
- **Opening a list** sets its `last_opened_at` to now. Opening **All playlists**
  sets it on every list.
- The sidebar numbers and the dots both count only tracks that are new **and**
  not Owned.

### Matching

Done in the frontend, where the whole library is already in memory, using the
same soft name matching as Sets (`src/lib/tracklist/match.ts`). No database work.

`match.ts` was built for ~40 set rows; here it is ~1,000 Spotify tracks against
~8,500 library tracks, and it is needed at startup for the sidebar number. So
the result is computed once per change of the library or of the Spotify data
(memoized, never per render), against a library index whose names are
tokenized once up front rather than on every comparison.

- Before matching, a Spotify title is converted to the parser's shape: a
  trailing ` - Extended Mix` / ` - X Remix` becomes the mix, `(feat. X)` is
  handled as the parser already does. Without this, much that is owned would
  read as Missing.
- Strong match → **Owned**. Weak match → **Maybe**. None → **Missing**.
- A `yes` verdict makes the pair Owned; a `no` verdict removes that library
  file from the index for that one track before matching (it may then be
  Missing, or Maybe on another file).
- The Maybe sub-row's reason ("same title, artist partly matches") comes from
  the title and artist agreements the match computes. `matchOne` currently
  returns only their combined `score`, so `LibraryMatch` gains two fields,
  `titleScore` and `artistScore`; existing callers are unaffected.
- Because ownership is derived, a track flips to Owned as soon as its file is
  in the library — no sync needed.

### Errors

- **Refresh token revoked / expired:** a "Reconnect Spotify" bar in the Spotify
  view; the cached tracks stay visible.
- **Offline / Spotify down:** last data stays; the meta line reads
  `last synced 2 h ago · couldn't reach Spotify`; the next interval retries.
- **Disconnect:** removes the tokens and all `spotify_*` rows. Nothing on
  Spotify is ever modified.

## Testing

Spotify responses contain someone's library, so captured responses are not
committed — the same rule as the YouTube fixtures. Tests use small hand-written
JSON.

- **Rust:** page parsing; incremental Liked Songs stopping at the first known
  track; full refetch when `total` disagrees; snapshot-based playlist skipping;
  skipping episodes and local files.
- **Rust:** also the "new" rules — a list's first-sync baseline (no track new,
  a like right after it new), `first_seen_at` vs `last_opened_at`, a full
  refetch keeping `first_seen_at`, opening All playlists marking every list seen.
- **TypeScript:** Spotify title → artist/title/mix conversion; Owned / Maybe /
  Missing with and without verdicts; the deduplicated "new and missing" count;
  Copy text.
- **By hand, on the real account:** connect; first sync of ~1000 tracks; like a
  track on the phone → within 10 minutes the sidebar shows 1; download it → the
  row turns Owned; play button with Spotify open and closed.

## Open items

- **Spotify API details to confirm while planning:** the current playlist-items
  endpoint name, whether a loopback redirect may use a dynamic port, and the
  current development-mode limits for personal apps. The design does not depend
  on any of them beyond the fixed port above.
