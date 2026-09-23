// Local stand-in for the check-in Worker: same handler, in-memory data, one open event.
// Usage: node scripts/mock-worker.mjs [port]. Event: e=local-event k=localkey
import { createServer } from 'node:http';
import { makeHandler } from '../worker/src/index.js';
import { createLimiter } from '../worker/src/limiter.js';
import { createMemoryStore } from '../site/js/store/memory.js';
import { todayLocal } from '../site/js/domain/time.js';

const port = Number(process.argv[2] || 8787);
const store = createMemoryStore({ 'data/events.json': [
  { id: 'local-event', eventKey: 'localkey', name: 'Local Test Open Mic', date: todayLocal(), start: '00:00', end: '23:59', location: 'Test', deleted: false },
  { id: 'later-event', eventKey: 'laterkey', name: 'Next Month', date: '2099-01-01', start: '17:00', end: '20:00', location: 'Test', deleted: false },
] });
const handle = makeHandler({ makeStore: () => store, limiter: createLimiter({ max: 5, windowMs: 600000 }) });
const env = { ALLOWED_ORIGINS: 'http://localhost:8080' };

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
  headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'local');
  const r = await handle(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
  if (req.url.startsWith('/checkin')) console.log('people', store.files['data/people.json']?.length, 'checkins', store.files['data/checkins/local-event.json']?.length);
}).listen(port, () => console.log(`mock worker on http://localhost:${port}`));
