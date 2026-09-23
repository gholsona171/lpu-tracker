export const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const has = (v) => v !== undefined && v !== null && v !== '';
const conflict = (a, b) => has(a) && has(b) && String(a) !== String(b);
const same = (a, b) => has(a) && has(b) && String(a) === String(b);

export function findMatch(people, guest) {
  const f = norm(guest.firstName), l = norm(guest.lastName);
  if (!f) return null;
  let likely = null;
  for (const p of people) {
    if (p.deleted || norm(p.firstName) !== f || norm(p.lastName) !== l) continue;
    if (conflict(p.zip, guest.zip) || conflict(p.birthYear, guest.birthYear)) continue;
    if (same(p.zip, guest.zip) || same(p.birthYear, guest.birthYear)) return { person: p, confidence: 'strong' };
    likely ??= p;
  }
  return likely ? { person: likely, confidence: 'likely' } : null;
}

const FILLABLE = ['lastName', 'zip', 'birthYear', 'gender', 'veteran'];
export function fillBlanks(person, guest) {
  const next = { ...person };
  let changed = false;
  for (const k of FILLABLE) if (!has(person[k]) && has(guest[k])) { next[k] = guest[k]; changed = true; }
  if (!(person.race || []).length && (guest.race || []).length) { next.race = guest.race; changed = true; }
  return changed ? next : null;
}

const BANDS = [[12, 'Under 13'], [17, '13–17'], [24, '18–24'], [34, '25–34'], [44, '35–44'], [54, '45–54'], [64, '55–64']];
export function ageRange(birthYear, year) {
  if (!has(birthYear)) return 'Not given';
  const age = year - Number(birthYear);
  return (BANDS.find(([max]) => age <= max) || [0, '65+'])[1];
}
