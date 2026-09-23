import { h, mount, field, toast, select } from './dom.js';
import { sanitizeDonation, DONATION_METHODS } from '../domain/validate-books.js';
import { donationFlags, fmtMoney, toCents } from '../domain/books.js';
import { todayLocal } from '../domain/time.js';
import { METHOD_LABEL } from './books.js';
import { donationReceipt } from '../domain/forms.js';
import { contextFor } from './filings.js';
import { fiscalYearFor } from '../domain/fiscal.js';

const opts = (list) => list.map((v) => ({ value: v, label: METHOD_LABEL[v] || v }));

export function eventOptions(db, selected) {
  const recent = db.activeEvents().slice(-12).reverse();
  return h('select', { name: 'eventId' }, h('option', { value: '' }, 'Not tied to an event'),
    recent.map((e) => h('option', { value: e.id, selected: e.id === selected }, `${e.name} (${e.date})`)));
}

export function renderDonationForm(root, { db }, id) {
  const existing = id !== 'new' ? db.state.events && db.active('donations').find((d) => d.id === id) : null;
  if (id !== 'new' && !existing) { mount(root, h('p', {}, 'Donation not found.')); return; }
  const d = existing || { date: todayLocal(), kind: 'cash', method: 'zeffy' };
  const f = {
    date: h('input', { name: 'date', type: 'date', value: d.date, required: true }),
    kind: h('select', { name: 'kind' }, h('option', { value: 'cash', selected: d.kind === 'cash' }, 'Money'), h('option', { value: 'in_kind', selected: d.kind === 'in_kind' }, 'Goods (canned food, supplies)')),
    donorName: h('input', { name: 'donorName', value: d.donorName || '', maxlength: 80, autocapitalize: 'words' }),
    anonymous: h('input', { type: 'checkbox', name: 'anonymous', checked: !!d.anonymous }),
    donorEmail: h('input', { name: 'donorEmail', type: 'email', value: d.donorEmail || '' }),
    donorAddress: h('input', { name: 'donorAddress', value: d.donorAddress || '' }),
    amount: h('input', { name: 'amount', inputmode: 'decimal', value: existing ? (d.amountCents / 100).toFixed(2) : '', placeholder: '0.00', required: true }),
    description: h('input', { name: 'description', value: d.description || '', placeholder: 'e.g. 12 cans of vegetables' }),
    method: select('method', opts(DONATION_METHODS), d.method, 'How was it given?'),
    goods: h('input', { name: 'goods', inputmode: 'decimal', value: d.goodsCents ? (d.goodsCents / 100).toFixed(2) : '', placeholder: '0.00' }),
    goodsDescription: h('input', { name: 'goodsDescription', value: d.goodsDescription || '', placeholder: 'e.g. event ticket, t-shirt' }),
    eventId: eventOptions(db, d.eventId),
  };
  const flags = h('p', { class: 'hint flags', 'aria-live': 'polite' });
  const msg = h('p', { class: 'error-text', role: 'alert' });
  const inKindOnly = h('div', {}, field('What was given', f.description, 'Describe the items and quantities, e.g. "18 loaves of bread, 40 lbs produce". The amount is your own estimate for the books; it is never printed on the receipt.'));
  const receiptBox = h('div');
  function showReceipt() {
    const ctx = contextFor(db, fiscalYearFor(existing.date, db.state.settings.fyEnd || '12-31'));
    const r = donationReceipt(ctx, existing);
    mount(receiptBox, h('div', { class: 'row screen-only' }, h('button', { onclick: () => window.print() }, 'Print or save as PDF')),
      h('article', { class: 'report-page sheet' }, h('header', {}, h('img', { src: 'icons/logo-160.png', alt: '', width: 56, height: 56 }), h('h1', {}, r.title)),
        h('div', { class: 'letter' }, h('p', {}, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })),
          h('p', {}, r.donorName, h('br'), r.donorAddress || r.donorEmail || ''), r.paragraphs.map((p) => h('p', { style: 'white-space: pre-line' }, p)))));
    receiptBox.scrollIntoView({ behavior: 'smooth' });
  }
  const cashOnly = h('div', {}, field('How', f.method));

  function updateFlags() {
    inKindOnly.hidden = f.kind.value !== 'in_kind'; cashOnly.hidden = f.kind.value === 'in_kind';
    const amountCents = toCents(f.amount.value) ?? 0, goodsCents = toCents(f.goods.value) ?? 0;
    const fl = donationFlags({ amountCents, goodsCents });
    const parts = [];
    if (fl.ackRequired) parts.push('A written acknowledgment is required for gifts of $250 or more.');
    if (fl.qpqDisclosure) parts.push(`The donor got something worth ${fmtMoney(goodsCents)} back on a payment over $75, so the receipt must state that only ${fmtMoney(fl.deductibleCents)} is deductible.`);
    flags.textContent = parts.join(' ');
  }
  for (const el of [f.kind, f.amount, f.goods]) el.addEventListener('input', updateFlags);
  updateFlags();

  async function save(ev) {
    ev.preventDefault();
    const v = sanitizeDonation({ ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value])) });
    if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
    await db.save('donation', { ...(existing || {}), ...v.record }, { background: true });
    toast('Donation saved'); location.hash = '#/books';
  }
  async function remove() {
    if (!confirm('Delete this donation?')) return;
    await db.save('donation', { ...existing, deleted: true }, { background: true });
    location.hash = '#/books';
  }

  mount(root, h('h1', {}, existing ? 'Edit donation' : 'Add a donation'),
    h('form', { class: 'card', onsubmit: save },
      field('Date', f.date), field('Type', f.kind),
      field('Donor', f.donorName), h('label', { class: 'check' }, f.anonymous, 'Anonymous or unknown donor'),
      field('Amount ($)', f.amount), inKindOnly, cashOnly,
      h('details', { class: 'more' }, h('summary', {}, 'Receipt details (optional)'),
        field('Donor email', f.donorEmail), field('Donor mailing address', f.donorAddress),
        field('Did the donor get anything in return? Value ($)', f.goods, 'Leave blank if nothing.'), field('What they got', f.goodsDescription),
        field('Event', f.eventId)),
      flags, msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save'), h('a', { class: 'button', href: '#/books' }, 'Cancel'),
        existing && h('button', { type: 'button', onclick: showReceipt }, 'Print receipt'),
        existing && h('button', { type: 'button', class: 'danger', onclick: remove }, 'Delete'))),
    receiptBox);
}
