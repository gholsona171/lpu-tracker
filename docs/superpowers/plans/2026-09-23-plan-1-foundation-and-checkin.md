# LPU Tracker Plan 1 — Foundation + Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable phone app on GitHub Pages where LPU creates events, checks people in at the door, and shows a QR code guests scan to check themselves in, with all data saved as JSON in the GitHub repo.

**Architecture:** No-build ES-module PWA in `site/`. Pure logic in `site/js/domain/` (unit tested with `node --test`). Storage behind one interface (`readJson`, `update`, `listDir`) with three adapters: GitHub (real), memory (demo + tests), and an IndexedDB outbox for offline saves. A Cloudflare Worker in `worker/` is the only public write path; it reuses the same domain and GitHub store code.

**Tech Stack:** Vanilla JS (ES2022 modules), IndexedDB, GitHub REST Contents API, Cloudflare Workers (wrangler), GitHub Pages via Actions, qrcode-generator 2.0.4 (MIT, vendored), Node 24 `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-23-lpu-tracker-design.md`

**Later plans:** Plan 2 = Books + pay-someone flow. Plan 3 = Impact dashboard + report. Plan 4 = Compliance calendar + generated forms. Plan 5 = year simulation + install.

## Global Constraints

- Beta: test data only. A visible "BETA — test data only" banner on every admin screen and the public check-in page.
- Only first name is required at check-in; every other field is skippable and stored as `''` when skipped.
- Fiscal year end is a setting, default `12-31`.
- Every record has `id`, `createdAt`, `updatedAt`, `deleted`. Deletes are soft.
- Every file under 500 lines. No build step. No runtime CDN for scripts (fonts from Google Fonts are allowed).
- Time zone for events: `America/Detroit`.
- Help received is recorded by volunteers only, never by the public form.
- Tokens are never committed, never logged, never sent anywhere except `api.github.com`.
- Brand: Fraunces (headings) + Karla (body), gold `#e7b04a` for primary buttons, real LPU logo PNG only.
- Tone: plain and warm, no exclamation points.

## File map

```
package.json                     test script only, "type": "module"
site/index.html                  admin shell
site/checkin.html                public self check-in page
site/manifest.webmanifest, sw.js, icons/icon-192.png, icons/icon-512.png
site/css/app.css
site/js/config.js                WORKER_URL, SITE_URL, defaults
site/js/domain/ids.js            uuid, nowIso, randomKey, stamp
site/js/domain/fiscal.js         fiscalYearFor, fiscalYearRange
site/js/domain/time.js           localToUtc, checkinWindow, isOpen, todayLocal
site/js/domain/options.js        ROLES, GENDERS, RACES, HELP, VETERAN
site/js/domain/people.js         norm, findMatch, fillBlanks, ageRange
site/js/domain/merge.js          mergeRecords
site/js/domain/validate.js       sanitizeGuest, sanitizeEvent
site/js/domain/checkin.js        recordCheckin (shared by Worker + door screen)
site/js/store/github.js          createGithubStore
site/js/store/memory.js          createMemoryStore
site/js/store/outbox.js          IndexedDB outbox + state cache
site/js/store/db.js              app data layer (load, save, flush)
site/js/ui/dom.js                h(), toast, fmt helpers
site/js/ui/guestform.js          shared guest fields (self + door)
site/js/ui/{setup,today,events,eventqr,door,settings}.js
site/js/app.js                   router + boot
site/js/checkin-page.js          public page logic
site/vendor/qrcode.js            qrcode-generator 2.0.4
worker/wrangler.jsonc, worker/src/index.js, worker/src/limiter.js
data/*.json                      seed test data
.github/workflows/pages.yml
tests/*.test.js
```

---

### Task 1: Project skeleton + ids + fiscal year

**Files:** Create `package.json`, `.gitignore`, `site/js/domain/ids.js`, `site/js/domain/fiscal.js`, `tests/fiscal.test.js`, `tests/ids.test.js`

**Interfaces — Produces:**
- `uuid(): string`, `nowIso(): string`, `randomKey(len=10): string`, `stamp(rec): rec` (fills id/createdAt/deleted, sets updatedAt)
- `fiscalYearFor(dateStr, fyEnd='12-31'): number` (FY label = calendar year the FY ends in)
- `fiscalYearRange(fy, fyEnd='12-31'): {start:'YYYY-MM-DD', end:'YYYY-MM-DD'}`

- [ ] **Step 1: Write failing tests**

```js
// tests/fiscal.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiscalYearFor, fiscalYearRange } from '../site/js/domain/fiscal.js';

test('calendar fiscal year', () => {
  assert.equal(fiscalYearFor('2026-01-01'), 2026);
  assert.equal(fiscalYearFor('2026-12-31'), 2026);
  assert.deepEqual(fiscalYearRange(2026), { start: '2026-01-01', end: '2026-12-31' });
});
test('March 31 fiscal year', () => {
  assert.equal(fiscalYearFor('2026-03-31', '03-31'), 2026);
  assert.equal(fiscalYearFor('2026-04-01', '03-31'), 2027);
  assert.deepEqual(fiscalYearRange(2027, '03-31'), { start: '2026-04-01', end: '2027-03-31' });
});
```

```js
// tests/ids.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stamp, randomKey } from '../site/js/domain/ids.js';

test('stamp fills fields and keeps id/createdAt', () => {
  const a = stamp({ name: 'x' });
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(a.deleted, false);
  const b = stamp({ ...a, name: 'y' });
  assert.equal(b.id, a.id);
  assert.equal(b.createdAt, a.createdAt);
  assert.ok(b.updatedAt >= a.updatedAt);
});
test('randomKey uses unambiguous chars', () => {
  assert.match(randomKey(12), /^[a-hjkmnp-z2-9]{12}$/);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (modules missing)

- [ ] **Step 3: Implement**

```json
// package.json
{ "name": "lpu-tracker", "private": true, "type": "module",
  "scripts": { "test": "node --test tests/" } }
```

```
# .gitignore
node_modules/
.wrangler/
.dev.vars
*.log
```

```js
// site/js/domain/ids.js
export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomKey(len = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHA[b % ALPHA.length]).join('');
}

// Fill standard record fields. Keeps id/createdAt, always refreshes updatedAt.
export function stamp(rec) {
  const t = nowIso();
  return { ...rec, id: rec.id || uuid(), createdAt: rec.createdAt || t, updatedAt: t, deleted: !!rec.deleted };
}
```

```js
// site/js/domain/fiscal.js
// fyEnd is 'MM-DD'. A fiscal year is labeled by the calendar year it ends in.
export function fiscalYearFor(dateStr, fyEnd = '12-31') {
  const [m, d] = fyEnd.split('-').map(Number);
  const [y, mm, dd] = dateStr.slice(0, 10).split('-').map(Number);
  return mm > m || (mm === m && dd > d) ? y + 1 : y;
}

