# LPU Tracker Plan 3 — Impact Dashboard + Report

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show who LPU reaches and helps, compared to its targets, and print a year-end impact report for funders.

**Architecture:** One pure function `impactSummary()` in `site/js/domain/impact.js` turns the loaded state into every number the dashboard and report show. The dashboard (`#/impact`) renders CSS bars from it; the report (`#/report`) is a print-styled page of the same numbers plus the mission text.

**Spec:** design doc §7.6 (Impact) and §9 (Impact report). Content rules: mission verbatim, no home address, no dollar suggestions, plain warm tone.

## Global Constraints
- Community workers appear as counts and totals only.
- "Not given" is a real category everywhere a question was skipped.
- Unique people = distinct `personId` across check-ins at events in the fiscal year. First-timers = unique people whose earliest check-in ever is in the year.

### Task 1: impact.js + tests
`impactSummary({events, people, checkins, expenses, payees, settings, fy, fyEnd, now})` returns
`{eventsHeld, visits, uniquePeople, firstTimers, returning, byZip:[{zip,count}], targetZipShare, byAge:[{label,count}], byRole:[{label,count}], help:{food_bag,meal,referral}, householdsReached, peopleInHouseholds, volunteers, gender:[{label,count}], race:[{label,count}], veteran:[{label,count}], work:{people,payments,cents}, targets:[{key,label,value,target}]}`.
Tests: two events in FY and one outside; a person at both events counts once; first-timer vs returning; ZIP share against `targets.targetZips`; skipped answers land in "Not given"; help totals; household reach = sum of householdSize (default 1) over check-ins that got food or a meal, counted once per person; work totals only count `communityWorker` payees.

### Task 2: dashboard + report UI
- `#/impact`: FY picker, headline stats (people, visits, first-timers, events), target bars, help given, ZIP list (top 8 + other), age, role, demographics, work opportunities, button "Print report".
- `#/report`: print page: logo, org name, "Impact report" + fiscal year, mission (Settings `mission`), events list, all numbers as short tables, footer with EIN and website. Print stylesheet hides app chrome.
- Settings gains a `mission` field (default verbatim text) and `hasEmployees` stays hidden.
- Tabs become Today · Events · Books · Impact · Settings.
- Browser test in demo mode with the data from Plan 2 plus a few check-ins.
