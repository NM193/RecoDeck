---
phase: 22-auto-check-toast
plan: 01
subsystem: ui
tags: [tauri, updater, toast, react, windows]

# Dependency graph
requires:
  - phase: 21-updater-config
    provides: tauri.conf.json updater configuration with v2 artifacts enabled
provides:
  - UpdateToast component (version, onInstall, onLater props) with no auto-dismiss
  - Auto-check useEffect in App.tsx (4s delay, check-only, DEV guard)
  - Windows relaunch guard in SettingsContext.tsx via navigator.platform check
affects:
  - Any future update-notification phases
  - SettingsContext.tsx (relaunch behavior changed for Windows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "check-only update flow: check() on launch, route to Settings for install — never auto-install"
    - "platform guard pattern: navigator.platform.startsWith('Win') before relaunch()"
    - "CSS grid layout for toast with icon+message row and action button row"

key-files:
  created:
    - src/components/UpdateToast.tsx
    - src/components/UpdateToast.css
  modified:
    - src/App.tsx
    - src/components/settings/SettingsContext.tsx

key-decisions:
  - "check-only in App.tsx: no downloadAndInstall() ever called from the auto-check flow — install routed to Settings > About"
  - "4s delay for auto-check to avoid blocking UI startup sequence"
  - "Windows relaunch guard: NSIS auto-exits process after install, so relaunch() crashes on Windows — show message only"
  - "No auto-dismiss on UpdateToast: user must make an explicit choice (Install or Later)"

patterns-established:
  - "UpdateToast: reuses notifSlideIn keyframe from Notification.css without redefining it"

requirements-completed: [UCHK-01, UCHK-02, UCHK-03]

# Metrics
duration: 15min
completed: 2026-03-14
---

# Phase 22 Plan 01: Auto-Check Toast Summary

**Silent update check on launch shows dismissible UpdateToast with Install/Later buttons; Install routes to Settings > About where the existing download/install flow handles the rest**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-14T17:00:00Z
- **Completed:** 2026-03-14T17:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created UpdateToast component styled to match Notification.css conventions (accent top glow, backdrop blur, slide-in animation)
- Wired check-only useEffect in App.tsx: fires after 4s delay with DEV guard, sets pendingUpdate state, never calls downloadAndInstall()
- UpdateToast Install button navigates to Settings by calling setShowSettings(true) and resetting all view state
- Added Windows relaunch guard in SettingsContext.tsx: NSIS installers auto-exit the process, so relaunch() is skipped on Windows

## Task Commits

Each task was committed atomically:

1. **Task 1: Create UpdateToast component** - `a674d4e` (feat)
2. **Task 2: Wire auto-check useEffect and Windows relaunch guard** - `e1691d6` (feat)

## Files Created/Modified
- `src/components/UpdateToast.tsx` - Toast component with version, onInstall, onLater props; no auto-dismiss
- `src/components/UpdateToast.css` - Grid layout toast matching Notification.css visual style; reuses notifSlideIn keyframe
- `src/App.tsx` - Added check() import, UpdateToast import, pendingUpdate state, 4s useEffect, JSX render
- `src/components/settings/SettingsContext.tsx` - Windows guard wraps relaunch() with navigator.platform check

## Decisions Made
- **check-only approach**: App.tsx only calls check(), never downloadAndInstall(). The existing Settings > About handler does the actual download with progress display and restart dialog. This avoids silent installs and macOS crashes.
- **4s delay**: Gives the UI time to fully render and the splash screen to clear before network activity.
- **No auto-dismiss on toast**: Update notification requires user intent — accidentally closing it would be worse than the mild friction of an explicit "Later" button.
- **Windows relaunch guard**: NSIS (the Windows installer) automatically exits the process after installing. Calling relaunch() after NSIS runs would try to restart an already-dead process and crash. The guard shows an informational message instead.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled cleanly on first attempt, full production build passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Update notification feature is complete end-to-end
- Users will see the toast on next launch when an update is available
- Install button routes correctly to Settings > About where download and restart is handled
- Windows install path is crash-safe

## Self-Check: PASSED

- FOUND: src/components/UpdateToast.tsx
- FOUND: src/components/UpdateToast.css
- FOUND commit: a674d4e (Task 1)
- FOUND commit: e1691d6 (Task 2)

---
*Phase: 22-auto-check-toast*
*Completed: 2026-03-14*
