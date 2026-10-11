# Rules

How the game works, as currently implemented. Every number here is the value the code uses. If the game and this file disagree, the game has a bug (see CLAUDE.md).

This describes the current build (Phase 2, in progress): a generated hex map where civilisations of individual people eat, have children, grow old, starve, migrate, fight and switch civ, year by year, until an end condition you chose is met. Every person carries 8 inherited traits that set their birth chance, lifespan, food need, how hard hunger hits them, how they fight, how readily they switch civ and how well they gather; each civ has a type that biases how its people move, fight and level up. Civs with food to spare gather materials and spend them to climb from level 1 (Foragers) to level 5 (Kingdom). The full design is in [project/ROADMAP.md](project/ROADMAP.md); this file changes as each part of it ships.

## Saving

- Nothing is saved between sessions: no settings, no games. A fresh page load always starts from the default settings. Within a session, *Same settings again* and *Back to setup* (see "End screen") reuse the settings held in memory.

## Home page

- The game opens on the **home page**: *New game* goes to the map-generation screen, *How to play* opens the rules in plain words, and *Back to game* (shown only once a game has started in this session) returns to it. The map-generation screen has a *Home* button back to the home page.
- **The living world.** Behind the buttons a small world lives: a real game, run by the same rules, with seed genesis, size 12 × 12, 3 rivers, 4 civs (Expansionist, Aggressive, Cooperative, Nomadic) of 20 people each, every other setting at its default, and no end condition. It is shown from year 60 and lives 6 years a second, drawn like the map zoomed out (tint, outlines, rings and each hex's largest civ's emblem, without head counts), with the year, its people and the civs still alive in its corner. After year 1500, or if nobody is left, it starts again from year 60. It runs only while the home page is on screen; with the device's reduced-motion setting on, it shows year 300 standing still. It is separate from your game and changes nothing in it.
- **How to play** explains the map, people, a year, migration, civs, traits, civ types, fighting and switching civ, materials and levels, the end of the game and the controls. Its numbers are read from the game, so they are the ones in this file. Its pictures are drawn by the game from the same world as the home page, in year 300: the map before anyone arrives, a close-up of its busiest hex (lowest index on ties) with every person, the hexes a person can walk to in a year from a lowland hex near the middle (3 movement points, and 5 for Nomadic), the civs' land, each civ's average traits, a close-up of the hex shared by civs where the smallest civ there has the most people (lowest index on ties), the first contact and first three fights from its history log, the Levels panel for Civ 1 and Civ 2, and the end screen's population chart.
- **Addresses:** the page's address ending in #how opens How to play directly, and #new the map-generation screen. Opening How to play from the home page adds a step to the browser's history, so Back returns to the home page.

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
- Seas and lakes are impassable (civs at level 4 can cross one water hex by boat; see "Migration").
- Levels raise food capacity: plains and river hexes from level 2, every hex at level 5 (see "Gathering and levels"). The table gives the capacity at level 1.
- Every hex starts with food equal to its food capacity.
- Food capacity is in food units; a person eats 0.75 to 1.25 food a year by their metabolism, 1 at metabolism 0.5 (see "Traits").
- Movement cost limits how far people migrate in a year (see "Migration"). The defence bonus is added to the strength of the civ that held the hex in a fight (see "Contact").

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
- **Start hexes.** A good start hex is land with food capacity 40 or more (coast, plains, forest, and any river hex). The first civ starts on a random good hex. Each next civ starts on a random good hex at least 3 steps from every earlier start; if there is none, on the good hex farthest from the earlier starts (lowest index on ties). With no good hexes at all, any land hex counts as good. On very small land several civs can start on the same hex.
- All of a civ's founders start together on its start hex, each with a random age from 0 to 39, full health (100) and no hunger, no parent, and traits drawn as "Traits" says.
- Every person has an age (years), health (0 to 100), hunger (years in a row without food), a hex, a civ, a parent (the person who bore them; none for founders) and 8 traits.
- Several civs can live in the same hex. When they do, they may fight or people may switch civ (see "Contact").
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
| Strength | A civ's strength in a fight is the sum of its people's strength in the hex (see "Contact"). |
| Aggression | A civ's average aggression in a hex decides whether it starts a fight and the chance it does (see "Contact"). |
| Cooperation | The yearly chance of switching civ is 2% × cooperation (see "Contact"). A gatherer's yield is × (0.5 + cooperation): 0.5 to 1.5, 1 at cooperation 0.5 (see "Gathering and levels"). |

