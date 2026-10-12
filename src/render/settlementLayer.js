// Settlements on the map (RULES.md "Settlements" and "How civs and people
// look"). Every lived-in hex shows a small skyline for its tier, in the holder's
// colour: tents for a camp, a few huts for a village, roofs for a town, walls
// and a tower for a city, a dense block for a metropolis and spires for a
// megapolis. The roofs follow the civ type (tents for Nomadic, domes for
// Cooperative, battlements for Aggressive, steps for Isolationist, pitched
// roofs for Expansionist), so who is who reads before the colour does. A
// capital carries a small gold flag.
//
// Zoomed out the skyline sits low in the hex, under the head count; zoomed in
// (people drawn one by one) it stands larger in the middle, ringed by an icon
// for each settlement building, faded with scaffolding while it is being built.
//
// Supply routes are lines from supplier to settlement, thicker with more goods
// (food in green, materials in tan). While people are drawn and time runs,
// small carts travel along them on render time only; the sim never sees them.
//
// Cheap by design: each hex's Graphics is redrawn only when its look (tier,
// holder, capital, buildings) changes; routes only when the routes change.

import { Container, Graphics } from '../../vendor/pixi.mjs';
import { hexCentre, HEX_SIZE } from './layout.js';
import { civStyle } from './civStyle.js';
import { rgbToHex } from './palette.js';
import { SETTLEMENT_BUILDINGS, SB_COUNT } from '../sim/settlements.js';

const CASING = 0x0b0e13;
const GOLD = 0xf2c14e;
const FOOD = 0x8fd16a;
const GOODS = 0xd9b77e;
/** Skyline scale and offset (in hex sizes) zoomed out and zoomed in. */
const OUT = { scale: 0.45, dy: 0.66 };
const IN = { scale: 0.85, dy: 0.45 };
/** Building icons ring radius (hex sizes) and icon radius (world units) when zoomed in. */
const ICON_RING = 0.66;
const ICON_R = 3.6;
/** Carts: how many per route and how long one trip takes (render time). */
const CARTS = 2;
const TRIP_MS = 5000;

const lighten = (rgb, k) => rgbToHex(rgb.map((v) => Math.round(v + (255 - v) * k)));
const darken = (rgb, k) => rgbToHex(rgb.map((v) => Math.round(v * (1 - k))));

/**
 * Each tier's skyline: buildings as [x centre, width, height] on a base line at y = 0 (local units,
 * the whole skyline about 40 wide), plus extras: 'wall' along the base, 'tower' and 'spire' heights.
 */
const SKYLINES = [
  { blocks: [[-6, 9, 7], [5, 8, 6]] },
  { blocks: [[-12, 8, 7], [-2, 9, 9], [9, 8, 7]] },
  { blocks: [[-15, 8, 8], [-6, 9, 11], [4, 8, 9], [13, 8, 8]], tower: [0, 16] },
  { blocks: [[-15, 7, 10], [-7, 8, 14], [2, 7, 12], [10, 8, 11]], tower: [-1, 22], wall: true },
  { blocks: [[-17, 6, 12], [-10, 7, 18], [-3, 6, 15], [4, 7, 20], [11, 6, 14], [17, 5, 11]], tower: [0, 26], wall: true },
  { blocks: [[-18, 6, 16], [-11, 6, 24], [-4, 6, 20], [3, 6, 28], [10, 6, 22], [17, 6, 15]], spires: [[-11, 32], [3, 38], [10, 30]], wall: true },
];

/** A roof over a block [x, w] at height top, by civ type; nomadic camps and villages are tents throughout. */
function roof(g, type, x, w, top, colour) {
  const l = x - w / 2;
  const r = x + w / 2;
  if (type === 'nomadic') g.poly([l - 1, top + 2, x, top - w * 0.7, r + 1, top + 2]);
  else if (type === 'cooperative') g.moveTo(l, top).arc(x, top, w / 2, Math.PI, 0).closePath();
  else if (type === 'aggressive') {
    const k = w / 5;
    g.poly([l, top, l, top - 3, l + k, top - 3, l + k, top - 1, l + 2 * k, top - 1, l + 2 * k, top - 3, l + 3 * k, top - 3,
      l + 3 * k, top - 1, l + 4 * k, top - 1, l + 4 * k, top - 3, r, top - 3, r, top]);
  } else if (type === 'isolationist') g.poly([l, top, l, top - 2, l + w * 0.2, top - 2, l + w * 0.2, top - 4, r - w * 0.2, top - 4, r - w * 0.2, top - 2, r, top - 2, r, top]);
  else g.poly([l - 1, top, x, top - w * 0.55, r + 1, top]);
  g.fill(colour).stroke({ width: 0.8, color: CASING, alpha: 0.8, join: 'round' });
}

