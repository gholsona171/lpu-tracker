# LPU Tracker — Design

**Date:** 2026-09-23
**Org:** Love, Peace & Unity (LPU), Detroit 501(c)(3), EIN 99-0471961
**Status:** Beta. Test data only. GitHub is the database now; Supabase later.

## 1. Purpose

One phone app that:

1. Checks people in at LPU events, including **self check-in by QR code**, so LPU can show
   funders who it reaches (unique people, where they live, ages) and who it actually helped
   (food bags, meals, referrals).
2. Keeps simple books (donations, in-kind gifts, expenses, contractor payments).
3. Runs a **compliance calendar** for every IRS and Michigan filing LPU owes, and
   **auto-produces each form** when its data is complete, leaving a short "Needs you" list
   for things only a person can do (signatures, contractor TINs, pressing Submit on a
   government site).
4. Produces the year-end impact report.

Everything tax-related is preparation for filing, not filing. The app never submits
anything to a government system.

## 2. Decisions already made

| Decision | Choice |
|---|---|
| Fiscal year | **Calendar year (Dec 31).** Bylaws (Mar 27) to be amended by Kamia. Stored as a setting. |
| Beta data | Test data only, JSON in the GitHub repo. Real personal data waits for Supabase. |
| Check-in fields | Basics, help received, role at event, optional demographics (all four groups). |
| Self check-in | Real QR self check-in now, through a Cloudflare Worker (§4). |
| Hosting | GitHub Pages, installed to the home screen as a PWA. |

## 3. Architecture

```
lpu-tracker/                     (public repo gholsona171/lpu-tracker)
  site/                          static PWA, served by GitHub Pages
    index.html                   admin app shell (hash routes)
    checkin.html                 public self check-in page (QR target)
    manifest.webmanifest, sw.js  install + offline shell
    js/store/                    storage adapters — the ONLY code that knows about GitHub
      github.js                  admin reads/writes via GitHub Contents API
      queue.js                   IndexedDB outbox for offline saves
    js/domain/                   pure logic, no DOM, no network (unit tested)
      fiscal.js                  fiscal-year boundaries, due-date math
      people.js                  person key, dedupe, age range from birth year
      merge.js                   record merge by id + updatedAt
      impact.js                  dashboard + impact report numbers
      books.js                   receipts, expenses, 990 line totals
      compliance.js              filing rules, due dates, readiness, "Needs you"
      forms/                     one module per form output
    js/ui/                       screens
    vendor/                      qrcode generator, pdf-lib (no CDN at runtime)
    forms/                       official blank PDFs (f1099nec, f990ez, f8868)
  worker/                        Cloudflare Worker: public check-in endpoint
  data/                          THE BETA DATABASE (JSON)
  tests/                         node:test unit tests for js/domain and worker logic
```

No build step. ES modules loaded directly. Every file under 500 lines.

**Swap point for Supabase:** `js/store/*` on the admin side and `worker/store.js` on the
public side. Domain and UI code never import GitHub-specific code.

## 4. Self check-in by QR

Flow:

1. Admin creates an event. The app generates a random `eventKey` and shows a QR code for
   `checkin.html?e=<eventId>&k=<eventKey>`. It can be shown full-screen at the door or printed.
2. Guest scans the code and gets a one-screen form (big buttons, works on any phone, no
   install, no account).
3. The form POSTs to the Worker at `/checkin`.
4. The Worker (holds the GitHub token as a secret, never exposed):
   - verifies the event exists, the key matches, and it is inside the check-in window
     (1 hour before start to 2 hours after end);
   - validates and trims every field against an allow-list; unknown fields are dropped;
   - rate-limits: max 5 submissions per IP per 10 minutes, max 500 per event;
   - finds or creates the person (§5 person key) and appends the check-in;
   - writes to `data/` with SHA-checked commits, retrying on conflict (§6).
5. Guest sees "You're checked in" with the event name.

Door volunteers also use the admin app's own check-in screen (faster search, can record
help given). Both paths produce identical records; `source` is `self` or `volunteer`.

Help received is recorded by the volunteer, not the guest (guests cannot claim a food bag).
The self check-in form covers basics, role, household size and optional demographics.

## 5. Data model (`data/*.json`)

Every record: `id` (random UUID), `createdAt`, `updatedAt`, `deleted` (soft delete).

- **settings.json** — org name, EIN, address, principal officer, website, fiscal year end
  (`12-31`), has-employees flag (off), impact targets.