- **Hunger's health loss** in a year without food = round(35 × B × climate), where:
  - the hunger burden B = 1 + 2.8 × (f − 0.5) + 1.2 × (m − 0.5), kept between 0.5 and 3, so fertile, fast-burning people starve faster;
  - the tolerance T(x) = 2 − 2 × x for x up to 0.5, and 1.5 − x above (2 at 0, 1 at 0.5, 0.5 at 1);
  - climate = T(h) × (0.5 + c) in desert, T(c) × (0.5 + h) in tundra and mountain, and 1 on any other terrain.
  For example, with every trait at 0.5 the loss is 35 everywhere; with f = 0.7 and the rest 0.5 it is round(35 × 1.56) = 55.
- **Founders** start at their civ type's values, each plus a random amount from −0.1 to +0.1 (uniform), kept between 0 and 1. Starting values: Aggressive aggression 0.7 and strength 0.65; Cooperative cooperation 0.7; Expansionist fertility 0.58; Isolationist life expectancy 0.6; Nomadic metabolism 0.45, heat tolerance 0.6 and cold tolerance 0.6; every other trait 0.5.
- **Inheritance and mutation.** A child gets each of its parent's traits plus a random amount from −*mutation* to +*mutation* (uniform, drawn separately for each trait), kept between 0 and 1. *Mutation* is a game setting (default 3%, that is ±0.03; see "Game settings"); at 0% children copy their parent exactly.

## Civ types

