import { stamp, uuid } from '../domain/ids.js';
import { mergeRecords } from '../domain/merge.js';
import { upsertRecords } from './records.js';
import { checkinPath, PEOPLE } from '../domain/checkin.js';

export const EVENTS = 'data/events.json';
export const SETTINGS = 'data/settings.json';
export const DEFAULT_SETTINGS = { id: 'settings', orgName: 'Love, Peace & Unity', ein: '99-0471961', fyEnd: '12-31',
  address: '', officer: '', website: 'https://lovepeaceunity.org', hasEmployees: false,
  targets: { uniquePeople: 300, foodBags: 200, targetZips: '48216,48209,48210' } };

const pathFor = (kind, opts = {}) => ({ event: EVENTS, person: PEOPLE, settings: SETTINGS,
  checkin: opts.eventId && checkinPath(opts.eventId) })[kind];

export function createDb({ store, outbox }) {
  const state = { events: [], people: [], checkins: {}, settings: { ...DEFAULT_SETTINGS } };
  let queued = 0; let offline = false; const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  function applyLocal(path, records) {
    if (path === EVENTS) state.events = mergeRecords(state.events, records);
    else if (path === PEOPLE) state.people = mergeRecords(state.people, records);
    else if (path === SETTINGS) state.settings = { ...DEFAULT_SETTINGS, ...records.at(-1) };
    else { const id = path.split('/').pop().replace('.json', ''); state.checkins[id] = mergeRecords(state.checkins[id], records); }
  }

  async function load() {
    try {
      const [ev, pe, se, files] = await Promise.all([store.readJson(EVENTS), store.readJson(PEOPLE),
        store.readJson(SETTINGS), store.listDir('data/checkins')]);
      state.events = ev.data || []; state.people = pe.data || [];
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
    await flush();
    return rec;
  }

  async function flush() {
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

  return {
    state, load, save, flush,
    pending: () => queued, isOffline: () => offline,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    activeEvents: () => state.events.filter((e) => !e.deleted).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    checkinsFor: (id) => (state.checkins[id] || []).filter((c) => !c.deleted),
  };
}
