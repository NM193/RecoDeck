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

- [x] Playback starts with one click on an overlay inside the panel. The engine allows
      unattended playback and the video does start — muted; what YouTube will not do without a
      gesture is unmute, and the user's click lands in a different webview. Measured, not assumed
- [x] Search across all stored sets, and statistics, off a flattened tracks table (migration 010)
- [x] Search by DJ name (100 units, and the button says so), channel import, followed channels
      with a new-set badge, promo clips filtered by duration before anything is fetched
- [x] The library filed by DJ — the channel is the host, the DJ is in the title
- [x] Quota with a countdown to the Pacific reset, in Settings and in Stats

**The port is complete**, and goes past the original in three places: matching against the
user's own library, playing their files from a set, and refusing the narration comment the
standalone tool still accepts.


---

## M6 — Automatic checking for new sets (next session)

Asked for on 2026-09-08: set an interval per followed channel — daily or weekly — and have the
app check on its own and say when a new set turns up.

Everything it builds on already exists: `check_youtube_channels` does the work, `yt_channels`
holds `last_checked` and `last_seen_video`, and the Following tab already shows a badge.

- [ ] Migration 011: `check_interval_hours` on `yt_channels`. 0 means never, 24 daily,
      168 weekly. Default 0 — nothing starts spending quota because it was installed
- [ ] A background task started with the app: wake periodically, check only channels whose
      `last_checked` is older than their interval, and write `last_checked` whether or not
      anything new turned up
- [ ] Emit a Tauri event with what was found; the frontend shows it through the existing
      `Notification` component and the badge already on the Following tab
- [ ] Per-channel interval selector in the Following tab
- [ ] Tests: the due-or-not decision is a pure function of (interval, last_checked, now) and
      should be tested as one, including the case of a channel checked manually a minute ago

**Costs**, since that is what governs every decision in this feature: a check is 1-2 units per
channel. Ten channels daily is roughly 20 units against a 10,000 allowance. The interval must
be honoured off `last_checked`, so a manual check counts and the automatic one does not repeat
it.

**Watch out for:** the quota day rolls over at midnight Pacific, not local (see
`external/youtube_time.rs`), and a check that fails must not update `last_checked`, or a
channel that is temporarily unreachable would be silently skipped for a day.