Each civ has one of 5 types, picked per civ on the setup screen. A type biases the odds on top of each person's own traits: it sets the founders' starting traits (see "Traits") and changes how its people migrate and fight. A person always acts by the type of the civ they belong to now (after switching civ, by their new civ's type).

| Type | What it does differently | Starting traits (others 0.5) |
|---|---|---|
| Expansionist | Moves on early: a fed person sets out (20% a year) once their hex holds more people than 50% of its food capacity, instead of 80%. | fertility 0.58 |
| Aggressive | Always fights any civ it shares a hex with (trigger (a) in "Contact"). | aggression 0.7, strength 0.65 |
| Cooperative | Never starts a fight. Its people switch away to another civ half as often (× 0.5). | cooperation 0.7 |
| Isolationist | Stays home: its people set out only in a year they went hungry (50%), never because the hex is crowded. | life expectancy 0.6 |
| Nomadic | Wanders far: 5 movement points a year instead of 3, and sets out at twice the usual chance (100% when hungry, 40% when fed in a crowded hex). | metabolism 0.45, heat tolerance 0.6, cold tolerance 0.6 |

- The setup screen shows, next to each civ's type picker, the type's explanation: the sentence for that type below, then "Starts with" its starting traits and "other traits 0.5".
  - Expansionist: "Moves on early: its people set out once their hex is half full, long before it is crowded."
  - Aggressive: "Always fights any civ it shares a hex with."
  - Cooperative: "Never starts a fight, and its people leave it for another civ half as often as others do."
  - Isolationist: "Stays home: its people only set out when they go hungry, never because the hex is crowded."
  - Nomadic: "Wanders far: 5 movement points a year instead of 3, and sets out twice as often."
- **Levels by type** (see "Gathering and levels"): Cooperative civs gather 25% more (× 1.25); Nomadic civs need 25% more years at each level (× 1.25); Isolationist civs need 20% fewer years (× 0.8) but 25% more materials (× 1.25). Expansionist and Aggressive civs use the usual numbers.

## A year

Each year (tick) runs these steps in order. Within a step everyone decides first and the results apply together, so the order people are listed in never changes the outcome.

1. **Gathering and levels**, from the state at the end of last year: gathering, levelling up or falling back, Kingdoms enclosing hexes and absorbing the people in them, and food capacities (see "Gathering and levels").
2. **Birthdays.** Everyone's age goes up by 1.
3. **Eating.** Each person needs 0.75 + 0.5 × their metabolism food a year (1 at metabolism 0.5). In a hex with n people whose needs add up to N:
   - If the hex's food is at least N, everyone there eats.
   - Otherwise exactly ⌊food × n ÷ N⌋ of the people there eat, picked at random (every person in the hex has the same chance); the rest go hungry. (With every metabolism at 0.5 that is ⌊food⌋ people.)
   - The hex's food falls by the needs of those who ate, never below 0.
   - A person who eats has hunger 0 and gains 25 health (up to 100). A person who does not eat has hunger + 1 and loses round(35 × B × climate) health (down to 0; see "Traits"); in desert, tundra and mountain a person of a civ at level 3 or higher loses round(35 × B × climate × 0.5) instead (shelter).
4. **Deaths.**
   - **Starvation:** a person whose health is 0 dies. From full health, with a loss of 35 a year, that is the third year in a row without food (sooner with a bigger loss).
   - **Old age:** otherwise, a person whose age has reached their old-age start (35 + 20 × life expectancy, plus 5 years for a civ at level 5) dies with chance min(1, (age − start) ÷ 40) that year. With life expectancy 0.5 the start is 45: 2.5% at 46, 25% at 55, 50% at 65, and certain at 85. Nobody lives past start + 40, at most 95 (100 in a Kingdom).
5. **Births.** Each person who ate this year, aged 16 to 40 (inclusive), in a hex with fewer people (all civs, counted after this year's deaths) than its food capacity, has a child with their birth chance, (2.5% + 5% × f) × (0.75 + 0.5 × m) + 0.5% × (their civ's level − 1) (5% with fertility and metabolism 0.5 at level 1). No partner is needed. The child starts at age 0 with full health and no hunger, in the parent's hex and civ, with that parent recorded and the parent's traits with mutation (see "Traits").
6. **Migration** (see below).
7. **Food regrowth.** Each hex regains food equal to 50% of its food capacity, never above its capacity.
8. **Contact:** fights and switching civ in hexes shared by several civs (see "Contact").
9. **Statistics** for the year are recorded (see "Statistics").
10. **End conditions** are checked (see "End of the game").

## Migration

- A person who went hungry this year sets out with chance 50%.
- A person who ate, in a crowded hex, sets out with chance 20%. A hex is crowded when it holds more people (all civs) than 80% of its food capacity.
- **By civ type** (see "Civ types"): for Expansionist people a hex is already crowded above 50% of its food capacity; Isolationist people who ate never set out; Nomadic people set out at twice the chance (100% hungry, 40% fed in a crowded hex) and have 5 movement points. Aggressive and Cooperative people use the usual numbers.
- **Reach.** A person has 3 movement points a year (Nomadic: 5). Entering a hex costs its movement cost (coast and plains 1, desert and tundra 1.5, forest and hills 2, mountain 3). The hexes in reach are the land hexes that can be reached along a path of land hexes costing no more than their movement points (3, or 5 for Nomadic) in total. Seas and lakes cannot be entered or crossed, except by boat.
- **Boats** (civs at level 4 or higher): a path may also cross one sea or lake hex, which costs 1 movement point. Only one water hex in the whole path, and the path must end on land (a person never stops on water). Any water hex counts, a lake or the sea, the ocean ring at the map's edge included; since the map does not wrap, crossing a ring hex only leads to land that also touches it. So a lake or strait one hex wide can be crossed, but not two water hexes in a row.
- **Spare food** of a hex = the food it will hold after this year's regrowth (food + 50% of capacity, at most the capacity) − the people in it now (after this year's births).
- A person who sets out picks one hex in reach whose spare food is above 0 and above their own hex's spare food, at random, with chances in proportion to each hex's weight. A hex's weight is its spare food, counted twice (×2) if it already holds at least one person of the mover's own civ. With no such hex, they stay.
- **Kingdoms are closed.** A hex enclosed by a Kingdom (see "What levels do") is never in reach for people of any other civ, Kingdoms included: other civs can only take a Kingdom's land from its edge inwards, by fighting.
- Everyone chooses against the same counts (food, people and which civs are in each hex), taken before anyone moves; then everyone who chose moves at once.

## Contact

Checked once a year, after food regrowth, in every land hex where people of 2 or more civs live. Everything is decided against the same counts, taken when the step starts (people, food and who is where); then the deaths, flights and switches apply together.

### Fights

- **Who starts a fight.** For each pair of civs A and B in the hex, civ A attacks B if one of these triggers holds. Cooperative civs never start a fight (they can still be attacked).
  - (a) *Aggressive:* A is Aggressive. It always attacks.
  - (b) *Hunger:* the hex's food is below the total yearly need of the people in it, and A's average aggression there is above 0.5.
  - (c) *Crowding:* the hex holds at least as many people (all civs) as its food capacity, and A's average aggression there is above 0.4.
  - (d) *Numbers:* A has at least 3 times as many people in the hex as B, and A's average aggression there is above 0.45.
  - (e) *Revenge:* A lost a fight to B in the last 20 years (this year minus that year is 20 or less).
  If any of (b) to (e) holds (and A is not Aggressive), A attacks with a chance equal to its average aggression in the hex: one roll per pair, however many of those triggers hold.
