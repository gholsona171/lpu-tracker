import { ROLES, GENDERS, RACES, VETERAN, values } from './options.js';

const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const pick = (v, list) => (values(list).includes(v) ? v : '');

export function sanitizeGuest(input = {}, { year }) {
  const firstName = str(input.firstName, 40);
  const zip = /^\d{5}$/.test(str(input.zip, 5)) ? str(input.zip, 5) : '';
  const by = Number(input.birthYear);
  const birthYear = Number.isInteger(by) && by >= year - 110 && by <= year ? by : '';
  const hs = Number(input.householdSize);
  const race = Array.isArray(input.race) ? [...new Set(input.race.filter((r) => values(RACES).includes(r)))] : [];
  const guest = {
    firstName, lastName: str(input.lastName, 40), zip, birthYear,
    gender: pick(input.gender, GENDERS), race, veteran: pick(input.veteran, VETERAN),
  };
  const visit = { role: pick(input.role, ROLES) || 'attendee',
    householdSize: Number.isInteger(hs) && hs >= 1 && hs <= 20 ? hs : '' };
  const errors = firstName ? [] : ['First name is required.'];
  return { ok: errors.length === 0, errors, guest, visit };
}

export function sanitizeEvent(input = {}) {
  const event = { name: str(input.name, 80), date: str(input.date, 10), start: str(input.start, 5),
    end: str(input.end, 5), location: str(input.location, 120), program: str(input.program, 40) || 'open_mic' };
  const errors = [];
  if (!event.name) errors.push('Name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) errors.push('Date must be YYYY-MM-DD.');
  if (!/^\d{2}:\d{2}$/.test(event.start) || !/^\d{2}:\d{2}$/.test(event.end)) errors.push('Times must be HH:MM.');
  return { ok: errors.length === 0, errors, event };
}
