# Interactions I1: Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One way the app answers. `toast()` replaces App's `Notification` and the sidebar's own toast; the update prompt is restyled with the shared buttons; removing a heart has an Undo that puts it back in its place; a menu item that cannot be undone asks in the menu's place instead of a native dialog (the set page's Remove from library first).

**Architecture:**
- **Rust** (`db/mod.rs`, `commands/youtube.rs`): `save_yt_track` writes a given `saved_at` (`COALESCE(?7, datetime('now'))`), and `save_youtube_track` passes it on instead of dropping it. A track hearted already keeps its time (the conflict branch leaves `saved_at` alone). Saved tracks hearted in the same second list the newer row first (`ORDER BY s.saved_at DESC, s.id DESC`).
- **Menu** (`src/components/menu/Menu.tsx`): `MenuAction.confirm?: { message, label }`. Choosing such an item swaps the panel for `MenuConfirm` at the same place — the question, Cancel (focused) and the answer as `.btn--danger` (new in `src/styles/controls.css`). The panel placement moves into one `place()` used by both.
- **Pure TypeScript** (tested): `removeQuestion(title)` in `src/lib/sets/setPage.ts`, the one wording for removing a set (the menu's question and the dialog's).
- **App** (`src/App.tsx`): every `setNotification({ message, type })` becomes `toast(message, { kind })` (success is the default kind); Settings' `onNotification` calls `toast`; the error text in toasts comes from `getErrorMessage` (App's `errorText` printed an AppError as "[object Object]"). `Notification`, `HeaderNotification` and the sidebar's toast go.
- **Sets** (`src/components/views/SetsView.tsx`): `unheart(track)` — delete, read the list again, then a toast with Undo that saves the same row back with its `saved_at` — used by the Saved tracks tab and the set page's ♥; a second press on the same heart before the list is read again is dropped.

**Tech Stack:** Rust (rusqlite), React 19, TypeScript, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-interactions-design.md` — "Feedback: toasts", "Menus" (the confirm in the menu's place), the Undo table's heart row, "What this plan builds". The spec's own order puts this plan after the page redesigns; the track table, Home and Sets plans built the toasts, `Menu`, `useOverlay` and the drag layer already.

**Branch:** `feat/redesign`. No release: the whole redesign ships as one release at the end.

**Decisions, beyond the spec's letter** (Task 7 writes them into the spec):
- **The rest of the spec is split** into three plans, so each stays reviewable: **I1** (this one, feedback), **I2** (menus and keys: the sidebar's right-click menus on `Menu` with Delete playlist / Delete folder asking in its place, `useShortcuts` with its sheet and "whichever played last", `Skeleton`), **I3** (the sweep: every `transition:` on the tokens, `.btn--icon` / `.btn--pill`, the `Button` component with its working state, Settings / the DJ pages / the modals on the shared controls).
- **`UpdateToast` stays apart** from the toasts — top right, until answered — because it waits for an answer and must not be pushed out by a fourth toast. It takes a toast's card (radius, border, shadow) and the shared `.btn` / `.btn--primary`.
- **The sidebar's "Added to …"** (when the player's ⋯ adds the playing track to a playlist) becomes a success toast; "already in" stays a warning toast.
- **A heart's Undo** writes the same row back (`save_youtube_track` with its old `saved_at`), so Saved tracks shows it where it was. The toast names the track: `Removed "De La Bass" from Saved tracks`. Saving a heart still has no toast (it shows on the row at once), but a save that fails now says so instead of nothing.
- **The menu's question** keeps Cancel focused, so Enter right after choosing cancels; the answer is a red `.btn--danger`. Tab moves between the two by hand (WebKit's Tab skips buttons unless macOS's keyboard navigation is on, and leaving them would leave the menu open). It is an `alertdialog` named by its question. Esc and a press outside cancel as they close the menu. Only the menu asks in place: the Remove button on a set's error page has no menu, so it still asks with the dialog (same wording, `removeQuestion`). Delete from playlist stays red without a question — it has an Undo.
- **Error toasts** use `getErrorMessage`; `setError(...)` lines (the old error banner) are left as they are.

**Checked:** every code block below was applied to a scratch copy of `feat/redesign` at `25b04d8`; the same blocks, applied to a clean `git archive`, reproduce it file for file, and `tsc`, each task's tests and `cargo test` pass at every task's end.
- **Builds and tests:**
  - `cargo test --lib`: 1 new (462); `cargo build` shows no warning.
  - `vitest`: 1 new. The repo counts 650 after it: 649 passed and 1 failed — `aiStore.test.ts` "clearHistory resets chat state" fails on the repo already (Node 25's built-in `localStorage`), not touched here. (A clean `git archive` copy lacks `tracklist.test.ts`'s fixtures: 8 of its tests are skipped and 6 not collected there.)
  - `tsc` passes; `npx eslint src mobile` shows 28 problems, the baseline, none new; `vite build` passes.
- **In WebKit** (the Sets test page of S4, with saved tracks that have a `saved_at`, a save mock that keeps a given one and sorts newest first, and the update prompt), in the dark Midnight and the light Dawn themes:
  - the set page's ⋯ › Remove from library: the menu turns into `Remove "Marco Carola b2b Luciano — KEEZY 2022 Opening" from your library? Its saved tracks go with it.` with Cancel (focused) and a red Remove, in the menu's place; Esc closes it, nothing deleted; from the keys (↑, Enter) it asks too, and Enter then cancels; Remove deletes the set (no dialog asked), "Removed from your library", back on the library;
  - a set that cannot be read: its Remove button asks with the dialog, then deletes;
  - the question is an `alertdialog`, `aria-modal`, named by its text; Tab from Cancel: Remove, Cancel, Remove (Shift+Tab back), the menu still asking;
  - Saved tracks: ♥ on De La Bass — the row goes, `Removed "De La Bass" from Saved tracks` with Undo; Undo saves it with `2026-10-05 10:00:00` and it is first again, above Babe; two presses on a slow removal: one delete, one toast;
  - the set page's ♥ on a hearted track: off, the same toast; Undo: hearted again, with its time;
  - the update prompt: top right, "Update v0.5.0 available · Later · Install", Later on a tinted button that shows on Dawn's white card; both answer;
  - S4's and S3's scenarios still pass on this copy.

**Reviewed:** an independent review of the first version (committed as `11db9b6`) found no blocker; its points are folded in above and checked:
- **The question's name and Tab**: it was named "Remove" and Tab could leave it with the menu open → named by its question (`aria-labelledby`), `aria-modal`, Tab cycles Cancel / Remove.
- **A double press on ♥** before the list read again found the stale row twice: a second "Removed" toast with a second Undo → `unheart` drops a press while the same heart is being removed, until the list is read again.
- **Saved tracks in the same second** had no order between them → `s.id DESC` breaks the tie (an Undone heart is the newer row).
- **Saving a heart** swallowed its error → an error toast, as removing one has.
- Left as is: Undo after the heart's set was removed fails on the foreign key and says "Couldn't undo: …", which is honest.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/youtube.rs` | modify | a given `saved_at` is kept; test |
| `src/styles/controls.css` | modify | `.btn--danger` |
| `src/components/menu/Menu.tsx`, `Menu.css` | modify | `confirm` on an action; `MenuConfirm`; `place()` |
| `src/lib/sets/setPage.ts` (+ test) | modify | `removeQuestion` |
| `src/components/sets/SetPage.tsx`, `src/components/views/SetsView.tsx` | modify | Remove from library asks in the menu; `unheart` with Undo |
| `src/components/UpdateToast.tsx`, `UpdateToast.css` | rewrite | the prompt on the shared buttons |
| `src/App.tsx` | modify | toasts for every notification; `getErrorMessage` |
| `src/components/layout/Sidebar.tsx`, `Sidebar.css` | modify | its toast goes |
| `src/components/Notification.*`, `src/components/HeaderNotification.*` | delete | replaced by `toast()` |
| `src/lib/tauri-api.ts` | modify | `saveYouTubeTrack`'s doc |
| `docs/superpowers/specs/2026-10-04-interactions-design.md` | modify | the decisions above |

---

### Task 0: Baseline

