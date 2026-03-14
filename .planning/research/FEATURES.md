# Feature Research

**Domain:** In-app update notifications and "What's New" changelog — Tauri v2 desktop app (RecoDeck v1.6)
**Researched:** 2026-03-14
**Confidence:** HIGH (infrastructure partially in place; patterns well-established; macOS crash confirmed via upstream issues)

---

## Context: What Already Exists

Before mapping features, it is critical to understand what the codebase has already shipped. This milestone is not "build from scratch" — it is narrowing known gaps.

| Component | State | Notes |
|-----------|-------|-------|
| `tauri-plugin-updater = "2"` in Cargo.toml | Installed | Plugin available, no Cargo changes needed |
| `plugins.updater` with endpoint + pubkey in tauri.conf.json | Configured | Points to GitHub Releases `latest.json`; signing key in place |
| `createUpdaterArtifacts: "v1Compatible"` in tauri.conf.json | Configured | Signed updater artifacts generated on release |
| `WhatsNewDialog.tsx` | Exists | Modal showing version + flat `changes: string[]`, plus inline update-and-restart flow |
| `getChangesForVersion()` in `src/lib/changelog.ts` | Exists | Parses `CHANGELOG.md` (Keep a Changelog format) into flat bullet list; does NOT distinguish Added/Changed/Fixed |
| `last_seen_version` setting check in `initializeApp()` | Exists | Compares stored version to `appPackage.version`; shows dialog if different; already saves the key after check |
| `handleCheckForUpdates()` in `SettingsContext.tsx` | Exists | Manual check from About section; download progress bar; deferred restart dialog via `ask()` |
| Startup auto-check | Disabled | Commented out in `App.tsx` (lines 251-269) with explicit note: "tauri-plugin-updater has known crash issues on macOS (cross-device link, restart failures). Re-enable when upstream is fixed." |
| `CHANGELOG.md` | Exists | Keep a Changelog format with `### Added / Changed / Fixed` subsections per version |
| `Notification.tsx` toast | Exists | Used for analysis complete, folder remove, etc. Supports info/success/warning/error types |
| `HeaderNotification.tsx` | Exists | Typing-animation text inline with the logo; used for AI status messages |

The milestone gaps are:
1. Re-enabling startup auto-check safely — the crash is during `downloadAndInstall()`, not `check()`. Safe pattern: `check()` on launch, store result, show notification; do NOT auto-install.
2. Replacing the flat changes list in `WhatsNewDialog` with categorized sections (New / Fixes / Changes).
3. Updating `getChangesForVersion()` to return structured `{ added, changed, fixed }` instead of a merged `string[]`.
4. Wiring a non-intrusive update-available toast or banner into the startup flow (separate from the "What's New" modal).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any maintained desktop app. Missing these = product feels unpolished or unmaintained.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auto-check for updates on launch | Every maintained desktop app does this (VS Code, Slack, Spotify) | LOW | Already structured; only blocked by the macOS crash. Safe fix: call `check()` only, store the result, never auto-install in the check path. |
| Non-blocking update check (no UI freeze) | Users tolerate background checks; foreground hangs feel broken | LOW | Existing pattern uses `setTimeout` delay + async `check()`. The delay must stay (3-5s after launch) so it does not compete with `initializeApp()`. |
| "Update available" notification that does not interrupt work | Users should be informed but not forced to stop | LOW | `Notification.tsx` toast is the right vehicle. Message: "RecoDeck v1.x is available. Install in Settings." |
| Install + restart flow with deferred option | Standard pattern — forcing immediate restart is hostile to DJ session flow | LOW | Already implemented in `handleCheckForUpdates()` via `ask()` dialog with "Restart Now" / "Later". |
| "What's New" modal on first launch after update | Sets expectation that the app improved; prevents "what changed?" confusion | LOW | Already exists via `last_seen_version` tracking. Gap is flat list vs categorized sections. |
| Version number visible in settings | Users need to know what they have to report bugs | LOW | Already in `AboutSection.tsx`. No changes needed. |
| Manual "Check for Updates" button | Power users want on-demand check | LOW | Already in `AboutSection.tsx`. No changes needed. |
| Silent skip when no changelog entries for a version | Avoids empty modal on patch releases | LOW | Already guarded: `if (changes.length > 0)` in `initializeApp()`. Keep this guard when changing the type. |

### Differentiators (Competitive Advantage)

