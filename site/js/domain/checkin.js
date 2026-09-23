import { findMatch, fillBlanks } from './people.js';
import { stamp } from './ids.js';

export const PEOPLE = 'data/people.json';
export const checkinPath = (eventId) => `data/checkins/${eventId}.json`;
export const MAX_PER_EVENT = 500;

export async function recordCheckin(store, { event, guest, visit, source, help = [], now = new Date() }) {
  let personId = null, returning = false, confidence = null;
  await store.update(PEOPLE, (cur) => {
    const people = cur || [];
    const m = findMatch(people, guest);
    if (m) {
      personId = m.person.id; returning = true; confidence = m.confidence;
      const filled = fillBlanks(m.person, guest);
      return filled ? people.map((p) => (p.id === filled.id ? stamp(filled) : p)) : null;
    }
    const p = stamp({ ...guest, firstSeen: now.toISOString() });
    personId = p.id; returning = false; confidence = null;
    return [...people, p];
  }, `check-in: person (${source})`);

  let alreadyIn = false;
  await store.update(checkinPath(event.id), (cur) => {
    const list = cur || [];
    const active = list.filter((c) => !c.deleted);
    if (active.some((c) => c.personId === personId)) { alreadyIn = true; return null; }
    alreadyIn = false;
    if (active.length >= MAX_PER_EVENT) throw new Error('Check-in is full for this event.');
    return [...list, stamp({ eventId: event.id, personId, ...visit, help, source, time: now.toISOString() })];
  }, `check-in: ${event.id} (${source})`);

  return { personId, returning, confidence, alreadyIn };
}
