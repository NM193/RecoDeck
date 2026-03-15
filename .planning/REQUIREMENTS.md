# Requirements: RecoDeck

**Defined:** 2026-03-14
**Core Value:** Smart, AI-powered music library management that understands DJ workflow — energy flow, key compatibility, and mood progression

## v1.5 Requirements

Requirements for Windows Support milestone. Each maps to roadmap phases.

### Build & Compilation

- [x] **BILD-01**: App compiles on Windows with `x86_64-pc-windows-msvc` target including Aubio bindgen
- [x] **BILD-02**: `build:win` npm script produces a working Windows build

### Runtime Fixes

- [ ] **RNTM-01**: Mobile companion streaming works on Windows (fix `streaming.rs` canonicalize UNC prefix)
- [ ] **RNTM-02**: Mobile companion PWA resources resolve correctly on Windows (fix `find_mobile_dist()`)

### Installer

- [ ] **INST-01**: NSIS installer installs and uninstalls RecoDeck cleanly on Windows
- [ ] **INST-02**: `tauri.conf.json` has Windows NSIS bundle configuration

### CI/CD

- [ ] **CICD-01**: GitHub Actions `build-windows` job produces Windows release artifacts
- [ ] **CICD-02**: Windows build includes LLVM/libclang setup for Aubio bindgen
- [ ] **CICD-03**: Release workflow uploads Windows artifacts alongside macOS

### Auto-Updater

- [ ] **UPDT-01**: `latest.json` manifest includes `windows-x86_64` platform entry
- [ ] **UPDT-02**: `generate-update-manifest.js` supports multi-platform output

## v1.6 Requirements

Requirements for Update Notifications milestone. Each maps to roadmap phases.

### Updater Configuration

- [x] **UCFG-01**: `tauri.conf.json` has `"dialog": false` so JS API receives update events
- [x] **UCFG-02**: `tauri.conf.json` has `"createUpdaterArtifacts": true` (v1Compatible removed)

### Auto-Check & Toast

- [x] **UCHK-01**: App checks for updates on launch after a 3-5 second delay (check only, never auto-install)
- [x] **UCHK-02**: Update-available toast notification appears with Install and Later buttons
- [x] **UCHK-03**: Install button routes to Settings > About for user-initiated download and restart

### What's New Modal

- [x] **WHNW-01**: `getChangesForVersion()` returns categorized object `{ added, changed, fixed }` instead of flat `string[]`
- [x] **WHNW-02**: What's New modal displays three labeled sections (New / Fixes / Changes)
- [x] **WHNW-03**: What's New modal does not fire on fresh install (null guard on `last_seen_version`)
- [x] **WHNW-04**: Duplicate update button removed from WhatsNewDialog

### CI Release Pipeline

- [ ] **CIUP-01**: `latest.json` contains both `darwin-aarch64` and `windows-x86_64` platform entries
- [ ] **CIUP-02**: `generate-update-manifest.js` supports `--platform` fragment mode and `--merge` mode

### Polish (P2)

- [ ] **UPOL-01**: Section icons in What's New modal (Plus for Added, Wrench for Fixed, ArrowLeftRight for Changed)
- [ ] **UPOL-02**: Suppress update toast during active audio playback

## v1.7 Requirements

Requirements for Pagination Removal milestone. Each maps to roadmap phases.

### Loading

- [x] **LOAD-03**: App loads ALL tracks on startup in a single fetch (no batched pagination)
- [x] **LOAD-04**: No scroll-triggered loading — full list available immediately after initial load
- [x] **LOAD-05**: Loading spinner shows while fetch runs, then full list renders

### Cleanup

- [x] **CLNP-01**: All pagination state and logic removed (`hasMoreTracks`, `isLoadingMore`, `onLoadMore`, scroll detection)
- [x] **CLNP-02**: Footer shows simple "{count} tracks · sorted by {field}" (no "Scroll for more" or "Loading more...")

### Integrity

- [x] **INTG-01**: Virtual scrolling handles the full array smoothly (no UI jank)
- [x] **INTG-02**: Sorting works on the complete dataset immediately
- [x] **INTG-03**: Folder/playlist/search views unchanged

## v1.8 Requirements

Requirements for AI Chat Persistence milestone. Each maps to roadmap phases.

### Database

- [x] **DB-01**: App creates `ai_conversations` table on startup (id TEXT PK, title TEXT, created_at INTEGER)
- [x] **DB-02**: App creates `ai_messages` table on startup (id TEXT PK, conversation_id TEXT FK, role TEXT, content TEXT, metadata_json TEXT NULL, created_at INTEGER)

### Conversation Management

