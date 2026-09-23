# LPU Tracker Plan 4 — Compliance Calendar + Generated Forms

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Filings screen that lists every IRS and Michigan filing LPU owes for a fiscal year, with due dates, status, a "Needs you" checklist, the generated form or letters, a way to mark each one filed, and a calendar export.

**Architecture:** `site/js/domain/compliance.js` holds the rules as data + pure functions (`due`, `applies`, `readiness`) evaluated against the loaded state; `site/js/domain/forms.js` computes each form's field values; `site/js/ui/filings.js` lists and details them; `site/js/ui/form-sheets.js` renders printable answer sheets and letters. Filing status lives in `data/filings.json`.

**Spec:** design doc §8 (Compliance engine), §5a (945), plus the filing table agreed in chat.

## Global Constraints
- The app prepares; it never files. Every sheet carries "Prepared by LPU Tracker for review. Not a filed form."
- TINs are typed at print time only and never saved.
- Thresholds keyed by year: 1099-NEC 2025 $600, 2026+ $2,000; 990-N normally-≤$50k test per Form 990 instructions Appendix B (first year ≤ $75k; years 2–3 average of first two ≤ $60k; then 3-year average ≤ $50k); 990-EZ receipts < $200k and assets < $500k.
- Due dates from `fyEnd`: 990 family = 15th of the 5th month after year end; 1099-NEC, 945, donor letters = Jan 31 after year end; MI annual report = Oct 1 of the fiscal year; MI solicitation renewal/exemption = last day of the 7th month after year end.

### Task 1: compliance.js + tests
Rules: `irs-990`, `1099-nec`, `form-945`, `donor-acks`, `donor-statements`, `mi-annual-report`, `mi-solicitation`, `payroll` (info only, off unless `hasEmployees`).
`evaluate(ctx)` → `[{id, name, agency, fy, due, applies, variant, ready, needsYou:[], notes:[], status}]` where status ∈ `not-required | filed | overdue | due-soon | needs-you | ready | upcoming`. `status` uses `filings` records and `today`.
`icsFor(items)` → iCalendar text with one all-day VEVENT per applicable item, alarm 30 days before.
Tests: due-date math for 12-31 and 03-31; 990 variant at $50,000 / $50,000.01 for a 4-year-old org and the first-year $75k rule; 1099 applies at $1,999.99 vs $2,000.00; 945 only when withheld; donor-acks at $249.99 vs $250; MI exemption at $24,999 vs $25,000; statuses for filed/overdue/due-soon.

### Task 2: forms.js + tests
`form990N(ctx)`, `form990EZ(ctx)`, `form1099NEC(ctx)` (one entry per payee; TIN placeholder), `irisCsv(entries, tins)`, `form945(ctx)`, `donorLetters(ctx)` (acknowledgment text per IRS Pub 1771 incl. quid-pro-quo wording), `donorStatements(ctx)`, `miAnnualReport(ctx)`, `miSolicitation(ctx)`.
Tests: 990-N fields; 990-EZ line totals equal the books; 1099 box 1 = services only; letter wording includes "no goods or services" or the goods value.

### Task 3: UI
- `#/filings` with FY picker: rows with due date, status pill, sorted by due. Today screen shows items overdue or due within 30 days.
- `#/filing/<id>/<fy>`: description, due, notes, needs-you checklist, "Open form" (renders sheet in print layout with TIN inputs where needed), "Mark as filed" (date + confirmation), "Not required this year" override with reason, "Add to calendar" (.ics download of all items for the year).
- Settings gains: `firstFiscalYear` (2024), `netAssetsStart` per year (for 990-EZ line 19) as a simple text field, `paidFundraisers` (no).
- Browser test in demo mode with Plan 2/3 data; print preview of a donor letter and the 1099 sheet.
