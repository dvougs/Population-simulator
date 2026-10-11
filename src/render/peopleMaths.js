// The pure maths behind drawing people (RULES.md "How civs and people look"):
// where each person sits inside their hex, picked from their id alone, the
// sizes people and hex labels are drawn at, and the hex labels' counts. No
// PixiJS here, so the game's map (peopleLayer.js) and the How to play pictures
// (miniMap.js) place and label everyone the same way.

import { HEX_SIZE } from './layout.js';

// World sizes (HEX_SIZE is 32): label emblem radius, person emblem radius, and
// the disc people sit in around their hex centre.
export const LABEL_R = 0.3 * HEX_SIZE;
export const PERSON_R = 0.075 * HEX_SIZE;
export const SPREAD_R = 0.6 * HEX_SIZE;

/** Stable bits from a person's id: their spot inside the hex (uniform over a disc) and their drift. */
export function hash32(id) {
  let x = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Offset of person `id`'s spot from their hex centre, within a disc of radius `spread` (world units). */
export function personSpot(id, spread) {
  const hash = hash32(id);
  const r = spread * Math.sqrt((hash & 0xffff) / 65536);
  const a = (2 * Math.PI * (hash >>> 16)) / 65536;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

/** Short head count for a hex label: at most 4 characters. */
export function shortCount(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${Math.floor(n / 100) / 10}k`;
  if (n < 1e6) return `${Math.min(999, Math.round(n / 1000))}k`;
  return `${Math.min(999, Math.round(n / 1e6))}M`;
}

/** People in hex h, all civs, from a population snapshot's hexCivPop (civs entries per hex). */
export function hexTotal(hexCivPop, civs, h) {
  let total = 0;
  for (let c = 0; c < civs; c++) total += hexCivPop[h * civs + c];
  return total;
}

/** Civ whose emblem labels hex h: the one with most people there, the lower civ number on a tie; -1 if empty. */
export function largestCiv(hexCivPop, civs, h) {
  let best = -1;
  let most = 0;
  for (let c = 0; c < civs; c++) {
    const k = hexCivPop[h * civs + c];
    if (k > most) { most = k; best = c; }
  }
  return best;
}
