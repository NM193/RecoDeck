# Pitfalls Research

**Domain:** Adding in-app update notifications and "What's New" changelog to an existing Tauri v2 desktop app (RecoDeck v1.6)
**Project:** RecoDeck v1.6 Update Notifications
**Researched:** 2026-03-14
**Confidence:** HIGH — derived from direct codebase inspection of `tauri.conf.json` + `capabilities/default.json`, cross-referenced against official Tauri v2 updater documentation, GitHub issue tracker, and security advisories

---

## Critical Pitfalls

### Pitfall 1: `"dialog": true` Silently Disables the Programmatic API

**What goes wrong:**
RecoDeck's current `tauri.conf.json` has `"dialog": true` in the updater plugin config. When `dialog` is `true`, the built-in native dialog intercepts all update events and the JavaScript API receives nothing. Calls to `check()`, `downloadAndInstall()`, and progress event listeners will never fire. The toast/banner and "What's New" modal will appear to do nothing even though the updater is technically running.

**Why it happens:**
Tauri v2 removed the built-in dialog in v2 stable, but the `dialog: true` config option persists as a v1-compatibility setting. Developers who either migrated from v1 or copied a configuration example that includes `dialog: true` will find the programmatic API dead. The failure is silent — no errors are thrown, the updater just handles everything itself via the native OS dialog and never calls your event handlers.

**How to avoid:**
Set `"dialog": false` in `tauri.conf.json` updater config before writing any JavaScript update logic:

```json
"plugins": {
  "updater": {
    "active": true,
    "dialog": false,
    "pubkey": "...",
    "endpoints": ["..."]
  }
}
```

The RecoDeck `tauri.conf.json` currently has `"dialog": true` — this must be changed to `false` as the first step of the implementation phase.

**Warning signs:**
- `check()` returns a non-null update object but no toast or modal appears
- Progress event handler in `downloadAndInstall()` is never called
- The app silently shows a native OS dialog at startup instead of your custom toast

**Phase to address:** Phase 1 (updater plugin integration) — change `dialog: false` before writing any frontend logic. If you write the frontend first you will spend hours debugging why events never fire.

---

### Pitfall 2: `createUpdaterArtifacts: "v1Compatible"` Will Break in Tauri v3

**What goes wrong:**
RecoDeck's `tauri.conf.json` currently sets `"createUpdaterArtifacts": "v1Compatible"`. The official Tauri v2 docs explicitly state: "the v1Compatible value will be removed in v3." This is a ticking migration cost — the next major Tauri upgrade will require changing the artifact format and regenerating the GitHub release manifest.

**Why it happens:**
The `"v1Compatible"` mode generates `.tar.gz` bundles in the older format for backward compatibility with v1 updater clients. Since RecoDeck has no existing v1 clients (it was built on Tauri v2 from the start), this value provides no benefit and only defers a forced migration.

**How to avoid:**
Change `"createUpdaterArtifacts"` from `"v1Compatible"` to `true` now, before publishing any update artifacts. The `true` value generates the modern v2 bundle format. Since no users currently have an installed version that knows the old format, there is no backward compatibility concern.

```json
"bundle": {
  "createUpdaterArtifacts": true
}
```

If this value has already been used to publish live updates, switching requires a transitional release (one build signed with old key, new value, then subsequent builds use new format).

**Warning signs:**
- Tauri CLI emits a deprecation warning about `v1Compatible` during `tauri build`
- After a Tauri v3 upgrade, `tauri build` fails with an unrecognized config value error

**Phase to address:** Phase 1 (updater plugin integration) — change this alongside `dialog: false` before the first artifact build. Zero cost to fix now; moderate migration cost later.

---

### Pitfall 3: Private Key Loss Permanently Breaks Updates for Installed Users

**What goes wrong:**
The Tauri updater requires cryptographic signing for every update artifact. The private key used to sign artifacts must match the public key embedded in the installed app. If the private key is lost, deleted, or accidentally rotated without a transitional release, existing installed users can never receive updates. The only recovery path is asking users to manually reinstall from scratch.

