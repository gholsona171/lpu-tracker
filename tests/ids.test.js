import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stamp, randomKey } from '../site/js/domain/ids.js';

test('stamp fills fields and keeps id/createdAt', () => {
  const a = stamp({ name: 'x' });
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(a.deleted, false);
  const b = stamp({ ...a, name: 'y' });
  assert.equal(b.id, a.id);
  assert.equal(b.createdAt, a.createdAt);
  assert.ok(b.updatedAt >= a.updatedAt);
});
test('randomKey uses unambiguous chars', () => {
  assert.match(randomKey(12), /^[a-hjkmnp-z2-9]{12}$/);
});