export function fiscalYearRange(fy, fyEnd = '12-31') {
  const [m, d] = fyEnd.split('-').map(Number);
  const start = new Date(Date.UTC(fy - 1, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start, end: `${fy}-${fyEnd}` };
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: project skeleton, ids, fiscal year"`

---

### Task 2: Detroit time + check-in window

**Files:** Create `site/js/domain/time.js`, `tests/time.test.js`

**Interfaces — Produces:** `TZ`, `localToUtc(dateStr, 'HH:MM', tz=TZ): Date`, `checkinWindow(event): {opens: Date, closes: Date}` (1 h before start → 2 h after end; end ≤ start means past midnight), `isOpen(event, now=new Date()): boolean`, `todayLocal(now=new Date(), tz=TZ): 'YYYY-MM-DD'`. Event shape: `{date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM'}`.

- [ ] **Step 1: Failing test**

```js
// tests/time.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localToUtc, checkinWindow, isOpen, todayLocal } from '../site/js/domain/time.js';

const ev = { date: '2026-09-27', start: '17:00', end: '20:00' };
test('EDT conversion', () => {
  assert.equal(localToUtc('2026-09-27', '17:00').toISOString(), '2026-09-27T21:00:00.000Z');
});
test('EST conversion', () => {
  assert.equal(localToUtc('2026-12-27', '17:00').toISOString(), '2026-12-27T22:00:00.000Z');
});
test('window is 1h before to 2h after', () => {
  const w = checkinWindow(ev);
  assert.equal(w.opens.toISOString(), '2026-09-27T20:00:00.000Z');
  assert.equal(w.closes.toISOString(), '2026-09-28T02:00:00.000Z');
  assert.equal(isOpen(ev, new Date('2026-09-27T19:59:00Z')), false);
  assert.equal(isOpen(ev, new Date('2026-09-27T20:00:00Z')), true);
  assert.equal(isOpen(ev, new Date('2026-09-28T02:01:00Z')), false);
});
test('event past midnight', () => {
  const w = checkinWindow({ date: '2026-09-27', start: '22:00', end: '01:00' });
  assert.equal(w.closes.toISOString(), '2026-09-28T07:00:00.000Z');
});
test('todayLocal uses Detroit date', () => {
  assert.equal(todayLocal(new Date('2026-09-28T03:00:00Z')), '2026-09-27');
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**

```js
// site/js/domain/time.js
export const TZ = 'America/Detroit';
const HOUR = 3600000;

function offsetMinutes(date, tz) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value; // "GMT-04:00" or "GMT"
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

export function localToUtc(dateStr, timeStr, tz = TZ) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(guess, tz) * 60000);
}

export function checkinWindow(event) {
  const start = localToUtc(event.date, event.start);
  let end = localToUtc(event.date, event.end);
  if (end <= start) end = new Date(end.getTime() + 24 * HOUR);
  return { opens: new Date(start.getTime() - HOUR), closes: new Date(end.getTime() + 2 * HOUR) };
}

export function isOpen(event, now = new Date()) {
  const w = checkinWindow(event);
  return now >= w.opens && now <= w.closes;
}

