# Architecture Patterns

**Project:** RecoDeck — v1.1 Stabilization / v1.2 Playback & UX Polish / v1.3 Library UX & Duplicate Management
**Domain:** Desktop music library manager with DJ workflow features
**Researched:** 2026-03-06 (v1.3 integration section added)
**Confidence:** HIGH — based on direct codebase inspection

---

## v1.3 Integration Analysis

This section answers the integration questions for the 3 new v1.3 features. All findings are from direct inspection of the source files listed in the milestone context.

---

### Feature 1: Track Table Responsive Layout Fix

#### Root Cause Diagnosis

The layout DOM structure in `TrackTable.tsx`:

```html
<div class="track-table-container">          <!-- flex column, height:100%, min-width:0 -->
  <div class="track-table-search">           <!-- fixed search bar -->
  <div class="track-table-scroll-area">      <!-- flex:1, overflow:auto, min-width:0 -->
    <div class="track-table-holder">         <!-- *** NO CSS RULE DEFINED ***  -->
      <div class="track-table-header">       <!-- position:sticky, top:0, bg:--bg-secondary -->
        <div class="track-table-row header-row">   <!-- display:flex, width:100% -->
      </div>
      <div class="track-table-body">         <!-- position:relative -->
        [virtualized rows — each: display:flex, width:100%, min-width:fit-content]
      </div>
    </div>
  </div>
  <div class="track-table-footer">
```

`.track-table-holder` has no CSS rule in `TrackTable.css`. The scroll area has `overflow:auto` and `min-width:0`, but the holder div expands to `min-content` width (driven by `min-width: fit-content` on rows). The header's `background: var(--bg-secondary)` only covers the header's computed width — it does not stretch to fill the full scroll-area width when the window is wider than the minimum column content.

**The fix is CSS-only. No JS, no logic changes.**

```css
/* Add to TrackTable.css */
.track-table-holder {
  min-width: 100%;        /* stretch holder to scroll-area width when window is wide */
  display: flex;
  flex-direction: column;
}
```

With this rule, the holder (and therefore the header and rows inside it) always fills the available width. When columns have a combined min-width wider than the window, `min-width: fit-content` on rows already handles horizontal scroll correctly.

#### Integration Points

| Location | Change Type | What Changes |
|----------|-------------|-------------|
| `src/components/TrackTable.css` | CSS addition | Add `.track-table-holder { min-width: 100%; display: flex; flex-direction: column; }` |
| `src/components/TrackTable.tsx` | None | No changes needed |
| Rust backend | None | Not involved |

---

### Feature 2: Duplicate Tracks Review Dialog

#### Current State (Existing "Blind Delete" Flow)

```
DatabaseSection.tsx button "Remove Duplicate Tracks"
  → SettingsContext::handleCleanupDuplicates()
    → tauriApi.cleanupDuplicateTracks()
      → invoke('cleanup_duplicate_tracks')
        → db.remove_duplicate_tracks()
          — finds dups: by file_hash OR by (lowercase filename + file_size)
          — keeps lowest ID per group, deletes the rest
          — cascades: deletes track_analysis + playlist_tracks rows
          — returns: count deleted (just a number)
    → shows notification: "Removed N duplicate tracks"
    → calls onFoldersChanged() → App.tsx loadTracks() re-runs
```

The problem: no preview. User cannot see what will be deleted before it is deleted.

#### New Backend Commands Required

**`find_duplicate_tracks`** — read-only detection, returns grouped data. The existing `remove_duplicate_tracks()` in `db/mod.rs` mixes detection and deletion — the detection logic needs to be extracted into a separate read-only method.

New DB method in `db/mod.rs`:

```rust
pub fn find_duplicate_tracks_grouped(&self) -> Result<Vec<DuplicateGroup>> {
    // Same detection logic as remove_duplicate_tracks():
    // 1. Find dups by file_hash (excluding 'unknown')
    // 2. Find dups by (lowercase filename + file_size)
    // Return grouped: { keep: Track, duplicates: Vec<Track>, match_reason: String }
    // Does NOT delete anything
}
```

New DTO struct in `commands/library.rs`:

```rust
#[derive(Debug, Serialize)]
pub struct DuplicateGroup {
    pub keep: TrackDTO,            // track with lowest ID (would be kept)
    pub duplicates: Vec<TrackDTO>, // tracks that would be deleted
    pub match_reason: String,      // "file_hash" or "filename_size"
}

#[tauri::command]
pub fn find_duplicate_tracks(state: State<AppState>) -> Result<Vec<DuplicateGroup>, AppError> {
    let db_lock = state.db.lock()...;
    let db = db_lock.as_ref()...;
    let groups = db.find_duplicate_tracks_grouped()
        .map_err(|e| AppError::Database(format!(...)))?;
    // Convert Track → TrackDTO inside each group
    Ok(groups)
}
```

**`delete_tracks_batch`** — for selective deletion of user-chosen track IDs:

```rust
#[tauri::command]
pub fn delete_tracks_batch(state: State<AppState>, track_ids: Vec<i64>) -> Result<usize, AppError> {
    let db_lock = state.db.lock()...;
    let db = db_lock.as_ref()...;
    let mut count = 0;
    for id in &track_ids {
        // cascade: delete track_analysis, playlist_tracks, then tracks row
        db.conn.execute("DELETE FROM track_analysis WHERE track_id = ?", [id])?;
        db.conn.execute("DELETE FROM playlist_tracks WHERE track_id = ?", [id])?;
        db.conn.execute("DELETE FROM tracks WHERE id = ?", [id])?;
        count += 1;
    }
    Ok(count)
}
```

Alternatively, reuse `db.delete_track(id)` if it already cascades — check the existing `delete_track` DB method.

Both commands must be registered in `src-tauri/src/lib.rs` `invoke_handler![]`.

#### New Frontend Component

**`src/components/settings/DuplicatesDialog.tsx`** — new file, self-contained modal.

