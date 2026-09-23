import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localToUtc, checkinWindow, isOpen, todayLocal } from '../site/js/domain/time.js';

const ev = { date: '2026-09-27', start: '17:00', end: '20:00' };
test('EDT conversion', () => {
  assert.equal(localToUtc('2026-09-27', '17:00').toISOString(), '2026-09-27T21:00:00.000Z');
});
test('EST conversion', () => {
  assert.equal(localToUtc('2026-12-27', '17:00').toISOString(), '2026-12-27T22:00:00.000Z');
});
test('window is 1h before to 2h after', () => {
  const w = checkinWindow(ev);
  assert.equal(w.opens.toISOString(), '2026-09-27T20:00:00.000Z');
  assert.equal(w.closes.toISOString(), '2026-09-28T02:00:00.000Z');
  assert.equal(isOpen(ev, new Date('2026-09-27T19:59:00Z')), false);
  assert.equal(isOpen(ev, new Date('2026-09-27T20:00:00Z')), true);
  assert.equal(isOpen(ev, new Date('2026-09-28T02:01:00Z')), false);
});
test('event past midnight', () => {
  const w = checkinWindow({ date: '2026-09-27', start: '22:00', end: '01:00' });
  assert.equal(w.closes.toISOString(), '2026-09-28T07:00:00.000Z');
});
test('todayLocal uses Detroit date', () => {
  assert.equal(todayLocal(new Date('2026-09-28T03:00:00Z')), '2026-09-27');
});
