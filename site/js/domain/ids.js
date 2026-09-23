export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomKey(len = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHA[b % ALPHA.length]).join('');
}

// Fill standard record fields. Keeps id/createdAt, always refreshes updatedAt.
export function stamp(rec) {
  const t = nowIso();
  return { ...rec, id: rec.id || uuid(), createdAt: rec.createdAt || t, updatedAt: t, deleted: !!rec.deleted };
}
