// PixiJS renderer for the hex map. The map is built once into static Graphics;
// panning and zooming only move and scale the world container, so a frame costs
// a single GPU draw of geometry that never changes.
//
// Water shimmer: water hexes and rivers also go into one white overlay
// Graphics built once with the map. The only per-frame change is that one
// object's alpha (driven by render time, never by the sim), so the water
// slowly brightens and dims like a tide. Shimmer-only redraws are rare (a few
// a second at most, and only when the alpha has visibly moved), and any other
// redraw (panning, a tick) already carries the new alpha, so the shimmer adds
// almost no frame cost even in a software-rendered browser.

import { Application, Container, Graphics } from '../../vendor/pixi.mjs';
import { hexPolygon, riverSegments, HEX_SIZE } from './layout.js';
import { hexColours, rgbToHex, RIVER_RGB } from './palette.js';
import { DEEP_WATER } from '../sim/terrain.js';

const SHIMMER_PERIOD_MS = 8000; // one full swell: slow, like a tide
const SHIMMER_ALPHA = 0.1; // peak white over the water: gentle
const SHIMMER_STEPS = 6; // alpha levels; a redraw is due only when the level changes
const SHIMMER_FRAME_MS = 400; // shimmer-only redraws at most 2.5 a second (about 1.5 on average)

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = null;
    this.world = null;
    this.map = null;
    this.selected = -1;
    this.shimmer = null;
    this.shimmerLevel = -1;
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
    return this.shimmer !== null && !this.reducedMotion;
  }

  /** Whether a redraw is due for the shimmer alone (nothing else changed). */
  needsFrame(now) {
    if (!this.map) return false;
    if (this.motionChanged) return true;
    if (!this.animating || now - this.lastShimmer < SHIMMER_FRAME_MS) return false;
    return shimmerLevel(now) !== this.shimmerLevel;
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
    const colours = hexColours(map);
    for (let i = 0; i < map.cols * map.rows; i++) {
      terrain.poly(hexPolygon(map.cols, i)).fill({ color: rgbToHex(colours[i]) });
    }

    const rivers = new Graphics();
    for (const [x0, y0, x1, y1] of riverSegments(map)) rivers.moveTo(x0, y0).lineTo(x1, y1);
    rivers.stroke({ width: HEX_SIZE * 0.22, color: rgbToHex(RIVER_RGB), cap: 'round', join: 'round' });

    this.shimmer = buildShimmer(map);
    this.shimmerLevel = -1;

    const grid = new Graphics();
    for (let i = 0; i < map.cols * map.rows; i++) grid.poly(hexPolygon(map.cols, i));
    grid.stroke({ width: 1.2, color: 0x000000, alpha: 0.22 });

    this.selection = new Graphics();
    this.world.addChild(terrain, rivers);
    if (this.shimmer) this.world.addChild(this.shimmer);
    this.world.addChild(grid, this.selection);
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
    const band = this.shimmer;
    if (!band) return;
    band.visible = !this.reducedMotion;
    if (this.reducedMotion) return;
    const level = shimmerLevel(now);
    if (level === this.shimmerLevel) return;
    this.shimmerLevel = level;
    band.alpha = (SHIMMER_ALPHA * level) / SHIMMER_STEPS;
  }
}

/** Quantised shimmer brightness at render time `now`: 0..SHIMMER_STEPS. */
function shimmerLevel(now) {
  const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / SHIMMER_PERIOD_MS);
  return Math.round(wave * SHIMMER_STEPS);
}

/** One white overlay holding every water hex and river segment, or null if there is no water. */
function buildShimmer(map) {
  const g = new Graphics();
  let any = false;
  for (let i = 0; i < map.cols * map.rows; i++) {
    if (map.terrain[i] !== DEEP_WATER) continue;
    g.poly(hexPolygon(map.cols, i)).fill({ color: 0xffffff });
    any = true;
  }
  const segs = riverSegments(map);
  if (segs.length) {
    for (const [x0, y0, x1, y1] of segs) g.moveTo(x0, y0).lineTo(x1, y1);
    g.stroke({ width: HEX_SIZE * 0.22, color: 0xffffff, cap: 'round', join: 'round' });
    any = true;
  }
  if (!any) { g.destroy(); return null; }
  g.alpha = 0;
  return g;
}