- **At most one fight per hex a year.** If several pairs would fight, the fight is between the pair holding the civ with the most people in the hex, and among those the pair whose other civ has the most people (ties go to the lower civ number). If both civs of that pair would attack each other, the attacker is the one that did not hold the hex.
- **The hex holder** is the civ of the two that had more people in the hex at the end of last year; on a tie (for example both just arrived), the one with more people now, then the lower civ number. The holder may be the attacker or the attacked.
- **Strength** of each side = the sum of its people's strength in the hex. The holder's strength is multiplied by 1 + the hex's defence bonus (forest +25%, hills +50%, mountain +100%, otherwise 0%; see "Terrain"). A Kingdom fighting a civ that is not a Kingdom has its strength × 5 (on top of any defence bonus); two Kingdoms fight at their normal strength.
- **Result.** The side with more strength wins; on equal strength the holder wins.
  - The loser loses ⌈20%⌉ of its people in the hex (rounded up, so at least 1), picked at random among them: these are **war deaths**. The rest of the loser's people there flee together to a neighbouring land hex where the winner has no people, the one with the most food left over for its people (food − people, counted when the step starts; on a tie the lower index); if the winner has people in every land neighbour, to the one of them with the most food left over. A hex enclosed by a Kingdom other than the loser is never chosen. With no land neighbour left to choose they stay.
  - The winner loses 5% of its people in the hex, rounded down (a winning group of fewer than 20 loses nobody), picked at random: also war deaths.
  - Other civs in the hex are not involved.
- The winner of each hex's fight this year is kept until the next year's gathering, where it takes the hex's whole yield (see "Gathering and levels"). Fleeing never uses boats.

### Switching civ

- In a shared hex with no fight this year, each person switches civ with a yearly chance of 2% × their cooperation (1% at cooperation 0.5). People of a Cooperative civ switch away with half that chance.
- A person who switches joins one of the other civs in the hex, picked at random in proportion to their people there. They keep their age, health, traits, family line and hex.

## Gathering and levels

Every civ has a level from 1 to 5 and a stockpile of the 9 materials. Every civ starts at level 1 with an empty stockpile.

| Level | Name |
|---|---|
| 1 | Foragers |
| 2 | Farmers |
| 3 | Builders |
| 4 | Organised |
| 5 | Kingdom |

Step 1 of each year (see "A year") works from the state at the end of last year: who lives where (people per civ per hex), who went hungry and last year's fights. It runs in this order: gathering, levelling up or falling back, enclosing and absorbing, food capacities.

### Gathering

- **Secure food.** A civ's food is secure when at most 20% of its living people went hungry last year (hungry × 100 ≤ 20 × its people). A full map always has some hunger, so a stricter rule would stop gathering for good once the land fills up.
- Only a civ with secure food, below level 5, gathers. In each hex it holds it works the hex's deposits of the materials its **next level** still needs (its stockpile is below what that level costs). If the hex has none of those, it works the deposits of materials **any later level** still needs (its stockpile is below what all its remaining levels cost together). If the hex has none of those either, nobody of that civ gathers there.
- **Gatherers.** In each hex it works, 20% of the civ's adults (aged 16 or more) gather, each weighted by 0.5 + their cooperation: gatherers = 20% × the sum of (0.5 + cooperation) over its adults there (exactly 20% of its adults when every cooperation is 0.5). Cooperative civs × 1.25. The gatherers split equally among the deposits the civ works in that hex.
- **Yield.** Each gatherer yields 0.5 a year of a common or uncommon material and 0.125 of an exotic one. One deposit gives at most 10 a year (exotic: 2.5), all civs together: yield = min(cap, gatherers on it × yield per gatherer).
- **Shared hexes.** A deposit's yield is split among the civs working it in proportion to their people in the hex (all their people there, not just the gatherers). If the hex had a fight last year, its winner takes the whole yield of every deposit worked there, whether or not it gathered itself.
- The yield goes into the civ's **stockpile**, which never decays and is spent only on levelling up. Gathering costs no food and takes nobody away from eating or having children.

### Levelling up

