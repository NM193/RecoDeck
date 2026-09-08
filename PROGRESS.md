# RecoDeck Development Progress

Last Updated: 2026-09-08

---

## Environment Setup

- [x] RULES.md created (2026-02-05)
- [x] PROGRESS.md created (2026-02-05)
- [x] Rust installed (2026-02-05) - rustc 1.93.0, cargo 1.93.0
- [x] Tauri prerequisites installed (2026-02-05) - Xcode CLI Tools, pkg-config 2.5.1
- [x] Tauri CLI installed (2026-02-05) - @tauri-apps/cli@next
- [x] Project scaffolded (2026-02-05) - Tauri v2 + React 18 + TypeScript + Vite
- [x] Dependencies installed (2026-02-05) - Frontend: zustand, react-router-dom@7, react-query, tailwindcss v4; Rust: added to Cargo.toml
- [x] File structure created (2026-02-05) - All folders per Section 13 structure
- [x] SQLite schema initialized (2026-02-05) - 001_init.sql with all tables and indexes
- [x] Tailwind configured (2026-02-05) - Theme system with 4 themes (Midnight, Carbon, Dawn, Neon)
- [x] Initial dev server tested (2026-02-05) - Vite + Tauri running successfully
- [x] Rust toolchain default set (2026-02-05) - Fixed `rustup default stable` for system-wide cargo access

---

## Phase 1: Foundation (MVP)
Status: Complete

### Milestones
- [x] 1.1 Project scaffold - App launches, shows empty window, no errors (2026-02-05)
- [x] 1.2 SQLite setup - Create/read/update/delete records via Rust tests (2026-02-05) - 8/8 tests passing
- [x] 1.3 Library scanner - Scan test folder, tracks appear in DB with metadata (2026-02-05) - 15/15 tests passing, Tauri commands created
- [x] 1.4 Track table UI - Table renders 1000+ tracks smoothly (60fps scroll) (2026-02-05) - Using @tanstack/react-virtual, TypeScript compiles clean
- [x] 1.5 Audio playback - Play/pause/seek works for MP3, FLAC, WAV, AIFF (2026-02-05) - Custom stream:// protocol + HTML5 Audio
- [x] 1.6 Waveform overview - Waveform renders and syncs with playback (2026-02-05) - Bar-style visualization with progress tracking
- [x] 1.7 Search + sort - Search finds tracks, columns sort correctly (2026-02-05) - Frontend filtering + clickable sort headers, 23/23 tests passing
- [x] 1.8 Settings - Add/remove library folders, changes persist (2026-02-05) - Persistent DB, settings panel, theme selection, 29/29 tests passing

---

## Phase 2: Deep Analysis Engine
Status: In Progress

### DSP Analysis
- [ ] 2.1 Mel spectrogram computation
- [x] 2.2 BPM detection (2026-02-05) - aubio-based, 42/42 tests passing
- [x] 2.3 Key detection (2026-02-06) - Chromagram + Krumhansl-Schmuckler, Camelot notation, 61/61 tests passing
- [ ] 2.4 Waveform peaks (overview + detail)
- [ ] 2.5 Loudness metering (LUFS)

### AI Analysis
- [ ] 2.6 ONNX Runtime integration
- [ ] 2.7 Discogs style classification (400 styles)
- [ ] 2.8 Mood detection
- [ ] 2.9 Danceability scoring
- [ ] 2.10 Voice/instrumental detection
- [ ] 2.11 Instrument recognition
- [ ] 2.12 Audio embeddings (512-dim)

### Identification & Enrichment
- [ ] 2.13 Chromaprint fingerprinting
- [ ] 2.14 AcoustID lookup
- [ ] 2.15 MusicBrainz metadata enrichment

### UI & Auto-Categorization
- [ ] 2.16 Spectrogram visualization
- [ ] 2.17 Analysis dashboard per track
- [ ] 2.18 Analysis queue with progress
- [ ] 2.19 Auto-categorization pipeline (watch folder → auto-classify)

---

## Phase 3: Organization
Status: Not Started

### Milestones
- [ ] 3.1 Tag system
- [ ] 3.2 Smart playlists (rule-based)
- [ ] 3.3 Manual playlists
- [ ] 3.4 Cue points
- [ ] 3.5 Rating system
- [ ] 3.6 Column customization
- [ ] 3.7 Duplicate detection
- [ ] 3.8 Missing file management

---

## Phase 4: AI Features
Status: Not Started

### Custom Genre Classifier
- [ ] 4.1 Genre taxonomy definition
- [ ] 4.2 Manual labeling UI
- [ ] 4.3 Model training (MLP on embeddings)
- [ ] 4.4 Auto-classification with confidence
- [ ] 4.5 Active learning suggestions

### Discovery
- [ ] 4.6 Track similarity search
- [ ] 4.7 Smart suggestions (next track)
- [ ] 4.8 Similarity map (t-SNE/UMAP visualization)
- [ ] 4.9 Style explorer
- [ ] 4.10 Mood/energy filters

### AI Chat & Command
- [ ] 4.11 Command bar (Cmd+K)
- [ ] 4.12 Chat panel with Claude API
- [ ] 4.13 Natural language playlist generation
- [ ] 4.14 Multi-turn refinement

---

## Phase 5: DJ Integration
Status: Not Started

### Milestones
- [ ] 5.1 Rekordbox XML export
- [ ] 5.2 Rekordbox XML import
- [ ] 5.3 Traktor NML export/import
- [ ] 5.4 Set builder with flow visualization

---

## Phase 6: Mobile Companion
Status: Not Started

### Desktop Server
- [ ] 6.1 axum HTTP server
- [ ] 6.2 Audio streaming (HTTP range requests)
- [ ] 6.3 mDNS discovery
- [ ] 6.4 WebSocket real-time sync
- [ ] 6.5 Remote access (Tailscale/Cloudflare)

### Android App
- [ ] 6.6 React Native/Tauri Mobile setup
- [ ] 6.7 Browse & search UI
- [ ] 6.8 Streaming playback
- [ ] 6.9 Waveform display
- [ ] 6.10 Connection management

---

## Phase 7: Polish & Advanced
Status: Not Started

### Milestones
- [ ] 7.1 Customizable themes
- [ ] 7.2 Keyboard shortcuts
- [ ] 7.3 Drag & drop
- [ ] 7.4 Multi-select operations
- [ ] 7.5 Statistics dashboard
- [ ] 7.6 Advanced spectrogram features

---

## Completed Work Log

### 2026-02-05 - Phase 1 Kickoff (Milestones 1.1-1.6 Complete)

