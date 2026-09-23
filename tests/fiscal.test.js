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