/** Draw the skyline of `tier` for civ `civ` of type `type` into g, base centred on (0, 0). */
function drawSkyline(g, tier, civ, type, capital) {
  const rgb = civStyle(civ).rgb;
  const body = lighten(rgb, 0.25);
  const top = darken(rgb, 0.2);
  const sky = SKYLINES[tier];
  // Ground shadow so it reads on any terrain.
  g.ellipse(0, 1, 23, 3.2).fill({ color: CASING, alpha: 0.35 });
  if (sky.wall) {
    g.rect(-21, -4, 42, 5).fill(darken(rgb, 0.45)).stroke({ width: 0.8, color: CASING, alpha: 0.8 });
  }
  if (sky.tower) {
    const [x, hgt] = sky.tower;
    g.rect(x - 2.5, -hgt, 5, hgt).fill(body).stroke({ width: 0.8, color: CASING, alpha: 0.8 });
    roof(g, type, x, 6, -hgt, top);
  }
  if (sky.spires) {
    for (const [x, hgt] of sky.spires) {
      g.poly([x - 2.2, 0, x - 1.2, -hgt, x, -hgt - 5, x + 1.2, -hgt, x + 2.2, 0]).fill(lighten(rgb, 0.45)).stroke({ width: 0.8, color: CASING, alpha: 0.8, join: 'round' });
    }
  }
  const tent = type === 'nomadic' && tier <= 1;
  for (const [x, w, hgt] of sky.blocks) {
    if (tent || tier === 0) {
      // Tents and huts: no walls, just the roof shape on the ground.
      roof(g, tent || tier === 0 ? 'nomadic' : type, x, w, 0, body);
      continue;
    }
    g.rect(x - w / 2, -hgt, w, hgt).fill(body).stroke({ width: 0.8, color: CASING, alpha: 0.8 });
    // Windows, so bigger tiers read as towns rather than boxes.
    if (tier >= 2) for (let y = -hgt + 3; y < -2; y += 4) g.rect(x - 1, y, 2, 1.6).fill({ color: CASING, alpha: 0.5 });
    roof(g, type, x, w, -hgt, top);
  }
  if (capital) {
    const hgt = (sky.tower ? sky.tower[1] : 12) + 8;
    const x = sky.tower ? sky.tower[0] : 0;
    g.moveTo(x, -hgt + 8).lineTo(x, -hgt - 2).stroke({ width: 1, color: CASING });
    g.poly([x, -hgt - 2, x + 7, -hgt + 0.5, x, -hgt + 3]).fill(GOLD).stroke({ width: 0.6, color: CASING });
  }
}

/** Small icon of a settlement building's kind into g at (x, y). */
function drawBuildingIcon(g, kind, x, y, rgb, building) {
  const a = building ? 0.45 : 1;
  g.circle(x, y, ICON_R + 0.8).fill({ color: CASING, alpha: 0.7 * (building ? 0.6 : 1) });
  const c = { color: lighten(rgb, 0.35), alpha: a };
  const r = ICON_R * 0.7;
  if (kind === 'housing') g.poly([x - r, y + r, x - r, y - r * 0.1, x, y - r, x + r, y - r * 0.1, x + r, y + r]).fill(c);
  else if (kind === 'food') { for (const dx of [-r * 0.6, 0, r * 0.6]) g.moveTo(x + dx, y + r).lineTo(x + dx, y - r); g.stroke({ width: 1.1, color: FOOD, alpha: a }); }
  else if (kind === 'industry') g.moveTo(x - r, y + r).lineTo(x + r, y - r).moveTo(x - r * 0.4, y - r).lineTo(x + r, y - r * 0.2).stroke({ width: 1.2, color: 0xc8c8c8, alpha: a });
  else if (kind === 'trade') g.rect(x - r, y - r * 0.7, 2 * r, 1.4 * r).fill({ color: GOODS, alpha: a });
  else if (kind === 'civic') { g.rect(x - r, y + r * 0.6, 2 * r, r * 0.4).rect(x - r * 0.7, y - r * 0.4, r * 0.4, r).rect(x + r * 0.3, y - r * 0.4, r * 0.4, r); g.poly([x - r, y - r * 0.4, x, y - r, x + r, y - r * 0.4]); g.fill(c); }
  else g.poly([x - r, y - r, x + r, y - r, x + r, y, x, y + r, x - r, y]).fill(c);
  if (building) g.moveTo(x - r, y + r).lineTo(x + r, y - r).moveTo(x - r, y - r).lineTo(x + r, y + r).stroke({ width: 0.6, color: 0xf5e6c8, alpha: 0.9 });
}

export class SettlementLayer {
  /** types[c]: civ c's type id. */
  constructor(map, types = []) {
    this.cols = map.cols;
    this.types = types;
    this.container = new Container();
    this.routesG = new Graphics();
    this.cartsG = new Graphics();
    this.towns = new Container();
    this.container.addChild(this.routesG, this.towns, this.cartsG);
    this.glyphs = new Map(); // hex → { g, look }
    this.snap = null;
    this.routeSig = '';
    this.zoomedIn = null;
    this.routeList = [];
  }

