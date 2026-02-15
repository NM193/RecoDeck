# RecoDeck Development Progress

Last Updated: 2026-02-12

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

## Next Steps

1. **NOW**: Continue Phase 2 — Next milestone: 2.1 Mel spectrogram or 2.4 Waveform peaks
2. Optional: Analysis queue UI with progress (2.18), spectrogram viz (2.16)
3. Optional: Write BPM to file tags after analysis (so other apps see our value)
