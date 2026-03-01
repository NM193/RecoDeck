# Phase 4: AI Discovery and Mix Prep - Research

**Researched:** 2026-02-28
**Domain:** AI track recommendations + frontend mix-analysis visualization — Claude API extension, React panel UI, Rust backend new commands
**Confidence:** HIGH (codebase fully read; domain is direct extension of Phase 3 working patterns with one critical data gap)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | User can get AI-powered track recommendations based on currently playing track | New `ai_recommend_similar` Tauri command; seed-context builder already exists from Phase 3; trigger from Now Playing bar |
| DISC-02 | User can get AI recommendations based on an existing playlist's vibe | New `ai_recommend_for_playlist` Tauri command; playlist context = all tracks in playlist passed as seeds; trigger from playlist panel |
| DISC-03 | AI recommendations draw only from user's own library (local-first) | Already enforced by design — ClaudeClient only receives library context JSON; no external data; IDs returned must pass Set membership check |
| MIXP-01 | User can view AI-suggested track order for key-compatible mixing | New `ai_optimize_playlist_order` Tauri command returning reordered track_ids; frontend renders side-by-side or in-place view |
| MIXP-02 | User can view energy arc visualization for a playlist | Frontend-only: BPM-based arc chart (loudness_lufs not populated); SVG/canvas bar chart or sparkline; BPM as energy proxy |
| MIXP-03 | AI highlights potential transition issues (BPM jumps, key clashes) | Frontend-only: deterministic computation over ordered track list; same logic as TransitionIndicator in AIPlaylistDialog (Phase 3) |
</phase_requirements>

---

## Summary

Phase 4 builds on Phase 3's fully working AI foundation: the `ClaudeClient`, `TrackContextBuilder`, system prompt, and AI command patterns are all production-proven. This phase adds two new capabilities — track recommendations and mix prep analysis — using the same architecture.

**Track recommendations (DISC-01, DISC-02, DISC-03)** require two new Tauri commands that follow the exact same pattern as `ai_generate_playlist_from_seed`: build a focused context (seed-aware for a track, or playlist-track-aware for a playlist), send to Claude, return structured JSON (track_ids). The recommendation response is a subset of `GeneratedPlaylist` — track_ids + reasoning, no name/description needed. DISC-03 is already satisfied by the existing local-only architecture.

**Mix prep (MIXP-01, MIXP-02, MIXP-03)** is split between backend and frontend. MIXP-01 needs one new AI command that accepts a playlist's tracks and returns them reordered for key-compatible mixing. MIXP-02 and MIXP-03 are pure frontend computation: MIXP-02 renders an energy arc using BPM as the energy proxy (the `loudness_lufs` DB column exists but is never populated — no audio loudness analysis module exists), and MIXP-03 uses the exact `TransitionIndicator` logic already built in `AIPlaylistDialog`.

The critical discovery: **`loudness_lufs` is a DB schema placeholder — no Rust audio module computes it**. Energy arc MUST use BPM as a proxy. This is acceptable because BPM is the primary energy signal for DJ sets and it is widely populated from Phase 1/2 analysis.

