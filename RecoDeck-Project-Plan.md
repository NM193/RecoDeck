# RecoDeck — Project Plan

**A desktop music library & DJ preparation app with AI-powered deep audio analysis**

Version: 3.0 | Last Updated: February 2026

---

## ⚠️ DEVELOPMENT RULES — READ FIRST

> **This section is mandatory for any AI coding assistant (Cursor, Claude Code, or any other tool) working on this project. These rules cannot be overridden, skipped, or worked around.**

### Rule 1: Scope Lock

- **DO NOT** add features, libraries, or architectural changes not described in this plan.
- **DO NOT** refactor working code unless explicitly requested by the developer.
- **DO NOT** change the tech stack (Tauri v2, React, TypeScript, Rust, SQLite, ONNX Runtime) without explicit approval.
- **DO NOT** introduce new dependencies without justification tied to a specific plan feature.
- **DO NOT** skip steps in the phase milestones — they are ordered intentionally.
- **DO NOT** "improve" or "optimize" code that is working and passing tests unless asked.
- **IF** something seems missing from the plan, **ASK** the developer before implementing.

### Rule 2: Interview Protocol

Before starting ANY new phase, milestone, or significant feature implementation:

> **Read this plan file and interview the developer in detail using AskUser/AskUserQuestionTool about literally anything: technical implementation, UI & UX, concerns, tradeoffs, etc.**

This means:
- Before Phase 1 starts → interview about scaffold choices, folder structure, initial UI decisions
- Before each milestone within a phase → interview about specific implementation details
- When encountering ambiguity → ask, don't assume
- When multiple valid approaches exist → present options and ask
- When a decision has downstream consequences → flag it and discuss

### Rule 3: Testing Gates

**No milestone is complete until it passes its validation gate.** You cannot proceed to the next milestone until the current one is verified.

Gate process:
1. Implement the milestone
2. Run all relevant tests (unit, integration, manual)
3. **Demo to developer** — show what was built, explain what it does
4. Developer confirms: "approved" or "needs changes"
5. Only after "approved" → move to next milestone

**If a test fails or the developer says "this isn't what I'm looking for":**
- Stop immediately
- Do not attempt to fix and move forward simultaneously
- Fix the issue, re-test, re-demo
- Get explicit approval before proceeding

### Rule 4: Code Quality Standards

- Every Rust module must have basic unit tests before moving on
- Every React component must render without errors before moving on
- Every Tauri IPC command must be testable in isolation
- No `unwrap()` in production Rust code — use proper error handling
- No `any` type in TypeScript — use proper interfaces
- All database queries must use parameterized statements (no SQL injection)
- Comments are required for non-obvious logic, especially in audio/AI code

### Rule 5: File & Naming Conventions

- Rust: snake_case for files, functions, variables; PascalCase for types/structs
- TypeScript/React: PascalCase for components; camelCase for functions/variables
- CSS: kebab-case for custom properties, BEM-ish for custom classes
- Database: snake_case for tables and columns
- Follow the file structure defined in Section 11 exactly

### Rule 6: Communication

- When writing code, always explain **what** you're doing and **why**
- When making a choice between alternatives, explain the tradeoff
- When something is complex, add inline comments
- Never silently change behavior — always call out behavioral changes explicitly

---

## 1. Product Vision

RecoDeck is a desktop application for DJs and electronic music collectors that combines intelligent music library management with AI-powered deep audio analysis. It fills the gap between basic music players and full DJ software by focusing on what happens *before* the gig: organizing, analyzing, tagging, and discovering relationships between tracks.

**Core differentiator:** Deep audio intelligence — every track is analyzed through a multi-layer pipeline that extracts BPM, key, genre (400 Discogs styles), mood, danceability, instruments, vocal detection, audio fingerprints, and rich embeddings for similarity search. On top of this, a custom AI classifier learns *your* genre taxonomy, understanding the difference between deep tech and minimal tech house because you teach it.

**Target users:** DJs who play electronic music (tech house, progressive house, deep tech, etc.) and want a smarter way to prepare sets.

---

## 2. Tech Stack

### 2.1 Desktop Framework — Tauri v2

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Shell | Tauri v2 (Rust) | Lightweight (~5MB), native performance, mobile-ready |
| Frontend | React 18 + TypeScript | Familiar ecosystem, rich component libraries |
| Bundler | Vite | Fast HMR, Tauri-native integration |
| Styling | Tailwind CSS + CSS variables | Utility-first, theme-friendly via CSS custom properties |
| State | Zustand | Lightweight, no boilerplate, good for complex audio state |
| Routing | React Router v7 | Standard, file-based routing option |

### 2.2 Backend (Rust Side)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Database | SQLite via `rusqlite` | Embedded, fast for 10K+ records, complex queries |
| Audio decoding | Symphonia | Pure Rust, supports MP3/FLAC/WAV/AIFF |
| BPM detection | `aubio` Rust bindings | Industry-standard onset detection |
| Key detection | Custom FFT + Krumhansl-Schmuckler | Chromagram-based, proven algorithm |
| Waveform gen | Custom (Symphonia + downsampling) | Generate overview + detailed waveform data |
| Mel spectrogram | Custom Rust DSP (FFT + mel filterbank) | Foundation for all AI model inputs |
| AI inference | `ort` (ONNX Runtime) | Run ML models locally, zero cost |
| Audio fingerprint | Chromaprint (Rust bindings) | AcoustID-compatible fingerprinting |
| File watching | `notify` crate | Watch library folders for new/changed files |
| HTTP client | `reqwest` | MusicBrainz API lookups, mobile streaming server |
| Local server | `axum` or Tauri built-in | Serve audio to mobile companion |
| Serialization | `serde` + `serde_json` | Standard Rust serialization |

### 2.3 AI & Analysis Pipeline

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Audio embeddings | Effnet-Discogs (ONNX) | Discogs-trained, produces rich 512-dim embeddings |
| Genre/style classification | Effnet-Discogs classifier (ONNX) | 400 Discogs styles out of the box, free |
| Mood classification | MTG mood models (ONNX) | Happy/sad, aggressive/relaxed from Essentia ecosystem |
| Danceability | MTG danceability model (ONNX) | Proven model from MTG/Essentia |
| Voice/Instrumental | MTG voice classifier (ONNX) | Detects vocal presence with confidence |
| Instrument detection | MTG instrument model (ONNX) | Synth, drums, guitar, etc. |
| Custom genre classifier | User-trained MLP head (ONNX) | Trained on user's labeled tracks + Effnet embeddings |
| Similarity engine | Cosine similarity (brute-force) | Fast enough for 10K tracks (<50ms) |
| Audio fingerprinting | Chromaprint → AcoustID API | Identify recordings, find duplicates |
| Metadata enrichment | MusicBrainz API | Lookup artist, album, release info from fingerprint |
| AI playlist generation | Claude API | Natural language playlist creation |

### 2.4 Mobile Companion

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Android app | React Native or Tauri Mobile | Code sharing with desktop frontend |
| Local streaming | HTTP server on desktop (axum) | Stream audio over WiFi, simple REST API |
| Remote streaming | Tailscale or Cloudflare Tunnel | Secure tunnel for internet access without port forwarding |
| Communication | REST API + WebSocket | Browse library, search, stream audio, control playback |

