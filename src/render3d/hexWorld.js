// What the inside of one hex shows (RULES.md "Feature flags", Inside a hex):
// a pure layout, worked out from the hex's card data (SimHost.inspect and
// hexPeople), that the three.js hex view (hexView.js) draws and animates. No
// three.js here, so it is unit-tested in Node.
//
// Units: the hex is a pointy-top plate of radius HEX_R, x east, z south, y up.
// The layout is the same every time the same hex is entered in the same state:
// its scatter comes from a small seeded generator keyed on the hex, never from
// Math.random, and it is render-only, so the sim never sees it.

/** Radius of the hex plate (units). */
export const HEX_R = 10;
/** Most people shown walking about, and most homes. */
export const MAX_WALKERS = 48;
export const MAX_HOMES = 44;

/** Homes by settlement tier: Camp, Village, Town, City, Metropolis, Megapolis. */
export const HOMES_BY_TIER = Object.freeze([4, 8, 14, 22, 32, 44]);
/** Tall towers among the homes, by tier (from City up). */
export const TOWERS_BY_TIER = Object.freeze([0, 0, 1, 2, 4, 8]);
/** Settlement tier from which a wall rings the homes (Town). */
export const WALL_TIER = 2;
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
 *   wall: radius or 0, monuments: [{ x, z, kind: 'wonder'|'building'|'site'|'ruin', civ }],
 *   fields: [{ x, z, w, d, rot }], nature: [{ x, z, s, rot, kind }],
 *   walkers: [{ x, z, r, speed, phase, civ, child }], war: bool, lit: bool,
 *   huts: bool, fire: { x, z } or null,
 * }
 * `hex.level` is the level (1 to 5) of the civ living there: at level 1
 * (Foragers) homes are huts, and at night a bonfire burns instead of windows.
 */
export function layoutHex(hex, people = []) {
  const rnd = seeded(0x9e3779b1 ^ (hex.index * 2654435761));
  const out = {
    terrain: hex.terrain, water: !!hex.water, river: !!hex.river,
    homes: [], towers: [], wall: 0, monuments: [], fields: [], nature: [], walkers: [],
    war: false, lit: false, huts: false, fire: null,
  };
  if (hex.water) return out;
  const byCiv = hex.peopleByCiv ?? [];
  const civsHere = byCiv.map((n, c) => [n, c]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]);
  const settlement = hex.settlement ?? null;
  const owner = settlement ? settlement.holder : civsHere.length ? civsHere[0][1] : -1;
  out.war = civsHere.length >= 2;
  // Lights at night only where people live now.
  out.lit = (hex.people ?? 0) > 0 && owner >= 0;
  out.huts = owner >= 0 && (hex.level ?? 2) <= 1;
  const taken = []; // circles already used: [x, z, r]
  const free = (x, z, r) => inHex(x, z, HEX_R - r - 0.3) && taken.every(([tx, tz, tr]) => (tx - x) ** 2 + (tz - z) ** 2 >= (tr + r) ** 2);

  // Monuments on a small square in the middle.
  const monuments = [];
  for (const b of hex.buildings ?? []) {
    if (b.status === 'standing') monuments.push({ kind: b.kind === 'wonder' ? 'wonder' : 'building', civ: b.civ ?? owner });
    else if (b.status === 'building') monuments.push({ kind: 'site', civ: b.civ ?? owner });
    else if (b.status === 'abandoned') monuments.push({ kind: 'ruin', civ: -1 });
  }
  for (const b of settlement?.buildings ?? []) {
    if (b.status === 'standing') monuments.push({ kind: 'building', civ: owner });
    else if (b.status === 'building') monuments.push({ kind: 'site', civ: owner });
  }
  monuments.slice(0, 7).forEach((m, k) => {
    const a = k * 2.399; const rad = k === 0 ? 0 : 1.8 + 0.5 * k;
    const x = rad * Math.cos(a); const z = rad * Math.sin(a);
    const r = m.kind === 'wonder' || m.kind === 'ruin' ? 1.6 : 0.9;
    out.monuments.push({ ...m, x, z });
    taken.push([x, z, r]);
  });

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
  const tier = settlement ? settlement.tier : -1;
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
  const homeR = tier >= 3 ? 0.6 : 0.75;
  let placed = 0;
  for (let k = 0; placed < nHomes && k < nHomes * 8; k++) {
    const a = k * 2.399963 + rnd() * 0.3;
    const rad = 1.4 + 0.62 * Math.sqrt(k) * (tier >= 3 ? 1.05 : 1.2) + rnd() * 0.3;
    const x = rad * Math.cos(a); const z = rad * Math.sin(a);
    if (!free(x, z, homeR)) continue;
    taken.push([x, z, homeR]);
    out.homes.push({ x, z, rot: rnd() * Math.PI, s: 0.85 + rnd() * 0.3, civ: owner, tent: tier < 0 });
    placed++;
  }
  let far = 0;
  for (const p of [...out.homes, ...out.towers, ...out.monuments]) far = Math.max(far, Math.hypot(p.x, p.z));
  if (tier >= WALL_TIER) out.wall = Math.min(HEX_R * 0.78, far + 1.2);

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
