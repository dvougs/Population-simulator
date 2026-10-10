// Setup screen: builds the parameter form and reads it back as params.

import { h } from './dom.js';
import { CIV_TYPES, CIV_TYPE_IDS, civColor } from '../sim/civTypes.js';
import { PRESETS, GRID_SIZES, MAX_CIVS, presetParams, randomParams, normalizeParams } from '../sim/params.js';
import { randomSeedString } from '../sim/rng.js';
import { rgbCss, TERRAIN_RGB } from '../render/palette.js';

const TERRAIN_KEYS = ['water', 'desert', 'plains', 'fertile', 'mountain'];
const TERRAIN_INDEX = { water: 0, desert: 1, plains: 2, fertile: 3, mountain: 4 };
const CIV_BLURBS = {
  expansionist: 'Spreads early and fast into empty land.',
  cooperative: 'Shares surplus food between its own cells.',
  nomadic: 'Abandons exhausted land and copes with desert.',
  isolationist: 'Efficient and long-lived, slow to move.',
  aggressive: 'Breeds fast and dies young (war comes later).',
};
const PLACEMENT_LABELS = { spread: 'Spread out', clustered: 'Clustered', random: 'Random' };
const END_LABELS = { none: 'Run forever', ticks: 'After a number of years', lastStanding: 'Last civ standing' };

export class SetupScreen {
  constructor(form, { onStart }) {
    this.form = form;
    this.onStart = onStart;
    this.params = presetParams('balanced');
    this.preset = 'balanced';
    this.render();
  }

  setParams(p, preset = 'custom') {
    this.params = normalizeParams(p);
    this.preset = preset;
    this.render();
  }

  getParams() {
    return normalizeParams(this.params);
  }

  markCustom() {
    if (this.preset !== 'custom') {
      this.preset = 'custom';
      this.form.querySelector('#f-preset').value = 'custom';
    }
  }

