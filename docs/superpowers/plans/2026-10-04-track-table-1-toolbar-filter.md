# Track Table 1 of 5: Toolbar and Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every track table (All Tracks, a folder, a playlist) a toolbar with the search box, a **Filter** button that opens a panel and names the filter once one is on, and the count on the right ("1,162 of 8,583 tracks"). The footer goes away.

**Architecture:** The filter is pure TypeScript (`src/lib/trackTable/filter.ts`): the `TrackFilter` object the Search and Home plans will reuse, the match, the button label and the panel's genre and key lists. Everything else is built on that. App holds one `tableFilter` for the view on screen and clears it in every handler that opens a view. `TrackTable` applies the filter after its text search. A new backend command, `get_played_track_ids`, feeds the Played field. The panel is a small shared `Popover`. It registers with a new `useOverlay` (Interactions spec), so Esc closes it. It uses the shared button classes and motion tokens, which this plan starts (`controls.css`, `--motion-*`).

**Tech Stack:** React 19, TypeScript, framer-motion, Vitest (jsdom, no Testing Library), plain CSS; Rust (rusqlite) for one query.

**Spec:** `docs/superpowers/specs/2026-10-04-track-table-design.md` — sections *Toolbar*, *Filter*, and the *Data* row for played ids. Mockup: `2026-10-04-track-table-mockup.html`, "Filter: the button and its panel (approved, A)". Read both first.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is built by five plans, in order:**
1. **this plan** — the toolbar, the filter, `get_played_track_ids`, `useOverlay`, `Popover`, the first shared controls;
2. columns and rows — the Columns panel and its stored layout, resizing, sideways scroll, the new columns, `get_play_counts` with App's play-version number, the artwork thumbnails, the 46px rows, the equalizer. It also fixes the gap under the column heads: rows start 36px below the head, from the virtualizer's `scrollMargin`; this is in the current table too;
3. selecting several and the bulk menu — ⌘/Shift-click, ⌘A, Esc, the right-click menu on the selection, `add_tracks_to_playlist`, `remove_tracks_from_playlist`, `bulk_clear_genre`, the toast with Undo;
4. Move to folder;
5. dragging tracks to playlists and folders, and reordering a playlist.

**Out of this plan:** opening All Tracks with a filter from Home or Search (their plans do it with `setTableFilter`), and App's play-version number (plan 2, which reads it first).

**Checked:** every code block below was applied to a scratch worktree of `feat/redesign` at c569e64. `tsc`, `eslint` on the touched files (only the existing warnings) and the whole `vitest` suite (404 passed) pass, and so do `vite build` and `cargo test --lib played_track_ids`. In WebKit (Playwright on a page rendering only `TrackTable`, 300 tracks, `mockIPC`), at 1200×640:
- the toolbar shows "8,583 tracks";
- Filter opens the panel under the button, laid out as the mockup;
- Tech House with 125–129 makes the button "Tech House · 125–129 BPM" and the count "6 of 8,583 tracks", with Show 6 in the panel;
- adding Never played and Added 7 days makes the button "Tech House · 125–129 BPM · +2";
- Esc closes the panel, and so does a click outside it;
- a search inside the filter narrows further, and nothing found shows "No tracks match · Clear filter", whose link clears the filter;
- ✕ on the button clears it.

The first pass showed two problems, both fixed in the code below: the chosen Any/7 days/30 days segment had the same background as the panel, and the BPM boxes showed stepper arrows. A plan review then found two more, also fixed below:
- `main.tsx` loads every component's CSS before `globals.css`, so a `controls.css` imported beside `globals.css` came last and overrode page styles. `.btn` would have turned What's New's `btn btn-primary` button grey. `controls.css` now loads first, before `App`, and that dialog's button drops the bare `btn`.
- A first version kept the table during a search with nothing found through an `allTracksQuery` state. Clearing such a search flashed "No tracks in library" and remounted the table, so All Tracks now keeps its table whenever the library has tracks.

Re-checked in WebKit with the app's CSS order (controls, the components, then `globals.css`). The steps above give the same results, and the Filter button keeps its accent text on hover. A second review found the light theme (Dawn) broken: hover, the chosen segment and the active Filter button's text were mixed with `white`, which in Dawn gives white on white and a 1.2:1 label. They now mix with `--text-primary`, which is white or near-white in the dark themes, so those look the same as before.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/mod.rs` | modify | `get_played_track_ids()` and its test. |
| `src-tauri/src/commands/dashboard.rs` | modify | The `get_played_track_ids` command. |
| `src-tauri/src/lib.rs` | modify | Register the command. |
| `src/lib/tauri-api.ts` | modify | `getPlayedTrackIds()`. |
| `src/lib/trackTable/filter.ts` | create | `TrackFilter`, the match, labels, the genre and key lists. Pure. |
| `src/lib/trackTable/filter.test.ts` | create | Its tests. |
| `src/lib/trackTable/count.ts` | create | The toolbar's count text. Pure. |
| `src/lib/trackTable/count.test.ts` | create | Its tests. |
| `src/lib/overlays.ts` | create | `useOverlay`: the open overlays, Esc closes the last one. |
| `src/lib/overlays.test.ts` | create | Its tests. |
| `src/lib/motion.ts` | create | The motion durations and easing for framer-motion. |
| `src/styles/globals.css` | modify | `--motion-fast/base/slow`, `--ease`. |
| `src/styles/controls.css` | create | `.btn`, `.btn--primary`, `.btn--sm`, `.segmented`. |
| `src/main.tsx` | modify | Import `controls.css` first, before `App`. |
| `src/components/WhatsNewDialog.tsx` | modify | Its button drops the bare `btn` class, so it keeps its look. |
| `src/components/Popover.tsx`, `Popover.css` | create | A panel under its button, with useOverlay and outside-click. |
| `src/components/track-table/usePlayedTrackIds.ts` | create | Reads the played ids when Played is set. |
| `src/components/track-table/FilterPanel.tsx` | create | The panel's fields. |
| `src/components/track-table/FilterButton.tsx` | create | The button, its ✕, and the popover. |
| `src/components/track-table/TrackFilter.css` | create | Their styles. |
| `src/components/TrackTable.tsx` | modify | Filter after search, the toolbar, the count, "No tracks match", no footer. |
| `src/components/TrackTable.css` | modify | The toolbar; the footer's rules go. |
| `src/App.tsx` | modify | `tableFilter`, cleared in every view handler; `totalCount`; All Tracks keeps its table while the library has tracks. |

---

### Task 0: Baseline

- [ ] **Step 1: Be on the branch**

```bash
git switch feat/redesign
git status --short --untracked-files=no   # only .claude/settings.local.json and .planning/STATE.md may show; leave them (untracked files are the user's, leave them too)
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass (a few in `tracklist.test.ts` are skipped only where its untracked fixtures are absent), no type errors.

Run: `npx eslint src 2>&1 | tail -2`
Expected: `✖ 22 problems (10 errors, 12 warnings)`. These are the existing ones, none in the files this plan touches except three warnings: two in `App.tsx` (lines ~342 and ~347, `exhaustive-deps`) and one in `TrackTable.tsx` (`incompatible-library` on `useVirtualizer`). They must stay the only ones in those files.

---

### Task 1: Played track ids (backend)

