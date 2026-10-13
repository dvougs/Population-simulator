# Rules

How the game works, as currently implemented. Every number here is the value the code uses. If the game and this file disagree, the game has a bug (see CLAUDE.md).

This describes the current build (Phase 2, in progress): a generated hex map where civilisations of individual people eat, have children, grow old, starve, migrate, fight and switch civ, year by year, until an end condition you chose is met. Every person carries 8 inherited traits that set their birth chance, lifespan, food need, how hard hunger hits them, how they fight, how readily they switch civ and how well they gather; each civ has a type that biases how its people move, fight and level up. Every lived-in hex is a settlement, from a camp to a megapolis, with its own store of materials, its own buildings and supply routes to the hexes around it; civs gather materials into those stores, carry them to their capital and spend them to climb from level 1 (Foragers) to level 5 (Kingdom). The full design is in [project/ROADMAP.md](project/ROADMAP.md); this file changes as each part of it ships.

## Saving

- Nothing is saved between sessions: no settings, no games. A fresh page load always starts from the default settings. Within a session, *Same settings again* and *Back to setup* (see "End screen") reuse the settings held in memory.

## Home page

- The game opens on the **home page**: *New game* goes to the map-generation screen, *How to play* opens the rules in plain words, and *Back to game* (shown only once a game has started in this session) returns to it. The map-generation screen and the game settings screen (Step 2 of 2, also opened from the game's ☰ button) each have a *Home* button back to the home page; leaving a game this way keeps it paused, and *Back to game* returns to it.

- **The living world.** Behind the buttons a small world lives: a real game, run by the same rules, with seed genesis, size 12 × 12, 3 rivers, 4 civs (Expansionist, Aggressive, Cooperative, Nomadic) of 20 people each, every other setting at its default, and no end condition. It is shown from year 60 and lives 6 years a second, drawn like the map zoomed out (tint, outlines, rings and each hex's largest civ's emblem, without head counts), with the year, its people and the civs still alive in its corner. After year 1500, or if nobody is left, it starts again from year 60. It runs only while the home page is on screen; with the device's reduced-motion setting on, it shows year 300 standing still. It is separate from your game and changes nothing in it.
- **How to play** explains the map, people, a year, migration, civs, traits, civ types, fighting and switching civ, materials, settlements and levels (with buildings and wonders), the end of the game and the controls. Its numbers are read from the game, so they are the ones in this file. Its pictures are drawn by the game from the same world as the home page, in year 300: the map before anyone arrives, a close-up of its busiest hex (lowest index on ties) with every person, the hexes a person can walk to in a year from a lowland hex near the middle (3 movement points, and 5 for Nomadic), the civs' land, each civ's average traits, a close-up of the hex shared by civs where the smallest civ there has the most people (lowest index on ties), its first contact (from the end screen's History) and its deadliest war (from the War card), the Levels panel for Civ 1 and Civ 2, and the end screen's population chart.
- **Addresses:** the page's address ending in #how opens How to play directly, and #new the map-generation screen. Opening How to play from the home page adds a step to the browser's history, so Back returns to the home page.

## Feature flags

New work can ship switched off and be tried on demand, on the live site too. Flags are kept on the device (they survive reloads and new releases) and are off until turned on.

| Flag | Default | Turned on and off by | What it changes now |
|---|---|---|---|
| 3D graphics (preview) | Off | The *Graphics 2D / 3D* switch on the game settings screen (step 2 of a new game, and ☰ during a game), or an address with `?3d=1` (on) or `?3d=0` (off), which is then kept | The home page's living world and the game's map are drawn in 3D. |

- **The 3D world** is the same world as the 2D one (same years, people and settlements), built as a small diorama: each hex is a tile standing by its terrain (water lowest, then coast, desert, plains, forest, tundra, hills, and mountains highest) and raised further by its elevation; forests carry trees, mountains snow-capped peaks, rivers run across the tiles, and settled land takes a little of its civ's colour. A hex with people but no settlement shows a tent; a Camp shows 2 homes roofed in its holder's colour (round thatched huts while its civ is at level 1, Foragers), a Village 3, a Town 4 and a City or bigger 5, and a Town or bigger also a tower. Each civ type's era buildings (all 20) and the 4 wonders stand on the map as their own small models (the same as inside a hex, below), filling the middle of their hex out to 0.46 of its radius and at most 0.2 of their size inside a hex; one is drawn per hex (a wonder before an era building, a later era before an earlier), with at most 3 homes pushed out round it and no tower. One being built rises from 20% of its height as its work goes on; an abandoned wonder stands in grey. Up to 4 people (1 per 8 living there) walk round each settled hex.
- **The change** on the home page takes 1.8 seconds: the 3D world appears over the flat board looking straight down, then the tiles rise from the middle outwards while the camera tilts down to its 3D view and turns slowly from side to side. Homes and people grow out of their tile at the end of its rise, and a new home grows out of the ground. Switching back plays it in reverse and hands back to the 2D board.
- **The game's map in 3D** shows the same diorama, looked at from the south, tilted 45° from straight down, without perspective, north up the screen. The flag is read when a game starts and when going back to a running game, so opening the game settings with ☰, flipping the switch and pressing *Back to game* changes the map in place. When a game starts, the tiles rise from the middle outwards over 1.8 seconds. Pan, pinch, scroll, the arrow keys, + and −, and *Fit* work as on the 2D map; a tap follows the line of sight, so it picks the tile seen there (its top or its side), and a white hex ring marks the selected hex. Tapping a hex with a building or wonder opens its card as on the 2D map. New head counts and settlements are drawn at most every 0.4 seconds while the game runs, as in 2D. 
- **Day, night and the seasons on the 3D map.** Day and night run on the same real-time clock as inside a hex (below): 30 seconds each whatever the game's speed, paused or not, with dusk and dawn fading over 8 seconds. The sun crosses from east to west and turns warm low down; at night a dimmer, cooler moonlight keeps the map readable and the space round the board darkens. At night a warm glow pools on every hex where people live now, with lit windows in homes and towers; a civ at level 1 (Foragers) has a bonfire there instead of windows. The seasons follow the game's calendar: spring greens plains, forest and hills (fully on days 56–126, 15% of the way), autumn turns them golden-brown (days 196–256, 35%), and snow lies in winter (days 281–351) on tundra (90% white), mountains (80%), hills (55%), forest (45%), plains (40%) and coast (20%), never on desert; pines frost over. Each fades in and out over 30 days (spring over 35) and the look eases over about a third of a second rather than jumping. So that the seasons never flicker, their look is full while a year takes 2 seconds or more and fades as years go faster (gone from 2 years a second). At 100× and Max, while the game runs, the map holds a steady summer noon: over about 1.5 seconds the light swings to full day with the sun and moon at the top of their arcs, and the seasons' look fades to plain summer; the clock and the calendar run on underneath, so pausing or slowing down eases back to the real hour and season. Light alone redraws the map at most 4 times a second (30 while dusk or dawn fades; twice a second on software WebGL) and moves the shadows at most every 0.4 seconds.
- Not in 3D yet: people one by one when zoomed in, territory outlines, supply routes, and building marks by civ type. Without WebGL for 3D, the game shows the 2D map and says so.
- **Inside a hex** (3D map only): the hex card has a *Step inside* button. It pauses the game and shows that hex close up as a small living world over the map, with the hex's name, settlement tier, terrain, holder civ, people and "at war" in a bar on top; the back arrow (or Escape) returns to the map, and the game runs again if it was running before. Nothing in the game changes while inside.
  - The hex stands as a plate of its terrain's colour, with a river across it if it has one and sea round a coast.
  - The settlement changes with the holder civ's level: level 1 (Foragers) round mud huts under thatch round a bonfire, with no lit windows; level 2 (Farmers) mud-brick houses under thatch; level 3 (Builders) stone houses roofed in the civ's colour round a paved square with a well; level 4 (Organised) two-storey houses, and 6 lamps round the square that light up at night; level 5 (Kingdom) tall white townhouses with gold-ridged roofs, a gilded statue in the square and banners in the civ's colour on the lamps. Homes: a Camp shows 4, a Village 8, a Town 14, a City 22, a Metropolis 32 and a Megapolis 44; a Town has 1 tower, a City 2, a Metropolis 4 and a Megapolis 8. A palisade of stakes rings them once Palisade is built, a stone wall with Stone walls. People with no settlement camp in tents, 1 per 5 people, up to 6. A Village or bigger on plains, coast, hills, desert or a river has fields round it (4 plus 2 per tier).
  - Every building and wonder in the hex stands as its own model: all 20 era buildings (from the Trailhead Lodge's timber hall to the Khan's Court's great tent), the 4 wonders (the Sun Circle's standing stones, the Hanging Gardens' green terraces, the Great Wall's towers and the Grand Library's columns and gold dome), and every settlement building except those that are the settlement itself (Huts and Houses are the homes, Fields the fields, Palisade and Stone walls the wall): granary, irrigation canals, woodcutter, quarry, clay pit, mine, deep mine, warehouse, market, shrine, school, library and palace, and a Fishing dock as a pier into the water on the south shore. They stand at 70% of their model's size, biggest first, as near the middle as there is room (round the square from level 3), facing it; when they do not all fit, all of them shrink by 12% at a time until they do. One being built rises from 20% of its height as its work goes on, under scaffolding; an abandoned wonder stands in grey. Roofs and trim take the owner civ's colour.
  - A *Buildings* list in the corner names every building and wonder in the hex, with its kind (wonder and era, the civ's own era building, or housing, food, industry, trade, civic or defence) and whether it is being built (with its share of the work done), planned or abandoned; it starts open when there are 4 or fewer. Tapping one turns the view to it and closes in; tapping it again goes back to the whole hex.
  - Nature fills the rest by terrain: 70 pines in a forest, 14 trees on plains, 8 palms on a coast, 16 rocks on hills, 7 snowy peaks on a mountain, 14 cacti in a desert, 12 frosted pines on tundra; a Village or Town keeps 70% of them, a City or bigger 40%.
  - Up to 48 people walk about, coloured by civ in proportion to who lives there, children under 15 smaller. With people of two or more civs in the hex it is at war: each side keeps to its half and presses towards the other, sparks fly where they meet and smoke rises.
  - Day and night: a day lasts 30 seconds and a night 30 seconds, whatever the game's speed (the clock runs in real time; a game's map starts in the morning). Dusk and dawn each fade over 8 seconds: the sun crosses the sky and turns warm low down, the sky darkens to night blue and a moon gives a cool light. At night windows, towers and a warm lamplight glow only where people live now; Foragers' huts have no lit windows, and their bonfire burns all the time, brightest and flickering at night. The clock is the 3D map's, so stepping inside keeps the time of day. The season is the game's: the ground, leaves, fields and pines take the map's season look (above) at full strength. The bar shows the season and dawn, day, dusk or night (for example "winter night").
  - Drag turns the view, pinch or scroll zooms. Entering, the view comes down from high above over 1.6 seconds and then drifts slowly round.
- With the device's reduced-motion setting on, or on a browser without a graphics card (software WebGL), the change is instant and the world stands still (inside a hex, people and trees stand still and the view does not drift; on software WebGL it draws at most 4 frames a second). Without WebGL the switch is greyed out and the home page and the map stay 2D. The 3D graphics code is only downloaded the first time the flag is turned on.

## Time

- One tick is one day. A year is 360 days: 12 months of 30 days, and 4 seasons of 90 days (spring days 1–90, summer 91–180, autumn 181–270, winter 271–360). The whole map has the same season. The game starts at year 0; year 1 begins on the first day run. The top bar shows the season, the day of the season (1–90) and the year ("Autumn day 12, year 312").
- At 1× the game runs 2 days per second, so each day can be seen going by: a season takes 45 seconds and a year 3 minutes. Speeds: 1×, 5× (10 days a second), 20× (40), 100× (200, a year in 1.8 seconds) and Max (as many days as fit in 9 ms of each frame).
- Pause stops time; Step advances exactly one month (30 days), paused or not.
- If the device cannot keep up with the chosen speed, days are skipped rather than queued.
- Each year runs the steps in "A year" below, on their days. Every number written "a year" in these rules is for a whole year.

## The map

- The map is a square of pointy-top hexes, size × size, default 10 × 10, any size from 10 to 50.
- Rows are laid out with odd rows shifted half a hex to the right. Each hex touches up to 6 neighbours; hexes on the edge have fewer (none off the map). The map does not wrap.
- The distance between two hexes is the number of steps from one to the other through neighbours.
- The map depends only on the ten map settings (seed, size, land shape, water, mountains, rivers, plains, forest, desert, tundra): the same settings always give the same map.

### How the map is made

All noise is value noise (random values on a grid, blended with smoothstep), sampled at each hex centre with the map scaled to fill a unit square.

1. **Elevation.** The noise has 4 octaves and 2 + ⌊size ÷ 12⌋ cells across at the coarsest.
   - *One continent* (the default land shape): elevation = 0.6 × noise + 0.4 × (1 − (x² + y²) ÷ 2), where x and y run from −1 at one edge to 1 at the other. The second term lowers the land towards the edges so the land forms a coastline inside the sea.
   - *Islands*: elevation = 0.4 × noise + 0.6 × rise, where rise is the highest of 1 − d² ÷ r² over the island centres, and 0 where all are below 0. The centres are a grid of g × g, g = 2 + ⌊size ÷ 15⌋ (4 × 4 on a 30 × 30 map), each placed in the middle of its cell of the map and then moved by up to 0.3 of a cell across and down (uniform, from the map's own seeded stream); d is the distance to a centre and r = 0.55 of a cell, both measured with the map scaled to a unit square. With 60% water on a 30 × 30 map this gives about 11 islands of 5 hexes or more, and boats (3 water hexes) join about 95% of the land.
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

| Terrain | Food capacity | Movement cost | Defence bonus |
|---|---|---|---|
| Deep water (sea or lake) | 0 | impassable | 0% |
| Coast | 50 | 1 | 0% |
| Plains | 60 | 1 | 0% |
| Forest | 40 | 2 | +25% |
| Hills | 30 | 2 | +50% |
| Mountain | 10 | 3 | +100% |
| Desert | 10 | 1.5 | 0% |
| Tundra | 15 | 1.5 | 0% |

- **Rivers** run through land hexes. A river hex keeps its terrain's movement cost and defence bonus (rivers are walkable) and gets +30 food capacity (rivers are fertile).
- Seas and lakes are impassable, except by raft (level 2, one water hex) and boat (level 4, up to 3 water hexes in a row); see "Migration".
- Levels raise food capacity: plains and river hexes from level 2, every hex at level 5 (see "Gathering and levels"). The table gives the capacity at level 1.
- Every hex starts with food equal to its food capacity.
- Food capacity is in food units; a person eats 0.75 to 1.25 food a year by their metabolism, 1 at metabolism 0.5 (see "Traits").
- Movement cost limits how far people migrate in a year (see "Migration"). The defence bonus helps the civ holding the hex in a battle (see "War").

### Material deposits

There are 9 materials: wood, stone and clay (common); copper, iron and salt (uncommon); gold, gemstones and spices (exotic). When the map is made, every land hex rolls once for each material: it holds a deposit of that material with the chance below for its terrain. A river hex rolls its terrain's chance and, separately, the river chance; it holds the deposit if either roll succeeds. A hex can hold any number of different materials. Deep water never holds deposits.

Chance a hex holds a deposit (%); a terrain not listed is 0:

| Material | Tier | Coast | Plains | Forest | Hills | Mountain | Desert | Tundra | River |
|---|---|---|---|---|---|---|---|---|---|
| Wood | common | 10 | 20 | 95 | 40 | 0 | 0 | 15 | 40 |
| Stone | common | 15 | 0 | 0 | 70 | 90 | 25 | 30 | 0 |
| Clay | common | 40 | 30 | 10 | 0 | 0 | 0 | 0 | 70 |
| Copper | uncommon | 0 | 0 | 0 | 20 | 25 | 8 | 0 | 0 |
| Iron | uncommon | 0 | 0 | 0 | 15 | 20 | 0 | 10 | 0 |
| Salt | uncommon | 25 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| Gold | exotic | 0 | 0 | 0 | 2 | 4 | 0 | 0 | 5 |
| Gemstones | exotic | 0 | 0 | 0 | 0 | 3 | 2 | 0 | 0 |
| Spices | exotic | 2 | 0 | 0 | 0 | 0 | 3 | 0 | 0 |

- **Every exotic material appears.** If after the rolls the map has no deposit of gold, of gemstones or of spices, that material is rolled again over every land hex (same chances, river hexes rolling both), round after round, until at least one hex holds it. After 1000 rounds without one (practically never), it is placed on the land hex with the best chance for it (lowest index on ties).
- If no land hex can hold an exotic material at all (for example gemstones on a map with no mountain and no desert, possible with mountains at 0% and desert at 0%), the map has none of it.
- Deposits are part of the map: the same map settings always give the same deposits. Deposits never run out. Civs gather from them to level up (see "Gathering and levels").
- Tapping a hex lists its deposits (or None) and who gathered there this year (see "Gathering and levels").

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

- The game starts with *civ count* civilisations (civs), named Civ 1, Civ 2 and so on, each with *starting population* people and a type (see "Civ types"). Each civ has its own colour and shape emblem (see "How civs and people look").
- **Start hexes.** A civ whose starting position was chosen on the setup screen (see "Game settings") starts there, if that hex is land and no earlier civ was given the same hex; every other civ is placed automatically. A good start hex is land with food capacity 40 or more (coast, plains, forest, and any river hex). Automatic civs are placed in civ order, after the chosen ones: each starts on a random good hex at least 3 steps from every start so far (chosen ones included); if there is none, on the good hex farthest from them (lowest index on ties). With no good hexes at all, any land hex counts as good. On very small land several civs can start on the same hex.
- All of a civ's founders start together on its start hex, each with a random age from 0 to 39, full health (100) and no hunger, no parent, and traits drawn as "Traits" says.
- Every person has an age (years), health (0 to 100), hunger (years in a row without food), a hex, a civ, a parent (the person who bore them; none for founders) and 8 traits.
- Several civs can live in the same hex. When they do, people may switch civ (see "Contact"); civs at war fight battles (see "War").
- The fertile ages (16 to 40) are the same for everyone; birth chance, old age, food need and hunger's health loss depend on the person's traits.

## Traits

Every person has 8 traits, each a number from 0 to 1: fertility (f), life expectancy (l), strength, aggression, cooperation, metabolism (m), heat tolerance (h) and cold tolerance (c). A trait of 0.5 gives the values everyone had before traits (5% birth chance, old age from 45, 1 food a year, 35 health lost a hungry year).

| Trait | What it does |
|---|---|
| Fertility f | Birth chance = (2.5% + 5% × f) × (0.75 + 0.5 × m): 2.5% to 7.5% at metabolism 0.5. Also raises the hunger burden. |
| Life expectancy l | Old age starts at 35 + 20 × l (35 to 55 years). |
| Metabolism m | Food eaten a year = 0.75 + 0.5 × m (0.75 to 1.25). Also multiplies the birth chance (above) and raises the hunger burden. |
| Heat tolerance h | Lowers hunger's health loss in desert; raises it in tundra and mountain. |
| Cold tolerance c | Lowers hunger's health loss in tundra and mountain; raises it in desert. |
| Strength | A warrior's power in a duel is their strength × their side's attack and morale (see "War"). |
| Aggression | A civ's average aggression decides whether it declares war, the chance it does, and the odds it attacks at (see "War"). |
| Cooperation | The yearly chance of switching civ is 2% × cooperation (see "Contact"). A gatherer's yield is × (0.5 + cooperation): 0.5 to 1.5, 1 at cooperation 0.5 (see "Gathering and levels"). |

- **Hunger's health loss** in a year without food = round(35 × B × climate), where:
  - the hunger burden B = 1 + 2.8 × (f − 0.5) + 1.2 × (m − 0.5), kept between 0.5 and 3, so fertile, fast-burning people starve faster;
  - the tolerance T(x) = 2 − 2 × x for x up to 0.5, and 1.5 − x above (2 at 0, 1 at 0.5, 0.5 at 1);
  - climate = T(h) × (0.5 + c) in desert, T(c) × (0.5 + h) in tundra and mountain, and 1 on any other terrain.
  For example, with every trait at 0.5 the loss is 35 everywhere; with f = 0.7 and the rest 0.5 it is round(35 × 1.56) = 55.
- **Founders** start at their civ type's values, each plus a random amount from −0.1 to +0.1 (uniform), kept between 0 and 1. Starting values: Aggressive aggression 0.7 and strength 0.65; Cooperative cooperation 0.7; Expansionist heat tolerance 0.55 and cold tolerance 0.55; Isolationist life expectancy 0.6; Nomadic metabolism 0.45, heat tolerance 0.6 and cold tolerance 0.6; every other trait 0.5.
- **Inheritance and mutation.** A child gets each of its parent's traits plus a random amount from −*mutation* to +*mutation* (uniform, drawn separately for each trait), kept between 0 and 1. *Mutation* is a game setting (default 3%, that is ±0.03; see "Game settings"); at 0% children copy their parent exactly.

## Civ types

Each civ has one of 5 types, picked per civ on the setup screen. A type biases the odds on top of each person's own traits: it sets the founders' starting traits (see "Traits") and changes how its people migrate and go to war. A person always acts by the type of the civ they belong to now (after switching civ, by their new civ's type).

| Type | What it does differently | Starting traits (others 0.5) |
|---|---|---|
| Expansionist | Moves on early: a fed person sets out (20% a year) once their hex holds more people than 30% of its food capacity, instead of 50%. | heat tolerance 0.55, cold tolerance 0.55 |
| Aggressive | Declares war on any civ it borders (see "War"). | aggression 0.7, strength 0.65 |
| Cooperative | Never declares war, and at war only attacks hexes it holds (see "War"). Its people switch away to another civ half as often (× 0.5). | cooperation 0.7 |
| Isolationist | Keeps to itself: a fed person in a crowded hex sets out (20% a year) only towards land with no other civ's people in it or next to it. | life expectancy 0.6 |
| Nomadic | Wanders far: 5 movement points a year instead of 3, and sets out at twice the usual chance (100% when hungry, 40% when fed in a crowded hex). | metabolism 0.45, heat tolerance 0.6, cold tolerance 0.6 |

- The setup screen shows, next to each civ's type picker, the type's explanation: the sentence for that type below, then "Starts with" its starting traits and "other traits 0.5".
  - Expansionist: "Moves on early: its people set out once their hex holds 30% of its food capacity, long before it is crowded at 50%."
  - Aggressive: "Declares war on any civ it borders."
  - Cooperative: "Never declares war and only fights for its own land, and its people leave it for another civ half as often as others do."
  - Isolationist: "Keeps to itself: when its hex is crowded, its people only move to land with no other civ in or next to it."
  - Nomadic: "Wanders far: 5 movement points a year instead of 3, and sets out twice as often."
- **Levels by type** (see "Gathering and levels"): Cooperative civs gather 25% more (× 1.25); Nomadic civs need 10% more years at each level (× 1.1); Isolationist civs need 20% fewer years (× 0.8) but 25% more materials (× 1.25). Expansionist and Aggressive civs use the usual numbers.

## A year

Each year runs these steps, in this order, on these days. Steps 1–5 run on the first day of the year, step 6 once a month, step 7 at the start of each season and steps 8–10 on the last day. War runs alongside, by the day: battles every day, declarations and attacks on the first day of each month, after step 1–5 on the first day of the year and before the month's migration and regrowth (see "War"). Within a step everyone decides first and the results apply together, so the order people are listed in never changes the outcome.

1. **Settlements, gathering and levels**, from the state at the end of last year: settlements (holders, sizes, capitals), what they plan to build, gathering, settlement buildings, era buildings and wonders, levelling up or falling back, Kingdoms enclosing hexes and absorbing the people in them, food capacities, supply routes, and trade between civs at peace (see "Gathering and levels", "Settlements" and "Peace and trade").
2. **Birthdays.** Everyone's age goes up by 1.
3. **Eating.** Each person needs 0.75 + 0.5 × their metabolism food a year (1 at metabolism 0.5). In a hex with n people whose needs add up to N:
   - If the hex's food is at least N, everyone there eats.
   - Otherwise exactly ⌊food × n ÷ N⌋ of the people there eat, picked at random (every person in the hex has the same chance); the rest go hungry. (With every metabolism at 0.5 that is ⌊food⌋ people.)
   - The hex's food falls by the needs of those who ate, never below 0.
   - A person who eats has hunger 0 and gains 25 health (up to 100). A person who does not eat has hunger + 1 and loses round(35 × B × climate) health (down to 0; see "Traits"); in desert, tundra and mountain a person of a civ at level 3 or higher loses round(35 × B × climate × 0.5) instead (shelter). A civ with a hunger bonus from its buildings (see "Buildings and wonders") multiplies the loss by 1 − that bonus before rounding: round(35 × B × climate × shelter × (1 − bonus)).
4. **Deaths.**
   - **Starvation:** a person whose health is 0 dies. From full health, with a loss of 35 a year, that is the third year in a row without food (sooner with a bigger loss).
   - **Old age:** otherwise, a person whose age has reached their old-age start (35 + 20 × life expectancy, plus 5 years for a civ at level 5) dies with chance min(1, (age − start) ÷ 40) that year. With life expectancy 0.5 the start is 45: 2.5% at 46, 25% at 55, 50% at 65, and certain at 85. Nobody lives past start + 40, at most 95 (100 in a Kingdom).
5. **Births.** Each person who ate this year, aged 16 to 40 (inclusive), in a hex with fewer people (all civs, counted after this year's deaths) than its **room**, has a child with their birth chance, (2.5% + 5% × f) × (0.75 + 0.5 × m) + 0.5% × (their civ's level − 1) (5% with fertility and metabolism 0.5 at level 1). No partner is needed. The child starts at age 0 with full health and no hunger, in the parent's hex and civ, with that parent recorded and the parent's traits with mutation (see "Traits").
   - **Room** of a hex = its **support**, but never more than its settlement's housing (see "Settlements"; a hex nobody lives in has no housing limit). Support = its food capacity + 2 × the food carried into it (smoothed, see "Supply routes"): regrowth gives half the capacity a year, so food carried in counts double.
6. **Migration**, on the 16th day of every month: a twelfth of the people each time (see below).
7. **Food regrowth**, on the first day of each season. Over a year each hex regains food equal to 50% of its food capacity: 30% of that in spring, 35% in summer, 25% in autumn and 10% in winter, never above its capacity. On tundra and mountains nothing grows in winter, so they regain 45% of their capacity a year. Nothing grows back in a besieged hex (see "War").
8. **Contact:** switching civ in hexes shared by several civs (see "Contact").
9. **Statistics** for the year are recorded (see "Statistics"); then wars may end in truces and truces turn to peace (see "Peace and trade").
10. **End conditions** are checked (see "End of the game").

## Migration

- **Monthly.** Migration runs on the 16th day of each month, for the people whose number (id) divided by 12 leaves the month's number (0 in the first month … 11 in the last): each person may set out once a year, in their own month, so new land fills over the year rather than all at once. The counts below are retaken each month.
- **Winter.** In the three winter months nobody sets out from a tundra or mountain hex and no tundra or mountain hex is in reach.
- A person who went hungry this year sets out with chance 50%.
- A person who ate, in a crowded hex, sets out with chance 20%. A hex is crowded when it holds more people (all civs) than 50% of its support (its food capacity + 2 × the food carried in; see "A year", Births), or more than its settlement's housing. Food regrows by 50% of the capacity a year, so 50% is about as many people as a hex feeds year after year: above it the stored food runs down until people go hungry.
- **By civ type** (see "Civ types"): for Expansionist people a hex is already crowded above 30% of its support (or its housing); Isolationist people who ate, in a crowded hex, set out as usual (20%) but only to a hex where no other civ has people, in it or in any hex next to it (who is where counted when the migration step starts; hungry Isolationists go anywhere, as usual); Nomadic people set out at twice the chance (100% hungry, 40% fed in a crowded hex) and have 5 movement points. Aggressive and Cooperative people use the usual numbers.
- **Reach.** People move one hex a year: the hexes in reach are the land hexes next to theirs, whatever the terrain. Nomadic people walk instead, with 5 movement points a year: entering a hex costs its movement cost (coast and plains 1, desert and tundra 1.5, forest and hills 2, mountain 3), and the hexes in reach are the land hexes that can be reached along a path of land hexes costing no more than 5 in total (6 with a Horse Paddock standing; see "Buildings and wonders"). Seas and lakes cannot be entered or crossed, except by raft or boat.
- **Rafts and boats.** A civ's boat range is the number of sea or lake hexes its people can cross in a row: 0 at level 1, 1 at levels 2 and 3 (rafts), 3 at levels 4 and 5 (boats). With a range of R, the hexes in reach also include every land hex next to a water hex that can be reached from the person's hex through at most R water hexes in a row (water neighbours of their hex count as the first). For Nomadic people a path may make one voyage of up to R sea or lake hexes in a row, each costing 1 movement point; only one voyage in the whole path, and the path must end on land (a person never stops on water). Any water hex counts, a lake or the sea, the ocean ring at the map's edge included; since the map does not wrap, crossing ring hexes only leads to land that also touches them. So rafts cross a lake or strait one hex wide, and boats a channel of up to 3.
- **Spare food** of a hex = the food it will hold after this year's regrowth (food + 50% of capacity, at most the capacity) − the people in it now (after this year's births).
- A person who sets out picks one hex in reach whose spare food is above 0 and above their own hex's spare food, at random, with chances in proportion to each hex's weight. With no such hex, they stay.
- **Where civs expand.** A hex's weight is its spare food, multiplied by each of these that applies:
  1. *Own people:* × 2 if it already holds at least one person of the mover's own civ.
  2. *Materials:* × 3 if it holds a deposit of a material the civ's next spend still needs (all its settlements' stores together hold less than that spend costs; see "Gathering"; a Kingdom needs only a wonder it is committed to).
  3. *Threats:* a civ is a threat to the mover's civ if it is Aggressive, if the mover's civ lost a battle to it in the last 20 years, or if it is a Kingdom and the mover's civ is not. The mover's civ beats a threat if it can declare war (it is not Cooperative) and it is Aggressive, or it is a Kingdom and the threat is not, or it has more people than the threat (at the start of the year), unless the threat is a Kingdom and it is not. A hex with people of a threat in it or next to it counts × 0.25 if any of those threats is one the civ does not beat, otherwise × 2 (it pushes towards threats it beats).
  4. *Keeping land together:* × (1 + 0.2 × the land neighbours of the hex that hold people of the mover's civ), so from × 1 to × 2.2.
  Who is where (and so the threats and neighbours) is counted when the migration step starts.
- **Borders at peace.** A hex held by a civ (see "Settlements") is never in reach for people of a civ in a truce or at peace with it (see "Peace and trade").
- **Kingdoms are closed.** A hex enclosed by a Kingdom (see "What levels do") is never in reach for people of any other civ, Kingdoms included: other civs can only take a Kingdom's land from its edge inwards, by fighting.
- Everyone chooses against the same counts (food, people and which civs are in each hex), taken before anyone moves; then everyone who chose moves at once.

## Contact

Checked once a year, on its last day, in every land hex where people of 2 or more civs live and no battle was fought this year (see "War"). Everything is decided against the same counts, taken when the step starts (people and who is where); then the switches apply together.

### Switching civ

- In a shared hex with no battle this year, each person switches civ with a yearly chance of 2% × their cooperation (1% at cooperation 0.5). People of a Cooperative civ switch away with half that chance. A loyalty bonus (Market, Sun Circle) multiplies the chance by 1 − the bonus.
- **Attract bonus** (Market, Senate): when any civ has one, each other civ in the hex weighs its people there × (1 + its attract bonus). A person's chance is multiplied by the others' total weight ÷ their people, and the civ they join is picked in proportion to the weights. With no attract bonus anywhere, both are as above.
- A person who switches joins one of the other civs in the hex, picked at random in proportion to their people there. They keep their age, health, traits, family line and hex.

## War

Civs fight by going to war: a civ **declares war** on a civ it borders, then each month it may **attack** one enemy hex. A **battle** is fought by real people over several days, one duel at a time; a walled settlement is **besieged** first. War runs by the day (see "A year"): on the first day of each month come declarations and new attacks, and every day each battle under way fights its day. On the first day of the month the battles under way fight first, then the month's declarations and attacks are decided. Who is where comes from the counts taken at the end of last year (see "A year", step 9), updated as battles move people (see "After a battle"); people who migrated since are not counted where they went until the year ends.

### Declaring war

- **Bordering.** Civ A borders civ B when a hex with A's people in it has B's people in it or in a hex next to it (counted as above).
- On the first day of each month (winter included), every civ A that is not Cooperative may declare war on each civ B it borders, if the two are not at war or in a truce (see "Peace and trade"):
  - *Aggressive:* an Aggressive civ declares war on every civ it borders, at once. At peace, only when its people aged 15 to 45 at the end of last year × its levy share (below) are at least 1.5 × the other's.
  - *Otherwise* it needs a reason, and then declares with a chance of its average aggression ÷ 12 that month (one roll per pair, however many reasons hold). The reasons:
    - *Hunger:* someone went hungry last year in a hex where A has people and B has people in it or next to it, and A's average aggression is above 0.5.
    - *Crowding:* such a hex (A's people, B's in it or next to it) was crowded at the end of last year (more people, all civs, than 50% of its food capacity), and A's average aggression is above 0.4.
    - *Numbers:* A has at least 3 × B's people, and A's average aggression is above 0.45.
    - *Materials:* B has people in a hex with a deposit of a material A's next spend still needs (see "Where civs expand"), and that hex has A's people in it or next to it; and A's average aggression is above 0.45.
    - *Revenge:* A lost a battle to B in the last 20 years (this year minus that year is 20 or less). Not at peace.
  - At peace, the aggression each reason needs is higher by 0.15 plus 0.05 for every whole 20 years the two have traded (at most 0.15 more, so +0.3 in all).
  - A civ's average aggression is the average over its people at the end of last year.
- Decisions are made for every pair first, then applied in civ order; if two civs declared on each other the same month, the lower civ number's declaration counts. A declaration puts the pair at war (breaking a peace if they had one; see "Peace and trade") and is logged in the History.
- Civs that are not at war never fight, even in a shared hex: they only switch civ (see "Contact").

### Warriors

- A civ's **warriors** are its people aged 16 to 45 with health 50 or more who are not already in a battle.
- **Levy.** For a battle, each side calls up 25% (rounded, at least 1 when it has any) of its **warriors near the hex**, picked at random: the people who were in the battle hex or the 6 hexes next to it at the end of last year aged 15 to 45 (they turn 16 to 46 at the next birthday), and who are now still alive, of the same civ, in the battle hex or next to it, aged 16 to 45, with health 50 or more and not in a battle. The share is counted from all of them (its people aged 15 to 45 in those 7 hexes at the end of last year). The levy is the same for every type for now. Nobody farther away comes, and nobody else (children, the old, the sick, the rest of the adults) ever fights or dies in a battle.
- **Attack** of a civ = its weapons × (1 + its strength bonus from buildings and wonders; see "Buildings and wonders"). Weapons by level: × 1 at levels 1 and 2 (stone), × 1.25 at level 3 (bronze), × 1.5 at levels 4 and 5 (iron).
- **Defence.** The side holding the hex (see "Settlements") fights with its attack × (1 + the terrain's defence bonus (forest +25%, hills +50%, mountain +100%, otherwise 0) + its defence bonus from buildings and wonders + the settlement's walls (Palisade +25%, Stone walls +75%, Palace +50%), the walls only when it holds the settlement). A side that does not hold the hex gets no defence.
- **Morale** starts at 100%, +25% for a Kingdom fighting a civ that is not one, −25% when at least a quarter of the warriors it called up went hungry this year. It falls by the share of its warriors killed or wounded so far.

### Attacking

- On the first day of each month outside winter (months 1 to 9), every civ at war that is not already attacking somewhere picks at most one hex to attack: a land hex with no battle in it, where an enemy (a civ it is at war with) has people, and where it has warriors in the hex or next to it. A Cooperative civ only attacks hexes it holds (to drive enemies out of its own land).
- **Defender:** the enemy holding the hex if it has people there; otherwise the enemy with the most people there (lower civ number on ties).
- **Odds** = (its people aged 15 to 45 in and next to the hex at the end of last year × its levy share × its attack) ÷ (the same for the defender × its defence when it holds the hex), at most 10 (10 when the defender has none). Attack is taken on the first day of the month.
- It attacks only at odds of at least 1 − its average aggression (0.5 at aggression 0.5, 0.3 at 0.7), never less than 0.25. A walled hex (below) is attacked only when the siege would be over before winter. It picks the hex with the best odds, × 1.5 where the hex has a deposit its next spend still needs (lowest index on ties).
- Civs are visited in civ order; both sides call up their levy at once (the attacker first), and the battle begins the next day.

### Battles

Each day of a battle:

- **Duels.** ⌈10%⌉ of the smaller side's fit warriors (at least 1) fight a duel each. In each duel the larger side sends ⌊its fit warriors ÷ the other's⌋ fighters against one, at most 3 (so 1 on 1, 2 on 1 or 3 on 1), picked at random, as is the one.
- **Who wins a duel:** each fighter's power is their strength trait × their side's attack (with defence) × their side's morale now; a group adds its members' power. A side wins with a chance of its power ÷ both powers.
- **The loser** (the one, or one of the group at random) is killed with a 50% chance (a war death), otherwise wounded: their health drops to 20 and they are out of the battle. A civ with a war-loss bonus (War Totem, Barracks; see "Buildings and wonders") has its losers killed with a chance of 50% × (1 − the bonus) instead. Winners stay in.
- **Breaking.** After the day's duels, a side breaks when 40% of the warriors it called up are killed or wounded, or none is left fit. If both break the same day, the one with the larger share out loses (the attacker on a tie). A battle still going after 30 days ends with the attacker pulling back (the defender wins).
- Warriors who died of other causes during a battle drop out of it without counting as out.

### After a battle

- The loser's people in the battle hex (not only its warriors) flee together to a neighbouring land hex where the winner had no people at the start of the month, the one with the most food left over for its people (food − people, counted then; on a tie the lower index); if the winner has people in every land neighbour, to the best of those. A hex enclosed by a Kingdom other than the loser is never chosen. With no land neighbour they stay. The loser's warriors from the hexes next door just go home (they never left).
- An attacker that wins moves its warriors still fit into the hex.
- The winner, if it now has people in the hex, takes the hex at once if it did not hold it: a hex taken loses its planned building and 50% of its store is looted to the winner's capital (as far as it has room; see "Settlements"). If it was the loser's capital, the loser's biggest hex left (by people at the end of last year, lowest index on ties) becomes its capital.
- The battle counts as a fight for the statistics, the War card and truces (see "Peace and trade"): its war deaths are killed by the other side.

### Sieges

- A hex whose settlement has walls (a defence building: Palisade, Stone walls or Palace) and is held by the defender is **besieged** before any duel: for its walls' defence bonus × 120 days (Palisade 30 days, Palace 60, Stone walls 90; together they add up).
- During a siege nothing grows back in the hex (its fields are the enemy's): the hex's food stays as it was at each season's regrowth.
- **Breaking the siege.** On the first day of each month (outside winter), before any attack is chosen, a besieged civ that is not attacking elsewhere comes out to fight when its fresh levy (25% of its people aged 15 to 45 in and next to the hex at the end of last year, rounded, at least 1), with the warriors already inside, × its attack, is at least the besiegers' fit warriors × theirs. Sieges are visited in the order they began. The battle starts at once, without the walls' bonus (terrain and buildings still count), and the fresh levy joins the defenders.
- **Winter lifts a siege:** a siege still going on the first day of winter ends; the attackers go home and nobody wins.
- When a besieged hex falls to the attacker (not after the defenders came out to break the siege), ⌊5%⌋ of the loser's people in the hex who were not in the battle die (the sack, war deaths), picked at random, before the rest flee.

## Peace and trade

Civs at **war** (see "War") fight battles; a war can end in a **truce**, a truce turns into **peace**, and a declaration of war brings war back. Civs in a truce or at peace **trade**. Civs that have never been at war have no relation: nothing below applies to them.

### Terms

- **Truce by quiet.** At the end of a year, two civs at war that have not fought a battle in the last 2 years (this year minus the year of their last battle, or of the declaration if later, is 2 or more) make a truce. Nobody pays.
- **Truce by exhaustion.** Otherwise, a civ asks for a truce when its people killed by the other side over the last 20 years (this year and the 19 before) are at least 10% of its people now. If both are exhausted, the one whose losses are the larger share of its people asks (on a tie, the lower civ number). The other side accepts, unless it is Aggressive and won at least 2 in 3 of the pair's battles over those 20 years.
- **Tribute.** The civ that asked pays the other 20% of every material in its capital's store, into the other's capital store as far as it has room (the rest stays with the payer).
- **A truce** lasts 50 years (30 when either civ is Aggressive). In that time neither declares war on the other or attacks it (see "War"), neither moves into the other's hexes (see "Migration"), neither takes the other's hexes by numbers (see "Settlements"; in a truce or at peace a hex changes hands between them only when its holder leaves it), neither counts the other as a threat when it expands (see "Migration"), and both forget their revenge on each other (lost battles no longer count for revenge).
- **Peace** follows the truce and lasts until one declares war on the other (see "War" for how much more a declaration needs at peace). The 2-year count starts again from the declaration.
- Civs that died out keep their last relation; nothing changes for them.

### Trade

Once a year, after the supply routes, every pair in a truce or at peace whose capitals are joined by a **trade road** trades. Pairs are visited in civ order (civ 1 with 2, 1 with 3, …, then 2 with 3, …).

- **The road** runs between the two capitals over land either civ holds, and across water within the larger boat range of the two (see "Migration"); it may not cross a hex anyone else holds or land nobody holds. Its length is the fewest steps. Trade is **open** for the pair while such a road exists (checked each year); open trade also opens each one's land to the other's supply routes (see "Empire" below).
- **What is traded.** Each capital wants what it is saving for now: a wonder it is committed to, its next level and its era building (the same list as its supply routes ask for). Its **need** is that minus its store; its **spare** is its store minus that. Each side buys, in turn (the lower civ number first), what it needs that the other has spare, exotic materials first (gold, gemstones, spices, then the uncommon and common ones in reverse order).
- **Prices.** A unit is worth 1 (common), 4 (uncommon) or 15 (exotic). The buyer pays 1.25 × the value of what it buys, in its own spare materials (never the material it is buying): first those the seller needs (most valuable spare first), then any spare it has, most valuable first, until paid or it has nothing spare. A buyer cannot buy more than it can pay for.
- **Volume.** A pair may trade 60 value a year, half each way; × 1.5 with a Market in either capital, × 1.25 when either civ is Cooperative, × 1.5 once the road has been open for 50 years (an **old route**). The years of open trade start again from 0 after a war.
- **Distance.** Goods lose 2% of what was sent for every step of the road, both ways (at 50 steps nothing arrives, so nothing is sent). Amounts below 0.01 are not traded.
- Trade never makes a capital store go below 0; a store pushed above its cap loses the extra as usual (see "Settlements").

### Empire

- **Connected hexes.** Each year, after the settlements are updated, a civ's hexes that can be reached from its capital over its own land, land nobody holds, the land of civs it trades with (trade open last year), and water within its boat range are its **empire**. Its other hexes are **enclaves**: cut off by civs it does not trade with.
- **Still needed** (see "Gathering and levels") counts only the stores of its empire: materials in an enclave cannot reach the capital.
- **Enclaves** gather 50% as much, and get half of their civ's gathering bonuses and half of its building and wonder food-capacity bonus.
- **Supply routes** pass through the land of civs it trades with, but only the civ's own hexes give goods (see "Settlements").

## Gathering and levels

Every civ has a level from 1 to 5. Materials are kept in the stores of its settlements (see "Settlements"); its **capital's store** pays for its levels, era buildings and wonders. Every civ starts at level 1 with empty stores.

| Level | Name |
|---|---|
| 1 | Foragers |
| 2 | Farmers |
| 3 | Builders |
| 4 | Organised |
| 5 | Kingdom |

Step 1 of each year (see "A year") works from the state at the end of last year: who lives where (people per civ per hex), who went hungry where. It runs in this order: settlements (holders, sizes, capitals and what they plan to build), gathering, settlement buildings, era buildings and wonders, levelling up or falling back, enclosing and absorbing, food capacities, supply routes.

### Gathering

- **Secure food.** A hex's food is secure when at most 20% of the people living there went hungry last year (hungry ≤ 0.2 × its people). Only hexes with secure food gather. A civ's food is shown in the statistics sheet as *secure* when at most 10% of all its people went hungry last year and starvation killed fewer than 2% of its people (its people now) over the last 10 years, as a *famine* when starvation killed 10% or more over those 10 years, and otherwise as *short*; that changes nothing.
- **The holder gathers.** Only the civ holding a hex (see "Settlements") gathers there, every level included.
- **Next spend.** A civ spends from its capital's store in this order and gathers for the first of these it has not paid for yet: a wonder it is committed to and has not started (of its era or an earlier one, a Kingdom included), its next level, then its era's building (unless it is standing or being built; optional, see "Buildings and wonders"). A Kingdom with no wonder to gather for gathers nothing. A material is still needed when the stores of its empire together (every settlement it holds that is joined to its capital; see "Peace and trade") hold less than that cost.
- **Rounding.** Fractional yields add up to uneven amounts, so every check of a store against a cost (levels, era buildings, wonders, settlement buildings and what is still needed) counts a store within 0.001 of the cost as holding it; paying never leaves a store below 0.
- **What a hex works.** In each hex it holds, the civ works the hex's deposits of the materials its next spend still needs, together with the materials any of its settlements' planned buildings still needs (a planned building's cost above that settlement's store; see "Settlements"). If the hex has none of those, it works the deposits of materials **anything later** still needs (all its stores together hold less than its next spend, the rest of this era's spends and every later level with its building cost together). If the hex has none of those either, nobody gathers there.
- Where civs expand ("Migration") uses the same next spend for the materials a civ wants.
- **Gatherers.** In each hex it works, 20% of the holder's adults there (aged 16 or more) gather, each weighted by 0.5 + their cooperation: gatherers = 20% × the sum of (0.5 + cooperation) over its adults there (exactly 20% of its adults when every cooperation is 0.5). Cooperative civs × 1.25. A gathering bonus from buildings and wonders multiplies this by 1 + the bonus (and uncommon and exotic yields by 1 + any rare-gathering bonus too, Caravanserai). A hex that carried goods last year gathers × (1 − 0.25 × the share of its carrying capacity it used; see "Supply routes"): its carriers did not gather. An enclave gathers × 0.5, with half the gathering bonuses (see "Peace and trade"). The gatherers split equally among the deposits worked in that hex.
- **Yield.** Deposits never run out, but by hand they give slowly. By hand each gatherer yields 0.5 a year of a common material, 0.25 of an uncommon one and 0.0625 of an exotic one, and a deposit gives at most 10, 5 and 1.25 a year: yield = min(cap, gatherers on it × yield per gatherer). An **industry building** on the deposit raises both (see "Settlements"): Woodcutter, Quarry and Clay pit (wood, stone, clay) and Mine (copper, iron, salt) 1 a gatherer, at most 20 a deposit a year; Deep mine (gold, gemstones, spices) 0.5 a gatherer, at most 5.
- **Winter.** Tundra and mountain hexes are closed for the winter quarter, so their gatherers count × 0.75 there.
- The yield goes into the store of the hex's settlement, up to its cap (see "Settlements"); what does not fit is lost. Gathering costs no food and takes nobody away from eating or having children.

### Levelling up

Every year each civ that has people adds 1 to its years at its level, plus its **civic progress bonus** (see "Settlements": a civ with +30% adds 1.3); then it moves up one level if it meets every requirement below for its next level. The materials are taken from its capital's store and its years at the level start again from 0. Years at a level are shown rounded down.

- **Wonders first.** A civ committed to the era's wonder must have started building it (see "Buildings and wonders"). Era buildings are not needed.
- **Bonuses.** A land bonus (Road Network) lowers the hexes and people needed (to reach a level, and the minimum that keeps it) to ⌈× (1 − bonus)⌉, at least 1 hex; a years bonus (Observatory, Grand Library) lowers the years needed to ⌈× (1 − bonus)⌉; a cost bonus (Guild Hall) lowers every material cost of levels and buildings to ⌈× (1 − bonus)⌉. Bonuses are whole percents.

| From → to | Years at the level | Hexes held (% of land per civ) | People per hex needed | Materials spent |
|---|---|---|---|---|
| 1 → 2 Farmers | 100 | 15% | 10 | 80 wood, 30 stone, 30 clay |
| 2 → 3 Builders | 200 | 30% | 12 | 200 wood, 150 stone, 100 clay, 30 copper |
| 3 → 4 Organised | 300 | 50% | 14 | 300 stone, 80 copper, 60 iron, 40 salt |
| 4 → 5 Kingdom | 400 | 75% | 16 | 150 iron, 30 gold, 15 gemstones, 20 spices |

- **Hexes and people** follow the land each civ started with. Land per civ = the map's land hexes (every hex that is not deep water) ÷ the number of civs the game started with. Hexes needed = the percentage above × land per civ, rounded to the nearest whole number (half up), at least 1, but never more than 90% (rounded up) of the land the civ can reach: the land hexes joined to its starting hex by moves of one hex and crossings of up to its boat range (see "Migration"), worked out at the start and again whenever its boat range changes. So a civ on a small island is never locked out of levelling. People needed = people per hex × the hexes needed. A full map settles at about 22 people per land hex, so the hexes are what a civ has to win; the people only check that its land is settled.
- Examples (hexes / people for levels 2, 3, 4 and 5): the Small world (10 × 10, 64 land hexes, 3 civs) 3/30, 6/72, 11/154, 16/256; 30 × 30 with 630 land hexes and 4 civs 24/240, 47/564, 79/1106, 118/1888; the Large world (50 × 50, 1750 land hexes) with 6 civs 44/440, 88/1056, 146/2044, 219/3504, and with 8 civs 33/330, 66/792, 109/1526, 164/2624.
- Hexes and people are counted at the end of last year.
- **By type:** Nomadic civs need 10% more years and Isolationist civs 20% fewer, rounded up: Nomadic 110, 220, 330 and 440 years; Isolationist 80, 160, 240 and 320. Isolationist civs spend 25% more materials, rounded up: 100 wood, 38 stone, 38 clay; 250 wood, 188 stone, 125 clay, 38 copper; 375 stone, 100 copper, 75 iron, 50 salt; 188 iron, 38 gold, 19 gemstones, 25 spices.
- Without bonuses the climb to Kingdom takes at least 100 + 200 + 300 + 400 = 1000 years (Nomadic 1100, Isolationist 800). Civic progress (at most +20%; see "Settlements") and years bonuses (Observatory, Grand Library) shorten it: at +20% the years count 1.2 each, so 84, 167, 250 and 334 years, 835 in all. So a Kingdom is possible in a 1000-year game, but not certain.
- **Falling back.** In a year it does not level up, a civ at level 2 or higher whose people are below the people needed to reach its current level (see above) adds 1 to its years below the minimum; otherwise that count goes back to 0. At 100 years in a row it drops one level, keeps its stores, and its years at the level start again from 0. To climb back it must meet that level's requirements and spend the materials again.
- A civ that dies out keeps the level it had.

### What levels do

Each level keeps everything from the levels below it.

| Level | Effect |
|---|---|
| Every level above 1 | Birth chance + 0.5 percentage points per level above 1 (+2 points at level 5; see "A year", Births). |
| 2 Farmers | Plains and river hexes + 25% food capacity. Rafts: migration may cross one sea or lake hex (see "Migration"). |
| 3 Builders | Shelter: hunger's health loss in desert, tundra and mountain is halved, round(35 × B × climate × 0.5). |
| 4 Organised | Boats: migration may cross up to 3 sea or lake hexes in a row (see "Migration"). |
| 5 Kingdom | Every hex + 25% food capacity (plains and river hexes + 50% in all); old age starts 5 years later; +25% morale in battles against civs that are not Kingdoms (see "War"); encloses hexes, absorbs everyone else in them and closes them to other civs (below). |

- **Food capacity** of a land hex follows the highest level among the civs with people in it at the end of last year: capacity = its level-1 capacity × (1 + 0.25 if that level is 2 or more and the hex is plains or has a river, + 0.25 if that level is 5, + the biggest food bonus among the civs living there, + its settlement's food bonus) + its settlement's flat food bonus (see "Settlements": the size's bonus, Fields, Granary, Irrigation, Fishing dock). A civ's food bonus in a hex is the sum of its buildings' and wonders' food bonuses, plus their hills, mountain, desert and tundra bonus on those terrains (Granary, Colonial Office, Terraces, Hanging Gardens; see "Buildings and wonders"). An empty hex has its level-1 capacity. When a hex's capacity falls, any food above the new capacity is lost. Capacities are set once a year, in step 1.
- **Enclosed hexes.** After levelling, a land hex with at least one land neighbour is enclosed by a Kingdom when every one of its land neighbours held people of that Kingdom at the end of last year (sea and lake neighbours do not count; the hex itself may hold anyone or nobody). Enclosed by several Kingdoms: the one with the most people (civ-wide), then the lower civ number.
- **Absorbing.** Every person of a civ that is not a Kingdom living in a hex a Kingdom encloses joins that Kingdom, all of them at once, every year. The people absorbed switch civ and keep everything else; they count as switching civ in the statistics. Other Kingdoms' people are never absorbed: one Kingdom can only take another's land by fighting.
- **Closed borders.** No person of another civ (Kingdoms included) can migrate into an enclosed hex or flee into one after a battle (see "Migration" and "War"). So a Kingdom can only be broken from its edge inwards.
- Alliances and organised war (planned for level 4) are not in the game yet.

## Buildings and wonders

Each era, levels 1 (Foragers) to 4 (Organised), has a **building** for every civ type, and one **wonder** for the whole world. Neither is needed to climb to the next level (see "Levelling up"); a building gives its bonus, and only the first civ to finish a wonder gets it. Both are paid from the civ's capital's store (see "Settlements"). Every building and wonder stands in one hex. Their bonuses are civ-wide and last while they stand. They are worked out in step 1 of the year (see "A year"), after gathering and before levelling, from who lived where at the end of last year; nothing about them is random.

### Era buildings

Every type pays the same for an era's building (a cost bonus, Guild Hall, lowers it; Isolationist civs do not pay more):

| Era (built at level) | Next level | Materials | Years of work | People in the hex for a year of work |
|---|---|---|---|---|
| 1 Foragers | 2 Farmers | 40 wood, 30 stone, 15 clay | 30 | 10 |
| 2 Farmers | 3 Builders | 100 wood, 80 stone, 50 clay, 15 copper | 50 | 12 |
| 3 Builders | 4 Organised | 150 stone, 40 copper, 30 iron, 20 salt | 80 | 14 |
| 4 Organised | 5 Kingdom | 80 iron, 15 gold, 8 gemstones, 10 spices | 120 | 16 |

- **Starting.** A civ at levels 1 to 4 without its era's building (not standing and not being built) starts it in the first year its capital's store holds the cost on top of what its next level costs (it never spends what its next level needs): the materials are taken at once and work begins in the building's hex.
- **The hex.** One of the civ's hexes (land, with its people in it at the end of last year) where nothing else stands or is being built, one building or wonder per hex. Hexes with at least the people the work needs (the last column above) come first. Among them, the best has the highest score = its people there × (1 + 0.2 × its land neighbours that hold its people) × 0.5 if another civ also lives there × 0.25 if a civ that threatens it (see "Where civs expand") lives there or next to it; on a tie the lower index. If no hex has the people the work needs, the best of the others is used (its work counts only once enough people live there); with no free hex holding its people at all, it waits.
- **Work.** A year of work counts when the hex held at least that many of the civ's people at the end of last year (10, 12, 14 and 16: the people per hex of the level the building unlocks). After the years of work it stands, and its bonus starts that year.
- **Lost.** In a year the civ has nobody left in the building's hex (counted at the end of last year), the building is destroyed, or the work on it is lost with its materials. The civ keeps its level and may build it again, at full cost, while it is in that era.
- A civ builds only its current era's building; a building from an earlier era that is destroyed is not rebuilt, and its bonus is gone.

Each type's buildings and their bonuses:

| Type | Era 1 | Era 2 | Era 3 | Era 4 |
|---|---|---|---|---|
| Expansionist | **Trailhead Lodge**: birth chance +0.25 pt | **Granary**: food capacity +5% in every hex it lives in | **Road Network**: hexes and people needed for levels −10% | **Colonial Office**: birth chance +0.25 pt; food capacity +5% in every hex it lives in |
| Aggressive | **War Totem**: strength in fights +25%; 20% fewer war deaths when it loses a fight | **Barracks**: 50% fewer war deaths when it loses a fight | **Forge**: strength in fights +25% | **Citadel**: strength in fights +15%; defence +50% in every hex it holds |
| Cooperative | **Council Fire**: gathering +20% | **Market**: its people switch to other civs 50% less often; people of other civs in its hexes join it 50% more often | **Guild Hall**: defence +25% in every hex it holds; materials for levels and buildings −15% | **Senate**: birth chance +0.5 pt; people of other civs in its hexes join it 50% more often |
| Isolationist | **Ancestor Shrine**: old age starts 4 years later | **Terraces**: food capacity +25% on hills, mountain, desert and tundra | **Walls**: defence +75% in every hex it holds | **Observatory**: gathering +30%; years needed at a level −10% |
| Nomadic | **Tent Circle**: hunger's health loss −25% | **Caravanserai**: gathering of uncommon and exotic materials +30% | **Horse Paddock**: strength in fights +10%; +1 movement point (for walkers, the Nomadic) | **Khan's Court**: strength in fights +15%; hunger's health loss −25% |

Loyalty, war-loss and hunger bonuses together count at most 75% (so a civ's people always keep some chance to switch away, its warriors who lose a duel always keep some chance of dying, and it always loses some health in a hungry year). Strength in fights multiplies a civ's attack in battles, and fewer war deaths means its warriors who lose a duel are killed that much less often (wounded instead; see "War").

### Wonders

| Era | Wonder | Materials | Years of work | Bonus |
|---|---|---|---|---|
| 1 Foragers | **Sun Circle** | 160 wood, 120 stone, 80 clay | 40 | birth chance +1 pt; its people switch to other civs 50% less often |
| 2 Farmers | **Hanging Gardens** | 250 stone, 150 clay, 60 copper, 10 gold | 70 | food capacity +30% in every hex it lives in |
| 3 Builders | **Great Wall** | 400 stone, 80 copper, 80 iron, 15 gemstones | 100 | strength in fights +50%; defence +100% in every hex it holds |
| 4 Organised | **Grand Library** | 200 iron, 40 gold, 30 gemstones, 30 spices | 120 | gathering ×2; years needed at a level −30% |

- **Who thinks about it.** Any civ at the wonder's era or later (its level is at least the era; Kingdoms too), while the wonder has never been finished; its era building is not needed. A civ goes for one wonder at a time: while it is committed to or building one, it thinks about no other. It looks at the unfinished wonders of its era and earlier, the earliest first, and decides on the first it may (one decision a year). It decides in the first year it qualifies and again every 25 years until it commits or the wonder is gone.
- **The decision.** Go-for-it score = type lean × safety × land × 0.7 per wonder owned. Type lean: Expansionist 0.75, Aggressive 0.8, Cooperative 1.2, Isolationist 1.3, Nomadic 1. Safety = 1 − the share of its hexes that hold, or are next to a hex holding, people of a threat it does not beat (see "Where civs expand"). Land = the hexes it holds ÷ the hexes its next level needs, at most 1.5. The score is then × 0.7 for each wonder the civ already owns, so wonders spread out rather than piling up with the biggest civ. It commits when the score is at least 1.
- **Committed.** A committed civ gathers for the wonder before its level and its era building (see "Gathering"). Committed to its own era's wonder, it does not level up until it has started it; a wonder of an earlier era never holds back its level. It starts in the first year its capital's store holds the cost, in a hex chosen like a building's (with the people per hex of the wonder's era), and the materials are taken at once.
- **Giving up.** A committed civ that has not started gives up when 200 years have passed since it committed, or, checked every 25 years, when its safety is below 0.5. It keeps its stores and decides again 25 years later.
- **Work** counts like a building's (the same people per hex for its era). Several civs can build the same wonder at once. The first to finish its years gets it; several in the same year: the one with the most people at the end of last year, then the lower civ number. Every other civ building it stops and gets 50% of the wonder's materials back into its capital's store (up to the store's cap); civs still gathering for it stop.
- **Captured.** A finished wonder belongs to whoever holds its hex's settlement (see "Settlements": the holder changes when another civ outnumbers it 1.25 to 1 there, or at once when another civ wins a battle there; see "War"), bonus and all, from the first step 1 of a year at which it holds the hex. A Kingdom that absorbs the hex's people takes it the next year. With nobody living there it is abandoned and gives no bonus until a civ settles the hex and takes it. A wonder is never destroyed and never built again.
- Work on a wonder is lost, with its materials, like a building's, if the civ has nobody left in its hex.

### Bonuses together

A civ's bonuses are the sum of the bonuses of its standing buildings and the wonders it owns (two strength bonuses of 25% make +50%). Where they apply: birth chance (see "A year", Births), food capacity (see "What levels do"), gathering (see "Gathering"), strength, defence and war deaths (see "War"), loyalty and attract (see "Switching civ"), old age (old age starts that many years later), hunger (see "A year", Eating), movement points (Nomadic only; see "Migration"), and land, cost and years (see "Levelling up").

## Settlements

Every land hex with people is a **settlement**. It belongs to one civ, its **holder**; it has a size (its **tier**), a **store** of the 9 materials, up to one building of each kind below, and it sends and receives goods along **supply routes**. Settlements are worked out in step 1 of the year (see "A year") from the people at the end of last year. Nothing about them is random. Each settlement has a name, made from the seed and the hex.

### Holder, size and capital

- **Holder.** The civ with the most people in the hex (on a tie the lower civ number) takes an empty hex. A holder keeps its hex while it has people there, unless another civ has at least 1.25 × its people there (that civ takes it; not a civ it is in a truce or at peace with, see "Peace and trade"), and a civ that wins a battle for a hex takes it at once (see "War"). A hex that changes hands loses its planned building, and 50% of its store is looted: carried off to the new holder's capital (as much as that store has room for; the rest is lost; it stays in the hex when the hex becomes the capital). Its standing buildings stay. A hex nobody lives in keeps its buildings and store for 30 years, then they are lost.
- **Size.** Its people (all civs) decide its tier, up to what the holder's level allows:

| Tier | People | Holder's level | Housing | Building slots | Store cap (each material) | Food capacity bonus | Route reach (steps) |
|---|---|---|---|---|---|---|---|
| Camp | 1 | 1 | 25 | 1 | 60 | 0% | 1 |
| Village | 12 | 1 | 45 | 2 | 250 | 0% | 2 |
| Town | 30 | 2 | 80 | 3 | 450 | +4% | 3 |
| City | 60 | 3 | 140 | 5 | 700 | +8% | 4 |
| Metropolis | 100 | 4 | 220 | 7 | 1000 | +12% | 5 |
| Megapolis | 160 | 5 | 320 | 9 | 1500 | +16% | 6 |

  A settlement grows at once when it has the people for a bigger tier the holder's level allows. It shrinks one tier after 20 years in a row below 85% of its tier's people, and at once to the biggest tier the holder's level allows.
- **Housing** caps the people a hex has room for (see "A year", Births, and "Migration"). Food capacity bonuses are shares of the hex's level-1 capacity (see "What levels do").
- **Capital.** Each civ's capital is the hex it holds with the most of its people (on a tie the lower index). It moves only when another hex the civ holds has at least 1.5 × the capital's people of that civ, or the civ no longer holds it. The capital's store cap is 1.5 × its own cap, and never below 1.1 × the largest cost of one material for the civ's next level and its era building together, or for any wonder of its era or an earlier one that nobody has finished (a Kingdom too). Stock above a store's cap (after a capital moves, or a size or Warehouse is lost) loses 20% of the amount above the cap a year.

### Settlement buildings

Each settlement builds one building at a time, paid from its own store; each kind at most once per settlement, and standing buildings plus the one planned at most its slots.

| Building | Kind | From tier | Holder's level | Where | Materials | Years | Effect |
|---|---|---|---|---|---|---|---|
| Huts | housing | Camp | 1 | | 10 wood | 5 | housing +15 |
| Houses | housing | Town | 1 | | 30 wood, 20 clay | 10 | housing +25% of its tier's |
| Fields | food | Village | 1 | plains, coast or river | 20 wood | 10 | food capacity +5% |
| Fishing dock | food | Village | 1 | next to sea or lake | 25 wood | 10 | food capacity +5 |
| Granary | food | Town | 1 | | 40 wood, 30 clay | 10 | food capacity +5% |
| Irrigation | food | City | 1 | plains, coast or river | 80 stone, 20 copper | 20 | food capacity +10% |
| Woodcutter | industry | Camp | 1 | on a wood deposit | 15 wood | 5 | wood 1 a gatherer, at most 20 a year |
| Quarry | industry | Camp | 1 | on a stone deposit | 20 wood | 5 | stone 1 a gatherer, at most 20 a year |
| Clay pit | industry | Camp | 1 | on a clay deposit | 15 wood | 5 | clay 1 a gatherer, at most 20 a year |
| Mine | industry | Camp | 2 | on a copper, iron or salt deposit | 40 stone, 20 wood | 15 | copper, iron, salt 1 a gatherer, at most 20 a year |
| Deep mine | industry | Camp | 3 | on a gold, gemstones or spices deposit | 60 stone, 20 iron | 20 | gold, gemstones, spices 0.5 a gatherer, at most 5 a year |
| Warehouse | trade | Town | 1 | | 50 wood, 40 stone | 10 | store cap × 1.5 |
| Market | trade | Town | 1 | | 40 wood, 30 clay, 10 salt | 10 | carrying capacity × 1.5 |
| Shrine | civic | Village | 1 | | 20 stone | 10 | progress +2% |
| School | civic | Town | 1 | | 40 wood, 30 stone | 15 | progress +3% |
| Library | civic | City | 1 | | 60 stone, 20 copper | 20 | progress +5% |
| Palace | civic | Metropolis | 1 | the capital | 100 stone, 20 gold | 25 | progress +5%; defence +50% |
| Palisade | defence | Village | 1 | | 30 wood | 5 | defence +25% |
| Stone walls | defence | City | 1 | | 100 stone | 15 | defence +75% |

- **Progress.** A civ's civic progress bonus is the sum of the progress of its civic buildings, each kind counted in at most 5 of its settlements, and at most +20% in all. It makes every year at a level count for 1 + the bonus (see "Levelling up").
- **Defence** adds to the terrain's defence bonus when the civ holding the settlement fights a battle there, and makes attackers besiege it first (see "War").
- **Choosing.** A settlement with no plan and a free slot decides what to build every 5 years (in the years where hex index + year is a multiple of 5). It considers every building it may build (tier, holder's level, where, not standing yet) whose materials its civ has somewhere (in any of its stores, or as a deposit in a hex it holds), and scores each:
  - housing 3, only when its people are at least 90% of its housing;
  - food 3, only when at least 10% of its people went hungry last year;
  - industry 4 when the deposit's material is one its civ gathers for (see "Gathering": its next spend or anything later), otherwise 1; + 0.25 for uncommon and + 0.5 for exotic materials;
  - Warehouse 2, only when some material reached its store cap last year; Market 2, only when at least 10 goods were carried from or to it last year;
  - defence 2, only when a threat its civ does not beat (see "Where civs expand") has people in or next to the hex;
  - civic 1.
  The civ type tilts the scores: Isolationist food, industry and defence × 1.3; Cooperative civic and trade × 1.3; Aggressive defence × 1.5; Expansionist housing × 1.3. It plans the highest score above 0 (on a tie the earlier building in the table); a Nomadic settlement plans only a score of at least 2.
- **Building.** A plan starts in the first year the settlement's store holds its cost: the materials are taken and work begins, that year counting as its first year of work; it stands after its years of work. A plan not started after 40 years is dropped, and nothing is planned there for 25 years.

### Supply routes

After capacities, every year, each settlement that wants something looks for it in the hexes its civ holds, over land its civ holds or a civ it trades with holds (see "Peace and trade"; not across other civs' land), nearest first. A civ with rafts or boats may also carry materials across up to its boat range of sea or lake hexes in a row (see "Migration"), so its islands supply each other and its capital; each water hex counts as a step. Food is carried over land only. Settlements are served biggest first (bigger tier, then more people, then by a fixed shuffle of hex and year, so no area is always first).

- **Carrying capacity.** A hex can send 0.5 goods (food and materials together) a year per person living there, × 1.5 with a Market.
- **Materials.** A settlement with a planned building that has not started asks for what its store lacks, from hexes within its reach or within the supplier's reach (the larger of the two, in steps). A capital also asks for what its civ is saving for beyond its store (up to its cap): the era's wonder if committed and not started, the next level and the era building if not started, together, from any hex its civ holds that its land connects to the capital. A hex gives the materials in its store beyond its own planned building's cost; a capital gives nothing of what its civ is saving for (the same list). Nobody asks for more than all its civ's stores can give.
- **Food.** A settlement where at least 10% of the people went hungry last year asks for 1.1 × its people − its food. Food comes after materials. A hex gives the food beyond 1.1 years' food for its people, and never so much that it would hold less than half its capacity in food and people together (spare = min(food − 1.1 × people, 0.5 × capacity − people)), and only when that spare is at least 5. Food goes up to 12 steps, over land the civ or a civ it trades with holds, to any hungry settlement of the same civ; each hungry settlement (biggest first) takes from the nearest supplier first (then the lower index), and loses 4% of what was sent for every step it is carried.
- The food carried in is added to the hex's food at once, and to its **imports**: 0.8 × last year's imports + 0.2 × this year's food carried in. Imports count in its support (see "A year", Births).
- A hex that used its whole carrying capacity gathers 25% less next year (see "Gathering").

## Statistics

Recorded at the end of every year, for each civ: people alive, hexes held (hexes with at least one of its people), level, births, deaths by old age, deaths by starvation, war deaths, the total age at death of those who died, and the average of each of the 8 traits over its living people (none while it has nobody). When history rows are merged, the trait averages and the level come from the later year, like people and hexes.

- Kept for the whole run: total births and deaths by cause (old age, starvation, war), battles fought (as attacker or defender) and battles won, people who switched into and out of the civ (Kingdoms absorbing included), the first year the civ reached each level, its capital's store, average lifespan (average age at death, war deaths included), oldest age reached, peak population and the first year it was reached, most hexes held, and the year the civ died out (its people fell to 0), if it did.
- **Extinction cause:** what a civ died out of is the cause with the most of its deaths in the year it died out (on a tie: old age, then starvation, then war), or switching if none of its people died that year (the last ones switched civ).
- The yearly history keeps one row per year for the first 8192 rows. When it is full, pairs of rows are merged (people and hexes from the later year, the other numbers added together) and each new row covers twice as many years, so a long game never runs out of memory.
- **Family lines.** Every person has a generation: founders are generation 1, and a child is its parent's generation + 1. Every person also belongs to the line of the one founder they descend from.
- **Records** kept for the whole run (shown on the end screen):
  - *Oldest person ever:* the highest age anyone reached, alive or dead (on a tie, whoever reached it first; among the living, the lowest id).
  - *Oldest alive at the end:* the oldest living person when the game ends (on a tie, the lowest id).
  - *Longest family line:* the highest generation anyone reached, with the first person born into it and the founder at the head of their line.
  - *Most descendants:* the founder with the most people born into their line (children, grandchildren and so on, alive or dead). It is always a founder, because a parent counts every descendant of their child plus the child. On a tie, the lower founder id. None if nobody was born.
  - *Worst famine:* the famine with the most starvation deaths (on a tie, the one that ended first). A **famine year** for a civ is a year in which its starvation deaths are at least 1% of its people at the start of that year, and at least 5. Famine years of the same civ in a row make one famine, from its first to its last year. A famine still going on when the game ends counts up to the last year.
- **Wars:** for each pair of civs, kept for the whole run: the number of battles between them, the first and last year they fought one, how many of those battles each side won, and how many of the other side's people each side killed (the loser's war deaths in a battle, the sack included, count as killed by the winner, the winner's war deaths as killed by the loser). Individual battles are not kept.
- **History log:** the turning points with their year, kept for the whole run. Level-ups are logged when they happen (step 1 of the year), the rest at the end of the year:
  - **level-ups:** the first year each civ reaches each level from 2 (Farmers) to 5 (Kingdom), once each (falling back and climbing again is not logged again);
  - **first contact:** the first year two civs have people in the same hex, once per pair, with that hex (the lowest-index one if they share several);
  - **milestones:** the first year each civ has at least 100, 500 and 1,000 people, once each;
  - **wonders:** the year a civ finishes a wonder, and the first 16 times a wonder changes hands (captured from another civ, or taken over when abandoned); logged in step 1 with level-ups;
  - **cities:** the first time each civ holds a city, a metropolis and a megapolis (once each per civ), and the first 16 times a city or bigger changes hands; logged in step 1 with level-ups;
  - **big famines:** a famine (see *Worst famine*) whose starvation deaths are at least 10% of the civ's people at the start of its first year. Only the 3 deadliest are kept (on a tie, the one that ended first; a famine still going on at the end counts up to the last year and needs strictly more deaths to pass one that has ended);
  - each extinction (civ, year);
  - **peace and trade:** truces (and who paid tribute), wars that broke a truce or peace, the first goods two civs trade, and trade roads becoming old routes; the first 24 of these in all.
  Each kind can happen only a fixed number of times, so the log never fills up.
- **History chronicle:** what the end screen shows from the log: at most 12 lines. If the log holds more, the most important are kept: extinctions first, then level-ups (higher levels first) and finished wonders, then wonder captures, cities, cities taken, first contacts, truces and wars resumed, then milestones, first trades and old routes (bigger ones first), then famines (deadlier first); within a kind, earlier first, then lower civ number. The lines kept are then shown oldest first.
- While the game runs, the statistics sheet shows each civ's emblem, name, type and level, people and hexes held; the top bar shows the total population, how many civs are still alive, and each civ's emblem with its people alive. Tapping a hex shows its people per civ (see "How civs and people look").
- **Levels in the sheet:** for each civ, its level and name, whether it is well fed (food secure civ-wide) or has many hungry, and for its next level each requirement with a progress bar and "have / need": years at its level (with how much faster they count from civic buildings, if at all), people, hexes held and each material that level spends (its capital's store, rounded down to one decimal). Then its capital's name and size with everything in its store (materials above 0), and what all its settlements' stores hold together. A civ below its level's minimum people shows how many of the 100 years it has been below. Kingdoms show "the top level"; civs that died out show "Died out".
- **Buildings in the sheet:** for each civ, a line when the civ waits to start the era's wonder; its four era buildings with their status, how often each was lost and their bonuses; the current era's wonder (free, being gathered for, being built with its progress, owned, or taken by another civ) and any wonder it owns; and all its bonuses together.
- **What levels and materials do:** a tap-to-open guide under the levels: when a hex gathers and how much, the requirements of every level (hexes and people worked out from the land per civ in play), what each level does (birth chance, food capacity, shelter, boats, later old age, Kingdom strength, enclosed hexes and closed borders), each material's yield and yearly cap by hand and with its industry building and the levels that spend it, the era buildings and wonders, every settlement size and settlement building with its cost and effects, and how civ types change levelling. Its numbers are the ones in "Gathering and levels" and "Settlements".

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
- **Shared-hex ring.** Zoomed out, each land hex with people also has a thin ring around its label: a circle centred on the hex, radius 70% of the hex size (centre to corner), line 7% of the hex size wide over a faint dark backing. The ring is split into arcs, one per civ living there, each as long as that civ's share of the hex's people, in civ colours. Arcs run clockwise from the top, largest civ first (on a tie, the lower civ number); a hex with one civ has a whole ring in its colour.
- **Territory outlines.** Every civ gets a bold outline in its colour, 10% of the hex size wide over a dark casing, around the outer edge of all the hexes it holds (hexes with at least one of its people), so its land reads as one area: an edge between two hexes it holds is not drawn, an edge to a hex it does not hold or to the map's edge is. Outlines of civs that share hexes may overlap, so each civ's line sits slightly inside the territory edge: the middle of the line is (½ + (civ number − 1) mod 4) × the line width inside, that is 5%, 15%, 25% and 35% of the hex size for Civs 1 to 4, then again from 5% for Civs 5 to 8. Outlines show at every zoom, above the rings and below the people.
- **Hex tint.** Each land hex with people is tinted toward the colour of the civs living there, mixed by each civ's share of its people: drawn colour = 70% terrain colour (with its height shading) + 30% civ mix. Empty hexes keep their terrain colour. The map-generation preview is never tinted.
- The ring, outlines and tint are redrawn only when the people per hex changed, and at most 2.5 times a second (every 0.4 seconds), like the labels.
- **Zoomed in**, once a hex is at least 120 pixels across on screen (corner to corner), the hex labels and rings give way to the people themselves: each person is a tiny emblem in their civ's colour, at a fixed spot inside their hex (picked from their id, within 60% of the hex size from its centre).
- **Idling.** While time runs, each person drawn circles slowly around their spot, at a radius of 10% of the hex size, one lap every 4 to 8 seconds (picked from their id, either way round). Paused, they stop where they are. With the device's reduced-motion setting on, they stay still. This is drawing only and changes nothing in the game.
- A person who migrates glides from where they were drawn to their spot in the new hex over 0.6 seconds. This is drawing only: in the game they move at once, as "Migration" says.
- **Moving the map.** Drag to pan, pinch (or the mouse wheel) to zoom, and ⤢ fits the whole map again. With a keyboard, the arrow keys move the view the way they point for as long as they are held, 600 pixels a second (2.5 times as fast with Shift held; two arrows together go diagonally at the same speed), and + and − zoom in and out about the middle of the open map, by 2.5 times a second. Keys typed into a setting are left alone.
- **Tap a hex** to see its terrain, food, deposits, who gathered there this year (the civ holding it, with the materials it worked, its gatherers to one decimal and the amount that went into the store; "Nobody" otherwise) and its people per civ with each civ's emblem. Zoomed out (people not drawn), the tap also flies the camera to that hex over 0.4 seconds: the hex ends centred in the open map area, zoomed in until a hex is 180 pixels across (less if the view cannot zoom that far, but always at least far enough to show people). Panning, zooming or Fit during the flight stops it. *List people* opens the list of the people in the hex, lowest id first (the first 100, then how many more); tap a row to open that person.
- **Buildings and wonders** (see "Buildings and wonders") are drawn in their hex at every zoom, above the people. The outline shows the era (1 a hut, 2 a house, 3 a tower, 4 a palace) and a dark mark inside the type (Expansionist an up arrow, Aggressive a cross, Cooperative two linked rings, Isolationist a walled square, Nomadic a tent), filled in the owner's colour with its emblem as a small badge. Wonders are bigger, on a dark medallion with a gold rim, each with its own picture (Sun Circle a sun, Hanging Gardens a stepped garden, Great Wall a wall with a gate tower, Grand Library a dome on columns); an abandoned wonder is grey. Under construction a building is half-faded with scaffolding and a progress ring (years worked ÷ years needed). Zoomed out they sit in the hex's upper-right corner, clear of the label; zoomed in they are larger and centred. Tapping one (or its hex) opens the hex card with a card per building at the top: its name, era and owner, its status (building with its progress, standing or abandoned; for a wonder who built it, when, and how often it was captured) and its bonuses.
- **Settlements** (see "Settlements") are drawn in every lived-in hex as a small skyline in the holder's colour, bigger with the size: tents for a camp, a few huts for a village, roofs and a tower for a town, walls and a taller tower for a city, a dense block for a metropolis and spires for a megapolis. The roofs show the civ type (pitched for Expansionist, battlements for Aggressive, domes for Cooperative, steps for Isolationist, tents for Nomadic), and a capital flies a small gold flag. Zoomed out the skyline sits low in the hex, under the head count; zoomed in (people drawn) it stands larger in the middle with an icon for each settlement building around it (by kind: housing, food, industry, trade, civic, defence), faded with a cross while being built. Each skyline is redrawn only when the hex's size, holder, capital or buildings change.
- **Supply routes** of the year are lines from supplier to settlement, green where food is most of the goods and tan where materials are, 1 + goods ÷ 6 wide (at most 4). Zoomed in, while time runs, 2 small carts travel each route, one trip every 5 seconds (drawing only; none with reduced motion).
- **The hex card** also shows its settlement at the top: its name, size, holder and whether it is the capital; its people out of its housing; its store with its cap; its buildings standing, being built (with progress) or planned (with what it still needs) and the slots used; and this year's routes in and out (hexes and goods).
- **Tap a person** (zoomed in; the nearest person within 22 pixels of the tap) to see their id, civ, age, health, hunger, parent (their id, or none for founders; "died" if the parent is no longer alive), their living children, the hex they are in, and their 8 traits (two decimals). Tapping the same person again closes the card. If the person dies while the card is open, it shows "Died" with the last values seen.

## Map settings

Chosen on the map-generation screen, before setup.

| Setting | Default | Range |
|---|---|---|
| Seed | pangaea | any text, up to 64 characters (empty means the default) |
| Land shape | One continent | One continent or Islands (anything else means the default) |
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
| Archipelago (land shape Islands; every other preset One continent) | islands | 30 | 60% | 8% | 2 | 40% | 30% | 15% | 15% |
| Highlands | peaks | 20 | 15% | 30% | 5 | 40% | 30% | 15% | 15% |
| Large world | vast | 50 | 30% | 12% | 12 | 40% | 30% | 15% | 15% |

- Regenerate picks a new random seed and keeps the other settings.
- Randomise picks a new seed, a size from 10 to 50, water 10% to 60%, mountains 5% to 30%, 0 to ⌊size ÷ 4⌋ rivers, plains 20% to 60%, forest 10% to 50%, desert 0% to 30% and tundra 0% to 30%, and Islands as the land shape with chance 25% (otherwise One continent).

## Game settings

Chosen on the setup screen, after the map.

| Setting | Default | Range |
|---|---|---|
| Civ count | 3 | 1 to 8 |
| Civ types | Civ 1 Expansionist, Civ 2 Aggressive, Civ 3 Cooperative (a new civ gets, by its number, Expansionist, Aggressive, Cooperative, Isolationist, Nomadic, then again from Expansionist) | one of the 5 types per civ |
| Starting population | 20 people per civ | 2 to 200 |
| Starting positions | every civ placed automatically | per civ, any hex of the map (a water hex, or the same hex as an earlier civ, falls back to automatic) |
| Mutation | 3% (each trait of a child moves by up to ±0.03 from its parent's) | 0% to 10%, whole percent |
| End conditions | none ticked (Sandbox: no end) | any combination of Last civ standing, First to Kingdom, Dominance, Year limit; ticking none is Sandbox |
| Dominance share | 60% of land hexes | 25% to 100%, whole percent |
| Dominance years | 300 | 10 to 10000 |
| Year limit | 2500 (choices 1000, 2500, 5000, 10000, or custom) | 10 to 100000 |

Out-of-range values are clamped to the range; values that are not numbers fall back to the default. Unknown end conditions are ignored, and anything that is not a list of end conditions means Sandbox. The civ count decides how many civs there are; a missing or unknown type takes the default type for that civ's number.

- **Starting positions.** The setup screen shows the map with every civ's emblem on its starting hex (automatic ones fainter). Pick a civ, then tap a land hex: that civ will start there, and the next civ is picked. Tapping a hex another civ was given takes it away from that civ, which goes back to automatic. *Random positions* places every civ on a good start hex (food capacity 40 or more; any land if there are too few), spread as evenly as the land allows: the first civ on a random good hex, each next one on the good hex farthest from those placed, then for up to 20 rounds each civ in turn moves to the good hex farthest from its nearest other civ when that is farther than where it is (distances in steps, across water too; ties at random). Each press gives a new spread, shown like hand-picked starts. *All automatic* clears every choice. The choices belong to the map: coming back to setup with a different map clears them. Removing a civ removes its choice and the later civs keep theirs.
- **The civ list.** The setup screen lists the civs, each with its emblem, a type picker, the type's explanation (see "Civ types") and a remove button. *Add civ* adds a civ at the end (up to 8) with the default type for its number; remove takes that civ out (down to 1) and the later civs move up a number, keeping their types. The *Civs* number field sets the count directly (civs are added or taken off at the end).

- Each map preset also sets the civs and the end conditions:

| Preset | Civs | Types (Civ 1 first) | People each | End conditions |
|---|---|---|---|---|
| Small world | 3 | Expansionist, Aggressive, Cooperative | 20 | Sandbox |
| Continent | 4 | Expansionist, Aggressive, Cooperative, Isolationist | 30 | First to Kingdom, Dominance (60%, 300 years), Year limit 5000 |
| Archipelago | 5 | Nomadic, Expansionist, Isolationist, Cooperative, Aggressive | 20 | Last civ standing, Year limit 10000 |
| Highlands | 3 | Isolationist, Aggressive, Nomadic | 20 | Year limit 2500 |
| Large world | 6 | Expansionist, Aggressive, Cooperative, Isolationist, Nomadic, Aggressive | 40 | Last civ standing, Dominance (60%, 300 years) |

  Settings a preset does not list keep their defaults (dominance 60% and 300 years, year limit 2500). Every preset uses mutation 3%.
- Randomise on the setup screen picks 2 to 6 civs, each with a type picked at random from the 5 (equal chances), and 10 to 50 people each, a mutation of 0% to 10% (whole percent), ticks each of Last civ standing, First to Kingdom, Dominance and Year limit with chance 50% (none ticked is Sandbox), a dominance share of 50% to 80%, dominance years of 100, 200, 300 or 500, and a year limit of 1000, 2500, 5000 or 10000; it does not change the map. Randomise on the map screen does not change the civs, their types, the mutation or the end conditions.

## End of the game

On the setup screen you tick any combination of these end conditions. Ticking none of them is **Sandbox**: the game never ends on its own.

- **Last civ standing:** the game ends in the year only one civ still has people. That civ wins. Needs at least 2 civs at the start (with 1 civ it never fires).
- **First to Kingdom:** the game ends in the year the first civ reaches level 5 (Kingdom; see "Gathering and levels"). That civ wins. If several reach it in the same year, the one with the most people at the end of last year wins, then the lower civ number. Off by default. Only the first Kingdom of the game counts.
- **Dominance:** the game ends when one civ has held at least the dominance share (default 60%) of the land hexes for the dominance years (default 300) in a row. Land hexes are all hexes that are not sea or lake; a civ holds a hex when at least one of its people lives there (several civs can hold the same hex). The years count from the first year the civ reaches the share and start again from 0 in any year it is below it. That civ wins. If several civs complete their years in the same year (possible only with a share of 50% or less), the one holding the most hexes that year wins, then the lower civ number.
- **Year limit:** the game ends when the year limit is reached (1000, 2500, 5000, 10000 or a custom year). There is no score and no winner.
- **Total extinction always ends the game,** whatever is ticked, Sandbox included: when no civ has any people left. There is no winner.

The conditions are checked at the end of each year, after the statistics. The first one met ends the game; if several are met in the same year, the first in this order counts: total extinction, last civ standing, first to Kingdom, dominance, year limit.

- **End now:** while the game is paused, the controls show an *End now* button. It ends the game at once, with no winner (reason "Ended by the player"), and opens the end screen. On a game that has already ended it reopens the end screen.
- When the game ends it pauses, the top bar shows "(ended)" after the year, and the end screen opens.

## End screen

A scrollable screen that opens when the game ends. Everything on it comes from the statistics and records kept during the run (see "Statistics"), so it opens at once.

- **Header:** the winner (the surviving civ for Last civ standing, the first Kingdom for First to Kingdom, the dominant civ for Dominance; "No winner" otherwise), the end reason, and the years run.
- **Buttons:**
  - *Keep watching:* back to the map; the game carries on from where it stopped as a sandbox, where no end condition applies any more (not even total extinction). Not shown after a total extinction. *End now* still opens the end screen again.
  - *Same settings again:* starts a new game with exactly the settings of the one that ended (same seed, so the same map and start). The settings are kept in memory only.
  - *New map:* the map-generation screen with the same settings and a new random seed.
  - *Back to setup:* the setup screen with the settings of the game that ended.
- **Cards:**
  - *Civs by final population* (most people first; ties by higher peak population, then lower civ number): people at the end, type, level at the end and the year it reached it, peak population and the first year it was reached, average lifespan (average age at death), most hexes held at once, people switched in and out, and the year the civ died out (if it did). Each civ is a head row (emblem, name, people at the end) and one line of facts separated by dots: "Expansionist · level 3 Builders since year 450 · peak 1,571 in year 498 · 63 hexes at most · lived 40.1 years on average · switched in 56, out 135 · traded 1,240 worth, most with Civ B · died out in year 480" ("no deaths" instead of the lifespan if none died; no "since" while at level 1; the trade part only when it bought and sold at least 1 in value together, rounded, with the civ it traded the most value with; the last part only if it died out). Battles and war deaths are in the War card.
  - *War:* one row per pair of civs that ever fought a battle, totals over the whole game (see "Wars" under "Statistics"): the two sides, the years at war (first battle year to last battle year), the number of battles, battles won by each side, the other side's people killed by each side, and where they stand at the end ("war", "truce" or "peace", with ", trading" while trade is open; see "Peace and trade"). Deadliest first (most people killed on both sides together); ties by the lower first civ number, then the lower second. "No wars." if no civs ever fought.
  - *Population over time:* one line per civ in its colour, from year 0 to the last year, all on the same scale (the top of the chart is the highest population any civ reached in the recorded history). It draws at most 400 points per civ, taken evenly from the recorded rows, plus the last row.
  - *Level over time:* one step line per civ in its colour, level 1 Foragers at the bottom to 5 Kingdom at the top, from year 0 to the last year, sampled like the population chart; civs on the same level are drawn a hair apart so each stays visible. Below it, the year each civ first reached each level ("stayed Foragers" if it never climbed).
  - *Greatest cities:* the 5 settlements that reached the biggest size during the run, from town up (biggest size first, then the most people they had at that size, then the lower hex index): name, place (column, row), size, the year it first reached that size and its people then, and "now in ruins" or its smaller size at the end if it shrank ("No settlement grew past a village." if none).
  - *Capital stores at the end:* each civ's capital's store of every material any civ still holds, rounded down to one decimal ("Nobody gathered anything" if none).
  - *Traits:* for each civ that ever had people, the average of each of the 8 traits at the end (or in its last year with people, if it died out), to two decimals, with the change since its founders' averages at year 0.
  - *People:* the oldest person ever (id, civ, age, and the year they died or "alive") and the oldest person alive at the end (see "Records" under "Statistics").
  - *Deaths by cause:* deaths by old age, by starvation and in war over the whole run, all civs together, with their share of all deaths.
  - *Records:* longest family line, the person with the most descendants, and the worst famine (see "Statistics").
  - *History:* the history chronicle (see "Statistics"), oldest first; on the same year famines, then level-ups, wonders, cities, first trades and old routes, then first contacts, declarations of war, truces, milestones, extinctions, then by civ number (the lower one for a first contact). A level-up reads "Civ A reached level 2, Farmers"; a wonder "Civ A finished the Hanging Gardens", "Civ A captured the Great Wall from Civ B" or "Civ A took over the abandoned Great Wall"; a city "Belamar became Civ A's first city" (or metropolis, megapolis); a city taken "Civ A took Belamar from Civ B"; a first contact "Civ A met Civ B at (column, row)"; a truce "Civ A and Civ B made a truce; Civ B asked for it and paid tribute" (the second part only after exhaustion); a declaration "Civ A declared war on Civ B" (the first 16 declarations of the game); "Civ A and Civ B began to trade"; "The trade road between Civ A and Civ B became an old route"; a milestone "Civ A passed 100 people"; a famine "Famine in Civ A: N starved (P% of its people) by year Y" (P is the share of its people at the famine's start, rounded; "by year Y" only if it lasted more than a year; "(still going)" after the civ if it had not ended); an extinction "Civ A died out". Individual battles are not listed (the War card sums them up). "Nothing to report." if empty.
- **Folding:** the header, buttons, Civs and War cards are always shown. Every card after them (Population over time, Level over time, Greatest cities, Capital stores, Traits, People, Deaths by cause, Records, History) is a row with its title (at least 48 pixels tall) that opens and closes on tap; *Population over time* starts open, the others start closed.

## Not in the game yet

Land degrading, alliances, and troops that march beyond the hexes next to a battle. God powers are not planned. See [project/ROADMAP.md](project/ROADMAP.md).