Every year each civ that has people adds 1 to its years at its level; then it moves up one level if it meets every requirement below for its next level. The materials are taken from its stockpile and its years at the level start again from 0.

| From → to | Years at the level | Hexes held (% of land per civ) | People per hex needed | Materials spent |
|---|---|---|---|---|
| 1 → 2 Farmers | 150 | 15% | 10 | 80 wood, 30 stone, 30 clay |
| 2 → 3 Builders | 300 | 30% | 12 | 200 wood, 150 stone, 100 clay, 30 copper |
| 3 → 4 Organised | 500 | 50% | 14 | 300 stone, 80 copper, 60 iron, 40 salt |
| 4 → 5 Kingdom | 800 | 75% | 16 | 150 iron, 30 gold, 15 gemstones, 20 spices |

- **Hexes and people** follow the land each civ started with. Land per civ = the map's land hexes (every hex that is not deep water) ÷ the number of civs the game started with. Hexes needed = the percentage above × land per civ, rounded to the nearest whole number (half up), at least 1. People needed = people per hex × the hexes needed. A full map settles at about 22 people per land hex, so the hexes are what a civ has to win; the people only check that its land is settled.
- Examples (hexes / people for levels 2, 3, 4 and 5): the Small world (10 × 10, 64 land hexes, 3 civs) 3/30, 6/72, 11/154, 16/256; 30 × 30 with 630 land hexes and 4 civs 24/240, 47/564, 79/1106, 118/1888; the Large world (50 × 50, 1750 land hexes) with 6 civs 44/440, 88/1056, 146/2044, 219/3504, and with 8 civs 33/330, 66/792, 109/1526, 164/2624.
- Hexes and people are counted at the end of last year.
- **By type:** Nomadic civs need 25% more years and Isolationist civs 20% fewer, rounded up: Nomadic 188, 375, 625 and 1000 years; Isolationist 120, 240, 400 and 640. Isolationist civs spend 25% more materials, rounded up: 100 wood, 38 stone, 38 clay; 250 wood, 188 stone, 125 clay, 38 copper; 375 stone, 100 copper, 75 iron, 50 salt; 188 iron, 38 gold, 19 gemstones, 25 spices.
- The fastest possible climb to Kingdom is 150 + 300 + 500 + 800 = 1750 years (Nomadic 2188, Isolationist 1400).
- **Falling back.** In a year it does not level up, a civ at level 2 or higher whose people are below the people needed to reach its current level (see above) adds 1 to its years below the minimum; otherwise that count goes back to 0. At 100 years in a row it drops one level, keeps its stockpile, and its years at the level start again from 0. To climb back it must meet that level's requirements and spend the materials again.
- A civ that dies out keeps the level it had.

### What levels do

Each level keeps everything from the levels below it.

| Level | Effect |
|---|---|
| Every level above 1 | Birth chance + 0.5 percentage points per level above 1 (+2 points at level 5; see "A year", Births). |
| 2 Farmers | Plains and river hexes + 25% food capacity. |
| 3 Builders | Shelter: hunger's health loss in desert, tundra and mountain is halved, round(35 × B × climate × 0.5). |
| 4 Organised | Boats: migration may cross one sea or lake hex (see "Migration"). |
| 5 Kingdom | Every hex + 25% food capacity (plains and river hexes + 50% in all); old age starts 5 years later; strength × 5 in fights against civs that are not Kingdoms (see "Fights"); encloses hexes, absorbs everyone else in them and closes them to other civs (below). |

- **Food capacity** of a land hex follows the highest level among the civs with people in it at the end of last year: capacity = its level-1 capacity × (1 + 0.25 if that level is 2 or more and the hex is plains or has a river, + 0.25 if that level is 5). An empty hex has its level-1 capacity. When a hex's capacity falls, any food above the new capacity is lost. Capacities are set once a year, in step 1.
- **Enclosed hexes.** After levelling, a land hex with at least one land neighbour is enclosed by a Kingdom when every one of its land neighbours held people of that Kingdom at the end of last year (sea and lake neighbours do not count; the hex itself may hold anyone or nobody). Enclosed by several Kingdoms: the one with the most people (civ-wide), then the lower civ number.
- **Absorbing.** Every person of a civ that is not a Kingdom living in a hex a Kingdom encloses joins that Kingdom, all of them at once, every year. The people absorbed switch civ and keep everything else; they count as switching civ in the statistics. Other Kingdoms' people are never absorbed: one Kingdom can only take another's land by fighting.
- **Closed borders.** No person of another civ (Kingdoms included) can migrate into an enclosed hex or flee into one after a fight (see "Migration" and "Fights"). So a Kingdom can only be broken from its edge inwards.
- Alliances and organised war (planned for level 4) are not in the game yet.

