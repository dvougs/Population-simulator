// What every building and wonder looks like in 3D (RULES.md "Feature flags"):
// each is a short recipe of simple parts (boxes, cylinders, cones, pyramids,
// roof prisms and domes), so the hex view can build it as meshes and the 3D
// map can draw it with a handful of instanced meshes. Pure data and maths, no
// three.js, unit-tested in Node.
//
// Units are the hex view's (a home is about 0.9 wide); a part stands on y and
// grows up by h. Colours are names (COLOURS) or 'civ' for the owner's colour.

import { BUILDINGS, WONDERS } from '../sim/buildings.js';
import { SETTLEMENT_BUILDINGS } from '../sim/settlements.js';

export const SHAPES = Object.freeze(['box', 'cyl', 'cone', 'pyramid', 'prism', 'dome']);

export const COLOURS = Object.freeze({
  stone: 0xe9dfcb, darkStone: 0x9a9284, wood: 0x7a5232, plank: 0xa87a4a, thatch: 0xb08a4e, clay: 0xb5653f,
  mud: 0xa58660, gold: 0xf2c14e, iron: 0x5d6066, water: 0x3d7fbf, green: 0x4f8f3e, cloth: 0xeee3c8, gem: 0x7fd4e8,
  red: 0xa8402a, fire: 0xff8a2a, sand: 0xd8c08a, dark: 0x3b3229, copper: 0xc07a4a, salt: 0xf2f2ee, white: 0xf6efe0,
});

// Part makers: x, z the middle of its foot, y its foot, then size; ry turns it about its own middle.
const box = (x, y, z, w, h, d, c, ry = 0) => ({ s: 'box', x, y, z, w, h, d, c, ry });
const cyl = (x, y, z, r, h, c, top = r) => ({ s: 'cyl', x, y, z, w: r * 2, h, d: r * 2, top: top / r, c, ry: 0 });
const cone = (x, y, z, r, h, c) => ({ s: 'cone', x, y, z, w: r * 2, h, d: r * 2, c, ry: 0 });
const pyramid = (x, y, z, w, h, d, c, ry = 0) => ({ s: 'pyramid', x, y, z, w, h, d, c, ry });
/** A roof ridge running along z (turn it with ry; a quarter turn runs it along x): w across the ridge, h high, d along it. */
const prism = (x, y, z, w, h, d, c, ry = 0) => ({ s: 'prism', x, y, z, w, h, d, c, ry });
const dome = (x, y, z, r, c, h = r) => ({ s: 'dome', x, y, z, w: r * 2, h, d: r * 2, c, ry: 0 });

/** A house: walls, a roof ridge, a door. */
const hall = (x, z, w, h, d, wall, roof, ry = 0) => [box(x, 0, z, w, h, d, wall, ry), prism(x, h, z, w * 1.12, h * 0.7, d * 1.08, roof, ry)];
/** A ring of n things made by f(x, z, angle) round (x, z) at radius r. */
const ring = (n, r, f, x0 = 0, z0 = 0, a0 = 0) => Array.from({ length: n }, (_, k) => {
  const a = a0 + (k / n) * Math.PI * 2;
  return f(x0 + r * Math.cos(a), z0 + r * Math.sin(a), a);
}).flat();

