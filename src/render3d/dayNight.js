// The look of day and night (RULES.md "Feature flags"): a clock of its own,
// in real seconds and never the sim's, so a day lasts as long whatever the
// game's speed. Pure maths, unit-tested in Node.

/** A day and a night each last this long (seconds), dusk and dawn included. */
export const DAY_S = 30;
export const NIGHT_S = 30;
/** Dusk and dawn: how long the light takes to fade one way or the other (seconds). */
export const TWILIGHT_S = 8;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Daylight at clock time t (seconds): 1 in full day, 0 in full night, eased
 * between. The day starts at t = 0 at the middle of dawn; dusk is centred on
 * DAY_S and dawn on DAY_S + NIGHT_S, so day and night each last their full
 * length measured between the middles of their twilights.
 */
export function daylight(t) {
  const cycle = DAY_S + NIGHT_S;
  const u = ((t % cycle) + cycle) % cycle;
  const half = TWILIGHT_S / 2;
  if (u < half) return smooth(0.5 + u / TWILIGHT_S);
  if (u < DAY_S - half) return 1;
  if (u < DAY_S + half) return smooth((DAY_S + half - u) / TWILIGHT_S);
  if (u < cycle - half) return 0;
  return smooth((u - (cycle - half)) / TWILIGHT_S);
}

/** Where the sun (or, by night, the moon) is in its arc at clock time t: 0 rising to 1 setting. */
export function arcAt(t) {
  const cycle = DAY_S + NIGHT_S;
  const u = ((t % cycle) + cycle) % cycle;
  return u < DAY_S ? u / DAY_S : (u - DAY_S) / NIGHT_S;
}

/** The part of the day at clock time t: 'dawn', 'day', 'dusk' or 'night'. */
export function partOfDay(t) {
  const cycle = DAY_S + NIGHT_S;
  const u = ((t % cycle) + cycle) % cycle;
  const half = TWILIGHT_S / 2;
  if (u < half || u >= cycle - half) return 'dawn';
  if (u < DAY_S - half) return 'day';
  if (u < DAY_S + half) return 'dusk';
  return 'night';
}

/** Whether it is day (more light than not) at clock time t. */
export const isDay = (t) => daylight(t) >= 0.5;