export function todayLocal(now = new Date(), tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `git commit -am "feat: Detroit time and check-in window"` (after `git add`)

---

### Task 3: Options, validation, people matching, merge

**Files:** Create `site/js/domain/options.js`, `validate.js`, `people.js`, `merge.js`; tests `tests/validate.test.js`, `tests/people.test.js`, `tests/merge.test.js`

**Interfaces — Produces:**
- `ROLES`, `GENDERS`, `RACES`, `VETERAN`, `HELP`: arrays of `{value, label}`
- `sanitizeGuest(input, {year}): {ok, errors:string[], guest:{firstName,lastName,zip,birthYear,gender,race:string[],veteran}, visit:{role,householdSize}}`
- `sanitizeEvent(input): {ok, errors, event:{name,date,start,end,location,program}}`
- `norm(s)`, `findMatch(people, guest): {person, confidence:'strong'|'likely'} | null`, `fillBlanks(person, guest): person|null` (null when nothing new), `ageRange(birthYear, year): string`
- `mergeRecords(base, incoming): records[]` (by id; newer or equal `updatedAt` from incoming wins)

- [ ] **Step 1: Failing tests**

```js
// tests/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGuest, sanitizeEvent } from '../site/js/domain/validate.js';

test('first name only is enough', () => {
  const r = sanitizeGuest({ firstName: '  Dee ' }, { year: 2026 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.guest, { firstName: 'Dee', lastName: '', zip: '', birthYear: '', gender: '', race: [], veteran: '' });
  assert.deepEqual(r.visit, { role: 'attendee', householdSize: '' });
});
test('first name required', () => {
  assert.equal(sanitizeGuest({ firstName: ' ' }, { year: 2026 }).ok, false);
});
test('bad optional values are dropped, not errors', () => {
  const r = sanitizeGuest({ firstName: 'A', zip: '4821', birthYear: '1800', gender: 'x',
    race: ['black', 'bogus'], role: 'admin', householdSize: '99', evil: '<script>' }, { year: 2026 });
  assert.equal(r.ok, true);
  assert.equal(r.guest.zip, '');
  assert.equal(r.guest.birthYear, '');
  assert.equal(r.guest.gender, '');
  assert.deepEqual(r.guest.race, ['black']);
  assert.equal(r.visit.role, 'attendee');
  assert.equal(r.visit.householdSize, '');
  assert.equal('evil' in r.guest, false);
});
test('names are trimmed and capped at 40', () => {
  const r = sanitizeGuest({ firstName: 'x'.repeat(80) }, { year: 2026 });
  assert.equal(r.guest.firstName.length, 40);
});
test('event validation', () => {
  assert.equal(sanitizeEvent({ name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00' }).ok, true);
  assert.equal(sanitizeEvent({ name: '', date: '2026-9-27', start: '5pm', end: '20:00' }).errors.length, 3);
});
```

```js
// tests/people.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatch, fillBlanks, ageRange, norm } from '../site/js/domain/people.js';

const P = (o) => ({ id: o.id, firstName: '', lastName: '', zip: '', birthYear: '', deleted: false, ...o });
const people = [
  P({ id: '1', firstName: 'Dee', lastName: 'Smith', zip: '48216', birthYear: 1990 }),
  P({ id: '2', firstName: 'Ray', lastName: '' }),
];
test('norm strips accents, case, punctuation', () => assert.equal(norm(" José-Luis "), 'joseluis'));
test('strong match on name + zip', () => {
  assert.deepEqual(findMatch(people, { firstName: 'dee', lastName: 'SMITH', zip: '48216' }),
    { person: people[0], confidence: 'strong' });
});
test('likely match on name only', () => {
  assert.equal(findMatch(people, { firstName: 'Dee', lastName: 'Smith' }).confidence, 'likely');
});
test('conflicting zip means different person', () => {
  assert.equal(findMatch(people, { firstName: 'Dee', lastName: 'Smith', zip: '48209' }), null);
});
test('deleted people never match', () => {
  assert.equal(findMatch([{ ...people[1], deleted: true }], { firstName: 'Ray' }), null);
});
test('fillBlanks only fills empty fields', () => {
  assert.equal(fillBlanks(people[0], { zip: '48209' }), null);
  assert.equal(fillBlanks(people[1], { zip: '48209', firstName: 'Raymond' }).zip, '48209');
  assert.equal(fillBlanks(people[1], { zip: '48209', firstName: 'Raymond' }).firstName, 'Ray');
});
test('age ranges', () => {
  assert.equal(ageRange('', 2026), 'Not given');
  assert.equal(ageRange(2010, 2026), '13–17');
  assert.equal(ageRange(1960, 2026), '65+');
});
```

```js
// tests/merge.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords } from '../site/js/domain/merge.js';

test('union by id, newer wins, deletes survive', () => {
  const base = [{ id: 'a', v: 1, updatedAt: '2026-01-02' }, { id: 'b', v: 1, updatedAt: '2026-01-01' }];
  const inc = [{ id: 'a', v: 0, updatedAt: '2026-01-01' }, { id: 'b', v: 2, updatedAt: '2026-01-03', deleted: true },
    { id: 'c', v: 1, updatedAt: '2026-01-01' }];
  const out = Object.fromEntries(mergeRecords(base, inc).map((r) => [r.id, r]));
  assert.equal(out.a.v, 1);
  assert.equal(out.b.deleted, true);
  assert.ok(out.c);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**

```js
// site/js/domain/options.js
const o = (value, label) => ({ value, label });
export const ROLES = [o('attendee', 'Here to enjoy the show'), o('performer', 'Performing'),
  o('volunteer', 'Volunteering'), o('food_recipient', 'Picking up food')];
export const GENDERS = [o('woman', 'Woman'), o('man', 'Man'), o('nonbinary', 'Non-binary'), o('self', 'Self-describe')];
export const RACES = [o('black', 'Black or African American'), o('white', 'White'), o('hispanic', 'Hispanic or Latino'),
  o('asian', 'Asian'), o('mena', 'Middle Eastern or North African'), o('native', 'American Indian or Alaska Native'),
  o('pacific', 'Native Hawaiian or Pacific Islander'), o('other', 'Other')];
export const VETERAN = [o('yes', 'Yes'), o('no', 'No')];
export const HELP = [o('food_bag', 'Food bag'), o('meal', 'Hot meal'), o('referral', 'Resource referral')];
export const values = (list) => list.map((x) => x.value);
```

```js
// site/js/domain/validate.js
import { ROLES, GENDERS, RACES, VETERAN, values } from './options.js';

const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const pick = (v, list) => (values(list).includes(v) ? v : '');

export function sanitizeGuest(input = {}, { year }) {
  const firstName = str(input.firstName, 40);
  const zip = /^\d{5}$/.test(str(input.zip, 5)) ? str(input.zip, 5) : '';
  const by = Number(input.birthYear);
  const birthYear = Number.isInteger(by) && by >= year - 110 && by <= year ? by : '';
  const hs = Number(input.householdSize);
  const race = Array.isArray(input.race) ? [...new Set(input.race.filter((r) => values(RACES).includes(r)))] : [];
  const guest = {
    firstName, lastName: str(input.lastName, 40), zip, birthYear,
    gender: pick(input.gender, GENDERS), race, veteran: pick(input.veteran, VETERAN),
  };
  const visit = { role: pick(input.role, ROLES) || 'attendee',
    householdSize: Number.isInteger(hs) && hs >= 1 && hs <= 20 ? hs : '' };
  const errors = firstName ? [] : ['First name is required.'];
  return { ok: errors.length === 0, errors, guest, visit };
}

export function sanitizeEvent(input = {}) {
  const event = { name: str(input.name, 80), date: str(input.date, 10), start: str(input.start, 5),
    end: str(input.end, 5), location: str(input.location, 120), program: str(input.program, 40) || 'open_mic' };
  const errors = [];
  if (!event.name) errors.push('Name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) errors.push('Date must be YYYY-MM-DD.');
  if (!/^\d{2}:\d{2}$/.test(event.start) || !/^\d{2}:\d{2}$/.test(event.end)) errors.push('Times must be HH:MM.');
  return { ok: errors.length === 0, errors, event };
}
```

```js
// site/js/domain/people.js
export const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const has = (v) => v !== undefined && v !== null && v !== '';
const conflict = (a, b) => has(a) && has(b) && String(a) !== String(b);
const same = (a, b) => has(a) && has(b) && String(a) === String(b);

export function findMatch(people, guest) {
  const f = norm(guest.firstName), l = norm(guest.lastName);
  if (!f) return null;
  let likely = null;
  for (const p of people) {
    if (p.deleted || norm(p.firstName) !== f || norm(p.lastName) !== l) continue;
    if (conflict(p.zip, guest.zip) || conflict(p.birthYear, guest.birthYear)) continue;
    if (same(p.zip, guest.zip) || same(p.birthYear, guest.birthYear)) return { person: p, confidence: 'strong' };
    likely ??= p;
  }
  return likely ? { person: likely, confidence: 'likely' } : null;
}

const FILLABLE = ['lastName', 'zip', 'birthYear', 'gender', 'veteran'];
export function fillBlanks(person, guest) {
  const next = { ...person };
  let changed = false;
  for (const k of FILLABLE) if (!has(person[k]) && has(guest[k])) { next[k] = guest[k]; changed = true; }
  if (!(person.race || []).length && (guest.race || []).length) { next.race = guest.race; changed = true; }
  return changed ? next : null;
}

const BANDS = [[12, 'Under 13'], [17, '13–17'], [24, '18–24'], [34, '25–34'], [44, '35–44'], [54, '45–54'], [64, '55–64']];
export function ageRange(birthYear, year) {
  if (!has(birthYear)) return 'Not given';
  const age = year - Number(birthYear);
  return (BANDS.find(([max]) => age <= max) || [0, '65+'])[1];
}
```

```js
// site/js/domain/merge.js
export function mergeRecords(base = [], incoming = []) {
  const byId = new Map(base.map((r) => [r.id, r]));
  for (const r of incoming) {
    const cur = byId.get(r.id);
    if (!cur || (r.updatedAt || '') >= (cur.updatedAt || '')) byId.set(r.id, r);
  }
  return [...byId.values()];
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat: validation, people matching, merge`

---

### Task 4: Store interface — memory + GitHub adapters

**Files:** Create `site/js/store/memory.js`, `site/js/store/github.js`, `tests/store.test.js`

**Interfaces — Produces (both adapters):**
- `readJson(path): Promise<{data: any|null, sha: string|null}>`
- `update(path, fn, message): Promise<any>` — `fn(current|null)` returns next data, or `null` for "no write". Retries up to 5 times on write conflict, re-running `fn` against fresh data.
- `listDir(path): Promise<string[]>` (file names; `[]` when missing)
- `upsertRecords(store, path, records): Promise<records[]>` (exported helper in memory.js? no — in `site/js/store/records.js`) merges with `mergeRecords`.
- `createGithubStore({owner, repo, branch='main', token, fetchImpl=fetch, noStore=true})`
- `createMemoryStore(initial = {})` — `initial` maps path → data. Exposes `.files` for tests.
- `class ConflictError extends Error`

- [ ] **Step 1: Failing test** (GitHub adapter tested against a fake fetch that behaves like the Contents API, including one forced 409)

```js
// tests/store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { createGithubStore } from '../site/js/store/github.js';
import { upsertRecords } from '../site/js/store/records.js';

function fakeGithub({ conflictOnce = false } = {}) {
  const files = {}; let n = 0; let conflicted = !conflictOnce; const calls = [];
  const enc = (s) => Buffer.from(s, 'utf8').toString('base64');
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    const path = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if ((init.method || 'GET') === 'GET') {
      if (path.endsWith('/') || files[path] === undefined) {
        const kids = Object.keys(files).filter((k) => k.startsWith(path.replace(/\/?$/, '/')));
        return kids.length ? json(200, kids.map((k) => ({ name: k.split('/').pop(), type: 'file' }))) : json(404, {});
      }
      return json(200, { sha: files[path].sha, content: enc(files[path].text), encoding: 'base64' });
    }
    const body = JSON.parse(init.body);
    if (!conflicted) { conflicted = true; files[path] = { text: '[{"id":"other","updatedAt":"x"}]', sha: 's' + ++n }; return json(409, {}); }
    if ((files[path]?.sha || undefined) !== body.sha) return json(409, {});
    files[path] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + ++n };
    return json(201, { content: { sha: files[path].sha } });
  };
  return { files, fetchImpl, calls };
}

for (const [name, make] of [
  ['memory', () => ({ store: createMemoryStore() })],
  ['github', () => { const g = fakeGithub(); return { store: createGithubStore({ owner: 'o', repo: 'r', token: 't', fetchImpl: g.fetchImpl, noStore: false }), g }; }],
]) {
  test(`${name}: read missing, write, read back, list`, async () => {
    const { store } = make();
    assert.deepEqual(await store.readJson('data/x.json'), { data: null, sha: null });
    await store.update('data/x.json', () => [{ id: 1, t: 'é' }], 'm');
    assert.deepEqual((await store.readJson('data/x.json')).data, [{ id: 1, t: 'é' }]);
    await store.update('data/checkins/e1.json', () => [], 'm');
    assert.deepEqual(await store.listDir('data/checkins'), ['e1.json']);
  });
  test(`${name}: fn returning null skips write`, async () => {
    const { store } = make();
    assert.equal(await store.update('data/y.json', () => null, 'm'), null);
    assert.equal((await store.readJson('data/y.json')).data, null);
  });
}

test('github: conflict re-reads and merges', async () => {
  const g = fakeGithub({ conflictOnce: true });
  const store = createGithubStore({ owner: 'o', repo: 'r', token: 't', fetchImpl: g.fetchImpl, noStore: false });
  const out = await upsertRecords(store, 'data/p.json', [{ id: 'mine', updatedAt: 'y' }]);
  assert.deepEqual(out.map((r) => r.id).sort(), ['mine', 'other']);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**

```js
// site/js/store/memory.js
export function createMemoryStore(initial = {}) {
  const files = structuredClone(initial);
  return {
    files,
    async readJson(path) {
      return path in files ? { data: structuredClone(files[path]), sha: 'mem' } : { data: null, sha: null };
    },
    async update(path, fn) {
      const next = fn(path in files ? structuredClone(files[path]) : null);
      if (next === null || next === undefined) return null;
      files[path] = structuredClone(next);
      return next;
    },
    async listDir(dir) {
      const prefix = dir.replace(/\/?$/, '/');
      return Object.keys(files).filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}
```

```js
// site/js/store/github.js
export class ConflictError extends Error {}
export class StoreError extends Error {
  constructor(status, msg) { super(`GitHub ${status}: ${msg}`); this.status = status; }
}

const enc = (s) => { let b = ''; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b); };
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function createGithubStore({ owner, repo, branch = 'main', token, fetchImpl = globalThis.fetch.bind(globalThis), noStore = true }) {
  const base = `https://api.github.com/repos/${owner}/${repo}/contents/`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'lpu-tracker' };
  const url = (p) => base + p.split('/').map(encodeURIComponent).join('/');
  const get = (u) => fetchImpl(u, noStore ? { headers, cache: 'no-store' } : { headers });

  async function readJson(path) {
    const r = await get(`${url(path)}?ref=${branch}`);
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new StoreError(r.status, await r.text());
    const j = await r.json();
    let content = j.content;
    if (!content && j.git_url) { // files over 1 MB come back without content
      const b = await get(j.git_url);
      content = (await b.json()).content;
    }
    return { data: JSON.parse(dec(content)), sha: j.sha };
  }

  async function write(path, data, sha, message) {
    const body = { message, branch, content: enc(JSON.stringify(data, null, 1) + '\n') };
    if (sha) body.sha = sha;
    const r = await fetchImpl(url(path), { method: 'PUT', headers, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) throw new ConflictError(path);
    if (!r.ok) throw new StoreError(r.status, await r.text());
  }

  async function update(path, fn, message = `update ${path}`) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, sha } = await readJson(path);
      const next = fn(data);
      if (next === null || next === undefined) return null;
      try { await write(path, next, sha, message); return next; }
      catch (e) { if (!(e instanceof ConflictError)) throw e; }
    }
    throw new StoreError(409, `Could not save ${path} after 5 tries`);
  }

  async function listDir(dir) {
    const r = await get(`${url(dir)}?ref=${branch}`);
    if (r.status === 404) return [];
    if (!r.ok) throw new StoreError(r.status, await r.text());
    return (await r.json()).filter((x) => x.type === 'file').map((x) => x.name);
  }

  return { readJson, update, listDir };
}
```

```js
// site/js/store/records.js
import { mergeRecords } from '../domain/merge.js';
export const upsertRecords = (store, path, records, message = `save ${path}`) =>
  store.update(path, (cur) => mergeRecords(cur || [], records), message);
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat: storage interface with memory and GitHub adapters`

---

### Task 5: Shared check-in logic

**Files:** Create `site/js/domain/checkin.js`, `tests/checkin.test.js`

**Interfaces — Consumes:** `findMatch`, `fillBlanks`, `stamp`, store `update`. **Produces:**
`recordCheckin(store, {event, guest, visit, source, help=[], now=new Date()}): Promise<{personId, returning:boolean, confidence:'strong'|'likely'|null, alreadyIn:boolean}>`. Paths: `PEOPLE = 'data/people.json'`, `checkinPath(eventId) = 'data/checkins/<eventId>.json'`. Throws `Error('Check-in is full for this event.')` at 500 active check-ins.

- [ ] **Step 1: Failing test**

```js
// tests/checkin.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { recordCheckin, PEOPLE, checkinPath } from '../site/js/domain/checkin.js';

