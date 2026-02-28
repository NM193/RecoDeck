# RecoDeck

## What This Is

A desktop music library manager built for DJs, powered by Tauri v2 with a React frontend and Rust backend. RecoDeck organizes music collections with automatic BPM/key detection, genre tagging, and AI-powered playlist generation via the Claude API. It includes an in-progress mobile companion app for streaming your library on the go.

## Core Value

Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression — not just metadata sorting.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Music library scanning and folder watching — existing
- ✓ Track metadata display (title, artist, album, duration) — existing
- ✓ Audio playback with custom stream:// protocol — existing
- ✓ BPM detection via Aubio — existing
- ✓ Key detection — existing
- ✓ Genre tagging from file metadata — existing
- ✓ Manual genre assignment — existing
- ✓ Playlist creation and management — existing
- ✓ SQLite database for library persistence — existing
- ✓ Settings management — existing
- ✓ Folder tree navigation — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] AI-powered smart playlist generation (energy flow, key matching, mood awareness)
- [ ] AI track discovery and recommendations within library
- [ ] AI mix preparation (transition points, key compatibility, energy arcs)
- [ ] Mobile companion app (PWA streaming via Axum HTTP server)
- [ ] Codebase cleanup and architecture improvements
- [ ] Bug fixes and stability improvements

### Out of Scope

- Full DJ mixing/performance software — RecoDeck is a library manager, not a CDJ replacement
- Cloud sync / multi-device library — local-first for now
- Music purchasing / streaming service integration — works with files you own
- Public App Store release — targeting small group of DJ friends for now

## Context

- **Tech stack:** Tauri v2, React 19, Rust backend, SQLite, Zustand state management, TailwindCSS 4
- **Audio pipeline:** HTML5 Audio + custom `stream://` protocol, Symphonia decoder, Aubio BPM detection
- **AI integration:** Claude API via `src-tauri/src/commands/ai.rs` — currently broken/incomplete
- **Mobile companion:** In progress — PWA + Axum HTTP server architecture, Bearer token auth, stream tickets (30s single-use)
- **Server module:** `src-tauri/src/server/` (mod.rs, routes.rs, streaming.rs)
- **Key directories:** Commands in `src-tauri/src/commands/`, frontend API in `src/lib/tauri-api.ts`, audio player in `src/lib/audioPlayer.ts`
- **Audience:** Small group of DJ friends, personal use expanding to small community

## Constraints

- **Tech stack:** Tauri v2 + React + Rust — established, not changing
- **Local-first:** All data stays on the user's machine, no cloud dependency
- **AI provider:** Claude API — already integrated, keep as primary AI backend
- **Audio analysis:** Aubio for BPM — established dependency
- **Mobile approach:** PWA served from desktop app — no separate native mobile app

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri v2 over Electron | Better performance, smaller bundle, native Rust backend | ✓ Good |
| SQLite over external DB | Local-first, no server dependency, simple deployment | ✓ Good |
| Claude API for AI | High quality reasoning for playlist intelligence | — Pending |
| PWA for mobile companion | Reuse web stack, no app store needed, served from desktop | — Pending |
| Axum HTTP server embedded | Stream library to mobile without external server | — Pending |
| Stream tickets for auth | 30s single-use tokens for secure mobile streaming | — Pending |

---
*Last updated: 2026-02-28 after initialization*