### 2.5 Model Files (bundled with app)

| Model | Size (approx.) | Source |
|-------|----------------|--------|
| Effnet-Discogs (embeddings + 400 styles) | ~20MB | MTG/Essentia |
| Mood classifier (happy/sad, aggressive/relaxed) | ~5MB | MTG/Essentia |
| Danceability model | ~5MB | MTG/Essentia |
| Voice/Instrumental classifier | ~5MB | MTG/Essentia |
| Instrument recognition | ~5MB | MTG/Essentia |
| User custom genre classifier | ~1MB | Trained locally |
| **Total bundled model size** | **~41MB** | |

All models are converted to ONNX format and run via `ort` in Rust. No Python dependency at runtime.

### 2.6 Supported Formats

- MP3 (CBR/VBR)
- FLAC (all bit depths)
- WAV (16/24/32-bit)
- AIFF/AIFF-C

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Frontend (React)                     │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌─────────────┐  │
│  │  Library  │ │  Player  │ │Spectro- │ │  AI Chat /  │  │
│  │  Browser  │ │  + Wave  │ │ gram    │ │  Command    │  │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ └──────┬──────┘  │
│       │             │            │              │          │
│  ┌────┴─────────────┴────────────┴──────────────┴──────┐  │
│  │             Zustand Store (app state)                │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │ Tauri IPC (invoke/events)        │
├─────────────────────────┼────────────────────────────────┤
│                         │                                 │
│  ┌──────────────────────┴──────────────────────────────┐  │
│  │               Tauri Commands (Rust)                  │  │
│  │                                                      │  │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │   Audio    │ │ Library  │ │   AI Engine        │  │  │
│  │  │  Analysis  │ │ Manager  │ │   (ONNX Runtime)   │  │  │
│  │  │            │ │          │ │                     │  │  │
│  │  │ • DSP      │ │ • Scan   │ │ • Effnet-Discogs   │  │  │
│  │  │ • BPM      │ │ • Meta   │ │ • Mood classifier  │  │  │
│  │  │ • Key      │ │ • Watch  │ │ • Danceability     │  │  │
│  │  │ • Waveform │ │ • Search │ │ • Voice detection  │  │  │
│  │  │ • Spectro  │ │ • Auto-  │ │ • Instruments      │  │  │
│  │  │ • Loudness │ │   sort   │ │ • Custom genre     │  │  │
│  │  └─────┬──────┘ └────┬─────┘ └──────────┬────────┘  │  │
│  │        │              │                  │            │  │
│  │  ┌─────┴──────────────┴──────────────────┴─────────┐ │  │
│  │  │              SQLite Database                      │ │  │
│  │  │  tracks | analysis | embeddings | genres | tags   │ │  │
│  │  │  instruments | moods | fingerprints | playlists   │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │                                                      │  │
│  │  ┌──────────────────┐  ┌────────────────────────┐    │  │
│  │  │  Fingerprint     │  │  External APIs         │    │  │
│  │  │  (Chromaprint)   │  │  • AcoustID lookup     │    │  │
│  │  │                  │  │  • MusicBrainz metadata │    │  │
│  │  └──────────────────┘  │  • Claude API (chat)   │    │  │
│  │                        └────────────────────────┘    │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │  Mobile Streaming Server (axum)              │    │  │
│  │  │  • REST API: browse, search, metadata        │    │  │
│  │  │  • Audio streaming: HTTP range requests      │    │  │
│  │  │  • WebSocket: playback sync, real-time       │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                       Backend (Rust)                        │
└────────────────────────────────────────────────────────────┘

        │ WiFi / Internet (Tailscale tunnel)
        ▼
┌─────────────────────────┐
│   Mobile Companion      │
│   (Android)             │
│                         │
│  • Browse library       │
│  • Search tracks        │
│  • Stream & play audio  │
│  • View analysis data   │
│  • Basic playlists      │
└─────────────────────────┘
```

### 3.1 Data Flow

1. **Import:** User adds folder → Rust scans files → reads metadata (ID3/Vorbis) → stores in SQLite
2. **Auto-categorize:** File watcher detects new file → triggers full analysis pipeline → auto-assigns genre → track appears in correct smart playlists
3. **Fingerprint:** Chromaprint generates audio fingerprint → optional AcoustID/MusicBrainz lookup for missing metadata
4. **Deep Analysis:** Background worker processes queue:
   - DSP layer: BPM, key, waveform peaks, mel spectrogram, loudness
   - AI layer: Feed mel spectrogram → Effnet-Discogs (400 styles + embeddings), mood, danceability, voice, instruments
   - Custom layer: Effnet embeddings → user-trained genre classifier → your genres
   - All results stored in SQLite
5. **Playback:** Frontend requests audio via Tauri → Rust decodes + streams → Web Audio API renders
6. **AI Chat:** User types natural language → Claude API receives query + library context → returns playlist/recommendations
7. **Mobile:** Phone connects to desktop server → browse/search library → stream audio on demand
8. **Export:** User exports playlist → Rust generates Rekordbox XML or Traktor NML

### 3.2 Auto-Categorization Pipeline (Watch Folder → Genre)

This is the core "drop a song, it sorts itself" workflow:

```
New file detected in watched folder (notify crate)
    │
    ▼
Import: Read file metadata (ID3v2/Vorbis) → Create track record in SQLite
    │
    ▼
Analysis Queue: Add to background processing queue (priority: new files first)
    │
    ▼
DSP Pass:
    ├──→ BPM detection → store
    ├──→ Key detection → store
    ├──→ Waveform peaks → store
    ├──→ Mel spectrogram → store + pass to AI
    ├──→ Loudness (LUFS) → store
    └──→ Chromaprint fingerprint → store
    │
    ▼
AI Pass (ONNX models):
    ├──→ Effnet-Discogs → 400 Discogs styles + 512-dim embedding → store
    ├──→ Mood models → happy/sad, aggressive/relaxed → store
    ├──→ Danceability → score → store
    ├──→ Voice/instrumental → detection → store
    └──→ Instrument recognition → instruments → store
    │
    ▼
Custom Genre Classification:
    │  IF custom model is trained:
    │    Effnet embedding → Custom MLP → Your genre labels + confidence
    │  ELSE:
    │    Use Discogs styles as fallback (mapped to simplified categories)
    │
    ▼
Auto-Sort:
    ├──→ Track appears in matching smart playlists automatically
    ├──→ Track gets auto-tags based on analysis (vocal, high-energy, etc.)
    └──→ UI notification: "New track analyzed: [Title] → [Genre] (87%)"
```

**Time from file drop to categorized:** ~5-10 seconds per track (depending on file size and system load).

### 3.3 Deep Analysis Pipeline (per track)

```
Audio File (MP3/FLAC/WAV/AIFF)
    │
    ▼