Features that go beyond the minimum and reinforce RecoDeck's craft quality for the DJ audience.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Categorized changelog in "What's New" modal (New / Fixes / Changes) | Clearer at a glance than a flat bullet dump; DJ users scan fast | LOW | Update `getChangesForVersion()` return type to `{ added: string[], changed: string[], fixed: string[] }`; update `WhatsNewDialog.tsx` to render three sections. |
| Section headers with icons in "What's New" | Adds visual scanning landmarks matching RecoDeck's existing aesthetic | LOW | Use existing `Icon` component (sparkle or `Plus` for New, `Wrench` for Fixes, `ArrowLeftRight` for Changes). Pure UI addition. |
| Typing-animation header notification for update available | Matches existing `HeaderNotification` pattern; feels native to RecoDeck | LOW | Use `HeaderNotification.tsx` as an optional update-available signal. Set after `check()` resolves with an available update. Clears after a few seconds; toast persists separately. |
| Download progress bar during install | Users know something is happening; avoids "is it frozen?" anxiety | LOW | Already implemented in both `WhatsNewDialog.tsx` and `SettingsContext.tsx`. Keep as-is. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-download and auto-install without user consent | "Seamless" feel | Unexpected app restart mid-session destroys DJ flow; users lose unsaved queue, analysis in progress. macOS crash (`cross-device link` OS error 18) also occurs during `downloadAndInstall()`. | Notify with toast; let user initiate install from Settings > About or inline CTA. |
| Modal dialog blocking app launch until update decision | Ensures visibility | DJ apps are opened quickly before a set; blocking on update is hostile. | Toast/banner notification; user acts when ready. |
| Full release notes fetched from remote URL at runtime | Always fresh | Requires network; fails offline; adds latency to "What's New" display at startup. | Bundle `CHANGELOG.md` at build time (already done via `?raw` import in `changelog.ts`). This is the correct approach — keep it. |
| OS-level notification (system tray popup) for updates | Visible even when app is backgrounded | Requires `tauri-plugin-notification` (additional permission), platform-specific behavior, overkill for a small-audience app. | In-app toast is sufficient. |
| Silent background install (no user feedback) | "Just works" feeling | Users do not know why the app restarted; can feel like a crash. | Always show progress and explicit restart prompt. |
| Forced update (block app if not on latest) | Security or compatibility enforcement | Not relevant for a personal DJ tool; creates friction before a set. | Soft notification only. Never block. |
| Separate "Update History" view listing all past versions | Power user request | High maintenance; CHANGELOG.md already serves this role. | Surface a "View full changelog" link or show last 2 versions in the About section. Future consideration. |

---

## Feature Dependencies

```
[Safe startup auto-check]
    └──requires──> [call check() only — NOT downloadAndInstall() in check path]
                       (avoids macOS cross-device link crash in plugin-updater)
    └──produces──> [Update object stored in React state or ref]

[Update-available toast]
    └──requires──> [Safe startup auto-check result]
    └──reuses──> [Notification.tsx] (already in App.tsx state)
    └──optionally triggers──> [HeaderNotification.tsx typing animation]

[Categorized "What's New" modal]
    └──requires──> [Updated getChangesForVersion() returning { added, changed, fixed }]
                       └──parses──> [CHANGELOG.md ### Added / Changed / Fixed subsections]
    └──requires──> [Updated WhatsNewDialog.tsx accepting categorized props]
    └──reuses──> [last_seen_version tracking in initializeApp()] (already works)

[Install + deferred restart]
    └──requires──> [User action from toast CTA or Settings > About]
    └──reuses──> [handleCheckForUpdates() in SettingsContext.tsx] (already implemented)
    └──uses──> [update.downloadAndInstall() from plugin-updater]
    └──uses──> [relaunch() from plugin-process]

[What's New modal — ordering]
    └──should show before──> [Update-available toast]
    (first show what changed in the version just installed, then notify about the next one)
```

### Dependency Notes

- **Safe check vs install split is the core architectural decision:** The macOS crash (`cross-device link`, OS error 18) is triggered during `downloadAndInstall()`, not during `check()`. The safe pattern is: call `check()` on launch → store the `Update` object in a ref → show a toast → user navigates to Settings > About and clicks "Check for Updates" (which already handles download + install safely). Alternatively, the toast can have an "Install" CTA that directly calls `update.downloadAndInstall()` — but this path must be user-initiated, not auto-triggered.

- **Categorized parser is a breaking type change:** `getChangesForVersion()` currently returns `string[]`. Changing the return type to `{ added: string[], changed: string[], fixed: string[] }` requires updating every caller: `WhatsNewDialog.tsx` (props change from `changes: string[]` to structured type), and the `setWhatsNew()` call in `initializeApp()`. Both callers are in the same two files, so the blast radius is small.

- **"What's New" modal and update-available toast can coexist on the same launch:** They are triggered by different conditions. The modal fires if `last_seen_version !== currentVersion` (user just ran the updated version for the first time). The toast fires if `check()` finds a newer version available (next update is ready). Order matters: show the modal first (it is about what was just installed), then show the toast after the modal is dismissed or after a delay.

- **`last_seen_version` tracking is already correct:** The setting is saved unconditionally after the check, even if no changelog entries are found. The guard `if (changes.length > 0)` only controls whether the modal is shown. This is the right behavior — keep it.

---

## MVP Definition

### Launch With (v1.6)

The minimum set of changes to make the milestone complete and reliable.

