# Phase 21: Updater Plugin Configuration - Research

**Researched:** 2026-03-14
**Domain:** Tauri v2 updater plugin configuration (`tauri.conf.json`)
**Confidence:** HIGH

## Summary

This is a pure-configuration phase with no new code to write. The goal is to fix two stale settings in `tauri.conf.json` left over from the v1-to-v2 migration:

1. `"dialog": true` inside `plugins.updater` — this field **does not exist** in the Tauri v2 updater plugin's `Config` struct. It was a v1 concept that was removed in v2. The v2 updater has no built-in dialog at all; JS/Rust APIs are always the only interface. The key must be **removed entirely**, not set to `false`. The phase description says "dialog: false" but the correct action is deletion.

2. `"createUpdaterArtifacts": "v1Compatible"` inside `bundle` — this generates wrapped archives (`.app.tar.gz`, `.nsis.zip`) for backward compatibility with v1 update manifests. Changing it to `true` generates unwrapped v2 artifacts directly. The docs state v1Compatible will be removed in v3.

The third requirement — permissions — is already satisfied. `default.json` already contains `"updater:default"`, `"updater:allow-check"`, and `"process:allow-restart"`. No change needed there.

**Primary recommendation:** Two-line edit to `tauri.conf.json`: delete the `"dialog": true` line, change `"createUpdaterArtifacts"` value from `"v1Compatible"` to `true`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UCFG-01 | `tauri.conf.json` has `"dialog": false` so JS API receives update events | The `dialog` field does not exist in the Tauri v2 updater Config struct — it was removed entirely in v2. The correct fix is to delete the `"dialog": true` line. The JS API (`check()`) works unconditionally in v2 because there is no built-in dialog to suppress. |
| UCFG-02 | `tauri.conf.json` has `"createUpdaterArtifacts": true` (v1Compatible removed) | `bundle.createUpdaterArtifacts` must be the boolean `true` to generate v2 updater artifacts. `"v1Compatible"` generates wrapped archives for backward compat and will be removed in Tauri v3. |
</phase_requirements>

## Standard Stack

### Core
| Key | Current Value | Target Value | Location |
|-----|--------------|-------------|----------|
| `bundle.createUpdaterArtifacts` | `"v1Compatible"` | `true` | `src-tauri/tauri.conf.json` |
| `plugins.updater.dialog` | `true` (stale v1 key) | *(removed)* | `src-tauri/tauri.conf.json` |

### Already Correct (No Change)
| Setting | Value | Location | Status |
|---------|-------|----------|--------|
| `plugins.updater.active` | `true` | `tauri.conf.json` | OK |
| `plugins.updater.pubkey` | (base64 key) | `tauri.conf.json` | OK |
| `plugins.updater.endpoints` | GitHub latest.json | `tauri.conf.json` | OK |
| `updater:default` permission | present | `capabilities/default.json` | OK |
| `updater:allow-check` permission | present | `capabilities/default.json` | OK |
| `process:allow-restart` permission | present | `capabilities/default.json` | OK |

## Architecture Patterns

### Current State of `tauri.conf.json` (relevant sections)

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": "v1Compatible",  // <-- CHANGE TO true
    "icon": [ ... ],
    "resources": { ... }
  },
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/NM193/RecoDeck/releases/latest/download/latest.json"
      ],
      "dialog": true,       // <-- REMOVE THIS LINE (v1 remnant, not recognized in v2)
      "pubkey": "..."
    }
  }
}
```

### Target State

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "icon": [ ... ],
    "resources": { ... }
  },
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/NM193/RecoDeck/releases/latest/download/latest.json"
      ],
      "pubkey": "..."
    }
  }
}
```

### Why `dialog` Must Be Removed, Not Set to `false`

The Tauri v2 updater plugin's `Config` struct (verified via `docs.rs`) contains exactly six fields:
- `dangerous_insecure_transport_protocol`
- `dangerous_accept_invalid_certs`
- `dangerous_accept_invalid_hostnames`
- `endpoints`
- `pubkey`
- `windows`