**Why it happens:**
Developers store `TAURI_SIGNING_PRIVATE_KEY` as a local environment variable or CI secret and assume it is safe. Common failure modes: accidentally deleting the `.key` file after a machine reset, rotating GitHub Actions secrets without preserving the old key first, or leaking the key via a Vite `envPrefix` misconfiguration (CVE-2023-46115: setting `envPrefix: ['VITE_', 'TAURI_']` in `vite.config.ts` bundles the private key into the frontend bundle).

**How to avoid:**
- Store the private key in a password manager (1Password, Bitwarden) as the primary backup — not only in CI secrets.
- Verify `vite.config.ts` uses `envPrefix: ['VITE_']` only, never `'TAURI_'`. The TAURI_ prefix would expose `TAURI_SIGNING_PRIVATE_KEY` to the frontend bundle.
- Never commit the `.key` file to git.
- Before publishing v1.6, document the key location in a personal secure note so it survives a machine wipe.
- If key rotation is ever needed: the transitional release (signed with old key) must first update the embedded public key to the new key. Only then can subsequent releases use the new private key.

**Warning signs:**
- CI build errors: `Error incorrect updater private key password` or `UnexpectedKeyId`
- `TAURI_SIGNING_PRIVATE_KEY` missing from CI environment on a new runner
- `vite.config.ts` contains `envPrefix: ['VITE_', 'TAURI_']`

**Phase to address:** Phase 1 (updater plugin integration) — verify key storage before the first artifact is published. Key management is a one-time setup that is catastrophic if skipped.

---

### Pitfall 4: Windows Auto-Exits on Install — No `relaunch()` Needed, and Unsaved State Is Lost

**What goes wrong:**
On Windows, when `update.downloadAndInstall()` completes, the NSIS/MSI installer automatically exits the running application before it finishes installing. Any in-memory state (current playback position, active track, Zustand store contents, Axum companion server connections) is destroyed without warning. If you call `relaunch()` after `downloadAndInstall()` on Windows, it either errors or relaunches into a race condition with the installer.

On macOS, the behavior is different: the app stays running after install completes and you call `relaunch()` explicitly to restart.

**Why it happens:**
The Windows installer (NSIS or MSI) requires the target process to be stopped before it can overwrite the app binary. Tauri handles this at the OS level. The Tauri docs note: "The application is automatically exited when the install step is executed due to a limitation of Windows installers." This is platform-specific behavior that is not obvious from the JavaScript API.

**How to avoid:**
Use the `on_before_exit` pattern (or its JS equivalent `onBeforeClose`) to flush any critical state before `downloadAndInstall()` is called on Windows:

```typescript
// Stop audio, flush Zustand state to SQLite, stop companion server
await stopAudio();
await flushPlayerState();
// Then install
await update.downloadAndInstall();
// On macOS only — on Windows the app is already dead here
await relaunch();
```

Detect the platform with `import { platform } from '@tauri-apps/plugin-os'` and only call `relaunch()` on macOS/Linux. Windows users will see the installer run and the app reopen automatically.

**Warning signs:**
- On Windows: app closes mid-download without showing the installer
- On Windows: `relaunch()` throws an error after `downloadAndInstall()`
- Audio keeps playing through a Windows update install (means the state flush is not running)

**Phase to address:** Phase 2 (download, install, and restart flow) — cross-platform install behavior must be handled before shipping. Test on both platforms; do not assume macOS behavior applies to Windows.

---

### Pitfall 5: Version Tracking for "What's New" Modal Uses Wrong Source of Truth

**What goes wrong:**
The most common pattern for detecting "first launch after update" is comparing the stored "last seen version" against the current app version. Two sub-pitfalls exist:

1. **Using the frontend to read `package.json` version**: If `import { getVersion } from '@tauri-apps/api/app'` is not used and instead `import pkg from '../../package.json'` is used, the version string is baked into the frontend bundle at build time and may not reflect the actual installed binary version in edge cases (dev builds, manual overrides).

