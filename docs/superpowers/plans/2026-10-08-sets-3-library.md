# Sets S3: The Library Home and the One Box — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sets opens on its library, as the mockup draws it. At the top, **one box** — "Paste a set link, or type a DJ's name", the quota under it — whose dropdown offers what fits: a link opens its set ("In your library · free" or "Open this set · 5–7 units"); text finds **Your sets** (5) and **Tracks in your sets** (8) as you type, free, and ends with **Search YouTube for sets by "…" · 101 units**, whose results replace the page below the box. Then the tabs — **Library 29 · 3 new**, **Saved tracks**, **Following** (badge), **Stats** — with **By DJ / Newest** on the right; on the Library tab, **New from DJs you watch** (the unseen finds as cards, with Mark all seen and its Undo) and **Your sets** as cards (thumbnail with its length, two-line title, "channel · 41 tracks"), in one grid newest first or under each DJ.

**Architecture:**
- **Pure TypeScript** (tested), `src/lib/sets/box.ts`: a link's video id, what the box offers (empty, a link — stored or not —, text), the stored sets the text matches (title, channel, DJ; no case or accents), a card's line.
- **Components**, `src/components/sets/`: `SetsBox.tsx` (the box, the dropdown, its keys; it runs the free track search itself), `SetsLibrary.tsx` (the Library tab: new finds and set cards), `SetsHome.css`.
- **`SetsView`**: the box at the top (its link and stored-set rows open through S2's `openSet`, a hit through `openHit`, the YouTube row through `handleSearchSets(query)`); YouTube's results in place of the page; the tabs as buttons; the Library tab renders `SetsLibrary`; the new finds are read with the library (`get_new_dj_finds`), and Mark all seen with Undo as on Home. The old Process button, the library's "Where did I hear this?" input and its list rows go.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom). No Rust: H3 built `get_new_dj_finds`, `mark_all_dj_finds_seen` and `mark_dj_finds_unseen`.

**Spec:** `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` — "Sets home: the library" (all of it); the approved mockup `2026-10-04-sets-redesign-mockup.html`, section 1. Plan order: (1) the player ✓, (2) the set page ✓, **(3) this plan**, (4) Following, Saved and Stats.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 5 writes them into the spec):
- **The box's keys:** ↑ / ↓ move, Enter opens the row lit — the first one, so with text a free result comes before the YouTube search, which never runs on Enter alone unless it is the only row —, Esc closes the dropdown and then clears the box (and YouTube's results). A press chooses a row before the input's blur closes the list. "Reading…" shows in the box while a set is fetched or YouTube searched. The Process / Search button goes; the dropdown's rows are the actions.
- **No `useOverlay` for the dropdown:** it sits inside the main area, which ends above the player area, so it can never cover the set video (in the bar below; a set's page box is not on the library). Registering would only move the bar's video aside while typing.
- **YouTube's results** keep today's rows (thumbnail, title, channel, date, length, "12 tracks in the description" / "no tracklist"), under "2 sets found on YouTube — opening one costs 5–7 units" and "Back to your library"; one already in the library says "in your library" and opens at no cost (today it was fetched again).
- **Tabs**: the mockup's buttons (28px, 6px corners, the one shown in the text colour); "Library 16 · 3 new" (the unseen finds' total), "Saved tracks 4", "Following" with a badge that counts the channels' news only (a DJ's finds show on the Library tab), "Stats". By DJ / Newest on the right, on the Library tab with sets.
- **New from DJs you watch**: up to 20 unseen finds, newest first, cards in a wrapping grid (at least 260px each): the thumbnail (96px), the DJ in orange, the title, "saved" or "opening costs 5–7". A card opens the set (fetched and stored when it is not, 5–7 units), which marks it seen. Mark all seen: the same toast and Undo as on Home. Read with the library: on arrival, after a check, after a set is opened.
- **Your sets**: 4 cards to a row, 3 below a 1100px window (a media query, as the spec says "below 1100px"); the length on the thumbnail; the title on two lines; "channel · 41 tracks" or "channel · no tracklist yet". By DJ: a heading per DJ — the name opens the DJ page — with "N sets", DJs with the most sets first (today's `groupByDj`). The list's bin goes: removing a set is on its page's ⋯ (with its confirm).
- **Find more** fills the box and focuses it, so the dropdown shows the free results at once; nothing is spent until the YouTube row.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `438b41a`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` and each task's tests pass at every task's end.
- **Builds and tests:**
  - `vitest`: 6 new. The repo counts 638 after it: 637 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes. No Rust changes.
- **In WebKit** (the S2 test page with three unseen finds — one saved —, YouTube's search mocked, 16 stored sets), at 1280 and at 1000 in the light Dawn theme:
  - the home: "9,340 units left today · a set costs 5–7 · reopening one costs nothing"; "Library 16 · 3 new · Saved tracks 0 · Following · Stats", By DJ / Newest; three new-find cards ("JOSEPH CAPRIATI · Live Napoli 2026 … · opening costs 5–7", "LUCIANO … · saved"); set cards 4 to a row at 1280, 3 at 1000, "3:39:00 · Adam Port live at Tomorrowland · Various · 12 tracks";
  - typing "traumer": "Tracks in your sets", "51:00 Oliver Moldan — Babe · Marco Carola b2b Luciano …", "Search YouTube for sets by "traumer" · 101 units"; ↓ lights the YouTube row without searching; Esc closes, Esc again clears;
  - a hit: its set at 51:00, playing; a stored link: "In your library · free"; an unknown link: "Open this set · 5–7 units", Enter fetches and opens it;
  - the YouTube row: its two results replace the tabs ("in your library", "nothing in the description"); the stored one opens without a fetch; "Back to your library";
  - Mark all seen: the cards go, the tab loses "· N new", a toast with Undo; Undo brings them back;
  - a new-find card opens its set (here its fetch is refused: the page says so);
  - Newest: one grid of 16; a DJ heading opens the DJ page;
  - Find more ("Hot Since 82"): the box filled, the dropdown open with a stored set, a track and the YouTube row, nothing searched; no unseen finds: no section, "Library 16".

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/sets/box.ts` (+ test) | create | what the box offers; matching stored sets; a card's line |
| `src/components/sets/SetsBox.tsx` | create | the box and its dropdown |
| `src/components/sets/SetsLibrary.tsx` | create | the Library tab: new finds, set cards |
| `src/components/sets/SetsHome.css` | create | the box, the tabs, the cards |
| `src/components/views/SetsView.tsx` | modify | the library home: box, YouTube's results, tabs, cards, Mark all seen |
| `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `438b41a`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 631 passed (632)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: What the box offers

**Files:** Create `src/lib/sets/box.ts`, `src/lib/sets/box.test.ts`.

- [ ] **Step 1: The failing test**

Create `src/lib/sets/box.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { boxOffer, matchingSets, setCardLine, videoIdOf } from './box'
import type { YtSetSummary } from '../../types/youtube'

const set = (video_id: string, title: string, channel?: string): YtSetSummary => ({ video_id, url: video_id, title, channel })

describe('videoIdOf', () => {
  it('reads the id from every kind of YouTube link, or a bare id', () => {
    expect(videoIdOf('https://www.youtube.com/watch?v=AvoifrdCfFM&t=42s')).toBe('AvoifrdCfFM')
    expect(videoIdOf('https://youtu.be/AvoifrdCfFM')).toBe('AvoifrdCfFM')
    expect(videoIdOf('https://www.youtube.com/live/AvoifrdCfFM?si=x')).toBe('AvoifrdCfFM')
    expect(videoIdOf('youtube.com/shorts/AvoifrdCfFM')).toBe('AvoifrdCfFM')
    expect(videoIdOf('  AvoifrdCfFM ')).toBe('AvoifrdCfFM')
    expect(videoIdOf('Hot Since 82')).toBeNull()
  })
})

describe('boxOffer', () => {
  const stored = new Set(['AvoifrdCfFM'])

  it('offers to open a link, free when the set is in the library', () => {
    expect(boxOffer('https://youtu.be/AvoifrdCfFM', stored)).toEqual({ kind: 'link', videoId: 'AvoifrdCfFM', stored: true })
    expect(boxOffer('https://youtu.be/BBBBBBBBBBB', stored)).toEqual({ kind: 'link', videoId: 'BBBBBBBBBBB', stored: false })
  })

  it('searches for text of two characters or more, and offers nothing for less', () => {
    expect(boxOffer(' Traumer ', stored)).toEqual({ kind: 'text', query: 'Traumer' })
    expect(boxOffer('t', stored)).toEqual({ kind: 'empty' })
    expect(boxOffer('   ', stored)).toEqual({ kind: 'empty' })
  })
})

describe('matchingSets', () => {
  const sets = [
    set('a', 'Mochakk | HÖR Berlin', 'HÖR BERLIN'),
    set('b', 'Traumer @ Cercle Odyssey, Paris', 'Cercle'),
    set('c', 'Live from the terrace', 'Traumer'),
    set('d', 'Solomun Boiler Room Tulum', 'Boiler Room'),
  ]

  it('finds the text in the title, the channel or the DJ, without case or accents', () => {
    expect(matchingSets(sets, 'traumer').map((s) => s.video_id)).toEqual(['b', 'c'])
    expect(matchingSets(sets, 'hor').map((s) => s.video_id)).toEqual(['a'])
    expect(matchingSets(sets, 'boiler').map((s) => s.video_id)).toEqual(['d'])
    expect(matchingSets(sets, 'nobody')).toEqual([])
  })

  it('lists at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => set(`m${i}`, `Traumer live ${i}`))
    expect(matchingSets(many, 'traumer')).toHaveLength(5)
  })
})

