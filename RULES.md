# Rules

How the game works, as currently implemented. Every number here is the value the code uses. If the game and this file disagree, the game has a bug (see CLAUDE.md).

This describes the current build (Phase 2, in progress): a generated hex map where civilisations of individual people eat, have children, grow old, starve and migrate, year by year. All people share the same base values for now; inherited traits and civ types come later. The full design is in [project/ROADMAP.md](project/ROADMAP.md); this file changes as each part of it ships.

## Time

- One tick is one year. The game starts at year 0.
- At 1× the game runs 8 years per second. Speeds: 1×, 2×, 5×, 20× and Max (as many years as fit in 9 ms of each frame).
- Pause stops time; Step advances exactly one year, paused or not.
- If the device cannot keep up with the chosen speed, years are skipped rather than queued.
- Each year runs the steps in "A year" below, in that order.

## The map

- The map is a square of pointy-top hexes, size × size, default 10 × 10, any size from 10 to 50.
- Rows are laid out with odd rows shifted half a hex to the right. Each hex touches up to 6 neighbours; hexes on the edge have fewer (none off the map). The map does not wrap.
- The distance between two hexes is the number of steps from one to the other through neighbours.
- The map depends only on the nine map settings (seed, size, water, mountains, rivers, plains, forest, desert, tundra): the same settings always give the same map.

### How the map is made

All noise is value noise (random values on a grid, blended with smoothstep), sampled at each hex centre with the map scaled to fill a unit square.

1. **Elevation** = 0.6 × noise + 0.4 × (1 − (x² + y²) ÷ 2), where x and y run from −1 at one edge to 1 at the other. The second term lowers the land towards the edges so the land forms a coastline inside the sea. The noise has 4 octaves and 2 + ⌊size ÷ 12⌋ cells across at the coarsest.
2. **Water.** The water amount counts against all hexes, edge ring included: total deep water = round(*water amount* × size²). Every edge hex is always deep water (ocean); only the water beyond the edge ring (total − edge hexes) is taken from the lowest of the other hexes. A water amount below the edge ring's share gives just the edge ring (on a 10 × 10 map the ring is 36 hexes, so anything up to 36% gives only the ring). Water connected to the edge is sea; any other water is a lake.
3. **Mountains and hills.** Each land hex gets a mountain score = 0.6 × ridge + 0.4 × elevation, where ridge = 1 − |2 × noise − 1| (2 octaves, 2 + ⌊size ÷ 8⌋ cells), which runs in lines and makes ranges. The top *mountains* share of land hexes become mountain; the next 15% of land hexes become hills.
4. **Coast.** Every other land hex next to the sea is coast. Hexes next only to a lake are not coast.
5. **Climate.** The remaining land is split by climate:
   - temperature = 0.7 × latitude + 0.3 × noise − 0.2 × elevation, where latitude is 1 on the middle row and 0 on the top and bottom rows;
   - moisture = noise (3 octaves, 2 + ⌊size ÷ 10⌋ cells).
   - The four lowland settings (plains, forest, desert, tundra) are relative weights. With L remaining lowland hexes and S the sum of the four weights in whole percents, each terrain gets round(weight × L ÷ S) hexes. They are picked in this order: the coldest become tundra; then, of the rest, the driest (dryness = 1 − moisture + 0.3 × temperature) become desert; then the wettest become forest; everything left is plains. If rounding asks for more hexes than are left, the later terrain gets only what is left.
   - All four at 0% gives all plains. The defaults (40%, 30%, 15%, 15%) give 40% plains, 30% forest, 15% desert and 15% tundra.
6. **Rivers.** Up to *river count* rivers. Each starts at a hill or mountain hex that is not next to water or another river (any inland non-coast land hex if there is no such hill or mountain; fewer rivers if there is no room), picked at random from the higher half of those hexes by elevation. It flows hex by hex to the lowest neighbour until it reaches water (sea or lake) or joins another river. Hollows are filled before tracing, so every river runs downhill to water.

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
- Food capacity is in food units; a person eats 1 food a year (see "People").
- Movement cost limits how far people migrate in a year (see "Migration"). The defence bonus and materials have no effect yet: they are used once fights and levels arrive.

