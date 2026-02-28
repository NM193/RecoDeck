# Phase 3: AI Playlists - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate smart playlists from a seed track with AI that understands DJ-compatible BPM, key (Camelot wheel), and energy flow. Users can pick an energy direction and target duration, preview the result with transition indicators, edit tracks, and save to their library.

</domain>

<decisions>
## Implementation Decisions

### Seed track trigger
- Right-click context menu on tracks in the track table — add "Generate AI Playlist" option
- Also accessible from a button on the Now Playing bar (for the currently playing track)
- Both entry points open the same config dialog
- Dialog shows: seed track info (name, BPM, key), energy direction picker, and duration picker
- One more click to start generation

### Energy direction controls
- Segmented control (iOS-style) with three options: Build Up | Maintain | Wind Down
- Default selection: Maintain
- Energy direction affects both BPM progression and key progression (Camelot wheel movement)
  - Build Up = BPM gradually increases + keys move clockwise on Camelot wheel
  - Wind Down = BPM decreases + keys move counter-clockwise
  - Maintain = stay in same BPM/key neighborhood
- Quick regenerate: after seeing results, user can change energy direction and regenerate without reopening the dialog

### Playlist preview
- Results appear in a modal/dialog overlay (not in the AI chat panel)
- Each track row shows: Title, Artist, BPM, Key
- Transition indicators between tracks: BPM delta and key relationship (compatible/clash) shown as arrows/badges
- AI reasoning shown as collapsible details at top of modal (hidden by default, expandable)
- Play button per track row for previewing individual tracks before saving
- User can remove tracks before saving (X button per track) — cannot reorder or add
- Buttons: Save / Regenerate / Cancel

### Playlist sizing
- Duration-based presets: 30 min / 1 hr / 1.5 hr / 2 hr
- Shown as preset buttons in the config dialog
- If library doesn't have enough compatible tracks for requested duration: generate what's available and show a warning note (e.g., "Generated 45 min of 1 hr requested — not enough compatible tracks in library")

### Claude's Discretion
- Exact prompt engineering and system prompt updates for energy-aware generation
- How to calculate duration estimates from track durations
- Transition indicator design (icons, colors, badges)
- Modal layout and responsive behavior
- Post-processing validation of AI output (BPM jumps, key clashes)

</decisions>

<specifics>
## Specific Ideas

- The existing `PlayerAIChat` with text-based prompting should continue working alongside the new seed-track flow — both are valid entry points
- The existing `PlaylistResponse` struct already returns `name`, `description`, `track_ids`, `reasoning` — extend as needed
- Duration-based sizing is more natural for DJs than track count — "I need a 1-hour set" is how DJs think

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ClaudeClient.generate_playlist()` in `src-tauri/src/ai/claude_client.rs` — takes prompt + track context + system prompt, returns `PlaylistResponse`
- `TrackContextBuilder.build_smart_context()` in `src-tauri/src/ai/context_builder.rs` — filters library tracks by prompt keywords, limits to 5K tracks
- `SYSTEM_PROMPT` in `src-tauri/src/ai/system_prompt.rs` — already includes Camelot wheel rules, BPM transitions, energy flow concepts
- `useAIStore` in `src/store/aiStore.ts` — Zustand store with `generatePlaylist()`, `pendingPlaylist` state, `isGenerating` loading state
- `PlayerAIChat` in `src/components/ai/PlayerAIChat.tsx` — existing chat UI with pending playlist display and save flow
- `tauriApi.createPlaylist()` + `tauriApi.addTrackToPlaylist()` — playlist CRUD already wired
- Right-click context menus already exist on `FolderTree.tsx` and `TrackTable.tsx`
- `TrackAnalysis` has `bpm` and `musical_key` fields available per track

### Established Patterns
- AI context caching: `AppState.ai_context_cache` stores serialized library JSON, rebuilt on demand
- Claude API flow: full library JSON as context → Claude returns JSON with `track_ids` → parse and present
- Regex intent detection: `/create|make|generate|build.*playlist/` in chat input triggers playlist mode vs chat mode
- Pending playlist → user names it → `createPlaylist` + `addTrackToPlaylist` loop → `onPlaylistCreated` callback refreshes sidebar

### Integration Points
- New context menu item in `TrackTable.tsx` right-click handler
- New button on `Player.tsx` Now Playing bar
- New `AIPlaylistDialog` component (generation config + result preview modal)
- `ai_generate_playlist` Tauri command needs to accept seed track ID, energy direction, and target duration
- `SYSTEM_PROMPT` needs energy-direction-aware instructions
- `TrackContextBuilder` may need seed-track-aware context building (prioritize similar BPM/key tracks)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ai-playlists*
*Context gathered: 2026-02-28*
