// Generates latest.json manifest for Tauri updater (macOS + Windows)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;
const repo = process.env.GITHUB_REPOSITORY || 'NM193/RecoDeck';

const platforms = {};

// --- macOS (Apple Silicon) ---
const macTarball = findFile('artifacts/macos', '**/*.tar.gz', /\.sig$/);
const macSig = macTarball ? `${macTarball}.sig` : null;

if (macTarball && macSig && fs.existsSync(macSig)) {
  const signature = fs.readFileSync(macSig, 'utf8').trim();
  const filename = path.basename(macTarball);
  platforms['darwin-aarch64'] = {
    signature,
    url: `https://github.com/${repo}/releases/download/v${version}/${filename}`,
  };
  console.log(`✓ darwin-aarch64: ${filename}`);
}

// --- Windows (x86_64 NSIS) ---
const winExe = findFile('artifacts/windows', '**/*.exe', /\.sig$/);
const winSig = winExe ? `${winExe}.sig` : null;

if (winExe && winSig && fs.existsSync(winSig)) {
  const signature = fs.readFileSync(winSig, 'utf8').trim();
  const filename = path.basename(winExe);
  platforms['windows-x86_64'] = {
    signature,
    url: `https://github.com/${repo}/releases/download/v${version}/${filename}`,
  };
  console.log(`✓ windows-x86_64: ${filename}`);
}

if (Object.keys(platforms).length === 0) {
  console.error('❌ No platform artifacts found. Check artifacts/ directory.');
  process.exit(1);
}

const manifest = {
  version,
  notes: `Release ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

const manifestPath = path.join(__dirname, '../latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`\n✓ Generated latest.json with ${Object.keys(platforms).length} platform(s)`);
console.log(`  Version: ${version}`);

// --- Helpers ---

function findFile(baseDir, _pattern, excludeRegex) {
  const absBase = path.join(__dirname, '..', baseDir);
  if (!fs.existsSync(absBase)) return null;
  return findRecursive(absBase, excludeRegex);
}

function findRecursive(dir, excludeRegex) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findRecursive(fullPath, excludeRegex);
      if (found) return found;
    } else if (!excludeRegex.test(entry.name)) {
      return fullPath;
    }
  }
  return null;
}
