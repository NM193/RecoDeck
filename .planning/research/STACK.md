# Stack Research

**Domain:** In-app update notifications and "What's New" changelog — RecoDeck v1.6
**Researched:** 2026-03-14
**Scope:** NEW stack additions and changes ONLY for update notification and changelog features. Existing stack (Tauri v2, React 19, Rust, SQLite, Zustand, TailwindCSS 4, Framer Motion, Lucide React, bliss-audio-aubio-rs, Symphonia, Axum) is validated and NOT re-researched.
**Confidence:** HIGH

---

## Executive Summary

The v1.6 update notification milestone requires **zero new dependencies**. Every library needed is already installed and configured. The work is entirely implementation: wiring existing APIs correctly, fixing the disabled auto-update check, and refining the partially-built UI components.

The key discovery: `tauri-plugin-updater` (Rust crate + npm package) is installed in both `Cargo.toml` and `package.json`. The `tauri.conf.json` plugin block has the updater active with GitHub Releases endpoint and pubkey. The capabilities file grants `updater:default` and `updater:allow-check`. A `WhatsNewDialog` component exists. A `CHANGELOG.md` file exists with Keep-a-Changelog format. The `src/lib/changelog.ts` parser exists. Version tracking via `last_seen_version` setting key is implemented in `App.tsx`.

The auto-update check is **explicitly disabled** in `App.tsx` with a comment: `"tauri-plugin-updater has known crash issues on macOS (cross-device link, restart failures). Re-enable when upstream is fixed."` This is the primary blocker to address — not a missing dependency, but a known plugin bug that must be investigated to determine if it's been resolved in current plugin versions.

---

## Recommended Stack

### Core Technologies (All Already Installed — Zero Changes to Package Files)

| Technology | Version in Project | Purpose | Status |
|------------|-------------------|---------|--------|
| `tauri-plugin-updater` | `"2"` (Cargo.toml) | Rust backend: checks GitHub endpoint, downloads + installs signed update artifacts | Already installed and configured in `tauri.conf.json` |
| `@tauri-apps/plugin-updater` | `^2.10.0` (package.json) | TypeScript API: `check()`, `update.downloadAndInstall()` with progress events | Already installed, already imported in `SettingsContext.tsx` and `WhatsNewDialog.tsx` |
| `@tauri-apps/plugin-process` | `^2` (package.json) | TypeScript API: `relaunch()` after update installs | Already installed, used in both update code paths |
| `tauri-plugin-process` | `"2"` (Cargo.toml) | Rust backend for process restart | Already installed |
| `@tauri-apps/api/app` | part of `@tauri-apps/api ^2` | `getVersion()` — reads current app version at runtime | Already used in `SettingsContext.tsx` |
| `@tauri-apps/plugin-dialog` | `^2.6.0` | `ask()` native dialog for "Restart Now / Later" prompt | Already installed, already used in update flows |
| Framer Motion | `^11.0.0` | Toast banner animation (slide-in/slide-out) | Already installed, used throughout app |
| Lucide React | `^0.564.0` | Icons for update toast (Download, RefreshCw, X) | Already installed, used via `Icon` component wrapper |

### Supporting Infrastructure (Already in Place)

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `CHANGELOG.md` | `/CHANGELOG.md` | Keep-a-Changelog format, parsed at build time via Vite `?raw` import | Exists with entries from v0.1.0 through v0.2.5 |
| `src/lib/changelog.ts` | `src/lib/changelog.ts` | Parses `CHANGELOG.md`: `getChangesForVersion(version)` → `string[]` | Exists, imported in `App.tsx` |
| `WhatsNewDialog.tsx` | `src/components/WhatsNewDialog.tsx` | Modal showing version changes + manual update trigger | Exists, needs categorized changelog (new/fixes/changes) |
| `Notification.tsx` | `src/components/Notification.tsx` | Toast component with `info/success/warning/error` types, auto-dismiss | Exists, used by App.tsx notification system |
| `last_seen_version` setting | SQLite settings table via `get_setting`/`set_setting` | Detects first launch after update to show What's New | Already implemented in `App.tsx` `initializeApp()` |
| `generate-update-manifest.js` | `scripts/generate-update-manifest.js` | Generates `latest.json` for GitHub Releases | Exists, macOS-only — needs Windows platform key support |
| Updater capabilities | `src-tauri/capabilities/default.json` | `updater:default`, `updater:allow-check`, `process:allow-restart` | Already granted |
| `tauri.conf.json` updater config | `src-tauri/tauri.conf.json` | `active: true`, endpoint, pubkey, `dialog: true` | Already configured |

