import { h, mount, fmtDate, fmtTime } from './dom.js';
import { isOpen, todayLocal } from '../domain/time.js';

export function eventCard(ev, count, { live = false } = {}) {
  return h('div', { class: 'card event' + (live ? ' live' : '') },
    live && h('span', { class: 'badge' }, 'Check-in open'),
    h('h2', {}, ev.name),
    h('p', {}, `${fmtDate(ev.date)}, ${fmtTime(ev.start)} to ${fmtTime(ev.end)}`),
    ev.location && h('p', { class: 'hint' }, ev.location),
    h('p', { class: 'count' }, h('strong', {}, String(count)), count === 1 ? ' person checked in' : ' people checked in'),
    h('div', { class: 'row' },
      h('a', { class: 'button primary', href: `#/door/${encodeURIComponent(ev.id)}` }, 'Door check-in'),
      h('a', { class: 'button', href: `#/qr/${encodeURIComponent(ev.id)}` }, 'Show QR')));
}

export function renderToday(root, { db }) {
  const draw = () => {
    const events = db.activeEvents();
    const today = todayLocal();
    const now = new Date();
    const live = events.find((e) => isOpen(e, now));
    const next = live || events.find((e) => e.date >= today);
    const past = events.filter((e) => e !== next && e.date < today).slice(-3).reverse();
    mount(root,
      h('h1', {}, 'Today'),
      next ? eventCard(next, db.checkinsFor(next.id).length, { live: !!live })
        : h('div', { class: 'card' }, h('p', {}, 'No upcoming events.'),
          h('a', { class: 'button primary', href: '#/event/new' }, 'Create an event')),
      past.length > 0 && h('h2', { class: 'section' }, 'Recent events'),
      past.map((e) => h('a', { class: 'list-row', href: `#/door/${encodeURIComponent(e.id)}` },
        h('span', {}, e.name, h('small', {}, fmtDate(e.date))),
        h('span', { class: 'pill' }, String(db.checkinsFor(e.id).length)))));
  };
  draw();
  return db.onChange(draw);
}