### Terrain colours

| Terrain | Colour (RGB) |
|---|---|
| Sea | 29, 78, 122 |
| Lake | 56, 118, 170 |
| Coast | 232, 222, 178 |
| Plains | 134, 172, 88 |
| Forest | 52, 112, 58 |
| Hills | 150, 136, 92 |
| Mountain | 128, 120, 116 |
| Desert | 226, 170, 88 |
| Tundra | 190, 204, 206 |
| River (line through the hex) | 86, 164, 226 |

- **Shading by height.** Each hex keeps its elevation from step 1 of "How the map is made" (same settings, same values). Land hexes are drawn up to 6% darker or lighter by elevation: the lowest land hex on the map is 6% darker, the highest 6% lighter, and the rest in proportion between. Sea and lake hexes are drawn darker with depth: the highest water hex keeps its colour and the lowest is 25% darker, in proportion between. The shading is only drawn; it changes no rule. The map-generation preview uses the same colours.

## Civilisations and people

- The game starts with *civ count* civilisations (civs), named Civ 1, Civ 2 and so on, each with *starting population* people. Each civ has its own colour and shape emblem (see "How civs and people look").
- **Start hexes.** A good start hex is land with food capacity 40 or more (coast, plains, forest, and any river hex). The first civ starts on a random good hex. Each next civ starts on a random good hex at least 3 steps from every earlier start; if there is none, on the good hex farthest from the earlier starts (lowest index on ties). With no good hexes at all, any land hex counts as good. On very small land several civs can start on the same hex.
- All of a civ's founders start together on its start hex, each with a random age from 0 to 39, full health (100) and no hunger, and no parent.
- Every person has an age (years), health (0 to 100), hunger (years in a row without food), a hex, a civ and a parent (the person who bore them; none for founders).
- Several civs can live in the same hex. They do not interact yet: no contact, fights or switching civ.
- Every person uses the same base values below (birth chance, fertile ages, old age). Inherited traits will replace them per person later.

## A year

Each year (tick) runs these steps in order. Within a step everyone decides first and the results apply together, so the order people are listed in never changes the outcome.

1. **Birthdays.** Everyone's age goes up by 1.
2. **Eating.** Each person eats 1 food from their hex.
   - If the hex has at least as many whole food units as people, everyone there eats.
   - Otherwise exactly ⌊food⌋ of the people there eat, picked at random (every person in the hex has the same chance); the rest go hungry.
   - The food eaten is taken from the hex.
   - A person who eats has hunger 0 and gains 25 health (up to 100). A person who does not eat has hunger + 1 and loses 35 health (down to 0).
3. **Deaths.**
   - **Starvation:** a person whose health is 0 dies. From full health that is the third year in a row without food.
   - **Old age:** otherwise, a person aged 45 or more dies with chance (age − 45) ÷ 40 that year: 2.5% at 46, 25% at 55, 50% at 65, and certain at 85, so nobody lives past 85.
4. **Births.** Each person who ate this year, aged 16 to 40 (inclusive), in a hex with fewer people (all civs, counted after this year's deaths) than its food capacity, has a child with chance 5%. No partner is needed. The child starts at age 0 with full health and no hunger, in the parent's hex and civ, with that parent recorded.
5. **Migration** (see below).
6. **Food regrowth.** Each hex regains food equal to 50% of its food capacity, never above its capacity.
7. **Statistics** for the year are recorded (see "Statistics").
8. **End conditions** are checked (see "End of the game").

## Migration

- A person who went hungry this year sets out with chance 50%.
- A person who ate, in a crowded hex, sets out with chance 20%. A hex is crowded when it holds more people (all civs) than 80% of its food capacity.
- **Reach.** A person has 3 movement points a year. Entering a hex costs its movement cost (coast and plains 1, desert and tundra 1.5, forest and hills 2, mountain 3). The hexes in reach are the land hexes that can be reached along a path of land hexes costing 3 or less in total. Seas and lakes cannot be entered or crossed.
- **Spare food** of a hex = the food it will hold after this year's regrowth (food + 50% of capacity, at most the capacity) − the people in it now (after this year's births).
- A person who sets out picks one hex in reach whose spare food is above 0 and above their own hex's spare food, at random, with chances in proportion to each hex's weight. A hex's weight is its spare food, counted twice (×2) if it already holds at least one person of the mover's own civ. With no such hex, they stay.
- Everyone chooses against the same counts (food, people and which civs are in each hex), taken before anyone moves; then everyone who chose moves at once.

