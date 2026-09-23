import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../worker/src/index.js';
import { createLimiter } from '../worker/src/limiter.js';
import { createMemoryStore } from '../site/js/store/memory.js';

const ev = { id: 'e1', eventKey: 'k1', name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00', location: '27th Letter', deleted: false };
const env = { ALLOWED_ORIGINS: 'https://gholsona171.github.io' };
const setup = (nowIso = '2026-09-27T22:00:00Z') => {
  const store = createMemoryStore({ 'data/events.json': [ev] });
  const handle = makeHandler({ makeStore: () => store, now: () => new Date(nowIso), limiter: createLimiter({ max: 5, windowMs: 600000 }) });
  return { store, handle };
};
const post = (body, ip = '1.1.1.1') => new Request('https://w/checkin', { method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://gholsona171.github.io' } });

test('event lookup needs the right key', async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request('https://w/event?e=e1&k=bad'), env)).status, 404);
  const r = await handle(new Request('https://w/event?e=e1&k=k1'), env);
  assert.deepEqual(await r.json(), { name: 'Open Mic', date: '2026-09-27', start: '17:00', end: '20:00', location: '27th Letter', open: true });
});
test('check-in succeeds with first name only and sets CORS', async () => {
  const { handle, store } = setup();
  const r = await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee' } }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://gholsona171.github.io');
  assert.equal(store.files['data/checkins/e1.json'][0].source, 'self');
  assert.deepEqual(store.files['data/checkins/e1.json'][0].help, []);
});
test('guest cannot claim help', async () => {
  const { handle, store } = setup();
  await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee', help: ['food_bag'] } }), env);
  assert.deepEqual(store.files['data/checkins/e1.json'][0].help, []);
});
test('closed outside window', async () => {
  const { handle } = setup('2026-09-27T10:00:00Z');
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Dee' } }), env)).status, 403);
});
test('missing first name is 400', async () => {
  const { handle } = setup();
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: {} }), env)).status, 400);
});
test('rate limit per IP', async () => {
  const { handle } = setup();
  for (let i = 0; i < 5; i++) await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'P' + i } }), env);
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Z' } }), env)).status, 429);
  assert.equal((await handle(post({ e: 'e1', k: 'k1', guest: { firstName: 'Z' } }, '2.2.2.2'), env)).status, 200);
});
test('OPTIONS preflight', async () => {
  const { handle } = setup();
  const r = await handle(new Request('https://w/checkin', { method: 'OPTIONS', headers: { Origin: 'https://gholsona171.github.io' } }), env);
  assert.equal(r.status, 204);
});
