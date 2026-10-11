// Canvas 2D pictures of a world for the home page and How to play: the same
// terrain colours, tint, territory outlines, rings, labels and people as the
// game's map (RULES.md "How civs and people look"), drawn once per call with
// no second WebGL context. Cheap enough to redraw on resize, or once a year
// for the home page's living world.

import { hexPolygon, hexCentre, riverSegments, worldBounds, HEX_SIZE } from './layout.js';
import { rgbCss, RIVER_RGB } from './palette.js';
import { civStyle, traceEmblem } from './civStyle.js';
import {
  tintedRgb, ringArcs, outlineSegments, RING_RADIUS, RING_WIDTH, OUTLINE_WIDTH,
} from './territory.js';
import {
  personSpot, hexTotal, largestCiv, shortCount, LABEL_R, PERSON_R, SPREAD_R,
} from './peopleMaths.js';
import { DEEP_WATER } from '../sim/terrain.js';

const CASING = '#0b0e13';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Size the canvas backing store to its CSS box × device pixel ratio; returns the 2D context and pixel size. */
function prepare(canvas) {
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = Math.max(1, Math.round(Math.max(1, canvas.clientWidth) * dpr));
  const h = Math.max(1, Math.round(Math.max(1, canvas.clientHeight) * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { ctx: canvas.getContext('2d'), w, h, dpr };
}

/** World box around hexes `focus` (all hexes if empty), grown by `pad` hex sizes. */
function focusBox(cols, rows, focus, pad) {
  if (!focus || !focus.length) {
    const b = worldBounds(cols, rows);
    return { minX: b.minX - pad * HEX_SIZE, minY: b.minY - pad * HEX_SIZE, maxX: b.maxX + pad * HEX_SIZE, maxY: b.maxY + pad * HEX_SIZE };
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const i of focus) {
    const c = hexCentre(cols, i);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const r = (1 + pad) * HEX_SIZE;
  return { minX: minX - r, minY: minY - r, maxX: maxX + r, maxY: maxY + r };
}

const polygon = (ctx, cols, i) => {
  const p = hexPolygon(cols, i);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let k = 2; k < 12; k += 2) ctx.lineTo(p[k], p[k + 1]);
  ctx.closePath();
};

function emblemAt(ctx, civ, x, y, r, line) {
  traceEmblem(ctx, civStyle(civ).emblem, x, y, r);
  ctx.fillStyle = rgbCss(civStyle(civ).rgb);
  ctx.fill('evenodd');
  ctx.lineWidth = line;
  ctx.strokeStyle = CASING;
  ctx.stroke();
}

/**
 * Draw a world into `canvas`.
 * world: { map (SimHost.map()), colours (hexColours(map)), pop (SimHost.population()) or null }.
 * opts:
 *   focus: hex indices to fit in view (default the whole map); pad: margin in hex sizes (default 0.15);
 *   civs: tint, outlines (default true when pop is given); rings, labels (emblem per hex), counts (head counts under labels);
 *   people: draw every person as a tiny emblem; reach: [{ hexes, fill }] overlays; mark: hex to outline in white.
 * Returns the scale used (CSS px per world unit), so callers can tell how big a hex came out.
 */
export function drawWorld(canvas, world, opts = {}) {
  const { ctx, w, h, dpr } = prepare(canvas);
  const { map, colours, pop } = world;
  const { cols, rows } = map;
  const n = cols * rows;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = opts.background ?? rgbCss([13, 38, 62]);
  ctx.fillRect(0, 0, w, h);

  const b = focusBox(cols, rows, opts.focus, opts.pad ?? 0.15);
  const s = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const ox = (w - (b.maxX - b.minX) * s) / 2 - b.minX * s;
  const oy = (h - (b.maxY - b.minY) * s) / 2 - b.minY * s;
  ctx.setTransform(s, 0, 0, s, ox, oy);
  // Hexes wholly off the canvas are skipped, so a close-up costs only what it shows.
  const vis = (i) => {
    const c = hexCentre(cols, i);
    const x = c.x * s + ox; const y = c.y * s + oy; const r = HEX_SIZE * s;
    return x > -r && x < w + r && y > -r && y < h + r;
  };

  const civs = pop ? pop.civs : 0;
  const counts = pop ? pop.hexCivPop : null;
  const showCivs = !!pop && opts.civs !== false;
  const px = 1 / s; // one device pixel in world units

  // Terrain, tinted toward the civs living there.
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    if (!vis(i)) continue;
    const land = map.terrain[i] !== DEEP_WATER;
    const rgb = showCivs && land ? tintedRgb(colours[i], counts, civs, i) : colours[i];
    polygon(ctx, cols, i);
    ctx.fillStyle = rgbCss(rgb);
    ctx.fill();
    ctx.lineWidth = Math.max(px, HEX_SIZE * 0.03);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();
  }

  ctx.beginPath();
  for (const [x0, y0, x1, y1] of riverSegments(map)) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  ctx.lineWidth = Math.max(HEX_SIZE * 0.2, 1.5 * px * dpr);
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbCss(RIVER_RGB);
  ctx.stroke();

  for (const r of opts.reach ?? []) {
    ctx.fillStyle = r.fill;
    for (const i of r.hexes) { if (vis(i)) { polygon(ctx, cols, i); ctx.fill(); } }
  }

  if (showCivs && opts.outlines !== false) {
    const segs = [];
    for (let c = 0; c < civs; c++) segs.push(outlineSegments(counts, civs, cols, rows, c));
    const trace = (sg) => {
      ctx.beginPath();
      for (let k = 0; k < sg.length; k += 4) { ctx.moveTo(sg[k], sg[k + 1]); ctx.lineTo(sg[k + 2], sg[k + 3]); }
    };
    ctx.lineCap = 'round';
    for (let c = 0; c < civs; c++) {
      if (!segs[c].length) continue;
      trace(segs[c]);
      ctx.lineWidth = OUTLINE_WIDTH + 2 * px * dpr;
      ctx.strokeStyle = 'rgba(11,14,19,0.55)';
      ctx.stroke();
    }
    for (let c = 0; c < civs; c++) {
      if (!segs[c].length) continue;
      trace(segs[c]);
      ctx.lineWidth = OUTLINE_WIDTH;
      ctx.strokeStyle = rgbCss(civStyle(c).rgb);
      ctx.stroke();
    }
  }

  if (showCivs && (opts.rings || opts.labels)) {
    for (let i = 0; i < n; i++) {
      if (map.terrain[i] === DEEP_WATER || !vis(i)) continue;
      const total = hexTotal(counts, civs, i);
      if (total === 0) continue;
      const { x, y } = hexCentre(cols, i);
      if (opts.rings) {
        ctx.beginPath();
        ctx.arc(x, y, RING_RADIUS, 0, 2 * Math.PI);
        ctx.lineWidth = RING_WIDTH + 1.5 * px * dpr;
        ctx.strokeStyle = 'rgba(11,14,19,0.6)';
        ctx.stroke();
        ctx.lineCap = 'butt';
        for (const { civ, from, to } of ringArcs(counts, civs, i)) {
          ctx.beginPath();
          ctx.arc(x, y, RING_RADIUS, -Math.PI / 2 + 2 * Math.PI * from, -Math.PI / 2 + 2 * Math.PI * to);
          ctx.lineWidth = RING_WIDTH;
          ctx.strokeStyle = rgbCss(civStyle(civ).rgb);
          ctx.stroke();
        }
      }
      if (opts.labels) {
        const c = largestCiv(counts, civs, i);
        const dy = opts.counts ? -0.16 * HEX_SIZE : 0;
        emblemAt(ctx, c, x, y + dy, LABEL_R * (opts.counts ? 0.85 : 1), LABEL_R * 0.25);
        if (opts.counts) {
          ctx.font = `700 ${0.34 * HEX_SIZE}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 0.07 * HEX_SIZE;
          ctx.strokeStyle = CASING;
          ctx.fillStyle = '#ffffff';
          const t = shortCount(total);
          ctx.strokeText(t, x, y + 0.28 * HEX_SIZE);
          ctx.fillText(t, x, y + 0.28 * HEX_SIZE);
        }
      }
    }
  }

  if (pop && opts.people) {
    for (let k = 0; k < pop.high; k++) {
      if (!pop.alive[k]) continue;
      const hx = pop.hex[k];
      if (!vis(hx)) continue;
      const c = hexCentre(cols, hx);
      const spot = personSpot(pop.id[k], SPREAD_R);
      emblemAt(ctx, pop.civ[k], c.x + spot.dx, c.y + spot.dy, PERSON_R * 1.15, PERSON_R * 0.3);
    }
  }

  if (opts.mark !== undefined && opts.mark >= 0) {
    polygon(ctx, cols, opts.mark);
    ctx.lineWidth = 0.09 * HEX_SIZE;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  return s / dpr;
}
