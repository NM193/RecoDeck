# RecoDeck - Quick Start Guide

Get RecoDeck ready for production macOS distribution in 3 main steps.

---

## 🎯 Overview

You need to complete these 3 things:

1. **Apple Developer Setup** (30 minutes)
2. **GitHub Secrets Configuration** (10 minutes)
3. **Test Release** (5 minutes + 15-40 min build time)

**Total time:** ~1 hour + waiting for build

---

## Step 1: Apple Developer Setup (30 min)

### What you'll get:
- ✅ Apple Developer membership
- ✅ Developer ID certificate
- ✅ Team ID
- ✅ App-specific password

### Quick path:

```
1. Enroll → https://developer.apple.com/programs/ ($99/year)
   ↓
2. Create Certificate Signing Request (CSR)
   • Keychain Access → Certificate Assistant → Request Certificate
   • Save to Desktop
   ↓
3. Create Developer ID Certificate
   • https://developer.apple.com/account/resources/certificates/list
   • Click ➕ → "Developer ID Application"
   • Upload CSR → Download certificate
   • Note your Team ID (10 characters)
   ↓
4. Install certificate
   • Double-click downloaded .cer file
   • Opens in Keychain Access
   ↓
5. Export as .p12
   • Keychain → My Certificates → Right-click certificate
   • Export → Save as recodeck-cert.p12
   • Set a password (remember it!)
   ↓
6. Convert to base64
   • Terminal: base64 -i ~/Desktop/recodeck-cert.p12 | pbcopy
   ↓
7. Create app-specific password
   • https://appleid.apple.com/ → Security
   • Generate password → Label: "RecoDeck Notarization"
   • Save the password (xxxx-xxxx-xxxx-xxxx)
```

**✅ Done!** You now have everything for GitHub Secrets.

📖 **Detailed guide:** [APPLE_SETUP_GUIDE.md](./APPLE_SETUP_GUIDE.md)

---

## Step 2: GitHub Secrets (10 min)

### Where:
`https://github.com/YOUR_USERNAME/RecoDeck/settings/secrets/actions`

### What to add:

Click "New repository secret" for each of these:

| # | Secret Name | Value | How to get it |
|---|-------------|-------|---------------|
| 1 | `APPLE_CERTIFICATE` | Base64 string | From clipboard (Step 1.6) |
| 2 | `APPLE_CERTIFICATE_PASSWORD` | Your password | From Step 1.5 |
| 3 | `APPLE_ID` | your@email.com | Your Apple ID |
| 4 | `APPLE_PASSWORD` | xxxx-xxxx-xxxx-xxxx | From Step 1.7 |
| 5 | `APPLE_TEAM_ID` | A1B2C3D4E5 | From Step 1.3 |
| 6 | `TAURI_SIGNING_PRIVATE_KEY` | Long string | `cat ~/.tauri/recodeck.key \| pbcopy` |

**✅ Done!** All 6 secrets configured.

---

## Step 3: Update Config & Test (5 min)

### 3.1 Update GitHub Username

**File 1:** `src-tauri/tauri.conf.json` (line 39)
```json
"endpoints": [
  "https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/latest/download/latest.json"
]
```

**File 2:** `scripts/generate-update-manifest.js` (line ~59)
```javascript
url: `https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/download/v${version}/recodeck.app.tar.gz`
```

### 3.2 Create Test Release

```bash
# Commit config changes
git add src-tauri/tauri.conf.json scripts/generate-update-manifest.js
git commit -m "chore: update GitHub username"
git push origin main

# Create test tag
git tag v0.1.1
git push origin main --tags
```

**✅ Done!** GitHub Actions will now build your release automatically.

---

## 📊 Monitor Progress

### Watch GitHub Actions:
`https://github.com/YOUR_USERNAME/RecoDeck/actions`

### Expected timeline:
```
Building macOS app ................ 5-10 min
Notarizing with Apple ............. 2-30 min
Creating GitHub Release ........... 1-2 min
────────────────────────────────────────────
Total ............................. 15-40 min
```

### Success looks like:
✅ Green checkmark on workflow
✅ GitHub Release created with 4 files:
   - recodeck_0.1.1_universal.dmg
   - recodeck.app.tar.gz
   - recodeck.app.tar.gz.sig
   - latest.json

---

## 🎉 You're Done!

After the test release succeeds, your app is ready for production!

### Future releases are simple:

```bash
# Bump version
npm run version:patch  # or minor/major

# Push tag (triggers automatic build)
git push origin main --tags

# That's it! ✨
```

---

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| [APPLE_SETUP_GUIDE.md](./APPLE_SETUP_GUIDE.md) | Step-by-step Apple setup with screenshots |
| [SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md) | Checklist to track your progress |
| [RELEASE_GUIDE.md](./RELEASE_GUIDE.md) | Complete release process |
| [MACOS_DISTRIBUTION.md](./MACOS_DISTRIBUTION.md) | Full technical implementation |

---

## ⚡ Common Issues

### Issue: "Certificate not found in keychain"
**Fix:** Re-export the certificate, make sure to select the certificate (not private key)

### Issue: "Invalid credentials" during notarization
**Fix:** Double-check `APPLE_ID` and `APPLE_PASSWORD` in GitHub Secrets

### Issue: Build fails with "Target not found"
**Fix:** This is handled automatically - check GitHub Actions logs for details

### Issue: Notarization takes forever
**Fix:** Normal! Apple's servers can take 2-30 minutes. Just wait.

---

## 🆘 Need Help?

1. **Check the logs:** GitHub Actions → Click on failed job → View logs
2. **Review setup:** [SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md)
3. **Detailed guide:** [APPLE_SETUP_GUIDE.md](./APPLE_SETUP_GUIDE.md)
4. **Ask for help:** File an issue or join Tauri Discord

---

## 🔒 Security Reminder

After successful setup, delete these from your Desktop:
```bash
rm ~/Desktop/recodeck-cert.p12
rm ~/Desktop/CertificateSigningRequest.certSigningRequest
```

Store the .p12 file in a password manager (1Password, Bitwarden, etc.)

---

## ✅ Verification Commands

After setup is complete, verify everything works:

```bash
# Check versions are synced
npm run version:sync
grep '"version"' package.json src-tauri/tauri.conf.json

# Check private key exists
ls -la ~/.tauri/recodeck.key

# Check GitHub Secrets (on web)
# Go to: https://github.com/YOUR_USERNAME/RecoDeck/settings/secrets/actions
# You should see 6 secrets with green checkmarks
```

---

**Ready to start?** → Begin with [APPLE_SETUP_GUIDE.md](./APPLE_SETUP_GUIDE.md)

**Already set up?** → Go straight to [RELEASE_GUIDE.md](./RELEASE_GUIDE.md)