**Primary recommendation:** Add two new AI Tauri commands (recommend + optimize order); add two new frontend components (RecommendationsPanel + MixPrepPanel); reuse TransitionIndicator from Phase 3 for MIXP-03; use BPM-based SVG bar chart for energy arc. No new Rust dependencies required.

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/api` | existing | Tauri IPC invoke | Already used for all commands |
| `zustand` | existing | AI/player store state | `useAIStore`, `usePlayerStore` already manage AI and playback state |
| `framer-motion` | existing | Panel open/close animations | Used in `PlayerAIChat`, `AIPlaylistDialog` |
| `lucide-react` (via `Icon`) | existing | Icons (Sparkles, Zap, TriangleAlert, etc.) | All icons via `<Icon name="...">` wrapper |
| `reqwest` (Rust) | existing | Claude API HTTP | `ClaudeClient` already handles timeouts, errors, JSON extraction |
| `serde_json` (Rust) | existing | JSON (de)serialization | Used throughout AI module |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SVG (native browser) | — | Energy arc visualization | BPM bar chart — no charting library needed; inline SVG is sufficient for a simple bar visualization |
| `@tanstack/react-virtual` | existing | Virtual list | Already used in TrackTable — use if recommendation list exceeds ~50 tracks |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline SVG bar chart | recharts / chart.js | External charting library is heavy for a simple per-track BPM bars display; SVG is 0 dependency and sufficient |
| BPM as energy proxy | loudness_lufs | Loudness would be more accurate but the analysis module does not exist; implementing it is out of scope for Phase 4 |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files for Phase 4:

```
src/
├── components/ai/
│   ├── RecommendationsPanel.tsx    # Track recommendations (DISC-01, DISC-02)
│   ├── RecommendationsPanel.css
│   ├── MixPrepPanel.tsx            # Energy arc + transition issues (MIXP-01, MIXP-02, MIXP-03)
│   └── MixPrepPanel.css
src-tauri/src/commands/
│   └── ai.rs                       # Add ai_recommend_similar, ai_recommend_for_playlist,
│                                   # ai_optimize_playlist_order (extend existing file)
```

No new Rust files needed. All commands go into the existing `ai.rs`.

### Pattern 1: Recommendation Command (same as Phase 3 playlist gen)

**What:** New Tauri command that accepts a seed track (or list of playlist track IDs), builds context, calls Claude, returns `RecommendationResult { track_ids: Vec<i64>, reasoning: String }`.

**When to use:** DISC-01 (seed track) and DISC-02 (playlist).

**Rust command skeleton:**
```rust
// src-tauri/src/commands/ai.rs

/// Recommendation result from AI
#[derive(Debug, Serialize, Deserialize)]
pub struct RecommendationResult {
    pub track_ids: Vec<i64>,
    pub reasoning: String,
}

/// Get AI track recommendations based on currently playing track (DISC-01)
#[tauri::command]
pub async fn ai_recommend_similar(
    state: State<'_, AppState>,
    seed_track_id: i64,
    count: i32, // How many recommendations to return (default: 10)
) -> Result<RecommendationResult, AppError> {
    let api_key = get_api_key_from_db(&state)?.ok_or(AppError::AiNoApiKey)?;

    let (seed_title, seed_artist, seed_bpm, seed_key) = {
        // same pattern as ai_generate_playlist_from_seed
    };

    let all_tracks = { /* get all tracks with analysis */ };

    // Reuse build_seed_context with "maintain" as direction (neutral)
    let track_context = TrackContextBuilder::build_seed_context(
        &all_tracks, seed_bpm, seed_key.as_deref(), "maintain"
    )?;

    let prompt = format!(
        "Find {} tracks from my library that are most similar to \"{}\" by {} \
        (ID: {}, BPM: {:?}, Key: {:?}). \
        Prioritize BPM compatibility (within ±8 BPM) and Camelot key compatibility. \
        Exclude the seed track itself. \
        Return JSON: {{ \"track_ids\": [...], \"reasoning\": \"...\" }}",
        count, seed_title, seed_artist, seed_track_id, seed_bpm, seed_key
    );

    let client = ClaudeClient::new(api_key);
    let response_text = client.chat(
        vec![Message { role: "user".to_string(), content: format!("{}\n\nLibrary:\n{}", prompt, track_context) }],
        Some(SYSTEM_PROMPT.to_string())
    ).await?;

    // Parse JSON from response
    let json = ClaudeClient::extract_json_public(&response_text)?;
    serde_json::from_str::<RecommendationResult>(&json)
        .map_err(|e| AppError::AiParsing(format!("Recommendation response invalid: {}", e)))
}

/// Get AI track recommendations based on an existing playlist's vibe (DISC-02)
#[tauri::command]
pub async fn ai_recommend_for_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    count: i32,
) -> Result<RecommendationResult, AppError> {
    // Get playlist tracks, build prompt describing their collective vibe
    // Use build_full_context but pass all tracks; prompt includes playlist track list for context
}