- [x] **CONV-01**: User can create a new conversation (returns conversation_id)
- [x] **CONV-02**: User can list all conversations (ordered by most recent)
- [x] **CONV-03**: User can load messages from a previous conversation
- [x] **CONV-04**: User can delete a conversation (and its messages)
- [x] **CONV-05**: Conversation auto-titles from first user message (truncated to 50 chars)

### Message Persistence

- [x] **MSG-01**: Every sent user message is saved to the database
- [x] **MSG-02**: Every received AI response is saved to the database
- [x] **MSG-03**: Messages preserve role, content, and optional metadata

### Frontend UI

- [ ] **UI-01**: AIChatPanel shows a collapsible conversation list sidebar
- [ ] **UI-02**: User can click "New Chat" to start a fresh conversation
- [ ] **UI-03**: User can click a previous conversation to load its messages
- [ ] **UI-04**: On app mount, conversation list loads and last active conversation restores

### Compatibility

- [x] **COMPAT-01**: Existing AI commands (chat, playlist, recommendations) work unchanged with persistence

## Future Requirements

### Chat Enhancements

- **CHAT-01**: User can rename a conversation title
- **CHAT-02**: User can search across conversation history
- **CHAT-03**: User can export conversation to text file

### Windows Enhancements

- **WINS-01**: Windows code signing with EV/OV certificate (eliminates SmartScreen warning)
- **WINS-02**: Windows file association for audio formats (.mp3, .flac, etc.)
- **WINS-03**: Windows taskbar integration (thumbnail toolbar, progress bar)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud sync of conversations | Local-first architecture — no cloud dependency |
| Multi-user conversations | Single-user desktop app |
| Modifications to system_prompt.rs or context_builder.rs | Explicit constraint — AI behavior stays unchanged |
| Windows code signing | $300-600/yr cert cost disproportionate for small DJ friend group; SmartScreen "Run Anyway" is acceptable |
| Linux support | Separate milestone if needed; Windows is the priority |
| ARM64 Windows | x86_64 covers the target audience; ARM64 can be added later |
| Windows Store distribution | Not needed for personal/friend distribution |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BILD-01 | Phase 17 | Complete |
| BILD-02 | Phase 17 | Complete |
| RNTM-01 | Phase 18 | Pending |
| RNTM-02 | Phase 18 | Pending |
| INST-01 | Phase 19 | Pending |
| INST-02 | Phase 19 | Pending |
| CICD-01 | Phase 19 | Pending |
| CICD-02 | Phase 19 | Pending |
| CICD-03 | Phase 19 | Pending |
| UPDT-01 | Phase 20 | Pending |
| UPDT-02 | Phase 20 | Pending |

**v1.5 Coverage:**
- v1.5 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

### v1.6 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UCFG-01 | Phase 21 | Complete |
| UCFG-02 | Phase 21 | Complete |
| UCHK-01 | Phase 22 | Complete |
| UCHK-02 | Phase 22 | Complete |
| UCHK-03 | Phase 22 | Complete |
| WHNW-01 | Phase 23 | Complete |
| WHNW-02 | Phase 23 | Complete |
| WHNW-03 | Phase 23 | Complete |
| WHNW-04 | Phase 23 | Complete |
| CIUP-01 | Phase 24 | Pending |
| CIUP-02 | Phase 24 | Pending |
| UPOL-01 | Phase 25 | Pending |
| UPOL-02 | Phase 25 | Pending |

**v1.6 Coverage:**
- v1.6 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

### v1.7 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOAD-03 | Phase 26 | Complete |
| LOAD-04 | Phase 26 | Complete |
| LOAD-05 | Phase 26 | Complete |
| CLNP-01 | Phase 26 | Complete |
| CLNP-02 | Phase 26 | Complete |
| INTG-01 | Phase 26 | Complete |
| INTG-02 | Phase 26 | Complete |
| INTG-03 | Phase 26 | Complete |

**v1.7 Coverage:**
- v1.7 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

### v1.8 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 27 | Complete |
| DB-02 | Phase 27 | Complete |
| CONV-01 | Phase 28 | Complete |
| CONV-02 | Phase 28 | Complete |
| CONV-03 | Phase 28 | Complete |
| CONV-04 | Phase 28 | Complete |
| CONV-05 | Phase 28 | Complete |
| MSG-01 | Phase 28 | Complete |
| MSG-02 | Phase 28 | Complete |
| MSG-03 | Phase 28 | Complete |
| UI-01 | Phase 29 | Pending |
| UI-02 | Phase 29 | Pending |
| UI-03 | Phase 29 | Pending |
| UI-04 | Phase 29 | Pending |
| COMPAT-01 | Phase 28 | Complete |

**v1.8 Coverage:**
- v1.8 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-15 after v1.8 roadmap created (phases 27-29)*
