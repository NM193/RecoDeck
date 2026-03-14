# Phase 22: Auto-Check and Update Toast - Research

**Researched:** 2026-03-14
**Domain:** Tauri v2 updater JS API, React toast with action buttons, platform detection
**Confidence:** HIGH

## Summary

Phase 22 wires the Tauri v2 updater JS API into the app launch sequence: `check()` runs after a 3–5 second delay, stores the result in a `useRef` (never auto-installs), and when an update is available shows a custom toast with Install and Later buttons. Clicking Install navigates to Settings > About, where the existing `handleCheckForUpdates` flow handles the actual download and restart.

The existing `Notification` component in `src/components/Notification.tsx` is a plain auto-dismissing info/success/warning/error toast with only a close button. It does not support action buttons. A new `UpdateToast` component must be created (or `Notification` extended) to render Install / Later actions. The existing component's CSS and visual design (backdrop blur, countdown bar, slide-in animation, type-variant colors) should be matched.

Platform detection for the conditional `relaunch()` call requires either `@tauri-apps/plugin-os` (not currently installed) or `navigator.platform` / `navigator.userAgent`. Given the project's small scope, `navigator.platform` is a pragmatic alternative; however, `tauri-plugin-os` is the idiomatic Tauri v2 approach. The planner must decide: install the OS plugin or use `navigator.platform`. Research covers both.

The commented-out auto-update block in `App.tsx` (lines 251–270) shows the prior attempt — it called `downloadAndInstall()` automatically, which caused macOS crashes. Phase 22 must NOT call `downloadAndInstall()` on launch; it stores the update object in a ref and only starts download when the user clicks Install in About.

**Primary recommendation:** Add a `pendingUpdateRef` (`useRef<Update | null>`) in `AppContent`, run `check()` in a `useEffect` after a 4-second delay, store the result, then show a new `UpdateToast` component when `pendingUpdate` state is non-null. Install button calls `setShowSettings(true)` which re-mounts `SettingsView`; the ref must be accessible to the About section (pass it as a prop or expose via a context). The simplest approach: pass the pending update object into `SettingsProvider` callbacks or expose a `navigateToAbout` function that also sets a "jump to about" flag in the settings view.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UCHK-01 | App checks for updates on launch after a 3-5 second delay (check only, never auto-install) | `check()` from `@tauri-apps/plugin-updater` already imported in SettingsContext; same import works in App.tsx. `setTimeout` of 3000–5000ms in a `useEffect` with `DEV` guard (matching the existing commented block). Store result in `useRef<Update \| null>` — never call `downloadAndInstall()` here. |
| UCHK-02 | Update-available toast notification appears with Install and Later buttons | Existing `Notification` component has no action buttons. A new `UpdateToast` component is needed with Install + Later buttons rendered below the message text. CSS must follow the existing `notification--info` visual design. The toast must not auto-dismiss (no countdown bar), or have a long timeout (30s+). |
| UCHK-03 | Install button routes to Settings > About for user-initiated download and restart | `setShowSettings(true)` navigates to SettingsView. AboutSection already has `handleCheckForUpdates` which runs `check()` again and does the full download/install/restart flow. Phase 22 should not skip the re-check; letting About re-check is simpler and avoids threading the `Update` object through props. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/plugin-updater` | `^2.10.0` (already installed) | `check()` to detect available update | Already in package.json and Cargo.toml |
| `@tauri-apps/plugin-process` | `^2` (already installed) | `relaunch()` after install on macOS | Already in package.json and Cargo.toml |
| React `useRef` / `useEffect` / `useState` | React 19 | Store pending update, run delayed check, show toast | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/plugin-os` | `^2` (NOT installed) | `platform()` returns `"macos"` or `"windows"` | Install if conditional `relaunch()` is needed and `navigator.platform` is not acceptable |
| `navigator.platform` | browser built-in | Detect Windows without OS plugin | Acceptable for small-audience app; returns `"Win32"` on Windows |

### Platform Detection Decision

`tauri-plugin-os` is NOT installed in this project. Two options:

**Option A — Use `navigator.platform` (no install needed):**
```typescript
const isWindows = navigator.platform.startsWith('Win')
// "Win32" on Windows, "MacIntel"/"MacM1" on macOS, "Linux x86_64" on Linux
```
Confidence: HIGH — this is a standard browser API, works in Tauri WebView, no permissions needed.

**Option B — Install `tauri-plugin-os`:**
```bash
npm run tauri add os
# adds to Cargo.toml, lib.rs, package.json, capabilities
```
Then:
```typescript
import { platform } from '@tauri-apps/plugin-os'
const isWindows = (await platform()) === 'windows'
```
Confidence: HIGH — idiomatic Tauri v2 approach.

