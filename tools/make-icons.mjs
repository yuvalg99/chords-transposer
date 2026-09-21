/*
 * Generates the extension icons (a sharp sign on a rounded indigo tile).
 * Pure Node — writes PNGs by hand so the repo needs no dependencies.
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SS = 4; // supersampling factor

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const inRoundRect = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

const inBar = (x, y, x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// A horizontal stroke of the sharp sign, slanting upward to the right.
const inSlantBar = (x, y, centre) => {
  if (x < 0.245 || x > 0.755) return false;
  const yc = centre - 0.075 * (x - 0.5) / 0.255;
  return Math.abs(y - yc) <= 0.045;
};

const inGlyph = (x, y) =>
  inBar(x, y, 0.365, 0.437, 0.175, 0.775) ||
  inBar(x, y, 0.563, 0.635, 0.225, 0.825) ||
  inSlantBar(x, y, 0.415) ||
  inSlantBar(x, y, 0.605);

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (!inRoundRect(u, v, 0.22)) continue;
          bg++;
          if (inGlyph(u, v)) fg++;
        }
      }
      const total = SS * SS;
      const bgA = bg / total, fgA = fg / total;
      // Tile gradient: #5566c4 → #3b478f top to bottom.
      const t = y / size;
      const tile = [0x55 + (0x3b - 0x55) * t, 0x66 + (0x47 - 0x66) * t, 0xc4 + (0x8f - 0xc4) * t];
      const alpha = bgA;
      const mix = (c) => Math.round((c * (bgA - fgA) + 255 * fgA) / Math.max(alpha, 1e-6));
      const i = (y * size + x) * 4;
      px[i] = alpha ? Math.min(255, mix(tile[0])) : 0;
      px[i + 1] = alpha ? Math.min(255, mix(tile[1])) : 0;
      px[i + 2] = alpha ? Math.min(255, mix(tile[2])) : 0;
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = new URL(`../icons/icon${size}.png`, import.meta.url);
  writeFileSync(file, render(size));
  console.log('wrote', file.pathname);
}