- [ ] **Step 1:** `git switch feat/redesign` (HEAD at or after `25b04d8`). `git status --short --untracked-files=no` should show only files this plan does not touch (`.claude/settings.local.json`, `.planning/STATE.md`, `package.json`, `package-lock.json`, `src/main.tsx` were modified before it); leave them, and never `git add -A`.
- [ ] **Step 2:** Run these:
  - `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 648 passed (649)` (the failure is `aiStore.test.ts`, see *Checked*);
  - `npx tsc --noEmit -p .`: no errors;
  - `npx eslint src mobile 2>&1 | grep problems`: `✖ 28 problems (9 errors, 19 warnings)`;
  - `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: `461 passed`.

---

### Task 1: A heart put back keeps its time

**Files:** Modify `src-tauri/src/commands/youtube.rs`, `src-tauri/src/db/mod.rs`.

- [ ] **Step 1: The failing test**

In `src-tauri/src/commands/youtube.rs`, replace

```rust

        db.delete_saved_yt_track("bk6Xst6euQk", 1_260_000, "Club Soda")
            .unwrap();
        assert!(db.list_saved_yt_tracks().unwrap().is_empty());
    }

    fn track(video_id: &str, position: i64, artist: Option<&str>, title: &str, unknown: bool) -> YtTrack {
        YtTrack {
            video_id: video_id.to_string(),
            position,
            cue_ms: position * 60_000,
            cue: Some(format!("{position}:00")),
```

with

```rust

        db.delete_saved_yt_track("bk6Xst6euQk", 1_260_000, "Club Soda")
            .unwrap();
        assert!(db.list_saved_yt_tracks().unwrap().is_empty());
    }

    #[test]
    fn a_heart_put_back_keeps_its_saved_at_and_its_place() {
        let db = test_db();
        let (set, raw) = sample_set();
        db.save_yt_set(&set, raw).unwrap();
        let heart = |title: &str, saved_at: Option<&str>| YtSavedTrack {
            id: None,
            video_id: "bk6Xst6euQk".to_string(),
            cue_ms: 1_260_000,
            cue: Some("21:00".to_string()),
            artist: None,
            title: title.to_string(),
            mix: None,
            saved_at: saved_at.map(str::to_string),
            set_title: None,
        };
        db.save_yt_track(&heart("Older", Some("2026-01-02 10:00:00"))).unwrap();
        db.save_yt_track(&heart("Newer", None)).unwrap();

        // Removed, then put back by its Undo with the time it had.
        db.delete_saved_yt_track("bk6Xst6euQk", 1_260_000, "Older").unwrap();
        db.save_yt_track(&heart("Older", Some("2026-01-02 10:00:00"))).unwrap();

        let saved = db.list_saved_yt_tracks().unwrap();
        let titles: Vec<&str> = saved.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles, ["Newer", "Older"]);
        assert_eq!(saved[1].saved_at.as_deref(), Some("2026-01-02 10:00:00"));

        // Hearted again while still hearted: its time stays.
        db.save_yt_track(&heart("Older", Some("2026-05-05 05:05:05"))).unwrap();
        let again = db.list_saved_yt_tracks().unwrap();
        assert_eq!(again[1].saved_at.as_deref(), Some("2026-01-02 10:00:00"));
    }

    fn track(video_id: &str, position: i64, artist: Option<&str>, title: &str, unknown: bool) -> YtTrack {
        YtTrack {
            video_id: video_id.to_string(),
            position,
            cue_ms: position * 60_000,
            cue: Some(format!("{position}:00")),
```

Run `cd src-tauri && cargo test --lib a_heart_put_back`: FAIL — the put-back "Older" gets now's time, so `saved[1].saved_at` is not `2026-01-02 10:00:00`.

- [ ] **Step 2: Keep a given `saved_at`**

In `src-tauri/src/db/mod.rs`, replace

```rust
            .execute("DELETE FROM yt_sets WHERE video_id = ?", [video_id])?;
        Ok(())
    }

    // --- saved tracks -------------------------------------------------

    pub fn save_yt_track(&self, track: &YtSavedTrack) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO yt_saved_tracks (video_id, cue_ms, cue, artist, title, mix)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(video_id, cue_ms, title) DO UPDATE SET
                artist = excluded.artist,
                mix = excluded.mix",
            params![
                track.video_id,
                track.cue_ms,
                track.cue,
                track.artist,
                track.title,
                track.mix,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list_saved_yt_tracks(&self) -> Result<Vec<YtSavedTrack>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.video_id, s.cue_ms, s.cue, s.artist, s.title, s.mix, s.saved_at,
                    y.title AS set_title
             FROM yt_saved_tracks s
             LEFT JOIN yt_sets y ON y.video_id = s.video_id
             ORDER BY s.saved_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(YtSavedTrack {
                id: row.get(0)?,
                video_id: row.get(1)?,
                cue_ms: row.get(2)?,
```

with

```rust
            .execute("DELETE FROM yt_sets WHERE video_id = ?", [video_id])?;
        Ok(())
    }

    // --- saved tracks -------------------------------------------------

    /// Hearts a track: now, or at `saved_at` when given (a removed heart's
    /// Undo, so it keeps its place). A track hearted already keeps its time.
    pub fn save_yt_track(&self, track: &YtSavedTrack) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO yt_saved_tracks (video_id, cue_ms, cue, artist, title, mix, saved_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, datetime('now')))
             ON CONFLICT(video_id, cue_ms, title) DO UPDATE SET
                artist = excluded.artist,
                mix = excluded.mix",
            params![
                track.video_id,
                track.cue_ms,
                track.cue,
                track.artist,
                track.title,
                track.mix,
                track.saved_at,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list_saved_yt_tracks(&self) -> Result<Vec<YtSavedTrack>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.video_id, s.cue_ms, s.cue, s.artist, s.title, s.mix, s.saved_at,
                    y.title AS set_title
             FROM yt_saved_tracks s
             LEFT JOIN yt_sets y ON y.video_id = s.video_id
             ORDER BY s.saved_at DESC, s.id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(YtSavedTrack {
                id: row.get(0)?,
                video_id: row.get(1)?,
                cue_ms: row.get(2)?,
```

In `src-tauri/src/commands/youtube.rs`, replace

```rust
        video_id: track.video_id,
        cue_ms: track.cue_ms,
        cue: track.cue,
        artist: track.artist,
        title: track.title,
        mix: track.mix,
        saved_at: None,
        set_title: None,
    };

    with_db(&state, |db| {
        db.save_yt_track(&record)
            .map(|_| ())
```

with

```rust
        video_id: track.video_id,
        cue_ms: track.cue_ms,
        cue: track.cue,
        artist: track.artist,
        title: track.title,
        mix: track.mix,
        saved_at: track.saved_at,
        set_title: None,
    };

    with_db(&state, |db| {
        db.save_yt_track(&record)
            .map(|_| ())
```

- [ ] **Step 3:** `cd src-tauri && cargo test --lib`: PASS, 462; `cargo build` shows no warning. Commit:

```bash
git add src-tauri/src/commands/youtube.rs src-tauri/src/db/mod.rs
git commit -m "feat(sets): hearting a track keeps a given saved_at, for a removed heart's Undo"
```

---

### Task 2: A menu item that asks first, in the menu's place

**Files:** Modify `src/styles/controls.css`, `src/components/menu/Menu.tsx`, `src/components/menu/Menu.css`.

- [ ] **Step 1: The red answer**

In `src/styles/controls.css`, replace

```css
/* src/styles/controls.css */
/* Shared controls (Interactions spec). Every button has a 6px corner; hover
   is one step lighter, press scales to 0.97 one step darker, keyboard focus
   shows a 2px accent ring with a 2px gap, disabled is 40% opacity. Lighter
   mixes in --text-primary, not white, so it reads in the light themes. The
   Interactions plan adds .btn--icon, .btn--danger, .btn--pill and the
   Button component. */

/* Every button's corner, the page-specific ones too (they keep their own
   shape only where they are not buttons: a switch, a checkbox, a colour dot). */
button,
[role='button'],
[role='tab'] {
```

with

```css
/* src/styles/controls.css */
/* Shared controls (Interactions spec). Every button has a 6px corner; hover
   is one step lighter, press scales to 0.97 one step darker, keyboard focus
   shows a 2px accent ring with a 2px gap, disabled is 40% opacity. Lighter
   mixes in --text-primary, not white, so it reads in the light themes.
   .btn--danger is a menu's answer to "Remove …?"; the Interactions sweep
   adds .btn--icon, .btn--pill and the Button component. */

/* Every button's corner, the page-specific ones too (they keep their own
   shape only where they are not buttons: a switch, a checkbox, a colour dot). */
button,
[role='button'],
[role='tab'] {
```

In `src/styles/controls.css`, replace

```css
}

.btn--sm {
  height: 28px;
}

/* A button that reads as a link: Clear all, Reset */
.link-btn {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
```

with

```css
}

.btn--sm {
  height: 28px;
}

/* A destructive answer: Remove, Delete */
.btn--danger {
  background: var(--color-danger);
  color: #fff;
  font-weight: 600;
}

.btn--danger:hover {
  background: color-mix(in srgb, var(--color-danger), white 12%);
  color: #fff;
}

.btn--danger:active {
  background: color-mix(in srgb, var(--color-danger), black 15%);
}

/* A button that reads as a link: Clear all, Reset */
.link-btn {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
```

- [ ] **Step 2: `confirm` on an action, `MenuConfirm`, one `place()`**

In `src/components/menu/Menu.tsx`, replace

```tsx
// src/components/menu/Menu.tsx
// The app's one menu (Interactions spec, Menus): it opens at the pointer,
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red. The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
// A searchable submenu has a box at its top: typing narrows its items.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
```

with

```tsx
// src/components/menu/Menu.tsx
// The app's one menu (Interactions spec, Menus): it opens at the pointer,
// moved to stay on screen; a press outside, Esc or choosing an item closes
// it; ↑ ↓ move, → opens a submenu and ← closes it, Enter chooses. A submenu
// opens beside its item, on the left when the right has no room. Destructive
// items are red; one with no Undo asks first, in the menu's place (Cancel
// has the keys). The menu and each open submenu register with useOverlay, so
// Esc closes the innermost first. It opens with a fade, a 4px drop and a
// scale from 0.98, and closes at once (a choice should not wait for a fade).
// A searchable submenu has a box at its top: typing narrows its items.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
```

In `src/components/menu/Menu.tsx`, replace

```tsx
  /** Muted text at the right, e.g. the current genre. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** A check at the right: this is the current choice. */
  checked?: boolean
  onSelect: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
```

with

```tsx
  /** Muted text at the right, e.g. the current genre. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** A check at the right: this is the current choice. */
  checked?: boolean
  /** Ask first, in the menu's place: the question, and the answer's label ("Remove"). */
  confirm?: { message: string; label: string }
  onSelect: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
```

In `src/components/menu/Menu.tsx`, replace

```tsx
  label: string
  onClose: () => void
}

export function Menu({ at, entries, label, onClose }: MenuProps) {
  useOverlay(true, onClose)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('.menu')) onClose()
    }
```

with

```tsx
  label: string
  onClose: () => void
}

export function Menu({ at, entries, label, onClose }: MenuProps) {
  useOverlay(true, onClose)
  const [asking, setAsking] = useState<MenuAction | null>(null)

  // A press outside every open menu panel closes the menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('.menu')) onClose()
    }
```

In `src/components/menu/Menu.tsx`, replace

```tsx
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    <MenuPanel
      entries={entries}
      x={at.x}
      y={at.y}
      label={label}
      takeFocus
      onChoose={(action) => {
        onClose()
        action.onSelect()
      }}
    />,
    document.body,
  )
}

interface MenuPanelProps {
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
```

with

```tsx
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    asking?.confirm ? (
      <MenuConfirm
        x={at.x}
        y={at.y}
        question={asking.confirm.message}
        answer={asking.confirm.label}
        onCancel={onClose}
        onConfirm={() => {
          onClose()
          asking.onSelect()
        }}
      />
    ) : (
      <MenuPanel
        entries={entries}
        x={at.x}
        y={at.y}
        label={label}
        takeFocus
        onChoose={(action) => {
          if (action.confirm) {
            setAsking(action)
            return
          }
          onClose()
          action.onSelect()
        }}
      />
    ),
    document.body,
  )
}

/**
 * Puts a panel at x, y inside the window: its right edge at `flipX` instead
 * when the right has no room. It shows once placed.
 */
function place(panel: HTMLElement, x: number, y: number, flipX?: number) {
  // offset sizes: the opening animation's scale does not count.
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  let left = x
  if (left + width > window.innerWidth - EDGE) left = (flipX ?? x) - width
  left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - width))
  const top = Math.max(EDGE, Math.min(y, window.innerHeight - EDGE - height))
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
  panel.style.visibility = 'visible'
}

// The question in the menu's place: Cancel, which has the keys, and the red
// answer; Tab moves between the two. Esc and a press outside cancel, as they
// close the menu.
function MenuConfirm({
  x,
  y,
  question,
  answer,
  onCancel,
  onConfirm,
}: {
  x: number
  y: number
  question: string
  answer: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const questionId = useId()

  useLayoutEffect(() => {
    if (panelRef.current) place(panelRef.current, x, y)
  }, [x, y])

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true })
  }, [])

  // Tab moves between the two answers, by hand: leaving them would leave the
  // menu open, and WebKit's Tab skips buttons unless the system says so.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const buttons = [...(panelRef.current?.querySelectorAll('button') ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={questionId}
      className="menu menu--confirm"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p id={questionId} className="menu__question">
        {question}
      </p>
      <div className="menu__answers">
        <button ref={cancelRef} type="button" className="btn btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--danger btn--sm" onClick={onConfirm}>
          {answer}
        </button>
      </div>
    </div>
  )
}

