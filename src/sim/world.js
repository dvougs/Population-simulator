// World state as a struct of typed arrays, one entry per cell (i = y * width + x).

export function createWorld(width, height) {
  const n = width * height;
  return {
    width,
    height,
    size: n,
    terrain: new Uint8Array(n),
    food: new Float32Array(n),
    foodCap: new Float32Array(n),
    /** Food regrowth per tick at zero stock: the most people the cell feeds indefinitely. */
    capacity: new Float32Array(n),
    owner: new Uint8Array(n), // civ id, 0 = unclaimed
    young: new Float32Array(n),
    adult: new Float32Array(n),
    elder: new Float32Array(n),
    // Scratch buffers reused every tick.
    moveTarget: new Int32Array(n),
    moveYoung: new Float32Array(n),
    moveAdult: new Float32Array(n),
    moveElder: new Float32Array(n),
    claimSize: new Float32Array(n),
    claimCiv: new Uint8Array(n),
    neighbours: buildNeighbours(width, height),
  };
}

/** 8-neighbour table: neighbours[i * 8 + k], -1 where off the map. */
function buildNeighbours(width, height) {
  const out = new Int32Array(width * height * 8).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) out[(y * width + x) * 8 + k] = ny * width + nx;
          k++;
        }
      }
    }
  }
  return out;
}

export function cellPop(world, i) {
  return world.young[i] + world.adult[i] + world.elder[i];
}

export function clearCell(world, i) {
  world.young[i] = 0;
  world.adult[i] = 0;
  world.elder[i] = 0;
  world.owner[i] = 0;
}

/** FNV-1a over the persistent state. Equal hashes mean equal worlds. */
export function hashWorld(world) {
  let h = 0x811c9dc5;
  const arrays = [world.terrain, world.owner, world.food, world.young, world.adult, world.elder];
  for (const arr of arrays) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