  render() {
    const p = this.params;
    const set = (key, value) => { p[key] = value; this.markCustom(); };

    const presetSelect = h('select', {
      id: 'f-preset', class: 'grow',
      onchange: (e) => {
        if (e.target.value !== 'custom') this.setParams(presetParams(e.target.value), e.target.value);
      },
    },
    Object.entries(PRESETS).map(([k, v]) => h('option', { value: k, selected: k === this.preset }, v.label)),
    h('option', { value: 'custom', selected: this.preset === 'custom' }, 'Custom'));

    const seedInput = h('input', {
      id: 'f-seed', type: 'text', class: 'grow', value: p.seed, autocomplete: 'off', spellcheck: 'false', maxlength: 64,
      oninput: (e) => set('seed', e.target.value),
    });

    const general = h('fieldset', { class: 'group' },
      h('legend', {}, 'World'),
      h('div', { class: 'row' },
        h('label', { for: 'f-preset' }, 'Preset'), presetSelect),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn grow', id: 'btn-randomise', onclick: () => this.setParams(randomParams()) }, '🎲 Randomise everything')),
      h('div', { class: 'row' },
        h('label', { for: 'f-seed' }, 'Seed'), seedInput,
        h('button', { type: 'button', class: 'btn', 'aria-label': 'New random seed',
          onclick: () => { seedInput.value = randomSeedString(); set('seed', seedInput.value); } }, '↻')),
      h('div', { class: 'row' },
        h('label', { for: 'f-size' }, 'Grid size'),
        h('select', { id: 'f-size', class: 'grow', onchange: (e) => { p.width = p.height = Number(e.target.value); this.markCustom(); } },
          GRID_SIZES.map((s) => h('option', { value: s, selected: s === p.width && s === p.height }, `${s} × ${s}`)),
          GRID_SIZES.includes(p.width) && p.width === p.height ? null : h('option', { value: p.width, selected: true }, `${p.width} × ${p.height}`))),
      slider('f-abundance', 'Resources', p.abundance, 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`, (v) => set('abundance', v)),
    );

    const mixPct = this.mixPercents();
    const terrain = h('fieldset', { class: 'group' },
      h('legend', {}, 'Terrain mix'),
      TERRAIN_KEYS.map((k) => slider(`f-mix-${k}`, k[0].toUpperCase() + k.slice(1), Math.round(p.terrainMix[k] * 100), 0, 80, 1,
        () => `${mixPct[k]}%`,
        (v) => { p.terrainMix[k] = v / 100; this.markCustom(); this.refreshMixLabels(); },
        TERRAIN_RGB[TERRAIN_INDEX[k]])),
    );

    const civList = h('ul', { class: 'civ-list', id: 'civ-list' });
    const counts = {};
    p.civs.forEach((type, idx) => {
      const nth = counts[type] ?? 0;
      counts[type] = nth + 1;
      civList.append(h('li', {},
        h('span', { class: 'swatch', style: { background: rgbCss(civColor(type, nth)) } }),
        h('select', { 'aria-label': `Civilisation ${idx + 1} type`, onchange: (e) => { p.civs[idx] = e.target.value; this.markCustom(); this.render(); } },
          CIV_TYPE_IDS.map((t) => h('option', { value: t, selected: t === type }, CIV_TYPES[t].name))),
        h('button', { type: 'button', class: 'btn small', 'aria-label': `Remove civilisation ${idx + 1}`, disabled: p.civs.length <= 1,
          onclick: () => { p.civs.splice(idx, 1); this.markCustom(); this.render(); } }, '✕')));
    });
    const civs = h('fieldset', { class: 'group' },
      h('legend', {}, `Civilisations (${p.civs.length})`),
      civList,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', id: 'btn-add-civ', disabled: p.civs.length >= MAX_CIVS,
          onclick: () => { p.civs.push(CIV_TYPE_IDS[p.civs.length % CIV_TYPE_IDS.length]); this.markCustom(); this.render(); } }, '+ Add civilisation')),
      h('p', { class: 'civ-desc' }, CIV_TYPE_IDS.map((t) => h('span', {}, h('b', {}, CIV_TYPES[t].name), ': ', CIV_BLURBS[t], h('br')))),
    );

    const endTicksRow = h('div', { class: 'row', hidden: p.endCondition !== 'ticks' },
      h('label', { for: 'f-end-ticks' }, 'Years'),
      h('input', { id: 'f-end-ticks', type: 'number', inputmode: 'numeric', min: 10, max: 100000, value: p.endTicks,
        oninput: (e) => set('endTicks', Number(e.target.value)) }));
    const start = h('fieldset', { class: 'group' },
      h('legend', {}, 'Start and end'),
      slider('f-startpop', 'Start pop.', p.startPop, 10, 2000, 10, (v) => String(v), (v) => set('startPop', v)),
      h('div', { class: 'row' },
        h('label', { for: 'f-placement' }, 'Positions'),
        h('select', { id: 'f-placement', class: 'grow', onchange: (e) => set('placement', e.target.value) },
          Object.entries(PLACEMENT_LABELS).map(([k, v]) => h('option', { value: k, selected: k === p.placement }, v)))),
      h('div', { class: 'row' },
        h('label', { for: 'f-end' }, 'Ends'),
        h('select', { id: 'f-end', class: 'grow', onchange: (e) => { set('endCondition', e.target.value); endTicksRow.hidden = e.target.value !== 'ticks'; } },
          Object.entries(END_LABELS).map(([k, v]) => h('option', { value: k, selected: k === p.endCondition }, v)))),
      endTicksRow,
    );

    const startBar = h('div', { class: 'start-bar' }, h('div', { class: 'inner' },
      h('button', { type: 'submit', class: 'btn primary', id: 'btn-start' }, 'Start simulation')));

    this.form.replaceChildren(general, terrain, civs, start, startBar);
    this.form.onsubmit = (e) => {
      e.preventDefault();
      this.onStart(this.getParams());
    };
  }

  mixPercents() {
    const mix = this.params.terrainMix;
    const total = TERRAIN_KEYS.reduce((s, k) => s + mix[k], 0) || 1;
    return Object.fromEntries(TERRAIN_KEYS.map((k) => [k, Math.round((mix[k] / total) * 100)]));
  }

  refreshMixLabels() {
    const pct = this.mixPercents();
    for (const k of TERRAIN_KEYS) {
      const out = this.form.querySelector(`#f-mix-${k}-out`);
      if (out) out.textContent = `${pct[k]}%`;
    }
  }
}

function slider(id, label, value, min, max, step, fmt, onInput, rgb) {
  const out = h('output', { id: `${id}-out`, for: id }, fmt(value));
  return h('div', { class: 'row' },
    h('label', { for: id }, rgb ? h('span', { class: 'swatch', style: { background: rgbCss(rgb), display: 'inline-block', marginRight: '6px', verticalAlign: '-2px' } }) : null, label),
    h('input', { id, type: 'range', class: 'grow', min, max, step, value,
      oninput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); onInput(v); } }),
    out);
}
