// Levels in the live report: each civ's level, stockpile and progress towards
// its next level, and a guide to what every level and material does. The guide
// is written from the numbers in levels.js and materials.js, so it follows
// RULES.md ("Gathering and levels") without copying numbers by hand.

import { h, formatNumber } from './dom.js';
import { emblem } from './inspector.js';
import { MATERIAL_IDS, MATERIAL_NAMES, MATERIAL_TIER } from '../sim/materials.js';
import {
  LEVEL_NAMES, REQUIREMENTS, GATHER, LEVEL_EFFECTS, TYPE_LEVEL_RULES, levelMinimums,
} from '../sim/levels.js';
import { DEEP_WATER } from '../sim/terrain.js';

const materialName = (id) => MATERIAL_NAMES[MATERIAL_IDS.indexOf(id)] ?? id;
/** Stockpile amounts, rounded down to one decimal so 79.96 never reads as 80. */
export const amount = (v) => (Math.floor(v * 10 + 1e-9) / 10).toFixed(1).replace(/\.0$/, '');
const pct = (v) => `${Math.round(v * 100)}%`;

/** One progress row: label, a bar, and "have / need". */
function progress(label, have, need, text) {
  const done = have >= need;
  const share = need > 0 ? Math.min(1, have / need) : 1;
  return h('li', { class: done ? 'done' : undefined },
    h('span', { class: 'p-label' }, label),
    h('span', { class: 'p-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round(share * 100)}%` } })),
    h('span', { class: 'p-num' }, text ?? `${formatNumber(have)} / ${formatNumber(need)}`));
}

/** Per civ: level, food security, progress to the next level and the stockpile. */
export function renderLevels(el, stats) {
  if (!el) return;
  el.replaceChildren(...stats.civs.map((c, k) => {
    const head = h('div', { class: 'level-head' },
      emblem(k),
      h('span', { class: 'name' }, `${c.name} · Level ${c.level} ${c.levelName}`),
      c.pop > 0 ? h('span', { class: c.foodSecure ? 'tag ok' : 'tag' }, c.foodSecure ? 'Gathering' : 'Food not secure') : null);
    const parts = [head];
    if (c.pop === 0) parts.push(h('p', { class: 'muted' }, 'Died out.'));
    else if (c.next) {
      const n = c.next;
      const rows = [
        progress('Years', c.yearsAtLevel, n.years),
        progress('People', c.pop, n.pop),
        progress('Hexes', c.hexes, n.hexes),
        ...MATERIAL_IDS.filter((id) => n.materials[id] > 0)
          .map((id) => progress(materialName(id), c.stockpile[id], n.materials[id], `${amount(c.stockpile[id])} / ${formatNumber(n.materials[id])}`)),
      ];
      parts.push(h('p', { class: 'level-next' }, `Next: Level ${n.level} ${n.levelName}`), h('ul', { class: 'progress' }, rows));
    } else parts.push(h('p', { class: 'level-next' }, 'Kingdom: the top level.'));
    if (c.pop > 0 && c.level > 1 && c.pop < c.minPop) {
      parts.push(h('p', { class: 'muted warn' },
        `Below ${formatNumber(c.minPop)} people for ${c.yearsBelowMinimum} of ${LEVEL_EFFECTS.fallBackYears} years: then it falls back a level.`));
    }
    const held = MATERIAL_IDS.filter((id) => c.stockpile[id] > 0);
    parts.push(h('p', { class: 'stock' }, h('span', { class: 'p-label' }, 'Stockpile: '),
      held.length ? held.map((id) => `${materialName(id)} ${amount(c.stockpile[id])}`).join(', ') : 'empty'));
    return h('section', { class: c.pop === 0 ? 'level-civ dead' : 'level-civ', 'data-civ': c.id }, parts);
  }));
}

const LEVEL_TEXT = [
  'Gathering only. Every civ starts here.',
  `Plains and river hexes feed ${pct(LEVEL_EFFECTS.farmBonus)} more.`,
  `Shelter: hunger hurts half as much in desert, tundra and mountain.`,
  `Boats: people can migrate across one sea or lake hex (it costs ${LEVEL_EFFECTS.boatCost} movement point).`,
  `Every hex feeds ${pct(LEVEL_EFFECTS.kingdomBonus)} more (plains and rivers ${pct(LEVEL_EFFECTS.farmBonus + LEVEL_EFFECTS.kingdomBonus)} in all), old age starts `
    + `${LEVEL_EFFECTS.oldAgeDelay} years later, and it fights at × ${LEVEL_EFFECTS.kingdomStrength} strength against civs that are not Kingdoms. `
    + 'A hex whose land neighbours all hold its people is enclosed: everyone else there joins the Kingdom, and no other civ can move in.',
];

const list = (nums) => MATERIAL_IDS.map((id, m) => (nums[m] > 0 ? `${nums[m]} ${materialName(id).toLowerCase()}` : null)).filter(Boolean).join(', ');

/** The level guide for `map` started by `civs` civs: what each level needs and does, and what each material is for. */
export function renderLevelGuide(el, map, civs) {
  if (!el) return;
  let land = 0;
  for (let i = 0; i < map.terrain.length; i++) if (map.terrain[i] !== DEEP_WATER) land++;
  const levels = LEVEL_NAMES.map((name, k) => {
    const L = k + 1;
    const r = REQUIREMENTS[L - 2];
    const m = levelMinimums(L, land, civs);
    const needs = r ? `Needs ${r.years} years at level ${L - 1}, ${formatNumber(m.hexes)} hexes (${r.landPct}% of the land per civ), `
      + `${formatNumber(m.pop)} people, and spends ${list(r.materials)}.` : null;
    const birth = L > 1 ? ` Birth chance +${(LEVEL_EFFECTS.birthPerLevel * 100 * (L - 1)).toFixed(1)} percentage points.` : '';
    return h('li', { 'data-level': L },
      h('strong', {}, `${L} ${name}`), h('span', {}, ` ${LEVEL_TEXT[k]}${birth}`),
      needs ? h('small', {}, needs) : null);
  });
  const used = (m) => REQUIREMENTS.map((r, k) => (r.materials[m] > 0 ? `${LEVEL_NAMES[k + 1]} ${r.materials[m]}` : null)).filter(Boolean).join(', ');
  const materials = MATERIAL_IDS.map((id, m) => {
    const tier = MATERIAL_TIER[m];
    return h('li', { 'data-material': id },
      h('strong', {}, materialName(id)), h('span', {}, ` (${tier}): ${GATHER.yield[tier]} a gatherer a year, at most ${GATHER.cap[tier]} a deposit a year. `
        + `Spent on ${used(m) || 'nothing'}.`));
  });
  const t = TYPE_LEVEL_RULES;
  el.replaceChildren(
    h('p', {}, `A civ gathers only while its food is secure: at most ${GATHER.secureHungryPct}% of its people went hungry last year. Then ${pct(GATHER.gatherShare)} of its adults gather the deposits in its hexes, `
      + 'first what its next level needs. Shared hexes split the yield by headcount; the winner of a fight there takes it all. '
      + 'The stockpile never decays and is only spent on levelling up.'),
    h('p', {}, `Hexes needed are a share of the land per civ: ${formatNumber(land)} land hexes ÷ ${civs} ${civs === 1 ? 'civ' : 'civs'} here. `
      + 'People needed are so many per hex needed. '
      + `A civ that stays below its level's people for ${LEVEL_EFFECTS.fallBackYears} years in a row falls back one level and keeps its stockpile.`),
    h('ol', { class: 'guide-levels' }, levels),
    h('h3', {}, 'Materials'),
    h('ul', { class: 'guide-materials' }, materials),
    h('h3', {}, 'Civ types'),
    h('p', {}, `Cooperative gathers ${t.cooperative.gatherPct - 100}% more. Nomadic needs ${t.nomadic.yearsPct - 100}% more years at each level. `
      + `Isolationist needs ${100 - t.isolationist.yearsPct}% fewer years but ${t.isolationist.materialsPct - 100}% more materials. `
      + `Each gatherer's own cooperation counts too: × (${GATHER.personBase} + cooperation).`),
  );
}
