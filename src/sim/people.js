// People pool: one slot per person in parallel typed arrays (struct of arrays).
// Dead slots go on a free list and are reused by the next births, so the
// arrays only grow when more people are alive at once than ever before.

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
    /** Id of the parent (NO_PARENT for the founders). */
    this.parent = grow(Uint32Array, old?.parent);
    this.age = grow(Uint16Array, old?.age);
    /** 0 to HEALTH_MAX. */
    this.health = grow(Uint8Array, old?.health);
    /** Years in a row without food (0 = ate this year). */
    this.hunger = grow(Uint8Array, old?.hunger);
    this.hex = grow(Int32Array, old?.hex);
    this.civ = grow(Uint8Array, old?.civ);
    this.free = grow(Int32Array, old?.free);
    this.capacity = capacity;
  }

  /** Adds a person and returns its slot. Grows the arrays (doubling) only when every slot is taken. */
  add(hex, civ, age, health, parentId) {
    let i;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else {
      if (this.high === this.capacity) this.alloc(this.capacity * 2);
      i = this.high++;
    }
    this.alive[i] = 1;
    this.id[i] = this.nextId++;
    this.parent[i] = parentId;
    this.age[i] = age;
    this.health[i] = health;
    this.hunger[i] = 0;
    this.hex[i] = hex;
    this.civ[i] = civ;
    this.count++;
    return i;
  }

  remove(i) {
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }

  /** The used part of every array (for hashing). Views, not copies. */
  views() {
    const n = this.high;
    return [this.alive, this.id, this.parent, this.age, this.health, this.hunger, this.hex, this.civ]
      .map((a) => a.subarray(0, n));
  }
}
