#!/usr/bin/env node
/**
 * Creates a square app icon from the RecoDeck logo.
 * The logo is a wordmark (landscape) - we add black padding to make it square.
 * Logo has transparent bg; transparent areas show black. iOS/macOS apply rounded corners automatically.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const input = join(root, 'public', 'recodeck-logo.png');
const output = join(root, 'app-icon.png');

// Black background - matches other app icons, radius applied by OS
const BG = { r: 0, g: 0, b: 0, alpha: 1 };

const metadata = await sharp(input).metadata();
const { width, height } = metadata;
const size = Math.max(width, height);

await sharp(input)
  .extend({
    top: Math.floor((size - height) / 2),
    bottom: Math.ceil((size - height) / 2),
    left: Math.floor((size - width) / 2),
    right: Math.ceil((size - width) / 2),
    background: BG,
  })
  .png()
  .toFile(output);

console.log(`Created square app icon: ${output} (${size}x${size})`);