## Statistics

Recorded at the end of every year, for each civ: people alive, hexes held (hexes with at least one of its people), level, births, deaths by old age, deaths by starvation, war deaths, the total age at death of those who died, and the average of each of the 8 traits over its living people (none while it has nobody). When history rows are merged, the trait averages and the level come from the later year, like people and hexes.

- Kept for the whole run: total births and deaths by cause (old age, starvation, war), fights fought (as attacker or attacked) and fights won, people who switched into and out of the civ (Kingdoms absorbing included), the first year the civ reached each level, its stockpile, average lifespan (average age at death, war deaths included), oldest age reached, peak population and the first year it was reached, most hexes held, and the year the civ died out (its people fell to 0), if it did.
- **Extinction cause:** what a civ died out of is the cause with the most of its deaths in the year it died out (on a tie: old age, then starvation, then war), or switching if none of its people died that year (the last ones switched civ).
- The yearly history keeps one row per year for the first 8192 rows. When it is full, pairs of rows are merged (people and hexes from the later year, the other numbers added together) and each new row covers twice as many years, so a long game never runs out of memory.
- **Family lines.** Every person has a generation: founders are generation 1, and a child is its parent's generation + 1. Every person also belongs to the line of the one founder they descend from.
- **Records** kept for the whole run (shown on the end screen):
  - *Oldest person ever:* the highest age anyone reached, alive or dead (on a tie, whoever reached it first; among the living, the lowest id).
  - *Oldest alive at the end:* the oldest living person when the game ends (on a tie, the lowest id).
  - *Longest family line:* the highest generation anyone reached, with the first person born into it and the founder at the head of their line.
  - *Most descendants:* the founder with the most people born into their line (children, grandchildren and so on, alive or dead). It is always a founder, because a parent counts every descendant of their child plus the child. On a tie, the lower founder id. None if nobody was born.
  - *Worst famine:* the famine with the most starvation deaths (on a tie, the one that ended first). A **famine year** for a civ is a year in which its starvation deaths are at least 1% of its people at the start of that year, and at least 5. Famine years of the same civ in a row make one famine, from its first to its last year. A famine still going on when the game ends counts up to the last year.
- **History log:** the key events with their year, kept for the whole run. Checked once a year, at the end of the year:
  - each famine (civ, first and last year, starvation deaths);
  - each fight (year, hex, attacker, the civ attacked, the hex holder, winner, and war deaths on both sides together);
  - **first contact:** the first year two civs have people in the same hex, once per pair, with that hex (the lowest-index one if they share several);
  - **milestones:** the first year each civ has at least 100, 500 and 1,000 people, once each;
  - **peak:** once a civ has had fewer people than its peak for 50 years in a row, its peak (the most people it ever had, from year 0, and the first year it had them) and its first year below that peak. One entry per civ: if it later sets a higher peak and again stays below it for 50 years, the entry moves to the new peak;
  - **most hexes:** the most hexes each civ ever held and the first year it held that many (added when the log is shown, so it covers the whole game);
  - each extinction (civ, year).
  Famines and fights are logged while the log holds fewer than 2048 events minus one per civ; after that, later famines and fights are left out (and counted). First contacts, milestones, peaks, most hexes and extinctions are always kept.
