// Contact between civs sharing a hex: fights and switching civ. Every number
// here is listed in RULES.md ("Contact").
//
// Decide-then-apply: every fight and every switch is decided against one
// snapshot of who is where (taken when the step starts), then the deaths,
// flights and switches apply together, so the order hexes and people are
// visited in never changes who fights, who dies or who switches.

import { DEEP_WATER, DEFENCE_BONUS } from './terrain.js';
import { STRENGTH, AGGRESSION, COOPERATION } from './traits.js';
import { TYPE_RULES } from './civTypes.js';
import { DEATH_WAR } from './life.js';
import { LEVEL_EFFECTS, MAX_LEVEL } from './levels.js';

export const CONTACT = Object.freeze({
  /** (b) Hunger: the hex's food is below its people's total need and the attacker's average aggression is above this. */
  hungerAggression: 0.5,
  /** (c) Crowding: the hex holds at least as many people as its food capacity and the attacker's average aggression is above this. */
  crowdAggression: 0.4,
  /** (d) Numbers: the attacker has at least numbersRatio × the other civ's people in the hex and average aggression above numbersAggression. */
  numbersRatio: 3,
  numbersAggression: 0.45,
  /** (e) Revenge: a civ that lost a fight to another within this many years attacks it. */
  revengeYears: 20,
  /** The loser loses ⌈20%⌉ of its people in the hex, the winner ⌊5%⌋ (rounding down so a small winning group does not trade a person a year for lone migrants), in whole percent so the maths stays integer. */
  loserDeathPct: 20,
  winnerDeathPct: 5,
  /** Yearly chance a person in a shared hex without a fight switches civ = this × their cooperation (× the type's switchAwayFactor). */
  switchPerCooperation: 0.02,
});

const NEVER = -1000000000;

export class Contact {
  /** types[c]: civ c's type id (see civTypes.js); unknown types have no bias. */
  constructor(map, types) {
    const n = map.count;
    const civs = types.length;
    this.civs = civs;
    this.cnt = new Int32Array(n * civs);
    this.str = new Float64Array(n * civs);
    this.agg = new Float64Array(n * civs);
    this.pop = new Int32Array(n);
    this.needSum = new Float64Array(n);
    this.shared = new Uint8Array(n);
    /** Winner of this year's fight in each hex, or −1 (none); read by gathering later. */
    this.fightWinner = new Int8Array(n).fill(-1);
    this.loser = new Int8Array(n);
    this.killLoser = new Int32Array(n);
    this.killWinner = new Int32Array(n);
    this.fleeTo = new Int32Array(n);
    this.seenL = new Int32Array(n);
    this.pickL = new Int32Array(n);
    this.seenW = new Int32Array(n);
    this.pickW = new Int32Array(n);
    this.attacker = new Int8Array(n);
    /** The civ attacked, and the civ that held the hex (it gets the defence bonus; it may be the attacker). */
    this.defender = new Int8Array(n);
    this.holder = new Int8Array(n);
    /** lostTo[a × civs + b]: the last year civ a lost a fight to civ b. */
    this.lostTo = new Int32Array(civs * civs).fill(NEVER);
    this.always = new Uint8Array(civs);
    this.never = new Uint8Array(civs);
    /** Set by the Simulation: each civ's level (Kingdoms fight harder) and the Kingdom enclosing each hex (−1: none). */
    this.level = null;
    this.inside = null;
    /** Set by the Simulation: each civ's building and wonder bonuses (buildings.js eff), or null. */
    this.eff = null;
    this.switchFactor = new Float64Array(civs);
    for (let c = 0; c < civs; c++) {
      const t = TYPE_RULES[types[c]] ?? {};
      this.always[c] = t.alwaysFights ? 1 : 0;
      this.never[c] = t.neverStartsFights ? 1 : 0;
      this.switchFactor[c] = t.switchAwayFactor ?? 1;
    }
  }

