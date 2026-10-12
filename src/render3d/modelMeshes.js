// Building and wonder models (buildingModels.js) as three.js meshes: one
// unit geometry per shape, shared, each part placed by placePart. The hex view
// builds a model as a Group; the 3D map instances the same parts.

import { COLOURS } from './buildingModels.js';

const GREY = 0x8f897e;

/** Unit geometries (1 across, 1 high, standing on y = 0) for each shape; cylinders keyed by top/bottom ratio. */
export function shapeGeometries(T) {
  const up = (g) => { g.translate(0, 0.5, 0); return g; };
  const tri = new T.Shape();
  tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 1); tri.closePath();
  const prism = new T.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  prism.translate(0, 0, -0.5);
  const cyls = new Map();
  return {
    box: up(new T.BoxGeometry(1, 1, 1)),
    cone: up(new T.ConeGeometry(0.5, 1, 8)),
    pyramid: up(new T.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4)),
    prism,
    dome: new T.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
    cylOf(top = 1) {
      const key = Math.round(top * 100);
      if (!cyls.has(key)) cyls.set(key, up(new T.CylinderGeometry(0.5 * (key / 100), 0.5, 1, 10)));
      return cyls.get(key);
    },
    get cyl() { return this.cylOf(1); },
  };
}

/**
 * Set Object3D `o` to part `p` of a model standing at (x, y, z), turned `ry`,
 * at `scale`; `rise` (0 to 1) squashes it toward the ground while it is built.
 */
export function placePart(o, p, x, y, z, ry, scale, rise = 1) {
  const c = Math.cos(ry); const s = Math.sin(ry);
  // Turning by ry about y takes local (px, pz) to (px cos + pz sin, −px sin + pz cos).
  o.position.set(x + (p.x * c + p.z * s) * scale, y + p.y * scale * rise, z + (-p.x * s + p.z * c) * scale);
  o.rotation.set(p.rx ?? 0, ry + (p.ry ?? 0), 0, 'YXZ');
  o.scale.set(p.w * scale, p.h * scale * rise, p.d * scale);
  o.updateMatrix();
}

/** A part's colour: its named colour, the owner's for 'civ', grey for a ruin. */
export function partColour(p, civHex, ruin = false) {
  if (ruin) return p.c === 'fire' ? GREY : mixGrey(p.c === 'civ' ? civHex : COLOURS[p.c]);
  return p.c === 'civ' ? civHex : COLOURS[p.c];
}

function mixGrey(hex) {
  const ch = (sh) => (hex >> sh) & 255;
  const g = (v, w) => Math.round(v * 0.35 + w * 0.65);
  return (g(ch(16), GREY >> 16) << 16) | (g(ch(8), (GREY >> 8) & 255) << 8) | g(ch(0), GREY & 255);
}

/**
 * A model as a Group: `parts` (buildingModels), the owner's colour `civHex`,
 * `status` ('standing', 'building' or 'abandoned'), `progress` (0 to 1 while
 * built), `scale`; `shadows` whether it casts and takes them.
 */
export function buildModel(T, geo, parts, { civHex = 0x9a948a, status = 'standing', progress = 1, scale = 1, shadows = true } = {}) {
  const g = new T.Group();
  const ruin = status === 'abandoned';
  const site = status === 'building';
  const rise = site ? 0.2 + 0.8 * progress : 1;
  const o = new T.Object3D();
  const mats = new Map();
  const matOf = (colour, fire) => {
    const key = `${colour}:${fire}:${site}`;
    if (!mats.has(key)) {
      mats.set(key, fire
        ? new T.MeshBasicMaterial({ color: colour })
        : new T.MeshLambertMaterial({ color: colour, flatShading: true, transparent: site, opacity: site ? 0.75 : 1 }));
    }
    return mats.get(key);
  };
  for (const p of parts) {
    const fire = p.c === 'fire' && !ruin;
    const geom = p.s === 'cyl' ? geo.cylOf(p.top ?? 1) : geo[p.s];
    const m = new T.Mesh(geom, matOf(partColour(p, civHex, ruin), fire));
    placePart(o, p, 0, 0, 0, 0, scale, rise);
    m.matrixAutoUpdate = false;
    m.matrix.copy(o.matrix);
    m.castShadow = shadows && !fire; m.receiveShadow = shadows;
    g.add(m);
  }
  if (site) {
    // Scaffolding round what is built so far.
    let r = 0; let top = 0;
    for (const p of parts) { r = Math.max(r, Math.hypot(p.x, p.z) + Math.max(p.w, p.d) / 2); top = Math.max(top, p.y + p.h); }
    const frame = new T.Mesh(new T.BoxGeometry(r * 2 * scale * 0.9, top * scale * rise + 0.3, r * 2 * scale * 0.9).translate(0, (top * scale * rise + 0.3) / 2, 0),
      new T.MeshBasicMaterial({ color: COLOURS.wood, wireframe: true }));
    g.add(frame);
  }
  return g;
}