---

## The One Blocker to Resolve: Disabled Auto-Update Check

In `App.tsx`, the on-launch update check is fully commented out with this note:

```typescript
// NOTE: Temporarily disabled - tauri-plugin-updater has known crash issues on macOS
// (cross-device link, restart failures). Re-enable when upstream is fixed.
```

This is the central issue for v1.6. The `dialog: true` flag in `tauri.conf.json` currently means Tauri's **built-in native dialog** handles the update prompt — which bypasses the custom React toast/banner UI. To implement the custom Install/Later toast, `dialog` must be set to `false` and the check must be done in JavaScript using `check()` from `@tauri-apps/plugin-updater`.

**Resolution path:**
1. Check if the crash issue is fixed in `@tauri-apps/plugin-updater ^2.10.0` (the version already installed) by reviewing the plugin's changelog
2. If resolved: re-enable the JS check with `dialog: false` in `tauri.conf.json`, implement the custom toast banner
3. If not resolved: implement a safe wrapper with error boundaries, or use the `dialog: true` flow (native prompt) and focus effort on the What's New modal instead

The manual "Check for Updates" button in Settings (`SettingsContext.tsx` `handleCheckForUpdates()`) already works correctly with `check()` + `downloadAndInstall()` — the issue is specifically the auto-check on startup.

---

## Architecture of the Update Flow (Using Existing Pieces)

```
App startup (initializeApp)
    └─ check() from @tauri-apps/plugin-updater
        ├─ No update → silent (or "up to date" toast)
        └─ Update available
            └─ Show UpdateToast component (new, uses existing Notification infrastructure)
                ├─ "Install" → update.downloadAndInstall() with progress → ask() restart dialog
                └─ "Later" → dismiss toast, update queued for next launch
    └─ last_seen_version check (existing)
        └─ Version changed → show WhatsNewDialog (existing, needs category enhancement)
```

The `UpdateToast` is the one genuinely new React component needed. It follows the same pattern as `Notification.tsx` — a positioned overlay using CSS from the existing design system, animated with Framer Motion. It does NOT require new npm packages.

---

## `changelog.ts` Enhancement: Categorized Output

The current `getChangesForVersion()` returns `string[]` (flat list, strips `###` headers). The v1.6 spec requires categorized display (Added / Fixed / Changed). The enhancement stays in `src/lib/changelog.ts` — change return type to `ChangelogEntry[]`:

```typescript
// New return type — no new libraries needed
export interface ChangelogEntry {
  category: 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Other'
  items: string[]
}

export function getChangesForVersion(version: string): ChangelogEntry[]
```

This is a pure TypeScript change to an existing file. Vite's `?raw` import of `CHANGELOG.md` is already in use — no build configuration changes needed.

---

## `tauri.conf.json` Change Required

The `dialog: true` setting must change to `dialog: false` to use custom React UI instead of Tauri's native update dialog:

```json
// Current (blocks custom UI):
"plugins": {
  "updater": {
    "active": true,
    "dialog": true,
    ...
  }
}

// Required for v1.6 custom toast:
"plugins": {
  "updater": {
    "active": true,
    "dialog": false,
    ...
  }
}
```

No other configuration changes are needed. The endpoint URL and pubkey are already correct.

---

## `generate-update-manifest.js` Enhancement

The existing script only generates the `darwin-universal` platform key. To support Windows (from v1.5), it needs to accept a `windows-x86_64` platform and generate multi-platform `latest.json`. This is a Node.js script change — no npm package changes needed.

---

## Installation

No installation steps required. All dependencies are already present.

