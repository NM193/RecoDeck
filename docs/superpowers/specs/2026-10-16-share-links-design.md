# Playlist share links: one playlist, with an expiry

Date: 2026-10-16. Mockup (approved): https://claude.ai/artifact/7jWBoFQQ3ER481YQwsTkkx

## Problem

`SharePlaylistModal` builds `<companion url>/?token=<companion token>&playlist=<id>&name=<name>`. That token is the
companion server's only token. It opens every Bearer route: the whole library (`/api/tracks`), search, any playlist,
and a stream ticket for any track. The mobile page saves it in `localStorage`. So sharing one playlist hands the whole
library to anyone on the same network.

The share page also injects `name` (URL-decoded) into an inline `<script>` and escapes only `\`, `"` and newline.
A crafted `name=</script><script>…` runs code on the origin whose `localStorage` holds the token (reflected XSS).

## Goal

A share link opens one playlist, for a time the user picks, and can be stopped. The owner's pairing (the companion
token) stays as it is.

## Data

Migration `021_share_links.sql`:

```sql
CREATE TABLE IF NOT EXISTS share_links (
    token       TEXT PRIMARY KEY,                -- 32 random bytes, hex (server::generate_token)
    playlist_id INTEGER NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE,
    days        INTEGER NOT NULL,                -- 1, 7 or 30: the duration last picked
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at  INTEGER NOT NULL                 -- unix seconds
);
```

- **One link per playlist** (`UNIQUE`). Sharing the same playlist again shows the same link.
- The token is stored as is, like `companion_token`, so the list can copy it again.
- A deleted playlist takes its link with it (cascade; `PRAGMA foreign_keys = ON` is set).
- **Expired rows** are deleted whenever links are listed or looked up.

`db/share.rs` (new), on `Database`:
- `share_link_for(playlist_id) -> Option<ShareLink>`: the live link only.
- `create_share_link(playlist_id, days) -> ShareLink`: replaces any expired row.
- `set_share_link_days(token, days) -> Option<ShareLink>`: `expires_at = now + days`.
- `list_share_links() -> Vec<ShareLink>`: live ones, with the playlist name, newest first.
- `delete_share_link(token) -> bool` and `delete_all_share_links() -> usize`.
- `shared_playlist(token, now) -> Option<i64>`: the playlist of a live link.
- `playlist_has_track(playlist_id, track_id) -> bool`.

`ShareLink { token, playlist_id, playlist_name, days, created_at, expires_at }`. `days` outside {1, 7, 30} is
rejected in the commands (Validation error).

## Commands (Tauri)

- `get_or_create_share_link(playlist_id) -> ShareLinkDTO`: the live link, else a new one for 7 days.
- `set_share_link_days(token, days) -> ShareLinkDTO`. Errors when the link is gone.
- `list_share_links() -> Vec<ShareLinkDTO>`.
- `stop_share_link(token)` and `stop_all_share_links() -> usize`.

The DTO is the struct above in snake_case. The frontend builds the URL: `<companion url>/?share=<token>`.

## Companion server

**Auth** (`auth_middleware`). A Bearer token is checked in this order:

1. **The companion token: full access, as now.** The comparison is constant-time: a byte-wise XOR fold over equal
   lengths, with a length mismatch failing.
2. **A live share token: share access.** The middleware puts `Access::Share { playlist_id }` in the request
   extensions. It allows only:
   - `GET /api/status`;
   - `GET /api/playlists/{playlist_id}/tracks`, only for its own playlist;
   - `POST /api/stream-ticket`, only for a track in its playlist (checked in the handler through the extension).

   Anything else returns **403**.
3. **Anything else: 401.** That covers an unknown token, an expired link and a stopped link.

`/stream/*`, `/api/self`, `/`, `/assets/*` and the `yt-*` pages stay public, as now. A stream ticket is only issued
through the checks above.

**`GET /api/status`** keeps its fields. Under share access it adds the playlist and expiry, and returns no library
count:
- the added field is `"share": {"playlist_id", "playlist_name", "expires_at"}`;
- `track_count` is the playlist's count instead of the library's.