**Files:**
- Modify: `src-tauri/src/db/mod.rs` (beside `record_play_event`, ~line 2083; the test goes at the end of `mod tests`)
- Modify: `src-tauri/src/commands/dashboard.rs`
- Modify: `src-tauri/src/lib.rs` (~line 587)
- Modify: `src/lib/tauri-api.ts` (the Dashboard section, ~line 991)

- [ ] **Step 1: Write the failing test**

Add at the end of `mod tests` in `src-tauri/src/db/mod.rs`, before the module's closing `}` (the file's last line):

```rust
    #[test]
    fn test_get_played_track_ids_lists_each_played_track_once() {
        let db = Database::new_in_memory().unwrap();
        db.run_migrations().unwrap();

        let mut ids = Vec::new();
        for n in 0..3 {
            let mut track = create_test_track();
            track.file_path = format!("/path/to/played-{}.mp3", n);
            track.file_hash = format!("played-{}", n);
            ids.push(db.create_track(&track).unwrap());
        }
        db.record_play_event(ids[2], None).unwrap();
        db.record_play_event(ids[0], Some(7)).unwrap();
        db.record_play_event(ids[2], None).unwrap();

        assert_eq!(db.get_played_track_ids().unwrap(), vec![ids[0], ids[2]]);
    }
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd src-tauri && cargo test --lib played_track_ids; cd ..`
Expected: compile error, `no method named get_played_track_ids`.

- [ ] **Step 3: Add the query**

In `src-tauri/src/db/mod.rs`, directly above `/// Get recently played tracks (joined with track data), ordered by most recent first.`:

```rust
    /// Every track played at least once, each once, for the track table's
    /// Played filter.
    pub fn get_played_track_ids(&self) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT track_id FROM play_history
             WHERE track_id IS NOT NULL
             ORDER BY track_id",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        rows.collect()
    }

```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `cd src-tauri && cargo test --lib played_track_ids; cd ..`
Expected: `test db::tests::test_get_played_track_ids_lists_each_played_track_once ... ok`.

- [ ] **Step 5: Add the command**

In `src-tauri/src/commands/dashboard.rs`, directly above `#[tauri::command]` of `pub fn get_recently_played(`:

```rust
/// Every track played at least once, for the track table's Played filter.
#[tauri::command]
pub fn get_played_track_ids(state: State<AppState>) -> Result<Vec<i64>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::Internal("State lock failed".to_string()))?;
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database not initialized".to_string()))?;

    db.get_played_track_ids()
        .map_err(|e| AppError::Internal(format!("Failed to read played tracks: {}", e)))
}

```

In `src-tauri/src/lib.rs`, after `commands::dashboard::get_recently_played,`:

```rust
            commands::dashboard::get_played_track_ids,
```

In `src/lib/tauri-api.ts`, directly above `async getRecentlyPlayed(limit?: number): Promise<{`:

```ts
  /** Every track played at least once (the track table's Played filter). */
  async getPlayedTrackIds(): Promise<number[]> {
    return await invoke('get_played_track_ids')
  },

```

- [ ] **Step 6: Check it builds**

Run: `cd src-tauri && cargo build; cd .. && npx tsc --noEmit -p .`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/commands/dashboard.rs src-tauri/src/lib.rs src/lib/tauri-api.ts
git commit -m "feat(tracks): get_played_track_ids lists every track played at least once"
```

---

### Task 2: The filter

**Files:**
- Create: `src/lib/trackTable/filter.ts`
- Test: `src/lib/trackTable/filter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/filter.test.ts
import { describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import {
  applyTrackFilter,
  filterButtonLabel,
  filterConditionLabels,
  isEmptyFilter,
  parseBpmInput,
  parseUtcDate,
  trackFacets,
  withFilterField,
  type FilterContext,
  type TrackFilter,
} from './filter'

let nextId = 1
function track(fields: Partial<Track> = {}): Track {
  const id = nextId++
  return {
    id,
    file_path: `/music/${id}.mp3`,
    file_hash: `hash-${id}`,
    play_count: 0,
    rating: 0,
    ...fields,
  }
}

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0)
const context: FilterContext = { playedIds: null, now: NOW }
const ids = (tracks: Track[]) => tracks.map((t) => t.id)

describe('the track filter', () => {
  it('keeps every track with no filter, or an empty one', () => {
    const tracks = [track(), track()]
    expect(applyTrackFilter(tracks, null, context)).toBe(tracks)
    expect(applyTrackFilter(tracks, {}, context)).toBe(tracks)
  })

  it('matches the genre exactly', () => {
    const house = track({ genre: 'House' })
    const deep = track({ genre: 'Deep House' })
    expect(ids(applyTrackFilter([house, deep, track()], { genre: 'House' }, context))).toEqual([
      house.id,
    ])
  })

  describe('BPM', () => {
    const tracks = [124.99, 125, 129.99, 130].map((bpm) => track({ bpm }))
    const bpms = (filter: TrackFilter) =>
      applyTrackFilter(tracks, filter, context).map((t) => t.bpm)

    it('125–129 holds 125 up to just under 130', () => {
      expect(bpms({ bpmMin: 125, bpmMax: 130 })).toEqual([125, 129.99])
    })

    it('takes a minimum alone', () => {
      expect(bpms({ bpmMin: 125 })).toEqual([125, 129.99, 130])
    })

    it('takes a maximum alone', () => {
      expect(bpms({ bpmMax: 130 })).toEqual([124.99, 125, 129.99])
    })

    it('leaves out a track with no BPM', () => {
      expect(applyTrackFilter([track()], { bpmMin: 0 }, context)).toEqual([])
    })
  })

  it('matches the key exactly', () => {
    const a = track({ musical_key: '6A' })
    const b = track({ musical_key: '6B' })
    expect(ids(applyTrackFilter([a, b, track()], { key: '6A' }, context))).toEqual([a.id])
  })

  describe('Added', () => {
    it('reads the stored time as UTC', () => {
      expect(parseUtcDate('2026-10-03 23:30:00')).toBe(Date.UTC(2026, 9, 3, 23, 30))
      expect(parseUtcDate(undefined)).toBeNull()
      expect(parseUtcDate('not a date')).toBeNull()
    })

    it('keeps a track added within the days, to the minute', () => {
      const late = track({ date_added: '2026-10-03 23:30:00' })
      const at = (now: number) => ids(applyTrackFilter([late], { added: 7 }, { playedIds: null, now }))
      expect(at(Date.UTC(2026, 9, 10, 23, 29))).toEqual([late.id])
      expect(at(Date.UTC(2026, 9, 10, 23, 31))).toEqual([])
    })

    it('counts 30 days', () => {
      const old = track({ date_added: '2026-09-15 12:00:00' })
      expect(ids(applyTrackFilter([old], { added: 7 }, context))).toEqual([])
      expect(ids(applyTrackFilter([old], { added: 30 }, context))).toEqual([old.id])
    })

    it('leaves out a track with no date', () => {
      expect(applyTrackFilter([track()], { added: 30 }, context)).toEqual([])
    })
  })

  describe('Played', () => {
    const played = track()
    const fresh = track()
    const withPlays: FilterContext = { playedIds: new Set([played.id]), now: NOW }

    it('Never keeps the tracks not played', () => {
      expect(ids(applyTrackFilter([played, fresh], { played: 'never' }, withPlays))).toEqual([
        fresh.id,
      ])
    })

    it('Played keeps the tracks played', () => {
      expect(ids(applyTrackFilter([played, fresh], { played: 'played' }, withPlays))).toEqual([
        played.id,
      ])
    })

    it('keeps nothing until the played tracks are read', () => {
      expect(applyTrackFilter([played, fresh], { played: 'never' }, context)).toEqual([])
    })
  })

  it('keeps a rating at or above the minimum', () => {
    const tracks = [0, 2, 3, 5].map((rating) => track({ rating }))
    expect(applyTrackFilter(tracks, { minRating: 3 }, context).map((t) => t.rating)).toEqual([
      3, 5,
    ])
  })

  it('needs every field to match', () => {
    const hit = track({ genre: 'House', bpm: 126, rating: 4 })
    const wrongBpm = track({ genre: 'House', bpm: 122, rating: 4 })
    const wrongGenre = track({ genre: 'Techno', bpm: 126, rating: 4 })
    const filter: TrackFilter = { genre: 'House', bpmMin: 125, bpmMax: 130, minRating: 3 }
    expect(ids(applyTrackFilter([hit, wrongBpm, wrongGenre], filter, context))).toEqual([hit.id])
  })
})

