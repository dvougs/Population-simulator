# Progress

## Status

- Phase: version 1.0 nearly complete. Live: Phase 2 people, end conditions, end screen, civ territory and tap-to-zoom (PRs #15, #16). In the release candidate (cycle 2026-10-11 14:07): home page and How to play, 8 traits with mutation, 5 civ types on the setup screen, contact and fighting (certified), material deposits, gathering and levels 1 to 5 with First to Kingdom, level and material panels, a fuller history log, nothing saved between sessions.
- Last full cycle: 2026-10-11 14:07 UTC
- Live on GitHub Pages: Phase 1 and its follow-ups, Phase 2 people, end conditions and end screen, civ tint and territory outlines, tap to zoom (PRs #10, #13 to #16). https://dvougs.github.io/Population-simulator/
- Open release candidate: "Release candidate: home page, traits, civ types, fighting, materials and levels" from claude/cycle-20261011-1407 (see the cycle log for the number).
- Ready next: T-032 (desktop live report column, P2), T-040 (people drawn by age and hunger, P3, after the 1.0 features).
- Blockers: none. Waiting on the owner: Q-009 (levels stall because big civs never count as food-secure, P1), Q-010 (hunger and crowding fight triggers almost never fire, P2), P-010 (show fights on the map), P-011 (group fights into wars in the history log).

## Cycle log

### 2026-10-11 14:07: home page, traits, civ types, fighting, materials and levels

- Owner input: P-008 yes (P2), P-009 yes with low priority (P3); requests R-012 (fighting with wider triggers and a one-time certifier), R-013 (show levels and materials), R-014 (home page in the next build, in full), R-015 (civ type explanations on setup) and R-016 (traits, fighting, materials and gathering are P1). TASKS.md got a Priority column (older tasks P2). T-021 to T-025, T-028, T-030 and T-036 became P1; T-022 took R-015, T-023 took R-012's five triggers and the certifier step, T-028 took R-014. New tasks: T-038 and T-039 (P-008), T-040 (P-009), T-041 (R-013).
- Merged since last cycle: #16 (T-026, T-027, T-029, T-031, T-033, T-034, T-035 done) and #17 (studio: priorities and priority-based builds).
- Batch: every ready P1 (T-021, T-022, T-023, T-024, T-025, T-028, T-030, T-036) plus P2 tasks sharing their context (T-037 setup screen, T-038 and T-039 history log with fights, T-041 levels UI). Left for later: T-032 (P2, separate layout), T-040 (P3).
- Built on claude/cycle-20261011-1407 in four game-dev runs:
  - T-037 nothing saved; T-024 deposits (re-roll until every exotic is present where the land can hold it); T-021 traits with the reviewed Q-006 numbers (year-400 population 1,467, 1,453 and 1,543 on seeds review-20261011e-1 to -3).
  - T-022 civ types (default setup Expansionist, Aggressive, Cooperative) and T-023 contact with the five triggers, civ switching and war deaths.
  - T-025 gathering, stockpiles, levels 1 to 5 and First to Kingdom; T-041 levels panel, level guide, hex card gathering row and end-screen level chart; T-038 history events (first contact, milestones, peaks, most hexes; famine threshold 2% to 1%).
  - T-028 home page with a living world, and an 11-section How to play illustrated by the game's own drawings, with every number read from the sim modules.
- R-012 certifier (one-time general-purpose agent): REJECTED the first fight rules. The Aggressive civ was wiped out by its own rule (36 of 40 extinct by year 1000) because the winner's 5% loss rounded half up, and losers fled into the winner's hexes. Fix: winner losses round down, losers flee to a neighbour without the winner. The game-dev run applying it was cut off by the session usage limit; the director committed its finished edits unchanged (b52df73), which reproduced the certifier's target hashes exactly. Re-verified: APPROVED. War is about 30% of deaths, every run has fights, and extinctions at year 1000 dropped from 71 to 24 of 120 civs on 40 seeds. Not blocking: the hunger and crowding triggers almost never fire (asked as Q-010); the 2,048-event log fills with fights (P-011).
- Tested by unit-tester (T-030, T-036, T-039): 393 unit tests pass (13 stale tests rewritten for the intended rule changes, new files for traits, deposits, civ types, contact, levels and UI helpers); no bugs. The e2e spec was updated for the home page (it opens `/#new`), the deposits and gathering rows and level-raised food capacity; 72 Playwright runs passed locally, with one desktop preview-hash flake that passed on every rerun (seen last cycle too).
- Ownership check: game-dev commits touch no tests/, unit-tester commits only tests/. Docs pass: README (1.0 in progress, deposits, First to Kingdom, nothing saved) and CLAUDE.md layout (home, How to play, levels).
- `npm run perf`: 169 ticks/s against the CI floor of 150 (it was about 468 before this cycle; more people and the per-person trait, contact and level work).
- Design review on claude/cycle-20261011-1407 at b52df73, seeds review-20261011f-1 to -3, default setup, 400 years:
  - Population at year 400: 1,679 (Expansionist 1,570, Aggressive 50, Cooperative 59), 1,468 (1,035, 433, Cooperative extinct in 396 by war) and 1,330 (142, 232, 956).
  - War deaths 1,107, 1,397 and 1,342; fights 529, 721 and 773 (fights are 97% to 98% of history events).
  - Levels: every civ that reached L2 did so between years 150 and 294; none reached L3 by year 400 (L3 needs 300 years at L2). The largest civ on each seed is "food not secure" at year 400; a 3,000-year run stalled at L3 for 2,500 years.
  - Questions: Q-009 (food security rule, P1), Q-010 (fight triggers, P2). Proposals: P-010 (show fights on the map, visuals) and P-011 (group fights into wars, UI).

### 2026-10-11 10:06: end conditions and end screen, civ territory on the map, tap to zoom

- Owner input: Q-006 answered (the director picks the trait numbers, then a one-time reviewer agent balances them before the dev task); Q-007 option 1; Q-008 option 1; P-007 yes with changes (ring split by share plus a bold outline round each civ's territory); requests R-008 (desktop report column), R-009 (tint held hexes in civ colour), R-010 (the setup screen still shows only the old two end choices: build T-026), R-011 (tap a hex to zoom in on its people; the map should feel alive).
- Q-006: the director drafted option 1's numbers, and a one-time general-purpose reviewer prototyped them in a scratch copy of the sim (10 seeds, every type in every civ position, up to 3,000 years). Option 1 as drafted let fertility run away (0.94 by year 3000) and Expansionist take 81% of all people by year 1000. The reviewed set adds costs: fertility and metabolism make hunger hit harder, metabolism also raises the birth chance, and heat and cold tolerance trade off. Expansionist fertility goes to 0.58; Nomadic gets metabolism 0.45 with heat and cold tolerance 0.6. Result: types hold 29% to 43% of people (fair share 33%), no extinctions in 360 runs, about 1,430 people at year 400. T-021 now carries the reviewed numbers and is ready.
- Tasks: T-022, T-023 and T-025 unblocked with the answers in their criteria. New tasks: T-031 (P-007), T-032 (R-008), T-033 (R-009), T-034 (R-011), T-035 (their tests), T-036 (tests for T-024, split from T-029) and T-037 (game-dev still saves the last settings in localStorage, against R-007's "nothing saved between sessions").
- Merged since last cycle: #15 (T-015, T-018, T-019, T-020 done).
- Built on claude/cycle-20261011-1006, in two game-dev runs:
  - T-026: end conditions in any combination (last civ standing, dominance 60% for 300 years, year limit default 2500, sandbox), total extinction always ends, End now while paused. game-dev's own choice: non-default presets now set end conditions.
  - T-027: end screen, with records and events recorded during the run in src/sim/records.js. A famine year is ≥ 2% of the civ's people and ≥ 5 starvation deaths.
  - T-031: shared-hex rings and civ territory outlines.
  - T-033: 30% civ tint on held hexes.
  - T-034: tap a hex to fly in over 0.4 s. People show from 120 px instead of 200 px and idle-drift inside their hex.
  - State hash unchanged.
- Tested by unit-tester (T-029, T-035): 239 unit tests pass, no bugs. The existing e2e spec was updated for the checkboxes, the end screen and tap-to-zoom; 72 Playwright runs passed locally. One desktop flake in the preview-hash test passed on every rerun; it is not caused by this work.
- Design review on claude/cycle-20261011-1006 at 71fa0e5, seeds review-20261011d-1 to -3, default setup, 400 years:
  - Population at year 400: 1,507, 1,432 and 632.
  - Starvation deaths per civ: 0 to 125. Average lifespans: 50 to 53.
  - No extinctions. Longest family line: 19 to 20 generations.
  - No famine and 0 history events on any seed.
  - Levels: not reported, because levels do not exist yet; T-025 adds them to headless.
  - Proposals: P-008 (fill the end-screen history log, UI) and P-009 (draw people by age and hunger, animation).
- Opened PR #16.

### 2026-10-11 08:07: people on the map, height shading, own-civ pull; 1.0 planned

- Owner input: Q-003 answered (1.0 = option 1 plus levels 1 to 5, materials, basic fighting and end conditions; full civ design summary), Q-004 answered 1 (8 traits with mutation), Q-005 answered 2 (colour plus shape emblem); P-003 no, P-004 yes, P-005 yes, P-006 later; requests R-003 (civ list and types on setup), R-004 (basic fighting), R-005 (home page), R-006 (materials and levels spec) and R-007 (end conditions and end screen spec). Tasks T-018 to T-030 created; T-015 unblocked and rewritten for emblems; ROADMAP gained a "Version 1.0" section.
- The owner's "not defined yet" list became three questions, each with a full recommended number set: Q-006 (trait numbers and type starting values), Q-007 (Cooperative and Nomadic behaviour, which types always fight, how a fight works), Q-008 (gathering yields, food security, level effects). T-021, T-022, T-023, T-025 and T-030 are blocked on them. T-024, T-026 to T-029 are ready for the next cycle.
- Merged since last cycle: #14 (T-013, T-014, T-016, T-017 now done).
- Built on claude/cycle-20261011-0807 by game-dev: T-019 (a migrant counts a hex's spare food ×2 when it already holds their own civ), T-018 (elevation kept on the map; land ±6%, water up to 25% darker by depth; preview shares it), T-015 (8 civ colour and emblem pairs, zoomed-out emblem and head count per hex, people as atlas sprites from 200 px per hex with 0.6 s glides, hex people list, person card, emblems in HUD and sheet). npm run perf 503 ticks/s.
- The game-dev and unit-tester agent types became unavailable after the first game-dev run; unit-tester and the fix round ran as general-purpose agents following .claude/agents/*.md verbatim.
- unit-tester (T-020): 189 passed, 0 failed; e2e spec read against every UI change, no edit needed. BUG-1: frames rose from 16.7 ms to about 100 ms at 20× on the iPhone viewport (the e2e speed test failed on both phone projects), because every tick frame redrew the whole map. One fix round: head-count redraws at most every 0.4 s (in RULES.md), pure helpers hexTotal and largestCiv extracted. Retest: 193 passed, 0 failed; e2e locally 71 passed, 1 skipped (existing conditional skip); BUG-1 fixed.
- RULES.md checked against src/sim/migration.js (ownCivWeight 2), src/render/palette.js (0.06, 0.25), src/render/civStyle.js and peopleLayer.js (200 px, table): values match. Ownership clean (game-dev: src/, RULES.md, index.html, styles/; unit-tester: tests/ only).
- Design review on the cycle branch at c6150dc (the fix after it changed drawing only), seeds review-20261011c-1/-2/-3, default setup, 400 years: final population 1144 (441/370/333), 1434 (578/447/409), 1364 (562/351/451), still rising; hashes f908ac74, ff02b718, f264c69f. Deaths: old age 2884/3353/3407, starvation 8/238/237. Average lifespan 50.0–52.6, oldest 64–67. No extinctions. Hex-slots on 64 land hexes 106/128/147. game-dev's before/after on the b seeds: 146 → 142, 143 → 135, 131 → 136, so the ×2 pull is a weak effect (noted in the PR; the owner approved ×2). Levels not reported: they do not exist yet (T-025 adds them; headless reporting goes with it). Proposal P-007 (show every civ in a shared hex, visuals). No second proposal: the clearest balance signal (slow growth, the map about half full at year 400) depends on the fertility numbers asked in Q-006.
- Docs pass: README.md updated on the cycle branch for people on the map, emblems and shading. RULES.md updated by game-dev. No other drift.
- Opened PR #15. Email to the owner (questions, proposals, release candidate).

### 2026-10-11 04:05: Phase 2 people, life cycle, migration, stats

- Owner input: none new (Q-003 to Q-005 still open, P-003 and P-004 undecided, no requests). Full cycle by the 3 h 50 min rule.
- Merged since last cycle: #13 (T-010, T-011, T-012 now done) and #12 (studio change: unit-tester only in logic cycles, no task IDs).
- T-015 marked blocked by Q-005 (how civs and people are drawn). T-013, T-014, T-016, T-017 built: none of the open questions blocks them (every Q-003 option includes people; traits from Q-004 layer on later).
- Built on claude/cycle-20261011-0405 by game-dev: people pool in typed arrays with free-list reuse, yearly order birthdays → eating → deaths → births → migration → regrowth → statistics, civ count (default 3, 1–8) and starting population (default 20, 2–200) on the setup screen, migration within 3 movement points, per-civ yearly stats and history through SimHost, per-civ headless report; live population and people per civ in the HUD, sheet and hex card (no people drawn yet). RULES.md gained "Civilisations and people", "A year", "Migration" and "Statistics". npm run perf 536 ticks/s (floor 150).
- unit-tester (T-017): 167 passed, 0 failed (was 98); e2e spec kept in step, local run 71 passed, 1 skipped. No bugs, no fix rounds.
- RULES.md checked against src/sim/life.js, migration.js and params.js: values match. Ownership clean (game-dev: src/, RULES.md, README.md, index.html, tools/; unit-tester: tests/ only).
- Design review on the cycle branch at 1656249, seeds review-20261011b-1/-2/-3, default setup, 400 years: final population 1354 (243/670/441), 1323 (166/414/743), 1405 (391/514/500), still rising; hashes 3e71ba66, ead3b24a, 09f127bb. Deaths: old age 3205/3531/3136, starvation 106/240/118. Average lifespan 50.6–52.1, oldest 64–69. No extinctions. Civs together hold 146/143/131 hex-slots on 64 land hexes. Levels not reported: they do not exist until Phase 4 (no headless task needed yet). Large world (seed -1, 1000 years): 35,072 people, still rising, 770 ticks/s. Proposals P-005 (civ homelands, gameplay) and P-006 (food abundance, scale).
- No new questions (three still open).
- Docs pass: README.md and RULES.md were updated by game-dev in the build; CLAUDE.md's "headless prints per-civ results" is now true. No other drift.
- Opened PR #14. Email sent to the owner (proposals, release candidate).

### 2026-10-11 00:06: lowland sliders, whole-map water, water tide

- Owner input: Q-001 answered 1 (coast stays land, no tasks); Q-002 answered 3 (separate forest, desert, tundra sliders); request R-001 (plains slider); P-001 decided yes with changes (water counts against the whole map); P-002 decided yes (water shimmer). Tasks T-010 to T-012 created; Phase 2 seeded as T-013 to T-017.
- Merged since last cycle: #10 (Phase 1 release candidate, T-001 to T-009 now done), #8, #9 and #11 (studio changes, no task IDs). functional-tester retired (#11); T-009's owner noted as retired.
- The game-dev and unit-tester agent types became unavailable mid-cycle; after the first game-dev run, the agents ran as general-purpose agents following .claude/agents/*.md verbatim.
- Built on claude/cycle-20261011-0006: T-010 (plains/forest/desert/tundra weights 40/30/15/15, water = max(edge ring, round(water × size²)), RULES.md updated), T-012 (water tide overlay, reduced-motion static).
- unit-tester (T-011): 98 passed, 0 failed; e2e spec PRESETS brought in step. BUG-1: the first shimmer redrew 8 overlays every 50 ms and starved software Chromium (7 e2e timeouts). One fix round: one overlay, at most 2.5 shimmer redraws a second. Retest: unit 98/98, e2e full spec 72/72 (game-dev), the BUG-1 subset 9/9 (director re-run).
- RULES.md checked against src/sim/params.js and mapgen.js: values match. Ownership clean (game-dev: src/, RULES.md, tools/; unit-tester: tests/ only).
- Design review on the cycle branch at 442a0e6, seeds review-20261011-1/-2/-3, default setup, 400 years: map hashes 50773508, e1a10cb7, d4e4cb6b; final hashes b0c5be86, 830611cc, c007228d; deep water 36 on every seed (edge ring only); land 64 (coast 17/16/21, plains 12/11/9, forest 9/9/8, hills 10, mountain 8, desert 4/5/4, tundra 4/5/4); 8, 9, 7 river hexes. Population, causes of death, levels and extinctions cannot be reported: no people until Phase 2; T-016 adds them to tools/headless.js. Proposals P-003 (UI) and P-004 (visuals).
- Mid-cycle the owner pushed to main: unit-tester now runs only in cycles that change game logic (CLAUDE.md, director-cycle skill, unit-tester agent), and request R-002 (plan Phase 2 as "version 1.0" with civs). R-002 became questions Q-003 (1.0 scope), Q-004 (traits and mutation) and Q-005 (civ visuals); T-013 to T-017 will be extended once they are answered.
- Opened PR #13. Email sent to the owner (questions, proposals, release candidate).
- Docs pass: README.md updated for the new sliders and the tide on the cycle branch. CLAUDE.md still says headless prints per-civ results; true once T-016 lands, left as is.

### 2026-10-10 23:06: Phase 1 release candidate

- First full director cycle. No answers or requests in QUESTIONS.md. Merged since setup: #7 (studio setup) and Dependabot action bumps #2–#6; none listed task IDs.
- Built T-001 to T-007 with game-dev on claude/cycle-20261010-2306: hex maths, hex map generation (8 terrains, rivers, lakes), vendored PixiJS 8.22.0, square-grid sim retired, map-generation screen, PixiJS renderer with pan/pinch/fit, hex inspector. RULES.md rewritten.
- unit-tester (T-008): 92 passed, 0 failed. functional-tester (T-009): first run 60/60 with 3 UI bugs (inspector covering the tapped hex, 28px sheet handle, Max clipped below 356px); one fix round; retest 72/72 across three viewports, bugs confirmed fixed.
- RULES.md checked against src/sim/terrain.js; ownership clean (game-dev only src/ and studio-allowed files, testers only tests/).
- The game-dev, unit-tester and functional-tester agent types became unavailable mid-cycle; the testers ran as general-purpose agents following their .claude/agents/*.md instructions verbatim.
- Opened PR #10. Asked Q-001 (coast) and Q-002 (terrain mix). Tasks marked done pending merge.
- Mid-cycle the owner updated the director-cycle skill on main (design review, proposals, docs pass, merging main into the cycle branch); the rest of this cycle followed the new steps.
- Design review: seeds review-20261010-1, -2, -3, default setup, 400 years, on the cycle branch at 7216673. Map hashes b8d3ef96, f0c64f15, d7ff5670; deep water 52/100 on each; 5, 9 and 5 river hexes. Population, causes of death, levels and extinctions cannot be reported: there are no people or civs until Phase 2, so no headless reporting task yet (Phase 2 tasks must add them). Proposals P-001 (default water share, scale) and P-002 (water animation).
- Docs pass: README.md rewritten for the hex map on the cycle branch. CLAUDE.md still says headless prints per-civ results, which becomes true in Phase 2; left as is.
- Next: Phase 2 (people) tasks to be seeded once PR #10 is merged.

### 2026-10-10: studio set up

Studio files added through a pull request: CLAUDE.md, RULES.md, project/ files, the game-dev, unit-tester and functional-tester agents, the director-cycle skill and the push-to-main guard hook. Tests moved to tests/unit and tests/e2e. The next director cycle starts Phase 1.

### 2026-10-10: director cycle not run

The scheduled director cycle could not run: `.claude/skills/director-cycle/SKILL.md` did not exist on `main`.