interface MenuPanelProps {
  entries: MenuEntry[]
  /** Its left edge, and where its right edge goes instead when the right has no room. */
  x: number
  flipX?: number
  y: number
```

In `src/components/menu/Menu.tsx`, replace

```tsx
    setOpen(null)
  }

  // Placed once its size is known, and again when its items come or change
  // (a list read as it opens): inside the window, flipped when needed.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // offset sizes: the opening animation's scale does not count.
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    let left = x
    if (left + width > window.innerWidth - EDGE) left = (flipX ?? x) - width
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - width))
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - EDGE - height))
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.visibility = 'visible'
  }, [x, flipX, y, labels])

  // A searchable list takes the keys at once, so typing narrows it.
  useEffect(() => {
    if (search) searchRef.current?.focus({ preventScroll: true })
    else if (takeFocus) panelRef.current?.focus({ preventScroll: true })
```

with

```tsx
    setOpen(null)
  }

  // Placed once its size is known, and again when its items come or change
  // (a list read as it opens): inside the window, flipped when needed.
  useLayoutEffect(() => {
    if (panelRef.current) place(panelRef.current, x, y, flipX)
  }, [x, flipX, y, labels])

  // A searchable list takes the keys at once, so typing narrows it.
  useEffect(() => {
    if (search) searchRef.current?.focus({ preventScroll: true })
    else if (takeFocus) panelRef.current?.focus({ preventScroll: true })
```

- [ ] **Step 3: Its styles**

In `src/components/menu/Menu.css`, replace

```css

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}
```

with

```css

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}

/* Ask first, in the menu's place: the question over Cancel and the answer. */
.menu--confirm {
  width: 260px;
  padding: 12px;
}

.menu__question {
  margin: 0 0 12px;
  font-size: var(--text-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.menu__answers {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Cancel on the panel's own colour would not show as a button. */
.menu__answers .btn:not(.btn--danger) {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 7%);
}

.menu__answers .btn:not(.btn--danger):hover {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 12%);
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors (no item asks yet). Commit:

```bash
git add src/styles/controls.css src/components/menu/Menu.tsx src/components/menu/Menu.css
git commit -m "feat(menu): an item with no Undo asks first, in the menu's place"
```

---

### Task 3: Remove from library asks in the menu

**Files:** Modify `src/lib/sets/setPage.ts`, `src/lib/sets/setPage.test.ts`, `src/components/sets/SetPage.tsx`, `src/components/views/SetsView.tsx`.

- [ ] **Step 1: The failing test**

In `src/lib/sets/setPage.test.ts`, replace

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
```

with

```ts
import { describe, expect, it } from 'vitest'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  removeQuestion,
  savedList,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  trackLine,
} from './setPage'
```

In `src/lib/sets/setPage.test.ts`, replace

```ts
    expect(savedList([{ artist: 'Tuccillo', title: 'Imagination Engine' }, { title: 'Bomba', mix: 'Dub' }])).toBe(
      'Tuccillo - Imagination Engine\nBomba (Dub)',
    )
  })
})

describe('labels', () => {
  it('builds the thumbnail address', () => {
    expect(thumbnailUrl('AvoifrdCfFM')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/hqdefault.jpg')
    expect(thumbnailUrl('AvoifrdCfFM', 'mqdefault')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/mqdefault.jpg')
  })
```

with

```ts
    expect(savedList([{ artist: 'Tuccillo', title: 'Imagination Engine' }, { title: 'Bomba', mix: 'Dub' }])).toBe(
      'Tuccillo - Imagination Engine\nBomba (Dub)',
    )
  })
})

describe('removing a set', () => {
  it('asks by its title, and says its hearts go too', () => {
    expect(removeQuestion('Luciano @ Cadenza')).toBe(
      'Remove "Luciano @ Cadenza" from your library? Its saved tracks go with it.',
    )
  })
})