2. **Storing the "last seen version" in `localStorage`**: `localStorage` is scoped to the WebView origin. If Tauri's WebView data directory is cleared by an OS update, antivirus, or a user cleaning browser data, the stored version is lost and the "What's New" modal fires again spuriously.

**Why it happens:**
`localStorage` is the easiest storage option in a React/Tauri app. Developers reach for it without considering that it can be cleared externally, and without considering that the app's SQLite database (RecoDeck's `settings` table) already provides a durable, structured storage layer that survives WebView data resets.

**How to avoid:**
- Read the current version with `import { getVersion } from '@tauri-apps/api/app'` — this queries the Tauri core directly and returns the actual installed binary version, not the bundled `package.json`.
- Store `last_seen_version` in RecoDeck's existing SQLite `settings` table via the established `get_setting`/`set_setting` command pattern. This is durable, consistent with all other settings, and survives WebView clears.
- On app startup: call `getVersion()`, call `get_setting("last_seen_version")`, compare. Show "What's New" if different. Then update the stored value.

**Warning signs:**
- "What's New" modal fires on every launch for some users
- Version shown in modal does not match the actual installed version
- "What's New" modal never fires even after a real update

**Phase to address:** Phase 3 (changelog and "What's New" modal) — design the version-tracking data flow before building the modal UI. Choosing the wrong storage at this stage requires UI and backend changes to fix later.

---

### Pitfall 6: Update Check Blocks App Startup If Called Synchronously

**What goes wrong:**
If the update check (`check()` from `@tauri-apps/plugin-updater`) is called in a `useEffect` that blocks rendering, or if it is awaited before the app renders its main content, users experience a visible delay on every launch — especially on slow networks or when the GitHub Releases endpoint is slow to respond. On timeout, the app may appear frozen.

**Why it happens:**
The `check()` call makes an outbound HTTPS request to the update endpoint. Network latency is unpredictable. Developers often put the update check inside a top-level `useEffect` in `App.tsx` as the obvious location without considering that it runs before the user sees any UI.

**How to avoid:**
Defer the update check until after the app is fully rendered and the user can interact:

```typescript
useEffect(() => {
  // Delay check by 3-5 seconds after mount to ensure
  // audio playback, library load, and UI render complete first
  const timer = setTimeout(async () => {
    try {
      const update = await check();
      if (update) setAvailableUpdate(update);
    } catch (e) {
      // Network failure is silent — user is not interrupted
    }
  }, 3000);
  return () => clearTimeout(timer);
}, []);
```

Wrap the entire check in a try/catch — a network failure should never surface as a UI error. The update check is a background task, not a launch requirement.

**Warning signs:**
- App startup takes noticeably longer than before adding the updater
- Users on slow/offline connections report app hangs at startup
- The app spinner appears for several seconds before the library loads

**Phase to address:** Phase 1 (updater plugin integration) — the timing pattern must be set from the start. Do not wait until performance complaints arise.

---

### Pitfall 7: Capabilities Permission `updater:allow-check` vs `updater:allow-download` Both Required

**What goes wrong:**
RecoDeck's `capabilities/default.json` already includes `"updater:default"` and `"updater:allow-check"`. However, `updater:allow-download` and `updater:allow-install` are separate permissions required for `update.downloadAndInstall()` to work. The `updater:default` group typically includes all of these, but if custom permission scoping is applied or if a future Tauri version changes the default group composition, download calls will fail with a `Permission denied` error.

**Why it happens:**
Tauri v2's permission system denies all capabilities by default. The `updater:default` group includes the common set of permissions, but developers who fine-grain their capabilities (removing `updater:default` and adding individual permissions) may miss `allow-download` and `allow-install` while keeping only `allow-check`.

**How to avoid:**
Keep `"updater:default"` in the capabilities file as the primary permission. Do not replace it with individual `allow-*` permissions unless there is a specific security reason. Verify `capabilities/default.json` includes `"updater:default"` as the first entry for the updater — the current RecoDeck config already does this correctly.

