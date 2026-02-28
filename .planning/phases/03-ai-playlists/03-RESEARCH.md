# Phase 3: AI Playlists - Research

**Researched:** 2026-02-28
**Domain:** AI playlist generation — Claude API integration, React modal UI, Rust backend extension
**Confidence:** HIGH (codebase fully read; domain is extension of existing working code, not new integration)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seed track trigger:**
- Right-click context menu on tracks in the track table — add "Generate AI Playlist" option
- Also accessible from a button on the Now Playing bar (for the currently playing track)
- Both entry points open the same config dialog
- Dialog shows: seed track info (name, BPM, key), energy direction picker, and duration picker
- One more click to start generation

**Energy direction controls:**
- Segmented control (iOS-style) with three options: Build Up | Maintain | Wind Down
- Default selection: Maintain
- Energy direction affects both BPM progression and key progression (Camelot wheel movement)
  - Build Up = BPM gradually increases + keys move clockwise on Camelot wheel
  - Wind Down = BPM decreases + keys move counter-clockwise
  - Maintain = stay in same BPM/key neighborhood
- Quick regenerate: after seeing results, user can change energy direction and regenerate without reopening the dialog

**Playlist preview:**
- Results appear in a modal/dialog overlay (not in the AI chat panel)
- Each track row shows: Title, Artist, BPM, Key
- Transition indicators between tracks: BPM delta and key relationship (compatible/clash) shown as arrows/badges
- AI reasoning shown as collapsible details at top of modal (hidden by default, expandable)
- Play button per track row for previewing individual tracks before saving
- User can remove tracks before saving (X button per track) — cannot reorder or add
- Buttons: Save / Regenerate / Cancel

**Playlist sizing:**
- Duration-based presets: 30 min / 1 hr / 1.5 hr / 2 hr
- Shown as preset buttons in the config dialog
- If library doesn't have enough compatible tracks for requested duration: generate what's available and show a warning note

### Claude's Discretion
- Exact prompt engineering and system prompt updates for energy-aware generation
- How to calculate duration estimates from track durations
- Transition indicator design (icons, colors, badges)
- Modal layout and responsive behavior
- Post-processing validation of AI output (BPM jumps, key clashes)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIPL-01 | User can generate a smart playlist from a seed track using AI | New `ai_generate_playlist` Tauri command signature; `AIPlaylistDialog` component with seed track context |
| AIPL-02 | User can specify energy/mood direction (build up, wind down, maintain) | Segmented control UI in config step; energy direction passed as parameter to backend command |
| AIPL-03 | AI considers BPM compatibility when ordering tracks in a playlist | System prompt already has BPM rules; seed-track-aware context builder filters by BPM neighborhood; post-processing BPM validation |
| AIPL-04 | AI considers key compatibility (Camelot wheel) when selecting and ordering tracks | System prompt already has Camelot rules; energy direction maps to clockwise/counter-clockwise movement; post-processing key validation |
| AIPL-05 | AI considers energy flow (gradual transitions, no jarring jumps) in playlist sequence | Energy direction parameter shapes the system prompt injection; transition indicators surface violations to user |
| AIPL-06 | User can save AI-generated playlist to their library with a name of their choosing | Existing `tauriApi.createPlaylist()` + `tauriApi.addTrackToPlaylist()` loop; name input in save flow |
</phase_requirements>

---

## Summary

Phase 3 is an extension of existing, working AI infrastructure — not a greenfield integration. The Claude API client, context builder, AI Zustand store, system prompt, and playlist CRUD are all in place. The phase adds a structured seed-track entry point (context menu + player bar button), a config dialog, and a rich results modal on top of the existing `ai_generate_playlist` Tauri command.

