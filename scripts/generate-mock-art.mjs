/**
 * Writes the placeholder artwork used by the demo NFT gallery.
 *
 * See `lib/mock/nfts.ts`. The gallery needs images that cannot 404 — a demo that
 * shows eight broken thumbnails is worse than one that shows eight abstract
 * ones — so the artwork is generated locally instead of pointing at a remote
 * thumbnail host. Everything is derived from the token index with plain
 * arithmetic: no randomness, so re-running this script produces identical files
 * and the committed output stays reviewable.
 *
 * Usage: `node scripts/generate-mock-art.mjs`
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock');

const SIZE = 800;

/** One palette per demo collection: emerald, arctic, and a warm neutral. */
const PALETTES = [
  { from: '#0f3b31', to: '#04120f', ink: '#a7f3d0' },
  { from: '#12303f', to: '#040d12', ink: '#bae6fd' },
  { from: '#33251a', to: '#110c07', ink: '#fde68a' }
];

/** Concentric rings, thinning and fading outward. */
function rings(seed) {
  const count = 3 + (seed % 3);
  const step = 58 + (seed % 17);
  let markup = '';

  for (let index = 0; index < count; index += 1) {
    const radius = 130 + index * step;
    const opacity = (0.2 - index * 0.04).toFixed(2);
    markup += `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${radius}" fill="none" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="${2 + (seed % 2)}"/>`;
  }

  return markup;
}

/** A sparse dot field, positioned by a modular walk so the pattern is irregular. */
function dots(seed) {
  const columns = 6;
  const step = SIZE / (columns + 1);
  let markup = '';

  for (let row = 1; row <= columns; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const x = column * step;
      const y = row * step;
      if ((column * 7 + row * 13 + seed * 29) % 4 !== 0) continue;
      markup += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="#ffffff" fill-opacity="0.3"/>`;
    }
  }

  return markup;
}

/**
 * One artwork, as a standalone SVG document.
 *
 * The XML declaration is not decorative: Next's image optimiser identifies the
 * format by sniffing magic bytes, and its SVG rule matches `<?xml` at offset
 * zero. A document that opens straight into `<svg …` is rejected with a 400, so
 * dropping this line would silently break every image in the gallery.
 */
function artwork(index) {
  const seed = index + 1;
  const palette = PALETTES[index % PALETTES.length];
  const rotation = (seed * 17) % 360;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Generated placeholder artwork ${seed}">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.35" cy="0.28" r="0.75">
      <stop offset="0%" stop-color="${palette.ink}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${palette.ink}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#field)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
  ${dots(seed)}
  ${rings(seed)}
  <g transform="rotate(${rotation} ${SIZE / 2} ${SIZE / 2})">
    <rect x="${SIZE / 2 - 18}" y="80" width="36" height="${SIZE - 160}" rx="18" fill="${palette.ink}" fill-opacity="0.14"/>
  </g>
</svg>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const names = [];
  for (let index = 0; index < 8; index += 1) {
    const name = `nft-${String(index + 1).padStart(2, '0')}.svg`;
    await writeFile(resolve(OUT_DIR, name), artwork(index), 'utf8');
    names.push(name);
  }

  console.log(`Wrote ${names.length} files to ${OUT_DIR}: ${names.join(', ')}`);
}

await main();