/// Get AI-optimized track order for key-compatible mixing (MIXP-01)
#[tauri::command]
pub async fn ai_optimize_playlist_order(
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<RecommendedOrder, AppError> {
    // Returns track_ids in suggested order + reasoning
}
```

**Note on `extract_json`:** The method is currently private (`fn extract_json`). Either make it `pub fn` or duplicate inline. Recommended: make it `pub(crate)` for reuse.

### Pattern 2: Recommendation Result Display

**What:** A panel (not a full modal) showing a list of recommended tracks with BPM/key badges and a "Add to Playlist" / "Play" action per track. Triggered from Now Playing bar (DISC-01) or playlist panel (DISC-02).

**Component structure:**
```tsx
// src/components/ai/RecommendationsPanel.tsx

interface RecommendationsPanelProps {
  seedTrack?: Track;         // For DISC-01 (by track)
  playlistId?: number;       // For DISC-02 (by playlist)
  onClose: () => void;
  onAddToPlaylist: (trackId: number, playlistId: number) => void;
}

type PanelStep = 'idle' | 'generating' | 'results';
```

**Display pattern:** Same as AIPlaylistDialog results step but without the save flow. Track rows show Title, Artist, BPM, Key + Play + "Add to Playlist" dropdown.

### Pattern 3: Energy Arc Visualization (MIXP-02)

**What:** A horizontal bar chart (one bar per track) where bar height = BPM normalized to [0, 1] across the playlist's BPM range. Each bar is colored by energy direction (green = low, yellow = mid, red = high relative to set range).

**Why BPM not loudness:** The `loudness_lufs` column exists in the DB schema and `TrackAnalysis` struct but is never written — no audio loudness module exists in `src-tauri/src/audio/`. The `mod.rs` comment mentions it as a future module. Using BPM is the correct proxy for Phase 4.

**Implementation:** Inline SVG, no library. The playlist track list with BPM data is already available from `tauriApi.getPlaylistTracks(playlistId)`.

```tsx
// Inline SVG energy arc component
function EnergyArc({ tracks }: { tracks: Track[] }) {
  const bpms = tracks.map(t => t.bpm ?? 0);
  const min = Math.min(...bpms.filter(b => b > 0));
  const max = Math.max(...bpms.filter(b => b > 0));
  const range = max - min || 1;

  const BAR_WIDTH = 24;
  const MAX_HEIGHT = 80;

  return (
    <svg
      width={tracks.length * (BAR_WIDTH + 4)}
      height={MAX_HEIGHT + 20}
      role="img"
      aria-label="Energy arc visualization"
    >
      {tracks.map((track, i) => {
        const bpm = track.bpm ?? 0;
        const height = bpm > 0 ? ((bpm - min) / range) * MAX_HEIGHT : 4;
        const y = MAX_HEIGHT - height;
        const hue = Math.round((1 - (bpm - min) / range) * 120); // green→red
        return (
          <g key={track.id}>
            <rect
              x={i * (BAR_WIDTH + 4)}
              y={y}
              width={BAR_WIDTH}
              height={height}
              fill={`hsl(${hue}, 70%, 50%)`}
              rx={3}
            />
            <title>{track.title}: {bpm ? `${Math.round(bpm)} BPM` : '?'}</title>
          </g>
        );
      })}
    </svg>
  );
}
```

### Pattern 4: Transition Issue Detection (MIXP-03)

**What:** Reuse the exact `TransitionIndicator` component and `getKeyCompatibility()` function already built in `AIPlaylistDialog.tsx` from Phase 3. Extract these into a shared util/component file so both dialogs use the same logic.

**Recommendation:** Move `getKeyCompatibility()` and `TransitionIndicator` to `src/lib/musicUtils.ts` and `src/components/ai/TransitionIndicator.tsx` respectively. Import from there in both `AIPlaylistDialog` and `MixPrepPanel`.

**Threshold definitions (confirmed from Phase 3 and system_prompt.rs):**
- BPM jump: green ≤5, yellow 6–10, red >10 (flagged as "potential issue")
- Key: 'perfect' (same) = green, 'compatible' (±1 Camelot step or inner/outer) = yellow, 'clash' = red

### Pattern 5: Playlist Order Optimization Response

**What:** A new response type `RecommendedOrder` returned by `ai_optimize_playlist_order`:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct RecommendedOrder {
    pub track_ids: Vec<i64>,  // Same track IDs as input, in optimized order
    pub reasoning: String,
}
```

**Frontend display:** Show the reordered list in `MixPrepPanel` as a "Suggested Order" view alongside the current order, with TransitionIndicators between each pair. User can click "Apply Order" to save (calls existing `add_track_to_playlist` in correct order after `remove_track_from_playlist`).

**Important:** There is no `reorder_playlist_tracks` command yet. "Apply Order" must be implemented as: delete all tracks from playlist, re-add in new order. This is a simple but not atomic operation — see pitfalls.

### Anti-Patterns to Avoid

- **Using loudness_lufs for energy arc:** The field is never populated. Always use BPM as the proxy in Phase 4.
- **Implementing a charting library:** SVG bar chart is sufficient for 10–50 tracks. Don't add recharts/chart.js/vitest-canvas.
- **Making RecommendationsPanel a full modal:** Keep it as a slide-in panel or sheet (similar to the AI chat panel), not a blocking modal overlay. Users need to see the track table to act on recommendations.
- **New global Zustand store for Phase 4 features:** These features have transient UI state (generating, results). Keep state local to the panel component, same approach as AIPlaylistDialog.
- **Calling `get_all_tracks` inside the recommendation commands without caching:** Use `get_or_build_context` which checks `ai_context_cache` first. Do not bypass the cache.
- **Separate command for DISC-01 vs DISC-02 context building:** Both can reuse `build_seed_context` — DISC-02 uses the first/last track of the playlist as seed, or passes playlist stats as seed BPM/key neighborhood.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Camelot wheel distance math | Custom graph traversal | Direct arithmetic on parsed Camelot string | Already in `is_camelot_compatible()` in context_builder.rs and `getKeyCompatibility()` in AIPlaylistDialog.tsx |
| JSON extraction from Claude response | New parser | `ClaudeClient::extract_json()` (make pub(crate)) | Already handles markdown code blocks, raw JSON, error mapping |
| HTTP client for Claude | New reqwest setup | `ClaudeClient::new(api_key)` | Already has timeout, error mapping, model pinned to claude-sonnet-4-20250514 |
| Transition issue visualization | New component | Refactor and reuse `TransitionIndicator` from Phase 3 | Identical problem, identical solution — extract to shared location |
| Energy normalization | DSP library | `(bpm - min) / range` inline | Trivial arithmetic; no library justifiable |
| Charting | recharts/chart.js | Inline SVG | Zero dependency for a bar chart with 10–50 bars |

**Key insight:** Phase 4's building blocks all exist — recommendation is the same as playlist gen with a different prompt structure; mix prep is frontend computation over existing track data. The only genuinely new code is the SVG energy arc.

---

## Common Pitfalls

### Pitfall 1: loudness_lufs Is Never Populated

**What goes wrong:** Developer assumes `TrackAnalysis.loudness_lufs` has real values and builds energy arc off it. All bars render at zero/minimum height.

**Why it happens:** The DB schema has the column. The `TrackAnalysis` struct in Rust and `TrackAnalysis` interface in TypeScript both include the field. But no Rust module ever writes to it — there is no `audio/loudness.rs` file.

**How to avoid:** Use `track.bpm` as the energy proxy. Document this clearly in code with a comment: `// loudness_lufs not implemented — BPM used as energy proxy for Phase 4`.

**Warning signs:** All arc bars at identical (zero or minimum) height; `SELECT COUNT(*) FROM track_analysis WHERE loudness_lufs IS NOT NULL` returns 0.

### Pitfall 2: extract_json Is Private

**What goes wrong:** New recommendation commands can't call `ClaudeClient::extract_json()` because it's a private function.

**Why it happens:** It was implemented as `fn extract_json` (no `pub`) in `claude_client.rs`.

**How to avoid:** Change `fn extract_json` to `pub(crate) fn extract_json` in `claude_client.rs`. The new commands use `client.chat()` for the raw call, then call the public extraction helper.

**Warning signs:** Rust compiler error: `method 'extract_json' is private`.

### Pitfall 3: Apply Order Is Not Atomic

**What goes wrong:** "Apply suggested order" deletes all tracks and re-adds them. If interrupted mid-way, the playlist ends up in a corrupted state (some tracks deleted, not all re-added).

**Why it happens:** There is no `reorder_playlist_tracks` DB method — the `position` column exists but there's no command to bulk-update positions.

**How to avoid:** Two options:
1. (Simple, Phase 4 scope) Add a `reorder_playlist_tracks(playlist_id, ordered_track_ids: Vec<i64>)` DB method that does a bulk UPDATE of position values in a single transaction — safe and atomic.
2. (Out of scope) Expose a `reorder_playlist_tracks` Tauri command for general drag-and-drop reordering.

**Recommendation:** Option 1. Implement the DB method as a transaction: `BEGIN; UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?; ... COMMIT;` — one statement per track, all in one transaction.

**Warning signs:** Playlist with fewer tracks than expected after applying order.

### Pitfall 4: Recommendation for Playlist Needs Context Strategy

**What goes wrong:** For DISC-02 (recommendations by playlist), the context prompt is ambiguous — Claude doesn't know which tracks to exclude (the playlist tracks themselves) and what "fits the vibe" means without enough context.

**Why it happens:** The playlist may span a wide BPM/key range; no single seed BPM/key represents it.

**How to avoid:** Build the playlist prompt using the aggregate of the playlist tracks:
- Calculate median BPM of the playlist tracks
- Find the most common Camelot key (or key cluster)
- Use `build_seed_context` with median_bpm and most_common_key as seed values
- Explicitly instruct Claude to exclude the track IDs already in the playlist
- Pass the playlist track IDs in the prompt: "Do NOT include any of these track IDs: [1, 42, 107, ...]"

**Warning signs:** Claude recommending tracks already in the playlist; recommendations that clash with the playlist's key signature.

### Pitfall 5: Now Playing Entry Point Requires currentTrack to Be Non-Null

**What goes wrong:** The "Get Recommendations" button in the Player bar is visible but disabled/broken when no track is playing.

**Why it happens:** `currentTrack` in `usePlayerStore` is null when nothing is playing.

**How to avoid:** Gate the button with `disabled={!currentTrack}` and `title="Play a track first to get recommendations"`. Same pattern as the existing Sparkles button in Player.tsx for `onGenerateAIPlaylist`.

**Warning signs:** UI error when clicking recommendations with empty player state.

### Pitfall 6: MixPrepPanel Opened on Playlist With No BPM Data

**What goes wrong:** Energy arc shows all bars at zero height; transition indicators all show "BPM ?" because tracks haven't been analyzed.

**Why it happens:** Analysis is optional — users may have tracks without BPM data.

**How to avoid:** Count tracks with non-null BPM. If fewer than 50% have BPM data, show a banner: "Analyze tracks to see accurate energy arc — [Analyze All] button" linking to existing analysis flow. Render bars with `height: 4px` (minimum) for unanalyzed tracks.

**Warning signs:** Empty-looking arc chart; user confusion about what they're seeing.

---

## Code Examples

Verified patterns from existing codebase:

### New Tauri Command Registration (from lib.rs)

```rust
// src-tauri/src/lib.rs — add to .invoke_handler() call
// Pattern: look for existing .invoke_handler(tauri::generate_handler![...]) block
// Add alongside existing ai commands:
ai::ai_recommend_similar,
ai::ai_recommend_for_playlist,
ai::ai_optimize_playlist_order,
```

### Frontend API Wrappers (from tauri-api.ts pattern)

```typescript
// src/lib/tauri-api.ts — add to tauriApi object

async aiRecommendSimilar(seedTrackId: number, count = 10): Promise<RecommendationResult> {
  return await invoke('ai_recommend_similar', { seedTrackId, count });
},

async aiRecommendForPlaylist(playlistId: number, count = 10): Promise<RecommendationResult> {
  return await invoke('ai_recommend_for_playlist', { playlistId, count });
},

async aiOptimizePlaylistOrder(playlistId: number): Promise<RecommendedOrder> {
  return await invoke('ai_optimize_playlist_order', { playlistId });
},
```

### New TypeScript Types (in src/types/ai.ts)

```typescript
// Add to src/types/ai.ts

export interface RecommendationResult {
  track_ids: number[];
  reasoning: string;
}

export interface RecommendedOrder {
  track_ids: number[];  // same IDs as input, different order
  reasoning: string;
}
```

### Reorder Playlist Tracks DB Method (new)

```rust
// src-tauri/src/db/mod.rs

/// Reorder tracks in a playlist by updating position values atomically.
/// `ordered_track_ids` must contain exactly the track IDs already in the playlist.
pub fn reorder_playlist_tracks(&self, playlist_id: i64, ordered_track_ids: &[i64]) -> Result<()> {
    let tx = self.conn.transaction()?; // Note: rusqlite uses conn.execute_batch or savepoint
    for (position, &track_id) in ordered_track_ids.iter().enumerate() {
        tx.execute(
            "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
            params![position as i64, playlist_id, track_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}
```

**Note on rusqlite transactions:** The `Database` struct wraps a `Connection`. Calling `.transaction()` on `&self` requires `&mut self`. Since `Database` is behind `Mutex<Option<Database>>`, the `db_guard` can be `.as_mut()` for mutation. Alternatively, use `execute_batch` with explicit `BEGIN`/`COMMIT`. Either works — see existing `run_migrations` for the `execute_batch` pattern.

### Playlist Context Builder for DISC-02

```rust
// In ai_recommend_for_playlist command body:

// Get playlist tracks
let playlist_tracks = {
    let db_guard = state.db.lock()...;
    let db = db_guard.as_ref()...;
    db.get_playlist_tracks(playlist_id)...?
};

// Calculate aggregate seed
let bpms: Vec<f64> = playlist_tracks.iter()
    .filter_map(|(_, bpm, _, _, _)| *bpm)
    .collect();
let median_bpm = if bpms.is_empty() { None } else {
    let mut sorted = bpms.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(sorted[sorted.len() / 2])
};

let playlist_track_ids: Vec<i64> = playlist_tracks.iter()
    .filter_map(|(t, _, _, _, _)| t.id)
    .collect();

// Build exclusion list for prompt
let exclusion_str = playlist_track_ids.iter().map(|id| id.to_string())
    .collect::<Vec<_>>().join(", ");

let prompt = format!(
    "Find {} tracks from my library that would fit well with this playlist. \
     The playlist has a median BPM around {:.0}. \
     IMPORTANT: Do NOT include any of these track IDs already in the playlist: [{}]. \
     Return JSON: {{ \"track_ids\": [...], \"reasoning\": \"...\" }}",
    count, median_bpm.unwrap_or(128.0), exclusion_str
);
```

### TransitionIndicator Extraction (for MIXP-03 reuse)

```typescript
// Extract to: src/lib/musicUtils.ts

export type KeyCompatibility = 'perfect' | 'compatible' | 'clash';

export function getKeyCompatibility(keyA?: string, keyB?: string): KeyCompatibility {
  if (!keyA || !keyB) return 'clash';
  if (keyA === keyB) return 'perfect';
  const parse = (k: string) => {
    const m = k.match(/^(\d{1,2})([AB])$/i);
    if (!m) return null;
    return { num: parseInt(m[1], 10), letter: m[2].toUpperCase() };
  };
  const a = parse(keyA);
  const b = parse(keyB);
  if (!a || !b) return 'clash';
  if (a.num === b.num && a.letter !== b.letter) return 'compatible';
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return 'compatible';
  }
  return 'clash';
}

export function getBpmIssue(bpmA?: number, bpmB?: number): 'ok' | 'warn' | 'bad' {
  if (bpmA == null || bpmB == null) return 'bad';
  const delta = Math.abs(bpmA - bpmB);
  if (delta <= 5) return 'ok';
  if (delta <= 10) return 'warn';
  return 'bad';
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All tracks sent to AI (full context) | Seed-aware filtered context (build_seed_context) | Phase 3 | Smaller context = faster, more accurate recommendations |
| `extract_json` is private | Needs to be `pub(crate)` | Phase 4 | New commands need to call it for recommendation parsing |
| No playlist reorder capability | New `reorder_playlist_tracks` DB method needed | Phase 4 | Required for MIXP-01 "Apply Order" action |
| Transition indicators only in AIPlaylistDialog | Extract to shared `musicUtils.ts` | Phase 4 | MIXP-03 reuses same logic; avoid duplication |

**Deprecated/outdated:**
- The Phase 3 research note about "fetching only returned track_ids via Promise.all(getTrack(id))" — this pattern is proven and should be reused in Phase 4 result display.

---

## Open Questions

1. **MixPrepPanel: separate panel or tab within existing playlist view?**
   - What we know: The roadmap calls for "view a reordered version" and "see energy arc" — both suggest the user is looking at a playlist.
   - What's unclear: Whether MixPrepPanel should be a button in the playlist sidebar that opens a dedicated panel, or a tab toggle within the existing playlist track view.
   - Recommendation: Panel approach (triggered by a "Mix Prep" button in the playlist header). This avoids restructuring the existing playlist track table. Planner should decide at task level; either works architecturally.

2. **RecommendationsPanel: where does it appear in the UI layout?**
   - What we know: DISC-01 triggers from Now Playing bar, DISC-02 from playlist panel.
   - What's unclear: Whether it's a slide-in drawer (like the existing AIChatPanel) or a modal overlay (like AIPlaylistDialog).
   - Recommendation: Same slide-in panel pattern as `PlayerAIChat` (right side). Less disruptive than a modal for a browse-and-add workflow.

3. **rusqlite transaction API in `reorder_playlist_tracks`**
   - What we know: `rusqlite` has a `.transaction()` method that returns a `Transaction` requiring `&mut Connection`. The `Database` struct wraps `Connection` without exposing `&mut`.
   - What's unclear: Whether `&self` connection supports `.transaction()` directly.
   - Recommendation: Use `self.conn.execute_batch("BEGIN; ... COMMIT;")` pattern if transaction() requires `&mut`. Alternatively, expose `&mut self` for the reorder method. The `run_migrations` method uses `execute_batch` successfully. Planner should use `execute_batch` approach to avoid refactor.

4. **Count parameter for recommendations: user-configurable or fixed?**
   - What we know: No user preference system for this exists.
   - What's unclear: Whether to expose a slider/picker in the RecommendationsPanel for how many tracks to request, or default to 10.
   - Recommendation: Fixed at 10 for initial implementation. UI simplicity over configurability. Can be added later.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` (only `workflow.research`, `workflow.plan_check`, `workflow.verifier`). Treating as false — skipping this section.

---

## Sources

### Primary (HIGH confidence)

- Codebase read (all relevant files):
  - `src-tauri/src/ai/claude_client.rs` — `ClaudeClient.chat()`, `extract_json()` visibility, `Message` struct
  - `src-tauri/src/ai/context_builder.rs` — `build_seed_context()`, `build_full_context()`, Camelot compatibility
  - `src-tauri/src/ai/system_prompt.rs` — DJ assistant prompt, BPM/key rules
  - `src-tauri/src/commands/ai.rs` — `ai_generate_playlist_from_seed` pattern, helper functions, `AppState` usage
  - `src-tauri/src/commands/playlists.rs` — `get_playlist_tracks` returns TrackDTO with BPM/key; no reorder command exists
  - `src-tauri/src/commands/library.rs` — `AppState`, `TrackDTO` with analysis fields
  - `src-tauri/src/db/mod.rs` — `TrackAnalysis` struct (loudness_lufs exists but never written), `get_playlist_tracks` JOIN, position column exists
  - `src-tauri/src/audio/mod.rs` — lists loudness as "future" module; no `loudness.rs` file exists in directory
  - `src/components/ai/AIPlaylistDialog.tsx` — `TransitionIndicator`, `getKeyCompatibility()` implementations
  - `src/store/playerStore.ts` — `currentTrack`, queue management
  - `src/store/aiStore.ts` — `isApiKeyConfigured` check pattern
  - `src/types/ai.ts` — existing types, `AppError`, error handling
  - `src/types/track.ts` — `Track` interface with `bpm`, `musical_key` fields
  - `src/lib/tauri-api.ts` — IPC wrapper pattern, existing AI commands
  - `src/components/Player.tsx` — existing `onGenerateAIPlaylist` prop pattern for Now Playing bar buttons
  - `.planning/phases/03-ai-playlists/03-RESEARCH.md` — Phase 3 established patterns
  - `.planning/REQUIREMENTS.md` — DISC-01, DISC-02, DISC-03, MIXP-01, MIXP-02, MIXP-03

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — directly extends Phase 3 proven patterns; new commands follow identical structure
- Pitfalls: HIGH — identified from direct codebase inspection; loudness_lufs gap is a definitive code finding, not speculation
- Energy arc implementation: HIGH — BPM proxy is the only viable approach given DB state; inline SVG is correct for this scale
- rusqlite transaction API: MEDIUM — directional guidance is correct but exact API may require minor adjustment at implementation time

**Research date:** 2026-02-28
**Valid until:** 90 days (stable domain; Claude API model pinned to claude-sonnet-4-20250514; no fast-moving dependencies)
