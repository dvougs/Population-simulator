// PixiJS renderer for the hex map. The map is built once into static Graphics;
// panning and zooming only move and scale the world container, so a frame costs
// a single GPU draw of geometry that never changes.
//
// Water shimmer: water hexes and rivers also go into a few white overlay
// Graphics, one per phase band across the map. Each frame only their alpha
// changes (driven by render time, never by the sim), so a wave of light drifts
// slowly over the water without rebuilding any geometry.

import { Application, Container, Graphics } from '../../vendor/pixi.mjs';
import { hexPolygon, riverSegments, HEX_SIZE } from './layout.js';
import { hexRgb, rgbToHex, RIVER_RGB } from './palette.js';
import { DEEP_WATER } from '../sim/terrain.js';

const SHIMMER_PHASES = 8; // bands per wavelength; more bands give a smoother wave
const SHIMMER_PERIOD_MS = 5000; // one full swell
const SHIMMER_ALPHA = 0.09; // peak white over the water: gentle
const SHIMMER_FRAME_MS = 50; // ~20 redraws a second is plenty for a slow wave and saves battery

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = null;
    this.world = null;
    this.map = null;
    this.selected = -1;
    this.shimmer = [];
    this.lastShimmer = -Infinity;
    this.motionChanged = false;
    this.reducedMotion = false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      mq.addEventListener?.('change', (e) => { this.reducedMotion = e.matches; this.motionChanged = true; });
    }
  }

  /** True while the water is animating, so the frame loop keeps redrawing. */
  get animating() {
    return this.shimmer.length > 0 && !this.reducedMotion;
  }

  /** Whether a redraw is due for the shimmer alone (nothing else changed). */
  needsFrame(now) {
    if (!this.map) return false;
    if (this.motionChanged) return true;
    return this.animating && now - this.lastShimmer >= SHIMMER_FRAME_MS;
  }

  async init() {
    const app = new Application();
    await app.init({
      canvas: this.canvas,
      preference: 'webgl',
      antialias: true,
      background: '#0b0e13',
      autoStart: false,
      sharedTicker: false,
      autoDensity: false, // the canvas keeps its CSS size; we only set its backing resolution
      width: Math.max(1, this.canvas.clientWidth),
      height: Math.max(1, this.canvas.clientHeight),
      resolution: 1,
      // Gestures are handled in src/input; Pixi's own pointer handling is not needed.
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    app.stage.eventMode = 'none';
    this.app = app;
    this.world = new Container();
    app.stage.addChild(this.world);
  }

  setMap(map) {
    this.map = map;
    for (const child of this.world.removeChildren()) child.destroy();

    const terrain = new Graphics();
    for (let i = 0; i < map.cols * map.rows; i++) {
      terrain.poly(hexPolygon(map.cols, i)).fill({ color: rgbToHex(hexRgb(map, i)) });
    }

    const rivers = new Graphics();
    for (const [x0, y0, x1, y1] of riverSegments(map)) rivers.moveTo(x0, y0).lineTo(x1, y1);
    rivers.stroke({ width: HEX_SIZE * 0.22, color: rgbToHex(RIVER_RGB), cap: 'round', join: 'round' });

    const shimmer = buildShimmer(map);
    this.shimmer = shimmer;

    const grid = new Graphics();
    for (let i = 0; i < map.cols * map.rows; i++) grid.poly(hexPolygon(map.cols, i));
    grid.stroke({ width: 1.2, color: 0x000000, alpha: 0.22 });

    this.selection = new Graphics();
    this.world.addChild(terrain, rivers, ...shimmer, grid, this.selection);
    this.selected = -1;
  }

  resize(cssW, cssH, dpr) {
    if (!this.app) return;
    this.app.renderer.resize(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)), dpr);
  }

  /** Draw the map under the camera, outlining hex `selected` (-1 for none). `now` is render time in ms. */
  draw(camera, selected = -1, now = performance.now()) {
    if (!this.app || !this.map) return;
    this.updateShimmer(now);
    if (selected !== this.selected) {
      this.selected = selected;
      this.selection.clear();
      if (selected >= 0) {
        this.selection.poly(hexPolygon(this.map.cols, selected)).stroke({ width: 4, color: 0xffffff, alignment: 0.5 });
      }
    }
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.scale);
    this.app.render();
  }

  updateShimmer(now) {
    this.lastShimmer = now;
    this.motionChanged = false;
    const still = this.reducedMotion;
    for (let g = 0; g < this.shimmer.length; g++) {
      const band = this.shimmer[g];
      band.visible = !still;
      if (still) continue;
      const angle = 2 * Math.PI * (now / SHIMMER_PERIOD_MS - g / SHIMMER_PHASES);
      band.alpha = SHIMMER_ALPHA * (0.5 + 0.5 * Math.sin(angle));
    }
  }
}

/**
 * One white overlay per phase band, holding the water hexes and river
 * segments in that band. Bands run diagonally (column + row), so the light
 * appears to drift across the water. Empty bands are dropped.
 */
function buildShimmer(map) {
  const bands = [];
  for (let g = 0; g < SHIMMER_PHASES; g++) bands.push(new Graphics());
  const used = new Uint8Array(SHIMMER_PHASES);
  const band = (i) => {
    const col = i % map.cols;
    return (col + (i - col) / map.cols) % SHIMMER_PHASES;
  };
  for (let i = 0; i < map.cols * map.rows; i++) {
    if (map.terrain[i] !== DEEP_WATER) continue;
    const g = band(i);
    bands[g].poly(hexPolygon(map.cols, i)).fill({ color: 0xffffff });
    used[g] = 1;
  }
  // Rivers shimmer with the band of the hex they start from.
  const segs = riverSegments(map);
  let s = 0;
  for (let i = 0; i < map.cols * map.rows; i++) {
    if (!map.river[i] || map.riverTo[i] < 0) continue;
    const [x0, y0, x1, y1] = segs[s++];
    const g = band(i);
    bands[g].moveTo(x0, y0).lineTo(x1, y1);
    used[g] |= 2;
  }
  for (let g = 0; g < SHIMMER_PHASES; g++) {
    if (used[g] & 2) bands[g].stroke({ width: HEX_SIZE * 0.22, color: 0xffffff, cap: 'round', join: 'round' });
  }
  const out = [];
  for (let g = 0; g < SHIMMER_PHASES; g++) {
    if (used[g]) out.push(bands[g]);
    else bands[g].destroy();
  }
  for (const b of out) b.alpha = 0;
  return out;
}
