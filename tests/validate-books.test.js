import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDonation, sanitizeExpense, sanitizePayee } from '../site/js/domain/validate-books.js';

test('donation basics', () => {
  const r = sanitizeDonation({ date: '2026-09-27', donorName: 'Ann', amount: '300', kind: 'cash', method: 'zeffy' });
  assert.equal(r.ok, true); assert.equal(r.record.amountCents, 30000); assert.equal(r.record.goodsCents, 0);
  assert.equal(sanitizeDonation({ date: '2026-09-27', donorName: 'Ann', amount: '0' }).ok, false);
  assert.equal(sanitizeDonation({ date: '2026-09-27', amount: '5' }).ok, false);
  assert.equal(sanitizeDonation({ date: '2026-09-27', amount: '5', anonymous: true }).ok, true);
  assert.equal(sanitizeDonation({ date: '2026-09-27', donorName: 'A', amount: '50', goods: '60' }).ok, false);
  assert.equal(sanitizeDonation({ date: '2026-9-27', donorName: 'A', amount: '50' }).ok, false);
  assert.equal(sanitizeDonation({ date: '2026-09-27', donorName: 'A', amount: '50', kind: 'weird', method: 'bogus' }).record.kind, 'cash');
  assert.equal(sanitizeDonation({ date: '2026-09-27', donorName: 'A', amountCents: 5000 }).record.amountCents, 5000);
});
test('expense and person payment', () => {
  const e = sanitizeExpense({ date: '2026-09-27', payeeName: 'Kroger', amount: '42.10', category: 'nope' });
  assert.equal(e.ok, true); assert.equal(e.record.category, 'program'); assert.equal(e.record.serviceCents, 0); assert.equal(e.record.amountCents, 4210);
  const p = sanitizeExpense({ date: '2026-09-27', payeeId: 'p1', amount: '150', isPersonPayment: true, workDone: 'Lot cleanup', goods: '20', method: 'cash' });
  assert.equal(p.ok, true); assert.equal(p.record.serviceCents, 13000); assert.equal(p.record.goodsCents, 2000);
  assert.equal(sanitizeExpense({ date: '2026-09-27', payeeId: 'p1', amount: '150', isPersonPayment: true }).ok, false);
  assert.equal(sanitizeExpense({ date: '2026-09-27', payeeId: 'p1', amount: '10', isPersonPayment: true, workDone: 'x', goods: '20' }).ok, false);
  assert.equal(sanitizeExpense({ date: '2026-09-27', amount: '10' }).ok, false);
});
test('payee', () => {
  assert.equal(sanitizePayee({ name: '' }).ok, false);
  const r = sanitizePayee({ name: 'Ray', w9OnFile: 'on', tinStatus: 'provided', communityWorker: true });
  assert.deepEqual(r.record, { name: 'Ray', kind: 'individual', address: '', w9OnFile: true, w9Date: '', tinStatus: 'provided', communityWorker: true, note: '' });
});