Decode to PCM (Symphonia) → Resample to 16kHz mono
    │
    ├──→ Onset Detection (aubio) ──→ BPM + beat grid
    ├──→ Chromagram (FFT) ──→ Musical key (Camelot)
    ├──→ Peak Extraction ──→ Waveform overview + detail
    ├──→ Loudness Metering ──→ LUFS + dynamic range
    ├──→ Chromaprint ──→ Audio fingerprint (hash)
    │
    ▼
Compute Mel Spectrogram (128 mel bands, 16kHz)
    │
    │   ┌─────────────────────────────────────────────────────┐
    │   │        ONNX Runtime — Parallel Model Inference       │
    │   │                                                      │
    ├──→│  Effnet-Discogs ──→ 400 Discogs styles (ranked)     │
    │   │                 ──→ 512-dim embedding (similarity)   │
    │   │                                                      │
    ├──→│  Mood Models ──→ happy/sad, aggressive/relaxed       │
    │   │                                                      │
    ├──→│  Danceability ──→ score 0.0-1.0                      │
    │   │                                                      │
    ├──→│  Voice/Instrumental ──→ vocal presence + confidence  │
    │   │                                                      │
    ├──→│  Instrument Recognition ──→ top instruments          │
    │   └─────────────────────────────────────────────────────┘
    │
    ▼
Store All Results → SQLite
    │
    ▼
Optional: AcoustID Lookup (internet) → MusicBrainz metadata enrichment
    │
    ▼
Optional: Custom Genre Classifier (user-trained MLP on embeddings)
```

**Processing time estimate:** ~3-5 seconds per track (including all models). Full library of 5,000 tracks ≈ 4-7 hours initial analysis (background, one-time).

---

## 4. Database Schema (SQLite)

```sql
-- Core track data
CREATE TABLE tracks (
    id              INTEGER PRIMARY KEY,
    file_path       TEXT NOT NULL UNIQUE,
    file_hash       TEXT NOT NULL,           -- For detecting moves/changes
    title           TEXT,
    artist          TEXT,
    album           TEXT,
    album_artist    TEXT,
    track_number    INTEGER,
    year            INTEGER,
    label           TEXT,                    -- Record label
    duration_ms     INTEGER,
    file_format     TEXT,                    -- mp3, flac, wav, aiff
    bitrate         INTEGER,
    sample_rate     INTEGER,
    file_size       INTEGER,
    date_added      TEXT DEFAULT (datetime('now')),
    date_modified   TEXT,
    play_count      INTEGER DEFAULT 0,
    rating          INTEGER DEFAULT 0,       -- 0-5
    comment         TEXT,
    artwork_path    TEXT                     -- Extracted cover art cache
);

-- Audio fingerprint for identification & duplicate detection
CREATE TABLE track_fingerprints (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    chromaprint     TEXT NOT NULL,           -- Chromaprint fingerprint string
    acoustid        TEXT,                    -- AcoustID identifier (if looked up)
    musicbrainz_id  TEXT,                    -- MusicBrainz recording ID (if resolved)
    fingerprinted_at TEXT
);

-- DSP analysis results
CREATE TABLE track_analysis (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    bpm             REAL,
    bpm_confidence  REAL,                    -- 0.0-1.0
    musical_key     TEXT,                    -- e.g., "8A" (Camelot) or "Am"
    key_confidence  REAL,
    loudness_lufs   REAL,                    -- Integrated loudness
    dynamic_range   REAL,                    -- LRA (loudness range)
    spectral_centroid REAL,                  -- Brightness indicator
    waveform_overview BLOB,                  -- Downsampled peaks for overview
    waveform_detail BLOB,                    -- Higher-res peaks for zoom
    spectrogram_data BLOB,                   -- Mel spectrogram for UI visualization
    analyzed_at     TEXT
);

-- AI deep analysis results
CREATE TABLE track_deep_analysis (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    danceability    REAL,                    -- 0.0-1.0
    energy_arousal  REAL,                    -- 0.0-1.0 (calm → energetic)
    valence         REAL,                    -- 0.0-1.0 (sad → happy)
    aggressiveness  REAL,                    -- 0.0-1.0 (relaxed → aggressive)
    is_vocal        BOOLEAN,                 -- Has vocals?
    vocal_confidence REAL,
    model_version   TEXT,
    analyzed_at     TEXT
);

-- AI embeddings for similarity search
CREATE TABLE track_embeddings (
    track_id        INTEGER PRIMARY KEY REFERENCES tracks(id),
    embedding       BLOB,                    -- Float32 vector (512-dim from Effnet-Discogs)
    model_version   TEXT,
    created_at      TEXT
);

-- Discogs style predictions (400 styles, store top N per track)
CREATE TABLE track_discogs_styles (
    track_id        INTEGER REFERENCES tracks(id),
    style           TEXT,                    -- e.g., "Electronic---Tech House"
    confidence      REAL,
    PRIMARY KEY (track_id, style)
);

-- Detected instruments
CREATE TABLE track_instruments (
    track_id        INTEGER REFERENCES tracks(id),
    instrument      TEXT,
    confidence      REAL,
    PRIMARY KEY (track_id, instrument)
);

-- User genre labels + AI predictions (custom taxonomy)
CREATE TABLE track_genres (
    track_id        INTEGER REFERENCES tracks(id),
    genre           TEXT,
    confidence      REAL,
    is_user_label   BOOLEAN DEFAULT FALSE,   -- TRUE = user confirmed, FALSE = AI predicted
    PRIMARY KEY (track_id, genre)
);

-- Flexible tag system
CREATE TABLE tags (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT,
    category        TEXT                     -- e.g., "mood", "energy", "venue", "vibe"
);

CREATE TABLE track_tags (
    track_id        INTEGER REFERENCES tracks(id),
    tag_id          INTEGER REFERENCES tags(id),
    PRIMARY KEY (track_id, tag_id)
);

-- Playlists (manual, smart, and AI-generated)
CREATE TABLE playlists (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT DEFAULT 'manual',   -- 'manual', 'smart', 'ai_generated'
    smart_rules     TEXT,                    -- JSON rules for smart playlists
    ai_prompt       TEXT,                    -- Original prompt for AI-generated playlists
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT
);

CREATE TABLE playlist_tracks (
    playlist_id     INTEGER REFERENCES playlists(id),
    track_id        INTEGER REFERENCES tracks(id),
    position        INTEGER,
    PRIMARY KEY (playlist_id, track_id)
);

-- Cue points
CREATE TABLE cue_points (
    id              INTEGER PRIMARY KEY,
    track_id        INTEGER REFERENCES tracks(id),
    position_ms     INTEGER NOT NULL,
    label           TEXT,
    color           TEXT,
    type            TEXT DEFAULT 'cue'       -- 'cue', 'loop_start', 'loop_end'
);

-- AI chat history (for playlist generation context)
CREATE TABLE ai_chat_history (
    id              INTEGER PRIMARY KEY,
    role            TEXT NOT NULL,            -- 'user' or 'assistant'
    content         TEXT NOT NULL,
    playlist_id     INTEGER REFERENCES playlists(id),  -- If a playlist was generated
    created_at      TEXT DEFAULT (datetime('now'))
);

