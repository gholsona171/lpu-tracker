import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDates, normallyUnder50k, irs990Variant, evaluate, statusFor, icsFor, miSolicitationNeedsRegistration } from '../site/js/domain/compliance.js';

const base = (o = {}) => ({ fy: 2026, fyEnd: '12-31', today: '2026-09-23', settings: { firstFiscalYear: 2024, officer: 'K', address: 'A' },
  donations: [], expenses: [], payees: [], filings: [], ...o });
const gift = (cents, extra = {}) => ({ date: '2026-05-01', kind: 'cash', amountCents: cents, donorName: 'D', goodsCents: 0, ...extra });

test('due dates for calendar and March years', () => {
  assert.equal(dueDates.irs990(2026, '12-31'), '2027-05-15');
  assert.equal(dueDates.irs990(2027, '03-31'), '2027-08-15');
  assert.equal(dueDates.jan31(2026, '12-31'), '2027-01-31');
  assert.equal(dueDates.jan31(2027, '03-31'), '2027-04-30');
  assert.equal(dueDates.miAnnual(2026), '2026-10-01');
  assert.equal(dueDates.miSolicitation(2026, '12-31'), '2027-07-31');
  assert.equal(dueDates.miSolicitation(2027, '03-31'), '2027-10-31');
});
test('990 variant thresholds', () => {
  assert.equal(normallyUnder50k({ 2026: 5000000, 2025: 5000000, 2024: 5000000 }, 2026, 2020), true);
  assert.equal(normallyUnder50k({ 2026: 5000001, 2025: 5000000, 2024: 5000000 }, 2026, 2020), false);
  assert.equal(normallyUnder50k({ 2024: 7500000 }, 2024, 2024), true);
  assert.equal(normallyUnder50k({ 2024: 7500001 }, 2024, 2024), false);
  assert.equal(normallyUnder50k({ 2026: 7000000, 2025: 5000000 }, 2026, 2024), true); // avg 60k
  assert.equal(irs990Variant(base({ donations: [gift(19999999)], settings: { firstFiscalYear: 2020 } })), '990-EZ');
  assert.equal(irs990Variant(base({ donations: [gift(20000000)], settings: { firstFiscalYear: 2020 } })), '990');
  assert.equal(irs990Variant(base({ donations: [gift(100)] })), '990-N');
});
test('1099, 945, acks, MI exemption edges', () => {
  const payees = [{ id: 'p', name: 'Ray' }];
  const pay = (c) => ({ date: '2026-03-01', payeeId: 'p', isPersonPayment: true, amountCents: c, serviceCents: c, withheldCents: 0 });
  const by = (ctx) => Object.fromEntries(evaluate(ctx).map((i) => [i.id, i]));
  assert.equal(by(base({ payees, expenses: [pay(199999)] }))['1099-nec'].applies, false);
  assert.equal(by(base({ payees, expenses: [pay(200000)] }))['1099-nec'].applies, true);
  assert.equal(by(base({ payees, expenses: [pay(200000)] }))['1099-nec'].needsYou.some((n) => n.startsWith('W-9')), true);
  assert.equal(by(base())['form-945'].applies, false);
  assert.equal(by(base({ expenses: [{ ...pay(1000), withheldCents: 240 }] }))['form-945'].applies, true);
  assert.equal(by(base({ donations: [gift(24999)] }))['donor-acks'].applies, false);
  assert.equal(by(base({ donations: [gift(25000)] }))['donor-acks'].applies, true);
  assert.equal(by(base({ donations: [gift(8000, { goodsCents: 500 })] }))['donor-acks'].applies, true);
  assert.equal(miSolicitationNeedsRegistration(base({ donations: [gift(2499900)] })), false);
  assert.equal(miSolicitationNeedsRegistration(base({ donations: [gift(2500000)] })), true);
  assert.equal(by(base({ settings: { firstFiscalYear: 2024 }, fy: 2024 }))['mi-annual-report'].applies, false);
  assert.equal(by(base())['payroll'].applies, false);
});
test('statuses', () => {
  const s = (o) => statusFor({ applies: true, filing: null, due: '2026-10-01', needsYou: [], ...o }, '2026-09-23');
  assert.equal(s({}), 'due-soon');
  assert.equal(s({ due: '2026-12-01' }), 'ready');
  assert.equal(s({ due: '2026-12-01', needsYou: ['x'] }), 'needs-you');
  assert.equal(s({ due: '2026-09-01' }), 'overdue');
  assert.equal(s({ due: '2026-09-01', filing: { status: 'filed' } }), 'filed');
  assert.equal(s({ applies: false }), 'not-required');
  const items = evaluate(base({ filings: [{ ruleId: 'mi-annual-report', fy: 2026, status: 'filed' }] }));
  assert.equal(items.find((i) => i.id === 'mi-annual-report').status, 'filed');
  assert.equal(items[0].due <= items.at(-1).due, true);
});
test('ics has one event per applicable unfiled item', () => {
  const items = evaluate(base());
  const ics = icsFor(items);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, items.filter((i) => i.applies).length);
  assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
});
