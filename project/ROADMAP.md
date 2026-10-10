# Roadmap

The game being built. RULES.md says what is implemented today; this file says where it is going. Changes to the design come from the owner through project/QUESTIONS.md.

## The game

A mobile-first browser population simulator. Plain HTML/CSS/JS with ES modules, no build step, no frameworks, served as static files by GitHub Pages from main. Rendering with PixiJS v8, vendored (see CLAUDE.md). Pan and pinch-zoom implemented directly; no other runtime libraries. Simulation logic in pure modules separate from rendering; fixed timestep; seeded RNG; smooth on a mid-range iPhone with a few thousand people.

Touch-first UI: pinch-zoom, pan, tap to inspect, bottom-sheet controls, portrait and landscape, iOS safe areas, web app manifest. The existing UI shell (setup screen, bottom sheet, speed controls, HUD, gestures) is kept; the square-grid and per-cell population code is replaced.

## Map

- Hex grid, default 10 × 10; size is a setup parameter up to 50 × 50. Hexes are drawn large; zoom in to see individual people.
- A map-generation screen comes before the game: size, water amount, mountains, river count, seed, with a live preview and a regenerate button.
- Noise-generated land with coasts and mountain ranges, ocean around the edges.
- Terrain: deep water, coast, plains, forest, hills, mountain, desert, tundra, plus rivers. Each sets food capacity, movement cost and a defence bonus; forests and hills also yield materials. Rivers are walkable and fertile. Lakes and seas are impassable until boats at level 4.
- Food regrows each year toward the hex's capacity. Overused land degrades (plains toward desert) and recovers slowly.

## People

Individual agents; one tick is one year; slow growth overall.

- Inherited traits: fertility, life expectancy, strength, aggression, cooperation, metabolism (food need), heat tolerance, cold tolerance.
- Life state: age, health, hunger, hex, civ, parent.
- Births: each fed adult in its fertile age window, in a hex below its food capacity, has a yearly birth chance set by its fertility and raised by its civ's level. No partner needed. The child copies the parent's traits, each with a small random mutation.
- Deaths: old age (personal life expectancy, shifted by terrain, hunger and health), starvation, war, disasters. No disease.
- Migration: people leave crowded or hungry hexes toward better food nearby. Civ type biases this: expansionists move early, isolationists stay until starving.

## Civs

- Civ types (expansionist, cooperative, nomadic, isolationist, aggressive) bias behaviour on top of each person's traits. Several civs can share a hex.
- Contact: with plenty of food, civs coexist; scarcity plus aggressive people leads to fights; some civ types fight regardless. People living alongside another civ can switch to it.
- Levels 1 to 5, civ-wide, reached by spending materials after enough years at the current level.
  - L1 Foragers: gathering only.
  - L2 Farmers: more food from plains and rivers.
  - L3 Builders: shelter makes harsh terrain survivable.
  - L4 Organised: alliances, organised war, boats across lakes and seas.
  - L5 Kingdom: higher hex capacity, longer life expectancy, can peacefully absorb a civ it shares hexes with.
- Optional god powers, toggled at setup (for example drought, flood, food blessing).

## Setup screen

Civ count (default 2 to 4 at 10 × 10) and types, starting positions and populations, food abundance, base fertility, mutation rate, seed, god powers on or off, end condition (last civ standing, first to L5, year limit with score, sandbox; combinable). Presets and randomise.

## While running

- Speed: pause, single-step and several speeds up to very fast, changeable live.
- A live population count per civ, outside the map.
- Tap a hex: terrain, food, materials, people per civ, and a list of its people.
- Tap a person: traits, age, health, hunger, civ, parent, children.

## End screen

Years run, end reason and winner, oldest person ever and oldest alive, causes of death breakdown (old age, starvation, war, disaster), level over time per civ (chart), population over time per civ (chart), average lifespan per civ, peak population and most hexes held per civ. Yearly stats are recorded during the run so this costs nothing at the end.

## Phases

1. Map-generation screen, hex map in PixiJS, UI shell, pan and zoom, tap a hex.
2. People: ageing, hunger, births, deaths, migration; live population count; tap a person.
3. Traits and mutation; civ types.
4. Contact (coexistence, fights, switching civ), materials, levels 1 to 5, boats.
5. End conditions, end screen with charts, optional god powers, balancing.