  /**
   * One year of contact. lastPop[hex × civs + civ]: people per civ per hex at the end of last year
   * (decides who holds the hex). Callbacks: onDeath(slot, cause) before a war death
   * is removed, onFight(hex, attacker, defender, holder, winner, deaths, killedByWinner,
   * killedByLoser) (deaths on both sides, then the loser's and the winner's people who died),
   * onSwitch(from, to). Returns the number of fights.
   */
  year(people, map, lastPop, year, warRng, switchRng, onDeath, onFight, onSwitch) {
    const civs = this.civs;
    const n = map.count;
    const { cnt, str, agg, pop, needSum, shared, fightWinner } = this;
    const { alive, hex, civ, need } = people;
    const strength = people.traits[STRENGTH];
    const aggression = people.traits[AGGRESSION];
    const cooperation = people.traits[COOPERATION];
    cnt.fill(0); pop.fill(0);
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const h = hex[i];
      cnt[h * civs + civ[i]]++;
      pop[h]++;
    }
    let anyShared = false;
    for (let h = 0; h < n; h++) {
      fightWinner[h] = -1;
      shared[h] = 0;
      if (pop[h] === 0) continue;
      const b0 = h * civs;
      let present = 0;
      for (let c = 0; c < civs; c++) if (cnt[b0 + c] > 0) present++;
      if (present >= 2) { shared[h] = 1; anyShared = true; }
    }
    if (!anyShared) return 0;
    // Strength, aggression and food need are only needed where civs meet.
    str.fill(0); agg.fill(0); needSum.fill(0);
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const h = hex[i];
      if (!shared[h]) continue;
      const k = h * civs + civ[i];
      str[k] += strength[i];
      agg[k] += aggression[i];
      needSum[h] += need[i];
    }

    // Decide the fights, hex by hex.
    let fights = 0;
    for (let h = 0; h < n; h++) {
      if (!shared[h]) continue;
      const b0 = h * civs;
      const short = map.food[h] < needSum[h];
      const crowded = pop[h] >= map.foodCap[h];
      // The chosen pair: the one holding the largest civ there, then the next largest.
      let x = -1;
      let y = -1;
      let att = -1;
      let both = false;
      for (let a = 0; a < civs; a++) {
        const na = cnt[b0 + a];
        if (na === 0 || this.never[a]) continue;
        const avg = agg[b0 + a] / na;
        for (let b = 0; b < civs; b++) {
          const nb = cnt[b0 + b];
          if (b === a || nb === 0) continue;
          let go = this.always[a] === 1;
          if (!go) {
            const qualifies = (short && avg > CONTACT.hungerAggression)
              || (crowded && avg > CONTACT.crowdAggression)
              || (na >= CONTACT.numbersRatio * nb && avg > CONTACT.numbersAggression)
              || year - this.lostTo[a * civs + b] <= CONTACT.revengeYears;
            go = qualifies && warRng.next() < avg;
          }
          if (!go) continue;
          const hi = ahead(cnt, b0, a, b) ? a : b;
          const lo = hi === a ? b : a;
          if (x < 0) { x = hi; y = lo; att = a; both = false; continue; }
          if (hi === x && lo === y) { if (att !== a) both = true; continue; }
          if (ahead(cnt, b0, hi, x) || (hi === x && ahead(cnt, b0, lo, y))) { x = hi; y = lo; att = a; both = false; }
        }
      }
      if (x < 0) continue;
      // The holder had more people here at the end of last year (then more now, then the lower civ number).
      const lx = lastPop[b0 + x];
      const ly = lastPop[b0 + y];
      const def = lx !== ly ? (lx > ly ? x : y) : (ahead(cnt, b0, x, y) ? x : y);
      const off = def === x ? y : x;
      // When both sides would start it, the newcomer is the attacker.
      if (both) att = off;
      const eff = this.eff;
      const bonus = 1 + DEFENCE_BONUS[map.terrain[h]] + (eff ? eff.defence[def] : 0);
      // A Kingdom fighting a civ that is not one is many times stronger.
      const kDef = this.level !== null && this.level[def] === MAX_LEVEL;
      const kOff = this.level !== null && this.level[off] === MAX_LEVEL;
      const sDef = str[b0 + def] * bonus * (kDef && !kOff ? LEVEL_EFFECTS.kingdomStrength : 1) * (eff ? 1 + eff.strength[def] : 1);
      const sOff = str[b0 + off] * (kOff && !kDef ? LEVEL_EFFECTS.kingdomStrength : 1) * (eff ? 1 + eff.strength[off] : 1);
      const win = sOff > sDef ? off : def;
      const lose = win === def ? off : def;
      fightWinner[h] = win;
      this.loser[h] = lose;
      this.attacker[h] = att;
      this.defender[h] = att === x ? y : x;
      this.holder[h] = def;
      // Fewer losers die with a war-loss bonus (Barracks), in whole percent; still at least 1.
      const keep = eff ? 100 - Math.round(eff.warLoss[lose] * 100) : 100;
      this.killLoser[h] = Math.max(1, Math.floor((cnt[b0 + lose] * CONTACT.loserDeathPct * keep + 9999) / 10000));
      this.killWinner[h] = Math.floor(cnt[b0 + win] * CONTACT.winnerDeathPct / 100);
      this.fleeTo[h] = fleeHex(map, h, pop, cnt, civs, win, lose, this.inside);
      this.seenL[h] = 0; this.pickL[h] = 0; this.seenW[h] = 0; this.pickW[h] = 0;
      fights++;
    }

    let attracting = false;
    if (this.eff) for (let c = 0; c < civs; c++) if (this.eff.attract[c] > 0) attracting = true;
    // Apply, in one pass: in a fight hex, war deaths (picked at random on each
    // side, exactly the decided number) and the losers' flight; in any other
    // shared hex, switching civ. Everything reads the snapshot, so a person
    // who has fled or switched changes nothing for anyone else this year.
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const h = hex[i];
      if (!shared[h]) continue;
      const c = civ[i];
      const b0 = h * civs;
      const w = fightWinner[h];
      if (w >= 0) {
        if (c === this.loser[h]) {
          const dies = warRng.next() * (cnt[b0 + c] - this.seenL[h]) < this.killLoser[h] - this.pickL[h];
          this.seenL[h]++;
          if (dies) { this.pickL[h]++; onDeath(i, DEATH_WAR); people.remove(i); }
          else if (this.fleeTo[h] >= 0) hex[i] = this.fleeTo[h];
        } else if (c === w) {
          const dies = warRng.next() * (cnt[b0 + c] - this.seenW[h]) < this.killWinner[h] - this.pickW[h];
          this.seenW[h]++;
          if (dies) { this.pickW[h]++; onDeath(i, DEATH_WAR); people.remove(i); }
        }
        continue;
      }
      let chance = CONTACT.switchPerCooperation * cooperation[i] * this.switchFactor[c] * (this.eff ? 1 - this.eff.loyalty[c] : 1);
      // Civs with an attract bonus (Market, Senate) pull harder: each other civ here weighs its
      // people × (1 + its attract), and the chance grows by the weight per person of the others.
      let total = pop[h] - cnt[b0 + c];
      if (attracting) {
        let w = 0;
        for (let o = 0; o < civs; o++) if (o !== c) w += cnt[b0 + o] * (1 + this.eff.attract[o]);
        chance *= w / total;
        total = w;
      }
      if (switchRng.next() >= chance) continue;
      // Join one of the other civs here, in proportion to their (weighted) people.
      let r = switchRng.next() * total;
      let to = -1;
      for (let o = 0; o < civs; o++) {
        if (o === c || cnt[b0 + o] === 0) continue;
        to = o;
        r -= attracting ? cnt[b0 + o] * (1 + this.eff.attract[o]) : cnt[b0 + o];
        if (r < 0) break;
      }
      onSwitch(c, to);
      civ[i] = to;
    }
    if (fights > 0) {
      for (let h = 0; h < n; h++) {
        const w = fightWinner[h];
        if (w < 0) continue;
        this.lostTo[this.loser[h] * civs + w] = year;
        onFight(h, this.attacker[h], this.defender[h], this.holder[h], w, this.killLoser[h] + this.killWinner[h], this.pickL[h], this.pickW[h]);
      }
    }
    return fights;
  }
}