## Statistics

Recorded at the end of every year, for each civ: people alive, hexes held (hexes with at least one of its people), births, deaths by old age, deaths by starvation, and the total age at death of those who died.

- Kept for the whole run: total births and deaths by cause, average lifespan (average age at death), oldest age reached, peak population and the first year it was reached, most hexes held, and the year the civ died out (its people fell to 0), if it did.
- The yearly history keeps one row per year for the first 8192 rows. When it is full, pairs of rows are merged (people and hexes from the later year, the other numbers added together) and each new row covers twice as many years, so a long game never runs out of memory.
- **Family lines.** Every person has a generation: founders are generation 1, and a child is its parent's generation + 1. Every person also belongs to the line of the one founder they descend from.
- **Records** kept for the whole run (shown on the end screen):
  - *Oldest person ever:* the highest age anyone reached, alive or dead (on a tie, whoever reached it first; among the living, the lowest id).
  - *Oldest alive at the end:* the oldest living person when the game ends (on a tie, the lowest id).
  - *Longest family line:* the highest generation anyone reached, with the first person born into it and the founder at the head of their line.
  - *Most descendants:* the founder with the most people born into their line (children, grandchildren and so on, alive or dead). It is always a founder, because a parent counts every descendant of their child plus the child. On a tie, the lower founder id. None if nobody was born.
  - *Worst famine:* the famine with the most starvation deaths (on a tie, the one that ended first). A **famine year** for a civ is a year in which its starvation deaths are at least 2% of its people at the start of that year, and at least 5. Famine years of the same civ in a row make one famine, from its first to its last year. A famine still going on when the game ends counts up to the last year.
- **History log:** the key events with their year, kept for the whole run: each famine (civ, first and last year, starvation deaths) and each extinction (civ, year). At most 2048 events are kept; once full, later famines are left out (and counted) but extinctions are always kept.
- While the game runs, the statistics sheet shows each civ's emblem, people and hexes held; the top bar shows the total population, how many civs are still alive, and each civ's emblem with its people alive. Tapping a hex shows its people per civ (see "How civs and people look").

## How civs and people look

Each civ has a colour and a shape emblem, chosen by civ number, so civs can be told apart by shape as well as colour. Emblems are drawn with a dark outline.

| Civ | Colour (RGB) | Emblem |
|---|---|---|
| Civ 1 | red (230, 57, 70) | circle |
| Civ 2 | blue (58, 134, 255) | square |
| Civ 3 | yellow (255, 214, 10) | triangle |
| Civ 4 | magenta (220, 60, 220) | diamond |
| Civ 5 | cyan (0, 220, 230) | plus |
| Civ 6 | orange (255, 140, 20) | star |
| Civ 7 | white (245, 245, 245) | upside-down triangle |
| Civ 8 | violet (150, 100, 255) | ring |