  /** New SimHost.settlements() snapshot; returns true if anything on the map changed. */
  setSettlements(data) {
    if (!data) return false;
    let changed = false;
    this.snap = data;
    const { tier, holder, built, plan, started, capital } = data;
    const seen = new Set();
    for (let h = 0; h < tier.length; h++) {
      const t = tier[h];
      if (t < 0) continue;
      seen.add(h);
      const c = holder[h];
      const look = `${t}:${c}:${capital[c] === h ? 1 : 0}:${built[h]}:${plan[h]}:${started[h]}`;
      let gl = this.glyphs.get(h);
      if (!gl) {
        gl = { g: new Graphics(), look: '', icons: new Graphics() };
        this.glyphs.set(h, gl);
        this.towns.addChild(gl.g, gl.icons);
        const ctr = hexCentre(this.cols, h);
        gl.x = ctr.x; gl.y = ctr.y;
        this.zoomedIn = null; // place it
      }
      if (gl.look !== look) {
        gl.look = look;
        gl.g.clear();
        drawSkyline(gl.g, t, c, this.types[c], capital[c] === h);
        this.drawIcons(gl.icons, h, c);
        changed = true;
      }
    }
    for (const [h, gl] of this.glyphs) {
      if (seen.has(h)) continue;
      gl.g.destroy(); gl.icons.destroy();
      this.glyphs.delete(h);
      changed = true;
    }
    // Routes: one line per supplier → settlement pair, redrawn when the set changes.
    const r = data.routes;
    let sig = '';
    for (let k = 0; k < r.from.length; k++) sig += `${r.from[k]}>${r.to[k]}:${Math.round(r.food[k])}/${Math.round(r.materials[k])};`;
    if (sig !== this.routeSig) {
      this.routeSig = sig;
      this.drawRoutes(r);
      changed = true;
    }
    return changed;
  }

  drawIcons(g, h, c) {
    g.clear();
    const { built, plan, started } = this.snap;
    const rgb = civStyle(c).rgb;
    const list = [];
    for (let k = 0; k < SB_COUNT; k++) if (built[h] & (1 << k)) list.push([SETTLEMENT_BUILDINGS[k].kind, false]);
    if (plan[h] >= 0 && started[h]) list.push([SETTLEMENT_BUILDINGS[plan[h]].kind, true]);
    const n = list.length;
    list.forEach(([kind, building], i) => {
      // Spread over the upper arc, clear of the skyline below.
      const a = Math.PI + (Math.PI * (i + 0.5)) / Math.max(n, 3);
      drawBuildingIcon(g, kind, Math.cos(a) * ICON_RING * HEX_SIZE, Math.sin(a) * ICON_RING * HEX_SIZE, rgb, building);
    });
  }

  drawRoutes(r) {
    const g = this.routesG;
    g.clear();
    this.routeList = [];
    for (let k = 0; k < r.from.length; k++) {
      const a = hexCentre(this.cols, r.from[k]);
      const b = hexCentre(this.cols, r.to[k]);
      const amount = r.food[k] + r.materials[k];
      const width = Math.min(4, 1 + amount / 6);
      const colour = r.food[k] >= r.materials[k] ? FOOD : GOODS;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: width + 1.6, color: CASING, alpha: 0.35, cap: 'round' });
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color: colour, alpha: 0.75, cap: 'round' });
      this.routeList.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, colour, phase: (r.from[k] * 7 + r.to[k] * 13) % 100 / 100 });
    }
  }

  /** Place for this frame: zoomedIn while people are drawn one by one; carts move on render time `now` while `moving`. */
  update(zoomedIn, now, moving) {
    if (zoomedIn !== this.zoomedIn) {
      this.zoomedIn = zoomedIn;
      const p = zoomedIn ? IN : OUT;
      for (const gl of this.glyphs.values()) {
        gl.g.scale.set(p.scale * (HEX_SIZE / 32));
        gl.g.position.set(gl.x, gl.y + p.dy * HEX_SIZE);
        gl.icons.position.set(gl.x, gl.y);
        gl.icons.visible = zoomedIn;
      }
    }
    const carts = this.cartsG;
    carts.clear();
    if (!zoomedIn || !moving) { carts.visible = false; return; }
    carts.visible = true;
    for (const rt of this.routeList) {
      for (let k = 0; k < CARTS; k++) {
        const t = ((now / TRIP_MS + rt.phase + k / CARTS) % 1 + 1) % 1;
        const x = rt.ax + (rt.bx - rt.ax) * t;
        const y = rt.ay + (rt.by - rt.ay) * t;
        carts.circle(x, y, 2.4).fill({ color: rt.colour }).stroke({ width: 0.8, color: CASING });
      }
    }
  }

  /** True while carts are moving (the frame loop must keep drawing). */
  get animating() { return this.routeList.length > 0; }

  destroy() {
    this.container.destroy({ children: true });
  }
}