```
DuplicatesDialog (local state only, no SettingsContext changes)
├── props: { isOpen: boolean, onClose: () => void, onDeleted: () => void }
├── on mount (when isOpen): calls tauriApi.findDuplicateTracks()
│   → loading state while fetching
│   → renders list of DuplicateGroup[]
│     ├── each group: "Keep" row (highlighted, not selectable for deletion)
│     ├── each group: duplicate rows with checkboxes (pre-checked = will delete)
│     └── fields shown: title, artist, file_path, file_size, date_added
├── footer:
│   ├── "Delete N Selected" button → tauriApi.deleteTracksBatch(selectedIds) → onDeleted()
│   └── "Cancel" button → onClose()
└── zero-duplicates state: "No duplicates found" message
```

Local state inside the dialog:
- `groups: DuplicateGroup[]` — from the find call
- `loading: boolean`
- `selectedIds: Set<number>` — IDs the user has marked for deletion (pre-seeded with all duplicate IDs)
- `deleting: boolean`

**`DatabaseSection.tsx` changes:**

Replace the existing "Remove Duplicate Tracks" button behavior — or add a second button. Recommended: change the button label to "Review Duplicates" and open the dialog. The old blind-delete path can be removed or kept as an "Advanced" option.

Add local `useState<boolean>` for dialog open state:

```tsx
const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false)

// In JSX:
<button onClick={() => setShowDuplicatesDialog(true)}>Review Duplicates</button>
<DuplicatesDialog
  isOpen={showDuplicatesDialog}
  onClose={() => setShowDuplicatesDialog(false)}
  onDeleted={() => { setShowDuplicatesDialog(false); onFoldersChanged() }}
/>
```

`onFoldersChanged` is available via `useSettingsContext()`. `DuplicatesDialog` does not need to be inside `SettingsContext` — it reads directly from `tauriApi`.

#### Integration Points

| Location | Change Type | What Changes |
|----------|-------------|-------------|
| `src-tauri/src/db/mod.rs` | Rust addition | Add `find_duplicate_tracks_grouped()` method (read-only) |
| `src-tauri/src/commands/library.rs` | Rust additions | Add `DuplicateGroup` struct, `find_duplicate_tracks` command, `delete_tracks_batch` command |
| `src-tauri/src/lib.rs` | Registration | Add `find_duplicate_tracks`, `delete_tracks_batch` to `invoke_handler![]` |
| `src/lib/tauri-api.ts` | API additions | Add `findDuplicateTracks(): Promise<DuplicateGroup[]>` and `deleteTracksBatch(ids: number[]): Promise<number>` |
| `src/components/settings/DatabaseSection.tsx` | UI change | Replace/augment button to open dialog; add local `showDuplicatesDialog` state |
| `src/components/settings/DuplicatesDialog.tsx` | New file | Dialog component with full duplicate review + selective delete UX |
| `src/components/settings/SettingsContext.tsx` | None | No changes — dialog manages its own state |

#### Data Flow (new)

```
User clicks "Review Duplicates"
  → DatabaseSection: setShowDuplicatesDialog(true)
  → DuplicatesDialog mounts, calls tauriApi.findDuplicateTracks()
  → Rust: find_duplicate_tracks() reads DB (no delete), returns Vec<DuplicateGroup>
  → Dialog renders groups; user adjusts checkboxes
  → User clicks "Delete N Selected"
  → tauriApi.deleteTracksBatch(selectedIds)
  → Rust: delete_tracks_batch() cascades deletes, returns count
  → onDeleted() fires → dialog closes → onFoldersChanged()
  → App.tsx loadTracks() re-runs → TrackTable re-renders with updated list
```

---

### Feature 3: Full Library Load on Startup

#### Current Pagination State

`App.tsx` `loadTracks()` function (lines ~339-386) has three branches:

1. `if (playlist)` → `getPlaylistTracks()` — loads all (no pagination)
2. `else if (folder)` → `getTracksInFolder()` / `getTracksInFolderShallow()` — loads all (no pagination)
3. `else` ("All Tracks") → **`getTracksPaginated(1000, 0)` + `countTracks()`** — paginated

Only the third branch needs to change. `getAllTracks()` already exists in both the Rust backend (`get_all_tracks` command) and `tauri-api.ts`. No new backend code is needed.

The `loadMoreTracks` callback (lines ~389-427) is only triggered in the "All Tracks" view when `hasMoreTracks === true`. Once `hasMoreTracks` is always false, `loadMoreTracks` is never called — it can be removed or left as unreachable dead code.

#### Changes in App.tsx

In `loadTracks()`, replace the `else` branch:

```typescript
// Remove:
const batchSize = 1000
result = await tauriApi.getTracksPaginated(batchSize, 0)
total = await tauriApi.countTracks()
setHasMoreTracks(result.length < total)

// Replace with:
result = await tauriApi.getAllTracks()
setHasMoreTracks(false)
```

Remove (or keep as dead code):
- `loadMoreTracks` callback (lines ~389-427)
- `isLoadingMore` state and `setIsLoadingMore`
- `hasMoreTracks` state (can be kept at constant `false` or removed)
- The `onLoadMore={loadMoreTracks}` prop passed to `TrackTable`

The `handleSearch` clear path currently calls `loadTracks()` to "restore paginated view" — that comment becomes stale but the behavior is correct: `loadTracks()` will now call `getAllTracks()`, which is fine.

#### Changes in TrackTable.tsx

The `onLoadMore`, `hasMoreTracks`, `isLoadingMore` props are already typed as optional (`hasMoreTracks = false` as default). If `App.tsx` stops passing them, `TrackTable` works without changes.

Optional cleanup (safe to do, cosmetically cleaner):
- Remove scroll intersection observer block (lines ~416-430) — it guards `if (!onLoadMore || !hasMoreTracks)` so it's already inert without the props
- Remove "Scroll for more" footer text (lines ~998-1000)
- Remove the three props from the interface definition

