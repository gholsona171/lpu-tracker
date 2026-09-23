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
