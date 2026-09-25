/**
 * Generates `public/preview.png` — a 1200x630 dashboard mockup used as the
 * repository preview and Open Graph image.
 *
 * Rendered by hand with zlib so the asset has no build-time or binary
 * dependency: run `node scripts/generate-preview.mjs` after changing the
 * palette to regenerate it deterministically.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'public/preview.png');

const EMERALD = [16, 185, 129];
const SURFACE = [13, 16, 15];
const PANEL = [16, 18, 22];
const BORDER = [30, 34, 42];
const TEXT_STRONG = [42, 47, 58];
const TEXT_MUTED = [28, 32, 41];

const pixels = new Uint8Array(WIDTH * HEIGHT * 3);

/** Deterministic noise so regenerating the asset produces an identical file. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function setPixel(x, y, [r, g, b], alpha = 1) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const offset = (y * WIDTH + x) * 3;
  pixels[offset] = Math.round(pixels[offset] * (1 - alpha) + r * alpha);
  pixels[offset + 1] = Math.round(pixels[offset + 1] * (1 - alpha) + g * alpha);
  pixels[offset + 2] = Math.round(pixels[offset + 2] * (1 - alpha) + b * alpha);
}

function fillRect(x, y, w, h, color, alpha = 1) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) setPixel(px, py, color, alpha);
  }
}

function roundedRect(x, y, w, h, radius, { fill, border, borderWidth = 1 } = {}) {
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const dx = Math.min(px, w - 1 - px);
      const dy = Math.min(py, h - 1 - py);
      let inside = true;
      if (dx < radius && dy < radius) {
        const cx = radius - dx;
        const cy = radius - dy;
        inside = Math.hypot(cx, cy) <= radius + 0.5;
      }
      if (!inside) continue;

      const edge = dx < borderWidth || dy < borderWidth;
      if (border && edge) setPixel(x + px, y + py, border);
      else if (fill) setPixel(x + px, y + py, fill);
    }
  }
}

// Background: near-black with a slight green cast toward the bottom.
for (let y = 0; y < HEIGHT; y += 1) {
  const t = y / HEIGHT;
  const color = [Math.round(10 + 4 * t), Math.round(10 + 8 * t), Math.round(11 + 4 * t)];
  fillRect(0, y, WIDTH, 1, color);
}

// Radial emerald glow behind the header.
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const distance = Math.hypot(x - 620, y - 90);
    if (distance > 460) continue;
    const falloff = (1 - distance / 460) ** 2.4;
    setPixel(x, y, EMERALD, falloff * 0.16);
  }
}

// Faint measurement grid.
for (let x = 0; x < WIDTH; x += 80) fillRect(x, 0, 1, HEIGHT, [255, 255, 255], 0.018);
for (let y = 0; y < HEIGHT; y += 60) fillRect(0, y, WIDTH, 1, [255, 255, 255], 0.018);

// Logo tile with an ascending bar mark.
roundedRect(80, 72, 72, 72, 18, { fill: EMERALD });
fillRect(97, 108, 9, 20, [10, 40, 30]);
fillRect(112, 98, 9, 30, [10, 40, 30]);
fillRect(127, 88, 9, 40, [10, 40, 30]);

// Header wireframe bars.
roundedRect(176, 84, 344, 22, 6, { fill: TEXT_STRONG });
roundedRect(176, 118, 228, 14, 6, { fill: TEXT_MUTED });

// KPI cards.
const cardY = 200;
const cardHeight = 112;
[80, 410, 740].forEach((cardX, index) => {
  roundedRect(cardX, cardY, 300, cardHeight, 14, { fill: PANEL, border: BORDER });
  roundedRect(cardX + 22, cardY + 24, index === 0 ? 120 : 92, 14, 6, { fill: [58, 64, 78] });
  roundedRect(cardX + 22, cardY + 56, index === 0 ? 176 : 132, 26, 8, {
    fill: index === 0 ? EMERALD : [70, 78, 94]
  });
});

// Chart panel.
const chartX = 80;
const chartY = 344;
const chartW = 1040;
const chartH = 226;
roundedRect(chartX, chartY, chartW, chartH, 16, { fill: SURFACE, border: BORDER });

// Portfolio-style curve: seeded random walk with an upward drift, then smoothed.
const random = createRandom(20240923);
const pointCount = 44;
const rawSeries = [];
let level = 0.42;
for (let i = 0; i < pointCount; i += 1) {
  level += (random() - 0.42) * 0.09 + 0.012;
  rawSeries.push(level);
}

const series = rawSeries.map((value, index) => {
  const window = [rawSeries[index - 1] ?? value, value, rawSeries[index + 1] ?? value];
  return window.reduce((sum, entry) => sum + entry, 0) / window.length;
});

const minValue = Math.min(...series);
const maxValue = Math.max(...series);
const plotLeft = chartX + 40;
const plotRight = chartX + chartW - 40;
const plotTop = chartY + 34;
const plotBottom = chartY + chartH - 34;
const plotWidth = plotRight - plotLeft;
const plotHeight = plotBottom - plotTop;

const curveY = (index) => {
  const normalized = (series[index] - minValue) / Math.max(maxValue - minValue, 0.0001);
  return plotBottom - normalized * plotHeight;
};

const curveX = (index) => plotLeft + (index / (pointCount - 1)) * plotWidth;

// Area fill under the curve, denser near the line.
for (let x = plotLeft; x <= plotRight; x += 1) {
  const position = ((x - plotLeft) / plotWidth) * (pointCount - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, pointCount - 1);
  const blend = position - lower;
  const y = curveY(lower) * (1 - blend) + curveY(upper) * blend;

  for (let py = Math.round(y); py <= plotBottom; py += 1) {
    const depth = (py - y) / Math.max(plotBottom - y, 1);
    setPixel(x, py, EMERALD, 0.19 * (1 - depth) ** 0.85 + 0.012);
  }
}

// Curve stroke.
for (let x = plotLeft; x <= plotRight; x += 1) {
  const position = ((x - plotLeft) / plotWidth) * (pointCount - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, pointCount - 1);
  const blend = position - lower;
  const y = curveY(lower) * (1 - blend) + curveY(upper) * blend;

  for (let offset = -1; offset <= 1; offset += 1) {
    if (Math.abs(offset) === 1) setPixel(x, Math.round(y) + offset, EMERALD, 0.35);
    else setPixel(x, Math.round(y), EMERALD);
  }
}

// Highlight the last data point, mirroring the live-value dot in the UI.
const lastY = Math.round(curveY(pointCount - 1));
for (let dy = -5; dy <= 5; dy += 1) {
  for (let dx = -5; dx <= 5; dx += 1) {
    const distance = Math.hypot(dx, dy);
    if (distance <= 5) setPixel(plotRight + dx, lastY + dy, EMERALD, distance <= 2 ? 1 : 0.22);
  }
}

// Footer legend row.
[80, 200, 320].forEach((legendX, index) => {
  fillRect(legendX, 592, 10, 10, index === 0 ? EMERALD : [70, 78, 94]);
  roundedRect(legendX + 20, 594, index === 0 ? 74 : 58, 8, 4, { fill: TEXT_MUTED });
});

const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const rowStart = y * (WIDTH * 3 + 1);
  raw[rowStart] = 0;
  Buffer.from(pixels.buffer, y * WIDTH * 3, WIDTH * 3).copy(raw, rowStart + 1);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, png);

console.log(`Wrote ${outputPath} (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
