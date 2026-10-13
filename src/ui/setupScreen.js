// Setup screen: game settings for the map chosen on the map-generation screen.

import { h } from './dom.js';
import { LIMITS, normalizeParams, randomParams, YEAR_LIMIT_CHOICES, END_CONDITIONS } from '../sim/params.js';
import { CIV_TYPES, CIV_TYPE_NAMES, civTypeText, defaultCivType } from '../sim/civTypes.js';
import { slider } from './mapgenScreen.js';
import { emblem } from './inspector.js';
import { civStyle } from '../render/civStyle.js';
import { rgbCss } from '../render/palette.js';
import { drawPreview, drawStarts, previewHexAt } from '../render/preview.js';
import { DEEP_WATER } from '../sim/terrain.js';

const END_KEYS = ['endConditions', 'endTicks', 'dominanceShare', 'dominanceYears'];

export class SetupScreen {
  /** preview(params) and starts(params) come from the SimHost: the map, and where each civ would start. */
  constructor(form, { onStart, onChangeMap, preview = null, starts = null, spread = null }) {
    this.form = form;
    this.onStart = onStart;
    this.onChangeMap = onChangeMap;
    this.previewFn = preview;
    this.startsFn = starts;
    this.spreadFn = spread;
    this.params = normalizeParams({});
    this.map = null;
    /** The civ the next tap on the start map places. */
    this.placing = 0;
    this.render();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.drawStartMap()).observe(form);
  }

  setParams(p) {
    const next = normalizeParams(p);
    // Starting positions belong to one map: a different map starts from automatic placement again.
    if (this.map && this.previewFn) {
      const map = this.previewFn(next);
      if (map.hash !== this.map.hash) next.starts = [];
      this.map = map;
    } else if (this.previewFn) this.map = this.previewFn(next);
    this.params = next;
    this.placing = Math.min(this.placing, next.civCount - 1);
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
        `${p.size} × ${p.size} hexes${p.landShape === 'islands' ? ' of islands' : ''}, seed “${p.seed}”, water ${pct(p.water)}, mountains ${pct(p.mountains)}, ${p.rivers} ${p.rivers === 1 ? 'river' : 'rivers'}`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn grow', id: 'btn-change-map', onclick: () => this.onChangeMap(this.getParams()) }, '← Change map')),
    );

    const end = this.renderEnd(p);

    const civs = h('fieldset', { class: 'group wide' },
      h('legend', {}, 'Civilisations'),
      ...this.renderCivList(p),
      slider('f-start-pop', 'People each', p.startPop, LIMITS.startPop.min, LIMITS.startPop.max, 1, String, (v) => { p.startPop = v; }),
      slider('f-mutation', 'Mutation', Math.round(p.mutation * 100), LIMITS.mutation.min * 100, LIMITS.mutation.max * 100, 1,
        (v) => `±${v}%`, (v) => { p.mutation = v / 100; }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn grow', id: 'btn-civs-randomise',
          onclick: () => {
            const r = randomParams();
            const ends = Object.fromEntries(END_KEYS.map((k) => [k, r[k]]));
            this.setParams({ ...this.params, civCount: r.civCount, civTypes: r.civTypes, startPop: r.startPop, mutation: r.mutation, ...ends });
          } }, '🎲 Randomise')),
      h('p', { class: 'civ-desc' }, 'Each civ starts with its people together on one fertile hex, spread apart from the others. '
        + 'Children inherit their parent\'s traits (each 0 to 1), each nudged by up to ± the mutation: 3% is ±0.03.'),
    );

    this.form.replaceChildren(map, civs, this.renderStarts(p), end);
    this.drawStartMap();
    this.form.onsubmit = (e) => {
      e.preventDefault();
      this.onStart(this.getParams());
    };
  }

  /**
   * The civs: a count (also changed by Add civ and each civ's Remove), and per
   * civ its emblem, a type picker and that type's explanation.
   */
  renderCivList(p) {
    const setCount = (n, refocus = null) => {
      const count = Math.min(LIMITS.civCount.max, Math.max(LIMITS.civCount.min, Math.round(Number(n)) || p.civCount));
      // Removing from the middle shifts later civs up; new civs get the default type for their number.
      const types = p.civTypes.slice(0, count);
      for (let k = types.length; k < count; k++) types.push(defaultCivType(k));
      this.setParams({ ...p, civCount: count, civTypes: types });
      // The form is rebuilt; keep focus on the button that was pressed (never the number field, which would open the keyboard).
      if (refocus) this.form.querySelector(refocus)?.focus();
    };
    const remove = (k) => {
      if (p.civCount <= LIMITS.civCount.min) return;
      const types = p.civTypes.filter((_, j) => j !== k);
      const starts = p.starts.filter((_, j) => j !== k);
      this.setParams({ ...p, civCount: types.length, civTypes: types, starts });
    };
    const countRow = h('div', { class: 'row' },
      h('label', { for: 'f-civs' }, 'Civs'),
      h('input', { id: 'f-civs', type: 'number', inputmode: 'numeric', class: 'grow', min: LIMITS.civCount.min, max: LIMITS.civCount.max,
        value: p.civCount, onchange: (e) => setCount(e.target.value) }),
      h('button', { type: 'button', class: 'btn', id: 'btn-add-civ', disabled: p.civCount >= LIMITS.civCount.max,
        onclick: () => setCount(p.civCount + 1, '#btn-add-civ:not([disabled])') }, '+ Add civ'));
    const list = h('ol', { class: 'civ-types', id: 'civ-types' }, p.civTypes.map((type, k) => {
      const desc = h('p', { class: 'type-desc', id: `f-civ-type-${k}-desc` }, civTypeText(type));
      const li = h('li', { 'data-civ': k },
        h('div', { class: 'row' },
          h('label', { for: `f-civ-type-${k}`, class: 'civ-chip' }, emblem(k, 18), `Civ ${k + 1}`),
          h('select', { id: `f-civ-type-${k}`, class: 'grow', 'aria-describedby': desc.id,
            onchange: (e) => { p.civTypes[k] = e.target.value; desc.textContent = civTypeText(e.target.value); } },
          CIV_TYPES.map((t) => h('option', { value: t, selected: t === type }, CIV_TYPE_NAMES[t]))),
          h('button', { type: 'button', class: 'btn', 'aria-label': `Remove Civ ${k + 1}`, disabled: p.civCount <= LIMITS.civCount.min,
            onclick: () => remove(k) }, '✕')),
        desc);
      // The card's edge and glow take the civ's colour (styles/main.css .civ-types li).
      li.style.setProperty('--civ', rgbCss(civStyle(k).rgb));
      return li;
    }));
    return [countRow, list];
  }

  /**
   * Starting positions: the map with every civ's start. Pick a civ, then tap a
   * land hex to start it there; automatic starts are drawn fainter.
   */
  renderStarts(p) {
    if (!this.previewFn) return null;
    this.startCanvas = h('canvas', { id: 'start-map', class: 'start-map', role: 'img',
      'aria-label': 'Map with each civ\'s starting hex. Tap a land hex to move the selected civ there.',
      onclick: (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const hex = previewHexAt(this.map, this.startT, e.clientX - rect.left, e.clientY - rect.top);
        if (hex) this.placeStart(hex.index);
      } });
    const chips = h('div', { class: 'row start-chips', id: 'start-chips' }, p.civTypes.map((_, k) => h('button', {
      type: 'button', class: 'btn chip', id: `btn-start-civ-${k}`, 'aria-pressed': String(k === this.placing),
      onclick: () => { this.placing = k; this.refreshStarts(); },
    }, emblem(k, 16), `Civ ${k + 1}`)));
    this.startNote = h('p', { class: 'civ-desc', id: 'start-note' });
    return h('fieldset', { class: 'group wide', id: 'starts' },
      h('legend', {}, 'Starting positions'),
      chips,
      h('div', { class: 'start-frame' }, this.startCanvas),
      this.startNote,
      h('div', { class: 'row' },
        this.spreadFn ? h('button', { type: 'button', class: 'btn grow', id: 'btn-starts-random', onclick: () => {
          this.params.starts = normalizeParams({ ...this.params, starts: this.spreadFn(this.params) }).starts;
          this.refreshStarts();
        } }, 'Random positions') : null,
        h('button', { type: 'button', class: 'btn grow', id: 'btn-starts-auto', onclick: () => {
          this.params.starts = [];
          this.refreshStarts();
        } }, 'All automatic')));
  }

  /** Start the selected civ on hex `index` (land only), then select the next civ. */
  placeStart(index) {
    const p = this.params;
    if (!this.map || this.map.terrain[index] === DEEP_WATER) return;
    const starts = Array.from({ length: p.civCount }, (_, k) => p.starts[k] ?? -1);
    // A hex holds one chosen start: whoever had it goes back to automatic.
    for (let k = 0; k < starts.length; k++) if (starts[k] === index) starts[k] = -1;
    starts[this.placing] = index;
    p.starts = normalizeParams({ ...p, starts }).starts;
    this.placing = (this.placing + 1) % p.civCount;
    this.refreshStarts();
  }

  refreshStarts() {
    const chips = this.form.querySelectorAll('#start-chips button');
    chips.forEach((b, k) => b.setAttribute('aria-pressed', String(k === this.placing)));
    this.drawStartMap();
  }

  drawStartMap() {
    const canvas = this.startCanvas;
    if (!canvas || !this.map || !canvas.isConnected || canvas.clientWidth === 0) return;
    this.startT = drawPreview(canvas, this.map);
    const { starts, chosen } = this.startsFn ? this.startsFn(this.params) : { starts: [], chosen: [] };
    drawStarts(canvas, this.map, this.startT, starts, chosen, this.placing);
    canvas.dataset.starts = starts.join(',');
    const n = chosen.filter(Boolean).length;
    this.startNote.textContent = `${n ? `${n} of ${starts.length} placed by hand; the others are placed automatically. ` : 'All placed automatically. '}`
      + `Pick a civ, then tap a land hex to start it there.`;
  }

  /** End conditions: Sandbox or any mix of Last civ standing, First to Kingdom, Dominance and Year limit. */
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
          for (const k of END_CONDITIONS) checks[k].checked = ticked(k);
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
      check('f-end-kingdom', 'kingdom', 'First to Kingdom (level 5)'),
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
