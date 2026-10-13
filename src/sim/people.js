// People pool: one slot per person in parallel typed arrays (struct of arrays).
// Dead slots go on a free list and are reused by the next births, so the
// arrays only grow when more people are alive at once than ever before.

import { TRAITS, TRAIT_RULES, METABOLISM, foodNeed } from './traits.js';

export const NO_PARENT = 0;

export class People {
  constructor(capacity = 256) {
    this.capacity = 0;
    /** Slots in use so far; loops run over 0 … high − 1 and skip dead slots. */
    this.high = 0;
    this.count = 0;
    /** Serial number of the next person (1, 2, 3 …); ids are never reused, slots are. */
    this.nextId = 1;
    this.freeTop = 0;
    this.alloc(Math.max(16, capacity));
  }

  alloc(capacity) {
    const old = this.capacity > 0 ? this : null;
    const grow = (Type, prev) => {
      const a = new Type(capacity);
      if (prev) a.set(prev);
      return a;
    };
    this.alive = grow(Uint8Array, old?.alive);
    this.id = grow(Uint32Array, old?.id);
    /** Id of the mother (NO_PARENT for the founders). */
    this.parent = grow(Uint32Array, old?.parent);
    /** Id of the father (NO_PARENT for the founders). */
    this.father = grow(Uint32Array, old?.father);
    /** 1 for a woman, 0 for a man. */
    this.female = grow(Uint8Array, old?.female);
    /** A woman's years left before she can have a child again (see births in life.js). */
    this.rest = grow(Uint8Array, old?.rest);
    /** Children a woman has borne (twins count 2), up to 255. */
    this.kids = grow(Uint8Array, old?.kids);
    this.age = grow(Uint16Array, old?.age);
    /** 0 to HEALTH_MAX. */
    this.health = grow(Uint8Array, old?.health);
    /** Years in a row without food (0 = ate this year). */
    this.hunger = grow(Uint8Array, old?.hunger);
    this.hex = grow(Int32Array, old?.hex);
    this.civ = grow(Uint8Array, old?.civ);
    /** Generation: 1 for founders, the parent's + 1 for a child (family line length). */
    this.gen = grow(Uint16Array, old?.gen);
    /** Index of the founder this person descends from (0 … founders − 1), for descendant counts. */
    this.founder = grow(Uint16Array, old?.founder);
    /** One Float32Array per trait (0 … 1), named as in TRAITS; traits[k] is the same array as this[TRAITS[k]]. */
    this.traits = TRAITS.map((k) => {
      const a = grow(Float32Array, old?.[k]);
      this[k] = a;
      return a;
    });
    /** Food this person eats a year, cached from their metabolism (call setTraits after changing traits). */
    this.need = grow(Float32Array, old?.need);
    this.free = grow(Int32Array, old?.free);
    this.capacity = capacity;
  }

  /** Adds a person and returns its slot. Grows the arrays (doubling) only when every slot is taken. */
  add(hex, civ, age, health, parentId, gen = 1, founder = 0, female = 0, fatherId = NO_PARENT) {
    let i;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else {
      if (this.high === this.capacity) this.alloc(this.capacity * 2);
      i = this.high++;
    }
    this.alive[i] = 1;
    this.id[i] = this.nextId++;
    this.parent[i] = parentId;
    this.father[i] = fatherId;
    this.female[i] = female;
    this.rest[i] = 0;
    this.kids[i] = 0;
    this.age[i] = age;
    this.health[i] = health;
    this.hunger[i] = 0;
    this.hex[i] = hex;
    this.civ[i] = civ;
    this.gen[i] = gen;
    this.founder[i] = founder;
    for (let k = 0; k < this.traits.length; k++) this.traits[k][i] = TRAIT_RULES.base;
    this.need[i] = foodNeed(this.metabolism[i]);
    this.count++;
    return i;
  }

  /** Sets slot i's traits from values (TRAITS order, already 0 … 1) and refreshes the cached food need. */
  setTraits(i, values) {
    for (let k = 0; k < this.traits.length; k++) this.traits[k][i] = values[k];
    this.need[i] = foodNeed(this.traits[METABOLISM][i]);
  }

  remove(i) {
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }

  /** The used part of every array (for hashing). Views, not copies. */
  views() {
    const n = this.high;
    return [this.alive, this.id, this.parent, this.father, this.female, this.rest, this.kids, this.age, this.health, this.hunger, this.hex, this.civ, ...this.traits]
      .map((a) => a.subarray(0, n));
  }
}