There is no `dialog` field. In v2, the built-in update dialog was removed entirely — the JS API `check()` always returns an update object (or null). Setting `"dialog": false` would be an unrecognized key that Tauri silently ignores; removing it is the correct clean action.

The phase description uses the phrase "dialog: false" as a conceptual goal ("JS events not suppressed by native dialog") rather than a literal config value to write. The underlying intent is fully satisfied by removing the v1 remnant.

### Capabilities File (Already Complete)

`src-tauri/capabilities/default.json` already contains:

```json
"permissions": [
  "core:default",
  "core:path:default",
  "core:webview:allow-create-webview-window",
  "core:webview:allow-set-webview-focus",
  "opener:default",
  "dialog:default",
  "dialog:allow-open",
  "updater:default",         // grants allow-check, allow-download, allow-install, allow-download-and-install
  "updater:allow-check",     // explicit allow-check on top of default
  "process:allow-restart"    // needed for relaunch after install
]
```

No capability changes are needed for this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update signing | Custom signature verification | Tauri's built-in pubkey verification | Ed25519 + minisign; removing it disables security |
| Update dialog UI | Custom Tauri v2 dialog bridge | None needed — JS API returns update object directly | v2 has no built-in dialog to suppress; `check()` is always direct |

## Common Pitfalls

### Pitfall 1: Setting `"dialog": false` Instead of Removing the Key
**What goes wrong:** Writing `"dialog": false` to tauri.conf.json. The key is silently ignored by Tauri v2 since it is not in the Config struct. It clutters the config and may confuse future maintainers.
**Why it happens:** Phase description phrasing implies it as a config value.
**How to avoid:** Remove the `"dialog"` key entirely. The v2 updater has no native dialog; the JS API works unconditionally.
**Warning signs:** `tauri build` does not error — unrecognized plugin config keys are silently ignored in serde deserialization.

### Pitfall 2: Confusing `createUpdaterArtifacts` Location
**What goes wrong:** Looking for `createUpdaterArtifacts` inside `plugins.updater` instead of `bundle`.
**Why it happens:** It's a bundle-time artifact setting, not a plugin runtime setting.
**How to avoid:** The key lives at `bundle.createUpdaterArtifacts` in `tauri.conf.json`.

### Pitfall 3: Breaking Existing Users With `createUpdaterArtifacts: true`
**What goes wrong:** Existing users on old builds (with `v1Compatible` artifacts) can no longer update to the new build.
**Why it happens:** v1Compatible wraps artifacts in archives (`.app.tar.gz`); v2 true artifacts are unwrapped. If `latest.json` served v1 wrapped signatures but the new build produces unwrapped artifacts, the manifest must be updated to match.
**How to avoid:** The `generate-update-manifest.js` script (Phase 20/24 scope) must produce a manifest matching the artifact format. Since this project is transitioning and the target audience is small, a coordinated switch is acceptable. Note this in the plan.
**Warning signs:** Existing installations fail to update after the next release.

### Pitfall 4: Forgetting `updater:allow-check` Is Separate from `updater:default`
**What goes wrong:** Assuming `updater:default` is all that's needed.
**Why it happens:** `updater:default` grants download/install but the explicit `allow-check` is also present.
**How to avoid:** N/A for this project — both are already in capabilities. Verify no accidental removal.

## Code Examples

### Tauri v2 JS Updater API (for Phase 22 reference)
```typescript
// Source: https://v2.tauri.app/plugin/updater/
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const update = await check();
if (update) {
  console.log(`Update available: ${update.version}`);
  // update.body contains release notes
  // update.downloadAndInstall() — downloads and installs
  // relaunch() — restarts the app after install
}
```

This API works in v2 without any config changes. Removing `"dialog": true` from config does not affect this — it was already a no-op.

### Minimal Valid Tauri v2 Updater Config
```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "CONTENT FROM PUBLICKEY.PEM",
      "endpoints": [
        "https://github.com/owner/repo/releases/latest/download/latest.json"
      ]
    }
  }
}
```
Source: https://v2.tauri.app/plugin/updater/

## State of the Art

