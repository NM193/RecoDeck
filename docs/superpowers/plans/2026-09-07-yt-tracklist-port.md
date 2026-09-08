# yt-tracklist → RecoDeck Port — Implementation Plan

**Goal:** Bring the standalone `yt-tracklist` tool into RecoDeck as a new sidebar section,
and add one thing it could not do on its own — tell the user which tracks of a set they
already own.

**Architecture:** Split by what each side is good at. The parser is ~960 lines of proven,
dependency-free string logic and ports to `src/lib/tracklist/` almost verbatim, with the
tool's `fixtures/` becoming vitest inputs. Only the network layer moves to Rust
(`src-tauri/src/external/youtube.rs`), so the API key never reaches the webview and every
call passes a single quota counter.

**Tech stack:** Rust (reqwest, rusqlite — both already dependencies), TypeScript, React 19.
No new dependencies in either half.

**Source of the port:** `~/Desktop/Claude Projects/yt-tracklist/` — see its `PREBACIVANJE.md`
for the algorithms, what was measured, and what was deliberately discarded (notably: do not
build audio fingerprinting; the largest commercial database found 15% of one set).

---

## Decisions already settled

| Question | Answer |
|---|---|
| Scope | Port the tool as it is, plus library matching |
| Engine | Parser in TypeScript, network in Rust |
| Placement | New sidebar section directly under Home |
| Navigation | Existing `activeView` union in `App.tsx` — no router (Rule 1) |
| Listening | **Open in the browser at the timestamp** — see M0 below |
| AI | Stays disabled (`AI_ENABLED = false`); tracklist does its own matching |
| API key | Each user brings their own, entered in Settings |

---

## M0 — Spike: does an embedded player work? — DONE, ANSWER: NO

Measured, not assumed. Full evidence in `PROGRESS.md` under 2026-09-07.

- [x] Production build confirmed to serve from `tauri://localhost`, not http
- [x] All 6 real sets fail with error 153 from that origin; 4 known workarounds all fail
- [x] A real http origin fixes 153 — one set genuinely played inside the app
- [x] But 5 of 6 sets refuse embedding anywhere, confirmed in a plain Chrome tab
- [x] `status.embeddable` from the Data API is `true` for all six — the field lies

**Consequence:** M5 changed from "embedded player" to "open in browser". CSP needs only
`img-src https://i.ytimg.com` for thumbnails.

---

## M1 — Key, quota, and the network layer (no UI beyond Settings) — DONE

- [x] Wire `external/` into the crate (`pub mod external;` — the folder exists but `lib.rs`
      never declared it)
- [x] `external/youtube.rs`: `call_api`, unit costs, error mapping for `quotaExceeded`,
      `keyInvalid`, `accessNotConfigured`
- [x] Quota counter in the `settings` table, resetting at midnight **Pacific** (not local) —
      YouTube does not report remaining quota, so we count every call ourselves
- [x] `commands/youtube.rs`: save / status / delete key, test connection, read quota,
      fetch one set (video + comment pages) as raw JSON
- [x] `YouTubeSection.tsx` in Settings, following `AISection.tsx`: masked field, Test button,
      quota bar, and step-by-step instructions for creating a personal API key
- [x] Rust unit tests for the quota day boundary and error mapping (Rule 4)

**Gate:** a live fetch of `fjR4idz1-MA` returned the set and cost 2 units — 1 for the video
plus 1 comment page, since that set has only 35 comments. The 5–7 figure applies to popular
sets that fill several comment pages. The returned JSON matched the tool's own fixture for the
same video key for key, including 35 comments of which 11 are replies, so the M2 parser can be
fed a live fetch or a fixture without knowing the difference.

Signed off by hand in the running app on 2026-09-07: the section renders, Test Connection moves
the counter, and a wrong key produces a readable sentence. Two fixes came out of that check —
the failure is now shown inside the section rather than only as a toast, and the new YouTube
error variants were added to `getErrorMessage`, which had been letting raw error objects through.

---

## M2 — Parser in TypeScript, with real tests — DONE

- [x] Port the pure functions to `src/lib/tracklist/`: `extractTracklist`,
      `assembleFromComments`, `resolveUnknowns`, `collectCandidates`, `mergeCandidates`,
      `analyse`, cue helpers
- [x] Turn `fixtures/` into vitest inputs — the port is only correct if it reproduces the
      tool's current output on the user's own sets
- [x] Keep the measured tuning intact: ±20s cue window, 150s name window, containment ≥0.8
      title / ≥0.6 artist, `artistShape` floor of 0.5

**Gate passed:** identical output to the standalone tool on all six fixture sets — status,
confidence, source count and every track field, including the 42-track Hot Since 82 set and the
Dr Banana one that has no written list and is assembled from comments.

The suite was mutation-checked rather than trusted: lowering the title containment threshold
from 0.8 to 0.5 fails two of the six sets, so the fixtures genuinely detect a change in
behaviour instead of passing vacuously.

---

## M3 — The section under Home

- [ ] `'sets'` added to the `activeView` union, sidebar button under Home
- [ ] Paste a link → process → tracklist with agreement badges (`4/4`, red `1/1`, `ID`)
- [ ] Library of processed sets, reopened from disk at zero quota cost

**Gate:** demo.

---

## M4 — Library matching (the part the original tool could not do) — DONE

- [x] Match every parsed track against the library using the parser's own soft comparison
- [x] No schema change and no SQL: the app already loads all tracks into memory
- [x] Mark each row as owned or missing

**Gate passed**, and the demo found two real bugs, both fixed with tests: a narration comment
parsed as tracks, and a one-word title claiming an unrelated file. See PROGRESS.md 2026-09-07/08.

---

## M5 — Listening, and the rest of the tool — IN PROGRESS

**M0's conclusion was wrong and is superseded.** It rejected an embedded player after
measuring from a `127.0.0.1` origin; YouTube rejects that origin specifically (error 150) and
accepts `localhost`. The sets were never the problem. Full account in PROGRESS.md 2026-09-08.

### Done

- [x] In-window player: a second webview (Tauri `unstable` feature) over a fixed band at the
      top, showing a page served by our own Axum server at `http://localhost:<port>/yt-player`,
      which gives the iframe the Referer it needs
- [x] Seeking without reloading: `/yt-seek` is polled by the player page, so a cue click moves
      the player in place
- [x] Collapse into a bar: the video shrinks to 128×72 and keeps playing, with prev/next
      through the set and a button back to the big picture
- [x] The set library, saved tracks with store links, and a copy-list button (migration 009)
- [x] The set as a block strip, red where the IDs are, clickable

### Open

- [ ] **Playback does not start by itself** — the first click has to happen inside the panel's
      own webview. Two candidate fixes are written up in PROGRESS.md 2026-09-08
- [ ] Quota bar with a countdown to the Pacific reset
- [ ] Search by DJ name (100 units), channel import, followed channels with a new-set badge
- [ ] Search across all stored sets, and statistics
