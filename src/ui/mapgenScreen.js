// Map-generation screen: map settings with a live preview. Shown before setup.
// A new map (another seed, preset or size) settles into the preview with a
// short fade and a light sweep; slider drags only redraw, so it never flickers.

import { h } from './dom.js';
import { PRESETS, LIMITS, presetParams, randomParams, normalizeParams, MAP_KEYS, LOWLAND_KEYS, LAND_SHAPES } from '../sim/params.js';
import { randomSeedString } from '../sim/rng.js';
import { drawPreview } from '../render/preview.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const LOWLAND_LABELS = { plains: 'Plains', forest: 'Forest', desert: 'Desert', tundra: 'Tundra' };
const SHAPE_LABELS = { continent: 'One continent', islands: 'Islands' };

export class MapgenScreen {
  /**
   * form: the settings form; canvas: preview canvas; info: preview caption.
   * preview(params) returns map data from the SimHost; onContinue(params) moves on to setup.
   */
  constructor({ form, canvas, info }, { preview, onContinue }) {
    this.form = form;
    this.canvas = canvas;
    this.info = info;
    this.previewFn = preview;
    this.onContinue = onContinue;
    this.params = presetParams('default');
    this.preset = 'default';
    this.map = null;
    this.frame = 0;
    this.pulseAt = -Infinity;
    this.lastHash = null;
    this.render();
    new ResizeObserver(() => { if (this.map && !this.form.closest('[hidden]')) drawPreview(this.canvas, this.map); }).observe(canvas);
  }

  /** Keeps non-map params (end condition) as given; only the map keys are edited here. */
  setParams(p, preset = 'custom') {
    this.params = normalizeParams(p);
    this.preset = preset;
    this.render();
  }

  getParams() {
    return normalizeParams(this.params);
  }

  markCustom() {
    if (this.preset === 'custom') return;
    this.preset = 'custom';
    const sel = this.form.querySelector('#m-preset');
    if (sel) sel.value = 'custom';
  }

  /** Redraw the preview once per animation frame, however many inputs fire in it. */
  schedulePreview() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.redraw();
    });
  }

  redraw() {
    this.map = this.previewFn(this.getParams());
    drawPreview(this.canvas, this.map);
    const c = this.map.terrainCounts;
    const water = c[0];
    const rivers = this.map.river.reduce((s, v) => s + v, 0);
    this.info.textContent = `${this.map.cols} × ${this.map.rows} hexes · ${this.map.cols * this.map.rows - water} land · ${rivers} river hexes`;
    this.canvas.dataset.hash = this.map.hash;
    if (this.map.hash !== this.lastHash) this.pulse();
    this.lastHash = this.map.hash;
  }

  /** Fade the fresh map in and sweep a highlight across it, at most once per animation. */
  pulse() {
    const now = performance.now();
    if (now - this.pulseAt < 450 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.pulseAt = now;
    this.canvas.animate?.([
      { opacity: 0.35, transform: 'scale(0.975)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    this.canvas.parentElement?.querySelector('.preview-sheen')?.animate?.([
      { transform: 'translateX(-110%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateX(110%)', opacity: 0 },
    ], { duration: 700, easing: 'ease-out' });
  }

  /** Apply a new set of map values without rebuilding the form (keeps focus while typing). */
  apply(changes, custom = true) {
    Object.assign(this.params, changes);
    if (custom) this.markCustom();
    this.schedulePreview();
  }

  render() {
    const p = this.params;
    const fullRender = (np, preset) => { this.setParams({ ...this.params, ...np }, preset); };

    const presetSelect = h('select', {
      id: 'm-preset', class: 'grow',
      onchange: (e) => { if (e.target.value !== 'custom') fullRender(presetParams(e.target.value), e.target.value); },
    },
    Object.entries(PRESETS).map(([k, v]) => h('option', { value: k, selected: k === this.preset }, v.label)),
    h('option', { value: 'custom', selected: this.preset === 'custom' }, 'Custom'));

    const seedInput = h('input', {
      id: 'm-seed', type: 'text', class: 'grow', value: p.seed, autocomplete: 'off', spellcheck: 'false',
      maxlength: LIMITS.seedLength, 'aria-label': 'Seed',
      oninput: (e) => this.apply({ seed: e.target.value }),
    });

    this.form.replaceChildren(
      h('fieldset', { class: 'group' },
        h('legend', {}, 'Map'),
        h('div', { class: 'row' }, h('label', { for: 'm-preset' }, 'Preset'), presetSelect),
        h('div', { class: 'row' },
          h('label', { for: 'm-seed' }, 'Seed'), seedInput),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn grow', id: 'btn-regenerate',
            onclick: () => { seedInput.value = randomSeedString(); this.apply({ seed: seedInput.value }); } }, '↻ Regenerate'),
          h('button', { type: 'button', class: 'btn grow', id: 'btn-map-randomise',
            onclick: () => {
              const r = randomParams();
              fullRender(Object.fromEntries(MAP_KEYS.map((k) => [k, r[k]])), 'custom');
            } }, '🎲 Randomise')),
        slider('m-size', 'Size', p.size, LIMITS.size.min, LIMITS.size.max, 1, (v) => `${v} × ${v}`, (v) => this.apply({ size: v })),
        h('div', { class: 'row' }, h('label', { for: 'm-shape' }, 'Land'),
          h('select', { id: 'm-shape', class: 'grow', onchange: (e) => this.apply({ landShape: e.target.value }) },
            LAND_SHAPES.map((k) => h('option', { value: k, selected: k === p.landShape }, SHAPE_LABELS[k])))),
        slider('m-water', 'Water', Math.round(p.water * 100), LIMITS.water.min * 100, LIMITS.water.max * 100, 1,
          (v) => pct(v / 100), (v) => this.apply({ water: v / 100 })),
        slider('m-mountains', 'Mountains', Math.round(p.mountains * 100), LIMITS.mountains.min * 100, LIMITS.mountains.max * 100, 1,
          (v) => pct(v / 100), (v) => this.apply({ mountains: v / 100 })),
        slider('m-rivers', 'Rivers', p.rivers, LIMITS.rivers.min, LIMITS.rivers.max, 1, (v) => String(v), (v) => this.apply({ rivers: v })),
      ),
      h('fieldset', { class: 'group' },
        h('legend', {}, 'Lowland'),
        ...LOWLAND_KEYS.map((k) => slider(`m-${k}`, LOWLAND_LABELS[k], Math.round(p[k] * 100), LIMITS[k].min * 100, LIMITS[k].max * 100, 1,
          (v) => pct(v / 100), (v) => this.apply({ [k]: v / 100 }))),
        h('p', { class: 'civ-desc' },
          'Relative weights for the inland land that is not coast, hills or mountain. All at 0% gives all plains.'),
      ),
    );
    this.form.onsubmit = (e) => {
      e.preventDefault();
      this.onContinue(this.getParams());
    };
    this.schedulePreview();
  }
}

export function slider(id, label, value, min, max, step, fmt, onInput) {
  const out = h('output', { id: `${id}-out`, for: id }, fmt(value));
  // --fill paints the track up to the thumb (styles/main.css).
  const fill = (el, v) => el.style.setProperty('--fill', `${max > min ? ((v - min) / (max - min)) * 100 : 0}%`);
  const input = h('input', { id, type: 'range', class: 'grow', min, max, step, value,
    oninput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); fill(e.target, v); onInput(v); } });
  fill(input, Number(value));
  return h('div', { class: 'row range-row' },
    h('label', { for: id }, label),
    input,
    out);
}
