# Sets S2: A Set on a Page of Its Own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A set opens on a page of its own, full width, like a DJ page — and Sets opens on its library. The page's **hero stays put**: the thumbnail (or the video, 440px, while this set plays here, with the scrubber under it), "‹ Sets", the title, the DJs as links "· channel · saved Sep 27", the numbers ("41 tracks · 3 lists · 3 you own · 37 missing · 1 ID", parts with nothing left out), the source line, **Play set** (or Pause, ⏮, ⏭, Stop while it plays) and **⋯** (Open on YouTube · Look again for a tracklist · Copy missing tracks · Remove from library). Under it only the strip, the filter (All · You own · Missing · IDs, with counts) and the rows scroll. Rows are # · Time · Track · Lists · You own · ♡: the number turns into ▶ on hover and into the equalizer while the video is inside the track. A set opens at once with what is known and skeleton rows; a failed read says so with Try again; opened at a track, it scrolls there and plays from the cue. Back returns to the library as it was.

**Architecture:**
- **Pure TypeScript** (tested), `src/lib/sets/setPage.ts`: the hero's numbers and source line, the filter's counts and rows, the missing tracks to copy, the thumbnail address, "saved Sep 27".
- **Store**, `src/store/setsViewStore.ts`: `useSetsView` — the library's tab, grouping and scroll, outliving `SetsView` (Back after a DJ page).
- **Components**, `src/components/sets/`: `SetPage.tsx` (+ `SetPage.css`) and `SetTrackRow.tsx`, new; `TrackScrubber.tsx` and `StoreLinks.tsx`, moved out of `SetsView` as they are (the store links in the spec's order).
- **`SetsView`** keeps the data (sets, saved tracks, matches, echoes, quota) and which page shows: the library (today's box above the tabs Library · Saved · Following · Stats) or the set page; one `openSet(videoId, { cueMs, title })` replaces the arrival effect, opening a stored set, an echo and a hit; a claim (`shownSets`) lets a newer open or Back give up a late one; removing a set asks first.
- **App**: the sidebar's Sets, pressed while Sets shows, asks the library back (`useSetsView.requestLibrary`); comments that spoke of the Set tab follow (App, `DjView`, `DjSetsTab`).

**Tech Stack:** React 19, TypeScript, zustand, Vitest (jsdom). No Rust.

**Spec:** `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` — "The set page" (all of it), "Playing" (the hero's player buttons, the 440px box), "What changes in the code"; the approved mockup `2026-10-04-sets-redesign-mockup.html`, sections 2 (an open set) and 3 (playing). Plan order: (1) the player ✓, **(2) this plan**, (3) the library and the box, (4) Following, Saved and Stats.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 6 writes them into the spec):
- **Until S3**, the library page is today's: the box ("Paste a set link, or type a DJ's name", Process / Search · 101 units, the quota line, the found list) moves above the tabs, and the Library tab keeps its list, "Where did I hear this?" and By DJ / Newest first. The `'set'` tab goes.
- **Back** restores the library's tab, grouping and scroll from `useSetsView`, a store outside `SetsView` (the spec says "kept in App beside `SetsStart`"; a store survives the remount just the same without threading props); the scroll once the list has loaded, and another tab starts at its top. `SetsStart` is unchanged: nothing outside Sets opens a set at a cue yet.
- **One opener.** While a set reads, the page shows the title the opener passed or the library knows ("Reading the set…" when neither does), the thumbnail by id, and 8 skeleton rows. A stored set is stored again on every open, as opening one from the library did (its rows refilled for search and stats; `save_yt_set` keeps `added_at`, so the library's order does not change). A failure: "Couldn't read this set: …" with Try again in place of the rows ("This set" as the title if none is known) and an error toast.
- **Late answers.** A newer open or Back gives up an open on its way (`shownSets` claims): it neither shows, plays nor fetches — so StrictMode's double mount in `tauri dev` fetches a set that is not stored once, not twice. A pasted link, a found set and a channel's upload open their page only if nothing else was opened since. **Look again** never takes the page: answering after Back or another set it is stored (a playing set gets its rows) and says what it found in a toast; its failures and its "only N units left" warning are toasts too (the page has no error line). A retry replaces the last "Couldn't read this set" toast.
- **The sidebar's Sets** while a set's page shows goes back to the library (it does not remount Sets, which keeps its state, so the request goes through `useSetsView`).
- **Remove from library** asks first (the native confirm, as Settings' Disconnect does), from ⋯ and from the library row's bin (which removed at once before), says "Removed from your library", stops the set if it plays and returns to the library when its page was open.
- **The hero**: "‹ Sets" above the title, as the mockup draws it; the length on the thumbnail bottom right; a warm gradient mixed into the theme's background, so it holds on the light themes. Playing here it is the mockup's compact one (no numbers or source line, an 18px title); the picture keeps to the top and both columns give way on a narrow window (the thumbnail to 200px, the video to 240px) — the window has no minimum width. ⋯ is the shared `Menu` (it reports itself as an overlay, so the video steps aside): Open on YouTube (at the position playing, when this set plays), Look again for a tracklist (5–7 units, disabled while it runs), Copy missing tracks (its count; a toast says how many), Remove from library (only for a set in the library).
- **Rows**: ▶ shows on hover and when it has the keyboard (opacity, as Home's rows; only `:focus-visible` hides the number, as WebView2 focuses a clicked button); the playing row hovered offers Pause / Play and keeps its tint; the store links follow the title on hover and while the row holds the keyboard's focus; the playing colour is the track table's (`--accent` toward the text); an ID row is muted with no "missing" and no ♡.
- **The filter** is four buttons with counts in the mockup's tab style (`aria-pressed`); another set is another page (`key`), so it starts on All.
- **The source line** of a list assembled from comments has no "from N lists" (there are none); "Named without a timestamp" shows under a set with no rows too.
- **Dead CSS**: the rules only the old Set tab and video band used go from `SetsView.css`.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `a313c2f`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` and each task's tests pass at every task's end.
- **Review:** an independent review applied the plan to a clean copy (all 31 blocks matched once; every task's checks passed; eslint at the baseline), drove the page in WebKit (and in Chromium for WebView2's focus) with a harness extended by delays, fetches that succeed, Look again, comments-only and loose-only sets, long titles and StrictMode, and found no blockers. Its findings are fixed here:
  - a late Look again took the page back after "‹ Sets", or replaced another set's page (now it never takes the page);
  - under StrictMode (on in `tauri dev`) a set that was not stored was fetched twice, 10–14 units, with two error toasts on failure (now a given-up open neither fetches nor toasts);
  - "Named without a timestamp" vanished for a set with no rows;
  - while playing, the hero overflowed narrow windows (at 800×600 the video sat over the bottom player and the page scrolled sideways);
  - on WebView2 a clicked ▶ left the number cell blank;
  - an assembled set read "from 1 list";
  - a stale scroll came back after a fresh visit; the sidebar's Sets did nothing on a set's page; the store links could not be reached by keyboard.
  - Also taken: Back gives up a slow open (it no longer starts playing in the bar); a retry replaces the error toast; the arriving set is known from the first frame; `initialTab` before the first paint; another tab starts at its top; wrapped DJ links align left; the playing row keeps its tint on hover; the scrubber under the video drops the old band's frame; the comments about the Set tab; a time-zone-proof `savedLabel` test.
  - Left as they are: focus is not moved after Back, an open or Try again (it stays on the page's body); `SetPage` relies on `SetsView.css` for the strip, the scrubber and the store links, which always load with it.
- **Builds and tests:**
  - `vitest`: 10 new. The repo counts 632 after it: 631 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes. No Rust changes.
- **In WebKit** (a test page with the real AppShell, SetsView, SetPlayerBar and the engine, IPC mocked: 15 stored sets, a 12-track set with one ID and two owned tracks, an untimed set with an echo, a set that is not stored and whose fetch is refused, reads delayed 250–900ms; the native panel drawn as an orange box at its bounds), at 1280 and at 1100 in the light Dawn theme:
  - opening: the library's title at once and 8 skeleton rows; then "Marco Carola b2b Luciano · Kiesgrube Open Air · saved Sep 27", "12 tracks · 1 list · 2 you own · 9 missing · 1 ID", "from 1 list · strongest source: the description", the filter "All 12 · You own 2 · Missing 9 · IDs 1" (9, 1, 2 and 12 rows), two "have it";
  - hovering row 2: ▶ and the store links show; its ▶ opens the panel at 5:00 exactly over the 440×248 hero video; row 2 shows the equalizer; the hero reads Pause · ⏮ · ⏭ · Stop · ⋯;
  - ⋯: Open on YouTube · Look again for a tracklist 5–7 units · Copy missing tracks 9 · Remove from library, the panel off the window; Esc: back on the hero;
  - the rows scrolled 400px: the hero and the panel did not move;
  - "‹ Sets": the tabs Library (15) · Saved · Following · Stats; the bar plays on ("5:00 Loco Dice — Pimp Jackson Is Talking Now"), the panel on its box;
  - Newest first and the library scrolled, then a DJ page's Back (Sets remounted on the set) and "‹ Sets": Newest first and the scroll kept;
  - a "Where did I hear this?" hit at 51:00: its row scrolled into view, the set seeking to 51:00, the row playing;
  - the untimed set: the sentence, no ▶ anywhere, "↳ 5:00", which opens the other set at 5:00;
  - ⋯ › Remove from library: the confirm is asked, the set deleted, back on the library, "Removed from your library";
  - a set whose fetch is refused: "Couldn't read this set: Daily YouTube quota is spent …" with Try again, and the error toast; two retries leave one toast;
  - in StrictMode, a set not stored: one fetch; Look again (1.5s) then "‹ Sets": the library stays and a toast says "Looked again at …: Nothing new — still 12 tracks."; Look again, Back, open another set: that set stays; the sidebar's request: back on the library; a loose-only set: the sentence, then "Named without a timestamp" with both names;
  - playing at 960×700 and 800×600: the hero 302px and 255px tall, the rows 325px and 272px, nothing sideways.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/sets/setPage.ts` (+ test) | create | the page's words and numbers |
| `src/store/setsViewStore.ts` | create | the library's tab, grouping and scroll |
| `src/components/sets/StoreLinks.tsx`, `TrackScrubber.tsx` | create (moved) | today's components, out of `SetsView` |
| `src/components/sets/SetTrackRow.tsx` | create | one row of the tracklist |
| `src/components/sets/SetPage.tsx`, `SetPage.css` | create | the set's page |
| `src/components/views/SetsView.tsx`, `SetsView.css` | modify | the library or the page; one opener; remove asks first; dead rules go |
| `src/App.tsx`, `src/components/views/DjView.tsx`, `src/components/dj/DjSetsTab.tsx` | modify | the sidebar's Sets asks the library back; comments about the Set tab |
| `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `a313c2f`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 621 passed (622)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: The page's words and numbers

**Files:** Create `src/lib/sets/setPage.ts`, `src/lib/sets/setPage.test.ts`.

- [ ] **Step 1: The failing test**

Create `src/lib/sets/setPage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  trackLine,
} from './setPage'
import type { MatchSummary } from '../tracklist/match'
import type { Track, TracklistResult } from '../tracklist'

const track = (index: number, over: Partial<Track> = {}): Track =>
  ({ index, cue: '', cueMs: index * 60_000, artist: `Artist ${index}`, title: `Title ${index}`, mix: null, isUnknown: false, ...over } as Track)

// 1 owned, 2 and 4 missing, 3 an ID.
const tracks = [track(1), track(2, { mix: 'Club Mix' }), track(3, { isUnknown: true, artist: null, title: 'ID' }), track(4, { artist: null })]
const matches = { byIndex: new Map([[1, {}]]), owned: 1, missing: 2 } as unknown as MatchSummary

const result = (over: Partial<TracklistResult> = {}): TracklistResult =>
  ({ status: 'ok', source: 'description', sourceMeta: null, sourceCount: 3, tracks, ...over } as TracklistResult)

describe('heroNumbers', () => {
  it('reads tracks, lists, you own, missing and IDs', () => {
    expect(heroNumbers(result(), matches).map((n) => `${n.value} ${n.label}`)).toEqual([
      '4 tracks',
      '3 lists',
      '1 you own',
      '2 missing',
      '1 ID',
    ])
    expect(heroNumbers(result(), matches).find((n) => n.key === 'owned')?.owned).toBe(true)
  })

  it('leaves out the parts with nothing in them', () => {
    const one = result({ sourceCount: 1, tracks: [track(1)] })
    expect(heroNumbers(one, null).map((n) => `${n.value} ${n.label}`)).toEqual(['1 track', '1 list'])
    expect(heroNumbers(result({ sourceCount: 0, tracks: [] }), null)).toEqual([])
  })
})

describe('sourceLine', () => {
  it('says how many lists and the strongest source', () => {
    expect(sourceLine(result())).toBe('from 3 crossed lists · strongest source: the description')
    expect(sourceLine(result({ sourceCount: 1, source: 'comment', sourceMeta: { author: '@dj_nerd', likeCount: 4 } }))).toBe(
      'from 1 list · strongest source: comment by @dj_nerd',
    )
  })

  it('adds the status when the list is not a plain one, and is empty with no tracklist', () => {
    // Assembled from comments: no lists were found to count.
    expect(sourceLine(result({ status: 'assembled', source: null, sourceCount: 0 }))).toBe('assembled from comments')
    expect(sourceLine(result({ status: 'low_confidence' }))).toContain('· low confidence')
    expect(sourceLine(result({ tracks: [] }))).toBe('')
  })
})

describe('the filter', () => {
  it('counts the rows each shows, an ID only under IDs', () => {
    expect(filterCounts(tracks, matches)).toEqual({ all: 4, have: 1, missing: 2, ids: 1 })
  })

  it('shows those rows in the set’s order', () => {
    expect(filterRows(tracks, matches, 'all').map((t) => t.index)).toEqual([1, 2, 3, 4])
    expect(filterRows(tracks, matches, 'have').map((t) => t.index)).toEqual([1])
    expect(filterRows(tracks, matches, 'missing').map((t) => t.index)).toEqual([2, 4])
    expect(filterRows(tracks, matches, 'ids').map((t) => t.index)).toEqual([3])
  })

  it('takes every named row as missing until the match is in', () => {
    expect(filterCounts(tracks, null)).toEqual({ all: 4, have: 0, missing: 3, ids: 1 })
  })
})

describe('copying the missing tracks', () => {
  it('writes "Artist - Title (Mix)" per line', () => {
    expect(trackLine(tracks[1])).toBe('Artist 2 - Title 2 (Club Mix)')
    expect(missingTracks(tracks, matches)).toEqual(['Artist 2 - Title 2 (Club Mix)', 'Title 4'])
  })
})

describe('labels', () => {
  it('builds the thumbnail address', () => {
    expect(thumbnailUrl('AvoifrdCfFM')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/hqdefault.jpg')
    expect(thumbnailUrl('AvoifrdCfFM', 'mqdefault')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/mqdefault.jpg')
  })

  it('says when the set was saved, with the year when it is not this one', () => {
    // SQLite's UTC text for a local time, so the day holds in any time zone.
    const stored = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
    const now = new Date(2026, 9, 8)
    expect(savedLabel(stored(new Date(2026, 8, 27, 12)), now)).toBe('saved Sep 27')
    expect(savedLabel(stored(new Date(2025, 11, 31, 12)), now)).toBe('saved Dec 31, 2025')
    expect(savedLabel(undefined, now)).toBeNull()
  })
})
```

Run `npx vitest run src/lib/sets`: FAIL — `./setPage` does not exist.

- [ ] **Step 2: The functions**

Create `src/lib/sets/setPage.ts`:

```ts
// src/lib/sets/setPage.ts
// The words and numbers on a set's page (Sets redesign spec, The set page):
// the hero's numbers and source line, the filter's counts and rows, and the
// missing tracks to copy. Parsing and matching are untouched; this only reads
// what they produced.
import type { MatchSummary } from '../tracklist/match'
import type { Track, TracklistResult } from '../tracklist'

/** The rows the filter shows: all, the ones you own, the ones you miss, the IDs. */
export type SetFilter = 'all' | 'have' | 'missing' | 'ids'

export interface HeroNumber {
  key: string
  value: number
  label: string
  /** You own: green. */
  owned?: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/**
 * "41 tracks · 3 lists · 3 you own · 37 missing · 1 ID": the parts with
 * nothing in them are left out. Owned and missing wait for the match.
 */
export function heroNumbers(result: TracklistResult, matches: MatchSummary | null): HeroNumber[] {
  const ids = result.tracks.filter((t) => t.isUnknown).length
  const parts: HeroNumber[] = [
    { key: 'tracks', value: result.tracks.length, label: plural(result.tracks.length, 'track') },
    { key: 'lists', value: result.sourceCount, label: plural(result.sourceCount, 'list') },
    { key: 'owned', value: matches?.owned ?? 0, label: 'you own', owned: true },
    { key: 'missing', value: matches?.missing ?? 0, label: 'missing' },
    { key: 'ids', value: ids, label: plural(ids, 'ID') },
  ]
  return parts.filter((part) => part.value > 0)
}

/** Today's status label, when the list is not a plain one ("assembled from comments", "low confidence"). */
export function statusNote(result: TracklistResult): string | null {
  switch (result.status) {
    case 'assembled':
      return 'assembled from comments'
    case 'low_confidence':
      return 'low confidence'
    default:
      return null
  }
}

/**
 * The muted line under the numbers: "from 3 crossed lists · strongest
 * source: the description" (or "comment by …"), and the status label when
 * there is one. Empty for a set with no tracklist.
 */
export function sourceLine(result: TracklistResult): string {
  if (result.tracks.length === 0) return ''
  const parts: string[] = []
  // Assembled from scattered comments, there are no lists to count.
  if (result.sourceCount > 1) parts.push(`from ${result.sourceCount} crossed lists`)
  else if (result.sourceCount === 1) parts.push('from 1 list')
  if (result.source === 'description') parts.push('strongest source: the description')
  else if (result.source === 'comment') {
    parts.push(`strongest source: comment${result.sourceMeta ? ` by ${result.sourceMeta.author}` : ''}`)
  }
  const note = statusNote(result)
  if (note) parts.push(note)
  return parts.join(' · ')
}

/** How many rows each filter shows. An ID is neither owned nor missing. */
export function filterCounts(tracks: readonly Track[], matches: MatchSummary | null): Record<SetFilter, number> {
  const counts = { all: tracks.length, have: 0, missing: 0, ids: 0 }
  for (const track of tracks) {
    if (track.isUnknown) counts.ids += 1
    else if (matches?.byIndex.has(track.index)) counts.have += 1
    else counts.missing += 1
  }
  return counts
}

/** The rows a filter shows, in the set's order. */
export function filterRows(tracks: readonly Track[], matches: MatchSummary | null, filter: SetFilter): Track[] {
  return tracks.filter((track) => {
    if (filter === 'all') return true
    if (filter === 'ids') return track.isUnknown
    if (track.isUnknown) return false
    const owned = matches?.byIndex.has(track.index) ?? false
    return filter === 'have' ? owned : !owned
  })
}

/** "Artist - Title (Mix)": a track as the missing list copies it. */
export function trackLine(track: Pick<Track, 'artist' | 'title' | 'mix'>): string {
  const name = track.artist ? `${track.artist} - ${track.title}` : track.title
  return track.mix ? `${name} (${track.mix})` : name
}

/** The missing tracks, one per line, for ⋯ › Copy missing tracks. */
export function missingTracks(tracks: readonly Track[], matches: MatchSummary | null): string[] {
  return filterRows(tracks, matches, 'missing').map(trackLine)
}

/** A YouTube thumbnail of the video: `hqdefault` for the hero, `mqdefault` for cards. */
export function thumbnailUrl(videoId: string, size: 'hqdefault' | 'mqdefault' = 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`
}

/** "saved Sep 27" (with the year when it is not this one), from SQLite's UTC text. */
export function savedLabel(addedAt: string | null | undefined, now = new Date()): string | null {
  const match = addedAt ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(addedAt) : null
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  return `saved ${day}`
}
```

- [ ] **Step 3:** `npx vitest run src/lib/sets`: PASS, 10. Commit:

```bash
git add src/lib/sets/setPage.ts src/lib/sets/setPage.test.ts
git commit -m "feat(sets): a set page's numbers, source line, filter and missing list"
```

---

### Task 2: Where the library was left

**Files:** Create `src/store/setsViewStore.ts`.

- [ ] **Step 1:**

Create `src/store/setsViewStore.ts`:

```ts
// src/store/setsViewStore.ts
// Where Sets' library was left (Sets redesign spec, Back): its tab, its
// grouping and how far it was scrolled. Kept outside SetsView, so Back from a
// set's page — even after Sets was remounted by a trip through a DJ page —
// returns to the library as it was.
import { create } from 'zustand'

export type SetsTab = 'library' | 'saved' | 'channels' | 'stats'

interface SetsViewState {
  tab: SetsTab
  grouping: 'dj' | 'recent'
  scrollTop: number
  /** Raised by the sidebar's Sets while Sets shows: a set's page goes back to the library. */
  libraryRequests: number
  setTab: (tab: SetsTab) => void
  setGrouping: (grouping: 'dj' | 'recent') => void
  setScrollTop: (scrollTop: number) => void
  requestLibrary: () => void
}

export const useSetsView = create<SetsViewState>((set) => ({
  tab: 'library',
  grouping: 'dj',
  scrollTop: 0,
  libraryRequests: 0,
  setTab: (tab) => set({ tab, scrollTop: 0 }),
  setGrouping: (grouping) => set({ grouping }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  requestLibrary: () => set((s) => ({ libraryRequests: s.libraryRequests + 1 })),
}))
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/store/setsViewStore.ts
git commit -m "feat(sets): keep the library's tab, grouping and scroll outside SetsView"
```

---

### Task 3: The scrubber and the store links, out of SetsView

**Files:** Create `src/components/sets/StoreLinks.tsx`, `src/components/sets/TrackScrubber.tsx`.

- [ ] **Step 1:** Today's components, unchanged but exported (the store links in the spec's order: Beatport · Discogs · Bandcamp · Spotify). `SetsView` keeps its own copies until Task 5.

Create `src/components/sets/StoreLinks.tsx`:

```tsx
// src/components/sets/StoreLinks.tsx
// Where a DJ would go looking for a record (Sets redesign spec, Track rows):
// Spotify, Beatport, Discogs and Bandcamp searches for it, kept out of the
// way until the row is hovered.
import { openUrl } from '@tauri-apps/plugin-opener'

/** Where a DJ would go looking for a record they do not own yet. */
function storeLinks(artist: string | null | undefined, title: string, mix?: string | null) {
  const query = encodeURIComponent([artist, title, mix].filter(Boolean).join(' '))
  return [
    { name: 'Beatport', url: `https://www.beatport.com/search?q=${query}` },
    { name: 'Discogs', url: `https://www.discogs.com/search/?q=${query}&type=release` },
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${query}` },
    { name: 'Spotify', url: `https://open.spotify.com/search/${query}` },
  ]
}

/** Kept out of the way until the row is hovered, so 42 rows stay readable. */
export function StoreLinks({
  artist,
  title,
  mix,
  className = '',
}: {
  artist: string | null | undefined
  title: string
  mix?: string | null
  className?: string
}) {
  return (
    <span className={`sets-stores ${className}`}>
      {storeLinks(artist, title, mix).map((link) => (
        <button
          key={link.name}
          type="button"
          className="sets-store-link"
          onClick={(e) => {
            e.stopPropagation()
            void openUrl(link.url)
          }}
        >
          {link.name}
        </button>
      ))}
    </span>
  )
}
```

Create `src/components/sets/TrackScrubber.tsx`:

```tsx
// src/components/sets/TrackScrubber.tsx
// The track playing, as one strip you can wind through (Sets redesign spec,
// Playing): under the set's video on its page.
import { msToCue, type Track } from '../../lib/tracklist'

/**
 * The track that is playing, as one strip you can wind through.
 *
 * The timeline above covers the whole set, which is right for jumping between
 * tracks and useless for moving thirty seconds inside one: five minutes of a
 * two-hour set is four percent of the bar. This gives that one track the full
 * width.
 */
export function TrackScrubber({
  track,
  startMs,
  endMs,
  positionMs,
  onSeek,
}: {
  track: Track
  startMs: number
  endMs: number
  positionMs: number
  onSeek: (ms: number) => void
}) {
  const length = Math.max(1, endMs - startMs)
  const elapsed = Math.min(Math.max(0, positionMs - startMs), length)
  const fraction = elapsed / length

  /** Where in the track a click on the bar landed. */
  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    onSeek(startMs + ratio * length)
  }

  return (
    <div className="sets-scrub">
      <div className="sets-scrub__head">
        <span className="sets-scrub__name">
          {track.artist ? (
            <>
              <span className="sets-track__artist">{track.artist}</span> — {track.title}
            </>
          ) : (
            track.title
          )}
        </span>
        {/* Timed from the start of the track, not of the set — the question
            being answered here is how far into this record we are. */}
        <span className="sets-scrub__time">
          {msToCue(elapsed)} / {msToCue(length)}
        </span>
      </div>

      <div
        className="sets-scrub__bar"
        onClick={seekFromEvent}
        onMouseDown={(e) => {
          // Dragging is the same question asked repeatedly.
          const bar = e.currentTarget
          const move = (event: MouseEvent) => {
            const box = bar.getBoundingClientRect()
            if (box.width <= 0) return
            const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
            onSeek(startMs + ratio * length)
          }
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        <div className="sets-scrub__fill" style={{ width: `${fraction * 100}%` }} />
        <div className="sets-scrub__knob" style={{ left: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/sets/StoreLinks.tsx src/components/sets/TrackScrubber.tsx
git commit -m "refactor(sets): the scrubber and the store links in their own files"
```

---

### Task 4: The page and its rows

**Files:** Create `src/components/sets/SetTrackRow.tsx`, `src/components/sets/SetPage.tsx`, `src/components/sets/SetPage.css`.

- [ ] **Step 1: A row**

Create `src/components/sets/SetTrackRow.tsx`:

```tsx
// src/components/sets/SetTrackRow.tsx
// One row of a set's tracklist (Sets redesign spec, Track rows):
// # · Time · Track · Lists · You own · ♡. The number turns into ▶ on hover
// (play the set from here) and into the equalizer while the video is inside
// this track, where hovering offers pause. An untimed list has no time and
// no ▶; a row with a timed copy in another set offers "↳ 12:30" instead.
import { Icon } from '../Icon'
import { Equalizer } from '../Equalizer'
import { StoreLinks } from './StoreLinks'
import type { Track } from '../../lib/tracklist'
import type { LibraryMatch } from '../../lib/tracklist/match'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'

interface SetTrackRowProps {
  track: Track
  untimed: boolean
  /** The video is inside this track. */
  nowPlaying: boolean
  /** …and playing, not paused. */
  videoPlaying: boolean
  match?: LibraryMatch
  saved: boolean
  /** The same record in another set, which does know where it sits. */
  echo?: TrackEcho
  /** Plays the set from this row's cue. */
  onPlayFrom: (cueMs: number) => void
  /** The row playing: pause or play the video. */
  onTogglePause: () => void
  onPlayFile: (track: LibraryTrack) => void
  onToggleSave: (track: Track) => void
  onFollowEcho: (echo: TrackEcho) => void
}

export function SetTrackRow({
  track,
  untimed,
  nowPlaying,
  videoPlaying,
  match,
  saved,
  echo,
  onPlayFrom,
  onTogglePause,
  onPlayFile,
  onToggleSave,
  onFollowEcho,
}: SetTrackRowProps) {
  const suggestion = track.suggestions?.[0]
  const extra = track.isUnknown
    ? [
        suggestion && `maybe: ${suggestion.artist ? `${suggestion.artist} — ` : ''}${suggestion.title}`,
        track.asks ? `asked ${track.asks}×, no answer` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : track.disagree.length > 0
      ? `or: ${track.disagree
          .map((d) => `${d.artist ? `${d.artist} — ${d.title}` : d.title} (${d.votes})`)
          .join(' · ')}`
      : ''
  const lonely = track.votes <= 1 && track.sourceCount > 1

  return (
    <div
      className={`set-row${track.isUnknown ? ' set-row--id' : ''}${nowPlaying ? ' set-row--now' : ''}`}
      data-cue={track.cueMs}
    >
      <span className="set-row__no">
        {nowPlaying ? (
          <Equalizer playing={videoPlaying} />
        ) : (
          <span className="set-row__index">{track.index}</span>
        )}
        {!untimed && (
          <button
            type="button"
            className="set-row__play"
            aria-label={
              nowPlaying ? (videoPlaying ? 'Pause the set' : 'Play the set') : `Play the set from ${track.cue}`
            }
            onClick={() => (nowPlaying ? onTogglePause() : onPlayFrom(track.cueMs))}
          >
            <Icon name={nowPlaying && videoPlaying ? 'Pause' : 'Play'} size={13} />
          </button>
        )}
      </span>

      <span className="set-row__time">
        {untimed ? (
          echo && (
            <button
              type="button"
              className="set-row__echo"
              onClick={() => onFollowEcho(echo)}
              title={`Heard at ${echo.cue ?? ''} in "${echo.set_title ?? 'another set'}"`}
            >
              ↳ {echo.cue}
            </button>
          )
        ) : (
          track.cue
        )}
      </span>

      <span className="set-row__track">
        <span className="set-row__name">
          {track.isUnknown ? (
            'ID'
          ) : (
            <>
              {track.artist ? `${track.artist} — ${track.title}` : track.title}
              {track.mix && <span className="set-row__mix"> ({track.mix})</span>}
              {track.uncertain && ' ?'}
            </>
          )}
          {!track.isUnknown && (
            <StoreLinks artist={track.artist} title={track.title} mix={track.mix} className="set-row__stores" />
          )}
        </span>
        {extra && <span className="set-row__extra">{extra}</span>}
      </span>

      <span className={`set-row__lists${lonely ? ' set-row__lists--lonely' : ''}`}>
        {track.fromComments ? 'comments' : !track.isUnknown && track.sourceCount > 0 ? `${track.votes}/${track.sourceCount}` : ''}
      </span>

      <span className="set-row__own">
        {match ? (
          <button
            type="button"
            className="set-row__have"
            onClick={() => onPlayFile(match.track as LibraryTrack)}
            title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
          >
            <Icon name="Play" size={11} /> have it
          </button>
        ) : (
          !track.isUnknown && <span className="set-row__missing">missing</span>
        )}
      </span>

      <span className="set-row__heart-cell">
        {!track.isUnknown && (
          <button
            type="button"
            className={`set-row__heart${saved ? ' set-row__heart--on' : ''}`}
            aria-label={saved ? 'Remove from Saved tracks' : 'Save this track'}
            aria-pressed={saved}
            onClick={() => onToggleSave(track)}
          >
            <Icon name="Heart" size={13} />
          </button>
        )}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: The page**

Create `src/components/sets/SetPage.tsx`:

```tsx
// src/components/sets/SetPage.tsx
// A set on a page of its own (Sets redesign spec, The set page), full width
// like a DJ page. The hero stays put — the thumbnail, or the video while
// this set plays here; the title, the DJs as links, the numbers, Play set or
// the player's buttons, and ⋯ — and only the strip, the filter and the rows
// under it scroll. It opens at once with what is known and skeleton rows
// while the set is read; a read that fails says so in place of the rows.
import { useLayoutEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { Menu, type MenuEntry } from '../menu/Menu'
import { SetTimeline } from '../views/SetTimeline'
import { SetTrackRow } from './SetTrackRow'
import { TrackScrubber } from './TrackScrubber'
import { billingParts } from '../../lib/dj/names'
import { extractDjName } from '../../lib/tracklist/djName'
import { msToCue, type Track, type TracklistResult } from '../../lib/tracklist'
import type { MatchSummary } from '../../lib/tracklist/match'
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  type SetFilter,
} from '../../lib/sets/setPage'
import { watchUrl } from '../../lib/youtubeWindow'
import { toast } from '../../lib/toast'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'
import './SetPage.css'

/** A set being read, or one that could not be: what is known of it so far. */
export interface SetOpening {
  videoId: string
  title: string | null
  /** Why it could not be read; null while it is still reading. */
  error: string | null
}

interface SetPageProps {
  /** The set, once read; null while `opening` says what is happening. */
  result: TracklistResult | null
  opening: SetOpening | null
  /** When it went into the library (`yt_sets.added_at`); null when it is not there. */
  savedAt: string | null
  matches: MatchSummary | null
  echoes: Map<number, TrackEcho>
  isSaved: (track: Track) => boolean
  bpmByIndex: Map<number, number>
  /** What the last Look again changed ("Found 4 more tracks"). */
  notice: string | null
  lookingAgain: boolean
  /** Opened at a track: that row is scrolled to. */
  focusCue: number | null
  onBack: () => void
  onRetry: () => void
  onOpenDj?: (name: string) => void
  onPlayFile: (track: LibraryTrack) => void
  onToggleSave: (track: Track) => void
  onFollowEcho: (echo: TrackEcho) => void
  onLookAgain: () => void
  /** Asks first; null when the set is not in the library. */
  onRemove: (() => void) | null
}

const FILTERS: Array<{ key: SetFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'have', label: 'You own' },
  { key: 'missing', label: 'Missing' },
  { key: 'ids', label: 'IDs' },
]

export function SetPage({
  result,
  opening,
  savedAt,
  matches,
  echoes,
  isSaved,
  bpmByIndex,
  notice,
  lookingAgain,
  focusCue,
  onBack,
  onRetry,
  onOpenDj,
  onPlayFile,
  onToggleSave,
  onFollowEcho,
  onLookAgain,
  onRemove,
}: SetPageProps) {
  const [filter, setFilter] = useState<SetFilter>('all')
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  const playing = useSetPlayer((s) => s.playing)
  const panel = useSetPlayer((s) => s.panel)
  const attachPageBox = useSetPlayer((s) => s.attachPageBox)

  const ready = result !== null && opening === null
  const video = ready ? result.video : null
  const videoId = video?.id ?? opening?.videoId ?? ''
  const title = video?.title ?? opening?.title ?? ''
  const playingHere = ready && playing?.result.video.id === result.video.id
  const untimed = Boolean(result?.untimed)
  const positionMs = panel?.position_ms ?? playing?.startMs ?? 0
  const durationMs = panel && panel.duration_ms > 0 ? panel.duration_ms : (video?.durationMs ?? 0)
  const current =
    playingHere && result ? playheadTrack(result.tracks, untimed, positionMs, durationMs) : null
  const videoPlaying = videoIsPlaying(panel)

  // Opened at a track: its row comes into view once the rows are there.
  useLayoutEffect(() => {
    if (!ready || focusCue === null) return
    const row = rowsRef.current?.querySelector<HTMLElement>(`[data-cue="${focusCue}"]`)
    row?.scrollIntoView({ block: 'center' })
  }, [ready, focusCue, videoId])

  const play = (cueMs: number) => {
    if (result) useSetPlayer.getState().play(result, cueMs)
  }

  const counts = result ? filterCounts(result.tracks, matches) : null
  const missing = result ? missingTracks(result.tracks, matches) : []

  const menu: MenuEntry[] = video
    ? [
        {
          kind: 'action',
          label: 'Open on YouTube',
          icon: 'ExternalLink',
          onSelect: () => void openUrl(watchUrl(video.url, playingHere ? positionMs : 0)),
        },
        {
          kind: 'action',
          label: 'Look again for a tracklist',
          icon: 'RefreshCw',
          hint: '5–7 units',
          disabled: lookingAgain,
          onSelect: onLookAgain,
        },
        {
          kind: 'action',
          label: 'Copy missing tracks',
          icon: 'Copy',
          hint: String(missing.length),
          disabled: missing.length === 0,
          onSelect: () => {
            void navigator.clipboard.writeText(missing.join('\n'))
            toast(`Copied ${missing.length} missing ${missing.length === 1 ? 'track' : 'tracks'}`)
          },
        },
        ...(onRemove
          ? ([
              { kind: 'separator' },
              { kind: 'action', label: 'Remove from library', icon: 'Trash2', danger: true, onSelect: onRemove },
            ] as MenuEntry[])
          : []),
      ]
    : []

  const djParts = video ? billingParts(extractDjName(video.title, video.channel)) : []
  const saved = savedLabel(savedAt)
  const source = result && ready ? sourceLine(result) : ''

  return (
    <div className="set-page">
      <div className={`set-hero${playingHere ? ' set-hero--playing' : ''}`}>
        <div className="set-hero__media">
          {playingHere ? (
            <>
              {/* Left empty: the YouTube panel is laid exactly over this box. */}
              <div className="set-hero__video" ref={attachPageBox} />
              {current && (
                <TrackScrubber
                  track={current.track}
                  startMs={current.startMs}
                  endMs={current.endMs}
                  positionMs={positionMs}
                  onSeek={(ms) => useSetPlayer.getState().seek(ms)}
                />
              )}
            </>
          ) : (
            <div
              className="set-hero__thumb"
              style={videoId ? { backgroundImage: `url(${thumbnailUrl(videoId)})` } : undefined}
            >
              {video && video.durationMs > 0 && (
                <span className="set-hero__length">{msToCue(video.durationMs)}</span>
              )}
            </div>
          )}
        </div>

        <div className="set-hero__text">
          <button type="button" className="set-hero__back" onClick={onBack}>
            <Icon name="ChevronLeft" size={14} /> Sets
          </button>
          <h1 className="set-hero__title" title={title}>
            {title || (opening?.error ? 'This set' : 'Reading the set…')}
          </h1>
          {video && (
            <div className="set-hero__who">
              {djParts.map((part, i) =>
                part.dj && onOpenDj ? (
                  <button
                    key={i}
                    type="button"
                    className="set-hero__dj"
                    onClick={() => onOpenDj(part.text)}
                    title={`Open ${part.text}'s page`}
                  >
                    {part.text}
                  </button>
                ) : (
                  <span key={i} className={part.dj ? 'set-hero__dj-name' : 'set-hero__sep'}>
                    {part.text}
                  </span>
                ),
              )}
              <span className="set-hero__sep">
                {[video.channel, saved].filter(Boolean).map((text) => ` · ${text}`).join('')}
              </span>
            </div>
          )}
          {result && ready && !playingHere && (
            <div className="set-hero__numbers">
              {heroNumbers(result, matches).map((n) => (
                <span key={n.key} className={n.owned ? 'set-hero__number set-hero__number--owned' : 'set-hero__number'}>
                  <b>{n.value.toLocaleString('en-US')}</b> {n.label}
                </span>
              ))}
            </div>
          )}
          {!playingHere && (source || notice) && (
            <p className="set-hero__source">{[source, notice].filter(Boolean).join(' · ')}</p>
          )}

          <div className="set-hero__actions">
            {playingHere && result ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary set-hero__primary"
                  onClick={() => useSetPlayer.getState().togglePause()}
                >
                  <Icon name={videoPlaying ? 'Pause' : 'Play'} size={14} /> {videoPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  className="btn set-hero__icon"
                  aria-label="Previous track"
                  disabled={stepCue(result.tracks, untimed, positionMs, -1) === null}
                  onClick={() => useSetPlayer.getState().step(-1)}
                >
                  <Icon name="SkipBack" size={14} />
                </button>
                <button
                  type="button"
                  className="btn set-hero__icon"
                  aria-label="Next track"
                  disabled={stepCue(result.tracks, untimed, positionMs, 1) === null}
                  onClick={() => useSetPlayer.getState().step(1)}
                >
                  <Icon name="SkipForward" size={14} />
                </button>
                <button type="button" className="btn" onClick={() => useSetPlayer.getState().stop()}>
                  <Icon name="X" size={14} /> Stop
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary set-hero__primary"
                disabled={!ready}
                onClick={() => play(0)}
              >
                <Icon name="Play" size={14} /> Play set
              </button>
            )}
            <button
              type="button"
              className="btn set-hero__icon"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
              disabled={!ready}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setMenuAt({ x: r.left, y: r.bottom + 4 })
              }}
            >
              <Icon name="Ellipsis" size={16} />
            </button>
          </div>
        </div>
      </div>
      {menuAt && <Menu at={menuAt} entries={menu} label="Set" onClose={() => setMenuAt(null)} />}

      <div className="set-page__scroll">
        {opening?.error ? (
          <div className="set-page__error">
            <p>Couldn&apos;t read this set: {opening.error}</p>
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : !ready || !result ? (
          <div className="set-page__rows" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="set-row set-row--skeleton">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : result.tracks.length === 0 ? (
          <p className="set-page__empty">
            Nothing in the description and nothing usable in the comments. On a fresh set this is
            worth retrying in a few days — tracklists arrive slowly.
          </p>
        ) : (
          <>
            {untimed ? (
              <p className="set-page__note">
                This list came with no timestamps, so there is nothing to seek to — the order is the
                uploader&apos;s numbering. Everything else works: what you own is marked, and the
                tracks are searchable and can be saved.
              </p>
            ) : (
              <div className="set-page__strip">
                <SetTimeline
                  tracks={result.tracks}
                  durationMs={result.video.durationMs}
                  onSeek={play}
                  positionMs={playingHere ? positionMs : undefined}
                  playingIndex={current?.track.index ?? null}
                  bpmByIndex={bpmByIndex}
                />
              </div>
            )}

            <div className="set-page__filter" role="group" aria-label="Show">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="set-page__filter-btn"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} {counts?.[key] ?? 0}
                </button>
              ))}
            </div>

            <div className="set-page__rows" ref={rowsRef}>
              <div className="set-row set-row--head" aria-hidden="true">
                <span>#</span>
                <span>{untimed ? '' : 'Time'}</span>
                <span>Track</span>
                <span>Lists</span>
                <span>You own</span>
                <span />
              </div>
              {filterRows(result.tracks, matches, filter).map((track) => (
                <SetTrackRow
                  key={track.index}
                  track={track}
                  untimed={untimed}
                  nowPlaying={current?.track.index === track.index}
                  videoPlaying={videoPlaying}
                  match={matches?.byIndex.get(track.index)}
                  saved={isSaved(track)}
                  echo={echoes.get(track.index)}
                  onPlayFrom={play}
                  onTogglePause={() => useSetPlayer.getState().togglePause()}
                  onPlayFile={onPlayFile}
                  onToggleSave={onToggleSave}
                  onFollowEcho={onFollowEcho}
                />
              ))}
            </div>
          </>
        )}

        {/* Named without a timestamp: under the rows, and under a set with
            no rows too, whose comments only name tracks. */}
        {ready && result && result.loose.length > 0 && (
          <section className="set-page__loose">
            <h3>Named without a timestamp</h3>
            <p className="set-page__note">Mentioned in the comments, but nobody said where in the set.</p>
            {result.loose.map((item) => (
              <div className="set-loose" key={item.key ?? item.title}>
                <span className="set-loose__name">
                  {item.artist ? `${item.artist} — ${item.title}` : item.title}
                  {item.mix && <span className="set-row__mix"> ({item.mix})</span>}
                </span>
                <span className="set-loose__by">{item.author}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Its styles**

Create `src/components/sets/SetPage.css`:

```css
/* src/components/sets/SetPage.css */
/* A set's own page, after the approved mockup (2026-10-04-sets-redesign-mockup.html, 2 and 3). */

/* The page is the view's height: the hero stays put, only what is under it
   scrolls — the video panel is laid over the hero and cannot scroll. */
.set-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-primary);
}

/* ---- Hero ---- */

.set-hero {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 20px;
  padding: 18px 22px 14px;
  background: linear-gradient(180deg, color-mix(in srgb, #7c3a12 32%, var(--bg-primary)), var(--bg-primary));
}

/* The picture keeps to the top when the text beside it is taller, and both
   give way on a narrow window rather than push the page sideways. */
.set-hero__media {
  flex: 0 1 300px;
  align-self: flex-start;
  min-width: 200px;
}

.set-hero--playing .set-hero__media {
  flex-basis: 440px;
  min-width: 240px;
}

.set-hero__thumb,
.set-hero__video {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  background: #222 center / cover no-repeat;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

/* Left empty on purpose: the YouTube webview is laid exactly over this box. */
.set-hero__video {
  background: #000;
}

.set-hero__length {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* The scrubber (styled in SetsView.css, which always loads with this page)
   under the video, without the old band's frame. */
.set-hero__media .sets-scrub {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
}

.set-hero__text {
  flex: 1 1 260px;
  min-width: 0;
}

.set-hero__back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0 0 6px -4px;
  padding: 2px 6px 2px 2px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.set-hero__back:hover {
  color: var(--text-primary);
}

.set-hero__back:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.set-hero__title {
  display: -webkit-box;
  margin: 2px 0 6px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 800;
  line-height: 1.15;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* Playing, the hero is the mockup's compact one: no numbers, a smaller title. */
.set-hero--playing .set-hero__title {
  font-size: 18px;
}

.set-hero__who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 700;
}

.set-hero__dj,
.set-hero__dj-name {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
}

.set-hero__dj {
  text-decoration: underline;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 3px;
  cursor: pointer;
}

.set-hero__dj:hover {
  text-decoration-color: var(--text-primary);
}

.set-hero__dj:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.set-hero__sep {
  color: var(--text-muted);
  font-weight: 500;
  white-space: pre-wrap;
}

.set-hero__numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.set-hero__number b {
  color: var(--text-primary);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.set-hero__number--owned,
.set-hero__number--owned b {
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
}

.set-hero__source {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.set-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.set-hero__primary {
  font-weight: 700;
}

.set-hero__icon {
  width: 32px;
  padding: 0;
}

/* ---- Under the hero: the strip, the filter, the rows ---- */

.set-page__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 22px 40px;
}

.set-page__strip .sets-timeline {
  margin-top: 6px;
}

.set-page__note,
.set-page__empty {
  margin: 12px 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.set-page__filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 6px;
}

.set-page__filter-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.set-page__filter-btn:hover {
  color: var(--text-primary);
}

.set-page__filter-btn[aria-pressed='true'] {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
}

.set-page__filter-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.set-page__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin: 20px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.set-page__error p {
  margin: 0;
}

/* ---- Track rows: # · Time · Track · Lists · You own · ♡ ---- */

.set-row {
  display: grid;
  grid-template-columns: 34px 56px minmax(0, 1fr) 54px 96px 32px;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 3px 8px;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12.5px;
}

.set-row:not(.set-row--head):not(.set-row--skeleton):hover {
  background: var(--bg-tertiary);
}

.set-row--head {
  min-height: 26px;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 0;
  color: var(--text-muted);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.set-row--now {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

/* Hovered, it keeps its tint (as specific as the rows' hover, and later). */
.set-row.set-row--now:not(.set-row--head):hover {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

/* The track table's playing colour: the accent drawn toward the text, so it
   reads on the light themes too. */
.set-row--now .set-row__name,
.set-row--now .set-row__no,
.set-row--now .set-row__time {
  color: color-mix(in srgb, var(--accent), var(--text-primary) 25%);
}

.set-row--id .set-row__name {
  color: var(--text-muted);
}

.set-row__no {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ▶ waits under the number: shown on hover, and when it has the keyboard. */
.set-row__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  opacity: 0;
  cursor: pointer;
}

.set-row:hover .set-row__play,
.set-row__play:focus-visible {
  opacity: 1;
}

/* Only the keyboard's focus counts: WebView2 focuses a button on a click,
   which would leave the cell blank once the mouse moves on. */
.set-row:hover .set-row__no > :not(.set-row__play),
.set-row__no:has(.set-row__play:focus-visible) > :not(.set-row__play) {
  visibility: hidden;
}

.set-row__play:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 0;
}

.set-row__time {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.set-row__echo {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.set-row__echo:hover {
  text-decoration: underline;
}

.set-row__track {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.set-row__name,
.set-row__extra {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.set-row__mix {
  color: var(--text-muted);
}

.set-row__extra {
  color: var(--text-muted);
  font-size: 11px;
}

/* The store links follow the title, only while the row is hovered (two
   classes, to win over the shared .sets-stores, which loads later). */
.set-row .set-row__stores {
  display: none;
  margin-left: 6px;
}

.set-row:hover .set-row__stores,
.set-row:focus-within .set-row__stores {
  display: inline-flex;
}

.set-row__lists {
  color: var(--text-muted);
  font-size: 11px;
  text-align: center;
}

.set-row__lists--lonely {
  opacity: 0.55;
}

.set-row__have {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: none;
  background: color-mix(in srgb, #1ed760 15%, transparent);
  color: color-mix(in srgb, #1ed760 80%, var(--text-primary));
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.set-row__have:hover {
  background: color-mix(in srgb, #1ed760 25%, transparent);
}

.set-row__missing {
  color: var(--text-muted);
  font-size: 11px;
}

.set-row__heart {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.set-row__heart:hover {
  color: var(--text-primary);
}

.set-row__heart--on,
.set-row__heart--on:hover {
  color: var(--color-danger);
}

.set-row__have:focus-visible,
.set-row__heart:focus-visible,
.set-row__echo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Rows not read yet. */
.set-row--skeleton span {
  height: 10px;
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.set-row--skeleton span:nth-child(3) {
  width: 60%;
}

/* ---- Named without a timestamp ---- */

.set-page__loose {
  margin-top: 24px;
}

.set-page__loose h3 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.set-loose {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  font-size: 12.5px;
}

.set-loose__name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.set-loose__by {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11px;
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors (nothing uses it until Task 5). Commit:

```bash
git add src/components/sets/SetTrackRow.tsx src/components/sets/SetPage.tsx src/components/sets/SetPage.css
git commit -m "feat(sets): a set's own page — the hero, the strip, the filter and the rows"
```

---

### Task 5: Sets opens on its library; a set opens on its page

**Files:** Modify `src/components/views/SetsView.tsx`, `src/components/views/SetsView.css`, `src/App.tsx`, `src/components/views/DjView.tsx`, `src/components/dj/DjSetsTab.tsx`.

- [ ] **Step 1: SetsView** — the moved components and the Set tab go; the library or the set page; one opener for the library's rows, an arrival, an echo and a hit; Back restores the library; removing asks first

In `src/components/views/SetsView.tsx`, replace

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SetTimeline } from './SetTimeline'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, msToCue, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type LibraryMatch, type MatchSummary } from '../../lib/tracklist/match'
import { extractDjName, groupByDj } from '../../lib/tracklist/djName'
import { billingParts } from '../../lib/dj/names'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { watchUrl } from '../../lib/youtubeWindow'
import { looksLikeAChannel } from '../../lib/channelInput'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import type {
  RawSet,
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
```

with

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Icon } from '../Icon'
import { SetPage, type SetOpening } from '../sets/SetPage'
import { StoreLinks } from '../sets/StoreLinks'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { groupByDj } from '../../lib/tracklist/djName'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { looksLikeAChannel } from '../../lib/channelInput'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView, type SetsTab } from '../../store/setsViewStore'
import { dismissToast, toast } from '../../lib/toast'
import type {
  RawSet,
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
import './SetsView.css'

type Tab = 'set' | 'library' | 'saved' | 'channels' | 'stats'

/** The escape hatch: the user's own browser, with their account and history. */
function openInBrowser(url: string, cueMs = 0) {
  void openUrl(watchUrl(url, cueMs))
}

function statusLabel(result: TracklistResult): { text: string; kind: string } {
  switch (result.status) {
    case 'ok':
      return {
        text: `${result.sourceCount} ${result.sourceCount === 1 ? 'list' : 'lists'} found`,
        kind: 'ok',
      }
    case 'assembled':
      return { text: 'assembled from comments', kind: 'assembled' }
    case 'low_confidence':
      return { text: 'low confidence', kind: 'weak' }
    default:
      return { text: 'no tracklist found', kind: 'weak' }
  }
}

/**
 * A link or a bare id can be fetched directly; anything else is a name, and
 * finding sets by name is the one call that costs 100 units.
 */
function looksLikeLink(input: string): boolean {
  const text = input.trim()
```

with

```tsx
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
import './SetsView.css'

/**
 * A link or a bare id can be fetched directly; anything else is a name, and
 * finding sets by name is the one call that costs 100 units.
 */
function looksLikeLink(input: string): boolean {
  const text = input.trim()
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  return /(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)[A-Za-z0-9_-]{11}/.test(text)
}

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

/** Where a DJ would go looking for a record they do not own yet. */
function storeLinks(artist: string | null | undefined, title: string, mix?: string | null) {
  const query = encodeURIComponent([artist, title, mix].filter(Boolean).join(' '))
  return [
    { name: 'Spotify', url: `https://open.spotify.com/search/${query}` },
    { name: 'Beatport', url: `https://www.beatport.com/search?q=${query}` },
    { name: 'Discogs', url: `https://www.discogs.com/search/?q=${query}&type=release` },
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${query}` },
  ]
}

/** Kept out of the way until the row is hovered, so 42 rows stay readable. */
function StoreLinks({
  artist,
  title,
  mix,
  className = '',
}: {
  artist: string | null | undefined
  title: string
  mix?: string | null
  className?: string
}) {
  return (
    <span className={`sets-stores ${className}`}>
      {storeLinks(artist, title, mix).map((link) => (
        <button
          key={link.name}
          type="button"
          className="sets-store-link"
          onClick={(e) => {
            e.stopPropagation()
            void openUrl(link.url)
          }}
        >
          {link.name}
        </button>
      ))}
    </span>
  )
}

/**
 * The track that is playing, as one strip you can wind through.
 *
 * The timeline above covers the whole set, which is right for jumping between
 * tracks and useless for moving thirty seconds inside one: five minutes of a
 * two-hour set is four percent of the bar. This gives that one track the full
 * width.
 */
function TrackScrubber({
  track,
  startMs,
  endMs,
  positionMs,
  onSeek,
}: {
  track: Track
  startMs: number
  endMs: number
  positionMs: number
  onSeek: (ms: number) => void
}) {
  const length = Math.max(1, endMs - startMs)
  const elapsed = Math.min(Math.max(0, positionMs - startMs), length)
  const fraction = elapsed / length

  /** Where in the track a click on the bar landed. */
  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    onSeek(startMs + ratio * length)
  }

  return (
    <div className="sets-scrub">
      <div className="sets-scrub__head">
        <span className="sets-scrub__name">
          {track.artist ? (
            <>
              <span className="sets-track__artist">{track.artist}</span> — {track.title}
            </>
          ) : (
            track.title
          )}
        </span>
        {/* Timed from the start of the track, not of the set — the question
            being answered here is how far into this record we are. */}
        <span className="sets-scrub__time">
          {msToCue(elapsed)} / {msToCue(length)}
        </span>
      </div>

      <div
        className="sets-scrub__bar"
        onClick={seekFromEvent}
        onMouseDown={(e) => {
          // Dragging is the same question asked repeatedly.
          const bar = e.currentTarget
          const move = (event: MouseEvent) => {
            const box = bar.getBoundingClientRect()
            if (box.width <= 0) return
            const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
            onSeek(startMs + ratio * length)
          }
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        <div className="sets-scrub__fill" style={{ width: `${fraction * 100}%` }} />
        <div className="sets-scrub__knob" style={{ left: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}

function TrackRow({
  track,
  onSeek,
  match,
  onPlay,
  saved,
  onToggleSave,
  untimed,
  nowPlaying,
  echo,
  onFollowEcho,
}: {
  track: Track
  onSeek: (cueMs: number) => void
  match?: LibraryMatch
  onPlay?: (libraryTrack: LibraryTrack) => void
  saved: boolean
  onToggleSave: (track: Track) => void
  /** The list carries no timestamps, so there is nowhere to send the player. */
  untimed?: boolean
  /** The video is inside this track right now. */
  nowPlaying?: boolean
  /** The same record in another set, which does know where it sits. */
  echo?: TrackEcho
  onFollowEcho?: (echo: TrackEcho) => void
}) {
  const name = track.artist ? (
    <>
      <span className="sets-track__artist">{track.artist}</span> — {track.title}
    </>
  ) : (
    track.title
  )

  const suggestion = track.suggestions?.[0]

  return (
    <div
      className={`sets-track ${track.isUnknown ? 'sets-track--unknown' : ''} ${
        nowPlaying ? 'sets-track--playing' : ''
      }`}
    >
      {/* The number is replaced while it plays: a row that is running should
          say so where the eye already is, not in a corner. */}
      <span className="sets-track__index">
        {nowPlaying ? <Icon name="Volume2" size={13} /> : track.index}
      </span>
      <span className="sets-track__cue">{track.cue}</span>

      <span className="sets-track__name">
        {track.isUnknown ? (
          <>
            ID{track.asks ? ` — asked ${track.asks}×, no answer` : ''}
            {suggestion && (
              <span className="sets-track__extra">
                maybe: {suggestion.artist ? `${suggestion.artist} — ` : ''}
                {suggestion.title}
              </span>
            )}
          </>
        ) : (
          <>
            {name}
            {track.mix && <span className="sets-track__artist"> ({track.mix})</span>}
            {track.uncertain && ' ?'}
            {track.disagree.length > 0 && (
              <span className="sets-track__extra">
                or:{' '}
                {track.disagree
                  .map(
                    (d) =>
                      `${d.artist ? `${d.artist} — ${d.title}` : d.title} · ${d.votes} ${
                        d.votes === 1 ? 'list' : 'lists'
                      }`,
                  )
                  .join('   ')}
              </span>
            )}
          </>
        )}
      </span>

      {!track.isUnknown && (
        <StoreLinks
          artist={track.artist}
          title={track.title}
          mix={track.mix}
          className="sets-stores--hover"
        />
      )}

      {!track.isUnknown && (
        <button
          type="button"
          className={`sets-track__heart ${saved ? 'sets-track__heart--on' : ''}`}
          onClick={() => onToggleSave(track)}
          title={saved ? 'Remove from Saved' : 'Save this track'}
        >
          <Icon name="Heart" size={13} />
        </button>
      )}

      {/* Owned copy of this record, if the library has one. */}
      {match ? (
        <button
          type="button"
          className="sets-track__own sets-track__own--have"
          onClick={() => onPlay?.(match.track as LibraryTrack)}
          title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
        >
          <Icon name="Play" size={11} /> have it
        </button>
      ) : (
        !track.isUnknown && <span className="sets-track__own">missing</span>
      )}

      {/* Agreement between independently typed lists: 4/4 is a fact, 1/4 a guess. */}
      {!track.isUnknown && track.sourceCount > 0 && (
        <span
          className={`sets-track__votes ${
            track.votes <= 1 && track.sourceCount > 1 ? 'sets-track__votes--lonely' : ''
          }`}
        >
          {track.votes}/{track.sourceCount}
        </span>
      )}
      {track.fromComments && !track.isUnknown && (
        <span className="sets-track__votes">from comments</span>
      )}

      {/* This list has no timestamps, so there is nowhere to send the player —
          but the same record in another set does know where it sits. */}
      {untimed && echo && onFollowEcho && (
        <button
          type="button"
          className="sets-track__echo"
          onClick={() => onFollowEcho(echo)}
          title={`Heard at ${echo.cue ?? ''} in "${echo.set_title ?? 'another set'}"`}
        >
          <Icon name="CornerDownRight" size={11} /> {echo.cue}
        </button>
      )}

      {!untimed && (
        <button
          type="button"
          className="sets-track__play"
          onClick={() => onSeek(track.cueMs)}
          title="Play the set from this point"
        >
          <Icon name="Play" size={12} />
        </button>
      )}
    </div>
  )
}

interface SetsViewProps {
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
  /**
   * A stored set to show on arrival: Back from a DJ page opened from it, or a
   * DJ page's set card. Read once — App remounts the view (`key`) to change it.
   */
  openVideoId?: string | null
  /**
   * Put in the Set tab's box on arrival, not searched: a DJ page's Find more.
   * The user presses Search here, where its cost is shown first.
   */
  initialQuery?: string
  /** Each DJ in the open set's chip opens their page; Back reopens this set. */
  onOpenDj?: (name: string, openVideoId: string | null) => void
  /** Opens on the library instead: Home's Needs you, its New sets row. Read once, as openVideoId. */
  initialTab?: 'library'
}

export function SetsView({
  onPlayTrack,
  openVideoId,
  initialQuery,
  onOpenDj,
  initialTab,
}: SetsViewProps) {
  // Opens on the Set tab, where both an arriving set and initialQuery show,
  // unless it is asked to open on the library.
  const [tab, setTab] = useState<Tab>(initialTab ?? 'set')
  const [input, setInput] = useState(initialQuery ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TracklistResult | null>(null)
  const [currentSet, setCurrentSet] = useState<RawSet | null>(null)
  const [quota, setQuota] = useState<YouTubeQuotaStatus | null>(null)
  const [filter, setFilter] = useState<'all' | 'have' | 'missing'>('all')
  const [sets, setSets] = useState<YtSetSummary[]>([])
  const [saved, setSaved] = useState<SavedTrack[]>([])
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<YtTrackHit[]>([])
  const [stats, setStats] = useState<YtStats | null>(null)
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
```

with

```tsx
  return /(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)[A-Za-z0-9_-]{11}/.test(text)
}

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

interface SetsViewProps {
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
  /**
   * A set to open on its page on arrival: Back from a DJ page opened from it,
   * a DJ page's set card, Home, Search, the set bar. Read once — App remounts
   * the view (`key`) to change it.
   */
  openVideoId?: string | null
  /**
   * Put in the box on arrival, not searched: a DJ page's Find more. The user
   * presses Search here, where its cost is shown first.
   */
  initialQuery?: string
  /** Each DJ on the set's page opens their page; Back reopens this set. */
  onOpenDj?: (name: string, openVideoId: string | null) => void
  /** Opens on the Library tab: Home's Needs you, its New sets row. Read once, as openVideoId. */
  initialTab?: 'library'
}

export function SetsView({
  onPlayTrack,
  openVideoId,
  initialQuery,
  onOpenDj,
  initialTab,
}: SetsViewProps) {
  // Sets opens on its library, as it was left (tab, grouping, scroll); a set
  // opens on a page of its own over it, and Back returns to the library.
  const tab = useSetsView((s) => s.tab)
  const setTab = useSetsView((s) => s.setTab)
  const grouping = useSetsView((s) => s.grouping)
  const setGrouping = useSetsView((s) => s.setGrouping)
  const [view, setView] = useState<'library' | 'set'>(openVideoId ? 'set' : 'library')
  /** The set being read, or one that could not be; null once it is shown. */
  const [opening, setOpening] = useState<SetOpening | null>(
    openVideoId ? { videoId: openVideoId, title: null, error: null } : null,
  )
  /** Opened at a track (a hit, an echo): the cue its row is scrolled to. */
  const [focusCue, setFocusCue] = useState<number | null>(null)
  const [lookingAgain, setLookingAgain] = useState(false)
  const libraryScroll = useRef<HTMLDivElement>(null)
  /** The last "Couldn't read this set" toast: a retry replaces it rather than adding one. */
  const readError = useRef<number | null>(null)
  const [input, setInput] = useState(initialQuery ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TracklistResult | null>(null)
  const [currentSet, setCurrentSet] = useState<RawSet | null>(null)
  const [quota, setQuota] = useState<YouTubeQuotaStatus | null>(null)
  const [sets, setSets] = useState<YtSetSummary[]>([])
  const [saved, setSaved] = useState<SavedTrack[]>([])
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<YtTrackHit[]>([])
  const [stats, setStats] = useState<YtStats | null>(null)
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   * Read from what is already stored, so it costs nothing and gets better every
   * time another set is saved.
   */
  const [echoes, setEchoes] = useState<Map<number, TrackEcho>>(new Map())
  /** What the last re-fetch changed, said plainly because it cost something. */
  const [reanalysed, setReanalysed] = useState<string | null>(null)
  /** Counts the sets put on the Set tab: an opening set arriving late yields to a newer one. */
  const shownSets = useRef(0)
  /** A bare name typed into the Follow box, held back before it costs 100. */
  const [bareName, setBareName] = useState<string | null>(null)
  const [djs, setDjs] = useState<WatchedDj[]>([])
  const [djInput, setDjInput] = useState('')
  const [news, setNews] = useState<ChannelNews[] | null>(null)
```

with

```tsx
   * Read from what is already stored, so it costs nothing and gets better every
   * time another set is saved.
   */
  const [echoes, setEchoes] = useState<Map<number, TrackEcho>>(new Map())
  /** What the last re-fetch changed, said plainly because it cost something. */
  const [reanalysed, setReanalysed] = useState<string | null>(null)
  /** Counts the sets opened: one arriving late yields to a newer one. */
  const shownSets = useRef(0)
  /** A bare name typed into the Follow box, held back before it costs 100. */
  const [bareName, setBareName] = useState<string | null>(null)
  const [djs, setDjs] = useState<WatchedDj[]>([])
  const [djInput, setDjInput] = useState('')
  const [news, setNews] = useState<ChannelNews[] | null>(null)
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
   */
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([])
  const [grouping, setGrouping] = useState<'dj' | 'recent'>('dj')
  // The set playing lives in App (the set player store), so it plays on in
  // the bar above the player when you leave it; here it is shown big while
  // its set is open. App's engine opens, places and polls the panel, and
  // keeps the video and your own files from playing over each other.
  const playing = useSetPlayer((s) => s.playing)
  const panel = useSetPlayer((s) => s.panel)
  const attachPageBox = useSetPlayer((s) => s.attachPageBox)

  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
```

with

```tsx
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
   */
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([])

  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
```

In `src/components/views/SetsView.tsx`, replace

```tsx

  useEffect(() => {
    refreshQuota()
    refreshLibrary()
  }, [refreshQuota, refreshLibrary])

  // Arriving on a set: shown as opening it from the Library shows it. A set
  // that is not stored — YouTube Music's Open in Sets, or one deleted since —
  // is fetched as a pasted link is: shown, stored, its units counted, and a
  // failure said in the Set tab. Late, it gives way to whatever the user
  // fetched or opened meanwhile.
  useEffect(() => {
    if (!openVideoId) return
    let live = true
    const claim = shownSets.current
    const current = () => live && shownSets.current === claim
    // As show() does (it is not a dependency here).
    const showSet = (raw: RawSet) => {
      shownSets.current++
      const parsed = analyse(raw.video, raw.comments)
      setReanalysed(null)
      setCurrentSet(raw)
      setResult(parsed)
      setTab('set')
      return parsed
    }

    tauriApi
      .getYouTubeSet(openVideoId)
      .then((raw) => {
        if (current()) showSet(raw)
      })
      .catch(async (err: unknown) => {
        if (!current()) return
        if (!isAppError(err) || err.kind !== 'NotFound') {
          setError(getErrorMessage(err))
          return
        }
        setLoading(true)
        setError(null)
        try {
          const raw = await tauriApi.fetchYouTubeSet(openVideoId)
          const parsed = current()
            ? showSet(raw)
            : analyse(raw.video, raw.comments)
          // Kept for good, as a pasted link is: reopening it costs nothing.
          await storeParsedSet(raw, parsed)
          refreshLibrary()
        } catch (fetchErr) {
          if (current()) {
            setError(getErrorMessage(fetchErr))
            setResult(null)
          }
        } finally {
          if (live) setLoading(false)
          refreshQuota()
        }
      })
    return () => {
      live = false
    }
  }, [openVideoId, refreshLibrary, refreshQuota])

  // A set shown here, however it was opened (the library, a link, a search
  // hit, a DJ page, Home), is no longer news on Home's New sets.
  const shownVideoId = currentSet?.video.id
  useEffect(() => {
    if (shownVideoId) void tauriApi.markDjFindsSeen([shownVideoId]).catch(() => {})
```

with

```tsx

  useEffect(() => {
    refreshQuota()
    refreshLibrary()
  }, [refreshQuota, refreshLibrary])

  /**
   * Opens a set on its page: at once with what is known (its title, its
   * thumbnail) and skeleton rows while it is read. A set that is not stored —
   * YouTube Music's Open in Sets, a new find, one deleted since — is fetched
   * (5–7 units) and stored, as a pasted link is; a stored one has its rows
   * filled in again (sets stored before the tracks table, or reparsed by a
   * better parser). At a track (a hit, an echo) it plays from that cue,
   * replacing the set playing, and scrolls to the row. A read that fails says
   * so on the page, with Try again, and in an error toast. Late, it gives way
   * to whatever was opened since.
   */
  const openSet = useCallback(
    async (videoId: string, how: { cueMs?: number; title?: string | null } = {}) => {
      const claim = ++shownSets.current
      const current = () => shownSets.current === claim
      setView('set')
      setOpening({ videoId, title: how.title ?? null, error: null })
      setFocusCue(how.cueMs ?? null)
      setReanalysed(null)
      let fetched = false
      try {
        let raw: RawSet
        try {
          raw = await tauriApi.getYouTubeSet(videoId)
        } catch (err) {
          if (!isAppError(err) || err.kind !== 'NotFound') throw err
          // Given up for a newer open: do not spend 5–7 units on it.
          if (!current()) return
          fetched = true
          raw = await tauriApi.fetchYouTubeSet(videoId)
        }
        const parsed = analyse(raw.video, raw.comments)
        if (current()) {
          setCurrentSet(raw)
          setResult(parsed)
          setOpening(null)
          if (how.cueMs !== undefined) useSetPlayer.getState().play(parsed, how.cueMs)
        }
        await storeParsedSet(raw, parsed)
        refreshLibrary()
      } catch (err) {
        if (!current()) return
        const message = getErrorMessage(err)
        setOpening({ videoId, title: how.title ?? null, error: message })
        if (readError.current !== null) dismissToast(readError.current)
        readError.current = toast(`Couldn't read this set: ${message}`, { kind: 'error' })
      } finally {
        if (fetched) refreshQuota()
      }
    },
    [refreshLibrary, refreshQuota],
  )

  // Arriving on a set: opened as from the library.
  useEffect(() => {
    if (openVideoId) void openSet(openVideoId)
    // Read once, when the view mounts (App remounts it for another start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Home's New sets row opens the Library tab, before the first paint.
  useLayoutEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab, setTab])

  /** Back to the library; a set still being read for the page is given up. */
  const showLibrary = useCallback(() => {
    shownSets.current++
    setView('library')
  }, [])

  // The sidebar's Sets, pressed while a set's page shows.
  useEffect(
    () =>
      useSetsView.subscribe((state, before) => {
        if (state.libraryRequests !== before.libraryRequests) showLibrary()
      }),
    [showLibrary],
  )

  // Back: the library where it was scrolled to, once its list is there to
  // scroll (on a fresh mount the list is still loading).
  const libraryLoaded = sets.length > 0
  useLayoutEffect(() => {
    if (view === 'library' && libraryLoaded && libraryScroll.current) {
      libraryScroll.current.scrollTop = useSetsView.getState().scrollTop
    }
  }, [view, libraryLoaded])

  // A set shown here, however it was opened (the library, a link, a search
  // hit, a DJ page, Home), is no longer news on Home's New sets.
  const shownVideoId = currentSet?.video.id
  useEffect(() => {
    if (shownVideoId) void tauriApi.markDjFindsSeen([shownVideoId]).catch(() => {})
```

In `src/components/views/SetsView.tsx`, replace

```tsx
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])

  /**
   * Plays a set from a cue: the set playing is sought, another takes its
   * place. Leaving the set or Sets keeps it playing, in the bar.
   */
  function playAt(parsed: TracklistResult, cueMs: number) {
    useSetPlayer.getState().play(parsed, cueMs)
  }

  function show(raw: RawSet): TracklistResult {
    shownSets.current++
    const parsed = analyse(raw.video, raw.comments)
    setReanalysed(null)
    setCurrentSet(raw)
    setResult(parsed)
    setTab('set')
    return parsed
  }

  async function handleProcess() {
    if (!input.trim() || loading) return
```

with

```tsx
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])

  /**
   * A set just fetched, on its page — unless something else was opened, or
   * Back pressed, since it was asked for (`claim`).
   */
  function show(raw: RawSet, claim: number): TracklistResult {
    const parsed = analyse(raw.video, raw.comments)
    if (shownSets.current !== claim) return parsed
    setReanalysed(null)
    setCurrentSet(raw)
    setResult(parsed)
    setOpening(null)
    setFocusCue(null)
    setView('set')
    return parsed
  }

  async function handleProcess() {
    if (!input.trim() || loading) return
```

In `src/components/views/SetsView.tsx`, replace

```tsx
      return
    }

    setLoading(true)
    setError(null)
    setFound(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(input.trim())
      shownSets.current++
      const parsed = analyse(raw.video, raw.comments)
      setCurrentSet(raw)
      setResult(parsed)
      setInput('')
      setTab('set')

      // Kept for good: reopening it later costs nothing.
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
```

with

```tsx
      return
    }

    setLoading(true)
    setError(null)
    setFound(null)
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(input.trim())
      const parsed = show(raw, claim)
      setInput('')

      // Kept for good: reopening it later costs nothing.
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  }

  /** Fetches one of the found sets: back to the ordinary 5-7 unit path. */
  async function processFound(hit: SetSearchHit) {
    setLoading(true)
    setError(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(hit.videoId)
      const parsed = show(raw)
      await storeParsed(raw, parsed)
      setFound(null)
      setInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
```

with

```tsx
  }

  /** Fetches one of the found sets: back to the ordinary 5-7 unit path. */
  async function processFound(hit: SetSearchHit) {
    setLoading(true)
    setError(null)
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(hit.videoId)
      const parsed = show(raw, claim)
      await storeParsed(raw, parsed)
      setFound(null)
      setInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   * `channelId` moves the channel's last-seen marker. A watched DJ has none —
   * its news comes from a dated search, not from a position in a listing.
   */
  async function importUpload(videoId: string, channelId?: string) {
    setBusy(videoId)
    setError(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw)
      await storeParsed(raw, parsed)
      if (channelId) await tauriApi.markYouTubeChannelSeen(channelId, videoId).catch(() => {})
      setNews(null)
      setUploads(null)
      refreshLibrary()
    } catch (err) {
```

with

```tsx
   * `channelId` moves the channel's last-seen marker. A watched DJ has none —
   * its news comes from a dated search, not from a position in a listing.
   */
  async function importUpload(videoId: string, channelId?: string) {
    setBusy(videoId)
    setError(null)
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw, claim)
      await storeParsed(raw, parsed)
      if (channelId) await tauriApi.markYouTubeChannelSeen(channelId, videoId).catch(() => {})
      setNews(null)
      setUploads(null)
      refreshLibrary()
    } catch (err) {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   * amount of reparsing the old copy will find it.
   *
   * So this is the one that spends: 5-7 units for a fresh fetch, and it says so
   * on the button.
   */
  async function reanalyse() {
    if (!result || loading) return
    const before = result.trackCount

    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < 7) {
      setError(`Fetching a set again costs 5–7 units and only ${quotaLeft} are left today.`)
      return
    }

    setLoading(true)
    setError(null)
    setReanalysed(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(result.video.id)
      const parsed = show(raw)
      // Playing, it plays on with the new rows.
      useSetPlayer.getState().replaceResult(parsed)
      await storeParsed(raw, parsed)
      refreshLibrary()
      // What it was worth saying plainly, since it just cost something.
      setReanalysed(
        parsed.trackCount === before
          ? `Nothing new — still ${before} ${before === 1 ? 'track' : 'tracks'}.`
          : `${before} → ${parsed.trackCount} tracks.`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /**
   * Opens the set the record was found in, at the moment it was played there.
   *
   * The stored copy is reused, so this costs nothing — which is the whole point
   * of keeping the raw fetch.
   */
  async function followEcho(echo: TrackEcho) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(echo.video_id)
      playAt(show(raw), echo.cue_ms)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function openStored(videoId: string) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(videoId)
      const parsed = show(raw)

      // Sets stored before the tracks table existed have no rows in it, and so
      // would be invisible to search and statistics. Reopening one fills them
      // in — and a set reparsed by an improved parser is refreshed the same way.
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /** Writes the parsed result next to the stored fetch. Costs no quota. */
  /** Shared with the automatic import, so both store a set the same way. */
  async function storeParsed(raw: RawSet, parsed: TracklistResult) {
    await storeParsedSet(raw, parsed)
  }

  /** Opens the set a search hit came from and jumps to the moment. */
  async function openHit(hit: YtTrackHit) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(hit.video_id)
      playAt(show(raw), hit.cue_ms)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function removeStored(videoId: string) {
    // A set that is playing stops first.
    if (useSetPlayer.getState().playing?.result.video.id === videoId) useSetPlayer.getState().stop()
    await tauriApi.deleteYouTubeSet(videoId).catch(() => {})
    if (currentSet?.video.id === videoId) {
      setCurrentSet(null)
      setResult(null)
    }
    refreshLibrary()
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })
```

with

```tsx
   * amount of reparsing the old copy will find it.
   *
   * So this is the one that spends: 5-7 units for a fresh fetch, and it says so
   * on the button.
   */
  async function reanalyse() {
    if (!result || lookingAgain) return
    const before = result.trackCount

    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < 7) {
      toast(`Fetching a set again costs 5–7 units and only ${quotaLeft} are left today.`, {
        kind: 'warning',
      })
      return
    }

    setLookingAgain(true)
    setReanalysed(null)
    // Look again never takes the page: if another set was opened, or Back
    // pressed, by the time it answers, it is stored and said in a toast.
    const claim = shownSets.current
    const { id: videoId, title } = result.video
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = analyse(raw.video, raw.comments)
      // Playing, it plays on with the new rows.
      useSetPlayer.getState().replaceResult(parsed)
      // What it was worth saying plainly, since it just cost something.
      const said =
        parsed.trackCount === before
          ? `Nothing new — still ${before} ${before === 1 ? 'track' : 'tracks'}.`
          : `${before} → ${parsed.trackCount} tracks.`
      if (shownSets.current === claim) {
        setCurrentSet(raw)
        setResult(parsed)
        setReanalysed(said)
      } else {
        toast(`Looked again at ${title}: ${said}`, { kind: 'info' })
      }
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      toast(`Couldn't read this set again: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      setLookingAgain(false)
      refreshQuota()
    }
  }

  /**
   * Opens the set the record was found in, at the moment it was played there.
   *
   * The stored copy is reused, so this costs nothing — which is the whole point
   * of keeping the raw fetch.
   */
  function followEcho(echo: TrackEcho) {
    void openSet(echo.video_id, { cueMs: echo.cue_ms, title: echo.set_title })
  }

  /** Writes the parsed result next to the stored fetch. Costs no quota. */
  /** Shared with the automatic import, so both store a set the same way. */
  async function storeParsed(raw: RawSet, parsed: TracklistResult) {
    await storeParsedSet(raw, parsed)
  }

  /** Opens the set a search hit came from and jumps to the moment. */
  function openHit(hit: YtTrackHit) {
    void openSet(hit.video_id, { cueMs: hit.cue_ms, title: hit.set_title })
  }

  /**
   * Removes a set from the library, after asking: it has no Undo. A set that
   * is playing stops first; its page, if open, goes back to the library.
   */
  async function removeSet(videoId: string, title: string) {
    const sure = await confirm(`Remove "${title}" from your library? Its saved tracks go with it.`, {
      title: 'Remove from library',
      kind: 'warning',
    }).catch(() => false)
    if (!sure) return
    if (useSetPlayer.getState().playing?.result.video.id === videoId) useSetPlayer.getState().stop()
    try {
      await tauriApi.deleteYouTubeSet(videoId)
    } catch (err) {
      toast(`Couldn't remove it: ${getErrorMessage(err)}`, { kind: 'error' })
      return
    }
    if (currentSet?.video.id === videoId) {
      setCurrentSet(null)
      setResult(null)
      showLibrary()
    }
    refreshLibrary()
    toast('Removed from your library')
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  /** The library, filed under whoever played each set. */
  const byDj = useMemo(() => groupByDj(sets), [sets])

  /** How many unseen sets the last check turned up, for the tab badge. */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0

  /** The shown set is the one playing: its video sits in the box above the list. */
  const playingHere = Boolean(result && playing?.result.video.id === result.video.id)
  const positionMs = panel?.position_ms ?? playing?.startMs ?? 0

  /**
   * The track the playhead is inside, and where that track begins and ends.
   * Taken from the position rather than from what was last clicked: the video
   * runs on into the next track, and a strip that still says the previous one
   * is worse than none.
   */
  const currentTrack =
    playingHere && result
      ? playheadTrack(
          result.tracks,
          Boolean(result.untimed),
          positionMs,
          panel && panel.duration_ms > 0 ? panel.duration_ms : result.video.durationMs,
        )
      : null

  /** One stored set, whichever way the library is grouped. */
  function StoredSet({ set }: { set: YtSetSummary }) {
    return (
      <div className="sets-stored">
        <button
          type="button"
          className="sets-stored__main"
          onClick={() => openStored(set.video_id)}
        >
          <span className="sets-stored__title">{set.title}</span>
          <span className="sets-stored__meta">
            {set.channel} · {set.track_count ?? 0} tracks
            {set.status === 'assembled' ? ' · assembled from comments' : ''}
          </span>
        </button>
        <button
          type="button"
          className="sets-stored__remove"
          onClick={() => removeStored(set.video_id)}
          title="Remove from the library"
        >
          <Icon name="Trash2" size={14} />
        </button>
      </div>
    )
  }

  const badge = result ? statusLabel(result) : null
  const unknownCount = result?.tracks.filter((t) => t.isUnknown).length ?? 0

  return (
    <div className="sets-view">
      {playingHere && tab === 'set' && result && (
        <div className="sets-player">
          <div className="sets-player__bar">
            <span className="sets-player__label">{result.video.title}</span>
            <div className="sets-player__controls">
              <button
                type="button"
                className="sets-player__ctrl"
                onClick={() => useSetPlayer.getState().step(-1)}
                disabled={stepCue(result.tracks, Boolean(result.untimed), positionMs, -1) === null}
                title="Previous track"
              >
                <Icon name="SkipBack" size={14} />
              </button>
              <button
                type="button"
                className="sets-player__ctrl"
                onClick={() => useSetPlayer.getState().togglePause()}
                title={videoIsPlaying(panel) ? 'Pause' : 'Play'}
              >
                <Icon name={videoIsPlaying(panel) ? 'Pause' : 'Play'} size={14} />
              </button>
              <button
                type="button"
                className="sets-player__ctrl"
                onClick={() => useSetPlayer.getState().step(1)}
                disabled={stepCue(result.tracks, Boolean(result.untimed), positionMs, 1) === null}
                title="Next track"
              >
                <Icon name="SkipForward" size={14} />
              </button>
              <button
                type="button"
                className="sets-player__close"
                onClick={() => useSetPlayer.getState().stop()}
              >
                <Icon name="X" size={14} /> close
              </button>
            </div>
          </div>

          {/* Deliberately empty: the webview covers exactly this box while
              it is mounted; elsewhere the video sits in the bar. */}
          <div className="sets-player__surface" ref={attachPageBox} />

          {currentTrack && (
            <TrackScrubber
              track={currentTrack.track}
              startMs={currentTrack.startMs}
              endMs={currentTrack.endMs}
              positionMs={positionMs}
              onSeek={(ms) => useSetPlayer.getState().seek(ms)}
            />
          )}
        </div>
      )}

      <div className="sets-view__scroll">
        <div className="sets-view__container">
          <div className="sets-tabs">
            {(['set', 'library', 'saved', 'channels', 'stats'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`sets-tab ${tab === t ? 'sets-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'set'
                  ? 'Set'
                  : t === 'library'
                    ? `Library (${sets.length})`
                    : t === 'saved'
                      ? `Saved (${saved.length})`
                      : t === 'channels'
                        ? `Following (${channels.length})`
                        : 'Stats'}
                {t === 'channels' && newCount > 0 && (
                  <span className="sets-tab__badge">{newCount}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'set' && (
            <>
              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="Paste a set link, or type a DJ's name"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleProcess()
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleProcess}
                  disabled={loading || !input.trim()}
                >
                  {loading
                    ? 'Reading...'
                    : looksLikeLink(input)
                      ? 'Process'
                      : 'Search · 101 units'}
                </button>
              </div>

              {quota && (
                <p className="sets-quota">
                  {quota.remaining.toLocaleString()} of {quota.daily_limit.toLocaleString()} quota
                  units left today · a set costs 5–7 · reopening a saved set costs nothing
                </p>
              )}

              {error && <div className="sets-error">{error}</div>}

              {found && (
                <>
                  <p className="sets-summary">
                    {found.length === 0
                      ? 'No long videos found for that name.'
                      : `${found.length} sets found — opening one costs 5–7 units`}
                  </p>
                  {found.map((hit) => {
                    // Read from the description that came back with the search,
                    // by the same rules that parse a stored set.
                    const preview = previewSet(hit)
                    const stored = sets.some((s) => s.video_id === hit.videoId)
                    return (
                      <button
                        type="button"
                        className="sets-found"
                        key={hit.videoId}
                        onClick={() => processFound(hit)}
                      >
                        {hit.thumbnail && (
                          <img className="sets-found__thumb" src={hit.thumbnail} alt="" />
                        )}
                        <span className="sets-found__text">
                          <span className="sets-stored__title">{hit.title}</span>
                          <span className="sets-stored__meta">
                            {hit.channel} · {hit.publishedAt.slice(0, 10)}
                            {preview.durationMs
                              ? ` · ${Math.round(preview.durationMs / 60000)} min`
                              : ''}
                          </span>
                          <span
                            className={`sets-found__promise ${
                              preview.trackCount > 0 ? 'sets-found__promise--found' : ''
                            }`}
                          >
                            {stored ? 'already in your library' : describePreview(preview)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {result && !found && (
                <>
                  <div className="sets-result__header">
                    <h2 className="sets-result__title">{result.video.title}</h2>
                    <div className="sets-result__meta">
                      <span className="sets-dj__chip">
                        {onOpenDj
                          ? billingParts(extractDjName(result.video.title, result.video.channel)).map(
                              (part, i) =>
                                part.dj ? (
                                  <button
                                    key={i}
                                    type="button"
                                    className="sets-dj__link"
                                    onClick={() => onOpenDj(part.text, result.video.id)}
                                    title={`Open ${part.text}'s page`}
                                  >
                                    {part.text}
                                  </button>
                                ) : (
                                  <span key={i} className="sets-dj__sep">
                                    {part.text}
                                  </span>
                                ),
                            )
                          : extractDjName(result.video.title, result.video.channel)}
                      </span>
                      <span>{result.video.channel}</span>
                      <span className={`sets-badge sets-badge--${badge!.kind}`}>{badge!.text}</span>
                      <span>{result.trackCount} tracks</span>
                      {matches && (
                        <span>
                          you have {matches.owned} of {matches.owned + matches.missing}
                        </span>
                      )}
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => playAt(result, 0)}
                      >
                        <Icon name="Play" size={12} /> play here
                      </button>
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => openInBrowser(result.video.url)}
                      >
                        <Icon name="ExternalLink" size={12} /> open in browser
                      </button>
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => reanalyse()}
                        disabled={loading}
                        title="Fetch the video and its comments again. A tracklist somebody posted since is only in the new copy — the stored one is frozen at the moment it was taken."
                      >
                        <Icon name="RefreshCw" size={12} />{' '}
                        {loading ? 'reading again...' : 'look again · 5–7 units'}
                      </button>
                    </div>
                  </div>

                  {reanalysed && <div className="sets-notice">{reanalysed}</div>}

                  <p className="sets-summary">
                    {result.trackCount} tracks from {result.sourceCount}{' '}
                    {result.sourceCount === 1 ? 'list' : 'crossed lists'}
                    {unknownCount > 0 && ` · ${unknownCount} unidentified`}
                    {result.sourceMeta && (
                      <>
                        {' · strongest source: '}
                        {result.source === 'description' ? 'the description' : 'comment'}{' '}
                        {result.sourceMeta.author}
                      </>
                    )}
                  </p>

                  {result.untimed ? (
                    <p className="sets-view__subtitle">
                      This list came with no timestamps, so there is nothing to seek to — the
                      order is the uploader's numbering. Everything else works: what you own is
                      marked, and the tracks are searchable and can be saved.
                    </p>
                  ) : (
                    <SetTimeline
                      tracks={result.tracks}
                      durationMs={result.video.durationMs}
                      onSeek={(cueMs) => playAt(result, cueMs)}
                      positionMs={playingHere ? positionMs : undefined}
                      playingIndex={currentTrack?.track.index ?? null}
                      bpmByIndex={bpmByIndex}
                    />
                  )}

                  {matches && matches.owned + matches.missing > 0 && (
                    <div className="sets-filter">
                      {(['all', 'have', 'missing'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`sets-filter__btn ${filter === mode ? 'sets-filter__btn--active' : ''}`}
                          onClick={() => setFilter(mode)}
                        >
                          {mode === 'all' ? 'All' : mode === 'have' ? 'In library' : 'Missing'}
                        </button>
                      ))}
                    </div>
                  )}

                  {result.tracks
                    .filter((track) => {
                      if (filter === 'all') return true
                      // An unnamed slot is neither owned nor missing, so it
                      // belongs only in the unfiltered view.
                      if (track.isUnknown) return false
                      const owned = matches?.byIndex.has(track.index) ?? false
                      return filter === 'have' ? owned : !owned
                    })
                    .map((track) => (
                      <TrackRow
                        key={track.index}
                        track={track}
                        onSeek={(cueMs) => playAt(result, cueMs)}
                        match={matches?.byIndex.get(track.index)}
                        onPlay={playFromSet}
                        untimed={result.untimed}
                        nowPlaying={currentTrack?.track.index === track.index}
                        echo={echoes.get(track.index)}
                        onFollowEcho={followEcho}
                        saved={savedKeys.has(
                          trackKey({
                            video_id: currentSet?.video.id,
                            cue_ms: track.cueMs,
                            title: track.title,
                          }),
                        )}
                        onToggleSave={toggleSave}
                      />
                    ))}

                  {result.tracks.length === 0 && (
                    <p className="sets-empty">
                      Nothing in the description and nothing usable in the comments. On a fresh set
                      this is worth retrying in a few days — tracklists arrive slowly.
                    </p>
                  )}

                  {result.loose.length > 0 && (
                    <div className="sets-loose">
                      <h3 className="sets-loose__title">Named without a timestamp</h3>
                      <p className="sets-loose__hint">
                        Mentioned in the comments, but nobody said where in the set.
                      </p>
                      {result.loose.map((item) => (
                        <div className="sets-track" key={item.key ?? item.title}>
                          <span className="sets-track__cue">—</span>
                          <span className="sets-track__name">
                            <span className="sets-track__artist">{item.artist}</span> — {item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!result && !error && (
                <p className="sets-empty">
                  A popular set has four to seven tracklists typed out by different people. What one
                  of them marks as ID, another one names.
                </p>
              )}
            </>
          )}

          {tab === 'library' && (
            <>
              <p className="sets-view__subtitle">
                Every set you have processed, kept whole. Opening one costs no quota.
              </p>
```

with

```tsx
  /** The library, filed under whoever played each set. */
  const byDj = useMemo(() => groupByDj(sets), [sets])

  /** How many unseen sets the last check turned up, for the tab badge. */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0

  /** One stored set, whichever way the library is grouped. */
  function StoredSet({ set }: { set: YtSetSummary }) {
    return (
      <div className="sets-stored">
        <button
          type="button"
          className="sets-stored__main"
          onClick={() => void openSet(set.video_id, { title: set.title })}
        >
          <span className="sets-stored__title">{set.title}</span>
          <span className="sets-stored__meta">
            {set.channel} · {set.track_count ?? 0} tracks
            {set.status === 'assembled' ? ' · assembled from comments' : ''}
          </span>
        </button>
        <button
          type="button"
          className="sets-stored__remove"
          onClick={() => void removeSet(set.video_id, set.title)}
          title="Remove from the library"
        >
          <Icon name="Trash2" size={14} />
        </button>
      </div>
    )
  }

  if (view === 'set') {
    const shownId = opening?.videoId ?? currentSet?.video.id ?? null
    const summary = shownId ? sets.find((s) => s.video_id === shownId) : undefined
    return (
      <div className="sets-view">
        <SetPage
          // Another set is another page: its filter starts on All.
          key={shownId ?? ''}
          result={opening ? null : result}
          // While it reads, the title the library knows, if the opener did not.
          opening={opening && !opening.title && summary ? { ...opening, title: summary.title } : opening}
          savedAt={summary?.added_at ?? null}
          matches={opening ? null : matches}
          echoes={echoes}
          isSaved={(track) =>
            savedKeys.has(trackKey({ video_id: currentSet?.video.id, cue_ms: track.cueMs, title: track.title }))
          }
          bpmByIndex={bpmByIndex}
          notice={reanalysed}
          lookingAgain={lookingAgain}
          focusCue={focusCue}
          onBack={showLibrary}
          onRetry={() => opening && void openSet(opening.videoId, { title: opening.title })}
          onOpenDj={onOpenDj ? (name) => onOpenDj(name, currentSet?.video.id ?? null) : undefined}
          onPlayFile={playFromSet}
          onToggleSave={toggleSave}
          onFollowEcho={followEcho}
          onLookAgain={() => void reanalyse()}
          onRemove={
            summary && currentSet ? () => void removeSet(summary.video_id, summary.title) : null
          }
        />
      </div>
    )
  }

  return (
    <div className="sets-view">
      <div
        className="sets-view__scroll"
        ref={libraryScroll}
        onScroll={(e) => useSetsView.getState().setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="sets-view__container">
          {/* One box: a set link opens it, a DJ's name searches YouTube for
              their sets (101 units, said on the button). */}
          <div className="sets-form">
            <input
              className="sets-form__input"
              placeholder="Paste a set link, or type a DJ's name"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleProcess()
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleProcess}
              disabled={loading || !input.trim()}
            >
              {loading
                ? 'Reading...'
                : looksLikeLink(input)
                  ? 'Process'
                  : 'Search · 101 units'}
            </button>
          </div>

          {quota && (
            <p className="sets-quota">
              {quota.remaining.toLocaleString()} of {quota.daily_limit.toLocaleString()} quota
              units left today · a set costs 5–7 · reopening a saved set costs nothing
            </p>
          )}

          {error && <div className="sets-error">{error}</div>}

          {found && (
            <>
              <p className="sets-summary">
                {found.length === 0
                  ? 'No long videos found for that name.'
                  : `${found.length} sets found — opening one costs 5–7 units`}
              </p>
              {found.map((hit) => {
                // Read from the description that came back with the search,
                // by the same rules that parse a stored set.
                const preview = previewSet(hit)
                const stored = sets.some((s) => s.video_id === hit.videoId)
                return (
                  <button
                    type="button"
                    className="sets-found"
                    key={hit.videoId}
                    onClick={() => processFound(hit)}
                  >
                    {hit.thumbnail && (
                      <img className="sets-found__thumb" src={hit.thumbnail} alt="" />
                    )}
                    <span className="sets-found__text">
                      <span className="sets-stored__title">{hit.title}</span>
                      <span className="sets-stored__meta">
                        {hit.channel} · {hit.publishedAt.slice(0, 10)}
                        {preview.durationMs
                          ? ` · ${Math.round(preview.durationMs / 60000)} min`
                          : ''}
                      </span>
                      <span
                        className={`sets-found__promise ${
                          preview.trackCount > 0 ? 'sets-found__promise--found' : ''
                        }`}
                      >
                        {stored ? 'already in your library' : describePreview(preview)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </>
          )}


          <div className="sets-tabs">
            {(['library', 'saved', 'channels', 'stats'] as const).map((t: SetsTab) => (
              <button
                key={t}
                type="button"
                className={`sets-tab ${tab === t ? 'sets-tab--active' : ''}`}
                onClick={() => {
                  setTab(t)
                  // Another tab starts at its top.
                  if (libraryScroll.current) libraryScroll.current.scrollTop = 0
                }}
              >
                {t === 'library'
                  ? `Library (${sets.length})`
                  : t === 'saved'
                    ? `Saved (${saved.length})`
                    : t === 'channels'
                      ? `Following (${channels.length})`
                      : 'Stats'}
                {t === 'channels' && newCount > 0 && (
                  <span className="sets-tab__badge">{newCount}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'library' && (
            <>
              <p className="sets-view__subtitle">
                Every set you have processed, kept whole. Opening one costs no quota.
              </p>
```

In `src/components/views/SetsView.tsx`, replace

```tsx
                    <button
                      type="button"
                      className="sets-hit"
                      key={item.video_id}
                      onClick={() =>
                        item.already_stored
                          ? openStored(item.video_id)
                          : importUpload(
                              item.video_id,
                              uploads.channel.channel_id.startsWith('dj:')
                                ? undefined
                                : uploads.channel.channel_id,
                            )
```

with

```tsx
                    <button
                      type="button"
                      className="sets-hit"
                      key={item.video_id}
                      onClick={() =>
                        item.already_stored
                          ? void openSet(item.video_id, { title: item.title })
                          : importUpload(
                              item.video_id,
                              uploads.channel.channel_id.startsWith('dj:')
                                ? undefined
                                : uploads.channel.channel_id,
                            )
```

In `src/components/views/SetsView.tsx`, replace

```tsx
                      {stats.most_unknowns.length === 0 && <p className="sets-empty">—</p>}
                      {stats.most_unknowns.map(([videoId, title, count]) => (
                        <button
                          type="button"
                          className="sets-hit"
                          key={videoId}
                          onClick={() => openStored(videoId)}
                        >
                          <span className="sets-track__name">{title}</span>
                          <span className="sets-track__votes">{count} IDs</span>
                        </button>
                      ))}
                    </div>
```

with

```tsx
                      {stats.most_unknowns.length === 0 && <p className="sets-empty">—</p>}
                      {stats.most_unknowns.map(([videoId, title, count]) => (
                        <button
                          type="button"
                          className="sets-hit"
                          key={videoId}
                          onClick={() => void openSet(videoId, { title })}
                        >
                          <span className="sets-track__name">{title}</span>
                          <span className="sets-track__votes">{count} IDs</span>
                        </button>
                      ))}
                    </div>
```

- [ ] **Step 2: The rules only the old Set tab and video band used**

In `src/components/views/SetsView.css`, replace

```css
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px 28px 48px;
}

.sets-player {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border);
  background: #000;
}

.sets-player__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.sets-player__label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sets-player__close {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  flex-shrink: 0;
}

.sets-player__close:hover {
  color: var(--text-primary);
}

/* Left empty on purpose — the YouTube webview is laid exactly over this box. */
.sets-player__surface {
  height: 340px;
  background: #000;
}

.sets-view__container {
  max-width: 900px;
  margin: 0 auto;
}

.sets-view__title {
```

with

```css
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px 28px 48px;
}

.sets-view__container {
  max-width: 900px;
  margin: 0 auto;
}

.sets-view__title {
```

In `src/components/views/SetsView.css`, replace

```css
  border: 1px solid rgba(var(--color-danger-rgb), 0.35);
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin-bottom: 16px;
}

.sets-result__header {
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 14px;
  margin-bottom: 6px;
}

.sets-result__title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.sets-result__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.sets-badge {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 500;
}

.sets-badge--ok {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.sets-badge--assembled {
  background: rgba(var(--color-warning-rgb), 0.12);
  color: var(--color-warning);
}

.sets-badge--weak {
  background: rgba(var(--color-danger-rgb), 0.12);
  color: var(--color-danger);
}

/* --- track rows --- */

.sets-track {
  display: flex;
  align-items: baseline;
  gap: 12px;
```

with

```css
  border: 1px solid rgba(var(--color-danger-rgb), 0.35);
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin-bottom: 16px;
}

/* --- track rows --- */

.sets-track {
  display: flex;
  align-items: baseline;
  gap: 12px;
```

In `src/components/views/SetsView.css`, replace

```css
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.sets-track__cue-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
}

.sets-track__cue-btn:hover {
  color: var(--accent);
  text-decoration: underline;
}

.sets-track__name {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.sets-track__artist {
  color: var(--text-secondary);
}

.sets-track--unknown .sets-track__name {
  color: var(--color-danger);
}

.sets-track__extra {
  display: block;
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin-top: 2px;
}
```

with

```css
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.sets-track__name {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.sets-track__artist {
  color: var(--text-secondary);
}

.sets-track__extra {
  display: block;
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin-top: 2px;
}
```

In `src/components/views/SetsView.css`, replace

```css
  flex: 0 0 auto;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.sets-track__votes--lonely {
  color: var(--color-danger);
}

.sets-loose {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
```

with

```css
  flex: 0 0 auto;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.sets-loose {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
```

In `src/components/views/SetsView.css`, replace

```css
  font-size: var(--text-sm);
  line-height: 1.7;
}

/* --- library ownership --- */

.sets-track__own {
  flex: 0 0 auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.sets-track__own--have {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--color-success-rgb), 0.35);
  background: rgba(var(--color-success-rgb), 0.1);
  color: var(--color-success);
  cursor: pointer;
}

.sets-track__own--have:hover {
  background: rgba(var(--color-success-rgb), 0.2);
}

.sets-filter {
  display: flex;
  gap: 6px;
  margin: 14px 0 6px;
}
```

with

```css
  font-size: var(--text-sm);
  line-height: 1.7;
}

/* --- library ownership --- */

.sets-filter {
  display: flex;
  gap: 6px;
  margin: 14px 0 6px;
}
```

In `src/components/views/SetsView.css`, replace

```css
.sets-notice__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* A row with no timestamp of its own, pointing at a set that has one. */
.sets-track__echo {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.sets-track__echo:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* The row the video is inside right now. */
.sets-track--playing {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.sets-track--playing .sets-track__name,
.sets-track--playing .sets-track__cue {
  color: var(--text-primary);
}

.sets-track--playing .sets-track__index {
  color: var(--accent);
}

/* The same track, lit up in the strip. */
.sets-timeline__block--playing {
  background: var(--accent);
}

/* Where the video actually is — the blocks say which track, not how far in. */
```

with

```css
.sets-notice__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* The same track, lit up in the strip. */
.sets-timeline__block--playing {
  background: var(--accent);
}

/* Where the video actually is — the blocks say which track, not how far in. */
```

In `src/components/views/SetsView.css`, replace

```css
.sets-summary {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  margin: 12px 0 0;
}

.sets-track__index {
  flex: 0 0 26px;
  text-align: right;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.sets-track__cue {
  flex: 0 0 58px;
}

.sets-track__play {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.sets-track__play:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sets-player__label {
  flex: 1;
  min-width: 0;
}

.sets-player__cue {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.sets-player__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.sets-player__ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.sets-player__ctrl:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.sets-player__ctrl:disabled {
  opacity: 0.35;
  cursor: default;
}

/* --- search hits and statistics --- */

.sets-hit {
  display: flex;
  align-items: baseline;
  gap: 12px;
```

with

```css
.sets-summary {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  margin: 12px 0 0;
}

.sets-track__cue {
  flex: 0 0 58px;
}

/* --- search hits and statistics --- */

.sets-hit {
  display: flex;
  align-items: baseline;
  gap: 12px;
```

In `src/components/views/SetsView.css`, replace

```css
.sets-stores {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

/* On a row, the links stay out of the way until the row is hovered —
   otherwise four links on forty rows drown out the tracklist itself. */
.sets-stores--hover {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.sets-track:hover .sets-stores--hover,
.sets-stores--hover:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/* Inside a group the links sit tighter than the single trailing link they
   were originally written for. */
.sets-stores .sets-store-link {
  padding: 0 4px;
}
```

with

```css
.sets-stores {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

/* Inside a group the links sit tighter than the single trailing link they
   were originally written for. */
.sets-stores .sets-store-link {
  padding: 0 4px;
}
```

In `src/components/views/SetsView.css`, replace

```css
/* A rail down the side, so where a group ends is never in question. */
.sets-dj__sets {
  border-left: 2px solid var(--border);
  padding-left: 10px;
  margin-left: 2px;
}

.sets-dj__chip {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-weight: 500;
}

/* Each DJ in the chip opens their page. */
.sets-dj__link {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.sets-dj__link:hover {
  color: var(--accent);
  text-decoration: underline;
}

/* "b2b" / "vs" between two links. */
.sets-dj__sep {
  margin: 0 0.35em;
  color: var(--text-secondary);
  font-weight: 400;
}
```

with

```css
/* A rail down the side, so where a group ends is never in question. */
.sets-dj__sets {
  border-left: 2px solid var(--border);
  padding-left: 10px;
  margin-left: 2px;
}
```

- [ ] **Step 3: App** — the sidebar's Sets on a set's page asks the library back; the comments that spoke of the Set tab

In `src/App.tsx`, replace

```tsx
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { SetPlayerBar } from './components/sets/SetPlayerBar'
import { SetPlayerEngine } from './lib/setPlayer/SetPlayerEngine'
import { useOverlay } from './lib/overlays'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { SetsView } from './components/views/SetsView'
```

with

```tsx
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { SetPlayerBar } from './components/sets/SetPlayerBar'
import { SetPlayerEngine } from './lib/setPlayer/SetPlayerEngine'
import { useOverlay } from './lib/overlays'
import { useSetsView } from './store/setsViewStore'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { SetsView } from './components/views/SetsView'
```

In `src/App.tsx`, replace

```tsx
  /** From a Spotify search card: that artist, stored as a manual match. */
  spotifyArtistId: string | null
  from: DjOrigin
}

/**
 * What the Sets view opens with: a stored set to show (Back from a DJ page
 * opened from it, a DJ page's set card) or a DJ's name in the Set tab's box
 * (a DJ page's Find more), or its library (Home's Needs you). SetsView reads
 * them once, when it mounts.
 */
interface SetsStart {
  openVideoId: string | null
  initialQuery: string
  tab?: 'library'
}
```

with

```tsx
  /** From a Spotify search card: that artist, stored as a manual match. */
  spotifyArtistId: string | null
  from: DjOrigin
}

/**
 * What the Sets view opens with: a set to open on its page (Back from a DJ
 * page opened from it, a DJ page's set card, Home, Search, the set bar) or a
 * DJ's name in its box (a DJ page's Find more), or its Library tab (Home's
 * Needs you). SetsView reads them once, when it mounts.
 */
interface SetsStart {
  openVideoId: string | null
  initialQuery: string
  tab?: 'library'
}
```

In `src/App.tsx`, replace

```tsx
    }
    setShowSearch(djPage.from.view === 'search')
    setShowSets(false)
    setDjPage(null)
  }

  // Sets, arriving on a set or with a DJ's name in the Set tab's box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setSetsVisit((visit) => visit + 1)
    setDjPage(null)
```

with

```tsx
    }
    setShowSearch(djPage.from.view === 'search')
    setShowSets(false)
    setDjPage(null)
  }

  // Sets, arriving on a set's page or with a DJ's name in its box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setSetsVisit((visit) => visit + 1)
    setDjPage(null)
```

In `src/App.tsx`, replace

```tsx
          showSets &&
          djPage === null &&
          shownSpotifyList === null &&
          shownYouTubeMusicList === null
        setShowSets(true)
        if (!setsShowing) setSetsStart(NO_SETS_START)
        setStreamList(null)
        setDjPage(null)
        setShowSearch(false)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
```

with

```tsx
          showSets &&
          djPage === null &&
          shownSpotifyList === null &&
          shownYouTubeMusicList === null
        setShowSets(true)
        if (!setsShowing) setSetsStart(NO_SETS_START)
        // Showing already, a set's page goes back to the library.
        else useSetsView.getState().requestLibrary()
        setStreamList(null)
        setDjPage(null)
        setShowSearch(false)
        setSelectedFolder(null)
        setSelectedPlaylistId(null)
        setShowAllTracks(false)
```

In `src/components/views/DjView.tsx`, replace

```tsx
  /** From a Spotify search card: stored as the manual match on opening. */
  spotifyArtistId: string | null
  /** App's Spotify data: the shared library index, verdicts, connection. */
  spotify: SpotifyData
  /** Back to where the first DJ page was opened from (Search or Sets). */
  onBack: () => void
  /** Sets, arriving on a set or with the Set tab's box filled in. */
  onOpenSets: (start: {
    openVideoId: string | null
    initialQuery: string
  }) => void
  /** Another DJ's page (a gig's lineup); Back still returns to the first one's origin. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
```

with

```tsx
  /** From a Spotify search card: stored as the manual match on opening. */
  spotifyArtistId: string | null
  /** App's Spotify data: the shared library index, verdicts, connection. */
  spotify: SpotifyData
  /** Back to where the first DJ page was opened from (Search or Sets). */
  onBack: () => void
  /** Sets, arriving on a set's page or with its box filled in. */
  onOpenSets: (start: {
    openVideoId: string | null
    initialQuery: string
  }) => void
  /** Another DJ's page (a gig's lineup); Back still returns to the first one's origin. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
```

In `src/components/dj/DjSetsTab.tsx`, replace

```tsx
// src/components/dj/DjSetsTab.tsx
// The Sets tab: the DJ's saved sets as cards, each opening in Sets, then
// "Find more", which opens Sets' Set tab with the name typed in (not run).
import { Icon } from '../Icon'
import { setMeta, setThumbnail } from '../../lib/dj/page'
import type { YtSetSummary } from '../../types/youtube'

/** One saved set: its YouTube thumbnail, title and "1 h 52 min · 24 tracks". The overview's Sets card shows these too. */
export function SetCard({
```

with

```tsx
// src/components/dj/DjSetsTab.tsx
// The Sets tab: the DJ's saved sets as cards, each opening in Sets, then
// "Find more", which opens Sets with the name typed in its box (not run).
import { Icon } from '../Icon'
import { setMeta, setThumbnail } from '../../lib/dj/page'
import type { YtSetSummary } from '../../types/youtube'

/** One saved set: its YouTube thumbnail, title and "1 h 52 min · 24 tracks". The overview's Sets card shows these too. */
export function SetCard({
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 631 passed (632)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/views/SetsView.tsx src/components/views/SetsView.css src/App.tsx src/components/views/DjView.tsx src/components/dj/DjSetsTab.tsx
git commit -m "feat(sets): Sets opens on its library, and a set on a page of its own"
```

---

### Task 6: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`, replace

```markdown
…", with Try again) and as an error toast (Interactions spec). Opening a set
marks its video's finds seen (Home spec), on every open. Opening at a track (a
hit, an echo, a Saved track) scrolls to that row and plays the set from its
cue, replacing whatever set was playing; opening from a card or a new find
does not start playback.

## Playing

**Play set**, or ▶ on a row, opens the video in the hero's box, which grows to
440px wide while this set plays on its page. Under the video, today's
**TrackScrubber** (the bar for winding through the one record playing) stays.
The hero's buttons become **Pause / Play**, **⏮**, **⏭** and **✕ Stop**, then
```

with

```markdown
…", with Try again) and as an error toast (Interactions spec). Opening a set
marks its video's finds seen (Home spec), on every open. Opening at a track (a
hit, an echo, a Saved track) scrolls to that row and plays the set from its
cue, replacing whatever set was playing; opening from a card or a new find
does not start playback.

**As built by plan S2:**

- The page is `src/components/sets/SetPage.tsx` with its row
  (`SetTrackRow.tsx`), `SetPage.css`, and `TrackScrubber` and `StoreLinks`
  moved out of `SetsView` beside it; its words and numbers are pure functions
  in `src/lib/sets/setPage.ts` (tested). `SetsView` keeps the data and which
  page shows; the `'set'` tab is gone and Sets opens on its library.
- Until plan S3 builds the library home, today's box (the input with
  "Process" / "Search · 101 units", the quota line, the found list) sits above
  the tabs, and the Library tab keeps today's list, "Where did I hear this?"
  and By DJ / Newest first.
- Back returns to the library's tab, grouping and scroll from a small store
  (`useSetsView`) that outlives `SetsView`, so a trip through a DJ page keeps
  them; the scroll comes back once the list has loaded, and another tab
  starts at its top. The sidebar's Sets, pressed while a set's page shows,
  goes back to the library too (`requestLibrary`). `SetsStart` is unchanged:
  no caller opens a set at a cue from outside Sets yet, so it has no cue.
- One opener, `openSet(videoId, { cueMs, title })`: the page shows at once
  with the title the opener or the library knows ("Reading the set…" when
  neither does) and eight skeleton rows; a stored set is stored again (its
  rows refilled; `added_at` is kept); a set not stored is fetched and stored.
  A failure says "Couldn't read this set: …" with Try again ("This set" as
  the title when none is known) and shows an error toast, which a retry
  replaces. Opened at a track, its row is scrolled to the middle and the set
  plays from its cue. A newer open, or Back, gives up an open still on its
  way: it neither shows, nor plays, nor fetches (so React's StrictMode
  double mount spends 5–7 units once). A pasted link, a found set and a
  channel's upload open their page only if nothing else was opened since.
- Look again never takes the page: answering after Back or another set, it
  is stored (and a playing set gets its rows) and says what it found in a
  toast ("Looked again at …: 12 → 13 tracks."). Its failures and its "only N
  units left" warning are toasts too (the page has no error line). Removing a set asks first (the native confirm),
  from ⋯ and from the library row's bin, says "Removed from your library",
  and goes back to the library when its page was open; its saved tracks go
  with it.
- The hero puts "‹ Sets" above the title, as the mockup; the thumbnail's
  length sits bottom right. ⋯ is the shared `Menu`: Open on YouTube (at the
  position playing, when this set plays), Look again for a tracklist (5–7
  units), Copy missing tracks (its count; a toast says how many were copied),
  Remove from library (only for a set in it).
- Playing here, the hero is the mockup's compact one: the numbers and the
  source line go and the title is 18px. The picture keeps to the top when the
  text beside it is taller, and both give way on a narrow window (the
  thumbnail down to 200px, the video to 240px), so at 800×600 the rows keep
  272px and nothing scrolls sideways.
- A list assembled from scattered comments has no lists to count: its line
  reads "assembled from comments", without "from N lists". "Named without a
  timestamp" shows under a set with no rows too.
- Rows: the number's ▶ shows on hover and when it has the keyboard (opacity,
  so it stays reachable; only the keyboard's focus hides the number, as
  WebView2 focuses a clicked button); the store links follow the title in the
  spec's order (Beatport · Discogs · Bandcamp · Spotify), on hover and while
  the row holds the keyboard's focus; the playing row takes the
  track table's playing colour (the accent drawn toward the text, which reads
  on the light themes); an ID row is muted, with no "missing" and no ♡.
- The filter is four buttons with their counts (`aria-pressed`), in the
  mockup's tab style; another set is another page, so it starts on All.
- `SetsView.css` loses the rules only the old Set tab and video band used.

## Playing

**Play set**, or ▶ on a row, opens the video in the hero's box, which grows to
440px wide while this set plays on its page. Under the video, today's
**TrackScrubber** (the bar for winding through the one record playing) stays.
The hero's buttons become **Pause / Play**, **⏮**, **⏭** and **✕ Stop**, then
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-sets-redesign-design.md
git commit -m "docs(spec): Sets S2 as built"
```

---

### Task 7: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 631 passed (632)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Sets opens on the library (no Set tab); a set from the list opens on its own page: the title at once, then the numbers, the strip, the filter and the rows.
  - Play set: the video plays where the thumbnail was, larger; Pause, ⏮, ⏭, Stop work; the rows scroll under a hero that stays put; ▶ on a row's number plays from there; the playing row shows the equalizer.
  - The filter: You own, Missing, IDs show those rows. A row's store links show on hover; "have it" plays your file (the video pauses); ♡ saves it.
  - ⋯: Open on YouTube; Look again (5–7 units) keeps a playing set playing; Copy missing tracks; Remove from library asks first.
  - "‹ Sets": the library as you left it (tab, By DJ / Newest, scroll), the video playing on in the bar. The same after opening a DJ from the page and coming back. The sidebar's Sets on a set's page also returns to the library.
  - A narrow window while a set plays: the hero shrinks, the rows stay visible, nothing scrolls sideways.
  - "Where did I hear this?": a hit opens its set at that track, playing. An untimed set's "↳ 12:30" opens the other set there.
  - A DJ page's set card, Home's set rows and the set bar open the set's page.
