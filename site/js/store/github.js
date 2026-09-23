export class ConflictError extends Error {}
export class StoreError extends Error {
  constructor(status, msg) { super(`GitHub ${status}: ${msg}`); this.status = status; }
}

const enc = (s) => { let b = ''; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b); };
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function createGithubStore({ owner, repo, branch = 'main', token, fetchImpl = globalThis.fetch.bind(globalThis), noStore = true }) {
  const base = `https://api.github.com/repos/${owner}/${repo}/contents/`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'lpu-tracker' };
  const url = (p) => base + p.split('/').map(encodeURIComponent).join('/');
  const get = (u) => fetchImpl(u, noStore ? { headers, cache: 'no-store' } : { headers });

  async function readJson(path) {
    const r = await get(`${url(path)}?ref=${branch}`);
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new StoreError(r.status, await r.text());
    const j = await r.json();
    let content = j.content;
    if (!content && j.git_url) { // files over 1 MB come back without content
      const b = await get(j.git_url);
      content = (await b.json()).content;
    }
    return { data: JSON.parse(dec(content)), sha: j.sha };
  }

  async function write(path, data, sha, message) {
    const body = { message, branch, content: enc(JSON.stringify(data, null, 1) + '\n') };
    if (sha) body.sha = sha;
    const r = await fetchImpl(url(path), { method: 'PUT', headers, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) throw new ConflictError(path);
    if (!r.ok) throw new StoreError(r.status, await r.text());
  }

  async function update(path, fn, message = `update ${path}`) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, sha } = await readJson(path);
      const next = fn(data);
      if (next === null || next === undefined) return null;
      try { await write(path, next, sha, message); return next; }
      catch (e) { if (!(e instanceof ConflictError)) throw e; }
    }
    throw new StoreError(409, `Could not save ${path} after 5 tries`);
  }

  async function listDir(dir) {
    const r = await get(`${url(dir)}?ref=${branch}`);
    if (r.status === 404) return [];
    if (!r.ok) throw new StoreError(r.status, await r.text());
    return (await r.json()).filter((x) => x.type === 'file').map((x) => x.name);
  }

  return { readJson, update, listDir };
}
