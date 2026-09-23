export function mergeRecords(base = [], incoming = []) {
  const byId = new Map(base.map((r) => [r.id, r]));
  for (const r of incoming) {
    const cur = byId.get(r.id);
    if (!cur || (r.updatedAt || '') >= (cur.updatedAt || '')) byId.set(r.id, r);
  }
  return [...byId.values()];
}
