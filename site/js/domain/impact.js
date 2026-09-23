// Every number the Impact dashboard and the year-end report show, from the loaded state.
import { fiscalYearFor } from './fiscal.js';
import { ageRange } from './people.js';
import { ROLES, GENDERS, RACES, VETERAN } from './options.js';

const NOT_GIVEN = 'Not given';
const countBy = (items, keyFn) => {
  const m = new Map();
  for (const it of items) { const k = keyFn(it); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};
const labeled = (map, list) => [...list.map((o) => ({ label: o.label, count: map.get(o.value) || 0 })), { label: NOT_GIVEN, count: map.get('') || 0 }]
  .filter((x) => x.count > 0 || x.label === NOT_GIVEN);

export function impactSummary({ events = [], people = [], checkins = {}, expenses = [], payees = [], settings = {}, fy, fyEnd = '12-31' }) {
  const inFy = (date) => date && fiscalYearFor(date, fyEnd) === fy;
  const fyEvents = events.filter((e) => !e.deleted && inFy(e.date));
  const rows = fyEvents.flatMap((e) => (checkins[e.id] || []).filter((c) => !c.deleted).map((c) => ({ ...c, eventDate: e.date })));
  const byPerson = new Map(people.filter((p) => !p.deleted).map((p) => [p.id, p]));

  // Earliest check-in per person across all years decides first-timer status.
  const earliest = new Map();
  for (const e of events.filter((x) => !x.deleted)) for (const c of (checkins[e.id] || []).filter((x) => !x.deleted)) {
    if (!earliest.has(c.personId) || e.date < earliest.get(c.personId)) earliest.set(c.personId, e.date);
  }
  const uniqueIds = [...new Set(rows.map((c) => c.personId))];
  const firstTimers = uniqueIds.filter((id) => inFy(earliest.get(id))).length;

  const persons = uniqueIds.map((id) => byPerson.get(id) || {});
  const zipMap = countBy(persons, (p) => p.zip || '');
  const targetZips = String(settings.targets?.targetZips || '').split(',').map((s) => s.trim()).filter(Boolean);
  const inTarget = persons.filter((p) => targetZips.includes(p.zip)).length;
  const byZip = [...zipMap].map(([zip, count]) => ({ zip: zip || NOT_GIVEN, count })).sort((a, b) => b.count - a.count);

  const ageMap = countBy(persons, (p) => ageRange(p.birthYear, fy));
  const order = ['Under 13', '13–17', '18–24', '25–34', '35–44', '45–54', '55–64', '65+', NOT_GIVEN];
  const byAge = order.map((label) => ({ label, count: ageMap.get(label) || 0 })).filter((x) => x.count > 0 || x.label === NOT_GIVEN);

  const roleMap = countBy(rows, (c) => c.role || 'attendee');
  const byRole = ROLES.map((r) => ({ label: r.label, count: roleMap.get(r.value) || 0 }));
  const volunteers = new Set(rows.filter((c) => c.role === 'volunteer').map((c) => c.personId)).size;

  const help = { food_bag: 0, meal: 0, referral: 0 };
  const fedPersons = new Map();
  for (const c of rows) {
    for (const k of c.help || []) if (k in help) help[k]++;
    if ((c.help || []).some((k) => k === 'food_bag' || k === 'meal')) fedPersons.set(c.personId, Math.max(fedPersons.get(c.personId) || 0, Number(c.householdSize) || 1));
  }
  const householdsReached = fedPersons.size;
  const peopleInHouseholds = [...fedPersons.values()].reduce((a, b) => a + b, 0);

  const workers = new Set(payees.filter((p) => !p.deleted && p.communityWorker).map((p) => p.id));
  const work = { people: 0, payments: 0, cents: 0 };
  const paidIds = new Set();
  for (const e of expenses.filter((x) => !x.deleted && x.isPersonPayment && workers.has(x.payeeId) && inFy(x.date))) {
    work.payments++; work.cents += e.amountCents || 0; paidIds.add(e.payeeId);
  }
  work.people = paidIds.size;

  const t = settings.targets || {};
  const targets = [
    { key: 'uniquePeople', label: 'People reached', value: uniqueIds.length, target: Number(t.uniquePeople) || 0 },
    { key: 'foodBags', label: 'Food bags given', value: help.food_bag, target: Number(t.foodBags) || 0 },
  ];

  return {
    fy, eventsHeld: fyEvents.length, visits: rows.length, uniquePeople: uniqueIds.length, firstTimers, returning: uniqueIds.length - firstTimers,
    byZip, targetZipShare: uniqueIds.length ? inTarget / uniqueIds.length : 0, byAge, byRole, help, householdsReached, peopleInHouseholds, volunteers,
    gender: labeled(countBy(persons, (p) => p.gender || ''), GENDERS),
    race: labeled(countBy(persons.flatMap((p) => ((p.race || []).length ? p.race : [''])), (r) => r), RACES),
    veteran: labeled(countBy(persons, (p) => p.veteran || ''), VETERAN),
    work, targets,
    events: fyEvents.map((e) => ({ id: e.id, name: e.name, date: e.date, count: (checkins[e.id] || []).filter((c) => !c.deleted).length })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
