# Architecture Research

**Domain:** In-app update notifications + "What's New" changelog for existing Tauri v2 desktop app
**Researched:** 2026-03-14
**Confidence:** HIGH — based on direct codebase inspection of existing implementation

---

## Current State Assessment

The update notification system is **substantially already implemented**. This is a completion
and stabilization milestone, not a greenfield build. The gap is one critical piece (auto-check
on launch was disabled due to a macOS crash bug) plus minor cleanup.

**What exists today:**

| Piece | File | Status |
|-------|------|--------|
| `tauri-plugin-updater` v2.10.0 | `Cargo.toml`, `package.json` | Installed |
| `tauri-plugin-process` v2 | `Cargo.toml`, `package.json` | Installed |
| Updater config (endpoint, pubkey, artifact format) | `tauri.conf.json` plugins.updater | Done |
| IPC permissions | `capabilities/default.json` | Done |
| `WhatsNewDialog` component | `src/components/WhatsNewDialog.tsx` | Done |
| CHANGELOG.md parser | `src/lib/changelog.ts` | Done |
| Version sentinel check (first launch after update) | `src/App.tsx` `initializeApp()` | Done |
| Manual update check + progress bar | `src/components/settings/SettingsContext.tsx` | Done |
| "Check for Updates" button + progress UI | `src/components/settings/AboutSection.tsx` | Done |
| `latest.json` for GitHub Releases endpoint | `/latest.json` | Done |

**What is incomplete or disabled:**

1. **Auto-check on launch is commented out** in `App.tsx` lines 251–270 with the note:
   "Disabled: update check was causing 'quit unexpectedly' crashes on macOS"
2. **`WhatsNewDialog` has a duplicate "Update" button** that calls `check()` directly inside
   the modal, separate from the `SettingsContext.handleCheckForUpdates()` path
3. **Update toast/banner** (non-blocking notification offering Install / Later) is missing —
   the disabled auto-check code was attempting silent download + forced relaunch instead

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      App.tsx (AppContent)                             │
│                                                                       │
│  ┌──────────────────┐   ┌─────────────────────┐   ┌───────────────┐  │
│  │  initializeApp() │   │  update useEffect   │   │ whatsNew      │  │
│  │  (on mount)      │   │  (launch auto-check)│   │ state         │  │
│  │                  │   │  [DISABLED]         │   │               │  │
│  └────────┬─────────┘   └──────────┬──────────┘   └───────┬───────┘  │
│           │                        │                       │          │
│    compare last_seen_         check()                WhatsNewDialog  │
│    version (SQLite)           @tauri-apps/plugin-    (modal overlay) │
│    to package.json            updater                                 │
│           │                        │                                  │
│    if different:              if update found:                        │
│    getChangesForVersion()     [MISSING: toast                        │
│    → setWhatsNew()            notification with                      │
│                               Install / Later]                       │
└──────────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼──────────────────────────┐
         ▼                ▼                           ▼
┌──────────────┐  ┌────────────────────┐  ┌──────────────────────────┐
│Settings      │  │ GitHub Releases    │  │ CHANGELOG.md             │
│Context       │  │ latest.json        │  │ (bundled at Vite build   │
│(manual check │  │ endpoint           │  │  via ?raw import)        │
│+ progress)   │  │                    │  │ → changelog.ts parser    │
│→ AboutSection│  │                    │  │                          │
└──────────────┘  └────────────────────┘  └──────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `App.tsx` `initializeApp()` | Version sentinel check on launch; show WhatsNewDialog if new version | Done |
| `App.tsx` update `useEffect` | Auto-check GitHub Releases on launch (after delay, prod only) | Disabled — needs fix |
| `WhatsNewDialog.tsx` | Display changelog entries for current version; optional update trigger | Done — needs cleanup |
| `src/lib/changelog.ts` | Parse CHANGELOG.md to extract bullet points for a given version | Done |
| `SettingsContext.tsx` `handleCheckForUpdates()` | Full manual update flow: check → download → progress → restart dialog | Done |
| `AboutSection.tsx` | "Check for Updates" button + inline progress bar UI | Done |
| `tauri.conf.json` plugins.updater | Endpoint, public key, createUpdaterArtifacts config | Done |
| `capabilities/default.json` | `updater:allow-check`, `process:allow-restart` IPC permissions | Done |
| `latest.json` | Published to GitHub Releases; queried by updater plugin at runtime | Done |
| **UpdateBanner / toast** | Non-blocking "v1.x available — Install / Later" notification | MISSING |

