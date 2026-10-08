# Sets S1: The Set Player in App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The set's video keeps playing when you leave it. Playing moves out of `SetsView` into App: the video sits in Sets' video band while the set playing is open there, and anywhere else in a **bar above the bottom player** — the small video, "17:00 Raw Instinct — De La Bass" over the set's title, ⏮ ⏸ ⏭ ✕ — whose text opens the set again. The panel follows its box every frame (a sidebar collapse, a resize), steps off the window while any menu, popover or modal is open, and ⏮ / ⏭ follow the track the playhead is in. Starting your own file pauses the video and the other way round, as today.

**Architecture:**
- **Pure TypeScript** (tested), `src/lib/setPlayer/`: `playhead.ts` — the playhead's track, ⏮ / ⏭'s cue (timed rows only), the position and the play state to believe right after a seek, play or pause; `panelBounds.ts` — which box the panel sits in, when the bar shows, the panel's bounds (off the window while an overlay is open); `panelQueue.ts` — the webview's create / move / close calls one at a time, in order.
- **Store** (tested), `src/store/setPlayerStore.ts`: `useSetPlayer` (zustand) — the playing set, the panel's last report, the page and bar boxes (callback refs); `play`, `seek`, `step`, `togglePause`, `stop`, `replaceResult`. It respects the companion server's one instruction slot: a seek is never followed by a play, and a seek before the new page has reported waits for its first report.
- **Engine**, `src/lib/setPlayer/SetPlayerEngine.ts`, a component App mounts once in its player area: opens the panel at its box, follows the box with a `requestAnimationFrame` check (new bounds only when they change), polls every 400ms, and keeps the video and your files apart (today's latch, moved from `SetsView`, now set only while the video plays; the store stops your file directly when the app starts the video).
- **Components:** `src/components/sets/SetPlayerBar.tsx` (+ css) in App's player area above `NowPlayingBar`; `SetsView` loses its own panel code and reads the store; every `openSets` mounts a new SetsView.
- **Overlays:** every overlay the spec names calls `useOverlay`, so the engine (`isOverlayOpen()` each frame) moves the video aside.

**Tech Stack:** React 19, TypeScript, zustand, Vitest (jsdom). No Rust.

**Spec:** `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` — "Playing" (all of it) and "What changes in the code"; the approved mockup `2026-10-04-sets-redesign-mockup.html` draws the bar ("The bar above the player…"). Its plan order: **(1) this plan**, (2) the components split and the set page, (3) the library and the box, (4) Following, Saved and Stats.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 6 writes them into the spec):
- **Until S2 builds the set page**, the "page box" is Sets' video band above the Set tab (today's player, its minimise toggle dropped as the spec says): ⏮, Pause / Play, ⏭ and close above the video, the scrubber under it; shown while the set open in the Set tab is the one playing. Opening another set there while one plays leaves the playing one in the bar until "play here" (or a track of it) is pressed.
- **The bar** sits in App's player area above the bottom player, across the window (the mockup draws it under the main column; the bottom player is full width, so the bar is too), 54px, an 84×47 video box, the title and cue line ellipsized, 30px buttons with 6px corners; its text is a button that opens the set (keyboard reachable). The toasts sit above it, over the main area.
- **Off the window** is x, y = −10000 at the box's size (320×180 with no box), so the video does not reflow when it comes back.
- **A new set** closes the panel before opening, which clears the server's stored position (the backend's `open_youtube_panel` does not); until the video reports a length the store keeps the cue it opened at. After a seek, a report more than 2.5s away is taken as the panel not there yet, for 1.5s — so a second quick ⏭ steps from where the first went.
- **Opening the set again from the bar** uses `openSets`, which now raises a visit counter in SetsView's key, so it works even from Sets' own library (the same `openVideoId` would not remount it).
- **Removing the playing set** from the library stops it first; **Look again** on it keeps it playing with the new rows (`replaceResult`).
- **App's delete-folder modal** reports itself in Task 4 (App's only overlay; its import shares a hunk with the player's); the other twelve in Task 5 — the spec's list, plus the sidebar's colour menu and YouTube Music's list menu, which open at the pointer and reach into the content (and so under the video). `ExportPlaylistModal`'s Esc waits for a running export, as its backdrop and Close do.
- **The one instruction slot** (`server/routes.rs`): the page polls the latest of seek / pause / play every 400ms and a new page takes the first one it sees as its baseline. So `play()` on the playing set only seeks (the page's seek plays and unmutes); a seek before the video has reported its length is kept (`deferredSeek`, and `startMs` if the panel has not opened) and sent with the first report; play and pause are believed for 1.2s (`believedState`) so the button does not flicker back; a new set starts as buffering (state 3), so the button offers Pause at once.
- **The engine is a component** (`<SetPlayerEngine />` in App's player area), so a poll re-renders the bar and the set, not App; on mount it closes a panel left over from before a reload (HMR, a crash).

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `ed104da`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc` and each task's tests pass at every task's end.
- **Review:** an independent review applied the plan to a clean copy (all 49 blocks matched once; every task's checks passed; eslint identical to the base), drove the author's page and a more realistic one of its own in WebKit — the companion server's single instruction slot, the page's 400ms polls with their baseline, open latency, the shared Menu and SidebarFlyout — and found one blocker and six more. All are fixed here and pass on that page:
  - **blocker:** ▶ on a row of the set already playing (and the strip, "play here", an echo, a hit) sent a seek and then a play, and the play replaced the seek in the server's one slot: rows no longer moved the video (now: only the seek; the test asserts no play);
  - ✕ pressed while the panel was still opening left the video playing with nothing to stop it, and two quick opens could race in Rust (now: every create / move / close goes through `queuePanel`, in order);
  - ⏮ / ⏭ in the first second after opening were dropped by the new page's baseline (now: held until the first report, then sent);
  - starting a file while the video was paused left the latch set, so Play on the set let both play (now: latched only while the video plays, and the store stops the file when the app starts the video);
  - the Pause / Play button flickered back for a poll (now: held 1.2s);
  - the sidebar's colour menu and YouTube Music's list menu did not report themselves; `ExportPlaylistModal`'s Esc closed it mid-export.
  - Also taken: the button says Pause while the video starts; the engine as its own component; a leftover panel closed on start; the bar's buttons on the shared `.btn` (focus ring 2px out, disabled 40%).
  - Left as they are: the video sits over the fading page for App's 200ms view fade; the frame check runs while a set is loaded, paused too (as the spec says); focus falls to the page when the bar unmounts under a keyboard press; the old top-right `Notification` / `UpdateToast` sit under the video band on Sets until the Interactions sweep replaces them.
- **Builds and tests:**
  - `vitest`: 27 new (21 pure, 6 store). The repo counts 622 after it: 621 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes. No Rust changes (`cargo test --lib`: 459, as before).
- **In WebKit** (a test page with the real AppShell, SetsView, SetPlayerBar, PromptModal and the engine, IPC mocked; the native panel drawn as an orange box where its bounds put it; the simulated video moves on in real time and takes 600ms to reach a seek):
  - "play here" opens the panel exactly over the video band (240,39 1040×340); two quick ⏭ seek to 05:00 then 12:00 and the scrubber says "Charlie Banks — Dweck's Dungeon";
  - collapsing the sidebar and opening it again: the panel follows the band each time; on the reviewer's page (one instruction slot, polling page): ▶ on a row of the playing set moves the video to 17:01; ⏭ 250ms after "play here" waits for the page and lands on 5:00; ✕ 80ms after "play here" closes the panel once it has opened; a file started while the video is paused, then the set's Play: the file stops; the button holds "Play" through the next polls after Pause; five quick ⏭ land on 26:30; switching sets shows no stale position;
  - a PromptModal open: the panel at −10000 (same size); Esc closes it and the panel is back;
  - the Library tab: the bar shows, the panel on its video box, "12:00 Charlie Banks — Dweck's Dungeon / Marco Carola b2b Luciano — KEEZY 2022 Opening"; Home: the same; the bar's ⏭ → 17:00 Raw Instinct;
  - a file starts: `pause_youtube_panel`, the bar's button turns to Play; the bar's Play: the file stops;
  - the bar's text: back on the set, the panel in the band, the bar gone;
  - set B shown while A plays: A stays in the bar; "play here" on B closes A's panel and opens B's in the band;
  - close: the panel closes, no bar. 7 bounds updates were sent in the whole run.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/setPlayer/playhead.ts` (+ test) | create | the playhead's track, ⏮ / ⏭'s cue, the position after a seek |
| `src/lib/setPlayer/panelBounds.ts` (+ test) | create | which box, when the bar shows, the panel's bounds |
| `src/lib/setPlayer/panelQueue.ts` (+ test) | create | the webview's calls one at a time, in order |
| `src/store/setPlayerStore.ts` (+ test) | create | `useSetPlayer`: the playing set, the panel's report, the boxes, the actions |
| `src/lib/setPlayer/SetPlayerEngine.ts` | create | opens, follows, polls the panel; keeps the two players apart |
| `src/components/sets/SetPlayerBar.tsx`, `.css` | create | the bar above the bottom player |
| `src/App.tsx` | modify | mounts the engine and the bar; a new SetsView per `openSets`; the delete-folder modal's `useOverlay` |
| `src/components/views/SetsView.tsx`, `.css` | modify | its panel code goes; the video band and every ▶ use the store |
| `src/components/PromptModal.tsx`, `eq/EQModal.tsx`, `DuplicatesModal.tsx`, `ExportPlaylistModal.tsx`, `SharePlaylistModal.tsx`, `WhatsNewDialog.tsx`, `FolderTree.tsx`, `dj/DjCandidatesMenu.tsx`, `layout/NowPlayingBar.tsx`, `layout/SidebarFlyout.tsx`, `layout/Sidebar.tsx`, `youtube-music/YouTubeMusicLists.tsx`, `src/lib/overlays.ts` | modify | each overlay calls `useOverlay` |
| `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `ed104da`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 594 passed (595)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`.

---

### Task 1: Where the video is, and where the panel goes

**Files:** Create `src/lib/setPlayer/playhead.ts`, `src/lib/setPlayer/playhead.test.ts`, `src/lib/setPlayer/panelBounds.ts`, `src/lib/setPlayer/panelBounds.test.ts`, `src/lib/setPlayer/panelQueue.ts`, `src/lib/setPlayer/panelQueue.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/setPlayer/playhead.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { believedPosition, believedState, isPlayingState, playheadTrack, stepCue, timedTracks } from './playhead'
import type { Track } from '../tracklist'

const row = (index: number, cueMs: number): Track =>
  ({ index, cue: '', cueMs, title: `Track ${index}`, artist: null } as unknown as Track)

// 00:00, 05:00, (a row without a time), 12:00, 17:00
const tracks = [row(1, 0), row(2, 300_000), row(3, 0), row(4, 720_000), row(5, 1_020_000)]

describe('timedTracks', () => {
  it('keeps the rows with a time and the first row', () => {
    expect(timedTracks(tracks).map((t) => t.index)).toEqual([1, 2, 4, 5])
  })
})

describe('playheadTrack', () => {
  it('is the last timed row at or before the position, to the next timed row', () => {
    expect(playheadTrack(tracks, false, 400_000, 3_600_000)).toEqual({
      track: tracks[1],
      startMs: 300_000,
      endMs: 720_000,
    })
    expect(playheadTrack(tracks, false, 720_000, 3_600_000)?.track.index).toBe(4)
  })

  it('runs the last track to the end of the video', () => {
    expect(playheadTrack(tracks, false, 2_000_000, 3_600_000)).toMatchObject({ startMs: 1_020_000, endMs: 3_600_000 })
    // The length not known yet, the end is just after the start.
    expect(playheadTrack(tracks, false, 2_000_000, 0)?.endMs).toBe(1_020_001)
  })

  it('is nothing for an untimed list, or before the first cue', () => {
    expect(playheadTrack(tracks, true, 400_000, 3_600_000)).toBeNull()
    expect(playheadTrack([row(2, 60_000)], false, 10_000, 3_600_000)).toBeNull()
  })
})

describe('stepCue', () => {
  it('steps from the playhead’s track to the timed row after or before it', () => {
    expect(stepCue(tracks, false, 400_000, 1)).toBe(720_000)
    expect(stepCue(tracks, false, 400_000, -1)).toBe(0)
    // Right after Play set, from 00:00.
    expect(stepCue(tracks, false, 0, 1)).toBe(300_000)
  })

  it('stops at either end', () => {
    expect(stepCue(tracks, false, 0, -1)).toBeNull()
    expect(stepCue(tracks, false, 1_500_000, 1)).toBeNull()
  })

  it('does nothing for an untimed list', () => {
    expect(stepCue(tracks, true, 400_000, 1)).toBeNull()
  })
})

describe('believedPosition', () => {
  const pending = { ms: 720_000, until: 10_000 }

  it('keeps where a seek went while the panel still reports where it was', () => {
    expect(believedPosition(400_000, pending, 9_000)).toBe(720_000)
  })

  it('takes the report once it is near the seek, or once the seek has settled', () => {
    expect(believedPosition(721_000, pending, 9_000)).toBe(721_000)
    expect(believedPosition(400_000, pending, 10_000)).toBe(400_000)
    expect(believedPosition(400_000, null, 9_000)).toBe(400_000)
  })

  it('lets a second quick ⏭ step from where the first went', () => {
    const position = believedPosition(400_000, pending, 9_000)
    expect(stepCue(tracks, false, position, 1)).toBe(1_020_000)
  })
})

describe('believedState', () => {
  it('counts buffering as playing', () => {
    expect([1, 3].map(isPlayingState)).toEqual([true, true])
    expect([-1, 0, 2, 5].map(isPlayingState)).toEqual([false, false, false, false])
  })

  it('holds a pause or a play just sent while the panel still reports the old state', () => {
    expect(believedState(1, { playing: false, until: 10_000 }, 9_000)).toBe(2)
    expect(believedState(2, { playing: true, until: 10_000 }, 9_000)).toBe(3)
  })

  it('takes the report once it agrees, or once the hold is over', () => {
    expect(believedState(2, { playing: false, until: 10_000 }, 9_000)).toBe(2)
    expect(believedState(1, { playing: false, until: 10_000 }, 10_000)).toBe(1)
    expect(believedState(1, null, 9_000)).toBe(1)
  })
})
```

Create `src/lib/setPlayer/panelBounds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OFFSCREEN, barShows, panelBounds, panelBox, sameBounds } from './panelBounds'

describe('which box the panel sits in', () => {
  it('is the set page’s while it is mounted, else the bar’s', () => {
    expect(panelBox('page', 'bar')).toBe('page')
    expect(panelBox(null, 'bar')).toBe('bar')
    expect(panelBox(null, null)).toBeNull()
  })

  it('shows the bar exactly while a set plays off its page', () => {
    expect(barShows(true, false)).toBe(true)
    expect(barShows(true, true)).toBe(false)
    expect(barShows(false, false)).toBe(false)
  })
})

describe('panelBounds', () => {
  const rect = { left: 240.4, top: 96.6, width: 440, height: 247.5 }

  it('is the box, in whole pixels', () => {
    expect(panelBounds(rect, false)).toEqual({ x: 240, y: 97, width: 440, height: 248 })
  })

  it('is off the window, at the same size, while an overlay is open', () => {
    expect(panelBounds(rect, true)).toEqual({ x: OFFSCREEN, y: OFFSCREEN, width: 440, height: 248 })
  })

  it('is off the window with no box to sit in', () => {
    expect(panelBounds(null, false)).toEqual({ x: OFFSCREEN, y: OFFSCREEN, width: 320, height: 180 })
    expect(panelBounds({ left: 0, top: 0, width: 0, height: 0 }, false).x).toBe(OFFSCREEN)
  })

  it('compares bounds', () => {
    const b = panelBounds(rect, false)
    expect(sameBounds(b, { ...b })).toBe(true)
    expect(sameBounds(b, { ...b, x: b.x + 1 })).toBe(false)
    expect(sameBounds(null, b)).toBe(false)
  })
})
```

Create `src/lib/setPlayer/panelQueue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { queuePanel } from './panelQueue'

describe('queuePanel', () => {
  it('runs the calls in order, a slow open before the close sent after it', async () => {
    const done: string[] = []
    const open = queuePanel(() => new Promise<void>((resolve) => setTimeout(() => { done.push('open'); resolve() }, 30)))
    const close = queuePanel(async () => { done.push('close') })
    await Promise.all([open, close])
    expect(done).toEqual(['open', 'close'])
  })

  it('goes on after a call that failed', async () => {
    const failed = queuePanel(() => Promise.reject(new Error('no panel')))
    const next = queuePanel(async () => 'moved')
    await expect(failed).rejects.toThrow('no panel')
    await expect(next).resolves.toBe('moved')
  })
})
```

Run `npx vitest run src/lib/setPlayer`: FAIL — `./playhead`, `./panelBounds` and `./panelQueue` do not exist.

- [ ] **Step 2: The playhead**

Create `src/lib/setPlayer/playhead.ts`:

```ts
// src/lib/setPlayer/playhead.ts
// Where a set's video is in its tracklist (Sets redesign spec, Playing): the
// track the playhead is inside, and the timed rows ⏮ / ⏭ step to. Taken
// from the position the panel reports, never from the row clicked last, so
// they hold right after Play set and once the video runs on into the next
// track.
import type { Track } from '../tracklist'

/** The rows the video can be sent to: those with a time, and the first (00:00). */
export function timedTracks(tracks: readonly Track[]): Track[] {
  return tracks.filter((t) => t.cueMs > 0 || t.index === 1)
}

export interface PlayheadTrack {
  track: Track
  startMs: number
  /** Where the next timed row starts; the last runs to the end of the video. */
  endMs: number
}

/** Position of the last timed row at or before `positionMs`; -1 before the first. */
function playheadIndex(timed: readonly Track[], positionMs: number): number {
  let index = -1
  for (let i = 0; i < timed.length; i += 1) {
    if (timed[i].cueMs <= positionMs) index = i
    else break
  }
  return index
}

/**
 * The track the playhead is inside, where it starts and where it ends; null
 * for an untimed list and before the first cue. `durationMs` is the video's
 * length (0 when unknown).
 */
export function playheadTrack(
  tracks: readonly Track[],
  untimed: boolean,
  positionMs: number,
  durationMs: number,
): PlayheadTrack | null {
  if (untimed) return null
  const timed = timedTracks(tracks)
  const index = playheadIndex(timed, positionMs)
  if (index < 0) return null
  const track = timed[index]
  const endMs = timed[index + 1]?.cueMs ?? durationMs
  return { track, startMs: track.cueMs, endMs: Math.max(endMs, track.cueMs + 1) }
}

/**
 * Where ⏮ (-1) or ⏭ (1) sends the video: the cue of the timed row before or
 * after the playhead's. Null at either end and for an untimed list.
 */
export function stepCue(
  tracks: readonly Track[],
  untimed: boolean,
  positionMs: number,
  direction: 1 | -1,
): number | null {
  if (untimed) return null
  const timed = timedTracks(tracks)
  const index = playheadIndex(timed, positionMs)
  const next = direction === 1 ? timed[index + 1] : index > 0 ? timed[index - 1] : undefined
  return next ? next.cueMs : null
}

/** A seek just sent: where the video was asked to go, and until when that holds. */
export interface PendingSeek {
  ms: number
  /** Date.now() until which a report far from it is the panel not there yet. */
  until: number
}

/** How long after a seek a far-off report is taken as stale. */
export const SEEK_SETTLE_MS = 1500
/** How far a report may be from the seek and still count as having arrived. */
const SEEK_NEAR_MS = 2500

/**
 * The position to believe: the panel's report, unless a seek was just sent
 * and the report is still far from it — the panel is polled every 400ms, so
 * for a moment after ⏭ it says where it was, and a second quick ⏭ must step
 * from where the first one went.
 */
export function believedPosition(reportedMs: number, pending: PendingSeek | null, now: number): number {
  if (!pending || now >= pending.until) return reportedMs
  return Math.abs(reportedMs - pending.ms) > SEEK_NEAR_MS ? pending.ms : reportedMs
}

/** Playing or buffering: the video means to play. YouTube numbers them 1 and 3. */
export function isPlayingState(state: number): boolean {
  return state === 1 || state === 3
}

/** A play or a pause just sent: what the video was asked to do, and until when that holds. */
export interface PendingState {
  playing: boolean
  until: number
}

/** How long after a play or pause a report that disagrees is taken as stale. */
export const STATE_SETTLE_MS = 1200

/**
 * The player state to believe: the report, unless a play or pause was just
 * sent and the report does not agree yet — the next poll still says what the
 * video was doing, and the button would flicker back for a moment.
 */
export function believedState(reported: number, pending: PendingState | null, now: number): number {
  if (!pending || now >= pending.until || isPlayingState(reported) === pending.playing) return reported
  return pending.playing ? 3 : 2
}
```

- [ ] **Step 3: The panel's place**

Create `src/lib/setPlayer/panelBounds.ts`:

```ts
// src/lib/setPlayer/panelBounds.ts
// Where the set's video panel goes (Sets redesign spec, Where the panel
// sits). The panel is a native webview laid over the page: it cannot scroll
// and draws above everything, so it follows a box — the playing set's page
// box while that is mounted, else the bar's — and waits off the window,
// still playing, while a menu, popover or modal is open.

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Off the window, where the panel waits while it may not be seen. */
export const OFFSCREEN = -10000

/** The box the panel belongs in: the set page's while it is mounted, else the bar's. */
export function panelBox<T>(pageBox: T | null, barBox: T | null): T | null {
  return pageBox ?? barBox
}

/** The bar shows while a set plays and its page box is not mounted. */
export function barShows(playing: boolean, pageBoxMounted: boolean): boolean {
  return playing && !pageBoxMounted
}

/** The size the panel keeps off the window when it has no box to measure. */
const RESTING = { width: 320, height: 180 }

/**
 * The panel's bounds for its box's rectangle: the box itself, or off the
 * window — keeping its size, so the video does not reflow — while an overlay
 * is open or there is no box to sit in.
 */
export function panelBounds(
  rect: { left: number; top: number; width: number; height: number } | null,
  overlayOpen: boolean,
): Bounds {
  if (!rect || rect.width <= 0 || rect.height <= 0 || overlayOpen) {
    return {
      x: OFFSCREEN,
      y: OFFSCREEN,
      width: rect && rect.width > 0 ? Math.round(rect.width) : RESTING.width,
      height: rect && rect.height > 0 ? Math.round(rect.height) : RESTING.height,
    }
  }
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

export function sameBounds(a: Bounds | null, b: Bounds): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
```

- [ ] **Step 4: The panel's calls, one at a time**

Create `src/lib/setPlayer/panelQueue.ts`:

```ts
// src/lib/setPlayer/panelQueue.ts
// The YouTube panel's calls that create, move or close the native webview,
// one at a time and in order: a close sent while an open is still on its way
// must not land first (or the video plays on with nothing to stop it), and
// two opens must not race for the panel's one label.

let chain: Promise<unknown> = Promise.resolve()

/** Runs `call` after every panel call queued before it, failed or not. */
export function queuePanel<T>(call: () => Promise<T>): Promise<T> {
  const next = chain.then(call, call)
  chain = next.catch(() => {})
  return next
}
```

- [ ] **Step 5:** `npx vitest run src/lib/setPlayer`: PASS, 21. Commit:

```bash
git add src/lib/setPlayer/playhead.ts src/lib/setPlayer/playhead.test.ts src/lib/setPlayer/panelBounds.ts src/lib/setPlayer/panelBounds.test.ts src/lib/setPlayer/panelQueue.ts src/lib/setPlayer/panelQueue.test.ts
git commit -m "feat(sets): the playhead's track, ⏮ / ⏭ from it, where the set panel goes, and its calls in order"
```

---

### Task 2: The set player store

**Files:** Create `src/store/setPlayerStore.ts`, `src/store/setPlayerStore.test.ts`.

- [ ] **Step 1: The failing test**

Create `src/store/setPlayerStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    seekYouTubePanel: vi.fn(() => Promise.resolve()),
    playYouTubePanel: vi.fn(() => Promise.resolve()),
    pauseYouTubePanel: vi.fn(() => Promise.resolve()),
    closeYouTubePanel: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('../lib/audioPlayer', () => ({ audioPlayer: { pause: vi.fn() } }))

import { tauriApi } from '../lib/tauri-api'
import { audioPlayer } from '../lib/audioPlayer'
import { useSetPlayer } from './setPlayerStore'
import { usePlayerStore } from './playerStore'
import type { Track, TracklistResult } from '../lib/tracklist'

const row = (index: number, cueMs: number): Track =>
  ({ index, cue: '', cueMs, title: `Track ${index}`, artist: null } as unknown as Track)

const set = (id: string): TracklistResult =>
  ({
    video: { id, url: `https://youtu.be/${id}`, title: `Set ${id}`, channel: 'Cercle', publishedAt: '', durationMs: 3_600_000 },
    tracks: [row(1, 0), row(2, 300_000), row(3, 720_000), row(4, 1_020_000)],
  } as unknown as TracklistResult)

