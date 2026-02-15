# ✅ macOS Distribution Setup Complete!

RecoDeck is now configured for production macOS distribution with automatic updates.

## What's Been Set Up

### ✅ Phase 1: Version Management
- ✅ [scripts/sync-version.js](../scripts/sync-version.js) - Syncs versions across all config files
- ✅ npm scripts for version bumping (`version:patch`, `version:minor`, `version:major`)
- ✅ Updated [.gitignore](../.gitignore) to exclude sensitive files

### ✅ Phase 2: Updater Plugin
- ✅ Added `tauri-plugin-updater` to [src-tauri/Cargo.toml](../src-tauri/Cargo.toml)
- ✅ Installed `@tauri-apps/plugin-updater` npm package
- ✅ Configured updater in [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)
- ✅ Registered plugin in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)

### ✅ Phase 4: Update Signing
- ✅ Generated cryptographic keypair at `~/.tauri/recodeck.key`
- ✅ Added public key to tauri.conf.json
- ✅ Created [scripts/generate-update-manifest.js](../scripts/generate-update-manifest.js)
- ✅ Added `release:sign` and `release:manifest` npm scripts

### ✅ Phase 5: Release Infrastructure
- ✅ Created [scripts/notarize.sh](../scripts/notarize.sh) for Apple notarization
- ✅ Created [src-tauri/entitlements.plist](../src-tauri/entitlements.plist) for macOS permissions
- ✅ Created [CHANGELOG.md](../CHANGELOG.md) template

### ✅ Phase 6: CI/CD Automation
- ✅ Created [.github/workflows/release.yml](../.github/workflows/release.yml) for automated releases
- ✅ Documented complete process in [docs/RELEASE_GUIDE.md](./RELEASE_GUIDE.md)

---

## File Structure

```
RecoDeck/
├── .github/
│   └── workflows/
│       └── release.yml ..................... GitHub Actions workflow
├── docs/
│   ├── MACOS_DISTRIBUTION.md ............... Complete implementation guide
│   ├── RELEASE_GUIDE.md .................... Release process documentation
│   └── SETUP_COMPLETE.md ................... This file
├── scripts/
│   ├── sync-version.js ..................... Version synchronization
│   ├── generate-update-manifest.js ......... Update manifest generator
│   ├── notarize.sh ......................... Apple notarization script
│   └── README.md ........................... Scripts documentation
├── src-tauri/
│   ├── entitlements.plist .................. macOS security permissions
│   ├── tauri.conf.json ..................... Updater configuration
│   ├── Cargo.toml .......................... Updater plugin dependency
│   └── src/lib.rs .......................... Updater plugin registration
├── .gitignore .............................. Excludes *.key, *.p12, etc.
├── CHANGELOG.md ............................ Release notes template
└── package.json ............................ Build & release scripts
```

---

## Next Steps

### 1. Update GitHub Username

**File:** `src-tauri/tauri.conf.json`
```json
"endpoints": [
  "https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/latest/download/latest.json"
]
```

**File:** `scripts/generate-update-manifest.js`
```javascript
url: `https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/download/v${version}/recodeck.app.tar.gz`
```

### 2. Apple Developer Setup

1. **Enroll in Apple Developer Program** ($99/year)
   - Visit: https://developer.apple.com/programs/

2. **Create Developer ID Certificate**
   - Log in to Apple Developer → Certificates
   - Create "Developer ID Application" certificate
   - Download and import to Keychain

3. **Get Team ID**
   - Found at: https://developer.apple.com/account/
   - 10-character code (e.g., `A1B2C3D4E5`)

4. **Generate App-Specific Password**
   - Visit: https://appleid.apple.com/
   - Sign in → Security → App-Specific Passwords
   - Create with label "RecoDeck Notarization"

### 3. Configure GitHub Secrets

Go to **GitHub Repository → Settings → Secrets and variables → Actions**

Add these secrets:

| Secret | How to Get |
|--------|------------|
| `APPLE_CERTIFICATE` | Export cert as .p12, then: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting .p12 |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Your 10-character Team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | `cat ~/.tauri/recodeck.key \| pbcopy` |

### 4. Test the System

```bash
# 1. Bump version
npm run version:patch

# 2. Create tag
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"

# 3. Push (triggers GitHub Actions)
git push origin main --tags

# 4. Monitor at: https://github.com/YOUR_USERNAME/RecoDeck/actions
```

---

## Available Commands

### Version Management
```bash
npm run version:sync     # Sync versions across files
npm run version:patch    # 0.1.0 → 0.1.1
npm run version:minor    # 0.1.0 → 0.2.0
npm run version:major    # 0.1.0 → 1.0.0
```

### Building
```bash
npm run build:mac        # Build universal binary (Intel + Apple Silicon)
npm run build:dev        # Build debug version
```

### Release
```bash
npm run release:sign     # Sign update bundle
npm run release:manifest # Generate latest.json
```

### Manual Notarization
```bash
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
./scripts/notarize.sh src-tauri/target/release/bundle/dmg/*.dmg
```

---

## How Auto-Updates Work

1. **User opens RecoDeck**
   - App checks GitHub Releases for `latest.json`

2. **Update available**
   - Compares remote version with local version
   - Shows dialog: "Update to v0.2.0?"

3. **User clicks "Download"**
   - Downloads `recodeck.app.tar.gz`
   - Verifies signature (prevents tampering)
   - Verifies SHA256 checksum

4. **User clicks "Install"**
   - Installs update
   - Restarts app
   - Shows v0.2.0

---

## Security Features

✅ **Cryptographic Signing** - Updates signed with private key
✅ **Signature Verification** - Public key verifies authenticity
✅ **SHA256 Checksums** - Detects corrupted downloads
✅ **Apple Notarization** - macOS Gatekeeper approval
✅ **HTTPS Only** - Secure download channel
✅ **Hardened Runtime** - Additional macOS protections

---

## What You Can Do Now

✅ **Build universal macOS app** - Runs on Intel & Apple Silicon
✅ **Sign and notarize** - Passes macOS Gatekeeper
✅ **Automatic updates** - Users get seamless updates
✅ **GitHub Releases** - Free CDN hosting
✅ **Automated CI/CD** - Push tag → auto-release
✅ **Professional workflow** - Production-ready process

---

## Important Files to Secure

🔒 **NEVER COMMIT THESE:**
- `~/.tauri/recodeck.key` - Private signing key
- `*.p12` - Apple certificates
- `.env` files with credentials

✅ **Already in .gitignore:**
- `*.key`
- `*.p12`
- `*.provisionprofile`
- `certificate.p12`
- `private.key`
- `latest.json`

---

## Resources

- 📘 [Release Guide](./RELEASE_GUIDE.md) - Complete release process
- 📘 [Distribution Guide](./MACOS_DISTRIBUTION.md) - Full implementation details
- 📘 [Scripts README](../scripts/README.md) - Script documentation
- 🔗 [Tauri Updater Docs](https://v2.tauri.app/plugin/updater/)
- 🔗 [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

---

## Support

If you need help:
1. Check the [RELEASE_GUIDE.md](./RELEASE_GUIDE.md) troubleshooting section
2. Review [MACOS_DISTRIBUTION.md](./MACOS_DISTRIBUTION.md) for detailed setup
3. File an issue on GitHub
4. Check Tauri Discord: https://discord.gg/tauri

---

## Status: Ready for Production! 🚀

Your RecoDeck app is now configured for professional macOS distribution. Once you complete the Apple Developer setup and add GitHub Secrets, you can start releasing updates to users with automatic update notifications.

**Next milestone:** First production release (v1.0.0) 🎉
