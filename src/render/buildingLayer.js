// Buildings and wonders on the map (RULES.md "Buildings and wonders"). Each one
// is a small Graphics icon in its hex: a silhouette whose outline tells the era
// (hut, house, tower, palace), a mark inside that tells the civ type, so all 20
// era buildings look different, in the owner's colour with its emblem as a
// badge. Wonders have their own silhouettes (sun, ziggurat, wall, library) on a
// gold-rimmed medallion; abandoned ones are grey. Anything under construction
// is faded, crossed by scaffolding, and ringed by its progress (work ÷ years).
//
// Zoomed out the icon sits in the hex's upper-right corner, clear of the head
// count; zoomed in it stands larger in the hex centre. Either way it is drawn
// over the people, since a crowded hex would bury it. On a far zoom it is kept
// a few screen pixels across, so wonders stay findable on a 100 × 100 map.
//
// Cheap by design: SimHost.buildings() is compared by a small signature, and
// only icons whose look changed (status, owner, a progress step) are redrawn.
// Per frame there is only a scale check over the few icons, without allocation.

import { Container, Graphics } from '../../vendor/pixi.mjs';
import { hexCentre, HEX_SIZE } from './layout.js';
import { civStyle, EMBLEM_SHAPES } from './civStyle.js';
import { rgbToHex } from './palette.js';

const CASING = 0x0b0e13;
const GOLD = 0xf2c14e;
const GREY = 0x9aa0a6;
const LEAF = 0x48c774;
/** Icons are drawn in local units: a building fits in radius ~11, a wonder's medallion is ICON_R_WONDER. */
const ICON_R = 11;
const ICON_R_WONDER = 12.5;
const TAP_PX = 22; // half of the 44 px touch target
/** Progress steps: a ring segment is redrawn only when work ÷ years crosses one of these. */
const PROGRESS_STEPS = 24;

// Placement in world units (HEX_SIZE 32): zoomed out in the corner, zoomed in in the centre.
const OUT_SPOTS = [[0.55, -0.45], [-0.55, -0.45], [0.55, 0.45], [-0.55, 0.45]];
const IN_SPOTS = [[0, 0], [-0.55, 0], [0.55, 0], [0, 0.55]];
const OUT_SCALE = { building: 1, wonder: 1.15 };
const IN_SCALE = { building: 1.45, wonder: 1.75 };
/** Smallest on-screen radius in CSS px, so far zoomed out icons do not vanish. */
const MIN_PX = { building: 6.5, wonder: 9.5 };

// Era silhouettes, base on y = 7: hut, house, tower, palace.
const crenels = (x0, x1, top, low, n) => {
  const pts = [];
  const w = (x1 - x0) / (2 * n - 1);
  for (let k = 0; k < 2 * n - 1; k++) {
    const y = k % 2 ? low : top;
    pts.push(x0 + k * w, y, x0 + (k + 1) * w, y);
  }
  return pts;
};
const ERA_SHAPES = [
  null, // hut: drawn as a dome (arc)
  [-7, 7, 7, 7, 7, -1, 0, -8.5, -7, -1],
  [-6, 7, 6, 7, ...crenels(6, -6, -9.5, -6.5, 3)],
  [-9.5, 7, 9.5, 7, 9.5, -5, 6.5, -5, 6.5, -1, 3, -1, 3, -4.5, 0, -10, -3, -4.5, -3, -1, -6.5, -1, -6.5, -5, -9.5, -5],
];

/** Type marks: dark strokes inside the silhouette, centred near (0, 2). */
const TYPE_MARKS = {
  expansionist: (g) => g.moveTo(0, 5).lineTo(0, -2).moveTo(-3, 1).lineTo(0, -2).lineTo(3, 1),
  aggressive: (g) => g.moveTo(-3, -1).lineTo(3, 5).moveTo(3, -1).lineTo(-3, 5),
  cooperative: (g) => g.circle(-1.7, 2, 2).circle(1.7, 2, 2),
  isolationist: (g) => g.rect(-2.6, -0.6, 5.2, 5.2),
  nomadic: (g) => g.moveTo(-3.4, 5).lineTo(0, -1.5).lineTo(3.4, 5).closePath(),
};

const ziggurat = [-9, 7, 9, 7, 9, 3, 6, 3, 6, -1, 3, -1, 3, -5, -3, -5, -3, -1, -6, -1, -6, 3, -9, 3];
const wall = [-10, 7, 10, 7, ...crenels(10, 3.4, -1, 1.5, 2), 3.4, -7, ...crenels(3.4, -3.4, -9.5, -7, 2), -3.4, -7, ...crenels(-3.4, -10, 1.5, -1, 2)];