describe('the button label', () => {
  it('names each field', () => {
    expect(filterConditionLabels({ genre: 'Tech House' })).toEqual(['Tech House'])
    expect(filterConditionLabels({ bpmMin: 125, bpmMax: 130 })).toEqual(['125–129 BPM'])
    expect(filterConditionLabels({ bpmMin: 135 })).toEqual(['135+ BPM'])
    expect(filterConditionLabels({ bpmMax: 115 })).toEqual(['< 115 BPM'])
    expect(filterConditionLabels({ key: '6A' })).toEqual(['Key 6A'])
    expect(filterConditionLabels({ added: 7 })).toEqual(['Added 7 days'])
    expect(filterConditionLabels({ added: 30 })).toEqual(['Added 30 days'])
    expect(filterConditionLabels({ played: 'never' })).toEqual(['Never played'])
    expect(filterConditionLabels({ played: 'played' })).toEqual(['Played'])
    expect(filterConditionLabels({ minRating: 3 })).toEqual(['★3+'])
    expect(filterConditionLabels({ minRating: 5 })).toEqual(['★5'])
  })

  it('lists the fields in the panel order', () => {
    expect(
      filterConditionLabels({ minRating: 2, played: 'never', key: '8A', genre: 'House' }),
    ).toEqual(['House', 'Key 8A', 'Never played', '★2+'])
  })

  it('shows the first two', () => {
    expect(filterButtonLabel({ genre: 'Tech House', bpmMin: 125, bpmMax: 130 })).toBe(
      'Tech House · 125–129 BPM',
    )
  })

  it('counts the rest as +N', () => {
    expect(
      filterButtonLabel({ genre: 'Tech House', bpmMin: 125, bpmMax: 130, key: '6A', added: 7 }),
    ).toBe('Tech House · 125–129 BPM · +2')
  })

  it('is null with no field set', () => {
    expect(filterButtonLabel(null)).toBeNull()
    expect(filterButtonLabel({})).toBeNull()
  })
})

describe('the genre and key lists', () => {
  it('counts genres, most first, then by name', () => {
    const tracks = [
      track({ genre: 'House' }),
      track({ genre: 'Techno' }),
      track({ genre: 'House' }),
      track({ genre: 'Afro House' }),
      track(),
    ]
    expect(trackFacets(tracks, null).genres).toEqual([
      { value: 'House', count: 2 },
      { value: 'Afro House', count: 1 },
      { value: 'Techno', count: 1 },
    ])
  })

  it('orders keys as on the Camelot wheel', () => {
    const tracks = ['12B', '1B', '6A', '1A', '10A'].map((k) => track({ musical_key: k }))
    expect(trackFacets(tracks, null).keys.map((k) => k.value)).toEqual([
      '1A',
      '1B',
      '6A',
      '10A',
      '12B',
    ])
  })

  it('keeps the chosen value with no tracks, at 0', () => {
    const facets = trackFacets([track({ genre: 'House' })], { genre: 'Techno', key: '8A' })
    expect(facets.genres).toContainEqual({ value: 'Techno', count: 0 })
    expect(facets.keys).toEqual([{ value: '8A', count: 0 }])
  })
})

describe('changing one field', () => {
  it('sets it', () => {
    expect(withFilterField({ genre: 'House' }, 'minRating', 3)).toEqual({
      genre: 'House',
      minRating: 3,
    })
  })

  it('removes it, given undefined', () => {
    expect(withFilterField({ genre: 'House', minRating: 3 }, 'minRating', undefined)).toEqual({
      genre: 'House',
    })
  })

  it('answers null when nothing is left', () => {
    expect(withFilterField({ genre: 'House' }, 'genre', undefined)).toBeNull()
    expect(isEmptyFilter(null)).toBe(true)
    expect(isEmptyFilter({ genre: undefined })).toBe(true)
  })
})