- While the game runs, the statistics sheet shows each civ's emblem, name, type and level, people and hexes held; the top bar shows the total population, how many civs are still alive, and each civ's emblem with its people alive. Tapping a hex shows its people per civ (see "How civs and people look").
- **Levels in the sheet:** for each civ, its level and name, whether it is gathering (food secure) or not, and for its next level each requirement with a progress bar and "have / need": years at its level, people, hexes held and each material that level spends (stockpile rounded down to one decimal). Then the civ's whole stockpile (materials above 0). A civ below its level's minimum people shows how many of the 100 years it has been below. Kingdoms show "the top level"; civs that died out show "Died out".
- **What levels and materials do:** a tap-to-open guide under the levels: when a civ gathers and how much, the requirements of every level (hexes and people worked out from the land per civ in play), what each level does (birth chance, food capacity, shelter, boats, later old age, Kingdom strength, enclosed hexes and closed borders), each material's yield, yearly cap and the levels that spend it, and how civ types change levelling. Its numbers are the ones in "Gathering and levels".

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
- **Tap a hex** to see its terrain, food, deposits, who gathered there this year (each civ with the materials it worked, its gatherers to one decimal and the amount it got; a fight's winner that took the yield without gathering reads "won the yield in a fight"; "Nobody" otherwise) and its people per civ with each civ's emblem. Zoomed out (people not drawn), the tap also flies the camera to that hex over 0.4 seconds: the hex ends centred in the open map area, zoomed in until a hex is 180 pixels across (less if the view cannot zoom that far, but always at least far enough to show people). Panning, zooming or Fit during the flight stops it. *List people* opens the list of the people in the hex, lowest id first (the first 100, then how many more); tap a row to open that person.
- **Tap a person** (zoomed in; the nearest person within 22 pixels of the tap) to see their id, civ, age, health, hunger, parent (their id, or none for founders; "died" if the parent is no longer alive), their living children, the hex they are in, and their 8 traits (two decimals). Tapping the same person again closes the card. If the person dies while the card is open, it shows "Died" with the last values seen.

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
| Civ types | Civ 1 Expansionist, Civ 2 Aggressive, Civ 3 Cooperative (a new civ gets, by its number, Expansionist, Aggressive, Cooperative, Isolationist, Nomadic, then again from Expansionist) | one of the 5 types per civ |
| Starting population | 20 people per civ | 2 to 200 |
| Mutation | 3% (each trait of a child moves by up to ±0.03 from its parent's) | 0% to 10%, whole percent |
| End conditions | none ticked (Sandbox: no end) | any combination of Last civ standing, First to Kingdom, Dominance, Year limit; ticking none is Sandbox |
| Dominance share | 60% of land hexes | 25% to 100%, whole percent |
| Dominance years | 300 | 10 to 10000 |
| Year limit | 2500 (choices 1000, 2500, 5000, 10000, or custom) | 10 to 100000 |

Out-of-range values are clamped to the range; values that are not numbers fall back to the default. Unknown end conditions are ignored, and anything that is not a list of end conditions means Sandbox. The civ count decides how many civs there are; a missing or unknown type takes the default type for that civ's number.

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
  - *Civs by final population* (most people first; ties by higher peak population, then lower civ number): people at the end, type, level at the end and the year it reached it, peak population and the first year it was reached, average lifespan (average age at death; "No deaths" if none died), most hexes held at once, fights (and how many won), war deaths, people switched in and out, and the year the civ died out (or No).
  - *Population over time:* one line per civ in its colour, from year 0 to the last year, all on the same scale (the top of the chart is the highest population any civ reached in the recorded history). It draws at most 400 points per civ, taken evenly from the recorded rows, plus the last row.
  - *Level over time:* one step line per civ in its colour, level 1 Foragers at the bottom to 5 Kingdom at the top, from year 0 to the last year, sampled like the population chart; civs on the same level are drawn a hair apart so each stays visible. Below it, the year each civ first reached each level ("stayed Foragers" if it never climbed).
  - *Stockpiles at the end:* each civ's stockpile of every material any civ still holds, rounded down to one decimal ("Nobody gathered anything" if none).
  - *Traits:* for each civ that ever had people, the average of each of the 8 traits at the end (or in its last year with people, if it died out), to two decimals, with the change since its founders' averages at year 0.
  - *People:* the oldest person ever (id, civ, age, and the year they died or "alive") and the oldest person alive at the end (see "Records" under "Statistics").
  - *Deaths by cause:* deaths by old age, by starvation and in war over the whole run, all civs together, with their share of all deaths.
  - *Records:* longest family line, the person with the most descendants, and the worst famine (see "Statistics").
  - *History:* the history log, oldest first (by first year; on the same year famines, then first contacts, fights, milestones, peaks, most hexes, extinctions, then by civ number (the attacker's for a fight, the lower one for a first contact)). A fight reads "Civ A attacked Civ B at (column, row); Civ W won; N killed"; a first contact "Civ A met Civ B at (column, row)"; a milestone "Civ A passed 100 people"; a peak "Civ A peaked at N people; fewer from year Y"; most hexes "Civ A held its most hexes: N".

## Not in the game yet

Land degrading, organised war and alliances, god powers. See [project/ROADMAP.md](project/ROADMAP.md).
