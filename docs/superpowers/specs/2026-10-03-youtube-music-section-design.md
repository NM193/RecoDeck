# YouTube Music Section — Design

## Why

Tracks also get liked on YouTube Music, and DJs and labels publish playlists
there. As with Spotify, nothing says which of those tracks are already in the
RecoDeck library. The YouTube Music section answers the same question per
track — **do I own this?** — and makes the missing ones one click away from
SelectedRecs.

It mirrors the Spotify section
([`2026-10-03-spotify-section-design.md`](./2026-10-03-spotify-section-design.md));
this document describes only what differs, and the toggle both sections gain.

## What the API allows (checked on the real account, 2026-10-03)

A throwaway script signed in with a Desktop OAuth client
(scope `youtube.readonly`, PKCE, loopback redirect on a random port) as the
account in use, which has YouTube Premium but **no YouTube channel**:

| Call | Result |
|---|---|
| Sign-in, token exchange | Works; a refresh token is issued. |
| `channels?mine=true` | 0 channels. |
| `playlists?mine=true` | `404 channelNotFound` — without a channel, the account's own playlists cannot be listed. |
| `playlistItems?playlistId=LM` (Liked music) | Works: 62 items, music only. |
| `playlistItems?playlistId=LL` (Liked videos) | Works: 84 items, music mixed with unrelated videos. Not used. |

The API also has no way to list playlists the user follows. So:
- **Liked music (`LM`)** is synced automatically.
- **Playlists** — the user's own and anyone else's — are added **by link**.
  Signed in, a link to the user's own private playlist works too.

Titles seen: mostly `Artist - Title (Mix)`, but also a bare `Honey Hunter` on
the channel `Extrawelt - Topic`, and whole DJ sets
(`Dan Ghenacia | Live Vinyl DJ Set | …`).

## Scope

