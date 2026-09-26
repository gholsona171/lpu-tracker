# LPU Tracker (beta, archived)

This was the GitHub-Pages beta of the Love, Peace & Unity tracker (2026-09-23). It has moved
into the website repo as the team portal: https://github.com/gholsona171/lovepeaceunity
(`team/`), running on Supabase at https://lovepeaceunity.org/team/.

Kept for history: the design spec and plans under `docs/design/`. Nothing here is deployed
any more; `data/` holds only test data.

## Why I built it this way

**The problem.** Love, Peace & Unity needed to check people in at community events, keep
simple books, and track filing deadlines, on volunteers' phones, often with no signal, and
with no budget for software.

**What I tried first.** This beta used no database at all. The app was static pages on GitHub
Pages, and each save wrote a JSON file into a GitHub repo through the GitHub API. Saves went
into an offline outbox on the phone first, then synced. When two phones changed the same file,
it re-read the file, merged by record id (newer change wins, deletes kept) and tried again.
It cost nothing to run, and every change had a history.

**Why I moved off it.** The weak point was the data itself. Check-in records are about real
people, and keeping them as files in a repo meant access control depended on repo settings
and tokens on each phone. I moved the tracker to Supabase with row-level security, so the
database decides who can read what. That version is the team portal in the website repo.

**What carried over:** the offline outbox, the merge rules, and the unit tests for the logic
(`npm test`, 68 tests).

`docs/design/` has the spec and build plans I wrote before building. I build with AI coding
tools; I write the specs and review the code and test results before anything ships.
