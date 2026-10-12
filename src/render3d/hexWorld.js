// What the inside of one hex shows (RULES.md "Feature flags", Inside a hex):
// a pure layout, worked out from the hex's card data (SimHost.inspect and
// hexPeople), that the three.js hex view (hexView.js) draws and animates. No
// three.js here, so it is unit-tested in Node.
//
// Units: the hex is a pointy-top plate of radius HEX_R, x east, z south, y up.
// The layout is the same every time the same hex is entered in the same state:
// its scatter comes from a small seeded generator keyed on the hex, never from
// Math.random, and it is render-only, so the sim never sees it.

import { modelOf, footprint, PART_OF_SETTLEMENT } from './buildingModels.js';

/** Radius of the hex plate (units). */
export const HEX_R = 10;
/** Most people shown walking about, and most homes. */
export const MAX_WALKERS = 48;
export const MAX_HOMES = 44;

/** Homes by settlement tier: Camp, Village, Town, City, Metropolis, Megapolis. */
export const HOMES_BY_TIER = Object.freeze([4, 8, 14, 22, 32, 44]);
/** Tall towers among the homes, by tier (from City up). */
export const TOWERS_BY_TIER = Object.freeze([0, 0, 1, 2, 4, 8]);
/** Civ level from which a settlement has a paved square in the middle (Builders), and lamps round it (Organised). */
export const PLAZA_LEVEL = 3;
export const LAMP_LEVEL = 4;
/** Buildings and wonders stand at this share of their model's size, so a big city's fit in the hex. */
export const MODEL_SCALE = 0.7;
/** Lamps round the square. */
export const LAMPS = 6;
/** People with no settlement camp in tents: one per this many, up to MAX_TENTS. */
export const PEOPLE_PER_TENT = 5;
export const MAX_TENTS = 6;

/** Trees, rocks and the like scattered on each terrain (count, kind). */
export const NATURE = Object.freeze({
  deepWater: { count: 0, kind: null },
  coast: { count: 8, kind: 'palm' },
  plains: { count: 14, kind: 'tree' },
  forest: { count: 70, kind: 'pine' },
  hills: { count: 16, kind: 'rock' },
  mountain: { count: 7, kind: 'peak' },
  desert: { count: 14, kind: 'cactus' },
  tundra: { count: 12, kind: 'snowpine' },
});

/** Seeded generator (mulberry32), so a hex looks the same every visit. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether (x, z) lies inside the pointy-top hex of radius r centred on the origin. */
export function inHex(x, z, r = HEX_R) {
  const ax = Math.abs(x); const az = Math.abs(z);
  const w = (Math.sqrt(3) / 2) * r;
  return ax <= w && az <= r - ax / Math.sqrt(3);
}

/**
 * Lay out hex `hex` (SimHost.inspect data) with `people` (SimHost.hexPeople
 * people list, may be empty). Returns {
 *   terrain, water, river,
 *   homes: [{ x, z, rot, s, civ, tent }], towers: [{ x, z, h, civ }],
 *   wall: radius or 0, wallKind: 'stone' | 'wood' | null,
 *   structures: [{ x, z, ry, r, id, kind, name, status, civ, progress }] (every building and wonder here),
 *   dock: { x, z, ry } or null, level, plaza: radius or 0, lamps: [{ x, z }],
 *   fields: [{ x, z, w, d, rot }], nature: [{ x, z, s, rot, kind }],
 *   walkers: [{ x, z, r, speed, phase, civ, child }], war: bool, lit: bool,
 *   huts: bool, fire: { x, z } or null,
 * }
 * `hex.level` is the level (1 to 5) of the civ living there, and the homes
 * change with it: at level 1 (Foragers) they are huts round a bonfire (no
 * windows), from level 3 a paved square opens in the middle, and from level 4
 * lamps stand round it.
 */