describe('setCardLine', () => {
  it('reads the channel and the tracks, or that there is no tracklist yet', () => {
    expect(setCardLine({ channel: 'Cercle', track_count: 41 })).toBe('Cercle · 41 tracks')
    expect(setCardLine({ channel: 'UNDRSTND', track_count: 0 })).toBe('UNDRSTND · no tracklist yet')
    expect(setCardLine({ track_count: 1 })).toBe('1 track')
  })
})
```

Run `npx vitest run src/lib/sets/box.test.ts`: FAIL — `./box` does not exist.

- [ ] **Step 2: The functions**

Create `src/lib/sets/box.ts`:

```ts
// src/lib/sets/box.ts
// What Sets' one box offers for what is typed in it (Sets redesign spec,
// Sets home): a YouTube link opens that set; text of two characters or more
// finds what is stored, free, and offers the one search that spends quota;
// an empty box offers nothing.
import { extractDjName } from '../tracklist/djName'
import type { YtSetSummary } from '../../types/youtube'

/** The most stored sets, and track hits, the dropdown lists. */
export const YOUR_SETS_MAX = 5
export const TRACK_HITS_MAX = 8

export type BoxOffer =
  | { kind: 'empty' }
  /** A link or a bare id: opening it is free when it is stored, else 5–7 units. */
  | { kind: 'link'; videoId: string; stored: boolean }
  | { kind: 'text'; query: string }

