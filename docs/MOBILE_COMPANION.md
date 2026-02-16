# RecoDeck Mobile Companion App - Progress

## Overview
A PWA that streams music from the desktop RecoDeck app to a mobile phone over WiFi. The phone acts as a thin remote player with no local music files.

## Architecture
- **Desktop side**: Axum HTTP server embedded in the Tauri app, exposing REST API + audio streaming
- **Mobile side**: PWA served separately, reusing types/stores from the main app
- **Security**: Bearer token auth, short-lived stream tickets, no file paths exposed, Range header support

## Progress

### Phase 1: Secure HTTP Server on Desktop (Rust) - DONE

| Task | Status | Notes |
|------|--------|-------|
| Add Cargo.toml dependencies (axum, tower-http, local-ip-address, rand) | DONE | `src-tauri/Cargo.toml` |
| `src-tauri/src/server/mod.rs` - CompanionServer, auth middleware, lifecycle | DONE | Token gen, CORS, port fallback, graceful shutdown |
| `src-tauri/src/server/routes.rs` - MobileTrackDTO, REST API, stream tickets | DONE | Sanitized responses (no file_path), ticket system |
| `src-tauri/src/server/streaming.rs` - Secure audio streaming + Range | DONE | 200/206/416, ticket validation, path validation, stream limits |
| `src-tauri/src/commands/server.rs` - Tauri commands for server lifecycle | DONE | start/stop/status/regenerate commands |
| `src-tauri/src/commands/mod.rs` - Register server module | DONE | |
| `src-tauri/src/lib.rs` - Register commands, add CompanionState | DONE | Added db_path to AppState |
| `src-tauri/src/commands/library.rs` - Add db_path to AppState | DONE | For companion's separate DB connection |
| Rust compilation | DONE | Compiles with only pre-existing warnings |

### Phase 2: Settings UI for Companion Server - DONE

| Task | Status | Notes |
|------|--------|-------|
| `src/lib/tauri-api.ts` - Add companion server commands | DONE | start/stop/status/regenerate |
| `src/components/Settings.tsx` - Mobile Companion tab | DONE | Start/stop toggle, URL display, token display, port config |

### Phase 3: API Abstraction Layer (TypeScript) - DONE

| Task | Status | Notes |
|------|--------|-------|
| `src/lib/http-api.ts` - HTTP implementation of API | DONE | fetch-based, Bearer token, stream tickets |
| `src/lib/api.ts` - Environment-aware API selector | DONE | isTauri / isMobile detection |
| TypeScript compilation | DONE | Clean build |

### Phase 4: Mobile PWA - DONE

| Task | Status | Notes |
|------|--------|-------|
| `mobile/index.html` - Entry point | DONE | PWA meta tags, viewport |
| `mobile/main.tsx` - App entry | DONE | |
| `mobile/App.tsx` - Connect screen + app shell | DONE | URL/token input, QR param parsing, auto-reconnect |
| `mobile/components/MobileTrackList.tsx` - Track list | DONE | Search, infinite scroll, tap to play |
| `mobile/components/MobilePlayer.tsx` - Player | DONE | Compact bar + full-screen, seek, Media Session API |
| `mobile/mobile.css` - Styles | DONE | Dark theme, safe areas, touch-friendly |
| `mobile/vite.config.ts` - Build config | DONE | Separate Vite build |
| `mobile/manifest.json` - PWA manifest | DONE | |
| `package.json` - npm scripts | DONE | mobile:dev, mobile:build |

### Phase 4.5: Auto-Start & Persistent Pairing - DONE

| Task | Status | Notes |
|------|--------|-------|
| Persist auth token in SQLite settings | DONE | `companion_token` key, reused across restarts |
| Persist port in SQLite settings | DONE | `companion_port` key |
| Auto-start server on app launch | DONE | Reads `companion_autostart` setting in `init_database`, spawns async task |
| Auto-start toggle in Settings UI | DONE | Checkbox in Mobile Companion section |
| Reuse persisted token (no re-pairing) | DONE | `start_companion_internal` checks DB before generating new token |
| Regenerate token clears persisted token | DONE | Forces fresh token generation on next start |
| TypeScript + Rust compilation | DONE | Both compile clean |

### Phase 5: Extended Endpoints (future)

| Task | Status | Notes |
|------|--------|-------|
| Playlists API | TODO | |
| Folders API (ID-based) | TODO | |
| Genres API | TODO | |
| Album art endpoint | TODO | |
| mDNS auto-discovery | TODO | |
| Server-side transcoding | TODO | |
| QR code in Settings UI | TODO | Need `qrcode` npm package |

## Security Checklist
- [x] No absolute file paths exposed in any API response (MobileTrackDTO)
- [x] Streaming only via track IDs (resolved server-side)
- [x] Mandatory Bearer token authentication on all endpoints
- [x] Stream tickets are short-lived (30s) and single-use
- [x] Token regeneration available from UI
- [x] Proper Range support (200/206/416)
- [x] No sensitive data in logs (stream logs redact ticket, show only track ID)
- [x] Canonicalized path validation against library roots
- [x] Graceful shutdown with connection drain (5s timeout)
- [x] Concurrent stream limiting (max 3, configurable)

## How to Test

1. **Start the desktop app** (`npm run tauri dev`)
2. **Open Settings > Mobile Companion > Start Server**
3. **Note the URL and token** displayed
4. **Test API with curl**:
   ```bash
   # Should return 401
   curl http://<ip>:8384/api/status

   # Should return JSON
   curl -H "Authorization: Bearer <token>" http://<ip>:8384/api/status

   # Get tracks (no file_path in response)
   curl -H "Authorization: Bearer <token>" http://<ip>:8384/api/tracks?limit=5

   # Get stream ticket
   curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"track_id": 1}' \
     http://<ip>:8384/api/stream-ticket

   # Stream audio (use ticket from above)
   curl -H "Range: bytes=0-1023" \
     "http://<ip>:8384/stream/1?ticket=<ticket>" -o /dev/null -w "%{http_code}"
   # Should return 206
   ```
5. **Test mobile PWA** (`npm run mobile:dev` then open on phone)

## Files Added/Modified

### New Files
- `src-tauri/src/server/mod.rs` - Axum server core
- `src-tauri/src/server/routes.rs` - REST API routes
- `src-tauri/src/server/streaming.rs` - Audio streaming
- `src-tauri/src/commands/server.rs` - Tauri commands
- `src/lib/http-api.ts` - HTTP API client
- `src/lib/api.ts` - API selector
- `mobile/index.html` - PWA entry
- `mobile/main.tsx` - React entry
- `mobile/App.tsx` - Mobile app
- `mobile/components/MobileTrackList.tsx` - Track list
- `mobile/components/MobilePlayer.tsx` - Player
- `mobile/mobile.css` - Styles
- `mobile/vite.config.ts` - Build config
- `mobile/manifest.json` - PWA manifest

### Modified Files
- `src-tauri/Cargo.toml` - Added dependencies
- `src-tauri/src/lib.rs` - Registered server module + commands
- `src-tauri/src/commands/mod.rs` - Added server module
- `src-tauri/src/commands/library.rs` - Added db_path to AppState
- `src/lib/tauri-api.ts` - Added companion server commands
- `src/components/Settings.tsx` - Added Mobile Companion tab
- `package.json` - Added mobile:dev/build scripts
