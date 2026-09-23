// Plan 5: a full simulated year through the real data layer, memory store and Worker handler,
// then every report and form checked against hand-computed totals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { memoryOutbox } from '../site/js/store/outbox.js';
import { createDb } from '../site/js/store/db.js';
import { makeHandler } from '../worker/src/index.js';
import { createLimiter } from '../worker/src/limiter.js';
import { recordCheckin } from '../site/js/domain/checkin.js';
import { impactSummary } from '../site/js/domain/impact.js';
import { evaluate } from '../site/js/domain/compliance.js';
import { form990N, form1099NEC, donorLetters, donorStatements, form945 } from '../site/js/domain/forms.js';
import { donationTotals, expenseTotals } from '../site/js/domain/books.js';
import { sanitizeDonation, sanitizeExpense, sanitizePayee } from '../site/js/domain/validate-books.js';

const LAST_SUNDAYS_2026 = ['2026-01-25', '2026-02-22', '2026-03-29', '2026-04-26', '2026-05-31', '2026-06-28', '2026-07-26', '2026-08-30', '2026-09-27', '2026-10-25', '2026-11-29', '2026-12-27'];
const NAMES = ['Dee', 'Ray', 'Mia', 'Jon', 'Ava', 'Sam', 'Kai', 'Zoe', 'Eli', 'Nia', 'Leo', 'Ivy', 'Max', 'Uma', 'Ben', 'Joy', 'Ash', 'Rae', 'Ty', 'Lu'];