/** The video id in a YouTube link (watch, youtu.be, embed, live, shorts) or a bare 11-character id. */
export function videoIdOf(input: string): string | null {
  const text = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text
  const match = /(?:[?&]v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(text)
  return match ? match[1] : null
}

export function boxOffer(input: string, storedIds: ReadonlySet<string>): BoxOffer {
  const videoId = videoIdOf(input)
  if (videoId) return { kind: 'link', videoId, stored: storedIds.has(videoId) }
  const query = input.trim()
  return query.length >= 2 ? { kind: 'text', query } : { kind: 'empty' }
}

/** Lower-cased and without accents, so "hor" finds "HÖR Berlin". */
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The stored sets whose title, DJ or channel holds the text, as the library lists them, at most `limit`. */
export function matchingSets(
  sets: readonly YtSetSummary[],
  query: string,
  limit = YOUR_SETS_MAX,
): YtSetSummary[] {
  const needle = folded(query.trim())
  if (!needle) return []
  return sets
    .filter((set) =>
      [set.title, set.channel ?? '', extractDjName(set.title, set.channel)].some((field) =>
        folded(field).includes(needle),
      ),
    )
    .slice(0, limit)
}

/** A set card's line: "Cercle · 41 tracks", or "no tracklist yet". */
export function setCardLine(set: Pick<YtSetSummary, 'channel' | 'track_count'>): string {
  const tracks = set.track_count ?? 0
  const count = tracks > 0 ? `${tracks.toLocaleString('en-US')} ${tracks === 1 ? 'track' : 'tracks'}` : 'no tracklist yet'
  return set.channel ? `${set.channel} · ${count}` : count
}
```

- [ ] **Step 3:** `npx vitest run src/lib/sets/box.test.ts`: PASS, 6. Commit:

```bash
git add src/lib/sets/box.ts src/lib/sets/box.test.ts
git commit -m "feat(sets): what the box offers for a link or a name, and the stored sets a name finds"
```

---

### Task 2: The box and its dropdown

**Files:** Create `src/components/sets/SetsBox.tsx`, `src/components/sets/SetsHome.css`.

- [ ] **Step 1: The box**

Create `src/components/sets/SetsBox.tsx`:

```tsx
// src/components/sets/SetsBox.tsx
// Sets' one box (Sets redesign spec, Sets home): "Paste a set link, or type a
// DJ's name", the quota under it, and a dropdown under it that offers what
// fits what is typed — a link opens its set; text finds the stored sets and
// the tracks in them as you type, free, and ends with the one row that
// spends quota, a YouTube search (101 units). ↑ / ↓ move, Enter opens, Esc
// closes the dropdown, then clears the box. The dropdown stays inside the
// main area, so it never reaches the set video in the bar.
import { useEffect, useId, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import { TRACK_HITS_MAX, boxOffer, matchingSets } from '../../lib/sets/box'
import type { YouTubeQuotaStatus, YtSetSummary, YtTrackHit } from '../../types/youtube'
import './SetsHome.css'

interface SetsBoxProps {
  value: string
  onChange: (value: string) => void
  /** The library: what is stored, and what the text is matched against. */
  sets: YtSetSummary[]
  quota: YouTubeQuotaStatus | null
  /** A set being fetched or YouTube being searched. */
  busy: boolean
  error: string | null
  autoFocus?: boolean
  /** A stored set, or a link: opens the set's page (fetching it first if it is not stored). */
  onOpenSet: (videoId: string, title: string | null) => void
  /** A track in a stored set: its set, playing from there. */
  onOpenHit: (hit: YtTrackHit) => void
  /** The one that spends: 101 units. */
  onSearchYouTube: (query: string) => void
  /** Esc on a closed dropdown: the box is cleared and YouTube's results go. */
  onClear: () => void
}

type Row =
  | { kind: 'link'; videoId: string; stored: boolean }
  | { kind: 'set'; set: YtSetSummary }
  | { kind: 'hit'; hit: YtTrackHit }
  | { kind: 'youtube'; query: string }

export function SetsBox({
  value,
  onChange,
  sets,
  quota,
  busy,
  error,
  autoFocus,
  onOpenSet,
  onOpenHit,
  onSearchYouTube,
  onClear,
}: SetsBoxProps) {
  const listId = useId()
  const [open, setOpen] = useState(Boolean(autoFocus))
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<{ query: string; rows: YtTrackHit[] }>({ query: '', rows: [] })

  const storedIds = useMemo(() => new Set(sets.map((s) => s.video_id)), [sets])
  const offer = boxOffer(value, storedIds)
  const query = offer.kind === 'text' ? offer.query : ''

  // The tracks in the stored sets: never the network, so as you type; a short
  // wait only spares the database.
  useEffect(() => {
    if (!query) return
    let live = true
    const timer = setTimeout(() => {
      tauriApi
        .searchYouTubeTracks(query)
        .then((rows) => {
          if (live) setHits({ query, rows: rows.slice(0, TRACK_HITS_MAX) })
        })
        .catch(() => {})
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  const yourSets = query ? matchingSets(sets, query) : []
  const trackHits = query && hits.query === query ? hits.rows : []
  const rows: Row[] =
    offer.kind === 'link'
      ? [offer]
      : offer.kind === 'text'
        ? [
            ...yourSets.map((set): Row => ({ kind: 'set', set })),
            ...trackHits.map((hit): Row => ({ kind: 'hit', hit })),
            { kind: 'youtube', query },
          ]
        : []
  const showing = open && rows.length > 0
  const current = Math.min(active, rows.length - 1)

  const choose = (row: Row) => {
    setOpen(false)
    if (row.kind === 'link') onOpenSet(row.videoId, null)
    else if (row.kind === 'set') onOpenSet(row.set.video_id, row.set.title)
    else if (row.kind === 'hit') onOpenHit(row.hit)
    else onSearchYouTube(row.query)
  }

  const optionId = (i: number) => `${listId}-${i}`
  const firstHit = yourSets.length

  return (
    <div className="sets-box">
      <div className="sets-box__field">
        <Icon name="Search" size={16} className="sets-box__icon" />
        <input
          className="sets-box__input"
          placeholder="Paste a set link, or type a DJ's name"
          value={value}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing ? optionId(current) : undefined}
          onChange={(e) => {
            onChange(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && rows.length > 0) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (Math.min(i, rows.length - 1) + 1) % rows.length)
            } else if (e.key === 'ArrowUp' && rows.length > 0) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length)
            } else if (e.key === 'Enter' && rows.length > 0 && !busy) {
              e.preventDefault()
              choose(rows[current])
            } else if (e.key === 'Escape') {
              if (showing) setOpen(false)
              else onClear()
            }
          }}
        />
        {busy && <span className="sets-box__busy">Reading…</span>}
      </div>

      {showing && (
        <div className="sets-box__menu" id={listId} role="listbox" aria-label="Open">
          {rows.map((row, i) => (
            <div key={i}>
              {row.kind === 'set' && i === 0 && <div className="sets-box__group">Your sets</div>}
              {row.kind === 'hit' && i === firstHit && (
                <div className="sets-box__group">Tracks in your sets</div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                className={`sets-box__row${i === current ? ' sets-box__row--active' : ''}${
                  row.kind === 'youtube' ? ' sets-box__row--youtube' : ''
                }`}
                // Chosen on press, before the box's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(row)
                }}
                onMouseEnter={() => setActive(i)}
              >
                {row.kind === 'link' && (
                  <>
                    <Icon name="Play" size={14} />
                    <span className="sets-box__text">
                      {row.stored ? 'In your library' : 'Open this set'}
                    </span>
                    <span className="sets-box__cost">{row.stored ? 'free' : '5–7 units'}</span>
                  </>
                )}
                {row.kind === 'set' && (
                  <>
                    <Icon name="Disc3" size={14} />
                    <span className="sets-box__text">
                      <span className="sets-box__title">{row.set.title}</span>
                      {row.set.channel && <span className="sets-box__meta">{row.set.channel}</span>}
                    </span>
                  </>
                )}
                {row.kind === 'hit' && (
                  <>
                    <span className="sets-box__cue">{row.hit.cue}</span>
                    <span className="sets-box__text">
                      <span className="sets-box__title">
                        {row.hit.artist ? `${row.hit.artist} — ${row.hit.title}` : row.hit.title}
                      </span>
                      {row.hit.set_title && <span className="sets-box__meta">{row.hit.set_title}</span>}
                    </span>
                  </>
                )}
                {row.kind === 'youtube' && (
                  <>
                    <Icon name="Search" size={14} />
                    <span className="sets-box__text">Search YouTube for sets by &ldquo;{row.query}&rdquo;</span>
                    <span className="sets-box__cost">101 units</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {quota && (
        <p className="sets-box__quota">
          {quota.remaining.toLocaleString('en-US')} units left today · a set costs 5–7 · reopening one
          costs nothing
        </p>
      )}
      {error && <div className="sets-error">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: The library home's styles** (the box, the tabs, the cards, the new finds)

Create `src/components/sets/SetsHome.css`:

```css
/* src/components/sets/SetsHome.css */
/* Sets' library home, after the approved mockup (2026-10-04-sets-redesign-mockup.html, 1). */

/* ---- The box and its dropdown ---- */

.sets-box {
  position: relative;
}

.sets-box__field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.sets-box__field:focus-within {
  border-color: var(--accent);
}

.sets-box__icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.sets-box__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 13.5px;
}

.sets-box__busy {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11px;
}

.sets-box__quota {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.sets-box__menu {
  position: absolute;
  top: 44px;
  right: 0;
  left: 0;
  z-index: 20;
  max-height: min(480px, 60vh);
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.sets-box__group {
  padding: 8px 8px 4px;
  color: var(--text-muted);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sets-box__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}

.sets-box__row--active {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 10%);
  color: var(--text-primary);
}

.sets-box__row--youtube {
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.sets-box__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sets-box__title,
.sets-box__meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sets-box__title {
  color: var(--text-primary);
}

.sets-box__meta,
.sets-box__cost,
.sets-box__cue {
  color: var(--text-muted);
  font-size: 11px;
}

.sets-box__cue {
  flex: 0 0 44px;
  font-variant-numeric: tabular-nums;
}

.sets-box__cost {
  flex-shrink: 0;
}

/* ---- Tabs and the grouping ---- */

.sets-home__tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 16px 0;
}

.sets-home__tab,
.sets-home__group-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.sets-home__tab:hover,
.sets-home__group-btn:hover {
  color: var(--text-primary);
}

.sets-home__tab[aria-pressed='true'] {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
}

.sets-home__group-btn[aria-pressed='true'] {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 14%);
  color: var(--text-primary);
}

.sets-home__tab:focus-visible,
.sets-home__group-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sets-home__badge {
  padding: 0 5px;
  border-radius: 4px;
  background: color-mix(in srgb, #fb923c 85%, var(--text-primary));
  color: #000;
  font-size: 10.5px;
  font-weight: 700;
}

.sets-home__spacer {
  flex: 1;
}

/* ---- Sections ---- */

.sets-home__section {
  margin-bottom: 24px;
}

.sets-home__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 10px;
}

.sets-home__heading {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sets-home__count {
  color: var(--text-muted);
  font-size: 12px;
}

.sets-home__empty {
  color: var(--text-muted);
  font-size: 13px;
}

.sets-home__dj {
  margin-bottom: 18px;
}

.sets-home__dj-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.sets-home__dj-name {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
}

button.sets-home__dj-name {
  cursor: pointer;
}

button.sets-home__dj-name:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

button.sets-home__dj-name:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---- Set cards: 4 to a row, 3 below 1100px ---- */

.set-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1100px) {
  .set-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.set-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.set-card__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  background: #222 center / cover no-repeat;
}

.set-card:hover .set-card__thumb {
  filter: brightness(1.1);
}

.set-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.set-card__length {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.set-card__title {
  display: -webkit-box;
  margin-top: 7px;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.set-card__line {
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ---- New from DJs you watch ---- */

.new-finds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.new-find {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.new-find:hover {
  background: var(--bg-tertiary);
}

.new-find:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.new-find__thumb {
  flex: 0 0 96px;
  aspect-ratio: 16 / 9;
  border-radius: 5px;
  background: #222 center / cover no-repeat;
}

.new-find__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.new-find__dj {
  color: color-mix(in srgb, #fb923c 85%, var(--text-primary));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.new-find__title {
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.new-find__cost {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 10.5px;
}

/* ---- YouTube's results, in place of the library ---- */

.sets-home__found-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 8px;
  color: var(--text-muted);
  font-size: 12px;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors (nothing uses it until Task 4). Commit:

```bash
git add src/components/sets/SetsBox.tsx src/components/sets/SetsHome.css
git commit -m "feat(sets): one box with a dropdown — a link, your sets, tracks in them, then YouTube"
```

---

### Task 3: The Library tab

**Files:** Create `src/components/sets/SetsLibrary.tsx`.

- [ ] **Step 1:**

Create `src/components/sets/SetsLibrary.tsx`:

```tsx
// src/components/sets/SetsLibrary.tsx
// The Library tab (Sets redesign spec, Sets home): the sets watched DJs'
// searches found that you have not seen, as cards with Mark all seen; then
// your sets as cards — newest first in one grid, or under each DJ, the DJs
// with the most sets first, each name opening the DJ's page.
import { msToCue } from '../../lib/tracklist'
import { groupByDj } from '../../lib/tracklist/djName'
import { setCardLine } from '../../lib/sets/box'
import { thumbnailUrl } from '../../lib/sets/setPage'
import type { NewDjFind } from '../../types/home'
import type { YtSetSummary } from '../../types/youtube'
import './SetsHome.css'

interface SetsLibraryProps {
  sets: YtSetSummary[]
  /** Unseen finds, newest first. */
  newFinds: NewDjFind[]
  grouping: 'dj' | 'recent'
  onOpenSet: (videoId: string, title: string) => void
  onOpenDj?: (name: string) => void
  onMarkAllSeen: () => void
}

function SetCard({ set, onOpen }: { set: YtSetSummary; onOpen: () => void }) {
  return (
    <button type="button" className="set-card" onClick={onOpen}>
      <span className="set-card__thumb" style={{ backgroundImage: `url(${thumbnailUrl(set.video_id, 'mqdefault')})` }}>
        {set.duration_ms ? <span className="set-card__length">{msToCue(set.duration_ms)}</span> : null}
      </span>
      <span className="set-card__title" title={set.title}>
        {set.title}
      </span>
      <span className="set-card__line">{setCardLine(set)}</span>
    </button>
  )
}

export function SetsLibrary({ sets, newFinds, grouping, onOpenSet, onOpenDj, onMarkAllSeen }: SetsLibraryProps) {
  const grid = (list: YtSetSummary[]) => (
    <div className="set-cards">
      {list.map((set) => (
        <SetCard key={set.video_id} set={set} onOpen={() => onOpenSet(set.video_id, set.title)} />
      ))}
    </div>
  )

  return (
    <>
      {newFinds.length > 0 && (
        <section className="sets-home__section">
          <div className="sets-home__head">
            <h2 className="sets-home__heading">New from DJs you watch</h2>
            <button type="button" className="link-btn" onClick={onMarkAllSeen}>
              Mark all seen
            </button>
          </div>
          <div className="new-finds">
            {newFinds.map((find) => (
              <button
                key={find.videoId}
                type="button"
                className="new-find"
                onClick={() => onOpenSet(find.videoId, find.title)}
              >
                <span
                  className="new-find__thumb"
                  style={{ backgroundImage: `url(${thumbnailUrl(find.videoId, 'mqdefault')})` }}
                />
                <span className="new-find__text">
                  <span className="new-find__dj">{find.displayName}</span>
                  <span className="new-find__title" title={find.title}>
                    {find.title}
                  </span>
                  <span className="new-find__cost">{find.saved ? 'saved' : 'opening costs 5–7'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="sets-home__section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">Your sets</h2>
          {sets.length > 0 && <span className="sets-home__count">{sets.length.toLocaleString('en-US')}</span>}
        </div>
        {sets.length === 0 ? (
          <p className="sets-home__empty">Nothing here yet — paste a set link or type a DJ&apos;s name above.</p>
        ) : grouping === 'recent' ? (
          grid(sets)
        ) : (
          groupByDj(sets).map((group) => (
            <div className="sets-home__dj" key={group.dj}>
              <div className="sets-home__dj-head">
                {onOpenDj ? (
                  <button type="button" className="sets-home__dj-name" onClick={() => onOpenDj(group.dj)}>
                    {group.dj}
                  </button>
                ) : (
                  <span className="sets-home__dj-name">{group.dj}</span>
                )}
                <span className="sets-home__count">
                  {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                </span>
              </div>
              {grid(group.sets)}
            </div>
          ))
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/sets/SetsLibrary.tsx
git commit -m "feat(sets): the Library tab — new finds from the DJs you watch and your sets as cards"
```

---

### Task 4: The library home

**Files:** Modify `src/components/views/SetsView.tsx`.

- [ ] **Step 1:** The box at the top; YouTube's results in place of the page; the tabs as buttons with By DJ / Newest; the Library tab as cards; the new finds read with the library, and Mark all seen with Undo. The old Process button, the library's search input and its list rows go.

In `src/components/views/SetsView.tsx`, replace

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
```

with

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Icon } from '../Icon'
import { SetPage, type SetOpening } from '../sets/SetPage'
import { StoreLinks } from '../sets/StoreLinks'
import { SetsBox } from '../sets/SetsBox'
import { SetsLibrary } from '../sets/SetsLibrary'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { looksLikeAChannel } from '../../lib/channelInput'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView, type SetsTab } from '../../store/setsViewStore'
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  ChannelUpload,
  TrackEcho,
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
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return true
  return /(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)[A-Za-z0-9_-]{11}/.test(text)
}

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

interface SetsViewProps {
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
```

with

```tsx
  ChannelUpload,
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
import type { NewDjFind } from '../../types/home'
import './SetsView.css'

/** The new finds the library shows, newest first. */
const NEW_FINDS_MAX = 20

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

interface SetsViewProps {
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  const [channelInput, setChannelInput] = useState('')
  /**
   * Where else this set's records turn up, by row.
```

with

```tsx
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TracklistResult | null>(null)
  const [currentSet, setCurrentSet] = useState<RawSet | null>(null)
  const [quota, setQuota] = useState<YouTubeQuotaStatus | null>(null)
  const [sets, setSets] = useState<YtSetSummary[]>([])
  const [saved, setSaved] = useState<SavedTrack[]>([])
  /** Unseen finds of watched DJs' searches (Home's New sets), and how many in all. */
  const [newFinds, setNewFinds] = useState<{ finds: NewDjFind[]; total: number }>({
    finds: [],
    total: 0,
  })
  const [stats, setStats] = useState<YtStats | null>(null)
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  const [channelInput, setChannelInput] = useState('')
  /**
   * Where else this set's records turn up, by row.
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
    tauriApi.listYouTubeSets().then(setSets).catch(() => {})
    tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
    tauriApi.listYouTubeChannels().then(setChannels).catch(() => {})
    tauriApi.listYouTubeDjs().then(setDjs).catch(() => {})
  }, [])

  useEffect(() => {
```

with

```tsx
  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
    tauriApi.listYouTubeSets().then(setSets).catch(() => {})
    tauriApi.getNewDjFinds(NEW_FINDS_MAX).then(setNewFinds).catch(() => {})
    tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
    tauriApi.listYouTubeChannels().then(setChannels).catch(() => {})
    tauriApi.listYouTubeDjs().then(setDjs).catch(() => {})
  }, [])

  useEffect(() => {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refreshLibrary, refreshQuota])

  // Searching the stored sets never touches the network, so it can run as the
  // user types; a short debounce is only to spare the database.
  useEffect(() => {
    if (search.trim().length < 2) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      tauriApi.searchYouTubeTracks(search).then(setHits).catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (tab !== 'stats') return
    tauriApi.youtubeStats().then(setStats).catch(() => {})
  }, [tab, sets.length])

  // The library is already fully in memory, so this is a loop, not a query.
```

with

```tsx
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refreshLibrary, refreshQuota])

  useEffect(() => {
    if (tab !== 'stats') return
    tauriApi.youtubeStats().then(setStats).catch(() => {})
  }, [tab, sets.length])

  // The library is already fully in memory, so this is a loop, not a query.
```

In `src/components/views/SetsView.tsx`, replace

```tsx
    setOpening(null)
    setFocusCue(null)
    setView('set')
    return parsed
  }

  async function handleProcess() {
    if (!input.trim() || loading) return

    if (!looksLikeLink(input)) {
      await handleSearchSets()
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
      setResult(null)
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Finds a DJ's sets by name. The expensive call, hence the confirmation. */
  async function handleSearchSets() {
    const quotaLeft = quota?.remaining ?? 0
    // 100 for the search, and 1 more for the descriptions of everything it
    // returns — which is what lets the results say whether they hold a list.
    if (quotaLeft < 101) {
      setError(
        `Searching by name costs 101 units and only ${quotaLeft.toLocaleString()} are left today.`,
```

with

```tsx
    setOpening(null)
    setFocusCue(null)
    setView('set')
    return parsed
  }

  async function handleSearchSets(query: string) {
    const quotaLeft = quota?.remaining ?? 0
    // 100 for the search, and 1 more for the descriptions of everything it
    // returns — which is what lets the results say whether they hold a list.
    if (quotaLeft < 101) {
      setError(
        `Searching by name costs 101 units and only ${quotaLeft.toLocaleString()} are left today.`,
```

In `src/components/views/SetsView.tsx`, replace

```tsx
      return
    }

    setLoading(true)
    setError(null)
    try {
      setFound(await tauriApi.searchYouTubeSets(input.trim()))
    } catch (err) {
      setError(getErrorMessage(err))
      setFound(null)
    } finally {
      setLoading(false)
      refreshQuota()
```

with

```tsx
      return
    }

    setLoading(true)
    setError(null)
    try {
      setFound(await tauriApi.searchYouTubeSets(query))
    } catch (err) {
      setError(getErrorMessage(err))
      setFound(null)
    } finally {
      setLoading(false)
      refreshQuota()
```

In `src/components/views/SetsView.tsx`, replace

```tsx
      const bpm = match.track.bpm
      if (typeof bpm === 'number' && bpm > 0) byIndex.set(index, bpm)
    }
    return byIndex
  }, [matches])

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
```

with

```tsx
      const bpm = match.track.bpm
      if (typeof bpm === 'number' && bpm > 0) byIndex.set(index, bpm)
    }
    return byIndex
  }, [matches])

  /** How many unseen sets the last check turned up (Following's summary). */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0
  /** Following's badge: the channels' news only — DJs' finds show in the Library. */
  const channelNews =
    news?.filter((item) => item.source !== 'dj').reduce((total, item) => total + item.new_sets.length, 0) ?? 0

  /**
   * Mark all seen on the library's new finds, as on Home: its Undo marks
   * exactly the rows it changed unseen again.
   */
  async function markAllFindsSeen() {
    try {
      const rows = await tauriApi.markAllDjFindsSeen()
      refreshLibrary()
      const count = new Set(rows.map((row) => row.videoId)).size
      if (count === 0) return
      toast(`${count.toLocaleString('en-US')} ${count === 1 ? 'set' : 'sets'} marked seen`, {
        action: {
          label: 'Undo',
          run: () => {
            tauriApi
              .markDjFindsUnseen(rows)
              .then(refreshLibrary)
              .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
          },
        },
      })
    } catch (err) {
      toast(`Couldn't mark the sets seen: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  /** The box cleared: YouTube's results go and the library is back. */
  function clearBox() {
    setInput('')
    setFound(null)
    setError(null)
  }

  if (view === 'set') {
    const shownId = opening?.videoId ?? currentSet?.video.id ?? null
    const summary = shownId ? sets.find((s) => s.video_id === shownId) : undefined
    return (
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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

              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="Where did I hear this? — search every stored set"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {search.trim().length >= 2 && (
                <>
                  <p className="sets-summary">
                    {hits.length === 0
                      ? 'Nothing found in the stored sets.'
                      : `${hits.length} ${hits.length === 1 ? 'hit' : 'hits'}`}
                  </p>
                  {hits.map((hit) => (
                    <button
                      type="button"
                      className="sets-hit"
                      key={`${hit.video_id}-${hit.cue_ms}-${hit.title}`}
                      onClick={() => openHit(hit)}
                    >
                      <span className="sets-track__cue">{hit.cue}</span>
                      <span className="sets-track__name">
                        {hit.artist && <span className="sets-track__artist">{hit.artist} — </span>}
                        {hit.title}
                        <span className="sets-track__extra">{hit.set_title}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {sets.length === 0 && <p className="sets-empty">Nothing processed yet.</p>}

              {sets.length > 0 && (
                <div className="sets-filter">
                  <button
                    type="button"
                    className={`sets-filter__btn ${grouping === 'dj' ? 'sets-filter__btn--active' : ''}`}
                    onClick={() => setGrouping('dj')}
                  >
                    By DJ ({byDj.length})
                  </button>
                  <button
                    type="button"
                    className={`sets-filter__btn ${grouping === 'recent' ? 'sets-filter__btn--active' : ''}`}
                    onClick={() => setGrouping('recent')}
                  >
                    Newest first
                  </button>
                </div>
              )}

              {grouping === 'recent' && sets.map((s) => <StoredSet key={s.video_id} set={s} />)}

              {grouping === 'dj' &&
                byDj.map((group) => (
                  <div className="sets-dj" key={group.dj}>
                    <h3 className="sets-dj__name">
                      <span className="sets-dj__who">{group.dj}</span>
                      <span className="sets-dj__count">
                        {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                      </span>
                    </h3>
                    {/* Bracketed on the left as well as headed, because a title
                        and a heading at the same size read as one list. */}
                    <div className="sets-dj__sets">
                      {group.sets.map((s) => (
                        <StoredSet key={s.video_id} set={s} />
                      ))}
                    </div>
                  </div>
                ))}
            </>
          )}

          {tab === 'channels' && (
            <>
              <p className="sets-view__subtitle">
                Following a channel is the cheap way to keep up — a check costs a unit or two,
                where searching by name costs a hundred.
              </p>

              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="@cercle, a channel link, or a link to one of its videos"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addChannel()
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={addChannel}
                  disabled={loading || !channelInput.trim()}
                >
                  Follow
                </button>
              </div>
              <p className="sets-quota">
                A handle or a link resolves for 2 units. A bare name has to be searched for, which
                costs 100 — paste a link where you can.
              </p>
              <p className="sets-quota">
                Set a channel to Daily or Weekly and the app checks it on its own, telling you when
                a set turns up. A check is a unit or two, so ten channels daily is about twenty
                units of the ten thousand a day. New channels start at Never.
              </p>

              {bareName && (
                <div className="sets-notice">
                  <span>
                    “{bareName}” looks like a name, not a channel. Following it would search for a
                    channel — <strong>100 units</strong> — and find their own channel, where
                    releases live rather than the sets they play.
                  </span>
                  <div className="sets-notice__actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setDjInput(bareName)
                        setChannelInput('')
                        setBareName(null)
                      }}
                    >
                      Watch {bareName} as a DJ
                    </button>
                    <button
                      type="button"
                      className="sets-filter__btn"
                      onClick={() => {
                        setBareName(null)
                        setLoading(true)
                        setError(null)
                        void tauriApi
                          .resolveYouTubeChannel(channelInput.trim())
                          .then((channel) => tauriApi.followYouTubeChannel(channel))
                          .then(() => {
                            setChannelInput('')
                            refreshLibrary()
                          })
                          .catch((err) => setError(getErrorMessage(err)))
                          .finally(() => {
                            setLoading(false)
                            refreshQuota()
                          })
                      }}
                    >
                      Search for a channel anyway · 100 units
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="sets-error">{error}</div>}

              {channels.length > 0 && (
                <div className="sets-filter">
                  <button
                    type="button"
                    className="sets-filter__btn"
                    onClick={checkChannels}
                    disabled={loading}
                  >
                    {loading ? 'Checking...' : 'Check for new sets'}
                  </button>
                </div>
              )}

              {channels.length === 0 && <p className="sets-empty">Not following anyone yet.</p>}

              {channels.map((channel) => (
                <div className="sets-stored" key={channel.channel_id}>
                  <button
                    type="button"
                    className="sets-stored__main"
                    onClick={() => showUploads(channel)}
                    disabled={busy === channel.channel_id}
                  >
                    <span className="sets-stored__title">{channel.title ?? channel.channel_id}</span>
                    <span className="sets-stored__meta">
                      {channel.handle ? `@${channel.handle} · ` : ''}
                      {busy === channel.channel_id
                        ? 'reading uploads...'
                        : channel.last_checked
                          ? `checked ${channel.last_checked.slice(0, 10)}`
                          : 'show recent sets'}
                    </span>
                  </button>
                  <select
                    className="sets-interval"
                    value={channel.check_interval_hours}
                    onChange={(e) => setCheckInterval(channel.channel_id, Number(e.target.value))}
                    title="How often the app checks this channel on its own"
                  >
                    {CHECK_INTERVALS.map((option) => (
                      <option key={option.hours} value={option.hours}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sets-stored__remove"
                    onClick={async () => {
                      await tauriApi.unfollowYouTubeChannel(channel.channel_id).catch(() => {})
                      refreshLibrary()
                    }}
                    title="Stop following"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ))}

              <div className="sets-djs">
                <h3 className="sets-loose__title">Watch a DJ</h3>
                <p className="sets-view__subtitle">
                  A DJ is not a channel. Their sets land on Cercle, Boiler Room and Mixmag, so
                  the only way to catch one on a channel you do not follow is to search by name —
                  and a search is 100 units, a hundred times a channel check. Weekly is usually
                  the honest setting. New names start at Never.
                </p>

                <div className="sets-form">
                  <input
                    className="sets-form__input"
                    placeholder="Solomun, Hot Since 82, Priku..."
                    value={djInput}
                    onChange={(e) => setDjInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addDj()
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={addDj}
                    disabled={djInput.trim().length < 2}
                  >
                    Watch
                  </button>
                </div>

                {djs.length > 0 && (
                  <div className="sets-filter">
                    <button
                      type="button"
                      className="sets-filter__btn"
                      onClick={checkDjs}
                      disabled={loading}
                    >
                      {loading
                        ? 'Searching...'
                        : `Search now · ${(djs.length * 100).toLocaleString()} units`}
                    </button>
                  </div>
                )}

                {djs.length === 0 && <p className="sets-empty">No DJs watched yet.</p>}

                {djs.map((dj) => (
                  <div className="sets-stored" key={dj.name_key}>
                    <button
                      type="button"
                      className="sets-stored__main"
                      onClick={() => showDjFinds(dj)}
                    >
                      <span className="sets-stored__title">{dj.display_name}</span>
                      <span className="sets-stored__meta">
                        {dj.check_interval_hours === 0
                          ? 'not searched for on its own'
                          : `100 units a search${
                              dj.auto_import ? ' · new sets fetched automatically' : ''
                            }${dj.last_checked ? ` · last ${dj.last_checked.slice(0, 10)}` : ''}`}
                      </span>
                    </button>
                    <label
                      className="sets-autoimport"
                      title="Fetch and store new sets without asking — another 5-7 units each, at most five at a time"
                    >
                      <input
                        type="checkbox"
                        checked={dj.auto_import}
                        onChange={(e) => setDjAutoImport(dj.name_key, e.target.checked)}
                      />
                      get them
                    </label>
                    <select
                      className="sets-interval"
                      value={dj.check_interval_hours}
                      onChange={(e) => setDjInterval(dj.name_key, Number(e.target.value))}
                      title="How often the app searches for this DJ on its own — 100 units a time"
                    >
                      {CHECK_INTERVALS.map((option) => (
                        <option key={option.hours} value={option.hours}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="sets-stored__remove"
                      onClick={async () => {
                        await tauriApi.unwatchYouTubeDj(dj.name_key).catch(() => {})
                        refreshLibrary()
                      }}
                      title="Stop watching"
                    >
                      <Icon name="X" size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {news && (
                <div className="sets-loose">
                  <h3 className="sets-loose__title">
                    {newCount === 0 ? 'Nothing new' : `${newCount} new ${newCount === 1 ? 'set' : 'sets'}`}
                  </h3>
                  {news.map((item) => (
                    <div key={item.channel_id}>
                      <p className="sets-loose__hint">
                        {item.title}
                        {item.source === 'dj' ? ' · found by name' : ''}
                      </p>
                      {item.new_sets.map((set) => (
                        <button
                          type="button"
                          className="sets-hit"
                          key={set.video_id}
                          onClick={() =>
                            importUpload(
                              set.video_id,
                              item.source === 'channel' ? item.channel_id : undefined,
                            )
                          }
                          disabled={busy === set.video_id}
                        >
                          <span className="sets-track__name">
                            {set.title}
                            <span className="sets-track__extra">
                              {set.published_at.slice(0, 10)}
                              {set.duration_ms
                                ? ` · ${Math.round(set.duration_ms / 60000)} min`
                                : ''}
                            </span>
                          </span>
                          <span className="sets-track__votes">
                            {busy === set.video_id ? 'reading...' : 'get it'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {uploads && (
                <div className="sets-loose">
                  <h3 className="sets-loose__title">{uploads.channel.title}</h3>
                  <p className="sets-loose__hint">
                    {uploads.channel.channel_id.startsWith('dj:')
                      ? 'Everything the searches have turned up. Reading this costs nothing.'
                      : 'Long uploads only — promo clips under twenty minutes are not sets.'}
                  </p>
                  {uploads.items.length === 0 && (
                    <p className="sets-empty">
                      {uploads.emptyNote ?? 'No long uploads found.'}
                    </p>
                  )}
                  {uploads.items.map((item) => (
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
                      }
                      disabled={busy === item.video_id}
                    >
                      <span className="sets-track__name">
                        {item.title}
                        <span className="sets-track__extra">
                          {item.published_at.slice(0, 10)}
                          {item.duration_ms ? ` · ${Math.round(item.duration_ms / 60000)} min` : ''}
                        </span>
                      </span>
                      <span className="sets-track__votes">
                        {busy === item.video_id
                          ? 'reading...'
                          : item.already_stored
                            ? 'in library'
                            : 'get it'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'stats' && (
            <>
              {!stats && <p className="sets-empty">Nothing processed yet.</p>}
              {stats && (
                <>
                  <p className="sets-summary">
                    {stats.sets} {stats.sets === 1 ? 'set' : 'sets'} · {stats.tracks} named tracks ·{' '}
                    {stats.unknowns} still unidentified
                  </p>

                  <div className="sets-stats">
                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Most played</h3>
                      {stats.top_artists.length === 0 && <p className="sets-empty">—</p>}
                      {stats.top_artists.map(([artist, count]) => (
                        <div className="sets-track" key={artist}>
                          <span className="sets-track__name">{artist}</span>
                          <span className="sets-track__votes">{count}</span>
                        </div>
                      ))}
                    </div>

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Doing the rounds</h3>
                      <p className="sets-loose__hint">Records that turn up in more than one set.</p>
                      {stats.shared_tracks.length === 0 && <p className="sets-empty">—</p>}
                      {stats.shared_tracks.map(([title, artist, count]) => (
                        <div className="sets-track" key={`${artist}-${title}`}>
                          <span className="sets-track__name">
                            {artist && <span className="sets-track__artist">{artist} — </span>}
                            {title}
                          </span>
                          <span className="sets-track__votes">{count} sets</span>
                        </div>
                      ))}
                    </div>

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Most gaps</h3>
                      <p className="sets-loose__hint">
                        Where digging through the comments would pay off most.
                      </p>
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

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Quota</h3>
                      <p className="sets-loose__hint">
                        {stats.quota.spent.toLocaleString()} of{' '}
                        {stats.quota.daily_limit.toLocaleString()} units spent today ·{' '}
                        {stats.quota.remaining.toLocaleString()} left · resets in{' '}
                        {Math.floor(stats.quota.seconds_until_reset / 3600)}h{' '}
                        {Math.floor((stats.quota.seconds_until_reset % 3600) / 60)}m
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'saved' && (
            <>
              <div className="sets-saved__head">
                <p className="sets-view__subtitle">
                  Hearted tracks from every set — the shopping list.
                </p>
                {saved.length > 0 && (
                  <button type="button" className="sets-filter__btn" onClick={copySavedList}>
                    Copy list
                  </button>
                )}
              </div>
              {saved.length === 0 && <p className="sets-empty">Nothing saved yet.</p>}
              {saved.map((t) => (
                <div className="sets-track" key={t.id ?? trackKey(t)}>
                  <span className="sets-track__cue">{t.cue}</span>
                  <span className="sets-track__name">
                    {t.artist && <span className="sets-track__artist">{t.artist} — </span>}
                    {t.title}
                    {t.mix && <span className="sets-track__artist"> ({t.mix})</span>}
                    <span className="sets-track__extra">
                      {t.set_title}
                      <StoreLinks artist={t.artist} title={t.title} mix={t.mix} />
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sets-track__heart sets-track__heart--on"
                    onClick={async () => {
                      await tauriApi
                        .deleteSavedYouTubeTrack(t.video_id, t.cue_ms, t.title)
                        .catch(() => {})
                      refreshLibrary()
                    }}
                    title="Remove from Saved"
                  >
                    <Icon name="Heart" size={13} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
```

with

```tsx
      <div
        className="sets-view__scroll"
        ref={libraryScroll}
        onScroll={(e) => useSetsView.getState().setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="sets-view__container">
          <SetsBox
            value={input}
            onChange={(value) => {
              setInput(value)
              // Clearing the box returns to the library.
              if (!value.trim()) setFound(null)
            }}
            sets={sets}
            quota={quota}
            busy={loading}
            error={error}
            autoFocus={Boolean(initialQuery)}
            onOpenSet={(videoId, title) => {
              clearBox()
              void openSet(videoId, { title })
            }}
            onOpenHit={openHit}
            onSearchYouTube={(query) => void handleSearchSets(query)}
            onClear={clearBox}
          />

          {/* YouTube's results replace the page below the box, until it is
              cleared (Esc, or emptied). */}
          {found ? (
            <>
              <div className="sets-home__found-head">
                <span>
                  {found.length === 0
                    ? 'No long videos found for that name.'
                    : `${found.length} sets found on YouTube — opening one costs 5–7 units`}
                </span>
                <button type="button" className="link-btn" onClick={clearBox}>
                  Back to your library
                </button>
              </div>
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
                  // A set already in the library opens at no cost.
                  onClick={() =>
                    stored ? void openSet(hit.videoId, { title: hit.title }) : processFound(hit)
                  }
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
                      {stored ? 'in your library' : describePreview(preview)}
                    </span>
                  </span>
                </button>
              )
            })}
            </>
          ) : (
            <>
              <div className="sets-home__tabs">
                {(['library', 'saved', 'channels', 'stats'] as const).map((t: SetsTab) => (
                  <button
                    key={t}
                    type="button"
                    className="sets-home__tab"
                    aria-pressed={tab === t}
                    onClick={() => {
                      setTab(t)
                      // Another tab starts at its top.
                      if (libraryScroll.current) libraryScroll.current.scrollTop = 0
                    }}
                  >
                    {t === 'library'
                      ? `Library ${sets.length.toLocaleString('en-US')}${
                          newFinds.total > 0 ? ` · ${newFinds.total} new` : ''
                        }`
                      : t === 'saved'
                        ? `Saved tracks ${saved.length.toLocaleString('en-US')}`
                        : t === 'channels'
                          ? 'Following'
                          : 'Stats'}
                    {t === 'channels' && channelNews > 0 && (
                      <span className="sets-home__badge">{channelNews}</span>
                    )}
                  </button>
                ))}
                {tab === 'library' && sets.length > 0 && (
                  <>
                    <span className="sets-home__spacer" />
                    <button
                      type="button"
                      className="sets-home__group-btn"
                      aria-pressed={grouping === 'dj'}
                      onClick={() => setGrouping('dj')}
                    >
                      By DJ
                    </button>
                    <button
                      type="button"
                      className="sets-home__group-btn"
                      aria-pressed={grouping === 'recent'}
                      onClick={() => setGrouping('recent')}
                    >
                      Newest
                    </button>
                  </>
                )}
              </div>

              {tab === 'library' && (
                <SetsLibrary
                  sets={sets}
                  newFinds={newFinds.finds}
                  grouping={grouping}
                  onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                  onOpenDj={onOpenDj ? (name) => onOpenDj(name, null) : undefined}
                  onMarkAllSeen={() => void markAllFindsSeen()}
                />
              )}

              {tab === 'channels' && (
                <>
                  <p className="sets-view__subtitle">
                    Following a channel is the cheap way to keep up — a check costs a unit or two,
                    where searching by name costs a hundred.
                  </p>

                  <div className="sets-form">
                    <input
                      className="sets-form__input"
                      placeholder="@cercle, a channel link, or a link to one of its videos"
                      value={channelInput}
                      onChange={(e) => setChannelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addChannel()
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={addChannel}
                      disabled={loading || !channelInput.trim()}
                    >
                      Follow
                    </button>
                  </div>
                  <p className="sets-quota">
                    A handle or a link resolves for 2 units. A bare name has to be searched for, which
                    costs 100 — paste a link where you can.
                  </p>
                  <p className="sets-quota">
                    Set a channel to Daily or Weekly and the app checks it on its own, telling you when
                    a set turns up. A check is a unit or two, so ten channels daily is about twenty
                    units of the ten thousand a day. New channels start at Never.
                  </p>

                  {bareName && (
                    <div className="sets-notice">
                      <span>
                        “{bareName}” looks like a name, not a channel. Following it would search for a
                        channel — <strong>100 units</strong> — and find their own channel, where
                        releases live rather than the sets they play.
                      </span>
                      <div className="sets-notice__actions">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => {
                            setDjInput(bareName)
                            setChannelInput('')
                            setBareName(null)
                          }}
                        >
                          Watch {bareName} as a DJ
                        </button>
                        <button
                          type="button"
                          className="sets-filter__btn"
                          onClick={() => {
                            setBareName(null)
                            setLoading(true)
                            setError(null)
                            void tauriApi
                              .resolveYouTubeChannel(channelInput.trim())
                              .then((channel) => tauriApi.followYouTubeChannel(channel))
                              .then(() => {
                                setChannelInput('')
                                refreshLibrary()
                              })
                              .catch((err) => setError(getErrorMessage(err)))
                              .finally(() => {
                                setLoading(false)
                                refreshQuota()
                              })
                          }}
                        >
                          Search for a channel anyway · 100 units
                        </button>
                      </div>
                    </div>
                  )}

                  {error && <div className="sets-error">{error}</div>}

                  {channels.length > 0 && (
                    <div className="sets-filter">
                      <button
                        type="button"
                        className="sets-filter__btn"
                        onClick={checkChannels}
                        disabled={loading}
                      >
                        {loading ? 'Checking...' : 'Check for new sets'}
                      </button>
                    </div>
                  )}

                  {channels.length === 0 && <p className="sets-empty">Not following anyone yet.</p>}

                  {channels.map((channel) => (
                    <div className="sets-stored" key={channel.channel_id}>
                      <button
                        type="button"
                        className="sets-stored__main"
                        onClick={() => showUploads(channel)}
                        disabled={busy === channel.channel_id}
                      >
                        <span className="sets-stored__title">{channel.title ?? channel.channel_id}</span>
                        <span className="sets-stored__meta">
                          {channel.handle ? `@${channel.handle} · ` : ''}
                          {busy === channel.channel_id
                            ? 'reading uploads...'
                            : channel.last_checked
                              ? `checked ${channel.last_checked.slice(0, 10)}`
                              : 'show recent sets'}
                        </span>
                      </button>
                      <select
                        className="sets-interval"
                        value={channel.check_interval_hours}
                        onChange={(e) => setCheckInterval(channel.channel_id, Number(e.target.value))}
                        title="How often the app checks this channel on its own"
                      >
                        {CHECK_INTERVALS.map((option) => (
                          <option key={option.hours} value={option.hours}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="sets-stored__remove"
                        onClick={async () => {
                          await tauriApi.unfollowYouTubeChannel(channel.channel_id).catch(() => {})
                          refreshLibrary()
                        }}
                        title="Stop following"
                      >
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="sets-djs">
                    <h3 className="sets-loose__title">Watch a DJ</h3>
                    <p className="sets-view__subtitle">
                      A DJ is not a channel. Their sets land on Cercle, Boiler Room and Mixmag, so
                      the only way to catch one on a channel you do not follow is to search by name —
                      and a search is 100 units, a hundred times a channel check. Weekly is usually
                      the honest setting. New names start at Never.
                    </p>

                    <div className="sets-form">
                      <input
                        className="sets-form__input"
                        placeholder="Solomun, Hot Since 82, Priku..."
                        value={djInput}
                        onChange={(e) => setDjInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addDj()
                        }}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={addDj}
                        disabled={djInput.trim().length < 2}
                      >
                        Watch
                      </button>
                    </div>

                    {djs.length > 0 && (
                      <div className="sets-filter">
                        <button
                          type="button"
                          className="sets-filter__btn"
                          onClick={checkDjs}
                          disabled={loading}
                        >
                          {loading
                            ? 'Searching...'
                            : `Search now · ${(djs.length * 100).toLocaleString()} units`}
                        </button>
                      </div>
                    )}

                    {djs.length === 0 && <p className="sets-empty">No DJs watched yet.</p>}

                    {djs.map((dj) => (
                      <div className="sets-stored" key={dj.name_key}>
                        <button
                          type="button"
                          className="sets-stored__main"
                          onClick={() => showDjFinds(dj)}
                        >
                          <span className="sets-stored__title">{dj.display_name}</span>
                          <span className="sets-stored__meta">
                            {dj.check_interval_hours === 0
                              ? 'not searched for on its own'
                              : `100 units a search${
                                  dj.auto_import ? ' · new sets fetched automatically' : ''
                                }${dj.last_checked ? ` · last ${dj.last_checked.slice(0, 10)}` : ''}`}
                          </span>
                        </button>
                        <label
                          className="sets-autoimport"
                          title="Fetch and store new sets without asking — another 5-7 units each, at most five at a time"
                        >
                          <input
                            type="checkbox"
                            checked={dj.auto_import}
                            onChange={(e) => setDjAutoImport(dj.name_key, e.target.checked)}
                          />
                          get them
                        </label>
                        <select
                          className="sets-interval"
                          value={dj.check_interval_hours}
                          onChange={(e) => setDjInterval(dj.name_key, Number(e.target.value))}
                          title="How often the app searches for this DJ on its own — 100 units a time"
                        >
                          {CHECK_INTERVALS.map((option) => (
                            <option key={option.hours} value={option.hours}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="sets-stored__remove"
                          onClick={async () => {
                            await tauriApi.unwatchYouTubeDj(dj.name_key).catch(() => {})
                            refreshLibrary()
                          }}
                          title="Stop watching"
                        >
                          <Icon name="X" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {news && (
                    <div className="sets-loose">
                      <h3 className="sets-loose__title">
                        {newCount === 0 ? 'Nothing new' : `${newCount} new ${newCount === 1 ? 'set' : 'sets'}`}
                      </h3>
                      {news.map((item) => (
                        <div key={item.channel_id}>
                          <p className="sets-loose__hint">
                            {item.title}
                            {item.source === 'dj' ? ' · found by name' : ''}
                          </p>
                          {item.new_sets.map((set) => (
                            <button
                              type="button"
                              className="sets-hit"
                              key={set.video_id}
                              onClick={() =>
                                importUpload(
                                  set.video_id,
                                  item.source === 'channel' ? item.channel_id : undefined,
                                )
                              }
                              disabled={busy === set.video_id}
                            >
                              <span className="sets-track__name">
                                {set.title}
                                <span className="sets-track__extra">
                                  {set.published_at.slice(0, 10)}
                                  {set.duration_ms
                                    ? ` · ${Math.round(set.duration_ms / 60000)} min`
                                    : ''}
                                </span>
                              </span>
                              <span className="sets-track__votes">
                                {busy === set.video_id ? 'reading...' : 'get it'}
                              </span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {uploads && (
                    <div className="sets-loose">
                      <h3 className="sets-loose__title">{uploads.channel.title}</h3>
                      <p className="sets-loose__hint">
                        {uploads.channel.channel_id.startsWith('dj:')
                          ? 'Everything the searches have turned up. Reading this costs nothing.'
                          : 'Long uploads only — promo clips under twenty minutes are not sets.'}
                      </p>
                      {uploads.items.length === 0 && (
                        <p className="sets-empty">
                          {uploads.emptyNote ?? 'No long uploads found.'}
                        </p>
                      )}
                      {uploads.items.map((item) => (
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
                          }
                          disabled={busy === item.video_id}
                        >
                          <span className="sets-track__name">
                            {item.title}
                            <span className="sets-track__extra">
                              {item.published_at.slice(0, 10)}
                              {item.duration_ms ? ` · ${Math.round(item.duration_ms / 60000)} min` : ''}
                            </span>
                          </span>
                          <span className="sets-track__votes">
                            {busy === item.video_id
                              ? 'reading...'
                              : item.already_stored
                                ? 'in library'
                                : 'get it'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'stats' && (
                <>
                  {!stats && <p className="sets-empty">Nothing processed yet.</p>}
                  {stats && (
                    <>
                      <p className="sets-summary">
                        {stats.sets} {stats.sets === 1 ? 'set' : 'sets'} · {stats.tracks} named tracks ·{' '}
                        {stats.unknowns} still unidentified
                      </p>

                      <div className="sets-stats">
                        <div className="sets-stats__block">
                          <h3 className="sets-loose__title">Most played</h3>
                          {stats.top_artists.length === 0 && <p className="sets-empty">—</p>}
                          {stats.top_artists.map(([artist, count]) => (
                            <div className="sets-track" key={artist}>
                              <span className="sets-track__name">{artist}</span>
                              <span className="sets-track__votes">{count}</span>
                            </div>
                          ))}
                        </div>

                        <div className="sets-stats__block">
                          <h3 className="sets-loose__title">Doing the rounds</h3>
                          <p className="sets-loose__hint">Records that turn up in more than one set.</p>
                          {stats.shared_tracks.length === 0 && <p className="sets-empty">—</p>}
                          {stats.shared_tracks.map(([title, artist, count]) => (
                            <div className="sets-track" key={`${artist}-${title}`}>
                              <span className="sets-track__name">
                                {artist && <span className="sets-track__artist">{artist} — </span>}
                                {title}
                              </span>
                              <span className="sets-track__votes">{count} sets</span>
                            </div>
                          ))}
                        </div>

                        <div className="sets-stats__block">
                          <h3 className="sets-loose__title">Most gaps</h3>
                          <p className="sets-loose__hint">
                            Where digging through the comments would pay off most.
                          </p>
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

                        <div className="sets-stats__block">
                          <h3 className="sets-loose__title">Quota</h3>
                          <p className="sets-loose__hint">
                            {stats.quota.spent.toLocaleString()} of{' '}
                            {stats.quota.daily_limit.toLocaleString()} units spent today ·{' '}
                            {stats.quota.remaining.toLocaleString()} left · resets in{' '}
                            {Math.floor(stats.quota.seconds_until_reset / 3600)}h{' '}
                            {Math.floor((stats.quota.seconds_until_reset % 3600) / 60)}m
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {tab === 'saved' && (
                <>
                  <div className="sets-saved__head">
                    <p className="sets-view__subtitle">
                      Hearted tracks from every set — the shopping list.
                    </p>
                    {saved.length > 0 && (
                      <button type="button" className="sets-filter__btn" onClick={copySavedList}>
                        Copy list
                      </button>
                    )}
                  </div>
                  {saved.length === 0 && <p className="sets-empty">Nothing saved yet.</p>}
                  {saved.map((t) => (
                    <div className="sets-track" key={t.id ?? trackKey(t)}>
                      <span className="sets-track__cue">{t.cue}</span>
                      <span className="sets-track__name">
                        {t.artist && <span className="sets-track__artist">{t.artist} — </span>}
                        {t.title}
                        {t.mix && <span className="sets-track__artist"> ({t.mix})</span>}
                        <span className="sets-track__extra">
                          {t.set_title}
                          <StoreLinks artist={t.artist} title={t.title} mix={t.mix} />
                        </span>
                      </span>
                      <button
                        type="button"
                        className="sets-track__heart sets-track__heart--on"
                        onClick={async () => {
                          await tauriApi
                            .deleteSavedYouTubeTrack(t.video_id, t.cue_ms, t.title)
                            .catch(() => {})
                          refreshLibrary()
                        }}
                        title="Remove from Saved"
                      >
                        <Icon name="Heart" size={13} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 637 passed (638)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/views/SetsView.tsx
git commit -m "feat(sets): Sets opens on its library home — the box, the tabs, new finds and set cards"
```

---

### Task 5: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`, replace

```markdown
Empty library: "Nothing here yet — paste a set link or type a DJ's name above."

**Back** to the library restores its tab, grouping and scroll: they are kept in
App (beside `SetsStart`), so they survive Sets being remounted by a trip
through a DJ page.

## The set page

The **hero stays put**; only what is under it — the strip, the filter and the
rows — scrolls, as on a DJ page (`DjView.css`). The video lives in the hero's
box and must not scroll (see Playing).
```

with

```markdown
Empty library: "Nothing here yet — paste a set link or type a DJ's name above."

**Back** to the library restores its tab, grouping and scroll: they are kept in
App (beside `SetsStart`), so they survive Sets being remounted by a trip
through a DJ page.

**As built by plan S3:**

- The box is `src/components/sets/SetsBox.tsx`, its rules pure in
  `src/lib/sets/box.ts` (tested): a link is any watch, youtu.be, live, shorts
  or embed address or a bare 11-character id; text is matched against the
  title, the channel and the DJ, without case or accents. The old Process /
  Search button goes: ↑ / ↓ move through the dropdown, Enter opens the row
  lit (the first, so a free result comes before the YouTube search), a press
  chooses a row before the box loses focus, Esc closes the dropdown and then
  clears the box. "Reading…" shows in the box while a set is fetched or
  YouTube searched. The dropdown sits inside the main area, so it can never
  cover the set video (the bar is below the main area, a set's page box is
  not on the library) and does not report itself as an overlay.
- YouTube's results replace the page below the box under "2 sets found on
  YouTube — opening one costs 5–7 units" and "Back to your library"; one
  already in the library says "in your library" and opens at no cost.
- The tabs are the mockup's buttons: "Library 16 · 3 new", "Saved tracks 4",
  "Following" (its badge counts the channels' news only) and "Stats", with
  By DJ / Newest on the right of the Library tab.
- New from DJs you watch shows up to 20 unseen finds, newest first, in a grid
  that wraps (cards at least 260px): the thumbnail, the DJ in orange, the
  title, "saved" or "opening costs 5–7". Mark all seen works as Home's, with
  its toast and Undo. The finds are read with the library: on arrival, after
  a check and after a set is opened (which marks it seen).
- Your sets: 4 cards to a row, 3 when the window is under 1100px wide. The
  library list's bin goes; removing a set is on its page's ⋯.
- A DJ page's Find more fills the box and focuses it, so the dropdown shows
  the free results at once; nothing is spent until the YouTube row.

## The set page

The **hero stays put**; only what is under it — the strip, the filter and the
rows — scrolls, as on a DJ page (`DjView.css`). The video lives in the hero's
box and must not scroll (see Playing).
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-sets-redesign-design.md
git commit -m "docs(spec): Sets S3 as built"
```

---

### Task 6: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 637 passed (638)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Sets opens on the box, the tabs and your sets as cards (4 to a row; 3 in a narrower window); By DJ shows a heading per DJ (the name opens the DJ page), Newest one grid.
  - Type a DJ's name: your matching sets and the tracks in your sets show as you type; Enter or a click opens one (a track plays from its time); the last row searches YouTube (101 units) and its results replace the page; Esc or clearing the box brings the library back.
  - Paste a link: "In your library · free" for a saved set, else "Open this set · 5–7 units"; Enter opens it.
  - After a DJ search finds sets: "New from DJs you watch" shows them, "Library N · M new"; a card opens its set; Mark all seen clears them, Undo brings them back.
  - A DJ page's Find more: the name in the box, the free results in the dropdown, nothing spent.