**Recommendation:** Use `navigator.platform` for Phase 22. Installing the OS plugin adds 4 files to touch (Cargo.toml, lib.rs, package.json, capabilities) for a single `if` check. `navigator.platform` is sufficient for a desktop app targeting macOS and Windows only.

### Installation (if OS plugin chosen)

```bash
npm run tauri add os
# or manually:
# Cargo.toml: tauri-plugin-os = "2"
# lib.rs: .plugin(tauri_plugin_os::init())
# capabilities: "os:default"
# npm: npm install @tauri-apps/plugin-os
```

## Architecture Patterns

### Recommended Approach: pendingUpdate State in AppContent

The update check lives in `AppContent` in `App.tsx` — the same component that owns `setShowSettings`. This avoids threading the update object through multiple component layers.

```
App.tsx (AppContent)
├── useEffect: setTimeout 4s → check() → setPendingUpdate(update)
├── pendingUpdate: Update | null  (state, not ref — needs to trigger render)
├── UpdateToast rendered when pendingUpdate !== null
│   ├── Install → setShowSettings(true) + dismissToast
│   └── Later → dismissToast (clear pendingUpdate)
└── SettingsView
    └── AboutSection (re-runs check() independently on button click)
```

**Why state not ref:** The toast must render when update is found. `useState` triggers a re-render; `useRef` does not. Store in `useState<Update | null>`.

**Why let AboutSection re-check:** The Update object from `check()` is not serializable as a plain prop — it's a Tauri plugin object with methods. Passing it through `SettingsProvider` callbacks would require significant refactoring. Letting the user click "Check for Updates" in About re-runs `check()` (which is fast if the manifest is cached) is simpler and sufficient.

### Pattern 1: Auto-Check with Delayed useEffect

```typescript
// Source: Tauri v2 updater docs + App.tsx existing pattern
import { check, type Update } from '@tauri-apps/plugin-updater'

// In AppContent:
const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

useEffect(() => {
  if (import.meta.env.DEV) return  // skip in dev (existing convention)
  const timer = setTimeout(async () => {
    try {
      const update = await check()
      if (update) {
        setPendingUpdate(update)
      }
    } catch (err) {
      console.warn('Auto update check failed:', err)
      // Silent — user can check manually in About
    }
  }, 4000)
  return () => clearTimeout(timer)
}, [])
```

**Key constraint:** NEVER call `update.downloadAndInstall()` here. Store only.

### Pattern 2: UpdateToast Component (new file)

The existing `Notification` component auto-dismisses and has no action buttons. A new component is needed.

```typescript
// src/components/UpdateToast.tsx
interface UpdateToastProps {
  version: string
  onInstall: () => void
  onLater: () => void
}
```

CSS follows `notification` class conventions from `Notification.css`:
- Same position: `fixed; top: 16px; right: 16px; z-index: 10000`
- Same backdrop blur, border, bg-elevated
- `notification--info` color variant (accent top glow)
- No countdown bar (user action required, not auto-dismiss)
- Slide-in animation reuse

**Install button action:**
```typescript
onInstall={() => {
  setPendingUpdate(null)           // dismiss toast
  setShowSettings(true)            // navigate to Settings
  setSelectedFolder(null)
  setSelectedPlaylistId(null)
  setShowAllTracks(false)
  setShowSearch(false)
  // AboutSection will re-run check() when user clicks "Check for Updates"
}}
```

### Pattern 3: Platform-Conditional relaunch() (in SettingsContext handleCheckForUpdates)

The existing `handleCheckForUpdates` in `SettingsContext.tsx` already calls `relaunch()` unconditionally. Phase 22 requires making it conditional:

```typescript
// Current (line 571-573):
if (restartNow) {
  await relaunch()
}

// Target:
if (restartNow) {
  const isWindows = navigator.platform.startsWith('Win')
  if (!isWindows) {
    await relaunch()
  }
  // Windows: NSIS auto-exits the process after install; relaunch() would crash
}
```

Source: Tauri v2 updater docs — "The application is automatically exited when the install step is executed due to a limitation of Windows installers."

### Anti-Patterns to Avoid