describe('labels', () => {
  it('builds the thumbnail address', () => {
    expect(thumbnailUrl('AvoifrdCfFM')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/hqdefault.jpg')
    expect(thumbnailUrl('AvoifrdCfFM', 'mqdefault')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/mqdefault.jpg')
  })
```

Run `npx vitest run src/lib/sets/setPage.test.ts`: FAIL — `removeQuestion` is not exported.

- [ ] **Step 2: The question**

In `src/lib/sets/setPage.ts`, replace

```ts

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

with

```ts

/** Saved tracks as Copy list writes them: "Artist - Title (Mix)", one per line. */
export function savedList(saved: ReadonlyArray<{ artist?: string; title: string; mix?: string }>): string {
  return saved.map((t) => trackLine({ artist: t.artist ?? null, title: t.title, mix: t.mix ?? null })).join('\n')
}

/** What removing a set asks first: it has no Undo, and its hearts go with it. */
export function removeQuestion(title: string): string {
  return `Remove "${title}" from your library? Its saved tracks go with it.`
}

/** The missing tracks, one per line, for ⋯ › Copy missing tracks. */
export function missingTracks(tracks: readonly Track[], matches: MatchSummary | null): string[] {
  return filterRows(tracks, matches, 'missing').map(trackLine)
}

/** A YouTube thumbnail of the video: `hqdefault` for the hero, `mqdefault` for cards. */
```

- [ ] **Step 3: The menu asks; the error page's button still opens the dialog**

In `src/components/sets/SetPage.tsx`, replace

```tsx
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
```

with

```tsx
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  removeQuestion,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  type SetFilter,
} from '../../lib/sets/setPage'
import { watchUrl } from '../../lib/youtubeWindow'
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
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
```

with

```tsx
  onRetry: () => void
  onOpenDj?: (name: string) => void
  onPlayFile: (track: LibraryTrack) => void
  onToggleSave: (track: Track) => void
  onFollowEcho: (echo: TrackEcho) => void
  onLookAgain: () => void
  /** Asks first unless `asked` (the menu asked in its place); null when the set is not in the library. */
  onRemove: ((asked: boolean) => void) | null
}

const FILTERS: Array<{ key: SetFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'have', label: 'You own' },
  { key: 'missing', label: 'Missing' },
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
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
```

with

```tsx
            toast(`Copied ${missing.length} missing ${missing.length === 1 ? 'track' : 'tracks'}`)
          },
        },
        ...(onRemove
          ? ([
              { kind: 'separator' },
              {
                kind: 'action',
                label: 'Remove from library',
                icon: 'Trash2',
                danger: true,
                confirm: { message: removeQuestion(video.title), label: 'Remove' },
                onSelect: () => onRemove(true),
              },
            ] as MenuEntry[])
          : []),
      ]
    : []

  const djParts = video ? billingParts(extractDjName(video.title, video.channel)) : []
```

In `src/components/sets/SetPage.tsx`, replace

```tsx
            <div className="set-page__error-actions">
              <button type="button" className="btn" onClick={onRetry}>
                Try again
              </button>
              {/* A stored set that will not read can still leave the library. */}
              {onRemove && (
                <button type="button" className="btn" onClick={onRemove}>
                  Remove from library
                </button>
              )}
            </div>
          </div>
        ) : !ready || !result ? (
```

with

```tsx
            <div className="set-page__error-actions">
              <button type="button" className="btn" onClick={onRetry}>
                Try again
              </button>
              {/* A stored set that will not read can still leave the library. */}
              {onRemove && (
                <button type="button" className="btn" onClick={() => onRemove(false)}>
                  Remove from library
                </button>
              )}
            </div>
          </div>
        ) : !ready || !result ? (
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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

with

```tsx
import { channelNewsCount, useChannelNews } from '../../store/channelNewsStore'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { removeQuestion } from '../../lib/sets/setPage'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView, type SetsTab } from '../../store/setsViewStore'
import { dismissToast, toast } from '../../lib/toast'
import type {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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
```

with

```tsx
  /** Opens the set a search hit came from and jumps to the moment. */
  function openHit(hit: YtTrackHit) {
    void openSet(hit.video_id, { cueMs: hit.cue_ms, title: hit.set_title })
  }

  /**
   * Removes a set from the library, after asking: it has no Undo. The page's
   * menu asks in its place (`asked`); elsewhere a dialog asks. A set that is
   * playing stops first; its page, if open, goes back to the library.
   */
  async function removeSet(videoId: string, title: string, asked = false) {
    if (!asked) {
      const sure = await confirm(removeQuestion(title), {
        title: 'Remove from library',
        kind: 'warning',
      }).catch(() => false)
      if (!sure) return
    }
    if (useSetPlayer.getState().playing?.result.video.id === videoId) useSetPlayer.getState().stop()
    try {
      await tauriApi.deleteYouTubeSet(videoId)
    } catch (err) {
      toast(`Couldn't remove it: ${getErrorMessage(err)}`, { kind: 'error' })
      return
```

In `src/components/views/SetsView.tsx`, replace

```tsx
          onOpenDj={onOpenDj ? (name) => onOpenDj(name, currentSet?.video.id ?? null) : undefined}
          onPlayFile={playFromSet}
          onToggleSave={toggleSave}
          onFollowEcho={followEcho}
          onLookAgain={() => void reanalyse()}
          // A set in the library can be removed even when it cannot be read.
          onRemove={summary ? () => void removeSet(summary.video_id, summary.title) : null}
        />
      </div>
    )
  }

  return (
```

with

```tsx
          onOpenDj={onOpenDj ? (name) => onOpenDj(name, currentSet?.video.id ?? null) : undefined}
          onPlayFile={playFromSet}
          onToggleSave={toggleSave}
          onFollowEcho={followEcho}
          onLookAgain={() => void reanalyse()}
          // A set in the library can be removed even when it cannot be read.
          onRemove={summary ? (asked) => void removeSet(summary.video_id, summary.title, asked) : null}
        />
      </div>
    )
  }

  return (
```

- [ ] **Step 4:** `npx vitest run src/lib/sets`: PASS, 23; `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/lib/sets/setPage.ts src/lib/sets/setPage.test.ts src/components/sets/SetPage.tsx src/components/views/SetsView.tsx
git commit -m "feat(sets): Remove from library asks in the menu's place"
```

---

### Task 4: The update prompt on the shared buttons

**Files:** Rewrite `src/components/UpdateToast.tsx`, `src/components/UpdateToast.css`.

- [ ] **Step 1:**

Replace the whole of `src/components/UpdateToast.tsx` with:

```tsx
// src/components/UpdateToast.tsx
// The update prompt (Interactions spec, Feedback): it stays apart from the
// toasts, top right until answered, in their style with the shared buttons.
import { Icon } from './Icon'
import './UpdateToast.css'

interface UpdateToastProps {
  version: string
  onInstall: () => void
  onLater: () => void
}

export function UpdateToast({ version, onInstall, onLater }: UpdateToastProps) {
  return (
    <div className="update-toast" role="status">
      <Icon name="Download" size={16} className="update-toast__icon" />
      <span className="update-toast__message">Update v{version} available</span>
      <button type="button" className="btn btn--sm" onClick={onLater}>
        Later
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onInstall}>
        Install
      </button>
    </div>
  )
}
```

Replace the whole of `src/components/UpdateToast.css` with:

```css
/* src/components/UpdateToast.css */
/* The update prompt: top right, a toast's card, the shared buttons. */

.update-toast {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: 0 14px 34px rgb(0 0 0 / 0.5);
  color: var(--text-primary);
  font-size: 12.5px;
  animation: update-toast-in var(--motion-slow) var(--ease);
}

@keyframes update-toast-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .update-toast {
    animation-name: update-toast-fade-in;
    animation-duration: var(--motion-fast);
  }
}

@keyframes update-toast-fade-in {
  from {
    opacity: 0;
  }
}

.update-toast__icon {
  flex-shrink: 0;
  color: var(--accent);
}

.update-toast__message {
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Later on the card's own colour would not show as a button. */
.update-toast .btn:not(.btn--primary) {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 7%);
}

.update-toast .btn:not(.btn--primary):hover {
  background: color-mix(in srgb, var(--bg-elevated), var(--text-primary) 12%);
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors. Commit:

```bash
git add src/components/UpdateToast.tsx src/components/UpdateToast.css
git commit -m "feat(ui): the update prompt in a toast's card, with the shared buttons"
```

---

### Task 5: Toasts for everything

**Files:** Modify `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.css`; delete `src/components/Notification.tsx`, `Notification.css`, `HeaderNotification.tsx`, `HeaderNotification.css`.

- [ ] **Step 1: App** — every notification a toast, the error text from `getErrorMessage`, the old state and its render gone

In `src/App.tsx`, replace

```tsx
import { getChangesForVersion, type VersionChanges } from './lib/changelog'
import { importSet, setsToAutoImport } from './lib/tracklist/importSet'
import type { ChannelNews } from './types/youtube'
import { getErrorMessage } from './types/ai'
import type { TrackFilter } from './lib/trackTable/filter'
import appPackage from '../package.json'
import { Notification } from './components/Notification'
import { UpdateToast } from './components/UpdateToast'
import {
  AnalysisProgress,
  type AnalysisProgressData,
} from './components/AnalysisProgress'
// import { PlayerAIChat } from './components/ai/PlayerAIChat'
```

with

```tsx
import { getChangesForVersion, type VersionChanges } from './lib/changelog'
import { importSet, setsToAutoImport } from './lib/tracklist/importSet'
import type { ChannelNews } from './types/youtube'
import { getErrorMessage } from './types/ai'
import type { TrackFilter } from './lib/trackTable/filter'
import appPackage from '../package.json'
import { UpdateToast } from './components/UpdateToast'
import {
  AnalysisProgress,
  type AnalysisProgressData,
} from './components/AnalysisProgress'
// import { PlayerAIChat } from './components/ai/PlayerAIChat'
```

In `src/App.tsx`, replace

```tsx
  // Mix Prep panel state
  const [mixPrepPlaylist, setMixPrepPlaylist] = useState<{
    id: number
    name: string
  } | null>(null)

  // Notification state
  const [notification, setNotification] = useState<{
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
  } | null>(null)

  // Pending update from auto-check on launch
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

  // What's New dialog state
  const [whatsNew, setWhatsNew] = useState<{
    version: string
    changes: VersionChanges
  } | null>(null)

  // Header notification (small text next to logo, typing animation)
  const [headerNotification, setHeaderNotification] = useState<string | null>(
    null,
  )

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressData | null>(null)
  const analysisStartTimeRef = useRef<number>(0)

  // Scan progress state (global, survives Settings unmount)
```

with

```tsx
  // Mix Prep panel state
  const [mixPrepPlaylist, setMixPrepPlaylist] = useState<{
    id: number
    name: string
  } | null>(null)

  // Pending update from auto-check on launch
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

  // What's New dialog state
  const [whatsNew, setWhatsNew] = useState<{
    version: string
    changes: VersionChanges
  } | null>(null)

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressData | null>(null)
  const analysisStartTimeRef = useRef<number>(0)

  // Scan progress state (global, survives Settings unmount)
```

In `src/App.tsx`, replace

```tsx

        setTimeout(() => {
          setAnalysisProgress(null)
          setAnalyzing(false)

          if (e.cancelled) {
            setNotification({
              message: `Analysis cancelled. ${e.total_analyzed} of ${e.total_requested} tracks analyzed.`,
              type: 'warning',
            })
          } else if (e.total_analyzed > 0) {
            setNotification({
              message: `Analyzed ${e.total_analyzed} tracks${e.total_failed > 0 ? ` (${e.total_failed} failed)` : ''}`,
              type: 'success',
            })
          } else {
            setNotification({
              message: 'All tracks already have BPM and Key analysis',
              type: 'info',
            })
          }

          // Reload tracks and rebuild AI context (use ref to avoid stale closure)
          loadTracksRef.current()
          tauriApi.rebuildAIContext().catch(() => {})
          setDataVersion((version) => version + 1)
```

with

```tsx

        setTimeout(() => {
          setAnalysisProgress(null)
          setAnalyzing(false)

          if (e.cancelled) {
            toast(`Analysis cancelled. ${e.total_analyzed} of ${e.total_requested} tracks analyzed.`, {
              kind: 'warning',
            })
          } else if (e.total_analyzed > 0) {
            toast(
              `Analyzed ${e.total_analyzed} tracks${e.total_failed > 0 ? ` (${e.total_failed} failed)` : ''}`,
            )
          } else {
            toast('All tracks already have BPM and Key analysis', { kind: 'info' })
          }

          // Reload tracks and rebuild AI context (use ref to avoid stale closure)
          loadTracksRef.current()
          tauriApi.rebuildAIContext().catch(() => {})
          setDataVersion((version) => version + 1)
```

In `src/App.tsx`, replace

```tsx
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
      const wanted = found
```

with

```tsx
      // the library's New from DJs you watch.
      const where = found.every((item) => item.source === 'dj')
        ? 'Sets › Library'
        : found.every((item) => item.source !== 'dj')
          ? 'Sets › Following'
          : 'Sets'
      toast(`${total} new ${total === 1 ? 'set' : 'sets'} from ${who} — see ${where}`, {
        kind: 'info',
      })

      // Automatic import lives here rather than in the background task that
      // found these, because the parser is TypeScript: the backend can fetch a
      // set but has nothing to turn it into a tracklist.
      const wanted = found
```

In `src/App.tsx`, replace

```tsx
      if (imported > 0 || empty > 0) {
        const parts: string[] = []
        if (imported > 0) {
          parts.push(`${imported} ${imported === 1 ? 'set' : 'sets'} imported automatically`)
        }
        if (empty > 0) parts.push(`${empty} had no tracklist and were skipped`)
        setNotification({
          message: parts.join(' · '),
          type: imported > 0 ? 'success' : 'info',
        })
      }
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])
```

with

```tsx
      if (imported > 0 || empty > 0) {
        const parts: string[] = []
        if (imported > 0) {
          parts.push(`${imported} ${imported === 1 ? 'set' : 'sets'} imported automatically`)
        }
        if (empty > 0) parts.push(`${empty} had no tracklist and were skipped`)
        toast(parts.join(' · '), { kind: imported > 0 ? 'success' : 'info' })
      }
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])
```

In `src/App.tsx`, replace

```tsx
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        setNotification({
          message: 'No audio tracks found in this folder',
          type: 'info',
        })
        return
      }

      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
```

with

```tsx
  async function handleAnalyzeFolder(folderPath: string) {
    try {
      const folderTracks = await tauriApi.getTracksInFolder(folderPath)
      const trackIds = folderTracks.filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        toast('No audio tracks found in this folder', { kind: 'info' })
        return
      }

      // Show progress bar immediately with "preparing" state
      setAnalyzing(true)
      setError(null)
```

In `src/App.tsx`, replace

```tsx
        true,
      )
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Create playlist — open name modal (prompt() doesn't work in Tauri)
  function handleCreatePlaylist(parentId: number | null) {
    setPromptState({
```

with

```tsx
        true,
      )
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Create playlist — open name modal (prompt() doesn't work in Tauri)
  function handleCreatePlaylist(parentId: number | null) {
    setPromptState({
```

In `src/App.tsx`, replace

```tsx
        if (value === action.currentName) return
        await tauriApi.renamePlaylist(action.id, value)
        await loadPlaylists()
      } else if (action.kind === 'create-subfolder') {
        await tauriApi.createFolderOnDisk(action.parentPath, value)
        folderTreeRef.current?.refreshLibraryRoot(action.parentPath)
        setNotification({
          message: `Created folder "${value}"`,
          type: 'success',
        })
      } else if (action.kind === 'rename-folder') {
        if (value === action.currentName) return
        const newPath = await tauriApi.renameFolderOnDisk(
          action.folderPath,
          value,
        )
```

with

```tsx
        if (value === action.currentName) return
        await tauriApi.renamePlaylist(action.id, value)
        await loadPlaylists()
      } else if (action.kind === 'create-subfolder') {
        await tauriApi.createFolderOnDisk(action.parentPath, value)
        folderTreeRef.current?.refreshLibraryRoot(action.parentPath)
        toast(`Created folder "${value}"`)
      } else if (action.kind === 'rename-folder') {
        if (value === action.currentName) return
        const newPath = await tauriApi.renameFolderOnDisk(
          action.folderPath,
          value,
        )
```

In `src/App.tsx`, replace

```tsx
        setSelectedFolder(null)
        setTableFilter(null)
        await loadTracks(null, null)
      } else {
        await loadTracks()
      }
      setNotification({
        message: deleteFiles ? 'Folder and files deleted' : 'Folder removed',
        type: 'success',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Delete playlist/folder — use Tauri's confirm (native dialog)
```

with

```tsx
        setSelectedFolder(null)
        setTableFilter(null)
        await loadTracks(null, null)
      } else {
        await loadTracks()
      }
      toast(deleteFiles ? 'Folder and files deleted' : 'Folder removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Delete playlist/folder — use Tauri's confirm (native dialog)
```

In `src/App.tsx`, replace

```tsx

  // Share playlist — open modal with QR code if Companion is running
  async function handleSharePlaylist(playlistId: number, playlistName: string) {
    try {
      const status = await tauriApi.getCompanionStatus()
      if (!status.running || !status.url || !status.token) {
        setNotification({
          message: 'Enable Companion in Settings first',
          type: 'warning',
        })
        return
      }
      setSharePlaylistModal({
        open: true,
        playlistId,
        playlistName,
        companionUrl: status.url,
        companionToken: status.token,
      })
    } catch (err) {
      setNotification({
        message:
          err instanceof Error ? err.message : 'Failed to get Companion status',
        type: 'error',
      })
    }
  }

  // The track table's right-click menu acts on its selection at once: one
  // call, one toast — with Undo, which puts back exactly what it changed —
  // and one reload of the view.
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

  // An Undo: put it back, then reload the view shown by then.
  function undoing(putBack: () => Promise<unknown>) {
    return {
      label: 'Undo',
      run: () => {
        putBack()
          .then(() => loadTracksRef.current())
          .catch((err) => toast(`Couldn't undo: ${errorText(err)}`, { kind: 'error' }))
      },
    }
  }

  async function handleAddToPlaylist(selected: Track[], playlistId: number) {
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
```

with

```tsx

  // Share playlist — open modal with QR code if Companion is running
  async function handleSharePlaylist(playlistId: number, playlistName: string) {
    try {
      const status = await tauriApi.getCompanionStatus()
      if (!status.running || !status.url || !status.token) {
        toast('Enable Companion in Settings first', { kind: 'warning' })
        return
      }
      setSharePlaylistModal({
        open: true,
        playlistId,
        playlistName,
        companionUrl: status.url,
        companionToken: status.token,
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to get Companion status', {
        kind: 'error',
      })
    }
  }

  // The track table's right-click menu acts on its selection at once: one
  // call, one toast — with Undo, which puts back exactly what it changed —
  // and one reload of the view.

  // An Undo: put it back, then reload the view shown by then.
  function undoing(putBack: () => Promise<unknown>) {
    return {
      label: 'Undo',
      run: () => {
        putBack()
          .then(() => loadTracksRef.current())
          .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
      },
    }
  }

  async function handleAddToPlaylist(selected: Track[], playlistId: number) {
    const name = playlists.find((p) => p.id === playlistId)?.name ?? 'the playlist'
```

In `src/App.tsx`, replace

```tsx
        action: undoing(async () => {
          await tauriApi.removeTracksFromPlaylist(playlistId, added)
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't add to ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Delete from the playlist shown; Undo adds them back in their old places.
  async function handleRemoveFromPlaylist(selected: Track[]) {
    if (selectedPlaylistId == null) return
```

with

```tsx
        action: undoing(async () => {
          await tauriApi.removeTracksFromPlaylist(playlistId, added)
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't add to ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Delete from the playlist shown; Undo adds them back in their old places.
  async function handleRemoveFromPlaylist(selected: Track[]) {
    if (selectedPlaylistId == null) return
```

In `src/App.tsx`, replace

```tsx
            ...now.filter((id) => !old.has(id)),
          ])
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Dragged to another place in the playlist's own order: shown at once, then
  // stored; Undo puts the order before the drop back.
  async function handleReorderPlaylist(order: readonly number[]) {
```

with

```tsx
            ...now.filter((id) => !old.has(id)),
          ])
          await loadPlaylists()
        }),
      })
    } catch (err) {
      toast(`Couldn't remove from ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Dragged to another place in the playlist's own order: shown at once, then
  // stored; Undo puts the order before the drop back.
  async function handleReorderPlaylist(order: readonly number[]) {
```

In `src/App.tsx`, replace

```tsx
            ...now.filter((id) => !old.has(id)),
          ])
        }),
      })
    } catch (err) {
      await loadTracksRef.current()
      toast(`Couldn't reorder ${name}: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
```

with

```tsx
            ...now.filter((id) => !old.has(id)),
          ])
        }),
      })
    } catch (err) {
      await loadTracksRef.current()
      toast(`Couldn't reorder ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  async function handleSetGenre(selected: Track[], genre: string) {
    const before = genreSnapshot(selected)
    try {
```

In `src/App.tsx`, replace

```tsx
      await loadTracks()
      await loadGenreDefinitions() // in case it is a new genre
      toast(genreSetMessage(selected, genre), {
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't set the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }

  async function handleClearGenre(selected: Track[]) {
    const withGenre = selected.filter((t) => t.genre)
    const before = genreSnapshot(withGenre)
```

with

```tsx
      await loadTracks()
      await loadGenreDefinitions() // in case it is a new genre
      toast(genreSetMessage(selected, genre), {
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't set the genre: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  async function handleClearGenre(selected: Track[]) {
    const withGenre = selected.filter((t) => t.genre)
    const before = genreSnapshot(withGenre)
```

In `src/App.tsx`, replace

```tsx
      await loadTracks()
      toast(genreClearedMessage(withGenre), {
        kind: 'info',
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${errorText(err)}`, { kind: 'error' })
    }
  }

  // Move to folder (track table spec): the files move on disk. The track
  // playing — and during a crossfade the one coming in — stays where it is:
  // the player streams it from its path.