-- App settings & theme preferences
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT                     -- JSON value
);

-- Indexes
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_label ON tracks(label);
CREATE INDEX idx_analysis_bpm ON track_analysis(bpm);
CREATE INDEX idx_analysis_key ON track_analysis(musical_key);
CREATE INDEX idx_deep_danceability ON track_deep_analysis(danceability);
CREATE INDEX idx_deep_vocal ON track_deep_analysis(is_vocal);
CREATE INDEX idx_discogs_style ON track_discogs_styles(style);
CREATE INDEX idx_discogs_confidence ON track_discogs_styles(track_id, confidence DESC);
CREATE INDEX idx_instruments ON track_instruments(instrument);
CREATE INDEX idx_genres_genre ON track_genres(genre);
CREATE INDEX idx_tags ON track_tags(tag_id);
CREATE INDEX idx_fingerprints_acoustid ON track_fingerprints(acoustid);
CREATE INDEX idx_fingerprints_mbid ON track_fingerprints(musicbrainz_id);
```

---

## 5. Feature Breakdown by Phase

### Phase 1 — Foundation (MVP)
*Goal: Working music player with library management*

- **Library scanner:** Add folders, recursive scan, metadata extraction (ID3v2, Vorbis Comment)
- **Track browser:** Table view with sortable columns (title, artist, BPM, key, genre, duration)
- **Search & filter:** Full-text search across title/artist/album, filter by format
- **Audio playback:** Play/pause, seek, volume, waveform overview display
- **Basic metadata editing:** Edit title, artist, album, comment inline
- **File watching:** Auto-detect new/removed/changed files in library folders
- **Settings:** Library folder management, theme selection

### Phase 2 — Deep Analysis Engine
*Goal: Full audio intelligence pipeline — every track deeply understood*

**DSP Analysis (signal-level):**
- **BPM detection:** Aubio-based tempo estimation, manual correction UI, beat grid
- **Key detection:** Chromagram + Krumhansl-Schmuckler, Camelot wheel display
- **Waveform generation:** Overview (full track) + detail (zoomable) waveforms
- **Mel spectrogram computation:** 128 mel bands at 16kHz — foundation for all AI models
- **Loudness metering:** Integrated LUFS + dynamic range (LRA)
- **Spectral analysis:** Centroid (brightness), bandwidth

**AI Analysis (model-based, ONNX):**
- **Discogs style classification:** 400 styles via Effnet-Discogs (top 10 stored per track)
- **Mood detection:** Happy/sad axis, aggressive/relaxed axis
- **Danceability scoring:** 0-100 scale
- **Voice/instrumental detection:** Is there a vocal? With confidence score
- **Instrument recognition:** Synthesizer, drum machine, guitar, bass, piano, etc.
- **Audio embeddings:** 512-dim Effnet-Discogs vectors for similarity search

**Identification & Enrichment:**
- **Audio fingerprinting:** Chromaprint generation for every track
- **AcoustID lookup:** Match fingerprint to known recordings (requires internet)
- **MusicBrainz metadata:** Auto-fill artist, album, label, year from fingerprint match

**Auto-Categorization:**
- **Watch folder trigger:** New file → auto-analyze → auto-categorize → appears in smart playlists
- **Discogs-to-genre mapping:** Default mapping of 400 Discogs styles to simplified categories
- **UI notification:** "New track analyzed: [Title] → [Genre] (87%)"

**UI for Analysis:**
- **Spectrogram visualization:** Interactive mel spectrogram display (Canvas-based)
- **Analysis dashboard per track:** Visual summary of all extracted features
- **Analysis queue:** Background processing with progress indicator, estimated time remaining
- **Batch operations:** Analyze all / re-analyze selected / analyze new only

### Phase 3 — Organization
*Goal: Powerful library management for DJs*

- **Tag system:** Create custom tags with colors/categories, bulk tagging, tag-based filtering
- **Smart playlists:** Rule-based auto-updating playlists (see Section 9)
- **Manual playlists:** Create, reorder (drag & drop), duplicate
- **Cue points:** Set/edit/delete cue points on waveform, color-coded, labeled
- **Rating system:** 0-5 star ratings
- **Column customization:** Show/hide/reorder columns in track browser
- **Duplicate detection:** Find duplicate tracks via Chromaprint fingerprint similarity
- **Missing file management:** Detect moved/deleted files, relocate

### Phase 4 — AI Features
*Goal: Custom classification, intelligent discovery, and natural language interaction*

**Custom Genre Classifier:**
- Label tracks with your genre taxonomy (your subgenres, not Discogs')
- Map Discogs 400 styles → your simplified taxonomy as starting point
- Train local MLP on labeled data using Effnet embeddings (minimum ~50 tracks per genre)
- Auto-classify unlabeled tracks with confidence scores
- Active learning: suggest tracks for labeling that would most improve the model
- Re-train on demand when labels change significantly

**Discovery:**
- **Track similarity:** "Find similar" on any track using embedding cosine distance
- **Smart suggestions:** "If you're playing this, consider these next" (BPM + key + similarity)
- **Similarity map:** 2D scatter plot of track embeddings (t-SNE/UMAP visualization)
- **Style explorer:** Browse library by Discogs style hierarchy with track counts
- **Mood/energy filters:** Filter by detected mood and energy level

**AI Chat & Command Bar (Claude API):**
- **Command bar** (Cmd+K): Quick natural language actions
  - "Create a tech house playlist for Sunday chill"
  - "Find tracks similar to [currently playing]"
  - "Show me all dark minimal tracks above 126 BPM"
- **Chat panel:** Full conversation for complex playlist building
  - Multi-turn: "Make it darker" / "Remove vocals" / "Add more variety"
  - Context-aware: AI sees your full library analysis data
  - Generates playlists that are saved and editable
- **How it works:** Claude API receives your query + library summary (genres, BPM ranges, moods available) → translates to SQL/filter queries → builds playlist → you approve or refine

### Phase 5 — DJ Integration
*Goal: Bridge to performance software*

- **Rekordbox XML export:** Export playlists with all metadata (BPM, key, cue points, rating)
- **Rekordbox XML import:** Read existing Rekordbox library data
- **Traktor NML export/import:** Same for Traktor users
- **Set builder:** Create ordered set lists with BPM/key flow visualization
  - Harmonic mixing suggestions (Camelot wheel)
  - Energy arc visualization
  - Mood arc visualization

### Phase 6 — Mobile Companion
*Goal: Stream your library to your phone — no files stored on device*

**Desktop side (server):**
- Embedded HTTP server (axum) starts when app is running
- REST API endpoints: `/api/tracks`, `/api/search`, `/api/playlists`, `/api/stream/:id`
- Audio streaming via HTTP range requests (supports seeking)
- WebSocket for real-time sync (now playing, library updates)
- **Local network:** Auto-discovery via mDNS (Bonjour) — phone finds desktop automatically
- **Internet access:** Optional Tailscale VPN or Cloudflare Tunnel for remote streaming

**Android app (lightweight):**
- Browse full library (metadata only — no audio stored on phone)
- Search by title, artist, genre, BPM, key, mood
- Stream and play tracks on demand (buffered streaming, not download)
- View analysis data (BPM, key, genre, mood, waveform)
- Basic playlist browsing
- Simple, clean player UI

**What it does NOT do (to keep it simple):**
- No analysis on mobile — all analysis happens on desktop
- No offline playback — requires connection to desktop
- No editing (tags, cue points, metadata) — read-only
- No AI features on mobile — desktop only

### Phase 7 — Polish & Advanced
*Goal: Refinement and power features*

- **Customizable themes:** Dark/light base + accent color picker, custom CSS overrides
- **Keyboard shortcuts:** Configurable, full keyboard navigation
- **Drag & drop:** Tracks to playlists, files from OS, reorder everywhere
- **Multi-select operations:** Bulk tag, rate, analyze, add to playlist
- **Statistics dashboard:** Library composition, genre distribution, BPM histogram, mood scatter
- **Advanced spectrogram:** Harmonic/percussive separation view, frequency labeling

---

## 6. UI/UX Design

### 6.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉   RecoDeck    [⌘K Command...]   [Search...]   ⚙ 🎨 │  ← Title bar + command bar + search
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  Library   │   Track Browser (table view)                    │
│  ─────     │   ┌──────────────────────────────────────────┐  │
│  All Tracks│   │ ▶ Title   Artist  BPM Key  Style     🎤 │  │
│  Recently  │   │   Track1  ArtA   126  8A  TechH      ✓  │  │
│  Added     │   │   Track2  ArtB   124  11B ProgH      ✗  │  │
│            │   │   Track3  ArtC   128  6A  DeepT      ✓  │  │
│  Playlists │   │   ...                                    │  │
│  ─────     │   └──────────────────────────────────────────┘  │
│  ▶ Set 1   │                                                 │
│  ▶ Set 2   │                                                 │
│  ★ Smart:  ├─────────────────────────────────────────────────┤
│    Tech    │                                                 │
│    House   │   [Waveform ▼] [Spectrogram] [Analysis]         │
│            │   ┌──────────────────────────────────────────┐  │
│  🤖 AI     │   │ ▁▂▃▅▇▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅▇▅▃▂▁          │  │
│  Generated │   └──────────────────────────────────────────┘  │
│  ▶ Sunday  │                                                 │
│    Chill   │   ◀◀  ▶ ❚❚  ▶▶   🔊━━━━━○━━━    3:42       │
│  ▶ Work    │   Track Title — Artist Name                     │
│    Techno  │                                                 │
│            │   ┌─────────┬─────────┬─────────┬────────┐      │
│  Styles    │   │ BPM:126 │ Key:8A  │ Dance:82│ Mood:61│      │
│  ─────     │   └─────────┴─────────┴─────────┴────────┘      │
│  Tags      │   Instruments: synth (92%) · drums (87%)        │
│  ─────     │   Styles: Tech House (78%) · Minimal (34%)      │
└────────────┴─────────────────────────────────────────────────┘
```

