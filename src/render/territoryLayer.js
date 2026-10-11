// Civ overlays on the map (RULES.md "How civs and people look"): the hex tint
// toward its civs' colour, the shared-hex ring around each head count, and each
// civ's territory outline. One Graphics per overlay, rebuilt only when a new
// population snapshot actually changed the people per hex, and only on the
// renderer's throttled redraw clock (the same one as the hex labels), so a
// frame that only pans or zooms costs nothing extra here.

import { Graphics } from '../../vendor/pixi.mjs';
import { hexPolygon, hexCentre } from './layout.js';
import { CIV_STYLES } from './civStyle.js';
import { rgbToHex } from './palette.js';
import { DEEP_WATER } from '../sim/terrain.js';
import {
  ringArcs, civMix, outlineSegments, RING_RADIUS, RING_WIDTH, OUTLINE_WIDTH, TINT_AMOUNT,
} from './territory.js';

const CASING = 0x0b0e13; // dark line under the coloured ones, so yellow on desert still reads

export class TerritoryLayer {
  constructor(map) {
    this.map = map;
    this.n = map.cols * map.rows;
    this.colours = CIV_STYLES.map((s) => rgbToHex(s.rgb));
    this.centres = [];
    for (let h = 0; h < this.n; h++) this.centres.push(hexCentre(map.cols, h));
    this.tint = new Graphics();
    this.tint.alpha = TINT_AMOUNT;
    this.rings = new Graphics();
    this.outlines = new Graphics();
    this.counts = null; // the people per hex per civ last drawn
    this.civs = 0;
    this.pending = null; // a changed snapshot not drawn yet
    this.ringsStale = false;
  }

  /** Take a population snapshot; returns true if the people per hex changed since the last one drawn. */
  setPopulation(data) {
    const p = data.hexCivPop;
    const last = this.pending ?? this.counts;
    if (last && last.length === p.length && this.civs === data.civs) {
      let same = true;
      for (let i = 0; i < p.length; i++) if (p[i] !== last[i]) { same = false; break; }
      if (same) return false;
    }
    this.pending = Int32Array.from(p);
    this.civs = data.civs;
    return true;
  }

  /**
   * Redraw what changed (a pending snapshot only if takeNew). Rings are only
   * rebuilt while they are on screen (zoomed out).
   */
  update(ringsShown, takeNew = true) {
    this.rings.visible = ringsShown;
    if (takeNew && this.pending) {
      this.counts = this.pending;
      this.pending = null;
      this.drawTint();
      this.drawOutlines();
      this.ringsStale = true;
    }
    if (ringsShown && this.ringsStale) this.drawRings();
  }

  drawTint() {
    const g = this.tint.clear();
    const { counts, civs, map } = this;
    for (let h = 0; h < this.n; h++) {
      if (map.terrain[h] === DEEP_WATER) continue;
      const mix = civMix(counts, civs, h);
      if (!mix) continue;
      g.poly(hexPolygon(map.cols, h)).fill({ color: rgbToHex(mix.map(Math.round)) });
    }
  }

  drawRings() {
    this.ringsStale = false;
    const g = this.rings.clear();
    const { counts, civs, map } = this;
    let any = false;
    for (let h = 0; h < this.n; h++) {
      if (map.terrain[h] === DEEP_WATER) continue;
      let total = 0;
      for (let c = 0; c < civs; c++) total += counts[h * civs + c];
      if (total === 0) continue;
      const { x, y } = this.centres[h];
      g.circle(x, y, RING_RADIUS);
      any = true;
    }
    if (!any) return;
    g.stroke({ width: RING_WIDTH + 1.5, color: CASING, alpha: 0.6 });
    for (let h = 0; h < this.n; h++) {
      if (map.terrain[h] === DEEP_WATER) continue;
      const arcs = ringArcs(counts, civs, h);
      if (!arcs.length) continue;
      const { x, y } = this.centres[h];
      for (const { civ, from, to } of arcs) {
        const color = this.colours[civ % this.colours.length];
        if (from === 0 && to === 1) { g.circle(x, y, RING_RADIUS).stroke({ width: RING_WIDTH, color }); continue; }
        const a0 = -Math.PI / 2 + 2 * Math.PI * from;
        const a1 = -Math.PI / 2 + 2 * Math.PI * to;
        g.moveTo(x + RING_RADIUS * Math.cos(a0), y + RING_RADIUS * Math.sin(a0))
          .arc(x, y, RING_RADIUS, a0, a1)
          .stroke({ width: RING_WIDTH, color, cap: 'butt' });
      }
    }
  }

  drawOutlines() {
    const g = this.outlines.clear();
    const { counts, civs, map } = this;
    const segs = [];
    for (let c = 0; c < civs; c++) segs.push(outlineSegments(counts, civs, map.cols, map.rows, c));
    const trace = (s) => { for (let i = 0; i < s.length; i += 4) g.moveTo(s[i], s[i + 1]).lineTo(s[i + 2], s[i + 3]); };
    // All casings first, then every civ's colour on top, so no casing hides another civ's line.
    for (let c = 0; c < civs; c++) {
      if (!segs[c].length) continue;
      trace(segs[c]);
      g.stroke({ width: OUTLINE_WIDTH + 2, color: CASING, alpha: 0.55, cap: 'round', join: 'round' });
    }
    for (let c = 0; c < civs; c++) {
      if (!segs[c].length) continue;
      trace(segs[c]);
      g.stroke({ width: OUTLINE_WIDTH, color: this.colours[c % this.colours.length], cap: 'round', join: 'round' });
    }
  }
}
