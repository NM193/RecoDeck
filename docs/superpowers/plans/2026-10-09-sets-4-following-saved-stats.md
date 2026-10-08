# Sets S4: Following, Saved Tracks and Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last three tabs of Sets, as the spec draws them. **Following**: one box — "Follow a channel, or watch a DJ by name" (a link or @handle follows the channel; a name asks: watch as a DJ, or search for a channel anyway · 100 units) — over **DJs you watch** (Search all now · N×100 units; each row: photo, name → DJ page, when checked, how often, fetch automatically, **Check now · 100 units**, opens to everything found, unwatch) and **Channels you follow** (Check all · 1–2 units each; each row: name, @handle, when checked, how often, **Check now · 1–2 units**, opens to recent uploads, unfollow; this session's news under it until opened or dismissed). **Saved tracks**: rows in the set page's style, the set's title opening the set at the cue. **Stats**: four cards in Home's quiet style.

**Architecture:**
- **Rust** (`commands/youtube.rs`): what a check covers is one pure function, `covered(items, CheckScope, now)` over a `Checkable` trait for channels and DJs — `All` (the buttons), `Due` (the timer), `One(key)` (a row) — tested as `is_due` is; `run_channel_check` / `run_dj_check` take the scope; new commands `check_youtube_channel(channel_id)` and `check_youtube_dj(name_key)`; a row's check that cannot reach YouTube answers the error.
- **Store** (tested), `src/store/channelNewsStore.ts`: `useChannelNews` — the channels' news of the session by channel (and each channel's newest upload, for Dismiss), fed by App's `yt-new-sets` listener and Following's checks, and which of Following's checks is running; a DJ's finds are not kept (they are stored and show on the library).
- **Pure TypeScript** (tested): `src/lib/sets/following.ts` (when last checked; what a check found, for its toast); `savedList` in `src/lib/sets/setPage.ts` (Copy list).
- **Components**, `src/components/sets/`: `SetsFollowing.tsx` (the box, the two lists, their checks; it calls the API, its busy state in the store so it outlives the tab), `SetsSaved.tsx`, `SetsStats.tsx`, `SetsTabs.css`. `SetsView` renders them and loses Following's state and handlers, keeping `importUpload` (an upload opens on its page).

**Tech Stack:** Rust (tokio, rusqlite), React 19, TypeScript, zustand, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` — "Saved tracks", "Following", "Stats", "Testing" (the check's scope as a pure function). Plan order: (1) the player ✓, (2) the set page ✓, (3) the library and the box ✓, **(4) this plan** — the last of Sets.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 8 writes them into the spec):
- **A row's Check now** runs whatever the row's interval says — Never included — because someone asked; the timer still checks only what is due.
- **The rows** keep a second line for their settings: "checks" with the shared `SelectMenu` (Never / Daily / Weekly), and for a DJ the settings' `ToggleSwitch` "fetch new sets automatically" (its styles are in `SettingsView.css`, which App always loads). The photo is `get_known_djs`'s (read-only, no profile is made), else the initials on the DJ's hue, as Search and Home draw them. ✕ unwatches or unfollows without asking, as today (unwatching takes the DJ's finds with it, as today).
- **Opening a row** (▾): a DJ's — everything found so far (`listYouTubeDjFinds`, free), with today's note when empty ("Not searched yet — set how often, or press Check now"); a channel's — its recent long uploads (1–2 units, as today). One row is open at a time. An upload in the library opens free; else "get it · 5–7 units" fetches, stores and opens it (on its page), moving a channel's last-seen marker as today.
- **A channel's news** shows under its row ("2 new sets", Dismiss); Dismiss marks the channel seen up to its newest upload (`markYouTubeChannelSeen`), as today. Opening one takes it out of the news.
- **What a check found** is said in a toast — "2 new sets from Traumer — see Library", "Nothing new from Traumer", "3 new sets on 2 channels", "Nothing new on your channels" — the DJ's finds being on the library's New from DJs you watch. Search all refuses with a warning toast when the quota is short, as today; so does a DJ's Check now. Failures are error toasts (the box's error line is the library's).
- **Following's checks keep their own busy state**, so the library box no longer reads "Reading…" while they run (an S3 note). It lives in `useChannelNews`, so leaving the tab during a check and coming back keeps the buttons disabled.
- **A row's check that cannot reach YouTube** says the error, not "Nothing new"; Search all and Check all still skip what failed, as today.
- **The badge** counts only channels still followed; ✕ on a channel clears its news. Dismiss moves the marker to the newest upload the news has seen, even with the row closed. "get it" leaves the news alone when the fetch fails. Watching a DJ already watched, or following a channel already followed, says so and spends nothing; "Search for a channel anyway" refuses with a warning under 100 units left.
- **App's notification** for a background check's finds says where they are: Sets › Library (DJs' finds), Sets › Following (channels').
- **Today's explanatory paragraphs** (what a check costs, why a DJ is not a channel) become one line under the box; the costs stay on every button.
- **Saved tracks**: the cue; the track over its set's title, a button that opens the set playing from the cue; the store links on hover and while the row holds the keyboard; ♥ removes it. Copy list writes "Artist - Title (Mix)" lines (now with the mix) and says how many.
- **Stats**: the summary line, then four cards two to a row (one under a 900px window): Most played, Doing the rounds, Most gaps (a row opens its set), Quota (spent today, left of the day's units, resets in).
- **Dead CSS**: the rules only the old Following, Saved and Stats used go from `SetsView.css`.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `dac8474`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc`, each task's tests and `cargo test` pass at every task's end.
- **Builds and tests:**
  - `cargo test --lib`: 2 new (461); `cargo build` shows no warning.
  - `vitest`: 11 new. The repo counts 649 after it: 648 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes.
- **In WebKit** (the S3 test page with two watched DJs — one with a photo, one fetching automatically — two followed channels, two saved tracks, Stats, and each check mocked), at 1280 and at 1100 in the light Dawn theme:
  - Following: "DJs you watch · Search all now · 200 units", "Channels you follow · Check all · 1–2 units each"; Traumer with his photo, "checked Oct 2"; Solomun's initials, "never checked"; Cercle "@cercle · checked 00:35";
  - "Adam Port" in the box: "looks like a name, not a channel" with both choices; Watch as a DJ watches him; "@mixmag" resolves and follows;
  - Traumer's Check now: `check_youtube_dj traumer`, "2 new sets from Traumer — see Library"; Cercle's: "2 new sets" with Dismiss under the row, the Following badge 2; "get it" fetches, opens the set page and marks Cercle seen up to it; back: "1 new set", badge 1; Dismiss: seen up to the newest, the news and the badge gone;
  - ▾ on Traumer: his two finds ("in your library", "get it · 5–7 units"); ▾ on Boiler Room: its uploads;
  - the interval set to Daily and the switch on: `set_youtube_dj_interval 24`, `set_youtube_dj_auto_import true`; ✕ unwatches Solomun;
  - Saved tracks: "17:00 · Raw Instinct — De La Bass (Mousse T House Mix) · Marco Carola b2b Luciano …"; the set's title opens the set at 51:00; Copy list: "Copied 2 tracks"; ♥ removes one;
  - Stats: "16 sets · 412 named tracks · 37 still unidentified", the four cards; Most gaps' row opens its set;
  - the review's cases: leaving the tab during a slow Search all and coming back — the button still "Searching…", disabled, one `check_youtube_djs`; a failing "get it" — Cercle's "2 new sets" and the badge 2 stay; ✕ on Cercle with news — the badge gone; ▾ on Boiler Room (slow) then ▾ on Traumer — only Traumer open when the uploads arrive; ▾ open then closed before they arrive — nothing open; "Traumer" again → "Already watching Traumer", "@cercle" again → "Already following Cercle", neither spending;
  - S3's scenario still passes on this copy.

**Reviewed:** an independent review of the first version (committed as `ecc1d14`) found one blocker and a set of smaller faults, all fixed in the blocks below and checked above:
- **Blocker — a second spend.** Following kept which check was running in its own state, so leaving the tab during a check and coming back enabled the buttons again: a second Search all spent another 100 units per DJ. The busy key now lives in `useChannelNews`.
- **A row's check that failed said "Nothing new".** `run_dj_check` / `run_channel_check` with `One(key)` now answer the error when nothing was checked (a channel with no uploads list says so).
- **The badge** counted channels already unfollowed → it counts only followed ones, and ✕ clears a channel's news. **Dismiss** with the row closed had no upload to mark → the store keeps each channel's newest upload. **"get it"** dropped the news before the fetch, which could fail → the news goes only once it opened (`importUpload` answers whether it did).
- **A late ▾ answer** reopened a row closed meanwhile, or closed the row opened since → a claim drops it. The empty note is worked out at render. The ▾ rows are disabled during a check, ✕ only for its own row. A settings change to the same value spends no call.
- **Watching or following twice**, and **Search for a channel anyway** under 100 units left, now say so instead of calling. The Stats card showed the quota of when Stats was read → the live quota. App's notification said "Sets" for every background find → where they are.
- **Small:** the box's button matched the input's height; a channel row's second line lines up with its name (no photo); the switch's label is clickable; the buttons' accessible names say the cost.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/commands/youtube.rs`, `src-tauri/src/lib.rs` | modify | `CheckScope`, `covered`, the two commands (registered), tests |
| `src/lib/tauri-api.ts` | modify | the two calls |
| `src/store/channelNewsStore.ts` (+ test) | create | the channels' news of the session |
| `src/lib/sets/following.ts` (+ test) | create | when checked; what a check found |
| `src/lib/sets/setPage.ts` (+ test) | modify | `savedList` |
| `src/components/sets/SetsFollowing.tsx`, `SetsSaved.tsx`, `SetsStats.tsx`, `SetsTabs.css` | create | the three tabs |
| `src/components/views/SetsView.tsx`, `SetsView.css` | modify | renders them; Following's old state and handlers go; dead rules go |
| `src/App.tsx` | modify | its `yt-new-sets` listener keeps the channels' news |
| `docs/superpowers/specs/2026-10-04-sets-redesign-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `dac8474`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 637 passed (638)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`;
  - `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: `459 passed`.

---

### Task 1: What a check covers, and a row's check

**Files:** Modify `src-tauri/src/commands/youtube.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1:** The scope, `covered` and its tests; the checks take a scope; the two commands.

In `src-tauri/src/commands/youtube.rs`, replace

```rust
    match last_checked.and_then(youtube_time::unix_from_iso) {
        Some(then) => now.saturating_sub(then) >= interval_hours * 3_600,
        None => true,
    }
}

/// The body of a check, shared by the button and by the automatic run.
///
/// `due_only` is what separates them: the button checks everything the user is
/// following, the timer only what its own interval says is due.
///
/// `last_checked` is written per channel, and only when the channel was
/// actually reached. A channel that is temporarily unreachable stays due, or a
/// network blip would silently skip it for a whole day.
async fn run_channel_check(
    state: &AppState,
    due_only: bool,
    now: i64,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let channels = with_db(state, |db| {
        db.list_yt_channels()
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))
    })?;

    let channels: Vec<YtChannel> = if due_only {
        channels
            .into_iter()
            .filter(|c| is_due(c.check_interval_hours, c.last_checked.as_deref(), now))
            .collect()
    } else {
        channels
    };

    if channels.is_empty() {
        return Ok(Vec::new());
    }

    let stored: Vec<String> = with_db(state, |db| {
```

with