In:
- Connect a Google account (the user's own Desktop OAuth client, PKCE).
- Sync Liked music automatically, and playlists added by link.
- Show each track as **Owned / Maybe / Missing** against the library.
- Play on YouTube Music, SelectedRecs, Copy.
- DJ sets kept apart, each one click away from Sets.
- A **Show in sidebar** toggle for both YouTube Music and Spotify.

Out:
- Writing anything to YouTube (likes, playlist edits).
- Listing the user's own playlists automatically: there is no channel.
- Playback control. YouTube has no API for that.
- Liked videos (`LL`): it mixes in videos that are not music.

## Where it lives

### Sidebar

A **YOUTUBE MUSIC** section below SPOTIFY, built like it: **All playlists**,
**Liked music**, then one item per added playlist, in the order they were
added. The "new and missing" number works as Spotify's does.

- **+ Add playlist** at the end of the section opens a one-line field. A
  playlist URL (`…?list=…`, `music.youtube.com` or `youtube.com`) or a bare
  playlist id are accepted. RecoDeck reads the playlist's name
  (`playlists?id=…`, 1 unit). A playlist that cannot be read gets one line
  under the field ("Not found — private playlists work only from the account
  that owns them"), and nothing is stored. A readable playlist is fetched in
  full right away, and that fetch is its "new" baseline.
- Right-click a playlist → **Remove**. Liked music cannot be removed.

Hidden until connected, and whenever **Show in sidebar** is off.

### Main view

One view serves both services. `SpotifyView`'s header, toolbar, table, footer
and row actions become a `StreamingListView` that takes the service's rows and
actions as props. `SpotifyView` becomes a thin wrapper, and a
`YouTubeMusicView` is added next to it. Data comes from a `useYouTubeMusic`
hook beside `useSpotify`. `useSpotify` keeps its interface, because
`DjView`, `SearchView` and `useDjSearch` also use it.

Differences from the Spotify view:
- Kicker `YOUTUBE MUSIC PLAYLIST`, a red cover gradient (a heart for Liked music).
- The **Added** column is the item's `snippet.publishedAt`, when it was added
  to the playlist.
- **Sets group.** Items longer than **20 minutes** are not tracks. They are
  left out of the table, the filters, the counts and matching, and are listed
  below the table under **Sets (3)**: title, channel, length, and
  **Open in Sets**.
- **Unavailable items.** Deleted or private videos have no owner channel and
  are titled `Deleted video` / `Private video`. They are skipped, and the footer
  says `2 unavailable` when there are any.

### Row actions

| Status | Shown |
|---|---|
| **Owned** | `✓ Owned`, play on YouTube Music |
| **Missing** | `Missing`, play on YouTube Music, SelectedRecs ↗, Copy |
| **Maybe** | `Maybe`, play on YouTube Music, **Yes** / **No**, and the sub-row as in Spotify |

- **Play** (the red YouTube glyph) opens
  `https://music.youtube.com/watch?v=<videoId>` in the system browser. The
  exact video is known, so there is no search.
- SelectedRecs and Copy use the parsed artist / title / mix (below), with the
  same rules as Spotify's (SelectedRecs without the mix, Copy with it). Copy is
  the discreet icon button.
- **Open in Sets** opens Sets on that video. `SetsStart.openVideoId` today opens
  only a set already stored (`getYouTubeSet`). It is extended: when the video
  is not stored, Sets fetches it as a pasted link would (`fetchYouTubeSet`) and
  shows it. That fetch uses the API key, as Sets always does. Without a key,
  or on any other failure, Sets shows its usual error for a pasted link. The
  current silent `.catch(() => {})` is not kept for this path.

### Settings → YouTube Music

Next to Settings → Spotify:
1. Short steps: in the Google Cloud project that holds the YouTube API key,
   configure the Google Auth Platform (External, the user added under Test
   users), create an OAuth client of type **Desktop app**, download its JSON.
   No redirect URI is entered: Google accepts any loopback port for Desktop
   clients.
2. **Choose client file…** reads `client_id` and `client_secret` from that
   JSON (`installed.*`). The file is not kept. A file that is not a Desktop
   client gets one line saying so.
3. **Connect** / **Disconnect**, and the signed-in email.
4. **Show in sidebar**.
5. Last sync result.

### The Show in sidebar toggle (both sections)

Settings → Spotify and Settings → YouTube Music each get a **Show in sidebar**
switch, on by default. Off:
- the section and its number leave the sidebar (and the collapsed rail);
- an open list of that service closes to the default view;
- that service's sync loop skips its runs;
- the sign-in and stored rows stay. Turning it back on shows the stored data
  at once and syncs;
- everything else that uses the service keeps working. That is DJ pages'
  Spotify tracks and Search's Spotify DJs today. The switch is about the
  sidebar section, not the connection.

Stored as `spotify_show_in_sidebar` / `youtube_music_show_in_sidebar` in
`settings`. When the key is absent, the switch is on.

## How it works

### Connecting

- Authorization Code flow with PKCE against
  `https://accounts.google.com/o/oauth2/v2/auth`. Scopes are
  `openid email https://www.googleapis.com/auth/youtube.readonly`.
  `access_type=offline` and `prompt=consent` make Google issue a refresh token.
- The redirect is `http://127.0.0.1:<port>/callback`, where the port is
  whatever the OS gives a listener bound to port 0. It is open for the login
  only, at most 5 minutes. Spotify's listener (`bind_listener`,
  `wait_for_callback` in `external/spotify_auth.rs`) is reused. It takes the
  port and the service name for its messages as parameters, and both services
  answer on `/callback`.
- Token exchange and refresh go to `https://oauth2.googleapis.com/token`. Google
  requires `client_secret` for Desktop clients, alongside the PKCE verifier.
  Google's own docs say a Desktop client's secret is not confidential.
- The email comes from the `id_token` the exchange returns.
- `youtube_music_client_id`, `youtube_music_client_secret`,
  `youtube_music_refresh_token` and `youtube_music_email` are stored in
  `settings`, like Spotify's. Access tokens live in memory.
- **Testing vs production.** While the Google Auth Platform app is in
  *Testing*, Google expires refresh tokens for sensitive scopes after 7 days.
  The steps in Settings tell the user to press **Publish app**. Google then
  shows "Google hasn't verified this app" at sign-in, which is passed with
  Advanced → Continue, and the refresh token stops expiring. Confirm by hand
  (see Open items).

### Syncing

Backend: `external/youtube_auth.rs` (sign-in, refresh), `external/youtube_music.rs`
(reading lists), `commands/youtube_music.rs`, `db/youtube_music.rs`. The
Spotify files are the model.

- **Quota.** OAuth calls are charged to the OAuth client's project, which is
  the API key's project, so they share the 10,000-unit day. Every call goes
  through the existing quota counter (`youtube_quota`). `playlistItems` and
  `videos` cost 1 unit per page of 50.
- **Reading a list:** `playlistItems?part=snippet,contentDetails&maxResults=50`,
  paged.
- **No snapshot id exists**, so a list is checked with its first page (1 unit):
  if `pageInfo.totalResults` and the first page's item ids match what is
  stored, the list is skipped. Otherwise it is refetched in full. Once a day
  every list is refetched in full regardless, which catches a removal and an
  addition that cancel out past the first page.
- **Durations.** `videos?part=contentDetails&id=…` (50 ids per unit) is called
  only for video ids not stored yet, with the OAuth token, so the section does
  not also need the API key. `parse_iso_duration` already exists in
  `external/youtube.rs`.
- **When:** at start-up and every **30 minutes** (Spotify's loop runs every
  10). The longer interval is because the quota is shared with Sets. A sync can
  also be run from the header's "synced …". The loop does nothing while
  disconnected or hidden. It emits `youtube-music-synced`, shaped like
  `spotify-synced`.
- **Cost:** ~1,000 tracks is ~40 units for a first sync (20 pages of items and
  20 of durations), and a few units for an unchanged sync.

### Reading a YouTube title

`src/lib/youtube-music/title.ts` turns `(title, channel)` into the shape the
library matcher reads (the shape `toParsed` gives Spotify tracks):

1. Remove noise in brackets: `(Official Video)`, `(Official Audio)`,
   `[Free Download]`, `(Visualizer)`, `[HD]`, `(Lyrics)`, `(Premiere)`, and so on.
2. Cut a trailing ` | Label` or ` | …` segment. The part before the first ` | `
   is the track.
3. `Artist - Title (Mix)`: the first ` - ` (or ` – `) splits artist from title.
   A trailing `(… Mix)`, `(… Remix)`, `(… Edit)` or `[… Mix]` is the mix.
   `feat.` is handled as the parser already does.
4. When there is no ` - `, the channel is the artist if it ends in ` - Topic`
   (YouTube's auto-generated artist channels), with that suffix removed.
   Otherwise the title alone is matched, which usually ends Missing or Maybe.

The examples from the account's Liked music are the test cases.

### Matching, verdicts, "new"

As in Spotify: frontend matching against the same tokenised library index,
**Owned / Maybe / Missing**, Yes/No verdicts per (video id, library track), and
"new" meaning `first_seen_at` later than the list's `last_opened_at`, with a
list's first sync as the baseline. Sets (over 20 minutes) and unavailable items
never count as new.

The ownership code takes a parsed track and does not depend on Spotify's
types. Where it does today, it is changed to take a small source-agnostic
shape (`{ id, parsed, … }`) that both services produce. The Spotify view's
behaviour does not change.

### Storage — migration `017_youtube_music.sql`

- `ytm_tracks` — `video_id` (PK), `title` (raw), `channel`, `duration_ms`.
- `ytm_lists` — `id` (PK; `LM` for Liked music, else the playlist id), `name`,
  `position`, `track_count`, `total_results`, `first_page_ids` (JSON),
  `full_synced_at`, `last_opened_at`, `unavailable_at` (set on a 404, cleared
  when the list reads again).
- `ytm_list_tracks` — `list_id`, `video_id`, `added_at`, `first_seen_at`; PK on
  both ids.
- `ytm_match_verdicts` — `video_id`, `library_track_id`, `verdict`; PK on both
  ids, with the same delete trigger as Spotify's.

Removing a playlist deletes its `ytm_lists` and `ytm_list_tracks` rows, then
removes tracks that are now in no list. Verdicts are kept.

### Errors

- **`invalid_grant`** (revoked, or expired in Testing): a "Reconnect YouTube
  Music" bar. The stored lists stay visible.
- **Quota used up** (`403 quotaExceeded`): the meta line reads
  `YouTube quota used up · resumes after midnight Pacific`. The loop waits for
  the next Pacific day, as the quota counter already knows how to.
- **A playlist that disappeared** (`404 playlistNotFound` on a stored list):
  the list stays, marked `no longer available`, until it is removed.
- **Offline:** as in Spotify.
- **Disconnect:** removes the tokens, the tracks, the list-track pairs and the
  verdicts. The added playlists stay in `ytm_lists` (id, name, position) with
  their sync state cleared, because unlike Spotify's they cannot come back on
  their own. Connecting again refetches them as a first sync. The client file
  values stay too, so connecting again needs no new file.

## Testing

As with Spotify, no captured responses are committed. Tests use small
hand-written JSON.

- **Rust:** client-file parsing (Desktop vs Web vs junk); token responses;
  `playlistItems` page parsing, including deleted and private items; the
  first-page skip rule and the daily full refetch; durations requested only for
  unseen ids; the "new" rules; removing a playlist; the hidden toggle making
  the loop skip.
- **TypeScript:** YouTube title → artist / title / mix for every pattern above
  and for the account's examples; the 20-minute split into the Sets group;
  ownership through the shared shape (the Spotify tests stay green).
- **By hand, on the real account:** connect; Liked music shows ~60 tracks plus
  a Sets group; add a playlist by link, including a private one; like a track
  on the phone and see it within 30 minutes; Open in Sets on a liked set; the
  two toggles.

## Open items

- **Refresh-token lifetime after Publish app.** Check by hand that a token
  issued after publishing still works after 7 days.
- **Order of `LM`.** It looks newest-first, matching `LL`. The design does not
  rely on that; `added_at` is read per item.
