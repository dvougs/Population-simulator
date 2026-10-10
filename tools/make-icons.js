#!/usr/bin/env node
// Generates the PNG app icons in icons/ (no dependencies). Re-run after changing the design.
// The design: a small terrain map with three civ territories, matching icons/icon.svg.

import fs from 'node:fs';
import zlib from 'node:zlib';

const GRID = [
  'wwwwppffppmm',
  'wwppffEEppmm',
  'wpppfEEEpppm',
  'wppffEEppddm',
  'wpppfffppddd',
  'wwppCCppdddd',
  'wwpCCCpppNNd',
  'wwppCCppNNNd',
  'wwwpppppNNdd',
  'wwwwppppddww',
  'wwwwwpppdwww',
  'wwwwwwwwwwww',
];
const COLORS = {
  w: [36, 74, 120], d: [201, 178, 120], p: [128, 160, 84], f: [62, 128, 62], m: [120, 112, 108],
  E: [230, 90, 60], C: [70, 150, 230], N: [235, 180, 50],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const pad = Math.round(size * 0.1); // maskable safe zone
  const cell = (size - pad * 2) / GRID.length;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let rgb = [17, 21, 28];
      const gx = Math.floor((x - pad) / cell);
      const gy = Math.floor((y - pad) / cell);
      if (gx >= 0 && gy >= 0 && gx < GRID.length && gy < GRID.length) rgb = COLORS[GRID[gy][gx]];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const n = GRID.length;
  let rects = '';
  GRID.forEach((row, y) => [...row].forEach((ch, x) => {
    const [r, g, b] = COLORS[ch];
    rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="rgb(${r},${g},${b})"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.2 -1.2 ${n + 2.4} ${n + 2.4}"><rect x="-1.2" y="-1.2" width="${n + 2.4}" height="${n + 2.4}" rx="2.4" fill="#11151c"/>${rects}</svg>\n`;
}

const out = new URL('../icons/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL('icon-192.png', out), png(192));
fs.writeFileSync(new URL('icon-512.png', out), png(512));
fs.writeFileSync(new URL('apple-touch-icon.png', out), png(180));
fs.writeFileSync(new URL('icon.svg', out), svg());
console.log('icons written');
