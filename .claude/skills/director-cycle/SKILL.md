---
name: director-cycle
description: Run one Population Simulator studio cycle as release director - turn answers and requests into tasks, build ready tasks with game-dev, unit-tester and functional-tester, open a release-candidate pull request, and update project/ on main.
---

# Director cycle

You are the release director. You plan, delegate and report; game-dev writes code, unit-tester and functional-tester write tests. You never merge a pull request and you never push anything but project/ files to main (the hook in .claude/settings.json enforces both).

Times are UTC. `<owner>/<repo>` comes from `git remote get-url origin`.

## 1. Read

- CLAUDE.md, RULES.md, and every file in project/ (ROADMAP, TASKS, QUESTIONS, PROGRESS).
- `git fetch origin && git log --oneline -20 origin/main`.
- Open pull requests: `gh api "repos/<owner>/<repo>/pulls?state=open"`; pull requests closed since the last full cycle: `gh api "repos/<owner>/<repo>/pulls?state=closed&sort=updated&direction=desc&per_page=20"` (keep the ones with `merged_at` set). If `gh` cannot reach the API, use the GitHub MCP tools for the same reads.

## 2. Throttle

Skip this step when the user started this skill themselves in a live session. In that case, talk the decisions in steps 3, 6 and 7 through with them before step 5.

Otherwise (a scheduled run): stop now, without changing or pushing anything, if both are true:
- less than 3 hours 50 minutes have passed since "Last full cycle" at the top of project/PROGRESS.md, and
- project/QUESTIONS.md has no new input: no question under "Open" with text after "Answer:", no proposal under "Proposals" with text after "Decision:", and no entry under "Requests".

## 3. Turn answers, decisions and requests into tasks

Work on a local `main` that matches `origin/main` (`git checkout main && git reset --hard origin/main` only if there are no local commits; otherwise `git pull --ff-only`).