#### No Backend Changes Required

`get_all_tracks` in `library.rs` is already registered and working. `tauriApi.getAllTracks()` in `tauri-api.ts` is already implemented. Nothing to add.

#### Performance Note

`get_all_tracks` does `SELECT * FROM tracks LEFT JOIN track_analysis`. For a typical DJ library (500–5,000 tracks), this query completes in under 100ms. IPC serialization of the resulting array adds another 50–100ms. TanStack Virtual renders only visible rows — memory footprint for 5,000 tracks in JS is negligible (~2MB). The "WARNING: large libraries" comment in `library.rs` was conservative; it is safe to ignore for this audience.

#### Integration Points

| Location | Change Type | What Changes |
|----------|-------------|-------------|
| `src/App.tsx` | Logic change | Replace `getTracksPaginated` call with `getAllTracks()`; `setHasMoreTracks(false)` always; optionally remove `loadMoreTracks`, `isLoadingMore` |
| `src/components/TrackTable.tsx` | Optional cleanup | Remove scroll observer, "Scroll for more" text, unused props |
| `src/components/TrackTable.css` | Optional cleanup | `.footer-loading-info` becomes unused |
| `src-tauri/src/commands/library.rs` | None | `get_all_tracks` already exists |
| `src/lib/tauri-api.ts` | None | `getAllTracks()` already exists |

---

### Build Order Within v1.3 Milestone

Feature dependencies:

```
Feature 1 (CSS layout fix)     — independent, no deps on other features
Feature 3 (Full library load)  — independent from 1 and 2; touches App.tsx/TrackTable
Feature 2 (Duplicates dialog)  — backend-first dependency within itself
                                  (find_duplicate_tracks must exist before DuplicatesDialog)
```

**Recommended order:**

1. **Feature 1 — CSS layout fix** first.
   - Single file change (`TrackTable.css`).
   - Verifiable in seconds by resizing the window.
   - Zero risk of breaking other features.

2. **Feature 3 — Full library load** second.
   - Localized to the `loadTracks()` function in `App.tsx`.
   - Removes pagination complexity before Feature 2 lands (Feature 2 calls `onFoldersChanged()` which triggers `loadTracks()` — cleaner if that already uses full load).
   - Test: open app, verify all tracks appear without "Scroll for more", check search works, check queue is complete.

3. **Feature 2 — Duplicates dialog** last.
   - Requires backend before frontend. Build in this sub-order:
     - a. `db/mod.rs`: add `find_duplicate_tracks_grouped()` read-only method
     - b. `commands/library.rs`: add `DuplicateGroup` struct + both commands
     - c. `lib.rs`: register both commands
     - d. `tauri-api.ts`: add `findDuplicateTracks()` and `deleteTracksBatch()`
     - e. `DuplicatesDialog.tsx`: build the dialog component
     - f. `DatabaseSection.tsx`: wire up the button and dialog

---

### New vs Modified Files Summary (v1.3)

#### New Files

| File | Purpose |
|------|---------|
| `src/components/settings/DuplicatesDialog.tsx` | Modal dialog for reviewing and selectively deleting duplicates |

#### Modified Files

| File | Change Scope | What Changes |
|------|-------------|-------------|
| `src/components/TrackTable.css` | 4-5 lines added | `.track-table-holder` CSS rule |
| `src/App.tsx` | 5-10 lines changed | `loadTracks()` else branch; remove `loadMoreTracks` and `isLoadingMore` |
| `src/components/TrackTable.tsx` | Optional 10-15 lines removed | Scroll observer, footer text, unused props |
| `src/components/settings/DatabaseSection.tsx` | 10-15 lines changed | New button + dialog open state |
| `src/lib/tauri-api.ts` | 10 lines added | Two new method wrappers |
| `src-tauri/src/db/mod.rs` | 40-60 lines added | `find_duplicate_tracks_grouped()` method |
| `src-tauri/src/commands/library.rs` | 50-70 lines added | `DuplicateGroup` struct + 2 new commands |
| `src-tauri/src/lib.rs` | 2 lines added | Register 2 new commands in `invoke_handler![]` |

#### Unchanged Files

| File | Reason |
|------|--------|
| `src/components/settings/SettingsContext.tsx` | Dialog manages its own local state |
| `src/components/views/SettingsView.tsx` | `DatabaseSection` already included; no structural change |
| All Zustand stores | No new global state needed for any of the 3 features |
| `src-tauri/src/commands/library.rs` existing commands | `cleanup_duplicate_tracks` and `get_all_tracks` stay untouched |

---

### Anti-Patterns to Avoid (v1.3)

**Anti-Pattern 1: JS layout measurement for the CSS fix**
Using `ResizeObserver` + `useEffect` to programmatically set header width is async and causes visual flicker. The problem is purely CSS — `min-width: 100%` on `.track-table-holder` solves it declaratively.

**Anti-Pattern 2: Dialog state in SettingsContext**
Adding `duplicateGroups`, `showDuplicatesDialog`, etc. to `SettingsContextValue` is unnecessary. Dialog state is ephemeral. Keep it local to `DatabaseSection` (open/closed boolean) and `DuplicatesDialog` (groups, selection, loading).

**Anti-Pattern 3: Holding the DB Mutex during the full duplicate scan**
`find_duplicate_tracks_grouped()` will call `get_all_tracks()` internally — this could be slow for large libraries. Acquire the lock, load all tracks into a `Vec`, drop the lock, then do in-memory grouping without the lock. This is the pattern already used in `remove_duplicate_tracks()`.

**Anti-Pattern 4: Deleting `getTracksPaginated` from backend**
`get_tracks_paginated` may be useful for future large-library support. Do not delete the registered command — just stop calling it from the frontend.

---

## v1.2 Integration Analysis

This section answers four concrete integration questions for v1.2 features against the live architecture. All findings are from direct source file inspection.

---

### Q1: Full Library Load

#### Current State