### 6.2 Command Bar (Cmd+K)

```
┌──────────────────────────────────────────────────┐
│  ⌘K  Create a chill tech house playlist for      │
│       Sunday morning                              │
│                                                   │
│  ┌─ Suggestions ──────────────────────────────┐  │
│  │  🎵 Create playlist "Sunday Chill Tech"    │  │
│  │  🔍 Search: "chill tech house"             │  │
│  │  📊 Show: tech house tracks, energy < 60   │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 6.3 AI Chat Panel

```
┌──────────────────────────────────────────────────┐
│  🤖 RecoDeck AI                            [×]   │
├──────────────────────────────────────────────────┤
│                                                   │
│  You: Create me a good tech house playlist for    │
│       work, about 2 hours                         │
│                                                   │
│  AI: I've created "Work Tech House" with 28       │
│      tracks (2h 12m). I focused on:               │
│      • BPM range: 124-128 (consistent flow)       │
│      • Mostly instrumental (less distraction)      │
│      • Medium energy (not too intense)             │
│      • Mixed between tech house and minimal        │
│                                                   │
│      [View Playlist] [Edit] [Regenerate]          │
│                                                   │
│  You: Make it a bit darker, less melodic           │
│                                                   │
│  AI: Updated — I replaced 8 tracks with darker    │
│      selections (higher aggressiveness score,      │
│      lower valence). Removed the melodic           │
│      progressive tracks.                           │
│                                                   │
│      [View Updated Playlist] [Undo]               │
│                                                   │
├──────────────────────────────────────────────────┤
│  [Type your message...]                    [Send] │
└──────────────────────────────────────────────────┘
```

### 6.4 Spectrogram View

```
┌──────────────────────────────────────────────────────┐
│  [Waveform] [Spectrogram ▼] [Analysis]               │
├──────────────────────────────────────────────────────┤
│  16kHz ┤░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│   8kHz ┤▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░ │
│   4kHz ┤████▓▓████▓▓████▓▓████▓▓████▓▓████▓▓████▓▓ │
│   2kHz ┤██████████████████████████████████████████████│
│   1kHz ┤██████████████████████████████████████████████│
│    500 ┤▓▓████▓▓████▓▓████▓▓████▓▓████▓▓████▓▓████ │
│    250 ┤████████████▓▓▓▓████████████▓▓▓▓████████████ │
│    125 ┤██████████████████████████████████████████████│
│     Hz ┤─────────┬─────────┬─────────┬─────────┬──── │
│        0:00     1:00      2:00      3:00      4:00   │
│                          ▲ playhead                   │
├──────────────────────────────────────────────────────┤
│  Color: [Magma ▼]  Scale: [Mel ▼]  Range: [-80, 0]dB│
└──────────────────────────────────────────────────────┘
```

### 6.5 Track Analysis Panel

```
┌──────────────────────────────────────────────────────┐
│  [Waveform] [Spectrogram] [Analysis ▼]               │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌─ Rhythm ──────────┐  ┌─ Tonal ────────────────┐  │
│  │ BPM: 126.0 (±0.95)│  │ Key: 8A / Am (±0.92)  │  │
│  │ Danceability: 82%  │  │ [Camelot Wheel Mini]   │  │
│  └────────────────────┘  └────────────────────────┘  │
│                                                       │
│  ┌─ Audio Profile ───────────────────────────────┐   │
│  │ Loudness:  -8.2 LUFS    Dynamic Range: 7.1 LU│   │
│  │ Vocal:     Yes (94%)     Brightness:   0.62   │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ Mood ────────────────────────────────────────┐   │
│  │ Happy ■■■■■■░░░░ 61%  Aggressive ■■■░░░░░░░ 28%│  │
│  │ Energy ■■■■■■■■░░ 82%                          │  │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ Instruments ─────────────────────────────────┐   │
│  │ 🎹 Synthesizer (92%)  🥁 Drum Machine (87%)  │   │
│  │ 🎸 Bass (64%)         🎹 Piano (12%)         │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ Discogs Styles (Top 5) ──────────────────────┐   │
│  │ 1. Tech House (78%)  2. Minimal (34%)         │   │
│  │ 3. Deep House (21%)  4. Techno (18%)          │   │
│  │ 5. Progressive House (9%)                      │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ Identity ────────────────────────────────────┐   │
│  │ AcoustID: a1b2c3...  MusicBrainz: matched ✓  │   │
│  │ Label: Toolroom Records  Year: 2024           │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 6.6 Design Principles

