# Spotify Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a Spotify account. Sync Liked Songs and every playlist. Show each Spotify track as Owned / Maybe / Missing against the RecoDeck library, with Copy, play-on-Spotify and SelectedRecs actions, and a count of new, missing likes in the sidebar.

**Architecture:**
- **Rust** stores the Spotify data in four tables (migration 015), with the sync rules in `db/spotify.rs`.
- **Rust** talks to Spotify in `external/spotify.rs` (paging, parsing, the incremental sync) and `external/spotify_auth.rs` (PKCE, the token endpoint, the loopback listener).
- **Rust** exposes commands in `commands/spotify.rs`, plus a loop that syncs every 10 minutes and emits `spotify-synced`.
- **The frontend** works out ownership, using the tracklist matcher (`lib/tracklist/match.ts`) through pure modules in `src/lib/spotify/`.
- **One hook**, `useSpotify`, called from `App.tsx`, feeds the sidebar section, the icon rail and `SpotifyView`.

**Tech Stack:**
- Rust: Tauri 2, rusqlite 0.31, reqwest 0.12, axum 0.8, sha2, rand 0.8, tokio
- Frontend: React 19 + TypeScript, Vitest (jsdom, **no** React Testing Library — do not add it), lucide-react via `src/components/Icon.tsx`

**Spec:** `docs/superpowers/specs/2026-10-03-spotify-section-design.md`. Read it first. The mockup `2026-10-03-spotify-section-mockup.html` sits in the same folder: open it in a browser.

**Builds on:** the collapsible sidebar (`docs/superpowers/plans/2026-10-03-sidebar-collapse.md`), finished on `feat/sidebar-collapse`. Task 17 is written against that branch at `6b98874`. What this plan relies on:
- `src/lib/sidebarPrefs.ts`:
  - `SidebarSection` including `'spotify'` (default colour `#1ed760`, label in `SECTION_LABELS`)
  - `ActiveView` and `sectionForView`
- `src/components/layout/sidebarTypes.ts`: `NavItem`, and `FlyoutSection`, which "a section joins by adding its name"
- `Sidebar.tsx`:
  - `Section` with a right-aligned `trailing` slot
  - `openColourMenu(section)` for right-click colours
  - `iconStyle(section)` for the active colour
- `SidebarRail.tsx`: flyouts, and a `sectionButton(section, label, icon, badge?)` that already draws a 9px `.sidebar-rail__badge`
- `App.tsx`: `dbReady`, true once `initDatabase` succeeded

**Checked:** every code block below was applied, as written, to a copy of `6b98874`, outside the repo. `tsc`, `eslint`, `vitest`, `cargo test` and `cargo clippy` all pass, apart from the pre-existing warnings named in "Rules". If a step's anchor text is not found, the sidebar branch changed after that. Apply the step's intent and say so in the report.

**Rules for every task:**
- The working tree has unrelated user changes, including `src-tauri/Cargo.lock` and `.claude/*`. **Never** `git add -A` or `git add .`. Add only the files the task names.
- This plan adds **no** crates and **no** npm packages. If `Cargo.lock` or `package-lock.json` changes, something went wrong.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Every commit block below already does this.
- `tsconfig` has `noUnusedLocals` / `noUnusedParameters`. Each task only declares what it uses.
- eslint has `eslint-plugin-react-hooks` v7. Never read or write a ref during render. Never call `setState` synchronously in an effect body (inside a `.then`, a timer or an event callback is fine). Never call `Date.now()` during render; use `useNow` (Task 17).
- `npx eslint src` already reports 10 errors and 13 warnings on the base branch. Some sit in files this plan changes:
  - `App.tsx`: an unused `eslint-disable` directive and the `initializeApp` exhaustive-deps warning, near the top of `AppContent` (warnings)
  - `layout/NowPlayingBar.tsx`: two exhaustive-deps warnings
  - `SettingsView.tsx` line 90 (error, `no-empty-object-type`)
  - `lib/tracklist/text.ts` line 68 (error, `no-irregular-whitespace`)

  Leave those as they are. Every other file this plan creates or changes must lint clean.

---

## Verified API details (checked against developer.spotify.com, 2026-10-03)

Where these differ from what the spec assumed, the tasks follow the API and keep the spec's product behaviour.

1. **The playlist-items endpoint was renamed in February 2026.**
   - It is now `GET /v1/playlists/{id}/items`. The old `/tracks` is removed.
   - Each item carries the track under **`item`**. `track` remains only as a deprecated alias.
   - The playlist object's `tracks{href,total}` is now **`items{href,total}`**.
   - The parser reads `item`, then `track`, and `items.total`, then `tracks.total` (Task 8).
   - `limit` is at most **50** on every endpoint used here.
2. **Development-mode apps (every personal app) may read only the contents of playlists the user owns or collaborates on.**
   - Followed playlists owned by someone else still show up in `/me/playlists`, but `/items` answers **403**.
   - Editorial and algorithmic playlists have been refused to new apps since Nov 2024, reportedly with 404.
   - So "playlists Spotify would not share" (spec: listed by name in Settings) now covers *every followed playlist the user does not own*, not only editorial ones. Both 403 and 404 count as refused.
   - A refused playlist is remembered with its `snapshot_id` and not asked for again until that changes (Task 9).
3. **Development-mode limits, February 2026:**
   - The app owner needs **Premium**.
   - At most **5 users**, and each must be added under the app's **User Management** in the dashboard. A token for anyone else gets 403.
   - Settings → Spotify spells this out in its steps (Task 16), and a 403 on `/me` during connect is translated into that advice (Task 13).
4. **Loopback redirects:**
   - They must use an explicit IP (`127.0.0.1` or `[::1]`). `localhost` is refused. `http` is allowed for loopback only.
   - The URI must match a registered one exactly.
   - Dynamic ports **are** allowed for loopback (register the URI without a port). The spec's fixed `http://127.0.0.1:47816/callback` is kept, as the spec says. It is the simpler instruction.
5. **PKCE:**
   - Authorize URL: `https://accounts.spotify.com/authorize`, with `response_type=code`, `client_id`, `redirect_uri`, `code_challenge_method=S256`, `code_challenge`, `state` and `scope` (space-separated).
   - The verifier is 43–128 characters from `[A-Za-z0-9-._~]`.
   - Token endpoint: `POST https://accounts.spotify.com/api/token`, form-encoded.
     - Exchanging the code takes `grant_type=authorization_code, code, redirect_uri, client_id, code_verifier`.
     - Refreshing takes `grant_type=refresh_token, refresh_token, client_id`.
   - A refresh **may** return a new `refresh_token`, which replaces the stored one. If it returns none, the old one stays.
   - A revoked or expired refresh token returns `{"error":"invalid_grant"}`. That triggers the Reconnect bar.
6. **Liked Songs:** `GET /v1/me/tracks` (`limit` ≤ 50, `offset`, paging with `total`/`next`). It was not renamed; only the write endpoints moved to `/me/library`.
   - Newest-first order is observed everywhere but not documented. The `total` check (spec) is the safety net if that ever changes.
7. **Profile:** `GET /v1/me` has a `display_name` that may be null. The plan falls back to `id`.
8. **Start playback:** `PUT /v1/me/player/play` with body `{"uris":["spotify:track:<id>"]}` returns **204** on success.
   - Errors look like `{"error":{"status":…,"message":…,"reason":…}}`.
   - `NO_ACTIVE_DEVICE` and `PREMIUM_REQUIRED` are documented reasons, but their HTTP statuses (404 and 403) are known only from community reports. The fallback triggers on either reason **or** on a bare 403/404 (Task 8, `should_open_app`).
9. **Rate limits:** 429 comes with `Retry-After` in seconds, over a rolling 30-second window.
   - Since July 2026, development-mode quotas are counted per developer account, and a quota 429 carries `"reason":"QUOTA_EXCEEDED"`. Its `Retry-After` can be hours.
   - The client waits out a `Retry-After` of up to **60 s** and then continues, as the spec says. A longer one fails this sync with a message, and the next 10-minute run tries again (Task 10).
10. **`spotify:` URIs cannot be opened from the webview.** `opener:default` allows only `http(s)`, `mailto` and `tel`. The play fallback therefore opens `spotify:track:<id>` from Rust with `tauri_plugin_opener::OpenerExt`, which is not scope-checked. No capability change is needed.

## Decisions where the spec left room

- **The library is not held in `App.tsx`.** App only holds the tracks of the view on screen. `useSpotify` loads the whole library with `tauriApi.getAllTracks()`, as `SetsView` does. It reloads when the library changes (`library-changed`, or the total track count changes), and only while Spotify is connected.
- **Matching speed:** `indexLibrary` now tokenises each name once (`titleTokens`, `artistTokens`), and `matchOne` compares token sets. The Spotify side also keeps a title-token → entries map and passes `matchOne` only the library entries that share at least one title word. That gives exactly the same result, because a title match needs a shared word.
- **`track_count` in `spotify_lists` is the total Spotify last reported**, skipped items included. The Liked Songs check compares Spotify's new `total` with the stored total plus the new likes read. Counts on screen are the stored rows.
- **Copy text drops `(feat. X)`.** Spotify lists the featured artist among the artists, so `Discoplex, Izaac Moses, Sheree Hicks - I Need A Rush (Extended Mix)`. The SelectedRecs text is the same without the mix.
- **The `spotify-synced` payload gains `needsReconnect`:** `{ changed, lastSyncedAt, error, needsReconnect }`. The Reconnect bar needs to know the failure was a revoked token.
- **Maybe reason wording:** "same title" or "similar title", then "same artist" or "artist partly matches".
- **The new-likes number on list items** shows on Liked Songs and on playlists that received the tracks, but not on "All playlists". The header carries the distinct total.
- **The Spotify icon** is coloured only while a Spotify list is open, like every other section. That follows the later sidebar-collapse spec, not the always-green mockup.
- **The loop does nothing while the account needs reconnecting.** It would only fail again every 10 minutes.
- **The play fallback goes a little wider than the spec's two cases.** It covers no active device and no Premium (spec), and also any failure to get a token: no account, revoked, or offline for the token call. Opening the Spotify app is still the useful answer there, and it shows no error, as the spec asks. Other playback errors (e.g. a 500) are returned and ignored by the button.
- **A different Client ID signs the account out** (the refresh token belongs to the old app) but keeps the synced rows. If the account that connects next has a different name, those rows are cleared first. Otherwise that account's whole library would read as new.
- **A 401 is retried once with a fresh token**, both in a sync and on play. When the app is revoked at spotify.com the access token dies before it expires. Without the retry, the Reconnect bar would wait up to an hour.
- **The sidebar shows no number until the library has loaded once.** Before that, every track would count as Missing.
- **Lists are rendered without virtualisation.** About 1,000 rows of 32px is fine, and the Maybe sub-rows would complicate a virtualiser.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/tracklist/text.ts` | modify | `containmentOf` on pre-split token sets. |
| `src/lib/tracklist/match.ts` | modify | Tokenise the library once. `LibraryMatch` gains `titleScore` / `artistScore`. Export `Indexed`. |
| `src/lib/tracklist/match.test.ts` | modify | Tests for the new fields. |
| `src/types/spotify.ts` | create | IPC shapes (camelCase) and the `liked` / `all` ids. |
| `src/lib/spotify/title.ts` (+ `.test.ts`) | create | Spotify title → title / mix / bare. Matcher input. Copy and SelectedRecs text. |
| `src/lib/spotify/ownership.ts` (+ `.test.ts`) | create | Owned / Maybe / Missing with verdicts, plus the Maybe reason. |
| `src/lib/spotify/newness.ts` (+ `.test.ts`) | create | "New and not owned" counts: distinct total and per list. |
| `src/lib/spotify/rows.ts` (+ `.test.ts`) | create | Rows of a list (All playlists deduplicated), filters, counts, date formatting. |
| `src-tauri/src/db/migrations/015_spotify.sql` | create | Four tables. |
| `src-tauri/src/db/spotify.rs` | create | Storage: library dump, mark opened, verdicts, clear, baseline, applying a sync (the "new" rules). |
| `src-tauri/src/db/mod.rs` | modify | `pub mod spotify;` and run migration 015. |
| `src-tauri/src/external/spotify.rs` | create | Errors, parsing, `SpotifyApi` trait, `fetch_changes`, `LiveApi` (429s), play, profile. |
| `src-tauri/src/external/spotify_auth.rs` | create | PKCE, authorize URL, token endpoint, loopback listener. |
| `src-tauri/src/external/mod.rs` | modify | Declare both modules. |
| `src-tauri/src/error.rs` | modify | `SpotifyNotConnected`, `SpotifyReconnect`, `Spotify(String)`. |
| `src-tauri/src/commands/spotify.rs` | create | `SpotifyState`, tokens, `run_sync`, loop + event, commands. |
| `src-tauri/src/commands/youtube.rs` | modify | `with_db` becomes `pub(crate)` so Spotify reuses it. |
| `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` | modify | Register module, state, loop, commands. |
| `src/lib/tauri-api.ts`, `src/types/ai.ts` | modify | Command wrappers, error kinds. |
| `src/components/spotify/useSpotify.ts` | create | The hook: status, data, library, ownership, counts, actions. |
| `src/components/spotify/useNow.ts` | create | A clock for "synced 2 min ago" that keeps render pure. |
| `src/components/spotify/SpotifyGlyph.tsx` | create | The Spotify mark (lucide has no brand icons). |
| `src/components/spotify/SpotifyLists.tsx` | create | The list items, used in the sidebar section and the rail flyout. |
| `src/components/settings/SpotifySection.tsx`, `src/components/views/SettingsView.tsx` | create / modify | Settings → Spotify. |
| `src/lib/sidebarPrefs.ts` (+ test) | modify | `ActiveView` gains `'spotify'`. |
| `src/components/layout/sidebarTypes.ts`, `Sidebar.tsx`, `SidebarRail.tsx`, `Sidebar.css` | modify | `FlyoutSection` gains Spotify. The SPOTIFY section, and the rail icon with its number and flyout. |
| `src/components/views/SpotifyView.tsx`, `SpotifyView.css` | create | Header, toolbar, table, footer. |
| `src/components/spotify/SpotifyRowActions.tsx` | create | Status cell: play, SelectedRecs, Copy, Yes/No. |
| `src/App.tsx` | modify | Hook, navigation state, sidebar prop, rendering the view. |

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Start the Spotify work on top of the finished sidebar**

`feat/spotify-section` holds the specs and is an ancestor of `feat/sidebar-collapse`. Fast-forward it:

```bash
git switch feat/spotify-section
git merge --ff-only feat/sidebar-collapse
```

Expected: `Fast-forward`. If it refuses (someone committed to `feat/spotify-section` since), stop and ask. Do not merge or rebase on your own.

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass, no type errors.

Run: `cd src-tauri && cargo test 2>&1 | tail -5`
Expected: `test result: ok.` for every test binary.

---

### Task 1: Tokenise the library once; matches report title and artist agreement

**Files:**
- Modify: `src/lib/tracklist/text.ts` (the `containment` function)
- Modify: `src/lib/tracklist/match.ts`
- Test: `src/lib/tracklist/match.test.ts`

Today `containment` splits both strings into words on every call. The Sets view compares ~40 rows, so that never mattered. Spotify compares ~1,000 tracks against ~8,500 files at start-up, so the library's words are split once, when it is indexed.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/tracklist/match.test.ts`, and change its import line to the one shown)

```ts
import { indexLibrary, matchOne, matchTracklist, type LibraryTrack } from './match'

describe('how sure a match is', () => {
  it('reports a full agreement on both names', () => {
    const shelf = [lib(30, 'Butch', 'Come Get Up (Extended Mix)')]
    const match = matchOne(parsed(1, 'Butch', 'Come Get Up'), indexLibrary(shelf))
    expect(match).toMatchObject({ titleScore: 1, artistScore: 1, strong: true })
  })

  it('reports an artist that only partly agrees', () => {
    // Two of the three credited names are on the file.
    const shelf = [lib(31, 'Moreno, Prieto, Ortega, Lopez', '300 Cash')]
    const match = matchOne(parsed(1, 'Moreno & Prieto, Sortech', '300 Cash'), indexLibrary(shelf))
    expect(match?.titleScore).toBe(1)
    expect(match?.artistScore).toBeCloseTo(2 / 3)
    expect(match?.strong).toBe(false)
  })

  it('splits the library into words once, when it is indexed', () => {
    const [entry] = indexLibrary([lib(32, 'Clive & Deepower', 'Little Girl (Original Mix)')])
    expect([...entry.titleTokens]).toEqual(['little', 'girl'])
    expect([...entry.artistTokens]).toEqual(['clive', 'deepower'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/tracklist/match.test.ts`
Expected: FAIL. The new tests see `titleScore` undefined and `titleTokens` undefined. The old tests still pass.

- [ ] **Step 3: `containmentOf` in `text.ts`**

Replace the existing `containment` function with:

```ts
/**
 * `containment` on names already split into words. A loop that compares one
 * name against thousands splits each name once and calls this.
 */
export function containmentOf(A: Set<string>, B: Set<string>): number {
  if (!A.size || !B.size) return 0
  let hits = 0
  for (const token of A) if (B.has(token)) hits += 1
  return hits / Math.min(A.size, B.size)
}

export function containment(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return containmentOf(tokenSet(a), tokenSet(b))
}
```

- [ ] **Step 4: `match.ts` — the index carries words, the match carries both scores**

Change the import to:

```ts
import { containment, containmentOf, normalise, splitArtistTitle, tokenSet } from './text'
```

Replace `LibraryMatch` with:

```ts
export interface LibraryMatch {
  track: LibraryTrack
  /** 0-2: title agreement plus artist agreement. */
  score: number
  /** 0-1: how fully the titles agree. */
  titleScore: number
  /** 0-1: how fully the artists agree. Under 0.8 the match is not strong. */
  artistScore: number
  /** Both names line up cleanly, not just a containment pass. */
  strong: boolean
}
```

Replace `interface Indexed { … }` with an exported one:

```ts
export interface Indexed {
  track: LibraryTrack
  titleNorm: string | null
  artistNorm: string | null
  /** "extended mix", "afterlife mix" — whatever the tag calls this version. */
  versionNorm: string | null
  /** The names split into words once, here, rather than on every comparison. */
  titleTokens: Set<string>
  artistTokens: Set<string>
}
```

Replace `titleAgreement` with:

```ts
/** Title agreement, or null when the two are not the same record. */
function titleAgreement(A: Set<string>, B: Set<string>): number | null {
  if (!A.size || !B.size) return null

  const score = containmentOf(A, B)
  if (score < TITLE_THRESHOLD) return null

  const ratio = Math.min(A.size, B.size) / Math.max(A.size, B.size)
  if (ratio < MIN_SIZE_RATIO) return null

  return score
}
```

Replace the body of `indexLibrary` with:

```ts
  return library.map((track) => {
    const credits = creditsOf(track)
    const titleNorm = normalise(credits.title)
    const artistNorm = normalise(credits.artist)
    return {
      track,
      titleNorm,
      artistNorm,
      versionNorm: versionOf(track.title),
      titleTokens: tokenSet(titleNorm),
      artistTokens: tokenSet(artistNorm),
    }
  })
```

In `matchOne`, replace everything from `let best: LibraryMatch | null = null` to the end of the `for` loop with:

```ts
  const formTokens = titleForms.map((form) => tokenSet(form))
  const artistTokens = tokenSet(parsedArtist)

  let best: LibraryMatch | null = null

  for (const entry of indexed) {
    if (!entry.titleNorm || !entry.artistNorm) continue

    // When both sides name a version, they have to be the same version. When
    // only one does, the title still decides — a tracklist naming the remix
    // while the tag says only "Horny" is the same record written two ways.
    if (parsedVersion && entry.versionNorm) {
      if (containment(parsedVersion, entry.versionNorm) < MIN_VERSION_MATCH) continue
    }

    let titleScore: number | null = null
    for (const tokens of formTokens) {
      const score = titleAgreement(tokens, entry.titleTokens)
      if (score !== null && (titleScore === null || score > titleScore)) titleScore = score
    }
    if (titleScore === null) continue

    const artistScore = containmentOf(artistTokens, entry.artistTokens)
    if (artistScore < ARTIST_THRESHOLD) continue

    const score = titleScore + artistScore
    if (!best || score > best.score) {
      best = { track: entry.track, score, titleScore, artistScore, strong: artistScore >= 0.8 }
    }
  }
```