`App.tsx` `initializeApp()` deliberately avoids loading tracks on startup:

```typescript
// PERFORMANCE: Don't load all tracks on startup - load only total count
const total = await tauriApi.countTracks()
setTotalTrackCount(total)
setTracks([])
```

`loadTracks()` uses `getTracksPaginated(1000, 0)` for "All Tracks" view with scroll-to-load continuation via `loadMoreTracks()`. The `get_all_tracks` Rust command already exists in `library.rs` (annotated "WARNING: For large libraries use paginated instead") and is already wrapped as `tauriApi.getAllTracks()` in `tauri-api.ts`. No new Rust command is needed.

#### Recommended Approach

**Use `tauriApi.getAllTracks()` called once in `initializeApp`, replacing the `setTracks([])` block.**

The target audience is a small group of DJ friends — the "large library" warning was a guard for unknown scale. Loading everything once is correct for this use case and enables the full queue to be populated on first click.

**Where in the React lifecycle:** `initializeApp()` is called from `useEffect(() => { initializeApp() }, [])` on `AppContent` mount — already the right place. No new lifecycle hook needed. Call it after `initDatabase` and settings load, around line 341 in `App.tsx`:

```typescript
// Replace:
setTracks([])

// With:
try {
  const allTracks = await tauriApi.getAllTracks()
  setTracks(allTracks)
  setTotalTrackCount(allTracks.length)
  setHasMoreTracks(false)
} catch {
  console.warn('Failed to load all tracks on startup')
  setTracks([])
}
```

**Remove the pagination infrastructure:** `hasMoreTracks`, `isLoadingMore`, `loadMoreTracks` in `App.tsx` and any scroll-trigger in `TrackTable` can be deleted. The `playerStore` queue is a flat array — once `tracks` is fully loaded, `setQueue(tracks, index)` always has the complete library.

**How search interacts:** `handleSearch` calls `tauriApi.searchTracks(query)` for the "All Tracks" view and restores via `loadTracks()` on clear. After the full-library load:
- Backend search still returns correct results (searches entire DB).
- On search clear, `loadTracks()` must restore the full library. The cleanest fix is: keep a `allTracksRef = useRef<Track[]>([])` populated at startup, and set `setTracks(allTracksRef.current)` on clear instead of re-fetching from Rust. This avoids a round-trip on every search clear.

**Modified files:** `src/App.tsx`
**New files:** None

---

### Q2: Beatmatch Crossfade — Rate Ramp During Crossfade

#### Current State

`startCrossfadeToNext()` in `audioPlayer.ts` sets the incoming track's playback rate once at crossfade start:

```typescript
playbackRate = this.outgoingBpm / this.incomingBpm
playbackRate = Math.max(0.5, Math.min(2.0, playbackRate))
this.crossfadeAudio.playbackRate = playbackRate
```

The rate stays constant for the entire crossfade window. `completeCrossfade()` snaps it back to `1.0`:

```typescript
this.crossfadeAudio.playbackRate = 1.0
```

Result: the incoming track plays pitched/sped-up throughout the crossfade, then snaps to normal speed at the end. The v1.2 feature requires gradually ramping from the matched rate back to `1.0` over the crossfade duration.

#### Where the Rate Ramp Should Live

`updateCrossfadeVolumes()` — the existing `requestAnimationFrame` loop. This is the only place with frame-accurate timing during the crossfade. It already tracks `progress` (0.0 → 1.0) over `crossfadeDurationMs`. The ramp belongs here, alongside the volume fade.

#### How to Smoothly Ramp Rate

`HTMLAudioElement.playbackRate` is writable per-frame with no browser constraint on update frequency (confirmed behavior in WebKit/Chromium).

**Add a new private field** `private beatmatchStartRate: number = 1.0` to the class. Set it in `startCrossfadeToNext` alongside the existing rate assignment. Ramp it to `1.0` per-frame in `updateCrossfadeVolumes`:

```typescript
// In startCrossfadeToNext — store the calculated rate:
this.beatmatchStartRate = playbackRate
this.crossfadeAudio.playbackRate = playbackRate

// In updateCrossfadeVolumes — add per-frame ramp:
private updateCrossfadeVolumes() {
  if (!this.isCrossfading || !this.crossfadeAudio) return

  const elapsed = Date.now() - this.crossfadeStartTime
  const progress = Math.min(1.0, elapsed / this.crossfadeDurationMs)

  // Volume: fade in the incoming track (existing)
  this.crossfadeAudio.volume = progress

  // Rate ramp: smoothly move from matched tempo to native tempo
  if (this.beatmatchStartRate !== 1.0) {
    const currentRate = this.beatmatchStartRate + (1.0 - this.beatmatchStartRate) * progress
    this.crossfadeAudio.playbackRate = currentRate
  }

  if (progress >= 1.0) {
    this.crossfadeAudio.playbackRate = 1.0  // snap to exact on completion
    // ...rest of completion logic unchanged
  } else {
    this.crossfadeRafId = requestAnimationFrame(() => this.updateCrossfadeVolumes())
  }
}
```

**Reset `beatmatchStartRate` in:** `abortCrossfade()` and `completeCrossfade()` — set to `1.0`.

**The existing rate snap in `completeCrossfade()` remains correct** as a safety net: when the outgoing track ends prematurely before fade reaches 1.0, `completeCrossfade` is called from the `ended` handler with `isCrossfading` still `true`. The rate may not yet be `1.0`. The existing `this.crossfadeAudio.playbackRate = 1.0` in `completeCrossfade` covers this case.

**Easing:** Linear interpolation is audibly acceptable for BPM differences under ±10 BPM. Ease-out (`progress * (2 - progress)`) would snap to native BPM faster in the second half of the crossfade, which may feel more natural — decide by ear.

**Modified files:** `src/lib/audioPlayer.ts`
**New files:** None

---

### Q3: End-of-Track Repeat Bug

#### What the Code Reveals

