// Door check-in for volunteers. Works offline: every save goes through db (outbox first).
import { h, mount, field, toast, fmtDate } from './dom.js';
import { guestFields } from './guestform.js';
import { HELP, ROLES } from '../domain/options.js';
import { sanitizeGuest } from '../domain/validate.js';
import { findMatch, fillBlanks, norm } from '../domain/people.js';

const label = (list, v) => (list.find((x) => x.value === v) || {}).label || v;
const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)';

function helpChecks(selected = []) {
  return h('div', { class: 'chips' }, HELP.map((x) => h('label', { class: 'chip' },
    h('input', { type: 'checkbox', name: 'help', value: x.value, checked: selected.includes(x.value) }), h('span', {}, x.label))));
}

function roleChips(selected = 'attendee') {
  return h('div', { class: 'chips', role: 'radiogroup' }, ROLES.map((x) => h('label', { class: 'chip' },
    h('input', { type: 'radio', name: 'role', value: x.value, checked: x.value === selected }), h('span', {}, x.label))));
}

const checked = (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);

export async function checkInPerson(db, event, { person, guestInput, visit = {}, help = [] }) {
  let personId = person?.id;
  let v = { visit: { role: visit.role || 'attendee', householdSize: visit.householdSize || '' } };
  if (!person) {
    v = sanitizeGuest({ ...guestInput, ...visit }, { year: new Date().getFullYear() });
    if (!v.ok) throw new Error(v.errors.join(' '));
    const m = findMatch(db.state.people, v.guest);
    if (m) {
      personId = m.person.id;
      const filled = fillBlanks(m.person, v.guest);
      if (filled) await db.save('person', filled, { background: true });
    } else {
      personId = (await db.save('person', { ...v.guest, firstSeen: new Date().toISOString() }, { background: true })).id;
    }
  }
  const existing = db.checkinsFor(event.id).find((c) => c.personId === personId);
  if (existing) {
    const merged = [...new Set([...(existing.help || []), ...help])];
    await db.save('checkin', { ...existing, help: merged }, { eventId: event.id, background: true });
    return { personId, alreadyIn: true };
  }
  await db.save('checkin', { personId, role: v.visit.role, householdSize: v.visit.householdSize, help,
    source: 'volunteer', time: new Date().toISOString() }, { eventId: event.id, background: true });
  return { personId, alreadyIn: false };
}

export function renderDoor(root, { db }, id) {
  const event = db.state.events.find((e) => e.id === id && !e.deleted);
  if (!event) { mount(root, h('div', { class: 'card' }, h('p', {}, 'Event not found.'), h('a', { href: '#/events' }, 'Back'))); return; }

  const dialog = h('dialog', { class: 'sheet' });
  const search = h('input', { type: 'search', placeholder: 'Search returning guests by name', autocomplete: 'off', 'aria-label': 'Search guests' });
  const results = h('div', { class: 'results' });
  const list = h('div', { class: 'checked-list' });
  const countEl = h('strong');

  function openSheet(title, body, onSubmit) {
    const form = h('form', { method: 'dialog', onsubmit: async (ev) => {
      ev.preventDefault();
      try { await onSubmit(form); dialog.close(); } catch (e) { toast(e.message); }
    } }, h('h2', {}, title), body,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Check in'),
      h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel')));
    mount(dialog, form);
    dialog.showModal();
    return form;
  }

  function pickPerson(p) {
    const existing = db.checkinsFor(event.id).find((c) => c.personId === p.id);
    openSheet(fullName(p), [
      existing && h('p', { class: 'hint' }, 'Already checked in. You can add help given.'),
      field('Here as', roleChips(existing?.role)),
      field('Help given', helpChecks(existing?.help)),
      field('Household size', h('input', { name: 'householdSize', type: 'number', min: 1, max: 20, value: existing?.householdSize || p.householdSize || '' })),
    ], async (form) => {
      await checkInPerson(db, event, { person: p, help: checked(form, 'help'),
        visit: { role: checked(form, 'role')[0], householdSize: Number(form.householdSize.value) || '' } });
      toast(`${p.firstName} checked in`);
      search.value = ''; drawResults();
    });
  }

  function newGuest() {
    const g = guestFields();
    const form = openSheet('New guest', [g.el, field('Help given', helpChecks())], async (f) => {
      const r = await checkInPerson(db, event, { guestInput: g.read(f), help: checked(f, 'help') });
      toast(r.alreadyIn ? 'Matched someone already checked in' : 'Checked in');
      search.value = ''; drawResults();
    });
    if (search.value.trim()) form.firstName.value = search.value.trim().split(/\s+/)[0];
    g.focus();
  }

  function drawResults() {
    const q = norm(search.value);
    if (!q) { mount(results); return; }
    const inIds = new Set(db.checkinsFor(event.id).map((c) => c.personId));
    const words = search.value.trim().split(/\s+/).map(norm).filter(Boolean);
    const hits = db.state.people.filter((p) => !p.deleted && words.every((w) =>
      norm(p.firstName).startsWith(w) || norm(p.lastName).startsWith(w))).slice(0, 20);
    mount(results,
      hits.map((p) => h('button', { class: 'list-row', type: 'button', onclick: () => pickPerson(p) },
        h('span', {}, fullName(p), p.zip && h('small', {}, p.zip)),
        inIds.has(p.id) && h('span', { class: 'pill ok' }, 'In'))),
      h('button', { class: 'list-row add', type: 'button', onclick: newGuest }, `+ New guest${search.value.trim() ? ` "${search.value.trim()}"` : ''}`));
  }

  function drawList() {
    const rows = db.checkinsFor(event.id).slice().sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    const people = new Map(db.state.people.map((p) => [p.id, p]));
    countEl.textContent = String(rows.length);
    mount(list, rows.length === 0 ? h('p', { class: 'hint' }, 'No one checked in yet.') : rows.map((c) => {
      const p = people.get(c.personId) || { id: c.personId, firstName: '(syncing)' };
      return h('button', { class: 'list-row', type: 'button', onclick: () => pickPerson(p) },
        h('span', {}, fullName(p), h('small', {}, [label(ROLES, c.role), c.source === 'self' ? 'self check-in' : ''].filter(Boolean).join(' · '))),
        h('span', { class: 'row' }, (c.help || []).map((x) => h('span', { class: 'pill' }, label(HELP, x)))));
    }));
  }

  search.addEventListener('input', drawResults);
  mount(root,
    h('div', { class: 'head' },
      h('div', {}, h('h1', {}, event.name), h('p', { class: 'hint' }, fmtDate(event.date))),
      h('a', { class: 'button', href: `#/qr/${encodeURIComponent(event.id)}` }, 'QR')),
    h('div', { class: 'card sticky' }, search, results,
      !search.value && h('button', { class: 'primary wide', type: 'button', onclick: newGuest }, 'New guest')),
    h('h2', { class: 'section' }, countEl, ' checked in'),
    list, dialog);
  drawList();

  const off = db.onChange(() => { drawList(); if (search.value) drawResults(); });
  const timer = setInterval(() => { if (navigator.onLine) db.refreshEvent(event.id).catch(() => {}); }, 30000);
  return () => { off(); clearInterval(timer); };
}