/** Wonder silhouettes by era, filled with `fill`. */
const WONDER_SHAPES = [
  (g, fill) => {
    // Sun Circle: a sun over a ring of standing stones.
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.poly([4.6 * c - 1.6 * s, 4.6 * s + 1.6 * c, 9 * c, 9 * s, 4.6 * c + 1.6 * s, 4.6 * s - 1.6 * c]);
    }
    g.circle(0, 0, 4.8).fill(fill).stroke({ width: 1, color: CASING, alpha: 0.7 });
  },
  (g, fill, green) => {
    g.poly(ziggurat).fill(fill).stroke({ width: 1, color: CASING, alpha: 0.7, join: 'round' });
    if (green) for (const [x, y] of [[-7.5, 3], [7.5, 3], [-4.5, -1], [4.5, -1], [0, -5]]) g.circle(x, y, 1.5);
    if (green) g.fill(LEAF);
  },
  (g, fill) => {
    g.poly(wall).fill(fill).stroke({ width: 1, color: CASING, alpha: 0.7, join: 'round' });
    g.rect(-1.5, 3, 3, 4).fill(CASING);
  },
  (g, fill) => {
    // Grand Library: a dome on a colonnade.
    g.moveTo(-6, -2.5).arc(0, -2.5, 6, Math.PI, 0).closePath();
    g.rect(-8.5, -2.5, 17, 2.2);
    for (const x of [-7, -3, 1.4, 5.4]) g.rect(x, -0.3, 1.6, 5.8);
    g.rect(-9.5, 5.5, 19, 2);
    g.fill(fill).stroke({ width: 1, color: CASING, alpha: 0.7 });
  },
];

/** The owner's emblem, small, as a badge at (x, y). */
function badge(g, civ, x, y, r) {
  const s = civStyle(civ);
  const color = rgbToHex(s.rgb);
  const paths = EMBLEM_SHAPES[s.emblem];
  paths.forEach((path, k) => {
    const pts = [];
    for (const [px, py] of path) pts.push(x + px * r, y + py * r);
    g.poly(pts);
    if (k === 0) g.fill(color).stroke({ width: 1, color: CASING });
    else g.cut();
  });
}

/** Draw icon `b` (a SimHost.buildings() entry) into g, centred on (0, 0). */
function drawIcon(g, b, type) {
  g.clear();
  const wonder = b.kind === 'wonder';
  const abandoned = b.status === 'abandoned' || b.civ < 0;
  const building = b.status === 'building';
  const colour = abandoned ? GREY : rgbToHex(civStyle(b.civ).rgb);
  const bodyAlpha = building ? 0.5 : 1;
  const R = wonder ? ICON_R_WONDER : ICON_R;

  // Backdrop: a dark disc so the icon reads on any terrain; wonders get a gold (grey if abandoned) rim.
  g.circle(0, 0, R).fill({ color: CASING, alpha: building ? 0.45 : 0.6 });
  if (wonder) g.circle(0, 0, R).stroke({ width: 2.2, color: abandoned ? GREY : GOLD, alpha: building ? 0.6 : 1 });

  const fill = { color: colour, alpha: bodyAlpha };
  if (wonder) {
    WONDER_SHAPES[b.era - 1](g, fill, !building && !abandoned);
  } else {
    if (b.era === 1) g.moveTo(-8, 7).arc(0, 7, 8, Math.PI, 0).closePath();
    else g.poly(ERA_SHAPES[b.era - 1]);
    g.fill(fill).stroke({ width: 1.2, color: CASING, alpha: 0.8, join: 'round' });
    const mark = TYPE_MARKS[type];
    if (mark) { mark(g); g.stroke({ width: 1.5, color: CASING, alpha: building ? 0.6 : 0.9, cap: 'round', join: 'round' }); }
  }

  if (building) {
    // Scaffolding: two poles and a cross brace over the faded body.
    g.moveTo(-6, 7).lineTo(-6, -7).moveTo(6, 7).lineTo(6, -7)
      .moveTo(-6, 6).lineTo(6, -6).moveTo(-6, -6).lineTo(6, 6)
      .moveTo(-7.5, -3).lineTo(7.5, -3);
    g.stroke({ width: 0.9, color: 0xf5e6c8, alpha: 0.95, cap: 'round' });
    // Progress ring: dim track, then work ÷ years clockwise from the top.
    const share = Math.max(0, Math.min(1, b.years > 0 ? b.work / b.years : 0));
    const rr = R + 1.8;
    g.circle(0, 0, rr).stroke({ width: 2.2, color: CASING, alpha: 0.7 });
    if (share > 0) {
      const a0 = -Math.PI / 2;
      const a1 = a0 + 2 * Math.PI * Math.max(share, 0.02);
      g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr).arc(0, 0, rr, a0, a1)
        .stroke({ width: 2.2, color: wonder ? GOLD : 0xffffff, cap: 'butt' });
    }
  }
  if (!abandoned) badge(g, b.civ, R * 0.74, R * 0.74, wonder ? 3 : 2.6);
}