The `ended` event handler in `setupEventListeners()` has this recovery path (lines ~165-209):

```typescript
if (this._currentTrackId != null && !this._nativeRecoveryAttempted) {
  this._nativeRecoveryAttempted = true
  // ...
  const SEEK_MARGIN_MS = 10000
  const seekPosition = Math.max(0, savedPosition - SEEK_MARGIN_MS)
  // seek back and switch to native decoder
}
```

**This is the source of the repeat.** The 10-second seek margin causes 10 seconds of audio to replay via the native decoder before reaching the true EOF. The observed "last 3-5 seconds" repeat is the native decoder playing from 10s before the browser's premature `ended` point, which is typically 3-7s from the real end, netting an audible 3-10s replay.

#### Root Cause Mechanism

1. WebKit fires `ended` prematurely — real, documented VBR MP3 duration miscalculation.
2. Recovery engages: seeks 10s back, switches to native decoder.
3. Native decoder replays from that earlier point — audible repeat.
4. Native decoder hits true EOF → `nativeFinishPlayback()` → `onTrackEnded` → queue advances normally.

The recovery is working as designed. The seek margin is too aggressive.

#### Fix

**Reduce `SEEK_MARGIN_MS` from `10000` to `3000`.** This is a one-line change. Most VBR MP3 premature `ended` events fire within 1-2 seconds of the actual end, so 3 seconds of replay is sufficient to catch genuinely truncated audio while reducing the audible overlap.

Test with VBR MP3 files. If the 3-second margin still occasionally misses audio, try `4000`. Do not go above `5000` — the original 10-second margin was overly conservative.

**`ended` vs `timeupdate`:** Stick with `ended` as the recovery trigger. `timeupdate` approach (pre-arming native decoder when position approaches end) adds state complexity and race conditions with the crossfade system. The `ended`-based approach is simpler and already handles the crossfade cases correctly (those are caught by the first two `if` branches before recovery logic is reached).

**Note: the repeat only happens when crossfade is NOT active.** If crossfade is enabled and has started, the `ended` handler takes the crossfade completion path, not the native recovery path. These are separate bugs on separate code paths.

**Modified files:** `src/lib/audioPlayer.ts` — change `SEEK_MARGIN_MS` constant from `10000` to `3000`
**New files:** None

---

### Q4: Settings Cleanup — Remove Key Notation and Waveform Style

#### What Must Change and Where

The feature is threaded through four layers. All four must be cleaned up or TypeScript will error.

**Layer 1: `src/components/settings/AppearanceSection.tsx`**

Remove the "Key Notation" subsection (lines ~78-98) and "Waveform Style" subsection (lines ~100-120). Theme block and Custom Colors block remain. Update the import to remove `KEY_NOTATIONS` and `WAVEFORM_STYLES`.

**Layer 2: `src/components/settings/constants.ts`**

Remove `KEY_NOTATIONS` and `WAVEFORM_STYLES` exports. (Safe to delete; if kept, no consumers will remain after layer cleanup.)

**Layer 3: `src/components/settings/SettingsContext.tsx`**

Remove from `SettingsContextValue` interface: `keyNotation`, `waveformStyle`, `handleKeyNotationChange`, `handleWaveformStyleChange`.

Remove from `SettingsCallbacks` interface: `onKeyNotationChanged`, `onWaveformStyleChanged`.

Remove state: `const [keyNotation, setKeyNotation] = useState('camelot')` and `const [waveformStyle, setWaveformStyle] = useState('traktor_rgb')`.

Remove from `loadSettings()` Promise.all: the `key_notation` and `waveform_style` `getSetting` calls, and the corresponding setter calls.

Remove handler functions `handleKeyNotationChange` and `handleWaveformStyleChange`.

Remove from the context `value` object and from `callbacks` destructuring.

**Layer 4: `src/App.tsx`**

Remove: `const [keyNotation, setKeyNotation] = useState<'camelot' | 'openkey'>('camelot')` and `const [, setWaveformStyle] = useState<string>('traktor_rgb')`.

Remove the `try/catch` blocks in `initializeApp` that load `key_notation` and `waveform_style` settings.

Remove `onKeyNotationChanged` and `onWaveformStyleChanged` from callbacks passed to `SettingsView`/`SettingsProvider`.

Remove any prop threading of `keyNotation` into child components (search for `keyNotation` prop).

**Verify completeness:**
```
grep -r "keyNotation\|waveformStyle\|key_notation\|waveform_style\|KEY_NOTATIONS\|WAVEFORM_STYLES\|handleKeyNotation\|handleWaveformStyle\|onKeyNotationChanged\|onWaveformStyleChanged" src/
```
Any remaining hits indicate missed cleanup sites.

**SQLite data:** Do NOT delete from the DB. The `key_notation` and `waveform_style` rows in the `settings` table are silently ignored if nothing reads them. No migration needed.

**Modified files:**
- `src/components/settings/AppearanceSection.tsx`
- `src/components/settings/constants.ts`
- `src/components/settings/SettingsContext.tsx`
- `src/App.tsx`

**New files:** None

---

### Component Boundaries After v1.2

```
App.tsx (AppContent)
  ├── initializeApp()          MODIFY: add getAllTracks() call; remove setTracks([])
  ├── allTracksRef             ADD: cache full library for search-clear restore
  ├── loadTracks()             SIMPLIFY: remove pagination branch for All Tracks view
  ├── loadMoreTracks()         REMOVE: no longer needed
  ├── hasMoreTracks state      REMOVE: no longer needed
  └── handleSearch()           MODIFY: restore from allTracksRef on clear

audioPlayer.ts (AudioPlayer class)
  ├── beatmatchStartRate field  ADD: new private field
  ├── startCrossfadeToNext()   MODIFY: store beatmatchStartRate
  ├── updateCrossfadeVolumes() MODIFY: add per-frame rate ramp
  ├── completeCrossfade()      KEEP: existing rate snap still correct as safety net
  ├── abortCrossfade()         MODIFY: reset beatmatchStartRate to 1.0
  └── ended handler            MODIFY: reduce SEEK_MARGIN_MS 10000 → 3000

settings/AppearanceSection.tsx MODIFY: remove Key Notation + Waveform Style subsections
settings/SettingsContext.tsx   MODIFY: remove keyNotation/waveformStyle state + callbacks
settings/constants.ts          MODIFY: remove KEY_NOTATIONS/WAVEFORM_STYLES exports
App.tsx (settings callbacks)   MODIFY: remove onKeyNotationChanged/onWaveformStyleChanged
```

