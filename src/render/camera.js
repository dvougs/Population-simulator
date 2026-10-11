// Map camera. World coordinates are hex-layout pixels (see sim/hex.js and
// HEX_SIZE); scale is screen CSS pixels per world unit and (x, y) is where the
// world origin sits on screen.

export class Camera {
  constructor() {
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.viewW = 1;
    this.viewH = 1;
    this.bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    this.minScale = 0.05;
    this.maxScale = 8;
  }

  setView(w, h) {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
  }

  /** World-space bounding box of the map. */
  setBounds(bounds) {
    this.bounds = { ...bounds };
  }

  get mapW() { return this.bounds.maxX - this.bounds.minX; }
  get mapH() { return this.bounds.maxY - this.bounds.minY; }

  /** Fit the whole map inside the view, leaving room for overlays (insets in CSS px). */
  fit({ top = 0, bottom = 0, right = 0 } = {}) {
    const availW = Math.max(50, this.viewW - right);
    const availH = Math.max(50, this.viewH - top - bottom);
    this.scale = Math.max(0.01, Math.min((availW - 16) / this.mapW, (availH - 16) / this.mapH));
    // Zoom out a little past the fit, and in far enough for a hex to fill much of the screen.
    this.minScale = this.scale * 0.6;
    this.maxScale = Math.max(this.scale * 2, Math.min(this.viewW, this.viewH) / 80);
    this.x = (availW - this.mapW * this.scale) / 2 - this.bounds.minX * this.scale;
    this.y = top + (availH - this.mapH * this.scale) / 2 - this.bounds.minY * this.scale;
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
    const left = this.x + this.bounds.minX * this.scale;
    const top = this.y + this.bounds.minY * this.scale;
    const w = this.mapW * this.scale;
    const h = this.mapH * this.scale;
    this.x += Math.min(this.viewW - margin, Math.max(margin - w, left)) - left;
    this.y += Math.min(this.viewH - margin, Math.max(margin - h, top)) - top;
  }

  /** Scale and place the camera so world point (wx, wy) sits at screen point (sx, sy); no clamping. */
  viewAt(wx, wy, scale, sx, sy) {
    this.scale = scale;
    this.x = sx - wx * scale;
    this.y = sy - wy * scale;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  worldToScreen(wx, wy) {
    return { x: this.x + wx * this.scale, y: this.y + wy * this.scale };
  }
}

/** Time the tap-to-zoom flight takes, in ms. */
export const FLY_MS = 400;

/**
 * Camera at fraction t (0 to 1) of a flight that brings world point `to`
 * (x, y) to screen point (sx, sy) while zooming from scale0 to scale1. `from`
 * is the world point at (sx, sy) when the flight starts. Eased with smoothstep;
 * the world point under (sx, sy) moves in a straight line and the scale changes
 * geometrically (by equal factors per step), so zooming feels even.
 * Returns { scale, wx, wy }: the world point to put at (sx, sy).
 */
export function flightAt(from, to, scale0, scale1, t) {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const scale = scale0 * (scale1 / scale0) ** u;
  // Keep the world point moving at constant screen speed relative to the zoom.
  const k = scale1 === scale0 ? u : (1 / scale - 1 / scale0) / (1 / scale1 - 1 / scale0);
  return { scale, wx: from.x + (to.x - from.x) * k, wy: from.y + (to.y - from.y) * k };
}
