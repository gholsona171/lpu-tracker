import { createGithubStore } from './store/github.js';
import { createMemoryStore } from './store/memory.js';
import { openOutbox, memoryOutbox } from './store/outbox.js';
import { createDb } from './store/db.js';
import { randomKey, stamp } from './domain/ids.js';
import { todayLocal } from './domain/time.js';
import { h, mount, toast } from './ui/dom.js';
import { renderSetup } from './ui/setup.js';
import { renderToday } from './ui/today.js';
import { renderEvents, renderEventEditor } from './ui/events.js';
import { renderSettings } from './ui/settings.js';
import { renderDoor } from './ui/door.js';
import { renderQr } from './ui/eventqr.js';
import { renderBooks } from './ui/books.js';
import { renderDonationForm } from './ui/donation-form.js';
import { renderExpenseForm } from './ui/expense-form.js';
import { renderPayForm, renderPayee } from './ui/pay-form.js';
import { renderImpact, renderReport } from './ui/impact.js';
import { renderFilings, renderFiling } from './ui/filings.js';

const CONN_KEY = 'lpu.conn';
const DEMO_KEY = 'lpu.demo';

export function getConn() {
  try { return JSON.parse(localStorage.getItem(CONN_KEY)); } catch { return null; }
}
export function setConn(conn) {
  if (conn) localStorage.setItem(CONN_KEY, JSON.stringify(conn));
  else localStorage.removeItem(CONN_KEY);
}

function demoSeed() {
  return {
    'data/events.json': [stamp({ name: 'Open Mic + Food Drive (demo)', date: todayLocal(), start: '17:00', end: '20:00',
      location: '27th Letter Books, 3546 Michigan Ave, Detroit', program: 'open_mic', eventKey: randomKey(12) })],
    'data/people.json': [],
  };
}

function demoStore() {
  let initial = null;
  try { initial = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { /* fresh demo */ }
  const s = createMemoryStore(initial || demoSeed());
  const persist = () => localStorage.setItem(DEMO_KEY, JSON.stringify(s.files));
  persist();
  return { ...s, async update(path, fn, msg) { const r = await s.update(path, fn, msg); persist(); return r; } };
}

export function makeStore(conn) {
  if (conn.mode === 'demo') return demoStore();
  return createGithubStore({ owner: conn.owner, repo: conn.repo, branch: conn.branch || 'main', token: conn.token });
}

const main = document.getElementById('main');
const status = document.getElementById('sync');
let ctx = null;
let cleanup = null;

function renderStatus() {
  if (!ctx) { status.textContent = ''; return; }
  const n = ctx.db.pending();
  status.textContent = ctx.conn.mode === 'demo' ? 'Demo mode, saved on this phone'
    : ctx.db.isOffline() ? `Offline, ${n} saved on this phone` : n ? `${n} waiting to upload` : 'All saved';
  status.dataset.state = ctx.db.isOffline() ? 'offline' : n ? 'pending' : 'ok';
}

async function connect(conn) {
  const store = makeStore(conn);
  let outbox;
  try { outbox = await openOutbox(`lpu-${conn.mode}-${conn.owner || ''}-${conn.repo || ''}`); }
  catch { outbox = memoryOutbox(); }
  const db = createDb({ store, outbox });
  ctx = { db, conn, disconnect: () => { setConn(null); start(null); } };
  db.onChange(renderStatus);
  db.onError((e) => toast(e.status === 401 ? 'GitHub rejected the token. Check Settings.' : `Could not upload: ${e.message}`));
  try { await db.load(); }
  catch (e) { toast(e.status === 401 ? 'GitHub rejected the token.' : `Could not load data: ${e.message}`); }
  renderStatus();
}

const ROUTES = {
  today: renderToday, events: renderEvents, event: renderEventEditor, settings: renderSettings,
  door: renderDoor, qr: renderQr,
  books: renderBooks, donation: renderDonationForm, expense: renderExpenseForm, pay: renderPayForm, payee: renderPayee,
  impact: renderImpact, report: renderReport, filings: renderFilings, filing: renderFiling,
};

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [name = 'today', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const param = rest.join('/');
  document.body.dataset.route = name;
  for (const a of document.querySelectorAll('nav.tabs a')) a.classList.toggle('on', a.dataset.tab === name);
  if (name === 'setup' || !ctx) {
    mount(main, renderSetup({ getConn, onDone: start }));
    return;
  }
  const render = ROUTES[name] || renderToday;
  mount(main, h('div', { class: 'loading' }, 'Loading'));
  try {
    const out = await render(main, ctx, param && decodeURIComponent(param));
    if (typeof out === 'function') cleanup = out;
  } catch (e) {
    console.error(e);
    mount(main, h('div', { class: 'card error' }, h('h2', {}, 'Something went wrong'), h('p', {}, e.message)));
  }
  main.focus({ preventScroll: true });
}

export async function start(conn = getConn()) {
  if (!conn) { ctx = null; location.hash = '#/setup'; route(); return; }
  setConn(conn);
  await connect(conn);
  if (!location.hash || location.hash === '#/setup') location.hash = '#/today';
  else route();
}

window.addEventListener('hashchange', route);
window.addEventListener('online', () => ctx && ctx.db.flush().catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx) ctx.db.flush().catch(() => {});
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
