// Map camera: scale is screen CSS pixels per cell; (x, y) is where cell (0, 0)'s
// top-left corner sits on screen.

export class Camera {
  constructor() {
    this.scale = 4;
    this.x = 0;
    this.y = 0;
    this.viewW = 1;
    this.viewH = 1;
    this.mapW = 1;
    this.mapH = 1;
    this.minScale = 1;
    this.maxScale = 64;
  }

  setView(w, h) {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
  }

  setMap(w, h) {
    this.mapW = w;
    this.mapH = h;
  }

  /** Fit the whole map inside the view, leaving room for overlays (insets in CSS px). */
  fit({ top = 0, bottom = 0, right = 0 } = {}) {
    const availW = Math.max(50, this.viewW - right);
    const availH = Math.max(50, this.viewH - top - bottom);
    const s = Math.min((availW - 16) / this.mapW, (availH - 16) / this.mapH);
    this.scale = Math.max(0.5, s);
    this.minScale = this.scale * 0.6;
    this.x = (availW - this.mapW * this.scale) / 2;
    this.y = top + (availH - this.mapH * this.scale) / 2;
  }

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Zoom by factor keeping the screen point (sx, sy) fixed. */
  zoomAt(factor, sx, sy) {
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const k = next / this.scale;
    this.x = sx - (sx - this.x) * k;
    this.y = sy - (sy - this.y) * k;
    this.scale = next;
    this.clamp();
  }

  /** Keep at least a margin of the map on screen. */
  clamp() {
    const margin = 48;
    const w = this.mapW * this.scale;
    const h = this.mapH * this.scale;
    this.x = Math.min(this.viewW - margin, Math.max(margin - w, this.x));
    this.y = Math.min(this.viewH - margin, Math.max(margin - h, this.y));
  }

  screenToCell(sx, sy) {
    return { x: Math.floor((sx - this.x) / this.scale), y: Math.floor((sy - this.y) / this.scale) };
  }
}
