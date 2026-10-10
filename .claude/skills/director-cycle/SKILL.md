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

Skip this step when the user started this skill themselves in a live session. In that case, talk the decisions in steps 3 and 6 through with them before step 5.

Otherwise (a scheduled run): stop now, without changing or pushing anything, if both are true:
- less than 3 hours 50 minutes have passed since "Last full cycle" at the top of project/PROGRESS.md, and
- project/QUESTIONS.md has no new input: no question under "Open" with text after "Answer:", and no entry under "Requests".

## 3. Turn answers and requests into tasks

Work on a local `main` that matches `origin/main` (`git checkout main && git reset --hard origin/main` only if there are no local commits; otherwise `git pull --ff-only`).

For each answered question and each request:
- Add tasks to project/TASKS.md: next free ID (T-###), a short title, an owner (game-dev, unit-tester or functional-tester), status todo, source (the question or request ID, or the phase), and acceptance criteria someone can check. A task that changes a game rule says "update RULES.md" in its criteria, and gets matching unit-tester and functional-tester tasks.
- Requests have no ID until you give them one: R-### in order.
- Move the entry, with its answer, to "Answered" with today's date and the task IDs it produced. A rule change from the user also goes into CLAUDE.md or this skill through the next release-candidate pull request if it changes how the studio works.

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

## 6. Questions

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

## 7. Record and publish project/

On local `main`:
- project/TASKS.md: final status of every task touched.
- project/QUESTIONS.md: new questions; answered entries moved.
- project/PROGRESS.md: update the status block at the top (phase, "Last full cycle: <YYYY-MM-DD HH:MM> UTC", what is live on GitHub Pages, open release candidate, blockers), then add a cycle-log entry under "Cycle log", newest first: what was decided, built, tested, opened, merged, blocked.
- A throttled run (step 2) writes nothing. A run that does steps 3-7 is a full cycle, even when nothing was ready to build.

Commit ("Director cycle <YYYY-MM-DD HH:MM>") and `git push origin main`. Only project/ files may be in this push; if the hook blocks it, find the stray change instead of working around the hook.

## 8. Email

Only when this cycle produced new questions, a new pull request, or a blocker: send one short email with the Gmail connector to the connected account's own address and to no one else. Find that address from the From header of the latest message in `in:sent` (`search_threads`, then `get_message` or `get_thread`); if there is no sent mail to read it from, skip the email and say so in the cycle log.

- Subject: `Population Simulator: <questions | release candidate | blocker>`
- Body: a few lines in plain words: what needs the user's answer, with links to the pull request (`https://github.com/<owner>/<repo>/pull/<n>`) and to `https://github.com/<owner>/<repo>/blob/main/project/QUESTIONS.md`, and the blocker in one sentence.

Otherwise send nothing.