- **Zoomed out**, each land hex with people shows the emblem of its largest civ (on a tie, the lower civ number) in that civ's colour, and below it the total people in the hex (all civs). Counts of 1000 or more are shortened: 1.2k (one decimal, rounded down) under 10000, then 46k, then 2M. While the game runs, the labels show the latest year and refresh at most 2.5 times a second (every 0.4 seconds), so a fast game does not redraw the whole map every frame; panning, zooming or tapping shows the latest counts at once.
- **Zoomed in**, once a hex is at least 200 pixels across on screen (corner to corner), the hex labels give way to the people themselves: each person is a tiny emblem in their civ's colour, at a fixed spot inside their hex (picked from their id, within 60% of the hex size from its centre).
- A person who migrates glides from where they were drawn to their spot in the new hex over 0.6 seconds. This is drawing only: in the game they move at once, as "Migration" says.
- **Tap a hex** to see its terrain, food and its people per civ with each civ's emblem. *List people* opens the list of the people in the hex, lowest id first (the first 100, then how many more); tap a row to open that person.
- **Tap a person** (zoomed in; the nearest person within 22 pixels of the tap) to see their id, civ, age, health, hunger, parent (their id, or none for founders; "died" if the parent is no longer alive) and their living children. Tapping the same person again closes the card. If the person dies while the card is open, it shows "Died" with the last values seen.

## Map settings

Chosen on the map-generation screen, before setup.

| Setting | Default | Range |
|---|---|---|
| Seed | pangaea | any text, up to 64 characters (empty means the default) |
| Size | 10 (10 × 10 hexes) | 10 to 50 |
| Water amount | 25% of all hexes, edge ring included | 0% to 70%, whole percent |
| Mountains | 12% of land hexes | 0% to 40%, whole percent |
| River count | 2 | 0 to 20 |
| Plains | 40 (relative weight of the inland lowland) | 0% to 100%, whole percent |
| Forest | 30 (relative weight) | 0% to 100%, whole percent |
| Desert | 15 (relative weight) | 0% to 100%, whole percent |
| Tundra | 15 (relative weight) | 0% to 100%, whole percent |

Out-of-range values are clamped to the range; values that are not numbers fall back to the default.

Presets:

| Preset | Seed | Size | Water | Mountains | Rivers | Plains | Forest | Desert | Tundra |
|---|---|---|---|---|---|---|---|---|---|
| Small world (the default) | pangaea | 10 | 25% | 12% | 2 | 40% | 30% | 15% | 15% |
| Continent | continent | 30 | 20% | 12% | 6 | 40% | 30% | 15% | 15% |
| Archipelago | islands | 30 | 60% | 8% | 2 | 40% | 30% | 15% | 15% |
| Highlands | peaks | 20 | 15% | 30% | 5 | 40% | 30% | 15% | 15% |
| Large world | vast | 50 | 30% | 12% | 12 | 40% | 30% | 15% | 15% |

- Regenerate picks a new random seed and keeps the other settings.
- Randomise picks a new seed, a size from 10 to 50, water 10% to 60%, mountains 5% to 30%, 0 to ⌊size ÷ 4⌋ rivers, plains 20% to 60%, forest 10% to 50%, desert 0% to 30% and tundra 0% to 30%.

## Game settings

Chosen on the setup screen, after the map.

| Setting | Default | Range |
|---|---|---|
| Civ count | 3 | 1 to 8 |
| Starting population | 20 people per civ | 2 to 200 |
| End conditions | none ticked (Sandbox: no end) | any combination of Last civ standing, Dominance, Year limit; ticking none is Sandbox |
| Dominance share | 60% of land hexes | 25% to 100%, whole percent |
| Dominance years | 300 | 10 to 10000 |
| Year limit | 2500 (choices 1000, 2500, 5000, 10000, or custom) | 10 to 100000 |

Out-of-range values are clamped to the range; values that are not numbers fall back to the default. Unknown end conditions are ignored, and anything that is not a list of end conditions means Sandbox.

- Each map preset also sets the civs and the end conditions:

| Preset | Civs | People each | End conditions |
|---|---|---|---|
| Small world | 3 | 20 | Sandbox |
| Continent | 4 | 30 | Dominance (60%, 300 years), Year limit 5000 |
| Archipelago | 5 | 20 | Last civ standing, Year limit 10000 |
| Highlands | 3 | 20 | Year limit 2500 |
| Large world | 6 | 40 | Last civ standing, Dominance (60%, 300 years) |

  Settings a preset does not list keep their defaults (dominance 60% and 300 years, year limit 2500).