| Old Approach (v1) | Current Approach (v2) | When Changed | Impact |
|-------------------|-----------------------|-------------|--------|
| `updater.dialog: true` — native OS dialog | Dialog removed; JS/Rust API always used | v2.0 (2024) | Developers must build their own update UI |
| `createUpdaterArtifacts: "v1Compatible"` | `createUpdaterArtifacts: true` | v2.0 (2024) | Cleaner artifact format; v1Compatible removed in v3 |
| `updater` built into Tauri core | Separate `tauri-plugin-updater` | v2.0 (2024) | Explicit plugin registration required |

**Deprecated:**
- `plugins.updater.dialog`: Removed in v2. No replacement — the concept no longer applies.
- `createUpdaterArtifacts: "v1Compatible"`: Will be removed in Tauri v3. Must migrate to `true`.

## Open Questions

1. **Does `createUpdaterArtifacts: true` break update path for existing macOS users?**
   - What we know: v1Compatible produces `.app.tar.gz`; `true` produces `.app.tar.gz` on macOS (same format for macOS, different on Windows/Linux)
   - What's unclear: Whether the macOS artifact format actually differs between modes
   - Recommendation: Proceed with `true`; the project's existing user base is small and can handle a manual re-download if needed. Phase 24 (CI release pipeline) will update `generate-update-manifest.js` to match.

2. **Will Tauri CLI warn about unrecognized `dialog` key?**
   - What we know: serde unknown field handling in Tauri config is typically `deny_unknown_fields` or silent ignore
   - What's unclear: Whether a build warning is emitted for stale `dialog` key
   - Recommendation: Remove the key regardless; cleaner config is always correct.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (config-only phase) |
| Config file | N/A |
| Quick run command | `cd src-tauri && cargo check 2>&1 \| grep -i "error\|warning"` |
| Full suite command | `npm run build -- --debug 2>&1 \| tail -20` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UCFG-01 | `dialog` key absent from `plugins.updater` | config inspection | `python3 -c "import json,sys; c=json.load(open('src-tauri/tauri.conf.json')); sys.exit(0 if 'dialog' not in c['plugins']['updater'] else 1)"` | ✅ (tauri.conf.json exists) |
| UCFG-02 | `createUpdaterArtifacts` equals `true` (boolean) | config inspection | `python3 -c "import json,sys; c=json.load(open('src-tauri/tauri.conf.json')); v=c['bundle']['createUpdaterArtifacts']; sys.exit(0 if v is True else 1)"` | ✅ (tauri.conf.json exists) |

### Sampling Rate
- **Per task commit:** Run the two python3 config inspection commands above
- **Per wave merge:** `cd src-tauri && cargo check`
- **Phase gate:** Both config checks pass + `cargo check` clean before `/gsd:verify-work`

### Wave 0 Gaps
None — existing `tauri.conf.json` covers all phase requirements. No test files need to be created; validation is config inspection via inline commands.

## Sources

### Primary (HIGH confidence)
- https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/struct.Config.html — Config struct fields verified (no `dialog` field)
- https://v2.tauri.app/plugin/updater/ — Official updater plugin docs, createUpdaterArtifacts and permissions
- https://v2.tauri.app/start/migrate/from-tauri-1/ — Confirms `dialog` field removed in v2, createUpdaterArtifacts behavior

### Secondary (MEDIUM confidence)
- https://github.com/tauri-apps/tauri/issues/12457 — `updater.dialog: true` deprecation discussion confirms v1 vs v2 behavior change
- https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/updater — Plugin workspace README confirms JS API usage pattern

### Tertiary (LOW confidence)
- Community blog posts (ratulmaharaj.com, thatgurjot.com) — confirm v2 updater pattern but not authoritative

## Metadata

**Confidence breakdown:**
- Standard stack (config keys): HIGH — verified via docs.rs struct definition and official migration docs
- Architecture (what to change): HIGH — current file read directly, target verified against official schema
- Pitfalls: HIGH — dialog removal confirmed by official migration guide and struct inspection
- Permissions already present: HIGH — capabilities/default.json read directly

**Research date:** 2026-03-14
**Valid until:** 2026-06-14 (stable Tauri v2 API; unlikely to change before v3)