const event = { id: 'e1' };
const visit = { role: 'attendee', householdSize: '' };
const g = (o) => ({ firstName: 'Dee', lastName: 'Smith', zip: '', birthYear: '', gender: '', race: [], veteran: '', ...o });

test('new person then returning person at next event', async () => {
  const s = createMemoryStore();
  const a = await recordCheckin(s, { event, guest: g({ zip: '48216' }), visit, source: 'self' });
  assert.equal(a.returning, false);
  const b = await recordCheckin(s, { event: { id: 'e2' }, guest: g({}), visit, source: 'self' });
  assert.equal(b.returning, true);
  assert.equal(b.confidence, 'likely');
  assert.equal(b.personId, a.personId);
  assert.equal(s.files[PEOPLE].length, 1);
  assert.equal(s.files[checkinPath('e2')][0].source, 'self');
});
test('same person twice at one event is not double counted', async () => {
  const s = createMemoryStore();
  await recordCheckin(s, { event, guest: g({}), visit, source: 'self' });
  const again = await recordCheckin(s, { event, guest: g({}), visit, source: 'self' });
  assert.equal(again.alreadyIn, true);
  assert.equal(s.files[checkinPath('e1')].length, 1);
});
test('new answers fill blanks on the person', async () => {
  const s = createMemoryStore();
  await recordCheckin(s, { event, guest: g({}), visit, source: 'self' });
  await recordCheckin(s, { event: { id: 'e2' }, guest: g({ zip: '48209' }), visit, source: 'self' });
  assert.equal(s.files[PEOPLE][0].zip, '48209');
});
test('cap at 500', async () => {
  const full = Array.from({ length: 500 }, (_, i) => ({ id: 'c' + i, personId: 'p' + i, deleted: false }));
  const s = createMemoryStore({ [checkinPath('e1')]: full });
  await assert.rejects(recordCheckin(s, { event, guest: g({}), visit, source: 'self' }), /full/);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**

```js
// site/js/domain/checkin.js
import { findMatch, fillBlanks } from './people.js';
import { stamp } from './ids.js';

export const PEOPLE = 'data/people.json';
export const checkinPath = (eventId) => `data/checkins/${eventId}.json`;
export const MAX_PER_EVENT = 500;

export async function recordCheckin(store, { event, guest, visit, source, help = [], now = new Date() }) {
  let personId = null, returning = false, confidence = null;
  await store.update(PEOPLE, (cur) => {
    const people = cur || [];
    const m = findMatch(people, guest);
    if (m) {
      personId = m.person.id; returning = true; confidence = m.confidence;
      const filled = fillBlanks(m.person, guest);
      return filled ? people.map((p) => (p.id === filled.id ? stamp(filled) : p)) : null;
    }
    const p = stamp({ ...guest, firstSeen: now.toISOString() });
    personId = p.id; returning = false; confidence = null;
    return [...people, p];
  }, `check-in: person (${source})`);

  let alreadyIn = false;
  await store.update(checkinPath(event.id), (cur) => {
    const list = cur || [];
    const active = list.filter((c) => !c.deleted);
    if (active.some((c) => c.personId === personId)) { alreadyIn = true; return null; }
    alreadyIn = false;
    if (active.length >= MAX_PER_EVENT) throw new Error('Check-in is full for this event.');
    return [...list, stamp({ eventId: event.id, personId, ...visit, help, source, time: now.toISOString() })];
  }, `check-in: ${event.id} (${source})`);

  return { personId, returning, confidence, alreadyIn };
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat: shared check-in logic`

---

### Task 6: Cloudflare Worker (public check-in endpoint)

**Files:** Create `worker/wrangler.jsonc`, `worker/src/index.js`, `worker/src/limiter.js`, `tests/worker.test.js`

**Interfaces — Consumes:** `createGithubStore`, `recordCheckin`, `sanitizeGuest`, `isOpen`. **Produces:** HTTP API
- `GET /event?e=<id>&k=<key>` → `200 {name, date, start, end, location, open:boolean}` | `404 {error}`
- `POST /checkin` body `{e, k, guest:{...}}` → `200 {ok:true, eventName, returning, alreadyIn}` | `400/403/404/429/503 {error}`
- `export function makeHandler({makeStore, now=()=>new Date(), limiter})` returns `(request, env) => Response` (testable); default export wires the GitHub store from `env`.
- Env: `GITHUB_TOKEN` (secret), `DATA_OWNER`, `DATA_REPO`, `DATA_BRANCH`, `ALLOWED_ORIGINS` (comma list).

- [ ] **Step 1: Failing test**

```js
// tests/worker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../worker/src/index.js';
import { createLimiter } from '../worker/src/limiter.js';
import { createMemoryStore } from '../site/js/store/memory.js';

const ev = { id: 'e1', eventKey: 'k1', name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00', location: '27th Letter', deleted: false };
const env = { ALLOWED_ORIGINS: 'https://gholsona171.github.io' };
const setup = (nowIso = '2026-09-27T22:00:00Z') => {
  const store = createMemoryStore({ 'data/events.json': [ev] });
  const handle = makeHandler({ makeStore: () => store, now: () => new Date(nowIso), limiter: createLimiter({ max: 5, windowMs: 600000 }) });
  return { store, handle };
};
const post = (body, ip = '1.1.1.1') => new Request('https://w/checkin', { method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://gholsona171.github.io' } });

test('event lookup needs the right key', async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request('https://w/event?e=e1&k=bad'), env)).status, 404);
  const r = await handle(new Request('https://w/event?e=e1&k=k1'), env);
  assert.deepEqual(await r.json(), { name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00', location: '27th Letter', open: true });
});
test('check-in succeeds with first name only and sets CORS', async () => {
  const { handle, store } = setup();
  const r = await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee' } }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://gholsona171.github.io');
  assert.equal(store.files['data/checkins/e1.json'][0].source, 'self');
  assert.deepEqual(store.files['data/checkins/e1.json'][0].help, []);
});
test('guest cannot claim help', async () => {
  const { handle, store } = setup();
  await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee', help: ['food_bag'] } }), env);
  assert.deepEqual(store.files['data/checkins/e1.json'][0].help, []);
});
test('closed outside window', async () => {
  const { handle } = setup('2026-09-27T10:00:00Z');
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee' } }), env)).status, 403);
});
test('missing first name is 400', async () => {
  const { handle } = setup();
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: {} }), env)).status, 400);
});
test('rate limit per IP', async () => {
  const { handle } = setup();
  for (let i = 0; i < 5; i++) await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'P' + i } }), env);
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Z' } }), env)).status, 429);
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Z' } }, '2.2.2.2'), env)).status, 200);
});
test('OPTIONS preflight', async () => {
  const { handle } = setup();
  const r = await handle(new Request('https://w/checkin', { method: 'OPTIONS', headers: { Origin: 'https://gholsona171.github.io' } }), env);
  assert.equal(r.status, 204);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**

```js
// worker/src/limiter.js
// Best-effort per-isolate limiter. Cloudflare may run several isolates; that is acceptable for the beta.
export function createLimiter({ max = 5, windowMs = 600000 } = {}) {
  const hits = new Map();
  return {
    allow(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= max) { hits.set(key, list); return false; }
      list.push(now); hits.set(key, list);
      if (hits.size > 5000) hits.clear();
      return true;
    },
  };
}
```

```js
// worker/src/index.js
import { createGithubStore } from '../../site/js/store/github.js';
import { recordCheckin } from '../../site/js/domain/checkin.js';
import { sanitizeGuest } from '../../site/js/domain/validate.js';
import { isOpen } from '../../site/js/domain/time.js';
import { createLimiter } from './limiter.js';

const ID = /^[0-9a-f-]{36}$|^[a-z0-9-]{1,40}$/;

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' }
    : {};
}

