# Questions

How to use this file: answer a question by writing after its "Answer:" line (a number, or anything in your own words). Decide a proposal by writing after its "Decision:" line: yes, no, later, or the changes you want. Add your own requests or rule changes under "Requests" at any time, one bullet each. The director picks all of these up on its next cycle, turns them into tasks, and moves them to "Answered".

## Open

### Q-006: What numbers should the 8 traits use?
- Date: 2026-10-11
- Why it matters: Q-004 settled 8 inherited traits with mutation (T-021), but not how a trait value turns into a birth chance, a lifespan or a food need, nor each civ type's starting values. Today everyone has a 5% birth chance, old age from 45, and eats 1 food a year.
- Options:
  1. Each trait 0 to 1, with 0.5 giving today's values: fertility 0→2.5%, 1→7.5% birth chance; life expectancy shifts old age start 35 to 55; metabolism 0.75 to 1.25 food a year; heat tolerance halves to doubles starvation health loss in desert, cold tolerance the same in tundra and mountain; strength, aggression and cooperation 0 to 1 used by fights and switching. Founders start at their type's values (Aggressive: aggression 0.7, strength 0.65; Cooperative: cooperation 0.7; Expansionist: fertility 0.6; Isolationist: life expectancy 0.6; Nomadic: metabolism 0.4; all else 0.5) with ±0.1 random spread. Mutation: each trait ±3% a birth (setup option 0% to 10%).
  2. Same as 1 but narrower effects (fertility 4% to 6%, old age 40 to 50): civs differ less, drift matters less.
  3. Same as 1 but no type starting values: every civ starts at 0.5 and only terrain and mutation make them differ.
