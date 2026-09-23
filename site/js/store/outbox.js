export function memoryOutbox() {
  let ops = []; let cache = null;
  return {
    async add(op) { ops.push(op); }, async all() { return [...ops]; },
    async remove(ids) { ops = ops.filter((o) => !ids.includes(o.id)); },
    async saveState(s) { cache = structuredClone(s); }, async loadState() { return cache && structuredClone(cache); },
  };
}

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function openOutbox() {
  const open = indexedDB.open('lpu-tracker', 1);
  open.onupgradeneeded = () => { open.result.createObjectStore('outbox', { keyPath: 'id' }); open.result.createObjectStore('cache'); };
  const idb = await req(open);
  const tx = (name, mode = 'readonly') => idb.transaction(name, mode).objectStore(name);
  return {
    add: (op) => req(tx('outbox', 'readwrite').put(op)),
    all: () => req(tx('outbox').getAll()),
    async remove(ids) { const s = tx('outbox', 'readwrite'); await Promise.all(ids.map((id) => req(s.delete(id)))); },
    saveState: (s) => req(tx('cache', 'readwrite').put(s, 'state')),
    loadState: () => req(tx('cache').get('state')),
  };
}