---

### Build Order for v1.2

1. **Settings cleanup first** — smallest change, no runtime behavior, TypeScript-verifiable. Removes noise from subsequent testing. Compile errors surface all missed cleanup sites.

2. **End-of-track repeat bug fix** — one constant change in `audioPlayer.ts`. Immediately testable with any VBR MP3. Does not touch crossfade logic.

3. **Beatmatch rate ramp** — isolated to `audioPlayer.ts`, builds on confirmed-working crossfade. Add `beatmatchStartRate`, modify `updateCrossfadeVolumes`. Test with tracks at varying BPM differences (+5, +10, +20 BPM).

4. **Full library load last** — touches `App.tsx` state, pagination infrastructure, search restore logic, and queue behavior. Widest surface area. Validate: (a) startup latency acceptable, (b) SearchView still works, (c) queue is correct when clicking a track in All Tracks view after search.

---

## System Overview

RecoDeck uses a Tauri v2 architecture: a Rust process hosts the app backend, and a WebKit webview renders the React frontend. Communication happens over two channels: Tauri IPC (`invoke()`) for commands, and Tauri events (`emit`/`listen`) for async push. A secondary channel — an embedded Axum HTTP server — serves the mobile PWA over LAN.

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Process                         │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │              React WebView (port 1420 dev)      │    │
│  │                                                │    │
│  │  App.tsx (monolithic state hub)                │    │
│  │    ├── TrackTable (virtualized list)           │    │
│  │    ├── Player + MiniPlayer                     │    │
│  │    ├── FolderTree + Playlists sidebar          │    │
│  │    ├── AI panel overlay (3 components)         │    │
│  │    └── Settings, modals, notifications         │    │
│  │                                                │    │
│  │  State: playerStore (Zustand) + aiStore        │    │
│  │  API layer: tauri-api.ts → invoke()            │    │
│  └───────────────────────┬────────────────────────┘    │
│                          │ IPC                          │
│  ┌───────────────────────▼────────────────────────┐    │
│  │              Rust Backend                       │    │
│  │                                                │    │
│  │  AppState { db: Mutex<Option<Database>>,       │    │
│  │             ai_context_cache: Mutex<...>,      │    │
│  │             db_path: Mutex<...> }              │    │
│  │                                                │    │
│  │  Commands: library, analysis, playlists,       │    │
│  │            genre, settings, watcher, ai,       │    │
│  │            playback, server                    │    │
│  │                                                │    │
│  │  Modules: db, scanner, audio, ai, server,      │    │
│  │           error, formats, external             │    │
│  │                                                │    │
│  │  stream:// protocol handler (lib.rs)           │    │
│  └──────────┬──────────────────────┬─────────────┘    │
│             │ SQLite               │ Axum HTTP         │
│  ┌──────────▼──────────┐ ┌────────▼──────────────┐    │
│  │  recodeck.sqlite    │ │  :8384 LAN server      │    │
│  │  (app data dir)     │ │  REST API + streaming  │    │
│  └─────────────────────┘ └────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                                    │ WiFi
                           ┌────────▼────────┐
                           │  Mobile PWA     │
                           │  (mobile/ dir)  │
                           └─────────────────┘
```

---

## Component Boundaries

### Rust Backend

| Module | File(s) | Responsibility | Communicates With |
|--------|---------|---------------|-------------------|
| `db` | `src-tauri/src/db/mod.rs` | SQLite CRUD, migrations, query layer | Commands (via AppState) |
| `commands/library` | `commands/library.rs` | AppState definition, track CRUD commands, scanner bridge, TrackDTO | All commands share AppState |
| `commands/analysis` | `commands/analysis.rs` | BPM/key/waveform analysis commands, AnalysisDTO types | `audio::bpm`, `audio::key`, `db` |
| `commands/ai` | `commands/ai.rs` | API key mgmt, playlist generation, chat, recommendations | `ai::ClaudeClient`, `ai::TrackContextBuilder`, `db` |
| `commands/playlists` | `commands/playlists.rs` | Playlist CRUD, track ordering | `db`, `AppState` |
| `commands/genre` | `commands/genre.rs` | Genre assignment, genre definitions | `db`, `AppState` |
| `commands/settings` | `commands/settings.rs` | Key-value settings in DB, library folders, theme | `db`, `AppState` |
| `commands/watcher` | `commands/watcher.rs` | `notify` file system watcher, emits Tauri events | `WatcherState`, Tauri emitter |
| `commands/server` | `commands/server.rs` | Start/stop companion Axum server, QR code info | `server::*`, `CompanionState` |
| `commands/playback` | `commands/playback.rs` | Native audio decode commands (OGG fallback) | `audio::decoder`, `PlaybackState` |
| `audio/bpm` | `audio/bpm.rs` | Aubio-based BPM detection on mono PCM | `audio::decoder` |
| `audio/key` | `audio/key.rs` | FFT-based key detection, Camelot mapping | `audio::decoder`, `rustfft` |
| `audio/decoder` | `audio/decoder.rs` | Symphonia decode to mono f32 PCM | Symphonia |
| `audio/waveform` | `audio/waveform.rs` | Waveform data generation | `audio::decoder` |
| `ai/claude_client` | `ai/claude_client.rs` | Claude API HTTP client (reqwest) | `reqwest`, settings |
| `ai/context_builder` | `ai/context_builder.rs` | Condenses library into AI prompt context JSON | `db::Track`, `db::TrackAnalysis` |
| `ai/system_prompt` | `ai/system_prompt.rs` | Static system prompt string | AI commands |
| `scanner` | `scanner.rs` | Directory walk, lofty metadata extraction, SHA-256 hash | `db`, `lofty`, `walkdir` |
| `server/mod` | `server/mod.rs` | Axum app setup, CORS, auth middleware, stream tickets | `routes`, `streaming`, `db` |
| `server/routes` | `server/routes.rs` | REST route handlers, MobileTrackDTO (no file_path) | `CompanionServerState`, `db` |
| `server/streaming` | `server/streaming.rs` | Range-aware audio file streaming with ticket auth | `CompanionServerState`, filesystem |
| `lib.rs` | `lib.rs` | `stream://` URI scheme handler, command registration, app setup | All modules |
| `error.rs` | `error.rs` | `AppError` enum (thiserror + serde tagged), all error variants | All commands |

