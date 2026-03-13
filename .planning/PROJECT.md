# RecoDeck

## What This Is

A desktop music library manager built for DJs, powered by Tauri v2 with a React frontend and Rust backend. RecoDeck organizes music collections with automatic BPM/key detection, genre tagging, and AI-powered playlist generation, track recommendations, and mix preparation tools via the Claude API. It includes a mobile companion PWA for streaming your library on the go.

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
- ✓ Unified AppError enum with typed error handling — v1.0
- ✓ Zero clippy warnings, dead code removed — v1.0
- ✓ Mobile companion server start/stop with QR code connect — v1.0
- ✓ Mobile library browsing, search, and audio streaming — v1.0
- ✓ Bearer token + 10-min multi-use stream tickets for mobile auth — v1.0
- ✓ AI smart playlist generation from seed track with energy direction — v1.0
- ✓ BPM and Camelot key-aware playlist ordering — v1.0
- ✓ AI track recommendations (similar track + playlist-based) — v1.0
- ✓ Mix prep: energy arc visualization and transition issue detection — v1.0
- ✓ AI-optimized playlist reorder for key-compatible mixing — v1.0

### Active

<!-- Current scope. Building toward these. -->

## Current Milestone: v1.4 Equalizer

**Goal:** Add a 10-band graphic equalizer with presets and custom mode, accessible from the NowPlayingBar.

**Target features:**
- EQ icon next to volume control in NowPlayingBar
- Modal with 10-band graphic equalizer (sliders per frequency band)
- Preset EQ profiles (Flat, Bass Boost, Treble Boost, Vocal, etc.)
- Custom EQ mode with per-band adjustment
- Cool, minimal UI using existing app theme system (midnight/carbon)

### Out of Scope

- Full DJ mixing/performance software — RecoDeck is a library manager, not a CDJ replacement
- Cloud sync / multi-device library — local-first architecture
- Music purchasing / streaming service integration — works with files you own
- Public App Store release — targeting small group of DJ friends
- Separate native mobile app — PWA served from desktop is the approach
- Non-Claude AI providers — Claude API is the established AI backend
- AI learning from user curation history — deferred to v2+
- AI suggesting tracks to acquire — deferred to v2+
- Playlist export to M3U/Rekordbox XML — deferred to v2+
- Offline mobile caching — deferred to v2+

## Context

- **Tech stack:** Tauri v2, React 19, Rust backend, SQLite, Zustand state management, TailwindCSS 4
- **Audio pipeline:** HTML5 Audio + custom `stream://` protocol, Symphonia decoder, Aubio BPM detection
- **AI integration:** Claude API via `src-tauri/src/commands/ai.rs` — fully operational with playlist generation, recommendations, and mix optimization
- **Mobile companion:** Shipped — PWA + Axum HTTP server, Bearer token auth, 10-min multi-use stream tickets, QR code connect
- **Server module:** `src-tauri/src/server/` (mod.rs, routes.rs, streaming.rs)
- **Key directories:** Commands in `src-tauri/src/commands/`, frontend API in `src/lib/tauri-api.ts`, audio player in `src/lib/audioPlayer.ts`
- **AI components:** `src/components/ai/` (AIPlaylistDialog, RecommendationsPanel, MixPrepPanel)
- **Shared utils:** `src/lib/musicUtils.ts` (BPM compatibility, Camelot key matching)
- **Codebase:** ~26,500 LOC across Rust + TypeScript + CSS
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
| Claude API for AI | High quality reasoning for playlist intelligence | ✓ Good — powers playlists, recommendations, mix prep |
| PWA for mobile companion | Reuse web stack, no app store needed, served from desktop | ✓ Good — functional mobile experience |
| Axum HTTP server embedded | Stream library to mobile without external server | ✓ Good — clean integration with Tauri |
| 10-min multi-use stream tickets | HTTP Range audio requires multiple requests per seek; 30s single-use was incompatible | ✓ Good — documented deviation from original spec |
| thiserror v2 for AppError | Cleaner derivation than manual Display impls | ✓ Good |
| Tagged serde enum for IPC errors | Enables frontend switch-based error discrimination | ✓ Good |
| OR logic for seed context filtering | AND (bpm_ok && key_ok) too restrictive for small libraries | ✓ Good |
| BPM as energy proxy in mix prep | loudness_lufs never populated; BPM is only available signal | ⚠️ Revisit — add loudness analysis later |
| execute_batch for playlist reorder | Avoids &mut self constraint from rusqlite transaction() | ✓ Good |
| Median BPM for playlist aggregation | More robust to outliers than mean | ✓ Good |

---
*Last updated: 2026-03-13 after v1.4 Equalizer milestone started*
