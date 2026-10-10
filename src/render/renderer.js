// Canvas 2D renderer. The world is painted into a one-pixel-per-cell image,
// which is then drawn scaled under the camera with smoothing off.

import { TERRAIN_RGB } from './palette.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.image = null;
    this.world = null;
    this.civs = null;
  }

  setWorld(world, civs) {
    this.world = world;
    this.civs = civs;
    this.off.width = world.width;
    this.off.height = world.height;
    this.image = this.offCtx.createImageData(world.width, world.height);
    this.updateImage();
  }

  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Repaint the cell image from the current world state. */
  updateImage() {
    const { world, civs } = this;
    if (!world) return;
    const { width, size, terrain, owner, food, foodCap, capacity, young, adult, elder } = world;
    const data = this.image.data;
    for (let i = 0; i < size; i++) {
      const t = terrain[i];
      const base = TERRAIN_RGB[t];
      // Depleted land looks paler.
      const stock = foodCap[i] > 0 ? 0.82 + 0.18 * (food[i] / foodCap[i]) : 1;
      let r = base[0] * stock, g = base[1] * stock, b = base[2] * stock;
      const o = owner[i];
      if (o !== 0) {
        const c = civs[o].color;
        const x = i % width;
        const border =
          (x > 0 && owner[i - 1] !== o) || (x < width - 1 && owner[i + 1] !== o) ||
          (i >= width && owner[i - width] !== o) || (i + width < size && owner[i + width] !== o);
        const density = Math.min(1, (young[i] + adult[i] + elder[i]) / Math.max(1, capacity[i]));
        const a = border ? 0.92 : 0.38 + 0.4 * density;
        r += (c[0] - r) * a;
        g += (c[1] - g) * a;
        b += (c[2] - b) * a;
      }
      const p = i * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
    this.offCtx.putImageData(this.image, 0, 0);
  }

  draw(camera, selected) {
    const { ctx, dpr, world } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!world) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const s = camera.scale;
    ctx.drawImage(this.off, camera.x, camera.y, world.width * s, world.height * s);

    if (s >= 14) this.drawGrid(camera);

    if (selected) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(camera.x + selected.x * s - 1, camera.y + selected.y * s - 1, s + 2, s + 2);
    }
  }

  drawGrid(camera) {
    const { ctx, world } = this;
    const s = camera.scale;
    const x0 = Math.max(0, Math.floor(-camera.x / s));
    const y0 = Math.max(0, Math.floor(-camera.y / s));
    const x1 = Math.min(world.width, Math.ceil((camera.viewW - camera.x) / s));
    const y1 = Math.min(world.height, Math.ceil((camera.viewH - camera.y) / s));
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const px = Math.round(camera.x + x * s) + 0.5;
      ctx.moveTo(px, camera.y + y0 * s);
      ctx.lineTo(px, camera.y + y1 * s);
    }
    for (let y = y0; y <= y1; y++) {
      const py = Math.round(camera.y + y * s) + 0.5;
      ctx.moveTo(camera.x + x0 * s, py);
      ctx.lineTo(camera.x + x1 * s, py);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();
  }
}