**The share page** (`serve_index_with_url`):
- reads `share=<token>` as well as the old `token`, `playlist` and `name`;
- injects `window.__RECODECK_SHARE__`;
- writes every injected value as a JSON string literal (`serde_json::to_string`), then replaces `<`, `>`, `&`,
  U+2028 and U+2029 with `<`, `>`, `&`, ` ` and ` `, so no value can end the `<script>`;
- escapes the `<meta content>` value for an HTML attribute (`&`, `"`, `<`, `>`).

Old links (`token` + `playlist`) keep working until the user regenerates the companion token. The Settings warning
below says so.

## Desktop UI (see the mockup)

**`SharePlaylistModal`** (artboard 1):
- Opening it calls `get_or_create_share_link`. It no longer receives the companion token. `App.handleSharePlaylist`
  passes only the URL. A server that is not running gives the same toast as now.
- **Header:** `Share playlist` / `<name>`, plus a Close button.
- **QR** of the link, with the text `Scan with a phone camera, or send the link. It opens this playlist only, not the
  rest of your library.`
- **Link:** a read-only field, plus `Copy link` (`navigator.clipboard.writeText`). The button shows `Copied` for 2 s;
  on an error, a toast.
- **`Link works for`:** a segmented control `24 hours | 7 days | 30 days`.
  - The link's `days` is pressed.
  - A click calls `set_share_link_days`, which restarts the time from now.
  - Under it: `Expires <Mon D> at <HH:MM>. Stop it any time in Settings → Mobile Companion.`
- **Note** (Wi-Fi icon): `Works on the same Wi-Fi while RecoDeck is open on this Mac.`
- **Footer:** `Open in browser` and `Done`, which closes.
- All copy is in English; the old Serbian hint is gone.

**`CompanionSection`** (artboard 2). These go under the running-server status:
- **`Shared playlists`**:
  - the count, and `Stop all sharing`;
  - one row per live link: the playlist name, `Shared <Mon D> · expires in <N days|N hours>` (amber under 24 h),
    `Copy link` and `Stop sharing`;
  - empty: `No shared playlists.`
  - Hint: `A share link opens one playlist only and stops working when it expires.`
  - The list loads with the section and after each action.
- **Near `Regenerate Token`**, an amber note: `Playlist links shared before version 0.10.0 carry this token.
  Regenerate it once to close them; your phone pairs again with the new QR.`

## Mobile page (artboards 3 and 4)

- `getInitialUrl` also reads `share` from the query, the hash, or `__RECODECK_SHARE__`.
- **A share token is never written to `localStorage`.** It goes in `sessionStorage` (`recodeck_share`), so a reload in
  that tab stays in share mode. It is never the saved pairing, so the library modes never use it.
- **Share mode:** the Bearer is the share token. `GET /api/status` gives `share.playlist_id`, `playlist_name` and
  `expires_at`.
  - The page shows only that playlist: the `RECODECK` label with a `Shared playlist` chip, the name, the track count
    and length, `Play`, the track list and the player.
  - There is no library, search, settings or disconnect.
  - Footer: `Shared from RecoDeck · this link works until <Mon D>`.
  - The playlist id comes from the server, never from the URL.
- **401 in share mode**, at connect or later, shows the expired screen: `This link has expired` / `Ask whoever shared
  the playlist for a new link.` It clears `recodeck_share`.
- **Without `share`**, the page behaves exactly as now: pairing QR, saved token, full library.

## Tests

- **Rust:**
  - the `db/share.rs` methods, including expiry purge, the unique key per playlist, cascade on playlist delete and
    `playlist_has_track`;
  - the constant-time comparison;
  - the injection escaping: a name or share value holding `</script>`, quotes and U+2028 cannot leave the string;
  - the middleware's decisions as a pure function, `access_for(token, path, method)`. It answers Full, Share(id),
    Forbidden or Unauthorized, with tests for each route.
- **Vitest:** the modal's date and duration text helpers (pure); the mobile `getInitialUrl` share parsing.
- **By hand, with curl against a running server:**
  - a share token gets its playlist and a ticket for its track;
  - it gets 403 on `/api/tracks` and on another playlist;
  - it gets 401 after Stop.
