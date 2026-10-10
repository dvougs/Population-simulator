// Terrain ids and per-terrain tables. Index with the terrain id.

export const WATER = 0;
export const DESERT = 1;
export const PLAINS = 2;
export const FERTILE = 3;
export const MOUNTAIN = 4;

export const TERRAIN_NAMES = ['water', 'desert', 'plains', 'fertile', 'mountain'];
export const TERRAIN_COUNT = 5;

/** Maximum food a cell can hold, before abundance scaling. */
export const FOOD_CAP = [0, 120, 400, 1000, 80];
/** Fraction of the gap to FOOD_CAP that regrows each tick. */
export const FOOD_REGEN = [0, 0.1, 0.2, 0.3, 0.08];
/** Cost of moving into a cell. Infinity = impassable. */
export const MOVE_COST = [Infinity, 1.5, 1, 1, 3];
/** Terrain that strains people without climate tolerance. */
export const HARSH = [false, true, false, false, true];

/** Food eaten per person per tick. */
export const FOOD_NEED = 1;
/** Below this, a cell's population is cleared and the cell unclaimed. */
export const MIN_CELL_POP = 0.5;
/** Smallest group that will set off to migrate. */
export const MIN_MIGRANT_GROUP = 4;

// Demography, per tick (one tick = one year).
export const YOUTH_YEARS = 15;
export const ADULT_YEARS = 30;
export const ELDER_START = YOUTH_YEARS + ADULT_YEARS;
export const MORTALITY_YOUNG = 0.02;
export const MORTALITY_ADULT = 0.01;
/** How hard starvation hits each cohort, as a share of the unfed fraction. */
export const STARVE_YOUNG = 0.5;
export const STARVE_ADULT = 0.35;
export const STARVE_ELDER = 0.7;
