import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { memoryOutbox } from '../site/js/store/outbox.js';
import { createDb } from '../site/js/store/db.js';

test('books kinds save and load', async () => {
  const store = createMemoryStore();
  const db = createDb({ store, outbox: memoryOutbox() });
  await db.load();
  const p = await db.save('payee', { name: 'Ray' });
  await db.save('expense', { date: '2026-09-27', payeeId: p.id, amountCents: 15000 });
  await db.save('donation', { date: '2026-09-27', donorName: 'Ann', amountCents: 30000 });
  assert.equal(store.files['data/payees.json'][0].name, 'Ray');
  const db2 = createDb({ store, outbox: memoryOutbox() });
  await db2.load();
  assert.equal(db2.active('expenses').length, 1);
  assert.equal(db2.active('donations')[0].donorName, 'Ann');
  assert.equal(db2.active('payees')[0].id, p.id);
});
