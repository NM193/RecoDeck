# Project Research Summary

**Project:** RecoDeck v1.6 — In-App Update Notifications and "What's New" Changelog
**Domain:** Tauri v2 desktop app update delivery; changelog UX for a DJ tool
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

RecoDeck v1.6 is not a greenfield feature — it is the completion of a partially-built update notification system. All required dependencies (`tauri-plugin-updater`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-dialog`) are already installed and configured. The `WhatsNewDialog` component, the `changelog.ts` parser, the `last_seen_version` version sentinel, the manual update check in Settings, and the `CHANGELOG.md` file all exist and are functional. The milestone is about closing three specific gaps: (1) re-enabling the startup auto-check safely, (2) wiring a non-blocking update-available toast instead of an intrusive auto-install, and (3) upgrading the "What's New" modal to display categorized changelog entries (Added / Fixed / Changed) instead of a flat bullet list.

The recommended approach is conservative and user-respecting: `check()` runs on launch after a 3-5 second delay, stores the `Update` object in a `useRef`, and surfaces a dismissible toast. Download and install only happen on explicit user action — either from the toast or from Settings > About, which already works. The "What's New" modal continues to fire on first launch after an update via the existing `last_seen_version` SQLite sentinel. The only type-level breaking change is `getChangesForVersion()` in `changelog.ts` changing from `string[]` to `{ added: string[], changed: string[], fixed: string[] }`, which has exactly two callers.

The primary risk is the macOS crash that caused the auto-check to be disabled (`cross-device link`, OS error 18 during `downloadAndInstall()`). Research confirms the crash is triggered during install, not during `check()`. The safe pattern — check-only on launch, user-initiated install — sidesteps the crash entirely for the auto-check path. Two config values in `tauri.conf.json` must change before any frontend work: `"dialog"` from `true` to `false` (otherwise the JS API receives nothing) and `"createUpdaterArtifacts"` from `"v1Compatible"` to `true` (deprecation cleanup). These are the first two implementation actions; skipping them causes silent failures.

## Key Findings

### Recommended Stack

Zero new dependencies are needed for this milestone. The update plugin ecosystem is fully installed. The `Notification.tsx` toast system, `Framer Motion` animations, and `Lucide React` icons are all present and reusable for the update-available banner. The one genuine new UI piece — an update-available toast with Install and Later actions — should follow the existing `Notification.tsx` pattern rather than introducing a third-party toast library.

**Core technologies (already installed, no changes needed):**
- `@tauri-apps/plugin-updater` v2.10.0: `check()` on launch, `downloadAndInstall()` on user action — already imported in `WhatsNewDialog.tsx` and `SettingsContext.tsx`
- `@tauri-apps/plugin-process` v2: `relaunch()` after install on macOS only (Windows auto-exits) — already used in both update paths
- `@tauri-apps/plugin-dialog`: `ask()` native restart prompt — already used in both update code paths
- `Framer Motion` v11: Toast slide-in animation — already used throughout the app
- `Notification.tsx`: Existing toast component — reuse for the update-available banner; no new library needed
- `changelog.ts` + `CHANGELOG.md?raw`: Bundled changelog parser — needs return type upgrade only; no build config changes

**Config changes required (not dependency changes):**
- `tauri.conf.json`: `"dialog": false` — enables JS API; current `true` silently kills all event handlers
- `tauri.conf.json`: `"createUpdaterArtifacts": true` — removes v1Compatible deprecation debt before any artifacts are published

### Expected Features

The milestone scope is narrow and all P1 features carry low implementation cost. Nothing requires new libraries or new Rust commands.

**Must have (table stakes — P1):**
- Safe startup update check (call `check()` only, never auto-install) — eliminates the macOS crash risk
- Update-available toast notification — non-blocking, dismissible, with Install and Later actions
- Categorized "What's New" modal (New / Fixes / Changes sections with icons) — replaces the existing flat bullet dump
- Version tracking via SQLite `last_seen_version` — already works, no changes needed
- Manual install + deferred restart from Settings > About — already works, no changes needed

**Should have (differentiators — P2, add after P1 verified):**
- Section icons in "What's New" (`Plus`/sparkle for Added, `Wrench` for Fixed, `ArrowLeftRight` for Changed)
- Inline "Install Update" CTA in the update toast (navigates to Settings > About to reduce friction)
- Suppress update toast during active audio playback (check `isPlaying` state before showing)

**Defer to v2+:**
- Background silent download before prompting (blocked by macOS bug until upstream fix in `tauri-plugin-updater`)
- Re-openable "What's New" from Help/About menu
- Per-version changelog archive inline in the About section
- OS-level system tray notification for updates

### Architecture Approach

The architecture is entirely in the React frontend layer — no new Rust commands are needed. State for the pending update lives in `AppContent` (`useRef<Update | null>` for the update object, `useState<string | null>` for the version string that triggers the toast). The `WhatsNewDialog` duplicate update button should be removed; it is the only piece that creates a second independent update code path. All install actions should route through `SettingsContext.handleCheckForUpdates()` or a shared callback passed down from `AppContent`. The `CHANGELOG.md` is bundled at Vite build time via `?raw` import — no network fetch, works offline.

**Major components:**
1. `App.tsx` `useEffect` (auto-check) — re-enable with 3s delay, `check()` only, store result in ref, set toast state on update found
2. `App.tsx` `initializeApp()` (What's New sentinel) — already works; update only the call site to pass the new structured type
3. `src/lib/changelog.ts` `getChangesForVersion()` — upgrade return type to `{ added: string[], changed: string[], fixed: string[] }`
4. `src/components/WhatsNewDialog.tsx` — render three labeled sections; remove the duplicate update button
5. `Notification.tsx` (reused as update toast) — add action buttons (Install, Later) via extended props or a thin wrapper
6. `SettingsContext.handleCheckForUpdates()` — unchanged; remains the canonical install handler
7. `tauri.conf.json` — `dialog: false` and `createUpdaterArtifacts: true` — two-line change, must land before any frontend work

### Critical Pitfalls

1. **`"dialog": true` silently kills the JS API** — The current `tauri.conf.json` has `dialog: true`. This causes Tauri to handle all update events via a native OS dialog and call none of the JavaScript event handlers. `check()` appears to return an object but the toast never fires. Fix: set `"dialog": false` as the first implementation step, before writing any frontend logic.

2. **macOS crash is from `downloadAndInstall()`, not `check()`** — The disabled auto-check code was calling `downloadAndInstall()` silently without user consent. The crash (`cross-device link`, OS error 18) occurs during install, not during the HTTP check. Safe path: `check()` on launch, toast, user-initiated install only. Never auto-install from the launch check.

3. **Windows auto-exits the app during install — `relaunch()` must not be called on Windows** — `downloadAndInstall()` causes the NSIS installer to kill the running process on Windows. Calling `relaunch()` afterward either throws or races the installer. Use `import { platform } from '@tauri-apps/plugin-os'` and only call `relaunch()` on macOS/Linux.

4. **Private key loss permanently breaks updates for all installed users** — The Tauri signing key must be stored in a password manager (not only as a CI secret). If lost, existing users can never receive automatic updates. Additionally, `vite.config.ts` must use `envPrefix: ['VITE_']` only — including `'TAURI_'` bundles `TAURI_SIGNING_PRIVATE_KEY` into the frontend (CVE-2023-46115).

5. **"What's New" modal fires on fresh install without a null guard** — If `last_seen_version` has never been set (new user, clean install), comparing `undefined !== currentVersion` is truthy and shows the modal immediately. Fix: only show if `last_seen_version` exists AND differs from current version.

## Implications for Roadmap

Based on research, the build order has clear dependency constraints. Config changes must precede all frontend work; the macOS crash diagnosis must precede auto-check re-enablement; the changelog type change must precede the modal UI update.

### Phase 1: Updater Plugin Configuration and Unblocking

**Rationale:** `"dialog": true` silently disables the entire JS API — this is a two-line config change that must land before any frontend code is written or tested. `"v1Compatible"` adds migration debt that is free to fix now and costly to fix after artifacts are published. This is also where key management and permission verification happen.
**Delivers:** A working `check()` call that returns an update object; confirmed `updater:default` permissions; signing key verified in CI and in a password manager; `createUpdaterArtifacts: true` preventing future migration pain.
**Addresses:** All P1 features depend on this as a prerequisite.
**Avoids:** Pitfall 1 (`dialog: true` blocking JS API), Pitfall 4 (key loss / CVE-2023-46115), capabilities permission pitfall.

### Phase 2: Safe Startup Auto-Check and Update-Available Toast

**Rationale:** The auto-check `useEffect` is already written and commented out in `App.tsx`. The fix is: remove `downloadAndInstall()` from the auto path, add `pendingUpdateRef`, add toast state, render the toast using `Notification.tsx`. This is the core user-facing deliverable of v1.6.
**Delivers:** On-launch update detection; non-blocking dismissible toast with Install and Later actions; deferred install via Settings > About when the user is ready.
**Uses:** `@tauri-apps/plugin-updater` `check()`, `Notification.tsx`, Framer Motion, `pendingUpdateRef` pattern.
**Implements:** Auto-check `useEffect` in `AppContent`; `pendingUpdateRef`; update-available state; toast render.
**Avoids:** Pitfall 2 (macOS crash from auto-install), Pitfall 6 (blocking startup with synchronous check), Windows auto-exit from calling `relaunch()`.

### Phase 3: Categorized "What's New" Modal

**Rationale:** This is a standalone TypeScript change (`getChangesForVersion()` return type upgrade) plus a UI update in `WhatsNewDialog.tsx`. It has no dependency on Phase 2 and can be developed in parallel, but the type change touches two callers and should be verified before adding Phase 5 polish on top.
**Delivers:** Structured changelog sections (Added / Fixed / Changed) in the "What's New" modal; removal of the duplicate update button from the modal; guard against the modal firing on a fresh install.
**Implements:** `getChangesForVersion()` return type; `WhatsNewDialog.tsx` three-section rendering; `initializeApp()` call-site update.
**Avoids:** Pitfall 5 (What's New on fresh install), duplicate update code path anti-pattern from ARCHITECTURE.md.

### Phase 4: CI Release Pipeline and Cross-Platform Manifest

**Rationale:** The `latest.json` currently contains only `darwin-aarch64`. The `generate-update-manifest.js` script must be extended for Windows before any Windows users (v1.5 milestone) can receive updates. This phase validates the end-to-end release workflow: sign, build, publish, check from an installed app.
**Delivers:** Multi-platform `latest.json` with correct `pub_date` (RFC 3339 format), platform entries for macOS and Windows; CI workflow that generates and publishes the manifest on release tag.
**Avoids:** `latest.json` missing platform entries pitfall; RFC 3339 date format rejection; signature field content vs file path mistake.

### Phase 5: Polish and Edge Cases

**Rationale:** After all P1 items are verified in production builds, add visual polish and UX refinements. All changes are purely additive — no risk of breaking Phase 2 or 3 behavior.
**Delivers:** Section icons in "What's New" modal; playback-aware toast deferral (suppress if `isPlaying`); inline "Go to Settings" CTA in the update toast.
**Addresses:** All P2 features from the FEATURES.md prioritization matrix.

### Phase Ordering Rationale

- Phase 1 before everything: `dialog: true` is a silent blocker. No JS update code is testable until this is `false`. Config debt has zero cost to fix now, high cost after shipping.
- Phase 2 before Phase 4: Need the auto-check working end-to-end to validate that `latest.json` is read and parsed correctly by the installed app.
- Phase 3 independent: The changelog type change is entirely TypeScript/React with no dependency on plugin behavior. It can be merged in any order relative to Phase 2.
- Phase 4 last in the main track: Requires a real GitHub Release to test end-to-end. All code logic must be correct before publishing artifacts that existing macOS users will receive.
- Phase 5 always last: Polish only after core behavior is verified on both macOS and Windows.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (CI pipeline):** The `generate-update-manifest.js` script is macOS-only. Extending it for Windows requires knowing the exact artifact filenames from the Tauri Windows build output (e.g., `RecoDeck_1.6.0_x64-setup.exe` + `.sig`). Research the Windows artifact naming convention against the Phase 17 Windows baseline build output before writing the manifest merge script.
- **Phase 2 (macOS crash verification):** Before re-enabling the auto-check, verify whether `@tauri-apps/plugin-updater` v2.10.0 patched the `cross-device link` crash (OS error 18). Check the plugin's v2.10.0 release notes against the GitHub issues linked in PITFALLS.md. If unpatched, the check-only pattern (no `downloadAndInstall()` in the auto path) is confirmed safe regardless.

Phases with standard patterns (skip research-phase):
- **Phase 1 (config changes):** Two-line change with unambiguous guidance from PITFALLS.md and official Tauri v2 docs. No open questions.
- **Phase 3 (changelog type upgrade):** Pure TypeScript refactor with two known callers in two files. Standard pattern; no library or API research needed.
- **Phase 5 (polish):** Additive UI work reusing the existing `Icon` component and design system. All patterns already in use elsewhere in the app.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All dependencies confirmed via direct `package.json` and `Cargo.toml` inspection. Zero new packages required. Config changes are two lines with explicit official documentation. |
| Features | HIGH | Codebase inspection confirmed precisely what exists vs what is missing. Upstream GitHub issues (tauri-apps/plugins-workspace #2458, tauri-apps/tauri #11392) confirm the macOS crash is real, current, and triggered by install not by check. |
| Architecture | HIGH | Direct codebase inspection of all relevant files. Component responsibilities and data flow are unambiguous. Both callers of the changed API are identified by file name. The build order is derived from concrete dependencies. |
| Pitfalls | HIGH | Critical pitfalls are grounded in direct config file inspection (`dialog: true` and `v1Compatible` confirmed present in the actual `tauri.conf.json`), cross-referenced with official Tauri docs and CVE-2023-46115. |

**Overall confidence:** HIGH

### Gaps to Address

- **macOS crash status in v2.10.0:** Research confirmed the crash exists and identified which call triggers it (`downloadAndInstall()`), but did not confirm whether v2.10.0 specifically patches it. During Phase 2 planning, check the `@tauri-apps/plugin-updater` changelog and test `check()` in a production build on macOS before re-enabling the `useEffect`. The check-only pattern is safe regardless — this gap only affects whether a future background-download feature is unblocked.
- **Windows artifact naming for `latest.json`:** The existing manifest script is macOS-only. Before Phase 4, determine the exact Tauri-generated artifact filename for the Windows NSIS installer. Cross-reference against the Windows build output from Phase 17's compilation baseline work.
- **Playback state access from `AppContent`:** Phase 5 toast deferral (suppress if `isPlaying`) requires reading Zustand player store state in `AppContent`. Confirm the store slice is accessible from that component without prop drilling before designing the deferral logic.

## Sources

### Primary (HIGH confidence)
- `src/App.tsx` — Disabled auto-check (lines 251-270 with explicit crash annotation), version sentinel in `initializeApp()` (lines 317-330)
- `src/components/WhatsNewDialog.tsx` — Existing modal with flat list and duplicate update button confirmed
- `src/lib/changelog.ts` — `getChangesForVersion()` returning `string[]` via `CHANGELOG.md?raw` confirmed
- `src/components/settings/SettingsContext.tsx` — `handleCheckForUpdates()` with download progress confirmed
- `src/components/settings/AboutSection.tsx` — "Check for Updates" button and progress bar UI confirmed
- `src-tauri/tauri.conf.json` — `"dialog": true` and `"createUpdaterArtifacts": "v1Compatible"` confirmed present
- `src-tauri/capabilities/default.json` — `updater:default`, `updater:allow-check`, `process:allow-restart` confirmed present
- `src-tauri/Cargo.toml` — `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` confirmed
- `package.json` — `@tauri-apps/plugin-updater ^2.10.0`, `@tauri-apps/plugin-process ^2` confirmed
- [Tauri v2 Updater Plugin Docs](https://v2.tauri.app/plugin/updater/) — `check()`, `downloadAndInstall()`, `dialog` config option behavior
- [Tauri v2 Updater JS API Reference](https://v2.tauri.app/reference/javascript/updater/)

### Secondary (MEDIUM confidence)
- [tauri-apps/plugins-workspace #2458](https://github.com/tauri-apps/plugins-workspace/issues/2458) — macOS cross-device link crash during update install (February 2025, confirmed open)
- [tauri-apps/tauri #11392](https://github.com/tauri-apps/tauri/issues/11392) — App::restart failure after update on macOS
- [tauri-apps/tauri #7169](https://github.com/tauri-apps/tauri/issues/7169) — Cross-device link (OS error 18) in updater restart
- [CVE-2023-46115](https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259) — Updater private key leak via Vite envPrefix
- Toast notification UX best practices — LogRocket, Smashing Magazine (applied to deferral-during-playback guidance)
- "What's New" modal UX patterns — Appcues blog (applied to fresh install guard guidance)

### Tertiary (LOW confidence)
- CrabNebula auto-updates guide for Tauri v2 — supplementary CI pipeline pattern reference

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
