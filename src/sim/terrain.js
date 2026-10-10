// Terrain ids and the per-terrain table. Index the arrays with the terrain id.
// Every value here is listed in RULES.md ("Terrain").

export const DEEP_WATER = 0;
export const COAST = 1;
export const PLAINS = 2;
export const FOREST = 3;
export const HILLS = 4;
export const MOUNTAIN = 5;
export const DESERT = 6;
export const TUNDRA = 7;
export const TERRAIN_COUNT = 8;

export const TERRAIN_IDS = ['deepWater', 'coast', 'plains', 'forest', 'hills', 'mountain', 'desert', 'tundra'];
export const TERRAIN_NAMES = ['Deep water', 'Coast', 'Plains', 'Forest', 'Hills', 'Mountain', 'Desert', 'Tundra'];

/** Most food a hex holds (food units; later, one person eats 1 a year). */
export const FOOD_CAPACITY = [0, 50, 60, 40, 30, 10, 10, 15];
/** Cost of entering the hex. Infinity = impassable. */
export const MOVE_COST = [Infinity, 1, 1, 2, 2, 3, 1.5, 1.5];
/** Share added to defenders' strength in the hex (0.5 = +50%). */
export const DEFENCE_BONUS = [0, 0, 0, 0.25, 0.5, 1, 0, 0];
/** Building materials the hex yields; only forest (wood) and hills (stone). */
export const MATERIALS = [0, 0, 0, 30, 20, 0, 0, 0];

/** A river adds this much food capacity to the land hex it runs through. Movement cost is unchanged. */
export const RIVER_FOOD_BONUS = 30;

export const isWater = (t) => t === DEEP_WATER;
