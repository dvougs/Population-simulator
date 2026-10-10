// Map summary in the bottom sheet: hexes of each terrain. Per-civ population joins it in Phase 2.

import { h, formatNumber } from './dom.js';
import { rgbCss, TERRAIN_RGB } from '../render/palette.js';
import { TERRAIN_NAMES } from '../sim/terrain.js';

export function renderStats(listEl, stats) {
  const rows = TERRAIN_NAMES.map((name, t) => ({ name, t, n: stats.terrainCounts[t] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.t - b.t);
  listEl.replaceChildren(...rows.map((r) => h('li', { 'data-terrain': r.t },
    h('span', { class: 'swatch', style: { background: rgbCss(TERRAIN_RGB[r.t]) } }),
    h('span', { class: 'name' }, r.name),
    h('span', { class: 'num' }, formatNumber(r.n), h('small', {}, 'hexes')),
  )));
}