---

## Recommended Project Structure

No new directories are needed. All pieces already exist in the correct locations.

```
src/
├── App.tsx                          # initializeApp(): version sentinel + auto-check effect
├── components/
│   ├── WhatsNewDialog.tsx           # Changelog modal (needs Update button removed or delegated)
│   ├── Notification.tsx             # Existing toast — reuse for update-available banner
│   └── settings/
│       ├── AboutSection.tsx         # "Check for Updates" button + progress bar
│       └── SettingsContext.tsx      # handleCheckForUpdates() + UpdateProgress state
└── lib/
    └── changelog.ts                 # Parse CHANGELOG.md for version bullet points

CHANGELOG.md                         # Keep a Changelog format — source of truth for What's New
latest.json                          # Published per release to GitHub Releases endpoint

src-tauri/
├── Cargo.toml                       # tauri-plugin-updater, tauri-plugin-process
├── tauri.conf.json                  # plugins.updater endpoint + pubkey + artifact format
└── capabilities/
    └── default.json                 # updater:allow-check, process:allow-restart
```

### Structure Rationale

- **No new Rust commands needed:** The entire update flow runs through `@tauri-apps/plugin-updater`'s JS API (`check()`, `downloadAndInstall()`) and `@tauri-apps/plugin-process` (`relaunch()`). No custom Rust wrapper is required.
- **No new stores:** Update state is ephemeral (checking in progress, available, none). App-level `useState` in `AppContent` (for the toast) and `SettingsContext` state (for the progress bar) are sufficient.
- **`Notification.tsx` is reusable:** The existing `Notification` component accepts `type` and `message`. An "update available" toast fits naturally as `type: 'info'` with a custom action button.

---

## Architectural Patterns

### Pattern 1: Version Sentinel in SQLite Settings

**What:** On every app launch, compare `getSetting('last_seen_version')` (from the SQLite settings table) to `package.json` version (the new binary's version). If they differ, the app was just updated.

**When to use:** Detecting "first launch after update" without polling or server state. Works because the SQLite DB persists across restarts but `package.json` is baked into each build.

**Trade-offs:** Simple; no external state. Works offline. The sentinel is updated immediately after the check (even if the dialog is dismissed without reading), which prevents the dialog from re-showing on next launch.

**Example (from `App.tsx` `initializeApp()`):**
```typescript
const lastSeen = await tauriApi.getSetting('last_seen_version')
const currentVersion = appPackage.version
if (lastSeen !== currentVersion) {
  const changes = getChangesForVersion(currentVersion)
  if (changes.length > 0) {
    setWhatsNew({ version: `v${currentVersion}`, changes })
  }
  // Update sentinel regardless — prevents re-showing if no changelog entry
  await tauriApi.setSetting('last_seen_version', currentVersion)
}
```

### Pattern 2: Plugin Direct Call — No Rust Command Wrapper

**What:** The frontend calls `check()` from `@tauri-apps/plugin-updater` directly. No custom Rust `#[tauri::command]` is needed. The plugin handles HTTP, signature verification, download, and install.

**When to use:** Tauri v2 plugin model — use the plugin's JS API when it provides everything needed.

**Trade-offs:** Simpler than a Rust wrapper; less code to maintain. Loses the ability to add Rust-side logic (forced update policy, telemetry). For this use case, direct call is correct.

**Example:**
```typescript
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const update = await check()
if (update) {
  await update.downloadAndInstall((event) => {
    if (event.event === 'Progress') {
      setProgress(Math.round((downloadedBytes / totalBytes) * 100))
    }
  })
  // Ask user before restarting
  const confirm = await ask('Restart now?', { okLabel: 'Restart Now', cancelLabel: 'Later' })
  if (confirm) await relaunch()
}
```

### Pattern 3: Changelog Bundled at Build Time via Vite Raw Import

**What:** `CHANGELOG.md` is imported as raw text at Vite build time (`import changelog from '../../CHANGELOG.md?raw'`). `changelog.ts` parses it at runtime using regex to extract bullet points for a given version.

**When to use:** Local-first apps where changelog data must be available offline. The correct version's notes are always present in the shipped binary.

**Trade-offs:** Changelog is frozen at build time (correct for a release). The `latest.json` `notes` field is separate and not currently used by the UI — the app reads CHANGELOG.md instead, which provides richer structure (categories, formatting).

**Example (from `src/lib/changelog.ts`):**
```typescript
import changelog from '../../CHANGELOG.md?raw'

export function getChangesForVersion(version: string): string[] {
  const versionNorm = version.replace(/^v/, '')
  const regex = new RegExp(
    `## \\[${versionNorm.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`
  )
  const match = changelog.match(regex)
  if (!match) return []
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('###'))
}
```

### Pattern 4: Non-Blocking Toast for Update Available

**What:** When the auto-check finds an update, show a toast notification (reuse `Notification.tsx` or extend it with an action button) rather than immediately downloading. Store the `Update` object in a `useRef` so the Install action can invoke it later.

**When to use:** Auto-triggered operations that should not interrupt the user's current session. The user can dismiss and update later via Settings → About.

**Trade-offs:** Better UX than forced download. Requires storing the `Update` object for deferred action. If the user ignores the toast, the update is still available via Settings.

**Target implementation sketch:**
```typescript
// In AppContent (App.tsx)
const pendingUpdateRef = useRef<Update | null>(null)
const [updateAvailable, setUpdateAvailable] = useState<string | null>(null) // version string