export function layoutHex(hex, people = []) {
  const rnd = seeded(0x9e3779b1 ^ (hex.index * 2654435761));
  const out = {
    terrain: hex.terrain, water: !!hex.water, river: !!hex.river,
    homes: [], towers: [], wall: 0, wallKind: null, structures: [], dock: null, fields: [], nature: [], walkers: [],
    war: false, lit: false, huts: false, fire: null, level: 1, plaza: 0, lamps: [],
  };
  if (hex.water) return out;
  const byCiv = hex.peopleByCiv ?? [];
  const civsHere = byCiv.map((n, c) => [n, c]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]);
  const settlement = hex.settlement ?? null;
  const owner = settlement ? settlement.holder : civsHere.length ? civsHere[0][1] : -1;
  out.war = civsHere.length >= 2;
  // Lights at night only where people live now.
  out.lit = (hex.people ?? 0) > 0 && owner >= 0;
  out.level = Math.max(1, Math.min(5, hex.level ?? 2));
  out.huts = owner >= 0 && out.level <= 1;
  const taken = []; // circles already used: [x, z, r]
  const free = (x, z, r) => inHex(x, z, HEX_R - r - 0.3) && taken.every(([tx, tz, tr]) => (tx - x) ** 2 + (tz - z) ** 2 >= (tr + r) ** 2);

  const tier = settlement ? settlement.tier : -1;
  // A paved square in the middle from level 3, with lamps round it from level 4.
  if (tier >= 1 && owner >= 0 && out.level >= PLAZA_LEVEL) {
    out.plaza = 1.4 + 0.25 * tier;
    taken.push([0, 0, out.plaza]);
    if (out.level >= LAMP_LEVEL) {
      for (let k = 0; k < LAMPS; k++) {
        const a = (k / LAMPS) * Math.PI * 2 + Math.PI / LAMPS;
        out.lamps.push({ x: (out.plaza + 0.25) * Math.cos(a), z: (out.plaza + 0.25) * Math.sin(a) });
      }
    }
  }

  // Every building and wonder here, biggest first, as near the middle as there is room, facing it.
  const built = (b) => b.status === 'building' ? Math.max(0, Math.min(1, (b.work ?? 0) / Math.max(1, b.years ?? 1))) : 1;
  const wanted = [];
  for (const b of hex.buildings ?? []) {
    if (!modelOf(b)) continue;
    wanted.push({ id: b.id, kind: b.kind, name: b.name, status: b.status, civ: b.status === 'abandoned' ? -1 : b.civ ?? owner, progress: built(b) });
  }
  const has = new Set();
  for (const b of settlement?.buildings ?? []) {
    if (b.status === 'standing') has.add(b.id);
    if (b.status === 'planned' || PART_OF_SETTLEMENT.includes(b.id) || !modelOf(b)) continue;
    if (b.id === 'fishingDock') {
      // A pier out into the water on the south shore.
      if (!hex.water) { out.dock = { x: 0, z: HEX_R * 0.78, ry: 0, status: b.status }; taken.push([0, HEX_R * 0.78, 1.3]); }
      continue;
    }
    wanted.push({ id: b.id, kind: b.kind, name: b.name, status: b.status, civ: owner, progress: built(b) });
  }
  // Every one must stand: when they do not all fit, try again with them all a little smaller.
  const before = taken.length;
  for (let scale = MODEL_SCALE, tries = 0; tries < 8; tries++, scale *= 0.88) {
    taken.length = before;
    out.structures = [];
    const sized = wanted.map((w) => ({ ...w, s: scale, r: footprint(modelOf(w)) * scale + 0.15 })).sort((a, b) => b.r - a.r);
    for (const w of sized) {
      const start = out.plaza ? out.plaza + w.r : 0;
      for (let k = 0; k < 600; k++) {
        const a = k * 2.399963; const rad = start + 0.4 * Math.sqrt(k);
        const x = rad * Math.cos(a); const z = rad * Math.sin(a);
        if (!free(x, z, w.r)) continue;
        taken.push([x, z, w.r]);
        out.structures.push({ ...w, x, z, ry: rad > 0 ? Math.atan2(-x, -z) : 0 });
        break;
      }
    }
    if (out.structures.length === wanted.length) break;
  }
  // The settlement's wall: stone walls if built, else a palisade.
  out.wallKind = has.has('stoneWalls') ? 'stone' : has.has('palisade') ? 'wood' : null;

  // Foragers keep a bonfire near the middle, where it is free.
  if (out.huts && out.lit) {
    for (let k = 0; k < 60; k++) {
      const a = k * 2.399963; const rad = 0.3 * k;
      const x = rad * Math.cos(a); const z = rad * Math.sin(a);
      if (!free(x, z, 0.9)) continue;
      taken.push([x, z, 0.9]);
      out.fire = { x, z };
      break;
    }
  }

  // Homes on a golden-angle spiral round the middle, a little jittered.
  const nTowers = tier >= 0 ? TOWERS_BY_TIER[Math.min(tier, TOWERS_BY_TIER.length - 1)] : 0;
  for (let k = 0, made = 0; made < nTowers && k < 200; k++) {
    const a = rnd() * Math.PI * 2; const rad = 1.6 + rnd() * (2.5 + tier * 0.6);
    const x = rad * Math.cos(a); const z = rad * Math.sin(a);
    if (!free(x, z, 0.55)) continue;
    taken.push([x, z, 0.55]);
    out.towers.push({ x, z, h: 2.4 + tier * 0.7 + rnd() * 1.2, civ: owner });
    made++;
  }
  const tents = tier < 0 && owner >= 0 ? Math.min(MAX_TENTS, Math.max(1, Math.ceil((hex.people ?? 0) / PEOPLE_PER_TENT))) : 0;
  const nHomes = tier >= 0 ? Math.min(MAX_HOMES, HOMES_BY_TIER[Math.min(tier, HOMES_BY_TIER.length - 1)]) : tents;
  const homeR = tier >= 4 ? 0.5 : tier >= 3 ? 0.6 : 0.75;
  // Homes cluster round the middle, the bigger the settlement the further out, filling gaps between the buildings.
  const inner = 1.2 + out.plaza;
  const outer = Math.min(HEX_R - 1, inner + 1.6 + Math.max(0, tier) * 1.3);
  let placed = 0;
  for (let k = 0; placed < nHomes && k < nHomes * 40; k++) {
    const a = rnd() * Math.PI * 2;
    const rad = inner + (outer - inner) * Math.sqrt(rnd());
    const x = rad * Math.cos(a); const z = rad * Math.sin(a);
    if (!free(x, z, homeR)) continue;
    taken.push([x, z, homeR]);
    out.homes.push({ x, z, rot: rnd() * Math.PI, s: 0.85 + rnd() * 0.3, civ: owner, tent: tier < 0 });
    placed++;
  }
  let far = 0;
  for (const p of [...out.homes, ...out.towers]) far = Math.max(far, Math.hypot(p.x, p.z));
  for (const p of out.structures) far = Math.max(far, Math.hypot(p.x, p.z) + p.r);
  if (out.wallKind) out.wall = Math.min(HEX_R * 0.8, far + 1.0);

  // Fields round a settled village or bigger, on land that grows food.
  if (tier >= 1 && ['plains', 'coast', 'hills', 'desert'].includes(hex.terrain) || (tier >= 1 && hex.river)) {
    const nFields = 4 + tier * 2;
    for (let k = 0, made = 0; made < nFields && k < 80; k++) {
      const a = rnd() * Math.PI * 2; const rad = (out.wall || far + 1) + 1 + rnd() * 3;
      const x = rad * Math.cos(a); const z = rad * Math.sin(a);
      if (!free(x, z, 1.1)) continue;
      taken.push([x, z, 1.1]);
      out.fields.push({ x, z, w: 1.6 + rnd() * 0.6, d: 1.2 + rnd() * 0.5, rot: rnd() * Math.PI });
      made++;
    }
  }

  // Nature fills what is left.
  const nat = NATURE[hex.terrain] ?? NATURE.plains;
  const want = Math.round(nat.count * (tier >= 3 ? 0.4 : tier >= 1 ? 0.7 : 1));
  const natR = nat.kind === 'peak' ? 1.8 : nat.kind === 'rock' ? 0.5 : 0.35;
  for (let k = 0, made = 0; made < want && k < want * 12; k++) {
    const x = (rnd() * 2 - 1) * HEX_R; const z = (rnd() * 2 - 1) * HEX_R;
    if (!free(x, z, natR)) continue;
    taken.push([x, z, natR]);
    out.nature.push({ x, z, s: 0.75 + rnd() * 0.6, rot: rnd() * Math.PI * 2, kind: nat.kind });
    made++;
  }

  // People walk about, coloured by civ in proportion to who lives here.
  const total = hex.people ?? 0;
  const shown = Math.min(MAX_WALKERS, total);
  let k = 0;
  for (const [n, civ] of civsHere) {
    const share = Math.max(1, Math.round((shown * n) / Math.max(1, total)));
    for (let j = 0; j < share && k < shown; j++, k++) {
      const age = people[k]?.age;
      // At war each side keeps to its own half of the hex.
      const side = out.war ? (civ === civsHere[0][1] ? -1 : 1) : 0;
      out.walkers.push({
        x: side * 3 + (rnd() * 2 - 1) * 3.5, z: (rnd() * 2 - 1) * 3.5,
        r: 0.6 + rnd() * 2.2, speed: (0.25 + rnd() * 0.35) * (rnd() < 0.5 ? -1 : 1), phase: rnd() * Math.PI * 2,
        civ, child: age !== undefined && age < 15,
      });
    }
  }
  return out;
}