### React Frontend

| Module | File(s) | Responsibility | Communicates With |
|--------|---------|---------------|-------------------|
| `App.tsx` | `App.tsx` | Central state hub — all UI state as `useState`, orchestrates all components | All components (prop drilling) |
| `tauri-api.ts` | `lib/tauri-api.ts` | IPC wrapper — all `invoke()` calls | Rust commands |
| `http-api.ts` | `lib/http-api.ts` | HTTP API wrapper — `fetch()` to Axum server | Mobile PWA context only |
| `audioPlayer.ts` | `lib/audioPlayer.ts` | `HTMLAudioElement` controller, crossfade, native PCM fallback | `stream://` protocol, Tauri events |
| `musicUtils.ts` | `lib/musicUtils.ts` | Camelot key compatibility, BPM delta classification | AI components |
| `playerStore.ts` | `store/playerStore.ts` | Zustand store — playback state, queue management | `audioPlayer.ts`, components |
| `aiStore.ts` | `store/aiStore.ts` | Zustand store — AI chat state, API key status | `tauri-api.ts`, AI components |
| `TrackTable.tsx` | `components/TrackTable.tsx` | Virtualized track list with TanStack Virtual | `playerStore`, `tauri-api` |
| `Player.tsx` | `components/Player.tsx` | Full transport controls | `playerStore`, `audioPlayer` |
| `MiniPlayer.tsx` | `components/MiniPlayer.tsx` | Detached mini window via `#mini-player` hash route | Tauri events |
| `FolderTree.tsx` | `components/FolderTree.tsx` | Library folder/subfolder navigation tree | `tauri-api` |
| `AIPlaylistDialog.tsx` | `components/ai/AIPlaylistDialog.tsx` | Two-step modal: seed config → AI results | `tauri-api`, `musicUtils` |
| `RecommendationsPanel.tsx` | `components/ai/RecommendationsPanel.tsx` | Slide-in similar track + playlist recommendations | `tauri-api`, `musicUtils` |
| `MixPrepPanel.tsx` | `components/ai/MixPrepPanel.tsx` | Energy arc viz, transition issues, AI reorder | `tauri-api`, `musicUtils` |
| `AIChatPanel.tsx` | `components/ai/AIChatPanel.tsx` | Chat interface for AI assistant | `aiStore` |
| `settings/` | `components/settings/` | Settings panel: folders, theme, audio, AI, companion | `tauri-api`, `SettingsContext` |

---

## Data Flow

### Primary Flow: Track Playback

```
User click in TrackTable
  → playerStore.setCurrentTrack(track)
  → audioPlayer.loadTrack(track)
    → builds stream://localhost/?p=<encoded_path>
    → HTMLAudioElement.src = url
    → stream:// handler in lib.rs reads file, serves bytes
    → or: native fallback (Tauri event chunks from audio::decoder)
  → audioPlayer callbacks → playerStore updates (position, isPlaying)
  → Player.tsx re-renders from playerStore
```

### AI Playlist Generation Flow

```
User selects seed track → AIPlaylistDialog opens
  → step 1: energy direction + duration config
  → tauriApi.aiGeneratePlaylistFromSeed(seedId, direction, duration)
    → commands/ai.rs: get_api_key → rebuild_context_cache (if stale)
    → TrackContextBuilder.build_full_context(tracks_with_analysis)
    → ClaudeClient.send_message(system_prompt + context + user request)
    → parse JSON response → GeneratedPlaylist { track_ids, reasoning }
  → step 2: results UI with TransitionIndicator (BPM + key deltas)
  → save → tauriApi.createPlaylist + addTrackToPlaylist calls
```

### Library Scan Flow

```
User adds folder in Settings
  → tauriApi.addLibraryFolder(path)
    → settings.rs: persists to DB
  → tauriApi.scanDirectory(path)
    → library.rs → Scanner::scan_directory()
      → walkdir for audio files
      → lofty: extract metadata per file
      → sha2: compute file hash for deduplication
      → db.create_track() or db.update_track()
    → returns ScanResult { total, imported, skipped, errors }
  → frontend reloads tracks
  → tauriApi.startFileWatcher(path)
    → watcher.rs: notify watcher emits "library-changed" event
    → frontend listens, re-fetches tracks
```

### Error Flow (IPC)

```
Rust command returns Err(AppError::SomeVariant)
  → serde: serialized as { "kind": "SomeVariant", "message": "..." }
  → tauri-api.ts invoke() rejects with this object
  → component catch block:
    → isAppError(e) type guard (from types/ai.ts)
    → getErrorMessage(e) extracts human-readable string
    → OR: aiStore.ts uses instanceof Error (bug — misses structured errors)
```

---

## Integration Points for Testing

### Rust: What Is Already Testable