- **Information density:** DJs need to scan lots of data quickly — table view is primary
- **Contextual actions:** Right-click menus, inline editing, hover reveals
- **Non-blocking analysis:** All heavy processing in background with subtle progress indicators
- **Color as data:** Tags, cue points, energy, mood, and key all use color meaningfully
- **Keyboard-first option:** Every action reachable by keyboard (Phase 7)
- **Progressive disclosure:** Quick chips show key data; full analysis panel shows everything

### 6.7 Theme System

```css
:root[data-theme="midnight"] {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-tertiary: #1a1a28;
    --text-primary: #e0e0e8;
    --text-secondary: #8888a0;
    --accent: #6366f1;
    --accent-hover: #818cf8;
    --waveform-color: #6366f1;
    --waveform-played: #a5b4fc;
    --spectrogram-bg: #0a0a0f;
    --cue-hot: #ef4444;
    --cue-loop: #22c55e;
    --energy-low: #3b82f6;
    --energy-high: #ef4444;
    --mood-happy: #fbbf24;
    --mood-sad: #6366f1;
    --vocal-yes: #22c55e;
    --vocal-no: #64748b;
    --border: #2a2a3a;
    --surface: #16161f;
}
```

Built-in themes: **Midnight** (deep dark), **Carbon** (neutral dark), **Dawn** (light), **Neon** (dark + vibrant accents). Custom themes via CSS variable overrides.

---

## 7. Custom Genre Training — How It Works

This section details how you train RecoDeck to understand YOUR genre taxonomy.

### Step 1: Define Your Genres

Create your taxonomy in the app. Example:

```
My Genres:
├── Tech House
│   ├── Deep Tech
│   ├── Minimal Tech House
│   └── Peak Time Tech
├── Progressive
│   ├── Melodic Progressive
│   └── Dark Progressive
├── Deep House
│   ├── Organic Deep
│   └── Afro Deep
└── Techno
    ├── Melodic Techno
    └── Driving Techno
```

### Step 2: Bootstrap from Discogs (Optional)

RecoDeck can auto-suggest an initial mapping from Discogs 400 styles to your genres:

| Discogs Style | → Your Genre |
|---------------|-------------|
| Electronic---Tech House | Tech House (general) |
| Electronic---Minimal | Minimal Tech House |
| Electronic---Deep House | Deep House (general) |
| Electronic---Progressive House | Melodic Progressive |
| Electronic---Techno | Techno (general) |

You review and correct these mappings. This gives you a rough starting point.

### Step 3: Manual Labeling

For precision, you label tracks manually:
- Right-click track → "Set Genre" → pick from your taxonomy
- Or drag tracks into genre folders in the sidebar
- Target: **50-100 labeled tracks per genre** for good accuracy
- The UI shows a progress bar: "Deep Tech: 47/50 labeled (need 3 more)"

### Step 4: Training

Click "Train Genre Model" → the app:
1. Loads Effnet-Discogs embeddings (512-dim) for all labeled tracks
2. Trains a small MLP neural network: `512 → 256 → 128 → N_genres`
3. Training takes ~10-30 seconds on CPU for 500-1000 labeled tracks
4. Exports model to ONNX (~1MB) and stores in `models/custom-genre/`
5. Shows training accuracy and per-genre precision

### Step 5: Auto-Classification

After training:
- Every new track is automatically classified into your genres
- Each classification has a confidence score (0-100%)
- Low-confidence tracks (<60%) are flagged for manual review
- You correct mistakes → model improves over time

### Step 6: Active Learning

The app suggests which tracks to label next for maximum model improvement:
- Tracks where the model is most uncertain (close to 50% between two genres)
- Tracks from underrepresented genres
- Recently added tracks that look unusual

---

## 8. AI Chat & Playlist Generation

### How It Works (Technical)

```
User Input: "Create me a Sunday chill tech house playlist, about 2 hours"
    │
    ▼
Prepare Context for Claude API:
    │  • Library summary: genre distribution, BPM range, total tracks
    │  • Available filters: genres, moods, instruments, BPM, key, etc.
    │  • Function definitions: search_tracks(), create_playlist(), etc.
    │
    ▼
Claude API (with tool use):
    │  Claude understands the request and calls tools:
    │  1. search_tracks(genre="Tech House", energy_max=0.6, is_vocal=false, bpm=[120,126])
    │  2. search_tracks(genre="Deep Tech", mood_happy_min=0.4, bpm=[120,126])
    │  3. create_playlist(name="Sunday Chill Tech", tracks=[...], order_by="energy_asc")
    │
    ▼
Execute Locally:
    │  Tauri backend runs the SQL queries against your library
    │  Assembles playlist, orders tracks for flow
    │
    ▼
Return to User:
    │  "Created 'Sunday Chill Tech' — 26 tracks, 1h 58m"
    │  [View Playlist] [Edit] [Regenerate]
```

### What Claude Sees (Context)

Claude does NOT see your audio files. It receives:
- A summary of your library (counts per genre, BPM distribution, etc.)
- The analysis metadata for tracks (BPM, key, genre, mood, energy, instruments)
- Tool definitions to search and filter your library

### Cost Estimate

- Each playlist generation ≈ 1-3 API calls ≈ ~$0.01-0.05 per request
- Refinement ("make it darker") ≈ 1 additional call ≈ ~$0.01
- Monthly cost for moderate use: ~$1-5

---

## 9. Smart Playlist Rules

```json
{
  "match": "all",
  "rules": [
    { "field": "bpm", "operator": "between", "value": [124, 128] },
    { "field": "key", "operator": "in", "value": ["8A", "7A", "9A", "8B"] },
    { "field": "discogs_style", "operator": "contains", "value": "Tech House" },
    { "field": "genre", "operator": "is", "value": "Deep Tech" },
    { "field": "tag", "operator": "has_any", "value": ["peak-time", "dark"] },
    { "field": "danceability", "operator": "greater_than", "value": 0.7 },
    { "field": "mood_aggressive", "operator": "less_than", "value": 0.5 },
    { "field": "is_vocal", "operator": "is", "value": false },
    { "field": "instrument", "operator": "has", "value": "synthesizer" },
    { "field": "energy", "operator": "greater_than", "value": 0.7 },
    { "field": "rating", "operator": "greater_than", "value": 3 }
  ]
}
```

Available fields: `bpm`, `key`, `genre`, `discogs_style`, `tag`, `energy`, `danceability`, `mood_happy`, `mood_aggressive`, `is_vocal`, `instrument`, `loudness`, `rating`, `artist`, `label`, `date_added`, `play_count`, `duration`, `format`.

---

## 10. Mobile Companion — Architecture

### Desktop Server (runs inside Tauri)

