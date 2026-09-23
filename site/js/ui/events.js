import { h, mount, field, toast, fmtDate, fmtTime } from './dom.js';
import { sanitizeEvent } from '../domain/validate.js';
import { randomKey } from '../domain/ids.js';
import { todayLocal } from '../domain/time.js';

export function renderEvents(root, { db }) {
  const draw = () => {
    const events = db.activeEvents();
    const today = todayLocal();
    const upcoming = events.filter((e) => e.date >= today);
    const past = events.filter((e) => e.date < today).reverse();
    const row = (e) => h('div', { class: 'list-row' },
      h('a', { href: `#/door/${encodeURIComponent(e.id)}` }, e.name,
        h('small', {}, `${fmtDate(e.date)}, ${fmtTime(e.start)}`)),
      h('span', { class: 'row' },
        h('span', { class: 'pill', title: 'Checked in' }, String(db.checkinsFor(e.id).length)),
        h('a', { class: 'button small', href: `#/event/${encodeURIComponent(e.id)}` }, 'Edit')));
    mount(root,
      h('div', { class: 'head' }, h('h1', {}, 'Events'), h('a', { class: 'button primary', href: '#/event/new' }, 'New event')),
      h('h2', { class: 'section' }, 'Upcoming'),
      upcoming.length ? upcoming.map(row) : h('p', { class: 'hint' }, 'Nothing scheduled.'),
      past.length > 0 && h('h2', { class: 'section' }, 'Past'),
      past.map(row));
  };
  draw();
  return db.onChange(draw);
}

export function renderEventEditor(root, { db }, id) {
  const existing = id && id !== 'new' ? db.state.events.find((e) => e.id === id) : null;
  if (id && id !== 'new' && !existing) {
    mount(root, h('div', { class: 'card' }, h('p', {}, 'That event was not found.'), h('a', { href: '#/events' }, 'Back to events')));
    return;
  }
  const e = existing || { name: 'Open Mic + Food Drive', date: todayLocal(), start: '17:00', end: '20:00',
    location: '27th Letter Books, 3546 Michigan Ave, Detroit' };
  const msg = h('p', { class: 'error-text', role: 'alert' });
  const inputs = {
    name: h('input', { name: 'name', value: e.name, maxlength: 80, required: true }),
    date: h('input', { name: 'date', type: 'date', value: e.date, required: true }),
    start: h('input', { name: 'start', type: 'time', value: e.start, required: true }),
    end: h('input', { name: 'end', type: 'time', value: e.end, required: true }),
    location: h('input', { name: 'location', value: e.location || '', maxlength: 120 }),
  };

  async function save(ev) {
    ev.preventDefault();
    const v = sanitizeEvent(Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])));
    if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
    const rec = { ...(existing || { eventKey: randomKey(12) }), ...v.event };
    await db.save('event', rec, { background: true });
    toast(existing ? 'Event updated' : 'Event created');
    location.hash = '#/events';
  }

  async function remove() {
    if (!confirm(`Delete "${existing.name}"? Check-ins stay in the records.`)) return;
    await db.save('event', { ...existing, deleted: true }, { background: true });
    toast('Event deleted');
    location.hash = '#/events';
  }

  mount(root,
    h('h1', {}, existing ? 'Edit event' : 'New event'),
    h('form', { class: 'card', onsubmit: save },
      field('Name', inputs.name), field('Date', inputs.date),
      h('div', { class: 'two' }, field('Starts', inputs.start), field('Ends', inputs.end)),
      field('Location', inputs.location),
      msg,
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'submit' }, 'Save'),
        h('a', { class: 'button', href: '#/events' }, 'Cancel'),
        existing && h('button', { type: 'button', class: 'danger', onclick: remove }, 'Delete'))));
}