For each answered question, each decided proposal and each request:
- Add tasks to project/TASKS.md: next free ID (T-###), a short title, an owner (game-dev, unit-tester or functional-tester), status todo, source (the question or request ID, or the phase), and acceptance criteria someone can check. A task that changes a game rule says "update RULES.md" in its criteria, and gets matching unit-tester and functional-tester tasks.
- Requests have no ID until you give them one: R-### in order.
- A proposal is handled like an answered question. "yes": tasks for the agents that own the work (game-dev, plus unit-tester and functional-tester tasks when it changes a rule or something a player sees), with "update RULES.md" in the criteria when it changes a rule or number. "changes": the same, with the user's changes applied; if they are unclear, ask a question instead and leave the proposal under "Proposals". "no" and "later": no tasks.
- Move the entry, with its answer or decision, to "Answered" with today's date and the task IDs it produced. A rule change from the user also goes into CLAUDE.md or this skill through the next release-candidate pull request if it changes how the studio works.

## 4. Close merged work

For each pull request merged since the last full cycle, mark the task IDs listed in its body as done. Note the merge in the cycle log.

## 5. Build

Commit the project/ changes from steps 3 and 4 on local `main` now (do not push yet).

Ready tasks are status todo with no blocking open question. If there are none, go to step 6.

One release candidate at a time: if a "Release candidate:" pull request is still open, do not start new work on top of it. Only fix what its review comments or failing CI ask for, on its own branch, with the same test loop below; then go to step 6.

Otherwise:
1. `git checkout -b claude/cycle-<YYYYMMDD>-<HHMM> origin/main`. The cycle branch never touches project/; the agents get their tasks from you.
2. Pick a batch of ready tasks that makes sense as one pull request (one phase step, a few related tasks). Set them to doing.
3. Run the **game-dev** agent with the task rows verbatim, the branch name, and any relevant answers. Keep its report.
4. Run the **unit-tester** agent with the task rows and game-dev's "Rules changed" and "Please test". Then run the **functional-tester** agent with the same.
5. If either tester reports bugs, give the bug reports verbatim to game-dev, then run both testers again. At most two fix rounds. If bugs remain after that, mark the affected tasks blocked, add an Open question describing the bug and the options, and leave out of the pull request any work that is broken (revert those commits on the branch if needed).
6. Check RULES.md: for every rule changed this cycle (game-dev's "Rules changed" plus your own reading of `git diff origin/main -- src`), the number in RULES.md must equal the number in the code. If not, send game-dev back to fix RULES.md, then re-run unit-tester.
7. Check ownership: `git diff --name-only origin/main` must show no tests/ files in game-dev's commits and no src/ files in the testers' commits. If it does, revert those changes and record it in the log.
8. Push: `git push -u origin <branch>`.
9. Open the pull request through the REST API (gh pr commands are blocked in cloud sessions):
   `gh api repos/<owner>/<repo>/pulls -f title="Release candidate: <summary>" -f head=<branch> -f base=main -f body=@<file>` (or `--input` with a JSON body). The body lists: the task IDs (one line "Tasks: T-001, T-002"), what changed in player terms, rules changed with old → new values, unit and e2e results (counts and any skipped areas), and known issues. If `gh` fails, open it with the GitHub MCP `create_pull_request` tool.
10. Never merge it.

## 6. Design review

Run this on every full cycle, after the tests, even when nothing was built. Proposals come only from headless simulation results and the code; there are no screenshots.

1. Run the simulation on the code just tested: the cycle branch if step 5 built or fixed one, otherwise `origin/main`. Note the commit.
2. Run 3 seeds with the default setup (no `--preset`), named `review-<YYYYMMDD>-1` to `-3`, for at least 300 years: `node tools/headless.js --seed <seed> --ticks 400 --every 25` for the timeline and the same with `--json` for the final numbers. Collect, per seed: population per civ over time, causes of death, the levels each civ reached and the year it reached them, and extinctions with the year. If headless does not report something on this list, write down what is missing and add one game-dev task to report it from tools/headless.js (unless one already exists); never estimate a missing number.
3. Read the code behind what you saw: src/sim for the rules, src/render and src/ui for what the player sees (how people are drawn and moved, what changes on screen over a run, what animates and what does not).
4. Write at most 2 new proposals, and none if 6 proposals under "Proposals" already have an empty "Decision:". Each one must point to something concrete in this run or the code, with numbers or a `file:line`: a civ that dies early on every seed, a stretch of years where nothing changes, a screen that looks flat because nothing on it varies, people that jump from hex to hex instead of moving. A hunch without evidence is not a proposal.
   - Vary the categories: two proposals in one cycle have different categories, and of the last three proposals ever written (by ID, including Answered), at least one is about visuals or animation. If the next proposal would break that, it must be visuals or animation, or you write none.
   - Never re-propose something the user answered "no" to, in any wording; check "Answered" first. A "later" proposal may come back once, with new evidence, citing its old ID. Do not propose what is already a task or an open question.
5. Back on local `main`, add each under "Proposals" in project/QUESTIONS.md, next free ID across the whole file:

```
### P-###: <short title>
- Date: <YYYY-MM-DD>
- Category: <gameplay | balance | scale | visuals | animation | UI>
- What: <the change, in player terms>
- Evidence: <what the run or the code showed: seeds, years, numbers, file:line>
- Effort: <S | M | L>
- Phone performance risk: <low | medium | high>: <why>
- Decision:
```

Record the seeds, commit and headline numbers in the cycle log even when you propose nothing.

## 7. Questions

Ask only about decisions that belong to the user (design, scope, trade-offs) or blockers you cannot clear. At most 3 new questions per cycle. Each goes under "Open" in project/QUESTIONS.md:

```
### Q-###: <question>
- Date: <YYYY-MM-DD>
- Why it matters: <one or two sentences>
- Options:
  1. <option>: <consequence>
  2. <option>: <consequence>
  3. <option>: <consequence>   (optional)
- Recommendation: <option number and why>
- Answer:
```

Mark tasks a question blocks as blocked with the question ID as source, and keep working on anything it does not block.

## 8. Record and publish project/

On local `main`:
- project/TASKS.md: final status of every task touched.
- project/QUESTIONS.md: new questions and proposals; answered and decided entries moved.
- project/PROGRESS.md: update the status block at the top (phase, "Last full cycle: <YYYY-MM-DD HH:MM> UTC", what is live on GitHub Pages, open release candidate, blockers), then add a cycle-log entry under "Cycle log", newest first: what was decided, built, tested, opened, merged, blocked.
- A throttled run (step 2) writes nothing. A run that does steps 3-8 is a full cycle, even when nothing was ready to build.

Commit ("Director cycle <YYYY-MM-DD HH:MM>") and `git push origin main`. Only project/ files may be in this push; if the hook blocks it, find the stray change instead of working around the hook.

## 9. Email

Only when this cycle produced new questions, new proposals, a new pull request, or a blocker: send one short email with the Gmail connector to the connected account's own address and to no one else. Find that address from the From header of the latest message in `in:sent` (`search_threads`, then `get_message` or `get_thread`); if there is no sent mail to read it from, skip the email and say so in the cycle log.

- Subject: `Population Simulator: <questions | proposals | release candidate | blocker>` (join several with commas)
- Body: a few lines in plain words: what needs the user's answer, with links to the pull request (`https://github.com/<owner>/<repo>/pull/<n>`) and to `https://github.com/<owner>/<repo>/blob/main/project/QUESTIONS.md`, the blocker in one sentence, and each new proposal on one line: `P-###: <title> (<category>, effort <S/M/L>)`.

Otherwise send nothing.
