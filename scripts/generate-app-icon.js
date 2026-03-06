#!/usr/bin/env node
/**
 * Generates all app icons for Tauri from the RecoDeck logo.
 * - Creates 1024x1024 master with logo centered in macOS safe zone
 * - Generates all PNG sizes for macOS, Windows, iOS, Android
 * - Creates .icns via iconutil (macOS) and .ico via sharp
 *
 * Usage: node scripts/generate-app-icon.js [path-to-source-image]
 * Default source: public/recodeck-icon-source.jpg
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'src-tauri', 'icons');

// Source image — accept CLI arg or default
const input = process.argv[2] || join(root, 'public', 'recodeck-icon-source.jpg');
console.log(`Source: ${input}`);

// Background color matching the source image bg (~#1a1a1a)
const BG = { r: 26, g: 26, b: 26 };

// ── Step 1: Create 1024x1024 master icon ──────────────────────────────────
console.log('Creating 1024x1024 master icon...');

const MASTER_SIZE = 1024;
// macOS safe zone: logo fills ~90% of icon for maximum visibility
const SAFE_ZONE = Math.round(MASTER_SIZE * 0.90);

// Resize source to fit within safe zone, maintaining aspect ratio
const resizedLogo = await sharp(input)
  .resize(SAFE_ZONE, SAFE_ZONE, {
    fit: 'inside',
    kernel: 'lanczos3',
  })
  .toBuffer();

const resizedMeta = await sharp(resizedLogo).metadata();

// Composite logo centered on the dark background
const master = await sharp({
  create: {
    width: MASTER_SIZE,
    height: MASTER_SIZE,
    channels: 3,
    background: BG,
  },
})
  .composite([{
    input: resizedLogo,
    left: Math.round((MASTER_SIZE - resizedMeta.width) / 2),
    top: Math.round((MASTER_SIZE - resizedMeta.height) / 2),
  }])
  .png()
  .toBuffer();

// Save master
const masterPath = join(root, 'app-icon.png');
await sharp(master).toFile(masterPath);
console.log(`  Master: ${masterPath} (${MASTER_SIZE}x${MASTER_SIZE})`);

// ── Step 2: Generate all PNG sizes ─────────────────────────────────────────
const pngSizes = [
  { name: 'icon.png', size: 1024 },
  { name: '32x32.png', size: 32 },
  { name: '64x64.png', size: 64 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  // Windows Store
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

console.log('Generating PNG sizes...');
for (const { name, size } of pngSizes) {
  await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(join(iconsDir, name));
  console.log(`  ${name} (${size}x${size})`);
}

// ── Step 3: iOS icons ──────────────────────────────────────────────────────
const iosSizes = [
  { name: 'AppIcon-20x20@1x.png', size: 20 },
  { name: 'AppIcon-20x20@2x.png', size: 40 },
  { name: 'AppIcon-20x20@2x-1.png', size: 40 },
  { name: 'AppIcon-20x20@3x.png', size: 60 },
  { name: 'AppIcon-29x29@1x.png', size: 29 },
  { name: 'AppIcon-29x29@2x.png', size: 58 },
  { name: 'AppIcon-29x29@2x-1.png', size: 58 },
  { name: 'AppIcon-29x29@3x.png', size: 87 },
  { name: 'AppIcon-40x40@1x.png', size: 40 },
  { name: 'AppIcon-40x40@2x.png', size: 80 },
  { name: 'AppIcon-40x40@2x-1.png', size: 80 },
  { name: 'AppIcon-40x40@3x.png', size: 120 },
  { name: 'AppIcon-60x60@2x.png', size: 120 },
  { name: 'AppIcon-60x60@3x.png', size: 180 },
  { name: 'AppIcon-76x76@1x.png', size: 76 },
  { name: 'AppIcon-76x76@2x.png', size: 152 },
  { name: 'AppIcon-83.5x83.5@2x.png', size: 167 },
  { name: 'AppIcon-512@2x.png', size: 1024 },
];

const iosDir = join(iconsDir, 'ios');
mkdirSync(iosDir, { recursive: true });

console.log('Generating iOS icons...');
for (const { name, size } of iosSizes) {
  await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(join(iosDir, name));
  console.log(`  ios/${name} (${size}x${size})`);
}

// ── Step 4: Android icons ──────────────────────────────────────────────────
const androidSizes = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

console.log('Generating Android icons...');
for (const { folder, size } of androidSizes) {
  const dir = join(iconsDir, 'android', folder);
  mkdirSync(dir, { recursive: true });

  // ic_launcher — full icon
  await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(join(dir, 'ic_launcher.png'));

  // ic_launcher_round — same image, Android applies circular mask
  await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));

  // ic_launcher_foreground — full icon for adaptive icon foreground layer
  const fgSize = Math.round(size * 108 / 48);
  await sharp(master)
    .resize(fgSize, fgSize, { kernel: 'lanczos3' })
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));

  console.log(`  android/${folder}/ (${size}x${size})`);
}

// ── Step 5: macOS .icns via iconutil ───────────────────────────────────────
console.log('Generating macOS .icns...');
const iconsetDir = join(root, 'AppIcon.iconset');
if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
mkdirSync(iconsetDir);

const icnsSizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

for (const { name, size } of icnsSizes) {
  await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(join(iconsetDir, name));
}

try {
  execSync(`iconutil -c icns -o "${join(iconsDir, 'icon.icns')}" "${iconsetDir}"`);
  console.log('  icon.icns created');
} catch (e) {
  console.error('  Failed to create .icns:', e.message);
}

rmSync(iconsetDir, { recursive: true });

// ── Step 6: Windows .ico ───────────────────────────────────────────────────
console.log('Generating Windows .ico...');
// Create multi-size ICO manually
// ICO format: header + directory entries + image data
const icoImageSizes = [16, 32, 48, 256];
const icoPngs = await Promise.all(
  icoImageSizes.map(size =>
    sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  )
);

// Build ICO file
const numImages = icoPngs.length;
const headerSize = 6;
const dirEntrySize = 16;
const dirSize = dirEntrySize * numImages;

let dataOffset = headerSize + dirSize;
const icoChunks = [];

// ICO header: reserved(2) + type(2, 1=ico) + count(2)
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);     // reserved
header.writeUInt16LE(1, 2);     // type: ICO
header.writeUInt16LE(numImages, 4);
icoChunks.push(header);

// Directory entries
for (let i = 0; i < numImages; i++) {
  const size = icoImageSizes[i];
  const entry = Buffer.alloc(dirEntrySize);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height (0 = 256)
  entry.writeUInt8(0, 2);        // color palette
  entry.writeUInt8(0, 3);        // reserved
  entry.writeUInt16LE(1, 4);     // color planes
  entry.writeUInt16LE(32, 6);    // bits per pixel
  entry.writeUInt32LE(icoPngs[i].length, 8);   // image data size
  entry.writeUInt32LE(dataOffset, 12);          // offset to image data
  icoChunks.push(entry);
  dataOffset += icoPngs[i].length;
}

// Image data (PNG format)
for (const png of icoPngs) {
  icoChunks.push(png);
}

const icoBuffer = Buffer.concat(icoChunks);
const { writeFileSync } = await import('fs');
writeFileSync(join(iconsDir, 'icon.ico'), icoBuffer);
console.log('  icon.ico created (multi-size: 16, 32, 48, 256)');

console.log('\nDone! All icons generated.');