- **Auto-installing on launch:** The old commented-out code called `downloadAndInstall()` in the startup `useEffect`. Phase 22 explicitly forbids this. `check()` only.
- **Calling `relaunch()` on Windows after install:** NSIS terminates the process automatically; calling `relaunch()` after install on Windows causes a crash or error.
- **Passing the `Update` object as a prop through SettingsProvider:** The Tauri `Update` object contains internal plugin state and is not a plain serializable value. Keep it in `AppContent` state or discard it when navigating to Settings.
- **Not guarding with `import.meta.env.DEV`:** The existing codebase guards all updater code with this check (lines 252 and 270). Phase 22 must do the same to avoid spurious network calls during development.
- **Using a ref instead of state for pendingUpdate:** `useRef` does not trigger re-renders. The toast will never appear if the update is stored only in a ref.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update availability check | Custom GitHub API polling | `check()` from `@tauri-apps/plugin-updater` | Already handles signature verification, version comparison, endpoint fetch |
| Platform detection | Custom Rust command | `navigator.platform` or `@tauri-apps/plugin-os` | One-liner; no custom IPC needed |
| Auto-dismiss toast timing | Custom timer in component | CSS animation (existing `notifCountdown` pattern) or omit for action-required toast | Existing pattern; action-required toast should not auto-dismiss |
| Download/install UI | Custom download manager | Existing `handleCheckForUpdates` in `SettingsContext.tsx` | Already implemented with progress tracking, restart prompt, error handling |

## Common Pitfalls

### Pitfall 1: Calling downloadAndInstall() in the Launch Check
**What goes wrong:** App downloads and installs immediately on launch without user consent. This is the exact bug the previous commented-out code had — plus potential macOS crashes.
**Why it happens:** Easy to copy the pattern from the About section's handler.
**How to avoid:** The launch `useEffect` calls `check()` only. `downloadAndInstall()` is only called inside `handleCheckForUpdates` in `SettingsContext`, which is user-initiated.
**Warning signs:** Any reference to `downloadAndInstall` or `relaunch` in the new `useEffect` in `App.tsx`.

### Pitfall 2: relaunch() on Windows Crashes
**What goes wrong:** After NSIS installs the update, the process has already been terminated by the installer. Calling `relaunch()` at that point either crashes or no-ops depending on timing.
**Why it happens:** The existing `handleCheckForUpdates` calls `relaunch()` unconditionally.
**How to avoid:** Guard with `!navigator.platform.startsWith('Win')`. The NSIS installer auto-exits; Windows users get the new version on next manual launch.
**Warning signs:** Windows test after update shows error dialog or double-launch.

### Pitfall 3: Toast Never Appears (ref instead of state)
**What goes wrong:** `check()` returns an update but the toast is never rendered.
**Why it happens:** Storing `pendingUpdate` in `useRef` instead of `useState`.
**How to avoid:** Use `useState<Update | null>(null)` — state triggers re-renders, refs do not.

### Pitfall 4: Multiple Auto-Check Runs
**What goes wrong:** `useEffect` dependency array includes something that changes, causing `check()` to run multiple times on launch.
**How to avoid:** Pass empty dependency array `[]` to the update-check `useEffect`. The `setTimeout` is cleaned up on unmount.

### Pitfall 5: Toast Blocks Settings Navigation
**What goes wrong:** The toast remains visible after navigating to Settings, overlapping the UI.
**How to avoid:** `onInstall` and `onLater` both call `setPendingUpdate(null)` before any navigation action. The toast should not be rendered when `pendingUpdate === null`.

### Pitfall 6: Existing Notification Component Used for Update Toast
**What goes wrong:** The existing `Notification` component auto-dismisses after 4 seconds and has no action buttons. If it's used for the update toast, the Install button can't be added without modifying the component.
**How to avoid:** Create a separate `UpdateToast` component. Do NOT modify the existing `Notification` component — it's used throughout the app for simple info/success/warning/error messages.

## Code Examples

### check() API (verified from official docs and existing SettingsContext.tsx usage)
```typescript
// Source: https://v2.tauri.app/plugin/updater/
import { check, type Update } from '@tauri-apps/plugin-updater'

const update: Update | null = await check()
// update.version — new version string e.g. "1.3.0"
// update.body — release notes (string | null)
// update.date — RFC 3339 date string
// update.downloadAndInstall(progressCb?) — download + install (NOT called in auto-check)
```

### relaunch() conditional (Windows NSIS behavior)
```typescript
// Source: https://v2.tauri.app/plugin/updater/ — "automatically exited on Windows"
import { relaunch } from '@tauri-apps/plugin-process'

const isWindows = navigator.platform.startsWith('Win')
if (!isWindows) {
  await relaunch()
}
// Windows: NSIS auto-exits — no relaunch needed
```

### DEV mode guard (existing App.tsx pattern)
```typescript
// Source: App.tsx line 252 (existing convention)
useEffect(() => {
  if (import.meta.env.DEV) return
  // ...check()
}, [])
```