test('a full simulated year reconciles end to end', async () => {
  const store = createMemoryStore();
  const db = createDb({ store, outbox: memoryOutbox() });
  await db.load();
  await db.save('settings', { ...db.state.settings, officer: 'Kamia Daniel-Ivory', address: '123 Test St, Detroit, MI 48216', targets: { uniquePeople: 30, foodBags: 40, targetZips: '48216,48209' } });

  // 12 events
  const events = [];
  for (const [i, date] of LAST_SUNDAYS_2026.entries()) events.push(await db.save('event', { name: `Open Mic ${i + 1}`, date, start: '17:00', end: '20:00', eventKey: `k${i}` }));

  // Guests: 20 people; person i attends events where (i + m) % 3 !== 0. Half via the Worker, half at the door.
  const handle = makeHandler({ makeStore: () => store, now: () => new Date(), limiter: createLimiter({ max: 1000 }) });
  let expectedVisits = 0; const expectedPeople = new Set(); let foodBags = 0;
  for (const [m, ev] of events.entries()) {
    for (let i = 0; i < NAMES.length; i++) {
      if ((i + m) % 3 === 0) continue;
      expectedVisits++; expectedPeople.add(i);
      const guest = { firstName: NAMES[i], lastName: 'Test', zip: i % 2 ? '48216' : '48210', birthYear: 1960 + i * 2, gender: i % 3 ? 'woman' : '', race: i % 4 ? ['black'] : [], veteran: '' };
      if (i % 2 === 0) {
        // self check-in via the Worker (window forced open by faking now inside the event)
        const req = new Request('https://w/checkin', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://gholsona171.github.io', 'CF-Connecting-IP': '9.9.9.9' },
          body: JSON.stringify({ e: ev.id, k: ev.eventKey, guest }) });
        const h2 = makeHandler({ makeStore: () => store, now: () => new Date(`${ev.date}T22:00:00Z`), limiter: createLimiter({ max: 1000 }) });
        const r = await h2(req, { ALLOWED_ORIGINS: 'https://gholsona171.github.io' });
        assert.equal(r.status, 200, await r.text());
      } else {
        const help = m % 2 ? ['food_bag'] : ['meal'];
        if (help.includes('food_bag')) foodBags++;
        await recordCheckin(store, { event: ev, guest, visit: { role: 'attendee', householdSize: 3 }, source: 'volunteer', help, now: new Date(`${ev.date}T22:30:00Z`) });
      }
    }
  }
  void handle;
  await db.load(); // pull what the Worker and door wrote

  // Books: donations, a paid host across the threshold, food bought from an individual, a vendor.
  const don = (o) => db.save('donation', sanitizeDonation({ date: '2026-03-01', donorName: 'Ann Lee', kind: 'cash', method: 'zeffy', ...o }).record);
  await don({ amount: '300', donorAddress: '1 A St' });
  await don({ amount: '100', goods: '30', goodsDescription: 'ticket', donorName: 'Bo Chen' });
  await don({ amount: '20', kind: 'in_kind', description: '12 cans of vegetables', donorName: "Joe's Market" });
  await don({ amount: '40', anonymous: true });
  const ray = await db.save('payee', sanitizePayee({ name: 'Ray Host', communityWorker: true }).record);
  const kroger = await db.save('payee', sanitizePayee({ name: 'Kroger', kind: 'business' }).record);
  for (const m of [1, 2, 3, 4, 5, 6, 7]) await db.save('expense', sanitizeExpense({ date: `2026-0${m}-28`, payeeId: ray.id, amount: '300', isPersonPayment: true, workDone: 'Hosted', method: 'cashapp' }).record);
  // 8th payment crosses $2,000 -> 24% withheld on it
  await db.save('expense', { ...sanitizeExpense({ date: '2026-08-28', payeeId: ray.id, amount: '300', isPersonPayment: true, workDone: 'Hosted', method: 'cashapp' }).record, withheldCents: 7200 });
  await db.save('expense', sanitizeExpense({ date: '2026-09-01', payeeId: kroger.id, amount: '250', category: 'program', method: 'card' }).record);

  // ---- Checks ----
  const st = db.state;
  const imp = impactSummary({ events: st.events, people: st.people, checkins: st.checkins, expenses: st.expenses, payees: st.payees, settings: st.settings, fy: 2026, fyEnd: '12-31' });
  assert.equal(imp.eventsHeld, 12);
  assert.equal(imp.visits, expectedVisits);
  assert.equal(imp.uniquePeople, expectedPeople.size);
  assert.equal(imp.firstTimers, expectedPeople.size);
  assert.equal(imp.help.food_bag, foodBags);
  assert.deepEqual(imp.work, { people: 1, payments: 8, cents: 240000 });
  assert.equal(imp.byZip.find((z) => z.zip === '48216').count, 10);
  assert.equal(st.people.length, 20, 'no duplicate people from Worker + door paths');

  const dt = donationTotals(st.donations, 2026, '12-31');
  assert.deepEqual(dt, { cashCents: 44000, inKindCents: 2000, grossReceiptsCents: 46000, count: 4 });
  const et = expenseTotals(st.expenses, 2026, '12-31');
  assert.equal(et.totalCents, 240000 + 25000); assert.equal(et.withheldCents, 7200);

  const ctx = { fy: 2026, fyEnd: '12-31', today: '2026-12-01', settings: st.settings, donations: db.active('donations'), expenses: db.active('expenses'), payees: db.active('payees'), filings: [] };
  const items = Object.fromEntries(evaluate(ctx).map((i) => [i.id, i]));
  assert.equal(items['irs-990'].variant, '990-N');
  assert.equal(items['1099-nec'].applies, true);
  assert.equal(items['form-945'].applies, true);
  assert.equal(items['donor-acks'].applies, true);
  assert.match(items['mi-solicitation'].name, /CTS-03/);
  assert.equal(Object.fromEntries(form990N(ctx).fields)['Gross receipts this year (for your records)'], '$460.00');
  const nec = form1099NEC(ctx);
  assert.equal(nec.entries.length, 1); assert.equal(nec.entries[0].box1Cents, 240000); assert.equal(nec.entries[0].box4Cents, 7200);
  assert.equal(Object.fromEntries(form945(ctx).fields)['Line 2: Backup withholding'], '$72.00');
  assert.equal(donorLetters(ctx).letters.length, 2); // Ann ($300) and Bo (quid pro quo); Joe's $20 in-kind and anonymous need none
  assert.equal(donorStatements(ctx).statements.length, 3);
});
