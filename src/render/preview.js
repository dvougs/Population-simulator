// Canvas 2D preview of a map for the map-generation screen. Cheap enough to
// redraw on every settings change, and needs no second WebGL context.

import { hexPolygon, hexCentre, hexAtWorld, riverSegments, worldBounds, HEX_SIZE } from './layout.js';
import { civStyle, traceEmblem } from './civStyle.js';
import { hexColours, rgbCss, RIVER_RGB } from './palette.js';

/**
 * Draws `map` to fit the canvas. Returns the world-to-canvas transform
 * ({ s, ox, oy, dpr }: canvas px = world × s + offset), or null with no map.
 */
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
  if (!map) return null;

  const b = worldBounds(map.cols, map.rows);
  const s = Math.min((w - 8 * dpr) / (b.maxX - b.minX), (h - 8 * dpr) / (b.maxY - b.minY));
  const ox = (w - (b.maxX - b.minX) * s) / 2 - b.minX * s;
  const oy = (h - (b.maxY - b.minY) * s) / 2 - b.minY * s;
  ctx.setTransform(s, 0, 0, s, ox, oy);

  const colours = hexColours(map);
  const outline = map.cols <= 30;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < map.cols * map.rows; i++) {
    const p = hexPolygon(map.cols, i);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let k = 2; k < 12; k += 2) ctx.lineTo(p[k], p[k + 1]);
    ctx.closePath();
    ctx.fillStyle = rgbCss(colours[i]);
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
  return { s, ox, oy, dpr };
}

/**
 * Civ emblems on a drawn preview (t from drawPreview): starts[c] is civ c's
 * hex (−1: none). chosen[c] marks the ones picked by hand; the others are
 * drawn fainter. selected (or −1) gets a ring.
 */
export function drawStarts(canvas, map, t, starts, chosen, selected = -1) {
  if (!t) return;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(t.s, 0, 0, t.s, t.ox, t.oy);
  // At least 7 CSS px, so a 50 × 50 map still shows them.
  const r = Math.max(HEX_SIZE * 0.85, (7 * t.dpr) / t.s);
  starts.forEach((h, c) => {
    if (h < 0) return;
    const { x, y } = hexCentre(map.cols, h);
    ctx.globalAlpha = chosen[c] ? 1 : 0.6;
    if (c === selected) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    const st = civStyle(c);
    traceEmblem(ctx, st.emblem, x, y, r);
    ctx.fillStyle = rgbCss(st.rgb);
    ctx.lineWidth = r * 0.28;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b0e13';
    ctx.stroke();
    ctx.fill('evenodd');
  });
  ctx.globalAlpha = 1;
}

/** The hex under canvas CSS point (x, y) of a preview drawn with t, or null. */
export function previewHexAt(map, t, x, y) {
  if (!t) return null;
  return hexAtWorld(map.cols, map.rows, (x * t.dpr - t.ox) / t.s, (y * t.dpr - t.oy) / t.s);
}
