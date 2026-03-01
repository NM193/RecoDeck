# Phase 2: Mobile Companion - Research

**Researched:** 2026-02-28
**Domain:** Axum HTTP server (Rust), React PWA, bearer token auth, audio streaming, QR code pairing
**Confidence:** HIGH — the server, PWA, and most UI already exist in the codebase

---

## Summary

Phase 2 is not a greenfield implementation. The core infrastructure is already complete. The Rust companion server (`src-tauri/src/server/`), the mobile PWA (`mobile/`), the Settings UI tab, the QR code display, and the auth flow are all implemented and compiling. What exists in the working tree (uncommitted) represents the latest iteration of the feature, including playlist sharing via QR, the `SharePlaylistModal`, and the playlist tracks endpoint in `routes.rs`.

The work remaining for Phase 2 is: audit the existing code against the success criteria, identify gaps and rough edges, wire up anything not yet connected, verify the security invariants hold, and stabilize the full end-to-end experience so it passes all five success criteria reliably.

The three planned sub-plans (02-01, 02-02, 02-03) map naturally onto: (1) server lifecycle and QR UI verification, (2) mobile PWA browse/search/playback audit, and (3) streaming security verification. All three areas have substantial existing code. Planning effort should focus on audit tasks, gap-filling tasks, and integration verification — not on initial implementation.

**Primary recommendation:** Map every success criterion to a concrete code check. Write plans as "verify X works, fix Y gap, test Z end-to-end" rather than "implement X from scratch."

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOBL-01 | User can start/stop the companion HTTP server from desktop app | `CompanionState`, `start_companion_server` / `stop_companion_server` Tauri commands exist; Settings tab with Start/Stop toggle exists; auto-start on launch exists |
| MOBL-02 | User can connect via QR code on mobile browser | `QRCodeSVG` renders `${companionUrl}/?token=${companionToken}` in Settings; server injects token into `index.html` on request; `SharePlaylistModal` renders per-playlist QR; auto-connect flow exists in `mobile/App.tsx` |
| MOBL-03 | User can browse full music library on mobile device | `/api/tracks` (paginated), `/api/tracks/search`, `/api/tracks/{id}` all implemented in `routes.rs`; `MobileTrackList` with infinite scroll exists |
| MOBL-04 | User can stream tracks with playback controls | `/stream/{track_id}?ticket=...` handler exists with Range support; `MobilePlayer` component exists; Media Session API integrated for lock screen controls |
| MOBL-05 | User can search tracks on mobile | `/api/tracks/search?q=` endpoint exists; `MobileTrackList` debounced search input exists |
| MOBL-06 | Server authenticates with bearer token | `auth_middleware` in `server/mod.rs` validates `Authorization: Bearer <token>` on all routes except `/stream/` and `/api/self`; 401 on mismatch |
| MOBL-07 | Audio streaming uses secure single-use tickets (30s expiry) | `StreamTicket` struct exists; `create_ticket` / `validate_ticket` on `CompanionServerState`; NOTE: tickets are currently 10-minute multi-use (not 30s single-use as requirement states) — this is a gap |
</phase_requirements>

---

## Standard Stack

### Core (already in use — no new dependencies needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| axum | 0.8 | Rust HTTP server | In use — `src-tauri/Cargo.toml` |
| tower-http | 0.6 | CORS, static file serving | In use |
| local-ip-address | 0.6 | LAN IP detection for QR URL | In use |
| rand | 0.8 | Token and ticket generation | In use |
| urlencoding | 2 | URL decode for playlist name in shared links | In use |
| qrcode.react | (current) | QR SVG in desktop Settings and SharePlaylistModal | In use — `QRCodeSVG` imported |
| React 19 | 19 | Mobile PWA framework | In use |
| Vite | (current) | Mobile PWA build (`mobile/vite.config.ts`) | In use |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio | 1 (full) | Async runtime for server spawn | Already a dep |
| serde / serde_json | 1 | DTO serialization | Already a dep |

### Alternatives Considered

