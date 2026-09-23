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