// Auto-check effect (currently disabled — re-enable after macOS fix)
useEffect(() => {
  if (import.meta.env.DEV) return
  const timer = setTimeout(async () => {
    try {
      const update = await check()
      if (update) {
        pendingUpdateRef.current = update
        setUpdateAvailable(update.version)
      }
    } catch (err) {
      console.warn('Update check failed:', err)
    }
  }, 3000)
  return () => clearTimeout(timer)
}, [])

// In JSX: render toast when updateAvailable is set
// User clicks Install → pendingUpdateRef.current.downloadAndInstall(...)
```

---

## Data Flow

### "What's New" on First Launch After Update

```
App launches (new binary version installed)
    ↓
initializeApp()
    ↓
getSetting('last_seen_version')  ←→  SQLite settings table
    ↓
compare to package.json version (baked into binary at build time)
    ↓  [version differs → first launch after update]
getChangesForVersion(currentVersion)  ←  CHANGELOG.md (bundled via ?raw)
    ↓
setWhatsNew({ version, changes })
    ↓
WhatsNewDialog renders as modal overlay
    ↓
setSetting('last_seen_version', currentVersion)  →  SQLite (sentinel updated)
    ↓
User reads changelog → closes dialog → normal app usage
```

### Manual Update Check (Settings → About → "Check for Updates")

```
User clicks "Check for Updates"
    ↓
handleCheckForUpdates()  [SettingsContext]
    ↓
setUpdateProgress({ status: 'checking', progress: 0 })
    ↓
check()  →  HTTPS GET https://github.com/.../releases/latest/download/latest.json
    ↓
[no update]  →  setUpdateProgress(null) + notification "You're on the latest version."
[update found]  ↓
setUpdateProgress({ status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })
    ↓
update.downloadAndInstall(progressCallback)
    → Started: set totalBytes
    → Progress: increment downloadedBytes, compute %
    → Finished: status = 'installing'
    ↓
ask() dialog: "Restart now to apply?"
    ↓ [Restart Now]        ↓ [Later]
relaunch()             notification "Update applies on next restart"
```

### Auto-Check on Launch (Target — Currently Disabled)

```
App mounts in production
    ↓
useEffect: setTimeout(3000ms)
    ↓
check()  →  GitHub Releases latest.json
    ↓
[no update]  →  silently do nothing (no notification)
[update found]  ↓
pendingUpdateRef.current = update
setUpdateAvailable(update.version)
    ↓
Toast: "v{version} available  [Install]  [Later]"
    ↓ [Install clicked]
update.downloadAndInstall(progressCallback)
    ↓
ask() dialog → relaunch() or defer
    ↓ [Later / dismissed]
