# Track Table 3 of 6: Artwork and the Playing Row — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track rows show the files' real artwork as small thumbnails. The track playing shows an equalizer in place of its number. Under the mouse, the number becomes ▶, and on the playing row it becomes pause or play.

**Architecture:**
- **Thumbnails:**
  - `src/lib/thumbnails/queue.ts`: a pure cache of the last 1,000 thumbnails (no artwork included) and a queue that reads at most 4 at a time and drops requests cancelled before their turn. Unit-tested.
  - `thumbnails.ts`: wires the queue to `tauriApi.getTrackArtwork` and a canvas that draws each picture down to a 72px JPEG.
  - `TrackCover`: asks the queue when a row mounts and cancels when it unmounts. That is how a fast scroll skips rows.
- **The playing row:** an `Equalizer` component (CSS bars, paused in place) replaces the speaker icon. A row button replaces the hover-only ▶ icon.
- **Plan 2 review follow-ups:** the playing row's colour and Esc during a column drag.

**Tech Stack:** React 19, TypeScript, zustand (the player store), CSS animations, Canvas 2D, Vitest (jsdom, no Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-04-track-table-design.md`, section *Rows* (the cover, the states). Mockup: `2026-10-04-track-table-mockup.html`, "Rows and the track playing (approved, 1: the equalizer)". Read both first.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**The track table spec is built by six plans:**
1. toolbar and filter — done;
2. columns — done;
3. **this plan**;
4. selecting several, the bulk right-click menu, the toast with Undo;
5. Move to folder;
6. dragging tracks to playlists and folders, and reordering a playlist.

**Decisions, beyond the spec's letter:**
- **While a cover is being read**, the square is a quiet `--bg-tertiary`, not the title gradient. The gradient means "no artwork". Showing it first would flash every row from gradient to picture while scrolling. A picture fades in when it arrives (the Interactions spec's "content after loading").
- **The playing row's accent** (title, equalizer, button) is the accent drawn 25% toward the text colour (`--row-accent`):
  - plan 2 used `--accent-hover`, which a plan review measured at about 2.7:1 on Dawn's pale tint;
  - this reads about 5.9:1 on Dawn;
  - on the dark themes it stays light.
- **Esc during a column ⠿ drag cancels the drag** and leaves the panel open (Interactions spec: Esc cancels a drag first). The drag registers as the topmost overlay while it lasts.
- **Clicking ▶ also selects the row**, as the first click of a double click would. Only the double click on the button is stopped, so the row's own double click does not play it twice.
- **Pause and play on here, as the bottom player does:** the button calls `audioPlayer.pause()` and `audioPlayer.resume()`. The player's own `onPlayStateChange` updates `isPlaying`. Space comes with the Interactions plan.

**Checked:** every code block below was applied to a scratch worktree of `feat/redesign` at 93abf8f.
- **Builds and tests:** `tsc`, `eslint` on the touched files (only the existing `incompatible-library` warning), the whole `vitest` suite and `vite build` pass. The scratch tree lacks the untracked tracklist fixtures, so it counted 446 passed; the repo counts 460.
- **In WebKit** (Playwright, a page rendering only `TrackTable` with 2,000 tracks; `mockIPC` answers `get_track_artwork` after 40ms with one of four generated PNGs, 600–1000px, square and not, and "no_artwork" for every fourth track):
  - **Covers:** the first screen read 23 covers, never more than 4 at a time. 17 rows show a 72×72 `blob:` JPEG and 6 the title gradient.
  - **Fast scroll:** scrolling past about 1,000 rows in 20 jumps read only 88 covers, again never more than 4 at a time.
  - **Cache:** scrolling back to the top read none.
  - **Equalizer:** the playing row shows it running; paused, its animation is `paused`.
  - **Row button:** hovering the paused playing row shows Play and hides the equalizer, and while playing it shows Pause. Clicking ▶ on row 5 played that row's track.
  - **Esc during a column drag:** it ended the drag, the panel stayed open, and the order was unchanged; a second Esc closed the panel.
  - **Dawn:** the playing title is rgb(81, 83, 187) on rgb(236, 237, 253).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/thumbnails/queue.ts` (+ test) | create | The cache (LRU, 1,000, no-artwork kept) and the queue (4 at a time, cancel). Pure. |
| `src/lib/thumbnails/thumbnails.ts` | create | `makeThumbnail` (canvas, 72px JPEG); the one queue every table uses. |
| `src/components/track-table/TrackCover.tsx` | create | A row's cover: thumbnail, gradient, or a quiet square while reading. |
| `src/components/Equalizer.tsx`, `Equalizer.css` | create | Three bars; moving while playing, still while paused. |
| `src/components/TrackTable.tsx` | modify | The # cell (equalizer, the row button), the cover. |
| `src/components/TrackTable.css` | modify | The row button, the cover, `--row-accent`. |
| `src/components/track-table/ColumnsPanel.tsx` | modify | Esc cancels a ⠿ drag. |

---

### Task 0: Baseline

- [ ] **Step 1: Be on the branch**

```bash
git switch feat/redesign
git status --short --untracked-files=no   # only .claude/settings.local.json and .planning/STATE.md may show; leave them (untracked files are the user's, leave them too)
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass (452), no type errors.

Run: `npx eslint src 2>&1 | tail -2`
Expected: `✖ 22 problems (10 errors, 12 warnings)`, the existing ones. In the files this plan touches, the only one is `TrackTable.tsx`'s `incompatible-library` warning on `useVirtualizer`.

---

### Task 1: The thumbnail cache and queue

**Files:**
- Create: `src/lib/thumbnails/queue.ts`
- Test: `src/lib/thumbnails/queue.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/thumbnails/queue.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ThumbnailCache, ThumbnailQueue, type Thumb } from './queue'