The backend work is mostly: (1) extending the `ai_generate_playlist` command signature to accept `seed_track_id`, `energy_direction`, and `target_duration_min`; (2) making the context builder seed-track-aware (prioritize tracks near the seed's BPM and key); and (3) injecting energy-direction-specific instructions into the system prompt. The frontend work is: (1) adding context menu item and player bar button; (2) building `AIPlaylistDialog` as a two-step modal (config → results); (3) computing transition indicators from returned track data.

The Camelot wheel compatibility rules are already in `SYSTEM_PROMPT`. Duration estimation from `duration_ms` fields per track is straightforward arithmetic. Post-processing validation (flag BPM jumps > 10, flag key clashes) is pure frontend logic over the returned track list — it does not require another AI call.

**Primary recommendation:** Extend the existing `ai_generate_playlist` command with three new params; build one `AIPlaylistDialog` component; do NOT create a separate AI module or new Tauri plugin.

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/api` | existing | Tauri IPC invoke | Already used for all commands |
| `zustand` | existing | AI store state | `useAIStore` already manages `pendingPlaylist`, `isGenerating` |
| `framer-motion` | existing | Dialog open/close animations | Used in `PlayerAIChat` |
| `lucide-react` (via `Icon`) | existing | Icons (Sparkles, X, ChevronRight, etc.) | All icons via `<Icon name="...">` |
| `reqwest` (Rust) | existing | Claude API HTTP | `ClaudeClient` already uses it |
| `serde_json` (Rust) | existing | JSON (de)serialization | Used throughout AI module |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new required | — | — | All dependencies already present |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
src/
├── components/ai/
│   └── AIPlaylistDialog.tsx     # Two-step modal: config → results
src-tauri/src/commands/
│   └── ai.rs                    # Extend ai_generate_playlist command (existing file)
src-tauri/src/ai/
│   └── system_prompt.rs         # Add energy-direction prompt templates (existing file)
│   └── context_builder.rs       # Add seed-track-aware context method (existing file)
```

No new files needed on the Rust side — all work extends existing files.

### Pattern 1: Two-Step Modal (Config → Results)

**What:** A single React component with two internal views: step 1 is the config (seed track info, energy direction segmented control, duration presets), step 2 is the results (track list with transition indicators, save/regenerate/cancel).

**When to use:** When a generation flow has a setup step followed by a result preview — avoids two separate modals and simplifies state flow.

**Example skeleton:**
```tsx
// src/components/ai/AIPlaylistDialog.tsx
type DialogStep = 'config' | 'generating' | 'results';

interface AIPlaylistDialogProps {
  seedTrack: Track;
  onClose: () => void;
  onPlaylistSaved: (playlistId: number) => void;
}

export function AIPlaylistDialog({ seedTrack, onClose, onPlaylistSaved }: AIPlaylistDialogProps) {
  const [step, setStep] = useState<DialogStep>('config');
  const [energyDirection, setEnergyDirection] = useState<'build_up' | 'maintain' | 'wind_down'>('maintain');
  const [targetDurationMin, setTargetDurationMin] = useState<number>(60);
  const [result, setResult] = useState<GeneratedPlaylistWithTracks | null>(null);
  const [removedTrackIds, setRemovedTrackIds] = useState<Set<number>>(new Set());
  // ...
}
```

### Pattern 2: Extending the Tauri Command

**What:** The existing `ai_generate_playlist` command signature changes from `(state, prompt: String)` to `(state, seed_track_id: i64, energy_direction: String, target_duration_min: i32)`. The command builds a structured prompt internally from these typed params rather than accepting free text.

**Why:** The seed-track flow is structured, not free-text. Typed params enable server-side validation and seed-aware context building.

**Rust command signature:**
```rust
// src-tauri/src/commands/ai.rs
#[tauri::command]
pub async fn ai_generate_playlist(
    state: State<'_, AppState>,
    seed_track_id: i64,
    energy_direction: String, // "build_up" | "maintain" | "wind_down"
    target_duration_min: i32,
) -> Result<GeneratedPlaylist, AppError>
```

**Note:** The existing `ai_generate_playlist` is also called by `PlayerAIChat` with a free-text `prompt`. Either: (a) keep the old command as `ai_chat_generate_playlist` and add new `ai_generate_playlist_from_seed`, or (b) add optional params. Option (a) is cleaner — no ambiguity. The planner should decide at task level.

### Pattern 3: Seed-Aware Context Building

**What:** New method on `TrackContextBuilder` that accepts a seed track's BPM and Camelot key and prioritizes tracks within a compatible range.

**Example:**
```rust
// src-tauri/src/ai/context_builder.rs
pub fn build_seed_context(
    tracks: &[(Track, Option<TrackAnalysis>)],
    seed_bpm: Option<f64>,
    seed_key: Option<&str>,
    energy_direction: &str,
) -> Result<String, AppError>
```

For a 60-min set at 128 BPM (Maintain), include tracks within ±15 BPM. For Build Up, bias toward tracks at seed_bpm and above. For Wind Down, bias toward seed_bpm and below. Key filtering: include tracks on the Camelot wheel within 2 steps of the seed key.

### Pattern 4: Transition Indicator Computation

**What:** Pure frontend function that, given an ordered list of tracks with BPM and musical_key, computes the transition quality between each adjacent pair.

**Camelot wheel adjacency (confirmed from system prompt rules):**
- Adjacent same-letter: 8A ↔ 9A, 8A ↔ 7A (±1 number, same letter)
- Inner/outer circle: 8A ↔ 8B (same number, different letter)
- Energy boost: clockwise (number +1)
- Energy drop: counter-clockwise (number -1)

**TypeScript utility:**
```typescript
// Inline in AIPlaylistDialog.tsx or in a utils file
type KeyCompatibility = 'perfect' | 'compatible' | 'clash';

function getCamelotCompatibility(keyA: string, keyB: string): KeyCompatibility {
  // Parse e.g. "8A" → { num: 8, letter: 'A' }
  // perfect: same key
  // compatible: ±1 number same letter, or same number different letter
  // clash: everything else
}

function getBpmDelta(bpmA: number, bpmB: number): number {
  return Math.abs(bpmA - bpmB);
}
```

Transition indicator display: BPM delta as number with arrow (green ≤5, yellow 6–10, red >10), key compatibility as colored badge.

### Pattern 5: Duration Estimation

**What:** Sum `duration_ms` of returned track IDs (looked up from the cached track list in frontend state), display as estimated total duration.

**Where:** Frontend only — no backend call needed. The track list is already in the React app's state (loaded for the track table).

**Warning threshold:** If `estimated_minutes < target_duration_min * 0.75`, show the warning note about insufficient compatible tracks.

### Anti-Patterns to Avoid

- **Passing full free-text prompt for structured seed flow:** Typed params (seed_track_id, energy_direction, target_duration_min) are better than constructing a free-text prompt on the frontend and parsing it on the backend.
- **Making a second AI call for validation:** Post-processing BPM/key validation is pure deterministic logic — no need for an AI call.
- **Putting result display in the existing PlayerAIChat:** The CONTEXT.md explicitly calls for a modal overlay, not the chat panel. Keep them separate.
- **Fetching track data for the result preview from backend:** The frontend already has the track list in state. Map `track_ids` from the AI response against the in-memory track list instead of invoking `get_track` N times.
- **Mutating the aiStore for the dialog flow:** The new `AIPlaylistDialog` has its own local state. Only use `useAIStore` for the API key check. Don't add dialog-specific state to the global store.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Camelot wheel math | Custom wheel graph | Direct arithmetic on number+letter parsed from key string | Camelot keys are `NL` format (e.g., "8A"); ±1 on number, same letter = adjacent; same number different letter = inner/outer. Pure string parsing, no graph needed |
| Dialog/modal | Custom portal | Framer-motion `AnimatePresence` + fixed position div | Pattern already proven in `PlayerAIChat` |
| Transition badge colors | CSS color picker | Tailwind/CSS custom properties already defined | Theme is already set up with `--accent`, `--border`, etc. |
| Duration arithmetic | Library | `track.duration_ms / 1000 / 60` inline | Trivial math, no library |
| Claude API call | New HTTP client | Existing `ClaudeClient.generate_playlist()` | Already handles JSON extraction, markdown stripping, error mapping |

**Key insight:** Every building block exists. This phase is assembly, not construction.

---

## Common Pitfalls

### Pitfall 1: Context Menu Prop Drilling

**What goes wrong:** Adding `onGenerateAIPlaylist` to `TrackTableProps` requires threading the callback from App down through every intermediate component.

**Why it happens:** `TrackTable` is a generic reusable component; the AI dialog is a new concern.

**How to avoid:** Follow the existing pattern exactly — `TrackTable` accepts `onGenerateAIPlaylist?: (track: Track) => void` prop. The parent (App.tsx or equivalent) creates the handler that opens the dialog. Keep dialog state in the parent, not in TrackTable.

**Warning signs:** If you find yourself passing dialog state into TrackTable, you've gone wrong.

### Pitfall 2: track_ids Not Found in Frontend Track List

**What goes wrong:** AI returns `track_ids: [42, 107, 203]` but the frontend track list is paginated or filtered, so some IDs aren't in memory.

**Why it happens:** The track table uses paginated loading (`get_tracks_paginated`). Some tracks may not be loaded yet.

**How to avoid:** The AI context is built from ALL tracks (via `get_all_tracks` in `rebuild_context_cache`). For the result preview, fetch missing tracks by ID using `tauriApi.getTrack(id)` for any track not found in the current in-memory list, OR build a `Map<id, Track>` from all tracks loaded via a dedicated fetch for this dialog (one call: `get_all_tracks`). Given the dialog always needs full details, one `get_all_tracks` on dialog open is acceptable and simpler.

**Warning signs:** Track rows showing "Unknown" for title/artist/BPM/key.

### Pitfall 3: Energy Direction Lost in Prompt

**What goes wrong:** Energy direction enum value ("build_up", "maintain", "wind_down") is passed to the backend but the system prompt doesn't actually change, so Claude ignores it.

**Why it happens:** The system prompt is a static string. Injecting energy direction requires runtime string construction.

**How to avoid:** In `ai_generate_playlist_from_seed`, build the user message dynamically:
```rust
let energy_instruction = match energy_direction.as_str() {
    "build_up" => "BPM should GRADUALLY INCREASE. Move CLOCKWISE on the Camelot wheel. Start near seed BPM and end 10-20 BPM higher.",
    "wind_down" => "BPM should GRADUALLY DECREASE. Move COUNTER-CLOCKWISE on the Camelot wheel. End 10-20 BPM lower than seed.",
    _ => "Maintain BPM within ±8 BPM of seed. Stay in the same Camelot key neighborhood.",
};
```
Append this to the user message (not the system prompt, which is cached per conversation).

**Warning signs:** All three energy directions producing identical playlist BPM progressions.

### Pitfall 4: Claude Returns Track IDs Not in Library

**What goes wrong:** Claude hallucinates track IDs that don't exist in the library.

**Why it happens:** The AI can confabulate IDs. The track context lists IDs but large libraries truncate to 5K tracks.

**How to avoid:** After receiving `track_ids`, filter to only IDs that exist in the library (simple Set lookup). Log/surface a warning if more than 20% of returned IDs are invalid. This is the existing pattern (the system already passes track IDs and expects them back).

**Warning signs:** "Track not found" errors when building the preview list; empty result modals.

### Pitfall 5: Duration Mismatch (tracks missing duration_ms)

**What goes wrong:** Duration calculation shows 0 or severely underestimates because many tracks have `duration_ms: null`.

**Why it happens:** Duration is populated from audio file metadata during scan; some files may lack it.

**How to avoid:** In duration calculation, treat null `duration_ms` as a configurable estimate (e.g., 5 minutes = 300,000ms). Show the estimated duration as "~X min" with a note that it's approximate if any tracks have unknown duration.

**Warning signs:** Playlist showing "~0 min" for a 20-track result.

### Pitfall 6: Segmented Control Accessibility

**What goes wrong:** The iOS-style segmented control is built as styled divs with onClick, breaking keyboard navigation and screen reader semantics.

**Why it happens:** Visual-first implementation.

**How to avoid:** Use `role="radiogroup"` + `role="radio"` + `aria-checked` or build as `<input type="radio">` styled buttons. The pattern is simple and the project already uses accessible forms in `PromptModal`.

---

## Code Examples

Verified patterns from existing codebase:

### Context Menu Item (from TrackTable.tsx)
```tsx
// Pattern for adding a new context menu item
// File: src/components/TrackTable.tsx — add near existing items

// In TrackTableProps interface:
onGenerateAIPlaylist?: (track: Track) => void;

// In the context menu JSX (before closing </div> of contextMenu):
{onGenerateAIPlaylist && (
  <button
    type="button"
    className="context-menu-item"
    onClick={() => {
      onGenerateAIPlaylist(contextMenu.track);
      setContextMenu(null);
    }}
  >
    <Icon name="Sparkles" size={16} className="context-menu-icon" />
    Generate AI Playlist
  </button>
)}
```

### Player Bar Button (from Player.tsx)
```tsx
// Pattern for adding button in sc-player__right (after existing action buttons)
// currentTrack is available from usePlayerStore()

{/* Generate AI Playlist from current track */}
<button
  className="sc-player__btn sc-player__btn--action"
  onClick={() => currentTrack && onGenerateAIPlaylist?.(currentTrack)}
  disabled={!currentTrack}
  title="Generate AI Playlist from this track"
>
  <Icon name="Sparkles" size={20} />
</button>
```

### Tauri Command Invocation (from tauri-api.ts pattern)
```typescript
// In tauriApi object
async aiGeneratePlaylistFromSeed(
  seedTrackId: number,
  energyDirection: 'build_up' | 'maintain' | 'wind_down',
  targetDurationMin: number
): Promise<GeneratedPlaylist> {
  return await invoke('ai_generate_playlist_from_seed', {
    seedTrackId,
    energyDirection,
    targetDurationMin,
  });
},
```

### Rust Command Skeleton (extending ai.rs)
```rust
// src-tauri/src/commands/ai.rs
#[tauri::command]
pub async fn ai_generate_playlist_from_seed(
    state: State<'_, AppState>,
    seed_track_id: i64,
    energy_direction: String,
    target_duration_min: i32,
) -> Result<GeneratedPlaylist, AppError> {
    let api_key = get_api_key_from_db(&state)?
        .ok_or(AppError::AiNoApiKey)?;

    // Get seed track analysis (BPM + key)
    let (seed_bpm, seed_key) = {
        let db_guard = state.db.lock()...;
        let db = db_guard.as_ref()...;
        let analysis = db.get_track_analysis(seed_track_id)
            .map_err(|e| AppError::Database(...))?;
        let track = db.get_track(seed_track_id)...;
        (analysis.as_ref().and_then(|a| a.bpm),
         analysis.as_ref().and_then(|a| a.musical_key.clone()))
    };

    // Build seed-aware context
    let all_tracks = get_all_tracks_with_analysis(&state)?;
    let track_context = TrackContextBuilder::build_seed_context(
        &all_tracks, seed_bpm, seed_key.as_deref(), &energy_direction
    )?;

    // Build prompt
    let energy_instruction = match energy_direction.as_str() {
        "build_up" => "BPM should gradually increase. Move clockwise on Camelot wheel.",
        "wind_down" => "BPM should gradually decrease. Move counter-clockwise on Camelot wheel.",
        _ => "Maintain BPM within ±8 of seed. Stay in same Camelot neighborhood.",
    };

    let target_tracks = estimate_track_count(target_duration_min); // rough estimate
    let prompt = format!(
        "Generate a {}-minute DJ set starting from seed track ID {}. {} Select approximately {} tracks. Return track_ids in play order.",
        target_duration_min, seed_track_id, energy_instruction, target_tracks
    );

    let client = ClaudeClient::new(api_key);
    let response = client.generate_playlist(prompt, track_context, SYSTEM_PROMPT.to_string()).await?;

    Ok(GeneratedPlaylist {
        name: response.name,
        description: response.description,
        track_ids: response.track_ids,
        reasoning: response.reasoning,
    })
}
```

### Camelot Wheel Compatibility (frontend utility)
```typescript
// Inline in AIPlaylistDialog.tsx

interface CamelotKey { num: number; letter: 'A' | 'B'; }

function parseCamelot(key: string): CamelotKey | null {
  const match = key.match(/^(\d{1,2})([AB])$/i);
  if (!match) return null;
  return { num: parseInt(match[1]), letter: match[2].toUpperCase() as 'A' | 'B' };
}

function getKeyCompatibility(keyA: string, keyB: string): 'perfect' | 'compatible' | 'clash' {
  if (keyA === keyB) return 'perfect';
  const a = parseCamelot(keyA);
  const b = parseCamelot(keyB);
  if (!a || !b) return 'clash';
  // Same letter, ±1 number (wrap 12→1)
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return 'compatible'; // 11 = 12-1 wrap
  }
  // Same number, different letter (inner/outer)
  if (a.num === b.num && a.letter !== b.letter) return 'compatible';
  return 'clash';
}
```

### Transition Indicator Display Pattern
```tsx
// Inside AIPlaylistDialog.tsx results step
// Between each track row, render a transition indicator

function TransitionIndicator({ bpmDelta, keyCompat }: {
  bpmDelta: number;
  keyCompat: 'perfect' | 'compatible' | 'clash';
}) {
  const bpmColor = bpmDelta <= 5 ? 'green' : bpmDelta <= 10 ? 'yellow' : 'red';
  const keyColor = keyCompat === 'perfect' ? 'green' : keyCompat === 'compatible' ? 'yellow' : 'red';

  return (
    <div className="transition-indicator">
      <span style={{ color: bpmColor }}>±{bpmDelta} BPM</span>
      <span style={{ color: keyColor }}>{keyCompat}</span>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Free-text prompt only for playlist gen | Seed-track typed params + structured prompt | Phase 3 (now) | Predictable, validatable inputs; no prompt injection risk |
| Single-use 30s stream tickets (MOBL-07) | 10-min multi-use tickets | Phase 2 | Already documented; not relevant to Phase 3 |
| Static system prompt | Static base + dynamic energy injection in user message | Phase 3 (now) | Energy direction actually influences output |

**Note on model:** `CLAUDE_MODEL` is `claude-sonnet-4-20250514` (confirmed in `claude_client.rs`). This is the current model as of Phase 1 quality fix. No change needed.

---

## Open Questions

1. **Rename vs. new command for ai_generate_playlist**
   - What we know: `ai_generate_playlist(prompt: String)` is the current signature, called from `useAIStore.generatePlaylist()` in `PlayerAIChat`.
   - What's unclear: Should Phase 3 keep the old signature for `PlayerAIChat` backward compat and add a new command `ai_generate_playlist_from_seed`, or refactor to a single command?
   - Recommendation: Add `ai_generate_playlist_from_seed` as a new command. Keep existing `ai_generate_playlist` intact. Zero risk of breaking the existing chat flow. Planner should make this a task in 03-01.

2. **Track lookup for result preview**
   - What we know: The track table uses paginated loading; some tracks may not be in React state.
   - What's unclear: Whether the performance cost of `get_all_tracks` on dialog open is acceptable, vs. fetching only the N returned track IDs.
   - Recommendation: Fetch only the returned `track_ids` individually using `tauriApi.getTrack(id)` in parallel (Promise.all). Faster than loading all tracks, and the set is small (typically 10–25 tracks for a 1-hr set).

3. **Track analysis data in Track type for result display**
   - What we know: The frontend `Track` type already has `bpm` and `musical_key` fields (from the LEFT JOIN in library queries). The `tauriApi.getTrack(id)` should return these if analyzed.
   - What's unclear: Whether `get_track` returns analysis fields or just base track fields.
   - Recommendation: Verify in `db/mod.rs` that `get_track` does the LEFT JOIN. If not, use `get_track_analysis` separately per track. Planner should flag this as a verification task in 03-01.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` (config only has `workflow.research`, `workflow.plan_check`, `workflow.verifier`). Treating as false — skipping this section.

---

## Sources

### Primary (HIGH confidence)
- Codebase read (100% of relevant files):
  - `src-tauri/src/ai/claude_client.rs` — `ClaudeClient.generate_playlist()`, `PlaylistResponse` struct, JSON extraction
  - `src-tauri/src/ai/context_builder.rs` — `TrackContextBuilder.build_smart_context()`, `TrackContext` struct, 5K track limit
  - `src-tauri/src/ai/system_prompt.rs` — Camelot wheel rules, BPM transition guidance, existing DJ knowledge
  - `src-tauri/src/commands/ai.rs` — `ai_generate_playlist` command, context caching pattern, `AppState` usage
  - `src/components/ai/PlayerAIChat.tsx` — pending playlist flow, save flow, modal pattern
  - `src/store/aiStore.ts` — `generatePlaylist()`, `pendingPlaylist` state, error handling
  - `src/components/TrackTable.tsx` — context menu pattern, submenu pattern, props interface
  - `src/components/Player.tsx` — player bar structure, action button pattern, `currentTrack` availability
  - `src/lib/tauri-api.ts` — IPC wrapper pattern, `aiGeneratePlaylist` existing call
  - `src/types/ai.ts` — `GeneratedPlaylist`, `AppError` types
  - `src/types/track.ts` — `Track` type with `bpm`, `musical_key`, `duration_ms` fields
  - `src-tauri/src/db/mod.rs` — `Track`, `TrackAnalysis`, `Playlist` structs
  - `.planning/phases/03-ai-playlists/03-CONTEXT.md` — locked decisions
  - `.planning/REQUIREMENTS.md` — AIPL-01 through AIPL-06

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — directly extends proven existing patterns; no novel integration
- Pitfalls: HIGH — identified from direct codebase inspection, not speculation
- Camelot wheel math: HIGH — rules confirmed in existing system_prompt.rs

**Research date:** 2026-02-28
**Valid until:** 90 days (stable domain; Claude API model may update but pattern is unchanged)
