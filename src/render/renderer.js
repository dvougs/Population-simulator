// PixiJS renderer for the hex map. The map is built once into static Graphics;
// panning and zooming only move and scale the world container, so a frame costs
// a single GPU draw of geometry that never changes.

import { Application, Container, Graphics } from '../../vendor/pixi.mjs';
import { hexPolygon, riverSegments, HEX_SIZE } from './layout.js';
import { hexRgb, rgbToHex, RIVER_RGB } from './palette.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = null;
    this.world = null;
    this.map = null;
    this.selected = -1;
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

    const grid = new Graphics();
    for (let i = 0; i < map.cols * map.rows; i++) grid.poly(hexPolygon(map.cols, i));
    grid.stroke({ width: 1.2, color: 0x000000, alpha: 0.22 });

    this.selection = new Graphics();
    this.world.addChild(terrain, rivers, grid, this.selection);
    this.selected = -1;
  }

  resize(cssW, cssH, dpr) {
    if (!this.app) return;
    this.app.renderer.resize(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)), dpr);
  }

  /** Draw the map under the camera, outlining hex `selected` (-1 for none). */
  draw(camera, selected = -1) {
    if (!this.app || !this.map) return;
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
}
