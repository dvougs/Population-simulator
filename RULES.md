# Rules

How the game works, as currently implemented. Every number here is the value the code uses. If the game and this file disagree, the game has a bug (see CLAUDE.md).

This describes the current build (Phase 1): a generated hex map with time passing. There are no people yet; they arrive in Phase 2. The full design is in [project/ROADMAP.md](project/ROADMAP.md); this file changes as each part of it ships.

## Time

- One tick is one year. The game starts at year 0.
- At 1× the game runs 8 years per second. Speeds: 1×, 2×, 5×, 20× and Max (as many years as fit in 9 ms of each frame).
- Pause stops time; Step advances exactly one year, paused or not.
- If the device cannot keep up with the chosen speed, years are skipped rather than queued.
- Nothing on the map changes as years pass yet: with no people, nothing eats, so every hex keeps its full food.

## The map

- The map is a square of pointy-top hexes, size × size, default 10 × 10, any size from 10 to 50.
- Rows are laid out with odd rows shifted half a hex to the right. Each hex touches up to 6 neighbours; hexes on the edge have fewer (none off the map). The map does not wrap.
- The distance between two hexes is the number of steps from one to the other through neighbours.
- The map depends only on the five map settings (seed, size, water, mountains, rivers): the same settings always give the same map.

### How the map is made

All noise is value noise (random values on a grid, blended with smoothstep), sampled at each hex centre with the map scaled to fill a unit square.

1. **Elevation** = 0.6 × noise + 0.4 × (1 − (x² + y²) ÷ 2), where x and y run from −1 at one edge to 1 at the other. The second term lowers the land towards the edges so the land forms a coastline inside the sea. The noise has 4 octaves and 2 + ⌊size ÷ 12⌋ cells across at the coarsest.
2. **Water.** Every edge hex is deep water (ocean). Of the other hexes, the lowest *water amount* share (rounded to whole hexes) is deep water too. Water connected to the edge is sea; any other water is a lake.
3. **Mountains and hills.** Each land hex gets a mountain score = 0.6 × ridge + 0.4 × elevation, where ridge = 1 − |2 × noise − 1| (2 octaves, 2 + ⌊size ÷ 8⌋ cells), which runs in lines and makes ranges. The top *mountains* share of land hexes become mountain; the next 15% of land hexes become hills.
4. **Coast.** Every other land hex next to the sea is coast. Hexes next only to a lake are not coast.
5. **Climate.** The remaining land is split by climate:
   - temperature = 0.7 × latitude + 0.3 × noise − 0.2 × elevation, where latitude is 1 on the middle row and 0 on the top and bottom rows;
   - moisture = noise (3 octaves, 2 + ⌊size ÷ 10⌋ cells).
   - The coldest 15% become tundra; then the driest 15% of that same starting number (dryness = 1 − moisture + 0.3 × temperature) become desert; then the wettest 30% become forest; the rest are plains.
6. **Rivers.** Up to *river count* rivers. Each starts at a random hill or mountain hex that is not next to water or another river (any inland non-coast land hex if there is no such hill or mountain; fewer rivers if there is no room). It flows hex by hex to the lowest neighbour until it reaches water (sea or lake) or joins another river. Hollows are filled before tracing, so every river runs downhill to water.

When several hexes tie on a value, the one with the lower index (row × size + column) comes first.

### Terrain

| Terrain | Food capacity | Movement cost | Defence bonus | Materials |
|---|---|---|---|---|
| Deep water (sea or lake) | 0 | impassable | 0% | 0 |
| Coast | 50 | 1 | 0% | 0 |
| Plains | 60 | 1 | 0% | 0 |
| Forest | 40 | 2 | +25% | 30 (wood) |
| Hills | 30 | 2 | +50% | 20 (stone) |
| Mountain | 10 | 3 | +100% | 0 |
| Desert | 10 | 1.5 | 0% | 0 |
| Tundra | 15 | 1.5 | 0% | 0 |

- **Rivers** run through land hexes. A river hex keeps its terrain's movement cost, defence bonus and materials (rivers are walkable) and gets +30 food capacity (rivers are fertile).
- Seas and lakes are impassable.
- Every hex starts with food equal to its food capacity.
- Food capacity is in food units; when people arrive, a person will eat 1 food a year.
- The defence bonus, materials and movement cost have no effect yet: they are used once people, fights and levels arrive.

## Map settings

Chosen on the map-generation screen, before setup.

| Setting | Default | Range |
|---|---|---|
| Seed | pangaea | any text, up to 64 characters (empty means the default) |
| Size | 10 (10 × 10 hexes) | 10 to 50 |
| Water amount | 25% of the non-edge hexes | 0% to 70%, whole percent |
| Mountains | 12% of land hexes | 0% to 40%, whole percent |
| River count | 2 | 0 to 20 |

Out-of-range values are clamped to the range; values that are not numbers fall back to the default.

Presets:

| Preset | Seed | Size | Water | Mountains | Rivers |
|---|---|---|---|---|---|
| Small world (the default) | pangaea | 10 | 25% | 12% | 2 |
| Continent | continent | 30 | 20% | 12% | 6 |
| Archipelago | islands | 30 | 60% | 8% | 2 |
| Highlands | peaks | 20 | 15% | 30% | 5 |
| Large world | vast | 50 | 30% | 12% | 12 |

- Regenerate picks a new random seed and keeps the other settings.
- Randomise picks a new seed, a size from 10 to 50, water 10% to 60%, mountains 5% to 30% and 0 to ⌊size ÷ 4⌋ rivers.

## Game settings

Chosen on the setup screen, after the map.

| Setting | Default | Range |
|---|---|---|
| End condition | None (run forever) | None, Year limit |
| Year limit | 1000 | 10 to 100000 |

## End of the game

- With a year limit, the game ends when that year is reached. Otherwise it runs until you leave.
- There is no end screen yet; the end reason is shown when the game stops.

## Not in the game yet

People, civilisations, births and deaths, migration, food use and regrowth, land degrading, traits and mutation, contact and war, materials and levels, boats, god powers and the end screen. See [project/ROADMAP.md](project/ROADMAP.md).