/** Era buildings, by id (sim/buildings.js BUILDINGS). */
export const ERA_MODELS = Object.freeze({
  // Expansionist: a timber lodge with totems, round silos, a crossroads milestone, a domed office.
  trailhead: [...hall(0, 0, 2.2, 0.8, 1.3, 'plank', 'civ'), cyl(-1.3, 0, 0.75, 0.09, 1.5, 'wood'), cyl(1.3, 0, 0.75, 0.09, 1.5, 'wood'),
    box(-1.3, 1.3, 0.75, 0.3, 0.2, 0.2, 'civ'), box(1.3, 1.3, 0.75, 0.3, 0.2, 0.2, 'civ'), box(0, 0, 0.66, 0.35, 0.55, 0.05, 'dark')],
  granary: [cyl(-0.8, 0, 0, 0.5, 1.4, 'clay'), dome(-0.8, 1.4, 0, 0.5, 'civ'), cyl(0.3, 0, -0.2, 0.55, 1.6, 'clay'), dome(0.3, 1.6, -0.2, 0.55, 'civ'),
    cyl(1.25, 0, 0.3, 0.42, 1.2, 'clay'), dome(1.25, 1.2, 0.3, 0.42, 'civ'), box(0.3, 0, 0.5, 0.4, 0.5, 0.2, 'dark')],
  roads: [box(0, 0, 0, 3, 0.06, 0.5, 'darkStone'), box(0, 0, 0, 0.5, 0.06, 3, 'darkStone'), cyl(0, 0, 0, 0.45, 0.3, 'stone'),
    cyl(0, 0.3, 0, 0.18, 1.3, 'stone', 0.12), pyramid(0, 1.6, 0, 0.3, 0.3, 0.3, 'civ'), box(1.2, 0, 0.5, 0.15, 0.6, 0.15, 'stone'), box(-1.2, 0, -0.5, 0.15, 0.6, 0.15, 'stone')],
  colonialOffice: [box(0, 0, 0, 2.4, 1.3, 1.6, 'stone'), dome(0, 1.3, 0, 0.6, 'civ'), ...[-0.8, -0.27, 0.27, 0.8].map((x) => cyl(x, 0, 0.92, 0.09, 1.3, 'white')),
    prism(0, 1.3, 0.92, 0.4, 0.4, 2.4, 'stone', Math.PI / 2), cyl(1.0, 1.3, -0.5, 0.04, 1, 'wood'), box(1.18, 2.0, -0.5, 0.35, 0.22, 0.03, 'civ')],
  // Aggressive: a totem with skull rack, barracks, a smoking forge, a citadel keep.
  warTotem: [cyl(0, 0, 0, 0.6, 0.25, 'darkStone'), cyl(0, 0.25, 0, 0.22, 2.4, 'wood', 0.17), box(0, 1.6, 0, 1.2, 0.18, 0.18, 'wood'),
    pyramid(0, 2.65, 0, 0.45, 0.5, 0.45, 'civ'), box(0, 2.0, 0.22, 0.34, 0.34, 0.1, 'red'), cone(-0.55, 1.78, 0, 0.12, 0.3, 'white'), cone(0.55, 1.78, 0, 0.12, 0.3, 'white')],
  barracks: [...hall(0, -0.3, 2.6, 0.9, 1.1, 'plank', 'civ'), ...ring(6, 1.6, (x, z) => [cyl(x, 0, z, 0.07, 0.8, 'wood')], 0, 0.2, Math.PI / 12),
    box(0, 0, 0.9, 1.6, 0.05, 0.8, 'sand'), box(-0.5, 0, 0.9, 0.08, 0.9, 0.08, 'wood'), box(0.5, 0, 0.9, 0.08, 0.9, 0.08, 'wood')],
  forge: [box(0, 0, 0, 1.8, 0.9, 1.3, 'darkStone'), prism(0, 0.9, 0, 2, 0.5, 1.4, 'civ'), cyl(0.6, 0, -0.4, 0.25, 2.1, 'darkStone'),
    box(-0.5, 0, 0.85, 0.5, 0.45, 0.3, 'iron'), box(0.3, 0, 0.8, 0.5, 0.3, 0.3, 'fire'), cone(0.6, 2.1, -0.4, 0.3, 0.3, 'dark')],
  citadel: [box(0, 0, 0, 2.4, 0.9, 2.4, 'darkStone'), box(0, 0.9, 0, 1.4, 1.4, 1.4, 'stone'), ...ring(4, 1.25, (x, z) => [cyl(x, 0, z, 0.3, 1.6, 'darkStone'), cone(x, 1.6, z, 0.35, 0.5, 'civ')], 0, 0, Math.PI / 4),
    pyramid(0, 2.3, 0, 1.5, 0.6, 1.5, 'civ'), cyl(0, 2.9, 0, 0.03, 0.8, 'wood'), box(0.2, 3.4, 0, 0.4, 0.25, 0.03, 'civ')],
  // Cooperative: a council fire in a log ring, a covered market, a guild hall, a columned senate.
  councilFire: [...ring(8, 1.1, (x, z, a) => [box(x, 0, z, 0.7, 0.22, 0.22, 'wood', -a + Math.PI / 2)]), ...ring(6, 0.35, (x, z) => [box(x, 0, z, 0.18, 0.18, 0.18, 'darkStone')]),
    cone(0, 0, 0, 0.3, 0.75, 'fire'), cyl(0, 0, -1.6, 0.12, 1.6, 'wood'), pyramid(0, 1.6, -1.6, 0.4, 0.4, 0.4, 'civ')],
  market: [...[[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.6], [0.8, 0.6]].flatMap(([x, z]) => [cyl(x, 0, z, 0.06, 0.8, 'wood'), pyramid(x, 0.8, z, 1.1, 0.4, 1.0, 'civ')]),
    box(-0.8, 0, -0.5, 0.7, 0.4, 0.4, 'plank'), box(0.8, 0, 0.6, 0.7, 0.4, 0.4, 'plank'), cyl(0.8, 0.4, -0.5, 0.18, 0.25, 'copper'), box(-0.8, 0.4, 0.6, 0.4, 0.2, 0.3, 'salt')],
  guildHall: [box(0, 0, 0, 2.2, 1.6, 1.4, 'stone'), prism(0, 1.6, 0, 1.5, 0.9, 2.4, 'civ', Math.PI / 2), box(0, 0, 0.72, 0.5, 0.8, 0.05, 'dark'),
    box(-0.65, 0.8, 0.72, 0.4, 0.4, 0.04, 'gem'), box(0.65, 0.8, 0.72, 0.4, 0.4, 0.04, 'gem'), cyl(1.0, 0, -0.5, 0.3, 2.6, 'stone'), cone(1.0, 2.6, -0.5, 0.36, 0.7, 'civ')],
  senate: [box(0, 0, 0, 3.0, 0.3, 2.0, 'stone'), box(0, 0.3, -0.2, 2.4, 1.3, 1.3, 'white'), ...[-1.05, -0.35, 0.35, 1.05].map((x) => cyl(x, 0.3, 0.75, 0.12, 1.3, 'white')),
    prism(0, 1.6, 0.1, 2.0, 0.55, 2.7, 'stone', Math.PI / 2), dome(0, 1.6, -0.3, 0.55, 'gold')],
  // Isolationist: a shrine of standing stones, terraced steps, a stretch of walls, a domed observatory.
  ancestorShrine: [...ring(6, 1.0, (x, z) => [box(x, 0, z, 0.3, 1.2, 0.22, 'darkStone')]), box(0, 0, 0, 0.9, 0.35, 0.6, 'stone'),
    cone(0, 0.35, 0, 0.12, 0.3, 'fire'), ...hall(0, -1.7, 0.9, 0.6, 0.7, 'stone', 'civ')],
  terraces: [box(0, 0, 0, 2.6, 0.35, 2.2, 'stone'), box(0, 0.35, 0, 2.6, 0.08, 2.2, 'green'), box(0, 0.35, -0.3, 2.0, 0.35, 1.5, 'stone'),
    box(0, 0.7, -0.3, 2.0, 0.08, 1.5, 'green'), box(0, 0.7, -0.5, 1.4, 0.35, 0.9, 'stone'), box(0, 1.05, -0.5, 1.4, 0.08, 0.9, 'green'), box(0, 0, 1.1, 0.4, 0.2, 0.4, 'water')],
  walls: [box(0, 0, 0, 3.2, 1.0, 0.5, 'darkStone'), ...[-1.4, -0.7, 0, 0.7, 1.4].map((x) => box(x, 1.0, 0, 0.35, 0.25, 0.55, 'darkStone')),
    cyl(-1.75, 0, 0, 0.45, 1.6, 'stone'), cyl(1.75, 0, 0, 0.45, 1.6, 'stone'), cone(-1.75, 1.6, 0, 0.5, 0.6, 'civ'), cone(1.75, 1.6, 0, 0.5, 0.6, 'civ')],
  observatory: [cyl(0, 0, 0, 1.0, 1.4, 'stone'), dome(0, 1.4, 0, 1.0, 'white'), box(0.2, 1.6, 0.3, 0.25, 0.25, 1.1, 'iron', -0.6),
    box(0, 0, 1.0, 0.4, 0.7, 0.06, 'dark'), ...ring(8, 1.35, (x, z) => [box(x, 0, z, 0.12, 0.35, 0.12, 'civ')])],
  // Nomadic: a circle of tents, a caravanserai courtyard, a horse paddock, the khan's great tent.
  tentCircle: [...ring(5, 1.1, (x, z) => [cone(x, 0, z, 0.45, 0.8, 'civ')]), cone(0, 0, 0, 0.6, 1.3, 'cloth'), cyl(0, 1.2, 0, 0.03, 0.5, 'wood')],
  caravanserai: [box(0, 0, -1.0, 2.6, 0.9, 0.5, 'sand'), box(0, 0, 1.0, 2.6, 0.9, 0.5, 'sand'), box(-1.05, 0, 0, 0.5, 0.9, 1.5, 'sand'), box(1.05, 0, 0, 0.5, 0.9, 1.5, 'sand'),
    box(0, 0, 1.26, 0.6, 0.65, 0.04, 'dark'), cyl(0, 0, 0, 0.35, 0.2, 'stone'), box(0, 0.2, 0, 0.35, 0.05, 0.35, 'water'), dome(-1.05, 0.9, -1.0, 0.3, 'civ'), dome(1.05, 0.9, -1.0, 0.3, 'civ')],
  horsePaddock: [...ring(10, 1.3, (x, z) => [box(x, 0, z, 0.08, 0.5, 0.08, 'wood')]), ...ring(10, 1.3, (x, z, a) => [box(x, 0.35, z, 0.82, 0.06, 0.05, 'plank', -a)], 0, 0, Math.PI / 10),
    box(-0.3, 0.3, 0.1, 0.55, 0.25, 0.2, 'wood'), box(-0.02, 0.45, 0.1, 0.12, 0.25, 0.12, 'wood'), box(0.4, 0.3, -0.4, 0.55, 0.25, 0.2, 'dark', 0.8), ...hall(1.6, -1.2, 0.8, 0.5, 0.7, 'plank', 'civ')],
  khansCourt: [cyl(0, 0, 0, 1.2, 0.9, 'cloth'), cone(0, 0.9, 0, 1.35, 1.0, 'civ'), cyl(0, 1.8, 0, 0.04, 0.7, 'gold'),
    box(0, 0, 1.2, 0.5, 0.65, 0.04, 'red'), ...ring(4, 1.8, (x, z) => [cyl(x, 0, z, 0.04, 1.6, 'wood'), box(x + 0.15, 1.35, z, 0.3, 0.22, 0.02, 'civ')], 0, 0, Math.PI / 4)],
});

