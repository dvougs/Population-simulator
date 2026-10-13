// The Edit sidebar for one civ on the setup screen: its people (or a Custom
// civ's name), colour, type, the 8 starting traits with what each does, its
// own mutation and starting people. It slides in from the right (full width on
// a narrow phone) and edits params.civs[k] and params.civTypes[k] in place.

import { h } from './dom.js';
import { emblem } from './inspector.js';
import { LIMITS, COLOUR_COUNT } from '../sim/params.js';
import { CIV_TYPES, CIV_TYPE_NAMES, civTypeText } from '../sim/civTypes.js';
import { PEOPLES, CUSTOM, people, peopleTraits, traitBudget, BUDGET_SLACK, civNames } from '../sim/peoples.js';
import { CIV_COLOURS } from '../render/civStyle.js';
import { rgbCss } from '../render/palette.js';
import { traitFacts, mutationText } from './traitText.js';

const TRAIT_STEP = 0.05;
const fixed2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const signed = (v) => `${v > 0 ? '+' : ''}${v}`;

/** Budget line and whether it is over the fair budget (setup list and sidebar share it). */
export function budgetState(traits) {
  const points = traitBudget(traits);
  return { points, over: points > BUDGET_SLACK };
}

export const OVER_BUDGET_TEXT = 'Over the fair budget: this civ starts stronger than the historical peoples, so the game may be unbalanced. It is allowed.';

/** The ⚠ shown when a civ is over budget: its message shows on hover and on tap. */
export function budgetWarning(id) {
  const note = h('span', { class: 'budget-note', id: `${id}-note`, role: 'status', hidden: true }, OVER_BUDGET_TEXT);
  const btn = h('button', { type: 'button', class: 'budget-warn', id, title: OVER_BUDGET_TEXT, 'aria-label': 'Over the fair budget', 'aria-describedby': note.id,
    onclick: (e) => { e.stopPropagation(); note.hidden = !note.hidden; } }, '⚠');
  return h('span', { class: 'budget-warn-wrap' }, btn, note);
}

export class CivEditor {
  constructor(root = document.body) {
    this.root = root;
    this.k = -1;
    this.backdrop = h('div', { class: 'civ-editor-backdrop', hidden: true, onclick: () => this.close() });
    this.panel = h('aside', { class: 'civ-editor', id: 'civ-editor', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'civ-editor-title', hidden: true });
    this.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    root.append(this.backdrop, this.panel);
  }

  get isOpen() { return !this.panel.hidden; }

  /** Edit civ k of params; onChange(full) after each change (full: the setup list needs rebuilding), onClose when done. */
  open(k, params, { onChange = () => {}, onClose = () => {} } = {}) {
    this.k = k;
    this.params = params;
    this.onChange = onChange;
    this.onClose = onClose;
    this.render();
    this.backdrop.hidden = false;
    this.panel.hidden = false;
    // Next frame, so the slide-in transition runs.
    requestAnimationFrame(() => this.panel.classList.add('open'));
    this.panel.querySelector('#civ-editor-done')?.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.panel.classList.remove('open');
    this.panel.hidden = true;
    this.backdrop.hidden = true;
    const done = this.onClose;
    this.onClose = () => {};
    done(this.k);
  }

  changed(full = false) {
    this.onChange(full);
    if (full) this.render();
  }

