import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../site/js/store/memory.js';
import { createGithubStore } from '../site/js/store/github.js';
import { upsertRecords } from '../site/js/store/records.js';

function fakeGithub({ conflictOnce = false } = {}) {
  const files = {}; let n = 0; let conflicted = !conflictOnce; const calls = [];
  const enc = (s) => Buffer.from(s, 'utf8').toString('base64');
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    const path = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if ((init.method || 'GET') === 'GET') {
      if (path.endsWith('/') || files[path] === undefined) {
        const kids = Object.keys(files).filter((k) => k.startsWith(path.replace(/\/?$/, '/')));
        return kids.length ? json(200, kids.map((k) => ({ name: k.split('/').pop(), type: 'file' }))) : json(404, {});
      }
      return json(200, { sha: files[path].sha, content: enc(files[path].text), encoding: 'base64' });
    }
    const body = JSON.parse(init.body);
    if (!conflicted) { conflicted = true; files[path] = { text: '[{"id":"other","updatedAt":"x"}]', sha: 's' + ++n }; return json(409, {}); }
    if ((files[path]?.sha || undefined) !== body.sha) return json(409, {});
    files[path] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + ++n };
    return json(201, { content: { sha: files[path].sha } });
  };
  return { files, fetchImpl, calls };
}

for (const [name, make] of [
  ['memory', () => ({ store: createMemoryStore() })],
  ['github', () => { const g = fakeGithub(); return { store: createGithubStore({ owner: 'o', repo: 'r', token: 't', fetchImpl: g.fetchImpl, noStore: false }), g }; }],
]) {
  test(`${name}: read missing, write, read back, list`, async () => {
    const { store } = make();
    assert.deepEqual(await store.readJson('data/x.json'), { data: null, sha: null });
    await store.update('data/x.json', () => [{ id: 1, t: 'é' }], 'm');
    assert.deepEqual((await store.readJson('data/x.json')).data, [{ id: 1, t: 'é' }]);
    await store.update('data/checkins/e1.json', () => [], 'm');
    assert.deepEqual(await store.listDir('data/checkins'), ['e1.json']);
  });
  test(`${name}: fn returning null skips write`, async () => {
    const { store } = make();
    assert.equal(await store.update('data/y.json', () => null, 'm'), null);
    assert.equal((await store.readJson('data/y.json')).data, null);
  });
}

test('github: conflict re-reads and merges', async () => {
  const g = fakeGithub({ conflictOnce: true });
  const store = createGithubStore({ owner: 'o', repo: 'r', token: 't', fetchImpl: g.fetchImpl, noStore: false });
  const out = await upsertRecords(store, 'data/p.json', [{ id: 'mine', updatedAt: 'y' }]);
  assert.deepEqual(out.map((r) => r.id).sort(), ['mine', 'other']);
});