/** Wonders, by id (sim/buildings.js WONDERS). */
export const WONDER_MODELS = Object.freeze({
  sunCircle: [...ring(10, 1.9, (x, z, a) => [box(x, 0, z, 0.45, 1.8, 0.35, 'darkStone', -a)]),
    ...ring(5, 1.9, (x, z, a) => [box(x, 1.8, z, 1.3, 0.25, 0.4, 'darkStone', -a + Math.PI / 2 + Math.PI / 10)], 0, 0, Math.PI / 10),
    cyl(0, 0, 0, 0.6, 0.4, 'stone'), dome(0, 0.4, 0, 0.35, 'gold')],
  hangingGardens: [box(0, 0, 0, 3.6, 0.8, 3.6, 'clay'), box(0, 0.8, 0, 3.6, 0.15, 3.6, 'green'), box(0, 0.95, 0, 2.6, 0.8, 2.6, 'clay'),
    box(0, 1.75, 0, 2.6, 0.15, 2.6, 'green'), box(0, 1.9, 0, 1.6, 0.8, 1.6, 'clay'), box(0, 2.7, 0, 1.6, 0.15, 1.6, 'green'),
    ...ring(4, 1.4, (x, z) => [dome(x, 2.85, z, 0.25, 'green')], 0, 0, Math.PI / 4), box(1.85, 0.2, 0, 0.1, 2.5, 0.5, 'water'), pyramid(0, 2.85, 0, 0.6, 0.6, 0.6, 'gold')],
  greatWall: [box(0, 0, 0, 4.4, 1.2, 0.7, 'darkStone'), ...[-1.9, -1.15, -0.4, 0.4, 1.15, 1.9].map((x) => box(x, 1.2, 0, 0.4, 0.3, 0.75, 'darkStone')),
    box(-2.4, 0, 0, 1.0, 2.2, 1.0, 'stone'), box(2.4, 0, 0, 1.0, 2.2, 1.0, 'stone'), pyramid(-2.4, 2.2, 0, 1.2, 0.7, 1.2, 'civ'), pyramid(2.4, 2.2, 0, 1.2, 0.7, 1.2, 'civ'),
    box(0, 0, 0, 0.8, 0.9, 0.75, 'dark'), pyramid(0, 1.5, 0, 0.5, 0.5, 0.5, 'gold')],
  grandLibrary: [box(0, 0, 0, 3.8, 0.35, 2.8, 'stone'), box(0, 0.35, -0.2, 3.2, 1.8, 2.0, 'white'), ...[-1.4, -0.7, 0, 0.7, 1.4].map((x) => cyl(x, 0.35, 1.0, 0.14, 1.8, 'white')),
    prism(0, 2.15, 0.2, 2.7, 0.6, 3.5, 'stone', Math.PI / 2), cyl(0, 2.15, -0.4, 0.8, 0.5, 'white'), dome(0, 2.65, -0.4, 0.8, 'gold'), cyl(0, 3.45, -0.4, 0.04, 0.5, 'gold')],
});