- Recommendation: 1, it keeps today's balance at 0.5, gives each type a visible starting identity, and the director tunes the numbers from headless runs (asking you before moving any by more than half).
- Answer: add your own numbers so to be realistic and balanced and then initialize a new, one-time agent to review the proposed agents and balance them out. only after teh new agent balances out the numbers, create the task for the dev. (reading: the director picks realistic, balanced trait numbers itself, using option 1's shape as a starting point. A separate one-time reviewer agent ("review the proposed agents" read as "review the proposed numbers") then checks and rebalances them, for example with headless runs. Only after that review does the director create the game-dev task. The final numbers go into RULES.md with the change.)

### Q-007: How do Cooperative and Nomadic behave, which types always fight, and how does a fight work?
- Date: 2026-10-11
- Why it matters: Blocks T-022 (civ types) and T-023 (fighting, R-004). Your summary leaves Cooperative and Nomadic undefined and says "some civs fight anyway" without naming them.
- Options:
  1. Cooperative: never starts fights, its people switch civ half as often as they would join it, gathers 25% faster (from R-006). Nomadic: 5 movement points instead of 3, and sets out at twice the usual chance. Aggressive always fights when sharing a hex; others fight only when the hex is short of food and one side's average aggression is above 0.5. A fight: each side's strength = sum of its people's strength, defenders (the civ with more people there last year) get the hex's defence bonus; the weaker side loses 20% of its people in the hex (war deaths) and the rest flee to a neighbouring hex; the stronger side loses 5%.
  2. As 1, but Aggressive and Expansionist both always fight.
  3. As 1, but fights only cause fleeing, no deaths (a gentler game; war deaths appear only with L4 organised war).
- Recommendation: 1, it gives each type one clear trait the player can see, keeps fights local and rare when food is plentiful, and uses the defence bonuses already in the terrain table.
- Answer: let's go with 1 (reading: option 1 as written, Cooperative never starts fights, Nomadic moves further, Aggressive always fights when sharing a hex, fights as described; no separate reviewer step asked for this one)

### Q-008: What numbers should gathering and level effects use?
- Date: 2026-10-11
- Why it matters: Blocks T-025. R-006 gives deposit chances and level thresholds but not the yield per gatherer, the hex cap, when food counts as "secure", or what each level actually does (how much more food at L2, how much longer life at L5, the birth bonus).
- Options:
  1. A common deposit yields 0.5 a gatherer a year, capped at 10 a hex a year (exotic 0.125 and 2.5); food is secure when nobody in the civ went hungry last year and its hexes hold at least 1.2 food per person; then up to 20% of its adults gather. Effects: birth chance +0.5 percentage points a level above 1; L2 plains and river hexes +25% food capacity; L3 desert, tundra and mountain hunger loss halved; L4 boats (can migrate across one sea or lake hex), alliances later; L5 all hexes +25% food capacity, old age starts 5 years later, may absorb a civ it shares hexes with when that civ is smaller.
  2. Same effects as 1, but yields twice as high (faster levels, about 900 years to Kingdom instead of 1,750+).
  3. Same yields as 1, but smaller level effects (+10% food, birth +0.25 points): levels matter less, populations stay closer together.
- Recommendation: 1, it keeps your 1,750-year fastest path to Kingdom realistic on a 10 × 10 map, and the director checks it with headless runs before release.
- Answer: agreed. (reading: option 1, as recommended)

## Proposals

Ideas the director draws from headless simulation runs and the code. At most 6 wait here at a time.

### P-007: Show every civ in a shared hex, not just the largest
- Date: 2026-10-11
- Category: visuals
- What: Zoomed out, a hex shows only the emblem of its largest civ, so a hex where three civs live side by side looks like one civ owns it. Draw up to three small emblems per hex (largest first, a "+" when there are more), or a thin ring around the count split by each civ's share, so you can see at a glance where civs mix, which is also where contact and fights (T-023) will happen.
- Evidence: Headless runs of seeds review-20261011c-1 to -3 on claude/cycle-20261011-0807 at c6150dc, default setup, 400 years: the 3 civs hold 106, 128 and 147 hex-slots on 64 land hexes (1.7 to 2.3 civs per hex on average), even with the new own-civ pull. src/render/peopleLayer.js:228-246 picks one civ per hex (the largest) and draws only its emblem.
- Effort: S
- Phone performance risk: low: two more sprites per populated hex from the same atlas, updated only when the yearly counts change.
- Decision: ring version. also include a bold ring circling ALL hexes each civ occupies, showing it as one larger area consisting of many hexes. (reading: yes, with changes. Each hex shows a thin ring around its count, split by each civ's share. On top of that, every civ gets a bold outline in its colour around the outer edge of all the hexes it occupies, so its territory reads as one area. Because civs share hexes, these outlines can overlap.)

## Requests

## Answered

### Q-003: What goes into version 1.0?
- Date: 2026-10-11
- Why it matters: The roadmap puts people in Phase 2 and civ types, traits and mutation in Phase 3. You call Phase 2 "version 1.0, with civilizations in it", so 1.0 needs a clear line. Tasks T-013 to T-017 (people, migration, people on screen, stats) are already planned for Phase 2.
- Options:
  1. 1.0 = Phases 2 and 3 together: people, births, deaths, migration, plus 5 civ types (expansionist, cooperative, nomadic, isolationist, aggressive) biasing behaviour and inherited traits with mutation. Contact, war and levels stay for later. Bigger release, several cycles before it ships.
  2. 1.0 = Phase 2 plus civs as named, coloured groups with a type, but no traits or mutation yet (those come in 1.1). Ships sooner; civs differ only by type.
  3. Keep the roadmap: 1.0 = people only (Phase 2); civ types, traits and mutation are 1.1.
- Recommendation: 1, because civs without traits all behave alike and a population sim feels empty without visible differences between groups; we can still ship it in reviewed steps (one release candidate per step) before calling it 1.0.
- Answer: see the owner's civ design summary below (reading: option 1, all 5 civ types with traits and mutation in 1.0, plus basic fighting from the owner's request R-004; levels 1 to 5 and materials are described in the summary but not explicitly placed in 1.0, so they stay in a later phase unless the owner says otherwise. Follow-up 2026-10-11 07:33 UTC: "civ levels 1-5 should be in 1.0", with materials and level-up rules as given in R-006. The director turns the "not defined yet" list into questions or proposals.)
  Owner's civ design summary (given as the answer to Q-003 and Q-004):
  - How it works: a civ type is a behaviour bias layered on top of each person's own inherited traits. People differ inside the same civ; the type only pushes the odds.
  - Types (5): Expansionist migrates early, before its hex gets crowded. Isolationist stays put until starving (decided). Aggressive is one of the types that fight regardless of food ("some civs fight anyway" agreed, but not which). Cooperative and Nomadic: name only, no behaviour defined yet.
  - Per-person inherited traits (copied from the parent with small random mutation): fertility (chance of a birth each year), life_expectancy (base lifespan, shifted by terrain, hunger, health), strength (combat), aggression (likelihood to fight), cooperation (likelihood to coexist or switch civ), metabolism (food needed per year), heat_tolerance (survival in desert and hot terrain), cold_tolerance (survival in tundra and mountains). Life state: age, health, hunger, hex, civ, parent.
  - Civ-level: level 1-5 civ-wide (L1 Foragers gathering only; L2 Farmers more food from plains and rivers; L3 Builders shelter, harsh terrain survivable; L4 Organised alliances, organised war, boats; L5 Kingdom higher hex capacity, longer life, can absorb a co-living civ). Levelling: spend materials plus enough years at the current level. Birth bonus: higher level raises every member's yearly birth chance. Materials gathered from forest and hills.
  - Contact rules (all types): plenty of food leads to coexistence; scarcity plus aggressive people leads to fights; some types fight regardless (which ones: open). Co-living people can switch civ (the only way civs blend, since births need no partner).
  - Not defined yet: starting trait averages per type (e.g. aggressive = high aggression and strength); behaviour for Cooperative and Nomadic; which types always fight; all numbers (rates, thresholds, capacities). These should come back as director questions.
- Moved: 2026-10-11, tasks T-021 to T-030 (1.0 = people, 5 civ types, 8 traits with mutation, contact and basic fighting, materials, levels 1 to 5, end conditions and end screen; ROADMAP updated). Undefined numbers and behaviours asked as Q-006, Q-007, Q-008

### Q-004: How should traits and mutation work?
- Date: 2026-10-11
- Why it matters: Traits drive births, deaths and migration, and mutation decides whether civs drift apart over centuries. The roadmap lists 8 traits (fertility, life expectancy, strength, aggression, cooperation, metabolism, heat tolerance, cold tolerance).
- Options:
  1. All 8 traits, each 0 to 1 around a civ-type starting value; a child copies its parent with a small random nudge (mutation rate a setup option, default about ±3% a trait). Rich drift; terrain picks winners (cold tolerance thrives in tundra).
  2. 4 traits only (fertility, life expectancy, aggression, metabolism), same mutation. Easier to read in the inspector and on the end screen.
  3. All 8 traits but no mutation: children copy parents exactly. Civs never change, only their mix of people does.
- Recommendation: 1, it is what the roadmap describes and gives the long-run story (civs adapting to their land); the inspector can show the 8 as small bars.
- Answer: see the owner's civ design summary under Q-003 (reading: option 1, all 8 inherited traits copied from the parent with a small random mutation, as recommended)
- Moved: 2026-10-11, tasks T-021, T-030; trait numbers asked as Q-006

### Q-005: How should civs and people look on the map?
- Date: 2026-10-11
- Why it matters: People are drawn as sprites from one texture only when zoomed in (CLAUDE.md), so zoomed out the map needs another way to show who lives where.
- Options:
  1. Each civ gets a colour; zoomed out, hexes get a tinted border or corner flag in the colour of their largest civ and a small population number; zoomed in, people are dots in civ colour that walk between hexes.
  2. Each civ gets a colour and a simple emblem (shape: circle, square, triangle…); zoomed out, emblem plus number per hex; zoomed in, people are tiny emblems. Readable for colour-blind players.
  3. Zoomed out, hexes are shaded by population density (no civ colours); civ colours only when zoomed in.
- Recommendation: 2, the shape keeps civs apart for colour-blind players and on small phone screens, at the same cost as option 1 (one texture atlas).
- Answer: color plus a shape (reading: option 2, a colour and a shape emblem per civ, as recommended)
- Moved: 2026-10-11, tasks T-015 (unblocked), T-020

### P-003: Make the water slider's dead zone visible
- Date: 2026-10-11
- Category: UI
- What: Since water counts against the whole map, the low end of the Water slider does nothing on small maps: on 10 × 10 every setting from 0% to 36% gives the same map (just the ocean ring). Either start the slider at the edge ring's share for the current size, or show "ocean ring only" next to the value while it is in that range, so moving the slider always means something.
- Evidence: Headless runs of seeds review-20261011-1 to -3 on claude/cycle-20261011-0006 at 442a0e6, default setup, 400 years: deep water is exactly 36 on every seed (the 4 × 10 − 4 ring), so the default 25% is already inside the dead zone. RULES.md "How the map is made" step 2; slider range from LIMITS.water in src/ui/mapgenScreen.js:106. On 50 × 50 the ring is 196 hexes (7.8%).
- Effort: S
- Phone performance risk: low: a label or a slider bound recalculated when the size changes.
- Decision: ignore this suggestion (reading: no)
- Moved: 2026-10-11, tasks none (no)

### P-004: Shade each hex slightly by its height
- Date: 2026-10-11
- Category: visuals
- What: Every hex of one terrain is drawn in exactly the same flat colour, so plains or forest read as a single block. Lightening or darkening each land hex by a few percent from its elevation (and sea hexes by depth) would show the shape of the land, ridges and valleys, without changing any rule.
- Evidence: src/render/palette.js:4-13 has one colour per terrain and hexRgb (src/render/palette.js:24-26) returns it unchanged; src/render/renderer.js setMap fills each hex with that colour. On the three review seeds the 64 land hexes use only 7 colours (e.g. seed review-20261011-1: 17 coast, 12 plains, 9 forest hexes, each block one flat tone). Elevation is already computed in src/sim/mapgen.js but not kept on the map.
- Effort: S
- Phone performance risk: low: colours are baked once when the map is built; no per-frame cost.
- Decision: agreed (reading: yes)
- Moved: 2026-10-11, tasks T-018, T-020

### P-005: Let people prefer hexes their own civ already holds
- Date: 2026-10-11
- Category: gameplay
- What: Today a migrant picks a new hex only by spare food, ignoring who lives there, so after a few centuries every civ is spread over most of the island and no civ has a homeland. Giving migrants a pull toward hexes where their own civ already lives (for example, spare food counted double there) would let civs form territories with borders, which Phase 4 contact and war can build on.
- Evidence: Headless runs of seeds review-20261011b-1 to -3 on claude/cycle-20261011-0405 at 1656249, default setup, 400 years: the 3 civs together hold 146, 143 and 131 hex-slots on 64 land hexes (seed -1: civ 1 in 44, civ 2 in 47, civ 3 in 55), so almost every hex is shared. src/sim/migration.js:91-119 weights targets only by spare food; civ is never read.
- Effort: S
- Phone performance risk: low: one per-civ count per hex in the existing migration snapshot, no new loops per person.
- Decision: approved (reading: yes)
- Moved: 2026-10-11, tasks T-019, T-020

### P-006: A food abundance setting, lower on big maps, to keep people in the thousands
- Date: 2026-10-11
- Category: scale
- What: Add the roadmap's "food abundance" setup option (a multiplier on every hex's food capacity, default 100%) and set it lower in the Large world and Continent presets, so a 50 × 50 world settles at a few thousand people instead of tens of thousands and stays smooth on a phone.
- Evidence: Headless run of seed review-20261011b-1 with the Large world preset (50 × 50, 6 civs × 40) on 1656249: 2,147 people at year 250, 12,598 at 500, 28,116 at 750, 35,072 at 1000, still rising; 770 ticks/s in Node for the whole run, about 330 ticks/s at the plateau (game-dev's measurement). CLAUDE.md targets "a few thousand people" on a mid-range iPhone; 20× speed needs 160 ticks/s. The default 10 × 10 map is fine (1,323 to 1,405 people at year 400).
- Effort: S
- Phone performance risk: low: it lowers the work per tick; the setting itself costs nothing at run time.
- Decision: ignore for now (reading: later)
- Moved: 2026-10-11, tasks none (later; may come back once with new evidence)

### R-003: Add an option on the setup screen to add and remove civs, and to pick each civ's type from the defined types (owner, 2026-10-11 07:19 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-022, T-030 (types need Q-007)

### R-004: Introduce a basic set of fighting mechanics (owner, 2026-10-11 07:19 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-023, T-030 (fight rules asked as Q-007)

### R-005: Add a home page where the owner can start a new game or read the rules, explained in human-readable, compelling language that follows RULES.md. It should look fabulous and include in-game screens explaining how the game works (owner, 2026-10-11 07:19 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, task T-028

### R-006: Materials and level-up rules for 1.0, replacing the current level rules (owner, 2026-10-11 07:33 UTC: "civ levels 1-5 should be in 1.0. here's the breakdown needed for 1.0"). Owner's spec:
- Date: 2026-10-11
- Spec:
  - MATERIALS. Each land hex rolls for material deposits at map generation. Deposits never run out. Each one yields a fixed amount per gatherer per year, capped per hex.
  - Chance a hex has it (%), by terrain (terrain not listed = 0):
    - Common: Wood: forest 95, hills 40, river 40, plains 20, tundra 15, coast 10. Stone: mountain 90, hills 70, tundra 30, desert 25, coast 15. Clay: river 70, coast 40, plains 30, forest 10.
    - Uncommon: Copper: mountain 25, hills 20, desert 8. Iron: mountain 20, hills 15, tundra 10. Salt: desert 30, coast 25.
    - Exotic: Gold: river 5, mountain 4, hills 2. Gemstones: mountain 3, desert 2. Spices: desert 3, coast 2.
  - Every map has at least one deposit of each exotic material; the generator re-rolls until it does. Kingdom is always reachable, but contested.
  - Exotic deposits yield about a quarter of what a common one does.
  - Gathering: each year adults split between food and materials. A civ sends people to materials only while its food is secure, favouring what its next level needs.
  - Shared hexes split the yield by headcount. If the civs in a hex fight that year, the winner takes the whole yield.
  - The stockpile is civ-wide, never decays, and is spent only on levelling.
  - Cooperative civs gather 25% faster; each person's cooperation trait raises their own gathering.
  - LEVELS (thresholds for a 10x10 map; population and hexes scale with map size). Columns: years at level, min pop, min hexes, materials spent.
    - L1 -> L2: 150 years, 40 pop, 4 hexes, 80 wood, 30 stone, 30 clay.
    - L2 -> L3: 300 years, 100 pop, 8 hexes, 200 wood, 150 stone, 100 clay, 30 copper.
    - L3 -> L4: 500 years, 200 pop, 14 hexes, 300 stone, 80 copper, 60 iron, 40 salt.
    - L4 -> L5: 800 years, 350 pop, 22 hexes, 150 iron, 30 gold, 15 gemstones, 20 spices.
  - Fastest possible path to Kingdom: 1,750 years.
  - Nomadic needs 25% more years per level, but migrates further.
  - Isolationist needs 20% fewer years but 25% more materials.
  - Falling back: if population stays below the current level's minimum for 100 years, the civ drops one level and keeps its stockpile.
  - All numbers are starting values. Tune them from the headless sims, and ask the owner before changing any requirement by more than half.
  - (reading: this replaces the RULES.md Terrain table's "Materials" column (forest 30 wood, hills 20 stone, others 0). In RULES.md a river is not a terrain but runs through a land hex; "river" chances are read as applying to river hexes in addition to their terrain's own chances. Owner confirmed 2026-10-11 07:35 UTC: "that's right", so a river hex rolls both its terrain's chances and the river chances.)
- Moved: 2026-10-11, tasks T-024, T-025, T-029, T-030 (missing numbers asked as Q-008)

### R-007: End conditions and end screen, replacing the current end-condition and end-screen rules (owner, 2026-10-11 07:44 UTC). Owner's spec:
- Date: 2026-10-11
- Spec:
  - END CONDITIONS (setup screen; tick any combination, the first one met ends the run):
    - Last civ standing.
    - First to Kingdom: a civ reaches L5 and stays at L5 for 200 years.
    - Dominance: one civ holds at least X% of land hexes for Y years (defaults 60% and 300 years, both settable).
    - Year limit: 1,000 / 2,500 / 5,000 / 10,000 or custom, default 2,500. No score and no winner: the run simply ends.
    - Sandbox: no end.
    - Total extinction always ends the run.
    - The pause menu has an "End now" button that goes straight to the end screen.
  - END SCREEN (mobile, scrollable). Header: winner (or none), end reason, years run. Buttons: Keep watching (continues as sandbox), Same settings again, New map, Back to setup.
  - Cards:
    - Civs, listed by final population: peak population and year, average lifespan, highest level and year reached, peak hexes held, materials gathered by type, wars fought and won, people gained and lost by switching civ, extinction year.
    - Charts: population over time per civ, level over time per civ, trait drift (each trait's average over time, per civ).
    - People: oldest person ever, oldest alive at the end.
    - Deaths: old age, starvation, war, disaster, plus god powers as a separate category when they were used.
    - Records: longest family line, person with the most descendants, deadliest war, worst famine, most fought-over hex.
    - History log: key events with their year (first contact, level-ups and drops, wars, absorptions, famines, extinctions). Key events only, not every death.
  - Nothing is saved between sessions. "Same settings again" reuses the settings held in memory. Record yearly stats and events during the run so the end screen opens instantly.
  - (reading: part of 1.0, alongside levels and fighting. It replaces RULES.md "End of the game" (end condition options None and Year limit, default None, no end screen) and the roadmap's "year limit with score". Which conditions are ticked by default is not stated, so the current default, no end (sandbox), stays. Disaster deaths and the god-power category appear only once those features exist.)
- Moved: 2026-10-11, tasks T-026, T-027, T-029 (First to Kingdom comes with T-025)

### Q-001: Should coast be walkable land or shallow water?
- Date: 2026-10-10
- Why it matters: The Phase 1 build makes coast a walkable land terrain (land next to the sea, food 50, move 1). Shallow water instead would shrink usable land and make boats (level 4) matter more.
- Options:
  1. Keep coast as land: no change; coasts are good early land.
  2. Make coast shallow water, impassable until boats: smaller islands, sea travel matters more.
  3. Make coast shallow water that is walkable at a high movement cost: wading across narrow straits.
- Recommendation: 1, because it matches the roadmap (only seas and lakes are impassable) and gives the first civs fertile starting land.
- Answer: yes (reading: option 1, keep coast as walkable land, as recommended)
- Moved: 2026-10-11, tasks none (coast stays walkable land; no change needed)

### Q-002: Should the terrain mix be adjustable at map generation?
- Date: 2026-10-10
- Why it matters: Hills (15% of land), tundra (15%), desert (15%) and forest (30%) are fixed numbers today; only water, mountains and rivers are settings.
- Options:
  1. Keep the fixed shares: simpler map screen.
  2. Add a "climate" slider (cold/dry ↔ wet/warm) that shifts tundra, desert and forest together: one more control.
  3. Add separate sliders for forest, desert and tundra: full control, busier screen on a phone.
- Recommendation: 2, one slider gives varied worlds without crowding the phone screen.
- Answer: 3 (reading: separate sliders for forest, desert and tundra, not the recommended single climate slider)
- Moved: 2026-10-11, tasks T-010, T-011

### P-001: Count the default water share against the whole map
- Date: 2026-10-10
- Category: scale
- What: On the default 10 × 10 map, more than half the hexes are sea, leaving about 48 land hexes. Counting "water 25%" against all hexes (edge ring included), or making the default size larger, would give the first civs room to spread in Phase 2.
- Evidence: Headless runs of seeds review-20261010-1 to -3 at commit 7216673 (cycle branch), default setup, 400 years: deep water 52 of 100 on every seed. That is 36 forced edge hexes (src/sim/mapgen.js:80-86) plus 25% of the 64 inner hexes. Desert and tundra are only 2–3 hexes each.
- Effort: S
- Phone performance risk: low: map generation only; a larger default size adds hexes to draw, still far below 50 × 50.
- Decision: add slider for the water coverage as well against the whole map, like we said before about the tundra, desert, fertile etc. (reading: yes, option 1. The existing water slider counts against all hexes, edge ring included, which changes the RULES.md rule "water amount = 25% of the non-edge hexes". Default stays 25% and size stays 10. A setting below the edge ring's share gives just the edge ring. It works like the separate terrain sliders from Q-002.)
- Moved: 2026-10-11, tasks T-010, T-011

### P-002: Gentle water animation so the map is not frozen
- Date: 2026-10-10
- Category: animation
- What: A slow shimmer or tide tint on sea and river hexes so the map visibly lives while time runs, even before people exist.
- Evidence: The map is built once into static Graphics (src/render/renderer.js:1, 44-58). In 400-year headless runs of all three review seeds, the state hash changes only with the year and every hex keeps full food, so nothing on screen changes except the HUD year.
- Effort: M
- Phone performance risk: medium: an animated layer redraws every frame; it needs a single shader or tinted overlay, not per-hex Graphics updates.
- Decision: yes (reading: build the water shimmer as proposed, as one shader or tinted overlay)
- Moved: 2026-10-11, tasks T-012, T-011

### R-001: Add a plains (fertile land) share slider next to the forest, desert and tundra sliders from Q-002
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-010, T-011

### R-002: Start planning Phase 2 ("version 1.0") with civilizations: civ types, traits, mutations, their concepts and visuals
- Date: 2026-10-11 00:29 UTC
- Moved: 2026-10-11, planned as questions Q-003 (what 1.0 contains), Q-004 (traits and mutation) and Q-005 (how civs and people look); Phase 2 tasks T-013 to T-017 already seeded and get extended once these are answered