```rust
    match last_checked.and_then(youtube_time::unix_from_iso) {
        Some(then) => now.saturating_sub(then) >= interval_hours * 3_600,
        None => true,
    }
}

/// What a check covers: everything followed or watched (the check-all
/// buttons), only what its own interval says is due (the timer), or one
/// channel or DJ (a row's Check now).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CheckScope<'a> {
    All,
    Due,
    One(&'a str),
}

/// A followed channel or a watched DJ, as a check sees it.
pub(crate) trait Checkable {
    /// The channel id, or the DJ's name key.
    fn key(&self) -> &str;
    fn interval_hours(&self) -> i64;
    fn last_checked(&self) -> Option<&str>;
}

impl Checkable for YtChannel {
    fn key(&self) -> &str {
        &self.channel_id
    }
    fn interval_hours(&self) -> i64 {
        self.check_interval_hours
    }
    fn last_checked(&self) -> Option<&str> {
        self.last_checked.as_deref()
    }
}

impl Checkable for YtWatchedDj {
    fn key(&self) -> &str {
        &self.name_key
    }
    fn interval_hours(&self) -> i64 {
        self.check_interval_hours
    }
    fn last_checked(&self) -> Option<&str> {
        self.last_checked.as_deref()
    }
}

/// The items a check covers, in their order. Pure, as `is_due` is: the scope
/// is the one thing that separates the buttons, the timer and a row. A row's
/// check runs whatever the interval says — Never included — because someone
/// asked for it.
pub(crate) fn covered<T: Checkable>(items: Vec<T>, scope: CheckScope, now: i64) -> Vec<T> {
    match scope {
        CheckScope::All => items,
        CheckScope::Due => items
            .into_iter()
            .filter(|item| is_due(item.interval_hours(), item.last_checked(), now))
            .collect(),
        CheckScope::One(key) => items.into_iter().filter(|item| item.key() == key).collect(),
    }
}

/// The body of a check, shared by the buttons, a row and the automatic run.
///
/// `scope` is what separates them: a button checks everything the user is
/// following, a row one channel, the timer only what its interval says is due.
///
/// `last_checked` is written per channel, and only when the channel was
/// actually reached. A channel that is temporarily unreachable stays due, or a
/// network blip would silently skip it for a whole day.
async fn run_channel_check(
    state: &AppState,
    scope: CheckScope<'_>,
    now: i64,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let channels = with_db(state, |db| {
        db.list_yt_channels()
            .map_err(|e| AppError::Database(format!("Failed to list channels: {e}")))
    })?;

    let channels = covered(channels, scope, now);

    if channels.is_empty() {
        return Ok(Vec::new());
    }

    let stored: Vec<String> = with_db(state, |db| {
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();

    for channel in channels {
        let Some(uploads_id) = channel.uploads_id.clone() else {
            continue;
        };

        let mut items = match youtube::channel_uploads(&key, &uploads_id, 10, &mut spent).await {
            Ok(items) => items,
            // One unreachable channel must not sink the whole check.
            Err(_) => continue,
        };

        // Reached, so the interval starts again from here — whether or not
        // anything new turned up.
        checked.push(channel.channel_id.clone());
```

with

```rust
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();
    // What stopped the last channel that could not be reached: a row's check
    // of that one channel says so rather than "nothing new".
    let mut unreached: Option<AppError> = None;

    for channel in channels {
        let Some(uploads_id) = channel.uploads_id.clone() else {
            unreached = Some(AppError::Validation(
                "This channel has no uploads list to check".to_string(),
            ));
            continue;
        };

        let mut items = match youtube::channel_uploads(&key, &uploads_id, 10, &mut spent).await {
            Ok(items) => items,
            // One unreachable channel must not sink the whole check.
            Err(e) => {
                unreached = Some(e);
                continue;
            }
        };

        // Reached, so the interval starts again from here — whether or not
        // anything new turned up.
        checked.push(channel.channel_id.clone());
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
                let _ = db.touch_yt_channel_checked(channel_id, &stamp);
            }
            Ok(())
        });
    }

    Ok(news)
}

/// Checks every followed channel for sets that were not there last time.
/// One to two units per channel.
#[tauri::command]
pub async fn check_youtube_channels(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_channel_check(&state, false, now_unix()).await
}

/// How often a channel is checked on its own. 0 never, 24 daily, 168 weekly.
#[tauri::command]
pub async fn set_youtube_channel_interval(
    state: State<'_, AppState>,
```

with

```rust
                let _ = db.touch_yt_channel_checked(channel_id, &stamp);
            }
            Ok(())
        });
    }

    if let (CheckScope::One(_), true, Some(error)) = (scope, checked.is_empty(), unreached) {
        return Err(error);
    }

    Ok(news)
}

/// Checks every followed channel for sets that were not there last time.
/// One to two units per channel.
#[tauri::command]
pub async fn check_youtube_channels(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_channel_check(&state, CheckScope::All, now_unix()).await
}

/// Checks one followed channel: a row's Check now. One to two units.
#[tauri::command]
pub async fn check_youtube_channel(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_channel_check(&state, CheckScope::One(&channel_id), now_unix()).await
}

/// How often a channel is checked on its own. 0 never, 24 daily, 168 weekly.
#[tauri::command]
pub async fn set_youtube_channel_interval(
    state: State<'_, AppState>,
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
) -> Vec<YtWatchedDj> {
    let spendable = remaining_quota.saturating_sub(reserve);
    let affordable = (spendable / youtube::unit_cost("search")) as usize;
    due.into_iter().take(affordable).collect()
}

/// The body of a DJ check, shared by the button and by the automatic run.
///
/// `budget` caps how much the run may spend. The button passes `None` — a
/// person asking is allowed to spend what they have.
async fn run_dj_check(
    state: &AppState,
    due_only: bool,
    now: i64,
    budget: Option<u32>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let djs = with_db(state, |db| {
        db.list_yt_watched_djs()
            .map_err(|e| AppError::Database(format!("Failed to list watched DJs: {e}")))
    })?;

    let mut djs: Vec<YtWatchedDj> = if due_only {
        djs.into_iter()
            .filter(|d| is_due(d.check_interval_hours, d.last_checked.as_deref(), now))
            .collect()
    } else {
        djs
    };

    if let Some(remaining) = budget {
        djs = djs_within_budget(djs, remaining, AUTOMATIC_QUOTA_RESERVE);
    }

    if djs.is_empty() {
```

with

```rust
) -> Vec<YtWatchedDj> {
    let spendable = remaining_quota.saturating_sub(reserve);
    let affordable = (spendable / youtube::unit_cost("search")) as usize;
    due.into_iter().take(affordable).collect()
}

/// The body of a DJ check, shared by the buttons, a row and the automatic run.
///
/// `budget` caps how much the run may spend. The buttons pass `None` — a
/// person asking is allowed to spend what they have.
async fn run_dj_check(
    state: &AppState,
    scope: CheckScope<'_>,
    now: i64,
    budget: Option<u32>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    let key = read_key(state)?;

    let djs = with_db(state, |db| {
        db.list_yt_watched_djs()
            .map_err(|e| AppError::Database(format!("Failed to list watched DJs: {e}")))
    })?;

    let mut djs = covered(djs, scope, now);

    if let Some(remaining) = budget {
        djs = djs_within_budget(djs, remaining, AUTOMATIC_QUOTA_RESERVE);
    }

    if djs.is_empty() {
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();

    for dj in djs {
        // A DJ watched for the first time looks back a month, not forever; after
        // that the window reaches a little behind the last check.
        let since = dj
            .last_checked
```

with

```rust
            .map_err(|e| AppError::Database(format!("Failed to read the library: {e}")))
    })?;

    let mut news = Vec::new();
    let mut spent = 0u32;
    let mut checked: Vec<String> = Vec::new();
    // What stopped the last search that failed: a row's search for that one
    // DJ says so rather than "nothing new".
    let mut unreached: Option<AppError> = None;

    for dj in djs {
        // A DJ watched for the first time looks back a month, not forever; after
        // that the window reaches a little behind the last check.
        let since = dj
            .last_checked
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
        )
        .await
        {
            Ok(hits) => hits,
            // One failed search must not sink the rest, and must not count as
            // a check — 100 units is too much to silently waste a day over.
            Err(_) => continue,
        };

        checked.push(dj.name_key.clone());

        // A set that does not name them in its title is somebody talking about
        // them, not a set of theirs.
```

with

```rust
        )
        .await
        {
            Ok(hits) => hits,
            // One failed search must not sink the rest, and must not count as
            // a check — 100 units is too much to silently waste a day over.
            Err(e) => {
                unreached = Some(e);
                continue;
            }
        };

        checked.push(dj.name_key.clone());

        // A set that does not name them in its title is somebody talking about
        // them, not a set of theirs.
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
                let _ = db.touch_yt_dj_checked(name_key, &stamp);
            }
            Ok(())
        });
    }

    Ok(news)
}

/// Searches for every watched DJ. 100 units each, and the button says so.
#[tauri::command]
pub async fn check_youtube_djs(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_dj_check(&state, false, now_unix(), None).await
}

// --- automatic checking ------------------------------------------------
//
// The timer is deliberately dumb: it wakes on a fixed tick and asks the pure
// `is_due` rule which channels have waited long enough. Nothing is scheduled
```

with

```rust
                let _ = db.touch_yt_dj_checked(name_key, &stamp);
            }
            Ok(())
        });
    }

    if let (CheckScope::One(_), true, Some(error)) = (scope, checked.is_empty(), unreached) {
        return Err(error);
    }

    Ok(news)
}

/// Searches for every watched DJ. 100 units each, and the button says so.
#[tauri::command]
pub async fn check_youtube_djs(
    state: State<'_, AppState>,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_dj_check(&state, CheckScope::All, now_unix(), None).await
}

/// Searches for one watched DJ: a row's Check now. 100 units.
#[tauri::command]
pub async fn check_youtube_dj(
    state: State<'_, AppState>,
    name_key: String,
) -> Result<Vec<ChannelNewsDTO>, AppError> {
    run_dj_check(&state, CheckScope::One(&name_key), now_unix(), None).await
}

// --- automatic checking ------------------------------------------------
//
// The timer is deliberately dumb: it wakes on a fixed tick and asks the pure
// `is_due` rule which channels have waited long enough. Nothing is scheduled
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
        tokio::time::sleep(std::time::Duration::from_secs(WATCH_FIRST_TICK_SECS)).await;

        loop {
            let state = app.state::<AppState>();
            let now = now_unix();

            let mut news = run_channel_check(&state, true, now).await.unwrap_or_default();

            // Only what is left after the channel checks may go on searches,
            // and only down to the reserve.
            let remaining = get_quota(&state).map(|q| q.remaining).unwrap_or(0);
            if let Ok(dj_news) = run_dj_check(&state, true, now, Some(remaining)).await {
                news.extend(dj_news);
            }

            if !news.is_empty() {
                let _ = app.emit(NEW_SETS_EVENT, &news);
            }
```

with

```rust
        tokio::time::sleep(std::time::Duration::from_secs(WATCH_FIRST_TICK_SECS)).await;

        loop {
            let state = app.state::<AppState>();
            let now = now_unix();

            let mut news = run_channel_check(&state, CheckScope::Due, now).await.unwrap_or_default();

            // Only what is left after the channel checks may go on searches,
            // and only down to the reserve.
            let remaining = get_quota(&state).map(|q| q.remaining).unwrap_or(0);
            if let Ok(dj_news) = run_dj_check(&state, CheckScope::Due, now, Some(remaining)).await {
                news.extend(dj_news);
            }

            if !news.is_empty() {
                let _ = app.emit(NEW_SETS_EVENT, &news);
            }
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
        // Doing the work again costs a unit. Skipping a channel forever does not
        // announce itself, so the cheap mistake is the one to make.
        assert!(is_due(24, Some("whenever"), DAY_ONE));
        assert!(is_due(24, Some(""), DAY_ONE));
    }

    #[test]
    fn a_clock_that_went_backwards_does_not_make_everything_due() {
        // saturating_sub, not a negative that would compare as "not yet".
        assert!(!is_due(24, Some(DAY_ONE_ISO), DAY_ONE - 3_600));
    }
```

with