### UpdateToast render in AppContent
```tsx
{/* Update available toast */}
{pendingUpdate && (
  <UpdateToast
    version={pendingUpdate.version}
    onInstall={() => {
      setPendingUpdate(null)
      setShowSettings(true)
      setSelectedFolder(null)
      setSelectedPlaylistId(null)
      setShowAllTracks(false)
      setShowSearch(false)
    }}
    onLater={() => setPendingUpdate(null)}
  />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto-install on launch (commented out in App.tsx) | check()-only on launch; user-initiated install | Phase 22 | No surprise installs; no macOS crash |
| Unconditional `relaunch()` | `relaunch()` guarded by `!isWindows` | Phase 22 | Windows compatibility |
| Single `Notification` component for all toasts | Separate `UpdateToast` for action-button toasts | Phase 22 | Existing Notification stays simple; UpdateToast handles Install/Later |

**Deprecated/outdated:**
- The commented-out auto-update block in `App.tsx` (lines 251–270): Will be replaced by the new `useEffect` that calls `check()` only.

## Open Questions

1. **Should `UpdateToast` auto-dismiss after a long timeout (e.g. 30s)?**
   - What we know: The success criteria says "dismissible toast" — dismiss is possible via Later. Auto-dismiss is not mentioned.
   - What's unclear: Whether auto-dismiss after e.g. 60 seconds is desirable UX.
   - Recommendation: No auto-dismiss. The user explicitly chose "Install" or "Later". An untouched toast persisting until the next launch is fine for a small-audience app.

2. **Should the Update check be retried if it fails?**
   - What we know: Phase 22 success criteria only says "on launch". No retry requirement.
   - Recommendation: No retry. Silent `console.warn` on failure. User can check manually in About.

3. **Should `pendingUpdate` survive navigation to Settings and back?**
   - What we know: It's state in `AppContent`, which never unmounts.
   - Recommendation: Yes — state persists. If user dismisses the toast via Later and then goes to Settings > About and checks manually, that is a separate user-initiated flow.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no automated test framework detected in project) |
| Config file | N/A |
| Quick run command | `npm run build -- 2>&1 \| tail -20` (TypeScript compile check) |
| Full suite command | `npm run build -- 2>&1 \| tail -20` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UCHK-01 | `check()` called after 3-5s delay on launch; never calls `downloadAndInstall()` | code inspection | `grep -n "downloadAndInstall" src/App.tsx` (must be zero matches in new useEffect) | ✅ (App.tsx) |
| UCHK-02 | `UpdateToast` renders with Install + Later buttons when update available | manual smoke | Launch built app; mock update via `latest.json` pointing to higher version | ❌ Wave 0 (new component) |
| UCHK-03 | Install button opens Settings view | code inspection + manual | `grep -n "setShowSettings" src/components/UpdateToast.tsx` | ❌ Wave 0 (new component) |

### Sampling Rate
- **Per task commit:** `npm run build -- 2>&1 | tail -20` (TypeScript check)
- **Per wave merge:** Same (no test framework)
- **Phase gate:** TypeScript build clean + manual smoke in built app

### Wave 0 Gaps
- [ ] `src/components/UpdateToast.tsx` — new component, covers UCHK-02, UCHK-03
- [ ] `src/components/UpdateToast.css` — styles matching `Notification.css` conventions

*(No test framework to install — project has no existing test infrastructure)*

## Sources

### Primary (HIGH confidence)
- https://v2.tauri.app/plugin/updater/ — `check()` API, `Update` object properties, Windows NSIS auto-exit behavior, `relaunch()` guidance
- `src/components/settings/SettingsContext.tsx` (read directly) — existing `handleCheckForUpdates` pattern, `check()` import, `relaunch()` usage, `UpdateProgress` type
- `src/App.tsx` lines 247–270 (read directly) — existing commented-out auto-update block showing prior attempt, `DEV` guard convention, `notification` state shape
- `src/components/Notification.tsx` + `Notification.css` (read directly) — existing toast component; confirmed no action-button support; CSS conventions for new component

### Secondary (MEDIUM confidence)
- `navigator.platform` browser API — returns `"Win32"` on Windows, confirmed in multiple community sources; adequate for macOS vs Windows branch
- https://v2.tauri.app/plugin/os-info/ — OS plugin alternative; verified `platform()` returns `"windows"` / `"macos"`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `check()` and `relaunch()` imports already in use in project, APIs directly read from codebase
- Architecture: HIGH — `App.tsx` render pattern and `setShowSettings` navigation mechanism read directly; `UpdateToast` design follows existing `Notification` conventions
- Pitfalls: HIGH — auto-install crash documented in code comments; Windows NSIS behavior from official Tauri docs
- Platform detection: MEDIUM — `navigator.platform` verified as working in Tauri WebView via community sources; `tauri-plugin-os` is the authoritative approach but adds installation overhead

**Research date:** 2026-03-14
**Valid until:** 2026-06-14 (Tauri v2 updater API is stable)
