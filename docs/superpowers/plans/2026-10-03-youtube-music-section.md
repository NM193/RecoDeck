# YouTube Music Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a Google account. Sync YouTube Music's Liked music automatically, and playlists the user adds by link. Show each track as Owned / Maybe / Missing against the RecoDeck library, with play-on-YouTube-Music, SelectedRecs and Copy, DJ sets kept apart in a Sets group one click from Sets, and a "new and missing" number in a YOUTUBE MUSIC sidebar section. Both YouTube Music and Spotify get a **Show in sidebar** switch.

**Architecture:**
- **Rust** stores YouTube Music data in four tables (migration 017), with the sync rules in `db/youtube_music.rs`.
- **Rust** talks to YouTube in `external/youtube_music.rs` (paging, parsing, the first-page check, durations) and to Google's sign-in in `external/youtube_auth.rs` (client file, PKCE with the client secret, tokens, the `id_token` email). The loopback listener is Spotify's (`external/spotify_auth.rs`), now taking its port (0 → the OS picks) and the service it names.
- **Rust** exposes commands in `commands/youtube_music.rs`, plus a loop that syncs every 30 minutes and emits `youtube-music-synced`. Every call is counted through the existing YouTube quota counter.
- **The frontend** reads YouTube titles into the matcher's shape (`src/lib/youtube-music/`) and works out ownership through `lib/spotify/ownership.ts`, which now takes a source-agnostic `{ id, parsed }`.
- **The view** is shared: `SpotifyView`'s header, toolbar, table and footer become `StreamingListView`. `SpotifyView` and the new `YouTubeMusicView` are thin wrappers.
- **One hook**, `useYouTubeMusic`, called from `App.tsx` beside `useSpotify`, feeds the sidebar section, the rail and the view. The library index comes from `useSpotify`, which loads the library once for both.

**Tech Stack:**
- Rust: Tauri 2, rusqlite 0.31, reqwest 0.12, axum 0.8, sha2, rand 0.8, tokio, tempfile (dev)
- Frontend: React 19 + TypeScript, Vitest (jsdom, **no** React Testing Library — do not add it), lucide-react via `src/components/Icon.tsx`

**Spec:** `docs/superpowers/specs/2026-10-03-youtube-music-section-design.md`. Read it first, and the Spotify spec it builds on (`2026-10-03-spotify-section-design.md`).

**Builds on:** the Spotify section as it is on `feat/dj-pages` at `9e2f4f6`. The code there is the model: where this plan's code looks like Spotify's, it is meant to.

**Checked:** every code block below was applied by script, task by task, to a copy of `9e2f4f6` outside the repo. After each task `cargo test`, `tsc` and `vitest` pass with exactly the counts the task gives; at the end `cargo clippy --all-targets` reports nothing in the files this plan touches, and `eslint src` reports only the base's 10 errors and 12 warnings. The "failing first" steps and the by-hand checks were not run. If a step's anchor text is not found, the branch changed after `9e2f4f6`: apply the step's intent and say so in the report.

**Rules for every task:**
- The working tree has unrelated user changes, including `src-tauri/Cargo.lock`, `.claude/*`, `.planning/*`, `.mcp.json` and untracked docs. **Never** `git add -A` or `git add .`. Add only the files the task names.
- This plan adds **no** crates and **no** npm packages. `tempfile` is already a dev-dependency. If `Cargo.toml`, `package.json` or `package-lock.json` changes, something went wrong.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Every commit block below already does this.
- `tsconfig` has `noUnusedLocals` / `noUnusedParameters`. Each task only declares what it uses.
- eslint has `eslint-plugin-react-hooks` v7. Never read or write a ref during render. Never call `setState` synchronously in an effect body (inside a `.then`, a timer or an event callback is fine). Never call `Date.now()` during render; use `useNow`.
- `npx eslint src` already reports **10 errors and 12 warnings** on the base commit, in `App.tsx` (2 warnings), `Player.tsx`, `TrackTable.tsx`, `WaveformVisualizer.tsx`, `ai/*`, `eq/EQModal.tsx`, `layout/NowPlayingBar.tsx`, `settings/SettingsContext.tsx`, `PlaylistDetailHeader.tsx`, `SettingsView.tsx`, `widgets/WidgetCatalog.tsx`, `lib/tracklist/text.ts` and `lib/tracklist/tracklist.test.ts`. Leave those as they are. Every other file this plan creates or changes must lint clean.
- Rust: a function added in one task and first called in a later one gives a `dead_code` warning in between. That is expected; it is gone by Task 10.
- Each task ends green: `cd src-tauri && cargo test`, `npx tsc --noEmit -p .`, `npx vitest run`. Baseline at `9e2f4f6`: 345 Rust tests, 317 TypeScript tests, all passing.

---

## Where the spec and the code disagree, and what this plan does

Nine places. The spec's intent wins each time; only the means change.

1. **"The title alone is matched, which usually ends Missing or Maybe."** The matcher (`matchOne` in `lib/tracklist/match.ts`) returns `null` for any row without an artist, so a bare YouTube title could only ever be Missing. The plan adds `matchTitleOnly` (a full title agreement, never strong) and an opt-in `titleOnly` flag on `ownershipOf` / the shared item shape. YouTube Music items with no artist pass it, and a same-titled file becomes a Maybe ("same title, artist unknown"). Spotify, DJ pages and Search do not pass it, so their answers do not move (Task 13).
2. **"Spotify's listener (`bind_listener`, `wait_for_callback`) takes the port and the service name."** `wait_for_callback` already answers only on `/callback`, takes an already-bound listener and names no service in its messages. The Spotify words live in `bind_listener` and in `code_from_callback` ("Spotify sign-in was cancelled"). So `bind_listener(port, service)` and `code_from_callback(params, state, service)` take the name; `wait_for_callback` is reused as it is (Task 3).
3. **"The footer says `2 unavailable`."** The spec's `ytm_lists` columns hold no unavailable count. The plan derives it: `track_count` is the available items read at the last full read (a video listed twice counted twice), so `total_results − track_count` is what YouTube counts but RecoDeck skipped. No extra column (Tasks 4, 14).
4. **The quota counter.** The spec says every call goes through `youtube_quota`. Its writer, `record_spend` in `commands/youtube.rs`, is private; it becomes `pub(crate)`. YouTube's own `map_api_error` returns `AppError` and knows neither `playlistNotFound` nor a 401, so YouTube Music has its own error type (`YtmError`, like `SpotifyError`) and counts its calls through the same counter (Tasks 7–9).
5. **"The loop waits for the next Pacific day, as the quota counter already knows how to."** The counter keys its buckets by `pacific_day`, but it does not know that YouTube refused. The plan stores the Pacific day of a `quotaExceeded` answer (`youtube_music_quota_day`); the loop skips while it equals today (Task 9).
6. **A sidebar section needs a colour.** Every sidebar section has a default colour, and `sidebarPrefs.test.ts` requires the colour menu's palette to contain every default. YouTube Music gets `#ff4e45`, which joins the palette: 9 swatches, the grid and the menu's width grow by one swatch (Task 18).
7. **"An open list of that service closes to the default view."** App decides which view shows from flags, so the Spotify / YouTube Music view is shown only while its service is connected **and** shown. Hidden, the view falls through to Home. The toggle lives in Settings, which closes any list anyway (Tasks 2, 18).
8. **Open in Sets "fetches it as a pasted link would".** A pasted link also stores the set and refreshes the quota line, so this path does too. Back from a DJ page to a set deleted meanwhile used to leave the Set tab empty; it now fetches the set again (Task 20).
9. **Disconnect.** Spotify's `clear_spotify` deletes the lists. YouTube Music's keeps every `ytm_lists` row, Liked music's too, with the sync state cleared. The next sync's first full read of each is a baseline (Task 4).

## Decisions where the spec left room

- **Liked videos (`LL`) and Liked music (`LM`) cannot be added by link.** Pasting either gets one line: Liked music is already there; Liked videos mixes in non-music.
- **Only 404, and 403 `playlistItemsNotAccessible`, mean a playlist is gone.** Any other error fails the whole sync, as Spotify's lost sign-in does. `quotaExceeded` is a 403 too but is read first, as its own kind.
- **A 401 is retried once with a fresh token**, in a sync and when adding a playlist, as Spotify does: a revoked grant kills the access token before it expires. Adding a playlist also handles a revoked grant (Reconnect bar) and a used-up quota (the loop waits for the next Pacific day) as a sync does.
- **The Title and Artist columns show the parsed title (with its mix) and the parsed artist**, or the channel without " - Topic" when no artist was read. The raw YouTube title is the tooltip, and the search box reads both.
- **"All playlists"' unavailable count is the sum over lists.** A deleted video in two lists counts twice.
- **Sets are left out of "All playlists"' count and every list count**, as the spec asks, and listed once each under Sets.
- **Adding a playlist holds the sync lock**, so a loop run cannot write the same list at the same time. The loop only tries the lock, so it skips that run.
- **A different client file signs the account out but keeps the rows** (Spotify's Client ID rule): its refresh token belongs to the old client.
- **The sidebar's Remove has no confirmation.** The playlist can be added again by link.
- **The email** falls back to "your Google account" if Google sends no `id_token` email.
- **A video stored without a length** (YouTube gives none for a premiere or a live stream) is asked for again at its list's next full read — at least daily — so one that later became a video moves into, or out of, the Sets group. A video with a length is never asked again.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/commands/spotify.rs` | modify | `spotify_show_in_sidebar`: in the status, in `should_sync`, and its command. `bind_listener` / `code_from_callback` call sites name Spotify. |
| `src-tauri/src/external/spotify_auth.rs` | modify | `bind_listener(port, service)`, `code_from_callback(params, state, service)`. |
| `src-tauri/src/db/migrations/017_youtube_music.sql` | create | Four tables and the verdict trigger. |
| `src-tauri/src/db/youtube_music.rs` | create | Storage: library dump, mark opened, verdicts, add / remove a playlist, clear on disconnect, baseline, applying a sync (the "new" rules, `unavailable_at`). |
| `src-tauri/src/db/mod.rs` | modify | `pub mod youtube_music;` and run migration 017. |
| `src-tauri/src/external/youtube_music.rs` | create | `YtmError`, item / duration / name parsing, playlist links, `YtmApi`, `fetch_changes`, `fetch_new_playlist`, `LiveApi` (counts units). |
| `src-tauri/src/external/youtube_auth.rs` | create | Client file, authorize URL, token endpoint, refresh, `id_token` email. |
| `src-tauri/src/external/mod.rs` | modify | Declare both modules. |
| `src-tauri/src/error.rs` | modify | `YouTubeMusicNotConnected`, `YouTubeMusicReconnect`, `YouTubeMusicLoginCancelled`, `YouTubeMusic(String)`. |
| `src-tauri/src/commands/youtube.rs` | modify | `record_spend` becomes `pub(crate)`. |
| `src-tauri/src/commands/youtube_music.rs` | create | `YouTubeMusicState`, tokens, sync, loop + event, status, every command. |
| `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` | modify | Register module, state, loop, commands. |
| `src/types/spotify.ts` | modify | `SpotifyStatus.showInSidebar`. |
| `src/types/youtubeMusic.ts` | create | IPC shapes, `LM` / `all` ids, the event name. |
| `src/types/ai.ts`, `src/lib/tauri-api.ts` | modify | Error kinds; command wrappers, the client-file dialog. |
| `src/components/settings/SpotifySection.tsx` | modify | Show in sidebar switch. |
| `src/lib/tracklist/match.ts` | modify | `matchTitleOnly`. |
| `src/lib/spotify/ownership.ts` (+ test) | modify | `classifyItems` over `{ id, parsed, titleOnly? }`; `classifyTracks` wraps it; the title-only Maybe. |
| `src/lib/spotify/newness.ts` | modify | `isNew` takes anything with `firstSeenAt`. |
| `src/lib/spotify/rows.ts` (+ test) | modify | `filterRowsBy` for any row; `countByStatus` for any row. |
| `src/lib/youtube-music/title.ts` (+ test) | create | YouTube title → artist / title / mix; matcher input; Copy, SelectedRecs, play URL. |
| `src/lib/youtube-music/rows.ts` (+ test) | create | Sets split (> 20 min), rows, unavailable count, list counts, classification, sync wording. |
| `src/lib/youtube-music/newness.ts` (+ test) | create | New-and-missing, sets left out. |
| `src/components/youtube-music/useYouTubeMusic.ts` | create | The hook (status, rows, actions) and its ownership half. |
| `src/components/youtube-music/YouTubeMusicLists.tsx` | create | Sidebar / flyout items, + Add playlist, right-click Remove. |
| `src/components/youtube-music/YouTubeMusicRowActions.tsx` | create | Status cell: play on YouTube Music, SelectedRecs, Copy, Yes / No. |
| `src/components/spotify/SpotifyRowActions.tsx` | modify | `VerdictButtons` pulled out, shared. |
| `src/components/views/StreamingListView.tsx` | create | Header, toolbar, table, footer for any service. |
| `src/components/views/SpotifyView.tsx` | modify | Thin wrapper over `StreamingListView`. |
| `src/components/views/SpotifyView.css` | modify | `.spotify-header__notice`. |
| `src/components/views/YouTubeMusicView.tsx`, `YouTubeMusicView.css` | create | The YouTube Music wrapper, red cover, Sets group. |
| `src/lib/sidebarPrefs.ts` (+ test) | modify | `'youtube-music'` section, view, colour, label, palette. |
| `src/components/layout/sidebarTypes.ts`, `Sidebar.tsx`, `SidebarRail.tsx`, `Sidebar.css` | modify | YOUTUBE MUSIC section, rail icon with its number and flyout, swatch grid. |
| `src/components/settings/YouTubeMusicSection.tsx`, `src/components/views/SettingsView.tsx` | create / modify | Settings → YouTube Music. |
| `src/components/views/SetsView.tsx` | modify | Open a set that is not stored by fetching it. |
| `src/App.tsx` | modify | Show-in-sidebar gating, `streamList` navigation state, both hooks, the view. |

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Start the work on top of the DJ pages branch**

```bash
git switch feat/dj-pages
git switch -c feat/youtube-music
```

Expected: `Switched to a new branch 'feat/youtube-music'`. The user's uncommitted changes come along untouched.

- [ ] **Step 2: Confirm a clean baseline**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: 27 files, 317 tests pass; no type errors.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `test result: ok. 345 passed` for the lib, then two `0 passed` lines.

---

### Task 1: Show in sidebar — the Spotify side in Rust

**Files:**
- Modify: `src-tauri/src/commands/spotify.rs`
- Modify: `src-tauri/src/lib.rs` (command registration)

The switch is about the sidebar, not the connection. Off, the loop skips its runs; the refresh token and the stored rows stay, and DJ pages and Search keep using the account (`spotify_token`, `has_account` do not look at it). The key is absent until switched, and absent means on.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests` in `commands/spotify.rs`)

```rust
    #[test]
    fn the_show_in_sidebar_switch_is_on_until_switched_off() {
        let db = fresh();
        assert!(read_status(&db).unwrap().show_in_sidebar);
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "0").unwrap();
        assert!(!read_status(&db).unwrap().show_in_sidebar);
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "1").unwrap();
        assert!(read_status(&db).unwrap().show_in_sidebar);
    }

    #[test]
    fn a_hidden_section_makes_the_loop_skip_but_keeps_the_account() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "0").unwrap();
        assert!(!should_sync(&db));
        assert!(read_status(&db).unwrap().connected);
        assert!(has_account(&db), "DJ pages and Search still use the account");

        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "1").unwrap();
        assert!(should_sync(&db));

        // A preference, not part of the account: disconnecting leaves it.
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "0").unwrap();
        forget_account(&db).unwrap();
        assert!(!read_status(&db).unwrap().show_in_sidebar);
    }

    #[test]
    fn a_status_change_is_reported_as_an_unchanged_sync() {
        let db = fresh();
        db.set_setting(LAST_SYNCED_SETTING, "7").unwrap();
        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        let payload = SyncedPayload::from_status(&read_status(&db).unwrap());
        assert!(!payload.changed);
        assert_eq!(payload.last_synced_at, Some(7));
        assert!(payload.needs_reconnect);
    }
```

In the existing `a_fresh_install_is_not_connected` test, add `show_in_sidebar: true,` directly under `needs_reconnect: false,` in the expected `SpotifyStatusDTO`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test commands::spotify 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find value SHOW_IN_SIDEBAR_SETTING`, `no field show_in_sidebar`, `no function from_status`.

- [ ] **Step 3: The setting and the loop rule**

Directly under `const NEEDS_RECONNECT_SETTING: &str = "spotify_needs_reconnect";` add:

```rust
/// "0" hides the SPOTIFY section and pauses the loop. Absent, it shows: the
/// switch is on until the user turns it off.
const SHOW_IN_SIDEBAR_SETTING: &str = "spotify_show_in_sidebar";
```

Replace `should_sync` with:

```rust
/// Whether the SPOTIFY section is in the sidebar. Only the section and the
/// loop read it: DJ pages and Search use the account either way.
fn shows_in_sidebar(db: &Database) -> bool {
    !matches!(setting(db, SHOW_IN_SIDEBAR_SETTING), Ok(Some(value)) if value == "0")
}

/// Connected, not waiting for the user to sign in again, and in the sidebar.
fn should_sync(db: &Database) -> bool {
    matches!(setting(db, REFRESH_TOKEN_SETTING), Ok(Some(_)))
        && matches!(setting(db, NEEDS_RECONNECT_SETTING), Ok(None))
        && shows_in_sidebar(db)
}
```

- [ ] **Step 4: The status carries it**

In `SpotifyStatusDTO`, directly under `pub needs_reconnect: bool,` add:

```rust
    /// Settings → Spotify → Show in sidebar.
    pub show_in_sidebar: bool,
```

In `read_status`, directly under `needs_reconnect: setting(db, NEEDS_RECONNECT_SETTING)?.is_some(),` add:

```rust
        show_in_sidebar: shows_in_sidebar(db),
```

Inside the existing `impl SyncedPayload { … }` block, below `cleared`, add:

```rust
    /// Nothing was synced, but the status changed (the switch): the sidebar,
    /// the view and Settings read it again. `changed` is false, so no rows reload.
    fn from_status(status: &SpotifyStatusDTO) -> Self {
        Self {
            changed: false,
            last_synced_at: status.last_synced_at,
            error: status.last_error.clone(),
            error_kind: status.last_error_kind,
            needs_reconnect: status.needs_reconnect,
        }
    }
```

- [ ] **Step 5: The command**

Directly above `#[tauri::command]\npub async fn sync_spotify_now`, add:

```rust
/// Show in sidebar. Off hides the section and pauses the loop; the sign-in and
/// the stored lists stay. On again shows the stored lists at once and syncs.
#[tauri::command]
pub async fn set_spotify_show_in_sidebar(
    app: AppHandle,
    state: State<'_, AppState>,
    show: bool,
) -> Result<SpotifyStatusDTO, AppError> {
    let status = with_db(&state, |db| {
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, if show { "1" } else { "0" })
            .map_err(db_err)?;
        read_status(db)
    })?;
    let _ = app.emit(SYNCED_EVENT, &SyncedPayload::from_status(&status));
    if show && status.connected {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = run_sync(&handle).await;
        });
    }
    Ok(status)
}
```

In `src-tauri/src/lib.rs`, directly under `commands::spotify::play_spotify_track,` add:

```rust
            commands::spotify::set_spotify_show_in_sidebar,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test commands::spotify 2>&1 | tail -5`
Expected: PASS — the old Spotify command tests and the 3 new ones.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 348 passed`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/spotify.rs src-tauri/src/lib.rs
git commit -m "feat(spotify): a Show in sidebar switch that hides the section and pauses the sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Show in sidebar — Settings → Spotify, and the sidebar follows it

**Files:**
- Modify: `src/types/spotify.ts`
- Modify: `src/lib/tauri-api.ts`
- Modify: `src/components/settings/SpotifySection.tsx`
- Modify: `src/App.tsx`

No new logic to test: the rule is in Rust (Task 1). `useSpotify` already re-reads the status on every `spotify-synced`, which the command emits, so the hook needs no change.

- [ ] **Step 1: The type**

In `src/types/spotify.ts`, in `SpotifyStatus`, directly under `needsReconnect: boolean` add:

```ts
  /**
   * Settings → Spotify → Show in sidebar. Off hides the section and pauses
   * the sync; DJ pages and Search keep using the account.
   */
  showInSidebar: boolean
```

- [ ] **Step 2: The wrapper**

In `src/lib/tauri-api.ts`, directly under the `disconnectSpotify` method add:

```ts
  /** Show in sidebar. The sidebar learns it from the `spotify-synced` event this sends. */
  async setSpotifyShowInSidebar(show: boolean): Promise<SpotifyStatus> {
    return await invoke('set_spotify_show_in_sidebar', { show })
  },