```

with

```tsx
      await loadTracks()
      toast(genreClearedMessage(withGenre), {
        kind: 'info',
        action: undoing(() => tauriApi.restoreTrackGenres(before)),
      })
    } catch (err) {
      toast(`Couldn't clear the genre: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Move to folder (track table spec): the files move on disk. The track
  // playing — and during a crossfade the one coming in — stays where it is:
  // the player streams it from its path.
```

In `src/App.tsx`, replace

```tsx
                    if (stayed.length > 0) {
                      toast(movedMessage(back.map((m) => byId.get(m.id)!), stayed, 'where they were'), {
                        kind: 'warning',
                        detail: skipDetail(stayed, titleOf),
                      })
                    }
                  })().catch((err) => toast(`Couldn't undo: ${errorText(err)}`, { kind: 'error' }))
                },
              },
      })
    } catch (err) {
      toast(`Couldn't move to ${name}: ${errorText(err)}`, { kind: 'error' })
    } finally {
      clearTimeout(slow)
      if (working !== null) dismissToast(working)
    }
  }
```

with

```tsx
                    if (stayed.length > 0) {
                      toast(movedMessage(back.map((m) => byId.get(m.id)!), stayed, 'where they were'), {
                        kind: 'warning',
                        detail: skipDetail(stayed, titleOf),
                      })
                    }
                  })().catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
                },
              },
      })
    } catch (err) {
      toast(`Couldn't move to ${name}: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      clearTimeout(slow)
      if (working !== null) dismissToast(working)
    }
  }
```

In `src/App.tsx`, replace

```tsx
      const trackIds =
        tracks.length > 0
          ? tracks.filter((t) => t.id).map((t) => t.id)
          : (await tauriApi.getAllTracks()).filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        setNotification({ message: 'No tracks in library', type: 'info' })
        return
      }

      await analyzeTrackIds(trackIds)
    } catch (err) {
      // Reading the library failed; analyzeTrackIds reports its own failures.
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Home's New sets: Mark all seen. Its Undo marks exactly the rows it
  // changed unseen again; Home reads again after each.
  async function handleMarkAllSetsSeen() {
```

with

```tsx
      const trackIds =
        tracks.length > 0
          ? tracks.filter((t) => t.id).map((t) => t.id)
          : (await tauriApi.getAllTracks()).filter((t) => t.id).map((t) => t.id)

      if (trackIds.length === 0) {
        toast('No tracks in library', { kind: 'info' })
        return
      }

      await analyzeTrackIds(trackIds)
    } catch (err) {
      // Reading the library failed; analyzeTrackIds reports its own failures.
      setError(err instanceof Error ? err.message : String(err))
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Home's New sets: Mark all seen. Its Undo marks exactly the rows it
  // changed unseen again; Home reads again after each.
  async function handleMarkAllSetsSeen() {
```

In `src/App.tsx`, replace

```tsx
      await tauriApi.analyzeTracksBatch(trackIds, false)
      // Returns instantly — backend events update progress from here
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      setNotification({
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      })
    }
  }

  // Handler for when user clicks on track metadata in player
  const handleScrollToCurrentTrack = useCallback(() => {
    if (trackTableRef.current) {
```

with

```tsx
      await tauriApi.analyzeTracksBatch(trackIds, false)
      // Returns instantly — backend events update progress from here
    } catch (err) {
      setAnalyzing(false)
      setAnalysisProgress(null)
      setError(err instanceof Error ? err.message : String(err))
      toast(`Analysis failed: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // Handler for when user clicks on track metadata in player
  const handleScrollToCurrentTrack = useCallback(() => {
    if (trackTableRef.current) {
```

In `src/App.tsx`, replace

```tsx
      if (list.length === 0) {
        toast('This playlist is empty', { kind: 'info' })
        return
      }
      await handlePlayTrack(list[0], list, 0, playlistId)
    } catch (err) {
      toast(`Could not play the playlist: ${err instanceof Error ? err.message : String(err)}`, {
        kind: 'error',
      })
    }
  }

  if (loading) {
    return (
      <div className="app-container loading">
```

with

```tsx
      if (list.length === 0) {
        toast('This playlist is empty', { kind: 'info' })
        return
      }
      await handlePlayTrack(list[0], list, 0, playlistId)
    } catch (err) {
      toast(`Could not play the playlist: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="app-container loading">
```

In `src/App.tsx`, replace

```tsx
      activeView={sidebarView}
      collapsed={sidebarPrefs.collapsed}
      onToggleCollapsed={sidebarPrefs.toggleCollapsed}
      colours={sidebarPrefs.colours}
      onSetColour={sidebarPrefs.setColour}
      onResetColour={sidebarPrefs.resetColour}
      toastMessage={headerNotification}
      onToastDismiss={() => setHeaderNotification(null)}
      onFolderSelect={handleFolderSelect}
      onPlaylistSelect={handlePlaylistSelect}
      onAnalyzeFolder={handleAnalyzeFolder}
      onAnalyzeAll={handleAnalyzeAll}
      onCreatePlaylist={handleCreatePlaylist}
      onCreateFolder={handleCreateFolder}
```

with

```tsx
      activeView={sidebarView}
      collapsed={sidebarPrefs.collapsed}
      onToggleCollapsed={sidebarPrefs.toggleCollapsed}
      colours={sidebarPrefs.colours}
      onSetColour={sidebarPrefs.setColour}
      onResetColour={sidebarPrefs.resetColour}
      onFolderSelect={handleFolderSelect}
      onPlaylistSelect={handlePlaylistSelect}
      onAnalyzeFolder={handleAnalyzeFolder}
      onAnalyzeAll={handleAnalyzeAll}
      onCreatePlaylist={handleCreatePlaylist}
      onCreateFolder={handleCreateFolder}
```

In `src/App.tsx`, replace

```tsx
                onOpenDj={(name, openVideoId) => openDj(name, null, { view: 'sets', openVideoId })}
              />
            ) : showSettings ? (
              <SettingsView
                onFoldersChanged={handleFoldersChanged}
                onThemeChanged={handleThemeChanged}
                onNotification={(message, type) =>
                  setNotification({ message, type })
                }
              />
            ) : showSearch ? (
              <SearchView
                tracks={tracks}
                playlists={playlists}
                onTrackPlay={handlePlayTrack}
```

with

```tsx
                onOpenDj={(name, openVideoId) => openDj(name, null, { view: 'sets', openVideoId })}
              />
            ) : showSettings ? (
              <SettingsView
                onFoldersChanged={handleFoldersChanged}
                onThemeChanged={handleThemeChanged}
                onNotification={(message, type) => toast(message, { kind: type })}
              />
            ) : showSearch ? (
              <SearchView
                tracks={tracks}
                playlists={playlists}
                onTrackPlay={handlePlayTrack}
```

In `src/App.tsx`, replace

```tsx
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
```

with

```tsx
          try {
            const added = await tauriApi.addTrackToPlaylist(playlistId, trackId)
            await loadPlaylists()
            const playlistName =
              playlists.find((p) => p.id === playlistId)?.name ?? 'playlist'
            if (added) {
              toast(`Added to ${playlistName}`)
            } else {
              toast(`Track is already in ${playlistName}`, { kind: 'warning' })
            }
          } catch (err) {
            toast(`Failed to add: ${getErrorMessage(err)}`, { kind: 'error' })
          }
        }}
        onGenerateAIPlaylist={AI_ENABLED ? handleGenerateAIPlaylist : undefined}
        onGetRecommendations={AI_ENABLED ? handleGetRecommendations : undefined}
      />
    </>
```

In `src/App.tsx`, replace

```tsx
      {exportModal && (
        <ExportPlaylistModal
          playlistId={exportModal.playlistId}
          playlistName={exportModal.playlistName}
          onClose={() => setExportModal(null)}
          onSuccess={(msg, folderPath) => {
            setNotification({ message: msg, type: 'success' })
            // Refresh tracks + the library tree root that contains the new folder
            // so auto-imported files appear immediately.
            void loadTracks()
            void folderTreeRef.current?.refreshLibraryRoot(folderPath)
          }}
          onError={(msg) => setNotification({ message: msg, type: 'error' })}
        />
      )}

      {/* Update available toast — click Install to download, install, and restart */}
      {pendingUpdate && (
        <UpdateToast
          version={pendingUpdate.version}
          onInstall={async () => {
            const update = pendingUpdate
            setPendingUpdate(null)
            setNotification({
              message: `Downloading update v${update.version}...`,
              type: 'info',
            })
            try {
              await update.downloadAndInstall()
              const isWindows = navigator.platform.startsWith('Win')
              if (isWindows) {
                setNotification({
                  message:
                    'Update installed. The app will restart automatically.',
                  type: 'success',
                })
              } else {
                setNotification({
                  message: 'Restarting app...',
                  type: 'success',
                })
                await relaunch()
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              setNotification({
                message: `Update failed: ${msg}`,
                type: 'error',
              })
            }
          }}
          onLater={() => setPendingUpdate(null)}
        />
      )}

      {/* Notification toast */}
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* What's New dialog */}
      {whatsNew && (
        <WhatsNewDialog
          version={whatsNew.version}
          changes={whatsNew.changes}
          onClose={() => setWhatsNew(null)}
```

with

```tsx
      {exportModal && (
        <ExportPlaylistModal
          playlistId={exportModal.playlistId}
          playlistName={exportModal.playlistName}
          onClose={() => setExportModal(null)}
          onSuccess={(msg, folderPath) => {
            toast(msg)
            // Refresh tracks + the library tree root that contains the new folder
            // so auto-imported files appear immediately.
            void loadTracks()
            void folderTreeRef.current?.refreshLibraryRoot(folderPath)
          }}
          onError={(msg) => toast(msg, { kind: 'error' })}
        />
      )}

      {/* Update available toast — click Install to download, install, and restart */}
      {pendingUpdate && (
        <UpdateToast
          version={pendingUpdate.version}
          onInstall={async () => {
            const update = pendingUpdate
            setPendingUpdate(null)
            toast(`Downloading update v${update.version}...`, { kind: 'info' })
            try {
              await update.downloadAndInstall()
              const isWindows = navigator.platform.startsWith('Win')
              if (isWindows) {
                toast('Update installed. The app will restart automatically.')
              } else {
                toast('Restarting app...')
                await relaunch()
              }
            } catch (err) {
              toast(`Update failed: ${getErrorMessage(err)}`, { kind: 'error' })
            }
          }}
          onLater={() => setPendingUpdate(null)}
        />
      )}

      {/* What's New dialog */}
      {whatsNew && (
        <WhatsNewDialog
          version={whatsNew.version}
          changes={whatsNew.changes}
          onClose={() => setWhatsNew(null)}
```

In `src/App.tsx`, replace

```tsx
        <AIPlaylistDialog
          seedTrack={aiPlaylistSeedTrack}
          onClose={() => setAiPlaylistSeedTrack(null)}
          onPlaylistSaved={(_playlistId) => {
            setAiPlaylistSeedTrack(null)
            loadPlaylists()
            setNotification({
              message: 'AI playlist created successfully!',
              type: 'success',
            })
          }}
        />
      )}

      {/* AI Recommendations Panel */}
      {AI_ENABLED && recommendationSeed && (
```

with

```tsx
        <AIPlaylistDialog
          seedTrack={aiPlaylistSeedTrack}
          onClose={() => setAiPlaylistSeedTrack(null)}
          onPlaylistSaved={(_playlistId) => {
            setAiPlaylistSeedTrack(null)
            loadPlaylists()
            toast('AI playlist created successfully!')
          }}
        />
      )}

      {/* AI Recommendations Panel */}
      {AI_ENABLED && recommendationSeed && (
```

In `src/App.tsx`, replace

```tsx
          playlistId={mixPrepPlaylist.id}
          playlistName={mixPrepPlaylist.name}
          onClose={() => setMixPrepPlaylist(null)}
          onPlaylistReordered={() => {
            const reorderedId = mixPrepPlaylist.id
            setMixPrepPlaylist(null)
            setNotification({
              message: 'Playlist order updated!',
              type: 'success',
            })
            // Refresh the playlist tracks if we're currently viewing this playlist
            if (selectedPlaylistId === reorderedId) {
              loadTracks(null, reorderedId)
            }
          }}
        />
```

with

```tsx
          playlistId={mixPrepPlaylist.id}
          playlistName={mixPrepPlaylist.name}
          onClose={() => setMixPrepPlaylist(null)}
          onPlaylistReordered={() => {
            const reorderedId = mixPrepPlaylist.id
            setMixPrepPlaylist(null)
            toast('Playlist order updated!')
            // Refresh the playlist tracks if we're currently viewing this playlist
            if (selectedPlaylistId === reorderedId) {
              loadTracks(null, reorderedId)
            }
          }}
        />
```

- [ ] **Step 2: The sidebar's own toast goes**

In `src/components/layout/Sidebar.tsx`, replace

```tsx
  activeView: ActiveView
  collapsed: boolean
  onToggleCollapsed: () => void
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
  toastMessage?: string | null
  onToastDismiss?: () => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onAnalyzeAll: () => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
```

with

```tsx
  activeView: ActiveView
  collapsed: boolean
  onToggleCollapsed: () => void
  colours: ColourOverrides
  onSetColour: (section: SidebarSection, hex: string) => void
  onResetColour: (section: SidebarSection) => void
  onFolderSelect: (folderPath: string | null) => void
  onPlaylistSelect: (playlistId: number) => void
  onAnalyzeFolder: (folderPath: string) => void
  onAnalyzeAll: () => void
  onCreatePlaylist: (parentId: number | null) => void
  onCreateFolder: (parentId: number | null) => void
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
  activeView,
  collapsed,
  onToggleCollapsed,
  colours,
  onSetColour,
  onResetColour,
  toastMessage,
  onToastDismiss,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onAnalyzeAll,
  onCreatePlaylist,
  onCreateFolder,
```

with

```tsx
  activeView,
  collapsed,
  onToggleCollapsed,
  colours,
  onSetColour,
  onResetColour,
  onFolderSelect,
  onPlaylistSelect,
  onAnalyzeFolder,
  onAnalyzeAll,
  onCreatePlaylist,
  onCreateFolder,
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // Auto-dismiss toast after 2s
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => onToastDismiss?.(), 2000)
    return () => clearTimeout(timer)
  }, [toastMessage, onToastDismiss])

  // Drag state
  const isDragging = useRef(false)
  const [dragging, setDragging] = useState(false)

  // Sidebar.tsx is the only writer of --sidebar-width: the dragged width when
  // full, the rail when collapsed. Only a toggle animates — never a drag.
```

with

```tsx
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // Drag state
  const isDragging = useRef(false)
  const [dragging, setDragging] = useState(false)

  // Sidebar.tsx is the only writer of --sidebar-width: the dragged width when
  // full, the rail when collapsed. Only a toggle animates — never a drag.
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
    onExportPlaylist,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
  }

  const toastEl = (
    <AnimatePresence>
      {toastMessage && (
        <motion.div
          className={`sidebar-toast ${collapsed ? 'sidebar-toast--rail' : ''}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {toastMessage}
        </motion.div>
      )}
    </AnimatePresence>
  )

  const openColourMenu =
    (section: SidebarSection, withCreate = false) =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      setCtxMenu({
        x: Math.min(e.clientX, window.innerWidth - 264),
```

with

```tsx
    onExportPlaylist,
    onCreateSubfolder,
    onRenameFolder,
    onDeleteFolder,
  }

  const openColourMenu =
    (section: SidebarSection, withCreate = false) =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      setCtxMenu({
        x: Math.min(e.clientX, window.innerWidth - 264),
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
                }}
              />
            )
          }
        />
        {colourMenuEl}
        {toastEl}
      </>
    )
  }

  return (
    <div className="sidebar">
```

with

```tsx
                }}
              />
            )
          }
        />
        {colourMenuEl}
      </>
    )
  }

  return (
    <div className="sidebar">
```

In `src/components/layout/Sidebar.tsx`, replace

```tsx
          </>
        )}
      </div>

      {colourMenuEl}

      {toastEl}

      {/* Drag resize handle */}
      <div
        className={`sidebar-drag-handle ${dragging ? 'sidebar-drag-handle--dragging' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
```

with

```tsx
          </>
        )}
      </div>

      {colourMenuEl}

      {/* Drag resize handle */}
      <div
        className={`sidebar-drag-handle ${dragging ? 'sidebar-drag-handle--dragging' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
```

In `src/components/layout/Sidebar.css`, replace

```css
}

.sidebar-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

/* ===== Toast notification ===== */

.sidebar-toast {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  font-size: var(--text-xs, 11px);
  font-weight: 500;
  text-align: center;
  pointer-events: none;
  z-index: 20;
}

/* ===== Drag resize handle ===== */

.sidebar-drag-handle {
  position: absolute;
  top: 0;
  right: 0;
```

with

```css
}

.sidebar-ctx-menu__item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

/* ===== Drag resize handle ===== */

.sidebar-drag-handle {
  position: absolute;
  top: 0;
  right: 0;
```

In `src/components/layout/Sidebar.css`, replace

```css
}

.sidebar-rail__avatar {
  margin: 10px 0 12px;
}

/* In the rail the toast would be 60px wide; float it beside the rail instead. */
.sidebar-toast--rail {
  position: fixed;
  left: calc(var(--sidebar-width) + 12px);
  right: auto;
  bottom: 96px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}

/* ===== Tooltip (rail) — fixed, so the sidebar's overflow cannot clip it ===== */

.sidebar-tooltip {
  position: fixed;
  z-index: 260;
  transform: translateY(-50%);
```

with

```css
}

.sidebar-rail__avatar {
  margin: 10px 0 12px;
}

/* ===== Tooltip (rail) — fixed, so the sidebar's overflow cannot clip it ===== */

.sidebar-tooltip {
  position: fixed;
  z-index: 260;
  transform: translateY(-50%);
```

- [ ] **Step 3: The old components go**

`git rm -r -q src/components/Notification.tsx`

`git rm -r -q src/components/Notification.css`

`git rm -r -q src/components/HeaderNotification.tsx`

`git rm -r -q src/components/HeaderNotification.css`

- [ ] **Step 4:** `npx tsc --noEmit -p .`: no errors; `grep -rn "setNotification\|HeaderNotification\|components/Notification\|toastMessage" src`: nothing. Commit:

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat(ui): toasts for every notification; Notification and the sidebar's toast go"
```

---

### Task 6: A heart's Undo

**Files:** Modify `src/components/views/SetsView.tsx`, `src/lib/tauri-api.ts`.

- [ ] **Step 1: `unheart`, for the Saved tracks tab and the set page's ♥**

In `src/components/views/SetsView.tsx`, replace

```tsx
    return result.tracks
      .map((t) => matches.byIndex.get(t.index)?.track)
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])

  /**
   * A set just fetched, on its page — unless something else was opened, or
   * Back pressed, since it was asked for (`claim`).
   */
  function show(raw: RawSet, claim: number): TracklistResult {
```

with

```tsx
    return result.tracks
      .map((t) => matches.byIndex.get(t.index)?.track)
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])
  // Hearts being taken off (unheart): a second press waits for the first.
  const unhearting = useRef(new Set<string>())

  /**
   * A set just fetched, on its page — unless something else was opened, or
   * Back pressed, since it was asked for (`claim`).
   */
  function show(raw: RawSet, claim: number): TracklistResult {
```

In `src/components/views/SetsView.tsx`, replace

```tsx
      showLibrary()
    }
    refreshLibrary()
    toast('Removed from your library')
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })

    if (savedKeys.has(key)) {
      await tauriApi
        .deleteSavedYouTubeTrack(currentSet.video.id, track.cueMs, track.title)
        .catch(() => {})
    } else {
      await tauriApi
        .saveYouTubeTrack({
          video_id: currentSet.video.id,
          cue_ms: track.cueMs,
          cue: track.cue,
          artist: track.artist ?? undefined,
          title: track.title,
          mix: track.mix ?? undefined,
        })
        .catch(() => {})
    }
    refreshLibrary()
  }

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
```

with

```tsx
      showLibrary()
    }
    refreshLibrary()
    toast('Removed from your library')
  }

  /**
   * Takes a heart off, with an Undo that hearts it again at its old
   * `saved_at`, so it goes back to its place in Saved tracks. A second press
   * before the list reads again is dropped (one toast, one Undo).
   */
  async function unheart(track: SavedTrack) {
    const key = trackKey(track)
    if (unhearting.current.has(key)) return
    unhearting.current.add(key)
    try {
      await tauriApi.deleteSavedYouTubeTrack(track.video_id, track.cue_ms, track.title)
    } catch (err) {
      unhearting.current.delete(key)
      toast(`Couldn't remove it: ${getErrorMessage(err)}`, { kind: 'error' })
      return
    }
    // The list without it, before another press could find it there again.
    await tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
    unhearting.current.delete(key)
    refreshLibrary()
    toast(`Removed "${track.title}" from Saved tracks`, {
      action: {
        label: 'Undo',
        run: () =>
          void tauriApi
            .saveYouTubeTrack(track)
            .then(refreshLibrary)
            .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' })),
      },
    })
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })

    const hearted = saved.find((t) => trackKey(t) === key)
    if (hearted) {
      await unheart(hearted)
      return
    }
    await tauriApi
      .saveYouTubeTrack({
        video_id: currentSet.video.id,
        cue_ms: track.cueMs,
        cue: track.cue,
        artist: track.artist ?? undefined,
        title: track.title,
        mix: track.mix ?? undefined,
      })
      .catch((err) => toast(`Couldn't save it: ${getErrorMessage(err)}`, { kind: 'error' }))
    refreshLibrary()
  }

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
```

In `src/components/views/SetsView.tsx`, replace

```tsx
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
```

with

```tsx
              )}

              {tab === 'saved' && (
                <SetsSaved
                  saved={saved}
                  onOpenAt={(videoId, cueMs, title) => void openSet(videoId, { cueMs, title })}
                  onRemove={(track) => void unheart(track)}
                />
              )}
            </>
          )}
        </div>
      </div>