pendingUpdateRef.current remains — user can trigger via Settings → About
```

---

## Integration Points

### New vs Existing — What Actually Needs to Change

| Item | Status | Action Required |
|------|--------|----------------|
| `tauri-plugin-updater` installed | Done | Nothing |
| `tauri.conf.json` endpoint + pubkey | Done | Nothing |
| Capabilities permissions | Done | Nothing |
| `changelog.ts` parser | Done | Nothing |
| `WhatsNewDialog.tsx` (changelog display) | Done | Minor: remove or delegate the duplicate "Update" button to use shared handler |
| Version sentinel in `initializeApp` | Done | Nothing |
| `handleCheckForUpdates()` in SettingsContext | Done | Nothing |
| `AboutSection.tsx` progress bar | Done | Nothing |
| Auto-check `useEffect` in `App.tsx` | Disabled | Fix macOS crash, then re-enable with non-blocking toast pattern |
| Update-available toast/banner | Missing | New: add state + JSX to `AppContent`; reuse `Notification.tsx` or extend it with action button |
| `UpdateProgress` type | Defined in `SettingsContext.tsx` | Extract to `src/types/updater.ts` if `WhatsNewDialog` also needs it |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|--------------|-------|
| `App.tsx` ↔ `WhatsNewDialog` | React state (`whatsNew` prop + `onClose` callback) | Prop-drilled; acceptable given single mount point in `AppContent` |
| `App.tsx` ↔ `Notification` | React state (`notification` prop) | Same existing pattern — reuse for "update available" toast |
| `App.tsx` ↔ `Update` object | `useRef<Update | null>` | Store the resolved updater object for deferred install action |
| `SettingsContext` ↔ `@tauri-apps/plugin-updater` | Direct import, no Rust IPC | Correct Tauri v2 plugin model |
| `changelog.ts` ↔ `CHANGELOG.md` | Vite `?raw` import at build time | No IPC; pure frontend |
| `App.tsx` ↔ SQLite (version sentinel) | `tauriApi.getSetting` / `setSetting` (IPC invoke) | Async; runs inside `initializeApp` before `setLoading(false)` |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Releases | `check()` calls `https://github.com/NM193/RecoDeck/releases/latest/download/latest.json` | Configured in `tauri.conf.json`. Must publish `latest.json` with correct platform entries on each release. |
| `@tauri-apps/plugin-updater` | JS API — `check()`, `update.downloadAndInstall()` | v2.10.0 installed. No Rust command wrapper needed. |
| `@tauri-apps/plugin-process` | JS API — `relaunch()` | Installed. Triggered after user confirms restart. |

---

## Build Order for Remaining Work

Dependencies: the macOS crash fix must come first. Toast UI can be built and tested in parallel but cannot be verified end-to-end until the auto-check is re-enabled.

```
Step 1 — Diagnose macOS crash in tauri-plugin-updater (UNBLOCK)
  The disabled code comment says "cross-device link, restart failures".
  Likely causes:
    a) `os_unfair_lock` panic in older plugin version — check if v2.10.0 fixes it
    b) Cross-device file rename during install (temp dir on different volume)
    c) Forced relaunch immediately after install without user confirmation
  Action: Check tauri-plugin-updater v2 changelog for "macOS", "crash", "relaunch"
           Test: call check() in prod build WITHOUT calling downloadAndInstall or relaunch
           If check() alone is safe: crash was from the silent relaunch pattern, not the check itself
  Output: Confirmed-safe call pattern (check-only, or check + download + user-confirmed relaunch)

Step 2 — Add update-available state + toast to App.tsx (UI)
  Files: src/App.tsx
  Changes:
    - Add `pendingUpdateRef = useRef<Update | null>(null)`
    - Add `updateAvailable: string | null` state
    - Add JSX: render Notification (or extended variant) when updateAvailable is set
    - "Install" button action: call download + install + ask() + relaunch()
    - "Later" button action: setUpdateAvailable(null), keep pendingUpdateRef
  Dependencies: None — can be built before Step 1 and tested manually

Step 3 — Re-enable auto-check useEffect (once Step 1 confirmed safe)
  Files: src/App.tsx
  Changes:
    - Uncomment / rewrite the disabled useEffect
    - Use confirmed-safe call pattern from Step 1
    - On update found: pendingUpdateRef.current = update; setUpdateAvailable(version)
    - Do NOT call downloadAndInstall automatically — wait for user action (Step 2)
  Dependencies: Step 1

Step 4 — Clean up WhatsNewDialog duplicate update path (optional polish)
  Files: src/components/WhatsNewDialog.tsx
  Options:
    A) Remove the "Update" button entirely — WhatsNewDialog is for reading changelog only;
       update flow is entirely through Settings and the new toast
    B) Keep the button but delegate to a shared callback passed as a prop from App.tsx,
       which calls the same handler as SettingsContext.handleCheckForUpdates()
  Recommendation: Option A is simpler. The toast (Step 2) and Settings → About already
                  cover all update entry points.
  Dependencies: None — independent cleanup

Step 5 — Extract UpdateProgress type (optional polish)
  Files: src/types/updater.ts (new), SettingsContext.tsx, WhatsNewDialog.tsx (if kept)
  Change: Move the UpdateProgress interface to a shared types file
  Dependencies: Step 4 decision determines whether WhatsNewDialog imports it
```