- [ ] **Safe startup update check** — uncomment the `check()` call in `App.tsx`; remove `downloadAndInstall()` from the auto-check path; store the result; show a toast notification if an update is found. Skip auto-install in this path entirely.
- [ ] **Update-available toast** — reuse `Notification.tsx` with type `info` and message like "RecoDeck v1.x available. Install in Settings > About." Duration should be longer than the default (e.g., 8-10s) since it requires user action.
- [ ] **Categorized "What's New" modal** — update `getChangesForVersion()` to return `{ added, changed, fixed }`; update `WhatsNewDialog.tsx` to render three labeled sections. Empty sections are not rendered.
- [ ] **version tracking unchanged** — `last_seen_version` logic in `initializeApp()` already works. Update only the call site to pass the new structured type to `setWhatsNew()`.
- [ ] **Existing manual check/install in Settings > About unchanged** — it already handles `downloadAndInstall()` safely with progress bar and deferred restart. No regression here.

### Add After Validation (v1.6.x)

Features to add once the core is working without regressions.

- [ ] **Section icons in "What's New"** — add `Icon` component glyphs next to each section header (`Plus`/sparkle for Added, `Wrench` for Fixed, `ArrowLeftRight` for Changed). Purely visual; no behavior change.
- [ ] **Inline "Install Update" CTA in toast** — a secondary action button in the update-available toast that navigates to Settings > About. Reduces the "go find the button" friction. Requires a slightly wider toast or a separate action row.

### Future Consideration (v2+)

- [ ] **Background silent download then prompt** — download the update in the background without showing the progress bar, then prompt "Update ready — restart when convenient?". Reduces perceived install time. Blocked until the macOS `cross-device link` bug is fixed upstream in `tauri-plugin-updater`.
- [ ] **Per-version changelog archive in About section** — show the last 3 versions of changes inline. Deferred until changelog accumulates enough history to be worth the UI real estate.
- [ ] **"What's New" re-openable from Help or About** — let users re-read the changelog for the current version. Low priority; CHANGELOG.md on GitHub serves this role.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Safe startup update check (notify only, no auto-install) | HIGH | LOW | P1 |
| Update-available toast notification | HIGH | LOW | P1 |
| Categorized "What's New" modal (New / Fixes / Changes) | MEDIUM | LOW | P1 |
| Version tracking (already works) | HIGH | LOW — zero, exists | P1 |
| Manual install + deferred restart from About (already works) | HIGH | LOW — zero, exists | P1 |
| Section icons in "What's New" | LOW | LOW | P2 |
| Inline "Install" CTA in update toast | MEDIUM | LOW | P2 |
| Background download before prompt | MEDIUM | HIGH (macOS bug blocks) | P3 |
| OS-level tray notification | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.6 launch
- P2: Should have; add after P1 items verified
- P3: Nice to have; defer to v2+

---

## Competitor Feature Analysis

Reference apps for UX patterns (not direct competitors — RecoDeck is a niche DJ tool):

| Pattern | VS Code | Slack | RecoDeck v1.6 Approach |
|---------|---------|-------|------------------------|
| Update check timing | Background on launch; subtle status bar indicator | Background on launch; banner when ready | Background `check()` on launch (3-5s delay after `initializeApp()`); toast notification |
| Install timing | User clicks "Restart to Update" in status bar | User-initiated restart from banner | User-initiated from toast CTA or Settings > About |
| "What's New" trigger | Opens automatically on first launch after update | Shows "What's New" on first launch after update | `last_seen_version` comparison in `initializeApp()` — already this exact pattern |
| Changelog format | Categorized (New, Improvements, Bug Fixes) | Categorized with section icons | `### Added / Changed / Fixed` from CHANGELOG.md rendered with section headers and icons |
| Forcing updates | Never | Never | Never — deferred restart only, no blocking |
| Changelog source | Bundled in app | Fetched remotely | Bundled via `?raw` import — correct, works offline |

---

## Sources

- Tauri v2 updater plugin official docs: [https://v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/) — HIGH confidence
- macOS cross-device link crash (OS error 18) during update: [Issue #2458, tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace/issues/2458) — HIGH confidence (confirmed open issue, February 2025)
- App::restart failure after update on macOS: [Issue #11392, tauri-apps/tauri](https://github.com/tauri-apps/tauri/issues/11392) — HIGH confidence
- Toast notification UX best practices: [LogRocket UX Blog](https://blog.logrocket.com/ux-design/toast-notifications/), [Smashing Magazine design guidelines](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/) — MEDIUM confidence
- "What's New" modal and product update UX patterns: [Appcues — choosing the right UI pattern](https://www.appcues.com/blog/choosing-the-right-ui-pattern-for-your-product-update) — MEDIUM confidence
- Codebase: `src/components/WhatsNewDialog.tsx` — existing modal with flat list and inline update flow; HIGH confidence
- Codebase: `src/lib/changelog.ts` — existing parser returning `string[]`; HIGH confidence
- Codebase: `src/App.tsx` lines 247-270 — commented-out startup check with explicit crash annotation; HIGH confidence
- Codebase: `src/components/settings/SettingsContext.tsx` `handleCheckForUpdates()` — existing manual check with progress and deferred restart; HIGH confidence
- Codebase: `src-tauri/tauri.conf.json` — updater plugin configuration already in place; HIGH confidence

---

*Feature research for: RecoDeck v1.6 — in-app update notifications and "What's New" changelog*
*Researched: 2026-03-14*