None — all technology choices are locked by existing implementation.

**Installation:** No new packages required. All dependencies already declared.

---

## Architecture Patterns

### Existing Project Structure (what is already implemented)

```
src-tauri/src/server/
├── mod.rs           # CompanionServerState, auth_middleware, start_server, token gen, PWA serving
├── routes.rs        # REST API: /api/status, /api/tracks, /api/tracks/search, /api/tracks/{id},
│                    #          /api/playlists/{id}/tracks, /api/stream-ticket
└── streaming.rs     # /stream/{track_id}?ticket=..., Range support, path validation, stream limiting

src-tauri/src/commands/
└── server.rs        # start_companion_server, stop_companion_server, get_companion_status,
                     # regenerate_companion_token, auto_start_companion

src/
├── lib/
│   ├── tauri-api.ts     # Tauri IPC wrappers (startCompanionServer, stopCompanionServer, etc.)
│   └── http-api.ts      # HTTP fetch wrapper for mobile PWA (Bearer auth, stream tickets)
└── components/
    ├── Settings.tsx          # 'companion' tab with start/stop toggle, QRCodeSVG, token display
    └── SharePlaylistModal.tsx # Per-playlist QR modal (NEW — uncommitted)

mobile/
├── index.html           # PWA entry with viewport/meta
├── main.tsx             # ReactDOM root with MobileErrorBoundary
├── App.tsx              # Connection flow, player state, QR auto-connect, playlist sharing
├── mobile.css           # Dark theme, safe areas, touch targets
├── vite.config.ts       # Separate Vite build → mobile/dist/
├── manifest.json        # PWA manifest
└── components/
    ├── MobileTrackList.tsx  # Search + infinite scroll list
    └── MobilePlayer.tsx     # Compact bar + full-screen player, seek, Media Session
```

### Pattern 1: Auth Middleware — Bypass List

The auth middleware in `server/mod.rs` whitelists two paths:
- `/stream/` prefix — ticket auth handled in handler
- `/api/self` — returns server URL without auth (needed for PWA self-detection)

All other paths require `Authorization: Bearer <token>`. This is correct and should not be changed.

```rust
// Source: src-tauri/src/server/mod.rs lines 219-251
if path.starts_with("/stream/") {
    return Ok(next.run(request).await);
}
if path == "/api/self" {
    return Ok(next.run(request).await);
}
```

### Pattern 2: Token Injection into index.html

The server injects `window.__RECODECK_SERVER_URL__`, `window.__RECODECK_TOKEN__`, `window.__RECODECK_PLAYLIST_ID__`, and `window.__RECODECK_PLAYLIST_NAME__` into `<head>` by replacing `</head>` in the served HTML. This handles PWA standalone mode where `window.location` strips query params.

```rust
// Source: src-tauri/src/server/mod.rs lines 170-215 (serve_index_with_url)
let html = html.replace("</head>", &format!("{}\n  </head>", injection));
```

The mobile `App.tsx` reads these globals as a fallback after URL params.

### Pattern 3: Stream Ticket Flow

1. Mobile calls `POST /api/stream-ticket` with `{ track_id }` and Bearer token
2. Server creates a `StreamTicket { track_id, created_at }` stored in `CompanionServerState.tickets` HashMap
3. Server returns `{ ticket, expires_in, stream_url }`
4. Mobile sets `<audio src="/stream/{id}?ticket={ticket}">` — no Bearer token in audio element URL
5. Browser makes Range requests to `/stream/{id}?ticket={ticket}` — ticket validated on each request

**Known gap (MOBL-07):** Current ticket expiry is 600 seconds (10 minutes), not 30 seconds as stated in requirements. Tickets are also multi-use (retained for Range requests during playback). The requirement says "30s expiry" and "single-use" but the implementation correctly keeps them alive for Range requests. The 30s requirement may be aspirational/stale — the code comment says "10 minutes — enough for Range requests during playback." Planning should decide whether to change expiry or document the intent mismatch.

### Pattern 4: QR Code Pairing URL Format