---

## Anti-Patterns

### Anti-Pattern 1: Silent Auto-Download + Forced Relaunch

**What people do:** `const update = await check(); await update.downloadAndInstall(); await relaunch()` — the original disabled code in `App.tsx`.

**Why it's wrong:** Forces a restart mid-session without user consent. On macOS, `relaunch()` after an in-place install can crash with "quit unexpectedly" (likely cross-device file rename or lock contention). Even when it works, silently restarting a running app is disruptive.

**Do this instead:** Check silently; show a non-blocking toast; download and install only on user consent; present a "Restart Now / Later" dialog before calling `relaunch()`.

### Anti-Pattern 2: Duplicate Update Code Paths

**What people do:** `WhatsNewDialog` calls `check()` directly in its own `handleUpdate()`. `SettingsContext.handleCheckForUpdates()` is a second independent implementation of the same flow.

**Why it's wrong:** Two implementations of the same logic. Progress state is local to the modal, not surfaced in Settings. Bug fixes must be applied twice. If a third entry point (the toast) is added, there are now three.

**Do this instead:** One canonical update handler in `SettingsContext` (or lifted to `App.tsx` if the toast needs it). `WhatsNewDialog` and other UI components receive it as a callback prop or call it through a shared hook.

### Anti-Pattern 3: Calling `check()` in Development Mode

**What people do:** Remove the `if (import.meta.env.DEV) return` guard during debugging, forget to restore it.

**Why it's wrong:** The updater plugin will check GitHub Releases in dev mode. If a release exists with a higher semver than the dev `package.json`, it may offer to "update" your dev build or, worse, install the release binary over the dev environment.

**Do this instead:** Keep the `DEV` guard. Test update UI by mocking the `check()` call or by temporarily hardcoding a fake `UpdateInfo` object.

### Anti-Pattern 4: `latest.json` with Missing Platform Entries

**What people do:** Publish a `latest.json` that only contains `darwin-aarch64`. Windows users get no update notification because the plugin finds no matching platform.

**Why it's wrong:** Silent update failure. Windows users never see the toast or manual check succeed.

**Do this instead:** Ensure the release workflow publishes a `latest.json` with entries for every supported platform. Current file has only `darwin-aarch64`. If Windows support is added later, the manifest script must be extended before Windows users receive updates.

---

## Scaling Considerations

This is a local desktop app for a small DJ community. Scale is not a concern for the update system itself. The relevant operational considerations:

| Concern | Approach |
|---------|----------|
| GitHub Releases rate limits | `check()` runs at most once per launch + on manual trigger. Negligible request volume for a small user base. |
| Signature key rotation | `pubkey` in `tauri.conf.json` is the minisign public key. Private key stored as GitHub secret. Rotation requires a new `tauri.conf.json` commit before old clients lose the ability to verify. For this audience, rotation is unlikely to be needed. |
| `latest.json` for multiple platforms | Currently darwin-aarch64 only. If Windows support lands (v1.5 milestone), the release script must merge both platform fragments into one manifest before publishing. |
| Update during active playback | The current flow asks the user before calling `relaunch()`. If the user is mid-mix, "Later" is available. No special handling of audio state before relaunch is needed. |

---

## Sources

- Direct codebase inspection — HIGH confidence on all findings:
  - `src/App.tsx` (`initializeApp` version sentinel lines 317–330; disabled auto-check lines 251–270)
  - `src/components/WhatsNewDialog.tsx` (full implementation)
  - `src/lib/changelog.ts` (CHANGELOG.md raw import + parser)
  - `src/components/settings/SettingsContext.tsx` (`handleCheckForUpdates()` lines 536–590; `UpdateProgress` type lines 12–17)
  - `src/components/settings/AboutSection.tsx` (button + progress bar UI)
  - `src-tauri/tauri.conf.json` (plugins.updater config, createUpdaterArtifacts, endpoint)
  - `src-tauri/capabilities/default.json` (updater:allow-check, process:allow-restart)
  - `src-tauri/Cargo.toml` (tauri-plugin-updater v2, tauri-plugin-process v2)
  - `package.json` (@tauri-apps/plugin-updater v2.10.0, @tauri-apps/plugin-process v2)
  - `/latest.json` (current release manifest — darwin-aarch64 only)
  - `CHANGELOG.md` (Keep a Changelog format confirmed)

---

*Architecture research for: RecoDeck v1.6 — Update Notifications + What's New Changelog*
*Researched: 2026-03-14*
