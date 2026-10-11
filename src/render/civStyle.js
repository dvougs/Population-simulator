// Civ colours and shape emblems (RULES.md "How civs and people look"). The
// shape carries the identity as much as the colour, so civs stay apart for
// colour-blind players. Shapes are polygons in a unit circle, shared by the
// map's texture atlas (canvas 2D) and the DOM (inline SVG), so both look alike.

const ring = (r, n = 32) => {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
};

const star = () => {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / 5;
    const r = k % 2 ? 0.45 : 1;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
};

const w = 0.36; // half-width of the plus arms
/** Each shape is a list of closed paths, filled with the even-odd rule (so the ring has a hole). */
export const EMBLEM_SHAPES = Object.freeze({
  circle: [ring(0.92)],
  square: [[[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]],
  triangle: [[[0, -0.98], [0.98, 0.72], [-0.98, 0.72]]],
  diamond: [[[0, -1], [0.85, 0], [0, 1], [-0.85, 0]]],
  plus: [[[-w, -0.95], [w, -0.95], [w, -w], [0.95, -w], [0.95, w], [w, w], [w, 0.95], [-w, 0.95], [-w, w], [-0.95, w], [-0.95, -w], [-w, -w]]],
  star: [star()],
  'down triangle': [[[-0.98, -0.72], [0.98, -0.72], [0, 0.98]]],
  ring: [ring(0.95), ring(0.5)],
});

/** One entry per civ, by civ index (Civ 1 first). Up to 8 civs. */
export const CIV_STYLES = Object.freeze([
  { colour: 'red', rgb: [230, 57, 70], emblem: 'circle' },
  { colour: 'blue', rgb: [58, 134, 255], emblem: 'square' },
  { colour: 'yellow', rgb: [255, 214, 10], emblem: 'triangle' },
  { colour: 'magenta', rgb: [220, 60, 220], emblem: 'diamond' },
  { colour: 'cyan', rgb: [0, 220, 230], emblem: 'plus' },
  { colour: 'orange', rgb: [255, 140, 20], emblem: 'star' },
  { colour: 'white', rgb: [245, 245, 245], emblem: 'down triangle' },
  { colour: 'violet', rgb: [150, 100, 255], emblem: 'ring' },
]);

export const EMBLEM_ORDER = CIV_STYLES.map((s) => s.emblem);

export function civStyle(c) {
  return CIV_STYLES[c % CIV_STYLES.length];
}

/** Trace an emblem's paths into a canvas 2D context, centred at (cx, cy) with radius r. */
export function traceEmblem(ctx, emblem, cx, cy, r) {
  ctx.beginPath();
  for (const path of EMBLEM_SHAPES[emblem]) {
    path.forEach(([x, y], k) => (k ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
    ctx.closePath();
  }
}

const svgPath = (emblem) => EMBLEM_SHAPES[emblem]
  .map((path) => `M${path.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join('L')}Z`).join('');
const SVG_PATHS = Object.fromEntries(Object.keys(EMBLEM_SHAPES).map((e) => [e, svgPath(e)]));

/** Inline SVG markup for civ c's emblem in its colour, with a dark outline (decorative: aria-hidden). */
export function emblemSvg(c, size = 14) {
  const s = civStyle(c);
  const [r, g, b] = s.rgb;
  return `<svg width="${size}" height="${size}" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true" focusable="false">`
    + `<path d="${SVG_PATHS[s.emblem]}" fill="rgb(${r} ${g} ${b})" fill-rule="evenodd" stroke="#0b0e13" stroke-width="0.28" stroke-linejoin="round"/></svg>`;
}
