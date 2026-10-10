# Rules

How the game works, as currently implemented. Every number here is the value the code uses. If the game and this file disagree, the game has a bug (see CLAUDE.md).

This describes the current build: a square grid where each cell holds a group of people of one civilisation, counted by age group. The design being built next (hex map, individual people, levels) is in [project/ROADMAP.md](project/ROADMAP.md); this file changes as each part of it ships.

## Time

- One tick is one year.
- At 1× the game runs 8 years per second. Speeds: 1×, 2×, 5×, 20× and Max (as many years as fit in 9 ms of each frame).
- Pause stops time; Step advances exactly one year, paused or not.
- If the device cannot keep up with the chosen speed, years are skipped rather than queued.

## The map

- A square grid, default 100 × 100 cells. Setup offers 50, 75, 100 or 150; any width or height from 20 to 200 is accepted.
- Each cell touches up to 8 neighbours (sides and corners). The map does not wrap.
- Terrain is generated from the seed with value noise: an elevation map decides water (lowest) and mountains (highest); a moisture map splits the rest into desert (driest), plains and fertile land (wettest). The terrain mix setting fixes the exact share of each type.

### Terrain

| Terrain | Food capacity | Regrowth per year | Sustainable food per year | Movement cost | Harsh |
|---|---|---|---|---|---|
| Water | 0 | 0 | 0 | impassable | no |
| Desert | 120 | 10% | 12 | 1.5 | yes |
| Plains | 400 | 20% | 80 | 1 | no |
| Fertile | 1000 | 30% | 300 | 1 | no |
| Mountain | 80 | 8% | 6.4 | 3 | yes |

- Each cell's food capacity is the table value × food abundance × a random factor between 0.8 and 1.2. Cells start full.
- Every year, food regrows by the regrowth share of the gap between current food and capacity.
- A cell's sustainable food (regrowth × capacity) is what it can feed year after year.

## People

People are counted per cell in three age groups:

| Group | Ages | Yearly death rate (when fed) |
|---|---|---|
| Young | 0 to 14 | 2% |
| Adult | 15 to 44 | 1% |
| Elder | 45+ | 1 ÷ max(3, lifespan − 45) |

- Each year 1/15 of the young become adults and 1/30 of the adults become elders.
- Each person eats 1 food per year, divided by the civ's food efficiency. On harsh terrain (desert, mountain) they need 1 + (1 − climate tolerance) × 0.6 times as much.
- A cell can feed (sustainable food × food efficiency) ÷ (1 × harsh multiplier) people indefinitely. This is its carrying capacity for that civ.

### Births

- Births per year = adults × fertility × share of food needs met × crowding factor.
- Crowding factor = 1.5 − 0.5 × (people ÷ carrying capacity), kept between 0 and 1. It is 1 up to full capacity and falls to 0 at three times capacity.
- No partner is needed.

### Starvation

When a cell cannot meet its food need, the unfed share raises each group's death rate:

| Group | Extra death rate |
|---|---|
| Young | unfed share × 0.5 |
| Adult | unfed share × 0.35 |
| Elder | unfed share × 0.7 |

A cell with fewer than 0.5 people left is emptied and becomes unclaimed.

### Food sharing

- Civs with food sharing (Cooperative 0.3, Isolationist 0.1) put food into a common pool: a cell with no shortfall and food above half its capacity gives (food − half capacity) × sharing × 0.2 each year.
- Hungry cells of that civ draw from last year's pool in proportion to their shortfall, up to the pool's size.
- Half of an unused pool is kept for the next year.

### Migration

- A cell's pressure is people ÷ carrying capacity. When it passes the civ's migration threshold, a share of the people leaves: migration share × min(1, (pressure − threshold) ÷ threshold + 0.25).
- Nomadic civs leave a cell completely when its food falls below 35% of capacity.
- Groups smaller than 4 people never move, and cells with fewer than 4 people never send anyone.
- A group moves to one neighbouring land cell that is unclaimed or already its civ's. Each candidate's attraction is (its carrying capacity + 1) ÷ (its people + group + 1) ÷ its movement cost, multiplied by the civ's unclaimed-land bias for unclaimed cells. Only cells more attractive than the current one count (except for nomads leaving depleted land). One is picked at random, weighted by attraction.
- If several civs send groups to the same unclaimed cell in the same year, the largest group claims it and the others stay home.
- Moving costs lives: survivors = 1 − 0.05 × (movement cost − 1). Moving onto desert loses 2.5%, onto mountains 10%.
- Borders are hard: people never enter a cell owned by another civ. Conflict is not in the game yet.

