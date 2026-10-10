---
name: questions
description: Walk the owner through the Population Simulator's open questions and proposals in project/QUESTIONS.md, record each answer or decision, and push it to main for the next director cycle.
---

# Questions

The user answers the director here instead of editing project/QUESTIONS.md by hand. You record what they say; you do not turn it into tasks (the next director cycle does that).

## 1. Read

`git fetch origin && git checkout main && git pull --ff-only`, then read project/QUESTIONS.md.

## 2. Show open questions first

For each question under "Open" whose "Answer:" line is empty, oldest first: the ID, the question, why it matters, the options in one line each, and the director's recommendation. Ask for an answer: an option number, or their own words. They may skip one.

If there are none, say so in one line.

## 3. Then open proposals

For each proposal under "Proposals" whose "Decision:" line is empty, oldest first: the ID and title, category, what it is, the evidence, effort, and phone performance risk, each in a line or two. Ask for a decision: yes, no, later, or the changes they want. They may skip one.

If there are none, say so in one line.

## 4. Record

- Write each answer after its "Answer:" line and each decision after its "Decision:" line, in the user's words (a bare option number, or "yes", "no", "later", or their changes). Leave the entry where it is: the director moves it to "Answered" and creates the tasks.
- A new request the user mentions goes under "Requests" as one bullet.
- Change nothing else in the file.

## 5. Publish

Commit only project/QUESTIONS.md ("Answers <YYYY-MM-DD HH:MM> UTC") and `git push origin main`. If the push is rejected because main moved, `git pull --rebase origin main` and push again. Tell the user in one line what was recorded and that the next director cycle picks it up.