- Randomise on the setup screen picks 2 to 6 civs and 10 to 50 people each, ticks each of Last civ standing, Dominance and Year limit with chance 50% (none ticked is Sandbox), a dominance share of 50% to 80%, dominance years of 100, 200, 300 or 500, and a year limit of 1000, 2500, 5000 or 10000; it does not change the map. Randomise on the map screen does not change the civs or the end conditions.

## End of the game

On the setup screen you tick any combination of these end conditions. Ticking none of them is **Sandbox**: the game never ends on its own.

- **Last civ standing:** the game ends in the year only one civ still has people. That civ wins. Needs at least 2 civs at the start (with 1 civ it never fires).
- **Dominance:** the game ends when one civ has held at least the dominance share (default 60%) of the land hexes for the dominance years (default 300) in a row. Land hexes are all hexes that are not sea or lake; a civ holds a hex when at least one of its people lives there (several civs can hold the same hex). The years count from the first year the civ reaches the share and start again from 0 in any year it is below it. That civ wins. If several civs complete their years in the same year (possible only with a share of 50% or less), the one holding the most hexes that year wins, then the lower civ number.
- **Year limit:** the game ends when the year limit is reached (1000, 2500, 5000, 10000 or a custom year). There is no score and no winner.
- **Total extinction always ends the game,** whatever is ticked, Sandbox included: when no civ has any people left. There is no winner.

The conditions are checked at the end of each year, after the statistics. The first one met ends the game; if several are met in the same year, the first in this order counts: total extinction, last civ standing, dominance, year limit.

- **End now:** while the game is paused, the controls show an *End now* button. It ends the game at once, with no winner (reason "Ended by the player"), and opens the end screen. On a game that has already ended it reopens the end screen.
- When the game ends it pauses, the top bar shows "(ended)" after the year, and the end screen opens.

## End screen

A scrollable screen that opens when the game ends. Everything on it comes from the statistics and records kept during the run (see "Statistics"), so it opens at once.

- **Header:** the winner (the surviving civ for Last civ standing, the dominant civ for Dominance; "No winner" otherwise), the end reason, and the years run.
- **Buttons:**
  - *Keep watching:* back to the map; the game carries on from where it stopped as a sandbox, where no end condition applies any more (not even total extinction). Not shown after a total extinction. *End now* still opens the end screen again.
  - *Same settings again:* starts a new game with exactly the settings of the one that ended (same seed, so the same map and start). The settings are kept in memory only.
  - *New map:* the map-generation screen with the same settings and a new random seed.
  - *Back to setup:* the setup screen with the settings of the game that ended.
- **Cards:**
  - *Civs by final population* (most people first; ties by higher peak population, then lower civ number): people at the end, peak population and the first year it was reached, average lifespan (average age at death; "No deaths" if none died), most hexes held at once, and the year the civ died out (or No).
  - *Population over time:* one line per civ in its colour, from year 0 to the last year, all on the same scale (the top of the chart is the highest population any civ reached in the recorded history). It draws at most 400 points per civ, taken evenly from the recorded rows, plus the last row.
  - *People:* the oldest person ever (id, civ, age, and the year they died or "alive") and the oldest person alive at the end (see "Records" under "Statistics").
  - *Deaths by cause:* deaths by old age and by starvation over the whole run, all civs together, with their share of all deaths.
  - *Records:* longest family line, the person with the most descendants, and the worst famine (see "Statistics").
  - *History:* the history log, oldest first (by first year; on the same year famines before extinctions, then by civ number).

## Not in the game yet

Land degrading, inherited traits and mutation, civ types, contact and war, materials and levels, boats, god powers, first to Kingdom (comes with levels). See [project/ROADMAP.md](project/ROADMAP.md).