```rust
        // Doing the work again costs a unit. Skipping a channel forever does not
        // announce itself, so the cheap mistake is the one to make.
        assert!(is_due(24, Some("whenever"), DAY_ONE));
        assert!(is_due(24, Some(""), DAY_ONE));
    }

    fn dj(name_key: &str, interval: i64, last_checked: Option<&str>) -> YtWatchedDj {
        YtWatchedDj {
            name_key: name_key.into(),
            display_name: name_key.into(),
            check_interval_hours: interval,
            last_checked: last_checked.map(String::from),
            auto_import: false,
        }
    }

    fn channel(channel_id: &str, interval: i64, last_checked: Option<&str>) -> YtChannel {
        YtChannel {
            channel_id: channel_id.into(),
            handle: None,
            title: None,
            uploads_id: None,
            last_checked: last_checked.map(String::from),
            last_seen_video: None,
            check_interval_hours: interval,
        }
    }

    fn keys<T: Checkable>(items: &[T]) -> Vec<&str> {
        items.iter().map(Checkable::key).collect()
    }

    #[test]
    fn a_check_covers_everything_only_what_is_due_or_one() {
        let djs = || {
            vec![
                dj("solomun", 0, None),
                dj("traumer", 24, Some(DAY_ONE_ISO)),
                dj("hot since 82", 168, None),
            ]
        };
        assert_eq!(keys(&covered(djs(), CheckScope::All, DAY_TWO)), vec!["solomun", "traumer", "hot since 82"]);
        // Never is never due; daily a day later is; never checked is at once.
        assert_eq!(keys(&covered(djs(), CheckScope::Due, DAY_TWO)), vec!["traumer", "hot since 82"]);
        assert_eq!(keys(&covered(djs(), CheckScope::Due, DAY_ONE + 60)), vec!["hot since 82"]);
        // A row asked for: whatever its interval says, Never included.
        assert_eq!(keys(&covered(djs(), CheckScope::One("solomun"), DAY_ONE)), vec!["solomun"]);
        assert!(covered(djs(), CheckScope::One("nobody"), DAY_ONE).is_empty());
    }

    #[test]
    fn a_channel_check_covers_the_same_way() {
        let channels = vec![channel("UC1", 24, Some(DAY_ONE_ISO)), channel("UC2", 0, None)];
        assert_eq!(keys(&covered(channels.clone(), CheckScope::Due, DAY_ONE + 3_600)), Vec::<&str>::new());
        assert_eq!(keys(&covered(channels.clone(), CheckScope::One("UC2"), DAY_ONE)), vec!["UC2"]);
        assert_eq!(keys(&covered(channels, CheckScope::All, DAY_ONE)), vec!["UC1", "UC2"]);
    }

    #[test]
    fn a_clock_that_went_backwards_does_not_make_everything_due() {
        // saturating_sub, not a negative that would compare as "not yet".
        assert!(!is_due(24, Some(DAY_ONE_ISO), DAY_ONE - 3_600));
    }
```

- [ ] **Step 2: Register them**

In `src-tauri/src/lib.rs`, replace

```rust
            commands::youtube::resolve_youtube_channel,
            commands::youtube::list_youtube_channel_uploads,
            commands::youtube::follow_youtube_channel,
            commands::youtube::list_youtube_channels,
            commands::youtube::unfollow_youtube_channel,
            commands::youtube::check_youtube_channels,
            commands::youtube::set_youtube_channel_interval,
            commands::youtube::watch_youtube_dj,
            commands::youtube::list_youtube_djs,
            commands::youtube::unwatch_youtube_dj,
            commands::youtube::set_youtube_dj_interval,
            commands::youtube::set_youtube_dj_auto_import,
            commands::youtube::check_youtube_djs,
            commands::youtube::list_youtube_dj_finds,
            commands::youtube::mark_youtube_channel_seen,
            // Spotify
            commands::spotify::get_spotify_status,
            commands::spotify::set_spotify_client_id,
            commands::spotify::connect_spotify,
```

with

```rust
            commands::youtube::resolve_youtube_channel,
            commands::youtube::list_youtube_channel_uploads,
            commands::youtube::follow_youtube_channel,
            commands::youtube::list_youtube_channels,
            commands::youtube::unfollow_youtube_channel,
            commands::youtube::check_youtube_channels,
            commands::youtube::check_youtube_channel,
            commands::youtube::set_youtube_channel_interval,
            commands::youtube::watch_youtube_dj,
            commands::youtube::list_youtube_djs,
            commands::youtube::unwatch_youtube_dj,
            commands::youtube::set_youtube_dj_interval,
            commands::youtube::set_youtube_dj_auto_import,
            commands::youtube::check_youtube_djs,
            commands::youtube::check_youtube_dj,
            commands::youtube::list_youtube_dj_finds,
            commands::youtube::mark_youtube_channel_seen,
            // Spotify
            commands::spotify::get_spotify_status,
            commands::spotify::set_spotify_client_id,
            commands::spotify::connect_spotify,
```

- [ ] **Step 3:** `cd src-tauri && cargo test --lib`: PASS, 461 (`a_check_covers_everything_only_what_is_due_or_one`, `a_channel_check_covers_the_same_way`); `cargo build` shows no warning. Commit:

```bash
git add src-tauri/src/commands/youtube.rs src-tauri/src/lib.rs
git commit -m "feat(sets): check one channel or one DJ — what a check covers as a pure function"
```

---

### Task 2: The calls and the channels' news

**Files:** Modify `src/lib/tauri-api.ts`; create `src/store/channelNewsStore.ts`, `src/store/channelNewsStore.test.ts`.

- [ ] **Step 1: The two calls**

In `src/lib/tauri-api.ts`, replace

```ts
  },

  async checkYouTubeChannels(): Promise<ChannelNews[]> {
    return await invoke('check_youtube_channels')
  },

  /** How often a channel is checked on its own. 0 never, 24 daily, 168 weekly. */
  async setYouTubeChannelInterval(channelId: string, hours: number): Promise<void> {
    return await invoke('set_youtube_channel_interval', { channelId, hours })
  },

  // Watched DJs. A DJ is searched for, not listed, so each check costs 100.
```

with

```ts
  },

  async checkYouTubeChannels(): Promise<ChannelNews[]> {
    return await invoke('check_youtube_channels')
  },

  /** One followed channel's new uploads: a row's Check now (1–2 units). */
  async checkYouTubeChannel(channelId: string): Promise<ChannelNews[]> {
    return await invoke('check_youtube_channel', { channelId })
  },

  /** How often a channel is checked on its own. 0 never, 24 daily, 168 weekly. */
  async setYouTubeChannelInterval(channelId: string, hours: number): Promise<void> {
    return await invoke('set_youtube_channel_interval', { channelId, hours })
  },

  // Watched DJs. A DJ is searched for, not listed, so each check costs 100.
```

In `src/lib/tauri-api.ts`, replace

```ts

  /** Searches for every watched DJ — 100 units each. */
  async checkYouTubeDjs(): Promise<ChannelNews[]> {
    return await invoke('check_youtube_djs')
  },

  /** Everything a DJ's searches have turned up so far. Costs nothing. */
  async listYouTubeDjFinds(nameKey: string): Promise<ChannelUpload[]> {
    return await invoke('list_youtube_dj_finds', { nameKey })
  },

  async markYouTubeChannelSeen(channelId: string, videoId: string): Promise<void> {
```

with

```ts

  /** Searches for every watched DJ — 100 units each. */
  async checkYouTubeDjs(): Promise<ChannelNews[]> {
    return await invoke('check_youtube_djs')
  },

  /** One watched DJ searched for: a row's Check now (100 units). */
  async checkYouTubeDj(nameKey: string): Promise<ChannelNews[]> {
    return await invoke('check_youtube_dj', { nameKey })
  },

  /** Everything a DJ's searches have turned up so far. Costs nothing. */
  async listYouTubeDjFinds(nameKey: string): Promise<ChannelUpload[]> {
    return await invoke('list_youtube_dj_finds', { nameKey })
  },

  async markYouTubeChannelSeen(channelId: string, videoId: string): Promise<void> {
```

- [ ] **Step 2: The failing test**

Create `src/store/channelNewsStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { channelNewsCount, useChannelNews } from './channelNewsStore'
import type { ChannelNews, ChannelUpload } from '../types/youtube'

const upload = (video_id: string, published_at = '2026-10-01T00:00:00Z'): ChannelUpload => ({ video_id, title: video_id, published_at, already_stored: false })
const news = (channel_id: string, source: 'channel' | 'dj', ids: string[]): ChannelNews => ({
  channel_id,
  title: channel_id,
  source,
  auto_import: false,
  new_sets: ids.map(upload),
})

beforeEach(() => useChannelNews.setState({ byChannel: {}, newest: {}, busy: null }))

describe('the channels’ news', () => {
  it('keeps a channel’s news, not a DJ’s, and counts it', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('dj:traumer', 'dj', ['c'])])
    expect(Object.keys(useChannelNews.getState().byChannel)).toEqual(['UC1'])
    expect(channelNewsCount(useChannelNews.getState().byChannel)).toBe(2)
  })

  it('adds a later check’s uploads first, each video once', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b'])])
    useChannelNews.getState().add([news('UC1', 'channel', ['c', 'a'])])
    expect(useChannelNews.getState().byChannel.UC1.map((u) => u.video_id)).toEqual(['c', 'a', 'b'])
  })

  it('lets go of an upload once opened, and of a channel’s news once dismissed', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('UC2', 'channel', ['c'])])
    useChannelNews.getState().take('UC1', 'a')
    expect(useChannelNews.getState().byChannel.UC1.map((u) => u.video_id)).toEqual(['b'])
    useChannelNews.getState().take('UC1', 'b')
    expect(useChannelNews.getState().byChannel.UC1).toBeUndefined()
    useChannelNews.getState().dismiss('UC2')
    expect(channelNewsCount(useChannelNews.getState().byChannel)).toBe(0)
  })

  it('counts only the channels still followed', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('UC2', 'channel', ['c'])])
    expect(channelNewsCount(useChannelNews.getState().byChannel, new Set(['UC2']))).toBe(1)
  })

  it('remembers the newest upload, so Dismiss never marks an older one seen', () => {
    const late = { ...news('UC1', 'channel', []), new_sets: [upload('old', '2026-09-01T00:00:00Z'), upload('new', '2026-10-05T00:00:00Z')] }
    useChannelNews.getState().add([late])
    useChannelNews.getState().take('UC1', 'new')
    expect(useChannelNews.getState().newest.UC1.video_id).toBe('new')
    useChannelNews.getState().dismiss('UC1')
    expect(useChannelNews.getState().newest.UC1).toBeUndefined()
  })
})
```

Run `npx vitest run src/store/channelNewsStore.test.ts`: FAIL — `./channelNewsStore` does not exist.

- [ ] **Step 3: The store**

Create `src/store/channelNewsStore.ts`:

```ts
// src/store/channelNewsStore.ts
// Following's state that must outlive the tab (Sets redesign spec,
// Following): the channels' news of this session — the new uploads a check
// turned up, under their channel, until each is opened or the channel's
// news is dismissed — and the check or fetch running now. Kept in App's
// reach, not in Sets, so news from a background check (App's `yt-new-sets`
// listener) is there when the toast says "see Sets › Following", it survives
// tab switches, set pages and trips out of Sets, and a check still running
// keeps its buttons disabled when you come back (a second press would spend
// its units again). A DJ's finds are not kept here: they are stored, and show
// on the library's New from DJs you watch.
import { create } from 'zustand'
import type { ChannelNews, ChannelUpload } from '../types/youtube'

interface ChannelNewsState {
  /** By channel id, newest check's uploads first, each video once. */
  byChannel: Record<string, ChannelUpload[]>
  /** By channel id, the newest upload its checks turned up: what Dismiss marks seen. */
  newest: Record<string, ChannelUpload>
  /** What Following is working on: a row's key, an upload's id, 'djs', 'channels', 'follow'. */
  busy: string | null
  /** A check's news: the channels' is kept; a DJ's is not. */
  add: (news: readonly ChannelNews[]) => void
  /** An upload opened or fetched: it is no longer news. */
  take: (channelId: string, videoId: string) => void
  /** Dismissed, or the channel unfollowed: its news goes. */
  dismiss: (channelId: string) => void
  setBusy: (busy: string | null) => void
}

const later = (a: ChannelUpload, b: ChannelUpload) => (a.published_at > b.published_at ? a : b)

export const useChannelNews = create<ChannelNewsState>((set) => ({
  byChannel: {},
  newest: {},
  busy: null,
  add: (news) =>
    set((state) => {
      const byChannel = { ...state.byChannel }
      const newest = { ...state.newest }
      for (const item of news) {
        if (item.source !== 'channel' || item.new_sets.length === 0) continue
        const before = byChannel[item.channel_id] ?? []
        const fresh = item.new_sets.filter((upload) => !before.some((b) => b.video_id === upload.video_id))
        byChannel[item.channel_id] = [...fresh, ...before]
        newest[item.channel_id] = item.new_sets.reduce(later, newest[item.channel_id] ?? item.new_sets[0])
      }
      return { byChannel, newest }
    }),
  take: (channelId, videoId) =>
    set((state) => {
      const left = (state.byChannel[channelId] ?? []).filter((upload) => upload.video_id !== videoId)
      const byChannel = { ...state.byChannel }
      if (left.length > 0) byChannel[channelId] = left
      else delete byChannel[channelId]
      return { byChannel }
    }),
  dismiss: (channelId) =>
    set((state) => {
      const byChannel = { ...state.byChannel }
      const newest = { ...state.newest }
      delete byChannel[channelId]
      delete newest[channelId]
      return { byChannel, newest }
    }),
  setBusy: (busy) => set({ busy }),
}))

/**
 * How many uploads are news: the Following tab's badge. Only the channels
 * still followed count (`followed`, when given).
 */
export function channelNewsCount(
  byChannel: Record<string, ChannelUpload[]>,
  followed?: ReadonlySet<string>,
): number {
  return Object.entries(byChannel).reduce(
    (total, [channelId, uploads]) => (followed && !followed.has(channelId) ? total : total + uploads.length),
    0,
  )
}
```