```bash
# Verify existing installations are correct
npm ls @tauri-apps/plugin-updater  # should show ^2.10.0
npm ls @tauri-apps/plugin-process  # should show ^2
grep "tauri-plugin-updater" src-tauri/Cargo.toml  # should show version "2"
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Use existing `Notification.tsx` pattern for update toast | Add a third-party toast library (react-hot-toast, sonner) | App already has a working toast component. Adding a library for one use case is unnecessary overhead and inconsistent with existing UI. |
| `CHANGELOG.md` with `?raw` Vite import | Separate `changelog.json` bundled as asset | `CHANGELOG.md` already exists and is the source of truth. The `?raw` import bundles it at build time. A JSON file would require keeping two formats in sync. |
| `dialog: false` + custom React toast | Keep `dialog: true` (native Tauri dialog) | The milestone spec requires custom Install/Later buttons in a toast banner. `dialog: true` bypasses all JS and shows an OS-native prompt that can't be customized. |
| `check()` on startup with 3s delay | Background polling / push notifications | Tauri updater is pull-based by design. One check on launch is the correct pattern — low overhead, no persistent background process. |
| Reuse existing `ask()` plugin-dialog for restart prompt | Custom restart confirmation in React | `ask()` is already used in both code paths and works correctly. No reason to replace it with a React modal for a destructive action like restarting. |

---

## What NOT to Add

| Avoid | Why | Already Available |
|-------|-----|-------------------|
| `react-hot-toast` or `sonner` | App has a working toast system in `Notification.tsx` | `src/components/Notification.tsx` + CSS |
| Separate `changelog.json` asset | `CHANGELOG.md` is already bundled via Vite `?raw` | `src/lib/changelog.ts` + `CHANGELOG.md` |
| New Rust command for version checking | `getVersion()` from `@tauri-apps/api/app` is sufficient | Already used in `SettingsContext.tsx` |
| New Tauri capability entries | `updater:default`, `updater:allow-check`, `process:allow-restart` already granted | `src-tauri/capabilities/default.json` |
| A semver comparison library | Simple string equality (`lastSeen !== currentVersion`) is correct for "first launch after update" detection | Native string comparison in `App.tsx` |
| `electron-updater` or any Electron patterns | This is a Tauri 2 app, not Electron | `tauri-plugin-updater` is the correct tool |

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| `@tauri-apps/plugin-updater` | `^2.10.0` | Installed. The startup crash bug (cross-device link on macOS) needs verification against this version's changelog before re-enabling auto-check. |
| `tauri-plugin-updater` (Rust) | `"2"` (resolves to latest 2.x) | Paired with the npm package — versions must match major. Both are `^2`, so they resolve compatibly. |
| `@tauri-apps/plugin-process` | `^2` | `relaunch()` — stable, no known issues |
| `tauri-plugin-process` (Rust) | `"2"` | Stable |
| Framer Motion | `^11.0.0` | `AnimatePresence` + `motion.div` for toast animation — already used in App.tsx |

---

## Sources

- `src-tauri/Cargo.toml` (direct read) — `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` confirmed present. HIGH confidence.
- `package.json` (direct read) — `@tauri-apps/plugin-updater ^2.10.0`, `@tauri-apps/plugin-process ^2` confirmed present. HIGH confidence.
- `src-tauri/tauri.conf.json` (direct read) — updater plugin block with `active: true`, endpoint, pubkey, `dialog: true`, `createUpdaterArtifacts: "v1Compatible"` confirmed. HIGH confidence.
- `src-tauri/capabilities/default.json` (direct read) — `updater:default`, `updater:allow-check`, `process:allow-restart` confirmed granted. HIGH confidence.
- `src/components/WhatsNewDialog.tsx` (direct read) — Component exists, uses `check()` + `downloadAndInstall()` + `relaunch()`. Needs categorized changelog enhancement. HIGH confidence.
- `src/lib/changelog.ts` (direct read) — `getChangesForVersion()` exists, uses `CHANGELOG.md?raw` Vite import, returns flat `string[]`. HIGH confidence.
- `CHANGELOG.md` (direct read) — Keep-a-Changelog format, entries from v0.1.0 through v0.2.5 present. HIGH confidence.
- `src/App.tsx` (direct read) — Auto-update check commented out with crash bug note. `last_seen_version` version tracking and `WhatsNewDialog` trigger already implemented. HIGH confidence.
- `src/components/settings/SettingsContext.tsx` (direct read) — `handleCheckForUpdates()` fully implemented with download progress. HIGH confidence.
- `src/components/settings/AboutSection.tsx` (direct read) — "Check for Updates" button and progress bar UI exist. HIGH confidence.
- `src/components/Notification.tsx` (direct read) — Toast component exists with `info/success/warning/error` types. HIGH confidence.
- [Tauri v2 Updater Plugin Docs](https://v2.tauri.app/plugin/updater/) — `check()`, `downloadAndInstall()`, `dialog` config option. HIGH confidence.

---

*Stack research for: RecoDeck v1.6 — In-app update notifications and What's New changelog*
*Researched: 2026-03-14*
