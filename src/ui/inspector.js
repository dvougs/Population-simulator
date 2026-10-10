// Floating card describing the tapped cell.

import { h, formatNumber } from './dom.js';
import { rgbCss } from '../render/palette.js';

export function renderInspector(el, cell, onClose) {
  if (!cell) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const owner = cell.owner
    ? h('span', { class: 'owner-chip' }, h('span', { class: 'swatch', style: { background: rgbCss(cell.owner.color) } }), cell.owner.name)
    : 'Unclaimed';
  const rows = [
    ['Owner', owner],
    ['People', formatNumber(cell.pop)],
  ];
  if (cell.pop > 0) {
    rows.push(['Young / adult / old', `${formatNumber(cell.young)} / ${formatNumber(cell.adult)} / ${formatNumber(cell.elder)}`]);
  }
  if (cell.terrain !== 'water') {
    rows.push(['Food', `${formatNumber(cell.food)} / ${formatNumber(cell.foodCap)}`]);
    rows.push(['Feeds about', `${formatNumber(cell.capacity)} people`]);
  } else {
    rows.push(['Food', 'None (impassable)']);
  }
  el.replaceChildren(
    h('header', {},
      h('h3', {}, `${cell.terrain} (${cell.x}, ${cell.y})`),
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Close cell details', onclick: onClose }, '✕')),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
  );
}
