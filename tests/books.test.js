import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fmtMoney, necThreshold, donationFlags, donationTotals, expenseTotals, payeeYear, paymentAdvice } from '../site/js/domain/books.js';

test('toCents parses money text', () => {
  assert.equal(toCents('12'), 1200); assert.equal(toCents('12.5'), 1250); assert.equal(toCents('$1,200.00'), 120000);
  assert.equal(toCents('abc'), null); assert.equal(toCents('-3'), null); assert.equal(toCents(''), null);
  assert.equal(fmtMoney(120000), '$1,200.00');
});
test('1099 threshold by year', () => { assert.equal(necThreshold(2025), 60000); assert.equal(necThreshold(2026), 200000); assert.equal(necThreshold(2030), 200000); });
test('donation flags at the edges', () => {
  assert.equal(donationFlags({ amountCents: 24999, goodsCents: 0 }).ackRequired, false);
  assert.equal(donationFlags({ amountCents: 25000, goodsCents: 0 }).ackRequired, true);
  assert.equal(donationFlags({ amountCents: 7500, goodsCents: 1000 }).qpqDisclosure, false);
  assert.equal(donationFlags({ amountCents: 7501, goodsCents: 1000 }).qpqDisclosure, true);
  assert.equal(donationFlags({ amountCents: 7501, goodsCents: 0 }).qpqDisclosure, false);
  assert.equal(donationFlags({ amountCents: 10000, goodsCents: 1500 }).deductibleCents, 8500);
});
test('donation and expense totals by fiscal year', () => {
  const ds = [{ date: '2026-03-01', kind: 'cash', amountCents: 1000 }, { date: '2026-05-01', kind: 'in_kind', amountCents: 500 },
    { date: '2025-12-31', kind: 'cash', amountCents: 99 }, { date: '2026-06-01', kind: 'cash', amountCents: 1, deleted: true }];
  assert.deepEqual(donationTotals(ds, 2026, '12-31'), { cashCents: 1000, inKindCents: 500, grossReceiptsCents: 1500, count: 2 });
  const es = [{ date: '2026-01-05', amountCents: 300, category: 'program', withheldCents: 0 }, { date: '2026-01-06', amountCents: 200, category: 'fundraising', withheldCents: 48 }];
  assert.deepEqual(expenseTotals(es, 2026, '12-31'), { program: 300, management: 0, fundraising: 200, totalCents: 500, withheldCents: 48 });
});
test('payment advice: nudge, threshold, withholding, employment warning', () => {
  const payee = { id: 'p1', w9OnFile: false, tinStatus: 'unknown' };
  const prior = [{ date: '2026-02-01', payeeId: 'p1', amountCents: 150000, serviceCents: 150000, goodsCents: 0, withheldCents: 0, category: 'program' }];
  const a = paymentAdvice({ payee, expenses: prior, date: '2026-03-01', serviceCents: 40000, goodsCents: 0, fyEnd: '12-31', now: new Date('2026-03-01') });
  assert.equal(a.servicesBefore, 150000); assert.equal(a.servicesAfter, 190000);
  assert.equal(a.nudgeW9, true); assert.equal(a.needs1099, false); assert.equal(a.withholdCents, 0);
  const b = paymentAdvice({ payee, expenses: prior, date: '2026-03-01', serviceCents: 50000, goodsCents: 2000, fyEnd: '12-31', now: new Date('2026-03-01') });
  assert.equal(b.needs1099, true); assert.equal(b.withholdCents, 12000); assert.equal(b.netCents, 40000);
  const c = paymentAdvice({ payee: { ...payee, tinStatus: 'provided', w9OnFile: true }, expenses: prior, date: '2026-03-01', serviceCents: 50000, goodsCents: 0, fyEnd: '12-31', now: new Date('2026-03-01') });
  assert.equal(c.withholdCents, 0); assert.equal(c.nudgeW9, false); assert.equal(c.needs1099, true);
  const many = Array.from({ length: 4 }, (_, i) => ({ date: `2026-02-0${i + 1}`, payeeId: 'p1', amountCents: 100, serviceCents: 100, goodsCents: 0, withheldCents: 0 }));
  assert.equal(paymentAdvice({ payee, expenses: many, date: '2026-02-10', serviceCents: 100, goodsCents: 0, fyEnd: '12-31', now: new Date('2026-02-10') }).employmentWarning, true);
  assert.equal(payeeYear(many, 'p1', 2026, '12-31', new Date('2026-02-10')).recentCount, 4);
});
