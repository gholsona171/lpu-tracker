import qrcode from '../../vendor/qrcode.mjs';
import { h, mount, fmtDate, fmtTime } from './dom.js';
import { checkinUrl } from '../config.js';

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

export function renderQr(root, { db, conn }, id) {
  const event = db.state.events.find((e) => e.id === id && !e.deleted);
  if (!event) { mount(root, h('div', { class: 'card' }, h('p', {}, 'Event not found.'))); return; }
  const url = checkinUrl(event);
  const box = h('div', { class: 'qr', 'data-url': url });
  box.innerHTML = qrSvg(url); // SVG markup generated locally from our own URL
  const count = h('strong', {}, String(db.checkinsFor(event.id).length));

  mount(root,
    h('div', { class: 'poster' },
      h('img', { src: 'icons/logo-160.png', alt: 'Love, Peace & Unity', class: 'logo', width: 80, height: 80 }),
      h('h1', {}, 'Check in here'),
      h('p', { class: 'event-line' }, event.name, h('br'), `${fmtDate(event.date)}, ${fmtTime(event.start)}`),
      box,
      h('p', {}, 'Point your phone camera at the code. Only your first name is needed.'),
      h('p', { class: 'screen-only count' }, count, ' checked in so far'),
      conn.mode === 'demo' && h('p', { class: 'screen-only hint' }, 'Demo mode: guests scanning this code check in to the real database, not the demo.'),
      h('div', { class: 'row screen-only' },
        h('button', { onclick: () => window.print() }, 'Print poster'),
        h('button', { onclick: () => navigator.clipboard?.writeText(url).then(() => alert('Link copied')) }, 'Copy link'),
        h('a', { class: 'button', href: `#/door/${encodeURIComponent(event.id)}` }, 'Door list'))));

  const off = db.onChange(() => { count.textContent = String(db.checkinsFor(event.id).length); });
  const timer = setInterval(() => { if (navigator.onLine) db.refreshEvent(event.id).catch(() => {}); }, 20000);
  return () => { off(); clearInterval(timer); };
}