/** What an icon looks like, as a short string: it is redrawn only when this changes. */
function look(b) {
  const step = b.status === 'building' && b.years > 0 ? Math.floor((b.work / b.years) * PROGRESS_STEPS) : 0;
  return `${b.era}${b.status[0]}${b.civ}:${step}`;
}

export class BuildingLayer {
  /** types[c]: civ c's type id (for the type marks). */
  constructor(map, types = []) {
    this.cols = map.cols;
    this.types = types;
    this.container = new Container();
    this.icons = new Map(); // key → { g, look, hex, slot, wonder }
    this.signature = '';
    this.zoomedIn = null;
    this.camScale = -1;
  }

  /** Take SimHost.buildings(); returns true if anything on the map changed. */
  setBuildings(list) {
    let sig = '';
    for (const b of list) sig += `${b.kind[0]}${b.id}${b.hex}${look(b)};`;
    if (sig === this.signature) return false;
    this.signature = sig;
    const seen = new Set();
    const perHex = new Map();
    for (const b of list) {
      const key = `${b.kind}:${b.id}:${b.hex}:${b.year === undefined ? b.civ : 'done'}`;
      seen.add(key);
      let icon = this.icons.get(key);
      if (!icon) {
        icon = { g: new Graphics(), look: '', hex: b.hex, slot: 0, wonder: b.kind === 'wonder' };
        this.icons.set(key, icon);
        this.container.addChild(icon.g);
      }
      const l = look(b);
      if (icon.look !== l) { icon.look = l; drawIcon(icon.g, b, this.types[b.civ]); }
      // A hex rarely holds more than one; any extra takes the next spot.
      const slot = perHex.get(b.hex) ?? 0;
      perHex.set(b.hex, slot + 1);
      icon.slot = slot;
    }
    for (const [key, icon] of this.icons) {
      if (seen.has(key)) continue;
      icon.g.destroy();
      this.icons.delete(key);
    }
    // Wonders drawn over buildings where they crowd together.
    this.container.sortableChildren = false;
    for (const icon of this.icons.values()) if (icon.wonder) this.container.setChildIndex(icon.g, this.container.children.length - 1);
    this.zoomedIn = null; // re-place everything
    return true;
  }

  /** Place icons for this frame: zoomedIn while people are drawn one by one; camScale is CSS px per world unit. */
  update(zoomedIn, camScale) {
    if (zoomedIn === this.zoomedIn && camScale === this.camScale) return;
    const moved = zoomedIn !== this.zoomedIn;
    this.zoomedIn = zoomedIn;
    this.camScale = camScale;
    const spots = zoomedIn ? IN_SPOTS : OUT_SPOTS;
    const scales = zoomedIn ? IN_SCALE : OUT_SCALE;
    for (const icon of this.icons.values()) {
      const kind = icon.wonder ? 'wonder' : 'building';
      const base = scales[kind];
      const r = (icon.wonder ? ICON_R_WONDER : ICON_R) * base * camScale;
      const s = r > 0 && r < MIN_PX[kind] ? (base * MIN_PX[kind]) / r : base;
      icon.g.scale.set(s);
      if (moved) {
        const c = hexCentre(this.cols, icon.hex);
        const [dx, dy] = spots[icon.slot % spots.length];
        icon.g.position.set(c.x + dx * HEX_SIZE, c.y + dy * HEX_SIZE);
      }
    }
  }

  /**
   * Hex of the icon drawn under screen point (sx, sy), or -1. Zoomed in, the
   * target is at least TAP_PX in radius (a 44 px touch target); zoomed out only
   * the icon itself, so taps on the hexes around it still land there.
   */
  hexAt(sx, sy, camera) {
    let best = -1;
    let bestD = Infinity;
    for (const icon of this.icons.values()) {
      const g = icon.g;
      const r = (icon.wonder ? ICON_R_WONDER : ICON_R) * g.scale.x * camera.scale;
      const reach = this.zoomedIn ? Math.max(r, TAP_PX) : r + 2;
      const dx = camera.x + g.x * camera.scale - sx;
      const dy = camera.y + g.y * camera.scale - sy;
      const d = dx * dx + dy * dy;
      if (d <= reach * reach && d < bestD) { bestD = d; best = icon.hex; }
    }
    return best;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
