// The names of the civs in the game on show (their peoples', or typed for a
// Custom civ), set when a game starts; the UI's one place to name a civ.

let names = [];

/** Use these names from now on (one per civ, Civ 1 first). */
export function setCivNames(list) {
  names = Array.isArray(list) ? list.slice() : [];
}

/** Civ c's name ("Civ 3" if none was set). */
export const civName = (c) => names[c] ?? `Civ ${c + 1}`;
