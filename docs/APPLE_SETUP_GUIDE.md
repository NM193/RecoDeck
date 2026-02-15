# Apple Developer & GitHub Secrets Setup Guide

This guide walks you through the complete Apple Developer setup and GitHub Secrets configuration for RecoDeck.

---

## Part 1: Apple Developer Account Setup

### Step 1: Enroll in Apple Developer Program

1. **Go to:** https://developer.apple.com/programs/
2. **Click:** "Enroll" button
3. **Sign in** with your Apple ID (or create one)
4. **Choose entity type:**
   - **Individual** (most common for solo developers)
   - **Organization** (requires D-U-N-S number)
5. **Complete enrollment:**
   - Review and agree to license agreement
   - Pay $99 USD annual fee
   - Wait for approval (usually instant, sometimes up to 24 hours)

✅ **Checkpoint:** You should receive a confirmation email

---

## Part 2: Create Developer ID Certificate

### Step 2: Generate Certificate Signing Request (CSR)

**On your Mac:**

1. **Open Keychain Access** (Applications → Utilities → Keychain Access)

2. **Menu:** Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority

3. **Fill in the form:**
   - **User Email Address:** Your email
   - **Common Name:** Your name or "RecoDeck Developer"
   - **Request is:** Saved to disk ✅
   - **Let me specify key pair information:** ✅

4. **Click:** Continue

5. **Save location:** Desktop (name it `CertificateSigningRequest.certSigningRequest`)

6. **Key Pair Information:**
   - **Key Size:** 2048 bits
   - **Algorithm:** RSA

7. **Click:** Continue → Done

✅ **Checkpoint:** You should have `CertificateSigningRequest.certSigningRequest` on your Desktop

---

### Step 3: Create Developer ID Certificate on Apple Developer Portal

1. **Go to:** https://developer.apple.com/account/resources/certificates/list

2. **Click:** ➕ (plus icon) to create new certificate