(`return best` after the loop is unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tracklist`
Expected: PASS. All tracklist tests, old and the 3 new ones, pass. The old ones prove the scores did not move.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. `SetsView.tsx` only reads `LibraryMatch`, never builds one.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tracklist/text.ts src/lib/tracklist/match.ts src/lib/tracklist/match.test.ts
git commit -m "perf(tracklist): split library names into words once, and report title and artist agreement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Spotify types, and reading a Spotify title

**Files:**
- Create: `src/types/spotify.ts`
- Create: `src/lib/spotify/title.ts`
- Test: `src/lib/spotify/title.test.ts`

- [ ] **Step 1: The IPC types** (no test; the Rust side in Tasks 6–13 serialises exactly these, camelCase)

```ts
// src/types/spotify.ts
// The Spotify section's shapes over IPC. The Rust DTOs are camelCase so these
// read the same as the `spotify-synced` event the spec describes.

/** Liked Songs' id in `spotify_lists`. Playlist ids are 22-character base62, so it cannot collide. */
export const LIKED = 'liked'
/** "All playlists" — never stored; it is every list at once. */
export const ALL_LISTS = 'all'

export interface SpotifyList {
  /** `liked`, or a Spotify playlist id. */
  id: string
  name: string
  /** Liked Songs 0, then playlists in Spotify's order. */
  position: number
  /** The total Spotify last reported, skipped items included. */
  trackCount: number
  /** Unix ms. A pair first seen later than this is new in this list. */
  lastOpenedAt: number
}

export interface SpotifyTrack {
  spotifyId: string
  /** Spotify's name, e.g. "Little Girl - Original Mix". */
  title: string
  /** Display string: "Moreno & Prieto, Sortech". */
  artists: string
  album: string | null
  durationMs: number | null
}

export interface SpotifyEntry {
  listId: string
  spotifyId: string
  /** Spotify's ISO time of the like/add, or null when it has none. */
  addedAt: string | null
  /** Unix ms of the sync that first stored this pair. */
  firstSeenAt: number
}

export type Verdict = 'yes' | 'no'

export interface SpotifyVerdict {
  spotifyId: string
  libraryTrackId: number
  verdict: Verdict
}

export interface SpotifyLibrary {
  lists: SpotifyList[]
  tracks: SpotifyTrack[]
  entries: SpotifyEntry[]
  verdicts: SpotifyVerdict[]
}

export interface SpotifyStatus {
  clientId: string | null
  connected: boolean
  accountName: string | null
  /** The refresh token was revoked or expired: show "Reconnect Spotify". */
  needsReconnect: boolean
  /** Unix ms of the last successful sync. */
  lastSyncedAt: number | null
  /** Why the last sync failed, or null when it worked. */
  lastError: string | null
  /** Names of the playlists Spotify would not share. */
  refused: string[]
}

/** Payload of the `spotify-synced` event, sent after every sync. */
export interface SpotifySynced {
  changed: boolean
  lastSyncedAt: number | null
  error: string | null
  needsReconnect: boolean
}

export const SPOTIFY_SYNCED_EVENT = 'spotify-synced'

export type PlayOutcome = 'played' | 'openedApp'
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/spotify/title.test.ts
import { describe, expect, it } from 'vitest'
import { copyText, selectedRecsUrl, splitSpotifyTitle, toParsed } from './title'
import type { SpotifyTrack } from '../../types/spotify'

function track(title: string, artists: string): SpotifyTrack {
  return { spotifyId: 'id', title, artists, album: null, durationMs: null }
}

describe('reading a Spotify title', () => {
  it('takes the version from after the dash', () => {
    expect(splitSpotifyTitle('Little Girl - Original Mix')).toEqual({
      title: 'Little Girl',
      mix: 'Original Mix',
      bare: 'Little Girl',
    })
  })

  it('accepts an en dash', () => {
    expect(splitSpotifyTitle('Tell You – Dub').mix).toBe('Dub')
  })

  it('keeps the featured artist in the title, and leaves it out of the bare title', () => {
    expect(splitSpotifyTitle('I Need A Rush (feat. Sheree Hicks) - Extended Mix')).toEqual({
      title: 'I Need A Rush (feat. Sheree Hicks)',
      mix: 'Extended Mix',
      bare: 'I Need A Rush',
    })
  })

  it('reads a version some labels put in brackets', () => {
    expect(splitSpotifyTitle('Kids (Extended Mix)')).toEqual({
      title: 'Kids',
      mix: 'Extended Mix',
      bare: 'Kids',
    })
  })

  it('leaves a dash that is part of the title alone', () => {
    expect(splitSpotifyTitle('Love - Me')).toEqual({ title: 'Love - Me', mix: null, bare: 'Love - Me' })
  })

  it('takes only the last dash', () => {
    expect(splitSpotifyTitle('Love - Me - Dub')).toEqual({ title: 'Love - Me', mix: 'Dub', bare: 'Love - Me' })
  })

  it('keeps a hyphenated version whole', () => {
    expect(splitSpotifyTitle('Control - Re-Edit').mix).toBe('Re-Edit')
  })

  it('leaves a plain title as it is', () => {
    expect(splitSpotifyTitle('300 Cash')).toEqual({ title: '300 Cash', mix: null, bare: '300 Cash' })
  })
})

describe('the shape the library matcher reads', () => {
  it('matches on the bare title, and keeps the version and the featured artist in titleNorm', () => {
    expect(
      toParsed(track('I Need A Rush (feat. Sheree Hicks) - Extended Mix', 'Discoplex, Izaac Moses, Sheree Hicks')),
    ).toEqual({
      artist: 'Discoplex, Izaac Moses, Sheree Hicks',
      title: 'I Need A Rush',
      mix: 'Extended Mix',
      artistNorm: 'discoplex izaac moses sheree hicks',
      titleNorm: 'i need a rush sheree hicks extended mix',
    })
  })

  it('has no artist when Spotify gives none', () => {
    expect(toParsed(track('Untitled', '')).artist).toBeNull()
  })
})

describe('what Copy and SelectedRecs get', () => {
  it('copies artists, title and the mix', () => {
    expect(copyText(track('Little Girl - Original Mix', 'Clive, Deepower'))).toBe(
      'Clive, Deepower - Little Girl (Original Mix)',
    )
  })

  it('copies a title with no version as it is', () => {
    expect(copyText(track('300 Cash', 'Moreno & Prieto, Sortech'))).toBe('Moreno & Prieto, Sortech - 300 Cash')
  })

  it('leaves out "(feat. …)" — Spotify already lists the featured artist among the artists', () => {
    expect(
      copyText(track('I Need A Rush (feat. Sheree Hicks) - Extended Mix', 'Discoplex, Izaac Moses, Sheree Hicks')),
    ).toBe('Discoplex, Izaac Moses, Sheree Hicks - I Need A Rush (Extended Mix)')
  })

  it('searches SelectedRecs for the same text without the mix', () => {
    expect(selectedRecsUrl(track('300 Cash - Extended Mix', 'Moreno & Prieto, Sortech'))).toBe(
      'https://srv.selectedrecs.com/#/search?text=Moreno%20%26%20Prieto%2C%20Sortech%20-%20300%20Cash',
    )
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/spotify/title.test.ts`
Expected: FAIL — `Failed to resolve import "./title"`.

- [ ] **Step 4: Implement**

```ts
// src/lib/spotify/title.ts
/**
 * Spotify titles, put into the shape the library matcher and the stores use.
 *
 * Spotify writes the version after a dash — "Little Girl - Original Mix",
 * "Come Get Up - Extended Mix" — where a tag or a tracklist puts it in
 * brackets. Read as part of the title, the version would stop a remix from
 * being told apart from the extended mix, and Copy would search a store for
 * the wrong thing.
 */
import { normalise } from '../tracklist/text'
import type { Track } from '../tracklist/types'
import type { SpotifyTrack } from '../../types/spotify'

/** Words that make a suffix a version rather than part of the title. */
const VERSION_WORDS =
  /\b(remix|mix|edit|version|bootleg|dub|rework|vip|remaster|remastered|instrumental|acapella|acappella|live|rerub|reprise)\b/i

/** "… - Extended Mix": the last spaced dash, so "Love - Me - Dub" keeps "Love - Me". */
const DASH_SUFFIX = /^(.*\S)\s+[-–—]\s+((?:(?!\s[-–—]\s).)+)$/

/** "… (Extended Mix)" / "… [Dub]" at the end, the way some labels write it. */
const BRACKET_SUFFIX = /^(.*\S)\s*[([]([^()[\]]+)[)\]]$/

/** "(feat. X)", "[ft. X]", "(with X)" anywhere in the title. */
const FEAT = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]+[)\]]/i

export interface SpotifyTitle {
  /** Without the version: "I Need A Rush (feat. Sheree Hicks)". */
  title: string
  /** "Extended Mix", or null. */
  mix: string | null
  /** Without the version or the featured artist: "I Need A Rush". */
  bare: string
}

export function splitSpotifyTitle(name: string): SpotifyTitle {
  let title = name.replace(/\s+/g, ' ').trim()
  let mix: string | null = null

  const dash = DASH_SUFFIX.exec(title)
  if (dash && VERSION_WORDS.test(dash[2])) {
    title = dash[1].trim()
    mix = dash[2].trim()
  } else {
    const bracket = BRACKET_SUFFIX.exec(title)
    if (bracket && VERSION_WORDS.test(bracket[2])) {
      title = bracket[1].trim()
      mix = bracket[2].trim()
    }
  }

  const bare = title.replace(FEAT, '').trim() || title
  return { title, mix, bare }
}

/**
 * What `matchOne` reads, built the way the tracklist parser builds a row:
 * the title to match on is the bare one, and `titleNorm` carries the
 * featured artist and the version — so both spellings are tried.
 */
export function toParsed(
  track: SpotifyTrack,
): Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'> {
  const { title, mix, bare } = splitSpotifyTitle(track.title)
  return {
    artist: track.artists || null,
    title: bare,
    mix,
    artistNorm: normalise(track.artists),
    titleNorm: normalise([title, mix].filter(Boolean).join(' ')),
  }
}

/**
 * "Artist(s) - Title (Mix)". The mix is kept: the version is what matters when
 * searching a store. "(feat. X)" is not: Spotify already lists X as an artist.
 */
export function copyText(track: SpotifyTrack): string {
  const { bare, mix } = splitSpotifyTitle(track.title)
  const name = mix ? `${bare} (${mix})` : bare
  return track.artists ? `${track.artists} - ${name}` : name
}

const SELECTED_RECS_SEARCH = 'https://srv.selectedrecs.com/#/search?text='

/**
 * The same text as Copy, without the mix: the store lists every version of a
 * release, and the mix only narrows the search to nothing.
 */
export function selectedRecsUrl(track: SpotifyTrack): string {
  const { bare } = splitSpotifyTitle(track.title)
  const text = track.artists ? `${track.artists} - ${bare}` : bare
  return SELECTED_RECS_SEARCH + encodeURIComponent(text)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify/title.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/spotify.ts src/lib/spotify/title.ts src/lib/spotify/title.test.ts
git commit -m "feat(spotify): read the version out of a Spotify title, and the text Copy and SelectedRecs use

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Owned / Maybe / Missing

**Files:**
- Create: `src/lib/spotify/ownership.ts`
- Test: `src/lib/spotify/ownership.test.ts`

Strong match → Owned. Weak match → Maybe. No match → Missing.
- A `yes` verdict makes the pair Owned.
- A `no` verdict hides that file from that one track before matching.
- Verdicts about files no longer in the library are ignored.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/spotify/ownership.test.ts
import { describe, expect, it } from 'vitest'
import { buildOwnershipIndex, classifyTracks } from './ownership'
import type { LibraryTrack } from '../tracklist/match'
import type { SpotifyTrack, SpotifyVerdict } from '../../types/spotify'

function lib(id: number, artist: string, title: string): LibraryTrack {
  return { id, artist, title, file_path: `/music/${artist} - ${title}.mp3` }
}

function sp(spotifyId: string, title: string, artists: string): SpotifyTrack {
  return { spotifyId, title, artists, album: null, durationMs: null }
}

function classify(tracks: SpotifyTrack[], library: LibraryTrack[], verdicts: SpotifyVerdict[] = []) {
  return classifyTracks(tracks, buildOwnershipIndex(library), verdicts)
}

describe('do I own this Spotify track?', () => {
  const shelf = [
    lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
    lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
    lib(3, 'Witchy', 'Witch Doctor (Extended Mix)'),
  ]

  it('is Owned on a strong match, with the file', () => {
    const result = classify([sp('a', 'Come Get Up - Extended Mix', 'Butch, Santos')], shelf)
    expect(result.get('a')).toEqual({ kind: 'owned', file: shelf[0] })
  })

  it('is Maybe on a weak match, and says why', () => {
    const result = classify([sp('b', '300 Cash', 'Moreno & Prieto, Sortech')], shelf)
    expect(result.get('b')).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist partly matches',
    })
  })

  it('is Missing when nothing matches', () => {
    expect(classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf).get('c')).toEqual({ kind: 'missing' })
  })

  it('does not take a remix for the extended mix — the version Spotify puts after the dash counts', () => {
    const result = classify([sp('d', 'Witch Doctor - Hot Since 82 Remix', 'Witchy')], shelf)
    expect(result.get('d')?.kind).toBe('missing')
  })

  it('is Owned after a Yes, whatever the matcher thinks', () => {
    const verdicts: SpotifyVerdict[] = [{ spotifyId: 'c', libraryTrackId: 2, verdict: 'yes' }]
    const result = classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf, verdicts)
    expect(result.get('c')).toEqual({ kind: 'owned', file: shelf[1] })
  })

  it('looks past a file answered No, to another one or to nothing', () => {
    const twins = [
      lib(4, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
      lib(5, 'Moreno, Prieto, Garcia, Ruiz', '300 Cash'),
    ]
    const track = sp('b', '300 Cash', 'Moreno & Prieto, Sortech')

    const first = classify([track], twins).get('b')
    expect(first?.file?.id).toBe(4)

    const noToFour: SpotifyVerdict[] = [{ spotifyId: 'b', libraryTrackId: 4, verdict: 'no' }]
    expect(classify([track], twins, noToFour).get('b')).toMatchObject({ kind: 'maybe', file: twins[1] })

    const noToBoth: SpotifyVerdict[] = [...noToFour, { spotifyId: 'b', libraryTrackId: 5, verdict: 'no' }]
    expect(classify([track], twins, noToBoth).get('b')).toEqual({ kind: 'missing' })
  })

  it('ignores a verdict about a file that is no longer in the library', () => {
    const verdicts: SpotifyVerdict[] = [{ spotifyId: 'c', libraryTrackId: 999, verdict: 'yes' }]
    expect(classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf, verdicts).get('c')).toEqual({
      kind: 'missing',
    })
  })

  it('answers for every track, keyed by Spotify id', () => {
    const result = classify([sp('a', 'Come Get Up', 'Butch'), sp('c', 'Tell You', 'Prunk')], shelf)
    expect([...result.keys()]).toEqual(['a', 'c'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/spotify/ownership.test.ts`
Expected: FAIL — `Failed to resolve import "./ownership"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/spotify/ownership.ts
/**
 * Owned / Maybe / Missing for every Spotify track, against the library.
 *
 * Ownership is never stored: it is worked out again whenever the library or
 * the Spotify data changes, so a track turns Owned the moment its file is
 * scanned. That is ~1,000 tracks against ~8,500 files, and the sidebar needs
 * the answer at start-up, so two things keep it cheap:
 * - the library's names are split into words once (`indexLibrary`);
 * - a track is compared only with files sharing at least one title word. A
 *   title match needs a shared word, so the answer is exactly what comparing
 *   with every file would give.
 */
import { normalise, tokenSet } from '../tracklist/text'
import {
  indexLibrary,
  matchOne,
  type Indexed,
  type LibraryMatch,
  type LibraryTrack,
} from '../tracklist/match'
import type { SpotifyTrack, SpotifyVerdict } from '../../types/spotify'
import { toParsed } from './title'

export type OwnershipKind = 'owned' | 'maybe' | 'missing'

export interface Ownership {
  kind: OwnershipKind
  /** The library file: the match, or the one confirmed with Yes. */
  file?: LibraryTrack
  /** Maybe only: "same title, artist partly matches". */
  reason?: string
}

export interface OwnershipIndex {
  entries: Indexed[]
  byId: Map<number, LibraryTrack>
  /** Title word → positions in `entries` of the files whose title has it. */
  byToken: Map<string, number[]>
}

export function buildOwnershipIndex(library: LibraryTrack[]): OwnershipIndex {
  const entries = indexLibrary(library)
  const byToken = new Map<string, number[]>()
  entries.forEach((entry, position) => {
    for (const token of entry.titleTokens) {
      const bucket = byToken.get(token)
      if (bucket) bucket.push(position)
      else byToken.set(token, [position])
    }
  })
  return { entries, byId: new Map(library.map((track) => [track.id, track])), byToken }
}

/** Files sharing a title word with the track, in library order, minus those answered No. */
function candidates(
  index: OwnershipIndex,
  parsed: ReturnType<typeof toParsed>,
  excluded: Set<number> | undefined,
): Indexed[] {
  const positions = new Set<number>()
  for (const form of [parsed.titleNorm, normalise(parsed.title)]) {
    for (const token of tokenSet(form)) {
      for (const position of index.byToken.get(token) ?? []) positions.add(position)
    }
  }
  return [...positions]
    .sort((a, b) => a - b)
    .map((position) => index.entries[position])
    .filter((entry) => !excluded?.has(entry.track.id))
}

/** Why a Maybe is unsure, in the words the sub-row shows. */
export function maybeReason(match: Pick<LibraryMatch, 'titleScore' | 'artistScore'>): string {
  const title = match.titleScore >= 1 ? 'same title' : 'similar title'
  const artist = match.artistScore >= 1 ? 'same artist' : 'artist partly matches'
  return `${title}, ${artist}`
}

export function classifyTracks(
  tracks: SpotifyTrack[],
  index: OwnershipIndex,
  verdicts: SpotifyVerdict[],
): Map<string, Ownership> {
  const yes = new Map<string, number>()
  const no = new Map<string, Set<number>>()
  for (const verdict of verdicts) {
    // A verdict about a file that is gone says nothing any more.
    if (!index.byId.has(verdict.libraryTrackId)) continue
    if (verdict.verdict === 'yes') {
      yes.set(verdict.spotifyId, verdict.libraryTrackId)
    } else {
      const set = no.get(verdict.spotifyId) ?? new Set<number>()
      set.add(verdict.libraryTrackId)
      no.set(verdict.spotifyId, set)
    }
  }

  const result = new Map<string, Ownership>()
  for (const track of tracks) {
    const confirmed = yes.get(track.spotifyId)
    if (confirmed !== undefined) {
      result.set(track.spotifyId, { kind: 'owned', file: index.byId.get(confirmed) })
      continue
    }

    const parsed = toParsed(track)
    const match = matchOne(parsed, candidates(index, parsed, no.get(track.spotifyId)))
    if (!match) {
      result.set(track.spotifyId, { kind: 'missing' })
    } else if (match.strong) {
      result.set(track.spotifyId, { kind: 'owned', file: match.track })
    } else {
      result.set(track.spotifyId, { kind: 'maybe', file: match.track, reason: maybeReason(match) })
    }
  }
  return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify/ownership.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/ownership.ts src/lib/spotify/ownership.test.ts
git commit -m "feat(spotify): Owned, Maybe or Missing for every Spotify track, with Yes and No remembered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The "new and missing" count

**Files:**
- Create: `src/lib/spotify/newness.ts`
- Test: `src/lib/spotify/newness.test.ts`

A pair is new when its `firstSeenAt` is **later than** its list's `lastOpenedAt`. Only tracks that are new **and** not Owned count; a Maybe counts. On the SPOTIFY header the count is of distinct tracks; on each list item, of that list's tracks.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/spotify/newness.test.ts
import { describe, expect, it } from 'vitest'
import { isNew, newAndMissing } from './newness'
import type { Ownership } from './ownership'
import type { SpotifyEntry, SpotifyLibrary, SpotifyList } from '../../types/spotify'

const lists: SpotifyList[] = [
  { id: 'liked', name: 'Liked Songs', position: 0, trackCount: 3, lastOpenedAt: 1000 },
  { id: 'p1', name: 'Tech House', position: 1, trackCount: 2, lastOpenedAt: 1000 },
]

function entry(listId: string, spotifyId: string, firstSeenAt: number): SpotifyEntry {
  return { listId, spotifyId, addedAt: null, firstSeenAt }
}

function library(entries: SpotifyEntry[]): SpotifyLibrary {
  return { lists, tracks: [], entries, verdicts: [] }
}

const missing: Ownership = { kind: 'missing' }
const owned: Ownership = { kind: 'owned' }
const maybe: Ownership = { kind: 'maybe' }

describe('what counts as new', () => {
  it('is strictly later than the last opening — the first sync is the baseline', () => {
    expect(isNew(entry('liked', 'a', 1000), 1000)).toBe(false)
    expect(isNew(entry('liked', 'a', 1001), 1000)).toBe(true)
  })

  it('counts nothing right after the first sync', () => {
    const counts = newAndMissing(library([entry('liked', 'a', 1000)]), new Map([['a', missing]]))
    expect(counts.total).toBe(0)
    expect(counts.byList.size).toBe(0)
  })

  it('counts a new, missing like', () => {
    const counts = newAndMissing(library([entry('liked', 'a', 2000)]), new Map([['a', missing]]))
    expect(counts.total).toBe(1)
    expect(counts.byList.get('liked')).toBe(1)
  })

  it('counts one track new in two lists once on the header, and once on each list', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 2000), entry('p1', 'a', 2000)]),
      new Map([['a', missing]]),
    )
    expect(counts.total).toBe(1)
    expect(counts.byList.get('liked')).toBe(1)
    expect(counts.byList.get('p1')).toBe(1)
  })

  it('does not count liking something already in the library', () => {
    const counts = newAndMissing(library([entry('liked', 'a', 2000)]), new Map([['a', owned]]))
    expect(counts.total).toBe(0)
  })

  it('counts a Maybe — it is not known to be owned', () => {
    const counts = newAndMissing(library([entry('liked', 'a', 2000)]), new Map([['a', maybe]]))
    expect(counts.total).toBe(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/spotify/newness.test.ts`
Expected: FAIL — `Failed to resolve import "./newness"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/spotify/newness.ts
/**
 * "New" means new since the list was last opened, by RecoDeck's own clock: a
 * pair's `firstSeenAt` (the sync that first stored it) against the list's
 * `lastOpenedAt`. Spotify's `addedAt` is not used: a track liked at 09:00 and
 * first synced at 09:30, after the list was opened at 09:10, is still new.
 */
import type { Ownership } from './ownership'
import type { SpotifyEntry, SpotifyLibrary } from '../../types/spotify'

export interface NewCounts {
  /** Distinct tracks new somewhere and not owned — the SPOTIFY header number. */
  total: number
  /** The same, per list id. Lists with none are absent. */
  byList: Map<string, number>
}

/** Strictly later: a list's first sync stamps both with the same time. */
export function isNew(entry: SpotifyEntry, lastOpenedAt: number): boolean {
  return entry.firstSeenAt > lastOpenedAt
}

export function newAndMissing(library: SpotifyLibrary, ownership: Map<string, Ownership>): NewCounts {
  const opened = new Map(library.lists.map((list) => [list.id, list.lastOpenedAt]))
  const distinct = new Set<string>()
  const byList = new Map<string, number>()

  for (const entry of library.entries) {
    const lastOpenedAt = opened.get(entry.listId)
    if (lastOpenedAt === undefined || !isNew(entry, lastOpenedAt)) continue
    if (ownership.get(entry.spotifyId)?.kind === 'owned') continue
    distinct.add(entry.spotifyId)
    byList.set(entry.listId, (byList.get(entry.listId) ?? 0) + 1)
  }

  return { total: distinct.size, byList }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify/newness.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/newness.ts src/lib/spotify/newness.test.ts
git commit -m "feat(spotify): count the new likes that are not in the library yet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rows of a list, filters, and how dates read

**Files:**
- Create: `src/lib/spotify/rows.ts`
- Test: `src/lib/spotify/rows.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/spotify/rows.test.ts
import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  fileName,
  filterRows,
  formatAdded,
  formatSynced,
  listCounts,
  rowsFor,
} from './rows'
import type { Ownership } from './ownership'
import type { SpotifyLibrary } from '../../types/spotify'

const library: SpotifyLibrary = {
  lists: [
    { id: 'liked', name: 'Liked Songs', position: 0, trackCount: 2, lastOpenedAt: 1000 },
    { id: 'p1', name: 'Tech House', position: 1, trackCount: 2, lastOpenedAt: 1000 },
  ],
  tracks: [
    { spotifyId: 't1', title: 'Control', artists: 'Joseph Capriati', album: 'Control EP', durationMs: null },
    { spotifyId: 't2', title: 'Reverse Things', artists: 'Makèz, Toman', album: null, durationMs: null },
    { spotifyId: 't3', title: 'Come Get Up', artists: 'Butch', album: null, durationMs: null },
  ],
  entries: [
    { listId: 'p1', spotifyId: 't1', addedAt: '2026-09-20T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'liked', spotifyId: 't1', addedAt: '2026-09-01T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'liked', spotifyId: 't2', addedAt: '2026-09-10T10:00:00Z', firstSeenAt: 2000 },
    { listId: 'p1', spotifyId: 't3', addedAt: null, firstSeenAt: 2000 },
  ],
  verdicts: [],
}

const ownership = new Map<string, Ownership>([
  ['t1', { kind: 'missing' }],
  ['t2', { kind: 'maybe' }],
  ['t3', { kind: 'owned' }],
])

describe('the rows of a list', () => {
  it('lists one list, newest added first', () => {
    const rows = rowsFor('liked', library, ownership, new Map())
    expect(rows.map((r) => r.track.spotifyId)).toEqual(['t2', 't1'])
  })

  it('in All playlists shows a track once, with its newest added date and every list it is in', () => {
    const rows = rowsFor('all', library, ownership, new Map())
    expect(rows.map((r) => r.track.spotifyId)).toEqual(['t1', 't2', 't3'])
    expect(rows[0].addedAt).toBe('2026-09-20T10:00:00Z')
    expect(rows[0].lists).toEqual(['Liked Songs', 'Tech House'])
  })

  it('marks a new track that is not owned', () => {
    const rows = rowsFor('liked', library, ownership, new Map())
    expect(rows.find((r) => r.track.spotifyId === 't2')?.isNew).toBe(true)
    expect(rows.find((r) => r.track.spotifyId === 't1')?.isNew).toBe(false)
  })

  it('never marks an owned track new', () => {
    const rows = rowsFor('p1', library, ownership, new Map())
    expect(rows.find((r) => r.track.spotifyId === 't3')?.isNew).toBe(false)
  })

  it('compares with the opening captured when the view was opened, not the one just written', () => {
    const rows = rowsFor('liked', library, ownership, new Map([['liked', 2500]]))
    expect(rows.find((r) => r.track.spotifyId === 't2')?.isNew).toBe(false)
  })

  it('counts each status, and filters by status and by words', () => {
    const rows = rowsFor('all', library, ownership, new Map())
    expect(countByStatus(rows)).toEqual({ all: 3, owned: 1, missing: 1, maybe: 1 })
    expect(filterRows(rows, 'missing', '').map((r) => r.track.spotifyId)).toEqual(['t1'])
    expect(filterRows(rows, 'all', 'makez').map((r) => r.track.spotifyId)).toEqual([])
    expect(filterRows(rows, 'all', 'toman reverse').map((r) => r.track.spotifyId)).toEqual(['t2'])
    expect(filterRows(rows, 'all', 'control ep').map((r) => r.track.spotifyId)).toEqual(['t1'])
  })

  it('counts the rows behind each sidebar item', () => {
    const counts = listCounts(library)
    expect(counts.get('all')).toBe(3)
    expect(counts.get('liked')).toBe(2)
    expect(counts.get('p1')).toBe(2)
  })
})

describe('how times read', () => {
  const now = new Date(2026, 9, 3, 12, 0)

  it('says today, yesterday, a date, or a date with the year', () => {
    expect(formatAdded(new Date(2026, 9, 3, 8).toISOString(), now)).toBe('today')
    expect(formatAdded(new Date(2026, 9, 2, 23).toISOString(), now)).toBe('yesterday')
    expect(formatAdded(new Date(2026, 8, 28, 10).toISOString(), now)).toBe('Sep 28')
    expect(formatAdded(new Date(2024, 8, 28, 10).toISOString(), now)).toBe('Sep 28, 2024')
    expect(formatAdded(null, now)).toBe('')
  })

  it('says how long ago a sync was', () => {
    const t = now.getTime()
    expect(formatSynced(t - 30_000, t)).toBe('just now')
    expect(formatSynced(t - 2 * 60_000, t)).toBe('2 min ago')
    expect(formatSynced(t - 2 * 3_600_000, t)).toBe('2 h ago')
    expect(formatSynced(t - 3 * 86_400_000, t)).toBe('3 d ago')
    expect(formatSynced(t + 5_000, t)).toBe('just now')
  })

  it('shows only the file name of a library path', () => {
    expect(fileName('/music/Butch & Santos - Come Get Up.mp3')).toBe('Butch & Santos - Come Get Up.mp3')
    expect(fileName('C:\\Music\\Track.flac')).toBe('Track.flac')
  })
})
```

Note on `'makez'`: the filter is a plain case-insensitive word search, so it does not fold accents. `Makèz` does not match `makez`, and the test pins that down.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/spotify/rows.test.ts`
Expected: FAIL — `Failed to resolve import "./rows"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/spotify/rows.ts
/**
 * What the Spotify view shows for one list: one row per track, newest added
 * first. In All playlists a track in several lists is one row, dated by its
 * newest add, with every list it is in.
 */
import { isNew } from './newness'
import type { Ownership, OwnershipKind } from './ownership'
import { ALL_LISTS, type SpotifyLibrary, type SpotifyTrack } from '../../types/spotify'

export interface SpotifyRow {
  track: SpotifyTrack
  ownership: Ownership
  /** Newest Spotify added_at across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

export type StatusFilter = 'all' | OwnershipKind

/**
 * @param seenBefore each list's lastOpenedAt as it was when the view was
 *   opened. Opening writes a new lastOpenedAt at once, and comparing with that
 *   would clear the dots before they were seen.
 */
export function rowsFor(
  listId: string,
  library: SpotifyLibrary,
  ownership: Map<string, Ownership>,
  seenBefore: Map<string, number>,
): SpotifyRow[] {
  const lists = new Map(library.lists.map((list) => [list.id, list]))
  const tracks = new Map(library.tracks.map((track) => [track.spotifyId, track]))
  const byTrack = new Map<string, { addedAt: string | null; listIds: Set<string>; isNew: boolean }>()

  for (const entry of library.entries) {
    if (listId !== ALL_LISTS && entry.listId !== listId) continue
    const list = lists.get(entry.listId)
    if (!list) continue

    const row = byTrack.get(entry.spotifyId) ?? { addedAt: null, listIds: new Set<string>(), isNew: false }
    if (entry.addedAt && (!row.addedAt || entry.addedAt > row.addedAt)) row.addedAt = entry.addedAt
    row.listIds.add(entry.listId)
    row.isNew ||= isNew(entry, seenBefore.get(entry.listId) ?? list.lastOpenedAt)
    byTrack.set(entry.spotifyId, row)
  }

  const rows: SpotifyRow[] = []
  for (const [spotifyId, row] of byTrack) {
    const track = tracks.get(spotifyId)
    if (!track) continue
    const owns = ownership.get(spotifyId) ?? { kind: 'missing' }
    rows.push({
      track,
      ownership: owns,
      addedAt: row.addedAt,
      lists: [...row.listIds]
        .map((id) => lists.get(id)!)
        .sort((a, b) => a.position - b.position)
        .map((list) => list.name),
      isNew: row.isNew && owns.kind !== 'owned',
    })
  }

  // Newest first; ISO strings in one format sort as text. Undated rows last.
  return rows.sort((a, b) => {
    if (a.addedAt !== b.addedAt) {
      if (!a.addedAt) return 1
      if (!b.addedAt) return -1
      return a.addedAt < b.addedAt ? 1 : -1
    }
    return a.track.title.localeCompare(b.track.title)
  })
}

export function countByStatus(rows: SpotifyRow[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: rows.length, owned: 0, missing: 0, maybe: 0 }
  for (const row of rows) counts[row.ownership.kind] += 1
  return counts
}

/** Status first, then every typed word must appear in title, artists or album. */
export function filterRows(rows: SpotifyRow[], filter: StatusFilter, query: string): SpotifyRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filter !== 'all' && row.ownership.kind !== filter) return false
    if (!words.length) return true
    const haystack = `${row.track.title} ${row.track.artists} ${row.track.album ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** Rows behind each sidebar item: per list, and every track for All playlists. */
export function listCounts(library: SpotifyLibrary): Map<string, number> {
  const counts = new Map<string, number>([[ALL_LISTS, library.tracks.length]])
  for (const entry of library.entries) counts.set(entry.listId, (counts.get(entry.listId) ?? 0) + 1)
  return counts
}

const DAY_MS = 86_400_000

/** "today", "yesterday", "Sep 28", or "Sep 28, 2024" — by local calendar day. */
export function formatAdded(iso: string | null, now: Date): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // Rounded, so a 23- or 25-hour day around a clock change is still one day.
  const days = Math.round((day(now) - day(date)) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return date.toLocaleDateString(
    'en-US',
    date.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

/** "just now", "2 min ago", "2 h ago", "3 d ago". A time in the future is "just now". */
export function formatSynced(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms)
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / 3_600_000)} h ago`
  return `${Math.floor(elapsed / DAY_MS)} d ago`
}

/** The last part of a path, for "In library: <file name>". */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify`
Expected: PASS. All four Spotify test files pass, `rows.test.ts` with 10 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/lib/spotify src/types/spotify.ts src/lib/tracklist/match.ts src/lib/tracklist/text.ts`
Expected: no type errors. In `text.ts`, only the pre-existing `no-irregular-whitespace` error at line 68 (the U+200B in `HANDLE_PREFIX`). Nothing else.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify/rows.ts src/lib/spotify/rows.test.ts
git commit -m "feat(spotify): the rows of a list, its filters, and how its dates read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Migration 015 and the storage basics

**Files:**
- Create: `src-tauri/src/db/migrations/015_spotify.sql`
- Create: `src-tauri/src/db/spotify.rs`
- Modify: `src-tauri/src/db/mod.rs` (module declaration under the `use` lines; the end of `run_migrations`)

`db/mod.rs` is 4,400 lines. The Spotify storage goes in its own file as a second `impl Database` block. A child module can read `Database`'s private `conn`.

- [ ] **Step 1: The migration**

```sql
-- src-tauri/src/db/migrations/015_spotify.sql
-- Migration 015: the Spotify section
--
-- What the user liked and put in playlists on Spotify, kept so the Spotify view
-- can say which of it is already in the library. Ownership itself is not stored:
-- it is worked out against the library every time, so a download turns a row
-- Owned without a sync.
--
-- Uses CREATE TABLE IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS spotify_tracks (
    spotify_id  TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artists     TEXT NOT NULL,           -- display string: "Moreno & Prieto, Sortech"
    album       TEXT,
    duration_ms INTEGER
);

-- 'liked' for Liked Songs, otherwise the Spotify playlist id.
CREATE TABLE IF NOT EXISTS spotify_lists (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    snapshot_id    TEXT,                 -- NULL for Liked Songs
    position       INTEGER NOT NULL,     -- Liked Songs 0, then Spotify's order
    -- The total Spotify last reported, skipped items included. Liked Songs is
    -- read again in full when Spotify's total stops adding up to it.
    track_count    INTEGER NOT NULL DEFAULT 0,
    -- Unix milliseconds, never empty: a list's first sync sets it, so nothing
    -- that already existed reads as new.
    last_opened_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spotify_list_tracks (
    list_id       TEXT NOT NULL REFERENCES spotify_lists(id) ON DELETE CASCADE,
    spotify_id    TEXT NOT NULL REFERENCES spotify_tracks(spotify_id) ON DELETE CASCADE,
    added_at      TEXT,                  -- Spotify's: when it was liked / added (ISO)
    first_seen_at INTEGER NOT NULL,      -- RecoDeck's: the sync that first stored this pair (unix ms)
    PRIMARY KEY (list_id, spotify_id)
);

CREATE INDEX IF NOT EXISTS idx_spotify_list_tracks_track ON spotify_list_tracks(spotify_id);

-- Yes / No answered on a Maybe row, never asked again for the pair. Kept when
-- the Spotify track leaves every list, so a re-like does not ask again. No
-- foreign key to tracks: a deleted file's verdicts are ignored, then removed.
CREATE TABLE IF NOT EXISTS spotify_match_verdicts (
    spotify_id       TEXT NOT NULL,
    library_track_id INTEGER NOT NULL,
    verdict          TEXT NOT NULL CHECK (verdict IN ('yes', 'no')),
    PRIMARY KEY (spotify_id, library_track_id)
);
```

- [ ] **Step 2: Run it from `run_migrations`**

In `src-tauri/src/db/mod.rs`, directly under `use std::path::Path;`, add:

```rust
pub mod spotify;
```

In `run_migrations`, after the Migration 014 block and before `Ok(())`, add:

```rust
        // Migration 015: the Spotify section
        // Uses CREATE TABLE IF NOT EXISTS — safe to re-run
        self.conn
            .execute_batch(include_str!("migrations/015_spotify.sql"))?;
```

- [ ] **Step 3: Write the storage module with its failing tests**

```rust
// src-tauri/src/db/spotify.rs
//! Storage for the Spotify section: the tracks, which list each one is in, and
//! the Yes / No answers given on Maybe rows.
//!
//! Ownership is not stored. The frontend works it out against the library on
//! every change, so a track turns Owned the moment its file is scanned.

use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

/// Liked Songs' id in `spotify_lists`. Playlist ids are 22-character base62
/// strings, so it cannot collide with one.
pub const LIKED_LIST_ID: &str = "liked";
pub const LIKED_LIST_NAME: &str = "Liked Songs";
/// "All playlists" — not a stored list, every list at once.
pub const ALL_LISTS_ID: &str = "all";
/// The settings key holding the playlists Spotify would not share, as JSON.
pub const REFUSED_SETTING: &str = "spotify_refused";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub spotify_id: String,
    pub title: String,
    /// Artists joined with ", ".
    pub artists: String,
    pub album: Option<String>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyListRow {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub track_count: i64,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyEntryRow {
    pub list_id: String,
    pub spotify_id: String,
    pub added_at: Option<String>,
    pub first_seen_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyVerdictRow {
    pub spotify_id: String,
    pub library_track_id: i64,
    pub verdict: String,
}

/// Everything the frontend needs, in one call: ~1,000 tracks is small.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyLibraryDump {
    pub lists: Vec<SpotifyListRow>,
    pub tracks: Vec<SpotifyTrack>,
    pub entries: Vec<SpotifyEntryRow>,
    pub verdicts: Vec<SpotifyVerdictRow>,
}

impl Database {
    pub fn get_spotify_library(&self) -> Result<SpotifyLibraryDump> {
        // A verdict about a file that is gone says nothing any more — removed
        // here, where it is noticed.
        self.conn.execute(
            "DELETE FROM spotify_match_verdicts
             WHERE library_track_id NOT IN (SELECT id FROM tracks)",
            [],
        )?;

        let lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, position, track_count, last_opened_at
                 FROM spotify_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyListRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    position: r.get(2)?,
                    track_count: r.get(3)?,
                    last_opened_at: r.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let tracks = {
            let mut stmt = self.conn.prepare(
                "SELECT spotify_id, title, artists, album, duration_ms FROM spotify_tracks",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyTrack {
                    spotify_id: r.get(0)?,
                    title: r.get(1)?,
                    artists: r.get(2)?,
                    album: r.get(3)?,
                    duration_ms: r.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let entries = {
            let mut stmt = self.conn.prepare(
                "SELECT list_id, spotify_id, added_at, first_seen_at FROM spotify_list_tracks",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyEntryRow {
                    list_id: r.get(0)?,
                    spotify_id: r.get(1)?,
                    added_at: r.get(2)?,
                    first_seen_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let verdicts = {
            let mut stmt = self.conn.prepare(
                "SELECT spotify_id, library_track_id, verdict FROM spotify_match_verdicts",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(SpotifyVerdictRow {
                    spotify_id: r.get(0)?,
                    library_track_id: r.get(1)?,
                    verdict: r.get(2)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        Ok(SpotifyLibraryDump { lists, tracks, entries, verdicts })
    }

    /// Opening a list marks what is in it seen. `ALL_LISTS_ID` marks every list.
    pub fn mark_spotify_list_opened(&self, list_id: &str, now_ms: i64) -> Result<()> {
        if list_id == ALL_LISTS_ID {
            self.conn
                .execute("UPDATE spotify_lists SET last_opened_at = ?1", [now_ms])?;
        } else {
            self.conn.execute(
                "UPDATE spotify_lists SET last_opened_at = ?1 WHERE id = ?2",
                params![now_ms, list_id],
            )?;
        }
        Ok(())
    }

    /// `verdict` is "yes" or "no"; the table refuses anything else.
    pub fn set_spotify_verdict(&self, spotify_id: &str, library_track_id: i64, verdict: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO spotify_match_verdicts (spotify_id, library_track_id, verdict)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(spotify_id, library_track_id) DO UPDATE SET verdict = excluded.verdict",
            params![spotify_id, library_track_id, verdict],
        )?;
        Ok(())
    }

    /// Disconnecting forgets everything Spotify-side. Nothing on Spotify is touched.
    pub fn clear_spotify(&self) -> Result<()> {
        self.conn.execute_batch(
            "DELETE FROM spotify_list_tracks;
             DELETE FROM spotify_lists;
             DELETE FROM spotify_tracks;
             DELETE FROM spotify_match_verdicts;",
        )?;
        self.delete_setting(REFUSED_SETTING)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn library_track(path: &str) -> Track {
        Track {
            id: None,
            file_path: path.to_string(),
            file_hash: path.to_string(),
            title: Some("Come Get Up".to_string()),
            artist: Some("Butch".to_string()),
            album: None,
            album_artist: None,
            track_number: None,
            year: None,
            label: None,
            duration_ms: None,
            file_format: None,
            bitrate: None,
            sample_rate: None,
            file_size: None,
            date_added: None,
            date_modified: None,
            play_count: 0,
            rating: 0,
            comment: None,
            artwork_path: None,
            genre: None,
            genre_source: None,
        }
    }

    fn seed_list(db: &Database, id: &str, position: i64, last_opened_at: i64) {
        db.conn
            .execute(
                "INSERT INTO spotify_lists (id, name, snapshot_id, position, track_count, last_opened_at)
                 VALUES (?1, ?1, NULL, ?2, 0, ?3)",
                params![id, position, last_opened_at],
            )
            .unwrap();
    }

    fn opened(db: &Database) -> Vec<(String, i64)> {
        db.get_spotify_library()
            .unwrap()
            .lists
            .into_iter()
            .map(|l| (l.id, l.last_opened_at))
            .collect()
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn migration_015_runs_twice_and_starts_empty() {
        let db = fresh();
        db.run_migrations().expect("second run");
        let dump = db.get_spotify_library().unwrap();
        assert!(dump.lists.is_empty());
        assert!(dump.tracks.is_empty());
        assert!(dump.entries.is_empty());
        assert!(dump.verdicts.is_empty());
    }

    #[test]
    fn opening_a_list_marks_only_that_list() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        seed_list(&db, "p1", 1, 100);
        db.mark_spotify_list_opened("p1", 500).unwrap();
        assert_eq!(
            opened(&db),
            vec![(LIKED_LIST_ID.to_string(), 100), ("p1".to_string(), 500)]
        );
    }

    #[test]
    fn opening_all_playlists_marks_every_list() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        seed_list(&db, "p1", 1, 100);
        db.mark_spotify_list_opened(ALL_LISTS_ID, 700).unwrap();
        assert_eq!(
            opened(&db),
            vec![(LIKED_LIST_ID.to_string(), 700), ("p1".to_string(), 700)]
        );
    }

    #[test]
    fn a_verdict_is_stored_and_can_be_changed() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_spotify_verdict("sp1", file, "no").unwrap();
        db.set_spotify_verdict("sp1", file, "yes").unwrap();
        assert_eq!(
            db.get_spotify_library().unwrap().verdicts,
            vec![SpotifyVerdictRow {
                spotify_id: "sp1".to_string(),
                library_track_id: file,
                verdict: "yes".to_string(),
            }]
        );
    }

    #[test]
    fn the_table_refuses_an_answer_that_is_not_yes_or_no() {
        let db = fresh();
        assert!(db.set_spotify_verdict("sp1", 1, "maybe").is_err());
    }

    #[test]
    fn a_verdict_about_a_deleted_file_is_dropped_when_noticed() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_spotify_verdict("sp1", file, "yes").unwrap();
        db.set_spotify_verdict("sp2", 9_999, "no").unwrap();

        assert_eq!(db.get_spotify_library().unwrap().verdicts.len(), 1);
        assert_eq!(count(&db, "spotify_match_verdicts"), 1);
    }

    #[test]
    fn disconnecting_forgets_everything_spotify_side_and_nothing_else() {
        let db = fresh();
        seed_list(&db, LIKED_LIST_ID, 0, 100);
        db.conn
            .execute(
                "INSERT INTO spotify_tracks (spotify_id, title, artists) VALUES ('sp1', 'T', 'A')",
                [],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO spotify_list_tracks (list_id, spotify_id, added_at, first_seen_at)
                 VALUES ('liked', 'sp1', NULL, 100)",
                [],
            )
            .unwrap();
        db.set_spotify_verdict("sp1", 1, "no").unwrap();
        db.set_setting(REFUSED_SETTING, "[]").unwrap();
        db.set_setting("youtube_api_key", "kept").unwrap();

        db.clear_spotify().unwrap();

        for table in [
            "spotify_list_tracks",
            "spotify_lists",
            "spotify_tracks",
            "spotify_match_verdicts",
        ] {
            assert_eq!(count(&db, table), 0, "{table} should be empty");
        }
        assert_eq!(db.get_setting(REFUSED_SETTING).unwrap(), None);
        assert_eq!(db.get_setting("youtube_api_key").unwrap().as_deref(), Some("kept"));
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test db::spotify`
Expected: PASS, 7 tests. If the build fails on `include_str!`, check the migration's file name. If a test fails, fix the code, never the expectation.

(This task writes the tests and the code together, because the tests cannot compile without the module. To see a red, replace any expected value by hand and run again, then put it back.)

- [ ] **Step 5: Make sure nothing else moved**

Run: `cd src-tauri && cargo test 2>&1 | grep "test result"`
Expected: every line reads `ok`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/migrations/015_spotify.sql src-tauri/src/db/spotify.rs src-tauri/src/db/mod.rs
git commit -m "feat(spotify): tables for Spotify tracks, lists and verdicts, and their basic storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Applying a sync — the rules that make "new" mean something

**Files:**
- Modify: `src-tauri/src/db/spotify.rs`

These are the spec's rules:
- **A list's first sync is the baseline.** A list stored for the first time gets `last_opened_at = now`, and its pairs get `first_seen_at = now`. "New" is strictly later, so nothing that already existed shows as new.
- **A refetch keeps `first_seen_at`.** Existing pairs are never rewritten. New pairs get `now`. Only pairs Spotify no longer returns are deleted.
- **Lists Spotify no longer returns are removed.**
- **Tracks left in no list are deleted.** Their verdicts are kept.

- [ ] **Step 1: The types a sync produces** (append to `db/spotify.rs`, above the `#[cfg(test)]` line)

Change the imports at the top of the file to:

```rust
use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
```

and add:

```rust
// --- what a sync found ------------------------------------------------

/// One track in one list, as Spotify returned it.
#[derive(Debug, Clone, PartialEq)]
pub struct ListEntry {
    pub track: SpotifyTrack,
    /// Spotify's ISO time of the like / add.
    pub added_at: Option<String>,
}

/// A playlist as `/me/playlists` lists it. Also stored as JSON for the
/// playlists Spotify would not share, hence serde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistMeta {
    pub id: String,
    pub name: String,
    pub snapshot_id: String,
    /// What Spotify says is in it, skipped items included.
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LikedChange {
    /// Nothing new, and Spotify's total still adds up.
    Unchanged { total: i64 },
    /// Only these new likes, newest first.
    Prepend { entries: Vec<ListEntry>, total: i64 },
    /// All of Liked Songs.
    Full { entries: Vec<ListEntry>, total: i64 },
}

impl LikedChange {
    pub fn total(&self) -> i64 {
        match self {
            Self::Unchanged { total } | Self::Prepend { total, .. } | Self::Full { total, .. } => *total,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SyncChanges {
    pub liked: LikedChange,
    /// Every playlist Spotify shares, in Spotify's order.
    pub playlists: Vec<PlaylistMeta>,
    /// Full contents of the playlists that are new or whose snapshot changed.
    pub refetched: HashMap<String, Vec<ListEntry>>,
    /// Playlists Spotify would not share; listed by name in Settings.
    pub refused: Vec<PlaylistMeta>,
}

/// What the last sync left behind: what the next one compares against.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncBaseline {
    /// Ids currently in Liked Songs.
    pub liked_known: HashSet<String>,
    /// Spotify's total at the last sync; None until Liked Songs was read once.
    pub liked_total: Option<i64>,
    /// Stored playlist id → snapshot_id.
    pub snapshots: HashMap<String, String>,
    /// Refused playlist id → the snapshot_id it was refused at.
    pub refused: HashMap<String, String>,
}

struct ListUpsert<'a> {
    id: &'a str,
    name: &'a str,
    snapshot_id: Option<&'a str>,
    position: i64,
    total: i64,
}
```

- [ ] **Step 2: Write the failing tests** (inside `mod tests`, after the existing tests)

```rust
    // --- applying a sync ----------------------------------------------

    fn entry(id: &str) -> ListEntry {
        ListEntry {
            track: SpotifyTrack {
                spotify_id: id.to_string(),
                title: format!("Title {id}"),
                artists: "Artist".to_string(),
                album: None,
                duration_ms: Some(300_000),
            },
            added_at: Some("2026-10-01T09:00:00Z".to_string()),
        }
    }

    fn entries(ids: &[&str]) -> Vec<ListEntry> {
        ids.iter().map(|id| entry(id)).collect()
    }

    fn meta(id: &str, snapshot: &str, total: i64) -> PlaylistMeta {
        PlaylistMeta {
            id: id.to_string(),
            name: format!("List {id}"),
            snapshot_id: snapshot.to_string(),
            total,
        }
    }

    fn full(ids: &[&str]) -> LikedChange {
        LikedChange::Full { entries: entries(ids), total: ids.len() as i64 }
    }

    fn changes(liked: LikedChange, playlists: Vec<(PlaylistMeta, Option<Vec<ListEntry>>)>) -> SyncChanges {
        let mut refetched = HashMap::new();
        let mut metas = Vec::new();
        for (m, contents) in playlists {
            if let Some(contents) = contents {
                refetched.insert(m.id.clone(), contents);
            }
            metas.push(m);
        }
        SyncChanges { liked, playlists: metas, refetched, refused: Vec::new() }
    }

    /// The ids that would carry a dot: first seen later than the list's opening.
    fn new_ids(db: &Database, list_id: &str) -> Vec<String> {
        let dump = db.get_spotify_library().unwrap();
        let opened = dump
            .lists
            .iter()
            .find(|l| l.id == list_id)
            .expect("list stored")
            .last_opened_at;
        let mut ids: Vec<String> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == list_id && e.first_seen_at > opened)
            .map(|e| e.spotify_id.clone())
            .collect();
        ids.sort();
        ids
    }

    fn first_seen(db: &Database, list_id: &str, spotify_id: &str) -> i64 {
        db.conn
            .query_row(
                "SELECT first_seen_at FROM spotify_list_tracks WHERE list_id = ?1 AND spotify_id = ?2",
                params![list_id, spotify_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    /// Liked Songs [a, b] and playlist p1 [b, c], first synced at 1,000.
    fn baseline_db() -> Database {
        let db = fresh();
        db.apply_spotify_sync(
            &changes(full(&["a", "b"]), vec![(meta("p1", "s1", 2), Some(entries(&["b", "c"])))]),
            1_000,
        )
        .unwrap();
        db
    }

    #[test]
    fn a_lists_first_sync_is_the_baseline() {
        let db = baseline_db();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
        assert!(new_ids(&db, "p1").is_empty());
        let dump = db.get_spotify_library().unwrap();
        assert!(dump.lists.iter().all(|l| l.last_opened_at == 1_000));
        assert_eq!(dump.lists.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), [LIKED_LIST_ID, "p1"]);
        assert_eq!(dump.lists[0].name, LIKED_LIST_NAME);
    }

    #[test]
    fn a_like_right_after_the_baseline_is_new() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: entries(&["d"]), total: 3 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);
        assert!(new_ids(&db, "p1").is_empty());
    }

    #[test]
    fn new_follows_recodecks_first_sighting_not_spotifys_added_at() {
        // Liked at 09:00 on the phone, the list opened at 09:10, first synced at 09:30.
        let db = baseline_db();
        db.mark_spotify_list_opened(LIKED_LIST_ID, 1_500).unwrap();
        let mut liked_early = entry("d");
        liked_early.added_at = Some("2026-10-03T09:00:00Z".to_string());
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: vec![liked_early], total: 3 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);

        db.mark_spotify_list_opened(LIKED_LIST_ID, 2_500).unwrap();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
    }

    #[test]
    fn a_full_refetch_keeps_first_seen_at() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Full { entries: entries(&["c", "a"]), total: 2 },
                vec![(meta("p1", "s1", 2), None)],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(first_seen(&db, LIKED_LIST_ID, "a"), 1_000);
        assert_eq!(first_seen(&db, LIKED_LIST_ID, "c"), 2_000);
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["c"]);
        let liked: Vec<String> = db
            .get_spotify_library()
            .unwrap()
            .entries
            .into_iter()
            .filter(|e| e.list_id == LIKED_LIST_ID)
            .map(|e| e.spotify_id)
            .collect();
        assert!(!liked.contains(&"b".to_string()), "an unliked track leaves Liked Songs");
    }

    #[test]
    fn opening_all_playlists_marks_every_list_seen() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Prepend { entries: entries(&["d"]), total: 3 },
                vec![(meta("p1", "s2", 3), Some(entries(&["b", "c", "e"])))],
            ),
            2_000,
        )
        .unwrap();
        assert_eq!(new_ids(&db, LIKED_LIST_ID), ["d"]);
        assert_eq!(new_ids(&db, "p1"), ["e"]);

        db.mark_spotify_list_opened(ALL_LISTS_ID, 3_000).unwrap();
        assert!(new_ids(&db, LIKED_LIST_ID).is_empty());
        assert!(new_ids(&db, "p1").is_empty());
    }

    #[test]
    fn a_playlist_that_appears_later_starts_with_its_own_baseline() {
        let db = baseline_db();
        db.apply_spotify_sync(
            &changes(
                LikedChange::Unchanged { total: 2 },
                vec![(meta("p1", "s1", 2), None), (meta("p2", "s9", 2), Some(entries(&["x", "y"])))],
            ),
            5_000,
        )
        .unwrap();
        assert!(new_ids(&db, "p2").is_empty());
    }

    #[test]
    fn a_playlist_spotify_no_longer_returns_goes_with_the_tracks_only_it_had() {
        let db = baseline_db();
        // A real library file, or reading the library would drop the verdict as stale.
        let file = db.create_track(&library_track("/music/c.mp3")).unwrap();
        db.set_spotify_verdict("c", file, "no").unwrap();
        db.apply_spotify_sync(&changes(LikedChange::Unchanged { total: 2 }, vec![]), 2_000)
            .unwrap();

        let dump = db.get_spotify_library().unwrap();
        assert_eq!(dump.lists.len(), 1);
        let mut ids: Vec<&str> = dump.tracks.iter().map(|t| t.spotify_id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["a", "b"], "c was only in p1");
        // Its verdict stays, so a re-like does not ask again.
        let kept: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM spotify_match_verdicts WHERE spotify_id = 'c'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1);
    }

    #[test]
    fn a_sync_says_whether_anything_changed() {
        let db = fresh();
        let first = changes(full(&["a"]), vec![(meta("p1", "s1", 1), Some(entries(&["b"])))]);
        assert!(db.apply_spotify_sync(&first, 1_000).unwrap());

        let same = changes(LikedChange::Unchanged { total: 1 }, vec![(meta("p1", "s1", 1), None)]);
        assert!(!db.apply_spotify_sync(&same, 2_000).unwrap());

        let renamed = changes(
            LikedChange::Unchanged { total: 1 },
            vec![(PlaylistMeta { name: "Renamed".to_string(), ..meta("p1", "s1", 1) }, None)],
        );
        assert!(db.apply_spotify_sync(&renamed, 3_000).unwrap());
    }

    #[test]
    fn the_baseline_is_what_the_last_sync_stored() {
        let db = fresh();
        assert_eq!(db.spotify_baseline().unwrap(), SyncBaseline::default());

        let mut first = changes(full(&["a", "b"]), vec![(meta("p1", "s1", 2), Some(entries(&["c"])))]);
        first.refused = vec![meta("p9", "s9", 50)];
        db.apply_spotify_sync(&first, 1_000).unwrap();

        let base = db.spotify_baseline().unwrap();
        assert_eq!(base.liked_total, Some(2));
        assert_eq!(base.liked_known, HashSet::from(["a".to_string(), "b".to_string()]));
        assert_eq!(base.snapshots, HashMap::from([("p1".to_string(), "s1".to_string())]));
        assert_eq!(base.refused, HashMap::from([("p9".to_string(), "s9".to_string())]));
        assert_eq!(db.spotify_refused().unwrap(), vec![meta("p9", "s9", 50)]);
    }
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd src-tauri && cargo test db::spotify`
Expected: compile errors — `no method named apply_spotify_sync` / `spotify_baseline` / `spotify_refused`.

- [ ] **Step 4: Implement** (a second `impl Database` block, above `#[cfg(test)]`)

```rust
impl Database {
    /// What the next sync compares against.
    pub fn spotify_baseline(&self) -> Result<SyncBaseline> {
        let liked_total: Option<i64> = self
            .conn
            .query_row(
                "SELECT track_count FROM spotify_lists WHERE id = ?1",
                [LIKED_LIST_ID],
                |r| r.get(0),
            )
            .optional()?;

        let liked_known = {
            let mut stmt = self
                .conn
                .prepare("SELECT spotify_id FROM spotify_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([LIKED_LIST_ID], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let snapshots = {
            let mut stmt = self.conn.prepare(
                "SELECT id, snapshot_id FROM spotify_lists
                 WHERE id <> ?1 AND snapshot_id IS NOT NULL",
            )?;
            let rows = stmt.query_map([LIKED_LIST_ID], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            rows.collect::<Result<HashMap<_, _>>>()?
        };

        let refused = self
            .spotify_refused()?
            .into_iter()
            .map(|p| (p.id, p.snapshot_id))
            .collect();

        Ok(SyncBaseline { liked_known, liked_total, snapshots, refused })
    }

    /// The playlists Spotify would not share at the last sync.
    pub fn spotify_refused(&self) -> Result<Vec<PlaylistMeta>> {
        Ok(self
            .get_setting(REFUSED_SETTING)?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default())
    }

    /// Stores what a sync found. Returns whether anything a person would see
    /// changed: a list added, removed, renamed or moved, or a track added to or
    /// removed from a list.
    pub fn apply_spotify_sync(&self, changes: &SyncChanges, now_ms: i64) -> Result<bool> {
        let tx = self.conn.unchecked_transaction()?;
        let mut changed = false;

        let existing: HashMap<String, (String, i64)> = {
            let mut stmt = self.conn.prepare("SELECT id, name, position FROM spotify_lists")?;
            let rows = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, (r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))
            })?;
            rows.collect::<Result<HashMap<_, _>>>()?
        };

        // Liked Songs, always first.
        changed |= self.upsert_spotify_list(
            &existing,
            ListUpsert {
                id: LIKED_LIST_ID,
                name: LIKED_LIST_NAME,
                snapshot_id: None,
                position: 0,
                total: changes.liked.total(),
            },
            now_ms,
        )?;
        match &changes.liked {
            LikedChange::Unchanged { .. } => {}
            LikedChange::Prepend { entries, .. } => {
                changed |= self.add_spotify_pairs(LIKED_LIST_ID, entries, now_ms)? > 0;
            }
            LikedChange::Full { entries, .. } => {
                changed |= self.replace_spotify_pairs(LIKED_LIST_ID, entries, now_ms)?;
            }
        }

        // Playlists, in Spotify's order after Liked Songs.
        let mut kept: HashSet<&str> = HashSet::from([LIKED_LIST_ID]);
        for (index, playlist) in changes.playlists.iter().enumerate() {
            kept.insert(playlist.id.as_str());
            changed |= self.upsert_spotify_list(
                &existing,
                ListUpsert {
                    id: &playlist.id,
                    name: &playlist.name,
                    snapshot_id: Some(&playlist.snapshot_id),
                    position: index as i64 + 1,
                    total: playlist.total,
                },
                now_ms,
            )?;
            if let Some(entries) = changes.refetched.get(&playlist.id) {
                changed |= self.replace_spotify_pairs(&playlist.id, entries, now_ms)?;
            }
        }

        // Lists Spotify no longer returns: unfollowed, deleted, or now refused.
        for id in existing.keys().filter(|id| !kept.contains(id.as_str())) {
            self.conn
                .execute("DELETE FROM spotify_list_tracks WHERE list_id = ?1", [id])?;
            self.conn.execute("DELETE FROM spotify_lists WHERE id = ?1", [id])?;
            changed = true;
        }

        // Tracks in no list. Their verdicts stay.
        self.conn.execute(
            "DELETE FROM spotify_tracks
             WHERE spotify_id NOT IN (SELECT spotify_id FROM spotify_list_tracks)",
            [],
        )?;

        let refused = serde_json::to_string(&changes.refused).unwrap_or_else(|_| "[]".to_string());
        self.set_setting(REFUSED_SETTING, &refused)?;

        tx.commit()?;
        Ok(changed)
    }

    /// Inserts or updates a list. A list stored for the first time gets
    /// `last_opened_at = now`: its first sync is the baseline. Returns true
    /// when the list is new, renamed or moved.
    fn upsert_spotify_list(
        &self,
        existing: &HashMap<String, (String, i64)>,
        list: ListUpsert<'_>,
        now_ms: i64,
    ) -> Result<bool> {
        self.conn.execute(
            "INSERT INTO spotify_lists (id, name, snapshot_id, position, track_count, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                snapshot_id = excluded.snapshot_id,
                position = excluded.position,
                track_count = excluded.track_count",
            params![list.id, list.name, list.snapshot_id, list.position, list.total, now_ms],
        )?;
        Ok(match existing.get(list.id) {
            None => true,
            Some((name, position)) => name != list.name || *position != list.position,
        })
    }

    fn upsert_spotify_track(&self, track: &SpotifyTrack) -> Result<()> {
        self.conn.execute(
            "INSERT INTO spotify_tracks (spotify_id, title, artists, album, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(spotify_id) DO UPDATE SET
                title = excluded.title,
                artists = excluded.artists,
                album = excluded.album,
                duration_ms = excluded.duration_ms",
            params![track.spotify_id, track.title, track.artists, track.album, track.duration_ms],
        )?;
        Ok(())
    }

    /// Adds pairs that are not there yet, first seen now. Existing pairs are
    /// left exactly as they are. Returns how many were added.
    fn add_spotify_pairs(&self, list_id: &str, entries: &[ListEntry], now_ms: i64) -> Result<usize> {
        let mut added = 0;
        for entry in entries {
            self.upsert_spotify_track(&entry.track)?;
            added += self.conn.execute(
                "INSERT OR IGNORE INTO spotify_list_tracks (list_id, spotify_id, added_at, first_seen_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![list_id, entry.track.spotify_id, entry.added_at, now_ms],
            )?;
        }
        Ok(added)
    }

    /// A full read of a list: add what is new, delete what Spotify no longer
    /// returns, leave the rest. Delete-then-insert would mark the whole list new.
    fn replace_spotify_pairs(&self, list_id: &str, entries: &[ListEntry], now_ms: i64) -> Result<bool> {
        let before: HashSet<String> = {
            let mut stmt = self
                .conn
                .prepare("SELECT spotify_id FROM spotify_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([list_id], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let added = self.add_spotify_pairs(list_id, entries, now_ms)?;

        let wanted: HashSet<&str> = entries.iter().map(|e| e.track.spotify_id.as_str()).collect();
        let mut removed = 0;
        for gone in before.iter().filter(|id| !wanted.contains(id.as_str())) {
            removed += self.conn.execute(
                "DELETE FROM spotify_list_tracks WHERE list_id = ?1 AND spotify_id = ?2",
                params![list_id, gone],
            )?;
        }
        Ok(added + removed > 0)
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test db::spotify`
Expected: PASS, 16 tests (7 from Task 6, 9 new).

- [ ] **Step 6: Lint**

Run: `cd src-tauri && cargo clippy --all-targets 2>&1 | grep -A5 "db/spotify.rs" | head -40`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/spotify.rs
git commit -m "feat(spotify): store a sync so that only what arrived since a list was opened reads as new

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Reading Spotify's answers

**Files:**
- Create: `src-tauri/src/external/spotify.rs`
- Modify: `src-tauri/src/external/mod.rs`

Pure functions only: errors, paging, parsing. They are tested on small hand-written JSON. Spotify responses contain someone's library, so captured ones are never committed (the same rule as the YouTube fixtures).

- [ ] **Step 1: Declare the module**

In `src-tauri/src/external/mod.rs` add, after `pub mod youtube_time;`:

```rust
pub mod spotify;
```

- [ ] **Step 2: Write the module with its tests**

```rust
// src-tauri/src/external/spotify.rs
//! Spotify Web API: paging, parsing, and the rule that keeps a sync cheap —
//! read Liked Songs newest-first and stop at the first track already known.
//!
//! The network sits behind `SpotifyApi` (Task 9) so the sync can be tested on
//! hand-written JSON. Captured responses contain someone's library and are
//! never committed — the same rule as the YouTube fixtures.
//!
//! Since February 2026 a playlist's contents are `GET /playlists/{id}/items`,
//! each item carries its track under `item` (`track` is a deprecated alias),
//! and a playlist's count is `items.total` (formerly `tracks.total`). Both
//! spellings are read.

use crate::db::spotify::{ListEntry, PlaylistMeta, SpotifyTrack};
use serde_json::Value;

pub const API_BASE: &str = "https://api.spotify.com/v1";
/// Spotify's largest page on every endpoint used here.
pub const PAGE_LIMIT: u32 = 50;

#[derive(Debug, Clone, PartialEq)]
pub enum SpotifyError {
    /// No account connected.
    NotConnected,
    /// The refresh token was revoked or expired (`invalid_grant`): sign in again.
    Reconnect,
    /// Spotify could not be reached, or answered with something unreadable.
    Network(String),
    /// Spotify answered with an error status.
    Api { status: u16, message: String, reason: Option<String> },
    /// A 429 whose Retry-After is longer than a sync waits.
    RateLimited { retry_after_secs: u64 },
}

impl std::fmt::Display for SpotifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConnected => write!(f, "Spotify is not connected"),
            Self::Reconnect => write!(f, "Spotify needs you to sign in again"),
            Self::Network(message) => write!(f, "{message}"),
            Self::Api { status, message, .. } => write!(f, "Spotify answered {status}: {message}"),
            Self::RateLimited { retry_after_secs } => write!(
                f,
                "Spotify asked to wait {retry_after_secs} s before more requests — the next sync will try again"
            ),
        }
    }
}

impl std::error::Error for SpotifyError {}

pub fn liked_url() -> String {
    format!("{API_BASE}/me/tracks?limit={PAGE_LIMIT}")
}

pub fn playlists_url() -> String {
    format!("{API_BASE}/me/playlists?limit={PAGE_LIMIT}")
}

pub fn playlist_items_url(playlist_id: &str) -> String {
    format!("{API_BASE}/playlists/{playlist_id}/items?limit={PAGE_LIMIT}&additional_types=track")
}

/// One page of a paging object.
#[derive(Debug, Clone, PartialEq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// The URL of the next page, exactly as Spotify gives it.
    pub next: Option<String>,
    /// What Spotify says the whole list holds.
    pub total: i64,
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn page_of<T>(page: &Value, parse: impl Fn(&Value) -> Option<T>) -> Page<T> {
    Page {
        items: page
            .get("items")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(&parse).collect())
            .unwrap_or_default(),
        next: text(page, "next"),
        total: page.get("total").and_then(Value::as_i64).unwrap_or(0),
    }
}

/// An entry of Liked Songs or of a playlist, or None for what this section
/// skips: podcast episodes, local files (no Spotify id), and removed tracks
/// (null).
pub fn parse_entry(item: &Value) -> Option<ListEntry> {
    let track = item
        .get("item")
        .filter(|v| v.is_object())
        .or_else(|| item.get("track").filter(|v| v.is_object()))?;

    let local = |v: &Value| v.get("is_local").and_then(Value::as_bool).unwrap_or(false);
    if local(item) || local(track) {
        return None;
    }
    if track.get("type").and_then(Value::as_str).unwrap_or("track") != "track" {
        return None;
    }
    let id = track.get("id").and_then(Value::as_str).filter(|id| !id.is_empty())?;

    let artists = track
        .get("artists")
        .and_then(Value::as_array)
        .map(|artists| {
            artists
                .iter()
                .filter_map(|a| a.get("name").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    Some(ListEntry {
        track: SpotifyTrack {
            spotify_id: id.to_string(),
            title: text(track, "name").unwrap_or_default(),
            artists,
            album: track.pointer("/album/name").and_then(Value::as_str).map(str::to_string),
            duration_ms: track.get("duration_ms").and_then(Value::as_i64),
        },
        added_at: text(item, "added_at"),
    })
}

pub fn parse_entry_page(page: &Value) -> Page<ListEntry> {
    page_of(page, parse_entry)
}

fn parse_playlist(item: &Value) -> Option<PlaylistMeta> {
    let total = item
        .pointer("/items/total")
        .or_else(|| item.pointer("/tracks/total"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    Some(PlaylistMeta {
        id: text(item, "id")?,
        name: text(item, "name").unwrap_or_default(),
        snapshot_id: text(item, "snapshot_id")?,
        total,
    })
}

pub fn parse_playlist_page(page: &Value) -> Page<PlaylistMeta> {
    page_of(page, parse_playlist)
}

/// Spotify's error body, `{"error":{"status":404,"message":"…","reason":"…"}}`,
/// or the accounts service's flat OAuth one, `{"error":"…","error_description":"…"}`.
pub fn api_error(status: u16, body: &str) -> SpotifyError {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let nested = parsed.as_ref().and_then(|v| v.get("error")).filter(|e| e.is_object());
    let message = nested
        .and_then(|e| e.get("message"))
        .or_else(|| parsed.as_ref().and_then(|v| v.get("error_description")))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| body.chars().take(200).collect());
    let reason = nested.and_then(|e| text(e, "reason"));
    SpotifyError::Api { status, message, reason }
}

/// A playlist Spotify will not share: 403 for playlists the user neither owns
/// nor collaborates on (development-mode apps, since February 2026), 404 for
/// editorial and algorithmic ones (since November 2024).
pub fn is_refusal(err: &SpotifyError) -> bool {
    matches!(err, SpotifyError::Api { status: 403 | 404, .. })
}

/// Whether a failed play should open the track in the Spotify app instead.
///
/// The reasons are documented by name; their statuses (404 for no active
/// device, 403 for no Premium) only by the community, so a bare 403 / 404
/// counts too. With no working sign-in, the app can still play it.
pub fn should_open_app(err: &SpotifyError) -> bool {
    match err {
        SpotifyError::Api { reason: Some(reason), .. }
            if reason == "NO_ACTIVE_DEVICE" || reason == "PREMIUM_REQUIRED" =>
        {
            true
        }
        SpotifyError::Api { status: 403 | 404, .. } => true,
        SpotifyError::NotConnected | SpotifyError::Reconnect => true,
        _ => false,
    }
}

/// Seconds from a Retry-After header. Spotify sends whole seconds.
pub fn retry_after_secs(header: Option<&str>) -> u64 {
    header.and_then(|v| v.trim().parse().ok()).unwrap_or(1)
}

/// The name Settings shows: `display_name`, which may be null, else the id.
pub fn profile_name(me: &Value) -> String {
    text(me, "display_name")
        .filter(|name| !name.trim().is_empty())
        .or_else(|| text(me, "id"))
        .unwrap_or_else(|| "your Spotify account".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    pub(super) fn track_json(id: &str, name: &str) -> Value {
        json!({
            "id": id, "name": name, "type": "track", "is_local": false,
            "duration_ms": 412000,
            "artists": [{ "name": "Moreno & Prieto" }, { "name": "Sortech" }],
            "album": { "name": "300 Cash EP" }
        })
    }

    fn ids(entries: &[ListEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.track.spotify_id.as_str()).collect()
    }

    #[test]
    fn reads_a_page_of_liked_songs() {
        let page = json!({
            "href": "https://api.spotify.com/v1/me/tracks?offset=0&limit=50",
            "limit": 50, "offset": 0, "previous": null, "total": 731,
            "next": "https://api.spotify.com/v1/me/tracks?offset=50&limit=50",
            "items": [{ "added_at": "2026-10-03T07:12:00Z", "track": track_json("sp1", "300 Cash") }]
        });
        let parsed = parse_entry_page(&page);
        assert_eq!(parsed.total, 731);
        assert_eq!(
            parsed.next.as_deref(),
            Some("https://api.spotify.com/v1/me/tracks?offset=50&limit=50")
        );
        assert_eq!(
            parsed.items,
            vec![ListEntry {
                track: SpotifyTrack {
                    spotify_id: "sp1".to_string(),
                    title: "300 Cash".to_string(),
                    artists: "Moreno & Prieto, Sortech".to_string(),
                    album: Some("300 Cash EP".to_string()),
                    duration_ms: Some(412000),
                },
                added_at: Some("2026-10-03T07:12:00Z".to_string()),
            }]
        );
    }

    #[test]
    fn reads_playlist_items_under_item_and_under_the_deprecated_track() {
        let page = json!({ "total": 2, "next": null, "items": [
            { "added_at": "2026-09-01T00:00:00Z", "is_local": false, "item": track_json("sp1", "A") },
            { "added_at": "2026-09-02T00:00:00Z", "is_local": false, "track": track_json("sp2", "B") }
        ]});
        let parsed = parse_entry_page(&page);
        assert_eq!(ids(&parsed.items), ["sp1", "sp2"]);
        assert_eq!(parsed.next, None);
    }

    #[test]
    fn skips_episodes_local_files_and_removed_tracks() {
        let page = json!({ "total": 4, "next": null, "items": [
            { "added_at": "2026-09-01T00:00:00Z", "item": { "id": "ep1", "type": "episode", "name": "A podcast" } },
            { "added_at": "2026-09-01T00:00:00Z", "is_local": true,
              "item": { "id": null, "type": "track", "name": "My own file", "is_local": true } },
            { "added_at": "2026-09-01T00:00:00Z", "item": null, "track": null },
            { "added_at": "2026-09-01T00:00:00Z", "item": track_json("sp9", "Kept") }
        ]});
        let parsed = parse_entry_page(&page);
        assert_eq!(ids(&parsed.items), ["sp9"]);
        assert_eq!(parsed.total, 4, "the total still counts what was skipped");
    }

    #[test]
    fn reads_playlists_and_their_totals_under_either_name() {
        let page = json!({ "total": 4, "next": null, "items": [
            { "id": "p1", "name": "Tech House", "snapshot_id": "s1", "items": { "href": "x", "total": 281 } },
            { "id": "p2", "name": "Old", "snapshot_id": "s2", "tracks": { "total": 12 } },
            { "id": "p3", "name": "No count", "snapshot_id": "s3" },
            { "id": "p4", "name": "No snapshot" }
        ]});
        let parsed = parse_playlist_page(&page);
        assert_eq!(
            parsed.items,
            vec![
                PlaylistMeta { id: "p1".into(), name: "Tech House".into(), snapshot_id: "s1".into(), total: 281 },
                PlaylistMeta { id: "p2".into(), name: "Old".into(), snapshot_id: "s2".into(), total: 12 },
                PlaylistMeta { id: "p3".into(), name: "No count".into(), snapshot_id: "s3".into(), total: 0 },
            ]
        );
    }

    #[test]
    fn reads_spotify_error_bodies() {
        assert_eq!(
            api_error(
                404,
                r#"{"error":{"status":404,"message":"Player command failed: No active device found","reason":"NO_ACTIVE_DEVICE"}}"#
            ),
            SpotifyError::Api {
                status: 404,
                message: "Player command failed: No active device found".to_string(),
                reason: Some("NO_ACTIVE_DEVICE".to_string()),
            }
        );
        assert_eq!(
            api_error(400, r#"{"error":"invalid_client","error_description":"Invalid client"}"#),
            SpotifyError::Api { status: 400, message: "Invalid client".to_string(), reason: None }
        );
        assert_eq!(
            api_error(502, "<html>Bad gateway</html>"),
            SpotifyError::Api { status: 502, message: "<html>Bad gateway</html>".to_string(), reason: None }
        );
    }

    fn api(status: u16, reason: Option<&str>) -> SpotifyError {
        SpotifyError::Api { status, message: String::new(), reason: reason.map(str::to_string) }
    }

    #[test]
    fn a_playlist_is_refused_with_403_or_404() {
        assert!(is_refusal(&api(403, None)));
        assert!(is_refusal(&api(404, None)));
        assert!(!is_refusal(&api(500, None)));
        assert!(!is_refusal(&SpotifyError::Network("offline".into())));
    }

    #[test]
    fn opens_the_spotify_app_when_playing_here_cannot_work() {
        assert!(should_open_app(&api(404, Some("NO_ACTIVE_DEVICE"))));
        assert!(should_open_app(&api(403, Some("PREMIUM_REQUIRED"))));
        assert!(should_open_app(&api(404, None)));
        assert!(should_open_app(&api(403, None)));
        assert!(should_open_app(&SpotifyError::NotConnected));
        assert!(should_open_app(&SpotifyError::Reconnect));
        assert!(!should_open_app(&api(500, None)));
        assert!(!should_open_app(&api(401, None)));
        assert!(!should_open_app(&SpotifyError::Network("offline".into())));
    }

    #[test]
    fn reads_retry_after() {
        assert_eq!(retry_after_secs(Some("7")), 7);
        assert_eq!(retry_after_secs(Some(" 30 ")), 30);
        assert_eq!(retry_after_secs(Some("soon")), 1);
        assert_eq!(retry_after_secs(None), 1);
    }

    #[test]
    fn names_the_account_by_display_name_or_id() {
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": "Nemanja" })), "Nemanja");
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": null })), "nm93");
        assert_eq!(profile_name(&json!({ "id": "nm93", "display_name": " " })), "nm93");
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test external::spotify`
Expected: PASS, 9 tests.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/external/spotify.rs src-tauri/src/external/mod.rs
git commit -m "feat(spotify): read Liked Songs, playlists and errors from the Web API's answers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: What a sync fetches

**Files:**
- Modify: `src-tauri/src/external/spotify.rs`

- **Liked Songs:** read newest-first and stop at the first known track. Then check `total`: the stored total plus the new likes read must equal Spotify's new total. If it does not, something was unliked (invisible to newest-first reading), so Liked Songs is read again in full.
- **Playlists:** an unchanged `snapshot_id` is skipped. A changed or new one is read in full. A 403 or 404 means refused, and is not asked for again until its snapshot changes.

- [ ] **Step 1: Write the failing tests** (inside `mod tests` of `external/spotify.rs`)

```rust
    // --- what a sync fetches ------------------------------------------

    use crate::db::spotify::{LikedChange, SyncBaseline};
    use std::collections::{HashMap, HashSet};
    use std::future::Future;
    use std::sync::Mutex;

    /// Replays hand-written pages by URL and records what was asked for.
    #[derive(Default)]
    struct FakeApi {
        pages: HashMap<String, Result<Value, SpotifyError>>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeApi {
        fn page(mut self, url: &str, body: Value) -> Self {
            self.pages.insert(url.to_string(), Ok(body));
            self
        }

        fn fail(mut self, url: &str, err: SpotifyError) -> Self {
            self.pages.insert(url.to_string(), Err(err));
            self
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl SpotifyApi for FakeApi {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
            self.calls.lock().unwrap().push(url.to_string());
            let answer = self
                .pages
                .get(url)
                .cloned()
                .unwrap_or_else(|| Err(SpotifyError::Network(format!("no page for {url}"))));
            async move { answer }
        }
    }

    const LIKED_PAGE_2: &str = "https://api.spotify.com/v1/me/tracks?offset=50&limit=50";

    fn liked_item(id: &str) -> Value {
        json!({ "added_at": "2026-10-01T00:00:00Z", "track": track_json(id, id) })
    }

    fn playlist_item(id: &str) -> Value {
        json!({ "added_at": "2026-10-01T00:00:00Z", "is_local": false, "item": track_json(id, id) })
    }

    fn page(items: Vec<Value>, next: Option<&str>, total: i64) -> Value {
        json!({ "items": items, "next": next, "total": total })
    }

    fn playlists(metas: &[(&str, &str)]) -> Value {
        page(
            metas
                .iter()
                .map(|(id, snapshot)| {
                    json!({ "id": id, "name": format!("List {id}"), "snapshot_id": snapshot, "items": { "total": 1 } })
                })
                .collect(),
            None,
            metas.len() as i64,
        )
    }

    fn known(ids: &[&str], total: i64) -> SyncBaseline {
        SyncBaseline {
            liked_known: ids.iter().map(|id| id.to_string()).collect::<HashSet<_>>(),
            liked_total: Some(total),
            ..SyncBaseline::default()
        }
    }

    #[tokio::test]
    async fn the_first_sync_reads_everything() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("b")], Some(LIKED_PAGE_2), 3))
            .page(LIKED_PAGE_2, page(vec![liked_item("c")], None, 3))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .page(&playlist_items_url("p1"), page(vec![playlist_item("b")], None, 1));

        let changes = fetch_changes(&api, &SyncBaseline::default()).await.unwrap();

        match &changes.liked {
            LikedChange::Full { entries, total } => {
                assert_eq!(ids(entries), ["a", "b", "c"]);
                assert_eq!(*total, 3);
            }
            other => panic!("expected a full read, got {other:?}"),
        }
        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert_eq!(ids(&changes.refetched["p1"]), ["b"]);
        assert!(changes.refused.is_empty());
    }

    #[tokio::test]
    async fn liked_songs_stop_at_the_first_known_track() {
        let api = FakeApi::default()
            .page(
                &liked_url(),
                page(vec![liked_item("new"), liked_item("a"), liked_item("b")], Some(LIKED_PAGE_2), 3),
            )
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b"], 2)).await.unwrap();

        assert_eq!(
            changes.liked,
            LikedChange::Prepend { entries: vec![parse_entry(&liked_item("new")).unwrap()], total: 3 }
        );
        // The second page was never asked for.
        assert_eq!(api.calls(), vec![liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn nothing_new_costs_one_request_for_liked_songs() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("b")], None, 2))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b"], 2)).await.unwrap();

        assert_eq!(changes.liked, LikedChange::Unchanged { total: 2 });
        assert_eq!(api.calls(), vec![liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn an_unlike_makes_the_total_disagree_and_liked_songs_is_read_again_in_full() {
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a"), liked_item("c")], None, 2))
            .page(&playlists_url(), playlists(&[]));

        let changes = fetch_changes(&api, &known(&["a", "b", "c"], 3)).await.unwrap();

        match &changes.liked {
            LikedChange::Full { entries, total } => {
                assert_eq!(ids(entries), ["a", "c"]);
                assert_eq!(*total, 2);
            }
            other => panic!("expected a full read, got {other:?}"),
        }
        assert_eq!(api.calls(), vec![liked_url(), liked_url(), playlists_url()]);
    }

    #[tokio::test]
    async fn an_unchanged_playlist_is_not_read_again() {
        let mut base = known(&["a"], 1);
        base.snapshots.insert("p1".to_string(), "s1".to_string());
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1"), ("p2", "s7")]))
            .page(&playlist_items_url("p2"), page(vec![playlist_item("x")], None, 1));

        let changes = fetch_changes(&api, &base).await.unwrap();

        assert_eq!(changes.playlists.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1", "p2"]);
        assert_eq!(changes.refetched.keys().collect::<Vec<_>>(), ["p2"]);
        assert!(!api.calls().contains(&playlist_items_url("p1")));
    }

    #[tokio::test]
    async fn a_changed_playlist_is_read_in_full_across_pages() {
        let mut base = known(&["a"], 1);
        base.snapshots.insert("p1".to_string(), "s1".to_string());
        let second = "https://api.spotify.com/v1/playlists/p1/items?offset=50&limit=50";
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s2")]))
            .page(&playlist_items_url("p1"), page(vec![playlist_item("x")], Some(second), 2))
            .page(second, page(vec![playlist_item("y")], None, 2));

        let changes = fetch_changes(&api, &base).await.unwrap();

        assert_eq!(ids(&changes.refetched["p1"]), ["x", "y"]);
    }

    #[tokio::test]
    async fn a_playlist_spotify_will_not_share_is_listed_and_not_asked_for_again() {
        let forbidden = SpotifyError::Api { status: 403, message: "Forbidden".into(), reason: None };
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .fail(&playlist_items_url("p1"), forbidden);

        let changes = fetch_changes(&api, &known(&["a"], 1)).await.unwrap();
        assert_eq!(changes.refused.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p1"]);
        assert!(changes.playlists.is_empty());
        assert!(changes.refetched.is_empty());

        // Next time, with the same snapshot, it is not asked for at all.
        let mut base = known(&["a"], 1);
        base.refused.insert("p1".to_string(), "s1".to_string());
        let again = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]));
        let changes = fetch_changes(&again, &base).await.unwrap();
        assert_eq!(changes.refused.len(), 1);
        assert!(!again.calls().contains(&playlist_items_url("p1")));
    }

    #[tokio::test]
    async fn any_other_failure_fails_the_sync() {
        let broken = SpotifyError::Api { status: 500, message: "Server error".into(), reason: None };
        let api = FakeApi::default()
            .page(&liked_url(), page(vec![liked_item("a")], None, 1))
            .page(&playlists_url(), playlists(&[("p1", "s1")]))
            .fail(&playlist_items_url("p1"), broken.clone());

        assert_eq!(fetch_changes(&api, &known(&["a"], 1)).await, Err(broken));
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::spotify`
Expected: compile errors — `cannot find trait SpotifyApi`, `cannot find function fetch_changes`.

- [ ] **Step 3: Implement** (in `external/spotify.rs`, above `#[cfg(test)]`; extend the imports at the top to the ones shown)

```rust
use crate::db::spotify::{LikedChange, ListEntry, PlaylistMeta, SpotifyTrack, SyncBaseline, SyncChanges};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
```

```rust
// --- what a sync fetches ----------------------------------------------

/// One GET against the Web API, answering with the JSON body. The live client
/// adds the token and waits out 429s; tests replay hand-written pages.
pub trait SpotifyApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send;
}

/// Every page from `first_url` on. The total is the first page's.
async fn fetch_all<A: SpotifyApi + Sync>(
    api: &A,
    first_url: String,
) -> Result<(Vec<ListEntry>, i64), SpotifyError> {
    let mut entries = Vec::new();
    let mut total = None;
    let mut url = Some(first_url);
    while let Some(current) = url {
        let page = parse_entry_page(&api.get_json(&current).await?);
        total.get_or_insert(page.total);
        entries.extend(page.items);
        url = page.next;
    }
    Ok((entries, total.unwrap_or(0)))
}

async fn fetch_liked<A: SpotifyApi + Sync>(
    api: &A,
    base: &SyncBaseline,
) -> Result<LikedChange, SpotifyError> {
    let Some(stored_total) = base.liked_total else {
        let (entries, total) = fetch_all(api, liked_url()).await?;
        return Ok(LikedChange::Full { entries, total });
    };

    let mut fresh = Vec::new();
    let mut total = None;
    let mut reached_known = false;
    let mut url = Some(liked_url());
    'pages: while let Some(current) = url.take() {
        let page = parse_entry_page(&api.get_json(&current).await?);
        total.get_or_insert(page.total);
        for entry in page.items {
            if base.liked_known.contains(&entry.track.spotify_id) {
                reached_known = true;
                break 'pages;
            }
            fresh.push(entry);
        }
        url = page.next;
    }
    let total = total.unwrap_or(0);

    // Read to the end without meeting a known track: what was read is all of it.
    if !reached_known {
        return Ok(LikedChange::Full { entries: fresh, total });
    }
    if stored_total + fresh.len() as i64 == total {
        return Ok(if fresh.is_empty() {
            LikedChange::Unchanged { total }
        } else {
            LikedChange::Prepend { entries: fresh, total }
        });
    }

    // The total no longer adds up: something was unliked, which reading
    // newest-first cannot see. Read it all again.
    let (entries, total) = fetch_all(api, liked_url()).await?;
    Ok(LikedChange::Full { entries, total })
}

pub async fn fetch_changes<A: SpotifyApi + Sync>(
    api: &A,
    base: &SyncBaseline,
) -> Result<SyncChanges, SpotifyError> {
    let liked = fetch_liked(api, base).await?;

    let mut listed = Vec::new();
    let mut url = Some(playlists_url());
    while let Some(current) = url {
        let page = parse_playlist_page(&api.get_json(&current).await?);
        listed.extend(page.items);
        url = page.next;
    }

    let mut playlists = Vec::new();
    let mut refetched = HashMap::new();
    let mut refused = Vec::new();
    for meta in listed {
        if base.snapshots.get(&meta.id) == Some(&meta.snapshot_id) {
            playlists.push(meta);
            continue;
        }
        if base.refused.get(&meta.id) == Some(&meta.snapshot_id) {
            refused.push(meta);
            continue;
        }
        match fetch_all(api, playlist_items_url(&meta.id)).await {
            Ok((entries, _)) => {
                refetched.insert(meta.id.clone(), entries);
                playlists.push(meta);
            }
            Err(err) if is_refusal(&err) => refused.push(meta),
            Err(err) => return Err(err),
        }
    }

    Ok(SyncChanges { liked, playlists, refetched, refused })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test external::spotify`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/external/spotify.rs
git commit -m "feat(spotify): fetch only what changed — new likes, changed playlists — and note what Spotify will not share

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Signing in (PKCE) and the live client

**Files:**
- Create: `src-tauri/src/external/spotify_auth.rs`
- Modify: `src-tauri/src/external/spotify.rs` (the live client, play, profile)
- Modify: `src-tauri/src/external/mod.rs`

No new crates. `sha2` and `rand` are already dependencies, and base64url is twelve lines.

- [ ] **Step 1: Declare the module**

In `external/mod.rs`, after `pub mod spotify;`, add:

```rust
pub mod spotify_auth;
```

- [ ] **Step 2: Write the auth module with its tests**

```rust
// src-tauri/src/external/spotify_auth.rs
//! Signing in to Spotify: Authorization Code with PKCE. No client secret
//! exists anywhere — the user's own Client ID plus a one-off verifier stand in
//! for it, which is what lets a desktop app hold no secret.

use crate::external::spotify::{api_error, SpotifyError};
use rand::{distributions::Alphanumeric, Rng};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::Duration;

pub const AUTHORIZE_URL: &str = "https://accounts.spotify.com/authorize";
pub const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
/// Fixed, so the instructions can name one URI to register. Loopback must be
/// an explicit IP: Spotify refuses `localhost`.
pub const REDIRECT_PORT: u16 = 47816;
pub const REDIRECT_URI: &str = "http://127.0.0.1:47816/callback";
pub const SCOPES: &str = "user-library-read playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state";

/// RFC 4648 base64url without padding — what PKCE's S256 challenge is written in.
pub fn base64url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        // 1 byte → 2 characters, 2 → 3, 3 → 4.
        for i in 0..=chunk.len() {
            out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// Letters and digits — inside PKCE's allowed set, and safe in a URL.
pub fn random_string(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

pub fn code_challenge(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

pub fn authorize_url(client_id: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={}&scope={}&redirect_uri={}&code_challenge_method=S256&code_challenge={}&state={}",
        urlencoding::encode(client_id),
        urlencoding::encode(SCOPES),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(challenge),
        urlencoding::encode(state),
    )
}

#[derive(Debug, Clone, PartialEq)]
pub struct TokenSet {
    pub access_token: String,
    /// Seconds.
    pub expires_in: i64,
    /// Present on a login. On a refresh only when Spotify rotates it — then
    /// the new one replaces the stored one.
    pub refresh_token: Option<String>,
}

/// The token endpoint's answer. `invalid_grant` on a refresh means the
/// refresh token was revoked or expired: the user has to sign in again.
pub fn parse_token_response(status: u16, body: &str) -> Result<TokenSet, SpotifyError> {
    if !(200..300).contains(&status) {
        let flat = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string));
        if flat.as_deref() == Some("invalid_grant") {
            return Err(SpotifyError::Reconnect);
        }
        return Err(api_error(status, body));
    }

    let value: Value = serde_json::from_str(body).map_err(|e| {
        SpotifyError::Network(format!("Spotify sent an unreadable token response: {e}"))
    })?;
    let access_token = value
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| SpotifyError::Network("Spotify sent no access token".to_string()))?
        .to_string();
    Ok(TokenSet {
        access_token,
        expires_in: value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600),
        refresh_token: value.get("refresh_token").and_then(Value::as_str).map(str::to_string),
    })
}

async fn post_token(form: &[(&str, &str)]) -> Result<TokenSet, SpotifyError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| SpotifyError::Network(format!("Could not build HTTP client: {e}")))?;
    let response = client
        .post(TOKEN_URL)
        .form(form)
        .send()
        .await
        .map_err(|e| SpotifyError::Network(format!("Could not reach Spotify: {e}")))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| SpotifyError::Network(format!("Could not read Spotify's answer: {e}")))?;
    parse_token_response(status, &body)
}

pub async fn exchange_code(client_id: &str, code: &str, verifier: &str) -> Result<TokenSet, SpotifyError> {
    post_token(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", client_id),
        ("code_verifier", verifier),
    ])
    .await
}

pub async fn refresh(client_id: &str, refresh_token: &str) -> Result<TokenSet, SpotifyError> {
    post_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ])
    .await
}

/// The code the browser brought back, if it belongs to this login.
pub fn code_from_callback(params: &HashMap<String, String>, expected_state: &str) -> Result<String, String> {
    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err("The sign-in answer did not match this login — press Connect to try again".to_string());
    }
    if let Some(error) = params.get("error") {
        return Err(if error == "access_denied" {
            "Spotify sign-in was cancelled".to_string()
        } else {
            format!("Spotify refused the sign-in: {error}")
        });
    }
    params
        .get("code")
        .filter(|code| !code.is_empty())
        .cloned()
        .ok_or_else(|| "Spotify sent no sign-in code — press Connect to try again".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_follows_rfc_4648_without_padding() {
        let cases = [
            ("", ""),
            ("f", "Zg"),
            ("fo", "Zm8"),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg"),
            ("fooba", "Zm9vYmE"),
            ("foobar", "Zm9vYmFy"),
        ];
        for (input, expected) in cases {
            assert_eq!(base64url(input.as_bytes()), expected, "for {input:?}");
        }
        // The URL-safe alphabet: 62 and 63 are '-' and '_'.
        assert_eq!(base64url(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn the_challenge_matches_rfc_7636_appendix_b() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_verifier_is_long_enough_and_uses_only_allowed_characters() {
        let verifier = random_string(64);
        assert_eq!(verifier.len(), 64);
        assert!(verifier.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_ne!(verifier, random_string(64));
    }

    #[test]
    fn the_authorize_url_carries_everything_spotify_asks_for() {
        let url = authorize_url("abc123", "CH", "ST");
        assert!(url.starts_with("https://accounts.spotify.com/authorize?"));
        for part in [
            "response_type=code",
            "client_id=abc123",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A47816%2Fcallback",
            "code_challenge_method=S256",
            "code_challenge=CH",
            "state=ST",
            "scope=user-library-read%20playlist-read-private%20playlist-read-collaborative%20user-read-playback-state%20user-modify-playback-state",
        ] {
            assert!(url.contains(part), "{url} lacks {part}");
        }
    }

    #[test]
    fn reads_a_token_response() {
        let body = r#"{"access_token":"AT","token_type":"Bearer","scope":"x","expires_in":3600,"refresh_token":"RT"}"#;
        assert_eq!(
            parse_token_response(200, body),
            Ok(TokenSet { access_token: "AT".into(), expires_in: 3600, refresh_token: Some("RT".into()) })
        );
    }

    #[test]
    fn a_refresh_without_a_new_refresh_token_keeps_the_old_one() {
        let body = r#"{"access_token":"AT2","token_type":"Bearer","expires_in":3600}"#;
        assert_eq!(parse_token_response(200, body).unwrap().refresh_token, None);
    }

    #[test]
    fn a_revoked_refresh_token_means_signing_in_again() {
        let body = r#"{"error":"invalid_grant","error_description":"Refresh token revoked"}"#;
        assert_eq!(parse_token_response(400, body), Err(SpotifyError::Reconnect));
    }

    #[test]
    fn other_token_errors_are_reported_as_spotify_said_them() {
        let body = r#"{"error":"invalid_client","error_description":"Invalid client"}"#;
        assert_eq!(
            parse_token_response(400, body),
            Err(SpotifyError::Api { status: 400, message: "Invalid client".into(), reason: None })
        );
    }

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn the_code_comes_back_with_this_logins_state() {
        assert_eq!(code_from_callback(&params(&[("code", "C"), ("state", "S")]), "S"), Ok("C".into()));
    }

    #[test]
    fn an_answer_for_another_login_is_refused() {
        let err = code_from_callback(&params(&[("code", "C"), ("state", "X")]), "S").unwrap_err();
        assert!(err.contains("did not match"));
    }

    #[test]
    fn a_cancelled_sign_in_says_so() {
        assert_eq!(
            code_from_callback(&params(&[("error", "access_denied"), ("state", "S")]), "S"),
            Err("Spotify sign-in was cancelled".into())
        );
    }

    #[test]
    fn no_code_is_an_error() {
        assert!(code_from_callback(&params(&[("state", "S")]), "S").is_err());
    }
}
```

- [ ] **Step 3: The live client, play and profile** (append to `external/spotify.rs`, above `#[cfg(test)]`; add `use std::time::Duration;` to its imports)

```rust
// --- the live client ----------------------------------------------------

/// The longest Retry-After a sync waits out. A development-mode quota can ask
/// for hours; then this sync gives up and the next 10-minute run tries again.
pub const MAX_RETRY_WAIT_SECS: u64 = 60;
const MAX_ATTEMPTS: usize = 4;

fn http_client() -> Result<reqwest::Client, SpotifyError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| SpotifyError::Network(format!("Could not build HTTP client: {e}")))
}

fn network(e: reqwest::Error) -> SpotifyError {
    if e.is_timeout() {
        SpotifyError::Network("Spotify did not answer in 30 seconds".to_string())
    } else {
        SpotifyError::Network(format!("Could not reach Spotify: {e}"))
    }
}

pub struct LiveApi {
    http: reqwest::Client,
    token: String,
}

impl LiveApi {
    pub fn new(token: String) -> Result<Self, SpotifyError> {
        Ok(Self { http: http_client()?, token })
    }
}

impl SpotifyApi for LiveApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, SpotifyError>> + Send {
        let url = url.to_string();
        async move {
            for _ in 0..MAX_ATTEMPTS {
                let response = self.http.get(&url).bearer_auth(&self.token).send().await.map_err(network)?;
                let status = response.status().as_u16();

                if status == 429 {
                    let wait = retry_after_secs(
                        response.headers().get("retry-after").and_then(|v| v.to_str().ok()),
                    );
                    if wait > MAX_RETRY_WAIT_SECS {
                        return Err(SpotifyError::RateLimited { retry_after_secs: wait });
                    }
                    tokio::time::sleep(Duration::from_secs(wait)).await;
                    continue;
                }

                let body = response.text().await.map_err(network)?;
                if !(200..300).contains(&status) {
                    return Err(api_error(status, &body));
                }
                return serde_json::from_str(&body)
                    .map_err(|e| SpotifyError::Network(format!("Spotify sent unreadable JSON: {e}")));
            }
            Err(SpotifyError::RateLimited { retry_after_secs: MAX_RETRY_WAIT_SECS })
        }
    }
}

/// Plays one track on the user's active device. 204 is success.
pub async fn play_track(token: &str, spotify_id: &str) -> Result<(), SpotifyError> {
    let response = http_client()?
        .put(format!("{API_BASE}/me/player/play"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "uris": [format!("spotify:track:{spotify_id}")] }))
        .send()
        .await
        .map_err(network)?;
    let status = response.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    Err(api_error(status, &body))
}

/// The connected account's name, for Settings.
pub async fn fetch_profile_name(token: &str) -> Result<String, SpotifyError> {
    let api = LiveApi::new(token.to_string())?;
    let me = api.get_json(&format!("{API_BASE}/me")).await?;
    Ok(profile_name(&me))
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test external::spotify`
Expected: PASS. `external::spotify::tests` has 17 tests and `external::spotify_auth::tests` has 12. The live client and play are not unit-tested, because they are the network. They are checked by hand in Task 20.

- [ ] **Step 5: Lint**

Run: `cd src-tauri && cargo clippy --all-targets 2>&1 | grep -B2 -A8 "external/spotify" | head -60`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/external/spotify_auth.rs src-tauri/src/external/spotify.rs src-tauri/src/external/mod.rs
git commit -m "feat(spotify): PKCE sign-in pieces, the token endpoint, and a client that waits out short rate limits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The loopback listener

**Files:**
- Modify: `src-tauri/src/external/spotify_auth.rs`

The listener runs on `127.0.0.1:47816` for the duration of one login only. It serves exactly one `/callback`, hands back the query parameters, and stops. If the port is taken, the error is one line. The tests use port 0, so they never clash with a real login.

- [ ] **Step 1: Write the failing tests** (inside `mod tests` of `spotify_auth.rs`)

```rust
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn the_listener_hands_back_what_the_browser_brought() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiting = tokio::spawn(wait_for_callback(listener, Duration::from_secs(5)));

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let page = client
            .get(format!("http://127.0.0.1:{port}/callback?code=C&state=S"))
            .send()
            .await
            .unwrap();
        assert_eq!(page.status().as_u16(), 200);
        assert!(page.text().await.unwrap().contains("close this tab"));

        let params = waiting.await.unwrap().unwrap();
        assert_eq!(params.get("code").map(String::as_str), Some("C"));
        assert_eq!(params.get("state").map(String::as_str), Some("S"));
    }

    #[tokio::test]
    async fn the_listener_gives_up_after_the_timeout() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let err = wait_for_callback(listener, Duration::from_millis(50)).await.unwrap_err();
        assert!(err.contains("No answer"));
    }

    #[tokio::test]
    async fn a_taken_port_is_said_in_one_line() {
        let holder = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = holder.local_addr().unwrap().port();
        let err = bind_listener(port).await.unwrap_err();
        assert!(err.contains(&port.to_string()));
        assert!(!err.contains('\n'));
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::spotify_auth`
Expected: compile errors — `cannot find function wait_for_callback` / `bind_listener`.

- [ ] **Step 3: Implement** (above `#[cfg(test)]`; extend the imports with the ones shown)

```rust
use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
    Router,
};
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
```

```rust
// --- the loopback redirect --------------------------------------------

/// How long a login waits for the browser.
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

const CLOSE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>RecoDeck</title>\
<body style=\"font-family:-apple-system,sans-serif;background:#121212;color:#fff;\
display:grid;place-items:center;height:100vh;margin:0\">\
<p>Signed in. You can close this tab and go back to RecoDeck.</p>";

type Reply = Arc<Mutex<Option<oneshot::Sender<HashMap<String, String>>>>>;

/// Binds the redirect port, or says in one line why it cannot.
pub async fn bind_listener(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind(("127.0.0.1", port)).await.map_err(|_| {
        format!(
            "Port {port} is in use by another app, so Spotify cannot hand the login back — close that app and press Connect again"
        )
    })
}

async fn callback(
    State(reply): State<Reply>,
    Query(params): Query<HashMap<String, String>>,
) -> Html<&'static str> {
    if let Some(sender) = reply.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = sender.send(params);
    }
    Html(CLOSE_PAGE)
}

/// Serves one redirect on `listener`, then stops listening. Answers with the
/// query parameters Spotify sent back.
pub async fn wait_for_callback(
    listener: TcpListener,
    timeout: Duration,
) -> Result<HashMap<String, String>, String> {
    let (sender, receiver) = oneshot::channel();
    let reply: Reply = Arc::new(Mutex::new(Some(sender)));
    let (stop, stopped) = oneshot::channel::<()>();

    let app = Router::new().route("/callback", get(callback)).with_state(reply);
    let server = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await;
    });

    let answer = tokio::time::timeout(timeout, receiver).await;

    let _ = stop.send(());
    // Let the page reach the browser and the port close, but never hang on it.
    let _ = tokio::time::timeout(Duration::from_secs(2), server).await;

    match answer {
        Ok(Ok(params)) => Ok(params),
        Ok(Err(_)) => Err("The sign-in listener stopped unexpectedly — press Connect to try again".to_string()),
        Err(_) => Err("No answer from the browser — press Connect to try again".to_string()),
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test external::spotify_auth`
Expected: PASS, 15 tests. These use loopback only, with no outside network.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/external/spotify_auth.rs
git commit -m "feat(spotify): listen on the loopback redirect for one login, and say so when the port is taken

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Tokens, the sync, the loop and the `spotify-synced` event

**Files:**
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/external/spotify.rs` (`From<SpotifyError> for AppError`)
- Modify: `src-tauri/src/commands/youtube.rs:51` (`with_db` becomes `pub(crate)`)
- Create: `src-tauri/src/commands/spotify.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

This mirrors `spawn_channel_watcher` (`commands/youtube.rs:1418`, started from `lib.rs`'s `setup`).
- It syncs on start and then every 10 minutes.
- After every sync (changed or not, and on failure) it emits `spotify-synced` with `{ changed, lastSyncedAt, error, needsReconnect }`.
- It does nothing while no account is connected, or while the account needs reconnecting.
- The database is opened by the frontend at start-up (`init_database`), so the loop waits for it first.

- [ ] **Step 1: Error variants**

In `src-tauri/src/error.rs`, add these variants at the end of `AppError`:

```rust
    #[error("Spotify is not connected -- connect it in Settings")]
    SpotifyNotConnected,

    #[error("Spotify needs you to sign in again")]
    SpotifyReconnect,

    #[error("{0}")]
    Spotify(String),
```

In `src-tauri/src/external/spotify.rs`, add above `#[cfg(test)]`:

```rust
impl From<SpotifyError> for crate::error::AppError {
    fn from(err: SpotifyError) -> Self {
        use crate::error::AppError;
        match err {
            SpotifyError::NotConnected => AppError::SpotifyNotConnected,
            SpotifyError::Reconnect => AppError::SpotifyReconnect,
            other => AppError::Spotify(other.to_string()),
        }
    }
}
```

- [ ] **Step 2: Share `with_db`**

In `src-tauri/src/commands/youtube.rs` line 51, change `fn with_db<T>(` to `pub(crate) fn with_db<T>(`. Nothing else changes in that file.

- [ ] **Step 3: Write the module with its failing tests**

```rust
// src-tauri/src/commands/spotify.rs
//! Tauri commands for the Spotify section, and the loop that keeps it in sync.
//!
//! Spotify is read, never written: no likes, no playlist edits. The Client ID
//! and the refresh token live in the settings table, next to the YouTube key.
//! Access tokens live only in memory, refreshed when they run out.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::library::AppState;
use crate::commands::youtube::with_db;
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify::{self as web_api, LiveApi};
use crate::external::spotify_auth::{self, TokenSet};

const CLIENT_ID_SETTING: &str = "spotify_client_id";
const REFRESH_TOKEN_SETTING: &str = "spotify_refresh_token";
const LAST_SYNCED_SETTING: &str = "spotify_last_synced_at";
const LAST_ERROR_SETTING: &str = "spotify_last_error";
const NEEDS_RECONNECT_SETTING: &str = "spotify_needs_reconnect";

pub const SYNCED_EVENT: &str = "spotify-synced";
const SYNC_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// How often the loop looks for the database before the frontend has opened it.
const DB_POLL: Duration = Duration::from_secs(5);
/// An access token with less than this left is refreshed first.
const TOKEN_MARGIN_MS: i64 = 60_000;

#[derive(Clone)]
struct AccessToken {
    token: String,
    expires_at_ms: i64,
}

/// In-memory Spotify state, managed by Tauri.
#[derive(Default)]
pub struct SpotifyState {
    access: Mutex<Option<AccessToken>>,
    /// One sync at a time: the loop, the "synced …" click and a fresh login share it.
    sync_lock: tokio::sync::Mutex<()>,
}

/// The `spotify-synced` payload.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedPayload {
    pub changed: bool,
    /// Unix ms of the last successful sync — on a failure, the previous one.
    pub last_synced_at: Option<i64>,
    pub error: Option<String>,
    pub needs_reconnect: bool,
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Database(e.to_string())
}

/// A setting, with an empty value read as absent — clearing writes "".
fn setting(db: &Database, key: &str) -> Result<Option<String>, AppError> {
    Ok(db.get_setting(key).map_err(db_err)?.filter(|v| !v.trim().is_empty()))
}

/// Connected, and not waiting for the user to sign in again.
fn should_sync(db: &Database) -> bool {
    matches!(setting(db, REFRESH_TOKEN_SETTING), Ok(Some(_)))
        && matches!(setting(db, NEEDS_RECONNECT_SETTING), Ok(None))
}

fn remember_access(spotify: &SpotifyState, tokens: &TokenSet) {
    if let Ok(mut slot) = spotify.access.lock() {
        *slot = Some(AccessToken {
            token: tokens.access_token.clone(),
            expires_at_ms: now_ms() + tokens.expires_in * 1000,
        });
    }
}

fn cached_access(spotify: &SpotifyState) -> Option<String> {
    let cached = spotify.access.lock().ok()?.clone()?;
    (cached.expires_at_ms - now_ms() > TOKEN_MARGIN_MS).then_some(cached.token)
}

/// A usable access token, refreshing it when it is about to run out.
async fn access_token(app_state: &AppState, spotify: &SpotifyState) -> Result<String, AppError> {
    if let Some(token) = cached_access(spotify) {
        return Ok(token);
    }

    let (client_id, refresh_token) = with_db(app_state, |db| {
        Ok((setting(db, CLIENT_ID_SETTING)?, setting(db, REFRESH_TOKEN_SETTING)?))
    })?;
    let (Some(client_id), Some(refresh_token)) = (client_id, refresh_token) else {
        return Err(AppError::SpotifyNotConnected);
    };

    let tokens = match spotify_auth::refresh(&client_id, &refresh_token).await {
        Ok(tokens) => tokens,
        Err(err) => {
            let err = AppError::from(err);
            if matches!(err, AppError::SpotifyReconnect) {
                let _ = with_db(app_state, |db| {
                    db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
                });
            }
            return Err(err);
        }
    };

    // Spotify may rotate the refresh token; the old one then stops working.
    if let Some(rotated) = &tokens.refresh_token {
        with_db(app_state, |db| db.set_setting(REFRESH_TOKEN_SETTING, rotated).map_err(db_err))?;
    }
    remember_access(spotify, &tokens);
    Ok(tokens.access_token)
}

fn forget_access(spotify: &SpotifyState) {
    if let Ok(mut slot) = spotify.access.lock() {
        *slot = None;
    }
}

/// The outer error is about getting a token; the inner one is Spotify's answer.
async fn fetch_with_token(
    app_state: &AppState,
    spotify: &SpotifyState,
    baseline: &crate::db::spotify::SyncBaseline,
) -> Result<Result<crate::db::spotify::SyncChanges, web_api::SpotifyError>, AppError> {
    let api = LiveApi::new(access_token(app_state, spotify).await?)?;
    Ok(web_api::fetch_changes(&api, baseline).await)
}

async fn sync_once(app_state: &AppState, spotify: &SpotifyState) -> Result<bool, AppError> {
    let baseline = with_db(app_state, |db| db.spotify_baseline().map_err(db_err))?;
    let mut fetched = fetch_with_token(app_state, spotify, &baseline).await?;
    // An access token stops working before it expires when the app is revoked
    // at spotify.com: drop it and refresh once, which then says invalid_grant.
    if matches!(fetched, Err(web_api::SpotifyError::Api { status: 401, .. })) {
        forget_access(spotify);
        fetched = fetch_with_token(app_state, spotify, &baseline).await?;
    }
    let changes = fetched?;
    with_db(app_state, |db| db.apply_spotify_sync(&changes, now_ms()).map_err(db_err))
}

/// One sync, shared by the loop, the "synced …" click and a fresh login.
///
/// Emits `spotify-synced` afterwards, whether anything changed or not, and on
/// failure. Returns None, without emitting, when another sync is already
/// running (that one will report) or no account is connected.
pub async fn run_sync(app: &AppHandle) -> Option<SyncedPayload> {
    let app_state = app.state::<AppState>();
    let spotify = app.state::<SpotifyState>();
    let Ok(_running) = spotify.sync_lock.try_lock() else {
        return None;
    };

    let payload = match sync_once(&app_state, &spotify).await {
        Ok(changed) => {
            let now = now_ms();
            let _ = with_db(&app_state, |db| {
                db.set_setting(LAST_SYNCED_SETTING, &now.to_string()).map_err(db_err)?;
                db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)?;
                db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)
            });
            SyncedPayload { changed, last_synced_at: Some(now), error: None, needs_reconnect: false }
        }
        Err(AppError::SpotifyNotConnected) => return None,
        Err(err) => {
            let message = err.to_string();
            let last_synced_at = with_db(&app_state, |db| {
                db.set_setting(LAST_ERROR_SETTING, &message).map_err(db_err)?;
                Ok(setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()))
            })
            .ok()
            .flatten();
            SyncedPayload {
                changed: false,
                last_synced_at,
                error: Some(message),
                needs_reconnect: matches!(err, AppError::SpotifyReconnect),
            }
        }
    };

    let _ = app.emit(SYNCED_EVENT, &payload);
    Some(payload)
}

fn db_ready(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .db
        .lock()
        .map(|db| db.is_some())
        .unwrap_or(false)
}

fn sync_due(app: &AppHandle) -> bool {
    with_db(&app.state::<AppState>(), |db| Ok(should_sync(db))).unwrap_or(false)
}

/// Syncs at start-up and every ten minutes while the app is open.
pub fn spawn_spotify_sync_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        while !db_ready(&app) {
            tokio::time::sleep(DB_POLL).await;
        }
        loop {
            if sync_due(&app) {
                let _ = run_sync(&app).await;
            }
            tokio::time::sleep(SYNC_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external::spotify::SpotifyError;

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    #[test]
    fn the_synced_event_reads_as_the_frontend_expects() {
        let payload = SyncedPayload {
            changed: true,
            last_synced_at: Some(5),
            error: None,
            needs_reconnect: false,
        };
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({ "changed": true, "lastSyncedAt": 5, "error": null, "needsReconnect": false })
        );
    }

    #[test]
    fn spotify_errors_keep_their_meaning_across_ipc() {
        assert!(matches!(AppError::from(SpotifyError::Reconnect), AppError::SpotifyReconnect));
        assert!(matches!(AppError::from(SpotifyError::NotConnected), AppError::SpotifyNotConnected));
        assert!(matches!(
            AppError::from(SpotifyError::Network("offline".into())),
            AppError::Spotify(message) if message == "offline"
        ));
    }

    #[test]
    fn the_loop_syncs_only_a_connected_account_that_needs_no_new_sign_in() {
        let db = fresh();
        assert!(!should_sync(&db));

        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        assert!(should_sync(&db));

        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        assert!(!should_sync(&db));

        db.set_setting(NEEDS_RECONNECT_SETTING, "").unwrap();
        assert!(should_sync(&db));
    }

    #[test]
    fn a_cached_token_is_used_until_a_minute_before_it_runs_out() {
        let spotify = SpotifyState::default();
        assert_eq!(cached_access(&spotify), None);

        remember_access(&spotify, &TokenSet { access_token: "AT".into(), expires_in: 3600, refresh_token: None });
        assert_eq!(cached_access(&spotify).as_deref(), Some("AT"));

        remember_access(&spotify, &TokenSet { access_token: "OLD".into(), expires_in: 30, refresh_token: None });
        assert_eq!(cached_access(&spotify), None);
    }
}
```

- [ ] **Step 4: Register the module, the state and the loop**

In `src-tauri/src/commands/mod.rs`, after `pub mod settings;`, add `pub mod spotify;`.

In `src-tauri/src/lib.rs`:
- In `.setup(|app| { … })`, after the `spawn_channel_watcher` line, add:

```rust
            // Syncs Liked Songs and playlists on start and every ten minutes.
            // Does nothing until a Spotify account is connected.
            commands::spotify::spawn_spotify_sync_loop(app.handle().clone());
```

- After `.manage(CompanionState::new())`, add:

```rust
        .manage(commands::spotify::SpotifyState::default())
```

- [ ] **Step 5: Run the tests**

Run: `cd src-tauri && cargo test commands::spotify`
Expected: PASS, 4 tests.

Run: `cd src-tauri && cargo build 2>&1 | grep -E "^(warning|error)" | sort | uniq -c`
Expected: no line mentioning a spotify file. Pre-existing warnings elsewhere are not this task's concern.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/external/spotify.rs src-tauri/src/commands/youtube.rs src-tauri/src/commands/spotify.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(spotify): sync on start and every ten minutes, and tell the frontend after each sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The commands

**Files:**
- Modify: `src-tauri/src/commands/spotify.rs`
- Modify: `src-tauri/src/lib.rs` (`invoke_handler`)

| Command | Does |
|---|---|
| `get_spotify_status` | What Settings and the view show. |
| `set_spotify_client_id` | Validates and saves. A *different* ID signs out, but keeps the rows. |
| `connect_spotify` | PKCE login through the browser and the loopback port, then starts the first sync. |
| `disconnect_spotify` | Forgets the tokens and every `spotify_*` row. Keeps the Client ID. |
| `sync_spotify_now` | The "synced …" click. |
| `get_spotify_library` | Lists, tracks, entries, verdicts. |
| `mark_spotify_list_opened` | Answers the time it wrote. |
| `set_spotify_verdict` | Stores Yes / No. |
| `play_spotify_track` | Plays on the active device, or opens `spotify:track:<id>` in the app. |

- [ ] **Step 1: Write the failing tests** (inside `mod tests`)

```rust
    #[test]
    fn a_fresh_install_is_not_connected() {
        assert_eq!(
            read_status(&fresh()).unwrap(),
            SpotifyStatusDTO {
                client_id: None,
                connected: false,
                account_name: None,
                needs_reconnect: false,
                last_synced_at: None,
                last_error: None,
                refused: vec![],
            }
        );
    }

    #[test]
    fn the_status_reads_what_was_saved() {
        let db = fresh();
        db.set_setting(CLIENT_ID_SETTING, "0123456789abcdef0123456789abcdef").unwrap();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(ACCOUNT_SETTING, "Nemanja").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "1700000000000").unwrap();
        db.set_setting(LAST_ERROR_SETTING, "").unwrap();
        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        db.set_setting(
            crate::db::spotify::REFUSED_SETTING,
            r#"[{"id":"p9","name":"Discover Weekly","snapshotId":"s","total":30}]"#,
        )
        .unwrap();

        let status = read_status(&db).unwrap();
        assert_eq!(status.client_id.as_deref(), Some("0123456789abcdef0123456789abcdef"));
        assert!(status.connected);
        assert_eq!(status.account_name.as_deref(), Some("Nemanja"));
        assert!(status.needs_reconnect);
        assert_eq!(status.last_synced_at, Some(1_700_000_000_000));
        assert_eq!(status.last_error, None);
        assert_eq!(status.refused, vec!["Discover Weekly".to_string()]);
    }

    #[test]
    fn disconnecting_keeps_the_client_id_and_forgets_the_rest() {
        let db = fresh();
        db.set_setting(CLIENT_ID_SETTING, "0123456789abcdef0123456789abcdef").unwrap();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(ACCOUNT_SETTING, "Nemanja").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "1").unwrap();
        db.set_setting(crate::db::spotify::REFUSED_SETTING, "[]").unwrap();

        forget_account(&db).unwrap();

        let status = read_status(&db).unwrap();
        assert!(!status.connected);
        assert_eq!(status.account_name, None);
        assert_eq!(status.last_synced_at, None);
        assert_eq!(status.client_id.as_deref(), Some("0123456789abcdef0123456789abcdef"));
    }

    #[test]
    fn ids_are_checked_before_they_are_used() {
        assert!(valid_client_id("0123456789abcdef0123456789ABCDEF"));
        assert!(!valid_client_id("abc"));
        assert!(!valid_client_id("0123456789abcdef0123456789abcdeg"));
        assert!(valid_spotify_id("4uLU6hMCjMI75M1A2tKUQC"));
        assert!(!valid_spotify_id(""));
        assert!(!valid_spotify_id("abc:def"));
        assert!(!valid_spotify_id("../x"));
    }

    #[test]
    fn play_outcomes_read_the_same_in_typescript() {
        assert_eq!(serde_json::to_value(PlayOutcome::Played).unwrap(), serde_json::json!("played"));
        assert_eq!(serde_json::to_value(PlayOutcome::OpenedApp).unwrap(), serde_json::json!("openedApp"));
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test commands::spotify`
Expected: compile errors — `read_status`, `SpotifyStatusDTO`, `ACCOUNT_SETTING` and the rest are not defined.

- [ ] **Step 3: Implement**

Change the imports at the top of `commands/spotify.rs` to:

```rust
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::library::AppState;
use crate::commands::youtube::with_db;
use crate::db::spotify::SpotifyLibraryDump;
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify::{self as web_api, LiveApi, SpotifyError};
use crate::external::spotify_auth::{self, TokenSet};
```

Add next to the other setting keys:

```rust
const ACCOUNT_SETTING: &str = "spotify_account_name";
```

Add a field to `SpotifyState`:

```rust
    /// One login at a time — the redirect port can be bound only once.
    login: tokio::sync::Mutex<()>,
```

The tests module imports `SpotifyError` itself. Now that the parent imports it, delete the line `use crate::external::spotify::SpotifyError;` from `mod tests`.

Then add above `#[cfg(test)]`:

```rust
// --- commands ----------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatusDTO {
    pub client_id: Option<String>,
    pub connected: bool,
    pub account_name: Option<String>,
    pub needs_reconnect: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    /// Names of the playlists Spotify would not share.
    pub refused: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PlayOutcome {
    Played,
    OpenedApp,
}

fn read_status(db: &Database) -> Result<SpotifyStatusDTO, AppError> {
    Ok(SpotifyStatusDTO {
        client_id: setting(db, CLIENT_ID_SETTING)?,
        connected: setting(db, REFRESH_TOKEN_SETTING)?.is_some(),
        account_name: setting(db, ACCOUNT_SETTING)?,
        needs_reconnect: setting(db, NEEDS_RECONNECT_SETTING)?.is_some(),
        last_synced_at: setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()),
        last_error: setting(db, LAST_ERROR_SETTING)?,
        refused: db
            .spotify_refused()
            .map_err(db_err)?
            .into_iter()
            .map(|p| p.name)
            .collect(),
    })
}

/// Everything about the account, and every synced row. The Client ID stays.
fn forget_account(db: &Database) -> Result<(), AppError> {
    for key in [
        REFRESH_TOKEN_SETTING,
        ACCOUNT_SETTING,
        LAST_SYNCED_SETTING,
        LAST_ERROR_SETTING,
        NEEDS_RECONNECT_SETTING,
    ] {
        db.delete_setting(key).map_err(db_err)?;
    }
    db.clear_spotify().map_err(db_err)
}

/// A Client ID is 32 hexadecimal characters.
fn valid_client_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit())
}

/// Spotify ids are base62 — checked before one goes into a `spotify:` URI.
fn valid_spotify_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

#[tauri::command]
pub async fn get_spotify_status(state: State<'_, AppState>) -> Result<SpotifyStatusDTO, AppError> {
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn set_spotify_client_id(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    client_id: String,
) -> Result<SpotifyStatusDTO, AppError> {
    let client_id = client_id.trim().to_string();
    if !valid_client_id(&client_id) {
        return Err(AppError::Validation(
            "A Client ID is 32 letters and digits — copy it from your app's page on developer.spotify.com"
                .to_string(),
        ));
    }

    let different =
        with_db(&state, |db| Ok(setting(db, CLIENT_ID_SETTING)?.as_deref() != Some(client_id.as_str())))?;
    if different {
        // A refresh token belongs to the app that issued it: a new Client ID
        // means signing in again. The synced lists stay, and so does the
        // account name — connect compares it to tell a different account.
        forget_access(&spotify);
        with_db(&state, |db| {
            db.set_setting(CLIENT_ID_SETTING, &client_id).map_err(db_err)?;
            for key in [REFRESH_TOKEN_SETTING, NEEDS_RECONNECT_SETTING] {
                db.delete_setting(key).map_err(db_err)?;
            }
            Ok(())
        })?;
        // The sidebar and the view go until the account is connected again.
        let _ = app.emit(
            SYNCED_EVENT,
            &SyncedPayload { changed: true, last_synced_at: None, error: None, needs_reconnect: false },
        );
    }
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn connect_spotify(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
) -> Result<SpotifyStatusDTO, AppError> {
    let Ok(_login) = spotify.login.try_lock() else {
        return Err(AppError::Spotify(
            "A Spotify sign-in is already waiting in your browser".to_string(),
        ));
    };
    let client_id = with_db(&state, |db| setting(db, CLIENT_ID_SETTING))?
        .ok_or_else(|| AppError::Validation("Paste your Client ID and save it first".to_string()))?;

    // Bound before the browser opens, so a taken port is reported at once.
    let listener = spotify_auth::bind_listener(spotify_auth::REDIRECT_PORT)
        .await
        .map_err(AppError::Spotify)?;
    let verifier = spotify_auth::random_string(64);
    let login_state = spotify_auth::random_string(32);
    let url = spotify_auth::authorize_url(
        &client_id,
        &spotify_auth::code_challenge(&verifier),
        &login_state,
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("Could not open the browser: {e}")))?;

    let params = spotify_auth::wait_for_callback(listener, spotify_auth::LOGIN_TIMEOUT)
        .await
        .map_err(AppError::Spotify)?;
    let code = spotify_auth::code_from_callback(&params, &login_state).map_err(AppError::Spotify)?;
    let tokens = spotify_auth::exchange_code(&client_id, &code, &verifier).await?;
    let refresh_token = tokens.refresh_token.clone().ok_or_else(|| {
        AppError::Spotify("Spotify signed you in but sent no refresh token — try again".to_string())
    })?;

    let account = web_api::fetch_profile_name(&tokens.access_token)
        .await
        .map_err(|err| match err {
            // A personal app signs in only the accounts listed under its User
            // Management (Spotify's development-mode rule since February 2026).
            SpotifyError::Api { status: 403, .. } => AppError::Spotify(
                "Spotify refused this account. On developer.spotify.com open your app → User Management, add your Spotify account, then connect again."
                    .to_string(),
            ),
            other => other.into(),
        })?;

    remember_access(&spotify, &tokens);
    with_db(&state, |db| {
        // Another account's lists would make this one's whole library read as new.
        if setting(db, ACCOUNT_SETTING)?.is_some_and(|previous| previous != account) {
            db.clear_spotify().map_err(db_err)?;
        }
        db.set_setting(REFRESH_TOKEN_SETTING, &refresh_token).map_err(db_err)?;
        db.set_setting(ACCOUNT_SETTING, &account).map_err(db_err)?;
        db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)?;
        db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)
    })?;

    // The first sync starts now, not in ten minutes. It reports through the event.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_sync(&handle).await;
    });

    with_db(&state, read_status)
}

#[tauri::command]
pub async fn disconnect_spotify(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
) -> Result<SpotifyStatusDTO, AppError> {
    // A sync running now would write its rows back after the clear.
    let _running = spotify.sync_lock.lock().await;
    forget_access(&spotify);
    with_db(&state, forget_account)?;
    let _ = app.emit(
        SYNCED_EVENT,
        &SyncedPayload { changed: true, last_synced_at: None, error: None, needs_reconnect: false },
    );
    with_db(&state, read_status)
}

#[tauri::command]
pub async fn sync_spotify_now(app: AppHandle) -> Result<(), AppError> {
    let _ = run_sync(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn get_spotify_library(state: State<'_, AppState>) -> Result<SpotifyLibraryDump, AppError> {
    with_db(&state, |db| db.get_spotify_library().map_err(db_err))
}

/// Answers the time written, so the frontend can update its copy exactly.
#[tauri::command]
pub async fn mark_spotify_list_opened(state: State<'_, AppState>, list_id: String) -> Result<i64, AppError> {
    let now = now_ms();
    with_db(&state, |db| db.mark_spotify_list_opened(&list_id, now).map_err(db_err))?;
    Ok(now)
}

#[tauri::command]
pub async fn set_spotify_verdict(
    state: State<'_, AppState>,
    spotify_id: String,
    library_track_id: i64,
    verdict: String,
) -> Result<(), AppError> {
    if verdict != "yes" && verdict != "no" {
        return Err(AppError::Validation(format!("Unknown answer: {verdict}")));
    }
    with_db(&state, |db| {
        db.set_spotify_verdict(&spotify_id, library_track_id, &verdict).map_err(db_err)
    })
}

async fn play_with_token(
    state: &AppState,
    spotify: &SpotifyState,
    spotify_id: &str,
) -> Result<(), SpotifyError> {
    match access_token(state, spotify).await {
        Ok(token) => web_api::play_track(&token, spotify_id).await,
        // No working sign-in — none, revoked, or Spotify unreachable for the
        // token call. The Spotify app can still play the track.
        Err(_) => Err(SpotifyError::NotConnected),
    }
}

#[tauri::command]
pub async fn play_spotify_track(
    app: AppHandle,
    state: State<'_, AppState>,
    spotify: State<'_, SpotifyState>,
    spotify_id: String,
) -> Result<PlayOutcome, AppError> {
    if !valid_spotify_id(&spotify_id) {
        return Err(AppError::Validation("Not a Spotify track id".to_string()));
    }

    let mut played = play_with_token(&state, &spotify, &spotify_id).await;
    // A revoked app's access token fails before it expires: refresh once.
    if matches!(played, Err(SpotifyError::Api { status: 401, .. })) {
        forget_access(&spotify);
        played = play_with_token(&state, &spotify, &spotify_id).await;
    }

    match played {
        Ok(()) => Ok(PlayOutcome::Played),
        // No active device, no Premium, or no working sign-in: the Spotify app
        // can still play it. No error is shown for this.
        Err(err) if web_api::should_open_app(&err) => {
            app.opener()
                .open_url(format!("spotify:track:{spotify_id}"), None::<&str>)
                .map_err(|e| AppError::Internal(format!("Could not open Spotify: {e}")))?;
            Ok(PlayOutcome::OpenedApp)
        }
        Err(err) => Err(err.into()),
    }
}
```

- [ ] **Step 4: Register the commands**

In `src-tauri/src/lib.rs`'s `tauri::generate_handler![ … ]`, after `commands::youtube::mark_youtube_channel_seen,`, add:

```rust
            // Spotify
            commands::spotify::get_spotify_status,
            commands::spotify::set_spotify_client_id,
            commands::spotify::connect_spotify,
            commands::spotify::disconnect_spotify,
            commands::spotify::sync_spotify_now,
            commands::spotify::get_spotify_library,
            commands::spotify::mark_spotify_list_opened,
            commands::spotify::set_spotify_verdict,
            commands::spotify::play_spotify_track,
```

- [ ] **Step 5: Run the tests and the linter**

Run: `cd src-tauri && cargo test commands::spotify`
Expected: PASS, 9 tests.

Run: `cd src-tauri && cargo clippy --all-targets 2>&1 | grep -B2 -A8 "spotify" | head -60`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/spotify.rs src-tauri/src/lib.rs
git commit -m "feat(spotify): commands to connect, disconnect, sync, read, mark seen, answer Maybe, and play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Frontend wrappers and error kinds

**Files:**
- Modify: `src/lib/tauri-api.ts`
- Modify: `src/types/ai.ts` (`AppErrorKind`, `getErrorMessage`)

- [ ] **Step 1: The wrappers**

In `src/lib/tauri-api.ts`, add to the imports:

```ts
import type {
  PlayOutcome,
  SpotifyLibrary,
  SpotifyStatus,
  Verdict,
} from '../types/spotify'
```

and insert inside the `tauriApi` object, directly before the `  // AI commands` comment:

```ts
  // Spotify. Read-only on Spotify's side; the tokens never reach the webview.
  async getSpotifyStatus(): Promise<SpotifyStatus> {
    return await invoke('get_spotify_status')
  },

  async setSpotifyClientId(clientId: string): Promise<SpotifyStatus> {
    return await invoke('set_spotify_client_id', { clientId })
  },

  /** Resolves when the browser login is done (or fails); can take minutes. */
  async connectSpotify(): Promise<SpotifyStatus> {
    return await invoke('connect_spotify')
  },

  async disconnectSpotify(): Promise<SpotifyStatus> {
    return await invoke('disconnect_spotify')
  },

  /** The result arrives as a `spotify-synced` event. */
  async syncSpotifyNow(): Promise<void> {
    return await invoke('sync_spotify_now')
  },

  async getSpotifyLibrary(): Promise<SpotifyLibrary> {
    return await invoke('get_spotify_library')
  },

  /** Answers the lastOpenedAt it wrote (unix ms). `all` marks every list. */
  async markSpotifyListOpened(listId: string): Promise<number> {
    return await invoke('mark_spotify_list_opened', { listId })
  },

  async setSpotifyVerdict(spotifyId: string, libraryTrackId: number, verdict: Verdict): Promise<void> {
    return await invoke('set_spotify_verdict', { spotifyId, libraryTrackId, verdict })
  },

  async playSpotifyTrack(spotifyId: string): Promise<PlayOutcome> {
    return await invoke('play_spotify_track', { spotifyId })
  },

```

- [ ] **Step 2: The error kinds**

In `src/types/ai.ts`, extend `AppErrorKind` after `| 'YtNetwork'`:

```ts
  | 'SpotifyNotConnected'
  | 'SpotifyReconnect'
  | 'Spotify'
```

In `getErrorMessage`'s `switch`, before `default:`, add:

```ts
      case 'SpotifyNotConnected':
        return 'Spotify is not connected -- connect it in Settings'
      case 'SpotifyReconnect':
        return 'Spotify needs you to sign in again'
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/lib/tauri-api.ts src/types/ai.ts`
Expected: no errors. This step has no unit test: the wrappers are one `invoke` each, and Task 20 checks them in the running app.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tauri-api.ts src/types/ai.ts
git commit -m "feat(spotify): frontend wrappers for the Spotify commands, and their error kinds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The `useSpotify` hook, and a pure clock

**Files:**
- Create: `src/components/spotify/useSpotify.ts`
- Create: `src/components/spotify/useNow.ts`

The hook is called once, from `App.tsx`, so the sidebar number is right whichever view is open.
- It loads the status, then (when connected) the Spotify data and the whole library.
- It works out ownership and the counts with the tested pure modules, memoised on the data, never per render.
- It reloads on `spotify-synced`.
- It has no unit test (no Testing Library). It wires tested functions to IPC and is checked by hand in Task 20.

- [ ] **Step 1: The clock**

```ts
// src/components/spotify/useNow.ts
// "synced 2 min ago" needs the time, and reading the clock during render
// breaks the react-hooks purity rule. This ticks in a timer instead; `null`
// until the first tick, a moment after mount.
import { useEffect, useState } from 'react'

export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [intervalMs])
  return now
}
```

- [ ] **Step 2: The hook**

```ts
// src/components/spotify/useSpotify.ts
// Everything the Spotify section shows, loaded once and kept current. Called
// from App.tsx so the sidebar's new-likes number is right in every view.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import { buildOwnershipIndex, classifyTracks, type Ownership } from '../../lib/spotify/ownership'
import { newAndMissing, type NewCounts } from '../../lib/spotify/newness'
import { listCounts, type StatusFilter } from '../../lib/spotify/rows'
import type { Track } from '../../types/track'
import {
  ALL_LISTS,
  SPOTIFY_SYNCED_EVENT,
  type SpotifyLibrary,
  type SpotifyStatus,
  type SpotifySynced,
  type Verdict,
} from '../../types/spotify'

const EMPTY: SpotifyLibrary = { lists: [], tracks: [], entries: [], verdicts: [] }

export interface SpotifyData {
  status: SpotifyStatus | null
  connected: boolean
  library: SpotifyLibrary
  /** The whole RecoDeck library — App only holds the view on screen. */
  libraryTracks: Track[]
  ownership: Map<string, Ownership>
  newCounts: NewCounts
  /** Rows behind each sidebar item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** Each list's lastOpenedAt as it was when the open view was opened: what the dots compare with. */
  seenBefore: Map<string, number>
  syncing: boolean
  /** Remembered for the session; All by default. */
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  openList: (listId: string) => void
  syncNow: () => void
  setVerdict: (spotifyId: string, libraryTrackId: number, verdict: Verdict) => void
  /** Rejects with the error when the login fails. */
  reconnect: () => Promise<void>
}

/**
 * @param ready the database is open (App's start-up has finished).
 * @param totalTrackCount App's library count — a change means the library changed.
 */
export function useSpotify(ready: boolean, totalTrackCount: number): SpotifyData {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [library, setLibrary] = useState<SpotifyLibrary>(EMPTY)
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([])
  /** Until the library has arrived once, everything would read Missing. */
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [seenBefore, setSeenBefore] = useState<Map<string, number>>(() => new Map())
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const connected = status?.connected ?? false

  const loadLibrary = useCallback(() => {
    tauriApi.getSpotifyLibrary().then(setLibrary).catch(() => {})
  }, [])

  /** Status first; the data only when there is an account. */
  const refresh = useCallback(
    (reloadData: boolean) => {
      tauriApi
        .getSpotifyStatus()
        .then((next) => {
          setStatus(next)
          if (!next.connected) setLibrary(EMPTY)
          else if (reloadData) loadLibrary()
        })
        .catch(() => {})
    },
    [loadLibrary],
  )

  useEffect(() => {
    if (ready) refresh(true)
  }, [ready, refresh])

  // Every sync reports, changed or not: the "synced …" line and the Reconnect
  // bar read the status, the rows only when something changed.
  useEffect(() => {
    const stop = listen<SpotifySynced>(SPOTIFY_SYNCED_EVENT, (event) => {
      setSyncing(false)
      refresh(event.payload.changed)
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refresh])

  // The whole library, for matching — only while there is something to match.
  useEffect(() => {
    if (!ready || !connected) return
    let live = true
    const load = () => {
      tauriApi
        .getAllTracks()
        .then((tracks) => {
          if (!live) return
          setLibraryTracks(tracks)
          setLibraryLoaded(true)
        })
        .catch(() => {})
    }
    load()
    const stop = listen('library-changed', load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [ready, connected, totalTrackCount])

  const index = useMemo(() => buildOwnershipIndex(libraryTracks), [libraryTracks])
  const ownership = useMemo(
    () => classifyTracks(library.tracks, index, library.verdicts),
    [library.tracks, library.verdicts, index],
  )
  // No number before the library is known: owned tracks would count as missing.
  const newCounts = useMemo(
    () => (libraryLoaded ? newAndMissing(library, ownership) : { total: 0, byList: new Map<string, number>() }),
    [libraryLoaded, library, ownership],
  )
  const counts = useMemo(() => listCounts(library), [library])

  const openList = useCallback(
    (listId: string) => {
      // Captured before the opening is written, so the dots are seen once.
      setSeenBefore(new Map(library.lists.map((list) => [list.id, list.lastOpenedAt])))
      tauriApi
        .markSpotifyListOpened(listId)
        .then((at) => {
          setLibrary((prev) => ({
            ...prev,
            lists: prev.lists.map((list) =>
              listId === ALL_LISTS || list.id === listId ? { ...list, lastOpenedAt: at } : list,
            ),
          }))
        })
        .catch(() => {})
    },
    [library.lists],
  )

  const syncNow = useCallback(() => {
    setSyncing(true)
    tauriApi
      .syncSpotifyNow()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

  const setVerdict = useCallback((spotifyId: string, libraryTrackId: number, verdict: Verdict) => {
    tauriApi
      .setSpotifyVerdict(spotifyId, libraryTrackId, verdict)
      .then(() => {
        setLibrary((prev) => ({
          ...prev,
          verdicts: [
            ...prev.verdicts.filter(
              (v) => !(v.spotifyId === spotifyId && v.libraryTrackId === libraryTrackId),
            ),
            { spotifyId, libraryTrackId, verdict },
          ],
        }))
      })
      .catch(() => {})
  }, [])

  const reconnect = useCallback(async () => {
    const next = await tauriApi.connectSpotify()
    setStatus(next)
  }, [])

  return {
    status,
    connected,
    library,
    libraryTracks,
    ownership,
    newCounts,
    counts,
    seenBefore,
    syncing,
    filter,
    setFilter,
    openList,
    syncNow,
    setVerdict,
    reconnect,
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/components/spotify`
Expected: no errors and no warnings. Every `setState` in an effect sits inside a promise callback or an event listener, never directly in the effect body.

- [ ] **Step 4: Commit**

```bash
git add src/components/spotify/useSpotify.ts src/components/spotify/useNow.ts
git commit -m "feat(spotify): one hook that keeps the Spotify data, the library match and the counts current

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Settings → Spotify

**Files:**
- Create: `src/components/settings/SpotifySection.tsx`
- Modify: `src/components/views/SettingsView.tsx` (after the YouTube `CollapsibleSection`)

The spec asks for four things:
1. Steps for creating the app, including the exact redirect URI.
2. The Client ID field.
3. Connect / Disconnect and the account name.
4. The last sync result, and the playlists Spotify would not share.

The steps add what February 2026 made necessary: tick **Web API**, and list your own account under **User Management**. State is local to the section; `YouTubeSection` keeps its state in `SettingsContext`, but nothing else in Settings needs Spotify's.

- [ ] **Step 1: The section**

```tsx
// src/components/settings/SpotifySection.tsx
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage } from '../../types/ai'
import { SPOTIFY_SYNCED_EVENT, type SpotifyStatus } from '../../types/spotify'

const REDIRECT_URI = 'http://127.0.0.1:47816/callback'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }

export function SpotifySection() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    const load = () => {
      tauriApi
        .getSpotifyStatus()
        .then((next) => {
          if (!live) return
          setStatus(next)
          setClientId((typed) => typed || next.clientId || '')
        })
        .catch(() => {})
    }
    load()
    const stop = listen(SPOTIFY_SYNCED_EVENT, load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const run = (kind: 'save' | 'connect' | 'disconnect', action: () => Promise<SpotifyStatus>) => {
    setBusy(kind)
    setError(null)
    action()
      .then(setStatus)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setBusy(null))
  }

  const saved = status?.clientId ?? null
  const dirty = clientId.trim() !== '' && clientId.trim() !== saved

  return (
    <>
      <p className="settings-description">
        Shows which of your Spotify likes and playlists are already in your library, and makes
        the missing ones one click from the store. RecoDeck only reads from Spotify — it never
        likes, unlikes or edits anything.
      </p>

      <div className="sv-subsection">
        <label className="sv-setting-row__label">Create your Spotify app (once)</label>
        <ol className="settings-hint" style={{ marginTop: '0.5rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>
            Open{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              developer.spotify.com/dashboard
            </a>{' '}
            and press <strong>Create app</strong>. Any name and description will do.
          </li>
          <li>
            Under <strong>Redirect URIs</strong> add exactly{' '}
            <code>{REDIRECT_URI}</code>{' '}
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                void navigator.clipboard.writeText(REDIRECT_URI).then(() => setCopied(true))
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </li>
          <li>
            Under <strong>Which API/SDKs are you planning to use?</strong> tick <strong>Web API</strong>,
            then save.
          </li>
          <li>
            Open the app's <strong>User Management</strong> and add the name and email of your own
            Spotify account — a personal app can only sign in the accounts listed there.
          </li>
          <li>
            Copy the app's <strong>Client ID</strong> into the field below. There is no secret to copy.
          </li>
        </ol>
        <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
          Spotify asks for Premium on the account that owns the app. Without Premium the play
          buttons open the Spotify app instead of playing directly.
        </p>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label htmlFor="spotify-client-id" className="sv-setting-row__label">Client ID</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            id="spotify-client-id"
            type="text"
            placeholder="32 letters and digits"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty) run('save', () => tauriApi.setSpotifyClientId(clientId))
            }}
            className="settings-text-input"
            style={{ flex: 1 }}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-primary btn-small"
            disabled={!dirty || busy !== null}
            onClick={() => run('save', () => tauriApi.setSpotifyClientId(clientId))}
          >
            {busy === 'save' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
          {status?.connected ? (
            <>
              <span>
                Connected as <strong>{status.accountName}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  disabled={busy !== null}
                  onClick={() => run('connect', () => tauriApi.connectSpotify())}
                >
                  {busy === 'connect' ? 'Waiting for Spotify…' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={busy !== null}
                onClick={() => run('disconnect', () => tauriApi.disconnectSpotify())}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={!saved || busy !== null}
              onClick={() => run('connect', () => tauriApi.connectSpotify())}
            >
              {busy === 'connect' ? 'Waiting for Spotify in your browser…' : 'Connect Spotify'}
            </button>
          )}
        </div>
        {error && (
          <p style={{ marginTop: '0.5rem', color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>
        )}
      </div>

      {status?.connected && (
        <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
          <label className="sv-setting-row__label">Last sync</label>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {status.lastError
              ? `Failed: ${status.lastError}`
              : status.lastSyncedAt
                ? `Synced ${new Date(status.lastSyncedAt).toLocaleString()} — every 10 minutes while RecoDeck is open.`
                : 'The first sync is running…'}
          </p>
          {status.refused.length > 0 && (
            <p className="settings-hint">
              Spotify would not share {status.refused.length === 1 ? 'this playlist' : 'these playlists'} — it
              only gives personal apps the playlists you own or collaborate on:{' '}
              {status.refused.join(', ')}.
            </p>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Put it next to YouTube**

In `src/components/views/SettingsView.tsx`, add the import beside the others:

```tsx
import { SpotifySection } from '../settings/SpotifySection'
```

and after the YouTube `</CollapsibleSection>`, add:

```tsx
        <CollapsibleSection
          id="spotify"
          title="Spotify"
          summary="Your likes and playlists, checked against your library"
        >
          <SpotifySection />
        </CollapsibleSection>
```

- [ ] **Step 3: Typecheck, lint, look**

Run: `npx tsc --noEmit -p . && npx eslint src/components/settings/SpotifySection.tsx`
Expected: no errors.

Run `npm run tauri dev` and open Settings → Spotify:
- the five steps show, with the URI and a working Copy;
- Save is disabled until something is typed;
- `abc` + Save gives the "32 letters and digits" message;
- a 32-hex-digit value saves;
- Connect is enabled only after a save.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SpotifySection.tsx src/components/views/SettingsView.tsx
git commit -m "feat(spotify): Settings section to create the app, paste the Client ID, connect and see the last sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 17: SPOTIFY in the sidebar and the rail, and opening a list

**Files:**
- Modify: `src/lib/sidebarPrefs.ts`, `src/lib/sidebarPrefs.test.ts` (`ActiveView` gains `'spotify'`)
- Create: `src/components/spotify/SpotifyGlyph.tsx`
- Create: `src/components/spotify/SpotifyLists.tsx`
- Modify: `src/components/layout/sidebarTypes.ts`, `src/components/layout/Sidebar.tsx`, `src/components/layout/SidebarRail.tsx`, `src/components/layout/Sidebar.css`
- Create: `src/components/views/SpotifyView.tsx`, `src/components/views/SpotifyView.css` (the header only. Task 18 adds the table.)
- Modify: `src/App.tsx`

What the spec asks for:
- A collapsible **SPOTIFY** section below PLAYLISTS, built like the other sections (chevron, icon, uppercase label), hidden until Spotify is connected.
- It holds **All playlists**, **Liked Songs**, then each playlist with its count.
- The new-likes number is plain `--accent-hover`, 11px, weight 600. It shows on the header and, when expanded, on each list that received the tracks.
- In the rail: the Spotify icon with the same number at 9px, top-right, and a flyout with the same lists.

- [ ] **Step 1: The failing test** (append to `src/lib/sidebarPrefs.test.ts`)

```ts
describe('the Spotify view', () => {
  it('lights the Spotify section', () => {
    expect(sectionForView('spotify')).toBe('spotify')
  })
})
```

Run: `npx tsc --noEmit -p .`
Expected: FAIL — `Argument of type '"spotify"' is not assignable to parameter of type 'ActiveView'`. Vitest does not typecheck, so running the test alone would pass by accident: `default: return view` already returns the string.

- [ ] **Step 2: `ActiveView` gains the Spotify view**

In `src/lib/sidebarPrefs.ts`, add `| 'spotify'` as the last member of `ActiveView`. `sectionForView` needs no change: its `default` returns the view, and `'spotify'` is already a `SidebarSection`.

Run: `npx vitest run src/lib/sidebarPrefs.test.ts && npx tsc --noEmit -p .`
Expected: PASS; no type errors.

- [ ] **Step 3: The glyph and the list items**

```tsx
// src/components/spotify/SpotifyGlyph.tsx
// Spotify's mark in the app's line style — lucide has no brand icons.
interface SpotifyGlyphProps {
  size?: number
  style?: React.CSSProperties
}

export function SpotifyGlyph({ size = 16, style }: SpotifyGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M7 9.5c3.5-1 7.5-.7 10.5 1" />
      <path d="M7.5 12.7c3-.8 6.2-.5 8.7.9" />
      <path d="M8 15.7c2.3-.6 4.7-.4 6.6.6" />
    </svg>
  )
}
```

```tsx
// src/components/spotify/SpotifyLists.tsx
// The items under SPOTIFY: All playlists, Liked Songs, then each playlist in
// Spotify's order. Used by the full sidebar and by the rail's flyout; styled
// with FolderTree's rows so it looks like the sections above it.
import { Icon } from '../Icon'
import { ALL_LISTS, LIKED, type SpotifyList } from '../../types/spotify'

interface SpotifyListsProps {
  lists: SpotifyList[]
  /** Rows behind each item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** New-and-missing per list; absent means none. */
  newByList: Map<string, number>
  activeListId: string | null
  onOpen: (listId: string) => void
}

export function SpotifyLists({ lists, counts, newByList, activeListId, onOpen }: SpotifyListsProps) {
  const item = (id: string, name: string, icon: 'ListMusic' | 'Heart', fresh: number) => (
    <button
      key={id}
      type="button"
      className={`folder-row spotify-list-row ${activeListId === id ? 'selected' : ''}`}
      onClick={() => onOpen(id)}
      title={name}
    >
      <Icon name={icon} size={14} className="spotify-list-row__icon" />
      <span className="folder-name">{name}</span>
      {fresh > 0 && <span className="spotify-list-row__new">{fresh}</span>}
      <span className="folder-count">({counts.get(id) ?? 0})</span>
    </button>
  )

  return (
    <div className="folder-tree-section-body">
      {/* All playlists carries no number: the header already holds the distinct total. */}
      {item(ALL_LISTS, 'All playlists', 'ListMusic', 0)}
      {lists.map((list) =>
        item(list.id, list.name, list.id === LIKED ? 'Heart' : 'ListMusic', newByList.get(list.id) ?? 0),
      )}
    </div>
  )
}
```

- [ ] **Step 4: Shared types — Spotify joins the flyout sections**

The finished sidebar keeps the types shared by `Sidebar.tsx` and `SidebarRail.tsx` in `src/components/layout/sidebarTypes.ts`. Its `FlyoutSection` comment says "A section joins by adding its SidebarSection name here".

In `sidebarTypes.ts`:

```ts
import type { SpotifyList } from '../../types/spotify'
```

change `FlyoutSection` to:

```ts
export type FlyoutSection = Extract<SidebarSection, 'folders' | 'playlists' | 'spotify'>
```

and add at the end:

```ts
/** What the SPOTIFY section shows. Absent while no account is connected. */
export interface SidebarSpotify {
  lists: SpotifyList[]
  /** Rows behind each item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** Distinct new-and-missing tracks: the header's (and the rail icon's) number. */
  newTotal: number
  newByList: Map<string, number>
  activeListId: string | null
  onOpenList: (listId: string) => void
}
```

- [ ] **Step 5: The full sidebar**

In `src/components/layout/Sidebar.tsx`:

1. Imports. Add `type ReactNode,` to the multi-line `react` import. Change `import type { NavItem } from './sidebarTypes'` to `import type { NavItem, SidebarSpotify } from './sidebarTypes'`. Add:

```ts
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { SpotifyLists } from '../spotify/SpotifyLists'
```

2. `Section` can draw a glyph instead of a lucide icon. In `SectionProps`, change `iconName: IconName` to the two lines below, and destructure `glyph` in `Section({ … })`:

```ts
  iconName?: IconName
  /** Drawn instead of `iconName` — for Spotify, which lucide does not draw. */
  glyph?: ReactNode
```

In `Section`'s header, replace `<Icon name={iconName} size={14} style={iconStyle} />` with:

```tsx
        {glyph ?? (iconName && <Icon name={iconName} size={14} style={iconStyle} />)}
```

The number uses `Section`'s existing `trailing` prop, which sits right-aligned in the header, so `Section` needs nothing more.

3. Add `spotify?: SidebarSpotify` as the last member of `SidebarProps`, and `spotify,` as the last name in `Sidebar({ … })`.

4. Next to `const [playlistsExpanded, setPlaylistsExpanded] = useState(true)`:

```ts
  const [spotifyExpanded, setSpotifyExpanded] = useState(true)
```

5. In the full sidebar, after the Playlists `</Section>` and before the closing `</div>` of `sidebar-scroll`:

```tsx
        {/* Spotify section — only once an account is connected */}
        {spotify && (
          <>
            <div className="sidebar-divider" />
            <Section
              title="Spotify"
              glyph={<SpotifyGlyph size={14} style={iconStyle('spotify')} />}
              expanded={spotifyExpanded}
              onToggle={() => setSpotifyExpanded((v) => !v)}
              onContextMenu={openColourMenu('spotify')}
              trailing={
                spotify.newTotal > 0 ? (
                  <span className="sidebar-section__new">{spotify.newTotal}</span>
                ) : undefined
              }
            >
              <SpotifyLists
                lists={spotify.lists}
                counts={spotify.counts}
                newByList={spotify.newByList}
                activeListId={spotify.activeListId}
                onOpen={spotify.onOpenList}
              />
            </Section>
          </>
        )}
```

6. In the collapsed branch:
   - add the prop `spotifyNew={spotify ? spotify.newTotal : null}` to `<SidebarRail`;
   - replace its `renderSection={(section, close) => ( … )}` prop, which today holds only the `FolderTree`, with:

```tsx
          renderSection={(section, close) =>
            section === 'spotify' ? (
              spotify && (
                <SpotifyLists
                  lists={spotify.lists}
                  counts={spotify.counts}
                  newByList={spotify.newByList}
                  activeListId={spotify.activeListId}
                  onOpen={(id) => {
                    spotify.onOpenList(id)
                    close()
                  }}
                />
              )
            ) : (
              // Navigating closes the flyout; expanding a playlist folder does
              // not, because FolderTree handles that without calling these.
              <FolderTree
                {...treeProps}
                section={section}
                onFolderSelect={(path) => {
                  onFolderSelect(path)
                  close()
                }}
                onPlaylistSelect={(id) => {
                  onPlaylistSelect(id)
                  close()
                }}
              />
            )
          }
```

- [ ] **Step 6: The rail, and styles**

The rail already has what the number needs: `sectionButton`'s `badge` argument, `.sidebar-rail__badge` (9px, `--accent-hover`, top-right), and flyout titles from `SECTION_LABELS`. What it lacks is a way to draw a non-lucide icon, and the Spotify button itself.

In `src/components/layout/SidebarRail.tsx`:

1. Change `import { Icon, type IconName } from '../Icon'` to `import { Icon } from '../Icon'`, and add `import { SpotifyGlyph } from '../spotify/SpotifyGlyph'`.

2. Add to `SidebarRailProps`, and destructure it:

```ts
  /** The Spotify new-likes number; null hides the Spotify icon (not connected). */
  spotifyNew: number | null
```

3. `sectionButton` takes what to draw instead of an icon name. Change its third parameter from `icon: IconName` to `glyph: ReactNode`, and replace `<Icon name={icon} size={16} style={iconStyle(section)} />` inside it with `{glyph}`.

4. Replace the two calls, and add Spotify:

```tsx
        {sectionButton(
          'folders',
          SECTION_LABELS.folders,
          <Icon name="Disc3" size={16} style={iconStyle('folders')} />,
        )}
        {sectionButton(
          'playlists',
          SECTION_LABELS.playlists,
          <Icon name="ListMusic" size={16} style={iconStyle('playlists')} />,
        )}
        {spotifyNew !== null &&
          sectionButton(
            'spotify',
            SECTION_LABELS.spotify,
            <SpotifyGlyph size={16} style={iconStyle('spotify')} />,
            spotifyNew,
          )}
```

Append to `src/components/layout/Sidebar.css`:

```css
/* ===== Spotify ===== */

/* The new-likes number: plain, in the accent colour, where counts sit. */
.sidebar-section__new {
  color: var(--accent-hover);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.spotify-list-row {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.spotify-list-row__icon {
  margin-right: 6px;
  color: var(--text-secondary);
}

.spotify-list-row__new {
  margin-left: 6px;
  color: var(--accent-hover);
  font-size: 11px;
  font-weight: 600;
}

.folder-row.selected .spotify-list-row__icon,
.folder-row.selected .spotify-list-row__new {
  color: inherit;
}
```

- [ ] **Step 7: The view's header**

```tsx
// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library: what is Owned,
// what is Missing, and what might be either.
import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useNow } from '../spotify/useNow'
import type { SpotifyData } from '../spotify/useSpotify'
import { countByStatus, formatSynced, rowsFor } from '../../lib/spotify/rows'
import { getErrorMessage } from '../../types/ai'
import { ALL_LISTS, LIKED } from '../../types/spotify'
import './SpotifyView.css'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
}

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(spotify: SpotifyData, now: number | null): string {
  if (spotify.syncing) return 'syncing…'
  const status = spotify.status
  const ago = status?.lastSyncedAt && now !== null ? formatSynced(status.lastSyncedAt, now) : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  if (status?.lastError) return ago ? `last synced ${ago} · couldn't reach Spotify` : "couldn't reach Spotify"
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

export function SpotifyView({ listId, spotify }: SpotifyViewProps) {
  const now = useNow(30_000)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  const list = spotify.library.lists.find((l) => l.id === listId)
  const title = listId === ALL_LISTS ? 'All playlists' : (list?.name ?? 'Spotify playlist')

  const rows = useMemo(
    () => rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])

  const reconnect = () => {
    setReconnecting(true)
    setReconnectError(null)
    spotify
      .reconnect()
      .catch((e: unknown) => setReconnectError(getErrorMessage(e)))
      .finally(() => setReconnecting(false))
  }

  return (
    <div className="spotify-view">
      {spotify.status?.needsReconnect && (
        <div className="spotify-reconnect" role="alert">
          <span>Spotify needs you to sign in again. Your lists stay as they were.</span>
          <button
            type="button"
            className="spotify-mini spotify-mini--primary"
            disabled={reconnecting}
            onClick={reconnect}
          >
            {reconnecting ? 'Waiting for Spotify…' : 'Reconnect Spotify'}
          </button>
          {reconnectError && <span className="spotify-reconnect__error">{reconnectError}</span>}
        </div>
      )}

      <header className="spotify-header">
        <div className="spotify-header__cover">
          <Icon name={listId === LIKED ? 'Heart' : 'ListMusic'} size={36} strokeWidth={1.75} />
        </div>
        <div className="spotify-header__info">
          <div className="spotify-header__kicker">Spotify playlist</div>
          <h1 className="spotify-header__title">{title}</h1>
          <div className="spotify-header__meta">
            <b>{counts.all} tracks</b>·
            <span className="spotify-header__owned">{counts.owned} owned</span>·
            <span>{counts.missing} missing</span>·
            <span className="spotify-header__maybe">{counts.maybe} maybe</span>
            <button
              type="button"
              className="spotify-header__sync"
              onClick={spotify.syncNow}
              disabled={spotify.syncing}
              title="Sync with Spotify now"
            >
              <Icon name="RefreshCw" size={12} />
              {syncLine(spotify, now)}
            </button>
          </div>
        </div>
      </header>

      {listId !== ALL_LISTS && !list && (
        <p className="spotify-empty">This playlist is no longer on Spotify, or Spotify stopped sharing it.</p>
      )}
    </div>
  )
}
```

```css
/* src/components/views/SpotifyView.css
   The Spotify view, after the approved mockup (docs/superpowers/specs/2026-10-03-spotify-section-mockup.html). */

.spotify-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-primary);
}

/* ---- Reconnect bar ---- */

.spotify-reconnect {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px;
  flex-shrink: 0;
  background: rgba(var(--color-warning-rgb), 0.1);
  border-bottom: 1px solid rgba(var(--color-warning-rgb), 0.35);
  color: var(--text-primary);
  font-size: 13px;
}

.spotify-reconnect__error {
  color: var(--color-danger);
  font-size: 12px;
}

/* ---- Header ---- */

.spotify-header {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 22px 24px 14px;
  flex-shrink: 0;
}

.spotify-header__cover {
  width: 84px;
  height: 84px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  background: linear-gradient(135deg, #4f46e5, #9333ea);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.spotify-header__info {
  min-width: 0;
}

.spotify-header__kicker {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.spotify-header__title {
  font-size: 28px;
  font-weight: 800;
  margin: 2px 0 6px;
  letter-spacing: -0.4px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotify-header__meta {
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.spotify-header__meta b {
  color: var(--text-primary);
  font-weight: 600;
}

.spotify-header__owned {
  color: var(--color-success);
}

.spotify-header__maybe {
  color: var(--color-warning);
}

.spotify-header__sync {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
}

.spotify-header__sync:hover:not(:disabled) {
  color: var(--text-primary);
}

.spotify-empty {
  padding: 32px 24px;
  color: var(--text-secondary);
  font-size: 13px;
}

/* ---- Small buttons (reconnect, row actions) ---- */

.spotify-mini {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
}

.spotify-mini:hover:not(:disabled) {
  border-color: var(--text-muted);
}

.spotify-mini--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
```

- [ ] **Step 8: App — state, hook, navigation, sidebar, view**

In `src/App.tsx`:

1. Imports:

```ts
import { useSpotify } from './components/spotify/useSpotify'
import { SpotifyView } from './components/views/SpotifyView'
```

2. After `const [showAIChat, setShowAIChat] = useState(false)`:

```ts
  /** The open Spotify list: 'all', 'liked' or a playlist id; null when another view is open. */
  const [spotifyListId, setSpotifyListId] = useState<string | null>(null)
```

3. After `const sidebarPrefs = useSidebarPrefs({ dbReady })`:

```ts
  const spotify = useSpotify(dbReady, totalTrackCount)
```

4. **Every other view closes the Spotify view.** Add `setSpotifyListId(null)` inside each of these blocks, next to their other `set…` calls. Run `grep -n "setShowSets(\|setShowSettings(true)\|setShowSearch(true)" src/App.tsx` to find them:
   - `useAIStore.getState().registerOpenSettings(() => { … })`
   - `handleFolderSelect`
   - `handlePlaylistSelect`
   - the sidebar's `onOpenSettings`, `onNavigateHome`, `onShowAllTracks`, `onSearch`, `onNavigateSets` and `onNavigateAIChat`
   - `SearchView`'s `onPlaylistSelect`
   - `HomeView`'s `onNavigateAIChat` and `onOpenSettings`

   `onSearch` has no `setShowSets(false)` today. Add the line there anyway.

5. Below `handlePlaylistSelect`, add:

```ts
  // A Spotify list: every other view closes, and opening it marks it seen.
  function openSpotifyList(listId: string) {
    setSpotifyListId(listId)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    spotify.openList(listId)
  }
```

6. Directly above `const viewKey =`:

```ts
  // The Spotify view only exists while an account is connected.
  const shownSpotifyList = spotify.connected ? spotifyListId : null
```

Make `shownSpotifyList` the first test in both chains:

```ts
  const viewKey = shownSpotifyList !== null
    ? `spotify-${shownSpotifyList}`
    : showSettings
      ? 'settings'
      // …the rest of the chain unchanged
```

```ts
  const activeView: ActiveView = shownSpotifyList !== null
    ? 'spotify'
    : showSettings
      ? 'settings'
      // …the rest of the chain unchanged
```

7. On `<Sidebar`, add:

```tsx
      spotify={
        spotify.connected
          ? {
              lists: spotify.library.lists,
              counts: spotify.counts,
              newTotal: spotify.newCounts.total,
              newByList: spotify.newCounts.byList,
              activeListId: shownSpotifyList,
              onOpenList: openSpotifyList,
            }
          : undefined
      }
```

8. In the main view chain, make the Spotify view the first branch. Replace `{showSets ? (` with:

```tsx
            {shownSpotifyList !== null ? (
              <SpotifyView listId={shownSpotifyList} spotify={spotify} />
            ) : showSets ? (
```

- [ ] **Step 9: Typecheck, test, lint, look**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/App.tsx src/components/layout src/components/spotify src/components/views/SpotifyView.tsx src/lib/sidebarPrefs.ts`
Expected: no type errors and all tests pass. eslint reports only the four warnings these files already had: in `App.tsx`, the unused eslint-disable and the `initializeApp` exhaustive-deps warning; in `NowPlayingBar.tsx`, two exhaustive-deps warnings. **Do not** use `git stash` to compare: it would sweep up the user's unrelated changes.

In the app (`npm run tauri dev`) with no Spotify account, nothing about Spotify shows anywhere except Settings. The full section is checked with seeded data in Task 20.

- [ ] **Step 10: Commit**

```bash
git add src/lib/sidebarPrefs.ts src/lib/sidebarPrefs.test.ts src/components/spotify/SpotifyGlyph.tsx src/components/spotify/SpotifyLists.tsx src/components/layout/sidebarTypes.ts src/components/layout/Sidebar.tsx src/components/layout/SidebarRail.tsx src/components/layout/Sidebar.css src/components/views/SpotifyView.tsx src/components/views/SpotifyView.css src/App.tsx
git commit -m "feat(spotify): a SPOTIFY section in the sidebar and the rail, with the new-likes number, opening a list's view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: The view — filters, search, table, footer

**Files:**
- Modify: `src/components/views/SpotifyView.tsx` (replace the whole file)
- Modify: `src/components/views/SpotifyView.css` (append)

The spec's layout:
- **Toolbar:** a search field and the chips **All / Missing / Maybe / Owned** with counts. The filter is remembered for the session (it lives in `useSpotify`).
- **Table**, in the TrackTable style (36px header, 32px rows, 13px): `# · Title · Artist · Added · Status`. In All playlists a **Playlist** column follows Artist.
- New tracks carry an indigo dot.
- **Footer:** `263 of 731 · sorted by date added, newest first`.

- [ ] **Step 1: Replace `SpotifyView.tsx`**

```tsx
// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library: what is Owned,
// what is Missing, and what might be either.
import { Fragment, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useNow } from '../spotify/useNow'
import type { SpotifyData } from '../spotify/useSpotify'
import {
  countByStatus,
  filterRows,
  formatAdded,
  formatSynced,
  rowsFor,
  type SpotifyRow,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { getErrorMessage } from '../../types/ai'
import { ALL_LISTS, LIKED } from '../../types/spotify'
import './SpotifyView.css'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'owned', label: 'Owned' },
]

const STATUS_LABEL = { owned: 'Owned', missing: 'Missing', maybe: 'Maybe' } as const

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(spotify: SpotifyData, now: number | null): string {
  if (spotify.syncing) return 'syncing…'
  const status = spotify.status
  const ago = status?.lastSyncedAt && now !== null ? formatSynced(status.lastSyncedAt, now) : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  if (status?.lastError) return ago ? `last synced ${ago} · couldn't reach Spotify` : "couldn't reach Spotify"
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

function StatusCell({ row }: { row: SpotifyRow }) {
  return (
    <span className={`spotify-status__${row.ownership.kind}`}>{STATUS_LABEL[row.ownership.kind]}</span>
  )
}

export function SpotifyView({ listId, spotify }: SpotifyViewProps) {
  const now = useNow(30_000)
  const nowDate = useMemo(() => (now === null ? null : new Date(now)), [now])
  const [query, setQuery] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  const list = spotify.library.lists.find((l) => l.id === listId)
  const title = listId === ALL_LISTS ? 'All playlists' : (list?.name ?? 'Spotify playlist')
  const showLists = listId === ALL_LISTS

  const rows = useMemo(
    () => rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])
  const shown = useMemo(() => filterRows(rows, spotify.filter, query), [rows, spotify.filter, query])

  const reconnect = () => {
    setReconnecting(true)
    setReconnectError(null)
    spotify
      .reconnect()
      .catch((e: unknown) => setReconnectError(getErrorMessage(e)))
      .finally(() => setReconnecting(false))
  }

  const rowClass = (extra: string) => `spotify-row ${extra} ${showLists ? 'spotify-row--lists' : ''}`

  return (
    <div className="spotify-view">
      {spotify.status?.needsReconnect && (
        <div className="spotify-reconnect" role="alert">
          <span>Spotify needs you to sign in again. Your lists stay as they were.</span>
          <button
            type="button"
            className="spotify-mini spotify-mini--primary"
            disabled={reconnecting}
            onClick={reconnect}
          >
            {reconnecting ? 'Waiting for Spotify…' : 'Reconnect Spotify'}
          </button>
          {reconnectError && <span className="spotify-reconnect__error">{reconnectError}</span>}
        </div>
      )}

      <header className="spotify-header">
        <div className="spotify-header__cover">
          <Icon name={listId === LIKED ? 'Heart' : 'ListMusic'} size={36} strokeWidth={1.75} />
        </div>
        <div className="spotify-header__info">
          <div className="spotify-header__kicker">Spotify playlist</div>
          <h1 className="spotify-header__title">{title}</h1>
          <div className="spotify-header__meta">
            <b>{counts.all} tracks</b>·
            <span className="spotify-header__owned">{counts.owned} owned</span>·
            <span>{counts.missing} missing</span>·
            <span className="spotify-header__maybe">{counts.maybe} maybe</span>
            <button
              type="button"
              className="spotify-header__sync"
              onClick={spotify.syncNow}
              disabled={spotify.syncing}
              title="Sync with Spotify now"
            >
              <Icon name="RefreshCw" size={12} />
              {syncLine(spotify, now)}
            </button>
          </div>
        </div>
      </header>

      <div className="spotify-toolbar">
        <label className="spotify-search">
          <Icon name="Search" size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title}…`}
            spellCheck={false}
          />
        </label>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`spotify-chip ${spotify.filter === key ? 'spotify-chip--on' : ''}`}
            onClick={() => spotify.setFilter(key)}
          >
            {label} <small>{counts[key]}</small>
          </button>
        ))}
      </div>

      <div className="spotify-table" role="table" aria-label={title}>
        <div className={rowClass('spotify-row--head')} role="row">
          <span className="spotify-cell--num">#</span>
          <span>Title</span>
          <span>Artist</span>
          {showLists && <span>Playlist</span>}
          <span>Added</span>
          <span className="spotify-cell--status">Status</span>
        </div>

        {shown.map((row, index) => (
          <Fragment key={row.track.spotifyId}>
            <div className={rowClass('spotify-row--data')} role="row">
              <span className="spotify-cell--num">{index + 1}</span>
              <span className="spotify-cell--title" title={row.track.title}>
                {row.isNew && <i className="spotify-new-dot" aria-label="New" />}
                {row.track.title}
              </span>
              <span className="spotify-cell--artist" title={row.track.artists}>
                {row.track.artists}
              </span>
              {showLists && (
                <span className="spotify-cell--lists" title={row.lists.join(', ')}>
                  {row.lists.join(', ')}
                </span>
              )}
              <span className="spotify-cell--added">{nowDate ? formatAdded(row.addedAt, nowDate) : ''}</span>
              <span className="spotify-cell--status">
                <StatusCell row={row} />
              </span>
            </div>
          </Fragment>
        ))}

        {shown.length === 0 && (
          <p className="spotify-empty">
            {listId !== ALL_LISTS && !list
              ? 'This playlist is no longer on Spotify, or Spotify stopped sharing it.'
              : rows.length === 0
                ? 'Nothing here yet — the first sync may still be running.'
                : 'Nothing matches.'}
          </p>
        )}
      </div>

      <div className="spotify-footer">
        {shown.length} of {rows.length} · sorted by date added, newest first
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Styles** (append to `SpotifyView.css`)

```css
/* ---- Toolbar ---- */

.spotify-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 24px 12px;
  flex-shrink: 0;
}

.spotify-search {
  flex: 1;
  max-width: 320px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
}

.spotify-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.spotify-chip {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.spotify-chip small {
  opacity: 0.6;
  font-size: 11px;
}

.spotify-chip--on {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
}

/* ---- Table: TrackTable's sizes — 36px header, 32px rows, 13px ---- */

.spotify-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--border-subtle);
}

.spotify-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1.7fr) minmax(0, 1.3fr) 72px 220px;
  align-items: center;
  height: 32px;
  padding: 0 16px 0 8px;
  font-size: 13px;
}

.spotify-row--lists {
  grid-template-columns: 44px minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1fr) 72px 220px;
}

.spotify-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 36px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-subtle);
}

.spotify-row--data:hover {
  background: var(--bg-tertiary);
}

.spotify-cell--num {
  color: var(--text-muted);
  text-align: right;
  padding-right: 14px;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.spotify-cell--title,
.spotify-cell--artist,
.spotify-cell--lists {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}

.spotify-cell--title {
  color: var(--text-primary);
}

.spotify-cell--artist {
  color: var(--text-secondary);
}

.spotify-cell--lists {
  color: var(--text-muted);
  font-size: 12px;
}

.spotify-cell--added {
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.spotify-cell--status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.spotify-new-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-hover);
  margin-right: 7px;
  vertical-align: 2px;
}

.spotify-status__owned {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-success);
  font-size: 12px;
  font-weight: 600;
}

.spotify-status__missing {
  color: var(--text-muted);
  font-size: 12px;
  margin-right: auto;
}

.spotify-status__maybe {
  color: var(--color-warning);
  font-size: 12px;
  font-weight: 600;
  margin-right: auto;
}

.spotify-footer {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 12px;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/components/views/SpotifyView.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/views/SpotifyView.tsx src/components/views/SpotifyView.css
git commit -m "feat(spotify): the list view — filters with counts, search, and the Owned / Maybe / Missing table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Row actions — play, SelectedRecs, Copy, Yes / No, and the Maybe sub-row

**Files:**
- Create: `src/components/spotify/SpotifyRowActions.tsx`
- Modify: `src/components/views/SpotifyView.tsx`, `src/components/views/SpotifyView.css`
- Modify: `src/App.tsx` (pass `onPlayTrack`)

| Status | Shown |
|---|---|
| Owned | `✓ Owned` (success colour) and the Spotify play button |
| Missing | `Missing`, play, SelectedRecs ↗, and **Copy** (primary). Copy shows `✓ Copied` for 1.5 s. |
| Maybe | `Maybe` (warning colour), play, **Yes** / **No**. A sub-row reads `In library: <file name> · <reason>`. |

The play button asks Rust to play on the active device. Rust falls back to opening the Spotify app by itself, so no error is shown either way. Double-clicking an **Owned** row plays the library file, queued with the other owned rows on screen.

- [ ] **Step 1: The actions**

```tsx
// src/components/spotify/SpotifyRowActions.tsx
// The Status cell of a Spotify row: what it is, and what can be done about it.
import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from './SpotifyGlyph'
import { tauriApi } from '../../lib/tauri-api'
import { copyText, selectedRecsUrl } from '../../lib/spotify/title'
import type { SpotifyRow } from '../../lib/spotify/rows'
import type { Verdict } from '../../types/spotify'

interface SpotifyRowActionsProps {
  row: SpotifyRow
  onVerdict: (verdict: Verdict) => void
}

const COPIED_MS = 1500

export function SpotifyRowActions({ row, onVerdict }: SpotifyRowActionsProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const play = (
    <button
      type="button"
      className="spotify-mini spotify-mini--icon spotify-mini--play"
      title="Play on Spotify"
      aria-label="Play on Spotify"
      onClick={() => {
        // Rust opens the Spotify app itself when there is no active device or no Premium.
        void tauriApi.playSpotifyTrack(row.track.spotifyId).catch(() => {})
      }}
    >
      <SpotifyGlyph size={12} />
    </button>
  )

  if (row.ownership.kind === 'owned') {
    return (
      <span className="spotify-status">
        <span className="spotify-status__owned">
          <Icon name="Check" size={14} strokeWidth={2.2} />
          Owned
        </span>
        {play}
      </span>
    )
  }

  if (row.ownership.kind === 'maybe') {
    return (
      <span className="spotify-status">
        <span className="spotify-status__maybe">Maybe</span>
        {play}
        <button type="button" className="spotify-mini" onClick={() => onVerdict('yes')} title="This is the file">
          Yes
        </button>
        <button type="button" className="spotify-mini" onClick={() => onVerdict('no')} title="Not this file">
          No
        </button>
      </span>
    )
  }

  return (
    <span className="spotify-status">
      <span className="spotify-status__missing">Missing</span>
      {play}
      <button
        type="button"
        className="spotify-mini spotify-mini--icon"
        title="Search on SelectedRecs"
        aria-label="Search on SelectedRecs"
        onClick={() => {
          void openUrl(selectedRecsUrl(row.track))
        }}
      >
        <Icon name="ExternalLink" size={12} />
      </button>
      <button
        type="button"
        className={`spotify-mini ${copied ? 'spotify-mini--copied' : 'spotify-mini--primary'}`}
        title={copyText(row.track)}
        onClick={() => {
          void navigator.clipboard
            .writeText(copyText(row.track))
            .then(() => setCopied(true))
            .catch(() => {})
        }}
      >
        <Icon name={copied ? 'Check' : 'Copy'} size={12} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
```

- [ ] **Step 2: Use it in the view**

In `src/components/views/SpotifyView.tsx`:

1. Imports: add

```ts
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import type { Track } from '../../types/track'
```

and add `fileName` to the import from `'../../lib/spotify/rows'`.

2. Delete `STATUS_LABEL` and the `StatusCell` function.

3. Props: add

```ts
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
```

and destructure it: `export function SpotifyView({ listId, spotify, onPlayTrack }: SpotifyViewProps)`.

4. After the `shown` memo, add:

```ts
  // Double-clicking an Owned row plays its file, queued with the other owned rows on screen.
  const ownedQueue = useMemo(
    () =>
      shown.flatMap((row) =>
        row.ownership.kind === 'owned' && row.ownership.file ? [row.ownership.file as Track] : [],
      ),
    [shown],
  )

  const playOwned = (row: SpotifyRow) => {
    const file = row.ownership.file
    if (row.ownership.kind !== 'owned' || !file) return
    const index = ownedQueue.findIndex((track) => track.id === file.id)
    if (index >= 0) onPlayTrack(ownedQueue[index], ownedQueue, index)
  }

  const answer = (row: SpotifyRow, verdict: 'yes' | 'no') => {
    if (row.ownership.file) spotify.setVerdict(row.track.spotifyId, row.ownership.file.id, verdict)
  }
```

5. Replace the data row's opening tag `<div className={rowClass('spotify-row--data')} role="row">` with:

```tsx
            <div
              className={rowClass(
                `spotify-row--data ${row.ownership.kind === 'owned' ? 'spotify-row--owned' : ''}`,
              )}
              role="row"
              onDoubleClick={() => playOwned(row)}
            >
```

6. Replace

```tsx
              <span className="spotify-cell--status">
                <StatusCell row={row} />
              </span>
```

with

```tsx
              {/* Double-clicking a button must not also play the row. */}
              <span className="spotify-cell--status" onDoubleClick={(e) => e.stopPropagation()}>
                <SpotifyRowActions row={row} onVerdict={(verdict) => answer(row, verdict)} />
              </span>
```

7. After that row's closing `</div>` and before `</Fragment>`, add the Maybe sub-row:

```tsx
            {row.ownership.kind === 'maybe' && row.ownership.file && (
              <div className="spotify-row spotify-row--sub" role="row">
                <span />
                <span className="spotify-hint">
                  In library: <code title={row.ownership.file.file_path}>{fileName(row.ownership.file.file_path)}</code>
                  <span className="spotify-hint__why">· {row.ownership.reason}</span>
                </span>
              </div>
            )}
```

- [ ] **Step 3: Styles** (append to `SpotifyView.css`)

```css
/* ---- Row actions ---- */

.spotify-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
}

.spotify-mini--icon {
  padding: 0 6px;
  color: var(--text-secondary);
}

/* Spotify's own green, whatever the theme's success colour is. */
.spotify-mini--play {
  color: #1ed760;
}

.spotify-mini--copied {
  color: var(--color-success);
  border-color: var(--color-success);
}

.spotify-row--owned {
  cursor: pointer;
}

/* ---- Maybe sub-row ---- */

.spotify-row--sub {
  height: 34px;
  background: rgba(var(--color-warning-rgb), 0.06);
}

.spotify-hint {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.spotify-hint code {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotify-hint__why {
  color: var(--text-muted);
  white-space: nowrap;
}
```

- [ ] **Step 4: Pass the player in App**

In `src/App.tsx`, change `<SpotifyView listId={shownSpotifyList} spotify={spotify} />` to:

```tsx
              <SpotifyView listId={shownSpotifyList} spotify={spotify} onPlayTrack={handlePlayTrack} />
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npx eslint src/components/spotify src/components/views/SpotifyView.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/spotify/SpotifyRowActions.tsx src/components/views/SpotifyView.tsx src/components/views/SpotifyView.css src/App.tsx
git commit -m "feat(spotify): play on Spotify, search SelectedRecs, Copy, answer Maybe, and play owned files by double-click

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Verify — the full checks, by hand without an account, and on the real account

**Files:** none, apart from fix-ups if something fails.

- [ ] **Step 1: The full automated checks**

```bash
npx vitest run
npx tsc --noEmit -p .
npx eslint src
cd src-tauri && cargo test && cargo clippy --all-targets
```

Expected:
- vitest: every test passes, including `src/lib/spotify/*` (38 tests) and the new ones in `match.test.ts` and `sidebarPrefs.test.ts`. When this plan was checked against `6b98874`: 18 files, 199 passed, 8 skipped.
- tsc: no errors.
- eslint: the same 10 errors and 13 warnings as before this branch, all in files this plan did not touch. Nothing in `src/lib/spotify`, `src/components/spotify`, `SpotifyView`, `SpotifySection`, the layout files, `useSpotify` or `App.tsx` beyond what `App.tsx` already had.
- cargo test: every `test result: ok`, including `db::spotify` (16), `external::spotify::tests` (17), `external::spotify_auth` (15) and `commands::spotify` (9). The lib had 228 passing when this plan was checked.
- clippy: no warning that points at a `spotify` file.

Run: `git status --short`
Expected: only the user's own pre-existing changes (`.claude/…`, `src-tauri/Cargo.lock`, the untracked docs). Nothing from this plan is left uncommitted. `Cargo.lock` must show no new Spotify-related churn: `git diff src-tauri/Cargo.lock | grep '^[+-]name'` prints nothing new.

- [ ] **Step 2: By hand, without a Spotify account**

Launch with `npm run tauri dev`.

1. **Settings → Spotify:**
   - the five steps and the redirect URI show, and Copy copies it;
   - `abc` + Save gives the "32 letters and digits" message;
   - `0123456789abcdef0123456789abcdef` saves, and **Connect Spotify** becomes active.
2. **Port taken:** in a terminal, run `python3 -m http.server 47816 --bind 127.0.0.1`, then press Connect. Settings shows one line saying port 47816 is in use. Stop the server.
3. **Connect with the fake Client ID:**
   - the system browser opens `accounts.spotify.com/authorize?…` and Spotify says `INVALID_CLIENT`;
   - Settings shows "Waiting for Spotify in your browser…";
   - after 5 minutes it reads "No answer from the browser — press Connect to try again".
4. **Hidden until connected:** no SPOTIFY section in the sidebar, and no Spotify icon in the rail (`⌘\`).
5. **Seed a fake account.**
   - Quit the app and back up the database:

```bash
DB="$HOME/Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.db"
cp "$DB" "$DB.before-spotify-check"
sqlite3 "$DB" <<'SQL'
INSERT OR REPLACE INTO settings (key, value) VALUES
  ('spotify_client_id', '0123456789abcdef0123456789abcdef'),
  ('spotify_refresh_token', 'not-a-real-token'),
  ('spotify_account_name', 'Test account'),
  ('spotify_last_synced_at', printf('%d', (strftime('%s','now') - 7200) * 1000));
INSERT INTO spotify_lists (id, name, snapshot_id, position, track_count, last_opened_at) VALUES
  ('liked', 'Liked Songs', NULL, 0, 2, 0),
  ('pl_test', 'Tech House', 'snap', 1, 2, 0);
-- One track you own, copied from the first tagged file in the library.
INSERT INTO spotify_tracks (spotify_id, title, artists, album, duration_ms)
  SELECT '4uLU6hMCjMI75M1A2tKUQC', title, artist, NULL, 300000
  FROM tracks WHERE artist <> '' AND title <> ''
    AND artist NOT IN ('Unknown Artist', 'Unknown', 'Various Artists', 'Various', 'VA') LIMIT 1;
-- Two you do not.
INSERT INTO spotify_tracks (spotify_id, title, artists, album, duration_ms) VALUES
  ('0000000000000000000001', '300 Cash - Extended Mix', 'Moreno & Prieto, Sortech', NULL, 300000),
  ('0000000000000000000002', 'I Need A Rush (feat. Sheree Hicks) - Extended Mix', 'Discoplex, Izaac Moses, Sheree Hicks', NULL, 300000);
INSERT INTO spotify_list_tracks (list_id, spotify_id, added_at, first_seen_at) VALUES
  ('liked',   '4uLU6hMCjMI75M1A2tKUQC', '2026-09-28T10:00:00Z', 1),
  ('liked',   '0000000000000000000001', '2026-10-03T07:00:00Z', 1),
  ('pl_test', '0000000000000000000001', '2026-10-01T07:00:00Z', 1),
  ('pl_test', '0000000000000000000002', '2026-09-20T07:00:00Z', 0);
SQL
```

   - Optional, for a **Maybe**: find a library file whose artist has three words (`sqlite3 "$DB" "SELECT artist, title FROM tracks WHERE artist LIKE '% % %' LIMIT 5"`), for example `Hot Since 82`. Insert a Spotify track with the same title and the last artist word replaced, for example `Hot Since Zzyzx`, and an entry for it in `liked`. Two of three words agree, which reads as Maybe.
6. **Launch and check the sidebar:**
   - SPOTIFY shows below PLAYLISTS, with **1** in the accent colour on its header. "300 Cash" is new and missing. The owned track is new too, but it is owned.
   - Inside: All playlists (3), Liked Songs **1** (2), Tech House **1** (2).
   - Collapse the section: the 1 stays on the header.
   - `⌘\`: the rail shows the Spotify icon with a 9px **1** at its top-right. Clicking it opens a flyout with the three items, and clicking one opens it and closes the flyout.
   - Right-click the SPOTIFY header: the colour menu. The icon is green only while a Spotify list is open.
7. **Liked Songs view:**
   - the header has the heart cover, "SPOTIFY PLAYLIST", and `2 tracks · 1 owned · 1 missing · 0 maybe`;
   - the meta line ends `last synced 2 h ago · couldn't reach Spotify`, once the start-up sync has failed on the fake token. Settings → Spotify shows the failure ("Spotify answered 400: …").
   - "300 Cash - Extended Mix" carries the indigo dot, and the sidebar number on Liked Songs clears at once while the dot stays. Reopen Liked Songs: the dot is gone.
   - The chips filter, with counts; the search narrows.
   - The footer reads `2 of 2 · sorted by date added, newest first`.
8. **All playlists:** a Playlist column; "300 Cash" shows once, with `Liked Songs, Tech House` and its newest date. Opening it clears every list's number.
9. **Row actions:**
   - **Copy** on "I Need A Rush…" puts `Discoplex, Izaac Moses, Sheree Hicks - I Need A Rush (Extended Mix)` on the clipboard, and the button reads `✓ Copied` for about 1.5 s.
   - **↗** opens `https://srv.selectedrecs.com/#/search?text=Moreno%20%26%20Prieto%2C%20Sortech%20-%20300%20Cash` in the browser.
   - The **Spotify play button** opens the Spotify desktop app on the track (when installed), with no error shown. The fake token cannot play, so this is the fallback path.
   - **Double-click** the Owned row: the library file plays in RecoDeck's player.
   - With the optional Maybe: the sub-row reads `In library: <file> · same title, artist partly matches`. **Yes** turns the row Owned, and it stays Owned after a restart. Re-seed, then **No**: the row turns Missing.
10. **Reconnect bar:** quit, then run `sqlite3 "$DB" "INSERT OR REPLACE INTO settings VALUES ('spotify_needs_reconnect','1')"`, and launch.
    - The view shows "Spotify needs you to sign in again" with **Reconnect Spotify**, the tracks stay visible, and the meta line reads `last synced …` with no "couldn't reach".
    - The loop does not try to sync.
11. **Disconnect** in Settings: the SPOTIFY section and the rail icon disappear, and the Spotify view closes. Then run `sqlite3 "$DB" "SELECT COUNT(*) FROM spotify_tracks"`, which prints `0`. The Client ID is still in the field.
12. **Clean up:** quit, `mv "$DB.before-spotify-check" "$DB"`.

- [ ] **Step 3: On the real account (needs the user)**

The user creates the app on developer.spotify.com, following Settings' steps.
1. **Connect:**
   - the browser asks for the five permissions;
   - the tab says it can be closed;
   - Settings shows "Connected as <name>", and "The first sync is running…" turns into "Synced <time>".
2. **First sync:**
   - ~1,000 tracks in under a minute;
   - the sidebar lists All playlists (about 1021), Liked Songs (about 731) and each owned or collaborative playlist with its count, in Spotify's order;
   - followed playlists owned by others are listed in Settings as not shared (the 2026 development-mode rule).
3. **Ownership spot-check:**
   - ten Owned rows really are in the library;
   - ten Missing rows really are not;
   - the Maybe sub-rows name plausible files;
   - start-up shows the sidebar number without a visible freeze.
4. **Like a track on the phone:**
   - within 10 minutes (or at once via "synced …") the SPOTIFY header and Liked Songs show **1**, and the row has a dot;
   - opening Liked Songs clears the number;
   - liking a track already in the library raises nothing.
5. **Download that track** into a library folder: the row turns Owned without a sync, and the count does not include it.
6. **Unlike a track:** it leaves Liked Songs at the next sync. Spotify's total disagrees, so the list is read in full, and other tracks keep their dots or lack of them.
7. **Add a track to one of your playlists:** that playlist's item shows the number; other playlists are not re-read (same snapshot).
8. **Play button:**
   - Spotify open and playing on some device (Premium): the track plays there;
   - Spotify closed: the Spotify app opens on the track;
   - no error in either case.
9. **Revoke** the app at spotify.com/account/apps → next sync → the Reconnect bar, with the tracks still visible. **Reconnect** → sign in → the bar goes.
10. **Offline:** Wi-Fi off → "synced …" click → `last synced X ago · couldn't reach Spotify`; Wi-Fi on → the next sync clears it.

- [ ] **Step 4: Commit any fix-ups**

Add only the files you changed, by name. Never `-A`.

```bash
git add <the files you fixed>
git commit -m "fix(spotify): <what the check found>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Skip this step if nothing needed fixing.