- **events.json** — name, date, start/end time, location, `eventKey`, program.
- **people.json** — `personKey`, first name (or initials), last initial, ZIP, birth year,
  optional gender, race/ethnicity, veteran status. Each optional field accepts
  "prefer not to say".
  - `personKey` = lowercase first name + last initial + ZIP + birth year. Returning guests
    match on it. If any part is missing, no match is attempted (they count as a new person
    and are flagged "unmatched" so a volunteer can merge later).
- **checkins/<eventId>.json** — personId, role (attendee, performer, volunteer, food
  recipient), household size, help received (`food_bag`, `meal`, `referral` + note),
  source, time. One file per event keeps concurrent writers apart.
- **donations.json** — date, donor (name, address, email), kind (`cash` | `in_kind`),
  amount or fair-market value, description of in-kind goods, method (Zeffy, cash, check),
  goods/services given in return + their value, event link.
- **expenses.json** — date, payee, amount, functional category (program / management /
  fundraising), `isContractorService`, payee id.
- **payees.json** — name, address (may be blank or "c/o" a shelter), `kind`
  (`individual` | `business`), `w9OnFile` (yes/no + date), `tinStatus`
  (`unknown` | `provided` | `refused`), `communityWorker` flag (see §5a).
  **TINs are never stored** in the beta; they are typed in at the moment a 1099 is
  generated and discarded.
- **payments.json** — payee, date, amount, method (cash, Cash App, check, gift card),
  work done (e.g. "lot cleanup"), event link, goods-vs-services split, backup withholding
  amount, signed-receipt flag.

## 5a. Paying people (individuals, not businesses)

LPU will pay people who are not businesses: someone struggling on the street paid to clean
the lot before or after an event, an individual cooking or serving food, a performer. The
app treats this as a normal, expected case, not an exception.

- **Pay-someone flow on the phone, in under a minute:** name (a first name or nickname is
  enough to start), what they did, amount, how paid. The person signs on the phone screen
  to confirm they were paid. That signed record is LPU's proof of the expense.
- **No paperwork up front for small amounts.** Nobody is turned away for lacking ID, an
  address or a Social Security number.
- **Running total per person per year** is always visible. The app nudges at $1,500 to
  collect a W-9 before the person crosses the $2,000 1099 threshold (2026 figure; kept by
  tax year).
- **If someone reaches the threshold without giving a TIN,** federal rules require 24%
  backup withholding on further payments. The app calculates it on the payment screen,
  tracks the withheld total, and adds **Form 945** (annual backup withholding return,
  due Jan 31) and the deposit reminder to the Filings calendar. The 1099-NEC is still
  generated with "TIN not provided".
- **Goods vs services:** paying someone for food (goods) is not 1099-reportable; paying
  them to cook or serve (services) is. A payment can be split so only the service part
  counts toward the 1099 total.
- **Employee vs contractor:** the IRS decides by who controls the work, not by the label.
  One-off odd jobs are generally contractor work. If the same person works on a regular
  schedule under LPU's direction, the app shows a warning on their record that this may be
  employment (W-2, withholding, Michigan rules) and to check with a preparer before
  continuing. The app does not decide this.
