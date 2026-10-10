---
name: questions
description: Questions chat for the Population Simulator owner - go through open questions one at a time, then open proposals, record each answer or decision in project/QUESTIONS.md, file new requests, and push to main for the next director cycle.
---

# Questions chat

The owner answers the director here instead of editing project/QUESTIONS.md by hand. You record what they say. You never edit code, project/TASKS.md or RULES.md, and you do not turn answers into tasks: the next director cycle does that.

## 1. Read

- `git fetch origin && git checkout main && git pull --ff-only origin main`.
- Read project/QUESTIONS.md and RULES.md, and the "Last full cycle" line at the top of project/PROGRESS.md.

## 2. Open questions, one at a time

For each question under "Open" whose "Answer:" line is empty, oldest first, show one at a time: the ID and question, why it matters, each option on its own line, and the director's recommendation. Wait for the answer before showing the next one.

Accept short answers: an option number, "yes", "the recommendation", "skip". If there are no open questions, say so in one line.

## 3. Then open proposals, one at a time

For each proposal under "Proposals" whose "Decision:" line is empty, oldest first, the same way: ID and title, category, what it is, the evidence, effort, and phone performance risk. Ask for yes, no, later, or the changes they want. "skip" leaves it for later. If there are none, say so in one line.

## 4. Check before you record

- If an answer is ambiguous (it could mean two options, or "changes" without saying which), ask one short follow-up before recording it.
- If an answer contradicts RULES.md (it asks for something a rule rules out, or changes a number without saying so), name the rule and its value and ask whether they mean to change it. If they do, record the answer with that rule change spelled out.
- Anything the user asks for that is not an answer to the item in front of them is a new request: confirm it in one line and file it under "Requests" as one bullet.

## 5. Record

- Write each answer after its "Answer:" line and each decision after its "Decision:" line, in the user's words. When they were brief (a number, "yes", "later"), add a one-line reading after it, for example `2 (reading: keep hard borders until Phase 4, as recommended)`.
- Leave every entry where it is: the director moves it to "Answered" and creates the tasks.
- Change nothing else in the file.

## 6. Publish

Commit only project/QUESTIONS.md ("Answers <YYYY-MM-DD HH:MM> UTC") and `git push origin main`. If the push is rejected because main moved (a director cycle pushed meanwhile), `git pull --no-rebase origin main`, keep both sides' entries if the file conflicts, and push again. If nothing was recorded, push nothing.

## 7. Close

Tell the user in a line what was recorded, then when the next director cycle runs. The "Release Director" routine runs the director at five past every hour (UTC):
- If you recorded anything, the next run (the next HH:05 UTC) does a full cycle, because new answers, decisions and requests skip its throttle.
- Otherwise the next full cycle is the first HH:05 UTC at least 3 hours 50 minutes after "Last full cycle" in project/PROGRESS.md.
