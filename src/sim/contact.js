// Contact between civs sharing a hex: switching civ. Every number here is
// listed in RULES.md ("Contact"). Fighting is war.js.
//
// Decide-then-apply: every switch is decided against one snapshot of who is
// where (taken when the step starts), so the order people are visited in
// never changes who switches.

import { COOPERATION } from './traits.js';
import { TYPE_RULES } from './civTypes.js';

export const CONTACT = Object.freeze({
  /** Yearly chance a person in a shared hex without a battle switches civ = this × their cooperation (× the type's switchAwayFactor). */
  switchPerCooperation: 0.02,
});

export class Contact {
  /** types[c]: civ c's type id (see civTypes.js); unknown types have no bias. */
  constructor(map, types) {
    const n = map.count;
    const civs = types.length;
    this.civs = civs;
    this.cnt = new Int32Array(n * civs);
    this.pop = new Int32Array(n);
    this.shared = new Uint8Array(n);
    /** Kept for step 1 (settlements.js): battles now take hexes at once (war.js), so it stays −1. */
    this.fightWinner = new Int8Array(n).fill(-1);
    /** Set by the Simulation: each civ's building and wonder bonuses (buildings.js eff), or null. */
    this.eff = null;
    this.switchFactor = new Float64Array(civs);
    for (let c = 0; c < civs; c++) this.switchFactor[c] = (TYPE_RULES[types[c]] ?? {}).switchAwayFactor ?? 1;
  }

  /**
   * One year of switching civ, in every land hex shared by several civs where no battle was
   * fought this year (fought[hex] = 1, see war.js). onSwitch(from, to). Returns the switches.
   */
  year(people, map, fought, switchRng, onSwitch) {
    const civs = this.civs;
    const n = map.count;
    const { cnt, pop, shared } = this;
    const { alive, hex, civ } = people;
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
      shared[h] = 0;
      if (pop[h] === 0 || (fought && fought[h])) continue;
      const b0 = h * civs;
      let present = 0;
      for (let c = 0; c < civs; c++) if (cnt[b0 + c] > 0) present++;
      if (present >= 2) { shared[h] = 1; anyShared = true; }
    }
    if (!anyShared) return 0;
    let attracting = false;
    if (this.eff) for (let c = 0; c < civs; c++) if (this.eff.attract[c] > 0) attracting = true;
    // Everyone decides against the counts taken above, so a person who has
    // switched changes nothing for anyone else this year.
    let switches = 0;
    for (let i = 0; i < people.high; i++) {
      if (!alive[i]) continue;
      const h = hex[i];
      if (!shared[h]) continue;
      const c = civ[i];
      const b0 = h * civs;
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
      switches++;
    }
    return switches;
  }
}
