# RecoDeck Build Scripts

This directory contains scripts for building, signing, and releasing RecoDeck.

## Scripts Overview

### `sync-version.js`
Synchronizes version numbers across:
- `package.json` (source of truth)
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

**Usage:**
```bash
npm run version:sync
```

**Auto-run by:**
- `npm run version:patch`
- `npm run version:minor`
- `npm run version:major`
- `npm run build:mac`

---

### `generate-update-manifest.js`
Generates `latest.json` manifest for the Tauri updater.

**Requirements:**
- Built app at `src-tauri/target/release/bundle/macos/recodeck.app.tar.gz`
- Signature file at `recodeck.app.tar.gz.sig`

**Usage:**
```bash
npm run release:manifest
```

**Output:**
- `latest.json` in project root
- Contains: version, signature, SHA256 checksum, download URL

---

### `notarize.sh`
Notarizes a macOS DMG with Apple.

**Requirements:**
- Apple Developer account
- Environment variables:
  - `APPLE_ID` - Your Apple ID email
  - `APPLE_PASSWORD` - App-specific password
  - `APPLE_TEAM_ID` - Your Team ID

**Usage:**
```bash
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"

./scripts/notarize.sh path/to/recodeck.dmg
```

**What it does:**
1. Submits DMG to Apple for notarization
2. Waits for approval (2-30 minutes)
3. Staples notarization ticket to DMG

---

## Complete Release Workflow

### Automated (Recommended)

```bash
# 1. Bump version
npm run version:patch  # or minor/major

# 2. Create and push tag
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin main --tags

# 3. GitHub Actions handles the rest!
```

### Manual (If needed)

```bash
# 1. Build
npm run build:mac

# 2. Sign update bundle
npm run release:sign

# 3. Notarize DMG
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
./scripts/notarize.sh src-tauri/target/release/bundle/dmg/recodeck_*.dmg

# 4. Generate manifest
npm run release:manifest

# 5. Create GitHub release
gh release create v0.2.0 \
  src-tauri/target/release/bundle/dmg/*.dmg \
  src-tauri/target/release/bundle/macos/recodeck.app.tar.gz \
  src-tauri/target/release/bundle/macos/recodeck.app.tar.gz.sig \
  latest.json
```

---

## npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run version:sync` | Sync version across files |
| `npm run version:patch` | Bump patch version (0.1.0 → 0.1.1) |
| `npm run version:minor` | Bump minor version (0.1.0 → 0.2.0) |
| `npm run version:major` | Bump major version (0.1.0 → 1.0.0) |
| `npm run build:mac` | Build universal macOS binary |
| `npm run build:dev` | Build debug version |
| `npm run release:sign` | Sign update bundle |
| `npm run release:manifest` | Generate latest.json |

---

## Security Notes

- 🔒 Never commit `~/.tauri/recodeck.key` (private signing key)
- 🔒 Never commit `.p12` files (Apple certificates)
- 🔒 Use GitHub Secrets for CI/CD credentials
- 🔒 Rotate keys and certificates annually

---

## Troubleshooting

### "Error: Update bundle not found"
Run `npm run build:mac` first.

### "Error: Signature file not found"
Run `npm run release:sign` after building.

### "Notarization failed"
- Check Apple System Status
- Verify environment variables
- Check certificate hasn't expired

### "Version mismatch"
Run `npm run version:sync` to synchronize versions.

---

For more details, see:
- [RELEASE_GUIDE.md](../docs/RELEASE_GUIDE.md) - Complete release process
- [MACOS_DISTRIBUTION.md](../docs/MACOS_DISTRIBUTION.md) - macOS distribution setup
