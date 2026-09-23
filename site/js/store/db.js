import { stamp, uuid } from '../domain/ids.js';
import { mergeRecords } from '../domain/merge.js';
import { upsertRecords } from './records.js';
import { checkinPath, PEOPLE } from '../domain/checkin.js';

export const EVENTS = 'data/events.json';
export const SETTINGS = 'data/settings.json';
export const DONATIONS = 'data/donations.json';
export const EXPENSES = 'data/expenses.json';
export const PAYEES = 'data/payees.json';
export const FILINGS = 'data/filings.json';
const SIMPLE = { donations: DONATIONS, expenses: EXPENSES, payees: PAYEES, filings: FILINGS };
export const DEFAULT_SETTINGS = { id: 'settings', orgName: 'Love, Peace & Unity', ein: '99-0471961', fyEnd: '12-31',
  address: '', officer: '', website: 'https://lovepeaceunity.org', hasEmployees: false, firstFiscalYear: 2024, paidFundraisers: false,
  miId: '803311369', netAssetsStart: {},
  mission: "Love, Peace, Unity is dedicated to fostering community through artistry and charity. We aim to build meaningful connections, inspire contributions, and provide support for local artists and disadvantaged individuals through creative programming and community outreach initiatives.",
  targets: { uniquePeople: 300, foodBags: 200, targetZips: '48216,48209,48210' } };

const pathFor = (kind, opts = {}) => ({ event: EVENTS, person: PEOPLE, settings: SETTINGS,
  donation: DONATIONS, expense: EXPENSES, payee: PAYEES, filing: FILINGS,
  checkin: opts.eventId && checkinPath(opts.eventId) })[kind];

export function createDb({ store, outbox }) {
  const state = { events: [], people: [], checkins: {}, settings: { ...DEFAULT_SETTINGS }, donations: [], expenses: [], payees: [], filings: [] };
  let queued = 0; let offline = false; const listeners = new Set(); const errorListeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  let running = null; let again = false;

  function applyLocal(path, records) {
    if (path === EVENTS) state.events = mergeRecords(state.events, records);
    else if (path === PEOPLE) state.people = mergeRecords(state.people, records);
    else if (path === SETTINGS) state.settings = { ...DEFAULT_SETTINGS, ...records.at(-1) };
    else if (Object.values(SIMPLE).includes(path)) { const k = Object.keys(SIMPLE).find((x) => SIMPLE[x] === path); state[k] = mergeRecords(state[k], records); }
    else { const id = path.split('/').pop().replace('.json', ''); state.checkins[id] = mergeRecords(state.checkins[id], records); }
  }

  async function load() {
    try {
      const [ev, pe, se, files, dn, ex, py, fi] = await Promise.all([store.readJson(EVENTS), store.readJson(PEOPLE),
        store.readJson(SETTINGS), store.listDir('data/checkins'), store.readJson(DONATIONS), store.readJson(EXPENSES), store.readJson(PAYEES), store.readJson(FILINGS)]);
      state.events = ev.data || []; state.people = pe.data || [];
      state.donations = dn.data || []; state.expenses = ex.data || []; state.payees = py.data || []; state.filings = fi.data || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(se.data || [])[0] };
      const lists = await Promise.all(files.map((f) => store.readJson(`data/checkins/${f}`)));
      state.checkins = Object.fromEntries(files.map((f, i) => [f.replace('.json', ''), lists[i].data || []]));
      offline = false;
      await outbox.saveState(state);
    } catch (e) {
      const cached = await outbox.loadState();
      if (!cached) throw e;
      Object.assign(state, cached); offline = true;
    }
    for (const op of await outbox.all()) applyLocal(op.path, [op.record]); // unsynced local edits stay visible
    queued = (await outbox.all()).length;
    emit();
    return state;
  }

  async function save(kind, record, opts = {}) {
    const path = pathFor(kind, opts);
    if (!path) throw new Error(`Unknown kind ${kind}`);
    const rec = stamp(kind === 'settings' ? { ...record, id: 'settings' } : kind === 'checkin' ? { ...record, eventId: opts.eventId } : record);
    applyLocal(path, [rec]);
    await outbox.add({ id: uuid(), path, record: rec });
    queued++; emit();
    const p = flush();
    if (opts.background) p.catch((e) => errorListeners.forEach((fn) => fn(e)));
    else await p;
    return rec;
  }

  // One flush at a time; a request during a flush triggers one more pass afterwards.
  function flush() {
    if (running) { again = true; return running; }
    running = (async () => {
      let r;
      do { again = false; r = await flushOnce(); } while (again);
      return r;
    })().finally(() => { running = null; });
    return running;
  }

  async function flushOnce() {
    const ops = await outbox.all();
    const byPath = new Map();
    for (const op of ops) byPath.set(op.path, [...(byPath.get(op.path) || []), op]);
    for (const [path, list] of byPath) {
      try {
        const merged = await upsertRecords(store, path, list.map((o) => o.record));
        await outbox.remove(list.map((o) => o.id));
        applyLocal(path, merged);
        offline = false;
      } catch (e) {
        if (e instanceof TypeError) { offline = true; break; } // network down; keep queued
        throw e;
      }
    }
    queued = (await outbox.all()).length;
    await outbox.saveState(state);
    emit();
    return { pending: queued };
  }

  // Re-read one event's check-ins and the people file (used by the live QR counter).
  async function refreshEvent(eventId) {
    const [c, p] = await Promise.all([store.readJson(checkinPath(eventId)), store.readJson(PEOPLE)]);
    state.checkins[eventId] = mergeRecords(c.data || [], state.checkins[eventId] || []);
    state.people = mergeRecords(p.data || [], state.people);
    emit();
  }

  return {
    state, load, save, flush, refreshEvent,
    pending: () => queued, isOffline: () => offline,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    onError: (fn) => { errorListeners.add(fn); return () => errorListeners.delete(fn); },
    activeEvents: () => state.events.filter((e) => !e.deleted).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    checkinsFor: (id) => (state.checkins[id] || []).filter((c) => !c.deleted),
    active: (kind) => (state[kind] || []).filter((r) => !r.deleted),
  };
}
