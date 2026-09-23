import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactSummary } from '../site/js/domain/impact.js';

const events = [{ id: 'e1', date: '2026-03-01' }, { id: 'e2', date: '2026-06-01' }, { id: 'old', date: '2025-11-01' }];
const people = [
  { id: 'a', zip: '48216', birthYear: 1990, gender: 'woman', race: ['black'], veteran: 'no' },
  { id: 'b', zip: '48209', birthYear: '', gender: '', race: [], veteran: '' },
  { id: 'c', zip: '', birthYear: 2010, gender: 'man', race: ['black', 'other'], veteran: '' },
];
const checkins = {
  old: [{ personId: 'a', role: 'attendee', help: [] }],
  e1: [{ personId: 'a', role: 'attendee', help: ['food_bag'], householdSize: 4 }, { personId: 'b', role: 'volunteer', help: [] }],
  e2: [{ personId: 'a', role: 'performer', help: ['meal'], householdSize: 4 }, { personId: 'c', role: 'food_recipient', help: ['food_bag', 'referral'] }],
};
const payees = [{ id: 'p1', communityWorker: true }, { id: 'p2', communityWorker: false }];
const expenses = [{ date: '2026-04-01', isPersonPayment: true, payeeId: 'p1', amountCents: 15000 }, { date: '2026-04-02', isPersonPayment: true, payeeId: 'p1', amountCents: 5000 },
  { date: '2026-04-03', isPersonPayment: true, payeeId: 'p2', amountCents: 99999 }, { date: '2025-04-03', isPersonPayment: true, payeeId: 'p1', amountCents: 1 }];
const settings = { targets: { uniquePeople: 10, foodBags: 5, targetZips: '48216, 48210' } };
const s = impactSummary({ events, people, checkins, expenses, payees, settings, fy: 2026, fyEnd: '12-31' });

test('counts people once and separates first-timers', () => {
  assert.equal(s.eventsHeld, 2); assert.equal(s.visits, 4); assert.equal(s.uniquePeople, 3);
  assert.equal(s.firstTimers, 2); assert.equal(s.returning, 1);
});
test('zip share and not-given buckets', () => {
  assert.equal(s.targetZipShare, 1 / 3);
  assert.deepEqual(s.byZip.find((z) => z.zip === 'Not given'), { zip: 'Not given', count: 1 });
  assert.equal(s.byAge.find((x) => x.label === 'Not given').count, 1);
  assert.equal(s.byAge.find((x) => x.label === '13–17').count, 1);
  assert.equal(s.gender.find((x) => x.label === 'Not given').count, 1);
  assert.equal(s.race.find((x) => x.label === 'Black or African American').count, 2);
});
test('help, households, volunteers, roles', () => {
  assert.deepEqual(s.help, { food_bag: 2, meal: 1, referral: 1 });
  assert.equal(s.householdsReached, 2); assert.equal(s.peopleInHouseholds, 5);
  assert.equal(s.volunteers, 1);
  assert.equal(s.byRole.find((r) => r.label === 'Performing').count, 1);
});
test('work opportunities count community workers only, this year only', () => {
  assert.deepEqual(s.work, { people: 1, payments: 2, cents: 20000 });
});
test('targets', () => {
  assert.deepEqual(s.targets[0], { key: 'uniquePeople', label: 'People reached', value: 3, target: 10 });
  assert.deepEqual(s.targets[1], { key: 'foodBags', label: 'Food bags given', value: 2, target: 5 });
});