If individual permissions are ever needed, the complete set is:
- `updater:allow-check`
- `updater:allow-download`
- `updater:allow-install`
- `process:allow-restart` (already present in RecoDeck's default.json — required for `relaunch()`)

**Warning signs:**
- `check()` returns an update object but `downloadAndInstall()` throws `Permission denied`
- Tauri security log shows `"Permission denied for command: plugin:updater|download"`
- Update download starts then silently fails at 0%

**Phase to address:** Phase 1 (updater plugin integration) — verify the full permission set in a debug build before wiring up the UI.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `"dialog": true` and use native dialog | Zero implementation effort | No custom toast, no "What's New" modal, no progress bar — the entire milestone is undeliverable | Never — must change to `false` |
| Keep `"createUpdaterArtifacts": "v1Compatible"` | No action required now | Forced migration on Tauri v3 upgrade; if any artifacts have been published in v1Compatible format, switching mid-stream breaks existing installed users | Switch to `true` now — zero users have v1Compatible artifacts yet |
| Store last_seen_version in localStorage | Trivial to implement | Modal fires spuriously if WebView data is cleared; no single source of truth with existing settings system | Never — RecoDeck's SQLite settings table is the correct location |
| Inline changelog text in JS bundle | No hosting required | Every changelog update requires a full app rebuild and release cycle; cannot patch notes without a new release | Acceptable if changelog only changes with code changes (i.e., bundled `changelog.json` is fine) |
| Skip platform detection in relaunch() | Simpler code | `relaunch()` after `downloadAndInstall()` throws on Windows; update flow breaks for half the user base | Never — platform check is three lines of code |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tauri updater endpoint (GitHub Releases) | Using a GitHub Release HTML page URL instead of the direct `latest.json` download URL | Use `https://github.com/NM193/RecoDeck/releases/latest/download/latest.json` — direct file URL, not the release page |
| `latest.json` static manifest | Omitting a platform entry causes the updater to silently find no update for that platform | Both `darwin-aarch64` (and/or `darwin-x86_64`) and `windows-x86_64` entries must be present in `platforms` |
| `latest.json` signature field | Pasting a file path or URL as the `signature` value | The `signature` field must contain the raw content of the `.sig` file, not a path to it |
| Vite `envPrefix` config | Setting `envPrefix: ['VITE_', 'TAURI_']` to make TAURI_ vars available | Use `envPrefix: ['VITE_']` only — TAURI_SIGNING_PRIVATE_KEY must never reach the frontend bundle (CVE-2023-46115) |
| `getVersion()` in frontend | Reading version from `package.json` import | Use `import { getVersion } from '@tauri-apps/api/app'` — queries the actual binary, not the bundled JSON |
| RFC 3339 date in `pub_date` | Using ISO 8601 without timezone offset (e.g., `2026-03-14T00:00:00`) | Must be RFC 3339 with timezone: `2026-03-14T00:00:00Z` — Tauri rejects non-compliant dates |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Update check on synchronous render path | App startup hangs for 2-5 seconds; users on slow connections see frozen UI | Defer `check()` call by 3-5 seconds after app mount; always in background task | Every launch on any connection slower than 50ms to GitHub CDN |
| Blocking `await check()` before library load | Library scan and audio playback delayed until update server responds | Decouple update check from library initialization; run them in parallel or stagger | Offline launches; GitHub API rate limiting (rare) |
| Re-checking on every navigation/re-render | Hammers the GitHub Releases API; rate limiting blocks updates for real | Check once per app session only; track `hasCheckedThisSession` in module-level variable | After ~60 unauthenticated requests/hour to GitHub API |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `vite.config.ts` with `envPrefix: ['VITE_', 'TAURI_']` | Private signing key bundled into frontend JS; extractable by anyone with a hex editor on the app bundle | Set `envPrefix: ['VITE_']` only; verify with `grep -r "TAURI_SIGNING" dist/` after build |
| Committing `TAURI_SIGNING_PRIVATE_KEY` to `.env` or version control | Key leaked in git history; anyone with repo access can sign malicious updates | Store only in password manager + CI secret; add `.env` to `.gitignore`; never commit key file |
| `"dangerousInsecureTransportProtocol": true` left enabled in production config | Updates served over HTTP are trivially interceptable and replaceable with malicious payloads | Only use for local testing; never ship with this flag enabled |
| Serving `latest.json` from an unsigned HTTP endpoint | MITM attacker can modify version/URL fields to push arbitrary downloads | GitHub Releases serves over HTTPS by default; self-hosted endpoints must use HTTPS with a valid cert |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing the "Install" prompt during active audio playback | User is interrupted mid-mix when auto-check fires | Check `isPlaying` state before showing toast; defer notification until track ends or user pauses |
| Starting download immediately on "Install" click without showing progress | Download can take 30-60 seconds for a 30MB bundle; user sees no feedback and clicks again | Show a progress bar or percentage in the toast banner; disable the Install button once clicked |
| No "Later" option on the update toast | Users who cannot update right now (e.g., mid-DJ set) are forced to choose between updating and dismissing permanently | Provide three options: "Install Now", "Remind Me Later" (re-show next launch), "Skip This Version" |
| "What's New" modal fires on first install, not just updates | New users who have never had a previous version stored in DB see the modal immediately | Guard the modal: only show if `last_seen_version` exists in settings AND differs from current version; never show if no prior version is stored |
| Restart happening during active companion server session | Mobile PWA clients get disconnected mid-stream without warning | Before relaunch, emit a shutdown event via the Axum companion server or send a toast on mobile; then relaunch |

---

## "Looks Done But Isn't" Checklist

- [ ] **`"dialog": false` in `tauri.conf.json`:** Verify the updater config has `"dialog": false` — the current RecoDeck config has `true`, which silently disables the JS API.
- [ ] **`createUpdaterArtifacts: true`:** Verify this is set to `true` (not `"v1Compatible"`) before publishing any release artifacts.
- [ ] **Private key backed up:** Verify `TAURI_SIGNING_PRIVATE_KEY` is stored in a password manager and as a GitHub Actions secret, not only on disk.
- [ ] **`vite.config.ts` envPrefix check:** Confirm `envPrefix` does not include `'TAURI_'` — verify in `vite.config.ts` before first build with signing enabled.
- [ ] **`latest.json` has all platform entries:** After CI build, confirm `latest.json` includes both `darwin-aarch64` and `windows-x86_64` platform keys.
- [ ] **Signature field content (not path):** Verify the `signature` fields in `latest.json` contain the raw `.sig` file content, not a file path or URL.
- [ ] **Update check is non-blocking:** Confirm `check()` runs in a `setTimeout` or after app mount, not in the synchronous render path.
- [ ] **Windows install flow tested:** On Windows, verify `downloadAndInstall()` exits the app and the NSIS installer runs; confirm `relaunch()` is NOT called on Windows.
- [ ] **"What's New" modal does not show on fresh install:** On a clean install with no prior `last_seen_version` in SQLite settings, the modal must not appear.
- [ ] **Update toast does not interrupt active playback:** Trigger an update check while a track is playing; verify the toast defers until playback stops.
- [ ] **`process:allow-restart` in capabilities:** Verify `capabilities/default.json` includes `"process:allow-restart"` — RecoDeck's current config includes this correctly; ensure it is not removed during refactor.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `dialog: true` blocking JS API | LOW | Change `"dialog": false` in `tauri.conf.json`; no code changes required |
| Private key lost after publishing | HIGH | Users with installed version can never receive automatic updates; must publish manual reinstall instructions; generate new key for future users only |
| Private key leaked (Vite envPrefix) | HIGH | Revoke and rotate key; publish a transitional release signed with old key that embeds new public key; subsequent releases use new key |
| "What's New" modal fires on every launch | LOW | Add null-check guard: only show if `last_seen_version` is set AND differs from current; write fix to `settings` table on modal close |
| Update check blocks startup | LOW | Wrap `check()` in `setTimeout(fn, 3000)`; add try/catch; one-line change |
| Windows relaunch() error after install | LOW | Add `platform()` check; only call `relaunch()` on non-Windows; three lines of code |
| `createUpdaterArtifacts: "v1Compatible"` after shipping | MEDIUM | If existing installed users have v1Compatible artifacts, switching immediately breaks their updater; must publish one transitional release in old format with new value embedded |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `"dialog": true` blocking JS API | Phase 1 — updater plugin integration setup | Set `dialog: false`; write a minimal `check()` call; verify it returns a result object |
| `"v1Compatible"` future migration debt | Phase 1 — updater plugin integration setup | Change to `true` before first artifact build; `tauri build` produces no deprecation warning |
| Private key loss / leak | Phase 1 — updater plugin integration setup | Key stored in password manager; `vite.config.ts` uses `envPrefix: ['VITE_']` only |
| Update check blocking startup | Phase 1 — updater plugin integration setup | Startup time measured before and after; no regression |
| Missing capabilities permissions | Phase 1 — updater plugin integration setup | `downloadAndInstall()` completes without permission error in debug build |
| Windows auto-exit / no relaunch | Phase 2 — download, install, and restart flow | Manual test on Windows: update installs, app restarts, no unhandled errors |
| Version tracking wrong storage | Phase 3 — changelog and "What's New" modal | Delete app SQLite DB; relaunch; modal does not appear on fresh install |
| "What's New" on fresh install | Phase 3 — changelog and "What's New" modal | Fresh install test: modal absent; update install test: modal present with correct version notes |
| Update interrupting active playback | Phase 2 — download, install, and restart flow | Play a track; trigger update check; verify toast defers until track ends |
| `latest.json` platform entries missing | Phase 4 — CI build and GitHub release pipeline | CI artifact inspection: `latest.json` contains entries for all shipped platforms |

---

## Sources

- Tauri v2 updater plugin documentation: [https://v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/)
- Tauri v2 updater JS API reference: [https://v2.tauri.app/reference/javascript/updater/](https://v2.tauri.app/reference/javascript/updater/)
- Tauri v2 macOS code signing: [https://v2.tauri.app/distribute/sign/macos/](https://v2.tauri.app/distribute/sign/macos/)
- Tauri v2 Windows code signing: [https://v2.tauri.app/distribute/sign/windows/](https://v2.tauri.app/distribute/sign/windows/)
- CVE-2023-46115 — Updater private key leak via Vite envPrefix: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259](https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259)
- Tauri issue #12457 — deprecation warning for `updater.dialog: true` in v1: [https://github.com/tauri-apps/tauri/issues/12457](https://github.com/tauri-apps/tauri/issues/12457)
- Tauri issue #7169 — cross-device link (os error 18) in updater restart: [https://github.com/tauri-apps/tauri/issues/7169](https://github.com/tauri-apps/tauri/issues/7169)
- Tauri issue #7402 — args lost after installUpdate + relaunch: [https://github.com/tauri-apps/tauri/issues/7402](https://github.com/tauri-apps/tauri/issues/7402)
- Tauri discussion #10206 — updater and GitHub releases automation: [https://github.com/orgs/tauri-apps/discussions/10206](https://github.com/orgs/tauri-apps/discussions/10206)
- CrabNebula auto-updates guide for Tauri v2: [https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/](https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/)
- Auto-update and distribution guide (Oflight): [https://www.oflight.co.jp/en/columns/tauri-v2-auto-update-distribution](https://www.oflight.co.jp/en/columns/tauri-v2-auto-update-distribution)
- Codebase: `src-tauri/tauri.conf.json` — `"dialog": true` and `"createUpdaterArtifacts": "v1Compatible"` confirmed at time of research
- Codebase: `src-tauri/capabilities/default.json` — `"updater:default"`, `"updater:allow-check"`, `"process:allow-restart"` all present

---
*Pitfalls research for: RecoDeck v1.6 Update Notifications*
*Researched: 2026-03-14*