// A load whose answers the test gives, one track at a time.
function controlledLoad() {
  const pending = new Map<number, (thumb: Thumb) => void>()
  const failing = new Map<number, (error: Error) => void>()
  const load = vi.fn(
    (id: number) =>
      new Promise<Thumb>((resolve, reject) => {
        pending.set(id, resolve)
        failing.set(id, reject)
      }),
  )
  const answer = async (id: number, thumb: Thumb) => {
    pending.get(id)!(thumb)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const fail = async (id: number) => {
    failing.get(id)!(new Error('no_artwork'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { load, answer, fail, started: () => load.mock.calls.map(([id]) => id) }
}

describe('the thumbnail cache', () => {
  it('keeps the most recent, frees the URL of the one that goes', () => {
    const release = vi.fn()
    const cache = new ThumbnailCache(2, release)
    cache.set(1, 'blob:1')
    cache.set(2, 'blob:2')
    cache.get(1) // 1 is now more recent than 2
    cache.set(3, 'blob:3')
    expect(cache.get(2)).toBeUndefined()
    expect(cache.get(1)).toBe('blob:1')
    expect(release).toHaveBeenCalledWith('blob:2')
    expect(cache.size).toBe(2)
  })

  it('keeps "no artwork", which has no URL to free', () => {
    const release = vi.fn()
    const cache = new ThumbnailCache(1, release)
    cache.set(1, null)
    expect(cache.get(1)).toBeNull()
    cache.set(2, 'blob:2')
    expect(release).not.toHaveBeenCalled()
  })
})

describe('the thumbnail queue', () => {
  it('reads at most four at a time', async () => {
    const { load, answer, started } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    for (let id = 1; id <= 6; id++) queue.request(id, vi.fn())
    expect(started()).toEqual([1, 2, 3, 4])
    await answer(2, 'blob:2')
    expect(started()).toEqual([1, 2, 3, 4, 5])
  })

  it('gives each asker the thumbnail, and keeps it', async () => {
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const first = vi.fn()
    const second = vi.fn()
    queue.request(7, first)
    queue.request(7, second)
    expect(load).toHaveBeenCalledTimes(1)
    await answer(7, 'blob:7')
    expect(first).toHaveBeenCalledWith('blob:7')
    expect(second).toHaveBeenCalledWith('blob:7')
    expect(queue.cached(7)).toBe('blob:7')
  })

  it('answers a known thumbnail at once, without reading it again', () => {
    const cache = new ThumbnailCache(100, vi.fn())
    cache.set(7, null)
    const { load } = controlledLoad()
    const queue = new ThumbnailQueue(cache, load, 4)
    const onReady = vi.fn()
    queue.request(7, onReady)
    expect(onReady).toHaveBeenCalledWith(null)
    expect(load).not.toHaveBeenCalled()
  })

  it('skips a row that left the view before its turn', async () => {
    const { load, answer, started } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 1)
    queue.request(1, vi.fn())
    const cancel = queue.request(2, vi.fn())
    queue.request(3, vi.fn())
    cancel()
    await answer(1, 'blob:1')
    expect(started()).toEqual([1, 3])
  })

  it('still keeps a thumbnail whose row left during the read', async () => {
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    const cancel = queue.request(1, onReady)
    cancel()
    await answer(1, 'blob:1')
    expect(onReady).not.toHaveBeenCalled()
    expect(queue.cached(1)).toBe('blob:1')
  })

  it('keeps a failed read as "no artwork"', async () => {
    const { load, fail } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    queue.request(1, onReady)
    await fail(1)
    expect(onReady).toHaveBeenCalledWith(null)
    expect(queue.cached(1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/thumbnails/queue.test.ts`
Expected: FAIL — `Failed to resolve import "./queue"`.

- [ ] **Step 3: Write the cache and the queue**

```ts
// src/lib/thumbnails/queue.ts
// Artwork thumbnails' cache and queue (track table spec, Rows): the last
// 1,000 are kept — "no artwork" too, so a missing cover is not asked for
// again — and at most 4 are read at a time; a request cancelled before its
// turn (a row scrolled out of view) is dropped. Pure: reading a thumbnail and
// freeing its URL are given.

/** A thumbnail's object URL, or null for a track without artwork. */
export type Thumb = string | null

type Listener = (thumb: Thumb) => void

export class ThumbnailCache {
  // A Map keeps insertion order: the first entry is the least recently used.
  private readonly entries = new Map<number, Thumb>()

  constructor(
    private readonly limit: number,
    private readonly release: (url: string) => void,
  ) {}

  /** The thumbnail, or undefined when not known yet; a hit becomes the most recent. */
  get(id: number): Thumb | undefined {
    if (!this.entries.has(id)) return undefined
    const thumb = this.entries.get(id)!
    this.entries.delete(id)
    this.entries.set(id, thumb)
    return thumb
  }

  /** Keeps a thumbnail; past the limit, the least recently used goes and its URL is freed. */
  set(id: number, thumb: Thumb): void {
    const old = this.entries.get(id)
    if (old && old !== thumb) this.release(old)
    this.entries.delete(id)
    this.entries.set(id, thumb)
    while (this.entries.size > this.limit) {
      const [oldestId, oldest] = this.entries.entries().next().value!
      this.entries.delete(oldestId)
      if (oldest) this.release(oldest)
    }
  }

  get size(): number {
    return this.entries.size
  }
}

export class ThumbnailQueue {
  private readonly waiting: number[] = []
  private readonly listeners = new Map<number, Set<Listener>>()
  private readonly loading = new Set<number>()

  constructor(
    private readonly cache: ThumbnailCache,
    private readonly load: (id: number) => Promise<Thumb>,
    private readonly concurrency: number,
  ) {}

  /** The thumbnail if it is known, without asking for it. */
  cached(id: number): Thumb | undefined {
    return this.cache.get(id)
  }

  /**
   * Asks for a track's thumbnail; `onReady` gets it once it is read (at once
   * when it is known). The answer cancels: a request not started yet is
   * dropped; one being read still fills the cache.
   */
  request(id: number, onReady: Listener): () => void {
    const known = this.cache.get(id)
    if (known !== undefined) {
      onReady(known)
      return () => {}
    }
    let listeners = this.listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(id, listeners)
      if (!this.loading.has(id)) this.waiting.push(id)
    }
    listeners.add(onReady)
    this.pump()

    return () => {
      const current = this.listeners.get(id)
      if (!current?.delete(onReady) || current.size > 0) return
      this.listeners.delete(id)
      const index = this.waiting.indexOf(id)
      if (index !== -1) this.waiting.splice(index, 1)
    }
  }

  private pump(): void {
    while (this.loading.size < this.concurrency && this.waiting.length > 0) {
      const id = this.waiting.shift()!
      this.loading.add(id)
      this.load(id)
        .catch((): Thumb => null)
        .then((thumb) => {
          this.loading.delete(id)
          this.cache.set(id, thumb)
          const listeners = this.listeners.get(id)
          this.listeners.delete(id)
          listeners?.forEach((listener) => listener(thumb))
          this.pump()
        })
    }
  }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/thumbnails/queue.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/thumbnails/queue.ts src/lib/thumbnails/queue.test.ts
git commit -m "feat(tracks): a thumbnail cache of 1,000 and a queue that reads 4 at a time and skips rows that left"
```

---

### Task 2: Making thumbnails, and the cover

No unit test here: jsdom has no `createImageBitmap` and no canvas drawing. The rules are tested in Task 1, and Task 6 checks the pictures in the app.

**Files:**
- Create: `src/lib/thumbnails/thumbnails.ts`
- Create: `src/components/track-table/TrackCover.tsx`

- [ ] **Step 1: Make thumbnails from the files' artwork**

```ts
// src/lib/thumbnails/thumbnails.ts
// Thumbnails of the files' artwork, made on the client (track table spec,
// Rows): the raw bytes from get_track_artwork are drawn down to 72×72 on a
// canvas and only the small JPEG is kept. (artworkCache keeps full images,
// for the now-playing bar.) One cache and queue serve every track table.
import { tauriApi } from '../tauri-api'
import { ThumbnailCache, ThumbnailQueue, type Thumb } from './queue'

/** Pixels: twice the 36px cover, so it stays sharp on retina screens. */
export const THUMB_SIZE = 72

/** A 72px JPEG of the picture's middle square; null when it does not decode. */
export async function makeThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const bitmap = await createImageBitmap(new Blob([bytes]))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingQuality = 'high'
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      THUMB_SIZE,
      THUMB_SIZE,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    bitmap.close()
  }
}

// get_track_artwork answers an error for a track without artwork; the queue
// keeps that, and a picture that will not decode, as null.
async function loadThumbnail(trackId: number): Promise<Thumb> {
  return makeThumbnail(await tauriApi.getTrackArtwork(trackId))
}

export const thumbnails = new ThumbnailQueue(
  new ThumbnailCache(1000, (url) => URL.revokeObjectURL(url)),
  loadThumbnail,
  4,
)
```

- [ ] **Step 2: The cover**

```tsx
// src/components/track-table/TrackCover.tsx
// A row's cover (track table spec, Rows): the artwork thumbnail, faded in
// once read; a gradient from the title for a track without artwork; a quiet
// square meanwhile. Give it `key={track.id}` where rows are reused.
import { useEffect, useState } from 'react'
import type { Track } from '../../types/track'
import { thumbnails } from '../../lib/thumbnails/thumbnails'
import type { Thumb } from '../../lib/thumbnails/queue'
import { titleGradient } from '../../lib/trackTable/cells'

export function TrackCover({ track }: { track: Track }) {
  const [thumb, setThumb] = useState<Thumb | undefined>(() => thumbnails.cached(track.id))

  useEffect(() => {
    if (thumb !== undefined) return
    // Cancelled when the row leaves the view before its turn.
    return thumbnails.request(track.id, setThumb)
  }, [track.id, thumb])

  if (thumb === null) {
    return <span className="tt-cover" style={{ background: titleGradient(track.title) }} />
  }
  return (
    <span className="tt-cover">
      {thumb && <img className="tt-cover__img" src={thumb} alt="" draggable={false} />}
    </span>
  )
}
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/lib/thumbnails src/components/track-table/TrackCover.tsx`
Expected: no errors, no warnings.

```bash
git add src/lib/thumbnails/thumbnails.ts src/components/track-table/TrackCover.tsx
git commit -m "feat(tracks): 72px thumbnails of the files' artwork, and the cover that shows them"
```

---

### Task 3: The equalizer

**Files:**
- Create: `src/components/Equalizer.tsx`, `src/components/Equalizer.css`

- [ ] **Step 1: The component**

```tsx
// src/components/Equalizer.tsx
// Three thin bars for the track playing (track table spec, Rows): they move
// while it plays and stand still, mid-move, while it is paused. The Home and
// Sets specs use it too. Its colour is the text colour around it.
import './Equalizer.css'

export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'equalizer equalizer--playing' : 'equalizer'} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
```

- [ ] **Step 2: Its bars**

```css
/* src/components/Equalizer.css */
/* Three bars that rise and fall out of step; paused, they hold where they are. */

.equalizer {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  width: 12px;
  height: 12px;
}

.equalizer > span {
  flex: 1;
  height: 100%;
  border-radius: 1px;
  background: currentColor;
  transform-origin: bottom;
  animation: equalizer-bar 0.9s ease-in-out infinite alternate;
  animation-play-state: paused;
}

/* Out of step from the first frame, so even standing still they differ. */
.equalizer > span:nth-child(1) {
  animation-duration: 0.8s;
  animation-delay: -0.5s;
}

.equalizer > span:nth-child(2) {
  animation-duration: 1.1s;
  animation-delay: -0.2s;
}

.equalizer > span:nth-child(3) {
  animation-duration: 0.95s;
  animation-delay: -0.75s;
}

.equalizer--playing > span {
  animation-play-state: running;
}

@keyframes equalizer-bar {
  0% {
    transform: scaleY(0.25);
  }
  50% {
    transform: scaleY(1);
  }
  100% {
    transform: scaleY(0.5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .equalizer > span {
    animation: none;
    transform: scaleY(0.6);
  }
}
```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/Equalizer.tsx`
Expected: no errors, no warnings.

```bash
git add src/components/Equalizer.tsx src/components/Equalizer.css
git commit -m "feat(ui): an equalizer for the track playing — moving while it plays, still while paused"
```

---

### Task 4: The rows show them

**Files:**
- Modify: `src/components/TrackTable.tsx`
- Modify: `src/components/TrackTable.css`

- [ ] **Step 1: Imports**

In `src/components/TrackTable.tsx`, after `import { usePlayerStore } from '../store/playerStore'` add:

```tsx
import { audioPlayer } from '../lib/audioPlayer'
```

after `import { Icon } from './Icon'` add:

```tsx
import { Equalizer } from './Equalizer'
import { TrackCover } from './track-table/TrackCover'
```

and delete the line `import { titleGradient } from '../lib/trackTable/cells'` (the cover uses it now).

- [ ] **Step 2: The player's state, and pause / play on**

Replace

```tsx
    // Player store subscription for current track
    const currentTrack = usePlayerStore((state) => state.currentTrack)
```

with

```tsx
    // Player store subscription for current track
    const currentTrack = usePlayerStore((state) => state.currentTrack)
    const isPlaying = usePlayerStore((state) => state.isPlaying)

    // The playing row's button: pause, or play on from where it stopped.
    const togglePlayback = () => {
      if (usePlayerStore.getState().isPlaying) {
        audioPlayer.pause()
      } else {
        audioPlayer
          .resume()
          .catch((err) => usePlayerStore.getState().setError(`Playback error: ${err}`))
      }
    }
```

- [ ] **Step 3: The # cell and the cover**

Replace

```tsx
                    <div className="tt-cell cell-index">
                      {isPlayingTrack ? (
                        <span className="row-playing">
                          <Icon name="Volume2" size={14} />
                        </span>
                      ) : (
                        <>
                          <span className="row-number">
                            {playlistMode ? virtualRow.index + 1 : virtualRow.index + 1}
                          </span>
                          <span className="row-play">
                            <Icon name="Play" size={14} />
                          </span>
                        </>
                      )}
                    </div>
                    {layout.artwork && (
                      <div className="tt-cell cell-art">
                        <span
                          className="tt-cover"
                          style={{ background: titleGradient(track.title) }}
                        />
                      </div>
                    )}
```

with

```tsx
                    <div className="tt-cell cell-index">
                      {isPlayingTrack ? (
                        <Equalizer playing={isPlaying} />
                      ) : (
                        <span className="row-number">
                          {playlistMode ? virtualRow.index + 1 : virtualRow.index + 1}
                        </span>
                      )}
                      {/* Under the mouse: ▶ plays the row (as a double click);
                          on the row playing, pause or play on. */}
                      <button
                        type="button"
                        className="row-action"
                        aria-label={
                          isPlayingTrack ? (isPlaying ? 'Pause' : 'Play') : `Play ${track.title || 'track'}`
                        }
                        onClick={() =>
                          isPlayingTrack
                            ? togglePlayback()
                            : onTrackDoubleClick?.(track, sortedTracks, virtualRow.index)
                        }
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Icon name={isPlayingTrack && isPlaying ? 'Pause' : 'Play'} size={14} />
                      </button>
                    </div>
                    {layout.artwork && (
                      <div className="tt-cell cell-art">
                        <TrackCover key={track.id} track={track} />
                      </div>
                    )}
```

- [ ] **Step 4: The styles**

In `src/components/TrackTable.css`, replace

```css
.data-row--playing {
  --row-bg: color-mix(in srgb, var(--bg-primary), var(--accent) 12%);
}
```

with

```css
.data-row--playing {
  --row-bg: color-mix(in srgb, var(--bg-primary), var(--accent) 12%);
  /* The accent, drawn toward the text colour: lighter on dark themes, darker
     on light ones, so it reads on both. */
  --row-accent: color-mix(in srgb, var(--accent), var(--text-primary) 25%);
}
```

replace

```css
.data-row--playing .cell-title__name {
  color: var(--accent-hover);
}
```

with

```css
.data-row--playing .cell-title__name {
  color: var(--row-accent);
}
```

and replace the block from `.data-row--playing .cell-index {` through the `.tt-cover { … }` rule (the old number / ▶ / speaker rules and the cover):

```css
.data-row--playing .cell-index {
  color: var(--accent-hover);
}

/* Default state: show number, hide play icon */
.row-number { display: flex; align-items: center; }
.row-play   { display: none; color: var(--text-primary); align-items: center; }
.row-playing { color: var(--accent); display: flex; align-items: center; }

/* Hover: hide number, show play icon */
.data-row:hover .row-number { display: none; }
.data-row:hover .row-play   { display: flex; }

/* Playing: always show speaker, regardless of hover */
.data-row--playing .row-number { display: none; }
.data-row--playing .row-play   { display: none; }
.data-row--playing .cell-index .row-playing { display: flex; }

.tt-cover {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background-position: center;
  background-size: cover;
}
```

with

```css
.data-row--playing .cell-index {
  color: var(--row-accent);
}

/* The number, or the equalizer on the row playing; under the mouse, the
   button (▶, or pause / play on the row playing) takes their place. */
.row-action {
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-primary);
  cursor: pointer;
}

.data-row--playing .row-action {
  color: var(--row-accent);
}

.row-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.data-row:hover .row-number,
.data-row:hover .equalizer {
  display: none;
}

.data-row:hover .row-action {
  display: flex;
}

.tt-cover {
  display: block;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
}

.tt-cover__img {
  display: block;
  width: 100%;
  height: 100%;
  animation: tt-cover-in var(--motion-slow) var(--ease);
}

@keyframes tt-cover-in {
  from {
    opacity: 0;
  }
}
```

Run: `grep -n "\.row-play \|\.row-playing\|accent-hover" src/components/TrackTable.css`
Expected: one line, the "No tracks match" link's `color: var(--accent-hover)`. The old `.row-play` and `.row-playing` rules are gone.

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/TrackTable.tsx && npx vitest run`
Expected: no type errors; eslint shows only the existing `incompatible-library` warning; all tests pass (460).

```bash
git add src/components/TrackTable.tsx src/components/TrackTable.css
git commit -m "feat(tracks): rows show the artwork, the equalizer for the track playing, and ▶ or pause under the mouse"
```

---

### Task 5: Esc cancels a column drag

**Files:**
- Modify: `src/components/track-table/ColumnsPanel.tsx`

- [ ] **Step 1: The drag is an overlay while it lasts**

Replace

```tsx
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'
```

with

```tsx
import { useOverlay } from '../../lib/overlays'
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'
```

replace

```tsx
// column to another place (or ↑ ↓ on the focused handle), Reset, and the
// Artwork switch. # and the artwork are not in the list.
```

with

```tsx
// column to another place (or ↑ ↓ on the focused handle; Esc cancels a drag),
// Reset, and the Artwork switch. # and the artwork are not in the list.
```

and replace

```tsx
  const handles = useRef(new Map<ColumnId, HTMLButtonElement>())
  const last = layout.columns.length - 1
```

with

```tsx
  const handles = useRef(new Map<ColumnId, HTMLButtonElement>())
  const last = layout.columns.length - 1

  // A drag in progress is the topmost overlay: Esc cancels it before it
  // closes the panel (Interactions spec).
  useOverlay(drag !== null, () => setDrag(null))
```

- [ ] **Step 2: Check and commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/track-table/ColumnsPanel.tsx`
Expected: no errors, no warnings.

```bash
git add src/components/track-table/ColumnsPanel.tsx
git commit -m "fix(tracks): Esc during a column drag cancels the drag and leaves the panel open"
```

---

### Task 6: Check in the app (WebKit)

**Files:** none (fix-ups only, if something fails).

- [ ] **Step 1: Run the app**: `npm run tauri dev`. A running dev app takes these changes as it is; nothing in Rust changes.

- [ ] **Step 2: The checklist, by hand**
- **All Tracks:** the covers are the files' artwork, sharp at 36px, fading in as they arrive. A track without artwork has a gradient. While a cover is read, the square is a quiet grey.
- **Fast scroll:** scroll fast from top to bottom and back. The covers fill in where the scroll stops, the window stays smooth, and the memory (Activity Monitor, the RecoDeck WebContent process) settles rather than climbing.
- **Playing:** play a track. Its number becomes the moving equalizer, and its title is in the accent colour. Pause in the bottom player: the bars stand still.
- **Under the mouse:** the playing row shows pause while playing and ▶ while paused, and clicking it does that. The bottom player follows. On any other row the number becomes ▶, and clicking it plays that row, with the table as the queue, as a double click does.
- **Double click:** a double click still plays a row once.
- **Columns, Esc:** drag a ⠿ and press Esc before releasing. The drag ends, the order is as it was, and the panel stays open; a second Esc closes it.
- **Dawn (light theme):** the playing row's title and equalizer read well.
- **Reduce motion** (macOS → Accessibility → Display): the equalizer is three still bars, and covers only fade in.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add <the files fixed>
git commit -m "fix(tracks): <what the hand check found>"
```

Skip this step if nothing needed fixing.
