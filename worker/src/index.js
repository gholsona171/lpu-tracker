import { createGithubStore } from '../../site/js/store/github.js';
import { recordCheckin } from '../../site/js/domain/checkin.js';
import { sanitizeGuest } from '../../site/js/domain/validate.js';
import { isOpen } from '../../site/js/domain/time.js';
import { createLimiter } from './limiter.js';

const ID = /^[0-9a-f-]{36}$|^[a-z0-9-]{1,40}$/;

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' }
    : {};
}

export function makeHandler({ makeStore, now = () => new Date(), limiter = createLimiter() }) {
  return async function handle(request, env) {
    const h = cors(request, env);
    const send = (status, body) => new Response(body === null ? null : JSON.stringify(body),
      { status, headers: { ...h, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    if (request.method === 'OPTIONS') return send(204, null);
    const url = new URL(request.url);
    const store = makeStore(env);

    async function findEvent(e, k) {
      if (!ID.test(String(e || '')) || typeof k !== 'string' || k.length > 40) return null;
      const { data } = await store.readJson('data/events.json');
      return (data || []).find((x) => x.id === e && x.eventKey === k && !x.deleted) || null;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/event') {
        const ev = await findEvent(url.searchParams.get('e'), url.searchParams.get('k'));
        if (!ev) return send(404, { error: 'This check-in link is not valid.' });
        const { name, date, start, end, location } = ev;
        return send(200, { name, date, start, end, location, open: isOpen(ev, now()) });
      }
      if (request.method === 'POST' && url.pathname === '/checkin') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!limiter.allow(ip, now().getTime())) return send(429, { error: 'Too many check-ins from this phone. Please wait a few minutes.' });
        const body = await request.json().catch(() => ({}));
        const ev = await findEvent(body.e, body.k);
        if (!ev) return send(404, { error: 'This check-in link is not valid.' });
        if (!isOpen(ev, now())) return send(403, { error: 'Check-in for this event is closed.' });
        const v = sanitizeGuest(body.guest || {}, { year: now().getUTCFullYear() });
        if (!v.ok) return send(400, { error: v.errors.join(' ') });
        const r = await recordCheckin(store, { event: ev, guest: v.guest, visit: v.visit, source: 'self', help: [], now: now() });
        return send(200, { ok: true, eventName: ev.name, returning: r.returning, alreadyIn: r.alreadyIn });
      }
      return send(404, { error: 'Not found' });
    } catch (e) {
      console.error('checkin error', e && e.message);
      return send(/full/.test(e?.message) ? 403 : 503, { error: /full/.test(e?.message) ? e.message : 'Check-in is not available right now. Please try again, or check in with a volunteer at the door.' });
    }
  };
}

const handle = makeHandler({
  makeStore: (env) => createGithubStore({ owner: env.DATA_OWNER, repo: env.DATA_REPO,
    branch: env.DATA_BRANCH || 'main', token: env.GITHUB_TOKEN, noStore: false }),
});
export default { fetch: (request, env) => handle(request, env) };