const report = (position_ms: number, player_state = 1) => ({ position_ms, duration_ms: 3_600_000, player_state })

/** A set playing whose page has reported, so instructions go out. */
function listening(id = 'a', at = 0) {
  useSetPlayer.getState().play(set(id), at)
  useSetPlayer.getState().setPanel(report(at))
  vi.clearAllMocks()
}

beforeEach(() => {
  useSetPlayer.setState({
    playing: null,
    panel: null,
    reported: false,
    deferredSeek: null,
    pendingSeek: null,
    pendingState: null,
    pageBox: null,
    barBox: null,
  })
  usePlayerStore.setState({ isPlaying: false })
  vi.clearAllMocks()
})

describe('the set player', () => {
  it('plays a set from a cue; a row of the same set only seeks (the page’s seek plays)', () => {
    const a = set('a')
    useSetPlayer.getState().play(a, 300_000)
    expect(useSetPlayer.getState().playing).toEqual({ result: a, startMs: 300_000 })
    expect(useSetPlayer.getState().panel).toMatchObject({ position_ms: 300_000, player_state: 3 })

    useSetPlayer.getState().setPanel(report(300_000))
    useSetPlayer.getState().play(a, 720_000)
    expect(tauriApi.seekYouTubePanel).toHaveBeenCalledWith(720)
    // One instruction at a time: a play after it would replace the seek.
    expect(tauriApi.playYouTubePanel).not.toHaveBeenCalled()
  })

  it('holds a seek until the new page reports, then sends it', () => {
    useSetPlayer.getState().play(set('a'), 0)
    useSetPlayer.getState().step(1)
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).not.toHaveBeenCalled()
    expect(useSetPlayer.getState().playing?.startMs).toBe(720_000)
    expect(useSetPlayer.getState().panel?.position_ms).toBe(720_000)

    // Still loading: no length yet.
    useSetPlayer.getState().setPanel({ position_ms: 0, duration_ms: 0, player_state: 0 })
    expect(tauriApi.seekYouTubePanel).not.toHaveBeenCalled()
    useSetPlayer.getState().setPanel(report(0))
    expect(tauriApi.seekYouTubePanel).toHaveBeenCalledWith(720)
    expect(useSetPlayer.getState().panel?.position_ms).toBe(720_000)
  })

  it('steps from where a seek went while the panel still reports the old position', () => {
    listening()
    useSetPlayer.getState().setPanel(report(10_000))
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(300)
    // The next poll still says 00:10: the second ⏭ goes on from 05:00.
    useSetPlayer.getState().setPanel(report(10_000))
    useSetPlayer.getState().step(1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(720)
    useSetPlayer.getState().step(-1)
    expect(tauriApi.seekYouTubePanel).toHaveBeenLastCalledWith(300)
  })

  it('pauses and plays without flickering back while the poll catches up, and ✕ closes it', async () => {
    listening()
    useSetPlayer.getState().setPanel(report(5_000, 1))
    useSetPlayer.getState().togglePause()
    expect(tauriApi.pauseYouTubePanel).toHaveBeenCalled()
    useSetPlayer.getState().setPanel(report(5_400, 1))
    expect(useSetPlayer.getState().panel?.player_state).toBe(2)
    useSetPlayer.getState().togglePause()
    expect(tauriApi.playYouTubePanel).toHaveBeenCalled()

    useSetPlayer.getState().stop()
    expect(useSetPlayer.getState().playing).toBeNull()
    await vi.waitFor(() => expect(tauriApi.closeYouTubePanel).toHaveBeenCalled())
  })

  it('stops your own file when it starts the video', () => {
    usePlayerStore.setState({ isPlaying: true })
    useSetPlayer.getState().play(set('a'), 0)
    expect(audioPlayer.pause).toHaveBeenCalled()
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    listening()
    useSetPlayer.getState().togglePause()
    usePlayerStore.setState({ isPlaying: true })
    useSetPlayer.getState().togglePause()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('takes Look again’s rows only for the set playing', () => {
    useSetPlayer.getState().play(set('a'), 0)
    const again = { ...set('a'), tracks: [row(1, 0)] }
    useSetPlayer.getState().replaceResult(set('b'))
    expect(useSetPlayer.getState().playing?.result.video.id).toBe('a')
    useSetPlayer.getState().replaceResult(again)
    expect(useSetPlayer.getState().playing?.result.tracks).toHaveLength(1)
  })
})
```

Run `npx vitest run src/store/setPlayerStore.test.ts`: FAIL — `./setPlayerStore` does not exist.

- [ ] **Step 2: The store**

Create `src/store/setPlayerStore.ts`:

```ts
// src/store/setPlayerStore.ts
// The set playing in the YouTube panel (Sets redesign spec, Playing): which
// set, where the video is, and which box the panel sits in. It lives in App,
// not in Sets, so the video keeps playing in the bar above the player when
// you leave the set — the bar needs the set's tracks while Sets is closed.
// `SetPlayerEngine` (mounted once in App) opens, places, polls and closes
// the panel; everything else reads and acts through this store.
//
// The panel takes its orders through the companion server, which keeps ONE
// instruction (seek, pause or play) that the player page polls every 400ms:
// so a seek is never followed by a play (the page's seek plays anyway), and
// nothing is sent until the new page is listening.
import { create } from 'zustand'
import { tauriApi } from '../lib/tauri-api'
import { audioPlayer } from '../lib/audioPlayer'
import { queuePanel } from '../lib/setPlayer/panelQueue'
import {
  SEEK_SETTLE_MS,
  STATE_SETTLE_MS,
  believedPosition,
  believedState,
  isPlayingState,
  stepCue,
  type PendingSeek,
  type PendingState,
} from '../lib/setPlayer/playhead'
import type { TracklistResult } from '../lib/tracklist'
import { usePlayerStore } from './playerStore'
import { YT_PLAYING, type YouTubePanelState } from '../types/youtube'

export interface PlayingSet {
  /** The parsed set: its video (id, url, title, channel, length) and tracks. */
  result: TracklistResult
  /** Where it was asked to start, in ms: the panel opens there. */
  startMs: number
}

interface SetPlayerState {
  playing: PlayingSet | null
  /** What the panel last reported, with a seek, play or pause just sent applied. */
  panel: YouTubePanelState | null
  /** The video has reported its length since it opened: the page is listening. */
  reported: boolean
  /** A seek asked for before that: sent with the first report. */
  deferredSeek: number | null
  pendingSeek: PendingSeek | null
  pendingState: PendingState | null
  /** The playing set's page box, while that page is mounted. */
  pageBox: HTMLElement | null
  /** The bar's box, while the bar shows. */
  barBox: HTMLElement | null

  /** Plays a set from a cue; the set already playing is sought instead. */
  play: (result: TracklistResult, cueMs: number) => void
  seek: (ms: number) => void
  /** ⏮ (-1) / ⏭ (1) from the track the playhead is in. */
  step: (direction: 1 | -1) => void
  togglePause: () => void
  /** ✕: stops the video and closes the panel. */
  stop: () => void
  /** Look again on the playing set: new rows, the video plays on. */
  replaceResult: (result: TracklistResult) => void
  /** A poll's report. */
  setPanel: (state: YouTubePanelState) => void
  /** Callback refs: a box registers when it mounts, null when it unmounts. */
  attachPageBox: (el: HTMLElement | null) => void
  attachBarBox: (el: HTMLElement | null) => void
}

/** Playing or buffering: the video means to play. */
export function videoIsPlaying(panel: YouTubePanelState | null): boolean {
  return panel !== null && isPlayingState(panel.player_state)
}

/**
 * The app starts the video itself (Play set, ▶, a seek, the bar's Play):
 * your own file stops at once. The engine's latch covers the one start the
 * app cannot see coming — a click inside the panel.
 */
function pauseOwnFile() {
  if (!usePlayerStore.getState().isPlaying) return
  audioPlayer.pause()
  usePlayerStore.getState().setIsPlaying(false)
}

const holding = (playing: boolean): PendingState => ({ playing, until: Date.now() + STATE_SETTLE_MS })

export const useSetPlayer = create<SetPlayerState>((set, get) => ({
  playing: null,
  panel: null,
  reported: false,
  deferredSeek: null,
  pendingSeek: null,
  pendingState: null,
  pageBox: null,
  barBox: null,

  play: (result, cueMs) => {
    if (get().playing?.result.video.id === result.video.id) {
      get().seek(cueMs)
      return
    }
    pauseOwnFile()
    // The panel opens at the cue (the engine); until it reports, it is there,
    // starting (buffering), so the button already offers Pause.
    set({
      playing: { result, startMs: cueMs },
      panel: { position_ms: cueMs, duration_ms: 0, player_state: 3 },
      reported: false,
      deferredSeek: null,
      pendingSeek: null,
      pendingState: null,
    })
  },

  seek: (ms) => {
    const { playing, panel, reported } = get()
    if (!playing) return
    pauseOwnFile()
    // The page's seek plays as well: it is playing from here.
    const next = { position_ms: ms, duration_ms: panel?.duration_ms ?? 0, player_state: 3 }
    if (!reported) {
      // The new page takes the first instruction it sees as its starting
      // point and would drop this one: it waits for the first report (and
      // opens there, if the panel is not open yet).
      set({ panel: next, deferredSeek: ms, playing: { ...playing, startMs: ms } })
      return
    }
    set({
      panel: next,
      pendingSeek: { ms, until: Date.now() + SEEK_SETTLE_MS },
      pendingState: holding(true),
    })
    void tauriApi.seekYouTubePanel(Math.floor(ms / 1000)).catch(() => {})
  },

  step: (direction) => {
    const { playing, panel } = get()
    if (!playing) return
    const cue = stepCue(playing.result.tracks, Boolean(playing.result.untimed), panel?.position_ms ?? 0, direction)
    if (cue !== null) get().seek(cue)
  },

  togglePause: () => {
    const { playing, panel } = get()
    if (!playing || !panel) return
    if (videoIsPlaying(panel)) {
      void tauriApi.pauseYouTubePanel().catch(() => {})
      set({ panel: { ...panel, player_state: 2 }, pendingState: holding(false) })
    } else {
      pauseOwnFile()
      void tauriApi.playYouTubePanel().catch(() => {})
      set({ panel: { ...panel, player_state: YT_PLAYING }, pendingState: holding(true) })
    }
  },

  stop: () => {
    if (!get().playing) return
    set({ playing: null, panel: null, reported: false, deferredSeek: null, pendingSeek: null, pendingState: null })
    // After any open still on its way, so it is the one closed.
    void queuePanel(() => tauriApi.closeYouTubePanel()).catch(() => {})
  },

  replaceResult: (result) => {
    const playing = get().playing
    if (playing?.result.video.id === result.video.id) set({ playing: { ...playing, result } })
  },

  setPanel: (state) => {
    // No length yet: the page is still loading (or the state was just
    // cleared), and what it says is not about this video.
    if (state.duration_ms <= 0) return
    const { pendingSeek, pendingState, deferredSeek, reported } = get()
    const now = Date.now()
    set({
      panel: {
        ...state,
        position_ms: believedPosition(state.position_ms, pendingSeek, now),
        player_state: believedState(state.player_state, pendingState, now),
      },
      reported: true,
      deferredSeek: null,
      pendingSeek: pendingSeek && now < pendingSeek.until ? pendingSeek : null,
      pendingState: pendingState && now < pendingState.until ? pendingState : null,
    })
    // The page is listening now: the seek asked for before it was goes out.
    if (!reported && deferredSeek !== null) get().seek(deferredSeek)
  },

  attachPageBox: (el) => set({ pageBox: el }),
  attachBarBox: (el) => set({ barBox: el }),
}))
```

- [ ] **Step 3:** `npx vitest run src/store/setPlayerStore.test.ts`: PASS, 6. Commit:

```bash
git add src/store/setPlayerStore.ts src/store/setPlayerStore.test.ts
git commit -m "feat(sets): the set player store — the playing set, seeks, steps, pause, stop"
```

---

### Task 3: The engine and the bar

**Files:** Create `src/lib/setPlayer/SetPlayerEngine.ts`, `src/components/sets/SetPlayerBar.tsx`, `src/components/sets/SetPlayerBar.css`.

- [ ] **Step 1: The engine** — opens the panel at its box, follows it every frame, steps off the window while an overlay is open, polls, and keeps the video and your files apart (the latch moves here from `SetsView`, set only while the video plays).

Create `src/lib/setPlayer/SetPlayerEngine.ts`:

```ts
// src/lib/setPlayer/SetPlayerEngine.ts
// The set player's engine (Sets redesign spec, Playing), mounted once in App
// as a component of its own, so a poll re-renders nothing but the bar and the
// set. While a set plays it opens the YouTube panel at its box, keeps it
// there every frame the box moves or resizes (a sidebar collapse, a banner, a
// window resize), moves it off the window while a menu, popover or modal is
// open, polls where the video is, and keeps the video and your own files
// from playing over each other.
import { useEffect, useRef } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { tauriApi } from '../tauri-api'
import { isOverlayOpen } from '../overlays'
import { audioPlayer } from '../audioPlayer'
import { playerPageUrl, watchUrl } from '../youtubeWindow'
import { panelBounds, panelBox, sameBounds, type Bounds } from './panelBounds'
import { queuePanel } from './panelQueue'
import { useSetPlayer, videoIsPlaying, type PlayingSet } from '../../store/setPlayerStore'
import { usePlayerStore } from '../../store/playerStore'
import { YT_PLAYING } from '../../types/youtube'

/** How often the panel is asked where the video is. */
const POLL_MS = 400

async function openPanel(playing: PlayingSet, bounds: Bounds): Promise<void> {
  // The player page needs a real http origin, which the companion server
  // provides. It is normally already running; start it if it is not.
  let status = await tauriApi.getCompanionStatus()
  if (!status.running || !status.port) status = await tauriApi.startCompanionServer()
  if (!status.port) throw new Error('The local server could not be started')
  // Closing first forgets the last set's position, so this one does not
  // start out reading it.
  await tauriApi.closeYouTubePanel().catch(() => {})
  await tauriApi.openYouTubePanel(
    playerPageUrl(status.port, playing.result.video.id, playing.startMs),
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  )
}

export function SetPlayerEngine(): null {
  const videoId = useSetPlayer((s) => s.playing?.result.video.id ?? null)

  // A panel left over from before a reload has no set to belong to.
  useEffect(() => {
    void queuePanel(() => tauriApi.closeYouTubePanel()).catch(() => {})
  }, [])

  // Open the panel at its box, then keep it there: a check of the box's
  // rectangle every frame while a set plays, sending new bounds only when
  // they change. No timers in the handoff between the page's box and the
  // bar's: whichever is registered when the frame runs wins. Every call that
  // creates, moves or closes the webview waits its turn (`queuePanel`), so a
  // stop or another set never overtakes an open still on its way.
  useEffect(() => {
    if (!videoId) return
    let live = true
    let opening = false
    let opened = false
    let last: Bounds | null = null
    let frame = 0
    const tick = () => {
      if (!live) return
      const { pageBox, barBox, playing } = useSetPlayer.getState()
      const box = panelBox(pageBox, barBox)
      const rect = box?.isConnected ? box.getBoundingClientRect() : null
      const bounds = panelBounds(rect, isOverlayOpen())
      if (!opened) {
        if (!opening && rect && playing) {
          opening = true
          queuePanel(() => openPanel(playing, bounds)).then(
            () => {
              if (!live) return
              opened = true
              last = bounds
            },
            (err) => {
              if (!live) return
              // If the in-window panel cannot be shown, the browser still can.
              console.error('[Sets] panel failed, falling back to the browser', err)
              void openUrl(watchUrl(playing.result.video.url, playing.startMs))
              useSetPlayer.getState().stop()
            },
          )
        }
      } else if (!sameBounds(last, bounds)) {
        last = bounds
        void queuePanel(() =>
          tauriApi.setYouTubePanelBounds(bounds.x, bounds.y, bounds.width, bounds.height),
        ).catch(() => {})
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(frame)
    }
  }, [videoId])

  // Where the video is: the panel reports to the companion server, so it is
  // polled rather than observed, and only while a set plays.
  useEffect(() => {
    if (!videoId) return
    let live = true
    const timer = window.setInterval(() => {
      tauriApi
        .youtubePanelState()
        .then((state) => {
          if (live && useSetPlayer.getState().playing?.result.video.id === videoId) {
            useSetPlayer.getState().setPanel(state)
          }
        })
        .catch(() => {})
    }, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [videoId])

  // --- two players, one pair of ears -----------------------------------
  //
  // The video and the app's own player are separate engines that know nothing
  // about each other, so whichever starts hands the other a pause. When the
  // app starts the video itself, the store stops your file directly; this is
  // for the two starts it cannot see coming.
  const isPlayingOwnFile = usePlayerStore((state) => state.isPlaying)
  const setOwnIsPlaying = usePlayerStore((state) => state.setIsPlaying)
  const videoPlaying = useSetPlayer((s) => s.panel?.player_state === YT_PLAYING)

  /**
   * True from the moment the video is asked to stand down until it says it
   * has. The panel's state arrives through a poll, so for the best part of a
   * second after "have it" is clicked the video still reports itself as
   * playing; without this latch the file would be paused a moment after it
   * began.
   */
  const waitingForVideoToStop = useRef(false)

  // The pause landed. Whatever the video reports from here is current again.
  useEffect(() => {
    if (!videoPlaying) waitingForVideoToStop.current = false
  }, [videoPlaying])

  // The video started from a click inside the panel.
  useEffect(() => {
    if (videoPlaying && isPlayingOwnFile && !waitingForVideoToStop.current) {
      audioPlayer.pause()
      setOwnIsPlaying(false)
    }
  }, [videoPlaying, isPlayingOwnFile, setOwnIsPlaying])

  // A file of your own started, so a playing video steps back. A paused one
  // needs nothing, and must not leave the latch set with no pause to clear it.
  const wasPlayingOwnFile = useRef(false)
  useEffect(() => {
    const started = isPlayingOwnFile && !wasPlayingOwnFile.current
    wasPlayingOwnFile.current = isPlayingOwnFile
    if (started && videoId && videoIsPlaying(useSetPlayer.getState().panel)) {
      // Said before the request goes out, so the rule above is already deaf
      // to the reports still in flight.
      waitingForVideoToStop.current = true
      void tauriApi.pauseYouTubePanel().catch(() => {})
    }
  }, [isPlayingOwnFile, videoId])

  return null
}
```

- [ ] **Step 2: The bar**

Create `src/components/sets/SetPlayerBar.tsx`:

```tsx
// src/components/sets/SetPlayerBar.tsx
// The set video, small, in a bar above the bottom player (Sets redesign
// spec, Playing): it shows while a set plays and you are not on its page.
// The panel is laid over the bar's video box; the text opens the set again,
// and ⏮ / ⏭ follow the track the playhead is in.
import { Icon } from '../Icon'
import { barShows } from '../../lib/setPlayer/panelBounds'
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import './SetPlayerBar.css'

export function SetPlayerBar({ onOpenSet }: { onOpenSet: (videoId: string) => void }) {
  const playing = useSetPlayer((s) => s.playing)
  const panel = useSetPlayer((s) => s.panel)
  const pageBoxMounted = useSetPlayer((s) => s.pageBox !== null)
  const attachBarBox = useSetPlayer((s) => s.attachBarBox)
  const step = useSetPlayer((s) => s.step)
  const togglePause = useSetPlayer((s) => s.togglePause)
  const stop = useSetPlayer((s) => s.stop)

  if (!playing || !barShows(true, pageBoxMounted)) return null

  const { result } = playing
  const untimed = Boolean(result.untimed)
  const position = panel?.position_ms ?? playing.startMs
  const duration = panel && panel.duration_ms > 0 ? panel.duration_ms : result.video.durationMs
  const now = playheadTrack(result.tracks, untimed, position, duration)
  const name = now ? (now.track.artist ? `${now.track.artist} — ${now.track.title}` : now.track.title) : null
  const playingNow = videoIsPlaying(panel)

  return (
    <div className="set-bar">
      {/* Left empty: the YouTube panel is laid exactly over this box. */}
      <div className="set-bar__video" ref={attachBarBox} />
      <button
        type="button"
        className="set-bar__text"
        onClick={() => onOpenSet(result.video.id)}
        title={`Open ${result.video.title}`}
      >
        <span className="set-bar__now">
          {now && name ? (
            <>
              <span className="set-bar__cue">{now.track.cue}</span> {name}
            </>
          ) : (
            result.video.title
          )}
        </span>
        <span className="set-bar__set">{now ? result.video.title : result.video.channel}</span>
      </button>
      <div className="set-bar__controls">
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label="Previous track"
          disabled={stepCue(result.tracks, untimed, position, -1) === null}
          onClick={() => step(-1)}
        >
          <Icon name="SkipBack" size={14} />
        </button>
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label={playingNow ? 'Pause' : 'Play'}
          onClick={togglePause}
        >
          <Icon name={playingNow ? 'Pause' : 'Play'} size={14} />
        </button>
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label="Next track"
          disabled={stepCue(result.tracks, untimed, position, 1) === null}
          onClick={() => step(1)}
        >
          <Icon name="SkipForward" size={14} />
        </button>
        <button type="button" className="btn set-bar__btn" aria-label="Stop the set" onClick={stop}>
          <Icon name="X" size={14} />
        </button>
      </div>
    </div>
  )
}
```

Create `src/components/sets/SetPlayerBar.css`:

```css
/* src/components/sets/SetPlayerBar.css */
/* The playing set, small, above the bottom player. */

.set-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 54px;
  padding: 0 14px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

/* Left empty on purpose: the YouTube webview is laid exactly over this box. */
.set-bar__video {
  flex: 0 0 auto;
  width: 84px;
  height: 47px;
  border-radius: var(--radius-sm);
  background: #000;
}

.set-bar__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 4px 6px;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.set-bar__text:hover .set-bar__now {
  text-decoration: underline;
}

.set-bar__text:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.set-bar__now,
.set-bar__set {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.set-bar__now {
  font-size: var(--text-sm);
}

.set-bar__cue {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.set-bar__set {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.set-bar__controls {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

/* The shared .btn (controls.css), square. */
.set-bar__btn {
  width: 30px;
  height: 30px;
  padding: 0;
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .`: no errors (nothing uses them until Task 4). Commit:

```bash
git add src/lib/setPlayer/SetPlayerEngine.ts src/components/sets/SetPlayerBar.tsx src/components/sets/SetPlayerBar.css
git commit -m "feat(sets): the set player's engine and the bar above the player"
```

---

### Task 4: The player moves to App

**Files:** Modify `src/App.tsx`, `src/components/views/SetsView.tsx`, `src/components/views/SetsView.css`.

- [ ] **Step 1: App** — the engine, the bar above `NowPlayingBar`, a new SetsView per `openSets`, and the delete-folder modal as an overlay

In `src/App.tsx`, replace

```tsx
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { SetsView } from './components/views/SetsView'
```

with

```tsx
import { appDataDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
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

In `src/App.tsx`, replace

```tsx
  /** The open DJ page and where Back goes; null when another view is open. */
  const [djPage, setDjPage] = useState<DjPageState | null>(null)
  /** Search's query, held here so Back from a DJ page shows the same results. */
  const [searchQuery, setSearchQuery] = useState('')
  /** How Sets opens next; the sidebar's Sets opens it plain. */
  const [setsStart, setSetsStart] = useState<SetsStart>(NO_SETS_START)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
```

with

```tsx
  /** The open DJ page and where Back goes; null when another view is open. */
  const [djPage, setDjPage] = useState<DjPageState | null>(null)
  /** Search's query, held here so Back from a DJ page shows the same results. */
  const [searchQuery, setSearchQuery] = useState('')
  /** How Sets opens next; the sidebar's Sets opens it plain. */
  const [setsStart, setSetsStart] = useState<SetsStart>(NO_SETS_START)
  /**
   * Raised by every openSets: SetsView reads its start only when it mounts,
   * so each is a new SetsView — even one asking for the set already shown
   * (the set bar's text, from Sets' library).
   */
  const [setsVisit, setSetsVisit] = useState(0)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null,
  )
  // The filter on the track table on screen (track table spec). Every handler
  // that opens a view clears it, and Home and Search set it as they open All
  // Tracks; an effect on the view key would wipe the filter they set.
```

In `src/App.tsx`, replace

```tsx

  // Sets, arriving on a set or with a DJ's name in the Set tab's box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setDjPage(null)
    setStreamList(null)
    setShowSets(true)
    setShowSearch(false)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
```

with

```tsx

  // Sets, arriving on a set or with a DJ's name in the Set tab's box: Back
  // here, and a DJ page's set cards and Find more. Every other view closes,
  // as with the sidebar's Sets.
  function openSets(start: SetsStart) {
    setSetsStart(start)
    setSetsVisit((visit) => visit + 1)
    setDjPage(null)
    setStreamList(null)
    setShowSets(true)
    setShowSearch(false)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
```

In `src/App.tsx`, replace

```tsx
      defaultValue: currentName,
      action: { kind: 'rename-folder', folderPath, currentName },
    })
  }

  // Delete folder — open confirmation modal with "empty only" / "delete all files" choice
  function handleDeleteFolder(folderPath: string, folderName: string) {
    setDeleteFolderModal({ open: true, folderPath, folderName })
  }

  async function confirmDeleteFolder(deleteFiles: boolean) {
    const { folderPath } = deleteFolderModal
```

with

```tsx
      defaultValue: currentName,
      action: { kind: 'rename-folder', folderPath, currentName },
    })
  }

  // Delete folder — open confirmation modal with "empty only" / "delete all files" choice
  // The delete-folder modal is an overlay (useOverlay): Esc closes it, and
  // the set video steps aside while it is open.
  useOverlay(deleteFolderModal.open, () =>
    setDeleteFolderModal({ open: false, folderPath: '', folderName: '' }),
  )

  function handleDeleteFolder(folderPath: string, folderName: string) {
    setDeleteFolderModal({ open: true, folderPath, folderName })
  }

  async function confirmDeleteFolder(deleteFiles: boolean) {
    const { folderPath } = deleteFolderModal
```

In `src/App.tsx`, replace

```tsx
                  openSets({ openVideoId: videoId, initialQuery: '' })
                }
              />
            ) : showSets ? (
              <SetsView
                // A new start is a new SetsView: it reads these props only when it mounts.
                key={`sets-${setsStart.openVideoId ?? ''}-${setsStart.initialQuery}-${setsStart.tab ?? ''}`}
                onPlayTrack={handlePlayTrack}
                openVideoId={setsStart.openVideoId}
                initialQuery={setsStart.initialQuery}
                initialTab={setsStart.tab}
                onOpenDj={(name, openVideoId) => openDj(name, null, { view: 'sets', openVideoId })}
              />
```

with

```tsx
                  openSets({ openVideoId: videoId, initialQuery: '' })
                }
              />
            ) : showSets ? (
              <SetsView
                // A new start is a new SetsView: it reads these props only when it mounts.
                key={`sets-${setsVisit}`}
                onPlayTrack={handlePlayTrack}
                openVideoId={setsStart.openVideoId}
                initialQuery={setsStart.initialQuery}
                initialTab={setsStart.tab}
                onOpenDj={(name, openVideoId) => openDj(name, null, { view: 'sets', openVideoId })}
              />
```

In `src/App.tsx`, replace

```tsx
        </AnimatePresence>
      </div>
    </>
  )

  const playerEl = (
    <NowPlayingBar
      playlists={playlists}
      onTrackMetaClick={handleScrollToCurrentTrack}
      onAddToPlaylist={async (trackId, playlistId) => {
        try {
          const added = await tauriApi.addTrackToPlaylist(playlistId, trackId)
          await loadPlaylists()
          const playlistName =
            playlists.find((p) => p.id === playlistId)?.name ?? 'playlist'
          if (added) {
            setHeaderNotification(`Added to ${playlistName}`)
          } else {
            setNotification({
              message: `Track is already in ${playlistName}`,
              type: 'warning',
            })
          }
        } catch (err) {
          setNotification({
            message: `Failed to add: ${err instanceof Error ? err.message : String(err)}`,
            type: 'error',
          })
        }
      }}
      onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}
      onGetRecommendations={AI_ENABLED ? handleGetRecommendations : undefined}
    />
  )

  return (
    <>
      <AppShell sidebar={sidebarEl} main={mainEl} player={playerEl} />
```

with

```tsx
        </AnimatePresence>
      </div>
    </>
  )

  const playerEl = (
    <>
      {/* The set playing: its panel follows the set's page or this bar, and
          keeps playing when Sets closes. */}
      <SetPlayerEngine />
      <SetPlayerBar
        onOpenSet={(videoId) => openSets({ openVideoId: videoId, initialQuery: '' })}
      />
      <NowPlayingBar
        playlists={playlists}
        onTrackMetaClick={handleScrollToCurrentTrack}
        onAddToPlaylist={async (trackId, playlistId) => {
          try {
            const added = await tauriApi.addTrackToPlaylist(playlistId, trackId)
            await loadPlaylists()
            const playlistName =
              playlists.find((p) => p.id === playlistId)?.name ?? 'playlist'
            if (added) {
              setHeaderNotification(`Added to ${playlistName}`)
            } else {
              setNotification({
                message: `Track is already in ${playlistName}`,
                type: 'warning',
              })
            }
          } catch (err) {
            setNotification({
              message: `Failed to add: ${err instanceof Error ? err.message : String(err)}`,
              type: 'error',
            })
          }
        }}
        onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}
        onGetRecommendations={AI_ENABLED ? handleGetRecommendations : undefined}
      />
    </>
  )

  return (
    <>
      <AppShell sidebar={sidebarEl} main={mainEl} player={playerEl} />
```

- [ ] **Step 2: SetsView** — its panel, poll, latch, minimise and close-on-leave go; the video band registers as the page box; every ▶ plays through the store

In `src/components/views/SetsView.tsx`, replace

```tsx
import { analyse, msToCue, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type LibraryMatch, type MatchSummary } from '../../lib/tracklist/match'
import { extractDjName, groupByDj } from '../../lib/tracklist/djName'
import { billingParts } from '../../lib/dj/names'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { playerPageUrl, watchUrl } from '../../lib/youtubeWindow'
import { looksLikeAChannel } from '../../lib/channelInput'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { usePlayerStore } from '../../store/playerStore'
import { audioPlayer } from '../../lib/audioPlayer'
import type {
  RawSet,
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
  YtTrackHit,
  SetSearchHit,
  YouTubePanelState,
  ChannelNews,
  ChannelUpload,
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS, YT_PLAYING } from '../../types/youtube'
import './SetsView.css'

type Tab = 'set' | 'library' | 'saved' | 'channels' | 'stats'

/** The escape hatch: the user's own browser, with their account and history. */
function openInBrowser(url: string, cueMs = 0) {
```

with

```tsx
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
  YtTrackHit,
  SetSearchHit,
  ChannelNews,
  ChannelUpload,
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
import './SetsView.css'

type Tab = 'set' | 'library' | 'saved' | 'channels' | 'stats'

/** The escape hatch: the user's own browser, with their account and history. */
function openInBrowser(url: string, cueMs = 0) {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
   */
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([])
  const [grouping, setGrouping] = useState<'dj' | 'recent'>('dj')
  const [playing, setPlaying] = useState<{ videoId: string; url: string; cueMs: number } | null>(
    null,
  )
  /** Collapsed into the bar, still playing. */
  const [mini, setMini] = useState(false)
  /** Which row the player was last sent to, for the bar and for prev/next. */
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /**
   * Where the video is. The panel is a webview of its own and reports back
   * through the companion server, so this is polled rather than observed.
   */
  const [panel, setPanel] = useState<YouTubePanelState | null>(null)

  // --- two players, one pair of ears -----------------------------------
  //
  // The video and the app's own player are separate engines that know nothing
  // about each other, so whichever starts hands the other a pause.

  const isPlayingOwnFile = usePlayerStore((state) => state.isPlaying)
  const setOwnIsPlaying = usePlayerStore((state) => state.setIsPlaying)

  /** Poll the panel while it is open, and only while it is open. */
  useEffect(() => {
    if (!playing) {
      setPanel(null)
      return
    }
    let live = true
    const read = () => {
      tauriApi
        .youtubePanelState()
        .then((state) => {
          if (live) setPanel(state)
        })
        .catch(() => {})
    }
    read()
    const timer = window.setInterval(read, 400)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [playing])

  /**
   * True from the moment the video is asked to stand down until it says it has.
   *
   * The panel's state is read through a poll, and the instruction reaches it
   * through another — so for the best part of a second after "have it" is
   * clicked, the video still reports itself as playing. Without this latch the
   * two rules below fight: the file starts, the stale report says the video is
   * still going, and the file is paused a moment after it began. Which is
   * exactly what happened — the video stopped, the track did not start, and it
   * took a second click.
   */
  const waitingForVideoToStop = useRef(false)

  const videoPlaying = panel?.player_state === YT_PLAYING

  // The pause landed. Whatever the video reports from here is current again.
  useEffect(() => {
    if (!videoPlaying) waitingForVideoToStop.current = false
  }, [videoPlaying])

  // The video started — including from the click inside the panel, which is
  // the one gesture the app cannot make on its own.
  useEffect(() => {
    if (videoPlaying && isPlayingOwnFile && !waitingForVideoToStop.current) {
      audioPlayer.pause()
      setOwnIsPlaying(false)
    }
  }, [videoPlaying, isPlayingOwnFile, setOwnIsPlaying])

  // The other direction: a file of your own started, so the video steps back.
  const wasPlayingOwnFile = useRef(false)
  useEffect(() => {
    const started = isPlayingOwnFile && !wasPlayingOwnFile.current
    wasPlayingOwnFile.current = isPlayingOwnFile
    if (started && playing) {
      // Said before the request goes out, so the rule above is already deaf to
      // the reports still in flight.
      waitingForVideoToStop.current = true
      void tauriApi.pauseYouTubePanel().catch(() => {})
    }
  }, [isPlayingOwnFile, playing])

  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
```

with

```tsx
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

In `src/components/views/SetsView.tsx`, replace

```tsx
      .map((t) => matches.byIndex.get(t.index)?.track)
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])

  // The panel is a second webview laid over the page, so the page has to tell
  // it where to sit and keep telling it whenever the layout moves.
  // Opening is keyed on the video, not the cue: moving inside the same set is a
  // seek, and reloading it would rebuffer for no reason.
  useEffect(() => {
    const el = panelRef.current
    if (!playing || !el) return

    const bounds = () => {
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    }

    const open = async () => {
      // The player page needs a real http origin, which the companion server
      // provides. It is normally already running; start it if it is not.
      let status = await tauriApi.getCompanionStatus()
      if (!status.running || !status.port) status = await tauriApi.startCompanionServer()
      if (!status.port) throw new Error('The local server could not be started')

      const b = bounds()
      await tauriApi.openYouTubePanel(
        playerPageUrl(status.port, playing.videoId, playing.cueMs),
        b.x,
        b.y,
        b.width,
        b.height,
      )
    }

    void open().catch((err) => {
      // If the in-window panel cannot be shown, the browser still can.
      console.error('[Sets] panel failed, falling back to the browser', err)
      openInBrowser(playing.url, playing.cueMs)
      setPlaying(null)
    })

    const sync = () => {
      const next = bounds()
      void tauriApi.setYouTubePanelBounds(next.x, next.y, next.width, next.height).catch(() => {})
    }
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    window.addEventListener('resize', sync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing?.videoId])

  // Moving the panel between the big box and the bar changes its position
  // without changing its size, which no observer reports.
  useEffect(() => {
    const el = panelRef.current
    if (!playing || !el) return
    const r = el.getBoundingClientRect()
    void tauriApi.setYouTubePanelBounds(r.left, r.top, r.width, r.height).catch(() => {})
  }, [mini, playing])

  // Leaving the Sets view must not leave a video playing over another screen.
  useEffect(() => {
    return () => {
      void tauriApi.closeYouTubePanel().catch(() => {})
    }
  }, [])

  // The panel is an overlay: it would sit on top of the library list too.
  useEffect(() => {
    if (tab !== 'set' && playing) {
      setPlaying(null)
      void tauriApi.closeYouTubePanel().catch(() => {})
    }
  }, [tab, playing])

  /** Sends the player to a point in the set, opening it first if need be. */
  function seekTo(videoId: string, url: string, cueMs: number, index: number | null) {
    setPlayingIndex(index)
    if (playing?.videoId === videoId) {
      void tauriApi.seekYouTubePanel(Math.floor(cueMs / 1000)).catch(() => {})
      return
    }
    setPlaying({ videoId, url, cueMs })
  }

  function show(raw: RawSet): TracklistResult {
    shownSets.current++
    const parsed = analyse(raw.video, raw.comments)
    setReanalysed(null)
```

with

```tsx
      .map((t) => matches.byIndex.get(t.index)?.track)
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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
    setLoading(true)
    setError(null)
    setReanalysed(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(result.video.id)
      const parsed = show(raw)
      await storeParsed(raw, parsed)
      refreshLibrary()
      // What it was worth saying plainly, since it just cost something.
      setReanalysed(
        parsed.trackCount === before
          ? `Nothing new — still ${before} ${before === 1 ? 'track' : 'tracks'}.`
```

with

```tsx
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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
   * of keeping the raw fetch.
   */
  async function followEcho(echo: TrackEcho) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(echo.video_id)
      show(raw)
      seekTo(raw.video.id, raw.video.url, echo.cue_ms, null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function openStored(videoId: string) {
```

with

```tsx
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
```

In `src/components/views/SetsView.tsx`, replace

```tsx

  /** Opens the set a search hit came from and jumps to the moment. */
  async function openHit(hit: YtTrackHit) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(hit.video_id)
      const parsed = show(raw)
      const row = parsed.tracks.find((t) => t.cueMs === hit.cue_ms)
      seekTo(raw.video.id, raw.video.url, hit.cue_ms, row?.index ?? null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function removeStored(videoId: string) {
    await tauriApi.deleteYouTubeSet(videoId).catch(() => {})
    if (currentSet?.video.id === videoId) {
      setCurrentSet(null)
      setResult(null)
    }
    refreshLibrary()
```

with

```tsx

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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  /** The library, filed under whoever played each set. */
  const byDj = useMemo(() => groupByDj(sets), [sets])

  /** How many unseen sets the last check turned up, for the tab badge. */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0

  const nowPlaying =
    playingIndex != null ? (result?.tracks.find((t) => t.index === playingIndex) ?? null) : null

  /**
   * The track the playhead is inside, and where that track begins and ends.
   *
   * Taken from the position rather than from what was last clicked: the video
   * runs on into the next track, and a strip that still says the previous one
   * is worse than none.
   */
  const currentTrack = useMemo(() => {
    if (!result || result.untimed || !panel) return null
    const timed = result.tracks.filter((t) => t.cueMs > 0 || t.index === 1)
    if (timed.length === 0) return null

    let index = -1
    for (let i = 0; i < timed.length; i += 1) {
      if (timed[i].cueMs <= panel.position_ms) index = i
      else break
    }
    if (index < 0) return null

    const track = timed[index]
    const next = timed[index + 1]
    // The last track runs to the end of the video; the runtime is the better
    // figure where the panel has reported one.
    const endMs =
      next?.cueMs ?? (panel.duration_ms > 0 ? panel.duration_ms : result.video.durationMs)
    return { track, startMs: track.cueMs, endMs: Math.max(endMs, track.cueMs + 1) }
  }, [result, panel])

  /** Walks to the neighbouring track in the set, in the order it was played. */
  function step(direction: 1 | -1) {
    if (!result || !playing || playingIndex == null) return
    const position = result.tracks.findIndex((t) => t.index === playingIndex)
    const next = result.tracks[position + direction]
    if (!next) return
    seekTo(playing.videoId, playing.url, next.cueMs, next.index)
  }

  function canStep(direction: 1 | -1) {
    if (!result || playingIndex == null) return false
    const position = result.tracks.findIndex((t) => t.index === playingIndex)
    return Boolean(result.tracks[position + direction])
  }

  /** One stored set, whichever way the library is grouped. */
  function StoredSet({ set }: { set: YtSetSummary }) {
    return (
      <div className="sets-stored">
        <button
```

with

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
```

In `src/components/views/SetsView.tsx`, replace

```tsx

  const badge = result ? statusLabel(result) : null
  const unknownCount = result?.tracks.filter((t) => t.isUnknown).length ?? 0

  return (
    <div className="sets-view">
      {playing && tab === 'set' && (
        <div className={`sets-player ${mini ? 'sets-player--mini' : ''}`}>
          <div className="sets-player__bar">
            {/* Collapsed: the video shrinks into the bar and keeps playing —
                only its box moves, so nothing reloads. */}
            {mini && <div className="sets-player__surface--mini" ref={panelRef} />}

            <span className="sets-player__label">
              {mini && nowPlaying ? (
                <>
                  <span className="sets-player__cue">{nowPlaying.cue}</span>{' '}
                  {nowPlaying.artist ? `${nowPlaying.artist} — ${nowPlaying.title}` : nowPlaying.title}
                </>
              ) : (
                (result?.video.title ?? 'YouTube')
              )}
            </span>

            <div className="sets-player__controls">
              {mini && (
                <>
                  <button
                    type="button"
                    className="sets-player__ctrl"
                    onClick={() => step(-1)}
                    disabled={!canStep(-1)}
                    title="Previous track"
                  >
                    <Icon name="SkipBack" size={14} />
                  </button>
                  <button
                    type="button"
                    className="sets-player__ctrl"
                    onClick={() => step(1)}
                    disabled={!canStep(1)}
                    title="Next track"
                  >
                    <Icon name="SkipForward" size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="sets-player__close"
                onClick={() => setMini(!mini)}
              >
                {mini ? (
                  <>
                    <Icon name="Maximize2" size={13} /> video
                  </>
                ) : (
                  <>
                    <Icon name="Minimize2" size={13} /> minimise
                  </>
                )}
              </button>
              <button
                type="button"
                className="sets-player__close"
                onClick={() => {
                  setPlaying(null)
                  setMini(false)
                  setPlayingIndex(null)
                  void tauriApi.closeYouTubePanel().catch(() => {})
                }}
              >
                <Icon name="X" size={14} /> close
              </button>
            </div>
          </div>

          {/* Deliberately empty: the webview covers exactly this box. */}
          {!mini && <div className="sets-player__surface" ref={panelRef} />}

          {!mini && currentTrack && (
            <TrackScrubber
              track={currentTrack.track}
              startMs={currentTrack.startMs}
              endMs={currentTrack.endMs}
              positionMs={panel?.position_ms ?? 0}
              onSeek={(ms) =>
                void tauriApi.seekYouTubePanel(Math.floor(ms / 1000)).catch(() => {})
              }
            />
          )}
        </div>
      )}

      <div className="sets-view__scroll">
```

with

```tsx

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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
                          you have {matches.owned} of {matches.owned + matches.missing}
                        </span>
                      )}
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => seekTo(result.video.id, result.video.url, 0, null)}
                      >
                        <Icon name="Play" size={12} /> play here
                      </button>
                      <button
                        type="button"
                        className="sets-track__cue-btn"
```

with

```tsx
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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
                      marked, and the tracks are searchable and can be saved.
                    </p>
                  ) : (
                    <SetTimeline
                      tracks={result.tracks}
                      durationMs={result.video.durationMs}
                      onSeek={(cueMs) => seekTo(result.video.id, result.video.url, cueMs, null)}
                      positionMs={panel?.position_ms}
                      playingIndex={currentTrack?.track.index ?? null}
                      bpmByIndex={bpmByIndex}
                    />
                  )}

                  {matches && matches.owned + matches.missing > 0 && (
```

with

```tsx
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
```

In `src/components/views/SetsView.tsx`, replace

```tsx
                      return filter === 'have' ? owned : !owned
                    })
                    .map((track) => (
                      <TrackRow
                        key={track.index}
                        track={track}
                        onSeek={(cueMs) =>
                          seekTo(result.video.id, result.video.url, cueMs, track.index)
                        }
                        match={matches?.byIndex.get(track.index)}
                        onPlay={playFromSet}
                        untimed={result.untimed}
                        nowPlaying={currentTrack?.track.index === track.index}
                        echo={echoes.get(track.index)}
                        onFollowEcho={followEcho}
```

with

```tsx
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
```

- [ ] **Step 3: The minimised player's styles go**

In `src/components/views/SetsView.css`, replace

```css

.sets-track__play:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* --- collapsed player --- */

/* Collapsed, the bar belongs at the bottom, under the list. */
.sets-player--mini {
  order: 2;
  border-bottom: none;
  border-top: 1px solid var(--border);
}

.sets-view__scroll {
  order: 1;
}

.sets-player--mini .sets-player__bar {
  gap: 14px;
  padding: 8px 12px;
  background: var(--bg-elevated, var(--bg-secondary));
}

/* The video itself, shrunk — the webview is laid exactly over this box. */
.sets-player__surface--mini {
  flex: 0 0 auto;
  width: 128px;
  height: 72px;
  background: #000;
  border-radius: var(--radius-sm);
}

.sets-player__label {
  flex: 1;
  min-width: 0;
}

.sets-player__cue {
```

with

```css

.sets-track__play:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sets-player__label {
  flex: 1;
  min-width: 0;
}

.sets-player__cue {
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 621 passed (622)`. Commit:

```bash
git add src/App.tsx src/components/views/SetsView.tsx src/components/views/SetsView.css
git commit -m "feat(sets): the set video plays on in a bar above the player when you leave the set"
```

---

### Task 5: Every overlay moves the video aside

**Files:** Modify `src/components/PromptModal.tsx`, `src/components/eq/EQModal.tsx`, `src/components/DuplicatesModal.tsx`, `src/components/ExportPlaylistModal.tsx`, `src/components/SharePlaylistModal.tsx`, `src/components/WhatsNewDialog.tsx`, `src/components/FolderTree.tsx`, `src/components/dj/DjCandidatesMenu.tsx`, `src/components/layout/NowPlayingBar.tsx`, `src/components/layout/SidebarFlyout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/youtube-music/YouTubeMusicLists.tsx`, `src/lib/overlays.ts`.

Each calls `useOverlay(open, close)` before any early return (a component rendered only while open passes `true`). Esc then closes it through the overlay stack, which stops the key before the component's own Escape handler, so it closes once.

- [ ] **Step 1:**

In `src/components/PromptModal.tsx`, replace

```tsx
import { useEffect, useRef, useState } from 'react'
import './PromptModal.css'

interface PromptModalProps {
  open: boolean
  title: string
  defaultValue?: string
```

with

```tsx
import { useEffect, useRef, useState } from 'react'
import { useOverlay } from '../lib/overlays'
import './PromptModal.css'

interface PromptModalProps {
  open: boolean
  title: string
  defaultValue?: string
```

In `src/components/PromptModal.tsx`, replace

```tsx
  defaultValue = '',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(defaultValue) // Reset form field when modal opens — intentional sync reset
      requestAnimationFrame(() => inputRef.current?.focus())
```

with

```tsx
  defaultValue = '',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, onCancel)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(defaultValue) // Reset form field when modal opens — intentional sync reset
      requestAnimationFrame(() => inputRef.current?.focus())
```

In `src/components/eq/EQModal.tsx`, replace

```tsx
import { useEffect, useRef, useState } from 'react'
import './EQModal.css'
import { EQ_BANDS } from '../../lib/eqConstants'
import {
  detectPreset,
  EQ_PRESETS,
  EQ_PRESET_NAMES,
```

with

```tsx
import { useEffect, useRef, useState } from 'react'
import { useOverlay } from '../../lib/overlays'
import './EQModal.css'
import { EQ_BANDS } from '../../lib/eqConstants'
import {
  detectPreset,
  EQ_PRESETS,
  EQ_PRESET_NAMES,
```

In `src/components/eq/EQModal.tsx`, replace

```tsx
export function EQModal({ open, onClose, onEnabledChange }: EQModalProps) {
  const [enabled, setEnabled] = useState(false)
  const [bands, setBands] = useState<number[]>(new Array(EQ_BANDS.length).fill(0))
  const [activePreset, setActivePreset] = useState<EqPresetName | 'custom'>('flat')

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load EQ state when modal opens
  useEffect(() => {
    if (!open) return
    const state = audioPlayer.getEqState()
    setEnabled(state.enabled)
```

with

```tsx
export function EQModal({ open, onClose, onEnabledChange }: EQModalProps) {
  const [enabled, setEnabled] = useState(false)
  const [bands, setBands] = useState<number[]>(new Array(EQ_BANDS.length).fill(0))
  const [activePreset, setActivePreset] = useState<EqPresetName | 'custom'>('flat')

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, onClose)

  // Load EQ state when modal opens
  useEffect(() => {
    if (!open) return
    const state = audioPlayer.getEqState()
    setEnabled(state.enabled)
```

In `src/components/DuplicatesModal.tsx`, replace

```tsx
// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes, lets the user
// pick which tracks to remove, and bulk-deletes the selection.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import type { DuplicateGroup, DuplicateReason, Track } from '../types/track'
import { Icon } from './Icon'
import './DuplicatesModal.css'

interface DuplicatesModalProps {
  onClose: () => void
```

with

```tsx
// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes, lets the user
// pick which tracks to remove, and bulk-deletes the selection.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import type { DuplicateGroup, DuplicateReason, Track } from '../types/track'
import { Icon } from './Icon'
import './DuplicatesModal.css'

interface DuplicatesModalProps {
  onClose: () => void
```

In `src/components/DuplicatesModal.tsx`, replace

```tsx

export function DuplicatesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: DuplicatesModalProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
```

with

```tsx

export function DuplicatesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: DuplicatesModalProps) {
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, onClose)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
```

In `src/components/ExportPlaylistModal.tsx`, replace

```tsx
// optionally renames them and writes an .m3u8. Listens to "export-progress"
// events for a live progress bar.

import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { tauriApi } from '../lib/tauri-api'
import './ExportPlaylistModal.css'

interface ExportProgressEvent {
  current: number
  total: number
  current_file: string
```

with

```tsx
// optionally renames them and writes an .m3u8. Listens to "export-progress"
// events for a live progress bar.

import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import './ExportPlaylistModal.css'

interface ExportProgressEvent {
  current: number
  total: number
  current_file: string
```

In `src/components/ExportPlaylistModal.tsx`, replace

```tsx
  onError,
}: ExportPlaylistModalProps) {
  const [folderName, setFolderName] = useState(playlistName)
  const [renameFiles, setRenameFiles] = useState(false)
  const [exportM3u, setExportM3u] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{
    current: number
    total: number
    currentFile: string
  } | null>(null)
```

with

```tsx
  onError,
}: ExportPlaylistModalProps) {
  const [folderName, setFolderName] = useState(playlistName)
  const [renameFiles, setRenameFiles] = useState(false)
  const [exportM3u, setExportM3u] = useState(false)
  const [running, setRunning] = useState(false)
  // Open, it tells the app (useOverlay): Esc closes it — not while the export
  // runs, as the backdrop and Close do not — and the set video steps aside.
  useOverlay(true, () => {
    if (!running) onClose()
  })
  const [progress, setProgress] = useState<{
    current: number
    total: number
    currentFile: string
  } | null>(null)
```

In `src/components/SharePlaylistModal.tsx`, replace

```tsx
import { useCallback } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from './Icon'
import './SharePlaylistModal.css'

interface SharePlaylistModalProps {
  open: boolean
  playlistId: number
  playlistName: string
```

with

```tsx
import { useCallback } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from './Icon'
import { useOverlay } from '../lib/overlays'
import './SharePlaylistModal.css'

interface SharePlaylistModalProps {
  open: boolean
  playlistId: number
  playlistName: string
```

In `src/components/SharePlaylistModal.tsx`, replace

```tsx
  const shareUrl = `${companionUrl}/?token=${companionToken}&playlist=${playlistId}&name=${encodeURIComponent(playlistName)}`

  const handleOpenLink = useCallback(() => {
    openUrl(shareUrl)
  }, [shareUrl])

  if (!open) return null

  return (
    <div className="share-playlist-backdrop" onClick={onClose}>
      <div
        className="share-playlist-modal"
```

with

```tsx
  const shareUrl = `${companionUrl}/?token=${companionToken}&playlist=${playlistId}&name=${encodeURIComponent(playlistName)}`

  const handleOpenLink = useCallback(() => {
    openUrl(shareUrl)
  }, [shareUrl])

  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, onClose)

  if (!open) return null

  return (
    <div className="share-playlist-backdrop" onClick={onClose}>
      <div
        className="share-playlist-modal"
```

In `src/components/WhatsNewDialog.tsx`, replace

```tsx
import type { VersionChanges } from '../lib/changelog'
import './WhatsNewDialog.css'

/**
 * Renders the `**bold**` the changelog uses to lead a line with its subject.
 *
 * Not a markdown library for one construct — the changelog is ours, and this is
```

with

```tsx
import type { VersionChanges } from '../lib/changelog'
import { useOverlay } from '../lib/overlays'
import './WhatsNewDialog.css'

/**
 * Renders the `**bold**` the changelog uses to lead a line with its subject.
 *
 * Not a markdown library for one construct — the changelog is ours, and this is
```

In `src/components/WhatsNewDialog.tsx`, replace

```tsx
  version: string
  changes: VersionChanges
  onClose: () => void
}

export function WhatsNewDialog({ version, changes, onClose }: WhatsNewDialogProps) {
  const sections = [
    { label: 'New', items: changes.added },
    { label: 'Fixed', items: changes.fixed },
    { label: 'Changes', items: changes.changed },
  ].filter((section) => section.items.length > 0)
```

with

```tsx
  version: string
  changes: VersionChanges
  onClose: () => void
}

export function WhatsNewDialog({ version, changes, onClose }: WhatsNewDialogProps) {
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, onClose)
  const sections = [
    { label: 'New', items: changes.added },
    { label: 'Fixed', items: changes.fixed },
    { label: 'Changes', items: changes.changed },
  ].filter((section) => section.items.length > 0)
```

In `src/components/FolderTree.tsx`, replace

```tsx
import {
  useFolderTreeStore,
  type FolderNodeData,
} from '../store/folderTreeStore'
import { Icon } from './Icon'
import { registerDropOpener } from '../lib/drag/trackDrag'
import './FolderTree.css'

// Dragged tracks land on a playlist (added) or a library folder (moved);
// resting on a closed folder opens it (Interactions spec, Drag and drop). The
// rows carry data-drop-open only while closed, so these only ever open.
registerDropOpener('playlist-folder', (id) =>
```

with

```tsx
import {
  useFolderTreeStore,
  type FolderNodeData,
} from '../store/folderTreeStore'
import { Icon } from './Icon'
import { registerDropOpener } from '../lib/drag/trackDrag'
import { useOverlay } from '../lib/overlays'
import './FolderTree.css'

// Dragged tracks land on a playlist (added) or a library folder (moved);
// resting on a closed folder opens it (Interactions spec, Drag and drop). The
// rows carry data-drop-open only while closed, so these only ever open.
registerDropOpener('playlist-folder', (id) =>
```

In `src/components/FolderTree.tsx`, replace

```tsx
    })
  }

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) closeContextMenu()
    }
    document.addEventListener('click', handleClick)
```

with

```tsx
    })
  }

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(contextMenu.visible, closeContextMenu)

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) closeContextMenu()
    }
    document.addEventListener('click', handleClick)
```

In `src/components/dj/DjCandidatesMenu.tsx`, replace

```tsx
// src/components/dj/DjCandidatesMenu.tsx
// The hero's ⋯ menu: "Not this artist?". Per source, the artists its search
// finds for this name, the one the page uses checked, and "None". The Spotify
// part shows only while Spotify is connected.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { raPick } from '../../lib/dj/page'
import type { ArtistCandidate, DjCandidates, RaPick } from '../../types/dj'

interface DjCandidatesMenuProps {
  candidates: DjCandidates | null
  loading: boolean
```

with

```tsx
// src/components/dj/DjCandidatesMenu.tsx
// The hero's ⋯ menu: "Not this artist?". Per source, the artists its search
// finds for this name, the one the page uses checked, and "None". The Spotify
// part shows only while Spotify is connected.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useOverlay } from '../../lib/overlays'
import { raPick } from '../../lib/dj/page'
import type { ArtistCandidate, DjCandidates, RaPick } from '../../types/dj'

interface DjCandidatesMenuProps {
  candidates: DjCandidates | null
  loading: boolean
```

In `src/components/dj/DjCandidatesMenu.tsx`, replace

```tsx
  onOpen,
  onPickSpotify,
  onPickRa,
}: DjCandidatesMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // A click outside or Escape closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
```

with

```tsx
  onOpen,
  onPickSpotify,
  onPickRa,
}: DjCandidatesMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, () => setOpen(false))

  // A click outside or Escape closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
import { tauriApi } from '../../lib/tauri-api'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

with

```tsx
import { tauriApi } from '../../lib/tauri-api'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { WaveformVisualizer } from '../WaveformVisualizer'
import { EQModal } from '../eq/EQModal'
import { useOverlay } from '../../lib/overlays'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  playlists?: Playlist[]
  onAddToPlaylist?: (trackId: number, playlistId: number) => void
  onTrackMetaClick?: () => void
```

In `src/components/layout/NowPlayingBar.tsx`, replace

```tsx
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  // Close expanded view on Escape key
  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
```

with

```tsx
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  // The playlist menu and the expanded view are overlays (useOverlay): Esc
  // closes them, and the set video steps aside while they are open.
  useOverlay(showPlaylistMenu, () => setShowPlaylistMenu(false))
  useOverlay(expanded, () => setExpanded(false))

  // Close expanded view on Escape key
  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
```

In `src/components/layout/SidebarFlyout.tsx`, replace

```tsx
// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// No transform on it or its ancestors: FolderTree's own menus are
// position: fixed, and a transformed ancestor would misplace them.
import { useEffect, useRef, type ReactNode } from 'react'

interface SidebarFlyoutProps {
  title: string
  top: number
  left: number
  /** The icon that opened it — clicking it again must not count as "outside". */
```

with

```tsx
// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// No transform on it or its ancestors: FolderTree's own menus are
// position: fixed, and a transformed ancestor would misplace them.
import { useEffect, useRef, type ReactNode } from 'react'
import { useOverlay } from '../../lib/overlays'

interface SidebarFlyoutProps {
  title: string
  top: number
  left: number
  /** The icon that opened it — clicking it again must not count as "outside". */
```

In `src/components/layout/SidebarFlyout.tsx`, replace

```tsx
  left,
  anchor,
  onClose,
  children,
}: SidebarFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
```

with

```tsx
  left,
  anchor,
  onClose,
  children,
}: SidebarFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, onClose)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
import type { NavItem, SidebarSpotify, SidebarYouTubeMusic } from './sidebarTypes'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { SpotifyLists } from '../spotify/SpotifyLists'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { YouTubeMusicLists } from '../youtube-music/YouTubeMusicLists'
import { useFolderTreeStore } from '../../store/folderTreeStore'
import {
  COLLAPSED_WIDTH,
  SECTION_LABELS,
  type ActiveView,
  colourFor,
  sectionForView,
```

with

```tsx
import type { NavItem, SidebarSpotify, SidebarYouTubeMusic } from './sidebarTypes'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { SpotifyLists } from '../spotify/SpotifyLists'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { YouTubeMusicLists } from '../youtube-music/YouTubeMusicLists'
import { useFolderTreeStore } from '../../store/folderTreeStore'
import { useOverlay } from '../../lib/overlays'
import {
  COLLAPSED_WIDTH,
  SECTION_LABELS,
  type ActiveView,
  colourFor,
  sectionForView,
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
    x: number
    y: number
    section: SidebarSection
    withCreate: boolean
  } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node))
        setCtxMenu(null)
```

with

```tsx
    x: number
    y: number
    section: SidebarSection
    withCreate: boolean
  } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(ctxMenu !== null, () => setCtxMenu(null))

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node))
        setCtxMenu(null)
```

In `src/components/youtube-music/YouTubeMusicLists.tsx`, replace

```tsx
// The items under YOUTUBE MUSIC: All playlists, Liked music, then each
// playlist in the order it was added, and "+ Add playlist" at the end.
// Right-click a playlist to remove it. Used by the full sidebar and by the
// rail's flyout; styled with FolderTree's rows, like SpotifyLists.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { getErrorMessage } from '../../types/ai'
import {
  ALL_YTM_LISTS,
  LIKED_MUSIC,
  type YtmList,
} from '../../types/youtubeMusic'
```

with

```tsx
// The items under YOUTUBE MUSIC: All playlists, Liked music, then each
// playlist in the order it was added, and "+ Add playlist" at the end.
// Right-click a playlist to remove it. Used by the full sidebar and by the
// rail's flyout; styled with FolderTree's rows, like SpotifyLists.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useOverlay } from '../../lib/overlays'
import { getErrorMessage } from '../../types/ai'
import {
  ALL_YTM_LISTS,
  LIKED_MUSIC,
  type YtmList,
} from '../../types/youtubeMusic'
```

In `src/components/youtube-music/YouTubeMusicLists.tsx`, replace

```tsx
  const [adding, setAdding] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; listId: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(null)
```

with

```tsx
  const [adding, setAdding] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; listId: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(menu !== null, () => setMenu(null))

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(null)
```

In `src/lib/overlays.ts`, replace

```ts
// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. Global shortcuts and the set video read `isOverlayOpen()`
// once their plans build them.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []
```

with

```ts
// src/lib/overlays.ts
// Every open menu, popover and modal registers here (Interactions spec,
// `useOverlay`), so the app knows when one is open, and Esc closes the one
// opened last. The set video reads `isOverlayOpen()` every frame while a set
// plays (it steps off the window); global shortcuts will once their plan
// builds them.
import { useEffect, useRef } from 'react'

type Close = () => void

const stack: { close: Close }[] = []
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 621 passed (622)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/PromptModal.tsx src/components/eq/EQModal.tsx src/components/DuplicatesModal.tsx src/components/ExportPlaylistModal.tsx src/components/SharePlaylistModal.tsx src/components/WhatsNewDialog.tsx src/components/FolderTree.tsx src/components/dj/DjCandidatesMenu.tsx src/components/layout/NowPlayingBar.tsx src/components/layout/SidebarFlyout.tsx src/components/layout/Sidebar.tsx src/components/youtube-music/YouTubeMusicLists.tsx src/lib/overlays.ts
git commit -m "feat(sets): modals, menus and the flyout report themselves, so the set video steps aside"
```

---

### Task 6: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`, replace

```markdown
leaving Sets closes the video goes.

Your own file and the set's video do not play over each other: starting a
file in the bottom player pauses the video, and Play / ▶ on the set pauses the
bottom player.

## Saved tracks

Rows in the set page's style: cue · "artist — title (mix)" over the set's
title (a link that opens that set at the cue) · store links · ♥ (removes it).
**Copy list** at the top right, as today. Empty: "Heart a track in any set to
keep it here."
```

with

```markdown
leaving Sets closes the video goes.

Your own file and the set's video do not play over each other: starting a
file in the bottom player pauses the video, and Play / ▶ on the set pauses the
bottom player.

**As built by plan S1** (the first of four: the player, the set page, the
library and the box, then Following, Saved and Stats):

- `useSetPlayer` is a zustand store (`src/store/setPlayerStore.ts`): the
  playing set (its parsed result and the cue it opened at), the panel's last
  report, and the two boxes; `play`, `seek`, `step`, `togglePause`, `stop`,
  `replaceResult`. `SetPlayerEngine`, a component App mounts once in its
  player area (so a poll re-renders only the bar and the set), opens the
  panel at its box, follows the box every frame, polls every 400ms and keeps
  the two players apart; on start it closes a panel left from before a
  reload. The pure parts — the playhead's track, ⏮ / ⏭'s cue, which box, the
  bounds, what to believe right after a seek, play or pause — live in
  `src/lib/setPlayer/` with their tests.
- The panel takes its orders through the companion server, which keeps one
  instruction (seek, pause or play) that the player page polls every 400ms,
  and a new page takes the first one it sees as its starting point. So a seek
  is never followed by a play (the page's seek plays anyway), and a seek
  asked for before the video has reported its length waits and goes out with
  the first report (the panel opens at it if it is not open yet) — ⏭ right
  after Play set lands. Play and pause are believed for 1.2s while the poll
  catches up, and a set starts as buffering, so the button says Pause at once.
- Every call that creates, moves or closes the webview waits its turn, so ✕
  pressed while the panel is still opening closes it, and two quick sets
  never race for the panel.
- When the app starts the video itself (Play set, ▶, a seek, Play) your file
  stops at once; the latch is only for a click inside the panel, and only
  while the video is playing.
- Until plan S2 builds the set page, the page box is Sets' video band above
  the Set tab (today's player, its minimise gone): ⏮, Pause / Play, ⏭ and
  close over the video, the scrubber under it, shown while the set open in
  the Set tab is the one playing.
- The bar sits in the player area above the bottom player, across the whole
  window, 54px high with an 84×47 video; the toasts stay above it, over the
  main area.
- Off the window means x and y at −10000, keeping the box's size (320×180
  when there is no box), so the video does not reflow.
- Another set closes the panel before the new one opens, which forgets the
  last set's position; until the video reports its length, the store keeps
  the cue it opened at. After a seek, a report more than 2.5s from it is taken
  as stale for 1.5s.
- Every `openSets` is a new SetsView (a visit counter in its key), so the
  bar's text opens the set even from Sets' own library.
- Removing the playing set from the library stops it first; Look again on it
  keeps it playing with the new rows.
- The overlays that report themselves now: `PromptModal`, the delete-folder
  modal, `EQModal`, `DuplicatesModal`, `ExportPlaylistModal` (Esc waits for a
  running export, as its backdrop does), `SharePlaylistModal`,
  `WhatsNewDialog`, the FolderTree menu, `DjCandidatesMenu`, the
  NowPlayingBar's playlist menu and expanded view, `SidebarFlyout`, and two
  the list above missed — the sidebar's colour menu and YouTube Music's list
  menu — besides the shared `Menu`, `Popover` (the Filter and Columns
  popovers) and the TrackTable menus that already did. The hero's ⋯ menu
  comes with plan S2, on the shared `Menu`.
- Left as they are: leaving the set page, the video stays over the fading
  page for App's 200ms view fade; the frame check runs while a set is loaded,
  paused too; a keyboard press on the bar's text or ✕ leaves focus on the
  page, as the bar goes; the old top-right notifications sit under the video
  band on Sets until the Interactions sweep replaces them with toasts.

## Saved tracks

Rows in the set page's style: cue · "artist — title (mix)" over the set's
title (a link that opens that set at the cue) · store links · ♥ (removes it).
**Copy list** at the top right, as today. Empty: "Heart a track in any set to
keep it here."
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-sets-redesign-design.md
git commit -m "docs(spec): Sets S1 as built"
```

---

### Task 7: Check

- [ ] **Step 1:** `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 621 passed (622)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`; `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 459.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Open a set, "play here", and press ⏭ at once: it lands on the next track; ⏭ twice quickly lands two tracks on; ▶ on a row of the playing set jumps there; let it run into the next track: ⏮ / ⏭ and the scrubber follow it.
  - Press "play here" and close it at once: no video is left playing.
  - Collapse the sidebar and resize the window: the video stays on its band.
  - Right-click a track in All Tracks, a sidebar section header (colour menu), a YouTube Music list; open the EQ, a New playlist prompt, the sidebar's flyout (collapsed rail, hover an icon): the video steps aside and comes back when they close.
  - Switch to the Library tab, go Home, open a playlist: the video keeps playing in the bar above the player; the bar's ⏮ ⏸ ⏭ work; its text opens the set again with the video back in the band; ✕ stops it.
  - Play a file of your own: the video pauses; press Play on the bar: the file pauses.
  - Open another set while one plays: the playing one stays in the bar until you press "play here" on the new one.
  - If the panel cannot open, the set opens in the browser, as before.