export function makeHandler({ makeStore, now = () => new Date(), limiter = createLimiter() }) {
  return async function handle(request, env) {
    const h = cors(request, env);
    const send = (status, body) => new Response(body === null ? null : JSON.stringify(body),
      { status, headers: { ...h, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    if (request.method === 'OPTIONS') return send(204, null);
    const url = new URL(request.url);
    const store = makeStore(env);

    async function findEvent(e, k) {
      if (!ID.test(String(e || '')) || typeof k !== 'string' || k.length > 40) return null;
      const { data } = await store.readJson('data/events.json');
      return (data || []).find((x) => x.id === e && x.eventKey === k && !x.deleted) || null;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/event') {
        const ev = await findEvent(url.searchParams.get('e'), url.searchParams.get('k'));
        if (!ev) return send(404, { error: 'This check-in link is not valid.' });
        const { name, date, start, end, location } = ev;
        return send(200, { name, date, start, end, location, open: isOpen(ev, now()) });
      }
      if (request.method === 'POST' && url.pathname === '/checkin') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!limiter.allow(ip, now().getTime())) return send(429, { error: 'Too many check-ins from this phone. Please wait a few minutes.' });
        const body = await request.json().catch(() => ({}));
        const ev = await findEvent(body.e, body.k);
        if (!ev) return send(404, { error: 'This check-in link is not valid.' });
        if (!isOpen(ev, now())) return send(403, { error: 'Check-in for this event is closed.' });
        const v = sanitizeGuest(body.guest || {}, { year: now().getUTCFullYear() });
        if (!v.ok) return send(400, { error: v.errors.join(' ') });
        const r = await recordCheckin(store, { event: ev, guest: v.guest, visit: v.visit, source: 'self', help: [], now: now() });
        return send(200, { ok: true, eventName: ev.name, returning: r.returning, alreadyIn: r.alreadyIn });
      }
      return send(404, { error: 'Not found' });
    } catch (e) {
      console.error('checkin error', e && e.message);
      return send(/full/.test(e?.message) ? 403 : 503, { error: /full/.test(e?.message) ? e.message : 'Could not save right now. Please try again.' });
    }
  };
}

