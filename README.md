# LPU Tracker (beta)

Phone app for Love, Peace & Unity: event check-in (including QR self check-in), books
(donations, in-kind gifts, expenses, paying people with a signature), an impact dashboard and
printable funder report, and a filings calendar that prepares every IRS and Michigan form.

Shipped 2026-09-23 (Plans 1–5). Not yet done: filling the official 990-EZ/8868 PDFs (the app
produces line-by-line worksheets instead), and the Supabase move for real personal data.

**Beta: test data only.** This repo is public. `data/` is the beta database. Do not enter real
people's information until the move to Supabase.

- App: https://gholsona171.github.io/lpu-tracker/ (add to home screen)
- Public check-in endpoint: `worker/` (Cloudflare Worker `lpu-checkin`)
- Design: `docs/superpowers/specs/2026-09-23-lpu-tracker-design.md`

## Develop

    npm test                          # unit tests (Node 24, no dependencies)
    node scripts/dev-server.mjs 8080  # serve site/
    node scripts/mock-worker.mjs 8787 # local check-in Worker with in-memory data

For local self check-in testing, run `localStorage.setItem('lpu.worker','http://localhost:8787')`
in the browser console, then open `checkin.html?e=local-event&k=localkey`.

## Deploy

- Site: push to `main`; GitHub Actions publishes `site/` to Pages.
- Worker: `cd worker && npx wrangler@latest deploy`. The GitHub token is a Worker secret:
  `npx wrangler@latest secret put GITHUB_TOKEN` (fine-grained, this repo only, Contents read/write).