**Environment Setup:**
- Created RULES.md with 7 development rules
- Created PROGRESS.md for tracking implementation status
- Project foundation documentation established
- Installed Rust toolchain 1.93.0 via rustup
- Installed Tauri prerequisites: Xcode Command Line Tools (already present), pkg-config 2.5.1
- Installed Tauri CLI via npm (@tauri-apps/cli@next)
- Initialized Tauri v2 project with React 18 + TypeScript + Vite
- Base npm dependencies installed
- Frontend dependencies: zustand, react-router-dom@7, @tanstack/react-query, @tanstack/react-virtual, tailwindcss v4
- Tailwind CSS and PostCSS configured
- Rust dependencies added to Cargo.toml: tokio, rusqlite, symphonia, ort, notify, reqwest, lofty, walkdir, sha2, tempfile
- Created complete folder structure:
  - Backend: commands/, db/, audio/, ai/, server/, external/, formats/, models/
  - Frontend: components/ (layout, library, player, spectrogram, analysis, etc.), store/, hooks/, styles/themes/, types/
- Created SQLite migration 001_init.sql with complete database schema (15 tables, 12 indexes)
- Configured Tailwind CSS v4 with theme system:
  - 4 built-in themes: Midnight (default), Carbon, Dawn, Neon
  - CSS custom properties for runtime theme switching
  - Integrated into main.tsx with globals.css