```

- [ ] **Step 3: The switch in Settings → Spotify**

In `src/components/settings/SpotifySection.tsx`, add to the imports:

```ts
import { ToggleSwitch } from './ToggleSwitch'
```

Directly above `{status?.connected && (` (the Last sync block), add:

```tsx
      <div className="sv-setting-row" style={{ marginTop: '1.25rem' }}>
        <div className="sv-setting-row__info">
          <span className="sv-setting-row__label">Show in sidebar</span>
          <span className="sv-setting-row__description">
            Off hides the SPOTIFY section and pauses its sync. DJ pages and
            Search keep using your account.
          </span>
        </div>
        <ToggleSwitch
          checked={status?.showInSidebar ?? true}
          disabled={status === null}
          onChange={(show) => {
            setError(null)
            tauriApi
              .setSpotifyShowInSidebar(show)
              .then(setStatus)
              .catch((e: unknown) => setError(getErrorMessage(e)))
          }}
        />
      </div>
```

- [ ] **Step 4: App hides the section and the view**

In `src/App.tsx`, replace

```ts
  // The Spotify view only exists while an account is connected.
  const shownSpotifyList = spotify.connected ? spotifyListId : null
```

with

```ts
  // The SPOTIFY section and its view exist while an account is connected and
  // Show in sidebar is on. Off, an open list falls through to the default
  // view; DJ pages and Search still use the account.
  const spotifyShown =
    spotify.connected && spotify.status?.showInSidebar !== false
  const shownSpotifyList = spotifyShown ? spotifyListId : null
```

In the `<Sidebar … />` props, replace `spotify.connected` at the start of the `spotify={…}` prop with `spotifyShown`:

```tsx
      spotify={
        spotifyShown
          ? {
```

- [ ] **Step 5: Check**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/components/settings/SpotifySection.tsx src/types/spotify.ts`
Expected: no type errors; 317 tests pass; no eslint output.

- [ ] **Step 6: Commit**

```bash
git add src/types/spotify.ts src/lib/tauri-api.ts src/components/settings/SpotifySection.tsx src/App.tsx
git commit -m "feat(spotify): Show in sidebar in Settings; the section, the rail icon and the view follow it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The loopback listener takes its port and the service it signs in to

**Files:**
- Modify: `src-tauri/src/external/spotify_auth.rs`
- Modify: `src-tauri/src/commands/spotify.rs` (two call sites)

Google accepts any loopback port for a Desktop client, so YouTube Music binds port 0 and reads back what the OS gave. `wait_for_callback` is reused unchanged: it already serves `/callback` on whatever listener it is handed, and its messages name no service.

- [ ] **Step 1: Write the failing tests** (in `spotify_auth.rs`'s `mod tests`)

Change the existing calls to the new signatures:
- in `a_cancelled_login_stops_listening_and_frees_the_port` and `the_port_is_free_again_once_the_login_is_over`: `bind_listener(port)` → `bind_listener(port, "Spotify")`;
- in `a_taken_port_is_said_in_one_line`: `bind_listener(port)` → `bind_listener(port, "Spotify")`;
- in `the_code_comes_back_with_this_logins_state`, `an_answer_for_another_login_is_refused`, `a_cancelled_sign_in_says_so`, `no_code_is_an_error`: add `, "Spotify"` as the last argument of every `code_from_callback(…)`.

Then append:

```rust
    #[tokio::test]
    async fn port_zero_listens_on_whatever_port_the_os_gives_and_answers_on_callback() {
        let listener = bind_listener(0, "YouTube Music").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        assert_ne!(port, 0);
        let waiting = tokio::spawn(wait_for_callback(listener, Duration::from_secs(5), never()));

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        client
            .get(format!("http://127.0.0.1:{port}/callback?code=C&state=S"))
            .send()
            .await
            .unwrap();
        let params = waiting.await.unwrap().unwrap();
        assert_eq!(params.get("code").map(String::as_str), Some("C"));
    }

    #[tokio::test]
    async fn a_taken_port_names_the_service_that_cannot_sign_in() {
        let holder = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = holder.local_addr().unwrap().port();
        let err = bind_listener(port, "YouTube Music").await.unwrap_err();
        assert!(err.contains("YouTube Music"), "{err}");
        assert!(!err.contains("Spotify"), "{err}");
    }

    #[test]
    fn the_sign_in_answers_name_the_service() {
        assert_eq!(
            code_from_callback(&params(&[("error", "access_denied"), ("state", "S")]), "S", "YouTube Music"),
            Err("YouTube Music sign-in was cancelled".into())
        );
        let refused = code_from_callback(&params(&[("error", "admin_policy_enforced"), ("state", "S")]), "S", "YouTube Music")
            .unwrap_err();
        assert_eq!(refused, "YouTube Music refused the sign-in: admin_policy_enforced");
        let empty = code_from_callback(&params(&[("state", "S")]), "S", "YouTube Music").unwrap_err();
        assert!(empty.starts_with("YouTube Music sent no sign-in code"), "{empty}");
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::spotify_auth 2>&1 | tail -20`
Expected: FAIL to compile — `this function takes 1 argument but 2 arguments were supplied` (and 3 for `code_from_callback`).

- [ ] **Step 3: `code_from_callback` names the service**

Replace `code_from_callback` with:

```rust
/// The code the browser brought back, if it belongs to this login. `service`
/// is what the user signed in to: "Spotify", "YouTube Music".
pub fn code_from_callback(
    params: &HashMap<String, String>,
    expected_state: &str,
    service: &str,
) -> Result<String, String> {
    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err("The sign-in answer did not match this login — press Connect to try again".to_string());
    }
    if let Some(error) = params.get("error") {
        return Err(if error == "access_denied" {
            format!("{service} sign-in was cancelled")
        } else {
            format!("{service} refused the sign-in: {error}")
        });
    }
    params
        .get("code")
        .filter(|code| !code.is_empty())
        .cloned()
        .ok_or_else(|| format!("{service} sent no sign-in code — press Connect to try again"))
}
```

- [ ] **Step 4: `bind_listener` takes the service, and port 0**

Replace `bind_listener` with:

```rust
/// Binds the redirect port, or says in one line why it cannot. Port 0 takes
/// whatever port the OS gives — read it back from `local_addr`.
pub async fn bind_listener(port: u16, service: &str) -> Result<TcpListener, String> {
    TcpListener::bind(("127.0.0.1", port)).await.map_err(|_| {
        if port == 0 {
            format!("Could not open a local port for the {service} sign-in — press Connect again")
        } else {
            format!(
                "Port {port} is in use by another app, so {service} cannot hand the login back — close that app and press Connect again"
            )
        }
    })
}
```

- [ ] **Step 5: Spotify's call sites**

In `commands/spotify.rs` → `connect_spotify`:
- `spotify_auth::bind_listener(spotify_auth::REDIRECT_PORT)` → `spotify_auth::bind_listener(spotify_auth::REDIRECT_PORT, "Spotify")`
- `spotify_auth::code_from_callback(&params, &login_state)` → `spotify_auth::code_from_callback(&params, &login_state, "Spotify")`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 351 passed`. Spotify's messages read exactly as before (`a_cancelled_sign_in_says_so` still expects "Spotify sign-in was cancelled").

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/external/spotify_auth.rs src-tauri/src/commands/spotify.rs
git commit -m "refactor(auth): the loopback listener takes its port (0 for any) and the service it signs in to

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Migration 017 and the storage basics

**Files:**
- Create: `src-tauri/src/db/migrations/017_youtube_music.sql`
- Create: `src-tauri/src/db/youtube_music.rs`
- Modify: `src-tauri/src/db/mod.rs` (module declaration; the end of `run_migrations`)

As with Spotify, the storage is its own file with a second `impl Database` block; a child module can read `Database`'s private `conn`. `db/spotify.rs`'s transaction helper is private to that module, so this file has its own, like `db/dj.rs`.

- [ ] **Step 1: The migration**

```sql
-- src-tauri/src/db/migrations/017_youtube_music.sql
-- Migration 017: the YouTube Music section
--
-- Liked music and the playlists added by link, kept so the YouTube Music view
-- can say which tracks are already in the library. Ownership is not stored: it
-- is worked out against the library every time, as with Spotify.
--
-- Uses CREATE TABLE IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS ytm_tracks (
    video_id    TEXT PRIMARY KEY,
    title       TEXT NOT NULL,           -- as YouTube writes it: "Soulva - Odyssey (Original Mix)"
    channel     TEXT NOT NULL,           -- the video owner's channel: "Extrawelt - Topic"
    duration_ms INTEGER                  -- from `videos`; over 20 minutes is a set, not a track
);

-- 'LM' for Liked music (YouTube's own id for it), otherwise the playlist id.
CREATE TABLE IF NOT EXISTS ytm_lists (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    position       INTEGER NOT NULL,     -- Liked music 0, then playlists in the order they were added
    -- Available items at the last full read, a video listed twice counted
    -- twice. total_results minus this is what YouTube counts but RecoDeck
    -- skipped: deleted and private videos.
    track_count    INTEGER NOT NULL DEFAULT 0,
    total_results  INTEGER,              -- pageInfo.totalResults at the last full read
    first_page_ids TEXT,                 -- JSON array: every video id on page one at the last full read
    full_synced_at INTEGER,              -- unix ms of the last full read; NULL until the first
    -- Unix ms, never empty: a list's first full read sets it, so nothing that
    -- was already in it reads as new.
    last_opened_at INTEGER NOT NULL,
    unavailable_at INTEGER               -- set when the playlist answers 404; cleared when it reads again
);

CREATE TABLE IF NOT EXISTS ytm_list_tracks (
    list_id       TEXT NOT NULL REFERENCES ytm_lists(id) ON DELETE CASCADE,
    -- No cascade, as with Spotify: only videos in no list are ever deleted.
    video_id      TEXT NOT NULL REFERENCES ytm_tracks(video_id),
    added_at      TEXT,                  -- YouTube's snippet.publishedAt: when it was added (ISO)
    first_seen_at INTEGER NOT NULL,      -- RecoDeck's: the sync that first stored this pair (unix ms)
    PRIMARY KEY (list_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_ytm_list_tracks_video ON ytm_list_tracks(video_id);

-- Yes / No answered on a Maybe row. Kept when the video leaves every list, so
-- liking it again does not ask again.
CREATE TABLE IF NOT EXISTS ytm_match_verdicts (
    video_id         TEXT NOT NULL,
    library_track_id INTEGER NOT NULL,
    verdict          TEXT NOT NULL CHECK (verdict IN ('yes', 'no')),
    PRIMARY KEY (video_id, library_track_id)
);

-- As with Spotify: tracks.id is reused once the highest row is deleted, so a
-- deleted file's verdicts go with it.
CREATE TRIGGER IF NOT EXISTS trg_ytm_verdicts_track_deleted
AFTER DELETE ON tracks
BEGIN
    DELETE FROM ytm_match_verdicts WHERE library_track_id = OLD.id;
END;
```

- [ ] **Step 2: Run it from `run_migrations`**

In `src-tauri/src/db/mod.rs`, directly under `pub mod spotify;` add:

```rust
pub mod youtube_music;
```

At the end of `run_migrations`, directly under the migration 016 block and above `Ok(())`, add:

```rust
        // Migration 017: the YouTube Music section
        // Uses CREATE TABLE IF NOT EXISTS — safe to re-run
        self.conn
            .execute_batch(include_str!("migrations/017_youtube_music.sql"))?;
```

- [ ] **Step 3: Write the failing tests**

Create `src-tauri/src/db/youtube_music.rs` with only this, for now:

```rust
// src-tauri/src/db/youtube_music.rs
//! Storage for the YouTube Music section: the videos, which list each one is
//! in, and the Yes / No answers given on Maybe rows.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Track;
    use rusqlite::params;

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
            title: Some("Odyssey".to_string()),
            artist: Some("Soulva".to_string()),
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

    fn seed_list(db: &Database, id: &str, position: i64) {
        db.conn
            .execute(
                "INSERT INTO ytm_lists (id, name, position, last_opened_at) VALUES (?1, ?1, ?2, 100)",
                params![id, position],
            )
            .unwrap();
    }

    /// A video in a list, as a sync would have left it.
    fn seed_pair(db: &Database, list_id: &str, video_id: &str) {
        db.conn
            .execute(
                "INSERT OR IGNORE INTO ytm_tracks (video_id, title, channel) VALUES (?1, 'T', 'C')",
                [video_id],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO ytm_list_tracks (list_id, video_id, added_at, first_seen_at) VALUES (?1, ?2, NULL, 100)",
                params![list_id, video_id],
            )
            .unwrap();
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    fn opened(db: &Database) -> Vec<(String, i64)> {
        db.get_ytm_library()
            .unwrap()
            .lists
            .into_iter()
            .map(|l| (l.id, l.last_opened_at))
            .collect()
    }

    #[test]
    fn migration_017_runs_twice_and_starts_empty() {
        let db = fresh();
        db.run_migrations().expect("second run");
        let dump = db.get_ytm_library().unwrap();
        assert!(dump.lists.is_empty());
        assert!(dump.tracks.is_empty());
        assert!(dump.entries.is_empty());
        assert!(dump.verdicts.is_empty());
    }

    #[test]
    fn playlists_follow_liked_music_in_the_order_they_were_added() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PLb", "First added", 100).unwrap();
        db.add_ytm_list("PLa", "Second added", 100).unwrap();
        let lists = db.get_ytm_library().unwrap().lists;
        assert_eq!(
            lists.iter().map(|l| (l.id.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, 0), ("PLb", 1), ("PLa", 2)]
        );
        assert_eq!(lists[1].name, "First added");
        assert_eq!(lists[1].total_results, None);
        assert_eq!(lists[1].unavailable_at, None);
        assert!(db.has_ytm_list("PLa").unwrap());
        assert!(!db.has_ytm_list("PLz").unwrap());
    }

    #[test]
    fn a_playlist_added_before_liked_music_was_synced_still_comes_after_it() {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        assert_eq!(db.get_ytm_library().unwrap().lists[0].position, 1);
    }

    #[test]
    fn opening_a_list_marks_only_that_list_and_all_marks_every_list() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        seed_list(&db, "PL1", 1);
        db.mark_ytm_list_opened("PL1", 500).unwrap();
        assert_eq!(opened(&db), vec![(LIKED_MUSIC_ID.to_string(), 100), ("PL1".to_string(), 500)]);
        db.mark_ytm_list_opened(ALL_LISTS_ID, 700).unwrap();
        assert_eq!(opened(&db), vec![(LIKED_MUSIC_ID.to_string(), 700), ("PL1".to_string(), 700)]);
    }

    #[test]
    fn a_verdict_is_stored_changed_and_checked() {
        let db = fresh();
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("v1", file, "no").unwrap();
        db.set_ytm_verdict("v1", file, "yes").unwrap();
        assert_eq!(
            db.get_ytm_library().unwrap().verdicts,
            vec![YtmVerdictRow { video_id: "v1".to_string(), library_track_id: file, verdict: "yes".to_string() }]
        );
        assert!(db.set_ytm_verdict("v1", file, "maybe").is_err());
    }

    #[test]
    fn a_deleted_files_verdicts_go_with_it() {
        let db = fresh();
        let gone = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("v1", gone, "yes").unwrap();
        db.conn.execute("DELETE FROM tracks WHERE id = ?1", [gone]).unwrap();
        assert_eq!(count(&db, "ytm_match_verdicts"), 0);
    }

    #[test]
    fn removing_a_playlist_drops_its_rows_and_its_videos_in_no_other_list_but_keeps_verdicts() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        seed_pair(&db, LIKED_MUSIC_ID, "shared");
        seed_pair(&db, "PL1", "shared");
        seed_pair(&db, "PL1", "only");
        let file = db.create_track(&library_track("/music/a.mp3")).unwrap();
        db.set_ytm_verdict("only", file, "no").unwrap();

        db.remove_ytm_list("PL1").unwrap();

        let dump = db.get_ytm_library().unwrap();
        assert_eq!(dump.lists.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), [LIKED_MUSIC_ID]);
        assert_eq!(dump.tracks.iter().map(|t| t.video_id.as_str()).collect::<Vec<_>>(), ["shared"]);
        assert_eq!(dump.entries.len(), 1);
        assert_eq!(dump.verdicts.len(), 1, "a re-added playlist does not ask again");
    }

    #[test]
    fn disconnecting_forgets_the_videos_and_answers_but_keeps_the_added_playlists() {
        let db = fresh();
        seed_list(&db, LIKED_MUSIC_ID, 0);
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        db.conn
            .execute(
                "UPDATE ytm_lists SET track_count = 3, total_results = 4, first_page_ids = '[\"a\"]',
                        full_synced_at = 50, unavailable_at = 60",
                [],
            )
            .unwrap();
        seed_pair(&db, "PL1", "a");
        db.set_ytm_verdict("a", 1, "yes").unwrap();
        db.set_setting("youtube_api_key", "kept").unwrap();

        db.clear_ytm_account().unwrap();

        for table in ["ytm_list_tracks", "ytm_tracks", "ytm_match_verdicts"] {
            assert_eq!(count(&db, table), 0, "{table} should be empty");
        }
        let state: (i64, Option<i64>, Option<String>, Option<i64>, Option<i64>) = db
            .conn
            .query_row(
                "SELECT track_count, total_results, first_page_ids, full_synced_at, unavailable_at
                 FROM ytm_lists WHERE id = 'PL1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(state, (0, None, None, None, None), "sync state cleared");
        let lists = db.get_ytm_library().unwrap().lists;
        assert_eq!(
            lists.iter().map(|l| (l.id.as_str(), l.name.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, LIKED_MUSIC_ID, 0), ("PL1", "Deep", 1)],
            "the playlists stay, named and in order"
        );
        assert_eq!(db.get_setting("youtube_api_key").unwrap().as_deref(), Some("kept"));
    }
}
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd src-tauri && cargo test db::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find type Database`, `no method named get_ytm_library`, and so on.

- [ ] **Step 5: The storage basics**

Insert between the module comment and `#[cfg(test)]`:

```rust
//!
//! Ownership is not stored, as with Spotify: the frontend works it out against
//! the library on every change, so a track turns Owned the moment its file is
//! scanned.

use super::Database;
use rusqlite::{params, Result, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

/// Liked music's id — YouTube's own, so it reads like any playlist id.
pub const LIKED_MUSIC_ID: &str = "LM";
pub const LIKED_MUSIC_NAME: &str = "Liked music";
/// "All playlists" — not a stored list, every list at once.
pub const ALL_LISTS_ID: &str = "all";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmTrack {
    pub video_id: String,
    /// As YouTube writes it: "Soulva - Odyssey (Original Mix)".
    pub title: String,
    /// The video owner's channel: "Extrawelt - Topic".
    pub channel: String,
    /// None until `videos` answered for it.
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmListRow {
    pub id: String,
    pub name: String,
    pub position: i64,
    /// Available items at the last full read, a video listed twice counted twice.
    pub track_count: i64,
    /// YouTube's `totalResults` at the last full read: unavailable items included.
    pub total_results: Option<i64>,
    pub last_opened_at: i64,
    /// Unix ms; set while the playlist answers 404.
    pub unavailable_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmEntryRow {
    pub list_id: String,
    pub video_id: String,
    pub added_at: Option<String>,
    pub first_seen_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmVerdictRow {
    pub video_id: String,
    pub library_track_id: i64,
    pub verdict: String,
}

/// Everything the frontend needs, in one call.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmLibraryDump {
    pub lists: Vec<YtmListRow>,
    pub tracks: Vec<YtmTrack>,
    pub entries: Vec<YtmEntryRow>,
    pub verdicts: Vec<YtmVerdictRow>,
}

impl Database {
    pub fn get_ytm_library(&self) -> Result<YtmLibraryDump> {
        // The trigger removes a deleted file's verdicts; this is the safety net.
        self.conn.execute(
            "DELETE FROM ytm_match_verdicts WHERE library_track_id NOT IN (SELECT id FROM tracks)",
            [],
        )?;

        let lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, name, position, track_count, total_results, last_opened_at, unavailable_at
                 FROM ytm_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmListRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    position: r.get(2)?,
                    track_count: r.get(3)?,
                    total_results: r.get(4)?,
                    last_opened_at: r.get(5)?,
                    unavailable_at: r.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let tracks = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id, title, channel, duration_ms FROM ytm_tracks")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmTrack {
                    video_id: r.get(0)?,
                    title: r.get(1)?,
                    channel: r.get(2)?,
                    duration_ms: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let entries = {
            let mut stmt = self
                .conn
                .prepare("SELECT list_id, video_id, added_at, first_seen_at FROM ytm_list_tracks")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmEntryRow {
                    list_id: r.get(0)?,
                    video_id: r.get(1)?,
                    added_at: r.get(2)?,
                    first_seen_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let verdicts = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id, library_track_id, verdict FROM ytm_match_verdicts")?;
            let rows = stmt.query_map([], |r| {
                Ok(YtmVerdictRow {
                    video_id: r.get(0)?,
                    library_track_id: r.get(1)?,
                    verdict: r.get(2)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        Ok(YtmLibraryDump { lists, tracks, entries, verdicts })
    }

    /// Opening a list marks what is in it seen. `ALL_LISTS_ID` marks every list.
    pub fn mark_ytm_list_opened(&self, list_id: &str, now_ms: i64) -> Result<()> {
        if list_id == ALL_LISTS_ID {
            self.conn.execute("UPDATE ytm_lists SET last_opened_at = ?1", [now_ms])?;
        } else {
            self.conn.execute(
                "UPDATE ytm_lists SET last_opened_at = ?1 WHERE id = ?2",
                params![now_ms, list_id],
            )?;
        }
        Ok(())
    }

    /// `verdict` is "yes" or "no"; the table refuses anything else.
    pub fn set_ytm_verdict(&self, video_id: &str, library_track_id: i64, verdict: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO ytm_match_verdicts (video_id, library_track_id, verdict)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(video_id, library_track_id) DO UPDATE SET verdict = excluded.verdict",
            params![video_id, library_track_id, verdict],
        )?;
        Ok(())
    }

    pub fn has_ytm_list(&self, id: &str) -> Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM ytm_lists WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )
    }

    /// A playlist added by link goes after every other list. Liked music is 0,
    /// so the first one added is 1 whether or not Liked music is stored yet.
    /// `now_ms` is its "new" baseline until its first full read sets it again.
    pub fn add_ytm_list(&self, id: &str, name: &str, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO ytm_lists (id, name, position, last_opened_at)
             VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM ytm_lists), ?3)",
            params![id, name, now_ms],
        )?;
        Ok(())
    }

    /// Removing a playlist: its pairs and its row, then the videos now in no
    /// list. Verdicts stay, so adding it back does not ask again.
    pub fn remove_ytm_list(&self, id: &str) -> Result<()> {
        let tx = self.ytm_immediate_transaction()?;
        self.conn.execute("DELETE FROM ytm_list_tracks WHERE list_id = ?1", [id])?;
        self.conn.execute("DELETE FROM ytm_lists WHERE id = ?1", [id])?;
        self.delete_ytm_orphans()?;
        tx.commit()
    }

    /// Disconnecting: the videos, the pairs and the verdicts go. The lists stay,
    /// with their sync state cleared — unlike Spotify's, playlists added by link
    /// cannot come back on their own — so connecting again reads each one as a
    /// first sync. Nothing on YouTube is touched.
    pub fn clear_ytm_account(&self) -> Result<()> {
        let tx = self.ytm_immediate_transaction()?;
        self.conn.execute_batch(
            "DELETE FROM ytm_list_tracks;
             DELETE FROM ytm_tracks;
             DELETE FROM ytm_match_verdicts;
             UPDATE ytm_lists SET track_count = 0, total_results = NULL, first_page_ids = NULL,
                                  full_synced_at = NULL, unavailable_at = NULL;",
        )?;
        tx.commit()
    }

    /// Videos in no list. Their verdicts stay.
    fn delete_ytm_orphans(&self) -> Result<()> {
        self.conn.execute(
            "DELETE FROM ytm_tracks WHERE video_id NOT IN (SELECT video_id FROM ytm_list_tracks)",
            [],
        )?;
        Ok(())
    }

    /// Takes the write lock up front, as `db/spotify.rs` does: the companion
    /// server opens a second connection to the same file.
    fn ytm_immediate_transaction(&self) -> Result<Transaction<'_>> {
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)
    }
}

```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test db::youtube_music 2>&1 | tail -5`
Expected: PASS — 8 tests.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 359 passed`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/migrations/017_youtube_music.sql src-tauri/src/db/youtube_music.rs src-tauri/src/db/mod.rs
git commit -m "feat(youtube-music): migration 017 and the storage basics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Applying a sync — first reads are baselines, vanished playlists are marked

**Files:**
- Modify: `src-tauri/src/db/youtube_music.rs`

No snapshot id exists, so what a sync found per list is one of three things: unchanged (its first page matched), read in full, or gone (404). Durations come along for the videos not stored before. The rules:
- a list's first full read is its baseline: `last_opened_at` = now, so nothing it already held is new;
- a full read keeps each pair's `first_seen_at`, adds what is new, drops what left;
- gone marks `unavailable_at` once and keeps the rows; the next successful read (full or unchanged) clears it;
- a result for a playlist removed while the sync ran is dropped, not brought back;
- a duration is only ever filled in.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`)

```rust
    // --- applying a sync ----------------------------------------------

    use std::collections::{HashMap, HashSet};

    fn entry(id: &str) -> YtmEntry {
        YtmEntry {
            track: YtmTrack {
                video_id: id.to_string(),
                title: format!("Artist - Title {id}"),
                channel: "Label".to_string(),
                duration_ms: None,
            },
            added_at: Some("2026-10-01T09:00:00Z".to_string()),
        }
    }

    fn full(ids: &[&str]) -> ListChange {
        ListChange::Full {
            entries: ids.iter().map(|id| entry(id)).collect(),
            total_results: ids.len() as i64,
            first_page_ids: ids.iter().map(|id| id.to_string()).collect(),
        }
    }

    fn sync(lists: Vec<(&str, ListChange)>) -> SyncChanges {
        SyncChanges {
            lists: lists.into_iter().map(|(id, change)| (id.to_string(), change)).collect(),
            durations: HashMap::new(),
        }
    }

    /// The ids that would carry a dot: first seen later than the list's opening.
    fn new_ids(db: &Database, list_id: &str) -> Vec<String> {
        let dump = db.get_ytm_library().unwrap();
        let opened = dump.lists.iter().find(|l| l.id == list_id).expect("list stored").last_opened_at;
        let mut ids: Vec<String> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == list_id && e.first_seen_at > opened)
            .map(|e| e.video_id.clone())
            .collect();
        ids.sort();
        ids
    }

    fn first_seen(db: &Database, list_id: &str, video_id: &str) -> i64 {
        db.conn
            .query_row(
                "SELECT first_seen_at FROM ytm_list_tracks WHERE list_id = ?1 AND video_id = ?2",
                params![list_id, video_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    fn list(db: &Database, id: &str) -> YtmListRow {
        db.get_ytm_library().unwrap().lists.into_iter().find(|l| l.id == id).expect("list stored")
    }

    /// Liked music [a, b] and playlist PL1 [b, c], first synced at 1,000.
    fn baseline_db() -> Database {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 1_000).unwrap();
        db.apply_ytm_sync(
            &sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"])), ("PL1", full(&["b", "c"]))]),
            1_000,
        )
        .unwrap();
        db
    }

    #[test]
    fn a_lists_first_full_read_is_its_baseline() {
        let db = baseline_db();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty());
        assert!(new_ids(&db, "PL1").is_empty());
        let dump = db.get_ytm_library().unwrap();
        assert_eq!(
            dump.lists.iter().map(|l| (l.id.as_str(), l.name.as_str(), l.position)).collect::<Vec<_>>(),
            [(LIKED_MUSIC_ID, LIKED_MUSIC_NAME, 0), ("PL1", "Deep", 1)]
        );
        assert!(dump.lists.iter().all(|l| l.last_opened_at == 1_000));
        assert_eq!(list(&db, "PL1").total_results, Some(2));
    }

    #[test]
    fn a_like_after_the_baseline_is_new_until_the_list_is_opened() {
        let db = baseline_db();
        let changed = db
            .apply_ytm_sync(
                &sync(vec![(LIKED_MUSIC_ID, full(&["d", "a", "b"])), ("PL1", ListChange::Unchanged)]),
                2_000,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(new_ids(&db, LIKED_MUSIC_ID), ["d"]);
        assert!(new_ids(&db, "PL1").is_empty());

        db.mark_ytm_list_opened(LIKED_MUSIC_ID, 2_500).unwrap();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty());
    }

    #[test]
    fn a_full_read_keeps_first_seen_at_and_drops_what_left() {
        let db = baseline_db();
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["c", "a"]))]), 2_000).unwrap();
        assert_eq!(first_seen(&db, LIKED_MUSIC_ID, "a"), 1_000);
        assert_eq!(first_seen(&db, LIKED_MUSIC_ID, "c"), 2_000);
        let dump = db.get_ytm_library().unwrap();
        let liked: Vec<&str> = dump
            .entries
            .iter()
            .filter(|e| e.list_id == LIKED_MUSIC_ID)
            .map(|e| e.video_id.as_str())
            .collect();
        assert!(!liked.contains(&"b"), "an unliked video leaves Liked music");
        assert!(dump.tracks.iter().any(|t| t.video_id == "b"), "b is still in PL1");
    }

    #[test]
    fn an_unchanged_sync_changes_nothing() {
        let db = baseline_db();
        let changed = db
            .apply_ytm_sync(
                &sync(vec![(LIKED_MUSIC_ID, ListChange::Unchanged), ("PL1", ListChange::Unchanged)]),
                2_000,
            )
            .unwrap();
        assert!(!changed);
        assert!(!db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 3_000).unwrap());
    }

    #[test]
    fn a_vanished_playlist_is_kept_and_marked_until_it_reads_again() {
        let db = baseline_db();
        assert!(db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Gone)]), 2_000).unwrap());
        assert_eq!(list(&db, "PL1").unavailable_at, Some(2_000));
        let rows = db.get_ytm_library().unwrap().entries.iter().filter(|e| e.list_id == "PL1").count();
        assert_eq!(rows, 2, "its rows stay");

        assert!(!db.apply_ytm_sync(&sync(vec![("PL1", ListChange::Gone)]), 3_000).unwrap(), "already marked");
        assert_eq!(list(&db, "PL1").unavailable_at, Some(2_000));

        db.apply_ytm_sync(&sync(vec![("PL1", full(&["b", "c"]))]), 4_000).unwrap();
        assert_eq!(list(&db, "PL1").unavailable_at, None);
    }

    #[test]
    fn a_result_for_a_playlist_removed_meanwhile_is_dropped() {
        let db = baseline_db();
        db.remove_ytm_list("PL1").unwrap();
        db.apply_ytm_sync(&sync(vec![("PL1", full(&["x"]))]), 2_000).unwrap();
        let dump = db.get_ytm_library().unwrap();
        assert!(dump.lists.iter().all(|l| l.id != "PL1"));
        assert!(dump.tracks.iter().all(|t| t.video_id != "x"));
    }

    #[test]
    fn durations_are_filled_in_for_new_videos_and_kept_for_known_ones() {
        let db = fresh();
        let mut first = sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]);
        first.durations.insert("a".to_string(), 95 * 60_000);
        db.apply_ytm_sync(&first, 1_000).unwrap();
        // A read without lengths (YouTube had none for b) keeps a's.
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 2_000).unwrap();
        let length = |db: &Database, id: &str| {
            db.get_ytm_library().unwrap().tracks.into_iter().find(|t| t.video_id == id).unwrap().duration_ms
        };
        assert_eq!(length(&db, "a"), Some(95 * 60_000));
        assert_eq!(length(&db, "b"), None);
        // b has no length yet, so the next full read asks for it again.
        assert_eq!(db.ytm_known_ids().unwrap(), HashSet::from(["a".to_string()]));

        // A premiere that became a video: its length arrives later.
        let mut later = sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]);
        later.durations.insert("b".to_string(), 6 * 60_000);
        assert!(db.apply_ytm_sync(&later, 3_000).unwrap());
        assert_eq!(length(&db, "b"), Some(6 * 60_000));
        assert_eq!(db.ytm_known_ids().unwrap(), HashSet::from(["a".to_string(), "b".to_string()]));
    }

    #[test]
    fn the_baseline_lists_liked_music_first_even_before_its_first_sync() {
        let db = fresh();
        db.add_ytm_list("PL1", "Deep", 100).unwrap();
        assert_eq!(
            db.ytm_baseline().unwrap().lists,
            vec![ListBaseline::new(LIKED_MUSIC_ID), ListBaseline::new("PL1")]
        );

        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "b"]))]), 1_000).unwrap();
        let liked = db.ytm_baseline().unwrap().lists.remove(0);
        assert_eq!(
            liked,
            ListBaseline {
                id: LIKED_MUSIC_ID.to_string(),
                total_results: Some(2),
                first_page_ids: Some(vec!["a".to_string(), "b".to_string()]),
                full_synced_at: Some(1_000),
            }
        );
    }

    #[test]
    fn after_a_disconnect_the_next_read_is_a_baseline_again() {
        let db = baseline_db();
        db.clear_ytm_account().unwrap();
        assert_eq!(db.ytm_baseline().unwrap().lists[1], ListBaseline::new("PL1"));

        db.apply_ytm_sync(
            &sync(vec![(LIKED_MUSIC_ID, full(&["a", "z"])), ("PL1", full(&["b"]))]),
            5_000,
        )
        .unwrap();
        assert!(new_ids(&db, LIKED_MUSIC_ID).is_empty(), "connecting again is a first sync");
        assert!(new_ids(&db, "PL1").is_empty());
    }

    #[test]
    fn a_video_listed_twice_is_one_row() {
        let db = fresh();
        db.apply_ytm_sync(&sync(vec![(LIKED_MUSIC_ID, full(&["a", "a", "b"]))]), 1_000).unwrap();
        let dump = db.get_ytm_library().unwrap();
        assert_eq!(dump.entries.len(), 2);
        assert_eq!(dump.lists[0].track_count, 3, "YouTube's items, for the unavailable count");
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test db::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find type YtmEntry`, `ListChange`, `SyncChanges`, `ListBaseline`; `no method named apply_ytm_sync`.

- [ ] **Step 3: What a sync found, and applying it**

Change the `use` lines at the top to:

```rust
use super::Database;
use rusqlite::{params, OptionalExtension, Result, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
```

(The tests' own `use std::collections::{HashMap, HashSet};` from Step 1 can stay: an explicit import shadows the glob one without a clash.)

Insert directly above `#[cfg(test)]`:

```rust
// --- what a sync found ------------------------------------------------

/// One available video in one list, as YouTube returned it.
#[derive(Debug, Clone, PartialEq)]
pub struct YtmEntry {
    pub track: YtmTrack,
    /// `snippet.publishedAt`: when it was added to the playlist (ISO).
    pub added_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ListChange {
    /// Its first page matched what is stored: nothing was read past it.
    Unchanged,
    /// Every page was read.
    Full {
        /// The available items, in YouTube's order. Deleted and private
        /// videos are not here.
        entries: Vec<YtmEntry>,
        total_results: i64,
        /// Every video id on page one, unavailable ones included.
        first_page_ids: Vec<String>,
    },
    /// 404: the playlist was deleted or made private.
    Gone,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncChanges {
    /// One per list checked, Liked music first.
    pub lists: Vec<(String, ListChange)>,
    /// Durations of the videos that were not stored before this sync.
    pub durations: HashMap<String, i64>,
}

/// What the last full read of a list left behind.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ListBaseline {
    pub id: String,
    pub total_results: Option<i64>,
    pub first_page_ids: Option<Vec<String>>,
    pub full_synced_at: Option<i64>,
}

impl ListBaseline {
    /// A list never read in full: it gets a full read.
    pub fn new(id: &str) -> Self {
        Self { id: id.to_string(), ..Self::default() }
    }
}

/// What the next sync compares against.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SyncBaseline {
    /// Liked music first, then the added playlists in sidebar order.
    pub lists: Vec<ListBaseline>,
    /// Videos whose length is stored: not asked for again. A video stored
    /// without one (a premiere or a live stream when it was first read) is
    /// not here, so its next full read asks again.
    pub known_ids: HashSet<String>,
}

/// A stored list as applying a change needs it: track_count, total_results,
/// full_synced_at, unavailable_at.
type StoredState = (i64, Option<i64>, Option<i64>, Option<i64>);

impl Database {
    pub fn ytm_baseline(&self) -> Result<SyncBaseline> {
        let mut lists = {
            let mut stmt = self.conn.prepare(
                "SELECT id, total_results, first_page_ids, full_synced_at
                 FROM ytm_lists ORDER BY position, id",
            )?;
            let rows = stmt.query_map([], |r| {
                let first_page: Option<String> = r.get(2)?;
                Ok(ListBaseline {
                    id: r.get(0)?,
                    total_results: r.get(1)?,
                    // Unreadable JSON is as good as none: the list is read in full.
                    first_page_ids: first_page.and_then(|raw| serde_json::from_str(&raw).ok()),
                    full_synced_at: r.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };
        // Liked music is synced from the start; its row is made by its first sync.
        if !lists.iter().any(|l| l.id == LIKED_MUSIC_ID) {
            lists.insert(0, ListBaseline::new(LIKED_MUSIC_ID));
        }
        Ok(SyncBaseline { lists, known_ids: self.ytm_known_ids()? })
    }

    /// Videos whose length is stored. One stored without a length is left
    /// out, so the next full read of its list asks YouTube again.
    pub fn ytm_known_ids(&self) -> Result<HashSet<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT video_id FROM ytm_tracks WHERE duration_ms IS NOT NULL")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect()
    }

    /// Stores what a sync found, all of it or none of it. Returns whether
    /// anything a person would see changed.
    ///
    /// Liked music's row is made by its first sync. A playlist's row is made
    /// when it is added, so a result for one no longer stored (removed while
    /// the sync ran) is dropped rather than brought back.
    pub fn apply_ytm_sync(&self, changes: &SyncChanges, now_ms: i64) -> Result<bool> {
        let tx = self.ytm_immediate_transaction()?;
        let mut changed = self.conn.execute(
            "INSERT OR IGNORE INTO ytm_lists (id, name, position, last_opened_at) VALUES (?1, ?2, 0, ?3)",
            params![LIKED_MUSIC_ID, LIKED_MUSIC_NAME, now_ms],
        )? > 0;

        for (list_id, change) in &changes.lists {
            let stored: Option<StoredState> = self
                .conn
                .query_row(
                    "SELECT track_count, total_results, full_synced_at, unavailable_at
                     FROM ytm_lists WHERE id = ?1",
                    [list_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;
            let Some((track_count, total_before, full_synced_at, unavailable_at)) = stored else {
                continue;
            };

            match change {
                ListChange::Unchanged => {}
                ListChange::Gone => {
                    if unavailable_at.is_none() {
                        self.conn.execute(
                            "UPDATE ytm_lists SET unavailable_at = ?2 WHERE id = ?1",
                            params![list_id, now_ms],
                        )?;
                        changed = true;
                    }
                }
                ListChange::Full { entries, total_results, first_page_ids } => {
                    for entry in entries {
                        let duration = changes.durations.get(&entry.track.video_id).copied();
                        changed |= self.upsert_ytm_track(&entry.track, duration)?;
                    }
                    changed |= self.replace_ytm_pairs(list_id, entries, now_ms)?;

                    let first_read = full_synced_at.is_none();
                    let ids = serde_json::to_string(first_page_ids).unwrap_or_else(|_| "[]".to_string());
                    // A list's first full read is its baseline: what it already
                    // held is not new.
                    self.conn.execute(
                        "UPDATE ytm_lists SET track_count = ?2, total_results = ?3, first_page_ids = ?4,
                                full_synced_at = ?5, unavailable_at = NULL,
                                last_opened_at = CASE WHEN ?6 THEN ?5 ELSE last_opened_at END
                         WHERE id = ?1",
                        params![list_id, entries.len() as i64, total_results, ids, now_ms, first_read],
                    )?;
                    changed |= track_count != entries.len() as i64
                        || total_before != Some(*total_results)
                        || unavailable_at.is_some();
                }
            }
        }

        self.delete_ytm_orphans()?;
        tx.commit()?;
        Ok(changed)
    }

    /// Returns true when the video is new or its title or channel changed. A
    /// duration is only ever filled in, never cleared.
    fn upsert_ytm_track(&self, track: &YtmTrack, duration_ms: Option<i64>) -> Result<bool> {
        let written = self.conn.execute(
            "INSERT INTO ytm_tracks (video_id, title, channel, duration_ms) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(video_id) DO UPDATE SET
                title = excluded.title,
                channel = excluded.channel,
                duration_ms = COALESCE(excluded.duration_ms, ytm_tracks.duration_ms)
             WHERE title IS NOT excluded.title
                OR channel IS NOT excluded.channel
                OR (excluded.duration_ms IS NOT NULL AND duration_ms IS NOT excluded.duration_ms)",
            params![track.video_id, track.title, track.channel, duration_ms.or(track.duration_ms)],
        )?;
        Ok(written > 0)
    }

    /// A full read of a list: add what is new (first seen now), drop what
    /// YouTube no longer lists, leave the rest with its `first_seen_at`.
    /// Delete-then-insert would mark the whole list new.
    fn replace_ytm_pairs(&self, list_id: &str, entries: &[YtmEntry], now_ms: i64) -> Result<bool> {
        let before: HashSet<String> = {
            let mut stmt = self
                .conn
                .prepare("SELECT video_id FROM ytm_list_tracks WHERE list_id = ?1")?;
            let rows = stmt.query_map([list_id], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<HashSet<_>>>()?
        };

        let mut written = false;
        let mut wanted: HashSet<&str> = HashSet::new();
        for entry in entries {
            // A video listed twice is one row, dated by its first listing.
            if !wanted.insert(entry.track.video_id.as_str()) {
                continue;
            }
            written |= self.conn.execute(
                "INSERT INTO ytm_list_tracks (list_id, video_id, added_at, first_seen_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(list_id, video_id) DO UPDATE SET added_at = excluded.added_at
                 WHERE added_at IS NOT excluded.added_at",
                params![list_id, entry.track.video_id, entry.added_at, now_ms],
            )? > 0;
        }

        let mut removed = 0;
        for gone in before.iter().filter(|id| !wanted.contains(id.as_str())) {
            removed += self.conn.execute(
                "DELETE FROM ytm_list_tracks WHERE list_id = ?1 AND video_id = ?2",
                params![list_id, gone],
            )?;
        }
        Ok(written || removed > 0)
    }
}

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test db::youtube_music 2>&1 | tail -5`
Expected: PASS — 18 tests (8 from Task 4, 10 new).

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 369 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/youtube_music.rs
git commit -m "feat(youtube-music): applying a sync — first reads are baselines, vanished playlists are marked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Reading YouTube's answers — playlist pages, errors, lengths, playlist links

**Files:**
- Create: `src-tauri/src/external/youtube_music.rs`
- Modify: `src-tauri/src/external/mod.rs`

What the spike saw, and what the parser relies on: an item's `snippet` has `title`, `publishedAt` (when it was added to the playlist), `resourceId.videoId`, and `videoOwnerChannelTitle` — absent on deleted and private videos, which YouTube titles `Deleted video` / `Private video`. The page has `pageInfo.totalResults` and, when there is more, `nextPageToken`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/external/youtube_music.rs` with only this, for now:

```rust
// src-tauri/src/external/youtube_music.rs
//! YouTube Data API for the YouTube Music section, read with the user's OAuth
//! token: Liked music (`LM`) and the playlists added by link.

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// One `playlistItems` item. `channel` None is how YouTube writes a deleted
    /// or private video: no owner channel.
    pub(super) fn item(video_id: &str, title: &str, channel: Option<&str>) -> Value {
        let mut snippet = json!({
            "title": title,
            "publishedAt": "2026-10-03T07:12:00Z",
            "resourceId": { "kind": "youtube#video", "videoId": video_id }
        });
        if let Some(channel) = channel {
            snippet["videoOwnerChannelTitle"] = json!(channel);
        }
        json!({ "kind": "youtube#playlistItem", "snippet": snippet, "contentDetails": { "videoId": video_id } })
    }

    #[test]
    fn reads_a_page_of_playlist_items_and_skips_deleted_and_private_videos() {
        let page = json!({
            "nextPageToken": "CDIQAA",
            "pageInfo": { "totalResults": 62, "resultsPerPage": 50 },
            "items": [
                item("v1", "Soulva - Odyssey (Original Mix)", Some("Soulva")),
                item("v2", "Deleted video", None),
                item("v3", "Private video", None),
                item("v4", "Honey Hunter", Some("Extrawelt - Topic"))
            ]
        });
        let parsed = parse_items_page(&page);
        assert_eq!(parsed.ids, ["v1", "v2", "v3", "v4"], "page one's ids include the unavailable ones");
        assert_eq!(
            parsed.entries.iter().map(|e| e.track.video_id.as_str()).collect::<Vec<_>>(),
            ["v1", "v4"]
        );
        assert_eq!(
            parsed.entries[1],
            YtmEntry {
                track: YtmTrack {
                    video_id: "v4".into(),
                    title: "Honey Hunter".into(),
                    channel: "Extrawelt - Topic".into(),
                    duration_ms: None,
                },
                added_at: Some("2026-10-03T07:12:00Z".into()),
            }
        );
        assert_eq!(parsed.total_results, 62);
        assert_eq!(parsed.next_page_token.as_deref(), Some("CDIQAA"));

        let last = parse_items_page(&json!({ "pageInfo": { "totalResults": 0 }, "items": [] }));
        assert_eq!(last, ItemsPage::default());
    }

    #[test]
    fn reads_youtube_error_bodies() {
        let quota = r#"{"error":{"code":403,"message":"The request cannot be completed because you have exceeded your quota.","errors":[{"domain":"youtube.quota","reason":"quotaExceeded"}]}}"#;
        assert_eq!(api_error(403, quota), YtmError::QuotaExceeded);

        let gone = r#"{"error":{"code":404,"message":"The playlist cannot be found.","errors":[{"domain":"youtube.playlistItem","reason":"playlistNotFound"}]}}"#;
        assert_eq!(
            api_error(404, gone),
            YtmError::Api {
                status: 404,
                message: "The playlist cannot be found.".into(),
                reason: Some("playlistNotFound".into()),
            }
        );
        assert_eq!(api_error(404, gone).to_string(), "YouTube answered 404: The playlist cannot be found.");

        // Not Google's JSON (a proxy's page, say): only the status is shown.
        assert_eq!(api_error(502, "<html>Bad gateway</html>").to_string(), "YouTube answered 502");

        // The token endpoint's flat OAuth error.
        assert_eq!(
            api_error(401, r#"{"error":"invalid_client","error_description":"The OAuth client was not found."}"#),
            YtmError::Api {
                status: 401,
                message: "The OAuth client was not found.".into(),
                reason: Some("invalid_client".into()),
            }
        );
    }

    #[test]
    fn a_playlist_is_gone_on_404_or_when_its_items_are_not_accessible() {
        let api = |status, reason: Option<&str>| YtmError::Api {
            status,
            message: String::new(),
            reason: reason.map(str::to_string),
        };
        assert!(is_gone(&api(404, Some("playlistNotFound"))));
        assert!(is_gone(&api(404, None)));
        assert!(is_gone(&api(403, Some("playlistItemsNotAccessible"))));
        assert!(!is_gone(&api(403, Some("forbidden"))));
        assert!(!is_gone(&api(500, None)));
        assert!(!is_gone(&YtmError::QuotaExceeded));
        assert!(!is_gone(&YtmError::Network("offline".into())));
    }

    #[test]
    fn reads_lengths_and_skips_what_it_cannot_read() {
        let body = json!({ "items": [
            { "id": "v1", "contentDetails": { "duration": "PT6M57S" } },
            { "id": "set1", "contentDetails": { "duration": "PT1H35M" } },
            { "id": "live", "contentDetails": { "duration": "P0D" } },
            { "id": "odd" }
        ]});
        assert_eq!(
            parse_durations(&body),
            HashMap::from([("v1".to_string(), 417_000), ("set1".to_string(), 5_700_000)])
        );
    }

    #[test]
    fn reads_a_playlists_name_or_none() {
        let named = json!({ "items": [{ "id": "PLx", "snippet": { "title": "Deep Cuts" } }] });
        assert_eq!(parse_playlist_name(&named).as_deref(), Some("Deep Cuts"));
        // A playlist private to another account comes back as no items at all.
        assert_eq!(parse_playlist_name(&json!({ "items": [] })), None);
    }

    #[test]
    fn a_playlist_id_comes_out_of_every_link_shape() {
        assert_eq!(
            playlist_id_from_link("https://music.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf").as_deref(),
            Some("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")
        );
        assert_eq!(
            playlist_id_from_link("https://www.youtube.com/watch?v=fjR4idz1-MA&list=PL123_abc-XYZ&index=2").as_deref(),
            Some("PL123_abc-XYZ")
        );
        assert_eq!(
            playlist_id_from_link("https://youtube.com/playlist?list=OLAK5uy_kq#top").as_deref(),
            Some("OLAK5uy_kq")
        );
        assert_eq!(playlist_id_from_link("  PL123_abc-XYZ  ").as_deref(), Some("PL123_abc-XYZ"));
        assert_eq!(playlist_id_from_link("https://example.com/nope"), None);
        assert_eq!(playlist_id_from_link("https://music.youtube.com/playlist?list="), None);
        assert_eq!(playlist_id_from_link("not a link"), None);
        assert_eq!(playlist_id_from_link(""), None);
    }

    #[test]
    fn urls_ask_for_fifty_at_a_time() {
        assert_eq!(
            items_url("LM", None),
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=LM"
        );
        assert_eq!(
            items_url("PLx", Some("CDIQAA")),
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PLx&pageToken=CDIQAA"
        );
        assert_eq!(playlist_url("PLx"), "https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=PLx");
        assert_eq!(
            videos_url(&["a", "b"]),
            "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&maxResults=50&id=a,b"
        );
    }
}
```

In `src-tauri/src/external/mod.rs`, directly under `pub mod spotify_auth;` add:

```rust
pub mod youtube_music;
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find function parse_items_page`, `cannot find type YtmError`, and so on.

- [ ] **Step 3: Errors, URLs and parsing**

Insert between the module comment and `#[cfg(test)]`:

```rust
//!
//! A playlist has no snapshot id, so a list is checked with its first page
//! (`fetch_changes`). Captured responses contain someone's library and are
//! never committed; tests use small hand-written JSON.
//!
//! Every call costs 1 unit — `playlistItems`, `playlists` and `videos` alike
//! (`youtube::unit_cost`) — charged to the OAuth client's Google Cloud
//! project, which is the API key's: this section and Sets share the day.

use crate::db::youtube_music::{YtmEntry, YtmTrack};
use crate::external::youtube::parse_iso_duration;
use serde_json::Value;
use std::collections::HashMap;

pub const API_BASE: &str = "https://www.googleapis.com/youtube/v3";
/// The largest page `playlistItems` and `videos` give.
pub const PAGE_SIZE: usize = 50;

#[derive(Debug, Clone, PartialEq)]
pub enum YtmError {
    /// No account connected.
    NotConnected,
    /// The refresh token was revoked or expired (`invalid_grant`): sign in again.
    Reconnect,
    /// YouTube could not be reached, or answered with something unreadable.
    Network(String),
    /// YouTube answered with an error status.
    Api { status: u16, message: String, reason: Option<String> },
    /// `quotaExceeded`: the day's units are used up until midnight Pacific.
    QuotaExceeded,
}

impl std::fmt::Display for YtmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConnected => write!(f, "YouTube Music is not connected"),
            Self::Reconnect => write!(f, "YouTube Music needs you to sign in again"),
            Self::Network(message) => write!(f, "{message}"),
            // A body that was not Google's JSON leaves only the status.
            Self::Api { status, message, .. } if *message == generic_api_message(*status) => {
                write!(f, "{message}")
            }
            Self::Api { status, message, .. } => write!(f, "YouTube answered {status}: {message}"),
            Self::QuotaExceeded => write!(f, "YouTube quota used up · resumes after midnight Pacific"),
        }
    }
}

impl std::error::Error for YtmError {}

fn generic_api_message(status: u16) -> String {
    format!("YouTube answered {status}")
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

/// Google's error body, `{"error":{"code":…,"message":…,"errors":[{"reason":…}]}}`,
/// or the token endpoint's flat one, `{"error":"…","error_description":"…"}`.
/// `quotaExceeded` is its own kind: the view words it, and the loop waits.
pub fn api_error(status: u16, body: &str) -> YtmError {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let error = parsed.as_ref().and_then(|v| v.get("error"));
    let nested = error.filter(|e| e.is_object());
    let reason = nested
        .and_then(|e| e.pointer("/errors/0/reason"))
        .or_else(|| error.filter(|e| e.is_string()))
        .and_then(Value::as_str)
        .map(str::to_string);
    if matches!(reason.as_deref(), Some("quotaExceeded" | "dailyLimitExceeded")) {
        return YtmError::QuotaExceeded;
    }
    let message = nested
        .and_then(|e| e.get("message"))
        .or_else(|| parsed.as_ref().and_then(|v| v.get("error_description")))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| generic_api_message(status));
    YtmError::Api { status, message, reason }
}

/// A stored playlist YouTube no longer shows this account: deleted, or made
/// private. It stays in the sidebar, marked, until the user removes it.
pub fn is_gone(err: &YtmError) -> bool {
    match err {
        YtmError::Api { status: 404, .. } => true,
        YtmError::Api { status: 403, reason: Some(reason), .. } => reason == "playlistItemsNotAccessible",
        _ => false,
    }
}

pub fn items_url(list_id: &str, page_token: Option<&str>) -> String {
    let mut url = format!(
        "{API_BASE}/playlistItems?part=snippet,contentDetails&maxResults={PAGE_SIZE}&playlistId={}",
        urlencoding::encode(list_id)
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    url
}

/// The playlist's own record, for its name: 1 unit.
pub fn playlist_url(id: &str) -> String {
    format!("{API_BASE}/playlists?part=snippet&id={}", urlencoding::encode(id))
}

/// Lengths of up to 50 videos: 1 unit.
pub fn videos_url(ids: &[&str]) -> String {
    let ids: Vec<String> = ids.iter().map(|id| urlencoding::encode(id).into_owned()).collect();
    format!("{API_BASE}/videos?part=contentDetails&maxResults={PAGE_SIZE}&id={}", ids.join(","))
}

/// One page of `playlistItems`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ItemsPage {
    /// Every item's video id, in order — deleted and private ones too. Page
    /// one's ids are what the next sync compares with.
    pub ids: Vec<String>,
    /// The available items.
    pub entries: Vec<YtmEntry>,
    pub next_page_token: Option<String>,
    /// `pageInfo.totalResults`: what YouTube counts, unavailable items included.
    pub total_results: i64,
}

pub fn parse_items_page(page: &Value) -> ItemsPage {
    let mut parsed = ItemsPage {
        next_page_token: text(page, "nextPageToken"),
        total_results: page.pointer("/pageInfo/totalResults").and_then(Value::as_i64).unwrap_or(0),
        ..ItemsPage::default()
    };
    for item in page.get("items").and_then(Value::as_array).into_iter().flatten() {
        let Some(video_id) = item
            .pointer("/snippet/resourceId/videoId")
            .or_else(|| item.pointer("/contentDetails/videoId"))
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        parsed.ids.push(video_id.to_string());

        // Deleted and private videos have no owner channel ("Deleted video",
        // "Private video"): skipped, and counted through totalResults.
        let Some(channel) = item.pointer("/snippet/videoOwnerChannelTitle").and_then(Value::as_str) else {
            continue;
        };
        parsed.entries.push(YtmEntry {
            track: YtmTrack {
                video_id: video_id.to_string(),
                title: item.pointer("/snippet/title").and_then(Value::as_str).unwrap_or_default().to_string(),
                channel: channel.to_string(),
                duration_ms: None,
            },
            added_at: item.pointer("/snippet/publishedAt").and_then(Value::as_str).map(str::to_string),
        });
    }
    parsed
}

/// The playlist's title, or None when YouTube shows no such playlist to this
/// account (it answers with no items rather than an error).
pub fn parse_playlist_name(body: &Value) -> Option<String> {
    body.pointer("/items/0/snippet/title").and_then(Value::as_str).map(str::to_string)
}

/// Video id → length in ms. An unreadable length (a live stream's `P0D`) is
/// left out: the video then counts as a track, not a set.
pub fn parse_durations(body: &Value) -> HashMap<String, i64> {
    body.get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            let ms = parse_iso_duration(item.pointer("/contentDetails/duration")?.as_str()?);
            (ms > 0).then(|| (id.to_string(), ms))
        })
        .collect()
}

/// A playlist link (`…?list=…` on music.youtube.com or youtube.com, a watch
/// link inside a playlist too) or a bare playlist id.
pub fn playlist_id_from_link(input: &str) -> Option<String> {
    let trimmed = input.trim();
    let candidate = ["?list=", "&list="]
        .iter()
        .find_map(|marker| trimmed.find(*marker).map(|at| &trimmed[at + marker.len()..]))
        .map(|rest| rest.split(['&', '#']).next().unwrap_or(""))
        .unwrap_or(trimmed);
    let valid = (2..=64).contains(&candidate.len())
        && candidate.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then(|| candidate.to_string())
}

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test external::youtube_music 2>&1 | tail -5`
Expected: PASS — 7 tests.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 376 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/external/youtube_music.rs src-tauri/src/external/mod.rs
git commit -m "feat(youtube-music): read YouTube's playlist pages, errors, lengths and playlist links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: What a sync fetches — the first-page check, the daily full read, lengths for new videos

**Files:**
- Modify: `src-tauri/src/external/youtube_music.rs`

The network goes behind `YtmApi`, as Spotify's does, so these rules are tested on replayed pages:
- **First page (1 unit):** if `totalResults` and page one's ids match what is stored, the list is unchanged and nothing more is read.
- **Otherwise every page** is read. **Once a day** every list is read in full regardless — an addition and a removal past page one can cancel out.
- **404** on one list marks it gone; the others still sync. Anything else (quota, network, a lost sign-in) fails the sync.
- **Lengths** only for videos whose length is not stored yet — new ones, and ones YouTube had no length for when first read (a premiere, a live stream that later became a video), asked again at their list's next full read — 50 to a call, each video once.
- **Adding by link:** the name (1 unit), then a full read — its "new" baseline.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`)

```rust
    // --- what a sync fetches ------------------------------------------

    use crate::db::youtube_music::{ListBaseline, ListChange, SyncBaseline};
    use std::collections::HashSet;
    use std::future::Future;
    use std::sync::Mutex;

    /// Replays hand-written pages by URL and records what was asked for.
    #[derive(Default)]
    struct FakeApi {
        pages: HashMap<String, Result<Value, YtmError>>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeApi {
        fn page(mut self, url: String, body: Value) -> Self {
            self.pages.insert(url, Ok(body));
            self
        }

        fn fail(mut self, url: String, err: YtmError) -> Self {
            self.pages.insert(url, Err(err));
            self
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl YtmApi for FakeApi {
        fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send {
            self.calls.lock().unwrap().push(url.to_string());
            let answer = self
                .pages
                .get(url)
                .cloned()
                .unwrap_or_else(|| Err(YtmError::Network(format!("no page for {url}"))));
            async move { answer }
        }
    }

    fn page_of(ids: &[&str], total: i64, next: Option<&str>) -> Value {
        json!({
            "nextPageToken": next,
            "pageInfo": { "totalResults": total },
            "items": ids.iter().map(|id| item(id, &format!("Artist - {id}"), Some("Label"))).collect::<Vec<_>>()
        })
    }

    fn lengths(pairs: &[(&str, &str)]) -> Value {
        json!({ "items": pairs.iter().map(|(id, d)| json!({ "id": id, "contentDetails": { "duration": d } })).collect::<Vec<_>>() })
    }

    fn stored(id: &str, total: i64, first: &[&str], full_at: i64) -> ListBaseline {
        ListBaseline {
            id: id.to_string(),
            total_results: Some(total),
            first_page_ids: Some(first.iter().map(|s| s.to_string()).collect()),
            full_synced_at: Some(full_at),
        }
    }

    fn known(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    const NOW: i64 = 10 * FULL_REFETCH_MS;
    const HOUR: i64 = 60 * 60 * 1000;

    /// Liked music, two pages: [a, b] then [c]; totalResults 3.
    fn two_pages() -> FakeApi {
        FakeApi::default()
            .page(items_url("LM", None), page_of(&["a", "b"], 3, Some("P2")))
            .page(items_url("LM", Some("P2")), page_of(&["c"], 3, None))
    }

    #[tokio::test]
    async fn a_first_sync_reads_every_page_and_asks_lengths_only_for_unseen_videos() {
        let api = two_pages().page(videos_url(&["a", "c"]), lengths(&[("a", "PT5M"), ("c", "PT1H5M")]));
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: known(&["b"]) };

        let changes = fetch_changes(&api, &base, NOW).await.unwrap();

        match changes.lists.as_slice() {
            [(id, ListChange::Full { entries, total_results, first_page_ids })] => {
                assert_eq!(id, "LM");
                assert_eq!(entries.iter().map(|e| e.track.video_id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
                assert_eq!(*total_results, 3);
                assert_eq!(first_page_ids, &["a", "b"]);
            }
            other => panic!("expected one full read, got {other:?}"),
        }
        assert_eq!(changes.durations, HashMap::from([("a".to_string(), 300_000), ("c".to_string(), 3_900_000)]));
        assert_eq!(api.calls().len(), 3, "two pages and one videos call: 3 units");
    }

    #[tokio::test]
    async fn an_unchanged_first_page_skips_the_list_for_one_unit() {
        let api = two_pages();
        let base = SyncBaseline { lists: vec![stored("LM", 3, &["a", "b"], NOW - HOUR)], known_ids: HashSet::new() };

        let changes = fetch_changes(&api, &base, NOW).await.unwrap();

        assert_eq!(changes.lists, vec![("LM".to_string(), ListChange::Unchanged)]);
        assert!(changes.durations.is_empty());
        assert_eq!(api.calls(), [items_url("LM", None)]);
    }

    #[tokio::test]
    async fn a_new_total_or_a_new_first_page_reads_the_list_again() {
        for list in [stored("LM", 2, &["a", "b"], NOW - HOUR), stored("LM", 3, &["x", "b"], NOW - HOUR)] {
            let api = two_pages();
            let base = SyncBaseline { lists: vec![list], known_ids: known(&["a", "b", "c"]) };
            let changes = fetch_changes(&api, &base, NOW).await.unwrap();
            assert!(matches!(changes.lists[0].1, ListChange::Full { .. }));
            assert_eq!(api.calls().len(), 2, "every page, and no videos call: all known");
        }
    }

    #[tokio::test]
    async fn once_a_day_a_list_is_read_in_full_whatever_its_first_page_says() {
        let api = two_pages();
        let base = SyncBaseline {
            lists: vec![stored("LM", 3, &["a", "b"], NOW - FULL_REFETCH_MS)],
            known_ids: known(&["a", "b", "c"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert!(matches!(changes.lists[0].1, ListChange::Full { .. }));
    }

    #[tokio::test]
    async fn a_playlist_that_disappeared_is_marked_and_the_rest_still_sync() {
        let gone = YtmError::Api { status: 404, message: "x".into(), reason: Some("playlistNotFound".into()) };
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 1, None))
            .fail(items_url("PLgone", None), gone)
            .page(items_url("PL2", None), page_of(&["b"], 1, None));
        let base = SyncBaseline {
            lists: vec![ListBaseline::new("LM"), ListBaseline::new("PLgone"), ListBaseline::new("PL2")],
            known_ids: known(&["a", "b"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.lists[1], ("PLgone".to_string(), ListChange::Gone));
        assert!(matches!(changes.lists[2].1, ListChange::Full { .. }));
    }

    #[tokio::test]
    async fn a_used_up_quota_fails_the_whole_sync() {
        let api = FakeApi::default().fail(items_url("LM", None), YtmError::QuotaExceeded);
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        assert_eq!(fetch_changes(&api, &base, NOW).await, Err(YtmError::QuotaExceeded));
    }

    #[tokio::test]
    async fn lengths_are_asked_for_fifty_videos_at_a_time() {
        let ids: Vec<String> = (0..51).map(|i| format!("v{i:02}")).collect();
        let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&ids[..50], 51, Some("P2")))
            .page(items_url("LM", Some("P2")), page_of(&ids[50..], 51, None))
            .page(videos_url(&ids[..50]), json!({ "items": [] }))
            .page(videos_url(&ids[50..]), json!({ "items": [] }));
        let base = SyncBaseline { lists: vec![ListBaseline::new("LM")], known_ids: HashSet::new() };
        fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(api.calls().len(), 4, "2 pages, then 2 videos calls for 51 new videos");
    }

    #[tokio::test]
    async fn a_new_video_in_two_lists_is_asked_for_once() {
        let api = FakeApi::default()
            .page(items_url("LM", None), page_of(&["a"], 1, None))
            .page(items_url("PL1", None), page_of(&["a"], 1, None))
            .page(videos_url(&["a"]), lengths(&[("a", "PT4M")]));
        let base = SyncBaseline {
            lists: vec![ListBaseline::new("LM"), ListBaseline::new("PL1")],
            known_ids: HashSet::new(),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.durations, HashMap::from([("a".to_string(), 240_000)]));
        assert_eq!(api.calls().len(), 3);
    }

    #[tokio::test]
    async fn a_stored_video_without_a_length_is_asked_again_at_a_full_read() {
        // b is stored but YouTube had no length for it (a premiere); a and c
        // have theirs.
        let api = two_pages().page(videos_url(&["b"]), lengths(&[("b", "PT6M")]));
        let base = SyncBaseline {
            lists: vec![stored("LM", 2, &["a", "b"], NOW - HOUR)],
            known_ids: known(&["a", "c"]),
        };
        let changes = fetch_changes(&api, &base, NOW).await.unwrap();
        assert_eq!(changes.durations, HashMap::from([("b".to_string(), 360_000)]));
        assert_eq!(api.calls().len(), 3, "two pages, then b alone: 1 unit");
    }

    #[tokio::test]
    async fn a_playlist_added_by_link_is_named_then_read_in_full() {
        let api = FakeApi::default()
            .page(playlist_url("PLx"), json!({ "items": [{ "snippet": { "title": "Deep Cuts" } }] }))
            .page(items_url("PLx", None), page_of(&["a"], 1, None))
            .page(videos_url(&["a"]), lengths(&[("a", "PT7M")]));
        let (name, changes) = fetch_new_playlist(&api, "PLx", &HashSet::new(), NOW).await.unwrap().unwrap();
        assert_eq!(name, "Deep Cuts");
        assert!(matches!(changes.lists.as_slice(), [(_, ListChange::Full { .. })]));
        assert_eq!(api.calls().len(), 3, "1 unit for the name, then the read");
    }

    #[tokio::test]
    async fn a_playlist_youtube_does_not_show_is_not_found() {
        let api = FakeApi::default().page(playlist_url("PLprivate"), json!({ "items": [] }));
        assert_eq!(fetch_new_playlist(&api, "PLprivate", &HashSet::new(), NOW).await, Ok(None));
        assert_eq!(api.calls().len(), 1, "nothing read past the name");

        let gone = YtmError::Api { status: 404, message: "x".into(), reason: None };
        let api = FakeApi::default()
            .page(playlist_url("PLy"), json!({ "items": [{ "snippet": { "title": "Y" } }] }))
            .fail(items_url("PLy", None), gone.clone());
        assert_eq!(fetch_new_playlist(&api, "PLy", &HashSet::new(), NOW).await, Ok(None));

        let api = FakeApi::default().fail(playlist_url("PLz"), gone);
        assert_eq!(fetch_new_playlist(&api, "PLz", &HashSet::new(), NOW).await, Ok(None));
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find trait YtmApi`, `cannot find value FULL_REFETCH_MS`, `cannot find function fetch_changes`.

- [ ] **Step 3: The fetch**

Change the top `use` lines to:

```rust
use crate::db::youtube_music::{
    ListBaseline, ListChange, SyncBaseline, SyncChanges, YtmEntry, YtmTrack,
};
use crate::external::youtube::parse_iso_duration;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::future::Future;
```

(The tests' own `use` lines for `HashSet`, `Future` and the db types can stay; explicit imports shadow the glob.)

Directly under `pub const PAGE_SIZE: usize = 50;` add:

```rust
/// The most pages one list is read to: 10,000 videos.
pub const MAX_PAGES: usize = 200;
/// A list last read in full this long ago is read in full again, whatever its
/// first page says.
pub const FULL_REFETCH_MS: i64 = 24 * 60 * 60 * 1000;
```

Insert directly above `#[cfg(test)]`:

```rust
// --- what a sync fetches ----------------------------------------------

/// One GET against the Data API, answering with the JSON body. The live client
/// adds the token and counts the unit; tests replay hand-written pages.
pub trait YtmApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send;
}

/// Never read in full, or last read in full a day or more ago.
pub fn full_read_due(list: &ListBaseline, now_ms: i64) -> bool {
    list.full_synced_at.is_none_or(|at| now_ms - at >= FULL_REFETCH_MS)
}

/// One list: its first page, then — unless that page matches what is stored
/// and no full read is due — every other page.
async fn read_list<A: YtmApi + Sync>(api: &A, list: &ListBaseline, now_ms: i64) -> Result<ListChange, YtmError> {
    let first = parse_items_page(&api.get_json(&items_url(&list.id, None)).await?);
    if !full_read_due(list, now_ms)
        && list.total_results == Some(first.total_results)
        && list.first_page_ids.as_ref() == Some(&first.ids)
    {
        return Ok(ListChange::Unchanged);
    }

    let ItemsPage { ids: first_page_ids, mut entries, mut next_page_token, total_results } = first;
    let mut pages = 1;
    while let Some(token) = next_page_token {
        if pages >= MAX_PAGES {
            return Err(YtmError::Network(format!("A YouTube playlist ran past {MAX_PAGES} pages")));
        }
        let page = parse_items_page(&api.get_json(&items_url(&list.id, Some(&token))).await?);
        pages += 1;
        entries.extend(page.entries);
        next_page_token = page.next_page_token;
    }
    Ok(ListChange::Full { entries, total_results, first_page_ids })
}

/// Lengths of the videos read in full whose length is not stored — new ones,
/// and ones stored without a length — each once, 50 to a call.
async fn fetch_durations<A: YtmApi + Sync>(
    api: &A,
    lists: &[(String, ListChange)],
    known: &HashSet<String>,
) -> Result<HashMap<String, i64>, YtmError> {
    let mut unseen: Vec<&str> = Vec::new();
    let mut queued: HashSet<&str> = HashSet::new();
    for (_, change) in lists {
        if let ListChange::Full { entries, .. } = change {
            for entry in entries {
                let id = entry.track.video_id.as_str();
                if !known.contains(id) && queued.insert(id) {
                    unseen.push(id);
                }
            }
        }
    }

    let mut durations = HashMap::new();
    for chunk in unseen.chunks(PAGE_SIZE) {
        durations.extend(parse_durations(&api.get_json(&videos_url(chunk)).await?));
    }
    Ok(durations)
}

/// Every list in `base`, Liked music first. A list YouTube no longer shows is
/// `Gone`; any other failure fails the sync, which the next run tries again.
pub async fn fetch_changes<A: YtmApi + Sync>(
    api: &A,
    base: &SyncBaseline,
    now_ms: i64,
) -> Result<SyncChanges, YtmError> {
    let mut lists = Vec::new();
    for list in &base.lists {
        let change = match read_list(api, list, now_ms).await {
            Ok(change) => change,
            Err(err) if is_gone(&err) => ListChange::Gone,
            Err(err) => return Err(err),
        };
        lists.push((list.id.clone(), change));
    }
    let durations = fetch_durations(api, &lists, &base.known_ids).await?;
    Ok(SyncChanges { lists, durations })
}

/// A playlist being added by link: its name (1 unit), then a full read, which
/// is its "new" baseline. None when YouTube shows this account no such
/// playlist — deleted, or private to another account.
pub async fn fetch_new_playlist<A: YtmApi + Sync>(
    api: &A,
    id: &str,
    known: &HashSet<String>,
    now_ms: i64,
) -> Result<Option<(String, SyncChanges)>, YtmError> {
    let name = match api.get_json(&playlist_url(id)).await {
        Ok(body) => parse_playlist_name(&body),
        Err(err) if is_gone(&err) => None,
        Err(err) => return Err(err),
    };
    let Some(name) = name else { return Ok(None) };

    let base = SyncBaseline { lists: vec![ListBaseline::new(id)], known_ids: known.clone() };
    let changes = fetch_changes(api, &base, now_ms).await?;
    if matches!(changes.lists.as_slice(), [(_, ListChange::Gone)]) {
        return Ok(None);
    }
    Ok(Some((name, changes)))
}

```

(`Option::is_none_or` needs Rust 1.82; this machine has 1.93.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test external::youtube_music 2>&1 | tail -5`
Expected: PASS — 18 tests (7 from Task 6, 11 new).

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 387 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/external/youtube_music.rs
git commit -m "feat(youtube-music): what a sync fetches — the first-page check, the daily full read, lengths for new videos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Google sign-in — the client file, PKCE with the secret, the email; and the live client

**Files:**
- Create: `src-tauri/src/external/youtube_auth.rs`
- Modify: `src-tauri/src/external/youtube_music.rs` (the live client)
- Modify: `src-tauri/src/external/mod.rs`

Checked on the real account with the spike (`yt_spike.py`): a Desktop OAuth client, PKCE **and** `client_secret` in the exchange, a loopback redirect on an OS-assigned port, `access_type=offline&prompt=consent` for a refresh token, and scope `openid email …/youtube.readonly` for an `id_token` carrying the email. Google's docs say a Desktop client's secret is not confidential. The PKCE helpers (`random_string`, `code_challenge`) and the listener are Spotify's.

The `id_token`'s signature is not checked: it came straight from Google's token endpoint over TLS, and the email is only shown. No crate is added: a small base64url decoder sits beside Spotify's encoder.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/external/youtube_auth.rs` with only this, for now:

```rust
// src-tauri/src/external/youtube_auth.rs
//! Signing in to Google for the YouTube Music section.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external::spotify_auth::base64url;

    const DESKTOP: &str = r#"{"installed":{"client_id":"123-abc.apps.googleusercontent.com","project_id":"recodeck","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","client_secret":"GOCSPX-secret","redirect_uris":["http://localhost"]}}"#;

    #[test]
    fn reads_a_desktop_client_file() {
        assert_eq!(
            parse_client_file(DESKTOP),
            Ok(ClientFile {
                client_id: "123-abc.apps.googleusercontent.com".into(),
                client_secret: "GOCSPX-secret".into(),
            })
        );
    }

    #[test]
    fn a_web_client_file_is_turned_away_in_one_line() {
        let web = r#"{"web":{"client_id":"w.apps.googleusercontent.com","client_secret":"s","redirect_uris":["https://example.com"]}}"#;
        let err = parse_client_file(web).unwrap_err();
        assert!(err.contains("Desktop app"), "{err}");
        assert!(!err.contains('\n'));
    }

    #[test]
    fn anything_else_is_not_a_client_file() {
        for raw in ["", "not json", "{}", "[1,2]", r#"{"installed":{"client_id":"x"}}"#, r#"{"installed":{"client_id":"","client_secret":"s"}}"#] {
            assert_eq!(parse_client_file(raw), Err(NOT_A_CLIENT_FILE.to_string()), "{raw}");
        }
    }

    #[test]
    fn the_client_secret_is_redacted_when_printed() {
        let printed = format!("{:?}", parse_client_file(DESKTOP).unwrap());
        assert!(!printed.contains("GOCSPX"), "{printed}");
        assert!(printed.contains("123-abc"));
    }

    #[test]
    fn the_authorize_url_asks_for_offline_access_on_the_loopback_port() {
        let url = authorize_url("cid", &redirect_uri(53682), "CH", "ST");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"), "{url}");
        for part in [
            "response_type=code",
            "client_id=cid",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback",
            "scope=openid%20email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly",
            "code_challenge_method=S256",
            "code_challenge=CH",
            "state=ST",
            "access_type=offline",
            "prompt=consent",
        ] {
            assert!(url.contains(part), "{url} lacks {part}");
        }
    }

    #[test]
    fn reads_a_token_response_with_its_id_token() {
        let body = r#"{"access_token":"AT","expires_in":3599,"refresh_token":"RT","scope":"x","token_type":"Bearer","id_token":"h.p.s"}"#;
        assert_eq!(
            parse_token_response(200, body),
            Ok(GoogleTokens {
                access_token: "AT".into(),
                expires_in: 3599,
                refresh_token: Some("RT".into()),
                id_token: Some("h.p.s".into()),
            })
        );
    }

    #[test]
    fn a_refresh_without_a_new_refresh_token_keeps_the_old_one() {
        let body = r#"{"access_token":"AT2","expires_in":3599,"token_type":"Bearer"}"#;
        assert_eq!(parse_token_response(200, body).unwrap().refresh_token, None);
    }

    #[test]
    fn a_revoked_or_expired_refresh_token_means_signing_in_again() {
        // Revoked at myaccount.google.com, or the 7 days of a Testing app ran out.
        let body = r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#;
        assert_eq!(parse_token_response(400, body), Err(YtmError::Reconnect));
    }

    #[test]
    fn an_unknown_client_is_told_apart() {
        let body = r#"{"error":"invalid_client","error_description":"The OAuth client was not found."}"#;
        let err = parse_token_response(401, body).unwrap_err();
        assert!(is_invalid_client(&err));
        assert!(!is_invalid_client(&YtmError::Reconnect));
        let other = parse_token_response(400, r#"{"error":"invalid_request"}"#).unwrap_err();
        assert!(!is_invalid_client(&other));
    }

    #[test]
    fn base64url_decodes_what_spotify_auth_encodes() {
        for input in ["", "f", "fo", "foo", "foob", "fooba", "foobar", "{\"email\":\"a@b.c\"}"] {
            assert_eq!(base64url_decode(&base64url(input.as_bytes())).as_deref(), Some(input.as_bytes()), "{input}");
        }
        assert_eq!(base64url_decode("-_8"), Some(vec![0xfb, 0xff]));
        assert_eq!(base64url_decode("Zm9v="), Some(b"foo".to_vec()), "padding is tolerated");
        assert_eq!(base64url_decode("ab$c"), None);
    }

    #[test]
    fn the_email_comes_from_the_id_token() {
        let claims = base64url(br#"{"iss":"https://accounts.google.com","email":"dj@example.com","email_verified":true}"#);
        let token = format!("eyJhbGciOiJSUzI1NiJ9.{claims}.c2ln");
        assert_eq!(email_from_id_token(&token).as_deref(), Some("dj@example.com"));
        assert_eq!(email_from_id_token("not-a-jwt"), None);
        let no_email = base64url(br#"{"sub":"1"}"#);
        assert_eq!(email_from_id_token(&format!("h.{no_email}.s")), None);
    }

    #[test]
    fn tokens_are_redacted_when_printed() {
        let tokens = GoogleTokens {
            access_token: "AT-secret".into(),
            expires_in: 3599,
            refresh_token: Some("RT-secret".into()),
            id_token: Some("ID-secret".into()),
        };
        let printed = format!("{tokens:?}");
        assert!(!printed.contains("secret"), "{printed}");
        assert!(printed.contains("3599"));
    }
}
```

In `src-tauri/src/external/mod.rs`, directly under `pub mod youtube_music;` add:

```rust
pub mod youtube_auth;
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test external::youtube_auth 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find function parse_client_file`, `cannot find type ClientFile`, and so on.

- [ ] **Step 3: The sign-in**

Insert between the module comment and `#[cfg(test)]`:

```rust
//!
//! Authorization Code with PKCE, on a loopback port the OS picks: Google
//! accepts any loopback port for a Desktop client, so no redirect URI is
//! registered. Google also wants the client's secret in the exchange; its own
//! docs say a Desktop client's secret is not confidential. Spotify's listener
//! (`spotify_auth`) serves the redirect.

use crate::external::youtube_music::{api_error, YtmError};
use serde_json::Value;
use std::time::Duration;

pub const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// `openid email` for the address Settings shows; YouTube, read-only, for the rest.
pub const SCOPES: &str = "openid email https://www.googleapis.com/auth/youtube.readonly";
/// What the sign-in messages call it.
pub const SERVICE: &str = "YouTube Music";

pub const NOT_A_CLIENT_FILE: &str =
    "This is not a Google OAuth client file — download the JSON of a Desktop app client";
const WEB_CLIENT: &str =
    "This file is for a Web application client — create an OAuth client of type Desktop app and choose its JSON";

/// The two values RecoDeck keeps from the client file. The file itself is not kept.
#[derive(Clone, PartialEq)]
pub struct ClientFile {
    pub client_id: String,
    pub client_secret: String,
}

/// The secret never reaches a log or an error message.
impl std::fmt::Debug for ClientFile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientFile")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[redacted]")
            .finish()
    }
}

/// The JSON Google Cloud downloads for an OAuth client. A Desktop client keeps
/// its values under `installed`; a Web client under `web`, which this flow
/// cannot use (it would need a registered redirect URI).
pub fn parse_client_file(raw: &str) -> Result<ClientFile, String> {
    let value: Value = serde_json::from_str(raw).map_err(|_| NOT_A_CLIENT_FILE.to_string())?;
    if let Some(installed) = value.get("installed") {
        let field = |key: &str| {
            installed
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        };
        return match (field("client_id"), field("client_secret")) {
            (Some(client_id), Some(client_secret)) => Ok(ClientFile { client_id, client_secret }),
            _ => Err(NOT_A_CLIENT_FILE.to_string()),
        };
    }
    if value.get("web").is_some() {
        return Err(WEB_CLIENT.to_string());
    }
    Err(NOT_A_CLIENT_FILE.to_string())
}

/// The redirect for a listener on `port`. It must be sent, the same, to the
/// authorize URL and to the token exchange.
pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/callback")
}

/// `access_type=offline` and `prompt=consent` make Google issue a refresh
/// token, every time.
pub fn authorize_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}&state={}&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(challenge),
        urlencoding::encode(state),
    )
}

#[derive(Clone, PartialEq)]
pub struct GoogleTokens {
    pub access_token: String,
    /// Seconds.
    pub expires_in: i64,
    /// Present on a login. Google seldom sends a new one on a refresh; when it
    /// does, it replaces the stored one.
    pub refresh_token: Option<String>,
    /// Present on a login (scope `openid`): who signed in.
    pub id_token: Option<String>,
}

/// Tokens never reach a log or an error message.
impl std::fmt::Debug for GoogleTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GoogleTokens")
            .field("access_token", &"[redacted]")
            .field("expires_in", &self.expires_in)
            .field("refresh_token", &self.refresh_token.as_ref().map(|_| "[redacted]"))
            .field("id_token", &self.id_token.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

/// The token endpoint's answer. `invalid_grant` — revoked, or the 7 days of a
/// Testing app ran out — means signing in again. `invalid_client` (the client
/// deleted) comes back as an API error with that reason.
pub fn parse_token_response(status: u16, body: &str) -> Result<GoogleTokens, YtmError> {
    if !(200..300).contains(&status) {
        let flat = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string));
        if flat.as_deref() == Some("invalid_grant") {
            return Err(YtmError::Reconnect);
        }
        return Err(api_error(status, body));
    }

    let value: Value = serde_json::from_str(body)
        .map_err(|e| YtmError::Network(format!("Google sent an unreadable token response: {e}")))?;
    let text = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_string);
    let access_token = text("access_token")
        .ok_or_else(|| YtmError::Network("Google sent no access token".to_string()))?;
    Ok(GoogleTokens {
        access_token,
        expires_in: value.get("expires_in").and_then(Value::as_i64).unwrap_or(3600),
        refresh_token: text("refresh_token"),
        id_token: text("id_token"),
    })
}

/// Whether a token error says Google does not know this OAuth client.
pub fn is_invalid_client(err: &YtmError) -> bool {
    matches!(err, YtmError::Api { reason: Some(reason), .. } if reason == "invalid_client")
}

async fn post_token(form: &[(&str, &str)]) -> Result<GoogleTokens, YtmError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| YtmError::Network(format!("Could not build HTTP client: {e}")))?;
    let response = client
        .post(TOKEN_URL)
        .form(form)
        .send()
        .await
        .map_err(|e| YtmError::Network(format!("Could not reach Google: {e}")))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| YtmError::Network(format!("Could not read Google's answer: {e}")))?;
    parse_token_response(status, &body)
}

pub async fn exchange_code(
    client: &ClientFile,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<GoogleTokens, YtmError> {
    post_token(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client.client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
        ("code_verifier", verifier),
    ])
    .await
}

pub async fn refresh(client: &ClientFile, refresh_token: &str) -> Result<GoogleTokens, YtmError> {
    post_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client.client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
    ])
    .await
}

/// base64url, as a JWT writes its parts (no padding; a trailing `=` is
/// tolerated). None for any other character.
pub fn base64url_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let mut bits: u32 = 0;
    let mut count = 0;
    for c in text.bytes() {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            b'=' => break,
            _ => return None,
        };
        bits = (bits << 6) | u32::from(value);
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    Some(out)
}

/// The address an `id_token` was issued for. Only shown in Settings, so the
/// signature is not checked: the token came straight from Google over TLS.
pub fn email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let claims: Value = serde_json::from_slice(&base64url_decode(payload)?).ok()?;
    claims
        .get("email")
        .and_then(Value::as_str)
        .filter(|email| !email.is_empty())
        .map(str::to_string)
}

```

- [ ] **Step 4: The live client**

In `src-tauri/src/external/youtube_music.rs`, add to the top `use` lines:

```rust
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
```

and insert directly above `#[cfg(test)]`:

```rust
// --- the live client ----------------------------------------------------

/// `playlistItems`, `playlists` and `videos` all cost 1 unit (`youtube::unit_cost`).
const UNITS_PER_CALL: u32 = 1;

fn network(e: reqwest::Error) -> YtmError {
    if e.is_timeout() {
        YtmError::Network("YouTube did not answer in 30 seconds".to_string())
    } else {
        YtmError::Network(format!("Could not reach YouTube: {e}"))
    }
}

/// The Data API with the user's access token. Counts what it spends, so the
/// caller can add it to the shared quota counter.
pub struct LiveApi {
    http: reqwest::Client,
    token: String,
    spent: AtomicU32,
}

impl LiveApi {
    pub fn new(token: String) -> Result<Self, YtmError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| YtmError::Network(format!("Could not build HTTP client: {e}")))?;
        Ok(Self { http, token, spent: AtomicU32::new(0) })
    }

    /// Units used so far. Google bills the attempt, so a call that failed counts.
    pub fn spent(&self) -> u32 {
        self.spent.load(Ordering::SeqCst)
    }
}

impl YtmApi for LiveApi {
    fn get_json(&self, url: &str) -> impl Future<Output = Result<Value, YtmError>> + Send {
        let url = url.to_string();
        async move {
            let response = self.http.get(&url).bearer_auth(&self.token).send().await;
            // Counted before the answer is judged, as `youtube::call_api` does.
            self.spent.fetch_add(UNITS_PER_CALL, Ordering::SeqCst);
            let response = response.map_err(network)?;
            let status = response.status().as_u16();
            let body = response.text().await.map_err(network)?;
            if !(200..300).contains(&status) {
                return Err(api_error(status, &body));
            }
            serde_json::from_str(&body)
                .map_err(|e| YtmError::Network(format!("YouTube sent unreadable JSON: {e}")))
        }
    }
}

```

The live client has no unit test (neither has Spotify's): it is exercised on the real account in Task 21, where Settings → YouTube Tracklists shows the units a sync spent.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test external::youtube_auth 2>&1 | tail -5`
Expected: PASS — 12 tests.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 399 passed`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/external/youtube_auth.rs src-tauri/src/external/youtube_music.rs src-tauri/src/external/mod.rs
git commit -m "feat(youtube-music): Google sign-in — client file, PKCE with the client secret, the email from the id_token

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Tokens, the 30-minute loop, the `youtube-music-synced` event, and the read commands

**Files:**
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/external/youtube_music.rs` (`YtmError` → `AppError`)
- Modify: `src-tauri/src/commands/youtube.rs` (`record_spend` becomes `pub(crate)`)
- Create: `src-tauri/src/commands/youtube_music.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

`commands/spotify.rs` is the model. What differs:
- the refresh sends the client secret too;
- the loop runs every **30 minutes** and skips while disconnected, waiting for a new sign-in, **hidden**, or on a Pacific day YouTube already said the quota was used up;
- every sync's units go through `record_spend` (`youtube_quota`), the failed ones too;
- a `quotaExceeded` answer stores today's Pacific day (`youtube_music_quota_day`): the status says `quotaUsedUp`, and the loop waits for the next day.

- [ ] **Step 1: The error kinds**

In `src-tauri/src/error.rs`, directly under `Spotify(String),` add:

```rust

    #[error("YouTube Music is not connected -- connect it in Settings")]
    YouTubeMusicNotConnected,

    #[error("YouTube Music needs you to sign in again")]
    YouTubeMusicReconnect,

    /// A pending sign-in was replaced by a newer one, a new client file, or
    /// Disconnect. The frontend ignores it.
    #[error("The YouTube Music sign-in was replaced by a newer one")]
    YouTubeMusicLoginCancelled,

    #[error("{0}")]
    YouTubeMusic(String),
```

In `src-tauri/src/external/youtube_music.rs`, directly above `#[cfg(test)]` add:

```rust
impl From<YtmError> for crate::error::AppError {
    fn from(err: YtmError) -> Self {
        use crate::error::AppError;
        match err {
            YtmError::NotConnected => AppError::YouTubeMusicNotConnected,
            YtmError::Reconnect => AppError::YouTubeMusicReconnect,
            // The same kind Sets uses: the frontend already words it.
            YtmError::QuotaExceeded => AppError::YtQuotaExceeded,
            other => AppError::YouTubeMusic(other.to_string()),
        }
    }
}

```

In `src-tauri/src/commands/youtube.rs`, change `fn record_spend(state: &AppState, units: u32)` to `pub(crate) fn record_spend(state: &AppState, units: u32)`.

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/commands/youtube_music.rs` with only this, for now:

```rust
// src-tauri/src/commands/youtube_music.rs
//! Tauri commands for the YouTube Music section, and the loop that keeps it in sync.

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: &str = "2026-10-03";

    fn fresh() -> Database {
        let db = Database::new_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    fn tokens(access: &str, expires_in: i64) -> GoogleTokens {
        GoogleTokens { access_token: access.into(), expires_in, refresh_token: None, id_token: None }
    }

    #[test]
    fn the_synced_event_reads_as_the_frontend_expects() {
        let payload = SyncedPayload {
            changed: true,
            last_synced_at: Some(5),
            error: None,
            error_kind: None,
            needs_reconnect: false,
        };
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({
                "changed": true, "lastSyncedAt": 5, "error": null, "errorKind": null, "needsReconnect": false
            })
        );
        let failed = SyncedPayload {
            error: Some("x".into()),
            error_kind: Some(SyncErrorKind::QuotaExceeded),
            ..SyncedPayload::cleared()
        };
        assert_eq!(serde_json::to_value(failed).unwrap()["errorKind"], "quotaExceeded");
    }

    #[test]
    fn youtube_music_errors_keep_their_meaning_across_ipc() {
        assert!(matches!(AppError::from(YtmError::Reconnect), AppError::YouTubeMusicReconnect));
        assert!(matches!(AppError::from(YtmError::NotConnected), AppError::YouTubeMusicNotConnected));
        assert!(matches!(AppError::from(YtmError::QuotaExceeded), AppError::YtQuotaExceeded));
        assert!(matches!(
            AppError::from(YtmError::Network("offline".into())),
            AppError::YouTubeMusic(message) if message == "offline"
        ));
    }

    #[test]
    fn the_loop_syncs_only_a_connected_shown_account_with_quota_left() {
        let db = fresh();
        assert!(!should_sync(&db, DAY));

        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        assert!(should_sync(&db, DAY));

        db.set_setting(NEEDS_RECONNECT_SETTING, "1").unwrap();
        assert!(!should_sync(&db, DAY));
        db.set_setting(NEEDS_RECONNECT_SETTING, "").unwrap();

        // Hidden: the loop skips, and the sign-in and the rows stay.
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "0").unwrap();
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().connected);
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, "1").unwrap();
        assert!(should_sync(&db, DAY));
    }

    #[test]
    fn a_used_up_quota_pauses_the_loop_until_the_next_pacific_day() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        db.set_setting(LAST_SYNCED_SETTING, "42").unwrap();

        let last = record_failure(&db, "quota", SyncErrorKind::QuotaExceeded, DAY).unwrap();
        assert_eq!(last, Some(42), "the event carries the last good sync");
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().quota_used_up);
        assert!(should_sync(&db, "2026-10-04"));
        assert!(!read_status(&db, "2026-10-04").unwrap().quota_used_up);

        // Any other failure leaves the loop running.
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        record_failure(&db, "offline", SyncErrorKind::Network, DAY).unwrap();
        assert!(should_sync(&db, DAY));

        // A good sync clears what a failure left.
        record_failure(&db, "quota", SyncErrorKind::QuotaExceeded, DAY).unwrap();
        record_success(&db, 99).unwrap();
        let status = read_status(&db, DAY).unwrap();
        assert!(!status.quota_used_up);
        assert_eq!(status.last_error, None);
        assert_eq!(status.last_synced_at, Some(99));
    }

    #[test]
    fn a_cached_token_is_used_until_a_minute_before_it_runs_out() {
        let ytm = YouTubeMusicState::default();
        assert_eq!(cached_access(&ytm), None);
        remember_access(&ytm, &tokens("AT", 3599));
        assert_eq!(cached_access(&ytm).as_deref(), Some("AT"));
        remember_access(&ytm, &tokens("OLD", 30));
        assert_eq!(cached_access(&ytm), None);
        remember_access(&ytm, &tokens("AT", 3599));
        forget_access(&ytm);
        assert_eq!(cached_access(&ytm), None);
    }

    #[test]
    fn a_fresh_install_is_not_connected_and_shows_in_the_sidebar() {
        assert_eq!(
            read_status(&fresh(), DAY).unwrap(),
            YouTubeMusicStatusDTO {
                has_client: false,
                connected: false,
                email: None,
                needs_reconnect: false,
                show_in_sidebar: true,
                last_synced_at: None,
                last_error: None,
                last_error_kind: None,
                quota_used_up: false,
            }
        );
    }

    #[test]
    fn the_status_reads_what_was_saved() {
        let db = fresh();
        for (key, value) in [
            (CLIENT_ID_SETTING, "cid"),
            (CLIENT_SECRET_SETTING, "secret"),
            (REFRESH_TOKEN_SETTING, "rt"),
            (EMAIL_SETTING, "dj@example.com"),
            (LAST_SYNCED_SETTING, "1700000000000"),
            (LAST_ERROR_SETTING, "Could not reach YouTube"),
            (LAST_ERROR_KIND_SETTING, "network"),
            (NEEDS_RECONNECT_SETTING, "1"),
        ] {
            db.set_setting(key, value).unwrap();
        }
        let status = read_status(&db, DAY).unwrap();
        assert!(status.has_client);
        assert!(status.connected);
        assert_eq!(status.email.as_deref(), Some("dj@example.com"));
        assert!(status.needs_reconnect);
        assert_eq!(status.last_synced_at, Some(1_700_000_000_000));
        assert_eq!(status.last_error.as_deref(), Some("Could not reach YouTube"));
        assert_eq!(status.last_error_kind, Some(SyncErrorKind::Network));

        // A client id without its secret is not a client.
        db.set_setting(CLIENT_SECRET_SETTING, "").unwrap();
        assert!(!read_status(&db, DAY).unwrap().has_client);
        // No error, no kind — even if a stale kind were left behind.
        db.set_setting(LAST_ERROR_SETTING, "").unwrap();
        assert_eq!(read_status(&db, DAY).unwrap().last_error_kind, None);
    }

    #[test]
    fn sync_failures_are_sorted_into_the_kinds_the_view_words() {
        assert_eq!(SyncErrorKind::of(&YtmError::Network("offline".into())), SyncErrorKind::Network);
        assert_eq!(SyncErrorKind::of(&YtmError::QuotaExceeded), SyncErrorKind::QuotaExceeded);
        let api = YtmError::Api { status: 500, message: String::new(), reason: None };
        assert_eq!(SyncErrorKind::of(&api), SyncErrorKind::Other);
        for kind in [SyncErrorKind::Network, SyncErrorKind::QuotaExceeded, SyncErrorKind::Other] {
            assert_eq!(SyncErrorKind::parse(kind.as_str()), Some(kind));
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.as_str());
        }
        let failure = SyncFailure::from(YtmError::QuotaExceeded);
        assert_eq!(failure.kind, SyncErrorKind::QuotaExceeded);
        assert!(!failure.needs_reconnect);
        assert!(SyncFailure::from(YtmError::Reconnect).needs_reconnect);
    }

    #[test]
    fn an_unknown_client_on_refresh_asks_to_reconnect_like_a_revoked_token() {
        let revoked = refresh_failure(YtmError::Reconnect);
        assert!(revoked.needs_reconnect);
        assert!(matches!(revoked.error, AppError::YouTubeMusicReconnect));

        let deleted = refresh_failure(YtmError::Api {
            status: 401,
            message: "The OAuth client was not found.".into(),
            reason: Some("invalid_client".into()),
        });
        assert!(deleted.needs_reconnect);
        assert!(deleted.error.to_string().contains("client file"));

        let other = refresh_failure(YtmError::Network("offline".into()));
        assert!(!other.needs_reconnect);
        assert_eq!(other.kind, SyncErrorKind::Network);
    }

    #[test]
    fn writes_after_a_refresh_happen_only_while_its_token_is_still_stored() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt1").unwrap();
        let wrote = if_signed_in_with(&db, "rt1", |db| {
            db.set_setting(REFRESH_TOKEN_SETTING, "rt2").map_err(db_err)
        })
        .unwrap();
        assert_eq!(wrote, Some(()));

        let late = if_signed_in_with(&db, "rt1", |db| {
            db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
        })
        .unwrap();
        assert_eq!(late, None);
        assert_eq!(setting(&db, NEEDS_RECONNECT_SETTING).unwrap(), None);
    }
}
```

In `src-tauri/src/commands/mod.rs`, directly under `pub mod youtube;` add:

```rust
pub mod youtube_music;
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd src-tauri && cargo test commands::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find type Database`, `SyncedPayload`, `YouTubeMusicState`, and so on.

- [ ] **Step 4: State, tokens, the sync, the loop and the read commands**

Insert between the module comment and `#[cfg(test)]`:

```rust
//!
//! YouTube is read, never written: no likes, no playlist edits. The client
//! file's two values, the refresh token and the email live in the settings
//! table, like Spotify's; access tokens only in memory, refreshed when they
//! run out. Every call is counted in the shared YouTube quota.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::library::AppState;
use crate::commands::spotify::now_ms;
use crate::commands::youtube::{record_spend, with_db};
use crate::db::youtube_music::{SyncBaseline, SyncChanges, YtmLibraryDump};
use crate::db::Database;
use crate::error::AppError;
use crate::external::youtube_auth::{self, ClientFile, GoogleTokens};
use crate::external::youtube_music::{self as web_api, LiveApi, YtmError};
use crate::external::youtube_time::{now_unix, pacific_day};

const CLIENT_ID_SETTING: &str = "youtube_music_client_id";
const CLIENT_SECRET_SETTING: &str = "youtube_music_client_secret";
const REFRESH_TOKEN_SETTING: &str = "youtube_music_refresh_token";
/// Who signed in, for showing only.
const EMAIL_SETTING: &str = "youtube_music_email";
/// "0" hides the section and pauses the loop. Absent, it shows.
const SHOW_IN_SIDEBAR_SETTING: &str = "youtube_music_show_in_sidebar";
const LAST_SYNCED_SETTING: &str = "youtube_music_last_synced_at";
const LAST_ERROR_SETTING: &str = "youtube_music_last_error";
const LAST_ERROR_KIND_SETTING: &str = "youtube_music_last_error_kind";
const NEEDS_RECONNECT_SETTING: &str = "youtube_music_needs_reconnect";
/// The Pacific day YouTube answered `quotaExceeded`: the loop waits for the next.
const QUOTA_DAY_SETTING: &str = "youtube_music_quota_day";

pub const SYNCED_EVENT: &str = "youtube-music-synced";
/// Spotify's loop runs every 10 minutes. This one shares the day's quota with Sets.
const SYNC_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// How often the loop looks for the database before the frontend has opened it.
const DB_POLL: Duration = Duration::from_secs(5);
/// An access token with less than this left is refreshed first.
const TOKEN_MARGIN_MS: i64 = 60_000;

#[derive(Clone)]
struct AccessToken {
    token: String,
    expires_at_ms: i64,
}

/// In-memory YouTube Music state, managed by Tauri.
#[derive(Default)]
pub struct YouTubeMusicState {
    access: Mutex<Option<AccessToken>>,
    /// One token refresh at a time.
    refresh: tokio::sync::Mutex<()>,
    /// One sync at a time: the loop, the "synced …" click, a fresh login and
    /// adding a playlist share it.
    sync_lock: tokio::sync::Mutex<()>,
}

/// Why a sync failed, in the few kinds the view words differently.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SyncErrorKind {
    /// YouTube or Google could not be reached.
    Network,
    /// The day's units are used up: "resumes after midnight Pacific".
    QuotaExceeded,
    Other,
}

impl SyncErrorKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Network => "network",
            Self::QuotaExceeded => "quotaExceeded",
            Self::Other => "other",
        }
    }

    fn parse(raw: &str) -> Option<Self> {
        [Self::Network, Self::QuotaExceeded, Self::Other]
            .into_iter()
            .find(|kind| kind.as_str() == raw)
    }

    fn of(err: &YtmError) -> Self {
        match err {
            YtmError::Network(_) => Self::Network,
            YtmError::QuotaExceeded => Self::QuotaExceeded,
            _ => Self::Other,
        }
    }
}

/// A failed sync step: the error, its kind, and whether the user has to sign in again.
#[derive(Debug)]
struct SyncFailure {
    error: AppError,
    kind: SyncErrorKind,
    needs_reconnect: bool,
}

impl From<AppError> for SyncFailure {
    fn from(error: AppError) -> Self {
        let needs_reconnect = matches!(error, AppError::YouTubeMusicReconnect);
        Self { error, kind: SyncErrorKind::Other, needs_reconnect }
    }
}

impl From<YtmError> for SyncFailure {
    fn from(err: YtmError) -> Self {
        let kind = SyncErrorKind::of(&err);
        Self { kind, ..AppError::from(err).into() }
    }
}

/// The `youtube-music-synced` payload, shaped like `spotify-synced`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedPayload {
    pub changed: bool,
    /// Unix ms of the last successful sync — on a failure, the previous one.
    pub last_synced_at: Option<i64>,
    pub error: Option<String>,
    /// Set with `error`.
    pub error_kind: Option<SyncErrorKind>,
    pub needs_reconnect: bool,
}

impl SyncedPayload {
    /// The account went or changed: the sidebar and the view reload.
    fn cleared() -> Self {
        Self { changed: true, last_synced_at: None, error: None, error_kind: None, needs_reconnect: false }
    }

    /// Not a sync — a playlist added or removed, the switch — but the status
    /// or the rows changed: everyone reads them again.
    fn from_status(status: &YouTubeMusicStatusDTO, changed: bool) -> Self {
        Self {
            changed,
            last_synced_at: status.last_synced_at,
            error: status.last_error.clone(),
            error_kind: status.last_error_kind,
            needs_reconnect: status.needs_reconnect,
        }
    }
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Database(e.to_string())
}

/// A setting, with an empty value read as absent — clearing writes "".
fn setting(db: &Database, key: &str) -> Result<Option<String>, AppError> {
    Ok(db.get_setting(key).map_err(db_err)?.filter(|v| !v.trim().is_empty()))
}

/// The quota's Pacific day, now.
fn today() -> String {
    pacific_day(now_unix())
}

fn shows_in_sidebar(db: &Database) -> bool {
    !matches!(setting(db, SHOW_IN_SIDEBAR_SETTING), Ok(Some(value)) if value == "0")
}

/// Connected, not waiting for a new sign-in, in the sidebar, and not on a day
/// YouTube already said the quota is used up.
fn should_sync(db: &Database, today: &str) -> bool {
    matches!(setting(db, REFRESH_TOKEN_SETTING), Ok(Some(_)))
        && matches!(setting(db, NEEDS_RECONNECT_SETTING), Ok(None))
        && shows_in_sidebar(db)
        && !matches!(setting(db, QUOTA_DAY_SETTING), Ok(Some(day)) if day == today)
}

/// Both values of the chosen client file, or None until one was chosen.
fn client_file(db: &Database) -> Result<Option<ClientFile>, AppError> {
    Ok(match (setting(db, CLIENT_ID_SETTING)?, setting(db, CLIENT_SECRET_SETTING)?) {
        (Some(client_id), Some(client_secret)) => Some(ClientFile { client_id, client_secret }),
        _ => None,
    })
}

fn remember_access(ytm: &YouTubeMusicState, tokens: &GoogleTokens) {
    if let Ok(mut slot) = ytm.access.lock() {
        *slot = Some(AccessToken {
            token: tokens.access_token.clone(),
            expires_at_ms: now_ms() + tokens.expires_in * 1000,
        });
    }
}

fn cached_access(ytm: &YouTubeMusicState) -> Option<String> {
    let cached = ytm.access.lock().ok()?.clone()?;
    (cached.expires_at_ms - now_ms() > TOKEN_MARGIN_MS).then_some(cached.token)
}

fn forget_access(ytm: &YouTubeMusicState) {
    if let Ok(mut slot) = ytm.access.lock() {
        *slot = None;
    }
}

/// Runs `write` only while `used` is still the stored refresh token — not after
/// a disconnect, a new client file or a newer login replaced it.
fn if_signed_in_with<T>(
    db: &Database,
    used: &str,
    write: impl FnOnce(&Database) -> Result<T, AppError>,
) -> Result<Option<T>, AppError> {
    if setting(db, REFRESH_TOKEN_SETTING)?.as_deref() != Some(used) {
        return Ok(None);
    }
    write(db).map(Some)
}

/// A usable access token, refreshing it when it is about to run out.
async fn access_token(app_state: &AppState, ytm: &YouTubeMusicState) -> Result<String, SyncFailure> {
    if let Some(token) = cached_access(ytm) {
        return Ok(token);
    }
    let _refreshing = ytm.refresh.lock().await;
    // Whoever held the lock may have refreshed already.
    if let Some(token) = cached_access(ytm) {
        return Ok(token);
    }

    let (client, refresh_token) =
        with_db(app_state, |db| Ok((client_file(db)?, setting(db, REFRESH_TOKEN_SETTING)?)))?;
    let (Some(client), Some(refresh_token)) = (client, refresh_token) else {
        return Err(AppError::YouTubeMusicNotConnected.into());
    };

    let tokens = match youtube_auth::refresh(&client, &refresh_token).await {
        Ok(tokens) => tokens,
        Err(err) => {
            let failure = refresh_failure(err);
            if failure.needs_reconnect {
                let _ = with_db(app_state, |db| {
                    if_signed_in_with(db, &refresh_token, |db| {
                        db.set_setting(NEEDS_RECONNECT_SETTING, "1").map_err(db_err)
                    })
                });
            }
            return Err(failure);
        }
    };

    let kept = with_db(app_state, |db| {
        if_signed_in_with(db, &refresh_token, |db| {
            if let Some(rotated) = &tokens.refresh_token {
                db.set_setting(REFRESH_TOKEN_SETTING, rotated).map_err(db_err)?;
            }
            // Cached under the database lock, as disconnecting clears it there.
            remember_access(ytm, &tokens);
            Ok(())
        })
    })?;
    if kept.is_none() {
        return Err(AppError::YouTubeMusicNotConnected.into());
    }
    Ok(tokens.access_token)
}

/// A failed refresh. `invalid_grant` (revoked, or expired while the Google
/// app is in Testing) and `invalid_client` (the client deleted) both put up
/// the Reconnect bar.
fn refresh_failure(err: YtmError) -> SyncFailure {
    if youtube_auth::is_invalid_client(&err) {
        return SyncFailure {
            error: AppError::YouTubeMusic(
                "Google does not know this OAuth client any more — choose the client file again in Settings, then reconnect"
                    .to_string(),
            ),
            kind: SyncErrorKind::Other,
            needs_reconnect: true,
        };
    }
    err.into()
}

/// The outer error is about getting a token; the inner one is YouTube's answer.
/// The units go to the shared counter either way: Google bills the attempt.
async fn fetch_with_token(
    app_state: &AppState,
    ytm: &YouTubeMusicState,
    baseline: &SyncBaseline,
    now: i64,
) -> Result<Result<SyncChanges, YtmError>, SyncFailure> {
    let live = LiveApi::new(access_token(app_state, ytm).await?)?;
    let fetched = web_api::fetch_changes(&live, baseline, now).await;
    if live.spent() > 0 {
        let _ = record_spend(app_state, live.spent());
    }
    Ok(fetched)
}

async fn sync_once(app_state: &AppState, ytm: &YouTubeMusicState) -> Result<bool, SyncFailure> {
    let now = now_ms();
    let baseline = with_db(app_state, |db| db.ytm_baseline().map_err(db_err))?;
    let mut fetched = fetch_with_token(app_state, ytm, &baseline, now).await?;
    // A revoked grant kills the access token before it expires: drop it and
    // refresh once, which then answers invalid_grant.
    if matches!(fetched, Err(YtmError::Api { status: 401, .. })) {
        forget_access(ytm);
        fetched = fetch_with_token(app_state, ytm, &baseline, now).await?;
    }
    let changes = fetched?;
    Ok(with_db(app_state, |db| db.apply_ytm_sync(&changes, now).map_err(db_err))?)
}

/// What a successful sync leaves in settings.
fn record_success(db: &Database, now: i64) -> Result<(), AppError> {
    db.set_setting(LAST_SYNCED_SETTING, &now.to_string()).map_err(db_err)?;
    for key in [LAST_ERROR_SETTING, LAST_ERROR_KIND_SETTING, NEEDS_RECONNECT_SETTING, QUOTA_DAY_SETTING] {
        db.set_setting(key, "").map_err(db_err)?;
    }
    Ok(())
}

/// What a failed sync leaves in settings. Answers the last good sync's time,
/// for the event.
fn record_failure(
    db: &Database,
    message: &str,
    kind: SyncErrorKind,
    today: &str,
) -> Result<Option<i64>, AppError> {
    db.set_setting(LAST_ERROR_SETTING, message).map_err(db_err)?;
    db.set_setting(LAST_ERROR_KIND_SETTING, kind.as_str()).map_err(db_err)?;
    if kind == SyncErrorKind::QuotaExceeded {
        db.set_setting(QUOTA_DAY_SETTING, today).map_err(db_err)?;
    }
    Ok(setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()))
}

/// One sync, shared by the loop, the "synced …" click and the switch turned
/// back on. Emits `youtube-music-synced` afterwards, changed or not, and on
/// failure. Returns None, without emitting, when another sync is running (it
/// will report) or no account is connected.
pub async fn run_sync(app: &AppHandle) -> Option<SyncedPayload> {
    let ytm = app.state::<YouTubeMusicState>();
    let Ok(_running) = ytm.sync_lock.try_lock() else {
        return None;
    };
    sync_and_report(app).await
}

/// One sync and its event. The caller holds the sync lock.
async fn sync_and_report(app: &AppHandle) -> Option<SyncedPayload> {
    let app_state = app.state::<AppState>();
    let ytm = app.state::<YouTubeMusicState>();

    let payload = match sync_once(&app_state, &ytm).await {
        Ok(changed) => {
            let now = now_ms();
            let _ = with_db(&app_state, |db| record_success(db, now));
            SyncedPayload { changed, last_synced_at: Some(now), error: None, error_kind: None, needs_reconnect: false }
        }
        Err(SyncFailure { error: AppError::YouTubeMusicNotConnected, .. }) => return None,
        Err(failure) => {
            let message = failure.error.to_string();
            let last_synced_at = with_db(&app_state, |db| record_failure(db, &message, failure.kind, &today()))
                .ok()
                .flatten();
            SyncedPayload {
                changed: false,
                last_synced_at,
                error: Some(message),
                error_kind: Some(failure.kind),
                needs_reconnect: failure.needs_reconnect,
            }
        }
    };

    let _ = app.emit(SYNCED_EVENT, &payload);
    Some(payload)
}

fn db_ready(app: &AppHandle) -> bool {
    app.state::<AppState>().db.lock().map(|db| db.is_some()).unwrap_or(false)
}

fn sync_due(app: &AppHandle) -> bool {
    with_db(&app.state::<AppState>(), |db| Ok(should_sync(db, &today()))).unwrap_or(false)
}

/// Syncs at start-up and every 30 minutes while the app is open — when
/// connected, shown, and not waiting for tomorrow's quota.
pub fn spawn_youtube_music_sync_loop(app: AppHandle) {
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

// --- commands ----------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeMusicStatusDTO {
    /// A client file was chosen: Connect can work.
    pub has_client: bool,
    pub connected: bool,
    pub email: Option<String>,
    pub needs_reconnect: bool,
    /// Settings → YouTube Music → Show in sidebar.
    pub show_in_sidebar: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    /// Set with `last_error`.
    pub last_error_kind: Option<SyncErrorKind>,
    /// YouTube said the quota is used up today (Pacific): the loop waits.
    pub quota_used_up: bool,
}

fn read_status(db: &Database, today: &str) -> Result<YouTubeMusicStatusDTO, AppError> {
    Ok(YouTubeMusicStatusDTO {
        has_client: client_file(db)?.is_some(),
        connected: setting(db, REFRESH_TOKEN_SETTING)?.is_some(),
        email: setting(db, EMAIL_SETTING)?,
        needs_reconnect: setting(db, NEEDS_RECONNECT_SETTING)?.is_some(),
        show_in_sidebar: shows_in_sidebar(db),
        last_synced_at: setting(db, LAST_SYNCED_SETTING)?.and_then(|v| v.parse().ok()),
        last_error: setting(db, LAST_ERROR_SETTING)?,
        last_error_kind: setting(db, LAST_ERROR_SETTING)?
            .and(setting(db, LAST_ERROR_KIND_SETTING)?)
            .and_then(|raw| SyncErrorKind::parse(&raw)),
        quota_used_up: setting(db, QUOTA_DAY_SETTING)?.as_deref() == Some(today),
    })
}

#[tauri::command]
pub async fn get_youtube_music_status(state: State<'_, AppState>) -> Result<YouTubeMusicStatusDTO, AppError> {
    with_db(&state, |db| read_status(db, &today()))
}

/// The result arrives as a `youtube-music-synced` event.
#[tauri::command]
pub async fn sync_youtube_music_now(app: AppHandle) -> Result<(), AppError> {
    let _ = run_sync(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn get_youtube_music_library(state: State<'_, AppState>) -> Result<YtmLibraryDump, AppError> {
    with_db(&state, |db| db.get_ytm_library().map_err(db_err))
}

/// Answers the time written, so the frontend can update its copy exactly.
#[tauri::command]
pub async fn mark_youtube_music_list_opened(state: State<'_, AppState>, list_id: String) -> Result<i64, AppError> {
    let now = now_ms();
    with_db(&state, |db| db.mark_ytm_list_opened(&list_id, now).map_err(db_err))?;
    Ok(now)
}

#[tauri::command]
pub async fn set_youtube_music_verdict(
    state: State<'_, AppState>,
    video_id: String,
    library_track_id: i64,
    verdict: String,
) -> Result<(), AppError> {
    if verdict != "yes" && verdict != "no" {
        return Err(AppError::Validation(format!("Unknown answer: {verdict}")));
    }
    with_db(&state, |db| db.set_ytm_verdict(&video_id, library_track_id, &verdict).map_err(db_err))
}

```

- [ ] **Step 5: Register the state, the loop and the commands**

In `src-tauri/src/lib.rs`:
- in `.setup(|app| { … })`, directly under `commands::spotify::spawn_spotify_sync_loop(app.handle().clone());` add:

```rust
            // Syncs Liked music and the added playlists on start and every 30
            // minutes. Does nothing until a Google account is connected.
            commands::youtube_music::spawn_youtube_music_sync_loop(app.handle().clone());
```

- directly under `.manage(commands::spotify::SpotifyState::default())` add:

```rust
        .manage(commands::youtube_music::YouTubeMusicState::default())
```

- directly under `commands::spotify::set_spotify_show_in_sidebar,` add:

```rust
            // YouTube Music
            commands::youtube_music::get_youtube_music_status,
            commands::youtube_music::sync_youtube_music_now,
            commands::youtube_music::get_youtube_music_library,
            commands::youtube_music::mark_youtube_music_list_opened,
            commands::youtube_music::set_youtube_music_verdict,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test commands::youtube_music 2>&1 | tail -5`
Expected: PASS — 10 tests.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result'`
Expected: `ok. 409 passed`. The build warns that `SyncedPayload::from_status` is unused; Task 10 uses it.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/external/youtube_music.rs src-tauri/src/commands/youtube.rs src-tauri/src/commands/youtube_music.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(youtube-music): tokens, the 30-minute sync loop and the youtube-music-synced event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Connect, disconnect, the client file, playlists by link, Show in sidebar

**Files:**
- Modify: `src-tauri/src/commands/youtube_music.rs`
- Modify: `src-tauri/src/lib.rs`

As in Spotify: the newest Connect wins, and a login generation stops one already past the browser from signing back in after Disconnect or a new client file. What differs: port 0, the client secret, the email from the `id_token`, and the file read in Rust (the webview has no file-system access, and only its two values are kept).

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`)

```rust
    #[test]
    fn disconnecting_keeps_the_client_the_playlists_and_the_switch() {
        let db = fresh();
        for (key, value) in [
            (CLIENT_ID_SETTING, "cid"),
            (CLIENT_SECRET_SETTING, "secret"),
            (REFRESH_TOKEN_SETTING, "rt"),
            (EMAIL_SETTING, "dj@example.com"),
            (LAST_SYNCED_SETTING, "1"),
            (QUOTA_DAY_SETTING, DAY),
            (SHOW_IN_SIDEBAR_SETTING, "0"),
        ] {
            db.set_setting(key, value).unwrap();
        }
        db.add_ytm_list("PL1", "Deep", 1).unwrap();

        forget_account(&db).unwrap();

        let status = read_status(&db, DAY).unwrap();
        assert!(!status.connected);
        assert_eq!(status.email, None);
        assert_eq!(status.last_synced_at, None);
        assert!(!status.quota_used_up);
        assert!(status.has_client, "connecting again needs no new file");
        assert!(!status.show_in_sidebar, "a preference, not part of the account");
        assert!(db.has_ytm_list("PL1").unwrap(), "added playlists cannot come back on their own");
    }

    #[test]
    fn the_newest_login_wins_and_a_disconnect_cancels_one_past_the_browser() {
        let ytm = YouTubeMusicState::default();
        let first = begin_login(&ytm);
        assert!(login_is_current(&ytm, first));
        let second = begin_login(&ytm);
        assert!(!login_is_current(&ytm, first));
        assert!(login_is_current(&ytm, second));

        let (cancel, mut cancelled) = tokio::sync::oneshot::channel();
        *ytm.pending_login.lock().unwrap() = Some(cancel);
        cancel_pending_login(&ytm);
        assert_eq!(cancelled.try_recv(), Ok(()));
        assert!(ytm.pending_login.lock().unwrap().is_none());
        assert!(!login_is_current(&ytm, second));
        cancel_pending_login(&ytm); // nothing waiting: nothing happens
    }

    #[test]
    fn a_client_file_is_read_from_disk_and_only_its_two_values_kept() {
        let dir = tempfile::tempdir().unwrap();

        let desktop = dir.path().join("client_secret_desktop.json");
        std::fs::write(
            &desktop,
            r#"{"installed":{"client_id":"cid.apps.googleusercontent.com","client_secret":"GOCSPX-x"}}"#,
        )
        .unwrap();
        assert_eq!(
            read_client_file(&desktop).unwrap(),
            ClientFile { client_id: "cid.apps.googleusercontent.com".into(), client_secret: "GOCSPX-x".into() }
        );

        let web = dir.path().join("client_secret_web.json");
        std::fs::write(&web, r#"{"web":{"client_id":"w","client_secret":"s"}}"#).unwrap();
        assert!(matches!(read_client_file(&web), Err(AppError::Validation(m)) if m.contains("Desktop app")));

        let big = dir.path().join("big.json");
        std::fs::write(&big, "x".repeat(70 * 1024)).unwrap();
        assert!(matches!(read_client_file(&big), Err(AppError::Validation(_))));

        assert!(matches!(read_client_file(&dir.path().join("missing.json")), Err(AppError::Validation(_))));
    }

    #[test]
    fn a_dead_access_token_is_refreshed_and_tried_once_more() {
        let revoked: Result<(), YtmError> =
            Err(YtmError::Api { status: 401, message: String::new(), reason: None });
        assert!(token_went_stale(&revoked));
        let forbidden: Result<(), YtmError> =
            Err(YtmError::Api { status: 403, message: String::new(), reason: None });
        assert!(!token_went_stale(&forbidden));
        assert!(!token_went_stale(&Err::<(), _>(YtmError::QuotaExceeded)));
        assert!(!token_went_stale(&Ok::<(), YtmError>(())));
    }

    #[test]
    fn a_used_up_quota_while_adding_a_playlist_pauses_the_loop_as_a_sync_does() {
        let db = fresh();
        db.set_setting(REFRESH_TOKEN_SETTING, "rt").unwrap();
        note_failed_call(&db, &YtmError::Network("offline".into()), DAY).unwrap();
        assert!(should_sync(&db, DAY), "only the quota pauses the loop");

        note_failed_call(&db, &YtmError::QuotaExceeded, DAY).unwrap();
        assert!(!should_sync(&db, DAY));
        assert!(read_status(&db, DAY).unwrap().quota_used_up);
        assert!(should_sync(&db, "2026-10-04"));
    }

    #[test]
    fn a_link_to_add_is_checked_before_anything_is_spent() {
        assert_eq!(playlist_to_add("https://music.youtube.com/playlist?list=PL123").unwrap(), "PL123");
        for refused in [
            "https://music.youtube.com/playlist?list=LM",
            "https://www.youtube.com/playlist?list=LL",
            "not a link",
            "",
        ] {
            assert!(matches!(playlist_to_add(refused), Err(AppError::Validation(_))), "{refused}");
        }
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test commands::youtube_music 2>&1 | tail -20`
Expected: FAIL to compile — `cannot find function forget_account`, `begin_login`, `read_client_file`, `playlist_to_add`, `token_went_stale`, `note_failed_call`; `no field pending_login`.

- [ ] **Step 3: The login state and the helpers**

Change the top `use` lines to:

```rust
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use crate::commands::library::AppState;
use crate::commands::spotify::now_ms;
use crate::commands::youtube::{record_spend, with_db};
use crate::db::youtube_music::{SyncBaseline, SyncChanges, YtmLibraryDump, LIKED_MUSIC_ID};
use crate::db::Database;
use crate::error::AppError;
use crate::external::spotify_auth::{self, CallbackError};
use crate::external::youtube_auth::{self, ClientFile, GoogleTokens};
use crate::external::youtube_music::{self as web_api, LiveApi, YtmError};
use crate::external::youtube_time::{now_unix, pacific_day};
```

In `YouTubeMusicState`, directly under the `sync_lock` field add:

```rust
    /// One login at a time.
    login: tokio::sync::Mutex<()>,
    /// Fired to cancel the sign-in waiting in the browser, if there is one.
    pending_login: Mutex<Option<oneshot::Sender<()>>>,
    /// Bumped by every new login and every cancel (a newer Connect, a new
    /// client file, Disconnect). A login saves only while its number is current.
    login_generation: AtomicU64,
```

In `sync_once`, replace `if matches!(fetched, Err(YtmError::Api { status: 401, .. })) {` with `if token_went_stale(&fetched) {`, so a sync and adding a playlist share the rule.

Directly above `// --- commands ---`, add:

```rust
/// Like `run_sync`, but waits for a running sync instead of skipping: a fresh
/// login's first sync must not be lost to the loop's.
async fn run_sync_after_others(app: &AppHandle) -> Option<SyncedPayload> {
    let ytm = app.state::<YouTubeMusicState>();
    let _running = ytm.sync_lock.lock().await;
    sync_and_report(app).await
}

/// Cancels the sign-in waiting in the browser, if any; its listener stops and
/// frees the port. A login already past the browser finds its generation stale.
fn cancel_pending_login(ytm: &YouTubeMusicState) {
    ytm.login_generation.fetch_add(1, Ordering::SeqCst);
    if let Some(cancel) = ytm.pending_login.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = cancel.send(());
    }
}

/// Starts a login: it now holds the newest generation.
fn begin_login(ytm: &YouTubeMusicState) -> u64 {
    ytm.login_generation.fetch_add(1, Ordering::SeqCst) + 1
}

fn login_is_current(ytm: &YouTubeMusicState, generation: u64) -> bool {
    ytm.login_generation.load(Ordering::SeqCst) == generation
}

/// Everything about the account and every synced video, pair and verdict.
/// The client file's values stay, and so do the playlists added by link (with
/// their sync state cleared) and the switch.
fn forget_account(db: &Database) -> Result<(), AppError> {
    for key in [
        REFRESH_TOKEN_SETTING,
        EMAIL_SETTING,
        LAST_SYNCED_SETTING,
        LAST_ERROR_SETTING,
        LAST_ERROR_KIND_SETTING,
        NEEDS_RECONNECT_SETTING,
        QUOTA_DAY_SETTING,
    ] {
        db.delete_setting(key).map_err(db_err)?;
    }
    db.clear_ytm_account().map_err(db_err)
}

/// A client file is a few hundred bytes; anything this big is something else.
const MAX_CLIENT_FILE_BYTES: u64 = 64 * 1024;

/// Reads the client file the user chose. Only its two values are kept; the
/// file is not copied anywhere.
fn read_client_file(path: &Path) -> Result<ClientFile, AppError> {
    let unreadable = |e: std::io::Error| AppError::Validation(format!("Could not read that file: {e}"));
    if std::fs::metadata(path).map_err(unreadable)?.len() > MAX_CLIENT_FILE_BYTES {
        return Err(AppError::Validation(youtube_auth::NOT_A_CLIENT_FILE.to_string()));
    }
    let raw = std::fs::read_to_string(path).map_err(unreadable)?;
    youtube_auth::parse_client_file(&raw).map_err(AppError::Validation)
}

/// The playlist id a link names, checked before any unit is spent.
fn playlist_to_add(link: &str) -> Result<String, AppError> {
    let id = web_api::playlist_id_from_link(link).ok_or_else(|| {
        AppError::Validation("Paste a playlist link (…?list=…) or a playlist id".to_string())
    })?;
    match id.as_str() {
        LIKED_MUSIC_ID => Err(AppError::Validation("Liked music is already in the sidebar".to_string())),
        "LL" => Err(AppError::Validation(
            "Liked videos mixes in videos that are not music — RecoDeck reads Liked music instead".to_string(),
        )),
        _ => Ok(id),
    }
}

/// Said under the + Add playlist field when YouTube shows no such playlist.
const NOT_FOUND: &str = "Not found — private playlists work only from the account that owns them";

/// A 401 means the access token died before its time — the grant was revoked
/// at Google. Drop it and refresh once; the refresh then answers
/// `invalid_grant`, which puts up the Reconnect bar.
fn token_went_stale<T>(fetched: &Result<T, YtmError>) -> bool {
    matches!(fetched, Err(YtmError::Api { status: 401, .. }))
}

/// What a failed call outside a sync (adding a playlist) leaves in settings:
/// a used-up quota pauses the loop until the next Pacific day, as a failed
/// sync's does.
fn note_failed_call(db: &Database, err: &YtmError, today: &str) -> Result<(), AppError> {
    if *err == YtmError::QuotaExceeded {
        db.set_setting(QUOTA_DAY_SETTING, today).map_err(db_err)?;
    }
    Ok(())
}

/// Adding a playlist, with a token: like `fetch_with_token`, the outer error is
/// about the token, the inner one YouTube's answer, and the units are counted.
async fn fetch_new_with_token(
    app_state: &AppState,
    ytm: &YouTubeMusicState,
    id: &str,
    known: &HashSet<String>,
    now: i64,
) -> Result<Result<Option<(String, SyncChanges)>, YtmError>, SyncFailure> {
    let live = LiveApi::new(access_token(app_state, ytm).await?)?;
    let fetched = web_api::fetch_new_playlist(&live, id, known, now).await;
    if live.spent() > 0 {
        let _ = record_spend(app_state, live.spent());
    }
    Ok(fetched)
}

/// Tells the sidebar, the view and Settings to read the status (and, when
/// `changed`, the rows) again.
fn emit_status(app: &AppHandle, state: &AppState, changed: bool) {
    if let Ok(status) = with_db(state, |db| read_status(db, &today())) {
        let _ = app.emit(SYNCED_EVENT, &SyncedPayload::from_status(&status, changed));
    }
}

```

- [ ] **Step 4: The commands**

At the end of the commands, directly above `#[cfg(test)]`, add:

```rust
/// Choose client file…: reads `client_id` and `client_secret` from the
/// Desktop client's JSON. A different client signs the account out (its
/// refresh token belongs to the old client) but keeps the rows.
#[tauri::command]
pub async fn set_youtube_music_client_file(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    path: String,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    let client = read_client_file(Path::new(&path))?;
    let different =
        with_db(&state, |db| Ok(setting(db, CLIENT_ID_SETTING)?.as_deref() != Some(client.client_id.as_str())))?;
    if different {
        // A sign-in still waiting in the browser was for the old client.
        cancel_pending_login(&ytm);
    }
    with_db(&state, |db| {
        db.set_setting(CLIENT_ID_SETTING, &client.client_id).map_err(db_err)?;
        db.set_setting(CLIENT_SECRET_SETTING, &client.client_secret).map_err(db_err)?;
        if different {
            for key in [REFRESH_TOKEN_SETTING, NEEDS_RECONNECT_SETTING] {
                db.delete_setting(key).map_err(db_err)?;
            }
            forget_access(&ytm);
        }
        Ok(())
    })?;
    if different {
        // The sidebar and the view go until the account is connected again.
        let _ = app.emit(SYNCED_EVENT, &SyncedPayload::cleared());
    }
    with_db(&state, |db| read_status(db, &today()))
}

#[tauri::command]
pub async fn connect_youtube_music(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    // The newest Connect wins: a sign-in still waiting in the browser is
    // cancelled, and this one waits for its listener to stop.
    let (cancel, cancelled) = oneshot::channel();
    if let Ok(mut slot) = ytm.pending_login.lock() {
        if let Some(previous) = slot.replace(cancel) {
            let _ = previous.send(());
        }
    }
    let generation = begin_login(&ytm);
    let _login = ytm.login.lock().await;
    let mut cancelled = cancelled;
    // An even newer Connect came while this one waited.
    if !matches!(cancelled.try_recv(), Err(oneshot::error::TryRecvError::Empty)) {
        return Err(AppError::YouTubeMusicLoginCancelled);
    }
    let client = with_db(&state, client_file)?
        .ok_or_else(|| AppError::Validation("Choose your client file first".to_string()))?;

    // Port 0: whatever the OS gives. Google accepts any loopback port for a
    // Desktop client, so nothing was registered.
    let listener = spotify_auth::bind_listener(0, youtube_auth::SERVICE)
        .await
        .map_err(AppError::YouTubeMusic)?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Internal(format!("Could not read the sign-in port: {e}")))?
        .port();
    let redirect_uri = youtube_auth::redirect_uri(port);
    let verifier = spotify_auth::random_string(64);
    let login_state = spotify_auth::random_string(32);
    let url = youtube_auth::authorize_url(
        &client.client_id,
        &redirect_uri,
        &spotify_auth::code_challenge(&verifier),
        &login_state,
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("Could not open the browser: {e}")))?;

    let params = spotify_auth::wait_for_callback(listener, spotify_auth::LOGIN_TIMEOUT, cancelled)
        .await
        .map_err(|err| match err {
            CallbackError::Cancelled => AppError::YouTubeMusicLoginCancelled,
            CallbackError::Failed(message) => AppError::YouTubeMusic(message),
        })?;
    let code = spotify_auth::code_from_callback(&params, &login_state, youtube_auth::SERVICE)
        .map_err(AppError::YouTubeMusic)?;
    let tokens = youtube_auth::exchange_code(&client, &code, &verifier, &redirect_uri).await?;
    let refresh_token = tokens.refresh_token.clone().ok_or_else(|| {
        AppError::YouTubeMusic("Google signed you in but sent no refresh token — press Connect again".to_string())
    })?;
    let email = tokens
        .id_token
        .as_deref()
        .and_then(youtube_auth::email_from_id_token)
        .unwrap_or_else(|| "your Google account".to_string());

    {
        // As in disconnect: a sync running now must not write over this.
        let _running = ytm.sync_lock.lock().await;
        with_db(&state, |db| {
            // A new client file or a Disconnect while this login was in the browser.
            let same_client =
                client_file(db)?.is_some_and(|stored| stored.client_id == client.client_id);
            if !login_is_current(&ytm, generation) || !same_client {
                return Err(AppError::YouTubeMusicLoginCancelled);
            }
            db.set_setting(REFRESH_TOKEN_SETTING, &refresh_token).map_err(db_err)?;
            db.set_setting(EMAIL_SETTING, &email).map_err(db_err)?;
            db.set_setting(NEEDS_RECONNECT_SETTING, "").map_err(db_err)?;
            db.set_setting(LAST_ERROR_SETTING, "").map_err(db_err)?;
            remember_access(&ytm, &tokens);
            Ok(())
        })?;
    }

    // The first sync starts now, not in 30 minutes. It reports through the event.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_sync_after_others(&handle).await;
    });

    with_db(&state, |db| read_status(db, &today()))
}

#[tauri::command]
pub async fn disconnect_youtube_music(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    // A sign-in still waiting in the browser would connect the account again.
    cancel_pending_login(&ytm);
    // A sync running now would write its rows back after the clear.
    let _running = ytm.sync_lock.lock().await;
    with_db(&state, |db| {
        forget_account(db)?;
        // Under the database lock, so a refresh finishing now cannot cache again.
        forget_access(&ytm);
        Ok(())
    })?;
    let _ = app.emit(SYNCED_EVENT, &SyncedPayload::cleared());
    with_db(&state, |db| read_status(db, &today()))
}

/// + Add playlist: a link or an id. The name costs 1 unit; then the playlist
/// is read in full at once, and that read is its "new" baseline. Nothing is
/// stored for a playlist YouTube does not show this account.
#[tauri::command]
pub async fn add_youtube_music_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    link: String,
) -> Result<(), AppError> {
    let id = playlist_to_add(&link)?;
    if with_db(&state, |db| db.has_ytm_list(&id).map_err(db_err))? {
        return Err(AppError::Validation("This playlist is already in the sidebar".to_string()));
    }

    // A loop run must not write this list at the same time; it only tries the
    // lock, so it skips this round.
    let _running = ytm.sync_lock.lock().await;
    let now = now_ms();
    let known = with_db(&state, |db| db.ytm_known_ids().map_err(db_err))?;
    // Errors go the way a sync's do: a dead access token is refreshed and
    // tried once more; a revoked grant (the refresh's invalid_grant) has
    // `access_token` set needs-reconnect, and the bar shows; a used-up quota
    // pauses the loop until the next Pacific day.
    let mut fetched = fetch_new_with_token(&state, &ytm, &id, &known, now).await;
    if matches!(&fetched, Ok(answer) if token_went_stale(answer)) {
        forget_access(&ytm);
        fetched = fetch_new_with_token(&state, &ytm, &id, &known, now).await;
    }
    let answer = match fetched {
        Ok(answer) => answer,
        Err(failure) => {
            if failure.needs_reconnect {
                emit_status(&app, &state, false);
            }
            return Err(failure.error);
        }
    };
    let found = match answer {
        Ok(found) => found,
        Err(err) => {
            let _ = with_db(&state, |db| note_failed_call(db, &err, &today()));
            if err == YtmError::QuotaExceeded {
                emit_status(&app, &state, false);
            }
            return Err(err.into());
        }
    };
    let (name, changes) = found.ok_or_else(|| AppError::YouTubeMusic(NOT_FOUND.to_string()))?;

    with_db(&state, |db| {
        db.add_ytm_list(&id, &name, now).map_err(db_err)?;
        db.apply_ytm_sync(&changes, now).map_err(db_err)
    })?;
    emit_status(&app, &state, true);
    Ok(())
}

/// Right-click → Remove. Liked music cannot be removed.
#[tauri::command]
pub async fn remove_youtube_music_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    ytm: State<'_, YouTubeMusicState>,
    list_id: String,
) -> Result<(), AppError> {
    if list_id == LIKED_MUSIC_ID {
        return Err(AppError::Validation("Liked music cannot be removed".to_string()));
    }
    let _running = ytm.sync_lock.lock().await;
    with_db(&state, |db| db.remove_ytm_list(&list_id).map_err(db_err))?;
    emit_status(&app, &state, true);
    Ok(())
}

/// Show in sidebar. Off hides the section and pauses the loop; the sign-in and
/// the stored rows stay. On again shows them at once and syncs.
#[tauri::command]
pub async fn set_youtube_music_show_in_sidebar(
    app: AppHandle,
    state: State<'_, AppState>,
    show: bool,
) -> Result<YouTubeMusicStatusDTO, AppError> {
    let status = with_db(&state, |db| {
        db.set_setting(SHOW_IN_SIDEBAR_SETTING, if show { "1" } else { "0" }).map_err(db_err)?;
        read_status(db, &today())
    })?;
    let _ = app.emit(SYNCED_EVENT, &SyncedPayload::from_status(&status, false));
    if show && status.connected {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = run_sync(&handle).await;
        });
    }
    Ok(status)
}

```

- [ ] **Step 5: Register the commands**

In `src-tauri/src/lib.rs`, directly under `commands::youtube_music::set_youtube_music_verdict,` add:

```rust
            commands::youtube_music::set_youtube_music_client_file,
            commands::youtube_music::connect_youtube_music,
            commands::youtube_music::disconnect_youtube_music,
            commands::youtube_music::add_youtube_music_playlist,
            commands::youtube_music::remove_youtube_music_playlist,
            commands::youtube_music::set_youtube_music_show_in_sidebar,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test commands::youtube_music 2>&1 | tail -5`
Expected: PASS — 16 tests.

Run: `cd src-tauri && cargo test 2>&1 | grep 'test result' && cargo clippy --all-targets 2>&1 | grep -E 'youtube_music|youtube_auth' | head`
Expected: `ok. 415 passed`; clippy prints nothing for the new files.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/youtube_music.rs src-tauri/src/lib.rs
git commit -m "feat(youtube-music): connect, disconnect, the client file, playlists by link and Show in sidebar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Frontend types, command wrappers and error kinds

**Files:**
- Create: `src/types/youtubeMusic.ts`
- Modify: `src/lib/tauri-api.ts`
- Modify: `src/types/ai.ts`

No test: these are shapes. `tsc` checks them against their users from Task 12 on; the Rust DTOs (Tasks 4, 9) serialise exactly these, camelCase.

- [ ] **Step 1: The IPC types**

```ts
// src/types/youtubeMusic.ts
// The YouTube Music section's shapes over IPC. The Rust DTOs are camelCase so
// these read the same as the `youtube-music-synced` event.
import type { Verdict } from './spotify'

/** Liked music's id in `ytm_lists` — YouTube's own. */
export const LIKED_MUSIC = 'LM'
/** "All playlists" — never stored; it is every list at once. */
export const ALL_YTM_LISTS = 'all'

export interface YtmList {
  /** `LM`, or a YouTube playlist id. */
  id: string
  name: string
  /** Liked music 0, then playlists in the order they were added. */
  position: number
  /** Available items at the last full read, a video listed twice counted twice. */
  trackCount: number
  /** YouTube's totalResults at the last full read, unavailable items included. */
  totalResults: number | null
  /** Unix ms. A pair first seen later than this is new in this list. */
  lastOpenedAt: number
  /** Unix ms; set while YouTube says the playlist does not exist. */
  unavailableAt: number | null
}

export interface YtmTrack {
  videoId: string
  /** As YouTube writes it: "Soulva - Odyssey (Original Mix)". */
  title: string
  /** The video owner's channel: "Extrawelt - Topic". */
  channel: string
  /** Null until YouTube gave it. Over 20 minutes is a set. */
  durationMs: number | null
}

export interface YtmEntry {
  listId: string
  videoId: string
  /** When it was added to the playlist (ISO), or null. */
  addedAt: string | null
  /** Unix ms of the sync that first stored this pair. */
  firstSeenAt: number
}

export interface YtmVerdict {
  videoId: string
  libraryTrackId: number
  verdict: Verdict
}

export interface YtmLibrary {
  lists: YtmList[]
  tracks: YtmTrack[]
  entries: YtmEntry[]
  verdicts: YtmVerdict[]
}

/** Why the last sync failed, in the kinds the view words differently. */
export type YtmErrorKind = 'network' | 'quotaExceeded' | 'other'

export interface YtmStatus {
  /** A client file was chosen: Connect can work. */
  hasClient: boolean
  connected: boolean
  email: string | null
  /** The refresh token was revoked or expired: show "Reconnect YouTube Music". */
  needsReconnect: boolean
  /** Settings → YouTube Music → Show in sidebar. */
  showInSidebar: boolean
  /** Unix ms of the last successful sync. */
  lastSyncedAt: number | null
  lastError: string | null
  /** Set with lastError. */
  lastErrorKind: YtmErrorKind | null
  /** YouTube said the quota is used up today (Pacific). */
  quotaUsedUp: boolean
}

/** Payload of the `youtube-music-synced` event, shaped like `spotify-synced`. */
export interface YtmSynced {
  changed: boolean
  lastSyncedAt: number | null
  error: string | null
  errorKind: YtmErrorKind | null
  needsReconnect: boolean
}

export const YTM_SYNCED_EVENT = 'youtube-music-synced'
```

- [ ] **Step 2: The wrappers**

In `src/lib/tauri-api.ts`, directly under the `import type { … } from '../types/spotify'` block add:

```ts
import type { YtmLibrary, YtmStatus } from '../types/youtubeMusic'
```

Directly under the `playSpotifyTrack` method add:

```ts
  // YouTube Music. Read-only on YouTube's side; the same trust model as Spotify's.
  async getYouTubeMusicStatus(): Promise<YtmStatus> {
    return await invoke('get_youtube_music_status')
  },

  /** Asks for the Desktop client's JSON. Null when the dialog was cancelled. */
  async chooseYouTubeMusicClientFile(): Promise<string | null> {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: 'Google OAuth client', extensions: ['json'] }],
    })
    return typeof selected === 'string' ? selected : null
  },

  /** Rust reads the file and keeps its two values; the file is not kept. */
  async setYouTubeMusicClientFile(path: string): Promise<YtmStatus> {
    return await invoke('set_youtube_music_client_file', { path })
  },

  /** Resolves when the browser login is done (or fails); can take minutes. */
  async connectYouTubeMusic(): Promise<YtmStatus> {
    return await invoke('connect_youtube_music')
  },

  async disconnectYouTubeMusic(): Promise<YtmStatus> {
    return await invoke('disconnect_youtube_music')
  },

  /** The sidebar learns it from the `youtube-music-synced` event this sends. */
  async setYouTubeMusicShowInSidebar(show: boolean): Promise<YtmStatus> {
    return await invoke('set_youtube_music_show_in_sidebar', { show })
  },

  /** The result arrives as a `youtube-music-synced` event. */
  async syncYouTubeMusicNow(): Promise<void> {
    return await invoke('sync_youtube_music_now')
  },

  async getYouTubeMusicLibrary(): Promise<YtmLibrary> {
    return await invoke('get_youtube_music_library')
  },

  /** Answers the lastOpenedAt it wrote (unix ms). `all` marks every list. */
  async markYouTubeMusicListOpened(listId: string): Promise<number> {
    return await invoke('mark_youtube_music_list_opened', { listId })
  },

  async setYouTubeMusicVerdict(videoId: string, libraryTrackId: number, verdict: Verdict): Promise<void> {
    return await invoke('set_youtube_music_verdict', { videoId, libraryTrackId, verdict })
  },

  /** Rejects with the line the field shows ("Not found — …"). The rows arrive by event. */
  async addYouTubeMusicPlaylist(link: string): Promise<void> {
    return await invoke('add_youtube_music_playlist', { link })
  },

  async removeYouTubeMusicPlaylist(listId: string): Promise<void> {
    return await invoke('remove_youtube_music_playlist', { listId })
  },
```

- [ ] **Step 3: The error kinds**

In `src/types/ai.ts`, in `AppErrorKind`, directly under `| 'Spotify'` add:

```ts
  | 'YouTubeMusicNotConnected'
  | 'YouTubeMusicReconnect'
  | 'YouTubeMusicLoginCancelled'
  | 'YouTubeMusic'
```

In `getErrorMessage`, directly under the `case 'SpotifyLoginCancelled':` return line add:

```ts
      case 'YouTubeMusicNotConnected':
        return 'YouTube Music is not connected -- connect it in Settings'
      case 'YouTubeMusicReconnect':
        return 'YouTube Music needs you to sign in again'
      case 'YouTubeMusicLoginCancelled':
        return 'The YouTube Music sign-in was cancelled'
```

- [ ] **Step 4: Check**

Run: `npx tsc --noEmit -p . && npx eslint src/types/youtubeMusic.ts src/lib/tauri-api.ts src/types/ai.ts`
Expected: no type errors; no eslint output.

- [ ] **Step 5: Commit**

```bash
git add src/types/youtubeMusic.ts src/lib/tauri-api.ts src/types/ai.ts
git commit -m "feat(youtube-music): frontend types, command wrappers and error kinds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Reading a YouTube title

**Files:**
- Create: `src/lib/youtube-music/title.ts`
- Test: `src/lib/youtube-music/title.test.ts`

The spec's steps, in order:
1. Drop noise in brackets: `(Official Video)`, `(Official Audio)`, `[Free Download]`, `(Visualizer)`, `[HD]`, `(Lyrics)`, `(Premiere)`, and the like.
2. Cut everything from the first ` | ` — a label, or a set's billing.
3. `Artist - Title (Mix)`: the first spaced ` - ` / ` – ` splits (the tracklist parser's `ARTIST_TITLE`). A trailing `(… Mix)`, `(… Remix)`, `(… Edit)` or `[… Mix]` is the mix. `feat.` stays in the artist, and `normalise` drops the word when matching, as it does for typed tracklists.
4. No dash: a ` - Topic` channel (YouTube's auto-generated artist channels) is the artist. Otherwise there is no artist, and the title alone is matched (Task 13).

The account's own Liked music items are the first test cases.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/youtube-music/title.test.ts
import { describe, expect, it } from 'vitest'
import {
  channelArtist,
  copyText,
  musicUrl,
  parseYouTubeTitle,
  selectedRecsUrl,
  toParsed,
} from './title'
import type { YtmTrack } from '../../types/youtubeMusic'

function video(title: string, channel = 'Some Label'): YtmTrack {
  return { videoId: 'vid', title, channel, durationMs: 400_000 }
}

describe('reading a YouTube title — items from the account’s Liked music', () => {
  it('splits artist, title and an edit', () => {
    expect(
      parseYouTubeTitle('Nina Kraviz - Tarde (Monthy Nolan Edit)', 'Monthy Nolan'),
    ).toEqual({
      artist: 'Nina Kraviz',
      title: 'Tarde',
      mix: 'Monthy Nolan Edit',
      bare: 'Tarde',
    })
  })

  it('takes the Original Mix as the mix', () => {
    expect(parseYouTubeTitle('Soulva - Odyssey (Original Mix)', 'Soulva')).toEqual({
      artist: 'Soulva',
      title: 'Odyssey',
      mix: 'Original Mix',
      bare: 'Odyssey',
    })
  })

  it('keeps feat. in the artist, as the tracklist parser does', () => {
    const raw =
      'Hot Natured feat. Anabel Englund - Reverse Skydiving (Original Mix)'
    expect(parseYouTubeTitle(raw, 'Hot Creations')).toEqual({
      artist: 'Hot Natured feat. Anabel Englund',
      title: 'Reverse Skydiving',
      mix: 'Original Mix',
      bare: 'Reverse Skydiving',
    })
    // normalise drops the word, so "Hot Natured, Anabel Englund" on a file still agrees.
    expect(toParsed(video(raw)).artistNorm).toBe('hot natured anabel englund')
  })

  it('reads a bare title on an auto-generated " - Topic" channel as that artist’s', () => {
    expect(parseYouTubeTitle('Honey Hunter', 'Extrawelt - Topic')).toEqual({
      artist: 'Extrawelt',
      title: 'Honey Hunter',
      mix: null,
      bare: 'Honey Hunter',
    })
  })

  it('cuts a DJ set’s billing at the first bar', () => {
    expect(
      parseYouTubeTitle(
        'Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND',
        'UNDRSTND',
      ),
    ).toEqual({ artist: null, title: 'Dan Ghenacia', mix: null, bare: 'Dan Ghenacia' })
  })

  it('keeps a lone name before the bar as the title', () => {
    expect(parseYouTubeTitle('frisson | KULT Talents', 'KULT')).toEqual({
      artist: null,
      title: 'frisson',
      mix: null,
      bare: 'frisson',
    })
  })
})

describe('the patterns', () => {
  it.each([
    'Butch - Come Get Up (Official Video)',
    'Butch - Come Get Up (Official Audio)',
    'Butch - Come Get Up [Free Download]',
    'Butch - Come Get Up (Visualizer)',
    'Butch - Come Get Up [HD]',
    'Butch - Come Get Up (Lyrics)',
    'Butch - Come Get Up (Premiere)',
    'Butch - Come Get Up (Official Music Video) [HD]',
  ])('drops the noise in brackets: %s', (raw) => {
    expect(parseYouTubeTitle(raw, 'Label')).toEqual({
      artist: 'Butch',
      title: 'Come Get Up',
      mix: null,
      bare: 'Come Get Up',
    })
  })

  it('keeps the mix next to the noise', () => {
    expect(
      parseYouTubeTitle('Butch - Come Get Up (Extended Mix) [Free Download]', 'Label').mix,
    ).toBe('Extended Mix')
  })

  it('cuts a trailing " | Label"', () => {
    expect(
      parseYouTubeTitle('Joseph Capriati - Control (Original Mix) | Drumcode', 'Drumcode'),
    ).toEqual({
      artist: 'Joseph Capriati',
      title: 'Control',
      mix: 'Original Mix',
      bare: 'Control',
    })
  })

  it('reads a mix in square brackets, and a remix', () => {
    expect(parseYouTubeTitle('Prunk - Tell You [Dub Mix]', 'Label').mix).toBe('Dub Mix')
    expect(
      parseYouTubeTitle('Witchy - Witch Doctor (Hot Since 82 Remix)', 'Label'),
    ).toMatchObject({ title: 'Witch Doctor', mix: 'Hot Since 82 Remix' })
  })

  it('splits on an en dash', () => {
    expect(parseYouTubeTitle('Prunk – Tell You', 'Label')).toMatchObject({
      artist: 'Prunk',
      title: 'Tell You',
    })
  })

  it('keeps a hyphenated name whole', () => {
    expect(parseYouTubeTitle('Jean-Michel Jarre - Oxygene, Pt. 4', 'Label')).toMatchObject({
      artist: 'Jean-Michel Jarre',
      title: 'Oxygene, Pt. 4',
    })
  })

  it('keeps (feat. X) in the title, and leaves it out of the bare title', () => {
    expect(
      parseYouTubeTitle(
        'Discoplex - I Need A Rush (feat. Sheree Hicks) (Extended Mix)',
        'Label',
      ),
    ).toEqual({
      artist: 'Discoplex',
      title: 'I Need A Rush (feat. Sheree Hicks)',
      mix: 'Extended Mix',
      bare: 'I Need A Rush',
    })
  })

  it('has no artist when there is no dash and the channel is not an artist channel', () => {
    expect(parseYouTubeTitle('Honey Hunter', 'Extrawelt').artist).toBeNull()
  })

  it('keeps a title that is all noise rather than nothing', () => {
    expect(parseYouTubeTitle('(Official Video)', 'Label').title).toBe('(Official Video)')
  })
})

describe('what the matcher, Copy and SelectedRecs get', () => {
  it('gives the matcher folded, normalised names', () => {
    expect(toParsed(video('Soulva - Odyssey (Original Mix)'))).toEqual({
      artist: 'Soulva',
      title: 'Odyssey',
      mix: 'Original Mix',
      artistNorm: 'soulva',
      titleNorm: 'odyssey original mix',
    })
  })

  it('gives no artist for a bare title', () => {
    expect(
      toParsed(video('Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND', 'UNDRSTND')),
    ).toEqual({
      artist: null,
      title: 'Dan Ghenacia',
      mix: null,
      artistNorm: null,
      titleNorm: 'dan ghenacia',
    })
  })

  it('copies artist, title and mix, as Spotify’s Copy does', () => {
    expect(copyText(video('Nina Kraviz - Tarde (Monthy Nolan Edit) [Free Download]'))).toBe(
      'Nina Kraviz - Tarde (Monthy Nolan Edit)',
    )
    expect(copyText(video('Honey Hunter', 'Extrawelt - Topic'))).toBe(
      'Extrawelt - Honey Hunter',
    )
    expect(copyText(video('frisson | KULT Talents', 'KULT'))).toBe('frisson')
  })

  it('searches SelectedRecs without the mix', () => {
    expect(selectedRecsUrl(video('Nina Kraviz - Tarde (Monthy Nolan Edit)'))).toBe(
      'https://srv.selectedrecs.com/#/search?text=Nina%20Kraviz%20-%20Tarde',
    )
  })

  it('plays the exact video on YouTube Music', () => {
    expect(musicUrl('fjR4idz1-MA')).toBe('https://music.youtube.com/watch?v=fjR4idz1-MA')
  })

  it('names a Topic channel without its suffix', () => {
    expect(channelArtist('Extrawelt - Topic')).toBe('Extrawelt')
    expect(channelArtist('UNDRSTND')).toBe('UNDRSTND')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/youtube-music/title.test.ts`
Expected: FAIL — `Failed to resolve import "./title"`.

- [ ] **Step 3: The parser**

```ts
// src/lib/youtube-music/title.ts
/**
 * YouTube titles, read into the shape the library matcher reads — the shape
 * `toParsed` gives a Spotify track.
 *
 * A YouTube title carries everything in one string — "Soulva - Odyssey
 * (Original Mix)" — with upload noise ("(Official Video)", "[Free Download]")
 * and often a label or a series after a bar. YouTube's auto-generated artist
 * channels ("Extrawelt - Topic") name the artist when the title does not.
 */
import { ARTIST_TITLE, foldAccents, normalise } from '../tracklist/text'
import { selectedRecsSearchUrl } from '../spotify/title'
import type { MatchInput } from '../spotify/ownership'
import type { YtmTrack } from '../../types/youtubeMusic'

/** Brackets that say what kind of upload it is, not which record. */
const NOISE =
  /\s*[([]\s*(?:official\s+(?:music\s+)?(?:video|audio|visuali[sz]er|lyric\s+video)|official|music\s+video|video|audio|visuali[sz]er|lyrics?(?:\s+video)?|hd|hq|4k|premiere|free\s+(?:download|dl)|out\s+now)\s*[)\]]/gi

/** " | Drumcode", " | Live Vinyl DJ Set | …": everything from the first spaced bar. */
const BAR = /\s+\|\s+.*$/

/** A trailing "(Monthy Nolan Edit)" or "[Dub Mix]": the version, with the tracklist parser's words. */
const MIX =
  /\s*[([]([^()[\]]*\b(?:remix|mix|edit|version|bootleg|dub|rework|vip|remaster)\b[^()[\]]*)[)\]]\s*$/i

/** "(feat. X)", "[ft. X]", "(with X)": in the title, not in the bare title. */
const FEAT = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]+[)\]]/i

/** YouTube's auto-generated artist channels: "Extrawelt - Topic". */
const TOPIC = /\s+-\s+Topic$/

export interface YouTubeTitle {
  /** "Nina Kraviz"; a Topic channel's artist; or null when nothing names one. */
  artist: string | null
  /** Without the mix: "I Need A Rush (feat. Sheree Hicks)". */
  title: string
  /** "Monthy Nolan Edit", or null. */
  mix: string | null
  /** Without the mix or the featured artist: "I Need A Rush". */
  bare: string
}

/** A channel's name without YouTube's " - Topic". */
export function channelArtist(channel: string): string {
  return channel.trim().replace(TOPIC, '')
}

export function parseYouTubeTitle(raw: string, channel: string): YouTubeTitle {
  const clean = raw.replace(/\s+/g, ' ').trim()
  // 1. Upload noise. A title that was only noise is kept as it was.
  let text = clean.replace(NOISE, '').trim() || clean
  // 2. A label or a set's billing after the first bar.
  text = text.replace(BAR, '').trim() || text

  // 3. The first spaced dash splits artist from title.
  // 4. Without one, a Topic channel is the artist.
  let artist: string | null = null
  const split = ARTIST_TITLE.exec(text)
  if (split && split[1].trim() && split[2].trim()) {
    artist = split[1].trim()
    text = split[2].trim()
  } else if (TOPIC.test(channel.trim())) {
    artist = channelArtist(channel) || null
  }

  let mix: string | null = null
  const version = MIX.exec(text)
  if (version && version.index > 0) {
    mix = version[1].trim()
    text = text.slice(0, version.index).trim()
  }

  const bare = text.replace(FEAT, '').trim() || text
  return { artist, title: text, mix, bare }
}

/**
 * What `matchOne` reads, built as Spotify's `toParsed` builds it: the bare
 * title to match on, and `titleNorm` carrying the featured artist and the
 * version, so both spellings are tried. No artist stays null: the matcher
 * then has only the title (see `ownershipOf`'s `titleOnly`).
 */
export function toParsed(track: YtmTrack): MatchInput {
  const { artist, title, mix, bare } = parseYouTubeTitle(track.title, track.channel)
  return {
    artist,
    title: bare,
    mix,
    artistNorm: artist ? normalise(foldAccents(artist)) : null,
    titleNorm: normalise(foldAccents([title, mix].filter(Boolean).join(' '))),
  }
}

/** "Artist - Name", or the name alone when no artist is known. */
function credit(artist: string | null, name: string): string {
  if (!name) return artist ?? ''
  return artist ? `${artist} - ${name}` : name
}

/** As Spotify's Copy: artist, bare title, and the mix — what a store search needs. */
export function copyText(track: YtmTrack): string {
  const { artist, bare, mix } = parseYouTubeTitle(track.title, track.channel)
  return credit(artist, mix ? `${bare} (${mix})` : bare)
}

/** As Spotify's: the Copy text without the mix — the store lists every version. */
export function selectedRecsUrl(track: YtmTrack): string {
  const { artist, bare } = parseYouTubeTitle(track.title, track.channel)
  return selectedRecsSearchUrl(credit(artist, bare))
}

const MUSIC_WATCH = 'https://music.youtube.com/watch?v='

/** The exact video on YouTube Music: no search needed. */
export function musicUrl(videoId: string): string {
  return MUSIC_WATCH + encodeURIComponent(videoId)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/youtube-music/title.test.ts`
Expected: PASS — 28 tests.

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src/lib/youtube-music`
Expected: 345 tests pass; no type errors; no eslint output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube-music/title.ts src/lib/youtube-music/title.test.ts
git commit -m "feat(youtube-music): read artist, title and mix out of a YouTube title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ownership through a source-agnostic shape, and the title-only Maybe

**Files:**
- Modify: `src/lib/tracklist/match.ts` (`matchTitleOnly`)
- Modify: `src/lib/spotify/ownership.ts`
- Test: `src/lib/spotify/ownership.test.ts`

Today `classifyTracks` takes `SpotifyTrack[]` and `SpotifyVerdict[]`. The core moves to `classifyItems`, which takes `{ id, parsed, titleOnly? }` and verdicts keyed by `id`; `classifyTracks` becomes a two-line wrapper, so Spotify, DJ pages and Search call it unchanged.

`titleOnly` is how the spec's "the title alone is matched" happens: `matchOne` needs an artist, so a row without one would always be Missing. With `titleOnly`, a row with no artist whose title fully agrees with a file is a Maybe, "same title, artist unknown" — never Owned, since a title alone is not evidence. Only YouTube Music passes it.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/spotify/ownership.test.ts`, and add `classifyItems` to its import from `./ownership`)

```ts
describe('ownership through the shared shape', () => {
  const shelf = [
    lib(1, 'Soulva', 'Odyssey (Original Mix)'),
    lib(2, 'Some Producer', 'Honey Hunter'),
  ]
  const index = buildOwnershipIndex(shelf)
  const odyssey = {
    artist: 'Soulva',
    title: 'Odyssey',
    mix: 'Original Mix',
    artistNorm: 'soulva',
    titleNorm: 'odyssey original mix',
  }
  const bareHoney = {
    artist: null,
    title: 'Honey Hunter',
    mix: null,
    artistNorm: null,
    titleNorm: 'honey hunter',
  }

  it('answers any source by its id', () => {
    const result = classifyItems([{ id: 'v1', parsed: odyssey }], index, [])
    expect(result.get('v1')).toEqual({ kind: 'owned', file: shelf[0] })
  })

  it('reads verdicts keyed by the same id', () => {
    const result = classifyItems(
      [{ id: 'v4', parsed: bareHoney, titleOnly: true }],
      index,
      [{ id: 'v4', libraryTrackId: 2, verdict: 'yes' }],
    )
    expect(result.get('v4')).toEqual({ kind: 'owned', file: shelf[1] })
  })

  it('makes a same-titled file a Maybe when the row names no artist and asks for it', () => {
    expect(ownershipOf(bareHoney, index)).toEqual({ kind: 'missing' })
    expect(ownershipOf(bareHoney, index, undefined, true)).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist unknown',
    })
  })

  it('wants the title to agree in full, and never answers Owned on a title alone', () => {
    const partly = { ...bareHoney, title: 'Honey Monster', titleNorm: 'honey monster' }
    expect(ownershipOf(partly, index, undefined, true)).toEqual({ kind: 'missing' })
    // A row with an artist that does not agree stays Missing: titleOnly is
    // only for rows that name none.
    const otherArtist = { ...bareHoney, artist: 'Extrawelt', artistNorm: 'extrawelt' }
    expect(ownershipOf(otherArtist, index, undefined, true)).toEqual({ kind: 'missing' })
  })

  it('says why a title-only Maybe is unsure', () => {
    expect(maybeReason({ titleScore: 1, artistScore: 0 })).toBe(
      'same title, artist unknown',
    )
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/spotify/ownership.test.ts`
Expected: FAIL — `classifyItems is not a function`; the title-only cases get Missing; the reason reads "artist partly matches". The old tests still pass.

- [ ] **Step 3: `matchTitleOnly` in `match.ts`**

Directly under the `matchOne` function add:

```ts
/**
 * The file for a row that names no artist — a bare YouTube title such as
 * "Honey Hunter" on a channel that is not the artist's. Only a full title
 * agreement counts, and the answer is never strong: dozens of records share
 * a title, so it can only make a Maybe the user confirms.
 */
export function matchTitleOnly(
  parsed: Pick<Track, 'title' | 'mix' | 'titleNorm'>,
  indexed: Indexed[],
): LibraryMatch | null {
  const formTokens = titleFormsOf(parsed).map((form) => tokenSet(form))
  if (!formTokens.length) return null
  const versionTokens = tokenSet(matchNorm(parsed.mix) ?? versionOf(parsed.title))

  for (const entry of indexed) {
    if (!entry.titleNorm) continue
    if (versionTokens.size && entry.versionTokens.size) {
      if (!sameVersion(versionTokens, entry.versionTokens)) continue
    }
    const agrees = formTokens.some(
      (tokens) => titleAgreement(tokens, entry.titleTokens) === 1,
    )
    if (agrees) {
      return { track: entry.track, score: 1, titleScore: 1, artistScore: 0, strong: false }
    }
  }
  return null
}
```

- [ ] **Step 4: `ownership.ts` — the shared shape**

Change the imports to:

```ts
import { tokenSet } from '../tracklist/text'
import {
  indexLibrary,
  matchOne,
  matchTitleOnly,
  titleFormsOf,
  type Indexed,
  type LibraryMatch,
  type LibraryTrack,
} from '../tracklist/match'
import type { Track } from '../tracklist/types'
import type { SpotifyTrack, SpotifyVerdict, Verdict } from '../../types/spotify'
import { toParsed } from './title'
```

Replace

```ts
/** What the matcher reads of a row: a Spotify track through `toParsed`, or a set's row as it is. */
export type MatchInput = ReturnType<typeof toParsed>
```

with

```ts
/**
 * What the matcher reads of a row, whatever it came from: a Spotify track
 * through its `toParsed`, a YouTube video through its own, or a set's row as
 * it is.
 */
export type MatchInput = Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'>

/** One row to classify. Spotify, YouTube Music and DJ pages all make these. */
export interface OwnershipItem {
  /** A Spotify id or a YouTube video id: the key of the answer and of its verdicts. */
  id: string
  parsed: MatchInput
  /** With no artist, a file with the same title is a Maybe rather than Missing. */
  titleOnly?: boolean
}

export interface OwnershipVerdict {
  id: string
  libraryTrackId: number
  verdict: Verdict
}
```

In `maybeReason`, replace

```ts
  const artist =
    match.artistScore >= 1 ? 'same artist' : 'artist partly matches'
```

with

```ts
  const artist =
    match.artistScore >= 1
      ? 'same artist'
      : match.artistScore === 0
        ? 'artist unknown'
        : 'artist partly matches'
```

Replace `ownershipOf` with:

```ts
/**
 * Owned / Maybe / Missing for one row, by the library match alone: no verdicts.
 * `excluded` holds files already answered No for this row. `titleOnly` lets a
 * row that names no artist match on its title (`matchTitleOnly`), as a Maybe.
 */
export function ownershipOf(
  parsed: MatchInput,
  index: OwnershipIndex,
  excluded?: Set<number>,
  titleOnly = false,
): Ownership {
  const pool = candidates(index, parsed, excluded)
  const match = matchOne(parsed, pool)
  if (match) {
    if (match.strong) return { kind: 'owned', file: match.track }
    return { kind: 'maybe', file: match.track, reason: maybeReason(match) }
  }
  if (titleOnly && !parsed.artist) {
    const byTitle = matchTitleOnly(parsed, pool)
    if (byTitle)
      return { kind: 'maybe', file: byTitle.track, reason: maybeReason(byTitle) }
  }
  return { kind: 'missing' }
}
```

Replace `classifyTracks` with:

```ts
/** Every row's answer, keyed by its id, with Yes / No verdicts applied. */
export function classifyItems(
  items: OwnershipItem[],
  index: OwnershipIndex,
  verdicts: OwnershipVerdict[],
): Map<string, Ownership> {
  const yes = new Map<string, number>()
  const no = new Map<string, Set<number>>()
  for (const verdict of verdicts) {
    // A verdict about a file that is gone says nothing any more.
    if (!index.byId.has(verdict.libraryTrackId)) continue
    if (verdict.verdict === 'yes') {
      yes.set(verdict.id, verdict.libraryTrackId)
    } else {
      const set = no.get(verdict.id) ?? new Set<number>()
      set.add(verdict.libraryTrackId)
      no.set(verdict.id, set)
    }
  }

  const result = new Map<string, Ownership>()
  for (const item of items) {
    const confirmed = yes.get(item.id)
    if (confirmed !== undefined) {
      result.set(item.id, { kind: 'owned', file: index.byId.get(confirmed) })
      continue
    }
    result.set(
      item.id,
      ownershipOf(item.parsed, index, no.get(item.id), item.titleOnly ?? false),
    )
  }
  return result
}

/** Spotify's tracks and verdicts, through the shared shape. */
export function classifyTracks(
  tracks: SpotifyTrack[],
  index: OwnershipIndex,
  verdicts: SpotifyVerdict[],
): Map<string, Ownership> {
  return classifyItems(
    tracks.map((track) => ({ id: track.spotifyId, parsed: toParsed(track) })),
    index,
    verdicts.map((v) => ({
      id: v.spotifyId,
      libraryTrackId: v.libraryTrackId,
      verdict: v.verdict,
    })),
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify src/lib/tracklist src/lib/dj`
Expected: PASS — every old Spotify, tracklist and DJ test unchanged, plus the 5 new ones. The pre-filter test ("gives exactly what comparing every track with every file gives") still passes: no Spotify track passes `titleOnly`.

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src/lib/spotify src/lib/tracklist/match.ts`
Expected: 350 tests pass; no type errors; no eslint output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tracklist/match.ts src/lib/spotify/ownership.ts src/lib/spotify/ownership.test.ts
git commit -m "refactor(ownership): classify any source by id; a title-only Maybe for rows that name no artist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Rows, the Sets group, the unavailable count and "new and missing"

**Files:**
- Modify: `src/lib/spotify/newness.ts` (`isNew` takes any entry)
- Create: `src/lib/youtube-music/rows.ts`, `src/lib/youtube-music/newness.ts`
- Test: `src/lib/youtube-music/rows.test.ts`, `src/lib/youtube-music/newness.test.ts`

Items longer than **20 minutes** are sets: out of the table, the filters, the counts, matching and "new", and listed under Sets. The unavailable count is `totalResults − trackCount` per list (see "Where the spec and the code disagree", 3).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/youtube-music/rows.test.ts
import { describe, expect, it } from 'vitest'
import {
  classifyYouTubeMusic,
  isSet,
  listCounts,
  rowsFor,
  syncErrorText,
  unavailableCount,
} from './rows'
import { buildOwnershipIndex, type Ownership } from '../spotify/ownership'
import type { LibraryTrack } from '../tracklist/match'
import type { YtmLibrary, YtmTrack } from '../../types/youtubeMusic'

const MIN = 60_000

const library: YtmLibrary = {
  lists: [
    { id: 'LM', name: 'Liked music', position: 0, trackCount: 4, totalResults: 6, lastOpenedAt: 1000, unavailableAt: null },
    { id: 'PL1', name: 'Deep', position: 1, trackCount: 2, totalResults: 2, lastOpenedAt: 1000, unavailableAt: null },
  ],
  tracks: [
    { videoId: 'v1', title: 'Soulva - Odyssey (Original Mix)', channel: 'Soulva', durationMs: 7 * MIN },
    { videoId: 'v2', title: 'Nina Kraviz - Tarde (Monthy Nolan Edit)', channel: 'Label', durationMs: 6 * MIN },
    { videoId: 'set1', title: 'Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND', channel: 'UNDRSTND', durationMs: 95 * MIN },
    { videoId: 'v3', title: 'Honey Hunter', channel: 'Extrawelt - Topic', durationMs: null },
  ],
  entries: [
    { listId: 'LM', videoId: 'v1', addedAt: '2026-10-02T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'LM', videoId: 'v2', addedAt: '2026-10-03T10:00:00Z', firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'set1', addedAt: '2026-10-03T11:00:00Z', firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'v3', addedAt: '2026-09-01T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'PL1', videoId: 'v1', addedAt: '2026-10-03T12:00:00Z', firstSeenAt: 1000 },
    { listId: 'PL1', videoId: 'set1', addedAt: '2026-09-01T00:00:00Z', firstSeenAt: 2000 },
  ],
  verdicts: [],
}

const none = new Map<string, Ownership>()
const opened = new Map<string, number>()

function video(videoId: string, durationMs: number | null): YtmTrack {
  return { videoId, title: 'A - B', channel: 'C', durationMs }
}

describe('sets and tracks', () => {
  it('takes only what runs longer than 20 minutes for a set', () => {
    expect(isSet(video('a', 20 * MIN))).toBe(false)
    expect(isSet(video('b', 20 * MIN + 1))).toBe(true)
    expect(isSet(video('c', null))).toBe(false)
  })
})

describe('the rows of a list', () => {
  it('lists tracks newest added first, with the sets apart', () => {
    const { rows, sets } = rowsFor('LM', library, none, opened)
    expect(rows.map((r) => r.track.videoId)).toEqual(['v2', 'v1', 'v3'])
    expect(sets.map((s) => s.track.videoId)).toEqual(['set1'])
    expect(rows.map((r) => r.isNew)).toEqual([true, false, false])
  })

  it('shows the title and artist read from the YouTube title', () => {
    const { rows } = rowsFor('LM', library, none, opened)
    expect(rows[0]).toMatchObject({ title: 'Tarde (Monthy Nolan Edit)', artist: 'Nina Kraviz' })
    expect(rows[2]).toMatchObject({ title: 'Honey Hunter', artist: 'Extrawelt' })
  })

  it('makes All playlists one row per video, with every list and its newest add', () => {
    const { rows, sets } = rowsFor('all', library, none, opened)
    expect(rows.map((r) => r.track.videoId)).toEqual(['v1', 'v2', 'v3'])
    expect(rows[0]).toMatchObject({
      addedAt: '2026-10-03T12:00:00Z',
      lists: ['Liked music', 'Deep'],
    })
    expect(sets).toHaveLength(1)
    expect(sets[0].addedAt).toBe('2026-10-03T11:00:00Z')
  })

  it('never puts the dot on an owned track', () => {
    const owned = new Map<string, Ownership>([['v2', { kind: 'owned' }]])
    expect(rowsFor('LM', library, owned, opened).rows[0].isNew).toBe(false)
  })
})

describe('the footer and the sidebar counts', () => {
  it('counts what YouTube lists but RecoDeck skipped', () => {
    expect(unavailableCount('LM', library)).toBe(2)
    expect(unavailableCount('PL1', library)).toBe(0)
    expect(unavailableCount('all', library)).toBe(2)
    const unread: YtmLibrary = {
      ...library,
      lists: [{ ...library.lists[0], totalResults: null }],
    }
    expect(unavailableCount('LM', unread)).toBe(0)
  })

  it('leaves sets out of every count', () => {
    expect(listCounts(library)).toEqual(
      new Map([
        ['all', 3],
        ['LM', 3],
        ['PL1', 1],
      ]),
    )
  })
})

describe('do I own it', () => {
  const shelf: LibraryTrack[] = [
    { id: 1, artist: 'Soulva', title: 'Odyssey (Original Mix)', file_path: '/m/1.mp3' },
    { id: 2, artist: 'Some Producer', title: 'Honey Hunter', file_path: '/m/2.mp3' },
  ]
  const tracks: YtmTrack[] = [
    ...library.tracks,
    { videoId: 'v4', title: 'Honey Hunter', channel: 'Some Uploader', durationMs: 5 * MIN },
  ]

  it('matches tracks, lets a bare title be a Maybe, and leaves sets alone', () => {
    const result = classifyYouTubeMusic(tracks, buildOwnershipIndex(shelf), [])
    expect(result.get('v1')).toEqual({ kind: 'owned', file: shelf[0] })
    // The Topic channel names Extrawelt, whom the file does not.
    expect(result.get('v3')).toEqual({ kind: 'missing' })
    expect(result.get('v4')).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist unknown',
    })
    expect(result.has('set1')).toBe(false)
  })

  it('takes a Yes', () => {
    const result = classifyYouTubeMusic(tracks, buildOwnershipIndex(shelf), [
      { videoId: 'v4', libraryTrackId: 2, verdict: 'yes' },
    ])
    expect(result.get('v4')).toEqual({ kind: 'owned', file: shelf[1] })
  })
})

describe('the meta line on a failed sync', () => {
  it('words each kind', () => {
    expect(syncErrorText('network')).toBe("couldn't reach YouTube")
    expect(syncErrorText('quotaExceeded')).toBe(
      'YouTube quota used up · resumes after midnight Pacific',
    )
    expect(syncErrorText('other')).toBe('sync failed — see Settings → YouTube Music')
    expect(syncErrorText(null)).toBe('sync failed — see Settings → YouTube Music')
  })
})
```

```ts
// src/lib/youtube-music/newness.test.ts
import { describe, expect, it } from 'vitest'
import { newAndMissing } from './newness'
import type { Ownership } from '../spotify/ownership'
import type { YtmLibrary } from '../../types/youtubeMusic'

const library: YtmLibrary = {
  lists: [
    { id: 'LM', name: 'Liked music', position: 0, trackCount: 3, totalResults: 3, lastOpenedAt: 1000, unavailableAt: null },
    { id: 'PL1', name: 'Deep', position: 1, trackCount: 1, totalResults: 1, lastOpenedAt: 1000, unavailableAt: null },
  ],
  tracks: [
    { videoId: 'v1', title: 'A - One', channel: 'C', durationMs: 300_000 },
    { videoId: 'v2', title: 'A - Two', channel: 'C', durationMs: 300_000 },
    { videoId: 'set1', title: 'Someone | Live', channel: 'C', durationMs: 3_600_000 },
  ],
  entries: [
    { listId: 'LM', videoId: 'v1', addedAt: null, firstSeenAt: 1000 },
    { listId: 'LM', videoId: 'v2', addedAt: null, firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'set1', addedAt: null, firstSeenAt: 2000 },
    { listId: 'PL1', videoId: 'set1', addedAt: null, firstSeenAt: 2000 },
  ],
  verdicts: [],
}

describe('new and missing on YouTube Music', () => {
  it('counts tracks first seen after their list was opened, never sets', () => {
    const counts = newAndMissing(library, new Map())
    expect(counts.total).toBe(1)
    expect(counts.byList).toEqual(new Map([['LM', 1]]))
  })

  it('leaves owned tracks out, and nothing is new on a baseline', () => {
    const owned = new Map<string, Ownership>([['v2', { kind: 'owned' }]])
    expect(newAndMissing(library, owned).total).toBe(0)
    const baseline: YtmLibrary = {
      ...library,
      lists: library.lists.map((list) => ({ ...list, lastOpenedAt: 2000 })),
    }
    expect(newAndMissing(baseline, new Map()).total).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/youtube-music`
Expected: FAIL — `Failed to resolve import "./rows"` and `"./newness"`. The title tests still pass.

- [ ] **Step 3: `isNew` reads any entry**

In `src/lib/spotify/newness.ts`, change the signature of `isNew` to:

```ts
export function isNew(
  entry: Pick<SpotifyEntry, 'firstSeenAt'>,
  lastOpenedAt: number,
): boolean {
```

(its body is unchanged).

- [ ] **Step 4: The rows**

```ts
// src/lib/youtube-music/rows.ts
/**
 * What the YouTube Music view shows for one list: tracks newest added first,
 * and — apart from them — the DJ sets. In All playlists a video in several
 * lists is one row, dated by its newest add, with every list it is in.
 *
 * Anything longer than 20 minutes is a set, not a track: it stays out of the
 * table, the filters, the counts, matching and "new", and is listed under Sets.
 */
import { isNew } from '../spotify/newness'
import {
  classifyItems,
  type Ownership,
  type OwnershipIndex,
} from '../spotify/ownership'
import { channelArtist, parseYouTubeTitle, toParsed } from './title'
import {
  ALL_YTM_LISTS,
  type YtmErrorKind,
  type YtmLibrary,
  type YtmTrack,
  type YtmVerdict,
} from '../../types/youtubeMusic'

/** Longer than this is a set. */
export const SET_MIN_MS = 20 * 60_000

export function isSet(track: YtmTrack): boolean {
  return (track.durationMs ?? 0) > SET_MIN_MS
}

export interface YtmRow {
  track: YtmTrack
  /** Read from the YouTube title: "Tarde (Monthy Nolan Edit)". */
  title: string
  /** The parsed artist, or the channel without " - Topic". */
  artist: string
  ownership: Ownership
  /** Newest addedAt across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

/** A set under the table: title, channel, length, Open in Sets. */
export interface YtmSetRow {
  track: YtmTrack
  addedAt: string | null
}

export interface YtmRows {
  rows: YtmRow[]
  sets: YtmSetRow[]
}

interface Dated {
  addedAt: string | null
  track: YtmTrack
}

/** Newest first; ISO strings in one format sort as text. Undated rows last. */
function newestFirst(a: Dated, b: Dated): number {
  if (a.addedAt !== b.addedAt) {
    if (!a.addedAt) return 1
    if (!b.addedAt) return -1
    return a.addedAt < b.addedAt ? 1 : -1
  }
  return a.track.title.localeCompare(b.track.title)
}

/**
 * @param seenBefore each list's lastOpenedAt as it was when the view was
 *   opened, as for Spotify: the dots are seen once.
 */
export function rowsFor(
  listId: string,
  library: YtmLibrary,
  ownership: Map<string, Ownership>,
  seenBefore: Map<string, number>,
): YtmRows {
  const lists = new Map(library.lists.map((list) => [list.id, list]))
  const tracks = new Map(library.tracks.map((track) => [track.videoId, track]))
  const byVideo = new Map<
    string,
    { addedAt: string | null; listIds: Set<string>; isNew: boolean }
  >()

  for (const entry of library.entries) {
    if (listId !== ALL_YTM_LISTS && entry.listId !== listId) continue
    const list = lists.get(entry.listId)
    if (!list) continue
    const row = byVideo.get(entry.videoId) ?? {
      addedAt: null,
      listIds: new Set<string>(),
      isNew: false,
    }
    if (entry.addedAt && (!row.addedAt || entry.addedAt > row.addedAt))
      row.addedAt = entry.addedAt
    row.listIds.add(entry.listId)
    row.isNew ||= isNew(entry, seenBefore.get(entry.listId) ?? list.lastOpenedAt)
    byVideo.set(entry.videoId, row)
  }

  const rows: YtmRow[] = []
  const sets: YtmSetRow[] = []
  for (const [videoId, row] of byVideo) {
    const track = tracks.get(videoId)
    if (!track) continue
    if (isSet(track)) {
      sets.push({ track, addedAt: row.addedAt })
      continue
    }
    const owns = ownership.get(videoId) ?? { kind: 'missing' }
    const parsed = parseYouTubeTitle(track.title, track.channel)
    rows.push({
      track,
      title: parsed.mix ? `${parsed.title} (${parsed.mix})` : parsed.title,
      artist: parsed.artist ?? channelArtist(track.channel),
      ownership: owns,
      addedAt: row.addedAt,
      lists: [...row.listIds]
        .map((id) => lists.get(id)!)
        .sort((a, b) => a.position - b.position)
        .map((list) => list.name),
      isNew: row.isNew && owns.kind !== 'owned',
    })
  }

  return { rows: rows.sort(newestFirst), sets: sets.sort(newestFirst) }
}

/**
 * Deleted and private videos in the lists shown: YouTube counts them in
 * totalResults, RecoDeck skips them. All playlists sums the lists.
 */
export function unavailableCount(listId: string, library: YtmLibrary): number {
  let count = 0
  for (const list of library.lists) {
    if (listId !== ALL_YTM_LISTS && list.id !== listId) continue
    if (list.totalResults !== null)
      count += Math.max(0, list.totalResults - list.trackCount)
  }
  return count
}

/** Tracks behind each sidebar item, sets left out; and every track for All playlists. */
export function listCounts(library: YtmLibrary): Map<string, number> {
  const sets = new Set(
    library.tracks.filter(isSet).map((track) => track.videoId),
  )
  const counts = new Map<string, number>([
    [ALL_YTM_LISTS, library.tracks.length - sets.size],
  ])
  for (const entry of library.entries) {
    if (sets.has(entry.videoId)) continue
    counts.set(entry.listId, (counts.get(entry.listId) ?? 0) + 1)
  }
  return counts
}

/**
 * Owned / Maybe / Missing for every track, sets left out. A title that names
 * no artist may still be a Maybe on its title alone.
 */
export function classifyYouTubeMusic(
  tracks: YtmTrack[],
  index: OwnershipIndex,
  verdicts: YtmVerdict[],
): Map<string, Ownership> {
  return classifyItems(
    tracks
      .filter((track) => !isSet(track))
      .map((track) => ({
        id: track.videoId,
        parsed: toParsed(track),
        titleOnly: true,
      })),
    index,
    verdicts.map((v) => ({
      id: v.videoId,
      libraryTrackId: v.libraryTrackId,
      verdict: v.verdict,
    })),
  )
}

/** The view's short word on a failed sync. The full message is in Settings. */
export function syncErrorText(kind: YtmErrorKind | null): string {
  switch (kind) {
    case 'network':
      return "couldn't reach YouTube"
    case 'quotaExceeded':
      return 'YouTube quota used up · resumes after midnight Pacific'
    default:
      return 'sync failed — see Settings → YouTube Music'
  }
}
```

```ts
// src/lib/youtube-music/newness.ts
/**
 * "New and missing", as for Spotify: a pair first seen after its list was
 * last opened, whose track is not owned. Sets are never new — they are not
 * tracks — and unavailable videos are never stored, so they cannot be.
 */
import { isNew, type NewCounts } from '../spotify/newness'
import type { Ownership } from '../spotify/ownership'
import { isSet } from './rows'
import type { YtmLibrary } from '../../types/youtubeMusic'

export function newAndMissing(
  library: YtmLibrary,
  ownership: Map<string, Ownership>,
): NewCounts {
  const opened = new Map(
    library.lists.map((list) => [list.id, list.lastOpenedAt]),
  )
  const sets = new Set(
    library.tracks.filter(isSet).map((track) => track.videoId),
  )
  const distinct = new Set<string>()
  const byList = new Map<string, number>()

  for (const entry of library.entries) {
    const lastOpenedAt = opened.get(entry.listId)
    if (lastOpenedAt === undefined || !isNew(entry, lastOpenedAt)) continue
    if (sets.has(entry.videoId)) continue
    if (ownership.get(entry.videoId)?.kind === 'owned') continue
    distinct.add(entry.videoId)
    byList.set(entry.listId, (byList.get(entry.listId) ?? 0) + 1)
  }

  return { total: distinct.size, byList }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/youtube-music src/lib/spotify`
Expected: PASS — the 12 new tests, and every Spotify test unchanged.

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src/lib/youtube-music src/lib/spotify/newness.ts`
Expected: 362 tests pass; no type errors; no eslint output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify/newness.ts src/lib/youtube-music/rows.ts src/lib/youtube-music/rows.test.ts src/lib/youtube-music/newness.ts src/lib/youtube-music/newness.test.ts
git commit -m "feat(youtube-music): rows, the Sets group, the unavailable count and the new-and-missing number

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The `useYouTubeMusic` hook

**Files:**
- Create: `src/components/youtube-music/useYouTubeMusic.ts`

Two halves, both called from `App.tsx`:
- `useYouTubeMusic(ready)` holds the status, the stored rows and the actions. It is `useSpotify` without the library loading.
- `useYouTubeMusicMatches(library, spotify)` works out ownership and the counts against the library index `useSpotify` already holds.

The split is because of the order hooks run in: App needs to know whether YouTube Music is shown (connected, and Show in sidebar on) to tell `useSpotify` to load the library (`wantLibrary`), and YouTube Music needs the index that load produces. Hidden, it asks for nothing: no section and no view need ownership. So App calls `useYouTubeMusic`, then `useSpotify`, then `useYouTubeMusicMatches`. `useSpotify`'s interface does not change.

There is no hook test: Vitest here has no React Testing Library (see Rules), as with `useSpotify`. The logic it calls is tested in Tasks 12–14; the wiring is checked by hand in Task 21.

- [ ] **Step 1: The hook**

```ts
// src/components/youtube-music/useYouTubeMusic.ts
// Everything the YouTube Music section shows, loaded once and kept current.
// Called from App.tsx, like useSpotify, so the sidebar's number is right in
// every view. Matching uses the library index useSpotify already holds: App
// calls useYouTubeMusic, then useSpotify (asking it for the library while
// YouTube Music is shown), then useYouTubeMusicMatches.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import type { Ownership } from '../../lib/spotify/ownership'
import type { NewCounts } from '../../lib/spotify/newness'
import type { StatusFilter } from '../../lib/spotify/rows'
import { classifyYouTubeMusic, listCounts } from '../../lib/youtube-music/rows'
import { newAndMissing } from '../../lib/youtube-music/newness'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Verdict } from '../../types/spotify'
import {
  ALL_YTM_LISTS,
  YTM_SYNCED_EVENT,
  type YtmLibrary,
  type YtmStatus,
  type YtmSynced,
} from '../../types/youtubeMusic'

const EMPTY: YtmLibrary = { lists: [], tracks: [], entries: [], verdicts: [] }

export interface YouTubeMusicData {
  status: YtmStatus | null
  connected: boolean
  library: YtmLibrary
  /** Each list's lastOpenedAt as it was when the open view was opened: what the dots compare with. */
  seenBefore: Map<string, number>
  syncing: boolean
  /** Remembered for the session; All by default. */
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  openList: (listId: string) => void
  syncNow: () => void
  /** Rejects when the answer could not be saved. */
  setVerdict: (videoId: string, libraryTrackId: number, verdict: Verdict) => Promise<void>
  /** Rejects with the error when the login fails. */
  reconnect: () => Promise<void>
  /** Rejects with the line the field shows ("Not found — …"). The rows arrive by event. */
  addPlaylist: (link: string) => Promise<void>
  removePlaylist: (listId: string) => Promise<void>
}

export interface YouTubeMusicMatches {
  /** Keyed by video id; sets are not in it. */
  ownership: Map<string, Ownership>
  newCounts: NewCounts
  /** Tracks behind each sidebar item, plus ALL_YTM_LISTS; sets left out. */
  counts: Map<string, number>
}

/** @param ready the database is open (App's start-up has finished). */
export function useYouTubeMusic(ready: boolean): YouTubeMusicData {
  const [status, setStatus] = useState<YtmStatus | null>(null)
  const [library, setLibrary] = useState<YtmLibrary>(EMPTY)
  const [seenBefore, setSeenBefore] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [syncing, setSyncing] = useState(false)
  /** Counts the times the account became connected — each one loads the rows. */
  const [connections, setConnections] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const connected = status?.connected ?? false

  // As in useSpotify: only the newest load may land, so a load read before a
  // local write (opening a list, an answer) never undoes it.
  const loadSeq = useRef(0)
  const loadPending = useRef(false)
  const wasConnected = useRef(false)

  const loadLibrary = useCallback(() => {
    const seq = ++loadSeq.current
    loadPending.current = true
    tauriApi
      .getYouTubeMusicLibrary()
      .then((next) => {
        if (seq !== loadSeq.current) return
        loadPending.current = false
        setLibrary(next)
      })
      .catch(() => {
        if (seq === loadSeq.current) loadPending.current = false
      })
  }, [])

  /** A local write landed: a load still in flight read the old rows, so read again. */
  const supersedeLoad = useCallback(() => {
    if (loadPending.current) loadLibrary()
  }, [loadLibrary])

  const applyStatus = useCallback((next: YtmStatus) => {
    const was = wasConnected.current
    wasConnected.current = next.connected
    setStatus(next)
    if (!was && next.connected) setConnections((n) => n + 1)
    if (!next.connected) {
      // Drop any load in flight: its rows belong to the account that left.
      loadSeq.current++
      loadPending.current = false
      setLibrary(EMPTY)
    }
    return was
  }, [])

  const refresh = useCallback(
    (reloadData: boolean) => {
      tauriApi
        .getYouTubeMusicStatus()
        .then((next) => {
          const was = applyStatus(next)
          if (reloadData && was && next.connected) loadLibrary()
        })
        .catch(() => {})
    },
    [applyStatus, loadLibrary],
  )

  useEffect(() => {
    if (ready) refresh(false)
  }, [ready, refresh])

  // Whenever the account becomes connected: at start-up, after Connect, or
  // after reconnecting, when the rows stayed on disk.
  useEffect(() => {
    if (ready && connected) loadLibrary()
  }, [ready, connected, connections, loadLibrary])

  // Every sync reports, and so do adding or removing a playlist and the
  // switch: the status always, the rows when something changed.
  useEffect(() => {
    const stop = listen<YtmSynced>(YTM_SYNCED_EVENT, (event) => {
      setSyncing(false)
      refresh(event.payload.changed)
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refresh])

  const openList = useCallback(
    (listId: string) => {
      // Captured before the opening is written, so the dots are seen once.
      setSeenBefore(
        new Map(library.lists.map((list) => [list.id, list.lastOpenedAt])),
      )
      tauriApi
        .markYouTubeMusicListOpened(listId)
        .then((at) => {
          setLibrary((prev) => ({
            ...prev,
            lists: prev.lists.map((list) =>
              listId === ALL_YTM_LISTS || list.id === listId
                ? { ...list, lastOpenedAt: at }
                : list,
            ),
          }))
          supersedeLoad()
        })
        .catch(() => {})
    },
    [library.lists, supersedeLoad],
  )

  const syncNow = useCallback(() => {
    setSyncing(true)
    tauriApi
      .syncYouTubeMusicNow()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

  const setVerdict = useCallback(
    (videoId: string, libraryTrackId: number, verdict: Verdict) =>
      tauriApi
        .setYouTubeMusicVerdict(videoId, libraryTrackId, verdict)
        .then(() => {
          setLibrary((prev) => ({
            ...prev,
            verdicts: [
              ...prev.verdicts.filter(
                (v) =>
                  !(v.videoId === videoId && v.libraryTrackId === libraryTrackId),
              ),
              { videoId, libraryTrackId, verdict },
            ],
          }))
          supersedeLoad()
        }),
    [supersedeLoad],
  )

  const reconnect = useCallback(async () => {
    applyStatus(await tauriApi.connectYouTubeMusic())
  }, [applyStatus])

  const addPlaylist = useCallback(
    (link: string) => tauriApi.addYouTubeMusicPlaylist(link),
    [],
  )

  const removePlaylist = useCallback(
    (listId: string) => tauriApi.removeYouTubeMusicPlaylist(listId),
    [],
  )

  return {
    status,
    connected,
    library,
    seenBefore,
    syncing,
    filter,
    setFilter,
    openList,
    syncNow,
    setVerdict,
    reconnect,
    addPlaylist,
    removePlaylist,
  }
}

/**
 * Ownership and the counts, against useSpotify's library index. No number
 * before the library has loaded once: every track would count as Missing.
 */
export function useYouTubeMusicMatches(
  library: YtmLibrary,
  matcher: Pick<SpotifyData, 'index' | 'libraryLoaded'>,
): YouTubeMusicMatches {
  const { index, libraryLoaded } = matcher
  const ownership = useMemo(
    () => classifyYouTubeMusic(library.tracks, index, library.verdicts),
    [library.tracks, library.verdicts, index],
  )
  const newCounts = useMemo(
    () =>
      libraryLoaded
        ? newAndMissing(library, ownership)
        : { total: 0, byList: new Map<string, number>() },
    [libraryLoaded, library, ownership],
  )
  const counts = useMemo(() => listCounts(library), [library])
  return useMemo(
    () => ({ ownership, newCounts, counts }),
    [ownership, newCounts, counts],
  )
}
```

- [ ] **Step 2: Check**

Run: `npx tsc --noEmit -p . && npx eslint src/components/youtube-music && npx vitest run`
Expected: no type errors; no eslint output; 362 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/youtube-music/useYouTubeMusic.ts
git commit -m "feat(youtube-music): the useYouTubeMusic hook, with matching against useSpotify's library index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: One view for both services — `StreamingListView`, with `SpotifyView` as a thin wrapper

**Files:**
- Modify: `src/lib/spotify/rows.ts` (`filterRowsBy`, `countByStatus` for any row)
- Test: `src/lib/spotify/rows.test.ts`
- Modify: `src/components/spotify/SpotifyRowActions.tsx` (`VerdictButtons`)
- Create: `src/components/views/StreamingListView.tsx`
- Modify: `src/components/views/SpotifyView.tsx`
- Modify: `src/components/views/SpotifyView.css`

A refactor: the Spotify view must look and behave exactly as before. `StreamingListView` holds the header, toolbar, table, Maybe sub-rows, reconnect bar and footer; it takes the service's rows, the words a row shows (`describe`) and its Status cell (`renderStatus`) as props. The CSS keeps its `spotify-*` class names: renaming 440 lines would only churn. `SpotifyRowActions`' Yes / No moves into `VerdictButtons` so YouTube Music's rows reuse it; DJ pages' tracks tab keeps using `SpotifyRowActions` unchanged.

- [ ] **Step 1: Write the failing test** (append to `src/lib/spotify/rows.test.ts`, and add `filterRowsBy` to its import from `./rows`)

```ts
describe('filtering any service’s rows', () => {
  it('filters by status, then by the words it is given for each row', () => {
    const rows = [
      { ownership: { kind: 'missing' as const }, text: 'Nina Kraviz Tarde' },
      { ownership: { kind: 'owned' as const }, text: 'Soulva Odyssey' },
    ]
    const text = (row: (typeof rows)[number]) => row.text
    expect(filterRowsBy(rows, 'all', 'kraviz', text)).toEqual([rows[0]])
    expect(filterRowsBy(rows, 'owned', '', text)).toEqual([rows[1]])
    expect(filterRowsBy(rows, 'missing', 'odyssey', text)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/spotify/rows.test.ts`
Expected: FAIL — `filterRowsBy is not a function`.

- [ ] **Step 3: `rows.ts` — filtering and counting any row**

In `src/lib/spotify/rows.ts`, change `countByStatus`'s signature to:

```ts
export function countByStatus(
  rows: { ownership: Ownership }[],
): Record<StatusFilter, number> {
```

(its body is unchanged), and replace `filterRows` with:

```ts
/**
 * Status first, then every typed word must appear in what `text` gives for the
 * row. Any service's rows: Spotify's give title, artists and album.
 */
export function filterRowsBy<R extends { ownership: Ownership }>(
  rows: R[],
  filter: StatusFilter,
  query: string,
  text: (row: R) => string,
): R[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filter !== 'all' && row.ownership.kind !== filter) return false
    if (!words.length) return true
    const haystack = fold(text(row))
    return words.every((word) => haystack.includes(word))
  })
}

/** Status first, then every typed word must appear in title, artists or album. */
export function filterRows(
  rows: SpotifyRow[],
  filter: StatusFilter,
  query: string,
): SpotifyRow[] {
  return filterRowsBy(rows, filter, query, spotifySearchText)
}

/** What a Spotify row's search looks through. */
export function spotifySearchText(row: SpotifyRow): string {
  return `${row.track.title} ${row.track.artists} ${row.track.album ?? ''}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/spotify`
Expected: PASS — the old `filterRows` tests unchanged, and the new one.

- [ ] **Step 5: `VerdictButtons`**

In `src/components/spotify/SpotifyRowActions.tsx`, directly above `export function SpotifyRowActions(` add:

```tsx
/**
 * Yes / No on a Maybe row, and "Not saved" when the answer did not stick.
 * Also YouTube Music's Maybe rows.
 */
export function VerdictButtons({
  onVerdict,
}: {
  /** Rejects when the answer could not be saved. */
  onVerdict: (verdict: Verdict) => Promise<void>
}) {
  /** The answer being saved; the buttons wait for it. */
  const [pending, setPending] = useState<Verdict | null>(null)
  const [answerFailed, setAnswerFailed] = useState(false)

  const answer = (verdict: Verdict) => {
    setPending(verdict)
    setAnswerFailed(false)
    onVerdict(verdict)
      .catch(() => setAnswerFailed(true))
      .finally(() => setPending(null))
  }

  return (
    <>
      {answerFailed && (
        <span className="spotify-status__error" role="status">
          Not saved
        </span>
      )}
      <button
        type="button"
        className="spotify-mini"
        disabled={pending !== null}
        aria-busy={pending === 'yes'}
        onClick={() => answer('yes')}
        title="This is the file"
      >
        {pending === 'yes' ? '…' : 'Yes'}
      </button>
      <button
        type="button"
        className="spotify-mini"
        disabled={pending !== null}
        aria-busy={pending === 'no'}
        onClick={() => answer('no')}
        title="Not this file"
      >
        {pending === 'no' ? '…' : 'No'}
      </button>
    </>
  )
}
```

In `SpotifyRowActions`, delete the `pending` / `answerFailed` state and the `answer` function (the block from `/** The answer being saved; the buttons wait for it. */` to the end of `answer`), and replace the Maybe branch's return with:

```tsx
    return (
      <span className="spotify-status">
        <span className="spotify-status__maybe">Maybe</span>
        {play}
        <YouTubeButton text={copyText(row.track)} />
        <VerdictButtons onVerdict={onVerdict} />
      </span>
    )
```

The markup is the same as before, element for element.

- [ ] **Step 6: `StreamingListView`**

```tsx
// src/components/views/StreamingListView.tsx
// One list of a streaming service — or All playlists — against the library:
// what is Owned, what is Missing, and what might be either. SpotifyView and
// YouTubeMusicView hand it their rows, the words each row shows, and their
// Status cell. The look is SpotifyView.css's.
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { useNow } from '../spotify/useNow'
import type { Track } from '../../types/track'
import type { Ownership } from '../../lib/spotify/ownership'
import {
  countByStatus,
  fileName,
  filterRowsBy,
  formatAdded,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { getErrorMessage, isAppError, type AppErrorKind } from '../../types/ai'
import './SpotifyView.css'

/** What every service's row carries. */
export interface StreamRow {
  ownership: Ownership
  /** Newest added_at across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

/** The words a row shows, and what the search box looks through. */
export interface RowText {
  key: string
  title: string
  /** The title cell's tooltip. */
  titleTip: string
  artist: string
  search: string
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'owned', label: 'Owned' },
]

interface StreamingListViewProps<R extends StreamRow> {
  /** "Spotify", "YouTube Music": the reconnect bar and the sync button name it. */
  serviceName: string
  /** The cover's colours: `spotify-header__cover--<service>`. */
  service: 'spotify' | 'youtube-music'
  /** Shown in capitals above the title. */
  kicker: string
  title: string
  coverIcon: 'Heart' | 'ListMusic'
  rows: R[]
  /** Kept stable (module level): it is a memo dependency. */
  describe: (row: R) => RowText
  /** The Status cell: what it is, and what can be done about it. */
  renderStatus: (row: R) => ReactNode
  /** All playlists: a Playlist column. */
  showLists: boolean
  /** The list is not stored (gone, or removed): what the empty table says. */
  missingText: string | null
  filter: StatusFilter
  onFilter: (filter: StatusFilter) => void
  /** The library has not arrived yet: statuses are not known. */
  checking: boolean
  /** The whole library, to play an Owned row's file. */
  libraryTracks: Track[]
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
  syncing: boolean
  /** The meta line's last part ("synced 2 min ago"), given the clock. */
  syncText: (now: number | null) => string
  onSync: () => void
  needsReconnect: boolean
  /** Rejects with the error when the login fails. */
  onReconnect: () => Promise<void>
  /** The kind a newer Connect cancels this login with; not shown. */
  loginCancelledKind: AppErrorKind
  /** After the counts on the meta line: "no longer available". */
  notice?: string
  /** After the footer's sort note: "2 unavailable". */
  footerNote?: string
  /** Below the table: YouTube Music's Sets group. */
  afterTable?: ReactNode
}

export function StreamingListView<R extends StreamRow>({
  serviceName,
  service,
  kicker,
  title,
  coverIcon,
  rows,
  describe,
  renderStatus,
  showLists,
  missingText,
  filter,
  onFilter,
  checking,
  libraryTracks,
  onPlayTrack,
  syncing,
  syncText,
  onSync,
  needsReconnect,
  onReconnect,
  loginCancelledKind,
  notice,
  footerNote,
  afterTable,
}: StreamingListViewProps<R>) {
  const now = useNow(30_000)
  const nowDate = useMemo(() => (now === null ? null : new Date(now)), [now])
  const [query, setQuery] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)
  /** Each Reconnect click; only the newest one's end clears "Waiting…". */
  const reconnectSeq = useRef(0)

  const counts = useMemo(() => countByStatus(rows), [rows])
  const shown = useMemo(
    () => filterRowsBy(rows, filter, query, (row) => describe(row).search),
    [rows, filter, query, describe],
  )

  // The player wants full Tracks: look the matched file up in the loaded library.
  const tracksById = useMemo(
    () => new Map(libraryTracks.map((track) => [track.id, track])),
    [libraryTracks],
  )

  // Double-clicking an Owned row plays its file, queued with the other owned rows on screen.
  const ownedQueue = useMemo(
    () =>
      shown.flatMap((row) => {
        const id =
          row.ownership.kind === 'owned' ? row.ownership.file?.id : undefined
        const track = id === undefined ? undefined : tracksById.get(id)
        return track ? [track] : []
      }),
    [shown, tracksById],
  )

  const playOwned = (row: R) => {
    const file = row.ownership.file
    if (row.ownership.kind !== 'owned' || !file) return
    const index = ownedQueue.findIndex((track) => track.id === file.id)
    if (index >= 0) onPlayTrack(ownedQueue[index], ownedQueue, index)
  }

  const emptyText = (): string => {
    if (missingText) return missingText
    if (rows.length === 0)
      return 'Nothing here yet — the first sync may still be running.'
    if (checking) return 'Checking your library…'
    // Rows under this filter, so the search is what hid them.
    if (counts[filter] > 0) return 'Nothing matches.'
    switch (filter) {
      case 'missing':
        return 'Nothing missing.'
      case 'owned':
        return 'Nothing owned.'
      case 'maybe':
        return 'No maybes.'
      default:
        return 'Nothing matches.'
    }
  }

  // Clicking again while waiting starts a fresh login; Rust cancels the old one.
  const reconnect = () => {
    const seq = ++reconnectSeq.current
    setReconnecting(true)
    setReconnectError(null)
    onReconnect()
      .catch((e: unknown) => {
        // A newer Connect cancelled this login on purpose.
        if (isAppError(e) && e.kind === loginCancelledKind) return
        if (seq === reconnectSeq.current) setReconnectError(getErrorMessage(e))
      })
      .finally(() => {
        if (seq === reconnectSeq.current) setReconnecting(false)
      })
  }

  const rowClass = (extra: string) =>
    `spotify-row ${extra} ${showLists ? 'spotify-row--lists' : ''}`

  return (
    <div className="spotify-view">
      {needsReconnect && (
        <div className="spotify-reconnect" role="alert">
          <span>
            {serviceName} needs you to sign in again. Your lists stay as they
            were.
          </span>
          <button
            type="button"
            className="spotify-mini spotify-mini--primary"
            onClick={reconnect}
            title={
              reconnecting
                ? 'Closed the browser tab? Click to sign in again'
                : undefined
            }
          >
            {reconnecting
              ? `Waiting for ${serviceName}… (try again)`
              : `Reconnect ${serviceName}`}
          </button>
          {reconnectError && (
            <span className="spotify-reconnect__error">{reconnectError}</span>
          )}
        </div>
      )}

      <header className="spotify-header">
        <div
          className={`spotify-header__cover spotify-header__cover--${service}`}
        >
          <Icon name={coverIcon} size={36} strokeWidth={1.75} />
        </div>
        <div className="spotify-header__info">
          <div className="spotify-header__kicker">{kicker}</div>
          <h1 className="spotify-header__title">{title}</h1>
          <div className="spotify-header__meta">
            <b>{counts.all} tracks</b>·
            {checking ? (
              <span className="spotify-header__checking">
                Checking your library…
              </span>
            ) : (
              <>
                <span className="spotify-header__owned">
                  {counts.owned} owned
                </span>
                ·<span>{counts.missing} missing</span>·
                <span className="spotify-header__maybe">
                  {counts.maybe} maybe
                </span>
              </>
            )}
            {notice && (
              <span className="spotify-header__notice">· {notice}</span>
            )}
            <button
              type="button"
              className="spotify-header__sync"
              onClick={onSync}
              disabled={syncing}
              title={`Sync with ${serviceName} now`}
            >
              <Icon name="RefreshCw" size={12} />
              {syncText(now)}
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
            className={`spotify-chip ${filter === key ? 'spotify-chip--on' : ''}`}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {/* Until the library is known only the total is. */}
            {label}{' '}
            <small>{checking && key !== 'all' ? '…' : counts[key]}</small>
          </button>
        ))}
      </div>

      <div className="spotify-table" role="table" aria-label={title}>
        <div className={rowClass('spotify-row--head')} role="row">
          <span className="spotify-cell--num" role="columnheader">
            #
          </span>
          <span role="columnheader">Title</span>
          <span role="columnheader">Artist</span>
          {showLists && <span role="columnheader">Playlist</span>}
          <span role="columnheader">Added</span>
          <span className="spotify-cell--status" role="columnheader">
            Status
          </span>
        </div>

        {shown.map((row, index) => {
          const text = describe(row)
          return (
            <Fragment key={text.key}>
              <div
                className={rowClass(
                  `spotify-row--data ${row.ownership.kind === 'owned' ? 'spotify-row--owned' : ''}`,
                )}
                role="row"
                onDoubleClick={() => playOwned(row)}
              >
                <span className="spotify-cell--num" role="cell">
                  {index + 1}
                </span>
                <span
                  className="spotify-cell--title"
                  role="cell"
                  title={text.titleTip}
                >
                  {row.isNew && (
                    <i className="spotify-new-dot" role="img" aria-label="New" />
                  )}
                  {text.title}
                </span>
                <span
                  className="spotify-cell--artist"
                  role="cell"
                  title={text.artist}
                >
                  {text.artist}
                </span>
                {showLists && (
                  <span
                    className="spotify-cell--lists"
                    role="cell"
                    title={row.lists.join(', ')}
                  >
                    {row.lists.join(', ')}
                  </span>
                )}
                <span className="spotify-cell--added" role="cell">
                  {nowDate ? formatAdded(row.addedAt, nowDate) : ''}
                </span>
                {/* Double-clicking a button must not also play the row. */}
                <span
                  className="spotify-cell--status"
                  role="cell"
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {renderStatus(row)}
                </span>
              </div>
              {row.ownership.kind === 'maybe' && row.ownership.file && (
                <div className="spotify-row spotify-row--sub" role="row">
                  <span role="cell" />
                  <span
                    className="spotify-hint"
                    role="cell"
                    aria-colspan={showLists ? 5 : 4}
                  >
                    In library:{' '}
                    <code title={row.ownership.file.file_path}>
                      {fileName(row.ownership.file.file_path)}
                    </code>
                    <span className="spotify-hint__why">
                      · {row.ownership.reason}
                    </span>
                  </span>
                </div>
              )}
            </Fragment>
          )
        })}

        {shown.length === 0 && (
          <div className="spotify-empty" role="row">
            <span role="cell">{emptyText()}</span>
          </div>
        )}
      </div>

      {afterTable}

      <div className="spotify-footer">
        {shown.length} of {rows.length} · sorted by date added, newest first
        {footerNote ? ` · ${footerNote}` : ''}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: `SpotifyView` becomes the wrapper**

Replace the whole of `src/components/views/SpotifyView.tsx` with:

```tsx
// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library. The view itself
// is StreamingListView; this gives it Spotify's rows, words and actions.
import { useMemo } from 'react'
import {
  StreamingListView,
  type RowText,
} from './StreamingListView'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import type { Track } from '../../types/track'
import type { SpotifyData } from '../spotify/useSpotify'
import {
  formatSynced,
  rowsFor,
  spotifySearchText,
  syncErrorText,
  type SpotifyRow,
} from '../../lib/spotify/rows'
import { ALL_LISTS, LIKED } from '../../types/spotify'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
}

function describeRow(row: SpotifyRow): RowText {
  return {
    key: row.track.spotifyId,
    title: row.track.title,
    titleTip: row.track.title,
    artist: row.track.artists,
    search: spotifySearchText(row),
  }
}

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(spotify: SpotifyData, now: number | null): string {
  if (spotify.syncing) return 'syncing…'
  const status = spotify.status
  const ago =
    status?.lastSyncedAt && now !== null
      ? formatSynced(status.lastSyncedAt, now)
      : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  if (status?.lastError) {
    const why = syncErrorText(status.lastErrorKind)
    return ago ? `last synced ${ago} · ${why}` : why
  }
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

export function SpotifyView({ listId, spotify, onPlayTrack }: SpotifyViewProps) {
  const list = spotify.library.lists.find((l) => l.id === listId)
  const rows = useMemo(
    () =>
      rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const checking = !spotify.libraryLoaded

  return (
    <StreamingListView
      serviceName="Spotify"
      service="spotify"
      kicker="Spotify playlist"
      title={
        listId === ALL_LISTS ? 'All playlists' : (list?.name ?? 'Spotify playlist')
      }
      coverIcon={listId === LIKED ? 'Heart' : 'ListMusic'}
      rows={rows}
      describe={describeRow}
      renderStatus={(row) => (
        <SpotifyRowActions
          row={row}
          checking={checking}
          onVerdict={(verdict) =>
            row.ownership.file
              ? spotify.setVerdict(
                  row.track.spotifyId,
                  row.ownership.file.id,
                  verdict,
                )
              : Promise.resolve()
          }
        />
      )}
      showLists={listId === ALL_LISTS}
      missingText={
        listId !== ALL_LISTS && !list
          ? 'This playlist is no longer on Spotify, or Spotify stopped sharing it.'
          : null
      }
      filter={spotify.filter}
      onFilter={spotify.setFilter}
      checking={checking}
      libraryTracks={spotify.libraryTracks}
      onPlayTrack={onPlayTrack}
      syncing={spotify.syncing}
      syncText={(now) => syncLine(spotify, now)}
      onSync={spotify.syncNow}
      needsReconnect={spotify.status?.needsReconnect ?? false}
      onReconnect={spotify.reconnect}
      loginCancelledKind="SpotifyLoginCancelled"
    />
  )
}
```

- [ ] **Step 8: The meta line's notice**

In `src/components/views/SpotifyView.css`, directly under the `.spotify-header__checking { … }` rule add:

```css
/* "no longer available": a playlist YouTube stopped showing. */
.spotify-header__notice {
  color: var(--color-danger);
}
```

- [ ] **Step 9: Check**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/components/views/StreamingListView.tsx src/components/views/SpotifyView.tsx src/components/spotify src/lib/spotify`
Expected: no type errors; 363 tests pass; no eslint output.

By hand (`npm run tauri dev`, with Spotify connected): open Liked Songs and All playlists. The header, chips, search, dots, Maybe sub-rows, Yes / No, Copy, play, double-click-to-play, the footer, and the Reconnect bar (if you can bring it up) look and act exactly as before this task.

- [ ] **Step 10: Commit**

```bash
git add src/lib/spotify/rows.ts src/lib/spotify/rows.test.ts src/components/spotify/SpotifyRowActions.tsx src/components/views/StreamingListView.tsx src/components/views/SpotifyView.tsx src/components/views/SpotifyView.css
git commit -m "refactor(spotify): the view becomes StreamingListView, ready to be shared with YouTube Music

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The YouTube Music view — red cover, row actions, the Sets group

**Files:**
- Create: `src/components/youtube-music/YouTubeMusicRowActions.tsx`
- Create: `src/components/views/YouTubeMusicView.tsx`
- Create: `src/components/views/YouTubeMusicView.css`

What differs from Spotify's view (spec, "Main view" and "Row actions"):
- kicker `YOUTUBE MUSIC PLAYLIST`, a red cover, a heart for Liked music;
- **Added** is `snippet.publishedAt`, already in `addedAt`;
- **Play** is the red YouTube glyph and opens `music.youtube.com/watch?v=<id>`: the exact video, no search;
- Owned: `✓ Owned` + play. Missing: `Missing` + play + SelectedRecs ↗ + Copy. Maybe: `Maybe` + play + Yes / No, and the sub-row;
- sets go under the table in **Sets (n)**: title, channel, length, **Open in Sets**;
- the footer says `2 unavailable` when there are any; a vanished playlist says `no longer available` on the meta line;
- when YouTube said the quota is used up, the meta line reads `YouTube quota used up · resumes after midnight Pacific`.

The view is reached from the sidebar in Task 18.

- [ ] **Step 1: The Status cell**

```tsx
// src/components/youtube-music/YouTubeMusicRowActions.tsx
// The Status cell of a YouTube Music row. Play opens the exact video on
// YouTube Music in the browser: YouTube has no API to play it anywhere else.
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { CopyButton, VerdictButtons } from '../spotify/SpotifyRowActions'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import {
  copyText,
  musicUrl,
  selectedRecsUrl,
} from '../../lib/youtube-music/title'
import type { YtmRow } from '../../lib/youtube-music/rows'
import type { Verdict } from '../../types/spotify'

interface YouTubeMusicRowActionsProps {
  row: YtmRow
  /** Rejects when the answer could not be saved. */
  onVerdict: (verdict: Verdict) => Promise<void>
  /** The library has not arrived yet: the status is not known. */
  checking: boolean
}

export function YouTubeMusicRowActions({
  row,
  onVerdict,
  checking,
}: YouTubeMusicRowActionsProps) {
  if (checking) {
    return (
      <span className="spotify-status">
        <span className="spotify-status__checking">
          <span aria-hidden="true">—</span>
          <span className="spotify-sr-only">Checking</span>
        </span>
      </span>
    )
  }

  const play = (
    <button
      type="button"
      className="spotify-mini spotify-mini--icon spotify-mini--youtube"
      title="Play on YouTube Music"
      aria-label="Play on YouTube Music"
      onClick={() => {
        openUrl(musicUrl(row.track.videoId)).catch(() => {})
      }}
    >
      <YouTubeGlyph size={12} />
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
        <VerdictButtons onVerdict={onVerdict} />
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
          openUrl(selectedRecsUrl(row.track)).catch(() => {})
        }}
      >
        <Icon name="ExternalLink" size={12} />
      </button>
      <CopyButton text={copyText(row.track)} />
    </span>
  )
}
```

- [ ] **Step 2: The view**

```tsx
// src/components/views/YouTubeMusicView.tsx
// One YouTube Music list — or All playlists — against the library. The view is
// StreamingListView; this gives it YouTube Music's rows, words and actions,
// and the Sets group under the table.
import { useMemo } from 'react'
import { StreamingListView, type RowText } from './StreamingListView'
import { YouTubeMusicRowActions } from '../youtube-music/YouTubeMusicRowActions'
import type { SpotifyData } from '../spotify/useSpotify'
import type {
  YouTubeMusicData,
  YouTubeMusicMatches,
} from '../youtube-music/useYouTubeMusic'
import type { Track } from '../../types/track'
import { formatSynced } from '../../lib/spotify/rows'
import { msToCue } from '../../lib/tracklist/text'
import {
  rowsFor,
  syncErrorText,
  unavailableCount,
  type YtmRow,
  type YtmSetRow,
} from '../../lib/youtube-music/rows'
import { ALL_YTM_LISTS, LIKED_MUSIC } from '../../types/youtubeMusic'
import './YouTubeMusicView.css'

interface YouTubeMusicViewProps {
  /** ALL_YTM_LISTS, LIKED_MUSIC, or a playlist id. */
  listId: string
  youtubeMusic: YouTubeMusicData
  matches: YouTubeMusicMatches
  /** useSpotify's library: the files to play, and whether they have arrived. */
  library: Pick<SpotifyData, 'libraryTracks' | 'libraryLoaded'>
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
  /** Opens Sets on a video; Sets fetches it when it is not stored. */
  onOpenSet: (videoId: string) => void
}

function describeRow(row: YtmRow): RowText {
  return {
    key: row.track.videoId,
    title: row.title,
    titleTip: row.track.title,
    artist: row.artist,
    search: `${row.title} ${row.artist} ${row.track.title} ${row.track.channel}`,
  }
}

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(youtubeMusic: YouTubeMusicData, now: number | null): string {
  if (youtubeMusic.syncing) return 'syncing…'
  const status = youtubeMusic.status
  // The spec's exact words, whatever else happened.
  if (status?.quotaUsedUp) return syncErrorText('quotaExceeded')
  const ago =
    status?.lastSyncedAt && now !== null
      ? formatSynced(status.lastSyncedAt, now)
      : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  if (status?.lastError) {
    const why = syncErrorText(status.lastErrorKind)
    return ago ? `last synced ${ago} · ${why}` : why
  }
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

/** The sets in the list: not tracks, each one click from Sets. */
function SetsGroup({
  sets,
  onOpenSet,
}: {
  sets: YtmSetRow[]
  onOpenSet: (videoId: string) => void
}) {
  return (
    <section className="ytm-sets" aria-label="Sets">
      <h2 className="ytm-sets__title">Sets ({sets.length})</h2>
      {sets.map(({ track }) => (
        <div className="ytm-sets__row" key={track.videoId}>
          <span className="ytm-sets__name" title={track.title}>
            {track.title}
          </span>
          <span className="ytm-sets__channel" title={track.channel}>
            {track.channel}
          </span>
          <span className="ytm-sets__length">
            {msToCue(track.durationMs ?? 0)}
          </span>
          <button
            type="button"
            className="spotify-mini"
            onClick={() => onOpenSet(track.videoId)}
          >
            Open in Sets
          </button>
        </div>
      ))}
    </section>
  )
}

export function YouTubeMusicView({
  listId,
  youtubeMusic,
  matches,
  library,
  onPlayTrack,
  onOpenSet,
}: YouTubeMusicViewProps) {
  const list = youtubeMusic.library.lists.find((l) => l.id === listId)
  const { rows, sets } = useMemo(
    () =>
      rowsFor(
        listId,
        youtubeMusic.library,
        matches.ownership,
        youtubeMusic.seenBefore,
      ),
    [listId, youtubeMusic.library, matches.ownership, youtubeMusic.seenBefore],
  )
  const unavailable = useMemo(
    () => unavailableCount(listId, youtubeMusic.library),
    [listId, youtubeMusic.library],
  )
  const checking = !library.libraryLoaded

  return (
    <StreamingListView
      serviceName="YouTube Music"
      service="youtube-music"
      kicker="YouTube Music playlist"
      title={
        listId === ALL_YTM_LISTS
          ? 'All playlists'
          : (list?.name ?? 'YouTube Music playlist')
      }
      coverIcon={listId === LIKED_MUSIC ? 'Heart' : 'ListMusic'}
      rows={rows}
      describe={describeRow}
      renderStatus={(row) => (
        <YouTubeMusicRowActions
          row={row}
          checking={checking}
          onVerdict={(verdict) =>
            row.ownership.file
              ? youtubeMusic.setVerdict(
                  row.track.videoId,
                  row.ownership.file.id,
                  verdict,
                )
              : Promise.resolve()
          }
        />
      )}
      showLists={listId === ALL_YTM_LISTS}
      missingText={
        listId !== ALL_YTM_LISTS && !list
          ? 'This playlist is no longer in the sidebar.'
          : null
      }
      filter={youtubeMusic.filter}
      onFilter={youtubeMusic.setFilter}
      checking={checking}
      libraryTracks={library.libraryTracks}
      onPlayTrack={onPlayTrack}
      syncing={youtubeMusic.syncing}
      syncText={(now) => syncLine(youtubeMusic, now)}
      onSync={youtubeMusic.syncNow}
      needsReconnect={youtubeMusic.status?.needsReconnect ?? false}
      onReconnect={youtubeMusic.reconnect}
      loginCancelledKind="YouTubeMusicLoginCancelled"
      notice={list?.unavailableAt ? 'no longer available' : undefined}
      footerNote={unavailable > 0 ? `${unavailable} unavailable` : undefined}
      afterTable={
        sets.length > 0 ? (
          <SetsGroup sets={sets} onOpenSet={onOpenSet} />
        ) : undefined
      }
    />
  )
}
```

- [ ] **Step 3: Its CSS**

```css
/* src/components/views/YouTubeMusicView.css */
/* StreamingListView's look (SpotifyView.css), in YouTube's red, plus the Sets group. */

.spotify-header__cover--youtube-music {
  background: linear-gradient(135deg, #ff0033, #8c1023);
}

.ytm-sets {
  margin: 20px 16px 0;
}

.ytm-sets__title {
  margin: 0 0 6px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ytm-sets__row {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1.3fr) 64px auto;
  gap: 12px;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 13px;
}

.ytm-sets__row:hover {
  background: var(--bg-tertiary);
}

.ytm-sets__name,
.ytm-sets__channel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ytm-sets__channel,
.ytm-sets__length {
  color: var(--text-secondary);
}

.ytm-sets__length {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Check**

Run: `npx tsc --noEmit -p . && npx eslint src/components/youtube-music src/components/views/YouTubeMusicView.tsx && npx vitest run`
Expected: no type errors; no eslint output; 363 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/youtube-music/YouTubeMusicRowActions.tsx src/components/views/YouTubeMusicView.tsx src/components/views/YouTubeMusicView.css
git commit -m "feat(youtube-music): the view — red cover, row actions, the Sets group and the unavailable count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 18: YOUTUBE MUSIC in the sidebar and the rail, + Add playlist and Remove, and opening a list

**Files:**
- Modify: `src/lib/sidebarPrefs.ts`, `src/lib/sidebarPrefs.test.ts`
- Modify: `src/components/layout/sidebarTypes.ts`
- Create: `src/components/youtube-music/YouTubeMusicLists.tsx`
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/SidebarRail.tsx`, `src/components/layout/Sidebar.css`
- Modify: `src/App.tsx`

The section sits below SPOTIFY and is built like it: **All playlists**, **Liked music**, then each added playlist in the order added, with the "new and missing" number on the header and on each item. **+ Add playlist** at the end opens a one-line field; Enter reads the playlist, Escape closes. A playlist that cannot be read gets the one line Rust sends back, and nothing is stored. Right-click a playlist → **Remove**; Liked music has no menu. Hidden until connected and while **Show in sidebar** is off — the rail icon too.

App's navigation keeps one open streaming list: `spotifyListId` becomes `streamList = { service, listId }`, so every "close the other views" call site (`setSpotifyListId(null)`, about fifteen of them) becomes `setStreamList(null)` with one replace.

- [ ] **Step 1: Write the failing tests** (in `src/lib/sidebarPrefs.test.ts`)

Replace the `offers eight swatches that include every default` test with:

```ts
  it('offers nine swatches that include every default', () => {
    expect(PALETTE).toHaveLength(9)
    for (const hex of new Set(Object.values(DEFAULT_COLOURS))) {
      expect(PALETTE).toContain(hex)
    }
  })
```

and append:

```ts
describe('the YouTube Music view', () => {
  it('lights the YouTube Music section, in YouTube red by default', () => {
    expect(sectionForView('youtube-music')).toBe('youtube-music')
    expect(DEFAULT_COLOURS['youtube-music']).toBe('#ff4e45')
    expect(SECTION_LABELS['youtube-music']).toBe('YouTube Music')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: FAIL — the palette has 8; `'youtube-music'` is not a view (tsc would say so too; Vitest just reports `undefined`).

- [ ] **Step 3: `sidebarPrefs.ts`**

- In `SidebarSection`, directly under `| 'spotify'` add `| 'youtube-music'`.
- In `SECTION_LABELS`, directly under `spotify: 'Spotify',` add `'youtube-music': 'YouTube Music',`.
- In `ActiveView`, directly under `| 'spotify'` add `| 'youtube-music'`.
- In `DEFAULT_COLOURS`, directly under `spotify: '#1ed760',` add `'youtube-music': '#ff4e45',`.
- Replace the `PALETTE` comment and list with:

```ts
/** The right-click menu's swatches: every default, plus yellow. */
export const PALETTE = [
  '#60a5fa',
  '#fb923c',
  '#818cf8',
  '#2dd4bf',
  '#a78bfa',
  '#f472b6',
  '#1ed760',
  '#ff4e45',
  '#facc15',
] as const
```

`sectionForView` needs no change: its default branch returns the view, and `'youtube-music'` is both.

In `src/components/layout/Sidebar.css`, make room for the ninth swatch:
- in `.sidebar-colour-menu__swatches`, `grid-template-columns: repeat(8, 20px);` → `grid-template-columns: repeat(9, 20px);`
- in `.sidebar-ctx-menu`, `min-width: 236px;` → `min-width: 252px;`

In `src/components/layout/Sidebar.tsx`, in `openColourMenu`, `x: Math.min(e.clientX, window.innerWidth - 248),` → `x: Math.min(e.clientX, window.innerWidth - 264),`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/sidebarPrefs.test.ts`
Expected: PASS.

- [ ] **Step 5: The shared types**

In `src/components/layout/sidebarTypes.ts`:
- add `import type { YtmList } from '../../types/youtubeMusic'` under the `SpotifyList` import;
- in `FlyoutSection`, `'folders' | 'playlists' | 'spotify'` → `'folders' | 'playlists' | 'spotify' | 'youtube-music'`;
- append:

```ts
/** What the YOUTUBE MUSIC section shows. Absent while not connected, or hidden. */
export interface SidebarYouTubeMusic {
  lists: YtmList[]
  /** Tracks behind each item, plus ALL_YTM_LISTS; sets left out. */
  counts: Map<string, number>
  /** Distinct new-and-missing tracks: the header's (and the rail icon's) number. */
  newTotal: number
  newByList: Map<string, number>
  activeListId: string | null
  onOpenList: (listId: string) => void
  /** Rejects with the one line the field shows under itself. */
  onAddPlaylist: (link: string) => Promise<void>
  onRemovePlaylist: (listId: string) => Promise<void>
}
```

- [ ] **Step 6: The list items, the field and the menu**

```tsx
// src/components/youtube-music/YouTubeMusicLists.tsx
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

interface YouTubeMusicListsProps {
  lists: YtmList[]
  /** Tracks behind each item, plus ALL_YTM_LISTS. */
  counts: Map<string, number>
  /** New-and-missing per list; absent means none. */
  newByList: Map<string, number>
  activeListId: string | null
  onOpen: (listId: string) => void
  /** Rejects with the one line to show under the field. */
  onAdd: (link: string) => Promise<void>
  onRemove: (listId: string) => Promise<void>
}

export function YouTubeMusicLists({
  lists,
  counts,
  newByList,
  activeListId,
  onOpen,
  onAdd,
  onRemove,
}: YouTubeMusicListsProps) {
  /** The + Add playlist field is open. */
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
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const closeField = () => {
    setAdding(false)
    setLink('')
    setError(null)
  }

  const submit = () => {
    const text = link.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    onAdd(text)
      .then(closeField)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setBusy(false))
  }

  const remove = (listId: string) => {
    setMenu(null)
    setError(null)
    onRemove(listId).catch((e: unknown) => setError(getErrorMessage(e)))
  }

  const item = (list: {
    id: string
    name: string
    icon: 'ListMusic' | 'Heart'
    fresh: number
    gone: boolean
    removable: boolean
  }) => (
    <button
      key={list.id}
      type="button"
      className={`folder-row spotify-list-row ${activeListId === list.id ? 'selected' : ''}`}
      onClick={() => onOpen(list.id)}
      onContextMenu={
        list.removable
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({
                x: Math.min(e.clientX, window.innerWidth - 180),
                y: Math.min(e.clientY, window.innerHeight - 60),
                listId: list.id,
              })
            }
          : undefined
      }
      title={list.gone ? `${list.name} — no longer available` : list.name}
    >
      <Icon name={list.icon} size={14} className="spotify-list-row__icon" />
      <span className="folder-name">{list.name}</span>
      {list.gone && <span className="ytm-list-row__gone">no longer available</span>}
      {list.fresh > 0 && (
        <span className="spotify-list-row__new">{list.fresh}</span>
      )}
      <span className="folder-count">({counts.get(list.id) ?? 0})</span>
    </button>
  )

  return (
    <div className="folder-tree-section-body">
      {/* All playlists carries no number: the header already holds the distinct total. */}
      {item({
        id: ALL_YTM_LISTS,
        name: 'All playlists',
        icon: 'ListMusic',
        fresh: 0,
        gone: false,
        removable: false,
      })}
      {lists.map((list) =>
        item({
          id: list.id,
          name: list.name,
          icon: list.id === LIKED_MUSIC ? 'Heart' : 'ListMusic',
          fresh: newByList.get(list.id) ?? 0,
          gone: list.unavailableAt !== null,
          removable: list.id !== LIKED_MUSIC,
        }),
      )}

      {adding ? (
        <div className="ytm-add">
          <input
            // Opened by a click on "Add playlist": focus goes where the user is looking.
            autoFocus
            type="text"
            className="ytm-add__input"
            placeholder="Playlist link or id"
            aria-label="YouTube playlist link or id"
            value={link}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') closeField()
            }}
          />
          {busy && <span className="ytm-add__hint">Reading the playlist…</span>}
        </div>
      ) : (
        <button
          type="button"
          className="folder-row spotify-list-row"
          onClick={() => setAdding(true)}
        >
          <Icon name="Plus" size={14} className="spotify-list-row__icon" />
          <span className="folder-name">Add playlist</span>
        </button>
      )}
      {error && (
        <div className="ytm-add__error" role="alert">
          {error}
        </div>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="sidebar-ctx-menu ytm-list-menu"
          style={{ top: menu.y, left: menu.x }}
          role="menu"
        >
          <button
            type="button"
            className="sidebar-ctx-menu__item"
            role="menuitem"
            onClick={() => remove(menu.listId)}
          >
            <Icon name="Trash2" size={14} />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
```

Append to `src/components/layout/Sidebar.css`:

```css
/* ===== YouTube Music ===== */

.ytm-list-row__gone {
  margin-left: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
  white-space: nowrap;
}

.ytm-add {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 8px 6px 28px;
}

.ytm-add__input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.ytm-add__hint {
  color: var(--text-secondary);
  font-size: 11px;
}

.ytm-add__error {
  padding: 0 8px 6px 28px;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 1.35;
}

/* Only one item: no need for the colour menu's width. */
.sidebar-ctx-menu.ytm-list-menu {
  min-width: 160px;
}
```

- [ ] **Step 7: The full sidebar**

In `src/components/layout/Sidebar.tsx`:
- change `import type { NavItem, SidebarSpotify } from './sidebarTypes'` to `import type { NavItem, SidebarSpotify, SidebarYouTubeMusic } from './sidebarTypes'`;
- under `import { SpotifyLists } from '../spotify/SpotifyLists'` add:

```tsx
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import { YouTubeMusicLists } from '../youtube-music/YouTubeMusicLists'
```

- in `SidebarProps`, directly under `spotify?: SidebarSpotify` add `youtubeMusic?: SidebarYouTubeMusic`;
- in the component's parameter list, replace `  spotify,\n}: SidebarProps) {` with `  spotify,\n  youtubeMusic,\n}: SidebarProps) {`;
- directly under `const [spotifyExpanded, setSpotifyExpanded] = useState(true)` add:

```tsx
  const [youtubeMusicExpanded, setYouTubeMusicExpanded] = useState(true)
```

- in the `<SidebarRail …>` props, directly under `spotifyNew={spotify ? spotify.newTotal : null}` add:

```tsx
          youtubeMusicNew={youtubeMusic ? youtubeMusic.newTotal : null}
```

- in `renderSection`, replace

```tsx
              )
            ) : (
              // Navigating closes the flyout; expanding a playlist folder does
```

with

```tsx
              )
            ) : section === 'youtube-music' ? (
              youtubeMusic && (
                <YouTubeMusicLists
                  lists={youtubeMusic.lists}
                  counts={youtubeMusic.counts}
                  newByList={youtubeMusic.newByList}
                  activeListId={youtubeMusic.activeListId}
                  onOpen={(id) => {
                    youtubeMusic.onOpenList(id)
                    close()
                  }}
                  onAdd={youtubeMusic.onAddPlaylist}
                  onRemove={youtubeMusic.onRemovePlaylist}
                />
              )
            ) : (
              // Navigating closes the flyout; expanding a playlist folder does
```

- directly under the Spotify section (the block that ends `onOpen={spotify.onOpenList}\n              />\n            </Section>\n          </>\n        )}`), add:

```tsx

        {/* YouTube Music section — connected, and Show in sidebar on */}
        {youtubeMusic && (
          <>
            <div className="sidebar-divider" />
            <Section
              title="YouTube Music"
              glyph={
                <YouTubeGlyph size={14} style={iconStyle('youtube-music')} />
              }
              expanded={youtubeMusicExpanded}
              onToggle={() => setYouTubeMusicExpanded((v) => !v)}
              onContextMenu={openColourMenu('youtube-music')}
              trailing={
                youtubeMusic.newTotal > 0 ? (
                  <span className="sidebar-section__new">
                    {youtubeMusic.newTotal}
                    <span className="spotify-sr-only"> new</span>
                  </span>
                ) : undefined
              }
            >
              <YouTubeMusicLists
                lists={youtubeMusic.lists}
                counts={youtubeMusic.counts}
                newByList={youtubeMusic.newByList}
                activeListId={youtubeMusic.activeListId}
                onOpen={youtubeMusic.onOpenList}
                onAdd={youtubeMusic.onAddPlaylist}
                onRemove={youtubeMusic.onRemovePlaylist}
              />
            </Section>
          </>
        )}
```

- [ ] **Step 8: The rail**

In `src/components/layout/SidebarRail.tsx`:
- under `import { SpotifyGlyph } from '../spotify/SpotifyGlyph'` add `import { YouTubeGlyph } from '../spotify/YouTubeGlyph'`;
- in `SidebarRailProps`, directly under `spotifyNew: number | null` add:

```tsx
  /** The YouTube Music number; null hides its icon (not connected, or hidden). */
  youtubeMusicNew: number | null
```

- in the parameter list, replace `  spotifyNew,\n  renderSection,\n}: SidebarRailProps) {` with `  spotifyNew,\n  youtubeMusicNew,\n  renderSection,\n}: SidebarRailProps) {`;
- directly under the Spotify `sectionButton(…)` call (ending `spotifyNew,\n          )}`) add:

```tsx
        {youtubeMusicNew !== null &&
          sectionButton(
            'youtube-music',
            SECTION_LABELS['youtube-music'],
            <YouTubeGlyph size={16} style={iconStyle('youtube-music')} />,
            youtubeMusicNew,
          )}
```

- [ ] **Step 9: App — one open streaming list, both hooks, and the view**

In `src/App.tsx`:

1. Imports, under `import { SpotifyView } from './components/views/SpotifyView'`:

```tsx
import {
  useYouTubeMusic,
  useYouTubeMusicMatches,
} from './components/youtube-music/useYouTubeMusic'
import { YouTubeMusicView } from './components/views/YouTubeMusicView'
```

2. Directly under the `type DjOrigin = …` line:

```tsx
/** The open Spotify or YouTube Music list: 'all', or a list id. */
type StreamList = { service: 'spotify' | 'youtube-music'; listId: string }
```

3. Replace

```tsx
  /** The open Spotify list: 'all', 'liked' or a playlist id; null when another view is open. */
  const [spotifyListId, setSpotifyListId] = useState<string | null>(null)
```

with

```tsx
  /** The open Spotify or YouTube Music list; null when another view is open. */
  const [streamList, setStreamList] = useState<StreamList | null>(null)
```

4. Replace every `setSpotifyListId(null)` with `setStreamList(null)` (Edit with replace_all). Then, in `openSpotifyList`, replace `setSpotifyListId(listId)` with `setStreamList({ service: 'spotify', listId })`.

5. Replace

```tsx
  // A DJ page needs the whole library for Plays, Spotify or not.
  const spotify = useSpotify(dbReady, totalTrackCount, djPage !== null)
```

with

```tsx
  // YouTube Music first: while it is shown (connected, and Show in sidebar
  // on) useSpotify loads the library, whose index YouTube Music then matches
  // against. Hidden, it needs no matching. A DJ page needs the library too,
  // for Plays, Spotify or not.
  const youtubeMusic = useYouTubeMusic(dbReady)
  const youtubeMusicShown =
    youtubeMusic.connected && youtubeMusic.status?.showInSidebar !== false
  const spotify = useSpotify(
    dbReady,
    totalTrackCount,
    djPage !== null || youtubeMusicShown,
  )
  const youtubeMusicMatches = useYouTubeMusicMatches(youtubeMusic.library, spotify)
```

6. Directly under the `openSpotifyList` function add:

```tsx
  // A YouTube Music list: the same, for the other service.
  function openYouTubeMusicList(listId: string) {
    setStreamList({ service: 'youtube-music', listId })
    setDjPage(null)
    setSelectedFolder(null)
    setSelectedPlaylistId(null)
    setShowAllTracks(false)
    setShowSettings(false)
    setShowSearch(false)
    setShowSets(false)
    setShowAIChat(false)
    youtubeMusic.openList(listId)
  }
```

7. Replace the block Task 2 wrote

```tsx
  // The SPOTIFY section and its view exist while an account is connected and
  // Show in sidebar is on. Off, an open list falls through to the default
  // view; DJ pages and Search still use the account.
  const spotifyShown =
    spotify.connected && spotify.status?.showInSidebar !== false
  const shownSpotifyList = spotifyShown ? spotifyListId : null
```

with

```tsx
  // A service's section and its view exist while its account is connected and
  // Show in sidebar is on. Off, an open list falls through to the default
  // view; DJ pages and Search still use Spotify.
  // (`youtubeMusicShown` is worked out next to the hooks, above.)
  const spotifyShown =
    spotify.connected && spotify.status?.showInSidebar !== false
  const shownSpotifyList =
    spotifyShown && streamList?.service === 'spotify' ? streamList.listId : null
  const shownYouTubeMusicList =
    youtubeMusicShown && streamList?.service === 'youtube-music'
      ? streamList.listId
      : null
```

8. In `viewKey`, directly under

```tsx
      : shownSpotifyList !== null
      ? `spotify-${shownSpotifyList}`
```

add

```tsx
      : shownYouTubeMusicList !== null
      ? `youtube-music-${shownYouTubeMusicList}`
```

9. In `activeView`, directly under

```tsx
      : shownSpotifyList !== null
      ? 'spotify'
```

add

```tsx
      : shownYouTubeMusicList !== null
      ? 'youtube-music'
```

10. In `onNavigateSets`, replace

```tsx
        const setsShowing =
          showSets && djPage === null && shownSpotifyList === null
```

with

```tsx
        const setsShowing =
          showSets &&
          djPage === null &&
          shownSpotifyList === null &&
          shownYouTubeMusicList === null
```

11. In the `<Sidebar …>` props, directly under the `spotify={…}` prop (it ends `: undefined\n      }`), add:

```tsx
      youtubeMusic={
        youtubeMusicShown
          ? {
              lists: youtubeMusic.library.lists,
              counts: youtubeMusicMatches.counts,
              newTotal: youtubeMusicMatches.newCounts.total,
              newByList: youtubeMusicMatches.newCounts.byList,
              activeListId: shownYouTubeMusicList,
              onOpenList: openYouTubeMusicList,
              onAddPlaylist: youtubeMusic.addPlaylist,
              onRemovePlaylist: (listId) =>
                youtubeMusic.removePlaylist(listId).then(() => {
                  // The open list was removed: back to the default view.
                  if (shownYouTubeMusicList === listId) setStreamList(null)
                }),
            }
          : undefined
      }
```

12. In the main view, directly under the `SpotifyView` branch

```tsx
            ) : shownSpotifyList !== null ? (
              <SpotifyView
                listId={shownSpotifyList}
                spotify={spotify}
                onPlayTrack={handlePlayTrack}
              />
```

add

```tsx
            ) : shownYouTubeMusicList !== null ? (
              <YouTubeMusicView
                listId={shownYouTubeMusicList}
                youtubeMusic={youtubeMusic}
                matches={youtubeMusicMatches}
                library={spotify}
                onPlayTrack={handlePlayTrack}
                onOpenSet={(videoId) =>
                  openSets({ openVideoId: videoId, initialQuery: '' })
                }
              />
```

Run: `grep -n "spotifyListId\|setSpotifyListId" src/App.tsx`
Expected: nothing.

- [ ] **Step 10: Check**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/lib/sidebarPrefs.ts src/components/layout src/components/youtube-music src/App.tsx`
Expected: no type errors; 364 tests pass; eslint shows only `App.tsx`'s 2 old warnings (the unused directive and `initializeApp`).

By hand: nothing to see yet without an account (the section is hidden until connected). Task 21 checks it.

- [ ] **Step 11: Commit**

```bash
git add src/lib/sidebarPrefs.ts src/lib/sidebarPrefs.test.ts src/components/layout/sidebarTypes.ts src/components/youtube-music/YouTubeMusicLists.tsx src/components/layout/Sidebar.tsx src/components/layout/SidebarRail.tsx src/components/layout/Sidebar.css src/App.tsx
git commit -m "feat(youtube-music): YOUTUBE MUSIC in the sidebar and the rail, with Add playlist and Remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Settings → YouTube Music

**Files:**
- Create: `src/components/settings/YouTubeMusicSection.tsx`
- Modify: `src/components/views/SettingsView.tsx`

Next to Settings → Spotify, in the spec's order: the steps; **Choose client file…**; **Connect** / **Disconnect** with the signed-in email; **Show in sidebar**; the last sync. The steps tell the user to press **Publish app**, so the refresh token does not expire after 7 days, and what Google's "hasn't verified this app" screen asks.

- [ ] **Step 1: The section**

```tsx
// src/components/settings/YouTubeMusicSection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { ToggleSwitch } from './ToggleSwitch'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage, isAppError } from '../../types/ai'
import { YTM_SYNCED_EVENT, type YtmStatus } from '../../types/youtubeMusic'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }

type Busy = 'file' | 'connect' | 'disconnect'

export function YouTubeMusicSection() {
  const [status, setStatus] = useState<YtmStatus | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Each action; only the newest one's end clears `busy`. */
  const runSeq = useRef(0)

  useEffect(() => {
    let live = true
    const load = () => {
      tauriApi
        .getYouTubeMusicStatus()
        .then((next) => {
          if (live) setStatus(next)
        })
        .catch(() => {})
    }
    load()
    const stop = listen(YTM_SYNCED_EVENT, load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  const run = (kind: Busy, action: () => Promise<YtmStatus>) => {
    const seq = ++runSeq.current
    setBusy(kind)
    setError(null)
    action()
      .then(setStatus)
      .catch((e: unknown) => {
        // A newer Connect, a new client file or Disconnect cancelled this login on purpose.
        if (isAppError(e) && e.kind === 'YouTubeMusicLoginCancelled') return
        setError(getErrorMessage(e))
      })
      .finally(() => {
        if (seq === runSeq.current) setBusy(null)
      })
  }

  // While a login waits in the browser the button stays live: a closed tab
  // would otherwise hold it for the five-minute timeout. Clicking again
  // starts a fresh login, and Rust cancels the old one.
  const waiting = busy === 'connect'
  const connect = () => run('connect', () => tauriApi.connectYouTubeMusic())

  const chooseFile = () =>
    run('file', async () => {
      const path = await tauriApi.chooseYouTubeMusicClientFile()
      return path
        ? tauriApi.setYouTubeMusicClientFile(path)
        : tauriApi.getYouTubeMusicStatus()
    })

  const disconnect = () => {
    void confirm(
      'Disconnect YouTube Music? Its tracks and Yes/No answers will be removed from RecoDeck. The playlists you added stay, and are read again when you connect.',
      {
        title: 'Disconnect YouTube Music',
        kind: 'warning',
        okLabel: 'Disconnect',
        cancelLabel: 'Cancel',
      },
    )
      .then((yes) => {
        if (yes) run('disconnect', () => tauriApi.disconnectYouTubeMusic())
      })
      .catch(() => {})
  }

  const setShown = (show: boolean) => {
    setError(null)
    tauriApi
      .setYouTubeMusicShowInSidebar(show)
      .then(setStatus)
      .catch((e: unknown) => setError(getErrorMessage(e)))
  }

  return (
    <>
      <p className="settings-description">
        Shows which of your YouTube Music likes and playlists are already in
        your library, and makes the missing ones one click from the store.
        RecoDeck only reads from YouTube — it never likes or edits anything.
      </p>

      <div className="sv-subsection">
        <label className="sv-setting-row__label">
          Create your Google sign-in (once)
        </label>
        <ol
          className="settings-hint"
          style={{ marginTop: '0.5rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}
        >
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com/auth/overview"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Google Auth Platform
            </a>{' '}
            in the Google Cloud project that holds your YouTube API key
            (Settings → YouTube Tracklists), and press <strong>Get started</strong>:
            any app name, your email, audience <strong>External</strong>.
          </li>
          <li>
            Under <strong>Audience → Test users</strong>, add the Google account
            you use YouTube Music with.
          </li>
          <li>
            Still under <strong>Audience</strong>, press{' '}
            <strong>Publish app</strong>. While the app is in Testing, Google
            signs you out every 7 days. Signing in, Google then says it
            hasn&apos;t verified the app: choose <strong>Advanced</strong>, then{' '}
            <strong>Go to … (unsafe)</strong> and <strong>Continue</strong> — it
            is your own app.
          </li>
          <li>
            Under <strong>Clients</strong>, press <strong>Create client</strong>,
            choose <strong>Desktop app</strong>, create it, and download its
            JSON. No redirect URI is needed.
          </li>
          <li>
            Choose that file below. RecoDeck keeps its Client ID and secret, not
            the file.
          </li>
        </ol>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Client file</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={busy !== null && !waiting}
            onClick={chooseFile}
          >
            {busy === 'file' ? 'Reading…' : 'Choose client file…'}
          </button>
          <span className="settings-hint">
            {status?.hasClient ? 'A Desktop client is chosen.' : 'None chosen yet.'}
          </span>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          {status?.connected ? (
            <>
              <span>
                Connected as <strong>{status.email}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  disabled={busy !== null && !waiting}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Google… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary btn-small"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={!status?.hasClient || (busy !== null && !waiting)}
              title={status?.hasClient ? undefined : 'Choose the client file first'}
              onClick={connect}
            >
              {waiting ? 'Waiting for Google… (try again)' : 'Connect YouTube Music'}
            </button>
          )}
        </div>
        {error && (
          <p style={{ marginTop: '0.5rem', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}
      </div>

      <div className="sv-setting-row" style={{ marginTop: '1.25rem' }}>
        <div className="sv-setting-row__info">
          <span className="sv-setting-row__label">Show in sidebar</span>
          <span className="sv-setting-row__description">
            Off hides the YOUTUBE MUSIC section and pauses its sync. Your
            sign-in and lists stay.
          </span>
        </div>
        <ToggleSwitch
          checked={status?.showInSidebar ?? true}
          disabled={status === null}
          onChange={setShown}
        />
      </div>

      {status?.connected && (
        <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
          <label className="sv-setting-row__label">Last sync</label>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {status.lastError
              ? `Failed: ${status.lastError}`
              : status.lastSyncedAt
                ? `Synced ${new Date(status.lastSyncedAt).toLocaleString()} — every 30 minutes while RecoDeck is open. It uses the same daily quota as YouTube Tracklists.`
                : 'The first sync is running…'}
          </p>
          {status.quotaUsedUp && (
            <p className="settings-hint">
              YouTube quota used up · resumes after midnight Pacific
            </p>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Register it**

In `src/components/views/SettingsView.tsx`:
- under `import { SpotifySection } from '../settings/SpotifySection'` add `import { YouTubeMusicSection } from '../settings/YouTubeMusicSection'`;
- directly under the Spotify `<CollapsibleSection …>…</CollapsibleSection>` add:

```tsx
        <CollapsibleSection
          id="youtube-music"
          title="YouTube Music"
          summary="Your liked music and playlists, checked against your library"
        >
          <YouTubeMusicSection />
        </CollapsibleSection>
```

- [ ] **Step 3: Check**

Run: `npx tsc --noEmit -p . && npx eslint src/components/settings/YouTubeMusicSection.tsx && npx vitest run`
Expected: no type errors; no eslint output; 364 tests pass. (`SettingsView.tsx`'s old `no-empty-object-type` error is unchanged.)

By hand (`npm run tauri dev`): Settings → YouTube Music shows the five steps. **Choose client file…** on a random JSON says "This is not a Google OAuth client file …"; on a Web client's JSON it says to create a Desktop app. **Connect YouTube Music** stays disabled until a Desktop client file is chosen. The switch flips and stays flipped after leaving Settings and coming back.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/YouTubeMusicSection.tsx src/components/views/SettingsView.tsx
git commit -m "feat(youtube-music): Settings → YouTube Music — the steps, the client file, Connect, Show in sidebar, last sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Open in Sets fetches a set that is not stored

**Files:**
- Modify: `src/components/views/SetsView.tsx` (the `openVideoId` effect, ~line 520, and one import)

`SetsStart.openVideoId` today opens only a stored set (`getYouTubeSet`) and swallows every failure. A liked DJ set is usually not stored. Now: not stored (`NotFound`) → fetch it as a pasted link would (`fetchYouTubeSet`, with the API key, as Sets always does), show it, store it, refresh the Library and the quota line. Without a key, or on any other failure, the usual error shows in the Set tab, exactly as for a pasted link. The silent `.catch(() => {})` is gone from this path.

There is no component test harness here (see Rules); the behaviour is checked by hand in Task 21.

- [ ] **Step 1: The import**

Change `import { getErrorMessage } from '../../types/ai'` to:

```tsx
import { getErrorMessage, isAppError } from '../../types/ai'
```

- [ ] **Step 2: The effect**

Replace the whole effect that starts with the comment `// Arriving on a set: shown as opening it from the Library shows it.` (through its closing `}, [openVideoId])`) with:

```tsx
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
```

(`analyse`, `storeParsedSet`, `RawSet`, `refreshLibrary` and `refreshQuota` are already in scope; the last two are stable `useCallback`s declared above the effect.)

- [ ] **Step 3: Check**

Run: `npx tsc --noEmit -p . && npx eslint src/components/views/SetsView.tsx && npx vitest run`
Expected: no type errors; no eslint output for `SetsView.tsx`; 364 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/views/SetsView.tsx
git commit -m "feat(sets): Open in Sets fetches a set that is not stored, and says why when it cannot

Back from a DJ page to a set deleted meanwhile now fetches it again too,
spending the usual 5-7 units, instead of leaving the Set tab empty.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 21: Verify — the full checks, and by hand on the real account

**Files:** none, apart from fix-ups if something fails.

- [ ] **Step 1: The full automated checks**

```bash
npx vitest run
npx tsc --noEmit -p .
npx eslint src
cd src-tauri && cargo test && cargo clippy --all-targets
```

Expected:
- vitest: 30 files, 364 tests pass — the 317 of the base, plus `youtube-music/title` (28), `youtube-music/rows` (10), `youtube-music/newness` (2), and the new ones in `spotify/ownership` (5), `spotify/rows` (1) and `sidebarPrefs` (1).
- tsc: no errors.
- eslint: the same 10 errors and 12 warnings as the base, all in files listed under "Rules". Nothing in `src/lib/youtube-music`, `src/components/youtube-music`, `StreamingListView`, `SpotifyView`, `YouTubeMusicView`, `YouTubeMusicSection`, `SpotifySection`, the layout files, `useYouTubeMusic` or `SetsView`.
- cargo test: `ok. 415 passed` — the base's 345, plus `commands::spotify` (3), `external::spotify_auth` (3), `db::youtube_music` (18), `external::youtube_music` (18), `external::youtube_auth` (12) and `commands::youtube_music` (16).
- clippy: no warning that points at a `youtube_music`, `youtube_auth` or `spotify` file.

Run: `git status --short`
Expected: only the user's own pre-existing changes (`.claude/…`, `.planning/…`, `src-tauri/Cargo.lock`, `.mcp.json`, the untracked docs). Nothing from this plan uncommitted. `git diff src-tauri/Cargo.lock | grep '^[+-]name'` prints nothing new; `Cargo.toml` and `package.json` are unchanged.

- [ ] **Step 2: By hand, on the real account (needs the user)**

Launch with `npm run tauri dev`. The Desktop client JSON from the spike (same Google Cloud project as the YouTube API key) can be reused. `DB="$HOME/Library/Application Support/com.nemanjamarjanovic.recodeck/recodeck.db"` for the `sqlite3` steps; quit the app before writing to it.

1. **Connect.** Settings → YouTube Music: the five steps show. Press **Publish app** in Google Auth Platform first (step 3) and note today's date for Step 3 below. **Choose client file…** → the Desktop JSON → "A Desktop client is chosen." → **Connect YouTube Music**:
   - the browser opens Google's sign-in on `http://127.0.0.1:<some port>/callback`, shows "Google hasn't verified this app" (Advanced → Continue), asks for YouTube read-only access;
   - the tab says it can be closed;
   - Settings shows "Connected as <email>", and "The first sync is running…" turns into "Synced <time>".
2. **First sync.**
   - YOUTUBE MUSIC appears below SPOTIFY: All playlists, Liked music (about 60 — the count leaves sets out), + Add playlist. No number on the header: the first sync is the baseline.
   - Settings → YouTube Tracklists: the quota line went up by a few units (pages of 50, plus one `videos` call per 50 new videos).
3. **Liked music view.**
   - red cover with a heart, `YOUTUBE MUSIC PLAYLIST`, `N tracks · … owned · … missing · … maybe`, Added dates;
   - "Nina Kraviz - Tarde (Monthy Nolan Edit)" reads Title `Tarde (Monthy Nolan Edit)`, Artist `Nina Kraviz`; "Honey Hunter" reads Artist `Extrawelt`;
   - under the table, **Sets (n)** lists the DJ sets — "Dan Ghenacia | Live Vinyl DJ Set | …" with its length — and none of them is in the table or the counts;
   - the footer reads `N of N · sorted by date added, newest first`, plus `· k unavailable` when Liked music holds deleted or private videos (compare with the greyed-out items in the YouTube Music app).
4. **Ownership spot-check:** ten Owned rows really are in the library; ten Missing really are not; the Maybe sub-rows name plausible files (a bare title reads `same title, artist unknown`).
5. **Row actions:**
   - **Play** (red glyph) opens `music.youtube.com/watch?v=<id>` in the browser, on that exact video;
   - **↗** opens SelectedRecs' search for `Artist - Title` without the mix; **Copy** puts `Artist - Title (Mix)` on the clipboard and shows ✓ for about 1.5 s;
   - **double-click** an Owned row: the library file plays in RecoDeck;
   - **Yes** on a Maybe turns it Owned and it stays so after a restart; **No** on another turns it Missing.
6. **Add a playlist by link:**
   - a public playlist's `music.youtube.com/playlist?list=…` link → it appears last in the section with its count, at once; no dots in it (its baseline);
   - the user's own **private** playlist link → works the same;
   - someone else's private playlist, or a made-up id → one line under the field, `Not found — private playlists work only from the account that owns them`; nothing is added;
   - the Liked music link (`…?list=LM`) → `Liked music is already in the sidebar`; a `?list=LL` link → the Liked videos line.
7. **Like a track on the phone:** within 30 minutes (or at once via the header's "synced …") the YOUTUBE MUSIC header and Liked music show **1**, and the row has a dot; opening Liked music clears the number. Liking a track already in the library raises nothing. Liking a set adds it under Sets, with no number.
8. **Open in Sets** on a liked set that was never fetched: Sets opens on the Set tab, the button reads "Reading...", then the tracklist shows; the Library tab now lists the set; the quota line went up by 5–7. Open in Sets on it again: it opens from storage, no units. With the API key deleted in Settings → YouTube Tracklists, Open in Sets on another unstored set shows `No YouTube API key configured -- add your own key in Settings` in the Set tab. Put the key back.
   - **Back to a set deleted meanwhile** (a behaviour change, see "Where the spec and the code disagree", 8): open a stored set in Sets and open a DJ page from it. With the page still open, delete the set from a terminal — `sqlite3 "$DB" "PRAGMA foreign_keys = ON; DELETE FROM yt_sets WHERE video_id = '<its id>'"` — then press Back. The set is fetched again ("Reading...", then the tracklist, and the quota line 5–7 units higher) where it used to leave the Set tab empty.
9. **Remove:** right-click an added playlist → **Remove**: it leaves the sidebar; its tracks in no other list leave All playlists. Right-click Liked music: no menu. Add the playlist back: Yes/No answers given before are remembered.
10. **The two switches:**
    - Settings → Spotify → **Show in sidebar** off: the SPOTIFY section and its rail icon (`⌘\`) go. A DJ page still shows Spotify tracks; Search still lists Spotify DJs. After 10+ minutes, Settings → Spotify's "Synced …" time has not moved. On again: the section is back at once, with its lists, and a sync runs.
    - Settings → YouTube Music → **Show in sidebar** off: the section and its rail icon go, so no YouTube Music list can be opened. After 30+ minutes the "Synced …" time has not moved. On again: back at once, with its lists, and a sync runs.
11. **Spotify unchanged:** the Spotify view (now on `StreamingListView`) looks and acts as before: dots, chips, search, Maybe sub-rows, Yes/No, Copy, play, Reconnect bar wording.
12. **A playlist that disappeared:** add a throwaway playlist of your own by link, delete it on YouTube, then click "synced …": the sidebar item reads `no longer available`, the view's meta line `· no longer available`, and its rows stay. Remove it to clear it.
13. **Reconnect:** revoke RecoDeck's access at myaccount.google.com/permissions, then click "synced …": the bar `YouTube Music needs you to sign in again` with **Reconnect YouTube Music**; the rows stay visible. Reconnect → sign in → the bar goes.
14. **Quota used up** (seeded — waiting for a real one would take 10,000 units): quit, then

```bash
sqlite3 "$DB" "INSERT OR REPLACE INTO settings (key, value) VALUES ('youtube_music_quota_day', '$(TZ=America/Los_Angeles date +%F)')"
```

    launch: the meta line reads `YouTube quota used up · resumes after midnight Pacific`, Settings says the same, and the loop does not sync (the "Synced …" time stays). Quit and clear it: `sqlite3 "$DB" "DELETE FROM settings WHERE key = 'youtube_music_quota_day'"`.
15. **Offline:** Wi-Fi off → "synced …" → `last synced X ago · couldn't reach YouTube`; Wi-Fi on → the next sync clears it.
16. **Disconnect:** the section and the rail icon go, and an open YouTube Music view closes. `sqlite3 "$DB" "SELECT COUNT(*) FROM ytm_tracks"` prints `0`; `sqlite3 "$DB" "SELECT id, name FROM ytm_lists"` still lists `LM` and the added playlists. **Connect** again — no new file needed — and every list reads as a first sync: counts back, no dots.

- [ ] **Step 3: The spec's open items**

- **Refresh-token lifetime after Publish app.** Eight or more days after the Connect in Step 2.1 (made after pressing Publish app), launch RecoDeck without touching Settings. Expected: the sync runs and no Reconnect bar shows. If the bar shows, check Google Auth Platform → Audience: the app must say *In production*, not *Testing*. Write the outcome under "Open items" in the spec.
- **Order of `LM`.** Compare the first rows' Added dates with the order YouTube Music shows Liked music. The design reads `added_at` per item and does not rely on the order; just record what was seen in the spec.

- [ ] **Step 4: Commit any fix-ups**

Add only the files you changed, by name. Never `-A`.

```bash
git add <the files you fixed>
git commit -m "fix(youtube-music): <what the check found>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Skip this step if nothing needed fixing.
