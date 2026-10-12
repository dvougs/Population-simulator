// The calendar (RULES.md "Time"): one tick is one day, a year is 360 days in
// 12 months of 30 days and 4 seasons of 90. The yearly rules run on set days
// of the year, and moving is spread over the months, so the year unfolds
// rather than happening all at once.

import { TUNDRA, MOUNTAIN } from './terrain.js';

export const DAYS_PER_YEAR = 360;
export const MONTH_DAYS = 30;
export const MONTHS = 12;
export const SEASON_DAYS = 90;
export const SEASON_NAMES = Object.freeze(['Spring', 'Summer', 'Autumn', 'Winter']);
export const WINTER = 3;

/** Day of the month on which that month's movers set out (0-based): the middle of it. */
export const MOVE_DAY = 15;

/**
 * Share of the year's food regrowth that comes back at the start of each season
 * (spring, summer, autumn, winter); together 1. On tundra and mountains nothing
 * grows in winter, so they get only the first three.
 */
export const SEASON_REGROWTH = Object.freeze([0.3, 0.35, 0.25, 0.1]);

/** Terrains closed in winter: nobody moves into or out of them. */
export const WINTER_CLOSED = Object.freeze([TUNDRA, MOUNTAIN]);
/** Gathering on tundra and mountains yields this share in a year (winter's quarter is lost). */
export const WINTER_YIELD = 0.75;

/** Season (0 spring … 3 winter) of a day of the year (0 … 359). */
export const seasonOf = (doy) => Math.floor(doy / SEASON_DAYS);
/** Month (0 … 11) of a day of the year. */
export const monthOf = (doy) => Math.floor(doy / MONTH_DAYS);

/** Per terrain id, 1 where the terrain is closed in winter. */
export function winterClosedMask(terrainCount) {
  const m = new Uint8Array(terrainCount);
  for (const t of WINTER_CLOSED) m[t] = 1;
  return m;
}
