# Questions

How to use this file: answer a question by writing after its "Answer:" line (a number, or anything in your own words). Decide a proposal by writing after its "Decision:" line: yes, no, later, or the changes you want. Add your own requests or rule changes under "Requests" at any time, one bullet each. The director picks all of these up on its next cycle, turns them into tasks, and moves them to "Answered".

## Open

### Q-009: Should a civ keep gathering when a few of its people go hungry?
- Date: 2026-10-11
- Why it matters: Levels need materials, and a civ gathers only while its food is "secure" (Q-008 option 1: nobody in the civ went hungry last year). Once a civ fills its land, someone in it goes hungry almost every year, so it stops gathering for good. In headless runs no civ got past L3, so Kingdom and the First to Kingdom ending are out of reach.
- Evidence: seeds review-20261011f-1 to -3 at b52df73, default setup, 400 years: the largest civ on each seed (1,570, 1,035 and 956 people) is "food not secure" at year 400. On seed review-20261011e-1 over 3,000 years, Civ 1 reached L3 in year 477 and stayed there for 2,500 years with about 1,770 people, unable to gather the copper it needed.
- Options:
  1. Secure when at most 5% of the civ's people went hungry last year (the 1.2 food per person rule stays): big civs keep gathering, and levels 4 and 5 become reachable. The director checks with headless runs that Kingdom takes about 1,750 years or more.
  2. Judge each hex instead of the whole civ: a hex where nobody went hungry last year may send its 20% to gather. Crowded hexes stop, the rest of the civ carries on.
  3. Keep the rule as it is: levels 4 and 5 stay very rare.
- Recommendation: 1. It is the smallest change, keeps "food first" in spirit, and makes your 1.0 level ladder reachable.
- Priority: P1 (suggested; stands unless the owner changes it)
- Answer:

### Q-010: The hunger and crowding fight triggers almost never fire. Change them?
- Date: 2026-10-11
- Why it matters: The rules (and How to play) say civs fight when a shared hex is short of food or crowded, but the one-time fight certifier found these two triggers start almost no fights. Fights come from Aggressive civs, revenge and 3-to-1 numbers instead, so "scarcity leads to fights" from your design is mostly not happening.
- Evidence: certifier runs at b52df73, default setup: of 23,349 shared hex-years, the hex was short of food in 1,606 (7%) and at capacity in 35 (0.15%). Of 12,506 fights, about 23 came from hunger alone and about 10 from crowding. The check runs after food regrows (src/sim/contact.js), when hexes look full of food. Someone in the hex had gone hungry that year in 39% of shared hex-years.
- Options:
  1. Hunger trigger fires when someone in the hex went hungry this year (instead of food below need after regrowth); crowding when the hex holds at least 80% of its food capacity. Scarcity becomes a real cause of war; more fights overall, which the director checks for extinctions with headless runs.
  2. Only the hunger change from option 1; crowding stays as it is.
  3. Keep them as they are and reword RULES.md and How to play to say these triggers are rare.
- Recommendation: 1. It matches your design ("scarcity plus aggressive people leads to fights") and the director re-runs the certifier's seed sets before release.
- Priority: P2 (suggested; stands unless the owner changes it)
- Answer:

## Proposals

Ideas the director draws from headless simulation runs and the code. At most 6 wait here at a time.

### P-010: Show fights on the map
- Date: 2026-10-11
- Category: visuals
- What: Fights now happen hundreds of times a game, but the map shows none of them; you only see a hex's numbers change. When a hex has a fight, flash it briefly in the winner's colour with a small crossed-swords mark for about a second (on the yearly clock), and draw a short arrow from the hex to where the losers fled. Zoomed in, the people who died fade out.
- Evidence: seeds review-20261011f-1 to -3 at b52df73, default setup, 400 years: 529, 721 and 773 fights, and 1,107, 1,397 and 1,342 war deaths. Nothing under src/render reads fights (`grep fight src/render` finds nothing); fights show only in the hex card, the sheet and the end screen.
- Effort: S
- Phone performance risk: low: one small overlay redrawn once a year from the per-hex fight winner the sim already keeps (`sim.fightWinner`). No per-person work.
- Priority: P2 (suggested; stands unless the owner changes it)
- Decision:

