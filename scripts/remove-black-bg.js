#!/usr/bin/env node
/**
 * Removes black/dark background from logo by making dark pixels transparent.
 * Use for logo in app (header, etc). For app icon, generate-app-icon.js does its own processing.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const input = join(root, 'public', 'recodeck-logo.png');
const output = join(root, 'public', 'recodeck-logo.png');

// Pixels darker than this become transparent (black/gray bg)
const BLACK_THRESHOLD = 25;

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

for (let i = 0; i < data.length; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const avg = (r + g + b) / 3;
  if (avg <= BLACK_THRESHOLD) {
    data[i + 3] = 0;
  }
}

await sharp(Buffer.from(data), {
  raw: { width, height, channels },
})
  .png()
  .toFile(output);

console.log(`Removed black background: ${output}`);