/** Civ a ranks ahead of civ b in a hex: more people there, then the lower civ number. */
function ahead(cnt, b0, a, b) {
  return cnt[b0 + a] > cnt[b0 + b] || (cnt[b0 + a] === cnt[b0 + b] && a < b);
}

/**
 * Where a fight's losers flee: a neighbouring land hex where the winner had no
 * people at the start of the step (so they are not attacked again next year),
 * the one with the most food left over for its current people (food − people),
 * lowest index on ties; if the winner is in every land neighbour, the best of
 * those by the same measure; −1 if there is no land neighbour. A hex enclosed
 * by a Kingdom other than the loser (inside) is never a refuge.
 */
function fleeHex(map, h, pop, cnt, civs, win, lose, inside) {
  let best = -1;
  let bestSpare = 0;
  let bestFree = false;
  for (let d = 0; d < 6; d++) {
    const t = map.neighbours[h * 6 + d];
    if (t < 0 || map.terrain[t] === DEEP_WATER) continue;
    if (inside && inside[t] >= 0 && inside[t] !== lose) continue;
    const free = cnt[t * civs + win] === 0;
    if (bestFree && !free) continue;
    const s = map.food[t] - pop[t];
    if (best < 0 || (free && !bestFree) || s > bestSpare || (s === bestSpare && t < best)) {
      best = t; bestSpare = s; bestFree = free;
    }
  }
  return best;
}