  render() {
    const p = this.params;
    const k = this.k;
    const civ = p.civs[k];
    const name = civNames(p.civs)[k];
    const hist = people(civ.people);

    const header = h('div', { class: 'civ-editor-head' },
      h('h2', { id: 'civ-editor-title', class: 'civ-chip' }, emblem(k, 22), name),
      h('button', { type: 'button', class: 'btn primary', id: 'civ-editor-done', onclick: () => this.close() }, 'Done'));

    const peoplePick = h('div', { class: 'row' },
      h('label', { for: 'f-civ-people' }, 'People'),
      h('select', { id: 'f-civ-people', class: 'grow', onchange: (e) => {
        const id = e.target.value;
        civ.people = id;
        // A people brings its own history: its type and traits.
        civ.traits = { ...peopleTraits(id) };
        if (id !== CUSTOM) p.civTypes[k] = people(id).type;
        this.changed(true);
      } },
      PEOPLES.map((x) => h('option', { value: x.id, selected: x.id === civ.people }, `${x.name} (${CIV_TYPE_NAMES[x.type]})`)),
      h('option', { value: CUSTOM, selected: civ.people === CUSTOM }, 'Custom civ')));
    const about = h('p', { class: 'type-desc', id: 'f-civ-about' }, hist ? hist.about : 'Your own people: name it, pick its type and set its traits.');
    const nameRow = civ.people === CUSTOM ? h('div', { class: 'row' },
      h('label', { for: 'f-civ-name' }, 'Name'),
      h('input', { id: 'f-civ-name', class: 'grow', type: 'text', maxlength: LIMITS.civNameLength, value: civ.name, placeholder: 'Custom civ',
        autocomplete: 'off', onchange: (e) => { civ.name = e.target.value.trim().slice(0, LIMITS.civNameLength); this.changed(true); } })) : null;

    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' }, Array.from({ length: COLOUR_COUNT }, (_, j) => {
      const owner = p.civs.findIndex((c) => c.colour === j);
      const c = CIV_COLOURS[j];
      return h('button', { type: 'button', class: 'swatch', id: `f-civ-colour-${j}`, role: 'radio', 'aria-checked': String(civ.colour === j),
        'aria-label': `${c.colour}${owner >= 0 && owner !== k ? `, used by ${civNames(p.civs)[owner]} (they swap)` : ''}`,
        title: c.colour, style: `--swatch: ${rgbCss(c.rgb)}`, 'data-taken': String(owner >= 0 && owner !== k),
        onclick: () => {
          // A colour another civ has is swapped with this civ's.
          if (owner >= 0 && owner !== k) p.civs[owner].colour = civ.colour;
          civ.colour = j;
          this.changed(true);
        } });
    }));

    const typeDesc = h('p', { class: 'type-desc', id: 'f-civ-type-desc' }, civTypeText(p.civTypes[k]));
    const typeRow = h('div', { class: 'row' },
      h('label', { for: 'f-civ-type' }, 'Type'),
      h('select', { id: 'f-civ-type', class: 'grow', 'aria-describedby': typeDesc.id,
        onchange: (e) => { p.civTypes[k] = e.target.value; typeDesc.textContent = civTypeText(e.target.value); this.changed(false); } },
      CIV_TYPES.map((t) => h('option', { value: t, selected: t === p.civTypes[k] }, CIV_TYPE_NAMES[t]))));

    const budget = h('div', { class: 'budget', id: 'f-civ-budget' });
    const showBudget = () => {
      const b = budgetState(civ.traits);
      budget.replaceChildren(h('span', {}, `Trait budget: ${signed(b.points)} points (fair up to ${BUDGET_SLACK})`), ...(b.over ? [budgetWarning('f-civ-budget-warn')] : []));
      budget.dataset.over = String(b.over);
    };
    showBudget();

    const traitRows = traitFacts().map((t) => {
      const id = `f-trait-${t.id}`;
      const rule = h('p', { class: 'trait-rule', id: `${id}-rule`, hidden: true }, t.rule);
      const range = h('input', { id, type: 'range', class: 'grow', min: 0, max: 1, step: TRAIT_STEP, value: civ.traits[t.id], 'aria-describedby': `${id}-text` });
      const box = h('input', { id: `${id}-num`, type: 'number', class: 'trait-num', min: 0, max: 1, step: TRAIT_STEP, inputmode: 'decimal',
        value: fixed2(civ.traits[t.id]), 'aria-label': `${t.name} (0 to 1)` });
      const fill = () => range.style.setProperty('--fill', `${civ.traits[t.id] * 100}%`);
      const set = (v, from) => {
        if (!Number.isFinite(v)) return;
        civ.traits[t.id] = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
        if (from !== range) range.value = String(civ.traits[t.id]);
        if (from !== box) box.value = fixed2(civ.traits[t.id]);
        fill();
        showBudget();
        this.changed(false);
      };
      range.oninput = () => set(Number(range.value), range);
      box.onchange = () => set(Number(box.value), box);
      fill();
      return h('div', { class: 'trait-row', 'data-trait': t.id },
        h('div', { class: 'row' },
          h('label', { for: id }, t.name),
          h('button', { type: 'button', class: 'info-btn', 'aria-label': `How ${t.name.toLowerCase()} works`, 'aria-expanded': 'false', 'aria-controls': rule.id,
            onclick: (e) => { rule.hidden = !rule.hidden; e.currentTarget.setAttribute('aria-expanded', String(!rule.hidden)); } }, 'ⓘ'),
          range, box),
        h('p', { class: 'trait-text', id: `${id}-text` }, t.text),
        rule);
    });

    const ownSlider = (key, label, gameValue, fmt, min, max, step, toValue, fromValue) => {
      const own = civ[key] !== null;
      const value = own ? civ[key] : gameValue;
      const out = h('output', { id: `f-civ-${key}-out` }, fmt(fromValue(value)));
      const extra = h('p', { class: 'trait-text', id: `f-civ-${key}-text` });
      const input = h('input', { id: `f-civ-${key}`, type: 'range', class: 'grow', min, max, step, value: fromValue(value), disabled: !own,
        oninput: (e) => { civ[key] = toValue(Number(e.target.value)); out.textContent = fmt(Number(e.target.value)); after(); this.changed(false); } });
      const after = () => { if (key === 'mutation') extra.textContent = mutationText(civ.mutation ?? gameValue); };
      after();
      const check = h('input', { id: `f-civ-${key}-own`, type: 'checkbox', checked: own, onchange: (e) => {
        civ[key] = e.target.checked ? toValue(Number(input.value)) : null;
        input.disabled = !e.target.checked;
        if (!e.target.checked) { input.value = String(fromValue(gameValue)); out.textContent = fmt(fromValue(gameValue)); }
        after();
        this.changed(false);
      } });
      return h('div', { class: 'own-setting' },
        h('div', { class: 'row check' }, check, h('label', { for: check.id }, label)),
        h('div', { class: 'row range-row' }, input, out),
        key === 'mutation' ? extra : null);
    };
    const mutation = ownSlider('mutation', `Own mutation (the game's is ±${Math.round(p.mutation * 100)}%)`, p.mutation, (v) => `±${v}%`,
      LIMITS.mutation.min * 100, LIMITS.mutation.max * 100, 1, (v) => v / 100, (v) => Math.round(v * 100));
    const startPop = ownSlider('startPop', `Own starting people (the game's is ${p.startPop})`, p.startPop, String,
      LIMITS.startPop.min, LIMITS.startPop.max, 1, (v) => v, (v) => v);

    const reset = h('button', { type: 'button', class: 'btn grow', id: 'btn-civ-reset', onclick: () => {
      civ.traits = { ...peopleTraits(civ.people) };
      if (civ.people !== CUSTOM) p.civTypes[k] = people(civ.people).type;
      civ.mutation = null;
      civ.startPop = null;
      this.changed(true);
    } }, civ.people === CUSTOM ? 'Reset traits to 0.5' : 'Reset to history');

    this.panel.style.setProperty('--civ', rgbCss(CIV_COLOURS[civ.colour].rgb));
    this.panel.replaceChildren(header, h('div', { class: 'civ-editor-body' },
      h('section', {}, peoplePick, about, nameRow),
      h('section', {}, h('h3', {}, 'Colour'), swatches),
      h('section', {}, typeRow, typeDesc),
      h('section', {}, h('h3', {}, 'Starting traits'), budget, ...traitRows),
      h('section', {}, h('h3', {}, 'Mutation'), mutation),
      h('section', {}, h('h3', {}, 'Starting people'), startPop),
      h('div', { class: 'row' }, reset)));
  }
}