/** Settlement buildings, by id (sim/settlements.js SETTLEMENT_BUILDINGS); huts, houses, fields and the walls are drawn as the settlement itself. */
export const SETTLEMENT_MODELS = Object.freeze({
  huts: [cyl(0, 0, 0, 0.45, 0.45, 'mud'), cone(0, 0.4, 0, 0.65, 0.75, 'thatch'), cyl(0.9, 0, 0.3, 0.35, 0.35, 'mud'), cone(0.9, 0.32, 0.3, 0.5, 0.6, 'thatch')],
  houses: [...hall(0, 0, 1.0, 0.8, 0.9, 'clay', 'civ'), ...hall(1.1, 0.2, 0.8, 0.7, 0.8, 'clay', 'civ', 0.3)],
  fields: [box(0, 0, 0, 1.6, 0.08, 1.2, 'sand'), box(0, 0, 1.4, 1.6, 0.08, 1.2, 'green')],
  fishingDock: [box(0, 0, 0, 0.6, 0.12, 2.2, 'plank'), ...[[-0.25, -0.9], [0.25, -0.9], [-0.25, 0.9], [0.25, 0.9]].map(([x, z]) => cyl(x, -0.4, z, 0.06, 0.6, 'wood')),
    prism(0.8, 0, 0.6, 0.7, 0.25, 1.3, 'plank'), box(-0.15, 0.12, -0.5, 0.25, 0.2, 0.25, 'wood')],
  granary: [...hall(0, 0, 1.1, 0.9, 1.3, 'plank', 'thatch'), box(0, 0, 0.66, 0.45, 0.6, 0.04, 'dark'), cyl(0.85, 0, -0.3, 0.3, 0.6, 'thatch')],
  irrigation: [box(0, 0, 0, 2.4, 0.04, 0.3, 'water'), box(0, 0, 0, 0.3, 0.04, 2.4, 'water'), cyl(1.1, 0, 1.1, 0.15, 0.9, 'wood'), box(1.1, 0.75, 0.8, 0.08, 0.08, 0.6, 'wood')],
  woodcutter: [...hall(0, 0, 1.0, 0.7, 0.8, 'plank', 'civ'), ...[0, 1, 2].map((k) => cyl(-1.0, 0.15 + k * 0.22, 0.5 - k * 0.1, 0.1, 0.9, 'wood')).map((p) => ({ ...p, rx: Math.PI / 2 })),
    cyl(0.9, 0, 0.5, 0.25, 0.35, 'wood')],
  quarry: [box(0, 0, 0, 1.8, 0.1, 1.4, 'darkStone'), box(-0.5, 0.1, -0.3, 0.6, 0.5, 0.5, 'stone'), box(0.4, 0.1, 0.2, 0.5, 0.35, 0.5, 'stone', 0.4),
    box(0.7, 0.1, -0.4, 0.35, 0.35, 0.35, 'stone', 0.9), cyl(-0.6, 0.1, 0.5, 0.05, 1.3, 'wood'), box(-0.35, 1.25, 0.5, 0.6, 0.05, 0.05, 'wood')],
  clayPit: [cyl(0, 0, 0, 0.9, 0.06, 'clay'), cyl(-0.3, 0.06, 0.2, 0.25, 0.3, 'clay', 0.2), cyl(0.3, 0.06, -0.1, 0.22, 0.25, 'red', 0.18), cone(1.0, 0, 0.6, 0.4, 0.6, 'red')],
  mine: [pyramid(0, 0, 0, 1.6, 0.9, 1.4, 'darkStone'), box(0, 0, 0.62, 0.6, 0.6, 0.2, 'dark'), box(-0.33, 0, 0.7, 0.08, 0.7, 0.08, 'wood'), box(0.33, 0, 0.7, 0.08, 0.7, 0.08, 'wood'),
    box(0, 0.66, 0.7, 0.8, 0.08, 0.1, 'wood'), box(0.9, 0, 0.6, 0.4, 0.25, 0.3, 'iron'), box(0, 0, 1.2, 0.2, 0.03, 1.0, 'iron')],
  deepMine: [pyramid(0, 0, 0, 1.8, 1.0, 1.6, 'darkStone'), box(0, 0, 0.72, 0.6, 0.6, 0.2, 'dark'), box(0.9, 0, -0.2, 0.12, 2.2, 0.12, 'wood'), box(1.3, 0, -0.2, 0.12, 2.2, 0.12, 'wood'),
    box(1.1, 2.0, -0.2, 0.6, 0.12, 0.12, 'wood'), cyl(1.1, 1.6, -0.2, 0.2, 0.1, 'iron'), box(-0.8, 0, 0.7, 0.35, 0.25, 0.3, 'gem'), box(-0.4, 0, 0.9, 0.3, 0.2, 0.3, 'gold')],
  warehouse: [box(0, 0, 0, 2.0, 1.1, 1.2, 'plank'), prism(0, 1.1, 0, 1.3, 0.5, 2.1, 'civ', Math.PI / 2), box(0, 0, 0.62, 0.8, 0.8, 0.04, 'dark'),
    box(-0.8, 0, 0.9, 0.3, 0.3, 0.3, 'wood'), box(-0.5, 0, 0.95, 0.3, 0.3, 0.3, 'wood'), box(-0.65, 0.3, 0.92, 0.3, 0.3, 0.3, 'wood')],
  market: [...[[-0.6, 0], [0.6, 0]].flatMap(([x, z]) => [cyl(x - 0.4, 0, z - 0.3, 0.04, 0.8, 'wood'), cyl(x + 0.4, 0, z + 0.3, 0.04, 0.8, 'wood'),
    prism(x, 0.8, z, 0.8, 0.3, 0.95, 'civ', Math.PI / 2), box(x, 0, z, 0.8, 0.4, 0.4, 'plank')]), box(-0.6, 0.4, 0, 0.3, 0.15, 0.2, 'salt'), box(0.6, 0.4, 0, 0.3, 0.15, 0.2, 'copper')],
  shrine: [box(0, 0, 0, 1.2, 0.2, 1.2, 'stone'), box(0, 0.2, 0, 0.8, 0.8, 0.8, 'white'), pyramid(0, 1.0, 0, 1.0, 0.6, 1.0, 'civ'), cone(0, 0.2, 0.55, 0.08, 0.2, 'fire')],
  school: [...hall(0, 0, 1.8, 0.9, 1.1, 'stone', 'civ'), box(0, 0, 0.57, 0.4, 0.6, 0.04, 'dark'), cyl(0.7, 0.9, -0.2, 0.15, 0.4, 'stone'), cone(0.7, 1.3, -0.2, 0.2, 0.25, 'civ'), box(0, 0, 1.0, 1.4, 0.04, 0.6, 'sand')],
  library: [box(0, 0, 0, 1.8, 0.2, 1.4, 'stone'), box(0, 0.2, -0.1, 1.5, 1.0, 1.0, 'white'), ...[-0.5, 0, 0.5].map((x) => cyl(x, 0.2, 0.5, 0.08, 1.0, 'white')),
    prism(0, 1.2, 0.05, 1.3, 0.4, 1.7, 'civ', Math.PI / 2)],
  palace: [box(0, 0, 0, 3.0, 0.3, 2.2, 'stone'), box(0, 0.3, 0, 2.4, 1.4, 1.5, 'white'), dome(0, 1.7, 0, 0.7, 'gold'), ...ring(4, 1.45, (x, z) => [cyl(x, 0, z, 0.25, 2.2, 'white'), cone(x, 2.2, z, 0.3, 0.6, 'civ')], 0, 0, Math.PI / 4),
    box(0, 0.3, 0.77, 0.5, 0.8, 0.04, 'gold')],
  palisade: [...ring(12, 1.0, (x, z) => [cyl(x, 0, z, 0.1, 0.9, 'wood'), cone(x, 0.9, z, 0.1, 0.18, 'wood')])],
  stoneWalls: [box(0, 0, 0, 2.4, 0.9, 0.45, 'darkStone'), cyl(-1.3, 0, 0, 0.35, 1.3, 'stone'), cyl(1.3, 0, 0, 0.35, 1.3, 'stone'), cone(-1.3, 1.3, 0, 0.4, 0.45, 'civ'), cone(1.3, 1.3, 0, 0.4, 0.45, 'civ')],
});

