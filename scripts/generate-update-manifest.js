// Generates latest.json manifest for Tauri updater
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Path to the update bundle. With --target aarch64-apple-darwin: target/aarch64-apple-darwin/release/bundle/
const targetDir = process.env.TAURI_BUNDLE_TARGET || 'release';
const tarballPath = path.join(
  __dirname,
  `../src-tauri/target/${targetDir}/bundle/macos/recodeck.app.tar.gz`
);

// Check if tarball exists
if (!fs.existsSync(tarballPath)) {
  console.error(`❌ Error: Update bundle not found at ${tarballPath}`);
  console.error('   Run "npm run build:mac" first to create the bundle.');
  process.exit(1);
}

// Calculate SHA256 checksum
const fileBuffer = fs.readFileSync(tarballPath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const sha256 = hashSum.digest('hex');

// Read the signature file
const signaturePath = `${tarballPath}.sig`;
if (!fs.existsSync(signaturePath)) {
  console.error(`❌ Error: Signature file not found at ${signaturePath}`);
  console.error('   Run signing command first:');
  console.error(`   npm run tauri signer sign "${tarballPath}" -k ~/.tauri/recodeck.key`);
  process.exit(1);
}

const signature = fs.readFileSync(signaturePath, 'utf8').trim();

// Platform: darwin-aarch64 for Apple Silicon only, darwin-universal for universal builds
const platform = process.env.TAURI_UPDATE_PLATFORM || 'darwin-universal';
const repo = process.env.GITHUB_REPOSITORY || 'YOURUSERNAME/RecoDeck';

// Create update manifest
const manifest = {
  version: version,
  notes: `Release ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: {
      signature: signature,
      url: `https://github.com/${repo}/releases/download/v${version}/recodeck.app.tar.gz`,
      sha256: sha256
    }
  }
};

// Write manifest to project root
const manifestPath = path.join(__dirname, '../latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('✓ Generated latest.json');
console.log(`  Version: ${version}`);
console.log(`  SHA256: ${sha256}`);
console.log(`  Signature: ${signature.substring(0, 50)}...`);
console.log(`  Location: ${manifestPath}`);
console.log('');
console.log('⚠️  Remember to:');
console.log('   1. Update GitHub username in the URL');
console.log('   2. Upload both recodeck.app.tar.gz and recodeck.app.tar.gz.sig to GitHub Releases');
console.log('   3. Upload latest.json to GitHub Releases');