- [ ] **Step 4:** `npx vitest run src/store/channelNewsStore.test.ts`: PASS, 5. Commit:

```bash
git add src/lib/tauri-api.ts src/store/channelNewsStore.ts src/store/channelNewsStore.test.ts
git commit -m "feat(sets): the calls for one channel or DJ, and the channels' news of the session"
```

---

### Task 3: Following's words, and the saved list

**Files:** Create `src/lib/sets/following.ts`, `src/lib/sets/following.test.ts`; modify `src/lib/sets/setPage.ts`, `src/lib/sets/setPage.test.ts`.

- [ ] **Step 1: The failing tests**

Create `src/lib/sets/following.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { channelCheckMessage, checkedLabel, djCheckMessage, newSetCount } from './following'
import type { ChannelNews } from '../../types/youtube'

const news = (title: string, n: number): ChannelNews => ({
  channel_id: title,
  title,
  source: 'channel',
  auto_import: false,
  new_sets: Array.from({ length: n }, (_, i) => ({ video_id: `${title}${i}`, title: '', published_at: '', already_stored: false })),
})

describe('checkedLabel', () => {
  const now = new Date(2026, 9, 8, 20, 0)

  it('says when it was last checked, in local days', () => {
    expect(checkedLabel(new Date(2026, 9, 8, 9, 5).toISOString(), now)).toBe('checked 09:05')
    expect(checkedLabel(new Date(2026, 9, 7, 23, 0).toISOString(), now)).toBe('checked yesterday')
    expect(checkedLabel(new Date(2026, 9, 2, 12, 0).toISOString(), now)).toBe('checked Oct 2')
  })

  it('says never for nothing, or something it cannot read', () => {
    expect(checkedLabel(undefined, now)).toBe('never checked')
    expect(checkedLabel('whenever', now)).toBe('never checked')
  })
})

describe('what a check found', () => {
  it('counts the new uploads', () => {
    expect(newSetCount([news('a', 2), news('b', 0), news('c', 1)])).toBe(3)
  })

  it('points a DJ search to the library', () => {
    expect(djCheckMessage([news('Traumer', 2)], 'Traumer')).toBe('2 new sets from Traumer — see Library')
    expect(djCheckMessage([], 'Traumer')).toBe('Nothing new from Traumer')
    expect(djCheckMessage([news('a', 1), news('b', 3)], null)).toBe('4 new sets from 2 DJs — see Library')
    expect(djCheckMessage([], null)).toBe('Nothing new from your DJs')
  })

  it('says what a channel check found', () => {
    expect(channelCheckMessage([news('Cercle', 1)], 'Cercle')).toBe('1 new set on Cercle')
    expect(channelCheckMessage([], 'Cercle')).toBe('Nothing new on Cercle')
    expect(channelCheckMessage([news('a', 2), news('b', 1)], null)).toBe('3 new sets on 2 channels')
    expect(channelCheckMessage([], null)).toBe('Nothing new on your channels')
  })
})
```

In `src/lib/sets/setPage.test.ts`, replace

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
```

with

```ts
import { describe, expect, it } from 'vitest'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  savedList,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  trackLine,
} from './setPage'
import type { MatchSummary } from '../tracklist/match'
```

In `src/lib/sets/setPage.test.ts`, replace

```ts

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
```

with

```ts

describe('copying the missing tracks', () => {
  it('writes "Artist - Title (Mix)" per line', () => {
    expect(trackLine(tracks[1])).toBe('Artist 2 - Title 2 (Club Mix)')
    expect(missingTracks(tracks, matches)).toEqual(['Artist 2 - Title 2 (Club Mix)', 'Title 4'])
  })

  it('writes the saved tracks the same way', () => {
    expect(savedList([{ artist: 'Tuccillo', title: 'Imagination Engine' }, { title: 'Bomba', mix: 'Dub' }])).toBe(
      'Tuccillo - Imagination Engine\nBomba (Dub)',
    )
  })
})