3. **Select:** "Developer ID Application"
   - This allows distribution outside the Mac App Store
   - **NOT** "Mac App Distribution" (that's for App Store only)

4. **Click:** Continue

5. **Upload CSR:**
   - Click "Choose File"
   - Select the `CertificateSigningRequest.certSigningRequest` file
   - Click Continue

6. **Download Certificate:**
   - Click "Download"
   - File will be named: `developerID_application.cer`

7. **Find your Team ID:**
   - Look at the top-right corner of the page
   - You'll see your name/organization and a 10-character code
   - Example: **Nemanja Marjanovic (A1B2C3D4E5)**
   - The code in parentheses is your **Team ID**
   - **SAVE THIS:** You'll need it for GitHub Secrets

✅ **Checkpoint:** You have `developerID_application.cer` downloaded and know your Team ID

---

### Step 4: Install Certificate in Keychain

1. **Double-click** `developerID_application.cer`
   - This installs it in Keychain Access

2. **Open Keychain Access**
   - Go to "My Certificates" category

3. **Verify installation:**
   - Look for "Developer ID Application: Your Name (TEAM_ID)"
   - Expand it (click ▶) - you should see a private key underneath

✅ **Checkpoint:** Certificate and private key are in Keychain

---

## Part 3: Export Certificate for GitHub Actions

### Step 5: Export Certificate as .p12 File

1. **In Keychain Access:**
   - Category: "My Certificates"
   - Find: "Developer ID Application: Your Name (TEAM_ID)"

2. **Right-click** on the certificate (NOT the private key)
   - Select: "Export 'Developer ID Application...'"

3. **Save dialog:**
   - **File name:** `recodeck-cert.p12`
   - **Where:** Desktop
   - **File Format:** Personal Information Exchange (.p12) ✅

4. **Click:** Save

5. **Set password:**
   - Enter a **strong password** (min 12 characters)
   - **IMPORTANT:** Remember this password!
   - Example: `MySecurePassword123!`
   - Click OK

6. **Authenticate:**
   - Enter your Mac login password to allow export
   - Click Allow

✅ **Checkpoint:** You have `recodeck-cert.p12` on your Desktop

---

### Step 6: Convert Certificate to Base64

**Open Terminal and run:**

```bash
base64 -i ~/Desktop/recodeck-cert.p12 | pbcopy
```

This copies the base64-encoded certificate to your clipboard.

✅ **Checkpoint:** Certificate is copied to clipboard (ready to paste)

---

## Part 4: Generate App-Specific Password

### Step 7: Create App-Specific Password for Notarization

1. **Go to:** https://appleid.apple.com/

2. **Sign in** with your Apple ID

3. **Navigate to:** Security section

4. **Find:** "App-Specific Passwords"
   - If you have 2FA enabled, you'll see this option
   - If not, enable 2FA first (required for app-specific passwords)

5. **Click:** "Generate Password" or ➕

6. **Label:** `RecoDeck Notarization`

7. **Click:** Create

8. **Copy the password:**
   - Format: `xxxx-xxxx-xxxx-xxxx`
   - **IMPORTANT:** Save this immediately - you can't view it again!
   - Paste it somewhere safe (1Password, Notes, etc.)

✅ **Checkpoint:** You have the app-specific password saved

---

## Part 5: Configure GitHub Secrets

### Step 8: Add Secrets to GitHub Repository

1. **Go to your GitHub repository:**
   ```
   https://github.com/YOUR_USERNAME/RecoDeck
   ```

2. **Navigate to:**
   - Click "Settings" tab
   - Left sidebar → "Secrets and variables" → "Actions"

3. **Click:** "New repository secret" button

---

### Secret 1: APPLE_CERTIFICATE

- **Name:** `APPLE_CERTIFICATE`
- **Value:** Paste the base64 string from Step 6 (should be in your clipboard)
  - If you lost it, run: `base64 -i ~/Desktop/recodeck-cert.p12 | pbcopy`
- **Click:** Add secret

---

### Secret 2: APPLE_CERTIFICATE_PASSWORD

- **Name:** `APPLE_CERTIFICATE_PASSWORD`
- **Value:** The password you created in Step 5 when exporting the .p12
  - Example: `MySecurePassword123!`
- **Click:** Add secret

---

### Secret 3: APPLE_ID

- **Name:** `APPLE_ID`
- **Value:** Your Apple ID email address
  - Example: `your.email@example.com`
- **Click:** Add secret

---

### Secret 4: APPLE_PASSWORD

- **Name:** `APPLE_PASSWORD`
- **Value:** The app-specific password from Step 7
  - Format: `xxxx-xxxx-xxxx-xxxx`
- **Click:** Add secret

---

### Secret 5: APPLE_TEAM_ID

- **Name:** `APPLE_TEAM_ID`
- **Value:** Your 10-character Team ID from Step 3
  - Example: `A1B2C3D4E5`
- **Click:** Add secret

---

### Secret 6: TAURI_SIGNING_PRIVATE_KEY

- **Name:** `TAURI_SIGNING_PRIVATE_KEY`
- **Value:** Your Tauri updater private key

**To get this, run in Terminal:**

```bash
cat ~/.tauri/recodeck.key | pbcopy
```

This copies your private key to clipboard.

- **Paste** the entire contents (will be very long)
- **Click:** Add secret

---

### Step 9: Verify All Secrets Are Added

You should now have **6 secrets** in total:

| Secret Name | Example Value | Description |
|-------------|---------------|-------------|
| `APPLE_CERTIFICATE` | `MIIKpAIBAzCCCl4...` (very long) | Base64-encoded .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | `MySecurePassword123!` | Password for .p12 file |
| `APPLE_ID` | `your.email@example.com` | Your Apple ID |
| `APPLE_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` | App-specific password |
| `APPLE_TEAM_ID` | `A1B2C3D4E5` | 10-character Team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | `untrusted comment...` (very long) | Tauri updater private key |

✅ **Checkpoint:** All 6 secrets are green ✓

---

## Part 6: Update Configuration Files

### Step 10: Update GitHub Username in Config Files

You need to replace `YOURUSERNAME` with your actual GitHub username in 2 files:

#### File 1: src-tauri/tauri.conf.json

**Find line 39:**
```json
"endpoints": [
  "https://github.com/YOURUSERNAME/RecoDeck/releases/latest/download/latest.json"
]
```

**Replace with:**
```json
"endpoints": [
  "https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/latest/download/latest.json"
]
```

#### File 2: scripts/generate-update-manifest.js

**Find around line 59:**
```javascript
url: `https://github.com/YOURUSERNAME/RecoDeck/releases/download/v${version}/recodeck.app.tar.gz`,
```

**Replace with:**
```javascript
url: `https://github.com/YOUR_ACTUAL_USERNAME/RecoDeck/releases/download/v${version}/recodeck.app.tar.gz`,
```

---

## Part 7: Test the Setup

### Step 11: Create a Test Release

**In Terminal:**

```bash
# 1. Commit the config changes
git add src-tauri/tauri.conf.json scripts/generate-update-manifest.js
git commit -m "chore: update GitHub username in configs"
git push origin main

# 2. Create a test tag
git tag v0.1.1
git push origin main --tags
```

**This will trigger GitHub Actions!**

---

### Step 12: Monitor GitHub Actions

1. **Go to:** `https://github.com/YOUR_USERNAME/RecoDeck/actions`

2. **Watch the "Release" workflow:**
   - It should start automatically when you pushed the tag
   - Click on the workflow run to see progress

3. **Expected timeline:**
   - Build: 5-10 minutes
   - Notarization: 2-30 minutes (Apple's servers)
   - Total: ~15-40 minutes

4. **If successful:**
   - ✅ Green checkmark
   - GitHub Release created automatically
   - DMG file attached
   - Update files attached
   - latest.json attached

5. **If failed:**
   - ❌ Red X
   - Click on the failed job to see logs
   - Common issues:
     - Wrong secret value
     - Certificate expired
     - Missing Xcode command line tools on runner

---

## Troubleshooting

### Certificate Issues

**Error: "Certificate not found"**
- Make sure you exported the certificate (not just the private key)
- Verify it's in .p12 format

**Error: "Password incorrect"**
- Double-check the password you entered in `APPLE_CERTIFICATE_PASSWORD`
- Re-export the certificate with a new password

### Notarization Issues

**Error: "Invalid credentials"**
- Verify `APPLE_ID` is correct
- Verify `APPLE_PASSWORD` is the app-specific password (not your regular password)
- Verify `APPLE_TEAM_ID` is exactly 10 characters

**Error: "Notarization timeout"**
- Check Apple System Status: https://developer.apple.com/system-status/
- Notarization can take 2-30 minutes - this is normal

### Build Issues

**Error: "Target not found"**
- GitHub Actions runner needs both targets installed
- This is handled automatically in the workflow

**Error: "Xcode not found"**
- This shouldn't happen on `macos-latest` runner
- If it does, Apple may have an outage

---

## Security Best Practices

### ✅ DO:
- ✅ Keep your .p12 file secure (store in 1Password/Bitwarden)
- ✅ Use a strong password for the .p12 file
- ✅ Rotate secrets annually
- ✅ Monitor your Apple Developer account for unauthorized activity
- ✅ Use different certificates for development vs production (optional)

### ❌ DON'T:
- ❌ Commit .p12 files to git
- ❌ Share your app-specific password
- ❌ Use your regular Apple password for notarization
- ❌ Store secrets in code or commit messages

---

## Cleanup (After Successful Setup)

Once everything is working, you can clean up:

```bash
# Remove the .p12 file from Desktop
rm ~/Desktop/recodeck-cert.p12

# Remove the CSR file
rm ~/Desktop/CertificateSigningRequest.certSigningRequest

# Remove the downloaded .cer file
rm ~/Downloads/developerID_application.cer
```

**Keep these safe elsewhere:**
- Store the .p12 in a password manager
- Keep the certificate password documented
- Save your Team ID

---

## Quick Reference Card

Save this for future reference:

```
APPLE DEVELOPER CREDENTIALS
============================
Apple ID: ____________________
Team ID: ____________________
App-Specific Password: ____________________
Certificate Password: ____________________

GITHUB REPOSITORY
============================
URL: https://github.com/____________________/RecoDeck
Secrets: 6 configured ✓

CERTIFICATE LOCATION
============================
Keychain: Developer ID Application: __________ (__________)
Backup: [Location in password manager]

RENEWAL DATES
============================
Apple Developer: Renews ____________________
Certificate: Expires ____________________
```

---

## Next Steps

After completing this setup:

1. ✅ All GitHub Secrets configured
2. ✅ GitHub username updated in configs
3. ✅ Test release created (v0.1.1)
4. ✅ Monitoring GitHub Actions

**You're ready to release!** 🚀

Every time you want to release a new version:

```bash
npm run version:patch  # or minor/major
git push origin main --tags
```

That's it! GitHub Actions handles everything else automatically.

---

## Support

**Issues with Apple Developer:**
- Check: https://developer.apple.com/support/

**Issues with GitHub Actions:**
- Check workflow logs: https://github.com/YOUR_USERNAME/RecoDeck/actions
- Review: [docs/RELEASE_GUIDE.md](./RELEASE_GUIDE.md)

**Issues with Tauri:**
- Check: https://v2.tauri.app/plugin/updater/
- Discord: https://discord.gg/tauri
