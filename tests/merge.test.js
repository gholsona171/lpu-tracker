import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords } from '../site/js/domain/merge.js';

test('union by id, newer wins, deletes survive', () => {
  const base = [{ id: 'a', v: 1, updatedAt: '2026-01-02' }, { id: 'b', v: 1, updatedAt: '2026-01-01' }];
  const inc = [{ id: 'a', v: 0, updatedAt: '2026-01-01' }, { id: 'b', v: 2, updatedAt: '2026-01-03', deleted: true },
    { id: 'c', v: 1, updatedAt: '2026-01-01' }];
  const out = Object.fromEntries(mergeRecords(base, inc).map((r) => [r.id, r]));
  assert.equal(out.a.v, 1);
  assert.equal(out.b.deleted, true);
  assert.ok(out.c);
});