### P-011: Group fights into wars in the history log
- Date: 2026-10-11
- Category: UI
- What: The end screen's history log is now almost all single fights, so first contacts, milestones, famines and extinctions get lost in it. Group the fights between two civs into one "war" line: from the first year to the last (a war ends after 10 years without a fight between them), with fights, wins on each side and war deaths. Single fights stay in the hex card and the stats.
- Evidence: seeds review-20261011f-1 to -3 at b52df73, 400 years: fights are 529 of 544, 721 of 734 and 773 of 785 history events. The log keeps at most 2,048 events (src/sim/records.js), so long games fill it with fights within a few hundred years, and later famines and fights are then dropped.
- Effort: S
- Phone performance risk: low: one open war per pair of civs, updated once a year; a shorter log to draw.
- Priority: P2 (suggested; stands unless the owner changes it)
- Decision: yes, as part of the shorter History in the request below (reading: the war grouping is built, but only the 3 deadliest wars are listed in History).

## Requests

- [P2] Rethink the end screen's History section: it "has WAY too many details" (owner, 2026-10-11 16:38 UTC; agreed 16:42 UTC to the shape below; on two 500-year headless runs History had about 1,400 and 1,600 lines, 98% single fights). Make it a short chronicle of turning points, at most about 12 lines, oldest first:
  1. No fights or wars in History: they move to the new War section below.
  2. Only famines that killed at least 10% of the civ, at most 3.
  3. Keep first contacts, the 100/500/1,000 people milestones and extinctions.
  4. Add level-ups ("Civ 2 became a Town").
  5. Drop the peak and most-hexes lines (the Civs card already shows them).
  The full raw log goes away (no "show everything" toggle). This supersedes P-011's separate log change and narrows P-008. RULES.md "Records" and "End screen" change to match; How to play's pictures that read the first contact and first three fights from the log need checking.
  - Follow-up (owner, 2026-10-11 17:52 UTC): "I want the end screen to have a consolidated war section, with summary of kills for each side, throughout the years. i don't want to see every individual small conflict with 1, 2, 5, or 10 deaths. doesn't matter in the large scheme of things. the scrolling at the end screen is way too big. no sense at all." Reading:
    - A new **War** card on the end screen: one row per pair of civs that ever fought, summed over the whole game: years at war (first to last fight), fights, fights won by each side, and kills by each side (how many of the other civ's people each one killed). No individual fights anywhere on the end screen. This needs war deaths recorded per killing side, not only both sides together. Pairs that never fought are not listed; "No wars" if none.
    - The whole end screen must scroll far less: on a phone, the header, buttons, Civs and War should be readable without long scrolling, with the remaining cards (charts, stockpiles, traits, people, deaths, records, history) made compact or collapsed by default so the page is short. The director picks the exact layout.

## Answered

### R-012: "Currently no people at all die because of war. I don't think fight ever starts in the game. Fix that, by implementing some more comprehensive fight mechanics and triggers and, at the end of the process, create an one time agent to certify and approve the mechanics. If something is disapproved, fix it in the same build and have the said agent reverify it." (owner, 2026-10-11 13:31 UTC; reading: fighting (T-023, Q-007 option 1) is not built yet, so no war deaths exist. Build it with more comprehensive triggers than Q-007 alone, then a one-time reviewer agent certifies the mechanics, for example with headless runs that show fights and war deaths happen. Anything it rejects is fixed in the same build and re-verified by that agent before the release candidate opens.)
- Date: 2026-10-11
- Priority: P1
- Moved: 2026-10-11, task T-023 (P1; wider triggers, war deaths in headless and the certifier step in its criteria), T-030

### R-013: Show each civ's level, its materials and how they are used, and what modifiers each level and material changes (owner, 2026-10-11 13:31 UTC; reading: in the game UI, for example the inspector, live report and end screen, once T-024 and T-025 exist.)
- Date: 2026-10-11
- Priority: P2
- Moved: 2026-10-11, task T-041 (P2, after T-024 and T-025)

### R-014: "At the start of the game, there is no homepage, as i have explicitly requested. I need it in the next build, WITH THE DETAILS I EXPLICITLY REQUESTED." (owner, 2026-10-11 13:31 UTC; reading: T-028 (R-005) is top priority for the next release candidate, built in full: New game and the rules guide in human-readable, compelling language following RULES.md, looking fabulous, with in-game screens explaining how the game works.)
- Date: 2026-10-11
- Priority: P1
- Moved: 2026-10-11, task T-028 (P1, required in the next build, in full)

### R-015: On the setup screen, pick each civ's type, with clear explanations of the differences between the types (owner, 2026-10-11 13:31 UTC; reading: extends T-022 with a plain-language explanation of each type on the setup screen.)
- Date: 2026-10-11
- Priority: P2
- Moved: 2026-10-11, task T-022 (P1 via R-016; a plain explanation of each type on the setup screen)

### R-016: Priority changes (owner, 2026-10-11 13:51 UTC: "Traits and mutation is p1 / Fighting with triggers p1 / Materials and gathering p1"). Reading: T-021 (traits and mutation), T-023 with R-012 (fighting with more comprehensive triggers and the certifier agent), T-024 (material deposits) and T-025 (gathering, stockpiles and levels) become P1, alongside T-028 (home page). T-022 (civ types) becomes P1 too, because fighting cannot ship without it, and so do the unit tests these need (T-030, T-036).
- Date: 2026-10-11
- Priority: P1
- Moved: 2026-10-11, tasks T-021, T-022, T-023, T-024, T-025, T-028, T-030, T-036 set to P1

### P-008: Fill the end screen's history log with events that actually happen
- Date: 2026-10-11
- Category: UI
- What: The new end screen's history log and "worst famine" record come out empty in a normal game, so the end screen tells no story. Log the moments a player would remember that already happen today: first contact (the first year two civs share a hex), each civ passing 100, 500 and 1,000 people, a civ's peak population and its first year of decline, the most hexes a civ ever held, and lower the famine bar so a bad starvation year shows up (for example 1% of the civ's people instead of 2%).
- Evidence: Headless runs of seeds review-20261011d-1 to -3 on claude/cycle-20261011-1006 at 71fa0e5, default setup, 400 years: "0 events" and "worst famine none" on all three seeds, although the civs had 43 to 125 starvation deaths each over the run (seed -1: 110, 116, 125), spread thinly over the years. src/sim/records.js:13 sets a famine at 2% of the civ's people and at least 5 deaths in one year; src/sim/records.js:16 logs only famines and extinctions.
- Effort: S
- Phone performance risk: low: a few counters per civ checked once a year, written to the existing capped event log.
- Priority: P2 (suggested; stands unless the owner changes it)
- Decision: Yes (reading: yes as proposed, including lowering the famine threshold in RULES.md from 2% to 1% of the civ's people in one year)
- Moved: 2026-10-11, tasks T-038, T-039 (P2)

### P-009: Draw people by age and hunger, and let births and deaths show
- Date: 2026-10-11
- Category: animation
- What: Zoomed in, every person is the same emblem at the same size, and people pop in and vanish instantly, so you cannot see a village grow or a famine bite. Draw children smaller (growing to full size by 16), elders slightly faded, hungry people pale, a newborn appearing with a short grow-in and the dead fading out over half a second. The map would visibly breathe with each year's births and deaths.
- Evidence: src/render/peopleLayer.js:363 gives every person sprite one fixed size and src/render/peopleLayer.js:369-371 only changes its civ tint; age and hunger are never read when drawing. Seeds review-20261011d-1 to -3 at 71fa0e5, default setup: about 4 to 6 births and 3 to 5 deaths per civ every year by year 400 (seed -1, Civ 1: 1,915 births and 1,459 deaths in 400 years), all invisible except as sprites appearing and disappearing.
- Effort: S
- Phone performance risk: low: a scale and alpha per sprite set in the existing loop over visible people; no new textures or allocation.
- Priority: P3 (suggested; stands unless the owner changes it)
- Decision: Yeah, with low prio. (reading: yes, built after the home page, fighting, civ types and levels)
- Moved: 2026-10-11, task T-040 (P3, after the home page, fighting, civ types and levels)

### Q-006: What numbers should the 8 traits use?
- Date: 2026-10-11
- Why it matters: Q-004 settled 8 inherited traits with mutation (T-021), but not how a trait value turns into a birth chance, a lifespan or a food need, nor each civ type's starting values. Today everyone has a 5% birth chance, old age from 45, and eats 1 food a year.
- Options:
  1. Each trait 0 to 1, with 0.5 giving today's values: fertility 0→2.5%, 1→7.5% birth chance; life expectancy shifts old age start 35 to 55; metabolism 0.75 to 1.25 food a year; heat tolerance halves to doubles starvation health loss in desert, cold tolerance the same in tundra and mountain; strength, aggression and cooperation 0 to 1 used by fights and switching. Founders start at their type's values (Aggressive: aggression 0.7, strength 0.65; Cooperative: cooperation 0.7; Expansionist: fertility 0.6; Isolationist: life expectancy 0.6; Nomadic: metabolism 0.4; all else 0.5) with ±0.1 random spread. Mutation: each trait ±3% a birth (setup option 0% to 10%).
  2. Same as 1 but narrower effects (fertility 4% to 6%, old age 40 to 50): civs differ less, drift matters less.
  3. Same as 1 but no type starting values: every civ starts at 0.5 and only terrain and mutation make them differ.
- Recommendation: 1, it keeps today's balance at 0.5, gives each type a visible starting identity, and the director tunes the numbers from headless runs (asking you before moving any by more than half).
- Answer: add your own numbers so to be realistic and balanced and then initialize a new, one-time agent to review the proposed agents and balance them out. only after teh new agent balances out the numbers, create the task for the dev. (reading: the director picks realistic, balanced trait numbers itself, using option 1's shape as a starting point. A separate one-time reviewer agent ("review the proposed agents" read as "review the proposed numbers") then checks and rebalances them, for example with headless runs. Only after that review does the director create the game-dev task. The final numbers go into RULES.md with the change.)
- Review: a one-time balance reviewer agent prototyped option 1 in a copy of the sim (10 seeds, every type in every civ position, up to 3,000 years). Option 1 as drafted let fertility run away (0.94 by year 3000) and Expansionist take 81% of all people by year 1000. Final set: fertility and metabolism make hunger hit harder (fertile, fast-burning people starve faster), metabolism also raises the birth chance, heat and cold tolerance trade off, Expansionist fertility 0.58, Nomadic metabolism 0.45 with heat and cold 0.6. Result: each type 29% to 43% of people at year 1000 (fair share 33%), no civ extinct in 360 runs, traits stay between 0.4 and 0.75, population at year 400 about 1,430. Full numbers in T-021.
- Moved: 2026-10-11, tasks T-021 (with the reviewed numbers), T-030

### Q-007: How do Cooperative and Nomadic behave, which types always fight, and how does a fight work?
- Date: 2026-10-11
- Why it matters: Blocks T-022 (civ types) and T-023 (fighting, R-004). Your summary leaves Cooperative and Nomadic undefined and says "some civs fight anyway" without naming them.
- Options:
  1. Cooperative: never starts fights, its people switch civ half as often as they would join it, gathers 25% faster (from R-006). Nomadic: 5 movement points instead of 3, and sets out at twice the usual chance. Aggressive always fights when sharing a hex; others fight only when the hex is short of food and one side's average aggression is above 0.5. A fight: each side's strength = sum of its people's strength, defenders (the civ with more people there last year) get the hex's defence bonus; the weaker side loses 20% of its people in the hex (war deaths) and the rest flee to a neighbouring hex; the stronger side loses 5%.
  2. As 1, but Aggressive and Expansionist both always fight.
  3. As 1, but fights only cause fleeing, no deaths (a gentler game; war deaths appear only with L4 organised war).
- Recommendation: 1, it gives each type one clear trait the player can see, keeps fights local and rare when food is plentiful, and uses the defence bonuses already in the terrain table.
- Answer: let's go with 1 (reading: option 1 as written, Cooperative never starts fights, Nomadic moves further, Aggressive always fights when sharing a hex, fights as described; no separate reviewer step asked for this one)
- Moved: 2026-10-11, tasks T-022, T-023 unblocked with option 1 in their criteria (they follow T-021), T-030

### Q-008: What numbers should gathering and level effects use?
- Date: 2026-10-11
- Why it matters: Blocks T-025. R-006 gives deposit chances and level thresholds but not the yield per gatherer, the hex cap, when food counts as "secure", or what each level actually does (how much more food at L2, how much longer life at L5, the birth bonus).
- Options:
  1. A common deposit yields 0.5 a gatherer a year, capped at 10 a hex a year (exotic 0.125 and 2.5); food is secure when nobody in the civ went hungry last year and its hexes hold at least 1.2 food per person; then up to 20% of its adults gather. Effects: birth chance +0.5 percentage points a level above 1; L2 plains and river hexes +25% food capacity; L3 desert, tundra and mountain hunger loss halved; L4 boats (can migrate across one sea or lake hex), alliances later; L5 all hexes +25% food capacity, old age starts 5 years later, may absorb a civ it shares hexes with when that civ is smaller.
  2. Same effects as 1, but yields twice as high (faster levels, about 900 years to Kingdom instead of 1,750+).
  3. Same yields as 1, but smaller level effects (+10% food, birth +0.25 points): levels matter less, populations stay closer together.
- Recommendation: 1, it keeps your 1,750-year fastest path to Kingdom realistic on a 10 × 10 map, and the director checks it with headless runs before release.
- Answer: agreed. (reading: option 1, as recommended)
- Moved: 2026-10-11, task T-025 unblocked with option 1 in its criteria (follows T-024), T-030

### P-007: Show every civ in a shared hex, not just the largest
- Date: 2026-10-11
- Category: visuals
- What: Zoomed out, a hex shows only the emblem of its largest civ, so a hex where three civs live side by side looks like one civ owns it. Draw up to three small emblems per hex (largest first, a "+" when there are more), or a thin ring around the count split by each civ's share, so you can see at a glance where civs mix, which is also where contact and fights (T-023) will happen.
- Evidence: Headless runs of seeds review-20261011c-1 to -3 on claude/cycle-20261011-0807 at c6150dc, default setup, 400 years: the 3 civs hold 106, 128 and 147 hex-slots on 64 land hexes (1.7 to 2.3 civs per hex on average), even with the new own-civ pull. src/render/peopleLayer.js:228-246 picks one civ per hex (the largest) and draws only its emblem.
- Effort: S
- Phone performance risk: low: two more sprites per populated hex from the same atlas, updated only when the yearly counts change.
- Decision: ring version. also include a bold ring circling ALL hexes each civ occupies, showing it as one larger area consisting of many hexes. (reading: yes, with changes. Each hex shows a thin ring around its count, split by each civ's share. On top of that, every civ gets a bold outline in its colour around the outer edge of all the hexes it occupies, so its territory reads as one area. Because civs share hexes, these outlines can overlap.)
- Moved: 2026-10-11, tasks T-031 (ring and territory outlines, built this cycle), T-035

### R-008: Real-time reporting visible on desktop, in a column to the right of the map (owner, 2026-10-11 09:43 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-032 (todo, next cycle)

### R-009: Colour the hexes each civ occupies in that civ's colour, without losing the hex's terrain flavour (owner, 2026-10-11 09:43 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-033 (built this cycle), T-035

### R-010: "End game conditions are still 2 at the start of the game. Update to the previous agreed terms." (owner, 2026-10-11 09:43 UTC; reading: the setup screen still offers only None and Year limit; the R-007 end conditions are already planned as T-026 (todo), so the owner wants T-026 built soon.)
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-026 (built this cycle), T-029

### R-011: Tapping a hex should zoom in and show the actual people living there. Overall, people should be visible, since the map does not feel alive during the simulation today (owner, 2026-10-11 09:43 UTC).
- Date: 2026-10-11
- Moved: 2026-10-11, tasks T-034 (built this cycle; also people idle inside their hex and show at a lower zoom), T-035

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
