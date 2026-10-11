// Setup screen: game settings for the map chosen on the map-generation screen.

import { h } from './dom.js';
import { LIMITS, normalizeParams, randomParams, YEAR_LIMIT_CHOICES } from '../sim/params.js';
import { slider } from './mapgenScreen.js';

const END_KEYS = ['endConditions', 'endTicks', 'dominanceShare', 'dominanceYears'];

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

    const end = this.renderEnd(p);

    const civs = h('fieldset', { class: 'group' },
      h('legend', {}, 'Civilisations'),
      slider('f-civs', 'Civs', p.civCount, LIMITS.civCount.min, LIMITS.civCount.max, 1, String, (v) => { p.civCount = v; }),
      slider('f-start-pop', 'People each', p.startPop, LIMITS.startPop.min, LIMITS.startPop.max, 1, String, (v) => { p.startPop = v; }),
      slider('f-mutation', 'Mutation', Math.round(p.mutation * 100), LIMITS.mutation.min * 100, LIMITS.mutation.max * 100, 1,
        (v) => `±${v}%`, (v) => { p.mutation = v / 100; }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn grow', id: 'btn-civs-randomise',
          onclick: () => {
            const r = randomParams();
            const ends = Object.fromEntries(END_KEYS.map((k) => [k, r[k]]));
            this.setParams({ ...this.params, civCount: r.civCount, startPop: r.startPop, mutation: r.mutation, ...ends });
          } }, '🎲 Randomise')),
      h('p', { class: 'civ-desc' }, 'Each civ starts with its people together on one fertile hex, spread apart from the others. '
        + 'Children inherit their parent\'s traits (each 0 to 1), each nudged by up to ± the mutation: 3% is ±0.03.'),
    );

    this.form.replaceChildren(map, civs, end);
    this.form.onsubmit = (e) => {
      e.preventDefault();
      this.onStart(this.getParams());
    };
  }

  /** End conditions: Sandbox or any mix of Last civ standing, Dominance and Year limit. */
  renderEnd(p) {
    const ticked = (k) => p.endConditions.includes(k);
    const checks = {};
    const sync = () => {
      checks.sandbox.checked = p.endConditions.length === 0;
      domRows.forEach((r) => { r.hidden = !ticked('dominance'); });
      yearRow.hidden = !ticked('years');
      customRow.hidden = !ticked('years') || !custom;
    };
    const setTicked = (k, on) => {
      const rest = p.endConditions.filter((x) => x !== k);
      p.endConditions = normalizeParams({ endConditions: on ? [...rest, k] : rest }).endConditions;
      sync();
    };
    const check = (id, key, label) => {
      checks[key] = h('input', { id, type: 'checkbox', checked: key === 'sandbox' ? p.endConditions.length === 0 : ticked(key),
        onchange: (e) => {
          if (key !== 'sandbox') setTicked(key, e.target.checked);
          // Sandbox means nothing else is ticked; it cannot be unticked on its own.
          else { if (e.target.checked) p.endConditions = []; sync(); }
          for (const k of ['lastCiv', 'dominance', 'years']) checks[k].checked = ticked(k);
        } });
      return h('div', { class: 'row check' }, checks[key], h('label', { for: id }, label));
    };

    const domRows = [
      slider('f-dom-share', 'Share of land', Math.round(p.dominanceShare * 100), LIMITS.dominanceShare.min * 100, LIMITS.dominanceShare.max * 100, 1,
        (v) => `${v}%`, (v) => { p.dominanceShare = v / 100; }),
      h('div', { class: 'row' },
        h('label', { for: 'f-dom-years' }, 'For years'),
        h('input', { id: 'f-dom-years', type: 'number', inputmode: 'numeric', min: LIMITS.dominanceYears.min, max: LIMITS.dominanceYears.max,
          value: p.dominanceYears, oninput: (e) => { p.dominanceYears = Number(e.target.value); } })),
    ];
    let custom = !YEAR_LIMIT_CHOICES.includes(p.endTicks);
    const customInput = h('input', { id: 'f-end-ticks', type: 'number', inputmode: 'numeric', min: LIMITS.endTicks.min, max: LIMITS.endTicks.max,
      value: p.endTicks, oninput: (e) => { p.endTicks = Number(e.target.value); } });
    const customRow = h('div', { class: 'row' }, h('label', { for: 'f-end-ticks' }, 'Custom year'), customInput);
    const yearRow = h('div', { class: 'row' },
      h('label', { for: 'f-end-years' }, 'Ends in year'),
      h('select', { id: 'f-end-years', class: 'grow',
        onchange: (e) => {
          custom = e.target.value === 'custom';
          if (custom) customInput.value = String(p.endTicks);
          else p.endTicks = Number(e.target.value);
          sync();
        } },
      YEAR_LIMIT_CHOICES.map((y) => h('option', { value: y, selected: !custom && y === p.endTicks }, y.toLocaleString('en-US'))),
      h('option', { value: 'custom', selected: custom }, 'Custom')));

    const group = h('fieldset', { class: 'group', id: 'end-conditions' },
      h('legend', {}, 'End'),
      check('f-end-sandbox', 'sandbox', 'Sandbox (no end)'),
      check('f-end-last', 'lastCiv', 'Last civ standing'),
      check('f-end-dominance', 'dominance', 'Dominance'),
      ...domRows,
      check('f-end-year', 'years', 'Year limit'),
      yearRow,
      customRow,
      h('p', { class: 'civ-desc' }, 'The first condition met ends the run. The run always ends if every civ dies out.'),
    );
    sync();
    return group;
  }
}