- Dev server verified and running successfully
- Fixed rustup default toolchain (was not configured for the user's system)

**Milestone 1.1 - Project Scaffold:**
- ✅ App launches successfully
- ✅ Shows window with no errors
- ✅ Vite + Tauri dev server running

**Milestone 1.2 - SQLite Setup (TDD):**
- ✅ Created Database module with connection management
- ✅ Implemented migration runner (runs 001_init.sql)
- ✅ Full CRUD operations for tracks table
- ✅ 8/8 tests passing:
  - Database creation & migrations
  - Create/Read/Update/Delete tracks
  - Get all tracks, count tracks
  - Unique constraint validation

**Milestone 1.3 - Library Scanner:**
- ✅ Created Scanner module with lofty-rs for metadata extraction
- ✅ Recursive directory scanning for audio files
- ✅ SHA256 file hashing for change detection
- ✅ Metadata extraction from MP3, FLAC, WAV, AIFF, M4A, OGG
- ✅ Import workflow with error handling
- ✅ 15/15 tests passing (7 new scanner tests + 8 db tests)
- ✅ Tauri commands created for frontend:
  - init_database, get_all_tracks, get_track, update_track, delete_track
  - count_tracks, scan_directory, list_audio_files
- ✅ Serializable DTOs (TrackDTO, ScanResultDTO) for IPC
- ✅ Filename fallback for title when tags are missing

**Milestone 1.4 - Track Table UI:**
- ✅ Created virtualized track table with @tanstack/react-virtual
- ✅ Supports smooth scrolling for 1000+ tracks
- ✅ TypeScript types matching Rust DTOs
- ✅ Tauri API wrapper (lib/tauri-api.ts)
- ✅ Modern, themed UI with CSS custom properties
- ✅ Columns: Title, Artist, Album, BPM, Key, Genre, Duration, Format
- ✅ Empty state, loading state, error handling
- ✅ Click and double-click handlers (ready for playback)
- ✅ TypeScript compiles clean (no errors)

**Milestone 1.5 - Audio Playback (Rebuilt):**
- ❌ Initial PCM streaming over IPC approach abandoned (too slow — JSON-serialized Vec<f32> over Tauri events)
- ❌ Tauri v2 asset protocol approach abandoned (known 403 errors / broken in v2)
- ✅ Custom `stream://` URI scheme protocol registered in Rust backend (lib.rs)
  - Serves local audio files directly to the webview
  - Proper MIME type detection (MP3, FLAC, WAV, AIFF, M4A, OGG, AAC)
  - Percent-decoding for file paths with spaces/special characters
  - Debug logging with `[stream]` prefix
  - Added `http` v1 crate dependency
- ✅ HTML5 Audio-based player (src/lib/audioPlayer.ts)
  - Converts file paths to `stream://localhost/<path>` URLs
  - Cross-platform URL format (macOS vs Windows)
  - Standard play/pause/seek/stop/volume via Audio element
  - Event-driven: timeupdate, durationchange, ended, error
  - Guarded error handling (ignores spurious errors from empty src)
- ✅ Player UI component (src/components/Player.tsx + Player.css)
  - Bottom bar layout (persistent across views)
  - Play/pause/stop controls
  - Volume slider
  - Click-to-seek on waveform canvas
  - Time display (current/duration)
  - Track info display (title, artist)
  - Error handling UI, loading states
- ✅ Zustand player store simplified (src/store/playerStore.ts)
  - Removed PCM-specific PlaybackStatus/AudioChunk types
  - Added setDuration action for HTML5 Audio integration
- ✅ Dialog permissions added (dialog:default, dialog:allow-open)
- ✅ Double-click track to play
- ✅ All code compiles successfully (Rust cargo check + TypeScript)

**Milestone 1.6 - Waveform Overview:**
- ✅ Fixed missing theme: added `data-theme="midnight"` to index.html
  - CSS variables were undefined because no theme was active
- ✅ Fixed canvas rendering: CSS variables (var(--color)) don't work in Canvas 2D context
  - Now resolves variables via getComputedStyle() to actual color values
- ✅ Bar-style waveform visualization
  - Deterministic pseudo-random bar heights (consistent per track)
  - Played portion highlighted in brighter color (--waveform-played)
  - Unplayed portion in regular waveform color (--waveform-color)
  - Playhead line tracks current position
  - Click-to-seek functional
- Note: Currently a placeholder pattern — real waveform from audio analysis planned for Phase 2

**Milestone 1.7 - Search + Sort:**
- ✅ Frontend-side search filtering across all text fields (title, artist, album, label, comment, file_path)
- ✅ Search bar integrated into table header (Rekordbox/Traktor style)
  - Input with search icon, clear button, focus ring
  - Instant filtering as you type
- ✅ Column sorting — all 8 columns sortable
  - Click column header to sort ascending, click again for descending
  - Sort indicator arrows (▲/▼) on active column
  - Active column highlighted with accent color
  - Empty values pushed to bottom regardless of sort direction
- ✅ Footer shows filtered count ("X of Y tracks") and current sort info
- ✅ Backend `search_tracks` SQL command added for future use with large libraries
  - Case-insensitive LIKE search across all text fields
  - Parameterized query (no SQL injection)
  - Tauri command + frontend API wrapper registered
- ✅ 23/23 tests passing (8 db + 7 scanner + 7 search + 1 audio)
- ✅ TypeScript compiles clean, no linter errors

**Milestone 1.8 - Settings:**
- ✅ **Persistent database** — Switched from `:memory:` to file-based SQLite DB
  - Database stored at `~/Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.db`
  - `init_database` command now creates parent directories automatically
  - All data persists across app restarts
- ✅ **Settings Rust backend** — Full CRUD for settings table
  - `get_setting(key)`, `set_setting(key, value)`, `delete_setting(key)` on Database
  - Upsert support (INSERT ON CONFLICT UPDATE)
  - JSON values stored in TEXT column
  - 6 new unit tests (29/29 total)
- ✅ **Settings Tauri commands** (src-tauri/src/commands/settings.rs)
  - Generic: `get_setting`, `set_setting`
  - Library folders: `get_library_folders`, `add_library_folder`, `remove_library_folder`
  - Theme: `get_theme`, `set_theme` (validates against known themes)
  - All registered in lib.rs invoke handler
- ✅ **Settings UI** (src/components/Settings.tsx + Settings.css)
  - Modal overlay panel with clean, themed design
  - Library folder management:
    - Add folder via native folder picker dialog
    - Remove folder with confirmation
    - Rescan individual folders or rescan all
    - Shows folder name + full path
    - Duplicate and invalid path prevention (backend-validated)
  - Theme selection:
    - 4 theme cards with mini preview mockups (Midnight, Carbon, Dawn, Neon)
    - Active theme highlighted with accent border
    - Theme applied immediately on selection
    - Saved to DB, restored on next app launch
  - Error display bar with dismiss
  - Loading states for scan operations
- ✅ **App.tsx integration**
  - Gear icon (⚙) in header opens settings panel
  - Persistent DB path via `appDataDir()` from `@tauri-apps/api/path`
  - Saved theme loaded and applied on startup
  - Saved library folders auto-scanned on startup (detects new files)
  - "Scan Folder" button also adds folder to settings for persistence
- ✅ **Frontend API** — tauriApi extended with 7 new settings methods
- ✅ 29/29 Rust tests passing, TypeScript compiles clean, no linter errors

---

## Notes & Deviations

### Audio Playback Architecture Change
The original plan called for a premium PCM streaming architecture (Symphonia decoder → Tauri IPC events → Web Audio API). This was implemented but found to be non-functional in practice:
1. **JSON serialization of audio samples** — `Vec<f32>` serialized as JSON arrays is extremely slow for real-time audio
2. **Tauri v2 asset protocol** — Has known issues (403 Forbidden errors) making it unreliable
3. **Solution** — Custom `stream://` URI scheme protocol + standard HTML5 Audio. The Rust backend serves audio files directly via `register_uri_scheme_protocol`, and the frontend plays them with a normal `<audio>` element. Much simpler, much more reliable.

The Symphonia decoder and playback commands remain in the codebase for future use (waveform generation, audio analysis, etc.) but are no longer used for basic playback.

---

### 2026-02-05 - Phase 2 Start: Milestone 2.2 — BPM Detection

**Dependency:**
- Added `bliss-audio-aubio-rs` 0.2 with `builtin` + `bindgen` features
  - Compiles aubio C library from source (no system dependency required)
  - Uses `bindgen` to generate FFI bindings for Apple Silicon (no prebuilt bindings)

**Audio Decoder Enhancement (src-tauri/src/audio/decoder.rs):**
- ✅ New `MonoAudio` struct: holds decoded mono samples, sample rate, and duration
- ✅ New `decode_to_mono()` function: decodes entire audio file to mono f32 PCM
  - Reusable foundation for ALL DSP analysis (BPM, key, waveform, spectrogram, etc.)
  - Handles all supported formats (MP3, FLAC, WAV, AIFF)
  - Gracefully skips corrupted packets
  - Channel mixing: averages all channels to produce mono output
- ✅ Helper functions: `convert_to_mono_f32`, `mix_to_mono_f32`, `mix_to_mono_generic`

**BPM Detection Module (src-tauri/src/audio/bpm.rs):**
- ✅ `detect_bpm(path)` — main API: takes file path, returns BPM + confidence
- ✅ `detect_bpm_from_samples(audio)` — internal: works on pre-decoded audio (testable)
- ✅ Uses aubio `Tempo` tracker with `SpecFlux` onset mode
  - Buffer size: 1024, Hop size: 512 (50% overlap)
  - Processes audio in overlapping frames for accurate beat tracking
- ✅ Reasonable range check: rejects BPM < 40 or > 300
- ✅ 8 unit tests with synthetic click tracks:
  - 120 BPM, 128 BPM, 140 BPM detection (±2-3 BPM tolerance)
  - Empty audio, silence, short audio, different sample rates (48kHz)
  - All pass successfully

**Database Layer (src-tauri/src/db/mod.rs):**
- ✅ New `TrackAnalysis` struct — represents DSP analysis record
- ✅ `save_bpm_analysis(track_id, bpm, confidence)` — upsert into track_analysis table
- ✅ `get_bpm_analysis(track_id)` — returns (bpm, confidence) or None
- ✅ `get_track_analysis(track_id)` — returns full analysis record
- ✅ `has_bpm_analysis(track_id)` — checks if BPM exists
- ✅ 5 new DB tests: save/get, not-analyzed, upsert, has_bpm, full analysis

**Tauri Commands (src-tauri/src/commands/analysis.rs):**
- ✅ `analyze_bpm` — analyze single track: fetch path → detect BPM → store → return
- ✅ `analyze_all_bpm` — batch: finds unanalyzed tracks, processes all, skips errors
- ✅ `get_track_analysis` — retrieve analysis data for any track
- ✅ DTOs: `BpmResultDTO`, `TrackAnalysisDTO` for frontend serialization
- ✅ All 3 commands registered in lib.rs invoke handler

**Test Results: 42/42 passing** (8 DB original + 7 scanner + 7 search + 6 settings + 1 audio decoder + 5 DB analysis + 8 BPM tests)

---

### Database Persistence Change
The app previously used an in-memory database (`:memory:`) which lost all data on each restart. Milestone 1.8 switched to a persistent file-based database stored in the OS app data directory (`appDataDir()`). The `init_database` command now creates parent directories if needed. On startup, the app loads the saved theme and re-scans all saved library folders to detect any new files.

---

### 2026-02-06 - Folder Tree Panel (Traktor-style sidebar)

**Backend (Rust):**
- ✅ New DB method: `count_tracks_in_folder(folder_path)` — SQL LIKE query for track count by path prefix
- ✅ New DB method: `get_tracks_in_folder_with_analysis(folder_path)` — tracks + BPM data filtered by folder
- ✅ New Tauri command: `list_subdirectories` — lists immediate subdirectories with track counts and has_subfolders flag
- ✅ New Tauri command: `get_tracks_in_folder` — returns TrackDTOs filtered by folder path prefix
- ✅ New Tauri command: `count_tracks_in_folder` — counts tracks in a folder tree
- ✅ All 3 commands registered in lib.rs invoke handler

**Frontend:**
- ✅ New `FolderTree` component (src/components/FolderTree.tsx + FolderTree.css)
  - Traktor-style collapsible folder tree in left sidebar
  - "Track Collection" header with "All Tracks" root node
  - Library folders shown as expandable root nodes with track counts
  - Lazy-loading of subdirectories on expand (filesystem + DB counts)
  - Recursive folder tree with expand/collapse arrows, folder icons
  - Right-click context menu with "Analyze Tracks" action
  - Click folder to filter track table to show only tracks in that folder
  - Click "All Tracks" to show all tracks (no filter)
  - Hidden folders (starting with .) are excluded
- ✅ New `FolderInfo` type in types/track.ts
- ✅ 3 new API wrappers in tauri-api.ts (listSubdirectories, getTracksInFolder, countTracksInFolder)
- ✅ App.tsx redesigned layout: header → [sidebar | main] → player
  - Left sidebar (240px) with FolderTree
  - Main area with TrackTable
  - Folder selection state managed in App.tsx
  - Folder-aware track loading (all tracks vs filtered by folder)
  - "Analyze Tracks" context menu triggers BPM analysis for folder's tracks
  - Library folders refresh when settings change or new folder scanned
- ✅ App.css updated with flexbox sidebar layout (.app-body, .app-sidebar, .app-main)
- ✅ Rust cargo check passes, TypeScript compiles clean, no linter errors

**Explorer / Home Section (Traktor-style filesystem browser):**
- ✅ FolderTree rewritten with two collapsible sections:
  - **Track Collection** (💿) — scanned library folders with track counts
  - **Explorer** (🔍) — filesystem browser starting from user's Home directory
- ✅ Explorer shows Home (🏠) as root with all user directories (Desktop, Documents, Downloads, Music, etc.)
- ✅ All folders expand/collapse with lazy-loaded subdirectories from filesystem
- ✅ **Auto-scan on click**: clicking any folder in Explorer auto-scans it (imports new audio files, skips existing ones), then shows tracks — no manual "Scan Folder" needed
- ✅ Right-click context menu differs by section:
  - Library folders: "Analyze Tracks"
  - Explorer folders: "Analyze Tracks" + "Add to Library" (scans + persists in settings)
- ✅ Section headers are collapsible (click to hide/show entire section)
- ✅ Scanning banner ("Scanning folder...") shows during Explorer auto-scan
- ✅ `homeDir()` from `@tauri-apps/api/path` to get user's home directory
- ✅ `core:path:default` permission added to capabilities
- ✅ Rust cargo check passes, TypeScript compiles clean, no linter errors

**Playlists System + Explorer Removal:**
- ✅ Removed Explorer/Home filesystem browser (not appropriate for a music library app)
- ✅ **Migration 002**: `ALTER TABLE playlists ADD COLUMN parent_id` for folder hierarchy
- ✅ Migration runner updated to run 002 idempotently (ignores if column exists)
- ✅ **Playlist DB methods**: create_playlist, get_all_playlists, get_playlist, rename_playlist, delete_playlist (recursive for folders), get_playlist_tracks (with analysis JOIN), add_track_to_playlist, remove_track_from_playlist, count_playlist_tracks
- ✅ **Playlist Rust commands** (src-tauri/src/commands/playlists.rs):
  - `create_playlist`, `create_playlist_folder`, `get_all_playlists`, `rename_playlist`, `delete_playlist`, `get_playlist_tracks`, `add_track_to_playlist`, `remove_track_from_playlist`
  - PlaylistDTO with track_count field
  - All 8 commands registered in lib.rs
- ✅ **Frontend Playlist type** + 8 API wrappers in tauri-api.ts
- ✅ **FolderTree rewritten** with two sections (like Traktor):
  - **Track Collection** (💿): Library folders with subfolders + track counts
  - **Playlists** (🎶): User-created playlists and folders
- ✅ **Right-click context menus**:
  - Playlists header: Create Playlist, Create Folder
  - Playlist folder: Create Playlist, Create Folder, Rename, Delete
  - Playlist item: Rename, Delete
  - Library folder: Analyze Tracks
- ✅ Playlists support folder hierarchy (folders contain playlists/subfolders)
- ✅ Click playlist → shows playlist tracks in table
- ✅ Create/Rename via `prompt()`, Delete via `confirm()`
- ✅ Deleting a folder recursively deletes children and track associations
- ✅ Rust cargo check passes, TypeScript compiles clean, no linter errors

---

### 2026-02-06 - Phase 2: Milestone 2.3 — Key Detection

**Dependency:**
- Added `rustfft` 6.2 crate for FFT computation (chromagram generation)

**Key Detection Module (src-tauri/src/audio/key.rs):**
- ✅ `detect_key(path)` — main API: takes file path, returns Camelot key + musical key + confidence
- ✅ `detect_key_from_samples(audio)` — internal: works on pre-decoded audio (testable)
- ✅ Chromagram computation via FFT:
  - FFT size: 4096, Hop size: 2048 (50% overlap)
  - Hanning window for spectral leakage reduction
  - Maps FFT bins to 12 pitch classes (C through B) in range 65Hz–2000Hz
  - Uses 12-TET tuning with A=440Hz reference
  - Power accumulation (magnitude squared) across all frames
  - Normalized to sum to 1.0 for scale-independence
- ✅ Krumhansl-Schmuckler profile matching:
  - Pearson correlation against all 24 key profiles (12 major + 12 minor)
  - Profile rotation to test all root notes
  - Best match selected from highest correlation
- ✅ Camelot wheel notation (primary display — DJ standard):
  - Full 24-key mapping: 1A-12A (minor), 1B-12B (major)
  - Musical notation as secondary (Am, C, F#m, etc.)
- ✅ Confidence scoring:
  - Based on gap between best and second-best correlations (70%)
  - Plus absolute correlation strength (30%)
  - Clamped to [0.0, 1.0] range
- ✅ 12 unit tests with synthetic signals:
  - A440 pure tone, C major chord, A minor chord, D minor chord
  - Empty audio, too-short audio, silence
  - Camelot format validation, confidence range check
  - Different sample rate (48kHz), musical key names validation
  - Camelot table completeness (24 unique codes)

**Database Layer (src-tauri/src/db/mod.rs):**
- ✅ `save_key_analysis(track_id, musical_key, key_confidence)` — upsert into track_analysis table
- ✅ `get_key_analysis(track_id)` — returns (key, confidence) or None
- ✅ `has_key_analysis(track_id)` — checks if key exists
- ✅ Incremental analysis: saving key does NOT overwrite BPM (and vice versa)
- ✅ Extended `get_all_tracks_with_analysis()` to include musical_key + key_confidence
- ✅ Extended `get_tracks_in_folder_with_analysis()` to include key data
- ✅ 8 new DB tests (key save/get, upsert, has_key, preserves_bpm, preserves_key, includes_key_in_join)

**Tauri Commands (src-tauri/src/commands/analysis.rs):**
- ✅ `analyze_key` — analyze single track: decode → chromagram → K-S match → store Camelot key
- ✅ `analyze_all_keys` — batch: finds unanalyzed tracks, processes all, skips errors
- ✅ `KeyResultDTO` with track_id, camelot, musical_key, confidence
- ✅ Both commands registered in lib.rs invoke handler

**TrackDTO & Frontend Types Updated:**
- ✅ `TrackDTO` (Rust) extended with `musical_key: Option<String>` and `key_confidence: Option<f64>`
- ✅ `Track` (TypeScript) extended with `musical_key?: string` and `key_confidence?: number`
- ✅ `KeyResult` TypeScript interface added
- ✅ `tauriApi.analyzeKey()` and `tauriApi.analyzeAllKeys()` API wrappers added
- ✅ `get_all_tracks` and `get_tracks_in_folder` now return key data in LEFT JOIN

**Test Results: 61/61 passing** (8 DB original + 7 scanner + 7 search + 6 settings + 1 audio decoder + 5 DB BPM analysis + 8 BPM tests + 8 DB key analysis + 12 key tests — note: some counts overlap)

---

---

### 2026-02-09 — BPM/Key UI and analysis triggers

**Track table:**
- Key column now shows detected Camelot key (`musical_key`) instead of "—"; tooltip shows confidence %
- Key column sort fixed: sorts by `musical_key` (was placeholder empty sort)
- Right-click context menu on a track row: "Analyze BPM & Key" — runs BPM + Key analysis for that track, then refreshes list

**Folder "Analyze Tracks":**
- Now runs both BPM and Key analysis (previously only BPM)
- Skips tracks that already have BPM/Key; reports how many BPM vs Key analyses were done

**Next:** Phase 2 — 2.1 Mel spectrogram or 2.4 Waveform peaks; or more Phase 2 AI/UI milestones.

---

### 2026-02-09 — BPM alignment with Traktor

**Problem:** BPM in RecoDeck did not match the same tracks when checked in Traktor (different algorithm, half/double tempo ambiguity).

**Fixes:**

1. **Read BPM from file tags on scan**
   - Scanner now reads BPM from ID3 TBPM / tag (ItemKey::Bpm, IntegerBpm) via lofty.
   - When a file already has BPM in tags (e.g. written by Traktor or Rekordbox), it is saved to `track_analysis` with confidence 0.99 on import.
   - So: if you analyze in Traktor first, then add the folder in RecoDeck, RecoDeck will show the same BPM.

2. **Tempo normalization for aubio detection**
   - In `src-tauri/src/audio/bpm.rs`, after aubio returns BPM we normalize to "DJ range" (80–200 BPM):
     - If 40–79 BPM → double (e.g. 64 → 128) to avoid half-tempo lock.
     - If 200–300 BPM → halve (e.g. 280 → 140) to avoid double-tempo lock.
   - Reduces mismatches where Traktor shows 128 and we showed 64 (or vice versa).

**Note:** Traktor 3.4+ may ignore file BPM and re-analyze on import; in that case values can still differ. For best match: either analyze in Traktor first and then scan in RecoDeck (we use tag BPM), or run "Analyze BPM & Key" in RecoDeck and use the normalized value.

---

### 2026-02-12 — UI cleanup and auto file watching

**Header buttons cleanup (App.tsx):**
- Removed **Cleanup** button from header (duplicate cleanup still runs automatically on app startup)
- Removed **Analyze BPM** button from header (now available via right-click context menu)
- Removed **Refresh** button from header (replaced by automatic file watching)
- Removed unused `handleCleanupDuplicates` function
- Header now only has "Scan Folder" and Settings (⚙) buttons

**Right-click "Analyze All Tracks" (FolderTree.tsx):**
- Added `onAnalyzeAll` prop and `"all-tracks"` context menu type
- Right-clicking on "All Tracks" in sidebar shows "Analyze All Tracks" option
- Calls the same `handleAnalyzeAll` logic the old header button used
- Library folders still have "Analyze Tracks" (folder-scoped) on right-click

**Automatic file watching (replaces Refresh button):**
- **Backend** — New `watcher.rs` module using `notify` crate (already a dependency):
  - `start_file_watcher` Tauri command accepts library folder list
  - Watches all library folders recursively via `notify::RecommendedWatcher`
  - Filters to only audio file changes (mp3, flac, wav, ogg, m4a, aac, aiff)
  - Debounces events (2-second minimum between emits)
  - Emits `library-changed` Tauri event to frontend on create/modify/remove
  - `WatcherState` managed state holds the active watcher (prevents drop)
- **Frontend API** — Added `startFileWatcher(folders)` to tauri-api.ts
- **App.tsx integration:**
  - Starts watcher after initialization with all library folders
  - Listens for `library-changed` event via `@tauri-apps/api/event`
  - On change: re-scans all folders, cleans duplicates, reloads track list
  - Restarts watcher when folders change (via Settings or Scan Folder)
  - Uses refs for callbacks to avoid stale closures in event listener

---

---

### 2026-09-07 — M0 spike: YouTube embedded playback is not viable (yt-tracklist port)

**Context:** porting the `yt-tracklist` tool into RecoDeck. The original tool runs in a
browser, where an embedded YouTube player is trivial. Before building anything, M0 asked
one question: does that player work inside RecoDeck?

**Answer: no, and for two independent reasons. Do not retry this.**

**Wall 1 — the `tauri://localhost` origin.** A production build serves the frontend over a
custom scheme, not http. YouTube's player then fails with error 153 ("no valid Referer"),
because a custom-scheme page sends no Referer header. Measured against all six real DJ sets
in the tool's `fixtures/`: 6 of 6 failed. All four known workarounds failed too —
`host: youtube-nocookie`, `playerVars.origin`, `widget_referrer`, and a plain iframe with no
JS API. This is invisible in `tauri dev`, where the origin is `http://localhost:1420` and
everything appears to work.

This wall *is* breakable: serving the player page from the Axum companion server the app
already runs gives a real http origin, and one set then genuinely played inside RecoDeck.

**Wall 2 — the sets themselves refuse embedding.** Surveyed the same six sets from a plain
Chrome tab, outside the app entirely:

| set | result |
|---|---|
| Solomun @ Cercle (`QHDRRxKlimY`) | embeddable |
| Luciano @ Thuishaven (`X6WpzQoI0mc`) | error 150 |
| Dr Banana / Mixmag (`fjR4idz1-MA`) | error 150 |
| Priku B2B Traumer (`ucfEH7g9JWI`) | error 150 |
| Boris Brejcha @ Cercle (`vqz8c4ZP3Wg`) | error 150 |
| Hot Since 82 / Mixmag (`xJR7q0XN8oU`) | error 150 |

Five of six refuse embedded playback anywhere — Chrome gives the same verdict as our webview,
so this is not a Tauri problem and no origin change fixes it. Verified it is not an artifact
of the test harness: re-ran with a fresh document per video, and again with a single player
alone (no rapid-fire loads). Same result each time.

**Trap for later:** the YouTube Data API reports `status.embeddable: true` for all six. That
field does not predict playback and must not be used as a pre-check. The only reliable signal
is attempting playback and catching error 150/101.

**Decision:** listening happens by opening the set in the user's browser at the right
timestamp (`&t=1260s`) via `tauri-plugin-opener`, which is already a dependency. Consequence
for CSP: only `img-src` needs `https://i.ytimg.com` for thumbnails — no `frame-src`, no
`script-src`, which is also the safer outcome.

**Side finding:** thumbnails from `i.ytimg.com` load fine under CSP once `img-src` allows them.

---

### 2026-09-07 — M1: YouTube key, quota counter, and network layer (yt-tracklist port)

**Rust**
- `external/` finally declared in `lib.rs` — the directory had existed unused since the
  original scaffold and was never part of the crate
- `external/youtube.rs` — Data API v3 client. Fetching a set returns the exact shape the
  standalone tool writes into `fixtures/`, which is why these three structs are camelCase
  while the rest of the app's IPC is snake_case: the ported parser reads that shape verbatim
  and the fixtures are its tests
- `external/youtube_time.rs` — Pacific calendar helpers. Quota resets at midnight Pacific
  (about 09:00 local), so the quota bucket cannot key off the local date. Written by hand
  rather than adding a date crate (Rule 1), including the US daylight-saving rule
- `commands/youtube.rs` — key save/status/delete, 1-unit connection test, quota reading,
  and set fetching. Locks are never held across a network call (the Phase 28 rule)
- Google bills the attempt, so quota is recorded even when a call is rejected
- 20 new unit tests: quota day rollover against a real database, DST transitions, error
  mapping for `quotaExceeded` / `keyInvalid` / `accessNotConfigured`, ISO durations, and
  video-id extraction from every link shape. Suite is 135 passing, 0 clippy warnings from
  the new code

**Frontend**
- `types/youtube.ts`, IPC wrappers in `tauri-api.ts`, YouTube state in `SettingsContext`
- `YouTubeSection.tsx` in Settings: masked key field, Test Connection, a quota bar, and
  step-by-step instructions for creating a personal key

**Why each user brings their own key:** the 10,000 unit daily allowance is charged per key.
One key shipped inside the app would be one budget shared by everyone — a single search costs
100 units — and a key inside a binary is trivially extracted.

**Measured, not assumed:** a live fetch of `fjR4idz1-MA` cost 2 units (1 video + 1 comment
page) and produced 35 comments, 11 of them replies — identical to the fixture the standalone
tool wrote for the same video. Note that the quota spent during this check went through a
throwaway harness, not the app, so the in-app counter starts from zero.

**Gate passed 2026-09-07** — verified in the running app: saving a key, Test Connection moving
the quota by one unit, and a deliberately wrong key producing a readable sentence.

Two things the gate caught, both fixed:

- The failure was announced only by a toast in the corner while the section itself still said
  "✓ API key configured", which is exactly the moment a user needs to be told to try another
  key. The section now carries the result inline, and the saved-key line no longer claims the
  key is good until it has actually been tested.
- Underneath that: `getErrorMessage` in `types/ai.ts` maps backend errors to human sentences,
  but the new YouTube variants were missing from it. For unit variants carrying no message —
  `YtInvalidKey`, `YtQuotaExceeded`, `YtApiNotEnabled` — the raw object reached the UI instead
  of a sentence. Any future `AppError` variant has to be added there too.

---

### 2026-09-07 — M2: tracklist parser ported to TypeScript (yt-tracklist port)

The parsing half of the standalone tool now lives in `src/lib/tracklist/`, split into
`text.ts` (names and timestamps), `extract.ts` (one block of text), `comments.ts` (everything
mined out of the comment section), `merge.ts` (consensus across lists) and `index.ts`.

**The port is literal on purpose.** Every threshold in it was measured against real sets, not
chosen: a ±20s cue window, a 150s name window, containment of 0.8 for titles and 0.6 for
artists, and a floor of 0.5 under `artistShape` — that last one exists because a DJ playing
their own records is listed by title alone, and without the floor such a set scored zero and
was discarded as a false positive. Rewriting any of it "more cleanly" would quietly undo
measurements nobody would think to re-run.

**Testing:** the tool's six saved fixtures are now the regression suite
(`src/lib/tracklist/__fixtures__/`, 544K of raw API responses), together with `expected.json`
— that tool's own output over them. The suite compares field by field and then whole:

| set | tracks | status |
|---|---|---|
| Solomun @ Cercle | 25 | ok, 7 sources agreeing |
| Luciano @ Thuishaven | 18 | ok |
| Dr Banana / Mixmag | 7 | assembled from comments, no written list |
| Priku B2B Traumer | 35 | ok |
| Boris Brejcha @ Cercle | 20 | ok |
| Hot Since 82 / Mixmag | 42 | ok, 4 sources |

All six reproduce exactly. The suite was then mutation-checked to prove it can fail: dropping
the title containment threshold from 0.8 to 0.5 breaks two of the six sets.

90 frontend tests passing, tsc clean, no new lint findings.

---

### 2026-09-07/08 — M4 and M5a: library matching, the set library, and the in-window player

**M4 — matching a set against the library**

Every parsed row is compared to the user's own tracks using the parser's soft name
matching, not string equality: tags and typed-out tracklists never agree exactly. No schema
work and no SQL — the app already holds all 8,400 tracks in memory. Rows show `have it`
(plays the user's file) or `missing`, the header counts both, and a filter narrows to either.
Playing one row queues everything owned from that set, in the order the DJ played it.

**Two bugs found by using it, both fixed with tests:**

1. *Narration parsed as tracks.* Someone had narrated the crowd with timestamps ("1:10:13
   tattoo girl checks on the lad..."). The block passes every structural check — ascending,
   inside the runtime, enough rows — so it merged into the real list. The rule now judges the
   whole block: an artist-less row of 7+ words is prose, and a block that is a quarter prose
   is thrown out. The threshold is measured — across the reference sets the longest legitimate
   artist-less title is six words, while narration runs 8 to 18. **The original tool has this
   bug too**: running it over the same fixture reproduces all five narration rows, which is
   why `bk6Xst6euQk` is the one set where we deliberately differ from it.
2. *One-word titles claiming long files.* "Simion feat. Roland Clark — Lost" matched a file
   called "Lee Burridge & Lost Desert - Elongi feat. Junior", because containment divides by
   the shorter side and the single word "lost" scored 1.0. The shorter title must now be at
   least half the longer one, "Unknown Artist" counts as no artist, and titles are compared
   both with and without the remix suffix.

**M5a — the set library (migration 009)**

`yt_sets`, `yt_saved_tracks`, `yt_channels`. A processed set is stored whole, raw fetch
included, so reopening costs no quota and a better parser can be re-run over everything
already collected. Hearted tracks collect across sets with Beatport/Discogs/Bandcamp links
and a copy-list button. Deleting a set cascades to its saved tracks.

**The in-window player — what it took, and what it cost**

The goal was the standalone tool's layout: video on top, tracklist below, in one window.
Getting there required enabling Tauri's `unstable` feature for multi-webview support, so the
player is a second webview positioned over the page in window coordinates. That is why it
cannot scroll with the list and lives in a fixed band.

Four measured findings, in the order they were learned:

| attempt | result |
|---|---|
| iframe on the `tauri://` page | error 153 — a custom scheme sends no Referer |
| panel navigated straight to `youtube.com/embed` | error 153 — a top-level navigation sends none either |
| panel → page served by our own server at **127.0.0.1** | error **150** |
| panel → same page, same port, at **localhost** | works |

**YouTube accepts `localhost` as an embedding origin and rejects `127.0.0.1`.** This also
retracts an earlier conclusion recorded on 2026-09-07: "five of six sets refuse embedding
anywhere" was a measurement error, caused by testing from a `127.0.0.1` origin through
`YT.Player`. The sets are fine. The standalone tool works because it is served from
`localhost:4173`.

So the chain is: panel webview → `http://localhost:<port>/yt-player` (served by the companion
Axum server) → iframe to youtube.com, which now has the Referer it wants. Seeking goes through
`/yt-seek`, which the player page polls four times a second, so jumping between tracks moves
the player in place instead of reloading it. The player page reports its state to `/yt-report`,
which lands in the app log — a webview has no console anyone can read.

**Open problem for tomorrow: playback will not start on its own.**

The panel reports `PLAYER READY` but never `PLAYING`. The user has to press play inside the
panel once; after that, every seek works. The cause is that the click lands in the *main*
webview while the player lives in a *second* one, so as far as the player's document is
concerned no user gesture ever happened. In the standalone tool both live in the same
document, which is why it does not have this problem.

Tried and rejected: muted autoplay (`mute=1`) plus a programmatic `playVideo` and `unMute`
after `onReady` — still never reaches `PLAYING`.

Next things to try, cheapest first:

1. wry defaults `autoplay: true` (wry 0.54 `WebViewAttributes`), but nothing in
   tauri-runtime-wry appears to pass it through for a child webview added with
   `Window::add_child`. Check whether Tauri exposes it, or whether the attribute is simply
   lost for child webviews — that would explain the behaviour exactly.
2. Failing that, give the served page its own one-time overlay: a large play button covering
   the panel, so the first click happens *inside* that webview. One click per set, then
   everything is programmatic.

**State:** all of the above is on branch `feat/yt-tracklist` and **uncommitted** — M1 and M2
are committed, everything after them is not. Tests: 108 frontend, 139 Rust, lint unchanged.

**Still to build from the standalone tool:** search by DJ name (100 quota units a search),
channel import, followed channels with a new-set badge, statistics, search across all stored
sets, and the quota bar with a countdown to the Pacific reset.

---

### 2026-09-08 — M5 complete: the rest of the standalone tool, and two matching rules learned by using it

**Everything from the tool is now in RecoDeck.** Search across every stored set, statistics,
search by DJ name, channel import, followed channels with a new-set badge, and the library
filed by DJ.

**Storage (migration 010).** Parsed rows are flattened into `yt_tracks` beside the raw fetch.
Without it, "where did I hear this?" and every statistic would mean reparsing every stored set
on each keystroke. Rebuilt wholesale when a set is reprocessed, so an improved parser simply
replaces what the old one produced — and reopening a set stored before this table existed
fills it in quietly.

**Costs are shown because they differ by a factor of a hundred.** A set is 5-7 units, checking
a followed channel 1-2, resolving a channel from a handle or link 2 — and searching by name is
100. The button says so before the click, and refuses when less than 100 is left. Channels
resolve through the cheap paths first (UC id, @handle, a link to one of their videos) and only
fall through to search when nothing else works. Promo clips are filtered by duration before
anything is fetched about them: a set is never under twenty minutes.

**Sets are filed under the DJ, not the channel.** Mixmag, Boiler Room and Cercle are hosts;
the DJ is in the title, and across the reference sets the titles use five different
conventions. The rule cuts at the earliest separator with two guards: a B2B billing stays
whole, and a title that is just a description ("The best deep house mix of...") falls back to
the host rather than inventing a DJ.

**Two matching bugs, both found by using the feature, both now covered by tests:**

1. *A different remix offered as the same record.* "Witch Doctor (Hot Since 82 Remix)" in the
   set matched "Witch Doctor [Extended Mix]" on disk. The base-title fallback exists for a good
   reason — a tracklist naming the remix where the tag says only "Horny" is the same record —
   but when **both** sides name a version, they now have to be the same version. The library's
   version is read from the raw tag title, before normalisation, which is precisely what
   normalisation strips.
2. *A title alone treated as evidence.* Matching now requires the artist to agree as well.
   Dozens of records are called "Lost" or "Jolene". Where a file carries no artist tag, the
   artist is read out of the title the same way a written tracklist is parsed — plenty of files
   are tagged "Lee Burridge & Lost Desert - Elongi feat. Junior" with an empty artist field, and
   demanding a tag without reading those would mark half a library as missing. The cost is
   accepted deliberately: a file with neither an artist tag nor a dash in its title will never
   match. Better to say "missing" for a record you own than to offer someone else's.

**A third bug, and the most misleading one.** Library matching was reading `App.tsx`'s track
list, which holds only what is on screen — one folder, or one playlist. So it answered "do I
have this in the folder I happen to be looking at". It appeared to work because after a scan
the app returns to All Tracks. The Sets view now loads the whole library itself and refreshes
on `library-changed`, so a file added a minute ago stops reading as missing.

Store links now include Spotify, and appear on the rows themselves on hover — four links
across forty rows would drown out the tracklist if they were always visible.

Tests: 116 frontend, 143 Rust.

### 2026-09-08 — M6 and M7: checking on its own, watching a DJ, and a parser blind spot

**M6 — automatic checking (migration 011).** `check_interval_hours` per followed channel:
0 never, 24 daily, 168 weekly. A background task wakes every 15 minutes and asks a pure
function which channels have waited long enough.

The decision is `is_due(interval, last_checked, now)` and it is tested as one: never,
never-checked, the hour boundary both ways, a manual check a minute ago, an unreadable
timestamp, and a clock that went backwards. `last_checked` is written **per channel and only
when the channel was actually reached** — a network blip must leave a channel due rather than
skipping it for a day. The manual button now writes it too, so a manual check counts.

Two things the plan did not anticipate:

- `last_checked` is an ISO string, so reading it back needed `unix_from_iso` in the module that
  writes it. It also accepts SQLite's `datetime('now')` shape, because rows written by the
  column default came out that way.
- **Migration 011 is an `ALTER TABLE`, and migrations run on every launch.** Without the
  `pragma_table_info` guard the *second* launch after an update fails, not the first. Two tests
  cover it, and removing the guard fails them.

**M7 — watching a DJ (migrations 012-014).** Asked for during the M6 demo: "can I put a DJ name
in the follow box?" The honest answer was no, and finding out why was worth the detour — a bare
name in that box falls through to `search` with `type=channel`, so it costs 100 units and
returns the DJ's *own* channel, where releases live rather than the sets they play. It appears
to work and gives the wrong thing, which is the worst outcome available.

So a DJ is a separate list with a separate mechanism, and the whole design is built around one
number: a channel check is a listing at 1-2 units, a DJ has to be searched for at **100**.

- Not `search_sets`. That orders by relevance, which is right for "find me a Solomun set" and
  useless for "has one appeared since Tuesday" — relevance returns the same famous sets every
  week and the new one never surfaces. `search_sets_since` uses `order=date` plus
  `publishedAfter`, so an empty result is the honest common answer.
- `AUTOMATIC_QUOTA_RESERVE` of 2,000: the automatic run will not spend below it. Buttons may,
  because a button was asked for. `djs_within_budget` is a pure function and is tested.
- A DJ watched for the first time looks back 30 days. Without a floor the first search reports
  a decade of sets as new.

**Two bugs found by using it, in the space of ten minutes, both worth recording.**

1. *A missing letter silently discarded every result.* The name was typed "Josep Capriati", and
   the title filter asked whether the title contained the name as one string. It does not —
   after "josep" comes "h", not a space — so every genuine hit was thrown away while the app
   reported, truthfully and uselessly, that it found nothing. **Cost: 100 units per attempt, and
   no signal that anything was wrong.** The rule now requires every *word* of the name to appear,
   which survives a typo, a reordering, and anything inserted between the words. Deliberately
   looser: being strict here fails invisibly, being loose costs one row you can ignore. Proved
   in the wild immediately — "Josep" then found seven real Joseph Capriati sets.
2. *"Nothing found" and "never looked" were the same screen.* A DJ that had never been searched
   showed "No long uploads found", which reads as an answer. It now says which it is.

**The parser blind spot, found on a real set (`_wfwSaA5GeE`).** HOT SINCE 82 at the BBC Radio 1
Essential Mix: all 24 tracks written into the description as a numbered list, and **not one
timestamp**. Every structural test in `extract.ts` is built on cues — ascending order, coverage
of the runtime — so the description yielded nothing and the set fell through to being assembled
from comments, giving one track, from somebody shouting "OH MY F*K, CHANTE!". **The standalone
tool has the same blind spot.**

`extractNumberedList` replaces the cue with the numbering as evidence: prose does not carry four
or more consecutively numbered lines, so the run of numbers is the structure, and it has to be
*dense* (≥80% of steps counting up) rather than merely present. It runs **only when nothing
anywhere carried a timestamp** — running it alongside would let a numbering inside a real list
compete with the list itself, and the cue is always the better evidence where there is one.
Checked before writing it: no reference fixture has a numbered list in its description, and the
one assembled from comments has none anywhere, so parity was never at risk.

Underneath it was a second bug: `mergeCandidates` clusters by cue with a 20-second window, and
with every cue at zero all 24 rows collapsed into **one** slot. Where nobody wrote a timestamp
the row number is the only ordering there is, so that is what identifies a slot.

Rows with no cue get no seek button and no timeline — a "0:00" on every row would read as a
time somebody wrote down. Reopening an affected set reparses it from the stored fetch at zero
quota cost, which is exactly what keeping the raw JSON was for.

**Remembering what a search found (migration 013).** Novelty used to rest entirely on
`publishedAfter`, so a set found and not imported fell through the gap: the next window starts
after it and it is never mentioned again. Every hit is now recorded per DJ, and the insert
itself reports whether it was the first sighting. A set is news exactly once and stays on the
list to go back to. That also made a 2-day overlap on the search window affordable — publish
time and the moment a set becomes findable are not the same instant.

**Automatic import (migration 014), off by default.** It runs in the *frontend*, on the
`yt-new-sets` event, because the parser is TypeScript: the backend can fetch a set but has
nothing to turn it into a tracklist. `setsToAutoImport` keeps a 1,000-unit reserve and a cap of
five per run, and is a pure function with its own tests — it is the only place the app spends
quota with nobody watching.

**Tests:** 168 Rust (was 143 at the start of the day), 123 frontend (was 116). Every rule that
governs spending or novelty was mutation-checked rather than trusted: hours into minutes,
`<= 0` into `< 0`, the migration guard removed, the reserve removed, the numbered path run
alongside the timestamped one, position-clustering broken, `INSERT OR IGNORE` into `OR REPLACE`,
and the name filter returned to a substring test. Each one fails tests.

**Released as 0.3.0** — the first release containing any of the Sets work. The last public
release, v0.2.15, has none of it.

### 2026-09-08 (later) — what demonstrating it found

Everything below came out of using the feature rather than reading the code, which is the
argument for demonstrating each piece before moving to the next.

**The automatic check had never run.** Both watched DJs were on Weekly and had just been
checked, so nothing would have fired for seven days — including auto-import, which was switched
on. Staging `last_checked` back and restarting made the whole chain run for the first time, and
it worked. It also **filed a set with nought tracks into the library**, and a duplicate
re-upload with two. A library nobody chose to fill has to earn every row: automatic import now
withholds a set that parses to nothing. The units are spent before that can be judged and no
amount of care avoids it, but the row is not written.

**`var(--color-primary)` does not exist in this project.** The scrubber worked perfectly and was
invisible: an undefined custom property throws nothing, logs nothing, and simply drops the
declaration. Found only because the bar looked wrong. The whole app was then checked — every
variable used against every variable defined — which turned up one more: `--space-10` in
`SearchView.css`, on a scale that goes 6, 8, 12. Every icon name was checked the same way; all
57 resolve.

**A missing letter cost a hundred units and said nothing.** "Josep Capriati" is not a substring
of "JOSEPH CAPRIATI closing set", so the title filter discarded every genuine hit while the app
reported, truthfully, that it found nothing. Matching now requires every *word* of the name.
Deliberately looser: strict fails invisibly, loose costs one row you can ignore.

**One DJ, several headings.** `extractDjName` cuts at the earliest separator, which fails three
ways at once: "Hot Since 82 House Set" and "JOSEPH CAPRIATI closing set" carry the description
*before* the separator, and "Fabric 80 - Joseph Capriati" carries the name *after* it. Trailing
role words now come off, and a compilation series in front is read past. Over the eleven real
titles in the library, eight groups became five.

**Two players, one pair of ears.** The video and the app's own player know nothing about each
other, so whichever starts hands the other a pause. The first version had a race: panel state
is read through a poll and instructions reach it through another, so for the best part of a
second the video still reports itself as playing. Clicking "have it" stopped the video, started
the file, and paused the file a moment later. A latch now makes the rule deaf to reports issued
before the video was asked to stop.

**Things that were built because the parser could already do it.**

- `fill_details`: one `videos` call returns full descriptions for up to fifty hits, so a search
  result can say whether it holds a tracklist before 5-7 units are spent opening it. One unit
  against the hundred the search cost.
- "Look again": reopening a stored set reparses the copy taken on the day, which is right when
  the parser improved and wrong when the set did. Comments keep arriving.
- Cross-set echoes: a row with no timestamp points at the same record in a set that does know
  where it sits. Verified against the real library and **it fires nowhere yet** — both untimed
  sets are the same Essential Mix, and their twin has no timestamps either. Correct, tested, and
  invisible until a set is stored that shares a record with them.
- The strip carries tempo: 8,202 of 8,421 library tracks are analysed, so the blocks can have
  height. Checked before building it — only 95 tracks have a key, so nothing leans on key.

**Tests:** 171 Rust, 139 frontend. One test written during this stretch was thrown away and
rewritten: it exercised a fake function declared inside the test file rather than the code, which
is worse than no test at all.

## Next Steps

1. **NOW**: Continue Phase 2 — Next milestone: 2.1 Mel spectrogram or 2.4 Waveform peaks
2. Optional: Analysis queue UI with progress (2.18), spectrogram viz (2.16)
3. Optional: Write BPM to file tags after analysis (so other apps see our value)