describe('the BPM boxes', () => {
  it('read whole numbers', () => {
    expect(parseBpmInput('125')).toBe(125)
    expect(parseBpmInput('125.7')).toBe(125)
    expect(parseBpmInput('')).toBeUndefined()
    expect(parseBpmInput('-3')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/filter.test.ts`
Expected: FAIL — `Failed to resolve import "./filter"`.

- [ ] **Step 3: Write the filter**

```ts
// src/lib/trackTable/filter.ts
// The track table's filter (track table spec): which fields narrow the view,
// whether a track matches, the button's label and the panel's genre and key
// lists. The Search and Home plans open All Tracks with one field set.
import type { Track } from '../../types/track'

export interface TrackFilter {
  genre?: string
  /** Inclusive. */
  bpmMin?: number
  /** Exclusive; absent = no upper bound. The panel's "to" shows bpmMax − 1. */
  bpmMax?: number
  key?: string
  /** Days. */
  added?: 7 | 30
  played?: 'never' | 'played'
  /** 1–5. */
  minRating?: number
}

export interface FilterContext {
  /** Every track played at least once; null until read. */
  playedIds: ReadonlySet<number> | null
  /** Milliseconds since the epoch; Added counts back from it. */
  now?: number
}

export interface FacetOption {
  value: string
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** True for null and for a filter with no field set. */
export function isEmptyFilter(filter: TrackFilter | null | undefined): boolean {
  return !filter || Object.values(filter).every((value) => value === undefined)
}

/** `filter` with one field set, or removed when `value` is undefined; null when nothing is left. */
export function withFilterField<K extends keyof TrackFilter>(
  filter: TrackFilter | null,
  field: K,
  value: TrackFilter[K] | undefined,
): TrackFilter | null {
  const next: TrackFilter = { ...filter }
  if (value === undefined) delete next[field]
  else next[field] = value
  return isEmptyFilter(next) ? null : next
}

/**
 * The tracks table's `date_added` ("2026-10-03 21:14:05", SQLite's
 * datetime('now')) is UTC with no zone; read it as UTC.
 */
export function parseUtcDate(value: string | undefined): number | null {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

export function matchesTrackFilter(
  track: Track,
  filter: TrackFilter,
  context: FilterContext,
): boolean {
  if (filter.genre !== undefined && track.genre !== filter.genre) return false
  if (filter.bpmMin !== undefined || filter.bpmMax !== undefined) {
    if (!track.bpm) return false
    if (filter.bpmMin !== undefined && track.bpm < filter.bpmMin) return false
    if (filter.bpmMax !== undefined && track.bpm >= filter.bpmMax) return false
  }
  if (filter.key !== undefined && track.musical_key !== filter.key) return false
  if (filter.added !== undefined) {
    const added = parseUtcDate(track.date_added)
    const now = context.now ?? Date.now()
    if (added === null || now - added > filter.added * DAY_MS) return false
  }
  if (filter.played !== undefined) {
    if (!context.playedIds) return false
    const played = context.playedIds.has(track.id)
    if (filter.played === 'never' ? played : !played) return false
  }
  if (filter.minRating !== undefined && (track.rating ?? 0) < filter.minRating) {
    return false
  }
  return true
}

/** The tracks the filter keeps, in their order; all of them with no filter. */
export function applyTrackFilter(
  tracks: Track[],
  filter: TrackFilter | null,
  context: FilterContext,
): Track[] {
  if (!filter || isEmptyFilter(filter)) return tracks
  const now = context.now ?? Date.now()
  return tracks.filter((track) =>
    matchesTrackFilter(track, filter, { ...context, now }),
  )
}

/** "★3+"; the top rating alone is "★5". */
export function ratingLabel(minRating: number): string {
  return minRating >= 5 ? '★5' : `★${minRating}+`
}

/** One label per field set, in the panel's order. */
export function filterConditionLabels(filter: TrackFilter): string[] {
  const labels: string[] = []
  if (filter.genre !== undefined) labels.push(filter.genre)
  if (filter.bpmMin !== undefined && filter.bpmMax !== undefined) {
    labels.push(`${filter.bpmMin}–${filter.bpmMax - 1} BPM`)
  } else if (filter.bpmMin !== undefined) {
    labels.push(`${filter.bpmMin}+ BPM`)
  } else if (filter.bpmMax !== undefined) {
    labels.push(`< ${filter.bpmMax} BPM`)
  }
  if (filter.key !== undefined) labels.push(`Key ${filter.key}`)
  if (filter.added !== undefined) labels.push(`Added ${filter.added} days`)
  if (filter.played !== undefined) {
    labels.push(filter.played === 'never' ? 'Never played' : 'Played')
  }
  if (filter.minRating !== undefined) labels.push(ratingLabel(filter.minRating))
  return labels
}

/** "Tech House · 125–129 BPM · +2"; null with no field set. */
export function filterButtonLabel(filter: TrackFilter | null): string | null {
  if (!filter) return null
  const labels = filterConditionLabels(filter)
  if (labels.length === 0) return null
  const shown = labels.slice(0, 2)
  if (labels.length > 2) shown.push(`+${labels.length - 2}`)
  return shown.join(' · ')
}

/** A BPM box's text as a whole number; undefined when empty or not a number. */
export function parseBpmInput(text: string): number | undefined {
  const value = Number.parseInt(text, 10)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

// Camelot keys ("8A") by number, A before B; anything else after, by name.
function compareKeys(a: string, b: string): number {
  const pa = /^(\d{1,2})([AB])$/i.exec(a)
  const pb = /^(\d{1,2})([AB])$/i.exec(b)
  if (pa && pb) {
    return (
      Number(pa[1]) - Number(pb[1]) ||
      pa[2].toUpperCase().localeCompare(pb[2].toUpperCase())
    )
  }
  if (pa) return -1
  if (pb) return 1
  return a.localeCompare(b)
}

function toOptions(counts: Map<string, number>): FacetOption[] {
  return [...counts].map(([value, count]) => ({ value, count }))
}

/**
 * The genres (most tracks first) and keys (Camelot order) among the view's
 * tracks before the filter. The value chosen stays in its list even where no
 * track has it.
 */
export function trackFacets(
  tracks: Track[],
  filter: TrackFilter | null,
): { genres: FacetOption[]; keys: FacetOption[] } {
  const genres = new Map<string, number>()
  const keys = new Map<string, number>()
  for (const track of tracks) {
    if (track.genre) genres.set(track.genre, (genres.get(track.genre) ?? 0) + 1)
    if (track.musical_key) {
      keys.set(track.musical_key, (keys.get(track.musical_key) ?? 0) + 1)
    }
  }
  if (filter?.genre !== undefined && !genres.has(filter.genre)) {
    genres.set(filter.genre, 0)
  }
  if (filter?.key !== undefined && !keys.has(filter.key)) keys.set(filter.key, 0)
  return {
    genres: toOptions(genres).sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value),
    ),
    keys: toOptions(keys).sort((a, b) => compareKeys(a.value, b.value)),
  }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/filter.test.ts`
Expected: PASS, 28 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/filter.ts src/lib/trackTable/filter.test.ts
git commit -m "feat(tracks): the track filter — fields, matching, the button's label, the genre and key lists"
```

---

### Task 3: The count

**Files:**
- Create: `src/lib/trackTable/count.ts`
- Test: `src/lib/trackTable/count.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/trackTable/count.test.ts
import { describe, expect, it } from 'vitest'
import { trackCountLabel } from './count'

describe('the track count', () => {
  it('shows the total alone with no search or filter', () => {
    expect(trackCountLabel(8583, 8583, false)).toBe('8,583 tracks')
  })

  it('shows the rows out of the total while narrowed', () => {
    expect(trackCountLabel(1162, 8583, true)).toBe('1,162 of 8,583 tracks')
    expect(trackCountLabel(0, 8583, true)).toBe('0 of 8,583 tracks')
  })

  it('says track for one', () => {
    expect(trackCountLabel(1, 1, false)).toBe('1 track')
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/trackTable/count.test.ts`
Expected: FAIL — `Failed to resolve import "./count"`.

- [ ] **Step 3: Write the count**

```ts
// src/lib/trackTable/count.ts
// The count at the right of the track table's toolbar.

const format = (n: number) => n.toLocaleString('en-US')

/**
 * "8,583 tracks" with no search or filter, "1,162 of 8,583 tracks" while
 * either narrows the view. `total` is the view's: the whole library in All
 * Tracks, the folder's or the playlist's tracks elsewhere.
 */
export function trackCountLabel(shown: number, total: number, narrowed: boolean): string {
  const noun = total === 1 ? 'track' : 'tracks'
  return narrowed
    ? `${format(shown)} of ${format(total)} ${noun}`
    : `${format(total)} ${noun}`
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/trackTable/count.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackTable/count.ts src/lib/trackTable/count.test.ts
git commit -m "feat(tracks): the toolbar's count, the total alone or the rows out of it"
```

---

### Task 4: Overlays, motion tokens, shared controls

`useOverlay` is the Interactions spec's piece. The track table is the first plan to need it (its Filter popover), so it builds it now, to that spec's rules. Esc closing the overlay opened last lives here for now. The Interactions plan later folds it into its `useShortcuts`. The controls are the spec's `.btn` and segmented control, limited to what this plan uses. The Interactions plan adds the rest and the `Button` component.

**Files:**
- Create: `src/lib/overlays.ts`, `src/lib/overlays.test.ts`
- Create: `src/lib/motion.ts`
- Modify: `src/styles/globals.css` (the `:root` block that ends with `--radius-xl: 12px;`, ~line 32)
- Create: `src/styles/controls.css`
- Modify: `src/main.tsx`
- Modify: `src/components/WhatsNewDialog.tsx` (line 59)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/overlays.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeTopOverlay, isOverlayOpen, registerOverlay } from './overlays'

describe('open overlays', () => {
  const unregisters: Array<() => void> = []
  const open = () => {
    const close = vi.fn()
    unregisters.push(registerOverlay(close))
    return close
  }
  const pressEscape = (repeat = false) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat }))

  afterEach(() => {
    unregisters.splice(0).forEach((unregister) => unregister())
  })

  it('knows when one is open', () => {
    expect(isOverlayOpen()).toBe(false)
    open()
    expect(isOverlayOpen()).toBe(true)
  })

  it('closes the one opened last', () => {
    const first = open()
    const second = open()
    expect(closeTopOverlay()).toBe(true)
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('forgets one that closed by itself', () => {
    const first = open()
    registerOverlay(vi.fn())()
    closeTopOverlay()
    expect(first).toHaveBeenCalledOnce()
  })

  it('answers false with none open', () => {
    expect(closeTopOverlay()).toBe(false)
  })

  it('closes the top one on Esc', () => {
    const first = open()
    const second = open()
    pressEscape()
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('ignores a held Esc and other keys', () => {
    const close = open()
    pressEscape(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(close).not.toHaveBeenCalled()
  })

  it('stops listening once the last one closes', () => {
    const close = vi.fn()
    registerOverlay(close)()
    pressEscape()
    expect(close).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/overlays.test.ts`
Expected: FAIL — `Failed to resolve import "./overlays"`.

- [ ] **Step 3: Write the overlays**

```ts
// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. Global shortcuts and the set video read `isOverlayOpen()`
// once their plans build them.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.repeat) return
  if (closeTopOverlay()) {
    event.preventDefault()
    event.stopPropagation()
  }
}

/** Adds an open overlay; the answer removes it again. */
export function registerOverlay(close: Close): () => void {
  const entry = { close }
  stack.push(entry)
  if (stack.length === 1) window.addEventListener('keydown', onKeyDown, true)
  return () => {
    const index = stack.indexOf(entry)
    if (index !== -1) stack.splice(index, 1)
    if (stack.length === 0) window.removeEventListener('keydown', onKeyDown, true)
  }
}

export function isOverlayOpen(): boolean {
  return stack.length > 0
}

/** Asks the overlay opened last to close; false when none is open. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

/** Registers the calling overlay while `open` is true. */
export function useOverlay(open: boolean, onClose: Close): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    return registerOverlay(() => closeRef.current())
  }, [open])
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/overlays.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the motion values**

```ts
// src/lib/motion.ts
// The Interactions spec's three durations and one easing, in seconds for
// framer-motion; the same values as --motion-* and --ease in globals.css.
export const MOTION = { fast: 0.12, base: 0.18, slow: 0.24 } as const

export const EASE: [number, number, number, number] = [0.2, 0, 0, 1]
```

In `src/styles/globals.css`, in the first `:root` block, replace

```css
  --radius-xl: 12px;
}
```

with

```css
  --radius-xl: 12px;

  /* Motion (Interactions spec): three durations, one easing */
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

- [ ] **Step 6: Add the shared controls**

```css
/* src/styles/controls.css */
/* Shared controls (Interactions spec). Every button has a 6px corner; hover
   is one step lighter, press scales to 0.97 one step darker, keyboard focus
   shows a 2px accent ring with a 2px gap, disabled is 40% opacity. Lighter
   mixes in --text-primary, not white, so it reads in the light themes. The
   Interactions plan adds .btn--icon, .btn--danger, .btn--pill and the
   Button component. */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.btn:hover {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 6%);
  color: var(--text-primary);
}

.btn:active {
  transform: scale(0.97);
  background: color-mix(in srgb, var(--bg-elevated), black 15%);
}

.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.btn--primary {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.btn--primary:hover {
  background: var(--accent-hover);
  color: #fff;
}

.btn--primary:active {
  background: color-mix(in srgb, var(--accent), black 15%);
}

.btn--sm {
  height: 28px;
}

/* Segmented control: follows the buttons */
.segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.segmented__item {
  flex: 1;
  padding: 5px 0;
  border: none;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.segmented__item:hover {
  color: var(--text-primary);
}

.segmented__item[aria-pressed='true'] {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 10%);
  color: var(--text-primary);
}

.segmented__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .btn:active {
    transform: none;
  }
}
```

`src/main.tsx` imports `./App` before `./styles/globals.css`, so every component's CSS comes first in the page and `globals.css` last. The shared controls must come before the pages' own rules, which then win over `.btn` at equal specificity (for example, the active Filter button keeps its accent text on hover). In `src/main.tsx` replace

```ts
import ReactDOM from 'react-dom/client'
import App from './App'
```

with

```ts
import ReactDOM from 'react-dom/client'
// The shared controls come before every page's own styles, which win over
// them at equal specificity.
import './styles/controls.css'
import App from './App'
```

`WhatsNewDialog` is the one place that already uses a bare `btn` class (`className="btn btn-primary"`); `.btn`'s hover and press would turn it grey. In `src/components/WhatsNewDialog.tsx` replace

```tsx
          <button className="btn btn-primary" onClick={onClose}>
```

with

```tsx
          <button className="btn-primary" onClick={onClose}>
```

Check no other element uses a bare `btn` class (this runs before the track table's own `.btn` buttons exist):

```bash
grep -rnE 'className="([^"]* )?btn( [^"]*)?"' src mobile
```

Expected: no output.

- [ ] **Step 7: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/lib/overlays.ts src/lib/overlays.test.ts src/lib/motion.ts src/main.tsx src/components/WhatsNewDialog.tsx`
Expected: no errors, no warnings.

```bash
git add src/lib/overlays.ts src/lib/overlays.test.ts src/lib/motion.ts src/styles/globals.css src/styles/controls.css src/main.tsx src/components/WhatsNewDialog.tsx
git commit -m "feat(ui): useOverlay, the motion tokens and the shared buttons and segmented control"
```

---

### Task 5: Popover

No unit test: it is a thin component (the repo has no Testing Library). Task 9 checks it in the app.

**Files:**
- Create: `src/components/Popover.tsx`, `src/components/Popover.css`

- [ ] **Step 1: Write the component**

```tsx
// src/components/Popover.tsx
// A panel that hangs under its button: it opens with a fade, a 4px drop and
// a scale from 0.98 and closes faster (Interactions spec). It registers with
// useOverlay, so Esc closes it; so does a press outside its anchor.
import { useEffect, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useOverlay } from '../lib/overlays'
import { EASE, MOTION } from '../lib/motion'
import './Popover.css'

interface PopoverProps {
  open: boolean
  onClose: () => void
  /**
   * The positioned element holding the popover and the button that opens it.
   * The popover hangs under it; a press outside it closes the popover.
   */
  anchorRef: RefObject<HTMLElement | null>
  /** Names the panel for screen readers. */
  label: string
  className?: string
  children: ReactNode
}

export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  className,
  children,
}: PopoverProps) {
  const reduceMotion = useReducedMotion()
  useOverlay(open, onClose)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose, anchorRef])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label={label}
          className={className ? `popover ${className}` : 'popover'}
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
              duration: reduceMotion ? MOTION.fast : MOTION.base,
              ease: EASE,
            },
          }}
          exit={{ opacity: 0, transition: { duration: MOTION.fast, ease: EASE } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

```css
/* src/components/Popover.css */
/* A panel under its button (Popover.tsx). The anchor is position: relative. */
.popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transform-origin: top left;
}

.popover__title {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/Popover.tsx`
Expected: no errors, no warnings.

```bash
git add src/components/Popover.tsx src/components/Popover.css
git commit -m "feat(ui): a popover that hangs under its button and closes on Esc or a press outside"
```

---

### Task 6: The Filter button and its panel

**Files:**
- Create: `src/components/track-table/usePlayedTrackIds.ts`
- Create: `src/components/track-table/FilterPanel.tsx`
- Create: `src/components/track-table/FilterButton.tsx`
- Create: `src/components/track-table/TrackFilter.css`

- [ ] **Step 1: Read the played ids when Played is set**

```ts
// src/components/track-table/usePlayedTrackIds.ts
// Every track played at least once, for the filter's Played field. Read when
// Played is set; null until the first read answers.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'

export function usePlayedTrackIds(wanted: boolean): ReadonlySet<number> | null {
  const [ids, setIds] = useState<ReadonlySet<number> | null>(null)

  useEffect(() => {
    if (!wanted) return
    let current = true
    tauriApi
      .getPlayedTrackIds()
      .then((list) => {
        if (current) setIds(new Set(list))
      })
      .catch((err) => {
        console.warn('[TrackTable] Failed to read played tracks:', err)
        if (current) setIds(new Set())
      })
    return () => {
      current = false
    }
  }, [wanted])

  return wanted ? ids : null
}
```

- [ ] **Step 2: The panel**

```tsx
// src/components/track-table/FilterPanel.tsx
// The Filter button's panel (track table spec). Each field applies at once;
// Show N closes the panel, Clear all clears every field.
import { useMemo } from 'react'
import type { Track } from '../../types/track'
import {
  parseBpmInput,
  ratingLabel,
  trackFacets,
  withFilterField,
  type TrackFilter,
} from '../../lib/trackTable/filter'

interface FilterPanelProps {
  /** The view's tracks before the filter: the genre and key lists count them. */
  tracks: Track[]
  filter: TrackFilter | null
  onChange: (filter: TrackFilter | null) => void
  /** The rows the table shows with this filter. */
  shownCount: number
  onClose: () => void
}

interface SegmentOption<T> {
  value: T | undefined
  label: string
}

const ADDED: SegmentOption<7 | 30>[] = [
  { value: undefined, label: 'Any' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
]

const PLAYED: SegmentOption<'never' | 'played'>[] = [
  { value: undefined, label: 'Any' },
  { value: 'never', label: 'Never' },
  { value: 'played', label: 'Played' },
]

const RATINGS = [1, 2, 3, 4, 5]

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          className="segmented__item"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function FilterPanel({
  tracks,
  filter,
  onChange,
  shownCount,
  onClose,
}: FilterPanelProps) {
  const facets = useMemo(() => trackFacets(tracks, filter), [tracks, filter])
  const set = <K extends keyof TrackFilter>(
    field: K,
    value: TrackFilter[K] | undefined,
  ) => onChange(withFilterField(filter, field, value))

  return (
    <>
      <h5 className="popover__title">Filter</h5>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-genre">Genre</label>
        <select
          id="tt-filter-genre"
          className="tt-filter-input"
          value={filter?.genre ?? ''}
          onChange={(e) => set('genre', e.target.value || undefined)}
        >
          <option value="">Any</option>
          {facets.genres.map((genre) => (
            <option key={genre.value} value={genre.value}>
              {genre.value} ({genre.count.toLocaleString('en-US')})
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-bpm-from">BPM</label>
        <div className="tt-filter-range">
          <input
            id="tt-filter-bpm-from"
            className="tt-filter-input"
            type="number"
            min={0}
            step={1}
            placeholder="from"
            value={filter?.bpmMin ?? ''}
            onChange={(e) => set('bpmMin', parseBpmInput(e.target.value))}
          />
          –
          <input
            aria-label="BPM to"
            className="tt-filter-input"
            type="number"
            min={0}
            step={1}
            placeholder="to"
            value={filter?.bpmMax !== undefined ? filter.bpmMax - 1 : ''}
            onChange={(e) => {
              const to = parseBpmInput(e.target.value)
              set('bpmMax', to === undefined ? undefined : to + 1)
            }}
          />
        </div>
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-key">Key</label>
        <select
          id="tt-filter-key"
          className="tt-filter-input"
          value={filter?.key ?? ''}
          onChange={(e) => set('key', e.target.value || undefined)}
        >
          <option value="">Any</option>
          {facets.keys.map((key) => (
            <option key={key.value} value={key.value}>
              {key.value}
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-field">
        <span>Added</span>
        <Segmented
          label="Added"
          options={ADDED}
          value={filter?.added}
          onChange={(value) => set('added', value)}
        />
      </div>

      <div className="tt-filter-field">
        <span>Played</span>
        <Segmented
          label="Played"
          options={PLAYED}
          value={filter?.played}
          onChange={(value) => set('played', value)}
        />
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-rating">Rating</label>
        <select
          id="tt-filter-rating"
          className="tt-filter-input"
          value={filter?.minRating ?? ''}
          onChange={(e) =>
            set('minRating', e.target.value ? Number(e.target.value) : undefined)
          }
        >
          <option value="">Any</option>
          {RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {ratingLabel(rating)}
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-footer">
        <button type="button" className="tt-filter-link" onClick={() => onChange(null)}>
          Clear all
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
          Show {shownCount.toLocaleString('en-US')}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: The button**

```tsx
// src/components/track-table/FilterButton.tsx
// The toolbar's Filter button. With a filter on it names it instead
// ("Tech House · 125–129 BPM ✕"), in the accent style; ✕ clears it.
import { useCallback, useRef, useState } from 'react'
import type { Track } from '../../types/track'
import { filterButtonLabel, type TrackFilter } from '../../lib/trackTable/filter'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { FilterPanel } from './FilterPanel'
import './TrackFilter.css'

interface FilterButtonProps {
  /** The view's tracks before the filter. */
  tracks: Track[]
  filter: TrackFilter | null
  onChange: (filter: TrackFilter | null) => void
  /** The rows the table shows with this filter. */
  shownCount: number
}

export function FilterButton({
  tracks,
  filter,
  onChange,
  shownCount,
}: FilterButtonProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const label = filterButtonLabel(filter)

  return (
    <div ref={anchorRef} className={label ? 'tt-filter tt-filter--on' : 'tt-filter'}>
      <button
        type="button"
        className="btn tt-filter__main"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label ?? undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Icon name="ListFilter" size={14} />
        <span className="tt-filter__label">{label ?? 'Filter'}</span>
      </button>
      {label && (
        <button
          type="button"
          className="btn tt-filter__clear"
          aria-label="Clear filter"
          title="Clear filter"
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      )}
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Filter"
        className="tt-filter-panel"
      >
        <FilterPanel
          tracks={tracks}
          filter={filter}
          onChange={onChange}
          shownCount={shownCount}
          onClose={close}
        />
      </Popover>
    </div>
  )
}
```

- [ ] **Step 4: Their styles**

```css
/* src/components/track-table/TrackFilter.css */
/* The track table's Filter button and its panel (FilterButton.tsx). */

.tt-filter {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  min-width: 0;
}

.tt-filter__label {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* With a filter on, the button and its ✕ read as one accent button. */
.tt-filter--on .tt-filter__main,
.tt-filter--on .tt-filter__clear {
  background: rgba(var(--accent-rgb), 0.18);
  border-color: rgba(var(--accent-rgb), 0.45);
  color: color-mix(in srgb, var(--accent), var(--text-primary) 65%);
}

.tt-filter--on .tt-filter__main:hover,
.tt-filter--on .tt-filter__clear:hover {
  background: rgba(var(--accent-rgb), 0.26);
}

.tt-filter--on .tt-filter__main {
  border-right: none;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.tt-filter--on .tt-filter__clear {
  padding: 0 10px 0 6px;
  border-left: none;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  color: var(--accent-hover);
}

.tt-filter-panel {
  width: 300px;
}

.tt-filter-field {
  display: grid;
  grid-template-columns: 70px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tt-filter-field > :first-child {
  color: var(--text-secondary);
}

.tt-filter-input {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  transition: border-color var(--motion-fast) var(--ease);
}

.tt-filter-input:focus {
  border-color: var(--accent);
  outline: none;
}

/* BPM boxes: plain boxes, no stepper arrows */
.tt-filter-input[type='number'] {
  appearance: textfield;
}

.tt-filter-input::-webkit-inner-spin-button,
.tt-filter-input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}

.tt-filter-range {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.tt-filter-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.tt-filter-link {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease);
}

.tt-filter-link:hover {
  color: var(--text-primary);
}

.tt-filter-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* "No tracks match · Clear filter" under the table */
.track-table-no-match .tt-filter-link {
  color: var(--accent-hover);
}
```

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/track-table`
Expected: no errors, no warnings.

```bash
git add src/components/track-table
git commit -m "feat(tracks): the Filter button and its panel; the button names the filter once one is on"
```

---

### Task 7: The table's toolbar

**Files:**
- Modify: `src/components/TrackTable.tsx`
- Modify: `src/components/TrackTable.css`

Each step below replaces one exact piece of `TrackTable.tsx`. The search memo, the sort and the rows are otherwise unchanged.

- [ ] **Step 1: Imports**

Replace

```tsx
import { Icon } from './Icon'
import { StarRating } from './StarRating'
```

with

```tsx
import { Icon } from './Icon'
import { StarRating } from './StarRating'
import {
  applyTrackFilter,
  isEmptyFilter,
  type TrackFilter,
} from '../lib/trackTable/filter'
import { trackCountLabel } from '../lib/trackTable/count'
import { FilterButton } from './track-table/FilterButton'
import { usePlayedTrackIds } from './track-table/usePlayedTrackIds'
```

- [ ] **Step 2: Props**

Replace

```tsx
  onOpenMixPrep?: (playlistId: number, playlistName: string) => void
  onSearch?: (query: string) => void
}
```

with

```tsx
  onOpenMixPrep?: (playlistId: number, playlistName: string) => void
  onSearch?: (query: string) => void
  /** The view's filter, held by App; null for none. */
  filter?: TrackFilter | null
  onFilterChange?: (filter: TrackFilter | null) => void
  /**
   * The view's track count for the toolbar; `tracks.length` when absent.
   * All Tracks passes the library's, which holds during a backend search.
   */
  totalCount?: number
}
```

and in the destructuring replace

```tsx
      onOpenMixPrep,
      onSearch,
    },
    ref,
```

with

```tsx
      onOpenMixPrep,
      onSearch,
      filter = null,
      onFilterChange,
      totalCount,
    },
    ref,
```

- [ ] **Step 3: Filter after the search**

The search memo is renamed `searchedTracks`, and the filter runs after it as `filteredTracks`. The sort already reads `filteredTracks`. Replace

```tsx
    // --- Search: filter tracks by query across all text fields ---
    const filteredTracks = useMemo(() => {
```

with

```tsx
    // --- Search: filter tracks by query across all text fields ---
    const searchedTracks = useMemo(() => {
```

and replace the memo's end

```tsx
        return fields.some(
          (field) => field != null && field.toLowerCase().includes(query),
        )
      })
    }, [tracks, searchQuery])
```

with

```tsx
        return fields.some(
          (field) => field != null && field.toLowerCase().includes(query),
        )
      })
    }, [tracks, searchQuery])

    // --- Filter: after the search, so the search works inside it ---
    const filterActive = !isEmptyFilter(filter)
    const playedIds = usePlayedTrackIds(filter?.played !== undefined)
    // Played is set and the played tracks are not read yet: show no rows
    // rather than every row for a moment.
    const filterPending = filter?.played !== undefined && playedIds === null
    const filteredTracks = useMemo(
      () =>
        filterPending ? [] : applyTrackFilter(searchedTracks, filter, { playedIds }),
      [searchedTracks, filter, playedIds, filterPending],
    )
    const narrowed = searchQuery.trim() !== '' || filterActive
```

- [ ] **Step 4: The toolbar**

Replace

```tsx
        {/* Search bar — integrated into header area */}
        <div className="track-table-search">
```

with

```tsx
        {/* Toolbar: search, Filter, the AI buttons, the count */}
        <div className="track-table-toolbar">
```

Put the Filter button after the search box: replace

```tsx
              </button>
            )}
          </div>
          {/* AI Recommendations for current playlist (DISC-02) */}
```

with

```tsx
              </button>
            )}
          </div>
          {onFilterChange && (
            <FilterButton
              tracks={tracks}
              filter={filter}
              onChange={onFilterChange}
              shownCount={sortedTracks.length}
            />
          )}
          {/* AI Recommendations for current playlist (DISC-02) */}
```

Put the count at the toolbar's end: replace

```tsx
                  <Icon name="AudioWaveform" size={16} />
                  <span>Mix Prep</span>
                </button>
              )
            })()}
        </div>
```

with

```tsx
                  <Icon name="AudioWaveform" size={16} />
                  <span>Mix Prep</span>
                </button>
              )
            })()}
          <span className="track-table-count">
            {trackCountLabel(
              sortedTracks.length,
              totalCount ?? tracks.length,
              narrowed,
            )}
          </span>
        </div>