```
axum HTTP Server (port 8484 default)
    │
    ├── GET  /api/tracks              → List all tracks (paginated, with metadata)
    ├── GET  /api/tracks/:id          → Track detail (full analysis data)
    ├── GET  /api/tracks/search?q=    → Search by title/artist/genre/BPM/key
    ├── GET  /api/playlists           → List playlists
    ├── GET  /api/playlists/:id       → Playlist tracks
    ├── GET  /api/stream/:id          → Audio stream (HTTP range requests)
    ├── GET  /api/waveform/:id        → Waveform data for visualization
    ├── GET  /api/artwork/:id         → Cover art image
    │
    └── WebSocket /ws                 → Real-time: now playing, library updates
```

### Network Modes

**Local Network (primary):**
- Desktop broadcasts via mDNS (e.g., `recodeck.local:8484`)
- Phone discovers automatically on same WiFi
- Zero configuration needed
- Best quality: no bandwidth limitations

**Internet (optional):**
- Tailscale: Install on both devices → private network → connect via Tailscale IP
- Cloudflare Tunnel: Free, no port forwarding → `https://your-recodeck.trycloudflare.com`
- User chooses in settings which remote method to use

### Android App (MVP)

Simple, focused feature set:
- Song list with search (title, artist, genre, BPM)
- Filter by genre, mood, energy
- Tap to play → streams from desktop
- Basic player: play/pause, seek, next/previous, volume
- Waveform display (received from desktop API)
- Connection status indicator

---

## 11. Development Roadmap

| Phase | Focus | Est. Duration | Key Deliverable |
|-------|-------|--------------|-----------------|
| **1** | Foundation | 4-6 weeks | Working player + library browser |
| **2** | Deep Analysis | 5-7 weeks | Full analysis pipeline + spectrogram + auto-categorize |
| **3** | Organization | 3-4 weeks | Tags, smart playlists, cue points, duplicates |
| **4** | AI Features | 5-7 weeks | Custom genre training + similarity + AI chat/command |
| **5** | DJ Integration | 2-3 weeks | Rekordbox/Traktor export/import |
| **6** | Mobile Companion | 4-6 weeks | Android streaming app |
| **7** | Polish | 3-4 weeks | Themes, shortcuts, advanced UX |

**Total estimated: 26-37 weeks** (part-time alongside other work)

---

## 12. Testing & Validation Gates

Every milestone must pass its gate before proceeding. The developer must explicitly approve.

### Phase 1 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 1.1 | Project scaffold | App launches, shows empty window, no errors in console |
| 1.2 | SQLite setup | Can create/read/update/delete records via Rust tests |
| 1.3 | Library scanner | Scan a test folder → tracks appear in DB with correct metadata |
| 1.4 | Track table UI | Table renders 1000+ tracks smoothly (60fps scroll) |
| 1.5 | Audio playback | Play/pause/seek works for MP3, FLAC, WAV, AIFF |
| 1.6 | Waveform overview | Waveform renders and syncs with playback position |
| 1.7 | Search + sort | Search finds tracks by title/artist, columns sort correctly |
| 1.8 | Settings | Can add/remove library folders, changes persist after restart |

**Phase 1 Complete:** Developer can add their music folder, browse tracks, search, and play any track with working waveform.

### Phase 2 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 2.1 | Mel spectrogram | Spectrogram computation matches expected output for test audio |
| 2.2 | BPM detection | BPM within ±1 of known BPM for 10 test tracks |
| 2.3 | Key detection | Key correct for 7/10 test tracks (industry standard accuracy) |
| 2.4 | Waveform peaks | Overview + detail waveforms render correctly, zoom works |
| 2.5 | Loudness | LUFS values within ±0.5 of reference tool for test tracks |
| 2.6 | ONNX integration | Effnet-Discogs model loads and produces output (any output) |
| 2.7 | Discogs styles | Top 5 Discogs styles are reasonable for 10 test tracks |
| 2.8 | Mood + dance + voice + instruments | All models produce output, results are plausible |
| 2.9 | Embeddings | Embeddings stored, similar tracks have similar embeddings |
| 2.10 | Chromaprint | Fingerprints generated, duplicate detection finds known duplicates |
| 2.11 | AcoustID/MusicBrainz | At least 5/10 test tracks get correct metadata from lookup |
| 2.12 | Spectrogram UI | Spectrogram renders, syncs with playback, zoom and color map work |
| 2.13 | Analysis panel | All analysis data visible in UI for any selected track |
| 2.14 | Auto-categorize | Drop new file in folder → appears analyzed in library within 15s |

**Phase 2 Complete:** Developer drops a new track into their folder and within seconds it appears fully analyzed with BPM, key, genre, mood, instruments, and spectrogram.

### Phase 3 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 3.1 | Tag system | Create tags, assign to tracks, filter by tags |
| 3.2 | Smart playlists | Create smart playlist with 3+ rules, auto-populates correctly |
| 3.3 | Manual playlists | Create, add tracks, reorder via drag & drop |
| 3.4 | Cue points | Set cue point on waveform, save, reload, visible after restart |
| 3.5 | Rating | Rate track, sort by rating, rating persists |
| 3.6 | Columns | Hide/show/reorder columns, settings persist |
| 3.7 | Duplicates | Detect and show known duplicate pair |
| 3.8 | Missing files | Detect removed file, show in UI, relocate option works |

### Phase 4 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 4.1 | Genre taxonomy | Create custom genres, assign tracks manually |
| 4.2 | Genre training | Train model on 50+ labeled tracks per genre, accuracy > 70% |
| 4.3 | Auto-classify | New tracks get auto-classified, confidence scores shown |
| 4.4 | Similarity | "Find similar" returns acoustically similar tracks |
| 4.5 | Similarity map | 2D visualization renders, clusters are visually meaningful |
| 4.6 | Command bar | Cmd+K opens, can search tracks and execute basic commands |
| 4.7 | AI chat | Chat panel opens, can generate playlist from natural language |
| 4.8 | Chat refinement | Multi-turn works: "make it darker" modifies existing playlist |

### Phase 5 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 5.1 | Rekordbox export | Export playlist → opens correctly in Rekordbox with metadata |
| 5.2 | Rekordbox import | Import Rekordbox XML → tracks and playlists appear in RecoDeck |
| 5.3 | Traktor export/import | Same as above but for Traktor NML |
| 5.4 | Set builder | Can order tracks, see BPM/key/energy flow visualization |

### Phase 6 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 6.1 | Desktop server | axum server starts, serves track list on localhost |
| 6.2 | Audio streaming | Can stream and seek audio via HTTP from browser |
| 6.3 | mDNS discovery | Phone finds desktop server automatically on WiFi |
| 6.4 | Android app MVP | Browse, search, stream, and play one track end-to-end |
| 6.5 | Remote access | Connect via Tailscale/Cloudflare and stream successfully |

### Phase 7 Gates

| # | Milestone | Validation Gate |
|---|-----------|----------------|
| 7.1 | Themes | Switch between 4 built-in themes, create custom theme |
| 7.2 | Keyboard shortcuts | Navigate and control playback entirely by keyboard |
| 7.3 | Drag & drop | Drag tracks to playlists, drag files from OS to import |
| 7.4 | Statistics | Dashboard shows accurate library stats and visualizations |

