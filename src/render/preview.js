// Canvas 2D preview of a map for the map-generation screen. Cheap enough to
// redraw on every settings change, and needs no second WebGL context.

import { hexPolygon, riverSegments, worldBounds, HEX_SIZE } from './layout.js';
import { hexRgb, rgbCss, RIVER_RGB } from './palette.js';

export function drawPreview(canvas, map) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = Math.max(1, canvas.clientWidth);
  const cssH = Math.max(1, canvas.clientHeight);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, w, h);
  if (!map) return;

  const b = worldBounds(map.cols, map.rows);
  const s = Math.min((w - 8 * dpr) / (b.maxX - b.minX), (h - 8 * dpr) / (b.maxY - b.minY));
  const ox = (w - (b.maxX - b.minX) * s) / 2 - b.minX * s;
  const oy = (h - (b.maxY - b.minY) * s) / 2 - b.minY * s;
  ctx.setTransform(s, 0, 0, s, ox, oy);

  const outline = map.cols <= 30;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < map.cols * map.rows; i++) {
    const p = hexPolygon(map.cols, i);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let k = 2; k < 12; k += 2) ctx.lineTo(p[k], p[k + 1]);
    ctx.closePath();
    ctx.fillStyle = rgbCss(hexRgb(map, i));
    ctx.fill();
    // Outlines only while hexes are big enough for them not to darken the whole preview.
    if (outline) ctx.stroke();
  }

  ctx.beginPath();
  for (const [x0, y0, x1, y1] of riverSegments(map)) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.lineWidth = Math.max(HEX_SIZE * 0.22, 1.5 / s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbCss(RIVER_RGB);
  ctx.stroke();
}
