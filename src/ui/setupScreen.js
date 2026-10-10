// Setup screen: game settings for the map chosen on the map-generation screen.

import { h } from './dom.js';
import { LIMITS, normalizeParams } from '../sim/params.js';

const END_LABELS = { none: 'Run forever', ticks: 'After a number of years' };

export class SetupScreen {
  constructor(form, { onStart, onChangeMap }) {
    this.form = form;
    this.onStart = onStart;
    this.onChangeMap = onChangeMap;
    this.params = normalizeParams({});
    this.render();
  }

  setParams(p) {
    this.params = normalizeParams(p);
    this.render();
  }

  getParams() {
    return normalizeParams(this.params);
  }

  render() {
    const p = this.params;
    const pct = (v) => `${Math.round(v * 100)}%`;

    const map = h('fieldset', { class: 'group' },
      h('legend', {}, 'Map'),
      h('p', { class: 'map-summary', id: 'setup-map-summary' },
        `${p.size} × ${p.size} hexes, seed “${p.seed}”, water ${pct(p.water)}, mountains ${pct(p.mountains)}, ${p.rivers} ${p.rivers === 1 ? 'river' : 'rivers'}`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn grow', id: 'btn-change-map', onclick: () => this.onChangeMap(this.getParams()) }, '← Change map')),
    );

    const endTicksRow = h('div', { class: 'row', hidden: p.endCondition !== 'ticks' },
      h('label', { for: 'f-end-ticks' }, 'Years'),
      h('input', { id: 'f-end-ticks', type: 'number', inputmode: 'numeric', min: LIMITS.endTicks.min, max: LIMITS.endTicks.max, value: p.endTicks,
        oninput: (e) => { p.endTicks = Number(e.target.value); } }));
    const end = h('fieldset', { class: 'group' },
      h('legend', {}, 'End'),
      h('div', { class: 'row' },
        h('label', { for: 'f-end' }, 'Ends'),
        h('select', { id: 'f-end', class: 'grow', onchange: (e) => { p.endCondition = e.target.value; endTicksRow.hidden = e.target.value !== 'ticks'; } },
          Object.entries(END_LABELS).map(([k, v]) => h('option', { value: k, selected: k === p.endCondition }, v)))),
      endTicksRow,
      h('p', { class: 'civ-desc' }, 'People and civilisations arrive in a later version; for now the world just ages.'),
    );

    this.form.replaceChildren(map, end);
    this.form.onsubmit = (e) => {
      e.preventDefault();
      this.onStart(this.getParams());
    };
  }
}