/** Settlement buildings drawn as part of the settlement (homes, fields, the wall), not as a building of their own. */
export const PART_OF_SETTLEMENT = Object.freeze(['huts', 'houses', 'fields', 'palisade', 'stoneWalls']);

/** The model for a building as SimHost.inspect lists it: { kind, id } (kind 'building' or 'wonder' for era ones, the settlement kind otherwise). */
export function modelOf(b) {
  if (b.kind === 'wonder') return WONDER_MODELS[b.id] ?? null;
  if (b.kind === 'building') return ERA_MODELS[b.id] ?? null;
  return SETTLEMENT_MODELS[b.id] ?? null;
}

/** Footprint radius of a model: how far its parts reach from its middle, across the ground. */
export function footprint(parts) {
  let r = 0;
  for (const p of parts) r = Math.max(r, Math.hypot(p.x, p.z) + Math.max(p.w, p.d) / 2);
  return r;
}

/** Height of a model: the top of its tallest part. */
export const heightOf = (parts) => parts.reduce((m, p) => Math.max(m, p.y + p.h), 0);

/** Every id with a model, for tests: era building ids, wonder ids and settlement building ids. */
export const ALL_IDS = Object.freeze({
  era: Object.values(BUILDINGS).flat().map((b) => b.id),
  wonder: WONDERS.map((w) => w.id),
  settlement: SETTLEMENT_BUILDINGS.map((b) => b.id),
});