| Module | Test Count | Coverage Focus |
|--------|-----------|----------------|
| `db/mod.rs` | ~35 tests | CRUD, migrations, playlist ops, genre, analysis storage |
| `audio/bpm.rs` | ~8 tests | Synthetic click track detection, edge cases |
| `audio/key.rs` | ~12 tests | Pure tone detection, Camelot mapping, edge cases |
| `audio/waveform.rs` | 1 test | Waveform data shape validation |
| `audio/decoder.rs` | 1 test | Decoder stub |
| `scanner.rs` | ~7 tests | Extension filtering, file discovery, hash computation |
| `ai/claude_client.rs` | 2 tests | Request serialization |
| `ai/context_builder.rs` | 1 test | Context JSON shape |
| `commands/ai.rs` | 1 test | ChatMessage serialization |

### Rust: Test Infrastructure Pattern

```rust
// Pattern already used in db/mod.rs:
fn setup_db() -> Database {
    let db = Database::new_in_memory().unwrap();
    db.run_migrations().unwrap();
    db
}
```

### Frontend: Test Infrastructure

Vitest (not Jest) — same Vite config, ESM-native, minimal setup. Zero-dependency targets first: `musicUtils.ts`, `types/ai.ts`, `store/playerStore.ts`.

---

## Component Restructuring Assessment

### Well-Organized (Leave Alone)

| Component | Reason |
|-----------|--------|
| `src-tauri/src/error.rs` | Clean tagged enum, used consistently across all commands |
| `src-tauri/src/db/mod.rs` | Single-responsibility database layer with comprehensive test coverage |
| `src-tauri/src/audio/` | Clean module split: decoder, bpm, key, waveform — each independently testable |
| `src-tauri/src/ai/` | Clean separation: client, context builder, system prompt |
| `src-tauri/src/server/` | Well-structured: mod (server setup), routes (API), streaming (audio delivery) |
| `src/lib/musicUtils.ts` | Good extraction — key/BPM logic pulled from AI components |
| `src/lib/tauri-api.ts` | Clean IPC wrapper pattern, does not swallow errors |
| `src/store/playerStore.ts` | Proper Zustand structure, queue management well-separated |
| `src/types/track.ts` + `types/ai.ts` | Type definitions match Rust DTOs correctly |

### Needs Attention

| Issue | Location | Type | Effort |
|-------|----------|------|--------|
| `audio_mime_type` duplicated | `lib.rs:66` + `server/streaming.rs:214` | Tech debt | XS |
| `greet` stub command still registered | `lib.rs:16,428` | Tech debt | XS |
| Orphaned `/api/tracks/{id}` route | `server/routes.rs:131` | Tech debt | XS |
| `isAppError` not used in `aiStore.ts` | `aiStore.ts` uses `instanceof Error` | Bug | S |
| `App.tsx` as monolithic state hub | `src/App.tsx` (~600+ lines) | Architecture | M |
| `stream://` handler reads entire file into memory | `lib.rs:372-394` | Performance | M |

---

## Patterns to Follow

### Pattern 1: AppState Lock Pattern (Rust)

```rust
#[tauri::command]
pub fn my_command(state: State<AppState>) -> Result<MyDTO, AppError> {
    let db_lock = state.db.lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock.as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    Ok(result)
}
```

### Pattern 2: DTO Conversion (Rust)

```rust
let track: Track = db.get_track(id)?;
let dto: TrackDTO = track.into();
```

### Pattern 3: Frontend Error Handling (TypeScript)

```typescript
try {
  const result = await tauriApi.someCommand()
} catch (e: unknown) {
  const message = getErrorMessage(e) // handles AppError + string + unknown
  setError(message)
}
```

**Current bug:** `aiStore.ts` uses `instanceof Error` in catch blocks, which returns `[object Object]` for structured `AppError` plain objects.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Widening the AppState Lock Scope

Holding `db_lock` across async boundaries deadlocks the entire backend. Each command acquires, operates, and drops its lock within a synchronous scope.

### Anti-Pattern 2: Direct File Path Exposure in Mobile Routes

`MobileTrackDTO` correctly omits `file_path`. Always use it in mobile routes — never expose local filesystem layout over LAN.

### Anti-Pattern 3: Frontend `instanceof Error` for Tauri Errors

Tauri IPC errors are plain objects `{ kind, message }`, not Error instances. Use `isAppError(e)` from `types/ai.ts`.

### Anti-Pattern 4: Adding Commands Directly to `lib.rs`

Add new commands to appropriate `commands/*.rs` module, register in `lib.rs` `invoke_handler![]`. `lib.rs` is already 500+ lines.

### Anti-Pattern 5: Crossfade in Native Mode

`startCrossfadeToNext()` already guards against native mode with an early throw. Do not attempt to add crossfade to native mode (OGG/OPUS fallback path) — it would require dual decoder support in the Rust backend.

---

## Scalability Considerations

| Concern | Current | Implication |
|---------|---------|-------------|
| Full library load | Switching to `getAllTracks()` in v1.3 | Acceptable for DJ libraries (< 10K tracks); monitor startup time |
| Large libraries (10K+ tracks) | Paginated guards removed in v1.3 | Full load will be slow; revisit if audience grows |
| AI context size | Truncates to token budget | No change needed |
| stream:// memory | Reads entire file into Vec<u8> | Deferred optimization |
| Mobile streaming concurrency | Capped via `active_streams` | No change needed |
| Duplicate scan | In-memory grouping after DB load | Fast for any realistic library size |

---

## Sources

All findings based on direct inspection of:
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/TrackTable.tsx` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/TrackTable.css` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/App.tsx` (lines 330-450 track loading logic)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/settings/SettingsContext.tsx` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/settings/DatabaseSection.tsx` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/components/views/SettingsView.tsx` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src/lib/tauri-api.ts` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/src/commands/library.rs` (full)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/src-tauri/src/db/mod.rs` (lines 830-922, duplicate detection)
- `/Users/nemanjamarjanovic/Desktop/Cursor/RecoDeck/.planning/PROJECT.md` (full)

Confidence: HIGH — all findings from direct source code inspection, no reliance on training data inference.