## Civilisations

Each cell belongs to at most one civ. Five types:

| Type | Fertility | Lifespan | Food efficiency | Climate tolerance | Aggression | Migration threshold | Migration share | Unclaimed-land bias | Food sharing | Nomadic |
|---|---|---|---|---|---|---|---|---|---|---|
| Expansionist | 0.12 | 60 | 1.0 | 0.3 | 0.5 | 0.35 | 0.2 | 3 | 0 | no |
| Cooperative | 0.11 | 66 | 1.05 | 0.3 | 0.15 | 0.7 | 0.12 | 1.5 | 0.3 | no |
| Nomadic | 0.1 | 58 | 0.95 | 0.8 | 0.35 | 0.5 | 0.3 | 2 | 0 | yes |
| Isolationist | 0.09 | 72 | 1.25 | 0.4 | 0.1 | 0.85 | 0.1 | 1 | 0.1 | no |
| Aggressive | 0.15 | 52 | 0.9 | 0.3 | 0.9 | 0.55 | 0.18 | 2 | 0 | no |

- Aggression has no effect yet.
- Traits do not change during a game (no mutation yet).

### Starting positions

- Starts are land cells with a sustainable food of at least 20 (any land cell if there are none).
- Spread: each start is the best of 48 random candidates, the one farthest from the starts already chosen. Clustered: the nearest free candidates around one random centre. Random: random candidates.
- Starts are at least 3 cells apart.
- Each civ settles its start cell and its free neighbouring land, splitting its starting population evenly: 35% young, 50% adults, 15% elders.
- A civ that finds no room to start is extinct from year 0.

## Setup

| Setting | Default | Range |
|---|---|---|
| Seed | pangaea | any text, up to 64 characters |
| Grid size | 100 × 100 | 20 to 200 per side (setup offers 50, 75, 100, 150) |
| Terrain mix | water 22%, desert 13%, plains 33%, fertile 20%, mountain 12% | each 0 to 100%, rescaled to sum to 100%; at least 5% land (otherwise 30% plains is added) |
| Civilisations | Expansionist, Cooperative, Nomadic, Isolationist, Aggressive, Expansionist | 1 to 10, any types |
| Starting population per civ | 300 | 10 to 5000 |
| Starting positions | Spread | Spread, Clustered, Random |
| Food abundance | 1 | 0.2 to 3 |
| End condition | None | None, Year limit, Last civ standing |
| Year limit | 1000 | 10 to 100000 |

Presets:

| Preset | Changes from the default |
|---|---|
| Balanced | none |
| Archipelago | seed islands; water 50%, desert 5%, plains 20%, fertile 17%, mountain 8% |
| Drylands | seed dune; water 8%, desert 45%, plains 25%, fertile 7%, mountain 15%; abundance 0.8; civs Nomadic, Nomadic, Expansionist, Isolationist, Aggressive, Cooperative |
| Crowded | seed crowd; 75 × 75; 10 civs (two of each type); starting population 150; random positions |

Randomise picks a new seed, a 50, 75 or 100 grid, 3 to 8 random civs, a random terrain mix (water 5 to 45%, desert 0 to 35%, plains 15 to 50%, fertile 5 to 30%, mountain 0 to 20%), starting population 50 to 650, random positions, abundance 0.6 to 1.8, and no end condition.

The same settings and seed always play out exactly the same way.

## End of the game

- The game ends when every civ has died out, or when the chosen end condition is met: the year limit is reached, or only one civ is left (needs at least 2 civs).
- There is no end screen yet; the end reason is shown when the game stops.

## Not in the game yet

Individual people, inherited traits and mutation, deaths from war and disasters, contact between civs, materials, levels, boats, god powers and the end screen. See [project/ROADMAP.md](project/ROADMAP.md).
