// Per-civ population and territory list, sorted by population.

import { h, formatNumber } from './dom.js';
import { rgbCss } from '../render/palette.js';

export function renderStats(listEl, stats) {
  const civs = [...stats.civs].sort((a, b) => b.pop - a.pop || a.id - b.id);
  listEl.replaceChildren(...civs.map((c) => h('li', { class: c.alive ? '' : 'dead', 'data-civ': c.id },
    h('span', { class: 'swatch', style: { background: rgbCss(c.color) } }),
    h('span', { class: 'name' }, c.name, c.alive ? '' : ` (died year ${c.extinctAt})`),
    h('span', { class: 'num' }, formatNumber(c.pop), h('small', {}, 'people')),
    h('span', { class: 'num' }, formatNumber(c.territory), h('small', {}, 'cells')),
  )));
}