- **Impact:** payments to community members count as a program outcome ("work
  opportunities": people paid, hours, dollars put directly into the community) on the
  dashboard and year-end report. Payees flagged `communityWorker` are reported by count
  and totals only, never by name.
- **filings.json** — filing id + tax year, status, filed date, confirmation number, notes.

## 6. Storage and sync

- **Admin phones** talk to GitHub directly using a fine-grained token (this repo only,
  Contents read/write). The owner creates and pastes it once per phone; it lives only in
  that phone's storage.
- **Writes** are read-modify-write with the file's SHA. On a 409/422 conflict: re-read,
  merge by `id` (newer `updatedAt` wins, deletes are kept), write again. Up to 5 tries.
- **Offline:** every save goes into an IndexedDB outbox first, then syncs. The UI shows
  a pending count. Nothing is lost if the venue has no signal.
- **Reads** load all JSON at startup and cache it; pull-to-refresh re-reads.
- **Data location** is a setting (`owner/repo/path`) so it can be pointed at a private
  repo without code changes.

## 7. Screens

1. **Today** — next event, check-in counter, sync status, compliance alerts due within
   30 days, "Needs you" items.
2. **Check-in** (volunteer) — search returning guests by name/ZIP, quick add, record help.
3. **Event QR** — full-screen QR, live count, printable poster.
4. **Events** — list, create, edit.
5. **Books** — donations, in-kind, expenses, payees/W-9 status.
6. **Impact** — unique people, visits, new vs returning, ZIP breakdown, age mix, roles,
   help given, each vs its target. Filter by fiscal year or date range.
7. **Filings** — the compliance calendar (§8), each item opening its generated form.
8. **Settings** — org details, fiscal year, targets, GitHub connection, data location.

## 8. Compliance engine

Each filing is a rule in `compliance.js`:

```
{ id, name, agency, dueDate(taxYear, settings), appliesTo(books, settings),
  readiness(books, settings) -> { ready: bool, needsYou: [..] }, generate(...) }
```

Statuses: `not-required`, `upcoming`, `ready`, `needs-you`, `filed`, `overdue`.
Reminder at 30 days before the due date, on the Today screen. Whole calendar exports to
`.ics` for the phone's calendar.

| Rule | Applies when | Due (calendar FY) | Output |
|---|---|---|---|
| 990-N e-Postcard | gross receipts normally ≤ $50,000 (3-year test) | May 15 | Answer sheet with every field the IRS site asks for |
| 990-EZ | normally > $50,000 and < $200,000, assets < $500,000 | May 15 | Official PDF filled, line totals from books |
| 990 | above 990-EZ limits | May 15 | Flag: "Use a preparer"; export line-mapped totals |
| 8868 extension | 990-EZ/990 and user asks | May 15 | Official PDF filled |
| 1099-NEC | payee paid ≥ $2,000 in the year for services (2026+; $600 for 2025) | Jan 31 | Official PDF, copies B and C for the payee plus IRIS upload CSV. Needs you: TIN at print time, W-9 on file |
| 945 backup withholding | any backup withholding in the year (§5a) | Jan 31 | Answer sheet with totals; Needs you: deposit + file |
| Donor acknowledgment | single gift ≥ $250 | Jan 31 | Letter per donor with the required statement about goods/services |
| Quid-pro-quo disclosure | payment > $75 partly for goods/services | At gift | Flag on the donation + receipt wording |
| Year-end donor statements | any donor with gifts in the year | Jan 31 | One letter per donor (courtesy) |
| MI annual report CSCL/CD-2000 | always | Oct 1 | Answer sheet; Needs you: file on LARA site, $20 |
| MI solicitation registration or CTS-03 exemption | always | 7 months after FY end (Jul 31) | Tells which one applies (< $25,000 and volunteers only → exemption) and pre-fills answers |
| W-2/W-3, 941, MI withholding | has-employees flag on | per schedule | Hidden while flag is off (not in beta scope beyond the flag) |

Thresholds are data keyed by tax year so they can be updated each year. 3-year
"normally" test uses the average of the current and two prior years where data exists;
with less history it follows IRS rules for new orgs (≤ $75,000 in first year, etc.) —
this is explained on screen, not hidden.

**Backfill:** Filings lets the owner mark past years as filed / not filed (2024 short
year and 2025 990-N status are currently unknown).

## 9. Impact report

Printable page (phone "Share → Print → Save as PDF"): mission (verbatim from settings),
events held, unique people, total visits, first-timers, ZIP map-as-table, age ranges,
help delivered (food bags, meals, referrals, household members reached), volunteer count,
progress vs targets. No home address. No dollar suggestions. Plain warm tone.

## 10. Security and privacy (beta)

- Repo is public; data is test data only. A banner reads "BETA — test data only".
- Worker token: fine-grained, this repo, Contents write only; stored as a Worker secret.
- Worker validates, rate-limits and never echoes stored data back to the public.
- TINs never stored. Donor emails/addresses exist only as test values.
- Before any real data: move to Supabase with row-level security, the check-in endpoint
  becoming an insert-only policy.

## 11. Testing

- `node --test` unit tests for all of `js/domain` and the Worker's validation/merge
  logic: fiscal math, due dates, person key, merge conflicts, impact totals, 990 line
  totals, every compliance threshold edge ($249.99 / $250, $1,999.99 / $2,000, $75 /
  $75.01, $50,000 / $50,000.01), readiness lists.
- End-to-end in the browser: a simulated year of test events with self and volunteer
  check-ins, donations and a contractor, then every generated form checked against the
  hand-computed totals.
- Real-device check on the owner's phone after install.

## 12. Out of scope for the beta

Supabase migration, real personal data, employee payroll forms, multiple organizations,
email/SMS sending, online form submission to any government system.

## 13. Build phases

1. Skeleton: repo, Pages, PWA install, settings, GitHub store + outbox, events.
2. Check-in: volunteer screen, Worker, QR + self check-in page.
3. Books: donations, in-kind, expenses, payees, pay-someone flow with signature (§5a).
4. Impact dashboard + report.
5. Compliance calendar, 990-N/MI answer sheets, donor letters, `.ics` export.
6. Official PDF fills: 1099-NEC (+ IRIS CSV), 990-EZ, 8868.
7. Year simulation, fixes, install on phone.
