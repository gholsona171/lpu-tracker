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