```

- [ ] **Step 5: "No tracks match" and no footer**

After the virtualized body, inside the holder, replace

```tsx
              })}
            </div>
          </div>
          </div>
        </div>
```

with

```tsx
              })}
            </div>
          </div>
          {sortedTracks.length === 0 && narrowed && !filterPending && (
            <div className="track-table-no-match">
              No tracks match
              {filterActive && onFilterChange && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="tt-filter-link"
                    onClick={() => onFilterChange(null)}
                  >
                    Clear filter
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        </div>
```

Delete the footer: the whole block from `{/* Footer with track count + sort info */}` through its closing `</div>` (the `track-table-footer` div with the count and "sorted by"), and the blank line after it. The sort still shows as the arrow in its column head.

- [ ] **Step 6: The toolbar's styles**

In `src/components/TrackTable.css`, replace

```css
/* --- Search Bar (integrated into table header area) --- */

.track-table-search {
  flex-shrink: 0;
  padding: 28px 0 0;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-table-search .search-input-wrapper {
  flex: 1;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}
```

with

```css
/* --- Toolbar: search, Filter, the AI buttons, the count --- */

.track-table-toolbar {
  flex-shrink: 0;
  padding: 28px 12px 12px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-table-toolbar .search-input-wrapper {
  flex: 0 1 340px;
  min-width: 160px;
}

.track-table-count {
  margin-left: auto;
  padding-left: 8px;
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.track-table-no-match {
  padding: 48px 16px;
  color: var(--text-secondary);
  font-size: var(--text-base);
  text-align: center;
}
```

and delete the `.track-table-footer { … }` and `.footer-sort-info { … }` rules.

- [ ] **Step 7: Check nothing else used the old classes**

Run: `grep -rn "track-table-search\|track-table-footer\|footer-sort-info" src mobile`
Expected: no output.

- [ ] **Step 8: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/TrackTable.tsx && npx vitest run`
Expected: no type errors; eslint shows only the existing `incompatible-library` warning on `useVirtualizer`; all tests pass.

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css
git commit -m "feat(tracks): the table's toolbar — search, Filter, the count; the footer goes"
```

---

### Task 8: App holds the filter

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import and state**

After `import type { ChannelNews } from './types/youtube'` add:

```tsx
import type { TrackFilter } from './lib/trackTable/filter'
```

Replace

```tsx
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )
```

with

```tsx
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
  const [tableFilter, setTableFilter] = useState<TrackFilter | null>(null)
```

- [ ] **Step 2: Every view handler clears the filter**

Every handler that opens a view calls `setShowAllTracks(…)` on a line of its own. There are 15: `handleFolderSelect`, `openSpotifyList`, `openYouTubeMusicList`, `openSets`, `handlePlaylistSelect`, `openSpotifySettings`, the `registerOpenSettings` callback, and the inline ones (`onOpenSettings`, `onNavigateHome`, `onShowAllTracks`, `onSearch`, `onNavigateSets`, `onNavigateAIChat`, and Home's `onNavigateAIChat` and `onOpenSettings`). Add `setTableFilter(null)` on the line after each, at the same indentation:

```bash
python3 - <<'EOF'
import re
p = 'src/App.tsx'
lines = open(p).read().split('\n')
out = []
for line in lines:
    out.append(line)
    m = re.match(r'^(\s*)setShowAllTracks\((true|false)\)$', line)
    if m:
        out.append(f"{m.group(1)}setTableFilter(null)")
open(p, 'w').write('\n'.join(out))
EOF
grep -c "setTableFilter(null)" src/App.tsx   # expect 15
```

Deleting the open playlist, or the open folder, also leaves the view. In `handleDeletePlaylist` replace

```tsx
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null)
        setSelectedFolder(null)
```

with

```tsx
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null)
        setSelectedFolder(null)
        setTableFilter(null)
```

and in `confirmDeleteFolder` replace

```tsx
      if (selectedFolder === folderPath) {
        setSelectedFolder(null)
        await loadTracks(null, null)
```

with

```tsx
      if (selectedFolder === folderPath) {
        setSelectedFolder(null)
        setTableFilter(null)
        await loadTracks(null, null)
```

Run: `grep -c "setTableFilter(null)" src/App.tsx`
Expected: `17`.

- [ ] **Step 3: A search that finds nothing keeps the table**

Today an All Tracks search with no results sets `tracks` to `[]`, App shows "No tracks in library" instead of the table, and the search box (inside the table) is gone with nothing to clear. All Tracks with no rows while the library has tracks is a search that found nothing, or the tracks still loading, so the table stays. (Opening All Tracks no longer flashes "No tracks in library" while it loads, either.) Replace

```tsx
  // Determine empty state message
  const emptyTitle
```

with

```tsx
  // All Tracks keeps its table, and the search box in it, while the library
  // has tracks: no rows there is a search that found nothing, or the tracks
  // still loading.
  const allTracksWithLibrary =
    showAllTracks && !selectedFolder && !selectedPlaylistId && totalTrackCount > 0

  // Determine empty state message
  const emptyTitle
```

and replace

```tsx
            ) : tracks.length === 0 ? (
```

with

```tsx
            ) : tracks.length === 0 && !allTracksWithLibrary ? (
```

- [ ] **Step 4: Pass the filter and the total to the table**

In the `<TrackTable … />` element, replace

```tsx
                    onSearch={
                      !selectedFolder && !selectedPlaylistId
                        ? handleSearch
                        : undefined
                    }
                  />
```

with

```tsx
                    onSearch={
                      !selectedFolder && !selectedPlaylistId
                        ? handleSearch
                        : undefined
                    }
                    filter={tableFilter}
                    onFilterChange={setTableFilter}
                    totalCount={
                      !selectedFolder && !selectedPlaylistId
                        ? totalTrackCount
                        : undefined
                    }
                  />
```

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/App.tsx && npx vitest run`
Expected: no type errors; eslint shows only the two existing `App.tsx` warnings; all tests pass.

```bash
git add src/App.tsx
git commit -m "feat(tracks): App holds the table's filter, clears it on every view change, and keeps the table when a search finds nothing"
```

---

### Task 9: Check in the app (WebKit)

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Run the app** — `npm run tauri dev` (the Rust command is new: a running dev app restarts itself on the Rust change).

- [ ] **Step 2: The checklist, by hand**
- All Tracks: the toolbar shows the search box, Filter and "8,583 tracks" on the right; no footer under the table; the sorted column still shows its arrow.
- Filter opens a panel under the button with a short drop and fade; Genre lists the library's genres with counts, most first; Key lists the keys in Camelot order.
- Tech House and BPM 125–129: the button reads "Tech House · 125–129 BPM" in the accent style, and the count reads "N of 8,583 tracks". Every row is Tech House at 125.00–129.99, and Show N matches the count.
- Add Never played and Added 30 days: the button ends in "· +2". Played → Played shows only tracks played before.
- Esc closes the panel. So does a click outside it. Clicking the button again toggles it.
- Type in the search box with the filter on: it narrows inside the filter. A search with nothing found shows "No tracks match · Clear filter", and the link clears the filter.
- With no filter, an All Tracks search with nothing found ("zzzz") keeps the table and the box, shows "No tracks match" and "0 of 8,583 tracks". Clearing the box brings every track back with no flash of "No tracks in library", and the sort stays as it was.
- With a filter on, hovering the button keeps its light accent text.
- ✕ on the button clears the filter.
- Go to a folder: no filter, and the count is the folder's ("312 tracks"). Set one, go back to All Tracks: no filter there. The same holds in a playlist.
- Switch the theme to Dawn (light): the active Filter button's text is a readable dark indigo, the chosen Added/Played segment is shaded, and a button darkens slightly on hover.
- In a playlist (its header above the toolbar), on a window about 720px high: the whole panel, Show N included, is visible. If it is cut off at the bottom, note it for plan 2. Its Columns panel will need the same popover, so plan 2 can make it flip or float.
- macOS → Accessibility → Reduce motion on: the panel only fades.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add <the files fixed>
git commit -m "fix(tracks): <what the hand check found>"
```

Skip this step if nothing needed fixing.
