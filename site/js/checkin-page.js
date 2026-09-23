// Public self check-in page (QR target). Talks only to the check-in Worker.
import { WORKER_URL } from './config.js';
import { h, mount, fmtDate, fmtTime } from './ui/dom.js';
import { guestFields } from './ui/guestform.js';

const root = document.getElementById('main');
const params = new URLSearchParams(location.search);
const e = params.get('e');
const k = params.get('k');

async function api(path, init) {
  let r;
  try { r = await fetch(WORKER_URL + path, init); }
  catch { throw new Error('No connection. Please try again, or check in with a volunteer at the door.'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'Something went wrong. Please try again.'), { status: r.status });
  return body;
}

const card = (...kids) => h('div', { class: 'card center' }, ...kids);
const when = (ev) => `${fmtDate(ev.date)}, ${fmtTime(ev.start)} to ${fmtTime(ev.end)}`;

function showMessage(title, text, retry) {
  mount(root, card(h('h1', {}, title), text && h('p', {}, text), retry && h('button', { class: 'primary', onclick: retry }, 'Try again')));
}

function showForm(ev) {
  const g = guestFields();
  const err = h('p', { class: 'error-text', role: 'alert' });
  const submit = h('button', { class: 'primary wide', type: 'submit' }, "That's all, check me in");
  const moreBtn = h('button', { class: 'wide', type: 'button', onclick: () => { g.more.open = true; } }, 'Answer a few more (optional)');
  g.more.addEventListener('toggle', () => {
    submit.textContent = g.more.open ? 'Check me in' : "That's all, check me in";
    moreBtn.hidden = g.more.open;
  });

  const form = h('form', { class: 'card', onsubmit: async (x) => {
    x.preventDefault();
    const guest = g.read(form);
    if (!guest.firstName.trim()) { err.textContent = 'Please enter your first name.'; g.focus(); return; }
    submit.disabled = true; submit.textContent = 'Checking you in…'; err.textContent = '';
    try {
      const r = await api('/checkin', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ e, k, guest }) });
      const name = guest.firstName.trim();
      showMessage(r.alreadyIn ? 'You were already checked in' : "You're checked in",
        r.alreadyIn ? `See you inside, ${name}.` : r.returning ? `Welcome back, ${name}. Enjoy ${r.eventName}.` : `Thanks for coming, ${name}. Enjoy ${r.eventName}.`);
    } catch (ex) {
      err.textContent = ex.message;
      submit.disabled = false; submit.textContent = g.more.open ? 'Check me in' : "That's all, check me in";
    }
  } }, g.el, err, submit, moreBtn);

  mount(root,
    h('header', { class: 'public-head' },
      h('img', { src: 'icons/logo-160.png', alt: 'Love, Peace & Unity', width: 72, height: 72 }),
      h('h1', {}, ev.name), h('p', { class: 'hint' }, when(ev))),
    form,
    h('p', { class: 'hint center' }, 'Love, Peace & Unity uses this only to count who we reach. We never sell or share it.'));
  g.focus();
}

async function boot() {
  if (!e || !k) { showMessage('This link is not complete', 'Please scan the QR code at the door again.'); return; }
  mount(root, card(h('p', {}, 'Loading…')));
  try {
    const ev = await api(`/event?e=${encodeURIComponent(e)}&k=${encodeURIComponent(k)}`);
    if (!ev.open) { showMessage(ev.name, `Check-in opens an hour before the event. ${when(ev)}.`); return; }
    showForm(ev);
  } catch (ex) {
    showMessage(ex.status === 404 ? 'This check-in link is not valid' : 'Could not load', ex.message, ex.status === 404 ? null : boot);
  }
}

boot();