---

## 13. File Structure

```
recodeck/
├── src-tauri/                     # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── commands/             # Tauri IPC command handlers
│   │   │   ├── library.rs        # Scan, import, metadata
│   │   │   ├── playback.rs       # Audio streaming
│   │   │   ├── analysis.rs       # BPM, key, waveform, spectrogram
│   │   │   ├── ai.rs             # Embeddings, classification, mood, chat
│   │   │   ├── fingerprint.rs    # Chromaprint, AcoustID, MusicBrainz
│   │   │   ├── export.rs         # Rekordbox/Traktor
│   │   │   └── server.rs         # Mobile streaming server commands
│   │   ├── db/                   # Database layer
│   │   │   ├── mod.rs
│   │   │   ├── migrations/       # SQL migration files
│   │   │   └── queries.rs        # Typed query functions
│   │   ├── audio/                # Audio processing (DSP)
│   │   │   ├── decoder.rs        # Symphonia wrapper
│   │   │   ├── bpm.rs            # Tempo detection
│   │   │   ├── key.rs            # Key detection
│   │   │   ├── waveform.rs       # Peak generation
│   │   │   ├── spectrogram.rs    # Mel spectrogram computation
│   │   │   ├── loudness.rs       # LUFS metering
│   │   │   └── fingerprint.rs    # Chromaprint wrapper
│   │   ├── ai/                   # ML pipeline
│   │   │   ├── mod.rs            # Model loader, session manager
│   │   │   ├── effnet.rs         # Effnet-Discogs (styles + embeddings)
│   │   │   ├── mood.rs           # Mood classifiers
│   │   │   ├── danceability.rs   # Danceability model
│   │   │   ├── voice.rs          # Voice/instrumental classifier
│   │   │   ├── instruments.rs    # Instrument recognition
│   │   │   ├── classifier.rs     # Custom genre classification
│   │   │   ├── similarity.rs     # Cosine similarity search
│   │   │   └── chat.rs           # Claude API integration for chat/commands
│   │   ├── server/               # Mobile companion server
│   │   │   ├── mod.rs            # axum server setup
│   │   │   ├── routes.rs         # API routes
│   │   │   ├── streaming.rs      # Audio streaming with range requests
│   │   │   └── mdns.rs           # mDNS broadcast for local discovery
│   │   ├── external/             # External API clients
│   │   │   ├── acoustid.rs       # AcoustID API
│   │   │   ├── musicbrainz.rs    # MusicBrainz API
│   │   │   └── claude.rs         # Claude API client
│   │   └── formats/              # DJ software formats
│   │       ├── rekordbox.rs      # XML read/write
│   │       └── traktor.rs        # NML read/write
│   ├── models/                   # ONNX model files (~41MB total)
│   │   ├── effnet-discogs.onnx
│   │   ├── mood-happy-sad.onnx
│   │   ├── mood-aggressive.onnx
│   │   ├── danceability.onnx
│   │   ├── voice-instrumental.onnx
│   │   ├── instrument-recognition.onnx
│   │   └── custom-genre/         # User-trained models stored here
│   └── Cargo.toml
├── src/                          # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/               # Shell, sidebar, panels
│   │   ├── library/              # Track table, search, filters
│   │   ├── player/               # Playback controls, waveform
│   │   ├── spectrogram/          # Spectrogram Canvas component
│   │   ├── analysis/             # Analysis panel, BPM/key displays, Camelot
│   │   ├── playlists/            # Playlist views, smart editor
│   │   ├── ai/                   # Genre labeling, similarity map, chat panel
│   │   ├── command-bar/          # Cmd+K command palette
│   │   └── settings/             # Preferences, themes
│   ├── hooks/
│   │   ├── useAudio.ts           # Playback state
│   │   ├── useLibrary.ts         # Library queries
│   │   ├── useAnalysis.ts        # Analysis queue state
│   │   ├── useAIChat.ts          # Chat state and Claude API interaction
│   │   └── useTauri.ts           # IPC wrappers
│   ├── store/
│   │   ├── playerStore.ts
│   │   ├── libraryStore.ts
│   │   ├── analysisStore.ts
│   │   ├── chatStore.ts
│   │   └── uiStore.ts
│   ├── styles/
│   │   ├── themes/               # Theme CSS variable files
│   │   └── globals.css
│   └── types/                    # TypeScript interfaces
├── mobile/                       # Mobile companion app (Phase 6)
│   ├── src/
│   └── ...
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 14. Key Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Audio playback | Web Audio API (frontend) | Low latency, built-in visualization APIs |
| Audio analysis (DSP) | Rust (backend) | CPU-intensive, benefits from native speed |
| Mel spectrogram | Custom Rust (FFT + mel filterbank) | Matches Essentia's preprocessing, no Python dep |
| AI models | MTG/Essentia models → ONNX | Best-in-class music analysis, free (CC BY-NC-SA 4.0) |
| AI inference | ONNX Runtime via `ort` (Rust) | Universal model format, native speed, free |
| AI chat | Claude API with tool use | Natural language → structured queries, cost-effective |
| Audio fingerprinting | Chromaprint | De facto standard, AcoustID compatible |
| Metadata enrichment | MusicBrainz API | Largest free music metadata database |
| Database | SQLite (single file) | No server, portable, great query support |
| Mobile server | axum (Rust) | Lightweight, async, same language as backend |
| Remote access | Tailscale / Cloudflare Tunnel | Free, secure, no port forwarding |
| IPC | Tauri invoke + events | Type-safe, async, supports streaming events |
| Waveform rendering | HTML Canvas | Best performance for real-time drawing |
| Spectrogram rendering | Canvas (WebGL optional) | Canvas for simplicity, WebGL for perf if needed |
| Virtual scrolling | react-window | Handles 10K+ rows smoothly |
| Theme system | CSS custom properties | Runtime switching, no re-render needed |

---

## 15. Licensing Notes

- **Essentia models (MTG):** CC BY-NC-SA 4.0 — free for non-commercial use, proprietary license available on request
- **Chromaprint:** LGPL 2.1 — can be used in commercial software if linked as a shared library
- **AcoustID API:** Free for non-commercial use, API key required
- **MusicBrainz API:** Free, rate-limited (1 req/sec), CC0 data
- **Claude API:** Pay-per-use, see Section 8 for cost estimates

---

## 16. Open Questions & Future Considerations

- **Cloud sync:** Potential for syncing library metadata across devices
- **Plugin system:** Allow community extensions
- **Streaming integration:** Connect to Beatport/Spotify for preview and metadata enrichment
- **Collaborative playlists:** Share playlists with other RecoDeck users
- **Hardware integration:** MIDI controller support for browsing/tagging
- **Stem separation:** Use Demucs to separate vocals/drums/bass/other for preview
- **Harmonic analysis:** Detect key changes within a track
- **Commercial licensing:** If the app becomes a product, negotiate MTG model licensing
- **iOS companion:** After Android is proven, port to iOS

---

*This is a living document. Update as decisions are made and features evolve.*