```

In `src/lib/tauri-api.ts`, replace

```ts
  },

  async deleteYouTubeSet(videoId: string): Promise<void> {
    return await invoke('delete_youtube_set', { videoId })
  },

  async saveYouTubeTrack(track: SavedTrack): Promise<void> {
    return await invoke('save_youtube_track', { track })
  },

  /** "Where did I hear this?" across every stored set. Costs no quota. */
  async searchYouTubeTracks(query: string): Promise<YtTrackHit[]> {
```

with

```ts
  },

  async deleteYouTubeSet(videoId: string): Promise<void> {
    return await invoke('delete_youtube_set', { videoId })
  },

  /** Hearts a track; with `saved_at` it keeps that time (a removed heart's Undo). */
  async saveYouTubeTrack(track: SavedTrack): Promise<void> {
    return await invoke('save_youtube_track', { track })
  },

  /** "Where did I hear this?" across every stored set. Costs no quota. */
  async searchYouTubeTracks(query: string): Promise<YtTrackHit[]> {
```

- [ ] **Step 2:** `npx tsc --noEmit -p .`: no errors; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 649 passed (650)`; `npx eslint src mobile 2>&1 | grep problems`: 28, as before; `npx vite build`: passes. Commit:

```bash
git add src/components/views/SetsView.tsx src/lib/tauri-api.ts
git commit -m "feat(sets): removing a heart has an Undo that puts it back in its place"
```

---

### Task 7: The spec

**Files:** Modify `docs/superpowers/specs/2026-10-04-interactions-design.md`.

- [ ] **Step 1:** The decisions above, as built.

In `docs/superpowers/specs/2026-10-04-interactions-design.md`, replace

```markdown
Built by track table plan 6: the whole drag layer (`useTrackDrag`,
`startTrackDrag`, the `data-drop-*` targets and `DragGhost`, in
`src/lib/drag/`), with the track table as the source and the sidebar's
playlists, library folders and rail icons as targets; Home's rows are left
for the Home plan.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

with

```markdown
Built by track table plan 6: the whole drag layer (`useTrackDrag`,
`startTrackDrag`, the `data-drop-*` targets and `DragGhost`, in
`src/lib/drag/`), with the track table as the source and the sidebar's
playlists, library folders and rail icons as targets; Home's rows are left
for the Home plan.

**As built by plan I1** (feedback):
- `toast()` replaces App's `Notification` everywhere — Settings and the
  duplicates dialog reach it through their `onNotification` — and the
  sidebar's own "Added to …" toast. `Notification`, `HeaderNotification`
  (already unused) and their styles are gone. A toast says an error's own
  message (`getErrorMessage`), never "[object Object]".
- `UpdateToast` stays top right, apart from the toasts, because it waits for
  an answer: a toast's card with Later (`.btn`) and Install (`.btn--primary`).
- Removing a heart, on Saved tracks or on a set's page, says "Removed "…"
  from Saved tracks" with Undo; Undo hearts it again with its old
  `saved_at`, so it goes back to its place (`save_youtube_track` keeps a
  given `saved_at`; a track hearted already keeps its time). A second press
  before the list reads again is dropped; a heart that could not be saved
  says so.
- A menu item with `confirm: { message, label }` asks in the menu's place:
  the question, Cancel (which has the keys) and the red answer
  (`.btn--danger`, now in `controls.css`); Tab moves between the two, Esc or
  a press outside cancels.
  The set page's ⋯ › Remove from library uses it; the Remove button on a set
  that cannot be read still asks with a dialog.
- The rest of this spec is two more plans. **I2** (menus and keys): the
  sidebar's right-click menus move to `Menu`, with Delete playlist and
  Delete folder asking in its place; `useShortcuts`, the shortcuts sheet and
  "whichever played last"; `Skeleton`. **I3** (the sweep): every
  `transition:` on the tokens; `.btn--icon`, `.btn--pill` and the `Button`
  component with its working state; Settings, the DJ pages and the modals on
  the shared controls.

## Testing

- TypeScript: the toast queue (max 3, error stays, warning 6s, hover pauses);
  shortcut routing (ignored while typing or with an overlay open, a
  `:focus-visible` control keeps Space and a mouse-focused one does not,
  repeats ignored, Esc order, "whichever played last"); the drag layer's
```

- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/specs/2026-10-04-interactions-design.md
git commit -m "docs(spec): Interactions I1 as built"
```

---

### Task 8: Check

- [ ] **Step 1:** `cd src-tauri && cargo test --lib 2>&1 | grep "test result"`: 462 passed; `npx vitest run 2>&1 | grep "Tests "`: `1 failed | 649 passed (650)`; `npx tsc --noEmit -p .`; `npx eslint src mobile 2>&1 | grep problems`: 28; `npx vite build`.
- [ ] **Step 2 (the user, by hand in `npm run tauri dev`):**
  - Analyze a folder (right-click › Analyze): the toast at the bottom centre over the player says how many were analyzed; Settings › Database › find duplicates: "No duplicates found" (or how many it removed) comes as the same toast.
  - The player's ⋯ › Add to playlist: "Added to …" as a toast (nothing at the sidebar's foot); again: "Track is already in …" (amber).
  - Sets › a set › ⋯ › Remove from library: the menu asks in its place; Cancel keeps it; Remove takes it out.
  - Saved tracks: ♥ off, Undo — the track is back where it was; the same from a set's page.
  - (When an update is out) the prompt top right: Later and Install look like the app's buttons.