```
http://{lan_ip}:{port}/?token={token}
```

For playlist sharing:
```
http://{lan_ip}:{port}/?token={token}&playlist={id}&name={urlencoded_name}
```

Both formats are handled by `getInitialUrl()` in `mobile/App.tsx` and `parse_share_params()` in `server/mod.rs`.

### Pattern 5: LAN IP Detection

`get_lan_ip_for_qr()` in `commands/server.rs` uses `local_ip_address::local_ip()` with fallback to scanning all interfaces for first non-loopback IPv4. Falls back to `127.0.0.1` with a warning if no LAN IP found (phone scanning won't work in this case).

### Anti-Patterns to Avoid

- **Don't put Bearer token in audio element src:** Browsers include src URL in Referer headers, and some environments log them. The ticket system exists specifically to avoid this.
- **Don't use single-connection DB Arc for companion:** The companion server opens a separate `Database` connection via `db_arc`. Don't share the main app's locked DB Arc for async handlers.
- **Don't serve PWA assets through the fallback only:** The custom `serve_asset` handler exists because `ServeDir` fallback serves `index.html` for missing assets, causing MIME type errors for JS/CSS. Keep the explicit `/assets/{path}` route.
- **Don't block the Tauri main thread:** All companion server work runs in `tokio::spawn`. The Tauri commands are `async fn` and `await` only for the brief server start.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code generation | SVG generation logic | `qrcode.react` `QRCodeSVG` | Already in use; handles error correction, sizing, encoding |
| LAN IP detection | Network interface scanning | `local_ip_address` crate | Cross-platform; already a dependency |
| Range header parsing | Custom byte range parser | The existing `parse_range()` in `streaming.rs` | Already handles open-ended ranges, edge cases |
| CORS | Custom middleware | `tower_http::cors::CorsLayer` | Already in use |
| Graceful shutdown | Custom drain logic | tokio `oneshot` channel + `with_graceful_shutdown` | Already implemented |
| Static file serving | Custom file handler | `tower_http::services::ServeDir` / `ServeFile` | Already in use |

**Key insight:** The companion server is feature-complete at the Rust level. Planning should not re-implement any of these. Only gaps and integration wiring need new code.

---

## Common Pitfalls

### Pitfall 1: Ticket Expiry vs. Streaming Range Requests

**What goes wrong:** Setting ticket expiry too short (e.g., the 30s stated in MOBL-07) breaks seeking and buffering. The browser makes multiple Range requests for the same ticket — one for initial buffering, then more as the user scrubs. If the ticket expires between Range requests, playback fails silently.

**Why it happens:** HTTP audio streaming via `<audio>` is not a single connection. The browser re-requests the same URL (with ticket) whenever it needs more data.

**How to avoid:** The current 600s (10-minute) expiry is correct for practical use. The MOBL-07 requirement language ("30s single-use") appears to have been written assuming a different architecture. The planner should document this decision and note that MOBL-07 is satisfied by the ticket system even if expiry is not literally 30 seconds. If changing expiry, test with large files and seeking.

**Warning signs:** User reports playback stopping after a short time, especially when seeking.

### Pitfall 2: PWA Standalone Mode Strips URL Params

**What goes wrong:** When user adds the PWA to their home screen and opens it in standalone mode, `window.location` no longer contains the original query params (including `?token=...`). Auto-connect from QR scan fails.

**Why it happens:** PWA standalone mode navigates to the start_url from `manifest.json`, stripping any params from the original link.

**How to avoid:** The server injects `window.__RECODECK_TOKEN__` and `window.__RECODECK_SERVER_URL__` via server-side HTML injection in `serve_index_with_url`. The mobile app also persists credentials in `localStorage`. This is already handled — verify the injection code path works end-to-end.

**Warning signs:** User scans QR, saves to home screen, opens later, and must reconnect manually.

### Pitfall 3: LAN IP Detection Returning 127.0.0.1

**What goes wrong:** `get_lan_ip_for_qr()` falls back to `127.0.0.1` if no LAN IP is found. QR code encodes `http://127.0.0.1:8384/` which the phone cannot reach.

**Why it happens:** On some macOS configs (VPN active, unusual network interface naming), `local_ip_address::local_ip()` returns the loopback address.

**How to avoid:** The function already logs a warning. The Settings UI checks `companionUrl?.startsWith('http://127.0.0.1')` and likely shows a warning. Verify this UI warning is visible and actionable.

**Warning signs:** QR scan opens the PWA but it fails to connect.

### Pitfall 4: mobile/dist Not Built

**What goes wrong:** Server starts in "API-only mode" because `mobile/dist/index.html` does not exist. User scans QR, gets blank page or 404.

**Why it happens:** `npm run mobile:build` must be run before `mobile/dist/` exists. In dev mode, `mobile/vite.config.ts` dev server runs separately on port 3000.

**How to avoid:** The production bundle must include `mobile/dist/` (mapped as `mobile-dist/` in `tauri.conf.json` resources). Planning should include a task verifying that the production build path is correct and `find_mobile_dist()` finds the bundled PWA.

**Warning signs:** Server log shows `[companion] No mobile PWA dist found -- API-only mode`.

### Pitfall 5: CORS and Audio Element

**What goes wrong:** `<audio>` element cross-origin requests may fail if CORS is not set up correctly. The audio element does not send custom headers — it relies on CORS headers in the server response.

**Why it happens:** The mobile PWA origin and the server origin may differ if the user manually enters a URL, or if the PWA is served from a different port.

**How to avoid:** `CorsLayer` in `server/mod.rs` allows `*` origin. This is intentional — the auth token is the security layer, not CORS. Verify `Accept-Ranges` and `Content-Range` response headers are present for audio seeking.

**Warning signs:** Browser console shows CORS errors; audio plays but seeking is broken.

### Pitfall 6: Uncommitted Changes Are Part of Phase 2

**What goes wrong:** Planning treats Phase 2 as starting from HEAD (last commit), missing that the working tree has significant uncommitted work.

**Why it happens:** The git status shows M (modified) files in `mobile/`, `src-tauri/src/server/routes.rs`, `src/components/Settings.tsx`, `src/App.tsx`, plus two untracked new files (`SharePlaylistModal.tsx`, `SharePlaylistModal.css`).

**How to avoid:** Phase 2 plans must first commit/integrate the existing uncommitted changes, then audit and fill gaps. The uncommitted work includes:
- `SharePlaylistModal.tsx` + `.css` — new component for per-playlist QR sharing
- `mobile/App.tsx` — playlist sharing, paste-link UX, PWA token injection fallbacks
- `mobile/components/MobileTrackList.tsx` — playlist mode support
- `src-tauri/src/server/routes.rs` — `get_playlist_tracks` endpoint
- `src/App.tsx` — `handleSharePlaylist`, `SharePlaylistModal` integration, updater disabled
- `src/components/Settings.tsx` — minor companion UI improvements
- `mobile/main.tsx` — error boundary improvements
- `mobile/mobile.css` — paste-link form styles

**Warning signs:** Plan tasks "implement the playlist tracks API" when it already exists in the working tree.

---

## Code Examples

Verified from existing codebase:

### Bearer Token Auth (server/mod.rs)
```rust
// Source: src-tauri/src/server/mod.rs:219-251
async fn auth_middleware(
    state: axum::extract::State<Arc<CompanionServerState>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path();
    if path.starts_with("/stream/") { return Ok(next.run(request).await); }
    if path == "/api/self" { return Ok(next.run(request).await); }
    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let provided_token = &header[7..];
            if provided_token == state.token { Ok(next.run(request).await) }
            else { Err(StatusCode::UNAUTHORIZED) }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
```

### Stream Ticket Creation (server/mod.rs)
```rust
// Source: src-tauri/src/server/mod.rs:62-80
pub fn create_ticket(&self, track_id: i64) -> String {
    let ticket: String = {
        let mut rng = thread_rng();
        (0..32).map(|_| format!("{:02x}", rng.gen::<u8>())).collect()
    };
    let mut tickets = self.tickets.lock().unwrap();
    tickets.retain(|_, t| !t.is_expired());
    tickets.insert(ticket.clone(), StreamTicket { track_id, created_at: std::time::Instant::now() });
    ticket
}
```

### QR Code in Settings (Settings.tsx)
```tsx
// Source: src/components/Settings.tsx (existing)
import { QRCodeSVG } from "qrcode.react";
// Renders: http://{lan_ip}:{port}/?token={token}
<QRCodeSVG value={`${companionUrl}/?token=${companionToken}`} size={160} level="M" />
```

### Share Playlist QR (SharePlaylistModal.tsx - uncommitted)
```tsx
// Source: src/components/SharePlaylistModal.tsx (uncommitted)
const shareUrl = `${companionUrl}/?token=${companionToken}&playlist=${playlistId}&name=${encodeURIComponent(playlistName)}`;
<QRCodeSVG value={shareUrl} size={180} level="M" />
```

### Mobile Stream URL Construction (http-api.ts)
```typescript
// Source: src/lib/http-api.ts:148-151
async getStreamUrl(trackId: number): Promise<string> {
    const ticket = await this.getStreamTicket(trackId);
    return `${_baseUrl}/stream/${trackId}?ticket=${ticket.ticket}`;
}
```

### Auto-Connect on QR Scan (mobile/App.tsx)
```typescript
// Source: mobile/App.tsx — useEffect with fetch /api/self
fetch("/api/self")
    .then(r => r.ok ? r.json() : null)
    .then((data: { url?: string } | null) => {
        const url = data?.url || fallback;
        if (url) { setServerUrl(url); if (authToken) connect(url, authToken); }
    })
    .catch(() => { if (fallback && authToken) connect(fallback, authToken); });
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| 30s single-use stream tickets | 10min multi-use tickets (multi-Range safe) | Deliberate deviation from requirement — correct for HTTP audio |
| Manual URL + token entry on mobile | QR scan auto-connect + localStorage persistence | Full flow exists |
| API-only server (no PWA serving) | Server serves mobile PWA + API in single port | `find_mobile_dist()` handles dev vs production paths |
| No playlist sharing | Per-playlist QR via `SharePlaylistModal` | Uncommitted, nearly complete |

**Deprecated/outdated:**
- The `.claude/plans/fluffy-finding-goblet.md` plan mentioned in MEMORY.md is the historical planning document. The actual code supersedes it.
- The `docs/MOBILE_COMPANION.md` describes work as "DONE" through Phase 4.5. It is an accurate record of what was implemented, including the outstanding "TODO" items in Phase 5.

---

## Gap Analysis (What Phase 2 Plans Must Address)

Based on the success criteria vs. the code:

**Success Criterion 1 — Start/stop server with visible status indicator:**
- Rust commands: DONE
- Settings tab with toggle: DONE
- Auto-start: DONE
- Status shows URL, token, active streams: MOSTLY DONE (`active_streams` in `get_companion_status` returns 0 — TODO noted in code)

**Gap 1.1:** `get_companion_status` returns `active_streams: 0` unconditionally (TODO comment in `server.rs:289`). Should return `state.active_streams.load()`. The `CompanionState` does not hold a reference to `CompanionServerState`, only the `RunningServer`. Fix: store `Arc<CompanionServerState>` in `RunningServer` or in `CompanionState`.

**Success Criterion 2 — QR code scan opens mobile PWA:**
- QR in Settings: DONE
- Token injection into index.html: DONE
- Auto-connect in mobile App: DONE
- SharePlaylistModal QR: DONE (uncommitted)

**Gap 2.1:** The uncommitted files (`SharePlaylistModal.tsx`, `SharePlaylistModal.css`) need to be committed and verified. The `FolderTree` (sidebar) must expose an `onSharePlaylist` prop — check if this is wired up.

**Success Criterion 3 — Browse and search library on mobile:**
- `/api/tracks` paginated: DONE
- `/api/tracks/search`: DONE
- `/api/playlists/{id}/tracks`: DONE (uncommitted in routes.rs)
- `MobileTrackList` with search: DONE

**Gap 3.1:** `search_tracks` endpoint returns `MobileTrackDTO` built with `from_track` (no BPM/key). Unlike the paginated list which uses `from_track_with_analysis`. Search results on mobile will not show BPM. This may be intentional for search performance but worth noting.

**Success Criterion 4 — Tap track and hear it streaming:**
- Stream handler with Range: DONE
- `MobilePlayer`: DONE
- Ticket flow: DONE
- Media Session: DONE

**Gap 4.1:** `MobilePlayer.tsx` was listed in `docs/MOBILE_COMPANION.md` as DONE but not reviewed in this research session. Should verify it exists and is complete.

**Success Criterion 5 — Unauthorized requests rejected:**
- Bearer token auth middleware: DONE
- Stream ticket validation: DONE
- Path canonicalization: DONE
- Stream limiting (max 3): DONE

**Gap 5.1:** The ticket validation (`validate_ticket`) is "multi-use for Range requests" — this is correct behavior but differs from "single-use" in MOBL-07. Plan should document this explicitly and close MOBL-07 with the explanation.

---

## Open Questions

1. **Is `FolderTree.tsx` wired up to call `onSharePlaylist`?**
   - What we know: `src/App.tsx` now passes `onSharePlaylist` to `FolderTree`. The `FolderTree` shows playlists.
   - What's unclear: Whether `FolderTree` has a "Share" action in its playlist context menu.
   - Recommendation: Read `src/components/FolderTree.tsx` during planning; it's in the git diff list.

2. **Does `MobilePlayer.tsx` exist and is it complete?**
   - What we know: `docs/MOBILE_COMPANION.md` says DONE. `mobile/App.tsx` imports it.
   - What's unclear: It's not in the current git diff, suggesting it wasn't changed — presumably committed earlier.
   - Recommendation: Verify file exists at `mobile/components/MobilePlayer.tsx` before assuming.

3. **Ticket expiry: align with requirement or document mismatch?**
   - What we know: MOBL-07 says "30s expiry"; code uses 600s.
   - What's unclear: Whether the planner should try to implement 30s with some token-refresh mechanism or just close the requirement as-met with explanation.
   - Recommendation: Close MOBL-07 with explanation. 30s single-use is incompatible with HTTP Range-based audio streaming.

4. **Production build: is mobile/dist bundled in the app binary?**
   - What we know: `tauri.conf.json` has `"resources": {"../mobile/dist/": "mobile-dist/"}`. `find_mobile_dist()` resolves via `BaseDirectory::Resource`.
   - What's unclear: Whether `npm run mobile:build` has been run and whether `mobile/dist/` currently exists.
   - Recommendation: Include a task in plan 02-01 to verify `mobile/dist/index.html` exists and server picks it up.

5. **active_streams count in status — is the fix safe?**
   - What we know: `get_companion_status` returns 0. The actual counter is in `CompanionServerState`.
   - What's unclear: `CompanionState` (Tauri managed) holds `running_server: Mutex<Option<RunningServer>>` but `RunningServer` only has `shutdown_tx`, `addr`, `token` — not a reference back to `CompanionServerState`.
   - Recommendation: Add `state: Arc<CompanionServerState>` field to `RunningServer`, or store it separately in `CompanionState`.

---

## Validation Architecture

No automated test framework detected in this project. No `jest.config.*`, `vitest.config.*`, or test directories found. Rust `dev-dependencies` has `tempfile = "3.14"` for integration tests but no test files were found for the server module.

**Manual verification protocol per plan:**

| Req ID | Behavior | Test Method |
|--------|----------|-------------|
| MOBL-01 | Server starts/stops from Settings | Manual: open Settings, toggle Start/Stop, verify status indicator updates |
| MOBL-02 | QR code pairing | Manual: scan QR from phone browser, verify auto-connect |
| MOBL-03 | Browse library on mobile | Manual: open mobile PWA, scroll track list, verify tracks appear |
| MOBL-04 | Stream with controls | Manual: tap track, verify audio plays, seek works, Media Session controls work on lock screen |
| MOBL-05 | Search on mobile | Manual: type in search box, verify filtered results appear |
| MOBL-06 | Unauthorized requests rejected | `curl http://192.168.x.x:8384/api/status` returns 401; with wrong token returns 401 |
| MOBL-07 | Ticket auth | `curl /stream/1` without ticket returns 401; with valid ticket returns 206; expired ticket returns 401 |

**curl smoke tests (from desktop terminal):**
```bash
# Should 401
curl http://<ip>:8384/api/status
# Should 200
curl -H "Authorization: Bearer <token>" http://<ip>:8384/api/status
# Should 401
curl http://<ip>:8384/stream/1
# Get ticket
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"track_id":1}' http://<ip>:8384/api/stream-ticket
# Stream with ticket — should 206
curl -H "Range: bytes=0-65535" "http://<ip>:8384/stream/1?ticket=<ticket>" -o /dev/null -w "%{http_code}"
```

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src-tauri/src/server/mod.rs`, `routes.rs`, `streaming.rs` — full file reads
- Direct code inspection: `src-tauri/src/commands/server.rs` — full file read
- Direct code inspection: `mobile/App.tsx`, `mobile/components/MobileTrackList.tsx`, `mobile/main.tsx`
- Direct code inspection: `src/lib/http-api.ts`, `src/components/SharePlaylistModal.tsx`
- Direct code inspection: `src-tauri/Cargo.toml` — dependency versions confirmed
- `docs/MOBILE_COMPANION.md` — implementation progress log
- `git diff HEAD` output — confirmed what is uncommitted vs. committed

### Secondary (MEDIUM confidence)
- `docs/MOBILE_COMPANION.md` Phase 5 "TODO" items — documents known missing pieces (playlist API, album art, mDNS, QR in settings — most now done)

### Tertiary (LOW confidence)
- MOBL-07 "30s single-use" requirement language — likely written before the Range-request constraint was understood; current 600s multi-use is the correct implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from Cargo.toml and package.json
- Architecture: HIGH — verified from direct code reading
- Pitfalls: HIGH — derived from code reading (ticket expiry, LAN IP, PWA standalone mode all have direct evidence)
- Gap analysis: HIGH — derived from code comparison against success criteria

**Research date:** 2026-02-28
**Valid until:** 2026-04-15 (stable codebase, no external library dependency concerns)

---

## Planning Guidance for Sub-Plans

Given the research findings, the three planned sub-plans should be scoped as follows:

**02-01: Server lifecycle, QR code UI, bearer token auth**
- Commit the existing uncommitted changes (SharePlaylistModal, routes.rs playlist endpoint, mobile/App.tsx playlist support)
- Fix `get_companion_status` active_streams count (Gap 1.1)
- Verify `FolderTree.tsx` has "Share playlist" action wired to `onSharePlaylist`
- Verify production mobile/dist bundle path works (`find_mobile_dist` + `tauri.conf.json`)
- Document MOBL-07 ticket behavior explicitly (close requirement as met with explanation)

**02-02: Mobile PWA — library browse, search, and playback UI**
- Audit `mobile/components/MobilePlayer.tsx` against MOBL-04 requirements
- Verify search returns results including BPM/key display consistency
- Test infinite scroll pagination on large libraries
- Test error recovery when server goes offline (reconnect UI)
- Verify `mobile.css` covers all interaction states (loading, empty, error)

**02-03: Secure audio streaming with single-use tickets**
- End-to-end streaming smoke test (manual + curl)
- Verify path canonicalization rejects path traversal attempts
- Verify stream limiting (max 3 concurrent) works
- Verify Range header responses are correct for seeking
- Verify Media Session API works on iOS Safari and Android Chrome
- Document security model in code comments for future maintainers