describe('labels', () => {
  it('builds the thumbnail address', () => {
    expect(thumbnailUrl('AvoifrdCfFM')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/hqdefault.jpg')
    expect(thumbnailUrl('AvoifrdCfFM', 'mqdefault')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/mqdefault.jpg')
```

Run `npx vitest run src/lib/sets`: FAIL — `./following` does not exist and `savedList` is not exported.

- [ ] **Step 2: The functions**

Create `src/lib/sets/following.ts`:

```ts
// src/lib/sets/following.ts
// The words on Sets' Following tab (Sets redesign spec, Following): when a
// channel or a DJ was last checked, and what a check found, said in a toast.
import { playedLabel } from '../home/labels'
import type { ChannelNews } from '../../types/youtube'

/** "checked 09:05" today, "checked yesterday", "checked Oct 2"; "never checked". */
export function checkedLabel(lastChecked: string | null | undefined, now: Date): string {
  const time = lastChecked ? Date.parse(lastChecked) : NaN
  if (Number.isNaN(time)) return 'never checked'
  return `checked ${playedLabel(time / 1000, now)}`
}

const sets = (n: number) => `${n.toLocaleString('en-US')} new ${n === 1 ? 'set' : 'sets'}`

/** How many new uploads a check's news holds. */
export function newSetCount(news: readonly ChannelNews[]): number {
  return news.reduce((total, item) => total + item.new_sets.length, 0)
}

/**
 * What a DJ search found, for its toast: a DJ's finds land on the library's
 * New from DJs you watch, so the toast points there. `who` is the one DJ
 * searched, or null for all of them.
 */
export function djCheckMessage(news: readonly ChannelNews[], who: string | null): string {
  const found = newSetCount(news)
  if (who) return found === 0 ? `Nothing new from ${who}` : `${sets(found)} from ${who} — see Library`
  if (found === 0) return 'Nothing new from your DJs'
  const djs = news.filter((item) => item.new_sets.length > 0).length
  return `${sets(found)} from ${djs} ${djs === 1 ? 'DJ' : 'DJs'} — see Library`
}

/** What a channel check found, for its toast: the news shows under each channel. */
export function channelCheckMessage(news: readonly ChannelNews[], who: string | null): string {
  const found = newSetCount(news)
  if (who) return found === 0 ? `Nothing new on ${who}` : `${sets(found)} on ${who}`
  if (found === 0) return 'Nothing new on your channels'
  const channels = news.filter((item) => item.new_sets.length > 0).length
  return `${sets(found)} on ${channels} ${channels === 1 ? 'channel' : 'channels'}`
}
```

In `src/lib/sets/setPage.ts`, replace

```ts
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
```

with

```ts
/** "Artist - Title (Mix)": a track as the missing list copies it. */
export function trackLine(track: Pick<Track, 'artist' | 'title' | 'mix'>): string {
  const name = track.artist ? `${track.artist} - ${track.title}` : track.title
  return track.mix ? `${name} (${track.mix})` : name
}

/** Saved tracks as Copy list writes them: "Artist - Title (Mix)", one per line. */
export function savedList(saved: ReadonlyArray<{ artist?: string; title: string; mix?: string }>): string {
  return saved.map((t) => trackLine({ artist: t.artist ?? null, title: t.title, mix: t.mix ?? null })).join('\n')
}

/** The missing tracks, one per line, for ⋯ › Copy missing tracks. */
export function missingTracks(tracks: readonly Track[], matches: MatchSummary | null): string[] {
  return filterRows(tracks, matches, 'missing').map(trackLine)
}

/** A YouTube thumbnail of the video: `hqdefault` for the hero, `mqdefault` for cards. */
```

- [ ] **Step 3:** `npx vitest run src/lib/sets`: PASS, 22. Commit:

```bash
git add src/lib/sets/following.ts src/lib/sets/following.test.ts src/lib/sets/setPage.ts src/lib/sets/setPage.test.ts
git commit -m "feat(sets): when a channel or DJ was checked, what a check found, the saved list"
```

---

### Task 4: The tabs' styles

**Files:** Create `src/components/sets/SetsTabs.css`.

- [ ] **Step 1:**

Create `src/components/sets/SetsTabs.css`:

```css
/* src/components/sets/SetsTabs.css */
/* Sets' Following, Saved tracks and Stats tabs. */

.follow-note {
  margin: 6px 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

/* ---- Following: the box ---- */

.follow-box {
  display: flex;
  gap: 8px;
}

.follow-box__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.follow-box__input:focus {
  border-color: var(--accent);
  outline: none;
}

.follow-box .btn {
  height: 36px;
}

.follow-choice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12.5px;
}

.follow-section {
  margin-top: 22px;
}

/* ---- A DJ or a channel ---- */

.follow-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.follow-row__main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.follow-row__photo {
  position: relative;
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.follow-row__photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.follow-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.follow-row__name {
  overflow: hidden;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}

button.follow-row__name {
  cursor: pointer;
}

button.follow-row__name:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

button.follow-row__name:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.follow-row__meta,
.follow-row__label {
  color: var(--text-muted);
  font-size: 11.5px;
}

.follow-row__icon {
  width: 28px;
  padding: 0;
}

.follow-row__settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0 46px;
}

.follow-row__settings .select-menu {
  min-width: 96px;
}

.follow-row__opened,
.follow-row__news {
  margin: 8px 0 0 46px;
}

/* A channel has no photo to line up under. */
.follow-row--channel .follow-row__settings,
.follow-row--channel .follow-row__opened,
.follow-row--channel .follow-row__news {
  margin-left: 0;
}

.follow-row__label--click {
  cursor: pointer;
}

.follow-row__news-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 2px;
}

.follow-row__news-count {
  color: color-mix(in srgb, #fb923c 85%, var(--text-primary));
  font-size: 12px;
  font-weight: 700;
}

.follow-upload {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.follow-upload:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

.follow-upload:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.follow-upload__title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.follow-upload__meta,
.follow-upload__side {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

/* ---- Saved tracks ---- */

.saved-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 3px 8px;
  border-radius: var(--radius-md);
  font-size: 12.5px;
}

.saved-row:hover {
  background: var(--bg-tertiary);
}

.saved-row__cue {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.saved-row__track {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.saved-row__name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The store links follow the title while the row is hovered or holds the keyboard. */
.saved-row .saved-row__stores {
  display: none;
  margin-left: 6px;
}

.saved-row:hover .saved-row__stores,
.saved-row:focus-within .saved-row__stores {
  display: inline-flex;
}

.saved-row__set {
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.saved-row__set:hover {
  color: var(--text-primary);
  text-decoration: underline;
}

.saved-row__set:focus-visible,
.saved-row__heart:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.saved-row__heart {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-danger);
  cursor: pointer;
}

/* ---- Stats: four cards in Home's quiet style ---- */

.stats-summary {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .stats-cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

.stats-card {
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-secondary);
}

.stats-card__title {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stats-card__hint {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 11.5px;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 4px 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
}

.stats-row:last-child {
  border-bottom-color: transparent;
}

.stats-row--button {
  cursor: pointer;
}

.stats-row--button:hover .stats-row__name {
  text-decoration: underline;
}

.stats-row--button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.stats-row__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.stats-row__count {
  flex-shrink: 0;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.stats-quota {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12.5px;
}

.stats-quota b {
  color: var(--text-primary);
  font-size: 15px;
}
```

- [ ] **Step 2:** Commit:

```bash
git add src/components/sets/SetsTabs.css
git commit -m "feat(sets): styles for Following, Saved tracks and Stats"
```

---

### Task 5: Following

**Files:** Create `src/components/sets/SetsFollowing.tsx`.

- [ ] **Step 1:**

Create `src/components/sets/SetsFollowing.tsx`:

```tsx
// src/components/sets/SetsFollowing.tsx
// Sets' Following tab (Sets redesign spec, Following): one box to follow a
// channel or watch a DJ by name, then the DJs you watch and the channels you
// follow, each row with its check interval, Check now and a way to stop; a
// row opens to what has been found for it. A DJ's finds land on the
// library's New from DJs you watch; a channel's news shows under its row for
// this session (the channel news store), until opened or dismissed.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { SelectMenu } from '../SelectMenu'
import { ToggleSwitch } from '../settings/ToggleSwitch'
import { tauriApi } from '../../lib/tauri-api'
import { looksLikeAChannel } from '../../lib/channelInput'
import { localDay } from '../../lib/dj/gigs'
import { djHue, djInitials } from '../../lib/search/labels'
import { channelCheckMessage, checkedLabel, djCheckMessage } from '../../lib/sets/following'
import { toast } from '../../lib/toast'
import { useChannelNews } from '../../store/channelNewsStore'
import { getErrorMessage } from '../../types/ai'
import {
  CHECK_INTERVALS,
  type ChannelUpload,
  type FollowedChannel,
  type WatchedDj,
  type YouTubeQuotaStatus,
} from '../../types/youtube'
import './SetsTabs.css'

const INTERVAL_OPTIONS = CHECK_INTERVALS.map((option) => ({ value: String(option.hours), label: option.label }))

interface SetsFollowingProps {
  djs: WatchedDj[]
  channels: FollowedChannel[]
  quota: YouTubeQuotaStatus | null
  /** Something was followed, watched, checked or let go: read the lists (and the library's finds) again. */
  onChanged: () => void
  onQuotaChanged: () => void
  /** Shown at once while the write goes through, so a row does not flicker back. */
  onPatchDj: (nameKey: string, patch: Partial<WatchedDj>) => void
  onPatchChannel: (channelId: string, patch: Partial<FollowedChannel>) => void
  /** A stored set: its page. */
  onOpenSet: (videoId: string, title: string) => void
  /**
   * Not stored: fetched (5–7 units), stored and opened; from a channel, its
   * last-seen marker moves there. Answers whether it worked.
   */
  onImport: (videoId: string, channelId?: string) => Promise<boolean>
  onOpenDj?: (name: string) => void
}

/** A row opened to what has been found for it; `items` is null while it reads. */
interface Opened {
  key: string
  items: ChannelUpload[] | null
}

export function SetsFollowing({
  djs,
  channels,
  quota,
  onChanged,
  onQuotaChanged,
  onPatchDj,
  onPatchChannel,
  onOpenSet,
  onImport,
  onOpenDj,
}: SetsFollowingProps) {
  const [input, setInput] = useState('')
  /** A bare name in the box: watch it as a DJ, or pay 100 units to look for a channel. */
  const [bareName, setBareName] = useState<string | null>(null)
  // What is being worked on lives in the store, so a check still running
  // keeps its buttons disabled after a trip to another tab.
  const busy = useChannelNews((s) => s.busy)
  const setBusy = useChannelNews((s) => s.setBusy)
  const [opened, setOpenedState] = useState<Opened | null>(null)
  /** Counts the rows opened and closed: an answer for a row since closed, or replaced, is dropped. */
  const openClaim = useRef(0)
  const openedKey = useRef<string | null>(null)
  const setOpened = (next: Opened | null) => {
    openedKey.current = next?.key ?? null
    setOpenedState(next)
  }
  const [photos, setPhotos] = useState<Map<string, string>>(new Map())
  const news = useChannelNews((s) => s.byChannel)

  // The DJs' photos, as Search and Home show them (read-only: no profile is made).
  const djKeys = djs.map((dj) => dj.name_key).join('\n')
  useEffect(() => {
    if (!djKeys) return
    let live = true
    tauriApi
      .getKnownDjs(localDay(new Date()))
      .then((known) => {
        if (live) setPhotos(new Map(known.flatMap((dj) => (dj.imageUrl ? [[dj.nameKey, dj.imageUrl]] : []))))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [djKeys])

  const left = quota?.remaining ?? 0
  const failed = (what: string) => (err: unknown) => toast(`${what}: ${getErrorMessage(err)}`, { kind: 'error' })

  async function follow() {
    const text = input.trim()
    if (!text || busy) return
    // A bare name would be searched for — 100 units — and find the DJ's own
    // channel, where releases live rather than the sets they play: ask first.
    if (!looksLikeAChannel(text)) {
      setBareName(text)
      return
    }
    await followChannel(text)
  }

  async function followChannel(text: string) {
    setBusy('follow')
    setBareName(null)
    try {
      const channel = await tauriApi.resolveYouTubeChannel(text)
      // Following again would reset its interval and its last-seen marker.
      if (channels.some((c) => c.channel_id === channel.channelId)) {
        toast(`Already following ${channel.title ?? channel.channelId}`, { kind: 'info' })
        setInput('')
        return
      }
      await tauriApi.followYouTubeChannel(channel)
      setInput('')
      onChanged()
    } catch (err) {
      failed("Couldn't follow it")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  /** A bare name looked up as a channel: 100 units, so the quota is checked first. */
  async function searchChannelAnyway(name: string) {
    if (left < 100) {
      toast(`Searching for a channel costs 100 units and only ${left.toLocaleString('en-US')} are left today.`, {
        kind: 'warning',
      })
      return
    }
    await followChannel(name)
  }

  async function watchDj(name: string) {
    setBareName(null)
    // Watching again would reset their interval, auto-import and last check.
    if (djs.some((dj) => dj.name_key === name.trim().toLowerCase())) {
      toast(`Already watching ${name}`, { kind: 'info' })
      setInput('')
      return
    }
    try {
      await tauriApi.watchYouTubeDj(name)
      setInput('')
      onChanged()
    } catch (err) {
      failed("Couldn't watch them")(err)
    }
  }

  async function checkDjs(dj: WatchedDj | null) {
    const count = dj ? 1 : djs.length
    if (left < count * 100) {
      toast(
        `Searching for ${count} ${count === 1 ? 'DJ' : 'DJs'} costs ${(count * 100).toLocaleString('en-US')} units and only ${left.toLocaleString('en-US')} are left today.`,
        { kind: 'warning' },
      )
      return
    }
    setBusy(dj ? dj.name_key : 'djs')
    try {
      const found = dj ? await tauriApi.checkYouTubeDj(dj.name_key) : await tauriApi.checkYouTubeDjs()
      toast(djCheckMessage(found, dj?.display_name ?? null), { kind: 'info' })
      // Its row, if it is open now, shows what this search added.
      if (dj && openedKey.current === dj.name_key) void openDj(dj)
      onChanged()
    } catch (err) {
      failed("Couldn't search")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  async function checkChannels(channel: FollowedChannel | null) {
    setBusy(channel ? channel.channel_id : 'channels')
    try {
      const found = channel
        ? await tauriApi.checkYouTubeChannel(channel.channel_id)
        : await tauriApi.checkYouTubeChannels()
      useChannelNews.getState().add(found)
      toast(channelCheckMessage(found, channel ? (channel.title ?? channel.channel_id) : null), { kind: 'info' })
      onChanged()
    } catch (err) {
      failed("Couldn't check")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  function closeRow() {
    openClaim.current++
    setOpened(null)
  }

  /** Everything a DJ's searches have turned up, seen or not: free, read from disk. */
  async function openDj(dj: WatchedDj) {
    const claim = ++openClaim.current
    // Already open (a search just ended): its rows stay until the new ones come.
    if (openedKey.current !== dj.name_key) setOpened({ key: dj.name_key, items: null })
    try {
      const items = await tauriApi.listYouTubeDjFinds(dj.name_key)
      if (openClaim.current === claim) setOpened({ key: dj.name_key, items })
    } catch (err) {
      if (openClaim.current !== claim) return
      setOpened(null)
      failed("Couldn't read what was found")(err)
    }
  }

  /** A channel's recent long uploads (one to two units). */
  async function openChannel(channel: FollowedChannel) {
    if (!channel.uploads_id) return
    const claim = ++openClaim.current
    setOpened({ key: channel.channel_id, items: null })
    try {
      const items = await tauriApi.listYouTubeChannelUploads(channel.uploads_id, 25)
      if (openClaim.current === claim) setOpened({ key: channel.channel_id, items })
    } catch (err) {
      if (openClaim.current !== claim) return
      setOpened(null)
      failed("Couldn't read its uploads")(err)
    } finally {
      onQuotaChanged()
    }
  }

  async function take(upload: ChannelUpload, channelId?: string) {
    if (upload.already_stored) {
      onOpenSet(upload.video_id, upload.title)
      return
    }
    setBusy(upload.video_id)
    try {
      // A fetch that failed leaves it in the news, to try again.
      if ((await onImport(upload.video_id, channelId)) && channelId) {
        useChannelNews.getState().take(channelId, upload.video_id)
      }
    } finally {
      setBusy(null)
    }
  }

  /**
   * Dismissed: the channel is marked seen up to the newest upload its checks
   * turned up, as today — never an older one than a set already opened.
   */
  async function dismiss(channelId: string, uploads: ChannelUpload[]) {
    const newest = useChannelNews.getState().newest[channelId] ?? uploads[0]
    useChannelNews.getState().dismiss(channelId)
    if (newest) await tauriApi.markYouTubeChannelSeen(channelId, newest.video_id).catch(failed("Couldn't dismiss it"))
  }

  /** What an opened row says when nothing is there: "nothing found" and "never looked" are different answers. */
  function emptyNote(key: string): string {
    const dj = djs.find((d) => d.name_key === key)
    if (!dj) return 'No long uploads found.'
    if (dj.last_checked) return 'Searched, and nothing has turned up yet.'
    return `Not searched yet — ${
      dj.check_interval_hours === 0 ? 'set how often, or press Check now' : 'the next automatic search will pick this up'
    }.`
  }

  function setAutoImport(dj: WatchedDj, checked: boolean) {
    onPatchDj(dj.name_key, { auto_import: checked })
    void tauriApi.setYouTubeDjAutoImport(dj.name_key, checked).catch((err) => {
      failed("Couldn't change it")(err)
      onChanged()
    })
  }

  const uploadRows = (items: ChannelUpload[], channelId?: string) =>
    items.map((item) => (
      <button
        key={item.video_id}
        type="button"
        className="follow-upload"
        // One fetch at a time: 5–7 units each.
        disabled={busy !== null}
        onClick={() => void take(item, channelId)}
      >
        <span className="follow-upload__title" title={item.title}>
          {item.title}
        </span>
        <span className="follow-upload__meta">
          {item.published_at.slice(0, 10)}
          {item.duration_ms ? ` · ${Math.round(item.duration_ms / 60000)} min` : ''}
        </span>
        <span className="follow-upload__side">
          {busy === item.video_id ? 'reading…' : item.already_stored ? 'in your library' : 'get it · 5–7 units'}
        </span>
      </button>
    ))

  const openedRows = (key: string, channelId?: string) =>
    opened?.key === key && (
      <div className="follow-row__opened">
        {opened.items === null ? (
          <p className="follow-note">Reading…</p>
        ) : opened.items.length === 0 ? (
          <p className="follow-note">{emptyNote(key)}</p>
        ) : (
          uploadRows(opened.items, channelId)
        )}
      </div>
    )

  const now = new Date()

  return (
    <div className="follow">
      <div className="follow-box">
        <input
          className="follow-box__input"
          placeholder="Follow a channel, or watch a DJ by name"
          aria-label="Follow a channel, or watch a DJ by name"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setBareName(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void follow()
          }}
        />
        <button type="button" className="btn btn--primary" disabled={!input.trim() || busy !== null} onClick={() => void follow()}>
          {busy === 'follow' ? 'Following…' : 'Follow'}
        </button>
      </div>
      <p className="follow-note">
        A channel link or @handle follows the channel (2 units). A name watches a DJ: their sets land on
        other people&apos;s channels, so they are searched for by name (100 units a search).
      </p>
      {bareName && (
        <div className="follow-choice">
          <span>&ldquo;{bareName}&rdquo; looks like a name, not a channel.</span>
          <button type="button" className="btn btn--primary" onClick={() => void watchDj(bareName)}>
            Watch &ldquo;{bareName}&rdquo; as a DJ
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void searchChannelAnyway(bareName)}>
            Search for a channel anyway · 100 units
          </button>
        </div>
      )}

      <section className="follow-section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">DJs you watch</h2>
          {djs.length > 0 && (
            <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void checkDjs(null)}>
              {busy === 'djs' ? 'Searching…' : `Search all now · ${(djs.length * 100).toLocaleString('en-US')} units`}
            </button>
          )}
        </div>
        {djs.length === 0 && <p className="follow-note">No DJs watched yet — type a name in the box above.</p>}
        {djs.map((dj) => {
          const photo = photos.get(dj.name_key)
          return (
            <div className="follow-row" key={dj.name_key}>
              <div className="follow-row__main">
                <span
                  className="follow-row__photo"
                  aria-hidden="true"
                  style={photo ? undefined : { filter: `hue-rotate(${djHue(dj.display_name)}deg)` }}
                >
                  {photo ? <img src={photo} alt="" loading="lazy" draggable={false} /> : djInitials(dj.display_name)}
                </span>
                <span className="follow-row__text">
                  {onOpenDj ? (
                    <button type="button" className="follow-row__name" onClick={() => onOpenDj(dj.display_name)}>
                      {dj.display_name}
                    </button>
                  ) : (
                    <span className="follow-row__name">{dj.display_name}</span>
                  )}
                  <span className="follow-row__meta">{checkedLabel(dj.last_checked, now)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Search for ${dj.display_name} now, 100 units`}
                  disabled={busy !== null}
                  onClick={() => void checkDjs(dj)}
                >
                  {busy === dj.name_key ? 'Searching…' : 'Check now · 100 units'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-expanded={opened?.key === dj.name_key}
                  aria-label={`Everything found for ${dj.display_name}`}
                  onClick={() => (opened?.key === dj.name_key ? closeRow() : void openDj(dj))}
                >
                  <Icon name={opened?.key === dj.name_key ? 'ChevronUp' : 'ChevronDown'} size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-label={`Stop watching ${dj.display_name}`}
                  disabled={busy === dj.name_key}
                  onClick={() => void tauriApi.unwatchYouTubeDj(dj.name_key).then(onChanged, failed("Couldn't stop watching"))}
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
              <div className="follow-row__settings">
                <span className="follow-row__label">checks</span>
                <SelectMenu
                  label={`How often ${dj.display_name} is searched for`}
                  value={String(dj.check_interval_hours)}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) => {
                    if (Number(value) === dj.check_interval_hours) return
                    onPatchDj(dj.name_key, { check_interval_hours: Number(value) })
                    void tauriApi.setYouTubeDjInterval(dj.name_key, Number(value)).catch((err) => {
                      failed("Couldn't change it")(err)
                      onChanged()
                    })
                  }}
                />
                <ToggleSwitch
                  checked={dj.auto_import}
                  label={`Fetch ${dj.display_name}'s new sets automatically`}
                  onChange={(checked) => setAutoImport(dj, checked)}
                />
                {/* The words toggle it too; the switch carries the name for screen readers. */}
                <span
                  className="follow-row__label follow-row__label--click"
                  aria-hidden="true"
                  onClick={() => setAutoImport(dj, !dj.auto_import)}
                >
                  fetch new sets automatically
                </span>
              </div>
              {openedRows(dj.name_key)}
            </div>
          )
        })}
      </section>

      <section className="follow-section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">Channels you follow</h2>
          {channels.length > 0 && (
            <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void checkChannels(null)}>
              {busy === 'channels' ? 'Checking…' : 'Check all · 1–2 units each'}
            </button>
          )}
        </div>
        {channels.length === 0 && <p className="follow-note">Not following a channel yet — paste one in the box above.</p>}
        {channels.map((channel) => {
          const name = channel.title ?? channel.channel_id
          const fresh = news[channel.channel_id] ?? []
          return (
            <div className="follow-row follow-row--channel" key={channel.channel_id}>
              <div className="follow-row__main">
                <span className="follow-row__text">
                  <span className="follow-row__name">{name}</span>
                  <span className="follow-row__meta">
                    {channel.handle ? `@${channel.handle} · ` : ''}
                    {checkedLabel(channel.last_checked, now)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Check ${name} now, 1–2 units`}
                  disabled={busy !== null}
                  onClick={() => void checkChannels(channel)}
                >
                  {busy === channel.channel_id ? 'Checking…' : 'Check now · 1–2 units'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-expanded={opened?.key === channel.channel_id}
                  aria-label={`${name}'s recent uploads (1–2 units)`}
                  disabled={!channel.uploads_id}
                  onClick={() => (opened?.key === channel.channel_id ? closeRow() : void openChannel(channel))}
                >
                  <Icon name={opened?.key === channel.channel_id ? 'ChevronUp' : 'ChevronDown'} size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-label={`Stop following ${name}`}
                  disabled={busy === channel.channel_id}
                  onClick={() => {
                    // Its news goes with it.
                    useChannelNews.getState().dismiss(channel.channel_id)
                    void tauriApi.unfollowYouTubeChannel(channel.channel_id).then(onChanged, failed("Couldn't stop following"))
                  }}
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
              <div className="follow-row__settings">
                <span className="follow-row__label">checks</span>
                <SelectMenu
                  label={`How often ${name} is checked`}
                  value={String(channel.check_interval_hours)}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) => {
                    if (Number(value) === channel.check_interval_hours) return
                    onPatchChannel(channel.channel_id, { check_interval_hours: Number(value) })
                    void tauriApi.setYouTubeChannelInterval(channel.channel_id, Number(value)).catch((err) => {
                      failed("Couldn't change it")(err)
                      onChanged()
                    })
                  }}
                />
              </div>
              {fresh.length > 0 && (
                <div className="follow-row__news">
                  <div className="follow-row__news-head">
                    <span className="follow-row__news-count">
                      {fresh.length} new {fresh.length === 1 ? 'set' : 'sets'}
                    </span>
                    <button type="button" className="link-btn" onClick={() => void dismiss(channel.channel_id, fresh)}>
                      Dismiss
                    </button>
                  </div>
                  {uploadRows(fresh, channel.channel_id)}
                </div>
              )}
              {openedRows(channel.channel_id, channel.channel_id)}
            </div>
          )
        })}
      </section>
    </div>
  )
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors (nothing uses it until Task 7). Commit:

```bash
git add src/components/sets/SetsFollowing.tsx
git commit -m "feat(sets): Following — one box, the DJs you watch and the channels you follow, a check per row"
```

---

### Task 6: Saved tracks and Stats

**Files:** Create `src/components/sets/SetsSaved.tsx`, `src/components/sets/SetsStats.tsx`.

- [ ] **Step 1:**

Create `src/components/sets/SetsSaved.tsx`:

```tsx
// src/components/sets/SetsSaved.tsx
// Saved tracks (Sets redesign spec, Saved tracks): the hearted tracks of
// every set, in the set page's row style — the cue, the track over its set's
// title (which opens the set there), the store links, ♥ to let it go — and
// Copy list at the top right.
import { Icon } from '../Icon'
import { StoreLinks } from './StoreLinks'
import { toast } from '../../lib/toast'
import { savedList } from '../../lib/sets/setPage'
import type { SavedTrack } from '../../types/youtube'
import './SetsTabs.css'

interface SetsSavedProps {
  saved: SavedTrack[]
  /** The set the track was saved from, playing from its cue. */
  onOpenAt: (videoId: string, cueMs: number, title: string | null) => void
  onRemove: (track: SavedTrack) => void
}

export function SetsSaved({ saved, onOpenAt, onRemove }: SetsSavedProps) {
  return (
    <section className="saved">
      <div className="sets-home__head">
        <h2 className="sets-home__heading">Saved tracks</h2>
        {saved.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              void navigator.clipboard.writeText(savedList(saved))
              toast(`Copied ${saved.length} ${saved.length === 1 ? 'track' : 'tracks'}`)
            }}
          >
            Copy list
          </button>
        )}
      </div>
      {saved.length === 0 && <p className="follow-note">Heart a track in any set to keep it here.</p>}
      {saved.map((t) => (
        <div className="saved-row" key={t.id ?? `${t.video_id}|${t.cue_ms}|${t.title}`}>
          <span className="saved-row__cue">{t.cue}</span>
          <span className="saved-row__track">
            <span className="saved-row__name">
              {t.artist ? `${t.artist} — ${t.title}` : t.title}
              {t.mix && <span className="set-row__mix"> ({t.mix})</span>}
              <StoreLinks artist={t.artist} title={t.title} mix={t.mix} className="saved-row__stores" />
            </span>
            <button
              type="button"
              className="saved-row__set"
              title={`Open ${t.set_title ?? 'the set'} at ${t.cue ?? 'this track'}`}
              onClick={() => onOpenAt(t.video_id, t.cue_ms, t.set_title ?? null)}
            >
              {t.set_title ?? 'the set'}
            </button>
          </span>
          <button
            type="button"
            className="saved-row__heart"
            aria-label="Remove from Saved tracks"
            onClick={() => onRemove(t)}
          >
            <Icon name="Heart" size={13} />
          </button>
        </div>
      ))}
    </section>
  )
}
```

Create `src/components/sets/SetsStats.tsx`:

```tsx
// src/components/sets/SetsStats.tsx
// Stats (Sets redesign spec, Stats): four cards in Home's quiet style — Most
// played, Doing the rounds, Most gaps (a row opens the set), Quota — under
// the summary line.
import type { YouTubeQuotaStatus, YtStats } from '../../types/youtube'
import './SetsTabs.css'

interface SetsStatsProps {
  stats: YtStats | null
  /** The quota as Sets knows it now (the stats' copy is from when the tab opened). */
  quota: YouTubeQuotaStatus | null
  onOpenSet: (videoId: string, title: string) => void
}

const n = (value: number) => value.toLocaleString('en-US')

export function SetsStats({ stats, quota: live, onOpenSet }: SetsStatsProps) {
  if (!stats) return <p className="follow-note">Nothing processed yet.</p>
  const quota = live ?? stats.quota
  const reset = quota.seconds_until_reset
  return (
    <>
      <p className="stats-summary">
        {n(stats.sets)} {stats.sets === 1 ? 'set' : 'sets'} · {n(stats.tracks)} named tracks · {n(stats.unknowns)} still
        unidentified
      </p>
      <div className="stats-cards">
        <section className="stats-card">
          <h3 className="stats-card__title">Most played</h3>
          {stats.top_artists.length === 0 && <p className="follow-note">—</p>}
          {stats.top_artists.map(([artist, count]) => (
            <div className="stats-row" key={artist}>
              <span className="stats-row__name">{artist}</span>
              <span className="stats-row__count">{n(count)}</span>
            </div>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Doing the rounds</h3>
          <p className="stats-card__hint">Records that turn up in more than one set.</p>
          {stats.shared_tracks.length === 0 && <p className="follow-note">—</p>}
          {stats.shared_tracks.map(([title, artist, count]) => (
            <div className="stats-row" key={`${artist}-${title}`}>
              <span className="stats-row__name">{artist ? `${artist} — ${title}` : title}</span>
              <span className="stats-row__count">{n(count)} sets</span>
            </div>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Most gaps</h3>
          <p className="stats-card__hint">Where digging through the comments would pay off most.</p>
          {stats.most_unknowns.length === 0 && <p className="follow-note">—</p>}
          {stats.most_unknowns.map(([videoId, title, count]) => (
            <button type="button" className="stats-row stats-row--button" key={videoId} onClick={() => onOpenSet(videoId, title)}>
              <span className="stats-row__name">{title}</span>
              <span className="stats-row__count">{n(count)} IDs</span>
            </button>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Quota</h3>
          <div className="stats-quota">
            <span>
              <b>{n(quota.spent)}</b> spent today
            </span>
            <span>
              <b>{n(quota.remaining)}</b> left of {n(quota.daily_limit)}
            </span>
            <span>
              resets in {Math.floor(reset / 3600)}h {Math.floor((reset % 3600) / 60)}m
            </span>
          </div>
        </section>
      </div>
    </>
  )
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/sets/SetsSaved.tsx src/components/sets/SetsStats.tsx
git commit -m "feat(sets): Saved tracks in the set page's style, Stats as four cards"
```

---

### Task 7: The tabs in Sets, and the news kept in App

**Files:** Modify `src/components/views/SetsView.tsx`, `src/components/views/SetsView.css`, `src/App.tsx`.

- [ ] **Step 1: SetsView** — renders the three tabs; Following's old state, handlers and news go (`importUpload` stays, for an upload opened on its page)

In `src/components/views/SetsView.tsx`, replace

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
import { dismissToast, toast } from '../../lib/toast'
import type {
```

with

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { SetPage, type SetOpening } from '../sets/SetPage'
import { SetsBox } from '../sets/SetsBox'
import { SetsLibrary } from '../sets/SetsLibrary'
import { SetsFollowing } from '../sets/SetsFollowing'
import { SetsSaved } from '../sets/SetsSaved'
import { SetsStats } from '../sets/SetsStats'
import { channelNewsCount, useChannelNews } from '../../store/channelNewsStore'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView, type SetsTab } from '../../store/setsViewStore'
import { dismissToast, toast } from '../../lib/toast'
import type {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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
import type { NewDjFind } from '../../types/home'
import './SetsView.css'

/** The new finds the library shows, newest first. */
const NEW_FINDS_MAX = 20
```

with

```tsx
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
  YtTrackHit,
  SetSearchHit,
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import type { NewDjFind } from '../../types/home'
import './SetsView.css'

/** The new finds the library shows, newest first. */
const NEW_FINDS_MAX = 20
```

In `src/components/views/SetsView.tsx`, replace

```tsx
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
  /** What YouTube was searched for, for the results' heading. */
  const [foundQuery, setFoundQuery] = useState('')
  /** Counts the YouTube searches: one answering after Esc, or a newer one, is dropped. */
  const searchClaim = useRef(0)
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  const [channelInput, setChannelInput] = useState('')
  /**
   * Where else this set's records turn up, by row.
   *
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
  const [uploads, setUploads] = useState<{
    channel: FollowedChannel
    items: ChannelUpload[]
    /** What an empty list actually means here — see showDjFinds. */
    emptyNote?: string
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /**
   * The whole library, loaded here rather than taken from the main view.
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
```

with

```tsx
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
  /** What YouTube was searched for, for the results' heading. */
  const [foundQuery, setFoundQuery] = useState('')
  /** Counts the YouTube searches: one answering after Esc, or a newer one, is dropped. */
  const searchClaim = useRef(0)
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  /**
   * Where else this set's records turn up, by row.
   *
   * Read from what is already stored, so it costs nothing and gets better every
   * time another set is saved.
   */
  const [echoes, setEchoes] = useState<Map<number, TrackEcho>>(new Map())
  /** What the last re-fetch changed, said plainly because it cost something. */
  const [reanalysed, setReanalysed] = useState<string | null>(null)
  /** Counts the sets opened: one arriving late yields to a newer one. */
  const shownSets = useRef(0)
  const [djs, setDjs] = useState<WatchedDj[]>([])
  /**
   * The whole library, loaded here rather than taken from the main view.
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
```

In `src/components/views/SetsView.tsx`, replace

```tsx
    const stop = listen('library-changed', load)
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  // The automatic check runs whether or not this view is open, so what it found
  // is taken from the event rather than checked for again — a second check would
  // cost quota to learn what the app already knows.
  useEffect(() => {
    const stop = listen<ChannelNews[]>('yt-new-sets', (event) => {
      setNews(event.payload)
      refreshLibrary()
      refreshQuota()
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
```

with

```tsx
    const stop = listen('library-changed', load)
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  // The automatic check runs whether or not this view is open: App keeps the
  // channels' news (the channel news store) and the DJs' finds are stored, so
  // here the lists and the quota are only read again.
  useEffect(() => {
    const stop = listen('yt-new-sets', () => {
      refreshLibrary()
      refreshQuota()
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
```

In `src/components/views/SetsView.tsx`, replace

```tsx
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Adds a channel to follow. A handle or a link costs 2 units; a bare name
      falls through to search, which costs 100 — so paste a link where you can. */
  async function addChannel() {
    if (!channelInput.trim() || loading) return

    // Resolving a bare name ends in a search — 100 units — and returns the
    // DJ's own channel, where releases live rather than the sets they play.
    // Better to ask than to spend a hundred units on the wrong thing.
    if (!looksLikeAChannel(channelInput)) {
      setBareName(channelInput.trim())
      return
    }

    setLoading(true)
    setError(null)
    setBareName(null)
    try {
      const channel = await tauriApi.resolveYouTubeChannel(channelInput.trim())
      await tauriApi.followYouTubeChannel(channel)
      setChannelInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** What a channel has put out lately, long videos only. */
  async function showUploads(channel: FollowedChannel) {
    if (!channel.uploads_id) return
    setBusy(channel.channel_id)
    setError(null)
    try {
      const items = await tauriApi.listYouTubeChannelUploads(channel.uploads_id, 25)
      setUploads({ channel, items })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
      refreshQuota()
    }
  }

  /** One or two units per channel — the cheap way to keep up. */
  /**
   * How often this channel is checked without being asked.
   *
   * Written straight through and reflected locally, so the row does not flicker
   * back to its old value while the list is being read again.
   */
  async function setCheckInterval(channelId: string, hours: number) {
    setChannels((current) =>
      current.map((c) =>
        c.channel_id === channelId ? { ...c, check_interval_hours: hours } : c,
      ),
    )
    await tauriApi.setYouTubeChannelInterval(channelId, hours).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  async function addDj() {
    const name = djInput.trim()
    if (name.length < 2) return
    setError(null)
    try {
      await tauriApi.watchYouTubeDj(name)
      setDjInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /**
   * What has already been found for a DJ, read back from disk.
   *
   * Free, and the reason every hit is recorded: a set found last week and never
   * imported is still here, even though it stopped being news the moment it was
   * first shown.
   */
  async function showDjFinds(dj: WatchedDj) {
    setError(null)
    try {
      const items = await tauriApi.listYouTubeDjFinds(dj.name_key)
      setUploads({
        channel: {
          channel_id: `dj:${dj.name_key}`,
          title: `${dj.display_name} — everything found so far`,
          check_interval_hours: dj.check_interval_hours,
        },
        items,
        // "Nothing found" and "never looked" are not the same answer, and
        // showing the first when the second is true is how a name that was
        // never searched reads as a name with no sets.
        emptyNote: dj.last_checked
          ? 'Searched, and nothing new has turned up yet.'
          : `Not searched yet — ${
              dj.check_interval_hours === 0
                ? 'set an interval, or press Search now'
                : 'the next automatic search will pick this up'
            }.`,
      })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function setDjAutoImport(nameKey: string, enabled: boolean) {
    setDjs((current) =>
      current.map((d) => (d.name_key === nameKey ? { ...d, auto_import: enabled } : d)),
    )
    await tauriApi.setYouTubeDjAutoImport(nameKey, enabled).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  async function setDjInterval(nameKey: string, hours: number) {
    setDjs((current) =>
      current.map((d) => (d.name_key === nameKey ? { ...d, check_interval_hours: hours } : d)),
    )
    await tauriApi.setYouTubeDjInterval(nameKey, hours).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  /**
   * Searching for every watched DJ, at 100 units each.
   *
   * The button refuses rather than half-finishing: spending a chunk of the day
   * and then stopping is worse than saying so before the click.
   */
  async function checkDjs() {
    const cost = djs.length * 100
    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < cost) {
      setError(
        `Searching for ${djs.length} ${djs.length === 1 ? 'DJ' : 'DJs'} costs ${cost.toLocaleString()} units and only ${quotaLeft.toLocaleString()} are left today.`,
      )
      return
    }
    setLoading(true)
    setError(null)
    try {
      setNews(await tauriApi.checkYouTubeDjs())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshLibrary()
      refreshQuota()
    }
  }

  async function checkChannels() {
    setLoading(true)
    setError(null)
    try {
      setNews(await tauriApi.checkYouTubeChannels())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Fetches one upload and, when it came from a check, marks it as seen. */
  /**
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
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
      refreshQuota()
    }
  }

  /** Reopening a stored set never touches the network. */
  /**
```

with

```tsx
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Fetches one upload and, when it came from a check, marks it as seen. */
  /**
   * `channelId` moves the channel's last-seen marker. A watched DJ has none —
   * its news comes from a dated search, not from a position in a listing.
   */
  async function importUpload(videoId: string, channelId?: string): Promise<boolean> {
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw, claim)
      await storeParsed(raw, parsed)
      if (channelId) await tauriApi.markYouTubeChannelSeen(channelId, videoId).catch(() => {})
      refreshLibrary()
      return true
    } catch (err) {
      toast(`Couldn't read this set: ${getErrorMessage(err)}`, { kind: 'error' })
      return false
    } finally {
      refreshQuota()
    }
  }

  /** Reopening a stored set never touches the network. */
  /**
```

In `src/components/views/SetsView.tsx`, replace

```tsx

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
  }

  function copySavedList() {
    const text = saved
      .map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))
      .join('\n')
    void navigator.clipboard.writeText(text)
  }

  /**
   * The tempo of each record the user owns, so the strip can carry the shape of
   * the set rather than a row of equal blocks.
   *
   * Read off the matched library file: 97% of the library is analysed, and the
   * record's own tempo is the only figure that exists without decoding the
```

with

```tsx

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
  }

  /**
   * The tempo of each record the user owns, so the strip can carry the shape of
   * the set rather than a row of equal blocks.
   *
   * Read off the matched library file: 97% of the library is analysed, and the
   * record's own tempo is the only figure that exists without decoding the
```

In `src/components/views/SetsView.tsx`, replace

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
```

with

```tsx
      const bpm = match.track.bpm
      if (typeof bpm === 'number' && bpm > 0) byIndex.set(index, bpm)
    }
    return byIndex
  }, [matches])

  /** Following's badge: the channels' news only — DJs' finds show in the Library. */
  const newsByChannel = useChannelNews((state) => state.byChannel)
  const channelNews = useMemo(
    () => channelNewsCount(newsByChannel, new Set(channels.map((c) => c.channel_id))),
    [newsByChannel, channels],
  )

  /**
   * Mark all seen on the library's new finds, as on Home: its Undo marks
   * exactly the rows it changed unseen again.
   */
  async function markAllFindsSeen() {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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
```

with

```tsx
                  onOpenDj={onOpenDj ? (name) => onOpenDj(name, null) : undefined}
                  onMarkAllSeen={() => void markAllFindsSeen()}
                />
              )}

              {tab === 'channels' && (
                <SetsFollowing
                  djs={djs}
                  channels={channels}
                  quota={quota}
                  onChanged={refreshLibrary}
                  onQuotaChanged={refreshQuota}
                  onPatchDj={(nameKey, patch) =>
                    setDjs((current) => current.map((d) => (d.name_key === nameKey ? { ...d, ...patch } : d)))
                  }
                  onPatchChannel={(channelId, patch) =>
                    setChannels((current) =>
                      current.map((c) => (c.channel_id === channelId ? { ...c, ...patch } : c)),
                    )
                  }
                  onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                  onImport={importUpload}
                  onOpenDj={onOpenDj ? (name) => onOpenDj(name, null) : undefined}
                />
              )}

              {tab === 'stats' && (
                <SetsStats
                  stats={stats}
                  quota={quota}
                  onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                />
              )}

              {tab === 'saved' && (
                <SetsSaved
                  saved={saved}
                  onOpenAt={(videoId, cueMs, title) => void openSet(videoId, { cueMs, title })}
                  onRemove={(track) =>
                    void tauriApi
                      .deleteSavedYouTubeTrack(track.video_id, track.cue_ms, track.title)
                      .then(refreshLibrary, () => {})
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
```

- [ ] **Step 2: The rules only the old Following, Saved and Stats used**

In `src/components/views/SetsView.css`, replace

```css
  font-size: var(--text-2xl);
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-primary);
}

.sets-view__subtitle {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin: 0 0 20px;
}

.sets-form {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.sets-form__input {
  flex: 1;
  height: var(--input-height);
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.sets-form__input:focus {
  outline: none;
  border-color: var(--accent);
}

.sets-quota {
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin: 0 0 20px;
}

.sets-error {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(var(--color-danger-rgb), 0.1);
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
  padding: 7px 8px;
  border-radius: var(--radius-sm);
}

.sets-track:hover {
  background: var(--bg-secondary);
}

.sets-track__cue {
  flex: 0 0 68px;
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

/* Agreement: how many of the found lists say this same name. */
.sets-track__votes {
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

.sets-loose__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.sets-loose__hint {
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin: 0 0 10px;
}

.sets-empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.7;
}

/* --- library ownership --- */

.sets-filter {
  display: flex;
  gap: 6px;
  margin: 14px 0 6px;
}

.sets-filter__btn {
  padding: 3px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}

.sets-filter__btn:hover {
  color: var(--text-primary);
}

/* --- tabs, library, saved --- */

.sets-stored {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-sm);
}

.sets-stored:hover {
  background: var(--bg-secondary);
}

.sets-stored__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.sets-stored__title {
  color: var(--text-primary);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
```

with

```css
  font-size: var(--text-2xl);
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-primary);
}

.sets-error {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(var(--color-danger-rgb), 0.1);
  border: 1px solid rgba(var(--color-danger-rgb), 0.35);
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin-bottom: 16px;
}

/* --- track rows --- */

.sets-track__artist {
  color: var(--text-secondary);
}

/* --- tabs, library, saved --- */

.sets-stored__title {
  color: var(--text-primary);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
```

In `src/components/views/SetsView.css`, replace

```css

/* A description that actually holds a list is the thing worth spotting. */
.sets-found__promise--found {
  color: var(--color-success);
}

/* Held back before spending: says what it would cost and offers the cheap
   right thing first, with the expensive one still available. */
.sets-notice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin: 8px 0;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.sets-notice strong {
  color: var(--text-primary);
}

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

with

```css

/* A description that actually holds a list is the thing worth spotting. */
.sets-found__promise--found {
  color: var(--color-success);
}

/* The same track, lit up in the strip. */
.sets-timeline__block--playing {
  background: var(--accent);
}

/* Where the video actually is — the blocks say which track, not how far in. */
```

In `src/components/views/SetsView.css`, replace

```css
  border-radius: 50%;
  background: var(--accent);
  transform: translateY(-50%);
  pointer-events: none;
}

/* Watching a DJ is a different mechanism at a hundred times the cost, so it
   sits in its own block rather than beside the channels. */
.sets-djs {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

/* Fetch a watched DJ's new sets without asking. */
.sets-autoimport {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  white-space: nowrap;
}

.sets-autoimport input {
  cursor: pointer;
  margin: 0;
}

/* How often a followed channel is checked on its own. */
.sets-interval {
  flex: 0 0 auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  padding: 3px 6px;
  cursor: pointer;
}

.sets-interval:hover {
  color: var(--text-primary);
}

.sets-stored__remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

.sets-stored__remove:hover {
  color: var(--color-danger);
}

.sets-track__heart {
  flex: 0 0 auto;
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--border);
  cursor: pointer;
}

.sets-track__heart:hover {
  color: var(--text-secondary);
}

.sets-track__heart--on,
.sets-track__heart--on:hover {
  color: var(--color-danger);
}

.sets-saved__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sets-store-link {
  background: none;
  border: none;
  padding: 0 0 0 10px;
  color: var(--accent);
  font-size: var(--text-xs);
```

with

```css
  border-radius: 50%;
  background: var(--accent);
  transform: translateY(-50%);
  pointer-events: none;
}

.sets-store-link {
  background: none;
  border: none;
  padding: 0 0 0 10px;
  color: var(--accent);
  font-size: var(--text-xs);
```

In `src/components/views/SetsView.css`, replace

```css
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

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
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  text-align: left;
  cursor: pointer;
}

.sets-hit:hover {
  background: var(--bg-secondary);
}

.sets-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-top: 20px;
}

.sets-stats__block .sets-track {
  padding: 5px 0;
}

.sets-stats__block .sets-track:hover {
  background: none;
}

/* --- results of searching YouTube by name --- */

.sets-found {
  display: flex;
  align-items: center;
  gap: 12px;
```

with

```css
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

/* --- results of searching YouTube by name --- */

.sets-found {
  display: flex;
  align-items: center;
  gap: 12px;
```

In `src/components/views/SetsView.css`, replace

```css

/* Inside a group the links sit tighter than the single trailing link they
   were originally written for. */
.sets-stores .sets-store-link {
  padding: 0 4px;
}

/* --- the library, filed by DJ --- */

.sets-dj {
  margin-bottom: 26px;
}
```

with

```css

/* Inside a group the links sit tighter than the single trailing link they
   were originally written for. */
.sets-stores .sets-store-link {
  padding: 0 4px;
}
```

- [ ] **Step 3: App keeps the channels' news from a background check, and says where the finds are**

In `src/App.tsx`, replace

```tsx
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

with

```tsx
import { TrackTable, type TrackTableRef } from './components/TrackTable'
import { NowPlayingBar } from './components/layout/NowPlayingBar'
import { SetPlayerBar } from './components/sets/SetPlayerBar'
import { SetPlayerEngine } from './lib/setPlayer/SetPlayerEngine'
import { useOverlay } from './lib/overlays'
import { useSetsView } from './store/setsViewStore'
import { useChannelNews } from './store/channelNewsStore'
import { HomeView } from './components/views/HomeView'
import { PlaylistDetailHeader } from './components/views/PlaylistDetailHeader'
import { MiniPlayer } from './components/MiniPlayer'
import { SettingsView } from './components/views/SettingsView'
import { SearchView } from './components/views/SearchView'
import { SetsView } from './components/views/SetsView'
```

In `src/App.tsx`, replace

```tsx
  // to arrive somewhere the user is actually looking — the Sets view may well be
  // closed. The Following tab carries the same event and shows the sets themselves.
  useEffect(() => {
    const stop = listen<ChannelNews[]>('yt-new-sets', async (event) => {
      // Home's New sets read again: the search has written its finds.
      setDataVersion((version) => version + 1)
      const found = event.payload
      const total = found.reduce((sum, c) => sum + c.new_sets.length, 0)
      if (total === 0) return

      const who =
        found.length === 1
          ? (found[0].title ?? 'a channel you follow')
          : `${found.length} of the channels and DJs you follow`
      setNotification({
        message: `${total} new ${total === 1 ? 'set' : 'sets'} from ${who} — see Sets › Following`,
        type: 'info',
      })

      // Automatic import lives here rather than in the background task that
      // found these, because the parser is TypeScript: the backend can fetch a
      // set but has nothing to turn it into a tracklist.
```

with

```tsx
  // to arrive somewhere the user is actually looking — the Sets view may well be
  // closed. The Following tab carries the same event and shows the sets themselves.
  useEffect(() => {
    const stop = listen<ChannelNews[]>('yt-new-sets', async (event) => {
      // Home's New sets read again: the search has written its finds.
      setDataVersion((version) => version + 1)
      // The channels' news waits under each channel on Sets' Following tab.
      useChannelNews.getState().add(event.payload)
      const found = event.payload
      const total = found.reduce((sum, c) => sum + c.new_sets.length, 0)
      if (total === 0) return

      const who =
        found.length === 1
          ? (found[0].title ?? 'a channel you follow')
          : `${found.length} of the channels and DJs you follow`
      // A channel's news waits under it on Following; a DJ's finds are on
      // the library's New from DJs you watch.
      const where = found.every((item) => item.source === 'dj')
        ? 'Sets › Library'
        : found.every((item) => item.source !== 'dj')
          ? 'Sets › Following'
          : 'Sets'
      setNotification({
        message: `${total} new ${total === 1 ? 'set' : 'sets'} from ${who} — see ${where}`,
        type: 'info',
      })

      // Automatic import lives here rather than in the background task that
      // found these, because the parser is TypeScript: the backend can fetch a
      // set but has nothing to turn it into a tracklist.
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 648 passed (649)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/views/SetsView.tsx src/components/views/SetsView.css src/App.tsx
git commit -m "feat(sets): Following, Saved tracks and Stats in Sets; App keeps the channels' news"
```

---

### Task 8: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-sets-redesign-design.md`, replace

```markdown
("Library 29 · 3 new"), where their row is.

Per-row checks need two new commands that check one item:
`check_youtube_dj(name_key)` and `check_youtube_channel(channel_id)`, beside
today's check-all `check_youtube_djs` and `check_youtube_channels`.

## Stats

Four cards in a grid, in Home's quiet card style: **Most played** (artists and
counts), **Doing the rounds** (records in more than one set), **Most gaps**
(sets with the most IDs; a row opens the set), **Quota** (spent, left, resets
in). The summary line above them stays ("29 sets · 412 named tracks · 37 still
```

with

```markdown
("Library 29 · 3 new"), where their row is.

Per-row checks need two new commands that check one item:
`check_youtube_dj(name_key)` and `check_youtube_channel(channel_id)`, beside
today's check-all `check_youtube_djs` and `check_youtube_channels`.

**As built by plan S4** (with Saved tracks and Stats):

- Rust: what a check covers is `covered(items, scope, now)` over a
  `Checkable` trait (a channel, a watched DJ) with `CheckScope::{All, Due,
  One(key)}` — the buttons, the timer and a row — tested as `is_due` is. A
  row's Check now runs whatever its interval says, Never included, because
  someone asked. The new commands are `check_youtube_channel(channel_id)`
  and `check_youtube_dj(name_key)`. A row's check that could not reach
  YouTube answers the error (the toast says it) rather than "Nothing new";
  the buttons and the timer still skip what failed, as today.
- The channels' news is a small store (`useChannelNews`), fed by App's
  `yt-new-sets` listener and by Following's checks; a DJ's finds are not
  kept there (they are stored, and show on the library). It keeps each
  channel's newest upload, so Dismiss moves the marker there even when the
  row's ▾ is closed. Following's badge counts only the channels still
  followed; ✕ clears a channel's news. App's notification for a timer's
  finds names where they are: Sets › Library (DJs), Sets › Following
  (channels).
- Which check is running lives in that store too, so leaving the tab and
  coming back keeps the buttons disabled — a second press cannot spend the
  units again. An upload's "get it" leaves the news alone when the fetch
  fails. A row's ▾ that is closed (or another row opened) before its
  uploads arrive stays closed. Watching a DJ already watched, or following a
  channel already followed, says so and spends nothing.
- The box under the tabs (`SetsFollowing.tsx`, with `SetsTabs.css`): a
  channel link or @handle follows it (2 units); a name asks first — Watch "…"
  as a DJ, or Search for a channel anyway (100 units). Today's paragraphs
  become one line under it.
- A DJ's row: the photo (or the initials on the DJ's hue), the name (opening
  the DJ page), "checked Oct 2" / "never checked", Check now · 100 units, ▾
  (everything found so far) and ✕ (unwatch, as today without asking); under
  it "checks" with the shared `SelectMenu` (Never / Daily / Weekly) and the
  settings' `ToggleSwitch` "fetch new sets automatically". A channel's row:
  its name, "@handle · checked …", Check now · 1–2 units, ▾ (its recent
  uploads, 1–2 units) and ✕, and its "checks". A channel's news shows under
  its row as "2 new sets" with Dismiss; "get it · 5–7 units" fetches and opens
  an upload and moves the channel's last-seen marker there, as today.
- What a check found is said in a toast: "2 new sets from Traumer — see
  Library", "Nothing new on Cercle", "4 new sets from 2 DJs — see Library".
  Search all refuses with a warning when the quota is short, as today.
  Following's checks keep their own busy state, so the library's box no
  longer reads "Reading…" while they run.
- Saved tracks (`SetsSaved.tsx`): the cue; the track over its set's title,
  which opens the set at the cue; the store links on hover (and while the row
  holds the keyboard); ♥ removes it. Copy list says how many it copied.
- Stats (`SetsStats.tsx`): the summary line, then the four cards two to a row
  (one under a 900px window); Quota shows what was spent, what is left of the
  day's units and when they reset.
- `SetsView.css` loses the rules only the old Following, Saved and Stats
  used.

## Stats

Four cards in a grid, in Home's quiet card style: **Most played** (artists and
counts), **Doing the rounds** (records in more than one set), **Most gaps**
(sets with the most IDs; a row opens the set), **Quota** (spent, left, resets
in). The summary line above them stays ("29 sets · 412 named tracks · 37 still
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-sets-redesign-design.md
git commit -m "docs(spec): Sets S4 as built"
```

---

### Task 9: Check

- [ ] **Step 1:** `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 461 passed; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 648 passed (649)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Following: paste a channel link → it is followed; type a DJ's name → "Watch … as a DJ" watches them.
  - A DJ's Check now (100 units): a toast says what it found; new sets show on the Library tab's New from DJs you watch. ▾ shows everything found for them; an interval and the "fetch automatically" switch stick after a restart.
  - A channel's Check now (1–2 units): its news under the row and the Following badge; "get it" opens the set; Dismiss clears the rest. A background check's news shows there too (the toast's "see Sets › Following").
  - Saved tracks: the set's title opens the set at that track, playing; Copy list; ♥ removes a track.
  - Stats: the four cards; a Most gaps row opens its set.