const handle = makeHandler({
  makeStore: (env) => createGithubStore({ owner: env.DATA_OWNER, repo: env.DATA_REPO,
    branch: env.DATA_BRANCH || 'main', token: env.GITHUB_TOKEN, noStore: false }),
});
export default { fetch: (request, env) => handle(request, env) };
```

```jsonc
// worker/wrangler.jsonc
{
  "name": "lpu-checkin",
  "main": "src/index.js",
  "compatibility_date": "2026-09-18",
  "observability": { "enabled": true },
  "vars": {
    "DATA_OWNER": "gholsona171",
    "DATA_REPO": "lpu-tracker",
    "DATA_BRANCH": "main",
    "ALLOWED_ORIGINS": "https://gholsona171.github.io,http://localhost:8080"
  }
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat: public check-in worker`

---

### Task 7: Offline outbox + app data layer

**Files:** Create `site/js/store/outbox.js`, `site/js/store/db.js`, `tests/db.test.js`

**Interfaces — Produces:**
- `outbox.js`: `openOutbox(): {add(op), all(): op[], remove(ids), saveState(state), loadState()}` using IndexedDB DB `lpu-tracker` stores `outbox` and `cache`. `memoryOutbox()` for tests/demo with the same shape.
- `db.js`: `createDb({store, outbox})` →
  - `state: {events:[], people:[], checkins:{[eventId]: []}, settings: {...}}`
  - `load(): Promise<state>` (reads remote; on failure falls back to cached state and sets `offline=true`)
  - `save(kind, record, {eventId}?): Promise<record>` — kinds `event`, `person`, `checkin`, `settings`; stamps, applies locally, queues, then `flush()`
  - `flush(): Promise<{pending:number}>` — groups outbox ops by path, `upsertRecords`, removes flushed ops; network errors leave ops queued
  - `pending(): number`, `onChange(fn)`
  - `activeEvents()`, `checkinsFor(eventId)` (non-deleted)
  - Settings are stored as a one-record array in `data/settings.json` with `id: 'settings'`.

- [ ] **Step 1: Failing test**

```js
// tests/db.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { memoryOutbox } from '../site/js/store/outbox.js';
import { createDb } from '../site/js/store/db.js';

test('save queues then flushes to the store', async () => {
  const store = createMemoryStore();
  const db = createDb({ store, outbox: memoryOutbox() });
  await db.load();
  const ev = await db.save('event', { name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00' });
  assert.equal(db.pending(), 0);
  assert.equal(store.files['data/events.json'][0].id, ev.id);
  await db.save('checkin', { personId: 'p1', role: 'attendee', help: ['food_bag'], source: 'volunteer' }, { eventId: ev.id });
  assert.equal(store.files[`data/checkins/${ev.id}.json`].length, 1);
});
test('offline saves stay queued and flush later', async () => {
  const mem = createMemoryStore();
  let down = true;
  const store = { ...mem, update: (...a) => (down ? Promise.reject(new TypeError('Failed to fetch')) : mem.update(...a)) };
  const db = createDb({ store, outbox: memoryOutbox() });
  await db.load();
  await db.save('event', { name: 'X', date: '2026-09-27', start: '17:00', end: '20:00' });
  assert.equal(db.pending(), 1);
  assert.equal(db.activeEvents().length, 1);
  down = false;
  await db.flush();
  assert.equal(db.pending(), 0);
  assert.equal(mem.files['data/events.json'].length, 1);
});
test('load reads checkins per event and settings defaults', async () => {
  const store = createMemoryStore({ 'data/events.json': [{ id: 'e1', deleted: false }],
    'data/checkins/e1.json': [{ id: 'c1', personId: 'p', deleted: false }] });
  const db = createDb({ store, outbox: memoryOutbox() });
  await db.load();
  assert.equal(db.checkinsFor('e1').length, 1);
  assert.equal(db.state.settings.fyEnd, '12-31');
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** `outbox.js` (IndexedDB wrapper + `memoryOutbox`) and `db.js`:

```js
// site/js/store/outbox.js
export function memoryOutbox() {
  let ops = []; let cache = null;
  return {
    async add(op) { ops.push(op); }, async all() { return [...ops]; },
    async remove(ids) { ops = ops.filter((o) => !ids.includes(o.id)); },
    async saveState(s) { cache = structuredClone(s); }, async loadState() { return cache && structuredClone(cache); },
  };
}

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function openOutbox() {
  const open = indexedDB.open('lpu-tracker', 1);
  open.onupgradeneeded = () => { open.result.createObjectStore('outbox', { keyPath: 'id' }); open.result.createObjectStore('cache'); };
  const idb = await req(open);
  const tx = (name, mode = 'readonly') => idb.transaction(name, mode).objectStore(name);
  return {
    add: (op) => req(tx('outbox', 'readwrite').put(op)),
    all: () => req(tx('outbox').getAll()),
    async remove(ids) { const s = tx('outbox', 'readwrite'); await Promise.all(ids.map((id) => req(s.delete(id)))); },
    saveState: (s) => req(tx('cache', 'readwrite').put(s, 'state')),
    loadState: () => req(tx('cache').get('state')),
  };
}
```

```js
// site/js/store/db.js
import { stamp, uuid } from '../domain/ids.js';
import { mergeRecords } from '../domain/merge.js';
import { upsertRecords } from './records.js';
import { checkinPath, PEOPLE } from '../domain/checkin.js';

export const EVENTS = 'data/events.json';
export const SETTINGS = 'data/settings.json';
export const DEFAULT_SETTINGS = { id: 'settings', orgName: 'Love, Peace & Unity', ein: '99-0471961', fyEnd: '12-31',
  address: '', officer: '', website: 'https://lovepeaceunity.org', hasEmployees: false,
  targets: { uniquePeople: 300, foodBags: 200, targetZips: '48216,48209,48210' } };

const pathFor = (kind, opts = {}) => ({ event: EVENTS, person: PEOPLE, settings: SETTINGS,
  checkin: opts.eventId && checkinPath(opts.eventId) })[kind];

export function createDb({ store, outbox }) {
  const state = { events: [], people: [], checkins: {}, settings: { ...DEFAULT_SETTINGS } };
  let queued = 0; let offline = false; const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  function applyLocal(path, records) {
    if (path === EVENTS) state.events = mergeRecords(state.events, records);
    else if (path === PEOPLE) state.people = mergeRecords(state.people, records);
    else if (path === SETTINGS) state.settings = { ...DEFAULT_SETTINGS, ...records.at(-1) };
    else { const id = path.split('/').pop().replace('.json', ''); state.checkins[id] = mergeRecords(state.checkins[id], records); }
  }

  async function load() {
    try {
      const [ev, pe, se, files] = await Promise.all([store.readJson(EVENTS), store.readJson(PEOPLE),
        store.readJson(SETTINGS), store.listDir('data/checkins')]);
      state.events = ev.data || []; state.people = pe.data || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(se.data || [])[0] };
      const lists = await Promise.all(files.map((f) => store.readJson(`data/checkins/${f}`)));
      state.checkins = Object.fromEntries(files.map((f, i) => [f.replace('.json', ''), lists[i].data || []]));
      offline = false;
      await outbox.saveState(state);
    } catch (e) {
      const cached = await outbox.loadState();
      if (!cached) throw e;
      Object.assign(state, cached); offline = true;
    }
    for (const op of await outbox.all()) applyLocal(op.path, [op.record]); // unsynced local edits stay visible
    queued = (await outbox.all()).length;
    emit();
    return state;
  }

  async function save(kind, record, opts = {}) {
    const path = pathFor(kind, opts);
    if (!path) throw new Error(`Unknown kind ${kind}`);
    const rec = stamp(kind === 'settings' ? { ...record, id: 'settings' } : kind === 'checkin' ? { ...record, eventId: opts.eventId } : record);
    applyLocal(path, [rec]);
    await outbox.add({ id: uuid(), path, record: rec });
    queued++; emit();
    await flush();
    return rec;
  }

  async function flush() {
    const ops = await outbox.all();
    const byPath = new Map();
    for (const op of ops) byPath.set(op.path, [...(byPath.get(op.path) || []), op]);
    for (const [path, list] of byPath) {
      try {
        const merged = await upsertRecords(store, path, list.map((o) => o.record));
        await outbox.remove(list.map((o) => o.id));
        applyLocal(path, merged);
        offline = false;
      } catch (e) {
        if (e instanceof TypeError) { offline = true; break; } // network down; keep queued
        throw e;
      }
    }
    queued = (await outbox.all()).length;
    await outbox.saveState(state);
    emit();
    return { pending: queued };
  }

  return {
    state, load, save, flush,
    pending: () => queued, isOffline: () => offline,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    activeEvents: () => state.events.filter((e) => !e.deleted).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    checkinsFor: (id) => (state.checkins[id] || []).filter((c) => !c.deleted),
  };
}
```

- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat: offline outbox and app data layer`

---

### Task 8: Admin app shell, setup, settings, events

**Files:** Create `site/index.html`, `site/css/app.css`, `site/js/config.js`, `site/js/app.js`, `site/js/ui/dom.js`, `site/js/ui/setup.js`, `site/js/ui/settings.js`, `site/js/ui/events.js`, `site/js/ui/today.js`, `site/manifest.webmanifest`, `site/sw.js`, `site/icons/*`

**Behavior (acceptance):**
- Hash routes: `#/today` (default), `#/events`, `#/event/<id>` (edit), `#/qr/<id>`, `#/door/<id>`, `#/settings`, `#/setup`.
- Boot: if no connection saved in `localStorage['lpu.conn']` → `#/setup`. Setup offers two buttons: **Connect to GitHub** (owner, repo, branch, token fields; "Test connection" reads `data/events.json`, shows success or the GitHub error) and **Try demo mode** (memory store persisted to `localStorage['lpu.demo']`, seeded with one event today 17:00–20:00).
- Token field is `type=password`, `autocomplete=off`; never shown again after save; "Disconnect" clears it.
- Bottom tab bar: Today, Events, Settings. BETA banner fixed at top.
- Today: next upcoming or current event card with check-in count and buttons "Door check-in" and "Show QR"; sync line "All saved" / "3 waiting to upload" / "Offline — saved on this phone".
- Events: list (upcoming first, then past), "New event" form (name, date, start, end, location) validated with `sanitizeEvent`; new events get `eventKey = randomKey(12)`. Edit + soft delete with confirm.
- Settings: org fields, fiscal year end (`MM-DD`), targets (unique people, food bags, target ZIPs), connection info (repo, "Disconnect"), "Sync now".
- `h(tag, attrs, ...children)` helper; all user text inserted with `textContent` (never `innerHTML` with data).
- PWA: manifest (name "LPU Tracker", short "LPU", theme `#1d1a16`, background `#faf6ee`, `display: standalone`, icons from the LPU logo at 192/512), service worker caches the app shell (cache-first for same-origin static, network-only for `api.github.com` and the Worker), versioned cache name.
- Icons: generated from `../lovepeaceunity/lpu-logo.png` with Pillow onto a `#faf6ee` square.

- [ ] **Step 1:** Write the files above. `app.js` boot:

```js
// site/js/app.js (core of boot; screens live in ui/*)
import { createGithubStore } from './store/github.js';
import { createMemoryStore } from './store/memory.js';
import { openOutbox, memoryOutbox } from './store/outbox.js';
import { createDb } from './store/db.js';
import { routes } from './ui/routes.js';

export function makeStore(conn) {
  if (conn.mode === 'demo') return demoStore();
  return createGithubStore({ owner: conn.owner, repo: conn.repo, branch: conn.branch || 'main', token: conn.token });
}
// demoStore: createMemoryStore(JSON.parse(localStorage['lpu.demo'] || seed())) with update() wrapped to persist.
```

- [ ] **Step 2:** Serve locally with `.claude/launch.json` (`npx http-server site -p 8080 -c-1`), open in the browser pane, click through: setup → demo mode → create event → edit → delete; check console has no errors; check phone-width layout (375px) has no horizontal scroll.
- [ ] **Step 3:** `npm test` still passes. Commit `feat: admin shell, setup, settings, events`.

---

### Task 9: Door check-in + event QR + public self check-in page

**Files:** Create `site/js/ui/guestform.js`, `site/js/ui/door.js`, `site/js/ui/eventqr.js`, `site/checkin.html`, `site/js/checkin-page.js`, `site/vendor/qrcode.js`

**Behavior (acceptance):**
- `guestform.js` exports `guestFields({compact})` → `{el, read(): rawGuestInput}`: first name (required), last name, then a collapsed "A few more questions (all optional)" section: role (buttons), ZIP, birth year, household size, gender, race (multi), veteran. Each select's first option is "Skip".
- Door screen `#/door/<id>`: search box filters people by name (normalized, starts-with on first or last), shows checked-in badge for people already in this event. Tap a person → role + help checkboxes (`HELP`) + household size → "Check in". "New guest" → `guestFields` + help → uses `recordCheckin` against a store wrapper that routes through `db` (so it queues offline). Checked-in list below with each row's help; tap to edit help (saves the check-in record via `db.save('checkin', …)`).
- Door check-in works offline: uses `db.save('person')` + `db.save('checkin')` with local `findMatch` instead of `recordCheckin` when `db.isOffline()`.
- QR screen `#/qr/<id>`: full-screen QR (qrcode-generator SVG) for `${SITE_URL}/checkin.html?e=<id>&k=<eventKey>`, event name, live count (refresh every 20 s via reloading that event's check-in file), "Print poster" (print stylesheet: logo, "Check in here", QR, "Only your first name is needed").
- Public `checkin.html`: loads only `checkin-page.js` + domain modules it needs + `guestform.js` + CSS. Calls `GET ${WORKER_URL}/event`. States: loading; invalid link; not open yet / closed (shows event time); form; saving; done ("You're checked in to Open Mic. Welcome back, Dee" for returning, "Thanks for coming, Dee" otherwise; "You were already checked in" for duplicates); error with retry. Two buttons after name: "That's all, check me in" and "Answer a few more (optional)".
- `vendor/qrcode.js` = `qrcode-generator@2.0.4/qrcode.js` copied verbatim with its MIT header; loaded via classic `<script>` (global `qrcode`).

- [ ] **Step 1:** Write the files.
- [ ] **Step 2:** Local test in browser pane: demo mode event → door check-in new guest with only a first name → appears in list; returning guest search finds them; QR renders and its URL decodes to the right `e` and `k` (read the `data-url` attribute); print preview shows poster.
- [ ] **Step 3:** Public page against local Worker: `npx wrangler@latest dev` in `worker/` with a `.dev.vars` pointing at a scratch data repo is **not** used (needs a token); instead test the page with a stubbed `WORKER_URL` served by a tiny local mock (`scripts/mock-worker.mjs` using `makeHandler` + memory store on port 8787). Verify: first-name-only check-in, full answers, duplicate, closed event, invalid key, 429 after 5.
- [ ] **Step 4:** `npm test` passes. Commit `feat: door check-in, event QR, public self check-in`.

---

### Task 10: Seed data, GitHub repo, Pages, Worker deploy

**Files:** Create `data/settings.json`, `data/events.json` (one test event), `data/people.json` (`[]`), `.github/workflows/pages.yml`, `README.md` (short: what it is, beta warning, how to run tests, how to deploy)

- [ ] **Step 1:** Pages workflow (deploys `site/` on push to main):

```yaml
name: pages
on: { push: { branches: [main], paths: ['site/**', '.github/workflows/pages.yml'] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
      - id: d
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2:** `gh repo create gholsona171/lpu-tracker --public --source . --push`; enable Pages with build type `workflow` (`gh api -X POST repos/gholsona171/lpu-tracker/pages -f build_type=workflow`); confirm site at `https://gholsona171.github.io/lpu-tracker/`.
- [ ] **Step 3:** Deploy Worker: `cd worker && npx wrangler@latest deploy`. Set `WORKER_URL` in `site/js/config.js` to the printed `*.workers.dev` URL; push.
- [ ] **Step 4 (Needs owner):** Owner creates two fine-grained tokens (repo `lpu-tracker` only, Contents: read and write): one for the Worker (`npx wrangler secret put GITHUB_TOKEN` run by the owner), one for the phone (pasted into Setup).
- [ ] **Step 5:** Live check: create an event on the phone, scan the QR with a second phone, check in with a first name only, see the count go up and the commit appear in `data/checkins/`.
- [ ] **Step 6:** Commit and push.
